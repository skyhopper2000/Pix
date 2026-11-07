import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir, readDir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import { PROJECT_EXT } from "../core/project-io";
import type { FileTree, OpenedFile, OpenedFolder, Platform, SaveTarget } from "./types";

/**
 * Tauri 2 implementation (native dialogs + plugin-fs).
 * NOTE: not yet exercised in a compiled build; see CLAUDE.md.
 */

class PathTarget implements SaveTarget {
  constructor(readonly path: string) {}
  get label() {
    return basename(this.path);
  }
}

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const joinPath = (a: string, b: string) => a.replace(/[\\/]+$/, "") + "/" + b;
const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")));

async function readTree(dir: string, prefix: string, out: FileTree) {
  for (const e of await readDir(dir)) {
    const full = joinPath(dir, e.name);
    if (e.isDirectory) await readTree(full, prefix + e.name + "/", out);
    else if (e.isFile) out.set(prefix + e.name, await readFile(full));
  }
}

async function writeTree(root: string, files: FileTree) {
  const existing: FileTree = new Map();
  await mkdir(root, { recursive: true });
  await readTree(root, "", existing);
  for (const [rel, bytes] of files) {
    const full = joinPath(root, rel);
    await mkdir(parentOf(full), { recursive: true });
    await writeFile(full, bytes);
  }
  const managed = new Set([...files.keys()].filter((p) => p.includes("/")).map((p) => p.slice(0, p.lastIndexOf("/"))));
  for (const rel of existing.keys()) {
    const slash = rel.lastIndexOf("/");
    if (files.has(rel) || slash < 0 || !managed.has(rel.slice(0, slash))) continue;
    await remove(joinPath(root, rel));
  }
}

export const tauriPlatform: Platform = {
  kind: "tauri",

  async openFile(filters): Promise<OpenedFile | null> {
    const path = await open({ multiple: false, directory: false, filters });
    if (typeof path !== "string") return null;
    return { name: basename(path), bytes: await readFile(path) };
  },

  async saveFileAs(suggestedName, filters, bytes) {
    const path = await save({ defaultPath: suggestedName, filters });
    if (!path) return null;
    await writeFile(path, bytes);
    return new PathTarget(path);
  },

  async saveFileTo(target, bytes) {
    await writeFile((target as PathTarget).path, bytes);
  },

  async openFolder(): Promise<OpenedFolder | null> {
    const path = await open({ multiple: false, directory: true });
    if (typeof path !== "string") return null;
    const files: FileTree = new Map();
    await readTree(path, "", files);
    return { name: basename(path), files, target: new PathTarget(path) };
  },

  async chooseFolderTarget(suggestedName) {
    // A Save dialog (not a folder picker) so the user can type the project's name.
    // The chosen path becomes the project folder itself.
    const path = await save({
      title: "Save project as",
      defaultPath: suggestedName,
      filters: [{ name: "Tile Studio project", extensions: [PROJECT_EXT.slice(1)] }],
    });
    if (!path) return null;
    return new PathTarget(path.endsWith(PROJECT_EXT) ? path : path + PROJECT_EXT);
  },

  async saveFolderTo(target, files) {
    await writeTree((target as PathTarget).path, files);
  },
};
