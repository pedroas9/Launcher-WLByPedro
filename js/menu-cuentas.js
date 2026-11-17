'use strict';

const { BrowserWindow, ipcMain, screen } = require('electron');
const {
  PRELOAD_PATH,
  rutaVista,
  ALTO_BARRA,
  MAX_VENTANAS,
  MAX_CUENTAS,
} = require('./config');
const { leerPrefs, listaCuentas, guardarCuenta, borrarCuenta } = require('./prefs');
const { conectar } = require('./red');
const {
  ventanasJuego,
  slotsReservados,
  particionDe,
  slotLibre,
  ventanaDe,
  buscarCuentaAbierta,
  enfocarVentana,
  centrarSobre,
  abrirJuego,
} = require('./ventanas');

const ANCHO_MENU_CUENTAS = 300;
const ALTO_MENU_MAX = 420;
let menuCuentas = null;
let anclaMenu = null;
let menuCerradoEn = 0;
let dialogoCuenta = null;

function datosMenuCuentas() {
  const p = leerPrefs();
  const abiertasSet = new Set(
    ventanasJuego
      .filter((v) => v.win && !v.win.isDestroyed() && v.credenciales && v.credenciales.cuenta)
      .map((v) => v.credenciales.cuenta.toLowerCase())
  );
  return {
    cuentas: listaCuentas(p).map((c) => ({
      usuario: c.usuario,
      tienePassword: !!c.password,
      personaje: (c.pj && c.pj.nombre) || '',
      nivel: c.pj && c.pj.nivel != null ? c.pj.nivel : null,
      servidor: c.serverNombre || '',
      abierta: abiertasSet.has(c.usuario.toLowerCase()),
    })),
    abiertas: ventanasJuego.length,
    maximo: MAX_VENTANAS,
    maxCuentas: MAX_CUENTAS,
  };
}

function colocarMenuCuentas(w, alto) {
  const a = anclaMenu;
  if (!a || !a.padre || a.padre.isDestroyed() || !w || w.isDestroyed()) return;
  const b = a.padre.getBounds();
  const r = a.rect || { top: 0, right: b.width, bottom: ALTO_BARRA };
  const area = screen.getDisplayNearestPoint({ x: b.x + Math.round(b.width / 2), y: b.y + ALTO_BARRA }).workArea;

  const x = Math.min(
    Math.max(area.x + 6, Math.round(b.x + r.right - ANCHO_MENU_CUENTAS)),
    area.x + area.width - ANCHO_MENU_CUENTAS - 6
  );
  let y = Math.round(b.y + r.bottom + 8);
  if (y + alto > area.y + area.height - 6) {
    y = Math.round(b.y + r.top) - alto - 8;
  }
  y = Math.max(area.y + 6, y);

  try {
    w.setResizable(true);
    w.setBounds({ x, y, width: ANCHO_MENU_CUENTAS, height: alto });
    w.setResizable(false);
  } catch (e) {}
}

function cerrarMenuCuentas() {
  const a = anclaMenu;
  if (a && a.padre && !a.padre.isDestroyed()) {
    a.padre.removeListener('move', cerrarMenuCuentas);
    a.padre.removeListener('resize', cerrarMenuCuentas);
    a.padre.removeListener('minimize', cerrarMenuCuentas);
    if (a.onPadreCerrado) a.padre.removeListener('closed', a.onPadreCerrado);
  }
  if (!dialogoCuenta || dialogoCuenta.isDestroyed()) {
    anclaMenu = null;
  }
  menuCerradoEn = Date.now();
  if (!menuCuentas) return;
  const w = menuCuentas;
  menuCuentas = null;
  try { if (!w.isDestroyed()) w.destroy(); } catch (e) {}
}

function mostrarMenuCuentas(padre, rect) {
  if (!padre || padre.isDestroyed() || menuCuentas) return;
  const onPadreCerrado = () => {
    if (anclaMenu && anclaMenu.padre === padre) anclaMenu = null;
    if (menuCuentas && !menuCuentas.isDestroyed() && menuCuentas.getParentWindow() === padre) {
      cerrarMenuCuentas();
    }
  };
  anclaMenu = { padre, rect: rect || null, onPadreCerrado };

  const w = new BrowserWindow({
    width: ANCHO_MENU_CUENTAS,
    height: 160,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    parent: padre,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  menuCuentas = w;
  colocarMenuCuentas(w, 160);
  w.loadFile(rutaVista('menu-cuentas.html'));
  w.once('ready-to-show', () => { if (menuCuentas === w) w.show(); });
  w.on('blur', () => cerrarMenuCuentas());
  w.on('closed', () => { if (menuCuentas === w) menuCuentas = null; });

  padre.on('move', cerrarMenuCuentas);
  padre.on('resize', cerrarMenuCuentas);
  padre.on('minimize', cerrarMenuCuentas);
  padre.once('closed', onPadreCerrado);
}

function abrirDialogoCuenta(base) {
  if (dialogoCuenta && !dialogoCuenta.isDestroyed()) {
    try { dialogoCuenta.focus(); } catch (e) {}
    return;
  }
  const ancho = 380;
  const alto = 322;
  const { x, y } = centrarSobre(base, ancho, alto);
  const w = new BrowserWindow({
    width: ancho,
    height: alto,
    x,
    y,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    parent: base && !base.isDestroyed() ? base : undefined,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  dialogoCuenta = w;
  w.loadFile(rutaVista('agregar-cuenta.html'));
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    if (dialogoCuenta === w) {
      dialogoCuenta = null;
      if (!menuCuentas) anclaMenu = null;
    }
  });
}

function registrarIpcMenuCuentas() {
  ipcMain.handle('menu-cuentas-abrir', (evento, rect) => {
    const padre = ventanaDe(evento);
    if (!padre) return;
    if (menuCuentas) {
      cerrarMenuCuentas();
      return;
    }
    if (Date.now() - menuCerradoEn < 300) return;
    mostrarMenuCuentas(padre, rect);
  });

  ipcMain.handle('menu-cuentas-cerrar', () => cerrarMenuCuentas());

  ipcMain.handle('menu-cuentas-datos', () => datosMenuCuentas());

  ipcMain.handle('menu-cuentas-alto', (evento, alto) => {
    const w = ventanaDe(evento);
    if (!w || w !== menuCuentas) return;
    colocarMenuCuentas(w, Math.max(70, Math.min(Math.round(Number(alto) || 160), ALTO_MENU_MAX)));
  });

  ipcMain.handle('menu-cuenta-borrar', (_evento, usuario) => {
    borrarCuenta(String(usuario || ''));
    return datosMenuCuentas();
  });

  ipcMain.handle('menu-cuenta-abrir', async (_evento, usuario) => {
    const cuentaTrim = String(usuario || '').trim();
    const abierta = buscarCuentaAbierta(cuentaTrim);
    if (abierta) {
      enfocarVentana(abierta.win);
      cerrarMenuCuentas();
      return { ok: true, enfocada: true };
    }

    const slot = slotLibre();
    if (!slot) return { ok: false, error: 'Máximo ' + MAX_VENTANAS + ' cuentas abiertas.' };
    slotsReservados.add(slot);
    try {
      const c = listaCuentas(leerPrefs()).find(
        (x) => x.usuario.toLowerCase() === cuentaTrim.toLowerCase()
      );
      if (!c) return { ok: false, error: 'Esa cuenta ya no está guardada.' };
      if (!c.password) return { ok: false, error: 'Esa cuenta no tiene la contraseña guardada.' };

      const particion = particionDe(slot);
      const datos = await conectar(c.usuario, c.password, particion);
      guardarCuenta(c.usuario, c.password, true, c.server, datos);
      const abierto = abrirJuego({ datos, credenciales: { cuenta: c.usuario, password: c.password }, slot, particion });
      if (!abierto) return { ok: false, error: 'No se pudo abrir la ventana del juego.' };
      cerrarMenuCuentas();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'No se pudo conectar.' };
    } finally {
      slotsReservados.delete(slot);
    }
  });

  ipcMain.handle('agregar-cuenta-abrir', (evento) => {
    const origen = ventanaDe(evento);
    const base = origen && origen.getParentWindow ? (origen.getParentWindow() || origen) : origen;
    abrirDialogoCuenta(base);
  });

  ipcMain.handle('cuenta-crear', (_evento, datos) => {
    const usuario = String((datos && datos.usuario) || '').trim();
    const password = String((datos && datos.password) || '');
    const server = (datos && datos.server) || 's1';
    if (!usuario) return { ok: false, error: 'Escribe el nombre de la cuenta.' };
    if (!password) return { ok: false, error: 'Escribe la contraseña.' };

    const lista = listaCuentas(leerPrefs());
    const existe = lista.some((c) => c.usuario.toLowerCase() === usuario.toLowerCase());
    if (!existe && lista.length >= MAX_CUENTAS) {
      return { ok: false, error: 'Máximo ' + MAX_CUENTAS + ' cuentas guardadas.' };
    }

    guardarCuenta(usuario, password, true, server);
    if (dialogoCuenta && !dialogoCuenta.isDestroyed()) {
      const w = dialogoCuenta;
      dialogoCuenta = null;
      try { w.destroy(); } catch (e) {}
    }

    const a = anclaMenu;
    anclaMenu = null;
    if (a && a.padre && !a.padre.isDestroyed()) {
      setTimeout(() => { if (!menuCuentas) mostrarMenuCuentas(a.padre, a.rect); }, 150);
    }
    return { ok: true };
  });

  ipcMain.handle('dialogo-cerrar', (evento) => {
    const w = ventanaDe(evento);
    if (w && !w.isDestroyed()) w.destroy();
  });
}

module.exports = {
  registrarIpcMenuCuentas,
};
