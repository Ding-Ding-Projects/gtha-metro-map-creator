# Scenarios and compare

A project can hold several named versions of the map, for example "Today" and a "2031 plan".
Implemented in `site/app/mod-scenarios.js` and `mod-scenarios.css`.

## Using it

- The **layers** button in the app bar opens the Scenarios side sheet in place of the inspector.
- Each scenario shows its route count. Selecting one switches the editor to it.
- **New** creates a scenario either as a branch of the current map or as a blank map.
  **Rename** and **Delete** act on the active scenario. The last scenario cannot be deleted, and
  deleting asks for a second click.
- **Compare** shows the chosen baseline on the left of a draggable divider and the active scenario
  on the right. The divider has a round handle, follows the pointer, and moves with the left and
  right arrow keys (Shift for larger steps, Home and End for the edges). Tags at the top corners
  name both scenarios. The right side stays editable; the left side is a view of the baseline
  drawn with the editor's own geometry, lines and stations only.
- **Changes** lists the differences from the baseline to the active scenario, with `+` added,
  `~` changed and `-` removed markers: routes added or removed (matched by id, then by name),
  rerouted routes, frequency changes, renames and colour or style changes, and stations added or
  removed that do not belong to an added or removed route.

## Storage

- The scenario list lives in `localStorage` under `gmmc.scenarios.v1` as
  `{ active, base, items: [{ id, name, map }] }`. The editor map is always the active scenario and
  is copied into it about half a second after each change.
- Saved project files carry the same structure in a top-level `scenarios` field. Project files
  without that field still open and become a single "Today" scenario. Opening a plain map file
  replaces the active scenario's map only.
- Two small hooks were added to `app.js`: `projectSave` (functions returning fields to add to the
  project file) and `projectLoad` (functions called with the parsed project and its validated map).

## Limits and notes

- At most 12 scenarios. Every stored map is validated again on load.
- Switching scenarios replaces the map through the normal undo checkpoint, so Undo reverts a switch.
- The baseline layer does not draw labels, facilities or other overlays.
- Scripted access for tests: `window.GMMCScenarios` (`list`, `create`, `switchTo`, `rename`,
  `remove`, `setCompare`, `diff`).

## Verification

`scripts/verify/scenarios.steps.json` creates a branch, edits it, checks the change list, moves the
divider by keyboard, saves and reloads a project, and opens a share link.
