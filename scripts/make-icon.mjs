// Generates src-tauri/icons/source.png (1024x1024): a 2x2 grid of tiles.
// Run `npx tauri icon src-tauri/icons/source.png` afterwards to derive all icon sizes.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const S = 1024;
const colors = [[0x3c, 0x9a, 0x4a], [0x8a, 0x5a, 0x2c], [0x8a, 0x5a, 0x2c], [0x3c, 0x9a, 0x4a]];
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    const o = y * (S * 4 + 1) + 1 + x * 4;
    const pad = 64, gap = 32, cell = (S - 2 * pad - gap) / 2;
    const cx = x - pad, cy = y - pad;
    const ix = cx < cell ? 0 : cx >= cell + gap ? 1 : -1;
    const iy = cy < cell ? 0 : cy >= cell + gap ? 1 : -1;
    const inside = cx >= 0 && cy >= 0 && cx < 2 * cell + gap && cy < 2 * cell + gap && ix >= 0 && iy >= 0;
    if (!inside) { raw.fill(0, o, o + 4); continue; }
    const c = colors[iy * 2 + ix];
    const px = Math.floor(((cx - ix * (cell + gap)) / cell) * 8), py = Math.floor(((cy - iy * (cell + gap)) / cell) * 8);
    const shade = (px + py) % 2 ? 1 : 0.85;
    raw[o] = c[0] * shade; raw[o + 1] = c[1] * shade; raw[o + 2] = c[2] * shade; raw[o + 3] = 255;
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
mkdirSync("src-tauri/icons", { recursive: true });
writeFileSync("src-tauri/icons/source.png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote src-tauri/icons/source.png");
