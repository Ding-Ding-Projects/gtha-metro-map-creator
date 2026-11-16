# Station facilities and map furniture

Implemented in `site/app/mod-facilities.js` and `mod-facilities.css` through the extension hooks
in [extensions.md](extensions.md).

## Station facilities

Each station may carry `facilities`: any of `accessible`, `parking`, `bike`, `airport`, `ferry`,
`busTerminal` (see [map-format.md](map-format.md)). With one station selected, the inspector shows
a "Station facilities" section of toggle chips; a chip shows a check mark while on. Each toggle is
one undo step (`checkpoint` then `changed`).

Icons (Material Symbols Rounded, Apache-2.0, added to `icons.js`) are drawn after the station
label text, honouring the label anchor and direction, with a halo so they stay legible over lines
and in the dark theme. They are inline `<path>` elements, so SVG, PNG and PDF exports contain them
with explicit colours. Label width is estimated, so the gap after very wide labels can vary.

## Scale bar and north arrow (geographic layout)

On screen, a Material-styled overlay at the bottom-left of the map (above the OpenStreetMap
attribution) shows a compass icon and a scale bar. The metres per screen pixel come from Web
Mercator at the map-centre latitude: `156543.03392 * cos(lat) / 2^13 / view.k`. The bar length is
the largest round value (10 m up to 100 km, including 100 m, 500 m, 1 km, 5 km, 20 km) that fits
in 140 px. It updates on every render, so zooming changes it. It is hidden in the schematic
layout, where distances are not to scale.

Geographic exports add the same compass and bar at the top-left of the map through `svgOver`,
computed from the export zoom (`_k`) of the drawn map. The schematic layout gets neither.

## Verification

`scripts/verify/facilities.steps.json` runs through `scripts/verify/edge-drive.mjs`: toggling
chips, icons beside the label, scale text changing after zooming, SVG export containing icons and
the scale bar, project reload keeping facilities, and invalid values being dropped.
