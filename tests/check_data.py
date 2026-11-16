"""Sanity checks for the built site data. Prints each problem and exits 1 when there is any.

    python tests/check_data.py

Run in CI and by the nightly refresh (.github/workflows/oppdater-data.yml) before it commits.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://skolekartet.no/'
MIN_SCHOOLS = 2000
BOXES = {                              # (lat, lng) ranges: mainland Norway, and Svalbard (Longyearbyen skole)
    'mainland': ((57.5, 71.5), (4.0, 31.5)),
    'Svalbard': ((74.0, 81.0), (10.0, 35.0)),
}
MAX_LISTED = 20                        # problems of one kind printed before the rest are counted

problems = []


def problem(kind, items):
    items = list(items)
    if not items:
        return
    problems.append(kind)
    print(f'FAIL {kind} ({len(items)}):')
    for item in items[:MAX_LISTED]:
        print(f'  {item}')
    if len(items) > MAX_LISTED:
        print(f'  ... and {len(items) - MAX_LISTED} more')


def load(path):
    try:
        return json.loads((ROOT / path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        problem(f'{path} could not be read', [error])
        return None


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value


def check_schools():
    data = load('static/js/school-data.json')
    if data is None:
        return
    schools = data.get('schools') or []
    if len(schools) <= MIN_SCHOOLS:
        problem('too few schools in school-data.json', [f'{len(schools)} schools, expected more than {MIN_SCHOOLS}'])

    label = lambda s: f"{s.get('name')} ({s.get('kommune')}, {s.get('schoolType')})"
    problem('school without a position inside Norway', [
        f"{label(s)}: lat={s.get('lat')!r} lng={s.get('lng')!r}" for s in schools
        if not (is_number(s.get('lat')) and is_number(s.get('lng'))
                and any(lat[0] <= s['lat'] <= lat[1] and lng[0] <= s['lng'] <= lng[1]
                        and (box == 'mainland' or s.get('kommune') == box)
                        for box, (lat, lng) in BOXES.items()))])

    seen, duplicates = set(), []
    for s in schools:
        key = (s.get('name'), s.get('kommune'), s.get('schoolType'))
        if key in seen:
            duplicates.append(label(s))
        seen.add(key)
    problem('school listed twice (same name, kommune and school type)', duplicates)

    pages = [s['page'] for s in schools if s.get('page')]
    problem('school page missing', [f'{p}.html' for p in pages if not (ROOT / f'{p}.html').is_file()])

    try:
        sitemap = set(re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', (ROOT / 'sitemap.xml').read_text(encoding='utf-8')))
    except OSError as error:
        problem('sitemap.xml could not be read', [error])
        return
    problem('school page not in sitemap.xml', [SITE + p for p in pages if SITE + p not in sitemap])


def is_test(props):
    """A krets marked as test data: a 'test' property, or 'test' as a word in its name."""
    return bool(props.get('test')) or any(
        re.search(r'\btest\b', str(props.get(k) or ''), re.I) for k in ('name', 'SKRETSNAVN', 'skole', 'navn', 'school'))


def check_kretser():
    data = load('static/js/skolekretser.json')
    if data is None:
        return
    kretser, kommuner = data.get('kretser') or [], data.get('kommuner') or {}
    name = lambda k: f"{k.get('name')} ({k.get('kommune')}, {k.get('level')})"
    problem('krets without kommune, level or name',
            [name(k) for k in kretser if not (k.get('kommune') and k.get('level') and k.get('name'))])
    bad_rings = []
    for k in kretser:
        rings = k.get('rings') or []
        if not rings:
            bad_rings.append(f'{name(k)}: no rings')
        for i, ring in enumerate(rings):
            if len(ring) < 4:
                bad_rings.append(f'{name(k)} ring {i}: {len(ring)} points')
            elif ring[0] != ring[-1]:
                bad_rings.append(f'{name(k)} ring {i}: not closed')
    problem('krets with a broken ring', bad_rings)
    problem('kommune with kretser but no entry in "kommuner"',
            sorted({k['kommune'] for k in kretser if k.get('kommune') and k['kommune'] not in kommuner}))
    problem('test krets in skolekretser.json', [name(k) for k in kretser if is_test(k)])

    for path in sorted((ROOT / 'source-data').glob('*.geojson')):
        source = load(path.relative_to(ROOT))
        if source is not None:
            problem(f'test krets in {path.relative_to(ROOT)}',
                    [json.dumps(f.get('properties'), ensure_ascii=False) for f in source.get('features', [])
                     if is_test(f.get('properties') or {})])


def check_school_files():
    broken = []
    for path in sorted((ROOT / 'static/data/skoler').glob('*.json')):
        try:
            json.loads(path.read_text(encoding='utf-8'))
        except ValueError as error:
            broken.append(f'{path.relative_to(ROOT)}: {error}')
    problem('invalid JSON in static/data/skoler', broken)


def check_i18n():
    result = subprocess.run([sys.executable, 'check_i18n.py'], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        problem('check_i18n.py failed', (result.stdout + result.stderr).strip().splitlines())


def main():
    check_schools()
    check_kretser()
    check_school_files()
    check_i18n()
    if problems:
        print(f'\n{len(problems)} check(s) failed')
        sys.exit(1)
    print('All data checks passed')


if __name__ == '__main__':
    main()
