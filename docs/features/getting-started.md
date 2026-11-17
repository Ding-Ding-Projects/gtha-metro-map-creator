# Getting started and tool guidance

People found the editor hard to start with: adding things lived in five small icons in a side rail
with no hint of what to do next, the right panel opened on analysis tools rather than on what was
selected, and on a phone the tools sat below the panels at the bottom of the page. Release 1.9
rearranges and explains; it removes nothing. Design: `design/Easy18.dc.html`
(generator `design/tools/gen-easy18.cjs`). Code: `site/app/mod-easy.js` and `mod-easy.css`, with
small hooks in `site/app/app.js`.

## Tool bar on the map

`#tools` is now a floating bar at the top centre of the map instead of a rail at the left edge.
Each tool shows its icon and name; the shortcut key is in its tooltip and `aria-keyshortcuts`.

| Tool | Key | What a click on the map does |
| --- | --- | --- |
| Select | V | Selects; drag moves; Shift-drag box-selects |
| Station | S | Adds a station, or inserts one into a clicked route |
| Route | L | Adds the clicked station, or a new stop, to the active route (a new route if none) |
| Bus route | B | The same, but a new route starts with the bus service type and a 6 px width |
| Label | T | Places a label |
| Erase | E | Deletes the clicked station, label or segment |
| More | | Menu: import a GTFS feed, paste copied stations, start from the GTHA template, start a blank map, all commands (Ctrl+K) |

Switching to Bus route while a rail route is active starts a new bus route, and switching back to
Route from a bus route starts a new rail route, so one tool never silently extends the other's
route. When the map is narrower than 760 px (container query on `.stage`) the bar keeps every tool
as an icon, with the name kept for screen readers and in the tooltip.

## Hint for the current tool

`#toolHint` (a polite live region) under the tool bar says what to click. While a route is being
drawn it reads "*Route name* · *n* stops. Click the map or a station for the next stop." with
**Finish** (also <kbd>Enter</kbd>) and **Undo stop** (one undo step). Finish ends drawing, switches to
Select and leaves the route selected so its name, colour and frequencies are in the inspector. The
× button hides hints; **Help > Show tool hints** brings them back. Stored in `localStorage` as
`gmmc.easy.hints`.

## Right panel tabs

The right panel has three tabs (`role="tablist"`, arrow keys, Home and End):

- **Selected**: the inspector. With nothing selected it shows the getting-started checklist.
- **Analyse**: every other section the feature modules add (trip planner, auto-schematic, coverage,
  ridership, scenarios). Sections are sorted by a `MutationObserver`, so modules that add their
  section later land in the right tab.
- **Style**: map style presets.

Selecting anything on the map switches to Selected. The open tab is remembered (`gmmc.easy.tab`).

## Getting-started checklist

Five steps, each ticked from the map itself: a station exists; a route has two or more stops; a
route has a frequency; every drawn route has been renamed from its default name (or has a Chinese
name); something has been exported (any item of the Export menu). Each open step has a button that
picks the tool, opens the newest route in the inspector, or opens the Export menu. **Hide
checklist** stores `gmmc.easy.gsHidden`; **Help > Getting-started checklist** shows it again.

## Start card on a blank map

When the map has no stations and Select is the tool, a card on the map offers: add your first
station, draw a route, import a GTFS feed, use the GTHA template. Picking a tool hides it.

## Help menu

A Help button in the top bar opens: Getting-started checklist, Show or Hide tool hints, All commands
(Ctrl+K) and the User guide.

## Search

Routes now come first in the left panel. Search mode, Ignore case and the regex builder sit behind
the **.\*** button beside the search box (`aria-expanded`, remembered as `gmmc.easy.rxOpen`, and open
whenever the mode is Regular expression). The builder itself is unchanged.

## Phones

Below 900 px the tool bar is fixed along the bottom of the screen with labels under the icons, and
the snackbar sits above it. Below 560 px Label and Erase move into More, so every tool stays
reachable. The hint wraps its buttons onto a second line.

## Languages

Every new string has English and Cantonese text (`I18N.add` in `mod-easy.js`). Tabs, menus, hints
and the start card are redrawn when the language changes.

## Verification

`scripts/verify/easy.steps.json`, run with `scripts/verify/edge-drive.mjs` at 1440×900 and 390×844:
labelled tools on the map, B starts a bus route, drawing updates the hint, Undo stop, Enter finishes
and selects the route, tabs by keyboard, selecting switches back to Selected, the regex toggle is
beside the search box, Routes come first, the checklist counts, the Help menu, hiding hints, the
start card and its Station option, Cantonese labels, dark theme, no horizontal overflow and no page
errors.
