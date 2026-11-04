"""
School positions from open, official sources only.

Order of preference, per organisation number:
1. Geonorge "Grunnskoler" WFS (data from Udir, CC BY 4.0)
   https://wfs.geonorge.no/skwms1/wfs.grunnskoler_vgs
2. Nasjonalt skoleregister (NSR, Udir, NLOD): the unit's own coordinate
3. Kartverket address API (CC BY 4.0), using the school address from NSR
4. OpenStreetMap Nominatim (ODbL), using school name and kommune

Every position records which source it came from. The old coordinate cache
(cached-data/skoler-geo-coordinates.csv) is NOT used: part of it was filled with
Google geocoding, which is not open data.

Cached in cached-data/school-locations.json. Refresh with:
    python school_locations.py --refresh
"""
import argparse
import csv
import glob
import io
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

WFS_URL = ('https://wfs.geonorge.no/skwms1/wfs.grunnskoler_vgs?service=WFS&version=2.0.0'
           '&request=GetFeature&typeNames=app:Grunnskole&srsName=urn:ogc:def:crs:EPSG::4326')
NSR_URL = 'https://data-nsr.udir.no/v4/enhet/'
ADDRESS_URL = 'https://ws.geonorge.no/adresser/v1/sok'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
CACHE_FILE = Path('cached-data/school-locations.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'


def _get(url, accept='application/json'):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': accept})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def read_udir_file(path):
    """Raw Udir export: UTF-16 LE, tab separated, first line 'sep='."""
    lines = Path(path).read_text(encoding='utf-16-le').lstrip('﻿').splitlines()
    if lines and lines[0].startswith('sep='):
        lines = lines[1:]
    return list(csv.DictReader(io.StringIO('\n'.join(lines)), delimiter='\t'))


def schools_in_source(pattern='source-data/*.csv'):
    """(name, kommune, school_type) -> orgnr, from the raw Udir files (exact, no name matching)."""
    result = {}
    for path in sorted(glob.glob(pattern)):
        school_type = 'barneskole' if '5._trinn' in path else 'ungdomsskole'
        for row in read_udir_file(path):
            if row.get('EnhetNivaa') == '4' and row.get('Organisasjonsnummer'):
                key = (row['EnhetNavn'].strip(), row['Kommune'].strip(), school_type)
                result[key] = row['Organisasjonsnummer'].strip()
    return result


def _geonorge_positions():
    root = ET.fromstring(_get(WFS_URL, accept='application/xml'))
    positions = {}
    for member in root.findall('{http://www.opengis.net/wfs/2.0}member'):
        feature = member[0]
        orgnr = feature.find('.//{*}organisasjonsnummer')
        pos = feature.find('.//{http://www.opengis.net/gml/3.2}pos')
        if orgnr is None or pos is None or not orgnr.text:
            continue
        lat, lng = (float(v) for v in pos.text.split())
        positions[orgnr.text.strip()] = {'lat': round(lat, 6), 'lng': round(lng, 6), 'source': 'geonorge-grunnskoler'}
    return positions


def _fallback_position(orgnr, name, kommune):
    """NSR coordinate, else NSR address via Kartverket, else OSM Nominatim."""
    unit = {}
    try:
        unit = json.loads(_get(NSR_URL + orgnr))
    except Exception:
        pass

    coordinate = unit.get('Koordinat') or {}
    if coordinate.get('Breddegrad') and coordinate.get('Lengdegrad'):
        return {'lat': coordinate['Breddegrad'], 'lng': coordinate['Lengdegrad'], 'source': 'nsr'}

    address = unit.get('Beliggenhetsadresse') or {}
    if address.get('Adresse') and address.get('Postnummer'):
        params = urllib.parse.urlencode({'sok': address['Adresse'], 'postnummer': address['Postnummer'],
                                         'treffPerSide': 1, 'utkoordsys': 4258})
        try:
            hits = json.loads(_get(f'{ADDRESS_URL}?{params}')).get('adresser', [])
            if hits and hits[0].get('representasjonspunkt'):
                point = hits[0]['representasjonspunkt']
                return {'lat': point['lat'], 'lng': point['lon'], 'source': 'kartverket-adresse'}
        except Exception:
            pass

    params = urllib.parse.urlencode({'q': f'{name}, {kommune}, Norway', 'format': 'json', 'limit': 1,
                                     'countrycodes': 'no'})
    try:
        time.sleep(1.1)  # Nominatim usage policy: max 1 request per second
        hits = json.loads(_get(f'{NOMINATIM_URL}?{params}'))
        if hits:
            return {'lat': float(hits[0]['lat']), 'lng': float(hits[0]['lon']), 'source': 'osm-nominatim'}
    except Exception:
        pass
    return None


def refresh_cache(path=CACHE_FILE):
    positions = _geonorge_positions()
    print(f"  Geonorge Grunnskoler: {len(positions)} schools with position")

    wanted = schools_in_source()
    missing = {orgnr: key for key, orgnr in wanted.items() if orgnr not in positions}
    print(f"  {len(missing)} schools in the Udir files have no Geonorge position, trying NSR/Kartverket/OSM")
    not_found = []
    for orgnr, (name, kommune, _) in sorted(missing.items()):
        position = _fallback_position(orgnr, name, kommune)
        if position:
            positions[orgnr] = position
        else:
            not_found.append(f'{name} ({kommune})')

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(sorted(positions.items())), ensure_ascii=False, indent=0), encoding='utf-8')
    sources = {}
    for p in positions.values():
        sources[p['source']] = sources.get(p['source'], 0) + 1
    print(f"  Saved {len(positions)} positions to {path}: {sources}")
    if not_found:
        print(f"  No open position found for {len(not_found)}: {', '.join(not_found[:10])}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect the open school position cache.')
    parser.add_argument('--refresh', action='store_true', help='download fresh positions')
    args = parser.parse_args()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    print(f"{len(load_cache())} school positions in {CACHE_FILE}")
