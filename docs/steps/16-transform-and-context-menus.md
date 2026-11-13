# Step 16: Flip / rotate and right-click menus (v2.5)

**Branch:** `step/16-transform-and-context-menus`, stacked on `step/15-v2-final-fixes` (not yet merged). First step of v2.5: small changes before the stretch goals.

## Draft

1. **Flip tool** in the tile editor toolbar: flip horizontal and vertical.
2. **Rotate tool** in the tile editor toolbar: a quarter turn clockwise or counter-clockwise.
   Both act on the selection, or on the whole open tile when nothing is selected. The user asked that they be geometric only, so they don't break the creed.
3. **Right-click menus**
   - *Tiles* panel, on a parent tile: Rename Tile…, Delete Tile.
   - *Project* panel, on a tileset: Rename…, New Subset…, Export Tileset….
   - *Project* panel, on a subset: Rename…, Export Subset…. Subsets can't hold subsets, so there's no New Subset here.

### Design
- `src/core/tools/transform.ts` (pure): `flipH`, `flipV`, `rotateCW`, `rotateCCW` are index permutations. `transformedRect` gives the region's new rect. `transformRegion` applies a transform to a region of a tile and returns a new buffer.
- Rotating a w×h region gives h×w around the same centre. `Math.trunc` keeps CW→CCW and 4×CW on the starting rect. The result is then nudged inside the tile. If it can't fit (a whole non-square tile, or a selection longer than the tile's other side), nothing happens and the status bar says why. Pixels are never clipped.
- Placing the result works like a moved selection: the old area is cleared, then the transformed pixels are placed. Transparent pixels outside the old area let what's underneath show through. For flips and square regions this is an exact in-place permutation.
- The UI is an `editorBridge.transform(t)` set by `EditorPanel`. There are four toolbar buttons (↔ ↕ ↺ ↻). There are also Edit-menu commands `edit.flipH` (`Shift+H`), `edit.flipV` (`Shift+V`), `edit.rotateCW` (`R`) and `edit.rotateCCW` (`Shift+R`), which can be rebound in Preferences. Each transform is one `history.dispatch`, so one undo entry. The bridge reads the tile fresh from `history.project`, so two transforms in one tick don't both start from the last render.
- `src/ui/ContextMenu.tsx`: `useContextMenu()` plus a `<ContextMenu>` portal at the pointer, styled like the menu bar dropdowns. It is kept on screen, and closes on outside click, Escape, wheel, resize or blur.
- `A.deleteTileById(id)` was split out of `deleteActiveTile`, so the menu can delete a tile that isn't open. It keeps the confirm-when-used dialog.
- `A.exportSet(id)` opens the export dialog with a preset scope: a tileset is `[tileset, ...its subsets]`, a subset is `[subset]`. The dialog gets `scope` and `title` props. Other settings still come from the last export.
- New Subset from a tileset's menu first makes that tileset active, because the New Subset dialog adds to the active tileset.

### Creed check
Flip and rotate run only on a click or key from the user, on the region the user chose. Every output pixel is a byte-exact copy of an input pixel; nothing is generated, blended or recoloured. A unit test checks the permutation property. Flipped and rotated copies are still never detected. The menus only reach existing commands.

### Left out on purpose
- No flip or rotate across several tiles at once, and no free-angle rotation (it would resample pixels).
- No right-click menus on previews, subset slots (they already remove the tile on right-click) or the project name. Delete is not added to the Project menus, because the existing × buttons cover it.
- Pixel-art icons for flip and rotate. Text glyphs are used until the user draws icons.

## Built

As drafted. Files: `src/core/tools/transform.ts` + `transform.test.ts` (new), `src/core/tools/index.ts`, `src/ui/ContextMenu.tsx` (new), `src/ui/panels/EditorPanel.tsx`, `TileBar.tsx`, `ProjectTree.tsx`, `src/ui/commands.ts`, `src/ui/Dialogs.tsx`, `src/ui/dialogs/ExportDialog.tsx`, `src/state/actions.ts`, `src/state/app.ts`, `src/ui/styles.css`, README, CLAUDE.md.

## Verified (2026-11-12)
- `npm run typecheck`, `npm test` (103 passed, 1 skipped), `npm run build`: all pass. The build's chunk-size warning was already there.
- Browser (`npm run dev`), on a 4×4 tile with a unique colour per pixel:
  - Flip H/V and rotate CW/CCW buttons moved pixels as expected.
  - 4×CW and flip-V twice gave back the original bytes, and each click was one undo entry.
  - `Shift+V` flipped the tile.
  - A 3×1 selection rotated CW to 1×3 at the same centre, with the old cells cleared and the selection following.
- Right-click menus:
  - Tile *Delete* removed the tile, and *Rename* opened the dialog; typing a name and pressing Enter renamed it.
  - Tileset *New Subset* on a non-active tileset activated it and opened the dialog.
  - *Export Tileset* opened "Export Tileset …" with the tileset and its subset ticked. *Export Subset* ticked only the subset.
  - Subset and tileset *Rename* opened the right dialogs, and Escape closed a menu. There were no console errors.
- Not verified:
  - The export run through to a saved zip from these menus (it uses the existing export path).
  - The desktop (Tauri) build: whether WebView2 shows Pix's menu rather than its own.
  - A real mouse pass. Checks used synthetic events.
