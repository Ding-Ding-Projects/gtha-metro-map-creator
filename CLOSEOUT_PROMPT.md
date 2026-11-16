# Closeout prompt

```text
Project: GTHA Metro Map Creator (github.com/Ding-Ding-Projects/gtha-metro-map-creator), public, MIT.
Branch: main only.

Version 1.2.0 (this commit, tagged v1.2.0):
- Geographic layout over OpenStreetMap tiles (default) and the schematic layout; real coordinates
  for all template stations; label priority and collision culling.
- VIVA Blue, Purple, Orange and Yellow with real stops and weekday frequencies (York Region Transit
  GTFS, 1 Nov to 19 Dec 2026); service types bus, rapid bus, express, super express; frequency
  badges; bus stops; walking transfers.
- Draw onto real stops from Overpass at street level, with a custom server setting and fallbacks.
- Exports: PNG and PDF with background, SVG, single-file hostable website; project save and open.
- Material Design 3 interface with motion; design artboard Editor2 in design/ with review notes.

Verified locally in headless Edge: fit, VIVA badges, inspector edits, all exports, project
round trip, schematic, dark Cantonese, 390 px phone, drawing onto real stops (OpenStreetMap data
replayed locally because every public Overpass server was at capacity).

Open:
- Live stops against a public Overpass server (busy during testing).
- Wiki first page, Discussion pin and a GitHub Project need a signed-in GitHub web page.
- Executables are not code signed. PDF is a raster image. Bus stops have no Chinese names.

Release v1.2.0 verified: all workflows green, normal release with both executables, released
desktop executable hash-checked and run. Discussion #2 announces it.

Next safe steps: the three web-page items, then ROADMAP.md Phase 4.
```
