const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  jugar: (datos) => ipcRenderer.invoke('jugar', datos),
});