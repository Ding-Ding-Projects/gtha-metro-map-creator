# Design handoff

The design canvas holds four artboards. The hosted canvas is the viewing copy; this folder is
the record.

| File | Artboard | Size | Implemented in |
|---|---|---|---|
| `Main.dc.html` | Editor workspace | 1440 x 900 | `site/app/` |
| `Site.dc.html` | Project site | 1280 x 1400 | `site/index.html` |
| `Desktop.dc.html` | Desktop app | 1280 x 800 | `desktop/app/` |
| `Wizard.dc.html` | Server setup wizard | 760 x 560 | `desktop/wizard/` |

## Desktop app

A native window around the real editor. The File menu is open on Open recent, because native
file handling is what the desktop app adds over the web page. The map fills the window.

Deviations, both deliberate: the save dialog is the operating system's own, so it is not drawn;
and a recent-maps sidebar from the first draft was dropped in favour of File > Open recent,
which is where the shipped app puts it.

## Server setup wizard

Five steps in a rail, shown on the last step: the network address as the one large value, Open
in browser and Copy address, four checks, a Stop the server action and Back / Finish. The
language selector and version sit at the foot of the rail, as in the shipped wizard.

## Review

A design guideline pass (Stageshow 1.1.1, commit `299140f`) was applied, followed by an
independent review of rendered frames. It found ten items; nine were fixed and re-filmed:

1. Desktop: dialog hid a line end. Fixed by removing the drawn dialog.
2. Desktop: map bunched with an unnamed station. Fixed: map spans the window, every station named.
3. Desktop: sidebar 60% empty. Fixed: sidebar removed.
4. Wizard: void under the checks. Fixed: network reachability check, hint and Stop action.
5. Wizard: dead space under the step rail. Fixed: language selector and version.
6. Desktop: dialog without a scrim. Fixed by removing the drawn dialog.
7. No issue (real words throughout).
8. Wizard: two check styles. Fixed: one filled check style.
9. Desktop: offline pill cramped. Fixed by removing the pill (the app shows offline status in Help > About).
10. Menu label contrast. Not changed: Edit and View use the same ink as File; the reviewer marked it unverified.

Frames: `frames/*-v1.png` before, `frames/*-v2.png` after. They are rendered offline by
`tools/render-dc.mjs`, which expands each artboard's template and values, then captured with a
headless browser at 1x. They are design frames, not screenshots of the shipped app.

Not applicable to real application screens: the guideline kit's React parts, animation,
cursor choreography, compact phone width and marketing crop layouts.
