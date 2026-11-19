# Step 17: Tile layers (v2.5)

**Branch:** `step/17-tile-layers`, stacked on `step/16-transform-and-context-menus` (not yet merged).

## Goal

A layers system for the tile editor that fits the current architecture instead of replacing it: a tool in the builder's toolbox, not a new thing to manage. The human named two needs: **non-destructive drawing** (keep outline, fill and shading apart inside one tile) and **reference / tracing**.

## Ideas considered

All four keep one rule: **`tile.pixels` stays the flattened image.** About 20 places read it (export, exact dedupe, near-duplicates, tile bar, subset grid, previews, the project folder's `tiles/<id>.png`). If they keep reading a correct composite, none of them change.

### A. Tile Layers (chosen)

Each tile can hold its own ordered stack of named layers, like Aseprite. `Tile.layers?` is optional: a tile without it is one implicit layer, so imports, old projects and simple tiles are untouched. The editor draws into the active layer, and every edit recomputes `tile.pixels`.

- ✅ Familiar. Solves non-destructive drawing directly. Sketch layers give tracing too.
- ⚠️ Each tile manages its own list. That is fine for the handful of tiles where you want layers, but would be a chore if every tile had to have them, so layers are opt-in per tile.

> **Pause: a new avenue.** Per-tile stacks scale with the tile count (200 tiles, 200 stacks). What if the reference need is met without storing anything at all?

### B. Tracing Paper

An overlay-only reference in the editor: pin another tile, the slot's Wang guide or the clipboard at some opacity, under or over the drawing. It lives in UI state, never enters the project, and reuses the neighbour-context render path.

- ✅ Smallest change, plainly creed-safe (an overlay, like the slot guide).
- ⚠️ Covers tracing only, not non-destructive drawing.

> **Pause: a new avenue.** Instead of per-tile lists, define the layers once and let a "guide" be one kind of layer.

### C. Tileset Passes

The tileset owns one ordered list of passes (base, shade, outline, sketch…). Every tile has an optional buffer per pass. Hiding a pass hides it everywhere (editor, tile bar, map preview), so you can look at the whole set without outlines. A pass marked *guide* shows while drawing and never exports.

- ✅ No per-tile admin. A map-wide "outline off" view is a unique tileset-level tool.
- ⚠️ Forces one structure on every tile, even ones that don't need it.

> **Pause: a new avenue.** Pix's strength is linked tiles: each tile exists once and is referenced everywhere. Could a layer be a link?

### D. Linked Layers

A layer can be a live reference to another tile (a shared grass base, a shared outline). Redraw the base and every tile that links it updates.

- ✅ Strong reuse; matches "each tile exists once".
- ⚠️ Needs dependency propagation, cycle checks and rules for deleting a linked tile. "Shared bases" wasn't one of the named needs, so it's parked.

## Decisions (human, 2026-11-12)

- Build **A. Tile Layers**.
- Flattening layers for display and export is allowed under the creed.
- Each layer has a **blend mode**: **Replace** (default: any non-transparent pixel on a higher layer replaces what's below, alpha included, so every output pixel is one the user drew) or **Normal** (standard alpha blend, opt-in). Users expect blending and may pick colours on purpose by stacking alpha. Saved in the project, because it changes the output.
- **Visibility is view-only.** The composite and the export always include every layer. Hidden and locked are session UI state: not undoable, not saved.
- Drawing tools, select / move / cut / delete selection, paste and flip / rotate act on the **active layer**. The colour picker and Copy read the flattened tile.
- Drawing in the **map preview** writes to the **bottom (base) layer**.
- A new docked **Layers** panel. v1 commands: add, delete, rename, move up / down, duplicate, lock, show / hide, blend mode.

## Design

- `core/model.ts`: `BlendMode = "replace" | "normal"`, `Layer { id, name, blend, pixels }`, `Tile.layers?: Layer[]` (bottom → top). Invariant: when present, `layers.length >= 2` and `pixels = flattenLayers(layers)`. Deleting down to one layer drops `layers` and the survivor's pixels become `tile.pixels`.
- `core/layers.ts` (pure): `flattenLayers`, `layersOf` (an implicit single layer for plain tiles, id = `IMPLICIT_LAYER`), `layerIndex`, `layerPixels`, `withLayers` (recomputes the composite and applies the collapse rule).
- `core/ops.ts`: `setLayerPixels`, `addLayer`, `deleteLayer`, `renameLayer`, `moveLayer`, `duplicateLayer`, `setLayerBlend`. `setTilePixels` / `setManyTilePixels` on a layered tile write the **base layer**, which is how preview strokes land on the base. `duplicateTile` copies layers with new ids.
- `core/project-io`: `tiles/<id>.png` stays the composite (readable folder, recovery copy). Layers go to `layers/<tileId>/<layerId>.png`, listed in `project.json` as `tiles[].layers: [{ id, name, blend }]`. The format version is written as 2 only when some tile has layers, so older builds refuse the file instead of silently dropping layers; version-1 files load as before. A missing or unreadable layer file loads the tile unlayered from its composite, with a warning.
- State: `ui.layerId` (active; `null` = the top layer), `ui.hiddenLayers`, `ui.lockedLayers`.
- UI: `ui/panels/LayersPanel.tsx`, a dock tab next to Palette. Rows top-first: eye, lock, name (double-click renames), blend dropdown (not on the bottom row). Buttons: add, duplicate, up, down, delete. `EditorPanel` shows only the visible layers and draws into the active one.

### Creed check

Layers only hold pixels the user drew. Flattening is a display / export step the human approved. Replace never invents a colour. Normal can produce mixed colours, but only on a layer the user switched to Normal, and the human decided this is allowed. Nothing merges layers automatically.

### Left out on purpose

- Merge down / flatten, layer opacity, linked layers (idea D), tracing paper (idea B) and tileset passes (idea C) as possible follow-ups.
- Moving a selection across layers; pasting as a new layer.
- Saving hidden / locked state.

## Test plan

- Vitest: `flattenLayers` (both modes, alpha 0 / 255 / partial, order), each layer op (immutability, composite recomputed, collapse to one), `setTilePixels` on a layered tile writes the base, `duplicateTile` copies layers with new ids, project-io round trip (v1 unchanged, v2 with layers, missing layer file).
- Browser: add / reorder / rename / delete layers, draw on an upper layer, tile bar and preview show the composite, Replace vs Normal on a semi-transparent pixel, hide and lock, undo / redo, preview drawing lands on the base layer, save + reopen, export.

## Open questions

- ~~Should a hidden layer dim (rather than vanish) in the editor?~~ Decided (human, 2026-11-18): it vanishes. The tile bar and previews still show the full composite.

## Built

- `core/layers.ts`, the layer ops in `core/ops.ts`, the `Layer` / `BlendMode` model types, and project-io format v2 (`layers/<tileId>/<layerId>.png`, version 2 written only when needed).
- Save prune in `platform/web.ts` and `platform/tauri.ts` always covers `layers/`, so a tile that goes back to one layer doesn't leave stale files behind.
- State: `ui.layerId`, `ui.hiddenLayers`, `ui.lockedLayers`, `activeLayer()`. `openTile` resets the active layer to the top layer. Layer actions live in `state/actions.ts`. Hidden/locked flags follow the base layer when its id changes (plain ↔ layered).
- UI: `ui/panels/LayersPanel.tsx` (a tab beside Palette in the default layout; *View › Show Layers* for saved layouts), a *Layer* menu (New, Duplicate, Rename…, Delete, Move Up/Down, Hide, Lock; no default shortcuts, all bindable in Preferences), and the active layer's name in the editor footer. `EditorPanel` draws, selects, cuts, pastes, clears and transforms on the active layer; the picker and Copy read the composite. Locked or hidden active layers block edits with a status message. `PreviewPanel` strokes start from the base layer.

## Verified

- `npm run typecheck`, `npm test` (117 passed, 1 skipped; 14 new tests in `layers.test.ts` and `project-io.test.ts`) and `npm run build` all pass.
- Browser (`npm run dev`, synthetic pointer events through `window.__pix`): drew on a new tile, added a layer, painted alpha-128 blue over red. Replace gives `0,0,255,128` and Normal gives `127,0,128,255` in the composite. Lock blocks drawing with a status message. Hiding the top layer changes the editor canvas pixel (`127,0,128` → `255,0,0`) but not the composite. Undo/redo of the blend change, rename, duplicate, move and delete all worked. A map-preview stroke landed on the base layer and left the top layer untouched. No console errors.
- Not verified by an agent: saving and reopening through the native/File System Access dialogs (covered by the project-io round-trip tests), a real mouse, and the Tauri build.
