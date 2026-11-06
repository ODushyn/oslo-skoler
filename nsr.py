"""
Owner type (public / private) and school profile from Udir's Nasjonalt skoleregister (NSR).

Data sources (open, no key):
- NSR API, https://data-nsr.udir.no (Norsk lisens for offentlige data, NLOD)
- Kartverket kommuneinfo, https://ws.geonorge.no/kommuneinfo/v1/kommuner

The register is cached in cached-data/nsr-skoler.json. Refresh it with:
    python nsr.py --refresh

NSR does not publish why a private school was approved (religious, pedagogical,
international ...). The profile is therefore derived from the school name and
can miss schools whose name does not say it.
"""
import argparse
import collections
import json
import re
import urllib.request
from pathlib import Path

NSR_PAGE_URL = 'https://data-nsr.udir.no/v4/enheter?sidenummer={page}&antallPerSide=5000'
KOMMUNER_URL = 'https://ws.geonorge.no/kommuneinfo/v1/kommuner'
CACHE_FILE = Path('cached-data/nsr-skoler.json')
USER_AGENT = 'skolekartet.no data refresh'

# Checked in this order; the first match wins
PROFILE_PATTERNS = [
    ('montessori', r'montessori'),
    ('steiner', r'steiner'),
    ('internasjonal', r'international|internasjonal|lyc[eé]e|tysk-norske|deutsche|british school|american'),
    ('kristen', r'\bkrist(en|ent|ne|elig)\b|kristelig|luthersk|advent|katolsk|hans nielsen hauge|danielsen'
                r'|oasen skole|kfskolen|\bst\.? (sunniva|paul|franciskus|olav|eystein|svithun|joseph|hallvard)'),
    ('toppidrett', r'toppidrett|idrettsungdomsskole|wang ung'),
    ('realfag', r'realfag'),
]


def _norm(text):
    return re.sub(r'\s+', ' ', (text or '').strip().lower())


def _fetch_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def refresh_cache(path=CACHE_FILE):
    """Download all school units from NSR plus the kommune list and store a compact cache."""
    units, page, pages = [], 1, 1
    while page <= pages:
        data = _fetch_json(NSR_PAGE_URL.format(page=page))
        pages = data['AntallSider']
        units.extend(data['EnhetListe'])
        print(f"  NSR page {page}/{pages}: {len(data['EnhetListe'])} units")
        page += 1

    schools = [{
        'orgnr': e['Organisasjonsnummer'],
        'navn': e['Navn'],
        'fulltNavn': e['FulltNavn'],
        'kommunenummer': e['Kommunenummer'],
        'aktiv': e['ErAktiv'],
        'grunnskole': e['ErGrunnskole'],
        'privat': e['ErPrivatskole'],
        'offentlig': e['ErOffentligSkole'],
    } for e in units if e.get('ErSkole')]
    schools.sort(key=lambda s: s['orgnr'])

    kommuner = sorted(_fetch_json(KOMMUNER_URL), key=lambda k: k['kommunenummer'])

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'schools': schools, 'kommuner': kommuner}, ensure_ascii=False, indent=0),
                    encoding='utf-8')
    print(f"  Saved {len(schools)} school units and {len(kommuner)} kommuner to {path}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading from NSR...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


def school_profile(name, eierform):
    for profile, pattern in PROFILE_PATTERNS:
        if re.search(pattern, name, re.IGNORECASE):
            return profile
    return 'annen' if eierform == 'privat' else None


class NsrMatcher:
    """Finds the NSR unit for a school by name, using the kommune to break ties."""

    def __init__(self, cache):
        self.by_name = collections.defaultdict(dict)
        self.by_orgnr = {unit['orgnr']: unit for unit in cache['schools']}
        for unit in cache['schools']:
            for name in {_norm(unit['navn']), _norm(unit['fulltNavn'])}:
                self.by_name[name][unit['orgnr']] = unit

        self.kommune_numbers = collections.defaultdict(set)
        for k in cache['kommuner']:
            for name in {k['kommunenavn'], k['kommunenavnNorsk']}:
                self.kommune_numbers[_norm(name)].add(k['kommunenummer'])

    def _numbers_for(self, kommune):
        numbers = self.kommune_numbers.get(_norm(kommune))
        if numbers:
            return numbers
        # "Herøy (Nordland)" -> "Herøy"; "Kárášjohka - Karasjok" -> either part
        base = re.sub(r'\s*\(.*\)', '', kommune)
        found = set(self.kommune_numbers.get(_norm(base), set()))
        for part in base.split(' - '):
            found |= self.kommune_numbers.get(_norm(part), set())
        return found

    def find(self, name, kommune, orgnr=None):
        if orgnr and orgnr in self.by_orgnr:
            return self.by_orgnr[orgnr]
        candidates = list(self.by_name.get(_norm(name), {}).values())
        if not candidates:
            return None
        numbers = self._numbers_for(kommune)
        in_kommune = [u for u in candidates if u['kommunenummer'] in numbers]
        pool = in_kommune or (candidates if len(candidates) == 1 else [])
        if not pool:
            return None
        # Prefer active grunnskole units
        pool.sort(key=lambda u: (not u['aktiv'], not u['grunnskole']))
        return pool[0]

    def describe(self, name, kommune, orgnr=None):
        """Return orgnr, eierform ('offentlig' / 'privat' / None) and profil for a school."""
        unit = self.find(name, kommune, orgnr)
        eierform = None
        if unit:
            eierform = 'privat' if unit['privat'] else ('offentlig' if unit['offentlig'] else None)
        return {
            'orgnr': unit['orgnr'] if unit else None,
            'eierform': eierform,
            'profil': school_profile(name, eierform),
        }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect the NSR school register cache.')
    parser.add_argument('--refresh', action='store_true', help='download a fresh copy of the register')
    args = parser.parse_args()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    cache = load_cache()
    print(f"{len(cache['schools'])} school units, {len(cache['kommuner'])} kommuner in {CACHE_FILE}")
