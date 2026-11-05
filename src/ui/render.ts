/**
 * Canvas helpers. Tile pixel arrays are immutable, so a canvas made from one
 * can be cached by array identity and reused by every view that shows the tile.
 */

const cache = new WeakMap<Uint8ClampedArray, HTMLCanvasElement>();

export function tileCanvas(pixels: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  let c = cache.get(pixels);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0);
  cache.set(pixels, c);
  return c;
}

export function prepare(ctx: CanvasRenderingContext2D) {
  ctx.imageSmoothingEnabled = false;
}

/** Transparency checkerboard. `cell` in CSS px. */
export function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell: number, dark: boolean) {
  const a = dark ? "#2b2b2b" : "#ffffff";
  const b = dark ? "#343434" : "#e6e6e6";
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  for (let yy = 0; yy * cell < h; yy++) {
    for (let xx = (yy & 1); xx * cell < w; xx += 2) {
      ctx.fillRect(x + xx * cell, y + yy * cell, Math.min(cell, w - xx * cell), Math.min(cell, h - yy * cell));
    }
  }
}

/** Sizes a canvas for crisp rendering at devicePixelRatio; returns the CSS-px scale. */
export function fitCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(cssW * dpr));
  const H = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  prepare(ctx);
  return ctx;
}

export const TILE_DRAG_TYPE = "application/x-tilestudio-tile";
