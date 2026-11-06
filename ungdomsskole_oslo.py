"""
Which lower secondary school (ungdomsskole) each primary school (barneskole) in Oslo leads to.

In Oslo the barneskole a pupil belongs to decides the ungdomsskole. Oslo kommune lists this
on the page "Skolekrets ungdomsskole", one line per barneskole, for example
"Ammerud skole: Elever går videre til Apalløkka skole" or "Abildsø skole: Elever fortsetter
på samme skole". Some barneskoler send pupils to two ungdomsskoler; then a boundary map
(PDF or image) is linked.

Data source:
https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-ungdomsskole/
Only school names and the link to the boundary map are read, matched to the schools on the map.

Cached in cached-data/ungdomsskole-oslo.json. Refresh with:
    python ungdomsskole_oslo.py --refresh
"""
import argparse
import datetime
import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

SOURCE_URL = 'https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-ungdomsskole/'
SCHOOL_DATA = Path('static/js/school-data.json')
CACHE_FILE = Path('cached-data/ungdomsskole-oslo.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
# Names written differently on the page than by Udir, and typos on the page
ALIASES = {
    'homlia': 'holmlia',
}
# Words that start with a capital letter but are not school names
NOT_NAMES = {'Elever', 'Går', 'Se', 'PDF', 'JPG'}


def _get(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8', errors='replace')


def _key(name):
    """Same matching as hjertesone.py: 'Nordstrand ungdomsskole' -> 'nordstrand ungdomsskole'."""
    words = re.sub(r'[^\wæøå]+', ' ', name.lower()).split()
    key = ' '.join(w for w in words if w not in {'skole', 'skolen', 'skoler', 'grunnskole', 'barneskole', 'as'})
    return ALIASES.get(key, key)


def _text(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


def lines_on_page(page):
    """[(barneskole, text after the colon, boundary map URL or None)]"""
    start = page.find('Se hvilken ungdomsskole barnet tilhører')
    if start < 0:
        raise ValueError('Fant ikke listen «Se hvilken ungdomsskole barnet tilhører» på siden')
    listing = re.search(r'<ul>(.*?)</ul>', page[start:], re.S).group(1)
    result = []
    for item in re.findall(r'<li>(.*?)</li>', listing, re.S):
        link = re.search(r'href="([^"]+)"', item)
        text = _text(item)
        if ':' not in text:
            continue
        name, rest = text.split(':', 1)
        result.append((name.strip(), rest.strip(), urllib.parse.urljoin(SOURCE_URL, link.group(1)) if link else None))
    return result


def refresh_cache(path=CACHE_FILE):
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    oslo = [s for s in schools if s['kommune'] == 'Oslo' and s.get('orgnr')]
    barne = {_key(s['name']): s for s in oslo if s['schoolType'] == 'barneskole'}
    ungdom = {_key(s['name']): s for s in oslo if s['schoolType'] == 'ungdomsskole'}

    found, unmatched = {}, []
    for name, rest, boundary in lines_on_page(_get(SOURCE_URL)):
        school = barne.get(_key(name))
        if not school:
            unmatched.append(name)
            continue
        same = 'samme skole' in rest.lower()
        if same:
            nxt = [{'name': school['name'], 'orgnr': school['orgnr']}]
        else:
            # "Brynseng og Teglverket skoler" -> ["Brynseng", "Teglverket"]; each name is looked up
            # as "X", "X skole" or "X ungdomsskole" among Oslo's ungdomsskoler
            names = [n for n in re.findall(r'[A-ZÆØÅ][\wæøåé-]*(?: [A-ZÆØÅ][\wæøåé-]*)*', re.split(r'\(|\bSe\b', rest)[0])
                     if n not in NOT_NAMES]
            nxt = []
            for n in names:
                k = _key(n)
                hit = ungdom.get(k) or ungdom.get(f'{k} ungdomsskole')
                entry = {'name': hit['name'] if hit else f'{n} skole', 'orgnr': hit['orgnr'] if hit else None}
                if entry not in nxt:
                    nxt.append(entry)
        if not nxt:
            unmatched.append(f'{name} -> {rest}')
            continue
        missing = [e['name'] for e in nxt if not e['orgnr']]
        if missing:
            unmatched.append(f"{name} -> {', '.join(missing)} (no page on the map)")
        found[school['orgnr']] = {'next': nxt, 'same': same, 'boundaryMap': boundary}

    data = {'source': SOURCE_URL, 'fetched': datetime.date.today().isoformat(),
            'schools': dict(sorted(found.items())), 'unmatched': unmatched}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved next school for {len(found)} barneskoler to {path}")
    if unmatched:
        print(f"  Not matched: {'; '.join(unmatched)}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect which ungdomsskole each Oslo barneskole leads to.')
    parser.add_argument('--refresh', action='store_true', help='download the list from oslo.kommune.no')
    args = parser.parse_args()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    cache = load_cache()
    print(f"{len(cache['schools'])} barneskoler in {CACHE_FILE} (fetched {cache['fetched']})")
