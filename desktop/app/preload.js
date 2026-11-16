// Exposes one narrow function to the editor page: fetch an allow-listed live feed as bytes.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gmmcDesktop', {
  fetchFeed: (url) => ipcRenderer.invoke('gmmc:fetch-feed', String(url))
});
