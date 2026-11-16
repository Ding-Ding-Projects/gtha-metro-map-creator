# Geographic layout, map background and real stops

## Layouts

`settings.layout` is `geographic` (default) or `schematic`. Stations keep schematic `x`, `y`
(grid units) and optional real `lat`, `lon`.

- Projection: Web Mercator at zoom 13, origin at Union Station (`ORIGIN` in `app.js`). One grid
  unit is 24 px at that zoom. `geoGrid()` and `gridToLatLon()` convert.
- `dm(k)` builds the drawn map: in the geographic layout every station is placed at its real
  position times the zoom `k`, and the viewport is only translated, so lines, stations, labels
  and badges keep a constant screen size while the background zooms. Bend points (`@x,y`) are
  kept but placed on the straight line between their stations, so segment indices match the
  stored map and every edit works in both layouts.
- `fits()` fits two least-squares affine transforms between schematic and geographic grid
  positions from all stations that have both; new stations get a position in the other layout.

## Background

OpenStreetMap raster tiles from `tile.openstreetmap.org`, drawn as persistent SVG `<image>`
elements (added and removed as the view changes, at most 300). Strength is `settings.bgOpacity`;
dark theme applies an invert and hue-rotate filter. Attribution is always shown with tiles and is
written into exports. Tiles need a network connection.

## Real stops

At tile zoom 15 or more, `fetchLiveStops()` asks Overpass for `highway=bus_stop`,
`public_transport=platform` and railway stations in the view (at most 400), debounced by 700 ms
and cached by bounding box. It tries `settings.overpassUrl` (https, or http on localhost) and then
three public servers, with a 25-second timeout each. Clicking a stop with the Route tool adds a
station of type `stop` with the OSM name, position and node ID (`osm`) to the active route.

Failure modes: public servers at capacity (HTTP 502/504) or rejecting the request (406); a
snackbar offers Retry. Only the bounding box of the current view is sent.

## Verification

- Headless Edge at 1440 x 900 and 390 x 844: fit, Viva selection, street-level view, schematic,
  dark Cantonese, export menu, settings; no horizontal overflow.
- Drawing onto real stops: verified with OpenStreetMap platform data captured from Overpass the
  same day and replayed by a local server, because every public Overpass server was at capacity
  during testing.
