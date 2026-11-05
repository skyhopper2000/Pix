import type { Color } from "./model";

/** RGBA buffer helpers. Buffers are row-major Uint8ClampedArray of w*h*4. */

export function createPixels(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

export function getPixel(buf: Uint8ClampedArray, w: number, x: number, y: number): Color {
  const o = (y * w + x) * 4;
  return ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
}

/** Mutates `buf`. Only use on a working copy, never on a stored tile. */
export function setPixel(buf: Uint8ClampedArray, w: number, x: number, y: number, c: Color): void {
  const o = (y * w + x) * 4;
  buf[o] = (c >>> 24) & 255;
  buf[o + 1] = (c >>> 16) & 255;
  buf[o + 2] = (c >>> 8) & 255;
  buf[o + 3] = c & 255;
}

/**
 * Exact equality. Fully transparent pixels compare equal whatever their RGB,
 * because they look identical. (Comparison only; nothing is rewritten.)
 */
export function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    const aa = a[i + 3];
    if (aa !== b[i + 3]) return false;
    if (aa === 0) continue;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) return false;
  }
  return true;
}

/** FNV-1a hash consistent with pixelsEqual (transparent pixels hash the same). */
export function hashPixels(a: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i += 4) {
    const t = a[i + 3] === 0;
    for (let k = 0; k < 4; k++) {
      h ^= t ? 0 : a[i + k];
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

/** Fraction (0..1) of pixels that differ, using the same transparency rule as pixelsEqual. */
export function diffFraction(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return 1;
  let diff = 0;
  const n = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    const aa = a[i + 3];
    if (aa !== b[i + 3]) diff++;
    else if (aa !== 0 && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) diff++;
  }
  return n === 0 ? 0 : diff / n;
}

export function isFullyTransparent(a: Uint8ClampedArray): boolean {
  for (let i = 3; i < a.length; i += 4) if (a[i] !== 0) return false;
  return true;
}

/** "Empty" per the import dialog: fully transparent, or a single solid color. */
export function isEmptyTile(a: Uint8ClampedArray): boolean {
  if (a.length === 0 || isFullyTransparent(a)) return true;
  for (let i = 4; i < a.length; i += 4) {
    if (a[i] !== a[0] || a[i + 1] !== a[1] || a[i + 2] !== a[2] || a[i + 3] !== a[3]) return false;
  }
  return true;
}

/** Copies a w x h region from src (srcW wide) at (sx, sy). Out-of-bounds pixels are transparent. */
export function crop(src: Uint8ClampedArray, srcW: number, srcH: number, sx: number, sy: number, w: number, h: number): Uint8ClampedArray {
  const out = createPixels(w, h);
  for (let y = 0; y < h; y++) {
    const yy = sy + y;
    if (yy < 0 || yy >= srcH) continue;
    for (let x = 0; x < w; x++) {
      const xx = sx + x;
      if (xx < 0 || xx >= srcW) continue;
      const si = (yy * srcW + xx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/** Copies src (w x h) into dst (dstW x dstH) at (dx, dy), clipping. Mutates dst (a working buffer). */
export function blit(dst: Uint8ClampedArray, dstW: number, dstH: number, src: Uint8ClampedArray, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; y++) {
    const yy = dy + y;
    if (yy < 0 || yy >= dstH) continue;
    for (let x = 0; x < w; x++) {
      const xx = dx + x;
      if (xx < 0 || xx >= dstW) continue;
      const si = (y * w + x) * 4;
      const di = (yy * dstW + xx) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
}

/** Integer nearest-neighbour upscale. */
export function scaleNearest(src: Uint8ClampedArray, w: number, h: number, s: number): Uint8ClampedArray {
  if (s === 1) return src.slice();
  const W = w * s;
  const out = createPixels(W, h * s);
  for (let y = 0; y < h * s; y++) {
    const sy = Math.floor(y / s);
    for (let x = 0; x < W; x++) {
      const si = (sy * w + Math.floor(x / s)) * 4;
      const di = (y * W + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/** Returns a (w+2e) x (h+2e) buffer with src in the middle and its edge pixels repeated outward e px. */
export function extrude(src: Uint8ClampedArray, w: number, h: number, e: number): Uint8ClampedArray {
  if (e === 0) return src.slice();
  const W = w + 2 * e;
  const H = h + 2 * e;
  const out = createPixels(W, H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, y - e));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.max(0, x - e));
      const si = (sy * w + sx) * 4;
      const di = (y * W + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/** Distinct opaque-or-translucent colors in first-seen order (fully transparent pixels skipped). */
export function distinctColors(buf: Uint8ClampedArray, limit = Infinity): Color[] {
  const seen = new Set<number>();
  const out: Color[] = [];
  for (let i = 0; i < buf.length && out.length < limit; i += 4) {
    if (buf[i + 3] === 0) continue;
    const c = ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
