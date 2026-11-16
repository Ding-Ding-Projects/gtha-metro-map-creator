// Deploy app: publishes the map editor (a static website) to every kind of host in one click
// and shows the links. Targets: Docker here, a built-in server here, SSH, GitHub Pages, a folder or ZIP.
'use strict';
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, dialog, safeStorage, Tray, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const site = require('./lib/site');
const targets = { docker: require('./targets/docker'), builtin: require('./targets/builtin'), ssh: require('./targets/ssh'), pages: require('./targets/pages'), folder: require('./targets/folder') };

const CONTENT = path.join(__dirname, '..', 'content');
const SITE_DIR = path.join(CONTENT, 'site');
const COMPOSE = path.join(CONTENT, 'compose.yaml');
const IDS = Object.keys(targets);
const DEFAULT_SETTINGS = {
  docker: { port: 8080, tag: 'latest' },
  builtin: { port: 8090, keepRunning: false },
  ssh: { host: '', user: '', sshPort: 22, folder: '~/gtha-map', key: '', port: 8080, tag: 'latest' },
  pages: { repo: '' },
  folder: { mode: 'folder', path: '' }
};
// Hidden verification only (GMMC_HIDDEN=1): answer dialogs from environment variables.
const TEST = process.env.GMMC_HIDDEN === '1';

let win = null; let tray = null; let quitting = false;
const running = new Map(); // target id -> AbortController
const stateFile = () => path.join(app.getPath('userData'), 'deploy-state.json');
const tokenFile = () => path.join(app.getPath('userData'), 'github-token.bin');

function loadState() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { s = {}; }
  const settings = {};
  for (const id of IDS) settings[id] = Object.assign({}, DEFAULT_SETTINGS[id], (s.settings && s.settings[id]) || {});
  const ticked = {};
  for (const id of IDS) ticked[id] = s.ticked && id in s.ticked ? !!s.ticked[id] : id !== 'pages' && id !== 'ssh';
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
      out[id][k] = typeof def === 'number' ? (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : def) : typeof def === 'boolean' ? (typeof v === 'boolean' ? v : def) : (typeof v === 'string' ? v.slice(0, 300) : def);
    }
  }
  return out;
}

// ---- GitHub token: the CLI's token (in memory) or a pasted one kept by Windows through safeStorage ----
function storedToken() {
  try { if (!safeStorage.isEncryptionAvailable()) return null; return safeStorage.decryptString(fs.readFileSync(tokenFile())); } catch { return null; }
}
async function getToken() {
  const pages = targets.pages;
  return storedToken() || (await pages.cliToken());
}

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }
function readMap() {
  if (!state.mapFile) return null;
  try { return site.readMapFile(state.mapFile); } catch (e) { throw new Error(e.message + ' (' + path.basename(state.mapFile) + ')'); }
}

async function runTarget(id) {
  if (!IDS.includes(id)) return { ok: false, error: 'Unknown target' };
  if (running.has(id)) return { ok: false, error: 'Already running' };
  const ctl = new AbortController(); running.set(id, ctl);
  const status = (patch) => send('status', Object.assign({ id }, patch));
  status({ state: 'running', pct: 2, msg: 'Starting', links: [], error: '', note: '' });
  try {
    const mapText = readMap();
    const ctx = {
      settings: state.settings[id], siteDir: SITE_DIR, composeSrc: COMPOSE, userData: path.join(app.getPath('userData'), 'deploy'), mapText, signal: ctl.signal, getToken,
      emit: (pct, msg) => status({ state: 'running', pct, msg }),
      log: (line) => send('log', { id, line: String(line).slice(0, 400) })
    };
    const res = await targets[id].deploy(ctx);
    if (ctl.signal.aborted) throw new Error('Cancelled.');
    status({ state: 'live', pct: 100, msg: 'Live', links: res.links, note: res.note || '' });
    return { ok: true };
  } catch (e) {
    const msg = ctl.signal.aborted ? 'Cancelled.' : String((e && e.message) || e).slice(0, 600);
    send('log', { id, line: 'Failed: ' + msg });
    status({ state: 'failed', pct: 0, msg: '', error: msg });
    return { ok: false, error: msg };
  } finally { running.delete(id); }
}

ipcMain.handle('init', async () => {
  state = state || loadState();
  let mapName = ''; let mapError = '';
  if (state.mapFile) { try { site.readMapFile(state.mapFile); mapName = path.basename(state.mapFile); } catch (e) { mapError = e.message; } }
  return { state, version: app.getVersion(), mapName, mapError, siteReady: fs.existsSync(path.join(SITE_DIR, 'app', 'index.html')), builtinRunning: targets.builtin.isRunning(), encryption: safeStorage.isEncryptionAvailable() };
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
ipcMain.handle('clear-map', () => { state.mapFile = ''; saveState(state); return true; });
ipcMain.handle('deploy', (_e, id) => runTarget(id));
ipcMain.handle('cancel', (_e, id) => { const c = running.get(id); if (c) c.abort(); return true; });
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
ipcMain.handle('builtin-stop', async () => { await targets.builtin.stop(); send('status', { id: 'builtin', state: 'idle', pct: 0, msg: '', links: [], error: '', note: '' }); return true; });
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
  win = new BrowserWindow({
    width: 960, height: 760, minWidth: 720, minHeight: 560, show: false, backgroundColor: '#FEFBFF', title: 'GTHA Metro Map Creator Deploy',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  // GMMC_HIDDEN=1 keeps the window off screen for automated verification.
  win.once('ready-to-show', () => { if (!TEST) win.show(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (quitting) return;
    // "Keep running after closing" is honest: the window hides and a tray icon keeps the built-in server alive.
    if (targets.builtin.isRunning() && state.settings.builtin.keepRunning) { e.preventDefault(); makeTray(); win.hide(); return; }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('before-quit', () => { quitting = true; for (const c of running.values()) c.abort(); targets.builtin.stop(); });
app.on('window-all-closed', () => app.quit());
