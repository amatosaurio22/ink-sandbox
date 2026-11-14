// Marching squares over the ink field, chained into closed loops, smoothed,
// and written as one SVG path string. The canvas draws that same string through
// Path2D, so what you see on screen is byte-for-byte what you export.

import { GRID } from './ink.js';

export function traceContours(ink, iso) {
  const { cols, rows, field } = ink;
  const H = rows * cols;
  const segs = new Map();

  const hEdge = (c, r) => r * cols + c;
  const vEdge = (c, r) => H + r * cols + c;
  const t = (a, b) => {
    const d = b - a;
    return Math.abs(d) < 1e-5 ? 0.5 : Math.max(0, Math.min(1, (iso - a) / d));
  };
  const seg = (inEdge, pt, outEdge) => segs.set(inEdge, { pt, next: outEdge, seen: false });

  for (let r = 0; r < rows - 1; r++) {
    const o0 = r * cols;
    const o1 = (r + 1) * cols;
    const y0 = r * GRID;
    const y1 = y0 + GRID;

    for (let c = 0; c < cols - 1; c++) {
      const tl = field[o0 + c];
      const tr = field[o0 + c + 1];
      const br = field[o1 + c + 1];
      const bl = field[o1 + c];

      const mask = (tl >= iso ? 8 : 0) | (tr >= iso ? 4 : 0) | (br >= iso ? 2 : 0) | (bl >= iso ? 1 : 0);
      if (mask === 0 || mask === 15) continue;

      const x0 = c * GRID;
      const x1 = x0 + GRID;
      const eT = hEdge(c, r), eB = hEdge(c, r + 1), eL = vEdge(c, r), eR = vEdge(c + 1, r);
      const T = () => ({ x: x0 + t(tl, tr) * GRID, y: y0 });
      const R = () => ({ x: x1, y: y0 + t(tr, br) * GRID });
      const B = () => ({ x: x0 + t(bl, br) * GRID, y: y1 });
      const L = () => ({ x: x0, y: y0 + t(tl, bl) * GRID });
      const centre = () => (tl + tr + br + bl) * 0.25 >= iso;

      switch (mask) {
        case 1: seg(eL, L(), eB); break;
        case 2: seg(eB, B(), eR); break;
        case 3: seg(eL, L(), eR); break;
        case 4: seg(eR, R(), eT); break;
        case 5:
          if (centre()) { seg(eR, R(), eB); seg(eL, L(), eT); }
          else { seg(eR, R(), eT); seg(eL, L(), eB); }
          break;
        case 6: seg(eB, B(), eT); break;
        case 7: seg(eL, L(), eT); break;
        case 8: seg(eT, T(), eL); break;
        case 9: seg(eT, T(), eB); break;
        case 10:
          if (centre()) { seg(eT, T(), eR); seg(eB, B(), eL); }
          else { seg(eT, T(), eL); seg(eB, B(), eR); }
          break;
        case 11: seg(eT, T(), eR); break;
        case 12: seg(eR, R(), eL); break;
        case 13: seg(eR, R(), eB); break;
        case 14: seg(eB, B(), eL); break;
      }
    }
  }

  const loops = [];
  for (const [start, first] of segs) {
    if (first.seen) continue;
    const loop = [];
    let edge = start;
    for (let guard = 0; guard < 10000; guard++) {
      const s = segs.get(edge);
      if (!s || s.seen) break;
      s.seen = true;
      loop.push(s.pt);
      edge = s.next;
      if (edge === start) break;
    }
    if (loop.length >= 4) loops.push(smooth(loop));
  }
  return loops;
}

function smooth(pts) {
  let w = pts;
  if (pts.length > 24) w = pts.filter((_, i) => i % 2 === 0);
  for (let pass = 0; pass < 3; pass++) {
    const n = w.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = w[(i - 1 + n) % n], b = w[i], c = w[(i + 1) % n];
      out[i] = { x: b.x * 0.5 + (a.x + c.x) * 0.25, y: b.y * 0.5 + (a.y + c.y) * 0.25 };
    }
    w = out;
  }
  return w;
}

// Closed Catmull-Rom loops as cubic Béziers, one compound path (even-odd).
export function toPathData(loops) {
  const f = (v) => v.toFixed(2);
  let d = '';
  for (const loop of loops) {
    const n = loop.length;
    if (n < 3) continue;
    d += `M${f(loop[0].x)} ${f(loop[0].y)}`;
    for (let i = 0; i < n; i++) {
      const p0 = loop[(i - 1 + n) % n], p1 = loop[i], p2 = loop[(i + 1) % n], p3 = loop[(i + 2) % n];
      d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
    }
    d += 'Z';
  }
  return d;
}
