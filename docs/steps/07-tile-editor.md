# Step 07: Tile editor and drawing tools

**Branch:** `step/07-tile-editor` (from `step/06-shell-ui`)

## Draft
- Spec: §Drawing tools and palette (tool table + shortcuts, pixel-perfect strokes, neighbour context, palette-locked mode), §Screen layout (selecting a tile anywhere opens it; a new tileset opens with a blank tile).
- `core/tools`: Bresenham line, L-corner detection + pixel-perfect path, rectangles, an inscribed ellipse (Zingl), contiguous/global flood fill, lighten/darken, square brush. All pure and tested.
- `ui/panels/EditorPanel.tsx`: canvas at integer zoom with a checkerboard, pixel grid, dimmed neighbour margin, selection marquee; a tool/options toolbar; a footer with the tile name, selection and cursor position.

## Check
- Creed:
  - Every tool acts only on the pixels the user strokes, fills or selects.
  - Pixel-perfect only rewrites pixels of the stroke being drawn, restoring the L-corner pixel to what it was before the stroke, and it can be toggled off.
  - Lighten/darken in palette-locked mode only steps between existing palette colours; a colour not in the palette is left alone, never "snapped".
  - Neighbour context is drawn on the canvas only and is read-only.
- Draft tile (see step 2): with no tile selected, the editor shows a blank draft. The first stroke creates the tile inside the same gesture, so one undo removes both the stroke and the tile. With an empty template slot selected, the first stroke creates the tile *in that slot*, named after the slot (spec: "selects a slot and draws a new tile in it").
- Undo granularity: one gesture = one undo entry (`history.preview` while dragging, `commit` on release; Escape cancels).
- Palette-locked: drawing with a colour outside the palette is refused with a status message. The eraser is always allowed.
- Lighten/darken: left click lightens, right click darkens. Each pixel is shaded at most once per stroke, so hovering doesn't keep shading it.
- Selection + move: drag a rectangle, then drag inside it to move (transparent pixels in the moved block don't overwrite). Ctrl+C/X/V copy, cut and paste between tiles (paste goes to the selection origin or 0,0); Ctrl+A / Ctrl+D select all / deselect; Delete clears the selection, or deletes the tile when nothing is selected.
- Extras beyond the spec table: brush size 1–8 (`[` `]`); pixel-perfect needs size 1. Shift locks square/circle for rectangle/ellipse.

## Built
As drafted. A dev-only `window.__tileStudio` handle (history, ui, actions) is exposed in `npm run dev` builds for inspection; it's stripped from production builds.

## Verified
- 8 new unit tests (77 total): lines, L-corners/pixel-perfect paths, rectangles + square lock, ellipse bounds/symmetry/edge contact for several box sizes incl. 1×1 and thin ones, contiguous vs global fill, plotting on copies, palette/brightness shading (incl. transparent and out-of-palette), brushes.
- In the browser (Chromium, synthetic pointer events, state checked through the dev handle):
  - The first stroke on a new tileset creates `tile_0`, and one Undo removes stroke and tile together.
  - A fast staircase stroke comes out as a clean diagonal.
  - Rectangle outline, contiguous fill (stays inside the outline), select + move (one "Move selection" undo entry), copy → new tile → paste, lighten in RGBA mode, eraser, and the locked-palette refusal message.
  - No console errors.
- The browser pane was hidden during this step, so the visuals (neighbour dimming, marquee, grid) weren't checked by screenshot. They're re-checked in step 10.
- `npm run typecheck`, `npm test` and `npm run build` pass.
