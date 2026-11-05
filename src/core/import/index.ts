import type { Color, GridType, Id, Preview, Project, Tile, TileId, Tileset } from "../model";
import { addPaletteColors, addPreview, addTile, createPreview, findTileset, mapTileset } from "../ops";
import { newId } from "../ids";
import { crop, diffFraction, distinctColors, hashPixels, isEmptyTile, pixelsEqual } from "../pixels";
import type { RgbaImage } from "../png";

/**
 * Import: slice an image into tiles and rebuild it as a map preview.
 * Only exact duplicates are merged automatically. Nothing here changes pixels.
 */

export interface ImportSettings {
  grid: GridType;
  tileWidth: number;
  tileHeight: number;
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
  /** Collapse exact pixel matches (incl. against tiles already in the tileset). */
  isolateUnique: boolean;
  /** Keep fully transparent / single-colour cells as tiles. */
  includeEmpty: boolean;
  /** Add the source's colours to the project palette (read only). */
  extractPalette: boolean;
}

export const defaultImportSettings = (ts: Pick<Tileset, "tileWidth" | "tileHeight">): ImportSettings => ({
  grid: "square",
  tileWidth: ts.tileWidth,
  tileHeight: ts.tileHeight,
  offsetX: 0,
  offsetY: 0,
  spacingX: 0,
  spacingY: 0,
  isolateUnique: true,
  includeEmpty: true,
  extractPalette: false,
});

export interface GridDims {
  cols: number;
  rows: number;
}

export function gridDims(width: number, height: number, s: Pick<ImportSettings, "tileWidth" | "tileHeight" | "offsetX" | "offsetY" | "spacingX" | "spacingY">): GridDims {
  const fit = (size: number, off: number, tile: number, gap: number) => (tile <= 0 || size - off < tile ? 0 : Math.floor((size - off + gap) / (tile + gap)));
  return { cols: fit(width, s.offsetX, s.tileWidth, s.spacingX), rows: fit(height, s.offsetY, s.tileHeight, s.spacingY) };
}

/** A tileset has exactly one tile size; it can only change while the tileset has no tiles. */
export function validateImport(img: Pick<RgbaImage, "width" | "height">, ts: Pick<Tileset, "tileWidth" | "tileHeight" | "tileOrder">, s: ImportSettings): string[] {
  const errs: string[] = [];
  if (s.grid !== "square") errs.push("Only square grids are supported in this version.");
  if (ts.tileOrder.length > 0 && (s.tileWidth !== ts.tileWidth || s.tileHeight !== ts.tileHeight))
    errs.push(`Tile size must match the tileset (${ts.tileWidth}×${ts.tileHeight}) because it already has tiles.`);
  if (s.tileWidth < 1 || s.tileHeight < 1) errs.push("Tile size must be at least 1 px.");
  if (s.offsetX < 0 || s.offsetY < 0 || s.spacingX < 0 || s.spacingY < 0) errs.push("Offset and spacing can't be negative.");
  const { cols, rows } = gridDims(img.width, img.height, s);
  if (cols === 0 || rows === 0) errs.push("No whole tile fits in the image with these settings.");
  return errs;
}

export interface ImportResult {
  /** New tiles to append to the parent, in first-appearance order. */
  newTiles: Tile[];
  /** The source rebuilt from tile references. */
  preview: Preview;
  /** Colours found in the source (empty unless extractPalette). */
  colors: Color[];
  stats: { cells: number; newTiles: number; reused: number; skippedEmpty: number };
}

export const PALETTE_EXTRACT_LIMIT = 1024;

/** Slices `img` into tiles for tileset `ts`. Pure: returns what to add; see applyImport. */
export function sliceImage(img: RgbaImage, ts: Tileset, s: ImportSettings, previewName: string): ImportResult {
  const { cols, rows } = gridDims(img.width, img.height, s);
  const tw = s.tileWidth;
  const th = s.tileHeight;
  // Exact-match index: hash -> tiles with that hash (existing tiles first, for re-import).
  const index = new Map<number, Tile[]>();
  const remember = (t: Tile) => {
    const h = hashPixels(t.pixels);
    const list = index.get(h);
    if (list) list.push(t);
    else index.set(h, [t]);
  };
  if (s.isolateUnique) for (const id of ts.tileOrder) remember(ts.tiles[id]);
  const existing = new Set(ts.tileOrder);

  const newTiles: Tile[] = [];
  const cells: (TileId | null)[] = new Array(cols * rows).fill(null);
  let reused = 0;
  let skippedEmpty = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = crop(img.pixels, img.width, img.height, s.offsetX + c * (tw + s.spacingX), s.offsetY + r * (th + s.spacingY), tw, th);
      if (!s.includeEmpty && isEmptyTile(px)) {
        skippedEmpty++;
        continue;
      }
      if (s.isolateUnique) {
        const match = index.get(hashPixels(px))?.find((t) => pixelsEqual(t.pixels, px));
        if (match) {
          cells[r * cols + c] = match.id;
          if (existing.has(match.id)) reused++;
          continue;
        }
      }
      const tile: Tile = { id: newId(), name: `tile${r}_${c}`, pixels: px };
      newTiles.push(tile);
      if (s.isolateUnique) remember(tile);
      cells[r * cols + c] = tile.id;
    }
  }
  const colors = s.extractPalette ? distinctColors(img.pixels, PALETTE_EXTRACT_LIMIT) : [];
  return {
    newTiles,
    preview: createPreview(previewName, cols, rows, cells),
    colors,
    stats: { cells: cols * rows, newTiles: newTiles.length, reused, skippedEmpty },
  };
}

/** Appends the result to the tileset: new tiles at the end, the preview as an additional map preview. */
export function applyImport(p: Project, tsId: Id, result: ImportResult, s: Pick<ImportSettings, "tileWidth" | "tileHeight">): Project {
  const ts = findTileset(p, tsId);
  if (!ts) return p;
  let next = p;
  if (ts.tileOrder.length === 0 && (ts.tileWidth !== s.tileWidth || ts.tileHeight !== s.tileHeight))
    next = mapTileset(next, tsId, (t) => ({ ...t, tileWidth: s.tileWidth, tileHeight: s.tileHeight }));
  for (const t of result.newTiles) next = addTile(next, tsId, t);
  next = addPreview(next, tsId, result.preview);
  if (result.colors.length) next = addPaletteColors(next, result.colors);
  return next;
}

/**
 * Near-duplicate *proposals*: groups of tiles (by id) whose pixels differ by at
 * most `threshold` (fraction of pixels, 0..1). Exact matches are included.
 * Groups are connected components, in tile order. Nothing is merged here.
 */
export function findNearDuplicates(ts: Tileset, threshold: number): TileId[][] {
  const ids = ts.tileOrder;
  const parent = ids.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (find(i) === find(j)) continue;
      if (diffFraction(ts.tiles[ids[i]].pixels, ts.tiles[ids[j]].pixels) <= threshold) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, TileId[]>();
  ids.forEach((id, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(id);
    else groups.set(r, [id]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Base name for a preview built from a file name: "maps/Map Rip.png" -> "Map Rip". */
export function previewNameFromFile(fileName: string): string {
  return fileName.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "") || "import";
}
