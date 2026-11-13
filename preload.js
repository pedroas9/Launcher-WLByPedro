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
  ventanaMaximizada: () => ipcRenderer.invoke('ventana-estado'),
  onEstadoVentana: (callback) => {
    const listener = (_evento, maximizada) => callback(maximizada);
    ipcRenderer.on('ventana-estado', listener);
    return () => ipcRenderer.removeListener('ventana-estado', listener);
  },
  pedirCerrar: () => ipcRenderer.invoke('cerrar-pedir'),
  elegirCerrar: (opcion) => ipcRenderer.invoke('cerrar-elegir', opcion),
  reiniciarJuego: () => ipcRenderer.invoke('juego-reiniciar'),
  // menú de cuentas
  abrirMenuCuentas: (rect) => ipcRenderer.invoke('menu-cuentas-abrir', rect),
  menuCuentasDatos: () => ipcRenderer.invoke('menu-cuentas-datos'),
  menuCuentaAbrir: (usuario) => ipcRenderer.invoke('menu-cuenta-abrir', usuario),
  menuCuentaBorrar: (usuario) => ipcRenderer.invoke('menu-cuenta-borrar', usuario),
  menuAlto: (alto) => ipcRenderer.invoke('menu-cuentas-alto', alto),
  cerrarMenu: () => ipcRenderer.invoke('menu-cuentas-cerrar'),
  abrirAgregarCuenta: () => ipcRenderer.invoke('agregar-cuenta-abrir'),
  cuentaCrear: (datos) => ipcRenderer.invoke('cuenta-crear', datos),
  cerrarDialogo: () => ipcRenderer.invoke('dialogo-cerrar'),
  onActualizacion: (callback) => {
    const listener = (_evento, payload) => callback(payload);
    ipcRenderer.on('actualizacion-evento', listener);
    return () => ipcRenderer.removeListener('actualizacion-evento', listener);
  },
  reiniciarParaActualizar: () => ipcRenderer.invoke('actualizacion-reiniciar'),
  comprobarActualizacion: () => ipcRenderer.invoke('actualizacion-comprobar'),
  versionApp: () => ipcRenderer.invoke('app-version'),
});
