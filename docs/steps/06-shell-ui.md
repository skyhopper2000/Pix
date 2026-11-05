# Step 06: Shell UI

**Branch:** `step/06-shell-ui` (from `step/05-project-io`)

## Draft
- Spec: §Screen layout (editor centre, preview below, project tree / tile bar / palette right; dock/resize/collapse; View › Reset Layout), §Theme (dark default + light, VS Code feel, command palette Ctrl+Shift+P).
- `state/app.ts`: a `ProjectHistory` singleton plus a small UI store (selection, tool, colours, zoom, dialogs, save/export targets). `reconcileSelection` keeps the selection valid after undo/delete/open.
- `state/actions.ts`: New/Open/Save/Save As, New Tileset, import start, export + Export Again, palette import/export, tile/subset/preview commands with confirmations.
- `ui/commands.ts`: one command registry feeds the menus, the command palette and keyboard shortcuts.
- `ui/layout.ts`: flexlayout-react model, persisted in localStorage, resettable.
- Panels: Project tree, Tile bar (parent tiles; drag to reorder; drag source for slots/cells), Palette (primary/secondary with hex + alpha, swatches, add/replace/remove, lock, import/export).
- Dialogs: New Tileset, Rename, New Subset, New Preview, Resize, Terrains, Message, Confirm. The import, export, near-duplicate and custom-template dialogs are stubs until steps 8–9; the editor and preview panels are stubs until steps 7–8.

## Check
- Spec tension: flexlayout has no per-panel "minimise". "Collapse" here means dragging a tab into the left/right/bottom edge strips, which collapse to a tab bar. Panels can also be maximised (double-click a header) or closed and reopened from View › Show …, and Reset Layout restores the default.
- New Tileset doesn't create a tile. The editor shows a draft blank tile (step 7), which matches Jane's step 1 ("tile bar is empty").
- Editing a palette swatch never recolours tiles (creed).
- Destructive actions (delete a tile that's in use, delete a subset or tileset, discard unsaved changes) ask first and can be undone.

## Built
As drafted.

## Verified (in the browser, Chromium, via `npm run dev`)
- Default layout renders with no console errors. New Tileset dialog → the tree shows the tileset; Edit menu enable/disable states are right; New Tile (menu and Ctrl+T) and Undo (Ctrl+Z) work; the status bar and dirty marker in the title update.
- Command palette filters and runs commands with the keyboard. Light/dark theme switching works. Closing a panel and reopening it via View › Show … works, and Reset Layout restores the default.
- Bugs found and fixed: the palette input didn't take focus; arrow/Enter keys were swallowed before reaching the palette (now handled in the capture phase); a closed panel's emptied tabset was used as the anchor when reopening.
- `npm run typecheck`, `npm test` and `npm run build` pass.
- Not verified: Save/Open through the File System Access picker. Native pickers can't be driven from the automated browser; the serialization underneath is unit-tested in step 5.
