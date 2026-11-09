import { newId } from "./ids";
import type { Color, GridType, Id, Palette, Preview, Project, Subset, SubsetType, Template, Terrain, Tile, TileId, Tileset } from "./model";
import { DEFAULT_TILE_SIZE } from "./model";
import { createPixels } from "./pixels";
import { slotName, templateOf } from "./templates";

/**
 * Pure project operations. Each returns a new Project (structural sharing) and
 * never mutates its input. Unknown ids leave the project unchanged.
 */

// ---------- construction ----------

export function createProject(name = "Untitled"): Project {
  return { version: 1, name, palette: { colors: [], locked: false }, tilesets: [] };
}

export function createTileset(name: string, tileWidth = DEFAULT_TILE_SIZE, tileHeight = tileWidth, grid: GridType = "square"): Tileset {
  return { id: newId(), name, tileWidth, tileHeight, grid, tileOrder: [], tiles: {}, subsets: [], previews: [] };
}

export function createTile(ts: Pick<Tileset, "tileWidth" | "tileHeight">, name: string, pixels?: Uint8ClampedArray): Tile {
  return { id: newId(), name, pixels: pixels ?? createPixels(ts.tileWidth, ts.tileHeight) };
}

export function createPreview(name: string, cols: number, rows: number, cells?: (TileId | null)[]): Preview {
  return { id: newId(), name, cols, rows, cells: cells ?? new Array(cols * rows).fill(null) };
}

export const DEFAULT_TERRAINS: [Terrain, Terrain] = [
  { name: "grass", color: "#4caf50" },
  { name: "dirt", color: "#a0522d" },
];

export function createSubset(name: string, type: SubsetType, opts: { terrains?: [Terrain, Terrain]; template?: Template; cols?: number; rows?: number } = {}): Subset {
  const template = type === "custom" ? opts.template : undefined;
  if (type === "custom" && !template) throw new Error("A custom subset needs a template.");
  const t = templateOf({ type, template });
  const cols = t ? t.cols : (opts.cols ?? 8);
  const rows = t ? t.rows : (opts.rows ?? 4);
  const cellCount = t ? t.slots.length : cols * rows;
  return {
    id: newId(),
    name,
    type,
    cols,
    rows,
    cells: new Array(cellCount).fill(null),
    terrains: opts.terrains ?? DEFAULT_TERRAINS,
    template,
    preview: createPreview(name + " preview", 8, 8),
  };
}

// ---------- helpers ----------

export function findTileset(p: Project, tsId: Id): Tileset | undefined {
  return p.tilesets.find((t) => t.id === tsId);
}

export function mapTileset(p: Project, tsId: Id, fn: (ts: Tileset) => Tileset): Project {
  let changed = false;
  const tilesets = p.tilesets.map((ts) => {
    if (ts.id !== tsId) return ts;
    const next = fn(ts);
    if (next !== ts) changed = true;
    return next;
  });
  return changed ? { ...p, tilesets } : p;
}

function mapSubset(ts: Tileset, subsetId: Id, fn: (s: Subset) => Subset): Tileset {
  let changed = false;
  const subsets = ts.subsets.map((s) => {
    if (s.id !== subsetId) return s;
    const n = fn(s);
    if (n !== s) changed = true;
    return n;
  });
  return changed ? { ...ts, subsets } : ts;
}

function mapPreviewIn(ts: Tileset, previewId: Id, fn: (pv: Preview) => Preview): Tileset {
  const i = ts.previews.findIndex((pv) => pv.id === previewId);
  if (i >= 0) {
    const next = fn(ts.previews[i]);
    if (next === ts.previews[i]) return ts;
    const previews = ts.previews.slice();
    previews[i] = next;
    return { ...ts, previews };
  }
  const s = ts.subsets.find((s) => s.preview.id === previewId);
  if (s)
    return mapSubset(ts, s.id, (s) => {
      const preview = fn(s.preview);
      return preview === s.preview ? s : { ...s, preview };
    });
  return ts;
}

/** Every preview in a tileset: map previews then subset previews. */
export function allPreviews(ts: Tileset): Preview[] {
  return [...ts.previews, ...ts.subsets.map((s) => s.preview)];
}

export function findPreview(ts: Tileset, previewId: Id): Preview | undefined {
  return allPreviews(ts).find((pv) => pv.id === previewId);
}

const remapCells = (cells: (TileId | null)[], fn: (id: TileId) => TileId | null) => {
  let changed = false;
  const out = cells.map((c) => {
    if (c === null) return c;
    const n = fn(c);
    if (n !== c) changed = true;
    return n;
  });
  return changed ? out : cells;
};

/** Applies fn to every tile reference in subsets and previews of a tileset. */
function remapRefs(ts: Tileset, fn: (id: TileId) => TileId | null): Tileset {
  const remapPv = (pv: Preview) => {
    const cells = remapCells(pv.cells, fn);
    return cells === pv.cells ? pv : { ...pv, cells };
  };
  return {
    ...ts,
    previews: ts.previews.map(remapPv),
    subsets: ts.subsets.map((s) => {
      const cells = remapCells(s.cells, fn);
      const preview = remapPv(s.preview);
      return cells === s.cells && preview === s.preview ? s : { ...s, cells, preview };
    }),
  };
}

// ---------- project ----------

export const renameProject = (p: Project, name: string): Project => ({ ...p, name });

export function addTileset(p: Project, ts: Tileset): Project {
  return { ...p, tilesets: [...p.tilesets, ts] };
}

export function deleteTileset(p: Project, tsId: Id): Project {
  return { ...p, tilesets: p.tilesets.filter((t) => t.id !== tsId) };
}

export const renameTileset = (p: Project, tsId: Id, name: string) => mapTileset(p, tsId, (ts) => ({ ...ts, name }));

// ---------- tiles ----------

/** Adds a tile to the parent tileset (at `index` in tile order, default the end). */
export function addTile(p: Project, tsId: Id, tile: Tile, index?: number): Project {
  return mapTileset(p, tsId, (ts) => {
    const tileOrder = ts.tileOrder.slice();
    tileOrder.splice(index ?? tileOrder.length, 0, tile.id);
    return { ...ts, tileOrder, tiles: { ...ts.tiles, [tile.id]: tile } };
  });
}

/**
 * Appends many tiles in one step. Same result as calling addTile for each, but
 * O(existing + new) instead of copying the tile map once per tile (which made
 * importing 10k tiles take ~40 s).
 */
export function addTiles(p: Project, tsId: Id, tiles: readonly Tile[]): Project {
  if (tiles.length === 0) return p;
  return mapTileset(p, tsId, (ts) => {
    const tileOrder = ts.tileOrder.concat(tiles.map((t) => t.id));
    const map = { ...ts.tiles };
    for (const t of tiles) map[t.id] = t;
    return { ...ts, tileOrder, tiles: map };
  });
}

export function setTilePixels(p: Project, tsId: Id, tileId: TileId, pixels: Uint8ClampedArray): Project {
  return mapTileset(p, tsId, (ts) => {
    const t = ts.tiles[tileId];
    if (!t) return ts;
    return { ...ts, tiles: { ...ts.tiles, [tileId]: { ...t, pixels } } };
  });
}

/** Sets the pixels of several tiles at once (e.g. a paste or a move spanning tiles). */
export function setManyTilePixels(p: Project, tsId: Id, edits: Map<TileId, Uint8ClampedArray>): Project {
  if (edits.size === 0) return p;
  return mapTileset(p, tsId, (ts) => {
    const tiles = { ...ts.tiles };
    for (const [id, px] of edits) if (tiles[id]) tiles[id] = { ...tiles[id], pixels: px };
    return { ...ts, tiles };
  });
}

export function renameTile(p: Project, tsId: Id, tileId: TileId, name: string): Project {
  return mapTileset(p, tsId, (ts) => {
    const t = ts.tiles[tileId];
    if (!t || t.name === name) return ts;
    return { ...ts, tiles: { ...ts.tiles, [tileId]: { ...t, name } } };
  });
}

/** Moves a tile within the parent order. */
export function moveTile(p: Project, tsId: Id, tileId: TileId, toIndex: number): Project {
  return mapTileset(p, tsId, (ts) => {
    const from = ts.tileOrder.indexOf(tileId);
    if (from < 0) return ts;
    const tileOrder = ts.tileOrder.slice();
    tileOrder.splice(from, 1);
    tileOrder.splice(Math.max(0, Math.min(toIndex, tileOrder.length)), 0, tileId);
    return { ...ts, tileOrder };
  });
}

/** A user-requested copy of a tile, inserted right after the original. Returns the new id too. */
export function duplicateTile(p: Project, tsId: Id, tileId: TileId): { project: Project; tileId: TileId | null } {
  const ts = findTileset(p, tsId);
  const t = ts?.tiles[tileId];
  if (!ts || !t) return { project: p, tileId: null };
  const copy: Tile = { id: newId(), name: t.name + "_copy", pixels: t.pixels.slice() };
  return { project: addTile(p, tsId, copy, ts.tileOrder.indexOf(tileId) + 1), tileId: copy.id };
}

/** Deletes a tile everywhere: parent, subset slots/cells (left empty) and preview cells (cleared). */
export function deleteTiles(p: Project, tsId: Id, tileIds: TileId[]): Project {
  const gone = new Set(tileIds);
  return mapTileset(p, tsId, (ts) => {
    if (!tileIds.some((id) => ts.tiles[id])) return ts;
    const tiles = { ...ts.tiles };
    for (const id of gone) delete tiles[id];
    const next = { ...ts, tiles, tileOrder: ts.tileOrder.filter((id) => !gone.has(id)) };
    return remapRefs(next, (id) => (gone.has(id) ? null : id));
  });
}

export const deleteTile = (p: Project, tsId: Id, tileId: TileId) => deleteTiles(p, tsId, [tileId]);

/**
 * User-confirmed merge (near-duplicate review): every reference to a tile in
 * `merged` now points to `survivor`, and the merged tiles are removed.
 */
export function mergeTiles(p: Project, tsId: Id, survivor: TileId, merged: TileId[]): Project {
  const gone = new Set(merged.filter((id) => id !== survivor));
  if (gone.size === 0) return p;
  return mapTileset(p, tsId, (ts) => {
    if (!ts.tiles[survivor]) return ts;
    const tiles = { ...ts.tiles };
    for (const id of gone) delete tiles[id];
    // The survivor takes the earliest position any merged tile had, so the sheet order stays stable.
    const firstPos = ts.tileOrder.findIndex((id) => id === survivor || gone.has(id));
    const tileOrder = ts.tileOrder.filter((id) => id !== survivor && !gone.has(id));
    tileOrder.splice(firstPos, 0, survivor);
    return remapRefs({ ...ts, tiles, tileOrder }, (id) => (gone.has(id) ? survivor : id));
  });
}

// ---------- subsets ----------

export function addSubset(p: Project, tsId: Id, s: Subset): Project {
  return mapTileset(p, tsId, (ts) => ({ ...ts, subsets: [...ts.subsets, s] }));
}

export function deleteSubset(p: Project, tsId: Id, subsetId: Id): Project {
  return mapTileset(p, tsId, (ts) => ({ ...ts, subsets: ts.subsets.filter((s) => s.id !== subsetId) }));
}

export function updateSubset(p: Project, tsId: Id, subsetId: Id, patch: Partial<Pick<Subset, "name" | "terrains">>): Project {
  return mapTileset(p, tsId, (ts) => mapSubset(ts, subsetId, (s) => ({ ...s, ...patch })));
}

/** Points a subset cell/slot at a tile (or empties it). The tile must belong to the parent. */
export function setSubsetCell(p: Project, tsId: Id, subsetId: Id, index: number, tileId: TileId | null): Project {
  return mapTileset(p, tsId, (ts) => {
    if (tileId !== null && !ts.tiles[tileId]) return ts;
    return mapSubset(ts, subsetId, (s) => {
      if (index < 0 || index >= s.cells.length || s.cells[index] === tileId) return s;
      const cells = s.cells.slice();
      cells[index] = tileId;
      return { ...s, cells };
    });
  });
}

/** Moves a tile reference between two cells of the same subset (swapping with whatever is there). */
export function swapSubsetCells(p: Project, tsId: Id, subsetId: Id, a: number, b: number): Project {
  return mapTileset(p, tsId, (ts) =>
    mapSubset(ts, subsetId, (s) => {
      if (a === b || a < 0 || b < 0 || a >= s.cells.length || b >= s.cells.length) return s;
      const cells = s.cells.slice();
      [cells[a], cells[b]] = [cells[b], cells[a]];
      return { ...s, cells };
    }),
  );
}

/**
 * Creates a new blank tile inside a subset slot. It joins the parent automatically.
 * Templated slots get the slot auto-name. Returns the new tile id.
 */
export function addTileInSubset(p: Project, tsId: Id, subsetId: Id, index: number, pixels?: Uint8ClampedArray): { project: Project; tileId: TileId | null } {
  const ts = findTileset(p, tsId);
  const s = ts?.subsets.find((x) => x.id === subsetId);
  if (!ts || !s || index < 0 || index >= s.cells.length) return { project: p, tileId: null };
  const t = templateOf(s);
  const name = t ? slotName(s.terrains, t.slots[index].wangId) : `${s.name}_${index}`;
  const tile = createTile(ts, name, pixels);
  let next = addTile(p, tsId, tile);
  next = setSubsetCell(next, tsId, subsetId, index, tile.id);
  return { project: next, tileId: tile.id };
}

/** User command: rename every tile in a templated subset after its slot. */
export function nameTilesFromSlots(p: Project, tsId: Id, subsetId: Id): Project {
  const ts = findTileset(p, tsId);
  const s = ts?.subsets.find((x) => x.id === subsetId);
  const t = s && templateOf(s);
  if (!s || !t) return p;
  let next = p;
  s.cells.forEach((id, i) => {
    if (id) next = renameTile(next, tsId, id, slotName(s.terrains, t.slots[i].wangId));
  });
  return next;
}

/** Resizes an unstructured subset's arrangement grid, keeping cells at the same (col,row). */
export function resizeSubset(p: Project, tsId: Id, subsetId: Id, cols: number, rows: number): Project {
  return mapTileset(p, tsId, (ts) =>
    mapSubset(ts, subsetId, (s) => {
      if (s.type !== "unstructured" || cols < 1 || rows < 1) return s;
      return { ...s, cols, rows, cells: resizeGrid(s.cells, s.cols, s.rows, cols, rows) };
    }),
  );
}

// ---------- previews ----------

export function addPreview(p: Project, tsId: Id, pv: Preview): Project {
  return mapTileset(p, tsId, (ts) => ({ ...ts, previews: [...ts.previews, pv] }));
}

export function deletePreview(p: Project, tsId: Id, previewId: Id): Project {
  return mapTileset(p, tsId, (ts) => ({ ...ts, previews: ts.previews.filter((pv) => pv.id !== previewId) }));
}

export function renamePreview(p: Project, tsId: Id, previewId: Id, name: string): Project {
  return mapTileset(p, tsId, (ts) => mapPreviewIn(ts, previewId, (pv) => ({ ...pv, name })));
}

/** Stamps (tileId) or clears (null) cells of a map preview or subset preview. */
export function setPreviewCells(p: Project, tsId: Id, previewId: Id, edits: { index: number; tileId: TileId | null }[]): Project {
  return mapTileset(p, tsId, (ts) =>
    mapPreviewIn(ts, previewId, (pv) => {
      let cells: (TileId | null)[] | null = null;
      for (const { index, tileId } of edits) {
        if (index < 0 || index >= pv.cells.length) continue;
        if (tileId !== null && !ts.tiles[tileId]) continue;
        if ((cells ?? pv.cells)[index] === tileId) continue;
        cells ??= pv.cells.slice();
        cells[index] = tileId;
      }
      return cells ? { ...pv, cells } : pv;
    }),
  );
}

export function resizePreview(p: Project, tsId: Id, previewId: Id, cols: number, rows: number): Project {
  if (cols < 1 || rows < 1) return p;
  return mapTileset(p, tsId, (ts) => mapPreviewIn(ts, previewId, (pv) => ({ ...pv, cols, rows, cells: resizeGrid(pv.cells, pv.cols, pv.rows, cols, rows) })));
}

export function resizeGrid<T>(cells: (T | null)[], cols: number, rows: number, nc: number, nr: number): (T | null)[] {
  const out: (T | null)[] = new Array(nc * nr).fill(null);
  for (let r = 0; r < Math.min(rows, nr); r++) for (let c = 0; c < Math.min(cols, nc); c++) out[r * nc + c] = cells[r * cols + c] ?? null;
  return out;
}

// ---------- palette ----------

export const setPalette = (p: Project, palette: Palette): Project => ({ ...p, palette });

export function addPaletteColors(p: Project, colors: Color[]): Project {
  const have = new Set(p.palette.colors);
  const add = colors.filter((c) => !have.has(c) && (have.add(c), true));
  return add.length ? { ...p, palette: { ...p.palette, colors: [...p.palette.colors, ...add] } } : p;
}

export function removePaletteColor(p: Project, index: number): Project {
  if (index < 0 || index >= p.palette.colors.length) return p;
  return { ...p, palette: { ...p.palette, colors: p.palette.colors.filter((_, i) => i !== index) } };
}

export function replacePaletteColor(p: Project, index: number, c: Color): Project {
  if (index < 0 || index >= p.palette.colors.length) return p;
  const colors = p.palette.colors.slice();
  colors[index] = c;
  return { ...p, palette: { ...p.palette, colors } };
}

export const setPaletteLocked = (p: Project, locked: boolean): Project => ({ ...p, palette: { ...p.palette, locked } });

// ---------- queries ----------

/** Where a tile is used: subset names and preview names. */
export function tileUsage(ts: Tileset, tileId: TileId): { subsets: Subset[]; previews: Preview[] } {
  return {
    subsets: ts.subsets.filter((s) => s.cells.includes(tileId)),
    previews: allPreviews(ts).filter((pv) => pv.cells.includes(tileId)),
  };
}
