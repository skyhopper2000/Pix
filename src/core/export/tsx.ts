import type { Terrain, WangType } from "../model";

/** Hand-written Tiled .tsx (TSX format 1.10) writer. */

export interface TsxTile {
  index: number; // local tile id in the sheet grid
  name: string;
}

export interface TsxWangSet {
  name: string;
  type: WangType;
  colors: Terrain[];
  tiles: { index: number; wangId: number[] }[];
}

export interface TsxInput {
  name: string;
  image: string; // relative path to the PNG
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
  columns: number;
  tileCount: number;
  tiles: TsxTile[];
  wangSet?: TsxWangSet;
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const attrs = (o: Record<string, string | number>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}="${xmlEscape(String(v))}"`)
    .join(" ");

export function writeTsx(t: TsxInput): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(
    `<tileset ${attrs({
      version: "1.10",
      tiledversion: "1.11.0",
      name: t.name,
      tilewidth: t.tileWidth,
      tileheight: t.tileHeight,
      spacing: t.spacing,
      margin: t.margin,
      tilecount: t.tileCount,
      columns: t.columns,
    })}>`,
  );
  out.push(` <image ${attrs({ source: t.image, width: t.imageWidth, height: t.imageHeight })}/>`);
  // Tile names travel as a "name" property so they survive into Tiled.
  for (const tile of t.tiles) {
    out.push(` <tile id="${tile.index}">`);
    out.push(`  <properties>`);
    out.push(`   <property ${attrs({ name: "name", value: tile.name })}/>`);
    out.push(`  </properties>`);
    out.push(` </tile>`);
  }
  if (t.wangSet) {
    const w = t.wangSet;
    out.push(" <wangsets>");
    out.push(`  <wangset ${attrs({ name: w.name, type: w.type, tile: -1 })}>`);
    for (const c of w.colors) out.push(`   <wangcolor ${attrs({ name: c.name, color: c.color, tile: -1, probability: 1 })}/>`);
    for (const wt of w.tiles) out.push(`   <wangtile ${attrs({ tileid: wt.index, wangid: wt.wangId.join(",") })}/>`);
    out.push("  </wangset>");
    out.push(" </wangsets>");
  }
  out.push("</tileset>");
  return out.join("\n") + "\n";
}
