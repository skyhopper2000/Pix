import type { Color } from "./model";

export const TRANSPARENT: Color = 0;

export function pack(r: number, g: number, b: number, a = 255): Color {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

export function unpack(c: Color): [number, number, number, number] {
  return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
}

export const alphaOf = (c: Color): number => c & 255;

const h2 = (n: number) => n.toString(16).padStart(2, "0");

/** "#rrggbb" when opaque, otherwise "#rrggbbaa". */
export function toHex(c: Color): string {
  const [r, g, b, a] = unpack(c);
  return "#" + h2(r) + h2(g) + h2(b) + (a === 255 ? "" : h2(a));
}

/** "#rrggbb" ignoring alpha. */
export function toHex6(c: Color): string {
  const [r, g, b] = unpack(c);
  return "#" + h2(r) + h2(g) + h2(b);
}

/** Parses "#rgb", "#rrggbb", "#rrggbbaa" (leading # optional). Returns null if invalid. */
export function parseHex(s: string): Color | null {
  let h = s.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/i.test(h)) h += "ff";
  if (!/^[0-9a-f]{8}$/i.test(h)) return null;
  return parseInt(h, 16) >>> 0;
}

/** Perceived brightness 0..255 (Rec. 601 luma). Used only to order palette colors for lighten/darken. */
export function luma(c: Color): number {
  const [r, g, b] = unpack(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
