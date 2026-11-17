"""
More photos for the school galleries: a search on Wikimedia Commons by the school's name, for schools whose
own Commons category (photos.py) gives fewer than GALLERY_SIZE photos.

A search finds more than a category, but it can also find the wrong school (several schools share a name) or
a photo of the area. So the rules are strict, and nothing found here is shown on the site until a person has
approved it on the review page (see README, «Flere bilder»):
- the file's title must contain the school's whole name ("Jordal skole")
- the kommune must be named in the title, the description or the file's categories
- a photo (jpeg, png, webp), not a map, logo, plan or drawing (photos.GALLERY_SKIP)
- an open licence we can credit (photos._photo_from)
- not already in the school's gallery

Data source: the Commons API (generator=search in the File namespace), open, no key. One request a school,
half a second apart, with the generic User-Agent of photos.py. The result is cached in
cached-data/photo-candidates.json, so a new run only asks for schools that were not searched yet.

    python photo_search.py            # search the schools not searched yet
    python photo_search.py --refresh  # search every school again
    python photo_search.py --review   # write review/bilder.html (not published) from the cache

The decisions are kept in cached-data/photo-review.json ({file page: "ok" | "no"}); school_details.py adds the
approved photos after the school's own.
"""
import argparse
import datetime
import html
import json
import re
import time
from pathlib import Path

import photos

CANDIDATES_FILE = Path('cached-data/photo-candidates.json')
REVIEW_FILE = Path('cached-data/photo-review.json')
REVIEW_PAGE = Path('review/bilder.html')
SCHOOL_DATA = Path('static/js/school-data.json')
DETAIL_DIR = Path('static/data/skoler')
DELAY = 0.5


def _norm(text):
    """Lower case, letters and digits only, so "Jordal_skole,_Oslo.jpg" reads "jordal skole oslo jpg"."""
    return re.sub(r'[^0-9a-zæøåäöüé]+', ' ', (text or '').lower()).strip()


def _kommune_names(kommune):
    """«Rana - Raane» counts as either name"""
    return [_norm(part) for part in re.split(r'\s+-\s+|/', kommune) if part.strip()]


def schools():
    """One entry per organisation number: its name, kommune and the photos it has already"""
    found = {}
    for school in json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']:
        orgnr = school.get('orgnr')
        if not orgnr or orgnr in found:
            continue
        detail = DETAIL_DIR / f'{orgnr}.json'
        gallery = json.loads(detail.read_text(encoding='utf-8')).get('gallery', []) if detail.exists() else []
        found[orgnr] = {'name': school['name'], 'kommune': school['kommune'], 'have': [p['page'] for p in gallery]}
    return found


def search(name, kommune, have):
    data = photos._get_json(photos.COMMONS_API, {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': 30,
        'gsrsearch': f'"{name}" {kommune.split(" - ")[0]}',
        'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mime', 'iiurlwidth': photos.THUMB_WIDTH,
    })
    want_name = _norm(name)
    kommuner = _kommune_names(kommune)
    found = []
    for page in sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 0)):
        info = (page.get('imageinfo') or [None])[0]
        title = page['title']
        if not info or info.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'):
            continue
        if photos.GALLERY_SKIP.search(title) or want_name not in _norm(title):
            continue
        meta = info.get('extmetadata', {})
        where = ' '.join(_norm(x) for x in (title, photos._plain(meta.get('ImageDescription', {}).get('value')),
                                            meta.get('Categories', {}).get('value', '').replace('|', ' ')))
        if not any(f' {k} ' in f' {where} ' for k in kommuner):
            continue
        photo = photos._photo_from(info, title)
        if not photo or photo['page'] in have or any(photo['page'] == p['page'] for p in found):
            continue
        found.append(photo)
    return found


def refresh(again=False):
    cache = {} if again or not CANDIDATES_FILE.exists() else json.loads(CANDIDATES_FILE.read_text(encoding='utf-8'))
    todo = {o: s for o, s in schools().items() if o not in cache and len(s['have']) < photos.GALLERY_SIZE}
    print(f'{len(todo)} schools to search on Commons')
    for done, (orgnr, school) in enumerate(sorted(todo.items()), 1):
        try:
            found = search(school['name'], school['kommune'], school['have'])
        except Exception as error:   # one failed school should not stop the run; it is searched next time
            print(f'  {school["name"]}: {type(error).__name__}')
            continue
        cache[orgnr] = {'name': school['name'], 'kommune': school['kommune'],
                        'searched': datetime.date.today().isoformat(), 'candidates': found}
        if done % 50 == 0:
            _save(cache)
            print(f'  {done}/{len(todo)}, {sum(1 for c in cache.values() if c["candidates"])} schools with candidates')
        time.sleep(DELAY)
    _save(cache)
    with_photos = [c for c in cache.values() if c['candidates']]
    print(f'Saved: {sum(len(c["candidates"]) for c in with_photos)} candidates for {len(with_photos)} schools in {CANDIDATES_FILE}')


def _save(cache):
    CANDIDATES_FILE.parent.mkdir(parents=True, exist_ok=True)
    CANDIDATES_FILE.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=0), encoding='utf-8')


def load_candidates():
    return json.loads(CANDIDATES_FILE.read_text(encoding='utf-8')) if CANDIDATES_FILE.exists() else {}


def load_review():
    return json.loads(REVIEW_FILE.read_text(encoding='utf-8')) if REVIEW_FILE.exists() else {}


def approved_photos(orgnr):
    """The candidates a person has approved, in the order they were found"""
    review = load_review()
    return [p for p in load_candidates().get(orgnr, {}).get('candidates', []) if review.get(p['page']) == 'ok']


def write_review_page():
    """review/bilder.html: each school's own photos and its candidates, with «Godkjenn» and «Avvis». The page
    sends the choices to dev_server.py (POST /review/photo-review), which saves cached-data/photo-review.json."""
    known = schools()
    review = load_review()
    rows = []
    for orgnr, entry in sorted(load_candidates().items(), key=lambda kv: (kv[1]['kommune'], kv[1]['name'])):
        if not entry['candidates']:
            continue
        have = known.get(orgnr, {}).get('have', [])
        cards = []
        for p in entry['candidates']:
            state = review.get(p['page'], '')
            cards.append(f'''<figure class="cand" data-page="{html.escape(p['page'])}" data-state="{state}">
                <a href="{html.escape(p['page'])}" target="_blank" rel="noopener"><img src="{html.escape(p['thumb'])}" alt="" loading="lazy"></a>
                <figcaption><strong>{html.escape(p['title'])}</strong><br>{html.escape(p['author'])} · {html.escape(p['license'])}</figcaption>
                <div class="act"><button type="button" data-set="ok">Godkjenn</button><button type="button" data-set="no">Avvis</button></div>
            </figure>''')
        rows.append(f'''<section><h2>{html.escape(entry['name'])} <small>{html.escape(entry['kommune'])} · {len(have)} bilde(r) fra før</small></h2>
            <div class="grid">{''.join(cards)}</div></section>''')
    REVIEW_PAGE.parent.mkdir(parents=True, exist_ok=True)
    REVIEW_PAGE.write_text(f'''<!doctype html>
<html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Bilder til godkjenning</title>
<style>
body {{ font: 16px/1.5 system-ui, sans-serif; margin: 24px; color: #222; }}
.bar {{ position: sticky; top: 0; background: #fff; padding: 8px 0; border-bottom: 1px solid #ccc; z-index: 1; }}
section {{ margin: 24px 0; }} h2 {{ font-size: 1.2rem; margin: 0 0 8px; }} small {{ font-weight: 400; color: #666; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }}
.cand {{ margin: 0; border: 3px solid #ddd; border-radius: 8px; padding: 8px; }}
.cand[data-state="ok"] {{ border-color: #0d7a5f; background: #e6f3ee; }} .cand[data-state="no"] {{ border-color: #b3261e; opacity: .55; }}
.cand img {{ width: 100%; height: 160px; object-fit: cover; border-radius: 4px; }} figcaption {{ font-size: .85rem; overflow-wrap: anywhere; }}
.act {{ display: flex; gap: 8px; margin-top: 6px; }} .act button {{ flex: 1; padding: 6px; cursor: pointer; }}
</style></head><body>
<div class="bar"><strong>Bilder fra søk på Wikimedia Commons</strong> – godkjenn bare bilder som viser denne skolen.
Valgene lagres med en gang i cached-data/photo-review.json. <span id="status" role="status"></span></div>
{''.join(rows) or '<p>Ingen kandidater.</p>'}
<script>
document.addEventListener('click', async event => {{
    const button = event.target.closest('[data-set]');
    if (!button) return;
    const card = button.closest('.cand');
    const value = card.dataset.state === button.dataset.set ? '' : button.dataset.set;
    const response = await fetch('/review/photo-review', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ page: card.dataset.page, value }}) }});
    if (response.ok) card.dataset.state = value;
    document.getElementById('status').textContent = response.ok ? 'Lagret.' : 'Kunne ikke lagre – kjører dev_server.py?';
}});
</script></body></html>
''', encoding='utf-8')
    print(f'Wrote {REVIEW_PAGE} ({len(rows)} schools). Open http://localhost:8000/review/bilder.html with dev_server.py running.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true', help='search every school again')
    parser.add_argument('--review', action='store_true', help='only write the review page from the cache')
    args = parser.parse_args()
    if not args.review:
        refresh(args.refresh)
    write_review_page()
