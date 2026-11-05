# CLAUDE.md

Guidance for AI agents working in this repo. Humans: see [README.md](README.md). The source of truth for product behaviour is [docs/design-spec.md](docs/design-spec.md). If this file and the spec disagree, the spec wins. Note the conflict in "Open decisions" below.

## What this is

Tile Studio (working name) is a Windows desktop app (Tauri 2 + React + TypeScript, Canvas 2D) that slices, organizes and exports pixel-art tiles as Tiled-ready `.png` + `.tsx` sheets. v1 is **Tile mode only**. Sprite mode, animated tiles, non-Tiled export targets and macOS/Linux builds are v2: do not build them.

## The creed (hard rule, check every feature against it)

**The user draws every pixel.** Code may slice, sort, name, preview, pack and export. It must never generate, alter, "fix" or judge art.

- ✅ Allowed: slicing, *exact* duplicate removal, *proposing* near-duplicate merges that the user confirms, auto-naming, layout, scaling and extrusion **at export time only**, user-driven tools (incl. lighten/darken, pixel-perfect stroke cleanup on the stroke being drawn).
- ❌ Forbidden: autotile synthesis, filling empty template slots, seam warnings, auto-detecting flipped/rotated duplicates, any AI/generative feature, any automatic merge without a click, any change to stored tile pixels that the user didn't directly cause.
- Overlays (grid, slot guides, highlights, neighbour context) are drawn on top of the canvas and are **never** written into tile pixels.

If a task seems to require breaking the creed, stop and ask the human.

## Workflow: draft → check → implement → test → update docs

Every unit of work (a build step, a feature, a fix) goes through these five stages in order. Don't skip any.

1. **Draft.** Write a short plan in `docs/steps/NN-name.md`: goal, spec sections covered, files/modules touched, data-model changes, test plan, and anything left out on purpose. For small fixes, a few lines in the commit message are enough.
2. **Check.** Review the draft against (a) the spec, (b) the creed, (c) the non-goals, (d) the architecture rules below. Write down any conflict or ambiguity in the draft under "Open questions" and pick the most conservative choice (the one that touches fewer pixels and does less automatically). Revise the draft before writing code.
3. **Implement.** Keep the domain logic pure and in `src/core/`. UI only calls core functions and store commands. Small commits with clear messages.
4. **Test.** Run all three: `npm run typecheck`, `npm test`, `npm run build`. Add Vitest tests for every pure function you add or change in `src/core/` (slicing, dedupe, packing, `.tsx` output, serialization). For UI work, also run the app (`npm run dev`) and exercise the feature in a browser. Never report something working without having run it. If something can't be verified (e.g. the Tauri build without Rust), say so in the step doc.
5. **Update docs.** Update the step doc with what was actually built and how it was verified, update the "Build plan" status table below, and update README.md if user-facing behaviour changed. Commit the docs with the code.

## Git and branches

- Work only in this local clone. **Never push** to `origin`, never force-push, never rewrite `main` history.
- `main` holds reviewed work only. Don't merge step branches into `main`; a human reviews and merges them.
- Each build step gets its own branch, `step/NN-short-name`, **stacked** on the previous step's branch (step 3 branches from step 2, and so on), because every step builds on the last. Merge order for review is the step order.
- If a review changes an earlier branch, rebase the later branches onto it locally.
- Commit messages: imperative subject ≤ 72 chars, a body explaining why, and the Co-Authored-By trailer.

## Commands

```bash
npm install
npm run dev          # Vite dev server, http://localhost:1420 (browser build)
npm test             # Vitest, run once
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production web build
npm run tauri dev    # desktop shell (requires Rust toolchain)
npm run tauri build  # .msi installer (requires Rust toolchain)
```

The Rust toolchain was **not** installed on the machine where v1 was first scaffolded, so `src-tauri/` hasn't been compiled. Treat it as unverified until someone runs `npm run tauri build`.

## Architecture

```
src/
  core/          pure TypeScript, no DOM, no React. Fully unit-tested.
    model.ts       types: Project, Tileset, Tile, Subset, Preview, Palette, Terrain
    ids.ts         stable random IDs
    pixels.ts      RGBA buffer helpers (get/set/compare/hash/blit/scale/extrude)
    color.ts       packed RGBA <-> hex, brightness, palette stepping
    ops.ts         pure project operations (add/delete tile, set slot, stamp…), each returns a new Project
    import/        slicing, exact dedupe, near-duplicate grouping, naming, palette extraction
    templates/     subset templates: blob47, corner16, edge16, custom; Wang ids, slot names
    export/        sheet packing, extrusion, scaling, .tsx XML, manifest, zip
    palette/       .gpl/.hex/.pal/Lospec parse + .gpl/.hex write
    project-io/    project folder <-> Project (project.json + tiles/*.png)
    png.ts         minimal PNG encode/decode (8-bit, non-interlaced) via fflate
    tools/         pixel tool algorithms: line, rect, ellipse, flood fill, pixel-perfect, lighten/darken
  state/         central store, undo/redo history, UI (non-undoable) state
  platform/      file dialogs + disk I/O: `tauri.ts`, `web.ts`, chosen at runtime
  ui/            React components: layout, panels, canvases, dialogs, command palette
src-tauri/       Tauri 2 shell (Rust); only plugin wiring, no app logic
```

Rules:

- **Core is pure.** `src/core` never imports from `state`, `ui` or `platform`, and never touches `document`/`window`. All of it must run in Vitest under Node.
- **Each tile exists exactly once**, in `tileset.tiles[id]`. Subsets and previews store `TileId | null` references only. Never copy pixels into a subset or preview.
- **Immutable project state.** Core ops return new objects with structural sharing; never mutate a `Project` in place. Tile pixels are `Uint8ClampedArray` (RGBA, row-major, `w*h*4`); replace the array to edit a tile, never mutate a stored one.
- **Every project edit is an undoable command.** UI calls `store.dispatch(label, (p) => newProject)`. Continuous edits (a pen stroke) use `store.preview(...)` while drawing and one `store.commit(label)` at the end, which creates one undo entry. UI state (selection, tool, zoom, panel layout) is not undoable and lives outside the project.
- **Rendering**: Canvas 2D with `imageSmoothingEnabled = false`, integer zoom only.
- **Platform isolation**: anything that touches files or native dialogs goes through `src/platform`. The web implementation lets the app be developed and tested in a browser.
- Dependencies stay few: React, `flexlayout-react` (docking), `fflate` (zip/deflate), Tauri plugins. Ask before adding more.

## Domain conventions

- **Tile naming on import**: `tile{row}_{col}` of the first appearance in the source image (`tile0_0` = upper-left). New blank tiles: `tile_{n}`. Tiles created inside a template slot get the slot auto-name; existing tiles dragged into a slot keep their name (the user can run *Name tiles from slots*). Names don't have to be unique; IDs are.
- **Exact duplicate** = identical RGBA bytes. Fully transparent pixels compare equal whatever their RGB values (alpha 0 is normalized to `0,0,0,0` **only for comparison**, never written back).
- **Empty tile** = every pixel fully transparent, or every pixel the same color.
- **Near-duplicates**: the metric is the fraction of differing pixels. Grouping only proposes; merging needs a user click and remaps all references to the surviving tile.
- **Flip/rotate**: never detected. Flipped copies are separate tiles.
- **Wang ids** (Tiled `.tsx`, 8 comma-separated values, clockwise from top): `top, top-right, right, bottom-right, bottom, bottom-left, left, top-left`. Terrain A = color 1, terrain B = color 2, 0 = unused. Corner sets use only indices 1,3,5,7; edge sets only 0,2,4,6; mixed (blob) uses all 8.
- **Templates**: `blob47` has 8×6 cells holding the 47 blob masks in ascending order of reduced 8-bit mask (bits N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128; a corner bit counts only if both adjacent edges are set); the 48th cell is not a slot. `corner16`: 4×4, index = NE·1 + SE·2 + SW·4 + NW·8. `edge16`: 4×4, index = N·1 + E·2 + S·4 + W·8. A set bit means terrain B.
- **Slot auto-names**: `{terrainA}_{terrainB}_{dirs}`, where `dirs` lists the compass points that are terrain B in N, NE, E, SE, S, SW, W, NW order, joined by `-` (e.g. `grass_dirt_NE`, `grass_dirt_N-NE-E`), `all` when every position is B, `none` when none is.
- **Export**: sheets are packed left→right, top→bottom. Extrusion repeats edge pixels outward by `e` px. The `.tsx` then gets `margin = padding + e` and `spacing = spacing + 2e`, with tilewidth/height = scaled tile size. Scales are nearest-neighbour; several scales export as `name@2x.png` / `name@2x.tsx` (1× has no suffix). Template subsets keep fixed slot order on the template grid, and empty slots/cells are transparent with no `<wangtile>`. Parent auto columns = ⌈√n⌉; unstructured auto keeps the arrangement, trimming trailing empty rows/cols. One tileset in scope → files at the zip root; several → one folder per tileset. Tile names are written as a `name` tile property.

## Open decisions (provisional, awaiting the human)

The spec left these open. The provisional choice is implemented. Change it here and in code if the human decides otherwise.

| Question | Provisional choice |
| --- | --- |
| Product name | "Tile Studio" placeholder (repo is `Pix`) |
| Isometric / hex in v1 | Stretch goal. Square only; the model stores `grid` and the import dialog shows iso/hex as disabled |
| Project format | Folder (`*.tilestudio/` with `project.json` + `tiles/*.png`), as proposed. The browser fallback without File System Access saves the same tree as a `.zip` |
| Default tile size | 16 px |
| Tile sizes per tileset | Exactly one |
| Multi-cell objects (2×2 tree) | Group the cells in an unstructured subset; nothing more |
| Pen tablet | Pointer Events (pens work as a mouse); no pressure in v1 |
| Faint slot guide in empty template slots | Allowed: overlay only, never written into tiles |

## Build plan

| # | Branch | Scope | Status |
| --- | --- | --- | --- |
| 0 | `main` | README.md, CLAUDE.md, spec | done |
| 1 | `step/01-scaffold` | Vite + React + TS + Vitest, Tauri 2 skeleton, platform layer, typecheck/test/build scripts | ready for review (Tauri uncompiled) |
| 2 | `step/02-core-model` | Model types, IDs, pixel/color helpers, subset templates + Wang ids, pure ops (linked tiles, delete-everywhere), undo/redo history | ready for review |
| 3 | `step/03-import` | PNG codec, slicing (offset/spacing), exact dedupe, empty filter, naming, preview rebuild, re-import, palette extraction, near-duplicate grouping + merge op | ready for review |
| 4 | `step/04-export` | Sheet packing, scale, extrusion, `.tsx` writer, manifest, zip, palette files | ready for review (not yet loaded in Tiled) |
| 5 | `step/05-project-io` | Project folder serialize/deserialize, platform save/open (web + Tauri) | ready for review |
| 6 | `step/06-shell-ui` | Main window, docking layout + Reset Layout, menus, project tree, tile bar, palette panel, theme, command palette | ready for review |
| 7 | `step/07-tile-editor` | Tile canvas, zoom, all drawing tools + shortcuts, pixel-perfect, neighbour context, selection/copy/paste | ready for review |
| 8 | `step/08-subsets-previews` | Subset UI (slots, guides, terrains, drag-drop, draw-into-slot), map preview editor (paint/stamp/clear/highlight/grid/zoom/PNG export), subset previews | planned |
| 9 | `step/09-dialogs` | Import dialog, near-duplicate review panel, export dialog, Export Again, palette import/export | planned |
| 10 | `step/10-acceptance` | Walk through Jane's session (spec §Acceptance) end to end, fix gaps | planned |

Keep this table current: `planned` → `in progress` → `ready for review` (or `blocked: reason`).
