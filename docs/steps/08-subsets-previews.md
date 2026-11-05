# Step 08: Subsets and previews UI

**Branch:** `step/08-subsets-previews` (from `step/07-tile-editor`)

## Draft
- Spec: §Subsets (filling slots, faint slot diagrams, terrains, unstructured layout, subset previews), §Map preview (draw edits the tile under the cursor everywhere, Stamp, Clear, grid, zoom, highlight uses, PNG at any integer scale), §Screen layout (templated subset → tile bar shows the slot grid with empty slots outlined).
- `ui/panels/SubsetGrid.tsx`: cells or template slots placed on the template grid, plus drag-and-drop (parent → slot sets a reference; slot → slot swaps), click to open/select, right-click to take a tile out of the subset.
- `ui/WangGuide.tsx`: the 3×3 expected-shape overlay for slots (`guideRegions` is unit-tested).
- `ui/panels/PreviewPanel.tsx`: preview picker (map + subset previews), Draw/Stamp/Clear modes, grid, highlight uses, zoom, resize, Export PNG (1–8×), drag a tile from the tile bar onto a cell to stamp it.
- `ui/CustomTemplateEditor.tsx`: Wang type, grid size, click cells to add/remove slots, click corners/edges to switch terrain A/B.

## Check
- Creed:
  - Slots are filled only by the user (drag or draw). Empty slots show the guide as a canvas overlay; it is never written into a tile and can be turned off (View › Slot Guides).
  - "Remove from subset" leaves the tile in the parent.
  - Nothing auto-detects which parent tile fits which slot.
- Linked tiles: subset cells and preview cells are references. Drawing on the preview edits the referenced tile, so every place it appears updates live (one undo entry per stroke, even when it spans several tiles).
- Draw mode on the preview supports pencil, eraser, lighten/darken, fill (within one tile) and picker. Shape and selection tools just open the clicked tile in the tile editor, since a shape spanning several linked tiles would be confusing.
- Selecting a subset switches the preview panel to that subset's own preview. Neighbour context follows whichever preview is active.
- Custom templates: every bit is user-set; validation blocks overlapping slots and positions the chosen Wang type doesn't use.

## Built
As drafted.

## Verified (Chromium, synthetic pointer/drag events, state checked via the dev handle)
- Stamp drag fills cells, a second tile stamps, Clear empties; undo labels "Stamp" / "Clear cells".
- A pencil stroke across cells [a][a][b] changes both tiles correctly (tile `a` once, though it appears twice), as one "Draw on preview" entry.
- New Subset → 16 corner: 16 slots with guides; the preview switches to the subset preview.
- Dragging parent tile `b` into slot 6 sets a reference. Selecting empty slot 2 and drawing creates `grass_dirt_NE` in the slot and the parent; Undo removes it from both. Right-click removes from the subset while the tile stays in the parent.
- Custom template: adding a slot and flipping its top-left bit gives wang ids `01010101` / `01010102`.
- Neighbour context finds the tile's cell in the active preview.
- 2 new unit tests (79 total). `npm run typecheck`, `npm test` and `npm run build` pass.
- Visual check (screenshots) is deferred to step 10, because the browser pane was hidden.
