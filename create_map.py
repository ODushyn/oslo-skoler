import json
import csv
from pathlib import Path


def parse_csv_to_objects(file_path):
    """Parse CSV file with school data and coordinates."""
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
            })

    return data


def determine_marker_color(engelsk, lesing, regning):
    """
    Determine marker color based on average test scores.
    Only calculates average from valid (non-None) scores.

    Based on the national scale where mean=50 and SD=10:
    - Gray: All scores missing (no data available)
    - Red: < 45 (significantly below national mean)
    - Orange: 45-50 (below national mean)
    - Light Green: 50-55 (above national mean)
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
    elif 45 <= average < 50:
        return "orange"
    elif 50 <= average < 55:
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


def prepare_school_data_for_export(schools):
    """Prepare school data with all necessary computed fields for JSON export."""
    prepared_data = []

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
            'validScoresCount': len(valid_scores)
        })

    return prepared_data


def create_norway_schools_map(input_file='processed-data/20260218-1045_Nasjonale_proever_5._trinn.csv',
                               output_data_file='static/js/school-data.json',
                               map_title='Norwegian Schools Performance Map'):
    """
    Create school data JSON file for the interactive map.

    Args:
        input_file: Path to CSV file with school data and coordinates
        output_data_file: Path to output JSON data file
        map_title: Title for the map (for logging purposes)
    """
    schools = parse_csv_to_objects(input_file)

    if not schools:
        print("ERROR: No schools with valid coordinates found!")
        return

    print(f"Processing {len(schools)} schools for {map_title}...")

    # Calculate map configuration
    map_config = calculate_map_config(schools)

    # Prepare school data with computed fields
    prepared_schools = prepare_school_data_for_export(schools)

    # Create output data structure
    output_data = {
        'mapConfig': map_config,
        'schools': prepared_schools,
        'metadata': {
            'totalSchools': len(schools),
            'title': map_title,
            'generated': '2026-02-20'
        }
    }

    # Ensure output directory exists
    output_path = Path(output_data_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write JSON data
    with open(output_data_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"✓ School data saved to {output_data_file}")
    print(f"  - Total schools: {len(schools)}")
    print(f"  - Map center: {map_config['center']}")
    print(f"  - Zoom level: {map_config['zoom']}")
    print(f"\nColor distribution (based on national scale 50±10):")

    # Calculate color distribution
    color_counts = {}
    for school in prepared_schools:
        color = school['color']
        color_counts[color] = color_counts.get(color, 0) + 1

    color_names = {
        '#d73027': '🔴 Red (<45)',
        '#fc8d59': '🟠 Orange (45-49)',
        '#91cf60': '🟢 Light Green (50-54)',
        '#1a9850': '🟢 Dark Green (≥55)',
        '#999999': '⚪ Gray (No data)'
    }

    for color, count in sorted(color_counts.items()):
        percentage = (count / len(schools)) * 100
        print(f"  {color_names.get(color, color)}: {count} ({percentage:.1f}%)")


if __name__ == "__main__":
    # Generate JSON data file for the map
    create_norway_schools_map(
        input_file='processed-data/20260218-1045_Nasjonale_proever_5._trinn.csv',
        output_data_file='static/js/school-data.json',
        map_title='Norwegian Schools Performance 2024-2025'
    )

    print("\n✓ Map data generation complete!")
    print("  Open index.html in a browser to view the map.")

