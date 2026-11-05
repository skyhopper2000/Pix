import { useState } from "react";
import type { Subset, Tileset } from "../../core/model";
import * as ops from "../../core/ops";
import { slotDirs, templateOf } from "../../core/templates";
import { history, ui, useUi } from "../../state/app";
import { WangGuide } from "../WangGuide";
import { TileThumb } from "../widgets";
import { dragTile, isTileDrag, readDrag } from "./TileBar";

/**
 * A subset's cells or template slots. Drop parent tiles in, drag cells around,
 * click an empty slot and draw to create a new tile in it. Never auto-filled.
 */
export function SubsetGrid({ ts, subset, cellSize = 44 }: { ts: Tileset; subset: Subset; cellSize?: number }) {
  const slotIndex = useUi((s) => s.slotIndex);
  const tileId = useUi((s) => s.tileId);
  const guides = useUi((s) => s.slotGuides);
  const [over, setOver] = useState<number | null>(null);
  const t = templateOf(subset);
  const cols = t ? t.cols : subset.cols;
  const rows = t ? t.rows : subset.rows;
  const from = `subset:${subset.id}`;

  // Map grid position -> cell index.
  const at = new Map<number, number>();
  if (t) t.slots.forEach((s, i) => at.set(s.row * cols + s.col, i));
  else for (let i = 0; i < cols * rows; i++) at.set(i, i);

  const drop = (e: React.DragEvent, index: number) => {
    setOver(null);
    const d = readDrag(e);
    if (!d) return;
    e.preventDefault();
    if (d.from.startsWith(from + ":")) {
      const src = Number(d.from.split(":")[2]);
      history.dispatch("Move tile in subset", (p) => ops.swapSubsetCells(p, ts.id, subset.id, src, index));
    } else history.dispatch(`Add tile to "${subset.name}"`, (p) => ops.setSubsetCell(p, ts.id, subset.id, index, d.tileId));
    ui.set({ slotIndex: index, tileId: d.tileId });
  };

  return (
    <div className="subset-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cellSize + 6}px)` }} role="grid" aria-label={`Subset ${subset.name}`}>
      {Array.from({ length: cols * rows }, (_, pos) => {
        const index = at.get(pos);
        if (index === undefined) return <div key={pos} className="slot void" />;
        const id = subset.cells[index];
        const tile = id ? ts.tiles[id] : undefined;
        const slot = t?.slots[index];
        const selected = slotIndex === index && (tile ? tile.id === tileId : !tileId);
        const label = slot ? `slot ${index + 1}: ${slotDirs(slot.wangId)}` : `cell ${pos % cols},${Math.floor(pos / cols)}`;
        return (
          <div
            key={pos}
            role="gridcell"
            aria-selected={selected}
            className={"slot" + (tile ? " filled" : " empty") + (selected ? " sel" : "") + (over === index ? " drop" : "")}
            title={tile ? `${tile.name} (${label})` : `${label}: empty. Drop a tile here, or select and draw.`}
            style={{ width: cellSize + 6, height: cellSize + 6 }}
            draggable={!!tile}
            onDragStart={(e) => tile && dragTile(e, tile.id, `${from}:${index}`)}
            onDragOver={(e) => {
              if (!isTileDrag(e)) return;
              e.preventDefault();
              setOver(index);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, index)}
            onClick={() => ui.set({ slotIndex: index, tileId: tile?.id ?? null })}
            onContextMenu={(e) => {
              e.preventDefault();
              if (tile) history.dispatch(`Remove tile from "${subset.name}"`, (p) => ops.setSubsetCell(p, ts.id, subset.id, index, null));
            }}
          >
            {tile ? (
              <TileThumb pixels={tile.pixels} w={ts.tileWidth} h={ts.tileHeight} size={cellSize} />
            ) : (
              slot && guides && <WangGuide wangId={slot.wangId} terrains={subset.terrains} size={cellSize} />
            )}
          </div>
        );
      })}
    </div>
  );
}
