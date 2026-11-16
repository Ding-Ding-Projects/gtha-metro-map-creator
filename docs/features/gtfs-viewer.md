# GTFS viewer

The GTFS viewer (`site/gtfs/`) opens any GTFS Schedule feed in the browser and shows every part of it. It has English and Cantonese text, light, dark and system themes, keyboard access and a narrow layout that works at 390 px. Everything runs in the browser; no feed is uploaded.

## Opening a feed

| Way | How |
| --- | --- |
| File | **Open feed**, **Open a GTFS .zip file**, or drop a `.zip` on the page |
| Web address | **Open from a web address**. The server must allow cross-origin downloads; otherwise the viewer explains that and asks you to download the file first. A `?feed=` query parameter does the same on load |
| From the map editor | **Export, View this map as GTFS** builds the feed with the GTFS exporter and passes it to the viewer through IndexedDB in the same browser |

Parsing happens in `gtfs-worker.js`. `stop_times.txt` and `shapes.txt` become typed arrays (the trip index, stop index, times and flags), all other tables become arrays of row objects with interned strings, and `locations.geojson` is parsed as JSON. Each file shows its own progress bar. Lists and tables are virtualised, so feeds with millions of stop times do not freeze the page. The worker is separate from the editor's importer (`site/app/gtfs-worker.js`), which is unchanged.

## Views

| View | What it shows |
| --- | --- |
| Overview | `feed_info`, agencies, attributions, service range with trips per day, route type breakdown including extended types, file row counts, a map of all routes, translations, validation summary |
| Routes | Search, agency, type and network filters, list or grid with drawn route thumbnails. A route has a map with direction arrows, patterns (distinct stop sequences), stops, a timetable grid for any date and direction (CSV export, timepoints, pickup and drop-off marks, frequency runs, `shape_dist_traveled`), trips per hour, headways by time band, first and last trip, continuous pickup and drop-off, and networks |
| Stops | Search and location type filters, a clustered map, the station hierarchy (`parent_station`, levels, platform codes, wheelchair boarding), routes serving the stop, a departure board for any date and time, transfers and a pathway graph |
| Trips | Search, trip detail with stop times, shape, block neighbours, frequencies and realtime delays |
| Blocks | A Gantt chart of every vehicle block for the date, one row per block, bars coloured by route, with zoom and time sliders, layover and deadhead gaps, overlap flags and vehicles in service by hour |
| Calendar | A month view per service with `calendar_dates.txt` exceptions, the services that run on a date and trips per day across the feed range |
| Shapes | Point counts and lengths, unused shapes and shapes shared by several routes, drawn on the map |
| Transfers | `transfers.txt` with every `transfer_type` (including 4 and 5), `pathways.txt` as a graph, `levels.txt` |
| Fares | Fares v1 and every Fares v2 table with resolved references |
| Flex | `locations.geojson` zones on the map, location groups, booking rules and pickup and drop-off windows in `stop_times.txt` |
| Validation | Required files and columns, ID uniqueness, referential integrity, time order, `shape_dist_traveled`, speed outliers, unused entities, calendar ranges and colour contrast. Each finding opens the entity |
| Realtime | A GTFS Realtime `.pb` file or address: vehicles on the map, trip updates and alerts. A built-in reader decodes the protobuf |
| Data files | Every file in the archive. Unknown files and columns appear exactly as they are |

`Ctrl K` (or `/`) searches routes, stops, trips, blocks and services.

## Deep links

The page address carries the view, for example `#route/601`, `#stop/123`, `#trip/T1`, `#block/20261116/B1`, `#service/WK`, `#shape/SH1` and `#data/stops.txt`.

## Add to map

Tick the add button on route rows (or leave nothing ticked for the whole feed) and choose **Add to map**. The viewer hands the original ZIP and the chosen route IDs to the editor through IndexedDB; the editor opens its existing GTFS import window with those routes ticked.

## Map and tiles

Maps use OpenStreetMap raster tiles with attribution, drawn on a canvas; no third-party scripts are loaded. Offline, the map still draws routes and stops without a background.

## Verification

`scripts/verify/make-gtfs-fixture.mjs` writes a hand-made feed (`scripts/verify/fixtures/viewer-feed.zip`) that exercises every file the viewer reads, with deliberate validation problems, and `scripts/verify/gtfs-viewer.steps.json` drives it in headless Edge. See `HANDOFF.md` for the recorded results.

## Limits

ZIP64 and encrypted archives are not read. Realtime protobuf support covers vehicle positions, trip updates and alerts. Extra columns of `shapes.txt` are not kept.
