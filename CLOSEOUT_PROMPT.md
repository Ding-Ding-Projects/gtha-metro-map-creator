# Closeout prompt

Repository: Ding-Ding-Projects/gtha-metro-map-creator. State as of release 1.7.1 (16 November 2026).

```text
Continue GTHA Metro Map Creator (public repo Ding-Ding-Projects/gtha-metro-map-creator, branch main).
Shipped: v1.7.1 at 68c7b51 (a fix on top of v1.7.0 at 9e5f3b2), normal releases with the desktop app,
server setup wizard and deploy app (portable exe, unsigned), the hosting bundle, the site zip,
x86_64 appliance images and an arm64 Raspberry Pi image, and SHA256SUMS.txt. Release Discussion #7.
1.7 added per-line station markers, one bend for shared track, crossing reduction in auto-schematic,
documentation search with a regex builder, and optional password sign-in for the hosted server.
Every design board on the canvas (and in design/) carries the shared accent and motion Tweaks;
run design/tools/add-tweaks.cjs after regenerating a board.
Verified: step files on main in headless Edge; CI boot tests of both appliance images; released
desktop app; released hosting bundle with sign-in on the LAN; PowerShell-made password hash on 1.7.1.
Not verified: sign-in on the appliance, the SSH deploy target with sign-in, host.bat --password in an
interactive console, real USB or SD writes, a real Raspberry Pi boot, the appliance inside
VirtualBox or VMware, Firefox and Safari.
Not doing, by the owner's decision: a GitHub wiki, a pinned Discussion and a GitHub Project.
Next ideas are in ROADMAP.md under "Phase 9: next".
```
