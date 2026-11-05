import { luma, pack, unpack } from "../color";
import type { Color } from "../model";
import { getPixel, setPixel } from "../pixels";

/**
 * Pixel tool algorithms. All of them act only where the user applies them;
 * they compute point sets or return edited copies of a working buffer.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Bresenham line, inclusive of both ends. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const pts: Pt[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/**
 * Is `b` the doubled corner of an L-step a→b→c? (a and c are diagonal
 * neighbours and b touches both orthogonally.) Pixel-perfect mode removes it.
 */
export function isLCorner(a: Pt, b: Pt, c: Pt): boolean {
  const orth = (p: Pt, q: Pt) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
  return orth(a, b) && orth(b, c) && Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1;
}

/** Removes L-corners from a freehand stroke path (for testing and batch use). */
export function pixelPerfectPath(path: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
    while (out.length >= 3 && isLCorner(out[out.length - 3], out[out.length - 2], out[out.length - 1])) out.splice(out.length - 2, 1);
  }
  return out;
}

/** Normalised rectangle from two corners; `square` makes it a square toward the drag direction. */
export function boxFrom(a: Pt, b: Pt, square = false): { x0: number; y0: number; x1: number; y1: number } {
  let { x, y } = b;
  if (square) {
    const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    x = a.x + (b.x >= a.x ? d : -d);
    y = a.y + (b.y >= a.y ? d : -d);
  }
  return { x0: Math.min(a.x, x), y0: Math.min(a.y, y), x1: Math.max(a.x, x), y1: Math.max(a.y, y) };
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Pt[] {
  const pts: Pt[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (filled || y === y0 || y === y1 || x === x0 || x === x1) pts.push({ x, y });
    }
  }
  return pts;
}

/** Ellipse inscribed in a pixel box (Zingl's algorithm), outline or filled. */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Pt[] {
  const set = new Map<string, Pt>();
  const put = (x: number, y: number) => set.set(x + "," + y, { x, y });
  const span = (xa: number, xb: number, y: number) => {
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) put(x, y);
  };
  let a = Math.abs(x1 - x0);
  const b = Math.abs(y1 - y0);
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  let e2: number;
  if (x0 > x1) {
    x0 = x1;
    x1 += a;
  }
  if (y0 > y1) y0 = y1;
  y0 += (b + 1) >> 1;
  y1 = y0 - b1;
  a *= 8 * a;
  b1 = 8 * b * b;
  do {
    if (filled) {
      span(x0, x1, y0);
      span(x0, x1, y1);
    } else {
      put(x1, y0);
      put(x0, y0);
      put(x0, y1);
      put(x1, y1);
    }
    e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      err += dy += a;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      err += dx += b1;
    }
  } while (x0 <= x1);
  while (y0 - y1 <= b) {
    // Flat ends of very thin ellipses.
    put(x0 - 1, y0);
    put(x1 + 1, y0++);
    put(x0 - 1, y1);
    put(x1 + 1, y1--);
  }
  return [...set.values()];
}

/** Returns a copy of `buf` with points set to `c` (clipped). */
export function plot(buf: Uint8ClampedArray, w: number, h: number, pts: Pt[], c: Color): Uint8ClampedArray {
  const out = buf.slice();
  for (const p of pts) if (p.x >= 0 && p.y >= 0 && p.x < w && p.y < h) setPixel(out, w, p.x, p.y, c);
  return out;
}

/** Fill: contiguous (4-connected, exact colour) or global (every pixel of that colour). */
export function floodFill(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number, c: Color, global: boolean): Uint8ClampedArray {
  if (x < 0 || y < 0 || x >= w || y >= h) return buf;
  const target = getPixel(buf, w, x, y);
  if (target === c) return buf;
  const out = buf.slice();
  if (global) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (getPixel(buf, w, xx, yy) === target) setPixel(out, w, xx, yy, c);
    return out;
  }
  const stack = [x + y * w];
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const px = i % w;
    const py = (i - px) / w;
    if (getPixel(buf, w, px, py) !== target) continue;
    setPixel(out, w, px, py, c);
    if (px > 0) stack.push(i - 1);
    if (px < w - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - w);
    if (py < h - 1) stack.push(i + w);
  }
  return out;
}

/**
 * Lighten/darken one colour.
 * Palette mode: step to the next lighter/darker palette colour (by luma). A colour not in
 * the palette is left alone (the tool never invents colours in palette mode).
 * RGBA mode: move each channel 1/8 of the way toward white (lighten) or black (darken).
 * Fully transparent pixels are never touched.
 */
export function shadeColor(c: Color, dir: 1 | -1, palette: Color[] | null): Color {
  if ((c & 255) === 0) return c;
  if (palette) {
    const ramp = [...new Set(palette)].filter((p) => (p & 255) !== 0).sort((a, b) => luma(a) - luma(b) || a - b);
    const i = ramp.indexOf(c);
    if (i < 0) return c;
    return ramp[Math.max(0, Math.min(ramp.length - 1, i + dir))];
  }
  const [r, g, b, a] = unpack(c);
  const f = (v: number) => (dir > 0 ? Math.min(255, Math.round(v + (255 - v) / 8 + 0.5)) : Math.max(0, Math.round(v - v / 8 - 0.5)));
  return pack(f(r), f(g), f(b), a);
}

/** A square brush footprint of size n centred on p (top-left biased for even sizes). */
export function brushPoints(p: Pt, n: number): Pt[] {
  if (n <= 1) return [p];
  const pts: Pt[] = [];
  const o = Math.floor((n - 1) / 2);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) pts.push({ x: p.x - o + x, y: p.y - o + y });
  return pts;
}
