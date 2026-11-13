const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  jugar: (datos) => ipcRenderer.invoke('jugar', datos),
  datosBarra: () => ipcRenderer.invoke('datos-barra'),
  metricas: () => ipcRenderer.invoke('metricas'),
  prefsLeer: () => ipcRenderer.invoke('prefs-leer'),
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
  // addon: macro de astros
  abrirMacro: () => ipcRenderer.invoke('macro-abrir'),
  macroIniciar: (config) => ipcRenderer.invoke('macro-iniciar', config),
  macroDetener: () => ipcRenderer.invoke('macro-detener'),
  macroEstado: () => ipcRenderer.invoke('macro-estado'),
  macroCerrar: () => ipcRenderer.invoke('macro-cerrar'),
  onMacroEvento: (callback) => {
    const listener = (_evento, payload) => callback(payload);
    ipcRenderer.on('macro-evento', listener);
    return () => ipcRenderer.removeListener('macro-evento', listener);
  },
  onMacroActivo: (callback) => {
    const listener = (_evento, activo) => callback(activo);
    ipcRenderer.on('macro-activo', listener);
    return () => ipcRenderer.removeListener('macro-activo', listener);
  },
  onActualizacion: (callback) => {
    const listener = (_evento, payload) => callback(payload);
    ipcRenderer.on('actualizacion-evento', listener);
    return () => ipcRenderer.removeListener('actualizacion-evento', listener);
  },
  reiniciarParaActualizar: () => ipcRenderer.invoke('actualizacion-reiniciar'),
  versionApp: () => ipcRenderer.invoke('app-version'),
});
