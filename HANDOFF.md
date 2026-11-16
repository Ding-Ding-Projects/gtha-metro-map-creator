# Handoff

## 1.8.0 (2026-11-16): appliance password sign-in

Proven in CI (appliance check run 43930391800 at 2664fc9): six boot tests passed, covering no password,
a FAT config disk, the ISO config disk the deploy app writes, an invalid setting (editor refused,
nothing secret on the console), and on the Raspberry Pi virt twin no password and a boot-partition file.
Also checked by hand: the released 1.8.0 `.ova` in VMware Workstation with an ISO made by
`desktop/deploy/lib/config-disk.js` booted in 15 s with "Password required"; `/healthz` 200, `/app/` 302 to
sign-in, wrong password refused, right password signed in, no hash on the console.

The appliance reads an optional password hash at boot (`appliance/skel/usr/local/sbin/gmmc-signin`, called by the
`gmmc-app` service) from a read-only disk labelled `GMMCCONF` (FAT or ISO 9660, file `password-hash`) or a
`gmmc-password-hash` file on the boot partition (`/boot`, or a FAT partition labelled `GMMCBOOT`). Valid: the container
gets `GMMC_PASSWORD_HASH` through a root-only `--env-file`, the banner adds "Password required". Absent: sign-in stays off.
Invalid: the app is not started and the banner says so. The container is replaced when the hash changes (label
`gmmc.signin`). The deploy app has the switch for VirtualBox and VMware (a small ISO from the pure Node writer
`desktop/deploy/lib/config-disk.js`, attached as a CD-ROM) and Raspberry Pi (`desktop/deploy/lib/fat32.js` adds the file to the
unpacked image before the write is verified). The x86 USB image has no FAT partition: documented second-stick route only.

Verified here: `appliance/test-signin.sh` (18 cases against real loop devices, FAT and the Node-made ISO, in a privileged
Alpine container) and `appliance/test-service.sh` (service logic with a fake docker, banner) pass; `scripts/verify/check-fat32.sh`
(fsck.vfat and mtools read-back, directories ending inside and across clusters) passes; the boot-test helper functions ran
against the real 1.7.2 container image started with an env file; `vbox-signin-real.cjs` ran the real VirtualBox target with the
released 1.7.2 appliance (configuration CD attached holding only the hash, machine booted, deployment reported as failed with
"did not ask for a password" because 1.7.2 predates this feature, machine removed); `vmware-real.cjs` checks the `ide1:0` lines.
Not verified: any image containing `gmmc-signin` booting (that is what the new CI boot tests do), a VMware machine started with the
CD-ROM (VMware could not start any machine on this computer, password or not), a real Raspberry Pi, a real SD card write.
Actionlint and shellcheck are clean on the changed files.

## Checks after 1.7.2 (2026-11-16)

- Firefox 159 and WebKit 27.2 (Playwright 1.65.1, `scripts/verify/cross-browser.cjs`) against the live
  site: home page with its eight feature tabs, editor with 238 stations and 20 lines, documentation search
  (17 highlighted matches for "frequen"), GTFS viewer; no page errors and no horizontal overflow in either.
  Firefox ran in the `mcr.microsoft.com/playwright:v1.65.1-noble` container because the Windows Firefox
  build would not start on this computer ("side-by-side configuration is incorrect").
- Released 1.7.2 `.ova` imported unmodified into VMware Workstation and answered `/healthz` and `/app/`
  15 s after start.
- Deploy app SSH target with sign-in, run through the real `desktop/deploy/targets/ssh.js` against a
  throwaway OpenSSH container driving this computer's Docker: link returned, `/healthz` 200, `/app/`
  redirected to sign-in, wrong password refused, right password signed in, instance removed.

## 1.7.2 (2026-11-16)

Fix: the appliance `.ova` declared the qcow2 file size (about 378 MB) as its disk capacity instead of the
2 GiB virtual size, because `appliance/build.sh` took the first `"virtual-size"` in `qemu-img info` JSON,
which newer qemu gives for the underlying file. VMware's importer refused it with "Capacity mismatch";
VirtualBox accepted it. The build now reads the top-level value with a JSON parser and stops if it is not
a number. Checked on this computer: the released 1.7.1 `.ova` boots in VirtualBox 7.2 (first boot about
6 minutes while the built-in image loads, then `/healthz` ok and `/app/` 200 through a NAT port forward);
with the capacity corrected it imports into VMware Workstation and answers `/healthz` and `/app/` 10 s
after start.

## 1.7.1 (2026-11-16)

Fix: `gmmc-auth hash` now ignores a leading UTF-8 byte order mark. Windows PowerShell put one in front of
piped text, so a hash made with `'password' | docker run -i ... gmmc-auth hash` never matched and sign-in failed.
Checked: hashes made through PowerShell and through bash both sign in against the rebuilt image.

## 1.7.0 (2026-11-16)

New: per-line station markers (`mod-markers.js`), one bend for shared track (`map.sharedBends`),
crossing reduction in auto-schematic (GTHA template 10 to 4 crossings after snapping, about 70 ms),
documentation search with the regex builder (`site/docs/docs-search.js`, regex runs in a worker cut
off after 400 ms), and optional password sign-in for the hosted server (nginx `auth_request` with a
small Go service in `docker/auth/`, PBKDF2-SHA256 hash in `GMMC_PASSWORD_HASH`, HMAC-signed HttpOnly
SameSite=Strict session cookie, rate-limited sign-in, `/healthz` stays open). Every design board
now carries the shared `accent` and `motion` Tweaks.

Verified on merged main: the `editor17`, `schematic`, `docs-search`, `deploy-web`, `times-vehicles`
and `old-map-coords` step files; the merged image with and without a password (healthz 200 both,
`/app/` 302 without a session and 200 after signing in, nothing secret in the logs); the deploy app
and wizard sign-in flows (15 of 15 and 11 of 11 checks, run on the feature branch). Not verified:
sign-in on the appliance (manual route documented), the SSH target with sign-in, `host.bat --password`
in an interactive console.

## 1.6.0 (2026-11-16)

New in this release: scenarios with compare and share links, live simulation, GTFS export, coverage
(Statistics Canada 2021) and an illustrative ridership estimate, live TTC and YRT vehicles (desktop),
travel times between stops, vehicle types per route, a redesigned GTFS import dialog, a full GTFS
viewer (`site/gtfs/`), the one-click deploy app with nine targets and an instance manager, a hosting
bundle and appliance images in every release, real coordinates for maps saved before 1.2, and a
rebuilt home page.

Verified: every `scripts/verify/*.steps.json` that ships with the editor and viewer on merged main;
the x86_64 appliance boot test in CI (app answered in 15 s); the deploy app's instance manager against
real Docker; VirtualBox and VMware import and removal with a stand-in appliance; drive writing against
a file target. Not verified: a real USB or SD write, a real Raspberry Pi boot, the appliance booting
in VirtualBox or VMware, SSH and GitHub Pages deployment with real credentials. `scripts/verify/edge-drive.mjs`
now starts Edge in private mode with sync, sign-in and extensions off, after a run captured the
browser's account sync page.

## Deploy targets, drive images and the instance manager (branch ai/feature/20261116-deploy-targets)

Not yet merged or pushed. What exists: nine deploy targets (adds VirtualBox, VMware, USB drive and Raspberry
Pi), a raw x86_64 `.img.xz` and an arm64 Raspberry Pi image in the appliance build, a multi-architecture
container image, release and check jobs for both, and an instance manager (Instances tab, registry,
health, start, stop, restart, logs, update, duplicate, remove). Details: docs/features/deploy.md and
docs/features/appliance.md.

Verified for real on this Windows computer (scripts in scripts/verify/): the manager against real Docker
(two instances, stop, restart, update 1.4.0 to 1.5.0, logs, duplicate, remove, a foreign nginx container
never touched); the desktop window driven end to end (hidden Electron); real VirtualBox 7.2 and VMware
Workstation tools (import, conversion, ownership marks, removal, refusal of machines not created by the app)
with a stand-in appliance and a wrapper that refuses to start any machine; the write-and-read-back path
against a file standing in for a drive, including cancelled and failed permission prompts; the real drive
list, which offers no Windows disk. The Raspberry Pi image was built locally under arm64 emulation with a real arm64
build of the container image, its boot partition inspected (firmware, kernel, device trees, built-in ext4, SD
and USB drivers), and the virt-twin boot test (appliance/boot-test-rpi.sh, QEMU aarch64 in an Alpine
container) passed: /healthz and /app/ answered after 38 s and the console banner showed the address.

Not verified: any real write to a USB drive or SD card (no write to a physical disk and no permission
prompt was triggered here), the appliance actually booting in VirtualBox or VMware, a Raspberry Pi booting
from the image (CI only boots a QEMU virt twin of the same root file system), the CI jobs themselves
(workflow YAML passes actionlint; they have not run), SSH and GitHub Pages with real credentials.

## 1.5.0 (2026-11-16)

Auto-schematic (`mod-schematic.js`, `schematic-worker.js`), style presets (`mod-styles.js`) and the
print layout (`mod-print.js`, vendored jsPDF 4.2.1 and svg2pdf.js 2.9.0, MIT, in `site/app/vendor/`).
Verified on merged main: schematic 98.8% straight segments, 0 order changes, crossings 19 to 10, about
0.1 s; presets change caps, markers, labels and widths; A3 landscape PDF MediaBox 1190.55 x 841.89 with
366 text operators and 40/40 sampled names as text; Cantonese falls back to the image PDF. The marker
code from patterns and styles was merged by hand and the patterns checks re-run.

## 1.4.0 (2026-11-16)

GTFS import (`mod-gtfs-import.js`, `gtfs-worker.js`) and the journey planner (`mod-journey.js`).
Verified on merged main: the real York Region Transit feed parsed in about 0.4 s, 125 routes,
Viva Blue 11/15 min; importing two routes then re-importing added no duplicate stations. Journey:
Finch to the Unionville Viva stop via Viva Blue and Viva Purple at Langstaff; travel times reach
235 of 238 stations. Limits: no URL import in the browser, `shapes.txt` and `frequencies.txt`
not read by the importer, travel times are estimates.

## 1.3.0 (2026-11-16)

Editing power, service patterns, station facilities and the network timeline, each in its own
module (`site/app/mod-*.js`) on the extension hooks in `docs/features/extensions.md`. Verified on
merged main in headless Edge with `scripts/verify/{editing,patterns,facilities,timeline}.steps.json`:
box select 238 of 238, paste then undo, palette 45 commands, pinch zoom changes view.k; Passes
removes the York Mills marker, four bands stored, branch drawn, widths follow frequency, old
`offpeak` files migrate; facility icons beside labels, scale bar 20 km to 5 km on zoom; timeline at
1960 shows Line 1 and hides Lines 2 and 4, Play stops at 2015, exports filtered including the legend.
Known limits are listed in each feature's doc.

## State (2026-11-15), version 1.2.0

Geographic editor: OpenStreetMap background, real coordinates, VIVA with real frequencies,
service types, frequency badges, bus stops, walking transfers, drawing onto real stops, PDF and
website export, project files, and a Material Design 3 interface with motion.

### 1.2.0 verified locally (headless Edge, 1440 x 900 and 390 x 844)

- Template: 238 stations and stops, 20 routes, every station with coordinates; build passes.
- Geographic fit shows the region over OpenStreetMap with attribution; four VIVA frequency badges
  on their routes (11/15, 17/21, 13/18, 13/15 min); route inspector edits service type, colour,
  width and frequency (bus sets width 4; 8/20 min stored).
- Exports from the running page: project `.gmmc.json`, website HTML (contains the map, tiles and
  attribution), SVG, PNG 6000 x 6768, PDF starting `%PDF-1.4` and ending `%%EOF`. Re-opening the
  project into a blank map restored all 21 routes.
- Drawing onto real stops: 6 real platforms near Richmond Hill Centre appeared at street level;
  clicking one added "Yonge Street / Langstaff Road" as a bus stop with OSM node 2620454491, with
  an Undo snackbar. The stop data came from a local server replaying OpenStreetMap data captured
  from Overpass the same day, because all public Overpass servers were at capacity (502/504).
- Schematic layout, dark theme with Cantonese, export menu, settings dialog; no horizontal
  overflow at 1440 or 390 px; no errors from the app.

### Live stops against the public server (verified after 1.2.0)

- The public Overpass server answered in about 37 seconds, past the 25-second timeout, so the
  timeout was raised to 60 seconds. With default settings the editor then loaded 112 real stops
  around Finch, and clicking two added "Finch" (OSM 56922363) and "Drewry Avenue at Norwin St"
  (OSM 474968519) to a new route.

### 1.2.0 release (verified)

- Release, Container image (x2) and Deploy site workflows succeeded for `28972a0`. `v1.2.0` is a
  normal release with `GTHA-Metro-Map-Creator-1.2.0-portable.exe`,
  `GTHA-Metro-Map-Creator-Server-Setup-1.2.0-portable.exe`, `gtha-metro-map-creator-site.zip` and
  `SHA256SUMS.txt`.
- The released desktop executable matched its SHA-256 (`310ea159...`) and, launched hidden, ran
  the new editor from its bundle: 238 stations, 20 routes, geographic layout, 9 OpenStreetMap
  tiles, four frequency badges, website and project export functions.
- The live site serves 1.2.0 (new scripts and documentation articles return 200). The live editor
  in headless Edge drew all tiles, four badges and the attribution.
- Announcement: Discussion #2. Repository description and topics updated and read back.

### Not verified for 1.2.0

- Wiki first page, Discussion pins and a GitHub Project: not doing, by the owner's decision on 16 November 2026.

### 1.1.x release record

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

### 1.1.1 (verified locally)

- Desktop File menu through the real menu items in the built executable: Save as wrote a
  171-station file and added it to Open recent; Open loaded a file from disk; an edit made the
  map dirty; New blank map with Cancel kept the edit; with Don't save it replaced the map.
  Dialog answers came from the hidden test path, so the operating system's own dialog windows
  were not displayed.
- Cantonese mode in the built app shows Chinese station labels, line names and search results.
- The executable carries the app icon.

### Not yet verified

- The operating system's own file dialog windows (only their answers were simulated).
- The executables on a computer without Docker, and on a second device opening the LAN address.
- Windows SmartScreen behaviour for the unsigned executables.
- Interactive `host.bat` menu mode typed by hand, and Ctrl+C out of follow mode.

### Known limits

- The bend of a shared segment comes from the first line drawn on it.
- Template station names are English only (no verified Cantonese source yet).
- The regex builder uses the browser's JavaScript engine; other engines' syntax is not offered.
- The hosted server has no sign-in.

### GTFS viewer (verified locally in headless Edge)

- `site/gtfs/` opens a GTFS feed in the browser; see `docs/features/gtfs-viewer.md`. Checks are driven by `scripts/verify/gtfs-viewer.steps.json` against the hand-made fixture `scripts/verify/fixtures/viewer-feed.zip` (regenerate with `make-gtfs-fixture.mjs`).
- The editor adds **Export, View this map as GTFS** (`site/app/mod-gtfs-viewer.js`) and receives routes from **Add to map** through IndexedDB.
- Not verified: Safari and Firefox, touch gestures on a real device, a TTC feed, screen reader output.

## Next steps

See `ROADMAP.md`, Phase 3.
