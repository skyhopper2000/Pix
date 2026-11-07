import { describe, expect, it } from "vitest";
import { pack } from "./color";
import { createPixels, crop, diffFraction, extrude, getPixel, hashPixels, hashRegion, isEmptyRegion, isEmptyTile, pixelsEqual, regionEquals, scaleNearest, setPixel } from "./pixels";

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

  it("region helpers agree with crop + hashPixels / pixelsEqual / isEmptyTile", () => {
    const W = 12, H = 10;
    let s = 3;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) >> 8;
    // Few colours, transparent pixels with random RGB, and some solid/empty blocks.
    const make = (buf: Uint8ClampedArray) => {
      for (let p = 0; p < W * H; p++) {
        const k = rnd() % 4;
        buf[p * 4] = k === 0 ? rnd() & 255 : k * 60;
        buf[p * 4 + 1] = k === 0 ? rnd() & 255 : 10;
        buf[p * 4 + 2] = 7;
        buf[p * 4 + 3] = k === 0 ? 0 : 255;
      }
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) setPixel(buf, W, x, y, BLUE);
      for (let y = 6; y < 9; y++) for (let x = 8; x < 11; x++) buf[(y * W + x) * 4 + 3] = 0;
    };
    const aligned = createPixels(W, H);
    make(aligned);
    // Same pixels at a byte offset that can't use the 32-bit fast path.
    const unaligned = new Uint8ClampedArray(W * H * 4 + 1).subarray(1);
    unaligned.set(aligned);
    for (const src of [aligned, unaligned])
      for (const [w, h] of [[1, 1], [2, 2], [3, 3], [4, 2]])
        for (let y = 0; y + h <= H; y++)
          for (let x = 0; x + w <= W; x++) {
            const c = crop(src, W, H, x, y, w, h);
            expect(hashRegion(src, W, x, y, w, h)).toBe(hashPixels(c));
            expect(isEmptyRegion(src, W, x, y, w, h)).toBe(isEmptyTile(c));
            const other = crop(aligned, W, H, (x + 1) % (W - w + 1), y, w, h);
            expect(regionEquals(src, W, x, y, w, h, other)).toBe(pixelsEqual(c, other));
            expect(regionEquals(src, W, x, y, w, h, c)).toBe(true);
          }
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
