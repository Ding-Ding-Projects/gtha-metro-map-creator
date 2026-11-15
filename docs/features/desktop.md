# Desktop app and server setup wizard

Both are Electron apps in `desktop/`, packaged by electron-builder as single portable `.exe`
files (no installer, no folder beside them). They are not code signed.

## Desktop app (`desktop/app/main.js`)

- Serves the built site from inside the package through a private `gmmc://` scheme, so the
  editor, project page and documentation work offline. Paths outside the bundle are refused.
- File menu: new from template, new blank, open, open recent (10, kept in the app's user data
  folder), save, save as, export SVG and PNG. Exports from the editor's own menu also get a native
  save dialog.
- Unsaved changes: when the map came from a file and differs from what was saved, closing or
  starting a new map asks Save, Don't save or Cancel.
- Single instance; opening a `.json` file passes it to the running window.
- External links open in the default browser; navigation away from the bundle is blocked.
- Uses `GMMC.loadJson`, `GMMC.newMap`, `GMMC.exportAct`, `GMMC.undo` and `GMMC.redo` from
  `site/app/app.js`.

## Server setup wizard (`desktop/wizard/`)

Five steps with Back, Next, Cancel (Escape), progress and saved choices:

1. Check Docker: CLI, engine version and Compose v2. Links to Docker Desktop when missing.
2. Choose a port (1024 to 65535) and image tag. A port is busy if anything answers on it or it
   cannot be bound; a port already used by this map server is allowed and gets updated.
3. Download the image with `docker pull`, showing output and the image digest.
4. Start with `docker compose up -d` using a copy of `compose.yaml` in the app's user data
   folder, then wait up to 60 seconds for `/healthz`.
5. Show the network address, check that it answers on each real network adapter (virtual
   adapters are skipped), Open in browser, Copy address and Stop the server.

English, Cantonese and bilingual text; follows the system light or dark theme; reduced motion
stops the spinner. Choices are saved in `wizard-state.json`; on the next run it re-checks Docker,
then returns to the port step with a welcome-back note.

## Build

`build-installer.bat` builds the site and both executables. In `desktop/`: `npm run dist:app`,
`npm run dist:wizard`. Output goes to `dist/desktop-app/` and `dist/desktop-wizard/`.

## Verification

`scripts/verify/drive-exe.mjs` launches a built executable with `GMMC_HIDDEN=1` (window never
shown), drives it over a loopback DevTools port with the steps in `scripts/verify/*.steps.json`,
then ends its process tree. It refuses to run if more than one page is open.

## Failure modes

- Docker missing or stopped: step 1 explains and offers Check again.
- Port in use: step 2 blocks Next.
- Pull or start failure: the step shows the output and Try again.
- Not reachable from other devices: step 5 says so and names the port to allow in the firewall.
