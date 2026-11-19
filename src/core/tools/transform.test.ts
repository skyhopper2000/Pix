import { describe, expect, it } from "vitest";
import { pack } from "../color";
import { createPixels, getPixel, setPixel } from "../pixels";
import { flipH, flipV, rotateCCW, rotateCW, transformedRect, transformRegion } from "./transform";

/** A w×h buffer whose pixel (x,y) is a unique opaque colour, so every move is traceable. */
function numbered(w: number, h: number) {
  const b = createPixels(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(b, w, x, y, pack(x + 1, y + 1, 7));
  return b;
}
const at = (b: Uint8ClampedArray, w: number, x: number, y: number) => getPixel(b, w, x, y);
const sortedPixels = (b: Uint8ClampedArray) => {
  const out: number[] = [];
  for (let i = 0; i < b.length; i += 4) out.push(((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0);
  return out.sort((a, c) => a - c);
};

describe("flip / rotate", () => {
  const w = 3;
  const h = 2;
  const src = numbered(w, h);

  it("flips horizontally and vertically", () => {
    const fh = flipH(src, w, h);
    expect(at(fh, w, 0, 0)).toBe(at(src, w, 2, 0));
    expect(at(fh, w, 2, 1)).toBe(at(src, w, 0, 1));
    const fv = flipV(src, w, h);
    expect(at(fv, w, 1, 0)).toBe(at(src, w, 1, 1));
    expect(flipH(fh, w, h)).toEqual(src);
    expect(flipV(fv, w, h)).toEqual(src);
  });

  it("rotates a quarter turn either way and swaps the size", () => {
    const cw = rotateCW(src, w, h); // now 2×3
    // Top-left of a CW turn is the old bottom-left.
    expect(at(cw, h, 0, 0)).toBe(at(src, w, 0, 1));
    expect(at(cw, h, 1, 0)).toBe(at(src, w, 0, 0));
    expect(at(cw, h, 1, 2)).toBe(at(src, w, 2, 0));
    const ccw = rotateCCW(src, w, h);
    // Top-left of a CCW turn is the old top-right.
    expect(at(ccw, h, 0, 0)).toBe(at(src, w, 2, 0));
    expect(rotateCCW(cw, h, w)).toEqual(src);
    expect(rotateCW(rotateCW(rotateCW(rotateCW(src, w, h), h, w), w, h), h, w)).toEqual(src);
  });

  it("never invents a colour: output is a permutation of the input bytes", () => {
    const t = numbered(4, 4);
    t[3] = 0; // a transparent pixel with leftover RGB stays byte-for-byte
    for (const f of [flipH, flipV, rotateCW, rotateCCW]) expect(sortedPixels(f(t, 4, 4))).toEqual(sortedPixels(t));
  });
});

describe("transformRegion", () => {
  it("transforms the whole tile when the rect covers it", () => {
    const t = numbered(4, 4);
    const r = transformRegion(t, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, "rotateCW")!;
    expect(r.rect).toEqual({ x: 0, y: 0, w: 4, h: 4 });
    expect(r.pixels).toEqual(rotateCW(t, 4, 4));
    expect(t).toEqual(numbered(4, 4)); // input untouched
  });

  it("flips only inside the selection", () => {
    const t = numbered(4, 4);
    const r = transformRegion(t, 4, 4, { x: 1, y: 1, w: 2, h: 1 }, "flipH")!;
    expect(at(r.pixels, 4, 1, 1)).toBe(at(t, 4, 2, 1));
    expect(at(r.pixels, 4, 2, 1)).toBe(at(t, 4, 1, 1));
    expect(at(r.pixels, 4, 0, 1)).toBe(at(t, 4, 0, 1));
    expect(at(r.pixels, 4, 1, 0)).toBe(at(t, 4, 1, 0));
  });

  it("rotates a non-square selection about its centre, like a lift-and-drop", () => {
    const t = createPixels(5, 5);
    const R = pack(255, 0, 0);
    for (let x = 1; x <= 3; x++) setPixel(t, 5, x, 2, R); // a 3×1 bar in the middle
    const r = transformRegion(t, 5, 5, { x: 1, y: 2, w: 3, h: 1 }, "rotateCW")!;
    expect(r.rect).toEqual({ x: 2, y: 1, w: 1, h: 3 });
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) expect(at(r.pixels, 5, x, y)).toBe(x === 2 && y >= 1 && y <= 3 ? R : 0);
  });

  it("keeps a rotated rect inside the tile and refuses one that can't fit", () => {
    expect(transformedRect({ x: 0, y: 0, w: 4, h: 1 }, 4, 4, "rotateCW")).toEqual({ x: 1, y: 0, w: 1, h: 4 });
    expect(transformedRect({ x: 0, y: 3, w: 4, h: 1 }, 4, 4, "rotateCCW")).toEqual({ x: 1, y: 0, w: 1, h: 4 });
    expect(transformedRect({ x: 0, y: 0, w: 8, h: 4 }, 8, 4, "rotateCW")).toBeNull(); // non-square tile
  });

  it("CW then CCW lands back on the same rect", () => {
    const a = { x: 2, y: 3, w: 5, h: 2 };
    const b = transformedRect(a, 16, 16, "rotateCW")!;
    expect(transformedRect(b, 16, 16, "rotateCCW")).toEqual(a);
    let c = a;
    for (let i = 0; i < 4; i++) c = transformedRect(c, 16, 16, "rotateCW")!;
    expect(c).toEqual(a);
  });
});
