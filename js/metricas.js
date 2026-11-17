'use strict';

const netNode = require('net');
const { HOST, PUERTO_JUEGO } = require('./config');
const { sincronizarHoraServidor } = require('./red');

let relojMetricas = null;
let refrescandoMetricas = false;
let tickSincroniaHora = 0;
let obtenerVentanas = () => [];

const metricasVacias = () => ({ ping: null, serverClockLinear: null, serverClockAt: null });

function medirPing() {
  const inicio = process.hrtime.bigint();
  return new Promise((resolve) => {
    let cerrado = false;
    const sock = netNode.connect({ host: HOST, port: PUERTO_JUEGO });
    const fin = (ok) => {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(guarda);
      try { sock.destroy(); } catch (e) {}
      resolve(ok ? Math.max(1, Math.round(Number(process.hrtime.bigint() - inicio) / 1e6)) : null);
    };
    const guarda = setTimeout(() => fin(false), 2500);
    sock.setTimeout(2000, () => fin(false));
    sock.once('connect', () => fin(true));
    sock.once('error', () => fin(false));
  });
}

async function leerMetricas() {
  const ms = await medirPing();
  for (const e of obtenerVentanas()) {
    if (!e.win || e.win.isDestroyed()) continue;
    e.metricas.ping = ms;
  }
}

async function refrescarMetricas() {
  if (refrescandoMetricas) return;
  refrescandoMetricas = true;
  try {
    tickSincroniaHora += 1;
    if (tickSincroniaHora % 60 === 0) {
      const activa = obtenerVentanas().find((v) => v.win && !v.win.isDestroyed());
      if (activa) await sincronizarHoraServidor(activa.particion);
    }
    await leerMetricas();
  } finally {
    refrescandoMetricas = false;
  }
}

function arrancarReloj(fnVentanas) {
  if (typeof fnVentanas === 'function') obtenerVentanas = fnVentanas;
  if (!relojMetricas) relojMetricas = setInterval(refrescarMetricas, 1000);
  refrescarMetricas();
}

function pararRelojSiVacio() {
  if (obtenerVentanas().length === 0 && relojMetricas) {
    clearInterval(relojMetricas);
    relojMetricas = null;
  }
}

module.exports = {
  metricasVacias,
  arrancarReloj,
  pararRelojSiVacio,
};
