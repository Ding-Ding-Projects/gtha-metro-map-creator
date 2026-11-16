// Writes editor17.steps.json: per-line station markers, shared bends, crossing reduction.
// Run: node scripts/verify/make-editor17-steps.mjs
// Drive: node scripts/verify/edge-drive.mjs http://127.0.0.1:<port>/site/app/ scripts/verify/editor17.steps.json <out> [width] [height]
import fs from 'node:fs';
const S = [];
const js = (name, fn) => S.push({ name, js: `(${fn.toString()})()` });
const wait = (ms) => S.push({ wait: ms });
const shot = (f) => S.push({ shot: f });

S.push({ name: 'clear', js: '(() => { try { localStorage.clear(); } catch (e) {} location.reload(); return true; })()' });
wait(3000);
js('prep', () => {
  const d = document.getElementById('setupDialog'); if (d && d.close) d.close();
  const s = GMMC.getSettings(); s.lang = 'en'; s.mapStyle = 'material'; s.theme = 'light'; GMMC.saveSettings(); GMMC.applyI18n();
  document.documentElement.setAttribute('data-theme', 'light');
  GMMC.setLayout('schematic'); GMMC.fit();
  window.__toasts = []; GMMC.toast = (m) => { window.__toasts.push(m); };
  const m = GMMC.getMap();
  window.__pickLine = (id) => { const l = GMMC.lineById(id); GMMC.setSelection({ type: 'line', id }); GMMC.renderPanels(); return l; };
  window.__marker = (v) => { document.querySelector('#inspector [data-marker="' + v + '"]').click(); };
  window.__vp = () => document.getElementById('viewport');
  window.__expected = (l) => Object.values(GMMC.getMap().stations).filter((st) => {
    if (!l.path.includes(st.id)) return false;
    const mm = GMMC.getMap();
    const vis = mm.lines.filter((x) => x.visible && x.path.includes(st.id));
    const lines = vis.filter((x) => !(x.skip && x.skip.includes(st.id)));
    if (!lines.length || GMMC.isInterchangeIn(mm, st)) return false;
    return lines[0] === l;
  }).length;
  const line = m.lines.find((l) => l.path.length >= 8 && window.__expected(l) >= 5);
  window.__line = line.id;
  return { sharedBends: m.sharedBends, line: line.id, plainStations: window.__expected(line), lines: m.lines.length };
});
wait(400);
js('baseline', () => {
  const vp = window.__vp();
  window.__interRings = vp.querySelectorAll('circle[stroke="#16181D"]').length;
  return { interchangeRings: window.__interRings, mk: vp.querySelectorAll('.mk-tick,.mk-pill,.mk-dot').length };
});
js('select-line', () => { window.__pickLine(window.__line); return { section: !!document.querySelector('#inspector .mk-sec'), buttons: [...document.querySelectorAll('#inspector [data-marker]')].map((b) => b.dataset.marker + ':' + b.getAttribute('aria-pressed')).join(','), preview: !!document.querySelector('#inspector .mk-preview') }; });
wait(300);
shot('01-inspector-ring-default.png');
js('tick', () => {
  window.__marker('tick');
  const l = GMMC.lineById(window.__line), vp = window.__vp();
  const ticks = [...vp.querySelectorAll('path.mk-tick')];
  let awayViolations = 0, notOctilinear = 0, checked = 0;
  for (const t of ticks) {
    const n = t.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
    const g = t.closest('g[data-st]'), id = g.dataset.st;
    const vx = n[2] - n[0], vy = n[3] - n[1];
    const ang = Math.atan2(vy, vx) * 180 / Math.PI;
    if (Math.abs(ang / 45 - Math.round(ang / 45)) > 0.02) notOctilinear++;
    const lab = vp.querySelector('text.st-label[data-st="' + id + '"]');
    if (!lab) continue;
    const b = lab.getBBox(), lx = b.x + b.width / 2 - n[0], ly = b.y + b.height / 2 - n[1];
    checked++;
    if (vx * lx + vy * ly > 0.5) awayViolations++;
  }
  return { marker: l.marker, ticks: ticks.length, expected: window.__expected(l), labelsChecked: checked, ticksPointingToLabel: awayViolations, notMultipleOf45: notOctilinear, interchangeRings: vp.querySelectorAll('circle[stroke="#16181D"]').length, baselineRings: window.__interRings, pressed: document.querySelector('#inspector [data-marker="tick"]').getAttribute('aria-pressed') };
});
wait(300);
shot('02-tick.png');
js('zoom-tick', () => {
  const m = GMMC.getMap(), l = GMMC.lineById(window.__line), v = GMMC.getView(), r = document.getElementById('map').getBoundingClientRect();
  const st = m.stations[l.path[Math.floor(l.path.length / 2)]];
  v.k = 2.2; v.tx = r.width / 2 - st.x * GMMC.G * v.k; v.ty = r.height / 2 - st.y * GMMC.G * v.k; GMMC.render();
  return { zoomed: v.k };
});
wait(300);
shot('02b-tick-zoom.png');
js('export-svg-tick', () => {
  const svg = GMMC.standaloneSvg(GMMC.exportScene());
  return { ticksInExport: (svg.match(/class="mk-tick"/g) || []).length, expected: window.__expected(GMMC.lineById(window.__line)) };
});
js('pill', () => { window.__marker('pill'); const vp = window.__vp(), svg = GMMC.standaloneSvg(GMMC.exportScene()); return { marker: GMMC.lineById(window.__line).marker, pills: vp.querySelectorAll('rect.mk-pill').length, ticks: vp.querySelectorAll('path.mk-tick').length, pillsInExport: (svg.match(/class="mk-pill"/g) || []).length, interchangeRings: vp.querySelectorAll('circle[stroke="#16181D"]').length }; });
wait(300);
shot('03-pill.png');
js('zoom-pill', () => {
  const m = GMMC.getMap(), l = GMMC.lineById(window.__line), v = GMMC.getView(), r = document.getElementById('map').getBoundingClientRect();
  const st = m.stations[l.path[Math.floor(l.path.length / 2)]];
  v.k = 2.2; v.tx = r.width / 2 - st.x * GMMC.G * v.k; v.ty = r.height / 2 - st.y * GMMC.G * v.k; GMMC.render();
  return { zoomed: v.k };
});
wait(300);
shot('03b-pill-zoom.png');
js('dot', () => { window.__marker('dot'); const vp = window.__vp(), svg = GMMC.standaloneSvg(GMMC.exportScene()); return { marker: GMMC.lineById(window.__line).marker, dots: vp.querySelectorAll('.mk-dot').length, dotsInExport: (svg.match(/class="mk-dot"/g) || []).length, interchangeRings: vp.querySelectorAll('circle[stroke="#16181D"]').length }; });
wait(300);
shot('04-dot.png');
js('zoom-dot', () => {
  const m = GMMC.getMap(), l = GMMC.lineById(window.__line), v = GMMC.getView(), r = document.getElementById('map').getBoundingClientRect();
  const st = m.stations[l.path[Math.floor(l.path.length / 2)]];
  v.k = 2.2; v.tx = r.width / 2 - st.x * GMMC.G * v.k; v.ty = r.height / 2 - st.y * GMMC.G * v.k; GMMC.render();
  return { zoomed: v.k };
});
wait(300);
shot('04b-dot-zoom.png');
js('ring', () => { window.__marker('ring'); const vp = window.__vp(); return { marker: GMMC.lineById(window.__line).marker, rings: vp.querySelectorAll('.mk-ring').length, others: vp.querySelectorAll('.mk-tick,.mk-pill,.mk-dot').length }; });
js('unset', () => { window.__marker(''); const l = GMMC.lineById(window.__line); return { marker: l.marker === undefined ? 'unset' : l.marker, mkAny: window.__vp().querySelectorAll('.mk-ring,.mk-tick,.mk-pill,.mk-dot').length }; });
js('undo-redo', () => {
  window.__marker('tick'); const a = GMMC.lineById(window.__line).marker;
  GMMC.undo(); const b = GMMC.lineById(window.__line).marker;
  GMMC.redo(); const c = GMMC.lineById(window.__line).marker;
  return { afterSet: a, afterUndo: b === undefined ? 'unset' : b, afterRedo: c };
});
js('style-default-and-override', () => {
  window.__marker('pill');
  const s = GMMC.getSettings(); s.mapStyle = 'classic'; GMMC.saveSettings(); GMMC.render();
  const vp = window.__vp();
  const out = { styleTicks: vp.querySelectorAll('line[stroke-linecap="butt"]').length, ownPills: vp.querySelectorAll('rect.mk-pill').length };
  window.__marker('');
  out.afterUnsetPills = vp.querySelectorAll('rect.mk-pill').length;
  out.afterUnsetStyleTicks = vp.querySelectorAll('line[stroke-linecap="butt"]').length;
  s.mapStyle = 'material'; GMMC.saveSettings(); GMMC.render();
  return out;
});
js('save-load', () => {
  window.__marker('dot');
  const proj = JSON.parse(GMMC.projectJson());
  const saved = proj.map.lines.find((l) => l.id === window.__line).marker;
  const flag = proj.map.sharedBends;
  const ok = GMMC.loadJson(GMMC.projectJson());
  const l = GMMC.lineById(window.__line);
  return { savedMarker: saved, savedSharedBends: flag, reloaded: ok, afterLoadMarker: l && l.marker, afterLoadShared: GMMC.getMap().sharedBends, dots: window.__vp().querySelectorAll('.mk-dot').length };
});
js('old-map-loads', () => {
  const m = JSON.parse(JSON.stringify(GMMC.getMap()));
  delete m.sharedBends; for (const l of m.lines) delete l.marker;
  const ok = GMMC.loadJson(JSON.stringify(m));
  const nm = GMMC.getMap();
  return { loaded: ok, sharedBends: nm.sharedBends, anyMarker: nm.lines.some((l) => l.marker), stations: Object.keys(nm.stations).length, lines: nm.lines.length, svgOk: window.__vp().querySelectorAll('circle').length > 100 };
});
js('restore-template', () => { GMMC.newMap('template'); GMMC.setLayout('schematic'); GMMC.fit(); const m = GMMC.getMap(); const l = m.lines.find((x) => x.id === window.__line); return { sharedBends: m.sharedBends, markerOnLine: l && l.marker }; });

// ---------- shared bends ----------
js('find-pair', () => {
  const m = GMMC.getMap(), seen = new Map();
  for (const l of m.lines) for (let i = 0; i < l.path.length - 1; i++) {
    const a = l.path[i], b = l.path[i + 1]; if (a === b || a[0] === '@' || b[0] === '@') continue;
    const k = a < b ? a + '|' + b : b + '|' + a;
    (seen.get(k) || seen.set(k, []).get(k)).push({ l: l.id, i, same: a < b });
  }
  const cands = [...seen.entries()].filter(([, v]) => new Set(v.map((x) => x.l)).size >= 2);
  cands.sort((p, q) => (new Set(q[1].map((x) => x.same)).size - new Set(p[1].map((x) => x.same)).size));
  const [key, segs] = cands[0];
  const b = key.split('|')[1];
  const st = m.stations[b]; GMMC.checkpoint(); st.x += 3; st.y += 1; GMMC.changed();
  window.__pair = { key, segs };
  return { key, lines: segs.map((s) => s.l + (s.same ? '>' : '<')).join(','), bothDirections: new Set(segs.map((x) => x.same)).size === 2, candidates: cands.length };
});
js('canon', () => {
  window.__canon = () => window.__pair.segs.map((s) => { const l = GMMC.lineById(s.l); const v = l.bends[s.i] || 'early'; return s.l + ':' + (s.same ? v : (v === 'late' ? 'early' : 'late')); });
  window.__selSeg = (k) => { const s = window.__pair.segs[k]; GMMC.setSelection({ type: 'edge', lineId: s.l, index: s.i }); GMMC.renderPanels(); };
  window.__selSeg(0);
  const sw = document.querySelector('#inspector input[data-f="map.sharedBends"]');
  return { switchPresent: !!sw, switchOn: sw && sw.checked, segmented: [...document.querySelectorAll('#inspector [data-bend]')].map((b) => b.dataset.bend + ':' + b.getAttribute('aria-pressed')).join(','), initial: window.__canon() };
});
wait(300);
shot('05-segment-inspector.png');
js('shared-on-change', () => {
  window.__eq = () => { const c = window.__canon(); return { canonical: c, allEqual: new Set(c.map((x) => x.split(':')[1])).size === 1 }; };
  document.querySelector('#inspector [data-bend="late"]').click();
  return window.__eq();
});
js('shared-on-other-line', () => {
  window.__selSeg(window.__pair.segs.length - 1);
  document.querySelector('#inspector [data-bend="late"]').click();
  return window.__eq();
});
js('undo-bend', () => { GMMC.undo(); return window.__eq(); });
js('switch-off', () => {
  window.__selSeg(0);
  document.querySelector('#inspector input[data-f="map.sharedBends"]').click();
  const off = GMMC.getMap().sharedBends === false;
  window.__selSeg(0);
  document.querySelector('#inspector [data-bend="early"]').click();
  const r = window.__eq();
  return { switchOff: off, canonical: r.canonical, independent: !r.allEqual };
});
js('switch-on-syncs', () => {
  window.__selSeg(0);
  document.querySelector('#inspector input[data-f="map.sharedBends"]').click();
  const r = window.__eq();
  return { sharedBends: GMMC.getMap().sharedBends, canonical: r.canonical, allEqual: r.allEqual };
});
js('undo-switch', () => { GMMC.undo(); return { sharedBends: GMMC.getMap().sharedBends }; });
js('shared-save-load', () => {
  GMMC.redo();
  window.__selSeg(0);
  document.querySelector('#inspector [data-bend="late"]').click();
  const before = window.__canon();
  const proj = GMMC.projectJson();
  GMMC.loadJson(proj);
  return { sharedBendsInFile: JSON.parse(proj).map.sharedBends, before, after: window.__canon(), same: JSON.stringify(before) === JSON.stringify(window.__canon()) };
});
wait(300);
shot('06-shared-bend-map.png');

// ---------- schematic crossings ----------
js('schematic-numbers', async () => {
  GMMC.newMap('template'); GMMC.setLayout('geographic'); GMMC.fit();
  const out = {};
  for (const reduce of [false, true]) {
    const t0 = performance.now();
    const r = await GMMCSchematic.run({ spacing: 2, keepShape: 0.3, reduce });
    const s = r.stats;
    out[reduce ? 'reduceOn' : 'reduceOff'] = { wallMs: Math.round(performance.now() - t0), crossingsGeographic: s.crossingsBefore, crossingsSnapped: s.crossingsSnapped, crossingsFinal: s.crossings, moves: s.reduceMoves, orderChanges: s.orderChanges, straightShare: +s.straightShare.toFixed(3), lateBends: r.bends.length, integers: Object.values(r.positions).every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)) };
    if (reduce) window.__r = r;
  }
  return out;
});
js('minimum-spacing', () => {
  const p = Object.values(window.__r.positions), seen = new Set(p.map((q) => q.x + ',' + q.y));
  return { distinctCells: seen.size, stations: p.length };
});
js('apply-and-draw', () => {
  GMMC.setLayout('schematic');
  const ok = GMMCSchematic.apply(window.__r);
  const m = GMMC.getMap();
  const late = m.lines.reduce((n, l) => n + Object.values(l.bends).filter((v) => v === 'late').length, 0);
  return { ok, lateSegments: late, sharedBends: m.sharedBends };
});
wait(700);
shot('07-after-reduce-applied.png');
js('side-sheet', () => {
  const sw = document.getElementById('schReduce');
  document.getElementById('schApply').scrollIntoView();
  return new Promise((res) => { document.getElementById('schPreview').click(); setTimeout(() => res({ switchChecked: sw.checked, cross: document.getElementById('schStatCross').textContent, note: document.getElementById('schNote').textContent }), 2500); });
});
wait(400);
shot('08-side-sheet.png');

// ---------- Cantonese, dark, layout ----------
js('cantonese', () => {
  const s = GMMC.getSettings(); s.lang = 'yue'; GMMC.saveSettings(); GMMC.applyI18n();
  window.__selSeg(0);
  const sw = [...document.querySelectorAll('#inspector .switch-row')].pop().textContent;
  window.__pickLine(window.__line);
  return { title: document.querySelector('#inspector .mk-sec .tf-label').textContent, buttons: [...document.querySelectorAll('#inspector [data-marker]')].map((b) => b.textContent.trim()).join('|'), sharedSwitch: sw, reduceLabel: document.getElementById('schReduceT').textContent };
});
wait(300);
shot('09-cantonese.png');
js('dark', () => {
  const s = GMMC.getSettings(); s.theme = 'dark'; GMMC.saveSettings(); document.documentElement.setAttribute('data-theme', 'dark'); GMMC.render();
  window.__pickLine(window.__line); window.__marker('tick');
  const cs = getComputedStyle(document.querySelector('#inspector .segmented.wide button[aria-pressed="true"]'));
  return { theme: document.documentElement.getAttribute('data-theme'), pressedBg: cs.backgroundColor };
});
wait(300);
shot('10-dark.png');
js('overflow', () => {
  const de = document.documentElement, insp = document.getElementById('inspector');
  const wide = [...document.querySelectorAll('#inspector .segmented.wide')];
  const r = insp.getBoundingClientRect();
  const out = [...insp.querySelectorAll('.segmented.wide, .mk-preview, .switch-row, .supporting')].filter((n) => { const b = n.getBoundingClientRect(); return b.right > r.right + 1 || b.left < r.left - 1; }).length;
  return { viewport: innerWidth, pageScrollWidth: de.scrollWidth, pageOverflow: de.scrollWidth > innerWidth + 1, inspectorOverflowingChildren: out, inspectorScroll: insp.scrollWidth > insp.clientWidth + 1, segmentedFitting: wide.every((w) => w.scrollWidth <= w.clientWidth + 1) };
});
js('visible-focus', () => {
  const b = document.querySelector('#inspector [data-marker="pill"]'); b.focus();
  return { focused: document.activeElement === b, outline: getComputedStyle(b).outlineStyle };
});
fs.writeFileSync(new URL('./editor17.steps.json', import.meta.url), JSON.stringify(S, null, 1));
console.log('wrote', S.length, 'steps');
