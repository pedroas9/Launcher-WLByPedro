'use strict';

const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

function reducirGris(bgra, w, h, f) {
  const dw = Math.floor(w / f);
  const dh = Math.floor(h / f);
  const out = new Float32Array(dw * dh);
  const inv = 1 / (f * f);
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * f;
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * f;
      let sum = 0;
      for (let ky = 0; ky < f; ky++) {
        let idx = ((y0 + ky) * w + x0) * 4;
        for (let kx = 0; kx < f; kx++) {
          sum += bgra[idx] * 0.114 + bgra[idx + 1] * 0.587 + bgra[idx + 2] * 0.299;
          idx += 4;
        }
      }
      out[dy * dw + dx] = sum * inv;
    }
  }
  return { data: out, w: dw, h: dh };
}

function prepararPlantilla(bgra, w, h) {
  const f = Math.min(w, h) >= 40 ? 4 : 2;
  const small = reducirGris(bgra, w, h, f);
  const sn = small.w * small.h;
  let smean = 0;
  for (let i = 0; i < sn; i++) smean += small.data[i];
  smean /= sn;
  let snorm2 = 0;
  for (let i = 0; i < sn; i++) {
    const d = small.data[i] - smean;
    small.data[i] = d;
    snorm2 += d * d;
  }

  const n = w * h;
  let m0 = 0;
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    m0 += bgra[k];
    m1 += bgra[k + 1];
    m2 += bgra[k + 2];
  }
  m0 /= n;
  m1 /= n;
  m2 /= n;

  const full = new Float32Array(n * 3);
  let norm2 = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    const t = i * 3;
    const b = bgra[k] - m0;
    const g = bgra[k + 1] - m1;
    const r = bgra[k + 2] - m2;
    full[t] = b;
    full[t + 1] = g;
    full[t + 2] = r;
    norm2 += b * b + g * g + r * r;
  }

  return {
    w,
    h,
    f,
    small,
    snorm: Math.sqrt(snorm2),
    full,
    norm: Math.sqrt(norm2),
  };
}

function nccCompleto(cap, cw, tpl, x, y) {
  const tw = tpl.w;
  const th = tpl.h;
  const full = tpl.full;
  const n = tw * th;
  let dot = 0;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  let ti = 0;
  for (let j = 0; j < th; j++) {
    let ci = ((y + j) * cw + x) * 4;
    for (let i = 0; i < tw; i++) {
      const b = cap[ci];
      const g = cap[ci + 1];
      const r = cap[ci + 2];
      dot += b * full[ti] + g * full[ti + 1] + r * full[ti + 2];
      s0 += b;
      s1 += g;
      s2 += r;
      q0 += b * b;
      q1 += g * g;
      q2 += r * r;
      ci += 4;
      ti += 3;
    }
  }
  const v = (q0 - (s0 * s0) / n) + (q1 - (s1 * s1) / n) + (q2 - (s2 * s2) / n);
  if (v <= 1e-6 || tpl.norm <= 1e-6) return 0;
  return dot / (tpl.norm * Math.sqrt(v));
}

function refinarAlrededor(cap, cw, ch, tpl, cx, cy, radio) {
  let best = -1;
  let bx = cx;
  let by = cy;
  const x0 = Math.max(0, cx - radio);
  const x1 = Math.min(cw - tpl.w, cx + radio);
  const y0 = Math.max(0, cy - radio);
  const y1 = Math.min(ch - tpl.h, cy + radio);

  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const s = nccCompleto(cap, cw, tpl, x, y);
      if (s > best) {
        best = s;
        bx = x;
        by = y;
      }
    }
  }

  const fx0 = Math.max(0, bx - 1);
  const fx1 = Math.min(cw - tpl.w, bx + 1);
  const fy0 = Math.max(0, by - 1);
  const fy1 = Math.min(ch - tpl.h, by + 1);
  for (let y = fy0; y <= fy1; y++) {
    for (let x = fx0; x <= fx1; x++) {
      const s = nccCompleto(cap, cw, tpl, x, y);
      if (s > best) {
        best = s;
        bx = x;
        by = y;
      }
    }
  }

  return { score: best, x: bx, y: by };
}

function crearVisor(carpeta) {
  const cache = new Map();
  const ultimasPos = new Map();

  function cargarPlantilla(nombre) {
    if (cache.has(nombre)) return cache.get(nombre);
    const ruta = path.join(carpeta, nombre + '.png');
    if (!fs.existsSync(ruta)) {
      throw new Error('Falta ' + nombre + '.png en ' + carpeta);
    }
    const img = nativeImage.createFromPath(ruta);
    if (img.isEmpty()) {
      throw new Error('No se pudo leer ' + nombre + '.png en ' + carpeta);
    }
    const { width, height } = img.getSize();
    const bgra = img.toBitmap();
    const tpl = prepararPlantilla(bgra, width, height);
    cache.set(nombre, tpl);
    return tpl;
  }

  function prepararCaptura(img, scaleFactor) {
    const dip = img.getSize();
    const bmp = img.toBitmap();
    const totalPx = bmp.length / 4;
    let w = dip.width;
    let h = dip.height;
    if (w * h !== totalPx && dip.width > 0) {
      w = Math.round(dip.width * (scaleFactor || 1));
      h = w > 0 ? Math.round(totalPx / w) : dip.height;
      if (w * h !== totalPx) {
        const factor = Math.sqrt(totalPx / (dip.width * dip.height));
        w = Math.round(dip.width * factor);
        h = Math.round(totalPx / w);
      }
    }
    return {
      bmp,
      w,
      h,
      dipW: dip.width,
      dipH: dip.height,
      g2: null,
      g4: null,
    };
  }

  function buscar(cap, nombre, umbralRapido) {
    const tpl = cargarPlantilla(nombre);
    if (cap.h < tpl.h || cap.w < tpl.w) {
      return { score: 0, x: 0, y: 0, w: tpl.w, h: tpl.h };
    }

    const prev = ultimasPos.get(nombre);
    if (prev && prev.x <= cap.w - tpl.w && prev.y <= cap.h - tpl.h) {
      const r = refinarAlrededor(cap.bmp, cap.w, cap.h, tpl, prev.x, prev.y, 10);
      if (r.score >= (umbralRapido || 0.70)) {
        ultimasPos.set(nombre, { x: r.x, y: r.y });
        return {
          score: r.score,
          x: r.x + Math.floor(tpl.w / 2),
          y: r.y + Math.floor(tpl.h / 2),
          w: tpl.w,
          h: tpl.h,
        };
      }
    }

    let cg;
    if (tpl.f === 4) {
      if (!cap.g4) cap.g4 = reducirGris(cap.bmp, cap.w, cap.h, 4);
      cg = cap.g4;
    } else {
      if (!cap.g2) cap.g2 = reducirGris(cap.bmp, cap.w, cap.h, 2);
      cg = cap.g2;
    }

    const sw = tpl.small.w;
    const sh = tpl.small.h;
    const sd = tpl.small.data;
    const sn = sw * sh;
    const maxX = cg.w - sw;
    const maxY = cg.h - sh;
    const paso = tpl.f === 4 ? 1 : 2;
    const top = [];

    for (let y = 0; y <= maxY; y += paso) {
      for (let x = 0; x <= maxX; x += paso) {
        let dot = 0;
        let sum = 0;
        let sq = 0;
        let ti = 0;
        for (let j = 0; j < sh; j++) {
          let ci = (y + j) * cg.w + x;
          for (let i = 0; i < sw; i++) {
            const v = cg.data[ci++];
            dot += v * sd[ti++];
            sum += v;
            sq += v * v;
          }
        }
        const denom = sq - (sum * sum) / sn;
        const sc = denom > 1e-6 && tpl.snorm > 1e-6 ? dot / (tpl.snorm * Math.sqrt(denom)) : 0;
        if (top.length < 4 || sc > top[top.length - 1].sc) {
          top.push({ x, y, sc });
          top.sort((a, b) => b.sc - a.sc);
          if (top.length > 4) top.pop();
        }
      }
    }

    let best = -1;
    let bx = 0;
    let by = 0;
    const radio = tpl.f * paso + 2;
    for (const c of top) {
      const r = refinarAlrededor(cap.bmp, cap.w, cap.h, tpl, c.x * tpl.f, c.y * tpl.f, radio);
      if (r.score > best) {
        best = r.score;
        bx = r.x;
        by = r.y;
      }
      if (best >= 0.85) break;
    }

    if (best >= 0.65) {
      ultimasPos.set(nombre, { x: bx, y: by });
    }

    return {
      score: best,
      x: bx + Math.floor(tpl.w / 2),
      y: by + Math.floor(tpl.h / 2),
      w: tpl.w,
      h: tpl.h,
    };
  }

  return {
    prepararCaptura,
    buscar,
  };
}

module.exports = {
  crearVisor,
};
