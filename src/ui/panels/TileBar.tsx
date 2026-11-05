import { useState } from "react";
import type { TileId, Tileset } from "../../core/model";
import { moveTile } from "../../core/ops";
import * as A from "../../state/actions";
import { history, openTile, ui, useProject, useUi, activeTileset } from "../../state/app";
import { TILE_DRAG_TYPE } from "../render";
import { EmptyState, IconButton, TileThumb } from "../widgets";

/** Starts a drag carrying a tile id (dropped on subset slots, preview cells or the tile bar). */
export function dragTile(e: React.DragEvent, tileId: TileId, from: string) {
  e.dataTransfer.setData(TILE_DRAG_TYPE, JSON.stringify({ tileId, from }));
  e.dataTransfer.setData("text/plain", tileId);
  e.dataTransfer.effectAllowed = "copyMove";
}

export function readDrag(e: React.DragEvent): { tileId: TileId; from: string } | null {
  try {
    const raw = e.dataTransfer.getData(TILE_DRAG_TYPE);
    return raw ? (JSON.parse(raw) as { tileId: TileId; from: string }) : null;
  } catch {
    return null;
  }
}

export const isTileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(TILE_DRAG_TYPE);

/** The parent tileset's tiles, in sheet order. */
export function ParentTiles({ ts, thumb = 40 }: { ts: Tileset; thumb?: number }) {
  const tileId = useUi((s) => s.tileId);
  const [dropAt, setDropAt] = useState<number | null>(null);
  return (
    <div className="tile-grid" role="listbox" aria-label="Tiles">
      {ts.tileOrder.map((id, i) => {
        const t = ts.tiles[id];
        return (
          <button
            type="button"
            role="option"
            aria-selected={id === tileId}
            key={id}
            className={"tile-cell" + (id === tileId ? " sel" : "") + (dropAt === i ? " drop" : "")}
            title={t.name}
            draggable
            onDragStart={(e) => dragTile(e, id, "parent")}
            onDragOver={(e) => {
              if (!isTileDrag(e)) return;
              e.preventDefault();
              setDropAt(i);
            }}
            onDragLeave={() => setDropAt(null)}
            onDrop={(e) => {
              setDropAt(null);
              const d = readDrag(e);
              if (d?.from === "parent" && d.tileId !== id) {
                e.preventDefault();
                history.dispatch("Reorder tiles", (p) => moveTile(p, ts.id, d.tileId, i));
              }
            }}
            onClick={() => openTile(id, { slotIndex: null })}
            onDoubleClick={() => ui.set({ dialog: { kind: "rename", what: "tile", id, current: t.name } })}
          >
            <TileThumb pixels={t.pixels} w={ts.tileWidth} h={ts.tileHeight} size={thumb} />
            <span className="tile-name">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TileBar() {
  const p = useProject();
  const tilesetId = useUi((s) => s.tilesetId);
  useUi((s) => s.subsetId);
  const ts = activeTileset(p);
  if (!ts || ts.id !== tilesetId) return <EmptyState>No tileset selected.</EmptyState>;
  return (
    <div className="panel tile-bar">
      <div className="panel-toolbar">
        <span className="panel-caption">
          {ts.name} · {ts.tileOrder.length} tiles
        </span>
        <span className="spacer" />
        <IconButton title="New blank tile (Ctrl+T)" onClick={A.addBlankTile}>
          ＋
        </IconButton>
        <IconButton title="Duplicate tile (Ctrl+Shift+D)" onClick={A.duplicateActiveTile} disabled={!ui.get().tileId}>
          ⧉
        </IconButton>
        <IconButton title="Delete tile (Del)" onClick={A.deleteActiveTile} disabled={!ui.get().tileId}>
          🗑
        </IconButton>
      </div>
      <div className="panel-scroll">
        {ts.tileOrder.length === 0 ? <EmptyState>No tiles yet. Draw in the tile editor, or use File › Import Image.</EmptyState> : <ParentTiles ts={ts} />}
      </div>
    </div>
  );
}
