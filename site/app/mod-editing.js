// mod-editing.js: see docs/features/editing.md. Registers hooks on window.GMMCX before app.js loads.
// Box select, copy and paste, command palette, pinch zoom, colour-blind view, colour checks.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const on = (name, fn) => { (X[name] = Array.isArray(X[name]) ? X[name] : []).push(fn); };
  let M = null; // window.GMMC, set on ready
  const t = (k) => window.I18N.t(k);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.I18N.add({
    edBoxHint: 'Hold Shift and drag on empty space to select stations',
    edCopied: 'Copied', edNothingToCopy: 'Select stations first, then copy', edNothingToPaste: 'Nothing copied yet', edPasted: 'Pasted',
    edStationsWord: 'stations', edCopySuffix: 'copy',
    edPalette: 'Command palette', edPaletteOpen: 'Command palette (Ctrl+K)', edPaletteSearch: 'Type a command, route or station',
    edNoCommands: 'No matching commands', edPaletteKeys: 'Up and down to choose, Enter to run, Esc to close',
    edCatTool: 'Tool', edCatExport: 'Export', edCatLayout: 'Layout', edCatView: 'View', edCatEdit: 'Edit', edCatRoute: 'Route', edCatStation: 'Station', edCatCb: 'Colour vision',
    edToolSelect: 'Tool: Select', edToolStation: 'Tool: Station', edToolLine: 'Tool: Draw line', edToolLabel: 'Tool: Label', edToolErase: 'Tool: Erase',
    edExpPng: 'Export PNG image', edExpPdf: 'Export PDF document', edExpSvg: 'Export SVG vector', edExpSite: 'Export website to host',
    edExpProject: 'Save project', edExpJson: 'Export map data (JSON)', edExpOpen: 'Open project or map',
    edLaySchematic: 'Layout: Schematic', edLayGeographic: 'Layout: Geographic',
    edToggleFreq: 'Toggle frequencies on the map', edToggleBg: 'Toggle map background', edToggleGrid: 'Toggle grid',
    edFit: 'Fit map to screen', edUndo: 'Undo', edRedo: 'Redo', edSettings: 'Open settings',
    edGoRoute: 'Go to route', edGoStation: 'Go to station',
    edCbLabel: 'Colour vision simulation (view only)', edCbNone: 'None', edCbProt: 'Protanopia', edCbDeut: 'Deuteranopia', edCbTrit: 'Tritanopia',
    edCbSet: 'Colour vision view', edCbNote: 'View only. Exports and the saved map are not changed.',
    edLowContrast: 'Colour is hard to see on a white background', edSimilar: 'Routes have nearly identical colours'
  }, {
    edBoxHint: '㩒住 Shift 喺空位拖，就可以框選車站',
    edCopied: '已複製', edNothingToCopy: '請先選取車站，再複製', edNothingToPaste: '未複製過任何嘢', edPasted: '已貼上',
    edStationsWord: '個站', edCopySuffix: '副本',
    edPalette: '指令面板', edPaletteOpen: '指令面板（Ctrl+K）', edPaletteSearch: '輸入指令、路線或車站',
    edNoCommands: '搵唔到相符嘅指令', edPaletteKeys: '用上下鍵揀，Enter 執行，Esc 關閉',
    edCatTool: '工具', edCatExport: '匯出', edCatLayout: '版面', edCatView: '檢視', edCatEdit: '編輯', edCatRoute: '路線', edCatStation: '車站', edCatCb: '色覺',
    edToolSelect: '工具：選取', edToolStation: '工具：車站', edToolLine: '工具：畫路線', edToolLabel: '工具：文字標籤', edToolErase: '工具：擦除',
    edExpPng: '匯出 PNG 圖片', edExpPdf: '匯出 PDF 文件', edExpSvg: '匯出 SVG 向量圖', edExpSite: '匯出可架設嘅網站',
    edExpProject: '儲存專案', edExpJson: '匯出地圖資料（JSON）', edExpOpen: '開啟專案或地圖',
    edLaySchematic: '版面：示意圖', edLayGeographic: '版面：地理圖',
    edToggleFreq: '切換地圖上嘅班次顯示', edToggleBg: '切換地圖底圖', edToggleGrid: '切換格線',
    edFit: '睇晒成幅圖', edUndo: '復原', edRedo: '重做', edSettings: '開啟設定',
    edGoRoute: '去路線', edGoStation: '去車站',
    edCbLabel: '色覺模擬（只係檢視）', edCbNone: '冇', edCbProt: '紅色盲', edCbDeut: '綠色盲', edCbTrit: '藍色盲',
    edCbSet: '色覺檢視', edCbNote: '只影響檢視。匯出同已儲存嘅地圖唔會改變。',
    edLowContrast: '喺白色背景上面好難睇到顏色', edSimilar: '路線顏色幾乎一樣'
  });

  const dlgOpen = () => !!document.querySelector('dialog[open]');
  const mapSvg = () => document.getElementById('map');

  // ---------- 1. box selection ----------
  let box = null; // { x0, y0, el, pid }
  function stageRect() { return document.getElementById('stage').getBoundingClientRect(); }
  function endBox() { if (box) { box.el.remove(); box = null; } }
  function stationsInBox(r) {
    const v = M.getView(), svg = mapSvg().getBoundingClientRect(), D = M.viewMap(M.dm()), G = M.G, geo = M.isGeo(), out = [];
    for (const s of Object.values(D.stations)) {
      const px = svg.left + (geo ? s.x * G : s.x * G * v.k) + v.tx, py = svg.top + (geo ? s.y * G : s.y * G * v.k) + v.ty;
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) out.push(s.id);
    }
    return out;
  }
  on('pointer', (e, p, tool, target) => {
    if (tool !== 'select' || !e.shiftKey || target || e.button !== 0 || pinch.pointers.size > 1) return false;
    endBox();
    const el = document.createElement('div'); el.className = 'ed-box'; el.setAttribute('aria-hidden', 'true');
    document.getElementById('stage').appendChild(el);
    box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, el, pid: e.pointerId };
    drawBox();
    try { mapSvg().setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers cannot be captured */ }
    return true;
  });
  function drawBox() {
    const s = stageRect(), l = Math.min(box.x0, box.x1), tp = Math.min(box.y0, box.y1);
    Object.assign(box.el.style, { left: l - s.left + 'px', top: tp - s.top + 'px', width: Math.abs(box.x1 - box.x0) + 'px', height: Math.abs(box.y1 - box.y0) + 'px' });
  }
  on('pointermove', (e) => {
    if (!box || e.pointerId !== box.pid) return false;
    box.x1 = e.clientX; box.y1 = e.clientY; drawBox(); return true;
  });
  on('pointerup', (e) => {
    if (!box || e.pointerId !== box.pid) return false;
    box.x1 = e.clientX; box.y1 = e.clientY;
    const r = { left: Math.min(box.x0, box.x1), right: Math.max(box.x0, box.x1), top: Math.min(box.y0, box.y1), bottom: Math.max(box.y0, box.y1) };
    const big = r.right - r.left > 3 || r.bottom - r.top > 3;
    endBox();
    if (big) {
      const ids = stationsInBox(r);
      M.setSelection(ids.length ? { type: 'station', ids } : null);
    } else M.setSelection(null);
    M.renderPanels(); M.render();
    return true;
  });

  // ---------- 2. copy and paste ----------
  let clip = null, pasteCount = 0;
  function copySelection() {
    const sel = M.getSelection();
    if (!sel || sel.type !== 'station' || !sel.ids.length) { M.toast(t('edNothingToCopy')); return; }
    const map = M.getMap(), set = new Set(sel.ids);
    const stations = sel.ids.filter((id) => map.stations[id]).map((id) => JSON.parse(JSON.stringify(map.stations[id])));
    const runs = [];
    for (const l of map.lines) {
      let cur = [];
      const flush = () => {
        while (cur.length && cur[cur.length - 1].ref[0] === '@') cur.pop();
        if (cur.filter((c) => c.ref[0] !== '@').length >= 2) runs.push({ line: JSON.parse(JSON.stringify(Object.assign({}, l, { path: [], bends: {} }))), refs: cur.map((c) => c.ref), bends: cur.slice(0, -1).map((c) => l.bends && l.bends[c.i] ? l.bends[c.i] : null) });
        cur = [];
      };
      l.path.forEach((ref, i) => {
        if (set.has(ref)) cur.push({ ref, i });
        else if (ref[0] === '@' && cur.length) cur.push({ ref, i });
        else flush();
      });
      flush();
    }
    clip = { stations, runs }; pasteCount = 0;
    M.toast(t('edCopied') + ': ' + stations.length + ' ' + t('edStationsWord'));
  }
  function pasteClip() {
    if (!clip || !clip.stations.length) { M.toast(t('edNothingToPaste')); return; }
    pasteCount++;
    const map = M.getMap(), off = 2 * pasteCount, geo = M.isGeo(), v = M.getView();
    const goff = (2 * pasteCount) / Math.max(v.k, 0.05); // geographic grid units that are 2 grid cells on screen
    M.checkpoint();
    const idMap = {};
    for (const src of clip.stations) {
      const id = M.uid('st'), s = JSON.parse(JSON.stringify(src));
      s.id = id; delete s.osm; s.x = src.x + off; s.y = src.y + off; s.name = src.name + ' ' + t('edCopySuffix');
      if (geo || src.lat !== undefined) {
        const base = M.stGeo(src), ll = M.gridToLatLon({ x: base.x + (geo ? goff : off), y: base.y + (geo ? goff : off) });
        s.lat = ll.lat; s.lon = ll.lon;
      }
      map.stations[id] = s; idMap[src.id] = id;
    }
    for (const run of clip.runs) {
      const path = run.refs.map((ref) => {
        if (ref[0] === '@') { const [x, y] = ref.slice(1).split(',').map(Number); return '@' + (x + off) + ',' + (y + off); }
        return idMap[ref];
      });
      if (path.some((r) => !r)) continue;
      const bends = {}; run.bends.forEach((b, i) => { if (b) bends[i] = b; });
      const line = Object.assign(JSON.parse(JSON.stringify(run.line)), { id: M.uid('line'), name: run.line.name + ' ' + t('edCopySuffix'), path, bends });
      map.lines.push(line);
    }
    M.setSelection({ type: 'station', ids: Object.values(idMap) });
    M.changed();
    M.toast(t('edPasted') + ': ' + clip.stations.length + ' ' + t('edStationsWord'), true);
  }

  on('keydown', (e, typing) => {
    if (!M) return false;
    const mod = e.ctrlKey || e.metaKey, key = (e.key || '').toLowerCase();
    if (mod && key === 'k') { e.preventDefault(); togglePalette(); return true; }
    if (typing || !mod || e.shiftKey || e.altKey) return false;
    if (key === 'c') { const sel = M.getSelection(); if (sel && sel.type === 'station') { e.preventDefault(); copySelection(); return true; } return false; }
    if (key === 'v') { if (!clip) return false; e.preventDefault(); pasteClip(); return true; }
    return false;
  });
  on('keydown', (e) => { if (e.key === 'Escape' && box) { endBox(); return true; } return false; });

  // ---------- 4. pinch zoom and pan ----------
  const pinch = { pointers: new Map(), active: false, suppress: false, d0: 0, k0: 1, tx0: 0, ty0: 0, mx0: 0, my0: 0, raf: 0 };
  const onMap = (e) => e.target === mapSvg() || (e.target.closest && e.target.closest('#map'));
  function pinchGeom() {
    const [a, b] = [...pinch.pointers.values()], r = mapSvg().getBoundingClientRect();
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
  }
  document.addEventListener('pointerdown', (e) => {
    if (!M || !onMap(e)) return;
    pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.pointers.size === 2) {
      endBox();
      const v = M.getView(), g = pinchGeom();
      Object.assign(pinch, { active: true, suppress: true, d0: g.d, k0: v.k, tx0: v.tx, ty0: v.ty, mx0: g.mx, my0: g.my });
      e.stopPropagation(); e.preventDefault();
    } else if (pinch.suppress) e.stopPropagation();
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!M || !pinch.pointers.has(e.pointerId)) return;
    pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch.suppress) return;
    e.stopPropagation();
    if (!pinch.active || pinch.pointers.size !== 2) return;
    const g = pinchGeom(), v = M.getView(), lo = M.isGeo() ? 0.04 : 0.08, hi = M.isGeo() ? 64 : 4;
    const k = Math.min(hi, Math.max(lo, pinch.k0 * g.d / pinch.d0)), f = k / pinch.k0;
    v.k = k; v.tx = g.mx - (pinch.mx0 - pinch.tx0) * f; v.ty = g.my - (pinch.my0 - pinch.ty0) * f;
    if (!pinch.raf) pinch.raf = requestAnimationFrame(() => { pinch.raf = 0; M.render(); });
  }, true);
  function pointerGone(e) {
    if (!M || !pinch.pointers.has(e.pointerId)) return;
    pinch.pointers.delete(e.pointerId);
    if (pinch.pointers.size < 2) pinch.active = false;
    if (pinch.suppress) {
      if (pinch.pointers.size === 0) pinch.suppress = false; // the last release goes through so the editor clears its own drag state
      else e.stopPropagation();
    }
  }
  document.addEventListener('pointerup', pointerGone, true);
  document.addEventListener('pointercancel', pointerGone, true);

  // ---------- 5. colour-blind view ----------
  const CB = {
    none: null,
    prot: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
    deut: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
    trit: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0'
  };
  const CB_KEY = { none: 'edCbNone', prot: 'edCbProt', deut: 'edCbDeut', trit: 'edCbTrit' };
  let cbMode = 'none';
  function ensureCbFilters() {
    if (document.getElementById('edCbDefs')) return;
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.id = 'edCbDefs'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true'); svg.style.position = 'absolute';
    for (const k of ['prot', 'deut', 'trit']) {
      const f = document.createElementNS(ns, 'filter'); f.id = 'edCb_' + k;
      const m = document.createElementNS(ns, 'feColorMatrix'); m.setAttribute('type', 'matrix'); m.setAttribute('values', CB[k]);
      f.appendChild(m); svg.appendChild(f);
    }
    document.body.appendChild(svg);
  }
  function setCb(mode) {
    if (!(mode in CB)) mode = 'none';
    cbMode = mode; ensureCbFilters();
    mapSvg().style.filter = CB[mode] ? 'url(#edCb_' + mode + ')' : '';
    const sel = document.getElementById('edCbSelect'); if (sel) sel.value = mode;
    document.documentElement.setAttribute('data-cb', mode);
  }

  // ---------- 6. map check ----------
  function parseColor(c) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim()); if (!m) return null;
    let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const lum = (rgb) => { const f = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const contrastOnWhite = (rgb) => 1.05 / (lum(rgb) + 0.05);
  on('issues', (map) => {
    const out = [], withColor = [];
    for (const l of map.lines) {
      const rgb = parseColor(l.color); if (!rgb) continue;
      withColor.push({ l, rgb });
      const c = contrastOnWhite(rgb);
      if (c < 3) out.push({ line: l.id, msg: t('edLowContrast') + ': ' + l.name + ' (' + c.toFixed(1) + ':1)' });
    }
    for (let i = 0; i < withColor.length; i++) for (let j = i + 1; j < withColor.length; j++) {
      const a = withColor[i], b = withColor[j];
      if (Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]) < 25) out.push({ line: a.l.id, msg: t('edSimilar') + ': ' + a.l.name + ' / ' + b.l.name });
    }
    return out;
  });

  // ---------- 3. command palette ----------
  let dlg = null, listEl = null, inputEl = null, cmds = [], shown = [], cursor = 0;
  function centerView(pts, minK) {
    const v = M.getView(), r = mapSvg().getBoundingClientRect();
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), G = M.G;
    const lo = M.isGeo() ? 0.04 : 0.08, hi = M.isGeo() ? 64 : 4;
    let k = Math.min(r.width / ((x1 - x0) * G + 160), r.height / ((y1 - y0) * G + 160));
    k = Math.min(M.isGeo() ? 8 : 3, Math.max(minK, k)); k = Math.min(hi, Math.max(lo, k));
    v.k = k; v.tx = r.width / 2 - ((x0 + x1) / 2) * G * k; v.ty = r.height / 2 - ((y0 + y1) / 2) * G * k;
    M.render();
  }
  const gridPos = (s) => (M.isGeo() ? M.stGeo(s) : s);
  function buildCommands() {
    const list = [], map = M.getMap(), S = M.getSettings();
    const add = (cat, icon, name, run, extra) => list.push({ cat, icon, name, run, extra: extra || '' });
    const C = { tool: t('edCatTool'), exp: t('edCatExport'), lay: t('edCatLayout'), view: t('edCatView'), edit: t('edCatEdit'), cb: t('edCatCb') };
    [['select', 'edToolSelect', 'arrow_selector_tool'], ['station', 'edToolStation', 'add_location_alt'], ['line', 'edToolLine', 'conversion_path'], ['label', 'edToolLabel', 'title'], ['erase', 'edToolErase', 'ink_eraser']]
      .forEach(([id, key, ic]) => add(C.tool, ic, t(key), () => M.setTool(id)));
    [['png', 'edExpPng', 'image'], ['pdf', 'edExpPdf', 'picture_as_pdf'], ['svg', 'edExpSvg', 'route'], ['site', 'edExpSite', 'public'], ['project', 'edExpProject', 'save'], ['json', 'edExpJson', 'upload_file'], ['open', 'edExpOpen', 'folder_open']]
      .forEach(([id, key, ic]) => add(C.exp, ic, t(key), () => M.exportAct(id)));
    add(C.lay, 'sync_alt', t('edLaySchematic'), () => M.setLayout('schematic'));
    add(C.lay, 'map', t('edLayGeographic'), () => M.setLayout('geographic'));
    add(C.view, 'schedule', t('edToggleFreq'), () => { S.showFreq = !S.showFreq; M.saveSettings(); M.render(); });
    add(C.view, 'layers', t('edToggleBg'), () => { S.background = S.background === 'osm' ? 'none' : 'osm'; M.saveSettings(); M.render(); });
    add(C.view, 'swap_horiz', t('edToggleGrid'), () => { S.grid = !S.grid; M.saveSettings(); M.render(); });
    add(C.view, 'fit_screen', t('edFit'), () => M.fit());
    add(C.edit, 'undo', t('edUndo'), () => M.undo());
    add(C.edit, 'redo', t('edRedo'), () => M.redo());
    add(C.view, 'settings', t('edSettings'), () => document.getElementById('settingsBtn').click());
    for (const k of ['none', 'prot', 'deut', 'trit']) add(C.cb, 'visibility', t('edCbSet') + ': ' + t(CB_KEY[k]), () => setCb(k));
    for (const l of map.lines) {
      const nm = l.name + (l.nameZh ? ' · ' + l.nameZh : '');
      add(t('edCatRoute'), 'directions_bus', t('edGoRoute') + ' ' + nm, () => {
        const pts = l.path.filter((r) => map.stations[r]).map((r) => gridPos(map.stations[r]));
        M.setSelection({ type: 'line', id: l.id }); M.setActiveLine(l.id); M.renderPanels();
        if (pts.length) centerView(pts, 0.1); else M.render();
      }, l.name + ' ' + (l.nameZh || ''));
    }
    for (const s of Object.values(map.stations)) {
      add(t('edCatStation'), 'my_location', t('edGoStation') + ' ' + s.name + (s.nameZh ? ' · ' + s.nameZh : ''), () => {
        M.setSelection({ type: 'station', ids: [s.id] }); M.renderPanels();
        centerView([gridPos(s)], M.isGeo() ? 2 : 1);
      }, s.name + ' ' + (s.nameZh || ''));
    }
    return list;
  }
  function ensureDialog() {
    if (dlg) return;
    dlg = document.createElement('dialog'); dlg.id = 'edPalette'; dlg.className = 'ed-palette';
    dlg.setAttribute('aria-label', t('edPalette'));
    dlg.innerHTML = `<div class="ed-p-body"><div class="ed-p-search"><span class="ed-p-ic">${window.icon('search', 24)}</span>
      <input id="edPInput" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="edPList" aria-autocomplete="list" maxlength="120"></div>
      <ul id="edPList" class="ed-p-list" role="listbox"></ul>
      <p class="ed-p-foot supporting" id="edPFoot"></p></div>`;
    document.body.appendChild(dlg);
    inputEl = dlg.querySelector('#edPInput'); listEl = dlg.querySelector('#edPList');
    inputEl.addEventListener('input', () => { cursor = 0; renderList(); });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); cursor = 0; paintCursor(); }
      else if (e.key === 'End') { e.preventDefault(); cursor = shown.length - 1; paintCursor(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(cursor); }
    });
    listEl.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); });
    listEl.addEventListener('pointermove', (e) => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== cursor) { cursor = +li.dataset.i; paintCursor(false); } });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  function renderList() {
    const q = inputEl.value.trim().toLowerCase();
    shown = (q ? cmds.filter((c) => (c.name + ' ' + c.cat + ' ' + c.extra).toLowerCase().includes(q)) : cmds.filter((c) => c.cat !== t('edCatStation'))).slice(0, 80);
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));
    listEl.innerHTML = shown.length ? shown.map((c, i) => `<li role="option" id="edP${i}" data-i="${i}" aria-selected="${i === cursor}"><span class="ed-p-ic">${window.icon(c.icon, 24)}</span><span class="ed-p-name">${esc(c.name)}</span><span class="ed-p-cat">${esc(c.cat)}</span></li>`).join('') : `<li class="ed-p-empty" role="presentation">${esc(t('edNoCommands'))}</li>`;
    paintCursor();
  }
  function paintCursor(scroll = true) {
    [...listEl.querySelectorAll('li[data-i]')].forEach((li) => li.setAttribute('aria-selected', String(+li.dataset.i === cursor)));
    const cur = document.getElementById('edP' + cursor);
    if (cur) { inputEl.setAttribute('aria-activedescendant', cur.id); if (scroll) cur.scrollIntoView({ block: 'nearest' }); } else inputEl.removeAttribute('aria-activedescendant');
  }
  function move(d) { if (!shown.length) return; cursor = (cursor + d + shown.length) % shown.length; paintCursor(); }
  function run(i) {
    const c = shown[i]; if (!c) return;
    dlg.close();
    try { c.run(); } catch (err) { console.error('command', c.name, err); }
  }
  function togglePalette() {
    ensureDialog();
    if (dlg.open) { dlg.close(); return; }
    if (dlgOpen()) return; // another dialog (settings, setup) is in front
    cmds = buildCommands(); cursor = 0; inputEl.value = '';
    dlg.setAttribute('aria-label', t('edPalette')); inputEl.placeholder = t('edPaletteSearch');
    dlg.querySelector('#edPFoot').textContent = t('edPaletteKeys');
    renderList(); dlg.showModal(); inputEl.focus();
  }

  // ---------- settings entries (injected into the existing dialog) ----------
  function injectSettings() {
    const host = document.querySelector('#settingsDialog .dialog-scroll'); if (!host || document.getElementById('edCbSelect')) return;
    const wrap = document.createElement('div'); wrap.className = 'ed-settings';
    wrap.innerHTML = `<h3 class="title-sm" data-t="edCbLabel">${esc(t('edCbLabel'))}</h3>
      <label class="tf"><span class="tf-label" data-t="edCbSet">${esc(t('edCbSet'))}</span><span class="tf-select"><select id="edCbSelect">${Object.keys(CB).map((k) => `<option value="${k}" data-t="${CB_KEY[k]}">${esc(t(CB_KEY[k]))}</option>`).join('')}</select><span>${window.icon('arrow_drop_down', 18)}</span></span></label>
      <p class="supporting" data-t="edCbNote">${esc(t('edCbNote'))}</p>
      <div class="row wrap"><button type="button" class="btn outlined" id="edPaletteBtn" data-t="edPaletteOpen">${esc(t('edPaletteOpen'))}</button></div>`;
    host.insertBefore(wrap, host.firstChild);
    wrap.querySelector('#edCbSelect').value = cbMode;
    wrap.querySelector('#edCbSelect').addEventListener('change', (e) => setCb(e.target.value));
    wrap.querySelector('#edPaletteBtn').addEventListener('click', () => { const s = document.getElementById('settingsDialog'); if (s.open) s.close(); togglePalette(); });
  }

  on('ready', (g) => {
    M = g; ensureCbFilters(); injectSettings();
    mapSvg().setAttribute('aria-describedby', 'edBoxHintText');
    const hint = document.createElement('span'); hint.id = 'edBoxHintText'; hint.className = 'vh'; hint.setAttribute('data-t', 'edBoxHint'); hint.textContent = t('edBoxHint');
    document.getElementById('stage').appendChild(hint);
    if (g.applyI18n) g.applyI18n(); // labels of the injected controls follow the current language
  });
})();
