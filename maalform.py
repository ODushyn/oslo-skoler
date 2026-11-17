"""
Målform (bokmål or nynorsk) for every school on the map, for the filter on the front page.

Data source: Nasjonalt skoleregister (NSR, Udir, Norsk lisens for offentlige data, NLOD),
one unit at a time: https://data-nsr.udir.no/v4/enhet/<orgnr> ("Maalform"). The list endpoint
(/v4/enheter) does not have it, so each school is asked once and the answer is cached in
cached-data/maalform.json; later runs only ask for schools that are not in the cache yet.

    python maalform.py            # fetch the schools missing from the cache
    python maalform.py --refresh  # ask NSR again for every school

create_map.py reads the cache and puts "maalform" on each school in static/js/school-data.json.
"""
import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

NSR_URL = 'https://data-nsr.udir.no/v4/enhet/'
USER_AGENT = 'skolekartet.no data refresh'
CACHE_FILE = Path('cached-data/maalform.json')
SCHOOL_DATA = Path('static/js/school-data.json')
DELAY = 0.2   # seconds between requests, so NSR is not asked too fast


def load_cache(path=CACHE_FILE):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding='utf-8'))


def _fetch(orgnr):
    request = urllib.request.Request(NSR_URL + orgnr, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        unit = json.load(response)
    return (unit.get('Maalform') or {}).get('Navn')


def refresh(all_again=False, path=CACHE_FILE):
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    orgnrs = sorted({s['orgnr'] for s in schools if s.get('orgnr')})
    cache = {} if all_again else load_cache(path)
    todo = [o for o in orgnrs if o not in cache]
    print(f'{len(orgnrs)} schools, {len(todo)} to ask NSR for')
    for i, orgnr in enumerate(todo, 1):
        try:
            cache[orgnr] = _fetch(orgnr)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            print(f'  {orgnr}: {error}')
            continue
        if i % 100 == 0:
            print(f'  {i}/{len(todo)}')
            path.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=0), encoding='utf-8')
        time.sleep(DELAY)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=0), encoding='utf-8')
    counts = {}
    for value in cache.values():
        counts[value] = counts.get(value, 0) + 1
    print(f'Saved {len(cache)} schools to {path}: {counts}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true', help='ask NSR again for every school')
    refresh(parser.parse_args().refresh)
