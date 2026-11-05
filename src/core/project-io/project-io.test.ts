import { describe, expect, it } from "vitest";
import { pack } from "../color";
import type { Project } from "../model";
import * as ops from "../ops";
import { createPixels, setPixel } from "../pixels";
import { encodePng } from "../png";
import { deserializeProject, PROJECT_FILE, projectFolderName, serializeProject } from ".";

function sample(): Project {
  let p = ops.createProject("My Game");
  const ts = ops.createTileset("map example", 4, 4);
  p = ops.addTileset(p, ts);
  const px = createPixels(4, 4);
  setPixel(px, 4, 1, 2, pack(10, 20, 30, 128));
  const a = ops.createTile(ts, "tile0_0", px);
  const b = ops.createTile(ts, "tile0_1");
  p = ops.addTile(ops.addTile(p, ts.id, a), ts.id, b);
  const blob = ops.createSubset("grass_dirt", "corner16", {
    terrains: [
      { name: "grass", color: "#00ff00" },
      { name: "dirt", color: "#884400" },
    ],
  });
  const bld = ops.createSubset("buildings", "unstructured", { cols: 3, rows: 2 });
  const custom = ops.createSubset("cliff", "custom", { template: { wangType: "edge", cols: 2, rows: 1, slots: [{ col: 0, row: 0, wangId: [2, 0, 1, 0, 1, 0, 1, 0] }, { col: 1, row: 0, wangId: [1, 0, 2, 0, 1, 0, 1, 0] }] } });
  p = ops.addSubset(ops.addSubset(ops.addSubset(p, ts.id, blob), ts.id, bld), ts.id, custom);
  p = ops.setSubsetCell(p, ts.id, blob.id, 5, a.id);
  p = ops.setSubsetCell(p, ts.id, bld.id, 4, b.id);
  p = ops.setPreviewCells(p, ts.id, bld.preview.id, [{ index: 0, tileId: a.id }]);
  p = ops.addPreview(p, ts.id, ops.createPreview("rip", 2, 1, [a.id, b.id]));
  p = ops.addPaletteColors(p, [pack(1, 2, 3), pack(4, 5, 6, 7)]);
  return ops.setPaletteLocked(p, true);
}

const dump = (p: Project) => JSON.stringify(p, (_k, v) => (v instanceof Uint8ClampedArray ? Array.from(v) : v));

describe("project io", () => {
  it("round-trips a project exactly", () => {
    const p = sample();
    const files = serializeProject(p);
    expect([...files.keys()].filter((k) => k.startsWith("tiles/"))).toHaveLength(2);
    const { project, warnings } = deserializeProject(files);
    expect(warnings).toEqual([]);
    expect(dump(project)).toBe(dump(p));
  });

  it("writes readable JSON with tile files named by id", () => {
    const p = sample();
    const files = serializeProject(p);
    const json = JSON.parse(new TextDecoder().decode(files.get(PROJECT_FILE)!));
    expect(json.format).toBe("tilestudio-project");
    expect(json.tilesets[0].tiles[0].name).toBe("tile0_0");
    expect(json.palette.colors).toEqual(["#010203", "#04050607"]);
    const id = p.tilesets[0].tileOrder[0];
    expect(files.has(`tiles/${id}.png`)).toBe(true);
  });

  it("recovers from missing or broken tile files", () => {
    const p = sample();
    const files = serializeProject(p);
    const [a, b] = p.tilesets[0].tileOrder;
    files.delete(`tiles/${a}.png`);
    files.set(`tiles/${b}.png`, encodePng(createPixels(2, 2), 2, 2)); // wrong size
    const { project, warnings } = deserializeProject(files);
    expect(warnings).toHaveLength(2);
    expect(project.tilesets[0].tileOrder).toEqual([a, b]);
    expect(project.tilesets[0].tiles[a].pixels.length).toBe(4 * 4 * 4);
  });

  it("keeps damaged tile files on save until the tile is edited", () => {
    const p = sample();
    const files = serializeProject(p);
    const [a] = p.tilesets[0].tileOrder;
    const broken = encodePng(createPixels(2, 2), 2, 2);
    files.set(`tiles/${a}.png`, broken);
    const { project, preserved } = deserializeProject(files);
    expect(serializeProject(project, preserved).get(`tiles/${a}.png`)).toBe(broken);
    const edited = ops.setTilePixels(project, project.tilesets[0].id, a, createPixels(4, 4));
    expect(serializeProject(edited, preserved).get(`tiles/${a}.png`)).not.toBe(broken);
  });

  it("empties references to unknown tiles", () => {
    const p = sample();
    const files = serializeProject(p);
    const json = JSON.parse(new TextDecoder().decode(files.get(PROJECT_FILE)!));
    json.tilesets[0].previews[0].cells[0] = "0123456789abcdef";
    files.set(PROJECT_FILE, new TextEncoder().encode(JSON.stringify(json)));
    const { project, warnings } = deserializeProject(files);
    expect(project.tilesets[0].previews[0].cells[0]).toBeNull();
    expect(warnings.length).toBe(1);
  });

  it("refuses non-projects and newer formats", () => {
    expect(() => deserializeProject(new Map())).toThrow(/project.json/);
    const bad = new Map([[PROJECT_FILE, new TextEncoder().encode("{")]]);
    expect(() => deserializeProject(bad)).toThrow(/JSON/);
    const newer = new Map([[PROJECT_FILE, new TextEncoder().encode(JSON.stringify({ format: "tilestudio-project", version: 99 }))]]);
    expect(() => deserializeProject(newer)).toThrow(/newer/);
  });

  it("names project folders", () => {
    expect(projectFolderName("My Game")).toBe("My Game.tilestudio");
    expect(projectFolderName("x.tilestudio")).toBe("x.tilestudio");
  });
});
