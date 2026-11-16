// gtfs-core.js: the in-memory model of a GTFS feed and every query the viewer needs. No DOM here.
(function () {
  'use strict';

  // ---------- dates and times ----------
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const ymd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  const key = (dt) => dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate());
  const addDays = (s, n) => key(new Date(ymd(s).getTime() + n * 864e5));
  const dateOk = (s) => /^\d{8}$/.test(s || '') && !isNaN(ymd(s).getTime()) && key(ymd(s)) === s;
  const fmtTime = (sec, withSec) => { if (sec == null || sec < 0) return ''; const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return pad(h) + ':' + pad(m) + (withSec ? ':' + pad(sec % 60) : ''); };
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dow = (s) => ymd(s).getUTCDay();
  const dateLabel = (s, lang) => { if (!dateOk(s)) return s || ''; return new Date(ymd(s)).toLocaleDateString(lang === 'yue' ? 'zh-HK' : 'en-CA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };

  function rad(d) { return d * Math.PI / 180; }
  function haversine(a, b, c, d) { const R = 6371008.8, dl = rad(c - a), dn = rad(d - b); const x = Math.sin(dl / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }

  const ROUTE_TYPES = { 0: 'Tram, streetcar, light rail', 1: 'Subway, metro', 2: 'Rail', 3: 'Bus', 4: 'Ferry', 5: 'Cable tram', 6: 'Aerial lift', 7: 'Funicular', 11: 'Trolleybus', 12: 'Monorail' };
  const EXT_TYPES = [[100, 'Railway service'], [200, 'Coach service'], [400, 'Urban railway service'], [500, 'Metro service'], [600, 'Underground service'], [700, 'Bus service'], [800, 'Trolleybus service'], [900, 'Tram service'], [1000, 'Water transport service'], [1100, 'Air service'], [1200, 'Ferry service'], [1300, 'Aerial lift service'], [1400, 'Funicular service'], [1500, 'Taxi service'], [1600, 'Self drive'], [1700, 'Miscellaneous service']];
  function routeTypeName(rt) {
    rt = +rt; if (ROUTE_TYPES[rt]) return ROUTE_TYPES[rt];
    for (let i = EXT_TYPES.length - 1; i >= 0; i--) if (rt >= EXT_TYPES[i][0]) return EXT_TYPES[i][1] + ' (extended ' + rt + ')';
    return 'Type ' + rt;
  }
  function typeClass(rt) {
    rt = +rt;
    if (rt === 0 || rt === 5 || (rt >= 900 && rt < 1000)) return 'tram';
    if (rt === 1 || rt === 12 || (rt >= 400 && rt < 700)) return 'subway';
    if (rt === 2 || (rt >= 100 && rt < 200)) return 'rail';
    if (rt === 3 || rt === 11 || (rt >= 200 && rt < 300) || (rt >= 700 && rt < 900)) return 'bus';
    if (rt === 4 || (rt >= 1000 && rt < 1100) || (rt >= 1200 && rt < 1300)) return 'ferry';
    return 'other';
  }

  const hex6 = (s) => /^[0-9a-fA-F]{6}$/.test(s || '') ? '#' + s.toUpperCase() : '';
  function luminance(hex) { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  // ---------- the model ----------
  class Feed {
    constructor(r, name) {
      const T = r.tables; this.name = name || 'feed.zip'; this.raw = r; this.T = T; this.files = r.files; this.cols = r.cols; this.geo = r.geo;
      this.agencies = T.agency || []; this.routes = T.routes || []; this.stops = T.stops || []; this.trips = T.trips || [];
      this.st = r.stopTimes || { n: 0, tripStart: new Int32Array(this.trips.length + 1), stop: new Int32Array(0), arr: new Int32Array(0), dep: new Int32Array(0), flags: new Uint8Array(0), dist: new Float32Array(0), extras: [] };
      if (this.st.tripStart.length !== this.trips.length + 1) this.st.tripStart = new Int32Array(this.trips.length + 1);
      this.stExtra = new Map(this.st.extras || []);
      this.shapes = r.shapes; this.shapeIx = new Map(); if (this.shapes) this.shapes.ids.forEach((id, i) => this.shapeIx.set(id, i));
      const ix = (arr, k) => { const m = new Map(); arr.forEach((o, i) => { if (!m.has(o[k])) m.set(o[k], i); }); return m; };
      this.routeIx = ix(this.routes, 'route_id'); this.stopIx = ix(this.stops, 'stop_id'); this.tripIx = ix(this.trips, 'trip_id'); this.agencyIx = ix(this.agencies, 'agency_id');
      this.lang = 'en'; this.tlang = '';
      this.buildTranslations();
      this.buildServices();
      this.buildTripTimes();
      this.buildFrequencies();
      this.buildPatterns();
      this.buildBounds();
      this.cache = { on: new Map(), stopIndex: null, tripsOnDate: null };
    }

    // ---- translations ----
    buildTranslations() {
      const rows = this.T.translations || []; this.tx = new Map(); const langs = new Set();
      for (const t of rows) {
        if (!t.language) continue; langs.add(t.language);
        const ks = [];
        if (t.record_id) ks.push([t.table_name, t.field_name, t.record_id, t.record_sub_id || ''].join('|'));
        if (t.field_value) ks.push([t.table_name, t.field_name, '=' + t.field_value].join('|'));
        for (const k of ks) { let m = this.tx.get(k); if (!m) this.tx.set(k, m = new Map()); m.set(t.language, t.translation); }
      }
      this.languages = [...langs].sort();
    }
    setLang(l) { this.tlang = l; }
    tr(table, field, id, orig, sub) {
      if (!this.tlang) return orig;
      let m = this.tx.get([table, field, id, sub || ''].join('|')) || this.tx.get([table, field, '=' + orig].join('|'));
      return m && (m.get(this.tlang) || m.get(this.tlang.split('-')[0])) || orig;
    }
    routeName(r) { const s = this.tr('routes', 'route_short_name', r.route_id, r.route_short_name), l = this.tr('routes', 'route_long_name', r.route_id, r.route_long_name); return [s, l].filter(Boolean).join(' ') || r.route_id; }
    routeShort(r) { return this.tr('routes', 'route_short_name', r.route_id, r.route_short_name) || this.tr('routes', 'route_long_name', r.route_id, r.route_long_name) || r.route_id; }
    stopName(s) { return this.tr('stops', 'stop_name', s.stop_id, s.stop_name) || s.stop_id; }
    headsign(t, ex) { return this.tr('trips', 'trip_headsign', t.trip_id, t.trip_headsign); }
    routeColor(r) { return hex6(r.route_color) || '#' + (this.defaultColor || '5F6368').replace('#', ''); }
    routeText(r) { const c = hex6(r.route_color); const t = hex6(r.route_text_color); if (t) return t; return c && luminance(c) > 0.45 ? '#000000' : '#FFFFFF'; }

    // ---- service calendar ----
    buildServices() {
      this.cal = new Map(); for (const c of this.T.calendar || []) this.cal.set(c.service_id, c);
      this.exc = new Map(); // service -> Map(date -> 1|2)
      for (const x of this.T.calendar_dates || []) { let m = this.exc.get(x.service_id); if (!m) this.exc.set(x.service_id, m = new Map()); m.set(x.date, +x.exception_type); }
      this.serviceIds = [...new Set([...this.cal.keys(), ...this.exc.keys()])].sort();
      this.tripsByService = new Map(); this.trips.forEach((t, i) => { let a = this.tripsByService.get(t.service_id); if (!a) this.tripsByService.set(t.service_id, a = []); a.push(i); });
      let s = '', e = '';
      for (const c of this.cal.values()) { if (dateOk(c.start_date) && (!s || c.start_date < s)) s = c.start_date; if (dateOk(c.end_date) && (!e || c.end_date > e)) e = c.end_date; }
      for (const m of this.exc.values()) for (const d of m.keys()) if (dateOk(d)) { if (!s || d < s) s = d; if (!e || d > e) e = d; }
      this.rangeStart = s; this.rangeEnd = e;
      const fi = (this.T.feed_info || [])[0] || {};
      this.feedInfo = fi;
      this.feedStart = dateOk(fi.feed_start_date) ? fi.feed_start_date : s; this.feedEnd = dateOk(fi.feed_end_date) ? fi.feed_end_date : e;
    }
    serviceActive(id, d) {
      const x = this.exc.get(id), ex = x && x.get(d);
      if (ex === 1) return true; if (ex === 2) return false;
      const c = this.cal.get(id); if (!c) return false;
      return c[DAYS[dow(d)]] === '1' && c.start_date <= d && d <= c.end_date;
    }
    servicesOn(d) {
      let s = this.cache.on.get(d); if (s) return s; s = new Set();
      for (const id of this.serviceIds) if (this.serviceActive(id, d)) s.add(id);
      if (this.cache.on.size > 400) this.cache.on.clear();
      this.cache.on.set(d, s); return s;
    }
    /** Dates in [range] on which a service runs, as a Set of YYYYMMDD. */
    serviceDates(id) {
      const out = new Set(); if (!this.rangeStart) return out;
      for (let d = this.rangeStart, n = 0; d <= this.rangeEnd && n < 4000; d = addDays(d, 1), n++) if (this.serviceActive(id, d)) out.add(d);
      return out;
    }
    tripsOn(d) {
      if (this.cache.tripsOnDate && this.cache.tripsOnDate.d === d) return this.cache.tripsOnDate.list;
      const sv = this.servicesOn(d), list = [];
      this.trips.forEach((t, i) => { if (sv.has(t.service_id)) list.push(i); });
      this.cache.tripsOnDate = { d, list }; return list;
    }
    /** Dates with the most services running, for a sensible default date. */
    defaultDate() {
      if (!this.rangeStart) return '';
      const today = key(new Date());
      if (today >= this.rangeStart && today <= this.rangeEnd && this.tripsOn(today).length) return today;
      let best = this.rangeStart, bn = -1;
      for (let d = this.rangeStart, n = 0; d <= this.rangeEnd && n < 800; d = addDays(d, 1), n++) { const w = dow(d); if (w < 2 || w > 4) continue; const c = this.servicesOn(d).size; if (c > bn) { bn = c; best = d; } }
      return best;
    }

    // ---- trip times ----
    buildTripTimes() {
      const n = this.trips.length, st = this.st; this.first = new Int32Array(n).fill(-1); this.last = new Int32Array(n).fill(-1);
      for (let i = 0; i < n; i++) {
        const a = st.tripStart[i], b = st.tripStart[i + 1]; if (b <= a) continue;
        let f = -1; for (let r = a; r < b; r++) { const v = st.dep[r] >= 0 ? st.dep[r] : st.arr[r]; if (v >= 0) { f = v; break; } }
        let l = -1; for (let r = b - 1; r >= a; r--) { const v = st.arr[r] >= 0 ? st.arr[r] : st.dep[r]; if (v >= 0) { l = v; break; } }
        this.first[i] = f; this.last[i] = l;
      }
    }
    buildFrequencies() {
      this.freq = new Map(); for (const f of this.T.frequencies || []) {
        const ti = this.tripIx.get(f.trip_id); if (ti === undefined) continue;
        const p = (s) => { const m = /^(\d+):(\d\d):(\d\d)$/.exec((s || '').trim()); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : -1; };
        const w = { start: p(f.start_time), end: p(f.end_time), headway: +f.headway_secs || 0, exact: f.exact_times === '1' };
        let a = this.freq.get(ti); if (!a) this.freq.set(ti, a = []); a.push(w);
      }
    }
    /** Start offsets (seconds added to the stored times) for every run of a trip: [0] unless frequencies apply. */
    runs(ti) {
      const fr = this.freq.get(ti); if (!fr) return [0];
      const f0 = this.first[ti] < 0 ? 0 : this.first[ti], out = [];
      for (const w of fr) if (w.headway > 0 && w.end > w.start) for (let t = w.start, k = 0; t < w.end && k < 5000; t += w.headway, k++) out.push(t - f0);
      return out;
    }

    // ---- patterns ----
    buildPatterns() {
      const st = this.st, n = this.trips.length; this.tripPattern = new Int32Array(n).fill(-1); this.patterns = []; this.routeTrips = this.routes.map(() => []); this.orphanTrips = [];
      const map = new Map();
      for (let i = 0; i < n; i++) {
        const t = this.trips[i], ri = this.routeIx.get(t.route_id);
        if (ri === undefined) { this.orphanTrips.push(i); continue; }
        this.routeTrips[ri].push(i);
        const a = st.tripStart[i], b = st.tripStart[i + 1]; if (b - a < 1) continue;
        let h1 = 2166136261, h2 = 5381;
        for (let r = a; r < b; r++) { const s = st.stop[r]; h1 = Math.imul(h1 ^ s, 16777619); h2 = (Math.imul(h2, 33) + s + 1) | 0; }
        const k = ri + '|' + (t.direction_id || '') + '|' + (b - a) + '|' + h1 + '|' + h2;
        let p = map.get(k);
        if (p === undefined) { p = this.patterns.length; map.set(k, p); this.patterns.push({ id: p, route: ri, dir: t.direction_id || '', len: b - a, rep: i, trips: [] }); }
        this.patterns[p].trips.push(i); this.tripPattern[i] = p;
      }
      this.routePatterns = this.routes.map(() => []); for (const p of this.patterns) this.routePatterns[p.route].push(p.id);
      for (const l of this.routePatterns) l.sort((x, y) => this.patterns[y].trips.length - this.patterns[x].trips.length);
    }
    patternStops(p) { const t = this.patterns[p].rep, st = this.st, out = []; for (let r = st.tripStart[t]; r < st.tripStart[t + 1]; r++) out.push(st.stop[r]); return out; }

    // ---- stops ----
    buildBounds() {
      let a = 90, b = -90, c = 180, d = -180, n = 0;
      for (const s of this.stops) { s.lat = parseFloat(s.stop_lat); s.lon = parseFloat(s.stop_lon); if (Number.isFinite(s.lat) && Number.isFinite(s.lon) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180 && (s.lat || s.lon)) { a = Math.min(a, s.lat); b = Math.max(b, s.lat); c = Math.min(c, s.lon); d = Math.max(d, s.lon); n++; s.ok = true; } else s.ok = false; }
      this.bounds = n ? [a, c, b, d] : null;
    }
    stopIndex() {
      if (this.cache.stopIndex) return this.cache.stopIndex;
      const st = this.st, ns = this.stops.length, count = new Int32Array(ns + 1);
      for (let r = 0; r < st.n; r++) if (st.stop[r] >= 0) count[st.stop[r] + 1]++;
      for (let i = 0; i < ns; i++) count[i + 1] += count[i];
      const fill = count.slice(0, ns), rows = new Int32Array(count[ns]), rowTrip = new Int32Array(st.n);
      for (let t = 0; t < this.trips.length; t++) for (let r = st.tripStart[t]; r < st.tripStart[t + 1]; r++) { rowTrip[r] = t; if (st.stop[r] >= 0) rows[fill[st.stop[r]]++] = r; }
      return (this.cache.stopIndex = { start: count, rows, rowTrip });
    }
    /** route indexes serving a stop (through its patterns, children included for a station). */
    routesAt(si) {
      if (!this.cache.stopRoutes) { const m = new Map(); for (const p of this.patterns) for (const s of this.patternStops(p.id)) { let set = m.get(s); if (!set) m.set(s, set = new Set()); set.add(p.route); } this.cache.stopRoutes = m; }
      const out = new Set(this.cache.stopRoutes.get(si) || []), s = this.stops[si];
      if (s && s.location_type === '1') for (const c of this.childrenOf(s.stop_id)) for (const r of this.routesAt(this.stopIx.get(c.stop_id))) out.add(r);
      return [...out].sort((a, b) => a - b);
    }
    childrenOf(id) { if (!this.cache.children) { const m = new Map(); for (const s of this.stops) if (s.parent_station) { let a = m.get(s.parent_station); if (!a) m.set(s.parent_station, a = []); a.push(s); } this.cache.children = m; } return this.cache.children.get(id) || []; }
    /** Departures from a stop (a station includes its children) on a date from a time (seconds). */
    departures(si, date, from, limit) {
      const s = this.stops[si]; const set = [si]; if (s.location_type === '1') for (const c of this.childrenOf(s.stop_id)) { const k = this.stopIx.get(c.stop_id); if (k !== undefined) set.push(k); }
      const idx = this.stopIndex(), st = this.st, out = [];
      for (const day of [0, -1]) {
        const d = addDays(date, day), sv = this.servicesOn(d), off = day * 86400;
        for (const k of set) for (let q = idx.start[k]; q < idx.start[k + 1]; q++) {
          const r = idx.rows[q], t = idx.rowTrip[r], tr = this.trips[t]; if (!sv.has(tr.service_id)) continue;
          if ((st.flags[r] >> 2 & 3) === 1 && (st.flags[r] & 3) === 1) continue;
          const dep = st.dep[r] >= 0 ? st.dep[r] : st.arr[r]; if (dep < 0) continue;
          for (const o of this.runs(t)) { const tm = dep + o + off; if (tm >= from && tm < from + 86400) out.push({ time: tm, trip: t, row: r, stop: k }); }
        }
      }
      out.sort((a, b) => a.time - b.time); return out.slice(0, limit || 200);
    }

    // ---- shapes ----
    shapePoints(shapeId) { const i = this.shapeIx.get(shapeId); if (i === undefined) return null; const S = this.shapes, a = S.start[i], b = S.start[i + 1], out = new Array(b - a); for (let k = a; k < b; k++) out[k - a] = [S.lat[k], S.lon[k]]; return out; }
    shapeLength(i) { const S = this.shapes; let m = 0; for (let k = S.start[i] + 1; k < S.start[i + 1]; k++) m += haversine(S.lat[k - 1], S.lon[k - 1], S.lat[k], S.lon[k]); return m; }
    /** Points to draw for a trip: its shape, else its stops. */
    tripPath(ti) {
      const t = this.trips[ti]; let p = t.shape_id ? this.shapePoints(t.shape_id) : null; if (p && p.length > 1) return p;
      const st = this.st, out = []; for (let r = st.tripStart[ti]; r < st.tripStart[ti + 1]; r++) { const s = this.stops[st.stop[r]]; if (s && s.ok) out.push([s.lat, s.lon]); } return out;
    }
    routePath(ri) { const pats = this.routePatterns[ri]; if (!pats.length) return []; return this.tripPath(this.patterns[pats[0]].rep); }
    routeShapes(ri) { const set = new Set(); for (const t of this.routeTrips[ri]) { const s = this.trips[t].shape_id; if (s) set.add(s); } return [...set]; }

    // ---- statistics ----
    routeStats(ri, date) {
      const sv = date ? this.servicesOn(date) : null, times = [], hours = new Array(24).fill(0); let first = Infinity, last = -1, trips = 0;
      for (const t of this.routeTrips[ri]) {
        if (sv && !sv.has(this.trips[t].service_id)) continue;
        for (const o of this.runs(t)) { const f = this.first[t]; if (f < 0) continue; const x = f + o; trips++; times.push(x); const h = Math.floor(x / 3600); if (h >= 0 && h < 24) hours[h]++; if (x < first) first = x; const l = this.last[t] + o; if (l > last) last = l; }
      }
      times.sort((a, b) => a - b);
      return { trips, hours, first: isFinite(first) ? first : -1, last, times };
    }
    headwayBands(times) {
      const bands = [['am', 6, 9], ['midday', 9, 15], ['pm', 15, 19], ['evening', 19, 24], ['early', 0, 6]], out = {};
      for (const [k, a, b] of bands) { const n = times.filter((x) => x >= a * 3600 && x < b * 3600).length; out[k] = n >= 2 ? Math.round((b - a) * 60 / n * 10) / 10 : null; }
      return out;
    }

    // ---- blocks ----
    blocksOn(date) {
      const m = new Map();
      for (const t of this.tripsOn(date)) { const b = this.trips[t].block_id; if (!b) continue; let a = m.get(b); if (!a) m.set(b, a = []); a.push(t); }
      const blocks = [];
      for (const [id, list] of m) {
        list.sort((a, b) => this.first[a] - this.first[b]);
        const issues = [], gaps = []; let end = -1;
        for (let k = 0; k < list.length; k++) {
          const t = list[k];
          if (k > 0) { const gap = this.first[t] - end; gaps.push(gap); if (gap < 0) issues.push({ a: list[k - 1], b: t, gap }); }
          end = Math.max(end, this.last[t]);
        }
        blocks.push({ id, trips: list, start: this.first[list[0]], end, issues, gaps });
      }
      blocks.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)); return blocks;
    }
    blocksPerHour(blocks) { const h = new Array(24).fill(0); for (const b of blocks) for (let x = Math.max(0, Math.floor(b.start / 3600)); x <= Math.min(23, Math.floor(b.end / 3600)); x++) h[x]++; return h; }
    tripsPerDay() {
      const out = []; if (!this.rangeStart) return out;
      const per = new Map(); for (const [id, l] of this.tripsByService) per.set(id, l.length);
      for (let d = this.rangeStart, n = 0; d <= this.rangeEnd && n < 4000; d = addDays(d, 1), n++) { let c = 0; for (const id of this.servicesOn(d)) c += per.get(id) || 0; out.push([d, c]); }
      return out;
    }

    // ---- table helpers ----
    table(name) { return this.T[name] || []; }
    has(name) { return !!(this.files[name + '.txt'] || this.T[name]); }
    /** A readable label for an id of a given kind, for resolved references. */
    label(kind, id) {
      if (!id) return '';
      switch (kind) {
        case 'route': { const i = this.routeIx.get(id); return i === undefined ? '' : this.routeName(this.routes[i]); }
        case 'stop': { const i = this.stopIx.get(id); return i === undefined ? '' : this.stopName(this.stops[i]); }
        case 'agency': { const i = this.agencyIx.get(id); return i === undefined ? '' : this.agencies[i].agency_name; }
        case 'trip': { const i = this.tripIx.get(id); return i === undefined ? '' : this.trips[i].trip_headsign || this.trips[i].trip_short_name || ''; }
        default: { const m = this.refMaps()[kind]; return (m && m.get(id)) || ''; }
      }
    }
    refMaps() {
      if (this.cache.ref) return this.cache.ref;
      const mk = (tbl, k, n) => { const m = new Map(); for (const r of this.table(tbl)) if (!m.has(r[k])) m.set(r[k], r[n]); return m; };
      return (this.cache.ref = {
        fare_product: mk('fare_products', 'fare_product_id', 'fare_product_name'), fare_media: mk('fare_media', 'fare_media_id', 'fare_media_name'), rider_category: mk('rider_categories', 'rider_category_id', 'rider_category_name'),
        area: mk('areas', 'area_id', 'area_name'), network: mk('networks', 'network_id', 'network_name'), level: mk('levels', 'level_id', 'level_name'), booking_rule: mk('booking_rules', 'booking_rule_id', 'message'),
        fare: mk('fare_attributes', 'fare_id', 'price'), location_group: mk('location_groups', 'location_group_id', 'location_group_name'), service: new Map()
      });
    }
  }

  window.GtfsCore = { Feed, ymd, key, addDays, dateOk, fmtTime, dow, DAYS, dateLabel, haversine, routeTypeName, typeClass, hex6, contrast, luminance, ROUTE_TYPES, pad };
})();
