"""
Videregående skoler for the map page (kart.html).

Source: Udir's dataset «Videregående skoler» in Geonorge's map catalogue (open data, NLOD),
https://kartkatalog.geonorge.no/metadata/c8acfd4f-c285-45a6-9a9b-3ab8d7d3af19, read from the layer
«VideregåendeSkole» in https://wfs.geonorge.no/skwms1/wfs.grunnskoler_vgs (the service school_locations.py uses). Each school has its position, owner (offentlig / privat), kommune and website.
Only schools in operation (iDrift) are kept. Udir counts some adult education centres, bible schools and
private schools here too, since they give videregående opplæring; they are kept as Udir lists them.

Kommune names come from the NSR cache (nsr.py). Writes static/js/videregaende.json. Run:
    python videregaende.py
"""
import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import nsr

WFS_URL = ('https://wfs.geonorge.no/skwms1/wfs.grunnskoler_vgs?service=WFS&version=2.0.0'
           '&request=GetFeature&typeNames=app:Videreg%C3%A5endeSkole&srsName=urn:ogc:def:crs:EPSG::4326')
OUTPUT = Path('static/js/videregaende.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
SOURCE = {
    'source': 'Utdanningsdirektoratet, Videregående skoler (Geonorge)',
    'sourceUrl': 'https://kartkatalog.geonorge.no/metadata/c8acfd4f-c285-45a6-9a9b-3ab8d7d3af19',
    'licence': 'Norsk lisens for offentlige data (NLOD)',
}


def _text(feature, tag):
    node = feature.find('.//{*}' + tag)
    return node.text.strip() if node is not None and node.text else None


def _website(address):
    if not address:
        return None
    address = address.strip()
    if not address.lower().startswith(('http://', 'https://')):
        address = 'https://' + address
    return address if ' ' not in address else None


def main():
    request = urllib.request.Request(WFS_URL, headers={'User-Agent': USER_AGENT, 'Accept': 'application/xml'})
    with urllib.request.urlopen(request, timeout=300) as response:
        root = ET.fromstring(response.read())
    kommuner = {k['kommunenummer']: k['kommunenavnNorsk'] for k in nsr.load_cache()['kommuner']}
    kommuner['2100'] = 'Svalbard'  # not a kommune, so not in Kartverket's list

    schools = []
    for member in root.findall('{http://www.opengis.net/wfs/2.0}member'):
        feature = member[0]
        if _text(feature, 'iDrift') != 'true':
            continue
        lat, lng = (float(v) for v in _text(feature, 'pos').split())
        schools.append({
            'name': _text(feature, 'skolenavn'),
            'orgnr': _text(feature, 'organisasjonsnummer'),
            'kommune': kommuner.get(_text(feature, 'kommunenummer'), ''),
            'owner': 'privat' if _text(feature, 'eierforhold') == 'Privat' else 'offentlig',
            'url': _website(_text(feature, 'webside')),
            'lat': round(lat, 5),
            'lng': round(lng, 5),
        })
    schools.sort(key=lambda s: (s['kommune'], s['name']))
    OUTPUT.write_text(json.dumps({**SOURCE, 'schools': schools}, ensure_ascii=False, separators=(',', ':')),
                      encoding='utf-8')
    missing = sum(not s['kommune'] for s in schools)
    print(f"Saved {len(schools)} videregående skoler to {OUTPUT} ({OUTPUT.stat().st_size // 1024} kB)"
          + (f", {missing} without kommune name" if missing else ''))


if __name__ == '__main__':
    main()
