# Ideas for later

Things we have looked at but not done yet. Newest first.

## Search engines: what is left after the static pages

The school and kommune pages under `skoler/` are built by `site_pages.py` (see README). Still to do:

- Address and number of pupils on the static school page. They come from NSR's page for each school
  (`data-nsr.udir.no/v4/enhet/<orgnr>`), which only the browser reads today; the nightly refresh would have
  to download about 2 600 pages, or only the ones that changed.
- English and Ukrainian addresses that search engines can read, with `hreflang`. Today the languages are
  `?lang=` on the same page and are translated in the browser.
- Google Search Console and Bing Webmaster Tools: the site owner verifies the domain with a DNS record (no
  tracking on the site) and sends `sitemap.xml`.
- Texts for parents on the kommune pages (school start, SFO/AKS, how to change school). They need a person to
  check them before they are published.

## Colour threshold per level from the national average

Today one fixed threshold, 49.31 (`determine_marker_color` in `create_map.py`, `score-colors.js` and the text
on `om-fargefordelingen.html`), splits orange from light green for all schools. Udir's national average for
2025-26 is 49.3 for year 5 and 49.7 for year 8 (`static/js/landssnitt.json`, the "Alle skoler, Hele landet"
row).

- Idea: take the threshold per level and year from `landssnitt.json` instead of the fixed 49.31.
- Effect with the 2025-26 data: 76 lower secondary schools with an average between 49.31 and 49.7 would turn
  from light green to orange; no primary school changes.
- Update `om-fargefordelingen.html` (the ranges and the explanation) at the same time.
