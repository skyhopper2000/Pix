import { useEffect, useMemo, useRef, useState } from "react";
import { applyImport, defaultImportSettings, gridDims, PALETTE_EXTRACT_LIMIT, previewNameFromFile, sliceImage, validateImport, type ImportSettings } from "../../core/import";
import { activeTileset, history, setStatus, ui, useProject } from "../../state/app";
import { decodeImage, type DecodedImage } from "../decodeImage";
import { drawChecker, fitCanvas } from "../render";
import { Field, Modal, NumberInput } from "../widgets";

const close = () => ui.set({ dialog: null });

function SourcePreview({ img, s }: { img: DecodedImage; s: ImportSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bitmap = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.pixels), img.width, img.height), 0, 0);
    return c;
  }, [img]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const max = 360;
    const scale = Math.max(1, Math.floor(max / Math.max(img.width, img.height))) || 1;
    const fit = Math.min(1, max / Math.max(img.width, img.height));
    const k = img.width * scale > max ? fit : scale;
    const W = Math.round(img.width * k);
    const H = Math.round(img.height * k);
    const ctx = fitCanvas(c, W, H);
    drawChecker(ctx, 0, 0, W, H, 6, true);
    ctx.drawImage(bitmap, 0, 0, W, H);
    const { cols, rows } = gridDims(img.width, img.height, s);
    ctx.strokeStyle = "rgba(0,160,255,0.8)";
    ctx.lineWidth = 1;
    for (let r = 0; r < rows; r++)
      for (let col = 0; col < cols; col++) {
        const x = (s.offsetX + col * (s.tileWidth + s.spacingX)) * k;
        const y = (s.offsetY + r * (s.tileHeight + s.spacingY)) * k;
        ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(1, s.tileWidth * k - 1), Math.max(1, s.tileHeight * k - 1));
      }
  }, [bitmap, img, s]);
  return <canvas ref={ref} className="import-preview" />;
}

export function ImportDialog({ fileName, bytes }: { fileName: string; bytes: Uint8Array }) {
  const project = useProject();
  const ts = activeTileset(project);
  const [img, setImg] = useState<DecodedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<ImportSettings>(() => defaultImportSettings(ts ?? { tileWidth: 16, tileHeight: 16 }));
  const [reviewNear, setReviewNear] = useState(false);
  const [threshold, setThreshold] = useState(5);

  useEffect(() => {
    let live = true;
    decodeImage(bytes).then(
      (d) => live && setImg(d),
      (e) => live && setError(`Couldn't decode "${fileName}": ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [bytes, fileName]);

  const sizeLocked = !!ts && ts.tileOrder.length > 0;
  const errors = img && ts ? validateImport(img, ts, s) : [];
  // Dry run for the summary line (pure, cheap enough to recompute on change).
  const dry = useMemo(() => (img && ts && errors.length === 0 ? sliceImage(img, { ...ts, tileWidth: s.tileWidth, tileHeight: s.tileHeight }, s, "") : null), [img, ts, s, errors.length]);

  if (!ts) return null;
  const set = (patch: Partial<ImportSettings>) => setS((o) => ({ ...o, ...patch }));

  const run = () => {
    if (!img || errors.length) return;
    const name = previewNameFromFile(fileName);
    const target = { ...ts, tileWidth: s.tileWidth, tileHeight: s.tileHeight };
    const result = sliceImage(img, target, s, name);
    history.dispatch(`Import ${fileName}`, (p) => applyImport(p, ts.id, result, s));
    // Open the rebuilt preview and the first tile of the image (tile0_0 when it's new).
    const first = result.preview.cells.find(Boolean) ?? null;
    ui.set({ dialog: null, previewId: result.preview.id, previewCell: first ? result.preview.cells.indexOf(first) : null, tileId: first, subsetId: null, slotIndex: null });
    const st = result.stats;
    setStatus(`Imported ${fileName}: ${st.newTiles} new tiles${st.reused ? `, ${st.reused} cells reuse existing tiles` : ""}${st.skippedEmpty ? `, ${st.skippedEmpty} empty cells skipped` : ""}${result.colors.length >= PALETTE_EXTRACT_LIMIT ? ` (palette extraction stopped at ${PALETTE_EXTRACT_LIMIT} colours)` : ""}.`);
    if (reviewNear) ui.set({ dialog: { kind: "nearDup", threshold: threshold / 100 } });
  };

  const { cols, rows } = img ? gridDims(img.width, img.height, s) : { cols: 0, rows: 0 };
  return (
    <Modal
      title={`Import Image — ${fileName}`}
      onClose={close}
      width={820}
      footer={
        <>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={run} disabled={!img || errors.length > 0}>
            Import into "{ts.name}"
          </button>
        </>
      }
    >
      {error && <p className="errors">{error}</p>}
      {!img && !error && <p>Reading image…</p>}
      {img && (
        <div className="import-body">
          <div>
            <SourcePreview img={img} s={s} />
            <div className="hint">
              {img.width}×{img.height}px · {cols}×{rows} cells{img.exact ? "" : " · decoded by the browser (non-PNG); colours may not be exact"}
            </div>
          </div>
          <div className="import-form">
            <Field label="Grid type" hint="Isometric and hex are planned (stretch goal).">
              <select value={s.grid} onChange={(e) => set({ grid: e.target.value as ImportSettings["grid"] })}>
                <option value="square">Square</option>
                <option value="isometric" disabled>
                  Isometric
                </option>
                <option value="hex" disabled>
                  Hex
                </option>
              </select>
            </Field>
            <Field label="Tile size" hint={sizeLocked ? "Fixed: the tileset already has tiles." : "Sets the tileset's tile size."}>
              <NumberInput label="Tile width" value={s.tileWidth} min={1} max={512} onChange={(v) => !sizeLocked && set({ tileWidth: v })} /> ×{" "}
              <NumberInput label="Tile height" value={s.tileHeight} min={1} max={512} onChange={(v) => !sizeLocked && set({ tileHeight: v })} /> px
            </Field>
            <Field label="Offset" hint="Where the first tile starts.">
              X <NumberInput label="Offset X" value={s.offsetX} min={0} onChange={(v) => set({ offsetX: v })} /> Y <NumberInput label="Offset Y" value={s.offsetY} min={0} onChange={(v) => set({ offsetY: v })} />
            </Field>
            <Field label="Spacing" hint="Gutter between tiles in sheets.">
              X <NumberInput label="Spacing X" value={s.spacingX} min={0} onChange={(v) => set({ spacingX: v })} /> Y <NumberInput label="Spacing Y" value={s.spacingY} min={0} onChange={(v) => set({ spacingY: v })} />
            </Field>
            <Field label="Options">
              <span className="radio-list">
                <label className="check">
                  <input type="checkbox" checked={s.isolateUnique} onChange={(e) => set({ isolateUnique: e.target.checked })} /> Isolate unique tiles <span className="muted">(exact pixel match only)</span>
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.includeEmpty} onChange={(e) => set({ includeEmpty: e.target.checked })} /> Include empty tiles <span className="muted">(transparent or single-colour)</span>
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.extractPalette} onChange={(e) => set({ extractPalette: e.target.checked })} /> Extract palette <span className="muted">(reads colours, never changes them)</span>
                </label>
                <label className="check">
                  <input type="checkbox" checked={reviewNear} onChange={(e) => setReviewNear(e.target.checked)} /> Then review near-duplicates up to{" "}
                  <NumberInput label="Near-duplicate threshold" value={threshold} min={0} max={50} width={48} onChange={(v) => setThreshold(Math.max(0, Math.min(50, v)))} />% different pixels
                </label>
              </span>
            </Field>
            {dry && (
              <p className="import-summary">
                {dry.stats.cells} cells → <b>{dry.stats.newTiles}</b> new tiles
                {dry.stats.reused ? `, ${dry.stats.reused} cells reuse existing tiles` : ""}
                {dry.stats.skippedEmpty ? `, ${dry.stats.skippedEmpty} empty skipped` : ""}
                {s.extractPalette ? `, ${dry.colors.length}${dry.colors.length >= PALETTE_EXTRACT_LIMIT ? "+" : ""} colours` : ""}. The image becomes map preview "{previewNameFromFile(fileName)}".
              </p>
            )}
            {errors.length > 0 && (
              <ul className="errors">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
