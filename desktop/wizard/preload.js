'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('setup', {
  check: call('check'), portFree: call('port-free'), existing: call('existing'), pull: call('pull'), start: call('start'),
  health: call('health'), stop: call('stop'), cancelRun: call('cancel-run'), open: call('open'), copy: call('copy'),
  loadState: call('state-load'), saveState: call('state-save'), version: call('version'), quit: call('quit'),
  onLog: (fn) => ipcRenderer.on('log', (_e, s) => fn(String(s)))
});
