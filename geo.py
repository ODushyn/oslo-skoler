from geopy.geocoders import Nominatim
import csv
import os

# Load cache once at module level
_coordinates_cache = {}  # Main cache: "SchoolName|Kommune" -> (lat, lng, kommune)
_name_only_cache = {}    # Fallback cache: "SchoolName" -> [(lat, lng, kommune), ...]
_cache_loaded = False
_cache_stats = {'hits': 0, 'misses': 0, 'api_calls': 0}

def _load_cache():
    """
    Load the coordinates cache from CSV file into memory.
    Creates two indices:
    1. Primary: "SchoolName|Kommune" for exact matches
    2. Secondary: "SchoolName" for fallback when Kommune is unknown
    """
    global _coordinates_cache, _name_only_cache, _cache_loaded

    if _cache_loaded:
        return

    cache_file = 'cached-data/skoler-geo-coordinates.csv'
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f, delimiter=';')
                valid_count = 0
                invalid_count = 0

                for row in reader:
                    school_name = row['EnhetNavn'].strip()
                    kommune = row.get('Kommune', '').strip()

                    try:
                        lat = float(row['lat'])
                        lng = float(row['lng'])
                    except (ValueError, KeyError):
                        invalid_count += 1
                        continue

                    # Only cache valid coordinates (not 0,0)
                    if lat != 0 or lng != 0:
                        valid_count += 1

                        # Primary index: SchoolName|Kommune
                        if kommune:
                            cache_key = f"{school_name}|{kommune}"
                            _coordinates_cache[cache_key] = (lat, lng, kommune)

                            # Secondary index: SchoolName only (for fallback lookups)
                            if school_name not in _name_only_cache:
                                _name_only_cache[school_name] = []
                            _name_only_cache[school_name].append((lat, lng, kommune))
                        else:
                            # No kommune - store with name only
                            cache_key = school_name
                            _coordinates_cache[cache_key] = (lat, lng, '')
                            if school_name not in _name_only_cache:
                                _name_only_cache[school_name] = []
                            _name_only_cache[school_name].append((lat, lng, ''))
                    else:
                        invalid_count += 1

            print(f"Loaded {valid_count} valid coordinates from cache")
            if invalid_count > 0:
                print(f"  Skipped {invalid_count} entries with invalid coordinates")
            print(f"  Primary index: {len(_coordinates_cache)} entries")
            print(f"  Name-only index: {len(_name_only_cache)} unique school names")
        except Exception as e:
            print(f"Error loading cache file: {e}")

    _cache_loaded = True

class CachedLocation:
    """Mock location object for cached coordinates with Kommune information."""
    def __init__(self, latitude, longitude, kommune=''):
        self.latitude = latitude
        self.longitude = longitude
        self.kommune = kommune
        self.address = f"{kommune}, Norway" if kommune else "Norway"

def get_geo_coordinates(address):
    """
    Get geographical coordinates for a given address.
    Checks cache first (with Kommune for precision) before calling geocoding service.

    Args:
        address: Full address string (e.g., "School name, Municipality, Norway")

    Returns:
        CachedLocation object with latitude, longitude, and kommune, or None if not found
    """
    global _cache_stats

    # Load cache if not already loaded
    _load_cache()

    # Extract school name and kommune from address (format: "School, Kommune, Norway")
    address_parts = [part.strip() for part in address.split(',')]
    school_name = address_parts[0] if len(address_parts) > 0 else ""
    kommune = address_parts[1] if len(address_parts) > 1 else ""

    # Strategy 1: Try exact match with Kommune (most accurate)
    if kommune and school_name:
        cache_key = f"{school_name}|{kommune}"
        if cache_key in _coordinates_cache:
            lat, lng, cached_kommune = _coordinates_cache[cache_key]
            _cache_stats['hits'] += 1
            print(f"[CACHE HIT] {school_name} ({kommune})")
            return CachedLocation(lat, lng, cached_kommune)

    # Strategy 2: Try name-only lookup (when Kommune not provided or exact match failed)
    if school_name in _name_only_cache:
        matches = _name_only_cache[school_name]

        if len(matches) == 1:
            # Only one school with this name - safe to use
            lat, lng, cached_kommune = matches[0]
            _cache_stats['hits'] += 1
            print(f"[CACHE HIT] {school_name} (unique match)")
            if kommune and cached_kommune and kommune != cached_kommune:
                print(f"  Warning: Kommune mismatch - requested '{kommune}', cached '{cached_kommune}'")
            return CachedLocation(lat, lng, cached_kommune)
        else:
            # Multiple schools with same name
            if kommune:
                # Try fuzzy match with Kommune
                for lat, lng, cached_kommune in matches:
                    if cached_kommune.lower() == kommune.lower():
                        _cache_stats['hits'] += 1
                        print(f"[CACHE HIT] {school_name} ({cached_kommune}, fuzzy Kommune match)")
                        return CachedLocation(lat, lng, cached_kommune)

                print(f"[WARNING] Multiple schools named '{school_name}' found, but none in '{kommune}':")
                for _, _, k in matches:
                    print(f"    - {school_name} in {k}")
            else:
                print(f"[WARNING] Multiple schools named '{school_name}' found. Provide Kommune for accuracy:")
                for _, _, k in matches:
                    print(f"    - {school_name} in {k}")
                # Return first match with warning
                lat, lng, cached_kommune = matches[0]
                _cache_stats['hits'] += 1
                print(f"  Using first match: {cached_kommune}")
                return CachedLocation(lat, lng, cached_kommune)

    # Strategy 3: Not in cache - use geocoding API
    _cache_stats['misses'] += 1
    print(f"[CACHE MISS] {school_name}" + (f" ({kommune})" if kommune else ""))

    geolocator = Nominatim(user_agent="norway-schools-map")
    try:
        _cache_stats['api_calls'] += 1
        location = geolocator.geocode(address)
        if location:
            print(f"  -> Geocoded via API: ({location.latitude}, {location.longitude})")
        return location
    except Exception as e:
        print(f"  -> Geocoding error: {e}")
        return None


def get_cache_stats():
    """
    Get cache performance statistics.

    Returns:
        dict: Statistics about cache hits, misses, and API calls
    """
    _load_cache()
    hit_rate = (_cache_stats['hits'] / (_cache_stats['hits'] + _cache_stats['misses']) * 100) if (_cache_stats['hits'] + _cache_stats['misses']) > 0 else 0

    return {
        'hits': _cache_stats['hits'],
        'misses': _cache_stats['misses'],
        'api_calls': _cache_stats['api_calls'],
        'hit_rate': f"{hit_rate:.1f}%",
        'cache_size': len(_coordinates_cache),
        'unique_names': len(_name_only_cache)
    }


def reset_cache_stats():
    """Reset cache statistics counters."""
    global _cache_stats
    _cache_stats = {'hits': 0, 'misses': 0, 'api_calls': 0}


def find_duplicate_school_names():
    """
    Find school names that appear in multiple Kommune.
    Useful for debugging and data quality checks.

    Returns:
        dict: School names with list of Kommune where they appear
    """
    _load_cache()
    duplicates = {name: matches for name, matches in _name_only_cache.items() if len(matches) > 1}

    result = {}
    for name, matches in duplicates.items():
        result[name] = [kommune for _, _, kommune in matches]

    return result


