/**
 * Domain model. Each tile exists exactly once, in its parent tileset's `tiles`.
 * Subsets and previews hold references (TileId | null) only.
 * All objects are treated as immutable: ops return new objects.
 */

export type TileId = string;
export type Id = string;

/** Packed 0xRRGGBBAA, unsigned. */
export type Color = number;

export interface Tile {
  id: TileId;
  name: string;
  /** RGBA, row-major, length = tileWidth * tileHeight * 4. Never mutate a stored array. */
  pixels: Uint8ClampedArray;
}

export type GridType = "square" | "isometric" | "hex";

export interface Terrain {
  name: string;
  /** Display/Wang color, "#rrggbb". */
  color: string;
}

export type SubsetType = "unstructured" | "blob47" | "corner16" | "edge16" | "custom";
export type WangType = "corner" | "edge" | "mixed";

export interface TemplateSlot {
  col: number;
  row: number;
  /** 8 values clockwise from top: top, TR, right, BR, bottom, BL, left, TL. 0 = unused, 1 = terrain A, 2 = terrain B. */
  wangId: number[];
}

export interface Template {
  wangType: WangType;
  cols: number;
  rows: number;
  slots: TemplateSlot[];
}

/** A grid of tile references, used for map previews and subset previews. */
export interface Preview {
  id: Id;
  name: string;
  cols: number;
  rows: number;
  /** length = cols * rows, row-major. */
  cells: (TileId | null)[];
}

export interface Subset {
  id: Id;
  name: string;
  type: SubsetType;
  /**
   * Unstructured: a cols x rows arrangement grid (cells.length = cols * rows).
   * Templated: one entry per template slot, in slot order (cols/rows mirror the template).
   */
  cols: number;
  rows: number;
  cells: (TileId | null)[];
  /** [A, B]. Unused for unstructured subsets. */
  terrains: [Terrain, Terrain];
  /** Only for type "custom". */
  template?: Template;
  preview: Preview;
}

export interface Tileset {
  id: Id;
  name: string;
  tileWidth: number;
  tileHeight: number;
  grid: GridType;
  /** Display and export order of the parent sheet. */
  tileOrder: TileId[];
  tiles: Record<TileId, Tile>;
  subsets: Subset[];
  previews: Preview[];
}

export interface Palette {
  colors: Color[];
  /** When locked, drawing tools may only use palette colors. */
  locked: boolean;
}

export interface Project {
  version: 1;
  name: string;
  palette: Palette;
  tilesets: Tileset[];
}

export const DEFAULT_TILE_SIZE = 16;
