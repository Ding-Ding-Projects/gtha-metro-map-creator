# Editor

## Routing

Each segment joins two path nodes (stations or bend points written `@x,y`) in grid units. If
the nodes are not on a horizontal, vertical or 45-degree line, the segment gets one bend:
diagonal first (default) or straight first (`bends[index] = "late"`). See `route()` in
`site/app/app.js`.

## Shared track

`computeGeometry()` groups segments by unordered node pair. Each line in a group is offset
perpendicular to the segment by `(i - (n - 1) / 2) * spacing`, where spacing is the widest
line in the group plus 2 px. Bends use mitred offsets. The first line drawn on a pair sets its
geometry.

## Labels

Automatic placement scores eight positions by segment intersections (Liang-Barsky) and nearby
stations and takes the lowest score. Manual positions override it.

## Tools

Select (V), Station (S), Draw line (L), Label (T), Erase (E). Draw line appends to the active
line; clicking empty space adds a stop, Alt adds a bend point. Erase on an end segment trims;
on a middle segment it splits the line.

## Search and map check

Search matches English and Chinese names in plain text or as a JavaScript Unicode regular
expression (patterns over 200 characters are refused). The regex builder
(`site/app/regex-builder.js`) edits the same field and mode: token buttons, escape as literal,
flags (`i` shared with Ignore case, `m` on by default, `s`), a plain-language explanation of each
token, test text with highlighted matches (5000 characters, 500 matches), the first match's
groups, a replacement preview and a pattern library with saved patterns in `gmmc.regex.v1`. Map check lists unserved stations,
short lines, duplicate names and stacked stations.

## History and storage

Every edit takes a JSON snapshot (200 max). The map, settings and setup progress live in
`localStorage` under `gmmc.*` keys. Storage failures are ignored and the editor still works.

## Failure modes

- Storage blocked: autosave silently stops; export JSON to keep work.
- Audio blocked: sound effects are skipped.
- Invalid import: refused, current map kept.

## Verification

`node scripts/build.mjs`, then the browser checks listed in `HANDOFF.md`.
