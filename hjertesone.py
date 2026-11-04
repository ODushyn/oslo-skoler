"""
Hjertesone schools in Oslo: schools in Oslo kommune's programme for a safer way to school.

A hjertesone ("heart zone") is a car-free zone around the school where parents are asked
not to drive their children to the door. The school, its FAU, Oslo kommune
(Bymiljøetaten) and Trygg Trafikk run it together.

Data source: the list "Hjertesoneskoler i Oslo" on
https://www.oslo.kommune.no/prosjekter/hjertesone-tryggere-skolevei/
Only school names are read from the page, then matched to the schools on the map.

Cached in cached-data/hjertesone.json. Refresh with:
    python hjertesone.py --refresh
"""
import argparse
import datetime
import html
import json
import re
import urllib.request
from pathlib import Path

SOURCE_URL = 'https://www.oslo.kommune.no/prosjekter/hjertesone-tryggere-skolevei/'
SCHOOL_DATA = Path('static/js/school-data.json')
CACHE_FILE = Path('cached-data/hjertesone.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
# Schools the kommune lists under a shorter name than Udir uses
ALIASES = {
    'Den franske skole': 'Lycee Francais Rene Cassin Doslo',
    'Den tyske skole': 'Stiftelsen Den Tysk-Norske skolen i Oslo avd grunnskole og videregående',
    'Montessori Lyse skole': 'Stiftelsen montessoriskolen Lyse',
    'St. Sunniva skole': 'St Sunniva skole avd Undervisning',
}


def _get(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8', errors='replace')


def _key(name):
    """'St. Sunniva skole' and 'St. Sunniva Skole' -> 'st sunniva'."""
    words = re.sub(r'[^\wæøå]+', ' ', name.lower()).split()
    return ' '.join(w for w in words if w not in {'skole', 'skolen', 'grunnskole', 'barneskole', 'as'})


def names_on_page(page):
    """School names in the list right after the heading 'Hjertesoneskoler i Oslo'."""
    start = page.find('Hjertesoneskoler i Oslo')
    if start < 0:
        raise ValueError('Fant ikke listen "Hjertesoneskoler i Oslo" på siden')
    listing = re.search(r'<ul>(.*?)</ul>', page[start:], re.S)
    return [html.unescape(re.sub(r'<[^>]+>', '', item)).strip() for item in re.findall(r'<li>(.*?)</li>', listing.group(1), re.S)]


def refresh_cache(path=CACHE_FILE):
    names = names_on_page(_get(SOURCE_URL))
    oslo = {}
    for school in json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']:
        if school['kommune'] == 'Oslo' and school.get('orgnr'):
            oslo.setdefault(_key(school['name']), school['orgnr'])

    schools, unmatched = {}, []
    for name in names:
        orgnr = oslo.get(_key(ALIASES.get(name, name)))
        if orgnr:
            schools[orgnr] = name
        else:
            unmatched.append(name)

    data = {'source': SOURCE_URL, 'fetched': datetime.date.today().isoformat(),
            'schools': dict(sorted(schools.items())), 'unmatched': unmatched}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved {len(schools)} of {len(names)} hjertesone schools to {path}")
    if unmatched:
        print(f"  Not on the map: {', '.join(unmatched)}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect the hjertesone cache.')
    parser.add_argument('--refresh', action='store_true', help='download the list from oslo.kommune.no')
    args = parser.parse_args()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    cache = load_cache()
    print(f"{len(cache['schools'])} hjertesone schools in {CACHE_FILE} (fetched {cache['fetched']})")
