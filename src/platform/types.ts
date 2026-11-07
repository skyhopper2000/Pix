/** File-system and dialog access. The rest of the app never touches disk directly. */

export interface FileFilter {
  name: string;
  extensions: string[]; // without dot, e.g. ["png"]
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

/** A virtual folder: relative POSIX paths ("tiles/abc.png") to file contents. */
export type FileTree = Map<string, Uint8Array>;

/**
 * Opaque handle to a previously chosen save location (a path in Tauri, a
 * FileSystemHandle in the browser). Used by Save and Export Again.
 */
export interface SaveTarget {
  readonly label: string;
}

export interface OpenedFolder {
  name: string;
  files: FileTree;
  target: SaveTarget;
}

export interface Platform {
  readonly kind: "tauri" | "web";
  /** Ask the user for one file. Resolves null if cancelled. */
  openFile(filters: FileFilter[]): Promise<OpenedFile | null>;
  /** Ask where to save, then write. Resolves the target, or null if cancelled. */
  saveFileAs(suggestedName: string, filters: FileFilter[], bytes: Uint8Array): Promise<SaveTarget | null>;
  /** Write again to a target returned by saveFileAs. */
  saveFileTo(target: SaveTarget, bytes: Uint8Array): Promise<void>;
  /** Ask for a project folder and read every file under it. */
  openFolder(): Promise<OpenedFolder | null>;
  /**
   * Ask where to save a project folder (nothing is written yet; follow with saveFolderTo).
   * The target's label is the chosen folder name, e.g. "My Game.tilestudio".
   */
  chooseFolderTarget(suggestedName: string): Promise<SaveTarget | null>;
  /** Replace the contents of a previously chosen folder with `files`. */
  saveFolderTo(target: SaveTarget, files: FileTree): Promise<void>;
}
