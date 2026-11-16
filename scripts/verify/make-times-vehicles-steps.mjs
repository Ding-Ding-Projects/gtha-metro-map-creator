// Writes times-vehicles.steps.json: node scripts/verify/make-times-vehicles-steps.mjs
// Run the result with scripts/verify/edge-drive.mjs at 1440x900 and again at 390x844 (the overflow check reads the width it runs at).
import fs from 'node:fs';
const wait = (ms) => ({ wait: ms });
const closeSetup = "const d = document.getElementById('setupDialog'); if (d && d.open) d.close();";
// Centre the map on a station at a zoom level (geographic layout: screen = geo position * zoom * grid + pan).
const focus = (id, k) => `const v = GMMC.getView(); const g = GMMC.stGeo(GMMC.getMap().stations[${id}]); const r = document.getElementById('map').getBoundingClientRect(); v.k = ${k}; v.tx = r.width / 2 - g.x * v.k * GMMC.G; v.ty = r.height / 2 - g.y * v.k * GMMC.G; GMMC.render();`;
const line = "GMMC.getMap().lines.find((x) => x.id === 'l1')";
const pillText = "(() => { const p = document.querySelector('.tv-pill[data-tvp=\"l1|' + __tv.a + '|' + __tv.b + '\"]'); return p ? p.querySelector('.tv-tx').textContent : null; })()";
const gtfsGap = "(() => { const rows = GMMCGtfsExport.files()['stop_times.txt'].trim().split('\\r\\n').slice(1).map((l) => l.split(',')).filter((r) => r[0] === 'l1_m_WEEKDAY_0'); const hms = (s) => { const p = s.split(':').map(Number); return p[0] * 3600 + p[1] * 60 + p[2]; }; const A = rows.find((r) => r[3] === __tv.a), B = rows.find((r) => r[3] === __tv.b); return hms(B[1]) - hms(A[1]); })()";
const simMin = "(() => { GMMCSim.start(); const s = GMMCSim.state().lines.l1.oneWayMin; GMMCSim.stop(); return s; })()";
const setField = (v) => `(() => { GMMC.setActiveLine('l1'); GMMC.setSelection({ type: 'line', id: 'l1' }); GMMC.renderPanels(); const i = document.querySelector('[data-tvt][data-a="' + __tv.a + '"][data-b="' + __tv.b + '"]'); i.value = '${v}'; i.dispatchEvent(new Event('change', { bubbles: true })); return !!i; })()`;

const steps = [
  wait(3000),
  { name: 'reset', js: "localStorage.clear(); 'cleared'" },
  wait(300),
  { name: 'setup', js: `(() => { ${closeSetup} const stops = ${line}.path.filter((r) => r[0] !== '@'); window.__tv = { a: stops[10], b: stops[11] }; const L = ${line}; return { a: __tv.a, b: __tv.b, hasTimes: !!L.times, hasVehicles: !!L.vehicles, api: [typeof GMMCJourney.segmentMinutes, typeof GMMCTimes.pairsOf, typeof GMMCVehicles.summary] }; })()` },
  // ---- pills only when zoomed in ----
  { name: 'pills-zoomed-out', js: `(() => { ${focus('__tv.a', 0.4)} return document.querySelectorAll('.tv-pill').length; })()` },
  { name: 'pills-zoomed-in', js: `(() => { ${focus('__tv.a', 3)} const n = document.querySelectorAll('.tv-pill').length; return { n, estimated: document.querySelectorAll('.tv-pill.est').length, set: document.querySelectorAll('.tv-pill.set').length, pair: ${pillText} }; })()` },
  wait(400),
  { shot: 'tv-pills-estimated.png' },
  // ---- baseline of every consumer before an override ----
  { name: 'before', js: `(() => { window.__before = { plan: GMMCJourney.plan(__tv.a, __tv.b, 'peak').total, gtfs: ${gtfsGap}, sim: ${simMin}, est: GMMCJourney.segmentMinutes(${line}, __tv.a, __tv.b) }; return __before; })()` },
  // ---- set a time in the inspector ----
  { name: 'set-9-minutes', js: setField('9') },
  wait(300),
  { name: 'after-set', js: `(() => { const L = ${line}; return { times: L.times, pill: ${pillText}, count: document.getElementById('tvCount').textContent, resetEnabled: !document.querySelector('[data-tvreset][data-a="' + __tv.a + '"]').disabled, segment: GMMCJourney.segmentMinutes(L, __tv.b, __tv.a) }; })()` },
  { name: 'consumers-after', js: `(() => { const plan = GMMCJourney.plan(__tv.a, __tv.b, 'peak').total, gtfs = ${gtfsGap}, sim = ${simMin}; return { planDelta: +(plan - __before.plan).toFixed(2), planExpected: +(9 - __before.est).toFixed(2), gtfsGapSeconds: gtfs, simDeltaMin: +(sim - __before.sim).toFixed(2) }; })()` },
  { shot: 'tv-pill-set.png' },
  { name: 'undo', js: `(() => { GMMC.undo(); const L = ${line}; return { times: L.times || null, pill: ${pillText} }; })()` },
  { name: 'redo', js: `(() => { GMMC.redo(); const L = ${line}; return { times: L.times || null, pill: ${pillText} }; })()` },
  { name: 'invalid-value-refused', js: `(() => { ${setField('0')}; const L = ${line}; return L.times; })()` },
  // ---- reset button ----
  { name: 'reset-button', js: `(() => { GMMC.setSelection({ type: 'line', id: 'l1' }); GMMC.renderPanels(); document.querySelector('[data-tvreset][data-a="' + __tv.a + '"]').click(); const L = ${line}; return { times: L.times || null, pill: ${pillText} }; })()` },
  // ---- stepper buttons ----
  { name: 'stepper-times', js: `(() => { GMMC.setSelection({ type: 'line', id: 'l1' }); GMMC.renderPanels(); const q = (s) => document.querySelector('[data-tvt][data-a="' + __tv.a + '"] ~ ' + s) ; const row = document.querySelector('[data-tvt][data-a="' + __tv.a + '"]').closest('.tv-row'); const inc = row.querySelector('[data-step="1"]'), dec = row.querySelector('[data-step="-1"]'); const base = +row.querySelector('.m3-num').dataset.base; inc.click(); const first = ${line}.times[__tv.a + '>' + __tv.b]; inc.click(); const second = ${line}.times[__tv.a + '>' + __tv.b]; dec.click(); dec.click(); dec.click(); dec.click(); dec.click(); dec.click(); dec.click(); dec.click(); dec.click(); dec.click(); const floor = ${line}.times[__tv.a + '>' + __tv.b]; const est = row.querySelector('.tv-est').textContent; ${setField('')}; return { base, first, second, floor, est, cleared: !${line}.times, labels: [inc.getAttribute('aria-label'), dec.getAttribute('aria-label')] }; })()` },
  // ---- click a pill in Select to edit it ----
  { name: 'pill-click-editor', js: `(() => { GMMC.setTool('select'); const p = document.querySelector('.tv-pill[data-tvp="l1|' + __tv.a + '|' + __tv.b + '"] rect'); const r = p.getBoundingClientRect(); p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); const input = document.getElementById('tvPopIn'); return { popup: !!document.querySelector('.tv-pop'), focused: document.activeElement === input }; })()` },
  wait(500),
  { shot: 'tv-pill-editor.png' },
  { name: 'pill-editor-enter', js: `(() => { const i = document.getElementById('tvPopIn'); i.value = '4'; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); const L = ${line}; return { times: L.times, popupClosed: !document.querySelector('.tv-pop'), pill: ${pillText} }; })()` },
  // ---- either key order is accepted ----
  { name: 'reverse-key', js: `(() => { const L = ${line}; L.times = { [__tv.b + '>' + __tv.a]: 6 }; GMMC.render(); return { segment: GMMCJourney.segmentMinutes(L, __tv.a, __tv.b), pill: ${pillText} }; })()` },
  // ---- settings switches ----
  { name: 'settings-switches', js: `(() => { document.getElementById('settingsBtn').click(); const ids = ['setTimes', 'setTimesExport', 'setVehLegend']; const res = ids.map((i) => document.getElementById(i).checked); document.getElementById('setTimes').click(); const off = document.querySelectorAll('.tv-pill').length; document.getElementById('setTimes').click(); const on = document.querySelectorAll('.tv-pill').length; document.getElementById('settingsDialog').close(); return { defaults: res, pillsWhenOff: off, pillsWhenOn: on > 0 }; })()` },
  // ---- exports ----
  { name: 'export-pills', js: `(() => { const S = GMMC.getSettings(); const count = (s) => (s.match(/class="tv-pill/g) || []).length; S.exportTimes = false; const off = count(GMMC.standaloneSvg()); S.exportTimes = true; const on = count(GMMC.standaloneSvg()); S.exportTimes = false; return { off, onPositive: on > 0 }; })()` },
  // ---- vehicles ----
  { name: 'vehicles-add', js: `(() => { GMMC.setActiveLine('l1'); GMMC.setSelection({ type: 'line', id: 'l1' }); GMMC.renderPanels(); document.querySelector('[data-vhact="add"]').click(); document.querySelector('[data-vhact="add"]').click(); return document.querySelectorAll('.vh-card').length; })()` },
  { name: 'vehicles-edit', js: `(() => { const set = (i, f, v) => { const e = document.querySelector('[data-vh="' + f + '"][data-i="' + i + '"]'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }; set(0, 'maker', 'New Flyer'); set(0, 'model', 'Xcelsior XD60'); set(0, 'count', '3'); set(1, 'maker', 'Bombardier'); set(1, 'model', 'Toronto Rocket'); set(1, 'note', 'Line 1 fleet (example)'); return ${line}.vehicles; })()` },
  { name: 'vehicles-menus', js: `(() => { const card = document.querySelector('.vh-card[data-i="0"]'); const edit = card.querySelector('[data-vhact="edit"]'); const wasOpen = !card.querySelector('.vh-body').hidden; const mk = card.querySelector('[data-vh="maker"]'); mk.focus(); mk.value = 'Nov'; mk.dispatchEvent(new Event('input', { bubbles: true })); const sug = document.getElementById(mk.getAttribute('aria-controls')); const shown = [...sug.querySelectorAll('[role=option]:not([hidden])')].map((o) => o.dataset.val); const expanded = mk.getAttribute('aria-expanded'); const opt = sug.querySelector('[role=option]:not([hidden])'); opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); const maker = ${line}.vehicles[0].maker; const kb = document.querySelector('.vh-card[data-i="0"] .m3-menu-btn'); kb.click(); const menu = document.querySelector('.vh-card[data-i="0"] .vh-kinds'); const items = menu.querySelectorAll('[role=option]').length; const withIcons = menu.querySelectorAll('[role=option] svg').length; const opened = !menu.hidden; const lrv = [...menu.querySelectorAll('[role=option]')].find((o) => o.dataset.val === 'lrv'); lrv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); const kind = ${line}.vehicles[0].kind; const cnt = document.querySelector('.vh-card[data-i="0"] [data-vh=count]'); const plus = document.querySelector('.vh-card[data-i="0"] [data-step="1"]'); plus.click(); plus.click(); const c1 = ${line}.vehicles[0].count; document.querySelector('.vh-card[data-i="0"] [data-step="-1"]').click(); document.querySelector('.vh-card[data-i="0"] [data-step="-1"]').click(); const c2 = ${line}.vehicles[0].count; ${line}.vehicles[0].maker = 'New Flyer'; ${line}.vehicles[0].kind = 'articulated'; ${line}.vehicles[0].count = 3; GMMC.renderLines(); GMMC.renderInspector(); return { wasOpen, shown, expanded, maker, items, withIcons, opened, kind, c1, c2 }; })()` },
  { name: 'vehicles-row-summary', js: `(() => { const e = [...document.querySelectorAll('#lineList .li')].find((x) => x.textContent.includes('Line 1 ')); const s = e.querySelector('.li-veh'); return s ? s.textContent : null; })()` },
  { name: 'vehicles-reorder', js: `(() => { document.querySelector('.vh-drag[data-i="1"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); const v = ${line}.vehicles.map((x) => x.model); const e = [...document.querySelectorAll('#lineList .li')].find((x) => x.textContent.includes('Line 1 ')); return { order: v, summary: e.querySelector('.li-veh').textContent }; })()` },
  wait(500),
  { shot: 'tv-vehicles-inspector.png' },
  { name: 'vehicle-in-journey', js: `(() => { document.getElementById('jyToggle').click(); const f = document.getElementById('jyFrom'), t = document.getElementById('jyTo'); f.value = ''; f.value = GMMC.getMap().stations[__tv.a].name; f.dispatchEvent(new Event('input', { bubbles: true })); t.value = GMMC.getMap().stations[__tv.b].name; t.dispatchEvent(new Event('input', { bubbles: true })); return { veh: document.querySelector('#jyResult .jy-veh') ? document.querySelector('#jyResult .jy-veh').textContent.trim() : null }; })()` },
  { name: 'vehicles-legend-export', js: `(() => { const S = GMMC.getSettings(); S.legend = true; S.vehicleLegend = false; const off = GMMC.standaloneSvg().includes('Toronto Rocket'); S.vehicleLegend = true; const svg = GMMC.standaloneSvg(); const on = svg.includes('Toronto Rocket'); const w = +/width="(\\d+)"/.exec(svg)[1]; S.vehicleLegend = false; return { off, on, width: w }; })()` },
  // ---- project save and load keep both ----
  { name: 'project-roundtrip', js: `(() => { const L = ${line}; L.times = { [__tv.a + '>' + __tv.b]: 7.5 }; const json = GMMC.projectJson(); const parsed = JSON.parse(json); const saved = parsed.map.lines.find((x) => x.id === 'l1'); const ok = GMMC.loadText(json); const L2 = ${line}; return { loaded: ok, savedTimes: saved.times, savedVehicles: saved.vehicles.length, times: L2.times, vehicles: L2.vehicles.map((v) => v.maker + ' ' + v.model + ' x' + v.count), settingsKept: ['showTimes', 'exportTimes', 'vehicleLegend'].map((k) => k in parsed.settings) }; })()` },
  // ---- an old map with neither field still loads; bad values are dropped ----
  { name: 'old-map', js: `(() => { const m = JSON.parse(JSON.stringify(GMMC.getMap())); m.lines.forEach((l) => { delete l.times; delete l.vehicles; }); const v = GMMC.validateMap(m); const ok = GMMC.loadText(JSON.stringify(m)); return { valid: !!v, loaded: ok, anyTimes: GMMC.getMap().lines.some((l) => l.times), anyVehicles: GMMC.getMap().lines.some((l) => l.vehicles), lines: GMMC.getMap().lines.length }; })()` },
  { name: 'bad-values', js: `(() => { const m = JSON.parse(JSON.stringify(GMMC.getMap())); const l = m.lines[0]; const s = l.path.filter((r) => r[0] !== '@'); l.times = { [s[0] + '>' + s[1]]: 3, [s[1] + '>' + s[2]]: 0, [s[2] + '>' + s[3]]: 700, [s[3] + '>' + s[4]]: 'abc', ['nope>' + s[0]]: 5, [s[0] + '>' + s[0]]: 5 }; l.vehicles = [{ maker: 'X', model: 'Y', kind: 'spaceship', count: -4 }, { maker: '', model: '' }, 'junk', { maker: 'Stadler', model: 'FLIRT', kind: 'regional', count: 12 }]; const v = GMMC.validateMap(m); return { times: v.lines[0].times, vehicles: v.lines[0].vehicles }; })()` },
  { name: 'reload-for-visuals', js: `(() => { GMMC.newMap('template'); ${closeSetup} return 'ok'; })()` },
  // ---- Cantonese ----
  { name: 'cantonese', js: `(() => { const S = GMMC.getSettings(); const L = ${line}; L.vehicles = [{ maker: 'Bombardier', model: 'Toronto Rocket', kind: 'subway' }]; S.lang = 'yue'; GMMC.saveSettings(); GMMC.applyI18n(); GMMC.setActiveLine('l1'); GMMC.setSelection({ type: 'line', id: 'l1' }); GMMC.renderPanels(); const txt = document.getElementById('inspector').textContent; const sw = [...document.querySelectorAll('#settingsDialog [data-t]')].filter((n) => /tvShowTimes|tvExportTimes|vhLegendCol/.test(n.dataset.t)).map((n) => n.textContent); return { travel: txt.includes('行車時間'), vehicles: txt.includes('車輛'), kind: txt.includes('地鐵列車'), switches: sw }; })()` },
  { name: 'cantonese-view', js: `(() => { ${focus('__tv.a', 3)} return document.querySelector('.tv-pill') ? document.querySelector('.tv-pill').textContent : null; })()` },
  wait(400),
  { shot: 'tv-cantonese.png' },
  { name: 'english-again', js: "(() => { const S = GMMC.getSettings(); S.lang = 'en'; GMMC.saveSettings(); GMMC.applyI18n(); return S.lang; })()" },
  // ---- dark theme ----
  { name: 'dark-theme', js: `(() => { const S = GMMC.getSettings(); S.theme = 'dark'; GMMC.saveSettings(); document.documentElement.setAttribute('data-theme', 'dark'); GMMC.setSelection({ type: 'line', id: 'l1' }); GMMC.renderPanels(); GMMC.render(); return document.documentElement.getAttribute('data-theme'); })()` },
  wait(400),
  { shot: 'tv-dark.png' },
  { name: 'light-again', js: "(() => { const S = GMMC.getSettings(); S.theme = 'light'; GMMC.saveSettings(); document.documentElement.setAttribute('data-theme', 'light'); return 'light'; })()" },
  // ---- no horizontal overflow at the width this run uses (run at 1440 and at 390) ----
  { name: 'overflow', js: `(() => { const de = document.documentElement; const wide = [...document.querySelectorAll('.tv-section *, .vh-section *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length; return { width: window.innerWidth, scrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth, overflow: de.scrollWidth > window.innerWidth + 1, sectionElementsPastEdge: wide }; })()` },
  { shot: 'tv-final.png' }
];
fs.writeFileSync(new URL('./times-vehicles.steps.json', import.meta.url), JSON.stringify(steps, null, 1) + '\n');
console.log('wrote', steps.length, 'steps');
