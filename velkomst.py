"""
Groups for newly arrived pupils in Oslo: mottaksgrupper and alfabetiseringsgrupper.

A mottaksgruppe is for pupils who can read and write and have some schooling from abroad.
An alfabetiseringsgruppe (alfagruppe) is for pupils with little or no schooling who have
not learnt to read and write in their own language. The groups are placed at some
schools around Oslo; pupils from other schools in the area can get a place there.

Data source: the lists on Oslo kommune's page "Tilbud til minoritetsspråklige elever"
https://www.oslo.kommune.no/skole-og-utdanning/sprakopplaring/tilbud-til-minoritetsspraklige-elever/
Under the headings "Mottaksgrupper barnetrinn", "Mottaksgrupper ungdomstrinn",
"Alfagrupper barnetrinn" and "Alfagrupper ungdomstrinn". Only the school name, group type,
level and number of places are read. The number of places is the total, not free places.

Cached in cached-data/velkomst.json. Refresh with:
    python velkomst.py --refresh
"""
import argparse
import datetime
import html
import json
import re
import urllib.request
from pathlib import Path

SOURCE_URL = 'https://www.oslo.kommune.no/skole-og-utdanning/sprakopplaring/tilbud-til-minoritetsspraklige-elever/'
SCHOOL_DATA = Path('static/js/school-data.json')
CACHE_FILE = Path('cached-data/velkomst.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
HEADINGS = {
    'mottaksgrupper barnetrinn': ('mottaksgruppe', 'barnetrinn'),
    'mottaksgrupper ungdomstrinn': ('mottaksgruppe', 'ungdomstrinn'),
    'alfagrupper barnetrinn': ('alfabetiseringsgruppe', 'barnetrinn'),
    'alfagrupper ungdomstrinn': ('alfabetiseringsgruppe', 'ungdomstrinn'),
}
# Names the kommune writes differently from Udir
ALIASES = {
    'Bjørnholt skole': 'Bjørnholt ungdomsskole',
    'Fyrstikkalléen skole': 'Fyrstikkalleen skole',
}


def _get(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8', errors='replace')


def _key(name):
    """Same matching as hjertesone.py: 'Fyrstikkalléen skole' -> 'fyrstikkalléen'."""
    words = re.sub(r'[^\wæøå]+', ' ', name.lower()).split()
    return ' '.join(w for w in words if w not in {'skole', 'skolen', 'grunnskole', 'barneskole', 'as'})


def _text(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', fragment))).strip()


def groups_on_page(page):
    """[(name, type, trinn, plasser)] from the four lists on the page."""
    found = []
    for heading, rest in re.findall(r'<h[23][^>]*>(.*?)</h[23]>(.*?)(?=<h[23][^>]*>|$)', page, re.S):
        title = re.sub(r'\s*\(.*\)', '', _text(heading)).lower()
        if title not in HEADINGS:
            continue
        group_type, trinn = HEADINGS[title]
        listing = re.search(r'<ul>(.*?)</ul>', rest, re.S)
        for item in re.findall(r'<li>(.*?)</li>', listing.group(1) if listing else '', re.S):
            match = re.match(r'(.+?)(?:,\s*(\d+)\s*plasser)?$', _text(item))
            name, places = match.group(1).strip(), match.group(2)
            found.append((name, group_type, trinn, int(places) if places else None))
    if not found:
        raise ValueError('Fant ingen lister over mottaks- eller alfagrupper på siden')
    return found


def refresh_cache(path=CACHE_FILE):
    groups = groups_on_page(_get(SOURCE_URL))
    oslo = {}
    for school in json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']:
        if school['kommune'] == 'Oslo' and school.get('orgnr'):
            oslo.setdefault(_key(school['name']), school['orgnr'])

    schools, unmatched = {}, []
    for name, group_type, trinn, places in groups:
        orgnr = oslo.get(_key(ALIASES.get(name, name)))
        if orgnr:
            schools.setdefault(orgnr, []).append({'type': group_type, 'trinn': trinn, 'plasser': places})
        elif name not in unmatched:
            unmatched.append(name)

    data = {'source': SOURCE_URL, 'fetched': datetime.date.today().isoformat(),
            'schools': dict(sorted(schools.items())), 'unmatched': unmatched}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved {len(groups) - sum(1 for g in groups if g[0] in unmatched)} of {len(groups)} groups "
          f"at {len(schools)} schools to {path}")
    if unmatched:
        print(f"  Not on the map: {', '.join(unmatched)}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect the list of newcomer groups in Oslo.')
    parser.add_argument('--refresh', action='store_true', help='download the lists from oslo.kommune.no')
    args = parser.parse_args()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    cache = load_cache()
    print(f"{len(cache['schools'])} schools with newcomer groups in {CACHE_FILE} (fetched {cache['fetched']})")
