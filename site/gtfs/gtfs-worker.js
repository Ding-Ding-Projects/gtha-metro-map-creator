// gtfs-worker.js: reads a whole GTFS feed (ZIP) off the main thread for the GTFS viewer.
// In:  { type: 'parse', file: Blob }
// Out: { type: 'progress', file, percent } | { type: 'file', file, rows } | { type: 'done', result } | { type: 'error', message }
// stop_times.txt and shapes.txt become typed arrays; every other .txt file becomes an array of row objects
// with interned strings; locations.geojson is parsed as JSON. Unknown files and columns are kept as they are.
'use strict';

async function readSlice(file, start, end) { return new Uint8Array(await file.slice(start, end).arrayBuffer()); }

async function zipEntries(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = await readSlice(file, file.size - tailLen, file.size);
  const dv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('notzip');
  const count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) throw new Error('zip64');
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

async function entryTextStream(file, e) {
  if (e.encrypted) throw new Error('encrypted');
  const lh = await readSlice(file, e.off, e.off + 30);
  const lv = new DataView(lh.buffer);
  if (lv.getUint32(0, true) !== 0x04034b50) throw new Error('damaged');
  const start = e.off + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
  let s = file.slice(start, start + e.csize).stream();
  if (e.method === 8) s = s.pipeThrough(new DecompressionStream('deflate-raw'));
  else if (e.method !== 0) throw new Error('method');
  return s.pipeThrough(new TextDecoderStream());
}

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

/** Streams a CSV entry. onRow(fields, colMap) gets raw fields. onHeader(headerArray) once. onChars(n) reports progress. */
async function streamCsv(file, e, onRow, onChars, onHeader) {
  const reader = (await entryTextStream(file, e)).getReader();
  let carry = '', header = null, col = null, pending = null, first = true;
  const handle = (line) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (pending !== null) { line = pending + '\n' + line; pending = null; }
    if (quoteOdd(line)) { pending = line; return; }
    if (line === '') return;
    const f = line.indexOf('"') < 0 ? line.split(',') : splitQuoted(line);
    if (!header) { header = f.map((h) => h.trim().toLowerCase()); col = {}; header.forEach((h, i) => { col[h] = i; }); if (onHeader) onHeader(header); return; }
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
  if (!header && onHeader) onHeader([]);
}

async function entryText(file, e) {
  const reader = (await entryTextStream(file, e)).getReader(); let s = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break; s += value; }
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// ---- helpers ----
const intern = new Map();
const I = (s) => { if (s.length > 40) return s; let v = intern.get(s); if (v === undefined) { if (intern.size < 400000) intern.set(s, s); v = s; } return v; };

class Grow {
  constructor(T, n) { this.T = T; this.a = new T(n || 1 << 16); this.n = 0; }
  push(v) { if (this.n === this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
  done() { return this.a.subarray(0, this.n); }
}

/** "H:MM:SS" to seconds; -1 when blank; -2 when malformed. */
function secs(s) {
  s = s.trim(); if (s === '') return -1;
  const m = /^(\d+):([0-5]?\d):([0-5]?\d)$/.exec(s);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : -2;
}

const post = (file, percent) => self.postMessage({ type: 'progress', file, percent: Math.round(percent) });

async function generic(file, entries, name, out, cols) {
  const e = entries.get(name); const rows = [];
  let seen = 0, last = -5; const total = Math.max(1, e.usize);
  await streamCsv(file, e, (f, col) => {
    const o = {};
    for (const k in col) { const v = f[col[k]]; o[k] = v === undefined ? '' : I(v.trim()); }
    rows.push(o);
  }, (n) => { seen += n; const p = 100 * Math.min(1, seen / total); if (p - last >= 4) { last = p; post(name, p); } }, (h) => { cols[name] = h; });
  out[name.replace(/\.txt$/, '')] = rows;
  self.postMessage({ type: 'file', file: name, rows: rows.length });
}

/** Orders rows by (group, seq). Returns null when the input already is ordered. */
function orderRows(n, group, seq, groups) {
  let ok = true; const seen = new Uint8Array(groups); let prev = -2;
  for (let i = 0; i < n && ok; i++) {
    const g = group[i];
    if (g < 0) { ok = false; break; }
    if (g !== prev) { if (seen[g]) { ok = false; break; } seen[g] = 1; prev = g; } else if (seq[i] < seq[i - 1]) ok = false;
  }
  if (ok) return null;
  const count = new Int32Array(groups + 1);
  for (let i = 0; i < n; i++) if (group[i] >= 0) count[group[i] + 1]++;
  for (let g = 0; g < groups; g++) count[g + 1] += count[g];
  const fill = count.slice(0, groups), order = new Int32Array(count[groups]);
  for (let i = 0; i < n; i++) if (group[i] >= 0) order[fill[group[i]]++] = i;
  for (let g = 0; g < groups; g++) {
    const a = count[g], b = count[g + 1]; let sorted = true;
    for (let i = a + 1; i < b; i++) if (seq[order[i]] < seq[order[i - 1]]) { sorted = false; break; }
    if (!sorted) { const part = Array.from(order.subarray(a, b)).sort((x, y) => seq[x] - seq[y] || x - y); order.set(part, a); }
  }
  return { order, count };
}
const take = (T, src, order) => { const o = new T(order.length); for (let i = 0; i < order.length; i++) o[i] = src[order[i]]; return o; };

async function readStopTimes(file, entries, tripIx, stopIx, nTrips) {
  const e = entries.get('stop_times.txt'); const total = Math.max(1, e.usize);
  const G = { trip: new Grow(Int32Array), stop: new Grow(Int32Array), seq: new Grow(Int32Array), arr: new Grow(Int32Array), dep: new Grow(Int32Array), flags: new Grow(Uint8Array), dist: new Grow(Float32Array) };
  const extras = []; let seen = 0, last = -5, badTimes = 0, orphanStops = 0, orphanTrips = 0, noSeq = 0; const orphanStopIds = new Set(), orphanTripIds = new Set();
  const X = ['stop_headsign', 'start_pickup_drop_off_window', 'end_pickup_drop_off_window', 'continuous_pickup', 'continuous_drop_off', 'pickup_booking_rule_id', 'drop_off_booking_rule_id', 'location_group_id', 'location_id', 'mean_duration_factor', 'mean_duration_offset', 'safe_duration_factor', 'safe_duration_offset'];
  let cols = []; const KNOWN = new Set(['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type', 'drop_off_type', 'shape_dist_traveled', 'timepoint']); let extraCols = [];
  await streamCsv(file, e, (f, col) => {
    const c = (k) => { const i = col[k]; return i === undefined || f[i] === undefined ? '' : f[i].trim(); };
    const tid = c('trip_id'), sid = c('stop_id');
    let ti = tripIx.get(tid); if (ti === undefined) { ti = -1; orphanTrips++; if (orphanTripIds.size < 50) orphanTripIds.add(tid); }
    let si = -1;
    if (sid !== '') { const v = stopIx.get(sid); if (v === undefined) { orphanStops++; if (orphanStopIds.size < 50) orphanStopIds.add(sid); } else si = v; }
    const row = G.trip.n;
    const sq = c('stop_sequence'); if (sq === '' || !Number.isFinite(+sq)) noSeq++;
    const a = secs(c('arrival_time')), d = secs(c('departure_time'));
    if (a === -2 || d === -2) badTimes++;
    const pu = +c('pickup_type') || 0, dr = +c('drop_off_type') || 0, tp = c('timepoint');
    G.trip.push(ti); G.stop.push(si); G.seq.push(sq === '' ? row : +sq); G.arr.push(a); G.dep.push(d);
    G.flags.push((pu & 3) | ((dr & 3) << 2) | ((tp === '' ? 0 : tp === '0' ? 1 : 2) << 4));
    const sd = c('shape_dist_traveled'); G.dist.push(sd === '' ? NaN : +sd);
    let ex = null;
    for (const k of extraCols) { const v = c(k); if (v !== '') { (ex || (ex = {}))[k] = I(v); } }
    if (sid !== '' && si < 0) (ex || (ex = {})).stop_id = sid;
    if (ex) extras.push([row, ex]);
  }, (n) => { seen += n; const p = 100 * Math.min(1, seen / total); if (p - last >= 2) { last = p; post('stop_times.txt', p); } }, (h) => { cols = h; extraCols = h.filter((k) => !KNOWN.has(k)); });
  let n = G.trip.n, trip = G.trip.done(), stop = G.stop.done(), seq = G.seq.done(), arr = G.arr.done(), dep = G.dep.done(), flags = G.flags.done(), dist = G.dist.done();
  let tripStart;
  const ord = orderRows(n, trip, seq, nTrips);
  if (ord) {
    const o = ord.order; stop = take(Int32Array, stop, o); arr = take(Int32Array, arr, o); dep = take(Int32Array, dep, o); flags = take(Uint8Array, flags, o); dist = take(Float32Array, dist, o);
    const inv = new Int32Array(n).fill(-1); for (let i = 0; i < o.length; i++) inv[o[i]] = i;
    for (const x of extras) x[0] = inv[x[0]];
    tripStart = ord.count; n = o.length;
  } else {
    tripStart = new Int32Array(nTrips + 1); for (let i = 0; i < n; i++) tripStart[trip[i] + 1]++;
    for (let g = 0; g < nTrips; g++) tripStart[g + 1] += tripStart[g];
  }
  return { n, tripStart, stop: stop.slice(0, n), arr: arr.slice(0, n), dep: dep.slice(0, n), flags: flags.slice(0, n), dist: dist.slice(0, n), extras: extras.filter((x) => x[0] >= 0), orphanTrips, orphanStops, orphanStopIds: [...orphanStopIds], orphanTripIds: [...orphanTripIds], badTimes, noSeq, cols };
}

async function readShapes(file, entries) {
  const e = entries.get('shapes.txt'); const total = Math.max(1, e.usize);
  const ix = new Map(), ids = []; const gS = new Grow(Int32Array), gQ = new Grow(Int32Array), gLa = new Grow(Float64Array), gLo = new Grow(Float64Array), gD = new Grow(Float32Array);
  let seen = 0, last = -5, cols = [], bad = 0;
  await streamCsv(file, e, (f, col) => {
    const c = (k) => { const i = col[k]; return i === undefined || f[i] === undefined ? '' : f[i].trim(); };
    const id = c('shape_id'); let s = ix.get(id); if (s === undefined) { s = ids.length; ix.set(id, s); ids.push(I(id)); }
    const la = parseFloat(c('shape_pt_lat')), lo = parseFloat(c('shape_pt_lon'));
    if (!Number.isFinite(la) || !Number.isFinite(lo)) bad++;
    gS.push(s); gQ.push(+c('shape_pt_sequence') || 0); gLa.push(la); gLo.push(lo); const d = c('shape_dist_traveled'); gD.push(d === '' ? NaN : +d);
  }, (n) => { seen += n; const p = 100 * Math.min(1, seen / total); if (p - last >= 3) { last = p; post('shapes.txt', p); } }, (h) => { cols = h; });
  const n = gS.n; let sh = gS.done(), q = gQ.done(), la = gLa.done(), lo = gLo.done(), d = gD.done();
  const ord = orderRows(n, sh, q, ids.length); let start;
  if (ord) { const o = ord.order; la = take(Float64Array, la, o); lo = take(Float64Array, lo, o); d = take(Float32Array, d, o); q = take(Int32Array, q, o); start = ord.count; }
  else { start = new Int32Array(ids.length + 1); for (let i = 0; i < n; i++) start[sh[i] + 1]++; for (let g = 0; g < ids.length; g++) start[g + 1] += start[g]; }
  const m = start[ids.length];
  return { ids, start, lat: la.slice(0, m), lon: lo.slice(0, m), dist: d.slice(0, m), seq: q.slice(0, m), badPoints: bad, cols };
}

async function parse(file) {
  post('zip', 1);
  const entries = await zipEntries(file);
  const out = {}, cols = {}, files = {}; const t0 = Date.now();
  for (const [name, e] of entries) files[name] = { bytes: e.usize, rows: 0, name: e.name };
  self.postMessage({ type: 'plan', files: [...entries].map(([name, e]) => ({ name, bytes: e.usize })) });
  const special = new Set(['stop_times.txt', 'shapes.txt']);
  const txt = [...entries.keys()].filter((n) => n.endsWith('.txt') && !special.has(n));
  txt.sort((a, b) => (b === 'trips.txt') - (a === 'trips.txt') || (b === 'stops.txt') - (a === 'stops.txt'));
  const skipped = [];
  for (const name of txt) { try { await generic(file, entries, name, out, cols); } catch (err) { if (String(err.message) !== 'encrypted') throw err; skipped.push(name); } }
  const tripIx = new Map(); (out.trips || []).forEach((t, i) => { if (!tripIx.has(t.trip_id)) tripIx.set(t.trip_id, i); });
  const stopIx = new Map(); (out.stops || []).forEach((s, i) => { if (!stopIx.has(s.stop_id)) stopIx.set(s.stop_id, i); });
  let stopTimes = null, shapes = null, geo = null, geoName = '';
  const buffers = [];
  if (entries.has('stop_times.txt')) {
    stopTimes = await readStopTimes(file, entries, tripIx, stopIx, (out.trips || []).length);
    cols['stop_times.txt'] = stopTimes.cols; self.postMessage({ type: 'file', file: 'stop_times.txt', rows: stopTimes.n });
    for (const k of ['tripStart', 'stop', 'arr', 'dep', 'flags', 'dist']) buffers.push(stopTimes[k].buffer);
  }
  if (entries.has('shapes.txt')) {
    shapes = await readShapes(file, entries); cols['shapes.txt'] = shapes.cols; self.postMessage({ type: 'file', file: 'shapes.txt', rows: shapes.lat.length });
    for (const k of ['start', 'lat', 'lon', 'dist', 'seq']) buffers.push(shapes[k].buffer);
  }
  for (const [name, e] of entries) if (/\.geojson$/.test(name) || name === 'locations.json') {
    try { geo = JSON.parse(await entryText(file, e)); geoName = name; files[name].rows = (geo.features || []).length; post(name, 100); } catch { geo = null; }
    break;
  }
  for (const name of txt) files[name].rows = (out[name.replace(/\.txt$/, '')] || []).length;
  if (stopTimes) files['stop_times.txt'].rows = stopTimes.n;
  if (shapes) files['shapes.txt'].rows = shapes.lat.length;
  return { result: { tables: out, cols, files, stopTimes, shapes, geo, geoName, skipped, ms: Date.now() - t0 }, buffers };
}

self.onmessage = async (ev) => {
  if (!ev.data || ev.data.type !== 'parse') return;
  try { const { result, buffers } = await parse(ev.data.file); self.postMessage({ type: 'done', result }, buffers); }
  catch (err) { self.postMessage({ type: 'error', message: String(err && err.message || err) }); }
};
