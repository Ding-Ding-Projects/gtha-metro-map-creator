// Usage: node scripts/verify/drive-wizard-signin.mjs <debug port> <screenshot dir>
// Needs a locally built image tagged ghcr.io/ding-ding-projects/gtha-metro-map-creator:t-signin
//   docker build -t ghcr.io/ding-ding-projects/gtha-metro-map-creator:t-signin .
// Runs the setup wizard (desktop/wizard/main.js, unpackaged) hidden, turns "Require a password" on, goes through all
// five steps against that local image and checks the result: the wizard reports "Live, password required", the
// editor sends visitors to the sign-in page, and the right password signs in. Stops the server with the wizard's own
// Stop button at the end.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const [port, shots] = process.argv.slice(2);
const repo = path.resolve(import.meta.dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = 'wizard-secret-4417';
const PORT = 18131;
let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) failures++; };
const req = (method, url, body) => new Promise((resolve) => {
  const r = http.request(url, { method, timeout: 5000, headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : {} }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, body: b })); });
  r.on('error', () => resolve({ code: 0, headers: {}, body: '' })); r.on('timeout', () => r.destroy()); if (body) r.write(body); r.end();
});
const userData = path.join(process.env.TEMP || '.', 'gmmc-wizard-profile-' + process.pid);
fs.rmSync(userData, { recursive: true, force: true });
const child = spawn(path.join(repo, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
  [path.join(repo, 'desktop', 'wizard', 'main.js'), `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${userData}`],
  { env: { ...process.env, GMMC_HIDDEN: '1', GMMC_TEST_NO_PULL: '1' }, stdio: 'ignore' });
const kill = () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
const killer = setTimeout(() => { kill(); console.log('HARD TIMEOUT'); process.exit(3); }, 400000);
let target = null;
for (let i = 0; i < 60 && !target; i++) { await sleep(1000); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.filter((x) => x.type === 'page'); if (p.length === 1) target = p[0]; } catch { /* not up yet */ } }
if (!target) { kill(); console.log('NO TARGET'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async (file) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); const r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), sleep(15000).then(() => ({}))]); if (r.result?.data) fs.writeFileSync(path.join(shots, file), Buffer.from(r.result.data, 'base64')); };
const waitFor = async (expr, ms = 120000) => { const t0 = Date.now(); for (;;) { const v = await js(expr); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(1000); } };
const setInput = (idv, value) => `(() => { const i = document.getElementById(${JSON.stringify(idv)}); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event('input', { bubbles: true })); return i.value; })()`;
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
  await waitFor(`document.getElementById('next') && !document.getElementById('next').disabled`);
  await js(`document.getElementById('next').click()`);
  await waitFor(`document.getElementById('port')`);
  await js(setInput('port', PORT)); await js(setInput('tag', 't-signin'));
  await waitFor(`/Port is free/.test(document.getElementById('portMsg').textContent)`);
  check('Next is enabled with sign-in off', (await js(`!document.getElementById('next').disabled`)) === true);
  await js(`document.getElementById('reqpw').click()`);
  await sleep(500);
  check('turning sign-in on shows the password field and blocks Next until a password is typed', (await js(`!document.getElementById('pwField').hidden && document.getElementById('next').disabled`)) === true);
  await js(setInput('pw', 'short')); await sleep(400);
  check('a short password keeps Next disabled', (await js(`document.getElementById('next').disabled`)) === true);
  await js(setInput('pw', PASSWORD)); await sleep(600);
  check('a valid password enables Next', (await js(`!document.getElementById('next').disabled`)) === true);
  await shot('wizard-signin-step.png');
  await js(`document.getElementById('next').click()`); // download (skipped for a local image)
  await waitFor(`/Image downloaded/.test(document.getElementById('pane').textContent)`);
  await js(`document.getElementById('next').click()`); // start
  const started = await waitFor(`/Health check passed|did not/.test(document.getElementById('pane').textContent) ? document.getElementById('pane').textContent : ''`, 180000);
  check('the server started and the wizard reports "Live, password required"', /Health check passed/.test(started || '') && /Live, password required/.test(started || ''), (started || '').slice(0, 200));
  await shot('wizard-signin-started.png');
  await js(`document.getElementById('next').click()`);
  await waitFor(`/Your map server is running/.test(document.getElementById('title').textContent)`);
  const finalText = await js(`document.getElementById('pane').textContent`);
  check('the last step repeats that a password is required', /Live, password required/.test(finalText || ''));
  await shot('wizard-signin-done.png');
  const base = 'http://127.0.0.1:' + PORT;
  const app = await req('GET', base + '/app/');
  check('/app/ redirects to the sign-in page', app.code === 302 && /\/signin/.test(app.headers.location || ''));
  check('/healthz is open', (await req('GET', base + '/healthz')).code === 200);
  const good = await req('POST', base + '/signin/login', 'password=' + encodeURIComponent(PASSWORD) + '&next=/app/');
  check('the password from the wizard signs in', good.code === 303 && /gmmc_session=/.test((good.headers['set-cookie'] || [])[0] || ''));
  const state = fs.existsSync(path.join(userData, 'wizard-state.json')) ? fs.readFileSync(path.join(userData, 'wizard-state.json'), 'utf8') : '';
  check('the wizard never saved the password', !state.includes(PASSWORD) && /"requirePassword":true/.test(state), state);
  await js(`document.querySelector('[data-act=stop]').click()`);
  await waitFor(`/stopped/i.test(document.getElementById('stopMsg').textContent)`, 90000);
  check('the wizard stopped the server', (await req('GET', base + '/healthz')).code === 0);
} finally { try { ws.close(); } catch { /* closed */ } kill(); clearTimeout(killer); }
console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
