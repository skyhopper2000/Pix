# Pix — v1 Design Spec

Nov 4, 2026 · @Quentin Frank

## Overview

v1 is a free, open-source Windows desktop app that turns hand-drawn or imported tiles into clean, Tiled-ready tilesets: **create → organize → export**. The product is called **Pix**.

**Audience.** Hobbyists and indie devs making 2D games, especially tile-based RPGs. Not aimed at professional artists.

**The touch-no-pixel creed.** The user draws every pixel. The app slices, sorts, names, previews, packs and exports, but it never generates, alters, "fixes" or judges art. Every feature is checked against this rule.

- Allowed: slicing an image into tiles, exact-duplicate removal, *proposing* near-duplicate merges the user decides on, auto-naming, layout, scaling and extrusion at export, user-driven tools (including lighten/darken and standard stroke cleanup).
- Not allowed: autotile synthesis, filling empty template slots, seam warnings, auto-detecting flipped or rotated duplicates, any AI generation feature.

**v1 scope.** One app with two modes. Tile mode ships in v1; Sprite mode (animation) is v2. Local-first, no accounts, no cloud.

**Non-goals.** Rebuilding Tiled (the map preview exports images only), animated tiles, sprite animation, tile randomization (left to the engine), nested subsets.

## Data model

Each tile exists exactly once, in its parent tileset. Subsets and previews only point to tiles, so an edit anywhere shows up everywhere.

&#91;embedded content: data model · project, parent tileset, tiles, subsets, previews\]

**Rules**

- A project holds one shared palette and any number of tilesets.
- A tileset (the parent) owns every tile and has one tile size and grid type.
- Subsets are linked, not copied: editing a tile inside a subset edits the parent tile.
- One tile can belong to many subsets or to none. A tile in no subset exports only in the parent sheet.
- A tile drawn inside a subset is added to the parent automatically.
- Subsets are one level deep; no nesting.
- Deleting a tile from the parent deletes it everywhere. Its subset slots become empty and its preview cells clear.
- A tileset can have several map previews, and each subset has its own preview.

## Screen layout

One main window: the single-tile editor in the center, the preview editor below it, and the project tree, tile bar and palette on the right. The reference feel is VS Code, Adobe and Tiled.

&#91;embedded content: main window · default layout\]

- Every panel docks, resizes and collapses. **View > Reset Layout** restores this default.
- Selecting a tile anywhere (tile bar, preview, subset slot) opens it in the tile editor.
- When a templated subset is selected, the tile bar shows its slot grid with empty slots outlined.
- A new tileset opens with one blank tile at the default size, as in Jane's story.

## Import

File > Import Image slices any image (a map rip, an old sheet) into editable tiles in the current tileset and rebuilds the image as the tileset's map preview.

**Import dialog settings**

| Setting | Options | Notes |
| --- | --- | --- |
| Grid type | Square, isometric, hex | Isometric and hex are a v1 stretch goal |
| Tile size | Width × height in px | Defaults to the tileset's size |
| Offset | X, Y in px | Where the first tile starts |
| Spacing | X, Y in px | Gutter between tiles in sheets |
| Isolate unique tiles | Checkbox | Exact pixel match only |
| Include empty tiles | Checkbox | Fully transparent or single-color tiles |
| Extract palette | Checkbox | Adds the source's colors to the project palette; reads colors, never changes them |

**Unique-tile detection**

1. Exact matching is the only automatic step. Identical tiles become one tile, and every map position points to it.
2. An optional similarity threshold opens a **Review near-duplicates** panel. It shows groups of near-matches side by side. The user picks which version survives or keeps them all. Nothing merges without a click.
3. Flipped or rotated copies are always separate tiles. Finding them is the user's job.

**Naming.** Tiles are named by source position: `tile{row}_{col}` of their first appearance (`tile0_0` = upper-left).

**Re-import.** Importing into an existing tileset deduplicates against the tiles already there. New tiles are appended, and the new image becomes an additional map preview.

## Drawing tools and palette

v1 ships enough tools to build a tileset from scratch, not just clean an import. Every tool acts only where and when the user applies it.

| Tool | Shortcut | Notes |
| --- | --- | --- |
| Pencil | B | 1px default; pixel-perfect stroke option |
| Eraser | E |  |
| Fill | G | Contiguous and global modes |
| Line | L |  |
| Rectangle | U | Outline or filled |
| Ellipse / circle | Shift+U | Outline or filled; Shift locks to a circle |
| Lighten / darken | D | Shifts the pixel under the brush along the palette (or by brightness in RGBA mode) |
| Selection + move | M | Rectangle select, move, copy, paste between tiles |
| Color picker | I or Alt+click |  |

**Pixel-perfect strokes** remove the doubled corner pixels a fast freehand line leaves behind (an L-shaped step becomes a clean diagonal). It is standard in Aseprite and Pixelorama, applies only to the stroke being drawn, and can be toggled off.

**Neighbor context.** The single-tile canvas shows a few rows and columns of the adjoining tiles around its edges, dimmed and read-only. The neighbors come from the active preview. The margin width is a setting.

**Palette**

- One shared project palette, free RGBA by default, with an optional palette-locked mode.
- Import from `.gpl`, `.hex`, `.pal` and Lospec; export as `.gpl` and `.hex`.
- Colors can be extracted from an imported image (see Import).

## Subsets

A subset is a typed, organized view of tiles from its parent tileset, and each one exports as its own Tiled-ready sheet. Create one with New Subset, pick a type, then fill it with tiles from the parent.

| Type | Slots | Tiled equivalent |
| --- | --- | --- |
| Unstructured | Free arrangement, any count | Plain tileset, no Wang set |
| 47 blob | 47 fixed slots, 2 terrains | Mixed Wang set |
| 16 corner | 16 fixed slots, 2 terrains | Corner Wang set |
| 16 edge | 16 fixed slots, 2 terrains | Edge Wang set |
| Custom template | User-defined slot grid with Wang bits per slot | Corner, edge or mixed, as defined |

**Filling slots.** Template slots start empty and show a faint diagram of the slot's expected shape (which corners or edges are terrain A or B). The user drags a tile from the parent's tile bar into a slot, or selects a slot and draws a new tile in it. The app never fills a slot by itself.

**Terrains.** Each templated subset names its two terrains (for example *grass* and *dirt*) and gives each a color. Names drive auto-naming (`grass_dirt_NE`) and become Wang color names in the exported `.tsx`. Which terrain pairs get transition sets is entirely up to the user.

**Unstructured subsets.** The arrangement canvas is the layout: wherever the user places a tile is where it lands in the exported sheet. Empty cells export as transparent.

**Subset preview.** Each subset has its own small preview canvas for painting with its tiles. Edits sync both ways with the tiles.

## Map preview

The map preview is a lightweight grid of tile references that shows the whole tileset in context. It exports only as an image. It is not a level editor, so Tiled stays the place to build real maps.

**What it does**

- Created automatically on import (the source image rebuilt from tiles) or blank from New Preview.
- Drawing on it edits the one tile under the cursor, and every other place that tile appears updates live.
- A **Stamp** tool places a tile from the tile bar into a cell; **Clear** empties a cell.
- Grid toggle, zoom, and a highlight that shows every cell using the selected tile.
- Export as PNG at any integer scale.

**What it deliberately leaves out:** layers, objects, collision, Wang painting, `.tmx` export, map properties.

## Export

File > Export Project writes one `.zip` that Tiled can use directly. Each sheet gets a PNG plus a `.tsx` tileset file with its Wang set already defined.

```
map_example_export.zip
├── manifest.json
├── map_example.png          (parent: every tile, incl. ones in no subset)
├── map_example.tsx
├── subsets/
│   ├── buildings.png
│   ├── buildings.tsx
│   ├── grass_dirt.png       (47 blob)
│   └── grass_dirt.tsx       (mixed Wang set: grass, dirt)
├── previews/
│   └── map_rip.png
└── palette.gpl
```

**Export setup dialog**

| Option | Values | Default |
| --- | --- | --- |
| Scale | 1×, 2×, 3×, 4× (nearest-neighbor, several at once) | 1× |
| Columns | Auto or a fixed count (parent and unstructured only) | Auto |
| Padding (margin) | 0–8 px around the sheet | 0 |
| Spacing | 0–8 px between tiles | 0 |
| Extrusion | 0–4 px: repeats each tile's edge pixels outward to stop seams | 0 |
| Include previews | On / off | On |
| Per-tile PNGs | On / off (adds a `tiles/` folder) | Off |
| Scope | Whole project, or selected tilesets and subsets | Whole project |

When extrusion is on, the `.tsx` margin and spacing are written to match, so Tiled reads the tiles correctly. Template subsets export in the template's fixed slot order, and empty slots are transparent.

**Export Again** (Ctrl+Shift+E) repeats the last export with the same settings and path.

## Tech stack and project format

The proposed stack is TypeScript in a Tauri 2 desktop shell, drawing to HTML canvas. It targets Windows first, and it's well suited to AI-assisted development.

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | Tauri 2 | Small native Windows installer (.msi); file dialogs and disk access through Rust |
| UI | React + TypeScript | The most AI-familiar UI stack; docking panels via a layout library |
| Rendering | Canvas 2D, `imageSmoothingEnabled = false` | Pixel-exact zoom; WebGL only if large maps get slow |
| State and undo | Central store + command pattern | Every edit is an undoable command; linked tiles make this essential |
| Files | `fflate` (zip), native PNG encode, hand-written `.tsx` XML | Few dependencies |
| Tests | Vitest | Import slicing, deduplication and `.tsx` output are pure functions and easy to test |

**Project format (proposed): a folder, not a single file.**

```
MyGame.tilestudio/
├── project.json      (tilesets, subsets, slots, terrains, previews, palette)
└── tiles/
    ├── 7f3a….png     (one PNG per tile, named by ID)
    └── …
```

This keeps projects readable, git-friendly and recoverable if something breaks. Tile IDs are stable, so renaming a tile never breaks a link.

**Theme.** Dark by default, with a light option. The visual reference is VS Code, Adobe and Tiled: flat panels, small icons, dockable and resizable regions, a command palette (Ctrl+Shift+P).

## Acceptance walkthrough: Jane's session

v1 is done when Jane can complete every step below with no workaround, from map rip to Tiled.

1. **New Project → New Tileset.** One blank tile at the default size fills the editor. The tile bar is empty.
2. **File > Import Image.** She sets the grid type, tile size and offset, and ticks *Isolate unique tiles*.
   - Unique tiles appear in the tile bar as `tile0_0`, `tile0_1`, and so on.
   - The map preview shows the rebuilt rip, and the editor opens `tile0_0`.
3. **Clean up.** She redraws tiles in her style. Every edit appears live in the map preview, and the neighbor context shows the tiles around each edge.
4. **Save** the tileset as *map example*.
5. **New Subset → Unstructured** ("buildings"). She drags building tiles from the parent, draws new variants (which join the parent automatically), and arranges them on the subset canvas.
6. **New Subset → 47 blob** ("grass\_dirt"). She names the terrains, fills the slots that existed in the rip from the parent, draws the missing slots, and adjusts corners.
7. **Repeat** for each terrain pair.
8. **Back to the map preview.** The whole map reflects her restyle.
9. **File > Export Project.** The `.zip` has the parent sheet, one PNG + `.tsx` per subset, and preview images.
10. **In Tiled,** she adds the `.tsx` files and can paint grass/dirt terrain at once, with no setup.

## Open questions and v2 parking lot

**Open for v1**

- [x] Product name: **Pix**.
- [ ] Are isometric and hex grids in v1, or a stretch goal after square?
- [ ] Folder-based project format OK, or do you prefer a single file?
- [ ] Default tile size for a new tileset: 16 or 32 px?
- [ ] Can a tileset have more than one tile size, or exactly one?
- [ ] Multi-cell objects (a 2×2 tree): four tiles grouped in an unstructured subset, or something more?
- [ ] Pen tablet support in v1?
- [ ] Is the faint slot guide in empty template slots acceptable under the creed? It's an overlay and is never drawn into the tile.

**Parked for v2**

- Sprite mode: animation timeline, onion skin, sprite sheet + JSON export
- Animated tiles
- Export targets beyond Tiled (Godot, LDtk, Unity, generic JSON)
- Plugin or scripting API
- macOS and Linux builds
