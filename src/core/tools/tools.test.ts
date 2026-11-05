import { describe, expect, it } from "vitest";
import { pack } from "../color";
import { createPixels, getPixel, setPixel } from "../pixels";
import { boxFrom, brushPoints, ellipsePoints, floodFill, isLCorner, linePoints, pixelPerfectPath, plot, rectPoints, shadeColor } from ".";

const R = pack(255, 0, 0);
const B = pack(0, 0, 255);
const key = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).sort();

describe("tools", () => {
  it("draws Bresenham lines inclusive of both ends", () => {
    expect(linePoints(0, 0, 3, 0)).toHaveLength(4);
    expect(linePoints(0, 0, 3, 3)).toEqual([0, 1, 2, 3].map((i) => ({ x: i, y: i })));
    expect(linePoints(2, 1, 2, 1)).toEqual([{ x: 2, y: 1 }]);
  });

  it("pixel-perfect removes doubled L-corners only", () => {
    expect(isLCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(isLCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(false);
    // A staircase drawn fast: (0,0)->(1,0)->(1,1)->(2,1)->(2,2) becomes a clean diagonal.
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
    expect(pixelPerfectPath(path)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    // Straight runs are untouched.
    const straight = [0, 1, 2, 3].map((x) => ({ x, y: 0 }));
    expect(pixelPerfectPath(straight)).toEqual(straight);
  });

  it("draws rectangles outline and filled", () => {
    expect(rectPoints(0, 0, 2, 2, false)).toHaveLength(8);
    expect(rectPoints(0, 0, 2, 2, true)).toHaveLength(9);
    expect(boxFrom({ x: 3, y: 3 }, { x: 0, y: 1 }, true)).toEqual({ x0: 0, y0: 0, x1: 3, y1: 3 });
  });

  it("draws ellipses that stay inside their box and are symmetric", () => {
    for (const [w, h] of [[1, 1], [5, 5], [8, 4], [3, 9], [16, 16]]) {
      const pts = ellipsePoints(0, 0, w - 1, h - 1, false);
      expect(pts.every((p) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h)).toBe(true);
      const ks = new Set(key(pts));
      for (const p of pts) expect(ks.has(`${w - 1 - p.x},${p.y}`)).toBe(true);
      // touches all four sides
      expect(pts.some((p) => p.x === 0) && pts.some((p) => p.x === w - 1) && pts.some((p) => p.y === 0) && pts.some((p) => p.y === h - 1)).toBe(true);
    }
    const filled = ellipsePoints(0, 0, 4, 4, true);
    expect(key(filled)).toContain("2,2");
    expect(filled.length).toBeGreaterThan(ellipsePoints(0, 0, 4, 4, false).length);
  });

  it("fills contiguous regions only, or globally", () => {
    const px = createPixels(3, 1);
    setPixel(px, 3, 1, 0, R); // [_, R, _]
    const c = floodFill(px, 3, 1, 0, 0, B, false);
    expect([0, 1, 2].map((x) => getPixel(c, 3, x, 0))).toEqual([B, R, 0]);
    const g = floodFill(px, 3, 1, 0, 0, B, true);
    expect([0, 1, 2].map((x) => getPixel(g, 3, x, 0))).toEqual([B, R, B]);
    expect(floodFill(px, 3, 1, 1, 0, R, false)).toBe(px); // same colour: no-op
  });

  it("plots on a copy and clips", () => {
    const px = createPixels(2, 2);
    const out = plot(px, 2, 2, [{ x: 0, y: 0 }, { x: 5, y: 5 }], R);
    expect(getPixel(out, 2, 0, 0)).toBe(R);
    expect(getPixel(px, 2, 0, 0)).toBe(0);
  });

  it("shades along the palette or by brightness", () => {
    const dark = pack(10, 10, 10);
    const mid = pack(100, 100, 100);
    const light = pack(200, 200, 200);
    const pal = [light, dark, mid];
    expect(shadeColor(mid, 1, pal)).toBe(light);
    expect(shadeColor(mid, -1, pal)).toBe(dark);
    expect(shadeColor(light, 1, pal)).toBe(light);
    expect(shadeColor(R, 1, pal)).toBe(R); // not in palette: untouched
    expect(shadeColor(0, 1, null)).toBe(0); // transparent: untouched
    const l = shadeColor(mid, 1, null);
    const d = shadeColor(mid, -1, null);
    expect(l > mid && d < mid).toBe(true);
    expect(shadeColor(pack(255, 255, 255), 1, null)).toBe(pack(255, 255, 255));
    expect(shadeColor(pack(1, 1, 1), -1, null)).toBe(pack(0, 0, 0));
  });

  it("makes square brushes", () => {
    expect(brushPoints({ x: 5, y: 5 }, 1)).toEqual([{ x: 5, y: 5 }]);
    expect(brushPoints({ x: 5, y: 5 }, 3)).toHaveLength(9);
  });
});
