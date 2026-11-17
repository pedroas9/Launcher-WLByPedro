'use strict';

const { screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { crearVisor } = require('./macro-vision');

const VARIACION_MS = 40;
const MOV_ORBE = [30, 60];
const MOV_UI = [120, 250];
const PAUSA_UI = [500, 900];
const SINTETIZAR_CADA_DEFAULT = 15;
const BOTONES_CICLO_DEFAULT = ['btn-sintetizar'];
const FALLOS_SEGUIDOS_MAX = 5;
const CONF = 0.85;
const CONF_PANEL = 0.80;
const AUTO_AVISO = true;
const CONFIRMAR_YES = true;
const SOLO_ESCRIBIR_YES = false;
const OFFSET_CAMPO_Y = 21;

const randUniform = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function carpetaPlantillas(dirAddon) {
  const p = path.join(dirAddon, 'plantillas');
  if (fs.existsSync(p)) return p;
  return path.join(dirAddon, 'screens');
}

function crearMotorMacro({ estadoJuego, dirAddon, config, onEvento, onFin }) {
  const cps = Math.max(0.5, Math.min(Number(config && config.cps) || 4, 50));
  const intervaloMs = 1000 / cps;
  const sintetizarCada = config && config.sintetizarCada != null
    ? Math.max(1, parseInt(config.sintetizarCada, 10) || SINTETIZAR_CADA_DEFAULT)
    : SINTETIZAR_CADA_DEFAULT;
  const botonesCiclo = Array.isArray(config && config.botones) && config.botones.length
    ? config.botones.map(String)
    : BOTONES_CICLO_DEFAULT;

  const visor = crearVisor(carpetaPlantillas(dirAddon));
  let detenido = false;
  let motivoParada = null;

  const emitir = (datos) => {
    if (typeof onEvento === 'function') onEvento(datos);
  };

  const parar = () => detenido || !estadoJuego || !estadoJuego.win || estadoJuego.win.isDestroyed()
    || !estadoJuego.vista || estadoJuego.vista.webContents.isDestroyed();

  const dormir = (ms) => new Promise((resolve) => {
    const fin = Date.now() + Math.max(0, ms);
    const paso = () => {
      if (parar() || Date.now() >= fin) {
        resolve(!parar());
        return;
      }
      setTimeout(paso, Math.min(15, fin - Date.now()));
    };
    paso();
  });

  const esperarHasta = (momentoMs) => dormir(momentoMs - Date.now());

  const espera = (a, b) => dormir(randUniform(a, b != null ? b : a));

  async function captura() {
    if (parar()) return null;
    const wc = estadoJuego.vista.webContents;
    const img = await wc.capturePage();
    if (!img || img.isEmpty()) return null;
    let scaleFactor = 1;
    try {
      const bounds = estadoJuego.win.getBounds();
      scaleFactor = screen.getDisplayMatching(bounds).scaleFactor || 1;
    } catch (e) {}
    return visor.prepararCaptura(img, scaleFactor);
  }

  const buscar = (cap, nombre, umbral) => visor.buscar(cap, nombre, umbral);
  const visible = (cap, nombre, umbral = CONF) => buscar(cap, nombre, umbral).score >= umbral;

  async function moverYClic(cap, x, y, w, h, mov) {
    if (parar()) return;
    const dx = randInt(-Math.max(1, Math.floor(w / 4)), Math.max(1, Math.floor(w / 4)));
    const dy = randInt(-Math.max(1, Math.floor(h / 4)), Math.max(1, Math.floor(h / 4)));
    const dipX = Math.max(0, Math.min(cap.dipW - 1, Math.round(((x + dx) * cap.dipW) / cap.w)));
    const dipY = Math.max(0, Math.min(cap.dipH - 1, Math.round(((y + dy) * cap.dipH) / cap.h)));
    const wc = estadoJuego.vista.webContents;
    try {
      wc.sendInputEvent({ type: 'mouseMove', x: dipX, y: dipY });
    } catch (e) {}
    await dormir(randUniform(mov[0], mov[1]));
    if (parar()) return;
    try {
      wc.sendInputEvent({ type: 'mouseDown', x: dipX, y: dipY, button: 'left', clickCount: 1 });
    } catch (e) {}
    await dormir(randUniform(15, 28));
    if (parar()) return;
    try {
      wc.sendInputEvent({ type: 'mouseUp', x: dipX, y: dipY, button: 'left', clickCount: 1 });
    } catch (e) {}
  }

  async function clicUi(cap, x, y, w = 20, h = 20) {
    await moverYClic(cap, x, y, w, h, MOV_UI);
    await espera(PAUSA_UI[0], PAUSA_UI[1]);
  }

  async function escribirTexto(texto) {
    const wc = estadoJuego.vista.webContents;
    for (const ch of texto) {
      if (parar()) return;
      try {
        wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
        wc.sendInputEvent({ type: 'char', keyCode: ch });
        wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
      } catch (e) {}
      await dormir(90);
    }
  }

  function alarma(motivo) {
    emitir({ ev: 'aviso', texto: motivo });
    try { shell.beep(); } catch (e) {}
  }

  async function esperarQueDesaparezca(nombre, limiteSeg = 180) {
    const inicio = Date.now();
    let ultimoBeep = 0;
    while ((Date.now() - inicio) / 1000 < limiteSeg) {
      if (parar()) return false;
      const cap = await captura();
      if (!cap) return false;
      if (!visible(cap, nombre)) return true;
      await dormir(500);
      const transcurrido = Math.floor((Date.now() - inicio) / 1000);
      if (transcurrido > 0 && transcurrido % 4 === 0 && transcurrido !== ultimoBeep) {
        ultimoBeep = transcurrido;
        try { shell.beep(); } catch (e) {}
      }
    }
    return false;
  }

  function hayVentana(cap) {
    return visible(cap, 'texto-yes') || visible(cap, 'aviso-titulo');
  }

  async function manejarVentanas() {
    for (let intento = 0; intento < 6; intento++) {
      if (parar()) return false;
      const cap = await captura();
      if (!cap) return false;

      const rYes = buscar(cap, 'texto-yes', CONF);
      if (rYes.score >= CONF) {
        if (!CONFIRMAR_YES) {
          alarma('ventana del YES: confirma tú');
          if (!(await esperarQueDesaparezca('texto-yes'))) return false;
        } else {
          const rCampo = buscar(cap, 'campo-yes', 0.7);
          if (rCampo.score >= 0.7) {
            await clicUi(cap, rCampo.x, rCampo.y, rCampo.w, rCampo.h);
          } else {
            await clicUi(cap, rYes.x, rYes.y + OFFSET_CAMPO_Y, rYes.w, rYes.h);
          }
          await escribirTexto('yes');
          await espera(400, 700);
          if (SOLO_ESCRIBIR_YES) {
            alarma('yes escrito: pulsa Confirmar tú');
            if (!(await esperarQueDesaparezca('texto-yes'))) return false;
          } else {
            const cap2 = await captura();
            if (!cap2) return false;
            const rBtn = buscar(cap2, 'btn-confirmar', CONF);
            if (rBtn.score < CONF) {
              alarma('no veo el botón Confirmar');
              return false;
            }
            await clicUi(cap2, rBtn.x, rBtn.y, rBtn.w, rBtn.h);
          }
        }
        await espera(800, 1200);
        continue;
      }

      if (visible(cap, 'aviso-titulo')) {
        const rBtn = buscar(cap, 'btn-confirmar', CONF);
        if (rBtn.score < CONF) {
          alarma('Aviso abierto sin botón Confirmar visible');
          return false;
        }
        if (AUTO_AVISO) {
          await clicUi(cap, rBtn.x, rBtn.y, rBtn.w, rBtn.h);
          await espera(800, 1200);
          continue;
        }
        alarma('Aviso: confirma tú');
        if (!(await esperarQueDesaparezca('aviso-titulo'))) return false;
        continue;
      }

      return true;
    }
    return true;
  }

  function orbeMasAlto(cap) {
    for (const n of [5, 4, 3, 2]) {
      const rOn = buscar(cap, 'astro-' + n, CONF);
      if (rOn.score >= CONF) {
        const rOff = buscar(cap, 'astro-' + n + '-off', CONF);
        if (rOn.score > rOff.score + 0.03) {
          return { n, x: rOn.x, y: rOn.y, w: rOn.w, h: rOn.h };
        }
      }
    }
    const a = buscar(cap, 'astro-1', 0.70);
    const b = buscar(cap, 'astro-1-off', 0.70);
    const mejor = a.score >= b.score ? a : b;
    if (mejor.score >= 0.70) {
      return { n: 1, x: mejor.x, y: mejor.y, w: mejor.w, h: mejor.h };
    }
    return null;
  }

  async function ciclo() {
    for (const boton of botonesCiclo) {
      if (parar()) return false;
      const cap = await captura();
      if (!cap) return false;
      const r = buscar(cap, boton, CONF);
      if (r.score >= CONF) {
        await clicUi(cap, r.x, r.y, r.w, r.h);
      } else {
        emitir({ ev: 'aviso', texto: 'no veo ' + boton + ' (' + r.score.toFixed(2) + ')' });
      }
      await espera(800, 1200);
      if (!(await manejarVentanas())) return false;
    }
    return true;
  }

  async function ejecutar() {
    emitir({
      ev: 'inicio',
      cps: Math.round((1000 / intervaloMs) * 100) / 100,
      sintetizarCada,
    });

    let clics = 0;
    let fallos = 0;
    let procMs = 150;
    let avisadoLento = false;
    let tClic = Date.now();
    let motivo = 'terminado';

    try {
      while (!parar()) {
        const objetivo = tClic + intervaloMs + randUniform(-VARIACION_MS, VARIACION_MS) - procMs;
        if (!(await esperarHasta(objetivo))) {
          motivo = motivoParada || 'detenido';
          break;
        }

        const t0 = Date.now();
        let cap = await captura();
        if (!cap) {
          motivo = motivoParada || 'ventana del juego cerrada';
          break;
        }

        if (hayVentana(cap)) {
          if (!(await manejarVentanas())) {
            motivo = motivoParada || 'detenido';
            break;
          }
          tClic = Date.now();
          continue;
        }

        let sPanel = buscar(cap, 'panel-astrales', CONF_PANEL).score;
        if (sPanel < CONF_PANEL) {
          for (let r = 0; r < 6; r++) {
            if (parar()) break;
            await dormir(500);
            cap = await captura();
            if (!cap) break;
            sPanel = buscar(cap, 'panel-astrales', CONF_PANEL).score;
            if (sPanel >= CONF_PANEL) break;
          }
        }
        if (parar()) {
          motivo = motivoParada || 'detenido';
          break;
        }
        if (sPanel < CONF_PANEL) {
          alarma('no veo la ventana de Astrales');
          motivo = 'sin panel de Astrales';
          break;
        }

        const orbe = orbeMasAlto(cap);
        if (!orbe) {
          fallos += 1;
          emitir({ ev: 'aviso', texto: 'ningún orbe encendido (' + fallos + '/' + FALLOS_SEGUIDOS_MAX + ')' });
          if (fallos >= FALLOS_SEGUIDOS_MAX) {
            alarma('sin orbes encendidos: ¿sin oro o ventana distinta?');
            motivo = 'sin orbes encendidos';
            break;
          }
          tClic = Date.now() + 500;
          continue;
        }
        fallos = 0;

        await moverYClic(cap, orbe.x, orbe.y, orbe.w, orbe.h, MOV_ORBE);
        const ahora = Date.now();
        const intervalo = (ahora - tClic) / 1000;
        clics += 1;
        procMs = 0.8 * procMs + 0.2 * (ahora - t0);
        tClic = ahora;
        emitir({
          ev: 'clic',
          n: clics,
          orbe: orbe.n,
          ritmo: intervalo > 0.01 ? Math.round((1 / intervalo) * 100) / 100 : 0,
        });

        if (procMs > intervaloMs && !avisadoLento) {
          emitir({
            ev: 'aviso',
            texto: 'la visión tarda ' + (procMs / 1000).toFixed(2) + 's por vuelta: no se llega a ' + (intervaloMs / 1000).toFixed(2) + 's por clic',
          });
          avisadoLento = true;
        }

        if (clics % sintetizarCada === 0) {
          if (!(await ciclo())) {
            motivo = motivoParada || 'detenido';
            break;
          }
          tClic = Date.now();
        }
      }
    } catch (e) {
      emitir({ ev: 'error', texto: e && e.message ? e.message : 'Error del macro.' });
      motivo = 'error';
    }

    if (detenido && motivo === 'terminado') {
      motivo = motivoParada || 'detenido';
    }
    emitir({ ev: 'fin', motivo });
    if (typeof onFin === 'function') onFin(motivo);
  }

  return {
    iniciar() {
      ejecutar();
    },
    detener(motivo) {
      if (detenido) return;
      detenido = true;
      motivoParada = motivo || 'detenido';
    },
  };
}

module.exports = {
  crearMotorMacro,
};
