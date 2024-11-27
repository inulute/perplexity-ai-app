// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  switchAITool: (url) => ipcRenderer.send('switch-ai-tool', url),
  onPageLoading: (callback) => ipcRenderer.on('page-loading', (event, isLoading) => callback(isLoading)),
  openSettings: () => ipcRenderer.send('open-settings'),
  getShortcuts: () => ipcRenderer.send('get-shortcuts'),
  onShortcutsReceived: (callback) => ipcRenderer.on('shortcuts', (event, shortcuts) => callback(shortcuts)),
  setShortcuts: (shortcuts) => ipcRenderer.send('set-shortcuts', shortcuts),
  closeSettings: () => ipcRenderer.send('close-settings'),
    getSettings: () => ipcRenderer.send('get-settings'),
    onSettingsReceived: (callback) => ipcRenderer.on('settings', (event, data) => callback(data)),
    setSettings: (data) => ipcRenderer.send('set-settings', data),  
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,
});
