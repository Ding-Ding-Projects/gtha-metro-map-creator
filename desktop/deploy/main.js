// Deploy app: publishes the map editor (a static website) to every kind of host in one click, shows
// the links, and manages the instances it created. Targets: Docker here, a built-in server here, a
// VirtualBox or VMware machine, SSH, a USB drive or a Raspberry Pi card, GitHub Pages, a folder or ZIP.
'use strict';
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, dialog, safeStorage, Tray, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const site = require('./lib/site');
const { Manager } = require('./lib/manager');
const { listDisks } = require('./lib/flash');
const usb = require('./targets/usb');
const { hashPasswordAsync } = require('../shared/password');
const targets = {
  docker: require('./targets/docker'), builtin: require('./targets/builtin'), virtualbox: require('./targets/virtualbox'), vmware: require('./targets/vmware'),
  ssh: require('./targets/ssh'), usb: usb.usb, rpi: usb.rpi, pages: require('./targets/pages'), folder: require('./targets/folder')
};

const APP_VERSION = require('../package.json').version; // not app.getVersion(): an unpackaged run would report Electron's own version
const CONTENT = path.join(__dirname, '..', 'content');
const SITE_DIR = path.join(CONTENT, 'site');
const IDS = Object.keys(targets);
const FLASH = ['usb', 'rpi'];
const DEFAULT_SETTINGS = {
  docker: { name: '', port: 8080, tag: 'latest', requirePassword: false },
  builtin: { name: '', port: 8090, keepRunning: false },
  virtualbox: { name: '', netMode: 'bridged', requirePassword: false },
  vmware: { name: '', requirePassword: false },
  ssh: { name: '', host: '', user: '', sshPort: 22, folder: '~/gtha-map', key: '', port: 8080, tag: 'latest', requirePassword: false },
  usb: { disk: -1 },
  rpi: { disk: -1, requirePassword: false },
  pages: { name: '', repo: '' },
  folder: { name: '', mode: 'folder', path: '' }
};
const DEFAULT_TICKED = { docker: true, builtin: true, folder: true };
// Hidden verification only (GMMC_HIDDEN=1): answer dialogs from environment variables.
const TEST = process.env.GMMC_HIDDEN === '1';

// Passwords typed in the settings live in memory only, per target. They are never saved; the manager hashes them at deploy time.
const secrets = {};
let win = null; let tray = null; let quitting = false; let manager = null;
const flashing = new Map(); // 'usb' or 'rpi' -> AbortController
const confirmed = new Map(); // 'usb' or 'rpi' -> the disk number the person confirmed
const stateFile = () => path.join(app.getPath('userData'), 'deploy-state.json');
const tokenFile = () => path.join(app.getPath('userData'), 'github-token.bin');

function loadState() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { s = {}; }
  const settings = cleanSettings(s.settings);
  const ticked = {};
  for (const id of IDS) ticked[id] = s.ticked && id in s.ticked ? !!s.ticked[id] : !!DEFAULT_TICKED[id];
  return { lang: ['en', 'yue', 'both'].includes(s.lang) ? s.lang : 'en', mapFile: typeof s.mapFile === 'string' ? s.mapFile : '', ticked, settings };
}
function saveState(s) {
  try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify({ lang: s.lang, mapFile: s.mapFile, ticked: s.ticked, settings: s.settings }, null, 2)); } catch { /* not fatal */ }
}
let state = null;
function cleanSettings(incoming) {
  // Only known fields of the right type are kept. Secrets are never part of this file.
  const out = {};
  for (const id of IDS) {
    out[id] = {};
    for (const [k, def] of Object.entries(DEFAULT_SETTINGS[id])) {
      const v = incoming && incoming[id] ? incoming[id][k] : undefined;
      out[id][k] = typeof def === 'number' ? (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : def) : typeof def === 'boolean' ? (typeof v === 'boolean' ? v : def) : (typeof v === 'string' ? v.slice(0, 300) : def);
    }
  }
  return out;
}

// ---- GitHub token: the CLI's token (in memory) or a pasted one kept by Windows through safeStorage ----
function storedToken() {
  try { if (!safeStorage.isEncryptionAvailable()) return null; return safeStorage.decryptString(fs.readFileSync(tokenFile())); } catch { return null; }
}
async function getToken() { return storedToken() || (await targets.pages.cliToken()); }

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }
function readMap() {
  if (!state.mapFile) return null;
  try { return { name: path.basename(state.mapFile), text: site.readMapFile(state.mapFile) }; } catch (e) { throw new Error(e.message + ' (' + path.basename(state.mapFile) + ')'); }
}

function makeManager() {
  manager = new Manager({ userData: path.join(app.getPath('userData'), 'deploy'), siteDir: SITE_DIR, appVersion: APP_VERSION, targets, send, getToken });
  // The registry lives in the same folder tree as every instance's files.
  return manager;
}

// Drive targets (USB, Raspberry Pi) are not instances: they write once and report the result.
async function runFlash(id, number) {
  if (flashing.has(id)) return { ok: false, error: 'Already running' };
  const ctl = new AbortController(); flashing.set(id, ctl);
  const status = (patch) => send('status', Object.assign({ id }, patch));
  status({ state: 'running', pct: 2, msg: 'Starting', links: [], error: '', note: '' });
  try {
    // A password for the Raspberry Pi is hashed here and only the hash goes on to the image; it is never saved.
    let passwordHash = '';
    if (id === 'rpi' && state && state.settings.rpi && state.settings.rpi.requirePassword) {
      if (!secrets.rpi) throw new Error('Enter a password, or turn off "Require a password".');
      passwordHash = await hashPasswordAsync(secrets.rpi);
    }
    const ctx = {
      passwordHash, settings: { disk: number }, confirmedDisk: confirmed.get(id), userData: path.join(app.getPath('userData'), 'deploy'), version: APP_VERSION, signal: ctl.signal,
      emit: (pct, msg) => status({ state: 'running', pct, msg }), log: (line) => send('log', { id, line: String(line).slice(0, 400) })
    };
    fs.mkdirSync(ctx.userData, { recursive: true });
    const res = await targets[id].deploy(ctx);
    if (ctl.signal.aborted) throw new Error('Cancelled.');
    status({ state: 'live', pct: 100, msg: 'Verified', links: res.links, note: res.note || '' });
    return { ok: true };
  } catch (e) {
    const msg = ctl.signal.aborted ? 'Cancelled.' : String((e && e.message) || e).slice(0, 600);
    send('log', { id, line: 'Failed: ' + msg });
    status({ state: 'failed', pct: 0, msg: '', error: msg });
    return { ok: false, error: msg };
  } finally { flashing.delete(id); confirmed.delete(id); }
}

ipcMain.handle('init', async () => {
  state = state || loadState();
  let mapName = ''; let mapError = '';
  if (state.mapFile) { try { site.readMapFile(state.mapFile); mapName = path.basename(state.mapFile); } catch (e) { mapError = e.message; } }
  return { state, version: APP_VERSION, mapName, mapError, siteReady: fs.existsSync(path.join(SITE_DIR, 'app', 'index.html')), builtinRunning: targets.builtin.isRunning(), encryption: safeStorage.isEncryptionAvailable(), instances: manager.list() };
});
ipcMain.handle('save-state', (_e, s) => {
  state = state || loadState();
  if (s && ['en', 'yue', 'both'].includes(s.lang)) state.lang = s.lang;
  if (s && s.ticked) for (const id of IDS) if (id in s.ticked) state.ticked[id] = !!s.ticked[id];
  if (s && s.settings) state.settings = cleanSettings(s.settings);
  saveState(state); return true;
});
ipcMain.handle('choose-map', async () => {
  state = state || loadState();
  let file = null;
  if (TEST && process.env.GMMC_TEST_MAP) file = process.env.GMMC_TEST_MAP;
  else { const r = await dialog.showOpenDialog(win, { title: 'Choose a map', properties: ['openFile'], filters: [{ name: 'Map file', extensions: ['json'] }] }); if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }; file = r.filePaths[0]; }
  try { site.readMapFile(file); } catch (e) { return { ok: false, error: e.message }; }
  state.mapFile = file; saveState(state);
  return { ok: true, name: path.basename(file) };
});
ipcMain.handle('set-secret', (_e, id, value) => { if (IDS.includes(id)) secrets[id] = typeof value === 'string' ? value.slice(0, 200) : ''; return true; });
ipcMain.handle('clear-map', () => { state.mapFile = ''; saveState(state); return true; });
ipcMain.handle('deploy', async (_e, id) => {
  if (!IDS.includes(id) || FLASH.includes(id)) return { ok: false, error: 'Unknown target' };
  let map = null;
  try { map = readMap(); } catch (e) { send('status', { id, state: 'failed', pct: 0, msg: '', error: e.message }); return { ok: false, error: e.message }; }
  return manager.deploy(id, Object.assign({}, state.settings[id], { password: secrets[id] || '' }), map);
});
ipcMain.handle('cancel', (_e, id) => { if (flashing.has(id)) flashing.get(id).abort(); else manager.cancelKind(id); return true; });
ipcMain.handle('list-disks', async () => { try { return { ok: true, disks: await listDisks() }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
// The person confirmed the exact drive in the erase-and-write dialog; the write itself starts here.
ipcMain.handle('flash', async (_e, id, number) => {
  if (!FLASH.includes(id) || !Number.isInteger(number) || number < 0) return { ok: false, error: 'Bad request' };
  confirmed.set(id, number);
  return runFlash(id, number);
});
ipcMain.handle('instances-list', () => manager.list());
ipcMain.handle('instances-check', async () => { await manager.checkAll(); return manager.list(); });
ipcMain.handle('instances-action', (_e, id, action) => manager.action(String(id), String(action)));
ipcMain.handle('instances-duplicate', (_e, id, name) => manager.duplicate(String(id), name, null));
ipcMain.handle('pick-path', async (_e, mode) => {
  if (TEST && process.env.GMMC_TEST_FOLDER) return { path: process.env.GMMC_TEST_FOLDER };
  if (mode === 'zip') {
    const r = await dialog.showSaveDialog(win, { title: 'Save the website as a ZIP file', defaultPath: 'gtha-map.zip', filters: [{ name: 'ZIP file', extensions: ['zip'] }] });
    return r.canceled ? { canceled: true } : { path: r.filePath };
  }
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the website', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? { canceled: true } : { path: r.filePaths[0] };
});
ipcMain.handle('open', (_e, url) => {
  const u = String(url);
  if (/^https?:\/\//i.test(u)) { shell.openExternal(u); return true; }
  if (path.isAbsolute(u) && fs.existsSync(u)) { if (fs.statSync(u).isDirectory()) shell.openPath(u); else shell.showItemInFolder(u); return true; }
  return false;
});
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text).slice(0, 4000)); return true; });
ipcMain.handle('gh-status', async () => {
  const pages = targets.pages; const out = { stored: false, cli: false, login: '' };
  const tok = storedToken();
  if (tok) { try { out.login = await pages.whoami(tok); out.stored = true; } catch { out.stored = true; out.login = ''; } }
  const cli = await pages.cliStatus();
  if (cli.available) { out.cli = true; if (!out.login) out.login = cli.login; }
  return out;
});
ipcMain.handle('gh-save-token', async (_e, token) => {
  const t = String(token || '').trim();
  if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) return { ok: false, error: 'That does not look like a GitHub token.' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Windows could not protect the token on this computer, so it was not saved.' };
  try { const login = await targets.pages.whoami(t); fs.mkdirSync(path.dirname(tokenFile()), { recursive: true }); fs.writeFileSync(tokenFile(), safeStorage.encryptString(t)); return { ok: true, login }; } catch (e) { return { ok: false, error: String(e.message) }; }
});
ipcMain.handle('gh-sign-out', () => { try { fs.rmSync(tokenFile(), { force: true }); } catch { /* gone */ } return true; });
ipcMain.handle('builtin-stop', async () => { await targets.builtin.stopAll(); send('status', { id: 'builtin', state: 'idle', pct: 0, msg: '', links: [], error: '', note: '' }); manager.changed(); return true; });
ipcMain.handle('quit', () => { quitting = true; app.quit(); });

function showWindow() { if (!win) return; win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
function makeTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  tray = new Tray(img.isEmpty() ? img : img.resize({ width: 16, height: 16 }));
  tray.setToolTip('GTHA Metro Map Creator Deploy: the built-in server is running');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open the deploy window', click: showWindow },
    { label: 'Stop the server and quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWindow);
}

if (TEST && process.env.GMMC_TEST_USERDATA) app.setPath('userData', process.env.GMMC_TEST_USERDATA);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  state = loadState();
  makeManager();
  win = new BrowserWindow({
    width: 1120, height: 820, minWidth: 380, minHeight: 560, show: false, backgroundColor: '#FEFBFF', title: 'GTHA Metro Map Creator Deploy',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: !TEST, offscreen: TEST }
  });
  // GMMC_HIDDEN=1 keeps the window off screen for automated verification.
  win.once('ready-to-show', () => { if (!TEST) win.show(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (quitting) return;
    // "Keep running after closing" is honest: the window hides and a tray icon keeps the built-in servers alive.
    if (targets.builtin.isRunning() && state.settings.builtin.keepRunning) { e.preventDefault(); makeTray(); win.hide(); return; }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('before-quit', () => { quitting = true; for (const c of flashing.values()) c.abort(); targets.builtin.stopAll(); });
app.on('window-all-closed', () => app.quit());
