// mod-easy.js: see docs/features/getting-started.md. Makes the editor easy to start with:
// a labelled tool bar on the map with a "More" menu, a hint for the current tool (with Finish and
// Undo stop while a route is being drawn), tabs on the right panel (Selected, Analyse, Style), a
// getting-started checklist, a start card on a blank map, a Help menu, and the regex builder folded
// behind a button beside the search box. It only rearranges and explains; every tool stays.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const on = (name, fn) => { (X[name] = Array.isArray(X[name]) ? X[name] : []).push(fn); };
  const t = (k) => window.I18N.t(k);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s) => window.icon(n, s || 20);
  const $ = (id) => document.getElementById(id);
  let G = null; // window.GMMC, set on ready

  const KEY = { hints: 'gmmc.easy.hints', gsHidden: 'gmmc.easy.gsHidden', exported: 'gmmc.easy.exported', rx: 'gmmc.easy.rxOpen', tab: 'gmmc.easy.tab' };
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private window: the choice lasts until reload */ } };

  window.I18N.add({
    busRoute: 'Bus route', routeFinished: 'Route finished', more: 'More', moreWays: 'More ways to add',
    moreImport: 'Import a GTFS feed', morePaste: 'Paste copied stations (Ctrl+V)', moreTemplate: 'Start from the GTHA template',
    moreBlank: 'Start a blank map', morePalette: 'All commands (Ctrl+K)',
    hintSelect: 'Click anything on the map to edit it. Drag a station to move it; Shift-drag selects several.',
    hintStation: 'Click the map to add a station. Click a route to put a station on it.',
    hintLineNew: 'Click stations in order to draw a new route. Clicking empty map adds a stop there.',
    hintBusNew: 'Click stops in order to draw a new bus route. Clicking empty map adds a stop there.',
    hintDrawing: 'Click the map or a station for the next stop.', hintStops: 'stops',
    hintLabel: 'Click the map to place a label, then type its text on the right.',
    hintErase: 'Click a station, label or route segment to delete it. Ctrl+Z brings it back.',
    finish: 'Finish', undoStop: 'Undo stop', hintsHidden: 'Hints hidden. Turn them back on from Help.', hideHints: 'Hide hints', showHints: 'Show tool hints',
    tabSelected: 'Selected', tabAnalyse: 'Analyse', tabStyle: 'Style', panelTabs: 'Panel',
    gsTitle: 'Get started', gsDone: 'done', gsOf: 'of', gsHide: 'Hide checklist',
    gsStation: 'Add a station', gsStationSub: 'Pick Station, then click the map',
    gsRoute: 'Draw a route', gsRouteSub: 'Pick Route or Bus route, then click stops in order',
    gsFreq: 'Set how often it runs', gsFreqSub: 'Select the route, then fill in its frequencies',
    gsName: 'Name and colour your route', gsNameSub: 'Shown in the legend and exports',
    gsExport: 'Export or share', gsExportSub: 'PNG, PDF, a website or a link',
    gsDo: 'Do it', gsOpen: 'Open', gsAllDone: 'All done. Analyse has the trip planner, coverage and more.',
    startTitle: 'Start your map', startSub: 'Pick one. You can change everything later.',
    startStation: 'Add your first station', startStationSub: 'Click anywhere on the map',
    startRoute: 'Draw a route', startRouteSub: 'Click stops in order; Enter finishes',
    startImport: 'Import a GTFS feed', startImportSub: 'Real routes, stops and frequencies',
    startTemplate: 'Use the GTHA template', startTemplateSub: '238 stations and 20 routes to edit',
    help: 'Help', helpChecklist: 'Getting-started checklist', helpGuide: 'User guide', helpCommands: 'All commands (Ctrl+K)',
    rxToggle: 'Search options and regex builder'
  }, {
    busRoute: '巴士路線', routeFinished: '路線畫好', more: '更多', moreWays: '其他加嘢方法',
    moreImport: '匯入 GTFS 資料', morePaste: '貼上複製咗嘅車站（Ctrl+V）', moreTemplate: '用大多倫多範本開始',
    moreBlank: '開一張空白地圖', morePalette: '所有指令（Ctrl+K）',
    hintSelect: '撳地圖上任何嘢就可以改。拖車站可以搬位；Shift 拖可以揀幾個。',
    hintStation: '撳地圖加車站。撳路線就喺線上面加站。',
    hintLineNew: '順序撳車站畫新路線。撳空白位就喺嗰度加站。',
    hintBusNew: '順序撳站畫新巴士路線。撳空白位就喺嗰度加站。',
    hintDrawing: '撳地圖或者車站加下一個站。', hintStops: '個站',
    hintLabel: '撳地圖放標籤，再喺右邊打字。',
    hintErase: '撳車站、標籤或者路段就刪除。Ctrl+Z 可以還原。',
    finish: '完成', undoStop: '撤銷上一個站', hintsHidden: '提示已收起，可以喺「說明」再開返。', hideHints: '收起提示', showHints: '顯示工具提示',
    tabSelected: '已揀', tabAnalyse: '分析', tabStyle: '樣式', panelTabs: '面板',
    gsTitle: '開始使用', gsDone: '完成', gsOf: '/', gsHide: '收起清單',
    gsStation: '加一個車站', gsStationSub: '揀「車站」，再撳地圖',
    gsRoute: '畫一條路線', gsRouteSub: '揀「路線」或「巴士路線」，再順序撳站',
    gsFreq: '設定班次', gsFreqSub: '揀咗路線，再填班次',
    gsName: '幫路線改名同揀顏色', gsNameSub: '會喺圖例同匯出入面顯示',
    gsExport: '匯出或者分享', gsExportSub: 'PNG、PDF、網站或者連結',
    gsDo: '去做', gsOpen: '打開', gsAllDone: '全部搞掂。「分析」有行程規劃、覆蓋範圍等等。',
    startTitle: '開始畫你嘅地圖', startSub: '揀一樣開始，之後乜都可以改。',
    startStation: '加第一個車站', startStationSub: '撳地圖任何位置',
    startRoute: '畫一條路線', startRouteSub: '順序撳站；Enter 完成',
    startImport: '匯入 GTFS 資料', startImportSub: '真實路線、車站同班次',
    startTemplate: '用大多倫多範本', startTemplateSub: '238 個車站、20 條路線，隨便改',
    help: '說明', helpChecklist: '入門清單', helpGuide: '使用指南', helpCommands: '所有指令（Ctrl+K）',
    rxToggle: '搜尋選項同正規表示式工具'
  });

  // ---------- tool bar: "More" menu ----------
  on('toolsExtra', () => `<span class="tool-sep" aria-hidden="true"></span><button type="button" class="tool-btn" id="toolMore" aria-haspopup="menu" aria-expanded="false" title="${esc(t('more'))}"><span class="tool-ind">${ic('more_horiz')}</span><span class="tool-label">${esc(t('more'))}</span></button>`);
  function moreMenu() {
    let m = $('toolMoreMenu');
    if (!m) { m = document.createElement('div'); m.id = 'toolMoreMenu'; m.className = 'menu tool-more-menu'; m.setAttribute('role', 'menu'); m.hidden = true; $('stage').appendChild(m); }
    const item = (act, glyph, key, cls) => `<button type="button" role="menuitem" data-easy="${act}"${cls ? ` class="${cls}"` : ''}>${ic(glyph, 24)}<span>${esc(t(key))}</span></button>`;
    // on the narrowest phones the bottom bar has no room for Label and Erase, so they live here
    m.innerHTML = item('tool-label', 'title', 'label', 'narrow-only') + item('tool-erase', 'ink_eraser', 'erase', 'narrow-only') +
      `<p class="menu-head">${esc(t('moreWays'))}</p>` + item('import', 'upload_file', 'moreImport') + item('paste', 'content_paste', 'morePaste') + '<hr>' +
      item('template', 'map', 'moreTemplate') + item('blank', 'add', 'moreBlank') + '<hr>' + item('palette', 'keyboard_command_key', 'morePalette');
    return m;
  }
  function toggleMore(force) {
    const m = moreMenu(), b = $('toolMore'); if (!b) return;
    const open = typeof force === 'boolean' ? force : m.hidden;
    m.hidden = !open; b.setAttribute('aria-expanded', String(open));
    if (open) { const r = b.getBoundingClientRect(), s = $('stage').getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.left - s.left, s.width - 290)) + 'px'; m.style.top = (r.bottom - s.top + 6) + 'px'; m.querySelector('button').focus(); }
  }

  // ---------- hint for the current tool ----------
  const hintsOn = () => get(KEY.hints, '1') === '1';
  function renderHint() {
    const el = $('toolHint'); if (!el || !G) return;
    if (!hintsOn()) { el.hidden = true; return; }
    const tool = G.getTool(); const map = G.getMap();
    const drawing = (tool === 'line' || tool === 'bus') && G.getActiveLine() && G.lineById(G.getActiveLine());
    let html;
    if (drawing) {
      const l = G.lineById(G.getActiveLine()); const n = l.path.filter((r) => r[0] !== '@').length;
      html = `${ic('touch_app')}<span class="th-text"><b>${esc(G.lineName(l))} · ${n} ${esc(t('hintStops'))}.</b> ${esc(t('hintDrawing'))}</span>` +
        `<button type="button" class="th-btn filled" data-easy="finish">${ic('check', 18)}<span>${esc(t('finish'))}</span></button>` +
        `<button type="button" class="th-btn" data-easy="undoStop"${n ? '' : ' disabled'}><span>${esc(t('undoStop'))}</span></button>`;
    } else {
      const key = { select: 'hintSelect', station: 'hintStation', line: 'hintLineNew', bus: 'hintBusNew', label: 'hintLabel', erase: 'hintErase' }[tool];
      if (!key || (tool === 'select' && !Object.keys(map.stations).length)) { el.hidden = true; return; }
      html = `${ic('touch_app')}<span class="th-text">${esc(t(key))}</span>`;
    }
    html += `<button type="button" class="th-close" data-easy="hideHints" aria-label="${esc(t('hideHints'))}" title="${esc(t('hideHints'))}">${ic('close', 18)}</button>`;
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    el.hidden = false;
  }

  // ---------- right panel tabs ----------
  const PANES = [['sel', 'ads_click', 'tabSelected'], ['analyse', 'analytics', 'tabAnalyse'], ['style', 'palette', 'tabStyle']];
  let tab = get(KEY.tab, 'sel');
  function paneOf(node) {
    if (node.id === 'easyTabs' || node.id === 'scSheet') return null; // the scenarios sheet takes the whole panel while open
    if (node.id === 'inspector' || (node.tagName === 'H2' && node.dataset.t === 'inspector')) return 'sel';
    if (node.id === 'mapStyleSec') return 'style';
    return 'analyse';
  }
  function classify() {
    const panel = document.querySelector('.panel.right'); if (!panel) return;
    for (const c of panel.children) { const p = paneOf(c); if (p && c.dataset.pane !== p) c.dataset.pane = p; }
  }
  function setTab(x, focus) {
    tab = x; put(KEY.tab, x);
    const panel = document.querySelector('.panel.right'); if (!panel) return;
    panel.dataset.tab = x;
    for (const b of panel.querySelectorAll('#easyTabs [role=tab]')) { const sel = b.dataset.pane === x; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; if (sel && focus) b.focus(); }
  }
  function buildTabs() {
    const panel = document.querySelector('.panel.right'); if (!panel || $('easyTabs')) return;
    const bar = document.createElement('div'); bar.id = 'easyTabs'; bar.className = 'easy-tabs'; bar.setAttribute('role', 'tablist');
    panel.insertBefore(bar, panel.firstChild);
    renderTabs(); classify(); setTab(tab);
    new MutationObserver(classify).observe(panel, { childList: true });
    // anything that moves focus into a panel on another tab (Settings > Auto-schematic, for one) shows that tab
    panel.addEventListener('focusin', (e) => { const sec = e.target.closest('.panel.right > [data-pane]'); if (sec && sec.dataset.pane !== tab) setTab(sec.dataset.pane); });
    // a hidden field cannot take focus, so the Settings shortcut to auto-schematic opens its tab first
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#schOpen')) setTab('analyse'); }, true);
    bar.addEventListener('keydown', (e) => {
      const i = PANES.findIndex(([p]) => p === tab); let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % PANES.length; else if (e.key === 'ArrowLeft') j = (i + PANES.length - 1) % PANES.length; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = PANES.length - 1;
      if (j >= 0) { e.preventDefault(); setTab(PANES[j][0], true); }
    });
  }
  function renderTabs() {
    const bar = $('easyTabs'); if (!bar) return;
    bar.setAttribute('aria-label', t('panelTabs'));
    bar.innerHTML = PANES.map(([p, g, k]) => `<button type="button" role="tab" data-pane="${p}" aria-selected="${p === tab}" tabindex="${p === tab ? 0 : -1}">${ic(g)}<span>${esc(t(k))}</span></button>`).join('');
  }

  // ---------- getting-started checklist ----------
  const NAMED = (l) => !/^(New route|Bus route|新增路線|巴士路線) \d+$/.test(l.name) || !!l.nameZh;
  function steps(map) {
    const lines = map.lines.filter((l) => l.path.filter((r) => r[0] !== '@').length >= 2);
    return [
      ['station', 'gsStation', 'gsStationSub', Object.keys(map.stations).length > 0],
      ['route', 'gsRoute', 'gsRouteSub', lines.length > 0],
      ['freq', 'gsFreq', 'gsFreqSub', map.lines.some((l) => l.freq && Object.values(l.freq).some((v) => v))],
      ['name', 'gsName', 'gsNameSub', lines.length > 0 && lines.every(NAMED)],
      ['export', 'gsExport', 'gsExportSub', get(KEY.exported, '0') === '1']
    ];
  }
  on('emptyInspector', (map) => {
    if (get(KEY.gsHidden, '0') === '1') return '';
    const s = steps(map), done = s.filter((x) => x[3]).length;
    const rows = s.map(([id, k, sub, ok]) => `<li class="gs-row${ok ? ' ok' : ''}"><span class="gs-dot" aria-hidden="true">${ok ? ic('check', 16) : ''}</span>
      <span class="gs-text"><span class="gs-name">${esc(t(k))}</span><span class="gs-sub">${esc(t(sub))}</span></span>
      ${ok ? `<span class="vh">${esc(t('gsDone'))}</span>` : `<button type="button" class="btn filled sm" data-easy="gs-${id}">${esc(t(id === 'name' || id === 'freq' ? 'gsOpen' : 'gsDo'))}<span class="vh"> ${esc(t(k))}</span></button>`}</li>`).join('');
    return `<section class="gs" aria-labelledby="gsTitle"><div class="gs-head"><h3 class="title-sm" id="gsTitle">${esc(t('gsTitle'))}</h3><span class="gs-count">${done} ${esc(t('gsOf'))} ${s.length} ${esc(t('gsDone'))}</span></div>
      <div class="gs-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${s.length}" aria-valuenow="${done}" aria-label="${esc(t('gsTitle'))}"><span style="width:${(done / s.length) * 100}%"></span></div>
      <ol class="gs-list">${rows}</ol>${done === s.length ? `<p class="supporting">${esc(t('gsAllDone'))}</p>` : ''}
      <button type="button" class="btn text sm" data-easy="gsHide">${esc(t('gsHide'))}</button></section>`;
  });
  // the route that a "Set how often" or "Name" step should open: the newest one with stops
  function newestRoute() { const m = G.getMap(); for (let i = m.lines.length - 1; i >= 0; i--) if (m.lines[i].path.length) return m.lines[i]; return m.lines[m.lines.length - 1]; }
  function openRoute(l) { if (!l) return; G.setActiveLine(l.id); G.setSelection({ type: 'line', id: l.id }); setTab('sel'); G.renderPanels(); G.render(); }

  // ---------- start card on a blank map ----------
  function renderStart() {
    const stage = $('stage'); if (!stage || !G) return;
    let c = $('startCard');
    const empty = !Object.keys(G.getMap().stations).length && G.getTool() === 'select';
    if (!empty) { if (c) c.hidden = true; return; }
    if (!c) { c = document.createElement('section'); c.id = 'startCard'; c.className = 'start-card'; c.setAttribute('aria-labelledby', 'startTitle'); stage.appendChild(c); }
    const opt = (act, glyph, k, sub, primary) => `<button type="button" class="start-opt${primary ? ' primary' : ''}" data-easy="${act}">${ic(glyph, 24)}<span><span class="so-name">${esc(t(k))}</span><span class="so-sub">${esc(t(sub))}</span></span></button>`;
    const html = `<h2 class="headline-sm" id="startTitle">${esc(t('startTitle'))}</h2><p class="supporting">${esc(t('startSub'))}</p>` +
      opt('station', 'add_location_alt', 'startStation', 'startStationSub', true) + opt('line', 'conversion_path', 'startRoute', 'startRouteSub') +
      opt('import', 'upload_file', 'startImport', 'startImportSub') + opt('template', 'map', 'startTemplate', 'startTemplateSub');
    if (c.dataset.html !== html) { c.innerHTML = html; c.dataset.html = html; }
    c.hidden = false;
  }

  // ---------- Help menu ----------
  function buildHelp() {
    const w = $('helpWrap'); if (!w) return;
    w.innerHTML = `<button type="button" class="btn outlined help-btn" id="helpBtn" aria-haspopup="menu" aria-expanded="false">${ic('help', 18)}<span>${esc(t('help'))}</span></button>
      <div class="menu" id="helpMenu" role="menu" hidden>
      <button type="button" role="menuitem" data-easy="checklist">${ic('checklist', 24)}<span>${esc(t('helpChecklist'))}</span></button>
      <button type="button" role="menuitem" data-easy="toggleHints">${ic('lightbulb', 24)}<span>${esc(t(hintsOn() ? 'hideHints' : 'showHints'))}</span></button>
      <button type="button" role="menuitem" data-easy="palette">${ic('keyboard_command_key', 24)}<span>${esc(t('helpCommands'))}</span></button>
      <a role="menuitem" href="../docs/" target="_blank" rel="noopener">${ic('menu_book', 24)}<span>${esc(t('helpGuide'))}</span></a></div>`;
  }
  function toggleHelp(force) {
    const m = $('helpMenu'), b = $('helpBtn'); if (!m) return;
    const open = typeof force === 'boolean' ? force : m.hidden;
    m.hidden = !open; b.setAttribute('aria-expanded', String(open));
    if (open) m.querySelector('[role=menuitem]').focus();
  }

  // ---------- search: routes first, regex builder behind a button ----------
  function arrangeLeft() {
    const left = document.querySelector('.panel.left'); if (!left || left.dataset.easy) return;
    left.dataset.easy = '1';
    const search = left.querySelector('.search-sec'), routes = $('lineList') && $('lineList').closest('section');
    if (search && routes) left.insertBefore(routes, search);
    const bar = search && search.querySelector('.search-bar'), row = search && search.querySelector('.regex-row'), rx = $('rxBuilder');
    if (!bar || !row || !rx) return;
    const area = document.createElement('div'); area.id = 'rxArea'; area.className = 'rx-area';
    bar.after(area); area.appendChild(row); area.appendChild(rx);
    const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'rxToggle'; btn.className = 'rx-toggle'; btn.setAttribute('aria-controls', 'rxArea');
    btn.innerHTML = '<span aria-hidden="true">.*</span>';
    const wrap = document.createElement('div'); wrap.className = 'search-wrap'; bar.before(wrap); wrap.appendChild(bar); wrap.appendChild(btn);
    const mode = $('searchMode');
    setRx(get(KEY.rx, '0') === '1' || (mode && mode.value === 'regex'));
  }
  function setRx(open) {
    const a = $('rxArea'), b = $('rxToggle'); if (!a || !b) return;
    a.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-pressed', String(open));
    b.setAttribute('aria-label', t('rxToggle')); b.title = t('rxToggle');
    put(KEY.rx, open ? '1' : '0');
  }

  // ---------- actions ----------
  function act(a, el) {
    const map = G.getMap();
    switch (a) {
      case 'finish': G.finishRoute(); break;
      case 'undoStop': G.undo(); break;
      case 'hideHints': put(KEY.hints, '0'); renderHint(); buildHelp(); G.toast(t('hintsHidden')); break;
      case 'toggleHints': put(KEY.hints, hintsOn() ? '0' : '1'); toggleHelp(false); buildHelp(); renderHint(); break;
      case 'gsHide': put(KEY.gsHidden, '1'); G.renderInspector(); break;
      case 'checklist': put(KEY.gsHidden, '0'); toggleHelp(false); G.setSelection(null); setTab('sel'); G.renderPanels(); G.render(); { const s = $('gsTitle'); if (s) s.scrollIntoView({ block: 'nearest' }); } break;
      case 'palette': toggleHelp(false); toggleMore(false); if (window.GMMCEditing) window.GMMCEditing.palette(); break;
      case 'paste': toggleMore(false); if (window.GMMCEditing) window.GMMCEditing.paste(); break;
      case 'import': toggleMore(false); if (window.GMMCGtfs) window.GMMCGtfs.open(); break;
      case 'template': toggleMore(false); if (!Object.keys(map.stations).length || confirm(t('replaceConfirm'))) G.newMap('gtha'); break;
      case 'blank': toggleMore(false); if (!Object.keys(map.stations).length || confirm(t('replaceConfirm'))) G.newMap('blank'); break;
      case 'station': case 'gs-station': G.setTool('station'); break;
      case 'tool-label': toggleMore(false); G.setTool('label'); break;
      case 'tool-erase': toggleMore(false); G.setTool('erase'); break;
      case 'line': case 'gs-route': G.setTool('line'); break;
      case 'gs-freq': case 'gs-name': openRoute(newestRoute()); break;
      case 'gs-export': { const b = $('exportBtn'); if (b) b.click(); break; }
      default: return false;
    }
    return true;
  }

  on('click', (e) => {
    const more = e.target.closest('#toolMore'); if (more) { toggleMore(); return true; }
    const help = e.target.closest('#helpBtn'); if (help) { toggleHelp(); return true; }
    const rx = e.target.closest('#rxToggle'); if (rx) { setRx($('rxArea').hidden); if (!$('rxArea').hidden) { const m = $('searchMode'); if (m) m.focus(); } return true; }
    const tb = e.target.closest('#easyTabs [role=tab]'); if (tb) { setTab(tb.dataset.pane); return true; }
    if (e.target.closest('#exportMenu [data-act]')) put(KEY.exported, '1');
    const b = e.target.closest('[data-easy]');
    if (!e.target.closest('#toolMoreMenu')) toggleMore(false);
    if (!e.target.closest('#helpWrap')) toggleHelp(false);
    if (b && b.tagName === 'BUTTON') return act(b.dataset.easy, b);
    return false;
  });
  on('keydown', (e) => {
    if (e.key === 'Escape') { const m = $('toolMoreMenu'), h = $('helpMenu'); if ((m && !m.hidden) || (h && !h.hidden)) { toggleMore(false); toggleHelp(false); return true; } }
    return false;
  });
  on('toolChanged', () => { if (G) { renderHint(); renderStart(); } });
  let lastSel = '', lastLang = '';
  function relabel() { renderTabs(); buildHelp(); setRx(!$('rxArea') || !$('rxArea').hidden); for (const id of ['toolHint', 'startCard']) { const el = $(id); if (el) el.dataset.html = ''; } }
  on('afterRender', () => {
    if (!G) return; // the editor draws once before the ready hooks run
    const lang = G.getSettings().lang; if (lang !== lastLang) { if (lastLang) relabel(); lastLang = lang; }
    renderHint(); renderStart();
    // selecting something on the map shows it, whatever tab was open
    const s = G.getSelection(), key = s ? JSON.stringify(s) : '';
    if (key && key !== lastSel && tab !== 'sel') setTab('sel');
    lastSel = key;
  });
  on('ready', (g) => {
    G = g;
    // every other module has added its panels by now; later ones are classified as they arrive
    buildTabs(); buildHelp(); arrangeLeft(); renderHint(); renderStart();
  });
})();
