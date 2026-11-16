# Map format

```json
{
  "version": 1,
  "title": "GTHA Rapid Transit",
  "titleZh": "",
  "stations": { "union": { "name": "Union", "nameZh": "聯合", "x": 0, "y": 4, "lat": 43.64564, "lon": -79.38021,
                          "kind": "station", "label": "auto", "interchange": "auto" } },
  "lines": [{ "id": "l1", "name": "Line 1", "nameZh": "", "color": "#F8C300", "width": 10,
              "style": "solid", "visible": true, "path": ["union", "@2,2", "king"], "bends": { "0": "late" },
              "freq": { "peak": 4, "midday": 5, "evening": 6, "weekend": 8 }, "showFreq": true, "note": "",
              "skip": ["king"], "branches": [["union", "osgoode"]] }],
  "transfers": [{ "a": "union", "b": "union_go" }],
  "labels": [{ "id": "note1", "x": 0, "y": 10, "text": "Note", "size": 12 }]
}
```

- `label`: `auto` or one of `E W N S NE NW SE SW`.
- `interchange`: `auto`, `yes` or `no`.
- `style`: `solid` (subway or metro), `dashed` (planned), `rail` (regional rail), `brt` (rapid bus), `bus`, `express` or `superExpress`.
- `kind`: `station` or `stop` (bus stop). `lat`, `lon`: optional real position. `osm`: optional OpenStreetMap node ID.
- `facilities` (stations, optional): array of `accessible`, `parking`, `bike`, `airport`, `ferry`, `busTerminal`. Unknown values and duplicates are dropped on load; an empty list is omitted. See [facilities.md](facilities.md).
- `freq.peak`, `freq.midday`, `freq.evening`, `freq.weekend`: minutes between vehicles, 1 to 240, or `null`. Files with the older `freq.offpeak` still open; it is read as `midday`. `showFreq`: show the badge, which reads `peak/midday` when both are set.
- `skip` (optional): station IDs on the line's path that this route passes without stopping. IDs not on the path are dropped.
- `branches` (optional): extra paths that share the line's name, colour, style and frequency. Each is an array of at least two station IDs (no bend points). See [patterns.md](patterns.md).
- `transfers`: walking links between two stations.
- `opens`, `closes`: optional years (integers, 1800 to 2100) on a line or a station, used by the network timeline. Absent means unknown or always open. See [timeline.md](timeline.md).
- `width`: 3 to 16.

## Import validation

`validateMap()` requires `version: 1`, a `stations` object and a `lines` array, drops path
references to missing stations, clamps lengths and numbers, and rejects files over 5 MB.

## GTHA template

`site/app/gtha-template.js`. Schematic coordinates, simplified station lists, approximate
colours, and unofficial Traditional Chinese names for every station and line (`ZH` and `LINE_ZH`).
`scripts/build.mjs` fails if any path reference is missing, a station is on no line, or a station
or line has no Chinese name.

## Project files

`Save project` writes `{ "format": "gtha-metro-map-creator-project", "version": 1, "savedAt",
"map", "settings": { layout, background, bgOpacity, showFreq, fontSize, legend, lang,
liveStops, freqWeight }, "view" }`. Opening it restores the map and those settings. A plain map file opens too.
