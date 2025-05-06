// preload_update.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onLatestVersion: (callback) => ipcRenderer.on('latest-version', (event, version) => callback(version)),
  closeUpdateWindow: () => ipcRenderer.send('close-update-window'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  remindTomorrow: () => ipcRenderer.send('remind-tomorrow-update'),
});