# Step 13: Fix drag-and-drop in the desktop app

**Branch:** `step/13-drag-and-drop` (from `main` at `0ed1fda`, which has steps 11 and 12 merged)

## Draft

Goal: drag-and-drop must work in the desktop build, at least for subset arrangement (parent tile → slot, slot ↔ slot) and for docking the panel tabs (Tile Editor, Preview, Project, Tiles, Palette).

### Cause
Both features use HTML5 drag-and-drop: `SubsetGrid` / `TileBar` / `PreviewPanel` through `dragTile` / `readDrag`, and `flexlayout-react` 0.11 for tab docking (it sets `text/plain` data and a drag image). In the browser build both work. In the Tauri build they don't: by default Tauri 2 installs its own drag-drop handler on the webview (to emit `DragDropEvent`s for OS file drops), which on Windows replaces WebView2's handler and stops HTML5 drag events from reaching the page. The Tauri config schema says so: disabling `dragDropEnabled` "is required to use HTML5 drag and drop on the frontend on Windows".

### Changes
1. `src-tauri/tauri.conf.json`: `"dragDropEnabled": false` on the main window. Pix never listens for Tauri's drag-drop events, so nothing is lost.
2. `src/ui/App.tsx`: with WebView2 handling drops itself, a file dragged in from Explorer and dropped on a spot that doesn't handle it would navigate the webview to that file and replace the app. A window-level `dragover`/`drop` listener cancels drags that carry `Files`; in-app drags (tile ids, flexlayout tabs) are untouched.
3. Merge repair on `main`: the step 11 + 12 merge left `importClient.ts` importing `./decodeImage` (moved to `src/platform/` in step 11) and `ImportDialog.tsx` importing `decodeImage` instead of `ImportSession` / `LoadedImage` from `../importClient`. `main` didn't typecheck, so `npm run build` and `npm run tauri build` failed. Both imports are restored to what the code uses.

## Check
- Creed: no pixels involved; drag-and-drop only moves tile references.
- Architecture: no new dependencies; no core changes.
- Kept out on purpose: dropping an image file onto the window to import it. That would be a new feature (and would need either Tauri's handler or HTML5 `Files` drops handled in the UI); for now external file drops are ignored.

### Open questions
- None.

## Verification
- `npm run typecheck`, `npm test` (92 passed, 1 skipped), `npm run build`: pass.
- Browser (`npm run dev`), synthetic `DragEvent`s with a real `DataTransfer`: parent tile → subset cell fills the cell; cell → empty cell moves the tile; dragging the Palette tab onto the Tile Editor tab bar docks it there; a `Files` drag over/drop on the page is cancelled while a `text/plain` drag isn't.
- `npm run tauri build`: builds. **Not verified by an agent:** an actual mouse drag in the desktop window. Native drags can't be driven from here; this needs a hands-on check.
