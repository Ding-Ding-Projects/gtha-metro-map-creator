# GTFS export

Export menu, **Export GTFS feed** builds a GTFS feed (ZIP) from the current map and downloads it as
`<map title>-gtfs.zip`. Code: `site/app/mod-gtfs-export.js`. From other code,
`window.GMMCGtfsExport.build()` resolves to the ZIP `Blob` and `window.GMMCGtfsExport.files()`
returns an object of CSV strings keyed by file name.

## Feed contents

| File | Contents |
| --- | --- |
| `agency.txt` | One agency named from the map title, timezone `America/Toronto`, the project site as URL |
| `stops.txt` | Every station on a visible line. Coordinates come from `lat`/`lon`, or are estimated from the schematic position through `gridToLatLon(fits().toGeo(...))` when missing. `stop_id` is the station id |
| `routes.txt` | One route per visible line with two or more stations. `route_type`: solid, dashed, express and super express are 1, rail is 2, BRT and bus are 3. `route_color` is the line colour without `#` |
| `calendar.txt` | `WEEKDAY` (Monday to Friday) and `WEEKEND` (Saturday and Sunday) from today for one year |
| `trips.txt` | Per route, per service and per direction one template trip. Each branch adds its own pair of trips and its own shape. One-way lines have direction 0 only |
| `stop_times.txt` | Template trip times: distance divided by the style speed (as in the journey planner) plus 24 s dwell. Stations in the line's `skip` list are passed without a stop time. `timepoint` is 0 |
| `frequencies.txt` | Weekday peak 07:00 to 09:00, midday 10:00 to 15:00, evening 19:00 to 22:00; weekend 08:00 to 20:00. `headway_secs` is minutes times 60, `exact_times` is 0 |
| `shapes.txt` | Stop coordinates in order, one shape per route variant and direction |
| `feed_info.txt` | Publisher, language `en`, start and end dates, version equal to today's date |

Bands without a frequency are omitted. The midday band uses `midday`, or `offpeak` in older files;
the weekend band falls back to midday. A line with no frequency at all gets a 10 minute headway in
every band. Fields are CSV-escaped (quotes, commas and line breaks) and the ZIP uses deflate with
CRC-32, falling back to stored entries when `CompressionStream` is unavailable.

## Round trip with the importer

The importer (`gtfs-worker.js`) now reads `frequencies.txt`. A trip with frequency rows is expanded
to one start time per headway step in each window, and the headway reported for a band comes from
the window that overlaps it most, so an exported 11 minute peak imports as 11 rather than a value
rounded from a start count. Feeds without `frequencies.txt` behave as before.

## Verification

`node scripts/verify/make-gtfs-export-steps.mjs` writes `scripts/verify/gtfs-export.steps.json`;
run it with `scripts/verify/edge-drive.mjs`. It builds the feed from the GTHA template (20 routes,
238 stops), checks required columns and references (every stop time stop, trip route, service and
shape exists), parses the ZIP and verifies each CRC, then imports it into a blank map and compares
route count, stop counts and peak/midday headways (Viva Blue: 27 stops, 11 and 15 minutes).

## Limits

Times are estimates from straight-line distance and style speed, not a timetable. One agency, one
timezone, no transfers, fares or calendar exceptions. Cantonese names are not exported.
