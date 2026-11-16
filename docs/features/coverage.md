# Coverage analysis

`site/app/mod-coverage.js` adds a "Coverage, 800 m walk" section to the right panel. It counts how
many people live within walking distance of the stations on the visible lines and can draw the
walksheds on the map. It reads the map through the extension API and changes nothing in the map
file.

## What it shows

- **People within 800 m** of any station on a visible line, **within 400 m**, and **near frequent
  service** (within 800 m of a station served by a line whose peak headway is 10 minutes or
  better). Each census point is counted once, even when several stations are near it.
- The share of the GTHA population that figure represents (7,281,694 people in the six census
  divisions).
- **By line**: the people within 800 m of each visible line's stations, again without double
  counting inside the line.
- **Show walksheds**: translucent 800 m discs and dashed 400 m rings around each counted station.
  They are drawn in the geographic layout only (the radius is real metres at the current zoom, so
  it follows the background map) and are not written into exports.
- **Use as baseline / Clear baseline**: remembers the current 800 m figure and shows the change
  against it as the map is edited, for example "+186 k vs baseline". The scenarios module is not
  required.

Stations without real coordinates are skipped and the panel says how many. Hidden lines and
stations a line skips do not count. Only people are counted: employment by small area is not
published as open data at this level, so no jobs figures are shown or invented.

## Data

`site/app/gtha-population.js` holds `window.GTHAPopulation = { source, licence, year, points }`,
where each point is `[lat, lon, population]` for one 2021 dissemination area (9,378 points,
225 KB). The Statistics Canada 2021 Census and its Open Licence apply. Sources, processing and
totals are in `scripts/data/README.md`; regenerate with `scripts/data/make-population.mjs`.

## Method and limits

- A dissemination area is treated as a point at its polygon centroid and counted whole when that
  point is inside the radius. A large rural area, or one cut by a ravine, can be misplaced by its
  centroid; downtown areas are small, so the error is small where stations are dense. No
  population is split between areas or weighted by land use.
- Distances are straight lines on the sphere, not walking routes. Barriers (rail corridors,
  highways, water) are ignored, so the figures are upper bounds on true walk access.
- 400 m and 800 m are conventional five and ten minute walks. They are not adjustable.
- The built-in template carries peak frequencies only for the VIVA lines (11 to 17 minutes), so
  "near frequent service" is 0 there until a line is given a peak frequency of 10 minutes or less.
- The data are a 2021 snapshot and are not projected forward.

## Verification

`scripts/verify/coverage.steps.json`, run with `scripts/verify/edge-drive.mjs` against
`site/app` in headless Edge:

- Union Station: the module reports 9,989 people within 400 m and 38,684 within 800 m (18 areas);
  an independent haversine sum over the raw points in the page gives the same figures.
- Whole template (238 stations): 596,770 within 400 m and 1,497,861 within 800 m (20.6%); an
  independent brute-force nearest-station check gives the same totals. Computing takes a few
  milliseconds.
- The walkshed radius at zoom 4 is 231.9 px against 231.4 px expected from the Web Mercator scale.
- English and Cantonese panel text, baseline difference, toggling walksheds and no page errors.
