# Handoff

## State (2026-11-15)

Initial release of the editor, project site and documentation.

### Verified locally

- `node scripts/build.mjs` passes: syntax, template integrity (171 stations, 16 lines, every
  path reference resolves, no unserved stations) and local links.
- In a browser (local server): setup wizard steps and persistence; drawing a new line (three
  stops, octilinear geometry); erasing an end segment trims the line; erasing a middle segment
  splits it; undo restores both; regular expression search and invalid pattern message;
  standalone SVG export parses as valid XML; language (English, Cantonese, bilingual) and theme
  switching persist; reset settings; no horizontal overflow at 375 px on the editor, site and
  docs; no console errors.

### Not yet verified

- PNG download and file import were not exercised through a real file dialog.
- GitHub Pages deployment result: see the latest Actions run.
- No automated browser tests yet.

### Known limits

- The bend of a shared segment comes from the first line drawn on it.
- Template station names are English only.
- The search field is not a full visual regular expression builder.

## Next steps

See `ROADMAP.md`, Phase 2.
