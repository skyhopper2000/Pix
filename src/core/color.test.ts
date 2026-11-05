import { describe, expect, it } from "vitest";
import { pack, parseHex, toHex, unpack } from "./color";

describe("color", () => {
  it("packs and unpacks", () => {
    const c = pack(1, 2, 3, 4);
    expect(unpack(c)).toEqual([1, 2, 3, 4]);
    expect(pack(255, 255, 255, 255)).toBe(0xffffffff);
  });
  it("formats and parses hex", () => {
    expect(toHex(pack(255, 0, 16))).toBe("#ff0010");
    expect(toHex(pack(255, 0, 16, 128))).toBe("#ff001080");
    expect(parseHex("#ff0010")).toBe(pack(255, 0, 16));
    expect(parseHex("abc")).toBe(pack(0xaa, 0xbb, 0xcc));
    expect(parseHex("#11223344")).toBe(pack(0x11, 0x22, 0x33, 0x44));
    expect(parseHex("nope")).toBeNull();
  });
});
