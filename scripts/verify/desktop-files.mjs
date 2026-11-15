// Usage: node scripts/verify/desktop-files.mjs <desktop portable exe> <work folder>
// Verifies the desktop app's real File menu: save as, recent maps, open, and the unsaved-changes
// prompt. Runs hidden (GMMC_HIDDEN=1) with dialog answers from environment variables and an
// isolated user data folder, drives the main process over a loopback inspector, then ends it.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [exe, work] = process.argv.slice(2);
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const saveTo = path.join(work, 'saved-map.json');
const openFrom = path.join(work, 'open-me.json');
fs.writeFileSync(openFrom, JSON.stringify({ version: 1, title: 'Opened from disk', stations: { a: { name: 'Alpha', x: 0, y: 0 }, b: { name: 'Beta', x: 4, y: 0 } }, lines: [{ id: 'x', name: 'X', color: '#FF0000', path: ['a', 'b'] }], labels: [] }));
const env = { ...process.env, GMMC_HIDDEN: '1', GMMC_TEST_SAVE: saveTo, GMMC_TEST_OPEN: openFrom, GMMC_TEST_CONFIRM: '2,1', GMMC_TEST_USERDATA: path.join(work, 'userdata') };
const child = spawn(exe, ['--inspect=127.0.0.1:9350'], { env, stdio: 'ignore' });
const kill = () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
const killer = setTimeout(() => { kill(); console.log('HARD TIMEOUT'); process.exit(3); }, 180000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let url = null;
for (let i = 0; i < 60 && !url; i++) { await sleep(1000); try { const l = await (await fetch('http://127.0.0.1:9350/json/list')).json(); if (l[0]) url = l[0].webSocketDebuggerUrl; } catch {} }
if (!url) { kill(); console.log('NO INSPECTOR'); process.exit(1); }
const ws = new WebSocket(url); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const ev = (expression) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } })); })
  .then((m) => m.result?.result?.value ?? m.result?.exceptionDetails?.exception?.description ?? JSON.stringify(m.error));
await sleep(4000);
const E = "process.mainModule.require('electron')";
const item = (label) => `${E}.Menu.getApplicationMenu().items[0].submenu.items.find((i) => i.label === ${JSON.stringify(label)})`;
const pageJs = (js) => `${E}.BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(${JSON.stringify(js)})`;
const results = {};
results.menu = await ev(`${E}.Menu.getApplicationMenu().items.map((m) => m.label).join(',')`);
results.saveAs = await ev(`(${item('Save as...')}.click(), new Promise((r) => setTimeout(() => r(global.__gmmcTest.state()), 1500)))`);
results.savedFile = fs.existsSync(saveTo) ? JSON.parse(fs.readFileSync(saveTo, 'utf8')).title + ', ' + Object.keys(JSON.parse(fs.readFileSync(saveTo, 'utf8')).stations).length + ' stations' : 'missing';
results.recentMenu = await ev(`${item('Open recent')}.submenu.items.map((i) => i.label).filter((l) => l.endsWith('.json'))`);
results.open = await ev(`(${item('Open map...')}.click(), new Promise((r) => setTimeout(() => r(global.__gmmcTest.state().currentFile), 1500)))`);
results.openedTitle = await ev(pageJs('GMMC.getMap().title'));
results.edit = await ev(pageJs("(GMMC.getMap().title = 'Edited after open', true)"));
results.dirty = await ev('global.__gmmcTest.isDirty()');
results.newCancel = await ev(`(${item('New blank map')}.click(), new Promise((r) => setTimeout(r, 1500))).then(() => ${pageJs('GMMC.getMap().title')})`);
results.newDiscard = await ev(`(${item('New blank map')}.click(), new Promise((r) => setTimeout(r, 1500))).then(() => ${pageJs('Object.keys(GMMC.getMap().stations).length + " stations, " + GMMC.getMap().title')})`);
results.title = await ev(`${E}.BrowserWindow.getAllWindows()[0].getTitle()`);
console.log(JSON.stringify(results, null, 1));
ws.close(); kill(); clearTimeout(killer); console.log('torn down', child.pid);
