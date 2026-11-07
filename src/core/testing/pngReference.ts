import { unzlibSync } from "fflate";
import type { RgbaImage } from "../png";

/**
 * TEST ORACLE ONLY. The original whole-buffer PNG decoder from step 3, kept
 * verbatim so tests can check the streaming decoder in png.ts is byte-for-byte
 * identical. Not used by the app.
 */

function u32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function decodePngReference(bytes: Uint8Array): RgbaImage {
  let o = 8;
  let width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (o + 8 <= bytes.length) {
    const len = u32(bytes, o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = u32(data, 0);
      height = u32(data, 4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (!width || !height) throw new Error("PNG has no IHDR");
  if (interlace) throw new Error("Interlaced PNGs are not supported");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error(`Unsupported PNG colour type ${ctype}`);
  const total = idat.reduce((n, d) => n + d.length, 0);
  const z = new Uint8Array(total);
  let zo = 0;
  for (const d of idat) {
    z.set(d, zo);
    zo += d.length;
  }
  const raw = unzlibSync(z);
  const bpp = Math.max(1, (channels * depth) >> 3); // bytes per pixel for filtering
  const stride = Math.ceil((width * channels * depth) / 8);
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? data[dst + i - bpp] : 0;
      const b = y > 0 ? data[dst - stride + i] : 0;
      const c = y > 0 && i >= bpp ? data[dst - stride + i - bpp] : 0;
      data[dst + i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b : f === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 255;
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  // Read sample n of row y as an 8-bit value (16-bit takes the high byte; low depths are scaled for greyscale).
  const sample = (y: number, n: number): number => {
    const row = y * stride;
    if (depth === 8) return data[row + n];
    if (depth === 16) return data[row + n * 2];
    const perByte = 8 / depth;
    const byte = data[row + Math.floor(n / perByte)];
    const shift = 8 - depth * ((n % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scaleGrey = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  // tRNS for greyscale/RGB: a single colour key, stored as 16-bit values.
  const key = (i: number) => (trns ? (depth === 16 ? trns[i * 2] : trns[i * 2 + 1]) : -1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      if (ctype === 6) {
        for (let k = 0; k < 4; k++) out[d + k] = sample(y, x * 4 + k);
      } else if (ctype === 2) {
        const r = sample(y, x * 3), g = sample(y, x * 3 + 1), b = sample(y, x * 3 + 2);
        out[d] = r;
        out[d + 1] = g;
        out[d + 2] = b;
        out[d + 3] = trns && depth === 8 && r === key(0) && g === key(1) && b === key(2) ? 0 : 255;
      } else if (ctype === 3) {
        const idx = sample(y, x);
        if (!palette) throw new Error("Palette PNG without PLTE");
        out[d] = palette[idx * 3];
        out[d + 1] = palette[idx * 3 + 1];
        out[d + 2] = palette[idx * 3 + 2];
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (ctype === 0) {
        const raw8 = sample(y, x);
        const g = Math.round(raw8 * scaleGrey);
        out[d] = out[d + 1] = out[d + 2] = g;
        out[d + 3] = trns && depth <= 8 && raw8 === (trns[1] ?? -1) ? 0 : 255;
      } else {
        const g = sample(y, x * 2);
        out[d] = out[d + 1] = out[d + 2] = g;
        out[d + 3] = sample(y, x * 2 + 1);
      }
    }
  }
  return { width, height, pixels: out };
}
