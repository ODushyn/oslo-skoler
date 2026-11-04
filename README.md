# Skolekartet — Norwegian Schools Performance Map

Live at **[skolekartet.no](https://skolekartet.no)**

---

## 1. Introduction

Skolekartet is an interactive map that visualises Norwegian school performance based on results from the national standardised tests (_Nasjonale Prøver_) published by UDIR (Utdanningsdirektoratet).

### Goal

To give parents, students, and anyone interested a clear, geographic overview of how schools perform — making it easy to compare schools across a municipality or the whole country, and to spot trends over multiple years.

### Main Features

- **Interactive map** with a colour-coded marker for every Norwegian school that has data
- **Two school types** displayed: barneskole (5. trinn) and ungdomsskole
- **Colour scale** based on the official national average (50 ± 10):
  - 🔴 **Red** `< 45` — significantly below national average
  - 🟠 **Orange** `45–49` — below national average
  - 🟢 **Light green** `50–54` — above national average
  - 🟢 **Dark green** `≥ 55` — significantly above national average
  - ⚪ **Grey** — no data available
- **School popup** showing current-year scores (Engelsk, Lesing, Regning) plus a year-by-year history table
- **Search** by school name across all schools
- **Legend panel** with explanation of the colour scale and school-district (_skolekrets_) links
- **Feedback form** (Formspree) accessible directly from the toolbar
- **Multi-year support** — new data for each school year is added on top; previous years stay as historical data in every popup

---

## 2. Implementation Details

### Data Source

All school performance data comes from **[skoleporten.udir.no](https://skoleporten.udir.no)** — the official Norwegian directorate for education. Data is exported as CSV and covers:

- `Engelsk` — English test score
- `Lesing` — Reading test score
- `Regning` — Mathematics test score

Scores are on the official national scale where **the 2022 national average was set to 50** and the standard deviation to 10.

Two separate exports are used each year:
- `Nasjonale_proever_5._trinn.csv` — barneskole (grade 5)
- `Nasjonale_proever_ungdomstrinn.csv` — ungdomsskole

Raw exports are stored in `source-data/`, processed files (with geocoded coordinates) in `processed-data/`.

### School Positions (open data only)

School positions come from open, official sources, matched by the organisation number in the raw Udir files (`school_locations.py`, cached in `cached-data/school-locations.json`, refresh with `python school_locations.py --refresh`):

1. Geonorge "Grunnskoler" WFS (data from Udir, CC BY 4.0) – almost all schools
2. Nasjonalt skoleregister coordinate (NLOD)
3. Kartverket address API with the school address from NSR (CC BY 4.0)
4. OpenStreetMap Nominatim (ODbL)

Schools without an open position are left out of the map. The old `cached-data/skoler-geo-coordinates.csv` (and the lat/lng columns in `processed-data/`) are **not** used for the map: part of that cache was filled with Google geocoding, which is not open data.

### Owner Type and Profile (NSR)

Each school is matched by name and kommune to **Udir's Nasjonalt skoleregister** ([data-nsr.udir.no](https://data-nsr.udir.no), NLOD licence) to get its owner type (*offentlig* / *privat*). The register is cached in `cached-data/nsr-skoler.json`; refresh it with `python nsr.py --refresh`. Schools without a match (about 2%) have no owner type.

NSR does not publish why a private school was approved (religious, pedagogical, international …), so the **profile** filter (Montessori, Steiner, Kristen, Internasjonal, Toppidrett, Realfag) is derived from the school name in `nsr.py` and can miss schools whose name does not say it.

A school that has both levels (1–10) appears in both UDIR exports and gets one entry per level, so its 5th-grade results are kept.

### Trivsel and School Photos

- **Trivsel** comes from Elevundersøkelsen via Udir's statistikkbank API (table 148, NLOD): the average answer to "Trives du på skolen?" (1–5), 7. trinn for barneskole and 10. trinn for ungdomsskole, matched by organisation number. Cached in `cached-data/trivsel.json`; refresh with `python elevundersokelsen.py --refresh`.
- **Photos** come from Wikimedia Commons, found via Wikidata (schools with organisation number and image). Each photo is shown with author, licence and a link to the file. Cached in `cached-data/school-photos.json`; refresh with `python photos.py --refresh`.
- **School page** `skole.html?id=<name|kommune|type>` shows results over time, Trivsel, photo, and address/pupils/website read live from the NSR API.

After refreshing any cache, run `python create_map.py` to rebuild `static/js/school-data.json`.

### National Averages (nasjonale prøver)

The national test scale has no maximum (the national average was set to 50 in 2022, standard deviation 10),
so the school page shows the national average next to each result instead of an "out of" value.
`national_averages.py` reads the "Alle skoler, Hele landet" row from the raw Udir files and writes
`static/js/landssnitt.json` (per level and year; ungdomsskole is 8. trinn). `create_map.py` runs it at the end.

### Mobbing (bullying)

`elevundersokelsen.py` also downloads table 150 "EUG - Mobbing" from Udir's statistics API (NLOD):
the share of pupils who say they were bullied two or three times a month or more, for 7. trinn
(barneskole) and 10. trinn (ungdomsskole), plus the national average. Cached in `cached-data/mobbing.json`;
`create_map.py` adds it to each school as `mobbing`, and the year and national averages to `metadata.mobbing`.
`main.js` writes them into the filter tooltips (also the year of the nasjonale prøver), so they follow the data.

### Daily data refresh (`update_data.py`, `.github/workflows/oppdater-data.yml`)

A GitHub Actions workflow runs `python update_data.py` every night (03:17 UTC) and can be started by hand
with "Run workflow". It checks the sources whose numbers can change during the year:

- **Elevundersøkelsen** (Udir's statistics API): the tables are downloaded again only when Udir's
  `OppdatertDatoTid` for table 148 or 150 is newer than at the last check.
- **Nasjonalt skoleregister**: downloaded every night (`nsr.py --refresh`).

When a source has changed, it runs `create_map.py` and `school_details.py`. The workflow commits the changed
data, and GitHub Pages publishes it. `static/js/data-status.json` holds the day the sources were last checked
(shown in the footer: "Tallene ble sist sjekket mot kildene …") and the day each source last changed. If a
source cannot be reached, the old data stays, the check date is not moved, and the workflow run fails.
Rebuilds are stable: `school-data.json` has no build date, and each school's `updated` date only moves when
its details change, so a night with nothing new only changes `data-status.json`.

Nasjonale prøver are not in Udir's open API. They are published once a year and imported by hand with
`import_exam_result.py`. The same goes for the numbers on `om-fargefordelingen.html`. Facts read from school
websites (links, AKS, læringsbrett) are refreshed by hand with their own scripts, not every night.

### School Page Details (photos, links, AKS)

The map loads one file, `static/js/school-data.json`, with what every marker and card needs.
Details that only the school page shows live in one small file per school,
`static/data/skoler/<orgnr>.json`, so the map stays light. No server database is needed:
the data only changes when the build scripts run.

- `photos.py --galleries`: up to 8 openly licensed photos per school from its own Wikimedia Commons category (Wikidata P373). Generic categories such as "Schools in Drammen" are skipped.
- `school_links.py --refresh`: the school's website from NSR, plus Facebook and Instagram links that the school's own front page shows. Links on several schools' sites or naming only the kommune are dropped. For Oslo barneskoler it also stores the links in the school site's Aktivitetsskolen (AKS) menu. Only link titles and addresses are stored, never page text. `--clean` re-applies the filters without downloading. `--more` takes a second look for schools without Facebook or Instagram: Wikidata (P2013, P2003) and up to two more pages of the school's own site, such as Kontakt. The school page always shows both icons and greys out the one with no official page. `--check` tries every school website (also with/without www and with http) and writes the full list to `cached-data/school-websites.csv` (registered address, address we link to, status, reason). A front page that only says the school has moved ("Vi har nye hjemmesider her: …", a meta refresh) is followed to the new address; parked domains and closed sites count as not working. A school whose site does not work, or that has none in NSR, is looked up in its kommune's sitemap by the school's name, and the page is kept only when its title names the school (news, projects, barnehage, booking and job pages are skipped). A refused connection or timeout keeps the last result, since hosts with many school sites turn away bursts of requests. `--check --failed` rechecks only the sites that did not work or were not reached. A site that does not work is shown as text, not as a link. `--wikipedia` stores the school's Wikipedia article from Wikidata (bokmål, else nynorsk, else English); `school_details.py` keeps it only when the title shares a word with the school's name.
- `school_details.py`: writes the per-school files from those caches.

Google Maps photos are not used: they are not openly licensed and Google's terms do not allow storing them or showing them outside Google's map.

### English and Ukrainian versions (`static/js/i18n.js`, `static/js/i18n-uk.js`)

All pages are available in English with `?lang=en` and in Ukrainian with `?lang=uk`; the header links to
the two other languages, and the choice is remembered in the browser. The Norwegian text is the key:
`t('Vis filter')` returns the English or Ukrainian text when that language is chosen. Fixed texts in the
HTML and in content added later are translated automatically when the whole text matches a key, so only
texts with values call `t()`. New Norwegian texts need an entry in the `EN` dictionary in `i18n.js` and in
`I18N_UK` in `i18n-uk.js` (loaded only for Ukrainian, so the other languages do not download it).
`python check_i18n.py` lists keys that are missing in one language or whose placeholders differ.

The English and Ukrainian texts were translated with AI. Røde Kors' AI rules (6 and 8) require a person to
review them and the page to say they are AI-translated. A notice under the header says so, in the
language itself; set `REVIEWED.en` / `REVIEWED.uk` to `true` in `i18n.js` after a person has checked the
texts. Texts from other sources (AKS link titles from school websites, values from the school register)
stay in Norwegian.

### School page = this school only; general pages and the menu

The school page shows only what is about that school. General information is on its own pages:
`ny-i-norge.html` (language support, interpreter, information in other languages), `skolefritid.html`
(SFO everywhere, AKS in Oslo: free places, opening hours, application and price) and `skolehverdag.html`
(school meals in Oslo, allergies, Geitmyra skolehage, leisure activities, the Osloskolen web filter).
On the school page, Oslo schools keep the AKS links from the school's website and the school's own groups
for newcomers, each with a link to the general page; outside Oslo the SFO and Ny i Norge sections are left
out. All pages share a "Meny" in the header (Designsystemet Dropdown, `static/js/layout.js`) grouped as
Finn skole / For foreldre / Om tjenesten; the footer lists the same pages. No site search yet: there are
few pages, so the menu is enough.

### Schools with 1.–10. trinn

A school with both levels is in the data twice (barneskole with the national tests on 5. trinn,
ungdomsskole with 8.–9. trinn). On the map page it is one school (`createSchoolMarkers` in main.js groups
records with the same name and kommune): one marker with the backpack and the hat side by side, each in the
colour of its level's result; one card in the list; one popup with a block per level. Filters and sorting
use the levels the type filter shows; with both shown, the mean of the two (both scales have 50 as the
national average), and the card shows each level's snitt under the mean. Each level keeps its school page;
the page says "Barne- og ungdomsskole (1.–10. trinn)" and has a switch between the two levels' results,
and has no "Videre" for the same school. Missing numbers are shown as "–".

### Privacy: no analytics, no cookies

Google Analytics (G-HHMNN59GDS) was removed from all pages in November 2026: it set cookies without
consent. The site sets no cookies; language, theme, saved schools (localStorage) and the searched address
for the walking time (sessionStorage, this tab only) stay in the browser. If statistics are needed again,
add a consent banner first and say so under Personvern on datakilder.html.

### Themes and dark mode (`static/js/theme.js`)

The header has a light/dark button (Aksel Sun/Moon icons). Dark mode is Designsystemet's own
`data-color-scheme="dark"`, and the maps switch to OpenFreeMap's `dark` style (`THEME.mapStyle()`, and the
`colorscheme` event that `map-init.js` and `school-page.js` listen for). Leaflet popups, zoom buttons and the
attribution line use Designsystemet tokens, so they follow the mode. Light is the default.

The theme is chosen under "Tema" at the bottom of the "Meny" dropdown, so it does not take room in the header:
Grønn (the Designsystemet theme, the default; also in each page's `<link id="dsTheme">`) and Blå
(Altinn's brand theme). The menu names them by colour, not by the agencies, so the site does not look as if it
belongs to them. The site uses the theme's `brand1` colour (`data-color="brand1"` on `<html>`,
`--ds-color-brand1-*` in `styles.css`). The brand themes set IBM Plex Mono as font; `styles.css` keeps Inter.
Both choices are kept in localStorage (`skolekartet.tema`, `skolekartet.modus`). Score colours
(red/yellow/green) do not change.

### Ny i Norge (newly arrived families)

The school page has a "Ny i Norge" section for public schools: the right to særskilt språkopplæring,
the right to an interpreter, and official information in Norwegian, English, Ukrainian and Russian
(Ny i Norge / IMDi and Udir). For Oslo schools, `velkomst.py` reads which schools have a mottaksgruppe or
alfabetiseringsgruppe, and how many places in total, from Oslo kommune's page "Tilbud til minoritetsspråklige
elever". Only school names, group type, level and number of places are stored (`cached-data/velkomst.json`);
`school_details.py` adds them to each school's detail file. Refresh with `python velkomst.py --refresh`.

There is no open per-school dataset for the share of pupils with særskilt norskopplæring (GSI):
Udir's open API only has Elevundersøkelsen, and Skoleporten no longer exists.

### Next school after year 7 (Oslo)

In Oslo the barneskole decides the ungdomsskole. `ungdomsskole_oslo.py` reads Oslo kommune's list
"Skolekrets ungdomsskole" (one line per barneskole, only school names and links to boundary maps) and
`school_details.py` adds `nextSchool` to each barneskole and `fromSchools` to each ungdomsskole.
Refresh with `python ungdomsskole_oslo.py --refresh`.

### Walking time (gangtid)

With an address, list cards show "ca. N min å gå". On the school page walking time and map are one block
("Kart og gangtid"): the card on the map shows only the minutes and where from; the address search,
distances, the skyss note, "Slik regner vi" and the OpenStreetMap route link sit under the map. The time comes from
a real walking route along roads and paths: Entur's open Journey Planner API (`walkRoute` in
`static/js/shared.js`, header `ET-Client-Name: skolekartet-web`, map data from OpenStreetMap), at
4.5 km/h. Only the two coordinates are sent, never the address text. If Entur does not answer, and in the
list cards, the estimate is used instead, computed in the browser from open data only:
straight-line distance between the Kartverket address point and the school's open position, times 1.3
for the way along roads, at 4.5 km/h (`walkEstimate` in `static/js/shared.js`). Above 180 minutes it says
"For langt å gå". When the estimated road distance passes 2 or 4 km, the block shows the right to free
school transport (opplæringslova § 4-1: year 1 over 2 km, years 2–10 over 4 km). The address is kept only
in `sessionStorage` (this browser tab), never in the URL or on a server.

### Comparisons and charts on the school page

Inspired by the comparisons on skoleplass.no (ideas only, own text and design), built as inline SVG
without libraries, colours from Designsystemet tokens, each chart followed by a table with the same data:
- Trivsel and Mobbing cards show the kommune and the whole country for the same year and trinn, plus
  "N svar" when fewer than 30 pupils answered (answers from table 148; table 150 counts bullied pupils).
- National tests: a dot per subject for the school, a solid line for the country (`landssnitt.json`) and
  a dashed line for the kommune (`kommunesnitt.json`, rows "Alle skoler" in the kommune, written by
  `national_averages.py`).
- `python elevundersokelsen.py --indicators` downloads all indicators of table 148 (Trivsel, Støtte fra
  lærerne, Mestring, Motivasjon, Vurdering for læring, Læringskultur, Elevdemokrati og medvirkning) and
  Mobbing (table 150) for the three newest years, for schools, kommuner and the country. The school page
  shows them as indicator × year with a sparkline; values hidden by Udir show as "*".
- "Andre skoler i nærheten": the six nearest schools of the same level within 3 km, straight-line distance.

### Activities, facilities and food (icon blocks on the school page)

Two blocks of tiles ("Aktiviteter og anlegg", "Mat"). A tile is shown only when a source names that
school; nothing is read from page text or PDFs.
- `anlegg.py`: swimming pool, football pitch and sports hall near each school from OpenStreetMap (ODbL),
  read locally from Geofabrik's Norway extract with pyosmium (`pip install osmium`; the 1.4 GB file goes to
  `source-data/osm/`, ignored by git). Anleggsregisteret's open download is no longer updated, and the
  public Overpass servers ask bulk users to use an extract. Pitch and hall count within 150 m, the nearest
  named pool within 2 km. `python anlegg.py --refresh [--download]`.
- AKS tiles (Oslo) come from the AKS menu links in `cached-data/school-links.json` (titles with
  "lekse", "kurs"/"aktivitetstilbud", "ferie", "mat"/"meny", "skolemelk").
- `python aks_mat.py --refresh` reads all AKS pages of Oslo schools (start page and menu pages) and keeps
  only facts read with strict rules: days per week, which days, warm food (and how often), days with an
  extra matpakke. Holidays, breakfast, fruit only, the club and pages for one base or trinn are handled
  as described in the script; a fact two pages disagree on is left out. The refresh lists every school
  whose facts changed, so wording changes on the pages can be checked by hand, and
  `python aks_mat.py --test` checks the rules on example sentences. The Mat block shows the facts as
  tiles linking to the page; without facts, "Se menyen".
- `python school_links.py --devices` stores front-page links about læringsbrett/iPad/Chromebook
  (title and address only) in `cached-data/school-devices.json`.
- General Oslo facts (Geitmyra skolehage, the Osloskolen web filter, food at AKS, free school meals
  ended in 2024) are written in our own words with links, checked on oslo.kommune.no 2 November 2026.
`school_details.py` adds `anlegg` and `devices` to the per-school files.

### Nearest schools for an address without skolekrets data (Oslo and others)

Where no open skolekrets data exists (Oslo included), the address search shows the nearest public
barneskole and ungdomsskole in the same cards as the krets pilot (bookmark, "Del", "Vis på kartet"), titled
"Nærmeste offentlige skoler", with a note that the kommune decides the krets and, for Oslo, links to
Oslo kommune's own lookup. These cards never claim that the address belongs to the school.

### Feedback question on every page

`static/js/page-feedback.js` (loaded by `layout.js`, not on tilbakemelding.html) asks "Fant du det du
lette etter?" and sends Ja/Nei, then optional text, to the same Formspree form as tilbakemelding.html.
The page is sent without the hash. Formspree's free plan allows 50 submissions a month.

### Skolekrets Pilot (Halden, Stavanger, Fredrikstad)

Oslo is not in the pilot: the school district layer in Oslo kommune's own maps comes from Geodata AS'
commercial "GeomapUtdanning" service (districts computed from Matrikkelen), shared through a credential
proxy. It is not open data and must not be used here. For Oslo addresses the note links to Oslo kommune's
own "Finn barneskole" and "Finn ungdomsskole" lookups.

If Oslo kommune delivers its school districts (for example after a written permission), save them as
`source-data/oslo-skolekretser.geojson`: a GeoJSON FeatureCollection in WGS84 with one Polygon or
MultiPolygon per krets, the school's name in `properties.name` and, for ungdomsskole districts,
`properties.level = "ungdomsskole"`. Then run `python skolekretser.py`; Oslo is added with the source
"Oslo kommune, skolekretser (brukt med tillatelse)", and the address search looks it up like Halden and
Stavanger. Keep the written permission. The data must not be taken from Oslo kommune's own lookup with
the access key on their page: that is not an open service.

There is no open national dataset of school districts; Matrikkelen has them, but only under agreement with Kartverket.
`skolekretser.py` builds `static/js/skolekretser.json` from the kommuner that publish districts as open data:
Halden barneskolekretser (SOSI on Geonorge, 2025) and Stavanger barne- and ungdomsskolekretser (GeoJSON, NLOD 2.0, undated). Fredrikstad's «Inntakssoner» for barne- and ungdomsskoler (Geonorge, open data, 2018) were added in
November 2026; a search of Geonorge and data.norge.no found no open districts for Oslo, Bergen, Trondheim,
Nordre Follo or Hamar. `school_details.py` adds each matched school's krets (`skolekrets`), and the school
page draws it on its map with the source.

### Contact, saved schools
- `python school_links.py --contacts` stores email and phone from Enhetsregisteret (Brreg, NLOD) in
  `cached-data/school-contacts.json`: only shared mailboxes (postmottak@, post.skolen@ …) and landlines; an
  address that looks like a person's name and mobile numbers are left out. The school banner shows address,
  email and phone with buttons for Google Maps, email and call.
- "Lagre til senere": the bookmark on the school cards and in the school banner saves the school's key in
  localStorage (`skolekartet.lagrede`), only in this browser. "Lagrede skoler" in the header (all pages, with
  a count) opens them in the list and on the map (`?lagrede=1`); "Vis alle skoler" above the list goes back.
  On phones the header keeps logo, saved schools, theme and language; the info pages are in the footer.
The address search shows the krets, outlines it on the map and marks the school as "Skolekrets (pilot)".
A check in the script confirms every matched school lies inside its own krets.

### Missing Data Handling

UDIR marks unavailable scores as `*` (typically for very small schools where publishing results would compromise student privacy).

| Case | How it is handled |
|---|---|
| All three scores missing (`*;*;*`) | School shown as **grey marker**; excluded from cluster colour calculations |
| Some scores missing (`53;*;47`) | Average calculated from **valid scores only**; popup shows `*` for missing subjects with a note like "basert på 2 fag" |
| All scores present | Standard coloured marker |

This ensures schools are never penalised for missing data and that grey markers do not distort the statistics of surrounding clusters.

### Map Data

All school data is compiled once into `static/js/school-data.json` by the Python pipeline. The JSON contains every school with its coordinates, scores per year, and school type. The browser loads this file once and renders everything client-side using **Leaflet**.

---

## 3. Technical Details (for developers)

### Running locally

```
python3 dev_server.py
```

Opens the site on http://localhost:8000. Unlike `python3 -m http.server`, it tells the browser not to cache
(`Cache-Control: no-store`), so a reload always shows the latest version.

### Prerequisites

- Python 3.7+
- `pip install -r requirements.txt`

### Project Structure

```
oslo-skoler/
├── import_exam_result.py          # ⭐ Main annual-update script (run this each year)
├── create_csv_with_coordinates.py # Geocodes a source CSV → processed-data/
├── create_map.py                  # Builds static/js/school-data.json from processed CSVs
├── geo.py                         # Geocoding utilities + cache logic
│
├── source-data/                   # Raw UDIR exports (one CSV per school type per year)
├── processed-data/                # Geocoded CSVs (generated, do not edit manually)
├── cached-data/
│   └── skoler-geo-coordinates.csv # Geocoding cache (commit this file)
│
├── static/
│   ├── js/
│   │   ├── school-data.json       # Generated map data (commit this file)
│   │   ├── main.js                # App logic (search, modals, feedback form)
│   │   ├── map-init.js            # Leaflet map initialisation
│   │   └── school-markers.js      # Marker rendering logic
│   ├── css/styles.css
│   └── templates/info-modal.html  # Legend, modals, feedback form HTML
│
├── index.html                     # Entry point served by GitHub Pages
├── CNAME                          # Custom domain: skolekartet.no
├── robots.txt
└── sitemap.xml
```

### First-time Setup

```bash
git clone https://github.com/ODushyn/oslo-skoler.git
cd oslo-skoler
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

Open `index.html` in a browser — the map works immediately from the committed `school-data.json`.

### Adding a New School Year

When UDIR publishes new data (typically February–March each year):

**1. Download the two CSV exports from [skoleporten.udir.no](https://skoleporten.udir.no)**
- Nasjonale prøver → 5. trinn → export as CSV → save to `source-data/`
- Nasjonale prøver → ungdomstrinn → export as CSV → save to `source-data/`

File names follow the pattern: `YYYY-YY_YYYYMMDD-HHMM_Nasjonale_proever_5._trinn.csv`

**2. Run the update script**

```bash
python import_exam_result.py 2026-27 \
    "source-data/2026-27_20270215-1000_Nasjonale_proever_5._trinn.csv" \
    "source-data/2026-27_20270215-1001_Nasjonale_proever_ungdomstrinn.csv"
```

This single command:
1. Validates both source files exist
2. Geocodes new schools (cached schools are instant)
3. Writes two files to `processed-data/`
4. Updates `CURRENT_YEAR` in `create_map.py`
5. Regenerates `static/js/school-data.json`

**3. Verify and commit**

```bash
# Open index.html in a browser and check the map looks correct
git add processed-data/ static/js/school-data.json create_map.py cached-data/
git commit -m "Add 2026-27 school year data"
git push
```

GitHub Pages deploys automatically on push — the live site updates within ~1 minute.

### Manual Step-by-Step (alternative to the update script)

```bash
# 1. Geocode each source file separately
python create_csv_with_coordinates.py \
    "source-data/2026-27_XXXXXXXX-XXXX_Nasjonale_proever_5._trinn.csv"

python create_csv_with_coordinates.py \
    "source-data/2026-27_XXXXXXXX-XXXX_Nasjonale_proever_ungdomstrinn.csv"

# 2. Update CURRENT_YEAR in create_map.py (one line near the top)
#    CURRENT_YEAR = '2026-27'

# 3. Regenerate the map data
python create_map.py
```

### Utilities

**Find coordinates for a single address:**

```bash
python -m utils.find_school_coordinates "Majorstuen skole, Oslo, Norway"
# Output → Coordinates: 59.9260;10.7205
```
