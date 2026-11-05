import { useEffect, useRef, useState } from "react";
import { toHex } from "../../core/color";
import { previewPng, safeName } from "../../core/export";
import type { Color, Preview, TileId, Tileset } from "../../core/model";
import * as ops from "../../core/ops";
import { getPixel, setPixel } from "../../core/pixels";
import { floodFill, isLCorner, linePoints, shadeColor, type Pt } from "../../core/tools";
import { getPlatform } from "../../platform";
import { activePreview, activeTileset, history, setStatus, ui, useProject, useUi, type PreviewTool } from "../../state/app";
import { drawChecker, fitCanvas, tileCanvas } from "../render";
import { EmptyState, IconButton } from "../widgets";
import { isTileDrag, readDrag } from "./TileBar";

interface Gesture {
  mode: PreviewTool;
  tool: string;
  button: number;
  color: Color;
  last: Pt;
  path: Pt[];
  base: Map<TileId, Uint8ClampedArray>;
  work: Map<TileId, Uint8ClampedArray>;
  shaded: Set<string>;
  cells: Set<number>;
}

function previewChoices(ts: Tileset): { id: string; label: string }[] {
  return [...ts.previews.map((p) => ({ id: p.id, label: p.name })), ...ts.subsets.map((s) => ({ id: s.preview.id, label: `${s.name} (subset preview)` }))];
}

export function PreviewPanel() {
  const project = useProject();
  const ts = activeTileset(project);
  useUi((s) => s.tilesetId);
  useUi((s) => s.previewId);
  const pv = activePreview(project);
  const zoom = useUi((s) => s.previewZoom);
  const grid = useUi((s) => s.previewGrid);
  const highlight = useUi((s) => s.highlightUses);
  const mode = useUi((s) => s.previewTool);
  const tileId = useUi((s) => s.tileId);
  const previewCell = useUi((s) => s.previewCell);
  const theme = useUi((s) => s.theme);
  const tool = useUi((s) => s.tool);
  const pixelPerfect = useUi((s) => s.pixelPerfect);
  const fillGlobal = useUi((s) => s.fillGlobal);
  const [pngScale, setPngScale] = useState(1);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g = useRef<Gesture | null>(null);

  const tw = ts?.tileWidth ?? 16;
  const th = ts?.tileHeight ?? 16;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !ts || !pv) return;
    const W = pv.cols * tw * zoom;
    const H = pv.rows * th * zoom;
    const ctx = fitCanvas(c, W, H);
    const dark = theme === "dark";
    drawChecker(ctx, 0, 0, W, H, Math.max(4, zoom * 4), dark);
    pv.cells.forEach((id, i) => {
      const t = id ? ts.tiles[id] : undefined;
      if (t) ctx.drawImage(tileCanvas(t.pixels, tw, th), (i % pv.cols) * tw * zoom, Math.floor(i / pv.cols) * th * zoom, tw * zoom, th * zoom);
    });
    if (grid) {
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < pv.cols; x++) {
        ctx.moveTo(x * tw * zoom + 0.5, 0);
        ctx.lineTo(x * tw * zoom + 0.5, H);
      }
      for (let y = 1; y < pv.rows; y++) {
        ctx.moveTo(0, y * th * zoom + 0.5);
        ctx.lineTo(W, y * th * zoom + 0.5);
      }
      ctx.stroke();
    }
    const outline = (i: number, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect((i % pv.cols) * tw * zoom + width / 2, Math.floor(i / pv.cols) * th * zoom + width / 2, tw * zoom - width, th * zoom - width);
    };
    if (highlight && tileId) pv.cells.forEach((id, i) => id === tileId && outline(i, "#ffcc00", 2));
    if (previewCell !== null && previewCell < pv.cells.length) outline(previewCell, "#3794ff", 2);
    if (hoverCell !== null && mode !== "draw") outline(hoverCell, "rgba(255,255,255,0.6)", 1);
  }, [ts, pv, tw, th, zoom, grid, highlight, tileId, previewCell, theme, hoverCell, mode]);

  if (!ts) return <EmptyState>No tileset open.</EmptyState>;
  if (!pv) {
    return (
      <EmptyState>
        <div>No preview yet. Import an image (it becomes a preview), or create a blank one.</div>
        <button type="button" onClick={() => ui.set({ dialog: { kind: "newPreview" } })}>
          New Preview
        </button>
      </EmptyState>
    );
  }

  const cellAt = (p: Pt) => (p.x < 0 || p.y < 0 || p.x >= pv.cols * tw || p.y >= pv.rows * th ? -1 : Math.floor(p.y / th) * pv.cols + Math.floor(p.x / tw));
  const toPx = (e: React.PointerEvent | React.DragEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / zoom), y: Math.floor((e.clientY - r.top) / zoom) };
  };

  const stampCells = (gs: Gesture, i: number, preview: Preview) => {
    if (i < 0 || gs.cells.has(i)) return;
    gs.cells.add(i);
    const value = gs.mode === "clear" || gs.button === 2 ? null : (ui.get().tileId ?? null);
    if (gs.mode === "stamp" && value === null && gs.button !== 2) {
      setStatus("Select a tile in the tile bar to stamp it.");
      return;
    }
    history.preview((p) => ops.setPreviewCells(p, ts.id, preview.id, [{ index: i, tileId: value }]));
  };

  /** Applies one stroke point in preview pixel space to whichever tile is under it. */
  const paintAt = (gs: Gesture, p: Pt) => {
    const i = cellAt(p);
    const id = i >= 0 ? pv.cells[i] : null;
    if (!id) return;
    const lx = p.x % tw;
    const ly = p.y % th;
    if (!gs.work.has(id)) {
      const px = history.project.tilesets.find((x) => x.id === ts.id)!.tiles[id].pixels;
      gs.base.set(id, px);
      gs.work.set(id, px.slice());
    }
    const work = gs.work.get(id)!;
    if (gs.tool === "shade") {
      const k = `${id}:${lx},${ly}`;
      if (gs.shaded.has(k)) return;
      gs.shaded.add(k);
      const pal = history.project.palette;
      setPixel(work, tw, lx, ly, shadeColor(getPixel(gs.base.get(id)!, tw, lx, ly), gs.button === 2 ? -1 : 1, pal.locked ? pal.colors : null));
    } else setPixel(work, tw, lx, ly, gs.color);
  };

  const restoreAt = (gs: Gesture, p: Pt) => {
    const i = cellAt(p);
    const id = i >= 0 ? pv.cells[i] : null;
    if (!id || !gs.work.has(id)) return;
    setPixel(gs.work.get(id)!, tw, p.x % tw, p.y % th, getPixel(gs.base.get(id)!, tw, p.x % tw, p.y % th));
  };

  const flush = (gs: Gesture) => {
    const edits = new Map([...gs.work].map(([id, px]) => [id, px.slice()] as const));
    history.preview((p) => ops.setManyTilePixels(p, ts.id, edits));
  };

  const strokeTo = (gs: Gesture, to: Pt) => {
    const pts = linePoints(gs.last.x, gs.last.y, to.x, to.y).slice(gs.path.length ? 1 : 0);
    for (const p of pts) {
      paintAt(gs, p);
      gs.path.push(p);
      const n = gs.path.length;
      if (gs.tool === "pencil" && pixelPerfect && n >= 3 && isLCorner(gs.path[n - 3], gs.path[n - 2], gs.path[n - 1])) {
        const mid = gs.path[n - 2];
        if (!gs.path.slice(0, n - 2).some((q) => q.x === mid.x && q.y === mid.y)) restoreAt(gs, mid);
        gs.path.splice(n - 2, 1);
      }
    }
    gs.last = to;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (g.current || (e.button !== 0 && e.button !== 2)) return;
    const p = toPx(e);
    const i = cellAt(p);
    if (i < 0) return;
    const id = pv.cells[i];
    // Selecting a tile anywhere opens it in the tile editor.
    if (mode === "draw") ui.set({ previewCell: i, tileId: id ?? ui.get().tileId, slotIndex: null });
    const base: Gesture = { mode, tool, button: e.button, color: 0, last: p, path: [], base: new Map(), work: new Map(), shaded: new Set(), cells: new Set() };
    if (mode !== "draw") {
      (e.target as Element).setPointerCapture(e.pointerId);
      g.current = base;
      stampCells(base, i, pv);
      return;
    }
    if (!id) return;
    const t = e.altKey ? "picker" : tool;
    const local = { x: p.x % tw, y: p.y % th };
    if (t === "picker") {
      const c = getPixel(ts.tiles[id].pixels, tw, local.x, local.y);
      ui.set(e.button === 2 ? { secondary: c } : { primary: c });
      setStatus(`Picked ${toHex(c)}`);
      return;
    }
    if (t !== "pencil" && t !== "eraser" && t !== "shade" && t !== "fill") {
      setStatus(`Opened ${ts.tiles[id].name}. Use the tile editor for that tool.`);
      return;
    }
    const color = t === "eraser" ? 0 : e.button === 2 ? ui.get().secondary : ui.get().primary;
    const pal = history.project.palette;
    if (t !== "shade" && pal.locked && (color & 255) !== 0 && !pal.colors.includes(color)) {
      setStatus(`${toHex(color)} isn't in the locked palette.`);
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    base.color = color;
    base.tool = t;
    g.current = base;
    if (t === "fill") {
      const px = ts.tiles[id].pixels;
      base.base.set(id, px);
      base.work.set(id, floodFill(px, tw, th, local.x, local.y, color, fillGlobal));
    } else strokeTo(base, p);
    flush(base);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toPx(e);
    const i = cellAt(p);
    setHoverCell(i >= 0 ? i : null);
    const gs = g.current;
    if (!gs) return;
    if (gs.mode !== "draw") return stampCells(gs, i, pv);
    if (gs.tool === "fill" || (p.x === gs.last.x && p.y === gs.last.y)) return;
    strokeTo(gs, p);
    flush(gs);
  };

  const onPointerUp = () => {
    const gs = g.current;
    g.current = null;
    if (!gs) return;
    const labels: Record<string, string> = { stamp: "Stamp", clear: "Clear cells", pencil: "Draw on preview", eraser: "Erase on preview", shade: "Shade on preview", fill: "Fill on preview" };
    history.commit(gs.mode === "draw" ? (labels[gs.tool] ?? "Edit") : gs.button === 2 ? "Clear cells" : labels[gs.mode]);
  };

  const exportPng = async () => {
    try {
      const bytes = previewPng(ts, pv, pngScale);
      const name = `${safeName(pv.name)}${pngScale > 1 ? `@${pngScale}x` : ""}.png`;
      const t = await (await getPlatform()).saveFileAs(name, [{ name: "PNG image", extensions: ["png"] }], bytes);
      if (t) setStatus(`Saved ${t.label}`);
    } catch (err) {
      ui.set({ dialog: { kind: "message", title: "Couldn't export the preview", body: [String(err)] } });
    }
  };

  const modes: { id: PreviewTool; label: string; icon: string; title: string }[] = [
    { id: "draw", label: "Draw", icon: "✎", title: "Draw: edit the tile under the cursor with the current tool. Every place it appears updates." },
    { id: "stamp", label: "Stamp", icon: "⧠", title: "Stamp: place the selected tile in cells (right-click clears)" },
    { id: "clear", label: "Clear", icon: "⌧", title: "Clear: empty cells" },
  ];

  return (
    <div className="panel preview-panel">
      <div className="panel-toolbar">
        <select aria-label="Preview" value={pv.id} onChange={(e) => ui.set({ previewId: e.target.value, previewCell: null })}>
          {previewChoices(ts).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="sep-v" />
        {modes.map((m) => (
          <IconButton key={m.id} title={m.title} active={mode === m.id} onClick={() => ui.set({ previewTool: m.id })}>
            {m.icon} {m.label}
          </IconButton>
        ))}
        <span className="sep-v" />
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(e) => ui.set({ previewGrid: e.target.checked })} /> grid
        </label>
        <label className="check" title="Outline every cell that uses the selected tile">
          <input type="checkbox" checked={highlight} onChange={(e) => ui.set({ highlightUses: e.target.checked })} /> highlight uses
        </label>
        <span className="spacer" />
        <IconButton title="Zoom out" onClick={() => ui.set({ previewZoom: Math.max(1, zoom - 1) })}>
          −
        </IconButton>
        <span className="muted">{zoom}×</span>
        <IconButton title="Zoom in" onClick={() => ui.set({ previewZoom: Math.min(16, zoom + 1) })}>
          ＋
        </IconButton>
        <IconButton title="Resize preview" onClick={() => ui.set({ dialog: { kind: "resize", what: "preview", id: pv.id, cols: pv.cols, rows: pv.rows } })}>
          ⇲
        </IconButton>
        <span className="sep-v" />
        <select aria-label="PNG scale" value={pngScale} onChange={(e) => setPngScale(Number(e.target.value))}>
          {[1, 2, 3, 4, 6, 8].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void exportPng()} title="Export this preview as a PNG image">
          Export PNG
        </button>
      </div>
      <div
        className="canvas-host"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          ui.set({ previewZoom: Math.max(1, Math.min(16, zoom + (e.deltaY < 0 ? 1 : -1))) });
        }}
      >
        <div className="canvas-center">
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            style={{ cursor: mode === "draw" ? "crosshair" : "cell", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHoverCell(null)}
            onContextMenu={(e) => e.preventDefault()}
            onDragOver={(e) => isTileDrag(e) && e.preventDefault()}
            onDrop={(e) => {
              const d = readDrag(e);
              const i = cellAt(toPx(e));
              if (!d || i < 0) return;
              e.preventDefault();
              history.dispatch("Stamp", (p) => ops.setPreviewCells(p, ts.id, pv.id, [{ index: i, tileId: d.tileId }]));
              ui.set({ tileId: d.tileId, previewCell: i });
            }}
          />
        </div>
      </div>
      <div className="editor-footer">
        <span>
          {pv.name} · {pv.cols}×{pv.rows}
        </span>
        <span className="spacer" />
        <span>{hoverCell !== null ? `cell ${hoverCell % pv.cols}, ${Math.floor(hoverCell / pv.cols)}${pv.cells[hoverCell] ? ` · ${ts.tiles[pv.cells[hoverCell]!]?.name}` : " · empty"}` : ""}</span>
      </div>
    </div>
  );
}
