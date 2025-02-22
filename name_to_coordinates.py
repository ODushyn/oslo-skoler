from geopy.geocoders import Nominatim
import time

def add_geo_locations(schools):
    geolocator = Nominatim(user_agent="map-app")

    for school in schools:

        location = geolocator.geocode(school['name'])

        if location:
            school['lat'] = location.latitude
            school['lng'] = location.longitude
        time.sleep(0.1)  # To avoid rate limits

#print(geo_locations)