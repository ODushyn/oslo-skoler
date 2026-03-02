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

### Geocoding

School addresses are geocoded using **OpenStreetMap Nominatim** (via `geopy`). Coordinates are cached in `cached-data/skoler-geo-coordinates.csv` so that schools already seen are never re-geocoded. This makes annual updates fast — only new or renamed schools require a network call.

Schools that cannot be geocoded are silently excluded from the map (coordinate defaults to `0,0` and are filtered out).

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
