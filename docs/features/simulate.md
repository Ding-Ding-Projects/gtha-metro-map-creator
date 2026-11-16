# Live service simulation

Press **P**, or use the bus button in the map controls, to run the network. Vehicles travel both
directions along every visible route and are drawn as dots in the route colour on a canvas over the map.
A bar at the bottom of the map holds the controls.

## Controls

- **Play / pause** (round button). With reduced motion requested by the system, nothing animates
  continuously; a **Step** button advances one minute instead.
- **Clock and band label.** The clock starts at 08:00. The label shows the service band for that time;
  click it to switch between weekday and weekend.
- **Speed**: 1x, 10x or 60x real time.
- **Vehicle count** for all routes at the current band.
- **Record clip**: records 10 seconds to a WebM file (see below).

## Model

For each visible route the headway comes from the frequency of the current band: weekday peak 07:00 to
09:00 (`freq.peak`), midday 10:00 to 15:00 (`freq.midday`), evening 19:00 to 22:00 (`freq.evening`),
weekend (`freq.weekend`). A band without a value falls back to `freq.offpeak`, and if that is empty to 10
minutes. All other times use the off-peak value.

- Speed by route style: solid 32 km/h, regional rail 55, BRT 24, bus 18, express 1.3 times solid,
  super express 1.6 times solid, dashed 30.
- Each stop (every station or stop node on the route, but not bend points) has a 30 second dwell.
  Stations listed in `line.skip` have none.
- Length is the sum of great-circle distances between consecutive stops when all have coordinates,
  otherwise the drawn length in grid units times 0.9 km. The stop spacing along the drawn line is
  proportional to its drawn distance.
- Vehicles per direction are `ceil(one-way time / headway)`, spaced one headway apart in time:
  position = (clock + k x headway) mod one-way time, mapped through the dwell and running segments.
  The opposite direction is offset by half a headway.

The drawn geometry is recomputed on every render, so edits, layout changes and zoom are followed. The
loop pauses while the tab is hidden.

## Record clip

The clip shows the whole map as exported (white background, no map tiles) with the vehicles and the
clock, 30 frames per second, using `MediaRecorder` with `video/webm`. A browser without them shows a
message instead. The clip uses the same time and speed as the live view.

## Script access

`window.GMMCSim` exposes `start()`, `stop()`, `state()`, `play()`, `pause()`, `step(seconds)`,
`setSpeed(n)`, `setClock('HH:MM')`, `setWeekend(bool)`, `setReducedMotion(bool|null)` and
`record({ seconds, download, toast })`. `state()` returns the clock, band, total and, per line,
the headway, one-way minutes, length and vehicle count.

Verification: `scripts/verify/simulate.steps.json` with `scripts/verify/edge-drive.mjs`.
