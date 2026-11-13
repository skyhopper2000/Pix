import { describe, expect, it } from "vitest";
import { pack } from "./color";
import { flattenLayers, IMPLICIT_LAYER, layersOf } from "./layers";
import type { Layer, Project } from "./model";
import * as ops from "./ops";
import { createPixels, getPixel, setPixel } from "./pixels";

const W = 2;
const H = 1;
const layer = (blend: Layer["blend"], ...px: number[]): Layer => {
  const pixels = createPixels(W, H);
  px.forEach((c, i) => setPixel(pixels, W, i, 0, c));
  return { id: Math.random().toString(16), name: "l", blend, pixels };
};
const at = (buf: Uint8ClampedArray, x: number) => getPixel(buf, W, x, 0);

describe("flattenLayers", () => {
  it("replace: any non-transparent pixel wins, alpha included", () => {
    const out = flattenLayers([layer("replace", pack(255, 0, 0), pack(255, 0, 0)), layer("replace", pack(0, 0, 255, 128), 0)], W, H);
    expect(at(out, 0)).toBe(pack(0, 0, 255, 128));
    expect(at(out, 1)).toBe(pack(255, 0, 0));
  });

  it("normal: source-over blends partial alpha, copies opaque, skips transparent", () => {
    const out = flattenLayers([layer("replace", pack(255, 0, 0), pack(255, 0, 0)), layer("normal", pack(0, 0, 255, 128), pack(0, 255, 0))], W, H);
    // 128/255 blue over opaque red
    expect(at(out, 0)).toBe(pack(127, 0, 128, 255));
    expect(at(out, 1)).toBe(pack(0, 255, 0));
    const out2 = flattenLayers([layer("replace", pack(9, 9, 9)), layer("normal", 0)], W, H);
    expect(at(out2, 0)).toBe(pack(9, 9, 9));
  });

  it("normal over transparent keeps the source exactly", () => {
    const out = flattenLayers([layer("replace", 0), layer("normal", pack(10, 20, 30, 40))], W, H);
    expect(at(out, 0)).toBe(pack(10, 20, 30, 40));
  });

  it("the bottom layer's blend mode has no effect, and inputs aren't mutated", () => {
    const a = layer("normal", pack(1, 2, 3, 100));
    const before = a.pixels.slice();
    expect(at(flattenLayers([a], W, H), 0)).toBe(pack(1, 2, 3, 100));
    expect(a.pixels).toEqual(before);
  });
});

function setup() {
  let p: Project = ops.createProject("t");
  const ts = ops.createTileset("s", 2, 1);
  p = ops.addTileset(p, ts);
  const px = createPixels(2, 1);
  setPixel(px, 2, 0, 0, pack(255, 0, 0));
  const t = ops.createTile(ts, "a", px);
  p = ops.addTile(p, ts.id, t);
  return { p, tsId: ts.id, id: t.id };
}
const tileOf = (p: Project, tsId: string, id: string) => ops.findTileset(p, tsId)!.tiles[id];

describe("layer ops", () => {
  it("a plain tile has one implicit layer sharing its pixels", () => {
    const { p, tsId, id } = setup();
    const t = tileOf(p, tsId, id);
    expect(layersOf(t)).toHaveLength(1);
    expect(layersOf(t)[0].id).toBe(IMPLICIT_LAYER);
    expect(layersOf(t)[0].pixels).toBe(t.pixels);
  });

  it("addLayer makes the tile layered, keeps the composite and the input untouched", () => {
    const { p, tsId, id } = setup();
    const r = ops.addLayer(p, tsId, id);
    const t = tileOf(r.project, tsId, id);
    expect(t.layers).toHaveLength(2);
    expect(t.layers![1].id).toBe(r.layerId);
    expect(t.layers![0].id).not.toBe(IMPLICIT_LAYER);
    expect(Array.from(t.pixels)).toEqual(Array.from(tileOf(p, tsId, id).pixels));
    expect(tileOf(p, tsId, id).layers).toBeUndefined();
  });

  it("drawing on an upper layer recomputes the composite; base is unchanged", () => {
    const { p, tsId, id } = setup();
    const r = ops.addLayer(p, tsId, id);
    const top = createPixels(2, 1);
    setPixel(top, 2, 1, 0, pack(0, 255, 0));
    const p2 = ops.setLayerPixels(r.project, tsId, id, r.layerId!, top);
    const t = tileOf(p2, tsId, id);
    expect(getPixel(t.pixels, 2, 0, 0)).toBe(pack(255, 0, 0));
    expect(getPixel(t.pixels, 2, 1, 0)).toBe(pack(0, 255, 0));
    expect(getPixel(t.layers![0].pixels, 2, 1, 0)).toBe(0);
  });

  it("setTilePixels on a layered tile writes the base layer", () => {
    const { p, tsId, id } = setup();
    const r = ops.addLayer(p, tsId, id);
    const top = createPixels(2, 1);
    setPixel(top, 2, 0, 0, pack(0, 0, 255));
    let q = ops.setLayerPixels(r.project, tsId, id, r.layerId!, top);
    const base = createPixels(2, 1);
    setPixel(base, 2, 1, 0, pack(7, 7, 7));
    q = ops.setTilePixels(q, tsId, id, base);
    const t = tileOf(q, tsId, id);
    expect(t.layers![0].pixels).toBe(base);
    expect(getPixel(t.pixels, 2, 0, 0)).toBe(pack(0, 0, 255));
    expect(getPixel(t.pixels, 2, 1, 0)).toBe(pack(7, 7, 7));
  });

  it("blend, move, rename and duplicate", () => {
    const { p, tsId, id } = setup();
    const r = ops.addLayer(p, tsId, id);
    const top = createPixels(2, 1);
    setPixel(top, 2, 0, 0, pack(0, 0, 255, 128));
    let q = ops.setLayerPixels(r.project, tsId, id, r.layerId!, top);
    expect(getPixel(tileOf(q, tsId, id).pixels, 2, 0, 0)).toBe(pack(0, 0, 255, 128));
    q = ops.setLayerBlend(q, tsId, id, r.layerId!, "normal");
    expect(getPixel(tileOf(q, tsId, id).pixels, 2, 0, 0)).toBe(pack(127, 0, 128, 255));
    q = ops.renameLayer(q, tsId, id, r.layerId!, "shade");
    expect(tileOf(q, tsId, id).layers![1].name).toBe("shade");
    q = ops.moveLayer(q, tsId, id, r.layerId!, -1);
    expect(tileOf(q, tsId, id).layers![0].id).toBe(r.layerId);
    expect(getPixel(tileOf(q, tsId, id).pixels, 2, 0, 0)).toBe(pack(255, 0, 0));
    expect(ops.moveLayer(q, tsId, id, r.layerId!, -1)).toBe(q);
    const d = ops.duplicateLayer(q, tsId, id, r.layerId!);
    const ls = tileOf(d.project, tsId, id).layers!;
    expect(ls).toHaveLength(3);
    expect(ls[1].id).toBe(d.layerId);
    expect(ls[1].name).toBe("shade copy");
    expect(ls[1].pixels).toBe(ls[0].pixels);
  });

  it("deleting down to one layer turns the tile back into a plain tile", () => {
    const { p, tsId, id } = setup();
    const r = ops.addLayer(p, tsId, id);
    const baseId = tileOf(r.project, tsId, id).layers![0].id;
    const q = ops.deleteLayer(r.project, tsId, id, baseId);
    const t = tileOf(q, tsId, id);
    expect(t.layers).toBeUndefined();
    expect("layers" in t).toBe(false);
    expect(getPixel(t.pixels, 2, 0, 0)).toBe(0);
    expect(ops.deleteLayer(q, tsId, id, IMPLICIT_LAYER)).toBe(q);
  });

  it("duplicateTile copies layers with fresh ids", () => {
    const { p, tsId, id } = setup();
    const r = ops.addLayer(p, tsId, id);
    const d = ops.duplicateTile(r.project, tsId, id);
    const a = tileOf(d.project, tsId, id);
    const b = tileOf(d.project, tsId, d.tileId!);
    expect(b.layers).toHaveLength(2);
    expect(b.layers![0].id).not.toBe(a.layers![0].id);
    expect(b.layers![0].pixels).toBe(a.layers![0].pixels);
  });
});
