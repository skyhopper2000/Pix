import type { BlendMode, Id, Layer, Tile } from "./model";

/**
 * Tile layers. A tile without `layers` is one implicit layer whose pixels are
 * `tile.pixels`. A layered tile keeps `tile.pixels` as the flattened composite,
 * so everything that reads tiles (export, dedupe, previews) needs no change.
 */

/** Id of the implicit single layer of a tile that has no `layers`. */
export const IMPLICIT_LAYER = "base";
export const DEFAULT_BLEND: BlendMode = "replace";

/**
 * Flattens layers bottom → top into a new buffer.
 * replace: a pixel with alpha > 0 overwrites what's below.
 * normal: non-premultiplied source-over, rounded to the nearest integer.
 * The bottom layer is drawn as-is, whatever its blend mode.
 */
export function flattenLayers(layers: readonly Layer[], w: number, h: number): Uint8ClampedArray {
  const n = w * h * 4;
  const out = new Uint8ClampedArray(n);
  if (layers.length === 0) return out;
  out.set(layers[0].pixels);
  for (let li = 1; li < layers.length; li++) {
    const { pixels: s, blend } = layers[li];
    for (let i = 0; i < n; i += 4) {
      const sa = s[i + 3];
      if (sa === 0) continue;
      const da = out[i + 3];
      if (blend === "replace" || sa === 255 || da === 0) {
        out[i] = s[i];
        out[i + 1] = s[i + 1];
        out[i + 2] = s[i + 2];
        out[i + 3] = sa;
        continue;
      }
      // out_a = sa + da(1 - sa); out_c = (sc*sa + dc*da*(1 - sa)) / out_a, all in 0..255 integers.
      const dw = da * (255 - sa); // weight of dst, scaled by 255
      const oa255 = sa * 255 + dw; // out alpha scaled by 255
      for (let k = 0; k < 3; k++) out[i + k] = Math.round((s[i + k] * sa * 255 + out[i + k] * dw) / oa255);
      out[i + 3] = Math.round(oa255 / 255);
    }
  }
  return out;
}

/** The tile's layers, bottom → top. A plain tile gives one implicit layer sharing `tile.pixels`. */
export function layersOf(tile: Tile): Layer[] {
  return tile.layers ?? [{ id: IMPLICIT_LAYER, name: "Layer 1", blend: DEFAULT_BLEND, pixels: tile.pixels }];
}

/** Index of a layer by id, or -1. */
export function layerIndex(tile: Tile, layerId: Id): number {
  return layersOf(tile).findIndex((l) => l.id === layerId);
}

/** Pixels of the layer at `index` (0 = bottom). Falls back to the composite. */
export function layerPixels(tile: Tile, index: number): Uint8ClampedArray {
  return tile.layers?.[index]?.pixels ?? tile.pixels;
}

/**
 * Returns the tile with a new layer list: recomputes the composite, and turns a
 * one-layer list back into a plain tile (its pixels become `tile.pixels`).
 */
export function withLayers(tile: Tile, layers: Layer[], w: number, h: number): Tile {
  if (layers.length <= 1) {
    const { layers: _drop, ...plain } = tile;
    return { ...plain, pixels: layers[0]?.pixels ?? tile.pixels };
  }
  return { ...tile, layers, pixels: flattenLayers(layers, w, h) };
}
