'use strict';

const { app, BrowserWindow, BrowserView, ipcMain, session, screen } = require('electron');
const {
  PRELOAD_PATH,
  rutaVista,
  SITE,
  HOST,
  ALTO_BARRA,
  ANCHO_JUEGO,
  ALTO_JUEGO,
  OCULTAR_BARRA_WEB,
  COLOR_FONDO,
  MAX_VENTANAS,
  CSS_FONDO,
  GUION_OCULTAR_BARRA,
} = require('./config');
const { guardarCuenta, recordarPersonaje } = require('./prefs');
const { conectar, horaServidorParaBarra } = require('./red');
const { metricasVacias, arrancarReloj, pararRelojSiVacio } = require('./metricas');

const ventanasJuego = [];
const slotsReservados = new Set();
const avisosCerrar = new WeakMap();
let ventanaLogin = null;

const particionDe = (slot) => (slot === 1 ? 'persist:wl-juego' : 'persist:wl-juego-' + slot);

const slotLibre = () => {
  for (let n = 1; n <= MAX_VENTANAS; n++) {
    if (!ventanasJuego.some((v) => v.slot === n) && !slotsReservados.has(n)) return n;
  }
  return 0;
};

const ventanaDe = (evento) => BrowserWindow.fromWebContents(evento.sender);

const estadoDeEvento = (evento) =>
  ventanasJuego.find((v) => v.win && !v.win.isDestroyed() && v.win.webContents === evento.sender) || null;

const estadoDeVentana = (win) => ventanasJuego.find((v) => v.win === win) || null;

const buscarCuentaAbierta = (cuenta) => {
  const clave = String(cuenta || '').trim().toLowerCase();
  if (!clave) return null;
  return ventanasJuego.find(
    (v) => v.win && !v.win.isDestroyed() && v.credenciales && v.credenciales.cuenta.toLowerCase() === clave
  ) || null;
};

function enfocarVentana(win) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } catch (e) {}
}

function centrarSobre(padre, ancho, alto) {
  const tienePadre = padre && !padre.isDestroyed();
  const b = tienePadre ? padre.getBounds() : null;
  const display = b ? screen.getDisplayMatching(b) : screen.getPrimaryDisplay();
  const area = display.workArea;
  const base = b || area;

  const margen = 8;
  const minX = area.x + margen;
  const minY = area.y + margen;
  const maxX = Math.max(minX, area.x + area.width - ancho - margen);
  const maxY = Math.max(minY, area.y + area.height - alto - margen);

  const x = Math.min(Math.max(minX, Math.round(base.x + (base.width - ancho) / 2)), maxX);
  const y = Math.min(Math.max(minY, Math.round(base.y + (base.height - alto) / 2)), maxY);
  return { x, y };
}

function crearVentana() {
  if (ventanaLogin && !ventanaLogin.isDestroyed()) {
    enfocarVentana(ventanaLogin);
    return ventanaLogin;
  }
  const ventana = new BrowserWindow({
    width: 1040,
    height: 700,
    frame: false,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ventanaLogin = ventana;
  ventana.on('closed', () => {
    if (ventanaLogin === ventana) ventanaLogin = null;
  });
  ventana.setBackgroundColor('#00000000');
  ventana.loadFile(rutaVista('index.html'));
  return ventana;
}

function enfocarOCrearLogin() {
  if (ventanaLogin && !ventanaLogin.isDestroyed()) {
    enfocarVentana(ventanaLogin);
    return;
  }
  if (ventanasJuego.length < MAX_VENTANAS) {
    crearVentana();
    return;
  }
  const primera = ventanasJuego.find((v) => v.win && !v.win.isDestroyed());
  if (primera) enfocarVentana(primera.win);
}

function restringir(wc) {
  const permitido = (u) => {
    try {
      const h = new URL(u).hostname;
      return h === HOST || h.endsWith('.' + HOST);
    } catch (e) {
      return false;
    }
  };
  wc.on('will-navigate', (e, u) => { if (!permitido(u)) e.preventDefault(); });
  wc.on('new-window', (e) => e.preventDefault());
}

function abrirJuego({ datos, credenciales, slot, particion }) {
  let slotUsado = slot;
  if (slotUsado == null) {
    slotUsado = slotLibre();
    if (!slotUsado) return null;
  } else if (ventanasJuego.some((v) => v.slot === slotUsado)) {
    return null;
  }
  const particionUsada = particion || particionDe(slotUsado);

  const area = screen.getPrimaryDisplay().workAreaSize;
  const ancho = Math.min(ANCHO_JUEGO, area.width);
  const alto = Math.min(ALTO_JUEGO + ALTO_BARRA, area.height);

  const win = new BrowserWindow({
    width: ancho,
    height: alto,
    useContentSize: true,
    center: true,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: COLOR_FONDO,
    title: 'WartuneLab By PedroIgeo',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  session.fromPartition(particionUsada).setProxy({ mode: 'direct' }).catch(() => {});

  const vista = new BrowserView({
    webPreferences: {
      partition: particionUsada,
      plugins: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  try { vista.setBackgroundColor(COLOR_FONDO); } catch (e) {}
  win.setBrowserView(vista);

  const estado = {
    win,
    vista,
    datos,
    credenciales,
    slot: slotUsado,
    particion: particionUsada,
    metricas: metricasVacias(),
  };
  ventanasJuego.push(estado);
  arrancarReloj(() => ventanasJuego);

  recordarPersonaje(credenciales && credenciales.cuenta, datos);

  win.loadFile(rutaVista('bar.html'));
  win.once('ready-to-show', () => win.show());

  const avisarVentana = () => {
    if (win.isDestroyed()) return;
    win.webContents.send('ventana-estado', win.isMaximized());
  };
  win.on('maximize', avisarVentana);
  win.on('unmaximize', avisarVentana);

  win.on('closed', () => {
    const i = ventanasJuego.indexOf(estado);
    if (i >= 0) ventanasJuego.splice(i, 1);
    pararRelojSiVacio();
  });

  const ajustar = () => {
    if (win.isDestroyed()) return;
    const [w, h] = win.getContentSize();
    const anchoVista = Math.max(0, w);
    const altoVista = Math.max(0, h - ALTO_BARRA);
    try {
      vista.setBounds({ x: 0, y: ALTO_BARRA, width: anchoVista, height: altoVista });
    } catch (e) {}
  };
  ajustar();
  win.on('resize', ajustar);

  restringir(vista.webContents);

  const inyectar = () => {
    vista.webContents.insertCSS(CSS_FONDO).catch(() => {});
    if (OCULTAR_BARRA_WEB) vista.webContents.executeJavaScript(GUION_OCULTAR_BARRA, true).catch(() => {});
  };
  vista.webContents.on('dom-ready', inyectar);
  vista.webContents.on('did-finish-load', inyectar);

  vista.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') vista.webContents.toggleDevTools();
  });

  vista.webContents.loadURL(SITE + 'play?server=s1');
  return estado;
}

function cerrarVentanaJuego(win) {
  if (!win) return;

  const i = ventanasJuego.findIndex((v) => v.win === win);
  if (i >= 0) ventanasJuego.splice(i, 1);

  try {
    const vista = win.getBrowserView();
    if (vista) {
      try { win.removeBrowserView(vista); } catch (e) {}
      const wc = vista.webContents;
      if (wc) {
        try { wc.setAudioMuted(true); } catch (e) {}
        try {
          if (typeof wc.destroy === 'function') wc.destroy(); else wc.close();
        } catch (e) {}
      }
    }
  } catch (e) {}
  try { win.destroy(); } catch (e) {}

  pararRelojSiVacio();
}

async function reiniciarJuego(ventana) {
  const estado = estadoDeVentana(ventana);
  if (!estado || !estado.credenciales) return false;

  let datos;
  try {
    datos = await conectar(estado.credenciales.cuenta, estado.credenciales.password, estado.particion);
  } catch (e) {
    return false;
  }

  try { estado.vista.webContents.setAudioMuted(true); } catch (e) {}

  const { slot, particion, credenciales } = estado;
  const i = ventanasJuego.indexOf(estado);
  if (i >= 0) ventanasJuego.splice(i, 1);

  const abierto = abrirJuego({ datos, credenciales, slot, particion });
  cerrarVentanaJuego(ventana);
  return !!abierto;
}

function preguntarCerrar(padre) {
  if (!padre || padre.isDestroyed()) return;
  const existente = avisosCerrar.get(padre);
  if (existente && !existente.isDestroyed()) {
    try { existente.focus(); } catch (e) {}
    return;
  }

  const ancho = 340;
  const alto = 148;
  const { x, y } = centrarSobre(padre, ancho, alto);
  const aviso = new BrowserWindow({
    width: ancho,
    height: alto,
    x,
    y,
    parent: padre,
    modal: true,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  avisosCerrar.set(padre, aviso);
  aviso.on('closed', () => {
    if (avisosCerrar.get(padre) === aviso) avisosCerrar.delete(padre);
  });
  aviso.loadFile(rutaVista('cerrar.html'));
  aviso.once('ready-to-show', () => {
    if (!aviso.isDestroyed()) aviso.show();
  });
}

function registrarIpcVentanas() {
  ipcMain.handle('jugar', async (evento, { cuenta, password, recordar }) => {
    const cuentaTrim = String(cuenta || '').trim();
    const abierta = buscarCuentaAbierta(cuentaTrim);
    if (abierta) {
      enfocarVentana(abierta.win);
      return { ok: false, error: 'Esta cuenta ya está abierta en otra ventana.' };
    }

    const slot = slotLibre();
    if (!slot) return { ok: false, error: 'Máximo ' + MAX_VENTANAS + ' cuentas abiertas. Cierra una para abrir otra.' };
    slotsReservados.add(slot);
    try {
      const particion = particionDe(slot);
      const datos = await conectar(cuentaTrim, password, particion);
      guardarCuenta(cuentaTrim, password, recordar, null, datos);
      const abierto = abrirJuego({ datos, credenciales: { cuenta: cuentaTrim, password }, slot, particion });
      if (!abierto) throw new Error('No se pudo abrir la ventana del juego.');

      const login = BrowserWindow.fromWebContents(evento.sender);
      if (login) login.close();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'Error desconocido.' };
    } finally {
      slotsReservados.delete(slot);
    }
  });

  ipcMain.handle('datos-barra', (evento) => {
    const estado = estadoDeEvento(evento);
    if (!estado) return null;
    return { ...estado.datos, ...horaServidorParaBarra() };
  });

  ipcMain.handle('metricas', (evento) => {
    const estado = estadoDeEvento(evento);
    if (!estado) return metricasVacias();
    return { ...estado.metricas, ...horaServidorParaBarra() };
  });

  ipcMain.handle('ventana-minimizar', (evento) => {
    const w = ventanaDe(evento);
    if (w) w.minimize();
  });

  ipcMain.handle('ventana-maximizar', (evento) => {
    const w = ventanaDe(evento);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });

  ipcMain.handle('ventana-estado', (evento) => {
    const w = ventanaDe(evento);
    return w ? w.isMaximized() : false;
  });

  ipcMain.handle('cerrar-pedir', (evento) => {
    preguntarCerrar(ventanaDe(evento));
  });

  ipcMain.handle('juego-reiniciar', async (evento) => {
    const win = ventanaDe(evento);
    if (!win) return { ok: false, error: 'Ventana no encontrada.' };
    const ok = await reiniciarJuego(win);
    if (ok) return { ok: true };
    return { ok: false, error: 'No se pudo reconectar esta cuenta.' };
  });

  ipcMain.handle('cerrar-elegir', async (evento, opcion) => {
    const aviso = ventanaDe(evento);
    const padre = aviso && !aviso.isDestroyed() && aviso.getParentWindow ? aviso.getParentWindow() : null;

    try {
      if (aviso && !aviso.isDestroyed()) aviso.destroy();
    } catch (e) {}

    if (opcion === 'salir') {
      if (padre) cerrarVentanaJuego(padre); else app.quit();
    }
  });
}

module.exports = {
  ventanasJuego,
  slotsReservados,
  particionDe,
  slotLibre,
  ventanaDe,
  buscarCuentaAbierta,
  enfocarVentana,
  centrarSobre,
  crearVentana,
  enfocarOCrearLogin,
  abrirJuego,
  registrarIpcVentanas,
};
