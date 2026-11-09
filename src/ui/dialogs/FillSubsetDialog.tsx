import { useEffect, useMemo, useState } from "react";
import type { Id, TileId } from "../../core/model";
import * as ops from "../../core/ops";
import { slotDirs, slotName, templateOf } from "../../core/templates";
import { activeTileset, history, ui, useProject } from "../../state/app";
import { WangGuide } from "../WangGuide";
import { Modal, TileThumb } from "../widgets";

const close = () => ui.set({ dialog: null });

/**
 * Fill Subset wizard: walks the subset's slots one at a time. Clicking a parent tile puts it in
 * the current slot (one undoable command) and moves on to the next empty slot. The user can skip,
 * go back, or jump to any slot. The app never picks a tile: every assignment is a click.
 */
export function FillSubsetDialog({ subsetId, start }: { subsetId: Id; start?: number }) {
  const p = useProject();
  const ts = activeTileset(p);
  const subset = ts?.subsets.find((s) => s.id === subsetId);
  const [index, setIndex] = useState(() => start ?? (subset ? (ops.nextEmptyCell(subset.cells, null) ?? 0) : 0));
  const [filter, setFilter] = useState("");

  const t = subset ? templateOf(subset) : null;
  const n = subset?.cells.length ?? 0;
  const cur = Math.min(index, Math.max(0, n - 1));
  const used = useMemo(() => new Set(subset?.cells.filter((c): c is TileId => !!c)), [subset]);

  const go = (i: number) => n > 0 && setIndex(((i % n) + n) % n);
  const assign = (tileId: TileId | null) => {
    if (!ts || !subset) return;
    const next = ops.setSubsetCell(history.project, ts.id, subset.id, cur, tileId);
    history.dispatch(tileId ? `Fill slot in "${subset.name}"` : `Clear slot in "${subset.name}"`, () => next);
    if (tileId) {
      const after = ops.findTileset(next, ts.id)?.subsets.find((s) => s.id === subset.id);
      const nextEmpty = after ? ops.nextEmptyCell(after.cells, cur) : null;
      if (nextEmpty !== null) setIndex(nextEmpty);
    }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (ctrl && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        history.redo();
      } else if (typing) return;
      else if (e.key === "ArrowRight") go(cur + 1);
      else if (e.key === "ArrowLeft") go(cur - 1);
      else if (e.key === "Delete" || e.key === "Backspace") assign(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!ts || !subset) return null;

  const cols = t ? t.cols : subset.cols;
  const rows = t ? t.rows : subset.rows;
  const at = new Map<number, number>();
  if (t) t.slots.forEach((s, i) => at.set(s.row * cols + s.col, i));
  else for (let i = 0; i < cols * rows; i++) at.set(i, i);

  const slot = t?.slots[cur];
  const curId = subset.cells[cur];
  const curTile = curId ? ts.tiles[curId] : undefined;
  const filled = subset.cells.filter(Boolean).length;
  const label = slot ? slotName(subset.terrains, slot.wangId) : `cell ${cur % cols},${Math.floor(cur / cols)}`;
  const cell = Math.max(20, Math.min(40, Math.floor(300 / Math.max(cols, rows))));
  const q = filter.trim().toLowerCase();
  const parent = q ? ts.tileOrder.filter((id) => ts.tiles[id].name.toLowerCase().includes(q)) : ts.tileOrder;

  return (
    <Modal
      title={`Fill "${subset.name}"`}
      onClose={close}
      width={900}
      footer={
        <>
          <span className="muted fill-keys">← → move · Del clears · Ctrl+Z undo</span>
          <span className="spacer" />
          <button type="button" onClick={() => go(cur - 1)} title="Previous slot (←)">
            ← Back
          </button>
          <button type="button" onClick={() => go(cur + 1)} title="Leave this slot as it is and go to the next one (→)">
            Skip →
          </button>
          <button type="button" onClick={() => assign(null)} disabled={!curTile} title="Empty this slot (Del). The tile stays in the parent.">
            Clear slot
          </button>
          <button type="button" className="primary" onClick={close} autoFocus>
            Done
          </button>
        </>
      }
    >
      <div className="fill-body">
        <div className="fill-left">
          <div className="section-title">
            {filled}/{n} filled
          </div>
          <div className="subset-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell + 4}px)` }} role="grid" aria-label={`Slots of ${subset.name}`}>
            {Array.from({ length: cols * rows }, (_, pos) => {
              const i = at.get(pos);
              if (i === undefined) return <div key={pos} className="slot void" style={{ width: cell + 4, height: cell + 4 }} />;
              const id = subset.cells[i];
              const tile = id ? ts.tiles[id] : undefined;
              const s = t?.slots[i];
              return (
                <button
                  type="button"
                  key={pos}
                  role="gridcell"
                  aria-selected={i === cur}
                  aria-label={`Slot ${i + 1}${tile ? `: ${tile.name}` : ": empty"}`}
                  className={"slot" + (tile ? " filled" : " empty") + (i === cur ? " sel" : "")}
                  style={{ width: cell + 4, height: cell + 4, padding: 0 }}
                  title={`Slot ${i + 1}${s ? ` (${slotDirs(s.wangId)})` : ""}${tile ? `: ${tile.name}` : ": empty"}`}
                  onClick={() => setIndex(i)}
                >
                  {tile ? <TileThumb pixels={tile.pixels} w={ts.tileWidth} h={ts.tileHeight} size={cell} /> : s && <WangGuide wangId={s.wangId} terrains={subset.terrains} size={cell} />}
                </button>
              );
            })}
          </div>
          <div className="hint">Click any slot to go back to it.</div>
        </div>

        <div className="fill-current" aria-live="polite">
          <div className="section-title">
            Slot {cur + 1} of {n}
          </div>
          <div className="fill-big">
            {slot ? <WangGuide wangId={slot.wangId} terrains={subset.terrains} size={96} alpha={0.9} /> : <div className="fill-big-empty" />}
            <span className="fill-arrow">→</span>
            {curTile ? <TileThumb pixels={curTile.pixels} w={ts.tileWidth} h={ts.tileHeight} size={96} /> : <div className="fill-big-empty">empty</div>}
          </div>
          <div className="fill-label">{label}</div>
          {slot && (
            <div className="hint">
              Expected:{" "}
              {slotDirs(slot.wangId) === "none"
                ? `all ${subset.terrains[0].name}`
                : slotDirs(slot.wangId) === "all"
                  ? `all ${subset.terrains[1].name}`
                  : `${subset.terrains[1].name} at ${slotDirs(slot.wangId)}, ${subset.terrains[0].name} elsewhere`}
              .
            </div>
          )}
          <div className="hint">{curTile ? `Holds "${curTile.name}". Click another tile to replace it.` : "Click a tile on the right to put it here, or Skip."}</div>
          {filled === n && <div className="fill-done">Every slot is filled.</div>}
        </div>

        <div className="fill-right">
          <div className="fill-right-head">
            <span className="section-title">Parent tiles</span>
            <input placeholder="Filter by name" aria-label="Filter parent tiles" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          {ts.tileOrder.length === 0 ? (
            <div className="hint">The parent has no tiles yet. Import an image or draw tiles first.</div>
          ) : (
            <div className="tile-grid fill-tiles" role="listbox" aria-label="Parent tiles">
              {parent.map((id) => {
                const tile = ts.tiles[id];
                return (
                  <button
                    type="button"
                    role="option"
                    key={id}
                    aria-selected={id === curId}
                    className={"tile-cell" + (id === curId ? " sel" : "") + (used.has(id) ? " used" : "")}
                    title={`${tile.name}${used.has(id) ? " (already in this subset)" : ""}: click to put it in slot ${cur + 1}`}
                    onClick={() => assign(id)}
                  >
                    <TileThumb pixels={tile.pixels} w={ts.tileWidth} h={ts.tileHeight} size={40} />
                    <span className="tile-name">{tile.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
