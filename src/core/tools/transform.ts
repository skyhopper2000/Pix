import { createPixels, crop } from "../pixels";

/**
 * Flip and rotate. These are pure index permutations: every output pixel is an
 * exact copy of one input pixel (same RGBA bytes), so no colour is ever made up,
 * blended or changed. They run only when the user clicks Flip / Rotate.
 */

export type Transform = "flipH" | "flipV" | "rotateCW" | "rotateCCW";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const copyPx = (src: Uint8ClampedArray, si: number, dst: Uint8ClampedArray, di: number) => {
  dst[di] = src[si];
  dst[di + 1] = src[si + 1];
  dst[di + 2] = src[si + 2];
  dst[di + 3] = src[si + 3];
};

/** Mirrors left↔right. */
export function flipH(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = createPixels(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) copyPx(src, (y * w + x) * 4, out, (y * w + (w - 1 - x)) * 4);
  return out;
}

/** Mirrors top↔bottom. */
export function flipV(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = createPixels(w, h);
  for (let y = 0; y < h; y++) out.set(src.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
  return out;
}

/** Quarter turn clockwise. A w×h buffer becomes h×w: (x, y) → (h-1-y, x). */
export function rotateCW(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = createPixels(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) copyPx(src, (y * w + x) * 4, out, (x * h + (h - 1 - y)) * 4);
  return out;
}

/** Quarter turn counter-clockwise. A w×h buffer becomes h×w: (x, y) → (y, w-1-x). */
export function rotateCCW(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = createPixels(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) copyPx(src, (y * w + x) * 4, out, ((w - 1 - x) * h + y) * 4);
  return out;
}

export function transformPixels(src: Uint8ClampedArray, w: number, h: number, t: Transform): Uint8ClampedArray {
  switch (t) {
    case "flipH":
      return flipH(src, w, h);
    case "flipV":
      return flipV(src, w, h);
    case "rotateCW":
      return rotateCW(src, w, h);
    case "rotateCCW":
      return rotateCCW(src, w, h);
  }
}

/**
 * Where a region lands after `t`. Flips keep the rect. A rotation swaps w and h around
 * the same centre (Math.trunc keeps CW then CCW, and four CW turns, back on the start
 * rect), then is nudged inside the tile. null = the rotated region can't fit the tile.
 */
export function transformedRect(r: Rect, tw: number, th: number, t: Transform): Rect | null {
  if (t === "flipH" || t === "flipV") return { ...r };
  const w = r.h;
  const h = r.w;
  if (w > tw || h > th) return null;
  const x = Math.max(0, Math.min(tw - w, r.x + Math.trunc((r.w - r.h) / 2)));
  const y = Math.max(0, Math.min(th - h, r.y + Math.trunc((r.h - r.w) / 2)));
  return { x, y, w, h };
}

/**
 * Applies `t` to region `r` of a tile (the whole tile when r covers it) and returns a new
 * buffer plus the region's new rect. The region is lifted, transformed and set back down
 * the way a moved selection is: its old area is cleared, then its opaque pixels are placed
 * (transparent pixels let what's underneath show, as when moving). For flips and square
 * regions that is an exact in-place permutation. Returns null when a rotation can't fit.
 */
export function transformRegion(tile: Uint8ClampedArray, tw: number, th: number, r: Rect, t: Transform): { pixels: Uint8ClampedArray; rect: Rect } | null {
  const rect = transformedRect(r, tw, th, t);
  if (!rect) return null;
  const lifted = transformPixels(crop(tile, tw, th, r.x, r.y, r.w, r.h), r.w, r.h, t);
  const out = tile.slice();
  for (let y = r.y; y < r.y + r.h; y++) out.fill(0, (y * tw + r.x) * 4, (y * tw + r.x + r.w) * 4);
  for (let y = 0; y < rect.h; y++)
    for (let x = 0; x < rect.w; x++) {
      const si = (y * rect.w + x) * 4;
      if (lifted[si + 3] === 0 && !(x + rect.x >= r.x && x + rect.x < r.x + r.w && y + rect.y >= r.y && y + rect.y < r.y + r.h)) continue;
      copyPx(lifted, si, out, ((rect.y + y) * tw + rect.x + x) * 4);
    }
  return { pixels: out, rect };
}
