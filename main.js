'use strict';
const { app, BrowserWindow, BrowserView, ipcMain, session, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { initActualizaciones } = require('./updater');
const netNode = require('net'); // TCP puro para medir el ping

const SITE = 'https://wartunelab.com/';
const HOST = 'wartunelab.com';
const FLASH_VERSION = '32.0.0.363';
const ALTO_BARRA = 40; // una sola fila: juego, ping y controles
// Resolución recomendada por el juego para el área del cliente
const ANCHO_JUEGO = 1360;
const ALTO_JUEGO = 768;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

// La web del juego ya trae su propia barra (logo, cuenta, héroe, FPS, idioma,
// recargar, selector de servidores). Ponlo en false si algún día la quieres ver.
const OCULTAR_BARRA_WEB = true;

// Colores del launcher (style-wl.css) para que la ventana del juego combine
const COLOR_FONDO = '#141927';
const CSS_FONDO = `
  html, body { background-color: ${COLOR_FONDO} !important; }
  #flashContent, embed, object, iframe { background-color: ${COLOR_FONDO} !important; }
  ::-webkit-scrollbar { width: 0; height: 0; }
`;

// Oculta todo lo que quede por encima del cliente Flash dentro de la página del
// juego, sin depender de clases ni ids concretos: se buscan los elementos que
// ocupan la franja superior y se quitan; luego se recorta el hueco que dejen.
const GUION_OCULTAR_BARRA = `
(() => {
  const SELECTOR_JUEGO = 'embed, iframe, object, #flashContent';
  const ocultar = () => {
    const juego = document.querySelector(SELECTOR_JUEGO);
    if (!juego) return;
    const tope = juego.getBoundingClientRect().top;
    let nodo = juego;
    while (nodo && nodo !== document.documentElement) {
      let hno = nodo.previousElementSibling;
      while (hno) {
        const r = hno.getBoundingClientRect();
        // solo lo que esté por encima del juego, no paneles laterales
        if (r.height > 0 && r.width > 0 && r.bottom <= tope + 2) {
          hno.style.setProperty('display', 'none', 'important');
        }
        hno = hno.previousElementSibling;
      }
      nodo = nodo.parentElement;
    }
    // si aun queda franja vacía arriba (padding/margen reservado para la barra), se anula
    if (juego.getBoundingClientRect().top > 1) {
      let caja = juego;
      while (caja && caja !== document.body) {
        const e = getComputedStyle(caja);
        caja.style.setProperty('padding-top', '0px', 'important');
        caja.style.setProperty('margin-top', '0px', 'important');
        if (e.position === 'absolute' || e.position === 'fixed') caja.style.setProperty('top', '0px', 'important');
        caja = caja.parentElement;
      }
    }
  };
  ocultar();
  // solo vigila al principio: después basta con recalcular al redimensionar
  const vigilante = new MutationObserver(ocultar);
  vigilante.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => vigilante.disconnect(), 15000);
  window.addEventListener('resize', ocultar);
})();
`;

// Contador de fotogramas dentro del cliente: mide el ritmo de repintado de la
// página del juego (lo que se puede ver desde Electron; Flash no lo expone).
const GUION_FPS = `
(() => {
  if (window.__wlFps) return;
  window.__wlFps = { fps: 0, marcos: 0, inicio: performance.now() };
  const paso = () => {
    const s = window.__wlFps;
    if (!s) return;
    s.marcos++;
    const ahora = performance.now();
    if (ahora - s.inicio >= 1000) {
      s.fps = Math.round((s.marcos * 1000) / (ahora - s.inicio));
      s.marcos = 0;
      s.inicio = ahora;
    }
    requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
})();
`;

// ---------- plugin de Flash ---------
// Pepper no puede cargar el .dll desde dentro del .asar; hace falta ruta real en disco.
function rutaFlash() {
  const dll = 'pepflashplayer64.dll';
  const candidatas = [];
  if (process.env.FLASH_PLUGIN_PATH) candidatas.push(process.env.FLASH_PLUGIN_PATH);
  if (app.isPackaged) {
    candidatas.push(
      path.join(process.resourcesPath, 'plugins', dll),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'plugins', dll),
      path.join(path.dirname(process.execPath), 'resources', 'plugins', dll),
    );
  } else {
    candidatas.push(path.join(__dirname, 'plugins', dll));
  }
  return candidatas.find((p) => fs.existsSync(p)) || null;
}
const FLASH = rutaFlash();
if (FLASH) {
  app.commandLine.appendSwitch('ppapi-flash-path', FLASH);
  app.commandLine.appendSwitch('ppapi-flash-version', FLASH_VERSION);
}

// Fluidez con varias cuentas: Chromium frena ventanas sin foco u ocultas, y con
// 2-6 clientes abiertos todas menos la activa se quedarían frenadas.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// ---------- multicuentas: cada ventana con su propia sesión ----------
// Como máximo 6 clientes abiertos a la vez.
const MAX_VENTANAS = 6;
const ventanasJuego = []; // { win, vista, datos, credenciales, slot, particion, metricas }

// El primer hueco reutiliza la partición antigua para no perder lo ya guardado
const particionDe = (slot) => (slot === 1 ? 'persist:wl-juego' : 'persist:wl-juego-' + slot);

const slotLibre = () => {
  for (let n = 1; n <= MAX_VENTANAS; n++) {
    if (!ventanasJuego.some((v) => v.slot === n)) return n;
  }
  return 0;
};

const estadoDeEvento = (evento) =>
  ventanasJuego.find((v) => v.win && !v.win.isDestroyed() && v.win.webContents === evento.sender) || null;

const estadoDeVentana = (win) => ventanasJuego.find((v) => v.win === win) || null;

// ---------- métricas de la barra de título ----------
let relojMetricas = null;
let refrescandoMetricas = false; // evita que dos lecturas se solapen
const metricasVacias = () => ({ ping: null, serverClockLinear: null, serverClockAt: null });
const PUERTO_JUEGO = 5000;

// Hora de reloj del juego (campo serverTime de /api/version, no la zona horaria de Windows).
let relojServidor = null; // { linear, at }
let tickSincroniaHora = 0;

const parseHoraServidor = (texto) => {
  if (!texto || typeof texto !== 'string') return null;
  const m = texto.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
};

const anclarHoraServidor = (texto) => {
  const linear = parseHoraServidor(texto);
  if (linear == null) return;
  relojServidor = { linear, at: Date.now() };
};

const horaServidorParaBarra = () => (
  relojServidor
    ? { serverClockLinear: relojServidor.linear, serverClockAt: relojServidor.at }
    : { serverClockLinear: null, serverClockAt: null }
);

async function sincronizarHoraServidor(particion) {
  try {
    const p = await enviar({
      method: 'GET',
      url: SITE + 'api/version',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Referer': SITE,
        'X-Requested-With': 'portal',
      },
    }, particion);
    const j = JSON.parse(p.texto || '{}');
    if (j.serverTime) anclarHoraServidor(j.serverTime);
  } catch (e) {
    /* se mantiene el último ancla */
  }
}

// ping: tiempo hasta abrir una conexión TCP con el servidor del juego
// (TCP puro de Node, con tope de tiempo para que nunca se quede colgado)
function medirPing() {
  const inicio = process.hrtime.bigint();
  return new Promise((resolve) => {
    let cerrado = false;
    const sock = netNode.connect({ host: HOST, port: PUERTO_JUEGO });
    const fin = (ok) => {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(guarda);
      try { sock.destroy(); } catch (e) { /* ya cerrado */ }
      resolve(ok ? Math.max(1, Math.round(Number(process.hrtime.bigint() - inicio) / 1e6)) : null);
    };
    const guarda = setTimeout(() => fin(false), 2500);
    sock.setTimeout(2000, () => fin(false));
    sock.once('connect', () => fin(true));
    sock.once('error', () => fin(false));
  });
}

async function refrescarMetricas() {
  if (refrescandoMetricas) return;
  refrescandoMetricas = true;
  try {
    tickSincroniaHora += 1;
    if (tickSincroniaHora % 60 === 0) {
      const activa = ventanasJuego.find((v) => v.win && !v.win.isDestroyed());
      if (activa) await sincronizarHoraServidor(activa.particion);
    }
    await leerMetricas();
  } finally {
    // pase lo que pase, se libera el candado para la siguiente lectura
    refrescandoMetricas = false;
  }
}

async function leerMetricas() {
  const ms = await medirPing();
  for (const e of ventanasJuego) {
    if (!e.win || e.win.isDestroyed()) continue;
    e.metricas.ping = ms;
  }
}

function arrancarReloj() {
  if (!relojMetricas) relojMetricas = setInterval(refrescarMetricas, 1000);
  refrescarMetricas();
}

function pararRelojSiVacio() {
  if (ventanasJuego.length === 0 && relojMetricas) {
    clearInterval(relojMetricas);
    relojMetricas = null;
  }
}

// ---------- ventana de login ----------
function crearVentana() {
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ventana.setBackgroundColor('#00000000');
  ventana.loadFile('views/index.html');
}

function restringir(wc) {
  const permitido = (u) => { try { return new URL(u).hostname === HOST; } catch (e) { return false; } };
  wc.on('will-navigate', (e, u) => { if (!permitido(u)) e.preventDefault(); });
  wc.on('new-window', (e) => e.preventDefault());
}

// Abre una ventana de juego para una cuenta ya conectada.
// slot/particion deben coincidir con los usados en conectar(); si no, las cookies
// del login quedan en otra partición y el juego pierde la sesión.
function abrirJuego({ datos, credenciales, slot, particion }) {
  let slotUsado = slot;
  if (slotUsado == null) {
    slotUsado = slotLibre();
    if (!slotUsado) return null;
  } else if (ventanasJuego.some((v) => v.slot === slotUsado)) {
    return null;
  }
  const particionUsada = particion || particionDe(slotUsado);

  // si la pantalla es más pequeña que la resolución del juego se recorta
  const area = screen.getPrimaryDisplay().workAreaSize;
  const ancho = Math.min(ANCHO_JUEGO, area.width);
  const alto = Math.min(ALTO_JUEGO + ALTO_BARRA, area.height);

  const win = new BrowserWindow({
    width: ancho,
    height: alto,
    useContentSize: true,
    center: true,
    frame: false,
    show: false, // se muestra cuando la barra está lista: sin parpadeo blanco
    autoHideMenuBar: true,
    backgroundColor: COLOR_FONDO,
    title: 'WartuneLab By PedroIgeo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  // sin proxy del sistema en esta sesión: quita latencia de en medio
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
  try { vista.setBackgroundColor(COLOR_FONDO); } catch (e) { /* versiones antiguas de Electron */ }
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
  // el estado se registra antes de cargar la barra: si no, su primera petición
  // de datos llegaría antes de existir la ventana en la lista
  ventanasJuego.push(estado);
  arrancarReloj();

  win.loadFile('views/bar.html');
  win.once('ready-to-show', () => win.show());

  win.on('closed', () => {
    const i = ventanasJuego.indexOf(estado);
    if (i >= 0) ventanasJuego.splice(i, 1);
    pararRelojSiVacio();
  });

  const ajustar = () => {
    const [w, h] = win.getContentSize();
    vista.setBounds({ x: 0, y: ALTO_BARRA, width: w, height: h - ALTO_BARRA });
  };
  ajustar();
  win.on('resize', ajustar);

  restringir(vista.webContents);

  // fondo, contador de FPS y (opcionalmente) ocultar la barra de la web
  const inyectar = () => {
    vista.webContents.insertCSS(CSS_FONDO).catch(() => {});
    vista.webContents.executeJavaScript(GUION_FPS, true).catch(() => {});
    if (OCULTAR_BARRA_WEB) vista.webContents.executeJavaScript(GUION_OCULTAR_BARRA, true).catch(() => {});
  };
  vista.webContents.on('dom-ready', inyectar);
  vista.webContents.on('did-finish-load', inyectar);

  // F12 abre las herramientas para depurar el plugin
  vista.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') vista.webContents.toggleDevTools();
  });

  vista.webContents.loadURL(SITE + 'play?server=s1');
  return estado;
}

// ---------- login con el módulo net de Electron ----------
function enviar({ method, url, headers, body }, particion) {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method,
      url,
      session: session.fromPartition(particion),
      useSessionCookies: true,
    });
    for (const k of Object.keys(headers || {})) req.setHeader(k, headers[k]);
    const timer = setTimeout(() => { req.abort(); reject(new Error('El servidor no responde.')); }, 15000);
    req.on('response', (res) => {
      let texto = '';
      res.on('data', (trozo) => { texto += trozo.toString('utf8'); });
      res.on('end', () => {
        clearTimeout(timer);
        const fecha = Array.isArray(res.headers.date) ? res.headers.date[0] : res.headers.date;
        resolve({ status: res.statusCode, fecha, texto });
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    if (body) req.write(body);
    req.end();
  });
}

// Hace el login en la partición indicada y devuelve los datos de la barra
async function conectar(cuenta, password, particion) {
  if (!cuenta || !password) throw new Error('Escribe tu cuenta y contraseña.');
  if (!rutaFlash()) throw new Error('No encuentro pepflashplayer64.dll en la carpeta plugins.');

  const ses = session.fromPartition(particion);
  await ses.cookies.set({ url: SITE, name: 'lab_weblang', value: 'es' });

  const r = await enviar({
    method: 'POST',
    url: SITE + 'api/auth/login',
    headers: {
      'User-Agent': UA,
      'Origin': 'https://wartunelab.com',
      'Referer': SITE,
      'Accept': '*/*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'X-Requested-With': 'portal',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ userOrEmail: cuenta, password }).toString(),
  }, particion);

  const ok = await ses.cookies.get({ url: SITE, name: 'wartune_session' });
  if (!ok.length) throw new Error('Cuenta o contraseña incorrecta.');
  try {
    await ses.cookies.flushStore();
  } catch (e) {
    /* en algunas builds no está disponible */
  }

  // personaje (nombre y nivel) para la barra: /api/portal devuelve el usuario
  let personaje = null;
  let nivel = null;
  try {
    const p = await enviar({
      method: 'GET',
      url: SITE + 'api/portal',
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': SITE, 'X-Requested-With': 'portal' },
    }, particion);
    const u = (JSON.parse(p.texto || '{}') || {}).user;
    if (u && u.hasCharacter && u.nickName) {
      personaje = u.nickName;
      nivel = u.level;
    }
  } catch (e) {
    // si el portal no contesta, la barra muestra el personaje sin crear
  }

  await sincronizarHoraServidor(particion);

  return {
    cuenta,
    serverName: 'S1: Balasor',
    personaje,
    nivel,
    ...horaServidorParaBarra(),
  };
}

// ---------- IPC ----------
ipcMain.handle('jugar', async (evento, { cuenta, password, recordar }) => {
  try {
    if (ventanasJuego.length >= MAX_VENTANAS) {
      throw new Error('Máximo ' + MAX_VENTANAS + ' cuentas abiertas. Cierra una para abrir otra.');
    }
    const slot = slotLibre();
    if (!slot) throw new Error('Máximo ' + MAX_VENTANAS + ' cuentas abiertas.');
    const particion = particionDe(slot);

    const datos = await conectar(cuenta, password, particion);
    // se guarda aquí porque al entrar se cierra la ventana del login
    guardarCuenta(cuenta, password, recordar);
    const abierto = abrirJuego({ datos, credenciales: { cuenta, password }, slot, particion });
    if (!abierto) throw new Error('No se pudo abrir la ventana del juego.');

    const login = BrowserWindow.fromWebContents(evento.sender);
    if (login) login.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Error desconocido.' };
  }
});

// Abrir otra cuenta desde la barra de una ventana ya abierta
ipcMain.handle('multicuentas', () => {
  if (ventanasJuego.length >= MAX_VENTANAS) {
    return { ok: false, error: 'Máximo ' + MAX_VENTANAS + ' cuentas abiertas.' };
  }
  crearVentana();
  return { ok: true };
});

// Reiniciar: reconecta esa cuenta y abre su ventana de nuevo, sin pasar por el
// formulario. Usa la misma partición, así conserva su sesión y sus ajustes, y
// abre la nueva antes de cerrar la vieja para no quedarnos sin ventanas.
async function reiniciarJuego(ventana) {
  const estado = estadoDeVentana(ventana);
  if (!estado || !estado.credenciales) return false;

  let datos;
  try {
    datos = await conectar(estado.credenciales.cuenta, estado.credenciales.password, estado.particion);
  } catch (e) {
    return false;
  }

  // silencia la sesión anterior antes de abrir la nueva
  try { estado.vista.webContents.setAudioMuted(true); } catch (e) { /* sin audio */ }

  // libera su hueco para que la ventana nueva reutilice la misma partición
  const { slot, particion, credenciales } = estado;
  const i = ventanasJuego.indexOf(estado);
  if (i >= 0) ventanasJuego.splice(i, 1);

  const abierto = abrirJuego({ datos, credenciales, slot, particion });
  cerrarVentanaJuego(ventana);
  if (!abierto) return false;
  return true;
}

// Cierra del todo una ventana de juego. Sin esto, el BrowserView (y con él el
// Flash, su sonido y la sesión del juego) sigue vivo aunque la ventana desaparezca.
function cerrarVentanaJuego(win) {
  if (!win) return;

  const i = ventanasJuego.findIndex((v) => v.win === win);
  if (i >= 0) ventanasJuego.splice(i, 1);

  try {
    const vista = win.getBrowserView();
    if (vista) {
      try { win.removeBrowserView(vista); } catch (e) { /* ya quitada */ }
      const wc = vista.webContents;
      if (wc) {
        try { wc.setAudioMuted(true); } catch (e) { /* sin audio */ }
        try {
          if (typeof wc.destroy === 'function') wc.destroy(); else wc.close();
        } catch (e) { /* ya cerrada */ }
      }
    }
  } catch (e) { /* ventana sin vista */ }
  try { win.destroy(); } catch (e) { /* ya destruida */ }

  pararRelojSiVacio();
}

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

// ---------- ventana sin marco: barra propia ----------
const ventanaDe = (evento) => BrowserWindow.fromWebContents(evento.sender);

ipcMain.handle('ventana-minimizar', (evento) => {
  const w = ventanaDe(evento);
  if (w) w.minimize();
});

ipcMain.handle('ventana-maximizar', (evento) => {
  const w = ventanaDe(evento);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
});

// El botón de cerrar no cierra: pide confirmación (Salir o Cancelar).
function preguntarCerrar(padre) {
  if (!padre) return;
  const aviso = new BrowserWindow({
    width: 340,
    height: 148,
    center: true,
    parent: padre,
    modal: true,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  aviso.loadFile('views/cerrar.html');
}

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
  const padre = aviso && aviso.getParentWindow();

  if (opcion === 'salir') {
    // solo se cierra esta ventana: las demás cuentas siguen abiertas
    if (padre) cerrarVentanaJuego(padre); else app.quit();
    return;
  }

  if (aviso) aviso.close();
});

// ---------- preferencias del login (lista de cuentas) ----------
const rutaPrefs = () => path.join(app.getPath('userData'), 'preferencias.json');
const MAX_CUENTAS = 12;

function leerPrefs() {
  try {
    return JSON.parse(fs.readFileSync(rutaPrefs(), 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function guardarPrefs(prefs) {
  try {
    fs.writeFileSync(rutaPrefs(), JSON.stringify(prefs, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

// cuentas guardadas; se admite el formato antiguo de una sola cuenta
function listaCuentas(p) {
  if (Array.isArray(p.cuentas)) return p.cuentas;
  return p.usuario ? [{ usuario: p.usuario, password: p.password || '', recordar: !!p.recordar }] : [];
}

function guardarCuenta(usuario, password, recordar) {
  const p = leerPrefs();
  const lista = listaCuentas(p).filter((c) => c.usuario.toLowerCase() !== usuario.toLowerCase());
  lista.unshift({ usuario, password: recordar ? password : '', recordar: !!recordar });
  guardarPrefs({
    usuario,
    password: recordar ? password : '',
    recordar: !!recordar,
    cuentas: lista.slice(0, MAX_CUENTAS),
  });
}

function borrarCuenta(usuario) {
  const p = leerPrefs();
  const lista = listaCuentas(p).filter((c) => c.usuario.toLowerCase() !== usuario.toLowerCase());
  guardarPrefs({ usuario: p.usuario || '', password: p.password || '', recordar: !!p.recordar, cuentas: lista });
  return lista;
}

ipcMain.handle('prefs-leer', () => {
  const p = leerPrefs();
  return {
    usuario: p.usuario || '',
    password: p.recordar ? p.password || '' : '',
    recordar: !!p.recordar,
    cuentas: listaCuentas(p),
  };
});

ipcMain.handle('prefs-guardar', (_evento, { usuario, password, recordar }) => {
  if (usuario) guardarCuenta(usuario, password, recordar);
  return true;
});

ipcMain.handle('cuentas-borrar', (_evento, usuario) => borrarCuenta(usuario));

ipcMain.handle('app-version', () => app.getVersion());

app.whenReady().then(() => {
  crearVentana();
  initActualizaciones({
    hayVentanasJuego: () => ventanasJuego.length > 0,
  });
});
app.on('window-all-closed', () => app.quit());
