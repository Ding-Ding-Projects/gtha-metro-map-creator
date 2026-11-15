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
  const DEFAULT_SETTINGS = { lang: 'en', theme: 'system', grid: true, snap: true, fontSize: 13, legend: true, sound: true };

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
        label: DIRS[s.label] ? s.label : 'auto', interchange: ['auto', 'yes', 'no'].includes(s.interchange) ? s.interchange : 'auto' };
    }
    for (const l of m.lines) {
      if (!l || !Array.isArray(l.path)) return null;
      const path = l.path.filter((r) => typeof r === 'string' && (r[0] === '@' ? /^@-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(r) : out.stations[r]));
      out.lines.push({ id: String(l.id || uid('line')), name: String(l.name || 'Line').slice(0, 80), nameZh: String(l.nameZh || '').slice(0, 80),
        color: /^#[0-9a-fA-F]{6}$/.test(l.color) ? l.color : '#1F5FBF', width: Math.min(16, Math.max(3, +l.width || 8)),
        style: ['solid', 'dashed', 'rail'].includes(l.style) ? l.style : 'solid', visible: l.visible !== false, path,
        bends: (l.bends && typeof l.bends === 'object') ? Object.fromEntries(Object.entries(l.bends).filter(([, v]) => v === 'late' || v === 'early')) : {} });
    }
    for (const lb of (Array.isArray(m.labels) ? m.labels : [])) {
      if (lb && Number.isFinite(+lb.x) && Number.isFinite(+lb.y)) out.labels.push({ id: String(lb.id || uid('lbl')), x: +lb.x, y: +lb.y, text: String(lb.text || '').slice(0, 300), size: Math.min(48, Math.max(8, +lb.size || 14)) });
    }
    return out;
  }
  const lineById = (id) => map.lines.find((l) => l.id === id);
  function nodePos(ref) {
    if (ref[0] === '@') { const [x, y] = ref.slice(1).split(',').map(Number); return { x, y }; }
    const s = map.stations[ref]; return s ? { x: s.x, y: s.y } : null;
  }
  function servingLines(id) { return map.lines.filter((l) => l.path.includes(id)); }
  function isInterchange(s) {
    if (s.interchange === 'yes') return true;
    if (s.interchange === 'no') return false;
    return servingLines(s.id).length > 1;
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
    saveTimer = setTimeout(() => { if (store.set(STORE_MAP, map) && save) setStatus(t('saved')); }, 400);
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
          bd = { pts: route(a, b, mode).map((p) => ({ x: p.x * G, y: p.y * G })), lines: [] };
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
    if (ref[0] === '@') { const [x, y] = ref.slice(1).split(',').map(Number); return { x, y }; }
    const s = m.stations[ref]; return s ? { x: s.x, y: s.y } : null;
  }
  const polyD = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('');

  function labelPlacement(m, s, geo, fs) {
    const name = displayName(s);
    const w = Math.max(name.main.length, name.sub.length * 1.6) * fs * 0.58 + 6;
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

  // ---------- SVG building (shared by editor and export) ----------
  function buildMapSvg(m, opts) {
    const geo = computeGeometry(m);
    const fs = settings.fontSize;
    let out = '';
    for (const g of geo) {
      const l = g.line, d = polyD(g.poly);
      if (!g.poly.length) continue;
      if (l.style === 'rail') {
        out += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
        out += `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${Math.max(1.5, l.width * 0.28)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else {
        out += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"${l.style === 'dashed' ? ` stroke-dasharray="${l.width * 1.4} ${l.width}"` : ''}/>`;
      }
      if (opts.editor) for (const e of g.edges) out += `<path class="hit" d="${polyD(e.pts)}" stroke-width="${Math.max(16, l.width + 8)}" data-line="${esc(l.id)}" data-edge="${e.index}"/>`;
    }
    for (const s of Object.values(m.stations)) {
      const inter = isInterchangeIn(m, s);
      const lines = m.lines.filter((l) => l.visible && l.path.includes(s.id));
      const col = lines[0] ? lines[0].color : '#16181D';
      const r = inter ? 9 : 6;
      out += `<g data-st="${esc(s.id)}"><circle cx="${s.x * G}" cy="${s.y * G}" r="${r}" fill="#FFFFFF" stroke="${inter ? '#16181D' : col}" stroke-width="${inter ? 3.5 : 3}"/>`;
      if (opts.editor) out += `<circle cx="${s.x * G}" cy="${s.y * G}" r="14" fill="transparent"/>`;
      out += '</g>';
      const rc = labelPlacement(m, s, geo, fs);
      if (rc) {
        const nm = displayName(s), [ux] = DIRS[rc.dir];
        const anchor = ux > 0 ? 'start' : ux < 0 ? 'end' : 'middle';
        const tx = ux > 0 ? rc.x0 + 2 : ux < 0 ? rc.x1 - 2 : (rc.x0 + rc.x1) / 2;
        const weight = inter ? 700 : 500;
        out += `<text class="st-label" x="${tx.toFixed(1)}" y="${(rc.y0 + fs).toFixed(1)}" font-size="${fs}" font-weight="${weight}" text-anchor="${anchor}" data-st="${esc(s.id)}"${opts.exportColors ? ' fill="#16181D" stroke="#FFFFFF"' : ''}>${esc(nm.main)}</text>`;
        if (nm.sub) out += `<text class="st-label" x="${tx.toFixed(1)}" y="${(rc.y0 + fs * 2.1).toFixed(1)}" font-size="${(fs * 0.9).toFixed(1)}" text-anchor="${anchor}"${opts.exportColors ? ' fill="#16181D" stroke="#FFFFFF"' : ''}>${esc(nm.sub)}</text>`;
      }
    }
    for (const lb of m.labels) {
      out += `<text class="map-label" data-label="${esc(lb.id)}" x="${lb.x * G}" y="${lb.y * G}" font-size="${lb.size}"${opts.exportColors ? ' fill="#545249"' : ''}>${esc(lb.text)}</text>`;
    }
    return { svg: out, geo };
  }
  function isInterchangeIn(m, s) {
    if (s.interchange === 'yes') return true;
    if (s.interchange === 'no') return false;
    return m.lines.filter((l) => l.path.includes(s.id)).length > 1;
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
    const { svg } = buildMapSvg(map, { editor: true });
    let sel = '';
    if (selection && selection.type === 'station') for (const id of selection.ids) { const s = map.stations[id]; if (s) sel += `<circle class="sel-ring" cx="${s.x * G}" cy="${s.y * G}" r="16"/>`; }
    if (selection && (selection.type === 'edge' || selection.type === 'line')) {
      const lid = selection.lineId || selection.id;
      const g = computeGeometry(map).find((x) => x.line.id === lid);
      if (g) {
        const pts = selection.type === 'edge' ? (g.edges.find((e) => e.index === selection.index) || {}).pts : g.poly;
        if (pts) sel += `<path d="${polyD(pts)}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6 4"/>`;
      }
    }
    if (selection && selection.type === 'label') { const lb = map.labels.find((l) => l.id === selection.id); if (lb) sel += `<rect class="sel-ring" x="${lb.x * G - 4}" y="${lb.y * G - lb.size - 2}" width="${lb.text.length * lb.size * 0.56 + 8}" height="${lb.size + 10}" rx="4"/>`; }
    const grid = settings.grid ? `<rect x="-20000" y="-20000" width="40000" height="40000" fill="url(#gridPat)"/>` : '';
    vp.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);
    vp.innerHTML = grid + svg + sel;
    svgEl.className.baseVal = 'tool-' + tool + (drag && drag.kind === 'pan' ? ' panning' : '');
    const n = Object.keys(map.stations).length;
    $('undoBtn').disabled = !past.length; $('redoBtn').disabled = !future.length;
    if (!drag) setStatus(`${t('stations')}: ${n} · ${t('lineCount')}: ${map.lines.length} · ${t('zoom')}: ${Math.round(view.k * 100)}%`, true);
  }
  function setStatus(msg, quiet) { $('statusBar').textContent = msg; if (!quiet) toast(msg); }
  let toastTimer = 0;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1800); }

  function fit() {
    const b = bounds(map), r = svgEl.getBoundingClientRect();
    const w = Math.max(1, b.x1 - b.x0 + 160), h = Math.max(1, b.y1 - b.y0 + 160);
    view.k = Math.min(3, Math.max(0.1, Math.min(r.width / w, r.height / h)));
    view.tx = r.width / 2 - ((b.x0 + b.x1) / 2) * view.k;
    view.ty = r.height / 2 - ((b.y0 + b.y1) / 2) * view.k;
    render();
  }
  function centerOn(x, y) { const r = svgEl.getBoundingClientRect(); view.k = Math.max(view.k, 1); view.tx = r.width / 2 - x * G * view.k; view.ty = r.height / 2 - y * G * view.k; render(); }

  // ---------- panels ----------
  const TOOLS = [['select', 'V'], ['station', 'S'], ['line', 'L'], ['label', 'T'], ['erase', 'E']];
  function renderTools() {
    $('tools').innerHTML = TOOLS.map(([id, key]) => {
      const lbl = { select: t('select'), station: t('station'), line: t('drawLine'), label: t('label'), erase: t('erase') }[id];
      return `<button type="button" data-tool="${id}" aria-pressed="${tool === id}" aria-keyshortcuts="${key}" title="${esc(lbl)} (${key})">${esc(lbl)}</button>`;
    }).join('');
  }
  function renderLines() {
    $('lineList').innerHTML = map.lines.map((l) => {
      const stops = l.path.filter((r) => r[0] !== '@').length;
      const on = activeLineId === l.id;
      return `<li><button type="button" class="pick${on ? ' on' : ''}" data-pickline="${esc(l.id)}" aria-pressed="${on}"><span class="swatch" style="background:${l.color}"></span><span class="n">${esc(lineName(l))}</span><span class="hint">${stops}</span></button>` +
        `<button type="button" class="eye" data-eye="${esc(l.id)}" aria-pressed="${!l.visible}" aria-label="${esc((l.visible ? t('hide') : t('show')) + ' ' + l.name)}">${esc(l.visible ? t('hide') : t('show'))}</button></li>`;
    }).join('');
  }
  const lineName = (l) => (settings.lang === 'yue' && l.nameZh) ? l.nameZh : (settings.lang === 'both' && l.nameZh) ? l.name + ' · ' + l.nameZh : l.name;
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
    $('issueList').innerHTML = issues.length ? issues.slice(0, 60).map((i) => `<li><button type="button" ${i.id ? `data-goto="${esc(i.id)}"` : `data-pickline="${esc(i.line)}"`}>${esc(i.msg)}</button></li>`).join('') : `<li class="hint">${esc(t('noIssues'))}</li>`;
  }
  function runSearch() {
    const q = $('searchInput').value, mode = $('searchMode').value, ic = $('searchCase').checked;
    const status = $('searchStatus'), list = $('searchResults');
    status.classList.remove('err');
    if (!q) { status.textContent = ''; list.innerHTML = ''; return; }
    let test;
    if (mode === 'regex') {
      if (q.length > 200) { status.textContent = t('invalidPattern'); status.classList.add('err'); list.innerHTML = ''; return; }
      try { const re = new RegExp(q, ic ? 'iu' : 'u'); test = (s) => re.test(s); } catch (e) { status.textContent = t('invalidPattern') + ': ' + e.message; status.classList.add('err'); list.innerHTML = ''; return; }
    } else { const needle = ic ? q.toLowerCase() : q; test = (s) => (ic ? s.toLowerCase() : s).includes(needle); }
    const hits = Object.values(map.stations).filter((s) => test(s.name) || (s.nameZh && test(s.nameZh))).sort((a, b) => a.name.localeCompare(b.name));
    status.textContent = hits.length ? hits.length + ' ' + t('matches') : t('noMatches');
    list.innerHTML = hits.slice(0, 50).map((s) => `<li><button type="button" data-goto="${esc(s.id)}">${esc(s.name)}${s.nameZh ? ' · ' + esc(s.nameZh) : ''}</button></li>`).join('');
  }

  function field(label, html) { return `<label><span>${esc(label)}</span>${html}</label>`; }
  function renderInspector() {
    const el = $('inspector');
    const active = activeLineId && lineById(activeLineId);
    let head = `<p class="hint">${esc(t('activeLine'))}: ${active ? `<strong>${esc(lineName(active))}</strong>` : esc(t('noActiveLine'))}</p>`;
    if (!selection) { el.innerHTML = head + `<p class="hint">${esc(t('nothingSelected'))}</p>`; return; }
    let h = '';
    if (selection.type === 'station' && selection.ids.length === 1) {
      const s = map.stations[selection.ids[0]];
      const dirOpts = ['auto'].concat(DIR_ORDER).map((d) => `<option value="${d}"${s.label === d ? ' selected' : ''}>${d === 'auto' ? esc(t('auto')) : d}</option>`).join('');
      const ixOpts = [['auto', t('auto')], ['yes', t('yes')], ['no', t('no')]].map(([v, n]) => `<option value="${v}"${s.interchange === v ? ' selected' : ''}>${esc(n)}</option>`).join('');
      const chips = servingLines(s.id).map((l) => `<span class="chip"><span class="swatch" style="background:${l.color}"></span>${esc(lineName(l))}</span>`).join('');
      h = `<div class="insp">${field(t('name'), `<input type="text" data-f="st.name" value="${esc(s.name)}" maxlength="80">`)}
        ${field(t('nameZh'), `<input type="text" data-f="st.nameZh" value="${esc(s.nameZh)}" maxlength="80" lang="yue-Hant">`)}
        ${field(t('labelPos'), `<select data-f="st.label">${dirOpts}</select>`)}
        ${field(t('interchange'), `<select data-f="st.interchange">${ixOpts}</select>`)}
        <p class="hint">x ${s.x}, y ${s.y}</p>
        <h3>${esc(t('servedBy'))}</h3><div class="chips">${chips || '<span class="hint">-</span>'}</div>
        <div class="row"><button type="button" data-act="addToLine"${active ? '' : ' disabled'}>${esc(t('addToLine'))}</button>
        <button type="button" class="danger" data-act="delSel">${esc(t('delete'))}</button></div></div>`;
    } else if (selection.type === 'station') {
      h = `<div class="insp"><p><strong>${selection.ids.length}</strong> ${esc(t('selected'))}</p><div class="row">
        <button type="button" data-act="alignH">${esc(t('alignH'))}</button><button type="button" data-act="alignV">${esc(t('alignV'))}</button>
        <button type="button" class="danger" data-act="delSel">${esc(t('delete'))}</button></div></div>`;
    } else if (selection.type === 'line' || selection.type === 'edge') {
      const l = lineById(selection.lineId || selection.id);
      const styleOpts = [['solid', t('solid')], ['dashed', t('dashed')], ['rail', t('rail')]].map(([v, n]) => `<option value="${v}"${l.style === v ? ' selected' : ''}>${esc(n)}</option>`).join('');
      h = `<div class="insp">${field(t('name'), `<input type="text" data-f="ln.name" value="${esc(l.name)}" maxlength="80">`)}
        ${field(t('nameZh'), `<input type="text" data-f="ln.nameZh" value="${esc(l.nameZh)}" maxlength="80" lang="yue-Hant">`)}
        <div class="row">${field(t('color'), `<input type="color" data-f="ln.color" value="${l.color}">`)}${field(t('width') + ' ' + l.width, `<input type="range" min="3" max="16" data-f="ln.width" value="${l.width}">`)}</div>
        ${field(t('style'), `<select data-f="ln.style">${styleOpts}</select>`)}
        <p class="hint">${l.path.filter((r) => r[0] !== '@').length} ${esc(t('stops'))}</p>
        <div class="row"><button type="button" data-act="moveUp">${esc(t('moveUp'))}</button><button type="button" data-act="moveDown">${esc(t('moveDown'))}</button>
        <button type="button" data-act="reverse">${esc(t('reverse'))}</button><button type="button" class="danger" data-act="delLine">${esc(t('delete'))}</button></div>`;
      if (selection.type === 'edge') {
        const mode = l.bends[selection.index] || 'early';
        h += `<h3>${esc(t('segment'))} ${selection.index + 1}</h3>${field(t('bend'), `<select data-f="edge.bend"><option value="early"${mode === 'early' ? ' selected' : ''}>${esc(t('bendEarly'))}</option><option value="late"${mode === 'late' ? ' selected' : ''}>${esc(t('bendLate'))}</option></select>`)}
          <div class="row"><button type="button" data-act="insertStation">${esc(t('insertStation'))}</button><button type="button" class="danger" data-act="eraseEdge">${esc(t('erase'))}</button></div>`;
      }
      h += '</div>';
    } else if (selection.type === 'label') {
      const lb = map.labels.find((x) => x.id === selection.id);
      h = `<div class="insp">${field(t('text'), `<input type="text" data-f="lb.text" value="${esc(lb.text)}" maxlength="300">`)}
        ${field(t('size') + ' ' + lb.size, `<input type="range" min="8" max="48" data-f="lb.size" value="${lb.size}">`)}
        <div class="row"><button type="button" class="danger" data-act="delSel">${esc(t('delete'))}</button></div></div>`;
    }
    el.innerHTML = head + h;
  }
  function renderPanels() { renderTools(); renderLines(); renderIssues(); renderInspector(); runSearch(); }
  function applyI18n() {
    window.I18N.setLang(settings.lang);
    document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
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
  function snapPt(p) { return settings.snap ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: Math.round(p.x * 4) / 4, y: Math.round(p.y * 4) / 4 }; }
  function worldFromEvent(e) { const r = svgEl.getBoundingClientRect(); return { x: (e.clientX - r.left - view.tx) / view.k / G, y: (e.clientY - r.top - view.ty) / view.k / G }; }
  function addStation(p) {
    const id = uid('st'); const n = Object.keys(map.stations).length + 1;
    map.stations[id] = { id, name: 'Station ' + n, nameZh: '', x: p.x, y: p.y, label: 'auto', interchange: 'auto' };
    return id;
  }
  const PALETTE = ['#1F5FBF', '#C8102E', '#0B6E4F', '#E8A317', '#7B2D8E', '#00838F', '#6D4C41', '#D81B60'];
  function newLine() {
    checkpoint();
    const l = { id: uid('line'), name: 'New line ' + (map.lines.length + 1), nameZh: '', color: PALETTE[map.lines.length % PALETTE.length], width: 8, style: 'solid', visible: true, path: [], bends: {} };
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
      const copy = Object.assign({}, l, { id: uid('line'), name: l.name + ' (2)', path: right, bends: bendsR });
      map.lines.splice(map.lines.indexOf(l) + 1, 0, copy);
    }
    selection = { type: 'line', id: l.id };
  }

  // ---------- pointer interaction ----------
  svgEl.addEventListener('pointerdown', (e) => {
    svgEl.focus({ preventScroll: true });
    const target = e.target.closest('[data-st],[data-edge],[data-label]');
    const p = worldFromEvent(e);
    if (e.button === 1 || (e.button === 0 && spaceDown)) { startPan(e); return; }
    if (e.button !== 0) return;
    const stId = target && target.dataset.st, edge = target && target.dataset.edge !== undefined ? { lineId: target.dataset.line, index: +target.dataset.edge } : null;
    const lbId = target && target.dataset.label;
    if (tool === 'select') {
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
      if (stId) selection = { type: 'station', ids: [stId] };
      else if (edge) { insertStationOnEdge(edge.lineId, edge.index, snapPt(p)); }
      else { checkpoint(); const id = addStation(snapPt(p)); selection = { type: 'station', ids: [id] }; beep(660); }
      changed();
    } else if (tool === 'line') {
      if (stId) { if (appendToActive(stId)) beep(587); selection = { type: 'station', ids: [stId] }; }
      else if (edge) { activeLineId = edge.lineId; selection = { type: 'edge', lineId: edge.lineId, index: edge.index }; }
      else {
        const sp = snapPt(p);
        if (e.altKey) appendToActive('@' + sp.x + ',' + sp.y);
        else { let l = activeLineId && lineById(activeLineId); if (!l) l = newLine(); checkpoint(); const id = addStation(sp); l.path.push(id); selection = { type: 'station', ids: [id] }; }
        beep(587);
      }
      changed();
    } else if (tool === 'label') {
      if (lbId) selection = { type: 'label', id: lbId };
      else { checkpoint(); const sp = snapPt(p); const lb = { id: uid('lbl'), x: sp.x, y: sp.y, text: 'Label', size: 14 }; map.labels.push(lb); selection = { type: 'label', id: lb.id }; }
      changed();
    } else if (tool === 'erase') {
      if (stId) { deleteStations([stId]); beep(220); }
      else if (lbId) { checkpoint(); map.labels = map.labels.filter((l) => l.id !== lbId); selection = null; beep(220); }
      else if (edge) { eraseEdge(edge.lineId, edge.index); beep(220); }
      changed();
    }
  });
  function startPan(e, clearOnClick) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty, moved: false, clearOnClick }; svgEl.setPointerCapture(e.pointerId); render(); }
  function startDrag(e, kind, p) {
    const orig = kind === 'stations' ? selection.ids.map((id) => ({ id, x: map.stations[id].x, y: map.stations[id].y })) : [{ id: selection.id, ...(() => { const lb = map.labels.find((l) => l.id === selection.id); return { x: lb.x, y: lb.y }; })() }];
    drag = { kind, start: p, orig, moved: false };
    svgEl.setPointerCapture(e.pointerId);
  }
  svgEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.tx = drag.tx + dx; view.ty = drag.ty + dy;
      vp.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);
      return;
    }
    const p = worldFromEvent(e);
    let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    const d = snapPt({ x: dx, y: dy }); dx = d.x; dy = d.y;
    if (!drag.moved && (dx || dy)) { checkpoint(); drag.moved = true; }
    if (!drag.moved) return;
    for (const o of drag.orig) {
      const obj = drag.kind === 'stations' ? map.stations[o.id] : map.labels.find((l) => l.id === o.id);
      if (obj) { obj.x = o.x + dx; obj.y = o.y + dy; }
    }
    render();
  });
  svgEl.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'pan' && !d.moved && d.clearOnClick) { selection = null; renderPanels(); }
    if (d.kind !== 'pan' && d.moved) changed(); else render();
  });
  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svgEl.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.min(4, Math.max(0.08, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.tx = mx - (mx - view.tx) * (k / view.k); view.ty = my - (my - view.ty) * (k / view.k); view.k = k;
    render();
  }, { passive: false });

  function insertStationOnEdge(lineId, index, near) {
    const l = lineById(lineId); if (!l) return;
    const a = nodePos(l.path[index]), b = nodePos(l.path[index + 1]);
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
      checkpoint(); for (const id of selection.ids) { map.stations[id].x += dx; map.stations[id].y += dy; } changed();
    }
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

  // ---------- panel events ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) { if (!e.target.closest('.menu-wrap')) $('exportMenu').hidden = true; return; }
    if (b.dataset.tool) { tool = b.dataset.tool; renderTools(); render(); return; }
    if (b.dataset.pickline) { const id = b.dataset.pickline; activeLineId = activeLineId === id ? null : id; selection = activeLineId ? { type: 'line', id } : null; renderPanels(); render(); return; }
    if (b.dataset.eye) { const l = lineById(b.dataset.eye); checkpoint(); l.visible = !l.visible; changed(); return; }
    if (b.dataset.goto) { const s = map.stations[b.dataset.goto]; if (s) { selection = { type: 'station', ids: [s.id] }; centerOn(s.x, s.y); renderPanels(); } return; }
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
      for (const id of s.ids) { if (a === 'alignH') map.stations[id].y = ref.y; else map.stations[id].x = ref.x; }
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
    if (fieldCheckpointed !== e.target) { checkpoint(); fieldCheckpointed = e.target; }
    const v = e.target.value;
    if (f.startsWith('st.')) { const st = map.stations[selection.ids[0]]; st[f.slice(3)] = v; }
    else if (f.startsWith('ln.')) { const l = lineById(selection.lineId || selection.id); const k = f.slice(3); l[k] = k === 'width' ? +v : v; }
    else if (f === 'edge.bend') { const l = lineById(selection.lineId); if (v === 'early') delete l.bends[selection.index]; else l.bends[selection.index] = v; }
    else if (f.startsWith('lb.')) { const lb = map.labels.find((x) => x.id === selection.id); const k = f.slice(3); lb[k] = k === 'size' ? +v : v; }
    render(); renderLines(); renderIssues();
    clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set(STORE_MAP, map), 400);
    if (e.target.type === 'range' || e.target.tagName === 'SELECT') renderInspector();
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
  function standaloneSvg() {
    const { svg } = buildMapSvg(map, { editor: false, exportColors: true });
    const b = bounds(map), pad = 120;
    const vis = map.lines.filter((l) => l.visible && l.path.length > 1);
    const legendH = settings.legend ? 40 + vis.length * 24 : 0;
    const x0 = b.x0 - pad, y0 = b.y0 - pad - 60, w = b.x1 - b.x0 + pad * 2 + 120, h = b.y1 - b.y0 + pad * 2 + 60 + legendH;
    let legend = '';
    if (settings.legend) {
      let y = b.y1 + pad;
      legend += `<text x="${b.x0}" y="${y}" font-size="15" font-weight="700" fill="#16181D">${esc(t('legendTitle'))}</text>`;
      for (const l of vis) {
        y += 24;
        legend += `<line x1="${b.x0}" y1="${y - 5}" x2="${b.x0 + 40}" y2="${y - 5}" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="round"${l.style === 'dashed' ? ` stroke-dasharray="${l.width * 1.4} ${l.width}"` : ''}/>`;
        if (l.style === 'rail') legend += `<line x1="${b.x0}" y1="${y - 5}" x2="${b.x0 + 40}" y2="${y - 5}" stroke="#FFFFFF" stroke-width="${Math.max(1.5, l.width * 0.28)}"/>`;
        legend += `<text x="${b.x0 + 54}" y="${y}" font-size="13" fill="#16181D">${esc(lineName(l))}</text>`;
      }
    }
    const title = esc(map.title) + (settings.lang !== 'en' && map.titleZh ? ' · ' + esc(map.titleZh) : '');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}" font-family="Inter, Segoe UI, Arial, sans-serif">` +
      `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#FFFFFF"/><style>.st-label{paint-order:stroke;stroke-width:4px;stroke-linejoin:round}</style>` +
      `<text x="${b.x0}" y="${b.y0 - pad + 10}" font-size="28" font-weight="800" fill="#16181D">${title}</text>${svg}${legend}</svg>`;
  }
  function exportAct(a) {
    if (a === 'svg') { download(slug() + '.svg', new Blob([standaloneSvg()], { type: 'image/svg+xml' })); beep(784); }
    else if (a === 'json') { download(slug() + '.json', new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' })); beep(784); }
    else if (a === 'png') {
      const src = standaloneSvg(); const m = src.match(/width="(\d+)" height="(\d+)"/);
      const w = +m[1], h = +m[2], scale = Math.min(2, 16000 / Math.max(w, h));
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale); const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, c.width, c.height); c.toBlob((bl) => { if (bl) { download(slug() + '.png', bl); beep(784); } else toast(t('importFailed')); }, 'image/png'); URL.revokeObjectURL(img.src); };
      img.onerror = () => toast('PNG export failed');
      img.src = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
    }
    else if (a === 'open') $('fileInput').click();
    else if (a === 'template' || a === 'blank') { if (confirm(t('replaceConfirm'))) replaceMap(window.GTHATemplates[a === 'template' ? 'gtha' : 'blank']()); }
  }
  function replaceMap(m) { checkpoint(); map = m; selection = null; activeLineId = null; $('mapTitle').value = map.title; changed(); fit(); }
  function importFile(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT) { toast(t('importFailed')); beep(180); return; }
    file.text().then((txt) => {
      let m = null; try { m = validateMap(JSON.parse(txt)); } catch { m = null; }
      if (!m) { toast(t('importFailed')); beep(180); return; }
      replaceMap(m); toast(t('imported')); beep(880);
    });
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
    $('settingsDialog').showModal();
  }
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsDialog').addEventListener('input', () => {
    settings.lang = $('setLang').value; settings.theme = $('setTheme').value; settings.fontSize = +$('setFont').value;
    settings.grid = $('setGrid').checked; settings.snap = $('setSnap').checked; settings.legend = $('setLegend').checked; settings.sound = $('setSound').checked;
    saveSettings(); applyTheme(); applyI18n();
  });
  $('tidyBtn').addEventListener('click', () => { checkpoint(); for (const s of Object.values(map.stations)) s.label = 'auto'; changed(); });
  $('resetSettingsBtn').addEventListener('click', () => { settings = Object.assign({}, DEFAULT_SETTINGS); saveSettings(); applyTheme(); applyI18n(); openSettingsRefresh(); });
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
        <label>${esc(t('theme'))}<select id="suTheme"><option value="system">${esc(t('system'))}</option><option value="light">${esc(t('light'))}</option><option value="dark">${esc(t('dark'))}</option></select></label>`;
    } else {
      h = `<h3>${esc(t('setupTools'))}</h3><p>${esc(t('toolsHelp'))}</p>`;
    }
    $('setupStep').innerHTML = h;
    if (s === 1) { $('suLang').value = settings.lang; $('suTheme').value = settings.theme; }
    $('setupBack').disabled = s === 0;
    $('setupNext').textContent = s === total - 1 ? t('finish') : t('next');
    $('setupStep').querySelector('input,select')?.focus();
  }
  $('setupStep').addEventListener('change', (e) => {
    if (e.target.name === 'start') setup.start = e.target.value;
    if (e.target.id === 'suLang') { settings.lang = e.target.value; saveSettings(); applyI18n(); renderSetup(); }
    if (e.target.id === 'suTheme') { settings.theme = e.target.value; saveSettings(); applyTheme(); }
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
  applyTheme();
  $('mapTitle').value = map.title;
  applyI18n();
  // A timer, not requestAnimationFrame: frames pause in background tabs and setup must still open.
  setTimeout(() => { fit(); if (!setup.done) openSetup(); }, 0);
  window.GMMC = { getMap: () => map, computeGeometry, route, validateMap, standaloneSvg };
})();
