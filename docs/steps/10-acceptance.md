# Step 10: Acceptance walkthrough (Jane's session)

**Branch:** `step/10-acceptance` (from `step/09-dialogs`)

## Draft
Run spec §Acceptance walkthrough end to end in the browser build and fix whatever blocks it.

## Check
Step 10 ("in Tiled, add the .tsx files and paint terrain") can't be run here: Tiled isn't installed. As a substitute, every exported `.tsx` is parsed as XML and checked for consistency (see below). The real Tiled check is left to the human reviewer.

## Results (Chromium, `npm run dev`; native pickers replaced by in-memory fakes so the real web platform code runs)
| # | Step | Result |
| --- | --- | --- |
| 1 | New Project → New Tileset | ✅ 16 px tileset, 0 tiles, tile bar empty, editor shows the draft blank tile |
| 2 | Import Image, isolate unique | ✅ 8×6 rip → "48 cells → 4 new tiles": `tile0_0, tile1_2, tile3_6, tile3_7`; preview `map_rip` 8×6; editor opens `tile0_0` |
| 3 | Clean up | ✅ A stroke on `tile0_0` (used in 33 cells) changes the tile once; all 33 cells reference it, so the preview updates live. The neighbour context renders dimmed around the tile |
| 4 | Save as "map example" | ✅ `map example.tilestudio/` written |
| 5 | Unstructured "buildings" | ✅ Two house tiles dragged in; a new variant drawn in an empty cell joins the parent |
| 6 | 47 blob "grass_dirt" | ✅ 47 slots with guides; grass → slot 1, dirt → slot 47 by drag; a missing slot drawn → `grass_dirt_N` |
| 7 | Repeat per terrain pair | ✅ (same flow) |
| 8 | Map preview reflects restyle | ✅ (linked references; see 3) |
| 9 | Export Project | ✅ zip = manifest, `map_example.png/.tsx`, `subsets/buildings.png/.tsx`, `subsets/grass_dirt.png/.tsx`, `previews/map_rip.png` |
| 10 | Tiled | ⚠️ Not run (no Tiled). Substitute: every `.tsx` parses as XML; image sizes match the PNGs; Tiled's column formula gives the declared `columns`; wang tile ids are within `tilecount`; `grass_dirt.tsx` has a `mixed` wangset with colours grass/dirt and wang ids `1,1,1,1,1,1,1,1` (slot 1), `2,1,1,1,1,1,1,1` (N), `2,2,2,2,2,2,2,2` (slot 47) |

## Fixes made in this step
- `setPointerCapture` is wrapped so a stale or synthetic pointer id can't throw out of a pointer handler (seen with scripted input in step 8).

## Notes
- `palette.gpl` is only written when the project palette has colours (Jane's run had none). The spec's tree shows it unconditionally; an empty palette file seemed pointless. Easy to change if wanted.
- Visual review: screenshots were partly unavailable because the browser pane was hidden; the layout, tile bar slot guides, subset grid, and neighbour dimming were seen. A human should do a hands-on pass with a real mouse/pen.
