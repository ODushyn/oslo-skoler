"""
Teacher density, pupil numbers and forsterket opplæring i norsk per school, from GSI.

GSI (Grunnskolens informasjonssystem) counts every grunnskole on 1 October each year. Udir publishes
the numbers in its statistics portal without login (open statistics, Norsk lisens for offentlige
data, NLOD). Small numbers are hidden by Udir ("*") and stored as missing. Two reports are used:

- «Lærertetthet» (GSK_Laerertetthet): lærertetthet i ordinær undervisning, that is pupils per
  teacher in ordinary teaching, for 1.-4., 5.-7. and 8.-10. trinn.
  https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/tall-for-larertetthet-i-grunnskolen/
- «Elever og skoler» (GSK_Elev_Skol): number of pupils, and number of pupils with
  forsterket opplæring i norsk (særskilt norskopplæring). We store the share in percent.
  https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/tall-om-elever-og-skoler/

For each school (organisation number), its kommune and the whole country, every school year since
2014-15. Cached in cached-data/gsi.json. Refresh with:
    python gsi.py --refresh
"""
import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

API = 'https://statistikkportalen.udir.no/api/rapportering/rest/v1/Statistikk/GSK/GSI/'
LAERERTETTHET = '2/4'
ELEVER = '1/8'
TRINN_GROUPS = {15: '1-4', 16: '5-7', 14: '8-10'}   # TrinnGruppeID in «Lærertetthet»
CACHE_FILE = Path('cached-data/gsi.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
SOURCE_URL = 'https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/tall-for-larertetthet-i-grunnskolen/'


def _fetch_json(path, **params):
    url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.load(response)


def _number(text):
    try:
        return float(str(text).replace(' ', '').replace(' ', '').replace(',', '.'))
    except (TypeError, ValueError):
        return None


def _units(table):
    """Udir's internal school id -> organisation number, and the school years in the report."""
    values = _fetch_json(f'{table}/filterVerdier')
    schools = {str(u['id']): u['kode'] for u in values['EnhetID'] if u.get('nivaa') == 4 and str(u['kode']).isdigit()}
    return schools, [y['id'] for y in values['TidID']]


def _rows(table, year, rest, schools):
    """(kind, key, values): the row path is national.fylke.kommune.school; kommuner by name."""
    data = _fetch_json(f'{table}/data', radSti='**', filter=f'EnhetID(-12)_{rest}_TidID({year})')
    for row in data['rows']:
        depth = row['id'].count('.')
        if depth == 0:
            yield 'national', None, row['data']
        elif depth == 2:
            yield 'kommune', row['navn'].strip(), row['data']
        elif depth == 3 and row['id'].split('.')[-1] in schools:
            yield 'school', schools[row['id'].split('.')[-1]], row['data']


def _put(result, kind, code, key, year, value):
    if value is None:
        return
    target = result['national'] if kind == 'national' else result[f'{kind}s'].setdefault(code, {})
    target.setdefault(key, {})[year] = value


def refresh_cache(path=CACHE_FILE):
    result = {'source': 'Utdanningsdirektoratet, Grunnskolens informasjonssystem (GSI), NLOD',
              'sourceUrl': SOURCE_URL, 'national': {}, 'kommunes': {}, 'schools': {}}

    schools, years = _units(LAERERTETTHET)
    trinn = '_'.join(str(t) for t in TRINN_GROUPS)
    for year in sorted(years):
        name = f'{str(year)[:4]}-{str(int(str(year)[:4]) + 1)[2:]}'
        for kind, code, values in _rows(LAERERTETTHET, year, f'KommunalitetID(-10)_SpoersmaalID(4)_TrinnGruppeID({trinn})', schools):
            density = {group: _number(v) for group, v in zip(TRINN_GROUPS.values(), values) if _number(v) is not None}
            _put(result, kind, code, 'laerertetthet', name, density or None)
        print(f'Lærertetthet {name}')

    schools, years = _units(ELEVER)
    for year in sorted(years):
        name = f'{str(year)[:4]}-{str(int(str(year)[:4]) + 1)[2:]}'
        # Columns in order: Antall elever, Antall elever med forsterket opplæring i norsk
        for kind, code, values in _rows(ELEVER, year, 'KjoennID(-10)_KommunalitetID(-10)_SpoersmaalID(1_3)_TrinnID(-10)', schools):
            pupils, norsk = (_number(v) for v in values[:2])
            _put(result, kind, code, 'elever', name, int(pupils) if pupils else None)
            if pupils and norsk is not None:
                _put(result, kind, code, 'norsk', name, round(100 * norsk / pupils, 1))
        print(f'Elever {name}')

    path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Saved GSI numbers for {len(result['schools'])} schools to {path} ({path.stat().st_size // 1024} kB)")
    return result


def load_cache(path=CACHE_FILE):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


# Which trinn group each school type shows: barneskole 1.-7. trinn (both groups), ungdomsskole 8.-10.
GROUPS_FOR = {'barneskole': ('1-4', '5-7'), 'ungdomsskole': ('8-10',)}


def latest_for(cache, orgnr, school_type):
    """Newest values for the map: lærertetthet for the school type's trinn (the highest group shown,
    so 5.-7. for barneskole), share with forsterket norsk, and the pupil count, with the school year."""
    school = (cache or {}).get('schools', {}).get(str(orgnr))
    if not school:
        return None
    out = {}
    density = school.get('laerertetthet') or {}
    for year in sorted(density, reverse=True):
        values = [density[year].get(g) for g in GROUPS_FOR.get(school_type, ())]
        values = [v for v in values if v is not None]
        if values:
            out['laerertetthet'] = values[-1]
            out['laerertetthetYear'] = year
            break
    for key in ('norsk', 'elever'):
        series = school.get(key) or {}
        if series:
            year = max(series)
            out[key] = series[year]
            out[key + 'Year'] = year
    return out or None


def history_for(cache, orgnr, kommune):
    """Every school year for the school page, with its kommune and the whole country beside it.

    {'kommune': name, 'rows': [{'year', 'laerertetthet': {group: value}, 'elever', 'norsk',
     'kommune': {...same keys}, 'national': {...same keys}}], 'source', 'sourceUrl'}
    """
    school = (cache or {}).get('schools', {}).get(str(orgnr))
    if not school:
        return None
    area = cache['kommunes'].get(kommune, {})
    pick = lambda unit, year: {k: unit.get(k, {}).get(year) for k in ('laerertetthet', 'elever', 'norsk')}
    years = sorted({y for k in ('laerertetthet', 'elever', 'norsk') for y in school.get(k, {})})
    return {'kommune': kommune if area else None, 'source': cache['source'], 'sourceUrl': cache['sourceUrl'],
            'rows': [dict(pick(school, y), year=y, kommune=pick(area, y) if area else None,
                          national=pick(cache['national'], y)) for y in years]}


def main():
    parser = argparse.ArgumentParser(description='GSI numbers per school from Udir.')
    parser.add_argument('--refresh', action='store_true', help='download again from Udir')
    args = parser.parse_args()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    cache = load_cache()
    print(json.dumps(cache['national'], ensure_ascii=False)[:600])


if __name__ == '__main__':
    main()
