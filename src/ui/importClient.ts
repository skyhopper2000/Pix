import type { ImportResult, ImportSettings } from "../core/import";
import type { Tileset } from "../core/model";
import type { RgbaImage } from "../core/png";
import { decodeImage } from "./decodeImage";

/** Messages to and from import.worker.ts. */
export type WorkerRequest =
  | { type: "load"; seq: number; tileset: Pick<Tileset, "tileOrder" | "tiles">; bytes?: Uint8Array; image?: RgbaImage }
  | { type: "analyze"; seq: number; settings: ImportSettings }
  | { type: "commit"; seq: number; settings: ImportSettings; previewName: string };

export type WorkerReply =
  | { type: "loaded"; seq: number; width?: number; height?: number; bitmap?: ImageBitmap; needsBrowserDecode?: boolean; reason?: string }
  | { type: "analyzed"; seq: number; stats: ImportResult["stats"]; colorCount: number }
  | { type: "committed"; seq: number; result: ImportResult }
  | { type: "error"; seq: number; message: string };

type WithoutSeq<T> = T extends unknown ? Omit<T, "seq"> : never;

export interface LoadedImage {
  width: number;
  height: number;
  /** For drawing the preview only. */
  bitmap: ImageBitmap;
  /** True when pixels came from our exact PNG decoder. */
  exact: boolean;
}

/**
 * One import dialog's connection to its own worker. The image is decoded and
 * sliced in the worker so large files don't freeze the UI. Call dispose() when
 * the dialog closes.
 */
export class ImportSession {
  private worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
  private seq = 0;
  private pending = new Map<number, { resolve: (r: WorkerReply) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<WorkerReply>) => {
      const p = this.pending.get(ev.data.seq);
      if (!p) return;
      this.pending.delete(ev.data.seq);
      if (ev.data.type === "error") p.reject(new Error(ev.data.message));
      else p.resolve(ev.data);
    };
    this.worker.onerror = (ev) => {
      const err = new Error(ev.message || "Import worker failed");
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  private send(req: WithoutSeq<WorkerRequest>, transfer: Transferable[] = []): Promise<WorkerReply> {
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      this.worker.postMessage({ ...req, seq }, transfer);
    });
  }

  /** Decodes `bytes` (exactly for PNG; via the browser for other formats) and indexes the tileset's tiles for re-import dedupe. */
  async load(bytes: Uint8Array, ts: Pick<Tileset, "tileOrder" | "tiles">): Promise<LoadedImage> {
    const tileset = { tileOrder: ts.tileOrder, tiles: ts.tiles };
    // bytes stay owned by the UI state, so they are copied (not transferred).
    let r = await this.send({ type: "load", tileset, bytes });
    let exact = true;
    if (r.type === "loaded" && r.needsBrowserDecode) {
      // Non-PNG or interlaced: needs the DOM decoder, which runs here.
      const d = await decodeImage(bytes);
      exact = d.exact;
      const image: RgbaImage = { width: d.width, height: d.height, pixels: d.pixels };
      r = await this.send({ type: "load", tileset, image }, [d.pixels.buffer as ArrayBuffer]);
    }
    if (r.type !== "loaded" || !r.bitmap) throw new Error("Couldn't decode the image");
    return { width: r.width!, height: r.height!, bitmap: r.bitmap, exact };
  }

  /** Dry run for the dialog's summary line. */
  async analyze(settings: ImportSettings): Promise<{ stats: ImportResult["stats"]; colorCount: number }> {
    const r = await this.send({ type: "analyze", settings });
    if (r.type !== "analyzed") throw new Error("Unexpected worker reply");
    return { stats: r.stats, colorCount: r.colorCount };
  }

  /** The full result, reusing the last dry run when the settings are unchanged. */
  async commit(settings: ImportSettings, previewName: string): Promise<ImportResult> {
    const r = await this.send({ type: "commit", settings, previewName });
    if (r.type !== "committed") throw new Error("Unexpected worker reply");
    return r.result;
  }

  dispose() {
    this.worker.terminate();
    const err = new Error("Import cancelled");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
