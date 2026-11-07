import { pack, parseHex, toHex6, unpack } from "../color";
import type { Color } from "../model";
import { distinctColors } from "../pixels";

/**
 * Palette file formats.
 * Read: GIMP .gpl, .hex (one rrggbb per line), .pal (JASC text or RIFF binary), Lospec JSON.
 * Write: .gpl, .hex.
 */

export interface ParsedPalette {
  name?: string;
  colors: Color[];
}

const text = (b: Uint8Array) => new TextDecoder().decode(b).replace(/^﻿/, "");
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim());

export function parseGpl(s: string): ParsedPalette {
  const ls = lines(s);
  if (!ls[0]?.startsWith("GIMP Palette")) throw new Error("Not a GIMP palette (.gpl)");
  let name: string | undefined;
  const colors: Color[] = [];
  for (const l of ls.slice(1)) {
    if (!l || l.startsWith("#")) continue;
    const m = /^Name:\s*(.*)$/i.exec(l);
    if (m) {
      name = m[1];
      continue;
    }
    if (/^Columns:/i.test(l)) continue;
    const parts = l.split(/\s+/);
    const [r, g, b] = parts.slice(0, 3).map(Number);
    if ([r, g, b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) colors.push(pack(r, g, b));
  }
  return { name, colors };
}

export function parseHexList(s: string): ParsedPalette {
  const colors: Color[] = [];
  for (const l of lines(s)) {
    if (!l || l.startsWith(";") || l.startsWith("//")) continue;
    const c = parseHex(l);
    if (c === null) throw new Error(`Invalid colour "${l}" in .hex palette`);
    colors.push(c);
  }
  return { colors };
}

function parseJascPal(s: string): ParsedPalette {
  const ls = lines(s).filter(Boolean);
  if (ls[0] !== "JASC-PAL") throw new Error("Not a JASC palette");
  const count = Number(ls[2]);
  const colors: Color[] = [];
  for (const l of ls.slice(3, 3 + count)) {
    const [r, g, b, a] = l.split(/\s+/).map(Number);
    colors.push(pack(r, g, b, Number.isFinite(a) ? a : 255));
  }
  return { colors };
}

function parseRiffPal(b: Uint8Array): ParsedPalette {
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "PAL ") throw new Error("Not a RIFF palette");
  let o = 12;
  while (o + 8 <= b.length) {
    const len = b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24);
    if (tag(o) === "data") {
      const n = b[o + 10] | (b[o + 11] << 8);
      const colors: Color[] = [];
      for (let i = 0; i < n; i++) {
        const p = o + 12 + i * 4;
        colors.push(pack(b[p], b[p + 1], b[p + 2]));
      }
      return { colors };
    }
    o += 8 + len + (len & 1);
  }
  throw new Error("RIFF palette has no data chunk");
}

/** Lospec palette JSON (from lospec.com/palette-list/<slug>.json): { name, colors: ["rrggbb", ...] }. */
export function parseLospecJson(s: string): ParsedPalette {
  const j = JSON.parse(s) as { name?: unknown; colors?: unknown };
  if (!Array.isArray(j.colors)) throw new Error("Not a Lospec palette (missing colors)");
  const colors = j.colors.map((c) => {
    const v = typeof c === "string" ? parseHex(c) : null;
    if (v === null) throw new Error(`Invalid colour ${JSON.stringify(c)} in Lospec palette`);
    return v;
  });
  return { name: typeof j.name === "string" ? j.name : undefined, colors };
}

/** Most colours "Import Palette" takes from an image. More than this is almost certainly not a palette. */
export const PALETTE_IMAGE_LIMIT = 256;

/** Palette file extensions parsePaletteFile reads. */
export const PALETTE_FILE_EXTENSIONS = ["gpl", "hex", "pal", "json", "txt"];

/** Extensions the palette importer treats as images rather than palette files. */
export const PALETTE_IMAGE_EXTENSIONS = ["png", "gif", "bmp", "jpg", "jpeg", "webp"];

export const isPaletteImageFile = (fileName: string): boolean =>
  PALETTE_IMAGE_EXTENSIONS.includes(fileName.toLowerCase().split(".").pop() ?? "");

/**
 * Reads an image's distinct colours as a palette, in reading order (left→right, top→bottom),
 * so a swatch strip keeps its order. Fully transparent pixels are skipped. Colours are taken
 * exactly as stored: nothing is averaged, quantized or merged. Throws if the image has more
 * than `limit` colours rather than picking an arbitrary subset.
 */
export function paletteFromImage(img: { pixels: Uint8ClampedArray }, limit = PALETTE_IMAGE_LIMIT): ParsedPalette {
  const colors = distinctColors(img.pixels, limit + 1);
  if (colors.length > limit)
    throw new Error(`The image has more than ${limit} colours, so it doesn't look like a palette. Use an image with ${limit} colours or fewer (e.g. a swatch strip).`);
  if (colors.length === 0) throw new Error("The image has no visible colours (every pixel is transparent).");
  return { colors };
}

/** Parses a palette file, choosing the format by extension and content. */
export function parsePaletteFile(fileName: string, bytes: Uint8Array): ParsedPalette {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pal") {
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return parseRiffPal(bytes);
    return parseJascPal(text(bytes));
  }
  const s = text(bytes);
  if (ext === "gpl" || s.startsWith("GIMP Palette")) return parseGpl(s);
  if (ext === "json" || s.trimStart().startsWith("{")) return parseLospecJson(s);
  if (ext === "hex" || ext === "txt") return parseHexList(s);
  throw new Error(`Unsupported palette format ".${ext}"`);
}

export function writeGpl(name: string, colors: Color[]): string {
  const out = ["GIMP Palette", `Name: ${name}`, "Columns: 8", "#"];
  for (const c of colors) {
    const [r, g, b] = unpack(c);
    out.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${toHex6(c).slice(1)}`);
  }
  return out.join("\n") + "\n";
}

/** One rrggbb per line (alpha is dropped, as the format has none). */
export function writeHex(colors: Color[]): string {
  return colors.map((c) => toHex6(c).slice(1)).join("\n") + (colors.length ? "\n" : "");
}
