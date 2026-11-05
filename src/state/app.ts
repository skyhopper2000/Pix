import { useSyncExternalStore } from "react";
import { pack } from "../core/color";
import type { ExportSettings } from "../core/export";
import type { Color, Id, Preview, Project, Subset, Tile, TileId, Tileset } from "../core/model";
import { createProject, findPreview, findTileset } from "../core/ops";
import type { PreservedTiles } from "../core/project-io";
import type { SaveTarget } from "../platform";
import { ProjectHistory } from "./history";
import { Store, useStore } from "./store";

export type ToolId = "pencil" | "eraser" | "fill" | "line" | "rect" | "ellipse" | "shade" | "select" | "picker";
export type PreviewTool = "draw" | "stamp" | "clear";

export type Dialog =
  | { kind: "newTileset" }
  | { kind: "newSubset" }
  | { kind: "newPreview" }
  | { kind: "import"; fileName: string; bytes: Uint8Array }
  | { kind: "export" }
  | { kind: "nearDup" }
  | { kind: "rename"; what: "tile" | "tileset" | "subset" | "preview" | "project"; id: Id; current: string }
  | { kind: "terrains"; subsetId: Id }
  | { kind: "resize"; what: "subset" | "preview"; id: Id; cols: number; rows: number }
  | { kind: "message"; title: string; body: string[] }
  | { kind: "confirm"; title: string; body: string; confirmLabel: string; onConfirm: () => void };

/** A rectangular pixel region copied from the tile editor. */
export interface PixelClip {
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
}

export interface UiState {
  tilesetId: Id | null;
  /** The subset shown in the tile bar (null = parent). */
  subsetId: Id | null;
  /** Selected empty or filled slot in the shown subset. */
  slotIndex: number | null;
  /** The preview shown in the preview editor. */
  previewId: Id | null;
  /** The preview cell last clicked, used for neighbour context. */
  previewCell: number | null;
  /** The tile open in the tile editor. null = draft (a new blank tile, created on first stroke). */
  tileId: TileId | null;

  tool: ToolId;
  pixelPerfect: boolean;
  fillGlobal: boolean;
  shapeFilled: boolean;
  primary: Color;
  secondary: Color;

  editorZoom: number;
  /** Pixels of neighbouring tiles shown around the editor canvas. */
  neighborMargin: number;
  previewZoom: number;
  previewGrid: boolean;
  highlightUses: boolean;
  previewTool: PreviewTool;
  /** Show the faint expected-shape guide in template slots (overlay only). */
  slotGuides: boolean;

  theme: "dark" | "light";
  dialog: Dialog | null;
  commandPalette: boolean;
  status: string;
  layoutNonce: number;

  projectTarget: SaveTarget | null;
  preserved: PreservedTiles;
  lastExport: { settings: ExportSettings; target: SaveTarget } | null;
  clip: PixelClip | null;
}

const savedTheme = (): "dark" | "light" => {
  try {
    return localStorage.getItem("tilestudio.theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

export const initialUi = (): UiState => ({
  tilesetId: null,
  subsetId: null,
  slotIndex: null,
  previewId: null,
  previewCell: null,
  tileId: null,
  tool: "pencil",
  pixelPerfect: true,
  fillGlobal: false,
  shapeFilled: false,
  primary: pack(0, 0, 0),
  secondary: pack(255, 255, 255),
  editorZoom: 20,
  neighborMargin: 4,
  previewZoom: 2,
  previewGrid: true,
  highlightUses: false,
  previewTool: "draw",
  slotGuides: true,
  theme: typeof localStorage === "undefined" ? "dark" : savedTheme(),
  dialog: null,
  commandPalette: false,
  status: "Ready",
  layoutNonce: 0,
  projectTarget: null,
  preserved: new Map(),
  lastExport: null,
  clip: null,
});

export const history = new ProjectHistory(createProject("Untitled"));
export const ui = new Store<UiState>(initialUi());

export function useProject(): Project {
  return useSyncExternalStore(history.subscribe, () => history.project);
}

export function useHistoryFlags() {
  // A cheap string key keeps the snapshot stable between renders.
  const key = useSyncExternalStore(history.subscribe, () => `${history.canUndo}|${history.canRedo}|${history.dirty}|${history.undoLabel ?? ""}|${history.redoLabel ?? ""}`);
  const [canUndo, canRedo, dirty, undoLabel, redoLabel] = key.split("|");
  return { canUndo: canUndo === "true", canRedo: canRedo === "true", dirty: dirty === "true", undoLabel, redoLabel };
}

export const useUi = <R>(sel: (s: UiState) => R): R => useStore(ui, sel);

// ---------- derived selection ----------

export function activeTileset(p: Project = history.project, u: UiState = ui.get()): Tileset | undefined {
  return u.tilesetId ? findTileset(p, u.tilesetId) : undefined;
}

export function activeSubset(p: Project = history.project, u: UiState = ui.get()): Subset | undefined {
  return activeTileset(p, u)?.subsets.find((s) => s.id === u.subsetId);
}

export function activePreview(p: Project = history.project, u: UiState = ui.get()): Preview | undefined {
  const ts = activeTileset(p, u);
  return ts && u.previewId ? findPreview(ts, u.previewId) : undefined;
}

export function activeTile(p: Project = history.project, u: UiState = ui.get()): Tile | undefined {
  const ts = activeTileset(p, u);
  return ts && u.tileId ? ts.tiles[u.tileId] : undefined;
}

export const setStatus = (status: string) => ui.set({ status });

/** Opens a tile in the editor (selecting it anywhere does this). */
export function openTile(tileId: TileId | null, extra: Partial<UiState> = {}) {
  ui.set({ tileId, ...extra });
}

/** Keeps the UI selection valid after the project changes (undo, delete, open). */
export function reconcileSelection() {
  const p = history.project;
  const u = ui.get();
  let ts = u.tilesetId ? findTileset(p, u.tilesetId) : undefined;
  if (!ts) ts = p.tilesets[0];
  const patch: Partial<UiState> = {};
  if ((ts?.id ?? null) !== u.tilesetId) {
    patch.tilesetId = ts?.id ?? null;
    patch.subsetId = null;
    patch.slotIndex = null;
    patch.previewId = ts?.previews[0]?.id ?? null;
    patch.tileId = ts?.tileOrder[0] ?? null;
    patch.previewCell = null;
  } else if (ts) {
    const sub = ts.subsets.find((s) => s.id === u.subsetId);
    if (u.subsetId && !sub) {
      patch.subsetId = null;
      patch.slotIndex = null;
    } else if (sub && u.slotIndex !== null && u.slotIndex >= sub.cells.length) patch.slotIndex = null;
    if (u.previewId && !findPreview(ts, u.previewId)) patch.previewId = ts.previews[0]?.id ?? null;
    if (!u.previewId && ts.previews[0]) patch.previewId = ts.previews[0].id;
    if (u.tileId && !ts.tiles[u.tileId]) patch.tileId = null;
  }
  ui.set(patch);
}

history.subscribe(reconcileSelection);
