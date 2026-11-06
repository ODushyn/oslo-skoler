"""
Per-school detail files for the school page: static/data/skoler/<orgnr>.json

The map loads static/js/school-data.json, which holds what every marker and list card
needs. Details that only the school page shows (photo gallery, website, social links,
AKS links, hjertesone, groups for newly arrived pupils, sports facilities, læringsbrett links) live in one small file per school, so the map stays light and the school
page loads only its own data. No server or database is needed: the data changes when
the build scripts run, not when visitors use the site.

Inputs (run these first, all cached in cached-data/):
    python photos.py --refresh --galleries   # Wikimedia Commons photos (open licences)
    python school_links.py --refresh         # NSR website, own Facebook/Instagram, Oslo AKS links
    python school_links.py --contacts        # email and phone from Enhetsregisteret
    python elevundersokelsen.py --refresh    # Trivsel and Mobbing for every school year
    python elevundersokelsen.py --indicators # all indicators, three newest years, with kommune and country
    python hjertesone.py --refresh           # Oslo kommune's list of hjertesone schools
    python velkomst.py --refresh             # Oslo kommune's mottaks- and alfabetiseringsgrupper
    python ungdomsskole_oslo.py --refresh    # which ungdomsskole each Oslo barneskole leads to
    python anlegg.py --refresh               # pool, football pitch and hall near the school (OpenStreetMap)
    python school_links.py --devices         # links about læringsbrett on the school's front page
    python aks_mat.py --refresh              # food facts from the AKS "Mat" page (Oslo)
Then:
    python school_details.py
"""
import datetime
import json
import re
import urllib.parse
from pathlib import Path

import aks_mat
import anlegg
import hjertesone
import elevundersokelsen
import gsi
import photos
import school_links
import ungdomsskole_oslo
import velkomst

SCHOOL_DATA = Path('static/js/school-data.json')
OUTPUT_DIR = Path('static/data/skoler')
KRETS_FILE = Path('static/js/skolekretser.json')


GENERIC = {'skole', 'skule', 'skolen', 'barneskole', 'ungdomsskole', 'avd', 'avdeling', 'grunnskole', 'oppvekstsenter'}


def _matching_article(names, url):
    """Keep a Wikipedia article only when its title shares a word with the school's name
    (Wikidata sometimes ties an old organisation number to another school)."""
    title = urllib.parse.unquote(url.rsplit('/', 1)[-1]).replace('_', ' ').lower()
    words = {w for name in names for w in re.findall(r'\w{3,}', name.lower()) if w not in GENERIC}
    return any(w in title for w in words)


def _clean(photo):
    """Drop Wikimedia's utm_* tracking parameters from the thumbnail URL."""
    return dict(photo, thumb=re.sub(r'\?utm_[^#]*$', '', photo['thumb']))


def main():
    schools = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))['schools']
    orgnrs = sorted({s['orgnr'] for s in schools if s.get('orgnr')})
    single = photos.load_cache()
    galleries = photos.load_galleries()
    links = school_links.load_cache()
    survey = elevundersokelsen.load_history()
    wikipedia = school_links.load_wikipedia()
    names = {}
    for school in schools:
        if school.get('orgnr'):
            names.setdefault(school['orgnr'], set()).add(school['name'])
    heart_zones = hjertesone.load_cache()
    newcomers = velkomst.load_cache()
    next_school = ungdomsskole_oslo.load_cache()
    # The OpenStreetMap extract is large; without its cache the files are written without 'anlegg'
    facilities = anlegg.Finder(anlegg.load_cache()) if anlegg.CACHE_FILE.exists() else None
    indicators = elevundersokelsen.load_indicators()
    devices = school_links.load_devices()
    aks_food = aks_mat.load_cache()
    contacts = school_links.load_contacts()
    gsi_cache = gsi.load_cache()
    kommune_of = {s['orgnr']: s['kommune'] for s in schools if s.get('orgnr')}
    # Skolekretser from kommuner that publish them as open data (skolekretser.py): orgnr -> its kretser
    krets_file = json.loads(KRETS_FILE.read_text(encoding='utf-8')) if KRETS_FILE.exists() else {'kommuner': {}, 'kretser': []}
    by_school = {(s['name'], s['kommune'], s['schoolType']): s['orgnr'] for s in schools if s.get('orgnr')}
    kretser, kretser_kommune = {}, {}
    for krets in krets_file['kretser']:
        orgnr = by_school.get((krets.get('school'), krets['kommune'], krets['level']))
        if orgnr:
            kretser.setdefault(orgnr, []).append({'level': krets['level'], 'name': krets['name'], 'rings': krets['rings']})
            kretser_kommune[orgnr] = krets['kommune']
    positions = {}
    for school in schools:
        if school.get('orgnr') and school.get('lat') is not None:
            positions.setdefault(school['orgnr'], (school['lat'], school['lng']))
    # The other way round: which barneskoler lead to each ungdomsskole
    feeders = {}
    for barne_orgnr, info in next_school['schools'].items():
        for target in info['next']:
            if target['orgnr'] and target['orgnr'] != barne_orgnr:
                feeders.setdefault(target['orgnr'], []).append(barne_orgnr)
    school_names = {}
    for school in schools:
        if school.get('orgnr') and school['schoolType'] == 'barneskole':
            school_names[school['orgnr']] = school['name']
    today = datetime.date.today().isoformat()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    # 'updated' is the day a school's details last changed, so a rebuild with nothing new (the daily
    # refresh) leaves the files as they are and the page does not claim the links were fetched today
    previous = {}
    for old in OUTPUT_DIR.glob('*.json'):
        previous[old.stem] = json.loads(old.read_text(encoding='utf-8'))
        old.unlink()

    counts = {'gallery': 0, 'facebook': 0, 'instagram': 0, 'aks': 0, 'hjertesone': 0, 'velkomst': 0, 'devices': 0}
    for orgnr in orgnrs:
        gallery = []
        if orgnr in single:
            gallery.append(single[orgnr])
        own = galleries.get(orgnr, {})
        if not photos.is_school_category(own.get('category', '')):
            own = {}
        for photo in own.get('photos', []):
            if all(photo['page'] != p['page'] for p in gallery):
                gallery.append(photo)
        entry = links.get(orgnr, {})
        detail = {
            'gallery': [_clean(p) for p in gallery[:photos.GALLERY_SIZE]],
            'commonsCategory': own.get('category'),
            'website': entry.get('websiteChecked') or entry.get('website'),
            'facebook': entry.get('facebook'),
            'instagram': entry.get('instagram'),
            'wikipedia': wikipedia.get(orgnr) if orgnr in wikipedia and _matching_article(names.get(orgnr, ()), wikipedia[orgnr]) else None,
            'websiteBroken': entry.get('websiteStatus') == 'broken' or None,
            'aks': entry.get('aks'),
            'survey': elevundersokelsen.history_for(survey, orgnr),
            'hjertesone': {'source': heart_zones['source'], 'fetched': heart_zones['fetched']}
                          if orgnr in heart_zones['schools'] else None,
            'velkomst': {'groups': newcomers['schools'][orgnr], 'source': newcomers['source'], 'fetched': newcomers['fetched']}
                        if orgnr in newcomers['schools'] else None,
            'nextSchool': dict(next_school['schools'][orgnr], source=next_school['source'], fetched=next_school['fetched'])
                          if orgnr in next_school['schools'] else None,
            'fromSchools': {'schools': sorted(({'name': school_names.get(o, o), 'orgnr': o} for o in feeders[orgnr]), key=lambda x: x['name']),
                            'source': next_school['source'], 'fetched': next_school['fetched']}
                           if orgnr in feeders else None,
            'anlegg': facilities.for_school(*positions[orgnr]) if facilities and orgnr in positions else None,
            'elevundersokelsen': elevundersokelsen.indicators_for(indicators, orgnr),
            'gsi': gsi.history_for(gsi_cache, orgnr, kommune_of.get(orgnr)),
            'devices': {'links': devices['schools'][orgnr], 'fetched': devices['fetched']}
                       if orgnr in devices['schools'] else None,
            'aksMat': dict(aks_food['schools'][orgnr], fetched=aks_food['fetched'])
                      if orgnr in aks_food['schools'] else None,
            'contact': dict(contacts['schools'][orgnr], source=contacts['source'], fetched=contacts['fetched'])
                       if orgnr in contacts['schools'] else None,
            'skolekrets': {'kretser': kretser[orgnr], **krets_file['kommuner'][kretser_kommune[orgnr]]}
                          if orgnr in kretser else None,
            'updated': today,
        }
        detail = {k: v for k, v in detail.items() if v}
        before = previous.get(orgnr, {})
        if before.get('updated') and {k: v for k, v in before.items() if k != 'updated'} == {k: v for k, v in detail.items() if k != 'updated'}:
            detail['updated'] = before['updated']
        counts['gallery'] += len(gallery) > 1
        for key in ('facebook', 'instagram', 'aks', 'hjertesone', 'velkomst', 'devices'):
            counts[key] += key in detail
        (OUTPUT_DIR / f'{orgnr}.json').write_text(json.dumps(detail, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    print(f"Wrote {len(orgnrs)} files to {OUTPUT_DIR}: {counts['gallery']} with several photos, "
          f"{counts['facebook']} Facebook, {counts['instagram']} Instagram, {counts['aks']} AKS, "
          f"{counts['hjertesone']} hjertesone, {counts['velkomst']} with newcomer groups, "
          f"{counts['devices']} with læringsbrett links")


if __name__ == '__main__':
    main()
