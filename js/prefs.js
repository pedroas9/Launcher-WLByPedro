'use strict';

const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { MAX_CUENTAS } = require('./config');

const rutaPrefs = () => path.join(app.getPath('userData'), 'preferencias.json');
const rutaPrefsBak = () => path.join(app.getPath('userData'), 'preferencias.json.bak');
let prefsCache = null;

function clonarPrefs(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function parsearArchivoPrefs(ruta) {
  const crudo = fs.readFileSync(ruta, 'utf8');
  if (!crudo || !crudo.trim()) throw new Error('Archivo vacío');
  const parsed = JSON.parse(crudo);
  if (!parsed || typeof parsed !== 'object') throw new Error('Formato inválido');
  return parsed;
}

function leerPrefs() {
  const ruta = rutaPrefs();
  try {
    const p = parsearArchivoPrefs(ruta);
    prefsCache = clonarPrefs(p);
    return p;
  } catch (e) {
    const noExiste = e && e.code === 'ENOENT';
    if (!noExiste && prefsCache) return clonarPrefs(prefsCache);
    try {
      const bak = parsearArchivoPrefs(rutaPrefsBak());
      prefsCache = clonarPrefs(bak);
      return bak;
    } catch (eBak) {
      if (prefsCache) return clonarPrefs(prefsCache);
      return {};
    }
  }
}

function guardarPrefs(prefs) {
  const ruta = rutaPrefs();
  const bak = rutaPrefsBak();
  const tmp = ruta + '.tmp.' + process.pid + '.' + Date.now();
  const contenido = JSON.stringify(prefs, null, 2);
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    try {
      if (fs.existsSync(ruta)) {
        parsearArchivoPrefs(ruta);
        fs.copyFileSync(ruta, bak);
      }
    } catch (e) {}

    fs.writeFileSync(tmp, contenido, 'utf8');
    try {
      fs.renameSync(tmp, ruta);
    } catch (eRename) {
      fs.copyFileSync(tmp, ruta);
      try { fs.unlinkSync(tmp); } catch (e) {}
    }
    prefsCache = JSON.parse(contenido);
    return true;
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (err) {}
    return false;
  }
}

function listaCuentas(p) {
  if (Array.isArray(p.cuentas)) return p.cuentas;
  return p.usuario ? [{ usuario: p.usuario, password: p.password || '', recordar: !!p.recordar }] : [];
}

function guardarCuenta(usuario, password, recordar, server, datos) {
  const p = leerPrefs();
  const lista = listaCuentas(p);
  const clave = usuario.toLowerCase();
  const previa = lista.find((c) => c.usuario.toLowerCase() === clave) || {};
  const resto = lista.filter((c) => c.usuario.toLowerCase() !== clave);
  const pj = datos && (datos.personaje || datos.nivel != null)
    ? { nombre: datos.personaje || '', nivel: datos.nivel != null ? datos.nivel : null }
    : (previa.pj || null);
  const serverNombre = (datos && datos.serverName) || previa.serverNombre || '';
  resto.unshift({
    usuario,
    password: recordar ? password : '',
    recordar: !!recordar,
    server: server || previa.server || 's1',
    serverNombre,
    pj,
  });
  guardarPrefs({
    usuario,
    password: recordar ? password : '',
    recordar: !!recordar,
    cuentas: resto.slice(0, MAX_CUENTAS),
  });
}

function recordarPersonaje(usuario, datos) {
  if (!usuario || !datos) return;
  const p = leerPrefs();
  const lista = listaCuentas(p);
  const c = lista.find((x) => x.usuario.toLowerCase() === usuario.toLowerCase());
  if (!c) return;
  const nuevoNombre = datos.personaje || '';
  const nuevoNivel = datos.nivel != null ? datos.nivel : null;
  const nuevoServer = datos.serverName || c.serverNombre || '';
  const yaIgual = c.pj
    && c.pj.nombre === nuevoNombre
    && c.pj.nivel === nuevoNivel
    && (c.serverNombre || '') === nuevoServer;
  if (yaIgual) return;
  c.pj = { nombre: nuevoNombre, nivel: nuevoNivel };
  if (nuevoServer) c.serverNombre = nuevoServer;
  guardarPrefs({ usuario: p.usuario || '', password: p.password || '', recordar: !!p.recordar, cuentas: lista });
}

function borrarCuenta(usuario) {
  const p = leerPrefs();
  const clave = usuario.toLowerCase();
  const lista = listaCuentas(p).filter((c) => c.usuario.toLowerCase() !== clave);
  const esActivo = (p.usuario || '').toLowerCase() === clave;
  guardarPrefs({
    usuario: esActivo ? (lista[0] ? lista[0].usuario : '') : p.usuario || '',
    password: esActivo ? (lista[0] && lista[0].recordar ? lista[0].password : '') : p.password || '',
    recordar: esActivo ? (lista[0] ? !!lista[0].recordar : false) : !!p.recordar,
    cuentas: lista,
  });
  return lista;
}

function registrarIpcPrefs() {
  ipcMain.handle('prefs-leer', () => {
    const p = leerPrefs();
    return {
      usuario: p.usuario || '',
      password: p.recordar ? p.password || '' : '',
      recordar: !!p.recordar,
      cuentas: listaCuentas(p),
    };
  });

  ipcMain.handle('cuentas-borrar', (_evento, usuario) => borrarCuenta(usuario));
}

module.exports = {
  leerPrefs,
  guardarPrefs,
  listaCuentas,
  guardarCuenta,
  recordarPersonaje,
  borrarCuenta,
  registrarIpcPrefs,
};
