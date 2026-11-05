import { describe, expect, it } from "vitest";
import { pack } from "./color";
import { createPixels, crop, diffFraction, extrude, getPixel, hashPixels, isEmptyTile, pixelsEqual, scaleNearest, setPixel } from "./pixels";

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

describe("pixels", () => {
  it("treats transparent pixels as equal regardless of RGB", () => {
    const a = createPixels(2, 1);
    const b = createPixels(2, 1);
    b[0] = 99; // rgb garbage at alpha 0
    expect(pixelsEqual(a, b)).toBe(true);
    expect(hashPixels(a)).toBe(hashPixels(b));
    setPixel(b, 2, 1, 0, RED);
    expect(pixelsEqual(a, b)).toBe(false);
    expect(diffFraction(a, b)).toBe(0.5);
  });

  it("detects empty tiles", () => {
    const a = createPixels(2, 2);
    expect(isEmptyTile(a)).toBe(true);
    for (let i = 0; i < 4; i++) setPixel(a, 2, i % 2, i >> 1, BLUE);
    expect(isEmptyTile(a)).toBe(true);
    setPixel(a, 2, 0, 0, RED);
    expect(isEmptyTile(a)).toBe(false);
  });

  it("crops with transparent out-of-bounds", () => {
    const src = createPixels(2, 2);
    setPixel(src, 2, 1, 1, RED);
    const c = crop(src, 2, 2, 1, 1, 2, 2);
    expect(getPixel(c, 2, 0, 0)).toBe(RED);
    expect(getPixel(c, 2, 1, 1)).toBe(0);
  });

  it("scales nearest-neighbour", () => {
    const src = createPixels(2, 1);
    setPixel(src, 2, 0, 0, RED);
    setPixel(src, 2, 1, 0, BLUE);
    const s = scaleNearest(src, 2, 1, 2);
    expect([0, 1, 2, 3].map((x) => getPixel(s, 4, x, 1))).toEqual([RED, RED, BLUE, BLUE]);
  });

  it("extrudes edge pixels outward", () => {
    const src = createPixels(2, 1);
    setPixel(src, 2, 0, 0, RED);
    setPixel(src, 2, 1, 0, BLUE);
    const e = extrude(src, 2, 1, 1); // 4 x 3
    expect([0, 1, 2, 3].map((x) => getPixel(e, 4, x, 0))).toEqual([RED, RED, BLUE, BLUE]);
    expect(getPixel(e, 4, 0, 2)).toBe(RED);
  });
});
