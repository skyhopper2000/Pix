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
