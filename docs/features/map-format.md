# Map format

```json
{
  "version": 1,
  "title": "GTHA Rapid Transit",
  "titleZh": "",
  "stations": { "union": { "name": "Union", "nameZh": "", "x": 0, "y": 4, "label": "auto", "interchange": "auto" } },
  "lines": [{ "id": "l1", "name": "Line 1", "nameZh": "", "color": "#F8C300", "width": 10,
              "style": "solid", "visible": true, "path": ["union", "@2,2", "king"], "bends": { "0": "late" } }],
  "labels": [{ "id": "note1", "x": 0, "y": 10, "text": "Note", "size": 12 }]
}
```

- `label`: `auto` or one of `E W N S NE NW SE SW`.
- `interchange`: `auto`, `yes` or `no`.
- `style`: `solid`, `dashed` or `rail`.
- `width`: 3 to 16.

## Import validation

`validateMap()` requires `version: 1`, a `stations` object and a `lines` array, drops path
references to missing stations, clamps lengths and numbers, and rejects files over 5 MB.

## GTHA template

`site/app/gtha-template.js`. Schematic coordinates, simplified station lists, approximate
colours, and unofficial Traditional Chinese names for every station and line (`ZH` and `LINE_ZH`).
`scripts/build.mjs` fails if any path reference is missing, a station is on no line, or a station
or line has no Chinese name.
