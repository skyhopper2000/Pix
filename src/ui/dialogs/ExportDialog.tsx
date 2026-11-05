import { useState } from "react";
import { defaultExportSettings, exportZipName, validateExport, type ExportSettings } from "../../core/export";
import type { Id } from "../../core/model";
import * as A from "../../state/actions";
import { ui, useProject, useUi } from "../../state/app";
import { Field, Modal, NumberInput } from "../widgets";

const close = () => ui.set({ dialog: null });

export function ExportDialog() {
  const project = useProject();
  const last = useUi((s) => s.lastExport);
  const [s, setS] = useState<ExportSettings>(() => last?.settings ?? defaultExportSettings());
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ExportSettings>) => setS((o) => ({ ...o, ...patch }));
  const selected = new Set(s.scope === "all" ? [] : s.scope);
  const toggle = (id: Id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ scope: [...next] });
  };
  const errors = validateExport(s);

  const run = async () => {
    if (errors.length) return;
    setBusy(true);
    await A.runExport(s);
    setBusy(false);
  };

  return (
    <Modal
      title="Export Project"
      onClose={close}
      width={560}
      footer={
        <>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void run()} disabled={busy || errors.length > 0}>
            {busy ? "Exporting…" : `Export ${exportZipName(project)}`}
          </button>
        </>
      }
    >
      <Field label="Scale" hint="Nearest-neighbour. Extra scales export as name@2x.png / .tsx.">
        {[1, 2, 3, 4].map((v) => (
          <label key={v} className="check">
            <input type="checkbox" checked={s.scales.includes(v)} onChange={(e) => set({ scales: e.target.checked ? [...s.scales, v].sort((a, b) => a - b) : s.scales.filter((x) => x !== v) })} /> {v}×
          </label>
        ))}
      </Field>
      <Field label="Columns" hint="Parent sheet and unstructured subsets only. Templates keep their fixed grid.">
        <label className="check">
          <input type="radio" name="cols" checked={s.columns === "auto"} onChange={() => set({ columns: "auto" })} /> Auto
        </label>
        <label className="check">
          <input type="radio" name="cols" checked={s.columns !== "auto"} onChange={() => set({ columns: 8 })} /> Fixed
        </label>
        {s.columns !== "auto" && <NumberInput label="Columns" value={s.columns} min={1} max={4096} onChange={(v) => set({ columns: Math.max(1, Math.round(v)) })} />}
      </Field>
      <Field label="Padding (margin)">
        <NumberInput label="Padding" value={s.padding} min={0} max={8} onChange={(v) => set({ padding: Math.round(v) })} /> px around the sheet
      </Field>
      <Field label="Spacing">
        <NumberInput label="Spacing" value={s.spacing} min={0} max={8} onChange={(v) => set({ spacing: Math.round(v) })} /> px between tiles
      </Field>
      <Field label="Extrusion" hint="Repeats each tile's edge pixels outward to stop seams. The .tsx margin/spacing are written to match.">
        <NumberInput label="Extrusion" value={s.extrusion} min={0} max={4} onChange={(v) => set({ extrusion: Math.round(v) })} /> px
      </Field>
      <Field label="Include">
        <label className="check">
          <input type="checkbox" checked={s.includePreviews} onChange={(e) => set({ includePreviews: e.target.checked })} /> Preview images
        </label>
        <label className="check">
          <input type="checkbox" checked={s.perTilePngs} onChange={(e) => set({ perTilePngs: e.target.checked })} /> Per-tile PNGs (tiles/ folder)
        </label>
      </Field>
      <Field label="Scope">
        <span className="radio-list">
          <label className="check">
            <input type="radio" name="scope" checked={s.scope === "all"} onChange={() => set({ scope: "all" })} /> Whole project
          </label>
          <label className="check">
            <input type="radio" name="scope" checked={s.scope !== "all"} onChange={() => set({ scope: project.tilesets.map((t) => t.id) })} /> Selected tilesets and subsets
          </label>
        </span>
      </Field>
      {s.scope !== "all" && (
        <ul className="scope-tree">
          {project.tilesets.map((ts) => (
            <li key={ts.id}>
              <label className="check">
                <input type="checkbox" checked={selected.has(ts.id)} onChange={() => toggle(ts.id)} /> {ts.name} <span className="muted">(parent sheet{ts.previews.length ? " + previews" : ""})</span>
              </label>
              <ul>
                {ts.subsets.map((sub) => (
                  <li key={sub.id}>
                    <label className="check">
                      <input type="checkbox" checked={selected.has(sub.id)} onChange={() => toggle(sub.id)} /> {sub.name}
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {last && <p className="hint">Last export: {last.target.label}. Export Again (Ctrl+Shift+E) repeats it with the same settings and path.</p>}
    </Modal>
  );
}
