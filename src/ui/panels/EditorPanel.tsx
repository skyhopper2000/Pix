import { useEffect, useMemo, useRef, useState } from "react";
import { toHex } from "../../core/color";
import type { Color, Preview, Project, TileId, Tileset } from "../../core/model";
import * as ops from "../../core/ops";
import { createPixels, crop, getPixel, setPixel } from "../../core/pixels";
import { boxFrom, brushPoints, ellipsePoints, floodFill, isLCorner, linePoints, plot, rectPoints, shadeColor, type Pt } from "../../core/tools";
import { activePreview, activeSubset, activeTileset, history, setStatus, ui, useProject, useUi, type ToolId } from "../../state/app";
import { editorBridge } from "../commands";
import { drawChecker, fitCanvas, tileCanvas } from "../render";
import { EmptyState, IconButton, NumberInput } from "../widgets";

/** Keeps receiving moves outside the canvas. Can throw for synthetic or already-released pointers; drawing still works without it. */
function capturePointer(e: React.PointerEvent) {
  try {
    (e.target as Element).setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

const TOOLS: { id: ToolId; label: string; key: string; icon: string }[] = [
  { id: "pencil", label: "Pencil", key: "B", icon: "✎" },
  { id: "eraser", label: "Eraser", key: "E", icon: "⌫" },
  { id: "fill", label: "Fill", key: "G", icon: "◧" },
  { id: "line", label: "Line", key: "L", icon: "╱" },
  { id: "rect", label: "Rectangle", key: "U", icon: "▭" },
  { id: "ellipse", label: "Ellipse / circle", key: "Shift+U", icon: "◯" },
  { id: "shade", label: "Lighten (left) / darken (right)", key: "D", icon: "◐" },
  { id: "select", label: "Selection + move", key: "M", icon: "⬚" },
  { id: "picker", label: "Color picker", key: "I or Alt+click", icon: "⊙" },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Gesture {
  kind: "draw" | "select" | "move";
  tool: ToolId;
  button: number;
  tileId: TileId;
  base: Uint8ClampedArray;
  work: Uint8ClampedArray;
  start: Pt;
  last: Pt;
  path: Pt[];
  color: Color;
  shaded: Set<number>;
  label: string;
  lifted?: { rect: Rect; pixels: Uint8ClampedArray; hole: Uint8ClampedArray };
}

/** Copies src into dst at (dx,dy), skipping fully transparent source pixels. Mutates dst (a working copy). */
function blitMasked(dst: Uint8ClampedArray, W: number, H: number, src: Uint8ClampedArray, w: number, h: number, dx: number, dy: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = getPixel(src, w, x, y);
      const X = dx + x;
      const Y = dy + y;
      if ((c & 255) !== 0 && X >= 0 && Y >= 0 && X < W && Y < H) setPixel(dst, W, X, Y, c);
    }
}

function clearRect(buf: Uint8ClampedArray, w: number, h: number, r: Rect) {
  const out = buf.slice();
  for (let y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(w, r.x + r.w); x++) setPixel(out, w, x, y, 0);
  return out;
}

/** Where the open tile sits in the active preview, for neighbour context. */
function neighbourCell(pv: Preview | undefined, tileId: TileId | null, clicked: number | null): { r: number; c: number } | null {
  if (!pv || !tileId) return null;
  const i = clicked !== null && pv.cells[clicked] === tileId ? clicked : pv.cells.indexOf(tileId);
  return i < 0 ? null : { r: Math.floor(i / pv.cols), c: i % pv.cols };
}

const blankCache = new Map<string, Uint8ClampedArray>();
const blankFor = (ts: Tileset) => {
  const k = ts.tileWidth + "x" + ts.tileHeight;
  let b = blankCache.get(k);
  if (!b) blankCache.set(k, (b = createPixels(ts.tileWidth, ts.tileHeight)));
  return b;
};

export function EditorPanel() {
  const project = useProject();
  const tool = useUi((s) => s.tool);
  const zoom = useUi((s) => s.editorZoom);
  const margin = useUi((s) => s.neighborMargin);
  const theme = useUi((s) => s.theme);
  const tileId = useUi((s) => s.tileId);
  const slotIndex = useUi((s) => s.slotIndex);
  const subsetId = useUi((s) => s.subsetId);
  useUi((s) => s.previewId);
  const previewCell = useUi((s) => s.previewCell);
  const pixelPerfect = useUi((s) => s.pixelPerfect);
  const fillGlobal = useUi((s) => s.fillGlobal);
  const shapeFilled = useUi((s) => s.shapeFilled);
  const brushSize = useUi((s) => s.brushSize);
  const primary = useUi((s) => s.primary);
  const secondary = useUi((s) => s.secondary);

  const ts = activeTileset(project);
  const tile = ts && tileId ? ts.tiles[tileId] : undefined;
  const subset = activeSubset(project);
  const slotTarget = !tile && subset && slotIndex !== null && !subset.cells[slotIndex] ? { subset, index: slotIndex } : null;
  const pv = activePreview(project);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;
  const [hover, setHover] = useState<Pt | null>(null);

  // Selection belongs to one tile.
  useEffect(() => setSel(null), [tileId]);
  useEffect(() => {
    if (tool !== "select") setSel(null);
  }, [tool]);

  const tw = ts?.tileWidth ?? 16;
  const th = ts?.tileHeight ?? 16;
  const m = Math.max(0, Math.min(margin, Math.max(tw, th)));
  const pixels = tile?.pixels ?? (ts ? blankFor(ts) : null);
  const cell = neighbourCell(pv, tile?.id ?? null, previewCell);

  const neighbours = useMemo(() => {
    const out: { dr: number; dc: number; px: Uint8ClampedArray }[] = [];
    if (!ts || !pv || !cell) return out;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = cell.r + dr;
        const c = cell.c + dc;
        if (r < 0 || c < 0 || r >= pv.rows || c >= pv.cols) continue;
        const id = pv.cells[r * pv.cols + c];
        const t = id ? ts.tiles[id] : undefined;
        if (t) out.push({ dr, dc, px: t.pixels });
      }
    return out;
  }, [ts, pv, cell?.r, cell?.c]);

  // ---------- render ----------
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !pixels) return;
    const W = (tw + 2 * m) * zoom;
    const H = (th + 2 * m) * zoom;
    const ctx = fitCanvas(c, W, H);
    const dark = theme === "dark";
    ctx.fillStyle = dark ? "#181818" : "#e4e4e4";
    ctx.fillRect(0, 0, W, H);
    // Neighbour context: dimmed, read-only, clipped to the margin.
    if (m > 0 && neighbours.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(m * zoom, m * zoom, tw * zoom, th * zoom);
      ctx.clip("evenodd");
      for (const n of neighbours) ctx.drawImage(tileCanvas(n.px, tw, th), (m + n.dc * tw) * zoom, (m + n.dr * th) * zoom, tw * zoom, th * zoom);
      ctx.fillStyle = dark ? "rgba(24,24,24,0.55)" : "rgba(228,228,228,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const ox = m * zoom;
    const oy = m * zoom;
    drawChecker(ctx, ox, oy, tw * zoom, th * zoom, Math.max(4, zoom / 2), dark);
    ctx.drawImage(tileCanvas(pixels, tw, th), ox, oy, tw * zoom, th * zoom);
    if (zoom >= 8) {
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < tw; x++) {
        ctx.moveTo(ox + x * zoom + 0.5, oy);
        ctx.lineTo(ox + x * zoom + 0.5, oy + th * zoom);
      }
      for (let y = 1; y < th; y++) {
        ctx.moveTo(ox, oy + y * zoom + 0.5);
        ctx.lineTo(ox + tw * zoom, oy + y * zoom + 0.5);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
    ctx.strokeRect(ox - 0.5, oy - 0.5, tw * zoom + 1, th * zoom + 1);
    if (sel) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "#fff";
      ctx.strokeRect(ox + sel.x * zoom + 0.5, oy + sel.y * zoom + 0.5, sel.w * zoom - 1, sel.h * zoom - 1);
      ctx.lineDashOffset = 3.5;
      ctx.strokeStyle = "#000";
      ctx.strokeRect(ox + sel.x * zoom + 0.5, oy + sel.y * zoom + 0.5, sel.w * zoom - 1, sel.h * zoom - 1);
      ctx.restore();
    }
  }, [pixels, neighbours, tw, th, m, zoom, theme, sel]);

  // ---------- helpers ----------
  const toPixel = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / zoom) - m, y: Math.floor((e.clientY - r.top) / zoom) - m };
  };
  const inTile = (p: Pt) => p.x >= 0 && p.y >= 0 && p.x < tw && p.y < th;

  /** The tile to draw into, creating it (draft or empty slot) as part of the current gesture. */
  const ensureTile = (): TileId | null => {
    if (!ts) return null;
    if (tile) return tile.id;
    let id: TileId | null = null;
    if (slotTarget) {
      history.preview((p) => {
        const r = ops.addTileInSubset(p, ts.id, slotTarget.subset.id, slotTarget.index);
        id = r.tileId;
        return r.project;
      });
    } else {
      const t = ops.createTile(ts, `tile_${ts.tileOrder.length}`);
      id = t.id;
      history.preview((p) => ops.addTile(p, ts.id, t));
    }
    if (id) ui.set({ tileId: id });
    return id;
  };

  const paletteAllows = (c: Color) => {
    const pal = history.project.palette;
    if (!pal.locked || (c & 255) === 0 || pal.colors.includes(c)) return true;
    setStatus(`${toHex(c)} isn't in the locked palette. Pick a palette colour or unlock the palette.`);
    return false;
  };

  const push = (g: Gesture) => {
    const id = g.tileId;
    const tsId = ts!.id;
    const px = g.work.slice();
    history.preview((p: Project) => ops.setTilePixels(p, tsId, id, px));
  };

  const drawAlong = (g: Gesture, to: Pt) => {
    const pts = linePoints(g.last.x, g.last.y, to.x, to.y);
    for (const p of pts.slice(g.path.length ? 1 : 0)) {
      if (g.tool === "shade") {
        if (!inTile(p)) continue;
        const k = p.y * tw + p.x;
        if (g.shaded.has(k)) continue;
        g.shaded.add(k);
        const pal = history.project.palette;
        setPixel(g.work, tw, p.x, p.y, shadeColor(getPixel(g.base, tw, p.x, p.y), g.button === 2 ? -1 : 1, pal.locked ? pal.colors : null));
        continue;
      }
      const size = g.tool === "pencil" || g.tool === "eraser" ? brushSize : 1;
      for (const q of brushPoints(p, size)) if (inTile(q)) setPixel(g.work, tw, q.x, q.y, g.color);
      g.path.push(p);
      // Pixel-perfect: undo the doubled corner of an L-step in this stroke (pencil, 1px only).
      const n = g.path.length;
      if (g.tool === "pencil" && pixelPerfect && size === 1 && n >= 3 && isLCorner(g.path[n - 3], g.path[n - 2], g.path[n - 1])) {
        const mid = g.path[n - 2];
        const drawnElsewhere = g.path.slice(0, n - 2).some((q) => q.x === mid.x && q.y === mid.y);
        if (inTile(mid) && !drawnElsewhere) setPixel(g.work, tw, mid.x, mid.y, getPixel(g.base, tw, mid.x, mid.y));
        g.path.splice(n - 2, 1);
      }
    }
    g.last = to;
  };

  const shape = (g: Gesture, to: Pt, shift: boolean) => {
    let pts: Pt[];
    if (g.tool === "line") pts = linePoints(g.start.x, g.start.y, to.x, to.y);
    else {
      const b = boxFrom(g.start, to, shift);
      pts = g.tool === "rect" ? rectPoints(b.x0, b.y0, b.x1, b.y1, shapeFilled) : ellipsePoints(b.x0, b.y0, b.x1, b.y1, shapeFilled);
    }
    g.work = plot(g.base, tw, th, pts, g.color);
  };

  // ---------- pointer handlers ----------
  const onPointerDown = (e: React.PointerEvent) => {
    if (!ts || !pixels || gesture.current) return;
    if (e.button !== 0 && e.button !== 2) return;
    const p = toPixel(e);
    const t: ToolId = e.altKey ? "picker" : tool;
    if (t === "picker") {
      if (!inTile(p)) return;
      const c = getPixel(pixels, tw, p.x, p.y);
      ui.set(e.button === 2 ? { secondary: c } : { primary: c });
      setStatus(`Picked ${toHex(c)}`);
      return;
    }
    capturePointer(e);

    if (t === "select") {
      const s = selRef.current;
      if (s && p.x >= s.x && p.y >= s.y && p.x < s.x + s.w && p.y < s.y + s.h && tile) {
        const lifted = crop(tile.pixels, tw, th, s.x, s.y, s.w, s.h);
        const hole = clearRect(tile.pixels, tw, th, s);
        gesture.current = { kind: "move", tool: t, button: e.button, tileId: tile.id, base: tile.pixels, work: hole.slice(), start: p, last: p, path: [], color: 0, shaded: new Set(), label: "Move selection", lifted: { rect: s, pixels: lifted, hole } };
      } else {
        gesture.current = { kind: "select", tool: t, button: e.button, tileId: tile?.id ?? "", base: pixels, work: pixels, start: p, last: p, path: [], color: 0, shaded: new Set(), label: "" };
        setSel(null);
      }
      return;
    }

    const color = t === "eraser" ? 0 : e.button === 2 ? secondary : primary;
    if (t !== "shade" && !paletteAllows(color)) return;
    if (!inTile(p) && t === "fill") return;
    const id = ensureTile();
    if (!id) return;
    const base = history.project.tilesets.find((x) => x.id === ts.id)!.tiles[id].pixels;
    const labels: Record<string, string> = { pencil: "Draw", eraser: "Erase", fill: "Fill", line: "Line", rect: "Rectangle", ellipse: "Ellipse", shade: e.button === 2 ? "Darken" : "Lighten" };
    const g: Gesture = { kind: "draw", tool: t, button: e.button, tileId: id, base, work: base.slice(), start: p, last: p, path: [], color, shaded: new Set(), label: labels[t] ?? "Edit" };
    gesture.current = g;
    if (t === "fill") g.work = floodFill(base, tw, th, p.x, p.y, color, fillGlobal);
    else if (t === "line" || t === "rect" || t === "ellipse") shape(g, p, e.shiftKey);
    else drawAlong(g, p);
    push(g);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toPixel(e);
    setHover(inTile(p) ? p : null);
    const g = gesture.current;
    if (!g || (p.x === g.last.x && p.y === g.last.y && g.kind !== "draw")) return;
    if (g.kind === "select") {
      const b = boxFrom(g.start, p);
      const x0 = Math.max(0, b.x0);
      const y0 = Math.max(0, b.y0);
      const x1 = Math.min(tw - 1, b.x1);
      const y1 = Math.min(th - 1, b.y1);
      setSel(x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null);
      g.last = p;
      return;
    }
    if (g.kind === "move" && g.lifted) {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      g.work = g.lifted.hole.slice();
      blitMasked(g.work, tw, th, g.lifted.pixels, g.lifted.rect.w, g.lifted.rect.h, g.lifted.rect.x + dx, g.lifted.rect.y + dy);
      setSel({ ...g.lifted.rect, x: g.lifted.rect.x + dx, y: g.lifted.rect.y + dy });
      g.last = p;
      push(g);
      return;
    }
    if (g.tool === "fill") return;
    if (p.x === g.last.x && p.y === g.last.y) return;
    if (g.tool === "line" || g.tool === "rect" || g.tool === "ellipse") {
      shape(g, p, e.shiftKey);
      g.last = p;
    } else drawAlong(g, p);
    push(g);
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "select") {
      if (g.start.x === g.last.x && g.start.y === g.last.y) setSel(null);
      return;
    }
    history.commit(g.label);
  };

  // Escape cancels an in-progress gesture.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gesture.current) {
        gesture.current = null;
        history.cancel();
      } else if (e.key === "Escape" && selRef.current) setSel(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // ---------- clipboard bridge ----------
  useEffect(() => {
    const region = () => selRef.current ?? { x: 0, y: 0, w: tw, h: th };
    editorBridge.copy = () => {
      if (!tile) return;
      const r = region();
      ui.set({ clip: { w: r.w, h: r.h, pixels: crop(tile.pixels, tw, th, r.x, r.y, r.w, r.h) } });
      setStatus(`Copied ${r.w}×${r.h} px`);
    };
    editorBridge.cut = () => {
      if (!tile || !ts) return;
      const r = region();
      ui.set({ clip: { w: r.w, h: r.h, pixels: crop(tile.pixels, tw, th, r.x, r.y, r.w, r.h) } });
      history.dispatch("Cut", (p) => ops.setTilePixels(p, ts.id, tile.id, clearRect(tile.pixels, tw, th, r)));
    };
    editorBridge.paste = () => {
      const clip = ui.get().clip;
      if (!clip || !ts) return;
      const at = selRef.current ? { x: selRef.current.x, y: selRef.current.y } : { x: 0, y: 0 };
      const id = ensureTile();
      if (!id) return;
      const base = history.project.tilesets.find((x) => x.id === ts.id)!.tiles[id].pixels;
      const work = base.slice();
      blitMasked(work, tw, th, clip.pixels, clip.w, clip.h, at.x, at.y);
      history.preview((p) => ops.setTilePixels(p, ts.id, id, work));
      history.commit("Paste");
      ui.set({ tool: "select" });
      setTimeout(() => setSel({ x: at.x, y: at.y, w: Math.min(clip.w, tw - at.x), h: Math.min(clip.h, th - at.y) }), 0);
    };
    editorBridge.selectAll = () => {
      ui.set({ tool: "select" });
      setTimeout(() => setSel({ x: 0, y: 0, w: tw, h: th }), 0);
    };
    editorBridge.deselect = () => setSel(null);
    editorBridge.deleteSelection = () => {
      const s = selRef.current;
      if (!s || !tile || !ts) return false;
      history.dispatch("Clear selection", (p) => ops.setTilePixels(p, ts.id, tile.id, clearRect(tile.pixels, tw, th, s)));
      return true;
    };
    return () => {
      for (const k of Object.keys(editorBridge) as (keyof typeof editorBridge)[]) delete editorBridge[k];
    };
  });

  if (!ts) {
    return (
      <EmptyState>
        <div>No tileset open.</div>
        <button type="button" className="primary" onClick={() => ui.set({ dialog: { kind: "newTileset" } })}>
          New Tileset
        </button>
      </EmptyState>
    );
  }

  const title = tile ? tile.name : slotTarget ? `new tile in slot ${slotTarget.index + 1} of "${slotTarget.subset.name}"` : "new tile (draw to add it)";
  return (
    <div className="panel editor-panel">
      <div className="panel-toolbar">
        {TOOLS.map((t) => (
          <IconButton key={t.id} title={`${t.label} (${t.key})`} active={tool === t.id} onClick={() => ui.set({ tool: t.id })}>
            {t.icon}
          </IconButton>
        ))}
        <span className="sep-v" />
        {(tool === "pencil" || tool === "eraser") && (
          <label className="check" title="Brush size ([ and ])">
            size <NumberInput label="Brush size" value={brushSize} min={1} max={8} width={44} onChange={(v) => ui.set({ brushSize: Math.max(1, Math.min(8, Math.round(v))) })} />
          </label>
        )}
        {tool === "pencil" && (
          <label className="check" title="Remove doubled corner pixels from freehand strokes">
            <input type="checkbox" checked={pixelPerfect} onChange={(e) => ui.set({ pixelPerfect: e.target.checked })} /> pixel-perfect
          </label>
        )}
        {tool === "fill" && (
          <label className="check" title="Replace every pixel of that colour, not just the touching area">
            <input type="checkbox" checked={fillGlobal} onChange={(e) => ui.set({ fillGlobal: e.target.checked })} /> global
          </label>
        )}
        {(tool === "rect" || tool === "ellipse") && (
          <label className="check" title="Shift locks a square / circle">
            <input type="checkbox" checked={shapeFilled} onChange={(e) => ui.set({ shapeFilled: e.target.checked })} /> filled
          </label>
        )}
        {tool === "shade" && <span className="muted">{history.project.palette.locked ? "along palette" : "by brightness"}</span>}
        <span className="spacer" />
        <label className="check" title="Pixels of neighbouring tiles (from the active preview) shown around the edges">
          context <NumberInput label="Neighbour margin" value={margin} min={0} max={32} width={44} onChange={(v) => ui.set({ neighborMargin: Math.max(0, Math.min(32, Math.round(v))) })} />
        </label>
        <IconButton title="Zoom out (Ctrl+-)" onClick={() => ui.set({ editorZoom: Math.max(2, zoom - 2) })}>
          −
        </IconButton>
        <span className="muted">{zoom}×</span>
        <IconButton title="Zoom in (Ctrl+=)" onClick={() => ui.set({ editorZoom: Math.min(64, zoom + 2) })}>
          ＋
        </IconButton>
      </div>
      <div
        className="canvas-host"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          ui.set({ editorZoom: Math.max(2, Math.min(64, zoom + (e.deltaY < 0 ? 2 : -2))) });
        }}
      >
        <div className="canvas-center">
          <canvas
            ref={canvasRef}
            className="editor-canvas"
            style={{ cursor: tool === "picker" ? "copy" : tool === "select" ? "default" : "crosshair", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>
      <div className="editor-footer">
        <span>{title}</span>
        <span className="spacer" />
        {!cell && pv && tile && <span className="muted">not in "{pv.name}", so no neighbour context</span>}
        {sel && (
          <span>
            sel {sel.w}×{sel.h} @ {sel.x},{sel.y}
          </span>
        )}
        <span>{hover ? `${hover.x}, ${hover.y}` : ""}</span>
        {subsetId && slotIndex !== null && <span className="muted">slot {slotIndex + 1}</span>}
      </div>
    </div>
  );
}
