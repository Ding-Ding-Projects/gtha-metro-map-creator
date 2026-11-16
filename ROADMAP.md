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
- [x] Portable deploy app: Docker here, built-in server, SSH, GitHub Pages, folder or ZIP, with verified links (SSH and GitHub Pages not yet run end to end with real credentials)
- [x] Release workflow publishing both executables and the offline site
- [x] Local verification script that drives the built executables hidden
- [x] Unofficial Traditional Chinese names for every template station and line (1.1.1)
- [x] Application icon for both executables (1.1.1)
- [x] File menu verification: save as, recent, open, unsaved-changes prompt (1.1.1)

## GTFS viewer

- [x] Standalone viewer page `site/gtfs/` with English and Cantonese, light, dark and system themes, keyboard access and a 390 px layout
- [x] Open a feed from a file, drag and drop, a web address (CORS permitting) or the map editor
- [x] Worker parsing with typed arrays for stop_times and shapes; virtualised lists, tables and grids
- [x] Overview, routes, stops, trips, blocks (Gantt), calendar, shapes, transfers and pathways, fares v1 and v2, flex, translations, validation, realtime and raw data views
- [x] Global search, deep links, Add to map through the editor importer
- [ ] Not verified: a real TTC feed (only the York Region Transit feed and a synthetic 5.5 million row feed were opened)

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

## Phase 6: release 1.5.0

- [x] Auto-schematic with preview and quality stats
- [x] Style presets: Material, Classic metro, Frequent network, Night
- [x] Print layout with vector PDF (Latin labels)

## Phase 7: release 1.6.0

- [x] Scenarios, swipe compare, change list
- [x] Share link in the URL fragment
- [x] Live service simulation and WebM clip
- [x] GTFS feed export, checked by importing it back
- [x] Coverage from Statistics Canada 2021 population, walksheds, per-line totals
- [x] Illustrative ridership estimate with line widths
- [x] Live TTC and YRT vehicles in the desktop app
- [x] One-click deploy app (desktop and website): Docker, built-in server, SSH, GitHub Pages, folder or ZIP, with verified links (SSH and GitHub Pages not run end to end with real credentials)
- [x] Deploy targets VirtualBox and VMware (real VBoxManage and OVF Tool verified with a stand-in appliance that is never started), USB drive and Raspberry Pi card (file-target write and read-back verified; see the unticked items below)
- [x] Multiple instances and an instance manager (registry, live health, start, stop, restart, logs, update, duplicate, remove; verified against real Docker with a foreign container left untouched)
- [ ] A real write of the appliance image to a USB drive or SD card from the deploy app: helper script written and its file-target path verified; the physical-drive path (clearing, offline, unbuffered I/O) has never run on hardware
- [ ] The appliance booting in real VirtualBox and VMware from the deploy app: needs a released appliance image (it cannot be built on Windows); only import, conversion, ownership and removal are verified
- [ ] Raspberry Pi appliance image: image built locally under arm64 emulation with a real arm64 container image, its boot partition inspected, and the QEMU virt-twin boot test passed locally (healthz, app and console banner); unticked until a tagged CI run passes the boot test and someone boots a real Pi 4 or Pi 5
- [ ] Raw x86_64 USB image: built by the release job; legacy BIOS only, UEFI boot not provided and never tried on hardware
- [ ] Redesigned GTFS import dialog with route preview: in progress

## Phase 8: next

- [ ] Shared bend setting across all lines on a bundled segment
- [ ] Vector PDF with Chinese labels (needs an embedded font)
- [ ] Crossing reduction in auto-schematic
- [ ] Employment data for coverage, when an open small-area source exists
- [ ] Appliance OS image for the hosted server: workflow, build scripts and docs written; unticked until a tagged CI run passes the QEMU boot test and the images are attached to a release (see docs/features/appliance.md)
- [ ] Chinese names for bus stops
- [ ] ~~Automated browser tests in CI~~ Not doing: CI deliberately runs no tests here; browser checks run locally with `scripts/verify/`
- [ ] Search across the documentation articles with the same regex builder
- [ ] Sign-in option for the hosted server
- [ ] Per-line station markers (ticks) style option
