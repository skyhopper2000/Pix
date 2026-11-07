# Step 11: v1 adjustments

Small fixes found while using v1 after it was merged to `main`. Each fix gets its own section.

## Save As lets you name the project (desktop)

**Problem.** In the Tauri build, *File › Save As…* opened a folder picker (`open({ directory: true })`). It created `<project name>.tilestudio` inside the chosen folder, but there was no way to type a name.

**Fix.**
- `Platform.saveFolderAs(name, files)` is replaced by `chooseFolderTarget(name)`, which only asks where to save. The caller then writes with the existing `saveFolderTo`.
- Tauri: `chooseFolderTarget` opens a native **Save** dialog pre-filled with `<project name>.tilestudio`, filtered to "Tile Studio project (*.tilestudio)". The chosen path becomes the project folder, and `.tilestudio` is appended if the user dropped it.
- `saveProject(true)`: if the typed name differs from the project's name, the project is renamed first (one undoable "Rename project" entry), so `project.json`, the window title and export names all match the folder.
- Core: `projectNameFromFolder()` is the inverse of `projectFolderName()`.
- Web: unchanged for users. The File System Access API has no named "save folder" dialog, so the browser build still picks a parent folder and uses the suggested name, or downloads a `.zip`.

**Open questions.** Typing the name of a folder that already exists makes the Windows Save dialog navigate into it instead of returning. To save over an existing project, open it and use *Save*.

**Verified.**
- `npm run typecheck`, `npm test` (80 passing, including a new `projectNameFromFolder` test) and `npm run build` all pass.
- Browser build (`npm run dev`): with the directory picker stubbed to return an OPFS folder named `Desert Ruins.tilestudio`, *Save As* renamed "Untitled" → "Desert Ruins", wrote `project.json` with that name, updated the title and cleared the dirty flag.
- Not verified here: the native Tauri Save dialog itself. It needs a hands-on check in `npm run tauri dev`.

## Import a palette from an image

**Goal.** Take an image's colours into the project palette without slicing or importing the image. It's reached from the existing *Import Palette* command (File menu and the palette panel's import button).

**Behaviour.**
- The Import Palette file dialog now accepts images (`.png`, `.gif`, `.bmp`, `.jpg`, `.jpeg`, `.webp`) as well as palette files, with separate "Palette files" and "Images" filters.
- For an image, `paletteFromImage()` (core/palette) returns its distinct colours in reading order, so a swatch strip keeps its order. It skips fully transparent pixels and keeps partial alpha. Colours already in the palette are skipped as before (`addPaletteColors`). One undo entry, "Import palette".
- **Limit: 256 colours.** Above that, the import is refused with a message, and nothing is added.
- `decodeImage` moved from `src/ui/` to `src/platform/` so the state layer can use it. PNGs still go through the exact decoder.

**Check (creed / open questions).** Reading colours is allowed: it's the same read-only extraction as the import dialog's "Extract palette". Truncating to the first 256, or quantizing to 256, was rejected. Truncating keeps an arbitrary subset, and quantizing would invent colours the user never drew. JPEG/WebP go through the browser decoder, so their colours can be slightly off and they usually exceed 256 anyway.

**Verified.**
- `npm run typecheck`, `npm test` (85 passing; 5 new `paletteFromImage`/`isPaletteImageFile` tests) and `npm run build` pass.
- Browser build, with the file chooser stubbed to hand the real action generated PNGs:
  - A 6-pixel strip (red, green, blue, red again, transparent, #112233) added exactly `ff0000 00ff00 0000ff 112233` in that order and created no tiles or tilesets.
  - A 300-colour image showed "Couldn't import the palette" with the limit message, and the palette was unchanged.
- Not verified here: the native Tauri file dialog's filter list.
