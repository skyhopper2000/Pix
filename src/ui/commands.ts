import * as A from "../state/actions";
import { activePreview, activeSubset, activeTileset, history, ui, type ToolId } from "../state/app";
import { nameTilesFromSlots } from "../core/ops";
import { templateOf } from "../core/templates";

/**
 * One registry drives the menus, the command palette (Ctrl+Shift+P) and
 * keyboard shortcuts, so they can never disagree.
 */

export interface Command {
  id: string;
  label: string;
  menu: "File" | "Edit" | "Tileset" | "View" | "Tools";
  shortcut?: string;
  run: () => void;
  enabled?: () => boolean;
  checked?: () => boolean;
  /** Draw a separator above this item in its menu. */
  sep?: boolean;
  /** Shortcut alias only; not listed in menus or the palette. */
  hidden?: boolean;
}

/** Set by the tile editor while it is mounted, for selection clipboard commands. */
export const editorBridge: {
  copy?: () => void;
  cut?: () => void;
  paste?: () => void;
  selectAll?: () => void;
  deselect?: () => void;
  deleteSelection?: () => boolean;
} = {};

/** Set by App for panel commands that need the layout model. */
export const layoutBridge: { show?: (panel: string) => void; reset?: () => void } = {};

const hasTileset = () => !!activeTileset();
const hasTile = () => !!(activeTileset() && ui.get().tileId);
const tool = (id: ToolId, label: string, shortcut: string, sep = false): Command => ({
  id: "tool." + id,
  label,
  menu: "Tools",
  shortcut,
  sep,
  run: () => ui.set({ tool: id }),
  checked: () => ui.get().tool === id,
});

export const commands: Command[] = [
  // File
  { id: "file.new", label: "New Project", menu: "File", shortcut: "Ctrl+N", run: A.newProject },
  { id: "file.open", label: "Open Project…", menu: "File", shortcut: "Ctrl+O", run: A.openProject },
  { id: "file.save", label: "Save", menu: "File", shortcut: "Ctrl+S", run: () => void A.saveProject() },
  { id: "file.saveAs", label: "Save As…", menu: "File", shortcut: "Ctrl+Shift+S", run: () => void A.saveProject(true) },
  { id: "file.import", label: "Import Image…", menu: "File", shortcut: "Ctrl+I", run: () => void A.startImport(), enabled: hasTileset, sep: true },
  { id: "file.export", label: "Export Project…", menu: "File", shortcut: "Ctrl+E", run: () => ui.set({ dialog: { kind: "export" } }), enabled: () => history.project.tilesets.length > 0 },
  { id: "file.exportAgain", label: "Export Again", menu: "File", shortcut: "Ctrl+Shift+E", run: () => void A.exportAgain(), enabled: () => history.project.tilesets.length > 0 },
  { id: "file.importPalette", label: "Import Palette…", menu: "File", run: () => void A.importPalette(), sep: true },
  { id: "file.exportGpl", label: "Export Palette as .gpl…", menu: "File", run: () => void A.exportPalette("gpl"), enabled: () => history.project.palette.colors.length > 0 },
  { id: "file.exportHex", label: "Export Palette as .hex…", menu: "File", run: () => void A.exportPalette("hex"), enabled: () => history.project.palette.colors.length > 0 },
  { id: "file.renameProject", label: "Rename Project…", menu: "File", sep: true, run: () => ui.set({ dialog: { kind: "rename", what: "project", id: "", current: history.project.name } }) },

  // Edit
  { id: "edit.undo", label: "Undo", menu: "Edit", shortcut: "Ctrl+Z", run: A.undo, enabled: () => history.canUndo },
  { id: "edit.redo", label: "Redo", menu: "Edit", shortcut: "Ctrl+Y", run: A.redo, enabled: () => history.canRedo },
  { id: "edit.redo2", label: "Redo", menu: "Edit", shortcut: "Ctrl+Shift+Z", run: A.redo, enabled: () => history.canRedo, hidden: true },
  { id: "edit.cut", label: "Cut Selection", menu: "Edit", shortcut: "Ctrl+X", run: () => editorBridge.cut?.(), sep: true },
  { id: "edit.copy", label: "Copy Selection", menu: "Edit", shortcut: "Ctrl+C", run: () => editorBridge.copy?.() },
  { id: "edit.paste", label: "Paste", menu: "Edit", shortcut: "Ctrl+V", run: () => editorBridge.paste?.(), enabled: () => !!ui.get().clip },
  { id: "edit.selectAll", label: "Select All", menu: "Edit", shortcut: "Ctrl+A", run: () => editorBridge.selectAll?.() },
  { id: "edit.deselect", label: "Deselect", menu: "Edit", shortcut: "Ctrl+D", run: () => editorBridge.deselect?.() },
  { id: "edit.newTile", label: "New Tile", menu: "Edit", shortcut: "Ctrl+T", run: A.addBlankTile, enabled: hasTileset, sep: true },
  { id: "edit.duplicateTile", label: "Duplicate Tile", menu: "Edit", shortcut: "Ctrl+Shift+D", run: A.duplicateActiveTile, enabled: hasTile },
  {
    id: "edit.renameTile",
    label: "Rename Tile…",
    menu: "Edit",
    shortcut: "F2",
    enabled: hasTile,
    run: () => {
      const ts = activeTileset();
      const id = ui.get().tileId;
      if (ts && id) ui.set({ dialog: { kind: "rename", what: "tile", id, current: ts.tiles[id].name } });
    },
  },
  {
    id: "edit.deleteTile",
    label: "Delete Tile",
    menu: "Edit",
    shortcut: "Delete",
    enabled: hasTile,
    run: () => {
      if (editorBridge.deleteSelection?.()) return;
      A.deleteActiveTile();
    },
  },

  // Tileset
  { id: "ts.new", label: "New Tileset…", menu: "Tileset", shortcut: "Ctrl+Shift+N", run: () => ui.set({ dialog: { kind: "newTileset" } }) },
  { id: "ts.newSubset", label: "New Subset…", menu: "Tileset", run: () => ui.set({ dialog: { kind: "newSubset" } }), enabled: hasTileset },
  { id: "ts.newPreview", label: "New Preview…", menu: "Tileset", run: () => ui.set({ dialog: { kind: "newPreview" } }), enabled: hasTileset },
  { id: "ts.nearDup", label: "Review Near-Duplicates…", menu: "Tileset", run: () => ui.set({ dialog: { kind: "nearDup" } }), enabled: () => (activeTileset()?.tileOrder.length ?? 0) > 1, sep: true },
  {
    id: "ts.terrains",
    label: "Edit Subset Terrains…",
    menu: "Tileset",
    enabled: () => {
      const s = activeSubset();
      return !!s && !!templateOf(s);
    },
    run: () => {
      const s = activeSubset();
      if (s) ui.set({ dialog: { kind: "terrains", subsetId: s.id } });
    },
  },
  {
    id: "ts.nameFromSlots",
    label: "Name Subset Tiles from Slots",
    menu: "Tileset",
    enabled: () => {
      const s = activeSubset();
      return !!s && !!templateOf(s);
    },
    run: () => {
      const ts = activeTileset();
      const s = activeSubset();
      if (ts && s) history.dispatch("Name tiles from slots", (p) => nameTilesFromSlots(p, ts.id, s.id));
    },
  },
  {
    id: "ts.resizePreview",
    label: "Resize Preview…",
    menu: "Tileset",
    enabled: () => !!activePreview(),
    run: () => {
      const pv = activePreview();
      if (pv) ui.set({ dialog: { kind: "resize", what: "preview", id: pv.id, cols: pv.cols, rows: pv.rows } });
    },
  },
  {
    id: "ts.resizeSubset",
    label: "Resize Subset Canvas…",
    menu: "Tileset",
    enabled: () => activeSubset()?.type === "unstructured",
    run: () => {
      const s = activeSubset();
      if (s) ui.set({ dialog: { kind: "resize", what: "subset", id: s.id, cols: s.cols, rows: s.rows } });
    },
  },

  // View
  { id: "view.palette", label: "Command Palette…", menu: "View", shortcut: "Ctrl+Shift+P", run: () => ui.set({ commandPalette: true }) },
  { id: "view.reset", label: "Reset Layout", menu: "View", run: () => layoutBridge.reset?.(), sep: true },
  { id: "view.showEditor", label: "Show Tile Editor", menu: "View", run: () => layoutBridge.show?.("editor") },
  { id: "view.showPreview", label: "Show Preview", menu: "View", run: () => layoutBridge.show?.("preview") },
  { id: "view.showProject", label: "Show Project", menu: "View", run: () => layoutBridge.show?.("project") },
  { id: "view.showTiles", label: "Show Tiles", menu: "View", run: () => layoutBridge.show?.("tiles") },
  { id: "view.showPalette", label: "Show Palette", menu: "View", run: () => layoutBridge.show?.("palette") },
  { id: "view.grid", label: "Preview Grid", menu: "View", shortcut: "Ctrl+G", sep: true, run: () => ui.set((s) => ({ previewGrid: !s.previewGrid })), checked: () => ui.get().previewGrid },
  { id: "view.highlight", label: "Highlight Uses of Selected Tile", menu: "View", shortcut: "Ctrl+H", run: () => ui.set((s) => ({ highlightUses: !s.highlightUses })), checked: () => ui.get().highlightUses },
  { id: "view.guides", label: "Slot Guides", menu: "View", run: () => ui.set((s) => ({ slotGuides: !s.slotGuides })), checked: () => ui.get().slotGuides },
  { id: "view.zoomIn", label: "Zoom In (Editor)", menu: "View", shortcut: "Ctrl+=", sep: true, run: () => ui.set((s) => ({ editorZoom: Math.min(64, s.editorZoom + 2) })) },
  { id: "view.zoomOut", label: "Zoom Out (Editor)", menu: "View", shortcut: "Ctrl+-", run: () => ui.set((s) => ({ editorZoom: Math.max(2, s.editorZoom - 2) })) },
  {
    id: "view.theme",
    label: "Light Theme",
    menu: "View",
    sep: true,
    checked: () => ui.get().theme === "light",
    run: () => {
      const theme = ui.get().theme === "dark" ? "light" : "dark";
      ui.set({ theme });
      try {
        localStorage.setItem("tilestudio.theme", theme);
      } catch {
        /* storage unavailable */
      }
    },
  },

  // Tools
  tool("pencil", "Pencil", "B"),
  tool("eraser", "Eraser", "E"),
  tool("fill", "Fill", "G"),
  tool("line", "Line", "L"),
  tool("rect", "Rectangle", "U"),
  tool("ellipse", "Ellipse / Circle", "Shift+U"),
  tool("shade", "Lighten / Darken", "D"),
  tool("select", "Selection + Move", "M"),
  tool("picker", "Color Picker", "I"),
  { id: "tool.pixelPerfect", label: "Pixel-Perfect Strokes", menu: "Tools", sep: true, run: () => ui.set((s) => ({ pixelPerfect: !s.pixelPerfect })), checked: () => ui.get().pixelPerfect },
  { id: "tool.fillGlobal", label: "Global Fill", menu: "Tools", run: () => ui.set((s) => ({ fillGlobal: !s.fillGlobal })), checked: () => ui.get().fillGlobal },
  { id: "tool.shapeFilled", label: "Filled Shapes", menu: "Tools", run: () => ui.set((s) => ({ shapeFilled: !s.shapeFilled })), checked: () => ui.get().shapeFilled },
  { id: "tool.brushUp", label: "Larger Brush", menu: "Tools", shortcut: "]", run: () => ui.set((s) => ({ brushSize: Math.min(8, s.brushSize + 1) })) },
  { id: "tool.brushDown", label: "Smaller Brush", menu: "Tools", shortcut: "[", run: () => ui.set((s) => ({ brushSize: Math.max(1, s.brushSize - 1) })) },
  { id: "tool.swap", label: "Swap Colors", menu: "Tools", shortcut: "X", run: () => ui.set((s) => ({ primary: s.secondary, secondary: s.primary })) },
];

export const MENUS = ["File", "Edit", "Tileset", "View", "Tools"] as const;

/** "Ctrl+Shift+E" style string for a keyboard event. */
export function eventShortcut(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.key;
  if (k === "+") k = "=";
  if (k === "_") k = "-";
  if (k.length === 1) k = k.toUpperCase();
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return "";
  parts.push(k);
  return parts.join("+");
}

export function findShortcut(s: string): Command | undefined {
  return commands.find((c) => c.shortcut === s);
}

export const isEnabled = (c: Command) => (c.enabled ? c.enabled() : true);
