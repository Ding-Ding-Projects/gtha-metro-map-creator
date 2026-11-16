# Service patterns

Implemented in `site/app/mod-patterns.js` and `mod-patterns.css`, plus small changes to `app.js` (listed below).

## Stops and passes

`line.skip` lists stations on the route's path that it passes without stopping. In the inspector, a selected route shows a **Stops** list with one row per station and a **Stops / Passes** chip. The chip writes `line.skip` (terminals always stop, so their chip is disabled). The list scrolls when long.

On the map, a station that every visible route through it skips gets no stop marker (the editor shows only a small dot so it can still be selected; exports show nothing, and its label is dropped). A station where one route stops and another passes keeps its marker. Interchange detection (`interchange: auto`) counts only routes that stop there.

## Branches

`line.branches` is an array of extra station paths that share the line's identity. They are drawn by a `transform` hook that turns each branch into an extra drawn line with the id `<lineId>~b<index>`, so parallel offsets still work and the stored map is unchanged. A branch has no frequency badge of its own, and it does not add a second interchange at the junction.

In the inspector:

- A **Branches** list shows each branch with its stop count, a **Draw** toggle and **Delete branch**.
- The `+` button on a station row, or **Add branch from this station** when a station on the active line is selected, starts a branch at that station and switches to the Route tool.
- While a branch is armed (**Drawing**), Route tool clicks on existing stations append to that branch instead of the main route. Clicks on empty map show a hint. Press Escape or toggle **Draw** to stop.

Branches use station references only. Branch segments in the editor are not click targets; select a branch through the line's inspector.

## Frequency by time of day

`line.freq` is `{ peak, midday, evening, weekend }`, minutes 1 to 240 or `null`. The inspector shows four fields. The map badge, legend and exported website show `peak/midday` when both exist and differ, otherwise the first value that is set. Older `offpeak` values are read as `midday` and are replaced when edited.

## Frequent-network style

The Settings switch **Line weight follows frequency** (saved with settings and with projects) sets the drawn width from the peak headway: 10 px up to 10 minutes, 7 up to 15, 5 up to 30, 3 beyond. Routes without a frequency keep their own width. It is applied by a `lineStyle` hook, so it affects the editor and exports but not stored data.

## Changes to `app.js`

`validateMap` (frequency bands), `freqText`, `isInterchange`, `isInterchangeIn`, `buildMapSvg` (markers for passed stations, no edge hit targets for branch lines), `renderInspector` (four frequency fields, new `freqField` helper), the inspector `input` handler (frequency keys), `newLine`, `eraseEdge` (splitting a route keeps `skip` and does not duplicate branches), `projectJson` and `loadText` (the `freqWeight` setting).

## Verification

`node scripts/verify/make-patterns-steps.mjs` writes `patterns.steps.json`; run it with `node scripts/verify/edge-drive.mjs http://localhost:8772/app/ scripts/verify/patterns.steps.json <out dir>` against `node scripts/serve.mjs 8772 site`.
