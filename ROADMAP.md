# Roadmap

## Phase 1: editor foundation

- [x] Design canvas for the editor and project site (`design/`)
- [x] SVG editor with pan, zoom, grid and snapping
- [x] Octilinear segment routing with per-segment bend choice
- [x] Parallel offsets for lines sharing a segment
- [x] Station, line, label and erase tools; segment split and stop insertion
- [x] Automatic and manual label placement
- [x] Undo and redo, local autosave
- [x] SVG, PNG and JSON export; JSON import with validation and drag and drop
- [x] GTHA schematic template (171 stations, 16 lines)
- [x] English, Cantonese and bilingual interface
- [x] Light, dark and system themes
- [x] First-run setup wizard with save and resume
- [x] Station search with plain and regular expression modes
- [x] Map check panel
- [x] Project site and documentation pages
- [x] Build validation script and GitHub Pages deployment workflow

## Phase 2: hosting and desktop

- [x] Regex builder beside the station search
- [x] Container image published to GitHub Container Registry
- [x] Compose file and `host.bat` with detached and interactive log modes
- [x] Portable desktop app with offline content, native open and save, recent maps
- [x] Portable server setup wizard (Docker check, port, pull, start, health, network address)
- [x] Design artboards for the desktop app and the wizard
- [x] Release workflow publishing both executables and the offline site
- [x] Local verification script that drives the built executables hidden
- [x] Unofficial Traditional Chinese names for every template station and line (1.1.1)
- [x] Application icon for both executables (1.1.1)
- [x] File menu verification: save as, recent, open, unsaved-changes prompt (1.1.1)

## Phase 3: next

- [ ] Shared bend setting across all lines on a bundled segment
- [ ] Box selection and copy and paste
- [ ] Geographic background layer and import from GTFS
- [ ] Touch gestures for pinch zoom
- [ ] ~~Automated browser tests in CI~~ Not doing: CI deliberately runs no tests here; browser checks run locally with `scripts/verify/`
- [ ] Search across the documentation articles with the same regex builder
- [ ] Sign-in option for the hosted server
- [ ] Per-line station markers (ticks) style option
