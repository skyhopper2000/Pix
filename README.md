# Tile Studio

> Working name. Free, open-source (GPL-3.0) Windows desktop app that turns hand-drawn or imported tiles into clean, **Tiled-ready** tilesets.

**Create → organize → export.** Draw tiles (or slice them out of an old sheet or map rip), sort them into terrain sets and object groups, then export a `.zip` that [Tiled](https://www.mapeditor.org/) can use straight away, Wang/terrain sets included.

Tile Studio is made for hobbyists and indie developers building 2D tile-based games, especially RPGs.

## You draw every pixel

Tile Studio never generates, alters, "fixes" or judges your art. It slices, sorts, names, previews, packs and exports. That's it.

| Tile Studio will | Tile Studio won't |
| --- | --- |
| Slice an image into tiles | Generate autotiles for you |
| Merge tiles that are *exactly* identical | Fill empty template slots |
| *Suggest* near-duplicates, and you decide | Warn you about "bad" seams |
| Name tiles automatically | Detect flipped or rotated copies |
| Scale and extrude tiles at export time | Use AI to generate anything |
| Give you tools: pencil, fill, lighten/darken… | |

## Features (v1)

- **Projects and tilesets.** A project has one shared palette and any number of tilesets. Each tileset owns its tiles and has one tile size.
- **Import.** Slice any image into tiles with a tile size, offset and spacing. Exact duplicates collapse to one tile, and the original image is rebuilt as a map preview. Optionally extract the image's colors into your palette. You can review near-duplicates side by side, and nothing merges unless you click.
- **Tile editor.** Pencil (with pixel-perfect strokes), eraser, fill (contiguous/global), line, rectangle, ellipse, lighten/darken, selection + move, and color picker. The adjoining tiles show dimmed around the edges so you can see how your tile meets its neighbours.
- **Linked tiles.** Every tile exists once. Subsets and previews point to it, so an edit anywhere shows up everywhere, live.
- **Subsets.** Organize tiles into typed sets, each exported as its own Tiled sheet:
  - *Unstructured*: free arrangement (buildings, props, multi-tile objects).
  - *47 blob*, *16 corner*, *16 edge*: terrain transitions between two named terrains, exported as Tiled Wang sets.
  - *Custom template*: your own slot grid with Wang bits per slot.
- **Map preview.** A lightweight grid for seeing tiles in context: stamp, clear, highlight every use of a tile, and export as PNG at any integer scale. It is deliberately **not** a level editor. Use Tiled for that.
- **Palette.** Free RGBA or palette-locked. Import `.gpl`, `.hex`, `.pal` and Lospec palettes; export `.gpl` and `.hex`.
- **Export.** One `.zip` containing a PNG + `.tsx` per sheet, preview images and the palette. Options: scale (1×–4×), columns, padding, spacing, extrusion (anti-seam), per-tile PNGs. **Export Again** (`Ctrl+Shift+E`) repeats the last export.

### Export layout

```
map_example_export.zip
├── manifest.json
├── map_example.png          parent sheet: every tile
├── map_example.tsx
├── subsets/
│   ├── buildings.png / .tsx
│   └── grass_dirt.png / .tsx   (Wang set: grass, dirt)
├── previews/
│   └── map_rip.png
└── palette.gpl
```

In Tiled, add the `.tsx` files to a map and the terrain brush works with no setup.

## A typical session

1. **New Project → New Tileset.** A blank 16×16 tile opens in the editor.
2. **File → Import Image.** Pick a map rip, set the tile size, tick *Isolate unique tiles*. Tiles appear as `tile0_0`, `tile0_1`, … and the rip is rebuilt as a map preview.
3. **Redraw** tiles in your own style and watch the map update live.
4. **New Subset → Unstructured** ("buildings"): drag tiles in and arrange them.
5. **New Subset → 47 blob** ("grass_dirt"): name the terrains, drag in the tiles you have, draw the missing slots.
6. **File → Export Project** and load the `.tsx` files in Tiled.

## Keyboard shortcuts

| Tool | Key | | Action | Key |
| --- | --- | --- | --- | --- |
| Pencil | `B` | | Undo / Redo | `Ctrl+Z` / `Ctrl+Y` |
| Eraser | `E` | | Command palette | `Ctrl+Shift+P` |
| Fill | `G` | | Export Again | `Ctrl+Shift+E` |
| Line | `L` | | Save | `Ctrl+S` |
| Rectangle | `U` | | Copy / Paste selection | `Ctrl+C` / `Ctrl+V` |
| Ellipse | `Shift+U` | | | |
| Lighten / darken | `D` | | | |
| Select + move | `M` | | | |
| Color picker | `I` or `Alt+click` | | | |

## Project files

A project is a folder, which keeps it readable, git-friendly and recoverable:

```
MyGame.tilestudio/
├── project.json   tilesets, subsets, slots, terrains, previews, palette
└── tiles/
    └── 7f3a….png  one PNG per tile, named by a stable ID
```

## Status

Early development. See [CLAUDE.md](CLAUDE.md) for the build plan and progress, and [docs/design-spec.md](docs/design-spec.md) for the full design spec. Sprite mode (animation) is planned for v2.

## Building from source

Requirements: [Node.js](https://nodejs.org/) 20+ and, for the desktop build, the [Rust toolchain](https://www.rust-lang.org/tools/install) plus the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2 and MSVC build tools on Windows).

```bash
npm install
npm run dev          # run in a browser at http://localhost:1420
npm test             # unit tests (Vitest)
npm run tauri dev    # run as a desktop app (needs Rust)
npm run tauri build  # build the Windows .msi installer
```

The browser build works for development. On Chromium-based browsers it saves project folders through the File System Access API; elsewhere it falls back to downloads.

## License

[GPL-3.0](LICENSE)
