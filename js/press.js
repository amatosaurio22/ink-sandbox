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
    settings: { ink: '#ffffff', ground: '#0a0a0b', gloss: 0.6 },
  };
}

const SOFT = 0.25;
const SHARP = 0.5;
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
}

// specData: the field traced at a higher iso, i.e. where the ink pools deepest.
export function print(press, pathData, specData) {
  const { ctx, dpr, settings } = press;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = settings.ground;
  ctx.fillRect(0, 0, press.width, press.height);
  if (!pathData) return;
  const ink = new Path2D(pathData);
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

// One compound path, even-odd, so bubbles and gaps stay real holes in Figma or Illustrator.
export function exportSVG(press, pathData, meta) {
  const { width: w, height: h, settings } = press;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <metadata>${JSON.stringify(meta).replace(/</g, '\\u003c')}</metadata>
  <path fill="${settings.ink}" fill-rule="evenodd" d="${pathData}"/>
</svg>
`;
  download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `ink-sandbox-${stamp()}.svg`);
}

export function exportPNG(press) {
  press.canvas.toBlob((blob) => blob && download(blob, `ink-sandbox-${stamp()}.png`), 'image/png');
}
