# Step 12: Faster, leaner import for large images

**Branch:** `step/12-large-image-import` (from `main`, at the user's request; not stacked on `step/11-v1-adjustments`)

## Draft

Goal: make File › Import Image fast and memory-lean on big map rips (4096×4096 and up) without changing a single imported pixel.

### How import worked (analysis)

Pipeline: platform reads bytes → `ImportDialog` → `decodeImage` → `decodePng` (or the browser canvas for non-PNG) → `SourcePreview` + a `sliceImage` dry run **on every settings change** → *Import* runs `sliceImage` again → `applyImport` adds tiles one by one with `ops.addTile`.

N = image pixels, Z = compressed bytes, T = pixels per tile, C ≈ N/T cells, U = new unique tiles, E = existing tiles.

| Stage | Time | Peak extra memory | Problem |
| --- | --- | --- | --- |
| `decodePng` | O(N), high constant | IDAT concat (Z) + inflated (~4N) + unfiltered copy (~4N) + RGBA (4N) ≈ 12N + 2Z | Whole stream held at once; per-sample closure; filter switch inside the byte loop |
| `SourcePreview` | O(N) + O(C) strokes | pixel copy (4N) + canvas (4N) | Needless copy; one rect per cell |
| `sliceImage` | O(N + E·T) | `crop` of **every** cell (4N), even duplicates | Per-pixel bounds checks; 4 multiplies per pixel to hash; existing tiles re-hashed per call |
| Dry run | the above per keystroke, then again on Import | 4N garbage each time | Toggling an option re-scans every pixel |
| `applyImport` | **O(U·(E+U))** | U copies of the tile map | `addTile` spreads the whole `tiles` object for each new tile |
| All of it | — | — | On the UI thread: the app freezes |

### Changes
1. `core/png.ts`: streaming decode. IDAT chunks go to fflate's `Unzlib` as they're read; each scanline is unfiltered (one tight loop per filter type) and expanded straight into the RGBA output; fast paths for 8-bit RGBA / RGB / palette. Rejects images over 2^27 px and truncated data with clear errors. Peak ≈ 4N + Z + 2 scanlines.
2. `core/pixels.ts`: `hashRegion`, `regionEquals`, `isEmptyRegion` read cells in place through a 32-bit view (byte fallback for unaligned buffers / big-endian). `hashPixels` uses the same per-pixel hash, so `hashRegion(src, …) === hashPixels(crop(src, …))`. `crop` copies whole rows when the region is inside the image.
3. `core/import`: `scanCells` (per-cell hash + empty flag, cached by geometry), `indexTiles`, and an optional `SliceCache` for `sliceImage`. Only cells that become new tiles are copied.
4. `core/ops.ts`: `addTiles`, used by `applyImport`: O(E + U).
5. `ui/import.worker.ts` + `ui/importClient.ts`: decode, scan and slice in a module worker. The dialog gets an `ImageBitmap` to draw; on Import the result comes back with tile buffers transferred. The worker keeps the last dry run so Import with unchanged settings doesn't slice again. Non-PNG and interlaced files are decoded by the browser on the UI thread (it needs the DOM) and then handed to the worker.
6. `ImportDialog`: debounced (150 ms) dry run in the worker, "Slicing…" / "Importing…" states, grid drawn as rows + cols lines in one path, and only the outer outline when cells are under 4 screen px (per-cell lines used to paint large images solid blue).

## Check
- Creed: nothing here generates or alters pixels. Slicing is still a crop, dedupe still exact (alpha-0 pixels compare equal, as before). The new decoder is tested byte-for-byte against the old one.
- Architecture: `src/core` stays pure (the worker is UI glue and only imports core). No new dependencies (`fflate` streaming API was already available).
- Behaviour changes, on purpose: truncated PNGs now fail with an error (the old decoder silently filled missing rows with zeros) and fall back to the browser decoder; images over 2^27 px are rejected with a message instead of an allocation crash.
- The worker snapshots the tileset's tiles when the dialog opens. The dialog is modal, so the tileset can't change underneath it.

### Open questions
- None blocking. Possible follow-ups: faster near-duplicate search (`findNearDuplicates` is O(U²·T); an early exit plus exact block-hash candidate filtering would help on big tilesets); the map preview panel takes ~0.5 s to render a 256×256 preview after import; Adam7 interlace support.

## Built
As drafted. The old decoder is kept as a test oracle in `src/core/testing/pngReference.ts` (not used by the app).

## Verified
- Timings, `PERF=1 npx vitest run import.perf --silent=false` (`src/core/import/import.perf.test.ts`, skipped by default): 4096×4096 RGBA PNG (1.1 MB), 16 px tiles, 65,536 cells, 10,445 unique, Node, median of 3:

  | | before | after |
  | --- | --- | --- |
  | `decodePng` | 1920 ms | 574 ms |
  | `sliceImage` | 825 ms | 452 ms |
  | `applyImport` | 40,030 ms | 3 ms |

  Memory is from the analysis above (≈12N + 2Z → ≈4N + Z during decode, no 4N of crops per dry run, no 4N preview copy), not measured.
- New tests: streaming decoder ≡ reference decoder across every colour type / bit depth pair, random filter bytes, 1/3/7 IDAT chunks, with and without tRNS (336 cases), plus our encoder's output; truncated and oversized images rejected; region helpers ≡ crop + `hashPixels` / `pixelsEqual` / `isEmptyTile` on aligned and unaligned buffers; `addTiles` ≡ repeated `addTile`; `sliceImage` ≡ a naive crop-every-cell slicer on a random sheet (offset, spacing, transparent-RGB noise, existing tile, all four option combos); cached scan/index/colours give the same result and a scan for other geometry is ignored. Existing import tests pass unchanged.
- `npm run typecheck`, `npm test` (86 passed, 1 perf test skipped), `npm run build` pass. The worker is emitted as its own chunk.
- Browser (`npm run dev`): a 21 MB 4096×4096 PNG opened in the dialog in ~2.9 s with the UI thread never blocked over ~190 ms; summary right; *Extract palette* toggle re-ran the dry run and capped at 1024+ colours; Import gave 276 tiles named from `tile0_0` and a 256×256 preview, undo/redo fine; re-importing the same file → 0 new tiles, 65,536 cells reused; a WebP went through the browser fallback (3 new tiles of 8 cells, "decoded by the browser" hint); small sheets still show per-cell grid lines; no console errors.
- Not verified: `npm run tauri build` / the worker inside WebView2.
