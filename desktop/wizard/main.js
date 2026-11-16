// Server setup wizard: checks Docker, picks a port, downloads the published image,
// starts it with Docker Compose, waits for the health check and shows the network address.
'use strict';
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { IMAGE, portNum, tagOk, lanAddresses, get, portFree } = require('../shared/common');
let win = null;
let running = null;
const dataDir = () => path.join(app.getPath('userData'), 'server');
const stateFile = () => path.join(app.getPath('userData'), 'wizard-state.json');

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = spawn(cmd, args, { windowsHide: true, env: Object.assign({}, process.env, opts.env || {}) }); } catch (e) { resolve({ code: -1, out: String(e.message) }); return; }
    running = child;
    const onData = (d) => { const s = d.toString(); out += s; if (opts.stream && win) win.webContents.send('log', s); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('error', (e) => { running = null; resolve({ code: -1, out: out + String(e.message) }); });
    child.on('close', (code) => { running = null; resolve({ code, out }); });
  });
}
function composeEnv(port, tag) { return { GMMC_PORT: String(port), GMMC_TAG: tag }; }
function composeFile() {
  fs.mkdirSync(dataDir(), { recursive: true });
  const dest = path.join(dataDir(), 'compose.yaml');
  fs.writeFileSync(dest, fs.readFileSync(path.join(__dirname, '..', 'content', 'compose.yaml'), 'utf8'));
  return dest;
}
ipcMain.handle('check', async () => {
  const engine = await run('docker', ['version', '--format', '{{.Server.Version}}']);
  const compose = await run('docker', ['compose', 'version', '--short']);
  const cli = engine.code !== -1;
  return { cli, engine: engine.code === 0 ? engine.out.trim() : null, compose: compose.code === 0 ? compose.out.trim() : null };
});
ipcMain.handle('port-free', (_e, p) => portFree(p));
ipcMain.handle('existing', async () => {
  const r = await run('docker', ['ps', '--filter', 'label=com.docker.compose.project=gtha-metro-map-creator', '--format', '{{.Ports}}']);
  return r.code === 0 ? r.out.trim() : '';
});
ipcMain.handle('pull', async (_e, tag) => {
  if (!tagOk(tag)) return { ok: false, out: 'Invalid image tag' };
  const r = await run('docker', ['pull', `${IMAGE}:${tag}`], { stream: true });
  if (r.code !== 0) return { ok: false, out: r.out.slice(-2000) };
  const d = await run('docker', ['image', 'inspect', '--format', '{{index .RepoDigests 0}}', `${IMAGE}:${tag}`]);
  return { ok: true, digest: d.code === 0 ? d.out.trim() : '' };
});
ipcMain.handle('start', async (_e, port, tag) => {
  const n = portNum(port); if (!n || !tagOk(tag)) return { ok: false, out: 'Invalid port or tag' };
  const file = composeFile();
  const r = await run('docker', ['compose', '-f', file, 'up', '-d'], { stream: true, env: composeEnv(n, tag) });
  return { ok: r.code === 0, out: r.out.slice(-2000), file };
});
ipcMain.handle('health', async (_e, port) => {
  const n = portNum(port); const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if ((await get(`http://127.0.0.1:${n}/healthz`)) === 200) {
      const lans = lanAddresses();
      const reach = [];
      for (const ip of lans.slice(0, 3)) reach.push({ ip, ok: (await get(`http://${ip}:${n}/healthz`)) === 200 });
      return { ok: true, seconds: Math.round((Date.now() - t0) / 1000), reach };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: false };
});
ipcMain.handle('stop', async (_e, port, tag) => {
  const file = composeFile();
  const r = await run('docker', ['compose', '-f', file, 'down'], { stream: true, env: composeEnv(portNum(port) || 8080, tagOk(tag) ? tag : 'latest') });
  return { ok: r.code === 0 };
});
ipcMain.handle('cancel-run', () => { if (running) { try { running.kill(); } catch { /* already gone */ } } return true; });
ipcMain.handle('open', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text).slice(0, 300)); return true; });
ipcMain.handle('state-load', () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; } });
ipcMain.handle('state-save', (_e, s) => { try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch { /* not fatal */ } return true; });
ipcMain.handle('version', () => app.getVersion());
ipcMain.handle('quit', () => app.quit());

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 800, height: 600, minWidth: 560, minHeight: 480, show: false, backgroundColor: '#FFFFFF',
    title: 'GTHA Metro Map Creator Server Setup',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  // GMMC_HIDDEN=1 keeps the window off screen for automated verification.
  win.once('ready-to-show', () => { if (process.env.GMMC_HIDDEN !== '1') win.show(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => { if (running) { try { running.kill(); } catch { /* gone */ } } app.quit(); });
