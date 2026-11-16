# Handoff

## 1.3.0 (2026-11-16)

Editing power, service patterns, station facilities and the network timeline, each in its own
module (`site/app/mod-*.js`) on the extension hooks in `docs/features/extensions.md`. Verified on
merged main in headless Edge with `scripts/verify/{editing,patterns,facilities,timeline}.steps.json`:
box select 238 of 238, paste then undo, palette 45 commands, pinch zoom changes view.k; Passes
removes the York Mills marker, four bands stored, branch drawn, widths follow frequency, old
`offpeak` files migrate; facility icons beside labels, scale bar 20 km to 5 km on zoom; timeline at
1960 shows Line 1 and hides Lines 2 and 4, Play stops at 2015, exports filtered including the legend.
Known limits are listed in each feature's doc.

## State (2026-11-15), version 1.2.0

Geographic editor: OpenStreetMap background, real coordinates, VIVA with real frequencies,
service types, frequency badges, bus stops, walking transfers, drawing onto real stops, PDF and
website export, project files, and a Material Design 3 interface with motion.

### 1.2.0 verified locally (headless Edge, 1440 x 900 and 390 x 844)

- Template: 238 stations and stops, 20 routes, every station with coordinates; build passes.
- Geographic fit shows the region over OpenStreetMap with attribution; four VIVA frequency badges
  on their routes (11/15, 17/21, 13/18, 13/15 min); route inspector edits service type, colour,
  width and frequency (bus sets width 4; 8/20 min stored).
- Exports from the running page: project `.gmmc.json`, website HTML (contains the map, tiles and
  attribution), SVG, PNG 6000 x 6768, PDF starting `%PDF-1.4` and ending `%%EOF`. Re-opening the
  project into a blank map restored all 21 routes.
- Drawing onto real stops: 6 real platforms near Richmond Hill Centre appeared at street level;
  clicking one added "Yonge Street / Langstaff Road" as a bus stop with OSM node 2620454491, with
  an Undo snackbar. The stop data came from a local server replaying OpenStreetMap data captured
  from Overpass the same day, because all public Overpass servers were at capacity (502/504).
- Schematic layout, dark theme with Cantonese, export menu, settings dialog; no horizontal
  overflow at 1440 or 390 px; no errors from the app.

### Live stops against the public server (verified after 1.2.0)

- The public Overpass server answered in about 37 seconds, past the 25-second timeout, so the
  timeout was raised to 60 seconds. With default settings the editor then loaded 112 real stops
  around Finch, and clicking two added "Finch" (OSM 56922363) and "Drewry Avenue at Norwin St"
  (OSM 474968519) to a new route.

### 1.2.0 release (verified)

- Release, Container image (x2) and Deploy site workflows succeeded for `28972a0`. `v1.2.0` is a
  normal release with `GTHA-Metro-Map-Creator-1.2.0-portable.exe`,
  `GTHA-Metro-Map-Creator-Server-Setup-1.2.0-portable.exe`, `gtha-metro-map-creator-site.zip` and
  `SHA256SUMS.txt`.
- The released desktop executable matched its SHA-256 (`310ea159...`) and, launched hidden, ran
  the new editor from its bundle: 238 stations, 20 routes, geographic layout, 9 OpenStreetMap
  tiles, four frequency badges, website and project export functions.
- The live site serves 1.2.0 (new scripts and documentation articles return 200). The live editor
  in headless Edge drew all tiles, four badges and the attribution.
- Announcement: Discussion #2. Repository description and topics updated and read back.

### Not verified for 1.2.0

- Wiki first page, Discussion pins and a GitHub Project: need a signed-in GitHub web page.

### 1.1.x release record

- `v1.1.0` at `b7f037b` is a normal release (not draft, not prerelease) with
  `GTHA-Metro-Map-Creator-1.1.0-portable.exe`, `GTHA-Metro-Map-Creator-Server-Setup-1.1.0-portable.exe`,
  `gtha-metro-map-creator-site.zip` and `SHA256SUMS.txt`. Deploy site, Container image and Release
  workflows succeeded for that commit.
- The released desktop executable was downloaded, matched its SHA-256 in `SHA256SUMS.txt`, and
  passed `scripts/verify/desktop-app.steps.json`.
- Image tag `1.1.0` pulls without credentials. The live site serves the new documentation
  articles and the regex builder, and the repository homepage points at it.
- Announcement: Discussion #1. Pinning is not available through the API, so it is not pinned.

### Records not created

- Wiki: the wiki has no first page, so its repository does not exist yet. Pages are staged in
  `docs/wiki/pending/` with publishing steps.
- GitHub Projects: the CLI token has no `project` scope, so no Project was created.

### 1.1.1 (verified locally)

- Desktop File menu through the real menu items in the built executable: Save as wrote a
  171-station file and added it to Open recent; Open loaded a file from disk; an edit made the
  map dirty; New blank map with Cancel kept the edit; with Don't save it replaced the map.
  Dialog answers came from the hidden test path, so the operating system's own dialog windows
  were not displayed.
- Cantonese mode in the built app shows Chinese station labels, line names and search results.
- The executable carries the app icon.

### Not yet verified

- The operating system's own file dialog windows (only their answers were simulated).
- The executables on a computer without Docker, and on a second device opening the LAN address.
- Windows SmartScreen behaviour for the unsigned executables.
- Interactive `host.bat` menu mode typed by hand, and Ctrl+C out of follow mode.

### Known limits

- The bend of a shared segment comes from the first line drawn on it.
- Template station names are English only (no verified Cantonese source yet).
- The regex builder uses the browser's JavaScript engine; other engines' syntax is not offered.
- The hosted server has no sign-in.

## Next steps

See `ROADMAP.md`, Phase 3.
