# Step 15: Final v2 fixes (colour swap, Preferences)

**Branch:** `step/15-v2-final-fixes` (from `main`, after steps 13 and 14 were merged). The user called this the last step of v2.

## Draft

Goal: small quality-of-life fixes from hands-on use.

1. **Swap colours on screen.** Swapping primary/secondary was only reachable through `X` or *Tools › Swap Colors*. Add a visible *⇅ Swap* button between the Primary and Secondary editors in the Palette panel, with a one-line note that left-click draws primary and right-click draws secondary.
2. **Edit › Preferences…** (`Ctrl+,`). One dialog for settings that were scattered across menus or not settable at all:
   - Appearance: light/dark mode toggle; UI font size slider (80–160 %).
   - Drawing: pixel-perfect strokes; slot guides.
   - Preview: preview grid; highlight uses of the selected tile.
   - Keyboard shortcuts: every listed command, with its current shortcut. Click, press keys to rebind; ✕ removes, ↺ restores the default; *Restore all defaults*; a filter box.

### Design
- `src/state/prefs.ts`: the `Prefs` shape, defaults, `loadPrefs` (validates everything, clamps the font scale, migrates the old `tilestudio.theme` key) and `savePrefs` (localStorage key `pix.prefs`).
- Preferences stay ordinary fields of the UI store (`theme`, `pixelPerfect`, `previewGrid`, `highlightUses`, `slotGuides`, new `fontScale` and `shortcuts`), so the existing menu toggles keep working and stay in sync. A store subscriber writes them out when any of them changes.
- Shortcuts: the command registry keeps the defaults; `ui.shortcuts` holds overrides by command id (`""` = none). `shortcutOf(c)` resolves one, and `findShortcut`, the menus and the command palette all use it. Binding keys already used by another command removes them from that command and says so. Hidden aliases (`Ctrl+Shift+Z` redo) are not listed.
- Font size: every `font-size` in `styles.css` (and the flexlayout font variable) is `calc(Npx * var(--font-scale))`; App sets `--font-scale` on `<html>`. Canvas zoom is untouched, so pixel maths is unaffected.

### Creed check
UI settings only. Nothing touches tile pixels.

### Left out on purpose
- No per-panel font sizes, no export of preferences to a file, no multi-key chords.

## Built

As drafted. The dialog captures keys in the capture phase while waiting for a combination, so Esc cancels the capture instead of closing the dialog, and global shortcuts don't fire. A lone modifier keeps waiting.

Files: `src/state/prefs.ts` (new), `src/state/app.ts`, `src/ui/dialogs/PreferencesDialog.tsx` (new), `src/ui/Dialogs.tsx`, `src/ui/commands.ts`, `src/ui/MenuBar.tsx`, `src/ui/App.tsx`, `src/ui/panels/PalettePanel.tsx`, `src/ui/styles.css`, README, CLAUDE.md.

## Verified (2026-11-09)
- `npm run typecheck`, `npm test` (95 passed, 1 skipped), `npm run build`: all pass. An earlier full run, while the machine was very slow, failed two core tests (`pixels` region helpers, `tools` ellipse); they passed alone and on the rerun. This step doesn't touch `src/core`.
- Browser (`npm run dev`): the Swap button swapped `#000000`/`#ffffff` and the hint shows. *Edit* menu lists *Preferences… Ctrl+,*; the dialog opens with 61 commands. Rebinding Swap Colors to `B` removed `B` from Pencil with a note. Light mode, 130 % font (body 15.6 px) and highlight uses applied at once; after a reload all three persisted and `B` swapped colours without changing the tool. Preferences were reset to defaults afterwards.
- Not verified: the desktop (Tauri) build and a real mouse/keyboard pass; checks used synthetic events.
