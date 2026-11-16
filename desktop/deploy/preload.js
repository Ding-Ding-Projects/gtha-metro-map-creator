'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('deployApi', {
  init: call('init'), saveState: call('save-state'), chooseMap: call('choose-map'), clearMap: call('clear-map'), deploy: call('deploy'), cancel: call('cancel'),
  pickPath: call('pick-path'), open: call('open'), copy: call('copy'), ghStatus: call('gh-status'), ghSaveToken: call('gh-save-token'), ghSignOut: call('gh-sign-out'),
  builtinStop: call('builtin-stop'), quit: call('quit'),
  listDisks: call('list-disks'), flash: call('flash'),
  instances: call('instances-list'), instancesCheck: call('instances-check'), instanceAction: call('instances-action'), instanceDuplicate: call('instances-duplicate'),
  onInstances: (fn) => ipcRenderer.on('instances-changed', (_e, l) => fn(l)),
  onInstanceStatus: (fn) => ipcRenderer.on('inst-status', (_e, s) => fn(s)),
  onStatus: (fn) => ipcRenderer.on('status', (_e, s) => fn(s)),
  onLog: (fn) => ipcRenderer.on('log', (_e, l) => fn(l))
});
