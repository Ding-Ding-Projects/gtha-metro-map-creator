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
    gtfsWorkerFailed: 'The feed reader could not start'
  }, {
    gtfsImport: '匯入 GTFS', gtfsTitle: '由 GTFS 匯入', gtfsSearch: '搜尋路線', gtfsAll: '全部', gtfsSubway: '地鐵', gtfsRail: '鐵路', gtfsTram: '輕鐵或電車',
    gtfsBus: '巴士', gtfsOther: '其他', gtfsRoutes: '條路線', gtfsSelected: '已選', gtfsMerge: '150 米內嘅站會合併', gtfsImportN: '匯入 {n} 條路線',
    gtfsImportOne: '匯入 1 條路線', gtfsCancel: '取消', gtfsReading: '讀取緊資料', gtfsPhaseZip: '開啟壓縮檔', gtfsPhaseTables: '讀取路線、班次同車站',
    gtfsPhaseTimes: '讀取停站時間', gtfsPhaseRoutes: '整理路線', gtfsNone: '冇符合嘅路線', gtfsFailed: '讀唔到呢份資料', gtfsDone: '已匯入 {r} 條路線，新增 {s} 個車站',
    gtfsStops: '個站', gtfsMin: '分鐘', gtfsNote: '由 {feed} 匯入，服務期 {a} 至 {b}。', gtfsPickZip: '揀一個 GTFS .zip 檔案', gtfsWorkerFailed: '資料讀取器開唔到'
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
  function build() {
    dlg = document.createElement('dialog'); dlg.id = 'gtfsDialog'; dlg.setAttribute('aria-labelledby', 'gtfsTitle');
    dlg.innerHTML = `<form method="dialog" class="dialog-body gtfs-body">
      <h2 id="gtfsTitle" class="headline"></h2>
      <p class="supporting gtfs-sub" id="gtfsSub" aria-live="polite"></p>
      <div class="gtfs-prog" id="gtfsProg" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div></div></div>
      <div class="search-bar gtfs-search">${window.icon('search', 24)}<input id="gtfsQuery" type="search" autocomplete="off" spellcheck="false"></div>
      <div class="gtfs-chips" id="gtfsChips" role="group"></div>
      <div class="gtfs-list" id="gtfsList" role="group"></div>
      <div class="gtfs-foot"><span class="supporting" id="gtfsCount" aria-live="polite"></span><span class="gtfs-actions">
        <button type="button" class="btn text" id="gtfsCancel"></button><button type="button" class="btn filled" id="gtfsGo"></button></span></div>
    </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { if (!dlg.open) stopWorker(); });
    $('gtfsCancel').addEventListener('click', () => dlg.close());
    $('gtfsGo').addEventListener('click', doImport);
    $('gtfsQuery').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
    $('gtfsChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-type]'); if (!b) return; state.filter = b.dataset.type; renderChips(); renderList(); });
    $('gtfsList').addEventListener('change', (e) => { const cb = e.target.closest('input[data-id]'); if (!cb) return; if (cb.checked) state.selected.add(cb.dataset.id); else state.selected.delete(cb.dataset.id); renderCount(); });
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'gtfsQuery') e.preventDefault(); });
  }
  function stopWorker() { if (worker) { worker.terminate(); worker = null; } }

  function open(file) {
    if (!G) return false;
    if (!dlg) build();
    stopWorker();
    state = { file: null, feed: null, routes: [], selected: new Set(), filter: 'all', query: '', busy: false };
    $('gtfsTitle').textContent = tr('gtfsTitle'); $('gtfsQuery').placeholder = tr('gtfsSearch'); $('gtfsQuery').setAttribute('aria-label', tr('gtfsSearch')); $('gtfsQuery').value = '';
    $('gtfsCancel').textContent = tr('gtfsCancel');
    renderChips(); renderList(); renderCount(); setProgress(null);
    $('gtfsSub').textContent = file ? file.name : tr('gtfsPickZip');
    if (!dlg.open) dlg.showModal();
    if (file) start(file); else chooseFile();
    return true;
  }
  function chooseFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.zip,application/zip';
    inp.addEventListener('change', () => { if (inp.files[0]) { $('gtfsSub').textContent = inp.files[0].name; start(inp.files[0]); } });
    inp.click();
  }

  function setProgress(p, phase) {
    const bar = $('gtfsProg'); bar.hidden = p === null;
    if (p !== null) { bar.setAttribute('aria-valuenow', String(p)); bar.firstElementChild.style.width = p + '%'; }
    if (phase) $('gtfsCount').textContent = tr(phase) + ' ' + p + '%';
  }

  function start(file) {
    stopWorker();
    state.file = file; state.busy = true; state.routes = []; state.selected.clear();
    renderChips(); renderList(); renderCount(); setProgress(0, 'gtfsReading');
    try { worker = new Worker('gtfs-worker.js'); } catch (err) { fail(tr('gtfsWorkerFailed') + ': ' + err.message); return; }
    const w = worker;
    w.onmessage = (ev) => {
      const m = ev.data; if (w !== worker) return;
      if (m.type === 'progress') setProgress(m.percent, PHASE[m.phase] || 'gtfsReading');
      else if (m.type === 'done') {
        state.busy = false; state.feed = m.result.feed; state.routes = m.result.routes.sort((a, b) => num(a.short || a.id, b.short || b.id));
        setProgress(null); stopWorker(); renderHead(); renderChips(); renderList(); renderCount();
      } else if (m.type === 'error') fail(m.message);
    };
    w.onerror = (e) => fail(e.message || tr('gtfsFailed'));
    w.postMessage({ type: 'parse', file });
  }
  function fail(msg) {
    state.busy = false; stopWorker(); setProgress(null);
    $('gtfsSub').innerHTML = `<span class="err">${esc(tr('gtfsFailed'))}: ${esc(msg)}</span>`;
    renderChips(); renderList(); renderCount();
  }

  function renderHead() {
    const f = state.feed, a = dateLabel(f.start), b = dateLabel(f.end);
    $('gtfsSub').textContent = [state.file.name, a && b ? `${a} – ${b}` : '', `${f.routeCount} ${tr('gtfsRoutes')}`].filter(Boolean).join(' · ');
  }
  function counts() { const c = { all: state.routes.length }; for (const r of state.routes) c[r.type] = (c[r.type] || 0) + 1; return c; }
  function renderChips() {
    const c = counts(), order = ['all', 'subway', 'rail', 'tram', 'bus', 'other'];
    $('gtfsChips').innerHTML = order.filter((k) => k === 'all' || c[k]).map((k) =>
      `<button type="button" class="gtfs-chip${state.filter === k ? ' on' : ''}" data-type="${k}" aria-pressed="${state.filter === k}">${esc(k === 'all' ? tr('gtfsAll') : tr(TYPE_KEY[k]))} ${c[k] || 0}</button>`).join('');
  }
  function visible() {
    const q = state.query.trim().toLowerCase();
    return state.routes.filter((r) => (state.filter === 'all' || r.type === state.filter) && (!q || (r.short + ' ' + r.long + ' ' + r.id).toLowerCase().includes(q)));
  }
  function freqText(r) { return r.peak || r.midday ? `${r.peak || '-'}/${r.midday || '-'} ${tr('gtfsMin')}` : ''; }
  function renderList() {
    const list = $('gtfsList');
    if (state.busy) { list.innerHTML = ''; return; }
    const rows = visible();
    if (!rows.length) { list.innerHTML = state.feed ? `<p class="supporting gtfs-empty">${esc(tr('gtfsNone'))}</p>` : ''; return; }
    list.innerHTML = rows.map((r) => {
      const f = freqText(r);
      return `<label class="gtfs-row"><input type="checkbox" data-id="${esc(r.id)}"${state.selected.has(r.id) ? ' checked' : ''}><span class="gtfs-num">${esc(r.short || r.id)}</span>
        <span class="gtfs-txt"><span class="gtfs-name">${esc(titleCase(r.long || r.short || r.id))}</span><span class="gtfs-meta">${esc(tr(TYPE_KEY[r.type]))} · ${r.stopCount} ${esc(tr('gtfsStops'))}${f ? ' · ' + esc(f) : ''}</span></span></label>`;
    }).join('');
  }
  function renderCount() {
    const n = state.selected.size;
    if (!state.busy) $('gtfsCount').textContent = n ? `${n} ${tr('gtfsSelected')} · ${tr('gtfsMerge')}` : tr('gtfsMerge');
    $('gtfsGo').textContent = n === 1 ? tr('gtfsImportOne') : tr('gtfsImportN', { n });
    $('gtfsGo').disabled = !n || state.busy;
  }

  // ---------- import ----------
  function doImport() {
    const chosen = state.routes.filter((r) => state.selected.has(r.id));
    if (!chosen.length) return;
    const map = G.getMap(), feed = state.feed;
    G.checkpoint();
    const f = G.fits();
    const feedName = feed.publisher || state.file.name;
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
    let added = 0, lines = 0;
    const byStop = new Map();
    chosen.forEach((r, idx) => {
      const [style, width] = STYLE[r.type] || STYLE.other, kind = r.type === 'bus' ? 'stop' : 'station';
      const path = [];
      for (const s of r.stops) {
        let st = byStop.get(s.id);
        if (!st) {
          st = find(s);
          if (!st) {
            const g = f.toGrid(G.geoGrid(s.lat, s.lon)), id = G.uid('st');
            st = map.stations[id] = { id, name: cleanStop(s.name), nameZh: '', label: 'auto', interchange: 'auto', kind, x: Math.round(g.x * 2) / 2, y: Math.round(g.y * 2) / 2, lat: s.lat, lon: s.lon };
            put(st); added++;
          }
          byStop.set(s.id, st);
        }
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
    G.toast(tr('gtfsDone', { r: lines, s: added }));
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
