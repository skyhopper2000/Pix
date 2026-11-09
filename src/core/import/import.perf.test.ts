import { describe, expect, it } from "vitest";
import * as ops from "../ops";
import { blit, createPixels } from "../pixels";
import { decodePng, encodePng, type RgbaImage } from "../png";
import { applyImport, defaultImportSettings, sliceImage } from ".";

/**
 * Large-image import timings: a 4096×4096 RGBA sheet of 16 px tiles
 * (65,536 cells), about a quarter of them unique. Opt-in, because it is slow:
 *
 *   PERF=1 npx vitest run import.perf
 */
const SIZE = 4096;
const T = 16;

function makeSheet(): RgbaImage {
  const cols = SIZE / T;
  const pixels = createPixels(SIZE, SIZE);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  const pool: Uint8ClampedArray[] = [];
  for (let i = 0; i < cols * cols; i++) {
    let tile: Uint8ClampedArray;
    if (i % 4 === 0 || pool.length === 0) {
      tile = createPixels(T, T);
      // Pixel-art-like: four colours per tile, so the PNG compresses like a real rip.
      const colours = [rnd(), rnd(), rnd(), rnd()];
      for (let p = 0; p < T * T; p++) {
        const c = colours[rnd() & 3];
        tile[p * 4] = c & 255;
        tile[p * 4 + 1] = (c >> 8) & 255;
        tile[p * 4 + 2] = (c >> 16) & 255;
        tile[p * 4 + 3] = 255;
      }
      pool.push(tile);
    } else tile = pool[rnd() % pool.length];
    blit(pixels, SIZE, SIZE, tile, T, T, (i % cols) * T, Math.floor(i / cols) * T);
  }
  return { width: SIZE, height: SIZE, pixels };
}

/** Median wall time of `runs` calls, in ms. */
function time(fn: () => unknown, runs = 3): number {
  fn(); // warm-up
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[runs >> 1];
}

describe.skipIf(!process.env.PERF)("import performance", () => {
  it(`${SIZE}×${SIZE}, ${T}px tiles`, () => {
    const img = makeSheet();
    const png = encodePng(img.pixels, img.width, img.height);
    const ts = ops.createTileset("bench", T, T);
    const project = ops.addTileset(ops.createProject(), ts);
    const s = defaultImportSettings(ts);
    const sliced = sliceImage(img, ts, s, "bench");
    expect(sliced.stats.cells).toBe((SIZE / T) ** 2);

    const rows = {
      decodePng: time(() => decodePng(png)),
      sliceImage: time(() => sliceImage(img, ts, s, "bench")),
      "sliceImage + extractPalette": time(() => sliceImage(img, ts, { ...s, extractPalette: true }, "bench")),
      applyImport: time(() => applyImport(project, ts.id, sliced, s), 1),
    };
    console.log(`PNG ${(png.length / 1e6).toFixed(1)} MB, ${sliced.stats.cells} cells, ${sliced.stats.newTiles} unique`);
    for (const [k, v] of Object.entries(rows)) console.log(`${k.padEnd(30)} ${v.toFixed(0).padStart(7)} ms`);
  }, 600_000);
});
