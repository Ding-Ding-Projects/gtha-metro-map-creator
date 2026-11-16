# Print layout and vector PDF

Implemented in `site/app/mod-print.js` and `mod-print.css`. Open it from Export, "Print layout (vector PDF)". Strings are English and Cantonese.

## Dialog

| Control | Notes |
| --- | --- |
| Paper | A0, A1, A2, A3, A4, Letter, Tabloid |
| Portrait / Landscape | Segmented button |
| Margin | 0 to 50 mm |
| Title, Subtitle | The title starts from the map title (with the Chinese title when a Chinese language is on) |
| Legend | Bottom right, bottom left, top right, none |
| Page preview | Live scaled page: title block, map fitted inside the margins, legend. Background tiles are not drawn in the preview |

Paper, orientation, margin, subtitle and legend position are remembered in browser storage (`gmmc.print.v1`).

## Output

A real vector PDF made with jsPDF and svg2pdf.js, vendored under `site/app/vendor/` (see `vendor/README.md`) and loaded only when the first PDF is made. The page is built as SVG in millimetres: the map (the same drawing as the SVG export, so the chosen map style applies), a title block and a legend. Labels are text, not pixels, so they stay sharp at any zoom. Station labels have a halo drawn as a second text element under the label.

Text uses the PDF standard Helvetica, which has no Chinese characters. When any visible text contains Chinese characters, the export falls back to the existing raster PDF path (`exportAct('pdf')`) and shows a message, because embedding a Chinese font is too large.

Background tiles are fetched from OpenStreetMap, which allows cross-origin requests, and embedded when they load. If some or all fail, a message says so and the PDF is made without them. Under the Night style tiles are left out (a colour filter cannot be applied in PDF).

## Failure modes

- Libraries fail to load (offline file move, blocked script): "Could not make the PDF"; the dialog stays open.
- A very large map on A4 is small. Use a bigger paper size or fewer routes.
- Legend entries are laid out in up to four columns; with many routes on A4 the legend uses most of the page height.

## Verification

`scripts/verify/print.steps.json`, run with `node scripts/verify/edge-drive.mjs http://localhost:8792/app/ scripts/verify/print.steps.json <dir>`, switches presets, opens the dialog, exports A3 landscape, and checks in the page: the bytes start with `%PDF`, the MediaBox is 1190.55 x 841.89 pt, the decompressed content has text operators (`BT`/`Tj`) containing station names, the A4 portrait MediaBox, the Night export, and the raster fallback in Cantonese.
