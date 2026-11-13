import { layersOf } from "../../core/layers";
import type { BlendMode } from "../../core/model";
import * as A from "../../state/actions";
import { activeLayer, activeTileset, ui, useProject, useUi } from "../../state/app";
import { EmptyState, IconButton, TileThumb } from "../widgets";

/**
 * Layers of the tile open in the editor, top layer first. Visibility and lock
 * are view-only session flags: export always uses every layer.
 */
export function LayersPanel() {
  const project = useProject();
  const tileId = useUi((s) => s.tileId);
  useUi((s) => s.layerId);
  const hidden = useUi((s) => s.hiddenLayers);
  const locked = useUi((s) => s.lockedLayers);
  const ts = activeTileset(project);
  const tile = ts && tileId ? ts.tiles[tileId] : undefined;

  if (!ts || !tile) return <EmptyState>Open a tile to see its layers. A new tile gets layers once you've drawn on it.</EmptyState>;

  const layers = layersOf(tile);
  const active = activeLayer(tile)!;
  const layered = !!tile.layers;
  const rows = layers.map((l, i) => ({ l, i })).reverse();

  return (
    <div className="panel layers-panel">
      <div className="panel-toolbar">
        <IconButton title="New layer above the active one" onClick={() => A.addLayer()}>
          ＋
        </IconButton>
        <IconButton title="Duplicate the active layer" onClick={() => A.duplicateLayer()}>
          ⧉
        </IconButton>
        <IconButton title="Move layer up" disabled={!layered || active.index >= layers.length - 1} onClick={() => A.moveLayer(1)}>
          ▲
        </IconButton>
        <IconButton title="Move layer down" disabled={!layered || active.index <= 0} onClick={() => A.moveLayer(-1)}>
          ▼
        </IconButton>
        <span className="spacer" />
        <IconButton title="Delete the active layer" disabled={!layered} onClick={() => A.deleteLayer()}>
          −
        </IconButton>
      </div>
      <div className="layer-list" role="listbox" aria-label={`Layers of ${tile.name}`}>
        {rows.map(({ l, i }) => {
          const isActive = i === active.index;
          const isHidden = hidden.has(l.id);
          const isLocked = locked.has(l.id);
          return (
            <div
              key={l.id}
              role="option"
              aria-selected={isActive}
              className={"layer-row" + (isActive ? " active" : "") + (isHidden ? " hidden" : "")}
              onClick={() => ui.set({ layerId: l.id })}
              onDoubleClick={() => layered && ui.set({ layerId: l.id, dialog: { kind: "rename", what: "layer", id: l.id, current: l.name } })}
              title={layered ? "Click to draw on this layer, double-click to rename" : "This tile has one layer. Add a layer to draw above it."}
            >
              <button type="button" className={"layer-flag" + (isHidden ? " off" : "")} aria-label={isHidden ? "Show layer" : "Hide layer"} title={isHidden ? "Show (view only)" : "Hide (view only, still exported)"} onClick={(e) => (e.stopPropagation(), A.toggleLayerHidden(l.id))}>
                {isHidden ? "◌" : "●"}
              </button>
              <button type="button" className={"layer-flag" + (isLocked ? " on" : "")} aria-label={isLocked ? "Unlock layer" : "Lock layer"} title={isLocked ? "Unlock" : "Lock (no drawing on this layer)"} onClick={(e) => (e.stopPropagation(), A.toggleLayerLocked(l.id))}>
                {isLocked ? "▣" : "□"}
              </button>
              <TileThumb pixels={l.pixels} w={ts.tileWidth} h={ts.tileHeight} size={24} />
              <span className="layer-name">{l.name}</span>
              {i > 0 && (
                <select
                  className="layer-blend"
                  aria-label={`Blend mode of ${l.name}`}
                  title="Replace: any visible pixel covers what's below. Normal: semi-transparent pixels blend with what's below."
                  value={l.blend}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => A.setLayerBlend(l.id, e.target.value as BlendMode)}
                >
                  <option value="replace">Replace</option>
                  <option value="normal">Normal</option>
                </select>
              )}
            </div>
          );
        })}
      </div>
      <div className="hint layers-hint">Hidden layers only hide in the editor. Tiles, previews and exports always show every layer.</div>
    </div>
  );
}
