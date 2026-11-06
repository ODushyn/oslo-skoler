"""
Official links for each school: website, Facebook, Instagram and, for Oslo, the
school's Aktivitetsskolen (AKS) pages.

Data sources:
- Nasjonalt skoleregister (NSR, Udir, NLOD): the school's website
  https://data-nsr.udir.no/v4/enhet/<orgnr>
- The school's own website (front page only): links to Facebook and Instagram that
  the school publishes itself, and for Oslo schools the links in the
  "Aktivitetsskolen" menu. Only link titles and addresses are stored, never page text.

A Facebook or Instagram link is kept only when it is the school's own: it must appear on
at most two schools' websites, and its handle must contain a distinctive word from the
school's name (a link like facebook.com/narvikkommune on a school page is the kommune's).
AKS links with an old school year in the address (e.g. 2017-18) are dropped as outdated.

Schools still without Facebook or Instagram get a second look (`--more`):
- Wikidata (CC0): Facebook ID (P2013) and Instagram username (P2003) of the school's item
- up to two more pages on the school's own website, such as "Kontakt" or "Om skolen"
The same filters apply. Schools where nothing is found get no link; the school page then
shows the icon as unavailable.

Links about the pupils' learning tablets or PCs (`--devices`): links on the school's front page
whose title or address mentions læringsbrett, iPad or Chromebook. Only title and address are
stored, as for AKS. Cached separately in cached-data/school-devices.json.

Website check (`--check`): every registered website is tried; a "we have moved" front page is
followed to the new address, parked or closed sites count as not working, and a school without a
working site is looked up in its kommune's sitemap (the page must name the school in its title).
An Oslo school still without a working site gets the address from Oslo kommune's own list of its
schools (source-data/oslo-skoler-nettsider.tsv, `--oslo-list` to apply only that), if it answers.
The full list is written to cached-data/school-websites.csv.

Cached in cached-data/school-links.json. Refresh with:
    python school_links.py --refresh
    python school_links.py --check            # all websites, writes cached-data/school-websites.csv
    python school_links.py --check --failed   # only the sites that did not work or were not reached last time
    python school_links.py --oslo-list        # Oslo schools without a working site: Oslo kommune's list
    python school_links.py --devices
    python school_links.py --contacts         # email and phone (Enhetsregisteret), shared mailboxes and landlines only
"""
import argparse
import collections
import concurrent.futures
import csv
import datetime
import glob
import html
import json
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from school_locations import schools_in_source

NSR_URL = 'https://data-nsr.udir.no/v4/enhet/'
CACHE_FILE = Path('cached-data/school-links.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
SOCIAL_PATTERNS = {
    'facebook': re.compile(r'https?://(?:www\.|m\.|nb-no\.)?facebook\.com/(?!sharer|share|plugins|dialog|tr\b|login|policies|help)'
                           r'(?:people/[^"\'?#\s<>]+/\d+|profile\.php\?id=\d+|[A-Za-z0-9.\-_%]+)/?', re.I),
    'instagram': re.compile(r'https?://(?:www\.)?instagram\.com/(?!p/|explore|accounts|reel)[A-Za-z0-9._]+/?', re.I),
}
# Newest school year in source-data, e.g. '2025-26'
CURRENT_YEAR = max(Path(f).name[:7] for f in glob.glob('source-data/*.csv'))
AKS_LINK = re.compile(r'<a[^>]+href="(/aktivitetsskolen/[^"#]+)"[^>]*>(.*?)</a>', re.S | re.I)
DEVICES_FILE = Path('cached-data/school-devices.json')
ANY_LINK = re.compile(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', re.S | re.I)
DEVICE_WORDS = re.compile(r'l(æ|ae|a)ringsbrett|ipad|chromebook', re.I)


def _get(url, accept='text/html', timeout=20):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': accept})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or 'utf-8'
        return response.geturl(), response.read(2_000_000).decode(charset, errors='replace')


def _website(raw):
    if not raw:
        return None
    raw = raw.strip()
    return raw if re.match(r'^https?://', raw, re.I) else f'https://{raw}'


def _text(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', fragment))).strip()


def _outdated(path):
    """'/1.-trinn-201718/' and similar pages from earlier school years."""
    years = [int(y) for y in re.findall(r'(?<!\d)(20\d\d)', path)]
    return bool(years) and min(years) < int(CURRENT_YEAR[:4])


GENERIC_WORDS = {'skole', 'skule', 'skolen', 'skulen', 'barneskole', 'barneskule', 'ungdomsskole', 'ungdomsskule',
                 'oppvekstsenter', 'avdeling', 'school', 'the', 'grunnskole', 'friskole', 'privatskole', 'montessoriskole',
                 'kristne', 'kristen', 'og', 'i', 'på', 'as', 'sa', 'stiftelsen', 'oppvekstsenteret', 'oppvekst', 'senter'}
SCHOOL_WORDS = re.compile(r'skole|skule|school|skolen|skulen', re.I)


def _plain_ascii(text):
    text = text.lower().replace('æ', 'ae').replace('ø', 'o').replace('å', 'a').replace('é', 'e')
    return re.sub(r'[^a-z0-9]', '', text)


def _is_own_social(url, names, kommune):
    """True when the handle names the school, not just the kommune or owner."""
    handle = _plain_ascii(urllib.parse.unquote(urllib.parse.urlparse(url).path + urllib.parse.urlparse(url).query))
    if 'kommune' in handle and not SCHOOL_WORDS.search(handle):
        return False  # the kommune's page
    if handle.startswith('fau'):
        return False  # the parents' council, not the school
    kommune_words = {_plain_ascii(w) for w in re.split(r'[\s\-()]+', kommune or '') if w}
    for name in names:
        for word in re.split(r'[\s\-/.,()]+', name.lower()):
            if len(word) < 4 or word in GENERIC_WORDS:
                continue
            variants = {_plain_ascii(word), _plain_ascii(word.replace('ø', 'oe').replace('å', 'aa').replace('æ', 'ae'))}
            if not any(v and (v in handle) for v in variants):
                continue
            # The kommune's own name only counts together with a word like "skole"
            if _plain_ascii(word) in kommune_words and not SCHOOL_WORDS.search(handle):
                continue
            return True
    return False


def clean_socials(links, schools):
    """Keep only Facebook/Instagram links that belong to the school itself."""
    for name in SOCIAL_PATTERNS:
        counts = collections.Counter(url.lower() for e in links.values()
                                     for url in (e.get(name) if isinstance(e.get(name), list) else [e.get(name)] if e.get(name) else []))
        for orgnr, entry in links.items():
            found = entry.pop(name, [])
            found = found if isinstance(found, list) else [found]
            info = schools.get(orgnr, {'names': set(), 'kommune': None})
            own = [url for url in found if counts[url.lower()] <= 2 and _is_own_social(url, info['names'], info['kommune'])]
            if own:
                entry[name] = own[0]


def _collect(orgnr, school_types, kommune):
    """NSR unit, then the school's front page."""
    entry = {}
    try:
        unit = json.loads(_get(NSR_URL + orgnr, accept='application/json')[1])
    except Exception:
        return orgnr, entry
    entry['website'] = _website(unit.get('Internettadresse'))
    if not entry['website']:
        return orgnr, entry

    try:
        final_url, page = _get(entry['website'])
    except Exception:
        return orgnr, entry
    for name, pattern in SOCIAL_PATTERNS.items():
        found = sorted({m.group(0).rstrip('/').replace('http://', 'https://') for m in pattern.finditer(page)})
        if found:
            entry[name] = found

    # Oslo school websites (osloskolen.no) share one layout with an AKS menu
    if kommune == 'Oslo' and 'barneskole' in school_types and 'osloskolen.no' in final_url:
        links, seen = [], set()
        for href, label in AKS_LINK.findall(page):
            title = _text(label)
            path = href.rstrip('/')
            if not title or path == '/aktivitetsskolen' or path in seen or _outdated(path):
                continue
            seen.add(path)
            links.append({'title': title, 'url': urllib.parse.urljoin(final_url, href)})
        if links:
            entry['aks'] = {'url': urllib.parse.urljoin(final_url, '/aktivitetsskolen/'), 'links': links}
    return orgnr, entry


WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
SOCIAL_QUERY = """
SELECT ?orgnr ?facebook ?instagram WHERE {
  ?item wdt:P2333 ?orgnr .
  OPTIONAL { ?item wdt:P2013 ?facebook }
  OPTIONAL { ?item wdt:P2003 ?instagram }
  FILTER(BOUND(?facebook) || BOUND(?instagram))
}
"""
EXTRA_PAGE = re.compile(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', re.S | re.I)
EXTRA_WORDS = re.compile(r'kontakt|om skolen|om oss|om skulen|sosiale medier|følg oss|facebook|instagram', re.I)


def _wikidata_socials():
    """orgnr -> {'facebook': url, 'instagram': url} from Wikidata (CC0)."""
    import urllib.parse as up
    body = up.urlencode({'query': SOCIAL_QUERY, 'format': 'json'}).encode()
    request = urllib.request.Request(WIKIDATA_SPARQL, data=body,
                                     headers={'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json'})
    with urllib.request.urlopen(request, timeout=120) as response:
        rows = json.loads(response.read())['results']['bindings']
    found = {}
    for row in rows:
        orgnr = re.sub(r'\D', '', row['orgnr']['value'])
        entry = found.setdefault(orgnr, {})
        if 'facebook' in row:
            entry.setdefault('facebook', f"https://www.facebook.com/{row['facebook']['value']}")
        if 'instagram' in row:
            entry.setdefault('instagram', f"https://www.instagram.com/{row['instagram']['value']}")
    return found


def _extra_pages(orgnr, website):
    """Social links on up to two more pages of the school's own site (Kontakt, Om skolen ...)."""
    found = {}
    try:
        base_url, page = _get(website)
    except Exception:
        return orgnr, found
    host = urllib.parse.urlparse(base_url).netloc
    candidates = []
    for href, label in EXTRA_PAGE.findall(page):
        url = urllib.parse.urljoin(base_url, href)
        if urllib.parse.urlparse(url).netloc != host or url.rstrip('/') == base_url.rstrip('/'):
            continue
        if EXTRA_WORDS.search(_text(label)) or EXTRA_WORDS.search(href):
            if url not in candidates:
                candidates.append(url)
    for url in candidates[:2]:
        try:
            _, sub = _get(url)
        except Exception:
            continue
        for name, pattern in SOCIAL_PATTERNS.items():
            found.setdefault(name, set()).update(m.group(0).rstrip('/').replace('http://', 'https://') for m in pattern.finditer(sub))
    return orgnr, {k: sorted(v) for k, v in found.items() if v}


def find_more(path=CACHE_FILE):
    """Second look for schools without Facebook or Instagram: Wikidata, then more of their own pages."""
    links = json.loads(path.read_text(encoding='utf-8'))
    wanted = _wanted()
    before = {k: sum(1 for e in links.values() if e.get(k)) for k in SOCIAL_PATTERNS}

    for orgnr, social in _wikidata_socials().items():
        if orgnr in links:
            for name, url in social.items():
                links[orgnr].setdefault(name, url)

    missing = [(o, e['website']) for o, e in links.items()
               if e.get('website') and not (e.get('facebook') and e.get('instagram'))]
    print(f"  Looking at more pages for {len(missing)} schools without Facebook or Instagram")
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for done, job in enumerate(concurrent.futures.as_completed(
                [pool.submit(_extra_pages, o, w) for o, w in missing]), 1):
            orgnr, found = job.result()
            for name, urls in found.items():
                if not links[orgnr].get(name):
                    links[orgnr][name] = urls
            if done % 250 == 0:
                print(f"  {done}/{len(missing)}")

    clean_socials(links, wanted)
    after = {k: sum(1 for e in links.values() if e.get(k)) for k in SOCIAL_PATTERNS}
    print(f"  Facebook {before['facebook']} -> {after['facebook']}, Instagram {before['instagram']} -> {after['instagram']}")
    _save(links, path)


CHECK_HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; skolekartet.no link check)', 'Accept': 'text/html,*/*'}
WEBSITES_REPORT = Path('cached-data/school-websites.csv')
# A front page that only says the school has moved, like "Vi har nye hjemmesider her: ..."
MOVED_TEXT = re.compile(r'\bnye? (?:hjemmesider?|heimesider?|nettsider?|nettstad|nettadresse|adresse)\b|har flytt(?:et|a)\b|'
                        r'finn(?:er)? (?:du )?oss (?:nå )?(?:på|her)|\bnew (?:web ?)?(?:site|page)\b|siteclosed', re.I)
# Parked domains, empty server pages and closed sites: the address answers, but not with the school
# (matched against the visible text, so class names like "page-template-default page" do not count)
PARKED_TEXT = re.compile(r'domenet (?:er )?til salgs|domain (?:name )?(?:is )?for sale|buy this domain|'
                         r'domenet er parkert|domain (?:is )?parked|domain parking|'
                         r'(?:web server|apache2?|nginx|iis)\W[^.]{0,40}default page|welcome to nginx|^it works!|^index of /|'
                         r'account (?:has been )?suspended|nettstedet er (?:stengt|lagt ned)', re.I)
NOT_FOUND_TEXT = re.compile(r'<title>[^<]*(?:\b404\b|fant ikke|finnes ikke|not found|ikkje funne)[^<]*</title>', re.I)
META_REFRESH = re.compile(r'<meta[^>]+http-equiv=["\']?refresh["\']?[^>]+content=["\']?\s*\d+\s*;\s*url=([^"\'>\s]+)', re.I)
JS_REDIRECT = re.compile(r'(?:window\.)?location(?:\.href)?\s*=\s*["\']([^"\']+)["\']|location\.replace\(\s*["\']([^"\']+)["\']', re.I)
PLATFORM = re.compile(r'(?:^|\.)(?:wix|wixsite|squarespace|wordpress|one|domeneshop|webnode|jimdo|google|facebook)\.(?:com|no)$', re.I)
ASSET = re.compile(r'\.(?:css|js|png|jpe?g|gif|svg|ico|woff2?|pdf)(?:\?|$)', re.I)
# Kommune pages that name a school but are not its page
NOT_SCHOOL_PAGE = re.compile(r'nyhet|aktuelt|prosjekt|barnehage|/sfo|-sfo|/aks\b|arkiv|politik|horing|høring|kunngj|'
                             r'ledig|stilling|jobb|innkjop|anbud|byggesak|plan(?:er)?/|/kart|booking|/book-|utleie|lokale', re.I)


class _Redirect308(urllib.request.HTTPRedirectHandler):
    """Python 3.9 does not follow 308 (Permanent Redirect); browsers do."""
    def http_error_308(self, req, fp, code, msg, headers):
        return self.http_error_301(req, fp, 301, msg, headers)


_OPENER = urllib.request.build_opener(_Redirect308)
TRANSIENT = ('no-answer', 'timeout', 503, '503', '520')


def _clean_url(url):
    """Registered addresses with spaces, three slashes or æøå in the host, made into a working URL."""
    url = re.sub(r'^(https?:)/{3,}', r'\1//', url.strip(), flags=re.I)
    parsed = urllib.parse.urlsplit(url)
    host = re.sub(r'\s+', '', parsed.netloc).lower()
    try:
        host = host.encode('idna').decode('ascii')
    except UnicodeError:
        pass
    path = urllib.parse.quote(parsed.path, safe="/%:@&=+$,;~-._!*'()")
    return urllib.parse.urlunsplit((parsed.scheme, host, path, parsed.query, ''))


def _website_variants(url):
    """The registered address first, then the same site with/without www and with http."""
    parsed = urllib.parse.urlparse(_clean_url(url))
    host = parsed.netloc
    hosts = [host, host[4:] if host.startswith('www.') else f'www.{host}']
    variants = []
    for scheme in ('https', 'http'):
        for h in hosts:
            candidate = urllib.parse.urlunparse((scheme, h, parsed.path or '/', '', parsed.query, ''))
            if candidate not in variants:
                variants.append(candidate)
    return variants


def _fetch(url, timeout=15):
    """(status, final address, page) for a GET; status is an HTTP code or an error name."""
    try:
        with _OPENER.open(urllib.request.Request(url, headers=CHECK_HEADERS), timeout=timeout) as response:
            charset = response.headers.get_content_charset() or 'utf-8'
            return response.status, response.geturl(), response.read(500_000).decode(charset, errors='replace')
    except urllib.error.HTTPError as error:
        return error.code, url, ''
    except Exception as error:
        reason = str(getattr(error, 'reason', error))
        return ('certificate' if 'CERTIFICATE' in reason or 'SSL' in reason else
                'no-such-host' if 'nodename' in reason or 'Name or service' in reason else
                'timeout' if 'timed out' in reason else 'no-answer'), url, ''


def _visible_text(page):
    page = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', page, flags=re.S | re.I)
    return _text(page)


def _moved_to(base, page):
    """Where a 'we have moved' page, a meta refresh or a script redirect points, or None."""
    match = META_REFRESH.search(page)
    if match:
        return urllib.parse.urljoin(base, html.unescape(match.group(1)))
    text = _visible_text(page)
    if len(text) > 1500:
        return None
    host = urllib.parse.urlparse(base).netloc
    # Another site, not a page on the same site and not the site builder's own address
    elsewhere = lambda url: (url.startswith('http') and urllib.parse.urlparse(url).netloc not in (host, '')
                             and not PLATFORM.search(urllib.parse.urlparse(url).netloc) and not ASSET.search(url))
    # A page that is nothing but a script sending the visitor on
    match = JS_REDIRECT.search(page)
    if match and len(text) < 200:
        target = urllib.parse.urljoin(base, html.unescape(match.group(1) or match.group(2)))
        return target if elsewhere(target) else None
    if not (MOVED_TEXT.search(text) or 'siteclosed' in page):
        return None
    targets = {urllib.parse.urljoin(base, html.unescape(href)).rstrip('/')
               for href in re.findall(r'<a[^>]+href=["\']([^"\'#]+)', page, re.I)}
    targets = [t for t in targets if elsewhere(t)]
    return targets[0] + '/' if len(targets) == 1 else None


def _answer(url, follow=True):
    """('ok', address, note) when the address shows a real page, else ('broken', None, reason)."""
    status, final, page = _fetch(url)
    if status in (401, 403, 429):
        return 'ok', url, 'answers'  # the site answers, it only turns away scripts
    if not isinstance(status, int) or status >= 400:
        return 'broken', None, str(status)
    text = _visible_text(page)
    if PARKED_TEXT.search(text) and len(text) < 3000:
        return 'broken', None, 'parked or closed'
    if NOT_FOUND_TEXT.search(page[:20_000]):
        return 'broken', None, 'page not found'
    target = _moved_to(final, page) if follow else None
    if target and target.rstrip('/') != final.rstrip('/'):
        result = _answer(target, follow=False)
        return (result[0], result[1], 'moved') if result[0] == 'ok' else ('broken', None, 'moved, new address does not answer')
    # A closed site on the Moava platform that does not say where the school went
    if follow and 'siteclosed' in page and len(text) < 1500:
        return 'broken', None, 'closed, new address not given'
    return 'ok', final, 'answers'


def _check_website(orgnr, url):
    """'ok' with the working address and a note, or 'broken' with the reason."""
    reason = None
    for candidate in _website_variants(url):
        status, working, note = _answer(candidate)
        if status == 'ok':
            return orgnr, status, working, note
        reason = reason or note
        # A parked, closed or missing page is the same on the other variants
        if note in ('parked or closed', 'page not found', 'closed, new address not given') or note.startswith('moved'):
            break
    return orgnr, 'broken', None, reason


def _slugs(name):
    """Ways a kommune website writes a school's name in an address: 'lunde-skole', 'stoelen-skole'..."""
    base = re.sub(r'[^\wæøåé\s-]', '', name.lower()).strip()
    base = re.sub(r'[\s_]+', '-', base)
    variants = {base}
    for ae, oe, aa in (('ae', 'o', 'a'), ('ae', 'oe', 'aa'), ('a', 'o', 'a')):
        variants.add(base.replace('æ', ae).replace('ø', oe).replace('å', aa).replace('é', 'e'))
    return variants


def _kommune_hosts(kommune, old_url):
    hosts = []
    old = urllib.parse.urlparse(_clean_url(old_url)).netloc if old_url else ''
    if old.endswith('.kommune.no'):
        hosts.append(old)
    for slug in _slugs(kommune or ''):
        if slug:
            hosts += [f'www.{slug}.kommune.no', f'{slug}.kommune.no']
    return list(dict.fromkeys(hosts))


_SITEMAPS = {}
_SITEMAP_LOCK = threading.Lock()


def _sitemap(host):
    """All page addresses in a website's sitemap (and its child sitemaps), cached per host."""
    with _SITEMAP_LOCK:
        if host in _SITEMAPS:
            return _SITEMAPS[host]
        _SITEMAPS[host] = None
    sources = [f'https://{host}/sitemap.xml']
    status, _, robots = _fetch(f'https://{host}/robots.txt')
    if status == 200:
        sources = re.findall(r'(?im)^sitemap:\s*(\S+)', robots) + sources
    urls, seen = [], set()
    while sources and len(seen) < 40:
        source = sources.pop(0)
        if source in seen:
            continue
        seen.add(source)
        status, _, xml = _fetch(source, timeout=30)
        if status != 200:
            continue
        locs = [html.unescape(l) for l in re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', xml)]
        if '<sitemapindex' in xml:
            sources += locs
        else:
            urls += locs
    with _SITEMAP_LOCK:
        _SITEMAPS[host] = urls
    return urls


def _names_match(names, page):
    """The page title or main heading names the school (all distinctive words of one of its names)."""
    parts = re.findall(r'<title[^>]*>(.*?)</title>|<h1[^>]*>(.*?)</h1>', page, re.S | re.I)
    heading = _plain_ascii(_text(' '.join(title or h1 for title, h1 in parts)))
    for name in names:
        words = [w for w in re.split(r'[\s\-/.,()]+', name.lower()) if len(w) >= 3 and w not in GENERIC_WORDS]
        if words and all(_plain_ascii(w) in heading for w in words):
            return True
    return False


def _find_on_kommune_site(names, kommune, old_url):
    """The school's page on the kommune's website, found in its sitemap by the school's name and
    checked by its title; None when there is no single clear match."""
    slugs = set().union(*(_slugs(n) for n in names))
    for host in _kommune_hosts(kommune, old_url):
        pages = _sitemap(host)
        if not pages:
            continue
        found = []
        for url in pages:
            path = urllib.parse.unquote(urllib.parse.urlparse(url).path).lower().rstrip('/')
            last = re.sub(r'(?:\.\d+[-\d]*)?\.(?:html?|aspx)$', '', path.rsplit('/', 1)[-1])
            if last in slugs and not NOT_SCHOOL_PAGE.search(path):
                found.append(url)
        # Prefer pages under a school section; give up when several are left
        school_section = [u for u in found if re.search(r'skole|skule|utdanning|oppvekst', u.rsplit('/', 2)[0], re.I)]
        found = school_section or found
        if len(found) != 1:
            continue
        status, final, page = _fetch(found[0])
        if status == 200 and _names_match(names, page):
            return final
    return None


# Oslo kommune's list of its schools and their websites, saved as name<TAB>website
OSLO_LIST = Path('source-data/oslo-skoler-nettsider.tsv')


def _list_name(name):
    return re.sub(r'^oslo kommune\s+', '', re.sub(r'\s+', ' ', name.strip().lower()))


def from_oslo_list(links, wanted, only=None):
    """Oslo schools without a working website get the address from Oslo kommune's list, if it answers."""
    if not OSLO_LIST.exists():
        return 0
    listed = {}
    for line in OSLO_LIST.read_text(encoding='utf-8').splitlines():
        if '\t' in line and not line.startswith('#'):
            name, url = line.split('\t', 1)
            listed[_list_name(name)] = url.strip()
    added = 0
    for orgnr, entry in links.items():
        info = wanted.get(orgnr)
        if (not info or info['kommune'] != 'Oslo' or entry.get('websiteStatus') == 'ok'
                or (only is not None and orgnr not in only)):
            continue
        url = next((listed[n] for n in map(_list_name, info['names']) if n in listed), None)
        if not url:
            continue
        _, status, working, _ = _check_website(orgnr, url)
        if status == 'ok':
            entry.update(websiteStatus='ok', websiteChecked=working, websiteNote="listed by Oslo kommune")
            added += 1
    print(f"  Oslo kommune's list gave a website to {added} schools")
    return added


def _write_report(links, wanted, path=WEBSITES_REPORT):
    """Every school with the registered address, the address we link to and the result."""
    with path.open('w', encoding='utf-8', newline='') as out:
        writer = csv.writer(out, delimiter=';')
        writer.writerow(['orgnr', 'skole', 'kommune', 'registrert nettside (NSR)', 'nettside vi lenker til', 'status', 'merknad'])
        for orgnr, entry in sorted(links.items(), key=lambda item: (wanted[item[0]]['kommune'] or '', sorted(wanted[item[0]]['names'] or [''])[0])):
            info = wanted[orgnr]
            used = None if entry.get('websiteStatus') == 'broken' else entry.get('websiteChecked') or entry.get('website')
            writer.writerow([orgnr, ' / '.join(sorted(info['names'])), info['kommune'] or '', entry.get('website') or '',
                             used or '', entry.get('websiteStatus') or 'ingen nettside', entry.get('websiteNote') or ''])
    print(f"  Wrote the list of all school websites to {path}")


def check_websites(path=CACHE_FILE, only=None):
    """Try every school website. A site that says it has moved is followed to its new address;
    a site that does not answer, is parked or closed, and a school without a registered site,
    are looked up on the kommune's website (sitemap + page title). Writes cached-data/school-websites.csv.
    `only`: check just these orgnr (for example the sites that failed last time)."""
    links = json.loads(path.read_text(encoding='utf-8'))
    wanted = _wanted()
    jobs = [(o, e['website']) for o, e in links.items() if e.get('website') and (only is None or o in only)]
    print(f"  Checking {len(jobs)} school websites")
    # Few parallel requests: many school sites share a host, which turns away a burst of requests
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for done, job in enumerate(concurrent.futures.as_completed([pool.submit(_check_website, o, w) for o, w in jobs]), 1):
            orgnr, status, working, note = job.result()
            entry = links[orgnr]
            # A refused connection or a timeout can be passing: keep the last result for that site
            if note in TRANSIENT and entry.get('websiteStatus'):
                entry['websiteNote'] = f"{(entry.get('websiteNote') or 'answers').split(' (')[0]} (not reached on the last check)"
                continue
            entry['websiteStatus'], entry['websiteNote'] = status, note
            if status == 'ok' and working and working.rstrip('/') != entry['website'].rstrip('/'):
                entry['websiteChecked'] = working
            else:
                entry.pop('websiteChecked', None)
            if done % 250 == 0:
                print(f"  {done}/{len(jobs)}")

    # Look for the rest on the kommune's website
    missing = [o for o, e in links.items() if (e.get('websiteStatus') == 'broken' or not e.get('website'))
               and (only is None or o in only)]
    print(f"  Looking for {len(missing)} schools on their kommune's website")
    def look(orgnr):
        info = wanted.get(orgnr)
        return orgnr, (_find_on_kommune_site(info['names'], info['kommune'], links[orgnr].get('website')) if info and info['names'] else None)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for orgnr, found in pool.map(look, missing):
            if found:
                entry = links[orgnr]
                entry.update(websiteStatus='ok', websiteChecked=found,
                             websiteNote='found on the kommune website' + (f" (registered address: {entry['websiteNote'].split(' (')[0]})" if entry.get('websiteNote') else ''))
    from_oslo_list(links, wanted, only)
    _save(links, path)
    _write_report(links, wanted)
    counts = collections.Counter(e.get('websiteStatus') or 'none' for e in links.values())
    notes = collections.Counter((e.get('websiteNote') or '').split(' (')[0] for e in links.values() if e.get('websiteStatus'))
    print(f"  Websites: {counts['ok']} work, {counts['broken']} do not, {counts['none']} schools have none")
    for note, n in notes.most_common():
        print(f"    {n:5} {note}")


CONTACTS_FILE = Path('cached-data/school-contacts.json')
BRREG_URL = 'https://data.brreg.no/enhetsregisteret/api/{kind}/{orgnr}'
# A shared mailbox, not a person: "postmottak@", "post.skolen@", "kontakt@" ... An address that looks
# like a person's name (ola.nordmann@) is personal data and is left out.
SHARED_MAILBOX = re.compile(r'post|mottak|kontakt|kontor|skole|skule|admin|info|ekspedisjon|resepsjon|sentralbord', re.I)


def _contact(orgnr, names):
    """Email and phone from Enhetsregisteret (Brønnøysundregistrene, NLOD), school unit first."""
    for kind in ('underenheter', 'enheter'):
        try:
            unit = json.loads(_get(BRREG_URL.format(kind=kind, orgnr=orgnr), accept='application/json')[1])
        except Exception:
            continue
        email = (unit.get('epostadresse') or '').strip().lower()
        local = email.split('@')[0]
        distinctive = [w for n in names for w in re.split(r'[\s\-/.,()]+', n.lower()) if len(w) >= 4 and w not in GENERIC_WORDS]
        if email and not (SHARED_MAILBOX.search(local) or any(_plain_ascii(w) in _plain_ascii(local) for w in distinctive)):
            email = ''
        phone = re.sub(r'\D', '', unit.get('telefon') or '')
        phone = phone[-8:] if len(phone) >= 8 else ''
        # Only landline numbers: an 8-digit number starting with 4 or 9 is a mobile, often a person's
        if phone and phone[0] in '49':
            phone = ''
        return orgnr, {k: v for k, v in (('email', email), ('phone', phone)) if v}
    return orgnr, None


def refresh_contacts(path=CONTACTS_FILE):
    wanted = _wanted()
    print(f"  Fetching email and phone for {len(wanted)} schools from Enhetsregisteret")
    found = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for orgnr, contact in pool.map(lambda o: _contact(o, wanted[o]['names']), wanted):
            if contact:
                found[orgnr] = contact
    data = {'source': 'Enhetsregisteret, Brønnøysundregistrene (NLOD)', 'fetched': datetime.date.today().isoformat(),
            'schools': dict(sorted(found.items()))}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved contacts for {len(found)} schools to {path}: "
          f"{sum('email' in c for c in found.values())} email, {sum('phone' in c for c in found.values())} phone")


def load_contacts(path=CONTACTS_FILE):
    if not path.exists():
        return {'source': None, 'fetched': None, 'schools': {}}
    return json.loads(path.read_text(encoding='utf-8'))


WIKIPEDIA_FILE = Path('cached-data/school-wikipedia.json')
WIKIPEDIA_QUERY = """
SELECT ?orgnr ?article ?wiki WHERE {
  ?item wdt:P2333 ?orgnr .
  ?article schema:about ?item ; schema:isPartOf ?wiki .
  VALUES ?wiki { <https://no.wikipedia.org/> <https://nn.wikipedia.org/> <https://en.wikipedia.org/> }
}
"""


def refresh_wikipedia(path=WIKIPEDIA_FILE):
    """orgnr -> Wikipedia article about the school: bokmål, else nynorsk, else English (Wikidata, CC0)."""
    import urllib.parse as up
    body = up.urlencode({'query': WIKIPEDIA_QUERY, 'format': 'json'}).encode()
    request = urllib.request.Request(WIKIDATA_SPARQL, data=body,
                                     headers={'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json'})
    with urllib.request.urlopen(request, timeout=120) as response:
        rows = json.loads(response.read())['results']['bindings']
    rank = {'https://no.wikipedia.org/': 0, 'https://nn.wikipedia.org/': 1, 'https://en.wikipedia.org/': 2}
    best = {}
    for row in rows:
        orgnr = re.sub(r'\D', '', row['orgnr']['value'])
        wiki = row['wiki']['value']
        if orgnr not in best or rank[wiki] < rank[best[orgnr][0]]:
            best[orgnr] = (wiki, row['article']['value'])
    data = {orgnr: article for orgnr, (wiki, article) in sorted(best.items())}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved Wikipedia articles for {len(data)} schools to {path}")


def load_wikipedia(path=WIKIPEDIA_FILE):
    if not path.exists():
        refresh_wikipedia(path)
    return json.loads(path.read_text(encoding='utf-8'))


def _wanted():
    """orgnr -> school names, levels and kommune, from the newest Udir files."""
    wanted = collections.defaultdict(lambda: {'types': set(), 'names': set(), 'kommune': None})
    for (name, kommune, school_type), orgnr in schools_in_source(f'source-data/{CURRENT_YEAR}_*.csv').items():
        wanted[orgnr]['types'].add(school_type)
        wanted[orgnr]['names'].add(name)
        wanted[orgnr]['kommune'] = kommune
    return wanted


def _save(links, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(sorted(links.items())), ensure_ascii=False, indent=0), encoding='utf-8')
    summary = {k: sum(1 for e in links.values() if e.get(k)) for k in ('website', 'facebook', 'instagram', 'aks')}
    print(f"  Saved links for {len(links)} schools to {path}: {summary}")


def clean_cache(path=CACHE_FILE):
    """Re-apply the filters to the cached links without downloading again."""
    links = json.loads(path.read_text(encoding='utf-8'))
    clean_socials(links, _wanted())
    for entry in links.values():
        entry.pop('email', None)
        entry.pop('phone', None)
        if entry.get('aks'):
            entry['aks']['links'] = [l for l in entry['aks']['links'] if not _outdated(urllib.parse.urlparse(l['url']).path)]
    _save(links, path)


def refresh_cache(path=CACHE_FILE):
    wanted = _wanted()
    print(f"  Fetching links for {len(wanted)} schools (NSR + school front pages)")

    links = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        jobs = [pool.submit(_collect, orgnr, info['types'], info['kommune']) for orgnr, info in wanted.items()]
        for done, job in enumerate(concurrent.futures.as_completed(jobs), 1):
            orgnr, entry = job.result()
            links[orgnr] = entry
            if done % 250 == 0:
                print(f"  {done}/{len(jobs)}")

    clean_socials(links, wanted)

    _save(links, path)


def load_cache(path=CACHE_FILE):
    if not path.exists():
        print(f"{path} not found, downloading...")
        refresh_cache(path)
    return json.loads(path.read_text(encoding='utf-8'))


def _device_links(orgnr, website):
    """Links about læringsbrett, iPad or Chromebook on the school's front page (title and address only)."""
    try:
        final_url, page = _get(website)
    except Exception:
        return orgnr, []
    links, seen = [], set()
    for href, label in ANY_LINK.findall(page):
        title = _text(label)
        url = urllib.parse.urljoin(final_url, html.unescape(href))
        if not title or not url.startswith('http') or url in seen:
            continue
        if DEVICE_WORDS.search(title) or DEVICE_WORDS.search(urllib.parse.unquote(urllib.parse.urlparse(url).path)):
            seen.add(url)
            links.append({'title': title, 'url': url})
    return orgnr, links[:3]


def refresh_devices(path=DEVICES_FILE):
    websites = {orgnr: e.get('websiteChecked') or e.get('website') for orgnr, e in load_cache().items()
                if (e.get('websiteChecked') or e.get('website')) and e.get('websiteStatus') != 'broken'}
    print(f"  Looking for læringsbrett links on {len(websites)} school front pages")
    found = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        jobs = [pool.submit(_device_links, orgnr, url) for orgnr, url in websites.items()]
        for done, job in enumerate(concurrent.futures.as_completed(jobs), 1):
            orgnr, links = job.result()
            if links:
                found[orgnr] = links
            if done % 500 == 0:
                print(f"  {done}/{len(jobs)}")
    data = {'fetched': datetime.date.today().isoformat(), 'schools': dict(sorted(found.items()))}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved læringsbrett links for {len(found)} schools to {path}")


def load_devices(path=DEVICES_FILE):
    if not path.exists():
        return {'fetched': None, 'schools': {}}
    return json.loads(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download or inspect the school link cache.')
    parser.add_argument('--refresh', action='store_true', help='download fresh links')
    parser.add_argument('--clean', action='store_true', help='re-apply the filters to the cached links')
    parser.add_argument('--more', action='store_true', help='look harder for Facebook and Instagram (Wikidata, more pages)')
    parser.add_argument('--check', action='store_true', help='check that every school website answers')
    parser.add_argument('--failed', action='store_true',
                        help='with --check: only the sites that did not work or were not reached last time')
    parser.add_argument('--wikipedia', action='store_true', help='download Wikipedia articles about the schools')
    parser.add_argument('--devices', action='store_true', help='look for links about learning tablets (læringsbrett)')
    parser.add_argument('--contacts', action='store_true', help='email and phone from Enhetsregisteret')
    parser.add_argument('--oslo-list', action='store_true', help="Oslo schools without a working website: Oslo kommune's list")
    args = parser.parse_args()
    if args.oslo_list:
        links, wanted = load_cache(), _wanted()
        if from_oslo_list(links, wanted):
            _save(links, CACHE_FILE)
            _write_report(links, wanted)
    elif args.contacts:
        refresh_contacts()
    elif args.devices:
        refresh_devices()
    elif args.wikipedia:
        refresh_wikipedia()
    elif args.check:
        failed = None
        if args.failed:
            failed = {o for o, e in load_cache().items()
                      if e.get('websiteStatus') == 'broken' or 'not reached' in (e.get('websiteNote') or '')}
        check_websites(only=failed)
    elif args.more:
        find_more()
    elif args.clean:
        clean_cache()
    elif args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    print(f"{len(load_cache())} schools in {CACHE_FILE}")
