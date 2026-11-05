import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { pack } from "../color";
import type { Project } from "../model";
import * as ops from "../ops";
import { createPixels, getPixel, setPixel } from "../pixels";
import { decodePng } from "../png";
import { buildExport, defaultExportSettings, exportZipName, packSheet, safeName, validateExport, writeTsx, xmlEscape, zipFiles } from ".";

const R = pack(255, 0, 0);
const G = pack(0, 255, 0);

function solid(c: number, w = 2, h = 2) {
  const px = createPixels(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(px, w, x, y, c);
  return px;
}

const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** Tiled's own column formula, to prove margin/spacing are consistent. */
const tiledColumns = (imageWidth: number, tw: number, margin: number, spacing: number) => Math.floor((imageWidth - 2 * margin + spacing) / (tw + spacing));

describe("packSheet", () => {
  it("lays tiles out left-to-right, top-to-bottom", () => {
    const s = packSheet([solid(R), solid(G), null, solid(R)], 2, 2, 2, { scale: 1, padding: 0, spacing: 0, extrusion: 0 });
    expect([s.width, s.height, s.columns, s.rows]).toEqual([4, 4, 2, 2]);
    expect(getPixel(s.pixels, 4, 2, 0)).toBe(G);
    expect(getPixel(s.pixels, 4, 0, 2)).toBe(0); // empty cell is transparent
    expect(getPixel(s.pixels, 4, 3, 3)).toBe(R);
  });

  it("writes margin/spacing that match extrusion, for any scale", () => {
    for (const [scale, padding, spacing, extrusion] of [[1, 0, 0, 1], [2, 3, 1, 2], [4, 8, 8, 4], [3, 0, 2, 0]]) {
      const n = 5;
      const s = packSheet(Array.from({ length: n * 2 }, () => solid(R)), n, 2, 2, { scale, padding, spacing, extrusion });
      expect(s.tsxMargin).toBe(padding + extrusion);
      expect(s.tsxSpacing).toBe(spacing + 2 * extrusion);
      expect(tiledColumns(s.width, s.tileWidth, s.tsxMargin, s.tsxSpacing)).toBe(n);
      // The first real tile pixel sits exactly at (margin, margin).
      expect(getPixel(s.pixels, s.width, s.tsxMargin, s.tsxMargin)).toBe(R);
    }
  });

  it("extrudes edges into the gutter", () => {
    const t = createPixels(2, 1);
    setPixel(t, 2, 0, 0, R);
    setPixel(t, 2, 1, 0, G);
    const s = packSheet([t], 1, 2, 1, { scale: 1, padding: 0, spacing: 0, extrusion: 1 });
    expect(s.width).toBe(4);
    expect(getPixel(s.pixels, 4, 0, 1)).toBe(R);
    expect(getPixel(s.pixels, 4, 3, 1)).toBe(G);
  });
});

describe("writeTsx", () => {
  it("escapes XML and writes wang sets", () => {
    expect(xmlEscape(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
    const xml = writeTsx({
      name: "grass & dirt",
      image: "grass_dirt.png",
      imageWidth: 64,
      imageHeight: 64,
      tileWidth: 16,
      tileHeight: 16,
      margin: 0,
      spacing: 0,
      columns: 4,
      tileCount: 16,
      tiles: [{ index: 0, name: "grass_dirt_none" }],
      wangSet: {
        name: "grass_dirt",
        type: "corner",
        colors: [
          { name: "grass", color: "#00ff00" },
          { name: "dirt", color: "#884400" },
        ],
        tiles: [{ index: 0, wangId: [0, 1, 0, 1, 0, 1, 0, 1] }],
      },
    });
    expect(xml).toContain('name="grass &amp; dirt"');
    expect(xml).toContain('<wangset name="grass_dirt" type="corner" tile="-1">');
    expect(xml).toContain('<wangcolor name="grass" color="#00ff00" tile="-1" probability="1"/>');
    expect(xml).toContain('<wangtile tileid="0" wangid="0,1,0,1,0,1,0,1"/>');
    expect(xml.indexOf("<image")).toBeLessThan(xml.indexOf("<tile "));
    expect(xml.indexOf("<tile ")).toBeLessThan(xml.indexOf("<wangsets>"));
  });
});

function janeProject() {
  let p: Project = ops.createProject("Jane");
  const ts = ops.createTileset("map example", 2, 2);
  p = ops.addTileset(p, ts);
  const a = ops.createTile(ts, "tile0_0", solid(R));
  const b = ops.createTile(ts, "tile0_1", solid(G));
  const lonely = ops.createTile(ts, "lonely", solid(R, 2, 2));
  for (const t of [a, b, lonely]) p = ops.addTile(p, ts.id, t);
  const buildings = ops.createSubset("buildings", "unstructured", { cols: 4, rows: 4 });
  const blob = ops.createSubset("grass_dirt", "blob47");
  p = ops.addSubset(p, ts.id, buildings);
  p = ops.addSubset(p, ts.id, blob);
  p = ops.setSubsetCell(p, ts.id, buildings.id, 1, a.id);
  p = ops.setSubsetCell(p, ts.id, buildings.id, 4 + 0, b.id); // row 1, col 0
  p = ops.setSubsetCell(p, ts.id, blob.id, 0, a.id);
  p = ops.setSubsetCell(p, ts.id, blob.id, 46, b.id);
  p = ops.addPreview(p, ts.id, ops.createPreview("map rip", 2, 1, [a.id, b.id]));
  p = ops.addPaletteColors(p, [R, G]);
  return { p, ts, a, b, buildings, blob };
}

describe("buildExport", () => {
  const now = new Date("2026-11-04T00:00:00Z");

  it("produces the spec's zip layout", () => {
    const { p } = janeProject();
    const files = buildExport(p, defaultExportSettings(), now);
    expect([...files.keys()].sort()).toEqual(
      [
        "manifest.json",
        "map_example.png",
        "map_example.tsx",
        "palette.gpl",
        "previews/map_rip.png",
        "subsets/buildings.png",
        "subsets/buildings.tsx",
        "subsets/grass_dirt.png",
        "subsets/grass_dirt.tsx",
      ].sort(),
    );
    expect(exportZipName(p)).toBe("map_example_export.zip");
    const unzipped = unzipSync(zipFiles(files));
    expect(Object.keys(unzipped)[0]).toBe("manifest.json");
  });

  it("parent sheet holds every tile, including ones in no subset", () => {
    const { p } = janeProject();
    const files = buildExport(p, defaultExportSettings(), now);
    const tsx = dec(files.get("map_example.tsx")!);
    expect(tsx).toContain('tilecount="4"'); // 3 tiles in a 2x2 auto grid
    expect(tsx).toContain('value="lonely"');
    expect(tsx).not.toContain("wangset");
  });

  it("unstructured subsets keep the arrangement and trim trailing space", () => {
    const { p } = janeProject();
    const files = buildExport(p, defaultExportSettings(), now);
    const img = decodePng(files.get("subsets/buildings.png")!);
    // used area: cols 0..1, rows 0..1 -> 2x2 tiles of 2px
    expect([img.width, img.height]).toEqual([4, 4]);
    expect(getPixel(img.pixels, 4, 0, 0)).toBe(0); // cell (0,0) empty
    expect(getPixel(img.pixels, 4, 2, 0)).toBe(R); // cell (0,1) = a
    expect(getPixel(img.pixels, 4, 0, 2)).toBe(G); // cell (1,0) = b
  });

  it("template subsets export in fixed slot order with a mixed wang set", () => {
    const { p } = janeProject();
    const files = buildExport(p, defaultExportSettings(), now);
    const tsx = dec(files.get("subsets/grass_dirt.tsx")!);
    expect(tsx).toContain('columns="8"');
    expect(tsx).toContain('tilecount="48"');
    expect(tsx).toContain('type="mixed"');
    expect(tsx).toContain('<wangtile tileid="0" wangid="1,1,1,1,1,1,1,1"/>');
    expect(tsx).toContain('<wangtile tileid="46" wangid="2,2,2,2,2,2,2,2"/>');
    expect((tsx.match(/<wangtile /g) ?? []).length).toBe(2); // empty slots have no wang tile
    const img = decodePng(files.get("subsets/grass_dirt.png")!);
    expect([img.width, img.height]).toEqual([16, 12]);
  });

  it("writes several scales with suffixes and matching tsx", () => {
    const { p } = janeProject();
    const files = buildExport(p, { ...defaultExportSettings(), scales: [2, 1], extrusion: 1 }, now);
    expect(files.has("map_example@2x.png")).toBe(true);
    const tsx = dec(files.get("map_example@2x.tsx")!);
    expect(tsx).toContain('tilewidth="4"');
    expect(tsx).toContain('margin="1"');
    expect(tsx).toContain('spacing="2"');
    expect(tsx).toContain('source="map_example@2x.png"');
  });

  it("honours scope, previews and per-tile options", () => {
    const { p, blob } = janeProject();
    const files = buildExport(p, { ...defaultExportSettings(), scope: [blob.id], includePreviews: true }, now);
    expect([...files.keys()].filter((k) => k.endsWith(".png"))).toEqual(["subsets/grass_dirt.png"]);
    const all = buildExport(p, { ...defaultExportSettings(), includePreviews: false, perTilePngs: true }, now);
    expect(all.has("previews/map_rip.png")).toBe(false);
    expect(all.has("tiles/tile0_0.png")).toBe(true);
    expect(all.has("tiles/lonely.png")).toBe(true);
  });

  it("puts each tileset in its own folder when there are several", () => {
    let { p } = janeProject();
    p = ops.addTileset(p, ops.createTileset("caves", 2, 2));
    const files = buildExport(p, defaultExportSettings(), now);
    expect(files.has("map_example/map_example.png")).toBe(true);
    expect(files.has("caves/caves.png")).toBe(true);
  });

  it("never modifies the project", () => {
    const { p, a } = janeProject();
    const before = Array.from(p.tilesets[0].tiles[a.id].pixels);
    buildExport(p, { ...defaultExportSettings(), scales: [1, 2, 3, 4], extrusion: 4 }, now);
    expect(Array.from(p.tilesets[0].tiles[a.id].pixels)).toEqual(before);
  });

  it("validates settings", () => {
    expect(validateExport(defaultExportSettings())).toEqual([]);
    expect(validateExport({ ...defaultExportSettings(), scales: [5] }).length).toBe(1);
    expect(validateExport({ ...defaultExportSettings(), extrusion: 5, padding: -1 }).length).toBe(2);
  });

  it("makes safe names", () => {
    expect(safeName("map example")).toBe("map_example");
    expect(safeName('a<b>:c?')).toBe("abc");
    expect(safeName("  ")).toBe("untitled");
  });
});
