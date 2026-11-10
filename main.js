const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const RUFFLE = 'D:\\ruffle-nightly-2026_11_08-windows-x86_64\\ruffle.exe';
const SITE = 'https://wartunelab.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 800,
    height: 900,
    frame: false,
    resizable: false,
    transparent: true,
    backgroundColor:' #00000000',
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ventana.setBackgroundColor('#00000000');
  ventana.loadFile('index.html');
}

// ---------- utilidades ----------
const unescapeHtml = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

function guardarCookies(jar, res) {
  const lista = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of lista) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    if (i > 0) jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
}
const cabeceraCookie = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

// ---------- motor: login -> /play -> datos del juego ----------
async function obtenerSesion(cuenta, password, server) {
  const jar = new Map([['lab_weblang', 'es']]);
  const base = {
    'User-Agent': UA,
    Origin: 'https://wartunelab.com',
    Referer: SITE,
    Accept: '*/*',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'X-Requested-With': 'portal',
  };

// 1. Login (formulario)
  const rLogin = await fetch(SITE + 'api/auth/login', {
    method: 'POST',
    headers: { ...base, Cookie: cabeceraCookie(jar) },
    body: new URLSearchParams({ userOrEmail: cuenta, password }),
    signal: AbortSignal.timeout(15000),
  });
  guardarCookies(jar, rLogin);
  if (!jar.has('wartune_session')) {
    throw new Error('Cuenta o contraseña incorrecta.');
  }

  // 2. Página del juego
  const rPlay = await fetch(SITE + 'play?server=' + encodeURIComponent(server || 's1'), {
    headers: { ...base, Cookie: cabeceraCookie(jar) },
    signal: AbortSignal.timeout(15000),
  });
  const texto = await rPlay.text();

  // 3. Extraer SWF, base y FlashVars
  const mSwf = texto.match(/<embed[^>]*\bsrc="([^"]+\.swf[^"]*)"/i);
  const mFv = texto.match(/flashvars="([^"]+)"/i);
  if (!mSwf || !mFv) {
    throw new Error('No se pudo abrir la página del juego. ¿Sesión inválida?');
  }

  const swfUrl = new URL(unescapeHtml(mSwf[1]), SITE).href;

  // --- BLOQUE --base: no modificar ---
  const mBase = texto.match(/<embed[^>]*\bbase="([^"]+)"/i);
  const mBaseParam = texto.match(/<param[^>]*\bname="base"[^>]*\bvalue="([^"]+)"/i);
  let baseUrl;
  if (mBase) baseUrl = new URL(unescapeHtml(mBase[1]), swfUrl).href;
  else if (mBaseParam) baseUrl = new URL(unescapeHtml(mBaseParam[1]), swfUrl).href;
  else baseUrl = SITE;
  // --- fin bloque --base ---

  const flashvars = {};
  for (const p of unescapeHtml(mFv[1]).split('&')) {
    const i = p.indexOf('=');
    if (i > 0) flashvars[p.slice(0, i)] = safeDecode(p.slice(i + 1));
  }

  return { swfUrl, baseUrl, flashvars };
}

// ---------- lanzar Ruffle ----------
function abrirJuego({ swfUrl, baseUrl, flashvars }) {
  if (!fs.existsSync(RUFFLE)) throw new Error('No encuentro ruffle.exe en: ' + RUFFLE);

  const args = ['--base', baseUrl, '--socket-allow', 'wartunelab.com:5000'];
  for (const [k, v] of Object.entries(flashvars)) args.push('-P', `${k}=${v}`);
  args.push(swfUrl);

  const hijo = spawn(RUFFLE, args, { detached: true, stdio: 'ignore' });
  hijo.unref();
}

// ---------- IPC ----------
ipcMain.handle('jugar', async (_evento, { cuenta, password, server }) => {
  try {
    if (!cuenta || !password) throw new Error('Escribe tu cuenta y contraseña.');
    const datos = await obtenerSesion(cuenta, password, server);
    abrirJuego(datos);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Error desconocido.' };
  }
});

app.whenReady().then(crearVentana);