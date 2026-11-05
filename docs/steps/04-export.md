# Step 04: Export (sheets, .tsx, zip, palette files)

**Branch:** `step/04-export` (from `step/03-import`)

## Draft
- Spec: §Export (zip layout, setup dialog options, extrusion ↔ `.tsx` margin/spacing, fixed slot order), §Palette (file formats).
- `core/export/sheet.ts`: `packSheet` (scale → extrude → place, with padding/spacing) and `renderGrid` for previews.
- `core/export/tsx.ts`: hand-written TSX 1.10 writer. Tile names go out as a `name` property; templated subsets get one `<wangset>` with two `<wangcolor>`s and a `<wangtile>` per filled slot.
- `core/export/index.ts`: `buildExport(project, settings, now)` → path→bytes; `zipFiles`; `validateExport`; `safeName`.
- `core/palette`: read `.gpl`, `.hex`, `.pal` (JASC text and RIFF binary), Lospec JSON; write `.gpl`, `.hex`.

## Check
- Creed: scaling and extrusion run on copies at export time; a test confirms the project is unchanged after an export with every option on. ✅
- Extrusion: `.tsx` `margin = padding + e`, `spacing = spacing + 2e`. A test runs Tiled's own column formula against several scale/padding/spacing/extrusion combinations and checks the first real pixel sits at (margin, margin).
- Layout decisions (not fixed by the spec, documented in CLAUDE.md):
  - Parent "auto" columns = ⌈√n⌉.
  - Unstructured "auto" keeps the user's arrangement and trims trailing empty rows/columns. A fixed column count reflows the trimmed grid row-major.
  - Templates always use their own grid (blob47: 8×6, so 48 cells with one non-slot). Empty slots are transparent and get no `<wangtile>`.
  - Several scales export as `name@2x.png/.tsx` beside the 1× files.
  - With one tileset in scope the files sit at the zip root (the spec's layout); with several, each tileset gets its own folder.
  - Per-tile PNGs are 1× only.
- `manifest.json` lists sheets (files per scale, tile index → id/name), previews and the palette, plus the settings, which Export Again can reuse.

## Built
As drafted.

## Verified
- 20 new tests: packing order and transparency, extrusion/margin consistency against Tiled's formula, extrusion pixels, TSX escaping/element order/Wang output, the spec's exact zip file list, the parent sheet including tiles in no subset, unstructured layout and trimming, the blob47 grid + mixed Wang ids, multiple scales, scope/previews/per-tile options, multi-tileset folders, no project mutation, validation, safe names, palette round-trips (.gpl, .hex), JASC + RIFF .pal, Lospec JSON, junk rejection.
- `npm run typecheck` and `npm test` (62 tests) pass.
- **Not verified:** loading the output into Tiled itself (Tiled isn't installed here). That check is the acceptance step for a human: add `subsets/grass_dirt.tsx` to a map and paint with the terrain brush.
