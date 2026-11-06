"""
Trivsel (well-being) per school from Udir's Elevundersøkelsen.

Data source (open, no key): Udir statistikkbanken API, table 148 "EUG - Indikator"
(Elevundersøkelsen for grunnskole), Norsk lisens for offentlige data (NLOD).
https://api.statistikkbanken.udir.no/api/rest/v2/Eksport/148/data

Trivsel is the average answer to "Trives du på skolen?" on a scale from 1 to 5.
We keep 7. trinn (shown for barneskole) and 10. trinn (shown for ungdomsskole).
Results for small groups are hidden by Udir ("*") and stored as missing.

Mobbing (bullying) comes from table 150 "EUG - Mobbing", indicator "Mobbing på skolen":
the share of pupils (percent) who say they have been bullied two or three times a month
or more in recent months, by other pupils, digitally or by adults at school.
https://api.statistikkbanken.udir.no/api/rest/v2/Eksport/150/data

All indicators of table 148 for the three newest school years (`--indicators`): Trivsel, Støtte fra
lærerne, Mestring, Motivasjon, Vurdering for læring, Læringskultur, Elevdemokrati og medvirkning,
plus Mobbing from table 150. For each school, its kommune ("Alle skoler" in the kommune,
EnhetNivaa 3) and the whole country. Values hidden by Udir are stored as null, so the page can
show "*". Cached in cached-data/elevundersokelsen-indikatorer.json.

Cached in cached-data/trivsel.json and cached-data/mobbing.json. Refresh with:
    python elevundersokelsen.py --refresh
    python elevundersokelsen.py --indicators
"""
import argparse
import json
import urllib.request
from pathlib import Path

API = 'https://api.statistikkbanken.udir.no/api/rest/v2/Eksport/148'
TRIVSEL_ID = -35          # SpoersmaalID for the Trivsel indicator
TRINN_IDS = {'7': 6, '10': 9}
CACHE_FILE = Path('cached-data/trivsel.json')
MOBBING_API = 'https://api.statistikkbanken.udir.no/api/rest/v2/Eksport/150'
MOBBING_ID = -50          # SpoersmaalID for the "Mobbing på skolen" indicator
MOBBING_FILE = Path('cached-data/mobbing.json')
HISTORY_FILE = Path('cached-data/elevundersokelsen-history.json')
# indicator -> (table, SpoersmaalID, value column)
INDICATORS = {
    'trivsel': (API, TRIVSEL_ID, 'Score'),
    'mobbing': (MOBBING_API, MOBBING_ID, 'AndelMobbet'),
}
USER_AGENT = 'skolekartet.no data refresh'
INDICATORS_FILE = Path('cached-data/elevundersokelsen-indikatorer.json')
# key -> (table, SpoersmaalID, value column, label); the order is the order on the school page
ALL_INDICATORS = {
    'trivsel': (API, -35, 'Score', 'Trivsel'),
    'stotte': (API, -36, 'Score', 'Støtte fra lærerne'),
    'mestring': (API, -40, 'Score', 'Mestring'),
    'motivasjon': (API, -41, 'Score', 'Motivasjon'),
    'vurdering': (API, -38, 'Score', 'Vurdering for læring'),
    'laeringskultur': (API, -39, 'Score', 'Læringskultur'),
    'elevdemokrati': (API, -42, 'Score', 'Elevdemokrati og medvirkning'),
    'mobbing': (MOBBING_API, MOBBING_ID, 'AndelMobbet', 'Mobbing'),
}
YEARS_SHOWN = 3


def _fetch_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def _number(text):
    try:
        return float(str(text).replace(',', '.'))
    except (TypeError, ValueError):
        return None


def refresh_cache(path=CACHE_FILE):
    """Download Trivsel for 7. and 10. trinn, newest school year, all schools."""
    years = _fetch_json(f'{API}/filterVerdier')['TidID']
    latest = max(years, key=lambda y: y['id'])
    trinn = '_'.join(str(i) for i in TRINN_IDS.values())
    query = (f'TidID({latest["id"]})_SpoersmaalID({TRIVSEL_ID})_TrinnID({trinn})'
             f'_EierformID(-10)_KjoennID(-10)')
    rows = _fetch_json(f'{API}/data?filter={query}&format=0')

    schools = {}
    for row in rows:
        if row.get('EnhetNivaa') != 4 or not row.get('Organisasjonsnummer'):
            continue
        entry = schools.setdefault(row['Organisasjonsnummer'], {})
        entry[row['TrinnKode']] = {
            'score': _number(row.get('Score')),       # None when hidden by Udir
            'answers': _number(row.get('AntallBesvart')),
        }

    data = {'year': latest['navn'], 'schools': dict(sorted(schools.items()))}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    with_score = sum(1 for s in schools.values() for t in s.values() if t['score'] is not None)
    print(f"  Saved Trivsel {latest['navn']} for {len(schools)} schools ({with_score} grade results) to {path}")


def refresh_mobbing(path=MOBBING_FILE):
    """Share of pupils bullied, 7. and 10. trinn, newest school year, all schools and the national level."""
    years = _fetch_json(f'{MOBBING_API}/filterVerdier')['TidID']
    latest = max(years, key=lambda y: y['id'])
    trinn = '_'.join(str(i) for i in TRINN_IDS.values())
    query = (f'TidID({latest["id"]})_SpoersmaalID({MOBBING_ID})_TrinnID({trinn})'
             f'_EierformID(-10)_KjoennID(-10)')
    rows = _fetch_json(f'{MOBBING_API}/data?filter={query}&format=0')

    schools, national = {}, {}
    for row in rows:
        share = _number(row.get('AndelMobbet'))        # None when hidden by Udir ("*")
        if row.get('EnhetNivaa') == 1 and row.get('Nasjonaltkode') == 'I':
            national[row['TrinnKode']] = share
        elif row.get('EnhetNivaa') == 4 and row.get('Organisasjonsnummer'):
            schools.setdefault(row['Organisasjonsnummer'], {})[row['TrinnKode']] = share

    data = {'year': latest['navn'], 'national': national, 'schools': dict(sorted(schools.items()))}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    with_share = sum(1 for s in schools.values() for v in s.values() if v is not None)
    print(f"  Saved Mobbing {latest['navn']} for {len(schools)} schools ({with_share} grade results) to {path}")


def refresh_history(path=HISTORY_FILE):
    """Every school year of Trivsel and Mobbing, per school and for the whole country.

    Shape: {indicator: {'national': {trinn: {year: value}}, 'schools': {orgnr: {trinn: {year: value}}}}}
    Used by the school page to show each indicator over time.
    """
    trinn = '_'.join(str(i) for i in TRINN_IDS.values())
    history = {}
    for name, (api, question, column) in INDICATORS.items():
        years = sorted(_fetch_json(f'{api}/filterVerdier')['TidID'], key=lambda y: y['id'])
        national, schools = {}, {}
        for year in years:
            query = f'TidID({year["id"]})_SpoersmaalID({question})_TrinnID({trinn})_EierformID(-10)_KjoennID(-10)'
            for row in _fetch_json(f'{api}/data?filter={query}&format=0'):
                value = _number(row.get(column))
                if value is None:
                    continue
                if row.get('EnhetNivaa') == 1 and row.get('Nasjonaltkode') == 'I':
                    national.setdefault(row['TrinnKode'], {})[year['navn']] = value
                elif row.get('EnhetNivaa') == 4 and row.get('Organisasjonsnummer'):
                    schools.setdefault(row['Organisasjonsnummer'], {}).setdefault(row['TrinnKode'], {})[year['navn']] = value
            print(f"  {name} {year['navn']}: {sum(1 for s in schools.values() for t in s.values() if year['navn'] in t)} school results")
        history[name] = {'national': national, 'schools': dict(sorted(schools.items()))}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"  Saved Trivsel and Mobbing history to {path}")


def load_history(path=HISTORY_FILE):
    if not path.exists():
        print(f"{path} not found, downloading from Udir...")
        refresh_history(path)
    return json.loads(path.read_text(encoding='utf-8'))


def history_for(history, orgnr):
    """{'trivsel': {'7': [{'year', 'value', 'national'}...], '10': [...]}, 'mobbing': {...}} for one school."""
    result = {}
    for name, data in history.items():
        per_trinn = {}
        for trinn, years in data['schools'].get(orgnr, {}).items():
            national = data['national'].get(trinn, {})
            per_trinn[trinn] = [{'year': y, 'value': v, 'national': national.get(y)} for y, v in sorted(years.items())]
        if per_trinn:
            result[name] = per_trinn
    return result


def refresh_indicators(path=INDICATORS_FILE):
    """Every indicator, three newest years, 7. and 10. trinn: schools, kommuner and the whole country.

    Shape: {'years': [...], 'labels': {key: label},
            'national': {key: {trinn: {year: value}}},
            'kommuner': {kommunekode: {'name': ..., key: {trinn: {year: value}}}},
            'schools': {orgnr: {'kommune': kommunekode, key: {trinn: {year: [value, answers]}}}}}
    """
    trinn = '_'.join(str(i) for i in TRINN_IDS.values())
    data = {'years': [], 'labels': {k: v[3] for k, v in ALL_INDICATORS.items()},
            'national': {}, 'kommuner': {}, 'schools': {}}
    years_by_table = {}
    for key, (api, question, column, _) in ALL_INDICATORS.items():
        if api not in years_by_table:
            years_by_table[api] = sorted(_fetch_json(f'{api}/filterVerdier')['TidID'], key=lambda y: y['id'])[-YEARS_SHOWN:]
        for year in years_by_table[api]:
            name = year['navn']
            query = f'TidID({year["id"]})_SpoersmaalID({question})_TrinnID({trinn})_EierformID(-10)_KjoennID(-10)'
            for row in _fetch_json(f'{api}/data?filter={query}&format=0'):
                value, level, grade = _number(row.get(column)), row.get('EnhetNivaa'), row['TrinnKode']
                if level == 1 and row.get('Nasjonaltkode') == 'I':
                    data['national'].setdefault(key, {}).setdefault(grade, {})[name] = value
                elif level == 3 and row.get('Kommunekode'):
                    kommune = data['kommuner'].setdefault(row['Kommunekode'], {'name': row.get('Kommune', '').strip()})
                    kommune.setdefault(key, {}).setdefault(grade, {})[name] = value
                elif level == 4 and row.get('Organisasjonsnummer'):
                    school = data['schools'].setdefault(row['Organisasjonsnummer'], {'kommune': row.get('Kommunekode')})
                    # In table 150 AntallBesvart counts the bullied pupils, not the answers, so it is not kept
                    answers = _number(str(row.get('AntallBesvart') or '').replace(' ', '').replace('\xa0', '')) \
                        if column == 'Score' else None
                    school.setdefault(key, {}).setdefault(grade, {})[name] = [value, int(answers) if answers else None]
            print(f"  {key} {name}: {sum(1 for s in data['schools'].values() if name in s.get(key, {}).get('7', {}) or name in s.get(key, {}).get('10', {}))} schools")
            if name not in data['years']:
                data['years'].append(name)
    data['years'].sort()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"  Saved {len(ALL_INDICATORS)} indicators for {len(data['schools'])} schools to {path}")


def load_indicators(path=INDICATORS_FILE):
    if not path.exists():
        print(f"{path} not found, downloading from Udir...")
        refresh_indicators(path)
    return json.loads(path.read_text(encoding='utf-8'))


def indicators_for(cache, orgnr):
    """All indicators for one school, with its kommune and the country, newest years only.

    {'years': [...], 'kommune': name, 'rows': {key: {trinn: [{'year', 'value', 'answers', 'kommune', 'national'}]}}}
    A year missing for the school is left out; a year hidden by Udir has value None.
    """
    school = cache['schools'].get(orgnr)
    if not school:
        return None
    kommune = cache['kommuner'].get(school.get('kommune'), {})
    rows = {}
    for key in ALL_INDICATORS:
        for grade, years in school.get(key, {}).items():
            rows.setdefault(key, {})[grade] = [{
                'year': year, 'value': value, 'answers': answers,
                'kommune': kommune.get(key, {}).get(grade, {}).get(year),
                'national': cache['national'].get(key, {}).get(grade, {}).get(year),
            } for year, (value, answers) in sorted(years.items())]
    return {'years': cache['years'], 'kommune': kommune.get('name'), 'labels': cache['labels'], 'rows': rows}


def load_mobbing(path=MOBBING_FILE):
    if not path.exists():
        print(f"{path} not found, downloading from Udir...")
        refresh_mobbing(path)
    return json.loads(path.read_text(encoding='utf-8'))


def mobbing_for(cache, orgnr, school_type):
    """Share bullied (percent): 7. trinn for barneskole, 10. trinn for ungdomsskole."""
    if not orgnr:
        return None
    trinn = '7' if school_type == 'barneskole' else '10'
    share = cache['schools'].get(orgnr, {}).get(trinn)
    if share is None:
        return None
    return {'share': share, 'trinn': trinn, 'year': cache['year'], 'national': cache['national'].get(trinn)}


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading from Udir...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


def trivsel_for(cache, orgnr, school_type):
    """Trivsel for a school entry: 7. trinn for barneskole, 10. trinn for ungdomsskole."""
    if not orgnr:
        return None
    trinn = '7' if school_type == 'barneskole' else '10'
    result = cache['schools'].get(orgnr, {}).get(trinn)
    if not result or result['score'] is None:
        return None
    return {'score': result['score'], 'trinn': trinn, 'year': cache['year'],
            'answers': int(result['answers']) if result['answers'] else None}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect the Trivsel cache.')
    parser.add_argument('--refresh', action='store_true', help='download fresh data from Udir')
    parser.add_argument('--indicators', action='store_true', help='download all indicators, three newest years')
    args = parser.parse_args()
    if args.indicators or not INDICATORS_FILE.exists():
        refresh_indicators()
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    if args.refresh or not MOBBING_FILE.exists():
        refresh_mobbing()
    if args.refresh or not HISTORY_FILE.exists():
        refresh_history()
    cache = load_cache()
    print(f"Trivsel {cache['year']}: {len(cache['schools'])} schools in {CACHE_FILE}")
