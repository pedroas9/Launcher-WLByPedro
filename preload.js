const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  jugar: (datos) => ipcRenderer.invoke('jugar', datos),
  datosBarra: () => ipcRenderer.invoke('datos-barra'),
  multicuentas: () => ipcRenderer.invoke('multicuentas'),
  metricas: () => ipcRenderer.invoke('metricas'),
  prefsLeer: () => ipcRenderer.invoke('prefs-leer'),
  prefsGuardar: (prefs) => ipcRenderer.invoke('prefs-guardar', prefs),
  borrarCuenta: (usuario) => ipcRenderer.invoke('cuentas-borrar', usuario),
  minimizar: () => ipcRenderer.invoke('ventana-minimizar'),
  maximizar: () => ipcRenderer.invoke('ventana-maximizar'),
  pedirCerrar: () => ipcRenderer.invoke('cerrar-pedir'),
  elegirCerrar: (opcion) => ipcRenderer.invoke('cerrar-elegir', opcion),
});
