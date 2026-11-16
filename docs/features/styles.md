# Map style presets

Implemented in `site/app/mod-styles.js` and `mod-styles.css` through the hooks in `extensions.md`. Strings are English and Cantonese (`I18N.add`).

## Presets

| Preset | Lines | Stations | Labels | Page colours |
| --- | --- | --- | --- | --- |
| Material (default) | Round caps, current look | Rings | Mixed case | White paper |
| Classic metro | Square caps, mitred joins | Non-interchange stations and stops are ticks across the line; interchanges keep a ring | Capitals, bold | White paper |
| Frequent network | Width follows frequency: peak (or off-peak) headway up to 10 min is 10 px, up to 15 min 7 px, up to 30 min 5 px, longer 3 px. Routes with no frequency are 3 px grey | Rings | Mixed case | White paper |
| Night | Line colours lightened 30% | Dark centre rings, white ring for interchanges | Light labels | Dark map, dark paper in every export; OpenStreetMap tiles are inverted |

## Where it is chosen

- The "Map style" cards in the right panel (under the inspector).
- The same cards in Settings, in the Map group.

The choice is saved in `settings.mapStyle` (browser storage) and in project files (`settings.mapStyle`, read back when a project opens). An unknown value falls back to Material. Reset settings returns to Material.

## How it works

`app.js` gained three small hooks, all optional and defaulting to the old drawing:

- `stationMarker(map, station, { inter, col, cx, cy, geo, G, opts })`: first non-empty return replaces the circle marker.
- `labelStyle(map, station, { inter, small })`: `{ upper, weight }` for the label text. Capitals widen the label rectangle so placement still avoids overlaps.
- `exportTheme()`: `{ bg, ink, halo, sub, tileFilter }` for SVG, PNG and PDF exports (paper colour, label colours, tile filter).

`lineStyle` (existing) changes caps, width and colour. `linePaths` reads `line.cap` and `line.join`. The data attribute `#stage[data-mapstyle]` carries the preset for CSS (the Night surface and tile filter in the editor).

## Failure modes and limits

- A route with no frequency is shown thin and grey under Frequent network even when the route is meant to be frequent; set its frequency in the inspector.
- Classic ticks use the nearest drawn vertex of the first serving route. A station with no nearby vertex keeps its ring.
- Night changes only drawing and export colours. It does not change the line colours stored in the map.
- The legend uses each route's style as drawn.

## Verification

`scripts/verify/print.steps.json` (see `print.md`) switches every preset, counts square caps, ticks and capital labels, checks persistence and the project file, and takes a screenshot of each.
