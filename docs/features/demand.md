# Ridership estimate and line loads

`site/app/mod-demand.js` adds a "Ridership estimate" section to the right panel. With "Show
estimated loads" on, each line's width on the map follows the average load a simple gravity model
puts on it, and a legend states **"Illustrative estimate, not a forecast"**. The estimate needs the
population data (see [coverage.md](coverage.md)) and the journey planner
(see [journey.md](journey.md)).

## Method

1. Take the 150 stations with the most people within 800 m (from the coverage module).
2. For every ordered pair of those stations, trips = `K * P_i * P_j / max(t_ij, 5)^2`, where `P` is
   the 800 m population, `t` is the peak journey time in minutes from the journey planner, and
   `K = 1`. Pairs with no route are skipped.
3. Each pair's trips are added to every stop-to-stop segment on its fastest path (rides only;
   walking transfers carry no load). The path comes from `GMMCJourney.pathsFrom`, a small addition
   to the journey module that returns the rides of the fastest trip from one origin to many
   destinations after a single search.
4. A line's load is the mean of its segment loads (segments nobody uses count as zero). Widths run
   from 3 to 16 px on a square-root scale between the lightest and the busiest line, so the
   differences between lighter lines stay visible. The panel lists lines by load relative to the
   busiest (100) and names the busiest segment.

The estimate re-runs about 0.4 s after the map changes while the switch is on. It runs in chunks
of six origins, yielding to the page between chunks, and shows progress.

## Limits

- Loads are relative. `K` is not calibrated to counts, so no figure is a number of riders; only the
  ordering and rough proportions mean anything.
- Gravity models ignore mode choice, capacity, fares, jobs and other destinations. Population is
  the only attractor, and only 150 stations act as origins and destinations (other stops can still
  carry through trips). Long lines that run through low-density areas average low.
- Peak times and headways come from the journey planner's estimates (see journey.md), including
  the default 10-minute headway where a line has no frequency.
- The exported map shows the widths and a short note under the map; the interactive legend is not
  part of exports.

## Verification

`scripts/verify/coverage.steps.json` toggles the loads in headless Edge on the built-in template:
150 stations, 21,758 pairs, completes in about 0.25 s. The busiest segment is College to TMU on
Line 1 (index 100, width 16 px), Line 2 is 68, the Ontario Line 55, Line 5 29, and the VIVA lines
1 to 4. The legend, the widths on the map, Cantonese text and turning the loads off were checked
with no page errors.
