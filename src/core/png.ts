import { Unzlib, zlibSync } from "fflate";

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

/** Largest image decodePng accepts (width × height): 2^27 px, i.e. 512 MB of RGBA. */
export const MAX_IMAGE_PIXELS = 1 << 27;

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Streaming decode: IDAT chunks are inflated as they are read, and each
 * scanline is unfiltered and expanded to RGBA as soon as it is complete. Only
 * two scanlines are held besides the output, so peak memory is about the RGBA
 * result plus the file (the old whole-buffer decoder needed about 3× that).
 */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (!isPng(bytes)) throw new Error("Not a PNG file");
  let o = 8;
  let width = 0, height = 0, depth = 0, ctype = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  let rows: RowDecoder | null = null;
  let inflater: Unzlib | null = null;
  while (o + 8 <= bytes.length) {
    const len = u32(bytes, o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = u32(data, 0);
      height = u32(data, 4);
      depth = data[8];
      ctype = data[9];
      if (!width || !height) throw new Error("PNG has no IHDR");
      if (data[12]) throw new Error("Interlaced PNGs are not supported");
      if (!CHANNELS[ctype]) throw new Error(`Unsupported PNG colour type ${ctype}`);
      if (width * height > MAX_IMAGE_PIXELS) throw new Error(`Image is too large (${width}×${height} px); the limit is ${MAX_IMAGE_PIXELS} pixels`);
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") {
      if (!width) throw new Error("PNG has no IHDR");
      if (!rows) {
        const r = (rows = new RowDecoder(width, height, depth, ctype, palette, trns));
        inflater = new Unzlib((chunk) => r.push(chunk));
      }
      inflater!.push(data, false);
    } else if (type === "IEND") break;
    o += 12 + len;
  }
  if (!width || !height) throw new Error("PNG has no IHDR");
  if (!rows || !inflater) throw new Error("PNG has no image data");
  inflater.push(new Uint8Array(0), true);
  if (rows.y < height) throw new Error("PNG image data is truncated");
  return { width, height, pixels: rows.out };
}

/** Collects inflated bytes into scanlines, unfilters them and writes RGBA rows. */
class RowDecoder {
  readonly out: Uint8ClampedArray;
  /** Next output row. */
  y = 0;
  private readonly stride: number;
  private readonly bpp: number;
  private cur: Uint8Array;
  private prev: Uint8Array;
  /** Bytes of the current scanline received so far; -1 = waiting for its filter byte. */
  private pos = -1;
  private filter = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly depth: number,
    private readonly ctype: number,
    private readonly palette: Uint8Array | null,
    private readonly trns: Uint8Array | null,
  ) {
    if (ctype === 3 && !palette) throw new Error("Palette PNG without PLTE");
    const channels = CHANNELS[ctype];
    this.bpp = Math.max(1, (channels * depth) >> 3); // bytes per pixel for filtering
    this.stride = Math.ceil((width * channels * depth) / 8);
    this.cur = new Uint8Array(this.stride);
    this.prev = new Uint8Array(this.stride); // the row above row 0 is all zeros
    this.out = new Uint8ClampedArray(width * height * 4);
  }

  push(chunk: Uint8Array) {
    const n = chunk.length;
    let i = 0;
    while (i < n && this.y < this.height) {
      if (this.pos < 0) {
        this.filter = chunk[i++];
        this.pos = 0;
        continue;
      }
      const take = Math.min(this.stride - this.pos, n - i);
      this.cur.set(chunk.subarray(i, i + take), this.pos);
      this.pos += take;
      i += take;
      if (this.pos === this.stride) {
        unfilter(this.filter, this.cur, this.prev, this.bpp);
        this.emit(this.cur);
        const t = this.prev;
        this.prev = this.cur;
        this.cur = t;
        this.pos = -1;
        this.y++;
      }
    }
  }

  /** Expands one unfiltered scanline to RGBA row `this.y`. 8-bit RGBA/RGB/palette take fast paths. */
  private emit(line: Uint8Array) {
    const { width: w, depth, ctype, out, trns } = this;
    let d = this.y * w * 4;
    if (depth === 8 && ctype === 6) {
      out.set(line, d);
    } else if (depth === 8 && ctype === 2) {
      const k0 = trns ? trns[1] : -1, k1 = trns ? trns[3] : -1, k2 = trns ? trns[5] : -1;
      for (let s = 0; s < w * 3; s += 3, d += 4) {
        const r = line[s], g = line[s + 1], b = line[s + 2];
        out[d] = r;
        out[d + 1] = g;
        out[d + 2] = b;
        out[d + 3] = trns && r === k0 && g === k1 && b === k2 ? 0 : 255;
      }
    } else if (depth === 8 && ctype === 3) {
      const pal = this.palette!;
      const tl = trns ? trns.length : 0;
      for (let x = 0; x < w; x++, d += 4) {
        const idx = line[x];
        out[d] = pal[idx * 3];
        out[d + 1] = pal[idx * 3 + 1];
        out[d + 2] = pal[idx * 3 + 2];
        out[d + 3] = idx < tl ? trns![idx] : 255;
      }
    } else this.emitGeneric(line, d);
  }

  /** Any depth / colour type: grey, grey+alpha, 16-bit, and packed 1/2/4-bit samples. */
  private emitGeneric(line: Uint8Array, d: number) {
    const { width: w, depth, ctype, out, trns } = this;
    // Sample n of the line as an 8-bit value (16-bit takes the high byte; low depths are scaled for greyscale).
    const sample = (n: number): number => {
      if (depth === 8) return line[n];
      if (depth === 16) return line[n * 2];
      const perByte = 8 / depth;
      const byte = line[Math.floor(n / perByte)];
      const shift = 8 - depth * ((n % perByte) + 1);
      return (byte >> shift) & ((1 << depth) - 1);
    };
    const scaleGrey = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
    // tRNS for greyscale/RGB: a single colour key, stored as 16-bit values.
    const key = (i: number) => (trns ? (depth === 16 ? trns[i * 2] : trns[i * 2 + 1]) : -1);
    for (let x = 0; x < w; x++, d += 4) {
      if (ctype === 6) {
        for (let k = 0; k < 4; k++) out[d + k] = sample(x * 4 + k);
      } else if (ctype === 2) {
        const r = sample(x * 3), g = sample(x * 3 + 1), b = sample(x * 3 + 2);
        out[d] = r;
        out[d + 1] = g;
        out[d + 2] = b;
        out[d + 3] = trns && depth === 8 && r === key(0) && g === key(1) && b === key(2) ? 0 : 255;
      } else if (ctype === 3) {
        const pal = this.palette!;
        const idx = sample(x);
        out[d] = pal[idx * 3];
        out[d + 1] = pal[idx * 3 + 1];
        out[d + 2] = pal[idx * 3 + 2];
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (ctype === 0) {
        const raw8 = sample(x);
        const g = Math.round(raw8 * scaleGrey);
        out[d] = out[d + 1] = out[d + 2] = g;
        out[d + 3] = trns && depth <= 8 && raw8 === (trns[1] ?? -1) ? 0 : 255;
      } else {
        const g = sample(x * 2);
        out[d] = out[d + 1] = out[d + 2] = g;
        out[d + 3] = sample(x * 2 + 1);
      }
    }
  }
}

/** Reverses a scanline filter in place. `prev` is the previous unfiltered line (zeros above row 0). */
function unfilter(f: number, line: Uint8Array, prev: Uint8Array, bpp: number) {
  const n = line.length;
  const lead = Math.min(bpp, n);
  switch (f) {
    case 0:
      return;
    case 1: // Sub
      for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 255;
      return;
    case 2: // Up
      for (let i = 0; i < n; i++) line[i] = (line[i] + prev[i]) & 255;
      return;
    case 3: // Average
      for (let i = 0; i < lead; i++) line[i] = (line[i] + (prev[i] >> 1)) & 255;
      for (let i = bpp; i < n; i++) line[i] = (line[i] + ((line[i - bpp] + prev[i]) >> 1)) & 255;
      return;
    default: // 4 = Paeth. Unknown types are treated as Paeth, as the old decoder did.
      for (let i = 0; i < lead; i++) line[i] = (line[i] + prev[i]) & 255; // paeth(0, b, 0) = b
      for (let i = bpp; i < n; i++) line[i] = (line[i] + paeth(line[i - bpp], prev[i], prev[i - bpp])) & 255;
  }
}
