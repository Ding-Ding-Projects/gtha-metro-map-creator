# Handoff

## State (2026-11-15)

Version 1.1.0: editor with regex builder, container hosting, portable desktop app and portable
server setup wizard, plus the project site and documentation.

### Verified locally

- `node scripts/build.mjs` passes: syntax, template integrity (171 stations, 16 lines) and links.
- Editor in a browser: setup wizard and persistence, drawing, erase trim and split, undo, regex
  search; regex builder tokens, explanation, highlighted matches, named and numbered groups,
  replace preview, invalid pattern message and saving a pattern; PNG export produced a valid
  6192 x 5864 PNG; JSON import through the file input loads a map and a bad file is refused with
  the current map kept; SVG export parses; language and theme persist; no horizontal overflow at
  375 px.
- Container: the image builds; the container reports healthy; `/healthz` returns `ok`; `/app/`
  returns 200 on localhost and on the LAN address.
- Published image: pulled anonymously from GitHub Container Registry (manifest 200 without
  credentials).
- `host.bat --detached` against the published image: pulled, started, healthy, printed
  `http://<LAN IP>:<port>/`, which returned 200. `host.bat --logs` with keys T, S, Q: tail,
  status, leave with the server still running.
- Desktop app executable, launched hidden and driven over DevTools: loads from the bundle, 171
  stations, regex builder present, `loadJson` and `newMap` work, docs and site pages load, no
  remote assets.
- Wizard executable, driven hidden: Docker check, port validation (out of range refused, port
  used by another program refused, port used by this server allowed), pull with digest, start,
  health, network address on the real adapter only, bilingual relabelling, resume note.

### Release (verified)

- `v1.1.0` at `b7f037b` is a normal release (not draft, not prerelease) with
  `GTHA-Metro-Map-Creator-1.1.0-portable.exe`, `GTHA-Metro-Map-Creator-Server-Setup-1.1.0-portable.exe`,
  `gtha-metro-map-creator-site.zip` and `SHA256SUMS.txt`. Deploy site, Container image and Release
  workflows succeeded for that commit.
- The released desktop executable was downloaded, matched its SHA-256 in `SHA256SUMS.txt`, and
  passed `scripts/verify/desktop-app.steps.json`.
- Image tag `1.1.0` pulls without credentials. The live site serves the new documentation
  articles and the regex builder, and the repository homepage points at it.
- Announcement: Discussion #1. Pinning is not available through the API, so it is not pinned.

### Records not created

- Wiki: the wiki has no first page, so its repository does not exist yet. Pages are staged in
  `docs/wiki/pending/` with publishing steps.
- GitHub Projects: the CLI token has no `project` scope, so no Project was created.

### Not yet verified

- Native open, save and unsaved-changes dialogs in the desktop app (they need a visible window).
- The executables on a computer without Docker, and on a second device opening the LAN address.
- Windows SmartScreen behaviour for the unsigned executables.
- Interactive `host.bat` menu mode typed by hand, and Ctrl+C out of follow mode.

### Known limits

- The bend of a shared segment comes from the first line drawn on it.
- Template station names are English only (no verified Cantonese source yet).
- The regex builder uses the browser's JavaScript engine; other engines' syntax is not offered.
- The hosted server has no sign-in.
- The executables use the default Electron icon.

## Next steps

See `ROADMAP.md`, Phase 3.
