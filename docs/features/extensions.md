# Extension hooks

Feature modules are plain scripts named `site/app/mod-<name>.js` with a matching
`mod-<name>.css`, loaded in `index.html` before `app.js`. Each pushes functions onto
`window.GMMCX` (create the arrays if missing). `app.js` reads them at start-up, so `validate`
hooks run when the saved map loads.

| Hook | Called with | Return |
| --- | --- | --- |
| `validate` | `(source, out)` from `validateMap` | copy and check your fields onto `out` |
| `transform` | `(drawnMap)` for the editor and exports | a new drawn map, or nothing |
| `lineStyle` | `(line, drawnMap)` before a line is drawn | a styled copy, or nothing |
| `svgUnder`, `svgOver` | `(drawnMap, { G, geo, opts })` | SVG markup under the lines or over the labels |
| `labelExtra` | `(drawnMap, station, labelRect, ctx)` | SVG beside a station label |
| `stationMarker` | `(map, station, { inter, col, cx, cy, geo, G, opts, lines, labelDir })` | marker SVG that replaces the default circle |
| `lineInspector` | `(line)` | HTML inserted in the line inspector, above its action buttons |
| `labelStyle` | `(map, station, { inter, small })` | `{ upper, weight }` for the label text |
| `exportTheme` | `()` | `{ bg, ink, halo, sub, tileFilter }` colours for exports |
| `inspector` | `(selection, map)` | HTML appended to the inspector |
| `input` | `(field, event, selection)` for inspector `data-f` inputs | `true` when handled |
| `click`, `keydown` | `(event)`, `(event, typing)` | `true` when handled |
| `pointer`, `pointermove`, `pointerup` | `(event, point, tool, target)` on the map | `true` when handled |
| `afterRender` | `(drawnMap)` | nothing |
| `ready` | `(GMMC)` once at start-up | nothing |

`window.GMMC` exposes the editor: `getMap`, `checkpoint` (before an edit), `changed` (after an
edit), `render`, `renderPanels`, `toast`, `getSelection`/`setSelection`, `getTool`/`setTool`,
`lineById`, `stGeo`, `geoGrid`, `gridToLatLon`, `isGeo`, `addStation`, `exportScene`, `t`, `esc`
and more (see the end of `app.js`). Strings: `I18N.add({ key: 'English' }, { key: '廣東話' })`.
Icons: `window.icon(name, size)`. A hook that throws is logged and skipped.
