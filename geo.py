from geopy.geocoders import Nominatim

def get_geo_coordinates(school_name):
    geolocator = Nominatim(user_agent="map-app")
    location = geolocator.geocode(school_name)
    return location

#get_geo_coordinates('Hasle skole, Oslo, Norway')