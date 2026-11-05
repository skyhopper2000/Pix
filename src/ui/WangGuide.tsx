import { useEffect, useRef } from "react";
import type { Terrain } from "../core/model";
import { fitCanvas } from "./render";

/**
 * The faint "expected shape" diagram for a template slot: a 3×3 split where
 * corners/edges take terrain A or B colours. It is an overlay only and is
 * never drawn into tile pixels.
 */

// Wang index -> 3×3 cell (col, row): top, TR, right, BR, bottom, BL, left, TL.
const CELL: [number, number][] = [
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
  [0, 0],
];

/** Values per 3×3 region (row-major), inferring unused regions from their neighbours. 0 = undecided. */
export function guideRegions(wangId: number[]): number[] {
  const v = wangId.slice();
  // Unused edge between two equal corners takes their value; unused corner between two equal edges likewise.
  for (let i = 0; i < 8; i++) {
    if (v[i] !== 0) continue;
    const a = wangId[(i + 7) % 8];
    const b = wangId[(i + 1) % 8];
    if (a && a === b) v[i] = a;
  }
  const grid = new Array(9).fill(0);
  CELL.forEach(([c, r], i) => (grid[r * 3 + c] = v[i]));
  const used = wangId.filter(Boolean);
  grid[4] = used.length && used.every((x) => x === used[0]) ? used[0] : 0;
  return grid;
}

export function drawGuide(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wangId: number[], terrains: [Terrain, Terrain], alpha: number) {
  const g = guideRegions(wangId);
  ctx.save();
  ctx.globalAlpha = alpha;
  const cw = w / 3;
  const ch = h / 3;
  g.forEach((val, i) => {
    if (!val) return;
    ctx.fillStyle = terrains[val - 1].color;
    const c = i % 3;
    const r = Math.floor(i / 3);
    ctx.fillRect(x + Math.floor(c * cw), y + Math.floor(r * ch), Math.ceil(cw), Math.ceil(ch));
  });
  ctx.restore();
}

export function WangGuide({ wangId, terrains, size, alpha = 0.35 }: { wangId: number[]; terrains: [Terrain, Terrain]; size: number; alpha?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = fitCanvas(c, size, size);
    ctx.clearRect(0, 0, size, size);
    drawGuide(ctx, 0, 0, size, size, wangId, terrains, alpha);
  }, [wangId, terrains, size, alpha]);
  return <canvas ref={ref} className="wang-guide" aria-hidden />;
}
