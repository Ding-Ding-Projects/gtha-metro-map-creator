// Usage: node scripts/verify/drive-signin.mjs <debug port> <work dir> <screenshot dir>
// Needs a locally built image tagged ghcr.io/ding-ding-projects/gtha-metro-map-creator:t-signin
//   docker build -t ghcr.io/ding-ding-projects/gtha-metro-map-creator:t-signin .
// Launches the deploy app (desktop/deploy/main.js, unpackaged) hidden with an isolated profile and deploys one Docker
// instance with "Require a password" on. It checks the card status, that the editor sends visitors to the sign-in
// page, that the right password signs in, and that the plain password is nowhere on disk or in the container.
// Removes the one container and network it created, found by the instance label.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const [port, work, shots] = process.argv.slice(2);
const repo = path.resolve(import.meta.dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = 'plain-secret-9731';
const PORT = 18130;
let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) failures++; };
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8' }).trim();
const req = (method, url, body, headers = {}) => new Promise((resolve) => {
  const r = http.request(url, { method, timeout: 5000, headers: Object.assign(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}, headers) }, (res) => {
    let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, body: b }));
  });
  r.on('error', () => resolve({ code: 0, headers: {}, body: '' })); r.on('timeout', () => r.destroy()); if (body) r.write(body); r.end();
});

const userData = path.join(work, 'profile');
const child = spawn(path.join(repo, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
  [path.join(repo, 'desktop', 'deploy', 'main.js'), `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
  { env: { ...process.env, GMMC_HIDDEN: '1', GMMC_TEST_NO_PULL: '1', GMMC_TEST_USERDATA: userData }, stdio: 'ignore' });
const kill = () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
const killer = setTimeout(() => { kill(); console.log('HARD TIMEOUT'); process.exit(3); }, 600000);
let target = null;
for (let i = 0; i < 60 && !target; i++) { await sleep(1000); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.filter((x) => x.type === 'page'); if (p.length === 1) target = p[0]; } catch { /* not up yet */ } }
if (!target) { kill(); console.log('NO TARGET'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async (file) => { fs.mkdirSync(shots, { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(shots, file), Buffer.from(r.result.data, 'base64')); };
await send('Emulation.setDeviceMetricsOverride', { width: 1120, height: 820, deviceScaleFactor: 1, mobile: false }); await sleep(1500);

const field = (label) => `Array.from(document.querySelector('[data-target=docker]').querySelectorAll('.dp-tf')).find((x) => x.querySelector('.dp-tf-l').textContent.startsWith(${JSON.stringify(label)}))`;
const setField = (label, value) => `(() => { const c = document.querySelector('[data-target=docker]'); c.querySelector('details').open = true; const i = ${field(label)}.querySelector('input'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return i.value; })()`;
let instId = '';
try {
  for (const t of ['docker', 'builtin', 'virtualbox', 'vmware', 'ssh', 'usb', 'rpi', 'pages', 'folder']) await js(`(() => { const c = document.getElementById('dp-tick-${t}'); if (c.checked !== ${t === 'docker'}) c.click(); })()`);
  await js(setField('Instance name', 'Signin check')); await js(setField('Port', PORT)); await js(setField('Image version tag', 't-signin'));
  const pwHiddenAtStart = await js(`${field('Password')}.hidden`);
  check('the password field is hidden while "Require a password" is off', pwHiddenAtStart === true);
  await js(`(() => { const sw = Array.from(document.querySelectorAll('[data-target=docker] .dp-switch')).find((x) => x.textContent.startsWith('Require a password')); sw.querySelector('input').click(); })()`);
  await sleep(300);
  check('the password field appears when it is turned on', (await js(`${field('Password')}.hidden`)) === false);
  await js(setField('Password', PASSWORD));
  await shot('deploy-signin-settings.png');
  await js('document.querySelector(".dp-deployAll").click(); "clicked"');
  let chip = '';
  for (let i = 0; i < 120 && !/Live|Failed/.test(chip); i++) { await sleep(2000); chip = await js(`document.querySelector('[data-target=docker] .dp-chip').textContent`); }
  check('the card reports "Live, password required"', /Live, password required/.test(chip), chip);
  await shot('deploy-signin-live.png');

  const base = 'http://127.0.0.1:' + PORT;
  const h = await req('GET', base + '/healthz');
  check('/healthz is open', h.code === 200);
  const app = await req('GET', base + '/app/');
  check('/app/ without a session redirects to the sign-in page', app.code === 302 && /\/signin/.test(app.headers.location || ''), { code: app.code, location: app.headers.location });
  const page = await req('GET', base + '/signin');
  check('the link answers with the sign-in page', page.code === 200 && /needs a password/.test(page.body));
  const bad = await req('POST', base + '/signin/login', 'password=wrong&next=/app/');
  check('a wrong password is refused', bad.code === 303 && /error=1/.test(bad.headers.location || ''), bad.headers.location);
  const good = await req('POST', base + '/signin/login', 'password=' + encodeURIComponent(PASSWORD) + '&next=/app/');
  const cookie = ((good.headers['set-cookie'] || [])[0] || '');
  check('the right password signs in and sets a hardened cookie', good.code === 303 && /gmmc_session=/.test(cookie) && /HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie), cookie.replace(/=[^;]+/, '=<token>'));
  const inApp = await req('GET', base + '/app/', null, { cookie: cookie.split(';')[0] });
  check('with the session the editor opens', inApp.code === 200);

  // The password must not be anywhere it should not be.
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (fs.statSync(p).size < 5000000 && !/Cache|GPUCache|Code Cache|blob_storage|Local Storage|Session Storage|leveldb|DawnCache|Network|Crashpad|Shared/i.test(p)) files.push(p); } };
  walk(userData);
  const leaking = files.filter((f) => { try { return fs.readFileSync(f).includes(PASSWORD); } catch { return false; } });
  check('the plain password is not in any file the app wrote', leaking.length === 0, leaking);
  const reg = JSON.parse(fs.readFileSync(path.join(userData, 'deploy', 'instances.json'), 'utf8')).instances[0];
  check('the registry keeps only a pbkdf2 hash', /^pbkdf2-sha256:\d+:/.test(reg.passwordHash || ''), (reg.passwordHash || '').slice(0, 24));
  instId = reg.id;
  const ids = docker('ps', '-aq', '--filter', 'label=io.github.dingdingprojects.gmmc.instance=' + instId).split(/\s+/).filter(Boolean);
  check('exactly one container belongs to the instance', ids.length === 1, ids);
  const env = docker('inspect', '-f', '{{json .Config.Env}}', ids[0]);
  check('the container environment holds the hash, not the password', /GMMC_PASSWORD_HASH=pbkdf2-sha256/.test(env) && !env.includes(PASSWORD));
  const logs = docker('logs', ids[0]) + execFileSync('docker', ['logs', ids[0]], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  check('the container log has neither password nor hash', !logs.includes(PASSWORD) && !/pbkdf2-sha256:\d+/.test(logs));
  const rows = await js(`(document.getElementById('dp-tab-instances').click(), new Promise((r) => setTimeout(r, 2500)).then(() => document.body.innerHTML.includes('pbkdf2')))`);
  check('the window never receives the hash', rows === false);
  await shot('deploy-signin-instances.png');
} finally {
  try {
    if (instId) {
      const ids = docker('ps', '-aq', '--filter', 'label=io.github.dingdingprojects.gmmc.instance=' + instId).split(/\s+/).filter(Boolean);
      if (ids.length) docker('rm', '-f', ...ids);
      const nets = docker('network', 'ls', '-q', '--filter', 'label=io.github.dingdingprojects.gmmc.instance=' + instId).split(/\s+/).filter(Boolean);
      if (nets.length) docker('network', 'rm', ...nets);
    }
  } catch (e) { console.log('cleanup problem', e.message); }
  try { ws.close(); } catch { /* closed */ }
  kill(); clearTimeout(killer);
}
console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
