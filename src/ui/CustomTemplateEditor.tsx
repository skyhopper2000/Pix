import { useEffect, useState } from "react";
import type { Template, TemplateSlot, Terrain, WangType } from "../core/model";
import { DIRS, MAX_TEMPLATE_SLOTS, validateTemplate } from "../core/templates";
import { WangGuide } from "./WangGuide";
import { NumberInput } from "./widgets";

const ALLOWED: Record<WangType, number[]> = { corner: [1, 3, 5, 7], edge: [0, 2, 4, 6], mixed: [0, 1, 2, 3, 4, 5, 6, 7] };
// Wang index for each cell of the 3×3 bit editor (row-major); -1 = centre.
const BIT_CELLS = [7, 0, 1, 6, -1, 2, 5, 4, 3];
const MAX_SIDE = 16;

const blankId = (t: WangType) => Array.from({ length: 8 }, (_, i) => (ALLOWED[t].includes(i) ? 1 : 0));
const clampSide = (v: number) => Math.max(1, Math.min(MAX_SIDE, Math.round(v)));

function slotsFrom(t: Template): Map<number, number[]> {
  return new Map(t.slots.map((s) => [s.row * t.cols + s.col, s.wangId.slice()]));
}

/**
 * Defines a custom template: a slot grid plus Wang bits per slot. Each slot is one tile of the
 * subset. The user sets every bit; nothing is inferred. Pass `initial` to edit an existing template.
 */
export function CustomTemplateEditor({ terrains, initial, onChange }: { terrains: [Terrain, Terrain]; initial?: Template; onChange: (t: Template | null, valid: boolean) => void }) {
  const [wangType, setWangType] = useState<WangType>(initial?.wangType ?? "corner");
  const [cols, setCols] = useState(initial?.cols ?? 4);
  const [rows, setRows] = useState(initial?.rows ?? 2);
  const [slots, setSlots] = useState<Map<number, number[]>>(() => (initial ? slotsFrom(initial) : new Map([[0, blankId("corner")]])));
  const [selected, setSelected] = useState<number | null>(initial ? (initial.slots.length ? initial.slots[0].row * initial.cols + initial.slots[0].col : null) : 0);

  const template: Template = {
    wangType,
    cols,
    rows,
    slots: [...slots.entries()]
      .filter(([pos]) => pos < cols * rows)
      .sort((a, b) => a[0] - b[0])
      .map(([pos, wangId]): TemplateSlot => ({ col: pos % cols, row: Math.floor(pos / cols), wangId })),
  };
  const errors = template.slots.length === 0 ? ["Add at least one slot."] : validateTemplate(template);
  const count = template.slots.length;
  const full = count >= MAX_TEMPLATE_SLOTS;

  useEffect(() => {
    onChange(template, errors.length === 0);
    // onChange is intentionally not a dependency: callers pass inline callbacks.
  }, [wangType, cols, rows, slots]);

  const changeType = (t: WangType) => {
    if (t === wangType) return;
    setWangType(t);
    setSlots((s) => new Map([...s.keys()].map((k) => [k, blankId(t)])));
  };
  const resize = (c: number, r: number) => {
    c = clampSide(c);
    r = clampSide(r);
    if (c === cols && r === rows) return;
    // Keep slots at the same (col,row) when the grid changes.
    setSlots((s) => {
      const next = new Map<number, number[]>();
      for (const [pos, w] of s) {
        const col = pos % cols;
        const row = Math.floor(pos / cols);
        if (col < c && row < r) next.set(row * c + col, w);
      }
      return next;
    });
    setCols(c);
    setRows(r);
    setSelected(null);
  };
  const clickCell = (pos: number) => {
    if (slots.has(pos)) return setSelected(pos);
    if (full) return;
    setSlots((s) => new Map(s).set(pos, blankId(wangType)));
    setSelected(pos);
  };
  const removeSlot = (pos: number) => {
    setSlots((s) => {
      const next = new Map(s);
      next.delete(pos);
      return next;
    });
    if (selected === pos) setSelected(null);
  };
  const fillGrid = () =>
    setSlots((s) => {
      const next = new Map(s);
      for (let pos = 0; pos < cols * rows && next.size < MAX_TEMPLATE_SLOTS; pos++) if (!next.has(pos)) next.set(pos, blankId(wangType));
      return next;
    });
  const flipBit = (pos: number, bit: number) =>
    setSlots((s) => {
      const w = s.get(pos);
      if (!w) return s;
      const id = w.slice();
      id[bit] = id[bit] === 2 ? 1 : 2;
      return new Map(s).set(pos, id);
    });

  const sel = selected !== null ? slots.get(selected) : undefined;
  const cell = cols > 10 || rows > 10 ? 28 : 38;
  return (
    <div className="custom-template">
      <div className="field">
        <span className="field-label">Wang type</span>
        <span className="field-control">
          {(["corner", "edge", "mixed"] as WangType[]).map((t) => (
            <label key={t} className="radio">
              <input type="radio" name="wang-type" checked={wangType === t} onChange={() => changeType(t)} /> {t}
            </label>
          ))}
        </span>
      </div>
      <div className="field">
        <span className="field-label">Grid</span>
        <span className="field-control">
          <span className="stepper">
            <button type="button" aria-label="Remove a column" title="Remove the rightmost column" onClick={() => resize(cols - 1, rows)} disabled={cols <= 1}>
              −
            </button>
            <NumberInput label="Template columns" value={cols} min={1} max={MAX_SIDE} width={48} onChange={(v) => resize(v, rows)} />
            <button type="button" aria-label="Add a column" title="Add a column on the right" onClick={() => resize(cols + 1, rows)} disabled={cols >= MAX_SIDE}>
              +
            </button>
          </span>
          columns ×
          <span className="stepper">
            <button type="button" aria-label="Remove a row" title="Remove the bottom row" onClick={() => resize(cols, rows - 1)} disabled={rows <= 1}>
              −
            </button>
            <NumberInput label="Template rows" value={rows} min={1} max={MAX_SIDE} width={48} onChange={(v) => resize(cols, v)} />
            <button type="button" aria-label="Add a row" title="Add a row at the bottom" onClick={() => resize(cols, rows + 1)} disabled={rows >= MAX_SIDE}>
              +
            </button>
          </span>
          rows
        </span>
        <span className="field-hint">The grid is the exported sheet layout. Grow it to make room for more slots.</span>
      </div>
      <div className="ct-count">
        <b className={full ? "warn" : ""}>
          {count} / {MAX_TEMPLATE_SLOTS} slots
        </b>
        <span className="muted"> · one slot = one tile in the subset</span>
        <span className="spacer" />
        <button type="button" onClick={fillGrid} disabled={full || count >= cols * rows} title="Make every cell of the grid a slot (up to 64)">
          Fill grid
        </button>
        <button type="button" onClick={() => (setSlots(new Map()), setSelected(null))} disabled={count === 0} title="Remove every slot">
          Clear
        </button>
      </div>
      <div className="ct-body">
        <div>
          <div className="hint">{full ? `Slot limit reached (${MAX_TEMPLATE_SLOTS}).` : "Click a dashed cell to add a slot. Click a slot to edit its bits. Right-click removes."}</div>
          <div className="subset-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)` }}>
            {Array.from({ length: cols * rows }, (_, pos) => {
              const w = slots.get(pos);
              return (
                <button
                  type="button"
                  key={pos}
                  className={"slot" + (w ? " filled" : " empty") + (selected === pos ? " sel" : "")}
                  style={{ width: cell, height: cell, padding: 0 }}
                  onClick={() => clickCell(pos)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (w) removeSlot(pos);
                  }}
                  title={w ? "Slot: click to edit, right-click to remove" : full ? "Slot limit reached" : "Click to add a slot"}
                  aria-label={w ? `Slot at column ${(pos % cols) + 1}, row ${Math.floor(pos / cols) + 1}` : `Empty cell at column ${(pos % cols) + 1}, row ${Math.floor(pos / cols) + 1}`}
                >
                  {w ? <WangGuide wangId={w} terrains={terrains} size={cell - 6} alpha={0.9} /> : !full && <span className="ct-plus">+</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="hint">{sel ? "Click a corner/edge to switch it between the two terrains." : "Select a slot to edit its bits."}</div>
          {sel && selected !== null && (
            <>
              <div className="bit-editor">
                {BIT_CELLS.map((bit, i) =>
                  bit < 0 || !ALLOWED[wangType].includes(bit) ? (
                    <span key={i} className="bit off" />
                  ) : (
                    <button type="button" key={i} className="bit" title={`${DIRS[bit]}: ${terrains[sel[bit] - 1].name}`} style={{ background: terrains[sel[bit] - 1].color }} onClick={() => flipBit(selected, bit)}>
                      {sel[bit] === 2 ? "B" : "A"}
                    </button>
                  ),
                )}
              </div>
              <button type="button" className="ct-remove" onClick={() => removeSlot(selected)}>
                Remove slot
              </button>
            </>
          )}
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="hint">Slots export in reading order (left to right, top to bottom) on this grid.</div>
    </div>
  );
}
