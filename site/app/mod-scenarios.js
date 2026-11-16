// mod-scenarios.js: see docs/features/scenarios.md. Registers hooks on window.GMMCX before app.js loads.
// Named scenarios (alternative versions of the map), a swipe comparison and a change list.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const on = (name, fn) => { (X[name] = Array.isArray(X[name]) ? X[name] : []).push(fn); };
  const KEY = 'gmmc.scenarios.v1';
  const MAX_SCENARIOS = 12;
  const DOTS = ['#75777f', '#185bbb', '#8e44ad', '#2e7d32', '#e65100', '#b3261e'];
  const t = (k) => window.I18N.t(k);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  window.I18N.add({
    scTitle: 'Scenarios', scOpen: 'Scenarios and compare', scClose: 'Close scenarios',
    scRoutes: 'routes', scRoute1: 'route', scNew: 'New', scRename: 'Rename', scDelete: 'Delete', scConfirmDelete: 'Delete this scenario?',
    scName: 'Scenario name', scCreate: 'Create', scSave: 'Save', scCancel: 'Cancel',
    scBlank: 'Blank map', scBranch: 'Branch from current', scBaseLabel: 'Start from',
    scCreated: 'Scenario created', scRenamed: 'Scenario renamed', scDeleted: 'Scenario deleted',
    scLastOne: 'The last scenario cannot be deleted', scLimit: 'Scenario limit reached',
    scCompare: 'Compare', scCompareWith: 'Compare against', scCompareOn: 'Compare is on', scCompareOff: 'Compare is off',
    scNeedTwo: 'Create a second scenario to compare',
    scDivider: 'Comparison divider. Left and right arrows move it.', scDividerValue: 'percent of the map shows the baseline',
    scChangesFrom: 'Changes,', scChangesTo: 'to', scNoChanges: 'No differences between these scenarios',
    scAdded: 'added', scRemoved: 'removed', scChanged: 'changed',
    scRouteAdded: 'stations', scRerouted: 'rerouted', scRenamedFrom: 'renamed from', scRestyled: 'colour or style changed',
    scFreqNone: 'none', scMin: 'min', scStationWord: 'Station', scStationsMore: 'more stations',
    scEditHint: 'The right side is the active scenario and can be edited. Undo also reverts a scenario switch.'
  }, {
    scTitle: '方案', scOpen: '方案同比較', scClose: '關閉方案',
    scRoutes: '條路線', scRoute1: '條路線', scNew: '新增', scRename: '改名', scDelete: '刪除', scConfirmDelete: '確定刪除呢個方案？',
    scName: '方案名稱', scCreate: '建立', scSave: '儲存', scCancel: '取消',
    scBlank: '空白地圖', scBranch: '由目前嘅地圖分支', scBaseLabel: '起點',
    scCreated: '已建立方案', scRenamed: '已改名', scDeleted: '已刪除方案',
    scLastOne: '最後一個方案唔可以刪除', scLimit: '方案數量已達上限',
    scCompare: '比較', scCompareWith: '比較對象', scCompareOn: '比較已開啟', scCompareOff: '比較已關閉',
    scNeedTwo: '請先建立第二個方案先可以比較',
    scDivider: '比較分隔線。用左右方向鍵移動。', scDividerValue: '％地圖顯示基準方案',
    scChangesFrom: '改動：', scChangesTo: '至', scNoChanges: '呢兩個方案冇分別',
    scAdded: '新增', scRemoved: '移除', scChanged: '更改',
    scRouteAdded: '個站', scRerouted: '改咗路線走向', scRenamedFrom: '原名', scRestyled: '顏色或樣式已更改',
    scFreqNone: '冇', scMin: '分鐘', scStationWord: '車站', scStationsMore: '個其他車站',
    scEditHint: '右邊係目前方案，可以繼續編輯。復原亦會還原方案切換。'
  });

  let M = null; // window.GMMC
  let state = null; // { active, base, items: [{ id, name, map }] }
  const ui = { open: false, form: null, confirmDelete: false, compare: false, pos: 0.5 };
  let saveTimer = 0, rev = 0; // rev bumps when a stored scenario changes, keeping the baseline drawing cache valid
  let baseCache = { key: '', html: '' };

  const newId = () => 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const item = (id) => state.items.find((i) => i.id === id);
  const activeItem = () => item(state.active);
  const baseName = () => (window.I18N.getLang && window.I18N.getLang() === 'yue') ? '今日' : 'Today';

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } }
  /** Copy the editor map into the active scenario (the editor map is always the active one). */
  function flush() {
    if (!M || !state) return;
    const it = activeItem(); if (!it) return;
    const s = JSON.stringify(M.getMap());
    if (JSON.stringify(it.map) !== s) { it.map = JSON.parse(s); rev++; persist(); }
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { flush(); renderSheet(); }, 500); }

  function sanitizeState(raw, fallbackMap) {
    const items = [];
    if (raw && Array.isArray(raw.items)) {
      for (const it of raw.items.slice(0, MAX_SCENARIOS)) {
        const m = it && M.validateMap(it.map); if (!m) continue;
        items.push({ id: String(it.id || newId()).slice(0, 40), name: String(it.name || 'Scenario').slice(0, 60), map: m });
      }
    }
    if (!items.length) items.push({ id: newId(), name: baseName(), map: clone(fallbackMap) });
    const active = items.find((i) => i.id === (raw && raw.active)) ? raw.active : items[0].id;
    const other = items.find((i) => i.id === (raw && raw.base) && i.id !== active) || items.find((i) => i.id !== active);
    return { active, base: other ? other.id : null, items };
  }
  function uniqueName(name) {
    const n = String(name || '').trim().slice(0, 60) || 'Scenario'; let k = 2, out = n;
    while (state.items.some((i) => i.name.toLowerCase() === out.toLowerCase())) out = n + ' ' + k++;
    return out;
  }

  // ---------- scenario operations ----------
  function switchTo(id) {
    if (id === state.active) return;
    const it = item(id); if (!it) return;
    flush();
    const m = M.validateMap(clone(it.map)); if (!m) return;
    state.active = id;
    if (!state.base || state.base === id) state.base = (state.items.find((i) => i.id !== id) || {}).id || null;
    ui.confirmDelete = false; ui.form = null; baseCache.key = '';
    persist();
    M.replaceMap(m); // checkpoints, redraws; the editor save follows
    renderSheet(); drawCompare();
  }
  /** Create a scenario from a map (or blank, or a branch of the current map) and switch to it. Returns its id, or '' at the limit. */
  function create(name, mapOrNull, kind) {
    if (state.items.length >= MAX_SCENARIOS) { M.toast(t('scLimit')); return ''; }
    flush();
    let m = mapOrNull;
    if (!m) m = kind === 'blank' ? window.GTHATemplates.blank() : clone(M.getMap());
    m = M.validateMap(clone(m)); if (!m) return '';
    const it = { id: newId(), name: uniqueName(name), map: m };
    state.items.push(it); rev++;
    switchTo(it.id);
    return it.id;
  }
  function rename(id, name) {
    const it = item(id); if (!it) return;
    const n = String(name || '').trim().slice(0, 60); if (!n) return;
    it.name = state.items.some((o) => o !== it && o.name.toLowerCase() === n.toLowerCase()) ? uniqueName(n) : n;
    rev++; baseCache.key = ''; persist(); renderSheet(); drawCompare();
  }
  function remove(id) {
    if (state.items.length < 2) { M.toast(t('scLastOne')); return; }
    const idx = state.items.findIndex((i) => i.id === id); if (idx < 0) return;
    if (id === state.active) switchTo(state.items[idx === 0 ? 1 : idx - 1].id);
    state.items = state.items.filter((i) => i.id !== id);
    if (state.base === id) state.base = (state.items.find((i) => i.id !== state.active) || {}).id || null;
    rev++; baseCache.key = ''; persist(); ui.confirmDelete = false;
    if (!state.base && ui.compare) setCompare(false);
    renderSheet(); drawCompare();
  }

  // ---------- change list ----------
  const stationCount = (l) => l.path.filter((r) => r[0] !== '@').length;
  const freqLabel = (f) => {
    f = f || {};
    if (f.peak && f.offpeak && f.peak !== f.offpeak) return f.peak + '/' + f.offpeak + ' ' + t('scMin');
    const v = f.peak || f.offpeak; return v ? v + ' ' + t('scMin') : t('scFreqNone');
  };
  const nm = (o) => o.name || o.id;
  /** Differences from map a (baseline) to map b. Rows: { kind: '+' | '~' | '-', text }. */
  function diffMaps(a, b) {
    const rows = [], counts = { add: 0, chg: 0, rem: 0 };
    const aLines = new Map(a.lines.map((l) => [l.id, l])), bLines = new Map(b.lines.map((l) => [l.id, l]));
    const pairs = [], onlyA = [], onlyB = [];
    for (const l of b.lines) { if (aLines.has(l.id)) pairs.push([aLines.get(l.id), l]); else onlyB.push(l); }
    for (const l of a.lines) if (!bLines.has(l.id)) onlyA.push(l);
    // A route whose id changed but whose name matches counts as the same route.
    for (const lb of onlyB.slice()) {
      const j = onlyA.findIndex((la) => la.name.toLowerCase() === lb.name.toLowerCase());
      if (j >= 0) { pairs.push([onlyA[j], lb]); onlyA.splice(j, 1); onlyB.splice(onlyB.indexOf(lb), 1); }
    }
    const addedRoute = new Set(), removedRoute = new Set();
    for (const l of onlyB) { rows.push({ kind: '+', text: `${nm(l)}, ${stationCount(l)} ${t('scRouteAdded')}` }); counts.add++; l.path.forEach((r) => addedRoute.add(r)); }
    for (const l of onlyA) { rows.push({ kind: '-', text: nm(l) }); counts.rem++; l.path.forEach((r) => removedRoute.add(r)); }
    for (const [la, lb] of pairs) {
      const bits = [];
      if (la.name !== lb.name) bits.push(`${t('scRenamedFrom')} ${la.name}`);
      if (la.path.join('>') !== lb.path.join('>')) bits.push(t('scRerouted'));
      if (freqLabel(la.freq) !== freqLabel(lb.freq)) bits.push(`${freqLabel(la.freq)} → ${freqLabel(lb.freq)}`);
      if (la.color !== lb.color || la.style !== lb.style) bits.push(t('scRestyled'));
      if (bits.length) { rows.push({ kind: '~', text: `${nm(lb)}: ${bits.join(', ')}` }); counts.chg++; }
    }
    const addedSt = Object.values(b.stations).filter((s) => !a.stations[s.id] && !addedRoute.has(s.id));
    const removedSt = Object.values(a.stations).filter((s) => !b.stations[s.id] && !removedRoute.has(s.id));
    const stRows = (list, kind) => {
      list.slice(0, 6).forEach((s) => rows.push({ kind, text: `${t('scStationWord')} ${nm(s)}` }));
      if (list.length > 6) rows.push({ kind, text: `${list.length - 6} ${t('scStationsMore')}` });
    };
    stRows(addedSt, '+'); counts.add += addedSt.length;
    stRows(removedSt, '-'); counts.rem += removedSt.length;
    return { rows, counts };
  }
  function currentDiff() {
    flush();
    const base = item(state.base), cur = activeItem();
    if (!base || !cur) return null;
    return { base, cur, ...diffMaps(base.map, cur.map) };
  }

  // ---------- side sheet ----------
  function buildShell() {
    const panel = document.querySelector('.panel.right'); if (!panel || $('scSheet')) return;
    const sec = document.createElement('section'); sec.id = 'scSheet'; sec.className = 'sc-sheet'; sec.hidden = true;
    sec.setAttribute('aria-label', t('scTitle'));
    panel.appendChild(sec);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'icon-btn'; btn.id = 'scenariosBtn';
    btn.setAttribute('aria-controls', 'scSheet'); btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', t('scOpen')); btn.title = t('scOpen');
    btn.innerHTML = window.icon('layers', 24);
    const settings = $('settingsBtn'); settings.parentNode.insertBefore(btn, settings);
    btn.addEventListener('click', () => setOpen(!ui.open));
    sec.addEventListener('click', onSheetClick);
    sec.addEventListener('submit', onSheetSubmit);
    sec.addEventListener('change', (e) => {
      if (e.target.id === 'scBaseSel') { state.base = e.target.value; persist(); baseCache.key = ''; renderSheet(); drawCompare(); }
    });
    sec.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.form) { ui.form = null; renderSheet(); e.stopPropagation(); } });
  }
  function setOpen(on) {
    ui.open = on; const sec = $('scSheet'), panel = document.querySelector('.panel.right');
    sec.hidden = !on; panel.classList.toggle('sc-open', on);
    $('scenariosBtn').setAttribute('aria-pressed', String(on));
    if (!on && ui.compare) setCompare(false);
    if (on) renderSheet();
  }
  function renderSheet() {
    const sec = $('scSheet'); if (!sec || !ui.open || !state) return;
    const cur = activeItem();
    const count = (it) => (it.id === state.active ? M.getMap() : it.map).lines.length;
    const rows = state.items.map((it, i) => `<li><button type="button" class="sc-row${it.id === state.active ? ' sel' : ''}" data-sc="pick" data-id="${esc(it.id)}" aria-pressed="${it.id === state.active}">
      <span class="sc-dot" style="background:${DOTS[i % DOTS.length]}"></span><span class="sc-name">${esc(it.name)}</span>
      <span class="sc-count">${count(it)} ${t(count(it) === 1 ? 'scRoute1' : 'scRoutes')}</span></button></li>`).join('');
    let form = '';
    if (ui.form) {
      const isNew = ui.form === 'new';
      form = `<form class="sc-form" data-sc-form="${ui.form}"><label class="tf"><span class="tf-label">${esc(t('scName'))}</span><input type="text" id="scNameInput" maxlength="60" required value="${isNew ? '' : esc(cur.name)}" autocomplete="off"></label>
        ${isNew ? `<fieldset class="sc-radios"><legend class="supporting">${esc(t('scBaseLabel'))}</legend>
          <label class="check"><input type="radio" name="scKind" value="branch" checked> <span>${esc(t('scBranch'))}</span></label>
          <label class="check"><input type="radio" name="scKind" value="blank"> <span>${esc(t('scBlank'))}</span></label></fieldset>` : ''}
        <div class="row"><button type="submit" class="btn filled sm" id="scFormOk">${esc(t(isNew ? 'scCreate' : 'scSave'))}</button><button type="button" class="btn text sm" data-sc="cancel">${esc(t('scCancel'))}</button></div></form>`;
    }
    const others = state.items.filter((i) => i.id !== state.active);
    const diff = others.length ? currentDiff() : null;
    const sel = others.length ? `<label class="tf tf-dense"><span class="tf-label">${esc(t('scCompareWith'))}</span><span class="tf-select"><select id="scBaseSel">${others.map((i) => `<option value="${esc(i.id)}"${i.id === state.base ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select><span data-ic="arrow_drop_down"></span></span></label>` : '';
    let changes = '';
    if (diff) {
      const c = diff.counts;
      const cls = (k) => (k === '+' ? 'add' : k === '-' ? 'rem' : 'chg');
      const word = (k) => t(k === '+' ? 'scAdded' : k === '-' ? 'scRemoved' : 'scChanged');
      changes = `<h3 class="title-sm sc-h">${esc(t('scChangesFrom'))} ${esc(diff.base.name)} ${esc(t('scChangesTo'))} ${esc(diff.cur.name)}</h3>
        <p class="supporting" id="scSummary" role="status">+${c.add} · ~${c.chg} · −${c.rem}</p>
        <ul class="sc-changes" id="scChangeList">${diff.rows.length ? diff.rows.map((r) => `<li class="sc-ch sc-ch-${cls(r.kind)}"><span class="sc-mark" aria-hidden="true">${r.kind === '-' ? '−' : r.kind}</span><span class="sc-ch-text">${esc(r.text)}</span><span class="vh">${esc(word(r.kind))}</span></li>`).join('') : `<li class="supporting">${esc(t('scNoChanges'))}</li>`}</ul>`;
    }
    const html = `<div class="sc-head"><h2 class="title-sm sc-title">${esc(t('scTitle'))}</h2><button type="button" class="btn tonal sm" data-sc="new" id="scNewBtn">${window.icon('add', 18)}<span>${esc(t('scNew'))}</span></button>
      <button type="button" class="icon-btn" data-sc="close" aria-label="${esc(t('scClose'))}">${window.icon('close', 24)}</button></div>
      <ul class="sc-list" id="scList">${rows}</ul>
      ${form}
      <div class="sc-actions row">
        <button type="button" class="btn text sm" data-sc="rename" id="scRenameBtn">${esc(t('scRename'))}</button>
        ${ui.confirmDelete ? `<button type="button" class="btn danger sm" data-sc="delete-yes" id="scDeleteYes">${esc(t('scConfirmDelete'))}</button><button type="button" class="btn text sm" data-sc="cancel">${esc(t('scCancel'))}</button>`
          : `<button type="button" class="btn text sm" data-sc="delete" id="scDeleteBtn"${state.items.length < 2 ? ' disabled' : ''}>${esc(t('scDelete'))}</button>`}
      </div>
      <div class="sc-compare">${sel}
        <button type="button" class="btn ${ui.compare ? 'filled' : 'outlined'} sm" data-sc="compare" id="scCompareBtn" aria-pressed="${ui.compare}"${others.length ? '' : ' disabled'}>${window.icon('swap_horiz', 18)}<span>${esc(t('scCompare'))}</span></button>
        ${others.length ? '' : `<p class="supporting">${esc(t('scNeedTwo'))}</p>`}</div>
      ${changes}
      <p class="supporting">${esc(t('scEditHint'))}</p>
      <div class="sc-share row" id="scShareSlot"></div>`;
    if (sec.dataset.sig === html) return; // nothing visible changed; keep focus and typing intact
    sec.dataset.sig = html;
    const ae = document.activeElement, keep = ae && sec.contains(ae) ? (ae.id || '') : '';
    sec.innerHTML = html;
    sec.querySelectorAll('[data-ic]').forEach((n) => { if (!n.firstChild) n.innerHTML = window.icon(n.dataset.ic, 18); });
    for (const f of (X.scenarioSheet || [])) { try { f($('scShareSlot')); } catch (err) { console.error('scenarioSheet', err); } }
    if (ui.form) { const inp = $('scNameInput'); if (inp) { inp.focus(); inp.select(); } }
    else if (keep && $(keep)) $(keep).focus();
  }
  function onSheetClick(e) {
    const b = e.target.closest('[data-sc]'); if (!b) return;
    const a = b.dataset.sc;
    if (a === 'pick') switchTo(b.dataset.id);
    else if (a === 'new') { ui.form = 'new'; ui.confirmDelete = false; renderSheet(); }
    else if (a === 'rename') { ui.form = 'rename'; ui.confirmDelete = false; renderSheet(); }
    else if (a === 'cancel') { ui.form = null; ui.confirmDelete = false; renderSheet(); }
    else if (a === 'close') setOpen(false);
    else if (a === 'delete') { ui.confirmDelete = true; ui.form = null; renderSheet(); const y = $('scDeleteYes'); if (y) y.focus(); }
    else if (a === 'delete-yes') { remove(state.active); M.toast(t('scDeleted')); }
    else if (a === 'compare') setCompare(!ui.compare);
  }
  function onSheetSubmit(e) {
    const f = e.target.closest('form[data-sc-form]'); if (!f) return;
    e.preventDefault();
    const name = $('scNameInput').value;
    if (f.dataset.scForm === 'new') {
      const kind = (f.querySelector('input[name=scKind]:checked') || {}).value || 'branch';
      ui.form = null; create(name, null, kind); M.toast(t('scCreated'));
    } else { ui.form = null; rename(state.active, name); M.toast(t('scRenamed')); }
  }

  // ---------- swipe compare ----------
  let baseG = null, divider = null, tagL = null, tagR = null;
  function buildCompareDom() {
    if (baseG) return;
    const svg = $('map'), vp = $('viewport'), NS = 'http://www.w3.org/2000/svg';
    const mk = (n, attrs) => { const el = document.createElementNS(NS, n); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
    const defs = svg.querySelector('defs');
    defs.appendChild(mk('clipPath', { id: 'scClipL' })).appendChild(mk('rect', { id: 'scClipLR', x: 0, y: -50000, width: 0, height: 100000 }));
    defs.appendChild(mk('clipPath', { id: 'scClipR' })).appendChild(mk('rect', { id: 'scClipRR', x: 0, y: -50000, width: 100000, height: 100000 }));
    // The editor viewport moves into a wrapper so it can be clipped in screen pixels without touching its own transform.
    const host = mk('g', { id: 'scClipHost' });
    vp.parentNode.insertBefore(host, vp); host.appendChild(vp);
    baseG = mk('g', { id: 'scBase', 'clip-path': 'url(#scClipL)', 'pointer-events': 'none' });
    host.parentNode.insertBefore(baseG, host.nextSibling);
    const stage = $('stage');
    divider = document.createElement('div'); divider.id = 'scDivider'; divider.className = 'sc-divider'; divider.hidden = true;
    divider.innerHTML = `<div class="sc-line"></div><div class="sc-handle" id="scHandle" role="slider" tabindex="0" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="100">${window.icon('swap_horiz', 24)}</div>`;
    tagL = document.createElement('span'); tagL.id = 'scTagL'; tagL.className = 'sc-tag sc-tag-l'; tagL.hidden = true;
    tagR = document.createElement('span'); tagR.id = 'scTagR'; tagR.className = 'sc-tag sc-tag-r'; tagR.hidden = true;
    stage.appendChild(divider); stage.appendChild(tagL); stage.appendChild(tagR);
    const handle = divider.querySelector('#scHandle');
    let dragging = false;
    const move = (clientX) => { const r = stage.getBoundingClientRect(); ui.pos = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width))); layoutDivider(); };
    divider.addEventListener('pointerdown', (e) => { dragging = true; divider.setPointerCapture(e.pointerId); handle.focus({ preventScroll: true }); move(e.clientX); e.preventDefault(); });
    divider.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX); });
    divider.addEventListener('pointerup', () => { dragging = false; });
    divider.addEventListener('pointercancel', () => { dragging = false; });
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.1 : 0.02; let used = true;
      if (e.key === 'ArrowLeft') ui.pos = Math.max(0, ui.pos - step);
      else if (e.key === 'ArrowRight') ui.pos = Math.min(1, ui.pos + step);
      else if (e.key === 'Home') ui.pos = 0;
      else if (e.key === 'End') ui.pos = 1;
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); layoutDivider(); }
    });
    if (window.ResizeObserver) new ResizeObserver(() => { if (ui.compare) layoutDivider(); }).observe(stage);
  }
  function layoutDivider() {
    if (!divider) return;
    const x = Math.round(ui.pos * $('stage').clientWidth);
    divider.style.left = x + 'px';
    const pct = Math.round(ui.pos * 100), h = $('scHandle');
    h.setAttribute('aria-valuenow', String(pct)); h.setAttribute('aria-valuetext', pct + ' ' + t('scDividerValue')); h.setAttribute('aria-label', t('scDivider'));
    $('scClipLR').setAttribute('width', String(x)); $('scClipRR').setAttribute('x', String(x));
    if (ui.compare) $('scClipHost').setAttribute('clip-path', 'url(#scClipR)'); else $('scClipHost').removeAttribute('clip-path');
  }
  function setCompare(on) {
    if (on && (!state.base || state.items.length < 2)) { M.toast(t('scNeedTwo')); return; }
    ui.compare = on; buildCompareDom();
    divider.hidden = tagL.hidden = tagR.hidden = !on;
    baseG.innerHTML = ''; layoutDivider();
    if (on) drawCompare();
    renderSheet(); M.toast(t(on ? 'scCompareOn' : 'scCompareOff'));
  }
  /** The baseline scenario as drawn at the current zoom: the editor's own geometry code, lines and stations only. */
  function baseHtml() {
    const base = item(state.base); if (!base) return '';
    const geo = M.isGeo(), k = M.getView().k;
    const key = [state.base, rev, geo ? 'g' + k : 's'].join('|');
    if (baseCache.key === key) return baseCache.html;
    const src = clone(base.map);
    let drawn = src;
    if (geo) {
      const stations = {};
      for (const s of Object.values(src.stations)) { const g = M.stGeo(s); stations[s.id] = Object.assign({}, s, { x: g.x * k, y: g.y * k }); }
      const wp = {};
      const lines = src.lines.map((l) => {
        const path = l.path.map((r, i) => {
          if (r[0] !== '@') return r;
          let a = i - 1; while (a >= 0 && l.path[a][0] === '@') a--;
          let b = i + 1; while (b < l.path.length && l.path[b][0] === '@') b++;
          const pa = a >= 0 ? stations[l.path[a]] : null, pb = b < l.path.length ? stations[l.path[b]] : null;
          const wk = '@@' + l.id + '#' + i, f = (i - a) / (b - a);
          wp[wk] = pa && pb ? { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f } : (pa || pb || { x: 0, y: 0 });
          return wk;
        });
        return Object.assign({}, l, { path, bends: {} });
      });
      drawn = Object.assign({}, src, { stations, lines, _geo: true, _k: k, _wp: wp });
    }
    const G = M.G, lg = M.computeGeometry(drawn);
    const poly = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('');
    let out = '';
    for (const g of lg) if (g.poly.length > 1) out += M.linePaths(g.line, poly(g.poly));
    const count = new Map();
    for (const l of drawn.lines) if (l.visible) for (const r of new Set(l.path)) if (r[0] !== '@') count.set(r, (count.get(r) || 0) + 1);
    for (const [id, n] of count) {
      const s = drawn.stations[id]; if (!s) continue;
      const hub = s.interchange === 'yes' || (s.interchange !== 'no' && n > 1);
      out += `<circle cx="${(s.x * G).toFixed(1)}" cy="${(s.y * G).toFixed(1)}" r="${hub ? 8 : 6}" fill="#FFFFFF" stroke="#16181D" stroke-width="${hub ? 3.5 : 3}"/>`;
    }
    baseCache = { key, html: out };
    return out;
  }
  function drawCompare() {
    if (!ui.compare || !baseG || !state) return;
    const v = M.getView();
    const tr = M.isGeo() ? `translate(${v.tx} ${v.ty})` : `translate(${v.tx} ${v.ty}) scale(${v.k})`;
    baseG.innerHTML = `<g transform="${tr}" data-base-routes="${(item(state.base) || { map: { lines: [] } }).map.lines.length}">${baseHtml()}</g>`;
    const base = item(state.base), cur = activeItem();
    tagL.textContent = base ? base.name : ''; tagR.textContent = cur ? cur.name : '';
    layoutDivider();
  }

  // ---------- hooks ----------
  on('afterRender', () => { if (!state) return; scheduleSave(); if (ui.compare) drawCompare(); });
  on('projectSave', () => { flush(); return { scenarios: { active: state.active, base: state.base, items: state.items } }; });
  on('projectLoad', (obj, m) => {
    if (!state) return;
    const raw = obj && obj.scenarios;
    if (raw && Array.isArray(raw.items)) {
      const next = sanitizeState(raw, m);
      // The editor already shows the project map, which is the active scenario by definition.
      next.items.find((i) => i.id === next.active).map = clone(m);
      state = next;
    } else {
      state = { active: newId(), base: null, items: [] };
      state.items.push({ id: state.active, name: baseName(), map: clone(m) });
    }
    rev++; baseCache.key = ''; ui.form = null; ui.confirmDelete = false;
    if (!state.base && ui.compare) setCompare(false);
    persist(); renderSheet(); drawCompare();
  });
  on('ready', (GMMC) => {
    M = GMMC;
    let raw = null; try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { raw = null; }
    state = sanitizeState(raw, M.getMap());
    activeItem().map = clone(M.getMap()); // the editor map wins: it is always the active scenario
    rev++; persist();
    buildShell();
    window.GMMCScenarios = {
      list: () => state.items.map((i) => ({ id: i.id, name: i.name })), active: () => state.active,
      create, switchTo, rename, remove, setCompare, isComparing: () => ui.compare, open: setOpen, flush,
      diff: () => { const d = currentDiff(); return d && { base: d.base.name, current: d.cur.name, counts: d.counts, rows: d.rows }; }
    };
    window.addEventListener('resize', () => { if (ui.compare) layoutDivider(); });
  });
})();
