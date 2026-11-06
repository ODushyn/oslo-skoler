import json
import csv
from pathlib import Path

import elevundersokelsen
import photos
import school_locations
import site_pages
from nsr import NsrMatcher, load_cache
import gsi

# ─────────────────────────────────────────────────────────────────────────────
# UPDATE THIS SINGLE VALUE EACH YEAR when new data arrives.
# Format: 'YYYY-YY'  e.g. '2025-26', '2026-27'
# ─────────────────────────────────────────────────────────────────────────────
CURRENT_YEAR = '2025-26'


def parse_csv_to_objects(file_path, school_type=None):
    """Parse CSV file with school data and coordinates.

    Args:
        file_path: Path to CSV file
        school_type: Type of school ('barneskole' or 'ungdomsskole')
    """
    data = []

    with open(file_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile, delimiter=';')

        for row in reader:
            # Skip schools without valid coordinates
            if row['lat'] == '0' or row['lng'] == '0':
                continue

            # Handle missing test scores (marked as '*' or empty)
            # Return None for missing scores so we can differentiate from actual 0
            def parse_score(value):
                return None if value == '*' or value == '' else int(value)

            engelsk = parse_score(row['Engelsk'])
            lesing = parse_score(row['Lesing'])
            regning = parse_score(row['Regning'])

            # Include ALL schools (even with all scores missing)
            # They will be shown in gray on the map
            data.append({
                'name': row['EnhetNavn'],
                'kommune': row.get('Kommune', 'Oslo'),  # Default to Oslo for backward compatibility
                'engelsk': engelsk,
                'lesing': lesing,
                'regning': regning,
                'lat': float(row['lat']),
                'lng': float(row['lng']),
                'school_type': school_type,
            })

    return data


def determine_marker_color(engelsk, lesing, regning):
    """
    Determine marker color based on average test scores.
    Only calculates average from valid (non-None) scores.

    Based on the national scale where actual national mean=49.31:
    - Gray: All scores missing (no data available)
    - Red: < 45 (significantly below national mean)
    - Orange: 45-49.31 (below actual national mean)
    - Light Green: 49.31-55 (above actual national mean)
    - Dark Green: > 55 (significantly above national mean)
    """
    # Collect only valid scores (not None)
    valid_scores = [score for score in [engelsk, lesing, regning] if score is not None]

    # If no valid scores, return gray (no data)
    if not valid_scores:
        return "gray"

    average = sum(valid_scores) / len(valid_scores)

    if average < 45:
        return "red"
    elif 45 <= average < 49.31:
        return "orange"
    elif 49.31 <= average < 55:
        return "lightgreen"
    else:
        return "darkgreen"


def calculate_map_config(schools):
    """Calculate map configuration (center and zoom) based on all school coordinates."""
    if not schools:
        return {
            'center': [59.9139, 10.7522],  # Default to Oslo center
            'zoom': 10
        }

    avg_lat = sum(school['lat'] for school in schools) / len(schools)
    avg_lng = sum(school['lng'] for school in schools) / len(schools)

    # Calculate zoom level based on geographic spread
    if len(schools) <= 1:
        zoom = 10
    else:
        lats = [school['lat'] for school in schools]
        lngs = [school['lng'] for school in schools]

        lat_range = max(lats) - min(lats)
        lng_range = max(lngs) - min(lngs)

        # Rough heuristic for zoom level
        max_range = max(lat_range, lng_range)
        if max_range > 10:  # Nationwide
            zoom = 5
        elif max_range > 5:  # Regional
            zoom = 6
        elif max_range > 2:  # Multiple counties
            zoom = 7
        elif max_range > 1:  # Large county
            zoom = 8
        elif max_range > 0.5:  # County/large city
            zoom = 9
        else:  # City level
            zoom = 10

    return {
        'center': [avg_lat, avg_lng],
        'zoom': zoom
    }


def _gsi_national(cache):
    if not cache:
        return None
    density = cache['national'].get('laerertetthet', {})
    norsk = cache['national'].get('norsk', {})
    year = max(density) if density else None
    return {'year': year, 'laerertetthet': density.get(year), 'norsk': norsk.get(max(norsk)) if norsk else None}


def prepare_school_data_for_export(schools, history=None, nsr_matcher=None, trivsel_cache=None, photo_cache=None,
                                   mobbing_cache=None, gsi_cache=None):
    """Prepare school data with all necessary computed fields for JSON export."""
    prepared_data = []
    if history is None:
        history = {}

    for school in schools:
        engelsk = school['engelsk']
        lesing = school['lesing']
        regning = school['regning']

        # Calculate average only from valid scores
        valid_scores = [score for score in [engelsk, lesing, regning] if score is not None]
        has_data = len(valid_scores) > 0
        average = sum(valid_scores) / len(valid_scores) if valid_scores else None

        # Determine marker color
        marker_color = determine_marker_color(engelsk, lesing, regning)

        # Map color names to hex codes
        color_map = {
            'red': '#d73027',
            'orange': '#fc8d59',
            'lightgreen': '#91cf60',
            'darkgreen': '#1a9850',
            'gray': '#999999'
        }
        fill_color = color_map.get(marker_color, '#999999')

        # Look up historical data for this school
        school_type = school.get('school_type', 'unknown')
        key = (school['name'].lower(), school['kommune'].lower(), school_type)
        school_history = history.get(key, [])

        # Owner type and profile from Udir's school register (NSR)
        register = nsr_matcher.describe(school['name'], school['kommune'], school.get('orgnr')) if nsr_matcher else {}
        orgnr = register.get('orgnr')

        # Trivsel (Elevundersøkelsen) and an openly licensed photo, both looked up by orgnr
        trivsel = elevundersokelsen.trivsel_for(trivsel_cache, orgnr, school_type) if trivsel_cache else None
        mobbing = elevundersokelsen.mobbing_for(mobbing_cache, orgnr, school_type) if mobbing_cache else None
        # Lærertetthet, share with forsterket opplæring i norsk and pupil count (GSI, Udir)
        staff = gsi.latest_for(gsi_cache, orgnr, school_type) if gsi_cache and orgnr else None
        photo = dict(photo_cache[orgnr]) if photo_cache and orgnr in photo_cache else None
        if photo and photo.get('thumb'):
            photo['thumb'] = photo['thumb'].split('?', 1)[0]  # drop tracking parameters

        prepared_data.append({
            'name': school['name'],
            'kommune': school['kommune'],
            'engelsk': engelsk,
            'lesing': lesing,
            'regning': regning,
            'lat': school['lat'],
            'lng': school['lng'],
            'average': average,
            'hasData': has_data,
            'color': fill_color,
            'validScoresCount': len(valid_scores),
            'schoolType': school.get('school_type', 'unknown'),
            'history': school_history,
            'orgnr': school.get('orgnr') or register.get('orgnr'),
            'locationSource': school.get('location_source'),
            'eierform': register.get('eierform'),
            'profil': register.get('profil'),
            'trivsel': trivsel,
            'mobbing': mobbing,
            'gsi': staff,
            'photo': photo,
        })

    return prepared_data


def load_historical_data(processed_dir='processed-data', current_year_prefix=None):
    """
    Load score history from all processed files that are NOT the current year.
    Returns a dict: (name_lower, kommune_lower, school_type) -> list of
        {'year': '2024-25', 'engelsk': int|None, 'lesing': int|None, 'regning': int|None}
    sorted oldest-first.
    """
    if current_year_prefix is None:
        current_year_prefix = CURRENT_YEAR
    history = {}  # key -> list of year dicts

    processed_path = Path(processed_dir)
    csv_files = sorted(processed_path.glob('*.csv'))

    for csv_file in csv_files:
        fname = csv_file.name
        if fname.startswith(current_year_prefix):
            continue

        # Extract year prefix e.g. "2024-25"
        year = fname[:7]

        if '5._trinn' in fname or '5._Trinn' in fname.lower():
            school_type = 'barneskole'
        elif 'ungdomstrinn' in fname.lower():
            school_type = 'ungdomsskole'
        else:
            school_type = 'unknown'

        with open(csv_file, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                name = row.get('EnhetNavn', '').strip()
                kommune = row.get('Kommune', '').strip()
                if not name:
                    continue

                def parse_score(v):
                    v = v.strip() if v else ''
                    return None if v in ('*', '', '0') else int(v)

                entry = {
                    'year': year,
                    'engelsk': parse_score(row.get('Engelsk', '')),
                    'lesing': parse_score(row.get('Lesing', '')),
                    'regning': parse_score(row.get('Regning', '')),
                }

                key = (name.lower(), kommune.lower(), school_type)
                history.setdefault(key, []).append(entry)

    # Sort each list by year ascending
    for key in history:
        history[key].sort(key=lambda e: e['year'])

    return history


def find_current_year_files(processed_dir='processed-data', current_year=None):
    """Auto-detect the two CSV files for the current year (5._trinn + ungdomstrinn)."""
    if current_year is None:
        current_year = CURRENT_YEAR
    processed_path = Path(processed_dir)
    barnetrinn = sorted(processed_path.glob(f'{current_year}_*_Nasjonale_proever_5._trinn.csv'))
    ungdom = sorted(processed_path.glob(f'{current_year}_*_Nasjonale_proever_ungdomstrinn.csv'))

    files = []
    if barnetrinn:
        files.append(str(barnetrinn[-1]))
    if ungdom:
        files.append(str(ungdom[-1]))

    if not files:
        raise FileNotFoundError(
            f"No processed-data files found for year '{current_year}'. "
            f"Expected files matching '{current_year}_*_Nasjonale_proever_5._trinn.csv' "
            f"and '{current_year}_*_Nasjonale_proever_ungdomstrinn.csv' in '{processed_dir}'."
        )
    return files


def create_norway_schools_map(input_files=None,
                               output_data_file='static/js/school-data.json',
                               map_title=None):
    """
    Create school data JSON file for the interactive map.

    Args:
        input_files: List of paths to CSV files with school data and coordinates.
                    If None, auto-detects the files for CURRENT_YEAR.
        output_data_file: Path to output JSON data file
        map_title: Title for the map (for logging purposes)
    """
    if input_files is None:
        input_files = find_current_year_files()
        print(f"Auto-detected input files for '{CURRENT_YEAR}':")
        for f in input_files:
            print(f"  {f}")

    if map_title is None:
        map_title = f'Norwegian Schools Performance {CURRENT_YEAR}'

    # Parse all input files and merge the data
    schools = []
    schools_dict = {}  # Use dict to handle potential duplicates

    for input_file in input_files:
        print(f"Reading {input_file}...")

        # Determine school type from filename
        if '5._trinn' in input_file:
            school_type = 'barneskole'
        elif 'ungdomstrinn' in input_file:
            school_type = 'ungdomsskole'
        else:
            school_type = 'unknown'

        file_schools = parse_csv_to_objects(input_file, school_type=school_type)

        # Use (name, kommune, school_type) as key. A school with both levels
        # (e.g. 1-10 skole) appears in both files and keeps one entry per level,
        # so its 5th-grade results are not lost.
        for school in file_schools:
            key = (school['name'], school['kommune'], school['school_type'])
            if key not in schools_dict:
                schools_dict[key] = school

        print(f"  - Found {len(file_schools)} schools with valid coordinates ({school_type})")

    schools = list(schools_dict.values())
    print(f"\nTotal school entries (one per school and level): {len(schools)}")

    # Exact organisation number from the raw Udir files, and positions from open,
    # official sources only (Geonorge/Udir, NSR, Kartverket, OpenStreetMap).
    # The coordinates in the processed CSVs are not used: part of the old cache
    # was filled with Google geocoding, which is not open data.
    source_orgnr = school_locations.schools_in_source(f'source-data/{CURRENT_YEAR}_*.csv')
    locations = school_locations.load_cache()
    placed, dropped = [], []
    for school in schools:
        orgnr = source_orgnr.get((school['name'], school['kommune'], school['school_type']))
        position = locations.get(orgnr) if orgnr else None
        if not position:
            dropped.append(f"{school['name']} ({school['kommune']})")
            continue
        school['orgnr'] = orgnr
        school['lat'], school['lng'] = position['lat'], position['lng']
        school['location_source'] = position['source']
        placed.append(school)
    schools = placed
    print(f"  - Open position for {len(schools)} entries; left out {len(dropped)} without one: {', '.join(dropped[:8])}")

    if not schools:
        print("ERROR: No schools with valid coordinates found!")
        return

    print(f"Processing {len(schools)} schools for {map_title}...")

    # Calculate map configuration
    map_config = calculate_map_config(schools)

    # Load historical data from previous years
    print("\nLoading historical data from previous years...")
    history = load_historical_data()
    print(f"  - Loaded history for {len(history)} school/type entries")

    # Prepare school data with computed fields
    # Owner type (offentlig/privat) and profile from the NSR register cache
    print("\nMatching schools to Udir's school register (NSR)...")
    nsr_matcher = NsrMatcher(load_cache())
    trivsel_cache = elevundersokelsen.load_cache()
    mobbing_cache = elevundersokelsen.load_mobbing()
    photo_cache = photos.load_cache()
    gsi_cache = gsi.load_cache()

    prepared_schools = prepare_school_data_for_export(schools, history=history, nsr_matcher=nsr_matcher,
                                                      trivsel_cache=trivsel_cache, photo_cache=photo_cache,
                                                      mobbing_cache=mobbing_cache, gsi_cache=gsi_cache)
    matched = sum(1 for s in prepared_schools if s['eierform'])
    print(f"  - Owner type found for {matched} of {len(prepared_schools)} entries")
    print(f"  - Trivsel for {sum(1 for s in prepared_schools if s['trivsel'])} entries, "
          f"mobbing for {sum(1 for s in prepared_schools if s['mobbing'])} entries, "
          f"photo for {sum(1 for s in prepared_schools if s['photo'])} entries")

    # Each school's page for search engines (skoler/<kommune>/<skole>, built by site_pages.py)
    site_pages.assign_pages(prepared_schools)

    # Create output data structure
    output_data = {
        'mapConfig': map_config,
        'schools': prepared_schools,
        'metadata': {
            'totalSchools': len(schools),
            'title': map_title,
            'currentYear': CURRENT_YEAR,
            # National share bullied, for the Mobbing tooltip on the map page (year and 7./10. trinn)
            'mobbing': {'year': mobbing_cache['year'], 'national': mobbing_cache['national']} if mobbing_cache else None,
            # National lærertetthet and share with forsterket norsk, newest year, for the cards and filters
            'gsi': _gsi_national(gsi_cache),
        }
    }

    # Ensure output directory exists
    output_path = Path(output_data_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write JSON data
    with open(output_data_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"[SUCCESS] School data saved to {output_data_file}")
    print(f"  - Total schools: {len(schools)}")
    print(f"  - Map center: {map_config['center']}")
    print(f"  - Zoom level: {map_config['zoom']}")
    print(f"\nColor distribution (based on Oslo mean 49.31):")

    # Calculate color distribution
    color_counts = {}
    for school in prepared_schools:
        color = school['color']
        color_counts[color] = color_counts.get(color, 0) + 1

    color_names = {
        '#d73027': 'Red (<45)',
        '#fc8d59': 'Orange (45-49.31)',
        '#91cf60': 'Light Green (49.31-55)',
        '#1a9850': 'Dark Green (>=55)',
        '#999999': 'Gray (No data)'
    }

    for color, count in sorted(color_counts.items()):
        percentage = (count / len(schools)) * 100
        print(f"  {color_names.get(color, color)}: {count} ({percentage:.1f}%)")


if __name__ == "__main__":
    # Auto-detects the two files for CURRENT_YEAR from processed-data/.
    # Update CURRENT_YEAR at the top of this file each year before running.
    create_norway_schools_map(
        output_data_file='static/js/school-data.json',
    )

    # National averages per year, shown next to each school's result on the school page
    import national_averages
    national_averages.main()

    print("\n[SUCCESS] Map data generation complete!")
    print("  Open index.html in a browser to view the map.")

