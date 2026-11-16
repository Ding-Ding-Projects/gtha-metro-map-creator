// Usage: node scripts/verify/drive-deploy.mjs <deploy portable exe> <debug port> <work dir> [screenshot dir]
// Launches the built deploy app hidden with an isolated profile, ticks the folder and built-in server targets
// (and Docker when the engine runs), deploys, checks the real results and tears everything down.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const [exe, port, work, shots] = process.argv.slice(2);
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const out = path.join(work, 'site-out'); const userData = path.join(work, 'profile');
const map = path.join(work, 'plan.gmmc.json');
fs.writeFileSync(map, JSON.stringify({ version: 1, title: 'Deploy check map', stations: { a: { id: 'a', name: 'Alpha', x: 0, y: 0 }, b: { id: 'b', name: 'Beta', x: 4, y: 0 } }, lines: [], labels: [] }));
const child = spawn(exe, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env: { ...process.env, GMMC_HIDDEN: '1', GMMC_TEST_USERDATA: userData, GMMC_TEST_FOLDER: out, GMMC_TEST_MAP: map }, stdio: 'ignore' });
const kill = () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
const killer = setTimeout(() => { kill(); console.log('HARD TIMEOUT'); process.exit(3); }, 600000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 60 && !target; i++) { await sleep(1000); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.filter((x) => x.type === 'page'); if (p.length === 1) target = p[0]; } catch { /* starting */ } }
if (!target) { console.log('NO TARGET'); kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async (name) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); const r = await Promise.race([send('Page.captureScreenshot', { format: 'png', fromSurface: false }), sleep(15000).then(() => ({}))]); if (!r.result) { console.log('shot timed out', name); return; } fs.writeFileSync(path.join(shots, name), Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
const get = (url) => new Promise((resolve) => { http.get(url, { timeout: 4000 }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ code: res.statusCode, body: b })); }).on('error', () => resolve({ code: 0, body: '' })); });
const log = (n, v) => console.log(n + ':', typeof v === 'string' ? v : JSON.stringify(v));

await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 760, deviceScaleFactor: 1, mobile: false });
await sleep(800);
log('title', await js('document.querySelector(".dp-title").textContent'));
await shot('01-start.png');
log('choose map', await js('document.querySelector(".dp-chooseMap").click(); new Promise(r => setTimeout(() => r(document.querySelector(".dp-mapLine").textContent), 800))'));
// Tick only folder, builtin and docker; set the folder path through the test dialog hook.
log('setup', await js(`(async () => {
  const set = (id, on) => { const c = document.getElementById('dp-tick-' + id); if (c.checked !== on) c.click(); };
  set('docker', true); set('builtin', true); set('ssh', false); set('pages', false); set('folder', true);
  document.querySelector('[data-target=folder] details').open = true;
  document.querySelector('[data-target=folder] .dp-field button').click();
  await new Promise(r => setTimeout(r, 600));
  return document.querySelector('.dp-deployAll').textContent + ' | path=' + document.querySelector('[data-target=folder] .dp-field input[type=text]').value;
})()`));
log('deploy', await js('document.querySelector(".dp-deployAll").click(); "clicked"'));
let snap = null;
for (let i = 0; i < 120; i++) {
  await sleep(2000);
  snap = await js(`JSON.stringify(Array.from(document.querySelectorAll('.dp-card')).map(c => ({ id: c.dataset.target, chip: c.querySelector('.dp-chip').textContent, urls: Array.from(c.querySelectorAll('.dp-url')).map(u => u.textContent), err: c.querySelector('.dp-err').hidden ? '' : c.querySelector('.dp-err').textContent })))`);
  const rows = JSON.parse(snap);
  if (rows.filter((r) => ['docker', 'builtin', 'folder'].includes(r.id)).every((r) => /Live|Failed/.test(r.chip))) break;
}
const rows = JSON.parse(snap);
for (const r of rows) log('card ' + r.id, r);
await shot('02-after-deploy.png');
// Real checks of what the cards claim.
const folderOk = fs.existsSync(path.join(out, 'app', 'index.html')) && fs.existsSync(path.join(out, 'app', 'default-map.json'));
log('folder has app/index.html and default-map.json', folderOk);
log('default-map content', fs.existsSync(path.join(out, 'app', 'default-map.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'app', 'default-map.json'), 'utf8')).title : null);
for (const r of rows.filter((x) => x.id === 'builtin' || x.id === 'docker')) for (const u of r.urls) {
  const root = await get(u); const ed = await get(u + 'app/index.html'); const m = await get(u + 'app/default-map.json');
  log('GET ' + u, { root: root.code, editor: ed.code, editorIsEditor: /GTHA Metro Map Creator/.test(ed.body), defaultMap: m.code, mapTitle: m.code === 200 ? JSON.parse(m.body).title : null });
}
// Language switch and a failure path: SSH to a closed local port gives a clear reason quickly.
log('yue', await js('(() => { const s = document.querySelector(".dp-lang"); s.value = "yue"; s.dispatchEvent(new Event("change")); return document.querySelector(".dp-title").textContent; })()'));
await shot('03-cantonese.png');
await js('(() => { const s = document.querySelector(".dp-lang"); s.value = "en"; s.dispatchEvent(new Event("change")); })()');
const t0 = Date.now();
log('ssh unreachable', await js(`(async () => {
  const det = document.querySelector('[data-target=ssh] details'); det.open = true;
  const f = (label, v) => { const i = Array.from(det.querySelectorAll('label.dp-field')).find(l => l.textContent.startsWith(label)).querySelector('input'); i.value = v; i.dispatchEvent(new Event('change')); };
  f('Server name', '127.0.0.1'); f('User name', 'nobody'); f('SSH port', '1');
  document.getElementById('dp-tick-ssh').click();
  document.querySelector('[data-target=ssh] .actions') ;
  document.querySelector('.dp-deployAll').click();
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 1000)); const c = document.querySelector('[data-target=ssh]'); if (/Failed/.test(c.querySelector('.dp-chip').textContent)) return c.querySelector('.dp-err').textContent; }
  return 'timeout';
})()`));
log('ssh seconds', Math.round((Date.now() - t0) / 1000));
log('ssh bad host', await js(`(async () => {
  const det = document.querySelector('[data-target=ssh] details');
  const i = Array.from(det.querySelectorAll('label.dp-field')).find(l => l.textContent.startsWith('Server name')).querySelector('input'); i.value = 'a;calc'; i.dispatchEvent(new Event('change'));
  const retry = Array.from(document.querySelectorAll('[data-target=ssh] button')).find(b => b.textContent === 'Retry'); retry.click();
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 500)); const c = document.querySelector('[data-target=ssh]'); if (/Failed/.test(c.querySelector('.dp-chip').textContent) && /not allowed/.test(c.querySelector('.dp-err').textContent)) return c.querySelector('.dp-err').textContent; }
  return 'no validation error';
})()`));
log('pages without sign-in', await js(`(async () => {
  const det = document.querySelector('[data-target=pages] details'); det.open = true;
  document.getElementById('dp-tick-pages').click();
  const i = det.querySelector('input'); i.value = 'not a repo'; i.dispatchEvent(new Event('change'));
  document.querySelector('.dp-deployAll').click();
  await new Promise(r => setTimeout(r, 2500));
  const c = document.querySelector('[data-target=pages]');
  return c.querySelector('.dp-chip').textContent + ' | ' + c.querySelector('.dp-err').textContent + ' | signin: ' + c.querySelector('.actions').textContent.slice(0, 80);
})()`));
await shot('04-failures.png');
ws.close(); kill(); clearTimeout(killer); console.log('torn down');
