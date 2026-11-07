import { unzipSync, zipSync } from "fflate";
import type { FileFilter, FileTree, OpenedFile, OpenedFolder, Platform, SaveTarget } from "./types";

/**
 * Browser implementation. Uses the File System Access API where available
 * (Chromium), falling back to <input type=file> and downloads elsewhere.
 * Project folders fall back to a .zip of the same tree.
 */

// Minimal typings for the File System Access API (not in lib.dom for all TS versions).
interface FSWritable {
  write(data: BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}
interface FSFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FSWritable>;
}
interface FSDirHandle {
  kind: "directory";
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FSDirHandle>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, FSFileHandle | FSDirHandle]>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FSFileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FSFileHandle>;
  showDirectoryPicker?: (o?: unknown) => Promise<FSDirHandle>;
};

class WebTarget implements SaveTarget {
  constructor(
    readonly label: string,
    readonly file?: FSFileHandle,
    readonly dir?: FSDirHandle,
  ) {}
}

const w = (): PickerWindow => window as PickerWindow;

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function pickerTypes(filters: FileFilter[]) {
  return filters.map((f) => ({
    description: f.name,
    accept: { "application/octet-stream": f.extensions.map((x) => "." + x) },
  }));
}

function download(name: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function inputPick(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

async function writeFile(handle: FSFileHandle, bytes: Uint8Array) {
  const wr = await handle.createWritable();
  await wr.write(bytes as BufferSource);
  await wr.close();
}

async function readDir(dir: FSDirHandle, prefix: string, out: FileTree) {
  for await (const [name, h] of dir.entries()) {
    const path = prefix + name;
    if (h.kind === "file") out.set(path, new Uint8Array(await (await h.getFile()).arrayBuffer()));
    else await readDir(h, path + "/", out);
  }
}

async function subdir(root: FSDirHandle, parts: string[]): Promise<FSDirHandle> {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

/** Writes `files` into `root`, then removes files that were written by a previous save but are gone now. */
async function writeTree(root: FSDirHandle, files: FileTree) {
  const existing: FileTree = new Map();
  await readDir(root, "", existing);
  for (const [path, bytes] of files) {
    const parts = path.split("/");
    const name = parts.pop()!;
    const dir = await subdir(root, parts);
    await writeFile(await dir.getFileHandle(name, { create: true }), bytes);
  }
  // Only prune inside folders the app manages (e.g. stale tiles/*.png).
  const managedDirs = new Set([...files.keys()].filter((p) => p.includes("/")).map((p) => p.slice(0, p.lastIndexOf("/"))));
  for (const path of existing.keys()) {
    if (files.has(path)) continue;
    const slash = path.lastIndexOf("/");
    if (slash < 0 || !managedDirs.has(path.slice(0, slash))) continue;
    const dir = await subdir(root, path.slice(0, slash).split("/"));
    await dir.removeEntry(path.slice(slash + 1));
  }
}

export const webPlatform: Platform = {
  kind: "web",

  async openFile(filters): Promise<OpenedFile | null> {
    const exts = [...new Set(filters.flatMap((f) => f.extensions.map((x) => "." + x)))].join(",");
    const file = await inputPick(exts);
    if (!file) return null;
    return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  },

  async saveFileAs(suggestedName, filters, bytes) {
    const picker = w().showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName, types: pickerTypes(filters) });
        await writeFile(handle, bytes);
        return new WebTarget(handle.name, handle);
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    download(suggestedName, bytes);
    return new WebTarget(suggestedName);
  },

  async saveFileTo(target, bytes) {
    const t = target as WebTarget;
    if (t.file) await writeFile(t.file, bytes);
    else download(t.label, bytes);
  },

  async openFolder(): Promise<OpenedFolder | null> {
    const picker = w().showDirectoryPicker;
    if (picker) {
      try {
        const dir = await picker({ mode: "readwrite" });
        const files: FileTree = new Map();
        await readDir(dir, "", files);
        return { name: dir.name, files, target: new WebTarget(dir.name, undefined, dir) };
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    const file = await inputPick(".zip");
    if (!file) return null;
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const files: FileTree = new Map(Object.entries(entries).filter(([p]) => !p.endsWith("/")));
    return { name: file.name.replace(/\.zip$/i, ""), files, target: new WebTarget(file.name) };
  },

  async chooseFolderTarget(suggestedName) {
    // The File System Access API has no "save folder as <name>" dialog, so the browser
    // build picks a parent folder and uses the suggested name.
    const picker = w().showDirectoryPicker;
    if (picker) {
      try {
        const parent = await picker({ mode: "readwrite" });
        // If the user picked an existing project folder, save into it; otherwise create one inside.
        let dir = parent;
        if (!parent.name.endsWith(".tilestudio")) dir = await parent.getDirectoryHandle(suggestedName, { create: true });
        return new WebTarget(dir.name, undefined, dir);
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    return new WebTarget(suggestedName + ".zip");
  },

  async saveFolderTo(target, files) {
    const t = target as WebTarget;
    if (t.dir) await writeTree(t.dir, files);
    else download(t.label, zipTree(files));
  },
};

function zipTree(files: FileTree): Uint8Array {
  const obj: Record<string, Uint8Array> = {};
  for (const [p, b] of files) obj[p] = b;
  return zipSync(obj);
}
