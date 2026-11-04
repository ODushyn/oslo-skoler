# Ideas for later

Things we have looked at but not done yet. Newest first.

## Colour threshold per level from the national average

Today one fixed threshold, 49.31 (`determine_marker_color` in `create_map.py`, `score-colors.js` and the text
on `om-fargefordelingen.html`), splits orange from light green for all schools. Udir's national average for
2025-26 is 49.3 for year 5 and 49.7 for year 8 (`static/js/landssnitt.json`, the "Alle skoler, Hele landet"
row).

- Idea: take the threshold per level and year from `landssnitt.json` instead of the fixed 49.31.
- Effect with the 2025-26 data: 76 lower secondary schools with an average between 49.31 and 49.7 would turn
  from light green to orange; no primary school changes.
- Update `om-fargefordelingen.html` (the ranges and the explanation) at the same time.
