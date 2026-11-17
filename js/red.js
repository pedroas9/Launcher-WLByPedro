'use strict';

const { session, net } = require('electron');
const { SITE, UA, rutaFlash } = require('./config');

let relojServidor = null;

function parseHoraServidor(texto) {
  if (!texto || typeof texto !== 'string') return null;
  const m = texto.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}

function anclarHoraServidor(texto) {
  const linear = parseHoraServidor(texto);
  if (linear == null) return;
  relojServidor = { linear, at: Date.now() };
}

function horaServidorParaBarra() {
  return relojServidor
    ? { serverClockLinear: relojServidor.linear, serverClockAt: relojServidor.at }
    : { serverClockLinear: null, serverClockAt: null };
}

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
  } catch (e) {}
}

async function conectar(cuenta, password, particion) {
  if (!cuenta || !password) throw new Error('Escribe tu cuenta y contraseña.');
  if (!rutaFlash()) throw new Error('No encuentro pepflashplayer64.dll en la carpeta plugins.');

  const ses = session.fromPartition(particion);
  await ses.cookies.set({ url: SITE, name: 'lab_weblang', value: 'es' });

  await enviar({
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
  } catch (e) {}

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
  } catch (e) {}

  await sincronizarHoraServidor(particion);

  return {
    cuenta,
    serverName: 'S1: Balasor',
    personaje,
    nivel,
    ...horaServidorParaBarra(),
  };
}

module.exports = {
  enviar,
  conectar,
  sincronizarHoraServidor,
  horaServidorParaBarra,
};
