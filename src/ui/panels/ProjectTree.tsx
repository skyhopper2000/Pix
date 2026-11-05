import type { Subset } from "../../core/model";
import * as A from "../../state/actions";
import { history, ui, useProject, useUi } from "../../state/app";
import { IconButton } from "../widgets";

const TYPE_LABEL: Record<Subset["type"], string> = {
  unstructured: "free",
  blob47: "47 blob",
  corner16: "16 corner",
  edge16: "16 edge",
  custom: "custom",
};

export function ProjectTree() {
  const p = useProject();
  const tilesetId = useUi((s) => s.tilesetId);
  const subsetId = useUi((s) => s.subsetId);
  const previewId = useUi((s) => s.previewId);

  return (
    <div className="panel project-tree">
      <div className="panel-toolbar">
        <span className="tree-project" title="Double-click to rename" onDoubleClick={() => ui.set({ dialog: { kind: "rename", what: "project", id: "", current: p.name } })}>
          {p.name}
          {history.dirty ? " •" : ""}
        </span>
        <span className="spacer" />
        <IconButton title="New tileset" onClick={() => ui.set({ dialog: { kind: "newTileset" } })}>
          ＋
        </IconButton>
      </div>
      {p.tilesets.length === 0 && (
        <div className="tree-empty">
          No tilesets yet.
          <button type="button" className="link" onClick={() => ui.set({ dialog: { kind: "newTileset" } })}>
            New Tileset
          </button>
        </div>
      )}
      <ul className="tree" role="tree">
        {p.tilesets.map((ts) => {
          const active = ts.id === tilesetId;
          return (
            <li key={ts.id} role="treeitem" aria-expanded={active}>
              <div className={"tree-row ts" + (active && !subsetId ? " sel" : "")} onClick={() => (active ? A.selectSubset(null) : A.selectTileset(ts.id))} onDoubleClick={() => ui.set({ dialog: { kind: "rename", what: "tileset", id: ts.id, current: ts.name } })}>
                <span className="tree-icon">▦</span>
                <span className="tree-name">{ts.name}</span>
                <span className="tree-meta">
                  {ts.tileWidth}×{ts.tileHeight} · {ts.tileOrder.length}
                </span>
                <button type="button" className="tree-x" title="Delete tileset" onClick={(e) => (e.stopPropagation(), A.deleteTileset(ts.id))}>
                  ×
                </button>
              </div>
              {active && (
                <ul role="group">
                  <li className="tree-head">
                    Subsets
                    <button type="button" className="tree-add" title="New subset" onClick={() => ui.set({ dialog: { kind: "newSubset" } })}>
                      ＋
                    </button>
                  </li>
                  {ts.subsets.length === 0 && <li className="tree-none">none</li>}
                  {ts.subsets.map((s) => (
                    <li
                      key={s.id}
                      role="treeitem"
                      className={"tree-row" + (s.id === subsetId ? " sel" : "")}
                      onClick={() => {
                        A.selectSubset(s.id);
                        ui.set({ previewId: s.preview.id, previewCell: null });
                      }}
                      onDoubleClick={() => ui.set({ dialog: { kind: "rename", what: "subset", id: s.id, current: s.name } })}
                    >
                      <span className="tree-icon">◫</span>
                      <span className="tree-name">{s.name}</span>
                      <span className="tree-meta">
                        {TYPE_LABEL[s.type]} · {s.cells.filter(Boolean).length}/{s.cells.length}
                      </span>
                      <button type="button" className="tree-x" title="Delete subset" onClick={(e) => (e.stopPropagation(), A.deleteSubset(s.id))}>
                        ×
                      </button>
                    </li>
                  ))}
                  <li className="tree-head">
                    Map previews
                    <button type="button" className="tree-add" title="New preview" onClick={() => ui.set({ dialog: { kind: "newPreview" } })}>
                      ＋
                    </button>
                  </li>
                  {ts.previews.length === 0 && <li className="tree-none">none</li>}
                  {ts.previews.map((pv) => (
                    <li
                      key={pv.id}
                      role="treeitem"
                      className={"tree-row" + (pv.id === previewId ? " sel" : "")}
                      onClick={() => ui.set({ previewId: pv.id, previewCell: null })}
                      onDoubleClick={() => ui.set({ dialog: { kind: "rename", what: "preview", id: pv.id, current: pv.name } })}
                    >
                      <span className="tree-icon">▤</span>
                      <span className="tree-name">{pv.name}</span>
                      <span className="tree-meta">
                        {pv.cols}×{pv.rows}
                      </span>
                      <button type="button" className="tree-x" title="Delete preview" onClick={(e) => (e.stopPropagation(), A.deletePreview(pv.id))}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
