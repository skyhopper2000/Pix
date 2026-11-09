import type { Color, GridType, Id, Preview, Project, Tile, TileId, Tileset } from "../model";
import { addPaletteColors, addPreview, addTiles, createPreview, findTileset, mapTileset } from "../ops";
import { newId } from "../ids";
import { crop, diffFraction, distinctColors, hashPixels, hashRegion, isEmptyRegion, regionEquals } from "../pixels";
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

type Geometry = Pick<ImportSettings, "tileWidth" | "tileHeight" | "offsetX" | "offsetY" | "spacingX" | "spacingY">;

/**
 * Per-cell facts that depend only on the image and the grid geometry, so the
 * import dialog can reuse them while the user toggles the other options.
 */
export interface CellScan {
  /** The geometry this scan was made for (see scanMatches). */
  geometry: Geometry;
  cols: number;
  rows: number;
  /** hashPixels of each cell, row-major. */
  hashes: Uint32Array;
  /** 1 where the cell is empty (isEmptyTile). */
  empty: Uint8Array;
}

/** Hashes every cell in place (no per-cell copies). O(image pixels) time, O(cells) memory. */
export function scanCells(img: RgbaImage, s: Geometry): CellScan {
  const { cols, rows } = gridDims(img.width, img.height, s);
  const { tileWidth: tw, tileHeight: th } = s;
  const hashes = new Uint32Array(cols * rows);
  const empty = new Uint8Array(cols * rows);
  for (let r = 0, i = 0; r < rows; r++) {
    const y = s.offsetY + r * (th + s.spacingY);
    for (let c = 0; c < cols; c++, i++) {
      const x = s.offsetX + c * (tw + s.spacingX);
      hashes[i] = hashRegion(img.pixels, img.width, x, y, tw, th);
      empty[i] = isEmptyRegion(img.pixels, img.width, x, y, tw, th) ? 1 : 0;
    }
  }
  const { tileWidth, tileHeight, offsetX, offsetY, spacingX, spacingY } = s;
  return { geometry: { tileWidth, tileHeight, offsetX, offsetY, spacingX, spacingY }, cols, rows, hashes, empty };
}

export function scanMatches(scan: CellScan, s: Geometry): boolean {
  const g = scan.geometry;
  return g.tileWidth === s.tileWidth && g.tileHeight === s.tileHeight && g.offsetX === s.offsetX && g.offsetY === s.offsetY && g.spacingX === s.spacingX && g.spacingY === s.spacingY;
}

/** Exact-match index of a tileset's tiles: hash -> tiles with that hash, in tile order. */
export type TileIndex = Map<number, Tile[]>;

export function indexTiles(ts: Pick<Tileset, "tileOrder" | "tiles">): TileIndex {
  const index: TileIndex = new Map();
  for (const id of ts.tileOrder) {
    const t = ts.tiles[id];
    const h = hashPixels(t.pixels);
    const list = index.get(h);
    if (list) list.push(t);
    else index.set(h, [t]);
  }
  return index;
}

/** Work that can be computed once and reused across slices of the same image. */
export interface SliceCache {
  /** Used only if it matches the settings' geometry. */
  scan?: CellScan;
  /** indexTiles(ts), for re-import dedupe. Not mutated. */
  index?: TileIndex;
  /** distinctColors(img.pixels, PALETTE_EXTRACT_LIMIT). */
  colors?: Color[];
}

/**
 * Slices `img` into tiles for tileset `ts`. Pure: returns what to add; see applyImport.
 * Cells are hashed and compared in place; only cells that become new tiles are copied.
 * Time O(image pixels + existing tile pixels), extra memory O(cells + new tile pixels).
 */
export function sliceImage(img: RgbaImage, ts: Tileset | Pick<Tileset, "tileOrder" | "tiles">, s: ImportSettings, previewName: string, cache: SliceCache = {}): ImportResult {
  const scan = cache.scan && scanMatches(cache.scan, s) ? cache.scan : scanCells(img, s);
  const { cols, rows, hashes, empty } = scan;
  const tw = s.tileWidth;
  const th = s.tileHeight;
  // Exact-match index (existing tiles first, for re-import). New tiles go in `added`
  // so a cached index of the existing tiles is never mutated.
  const index = s.isolateUnique ? (cache.index ?? indexTiles(ts)) : new Map<number, Tile[]>();
  const added = new Map<number, Tile[]>();
  const existing = new Set(ts.tileOrder);

  const newTiles: Tile[] = [];
  const cells: (TileId | null)[] = new Array(cols * rows).fill(null);
  let reused = 0;
  let skippedEmpty = 0;
  for (let r = 0, i = 0; r < rows; r++) {
    const y = s.offsetY + r * (th + s.spacingY);
    for (let c = 0; c < cols; c++, i++) {
      if (!s.includeEmpty && empty[i]) {
        skippedEmpty++;
        continue;
      }
      const x = s.offsetX + c * (tw + s.spacingX);
      const h = hashes[i];
      if (s.isolateUnique) {
        const same = (t: Tile) => regionEquals(img.pixels, img.width, x, y, tw, th, t.pixels);
        const match = index.get(h)?.find(same) ?? added.get(h)?.find(same);
        if (match) {
          cells[i] = match.id;
          if (existing.has(match.id)) reused++;
          continue;
        }
      }
      const tile: Tile = { id: newId(), name: `tile${r}_${c}`, pixels: crop(img.pixels, img.width, img.height, x, y, tw, th) };
      newTiles.push(tile);
      if (s.isolateUnique) {
        const list = added.get(h);
        if (list) list.push(tile);
        else added.set(h, [tile]);
      }
      cells[i] = tile.id;
    }
  }
  const colors = s.extractPalette ? (cache.colors ?? distinctColors(img.pixels, PALETTE_EXTRACT_LIMIT)) : [];
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
  next = addTiles(next, tsId, result.newTiles);
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
