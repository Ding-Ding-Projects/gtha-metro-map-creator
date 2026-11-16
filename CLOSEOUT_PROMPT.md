# Closeout prompt

Repository: Ding-Ding-Projects/gtha-metro-map-creator. State as of release 1.6.0 (16 November 2026).

```text
Continue GTHA Metro Map Creator (public repo Ding-Ding-Projects/gtha-metro-map-creator, branch main).
Shipped: v1.6.0 at 43b44e3, a normal release with the desktop app, server setup wizard and deploy app
(portable exe, unsigned), the hosting bundle (pinned compose.yaml and host.bat), the site zip, x86_64
appliance images (qcow2, vhdx, ova, raw USB img) and an arm64 Raspberry Pi image, and SHA256SUMS.txt.
Release Discussions #5 (1.5.0) and #6 (1.6.0) are posted.
Verified: every scripts/verify step file on main in headless Edge; CI boot tests of both appliance
images; released desktop app, deploy app and hosting bundle run locally (bundle answered on the LAN);
live site serves /, /app/, /gtfs/, /docs/.
Not verified: real USB or SD writes, a real Raspberry Pi boot, the appliance inside VirtualBox or VMware,
SSH and GitHub Pages deployment with real credentials, the TTC GTFS feed, Firefox and Safari.
Not doing, by the owner's decision: a GitHub wiki, a pinned Discussion and a GitHub Project
(staged wiki pages stay in docs/wiki/pending/).
Next ideas are in ROADMAP.md under "Phase 8: next".
```
