# Step 03: Import (PNG codec, slicing, dedupe)

**Branch:** `step/03-import` (from `step/02-core-model`)

## Draft
- Spec: §Import (dialog settings, unique-tile detection, naming, re-import).
- `core/png.ts`: an exact PNG encoder/decoder, so tile files and imported PNGs never pass through a canvas (canvas decoding can apply colour management and premultiplied-alpha rounding, which would change the user's pixels).
- `core/import`: `gridDims`, `validateImport`, `sliceImage` (pure, returns new tiles + preview + colours), `applyImport`, `findNearDuplicates` (proposals only), `previewNameFromFile`.

## Check
- Creed: slicing is a crop. Exact dedupe compares bytes (alpha-0 pixels count as equal). Flipped/rotated copies stay separate (test). Near-duplicates are only *returned as groups*; merging is `ops.mergeTiles`, which only the review panel will call, on a user click. Palette extraction reads colours and never writes pixels (test).
- Defaults (not in the spec): *Isolate unique* on (Jane's flow); **Include empty on**, because a solid single-colour tile (plain grass) counts as "empty" by the spec's definition, and dropping it by default would leave holes in her map; *Extract palette* off.
- Re-import: dedupe against existing tiles happens when *Isolate unique* is on (with it off, the user asked for every cell as its own tile). New tiles are appended and the image becomes an additional preview.
- One tile size per tileset: import may set the size only while the tileset has no tiles; otherwise it must match.
- Only square grids are accepted (iso/hex is a stretch goal; see Open decisions).
- Palette extraction stops after 1024 colours so a JPEG rip can't flood the palette. The UI should say when this happens.

## Built
As drafted.

## Verified
- 16 new tests: PNG RGBA round-trip (random data, odd sizes), palette+tRNS / RGB / grey / grey+alpha decode, non-PNG rejection; slicing with offset/spacing, unique isolation + naming, isolate off, flip not merged, empty skip, re-import dedupe + second preview, palette extraction, validation, empty tileset adopting the size, near-duplicate grouping.
- `npm run typecheck` and `npm test` (42 tests) pass.
- Not covered: interlaced PNGs (rejected with a clear error; the UI will fall back to the browser decoder for those and for non-PNG formats).
