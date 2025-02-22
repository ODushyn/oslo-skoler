import folium

from csv_parser import parse_csv_to_objects
from name_to_coordinates import add_geo_locations

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

schools = parse_csv_to_objects('skoler_2024-2025.csv')

add_geo_locations(schools)

map_center = [schools[0]['lat'], schools[0]['lng']]
m = folium.Map(location=map_center, zoom_start=10)

# Add url to a school website <a href="{loc['url']}" target="_blank">More Info</a>
for loc in schools:
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

m.save("map.html")