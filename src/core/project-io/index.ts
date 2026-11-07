import { parseHex, toHex } from "../color";
import { isValidId, newId } from "../ids";
import type { GridType, Preview, Project, Subset, SubsetType, Template, Terrain, Tile, TileId, Tileset } from "../model";
import { createPixels } from "../pixels";
import { decodePng, encodePng } from "../png";
import { templateOf, validateTemplate } from "../templates";

/**
 * Project folder format:
 *   project.json   structure (tilesets, subsets, slots, terrains, previews, palette)
 *   tiles/<id>.png one PNG per tile, named by its stable id
 * Loading is forgiving: problems become warnings and the rest still loads.
 */

export const PROJECT_FILE = "project.json";
export const FORMAT = "tilestudio-project";
export const FORMAT_VERSION = 1;
export const PROJECT_EXT = ".tilestudio";

export type FileTree = Map<string, Uint8Array>;

interface JsonPreview {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cells: (string | null)[];
}

interface JsonSubset {
  id: string;
  name: string;
  type: SubsetType;
  cols: number;
  rows: number;
  cells: (string | null)[];
  terrains: [Terrain, Terrain];
  template?: Template;
  preview: JsonPreview;
}

interface JsonTileset {
  id: string;
  name: string;
  tileWidth: number;
  tileHeight: number;
  grid: GridType;
  tiles: { id: string; name: string }[];
  subsets: JsonSubset[];
  previews: JsonPreview[];
}

interface JsonProject {
  format: typeof FORMAT;
  version: number;
  name: string;
  palette: { colors: string[]; locked: boolean };
  tilesets: JsonTileset[];
}

const tilePath = (id: TileId) => `tiles/${id}.png`;

const pvToJson = (pv: Preview): JsonPreview => ({ id: pv.id, name: pv.name, cols: pv.cols, rows: pv.rows, cells: pv.cells });

/**
 * Tiles whose file couldn't be read load as blank placeholders. Until the user
 * edits one (its pixels array is replaced), saving writes the original bytes
 * back, so a damaged file is never silently overwritten with a blank tile.
 */
export type PreservedTiles = Map<TileId, { placeholder: Uint8ClampedArray; bytes: Uint8Array }>;

export function serializeProject(p: Project, preserved?: PreservedTiles): FileTree {
  const files: FileTree = new Map();
  const json: JsonProject = {
    format: FORMAT,
    version: FORMAT_VERSION,
    name: p.name,
    palette: { colors: p.palette.colors.map(toHex), locked: p.palette.locked },
    tilesets: p.tilesets.map((ts) => ({
      id: ts.id,
      name: ts.name,
      tileWidth: ts.tileWidth,
      tileHeight: ts.tileHeight,
      grid: ts.grid,
      tiles: ts.tileOrder.map((id) => ({ id, name: ts.tiles[id].name })),
      subsets: ts.subsets.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        cols: s.cols,
        rows: s.rows,
        cells: s.cells,
        terrains: s.terrains,
        ...(s.template ? { template: s.template } : {}),
        preview: pvToJson(s.preview),
      })),
      previews: ts.previews.map(pvToJson),
    })),
  };
  files.set(PROJECT_FILE, new TextEncoder().encode(JSON.stringify(json, null, 2) + "\n"));
  for (const ts of p.tilesets) {
    for (const id of ts.tileOrder) {
      const keep = preserved?.get(id);
      if (keep && keep.placeholder === ts.tiles[id].pixels) files.set(tilePath(id), keep.bytes);
      else files.set(tilePath(id), encodePng(ts.tiles[id].pixels, ts.tileWidth, ts.tileHeight));
    }
  }
  return files;
}

export interface LoadResult {
  project: Project;
  warnings: string[];
  /** Pass back to serializeProject so damaged tile files survive a save. */
  preserved: PreservedTiles;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const posInt = (v: unknown, d: number) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : d);

/** Reads a project folder. Throws only if project.json is missing or unreadable. */
export function deserializeProject(files: FileTree): LoadResult {
  const raw = files.get(PROJECT_FILE);
  if (!raw) throw new Error("This folder has no project.json, so it isn't a Pix project.");
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    throw new Error(`project.json is not valid JSON: ${(e as Error).message}`);
  }
  if (!isObj(json) || json.format !== FORMAT) throw new Error("project.json is not a Pix project file.");
  if (typeof json.version !== "number" || json.version > FORMAT_VERSION) throw new Error(`This project was saved by a newer version of Pix (format ${String(json.version)}).`);

  const warnings: string[] = [];
  const palIn = isObj(json.palette) ? json.palette : {};
  const colors = (Array.isArray(palIn.colors) ? palIn.colors : []).flatMap((c) => {
    const v = typeof c === "string" ? parseHex(c) : null;
    if (v === null) warnings.push(`Skipped an invalid palette colour: ${JSON.stringify(c)}`);
    return v === null ? [] : [v];
  });
  const seenTileIds = new Set<string>();
  const preserved: PreservedTiles = new Map();

  const tilesets: Tileset[] = (Array.isArray(json.tilesets) ? json.tilesets : []).filter(isObj).map((t) => {
    const tileWidth = posInt(t.tileWidth, 16);
    const tileHeight = posInt(t.tileHeight, tileWidth);
    const tsName = str(t.name, "tileset");
    const tiles: Record<TileId, Tile> = {};
    const tileOrder: TileId[] = [];
    for (const entry of Array.isArray(t.tiles) ? t.tiles : []) {
      if (!isObj(entry) || typeof entry.id !== "string" || !isValidId(entry.id) || seenTileIds.has(entry.id)) {
        warnings.push(`Skipped a tile with a missing, invalid or duplicate id in "${tsName}".`);
        continue;
      }
      const id = entry.id;
      seenTileIds.add(id);
      const name = str(entry.name, id);
      let pixels: Uint8ClampedArray;
      const png = files.get(tilePath(id));
      if (!png) {
        warnings.push(`Tile "${name}" has no image file (${tilePath(id)}); it was loaded as a blank tile.`);
        pixels = createPixels(tileWidth, tileHeight);
      } else {
        try {
          const img = decodePng(png);
          if (img.width !== tileWidth || img.height !== tileHeight) {
            warnings.push(`Tile "${name}" is ${img.width}×${img.height} but the tileset is ${tileWidth}×${tileHeight}; it was loaded as a blank tile. Its file is kept as-is unless you draw on it.`);
            pixels = createPixels(tileWidth, tileHeight);
            preserved.set(id, { placeholder: pixels, bytes: png });
          } else pixels = img.pixels;
        } catch (e) {
          warnings.push(`Tile "${name}" could not be read (${(e as Error).message}); it was loaded as a blank tile. Its file is kept as-is unless you draw on it.`);
          pixels = createPixels(tileWidth, tileHeight);
          preserved.set(id, { placeholder: pixels, bytes: png });
        }
      }
      tiles[id] = { id, name, pixels };
      tileOrder.push(id);
    }

    const ref = (c: unknown, where: string): TileId | null => {
      if (c === null) return null;
      if (typeof c === "string" && tiles[c]) return c;
      warnings.push(`${where} referred to a tile that doesn't exist; that cell was emptied.`);
      return null;
    };
    const readPreview = (v: unknown, fallbackName: string): Preview => {
      const o = isObj(v) ? v : {};
      const cols = posInt(o.cols, 1);
      const rows = posInt(o.rows, 1);
      const name = str(o.name, fallbackName);
      const cellsIn = Array.isArray(o.cells) ? o.cells : [];
      const cells = Array.from({ length: cols * rows }, (_, i) => ref(cellsIn[i] ?? null, `Preview "${name}"`));
      return { id: str(o.id, newId()), name, cols, rows, cells };
    };

    const subsets: Subset[] = (Array.isArray(t.subsets) ? t.subsets : []).filter(isObj).flatMap((s): Subset[] => {
      const name = str(s.name, "subset");
      const type = s.type as SubsetType;
      if (!["unstructured", "blob47", "corner16", "edge16", "custom"].includes(type)) {
        warnings.push(`Skipped subset "${name}" with unknown type ${JSON.stringify(s.type)}.`);
        return [];
      }
      let template: Template | undefined;
      if (type === "custom") {
        template = s.template as Template;
        if (!isObj(template) || validateTemplate(template).length) {
          warnings.push(`Skipped custom subset "${name}": its template is invalid.`);
          return [];
        }
      }
      const tpl = templateOf({ type, template });
      const cols = tpl ? tpl.cols : posInt(s.cols, 8);
      const rows = tpl ? tpl.rows : posInt(s.rows, 4);
      const count = tpl ? tpl.slots.length : cols * rows;
      const cellsIn = Array.isArray(s.cells) ? s.cells : [];
      const cells = Array.from({ length: count }, (_, i) => ref(cellsIn[i] ?? null, `Subset "${name}"`));
      const terr = Array.isArray(s.terrains) ? s.terrains : [];
      const terrain = (v: unknown, d: Terrain): Terrain => (isObj(v) ? { name: str(v.name, d.name), color: str(v.color, d.color) } : d);
      const terrains: [Terrain, Terrain] = [terrain(terr[0], { name: "A", color: "#4caf50" }), terrain(terr[1], { name: "B", color: "#a0522d" })];
      return [{ id: str(s.id, newId()), name, type, cols, rows, cells, terrains, template, preview: readPreview(s.preview, name + " preview") }];
    });

    const grid = (["square", "isometric", "hex"].includes(t.grid as string) ? t.grid : "square") as GridType;
    return {
      id: str(t.id, newId()),
      name: tsName,
      tileWidth,
      tileHeight,
      grid,
      tileOrder,
      tiles,
      subsets,
      previews: (Array.isArray(t.previews) ? t.previews : []).map((v) => readPreview(v, "preview")),
    };
  });

  return {
    project: { version: 1, name: str(json.name, "Untitled"), palette: { colors, locked: palIn.locked === true }, tilesets },
    warnings,
    preserved,
  };
}

/** "My Game" -> "My Game.tilestudio" */
export const projectFolderName = (name: string): string => (name.endsWith(PROJECT_EXT) ? name : (name.trim() || "Untitled") + PROJECT_EXT);

/** Inverse of projectFolderName: "My Game.tilestudio" → "My Game". Other suffixes (e.g. ".zip") are dropped too. */
export const projectNameFromFolder = (folder: string): string =>
  folder.replace(/\.zip$/i, "").replace(new RegExp(`\\${PROJECT_EXT}$`, "i"), "").trim();
