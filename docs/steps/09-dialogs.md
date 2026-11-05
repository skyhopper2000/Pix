# Step 09: Import, near-duplicate review and export dialogs

**Branch:** `step/09-dialogs` (from `step/08-subsets-previews`)

## Draft
- Spec: §Import (dialog settings table, unique detection, near-duplicate review panel, naming, re-import), §Export (setup dialog table, Export Again).
- `ui/decodeImage.ts`: PNGs go through the exact core decoder. Other formats and interlaced PNGs use the browser with `colorSpaceConversion: "none"` and `premultiplyAlpha: "none"`, and the dialog says so.
- `ImportDialog`: source preview with the slicing grid drawn over it; every setting from the spec table; a live dry-run summary (cells → new tiles / reused / skipped / colours); an optional "then review near-duplicates" step with a threshold.
- `NearDupDialog`: threshold (% of differing pixels); groups side by side with use counts and % difference; pick the survivor, then **Merge** or **Keep all**.
- `ExportDialog`: every option from the spec table, incl. per-tileset/subset scope. It remembers the last settings; Export Again (Ctrl+Shift+E) reuses settings and path.

## Check
- Creed:
  - Import never changes pixels (exact decoder for PNG).
  - Near-duplicates merge only on a per-group click; the default survivor is the first tile, but nothing happens until the user presses Merge.
  - Merges and imports are undoable.
- Jane step 2: after import the editor opens the first tile of the image (`tile0_0` on a fresh tileset), and the preview panel shows the rebuilt rip.
- Tile size can only change while the tileset is empty (one size per tileset); the dialog explains why the field is locked.
- Iso/hex are visible but disabled (stretch goal, see Open decisions).
- The palette-extraction cap (1024) is reported in the summary and the status bar.

## Built
As drafted.

## Verified (Chromium; native pickers replaced by in-memory fakes so the real web platform code runs)
- Import of a generated 4×3 map rip with 4 px tiles: the dialog summary reads "12 cells → 3 new tiles"; tiles are `tile0_0, tile0_2, tile1_3`; the tileset adopts 4×4; preview `map_rip` is 4×3; `tile0_0` is open. The near-duplicate dialog then opens.
- Near-duplicates: at 10% there's no group (the pair differs by 12.5%); at 15% the group `tile0_0 / tile1_3` appears; Merge leaves 2 tiles, remaps the map cell to `tile0_0`, and records an undo entry.
- Export: 1× + 2× with 1 px extrusion gives the spec's file list plus `@2x` files; `grass_dirt@2x.tsx` has tilewidth 8, margin 1, spacing 2, 40 px image (consistent with Tiled's formula). Ctrl+Shift+E rewrote to the same target.
- Save → `MyGame.tilestudio/{project.json, tiles/<id>.png}`; the dirty flag clears; re-open restores tilesets, tiles, subsets and previews; deleting a tile and saving prunes its PNG.
- No console errors. `npm run typecheck`, `npm test` (79) and `npm run build` pass.
