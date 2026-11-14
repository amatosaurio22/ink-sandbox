// Ink simulation: drops anchored to the paper, local cohesion between neighbours,
// and the metaball scalar field the contours are traced from.

import { noise3 } from './noise.js';

export const MAX_DROPS = 1000;
export const GRID = 8; // px between field samples

const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

export class Drop {
  constructor(x, y, r, ax = x, ay = y, seed = rand(1000)) {
    this.x = x;
    this.y = y;
    this.ax = ax; // anchor: where the drop landed; it always springs back here
    this.ay = ay;
    this.vx = 0;
    this.vy = 0;
    this.baseR = r;
    this.r = r;
    this.seed = seed;
  }

  clone() {
    const d = new Drop(this.x, this.y, this.baseR, this.ax, this.ay, this.seed);
    d.vx = this.vx;
    d.vy = this.vy;
    return d;
  }
}

// An air bubble trapped in the ink: it carves a hole in the field and
// shoulders the surrounding drops aside, so the ink thickens around it.
export class Bubble {
  constructor(x, y, r, seed = rand(1000)) {
    this.x = x;
    this.y = y;
    this.baseR = r;
    this.r = r;
    this.seed = seed;
  }

  clone() {
    return new Bubble(this.x, this.y, this.baseR, this.seed);
  }
}

export const MAX_BUBBLES = 240;

export function createInk() {
  return {
    drops: [],
    bubbles: [],
    params: {
      cohesion: 0.6, // 0..1  how hard neighbours pull together
      bloat: 0.1, // -0.35..1.1  radius inflation and liquid bridges
      noise: 0.16, // 0..1  organic wobble on the edge
      anchor: 0.7, // 0.15..1  how firmly drops remember where they landed
    },
    time: 0,
    cols: 0,
    rows: 0,
    field: new Float32Array(0),
  };
}

export function resizeField(ink, width, height) {
  ink.cols = Math.ceil(width / GRID) + 1;
  ink.rows = Math.ceil(height / GRID) + 1;
  ink.field = new Float32Array(ink.cols * ink.rows);
}

const bloatScale = (p) => Math.max(0.35, 1 + p.bloat * 0.75);

export function applyBloat(ink) {
  const s = bloatScale(ink.params);
  for (const d of ink.drops) d.r = d.baseR * s;
  // Bubbles breathe a little, out of phase with each other.
  const breathe = ink.params.noise * 0.08;
  for (const b of ink.bubbles) b.r = b.baseR * (1 + Math.sin(ink.time * 3.1 + b.seed) * breathe);
}

// Metaball kernel shared by the grid and by point queries.
function kernel(params) {
  const bridge = 1.55 + params.cohesion * 0.65 + Math.max(0, params.bloat * 0.25);
  return { bridge, norm: 1 / Math.pow(1 - 1 / (bridge * bridge), 3) };
}

// Ink density at one point, ignoring bubbles and noise (1 = on the contour).
export function densityAt(ink, x, y) {
  const { bridge, norm } = kernel(ink.params);
  let v = 0;
  for (const p of ink.drops) {
    const R = p.r * bridge;
    const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (d2 < R * R) {
      const f = 1 - d2 / (R * R);
      v += f * f * f * norm;
    }
  }
  return v;
}

export function step(ink, dt = 1) {
  const { drops, params } = ink;
  const n = drops.length;
  ink.time += 0.012 * dt;
  applyBloat(ink);
  if (n === 0) return;

  const k = params.cohesion;

  // 1. Local cohesion: near neighbours pull a few pixels together, never the whole drawing.
  for (let i = 0; i < n; i++) {
    const a = drops[i];
    for (let j = i + 1; j < n; j++) {
      const b = drops[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const sumR = a.r + b.r;
      const range = sumR * (1.25 + k * 0.95);
      if (d2 > range * range || d2 < 0.0001) continue;

      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const rest = sumR * 0.62;

      if (d > rest) {
        const t = (d - rest) / (range - rest);
        const pull = k * 0.42 * Math.sin(t * Math.PI) * 1.6;
        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const m = ma + mb;
        a.vx += nx * pull * (mb / m);
        a.vy += ny * pull * (mb / m);
        b.vx -= nx * pull * (ma / m);
        b.vy -= ny * pull * (ma / m);
      } else {
        // Soft core repulsion keeps the stroke from collapsing into a dot.
        const push = ((rest - d) / rest) * 0.32;
        a.vx -= nx * push;
        a.vy -= ny * push;
        b.vx += nx * push;
        b.vy += ny * push;
      }
    }
  }

  // 2. Anchor spring + leash: the ink never runs down the page or wanders off.
  const t = (params.anchor - 0.15) / 0.85;
  const spring = 0.025 + t * (0.22 - 0.025);
  const leash = 55 + t * (14 - 55);

  for (const p of drops) {
    p.vx += (p.ax - p.x) * spring;
    p.vy += (p.ay - p.y) * spring;

    if (params.noise > 0.01) {
      // Zero-mean oscillation: alive, but no drift.
      p.vx += Math.sin(ink.time * 2.2 + p.seed) * params.noise * 0.08;
      p.vy += Math.cos(ink.time * 1.9 + p.seed * 1.37) * params.noise * 0.08;
    }

    p.vx *= 0.75;
    p.vy *= 0.75;
    p.x += p.vx;
    p.y += p.vy;

    const ox = p.x - p.ax;
    const oy = p.y - p.ay;
    const od = Math.sqrt(ox * ox + oy * oy);
    if (od > leash) {
      p.x = p.ax + (ox / od) * leash;
      p.y = p.ay + (oy / od) * leash;
      p.vx *= 0.3;
      p.vy *= 0.3;
    }
  }

  displaceAroundBubbles(ink);
}

// 3. Air pressure: drops inside a bubble are pushed to its rim, and their anchors
// follow a little, so the ink makes lasting room for the air.
function displaceAroundBubbles(ink) {
  for (const b of ink.bubbles) {
    for (const p of ink.drops) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const reach = b.r + p.r * 0.35;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2);
      const nx = d > 0.01 ? dx / d : Math.cos(p.seed);
      const ny = d > 0.01 ? dy / d : Math.sin(p.seed);
      const push = ((reach - d) / reach) * 2.2;
      p.vx += nx * push;
      p.vy += ny * push;
      p.ax += nx * push * 0.18;
      p.ay += ny * push * 0.18;
    }
  }
}

// Metaball field (Wyvill falloff) plus unbiased edge noise, then bubbles carved out.
export function computeField(ink) {
  const { drops, params, cols, rows, field } = ink;
  field.fill(0);
  if (drops.length === 0) return;

  const { bridge, norm } = kernel(params);

  for (const p of drops) {
    const R = p.r * bridge;
    const R2 = R * R;
    const inv = 1 / R2;
    const c0 = Math.max(1, Math.floor((p.x - R) / GRID));
    const c1 = Math.min(cols - 2, Math.ceil((p.x + R) / GRID));
    const r0 = Math.max(1, Math.floor((p.y - R) / GRID));
    const r1 = Math.min(rows - 2, Math.ceil((p.y + R) / GRID));

    for (let r = r0; r <= r1; r++) {
      const dy = r * GRID - p.y;
      const dy2 = dy * dy;
      const off = r * cols;
      for (let c = c0; c <= c1; c++) {
        const dx = c * GRID - p.x;
        const d2 = dx * dx + dy2;
        if (d2 < R2) {
          const f = 1 - d2 * inv;
          field[off + c] += f * f * f * norm;
        }
      }
    }
  }

  if (params.noise > 0.005) {
    const amp = params.noise * 1.15;
    const t = ink.time * 1.1;
    for (let r = 1; r < rows - 1; r++) {
      const off = r * cols;
      const gy = r * GRID;
      for (let c = 1; c < cols - 1; c++) {
        const v = field[off + c];
        if (v > 0.18 && v < 2.6) {
          const gx = c * GRID;
          const n1 = Math.sin((noise3(gx * 0.014, gy * 0.014, t) - 0.5) * 9) * 0.45;
          const n2 = Math.cos((noise3(gx * 0.038 + 77, gy * 0.038 + 33, t * 1.5) - 0.5) * 9) * 0.22;
          field[off + c] = Math.max(0, v + (n1 + n2) * amp * v);
        }
      }
    }
  }

  carveBubbles(ink);
}

// Each bubble multiplies the field by a smooth radial mask: zero at its heart,
// one past its rim. The contour lands near the rim whatever the ink's density,
// and the smoothstep gives the meniscus its soft shoulder.
function carveBubbles(ink) {
  const { bubbles, cols, rows, field } = ink;
  for (const b of bubbles) {
    const inner = b.r * 0.75;
    const outer = b.r * 1.3;
    const span = outer - inner;
    const c0 = Math.max(0, Math.floor((b.x - outer) / GRID));
    const c1 = Math.min(cols - 1, Math.ceil((b.x + outer) / GRID));
    const r0 = Math.max(0, Math.floor((b.y - outer) / GRID));
    const r1 = Math.min(rows - 1, Math.ceil((b.y + outer) / GRID));
    for (let r = r0; r <= r1; r++) {
      const dy = r * GRID - b.y;
      const off = r * cols;
      for (let c = c0; c <= c1; c++) {
        const d = Math.hypot(c * GRID - b.x, dy);
        if (d >= outer) continue;
        const t = Math.max(0, (d - inner) / span);
        field[off + c] *= t * t * (3 - 2 * t);
      }
    }
  }
}

// ---------- tools ----------

export function addDrop(ink, x, y, r) {
  if (ink.drops.length >= MAX_DROPS) return false;
  ink.drops.push(new Drop(x, y, r));
  // Fresh ink poured on a bubble fills it.
  if (ink.bubbles.length) ink.bubbles = ink.bubbles.filter((b) => Math.hypot(b.x - x, b.y - y) > r * 0.6);
  return true;
}

// ---------- air ----------

// Air only gets trapped where there is ink to trap it.
export const canHoldAir = (ink, x, y) => densityAt(ink, x, y) > 1.15;

function addBubble(ink, x, y, r) {
  if (ink.bubbles.length >= MAX_BUBBLES || !canHoldAir(ink, x, y)) return null;
  const b = new Bubble(x, y, r);
  ink.bubbles.push(b);
  return b;
}

// A puff: one bubble, sometimes a couple of tiny ones escaping beside it.
export function blow(ink, x, y, size) {
  const b = addBubble(ink, x, y, size * rand(0.42, 0.5));
  if (b && Math.random() < 0.5) {
    for (let i = 0; i < 2; i++) {
      const a = rand(Math.PI * 2);
      const d = b.r * rand(1.4, 2);
      addBubble(ink, x + Math.cos(a) * d, y + Math.sin(a) * d, rand(5, 8));
    }
  }
  return b;
}

// Holding still inflates the bubble under the pointer; dragging leaves a trail of foam.
export function airDrag(ink, x, y, px, py, size, current) {
  const speed = Math.hypot(x - px, y - py);
  if (speed > 7) {
    const steps = Math.min(4, Math.ceil(speed / (size * 0.5)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      addBubble(ink, px + (x - px) * t + rand(-4, 4), py + (y - py) * t + rand(-4, 4), Math.max(6, size * rand(0.18, 0.34)));
    }
    if (Math.random() < 0.3) addBubble(ink, x + rand(-size, size), y + rand(-size, size), rand(5, 8));
    return null;
  }
  const b = current && ink.bubbles.includes(current) ? current : blow(ink, x, y, size);
  if (b) b.baseR = Math.min(size * 1.8, b.baseR + 0.45);
  return b;
}

// A bubble whose ink has gone (erased, stirred away) has nothing left to hold it.
export function popStrayBubbles(ink) {
  if (!ink.bubbles.length) return;
  ink.bubbles = ink.bubbles.filter((b) => densityAt(ink, b.x, b.y) > 0.6);
}

export function dropAt(ink, x, y, size) {
  addDrop(ink, x, y, size * rand(0.95, 1.06));
  if (Math.random() < 0.3) {
    const a = rand(Math.PI * 2);
    const d = size * rand(1, 1.5);
    addDrop(ink, x + Math.cos(a) * d, y + Math.sin(a) * d, size * rand(0.3, 0.45));
  }
}

// Continuous dropper: trail while moving, swell the puddle while holding still.
export function dropperDrag(ink, x, y, px, py, size, holdFrames) {
  const speed = Math.hypot(x - px, y - py);
  if (speed > 6) {
    const steps = Math.min(5, Math.ceil(speed / (size * 0.45)));
    const shrink = 1 - (Math.min(speed, 55) / 55) * 0.38;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      addDrop(ink, px + (x - px) * t + rand(-2.5, 2.5), py + (y - py) * t + rand(-2.5, 2.5), size * shrink * rand(0.9, 1.1));
    }
    if (speed > 24 && Math.random() < 0.35) {
      const a = rand(Math.PI * 2);
      const d = size * rand(0.9, 1.85);
      addDrop(ink, x + Math.cos(a) * d, y + Math.sin(a) * d, rand(8, Math.max(11, size * 0.35)));
    }
  } else if (holdFrames % 5 === 0) {
    const hit = ink.drops.find((p) => Math.hypot(x - p.x, y - p.y) < size * 0.65);
    if (hit) hit.baseR = Math.min(95, Math.hypot(hit.baseR, size * 0.28));
    else addDrop(ink, x + rand(-3, 3), y + rand(-3, 3), size * rand(0.88, 1.06));
  }
}

// Stir moves drops and their anchors, so they stay where you push them.
export function stir(ink, x, y, dx, dy, size) {
  const R = size * 2.2;
  for (const p of ink.drops) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < R) {
      const f = Math.pow(1 - d / R, 1.5) * 0.9;
      p.x += dx * f;
      p.y += dy * f;
      p.ax += dx * f;
      p.ay += dy * f;
    }
  }
  for (const b of ink.bubbles) {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d < R) {
      const f = Math.pow(1 - d / R, 1.5) * 0.9;
      b.x += dx * f;
      b.y += dy * f;
    }
  }
}

export function erase(ink, x, y, size) {
  const R = size * 1.25;
  const before = ink.drops.length + ink.bubbles.length;
  ink.drops = ink.drops.filter((p) => Math.hypot(x - p.x, y - p.y) > R);
  ink.bubbles = ink.bubbles.filter((b) => Math.hypot(x - b.x, y - b.y) > R);
  return before !== ink.drops.length + ink.bubbles.length;
}

export function mutate(ink, width, height) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  for (const p of ink.drops) {
    p.ax = clamp(p.ax + rand(-10, 10), 40, width - 40);
    p.ay = clamp(p.ay + rand(-10, 10), 40, height - 40);
    p.baseR = clamp(p.baseR * rand(0.84, 1.2), 10, 82);
    p.seed = rand(1000);
  }
  const extra = Math.floor(rand(4, 9));
  for (let i = 0; i < extra && ink.drops.length; i++) {
    const host = ink.drops[Math.floor(rand(ink.drops.length))];
    const a = rand(Math.PI * 2);
    const d = host.r * rand(1, 1.75);
    addDrop(ink, clamp(host.ax + Math.cos(a) * d, 50, width - 50), clamp(host.ay + Math.sin(a) * d, 50, height - 50), rand(12, 24));
  }
}

// A demonstration print: a swelling stroke that ends in a puddle, a second
// puddle bridged to it, and loose satellites, so fusion is visible at a glance.
export function sampleCluster(ink, width, height) {
  ink.drops = [];
  ink.bubbles = [];
  const narrow = width < 720;
  const u = Math.min(width, height) * (narrow ? 0.5 : 0.38); // composition unit
  const cx = width * 0.5;
  const cy = height * (narrow ? 0.3 : 0.36); // above the bottom sheet on phones
  const s = u / 340; // radius scale

  // Stroke: an S-curve, thin at the tail, swelling towards the puddle.
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = cx - u * 0.95 + t * u * 1.35;
    const y = cy + Math.sin(t * Math.PI * 1.4 + 0.4) * u * 0.22;
    addDrop(ink, x, y, (10 + 22 * Math.pow(t, 1.6)) * s * rand(0.92, 1.08));
  }

  // Main puddle at the end of the stroke.
  const px = cx + u * 0.42;
  const py = cy - u * 0.02;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    addDrop(ink, px + Math.cos(a) * u * 0.16, py + Math.sin(a) * u * 0.13, rand(34, 46) * s);
  }
  addDrop(ink, px, py, 52 * s);

  // A second, smaller puddle held to the first by a thin bridge.
  const qx = cx + u * 0.12;
  const qy = cy + u * 0.46;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    addDrop(ink, qx + Math.cos(a) * u * 0.07, qy + Math.sin(a) * u * 0.07, rand(24, 30) * s);
  }
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    addDrop(ink, qx + (px - qx) * t, qy + (py + u * 0.12 - qy) * t, 11 * s);
  }

  // Satellites.
  const sats = [[0.72, -0.34, 16], [0.82, 0.2, 11], [-0.3, -0.42, 13], [0.4, 0.7, 9], [-0.62, 0.28, 8], [0.08, -0.3, 7]];
  for (const [dx, dy, r] of sats) addDrop(ink, cx + dx * u, cy + dy * u, r * s * rand(0.9, 1.15));

  // Air already trapped in the big puddle, to show what the Air tool does.
  applyBloat(ink);
  const air = [[0.02, -0.03, 30], [0.14, 0.06, 15], [-0.1, 0.07, 10], [0.08, -0.14, 8]];
  for (const [dx, dy, r] of air) addBubble(ink, px + dx * u, py + dy * u, r * s);
}
