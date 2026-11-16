# Network timeline

The timeline shows the network as it was in a chosen year. It is a view over the map: nothing is
removed from the saved map, and turning it off restores every line.

## Turning it on

- Press `Y` (when no text field or dialog has focus), or switch on **Show network timeline** in Settings.
- A bar appears over the map: a round Play button, the year in large text, a slider with tick labels
  for each year where something opens or closes, and the number of lines open.
- Timeline state (on or off, current year) is kept in memory only and is not saved with the map.

## Years on the map

| Field | Applies to | Meaning |
| --- | --- | --- |
| `opens` | line, station | first year it is in service |
| `closes` | line, station | first year it is no longer in service |

Both are integers from 1800 to 2100 and optional. A value outside that range is dropped when a
map is loaded. Edit them in the Inspector (**Timeline**, fields **Opens** and **Closes**) for a
selected line or a single station. Edits are undoable.

## What is drawn

For the chosen year, a line is drawn when `opens` is not after the year and `closes` is not at or
before it. A line or station with no year is always treated as open, because its date is unknown.
A station is hidden when its own dates exclude it, or when every line serving it is closed that
year. Hidden stations are removed from the paths of open lines, and transfers to hidden stations
are dropped.

## Playing

Play steps one year every 400 ms from the earliest to the latest year on the map, and stops at the
end. Lines that open during playback draw in along their path (dashed lines fade in). With
`prefers-reduced-motion` the Play button jumps straight to the last year and no animation runs.

## Exports

Exports use the same filtered view. SVG, PNG, PDF and website exports show the chosen year as small
text under the map title. The legend still lists every line in the map.

## Template years

The built-in GTHA template sets only years that are certain: Line 1 1954, Line 2 1966, Line 4
2002 and UP Express 2015. Every other line is intentionally left blank, because its date is
uncertain, it is planned or under construction, or the template merges several services. Blank
means "always shown", so the filter only changes the four dated lines until you add more years.
Maps you already saved are never modified; set years on them yourself.
