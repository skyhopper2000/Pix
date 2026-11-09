import { describe, expect, it } from "vitest";
import { pack } from "./color";
import type { Project } from "./model";
import * as ops from "./ops";
import { setPixel } from "./pixels";

function setup() {
  let p: Project = ops.createProject("t");
  const ts = ops.createTileset("map example");
  p = ops.addTileset(p, ts);
  const a = ops.createTile(ts, "a");
  const b = ops.createTile(ts, "b");
  p = ops.addTile(p, ts.id, a);
  p = ops.addTile(p, ts.id, b);
  const sub = ops.createSubset("buildings", "unstructured", { cols: 2, rows: 2 });
  p = ops.addSubset(p, ts.id, sub);
  const pv = ops.createPreview("map", 2, 1);
  p = ops.addPreview(p, ts.id, pv);
  p = ops.setSubsetCell(p, ts.id, sub.id, 3, a.id);
  p = ops.setPreviewCells(p, ts.id, pv.id, [
    { index: 0, tileId: a.id },
    { index: 1, tileId: b.id },
  ]);
  return { p, tsId: ts.id, a: a.id, b: b.id, sub: sub.id, pv: pv.id };
}

const dump = (p: Project) => JSON.stringify(p, (_k, v) => (v instanceof Uint8ClampedArray ? Array.from(v) : v));

describe("ops", () => {
  it("addTiles equals repeated addTile and leaves the input untouched", () => {
    const ts = ops.createTileset("t", 2, 2);
    let p = ops.addTileset(ops.createProject(), ts);
    p = ops.addTile(p, ts.id, ops.createTile(ts, "first"));
    const more = [ops.createTile(ts, "a"), ops.createTile(ts, "b"), ops.createTile(ts, "c")];
    const one = more.reduce((q, t) => ops.addTile(q, ts.id, t), p);
    const batch = ops.addTiles(p, ts.id, more);
    expect(ops.findTileset(batch, ts.id)!.tileOrder).toEqual(ops.findTileset(one, ts.id)!.tileOrder);
    expect(ops.findTileset(batch, ts.id)!.tiles).toEqual(ops.findTileset(one, ts.id)!.tiles);
    expect(ops.findTileset(p, ts.id)!.tileOrder).toHaveLength(1);
    expect(ops.addTiles(p, ts.id, [])).toBe(p);
  });

  it("never mutates the input project", () => {
    const { p, tsId, a } = setup();
    const before = dump(p);
    ops.deleteTile(p, tsId, a);
    ops.renameTile(p, tsId, a, "z");
    ops.mergeTiles(p, tsId, a, [a]);
    expect(dump(p)).toBe(before);
  });

  it("links tiles: subsets and previews hold references only", () => {
    const { p, tsId, a, sub, pv } = setup();
    const ts = ops.findTileset(p, tsId)!;
    expect(ts.subsets[0].cells[3]).toBe(a);
    expect(ts.previews[0].cells[0]).toBe(a);
    const px = ts.tiles[a].pixels.slice();
    setPixel(px, 16, 0, 0, pack(255, 0, 0));
    const ts2 = ops.findTileset(ops.setTilePixels(p, tsId, a, px), tsId)!;
    expect(ts2.subsets.find((s) => s.id === sub)!.cells[3]).toBe(a);
    expect(ts2.previews.find((v) => v.id === pv)!.cells[0]).toBe(a);
    expect(ts2.tiles[a].pixels).toBe(px);
  });

  it("deleting a tile deletes it everywhere", () => {
    const { p, tsId, a, b } = setup();
    const ts = ops.findTileset(ops.deleteTile(p, tsId, a), tsId)!;
    expect(ts.tiles[a]).toBeUndefined();
    expect(ts.tileOrder).toEqual([b]);
    expect(ts.subsets[0].cells).toEqual([null, null, null, null]);
    expect(ts.previews[0].cells).toEqual([null, b]);
  });

  it("a tile drawn in a subset joins the parent", () => {
    const { p, tsId, sub } = setup();
    const { project, tileId } = ops.addTileInSubset(p, tsId, sub, 0);
    const ts = ops.findTileset(project, tsId)!;
    expect(tileId).not.toBeNull();
    expect(ts.tileOrder.at(-1)).toBe(tileId);
    expect(ts.subsets[0].cells[0]).toBe(tileId);
  });

  it("names a tile drawn in a template slot after the slot", () => {
    const { p, tsId } = setup();
    const s = ops.createSubset("grass_dirt", "corner16");
    expect(s.cells).toHaveLength(16);
    const { project, tileId } = ops.addTileInSubset(ops.addSubset(p, tsId, s), tsId, s.id, 1);
    expect(ops.findTileset(project, tsId)!.tiles[tileId!].name).toBe("grass_dirt_NE");
  });

  it("refuses to reference tiles from outside the parent", () => {
    const { p, tsId, sub, pv } = setup();
    expect(ops.setSubsetCell(p, tsId, sub, 0, "ffffffffffffffff")).toBe(p);
    expect(ops.setPreviewCells(p, tsId, pv, [{ index: 0, tileId: "ffffffffffffffff" }])).toBe(p);
  });

  it("merges tiles only when asked, remapping every reference", () => {
    const { p, tsId, a, b } = setup();
    const ts = ops.findTileset(ops.mergeTiles(p, tsId, b, [a]), tsId)!;
    expect(ts.tileOrder).toEqual([b]);
    expect(ts.previews[0].cells).toEqual([b, b]);
    expect(ts.subsets[0].cells[3]).toBe(b);
  });

  it("resizes grids keeping positions", () => {
    expect(ops.resizeGrid(["a", "b", "c", "d"], 2, 2, 3, 1)).toEqual(["a", "b", null]);
  });

  it("adds palette colors without duplicates", () => {
    let p = ops.createProject();
    p = ops.addPaletteColors(p, [1, 2, 2, 3]);
    p = ops.addPaletteColors(p, [3, 4]);
    expect(p.palette.colors).toEqual([1, 2, 3, 4]);
  });

  it("nextEmptyCell finds the next empty cell after `from`, wrapping", () => {
    const cells = ["a", null, "b", null, "c"];
    expect(ops.nextEmptyCell(cells, null)).toBe(1);
    expect(ops.nextEmptyCell(cells, 1)).toBe(3);
    expect(ops.nextEmptyCell(cells, 3)).toBe(1);
    expect(ops.nextEmptyCell(cells, 4)).toBe(1);
    expect(ops.nextEmptyCell(["a", "b"], 0)).toBeNull();
    expect(ops.nextEmptyCell([null], 0)).toBe(0);
    expect(ops.nextEmptyCell([], null)).toBeNull();
  });

  it("setSubsetTemplate keeps tiles on the slot at the same position and drops removed slots", () => {
    const ts = ops.createTileset("t", 2, 2);
    let p = ops.addTileset(ops.createProject(), ts);
    const tiles = [ops.createTile(ts, "a"), ops.createTile(ts, "b"), ops.createTile(ts, "c")];
    p = ops.addTiles(p, ts.id, tiles);
    const w = [0, 1, 0, 1, 0, 1, 0, 1];
    const sub = ops.createSubset("c", "custom", {
      template: { wangType: "corner", cols: 3, rows: 1, slots: [0, 1, 2].map((col) => ({ col, row: 0, wangId: w })) },
    });
    p = ops.addSubset(p, ts.id, sub);
    tiles.forEach((t, i) => (p = ops.setSubsetCell(p, ts.id, sub.id, i, t.id)));
    // New grid 2×2: (0,0) kept, (1,0) dropped, (2,0) out of the grid, (0,1) and (1,1) new.
    const next = ops.setSubsetTemplate(p, ts.id, sub.id, {
      wangType: "corner",
      cols: 2,
      rows: 2,
      slots: [
        { col: 0, row: 0, wangId: w },
        { col: 0, row: 1, wangId: w },
        { col: 1, row: 1, wangId: w },
      ],
    });
    const s2 = ops.findTileset(next, ts.id)!.subsets[0];
    expect(s2.cells).toEqual([tiles[0].id, null, null]);
    expect([s2.cols, s2.rows]).toEqual([2, 2]);
    expect(Object.keys(ops.findTileset(next, ts.id)!.tiles)).toHaveLength(3);
    // The input is untouched; non-custom subsets are left alone.
    expect(ops.findTileset(p, ts.id)!.subsets[0].cells).toHaveLength(3);
    const blob = ops.createSubset("b", "corner16");
    const p2 = ops.addSubset(p, ts.id, blob);
    expect(ops.setSubsetTemplate(p2, ts.id, blob.id, s2.template!)).toEqual(p2);
  });
});
