import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng, isPng } from "./png";

function randomPixels(w: number, h: number, seed = 1) {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let i = 0; i < px.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    px[i] = s & 255;
  }
  return px;
}

// Builds a PNG by hand to test decoding of formats we don't encode ourselves.
function rawPng(w: number, h: number, depth: number, ctype: number, rows: number[][], extra: [string, number[]][] = []) {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: number[]) => {
    let c = 0xffffffff;
    for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const chunk = (t: string, d: number[]) => {
    const td = [...t].map((ch) => ch.charCodeAt(0)).concat(d);
    return [...be(d.length), ...td, ...be(crc(td))];
  };
  const raw = rows.flatMap((r) => [0, ...r]);
  const ihdr = [...be(w), ...be(h), depth, ctype, 0, 0, 0];
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk("IHDR", ihdr),
    ...extra.flatMap(([t, d]) => chunk(t, d)),
    ...chunk("IDAT", Array.from(zlibSync(new Uint8Array(raw)))),
    ...chunk("IEND", []),
  ]);
}

describe("png", () => {
  it("round-trips RGBA exactly", () => {
    for (const [w, h] of [[1, 1], [16, 16], [37, 5]]) {
      const px = randomPixels(w, h, w * h);
      const bytes = encodePng(px, w, h);
      expect(isPng(bytes)).toBe(true);
      const img = decodePng(bytes);
      expect(img.width).toBe(w);
      expect(img.height).toBe(h);
      expect(Array.from(img.pixels)).toEqual(Array.from(px));
    }
  });

  it("decodes palette PNGs with tRNS", () => {
    // 2x1, 1-bit palette: index 0 = red (transparent), index 1 = blue.
    const bytes = rawPng(2, 1, 1, 3, [[0b01000000]], [["PLTE", [255, 0, 0, 0, 0, 255]], ["tRNS", [0]]]);
    expect(Array.from(decodePng(bytes).pixels)).toEqual([255, 0, 0, 0, 0, 0, 255, 255]);
  });

  it("decodes RGB and grey PNGs", () => {
    expect(Array.from(decodePng(rawPng(1, 1, 8, 2, [[1, 2, 3]])).pixels)).toEqual([1, 2, 3, 255]);
    expect(Array.from(decodePng(rawPng(1, 1, 8, 0, [[77]])).pixels)).toEqual([77, 77, 77, 255]);
    expect(Array.from(decodePng(rawPng(1, 1, 8, 4, [[77, 9]])).pixels)).toEqual([77, 77, 77, 9]);
  });

  it("rejects non-PNG data", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
