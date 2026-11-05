import { blit, createPixels, extrude, scaleNearest } from "../pixels";

/**
 * Packs tiles into a sheet image. Scaling and extrusion happen only here, at
 * export time, on copies; stored tiles are never touched.
 */

export interface PackOptions {
  scale: number; // integer >= 1, nearest-neighbour
  padding: number; // px around the sheet (Tiled "margin")
  spacing: number; // px between tiles
  extrusion: number; // px of repeated edge pixels around each tile
}

export interface PackedSheet {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Scaled tile size. */
  tileWidth: number;
  tileHeight: number;
  /** Values for the .tsx so Tiled reads extruded tiles correctly. */
  tsxMargin: number;
  tsxSpacing: number;
}

/**
 * `cells` is row-major with `columns` per row; null cells are transparent.
 * Each cell is the unscaled tile (tw x th).
 */
export function packSheet(cells: (Uint8ClampedArray | null)[], columns: number, tw: number, th: number, o: PackOptions): PackedSheet {
  const cols = Math.max(1, columns);
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  const s = Math.max(1, Math.floor(o.scale));
  const e = o.extrusion;
  const TW = tw * s;
  const TH = th * s;
  const cellW = TW + 2 * e;
  const cellH = TH + 2 * e;
  const width = 2 * o.padding + cols * cellW + (cols - 1) * o.spacing;
  const height = 2 * o.padding + rows * cellH + (rows - 1) * o.spacing;
  const pixels = createPixels(width, height);
  cells.forEach((px, i) => {
    if (!px) return;
    const c = i % cols;
    const r = Math.floor(i / cols);
    const tile = extrude(scaleNearest(px, tw, th, s), TW, TH, e);
    blit(pixels, width, height, tile, cellW, cellH, o.padding + c * (cellW + o.spacing), o.padding + r * (cellH + o.spacing));
  });
  return { pixels, width, height, columns: cols, rows, tileWidth: TW, tileHeight: TH, tsxMargin: o.padding + e, tsxSpacing: o.spacing + 2 * e };
}

/** Default column count for a free-flowing sheet. */
export const autoColumns = (n: number): number => Math.max(1, Math.ceil(Math.sqrt(n)));

/** Renders a grid of tile references (a preview) to an image at integer scale. */
export function renderGrid(cells: (Uint8ClampedArray | null)[], cols: number, rows: number, tw: number, th: number, scale: number): { pixels: Uint8ClampedArray; width: number; height: number } {
  const s = Math.max(1, Math.floor(scale));
  const width = cols * tw * s;
  const height = rows * th * s;
  const pixels = createPixels(width, height);
  const scaled = new Map<Uint8ClampedArray, Uint8ClampedArray>();
  cells.forEach((px, i) => {
    if (!px) return;
    let t = scaled.get(px);
    if (!t) scaled.set(px, (t = scaleNearest(px, tw, th, s)));
    blit(pixels, width, height, t, tw * s, th * s, (i % cols) * tw * s, Math.floor(i / cols) * th * s);
  });
  return { pixels, width, height };
}
