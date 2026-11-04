"""
Pages for search engines: one static HTML page per school and per kommune, a list of all kommuner, and
sitemap.xml. Search engines read these as plain HTML; in the browser the school page is drawn by
static/js/school-page.js on top of the static text, as on skole.html.

    python site_pages.py

Run after create_map.py and school_details.py (update_data.py does this every night). create_map.py calls
assign_pages() so every school in static/js/school-data.json has its page path ("page").

    skoler/index.html                       all kommuner
    skoler/<kommune>/index.html             the schools in one kommune
    skoler/<kommune>/<skole>.html           one school (both levels of a 1–10 school on one page)

The pages say only what the data says. Titles and descriptions are neutral (no numbers), so a search result
does not show "mobbing 12 %" without its context; the numbers are on the page, next to the national
figure. Kommune lists are in alphabetical order, not a ranking. A file is written only when its content
has changed, and pages of schools that are gone are removed, so the nightly refresh commits only what is new.
"""
import heapq
import html
import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

SITE = 'https://skolekartet.no/'
OUT_DIR = Path('skoler')
DATA_FILE = Path('static/js/school-data.json')
DETAILS_DIR = Path('static/data/skoler')
NATIONAL_FILE = Path('static/js/landssnitt.json')
KOMMUNE_FILE = Path('static/js/kommunesnitt.json')
TEMPLATE = Path('skole.html')
SITEMAP = Path('sitemap.xml')
OG_IMAGE = SITE + 'static/img/og-skolekartet.png'
NEARBY = 6

TYPE_LABEL = {'barneskole': 'barneskole', 'ungdomsskole': 'ungdomsskole'}
LEVEL_LABEL = {'barneskole': '5. trinn', 'ungdomsskole': 'ungdomstrinnet'}
SURVEY_TRINN = {'barneskole': '7', 'ungdomsskole': '10'}
PROFILE_LABEL = {'montessori': 'montessori', 'steiner': 'steiner', 'kristen': 'kristen',
                 'internasjonal': 'internasjonal', 'toppidrett': 'toppidrett', 'realfag': 'realfag'}
SUBJECTS = (('engelsk', 'Engelsk'), ('lesing', 'Lesing'), ('regning', 'Regning'))


# ── Paths ────────────────────────────────────────────────────────────────
def slugify(text):
    """"Ruseløkka skole" → "ruselokka-skole", "Våler (Østfold)" → "valer-ostfold"."""
    text = text.lower()
    for letter, ascii_ in (('æ', 'ae'), ('ø', 'o'), ('å', 'a')):
        text = text.replace(letter, ascii_)
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')


def nb_order(text):
    """Norwegian alphabetical order: Æ, Ø and Å come after Z."""
    return text.lower().translate(str.maketrans({'æ': '{', 'ø': '|', 'å': '}'}))


def kommune_path(kommune):
    return f'skoler/{slugify(kommune)}/'


def assign_pages(schools):
    """Give every school entry its page path ("page"). One page per school (orgnr), so both levels of a
    1–10 school share it. Two schools with the same name in one kommune get the orgnr added."""
    taken = {}
    by_orgnr = defaultdict(list)
    for school in schools:
        by_orgnr[school.get('orgnr') or f"{school['name']}|{school['kommune']}"].append(school)
    for key in sorted(by_orgnr):
        first = by_orgnr[key][0]
        base = f"{kommune_path(first['kommune'])}{slugify(first['name']) or 'skole'}"
        path = f'{base}.html' if base not in taken else f'{base}-{slugify(key)}.html'
        taken[base] = key
        for school in by_orgnr[key]:
            school['page'] = path
    return schools


# ── Formatting ───────────────────────────────────────────────────────────
def esc(text):
    return html.escape(str(text), quote=True)


def decimal(value, digits=1):
    return f'{value:.{digits}f}'.replace('.', ',')


def percent(value):
    return f'{decimal(value)} %'


def mean(values):
    known = [v for v in values if v is not None]
    return sum(known) / len(known) if known else None


def distance_km(a, b):
    lat1, lng1, lat2, lng2 = map(math.radians, (a['lat'], a['lng'], b['lat'], b['lng']))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def level_order(levels):
    return sorted(levels, key=lambda s: 0 if s['schoolType'] == 'barneskole' else 1)


def type_text(levels):
    if len(levels) > 1:
        return 'barne- og ungdomsskole (1.–10. trinn)'
    return TYPE_LABEL.get(levels[0]['schoolType'], levels[0]['schoolType'])


def short_type(levels):
    return 'barne- og ungdomsskole' if len(levels) > 1 else TYPE_LABEL.get(levels[0]['schoolType'], levels[0]['schoolType'])


def owner_text(school):
    if school.get('eierform') == 'privat':
        profile = PROFILE_LABEL.get(school.get('profil'))
        return f'Privat, {profile}' if profile else 'Privat'
    return 'Offentlig' if school.get('eierform') == 'offentlig' else None


# ── Page frame (from skole.html, so scripts, styles and their versions stay the same) ──
def page_frame(depth, title, description, canonical, json_ld, body_attrs, main_html, school_page):
    """skole.html with its own head texts and main content, its relative links made to work `depth` folders down.
    Pages that are not school pages drop the map and school scripts."""
    prefix = '../' * depth
    page = TEMPLATE.read_text(encoding='utf-8')
    page = re.sub(r'(\s(?:src|href)=")(?!https?:|#|/|mailto:|tel:|data:)([^"]*)"',
                  lambda m: f'{m.group(1)}{prefix}{"" if m.group(2) == "./" else m.group(2)}"', page)
    page = page.replace('<title>Skole – Skolekartet</title>', f'<title>{esc(title)}</title>')
    page = re.sub(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{esc(description)}" />', page)
    head = f"""<link rel="canonical" href="{canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Skolekartet" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:title" content="{esc(title)}" />
    <meta property="og:description" content="{esc(description)}" />
    <meta property="og:image" content="{OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="nb_NO" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">{json.dumps(json_ld, ensure_ascii=False, separators=(',', ':'))}</script>"""
    page = page.replace('<link rel="icon" type="image/svg+xml"', head + '\n    <link rel="icon" type="image/svg+xml"', 1)
    page = page.replace('<body>', f'<body{body_attrs}>', 1)
    page = re.sub(r'(<article class="page__content school-page" id="schoolPage" aria-live="polite">).*?(</article>)',
                  lambda m: m.group(1) + main_html + '\n            ' + m.group(2), page, flags=re.S)
    if not school_page:
        page = re.sub(r'\n\s*<!-- Map for the school position.*?leaflet-maplibre-gl\.js"></script>', '', page, flags=re.S)
        page = re.sub(r'\n\s*<script src="[^"]*(?:score-colors|school-page)\.js[^"]*"></script>', '', page)
        page = page.replace(' school-page" id="schoolPage" aria-live="polite"', '"')
    return page


def breadcrumbs_ld(items):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': name, **({'item': url} if url else {})}
        for i, (name, url) in enumerate(items)]}


def breadcrumbs_html(items, prefix):
    parts = []
    for name, path in items:
        parts.append(f'<li><a class="ds-link" href="{prefix}{path}">{esc(name)}</a></li>' if path is not None
                     else f'<li aria-current="page">{esc(name)}</li>')
    return f'<nav class="breadcrumbs" aria-label="Brødsmulesti"><ol>{"".join(parts)}</ol></nav>'


# ── School page ──────────────────────────────────────────────────────────
def results_html(level, year, national):
    if not level.get('hasData'):
        return '<p class="ds-paragraph">Udir har ikke publisert resultater for skolen, ofte fordi gruppen er liten.</p>'
    rows = []
    for key, label in SUBJECTS:
        value = level.get(key)
        land = national.get(key)
        rows.append(f"<tr><th scope=\"row\">{label}</th><td>{value if value is not None else '*'}</td>"
                    f"<td>{decimal(land, 0) if land is not None else '–'}</td></tr>")
    rows.append(f"<tr><th scope=\"row\">Snitt ({level['validScoresCount']} fag)</th><td>{decimal(level['average'])}</td>"
                f"<td>{decimal(national['snitt']) if national.get('snitt') is not None else '–'}</td></tr>")
    history = [h for h in level.get('history') or [] if h.get('year') != year]
    history_html = ''
    if history:
        lines = ''.join(f"<tr><th scope=\"row\">{esc(h['year'])}</th>"
                        + ''.join(f"<td>{h.get(k) if h.get(k) is not None else '*'}</td>" for k, _ in SUBJECTS) + '</tr>'
                        for h in sorted(history, key=lambda h: h['year'], reverse=True))
        history_html = f"""
                <table class="ds-table" data-size="sm">
                    <caption>Tidligere år</caption>
                    <thead><tr><th scope="col">Skoleår</th><th scope="col">Engelsk</th><th scope="col">Lesing</th><th scope="col">Regning</th></tr></thead>
                    <tbody>{lines}</tbody>
                </table>"""
    return f"""
                <table class="ds-table" data-size="sm">
                    <caption>Skalapoeng {esc(year)}. Skalaen har ingen makspoeng; derfor står landsgjennomsnittet ved siden av. * betyr ikke publisert.</caption>
                    <thead><tr><th scope="col">Fag</th><th scope="col">Skolen</th><th scope="col">Hele landet</th></tr></thead>
                    <tbody>{''.join(rows)}</tbody>
                </table>{history_html}"""


def survey_html(level, details):
    trinn = SURVEY_TRINN[level['schoolType']]
    items = []
    trivsel = level.get('trivsel')
    if trivsel:
        national = next((row.get('national') for row in ((details.get('survey') or {}).get('trivsel') or {}).get(trinn, [])
                         if row.get('year') == trivsel.get('year')), None)
        land = f' Hele landet: {decimal(national)}.' if national is not None else ''
        items.append(f"<li><strong>Trivsel:</strong> {decimal(trivsel['score'])} av 5 ({esc(trivsel['trinn'])}. trinn, {esc(trivsel['year'])}).{land}</li>")
    else:
        items.append('<li><strong>Trivsel:</strong> ikke publisert, ofte fordi for få elever svarte.</li>')
    mobbing = level.get('mobbing')
    if mobbing:
        national = mobbing.get('national')
        land = f' Hele landet: {percent(national)}.' if national is not None else ''
        items.append(f"<li><strong>Mobbing:</strong> {percent(mobbing['share'])} av elevene ble mobbet to eller tre ganger i måneden "
                     f"eller oftere ({esc(mobbing['trinn'])}. trinn, {esc(mobbing['year'])}).{land}</li>")
    else:
        items.append('<li><strong>Mobbing:</strong> ikke publisert, ofte fordi for få elever svarte.</li>')
    return f'<ul class="ds-list">{"".join(items)}</ul>'


def school_page(levels, details, nearby, data, national_all):
    levels = level_order(levels)
    school = levels[0]
    year = data['metadata']['currentYear']
    name, kommune = school['name'], school['kommune']
    path = school['page']
    canonical = SITE + path
    owner = owner_text(school)
    kind = type_text(levels)
    owner_word = 'privat' if school.get('eierform') == 'privat' else 'offentlig' if school.get('eierform') == 'offentlig' else ''
    title = f'{name}, {kommune} – nasjonale prøver og trivsel | Skolekartet'
    description = (f'{name} er en {owner_word + " " if owner_word else ""}{kind} i {kommune}. Se resultater fra nasjonale prøver, '
                   f'trivsel og mobbing fra Elevundersøkelsen, og andre skoler i nærheten.')
    crumbs = [('Skolekartet', ''), ('Skoler', 'skoler/'), (kommune, kommune_path(kommune)), (name, None)]

    sections = []
    for level in levels:
        # A 1–10 school: one section per level; the survey is answered on 7. and 10. trinn
        heading = f' – {LEVEL_LABEL[level["schoolType"]]}' if len(levels) > 1 else ''
        survey_heading = f' – {SURVEY_TRINN[level["schoolType"]]}. trinn' if len(levels) > 1 else ''
        national = (national_all.get(level['schoolType']) or {}).get(year) or {}
        sections.append(f"""
            <section>
                <h2 class="ds-heading" data-size="sm">Nasjonale prøver{esc(heading)}</h2>
                {results_html(level, year, national)}
                <h3 class="ds-heading" data-size="xs">Elevundersøkelsen{esc(survey_heading)}</h3>
                {survey_html(level, details)}
            </section>""")

    links = [f'<li><a class="ds-link" href="../../?skole={esc(_url_quote(school["name"] + "|" + kommune + "|" + school["schoolType"]))}">Se skolen på kartet</a></li>']
    if details.get('website'):
        links.append(f'<li><a class="ds-link" href="{esc(details["website"])}" rel="noopener">Skolens nettside</a></li>')
    links.append(f'<li><a class="ds-link" href="../../{kommune_path(kommune)}">Alle skoler i {esc(kommune)}</a></li>')
    near = ''.join(f'<li><a class="ds-link" href="../../{other["page"]}">{esc(other["name"])}</a> '
                   f'({esc(short_type(other_levels))}, {esc(other["kommune"])}, {decimal(km)} km)</li>'
                   for other, other_levels, km in nearby)
    facts = ' · '.join(x for x in (kind[0].upper() + kind[1:], kommune, owner) if x)
    main = f"""
                {breadcrumbs_html(crumbs, '../../')}
                <h1 class="ds-heading" data-size="lg">{esc(name)}</h1>
                <p class="ds-paragraph" data-size="lg">{esc(facts)}</p>
                <p class="ds-paragraph">Resultater fra nasjonale prøver og Elevundersøkelsen for skoleåret {esc(year)}, sammenlignet med hele landet.</p>
                {''.join(sections)}
            <section>
                <h2 class="ds-heading" data-size="sm">Mer om skolen</h2>
                <ul class="ds-list">{''.join(links)}</ul>
            </section>
            <section>
                <h2 class="ds-heading" data-size="sm">Andre skoler i nærheten</h2>
                <ul class="ds-list">{near}</ul>
            </section>
            <p class="ds-paragraph school-page__sources" data-size="xs">Kilder: nasjonale prøver og Elevundersøkelsen fra
                Utdanningsdirektoratet, Nasjonalt skoleregister (NLOD). Avstanden er målt i luftlinje.
                <a class="ds-link" href="../../datakilder.html">Om datakildene</a>.</p>"""

    school_ld = {'@type': 'School', '@id': canonical + '#skole', 'name': name, 'url': canonical,
                 'address': {'@type': 'PostalAddress', 'addressLocality': re.sub(r'\s*\(.*\)$', '', kommune), 'addressCountry': 'NO'},
                 'geo': {'@type': 'GeoCoordinates', 'latitude': school['lat'], 'longitude': school['lng']}}
    if details.get('website'):
        school_ld['sameAs'] = [details['website']]
    photo = school.get('photo')
    if photo and photo.get('thumb'):
        school_ld['image'] = {'@type': 'ImageObject', 'contentUrl': photo['thumb'],
                              'creditText': f"{photo.get('author', '')}, {photo.get('license', '')}, via Wikimedia Commons",
                              **({'license': photo['licenseUrl']} if photo.get('licenseUrl') else {}),
                              **({'acquireLicensePage': photo['page']} if photo.get('page') else {})}
    json_ld = {'@context': 'https://schema.org', '@graph': [
        school_ld, breadcrumbs_ld([(n, SITE + p if p is not None else None) for n, p in crumbs])]}
    body = f' data-school-id="{esc(school["name"] + "|" + kommune + "|" + school["schoolType"])}"'
    return page_frame(2, title, description, canonical, json_ld, body, main, school_page=True)


def _url_quote(text):
    from urllib.parse import quote
    return quote(text, safe='')


# ── Kommune pages ────────────────────────────────────────────────────────
def kommune_page(kommune, schools_by_page, data, national_all, kommune_avg):
    year = data['metadata']['currentYear']
    pages = sorted(schools_by_page.items(), key=lambda item: nb_order(item[1][0]['name']))
    count = len(pages)
    with_barne = sum(1 for _, levels in pages if any(s['schoolType'] == 'barneskole' for s in levels))
    with_ungdom = sum(1 for _, levels in pages if any(s['schoolType'] == 'ungdomsskole' for s in levels))
    path = kommune_path(kommune)
    canonical = SITE + path
    title = f'Skoler i {kommune} – barneskoler og ungdomsskoler | Skolekartet'
    description = (f'Oversikt over {count} grunnskoler i {kommune}: resultater fra nasjonale prøver {year}, trivsel og mobbing '
                   f'fra Elevundersøkelsen, og skolene på kart.')
    crumbs = [('Skolekartet', ''), ('Skoler', 'skoler/'), (kommune, None)]

    def cell(levels, school_type, field):
        level = next((s for s in levels if s['schoolType'] == school_type), None)
        if not level:
            return ''
        if field == 'snitt':
            return decimal(level['average']) if level.get('hasData') else '–'
        return decimal(level['trivsel']['score']) if level.get('trivsel') else '–'

    rows = ''.join(
        f"<tr><th scope=\"row\"><a class=\"ds-link\" href=\"../../{page}\">{esc(levels[0]['name'])}</a></th>"
        f"<td>{esc(short_type(levels))}</td><td>{esc(owner_text(levels[0]) or '')}</td>"
        f"<td>{cell(levels, 'barneskole', 'snitt')}</td><td>{cell(levels, 'ungdomsskole', 'snitt')}</td>"
        f"<td>{cell(levels, 'barneskole', 'trivsel')}</td><td>{cell(levels, 'ungdomsskole', 'trivsel')}</td></tr>"
        for page, levels in pages)

    averages = []
    for school_type, label in (('barneskole', '5. trinn'), ('ungdomsskole', 'Ungdomstrinnet')):
        scores = (kommune_avg.get(school_type) or {}).get(kommune) if kommune_avg.get('year') == year else None
        local = mean([scores.get(k) for k, _ in SUBJECTS]) if scores else None
        land = ((national_all.get(school_type) or {}).get(year) or {}).get('snitt')
        if local is not None:
            averages.append(f'<li>{label}: {decimal(local)} i {esc(kommune)}, {decimal(land)} i hele landet</li>')
    averages_html = (f'<h2 class="ds-heading" data-size="sm">Snitt på nasjonale prøver {esc(year)}</h2>'
                     f'<ul class="ds-list">{"".join(averages)}</ul>') if averages else ''

    main = f"""
                {breadcrumbs_html(crumbs, '../../')}
                <h1 class="ds-heading" data-size="lg">Skoler i {esc(kommune)}</h1>
                <p class="ds-paragraph" data-size="lg">{count} grunnskoler med offentlige tall: {with_barne} med 5. trinn og {with_ungdom} med ungdomstrinn.</p>
                <p class="ds-paragraph"><a class="ds-link" href="../../?kommune={esc(_url_quote(kommune))}">Se skolene i {esc(kommune)} på kartet</a>,
                    søk på adressen din og finn skolene i nærheten.</p>
                {averages_html}
                <h2 class="ds-heading" data-size="sm">Alle skolene</h2>
                <p class="ds-paragraph" data-size="sm">I alfabetisk rekkefølge. Snitt er skalapoeng fra nasjonale prøver {esc(year)};
                    trivsel er elevenes svar på en skala fra 1 til 5 (7. og 10. trinn). – betyr ikke publisert.</p>
                <div class="table-scroll">
                    <table class="ds-table" data-size="sm">
                        <thead><tr><th scope="col">Skole</th><th scope="col">Type</th><th scope="col">Eierform</th>
                            <th scope="col">Snitt 5. trinn</th><th scope="col">Snitt ungdomstrinnet</th>
                            <th scope="col">Trivsel 7. trinn</th><th scope="col">Trivsel 10. trinn</th></tr></thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>
                <p class="ds-paragraph"><a class="ds-link" href="../">Skoler i andre kommuner</a></p>
                <p class="ds-paragraph school-page__sources" data-size="xs">Kilder: nasjonale prøver og Elevundersøkelsen fra
                    Utdanningsdirektoratet, Nasjonalt skoleregister (NLOD). <a class="ds-link" href="../../datakilder.html">Om datakildene</a>.</p>"""
    json_ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'CollectionPage', '@id': canonical, 'name': f'Skoler i {kommune}', 'url': canonical, 'description': description,
         'mainEntity': {'@type': 'ItemList', 'numberOfItems': count, 'itemListElement': [
             {'@type': 'ListItem', 'position': i + 1, 'url': SITE + page, 'name': levels[0]['name']}
             for i, (page, levels) in enumerate(pages)]}},
        breadcrumbs_ld([(n, SITE + p if p is not None else None) for n, p in crumbs])]}
    return page_frame(2, title, description, canonical, json_ld, '', main, school_page=False)


def index_page(kommuner, data):
    year = data['metadata']['currentYear']
    total = sum(count for _, count in kommuner)
    canonical = SITE + 'skoler/'
    title = 'Skoler etter kommune – alle grunnskoler i Norge | Skolekartet'
    description = (f'Alle {len(kommuner)} kommuner med grunnskoler i Skolekartet: {total} skoler med resultater fra nasjonale prøver '
                   f'{year}, trivsel og mobbing.')
    crumbs = [('Skolekartet', ''), ('Skoler', None)]
    items = ''.join(f'<li><a class="ds-link" href="../{kommune_path(name)}">{esc(name)}</a> ({count})</li>' for name, count in kommuner)
    main = f"""
                {breadcrumbs_html(crumbs, '../')}
                <h1 class="ds-heading" data-size="lg">Skoler etter kommune</h1>
                <p class="ds-paragraph" data-size="lg">{total} grunnskoler i {len(kommuner)} kommuner. Velg en kommune for å se skolene der,
                    eller <a class="ds-link" href="../">søk på adressen din på kartet</a>.</p>
                <ul class="ds-list kommune-list">{items}</ul>"""
    json_ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'CollectionPage', '@id': canonical, 'name': 'Skoler etter kommune', 'url': canonical, 'description': description},
        breadcrumbs_ld([(n, SITE + p if p is not None else None) for n, p in crumbs])]}
    return page_frame(1, title, description, canonical, json_ld, '', main, school_page=False)


# ── Sitemap ──────────────────────────────────────────────────────────────
def sitemap(entries):
    """The pages at the top keep their entries from the hand-made part of sitemap.xml."""
    old = SITEMAP.read_text(encoding='utf-8') if SITEMAP.exists() else ''
    kept = [block for block in re.findall(r'  <url>.*?</url>', old, re.S) if '/skoler/' not in block]
    new = [f'  <url>\n    <loc>{xml_escape(SITE + path)}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>' for path, lastmod in entries]
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + '\n'.join(kept + new) + '\n</urlset>\n')


def write(path, text, written):
    path = Path(path)
    written.add(path.resolve())
    if path.exists() and path.read_text(encoding='utf-8') == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    return True


def main():
    data = json.loads(DATA_FILE.read_text(encoding='utf-8'))
    schools = data['schools']
    if not all(s.get('page') for s in schools):
        assign_pages(schools)  # data from an older create_map.py
    national_all = json.loads(NATIONAL_FILE.read_text(encoding='utf-8')) if NATIONAL_FILE.exists() else {}
    kommune_avg = json.loads(KOMMUNE_FILE.read_text(encoding='utf-8')) if KOMMUNE_FILE.exists() else {}

    pages = defaultdict(list)
    for school in schools:
        pages[school['page']].append(school)
    details = {}
    for page, levels in pages.items():
        orgnr = levels[0].get('orgnr')
        file = DETAILS_DIR / f'{orgnr}.json'
        details[page] = json.loads(file.read_text(encoding='utf-8')) if orgnr and file.exists() else {}

    written, changed = set(), 0
    entries = []
    by_kommune = defaultdict(dict)
    located = [(page, levels[0]) for page, levels in pages.items() if levels[0].get('lat') is not None]
    for page, levels in pages.items():
        school = levels[0]
        by_kommune[school['kommune']][page] = levels
        nearby = []
        if school.get('lat') is not None:
            nearby = heapq.nsmallest(NEARBY, ((other, pages[other_page], distance_km(school, other))
                                              for other_page, other in located if other_page != page), key=lambda item: item[2])
        changed += write(page, school_page(levels, details[page], nearby, data, national_all), written)
        entries.append((page, details[page].get('updated')))

    kommune_dates = {}
    for kommune, kommune_pages in by_kommune.items():
        changed += write(kommune_path(kommune) + 'index.html', kommune_page(kommune, kommune_pages, data, national_all, kommune_avg), written)
        kommune_dates[kommune] = max((details[p].get('updated') or '' for p in kommune_pages), default='')
    kommuner = sorted(((k, len(v)) for k, v in by_kommune.items()), key=lambda item: nb_order(item[0]))
    changed += write(OUT_DIR / 'index.html', index_page(kommuner, data), written)

    # Pages of schools or kommuner that are no longer in the data
    removed = 0
    for file in OUT_DIR.rglob('*.html'):
        if file.resolve() not in written:
            file.unlink()
            removed += 1
    for folder in sorted(OUT_DIR.rglob('*'), reverse=True):
        if folder.is_dir() and not any(folder.iterdir()):
            folder.rmdir()

    newest = max(kommune_dates.values(), default='')
    site_entries = ([('skoler/', newest)] + [(kommune_path(k), kommune_dates[k]) for k, _ in kommuner]
                    + sorted((p, d) for p, d in entries))
    changed += write(SITEMAP, sitemap([(p, d or newest) for p, d in site_entries]), written)
    print(f'{len(pages)} school pages, {len(by_kommune)} kommune pages: {changed} files written, {removed} removed')


if __name__ == '__main__':
    main()
