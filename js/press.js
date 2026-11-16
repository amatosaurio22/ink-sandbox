// Rendering: one ink on one ground, the technical overlay, the tool cursors,
// and the SVG/PNG output.

import { GRID } from './ink.js';

// Ink / ground pairings. `light` marks a pale ground so the interface can flip.
export const PALETTES = [
  { id: 'white', ink: '#ffffff', ground: '#0a0a0b', light: false },
  { id: 'black', ink: '#0a0a0b', ground: '#f2f2ee', light: true },
  { id: 'acid', ink: '#d4ff00', ground: '#0a0a0b', light: false },
  { id: 'vermilion', ink: '#ff3300', ground: '#0a0a0b', light: false },
  { id: 'klein', ink: '#0038ff', ground: '#f2f2ee', light: true },
  // Liquid metal reflecting a desert. `ink` is the flat colour the SVG falls back to.
  { id: 'chrome', ink: '#e6cfae', ground: '#0d0a08', light: false, finish: 'chrome' },
];

export function createPress(canvas) {
  return {
    canvas,
    ctx: canvas.getContext('2d'),
    width: 0,
    height: 0,
    dpr: 1,
    // Gloss is painted on low-resolution layers; upscaling them is the blur.
    soft: document.createElement('canvas'),
    sharp: document.createElement('canvas'),
    metal: document.createElement('canvas'),
    metalPixels: null,
    settings: { ink: '#e6cfae', ground: '#0d0a08', gloss: 0.6, finish: 'chrome' },
  };
}

const SOFT = 0.25;
const SHARP = 0.5;
const METAL = 1;
// Light comes from the upper left.
const LIGHT = { x: -0.6, y: -0.8 };

export function resizePress(press, width, height) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  press.width = width;
  press.height = height;
  press.dpr = dpr;
  press.canvas.width = Math.round(width * dpr);
  press.canvas.height = Math.round(height * dpr);
  press.canvas.style.width = `${width}px`;
  press.canvas.style.height = `${height}px`;
  press.soft.width = Math.ceil(width * SOFT);
  press.soft.height = Math.ceil(height * SOFT);
  press.sharp.width = Math.ceil(width * SHARP);
  press.sharp.height = Math.ceil(height * SHARP);
  press.metal.width = Math.ceil(width * METAL);
  press.metal.height = Math.ceil(height * METAL);
  press.metalPixels = null;
}

// specData: the field traced at a higher iso, i.e. where the ink pools deepest.
// field: the ink simulation, which the chrome finish reads its relief from.
export function print(press, pathData, specData, field) {
  const { ctx, dpr, settings } = press;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = settings.ground;
  ctx.fillRect(0, 0, press.width, press.height);
  if (!pathData) return;
  const ink = new Path2D(pathData);
  if (settings.finish === 'chrome' && field) {
    chrome(press, ink, field);
    return;
  }
  ctx.fillStyle = settings.gloss > 0.01 ? bodyTone(settings) : settings.ink;
  ctx.fill(ink, 'evenodd');
  if (settings.gloss > 0.01) gloss(press, ink, specData ? new Path2D(specData) : null);
}

// A pale ink leaves no headroom for highlights, so with gloss on its body is
// dimmed a touch towards the ground and the rim and pools paint back up to white.
function bodyTone({ ink, ground, gloss }) {
  const a = hexRGB(ink);
  const lum = (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255;
  if (lum < 0.8) return ink;
  const b = hexRGB(ground);
  const k = 0.06 * gloss;
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

// ---------- desert chrome ----------

// The environment the metal reflects, by elevation: sky above the horizon,
// dunes below it, the horizon itself a hard cream line.
const SKY = [[0, [255, 250, 238]], [0.08, [250, 232, 204]], [0.3, [222, 204, 190]], [0.6, [140, 160, 192]], [1, [70, 98, 146]]];
const DUNES = [[0, [22, 13, 8]], [0.16, [52, 29, 16]], [0.4, [138, 80, 40]], [0.7, [214, 146, 84]], [1, [252, 214, 160]]];

function ramp(stops, t, out) {
  let i = 1;
  while (i < stops.length - 1 && t > stops[i][0]) i++;
  const [t0, a] = stops[i - 1];
  const [t1, b] = stops[i];
  const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
}

// The field read as a height map: steep where the ink falls away at its edges
// and around bubbles, nearly flat where it pools. Each pixel's surface normal
// picks what it reflects, like a matcap, so the horizon bends over every shape.
function chrome(press, ink, field) {
  const { ctx, metal, width, height, settings } = press;
  const { cols, rows, field: F, time } = field;
  const mw = metal.width;
  const mh = metal.height;
  const m = metal.getContext('2d');
  if (!press.metalPixels) press.metalPixels = m.createImageData(mw, mh);
  const px = press.metalPixels.data;
  px.fill(0);

  // Height per grid point, then its slope.
  const n = cols * rows;
  if (!field.h || field.h.length !== n) {
    field.h = new Float32Array(n);
    field.tmp = new Float32Array(n);
    field.gx = new Float32Array(n);
    field.gy = new Float32Array(n);
  }
  const { h, tmp, gx, gy } = field;
  for (let i = 0; i < n; i++) h[i] = F[i] / (F[i] + 1.1);
  // Smooth the relief so the edge noise moves the outline without roughening the metal.
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 0; r < rows; r++) {
      const o = r * cols;
      for (let c = 1; c < cols - 1; c++) tmp[o + c] = (h[o + c - 1] + 2 * h[o + c] + h[o + c + 1]) * 0.25;
    }
    for (let r = 1; r < rows - 1; r++) {
      const o = r * cols;
      for (let c = 1; c < cols - 1; c++) h[o + c] = (tmp[o + c - cols] + 2 * tmp[o + c] + tmp[o + c + cols]) * 0.25;
    }
  }
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      gx[i] = (h[i + 1] - h[i - 1]) / (2 * GRID);
      gy[i] = (h[i + cols] - h[i - cols]) / (2 * GRID);
    }
  }

  const relief = 70 + 110 * settings.gloss;
  const drift = Math.sin(time * 0.6) * 0.04;
  const col = [0, 0, 0];
  const low = [0, 0, 0];
  for (let y = 0; y < mh; y++) {
    const v = (y + 0.5) / METAL / GRID;
    const r0 = Math.floor(v);
    if (r0 < 1 || r0 >= rows - 2) continue;
    const fy = v - r0;
    for (let x = 0; x < mw; x++) {
      const u = (x + 0.5) / METAL / GRID;
      const c0 = Math.floor(u);
      if (c0 < 1 || c0 >= cols - 2) continue;
      const i = r0 * cols + c0;
      if (F[i] < 0.25 && F[i + 1] < 0.25 && F[i + cols] < 0.25 && F[i + cols + 1] < 0.25) continue;
      const fx = u - c0;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const sx = (gx[i] * w00 + gx[i + 1] * w10 + gx[i + cols] * w01 + gx[i + cols + 1] * w11) * relief;
      const sy = (gy[i] * w00 + gy[i + 1] * w10 + gy[i + cols] * w01 + gy[i + cols + 1] * w11) * relief;
      const len = Math.sqrt(sx * sx + sy * sy + 1);
      const nx = -sx / len;
      const ny = -sy / len;

      // Elevation of what this point reflects: up-facing sees sky, down-facing sees dunes.
      const e = -ny * 1.15 + 0.16 + nx * 0.08 + drift;
      // Sky and dunes meet at a hard but antialiased horizon.
      ramp(SKY, Math.max(0, e), col);
      ramp(DUNES, Math.max(0, -e) * 1.4, low);
      const k = Math.min(1, Math.max(0, (e + 0.03) / 0.06));
      col[0] = low[0] + (col[0] - low[0]) * k;
      col[1] = low[1] + (col[1] - low[1]) * k;
      col[2] = low[2] + (col[2] - low[2]) * k;

      // The sun, low over the horizon on the left.
      const dx = nx + 0.42;
      const de = e - 0.22;
      const sun = Math.exp(-(dx * dx + de * de) * 90);
      // Grazing edges catch more light (a little Fresnel).
      const rim = (1 - 1 / len) * 0.35;

      const o = (y * mw + x) * 4;
      px[o] = Math.min(255, col[0] + (255 - col[0]) * (sun + rim * 0.5));
      px[o + 1] = Math.min(255, col[1] + (255 - col[1]) * (sun * 0.95 + rim * 0.4));
      px[o + 2] = Math.min(255, col[2] + (255 - col[2]) * (sun * 0.8 + rim * 0.3));
      px[o + 3] = 255;
    }
  }
  m.putImageData(press.metalPixels, 0, 0);

  ctx.save();
  ctx.clip(ink, 'evenodd');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(metal, 0, 0, width, height);
  ctx.restore();
}

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Wet-ink gloss, all of it derived from the same contour, so it follows every
// merge, bridge and bubble: a soft shadow along the edges turned away from the
// light, a thin lit rim on the edges facing it, and specular pools where the
// ink is thickest (the drops' cores, shifted towards the light).
function gloss(press, ink, spec) {
  const { ctx, settings, width, height } = press;
  const g = settings.gloss;

  const crescent = (layer, scale, color, shift, alpha) => {
    const l = layer.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, layer.width, layer.height);
    l.setTransform(scale, 0, 0, scale, 0, 0);
    l.fillStyle = color;
    l.fill(ink, 'evenodd');
    l.globalCompositeOperation = 'destination-out';
    l.translate(shift.x, shift.y);
    l.fill(ink, 'evenodd');
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, 0, 0, width, height);
  };

  ctx.save();
  ctx.clip(ink, 'evenodd');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Shadow: ink minus itself pushed towards the light leaves the far rim.
  crescent(press.soft, SOFT, '#000', { x: LIGHT.x * 11, y: LIGHT.y * 11 }, 0.3 * g);
  // Lit rim: ink minus itself pushed away from the light leaves the near rim.
  crescent(press.sharp, SHARP, '#fff', { x: -LIGHT.x * 3.5, y: -LIGHT.y * 3.5 }, 0.5 * g);

  if (spec) {
    const l = press.sharp.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, press.sharp.width, press.sharp.height);
    l.setTransform(SHARP, 0, 0, SHARP, LIGHT.x * 9 * SHARP, LIGHT.y * 9 * SHARP);
    l.fillStyle = '#fff';
    l.fill(spec, 'evenodd');
    // Pull the pools in from their own edges so they read as reflections, not outlines.
    l.globalCompositeOperation = 'destination-out';
    l.translate(-LIGHT.x * 6, -LIGHT.y * 6);
    l.fill(spec, 'evenodd');
    ctx.globalAlpha = 0.75 * g;
    ctx.drawImage(press.sharp, 0, 0, width, height);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawGuides(press, ink, color, accent) {
  const { ctx } = press;
  const { drops, bubbles } = ink;
  ctx.save();
  ctx.lineWidth = 1;

  // The sampling grid the contours are traced on, shown as it is.
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  for (let y = 0; y < press.height; y += GRID * 4) {
    for (let x = 0; x < press.width; x += GRID * 4) ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
  }

  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  for (let i = 0; i < drops.length; i++) {
    const a = drops[i];
    for (let j = i + 1; j < drops.length; j++) {
      const b = drops[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 1.65) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
  }
  ctx.stroke();

  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color;
  for (const p of drops) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.moveTo(p.ax, p.ay);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = accent;
  for (const b of bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCursor(press, tool, x, y, size, colors) {
  const { ctx } = press;
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  if (tool === 'drop') {
    ctx.strokeStyle = colors.accent;
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
  } else if (tool === 'air') {
    ctx.strokeStyle = colors.line;
    ctx.setLineDash([2, 4]);
    ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.moveTo(x + 11, y - 8);
    ctx.arc(x + 9, y - 8, 2, 0, Math.PI * 2);
  } else if (tool === 'stir') {
    ctx.strokeStyle = colors.line;
    ctx.setLineDash([3, 4]);
    ctx.arc(x, y, size * 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
  } else {
    ctx.strokeStyle = colors.danger;
    ctx.arc(x, y, size * 1.25, 0, Math.PI * 2);
    ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5);
    ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5);
  }
  ctx.stroke();
  ctx.restore();
}

// ---------- output ----------

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A flat stand-in for the chrome in vector form: sky, horizon, dunes.
const CHROME_SVG = `  <defs>
    <linearGradient id="desert-chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#607aa0"/><stop offset="0.3" stop-color="#d6c6ba"/>
      <stop offset="0.5" stop-color="#fff6e4"/><stop offset="0.52" stop-color="#26160e"/>
      <stop offset="0.7" stop-color="#a86636"/><stop offset="1" stop-color="#f8d29c"/>
    </linearGradient>
  </defs>
`;

// One compound path, even-odd, so bubbles and gaps stay real holes in Figma or Illustrator.
export function exportSVG(press, pathData, meta) {
  const { width: w, height: h, settings } = press;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <metadata>${JSON.stringify(meta).replace(/</g, '\\u003c')}</metadata>
${settings.finish === 'chrome' ? CHROME_SVG : ''}  <path fill="${settings.finish === 'chrome' ? 'url(#desert-chrome)' : settings.ink}" fill-rule="evenodd" d="${pathData}"/>
</svg>
`;
  download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `ink-sandbox-${stamp()}.svg`);
}

export function exportPNG(press) {
  press.canvas.toBlob((blob) => blob && download(blob, `ink-sandbox-${stamp()}.png`), 'image/png');
}
