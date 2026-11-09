import { zipSync } from "fflate";
import type { Id, Preview, Project, Subset, TileId, Tileset } from "../model";
import { writeGpl } from "../palette";
import { encodePng } from "../png";
import { templateOf } from "../templates";
import { autoColumns, packSheet, renderGrid, type PackOptions } from "./sheet";
import { writeTsx, type TsxTile, type TsxWangSet } from "./tsx";

export { autoColumns, packSheet, renderGrid } from "./sheet";
export { writeTsx, xmlEscape } from "./tsx";

/** Options from the Export setup dialog (spec §Export). */
export interface ExportSettings {
  scales: number[]; // any of 1..4, at least one
  columns: "auto" | number; // parent + unstructured only
  padding: number; // 0..8
  spacing: number; // 0..8
  extrusion: number; // 0..4
  includePreviews: boolean;
  perTilePngs: boolean;
  /** "all", or the ids of the tilesets (parent sheets) and subsets to export. */
  scope: "all" | Id[];
}

export const defaultExportSettings = (): ExportSettings => ({
  scales: [1],
  columns: "auto",
  padding: 0,
  spacing: 0,
  extrusion: 0,
  includePreviews: true,
  perTilePngs: false,
  scope: "all",
});

export function validateExport(s: ExportSettings): string[] {
  const errs: string[] = [];
  const int = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  if (s.scales.length === 0 || !s.scales.every((v) => int(v, 1, 4))) errs.push("Pick at least one scale between 1× and 4×.");
  if (s.columns !== "auto" && !int(s.columns, 1, 4096)) errs.push("Columns must be a positive whole number.");
  if (!int(s.padding, 0, 8)) errs.push("Padding must be 0–8 px.");
  if (!int(s.spacing, 0, 8)) errs.push("Spacing must be 0–8 px.");
  if (!int(s.extrusion, 0, 4)) errs.push("Extrusion must be 0–4 px.");
  if (Array.isArray(s.scope) && s.scope.length === 0) errs.push("Nothing selected to export.");
  return errs;
}

/** Filename-safe base name: "map example" -> "map_example". */
export function safeName(s: string): string {
  const n = s
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "");
  return n || "untitled";
}

/** Makes names unique within one folder by appending _2, _3, … */
function uniquer() {
  const used = new Set<string>();
  return (base: string) => {
    let n = base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base}_${i}`;
    used.add(n.toLowerCase());
    return n;
  };
}

const suffix = (scale: number) => (scale === 1 ? "" : `@${scale}x`);

/** A sheet before packing: a grid of tile references with layout and optional Wang data. */
interface SheetPlan {
  name: string;
  columns: number;
  cells: (TileId | null)[];
  wang?: Omit<TsxWangSet, "tiles"> & { slotWang: (number[] | null)[] };
}

function parentPlan(ts: Tileset, s: ExportSettings): SheetPlan {
  const cols = s.columns === "auto" ? autoColumns(ts.tileOrder.length) : s.columns;
  return { name: ts.name, columns: cols, cells: ts.tileOrder.slice() };
}

function subsetPlan(sub: Subset, s: ExportSettings): SheetPlan {
  const t = templateOf(sub);
  if (t) {
    // Fixed slot order: each slot sits at its template grid position; non-slot cells stay empty.
    const cells: (TileId | null)[] = new Array(t.cols * t.rows).fill(null);
    const slotWang: (number[] | null)[] = new Array(t.cols * t.rows).fill(null);
    t.slots.forEach((slot, i) => {
      const at = slot.row * t.cols + slot.col;
      cells[at] = sub.cells[i] ?? null;
      slotWang[at] = slot.wangId;
    });
    return { name: sub.name, columns: t.cols, cells, wang: { name: sub.name, type: t.wangType, colors: sub.terrains, slotWang } };
  }
  // Unstructured: the arrangement is the layout. Trailing empty rows/columns are trimmed.
  let lastRow = -1;
  let lastCol = -1;
  sub.cells.forEach((id, i) => {
    if (!id) return;
    lastRow = Math.max(lastRow, Math.floor(i / sub.cols));
    lastCol = Math.max(lastCol, i % sub.cols);
  });
  const usedCols = lastCol + 1;
  const grid: (TileId | null)[] = [];
  for (let r = 0; r <= lastRow; r++) for (let c = 0; c < usedCols; c++) grid.push(sub.cells[r * sub.cols + c] ?? null);
  if (s.columns === "auto") return { name: sub.name, columns: Math.max(1, usedCols), cells: grid };
  return { name: sub.name, columns: s.columns, cells: grid };
}

export interface ManifestSheet {
  kind: "parent" | "subset";
  name: string;
  tileset: string;
  subsetType?: string;
  files: { scale: number; png: string; tsx: string }[];
  columns: number;
  tileCount: number;
  tiles: { index: number; id: TileId; name: string }[];
}

export interface Manifest {
  generator: string;
  formatVersion: 1;
  project: string;
  exportedAt: string;
  settings: Omit<ExportSettings, "scope"> & { scope: "all" | Id[] };
  sheets: ManifestSheet[];
  previews: { name: string; tileset: string; files: string[] }[];
  palette: string | null;
}

/**
 * Builds every export file as path -> bytes. `now` is passed in so output is
 * deterministic in tests.
 */
export function buildExport(p: Project, s: ExportSettings, now: Date = new Date()): Map<string, Uint8Array> {
  const errs = validateExport(s);
  if (errs.length) throw new Error(errs.join(" "));
  const files = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  const opts = (scale: number): PackOptions => ({ scale, padding: s.padding, spacing: s.spacing, extrusion: s.extrusion });
  const inScope = (id: Id) => s.scope === "all" || s.scope.includes(id);
  const scales = [...new Set(s.scales)].sort((a, b) => a - b);
  const tilesets = p.tilesets.filter((ts) => inScope(ts.id) || ts.subsets.some((sub) => inScope(sub.id)));
  const multi = tilesets.length > 1;
  const rootNames = uniquer();
  const manifest: Manifest = {
    generator: "Pix",
    formatVersion: 1,
    project: p.name,
    exportedAt: now.toISOString(),
    settings: { ...s },
    sheets: [],
    previews: [],
    palette: null,
  };

  for (const ts of tilesets) {
    const dir = multi ? rootNames(safeName(ts.name)) + "/" : "";
    const names = uniquer();
    const subNames = uniquer();
    const pvNames = uniquer();
    const px = (id: TileId | null) => (id ? (ts.tiles[id]?.pixels ?? null) : null);

    const emit = (plan: SheetPlan, kind: "parent" | "subset", folder: string, base: string, subsetType?: string) => {
      const sheet: ManifestSheet = { kind, name: plan.name, tileset: ts.name, subsetType, files: [], columns: plan.columns, tileCount: 0, tiles: [] };
      const tsxTiles: TsxTile[] = [];
      plan.cells.forEach((id, index) => {
        const t = id ? ts.tiles[id] : undefined;
        if (!t) return;
        tsxTiles.push({ index, name: t.name });
        sheet.tiles.push({ index, id: t.id, name: t.name });
      });
      for (const scale of scales) {
        const packed = packSheet(plan.cells.map(px), plan.columns, ts.tileWidth, ts.tileHeight, opts(scale));
        const file = base + suffix(scale);
        files.set(folder + file + ".png", encodePng(packed.pixels, packed.width, packed.height));
        const tileCount = packed.columns * packed.rows;
        sheet.tileCount = tileCount;
        let wangSet: TsxWangSet | undefined;
        if (plan.wang) {
          const tiles = plan.wang.slotWang.flatMap((w, index) => (w && plan.cells[index] && ts.tiles[plan.cells[index]!] ? [{ index, wangId: w }] : []));
          wangSet = { name: plan.wang.name, type: plan.wang.type, colors: plan.wang.colors, tiles };
        }
        const tsx = writeTsx({
          name: plan.name + suffix(scale),
          image: file + ".png",
          imageWidth: packed.width,
          imageHeight: packed.height,
          tileWidth: packed.tileWidth,
          tileHeight: packed.tileHeight,
          margin: packed.tsxMargin,
          spacing: packed.tsxSpacing,
          columns: packed.columns,
          tileCount,
          tiles: tsxTiles,
          wangSet,
        });
        files.set(folder + file + ".tsx", enc.encode(tsx));
        sheet.files.push({ scale, png: folder + file + ".png", tsx: folder + file + ".tsx" });
      }
      manifest.sheets.push(sheet);
    };

    if (inScope(ts.id)) emit(parentPlan(ts, s), "parent", dir, names(safeName(ts.name)));
    for (const sub of ts.subsets) if (inScope(sub.id)) emit(subsetPlan(sub, s), "subset", dir + "subsets/", subNames(safeName(sub.name)), sub.type);

    if (s.includePreviews && inScope(ts.id)) {
      for (const pv of ts.previews) {
        const base = pvNames(safeName(pv.name));
        const entry = { name: pv.name, tileset: ts.name, files: [] as string[] };
        for (const scale of scales) {
          const path = dir + "previews/" + base + suffix(scale) + ".png";
          files.set(path, previewPng(ts, pv, scale));
          entry.files.push(path);
        }
        manifest.previews.push(entry);
      }
    }

    if (s.perTilePngs && inScope(ts.id)) {
      const tileNames = uniquer();
      for (const id of ts.tileOrder) {
        const t = ts.tiles[id];
        files.set(dir + "tiles/" + tileNames(safeName(t.name)) + ".png", encodePng(t.pixels, ts.tileWidth, ts.tileHeight));
      }
    }
  }

  if (p.palette.colors.length) {
    files.set("palette.gpl", enc.encode(writeGpl(p.name, p.palette.colors)));
    manifest.palette = "palette.gpl";
  }
  files.set("manifest.json", enc.encode(JSON.stringify(manifest, null, 2) + "\n"));
  return files;
}

/** A preview (map or subset) as PNG bytes at an integer scale. */
export function previewPng(ts: Tileset, pv: Preview, scale: number): Uint8Array {
  const img = renderGrid(
    pv.cells.map((id) => (id ? (ts.tiles[id]?.pixels ?? null) : null)),
    pv.cols,
    pv.rows,
    ts.tileWidth,
    ts.tileHeight,
    scale,
  );
  return encodePng(img.pixels, img.width, img.height);
}

export function zipFiles(files: Map<string, Uint8Array>): Uint8Array {
  const obj: Record<string, Uint8Array> = {};
  // Manifest first so it's easy to find when listing the archive.
  if (files.has("manifest.json")) obj["manifest.json"] = files.get("manifest.json")!;
  for (const [k, v] of files) if (k !== "manifest.json") obj[k] = v;
  return zipSync(obj, { level: 6 });
}

export const exportZipName = (p: Project): string => {
  const base = p.tilesets.length === 1 ? p.tilesets[0].name : p.name;
  return safeName(base) + "_export.zip";
};
