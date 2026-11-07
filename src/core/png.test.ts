import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng, isPng } from "./png";
import { decodePngReference } from "./testing/pngReference";

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

  // Every legal colour type / bit depth pair, with random filter bytes per row
  // and the zlib stream split across several IDAT chunks.
  const FORMATS: [ctype: number, depths: number[]][] = [
    [0, [1, 2, 4, 8, 16]],
    [2, [8, 16]],
    [3, [1, 2, 4, 8]],
    [4, [8, 16]],
    [6, [8, 16]],
  ];
  const CH: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

  function randomPng(w: number, h: number, depth: number, ctype: number, seed: number, idatParts: number, withTrns: boolean) {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) & 255;
    const stride = Math.ceil((w * CH[ctype] * depth) / 8);
    const raw: number[] = [];
    for (let y = 0; y < h; y++) {
      raw.push(rnd() % 5);
      for (let i = 0; i < stride; i++) raw.push(rnd());
    }
    const z = Array.from(zlibSync(new Uint8Array(raw)));
    const extra: [string, number[]][] = [];
    if (ctype === 3) extra.push(["PLTE", Array.from({ length: 768 }, rnd)]);
    if (withTrns) {
      if (ctype === 3) extra.push(["tRNS", Array.from({ length: 1 + (rnd() % 200) }, rnd)]);
      // Colour keys taken from the first pixel so some pixels actually match.
      if (ctype === 0) extra.push(["tRNS", [0, raw[1] >> (8 - Math.min(8, depth))]]);
      if (ctype === 2) extra.push(["tRNS", [0, rnd(), 0, rnd(), 0, rnd()]]);
    }
    const size = Math.ceil(z.length / idatParts);
    for (let i = 0; i < z.length; i += size) extra.push(["IDAT", z.slice(i, i + size)]);
    return rawPngChunks(w, h, depth, ctype, extra);
  }

  it("streaming decoder matches the reference decoder byte for byte", () => {
    let seed = 1;
    for (const [ctype, depths] of FORMATS)
      for (const depth of depths)
        for (const [w, h] of [[1, 1], [3, 2], [17, 9], [64, 33]])
          for (const parts of [1, 3, 7])
            for (const trns of [false, true]) {
              const bytes = randomPng(w, h, depth, ctype, seed++, parts, trns);
              const want = decodePngReference(bytes);
              const got = decodePng(bytes);
              expect([got.width, got.height]).toEqual([want.width, want.height]);
              expect(Buffer.from(got.pixels).equals(Buffer.from(want.pixels)), `ctype ${ctype} depth ${depth} ${w}x${h} parts ${parts} trns ${trns}`).toBe(true);
            }
  });

  it("matches the reference decoder on our own encoder's output", () => {
    const px = randomPixels(300, 200, 5);
    const bytes = encodePng(px, 300, 200);
    expect(Buffer.from(decodePng(bytes).pixels).equals(Buffer.from(decodePngReference(bytes).pixels))).toBe(true);
  });

  it("rejects truncated image data and oversized images", () => {
    const short = rawPngChunks(4, 4, 8, 6, [["IDAT", Array.from(zlibSync(new Uint8Array([0, 1, 2, 3])))]]);
    expect(() => decodePng(short)).toThrow(/truncated/);
    const huge = rawPngChunks(1 << 15, 1 << 15, 8, 6, [["IDAT", Array.from(zlibSync(new Uint8Array(0)))]]);
    expect(() => decodePng(huge)).toThrow(/too large/);
  });
});

/** Like rawPng, but the caller supplies every chunk after IHDR (IDATs included). */
function rawPngChunks(w: number, h: number, depth: number, ctype: number, chunks: [string, number[]][]) {
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
  const ihdr = [...be(w), ...be(h), depth, ctype, 0, 0, 0];
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunks.flatMap(([t, d]) => chunk(t, d)), ...chunk("IEND", [])]);
}
