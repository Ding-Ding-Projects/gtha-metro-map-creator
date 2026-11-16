// mod-gtfs-export.js: see docs/features/gtfs-export.md. Registers hooks on window.GMMCX before app.js loads.
// Builds a GTFS feed (ZIP) from the current map and offers it as a download.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  X.ready = X.ready || [];

  window.I18N && window.I18N.add({
    gtfsExport: 'Export GTFS feed', gtfsExportDone: 'GTFS feed saved: {r} routes, {s} stops', gtfsExportEmpty: 'There are no visible routes to export',
    gtfsExportFailed: 'Could not build the GTFS feed'
  }, {
    gtfsExport: '匯出 GTFS 資料', gtfsExportDone: '已儲存 GTFS 資料：{r} 條路線，{s} 個站', gtfsExportEmpty: '冇可見路線可以匯出',
    gtfsExportFailed: '整唔到 GTFS 資料'
  });

  const SITE_URL = 'https://ding-ding-projects.github.io/gtha-metro-map-creator/';
  const TIMEZONE = 'America/Toronto';
  // Same speeds and dwell as the journey planner (docs/features/journey.md), in km/h and seconds.
  const SPEED = { solid: 32, rail: 55, brt: 24, bus: 18, express: 32 * 1.3, superExpress: 32 * 1.6, dashed: 30 };
  const DWELL_S = 24;
  const ROUTE_TYPE = { solid: 1, dashed: 1, express: 1, superExpress: 1, rail: 2, brt: 3, bus: 3 };
  const DEFAULT_HEADWAY = 10;
  const BANDS = [['peak', '07:00:00', '09:00:00', 'WEEKDAY'], ['midday', '10:00:00', '15:00:00', 'WEEKDAY'],
    ['evening', '19:00:00', '22:00:00', 'WEEKDAY'], ['weekend', '08:00:00', '20:00:00', 'WEEKEND']];

  let G = null;
  const tr = (k, v) => { let s = G ? G.t(k) : k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };

  // ---------- CSV ----------
  const cell = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (cols, rows) => cols.join(',') + '\r\n' + rows.map((r) => cols.map((c) => cell(r[c])).join(',') + '\r\n').join('');

  // ---------- geometry and time ----------
  function haversineKm(a, b) {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const pad = (n) => String(n).padStart(2, '0');
  const hms = (sec) => { sec = Math.round(sec); return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec / 60) % 60) + ':' + pad(sec % 60); };
  const ymd = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const slug = (s) => String(s || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
  const ink = (hex) => { const n = parseInt(hex, 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '000000' : 'FFFFFF'; };
  const colorOf = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); return m ? m[1].toUpperCase() : '1F5FBF'; };
  const pos = (v) => (v > 0 ? v : null);

  /** Headway minutes for each service band of a line, or null when the band has none. */
  function bandHeadways(line) {
    const f = line.freq || {};
    const mid = pos(f.midday) || pos(f.offpeak);
    const h = { peak: pos(f.peak), midday: mid, evening: pos(f.evening), weekend: pos(f.weekend) || mid };
    if (!h.peak && !h.midday && !h.evening && !h.weekend) return { peak: DEFAULT_HEADWAY, midday: DEFAULT_HEADWAY, evening: DEFAULT_HEADWAY, weekend: DEFAULT_HEADWAY };
    return h;
  }

  /** Real coordinates of a station, estimated from the schematic position when it has none. */
  function coords(st) {
    if (st.lat !== undefined && st.lon !== undefined) return { lat: +st.lat, lon: +st.lon };
    try { return G.gridToLatLon(G.fits().toGeo({ x: st.x, y: st.y })); } catch (e) { return { lat: 43.65, lon: -79.38 }; }
  }

  /** Station ids of a path in order, without bend points, unknown stations or immediate repeats. */
  function stationPath(map, path) {
    const out = [];
    for (const r of path || []) { if (typeof r !== 'string' || r[0] === '@' || !map.stations[r]) continue; if (out[out.length - 1] !== r) out.push(r); }
    return out;
  }

  // ---------- feed ----------
  function files() {
    const map = G.getMap(), now = new Date(), end = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate() - 1);
    const start = ymd(now), stop = ymd(end);
    const stopCoord = new Map(), used = new Set();
    const routes = [], trips = [], stopTimes = [], freqs = [], shapes = [];

    for (const l of map.lines) {
      if (l.visible === false) continue;
      const main = stationPath(map, l.path);
      if (main.length < 2) continue;
      const rid = String(l.id);
      const color = colorOf(l.color);
      routes.push({ route_id: rid, agency_id: 'GMMC', route_short_name: '', route_long_name: l.name || rid, route_type: ROUTE_TYPE[l.style] || 1,
        route_color: color, route_text_color: ink(color), route_desc: l.note || '' });
      const hw = bandHeadways(l);
      const skip = new Set(Array.isArray(l.skip) ? l.skip : []);
      const variants = [{ key: 'm', ids: main }];
      (l.branches || []).forEach((b, i) => { const ids = stationPath(map, b); if (ids.length >= 2) variants.push({ key: 'b' + i, ids }); });
      const dirs = l.oneWay ? [0] : [0, 1];
      const speed = SPEED[l.style] || SPEED.solid;

      for (const v of variants) {
        for (const dir of dirs) {
          const ids = dir ? v.ids.slice().reverse() : v.ids;
          for (const id of ids) { used.add(id); if (!stopCoord.has(id)) stopCoord.set(id, coords(map.stations[id])); }
          const shapeId = `${rid}_${v.key}_${dir}`;
          ids.forEach((id, i) => shapes.push({ shape_id: shapeId, shape_pt_lat: stopCoord.get(id).lat.toFixed(6), shape_pt_lon: stopCoord.get(id).lon.toFixed(6), shape_pt_sequence: i + 1 }));
          // Stop times of the template trip, relative to the trip start. Skipped stations add distance but no stop.
          const times = [];
          let t = 0;
          ids.forEach((id, i) => {
            if (i) t += haversineKm(stopCoord.get(ids[i - 1]), stopCoord.get(id)) / speed * 3600;
            const last = i === ids.length - 1, stops = !skip.has(id) || i === 0 || last;
            if (!stops) return;
            times.push({ id, arr: t, dep: last ? t : t + DWELL_S });
            if (!last) t += DWELL_S;
          });
          if (times.length < 2) continue;
          const headsign = map.stations[ids[ids.length - 1]].name || '';
          for (const svc of ['WEEKDAY', 'WEEKEND']) {
            const rows = BANDS.filter((b) => b[3] === svc && hw[b[0]]);
            if (!rows.length) continue;
            const tid = `${rid}_${v.key}_${svc}_${dir}`;
            trips.push({ route_id: rid, service_id: svc, trip_id: tid, trip_headsign: headsign, direction_id: dir, shape_id: shapeId });
            times.forEach((x, i) => stopTimes.push({ trip_id: tid, arrival_time: hms(x.arr), departure_time: hms(x.dep), stop_id: x.id, stop_sequence: i + 1, timepoint: 0 }));
            for (const b of rows) freqs.push({ trip_id: tid, start_time: b[1], end_time: b[2], headway_secs: Math.round(hw[b[0]] * 60), exact_times: 0 });
          }
        }
      }
    }

    const stops = [...used].map((id) => {
      const st = map.stations[id], c = stopCoord.get(id);
      return { stop_id: id, stop_name: st.name || id, stop_lat: c.lat.toFixed(6), stop_lon: c.lon.toFixed(6), location_type: 0 };
    });
    const title = map.title || 'GTHA Metro Map';
    const out = {};
    out['agency.txt'] = csv(['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang'], [{ agency_id: 'GMMC', agency_name: title, agency_url: SITE_URL, agency_timezone: TIMEZONE, agency_lang: 'en' }]);
    out['stops.txt'] = csv(['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type'], stops);
    out['routes.txt'] = csv(['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_desc', 'route_type', 'route_color', 'route_text_color'], routes);
    out['calendar.txt'] = csv(['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], [
      { service_id: 'WEEKDAY', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0, start_date: start, end_date: stop },
      { service_id: 'WEEKEND', monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 1, sunday: 1, start_date: start, end_date: stop }]);
    out['trips.txt'] = csv(['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id'], trips);
    out['stop_times.txt'] = csv(['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'timepoint'], stopTimes);
    out['frequencies.txt'] = csv(['trip_id', 'start_time', 'end_time', 'headway_secs', 'exact_times'], freqs);
    out['shapes.txt'] = csv(['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], shapes);
    out['feed_info.txt'] = csv(['feed_publisher_name', 'feed_publisher_url', 'feed_lang', 'feed_start_date', 'feed_end_date', 'feed_version'],
      [{ feed_publisher_name: 'GTHA Metro Map Creator', feed_publisher_url: SITE_URL, feed_lang: 'en', feed_start_date: start, feed_end_date: stop, feed_version: start }]);
    return out;
  }

  // ---------- ZIP ----------
  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  async function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch (e) { return null; }
  }
  async function zip(entries) {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0;
    for (const name of Object.keys(entries)) {
      const nameB = enc.encode(name), raw = enc.encode(entries[name]), crc = crc32(raw);
      let data = await deflateRaw(raw), method = 8;
      if (!data || data.length >= raw.length) { data = raw; method = 0; }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true);
      lh.setUint32(22, raw.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, raw.length, true); ch.setUint16(28, nameB.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      off += 30 + nameB.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0), n = Object.keys(entries).length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  async function build() { return zip(files()); }

  const rowCount = (text) => text.split('\r\n').length - 2;
  async function run() {
    const menu = document.getElementById('exportMenu'); if (menu) menu.hidden = true;
    const eb = document.getElementById('exportBtn'); if (eb) eb.setAttribute('aria-expanded', 'false');
    try {
      const f = files(), r = rowCount(f['routes.txt']), s = rowCount(f['stops.txt']);
      if (r < 1) { G.toast(tr('gtfsExportEmpty')); return; }
      G.download(slug(G.getMap().title) + '-gtfs.zip', await zip(f));
      G.toast(tr('gtfsExportDone', { r, s }));
    } catch (err) { console.error('gtfs export', err); G.toast(tr('gtfsExportFailed')); }
  }

  window.GMMCGtfsExport = { build, files };

  X.ready.push((GMMC) => {
    G = GMMC;
    const menu = document.getElementById('exportMenu'), anchor = menu && (menu.querySelector('#gtfsImportItem') || menu.querySelector('[data-act="json"]'));
    if (!menu || !anchor) return;
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.id = 'gtfsExportItem';
    b.innerHTML = `${window.icon('download', 24)}<span data-t="gtfsExport">${G.esc(tr('gtfsExport'))}</span>`;
    b.addEventListener('click', run);
    anchor.after(b);
    if (G.applyI18n) G.applyI18n();
  });
})();
