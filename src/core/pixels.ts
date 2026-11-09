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

// ---------- whole-pixel (32-bit) access ----------
//
// A pixel's key is r | g<<8 | b<<16 | a<<24, i.e. what a Uint32Array view reads
// on a little-endian machine. Fully transparent pixels get key 0 so they hash
// and compare equal whatever their RGB (the pixelsEqual rule). On aligned
// buffers we read one word per pixel instead of four bytes.

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** A Uint32 view of an RGBA buffer (one word per pixel), or null when that isn't possible. */
function words(a: Uint8ClampedArray): Uint32Array | null {
  return LITTLE_ENDIAN && a.byteOffset % 4 === 0 && a.length % 4 === 0 ? new Uint32Array(a.buffer, a.byteOffset, a.length >> 2) : null;
}

/** Normalized key of pixel `p` (pixel index, not byte index). */
function keyAt(a: Uint8ClampedArray, w: Uint32Array | null, p: number): number {
  if (w) {
    const v = w[p];
    return v >>> 24 === 0 ? 0 : v;
  }
  const i = p * 4;
  return a[i + 3] === 0 ? 0 : (a[i] | (a[i + 1] << 8) | (a[i + 2] << 16) | (a[i + 3] << 24)) >>> 0;
}

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

/** One MurmurHash3 round: mixes pixel key `k` into hash `h`. */
function mix(h: number, k: number): number {
  k = Math.imul(k, C1);
  k = (k << 15) | (k >>> 17);
  h ^= Math.imul(k, C2);
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

function finish(h: number, n: number): number {
  h ^= n;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash consistent with pixelsEqual (transparent pixels hash the same). */
export function hashPixels(a: Uint8ClampedArray): number {
  const w = words(a);
  const n = a.length >> 2;
  let h = 0;
  for (let p = 0; p < n; p++) h = mix(h, keyAt(a, w, p));
  return finish(h, n);
}

/**
 * hashPixels of the w×h region at (x, y) of `src` (srcW pixels wide), read in
 * place: hashRegion(src, …) === hashPixels(crop(src, …)). The region must lie
 * inside the image.
 */
export function hashRegion(src: Uint8ClampedArray, srcW: number, x: number, y: number, w: number, h: number): number {
  const v = words(src);
  let hash = 0;
  for (let r = 0; r < h; r++) {
    const row = (y + r) * srcW + x;
    for (let c = 0; c < w; c++) hash = mix(hash, keyAt(src, v, row + c));
  }
  return finish(hash, w * h);
}

/** pixelsEqual(crop(src, …), tile) without the crop. The region must lie inside the image. */
export function regionEquals(src: Uint8ClampedArray, srcW: number, x: number, y: number, w: number, h: number, tile: Uint8ClampedArray): boolean {
  if (tile.length !== w * h * 4) return false;
  const vs = words(src);
  const vt = words(tile);
  let p = 0;
  for (let r = 0; r < h; r++) {
    const row = (y + r) * srcW + x;
    for (let c = 0; c < w; c++, p++) if (keyAt(src, vs, row + c) !== keyAt(tile, vt, p)) return false;
  }
  return true;
}

/** isEmptyTile(crop(src, …)) without the crop. The region must lie inside the image. */
export function isEmptyRegion(src: Uint8ClampedArray, srcW: number, x: number, y: number, w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return true;
  const v = words(src);
  // Raw (un-normalized) pixel value, so "single colour" compares all four bytes like isEmptyTile.
  const raw = (p: number) => (v ? v[p] : (src[p * 4] | (src[p * 4 + 1] << 8) | (src[p * 4 + 2] << 16) | (src[p * 4 + 3] << 24)) >>> 0);
  const first = raw(y * srcW + x);
  let transparent = true;
  let solid = true;
  for (let r = 0; r < h && (transparent || solid); r++) {
    const row = (y + r) * srcW + x;
    for (let c = 0; c < w; c++) {
      const px = raw(row + c);
      if (px >>> 24 !== 0) transparent = false;
      if (px !== first) solid = false;
      if (!transparent && !solid) return false;
    }
  }
  return true;
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
  if (sx >= 0 && sy >= 0 && sx + w <= srcW && sy + h <= srcH) {
    // Fully inside (always true when slicing): copy whole rows.
    for (let y = 0; y < h; y++) {
      const si = ((sy + y) * srcW + sx) * 4;
      out.set(src.subarray(si, si + w * 4), y * w * 4);
    }
    return out;
  }
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
