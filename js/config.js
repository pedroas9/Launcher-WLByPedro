'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const PRELOAD_PATH = path.join(ROOT_DIR, 'preload.js');
const rutaVista = (nombre) => path.join(ROOT_DIR, 'views', nombre);

const SITE = 'https://wartunelab.com/';
const HOST = 'wartunelab.com';
const FLASH_VERSION = '32.0.0.363';
const ALTO_BARRA = 40;
const ANCHO_JUEGO = 1360;
const ALTO_JUEGO = 768;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
const OCULTAR_BARRA_WEB = true;
const COLOR_FONDO = '#141927';
const MAX_VENTANAS = 6;
const MAX_CUENTAS = 12;
const PUERTO_JUEGO = 5000;

const CSS_FONDO = `
  html, body { background-color: ${COLOR_FONDO} !important; }
  #flashContent, embed, object, iframe { background-color: ${COLOR_FONDO} !important; }
  ::-webkit-scrollbar { width: 0; height: 0; }
`;

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
        if (r.height > 0 && r.width > 0 && r.bottom <= tope + 2) {
          hno.style.setProperty('display', 'none', 'important');
        }
        hno = hno.previousElementSibling;
      }
      nodo = nodo.parentElement;
    }
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
  const vigilante = new MutationObserver(ocultar);
  vigilante.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => vigilante.disconnect(), 15000);
  window.addEventListener('resize', ocultar);
})();
`;

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
    candidatas.push(path.join(ROOT_DIR, 'plugins', dll));
  }
  return candidatas.find((p) => fs.existsSync(p)) || null;
}

function aplicarSwitchesChromium() {
  const flash = rutaFlash();
  if (flash) {
    app.commandLine.appendSwitch('ppapi-flash-path', flash);
    app.commandLine.appendSwitch('ppapi-flash-version', FLASH_VERSION);
  }
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

module.exports = {
  ROOT_DIR,
  PRELOAD_PATH,
  rutaVista,
  SITE,
  HOST,
  FLASH_VERSION,
  ALTO_BARRA,
  ANCHO_JUEGO,
  ALTO_JUEGO,
  UA,
  OCULTAR_BARRA_WEB,
  COLOR_FONDO,
  MAX_VENTANAS,
  MAX_CUENTAS,
  PUERTO_JUEGO,
  CSS_FONDO,
  GUION_OCULTAR_BARRA,
  rutaFlash,
  aplicarSwitchesChromium,
};
