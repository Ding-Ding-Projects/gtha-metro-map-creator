// gtfs-worker.js: reads a GTFS feed (ZIP) off the main thread. See docs/features/gtfs-import.md.
// Messages in:  { type: 'parse', file: File }
// Messages out: { type: 'progress', percent, phase } | { type: 'done', result } | { type: 'error', message }
'use strict';

const BANDS = { peak: [7 * 60, 9 * 60], midday: [10 * 60, 15 * 60], evening: [19 * 60, 22 * 60], weekend: [10 * 60, 18 * 60] };

// ---------- ZIP central directory ----------
async function readSlice(file, start, end) { return new Uint8Array(await file.slice(start, end).arrayBuffer()); }

async function zipEntries(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = await readSlice(file, file.size - tailLen, file.size);
  const dv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is not a ZIP archive.');
  const count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) throw new Error('ZIP64 archives are not supported.');
  const cd = await readSlice(file, cdOff, cdOff + cdSize);
  const cv = new DataView(cd.buffer), dec = new TextDecoder();
  const entries = new Map();
  let p = 0;
  while (p + 46 <= cd.length && cv.getUint32(p, true) === 0x02014b50) {
    const flags = cv.getUint16(p + 8, true), method = cv.getUint16(p + 10, true);
    const csize = cv.getUint32(p + 20, true), usize = cv.getUint32(p + 24, true);
    const nlen = cv.getUint16(p + 28, true), elen = cv.getUint16(p + 30, true), clen = cv.getUint16(p + 32, true);
    const off = cv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
    const base = name.split('/').pop().toLowerCase();
    if (base && !name.endsWith('/')) entries.set(base, { name, method, csize, usize, off, encrypted: !!(flags & 1) });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

/** A ReadableStream of decoded text for one ZIP entry. */
async function entryTextStream(file, e) {
  if (e.encrypted) throw new Error('Encrypted ZIP entries are not supported.');
  const lh = await readSlice(file, e.off, e.off + 30);
  const lv = new DataView(lh.buffer);
  if (lv.getUint32(0, true) !== 0x04034b50) throw new Error('Damaged ZIP entry: ' + e.name);
  const start = e.off + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
  let s = file.slice(start, start + e.csize).stream();
  if (e.method === 8) s = s.pipeThrough(new DecompressionStream('deflate-raw'));
  else if (e.method !== 0) throw new Error('Unsupported ZIP compression method ' + e.method + ' in ' + e.name);
  return s.pipeThrough(new TextDecoderStream());
}

// ---------- CSV ----------
function splitQuoted(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
const quoteOdd = (s) => { let n = 0; for (let i = s.indexOf('"'); i >= 0; i = s.indexOf('"', i + 1)) n++; return n & 1; };

/** Streams a CSV entry. onRow(row, col) gets raw fields and a name to index map. onBytes(n) reports decoded characters. */
async function streamCsv(file, e, onRow, onChars) {
  const reader = (await entryTextStream(file, e)).getReader();
  let carry = '', header = null, col = null, pending = null, first = true;
  const handle = (line) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (pending !== null) { line = pending + '\n' + line; pending = null; }
    if (quoteOdd(line)) { pending = line; return; }
    if (line === '') return;
    const f = line.indexOf('"') < 0 ? line.split(',') : splitQuoted(line);
    if (!header) { header = f.map((h) => h.trim().toLowerCase()); col = {}; header.forEach((h, i) => { col[h] = i; }); return; }
    onRow(f, col);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let chunk = value;
    if (first) { if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1); first = false; }
    if (onChars) onChars(chunk.length);
    chunk = carry + chunk;
    let a = 0, b;
    while ((b = chunk.indexOf('\n', a)) >= 0) { handle(chunk.slice(a, b)); a = b + 1; }
    carry = chunk.slice(a);
  }
  if (carry) handle(carry);
}

async function readTable(file, entries, name) {
  const e = entries.get(name); if (!e) return [];
  const rows = [];
  await streamCsv(file, e, (f, col) => { const o = {}; for (const k in col) o[k] = (f[col[k]] || '').trim(); rows.push(o); });
  return rows;
}

// ---------- helpers ----------
function timeToMin(s) {
  const m = /^\s*(\d+):(\d\d)/.exec(s); if (!m) return -1;
  return +m[1] * 60 + +m[2];
}
const dateText = (d) => d && d.length === 8 ? d : '';
const mode = (arr) => { const c = new Map(); let best = null, n = 0; for (const x of arr) { const k = (c.get(x) || 0) + 1; c.set(x, k); if (k > n) { n = k; best = x; } } return best; };

function typeClass(rt) {
  rt = +rt;
  if (rt === 0 || (rt >= 900 && rt < 1000)) return 'tram';
  if (rt === 1 || (rt >= 400 && rt < 500)) return 'subway';
  if (rt === 2 || (rt >= 100 && rt < 200)) return 'rail';
  if (rt === 3 || rt === 11 || (rt >= 700 && rt < 800)) return 'bus';
  return 'other';
}

function headway(times, band) {
  const [a, b] = BANDS[band]; let n = 0;
  for (const t of times) if (t >= a && t < b) n++;
  return n >= 2 ? Math.round((b - a) / n) : null;
}

const post = (percent, phase) => self.postMessage({ type: 'progress', percent: Math.round(percent), phase });

async function parse(file) {
  post(1, 'zip');
  const entries = await zipEntries(file);
  for (const need of ['routes.txt', 'trips.txt', 'stops.txt', 'stop_times.txt']) if (!entries.has(need)) throw new Error('The feed has no ' + need + '.');

  post(3, 'tables');
  const routesRaw = await readTable(file, entries, 'routes.txt');
  const agencies = {}; for (const a of await readTable(file, entries, 'agency.txt')) agencies[a.agency_id || ''] = a.agency_name;
  const stopsRaw = await readTable(file, entries, 'stops.txt');
  const calendar = await readTable(file, entries, 'calendar.txt');
  const exceptions = await readTable(file, entries, 'calendar_dates.txt');
  const feedInfo = (await readTable(file, entries, 'feed_info.txt'))[0] || {};

  // Representative days: the Tuesday to Thursday and the Saturday with the most services running, after
  // calendar.txt weekday flags, date ranges and calendar_dates.txt additions and removals are applied.
  let start = '', end = '';
  const ymd = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
  const key = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, '');
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const c of calendar) {
    if (c.start_date && (!start || c.start_date < start)) start = c.start_date;
    if (c.end_date && (!end || c.end_date > end)) end = c.end_date;
  }
  const added = new Map(), removed = new Map();
  for (const x of exceptions) {
    if (!x.date) continue;
    if (!start || x.date < start) start = x.date;
    if (!end || x.date > end) end = x.date;
    const m = x.exception_type === '1' ? added : x.exception_type === '2' ? removed : null;
    if (m) (m.get(x.date) || m.set(x.date, new Set()).get(x.date)).add(x.service_id);
  }
  const activeOn = (dt) => {
    const d = key(dt), set = new Set(), dow = DAYS[dt.getUTCDay()];
    for (const c of calendar) if (c[dow] === '1' && c.start_date <= d && d <= c.end_date) set.add(c.service_id);
    for (const s of removed.get(d) || []) set.delete(s);
    for (const s of added.get(d) || []) set.add(s);
    return set;
  };
  let weekdayServices = new Set(), saturdayServices = new Set();
  if (start && end) {
    for (let dt = ymd(start), n = 0; key(dt) <= end && n < 800; dt = new Date(dt.getTime() + 864e5), n++) {
      const dow = dt.getUTCDay();
      if (dow >= 2 && dow <= 4) { const s = activeOn(dt); if (s.size > weekdayServices.size) weekdayServices = s; }
      else if (dow === 6) { const s = activeOn(dt); if (s.size > saturdayServices.size) saturdayServices = s; }
    }
  }
  const hasSaturday = saturdayServices.size > 0;
  if (dateText(feedInfo.feed_start_date)) start = feedInfo.feed_start_date;
  if (dateText(feedInfo.feed_end_date)) end = feedInfo.feed_end_date;

  const stops = new Map();
  for (const s of stopsRaw) { const lat = parseFloat(s.stop_lat), lon = parseFloat(s.stop_lon); if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) stops.set(s.stop_id, { id: s.stop_id, name: s.stop_name || s.stop_id, lat, lon }); }

  const routes = new Map();
  for (const r of routesRaw) routes.set(r.route_id, { id: r.route_id, agency: agencies[r.agency_id || ''] || agencies[''] || '', short: r.route_short_name, long: r.route_long_name, routeType: +r.route_type || 0, color: /^[0-9a-fA-F]{6}$/.test(r.route_color) ? r.route_color.toUpperCase() : '', patterns: new Map() });

  // trip id -> [route, direction, day type] for trips on a representative service
  const tripInfo = new Map();
  for (const t of await readTable(file, entries, 'trips.txt')) {
    const wk = weekdayServices.has(t.service_id), sat = saturdayServices.has(t.service_id);
    if ((wk || sat) && routes.has(t.route_id)) tripInfo.set(t.trip_id, { route: t.route_id, dir: t.direction_id || '0', wk, sat });
  }

  // stop_times.txt is streamed: only the stop list and first departure of the current trip are held.
  post(8, 'stop_times');
  const stEntry = entries.get('stop_times.txt'), total = Math.max(1, stEntry.usize);
  let seen = 0, lastPct = 8, rows = 0;
  let curId = null, cur = null; const flushed = new Set();
  const flush = () => {
    if (!cur) return;
    const r = routes.get(cur.info.route);
    if (cur.seqs.length >= 2) {
      const order = cur.seqs.map((s, i) => i);
      let sorted = true; for (let i = 1; i < cur.seqs.length; i++) if (cur.seqs[i] < cur.seqs[i - 1]) { sorted = false; break; }
      if (!sorted) order.sort((a, b) => cur.seqs[a] - cur.seqs[b]);
      const ids = order.map((i) => cur.ids[i]);
      const key = cur.info.dir + '|' + ids.join(',');
      let pat = r.patterns.get(key);
      if (!pat) { pat = { dir: cur.info.dir, ids, wk: [], sat: [] }; r.patterns.set(key, pat); }
      const first = cur.deps[order[0]];
      if (first >= 0) { if (cur.info.wk) pat.wk.push(first); if (cur.info.sat) pat.sat.push(first); }
    }
    flushed.add(curId); cur = null;
  };
  let skippedOutOfOrder = 0;
  await streamCsv(file, stEntry, (f, col) => {
    rows++;
    const id = f[col.trip_id];
    if (id !== curId) {
      flush(); curId = id;
      const info = tripInfo.get(id);
      if (!info) { cur = null; return; }
      if (flushed.has(id)) { skippedOutOfOrder++; cur = null; return; }
      cur = { info, ids: [], seqs: [], deps: [] };
    }
    if (!cur) return;
    cur.ids.push(f[col.stop_id]); cur.seqs.push(+f[col.stop_sequence] || cur.seqs.length);
    cur.deps.push(timeToMin(f[col.departure_time] || f[col.arrival_time] || ''));
  }, (n) => {
    seen += n; const p = 8 + 82 * Math.min(1, seen / total);
    if (p - lastPct >= 2) { lastPct = p; post(p, 'stop_times'); }
  });
  flush();

  post(92, 'routes');
  const out = [];
  for (const r of routes.values()) {
    let best = null, bestN = 0;
    for (const pat of r.patterns.values()) { const n = pat.wk.length || pat.sat.length * 0.001; if (n > bestN) { bestN = n; best = pat; } }
    if (!best) continue;
    const dirTimes = (day) => { const all = []; for (const pat of r.patterns.values()) if (pat.dir === best.dir) all.push(...pat[day]); return all; };
    const wkT = dirTimes('wk'), satT = dirTimes('sat');
    const pts = best.ids.map((id) => stops.get(id)).filter(Boolean);
    if (pts.length < 2) continue;
    const name = r.long || r.short || r.id;
    out.push({
      id: r.id, agency: r.agency, short: r.short || '', long: r.long || '', routeType: r.routeType, type: typeClass(r.routeType), color: r.color,
      stops: pts, stopCount: pts.length, trips: wkT.length,
      peak: headway(wkT, 'peak'), midday: headway(wkT, 'midday'), evening: headway(wkT, 'evening'), weekend: hasSaturday ? headway(satT, 'weekend') : null,
      label: name
    });
  }
  const agencyNames = [...new Set(Object.values(agencies).filter(Boolean))];
  return { feed: { publisher: feedInfo.feed_publisher_name || agencyNames.join(', '), version: feedInfo.feed_version || '', start, end, hasSaturday, routeCount: out.length, rows, skippedOutOfOrder }, routes: out };
}

self.onmessage = async (ev) => {
  if (!ev.data || ev.data.type !== 'parse') return;
  try { const result = await parse(ev.data.file); post(100, 'done'); self.postMessage({ type: 'done', result }); }
  catch (err) { self.postMessage({ type: 'error', message: String(err && err.message || err) }); }
};
