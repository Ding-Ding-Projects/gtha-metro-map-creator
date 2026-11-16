# Auto-schematic

Turns the geographic positions of the stations into a schematic diagram whose segments run at
multiples of 45 degrees. Code: `site/app/mod-schematic.js` (panel, preview overlay, apply),
`site/app/schematic-worker.js` (the solver, run in a Web Worker), `site/app/mod-schematic.css`.

## Use

The **Auto-schematic** section sits at the top of the right panel (collapsible); Settings has a
button that jumps to it.

| Control | Meaning |
| --- | --- |
| Spacing (1 to 4, default 2) | Grid cells between consecutive stops on a typical segment. |
| Keep geographic shape (0 to 100%, default 30%) | How strongly stations are pulled back toward their real relative positions. |
| Preview | Runs the solver, switches to the schematic layout and draws the proposal as a thin dotted overlay (ghost lines and dots). The map itself is unchanged. Esc or **Clear preview** removes it. |
| Apply | One undoable step: writes the new integer `x`, `y` to every station, removes `@x,y` bend points and per-segment bend settings from all lines, moves free labels with their nearest station, then shows the schematic layout. A toast offers Undo. |

The stats card shows the share of segments that are exactly horizontal, vertical or at 45
degrees, the number of order changes, and the number of crossings (the note below it also gives
the share that needs one bend, the crossings in the geographic positions, and the run time).

## Algorithm

1. Geographic grid positions come from `GMMC.stGeo`. A fisheye compression around the median
   position spreads the dense core and pulls far suburbs in. The strength depends on Keep
   geographic shape. Positions are scaled so the median consecutive-stop distance equals Spacing.
2. About 220 relaxation rounds. Each edge is assigned the nearest of the 8 octilinear directions
   (with hysteresis) and a target length that compresses long edges (exponent 0.5, clamped to
   0.8 to 3.5 times Spacing). Both endpoints are pulled so the edge vector matches, in a
   Gauss-Seidel sweep. A weak pull toward the scaled geographic position is added, plus a
   repulsion between stations closer than 0.8 times Spacing.
3. A move that would make a consecutive triple of stops fold back by more than 135 degrees,
   when the geographic route does not, is halved or rejected.
4. Positions are snapped to integers; collisions move to the nearest free cell. An integer
   hill-climb (moves of up to 2 cells) then minimizes angular error per edge, never producing
   an occupied cell or a new fold-back.

## Statistics, and what they mean

- **Segments at 45 degrees**: unique edges (a pair of consecutive stops, shared by all lines)
  that are exactly octilinear. The editor's `route()` draws every other edge with one bend, so
  the remaining share is always "one bend"; both shares are reported.
- **Order changes**: consecutive stop triples that fold back by more than 135 degrees although
  the geographic route does not. This is a heuristic proxy for "station order kept"; it
  is zero by construction when the solver finishes.
- **Crossings**: pairs of distinct edges, not sharing a station, whose routed polylines cross
  properly (touching and collinear overlap are not counted). The solver does not minimize
  crossings; it only reports them, with the geographic count for comparison.

On the GTHA template (238 stations, 251 edges) at Spacing 2 and Keep 30%: about 99% straight,
1% one bend, 0 order changes, 10 crossings (19 in the geographic positions), about 0.1 to 0.2 s.

## API

`window.GMMCSchematic.run({ spacing, keepShape })` resolves `{ positions, stats, params,
runtimeMs }`; `apply(result)` writes it as one undo step; `preview(result)` and `clear()` control
the overlay. If a Worker cannot be created, the solver runs on the main thread.

## Limits

- Dense downtown clusters can stay cramped at low Spacing; raise it.
- Crossings are not optimized and some remain; the result is a starting point to edit by hand.
- Interchange stations that are far apart geographically get a short link only if an edge joins
  them.

## Verification

`scripts/verify/schematic.steps.json`, with `scripts/verify/edge-drive.mjs`: runs the solver,
checks integer positions, preview overlay, Apply, Undo, Redo, panel statistics and the Cantonese
labels.
