// Writes scripts/verify/gtfs-viewer.steps.json (assertions, light English at 1440x900) or, with a mode,
// a screenshot-only run: node make-gtfs-viewer-steps.mjs [dark|yue|narrow]  ->  gtfs-viewer.<mode>.steps.json
// Run:  node scripts/serve.mjs 8943 .   then   node scripts/verify/edge-drive.mjs http://127.0.0.1:8943/site/gtfs/ <steps> <out> 1440 900
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || '';
const prefix = mode || 'light';
const race = (js) => `Promise.race([(async () => { ${js} })(), new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))])`;
const steps = [{ wait: 1200 }];
steps.push({ name: 'setup', js: race(`
  window.W = (ms) => new Promise((r) => setTimeout(r, ms));
  window.go = async (h, ms) => { location.hash = h; await W(ms || 900); };
  window.seg = async (label) => { const b = [...document.querySelectorAll('.seg-b')].find((x) => x.textContent.trim().startsWith(label)); if (b) { b.click(); await W(500); } return !!b; };
  window.txt = () => document.getElementById('main').innerText;
  ${mode === 'dark' ? "GA.setTheme('dark');" : ''} ${mode === 'yue' ? "GA.setLang('yue');" : ''}
  const b = await (await fetch('/scripts/verify/fixtures/viewer-feed.zip')).blob(); const ok = await GA.openBlob(b, 'viewer-feed.zip'); await W(1500);
  return { ok, lang: document.documentElement.lang, theme: document.documentElement.getAttribute('data-theme') };`) });
const view = (name, hash, js, wait) => {
  steps.push({ name, js: race(`await go(${JSON.stringify(hash)}, ${wait || 900}); ${js || ''} return { len: txt().length, vl: document.querySelectorAll('.vl-w > *').length, vt: document.querySelectorAll('.vt-r').length, canvas: document.querySelectorAll('canvas').length, overflowX: document.documentElement.scrollWidth > innerWidth, mainOverflowX: document.getElementById('main').scrollWidth > document.getElementById('main').clientWidth + 1 };`) });
  steps.push({ shot: `${prefix}-${name}.png` });
};
view('overview', '#overview', '', 1800);
view('routes', '#routes');
view('route-map', '#route/R1', '', 1500);
view('route-timetable', '#route/R1', "await seg(window.GA.t('vTimetable')); await W(600);");
view('route-service', '#route/R2', "await seg(window.GA.t('vService'));");
view('route-info', '#route/R2', "await seg(window.GA.t('vInfo'));");
view('stops', '#stops', '', 1500);
view('stop-station', '#stop/S1', '', 1500);
view('stop-board', '#stop/ST2', '', 1500);
view('trips', '#trips');
view('trip', '#trip/T1', '', 1500);
view('blocks', '#blocks', '', 1500);
view('block-overlap', '#block/20261116/B2', '', 1500);
view('calendar', '#calendar');
view('service', '#service/WK');
view('shapes', '#shapes', '', 1200);
view('shape', '#shape/SH1', '', 1500);
view('transfers', '#transfers');
view('pathways', '#transfers/pathways/S1', '', 1200);
view('fares', '#fares');
view('fares-v2', '#fares', "await seg(window.GA.t('faresV2'));");
view('flex', '#flex', '', 1500);
view('validation', '#validation');
view('realtime', '#realtime', "[...document.querySelectorAll('button')].find((b) => b.textContent.includes(GA.t('rtSample'))).click(); await W(900);", 1000);
view('data', '#data/stop_times.txt', '', 1200);
if (!mode) {
  steps.push({ name: 'counts', js: race(`const f = GA.feed, e = await (await fetch('/scripts/verify/fixtures/viewer-feed.expected.json')).json();
    const rows = (n) => f.files[n].rows; const bad = [];
    for (const [n, v] of Object.entries(e.files)) if (rows(n) !== v) bad.push([n, rows(n), v]);
    const t7 = f.tripIx.get('T7'); const c = (k, got, want) => { if (got !== want) bad.push([k, got, want]); };
    c('routes', f.routes.length, e.routes); c('stops', f.stops.length, e.stops); c('trips', f.trips.length, e.trips); c('services', f.serviceIds.length, e.services); c('shapes', f.shapes.ids.length, e.shapes);
    for (const d of ['20261116', '20261111', '20261120', '20261225', '20261121']) c('tripsOn ' + d, f.tripsOn(d).length, e['tripsOn_' + d]);
    c('blocks', f.blocksOn('20261116').length, e.blocks_20261116); c('overlapBlocks', f.blocksOn('20261116').filter((b) => b.issues.length).length, e.overlapBlocks); c('T7 runs', f.runs(t7).length, e.frequencyRunsT7);
    const t4 = f.tripIx.get('T4'); const seqOk = f.st.stop[f.st.tripStart[t4] + 1] === f.stopIx.get('ST3') && f.st.stop[f.st.tripStart[t4] + 2] === f.stopIx.get('ST2'); c('T4 rows sorted', seqOk, true);
    const flexRows = [...f.stExtra.values()].filter((x) => x.location_id || x.location_group_id).length; c('flex rows', flexRows, 2);
    c('patterns of R1', f.routePatterns[f.routeIx.get('R1')].length, 3);
    return { mismatches: bad, orphanTrips: f.st.orphanTrips, orphanStops: f.st.orphanStops, languages: f.languages };`) });
  steps.push({ name: 'validation', js: race(`await W(300); const v = GA.validation; const o = {}; for (const [k, c] of Object.entries(v.counts)) o[k] = c.n; return { errors: v.errors, warnings: v.warnings, codes: o };`) });
  steps.push({ name: 'translations', js: race(`const f = GA.feed; f.setLang('zh-HK'); const r = [f.stopName(f.stops[f.stopIx.get('S1')]), f.routeName(f.routes[0]), f.headsign(f.trips[0])]; f.setLang(''); return r;`) });
  steps.push({ name: 'realtime', js: race(`await go('#realtime', 800); const r = GA.rt; return { vehicles: r.vehicles.length, updates: r.updates.length, alerts: r.alerts.length, delays: r.updates.slice(0, 4).map((u) => u.delay), sampleStop: r.updates[0].stops[0] };`) });
  steps.push({ name: 'rt-roundtrip', js: race(`const bytes = GtfsRt.build({ timestamp: 1700000000, vehicles: [{ tripId: 'X', routeId: 'R1', lat: 43.5, lon: -79.5, vid: 'v1', label: 'One' }], updates: [{ tripId: 'X', delay: -90, stops: [{ seq: 2, stopId: 'S', delay: -90 }] }], alerts: [{ routeId: 'R1', header: 'Hello', effect: 8 }] }); const m = GtfsRt.parse(bytes); return { v: m.vehicles[0].label, lat: Math.round(m.vehicles[0].lat * 10) / 10, d: m.updates[0].delay, sd: m.updates[0].stops[0].arrival.delay, a: m.alerts[0].header[0].text };`) });
  steps.push({ name: 'search', js: race(`await go('#overview', 600); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); await W(500); const inp = document.querySelector('.dlg .ac-in'); inp.value = 'oak'; inp.dispatchEvent(new Event('input', { bubbles: true })); await W(300); return [...document.querySelectorAll('.dlg .ac-o')].map((o) => o.innerText.replace(/\\n/g, ' | '));`) });
  steps.push({ shot: 'light-search.png' });
  steps.push({ name: 'search-open', js: race(`const inp = document.querySelector('.dlg .ac-in'); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await W(700); return location.hash;`) });
  steps.push({ name: 'datepicker', js: race(`await go('#blocks', 800); document.querySelector('.field.picker').click(); await W(500); return { days: document.querySelectorAll('.dlg .dp-d').length, act: document.querySelectorAll('.dlg .dp-d.act').length, focus: document.activeElement.getAttribute('data-d') };`) });
  steps.push({ shot: 'light-datepicker.png' });
  steps.push({ name: 'datepicker-keys', js: race(`const press = async (k) => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await W(120); }; await press('ArrowRight'); await press('ArrowDown'); const f = document.activeElement.getAttribute('data-d'); [...document.querySelectorAll('.dlg .dlg-f button')].pop().click(); await W(500); return { focus: f, date: GA.date };`) });
  steps.push({ name: 'timepicker', js: race(`await go('#stop/ST2', 800); const b = [...document.querySelectorAll('.field.picker')][1]; b.click(); await W(500); const inp = document.querySelectorAll('.dlg .tp-in'); return { inputs: inp.length, h: inp[0].value, m: inp[1].value };`) });
  steps.push({ shot: 'light-timepicker.png' });
  steps.push({ name: 'timepicker-ok', js: race(`const inp = document.querySelectorAll('.dlg .tp-in'); inp[0].value = '09'; inp[0].dispatchEvent(new Event('input', { bubbles: true })); inp[1].value = '30'; inp[1].dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('.dlg .dlg-f button')].pop().click(); await W(700); const rows = [...document.querySelectorAll('.board tbody tr')].map((r) => r.children[0].innerText); return { time: GA.time, first: rows[0], n: rows.length };`) });
  steps.push({ name: 'menu', js: race(`document.getElementById('moreBtn').click(); await W(400); return [...document.querySelectorAll('.menu-i')].map((i) => i.innerText.trim());`) });
  steps.push({ shot: 'light-menu.png' });
  steps.push({ name: 'menu-lang', js: race(`const yue = [...document.querySelectorAll('.menu-i')].find((i) => i.innerText.includes('廣東話')); yue.click(); await W(700); const t1 = document.querySelector('.rail-i.on .rail-l').innerText; GA.setLang('en'); await W(300); return { yue: t1, en: document.querySelector('.rail-i.on .rail-l').innerText };`) });
  steps.push({ name: 'sort-resize', js: race(`await go('#data/stops.txt', 900); const th = document.querySelectorAll('.vt-th .vt-sort'); th[2].click(); await W(300); const first = document.querySelector('.vt-r .vt-td:nth-child(3)').innerText; const rs = document.querySelector('.vt-rs'); const w0 = rs.parentElement.offsetWidth; rs.focus(); rs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await W(200); const w1 = document.querySelectorAll('.vt-th')[0].offsetWidth; return { sortedFirst: first, aria: document.querySelectorAll('.vt-th')[2].getAttribute('aria-sort'), w0, w1 };`) });
  steps.push({ name: 'gantt', js: race(`await go('#blocks', 900); const cv = document.querySelector('.gt-cv'); const r = cv.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), sliders: document.querySelectorAll('.sl').length, cvOK: cv.width > 0, blocks: document.querySelectorAll('.vl-w > *').length };`) });
  steps.push({ name: 'a11y', js: race(`await go('#routes', 800); const miss = [...document.querySelectorAll('button, [role=button], a, input')].filter((e) => !(e.getAttribute('aria-label') || e.innerText.trim() || e.title || e.getAttribute('aria-labelledby') || e.placeholder)).map((e) => e.outerHTML.slice(0, 80)); return { unlabelled: miss.slice(0, 8), n: miss.length };`) });
}
const file = path.join(dir, mode ? `gtfs-viewer.${mode}.steps.json` : 'gtfs-viewer.steps.json');
fs.writeFileSync(file, JSON.stringify(steps, null, 1) + '\n');
console.log('wrote', file, steps.length, 'steps');
