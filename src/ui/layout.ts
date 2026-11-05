import { Model, type IJsonModel } from "flexlayout-react";

/**
 * Default window layout (spec §Screen layout): tile editor in the centre, the
 * preview editor below it, project tree / tile bar / palette on the right.
 * Panels dock (drag a tab), resize (drag a splitter), maximise (double-click a
 * header) and collapse (drag a tab into the left/right/bottom edge strips).
 */

export const PANELS: Record<string, string> = {
  editor: "Tile Editor",
  preview: "Preview",
  project: "Project",
  tiles: "Tiles",
  palette: "Palette",
};

const tab = (id: string) => ({ type: "tab" as const, id, name: PANELS[id], component: id, enableClose: true });

export const DEFAULT_LAYOUT: IJsonModel = {
  global: {
    tabEnableRename: false,
    tabSetMinWidth: 120,
    tabSetMinHeight: 80,
    borderMinSize: 120,
    borderEnableAutoHide: true,
    tabEnablePopout: false,
  },
  borders: [
    { type: "border", location: "left", children: [] },
    { type: "border", location: "right", children: [] },
    { type: "border", location: "bottom", children: [] },
  ],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "row",
        weight: 74,
        children: [
          { type: "tabset", id: "ts-editor", weight: 60, children: [tab("editor")] },
          { type: "tabset", id: "ts-preview", weight: 40, children: [tab("preview")] },
        ],
      },
      {
        type: "row",
        weight: 26,
        children: [
          { type: "tabset", id: "ts-project", weight: 30, children: [tab("project")] },
          { type: "tabset", id: "ts-tiles", weight: 45, children: [tab("tiles")] },
          { type: "tabset", id: "ts-palette", weight: 25, children: [tab("palette")] },
        ],
      },
    ],
  },
};

const KEY = "tilestudio.layout.v1";

export function loadLayout(): Model {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Model.fromJson(JSON.parse(raw) as IJsonModel);
  } catch {
    /* fall back to default */
  }
  return Model.fromJson(DEFAULT_LAYOUT);
}

export function saveLayout(m: Model) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m.toJson()));
  } catch {
    /* storage unavailable */
  }
}

export function resetLayout(): Model {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return Model.fromJson(DEFAULT_LAYOUT);
}
