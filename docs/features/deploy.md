# Deploy app

"GTHA Metro Map Creator Deploy" is a portable Windows app (`desktop/deploy/`, one `.exe`, not code
signed) that publishes the map editor, a static website, to many kinds of host and shows a verified link
for each. It also keeps a list of everything it deployed and manages those instances. The designs are
`design/Deploy16b.dc.html` (all nine targets), `design/Flash16.dc.html` (the erase-and-write
confirmation) and `design/Instances16.dc.html` (the instance manager). It uses Material controls
(floating-label fields, switches, segmented buttons, filter chips, menus, dialogs), English / Cantonese /
bilingual text, keyboard access with visible focus and reduced-motion handling, and works at 390 px.
Helpers shared with the server setup wizard are in `desktop/shared/common.js`.

The Deploy tab shows nine cards in two columns (one column on a phone) with filter chips: **All**, **On
this computer** (Docker, built-in server), **Virtual machines** (VirtualBox, VMware), **Flash a drive**
(USB drive, Raspberry Pi) and **Online** (SSH, GitHub Pages, folder or ZIP). Each card has a checkbox, a
status chip, progress, a Settings disclosure and, when live, link rows with Copy and Open.
**Deploy to N places** runs every ticked target in parallel (drives ask for their own confirmation).
**Copy all links** copies every live link; **Show log** opens a log drawer. Per-target settings (never
secrets) are remembered in `deploy-state.json` in the app's user data folder.

A target only shows **Live** (or **Verified** for a drive) after a real check: an HTTP request to the link it
shows, or a read-back of what was written. A failure shows the exact reason and a Retry button. No tokens
are logged and there is no telemetry.

## Where it runs

One interface (`site/app/mod-deploy.js`, `mod-deploy-instances.js`, `deploy-ui.js` and `mod-deploy.css`)
serves two places, with the shared logic in `site/app/deploy-core.js` (ZIP writer, GitHub Pages publisher,
map check; no DOM, no Node needed):

- **Web editor.** Export menu, **Deploy...** (also `GMMCDeploy.open()`). A browser genuinely does ZIP,
  folder and GitHub Pages. Docker, the built-in server, VirtualBox, VMware, SSH, USB drive and Raspberry
  Pi are shown disabled with a plain reason ("Needs the desktop deploy app. Browsers cannot start servers
  or virtual machines.") and a link to the latest release. They are never faked.
- **Desktop deploy app.** The window loads the same module and files through the preload bridge
  (`window.deployApi`), which enables all nine targets.

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

| Target | What it does | How the result is verified |
| --- | --- | --- |
| Docker on this computer | A Compose project `gmmc-<name>` with its own port, starting map and a label naming the instance. Checks Docker Engine and Compose, checks the port, pulls `ghcr.io/ding-ding-projects/gtha-metro-map-creator:<tag>`, starts it and waits for `/healthz`. | HTTP GET to `http://<LAN IP>:<port>/` for each real network address. |
| Built-in server | A web server inside the app serves the bundled site on `0.0.0.0` (default port 8090). Each instance has its own server, port and map. | HTTP GET to `/` and `/app/index.html` on each network address. |
| VirtualBox | Finds `VBoxManage` (registry, then the default folder). Downloads `gtha-metro-map-creator-appliance-<version>-x86_64.ova.zip` from the app's own release, checks its SHA-256 against `SHA256SUMS.txt` (a mismatch deletes the download), caches it, imports it under a unique name (`gmmc-<name>-<id>`), sets **bridged** networking on the active adapter (or NAT with a forwarded port when no adapter is found or when chosen), writes a serial log, marks the machine with the instance id and starts it without a window. | The machine's address comes from the serial console banner (or the neighbour table by MAC address); then `/healthz` and `/app/` must answer. |
| VMware | Finds `vmrun` (Workstation, or Player). Downloads and checks the same `.ova.zip`, converts it with VMware OVF Tool (or `vmware-vdiskmanager` plus a generated `.vmx`), stores the machine in the instance's own folder with an ownership marker, sets bridged networking and a serial log, and starts it with `vmrun start ... nogui`. | Same as VirtualBox. |
| Remote server over SSH | System `ssh` (OpenSSH) with `BatchMode=yes`: key file or ssh-agent only, no password typing. Each instance lives in `<folder>/<name>` as its own Compose project with the instance label. Uploads `compose.yaml` over stdin, then runs `docker compose pull` and `up -d`. | HTTP GET from this computer to `http://<host>:<port>/`; if that fails, `curl` on the server tells a firewall problem from a failed start. |
| USB drive for a spare PC | Writes `gtha-metro-map-creator-appliance-<version>-x86_64.img.xz` (unpacked) to a removable drive. See "Writing to a drive". | Every byte is read back and its SHA-256 compared with the image. |
| Raspberry Pi | Writes `...-arm64-rpi.img.xz` the same way. After writing it explains first boot: plug in Ethernet, then find the address on the screen or in the router. | Same read-back. Booting a Pi from it has not been verified. |
| GitHub Pages | Creates the repository (public) if missing, writes the site to the `gh-pages` branch through the GitHub REST API (blobs, tree, commit, ref), turns Pages on and polls the build for up to 10 minutes. | The Pages build reports `built` and `https://<owner>.github.io/<repo>/app/index.html` answers 200. |
| Folder or ZIP | Writes the static site to a folder, or a ZIP file written by the app itself. | The copy is read back (`app/index.html` must exist). Open reveals it in Explorer. |

If VirtualBox or VMware is missing, the card says so with a download link; VMware without OVF Tool and
without `vmware-vdiskmanager` says exactly that. The virtual machine targets serve the standard map:
the appliance has no way to seed a map, so a chosen map is used by Docker, SSH, the built-in server, the
folder, the ZIP and GitHub Pages only.

### Built-in servers and "Keep running after closing"

The built-in servers run inside the app's process. With **Keep running after closing** off, closing
the app stops them. With it on, closing the window hides it and a tray icon keeps the app, and so the
servers, alive; **Stop the server and quit** in the tray menu ends them. The app adds no Windows
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

## Writing to a drive (USB drive and Raspberry Pi)

Writing replaces everything on the drive, so it is built around not writing to the wrong one.

1. **Only removable drives are listed.** The list comes from PowerShell `Get-Disk` and keeps only bus
   types USB, SD and MMC, and never a disk Windows reports as the system or boot disk. Each entry shows
   the model, size, disk number and partition count. **No drive is ever preselected**, and a drive chosen
   in an earlier session is forgotten.
2. **The confirmation dialog** (the Flash16 design) names the exact disk, the image and its size, says
   that everything on the disk will be erased and that every byte is read back, and keeps **Erase and
   write** disabled until **I understand Disk N will be erased** is ticked.
3. **The image is prepared first.** The `.img.xz` is downloaded from the release and checked against
   `SHA256SUMS.txt`, cached, and unpacked to a temporary raw file (about 3 GB of free space is needed).
4. **Writing needs Administrator**, so the app starts a small elevated Windows PowerShell through the
   normal Windows permission prompt (UAC). The helper script is passed on the command line with
   `-EncodedCommand`, so there is no script file another program could change between the prompt and the
   write. The helper re-checks that the disk is a removable USB or SD disk and not the system or boot
   disk, re-checks the image's SHA-256, clears the partition table, takes the disk offline, writes the
   image to `\\.\PhysicalDriveN` in 4 MiB blocks with unbuffered write-through I/O, reads the same bytes
   back and compares the SHA-256. Progress and the final result go through a file the app polls.
5. **Failure is never success.** Declining the permission prompt, a helper that cannot start, a write
   error or a read-back that does not match all end as **Failed** with the reason ("Windows did not get
   permission to write to the drive, so nothing was written", and so on). The raw file is deleted.

The legacy BIOS-only limit of the x86_64 image and what is and is not tested are in
[appliance.md](appliance.md).

## Instances

Every deployment is recorded in `instances.json` in the app's user data folder: its name, target, where
it runs, version, port, link and the identity of what it created. Deploying the same name again on the
same target updates that instance; a new name makes a new one. So the app can run any number of
instances on any target: several Docker instances on different ports, several virtual machines, several
SSH hosts or folders.

**No collisions.** A new Docker or built-in instance asks for a port; if another instance or any other
program already has it, the next free port is used and the log says so. Each Docker instance gets its own
Compose project (`gmmc-<name>`), container, network and data folder; each virtual machine its own unique
name and folder; each SSH instance its own remote sub-folder and project. The port is checked before use.

**The Instances tab** (the `Instances16` design) lists name, where, version, health and link. Health is
checked live (the instance's real state plus a request to its address) and shows the time of the last
check; **Check all now** rechecks everything, and opening the tab checks too. Search, filter chips (All,
Running, Stopped, Updates) and a selection bar with the actions for the selected rows are provided. Row
actions are Stop or Start, Open and a menu with Restart, View logs, Update, Duplicate, Copy link and
Remove.

- **View logs**: `docker logs` for Docker, the serial console log for virtual machines, `docker logs`
  over SSH for SSH instances.
- **Update**: a Docker or SSH instance pulls the newest image and recreates the container, keeping its
  port and starting map. A virtual machine builds the new machine from the newest appliance image first and
  removes the old one only after the new one answers. The newest version is the larger of this app's own
  version and the latest GitHub release.
- **Duplicate**: same target and settings, a new name, the next free port and the same starting map.
- **Remove** opens a confirmation that names the exact instance and lists what will be deleted. A folder or
  ZIP entry and a GitHub Pages entry are only forgotten: their files and repository are never deleted.

**It only manages what it created.** Containers carry the label
`io.github.dingdingprojects.gmmc.instance=<id>`, and a Docker or SSH instance's containers are found by
that label, never by name. A VirtualBox machine carries the same value as extra data and is checked by its
recorded UUID before any action. A VMware machine lives in the instance's own folder with a marker file
naming the instance. If the recorded identity does not match, the action is refused with a message and
nothing is touched. The app never adopts, stops or removes a container, machine or folder it did not
create. Built-in servers run in the app, so they show as stopped after the app restarts until started.

**In the web editor** the Instances tab lists the ZIP and GitHub Pages deployments that browser made,
kept in local storage (a Pages entry is checked with a request to its address). Start, stop, update and
duplicate are disabled with the reason; Remove forgets the entry.

## Choosing the starting map

**Choose map** accepts a `.json` map or `.gmmc.json` project file (checked for the map format, 5 MB
limit). It is added to every deployment as `app/default-map.json`:

- folder, ZIP, GitHub Pages and the built-in server include the file in the site;
- Docker and SSH mount it read-only into the container at `/usr/share/nginx/html/app/default-map.json`;
- virtual machines cannot be given a map (see above).

In the web editor the map is the current one. The editor (`site/app/app.js`) fetches `default-map.json` at start-up. It is absent by default, which
is the normal case. It is applied only when the visitor has no saved map in this browser, so nobody's
own work is replaced. Cleared with **Use the standard map**.

## Build

`npm run dist:deploy` in `desktop/` (also part of `npm run dist` and the root `build-installer.bat`)
writes `dist/desktop-deploy/GTHA-Metro-Map-Creator-Deploy-<version>-portable.exe`. The release
workflow uploads it with the other executables. `npm run start:deploy` runs it from source. The app
depends on `xz-decompress` (pure WebAssembly, no native code) to unpack the drive images.

## Verification

All of these are in `scripts/verify/` and run locally; CI deliberately runs no tests here.

- `deploy-web.steps.json` (generated by `make-deploy-web-steps.mjs`, driven by `edge-drive.mjs`) drives
  the web editor in headless Edge: nine cards, the filter chips, every disabled target and its reason, the
  ZIP download and its contents, the Instances tab entry that ZIP created, GitHub token and repository
  validation with bad input, Cantonese, and a 390 px layout with no overflow. GitHub Pages was **not** run
  end to end because it needs a real token.
- `instances-docker.cjs` drives the instance manager against the real Docker engine: two instances on
  different ports with their own maps, both links answering, stop, restart, update from 1.4.0 to 1.5.0,
  logs, duplicate, remove, and a plain `nginx` container started by the script that must never be listed,
  stopped or removed.
- `drive-deploy.mjs` drives the real desktop window (hidden, isolated profile): the instance workflow
  above through the actual buttons and dialogs, the built-in server and folder targets, Cantonese, 390 px,
  and the drive flow with a **file** standing in for the drive (the same helper script runs, without
  elevation and without touching any disk), including a cancelled and a failed permission prompt. It also
  reads the real drive list of the machine and checks that the Windows disk is never offered.
- `vbox-real.cjs` and `vmware-real.cjs` run the real VirtualBox and VMware tools with a stand-in
  appliance (a tiny empty machine exported as an `.ova`, served as a fake release with checksums):
  download, checksum, unzip, import or conversion, network and serial setup, ownership marks, the
  manager's checks and removal, and refusal of machines it did not create. A wrapper refuses the
  start command, so **no machine is booted**.

Not verified end to end: SSH and GitHub Pages (they need credentials; only validation and error paths are
exercised), a real write to a USB drive or SD card (never done here: the helper's physical-drive path,
unbuffered I/O and the clearing and offline steps are untested on hardware), a real appliance booting in
VirtualBox or VMware (the appliance cannot be built on Windows; CI boots it under QEMU), a Raspberry Pi
booting from the image, and the VMware Player route. See `HANDOFF.md`.
