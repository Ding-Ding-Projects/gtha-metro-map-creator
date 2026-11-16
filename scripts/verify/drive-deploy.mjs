// Usage: node scripts/verify/drive-deploy.mjs <exe or "electron"> <debug port> <work dir> [screenshot dir]
//   "electron" runs the unpackaged app (desktop/deploy/main.js) with desktop/node_modules/electron.
// Launches the deploy app hidden with an isolated profile and checks the real results:
//   run 1  cards, two Docker instances, the instance manager (stop, start, logs, update, remove dialog, remove),
//          a foreign container that must never be listed or touched, the built-in server, the folder target,
//          English and Cantonese, a narrow window
//   run 2  writing the appliance image to a FILE standing in for a drive (never a real disk): download from a
//          local fake release, SHA-256 check, xz unpack, write, read back, plus cancelled and failed elevation
//   run 3  the real drive list on this machine (read only), proving the Windows disk is never offered
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const [exeArg, port0, work, shots] = process.argv.slice(2);
const repo = path.resolve(import.meta.dirname, '..', '..');
const electronExe = path.join(repo, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (n, v) => console.log(n + ':', typeof v === 'string' ? v : JSON.stringify(v));
let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) failures++; };
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const get = (url) => new Promise((resolve) => { http.get(url, { timeout: 4000 }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ code: res.statusCode, body: b })); }).on('error', () => resolve({ code: 0, body: '' })); });
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8' }).trim();

async function launch(name, env, size = [1120, 820]) {
  const port = Number(port0) + launch.n++;
  const userData = path.join(work, 'profile-' + name);
  const args = [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'];
  const exe = exeArg === 'electron' ? electronExe : exeArg;
  const full = exeArg === 'electron' ? [path.join(repo, 'desktop', 'deploy', 'main.js')].concat(args) : args;
  const child = spawn(exe, full, { env: { ...process.env, GMMC_HIDDEN: '1', GMMC_TEST_USERDATA: userData, ...env }, stdio: 'ignore' });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };
  let target = null;
  for (let i = 0; i < 60 && !target; i++) { await sleep(1000); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.filter((x) => x.type === 'page'); if (p.length === 1) target = p[0]; } catch { /* starting */ } }
  if (!target) { kill(); throw new Error('NO TARGET'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
  const shot = async (file) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); const r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), sleep(15000).then(() => ({}))]); if (!r.result) { console.log('shot timed out', file); return; } fs.writeFileSync(path.join(shots, file), Buffer.from(r.result.data, 'base64')); console.log('shot', file); };
  const resize = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await sleep(600); };
  await resize(size[0], size[1]); await sleep(1500);
  return { js, shot, size: resize, userData, close: () => { try { ws.close(); } catch { /* closed */ } kill(); } };
}
launch.n = 0;
const waitFor = async (app, expr, ms = 120000, step = 1500) => { const t0 = Date.now(); for (;;) { const v = await app.js(expr); if (v && v !== 'false') return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
const killer = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 1500000);

const setField = (card, label, value) => `(() => { const c = document.querySelector('[data-target=${card}]'); c.querySelector('details').open = true; const f = Array.from(c.querySelectorAll('.dp-tf')).find((x) => x.querySelector('.dp-tf-l').textContent.startsWith(${JSON.stringify(label)})); const i = f.querySelector('input'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event('change')); return i.value; })()`;
const tick = (id, on) => `(() => { const c = document.getElementById('dp-tick-${id}'); if (c.checked !== ${on}) c.click(); return c.checked; })()`;
const rowOf = (name) => `Array.from(document.querySelectorAll('.dp-irow')).find((x) => x.querySelector('.dp-iname span').textContent === ${JSON.stringify(name)})`;
const clickRowAction = (name, title) => `(() => { const r = ${rowOf(name)}; const b = Array.from(r.querySelectorAll('.dp-ib')).find((x) => x.title === ${JSON.stringify(title)}); b.click(); return !!b; })()`;
const clickMenu = (name, label) => `(async () => { const r = ${rowOf(name)}; r.querySelector('.dp-ib[aria-haspopup]').click(); await new Promise(r2 => setTimeout(r2, 200)); const b = Array.from(r.querySelectorAll('.dp-menu-i')).find((x) => x.textContent === ${JSON.stringify(label)}); if (!b || b.disabled) return 'missing or disabled'; b.click(); return 'ok'; })()`;
const modalBtn = (label) => `(Array.from(document.querySelectorAll('.dp-modal[open] .dp-btn')).find((b) => b.textContent === ${JSON.stringify(label)}) || { click() { throw new Error('no ${label} button'); } }).click()`;

// A foreign container that the app must never list, stop or remove.
const foreign = 'gmmc-foreign-nginx-' + process.pid;
let foreignId = '';
try { docker('run', '-d', '--name', foreign, 'nginx:alpine'); foreignId = docker('ps', '-aq', '--filter', 'name=^' + foreign + '$'); } catch (e) { console.log('no docker for the foreign container check', e.message); }
const foreignRunning = () => !foreignId || docker('inspect', '-f', '{{.State.Running}}', foreignId) === 'true';

try {
  // ------------------------------------------------------------------ run 1
  if (process.env.SKIP_RUN1 !== '1') {
  const map = path.join(work, 'plan.gmmc.json');
  fs.writeFileSync(map, JSON.stringify({ version: 1, title: 'Deploy check map', stations: { a: { id: 'a', name: 'Alpha', x: 0, y: 0 }, b: { id: 'b', name: 'Beta', x: 4, y: 0 } }, lines: [], labels: [] }));
  const out = path.join(work, 'site-out');
  const app = await launch('main', { GMMC_TEST_FOLDER: out, GMMC_TEST_MAP: map, GMMC_LATEST_VERSION: '1.5.0' });
  log('title', await app.js('document.querySelector(".dp-title").textContent'));
  check('nine targets', (await app.js('document.querySelectorAll(".dp-card").length')) === 9);
  check('five filter chips', (await app.js('document.querySelectorAll(".dp-groups .dp-fchip").length')) === 5);
  await app.shot('d01-deploy.png');
  await app.js('document.querySelector(".dp-chooseMap").click(); new Promise(r => setTimeout(r, 800))');
  for (const id of ['docker', 'builtin', 'virtualbox', 'vmware', 'ssh', 'usb', 'rpi', 'pages', 'folder']) await app.js(tick(id, id === 'docker'));
  await app.js(setField('docker', 'Instance name', 'Alpha')); await app.js(setField('docker', 'Port', 18120)); await app.js(setField('docker', 'Image version tag', '1.4.0'));
  await app.js('document.querySelector(".dp-deployAll").click(); "clicked"');
  const alphaDone = await waitFor(app, `(() => { const c = document.querySelector('[data-target=docker] .dp-chip'); return /Live|Failed/.test(c.textContent) ? c.textContent : ''; })()`, 240000);
  check('Alpha deployed', /Live/.test(alphaDone || ''), alphaDone);
  await app.shot('d02-alpha-live.png');
  await app.js(setField('docker', 'Instance name', 'Bravo')); await app.js(setField('docker', 'Port', 18120)); await app.js(setField('docker', 'Image version tag', 'latest'));
  await app.js('document.querySelector(".dp-deployAll").click(); "clicked"');
  await sleep(1500);
  const bravoDone = await waitFor(app, `(() => { const c = document.querySelector('[data-target=docker] .dp-chip'); return /Live|Failed/.test(c.textContent) ? c.textContent : ''; })()`, 240000);
  check('Bravo deployed on another port', /Live/.test(bravoDone || ''), bravoDone);
  // the instance manager
  await app.js('document.getElementById("dp-tab-instances").click(); new Promise(r => setTimeout(r, 2500))');
  const rows = JSON.parse(await app.js(`JSON.stringify(Array.from(document.querySelectorAll('.dp-irow')).map((r) => ({ name: r.querySelector('.dp-iname span').textContent, where: r.querySelector('.dp-iwhere').textContent, version: r.querySelector('.dp-iver').textContent, health: r.querySelector('.dp-ihealth').textContent, link: r.querySelector('.dp-ilink').textContent })))`));
  log('instance rows', rows);
  const A = rows.find((r) => r.name === 'Alpha'); const B = rows.find((r) => r.name === 'Bravo');
  check('both instances listed with their own link and port', !!A && !!B && A.link !== B.link && /:18120\//.test(A.link) && /:1812\d\//.test(B.link) && !/:18120\//.test(B.link), { a: A && A.link, b: B && B.link });
  check('health shows the time of the last check', rows.every((r) => /checked/.test(r.health)), rows.map((r) => r.health));
  check('Alpha shows its real version and an update', A && A.version === '1.4.0' && /Update available/.test(A.health), A);
  check('the foreign container is not listed', !rows.some((r) => /foreign|nginx/i.test(r.name + r.where)));
  check('both links answer', (await get(A.link + 'healthz')).code === 200 && (await get(B.link + 'healthz')).code === 200);
  await app.shot('d03-instances.png');
  // stop Alpha
  await app.js(clickRowAction('Alpha', 'Stop'));
  await waitFor(app, `(() => { const r = ${rowOf('Alpha')}; return /Stopped/.test(r.querySelector('.dp-ihealth').textContent) ? 'y' : ''; })()`, 60000);
  check('Alpha stopped, Bravo still answers, foreign still running', (await get(A.link + 'healthz')).code === 0 && (await get(B.link + 'healthz')).code === 200 && foreignRunning());
  await app.shot('d04-alpha-stopped.png');
  await app.js(clickRowAction('Alpha', 'Start'));
  await waitFor(app, `(() => { const r = ${rowOf('Alpha')}; return /Healthy|Update available/.test(r.querySelector('.dp-ihealth').textContent) && !r.classList.contains('busy') ? 'y' : ''; })()`, 90000);
  check('Alpha started again', (await get(A.link + 'healthz')).code === 200);
  // logs
  log('open logs', await app.js(clickMenu('Alpha', 'View logs')));
  await sleep(1500);
  const logText = await app.js('document.querySelector(".dp-logtext").textContent');
  check('logs dialog shows the container log', /nginx|worker process/.test(logText || ''), (logText || '').slice(-120));
  await app.shot('d05-logs.png');
  await app.js(modalBtn('Close'));
  // update Alpha
  log('update', await app.js(clickMenu('Alpha', 'Update')));
  await waitFor(app, `(() => { const r = ${rowOf('Alpha')}; return !r.classList.contains('busy') && !/Update available/.test(r.querySelector('.dp-ihealth').textContent) && /1\\.5\\.0/.test(r.querySelector('.dp-iver').textContent) ? 'y' : ''; })()`, 240000);
  check('Alpha updated to 1.5.0 and still answers on its port', (await get(A.link + 'healthz')).code === 200 && (await app.js(`${rowOf('Alpha')}.querySelector('.dp-iver').textContent`)) === '1.5.0');
  // search and filter
  await app.js(`(() => { const s = document.querySelector('.dp-search input'); s.value = 'brav'; s.dispatchEvent(new Event('input')); })()`);
  check('search narrows the list', (await app.js('document.querySelectorAll(".dp-irow").length')) === 1);
  await app.js(`(() => { const s = document.querySelector('.dp-search input'); s.value = ''; s.dispatchEvent(new Event('input')); Array.from(document.querySelectorAll('#dp-pane-instances .dp-fchip')).find((b) => /^Stopped/.test(b.textContent)).click(); })()`);
  check('Stopped filter shows nothing now', (await app.js('document.querySelectorAll(".dp-irow").length')) === 0);
  await app.js(`Array.from(document.querySelectorAll('#dp-pane-instances .dp-fchip')).find((b) => /^All/.test(b.textContent)).click()`);
  // remove Bravo through the confirmation dialog
  log('open remove', await app.js(clickMenu('Bravo', 'Remove…')));
  await sleep(500);
  const dlgText = await app.js('(() => { const d = document.querySelector(".dp-modal[open]"); return d ? d.textContent : ""; })()');
  check('remove dialog names the exact instance and lists what is deleted', /“Bravo”/.test(dlgText) && /container gmmc-bravo/.test(dlgText) && /compose file/.test(dlgText), dlgText.slice(0, 300));
  await app.shot('d06-remove.png');
  await app.js(modalBtn('Remove'));
  await waitFor(app, `document.querySelectorAll('.dp-irow').length === 1 ? 'y' : ''`, 60000);
  check('Bravo removed, Alpha survives', (await get(B.link + 'healthz')).code === 0 && (await get(A.link + 'healthz')).code === 200 && (await app.js('document.querySelectorAll(".dp-irow").length')) === 1);
  check('Bravo containers are gone, foreign container untouched', docker('ps', '-aq', '--filter', 'label=io.github.dingdingprojects.gmmc.instance').split(/\s+/).filter(Boolean).length === 1 && foreignRunning());
  // built-in server instance and folder, English and Cantonese, narrow window
  await app.js('document.getElementById("dp-tab-deploy").click()');
  await app.js(tick('docker', false)); await app.js(tick('builtin', true)); await app.js(tick('folder', true));
  await app.js(setField('builtin', 'Instance name', 'Local')); await app.js(setField('builtin', 'Port', 18130));
  await app.js(setField('folder', 'Instance name', 'Site copy'));
  await app.js('document.querySelector("[data-target=folder] details").open = true; Array.from(document.querySelectorAll("[data-target=folder] .dp-btn")).find((b) => b.textContent === "Browse").click(); new Promise(r => setTimeout(r, 600))');
  await app.js('document.querySelector(".dp-deployAll").click(); "clicked"');
  const done2 = await waitFor(app, `(() => ['builtin', 'folder'].map((id) => document.querySelector('[data-target=' + id + '] .dp-chip').textContent).every((x) => /Live|Failed/.test(x)) ? 'y' : '')()`, 120000);
  const cards = JSON.parse(await app.js(`JSON.stringify(['builtin', 'folder'].map((id) => { const c = document.querySelector('[data-target=' + id + ']'); return { id, chip: c.querySelector('.dp-chip').textContent, urls: Array.from(c.querySelectorAll('.dp-url')).map((u) => u.textContent), err: c.querySelector('.dp-err').hidden ? '' : c.querySelector('.dp-err').textContent }; }))`));
  log('cards', cards);
  check('built-in server and folder are live', !!done2 && cards.every((c) => /Live/.test(c.chip)), cards);
  const bu = cards[0].urls[0];
  check('built-in server serves the editor and its map', (await get(bu + 'app/index.html')).code === 200 && JSON.parse((await get(bu + 'app/default-map.json')).body).title === 'Deploy check map');
  check('folder has app/index.html and the map', fs.existsSync(path.join(out, 'app', 'index.html')) && fs.existsSync(path.join(out, 'app', 'default-map.json')));
  await app.shot('d07-more-live.png');
  log('yue', await app.js('(() => { const s = document.querySelector(".dp-lang"); s.value = "yue"; s.dispatchEvent(new Event("change")); return document.querySelector(".dp-title").textContent + " | " + document.querySelector(".dp-deployAll").textContent + " | " + document.getElementById("dp-tab-instances").textContent; })()'));
  await app.shot('d08-cantonese.png');
  await app.js('document.getElementById("dp-tab-instances").click(); new Promise(r => setTimeout(r, 800))'); await app.shot('d09-instances-yue.png');
  await app.js('(() => { const s = document.querySelector(".dp-lang"); s.value = "en"; s.dispatchEvent(new Event("change")); document.getElementById("dp-tab-deploy").click(); })()');
  await app.size(390, 800);
  const o = JSON.parse(await app.js('JSON.stringify({ vw: innerWidth, docW: document.documentElement.scrollWidth, cards: document.querySelector(".dp-cards").scrollWidth, cardsClient: document.querySelector(".dp-cards").clientWidth, cols: getComputedStyle(document.querySelector(".dp-cards")).gridTemplateColumns })'));
  check('390 px: no sideways scroll and one column', o.docW <= o.vw && o.cards <= o.cardsClient && o.cols.split(' ').length === 1, o);
  await app.shot('d10-narrow-deploy.png');
  await app.js('document.getElementById("dp-tab-instances").click(); new Promise(r => setTimeout(r, 800))'); await app.shot('d11-narrow-instances.png');
  const o2 = JSON.parse(await app.js('JSON.stringify({ vw: innerWidth, docW: document.documentElement.scrollWidth, table: document.querySelector(".dp-table").scrollWidth, tableClient: document.querySelector(".dp-table").clientWidth })'));
  check('390 px instance list: no sideways scroll', o2.docW <= o2.vw && o2.table <= o2.tableClient, o2);
  await app.size(1120, 820);
  // clean up: remove every instance this run created
  for (const name of ['Alpha', 'Local']) { await app.js(clickMenu(name, 'Remove…')); await sleep(400); await app.js(modalBtn('Remove')); await sleep(3000); }
  check('Docker and built-in instances of this run removed', docker('ps', '-aq', '--filter', 'label=io.github.dingdingprojects.gmmc.instance') === '');
  app.close();
  await sleep(1500);

  }
  // ------------------------------------------------------------------ run 2: image write to a FILE standing in for a drive
  const rel = path.join(work, 'release'); fs.mkdirSync(rel, { recursive: true });
  const version = JSON.parse(fs.readFileSync(path.join(repo, 'desktop', 'package.json'), 'utf8')).version;
  const raw = crypto.randomBytes(24 * 1024 * 1024 + 123);
  const rawFile = path.join(rel, 'gtha-metro-map-creator-appliance-' + version + '-x86_64.img'); fs.writeFileSync(rawFile, raw);
  docker('run', '--rm', '-v', rel.replace(/\\/g, '/') + ':/w', 'alpine:3.22', 'sh', '-c', 'apk add -q xz >/dev/null && xz -k -6 /w/*.img');
  fs.rmSync(rawFile);
  const xz = rawFile + '.xz'; const xzHash = crypto.createHash('sha256').update(fs.readFileSync(xz)).digest('hex');
  fs.writeFileSync(path.join(rel, 'SHA256SUMS.txt'), xzHash + '  ' + path.basename(xz) + '\n');
  const srv = http.createServer((req, res) => { const f = path.join(rel, decodeURIComponent(req.url.slice(1))); if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'Content-Length': fs.statSync(f).size }); fs.createReadStream(f).pipe(res); } else { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const target = path.join(work, 'fake-drive.bin');
  const runFlash = async (name, env, expect) => {
    const f = await launch(name, { GMMC_RELEASE_BASE: base, GMMC_TEST_FLASH_FILE: target, ...env });
    for (const other of ['docker', 'builtin', 'folder']) await f.js(tick(other, false)); // only the drive is deployed in these runs
    await f.js(tick('usb', true));
    const disks = await waitFor(f, `(() => { const r = document.querySelectorAll('[data-target=usb] .dp-drive'); return r.length ? r[0].textContent : ''; })()`, 20000);
    check(name + ': the drive list offers only the test file and selects nothing', /Test image file/.test(disks || '') && (await f.js(`document.querySelectorAll('[data-target=usb] .dp-drive input:checked').length`)) === 0, disks);
    await f.js(`document.querySelector('[data-target=usb] .dp-drive input').click(); "picked"`);
    await f.js(`document.querySelector('.dp-deployAll').click(); new Promise(r => setTimeout(r, 800))`);
    const dlg = await f.js(`(() => { const d = document.querySelector('.dp-modal[open]'); return d ? JSON.stringify({ title: d.querySelector('.dp-modal-t').textContent, text: d.textContent, goDisabled: document.getElementById('dp-flash-go').disabled }) : ''; })()`);
    check(name + ': the confirm dialog names the drive and blocks the write until ticked', /Erase this drive/.test(dlg) && /Disk 99/.test(dlg) && JSON.parse(dlg).goDisabled === true, dlg.slice(0, 260));
    if (name === 'ok') await f.shot('f01-confirm.png');
    await f.js(`document.getElementById('dp-flash-understand').click(); document.getElementById('dp-flash-go').click(); "go"`);
    const res = await waitFor(f, `(() => { const c = document.querySelector('[data-target=usb] .dp-chip').textContent; return /Verified|Failed/.test(c) ? c + ' | ' + document.querySelector('[data-target=usb] .dp-err').textContent + ' | ' + document.querySelector('[data-target=usb] .dp-note').textContent : ''; })()`, 240000);
    check(name + ': result', expect(res || ''), res);
    await f.shot(name === 'ok' ? 'f02-verified.png' : 'f03-' + name + '.png');
    f.close(); await sleep(1500);
    return res;
  };
  await runFlash('ok', {}, (r) => /Verified/.test(r) && /Written and read back/.test(r));
  check('the image file was written and reads back identical', fs.existsSync(target) && crypto.createHash('sha256').update(fs.readFileSync(target).subarray(0, raw.length)).digest('hex') === crypto.createHash('sha256').update(raw).digest('hex'));
  fs.rmSync(target, { force: true });
  await runFlash('cancelled', { GMMC_TEST_ELEVATION: 'cancel' }, (r) => /Failed/.test(r) && /did not get permission/.test(r) && !/Written and read back/.test(r));
  check('cancelled elevation wrote nothing', !fs.existsSync(target));
  await runFlash('failed', { GMMC_TEST_ELEVATION: 'fail' }, (r) => /Failed/.test(r) && /could not be started/.test(r));
  srv.close();

  // ------------------------------------------------------------------ run 3: the real drive list (read only)
  const real = await launch('real', {});
  await real.js(tick('usb', true));
  await sleep(6000);
  const driveText = await real.js(`document.querySelector('[data-target=usb] .dp-drives').textContent`);
  log('real drive list on this computer', driveText);
  const sys = execFileSync('powershell.exe', ['-NoProfile', '-Command', "(Get-Disk | Where-Object { $_.IsSystem -or $_.IsBoot } | ForEach-Object { $_.FriendlyName }) -join '|'"], { encoding: 'utf8' }).trim();
  check('the Windows disk is never offered', !sys.split('|').filter(Boolean).some((n) => driveText.includes(n)), { windowsDisks: sys });
  check('no drive is preselected', (await real.js(`document.querySelectorAll('[data-target=usb] .dp-drive input:checked').length`)) === 0);
  await real.shot('r01-real-drives.png');
  real.close();
} catch (e) { console.log('ERROR', (e && e.stack) || e); failures++; } finally {
  try { if (foreignId) docker('rm', '-f', foreign); } catch { /* ignore */ }
  clearTimeout(killer);
}
console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
