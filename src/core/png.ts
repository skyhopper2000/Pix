import { unzlibSync, zlibSync } from "fflate";

/**
 * Minimal, exact PNG codec. Decoding our own PNGs (and user PNGs) here instead
 * of through a browser canvas avoids colour management and premultiplied-alpha
 * rounding, which would silently change pixels.
 *
 * Encode: 8-bit RGBA, non-interlaced, adaptive per-row filters.
 * Decode: colour types 0/2/3/4/6, bit depths 1/2/4/8/16, non-interlaced.
 */

export interface RgbaImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array, start = 0, end = data.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function putU32(b: Uint8Array, o: number, v: number) {
  b[o] = (v >>> 24) & 255;
  b[o + 1] = (v >>> 16) & 255;
  b[o + 2] = (v >>> 8) & 255;
  b[o + 3] = v & 255;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  putU32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  putU32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function encodePng(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  if (pixels.length !== width * height * 4) throw new Error("encodePng: pixel buffer size mismatch");
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const cand = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    let bestF = 0;
    let bestScore = Infinity;
    let best: Uint8Array | null = null;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = pixels[row + i];
        const a = i >= 4 ? pixels[row + i - 4] : 0;
        const b = prev >= 0 ? pixels[prev + i] : 0;
        const c = prev >= 0 && i >= 4 ? pixels[prev + i - 4] : 0;
        const v = (f === 0 ? x : f === 1 ? x - a : f === 2 ? x - b : f === 3 ? x - ((a + b) >> 1) : x - paeth(a, b, c)) & 255;
        cand[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        bestF = f;
        best = cand.slice();
      }
    }
    const o = y * (stride + 1);
    raw[o] = bestF;
    raw.set(best!, o + 1);
  }
  const ihdr = new Uint8Array(13);
  putU32(ihdr, 0, width);
  putU32(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const parts = [new Uint8Array(SIG), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && SIG.every((v, i) => bytes[i] === v);
}

export function decodePng(bytes: Uint8Array): RgbaImage {
  if (!isPng(bytes)) throw new Error("Not a PNG file");
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
