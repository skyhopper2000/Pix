import { useState } from "react";
import type { SubsetType, Template, Terrain } from "../core/model";
import { DEFAULT_TILE_SIZE } from "../core/model";
import * as ops from "../core/ops";
import * as A from "../state/actions";
import { activeTileset, history, ui, useUi, type Dialog } from "../state/app";
import { CustomTemplateEditor } from "./CustomTemplateEditor";
import { ExportDialog } from "./dialogs/ExportDialog";
import { ImportDialog } from "./dialogs/ImportDialog";
import { NearDupDialog } from "./dialogs/NearDupDialog";
import { Field, Modal, NumberInput } from "./widgets";

const close = () => ui.set({ dialog: null });

function Buttons({ ok, okLabel = "OK", disabled }: { ok: () => void; okLabel?: string; disabled?: boolean }) {
  return (
    <>
      <button type="button" onClick={close}>
        Cancel
      </button>
      <button type="button" className="primary" onClick={ok} disabled={disabled}>
        {okLabel}
      </button>
    </>
  );
}

function NewTileset() {
  const [name, setName] = useState(`tileset ${history.project.tilesets.length + 1}`);
  const [w, setW] = useState(DEFAULT_TILE_SIZE);
  const [h, setH] = useState(DEFAULT_TILE_SIZE);
  const valid = w >= 1 && h >= 1 && w <= 512 && h <= 512 && name.trim() !== "";
  const ok = () => {
    if (!valid) return;
    close();
    A.newTileset(name, w, h);
  };
  return (
    <Modal title="New Tileset" onClose={close} footer={<Buttons ok={ok} okLabel="Create" disabled={!valid} />}>
      <form onSubmit={(e) => (e.preventDefault(), ok())}>
        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tile size" hint="Every tile in a tileset has this size.">
          <NumberInput label="Tile width" value={w} min={1} max={512} onChange={setW} /> × <NumberInput label="Tile height" value={h} min={1} max={512} onChange={setH} /> px
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function Rename({ d }: { d: Extract<Dialog, { kind: "rename" }> }) {
  const [name, setName] = useState(d.current);
  const ok = () => {
    close();
    A.rename(d.what, d.id, name);
  };
  return (
    <Modal title={`Rename ${d.what}`} onClose={close} footer={<Buttons ok={ok} okLabel="Rename" disabled={!name.trim()} />}>
      <form onSubmit={(e) => (e.preventDefault(), ok())}>
        <Field label="Name">
          <input autoFocus value={name} onFocus={(e) => e.target.select()} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

const SUBSET_TYPES: { type: SubsetType; label: string; desc: string }[] = [
  { type: "unstructured", label: "Unstructured", desc: "Free arrangement, any count. Plain tileset in Tiled." },
  { type: "blob47", label: "47 blob", desc: "47 fixed slots, 2 terrains. Mixed Wang set." },
  { type: "corner16", label: "16 corner", desc: "16 fixed slots, 2 terrains. Corner Wang set." },
  { type: "edge16", label: "16 edge", desc: "16 fixed slots, 2 terrains. Edge Wang set." },
  { type: "custom", label: "Custom template", desc: "Your own slot grid with Wang bits per slot." },
];

function TerrainFields({ terrains, onChange }: { terrains: [Terrain, Terrain]; onChange: (t: [Terrain, Terrain]) => void }) {
  const set = (i: 0 | 1, patch: Partial<Terrain>) => {
    const next: [Terrain, Terrain] = [{ ...terrains[0] }, { ...terrains[1] }];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  return (
    <>
      {([0, 1] as const).map((i) => (
        <Field key={i} label={`Terrain ${i === 0 ? "A" : "B"}`}>
          <input value={terrains[i].name} aria-label={`Terrain ${i === 0 ? "A" : "B"} name`} onChange={(e) => set(i, { name: e.target.value })} />
          <input type="color" value={terrains[i].color} aria-label={`Terrain ${i === 0 ? "A" : "B"} colour`} onChange={(e) => set(i, { color: e.target.value })} />
        </Field>
      ))}
    </>
  );
}

function NewSubset() {
  const [name, setName] = useState("");
  const [type, setType] = useState<SubsetType>("unstructured");
  const [terrains, setTerrains] = useState<[Terrain, Terrain]>(ops.DEFAULT_TERRAINS);
  const [cols, setCols] = useState(8);
  const [rows, setRows] = useState(4);
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateValid, setTemplateValid] = useState(false);
  const templated = type !== "unstructured";
  const defaultName = templated ? `${terrains[0].name}_${terrains[1].name}` : "objects";
  const valid = cols >= 1 && rows >= 1 && (type !== "custom" || (template && templateValid));
  const ok = () => {
    const ts = activeTileset();
    if (!ts || !valid) return;
    const sub = ops.createSubset(name.trim() || defaultName, type, { terrains, cols, rows, template: template ?? undefined });
    close();
    history.dispatch("New subset", (p) => ops.addSubset(p, ts.id, sub));
    ui.set({ subsetId: sub.id, slotIndex: null, previewId: sub.preview.id, previewCell: null });
  };
  return (
    <Modal title="New Subset" onClose={close} width={type === "custom" ? 640 : 460} footer={<Buttons ok={ok} okLabel="Create" disabled={!valid} />}>
      <Field label="Type">
        <span className="radio-list">
          {SUBSET_TYPES.map((t) => (
            <label key={t.type} className="radio">
              <input type="radio" name="subset-type" checked={type === t.type} onChange={() => setType(t.type)} />
              <b>{t.label}</b> <span className="muted">{t.desc}</span>
            </label>
          ))}
        </span>
      </Field>
      <Field label="Name">
        <input value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
      </Field>
      {templated ? (
        <TerrainFields terrains={terrains} onChange={setTerrains} />
      ) : (
        <Field label="Canvas" hint="The arrangement is the exported layout. You can resize it later.">
          <NumberInput label="Columns" value={cols} min={1} max={256} onChange={setCols} /> × <NumberInput label="Rows" value={rows} min={1} max={256} onChange={setRows} /> cells
        </Field>
      )}
      {type === "custom" && (
        <CustomTemplateEditor
          terrains={terrains}
          onChange={(t, ok) => {
            setTemplate(t);
            setTemplateValid(ok);
          }}
        />
      )}
    </Modal>
  );
}

function NewPreview() {
  const ts = activeTileset();
  const [name, setName] = useState(`preview ${(ts?.previews.length ?? 0) + 1}`);
  const [cols, setCols] = useState(16);
  const [rows, setRows] = useState(12);
  const ok = () => {
    if (!ts) return;
    const pv = ops.createPreview(name.trim() || "preview", cols, rows);
    close();
    history.dispatch("New preview", (p) => ops.addPreview(p, ts.id, pv));
    ui.set({ previewId: pv.id, previewCell: null });
  };
  return (
    <Modal title="New Preview" onClose={close} footer={<Buttons ok={ok} okLabel="Create" disabled={cols < 1 || rows < 1} />}>
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Size">
        <NumberInput label="Columns" value={cols} min={1} max={1024} onChange={setCols} /> × <NumberInput label="Rows" value={rows} min={1} max={1024} onChange={setRows} /> tiles
      </Field>
    </Modal>
  );
}

function Resize({ d }: { d: Extract<Dialog, { kind: "resize" }> }) {
  const [cols, setCols] = useState(d.cols);
  const [rows, setRows] = useState(d.rows);
  const ok = () => {
    const ts = activeTileset();
    if (!ts) return;
    close();
    history.dispatch(`Resize ${d.what}`, (p) => (d.what === "preview" ? ops.resizePreview(p, ts.id, d.id, cols, rows) : ops.resizeSubset(p, ts.id, d.id, cols, rows)));
  };
  return (
    <Modal title={d.what === "preview" ? "Resize Preview" : "Resize Subset Canvas"} onClose={close} footer={<Buttons ok={ok} okLabel="Resize" disabled={cols < 1 || rows < 1} />}>
      <Field label="Size" hint="Cells keep their position. Cells outside the new size are dropped (you can undo).">
        <NumberInput label="Columns" value={cols} min={1} max={1024} onChange={setCols} /> × <NumberInput label="Rows" value={rows} min={1} max={1024} onChange={setRows} />
      </Field>
    </Modal>
  );
}

function Terrains({ d }: { d: Extract<Dialog, { kind: "terrains" }> }) {
  const ts = activeTileset();
  const sub = ts?.subsets.find((s) => s.id === d.subsetId);
  const [terrains, setTerrains] = useState<[Terrain, Terrain]>(sub?.terrains ?? ops.DEFAULT_TERRAINS);
  if (!ts || !sub) return null;
  const ok = () => {
    close();
    history.dispatch("Edit terrains", (p) => ops.updateSubset(p, ts.id, sub.id, { terrains }));
  };
  return (
    <Modal title={`Terrains of "${sub.name}"`} onClose={close} footer={<Buttons ok={ok} okLabel="Save" />}>
      <TerrainFields terrains={terrains} onChange={setTerrains} />
      <p className="hint">Names become Wang colour names in the exported .tsx and drive slot auto-names. Existing tile names don't change; use Tileset › Name Subset Tiles from Slots for that.</p>
    </Modal>
  );
}

export function Dialogs() {
  const d = useUi((s) => s.dialog);
  if (!d) return null;
  switch (d.kind) {
    case "newTileset":
      return <NewTileset />;
    case "rename":
      return <Rename d={d} />;
    case "newSubset":
      return <NewSubset />;
    case "newPreview":
      return <NewPreview />;
    case "resize":
      return <Resize d={d} />;
    case "terrains":
      return <Terrains d={d} />;
    case "import":
      return <ImportDialog fileName={d.fileName} bytes={d.bytes} />;
    case "export":
      return <ExportDialog />;
    case "nearDup":
      return <NearDupDialog />;
    case "message":
      return (
        <Modal title={d.title} onClose={close} footer={<button type="button" className="primary" onClick={close} autoFocus>OK</button>}>
          {d.body.length > 1 ? (
            <ul className="message-list">
              {d.body.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <p>{d.body[0]}</p>
          )}
        </Modal>
      );
    case "confirm":
      return (
        <Modal
          title={d.title}
          onClose={close}
          footer={
            <Buttons
              okLabel={d.confirmLabel}
              ok={() => {
                close();
                d.onConfirm();
              }}
            />
          }
        >
          <p>{d.body}</p>
        </Modal>
      );
  }
}
