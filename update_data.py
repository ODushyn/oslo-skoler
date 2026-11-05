"""
Daily data refresh. Run by .github/workflows/oppdater-data.yml every night, or by hand:
    python update_data.py            # check the sources, rebuild only when something changed
    python update_data.py --rebuild  # rebuild the site data even when nothing changed

Checks the open sources whose numbers can change during the school year:
- Udir's statistics API (Elevundersøkelsen: trivsel, mobbing and the other indicators, NLOD).
  Udir lists when each table was last updated ("OppdatertDatoTid"); the tables are downloaded
  again only when that date is newer than at the last check, so Udir is not asked for the full
  tables every day.
- Nasjonalt skoleregister (NSR, NLOD): downloaded every day. It is small and changes often
  (new and closed schools, owner type).
When a source has changed, create_map.py and school_details.py rebuild the site data, and site_pages.py
the pages for search engines under skoler/ and sitemap.xml.

Nasjonale prøver are not in Udir's open API. They are published once a year and imported by hand
with import_exam_result.py (see README).

Writes static/js/data-status.json: the day all sources were last checked and the day each source
last changed. The footer shows the check date. If a source cannot be reached, the old data is
kept, the check date is not moved, and the script exits with an error so the workflow shows it.
"""
import argparse
import datetime
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

UDIR_TABLES = 'https://api.statistikkbanken.udir.no/api/rest/v2/Eksport'
ELEVUNDERSOKELSEN_TABLES = (148, 150)   # EUG - Indikator, EUG - Mobbing
NSR_CACHE = Path('cached-data/nsr-skoler.json')
STATUS_FILE = Path('static/js/data-status.json')
USER_AGENT = 'skolekartet.no data refresh'


def run(*args):
    print(f"$ python {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, *args], check=True)


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def udir_updated():
    """The newest "OppdatertDatoTid" of the Elevundersøkelsen tables, as listed by Udir."""
    request = urllib.request.Request(UDIR_TABLES, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        tables = json.load(response)
    dates = [t['OppdatertDatoTid'] for t in tables if t['EksportID'] in ELEVUNDERSOKELSEN_TABLES]
    if len(dates) != len(ELEVUNDERSOKELSEN_TABLES):
        raise RuntimeError('Udir no longer lists the Elevundersøkelsen tables')
    return max(dates)


def main():
    parser = argparse.ArgumentParser(description='Check the open sources and rebuild the site data when they change.')
    parser.add_argument('--rebuild', action='store_true', help='rebuild the site data even when nothing changed')
    args = parser.parse_args()

    today = datetime.date.today().isoformat()
    status = json.loads(STATUS_FILE.read_text(encoding='utf-8')) if STATUS_FILE.exists() else {}
    sources = status.setdefault('sources', {})
    changed, failed = [], []

    try:
        updated = udir_updated()
        if updated != sources.get('elevundersokelsenUdir'):
            run('elevundersokelsen.py', '--refresh', '--indicators')
            sources['elevundersokelsenUdir'] = updated
            sources['elevundersokelsen'] = updated[:10]
            changed.append('Elevundersøkelsen')
    except Exception as error:  # keep the old data, report below
        failed.append(f'Elevundersøkelsen: {error}')

    try:
        before = file_hash(NSR_CACHE)
        run('nsr.py', '--refresh')
        if file_hash(NSR_CACHE) != before:
            sources['nsr'] = today
            changed.append('NSR')
    except Exception as error:
        failed.append(f'NSR: {error}')

    if changed or args.rebuild:
        run('create_map.py')
        run('school_details.py')
        run('site_pages.py')

    if not failed:
        status['checked'] = today
    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    print(f"Changed: {', '.join(changed) or 'nothing'}")
    if failed:
        print('Could not check: ' + '; '.join(failed), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
