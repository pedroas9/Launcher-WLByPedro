'use strict';

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ROOT_DIR, PRELOAD_PATH } = require('./config');
const { ventanasJuego, ventanaDe, centrarSobre } = require('./ventanas');

const ANCHO_MACRO = 380;
const ALTO_MACRO = 362;
let ventanaMacro = null;
let macroProc = null;
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

const rutaScriptMacro = () => path.join(dirAddonMacro(), 'astros.py');
const rutaVistaMacro = () => path.join(dirAddonMacro(), 'ventana.html');
const rutaConfigMacro = () => path.join(app.getPath('userData'), 'macro-config.json');

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

function iniciarMacro(config) {
  if (macroProc) return { ok: false, error: 'El macro ya está en marcha.' };

  const cps = Math.min(20, Math.max(1, Number(config && config.cps) || 4));
  macroConfig = { cps };
  try {
    fs.writeFileSync(rutaConfigMacro(), JSON.stringify({ cps }), 'utf8');
  } catch (e) {
    return { ok: false, error: 'No pude escribir la configuración del macro.' };
  }

  let p;
  try {
    p = spawn(process.env.WL_PYTHON || 'python', [rutaScriptMacro(), '--config', rutaConfigMacro()], {
      cwd: dirAddonMacro(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    return { ok: false, error: 'No encontré Python instalado: el macro lo necesita.' };
  }

  macroProc = p;
  let resto = '';

  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (trozo) => {
    resto += trozo;
    let i;
    while ((i = resto.indexOf('\n')) >= 0) {
      const linea = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (!linea) continue;
      if (linea.charAt(0) === '{') {
        try { enviarAMacro(JSON.parse(linea)); } catch (e) {}
      } else {
        enviarAMacro({ ev: 'log', texto: linea });
      }
    }
  });

  p.stderr.setEncoding('utf8');
  p.stderr.on('data', (trozo) => enviarAMacro({ ev: 'log', texto: String(trozo).slice(0, 400) }));

  p.on('error', (e) => {
    if (macroProc === p) macroProc = null;
    avisarMacro(false);
    mostrarVentanaMacro();
    const falta = e && e.code === 'ENOENT';
    enviarAMacro({
      ev: 'error',
      texto: falta
        ? 'No encontré Python instalado en este equipo: el macro lo necesita.'
        : (e.message || 'No se pudo iniciar el macro.'),
    });
    enviarAMacro({ ev: 'fin', motivo: 'no se pudo iniciar' });
  });

  p.on('exit', () => {
    if (macroProc === p) macroProc = null;
    avisarMacro(false);
    mostrarVentanaMacro();
  });

  avisarMacro(true);
  ocultarVentanaMacro();
  return { ok: true };
}

function detenerMacro(motivo) {
  if (!macroProc) return;
  const p = macroProc;
  try { p.stdin.write('stop\n'); } catch (e) {}
  setTimeout(() => {
    try { if (macroProc === p) p.kill(); } catch (e) {}
  }, 2500);
  enviarAMacro({ ev: 'aviso', texto: motivo || 'deteniendo…' });
}

function registrarAtajosMacro() {
  const atajo = (tecla, fn) => {
    try {
      globalShortcut.unregister(tecla);
      globalShortcut.register(tecla, fn);
    } catch (e) {}
  };
  atajo('F9', () => { if (!macroProc) iniciarMacro(macroConfig); });
  atajo('F8', () => { if (macroProc) detenerMacro('detenido con F8'); });
}

function desregistrarAtajosMacro() {
  ['F8', 'F9'].forEach((tecla) => {
    try { globalShortcut.unregister(tecla); } catch (e) {}
  });
}

function abrirVentanaMacro(base) {
  if (ventanaMacro && !ventanaMacro.isDestroyed()) {
    ventanaMacro.show();
    ventanaMacro.focus();
    return;
  }
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
  if (macroProc) {
    try { macroProc.stdin.write('stop\n'); } catch (e) {}
    try { macroProc.kill(); } catch (e) {}
    macroProc = null;
  }
  desregistrarAtajosMacro();
}

function registrarIpcMacro() {
  ipcMain.handle('macro-abrir', (evento) => {
    const origen = ventanaDe(evento);
    const base = origen && origen.getParentWindow ? (origen.getParentWindow() || origen) : origen;

    if (ventanaMacro && !ventanaMacro.isDestroyed() && ventanaMacro.isVisible() && macroProc) {
      ocultarVentanaMacro();
      return;
    }
    abrirVentanaMacro(base);
  });

  ipcMain.handle('macro-iniciar', (_evento, config) => iniciarMacro(config));

  ipcMain.handle('macro-detener', () => {
    detenerMacro('deteniendo…');
    return { ok: true };
  });

  ipcMain.handle('macro-estado', () => ({ activo: !!macroProc }));

  ipcMain.handle('macro-cerrar', (evento) => {
    const w = ventanaDe(evento);
    if (w && !w.isDestroyed()) w.close();
  });
}

module.exports = {
  limpiarMacroAlSalir,
  registrarIpcMacro,
};
