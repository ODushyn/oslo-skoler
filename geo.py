from geopy.geocoders import Nominatim
import csv
import os

# Load cache once at module level
_coordinates_cache = {}
_cache_loaded = False

def _load_cache():
    """Load the coordinates cache from CSV file into memory."""
    global _coordinates_cache, _cache_loaded

    if _cache_loaded:
        return

    cache_file = 'cached-data/skoler-geo-coordinates.csv'
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f, delimiter=';')
                for row in reader:
                    school_name = row['EnhetNavn'].strip()
                    lat = float(row['lat'])
                    lng = float(row['lng'])
                    # Only cache valid coordinates
                    if lat != 0 or lng != 0:
                        _coordinates_cache[school_name] = (lat, lng)
            print(f"Loaded {len(_coordinates_cache)} coordinates from cache")
        except Exception as e:
            print(f"Error loading cache file: {e}")

    _cache_loaded = True

class CachedLocation:
    """Mock location object for cached coordinates."""
    def __init__(self, latitude, longitude):
        self.latitude = latitude
        self.longitude = longitude

def get_geo_coordinates(address):
    """
    Get geographical coordinates for a given address.
    Checks cache first before calling geocoding service.

    Args:
        address: Full address string (e.g., "School name, Municipality, Norway")

    Returns:
        location object with latitude and longitude, or None if not found
    """
    # Load cache if not already loaded
    _load_cache()

    # Extract school name from address (first part before comma)
    school_name = address.split(',')[0].strip()

    # Check if coordinates are in cache
    if school_name in _coordinates_cache:
        lat, lng = _coordinates_cache[school_name]
        print(f"Found cached coordinates for {school_name}")
        return CachedLocation(lat, lng)

    # If not in cache, use geocoding service
    geolocator = Nominatim(user_agent="norway-schools-map")
    try:
        location = geolocator.geocode(address)
        return location
    except Exception as e:
        print(f"Error geocoding {address}: {e}")
        return None
