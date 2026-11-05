import { describe, expect, it } from "vitest";
import { pack } from "../color";
import type { Project, Tileset } from "../model";
import * as ops from "../ops";
import { blit, createPixels, getPixel, setPixel } from "../pixels";
import type { RgbaImage } from "../png";
import { applyImport, defaultImportSettings, findNearDuplicates, gridDims, previewNameFromFile, sliceImage, validateImport } from ".";

const R = pack(255, 0, 0);
const G = pack(0, 255, 0);
const B = pack(0, 0, 255);

/** A 2x2-pixel tile filled with `c`, with an optional marker pixel. */
function tile(c: number, mark?: number) {
  const px = createPixels(2, 2);
  for (let i = 0; i < 4; i++) setPixel(px, 2, i % 2, i >> 1, c);
  if (mark !== undefined) setPixel(px, 2, 0, 0, mark);
  return px;
}

/** Lays tiles out on a grid with offset/spacing. `null` = transparent cell. */
function sheet(grid: (Uint8ClampedArray | null)[][], off = 0, gap = 0): RgbaImage {
  const rows = grid.length;
  const cols = grid[0].length;
  const width = off + cols * 2 + (cols - 1) * gap;
  const height = off + rows * 2 + (rows - 1) * gap;
  const pixels = createPixels(width, height);
  grid.forEach((row, r) => row.forEach((t, c) => t && blit(pixels, width, height, t, 2, 2, off + c * (2 + gap), off + r * (2 + gap))));
  return { width, height, pixels };
}

function fresh(): { p: Project; ts: Tileset } {
  const ts = ops.createTileset("map example", 2, 2);
  return { p: ops.addTileset(ops.createProject(), ts), ts };
}

describe("import", () => {
  it("computes grid dims with offset and spacing", () => {
    const s = { tileWidth: 16, tileHeight: 16, offsetX: 1, offsetY: 1, spacingX: 1, spacingY: 1 };
    expect(gridDims(1 + 16 * 3 + 2, 1 + 16 * 2 + 1, s)).toEqual({ cols: 3, rows: 2 });
    expect(gridDims(10, 10, s)).toEqual({ cols: 0, rows: 0 });
  });

  it("isolates exact duplicates and names by first appearance", () => {
    const { p, ts } = fresh();
    const img = sheet([
      [tile(R), tile(G)],
      [tile(G), tile(R)],
    ]);
    const res = sliceImage(img, ts, defaultImportSettings(ts), "rip");
    expect(res.newTiles.map((t) => t.name)).toEqual(["tile0_0", "tile0_1"]);
    expect(res.preview.cols).toBe(2);
    const [a, b] = res.newTiles.map((t) => t.id);
    expect(res.preview.cells).toEqual([a, b, b, a]);
    const p2 = applyImport(p, ts.id, res, defaultImportSettings(ts));
    const ts2 = ops.findTileset(p2, ts.id)!;
    expect(ts2.tileOrder).toEqual([a, b]);
    expect(ts2.previews).toHaveLength(1);
  });

  it("keeps every cell when isolate is off", () => {
    const { ts } = fresh();
    const res = sliceImage(sheet([[tile(R), tile(R)]]), ts, { ...defaultImportSettings(ts), isolateUnique: false }, "rip");
    expect(res.newTiles).toHaveLength(2);
  });

  it("never merges flipped tiles", () => {
    const { ts } = fresh();
    const a = createPixels(2, 2);
    setPixel(a, 2, 0, 0, R);
    const flipped = createPixels(2, 2);
    setPixel(flipped, 2, 1, 0, R);
    const res = sliceImage(sheet([[a, flipped]]), ts, defaultImportSettings(ts), "rip");
    expect(res.newTiles).toHaveLength(2);
  });

  it("can skip empty tiles", () => {
    const { ts } = fresh();
    const img = sheet([[tile(R), null, tile(B, R)]]);
    const res = sliceImage(img, ts, { ...defaultImportSettings(ts), includeEmpty: false }, "rip");
    expect(res.newTiles.map((t) => t.name)).toEqual(["tile0_2"]);
    expect(res.preview.cells[0]).toBeNull();
    expect(res.stats.skippedEmpty).toBe(2);
  });

  it("respects offset and spacing", () => {
    const { ts } = fresh();
    const img = sheet([[tile(R, B), tile(G, B)]], 1, 1);
    const res = sliceImage(img, ts, { ...defaultImportSettings(ts), offsetX: 1, offsetY: 1, spacingX: 1, spacingY: 1 }, "rip");
    expect(res.newTiles).toHaveLength(2);
    expect(getPixel(res.newTiles[1].pixels, 2, 1, 1)).toBe(G);
  });

  it("re-import deduplicates against existing tiles and adds another preview", () => {
    const { p, ts } = fresh();
    const s = defaultImportSettings(ts);
    const first = sliceImage(sheet([[tile(R), tile(G)]]), ts, s, "one");
    const p2 = applyImport(p, ts.id, first, s);
    const ts2 = ops.findTileset(p2, ts.id)!;
    const second = sliceImage(sheet([[tile(G), tile(B)]]), ts2, s, "two");
    expect(second.newTiles).toHaveLength(1);
    expect(second.stats.reused).toBe(1);
    expect(second.preview.cells[0]).toBe(first.newTiles[1].id);
    const ts3 = ops.findTileset(applyImport(p2, ts.id, second, s), ts.id)!;
    expect(ts3.tileOrder).toHaveLength(3);
    expect(ts3.previews.map((v) => v.name)).toEqual(["one", "two"]);
  });

  it("extracts palette colours without changing pixels", () => {
    const { p, ts } = fresh();
    const img = sheet([[tile(R, G)]]);
    const before = Array.from(img.pixels);
    const s = { ...defaultImportSettings(ts), extractPalette: true };
    const res = sliceImage(img, ts, s, "rip");
    expect(res.colors).toEqual([G, R]);
    expect(Array.from(img.pixels)).toEqual(before);
    expect(applyImport(p, ts.id, res, s).palette.colors).toEqual([G, R]);
  });

  it("validates settings", () => {
    const { ts } = fresh();
    const img = sheet([[tile(R)]]);
    expect(validateImport(img, ts, defaultImportSettings(ts))).toEqual([]);
    expect(validateImport(img, ts, { ...defaultImportSettings(ts), grid: "hex" }).length).toBe(1);
    const withTiles = { ...ts, tileOrder: ["x"] };
    expect(validateImport(img, withTiles, { ...defaultImportSettings(ts), tileWidth: 1 }).length).toBeGreaterThan(0);
  });

  it("lets an empty tileset adopt the import tile size", () => {
    const { p, ts } = fresh();
    const s = { ...defaultImportSettings(ts), tileWidth: 1, tileHeight: 1 };
    const res = sliceImage(sheet([[tile(R)]]), { ...ts, tileWidth: 1, tileHeight: 1 }, s, "rip");
    const ts2 = ops.findTileset(applyImport(p, ts.id, res, s), ts.id)!;
    expect(ts2.tileWidth).toBe(1);
  });

  it("proposes near-duplicate groups without merging", () => {
    let { p, ts } = fresh();
    const a = ops.createTile(ts, "a", tile(R));
    const b = ops.createTile(ts, "b", tile(R, G)); // 1 of 4 pixels differs
    const c = ops.createTile(ts, "c", tile(B));
    for (const t of [a, b, c]) p = ops.addTile(p, ts.id, t);
    ts = ops.findTileset(p, ts.id)!;
    expect(findNearDuplicates(ts, 0.25)).toEqual([[a.id, b.id]]);
    expect(findNearDuplicates(ts, 0.1)).toEqual([]);
    expect(ts.tileOrder).toHaveLength(3);
  });

  it("names previews after the file", () => {
    expect(previewNameFromFile("C:\\maps\\Map Rip.png")).toBe("Map Rip");
  });
});
