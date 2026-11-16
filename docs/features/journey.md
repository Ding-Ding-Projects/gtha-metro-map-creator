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

## Test API

`window.GMMCJourney.plan(fromId, toId, band)` returns `{ ok, total, changes, legs }` where each leg
is a ride (`lineId`, `from`, `to`, `stops`, `minutes`, `wait`, `change`, `dirTo`) or a walk.
`window.GMMCJourney.times(fromId, band)` returns minutes by station id.

## Verification

`scripts/verify/journey.steps.json` drives the editor in headless Edge with
`scripts/verify/edge-drive.mjs`: it plans several trips, checks one-to-all coverage, fills the form
and captures the side sheet and the colouring.
