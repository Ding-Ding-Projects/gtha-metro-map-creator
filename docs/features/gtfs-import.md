# GTFS import

Export menu, **Import GTFS** (or drop a `.zip` file on the editor) opens a dialog that reads a
GTFS feed and imports chosen routes as lines and stations. Code: `site/app/mod-gtfs-import.js`
(dialog and import), `site/app/gtfs-worker.js` (feed reader, runs in a Web Worker),
`site/app/mod-gtfs-import.css`. `window.GMMCGtfs.open(file)` opens the dialog from other code
(a `File`, or nothing to show the file chooser).

## Behaviour

1. The worker opens the ZIP through its central directory and reads entries stored or deflated
   (native `DecompressionStream('deflate-raw')`). ZIP64 and encrypted archives are rejected.
2. Small tables (`routes`, `trips`, `stops`, `calendar`, `calendar_dates`, `agency`, `feed_info`)
   are read whole. `stop_times.txt` is streamed line by line, holding only the current trip, so
   large feeds do not exhaust memory. Quoted fields, a byte order mark and CRLF are handled.
3. The dialog is a wide two-pane layout (about 920 px; the panes stack below 720 px, preview
   first). The left pane has a feed card (file name, route count, stop count, service dates,
   **Change file**), a search field, type chips with icons and a check on the selected one, and the
   route list. Each 64 px row is a checkbox with a badge in the route's `route_color` (text colour
   chosen for contrast; a fallback colour by type when the feed has none), name, type and stop count,
   and the peak / midday headway. The right pane draws the selected routes' stop sequences in their
   colours, fitted to the box and redrawn as the selection changes, and an **Adds to your map** card
   with routes, new stops and merged stops. The merged count and the import use the same 150 m
   matching code (`resolver` in `mod-gtfs-import.js`), so the preview matches what is created.
   Space toggles the focused row, Enter imports, Escape closes. Dialog entry, row tint and the
   preview line draw-in are animated and switched off under `prefers-reduced-motion`. Strings are
   English and Cantonese through `I18N.add`; colours come from the Material Design 3 tokens, so light
   and dark themes both work. The feed card's stop count is the number of distinct stops used by the
   listed routes, not every row of `stops.txt`.
4. **Import** adds one undo step. It creates stations, then a line per selected route, then fits
   the map and shows a toast.

## Route type mapping

| `route_type` | Class | Line style | Width | Station kind |
| --- | --- | --- | --- | --- |
| 0, 900 to 999 | Light rail or tram | solid | 6 | station |
| 1, 400 to 499 | Subway or metro | solid | 8 | station |
| 2, 100 to 199 | Rail | rail | 8 | station |
| 3, 11, 700 to 799 | Bus | bus | 5 | stop |
| other | Other | solid | 6 | station |

The class comes only from `route_type`. Line colour is `route_color`, or a palette colour when
the feed has none.

## Stops and the merge rule

For each route the worker picks the busiest pattern: the most common ordered stop list for one
direction on the representative weekday. Each stop becomes a station named from `stop_name`
(a trailing "Platform N" or "Stop # N" is removed, and all-capital names are title-cased). A stop
within 150 m of an existing station that has real coordinates, or of one created earlier in the
same import, is merged into it, so re-importing a route adds no duplicates and routes that share
stops share stations. The schematic `x`, `y` come from the map's own least-squares fit
(`GMMC.fits().toGrid(GMMC.geoGrid(lat, lon))`), rounded to 0.5. Stations always get `lat` and `lon`.

## Headway method

The representative days are the Tuesday to Thursday and the Saturday with the most services
running, after `calendar.txt` day flags and date ranges and `calendar_dates.txt` additions and
removals are applied. For the chosen direction of a route, scheduled trip starts (first
departure) in a window are counted and the headway is window minutes divided by trips, rounded;
it is empty when fewer than two trips fall in the window.

| Band | Window |
| --- | --- |
| peak | 07:00 to 09:00 |
| midday | 10:00 to 15:00 |
| evening | 19:00 to 22:00 |
| Saturday | 10:00 to 18:00 |

The line gets `freq.peak` and `freq.offpeak` (midday). Evening and Saturday headways are written
into the line note, because the map format has only the two frequency fields. The note also
names the feed and its service dates.

## Limits and failure modes

- Not implemented: fetching a feed by URL (browsers block most feeds with CORS), and route
  shapes (`shapes.txt` is not read; lines follow the stop sequence).
- `stop_times.txt` must list each trip's rows together (the GTFS norm). Rows of a trip that
  reappear after other trips are skipped and counted in the feed summary.
- Frequency-based feeds (`frequencies.txt`) are not expanded; their headways come out empty.
- A route without two usable stops or without service on the representative days is not listed.
- Dense bus stops can land closer than the schematic grid; the schematic needs hand tidying
  after a large import.
- Errors (not a ZIP, a required file missing, damaged entry) are shown in the dialog, and the
  map is untouched.

## Verification

`scripts/verify/gtfs-import.steps.json` drives the built page in headless Edge with the York
Region Transit feed (1 November to 19 December 2026): `node scripts/serve.mjs 8781 site`, copy
the feed to `site/test-feed.zip` (never commit it), then
`node scripts/verify/edge-drive.mjs http://localhost:8781/app/ scripts/verify/gtfs-import.steps.json <out dir>`.
It checks the route list, Viva Blue headways (11 and 15 minutes), selection, import, merging on
a second import, and takes dialog and result screenshots.

## Verification

`scripts/verify/gtfs-import-ui.steps.json` drives the dialog in headless Edge with
`scripts/verify/edge-drive.mjs` (run it at 1440x900 and 390x844): it exports the GTHA template as a
GTFS feed in the page, opens it in the dialog, checks the route list, badges, preview path count and
the "Adds to your map" numbers as routes are selected, search and chips, tab order, Cantonese strings,
dark theme, Enter-to-import and no horizontal overflow, then imports every route into a blank map and
compares stop counts and headways against the source lines.
