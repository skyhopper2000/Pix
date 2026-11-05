import { describe, expect, it } from "vitest";
import { pack } from "../color";
import { parseGpl, parseHexList, parseLospecJson, parsePaletteFile, writeGpl, writeHex } from ".";

const enc = (s: string) => new TextEncoder().encode(s);
const C = [pack(0, 0, 0), pack(255, 128, 1), pack(18, 52, 86)];

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
