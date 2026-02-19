# Skoleoversikt.no - Norwegian Schools Performance Map

Interactive visualization of Norwegian school performance based on national standardized tests (Nasjonale Prøver).

**Domain:** skoleoversikt.no

## Overview

This project creates an interactive map showing Norwegian schools color-coded by their academic performance in:
- **Engelsk** (English)
- **Lesing** (Reading)
- **Regning** (Mathematics)

Originally built for Oslo schools, now supports **all Norwegian schools** using data from UDIR (Utdanningsdirektoratet).

## Features

- 🗺️ Interactive map with color-coded performance indicators
- 📍 Automatic geocoding of school addresses
- 🎨 Color-coded markers:
  - 🔴 **Red**: Average < 50 (needs improvement)
  - 🟠 **Orange**: Average 50-52 (below average)
  - 🟢 **Light Green**: Average 52-54 (above average)
  - 🟢 **Dark Green**: Average > 54 (excellent)
- 📊 Popup details for each school showing all test scores
- 🌍 Automatic map centering and zoom based on data extent

## Data Source: UDIR.no

### Getting Data from UDIR

1. Visit [UDIR Skoleporten](https://skoleporten.udir.no/)
2. Navigate to "Nasjonale prøver" section
3. Export data for desired year (e.g., 2024-2025)
4. Download as CSV format
5. Save the file in this project directory

### Expected UDIR CSV Format

The UDIR CSV typically includes these columns:
- `Skolenavn` or `Skole` - School name
- `Kommune` - Municipality name
- `Fylke` - County name (optional)
- `Engelsk` - English test score
- `Lesing` or `Norsk lesing` - Reading test score
- `Regning` or `Matematikk` - Math test score

**Note**: The exact column names may vary. The script will display available columns and needs adjustment if column names differ.

## Installation

### Prerequisites
- Python 3.7+
- pip

### Setup

```bash
# Clone or download this repository
cd oslo-skoler

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Step 1: Prepare Your Data

Place your UDIR CSV file in the project directory. For example:
- `udir_nasjonale_prover_2024-2025.csv`

### Step 2: Geocode Schools

Edit `create_csv_with_coordinates.py` to use your input file:

```python
# Update these lines at the bottom of the file:
input_file = 'udir_nasjonale_prover_2024-2025.csv'
output_file = 'norge_skoler_coordinates.csv'
```

Then run:

```bash
python create_csv_with_coordinates.py
```

**Note**: This process can take time for nationwide data (several minutes to hours depending on number of schools). The script includes rate limiting to respect the Nominatim API.

### Step 3: Create the Map

Edit `create_map.py` to use your geocoded file:

```python
# Update these lines at the bottom:
create_norway_schools_map(
    input_file='norge_skoler_coordinates.csv',
    output_file='norge_skoler_kart.html',
    map_title='Norwegian Schools Performance 2024-2025'
)
```

Then run:

```bash
python create_map.py
```

### Step 4: View the Map

Open the generated HTML file in your web browser:
- Windows: Double-click `norge_skoler_kart.html`
- Or open directly in browser

## Helper Scripts

### Find School Coordinates

The `helpers/find_school_coordinates.py` script allows you to quickly find coordinates for a specific address.

#### Usage as a Command-Line Tool

```bash
# Basic usage
python3 -m helpers.find_school_coordinates "Elvebakken skole, Oslo, Norway"

# With full address including street
python3 -m helpers.find_school_coordinates "Grooseveien 36, 4876 Grimstad, Norway"

# Another example with school name and municipality
python3 -m helpers.find_school_coordinates "Majorstuen skole, Oslo, Norway"
```

**Output:**
```
Address: Grooseveien 36, 4876 Grimstad, Norway
Coordinates: 58.3396542;8.5934425
```

If geocoding fails, you'll see a warning:
```
WARNING: Could not geocode [address]
Could not find coordinates for [address]
```

**Note:** Use `python3 -m` to run the script as a module. This ensures proper import paths.

#### Usage as a Python Module

You can also import and use the function in your own scripts:

```python
from helpers.find_school_coordinates import find_school_coordinates

# Get coordinates
lat, lng = find_school_coordinates("Elvebakken skole, Oslo, Norway")

if lat and lng:
    print(f"Latitude: {lat}, Longitude: {lng}")
else:
    print("Geocoding failed")
```

#### Tips

- Include as much detail as possible in the address (school name, municipality, country)
- The script uses the same geocoding service as the main application
- Results are returned from OpenStreetMap's Nominatim service
- Be mindful of rate limits when making multiple requests

## Project Structure

```
oslo-skoler/
│
├── geo.py                              # Geocoding utilities
├── create_csv_with_coordinates.py      # Script to add coordinates to school data
├── create_map.py                       # Script to generate interactive map
├── requirements.txt                    # Python dependencies
│
├── helpers/                            # Helper scripts
│   ├── __init__.py                     # Makes helpers a Python package
│   └── find_school_coordinates.py      # CLI tool to find coordinates by address
│
├── skoler_2024-2025.csv               # Original Oslo data (example)
├── skoler_2024-2025_coordinates.csv   # Oslo data with coordinates
├── index.html                         # Generated map for Oslo
│
└── README.md                          # This file
```

## Adjusting for Different UDIR Formats

If your UDIR CSV has different column names, modify `create_csv_with_coordinates.py`:

```python
# Find these lines and adjust column names:
school_name = row.get('Skole') or row.get('Skolenavn')  # Adjust as needed
municipality = row.get('Kommune', 'Oslo')
engelsk = row.get('Engelsk', 0)
lesing = row.get('Lesing', 0)
regning = row.get('Regning', 0)
```

The script will print available column names when you run it, helping you identify the correct names.

## Tips for Large Datasets

For nationwide Norwegian data (thousands of schools):

1. **Geocoding**: 
   - Can take 2-5 hours for all schools
   - Consider running overnight
   - Failed geocoding attempts are logged
   - You can resume by filtering already processed schools

2. **Map Performance**:
   - Maps with 1000+ markers may load slowly
   - Consider filtering by county/region for better performance
   - Add clustering for large datasets (see Folium documentation)

3. **API Rate Limits**:
   - Current delay: 0.1s per school (respects Nominatim terms)
   - For commercial use, consider paid geocoding services

## Migration from Oslo to Norway-wide

The scripts maintain backward compatibility. Existing Oslo data will continue to work:
- Oslo data doesn't require `Kommune` column
- Scripts default to Oslo if municipality is missing

## Future Enhancements

- [ ] Add marker clustering for better performance with large datasets
- [ ] Filter controls (by county, municipality, performance level)
- [ ] Export performance statistics
- [ ] Comparison views (year-over-year)
- [ ] Integration with additional UDIR metrics

## Dependencies

- `folium` - Interactive map generation
- `geopy` - Geocoding service
- Python standard library: `csv`, `time`

See `requirements.txt` for full dependency list.

## License

This is a personal project for visualizing public educational data.
Data source: UDIR (Utdanningsdirektoratet) - Norway's Directorate for Education and Training

## Troubleshooting

### "Could not geocode" warnings
- Some school names may not geocode correctly
- Try manually adding coordinates for failed schools
- Check if school name includes special characters or abbreviations

### Column not found errors
- Check actual UDIR CSV column names
- Update column names in `create_csv_with_coordinates.py`
- The script prints available columns to help debug

### Map doesn't center correctly
- Ensure you have valid coordinates for multiple schools
- Check that lat/lng are not 0 values
- Script automatically calculates center from valid schools

## Contact

For questions or issues, please create an issue in the repository.

