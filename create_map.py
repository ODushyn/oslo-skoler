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
        // Exclude gray markers (no data) from calculations
        markers.forEach(function(marker) {
            if (marker.options && marker.options.fillColor) {
                var color = marker.options.fillColor;
                var avg = 0;
                
                // Reverse engineer average from color
                // Skip gray markers (#999999) - they have no data
                if (color === '#d73027') avg = 42;      // red: <45
                else if (color === '#fc8d59') avg = 47; // orange: 45-50
                else if (color === '#91cf60') avg = 52; // light green: 50-55
                else if (color === '#1a9850') avg = 57; // dark green: >55
                else if (color === '#999999') avg = -1; // gray: no data (skip)
                else avg = 50; // default
                
                // Only include markers with actual data (not gray)
                if (avg !== -1) {
                    sum += avg;
                    count++;
                }
            }
        });
        
        var average = count > 0 ? sum / count : 0;
        var color = '#999999'; // default gray
        
        // Color based on average (same logic as individual markers)
        // If no valid data markers, keep gray
        if (count > 0) {
            if (average < 45) {
                color = '#d73027'; // red
            } else if (average >= 45 && average < 50) {
                color = '#fc8d59'; // orange
            } else if (average >= 50 && average < 55) {
                color = '#91cf60'; // light green
            } else if (average >= 55) {
                color = '#1a9850'; // dark green
            }
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

        # Calculate average only from valid scores
        valid_scores = [score for score in [engelsk, lesing, regning] if score is not None]
        has_data = len(valid_scores) > 0
        average = sum(valid_scores) / len(valid_scores) if valid_scores else None

        # Determine marker color based on the average
        marker_color = determine_marker_color(engelsk, lesing, regning)

        # Map color names to hex codes for CircleMarker
        color_map = {
            'red': '#d73027',
            'orange': '#fc8d59',
            'lightgreen': '#91cf60',
            'darkgreen': '#1a9850',
            'gray': '#999999'  # For schools with no data
        }
        fill_color = color_map.get(marker_color, '#999999')

        # Format scores for display (show "*" for missing scores)
        def format_score(score):
            return "*" if score is None else str(score)

        # Build popup content based on whether school has data
        if has_data:
            popup_content = f"""
                <b>{loc['name']}</b><br>
                <b>Kommune:</b> {loc['kommune']}<br>
                <br>
                <b>Engelsk:</b> {format_score(engelsk)}<br>
                <b>Lesing:</b> {format_score(lesing)}<br>
                <b>Regning:</b> {format_score(regning)}<br>
                <b>Gjennomsnitt:</b> {average:.1f} (basert på {len(valid_scores)} fag)
                """
        else:
            popup_content = f"""
                <b>{loc['name']}</b><br>
                <b>Kommune:</b> {loc['kommune']}<br>
                <br>
                <b>Engelsk:</b> *<br>
                <b>Lesing:</b> *<br>
                <b>Regning:</b> *<br>
                <b>Status:</b> <i>Ingen data tilgjengelig</i>
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

    # Add an info button and modal
    info_button_modal_html = '''
    <style>
        .info-button {
            position: fixed;
            bottom: 50px;
            right: 310px;
            width: 40px;
            height: 40px;
            background-color: #4285f4;
            color: white;
            border: 2px solid #357ae8;
            border-radius: 50%;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        }
        .info-button:hover {
            background-color: #357ae8;
            transform: scale(1.1);
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 10000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        .modal-content {
            background-color: white;
            margin: 5% auto;
            padding: 30px;
            border: 1px solid #888;
            width: 80%;
            max-width: 700px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-height: 80vh;
            overflow-y: auto;
        }
        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            line-height: 20px;
        }
        .close:hover,
        .close:focus {
            color: #000;
        }
        .modal-content h2 {
            margin-top: 0;
            color: #333;
        }
        .modal-content h3 {
            color: #4285f4;
            margin-top: 20px;
        }
        .color-explanation {
            margin: 10px 0;
            padding: 10px;
            background-color: #f5f5f5;
            border-radius: 5px;
        }
        .color-row {
            display: flex;
            align-items: center;
            margin: 8px 0;
        }
        .color-dot {
            font-size: 20px;
            margin-right: 10px;
            width: 30px;
        }
        .stats-box {
            background-color: #e8f0fe;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .official-link {
            display: inline-block;
            margin-top: 15px;
            padding: 10px 20px;
            background-color: #4285f4;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: background-color 0.3s;
        }
        .official-link:hover {
            background-color: #357ae8;
        }
    </style>
    
    <button class="info-button" onclick="document.getElementById('infoModal').style.display='block'" title="Om fargefordelingen">i</button>

    <div id="infoModal" class="modal" onclick="if(event.target==this) this.style.display='none'">
        <div class="modal-content">
            <span class="close" onclick="document.getElementById('infoModal').style.display='none'">&times;</span>
            <h2>📊 Om Fargefordelingen</h2>
            
            <h3>Offisiell Skala</h3>
            <p>Til nasjonale prøver er det utviklet en egen skala (skalapoeng) hvor <strong>gjennomsnittet i 2022 ble satt til 50</strong> og <strong>standardavviket til 10</strong>. Alle prøveresultater blir omregnet til denne skalaen.</p>
            
            <div class="stats-box">
                <strong>Datagrunnlag (1 349 skoler):</strong><br>
                • Gjennomsnitt: 49,31 (nær landsgjennomsnitt ✓)<br>
                • Median: 49,33<br>
                • Standardavvik: 2,84<br>
                • Spredning: 39-59 poeng
            </div>
            
            <h3>Fargeforklaring</h3>
            <div class="color-explanation">
                <div class="color-row">
                    <span class="color-dot" style="color: #d73027;">⬤</span>
                    <div><strong>Rød (&lt; 45):</strong> Betydelig under landsgjennomsnitt (6,1% av skoler)</div>
                </div>
                <div class="color-row">
                    <span class="color-dot" style="color: #fc8d59;">⬤</span>
                    <div><strong>Oransje (45-49):</strong> Under landsgjennomsnitt (51,1% av skoler)</div>
                </div>
                <div class="color-row">
                    <span class="color-dot" style="color: #91cf60;">⬤</span>
                    <div><strong>Lysegrønn (50-54):</strong> Over landsgjennomsnitt (40,0% av skoler)</div>
                </div>
                <div class="color-row">
                    <span class="color-dot" style="color: #1a9850;">⬤</span>
                    <div><strong>Mørkegrønn (≥ 55):</strong> Betydelig over landsgjennomsnitt (2,7% av skoler)</div>
                </div>
                <div class="color-row">
                    <span class="color-dot" style="color: #999999;">⬤</span>
                    <div><strong>Grå:</strong> Ingen data tilgjengelig (alle fag mangler)</div>
                </div>
            </div>
            
            <h3>Begrunnelse</h3>
            <p>Fargefordelingen er basert på den offisielle nasjonale skalaen (50±10) for å gi en:</p>
            <ul>
                <li><strong>Symmetrisk fordeling</strong> rundt landsgjennomsnittet (50)</li>
                <li><strong>Rettferdig vurdering</strong> som gjenspeiler den statistiske virkeligheten</li>
                <li><strong>Meningsfull tolkning</strong> basert på standardavvik</li>
            </ul>
            
            <p>Dette sikrer at skoler som presterer over det nasjonale gjennomsnittet får anerkjennelse, mens skoler som trenger støtte blir identifisert.</p>
            
            <a href="https://statistikkportalen.udir.no/api/rapportering/rest/v1/Tekst/visTekst/19715?dataChanged=2026-02-19_074500#title5" 
               target="_blank" 
               class="official-link">
               📖 Les mer hos UDIR (offisiell forklaring)
            </a>
        </div>
    </div>
    '''
    m.get_root().html.add_child(folium.Element(info_button_modal_html))

    # Add a legend to the map
    legend_html = '''
    <div style="position: fixed; 
                bottom: 50px; right: 50px; width: 240px; height: 180px; 
                background-color: white; border:2px solid grey; z-index:9999; 
                font-size:14px; padding: 10px; border-radius: 5px;
                box-shadow: 0 0 15px rgba(0,0,0,0.2);">
        <p style="margin: 0 0 10px 0; font-weight: bold;">Skoleoversikt.no</p>
        <p style="margin: 0 0 5px 0; font-weight: bold; font-size: 12px;">Gjennomsnitt:</p>
        <p style="margin: 3px 0;"><span style="color: #1a9850;">⬤</span> ≥ 55 (Meget godt)</p>
        <p style="margin: 3px 0;"><span style="color: #91cf60;">⬤</span> 50-54 (Over landsgj.)</p>
        <p style="margin: 3px 0;"><span style="color: #fc8d59;">⬤</span> 45-49 (Under landsgj.)</p>
        <p style="margin: 3px 0;"><span style="color: #d73027;">⬤</span> &lt; 45 (Betydelig under)</p>
        <p style="margin: 3px 0;"><span style="color: #999999;">⬤</span> Ingen data</p>
    </div>
    '''
    m.get_root().html.add_child(folium.Element(legend_html))

    # Save the map
    m.save(output_file)
    print(f"Map saved to {output_file}")
    print(f"\nPerformance color coding (based on national scale 50±10):")
    print(f"  🔴 Red: Average < 45 (significantly below national mean)")
    print(f"  🟠 Orange: Average 45-49 (below national mean)")
    print(f"  🟢 Light Green: Average 50-54 (above national mean)")
    print(f"  🟢 Dark Green: Average ≥ 55 (significantly above national mean)")
    print(f"  ⚪ Gray: No data available (all subjects missing)")


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
