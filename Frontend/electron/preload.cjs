const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aivraDesktop', {
  platform: process.platform,
  isDesktop: true,
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
});
