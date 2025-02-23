import folium
import csv


def parse_csv_to_objects(file_path):
    # Initialize an empty list to hold the objects
    data = []

    # Open the CSV file
    with open(file_path, newline='', encoding='utf-8') as csvfile:
        # Create a CSV reader object
        reader = csv.DictReader(csvfile, delimiter=';')

        # Iterate over the rows in the CSV
        for row in reader:
            # Append each row as a dictionary to the data list
            data.append({
                'name': row['Skole'],
                'engelsk': int(row['Engelsk']),
                'lesing': int(row['Lesing']),
                'regning': int(row['Regning']),
                'lat': row['lat'],
                'lng': row['lng'],
            })

    return data


def determine_marker_color(engelsk, lesing, regning):
    average = (engelsk + lesing + regning) / 3
    if average < 50:
        return "red"
    elif 50 <= average <= 52:
        return "orange"
    elif 52 < average <= 54:
        return "lightgreen"
    else:
        return "darkgreen"


schools = parse_csv_to_objects('skoler_2024-2025_coordinates.csv')

map_center = [schools[0]['lat'], schools[0]['lng']]
m = folium.Map(location=map_center, zoom_start=10)

# Add url to a school website <a href="{loc['url']}" target="_blank">More Info</a>
for loc in schools:
    if loc['lng'] == '0' or loc['lat'] == '0':
        continue

    engelsk = int(loc['engelsk'])
    lesing = int(loc['lesing'])
    regning = int(loc['regning'])

    # Determine marker color based on the average
    marker_color = determine_marker_color(engelsk, lesing, regning)

    popup_content = f"""
        <b>{loc['name']}</b><br>
        <b>Engelsk:</b> {loc['engelsk']}<br>
        <b>Lesing:</b> {loc['lesing']}<br>
        <b>Regning:</b> {loc['regning']}<br>
        """

    folium.Marker(
        [loc['lat'], loc['lng']],
        popup=folium.Popup(popup_content, max_width=300),
        icon=folium.Icon(color=marker_color)
    ).add_to(m)

m.save("index.html")
