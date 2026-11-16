# Editing power

Implemented in `site/app/mod-editing.js` and `site/app/mod-editing.css` through the hooks described in `extensions.md`. All strings are English and Cantonese (`I18N.add`).

## Features

| Feature | How to use | Notes |
| --- | --- | --- |
| Box selection | Select tool, hold Shift, drag on empty map | Selects every drawn station inside the rectangle, in both layouts. Replaces the current selection. A drag under 3 px just clears the selection. Esc cancels. |
| Copy and paste | Ctrl+C with stations selected, Ctrl+V | Copies the selected stations and every run of line segments whose stations are all selected. Paste creates new ids, names ending "copy", and a new line per copied run. Each repeated paste moves 2 grid cells further (schematic) or 2 grid cells of screen distance (geographic). One undo step per paste. The clipboard is in memory only. |
| Command palette | Ctrl+K (or Settings, "Command palette") | Material dialog with search, icon, name and category per command. Up/Down/Home/End choose, Enter runs, Esc or Ctrl+K closes. Commands: tools, every export action, layout, toggle frequencies, background and grid, fit, undo, redo, settings, colour vision views, "Go to route" for each route and "Go to station" for each station (stations appear once you type). Matching is plain, case-insensitive text over name, category and Chinese name. |
| Pinch zoom and pan | Two fingers on the map | Pointer Events. Zoom is anchored on the midpoint and limited to 0.04 to 64 (geographic) or 0.08 to 4 (schematic). The single-finger drag in progress is suspended while pinching. |
| Colour vision view | Settings, "Colour vision view", or palette | None, Protanopia, Deuteranopia, Tritanopia. An SVG `feColorMatrix` filter on `#map`. View only: not saved, not in exports. Resets on reload. |
| Map check | Left panel "Map check" | Reports routes whose colour has contrast under 3:1 on white, and route pairs whose RGB distance is under 25. |

## Failure modes

- A pinch ends with one finger still down: remaining pointer events are ignored until that finger lifts, so the map does not jump. The last release reaches the editor, which may clear the selection.
- Pasting before copying, or copying with no station selection, shows a message and changes nothing.
- A paste that includes line runs refers only to pasted stations, so it never edits an existing line.
- The colour vision filter applies to the whole map canvas, including background tiles, but not to panels.
- The palette is not opened while another dialog (settings, setup) is open.
- The palette search is plain text only; it does not offer the regular-expression builder used by the station search.

## Verification

`scripts/verify/editing.steps.json` run with `scripts/verify/edge-drive.mjs` against `node scripts/serve.mjs 8771 site` (headless Edge). It checks: box selection (238 of 238 stations on the full box, 110 on a centred box), copy and paste (stations 238 to 348, lines 20 to 33, undo restores 238), the palette (open, search, arrow keys, go to station, go to route, export, layout, frequency toggle, Ctrl+K toggle), a two-pointer pinch (k 0.249 to 0.497 on spread, to 0.124 on pinch in), the colour vision filter values, and the map check messages. Page errors: none. Synthetic pointer ids cannot be captured, so the script replaces `setPointerCapture` with a no-op; a real device is not affected.
