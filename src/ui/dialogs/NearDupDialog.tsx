import { useMemo, useState } from "react";
import { findNearDuplicates } from "../../core/import";
import type { TileId } from "../../core/model";
import { mergeTiles, tileUsage } from "../../core/ops";
import { diffFraction } from "../../core/pixels";
import { activeTileset, history, setStatus, ui, useProject, useUi } from "../../state/app";
import { Modal, NumberInput, TileThumb } from "../widgets";

const close = () => ui.set({ dialog: null });

/**
 * Review near-duplicates: groups of similar tiles side by side. The user picks
 * the survivor or keeps them all. Nothing merges without a click.
 */
export function NearDupDialog() {
  const project = useProject();
  const ts = activeTileset(project);
  const initial = useUi((s) => (s.dialog?.kind === "nearDup" ? (s.dialog.threshold ?? 0.05) : 0.05));
  const [pct, setPct] = useState(Math.round(initial * 100));
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [survivor, setSurvivor] = useState<Record<string, TileId>>({});

  const groups = useMemo(() => (ts ? findNearDuplicates(ts, pct / 100) : []), [ts, pct]);
  if (!ts) return null;
  const visible = groups.filter((g) => !kept.has(g.join(",")));

  const merge = (g: TileId[]) => {
    const key = g.join(",");
    const keep = survivor[key] ?? g[0];
    const n = g.length - 1;
    history.dispatch(`Merge ${n} near-duplicate${n > 1 ? "s" : ""}`, (p) => mergeTiles(p, ts.id, keep, g));
    if (ui.get().tileId && g.includes(ui.get().tileId!) && ui.get().tileId !== keep) ui.set({ tileId: keep });
    setStatus(`Merged ${n} tile${n > 1 ? "s" : ""} into ${ts.tiles[keep].name}. Every map cell and slot now points to it.`);
  };

  return (
    <Modal
      title="Review Near-Duplicates"
      onClose={close}
      width={720}
      footer={
        <button type="button" className="primary" onClick={close}>
          Done
        </button>
      }
    >
      <div className="field">
        <span className="field-label">Threshold</span>
        <span className="field-control">
          at most <NumberInput label="Threshold percent" value={pct} min={0} max={50} width={52} onChange={(v) => setPct(Math.max(0, Math.min(50, Math.round(v))))} />% of pixels differ
        </span>
      </div>
      <p className="hint">Each group shows tiles that look almost the same. Pick the version to keep and press Merge (every use then points to it), or Keep all. Flipped or rotated copies are never matched. You can undo merges.</p>
      {visible.length === 0 && <p>No near-duplicate groups at this threshold.</p>}
      <div className="neardup-list">
        {visible.map((g) => {
          const key = g.join(",");
          const keep = survivor[key] ?? g[0];
          return (
            <div key={key} className="neardup-group">
              <div className="neardup-tiles" role="radiogroup" aria-label="Choose the tile to keep">
                {g.map((id) => {
                  const t = ts.tiles[id];
                  const uses = tileUsage(ts, id);
                  const cells = uses.previews.reduce((n, pv) => n + pv.cells.filter((c) => c === id).length, 0);
                  return (
                    <label key={id} className={"neardup-tile" + (keep === id ? " keep" : "")}>
                      <input type="radio" name={key} checked={keep === id} onChange={() => setSurvivor((s) => ({ ...s, [key]: id }))} />
                      <TileThumb pixels={t.pixels} w={ts.tileWidth} h={ts.tileHeight} size={64} />
                      <span>{t.name}</span>
                      <span className="muted">
                        {cells} cell{cells === 1 ? "" : "s"}
                        {id !== keep ? ` · ${Math.round(diffFraction(t.pixels, ts.tiles[keep].pixels) * 100)}% diff` : " · keep"}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="neardup-actions">
                <button type="button" className="primary" onClick={() => merge(g)}>
                  Merge into {ts.tiles[keep].name}
                </button>
                <button type="button" onClick={() => setKept((s) => new Set(s).add(key))}>
                  Keep all
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
