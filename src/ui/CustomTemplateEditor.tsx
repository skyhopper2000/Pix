import { useEffect, useState } from "react";
import type { Template, TemplateSlot, Terrain, WangType } from "../core/model";
import { DIRS, validateTemplate } from "../core/templates";
import { WangGuide } from "./WangGuide";
import { NumberInput } from "./widgets";

const ALLOWED: Record<WangType, number[]> = { corner: [1, 3, 5, 7], edge: [0, 2, 4, 6], mixed: [0, 1, 2, 3, 4, 5, 6, 7] };
// Wang index for each cell of the 3×3 bit editor (row-major); -1 = centre.
const BIT_CELLS = [7, 0, 1, 6, -1, 2, 5, 4, 3];

const blankId = (t: WangType) => Array.from({ length: 8 }, (_, i) => (ALLOWED[t].includes(i) ? 1 : 0));

/**
 * Defines a custom template: a slot grid plus Wang bits per slot. The user sets
 * every bit; nothing is inferred.
 */
export function CustomTemplateEditor({ terrains, onChange }: { terrains: [Terrain, Terrain]; onChange: (t: Template | null, valid: boolean) => void }) {
  const [wangType, setWangType] = useState<WangType>("corner");
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(2);
  const [slots, setSlots] = useState<Map<number, number[]>>(() => new Map([[0, blankId("corner")]]));
  const [selected, setSelected] = useState<number | null>(0);

  const template: Template = {
    wangType,
    cols,
    rows,
    slots: [...slots.entries()]
      .filter(([pos]) => pos < cols * rows && pos % cols < cols)
      .sort((a, b) => a[0] - b[0])
      .map(([pos, wangId]): TemplateSlot => ({ col: pos % cols, row: Math.floor(pos / cols), wangId })),
  };
  const errors = template.slots.length === 0 ? ["Add at least one slot."] : validateTemplate(template);

  useEffect(() => {
    onChange(template, errors.length === 0);
    // onChange is intentionally not a dependency: callers pass inline callbacks.
  }, [wangType, cols, rows, slots]);

  const changeType = (t: WangType) => {
    setWangType(t);
    setSlots((s) => new Map([...s.keys()].map((k) => [k, blankId(t)])));
  };
  const resize = (c: number, r: number) => {
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
  const toggleSlot = (pos: number) => {
    setSlots((s) => {
      const next = new Map(s);
      if (next.has(pos)) next.delete(pos);
      else next.set(pos, blankId(wangType));
      return next;
    });
    setSelected(pos);
  };
  const flipBit = (pos: number, bit: number) =>
    setSlots((s) => {
      const w = s.get(pos);
      if (!w) return s;
      const next = new Map(s);
      const id = w.slice();
      id[bit] = id[bit] === 2 ? 1 : 2;
      next.set(pos, id);
      return next;
    });

  const sel = selected !== null ? slots.get(selected) : undefined;
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
          <NumberInput label="Template columns" value={cols} min={1} max={16} onChange={(v) => resize(Math.max(1, Math.min(16, v)), rows)} /> ×{" "}
          <NumberInput label="Template rows" value={rows} min={1} max={16} onChange={(v) => resize(cols, Math.max(1, Math.min(16, v)))} />
        </span>
      </div>
      <div className="ct-body">
        <div>
          <div className="hint">Click a cell to add or remove a slot.</div>
          <div className="subset-grid" style={{ gridTemplateColumns: `repeat(${cols}, 38px)` }}>
            {Array.from({ length: cols * rows }, (_, pos) => {
              const w = slots.get(pos);
              return (
                <button type="button" key={pos} className={"slot" + (w ? " filled" : " empty") + (selected === pos ? " sel" : "")} style={{ width: 38, height: 38, padding: 0 }} onClick={() => toggleSlot(pos)} title={w ? "Slot: click to remove" : "Click to add a slot"}>
                  {w && <WangGuide wangId={w} terrains={terrains} size={32} alpha={0.9} />}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="hint">{sel ? "Click a corner/edge to switch it between the two terrains." : "Select a slot to edit its bits."}</div>
          {sel && selected !== null && (
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
      <div className="hint">{template.slots.length} slots. Slots export in reading order (left to right, top to bottom) on this grid.</div>
    </div>
  );
}
