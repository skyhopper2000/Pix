# Step 02: Core model, ops and undo history

**Branch:** `step/02-core-model` (from `step/01-scaffold`)

## Draft
- Spec: §Data model, §Subsets (types, slots, terrains), §Tech stack (central store + command pattern).
- `core/model.ts`: Project → palette + tilesets; Tileset owns `tiles` (by id) and `tileOrder`; Subset/Preview hold `TileId | null` cells only.
- `core/ops.ts`: pure, immutable operations. Each one returns the same reference when nothing changes, so no-op commands don't create undo entries.
- `core/templates`: blob47 / corner16 / edge16 definitions, Wang ids, slot auto-names, custom-template validation. (Moved here from step 4 because creating a subset needs the slot count.)
- `state/history.ts`: undo/redo by keeping before/after project references; gestures (`preview` … `commit`) produce one entry.

## Check
- Linked tiles: subsets/previews can only reference tiles that exist in the parent (`setSubsetCell` and `setPreviewCells` refuse unknown ids). ✅
- Delete-everywhere: `deleteTiles` clears subset slots and preview cells. ✅
- Creed: `mergeTiles` exists only for the user-confirmed near-duplicate review; nothing calls it automatically. Templates describe slots and never produce pixels. ✅
- Spec tension: "A new tileset opens with one blank tile" vs. Jane step 1 "the tile bar is empty". Resolution: a new tileset starts with **no** tiles, and the editor shows an unsaved *draft* blank tile that joins the parent on the first stroke. This is UI state, done in step 7. Then an import into a fresh tileset doesn't leave a stray blank tile behind.
- Auto-naming of slot tiles only applies to tiles *created* in a slot. Renaming existing tiles on drag would surprise users (a tile can sit in several subsets), so it's an explicit command, `nameTilesFromSlots`.

## Built
As drafted. Key files: `src/core/{model,ids,color,pixels,ops}.ts`, `src/core/templates/index.ts`, `src/state/history.ts`.

## Verified
- 26 unit tests: immutability, linking, delete-everywhere, draw-in-subset joins the parent, slot naming, merge remapping, 47 blob masks, Wang id positions, history undo/redo/gesture/cancel.
- `npm run typecheck` and `npm test` pass.
