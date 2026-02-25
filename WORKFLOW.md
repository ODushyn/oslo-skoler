# Norwegian Schools Map - Workflow Diagram

---

## ⭐ Annual Update Checklist (run this every new school year)

When new UDIR data arrives (e.g. for **2026-27**), you only need to run **one command**:

```bash
python import_exam_result.py 2026-27 \
    "source-data/2026-27_XXXXXXXX-XXXX_Nasjonale_proever_5._trinn.csv" \
    "source-data/2026-27_XXXXXXXX-XXXX_Nasjonale_proever_ungdomstrinn.csv"
```

Replace the `XXXXXXXX-XXXX` timestamp parts with the actual export timestamp in the filenames.

### What `update_year.py` does automatically

| Step | Action |
|------|--------|
| 1 | Validates both source CSV files exist |
| 2 | Geocodes **barneskole (5. trinn)** file → `processed-data/` (uses cache) |
| 3 | Geocodes **ungdomsskole** file → `processed-data/` (uses cache) |
| 4 | Updates `CURRENT_YEAR = '2026-27'` in `create_map.py` |
| 5 | Runs `create_map.py` → rebuilds `static/js/school-data.json` |

### Rules about data display

- **Only the newest year's schools are shown as markers on the map.**
- All previous years are loaded as **historical data** shown in each school's popup.
- No other files need to be modified — the year is driven by the single `CURRENT_YEAR`
  constant in `create_map.py`.

### After running the script

1. Open `index.html` in a browser and verify the map looks correct.
2. Commit changes: the two new `processed-data/` CSVs, `static/js/school-data.json`,
   and the updated `create_map.py`.

### Manual alternative (if you prefer step-by-step)

```bash
# 1. Geocode barneskole source file
python create_csv_with_coordinates.py \
    "source-data/2026-27_XXXXXXXX-XXXX_Nasjonale_proever_5._trinn.csv"

# 2. Geocode ungdomsskole source file
python create_csv_with_coordinates.py \
    "source-data/2026-27_XXXXXXXX-XXXX_Nasjonale_proever_ungdomstrinn.csv"

# 3. Edit create_map.py — change ONE line near the top:
#    CURRENT_YEAR = '2026-27'

# 4. Regenerate the map data JSON
python create_map.py
```

---

## Complete Workflow: From UDIR to Interactive Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: DATA ACQUISITION                    │
└─────────────────────────────────────────────────────────────────────┘

    📥 Download from UDIR.no
         │
         ├── Nasjonale Prøver Results
         ├── Export as CSV
         └── Save to project directory
                │
                ▼
    📄 udir_export.csv
         │ (Raw UDIR format - varies by export type)
         │
         
┌─────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: FORMAT ANALYSIS                        │
└─────────────────────────────────────────────────────────────────────┘

         │
         ▼
    🔍 analyze_udir_format.py
         │
         ├── Detects columns
         ├── Shows sample data
         ├── Suggests mappings
         └── Identifies issues
                │
                ▼
         📊 Console Output
            - Available columns
            - Recommended code changes
            - Format type detected
         
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: STANDARDIZATION                          │
└─────────────────────────────────────────────────────────────────────┘

         │
         ▼
    ⚙️ standardize_udir_format.py
         │
         ├── Auto-detects common formats
         ├── OR Interactive column mapping
         └── Converts to standard format
                │
                ▼
    📄 standardized_udir.csv
         │
         │ Standard format:
         │ Skole;Kommune;Engelsk;Lesing;Regning
         │
         
┌─────────────────────────────────────────────────────────────────────┐
│                       PHASE 4: GEOCODING                             │
└─────────────────────────────────────────────────────────────────────┘

         │
         ▼
    🌍 create_csv_with_coordinates.py
         │
         ├── Reads standardized CSV
         ├── For each school:
         │   ├── Build address: "School, Kommune, Norway"
         │   ├── Call Nominatim API
         │   ├── Extract lat/lng
         │   └── Wait 0.1s (rate limit)
         └── Write output CSV
                │
                ▼
    📄 norge_skoler_coordinates.csv
         │
         │ Format:
         │ Skole;Kommune;Engelsk;Lesing;Regning;lat;lng
         │
         │
         
┌─────────────────────────────────────────────────────────────────────┐
│                     PHASE 5: MAP GENERATION                          │
└─────────────────────────────────────────────────────────────────────┘

         │
         ▼
    🗺️ create_map.py
         │
         ├── Reads coordinates CSV
         ├── Calculates map center
         ├── Determines zoom level
         ├── For each school:
         │   ├── Calculate average score
         │   ├── Determine marker color
         │   ├── Create popup with details
         │   └── Add marker to map
         └── Generate HTML with Folium
                │
                ▼
    📄 norge_skoler_kart.html
         │
         │ Interactive Leaflet map
         │ with color-coded markers
         │
         
┌─────────────────────────────────────────────────────────────────────┐
│                      PHASE 6: VISUALIZATION                          │
└─────────────────────────────────────────────────────────────────────┘

         │
         ▼
    🌐 Open in Browser
         │
         ├── View interactive map
         ├── Click markers for details
         ├── Zoom and pan
         └── Explore school performance
                │
                ▼
         ✅ Done!
```

---

## Alternative Workflow: Oslo Data (Backward Compatible)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SIMPLIFIED OSLO WORKFLOW                          │
└─────────────────────────────────────────────────────────────────────┘

    📄 skoler_2024-2025.csv
         │ (Simple format: Skole;Engelsk;Lesing;Regning)
         │
         ▼
    🌍 create_csv_with_coordinates.py
         │ (Automatically adds ", Oslo, Norway")
         │
         ▼
    📄 skoler_2024-2025_coordinates.csv
         │
         ▼
    🗺️ create_map.py
         │ (Fixed Oslo center, zoom 10)
         │
         ▼
    📄 index.html
         │
         ▼
    ✅ Oslo Schools Map
```

---

## Decision Tree: Which Tools Do I Need?

```
START: I have data from UDIR
         │
         ▼
    ┌─────────────────────────────────────┐
    │ Is it already standardized?         │
    │ (Columns: Skole, Kommune, etc.)     │
    └─────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
   NO        YES
    │         │
    ▼         │
Use          │
standardize_ │
udir_format  │
.py          │
    │         │
    └────┬────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │ Does it have coordinates?           │
    │ (Columns: lat, lng)                 │
    └─────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
   NO        YES
    │         │
    ▼         │
Use          │
create_csv_  │
with_        │
coordinates  │
.py          │
    │         │
    └────┬────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │          Ready for mapping!          │
    │      Use create_map.py              │
    └─────────────────────────────────────┘
```

---

## Color Coding System

```
Test Score Average Calculation:
    average = (Engelsk + Lesing + Regning) / 3

Marker Color Assignment:

    average < 50     →  🔴 RED         (Needs improvement)
    average 50-52    →  🟠 ORANGE      (Below average)
    average 52-54    →  🟢 LIGHTGREEN  (Above average)  
    average > 54     →  🟢 DARKGREEN   (Excellent)

Map Display:
    ┌─────────────────────────────────┐
    │  🗺️ Norway Map                  │
    │                                  │
    │  🔴 School A (avg: 48)          │
    │  🟠 School B (avg: 51)          │
    │  🟢 School C (avg: 53)          │
    │  🟢 School D (avg: 56)          │
    │                                  │
    │  [Click marker for details]     │
    └─────────────────────────────────┘
```

---

## Error Handling Flow

```
Running Geocoding...
    │
    ├── For each school:
    │      │
    │      ├── Try to geocode
    │      │      │
    │      │      ├── Success → Save coordinates
    │      │      │
    │      │      └── Failure → Save (0, 0)
    │      │                    Log warning
    │      │
    │      └── Wait 0.1s
    │
    └── Summary:
           - X schools processed
           - Y schools skipped
           - List failed schools

Creating Map...
    │
    └── For each school:
           │
           ├── Has valid coords? (not 0,0)
           │      │
           │      ├── YES → Add marker
           │      │
           │      └── NO → Skip (don't add to map)
           │
           └── Continue
```

---

## File Dependencies

```
                analyze_udir_format.py
                        │ (optional, for inspection)
                        │
    UDIR CSV ──────────►│
                        │
                        ▼
                standardize_udir_format.py
                        │ (creates standard format)
                        │
                        ▼
                Standardized CSV
                        │
                        │
                        ▼
        geo.py ←── create_csv_with_coordinates.py
                        │ (adds lat/lng)
                        │
                        ▼
                CSV with Coordinates
                        │
                        │
                        ▼
                   create_map.py
                        │ (generates HTML)
                        │
                        ▼
                  Interactive Map HTML
```

---

## Time Estimates by School Count

```
Schools    Geocoding    Map Creation    Total Pipeline
───────────────────────────────────────────────────────
  10       ~1 min       <1 sec          ~1 min
  50       ~5 min       ~1 sec          ~5 min
  100      ~10 min      ~2 sec          ~10 min
  500      ~50 min      ~5 sec          ~50 min
  1,000    ~2 hours     ~10 sec         ~2 hours
  3,000    ~5 hours     ~20 sec         ~5 hours

Note: Geocoding is one-time; reuse coordinates for multiple maps
```

---

## Tips for Success

```
✅ ALWAYS DO:
   1. Run analyzer first
   2. Standardize format
   3. Test with small sample (10-20 schools)
   4. Keep backup of geocoded data
   5. Check for warnings/errors in output

❌ NEVER DO:
   1. Skip format analysis
   2. Re-geocode unnecessarily (reuse coordinates)
   3. Ignore "could not geocode" warnings
   4. Process full dataset without testing
   5. Delete intermediate CSV files
```

---

This workflow ensures reliable processing of UDIR data from download to visualization!

