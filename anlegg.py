"""
Sports facilities near each school: swimming pool, football pitch and sports hall.

Data source: OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), read from
Geofabrik's daily extract for Norway:
    https://download.geofabrik.de/europe/norway-latest.osm.pbf

Why OpenStreetMap and not Anleggsregisteret:
- Anleggsregisteret (Kultur- og likestillingsdepartementet, NLOD 2.0) is the official list of
  sports facilities, but the only open download on data.norge.no
  (dataset 45e016b0-5fb2-4b6f-bd6a-84019de002cd) is marked as no longer updated. The search on
  https://www.anleggsregisteret.no/finn-anlegg/ reads an internal backoffice API that is not
  published as open data, so we do not use it.
- OpenStreetMap is updated every day, has coordinates for every object and is already credited
  on the site's maps.
- The public Overpass servers ask automated, high-volume users to use a downloaded extract
  instead, so this script reads the Geofabrik file locally (about 1.4 GB, kept out of git).

What counts (OSM tags):
- pool:     leisure=swimming_pool or leisure=water_park, or a sports centre, hall or building
            with sport=swimming. Garden pools are left out: a leisure=swimming_pool needs a name,
            an indoor tag or public access, and access=private/no is always skipped.
- football: leisure=pitch with sport=soccer (also small pitches and ballbinger)
- hall:     leisure=sports_hall, leisure=sports_centre (not only swimming) or building=sports_hall

Per school (coordinates from school-data.json): pitch or hall within 150 m counts as "at the school".
For pools the nearest one within 2 km is kept, with name and distance; one within 150 m is "at the school".
OSM can miss facilities or place them a little off, so the school page only says what was found.

Cached in cached-data/anlegg.json. Refresh with:
    python anlegg.py --refresh            # downloads the extract if missing, then reads it
    python anlegg.py --refresh --download # also downloads a fresh extract
"""
import argparse
import datetime
import json
import math
import urllib.request
from pathlib import Path

EXTRACT_URL = 'https://download.geofabrik.de/europe/norway-latest.osm.pbf'
EXTRACT_FILE = Path('source-data/osm/norway-latest.osm.pbf')
CACHE_FILE = Path('cached-data/anlegg.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
SOURCE = 'OpenStreetMap (Geofabrik)'
AT_SCHOOL = 150      # metres
POOL_RADIUS = 2000   # metres

WANTED = [('leisure', 'swimming_pool'), ('leisure', 'water_park'), ('leisure', 'sports_centre'),
          ('leisure', 'sports_hall'), ('building', 'sports_hall'), ('leisure', 'pitch'), ('sport', 'swimming')]


def _download(path=EXTRACT_FILE):
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(EXTRACT_URL, headers={'User-Agent': USER_AGENT})
    print(f"  Downloading {EXTRACT_URL} ...")
    with urllib.request.urlopen(request, timeout=600) as response, open(path, 'wb') as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)


def _sports(tags):
    return set((tags.get('sport') or '').replace(' ', '').split(';')) - {''}


def classify(tags):
    """The kinds ('pool', 'football', 'hall') an OSM object counts as."""
    if tags.get('access') in ('private', 'no'):
        return set()
    leisure, sports = tags.get('leisure'), _sports(tags)
    kinds = set()
    if leisure == 'water_park' or (leisure == 'swimming_pool' and (
            tags.get('name') or tags.get('indoor') == 'yes' or tags.get('location') == 'indoor'
            or tags.get('covered') == 'yes' or tags.get('access') in ('yes', 'public', 'customers', 'permissive'))):
        kinds.add('pool')
    if 'swimming' in sports and (leisure in ('sports_centre', 'sports_hall') or tags.get('building')):
        kinds.add('pool')
    if leisure == 'pitch' and 'soccer' in sports:
        kinds.add('football')
    if leisure == 'sports_hall' or tags.get('building') == 'sports_hall' or (
            leisure == 'sports_centre' and sports != {'swimming'}):
        kinds.add('hall')
    return kinds


def _is_indoor_pool(tags):
    return bool(tags.get('building') or tags.get('indoor') == 'yes' or tags.get('location') == 'indoor'
                or tags.get('leisure') in ('sports_centre', 'sports_hall'))


def read_extract(path=EXTRACT_FILE):
    """All matching facilities in the extract as compact dicts with a centre point."""
    import osmium  # pip install osmium; only needed when reading the extract

    tag_filter = osmium.filter.TagFilter(*WANTED)
    processor = osmium.FileProcessor(str(path)).with_locations().with_areas(tag_filter).with_filter(tag_filter)
    facilities = []
    for obj in processor:
        if obj.is_node():
            points = [obj.location]
            osm = f'node/{obj.id}'
        elif obj.is_area():
            points = [n.location for ring in obj.outer_rings() for n in ring]
            osm = f"{'way' if obj.from_way() else 'relation'}/{obj.orig_id()}"
        elif obj.is_way() and not obj.is_closed():
            points = [n.location for n in obj.nodes]
            osm = f'way/{obj.id}'
        else:
            continue  # closed ways and relations come back as areas
        tags = dict(obj.tags)
        kinds = classify(tags)
        points = [p for p in points if p.valid()]
        if not kinds or not points:
            continue
        facilities.append({
            'kinds': sorted(kinds),
            'name': tags.get('name'),
            'indoor': _is_indoor_pool(tags) if 'pool' in kinds else None,
            'lat': round(sum(p.lat for p in points) / len(points), 6),
            'lng': round(sum(p.lon for p in points) / len(points), 6),
            'osm': osm,
        })
    return facilities


def refresh_cache(path=CACHE_FILE, download=False):
    if download or not EXTRACT_FILE.exists():
        _download()
    facilities = read_extract()
    extract_date = datetime.date.fromtimestamp(EXTRACT_FILE.stat().st_mtime).isoformat()
    data = {'source': SOURCE, 'sourceUrl': EXTRACT_URL, 'fetched': extract_date,
            'facilities': [{k: v for k, v in f.items() if v is not None} for f in facilities]}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    counts = {kind: sum(kind in f['kinds'] for f in facilities) for kind in ('pool', 'football', 'hall')}
    print(f"  Saved {len(facilities)} facilities to {path}: {counts}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, reading the OpenStreetMap extract...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


def _distance(lat1, lng1, lat2, lng2):
    """Metres between two points (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


class Finder:
    """Looks up facilities near a point, using a coarse grid so 3000 schools stay fast."""

    def __init__(self, cache):
        self.cache = cache
        self.grid = {}
        for f in cache['facilities']:
            self.grid.setdefault((int(f['lat'] * 20), int(f['lng'] * 10)), []).append(f)

    def _near(self, lat, lng):
        row, col = int(lat * 20), int(lng * 10)  # cells of about 5.5 km
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                yield from self.grid.get((row + dr, col + dc), [])

    def for_school(self, lat, lng):
        """{pool: {name, distance, indoor, osm} | None, football, hall, source, fetched}; None without a position."""
        if lat is None or lng is None:
            return None
        pools, football, hall = [], False, False
        for f in self._near(lat, lng):
            d = _distance(lat, lng, f['lat'], f['lng'])
            if d <= AT_SCHOOL:
                football = football or 'football' in f['kinds']
                hall = hall or 'hall' in f['kinds']
            # A pool further away is only useful when we can name it
            if 'pool' in f['kinds'] and (d <= AT_SCHOOL or (d <= POOL_RADIUS and f.get('name'))):
                pools.append((d, f))
        pool = None
        if pools:
            d, f = min(pools, key=lambda p: p[0])
            pool = {'name': f.get('name'), 'distance': int(round(d, -1)), 'indoor': bool(f.get('indoor')),
                    'osm': f'https://www.openstreetmap.org/{f["osm"]}'}
        # Kept also when nothing was found, so the page can say which map data it checked
        return {'pool': pool, 'football': football, 'hall': hall,
                'source': self.cache['source'], 'fetched': self.cache['fetched']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Read sports facilities near schools from OpenStreetMap.')
    parser.add_argument('--refresh', action='store_true', help='read the extract again')
    parser.add_argument('--download', action='store_true', help='download a fresh extract from Geofabrik first')
    args = parser.parse_args()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache(download=args.download)
    cache = load_cache()
    schools = json.loads(Path('static/js/school-data.json').read_text(encoding='utf-8'))['schools']
    finder = Finder(cache)
    found = [finder.for_school(s.get('lat'), s.get('lng')) for s in schools]
    print(f"{len(cache['facilities'])} facilities in {CACHE_FILE} (extract {cache['fetched']}); "
          f"{sum(bool(f and f['pool']) for f in found)} schools with a pool within 2 km, "
          f"{sum(bool(f and f['football']) for f in found)} with a football pitch and "
          f"{sum(bool(f and f['hall']) for f in found)} with a hall within {AT_SCHOOL} m")
