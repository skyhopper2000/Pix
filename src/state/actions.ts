import { buildExport, exportZipName, zipFiles, type ExportSettings } from "../core/export";
import type { Id, Project, TileId } from "../core/model";
import * as ops from "../core/ops";
import {
  isPaletteImageFile,
  PALETTE_FILE_EXTENSIONS,
  PALETTE_IMAGE_EXTENSIONS,
  PALETTE_IMAGE_LIMIT,
  paletteFromImage,
  parsePaletteFile,
  writeGpl,
  writeHex,
} from "../core/palette";
import { deserializeProject, projectFolderName, projectNameFromFolder, serializeProject } from "../core/project-io";
import { getPlatform } from "../platform";
import { decodeImage } from "../platform/decodeImage";
import { IMPLICIT_LAYER, layersOf } from "../core/layers";
import type { BlendMode } from "../core/model";
import { activeLayer, activeTile, activeTileset, history, openTile, reconcileSelection, setStatus, ui } from "./app";

/** Commands the UI calls. Project edits go through history.dispatch so they're undoable. */

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function showError(title: string, e: unknown) {
  ui.set({ dialog: { kind: "message", title, body: [errorText(e)] } });
  setStatus(title);
}

/** Runs `fn` now, or after the user confirms discarding unsaved changes. */
function guardUnsaved(action: string, fn: () => void) {
  if (!history.dirty) return fn();
  ui.set({
    dialog: {
      kind: "confirm",
      title: "Discard unsaved changes?",
      body: `The project has unsaved changes. ${action} anyway?`,
      confirmLabel: "Discard changes",
      onConfirm: fn,
    },
  });
}

export function newProject() {
  guardUnsaved("Start a new project", () => {
    history.reset(ops.createProject("Untitled"));
    ui.set({ projectTarget: null, preserved: new Map(), lastExport: null, tilesetId: null, tileId: null, subsetId: null, previewId: null, slotIndex: null });
    reconcileSelection();
    setStatus("New project");
  });
}

export function openProject() {
  guardUnsaved("Open another project", async () => {
    try {
      const platform = await getPlatform();
      const folder = await platform.openFolder();
      if (!folder) return;
      const { project, warnings, preserved } = deserializeProject(folder.files);
      history.reset(project);
      ui.set({ projectTarget: folder.target, preserved, lastExport: null, tilesetId: null });
      reconcileSelection();
      setStatus(`Opened ${folder.name}`);
      if (warnings.length) ui.set({ dialog: { kind: "message", title: "Opened with warnings", body: warnings } });
    } catch (e) {
      showError("Couldn't open the project", e);
    }
  });
}

export async function saveProject(forceAs = false) {
  try {
    const platform = await getPlatform();
    const target = ui.get().projectTarget;
    if (target && !forceAs) {
      await platform.saveFolderTo(target, serializeProject(history.project, ui.get().preserved));
      history.markSaved();
      setStatus(`Saved ${target.label}`);
      return;
    }
    const t = await platform.chooseFolderTarget(projectFolderName(history.project.name));
    if (!t) return;
    // The name typed in the Save dialog becomes the project's name.
    const chosen = projectNameFromFolder(t.label);
    if (chosen && chosen !== history.project.name) history.dispatch("Rename project", (p) => ops.renameProject(p, chosen));
    await platform.saveFolderTo(t, serializeProject(history.project, ui.get().preserved));
    ui.set({ projectTarget: t });
    history.markSaved();
    setStatus(`Saved ${t.label}`);
  } catch (e) {
    showError("Couldn't save the project", e);
  }
}

export function newTileset(name: string, tileWidth: number, tileHeight: number) {
  const ts = ops.createTileset(name.trim() || "tileset", tileWidth, tileHeight);
  history.dispatch("New tileset", (p) => ops.addTileset(p, ts));
  // The editor opens on a draft blank tile; it joins the tileset on the first stroke.
  ui.set({ tilesetId: ts.id, subsetId: null, slotIndex: null, previewId: null, tileId: null, previewCell: null });
  setStatus(`Created tileset "${ts.name}"`);
}

export async function startImport() {
  if (!activeTileset()) {
    ui.set({ dialog: { kind: "message", title: "No tileset", body: ["Create a tileset first (Tileset › New Tileset), then import into it."] } });
    return;
  }
  try {
    const platform = await getPlatform();
    const f = await platform.openFile([{ name: "Images", extensions: ["png", "gif", "bmp", "jpg", "jpeg", "webp"] }]);
    if (f) ui.set({ dialog: { kind: "import", fileName: f.name, bytes: f.bytes } });
  } catch (e) {
    showError("Couldn't read the image", e);
  }
}

export async function runExport(settings: ExportSettings) {
  try {
    const p = history.project;
    const zip = zipFiles(buildExport(p, settings));
    const platform = await getPlatform();
    const target = await platform.saveFileAs(exportZipName(p), [{ name: "Zip archive", extensions: ["zip"] }], zip);
    if (!target) return;
    ui.set({ lastExport: { settings, target }, dialog: null });
    setStatus(`Exported ${target.label}`);
  } catch (e) {
    showError("Export failed", e);
  }
}

/** Ctrl+Shift+E: repeat the last export with the same settings and path. */
export async function exportAgain() {
  const last = ui.get().lastExport;
  if (!last) {
    ui.set({ dialog: { kind: "export" } });
    return;
  }
  try {
    const zip = zipFiles(buildExport(history.project, last.settings));
    await (await getPlatform()).saveFileTo(last.target, zip);
    setStatus(`Exported again to ${last.target.label}`);
  } catch (e) {
    showError("Export failed", e);
  }
}

export async function importPalette() {
  try {
    const f = await (await getPlatform()).openFile([
      { name: "Palettes and images", extensions: [...PALETTE_FILE_EXTENSIONS, ...PALETTE_IMAGE_EXTENSIONS] },
      { name: "Palette files", extensions: PALETTE_FILE_EXTENSIONS },
      { name: `Images (up to ${PALETTE_IMAGE_LIMIT} colours)`, extensions: PALETTE_IMAGE_EXTENSIONS },
    ]);
    if (!f) return;
    // Images only contribute their colours; nothing else from the file is imported.
    const pal = isPaletteImageFile(f.name) ? paletteFromImage(await decodeImage(f.bytes)) : parsePaletteFile(f.name, f.bytes);
    history.dispatch("Import palette", (p) => ops.addPaletteColors(p, pal.colors));
    setStatus(`Imported ${pal.colors.length} colours from ${f.name}`);
  } catch (e) {
    showError("Couldn't import the palette", e);
  }
}

export async function exportPalette(format: "gpl" | "hex") {
  const p = history.project;
  const text = format === "gpl" ? writeGpl(p.name, p.palette.colors) : writeHex(p.palette.colors);
  try {
    const t = await (await getPlatform()).saveFileAs(`${p.name}.${format}`, [{ name: format === "gpl" ? "GIMP palette" : "Hex palette", extensions: [format] }], new TextEncoder().encode(text));
    if (t) setStatus(`Saved palette ${t.label}`);
  } catch (e) {
    showError("Couldn't save the palette", e);
  }
}

// ---------- tile commands ----------

export function addBlankTile() {
  const ts = activeTileset();
  if (!ts) return;
  const tile = ops.createTile(ts, `tile_${ts.tileOrder.length}`);
  history.dispatch("New tile", (p) => ops.addTile(p, ts.id, tile));
  openTile(tile.id, { subsetId: ui.get().subsetId, slotIndex: null });
}

export function duplicateActiveTile() {
  const ts = activeTileset();
  const id = ui.get().tileId;
  if (!ts || !id) return;
  let newId: TileId | null = null;
  history.dispatch("Duplicate tile", (p) => {
    const r = ops.duplicateTile(p, ts.id, id);
    newId = r.tileId;
    return r.project;
  });
  if (newId) openTile(newId);
}

export function deleteActiveTile() {
  const id = ui.get().tileId;
  if (id) deleteTileById(id);
}

/** Deletes a tile everywhere (asks first when a subset or preview uses it). */
export function deleteTileById(id: TileId) {
  const ts = activeTileset();
  const t = ts?.tiles[id];
  if (!ts || !t) return;
  const uses = ops.tileUsage(ts, id);
  const where = [...uses.subsets.map((s) => `subset "${s.name}"`), ...uses.previews.map((v) => `preview "${v.name}"`)];
  const doIt = () => {
    history.dispatch("Delete tile", (p) => ops.deleteTile(p, ts.id, id));
    setStatus(`Deleted ${t.name}`);
  };
  if (where.length === 0) return doIt();
  ui.set({
    dialog: {
      kind: "confirm",
      title: `Delete "${t.name}"?`,
      body: `It is used in ${where.join(", ")}. Those slots and cells will be emptied. (You can undo.)`,
      confirmLabel: "Delete tile",
      onConfirm: doIt,
    },
  });
}

export function rename(what: "tile" | "tileset" | "subset" | "preview" | "project" | "layer", id: Id, name: string) {
  const ts = activeTileset();
  const n = name.trim();
  if (!n) return;
  history.dispatch(`Rename ${what}`, (p: Project) => {
    switch (what) {
      case "project":
        return ops.renameProject(p, n);
      case "tileset":
        return ops.renameTileset(p, id, n);
      case "tile":
        return ts ? ops.renameTile(p, ts.id, id, n) : p;
      case "subset":
        return ts ? ops.updateSubset(p, ts.id, id, { name: n }) : p;
      case "preview":
        return ts ? ops.renamePreview(p, ts.id, id, n) : p;
      case "layer": {
        const tileId = ui.get().tileId;
        return ts && tileId ? ops.renameLayer(p, ts.id, tileId, id, n) : p;
      }
    }
  });
}

/** Opens the export dialog scoped to one tileset (its parent sheet and every subset) or one subset. */
export function exportSet(id: Id) {
  const p = history.project;
  const ts = p.tilesets.find((t) => t.id === id);
  if (ts) {
    ui.set({ dialog: { kind: "export", scope: [ts.id, ...ts.subsets.map((s) => s.id)], title: `Export Tileset "${ts.name}"` } });
    return;
  }
  const sub = p.tilesets.flatMap((t) => t.subsets).find((s) => s.id === id);
  if (sub) ui.set({ dialog: { kind: "export", scope: [sub.id], title: `Export Subset "${sub.name}"` } });
}

export function selectTileset(id: Id) {
  const ts = history.project.tilesets.find((t) => t.id === id);
  if (!ts) return;
  ui.set({ tilesetId: id, subsetId: null, slotIndex: null, previewId: ts.previews[0]?.id ?? null, tileId: ts.tileOrder[0] ?? null, previewCell: null });
}

export function selectSubset(id: Id | null) {
  const ts = activeTileset();
  const sub = ts?.subsets.find((s) => s.id === id);
  ui.set({ subsetId: sub ? sub.id : null, slotIndex: null });
}

export function deleteSubset(id: Id) {
  const ts = activeTileset();
  const sub = ts?.subsets.find((s) => s.id === id);
  if (!ts || !sub) return;
  ui.set({
    dialog: {
      kind: "confirm",
      title: `Delete subset "${sub.name}"?`,
      body: "Its tiles stay in the parent tileset. Only the subset's arrangement and preview are removed. (You can undo.)",
      confirmLabel: "Delete subset",
      onConfirm: () => history.dispatch("Delete subset", (p) => ops.deleteSubset(p, ts.id, id)),
    },
  });
}

export function deletePreview(id: Id) {
  const ts = activeTileset();
  if (!ts) return;
  history.dispatch("Delete preview", (p) => ops.deletePreview(p, ts.id, id));
}

export function deleteTileset(id: Id) {
  const ts = history.project.tilesets.find((t) => t.id === id);
  if (!ts) return;
  ui.set({
    dialog: {
      kind: "confirm",
      title: `Delete tileset "${ts.name}"?`,
      body: `This deletes its ${ts.tileOrder.length} tiles, ${ts.subsets.length} subsets and ${ts.previews.length} previews. (You can undo.)`,
      confirmLabel: "Delete tileset",
      onConfirm: () => history.dispatch("Delete tileset", (p) => ops.deleteTileset(p, id)),
    },
  });
}

export function undo() {
  if (history.inGesture) return;
  const label = history.undoLabel;
  history.undo();
  if (label) setStatus(`Undid ${label}`);
}

export function redo() {
  if (history.inGesture) return;
  const label = history.redoLabel;
  history.redo();
  if (label) setStatus(`Redid ${label}`);
}

// ---------- layers ----------

/** The open tile and its tileset, or null when no saved tile is open (a draft has no layers yet). */
function layerTarget() {
  const ts = activeTileset();
  const tile = activeTile();
  return ts && tile ? { ts, tile } : null;
}

/** Hidden/locked flags follow a layer whose id changes (a plain tile's implicit layer gets a real id, and back). */
function carryFlags(from: Id, to: Id) {
  if (from === to) return;
  const u = ui.get();
  const move = (set: ReadonlySet<Id>) => {
    if (!set.has(from)) return set;
    const n = new Set(set);
    n.delete(from);
    n.add(to);
    return n;
  };
  ui.set({ hiddenLayers: move(u.hiddenLayers), lockedLayers: move(u.lockedLayers) });
}

/** Runs a layer op that may turn a plain tile layered or back, keeping the base layer's flags. */
function layerEdit(label: string, fn: (p: Project, tsId: Id, tileId: TileId) => Project) {
  const t = layerTarget();
  if (!t) return;
  const beforeBase = layersOf(t.tile)[0].id;
  history.dispatch(label, (p) => fn(p, t.ts.id, t.tile.id));
  const after = activeTile();
  if (after) carryFlags(beforeBase, layersOf(after)[0].id);
}

export function addLayer() {
  const t = layerTarget();
  if (!t) return setStatus("Draw something first: a new tile gets layers once it exists.");
  const cur = activeLayer(t.tile)!;
  let id: Id | null = null;
  layerEdit("Add layer", (p, tsId, tileId) => {
    const r = ops.addLayer(p, tsId, tileId, cur.layer.id === IMPLICIT_LAYER ? undefined : cur.layer.id);
    id = r.layerId;
    return r.project;
  });
  if (id) ui.set({ layerId: id });
}

export function duplicateLayer() {
  const t = layerTarget();
  if (!t) return;
  const cur = activeLayer(t.tile)!;
  let id: Id | null = null;
  layerEdit("Duplicate layer", (p, tsId, tileId) => {
    const r = ops.duplicateLayer(p, tsId, tileId, cur.layer.id);
    id = r.layerId;
    return r.project;
  });
  if (id) ui.set({ layerId: id });
}

export function deleteLayer(layerId?: Id) {
  const t = layerTarget();
  if (!t) return;
  const ls = layersOf(t.tile);
  if (ls.length < 2) return setStatus("A tile always keeps at least one layer.");
  const target = layerId ?? activeLayer(t.tile)!.layer.id;
  const i = ls.findIndex((l) => l.id === target);
  layerEdit("Delete layer", (p, tsId, tileId) => ops.deleteLayer(p, tsId, tileId, target));
  const after = activeTile();
  if (after) ui.set({ layerId: layersOf(after)[Math.max(0, i - 1)]?.id ?? null });
}

export function moveLayer(delta: number) {
  const t = layerTarget();
  if (!t) return;
  const cur = activeLayer(t.tile)!;
  layerEdit(delta > 0 ? "Move layer up" : "Move layer down", (p, tsId, tileId) => ops.moveLayer(p, tsId, tileId, cur.layer.id, delta));
}

export function setLayerBlend(layerId: Id, blend: BlendMode) {
  layerEdit(blend === "normal" ? "Layer blend: Normal" : "Layer blend: Replace", (p, tsId, tileId) => ops.setLayerBlend(p, tsId, tileId, layerId, blend));
}

export function renameActiveLayer() {
  const t = layerTarget();
  if (!t) return;
  const cur = activeLayer(t.tile)!;
  if (!t.tile.layers) return setStatus("Add a second layer to name layers.");
  ui.set({ dialog: { kind: "rename", what: "layer", id: cur.layer.id, current: cur.layer.name } });
}

function toggleIn(key: "hiddenLayers" | "lockedLayers", layerId: Id) {
  const n = new Set(ui.get()[key]);
  if (n.has(layerId)) n.delete(layerId);
  else n.add(layerId);
  ui.set({ [key]: n } as Partial<ReturnType<typeof ui.get>>);
}

export const toggleLayerHidden = (layerId: Id) => toggleIn("hiddenLayers", layerId);
export const toggleLayerLocked = (layerId: Id) => toggleIn("lockedLayers", layerId);
