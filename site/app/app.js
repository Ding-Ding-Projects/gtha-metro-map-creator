/* GTHA Metro Map Creator: editor engine. Plain browser JavaScript, no dependencies. */
(function () {
  'use strict';
  const t = window.I18N.t;
  const G = 24; // pixels per grid unit
  const STORE_MAP = 'gmmc.map.v1';
  const STORE_SET = 'gmmc.settings.v1';
  const STORE_SETUP = 'gmmc.setup.v1';
  const MAX_IMPORT = 5 * 1024 * 1024;
  const DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1], NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] };
  const DIR_ORDER = ['E', 'W', 'N', 'S', 'NE', 'NW', 'SE', 'SW'];
  const DEFAULT_SETTINGS = { lang: 'en', theme: 'system', grid: true, snap: true, fontSize: 13, legend: true, sound: true,
    layout: 'geographic', background: 'osm', bgOpacity: 0.9, showFreq: true, liveStops: true, overpassUrl: '', mapStyle: 'material' };
  const STYLES = ['solid', 'dashed', 'rail', 'brt', 'bus', 'express', 'superExpress'];
  const STYLE_WIDTH = { solid: 8, dashed: 8, rail: 8, brt: 6, bus: 4, express: 8, superExpress: 9 };
  // Geographic layout: Web Mercator at zoom 13, origin at Union Station.
  const Z0 = 13, TILE = 256, ORIGIN = [43.64564, -79.38021];
  const OSM_TILES = 'https://tile.openstreetmap.org/';
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

  // Extension hooks. Feature modules (mod-*.js) load before this file and push functions onto
  // window.GMMCX; see docs/features/extensions.md.
  const X = Object.assign({ validate: [], transform: [], lineStyle: [], svgUnder: [], svgOver: [], labelExtra: [], inspector: [], input: [], click: [], issues: [], keydown: [], pointer: [], pointermove: [], pointerup: [], afterRender: [], ready: [], exports: [], settings: [], stationMarker: [], labelStyle: [], exportTheme: [] }, window.GMMCX || {});
  for (const k of Object.keys(X)) if (!Array.isArray(X[k])) X[k] = [];
  window.GMMCX = X;
  const hook = (name, ...args) => { for (const f of X[name]) { try { const r = f(...args); if (r) return r; } catch (err) { console.error('extension ' + name, err); } } return null; };
  const hookAll = (name, ...args) => X[name].map((f) => { try { return f(...args) || ''; } catch (err) { console.error('extension ' + name, err); return ''; } }).join('');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }
  };

  // ---------- state ----------
  let settings = Object.assign({}, DEFAULT_SETTINGS, store.get(STORE_SET) || {});
  let map = validateMap(store.get(STORE_MAP)) || window.GTHATemplates.gtha();
  let past = [], future = [];
  let tool = 'select';
  let selection = null; // {type:'station', ids:[]} | {type:'line', id} | {type:'edge', lineId, index} | {type:'label', id}
  let activeLineId = null;
  let view = { tx: 0, ty: 0, k: 1 };
  let drag = null;
  let saveTimer = 0;
  let idCounter = Date.now() % 100000;
  const uid = (p) => p + '_' + (idCounter++).toString(36);

  // ---------- model helpers ----------
  function validateMap(m) {
    if (!m || typeof m !== 'object' || m.version !== 1) return null;
    if (!m.stations || typeof m.stations !== 'object' || !Array.isArray(m.lines)) return null;
    const out = { version: 1, title: String(m.title || 'Untitled map').slice(0, 120), titleZh: String(m.titleZh || '').slice(0, 120), stations: {}, lines: [], labels: [] };
    for (const [id, s] of Object.entries(m.stations)) {
      if (!s || !Number.isFinite(+s.x) || !Number.isFinite(+s.y)) return null;
      out.stations[id] = { id, name: String(s.name || id).slice(0, 80), nameZh: String(s.nameZh || '').slice(0, 80), x: +s.x, y: +s.y,
        label: DIRS[s.label] ? s.label : 'auto', interchange: ['auto', 'yes', 'no'].includes(s.interchange) ? s.interchange : 'auto',
        kind: s.kind === 'stop' ? 'stop' : 'station' };
      if (s.lat !== null && s.lon !== null && s.lat !== undefined && Number.isFinite(+s.lat) && Number.isFinite(+s.lon) && Math.abs(+s.lat) <= 85 && Math.abs(+s.lon) <= 180) { out.stations[id].lat = +s.lat; out.stations[id].lon = +s.lon; }
      if (s.osm && /^\d{1,15}$/.test(String(s.osm))) out.stations[id].osm = String(s.osm);
    }
    for (const l of m.lines) {
      if (!l || !Array.isArray(l.path)) return null;
      const path = l.path.filter((r) => typeof r === 'string' && (r[0] === '@' ? /^@-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(r) : out.stations[r]));
      out.lines.push({ id: String(l.id || uid('line')), name: String(l.name || 'Line').slice(0, 80), nameZh: String(l.nameZh || '').slice(0, 80),
        color: /^#[0-9a-fA-F]{6}$/.test(l.color) ? l.color : '#1F5FBF', width: Math.min(16, Math.max(3, +l.width || 8)),
        style: STYLES.includes(l.style) ? l.style : 'solid', visible: l.visible !== false, path,
        freq: freqBands(l.freq), showFreq: l.showFreq !== false,
        note: String(l.note || '').slice(0, 300),
        bends: (l.bends && typeof l.bends === 'object') ? Object.fromEntries(Object.entries(l.bends).filter(([, v]) => v === 'late' || v === 'early')) : {} });
    }
    for (const lb of (Array.isArray(m.labels) ? m.labels : [])) {
      if (lb && Number.isFinite(+lb.x) && Number.isFinite(+lb.y)) {
        const o = { id: String(lb.id || uid('lbl')), x: +lb.x, y: +lb.y, text: String(lb.text || '').slice(0, 300), size: Math.min(48, Math.max(8, +lb.size || 14)) };
        if (lb.lat !== null && lb.lat !== undefined && Number.isFinite(+lb.lat) && Number.isFinite(+lb.lon)) { o.lat = +lb.lat; o.lon = +lb.lon; }
        out.labels.push(o);
      }
    }
    out.transfers = (Array.isArray(m.transfers) ? m.transfers : []).filter((t) => t && out.stations[t.a] && out.stations[t.b] && t.a !== t.b).slice(0, 2000).map((t) => ({ a: String(t.a), b: String(t.b) }));
    for (const f of X.validate) { try { f(m, out); } catch (err) { console.error('extension validate', err); } }
    return out;
  }
  /** Frequency by time band. An older file's `offpeak` becomes `midday`. */
  function freqBands(f) { f = f || {}; return { peak: freqNum(f.peak), midday: freqNum(f.midday !== undefined && f.midday !== null ? f.midday : f.offpeak), evening: freqNum(f.evening), weekend: freqNum(f.weekend) }; }
  function freqNum(v) { const n = Math.round(+v); return v !== null && v !== '' && Number.isFinite(n) && n >= 1 && n <= 240 ? n : null; }
  const lineById = (id) => map.lines.find((l) => l.id === id);

  // ---------- geographic layout ----------
  const isGeo = () => settings.layout === 'geographic';
  function mercPx(lat, lon) { const n = TILE * 2 ** Z0, r = lat * Math.PI / 180; return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n }; }
  function latLonFromPx(x, y) { const n = TILE * 2 ** Z0; return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, lon: x / n * 360 - 180 }; }
  const OPX = mercPx(ORIGIN[0], ORIGIN[1]);
  /** Real coordinates to geographic grid units (same scale as the schematic grid at zoom 1). */
  function geoGrid(lat, lon) { const p = mercPx(lat, lon); return { x: (p.x - OPX.x) / G, y: (p.y - OPX.y) / G + 4 }; }
  function gridToLatLon(g) { return latLonFromPx(g.x * G + OPX.x, (g.y - 4) * G + OPX.y); }
  // Least-squares affine fits between the schematic grid and real coordinates, from stations that
  // have both, so a station drawn in one layout gets a sensible position in the other.
  let fitCache = null;
  function solve3(rows) { // rows: [u, v, 1, target]
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    for (const r of rows) for (let i = 0; i < 3; i++) { b[i] += r[i] * r[3]; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; }
    for (let i = 0; i < 3; i++) {
      let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      if (Math.abs(A[i][i]) < 1e-9) return null;
      for (let k = i + 1; k < 3; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
    }
    const x = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let v = b[i]; for (let j = i + 1; j < 3; j++) v -= A[i][j] * x[j]; x[i] = v / A[i][i]; }
    return x;
  }
  function fits() {
    const pts = Object.values(map.stations).filter((s) => s.lat !== undefined);
    const key = pts.length + ':' + Object.keys(map.stations).length;
    if (fitCache && fitCache.key === key) return fitCache;
    let toGeo = null, toGrid = null;
    if (pts.length >= 3) {
      const gg = pts.map((s) => geoGrid(s.lat, s.lon));
      const ax = solve3(pts.map((s, i) => [s.x, s.y, 1, gg[i].x])), ay = solve3(pts.map((s, i) => [s.x, s.y, 1, gg[i].y]));
      const bx = solve3(pts.map((s, i) => [gg[i].x, gg[i].y, 1, s.x])), by = solve3(pts.map((s, i) => [gg[i].x, gg[i].y, 1, s.y]));
      if (ax && ay) toGeo = (p) => ({ x: ax[0] * p.x + ax[1] * p.y + ax[2], y: ay[0] * p.x + ay[1] * p.y + ay[2] });
      if (bx && by) toGrid = (g) => ({ x: bx[0] * g.x + bx[1] * g.y + bx[2], y: by[0] * g.x + by[1] * g.y + by[2] });
    }
    fitCache = { key, toGeo: toGeo || ((p) => ({ x: p.x, y: p.y })), toGrid: toGrid || ((g) => ({ x: g.x, y: g.y })) };
    return fitCache;
  }
  /** Geographic grid position of a station, estimated from the schematic one when it has no coordinates. */
  function stGeo(s) { return s.lat !== undefined ? geoGrid(s.lat, s.lon) : fits().toGeo(s); }
  /** Apply extension view transforms (for example the timeline year filter). */
  function viewMap(m) { let v = m; for (const f of X.transform) { try { v = f(v) || v; } catch (err) { console.error('extension transform', err); } } return v; }
  /** The map as it is drawn: schematic as stored, or geographic positions scaled by the zoom, so
   * lines and labels keep their size on screen while the map underneath zooms. */
  function dm(k) {
    if (!isGeo()) return map;
    const kk = k === undefined ? view.k : k;
    const stations = {};
    for (const s of Object.values(map.stations)) { const g = stGeo(s); stations[s.id] = Object.assign({}, s, { x: g.x * kk, y: g.y * kk }); }
    const wp = {};
    const lines = map.lines.map((l) => {
      const path = l.path.map((r, i) => {
        if (r[0] !== '@') return r;
        let a = i - 1; while (a >= 0 && l.path[a][0] === '@') a--;
        let b = i + 1; while (b < l.path.length && l.path[b][0] === '@') b++;
        const pa = a >= 0 ? stations[l.path[a]] : null, pb = b < l.path.length ? stations[l.path[b]] : null;
        const key = '@@' + l.id + '#' + i, f = (i - a) / (b - a);
        wp[key] = pa && pb ? { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f } : (pa || pb || { x: 0, y: 0 });
        return key;
      });
      return Object.assign({}, l, { path, bends: {} });
    });
    const labels = map.labels.filter((lb) => lb.lat !== undefined).map((lb) => { const g = geoGrid(lb.lat, lb.lon); return Object.assign({}, lb, { x: g.x * kk, y: g.y * kk }); });
    return Object.assign({}, map, { stations, lines, labels, _geo: true, _k: kk, _wp: wp });
  }

  function nodePos(ref) {
    if (ref[0] === '@') { const [x, y] = ref.slice(1).split(',').map(Number); return { x, y }; }
    const s = map.stations[ref]; return s ? { x: s.x, y: s.y } : null;
  }
  function servingLines(id) { return map.lines.filter((l) => l.path.includes(id)); }
  function isInterchange(s) {
    if (s.interchange === 'yes') return true;
    if (s.interchange === 'no') return false;
    return new Set(servingLines(s.id).filter((l) => !(l.skip && l.skip.includes(s.id))).map((l) => String(l.id).split('~b')[0])).size > 1;
  }

  function checkpoint() {
    past.push(JSON.stringify(map));
    if (past.length > 200) past.shift();
    future = [];
  }
  function undo() { if (!past.length) return; future.push(JSON.stringify(map)); map = JSON.parse(past.pop()); fixSelection(); changed(false); beep(330); }
  function redo() { if (!future.length) return; past.push(JSON.stringify(map)); map = JSON.parse(future.pop()); fixSelection(); changed(false); beep(440); }
  function fixSelection() {
    if (!selection) return;
    if (selection.type === 'station') { selection.ids = selection.ids.filter((id) => map.stations[id]); if (!selection.ids.length) selection = null; }
    else if ((selection.type === 'line' || selection.type === 'edge') && !lineById(selection.lineId || selection.id)) selection = null;
    else if (selection.type === 'edge' && lineById(selection.lineId).path.length - 1 <= selection.index) selection = null;
    else if (selection.type === 'label' && !map.labels.find((l) => l.id === selection.id)) selection = null;
    if (activeLineId && !lineById(activeLineId)) activeLineId = null;
  }
  function changed(save = true) {
    render(); renderPanels();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (store.set(STORE_MAP, map) && save) setStatus(t('saved'), true); }, 400);
  }

  // ---------- geometry ----------
  function route(a, b, mode) {
    const dx = b.x - a.x, dy = b.y - a.y, adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx === 0 || ady === 0 || adx === ady) return [a, b];
    const d = Math.min(adx, ady), sx = Math.sign(dx), sy = Math.sign(dy);
    if (mode === 'late') return [a, adx > ady ? { x: b.x - sx * d, y: a.y } : { x: a.x, y: b.y - sy * d }, b];
    return [a, { x: a.x + sx * d, y: a.y + sy * d }, b];
  }
  function offsetPolyline(pts, d) {
    if (!d || pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      segs.push([{ x: a.x + nx * d, y: a.y + ny * d }, { x: b.x + nx * d, y: b.y + ny * d }]);
    }
    const out = [segs[0][0]];
    for (let i = 1; i < segs.length; i++) out.push(intersect(segs[i - 1], segs[i]) || segs[i][0]);
    out.push(segs[segs.length - 1][1]);
    return out;
  }
  function intersect([p1, p2], [p3, p4]) {
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(d) < 1e-9) return null;
    const a = p1.x * p2.y - p1.y * p2.x, b = p3.x * p4.y - p3.y * p4.x;
    return { x: (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / d, y: (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / d };
  }
  function segRect(a, b, r) { // Liang-Barsky
    let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
    const p = [-dx, dx, -dy, dy], q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; } else {
        const tt = q[i] / p[i];
        if (p[i] < 0) { if (tt > t1) return false; if (tt > t0) t0 = tt; } else { if (tt < t0) return false; if (tt < t1) t1 = tt; }
      }
    }
    return true;
  }

  /** Build bundled, offset geometry for every visible line. Shared node pairs get parallel offsets. */
  function computeGeometry(m) {
    const bundles = new Map();
    const vis = m.lines.filter((l) => l.visible);
    for (const l of vis) {
      for (let i = 0; i < l.path.length - 1; i++) {
        const ka = l.path[i], kb = l.path[i + 1];
        if (ka === kb) continue;
        const fwd = ka < kb, key = fwd ? ka + '|' + kb : kb + '|' + ka;
        let bd = bundles.get(key);
        if (!bd) {
          const a = nodePosIn(m, fwd ? ka : kb), b = nodePosIn(m, fwd ? kb : ka);
          if (!a || !b) continue;
          let mode = l.bends[i] || 'early';
          if (!fwd) mode = mode === 'late' ? 'early' : 'late';
          bd = { pts: (m._geo ? [a, b] : route(a, b, mode)).map((p) => ({ x: p.x * G, y: p.y * G })), lines: [] };
          bundles.set(key, bd);
        }
        if (!bd.lines.includes(l)) bd.lines.push(l);
      }
    }
    const lineGeo = [];
    for (const l of vis) {
      const edges = [];
      let poly = [];
      for (let i = 0; i < l.path.length - 1; i++) {
        const ka = l.path[i], kb = l.path[i + 1];
        const fwd = ka < kb, bd = bundles.get(fwd ? ka + '|' + kb : kb + '|' + ka);
        if (!bd) continue;
        const n = bd.lines.length, j = bd.lines.indexOf(l);
        const spacing = Math.max(...bd.lines.map((x) => x.width)) + 2;
        let pts = offsetPolyline(bd.pts, (j - (n - 1) / 2) * spacing);
        if (!fwd) pts = pts.slice().reverse();
        edges.push({ index: i, pts });
        if (poly.length) { const last = poly[poly.length - 1]; if (Math.hypot(last.x - pts[0].x, last.y - pts[0].y) < 0.5) pts = pts.slice(1); }
        poly = poly.concat(pts);
      }
      lineGeo.push({ line: l, poly, edges });
    }
    return lineGeo;
  }
  function nodePosIn(m, ref) {
    if (m._wp && m._wp[ref]) return m._wp[ref];
    if (ref[0] === '@') { const [x, y] = ref.slice(1).split(',').map(Number); return { x, y }; }
    const s = m.stations[ref]; return s ? { x: s.x, y: s.y } : null;
  }
  const polyD = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('');

  function labelPlacement(m, s, geo, fs, wf) {
    const name = displayName(s);
    const w = Math.max(name.main.length * (wf || 1), name.sub.length * 1.6) * fs * 0.58 + 6;
    const h = fs * (name.sub ? 2.3 : 1.25);
    const cx = s.x * G, cy = s.y * G, r = 12;
    const rectFor = (dir) => {
      const [ux, uy] = DIRS[dir];
      const ax = cx + ux * r, ay = cy + uy * r;
      const x0 = ux > 0 ? ax : ux < 0 ? ax - w : ax - w / 2;
      const y0 = uy > 0 ? ay : uy < 0 ? ay - h : ay - h / 2;
      return { x0, y0, x1: x0 + w, y1: y0 + h, dir };
    };
    if (s.label !== 'auto') return rectFor(s.label);
    let best = null, bestScore = Infinity;
    for (const dir of DIR_ORDER) {
      const rc = rectFor(dir); let score = 0;
      for (const g of geo) for (let i = 0; i < g.poly.length - 1; i++) if (segRect(g.poly[i], g.poly[i + 1], rc)) score += 2;
      for (const o of Object.values(m.stations)) if (o !== s && o.x * G > rc.x0 - 6 && o.x * G < rc.x1 + 6 && o.y * G > rc.y0 - 6 && o.y * G < rc.y1 + 6) score += 3;
      if (score < bestScore) { bestScore = score; best = rc; if (!score) break; }
    }
    return best;
  }
  function displayName(s) {
    const lang = settings.lang;
    if (lang === 'yue') return { main: s.nameZh || s.name, sub: '' };
    if (lang === 'both' && s.nameZh) return { main: s.name, sub: s.nameZh };
    return { main: s.name, sub: '' };
  }

  function linePaths(l, d) {
    const w = l.width, cap = `stroke-linecap="${l.cap || 'round'}" stroke-linejoin="${l.join || 'round'}" fill="none"`;
    switch (l.style) {
      case 'rail': return `<path d="${d}" ${cap} stroke="${l.color}" stroke-width="${w}"/><path d="${d}" ${cap} stroke="#FFFFFF" stroke-width="${Math.max(1.5, w * 0.28)}"/>`;
      case 'dashed': return `<path d="${d}" ${cap} stroke="${l.color}" stroke-width="${w}" stroke-dasharray="${w * 1.4} ${w}"/>`;
      case 'brt': return `<path d="${d}" ${cap} stroke="#FFFFFF" stroke-width="${w + 3}"/><path d="${d}" ${cap} stroke="${l.color}" stroke-width="${w}"/>`;
      case 'express': return `<path d="${d}" ${cap} stroke="#16181D" stroke-width="${w + 4}"/><path d="${d}" ${cap} stroke="${l.color}" stroke-width="${w}"/>`;
      case 'superExpress': return `<path d="${d}" ${cap} stroke="#16181D" stroke-width="${w + 6}"/><path d="${d}" ${cap} stroke="#FFFFFF" stroke-width="${w + 2}"/><path d="${d}" ${cap} stroke="${l.color}" stroke-width="${w}"/><path d="${d}" ${cap} stroke="#FFFFFF" stroke-width="${Math.max(1.5, w * 0.22)}" stroke-dasharray="${w * 1.2} ${w * 1.2}"/>`;
      default: return `<path d="${d}" ${cap} stroke="${l.color}" stroke-width="${w}"/>`;
    }
  }
  function freqText(l) {
    const f = freqBands(l.freq);
    if (f.peak && f.midday && f.peak !== f.midday) return f.peak + '/' + f.midday + ' ' + t('minShort');
    const one = f.peak || f.midday || f.evening || f.weekend;
    return one ? one + ' ' + t('minShort') : '';
  }
  const inkFor = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#16181D' : '#FFFFFF'; };

  /** Colours the exports use; a style preset may change them (extension hook exportTheme). */
  function exportTheme() { return Object.assign({ bg: '#FFFFFF', ink: '#16181D', halo: '#FFFFFF', sub: '#545249', tileFilter: '' }, hook('exportTheme') || {}); }

  // ---------- SVG building (shared by editor and export) ----------
  function buildMapSvg(m, opts) {
    const geo = computeGeometry(m);
    const fs = settings.fontSize;
    const th = exportTheme();
    let out = '';
    // walking transfers between nearby stations
    for (const tr of (m.transfers || [])) {
      const a = m.stations[tr.a], b = m.stations[tr.b]; if (!a || !b) continue;
      out += `<line x1="${a.x * G}" y1="${a.y * G}" x2="${b.x * G}" y2="${b.y * G}" stroke="#16181D" stroke-width="12" stroke-linecap="round"/><line x1="${a.x * G}" y1="${a.y * G}" x2="${b.x * G}" y2="${b.y * G}" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>`;
    }
    out += hookAll('svgUnder', m, { G, geo, opts });
    for (const g of geo) {
      const l = g.line, d = polyD(g.poly);
      if (!g.poly.length) continue;
      let ls = l; for (const f of X.lineStyle) { try { ls = f(ls, m) || ls; } catch (err) { console.error('extension lineStyle', err); } }
      out += linePaths(ls, d);
      if (opts.editor && !l._branchOf) for (const e of g.edges) out += `<path class="hit" d="${polyD(e.pts)}" stroke-width="${Math.max(16, l.width + 8)}" data-line="${esc(l.id)}" data-edge="${e.index}"/>`;
    }
    // stations and stops
    const zoomedOut = m._geo && m._k < 0.55;
    const labelled = [];
    for (const s of Object.values(m.stations)) {
      const inter = isInterchangeIn(m, s);
      const allLines = m.lines.filter((l) => l.visible && l.path.includes(s.id));
      const lines = allLines.filter((l) => !(l.skip && l.skip.includes(s.id)));
      const passOnly = allLines.length > 0 && !lines.length && s.interchange !== 'yes';
      const col = (lines[0] || allLines[0]) ? (lines[0] || allLines[0]).color : '#16181D';
      const cx = s.x * G, cy = s.y * G;
      if (passOnly) {
        out += `<g data-st="${esc(s.id)}">${opts.editor ? `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${col}" opacity=".7"/><circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/>` : ''}</g>`;
        continue;
      }
      const custom = hook('stationMarker', m, s, { inter, col, cx, cy, geo, G, opts });
      if (custom) {
        out += `<g data-st="${esc(s.id)}">${custom}`;
      } else if (s.kind === 'stop' && !inter) {
        out += `<g data-st="${esc(s.id)}"><circle cx="${cx}" cy="${cy}" r="3.6" fill="#FFFFFF" stroke="${col}" stroke-width="2.2"/>`;
      } else {
        const r = inter ? 8.5 : 6;
        out += `<g data-st="${esc(s.id)}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF" stroke="${inter ? '#16181D' : col}" stroke-width="${inter ? 3.5 : 3}"/>`;
      }
      if (opts.editor) out += `<circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/>`;
      out += '</g>';
      const terminal = lines.some((l) => l.path[0] === s.id || l.path[l.path.length - 1] === s.id);
      if (zoomedOut && !inter && !terminal) continue;
      if (m._geo && s.kind === 'stop' && !inter && m._k < 1.6) continue;
      labelled.push(s);
    }
    // Place labels by importance (interchanges, termini, stations, stops) and drop any that would overlap.
    const placed = [];
    const rank = (s) => { const inter = isInterchangeIn(m, s); const term = m.lines.some((l) => l.visible && (l.path[0] === s.id || l.path[l.path.length - 1] === s.id)); return (inter ? 0 : term ? 1 : s.kind === 'stop' ? 3 : 2); };
    labelled.sort((a, b) => rank(a) - rank(b));
    for (const s of labelled) {
      const inter = isInterchangeIn(m, s);
      const small = s.kind === 'stop' && !inter;
      const lfs = small ? Math.max(9, fs - 2) : fs;
      const lst = hook('labelStyle', m, s, { inter, small }) || {};
      const rc = labelPlacement(m, s, geo, lfs, lst.upper ? 1.25 : 1);
      if (!rc) continue;
      if (placed.some((q) => rc.x0 < q.x1 + 3 && rc.x1 > q.x0 - 3 && rc.y0 < q.y1 + 2 && rc.y1 > q.y0 - 2)) continue;
      placed.push(rc);
      const nm = displayName(s), [ux] = DIRS[rc.dir];
      const anchor = ux > 0 ? 'start' : ux < 0 ? 'end' : 'middle';
      const tx = ux > 0 ? rc.x0 + 2 : ux < 0 ? rc.x1 - 2 : (rc.x0 + rc.x1) / 2;
      const weight = lst.weight || (inter ? 700 : small ? 400 : 500);
      const ink = opts.exportColors ? ` fill="${th.ink}" stroke="${th.halo}"` : '';
      out += `<text class="st-label" x="${tx.toFixed(1)}" y="${(rc.y0 + lfs).toFixed(1)}" font-size="${lfs}" font-weight="${weight}" text-anchor="${anchor}" data-st="${esc(s.id)}"${ink}>${esc(lst.upper ? nm.main.toUpperCase() : nm.main)}</text>`;
      if (nm.sub) out += `<text class="st-label" x="${tx.toFixed(1)}" y="${(rc.y0 + lfs * 2.1).toFixed(1)}" font-size="${(lfs * 0.9).toFixed(1)}" text-anchor="${anchor}"${ink}>${esc(nm.sub)}</text>`;
      out += hookAll('labelExtra', m, s, rc, { G, opts, anchor, fs: lfs });
    }
    // frequency badges, placed on the middle of each route
    const badges = [];
    if (settings.showFreq) for (const g of geo) {
      const l = g.line, txt = freqText(l);
      if (!txt || !l.showFreq || g.poly.length < 2) continue;
      let total = 0; const segs = [];
      for (let i = 0; i < g.poly.length - 1; i++) { const len = Math.hypot(g.poly[i + 1].x - g.poly[i].x, g.poly[i + 1].y - g.poly[i].y); segs.push(len); total += len; }
      const at = (frac) => { let target = total * frac, i = 0; while (i < segs.length - 1 && target > segs[i]) { target -= segs[i]; i++; } const a = g.poly[i], b = g.poly[i + 1], f = segs[i] ? target / segs[i] : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; };
      const w = txt.length * 7 + 14;
      // try the middle first, then further along, so badges of routes sharing a corridor do not stack
      let pos = null;
      for (const frac of [0.5, 0.35, 0.65, 0.22, 0.78]) { const c = at(frac); if (!badges.some((q) => Math.abs(q.x - c.x) < (q.w + w) / 2 + 4 && Math.abs(q.y - c.y) < 26)) { pos = c; break; } }
      if (!pos) continue;
      badges.push({ x: pos.x, y: pos.y, w });
      out += `<g transform="translate(${(pos.x - w / 2).toFixed(1)} ${(pos.y - 11).toFixed(1)})"><g class="freq" data-line="${esc(l.id)}"><rect width="${w}" height="22" rx="11" fill="${l.color}" stroke="#FFFFFF" stroke-width="2"/><text x="${w / 2}" y="15" font-size="12" font-weight="700" text-anchor="middle" fill="${inkFor(l.color)}">${esc(txt)}</text></g></g>`;
    }
    out += hookAll('svgOver', m, { G, geo, opts });
    for (const lb of m.labels) {
      out += `<text class="map-label" data-label="${esc(lb.id)}" x="${lb.x * G}" y="${lb.y * G}" font-size="${lb.size}"${opts.exportColors ? ` fill="${th.sub}"` : ''}>${esc(lb.text)}</text>`;
    }
    return { svg: out, geo };
  }
  function isInterchangeIn(m, s) {
    if (s.interchange === 'yes') return true;
    if (s.interchange === 'no') return false;
    return new Set(m.lines.filter((l) => l.path.includes(s.id) && !(l.skip && l.skip.includes(s.id))).map((l) => String(l.id).split('~b')[0])).size > 1;
  }
  function bounds(m) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const s of Object.values(m.stations)) add(s.x * G, s.y * G);
    for (const l of m.lines) for (const r of l.path) if (r[0] === '@') { const p = nodePosIn(m, r); add(p.x * G, p.y * G); }
    for (const lb of m.labels) { add(lb.x * G, lb.y * G); add(lb.x * G + lb.text.length * lb.size * 0.55, lb.y * G); }
    if (!Number.isFinite(x0)) return { x0: -200, y0: -200, x1: 200, y1: 200 };
    return { x0, y0, x1, y1 };
  }

  // ---------- rendering ----------
  const svgEl = $('map'), vp = $('viewport');
  function render() {
    document.documentElement.lang = settings.lang === 'en' ? 'en' : 'yue-Hant';
    const D = viewMap(dm());
    const { svg } = buildMapSvg(D, { editor: true });
    let sel = '';
    if (selection && selection.type === 'station') for (const id of selection.ids) { const s = D.stations[id]; if (s) sel += `<circle class="sel-ring" cx="${s.x * G}" cy="${s.y * G}" r="16"/>`; }
    if (selection && (selection.type === 'edge' || selection.type === 'line')) {
      const lid = selection.lineId || selection.id;
      const g = computeGeometry(D).find((x) => x.line.id === lid);
      if (g) {
        const pts = selection.type === 'edge' ? (g.edges.find((e) => e.index === selection.index) || {}).pts : g.poly;
        if (pts) sel += `<path d="${polyD(pts)}" fill="none" stroke="var(--md-primary)" stroke-width="3" stroke-dasharray="6 4"/>`;
      }
    }
    if (selection && selection.type === 'label') { const lb = D.labels.find((l) => l.id === selection.id); if (lb) sel += `<rect class="sel-ring" x="${lb.x * G - 4}" y="${lb.y * G - lb.size - 2}" width="${lb.text.length * lb.size * 0.56 + 8}" height="${lb.size + 10}" rx="4"/>`; }
    const grid = settings.grid && !isGeo() ? `<rect x="-20000" y="-20000" width="40000" height="40000" fill="url(#gridPat)"/>` : '';
    applyTransform();
    vp.innerHTML = grid + liveStopsSvg(D) + svg + sel;
    renderTiles();
    scheduleLiveStops();
    hookAll('afterRender', D);
    document.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === settings.layout)));
    svgEl.className.baseVal = 'tool-' + tool + (drag && drag.kind === 'pan' ? ' panning' : '');
    const n = Object.keys(map.stations).length;
    $('undoBtn').disabled = !past.length; $('redoBtn').disabled = !future.length;
    if (!drag) setStatus(`${t('stations')}: ${n} · ${t('lineCount')}: ${map.lines.length} · ${t('zoom')}: ${Math.round(view.k * 100)}%`, true);
  }
  function applyTransform() { vp.setAttribute('transform', isGeo() ? `translate(${view.tx} ${view.ty})` : `translate(${view.tx} ${view.ty}) scale(${view.k})`); }
  const zoomLimits = () => (isGeo() ? [0.04, 64] : [0.08, 4]);
  function zoomBy(f, mx, my) {
    const r = svgEl.getBoundingClientRect(); if (mx === undefined) { mx = r.width / 2; my = r.height / 2; }
    const [lo, hi] = zoomLimits(), k = Math.min(hi, Math.max(lo, view.k * f));
    view.tx = mx - (mx - view.tx) * (k / view.k); view.ty = my - (my - view.ty) * (k / view.k); view.k = k; render();
  }
  function setStatus(msg, quiet) { $('statusBar').textContent = msg; if (!quiet) toast(msg); }
  let toastTimer = 0;
  let toastFn = null;
  /** Material snackbar. With undoable set, it offers Undo for the last edit. */
  function toast(msg, undoable, retry) {
    const el = $('toast'), btn = $('toastAction');
    el.querySelector('.sb-text').textContent = msg;
    toastFn = retry || (undoable ? undo : null); btn.hidden = !toastFn; btn.textContent = retry ? t('retry') : t('undo');
    if (retry) undoable = true;
    el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), undoable ? 5000 : 2800);
  }
  $('toastAction').addEventListener('click', () => { if (toastFn) toastFn(); $('toast').classList.remove('show'); });
  function fillIcons(root) { (root || document).querySelectorAll('[data-ic]').forEach((n) => { if (!n.firstChild) n.innerHTML = window.icon(n.dataset.ic, n.closest('.btn,.seg-check,.tf-select') ? 18 : 24); }); }
  // ripple on press, from the pointer position
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn,.icon-btn,.fab,.li-main,.menu button,.segmented button,.rail-ind,.chip-x');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
    const sp = document.createElement('span'); sp.className = 'ripple';
    sp.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(sp); setTimeout(() => sp.remove(), 600);
  });

  function fit() {
    const b = bounds(isGeo() ? dm(1) : map), r = svgEl.getBoundingClientRect();
    const w = Math.max(1, b.x1 - b.x0 + 160), h = Math.max(1, b.y1 - b.y0 + 160);
    const [lo, hi] = zoomLimits();
    view.k = Math.min(isGeo() ? 8 : 3, Math.max(lo, Math.min(hi, Math.min(r.width / w, r.height / h))));
    view.tx = r.width / 2 - ((b.x0 + b.x1) / 2) * view.k;
    view.ty = r.height / 2 - ((b.y0 + b.y1) / 2) * view.k;
    render();
  }
  function centerOn(x, y) { const r = svgEl.getBoundingClientRect(); view.k = Math.max(view.k, isGeo() ? 2 : 1); view.tx = r.width / 2 - x * G * view.k; view.ty = r.height / 2 - y * G * view.k; render(); }
  function centerOnStation(s) { const g = isGeo() ? stGeo(s) : s; centerOn(g.x, g.y); }

  // ---------- map background (OpenStreetMap tiles) ----------
  const tilesEl = $('tiles'); const tileEls = new Map();
  const tileZoom = (k) => Math.max(2, Math.min(19, Math.round(Z0 + Math.log2(k === undefined ? view.k : k))));
  function renderTiles() {
    const on = isGeo() && settings.background === 'osm';
    $('attrib').hidden = !on;
    tilesEl.style.opacity = settings.bgOpacity;
    if (!on) { tilesEl.replaceChildren(); tileEls.clear(); return; }
    const r = svgEl.getBoundingClientRect(), z = tileZoom(), sc = 2 ** (Z0 - z), span = TILE * sc, n = 2 ** z;
    const px0 = (0 - view.tx) / view.k + OPX.x, px1 = (r.width - view.tx) / view.k + OPX.x;
    const py0 = (0 - view.ty) / view.k - 4 * G + OPX.y, py1 = (r.height - view.ty) / view.k - 4 * G + OPX.y;
    const i0 = Math.floor(px0 / span), i1 = Math.floor(px1 / span), j0 = Math.max(0, Math.floor(py0 / span)), j1 = Math.min(n - 1, Math.floor(py1 / span));
    const want = new Set();
    if ((i1 - i0 + 1) * (j1 - j0 + 1) <= 300) {
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const key = z + '/' + (((i % n) + n) % n) + '/' + j + '@' + i; want.add(key);
        let el = tileEls.get(key);
        if (!el) {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
          el.setAttribute('href', OSM_TILES + z + '/' + (((i % n) + n) % n) + '/' + j + '.png');
          el.setAttribute('preserveAspectRatio', 'none');
          tilesEl.appendChild(el); tileEls.set(key, el);
        }
        const s = span * view.k;
        el.setAttribute('x', ((i * span - OPX.x) * view.k + view.tx).toFixed(1));
        el.setAttribute('y', ((j * span - OPX.y + 4 * G) * view.k + view.ty).toFixed(1));
        el.setAttribute('width', (s + 0.6).toFixed(1)); el.setAttribute('height', (s + 0.6).toFixed(1));
      }
    }
    for (const [key, el] of tileEls) if (!want.has(key)) { el.remove(); tileEls.delete(key); }
  }

  // ---------- real stops from OpenStreetMap, to draw routes onto ----------
  let liveStops = [], liveKey = '', liveTimer = 0, liveBusy = false, liveFailed = false;
  function viewBBox() {
    const r = svgEl.getBoundingClientRect();
    const a = gridToLatLon({ x: (0 - view.tx) / view.k / G, y: (0 - view.ty) / view.k / G });
    const b = gridToLatLon({ x: (r.width - view.tx) / view.k / G, y: (r.height - view.ty) / view.k / G });
    return { s: b.lat, w: a.lon, n: a.lat, e: b.lon };
  }
  const liveActive = () => isGeo() && settings.liveStops && tileZoom() >= 15;
  function scheduleLiveStops() {
    clearTimeout(liveTimer);
    if (!liveActive()) { if (liveStops.length) { liveStops = []; liveKey = ''; render(); } return; }
    liveTimer = setTimeout(fetchLiveStops, 700);
  }
  async function fetchLiveStops() {
    if (!liveActive() || liveBusy) return;
    const bb = viewBBox(), box = [bb.s, bb.w, bb.n, bb.e].map((v) => v.toFixed(4)).join(',');
    if (box === liveKey) return;
    liveBusy = true;
    const q = `[out:json][timeout:20];(node["highway"="bus_stop"](${box});node["public_transport"="platform"](${box});node["railway"~"^(station|halt|tram_stop)$"](${box}););out 400;`;
    try {
      // Public Overpass servers are often busy: try each in turn, the person's own server first.
      const custom = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)[^\s"'<>]*$/.test(settings.overpassUrl || '') ? [settings.overpassUrl] : [];
      let j = null, lastErr = null;
      for (const ep of custom.concat(OVERPASS)) {
        try {
          const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 60000);
          const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
          clearTimeout(timer);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          j = await res.json(); break;
        } catch (e) { lastErr = e; }
      }
      if (!j) throw lastErr || new Error('no server');
      liveStops = (j.elements || []).filter((e) => Number.isFinite(e.lat) && e.tags).slice(0, 400)
        .map((e) => ({ id: String(e.id), name: String(e.tags.name || e.tags.ref || t('unnamedStop')).slice(0, 80), lat: e.lat, lon: e.lon }));
      liveKey = box; liveFailed = false; render();
    } catch {
      if (!liveFailed) toast(t('liveStopsFailed'), false, () => { liveKey = ''; liveFailed = false; fetchLiveStops(); });
      liveFailed = true;
    } finally { liveBusy = false; }
  }
  function liveStopsSvg(D) {
    if (!D._geo || !liveStops.length) return '';
    const used = new Set(Object.values(map.stations).map((s) => s.osm).filter(Boolean));
    return liveStops.filter((s) => !used.has(s.id)).map((s) => {
      const g = geoGrid(s.lat, s.lon);
      return `<g class="osm-stop" data-osm="${esc(s.id)}"><circle cx="${(g.x * D._k * G).toFixed(1)}" cy="${(g.y * D._k * G).toFixed(1)}" r="6"/><title>${esc(s.name)}</title></g>`;
    }).join('');
  }
  function addOsmStop(osmId) {
    const s = liveStops.find((x) => x.id === osmId); if (!s) return null;
    const g = geoGrid(s.lat, s.lon);
    return addStation(g, { name: s.name, kind: 'stop', osm: s.id, lat: s.lat, lon: s.lon });
  }

  // ---------- panels ----------
  function renderIssues() {
    const issues = [];
    const names = new Map();
    const pos = new Map();
    for (const s of Object.values(map.stations)) {
      if (!servingLines(s.id).length) issues.push({ id: s.id, msg: t('orphan') + ': ' + s.name });
      const key = s.name.toLowerCase(); names.set(key, (names.get(key) || []).concat(s.id));
      const pk = s.x + ',' + s.y; pos.set(pk, (pos.get(pk) || []).concat(s.id));
    }
    for (const [, ids] of names) if (ids.length > 1) issues.push({ id: ids[0], msg: t('dupName') + ': ' + map.stations[ids[0]].name + ' (' + ids.length + ')' });
    for (const [, ids] of pos) if (ids.length > 1) issues.push({ id: ids[0], msg: t('overlap') + ': ' + ids.map((i) => map.stations[i].name).join(', ') });
    for (const l of map.lines) if (l.path.length < 2) issues.push({ line: l.id, msg: t('shortLine') + ': ' + l.name });
    for (const f of X.issues) { try { issues.push(...(f(map) || [])); } catch (err) { console.error('extension issues', err); } }
    $('issueList').innerHTML = issues.length ? issues.slice(0, 60).map((i) => `<li><button type="button" ${i.id ? `data-goto="${esc(i.id)}"` : `data-pickline="${esc(i.line)}"`}>${esc(i.msg)}</button></li>`).join('') : `<li class="hint">${esc(t('noIssues'))}</li>`;
  }
  function runSearch() {
    const q = $('searchInput').value, mode = $('searchMode').value, ic = $('searchCase').checked;
    const status = $('searchStatus'), list = $('searchResults');
    status.classList.remove('err');
    if (!q) { status.textContent = ''; list.innerHTML = ''; if (window.RxBuilder) window.RxBuilder.render(); return; }
    let test;
    if (mode === 'regex') {
      if (q.length > 200) { status.textContent = t('invalidPattern'); status.classList.add('err'); list.innerHTML = ''; return; }
      try { const re = new RegExp(q, window.RxBuilder ? window.RxBuilder.flags() : (ic ? 'iu' : 'u')); test = (s) => re.test(s); } catch (e) { status.textContent = t('invalidPattern') + ': ' + e.message; status.classList.add('err'); list.innerHTML = ''; if (window.RxBuilder) window.RxBuilder.render(); return; }
    } else { const needle = ic ? q.toLowerCase() : q; test = (s) => (ic ? s.toLowerCase() : s).includes(needle); }
    const hits = Object.values(map.stations).filter((s) => test(s.name) || (s.nameZh && test(s.nameZh))).sort((a, b) => a.name.localeCompare(b.name));
    status.textContent = hits.length ? hits.length + ' ' + t('matches') : t('noMatches');
    if (window.RxBuilder) window.RxBuilder.render();
    list.innerHTML = hits.slice(0, 50).map((s) => `<li><button type="button" data-goto="${esc(s.id)}">${esc(s.name)}${s.nameZh ? ' · ' + esc(s.nameZh) : ''}</button></li>`).join('');
  }

  const TOOLS = [['select', 'V', 'arrow_selector_tool'], ['station', 'S', 'add_location_alt'], ['line', 'L', 'conversion_path'], ['label', 'T', 'title'], ['erase', 'E', 'ink_eraser']];
  const ic = (n, s) => window.icon(n, s);
  function renderTools() {
    $('tools').innerHTML = TOOLS.map(([id, key, glyph]) => {
      const lbl = { select: t('select'), station: t('station'), line: t('drawLine'), label: t('label'), erase: t('erase') }[id];
      return `<button type="button" class="rail-item" data-tool="${id}" aria-pressed="${tool === id}" aria-keyshortcuts="${key}" title="${esc(lbl)} (${key})"><span class="rail-ind">${ic(glyph)}</span><span class="rail-label">${esc(lbl)}</span></button>`;
    }).join('');
  }
  const styleName = (st) => t('style_' + st);
  function renderLines() {
    $('lineList').innerHTML = map.lines.map((l, i) => {
      const stops = l.path.filter((r) => r[0] !== '@').length;
      const on = activeLineId === l.id, f = freqText(l);
      return `<li class="li${on ? ' sel' : ''}${l.visible ? '' : ' off'}" style="--i:${Math.min(i, 20)}"><button type="button" class="li-main" data-pickline="${esc(l.id)}" aria-pressed="${on}">` +
        `<span class="swatch s-${l.style}" style="--c:${l.color}"></span><span class="li-text"><span class="li-head">${esc(lineName(l))}</span><span class="li-sub">${esc(styleName(l.style))} · ${stops} ${esc(t('stops'))}</span></span>` +
        (f ? `<span class="chip-sm">${esc(f)}</span>` : '') + `</button>` +
        `<button type="button" class="icon-btn" data-eye="${esc(l.id)}" aria-pressed="${!l.visible}" aria-label="${esc((l.visible ? t('hide') : t('show')) + ' ' + l.name)}" title="${esc(l.visible ? t('hide') : t('show'))}">${ic(l.visible ? 'visibility' : 'visibility_off')}</button></li>`;
    }).join('');
  }
  const lineName = (l) => (settings.lang === 'yue' && l.nameZh) ? l.nameZh : (settings.lang === 'both' && l.nameZh) ? l.name + ' · ' + l.nameZh : l.name;
  // Material Design 3 form parts
  const tf = (label, input, extra) => `<label class="tf${extra || ''}"><span class="tf-label">${esc(label)}</span>${input}</label>`;
  const sel = (f, opts, value) => `<span class="tf-select"><select data-f="${f}">${opts.map(([v, n]) => `<option value="${esc(v)}"${String(value) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>${ic('arrow_drop_down')}</span>`;
  const sw = (f, checked, label) => `<label class="switch-row"><span>${esc(label)}</span><input type="checkbox" role="switch" class="switch" data-f="${f}"${checked ? ' checked' : ''}></label>`;
  const btn = (act, label, kind, glyph) => `<button type="button" class="btn ${kind || 'tonal'}" data-act="${act}">${glyph ? ic(glyph, 18) : ''}<span>${esc(label)}</span></button>`;
  function nearbyStations(s) {
    const g = stGeo(s);
    return Object.values(map.stations).filter((o) => o.id !== s.id).map((o) => { const h = stGeo(o); return [o, Math.hypot(h.x - g.x, h.y - g.y)]; })
      .filter(([, d]) => d < 1.2).sort((a, b) => a[1] - b[1]).slice(0, 12);
  }
  const freqField = (key, label, v) => tf(label, `<input type="number" min="1" max="240" inputmode="numeric" data-f="ln.${key}" value="${v || ''}" placeholder="-">`, ' tf-suffix" data-suffix="' + esc(t('minShort')));
  function renderInspector() {
    const el = $('inspector');
    const active = activeLineId && lineById(activeLineId);
    let head = `<div class="insp-active"><span class="li-sub">${esc(t('activeLine'))}</span><span class="li-head">${active ? esc(lineName(active)) : esc(t('noActiveLine'))}</span></div>`;
    if (!selection) { el.innerHTML = head + `<p class="empty-state">${ic('info')}<span>${esc(t('nothingSelected'))}</span></p>`; return; }
    let h = '';
    if (selection.type === 'station' && selection.ids.length === 1) {
      const s = map.stations[selection.ids[0]];
      const dirOpts = [['auto', t('auto')]].concat(DIR_ORDER.map((d) => [d, d]));
      const chips = servingLines(s.id).map((l) => `<span class="chip"><span class="swatch-dot" style="background:${l.color}"></span>${esc(lineName(l))}</span>`).join('');
      const links = (map.transfers || []).map((tr, i) => [tr, i]).filter(([tr]) => tr.a === s.id || tr.b === s.id)
        .map(([tr, i]) => { const o = map.stations[tr.a === s.id ? tr.b : tr.a]; return `<span class="chip">${ic('swap_horiz', 18)}${esc(o.name)}<button type="button" class="chip-x" data-unlink="${i}" aria-label="${esc(t('unlink') + ' ' + o.name)}">${ic('close', 18)}</button></span>`; }).join('');
      const near = nearbyStations(s).filter(([o]) => !(map.transfers || []).some((tr) => (tr.a === s.id && tr.b === o.id) || (tr.b === s.id && tr.a === o.id)));
      h = `<div class="insp">${tf(t('name'), `<input type="text" data-f="st.name" value="${esc(s.name)}" maxlength="80">`)}
        ${tf(t('nameZh'), `<input type="text" data-f="st.nameZh" value="${esc(s.nameZh)}" maxlength="80" lang="yue-Hant">`)}
        <div class="two">${tf(t('stopKind'), sel('st.kind', [['station', t('kind_station')], ['stop', t('kind_stop')]], s.kind))}
        ${tf(t('interchange'), sel('st.interchange', [['auto', t('auto')], ['yes', t('yes')], ['no', t('no')]], s.interchange))}</div>
        ${tf(t('labelPos'), sel('st.label', dirOpts, s.label))}
        <p class="supporting">${s.lat !== undefined ? `${ic('my_location', 18)} ${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}${s.osm ? ' · OSM ' + esc(s.osm) : ''}` : esc(t('noCoords'))}</p>
        <h3 class="title-sm">${esc(t('servedBy'))}</h3><div class="chips">${chips || `<span class="supporting">${esc(t('noLines'))}</span>`}</div>
        <h3 class="title-sm">${esc(t('transfers'))}</h3><div class="chips">${links || `<span class="supporting">${esc(t('noTransfers'))}</span>`}</div>
        ${near.length ? tf(t('linkTransfer'), sel('st.link', [['', t('chooseStation')]].concat(near.map(([o]) => [o.id, o.name])), '')) : ''}
        <div class="actions">${btn('addToLine', t('addToLine'), 'tonal', 'add')}${btn('delSel', t('delete'), 'danger', 'delete')}</div></div>`;
      if (!active) h = h.replace(`data-act="addToLine"`, `data-act="addToLine" disabled`);
    } else if (selection.type === 'station') {
      h = `<div class="insp"><p class="title-md"><strong>${selection.ids.length}</strong> ${esc(t('selected'))}</p><div class="actions">
        ${btn('alignH', t('alignH'), 'tonal')}${btn('alignV', t('alignV'), 'tonal')}${btn('delSel', t('delete'), 'danger', 'delete')}</div></div>`;
    } else if (selection.type === 'line' || selection.type === 'edge') {
      const l = lineById(selection.lineId || selection.id);
      const f = freqBands(l.freq);
      h = `<div class="insp"><div class="insp-title"><span class="swatch s-${l.style}" style="--c:${l.color}"></span><span class="title-md">${esc(lineName(l))}</span><span class="supporting">${l.path.filter((r) => r[0] !== '@').length} ${esc(t('stops'))}</span></div>
        ${tf(t('name'), `<input type="text" data-f="ln.name" value="${esc(l.name)}" maxlength="80">`)}
        ${tf(t('nameZh'), `<input type="text" data-f="ln.nameZh" value="${esc(l.nameZh)}" maxlength="80" lang="yue-Hant">`)}
        ${tf(t('serviceType'), sel('ln.style', STYLES.map((v) => [v, styleName(v)]), l.style))}
        <div class="two">${tf(t('color'), `<input type="color" data-f="ln.color" value="${l.color}">`, ' tf-color')}${tf(t('width') + ' ' + l.width, `<input type="range" min="3" max="16" data-f="ln.width" value="${l.width}">`, ' tf-range')}</div>
        <h3 class="title-sm">${ic('schedule', 18)} ${esc(t('frequencyByTime'))}</h3>
        <div class="two">${freqField('freqPeak', t('bandPeak'), f.peak)}${freqField('freqMidday', t('bandMidday'), f.midday)}</div>
        <div class="two">${freqField('freqEvening', t('bandEvening'), f.evening)}${freqField('freqWeekend', t('bandWeekend'), f.weekend)}</div>
        ${sw('ln.showFreq', l.showFreq, t('showFreqLine'))}
        ${l.note ? `<p class="supporting">${esc(l.note)}</p>` : ''}
        <div class="actions">${btn('moveUp', t('moveUp'), 'text')}${btn('moveDown', t('moveDown'), 'text')}${btn('reverse', t('reverse'), 'text', 'sync_alt')}${btn('delLine', t('delete'), 'danger', 'delete')}</div>`;
      if (selection.type === 'edge') {
        const mode = l.bends[selection.index] || 'early';
        h += `<h3 class="title-sm">${esc(t('segment'))} ${selection.index + 1}</h3>${isGeo() ? '' : tf(t('bend'), sel('edge.bend', [['early', t('bendEarly')], ['late', t('bendLate')]], mode))}
          <div class="actions">${btn('insertStation', t('insertStation'), 'tonal', 'add_location_alt')}${btn('eraseEdge', t('erase'), 'danger', 'ink_eraser')}</div>`;
      }
      h += '</div>';
    } else if (selection.type === 'label') {
      const lb = map.labels.find((x) => x.id === selection.id);
      h = `<div class="insp">${tf(t('text'), `<input type="text" data-f="lb.text" value="${esc(lb.text)}" maxlength="300">`)}
        ${tf(t('size') + ' ' + lb.size, `<input type="range" min="8" max="48" data-f="lb.size" value="${lb.size}">`, ' tf-range')}
        <div class="actions">${btn('delSel', t('delete'), 'danger', 'delete')}</div></div>`;
    }
    el.innerHTML = head + h + hookAll('inspector', selection, map);
  }
  function renderPanels() { renderTools(); renderLines(); renderIssues(); renderInspector(); runSearch(); }
  function applyI18n() {
    window.I18N.setLang(settings.lang);
    document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    for (const [id, key] of [['undoBtn', 'undo'], ['redoBtn', 'redo'], ['settingsBtn', 'settings'], ['fitBtn', 'fit'], ['zoomInBtn', 'zoomIn'], ['zoomOutBtn', 'zoomOut'], ['bgBtn', 'background']]) { $(id).setAttribute('aria-label', t(key)); $(id).title = t(key); }
    $('layoutSeg').setAttribute('aria-label', t('layout'));
    document.querySelectorAll('#exportMenu button').forEach((b, i) => b.style.setProperty('--n', i));
    if (window.RxBuilder) window.RxBuilder.relabel();
    $('searchInput').placeholder = t('searchPlaceholder');
    $('map').setAttribute('aria-label', t('appName'));
    renderPanels(); render();
  }
  function applyTheme() {
    if (settings.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
  }
  function saveSettings() { store.set(STORE_SET, settings); }

  // ---------- edits ----------
  function snapPt(p) { if (isGeo()) return { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }; return settings.snap ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: Math.round(p.x * 4) / 4, y: Math.round(p.y * 4) / 4 }; }
  function worldFromEvent(e) { const r = svgEl.getBoundingClientRect(); return { x: (e.clientX - r.left - view.tx) / view.k / G, y: (e.clientY - r.top - view.ty) / view.k / G }; }
  /** p is in the current layout's grid units: geographic in the geographic layout, else schematic. */
  function addStation(p, extra) {
    const id = uid('st'); const n = Object.keys(map.stations).length + 1;
    const st = { id, name: 'Station ' + n, nameZh: '', label: 'auto', interchange: 'auto', kind: 'station' };
    const f = fits(), hasGeo = Object.values(map.stations).some((s) => s.lat !== undefined);
    if (isGeo()) { const ll = gridToLatLon(p), g = f.toGrid(p); Object.assign(st, { x: Math.round(g.x * 2) / 2, y: Math.round(g.y * 2) / 2, lat: ll.lat, lon: ll.lon }); }
    else { Object.assign(st, { x: p.x, y: p.y }); if (hasGeo) { const ll = gridToLatLon(f.toGeo(p)); st.lat = ll.lat; st.lon = ll.lon; } }
    map.stations[id] = Object.assign(st, extra || {});
    return id;
  }
  function moveStationGeo(st, g) { const ll = gridToLatLon(g); st.lat = ll.lat; st.lon = ll.lon; }
  const PALETTE = ['#1F5FBF', '#C8102E', '#0B6E4F', '#E8A317', '#7B2D8E', '#00838F', '#6D4C41', '#D81B60'];
  function newLine() {
    checkpoint();
    const l = { id: uid('line'), name: t('newLine') + ' ' + (map.lines.length + 1), nameZh: '', color: PALETTE[map.lines.length % PALETTE.length], width: 8, style: 'solid', visible: true, path: [], bends: {}, freq: { peak: null, midday: null, evening: null, weekend: null }, showFreq: true, note: '' };
    map.lines.push(l); activeLineId = l.id; selection = { type: 'line', id: l.id };
    tool = 'line'; changed(); beep(523);
    return l;
  }
  function appendToActive(ref) {
    let l = activeLineId && lineById(activeLineId);
    if (!l) l = newLine();
    if (l.path[l.path.length - 1] === ref) return false;
    checkpoint();
    l.path.push(ref); return true;
  }
  function deleteStations(ids) {
    checkpoint();
    for (const id of ids) {
      delete map.stations[id];
      map.transfers = (map.transfers || []).filter((tr) => tr.a !== id && tr.b !== id);
      for (const l of map.lines) {
        const nb = {};
        const np = [];
        l.path.forEach((r, i) => { if (r !== id) { if (l.bends[i]) nb[np.length] = l.bends[i]; np.push(r); } });
        l.path = np; l.bends = nb;
      }
    }
    selection = null;
  }
  function eraseEdge(lineId, index) {
    const l = lineById(lineId); if (!l) return;
    checkpoint();
    const left = l.path.slice(0, index + 1), right = l.path.slice(index + 1);
    const bendsL = {}, bendsR = {};
    for (const [k, v] of Object.entries(l.bends)) { const i = +k; if (i < index) bendsL[i] = v; else if (i > index) bendsR[i - index - 1] = v; }
    if (left.length < 2) { l.path = right; l.bends = bendsR; }
    else if (right.length < 2) { l.path = left; l.bends = bendsL; }
    else {
      l.path = left; l.bends = bendsL;
      const copy = Object.assign({}, l, { id: uid('line'), name: l.name + ' (2)', path: right, bends: bendsR, freq: Object.assign({}, l.freq) });
      if (l.skip) { copy.skip = l.skip.filter((x) => right.includes(x)); l.skip = l.skip.filter((x) => left.includes(x)); }
      delete copy.branches;
      map.lines.splice(map.lines.indexOf(l) + 1, 0, copy);
    }
    selection = { type: 'line', id: l.id };
  }

  // ---------- pointer interaction ----------
  svgEl.addEventListener('pointerdown', (e) => {
    svgEl.focus({ preventScroll: true });
    const target = e.target.closest('[data-st],[data-edge],[data-label],[data-osm]');
    const osmId = target && target.dataset.osm;
    const p = worldFromEvent(e);
    if (e.button === 1 || (e.button === 0 && spaceDown)) { startPan(e); return; }
    if (hook('pointer', e, p, tool, target)) return;
    if (e.button !== 0) return;
    const stId = target && target.dataset.st, edge = target && target.dataset.edge !== undefined ? { lineId: target.dataset.line, index: +target.dataset.edge } : null;
    const lbId = target && target.dataset.label;
    if (tool === 'select') {
      if (osmId) { const ls = liveStops.find((x) => x.id === osmId); if (ls) toast(ls.name + ' · ' + t('osmStopHint')); return; }
      if (stId) {
        if (e.shiftKey && selection && selection.type === 'station') {
          selection.ids = selection.ids.includes(stId) ? selection.ids.filter((x) => x !== stId) : selection.ids.concat(stId);
          if (!selection.ids.length) selection = null;
        } else if (!(selection && selection.type === 'station' && selection.ids.includes(stId))) selection = { type: 'station', ids: [stId] };
        if (selection) startDrag(e, 'stations', p);
      } else if (lbId) { selection = { type: 'label', id: lbId }; startDrag(e, 'label', p); }
      else if (edge) { selection = { type: 'edge', lineId: edge.lineId, index: edge.index }; activeLineId = edge.lineId; }
      else { startPan(e, true); return; }
      renderPanels(); render();
    } else if (tool === 'station') {
      if (osmId) { checkpoint(); const id = addOsmStop(osmId); if (id) { selection = { type: 'station', ids: [id] }; beep(660); } }
      else if (stId) selection = { type: 'station', ids: [stId] };
      else if (edge) { insertStationOnEdge(edge.lineId, edge.index, snapPt(p)); }
      else { checkpoint(); const id = addStation(snapPt(p)); selection = { type: 'station', ids: [id] }; beep(660); }
      changed();
    } else if (tool === 'line') {
      if (osmId) { let l = activeLineId && lineById(activeLineId); if (!l) l = newLine(); checkpoint(); const id = addOsmStop(osmId); if (id) { l.path.push(id); selection = { type: 'station', ids: [id] }; toast(t('stopAdded') + ': ' + map.stations[id].name, true); beep(587); } }
      else if (stId) { if (appendToActive(stId)) beep(587); selection = { type: 'station', ids: [stId] }; }
      else if (edge) { activeLineId = edge.lineId; selection = { type: 'edge', lineId: edge.lineId, index: edge.index }; }
      else {
        const sp = snapPt(p);
        if (e.altKey && !isGeo()) appendToActive('@' + sp.x + ',' + sp.y);
        else { let l = activeLineId && lineById(activeLineId); if (!l) l = newLine(); checkpoint(); const id = addStation(sp); l.path.push(id); selection = { type: 'station', ids: [id] }; }
        beep(587);
      }
      changed();
    } else if (tool === 'label') {
      if (lbId) selection = { type: 'label', id: lbId };
      else {
        checkpoint(); const sp = snapPt(p); let lb;
        if (isGeo()) { const ll = gridToLatLon(sp), g = fits().toGrid(sp); lb = { id: uid('lbl'), x: Math.round(g.x), y: Math.round(g.y), lat: ll.lat, lon: ll.lon, text: 'Label', size: 14 }; }
        else lb = { id: uid('lbl'), x: sp.x, y: sp.y, text: 'Label', size: 14 };
        map.labels.push(lb); selection = { type: 'label', id: lb.id };
      }
      changed();
    } else if (tool === 'erase') {
      if (stId) { deleteStations([stId]); beep(220); toast(t('deleted'), true); }
      else if (lbId) { checkpoint(); map.labels = map.labels.filter((l) => l.id !== lbId); selection = null; beep(220); }
      else if (edge) { eraseEdge(edge.lineId, edge.index); beep(220); toast(t('segmentErased'), true); }
      changed();
    }
  });
  function startPan(e, clearOnClick) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty, moved: false, clearOnClick }; svgEl.setPointerCapture(e.pointerId); render(); }
  function startDrag(e, kind, p) {
    const geo = isGeo();
    const orig = kind === 'stations'
      ? selection.ids.map((id) => { const st = map.stations[id], g = geo ? stGeo(st) : st; return { id, x: g.x, y: g.y }; })
      : [{ id: selection.id, ...(() => { const lb = map.labels.find((l) => l.id === selection.id); const g = geo && lb.lat !== undefined ? geoGrid(lb.lat, lb.lon) : lb; return { x: g.x, y: g.y }; })() }];
    drag = { kind, start: p, orig, moved: false };
    svgEl.setPointerCapture(e.pointerId);
  }
  svgEl.addEventListener('pointermove', (e) => {
    if (hook('pointermove', e, worldFromEvent(e))) return;
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.tx = drag.tx + dx; view.ty = drag.ty + dy;
      applyTransform(); renderTiles();
      return;
    }
    const p = worldFromEvent(e);
    let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    const d = snapPt({ x: dx, y: dy }); dx = d.x; dy = d.y;
    if (!drag.moved && (dx || dy)) { checkpoint(); drag.moved = true; }
    if (!drag.moved) return;
    for (const o of drag.orig) {
      const obj = drag.kind === 'stations' ? map.stations[o.id] : map.labels.find((l) => l.id === o.id);
      if (!obj) continue;
      if (isGeo()) moveStationGeo(obj, { x: o.x + dx, y: o.y + dy });
      else { obj.x = o.x + dx; obj.y = o.y + dy; }
    }
    render();
  });
  svgEl.addEventListener('pointerup', (e) => {
    if (hook('pointerup', e, worldFromEvent(e))) return;
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'pan' && !d.moved && d.clearOnClick) { selection = null; renderPanels(); }
    if (d.kind !== 'pan' && d.moved) changed(); else render();
  });
  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svgEl.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  function insertStationOnEdge(lineId, index, near) {
    const l = lineById(lineId); if (!l) return;
    let a, b;
    if (isGeo()) { const D1 = dm(1), dl = D1.lines[map.lines.indexOf(l)]; a = nodePosIn(D1, dl.path[index]); b = nodePosIn(D1, dl.path[index + 1]); }
    else { a = nodePos(l.path[index]); b = nodePos(l.path[index + 1]); }
    const p = near || snapPt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    checkpoint();
    const id = addStation(p);
    // every line sharing this node pair gets the new stop
    for (const ln of map.lines) for (let i = 0; i < ln.path.length - 1; i++) {
      const x = ln.path[i], y = ln.path[i + 1];
      if ((x === l.path[index] && y === l.path[index + 1]) || (y === l.path[index] && x === l.path[index + 1])) {
        ln.path.splice(i + 1, 0, id);
        const nb = {}; for (const [k, v] of Object.entries(ln.bends)) nb[+k > i ? +k + 1 : k] = v; ln.bends = nb;
        i++;
      }
    }
    selection = { type: 'station', ids: [id] };
    beep(660);
  }

  // ---------- keyboard ----------
  let spaceDown = false;
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.querySelector('dialog[open]');
    if (hook('keydown', e, !!typing)) return;
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { selection = null; $('exportMenu').hidden = true; renderPanels(); render(); return; }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod) return;
    if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
    const toolKey = { v: 'select', s: 'station', l: 'line', t: 'label', e: 'erase' }[e.key.toLowerCase()];
    if (toolKey) { tool = toolKey; renderTools(); render(); return; }
    if (e.key.toLowerCase() === 'f') { fit(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection) { e.preventDefault(); act('delSel'); return; }
    if (e.key.startsWith('Arrow') && selection && selection.type === 'station') {
      e.preventDefault(); const step = e.shiftKey ? 5 : 1;
      const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      checkpoint();
      for (const id of selection.ids) { const st = map.stations[id]; if (isGeo()) { const g = stGeo(st); moveStationGeo(st, { x: g.x + dx * 0.25, y: g.y + dy * 0.25 }); } else { st.x += dx; st.y += dy; } }
      changed();
    }
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

  // ---------- panel events ----------
  document.addEventListener('click', (e) => {
    if (hook('click', e)) return;
    const b = e.target.closest('button'); if (!b) { if (!e.target.closest('.menu-wrap')) $('exportMenu').hidden = true; return; }
    if (b.dataset.tool) { tool = b.dataset.tool; renderTools(); render(); return; }
    if (b.dataset.pickline) { const id = b.dataset.pickline; activeLineId = activeLineId === id ? null : id; selection = activeLineId ? { type: 'line', id } : null; renderPanels(); render(); return; }
    if (b.dataset.eye) { const l = lineById(b.dataset.eye); checkpoint(); l.visible = !l.visible; changed(); return; }
    if (b.dataset.goto) { const s = map.stations[b.dataset.goto]; if (s) { selection = { type: 'station', ids: [s.id] }; centerOnStation(s); renderPanels(); } return; }
    if (b.dataset.layout) { setLayout(b.dataset.layout); return; }
    if (b.dataset.unlink !== undefined) { checkpoint(); map.transfers.splice(+b.dataset.unlink, 1); changed(); return; }
    if (b.dataset.act && b.closest('#inspector')) { act(b.dataset.act); return; }
    if (b.dataset.act && b.closest('#exportMenu')) { $('exportMenu').hidden = true; $('exportBtn').setAttribute('aria-expanded', 'false'); exportAct(b.dataset.act); return; }
  });
  function act(a) {
    const s = selection;
    if (a === 'delSel' && s) {
      if (s.type === 'station') deleteStations(s.ids);
      else if (s.type === 'label') { checkpoint(); map.labels = map.labels.filter((l) => l.id !== s.id); selection = null; }
      else if (s.type === 'line' || s.type === 'edge') { act('delLine'); return; }
      beep(220); changed(); return;
    }
    if (a === 'addToLine' && s && s.type === 'station') { appendToActive(s.ids[0]); changed(); return; }
    if ((a === 'alignH' || a === 'alignV') && s && s.type === 'station') {
      checkpoint(); const ref = map.stations[s.ids[0]];
      for (const id of s.ids) {
        const st = map.stations[id];
        if (isGeo()) { if (ref.lat === undefined) continue; if (a === 'alignH') st.lat = ref.lat; else st.lon = ref.lon; }
        else if (a === 'alignH') st.y = ref.y; else st.x = ref.x;
      }
      changed(); return;
    }
    const l = s && lineById(s.lineId || s.id);
    if (!l) return;
    if (a === 'delLine') { checkpoint(); map.lines = map.lines.filter((x) => x !== l); selection = null; if (activeLineId === l.id) activeLineId = null; beep(220); changed(); return; }
    if (a === 'moveUp' || a === 'moveDown') { const i = map.lines.indexOf(l), j = i + (a === 'moveUp' ? -1 : 1); if (j < 0 || j >= map.lines.length) return; checkpoint(); map.lines.splice(i, 1); map.lines.splice(j, 0, l); changed(); return; }
    if (a === 'reverse') { checkpoint(); const n = l.path.length; const nb = {}; for (const [k, v] of Object.entries(l.bends)) nb[n - 2 - k] = v === 'late' ? 'early' : 'late'; l.path.reverse(); l.bends = nb; changed(); return; }
    if (a === 'insertStation' && s.type === 'edge') { insertStationOnEdge(l.id, s.index); changed(); return; }
    if (a === 'eraseEdge' && s.type === 'edge') { eraseEdge(l.id, s.index); changed(); }
  }
  let fieldCheckpointed = null;
  $('inspector').addEventListener('focusin', () => { fieldCheckpointed = null; });
  $('inspector').addEventListener('input', (e) => {
    const f = e.target.dataset.f; if (!f || !selection) return;
    if (hook('input', f, e, selection)) return;
    if (fieldCheckpointed !== e.target) { checkpoint(); fieldCheckpointed = e.target; }
    const v = e.target.value;
    if (f === 'st.link') { if (v) { (map.transfers = map.transfers || []).push({ a: selection.ids[0], b: v }); beep(660); } changed(); return; }
    if (f.startsWith('st.')) { const st = map.stations[selection.ids[0]]; st[f.slice(3)] = v; }
    else if (f.startsWith('ln.')) {
      const l = lineById(selection.lineId || selection.id); const k = f.slice(3);
      if (k === 'width') l.width = +v;
      else if (k === 'style') { l.style = v; l.width = STYLE_WIDTH[v] || l.width; }
      else if (k.startsWith('freq')) { l.freq = freqBands(l.freq); l.freq[k.slice(4).toLowerCase()] = freqNum(v); }
      else if (k === 'showFreq') l.showFreq = e.target.checked;
      else l[k] = v;
    }
    else if (f === 'edge.bend') { const l = lineById(selection.lineId); if (v === 'early') delete l.bends[selection.index]; else l.bends[selection.index] = v; }
    else if (f.startsWith('lb.')) { const lb = map.labels.find((x) => x.id === selection.id); const k = f.slice(3); lb[k] = k === 'size' ? +v : v; }
    render(); renderLines(); renderIssues();
    clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set(STORE_MAP, map), 400);
    if (e.target.type === 'range' || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') renderInspector();
  });
  $('newLineBtn').addEventListener('click', () => newLine());
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('fitBtn').addEventListener('click', fit);
  ['searchInput', 'searchMode', 'searchCase'].forEach((id) => $(id).addEventListener('input', runSearch));
  $('mapTitle').addEventListener('change', (e) => { checkpoint(); map.title = e.target.value.slice(0, 120); changed(); });
  $('exportBtn').addEventListener('click', (e) => { e.stopPropagation(); const m = $('exportMenu'); m.hidden = !m.hidden; $('exportBtn').setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) m.querySelector('button').focus(); });

  // ---------- import and export ----------
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  const slug = () => (map.title || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
  const PROJECT_FORMAT = 'gtha-metro-map-creator-project';

  /** Everything an export needs: the map as drawn, its frame, the legend and the background tiles. */
  function exportScene() {
    const geo = isGeo();
    let ek = 1;
    if (geo) { const b1 = bounds(dm(1)); ek = Math.min(4, Math.max(0.15, 2600 / Math.max(1, b1.x1 - b1.x0, b1.y1 - b1.y0))); }
    const D = viewMap(geo ? dm(ek) : map);
    const { svg } = buildMapSvg(D, { editor: false, exportColors: true });
    const b = bounds(D), pad = 120;
    const vis = D.lines.filter((l) => l.visible && l.path.length > 1 && !String(l.id).includes("~b"));
    const legendH = settings.legend ? 40 + vis.length * 24 : 0;
    const x0 = b.x0 - pad, y0 = b.y0 - pad - 60, w = b.x1 - b.x0 + pad * 2 + 160, h = b.y1 - b.y0 + pad * 2 + 60 + legendH;
    const tiles = [];
    if (geo && settings.background === 'osm') {
      const z = tileZoom(ek), span = TILE * 2 ** (Z0 - z), n = 2 ** z;
      // scene units are zoom-13 pixels times ek, offset by the origin
      const px0 = x0 / ek + OPX.x, px1 = (x0 + w) / ek + OPX.x, py0 = y0 / ek - 4 * G + OPX.y, py1 = (y0 + h) / ek - 4 * G + OPX.y;
      const i0 = Math.floor(px0 / span), i1 = Math.floor(px1 / span), j0 = Math.max(0, Math.floor(py0 / span)), j1 = Math.min(n - 1, Math.floor(py1 / span));
      if ((i1 - i0 + 1) * (j1 - j0 + 1) <= 160) for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++)
        tiles.push({ url: `${OSM_TILES}${z}/${((i % n) + n) % n}/${j}.png`, x: (i * span - OPX.x) * ek, y: (j * span - OPX.y + 4 * G) * ek, s: span * ek });
    }
    return { D, svg, b, pad, vis, x0, y0, w, h, tiles };
  }
  function standaloneSvg(scene, hrefFor) {
    const sc = scene || exportScene();
    const th = exportTheme();
    const { b, pad, vis, x0, y0, w, h } = sc;
    let legend = '';
    if (settings.legend) {
      let y = b.y1 + pad;
      legend += `<text x="${b.x0}" y="${y}" font-size="15" font-weight="700" fill="${th.ink}">${esc(t('legendTitle'))}</text>`;
      for (const l of vis) {
        y += 24;
        legend += `<g transform="translate(${b.x0} ${y - 5})">${linePaths(l, 'M0 0L40 0')}</g>`;
        const f = freqText(l);
        legend += `<text x="${b.x0 + 54}" y="${y}" font-size="13" fill="${th.ink}">${esc(lineName(l))} · ${esc(styleName(l.style))}${f ? ' · ' + esc(t('every')) + ' ' + esc(f) : ''}</text>`;
      }
    }
    const tiles = sc.tiles.map((ti) => `<image href="${esc(hrefFor ? hrefFor(ti.url) : ti.url)}" x="${ti.x.toFixed(1)}" y="${ti.y.toFixed(1)}" width="${(ti.s + 0.6).toFixed(1)}" height="${(ti.s + 0.6).toFixed(1)}" preserveAspectRatio="none" opacity="${settings.bgOpacity}"${th.tileFilter ? ` style="filter:${th.tileFilter}"` : ''}/>`).join('');
    const attrib = sc.tiles.length ? `<text x="${x0 + w - 12}" y="${y0 + h - 12}" font-size="12" text-anchor="end" fill="${th.sub}">© OpenStreetMap contributors</text>` : '';
    const title = esc(map.title) + (settings.lang !== 'en' && map.titleZh ? ' · ' + esc(map.titleZh) : '');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}" font-family="Roboto, Segoe UI, Arial, sans-serif">` +
      `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${th.bg}"/>${tiles}<style>.st-label{paint-order:stroke;stroke-width:4px;stroke-linejoin:round}</style>` +
      `<text x="${b.x0}" y="${b.y0 - pad + 10}" font-size="28" font-weight="800" fill="${th.ink}">${title}</text>${sc.svg}${legend}${attrib}</svg>`;
  }
  async function tileDataUrls(scene) {
    const out = new Map();
    await Promise.all(scene.tiles.map(async (ti) => {
      try { const r = await fetch(ti.url); if (!r.ok) return; const blob = await r.blob(); out.set(ti.url, await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); })); } catch { /* tile skipped */ }
    }));
    return out;
  }
  async function renderCanvas(maxSide) {
    const scene = exportScene();
    let src;
    if (scene.tiles.length) { setBusy(true); const urls = await tileDataUrls(scene); setBusy(false); if (urls.size < scene.tiles.length) toast(t('tilesPartial')); src = standaloneSvg(scene, (u) => urls.get(u) || ''); }
    else src = standaloneSvg(scene);
    const m = src.match(/width="(\d+)" height="(\d+)"/), w = +m[1], h = +m[2], scale = Math.min(2, maxSide / Math.max(w, h));
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
    await img.decode();
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const cx = c.getContext('2d'); cx.fillStyle = exportTheme().bg; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return c;
  }
  /** A one-page PDF holding the map as a JPEG image, sized to the map. */
  function pdfFromJpeg(bytes, wPx, hPx) {
    const W = (wPx * 0.75).toFixed(2), H = (hPx * 0.75).toFixed(2), enc = new TextEncoder(), parts = [], offs = [];
    let len = 0; const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`); push(bytes); push('\nendstream'); });
    obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    const xref = len;
    let x = 'xref\n0 6\n0000000000 65535 f \n'; for (let i = 1; i <= 5; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  /** A single self-contained web page that shows the map with pan, zoom, search and a legend. */
  function siteHtml() {
    const svg = standaloneSvg().replace(/^<\?xml[^>]*>\s*/, '');
    const legend = map.lines.filter((l) => l.visible && l.path.length > 1).map((l) => { const f = freqText(l); return `<li><span style="background:${l.color}"></span>${esc(lineName(l))}<small>${esc(styleName(l.style))}${f ? ' · ' + esc(t('every')) + ' ' + esc(f) : ''}</small></li>`; }).join('');
    const names = Object.values(map.stations).map((s) => s.name);
    return `<!doctype html>
<html lang="${settings.lang === 'en' ? 'en' : 'yue-Hant'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(map.title)}</title>
<style>
:root{--bg:#FBF8FD;--fg:#1B1B1F;--muted:#45464F;--card:#EFEDF1;--accent:#185BBB}
@media (prefers-color-scheme:dark){:root{--bg:#131316;--fg:#E4E2E6;--muted:#C5C6D0;--card:#1F1F23;--accent:#AEC6FF}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 Roboto,"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--fg);display:flex;flex-direction:column;height:100vh}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px}h1{font-size:22px;font-weight:500;margin:0;flex:1 1 auto}
input{font:inherit;height:48px;border-radius:24px;border:0;padding:0 20px;background:var(--card);color:var(--fg);min-width:min(280px,100%)}
main{flex:1;display:flex;min-height:0}#view{flex:1;overflow:hidden;position:relative;touch-action:none;background:#fff}#view svg{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .35s cubic-bezier(.2,0,0,1)}
aside{width:300px;overflow:auto;padding:12px 16px;background:var(--card)}ul{list-style:none;margin:0;padding:0}li{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0}li span{width:28px;height:8px;border-radius:4px}li small{width:100%;margin-left:36px;color:var(--muted)}
.hit text.st-label{fill:var(--md-primary)!important}
@media (max-width:760px){main{flex-direction:column}aside{width:auto;max-height:35vh}}
@media (prefers-reduced-motion:reduce){#view svg{transition:none}}
</style>
</head>
<body>
<header><h1>${esc(map.title)}</h1><input id="q" type="search" placeholder="${esc(t('findStation'))}" aria-label="${esc(t('findStation'))}" list="names"><datalist id="names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></header>
<main><div id="view" aria-label="${esc(map.title)}">${svg}</div><aside><h2>${esc(t('legendTitle'))}</h2><ul>${legend}</ul><p><small>${esc(t('madeWith'))}</small></p></aside></main>
<script>
(function(){var v=document.getElementById('view'),s=v.querySelector('svg'),vb=s.viewBox.baseVal,k=1,x=0,y=0;
function fit(){var r=v.getBoundingClientRect();k=Math.min(r.width/vb.width,r.height/vb.height);x=(r.width-vb.width*k)/2;y=(r.height-vb.height*k)/2;set();}
function set(){s.style.transform='translate('+x+'px,'+y+'px) scale('+k+')';}
v.addEventListener('wheel',function(e){e.preventDefault();var r=v.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,f=Math.exp(-e.deltaY*0.0015);x=mx-(mx-x)*f;y=my-(my-y)*f;k*=f;s.style.transition='none';set();},{passive:false});
var d=null;v.addEventListener('pointerdown',function(e){d={sx:e.clientX,sy:e.clientY,x:x,y:y};v.setPointerCapture(e.pointerId);s.style.transition='none';});
v.addEventListener('pointermove',function(e){if(!d)return;x=d.x+e.clientX-d.sx;y=d.y+e.clientY-d.sy;set();});v.addEventListener('pointerup',function(){d=null;});
document.getElementById('q').addEventListener('change',function(e){var q=e.target.value.toLowerCase();s.querySelectorAll('.hit').forEach(function(n){n.classList.remove('hit');});
var t=[].slice.call(s.querySelectorAll('text.st-label')).find(function(n){return n.textContent.toLowerCase()===q;});if(!t)return;t.classList.add('hit');var bb=t.getBBox(),r=v.getBoundingClientRect();k=Math.max(k,r.width/vb.width*3);
x=r.width/2-(bb.x-vb.x)*k;y=r.height/2-(bb.y-vb.y)*k;s.style.transition='';set();});
addEventListener('resize',fit);fit();})();
</script>
</body>
</html>
`;
  }
  function projectJson() {
    const keep = ['layout', 'background', 'bgOpacity', 'showFreq', 'fontSize', 'legend', 'lang', 'liveStops', 'freqWeight', 'mapStyle'];
    return JSON.stringify({ format: PROJECT_FORMAT, version: 1, savedAt: new Date().toISOString(), map, settings: Object.fromEntries(keep.map((k) => [k, settings[k]])), view: { tx: view.tx, ty: view.ty, k: view.k } }, null, 2);
  }
  function setBusy(on) { $('progress').hidden = !on; }
  async function exportAct(a) {
    try {
      if (a === 'svg') { download(slug() + '.svg', new Blob([standaloneSvg()], { type: 'image/svg+xml' })); beep(784); toast(t('exported')); }
      else if (a === 'json') { download(slug() + '.json', new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' })); beep(784); }
      else if (a === 'project') { download(slug() + '.gmmc.json', new Blob([projectJson()], { type: 'application/json' })); beep(784); toast(t('projectSaved')); }
      else if (a === 'site') { download(slug() + '.html', new Blob([siteHtml()], { type: 'text/html' })); beep(784); toast(t('siteExported')); }
      else if (a === 'png') { const c = await renderCanvas(16000); const bl = await new Promise((r) => c.toBlob(r, 'image/png')); if (!bl) throw new Error('png'); download(slug() + '.png', bl); beep(784); toast(t('exported')); }
      else if (a === 'pdf') {
        const c = await renderCanvas(9000);
        const url = c.toDataURL('image/jpeg', 0.92), bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        download(slug() + '.pdf', pdfFromJpeg(bytes, c.width, c.height)); beep(784); toast(t('exported'));
      }
      else if (a === 'open') $('fileInput').click();
      else if (a === 'template' || a === 'blank') { if (confirm(t('replaceConfirm'))) replaceMap(window.GTHATemplates[a === 'template' ? 'gtha' : 'blank']()); }
    } catch (e) { setBusy(false); toast(t('exportFailed')); beep(180); }
  }
  function replaceMap(m) { checkpoint(); map = m; selection = null; activeLineId = null; $('mapTitle').value = map.title; changed(); fit(); }
  function loadText(txt) {
    let obj = null; try { obj = JSON.parse(txt); } catch { obj = null; }
    if (obj && obj.format === PROJECT_FORMAT) {
      const m = validateMap(obj.map); if (!m) return false;
      const s2 = obj.settings || {};
      if (['schematic', 'geographic'].includes(s2.layout)) settings.layout = s2.layout;
      if (['osm', 'none'].includes(s2.background)) settings.background = s2.background;
      if (Number.isFinite(+s2.bgOpacity)) settings.bgOpacity = Math.min(1, Math.max(0.2, +s2.bgOpacity));
      for (const k of ['showFreq', 'legend', 'liveStops', 'freqWeight']) if (typeof s2[k] === 'boolean') settings[k] = s2[k];
      if (Number.isFinite(+s2.fontSize)) settings.fontSize = Math.min(22, Math.max(9, +s2.fontSize));
      if (['en', 'yue', 'both'].includes(s2.lang)) settings.lang = s2.lang;
      if (['material', 'classic', 'frequent', 'night'].includes(s2.mapStyle)) settings.mapStyle = s2.mapStyle;
      saveSettings(); applyI18n(); replaceMap(m); return true;
    }
    const m = obj && validateMap(obj); if (!m) return false;
    replaceMap(m); return true;
  }
  function importFile(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT) { toast(t('importFailed')); beep(180); return; }
    file.text().then((txt) => { if (loadText(txt)) { toast(t('imported')); beep(880); } else { toast(t('importFailed')); beep(180); } });
  }
  function setLayout(l) {
    if (!['schematic', 'geographic'].includes(l) || l === settings.layout) return;
    settings.layout = l; saveSettings(); liveStops = []; liveKey = '';
    document.body.classList.add('layout-switch'); setTimeout(() => document.body.classList.remove('layout-switch'), 420);
    renderPanels(); fit(); beep(523);
  }
  $('fileInput').addEventListener('change', (e) => { importFile(e.target.files[0]); e.target.value = ''; });
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('dropOverlay').hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropOverlay').hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; $('dropOverlay').hidden = true; importFile(e.dataTransfer.files[0]); });

  // ---------- sound ----------
  let actx = null;
  function beep(freq) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, actx.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.12);
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.13);
    } catch { /* audio unavailable: the visible result still stands */ }
  }

  // ---------- settings dialog ----------
  function openSettings() {
    $('setLang').value = settings.lang; $('setTheme').value = settings.theme; $('setFont').value = settings.fontSize;
    $('setGrid').checked = settings.grid; $('setSnap').checked = settings.snap; $('setLegend').checked = settings.legend; $('setSound').checked = settings.sound;
    $('setLayout').value = settings.layout; $('setBg').value = settings.background; $('setBgOpacity').value = settings.bgOpacity;
    $('setFreq').checked = settings.showFreq; $('setLive').checked = settings.liveStops; $('setOverpass').value = settings.overpassUrl || '';
    $('settingsDialog').showModal();
  }
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsDialog').addEventListener('input', () => {
    settings.lang = $('setLang').value; settings.theme = $('setTheme').value; settings.fontSize = +$('setFont').value;
    settings.grid = $('setGrid').checked; settings.snap = $('setSnap').checked; settings.legend = $('setLegend').checked; settings.sound = $('setSound').checked;
    settings.background = $('setBg').value; settings.bgOpacity = +$('setBgOpacity').value; settings.showFreq = $('setFreq').checked; settings.liveStops = $('setLive').checked; settings.overpassUrl = $('setOverpass').value.trim().slice(0, 300);
    const lay = $('setLayout').value; saveSettings(); applyTheme(); applyI18n(); if (lay !== settings.layout) setLayout(lay);
  });
  $('tidyBtn').addEventListener('click', () => { checkpoint(); for (const s of Object.values(map.stations)) s.label = 'auto'; changed(); });
  $('resetSettingsBtn').addEventListener('click', () => { settings = Object.assign({}, DEFAULT_SETTINGS); saveSettings(); applyTheme(); applyI18n(); render(); openSettingsRefresh(); });
  function openSettingsRefresh() { $('settingsDialog').close(); openSettings(); }
  $('setupBtn').addEventListener('click', () => { $('settingsDialog').close(); store.set(STORE_SETUP, { step: 0, done: false }); openSetup(); });

  // ---------- first-run setup ----------
  let setup = Object.assign({ step: 0, done: false, start: 'template' }, store.get(STORE_SETUP) || {});
  const hadSaved = !!store.get(STORE_MAP);
  function openSetup() { setup = Object.assign({ step: 0, start: hadSaved ? 'keep' : 'template' }, store.get(STORE_SETUP) || {}, { done: false }); if (!(setup.step >= 0 && setup.step <= 2)) setup.step = 0; renderSetup(); $('setupDialog').showModal(); }
  function stepText(n, total) { return settings.lang === 'yue' ? `第 ${n} 步，共 ${total} 步` : settings.lang === 'both' ? `Step ${n} of ${total} · 第 ${n} 步，共 ${total} 步` : `Step ${n} of ${total}`; }
  function renderSetup() {
    const total = 3, s = setup.step;
    $('setupProgress').textContent = stepText(s + 1, total);
    let h = '';
    if (s === 0) {
      const opt = (v, label) => `<label class="choice"><input type="radio" name="start" value="${v}"${setup.start === v ? ' checked' : ''}><span>${esc(label)}</span></label>`;
      h = `<h3>${esc(t('setupStart'))}</h3>${hadSaved ? opt('keep', t('keepCurrent')) : ''}${opt('template', t('template'))}${opt('blank', t('blankMap'))}`;
    } else if (s === 1) {
      h = `<h3>${esc(t('setupLook'))}</h3><label>${esc(t('language'))}<select id="suLang"><option value="en">${esc(t('lang_en'))}</option><option value="yue">${esc(t('lang_yue'))}</option><option value="both">${esc(t('lang_both'))}</option></select></label>
        <label>${esc(t('layout'))}<select id="suLayout"><option value="geographic">${esc(t('layout_geographic'))}</option><option value="schematic">${esc(t('layout_schematic'))}</option></select></label>
        <label>${esc(t('theme'))}<select id="suTheme"><option value="system">${esc(t('system'))}</option><option value="light">${esc(t('light'))}</option><option value="dark">${esc(t('dark'))}</option></select></label>`;
    } else {
      h = `<h3>${esc(t('setupTools'))}</h3><p>${esc(t('toolsHelp'))}</p>`;
    }
    $('setupStep').innerHTML = h;
    if (s === 1) { $('suLang').value = settings.lang; $('suTheme').value = settings.theme; $('suLayout').value = settings.layout; }
    $('setupBack').disabled = s === 0;
    $('setupNext').textContent = s === total - 1 ? t('finish') : t('next');
    $('setupStep').querySelector('input,select')?.focus();
  }
  $('setupStep').addEventListener('change', (e) => {
    if (e.target.name === 'start') setup.start = e.target.value;
    if (e.target.id === 'suLang') { settings.lang = e.target.value; saveSettings(); applyI18n(); renderSetup(); }
    if (e.target.id === 'suTheme') { settings.theme = e.target.value; saveSettings(); applyTheme(); }
    if (e.target.id === 'suLayout') setLayout(e.target.value);
    store.set(STORE_SETUP, setup);
  });
  function finishSetup() {
    setup.done = true; store.set(STORE_SETUP, setup); $('setupDialog').close();
    if (setup.start === 'template' && hadSaved) replaceMap(window.GTHATemplates.gtha());
    else if (setup.start === 'blank') replaceMap(window.GTHATemplates.blank());
    else fit();
  }
  $('setupNext').addEventListener('click', () => { if (setup.step >= 2) { finishSetup(); return; } setup.step++; store.set(STORE_SETUP, setup); renderSetup(); });
  $('setupBack').addEventListener('click', () => { if (setup.step > 0) { setup.step--; store.set(STORE_SETUP, setup); renderSetup(); } });
  $('setupSkip').addEventListener('click', () => { setup.step = 2; finishSetup(); });
  $('setupDialog').addEventListener('cancel', (e) => { e.preventDefault(); store.set(STORE_SETUP, setup); $('setupDialog').close(); fit(); });

  // ---------- boot ----------
  window.addEventListener('resize', () => render());
  fillIcons();
  applyTheme();
  $('mapTitle').value = map.title;
  applyI18n();
  // A timer, not requestAnimationFrame: frames pause in background tabs and setup must still open.
  if (window.RxBuilder) { window.RxBuilder.init(); window.RxBuilder.render(); }
  setTimeout(() => { fit(); if (!setup.done) openSetup(); }, 0);
  // Optional starting map. A deployment may add app/default-map.json (a saved map or project file).
  // It opens only for a visitor who has no saved map yet, so nobody's own work is replaced.
  if (!hadSaved) {
    fetch('default-map.json', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null)).then((txt) => {
      if (!txt || txt.length > MAX_IMPORT || txt.trimStart()[0] !== '{') return;
      if (loadText(txt)) { fit(); toast(t('imported')); }
    }).catch(() => { /* no default map is the normal case */ });
  }
  // Hooks for the desktop app: load a map from text, start a new map, read the export menu.
  function loadJson(text) { if (!loadText(text)) { toast(t('importFailed')); beep(180); return false; } toast(t('imported')); return true; }
  $('zoomInBtn').addEventListener('click', () => zoomBy(1.6));
  $('zoomOutBtn').addEventListener('click', () => zoomBy(1 / 1.6));
  $('bgBtn').addEventListener('click', () => { if (!isGeo()) { setLayout('geographic'); return; } settings.background = settings.background === 'osm' ? 'none' : 'osm'; saveSettings(); render(); toast(settings.background === 'osm' ? t('bgOn') : t('bgOff')); });
  function newMap(kind) { replaceMap(window.GTHATemplates[kind === 'blank' ? 'blank' : 'gtha']()); }
  window.GMMC = { getMap: () => map, computeGeometry, route, validateMap, standaloneSvg, loadJson, newMap, exportAct, undo, redo, setLayout, dm, siteHtml, projectJson, getView: () => view, getSettings: () => settings, liveStops: () => liveStops,
    // extension API
    G, t, esc, checkpoint, changed, render, renderPanels, renderInspector, toast, beep, fit, saveSettings, applyI18n, viewMap,
    getSelection: () => selection, setSelection: (s) => { selection = s; }, getTool: () => tool, setTool: (x) => { tool = x; renderTools(); render(); },
    getActiveLine: () => activeLineId, setActiveLine: (id) => { activeLineId = id; }, lineById, servingLines, isInterchangeIn, lineName, freqText, linePaths,
    isGeo, stGeo, geoGrid, gridToLatLon, fits, worldFromEvent, addStation, snapPt, uid, svgEl: () => svgEl, replaceMap, loadText, download, exportScene };
  for (const f of X.ready) { try { f(window.GMMC); } catch (err) { console.error('extension ready', err); } }
})();
