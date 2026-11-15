# GTHA Metro Map Creator

A browser editor for schematic rapid transit maps of the Greater Toronto and Hamilton Area.
It runs entirely in the browser, has no dependencies, and stores your work locally.

- **Editor:** https://ding-ding-projects.github.io/gtha-metro-map-creator/app/
- **Project site and guides:** https://ding-ding-projects.github.io/gtha-metro-map-creator/
- **Documentation:** https://ding-ding-projects.github.io/gtha-metro-map-creator/docs/
- **Desktop app and server setup wizard:** portable `.exe` files on the [releases page](https://github.com/Ding-Ding-Projects/gtha-metro-map-creator/releases)
- **Container image:** `ghcr.io/ding-ding-projects/gtha-metro-map-creator`

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
- Station search in plain text or regular expression mode, with a regex builder: tokens, flags,
  plain-language explanation, highlighted test text, groups, replace preview and a pattern library
- Map check: unserved stations, short lines, duplicate names, stacked stations
- Undo and redo (200 steps), autosave in local storage
- Export SVG with title and legend, PNG at up to 2x, and JSON; import JSON by menu or drag and drop
- English, Cantonese and bilingual interface and station names
- Light, dark and system themes; first-run setup wizard; optional sound effects; keyboard shortcuts
- Portable Windows desktop app: works offline, native open and save, recent maps
- Docker image, Compose file, `host.bat` (detached or interactive log view) and a portable server
  setup wizard that prints the address other devices on your network can open

## Run locally

```bash
node scripts/serve.mjs 8765 site
```

Then open http://127.0.0.1:8765/app/.

## Host on your network

Run `host.bat --detached` (needs Docker Desktop). It pulls the image, starts it, waits for the
health check and prints an address such as `http://192.168.1.20:8080/`. `host.bat --logs` adds a
status and log view; `host.bat --stop` stops it. Or run the server setup wizard from the releases.
See [docs/features/hosting.md](docs/features/hosting.md).

## Build

- `build.bat` validates JavaScript syntax, template integrity and local links, then writes `dist/site`.
- `build-installer.bat` runs the build, packages `dist/gtha-metro-map-creator-site.zip`, and builds both
  portable executables into `dist/desktop-app/` and `dist/desktop-wizard/`.
- On other platforms: `node scripts/build.mjs`.

GitHub Actions deploys `dist/site` to GitHub Pages and publishes the container image on every push
to `main`. Pushing a `v*` tag builds the executables and publishes a release.

## Repository layout

| Path | Contents |
| --- | --- |
| `site/app/` | The editor: `app.js` (engine), `regex-builder.js`, `gtha-template.js`, `i18n.js`, `app.css` |
| `desktop/` | Desktop app (`app/`) and server setup wizard (`wizard/`) |
| `Dockerfile`, `docker/`, `compose.yaml`, `host.bat` | Container hosting |
| `site/index.html`, `site/docs/` | Project site and documentation |
| `design/` | Design canvas source for the editor, project site, desktop app and wizard |
| `docs/features/` | Feature documentation |
| `scripts/` | Build, local preview and executable verification scripts |

## Licence

MIT. See `LICENSE`.
