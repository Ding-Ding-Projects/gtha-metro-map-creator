// Desktop app: the full editor, project site and documentation, bundled offline,
// with native file open and save, recent maps and an unsaved-changes prompt.
'use strict';
const { app, BrowserWindow, Menu, dialog, protocol, shell, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'gmmc';
const CONTENT = path.join(__dirname, '..', 'content', 'site');
const MAX_FILE = 5 * 1024 * 1024;
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;
let currentFile = null;
let savedSnapshot = null;
let allowClose = false;
const stateFile = () => path.join(app.getPath('userData'), 'desktop-state.json');
function readState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return { recent: [] }; } }
function writeState(s) { try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2)); } catch { /* not fatal */ } }
function addRecent(file) {
  const s = readState();
  s.recent = [file].concat((s.recent || []).filter((f) => f !== file)).slice(0, 10);
  writeState(s); app.addRecentDocument(file); buildMenu();
}

const page = (js) => (win ? win.webContents.executeJavaScript(js, true) : Promise.resolve(null));
const mapJson = () => page('JSON.stringify(window.GMMC.getMap(), null, 2)');

function setTitle() {
  if (!win) return;
  win.setTitle('GTHA Metro Map Creator' + (currentFile ? ' - ' + path.basename(currentFile) : ''));
}
async function isDirty() {
  if (savedSnapshot === null) return false;
  const now = await mapJson().catch(() => null);
  return now !== null && now !== savedSnapshot;
}

async function openFile(file) {
  if (!file) {
    const r = await dialog.showOpenDialog(win, { title: 'Open map', properties: ['openFile'], filters: [{ name: 'Map file', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return;
    file = r.filePaths[0];
  }
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_FILE) throw new Error('The file is larger than 5 MB.');
    const text = fs.readFileSync(file, 'utf8');
    const ok = await page('window.GMMC.loadJson(' + JSON.stringify(text) + ')');
    if (!ok) throw new Error('That file is not a valid map.');
    currentFile = file; savedSnapshot = await mapJson(); setTitle(); addRecent(file);
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', title: 'Could not open map', message: 'Could not open ' + path.basename(file), detail: String(e.message || e) });
    const s = readState(); s.recent = (s.recent || []).filter((f) => f !== file); writeState(s); buildMenu();
  }
}
async function saveFile(saveAs) {
  let file = currentFile;
  if (!file || saveAs) {
    const r = await dialog.showSaveDialog(win, { title: 'Save map as', defaultPath: file || 'gtha-map.json', filters: [{ name: 'Map file', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return false;
    file = r.filePath;
  }
  try {
    const json = await mapJson();
    fs.writeFileSync(file, json, 'utf8');
    currentFile = file; savedSnapshot = json; setTitle(); addRecent(file);
    return true;
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', title: 'Could not save map', message: 'Could not save ' + path.basename(file), detail: String(e.message || e) });
    return false;
  }
}
async function newMap(kind) {
  if (await isDirty()) { const r = await confirmDiscard(); if (r === 'cancel') return; }
  await page(`window.GMMC.newMap(${JSON.stringify(kind)})`);
  currentFile = null; savedSnapshot = await mapJson(); setTitle();
}
async function confirmDiscard() {
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Save', "Don't save", 'Cancel'], defaultId: 0, cancelId: 2, title: 'Unsaved changes', message: 'Save changes to ' + (currentFile ? path.basename(currentFile) : 'this map') + '?', detail: 'Your work is also kept automatically inside the app, but it is not in a file yet.' });
  if (r.response === 0) return (await saveFile(false)) ? 'saved' : 'cancel';
  return r.response === 1 ? 'discard' : 'cancel';
}
const go = (rel) => win && win.loadURL(`${SCHEME}://local/${rel}`);

function buildMenu() {
  const recent = (readState().recent || []).filter((f) => fs.existsSync(f));
  const tpl = [
    { label: 'File', submenu: [
      { label: 'New map from GTHA template', accelerator: 'CmdOrCtrl+N', click: () => newMap('gtha') },
      { label: 'New blank map', accelerator: 'CmdOrCtrl+Shift+N', click: () => newMap('blank') },
      { type: 'separator' },
      { label: 'Open map...', accelerator: 'CmdOrCtrl+O', click: () => openFile() },
      { label: 'Open recent', submenu: recent.length ? recent.map((f) => ({ label: f, click: () => openFile(f) })).concat([{ type: 'separator' }, { label: 'Clear recent maps', click: () => { const s = readState(); s.recent = []; writeState(s); app.clearRecentDocuments(); buildMenu(); } }]) : [{ label: 'No recent maps', enabled: false }] },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => saveFile(false) },
      { label: 'Save as...', accelerator: 'CmdOrCtrl+Shift+S', click: () => saveFile(true) },
      { type: 'separator' },
      { label: 'Export SVG...', click: () => page("window.GMMC.exportAct('svg')") },
      { label: 'Export PNG...', click: () => page("window.GMMC.exportAct('png')") },
      { type: 'separator' },
      { role: 'quit', label: 'Exit' }
    ] },
    { label: 'Edit', submenu: [
      { label: 'Undo map edit', accelerator: 'CmdOrCtrl+Z', click: () => page('window.GMMC.undo()') },
      { label: 'Redo map edit', accelerator: 'CmdOrCtrl+Y', click: () => page('window.GMMC.redo()') },
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'View', submenu: [
      { label: 'Editor', accelerator: 'CmdOrCtrl+1', click: () => go('app/index.html') },
      { label: 'Guides and documentation', accelerator: 'CmdOrCtrl+2', click: () => go('docs/index.html') },
      { label: 'Project home', accelerator: 'CmdOrCtrl+3', click: () => go('index.html') },
      { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }
    ] },
    { label: 'Help', submenu: [
      { label: 'Online project page', click: () => shell.openExternal('https://ding-ding-projects.github.io/gtha-metro-map-creator/') },
      { label: 'Report a problem', click: () => shell.openExternal('https://github.com/Ding-Ding-Projects/gtha-metro-map-creator/issues') },
      { type: 'separator' },
      { label: 'About', click: () => dialog.showMessageBox(win, { title: 'About', message: 'GTHA Metro Map Creator ' + app.getVersion(), detail: 'Works offline. Everything, including the documentation, is inside this app. MIT licence.' }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 720, minHeight: 520, show: false, backgroundColor: '#F6F5F1',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  // GMMC_HIDDEN=1 keeps the window off screen for automated verification.
  win.once('ready-to-show', () => { if (process.env.GMMC_HIDDEN !== '1') win.show(); });
  // Links that leave the bundled content open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(SCHEME + '://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  // Exports become native Save dialogs.
  win.webContents.session.on('will-download', (_e, item) => { item.setSaveDialogOptions({ title: 'Export map', defaultPath: item.getFilename() }); });
  win.webContents.on('did-finish-load', async () => { setTitle(); if (savedSnapshot === null && win.webContents.getURL().includes('/app/')) savedSnapshot = await mapJson().catch(() => null); });
  win.on('close', async (e) => {
    if (allowClose) return;
    e.preventDefault();
    const dirty = currentFile ? await isDirty() : false;
    if (dirty && (await confirmDiscard()) === 'cancel') return;
    allowClose = true; win.close();
  });
  go('app/index.html');
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); const f = argv.find((a) => a.toLowerCase().endsWith('.json')); if (f) openFile(f); } });
  app.whenReady().then(() => {
    protocol.handle(SCHEME, (req) => {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (!rel || rel.endsWith('/')) rel += 'index.html';
      const full = path.normalize(path.join(CONTENT, rel));
      if (!full.startsWith(CONTENT)) return new Response('Not found', { status: 404 });
      try { if (fs.statSync(full).isDirectory()) return net.fetch(pathToFileURL(path.join(full, 'index.html')).toString()); } catch { return new Response('Not found', { status: 404 }); }
      return net.fetch(pathToFileURL(full).toString());
    });
    buildMenu(); createWindow();
    const f = process.argv.slice(1).find((a) => a.toLowerCase().endsWith('.json') && fs.existsSync(a));
    if (f) win.webContents.once('did-finish-load', () => openFile(f));
  });
  app.on('window-all-closed', () => app.quit());
}
