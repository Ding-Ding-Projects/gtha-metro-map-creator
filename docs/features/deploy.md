# Deploy app

"GTHA Metro Map Creator Deploy" is a portable Windows app (`desktop/deploy/`, one `.exe`, not code
signed) that publishes the map editor, a static website, to several kinds of host at once and shows a
verified link for each. The design is `design/Deploy16.dc.html`. It uses the same Material look,
English / Cantonese / bilingual switch, keyboard access and reduced-motion handling as the server
setup wizard, and shares the helpers in `desktop/shared/common.js` with it.

Each target is a card with a checkbox, a status chip, progress, a Settings disclosure and, when live,
link rows with Copy and Open. **Deploy to N places** runs every ticked target in parallel; **Copy all
links** copies every live link; **Show log** opens a log drawer. Per-target settings (never
secrets) are remembered in `deploy-state.json` in the app's user data folder.

A target only shows **Live** after a real request to the link it shows succeeded. A failure shows the
exact reason and a Retry button. No tokens are logged and there is no telemetry.

## Where it runs

One interface (`site/app/mod-deploy.js` and `mod-deploy.css`) serves two places, with the shared logic in
`site/app/deploy-core.js` (ZIP writer, GitHub Pages publisher, map check; no DOM, no Node needed):

- **Web editor.** Export menu, **Deploy...** (also `GMMCDeploy.open()`). There is no command palette in
  the editor, so the menu item is the entry point. A browser genuinely does ZIP, folder and GitHub Pages.
  Docker, the built-in server and SSH are shown disabled with a plain reason ("Needs the desktop deploy
  app. Browsers cannot start servers.") and a link to the latest release. They are never faked.
- **Desktop deploy app.** The window loads the same module and files through the preload bridge
  (`window.deployApi`), which enables all five targets.

In the browser the site files come from `site-manifest.json`, written next to the site by
`scripts/build.mjs`. A plain source copy has no manifest, so its files are discovered from the pages and
scripts; that list can miss lazily loaded files, so deploy from a built site. The editor's current map is
added as `app/default-map.json` when **Start with my current map** is ticked.

**Folder** uses the File System Access API (`showDirectoryPicker`, Chromium browsers) and falls back to a
ZIP elsewhere; the ZIP is checked (entry names read back) before it is called done. **GitHub Pages** accepts a
fine-grained token in a password field. It stays in memory unless **Remember on this device** is ticked,
which stores it unencrypted in this browser's local storage and says so; it is sent only to
`api.github.com` in a header, never in a URL, and never logged.

## Targets

| Target | What it does | How the link is verified |
| --- | --- | --- |
| This computer with Docker | Same steps as the setup wizard: checks Docker Engine and Compose, checks the port (default 8080), writes `compose.yaml`, pulls `ghcr.io/ding-ding-projects/gtha-metro-map-creator:<tag>`, starts it and waits for `/healthz`. | HTTP GET to `http://<LAN IP>:<port>/` for each real network address. |
| This computer, no Docker | A web server inside the app serves the bundled site on `0.0.0.0` (default port 8090). | HTTP GET to `/` and `/app/index.html` on each network address. |
| Remote server over SSH | System `ssh` (OpenSSH) with `BatchMode=yes`: key file or ssh-agent only, no password typing. Uploads `compose.yaml` over stdin, then runs `docker compose pull` and `up -d` with `GMMC_PORT` and `GMMC_TAG`. | HTTP GET from this computer to `http://<host>:<port>/`; if that fails, `curl` on the server tells a firewall problem from a failed start. |
| GitHub Pages | Creates the repository (public) if missing, writes the site to the `gh-pages` branch through the GitHub REST API (blobs, tree, commit, ref), turns Pages on and polls the build for up to 10 minutes. | The Pages build reports `built` and `https://<owner>.github.io/<repo>/app/index.html` answers 200. |
| Folder or ZIP | Writes the static site to a folder, or a ZIP file written by the app itself. | The copy is read back (`app/index.html` must exist). Open reveals it in Explorer. |

### Built-in server and "Keep running after closing"

The built-in server runs inside the app's process. With **Keep running after closing** off, closing
the app stops the server. With it on, closing the window hides it and a tray icon keeps the app, and
so the server, alive; **Stop the server and quit** in the tray menu ends it. The app adds no Windows
startup entry and no firewall rule. Windows asks once when a program first listens on the network. A
request to the computer's own address does not pass through the firewall, so a verified link proves the
server answers, not that other devices are allowed in. If another device cannot connect, allow the
port once in an administrator Command Prompt:

```
netsh advfirewall firewall add rule name="GTHA Metro Map 8090" dir=in action=allow protocol=TCP localport=8090
```

### SSH safety

Host, user, SSH port, remote folder, image tag and key path are validated before use: host names allow
letters, digits, dots and hyphens and cannot start with a hyphen; user names use the usual Unix set;
the folder allows `[A-Za-z0-9_.-]` segments and an optional leading `~/`, with no `..` and no leading
hyphen. Arguments are passed to `ssh` as an array (never through a shell on this computer), and the
remote command contains only those validated values, with `~/` turned into `"$HOME/"`. The first
connection to a new host records its key with `StrictHostKeyChecking=accept-new`; a changed key is
refused.

### GitHub sign-in

Either the GitHub CLI (`gh`) is already signed in, and the app reads its token in memory, or the person
pastes a fine-grained personal access token (Contents, Administration and Pages: read and write). In the desktop app a pasted
token is stored only through Electron `safeStorage` (Windows DPAPI) in `github-token.bin` and can be
removed with **Sign out**. If Windows protection is not available the token is not saved.

## Choosing the starting map

**Choose map** accepts a `.json` map or `.gmmc.json` project file (checked for the map format, 5 MB
limit). It is added to every deployment as `app/default-map.json`:

- folder, ZIP, GitHub Pages and the built-in server include the file in the site;
- Docker and SSH mount it read-only into the container at `/usr/share/nginx/html/app/default-map.json`.

In the web editor the map is the current one. The editor (`site/app/app.js`) fetches `default-map.json` at start-up. It is absent by default, which
is the normal case. It is applied only when the visitor has no saved map in this browser, so nobody's
own work is replaced. Cleared with **Use the standard map**.

## Build

`npm run dist:deploy` in `desktop/` (also part of `npm run dist` and the root `build-installer.bat`)
writes `dist/desktop-deploy/GTHA-Metro-Map-Creator-Deploy-<version>-portable.exe`. The release
workflow uploads it with the other executables. `npm run start:deploy` runs it from source.

## Verification

Web: `scripts/verify/deploy-web.steps.json` (generated by `make-deploy-web-steps.mjs`) drives the editor in
headless Edge: opens the dialog, checks the disabled targets and their reasons, downloads the ZIP and reads
its contents (index.html, the editor, `app/default-map.json` with the current map), exercises GitHub token and
repository validation with bad input, Cantonese, and a 390 px layout with no overflow. GitHub Pages was
**not** run end to end because it needs a real token.

Desktop: verified against the built executable on a hidden window: folder and ZIP output, the built-in server
and its network link, and Docker when the engine is running. SSH and GitHub Pages need credentials; only
their validation and error paths are exercised in automated checks. See `HANDOFF.md` for what was and
was not run end to end.
