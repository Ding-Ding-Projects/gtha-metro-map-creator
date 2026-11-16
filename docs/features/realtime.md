# Live vehicles (desktop app only)

Shows the current position of York Region Transit and TTC vehicles on the geographic layout, drawn
as small markers coloured by the matching map line.

## Why only the desktop app

Transit agencies publish their live feeds without the headers a web page needs to read them
(CORS), so a browser cannot fetch them directly. The desktop app fetches them from its main
process and hands the bytes to the page. In the web editor the control is shown disabled with the
message "Live vehicles need the desktop app because transit agencies do not allow browsers to
read their live feeds directly."

## Using it

- Settings, "Live vehicles", or the bus button in the map controls, turns the feature on or off.
  The choice is remembered on this computer and applies the next time the desktop app starts.
- While on, the feeds are polled every 30 seconds. Polling pauses when the window is hidden and
  resumes with an immediate refresh when it is shown again.
- A chip at the bottom left reads "Live, updated hh:mm:ss" and the vehicle count. If no update has
  succeeded for 2 minutes the markers fade and the chip reads "Stale, last update hh:mm:ss".
- If a feed fails, a message appears once and the last good positions stay on the map.
- Markers appear in the geographic layout only, never in exports. In the schematic layout the chip
  explains that live vehicles need the geographic layout.
- Hover a marker for the vehicle id and route.

## Route colours

A vehicle takes the colour of a map line when its route id equals the line id, equals a route
number of three or more characters in the line name (for example a line named "504 King" matches
route 504), or appears in an optional `routeIds` list on the line. Everything else is neutral
grey. The feeds carry route ids, not route names, so lines imported from GTFS or named after
their route numbers match best.

## Feeds

| Agency | Address | Notes |
| --- | --- | --- |
| York Region Transit | `https://rtu.york.ca/gtfsrealtime/VehiclePositions` | GTFS-Realtime, no key needed |
| TTC | `https://bustime.ttc.ca/gtfsrt/vehicles` | GTFS-Realtime, no key needed, covers buses and streetcars (subway trains are not in the feed) |

The desktop app fetches only these exact addresses (allow-list in `desktop/app/main.js`). Each request
times out after 15 seconds, follows no redirects and is capped at 5 MB.

## Terms and limits

The data belongs to the agencies and is provided under their open data terms: York Region's open
data licence and the City of Toronto Open Licence for the TTC feed. Check the current terms on
their open data pages before redistributing the data. The editor does not store or republish the
positions; they exist in memory while the feature is on. Positions are as accurate and as recent as
the agency supplies them, so vehicles can lag by a minute or more, and some vehicles on a trip may
be missing. Feeds can change address or become unavailable without notice. Feeds are read as
GTFS-Realtime VehiclePositions with a small hand-written protobuf reader in
`site/app/mod-realtime.js` (no library).

## Verification

`scripts/verify/realtime-check.mjs` checks the protobuf reader against a downloaded feed file.
`scripts/verify/realtime.steps.json` drives the built desktop app hidden: enable live vehicles,
wait for one poll, and confirm markers and the chip text.
