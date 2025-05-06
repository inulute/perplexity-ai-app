const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSelectedText: (callback) => ipcRenderer.on('set-selected-text', (event, text) => callback(text)),
  performPrefixSearch: (data) => ipcRenderer.send('perform-prefix-search', data),
  closePrefixSearch: () => ipcRenderer.send('close-prefix-search')
});