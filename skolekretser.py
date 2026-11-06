"""
Pilot: exact school districts (skolekretser) where a kommune publishes them as open data.

There is no open national dataset. Kommunene register districts in Matrikkelen, but
Kartverket only shares those under agreement. This pilot covers the kommuner that
publish their own districts openly:

- Halden: barneskolekretser, SOSI file on Geonorge, marked as open data (updated 2025-08-01)
  https://kartkatalog.geonorge.no/metadata/a5ace328-7e3f-47fb-8675-1fdf6f59657d
  (Halden's ungdomsskolekretser are not marked as open data and are left out.)
- Stavanger: barne- and ungdomsskolekretser, GeoJSON, NLOD 2.0
  https://opencom.no/dataset/skolekretser-stavanger
  The file is not dated. The national catalogue lists it as last updated in 2018,
  but it covers Finnøy and Rennesøy, which joined Stavanger in 2020.
- Fredrikstad: «Inntakssoner» for barne- and ungdomsskoler, Geonorge, open data with no
  conditions on use (2018), downloaded as GeoJSON from the kommune's open data hub
  https://kartkatalog.geonorge.no/metadata/c86a3e655e2b4fada22cf99672e4c784_2
  https://kartkatalog.geonorge.no/metadata/7035559d74614fe5993cb04adcf99d8a_3

Searched and not found as open data (Geonorge and data.norge.no, November 2026): Oslo, Bergen,
Trondheim, Nordre Follo, Hamar and the other kommuner. Oslo's barneskolekretser come from the WFS
of Plan- og bygningsetaten, used with permission (see OSLO_WFS below).

Writes static/js/skolekretser.json, read by the address search. Run:
    python skolekretser.py
"""
import io
import json
import math
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from difflib import SequenceMatcher
from pathlib import Path

OUTPUT = Path('static/js/skolekretser.json')
SCHOOL_DATA = Path('static/js/school-data.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'

HALDEN_ZIP = 'https://nedlasting.geonorge.no/geonorge/kommunaleDokData/a5ace328-7e3f-47fb-8675-1fdf6f59657d.zip'
FREDRIKSTAD = {
    'barneskole': 'https://hub-frstadkomm.opendata.arcgis.com/api/download/v1/items/b2db9113e103400c91cf321af1a17c3f/geojson?layers=2',
    'ungdomsskole': 'https://hub-frstadkomm.opendata.arcgis.com/api/download/v1/items/c837ebc9cf9f4c2f973730d1726bf6aa/geojson?layers=3',
}
STAVANGER = {
    'barneskole': 'https://opencom.no/dataset/1d0442c1-4521-41b8-bcce-f08d7930b9e5/resource/c30990ab-ca85-40c5-beff-a1cfe6273033/download/skolekretserbarn.json',
    'ungdomsskole': 'https://opencom.no/dataset/1d0442c1-4521-41b8-bcce-f08d7930b9e5/resource/d39abd69-6924-4d1b-acb6-27bca6850294/download/skolekretserungdom.json',
}

SOURCES = {
    'Halden': {
        'levels': ['barneskole'],
        'source': 'Halden kommune, «Barneskolekretser i Halden kommune» (Geonorge, åpne data)',
        'sourceUrl': 'https://kartkatalog.geonorge.no/metadata/a5ace328-7e3f-47fb-8675-1fdf6f59657d',
        'updated': '1. august 2025',
        'caveat': 'Bare barneskolekretser. Halden har ikke publisert ungdomsskolekretsene som åpne data.',
    },
    'Stavanger': {
        'levels': ['barneskole', 'ungdomsskole'],
        'source': 'Stavanger kommune, «Skolekretser Stavanger» (NLOD 2.0)',
        'sourceUrl': 'https://opencom.no/dataset/skolekretser-stavanger',
        'updated': None,
        'caveat': 'Datasettet er ikke datert, og datakatalogen oppgir 2018 som siste oppdatering. '
                  'Kretsene kan derfor avvike fra dagens grenser.',
    },
    'Fredrikstad': {
        'levels': ['barneskole', 'ungdomsskole'],
        'source': 'Fredrikstad kommune, «Inntakssoner for barneskoler» og «Inntakssoner for ungdomskoler» (Geonorge, åpne data)',
        'sourceUrl': 'https://kartkatalog.geonorge.no/metadata/c86a3e655e2b4fada22cf99672e4c784_2',
        'updated': '3. juli 2018',
        'caveat': 'Inntakssonene ble sist oppdatert i 2018 og kan avvike fra dagens grenser.',
    },
}


def _get(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


# ── UTM (EUREF89) to latitude/longitude ─────────────────────────────────
def utm_to_latlng(north, east, zone):
    a, f = 6378137.0, 1 / 298.257222101  # GRS80
    k0, e2 = 0.9996, f * (2 - f)
    ep2 = e2 / (1 - e2)
    x, y = east - 500000.0, north
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    n1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    t1 = math.tan(phi1) ** 2
    c1 = ep2 * math.cos(phi1) ** 2
    r1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lng = (d - (1 + 2 * t1 + c1) * d ** 3 / 6
           + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), (zone * 6 - 183) + math.degrees(lng)


# ── Minimal SOSI reader: .KURVE lines and .FLATE areas built from them ─
SOSI_ZONES = {22: 32, 23: 33, 25: 35}


def read_sosi(text):
    zone = SOSI_ZONES[int(re.search(r'\.\.\.KOORDSYS\s+(\d+)', text).group(1))]
    unit = float(re.search(r'\.\.\.ENHET\s+([\d.]+)', text).group(1))
    curves, areas = {}, []
    for block in re.split(r'\n(?=\.[A-ZÆØÅ])', text.replace('\r\n', '\n')):
        head = re.match(r'\.(KURVE|FLATE)\s+(\d+):', block)
        if not head:
            continue
        kind, number = head.group(1), int(head.group(2))
        if kind == 'KURVE':
            coords = block.split('..NØ', 1)[1] if '..NØ' in block else ''
            points = []
            for line in coords.splitlines():
                numbers = re.findall(r'^\s*(-?\d+)\s+(-?\d+)', line)
                if numbers:
                    n, e = (int(v) * unit for v in numbers[0])
                    points.append(utm_to_latlng(n, e, zone))
            curves[number] = points
        elif '..OBJTYPE Skolekrets\n' in block + '\n':
            ref = re.search(r'\.\.REF(.*?)(?=\n\.\.[A-ZÆØÅ])', block, re.S).group(1)
            name = re.search(r'\.\.\.SKOLEKRETSNAVN\s+"?([^"\n]+)"?', block).group(1).strip()
            areas.append({'name': name, 'ref': ref})

    def ring(refs):
        points = []
        for ref in refs:
            curve = curves[abs(ref)]
            curve = curve if ref > 0 else list(reversed(curve))
            points.extend(curve if not points else curve[1:])
        return points

    result = []
    for area in areas:
        parts = re.split(r'[()]', area['ref'])
        rings = [ring([int(v) for v in re.findall(r'-?\d+', part)]) for part in parts if re.search(r'\d', part)]
        result.append({'name': area['name'], 'rings': rings})
    return result


def _round(rings):
    return [[[round(lng, 5), round(lat, 5)] for lat, lng in r] for r in rings]


def halden():
    archive = zipfile.ZipFile(io.BytesIO(_get(HALDEN_ZIP)))
    sos = next(n for n in archive.namelist() if n.lower().endswith('.sos'))
    text = archive.read(sos).decode('utf-8-sig')
    return [{'kommune': 'Halden', 'level': 'barneskole', 'name': a['name'], 'rings': _round(a['rings'])}
            for a in read_sosi(text)]


def stavanger():
    result = []
    for level, url in STAVANGER.items():
        for feature in json.loads(_get(url))['features']:
            props, geometry = feature.get('properties') or {}, feature.get('geometry')
            if props.get('Objektype') != 'Skolekrets' or not geometry or geometry['type'] != 'Polygon':
                continue
            rings = [[[round(x, 5), round(y, 5)] for x, y, *_ in r] for r in geometry['coordinates']]
            result.append({'kommune': 'Stavanger', 'level': level, 'name': props['SKtretsNavn'].strip(), 'rings': rings})
    return result


def fredrikstad():
    result = []
    for level, url in FREDRIKSTAD.items():
        for feature in json.loads(_get(url))['features']:
            props, geometry = feature.get('properties') or {}, feature.get('geometry') or {}
            name = (props.get('SKOLE') or '').strip()
            polygons = [geometry['coordinates']] if geometry.get('type') == 'Polygon' else \
                       geometry.get('coordinates', []) if geometry.get('type') == 'MultiPolygon' else []
            for polygon in polygons:
                rings = [[[round(x, 5), round(y, 5)] for x, y, *_ in r] for r in polygon]
                result.append({'kommune': 'Fredrikstad', 'level': level, 'name': _krets_name(name), 'rings': rings})
    return result


def _krets_name(name):
    """'Slevik skole' -> 'Slevik', 'Haugåsen ungdomsskole' -> 'Haugåsen'."""
    return re.sub(r'\s+(skole|skule|barneskole|ungdomsskole|ungdomskole)$', '', name, flags=re.I)


# Oslo: barneskolekretser from the WFS of Plan- og bygningsetaten (PBE), used with permission.
# The service sends GML 3.1.1 in UTM zone 32 (EPSG:32632) and needs no key today. If PBE starts
# asking for one, set it in the environment (PBE_WFS_KEY); never write the key in this file.
# Each fetch is saved to OSLO_FILE as GeoJSON (WGS84), which is used when the service is down.
OSLO_WFS = ('https://od2.pbe.oslo.kommune.no/cgi-bin/wms?map=SKOLER&SERVICE=WFS&VERSION=1.1.0'
            '&REQUEST=GetFeature&TYPENAME=Skolekretser_f')
OSLO_FILE = Path('source-data/oslo-skolekretser.geojson')
GML = {'gml': 'http://www.opengis.net/gml', 'ms': 'http://mapserver.gis.umn.edu/mapserver'}
OSLO_CAVEAT = ('Kretsgrensene er veiledende. Ungdomsskolekretsene er satt sammen av barneskolekretsene etter '
               'Oslo kommunes oversikt over hvilken ungdomsskole elevene går videre til. For noen barneskoler '
               'avhenger ungdomsskolen av adressen. Det er kommunen som fatter vedtak om skoleplass.')
OSLO_SOURCE = {
    'levels': ['barneskole'],
    'source': 'Plan- og bygningsetaten, Oslo kommune, barneskolekretser (brukt med tillatelse)',
    'sourceUrl': 'https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/',
    'updated': None,
    'caveat': 'Kretsgrensene er veiledende. Det er kommunen som fatter vedtak om skoleplass.',
}


def _utm_ring(text):
    values = [float(v) for v in text.split()]
    return [[round(lng, 7), round(lat, 7)] for lat, lng in
            (utm_to_latlng(n, e, 32) for e, n in zip(values[0::2], values[1::2]))]


def fetch_oslo(path=OSLO_FILE):
    """Download the kretser from PBE and save them as GeoJSON (WGS84)."""
    key = os.environ.get('PBE_WFS_KEY')
    url = OSLO_WFS + ('&key=' + urllib.parse.quote(key) if key else '')
    root = ET.fromstring(_get(url))
    features = []
    for member in root.iterfind('gml:featureMember/ms:Skolekretser_f', GML):
        name = member.findtext('ms:SKRETSNAVN', '', GML).strip()
        for polygon in member.iterfind('.//gml:Polygon', GML):
            rings = [_utm_ring(polygon.findtext('gml:exterior/gml:LinearRing/gml:posList', '', GML))]
            rings += [_utm_ring(r.text) for r in polygon.iterfind('gml:interior/gml:LinearRing/gml:posList', GML)]
            features.append({'type': 'Feature', 'properties': {'SKRETSNAVN': name},
                             'geometry': {'type': 'Polygon', 'coordinates': rings}})
    if not features:
        raise ValueError('PBE sent no skolekretser')
    path.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False,
                               separators=(',', ':')), encoding='utf-8')
    print(f'Fetched {len(features)} Oslo skolekretser from PBE')


def oslo(path=OSLO_FILE):
    try:
        fetch_oslo(path)
    except Exception as error:  # the saved copy is used when the service is down
        print(f'WARNING: could not fetch Oslo skolekretser from PBE ({error}); using {path}')
    if not path.exists():
        return []
    collection = json.loads(path.read_text(encoding='utf-8'))
    result = []
    for feature in collection['features']:
        props, geometry = feature.get('properties') or {}, feature.get('geometry') or {}
        name = (props.get('name') or props.get('SKRETSNAVN') or props.get('skole') or props.get('navn') or '').strip()
        level = props.get('level') or 'barneskole'
        polygons = [geometry['coordinates']] if geometry.get('type') == 'Polygon' else \
                   geometry.get('coordinates', []) if geometry.get('type') == 'MultiPolygon' else []
        for polygon in polygons:
            rings = [[[round(x, 5), round(y, 5)] for x, y, *_ in r] for r in polygon]
            result.append({'kommune': 'Oslo', 'level': level, 'name': re.sub(r'\s+skole$', '', name), 'rings': rings})
    levels = sorted({k['level'] for k in result})
    if result:
        SOURCES['Oslo'] = dict(OSLO_SOURCE, levels=levels)
    return result


def _base(name):
    return re.sub(r'\s+(skole|skule|oppvekstsenter.*|barneskole|ungdomsskole)$', '', name.strip().lower())


# Krets names that differ too much from the school's name to match automatically
KRETS_SCHOOL = {
    ('Oslo', 'Majorstua'): 'Majorstuen skole',
    ('Oslo', 'Svarttjern og Tiurleiken'): 'Tiurleiken skole',
    # Too small to have published results, so it is not in our school data; the name is from NSR.
    # The address card shows it as a plain card without scores.
    ('Stavanger', 'Fogn'): 'Fogn oppvekstsenter',
}


def match_schools(kretser):
    """Krets name -> school name in our data (public schools of the same level and kommune)."""
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    unmatched = []
    for krets in kretser:
        if (krets['kommune'], krets['name']) in KRETS_SCHOOL:
            krets['school'] = KRETS_SCHOOL[(krets['kommune'], krets['name'])]
            continue
        pool = [s for s in schools if s['kommune'] == krets['kommune'] and s['schoolType'] == krets['level']
                and s.get('eierform') != 'privat']
        target = krets['name'].lower()
        best = max(pool, key=lambda s: (_base(s['name']) == target, SequenceMatcher(None, _base(s['name']), target).ratio()),
                   default=None)
        if best and SequenceMatcher(None, _base(best['name']), target).ratio() >= 0.85:
            krets['school'] = best['name']
        else:
            krets['school'] = None
            unmatched.append(f"{krets['name']} ({krets['kommune']}, {krets['level']})")
    return unmatched


def _inside(lng, lat, rings):
    inside = False
    for ring in rings:
        for i in range(len(ring)):
            (x1, y1), (x2, y2) = ring[i], ring[i - 1]
            if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


# Schools that sit in temporary buildings outside their own krets while their school is rebuilt.
# NSR gives the temporary address, so their position is right. Check again after the end date.
TEMPORARY_SITES = {
    ('Oslo', 'Lilleborg skole'): 'FO-bygget på Huseby until the end of 2026',
    ('Oslo', 'Ellingsrudåsen skole'): 'Bredtvetveien 2 until 2028',
}


BORDER_TOLERANCE_M = 50  # a school this close to its krets border counts as inside (rounded positions)


def _metres_to_border(lng, lat, rings):
    scale = 111320 * math.cos(math.radians(lat))
    best = float('inf')
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            ax, ay, bx, by = (x1 - lng) * scale, (y1 - lat) * 111320, (x2 - lng) * scale, (y2 - lat) * 111320
            dx, dy = bx - ax, by - ay
            t = max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) if dx or dy else 0
            best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def check_schools_inside(kretser):
    """Sanity check: each matched school's own position lies inside its krets, or right at its border."""
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    outside = []
    for krets in kretser:
        if (krets['kommune'], krets['school']) in TEMPORARY_SITES or 'from' in krets:
            continue   # an Oslo ungdomsskole may stand in a barneskolekrets that leads elsewhere
        school = next((s for s in schools if s['name'] == krets['school'] and s['kommune'] == krets['kommune']
                       and s['schoolType'] == krets['level']), None)
        if school and not _inside(school['lng'], school['lat'], krets['rings']) \
                and _metres_to_border(school['lng'], school['lat'], krets['rings']) > BORDER_TOLERANCE_M:
            outside.append(f"{krets['school']} ({krets['name']})")
    return outside


# Postnummerområder (Kartverket, from Posten, CC BY 4.0): which postnummer each krets covers, for the
# links to housing search on Finn.no
POSTAL_WFS = 'https://wfs.geonorge.no/skwms1/wfs.postnummeromrader'
POSTAL_NS = 'http://skjema.geonorge.no/SOSI/produktspesifikasjon/Postnummeromrader/20180215'
POSTAL_MIN_SHARE = 0.10   # a postnummer counts when it covers at least this share of the krets (by area)
POSTAL_SAMPLES = 400      # about this many points are tested inside each krets


def postal_areas(south, west, north, east):
    """[(postnummer, rings of [lng, lat], bbox)] in a box."""
    params = urllib.parse.urlencode({
        'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature', 'typeNames': 'app:Postnummerområde',
        'srsName': 'urn:ogc:def:crs:EPSG::4326', 'NAMESPACES': f'xmlns(app,{POSTAL_NS})', 'count': '20000',
        'BBOX': f'{south},{west},{north},{east},urn:ogc:def:crs:EPSG::4326'})
    root = ET.fromstring(_get(f'{POSTAL_WFS}?{params}'))
    gml = {'gml': 'http://www.opengis.net/gml/3.2', 'app': POSTAL_NS}
    areas = []
    for feature in root.iter(f'{{{POSTAL_NS}}}Postnummerområde'):
        number = feature.findtext('.//app:postnummer', '', gml)
        for polygon in feature.iterfind('.//gml:Polygon', gml):
            rings = []
            for pos in polygon.iterfind('.//gml:posList', gml):
                values = [float(v) for v in pos.text.split()]
                rings.append(list(zip(values[1::2], values[0::2])))   # the service gives lat lng
            xs = [x for x, _ in rings[0]]
            ys = [y for _, y in rings[0]]
            areas.append((number, rings, (min(xs), min(ys), max(xs), max(ys))))
    return areas


def add_postnummer(kretser):
    """Give each krets the postnummer it covers (largest share first), from points spread over it."""
    for kommune in sorted({k['kommune'] for k in kretser}):
        own = [k for k in kretser if k['kommune'] == kommune]
        points = [p for k in own for r in k['rings'] for p in r]
        west, east = min(x for x, _ in points), max(x for x, _ in points)
        south, north = min(y for _, y in points), max(y for _, y in points)
        areas = postal_areas(south, west, north, east)
        for krets in own:
            xs = [x for x, _ in krets['rings'][0]]
            ys = [y for _, y in krets['rings'][0]]
            # A square grid, with the step chosen so that about POSTAL_SAMPLES points fall in the box
            step = math.sqrt((max(xs) - min(xs)) * (max(ys) - min(ys)) / POSTAL_SAMPLES) or 0.001
            counts, inside = {}, 0
            y = min(ys) + step / 2
            while y < max(ys):
                x = min(xs) + step / 2
                while x < max(xs):
                    if _inside(x, y, krets['rings']):
                        inside += 1
                        hit = next((n for n, rings, (x1, y1, x2, y2) in areas
                                    if x1 <= x <= x2 and y1 <= y <= y2 and _inside(x, y, rings)), None)
                        if hit:
                            counts[hit] = counts.get(hit, 0) + 1
                    x += step
                y += step
            krets['postnummer'] = sorted((n for n, c in counts.items() if inside and c / inside >= POSTAL_MIN_SHARE),
                                         key=lambda n: -counts[n])
        print(f"Postnummer for {len(own)} kretser in {kommune}")


# Oslo has no ungdomsskolekretser of its own: the barneskole decides the ungdomsskole. Oslo kommune
# lists which ungdomsskole each barneskole leads to (ungdomsskole_oslo.py); the ungdomsskolekrets is
# the barneskolekretser that lead to it, joined. Some barneskoler send pupils to two ungdomsskoler,
# depending on the address; their krets is in both, marked 'split', with Oslo kommune's boundary map.
FEEDERS_FILE = Path('cached-data/ungdomsskole-oslo.json')


def _dissolve(pieces):
    """Join polygons that share borders: drop every edge that two pieces share, chain the rest.
    Each piece is a list of rings (outer first); holes are dropped. Returns a list of outer rings."""
    edges = {}
    for rings in pieces:
        ring = [tuple(p) for p in rings[0]]
        area = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))
        if area < 0:
            ring.reverse()   # all counter-clockwise, so a shared edge runs both ways
        for a, b in zip(ring, ring[1:] + ring[:1]):
            if a == b:
                continue
            if (b, a) in edges:
                del edges[(b, a)]
            else:
                edges[(a, b)] = True
    following = {}
    for a, b in edges:
        following.setdefault(a, []).append(b)
    result = []
    while following:
        start = next(iter(following))
        ring, point = [start], start
        while True:
            nexts = following.get(point)
            if not nexts:
                break
            nxt = nexts.pop()
            if not nexts:
                del following[point]
            if nxt == start:
                break
            ring.append(nxt)
            point = nxt
        if len(ring) >= 3:
            result.append([list(p) for p in ring + [start]])
    return result


def oslo_ungdomsskolekretser(kretser):
    if not FEEDERS_FILE.exists():
        return []
    feeders = json.loads(FEEDERS_FILE.read_text(encoding='utf-8'))
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    orgnr = {s['name']: s['orgnr'] for s in schools if s['kommune'] == 'Oslo' and s['schoolType'] == 'barneskole' and s.get('orgnr')}
    pieces = {}
    for krets in kretser:
        if krets['kommune'] != 'Oslo' or krets['level'] != 'barneskole':
            continue
        info = feeders['schools'].get(orgnr.get(krets.get('school')))
        if not info:
            continue
        for target in info['next']:
            entry = pieces.setdefault(target['name'], {'rings': [], 'from': [], 'split': []})
            entry['rings'].append(krets['rings'])
            entry['from'].append(krets['school'])
            if len(info['next']) > 1:
                entry['split'].append({'school': krets['school'], 'map': info.get('boundaryMap'),
                                       'others': [t['name'] for t in info['next'] if t['name'] != target['name']]})
    result = []
    area = lambda r: abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(r, r[1:]))) / 2
    for name, entry in sorted(pieces.items()):
        rings = _dissolve(entry['rings'])
        largest = max(map(area, rings), default=0)
        for ring in rings:
            if area(ring) < 0.02 * largest:
                continue   # slivers where neighbouring kretser do not quite meet
            result.append({'kommune': 'Oslo', 'level': 'ungdomsskole', 'name': re.sub(r'\s+skole$', '', name),
                           'school': name, 'rings': [ring], 'from': sorted(set(entry['from'])),
                           **({'split': entry['split']} if entry['split'] else {})})
    print(f"Oslo ungdomsskolekretser: {len(pieces)} schools, {len(result)} areas, from {FEEDERS_FILE}")
    return result


def main():
    kretser = halden() + stavanger() + fredrikstad() + oslo()
    unmatched = match_schools(kretser)
    kretser += oslo_ungdomsskolekretser(kretser)   # these name their school already
    if any(k['kommune'] == 'Oslo' and k['level'] == 'ungdomsskole' for k in kretser):
        SOURCES['Oslo'].update(levels=['barneskole', 'ungdomsskole'], caveat=OSLO_CAVEAT)
    add_postnummer(kretser)
    OUTPUT.write_text(json.dumps({'kommuner': SOURCES, 'kretser': kretser}, ensure_ascii=False, separators=(',', ':')),
                      encoding='utf-8')
    print(f"Saved {len(kretser)} skolekretser to {OUTPUT} ({OUTPUT.stat().st_size // 1024} kB)")
    if unmatched:
        print(f"No school found for: {', '.join(unmatched)}")
    outside = check_schools_inside(kretser)
    print(f"Check: {'all matched schools lie inside their krets' if not outside else 'outside their krets: ' + ', '.join(outside)}")


if __name__ == '__main__':
    main()
