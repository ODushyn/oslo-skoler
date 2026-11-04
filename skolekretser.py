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
Trondheim, Nordre Follo, Hamar and the other kommuner. Oslo can be added from a file the kommune
delivers (see OSLO_FILE below).

Writes static/js/skolekretser.json, read by the address search. Run:
    python skolekretser.py
"""
import io
import json
import math
import re
import urllib.request
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


# Oslo: school districts delivered by Oslo kommune as a file, used with the kommune's permission.
# Put a GeoJSON FeatureCollection (WGS84) here, one Polygon/MultiPolygon per krets, with the
# school's name in properties.name (or "skole"/"navn") and the level in properties.level
# ("barneskole"/"ungdomsskole"; barneskole if missing). Without the file, Oslo is left out.
OSLO_FILE = Path('source-data/oslo-skolekretser.geojson')
OSLO_SOURCE = {
    'levels': ['barneskole'],
    'source': 'Oslo kommune, skolekretser (brukt med tillatelse)',
    'sourceUrl': 'https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/',
    'updated': None,
    'caveat': 'Kretsgrensene er veiledende. Det er kommunen som fatter vedtak om skoleplass.',
}


def oslo(path=OSLO_FILE):
    if not path.exists():
        return []
    result = []
    for feature in json.loads(path.read_text(encoding='utf-8'))['features']:
        props, geometry = feature.get('properties') or {}, feature.get('geometry') or {}
        name = (props.get('name') or props.get('skole') or props.get('navn') or '').strip()
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


def match_schools(kretser):
    """Krets name -> school name in our data (public schools of the same level and kommune)."""
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    unmatched = []
    for krets in kretser:
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


def check_schools_inside(kretser):
    """Sanity check: each matched school's own position lies inside its krets."""
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    outside = []
    for krets in kretser:
        school = next((s for s in schools if s['name'] == krets['school'] and s['kommune'] == krets['kommune']
                       and s['schoolType'] == krets['level']), None)
        if school and not _inside(school['lng'], school['lat'], krets['rings']):
            outside.append(f"{krets['school']} ({krets['name']})")
    return outside


def main():
    kretser = halden() + stavanger() + fredrikstad() + oslo()
    unmatched = match_schools(kretser)
    OUTPUT.write_text(json.dumps({'kommuner': SOURCES, 'kretser': kretser}, ensure_ascii=False, separators=(',', ':')),
                      encoding='utf-8')
    print(f"Saved {len(kretser)} skolekretser to {OUTPUT} ({OUTPUT.stat().st_size // 1024} kB)")
    if unmatched:
        print(f"No school found for: {', '.join(unmatched)}")
    outside = check_schools_inside(kretser)
    print(f"Check: {'all matched schools lie inside their krets' if not outside else 'outside their krets: ' + ', '.join(outside)}")


if __name__ == '__main__':
    main()
