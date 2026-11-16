# Journey planner and travel times

`site/app/mod-journey.js` adds a "Plan a trip" section at the top of the right panel and a
travel-time colouring of the map. It reads the map through the extension API and changes nothing
in the map file.

## Plan a trip

Pick a From and To station (type a name or a Chinese name, or choose from the list), then a time
band: Peak, Midday, Evening or Weekend. The planner finds the fastest trip and shows the total
time, the number of changes, and one step per boarding, ride, change and walk. The trip is drawn
on the map with a halo along the travelled segments and markers at each boarding and alighting
station. The figures are estimates built from the map, not a timetable.

## How a trip is timed

- Ride time between consecutive stops is distance divided by a speed for the line style: solid 32
  km/h, regional rail 55, bus rapid transit 24, bus 18, express 41.6, super express 51.2, planned
  (dashed) 30. Each ride segment also adds 0.4 minutes for a stop. Distance is the great-circle
  distance when both stations have coordinates, otherwise grid units at 0.9 km each.
- Boarding costs half the headway of the chosen band. Peak uses `freq.peak`; midday uses
  `freq.midday`, else `freq.offpeak`; evening uses `freq.evening`, else 1.3 times midday; weekend
  uses `freq.weekend`, else midday. A missing frequency counts as 10 minutes.
- Changing line at the same station adds 3 minutes plus the new boarding wait.
- Walking transfers from `map.transfers`, and any two served stations within 400 m (real
  coordinates), cost distance at 4.8 km/h, at least 2 minutes, plus the boarding wait.
- A station listed in a line's `skip` array can be passed but not boarded or left there. Lines
  are assumed to run both ways unless the line sets `oneWay`.
- Hidden lines are ignored. The search is Dijkstra with a binary heap over (station, line) states.

## Travel times

"Show travel times from <station>" colours every reachable station by minutes: up to 15, 30, 45
and 60 minutes, and over 60. A legend appears at the bottom left of the map; its close button
clears the colouring. The colouring is drawn through the `svgOver` hook, so SVG and PNG exports
include it, with a legend line under the map.

## Travel times between stops

When the map is zoomed in, a small pill at the middle of each segment of each route shows the time
between its two stops, for example `~3 min`. Geographic layout shows pills from about 120% zoom and
schematic layout from about 90%. A pill is skipped when it would not fit on a short segment or would
cover a station marker, a station label, a frequency badge or another pill. Track shared by a route
and its branches gets one pill, and when two routes share a segment only one pill is drawn.

- **Estimated** times are lighter, have a dashed outline and start with `~`. They are the planner's own
  estimate: distance divided by the speed for the line style, plus the dwell at the stop.
- **Times you set** look solid and have no `~`. They are stored as `line.times`
  (see [map-format.md](map-format.md)) and are direction-agnostic.
- **Set a time** in the inspector, under **Travel times** for the selected route: one row per pair of
  stops with a stepper (minus, minutes, plus), the estimate as supporting text and a reset button.
  Or click a pill in the Select tool to open a small popover with the same stepper. Empty means
  "use the estimate". Values must be 0.1 to 600 minutes. Every change is one undo step.
- **Consumers**: the planner's ride times, the simulation's vehicle positions and the GTFS export's
  `stop_times.txt` all read the same value through `GMMCJourney.segmentMinutes(line, a, b)`. A set time
  includes the dwell at the first stop.
- **Settings**: **Show travel times when zoomed in** (on by default) and **Include travel times in image
  exports** (off by default). Exports cover PNG, SVG, PDF and the single-file web page, all built from the
  same SVG. Both settings are saved with the project.

## Test API

`window.GMMCJourney.plan(fromId, toId, band)` returns `{ ok, total, changes, legs }` where each leg
is a ride (`lineId`, `from`, `to`, `stops`, `minutes`, `wait`, `change`, `dirTo`) or a walk.
`window.GMMCJourney.times(fromId, band)` returns minutes by station id.
`segmentMinutes(line, a, b)` returns the minutes between two stops of a line (the set value or the estimate),
`segmentOverride(line, a, b)` returns only the set value or `null`, and `estimateMinutes(line, a, b)` only the estimate.

## Verification

`scripts/verify/journey.steps.json` drives the editor in headless Edge with
`scripts/verify/edge-drive.mjs`: it plans several trips, checks one-to-all coverage, fills the form
and captures the side sheet and the colouring.
