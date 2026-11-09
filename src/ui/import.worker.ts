/// <reference lib="webworker" />
import { indexTiles, PALETTE_EXTRACT_LIMIT, scanCells, scanMatches, sliceImage, type CellScan, type ImportResult, type ImportSettings, type TileIndex } from "../core/import";
import type { Color, Tileset } from "../core/model";
import { distinctColors } from "../core/pixels";
import { decodePng, isPng, type RgbaImage } from "../core/png";
import type { WorkerReply, WorkerRequest } from "./importClient";

/**
 * Import worker: decodes the image and slices it off the UI thread. The RGBA
 * image lives only here; the dialog gets an ImageBitmap to draw and, on
 * Import, the result with tile pixel buffers transferred (not copied).
 * Everything it computes comes from the pure functions in src/core.
 */

declare const self: DedicatedWorkerGlobalScope;

let img: RgbaImage | null = null;
let tileset: Pick<Tileset, "tileOrder" | "tiles"> = { tileOrder: [], tiles: {} };
let index: TileIndex | undefined;
let scan: CellScan | undefined;
let colors: Color[] | undefined;
/** The last dry run, kept so Import doesn't slice again with unchanged settings. */
let last: { key: string; result: ImportResult } | null = null;

const keyOf = (s: ImportSettings) => JSON.stringify(s);

function slice(s: ImportSettings): ImportResult {
  const key = keyOf(s);
  if (last?.key === key) return last.result;
  if (!img) throw new Error("No image loaded");
  if (!scan || !scanMatches(scan, s)) scan = scanCells(img, s);
  if (s.isolateUnique) index ??= indexTiles(tileset);
  if (s.extractPalette) colors ??= distinctColors(img.pixels, PALETTE_EXTRACT_LIMIT);
  const result = sliceImage(img, tileset, s, "", { scan, index, colors });
  last = { key, result };
  return result;
}

async function handle(req: WorkerRequest): Promise<{ reply: WorkerReply; transfer?: Transferable[] }> {
  switch (req.type) {
    case "load": {
      tileset = req.tileset;
      index = scan = colors = undefined;
      last = null;
      img = null;
      if (req.image) img = req.image;
      else if (isPng(req.bytes!)) {
        try {
          img = decodePng(req.bytes!);
        } catch (e) {
          // Interlaced PNGs etc.: the dialog falls back to the browser decoder.
          return { reply: { type: "loaded", seq: req.seq, needsBrowserDecode: true, reason: e instanceof Error ? e.message : String(e) } };
        }
      } else return { reply: { type: "loaded", seq: req.seq, needsBrowserDecode: true } };
      const bitmap = await createImageBitmap(new ImageData(img.pixels as Uint8ClampedArray<ArrayBuffer>, img.width, img.height));
      return { reply: { type: "loaded", seq: req.seq, width: img.width, height: img.height, bitmap }, transfer: [bitmap] };
    }
    case "analyze": {
      const r = slice(req.settings);
      return { reply: { type: "analyzed", seq: req.seq, stats: r.stats, colorCount: r.colors.length } };
    }
    case "commit": {
      const r = slice(req.settings);
      last = null; // its buffers are about to be transferred away
      const result: ImportResult = { ...r, preview: { ...r.preview, name: req.previewName } };
      return { reply: { type: "committed", seq: req.seq, result }, transfer: r.newTiles.map((t) => t.pixels.buffer as ArrayBuffer) };
    }
  }
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  handle(req).then(
    ({ reply, transfer }) => self.postMessage(reply, transfer ?? []),
    (e) => self.postMessage({ type: "error", seq: req.seq, message: e instanceof Error ? e.message : String(e) } satisfies WorkerReply),
  );
};
