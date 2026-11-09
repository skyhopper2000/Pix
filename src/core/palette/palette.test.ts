import { describe, expect, it } from "vitest";
import { pack } from "../color";
import { isPaletteImageFile, paletteFromImage, parseGpl, parseHexList, parseLospecJson, parsePaletteFile, writeGpl, writeHex } from ".";

const enc = (s: string) => new TextEncoder().encode(s);
const C = [pack(0, 0, 0), pack(255, 128, 1), pack(18, 52, 86)];

/** RGBA pixels from packed colours. */
const px = (...cs: number[]) => new Uint8ClampedArray(cs.flatMap((c) => [c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]));

describe("palette from image", () => {
  it("takes distinct colours in reading order, skipping transparent pixels", () => {
    const clear = pack(9, 9, 9, 0);
    const img = { pixels: px(C[1], C[1], clear, C[0], C[2], C[1], C[0]) };
    expect(paletteFromImage(img).colors).toEqual([C[1], C[0], C[2]]);
  });

  it("keeps colours exact, including partial alpha", () => {
    const half = pack(10, 20, 30, 128);
    expect(paletteFromImage({ pixels: px(half, pack(10, 20, 30)) }).colors).toEqual([half, pack(10, 20, 30)]);
  });

  it("accepts exactly the limit and refuses one more", () => {
    const cs = Array.from({ length: 5 }, (_, i) => pack(i, 0, 0));
    expect(paletteFromImage({ pixels: px(...cs) }, 5).colors).toHaveLength(5);
    expect(() => paletteFromImage({ pixels: px(...cs, pack(99, 0, 0)) }, 5)).toThrow(/more than 5 colours/);
  });

  it("refuses a fully transparent image", () => {
    expect(() => paletteFromImage({ pixels: px(0, 0) })).toThrow(/no visible colours/);
  });

  it("recognises image files by extension", () => {
    expect(isPaletteImageFile("swatches.PNG")).toBe(true);
    expect(isPaletteImageFile("pal.gif")).toBe(true);
    expect(isPaletteImageFile("pal.gpl")).toBe(false);
    expect(isPaletteImageFile("noext")).toBe(false);
  });
});

describe("palette files", () => {
  it("round-trips .gpl", () => {
    const s = writeGpl("test", C);
    expect(s.startsWith("GIMP Palette\nName: test\n")).toBe(true);
    expect(parseGpl(s)).toEqual({ name: "test", colors: C });
  });

  it("round-trips .hex", () => {
    expect(writeHex(C)).toBe("000000\nff8001\n123456\n");
    expect(parseHexList(writeHex(C)).colors).toEqual(C);
  });

  it("reads JASC .pal", () => {
    const s = "JASC-PAL\r\n0100\r\n2\r\n0 0 0\r\n255 128 1\r\n";
    expect(parsePaletteFile("x.pal", enc(s)).colors).toEqual(C.slice(0, 2));
  });

  it("reads RIFF .pal", () => {
    const n = 2;
    const dataLen = 4 + n * 4;
    const b = new Uint8Array(12 + 8 + dataLen);
    b.set(enc("RIFF"), 0);
    b.set(enc("PAL "), 8);
    b.set(enc("data"), 12);
    b[16] = dataLen;
    b[20] = 0; b[21] = 3; // version
    b[22] = n;
    b.set([255, 128, 1, 0, 18, 52, 86, 0], 24);
    expect(parsePaletteFile("x.pal", b).colors).toEqual(C.slice(1));
  });

  it("reads Lospec JSON", () => {
    const s = JSON.stringify({ name: "Lost", author: "", colors: ["000000", "ff8001"] });
    expect(parseLospecJson(s)).toEqual({ name: "Lost", colors: C.slice(0, 2) });
    expect(parsePaletteFile("lost.json", enc(s)).colors).toHaveLength(2);
  });

  it("rejects junk", () => {
    expect(() => parsePaletteFile("x.hex", enc("zzz"))).toThrow();
    expect(() => parsePaletteFile("x.bmp", enc("zzz"))).toThrow();
  });
});
