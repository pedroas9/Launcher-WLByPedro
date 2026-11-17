'use strict';

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { ROOT_DIR, PRELOAD_PATH } = require('./config');
const { ventanasJuego, ventanaDe, centrarSobre } = require('./ventanas');
const { crearMotorMacro } = require('./macro-motor');

const ANCHO_MACRO = 380;
const ALTO_MACRO = 362;
let ventanaMacro = null;
let ventanaObjetivo = null;
let macroActivo = null;
let macroConfig = { cps: 4 };

function dirAddonMacro() {
  const rel = path.join('addons', 'macro-astros');
  if (app.isPackaged) {
    const suelto = path.join(process.resourcesPath, 'app.asar.unpacked', rel);
    if (fs.existsSync(suelto)) return suelto;
    return path.join(process.resourcesPath, rel);
  }
  return path.join(ROOT_DIR, rel);
}

function datosAddonMacro() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirAddonMacro(), 'addon.json'), 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

const rutaVistaMacro = () => path.join(dirAddonMacro(), 'ventana.html');
const rutaConfigMacro = () => path.join(app.getPath('userData'), 'macro-config.json');

function leerConfigMacro() {
  try {
    const j = JSON.parse(fs.readFileSync(rutaConfigMacro(), 'utf8'));
    if (j && Number(j.cps) > 0) macroConfig = { cps: Math.min(20, Math.max(1, Number(j.cps))) };
  } catch (e) {}
  return macroConfig;
}

function mostrarVentanaMacro() {
  if (!ventanaMacro || ventanaMacro.isDestroyed()) return;
  try {
    ventanaMacro.show();
    ventanaMacro.focus();
  } catch (e) {}
}

function ocultarVentanaMacro() {
  if (!ventanaMacro || ventanaMacro.isDestroyed()) return;
  try { ventanaMacro.hide(); } catch (e) {}
}

function avisarMacro(activo) {
  ventanasJuego.forEach((v) => {
    if (!v.win || v.win.isDestroyed()) return;
    try { v.win.webContents.send('macro-activo', !!activo); } catch (e) {}
  });
}

function enviarAMacro(datos) {
  if (!ventanaMacro || ventanaMacro.isDestroyed()) return;
  try { ventanaMacro.webContents.send('macro-evento', datos); } catch (e) {}
}

function resolverEstadoObjetivo() {
  if (ventanaObjetivo && !ventanaObjetivo.isDestroyed()) {
    const encontrado = ventanasJuego.find((v) => v.win === ventanaObjetivo && v.vista && !v.vista.webContents.isDestroyed());
    if (encontrado) return encontrado;
  }
  return ventanasJuego.find((v) => v.win && !v.win.isDestroyed() && v.vista && !v.vista.webContents.isDestroyed()) || null;
}

function iniciarMacro(config) {
  if (macroActivo) return { ok: false, error: 'El macro ya está en marcha.' };

  const estadoJuego = resolverEstadoObjetivo();
  if (!estadoJuego) return { ok: false, error: 'No hay ninguna ventana de juego abierta.' };

  const cps = Math.min(20, Math.max(1, Number(config && config.cps) || macroConfig.cps || 4));
  macroConfig = { cps };
  try {
    fs.writeFileSync(rutaConfigMacro(), JSON.stringify({ cps }), 'utf8');
  } catch (e) {}

  let motor;
  motor = crearMotorMacro({
    estadoJuego,
    dirAddon: dirAddonMacro(),
    config: macroConfig,
    onEvento: (ev) => enviarAMacro(ev),
    onFin: () => {
      if (macroActivo === motor) macroActivo = null;
      avisarMacro(false);
      mostrarVentanaMacro();
    },
  });

  macroActivo = motor;
  avisarMacro(true);
  ocultarVentanaMacro();
  motor.iniciar();
  return { ok: true };
}

function detenerMacro(motivo) {
  if (!macroActivo) return;
  macroActivo.detener(motivo || 'detenido');
  enviarAMacro({ ev: 'aviso', texto: 'deteniendo…' });
}

function registrarAtajosMacro() {
  const atajo = (tecla, fn) => {
    try {
      globalShortcut.unregister(tecla);
      globalShortcut.register(tecla, fn);
    } catch (e) {}
  };
  atajo('F9', () => { if (!macroActivo) iniciarMacro(macroConfig); });
  atajo('F8', () => { if (macroActivo) detenerMacro('detenido con F8'); });
}

function desregistrarAtajosMacro() {
  ['F8', 'F9'].forEach((tecla) => {
    try { globalShortcut.unregister(tecla); } catch (e) {}
  });
}

function abrirVentanaMacro(base) {
  if (base && !base.isDestroyed()) ventanaObjetivo = base;
  if (ventanaMacro && !ventanaMacro.isDestroyed()) {
    ventanaMacro.show();
    ventanaMacro.focus();
    return;
  }
  leerConfigMacro();
  const padre = base && !base.isDestroyed() ? base : null;
  const { x, y } = centrarSobre(padre, ANCHO_MACRO, ALTO_MACRO);

  const w = new BrowserWindow({
    width: ANCHO_MACRO,
    height: ALTO_MACRO,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: false,
    title: datosAddonMacro().nombre || 'Macro de Astros',
    parent: padre || undefined,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ventanaMacro = w;
  w.loadFile(rutaVistaMacro());
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    if (ventanaMacro === w) ventanaMacro = null;
    desregistrarAtajosMacro();
    detenerMacro('ventana del macro cerrada');
  });
  registrarAtajosMacro();
}

function limpiarMacroAlSalir() {
  if (macroActivo) {
    macroActivo.detener('launcher cerrado');
    macroActivo = null;
  }
  desregistrarAtajosMacro();
}

function registrarIpcMacro() {
  ipcMain.handle('macro-abrir', (evento) => {
    const origen = ventanaDe(evento);
    const base = origen && origen.getParentWindow ? (origen.getParentWindow() || origen) : origen;

    if (ventanaMacro && !ventanaMacro.isDestroyed() && ventanaMacro.isVisible() && macroActivo) {
      ocultarVentanaMacro();
      return;
    }
    abrirVentanaMacro(base);
  });

  ipcMain.handle('macro-iniciar', (_evento, config) => iniciarMacro(config));

  ipcMain.handle('macro-detener', () => {
    detenerMacro('detenido');
    return { ok: true };
  });

  ipcMain.handle('macro-estado', () => ({ activo: !!macroActivo, cps: macroConfig.cps }));

  ipcMain.handle('macro-cerrar', (evento) => {
    const w = ventanaDe(evento);
    if (w && !w.isDestroyed()) w.close();
  });
}

module.exports = {
  limpiarMacroAlSalir,
  registrarIpcMacro,
};
