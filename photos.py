"""
School photos from Wikimedia Commons, found through Wikidata.

Data sources (open, no key):
- Wikidata SPARQL: schools with a Norwegian organisation number (P2333) and an image (P18)
- Wikimedia Commons API: thumbnail URL, author and licence for each image

Only openly licensed photos are used, and each one is shown with its author,
licence and a link to the file page, as the licences require.

Cached in cached-data/school-photos.json. Refresh with:
    python photos.py --refresh

Galleries (several photos per school, for the school page) come from the school's
Commons category (Wikidata P373). Cached in cached-data/school-galleries.json:
    python photos.py --galleries
"""
import argparse
import html
import http.client
import json
import re
import urllib.parse
import urllib.error
import urllib.request
import time
from pathlib import Path

SPARQL_URL = 'https://query.wikidata.org/sparql'
COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
CACHE_FILE = Path('cached-data/school-photos.json')
GALLERY_FILE = Path('cached-data/school-galleries.json')
GALLERY_SIZE = 8
GALLERY_SKIP = re.compile(r'\b(kart|map|logo|våpen|coat of arms|plan|tegning|drawing|diagram)\b', re.I)
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
THUMB_WIDTH = 640

QUERY = """
SELECT ?item ?orgnr ?image WHERE {
  ?item wdt:P2333 ?orgnr ;
        wdt:P18 ?image ;
        wdt:P31/wdt:P279* wd:Q3914 .
}
"""


def _get_json(url, params, post=False, attempts=3):
    """GET (or POST, for long SPARQL queries) with a few retries for flaky connections."""
    body = urllib.parse.urlencode(params).encode() if post else None
    full_url = url if post else f'{url}?{urllib.parse.urlencode(params)}'
    headers = {'User-Agent': USER_AGENT, 'Accept': 'application/json'}
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(full_url, data=body, headers=headers)
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError) as error:
            if attempt == attempts:
                raise
            print(f"  retry {attempt} after {type(error).__name__}")
            time.sleep(3 * attempt)


def _plain(text):
    """Commons metadata is HTML; keep the visible text only."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', text or ''))).strip()


CATEGORY_QUERY = """
SELECT ?orgnr ?category WHERE {
  ?item wdt:P2333 ?orgnr ;
        wdt:P373 ?category ;
        wdt:P31/wdt:P279* wd:Q3914 .
}
"""


GENERIC_CATEGORY = re.compile(r'^(schools?|skoler|skular|education|buildings|primary schools|secondary schools)\b|\bin (norway|[A-ZÆØÅ][\w-]+,)', re.I)


def is_school_category(category):
    """'Bøler skole' is the school's own category; 'Schools in Tønsberg, Norway' is not."""
    return not GENERIC_CATEGORY.search(category)


def _photo_from(info, title):
    """Credit fields for one Commons file, or None when the licence is unknown."""
    meta = info.get('extmetadata', {})
    license_name = _plain(meta.get('LicenseShortName', {}).get('value'))
    if not license_name:
        return None
    return {
        'thumb': info.get('thumburl') or info.get('url'),
        'page': info.get('descriptionurl'),
        'title': title.split(':', 1)[1].rsplit('.', 1)[0],
        'author': _plain(meta.get('Artist', {}).get('value')) or 'Ukjent',
        'license': license_name,
        'licenseUrl': meta.get('LicenseUrl', {}).get('value'),
    }


def refresh_galleries(path=GALLERY_FILE):
    """Up to GALLERY_SIZE openly licensed photos from each school's Commons category."""
    rows = _get_json(SPARQL_URL, {'query': CATEGORY_QUERY, 'format': 'json'}, post=True)['results']['bindings']
    categories = {}
    for row in rows:
        categories.setdefault(re.sub(r'\D', '', row['orgnr']['value']), row['category']['value'])
    print(f"  Wikidata: {len(categories)} schools with a Commons category")

    galleries = {}
    for done, (orgnr, category) in enumerate(sorted(categories.items()), 1):
        if not is_school_category(category):
            continue  # a category for many schools would show other schools' photos
        try:
            data = _get_json(COMMONS_API, {
                'action': 'query', 'format': 'json', 'generator': 'categorymembers',
                'gcmtitle': f'Category:{category}', 'gcmtype': 'file', 'gcmlimit': 30,
                'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mime', 'iiurlwidth': THUMB_WIDTH,
            })
        except Exception as error:
            print(f"  skipped {category}: {type(error).__name__}")
            continue
        photos = []
        for page in sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p['title']):
            info = (page.get('imageinfo') or [None])[0]
            if not info or info.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'):
                continue
            if GALLERY_SKIP.search(page['title']):
                continue
            photo = _photo_from(info, page['title'])
            if photo:
                photos.append(photo)
            if len(photos) == GALLERY_SIZE:
                break
        if photos:
            galleries[orgnr] = {'category': category, 'photos': photos}
        if done % 50 == 0:
            print(f"  Commons categories {done}/{len(categories)}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(sorted(galleries.items())), ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved galleries for {len(galleries)} schools to {path}")


def load_galleries(path=GALLERY_FILE):
    if not path.exists():
        print(f"{path} not found, downloading from Wikidata/Commons...")
        refresh_galleries(path)
    return json.loads(path.read_text(encoding='utf-8'))


def refresh_cache(path=CACHE_FILE):
    rows = _get_json(SPARQL_URL, {'query': QUERY, 'format': 'json'}, post=True)['results']['bindings']
    by_file = {}
    for row in rows:
        orgnr = re.sub(r'\D', '', row['orgnr']['value'])
        file_name = urllib.parse.unquote(row['image']['value'].rsplit('/', 1)[-1])
        by_file.setdefault(file_name, set()).add((orgnr, row['item']['value'].rsplit('/', 1)[-1]))
    print(f"  Wikidata: {len(rows)} school images, {len(by_file)} files")

    photos = {}
    files = sorted(by_file)
    for start in range(0, len(files), 50):
        batch = files[start:start + 50]
        data = _get_json(COMMONS_API, {
            'action': 'query', 'format': 'json', 'prop': 'imageinfo',
            'iiprop': 'url|extmetadata', 'iiurlwidth': THUMB_WIDTH,
            'titles': '|'.join(f'File:{f}' for f in batch),
        })
        for page in data.get('query', {}).get('pages', {}).values():
            info = (page.get('imageinfo') or [None])[0]
            if not info:
                continue
            meta = info.get('extmetadata', {})
            license_name = _plain(meta.get('LicenseShortName', {}).get('value'))
            if not license_name:
                continue  # without a known licence we cannot credit it properly
            file_name = page['title'].split(':', 1)[1]
            photo = {
                'thumb': info.get('thumburl') or info.get('url'),
                'page': info.get('descriptionurl'),
                'author': _plain(meta.get('Artist', {}).get('value')) or 'Ukjent',
                'license': license_name,
                'licenseUrl': meta.get('LicenseUrl', {}).get('value'),
            }
            for orgnr, item in by_file.get(file_name, by_file.get(file_name.replace(' ', '_'), set())):
                photos.setdefault(orgnr, dict(photo, wikidata=item))
        print(f"  Commons metadata {min(start + 50, len(files))}/{len(files)}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(sorted(photos.items())), ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved {len(photos)} school photos to {path}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading from Wikidata/Commons...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect the school photo cache.')
    parser.add_argument('--refresh', action='store_true', help='download fresh data')
    parser.add_argument('--galleries', action='store_true', help='download fresh galleries from Commons categories')
    args = parser.parse_args()
    if args.galleries:
        refresh_galleries()
        print(f"{len(load_galleries())} school galleries in {GALLERY_FILE}")
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    print(f"{len(load_cache())} school photos in {CACHE_FILE}")
