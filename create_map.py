import folium
from folium.plugins import MarkerCluster
import csv


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
            def parse_score(value):
                return 0 if value == '*' or value == '' else int(value)

            data.append({
                'name': row['EnhetNavn'],
                'kommune': row.get('Kommune', 'Oslo'),  # Default to Oslo for backward compatibility
                'engelsk': parse_score(row['Engelsk']),
                'lesing': parse_score(row['Lesing']),
                'regning': parse_score(row['Regning']),
                'lat': float(row['lat']),
                'lng': float(row['lng']),
            })

    return data


def determine_marker_color(engelsk, lesing, regning):
    """Determine marker color based on average test scores."""
    average = (engelsk + lesing + regning) / 3
    if average < 50:
        return "red"
    elif 50 <= average <= 52:
        return "orange"
    elif 52 < average <= 54:
        return "lightgreen"
    else:
        return "darkgreen"


def calculate_map_center(schools):
    """Calculate center point based on all school coordinates."""
    if not schools:
        return [59.9139, 10.7522]  # Default to Oslo center

    avg_lat = sum(school['lat'] for school in schools) / len(schools)
    avg_lng = sum(school['lng'] for school in schools) / len(schools)
    return [avg_lat, avg_lng]


def determine_zoom_level(schools):
    """Determine appropriate zoom level based on geographic spread."""
    if len(schools) <= 1:
        return 10

    lats = [school['lat'] for school in schools]
    lngs = [school['lng'] for school in schools]

    lat_range = max(lats) - min(lats)
    lng_range = max(lngs) - min(lngs)

    # Rough heuristic for zoom level
    max_range = max(lat_range, lng_range)
    if max_range > 10:  # Nationwide
        return 5
    elif max_range > 5:  # Regional
        return 6
    elif max_range > 2:  # Multiple counties
        return 7
    elif max_range > 1:  # Large county
        return 8
    elif max_range > 0.5:  # County/large city
        return 9
    else:  # City level
        return 10


def create_norway_schools_map(input_file='processed-data/20260218-1045_Nasjonale_proever_5._trinn.csv',
                               output_file='index.html',
                               map_title='Norwegian Schools Performance Map'):
    """
    Create an interactive map of Norwegian schools with performance indicators.

    Args:
        input_file: Path to CSV file with school data and coordinates
        output_file: Path to output HTML file
        map_title: Title for the map (added as comment in HTML)
    """
    schools = parse_csv_to_objects(input_file)

    if not schools:
        print("ERROR: No schools with valid coordinates found!")
        return

    print(f"Creating map with {len(schools)} schools...")

    # Calculate optimal map center and zoom
    map_center = calculate_map_center(schools)
    zoom_level = determine_zoom_level(schools)

    # Create the map with better tile options for performance
    m = folium.Map(
        location=map_center,
        zoom_start=zoom_level,
        prefer_canvas=True  # Better performance for many markers
    )

    # Custom icon creation function for clusters based on average performance
    # This JavaScript function will run in the browser and color clusters appropriately
    icon_create_function = """
    function(cluster) {
        var markers = cluster.getAllChildMarkers();
        var sum = 0;
        var count = 0;
        
        // Calculate average from all markers in cluster by reading their color
        markers.forEach(function(marker) {
            if (marker.options && marker.options.fillColor) {
                var color = marker.options.fillColor;
                var avg = 0;
                
                // Reverse engineer average from color
                if (color === '#d73027') avg = 45;      // red: <50
                else if (color === '#fc8d59') avg = 51; // orange: 50-52
                else if (color === '#91cf60') avg = 53; // light green: 52-54
                else if (color === '#1a9850') avg = 56; // dark green: >54
                else avg = 50; // default
                
                sum += avg;
                count++;
            }
        });
        
        var average = count > 0 ? sum / count : 0;
        var color = '#999999'; // default gray
        
        // Color based on average (same logic as individual markers)
        if (average < 50) {
            color = '#d73027'; // red
        } else if (average >= 50 && average <= 52) {
            color = '#fc8d59'; // orange
        } else if (average > 52 && average <= 54) {
            color = '#91cf60'; // light green
        } else if (average > 54) {
            color = '#1a9850'; // dark green
        }
        
        var childCount = markers.length;
        var size = childCount < 10 ? 'small' : (childCount < 100 ? 'medium' : 'large');
        
        return L.divIcon({
            html: '<div style="background-color: ' + color + '; width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold;">' + childCount + '</span></div>',
            className: 'marker-cluster marker-cluster-' + size,
            iconSize: new L.Point(40, 40)
        });
    }
    """

    # Create marker cluster with custom icon function
    marker_cluster = MarkerCluster(
        name='Schools',
        overlay=True,
        control=False,
        icon_create_function=icon_create_function,
        options={
            'disableClusteringAtZoom': 13,  # Show individual markers when zoomed in
            'maxClusterRadius': 50,
            'spiderfyOnMaxZoom': True,
            'showCoverageOnHover': False,
            'zoomToBoundsOnClick': True
        }
    ).add_to(m)

    # Add markers for each school using CircleMarkers (much lighter than Icon markers)
    for loc in schools:
        engelsk = loc['engelsk']
        lesing = loc['lesing']
        regning = loc['regning']
        average = (engelsk + lesing + regning) / 3

        # Determine marker color based on the average
        marker_color = determine_marker_color(engelsk, lesing, regning)

        # Map color names to hex codes for CircleMarker
        color_map = {
            'red': '#d73027',
            'orange': '#fc8d59',
            'lightgreen': '#91cf60',
            'darkgreen': '#1a9850'
        }
        fill_color = color_map.get(marker_color, '#999999')

        popup_content = f"""
            <b>{loc['name']}</b><br>
            <b>Kommune:</b> {loc['kommune']}<br>
            <br>
            <b>Engelsk:</b> {engelsk}<br>
            <b>Lesing:</b> {lesing}<br>
            <b>Regning:</b> {regning}<br>
            <b>Gjennomsnitt:</b> {average:.1f}
            """

        # Use CircleMarker instead of Marker for better performance
        # Color is used by cluster function to determine aggregate cluster color
        folium.CircleMarker(
            location=[loc['lat'], loc['lng']],
            radius=8,
            popup=folium.Popup(popup_content, max_width=250, lazy=True),
            color=fill_color,
            fill=True,
            fillColor=fill_color,
            fillOpacity=0.7,
            weight=2
        ).add_to(marker_cluster)

    # Add a legend to the map
    legend_html = '''
    <div style="position: fixed; 
                bottom: 50px; right: 50px; width: 220px; height: 160px; 
                background-color: white; border:2px solid grey; z-index:9999; 
                font-size:14px; padding: 10px; border-radius: 5px;
                box-shadow: 0 0 15px rgba(0,0,0,0.2);">
        <p style="margin: 0 0 10px 0; font-weight: bold;">Skoleoversikt.no</p>
        <p style="margin: 0 0 5px 0; font-weight: bold; font-size: 12px;">Gjennomsnitt:</p>
        <p style="margin: 3px 0;"><span style="color: #1a9850;">⬤</span> > 54 (Utmerket)</p>
        <p style="margin: 3px 0;"><span style="color: #91cf60;">⬤</span> 52-54 (Over snitt)</p>
        <p style="margin: 3px 0;"><span style="color: #fc8d59;">⬤</span> 50-52 (Under snitt)</p>
        <p style="margin: 3px 0;"><span style="color: #d73027;">⬤</span> < 50 (Trenger forbedring)</p>
    </div>
    '''
    m.get_root().html.add_child(folium.Element(legend_html))

    # Save the map
    m.save(output_file)
    print(f"Map saved to {output_file}")
    print(f"\nPerformance color coding:")
    print(f"  🔴 Red: Average < 50")
    print(f"  🟠 Orange: Average 50-52")
    print(f"  🟢 Light Green: Average 52-54")
    print(f"  🟢 Dark Green: Average > 54")


if __name__ == "__main__":
    # For Oslo data (backward compatibility):
    create_norway_schools_map(
        input_file='processed-data/20260218-1045_Nasjonale_proever_5._trinn.csv',
        output_file='index.html',
        map_title='Oslo Schools Performance 2024-2025'
    )

    # For nationwide data:
    # create_norway_schools_map(
    #     input_file='norge_skoler_coordinates.csv',
    #     output_file='norge_skoler_kart.html',
    #     map_title='Norwegian Schools Performance 2024-2025'
    # )
