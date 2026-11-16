// mod-gtfs-import.js: see docs/features/gtfs-import.md. Registers hooks on window.GMMCX before app.js loads.
// Opens a GTFS feed (ZIP), lists its routes, and imports the chosen ones as lines and stations.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  X.ready = X.ready || [];

  window.I18N && window.I18N.add({
    gtfsImport: 'Import GTFS', gtfsTitle: 'Import from GTFS', gtfsSearch: 'Search routes', gtfsAll: 'All', gtfsSubway: 'Subway or metro',
    gtfsRail: 'Rail', gtfsTram: 'Light rail or tram', gtfsBus: 'Bus', gtfsOther: 'Other', gtfsRoutes: 'routes', gtfsSelected: 'selected',
    gtfsMerge: 'stops within 150 m are merged', gtfsImportN: 'Import {n} routes', gtfsImportOne: 'Import 1 route', gtfsCancel: 'Cancel',
    gtfsReading: 'Reading feed', gtfsPhaseZip: 'Opening the archive', gtfsPhaseTables: 'Reading routes, trips and stops',
    gtfsPhaseTimes: 'Reading stop times', gtfsPhaseRoutes: 'Building routes', gtfsNone: 'No routes match', gtfsFailed: 'Could not read this feed',
    gtfsDone: 'Imported {r} routes, {s} new stations', gtfsStops: 'stops', gtfsMin: 'min',
    gtfsNote: 'Imported from {feed}, service {a} to {b}.', gtfsPickZip: 'Choose a GTFS .zip file',
    gtfsWorkerFailed: 'The feed reader could not start',
    gtfsSubtitle: 'Pick the routes to add to your map', gtfsClose: 'Close', gtfsChange: 'Change file', gtfsStopsLbl: 'stops', gtfsDates: 'service dates',
    gtfsPreview: 'Preview', gtfsPreviewEmpty: 'Pick routes to see them here', gtfsAdds: 'Adds to your map', gtfsNewStops: 'new stops', gtfsMerged: 'merged',
    gtfsMergeNote: 'Stops within 150 m of a station join it', gtfsHeadway: 'min, peak / midday', gtfsPreviewLabel: 'Preview of the selected routes', gtfsRoutesLbl: 'routes'
  }, {
    gtfsImport: '匯入 GTFS', gtfsTitle: '由 GTFS 匯入', gtfsSearch: '搜尋路線', gtfsAll: '全部', gtfsSubway: '地鐵', gtfsRail: '鐵路', gtfsTram: '輕鐵或電車',
    gtfsBus: '巴士', gtfsOther: '其他', gtfsRoutes: '條路線', gtfsSelected: '已選', gtfsMerge: '150 米內嘅站會合併', gtfsImportN: '匯入 {n} 條路線',
    gtfsImportOne: '匯入 1 條路線', gtfsCancel: '取消', gtfsReading: '讀取緊資料', gtfsPhaseZip: '開啟壓縮檔', gtfsPhaseTables: '讀取路線、班次同車站',
    gtfsPhaseTimes: '讀取停站時間', gtfsPhaseRoutes: '整理路線', gtfsNone: '冇符合嘅路線', gtfsFailed: '讀唔到呢份資料', gtfsDone: '已匯入 {r} 條路線，新增 {s} 個車站',
    gtfsStops: '個站', gtfsMin: '分鐘', gtfsNote: '由 {feed} 匯入，服務期 {a} 至 {b}。', gtfsPickZip: '揀一個 GTFS .zip 檔案', gtfsWorkerFailed: '資料讀取器開唔到',
    gtfsSubtitle: '揀要加入地圖嘅路線', gtfsClose: '關閉', gtfsChange: '轉檔案', gtfsStopsLbl: '個站', gtfsDates: '服務期',
    gtfsPreview: '預覽', gtfsPreviewEmpty: '揀路線就會喺度顯示', gtfsAdds: '會加入你嘅地圖', gtfsNewStops: '新增站', gtfsMerged: '已併入',
    gtfsMergeNote: '150 米內嘅站會併入現有車站', gtfsHeadway: '分鐘，繁忙／日間', gtfsPreviewLabel: '已選路線預覽', gtfsRoutesLbl: '條路線'
  });

  const PALETTE = ['#1F5FBF', '#C8102E', '#0B6E4F', '#E8A317', '#7B2D8E', '#00838F', '#6D4C41', '#D81B60'];
  const MERGE_M = 150;
  const STYLE = { tram: ['solid', 6], subway: ['solid', 8], rail: ['rail', 8], bus: ['bus', 5], other: ['solid', 6] };
  const TYPE_KEY = { subway: 'gtfsSubway', rail: 'gtfsRail', tram: 'gtfsTram', bus: 'gtfsBus', other: 'gtfsOther' };
  const PHASE = { zip: 'gtfsPhaseZip', tables: 'gtfsPhaseTables', stop_times: 'gtfsPhaseTimes', routes: 'gtfsPhaseRoutes', done: 'gtfsPhaseRoutes' };

  let G = null, dlg = null, state = null, worker = null;
  const $ = (id) => document.getElementById(id);
  const tr = (k, v) => { let s = G ? G.t(k) : k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
  const esc = (s) => G.esc(String(s));

  /** Metres between two points, flat-earth approximation (fine below a few kilometres). */
  function metres(a, b) {
    const dy = (a.lat - b.lat) * 111320, dx = (a.lon - b.lon) * 111320 * Math.cos((a.lat + b.lat) * Math.PI / 360);
    return Math.hypot(dx, dy);
  }
  const titleCase = (s) => (s === s.toUpperCase() && /[A-Z]/.test(s)) ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : s;
  const cleanStop = (s) => titleCase(String(s).replace(/\s+Platform\s+\w+$/i, '').replace(/\s+Stop\s*#\s*\d+$/i, '').trim()).slice(0, 80);
  const fmtDate = (d) => d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '';
  const dateLabel = (d) => {
    if (!d || d.length !== 8) return '';
    try { return new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return fmtDate(d); }
  };
  const num = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

  // ---------- dialog ----------
  const TYPE_ICON = { subway: 'train', rail: 'train', tram: 'tram', bus: 'directions_bus', other: 'route' };
  const FALLBACK = { subway: '#1F5FBF', rail: '#0B6E4F', tram: '#7B2D8E', bus: '#5F6368', other: '#6D4C41' };
  const HEX = /^[0-9a-f]{6}$/i;
  /** Route colour from the feed, or a fallback by type, with a text colour that reads on it. */
  function badgeColours(r) {
    const bg = HEX.test(r.color || '') ? '#' + r.color : (FALLBACK[r.type] || FALLBACK.other);
    const c = [1, 3, 5].map((i) => { const v = parseInt(bg.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return { bg, fg: lum > 0.4 ? '#101114' : '#FFFFFF' };
  }
  /** On a dark preview a very dark route colour is lightened so the line stays visible; the badge keeps the real colour. */
  function previewColour(hex, darkBg) {
    if (!darkBg) return hex;
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if ((0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) > 90) return hex;
    return '#' + v.map((c) => Math.round(c + (255 - c) * 0.55).toString(16).padStart(2, '0')).join('');
  }
  const shortDate = (d) => {
    if (!d || d.length !== 8) return '';
    const loc = window.I18N && window.I18N.getLang && window.I18N.getLang() !== 'en' ? 'zh-HK' : 'en-CA';
    try { return new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).toLocaleDateString(loc, { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return fmtDate(d); }
  };

  function build() {
    dlg = document.createElement('dialog'); dlg.id = 'gtfsDialog'; dlg.setAttribute('aria-labelledby', 'gtfsTitle');
    dlg.innerHTML = `<form method="dialog" class="gtfs-body">
      <header class="gtfs-head"><span class="gtfs-tile">${window.icon('upload_file', 28)}</span>
        <div class="gtfs-headtxt"><h2 id="gtfsTitle"></h2><p id="gtfsSub" class="gtfs-sub"></p></div>
        <button type="button" class="icon-btn" id="gtfsClose">${window.icon('close', 24)}</button></header>
      <section class="gtfs-feed" id="gtfsFeed" aria-live="polite">
        <span class="gtfs-fname" id="gtfsFile"></span>
        <span class="gtfs-stat"><b id="gtfsStatR">-</b><small data-t="gtfsRoutesLbl"></small></span>
        <span class="gtfs-stat"><b id="gtfsStatS">-</b><small data-t="gtfsStopsLbl"></small></span>
        <span class="gtfs-stat"><b id="gtfsStatD">-</b><small data-t="gtfsDates"></small></span>
        <button type="button" class="btn text" id="gtfsChange"></button>
        <div class="gtfs-prog" id="gtfsProg" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div></div></div></section>
      <div class="search-bar gtfs-search">${window.icon('search', 24)}<input id="gtfsQuery" type="search" autocomplete="off" spellcheck="false" autofocus></div>
      <div class="gtfs-filters"><div class="gtfs-chips" id="gtfsChips" role="group"></div>
        <p class="gtfs-status supporting" id="gtfsCount" aria-live="polite"></p></div>
      <div class="gtfs-list" id="gtfsList" role="group"></div>
      <div class="gtfs-preview" id="gtfsPreview" role="img"><span class="gtfs-pvlabel" data-t="gtfsPreview"></span><svg id="gtfsSvg" aria-hidden="true"></svg><p class="gtfs-pvempty" id="gtfsPvEmpty" data-t="gtfsPreviewEmpty"></p></div>
      <section class="gtfs-adds" aria-live="polite"><h3 data-t="gtfsAdds"></h3>
        <div class="gtfs-addrow"><span><b id="gtfsAddR">0</b><small data-t="gtfsRoutesLbl"></small></span><span><b id="gtfsAddN">0</b><small data-t="gtfsNewStops"></small></span><span><b id="gtfsAddM">0</b><small data-t="gtfsMerged"></small></span></div>
        <p class="gtfs-addnote" data-t="gtfsMergeNote"></p></section>
      <div class="gtfs-actions"><button type="button" class="btn outlined" id="gtfsCancel"></button><button type="button" class="btn filled" id="gtfsGo"></button></div>
    </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { if (!dlg.open) stopWorker(); });
    $('gtfsCancel').addEventListener('click', () => dlg.close());
    $('gtfsClose').addEventListener('click', () => dlg.close());
    $('gtfsChange').addEventListener('click', chooseFile);
    $('gtfsGo').addEventListener('click', doImport);
    $('gtfsQuery').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
    $('gtfsChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-type]'); if (!b) return; state.filter = b.dataset.type; renderChips(); renderList(); });
    $('gtfsList').addEventListener('change', (e) => { const cb = e.target.closest('input[data-id]'); if (!cb) return; if (cb.checked) state.selected.add(cb.dataset.id); else state.selected.delete(cb.dataset.id); renderCount(); });
    // Enter imports; the surrounding form would otherwise close the dialog without importing.
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      if (!$('gtfsGo').disabled) doImport();
    });
    let rz = 0;
    window.addEventListener('resize', () => { if (!dlg.open) return; cancelAnimationFrame(rz); rz = requestAnimationFrame(() => renderPreview(true)); });
  }
  function stopWorker() { if (worker) { worker.terminate(); worker = null; } }

  function open(file) {
    if (!G) return false;
    if (!dlg) build();
    stopWorker();
    state = { file: null, feed: null, routes: [], selected: new Set(), filter: 'all', query: '', busy: false, drawn: new Set(), plan: null, totalStops: 0 };
    if (G.applyI18n) G.applyI18n();
    $('gtfsTitle').textContent = tr('gtfsTitle'); $('gtfsSub').textContent = tr('gtfsSubtitle');
    const q = $('gtfsQuery'); q.placeholder = tr('gtfsSearch'); q.setAttribute('aria-label', tr('gtfsSearch')); q.value = '';
    $('gtfsCancel').textContent = tr('gtfsCancel'); $('gtfsClose').setAttribute('aria-label', tr('gtfsClose'));
    $('gtfsChange').textContent = tr('gtfsChange');
    $('gtfsPreview').setAttribute('aria-label', tr('gtfsPreviewLabel'));
    $('gtfsFile').textContent = file ? file.name : tr('gtfsPickZip');
    renderStats(); renderChips(); renderList(); renderCount(); setProgress(null);
    if (!dlg.open) dlg.showModal();
    renderPreview(true);
    if (file) start(file); else chooseFile();
    return true;
  }
  function chooseFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.zip,application/zip';
    inp.addEventListener('change', () => { if (inp.files[0]) { $('gtfsFile').textContent = inp.files[0].name; start(inp.files[0]); } });
    inp.click();
  }

  function setProgress(p, phase) {
    const bar = $('gtfsProg'); bar.hidden = p === null;
    if (p !== null) { bar.setAttribute('aria-valuenow', String(p)); bar.firstElementChild.style.width = p + '%'; }
    if (phase) $('gtfsCount').textContent = tr(phase) + ' ' + p + '%';
  }

  function start(file) {
    stopWorker();
    state.file = file; state.busy = true; state.routes = []; state.selected.clear(); state.feed = null; state.drawn.clear(); state.totalStops = 0;
    $('gtfsSub').textContent = tr('gtfsSubtitle');
    renderStats(); renderChips(); renderList(); renderCount(); setProgress(0, 'gtfsReading');
    try { worker = new Worker('gtfs-worker.js'); } catch (err) { fail(tr('gtfsWorkerFailed') + ': ' + err.message); return; }
    const w = worker;
    w.onmessage = (ev) => {
      const m = ev.data; if (w !== worker) return;
      if (m.type === 'progress') setProgress(m.percent, PHASE[m.phase] || 'gtfsReading');
      else if (m.type === 'done') {
        state.busy = false; state.feed = m.result.feed; state.routes = m.result.routes.sort((a, b) => num(a.short || a.id, b.short || b.id));
        const ids = new Set(); for (const r of state.routes) for (const s of r.stops) ids.add(s.id); state.totalStops = ids.size;
        setProgress(null); stopWorker(); renderStats(); renderChips(); renderList(); renderCount();
      } else if (m.type === 'error') fail(m.message);
    };
    w.onerror = (e) => fail(e.message || tr('gtfsFailed'));
    w.postMessage({ type: 'parse', file });
  }
  function fail(msg) {
    state.busy = false; stopWorker(); setProgress(null);
    $('gtfsSub').innerHTML = `<span class="err" role="alert">${esc(tr('gtfsFailed'))}: ${esc(msg)}</span>`;
    renderChips(); renderList(); renderCount();
  }

  function renderStats() {
    const f = state.feed, a = f && shortDate(f.start), b = f && shortDate(f.end);
    if (state.file) $('gtfsFile').textContent = state.file.name;
    $('gtfsStatR').textContent = f ? String(f.routeCount) : '-';
    $('gtfsStatS').textContent = f ? state.totalStops.toLocaleString() : '-';
    $('gtfsStatD').textContent = f && a && b ? `${a} – ${b}` : '-';
  }
  function counts() { const c = { all: state.routes.length }; for (const r of state.routes) c[r.type] = (c[r.type] || 0) + 1; return c; }
  function renderChips() {
    const c = counts(), order = ['all', 'subway', 'rail', 'tram', 'bus', 'other'];
    $('gtfsChips').innerHTML = order.filter((k) => k === 'all' || c[k]).map((k) => {
      const on = state.filter === k;
      return `<button type="button" class="gtfs-chip${on ? ' on' : ''}" data-type="${k}" aria-pressed="${on}">${on ? window.icon('check', 18) : k === 'all' ? '' : window.icon(TYPE_ICON[k], 18)}<span>${esc(k === 'all' ? tr('gtfsAll') : tr(TYPE_KEY[k]))} ${c[k] || 0}</span></button>`;
    }).join('');
  }
  function visible() {
    const q = state.query.trim().toLowerCase();
    return state.routes.filter((r) => (state.filter === 'all' || r.type === state.filter) && (!q || (r.short + ' ' + r.long + ' ' + r.id).toLowerCase().includes(q)));
  }
  function renderList() {
    const list = $('gtfsList');
    if (state.busy) { list.innerHTML = ''; return; }
    const rows = visible();
    if (!rows.length) { list.innerHTML = state.feed ? `<p class="supporting gtfs-empty">${esc(tr('gtfsNone'))}</p>` : ''; return; }
    list.innerHTML = rows.map((r) => {
      const col = badgeColours(r), label = r.short || r.id;
      const hw = r.peak || r.midday ? `<span class="gtfs-hw"><b>${r.peak || '-'} / ${r.midday || '-'}</b><small>${esc(tr('gtfsHeadway'))}</small></span>` : '';
      return `<label class="gtfs-row"><input type="checkbox" data-id="${esc(r.id)}"${state.selected.has(r.id) ? ' checked' : ''} aria-label="${esc((label + ' ' + titleCase(r.long || '')).trim())}">
        <span class="gtfs-num" style="background:${col.bg};color:${col.fg}">${esc(label)}</span>
        <span class="gtfs-txt"><span class="gtfs-name">${esc(titleCase(r.long || r.short || r.id))}</span><span class="gtfs-meta">${esc(tr(TYPE_KEY[r.type]))} · ${r.stopCount} ${esc(tr('gtfsStops'))}</span></span>${hw}</label>`;
    }).join('');
  }
  function renderCount() {
    const n = state.selected.size;
    if (!state.busy) $('gtfsCount').textContent = n ? `${n} ${tr('gtfsSelected')}` : '';
    $('gtfsGo').innerHTML = `${window.icon('download', 20)}<span>${esc(n === 1 ? tr('gtfsImportOne') : tr('gtfsImportN', { n }))}</span>`;
    $('gtfsGo').disabled = !n || state.busy;
    const chosen = state.routes.filter((r) => state.selected.has(r.id));
    state.plan = planStops(chosen);
    $('gtfsAddR').textContent = String(chosen.length); $('gtfsAddN').textContent = String(state.plan.created); $('gtfsAddM').textContent = String(state.plan.merged);
    renderPreview(false);
  }

  // ---------- preview ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  function renderPreview(resized) {
    const box = $('gtfsPreview'), svg = $('gtfsSvg'), empty = $('gtfsPvEmpty');
    const chosen = state.routes.filter((r) => state.selected.has(r.id));
    empty.hidden = chosen.length > 0;
    const keep = new Set(chosen.map((r) => r.id)); for (const id of [...state.drawn]) if (!keep.has(id)) state.drawn.delete(id);
    const w = box.clientWidth, h = box.clientHeight;
    svg.innerHTML = '';
    if (!chosen.length) { state.drawn.clear(); return; }
    if (w < 20 || h < 20) return;
    let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    for (const r of chosen) for (const s of r.stops) { if (s.lat < la0) la0 = s.lat; if (s.lat > la1) la1 = s.lat; if (s.lon < lo0) lo0 = s.lon; if (s.lon > lo1) lo1 = s.lon; }
    const kx = Math.cos((la0 + la1) * Math.PI / 360), pad = 44;
    const bw = Math.max((lo1 - lo0) * kx, 1e-5), bh = Math.max(la1 - la0, 1e-5);
    const sc = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
    const ox = (w - bw * sc) / 2, oy = (h - bh * sc) / 2;
    const P = (s) => [ox + (s.lon - lo0) * kx * sc, oy + (la1 - s.lat) * sc];
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const bgc = (getComputedStyle(box).backgroundColor.match(/\d+(\.\d+)?/g) || [255, 255, 255]).slice(0, 3).map(Number);
    const darkBg = (0.2126 * bgc[0] + 0.7152 * bgc[1] + 0.0722 * bgc[2]) < 110;
    const dots = chosen.reduce((n, r) => n + r.stops.length, 0) <= 1500;
    let idx = 0;
    for (const r of chosen) {
      const pts = r.stops.map(P), d = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
      const col = previewColour(badgeColours(r).bg, darkBg), fresh = !resized && !state.drawn.has(r.id);
      const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'gtfs-pr' + (fresh ? ' draw' : '')); g.style.setProperty('--i', String(idx++ % 8));
      const mk = (cls, attrs) => { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('class', cls); for (const k in attrs) p.setAttribute(k, attrs[k]); g.appendChild(p); };
      mk('halo', { d, pathLength: '1' });
      mk('ln', { d, pathLength: '1', stroke: col });
      if (dots) { const dd = pts.map((p) => `M${p[0].toFixed(1)} ${p[1].toFixed(1)}h0`).join(''); mk('sd', { d: dd, stroke: col }); mk('sdi', { d: dd }); }
      svg.appendChild(g); state.drawn.add(r.id);
    }
  }

  // ---------- stop matching (shared by the preview counts and the import) ----------
  /**
   * Resolves each stop of the chosen routes to an existing or new station using the 150 m rule.
   * `create(stop, route)` makes the new station; the preview passes a placeholder, the import a real one.
   */
  function resolver(create) {
    const map = G.getMap();
    // Stations with real coordinates, bucketed by about 0.002 degrees so the 150 m lookup only checks nine cells.
    const cell = (lat, lon) => Math.floor(lat / 0.002) + ':' + Math.floor(lon / 0.002);
    const grid = new Map();
    const put = (st) => { const k = cell(st.lat, st.lon); (grid.get(k) || grid.set(k, []).get(k)).push(st); };
    for (const st of Object.values(map.stations)) if (st.lat !== undefined) put(st);
    const find = (p) => {
      const ci = Math.floor(p.lat / 0.002), cj = Math.floor(p.lon / 0.002); let best = null, bd = MERGE_M;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const st of grid.get((ci + i) + ':' + (cj + j)) || []) { const d = metres(p, st); if (d <= bd) { bd = d; best = st; } }
      return best;
    };
    const byStop = new Map();
    const out = { created: 0, merged: 0, resolve(s, route) {
      let st = byStop.get(s.id);
      if (!st) {
        st = find(s);
        if (st) out.merged++;
        else { st = create(s, route); put(st); out.created++; }
        byStop.set(s.id, st);
      }
      return st;
    } };
    return out;
  }
  function planStops(chosen) {
    const r = resolver((s) => ({ lat: s.lat, lon: s.lon }));
    for (const route of chosen) for (const s of route.stops) r.resolve(s, route);
    return { created: r.created, merged: r.merged };
  }

  // ---------- import ----------
  function doImport() {
    const chosen = state.routes.filter((r) => state.selected.has(r.id));
    if (!chosen.length) return;
    const map = G.getMap(), feed = state.feed;
    G.checkpoint();
    const f = G.fits();
    const feedName = feed.publisher || state.file.name;
    const R = resolver((s, r) => {
      const kind = r.type === 'bus' ? 'stop' : 'station', g = f.toGrid(G.geoGrid(s.lat, s.lon)), id = G.uid('st');
      return (map.stations[id] = { id, name: cleanStop(s.name), nameZh: '', label: 'auto', interchange: 'auto', kind, x: Math.round(g.x * 2) / 2, y: Math.round(g.y * 2) / 2, lat: s.lat, lon: s.lon });
    });
    let lines = 0;
    chosen.forEach((r, idx) => {
      const [style, width] = STYLE[r.type] || STYLE.other;
      const path = [];
      for (const s of r.stops) {
        const st = R.resolve(s, r);
        if (path[path.length - 1] !== st.id) path.push(st.id);
      }
      if (path.length < 2) return;
      const nm = (r.short && r.long ? r.short + ' ' + titleCase(r.long) : titleCase(r.long || r.short || r.id)).slice(0, 80);
      const extra = [r.evening ? `evening ${r.evening} min` : '', r.weekend ? `Saturday ${r.weekend} min` : ''].filter(Boolean).join(', ');
      const color = r.color ? '#' + r.color : PALETTE[(map.lines.length + idx) % PALETTE.length];
      map.lines.push({ id: G.uid('line'), name: nm, nameZh: '', color, width, style, visible: true, path, bends: {}, freq: { peak: r.peak, offpeak: r.midday }, showFreq: true,
        note: (tr('gtfsNote', { feed: feedName, a: fmtDate(feed.start), b: fmtDate(feed.end) }) + (extra ? ' Also: ' + extra + '.' : '')).slice(0, 300) });
      lines++;
    });
    dlg.close();
    G.changed(); G.fit();
    G.toast(tr('gtfsDone', { r: lines, s: R.created }));
  }

  // ---------- entry points ----------
  window.GMMCGtfs = { open: (file) => open(file) };

  X.ready.push((GMMC) => {
    G = GMMC;
    const menu = $('exportMenu'), anchor = menu && menu.querySelector('[data-act="json"]');
    if (menu && anchor) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.id = 'gtfsImportItem';
      b.innerHTML = `${window.icon('upload_file', 24)}<span data-t="gtfsImport">${esc(tr('gtfsImport'))}</span>`;
      b.addEventListener('click', () => { menu.hidden = true; const eb = $('exportBtn'); if (eb) eb.setAttribute('aria-expanded', 'false'); open(); });
      anchor.after(b);
      if (G.applyI18n) G.applyI18n();
    }
    // A dropped .zip goes to the importer before the editor's JSON drop handler sees it.
    window.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || !/\.zip$/i.test(file.name)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      // The editor clears its drop overlay and drag counter in its own handler, which ignores a drop without a file.
      try { window.dispatchEvent(new DragEvent('drop', { dataTransfer: new DataTransfer() })); } catch { const o = $('dropOverlay'); if (o) o.hidden = true; }
      open(file);
    }, true);
  });
})();
