# Step 05: Project folder format

**Branch:** `step/05-project-io` (from `step/04-export`)

## Draft
- Spec: §Tech stack and project format (folder: `project.json` + `tiles/<id>.png`, readable, git-friendly, recoverable).
- `core/project-io`: `serializeProject(project) → FileTree`, `deserializeProject(FileTree) → { project, warnings, preserved }`.
- The platform layer (step 1) already turns a FileTree into a real folder (Tauri fs / File System Access) or a `.zip` fallback. Saving prunes stale `tiles/*.png` files left by deleted tiles.

## Check
- Stable ids: tile files are named by id, so renaming a tile never touches files or links. ✅
- Recoverable: loading never fails because of one bad tile. A missing, unreadable or wrong-size tile PNG loads as a blank placeholder with a warning; unknown references become empty cells with a warning; bad palette colours and unknown subset types are skipped with a warning. Only a missing or invalid `project.json`, or a newer format version, refuses to load.
- Creed / data safety: a placeholder must never overwrite the user's damaged file. `preserved` carries the original bytes, and `serializeProject` writes them back until the user actually edits that tile.
- Git-friendly: pretty-printed JSON, colours as hex strings, deterministic PNG encoding.

## Built
As drafted.

## Verified
- 7 tests: exact round-trip (pixels incl. semi-transparent, subsets of each kind incl. custom templates, subset previews, map previews, palette + lock), readable JSON + id-named files, missing/wrong-size tile recovery, damaged files preserved until edited, dangling references emptied, refusal of non-projects / bad JSON / newer versions, folder naming.
- `npm run typecheck` and `npm test` (69 tests) pass.
