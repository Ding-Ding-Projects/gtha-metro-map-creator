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

## Phase 3: geographic editor (1.2.0)

- [x] Geographic layout over OpenStreetMap tiles with constant-size lines and labels
- [x] Real coordinates for every template station (OpenStreetMap)
- [x] VIVA Blue, Purple, Orange and Yellow with stops and weekday frequencies (York Region Transit GTFS)
- [x] Service types: bus, rapid bus, express, super express
- [x] Peak and off-peak frequency per route with map badges and legend
- [x] Bus stops, interchange markers and walking transfers
- [x] Draw onto real OpenStreetMap stops at street level
- [x] PDF export and a hostable single-file website
- [x] Project save and open
- [x] Material Design 3 interface with motion
- [x] Label priority and collision culling

## Phase 4: release 1.3.0

- [x] Box select, copy and paste, command palette, pinch zoom, colour-vision preview and colour checks
- [x] Express stops (passes), branches, four frequency bands, frequent-network style
- [x] Station facilities, scale bar and north arrow
- [x] Network timeline with opening and closing years
- [x] Extension hooks so features live in their own modules

## Phase 5: release 1.4.0

- [x] GTFS import in a worker with route picker, stop merging and time-band frequencies
- [x] Journey planner with transfers and waits, and a travel-time map

## Phase 6: next

- [ ] Shared bend setting across all lines on a bundled segment
- [ ] Vector PDF export (the PDF is currently a high-resolution image)
- [ ] Chinese names for bus stops
- [ ] Touch gestures for pinch zoom
- [ ] ~~Automated browser tests in CI~~ Not doing: CI deliberately runs no tests here; browser checks run locally with `scripts/verify/`
- [ ] Search across the documentation articles with the same regex builder
- [ ] Sign-in option for the hosted server
- [ ] Per-line station markers (ticks) style option
