# GTHA Metro Map Creator

A browser editor for schematic rapid transit maps of the Greater Toronto and Hamilton Area.
It runs entirely in the browser, has no dependencies, and stores your work locally.

- **Editor:** https://ding-ding-projects.github.io/gtha-metro-map-creator/app/
- **Project site and guides:** https://ding-ding-projects.github.io/gtha-metro-map-creator/
- **Documentation:** https://ding-ding-projects.github.io/gtha-metro-map-creator/docs/

> Unofficial. The built-in template is a simplified schematic, not a TTC or Metrolinx product.
> Line colours are approximate and service status is not tracked.

## Features

- Built-in GTHA template: TTC Lines 1, 2, 4, 5 and 6, the planned Ontario Line, GO Lakeshore
  West and East, Kitchener, Milton, Barrie, Richmond Hill, Stouffville, UP Express, and
  simplified Hurontario and Hamilton LRT lines (171 stations, 16 lines)
- Octilinear routing: every segment bends at most once, at 45 degrees, diagonal first or
  straight first per segment
- Shared track: lines between the same pair of stops are offset side by side automatically
- Automatic label placement that avoids lines and neighbouring stops, with eight manual positions
- Tools: select and move, add station, draw line, text label, erase (erasing a middle segment
  splits a line); multi-select with align and nudge
- Insert a stop into a segment and every line using that segment picks it up
- Line styles: solid, dashed (planned) and regional rail with a centre stripe
- Station search in plain text or regular expression mode with validation
- Map check: unserved stations, short lines, duplicate names, stacked stations
- Undo and redo (200 steps), autosave in local storage
- Export SVG with title and legend, PNG at up to 2x, and JSON; import JSON by menu or drag and drop
- English, Cantonese and bilingual interface and station names
- Light, dark and system themes; first-run setup wizard; optional sound effects; keyboard shortcuts

## Run locally

```bash
node scripts/serve.mjs 8765 site
```

Then open http://127.0.0.1:8765/app/.

## Build

- `build.bat` validates JavaScript syntax, template integrity and local links, then writes `dist/site`.
- `build-installer.bat` runs the build and packages `dist/gtha-metro-map-creator-site.zip`, a portable offline copy.
- On other platforms: `node scripts/build.mjs`.

GitHub Actions deploys `dist/site` to GitHub Pages on every push to `main`.

## Repository layout

| Path | Contents |
| --- | --- |
| `site/app/` | The editor: `app.js` (engine), `gtha-template.js`, `i18n.js`, `app.css` |
| `site/index.html`, `site/docs/` | Project site and documentation |
| `design/` | Design canvas source for the editor and project site |
| `docs/features/` | Feature documentation |
| `scripts/` | Build and local preview scripts |

## Licence

MIT. See `LICENSE`.
