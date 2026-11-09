# Step 14: Guided subset filling and clearer custom templates

**Branch:** `step/14-subset-wizard` (from `main`, at the user's request). It also cherry-picks `c9b71fa` ("Repair imports broken by the step 11/12 merge") from `step/13-drag-and-drop`, because `main` doesn't typecheck without it. The change is identical, so merging step 13 later is a no-op for those two lines.

## Draft

Goal: today *New Subset* creates an empty subset and leaves the user to drag tiles in from the parent in the Tiles panel. After this step, *Create* opens a **Fill Subset** wizard. It walks the slots one at a time and the user fills each one by clicking a parent tile. They can skip any slot and go back to any slot later. Also make it clear how to get more slots in a custom template, up to 64.

Spec sections: §Subsets (Filling slots), §Creed.

### Fill Subset wizard (`ui/dialogs/FillSubsetDialog.tsx`)
- Opens straight after *Create* in New Subset (when the parent has tiles), from *Tileset › Fill Subset from Parent…*, and from a new tile-bar button.
- Layout: the subset's slot grid on the left (current slot outlined; click any slot to jump to it). In the middle, the current slot large: its expected-shape guide, its name/directions, and the tile it holds. On the right, the parent tiles; **clicking one puts it in the current slot**.
- After a click, the wizard moves to the next *empty* slot after the current one (wrapping). When every slot is filled it stays put and says so. *Skip* (→) moves to the next slot whether it's empty or not, *Back* (←) to the previous one. *Clear slot* (Del) empties it. *Done* / Esc closes.
- Every assignment is one undoable command (`setSubsetCell`). Ctrl+Z / Ctrl+Y work inside the wizard, since global shortcuts are off while a dialog is open.
- Works for every subset type (unstructured cells too, in reading order).

### Custom templates
- Hard cap of **64 slots** (`MAX_TEMPLATE_SLOTS`). 64 thumbnails and guides is cheap; the cap keeps the editor and the wizard usable. `validateTemplate` reports more than 64 as an error.
- Editor clarity: a live "N / 64 slots" count; **+/− buttons** for columns and rows next to the inputs; *Fill grid* (every cell becomes a slot, up to 64) and *Clear* buttons. Clicking an empty cell adds a slot. Clicking a slot **selects** it to edit its bits (it used to delete it, so you couldn't edit an existing slot without re-adding it). *Remove slot* or right-click removes it.
- **Editing an existing custom subset's template**: *Tileset › Edit Custom Template…* (and a tile-bar button) opens the same editor pre-filled. A new pure op, `setSubsetTemplate`, keeps each tile reference on the slot at the same (col,row). References on removed slots are dropped (the tile stays in the parent). It's undoable.

### Core
- `ops.nextEmptyCell(cells, from)`: index of the next empty cell after `from`, wrapping; `null` if full.
- `ops.setSubsetTemplate(p, tsId, subsetId, template)`.
- `templates.MAX_TEMPLATE_SLOTS`, and the validation above.

### Creed check
The wizard only assigns a tile when the user clicks it. Moving to the next empty slot is navigation, not filling. No slot is ever filled automatically, and no pixels are touched. Editing a template never changes a tile; it only drops references from removed slots.

### Test plan
- Vitest: `nextEmptyCell` (wrap, full, from = null), `setSubsetTemplate` (remap by position, dropped slots, non-custom subsets untouched), 64-slot validation.
- typecheck / test / build.
- Browser: import a sheet, New Subset → 16 corner → the wizard opens; click tiles, skip, go back, jump by clicking a slot, Ctrl+Z, Done. Reopen from the menu. Custom: build an 8×8 template with *Fill grid*, check the 64 cap, create it, fill, then *Edit Custom Template…* to add a column and confirm the tiles stay in place.

### Left out on purpose
- No "suggested" tile for a slot (that would be judging art).
- No multi-select or batch assignment.

## Open questions
- The spec's "Filling slots" paragraph describes drag-and-drop only. The wizard is an extra click path for the same user-driven action, so it was added to the spec paragraph.

## Built

As drafted, plus:
- New Subset's footer has a **"Fill from parent tiles next"** checkbox (on by default, disabled when the parent is empty). The button reads *Create and fill…* while it's on.
- The wizard starts on the first empty slot (or the slot selected in the tile bar when reopened). Tiles already in the subset are dimmed in the parent list, and a name filter helps with large parents. "Expected" reads "all grass" / "all dirt" for the none/all slots.
- Tile bar: **▦** opens the wizard, **⊞** edits a custom template, and the subset hint starts with a *Fill slot by slot…* link.
- The Edit Template dialog warns how many filled slots a change would drop.

Files: `src/core/ops.ts`, `src/core/templates/index.ts` (+ tests), `src/state/app.ts` (dialog kinds), `src/ui/dialogs/FillSubsetDialog.tsx` (new), `src/ui/CustomTemplateEditor.tsx`, `src/ui/Dialogs.tsx`, `src/ui/commands.ts`, `src/ui/panels/TileBar.tsx`, `src/ui/styles.css`, README, spec.

## Verified (2026-11-08)
- `npm run typecheck`, `npm test` (95 passed, 1 skipped), `npm run build`: all pass.
- Browser (`npm run dev`, 1400×900), 20 seeded tiles: New Subset → 16 corner → *Create and fill…* opens the wizard on slot 1. Clicking a tile filled the slot and moved on; Skip, Back, jump by clicking a slot, filling a gap (then skipping the already-filled next slot), Ctrl+Z inside the wizard and Del all behaved as designed. Custom: 8×8 + *Fill grid* = 64/64; adding a column and clicking a new cell stayed at 64 with "Slot limit reached". A 3×2 custom subset with 3 tiles filled, then edited to 4×2 with *Fill grid*: the 3 tiles stayed at (0,0)–(2,0) and the new slots were empty; one undo entry. The tile-bar ▦ button reopens the wizard on the first empty slot. No console errors.
- Not verified: the desktop (Tauri) build and a real mouse pass. Checks used synthetic clicks and keys.
