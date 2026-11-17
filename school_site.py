"""
Links and a few facts from every school's own website, for the whole country: SFO (AKS in Oslo),
food at SFO, skolemat, leksehjelp, courses and activities, holiday offers and learning tablets.

Data source: the school's website as registered in NSR and checked by `school_links.py --check`
(cached-data/school-links.json). For each school the front page is read, and, where its menu has
them, the SFO page, the SFO food page and the skolemat page (at most five pages a school).
Only link titles and addresses and a few facts are kept, never page text:
- links:  sfo, sfoMat, leksehjelp, kurs, ferie, skolemat, devices  ({title, url} each)
- sfoFood: perWeek, warm, warmPerWeek (the rules of aks_mat.py, read from the SFO food page or the
           SFO page itself; weekdays and extra-matpakke days are left out, see food_facts)

The rules are strict on purpose, and a school with no clear match gets nothing:
- The front page must name the school (a distinctive word of its name in the title, main heading
  or address), and a front page used by more than two schools is skipped (the kommune's page).
- When the school's page lives under a path (a kommune website, minskole.no), only links under
  that path count (or a link whose title names the school, like "Blaker SFO"), so the kommune's
  general SFO or food pages are not taken for the school's.
- Leksehjelp, kurs and ferie links count on the SFO page, or on the front page when the title also
  says SFO/AKS; pages from an earlier school year, news articles and documents are skipped.

Polite fetching: robots.txt is respected (and its Crawl-delay), one request at a time per website
with a pause of at least 2 seconds, and a generic User-Agent without personal details. Every page
is cached in cached-data/site-pages/ (ignored by git, it holds page text), so a re-run only reads
pages not fetched before; --refetch reads them again.

    python school_site.py --refresh      # fetch what is missing, then extract
    python school_site.py --extract      # extract again from the cached pages only
    python school_site.py --refresh --refetch   # read every page again
    python school_site.py --test         # check the link rules on example links
Writes cached-data/school-site.json.
"""
import argparse
import collections
import concurrent.futures
import datetime
import gzip
import hashlib
import html
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

import aks_mat
import school_links

OUTPUT = Path('cached-data/school-site.json')
PAGE_DIR = Path('cached-data/site-pages')
INDEX = PAGE_DIR / 'index.json'
USER_AGENT = 'Mozilla/5.0 (compatible; skolekartet.no data refresh; +https://skolekartet.no)'
ROBOTS_AGENT = 'skolekartet'
MIN_DELAY, MAX_DELAY = 2.0, 10.0
MAX_PAGES = 5

LINK = re.compile(r'<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|\'([^\']*)\')[^>]*>(.*?)</a>', re.S | re.I)
SKIP_URL = re.compile(r'\.(?:pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|zip)(?:$|\?)|/(?:nyhet|nyheter|aktuelt|arkiv|news|kalender|'
                      r'artikkel|innlegg|blogg?|post)/\d|^mailto:|^tel:|^javascript:', re.I)
CARE = r'\bsfo\b|skolefritidsordning|\baks\b|aktivitetsskole'
PATTERNS = {
    'sfo': re.compile(CARE, re.I),
    'leksehjelp': re.compile(r'lekse(?:hjelp|hjelpa|tid|tida|kafe|kafé|kafeen|verksted|skole)', re.I),
    'kurs': re.compile(r'\bkurs(?:tilbud|katalog|meny|er)?\b|aktivitetstilbud|aktivitetsplan|aktivitetsmeny|'
                       r'\baktiviteter\b|fritidstilbud', re.I),
    'ferie': re.compile(r'\bferie|sommer-?sfo|sommer-?aks|sommerklubb', re.I),
    'sfoMat': re.compile(r'\bmat\b|\bmaten\b|\bmeny\b|\bmenyen\b|matmeny|måltid|mattilbud|kosthold', re.I),
    'skolemat': re.compile(r'skolemat(?!er)|skolemåltid|skulemat|skulemåltid|skolefrukt|skulefrukt|frukt\s*(?:og|&)\s*grønt|'
                           r'skolemelk|skulemjølk|frokost|matordning|\bkantine', re.I),
    'devices': school_links.DEVICE_WORDS,
}
# Titles that are about something else even when a word matches
NOT_LINK = {
    'sfo': re.compile(r'\bsøk|oppsigelse|\bplass\b|-nytt|\bnytt\b|rutiner|vedtekt|betaling|pris|satser|foreldrebetaling|redusert|friplass|'
                      r'skjema|logg inn|ledig|stilling|jobb|barnehage|'
                      # a page about one part of SFO, not SFO itself
                      r'\bmat\b|meny|måltid|ferie|sommer|lekse|kurs|aktivitet|klubb|plan|nyhet|\bråd\b|samarbeidsutvalg', re.I),
    'ferie': re.compile(r'skolerute|skoleruta|skuleruta|skulerute|fridag|ferieplan for skole|elevpermisjon|permisjon', re.I),
    'kurs': re.compile(r'ferie|etter- og videre|videreutdanning|kompetanse|ansatt|lærer|foreldre|førstehjelp', re.I),
    'skolemat': re.compile(r'allergi|søknad|takk', re.I),
    'devices': re.compile(r'sperr|ekstern lenke|filter', re.I),
}
# A news item or a notice for one day, not a page about the offer: "Les mer 15.06.2026", "fredag 18.9"
NEWS = re.compile(r'\bles (?:mer|meir)\b|\d{1,2}\.\s?\d{1,2}\.(?:\s?\d{2,4})?|\b\d{1,2}\.\s*(?:jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)\w*|'
                  r'\b(?:mandag|tirsdag|onsdag|torsdag|fredag)\b|\b(?:januar|februar|mars|april|juni|juli|august|september|oktober|'
                  r'november|desember)\b|\bhøsten\b|\bvåren\b|\bnytt fra\b|\bnyhet|\bbilder\b|påmelding|stengt|\bjul\b|'
                  r'skolestarter|\bbase\s*\d', re.I)
TITLE_PARTS = re.compile(r'<title[^>]*>(.*?)</title>|<h1[^>]*>(.*?)</h1>|property=["\']og:site_name["\'][^>]*content=["\']([^"\']+)', re.S | re.I)


# ── Polite, cached fetching ─────────────────────────────────────────────

class Fetcher:
    def __init__(self, refetch=False):
        PAGE_DIR.mkdir(parents=True, exist_ok=True)
        ignore = PAGE_DIR / '.gitignore'
        if not ignore.exists():
            ignore.write_text('# Cached page text from school websites: never published\n*\n', encoding='utf-8')
        self.index = json.loads(INDEX.read_text(encoding='utf-8')) if INDEX.exists() else {}
        self.refetch = refetch
        self.fresh = set()
        self.lock = threading.Lock()
        self.robots, self.delay, self.last = {}, {}, {}
        self.host_locks = collections.defaultdict(threading.Lock)
        self.fetched = 0

    def _open(self, url, timeout=20):
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*;q=0.5',
                                                       'Accept-Language': 'nb,nn,no,en'})
        with school_links._OPENER.open(request, timeout=timeout) as response:
            kind = response.headers.get('Content-Type', '')
            charset = response.headers.get_content_charset() or 'utf-8'
            body = response.read(1_500_000) if 'html' in kind or not kind else b''
            return response.status, response.geturl(), body.decode(charset, errors='replace')

    def _wait(self, host):
        """Called with the host lock held: keep the pause between two requests to one website."""
        pause = self.delay.get(host, MIN_DELAY)
        since = time.time() - self.last.get(host, 0)
        if since < pause:
            time.sleep(pause - since)
        self.last[host] = time.time()

    def _allowed(self, url):
        host = urllib.parse.urlsplit(url).netloc
        if host not in self.robots:
            parser = urllib.robotparser.RobotFileParser()
            self._wait(host)
            try:
                status, _, text = self._open(f'{urllib.parse.urlsplit(url).scheme}://{host}/robots.txt', timeout=15)
                parser.parse(text.splitlines() if status == 200 else [])
            except urllib.error.HTTPError as error:
                # 401/403 on robots.txt: the site does not want robots at all
                parser.parse(['User-agent: *', 'Disallow: /'] if error.code in (401, 403) else [])
            except Exception:
                parser.parse([])
            delay = parser.crawl_delay(ROBOTS_AGENT)
            self.delay[host] = min(MAX_DELAY, max(MIN_DELAY, float(delay or 0)))
            self.robots[host] = parser
        return self.robots[host].can_fetch(ROBOTS_AGENT, url)

    def get(self, url):
        """(final address, page) from the cache or the website; (None, '') when not allowed or not answering."""
        url = url.split('#')[0]
        with self.lock:
            cached = self.index.get(url)
        if cached and not (self.refetch and url not in self.fresh):
            if not cached.get('file'):
                return None, ''
            path = PAGE_DIR / cached['file']
            if path.exists():
                return cached['final'], gzip.decompress(path.read_bytes()).decode('utf-8')
        host = urllib.parse.urlsplit(url).netloc
        with self.host_locks[host]:
            entry = {'fetched': datetime.date.today().isoformat()}
            if not self._allowed(url):
                entry['status'] = 'robots'
            else:
                self._wait(host)
                try:
                    status, final, page = self._open(url)
                    entry.update(status=status, final=final)
                    if page:
                        name = hashlib.sha1(url.encode()).hexdigest()[:20] + '.html.gz'
                        (PAGE_DIR / name).write_bytes(gzip.compress(page.encode('utf-8')))
                        entry['file'] = name
                except urllib.error.HTTPError as error:
                    entry['status'] = error.code
                except Exception as error:
                    entry['status'] = type(error).__name__
        with self.lock:
            self.index[url] = entry
            self.fresh.add(url)
            self.fetched += 1
            if self.fetched % 200 == 0:
                self.save()
        if not entry.get('file'):
            return None, ''
        return entry['final'], gzip.decompress((PAGE_DIR / entry['file']).read_bytes()).decode('utf-8')

    def save(self):
        INDEX.write_text(json.dumps(self.index, ensure_ascii=False, indent=0), encoding='utf-8')


# ── Links ────────────────────────────────────────────────────────────────

def _scope(final_url):
    """(host, path prefix) that a link must stay under to belong to the school."""
    parts = urllib.parse.urlsplit(final_url)
    path = re.sub(r'(?:index|default|forside|hjem)\.\w+$', '', parts.path, flags=re.I)
    path = path if path.endswith('/') else path + '/'
    return parts.netloc.lower().removeprefix('www.'), path.lower()


def links_on(page, final_url, scope, own_name=None):
    """[{title, url}] for the page's links that stay on the school's part of the website.
    `own_name(title)`: a link elsewhere on the same website also counts when its title names the school
    ("Blaker SFO" on Blaker skole's page on the kommune website)."""
    host, prefix = scope
    found, seen = [], set()
    for double, single, label in LINK.findall(page):
        href = html.unescape(double or single).strip()
        label = re.sub(r'<(svg|script|style)[^>]*>.*?</\1>', ' ', label, flags=re.S | re.I)
        title = school_links._text(re.sub(r'<', ' <', label))
        if not href or not title or len(title) > 80 or SKIP_URL.search(href):
            continue
        url = urllib.parse.urljoin(final_url, href).split('#')[0]
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ('http', 'https') or parts.netloc.lower().removeprefix('www.') != host:
            continue
        path = urllib.parse.unquote(parts.path).lower()
        if (path.rstrip('/') + '/') == prefix:
            continue
        if not (path + '/').startswith(prefix) and not (
                own_name and own_name(title)):
            continue
        if school_links._outdated(path) or school_links._outdated(title) or url in seen:
            continue
        seen.add(url)
        found.append({'title': title, 'url': url})
    return found


def _path_words(url):
    return urllib.parse.unquote(urllib.parse.urlsplit(url).path).replace('-', ' ').replace('_', ' ').replace('/', ' ')


def classify(link, kind, on_care_page=False):
    """True when the link is about `kind`: the title says so (or the address, for short titles)."""
    title = link['title']
    if len(title) > 60 or NEWS.search(title):
        return False
    if NOT_LINK.get(kind) and NOT_LINK[kind].search(title):
        return False
    hit = PATTERNS[kind].search(title)
    if not hit:
        return False
    # Course, holiday and food-at-SFO links only count on the SFO page or when the title says SFO/AKS
    if kind in ('kurs', 'ferie', 'sfoMat') and not on_care_page and not re.search(CARE, title, re.I):
        return False
    return True


def pick(links, kind, on_care_page=False):
    """The matching link with the shortest title ("SFO" before "Om SFO på skolen")."""
    hits = [l for l in links if classify(l, kind, on_care_page)]
    return min(hits, key=lambda l: len(l['title'])) if hits else None


# ── One school ───────────────────────────────────────────────────────────

def names_school(page, final_url, names, kommune):
    """The page's title, main heading or address has a distinctive word of the school's name."""
    heading = ' '.join(next((p for p in parts if p), '') for parts in TITLE_PARTS.findall(page[:200_000]))
    host = urllib.parse.urlsplit(final_url).netloc
    try:
        host = host.encode('ascii').decode('idna')  # xn--risyhamnskole-dnb.no -> risøyhamnskole.no
    except UnicodeError:
        pass
    text = school_links._plain_ascii(school_links._text(heading)) + school_links._plain_ascii(_path_words(final_url) + host)
    # A short name ("Os skole", "Rå skole") counts when the whole name is in the heading
    plain_heading = ' ' + re.sub(r'[^\wæøå]+', ' ', school_links._text(heading).lower()) + ' '
    if any(f' {n.lower()} ' in plain_heading for n in names):
        return True
    kommune_words = {school_links._plain_ascii(w) for w in re.split(r'[\s\-()]+', kommune or '') if w}
    for name in names:
        for word in re.split(r'[\s\-/.,()]+', name.lower()):
            if len(word) < 4 or word in school_links.GENERIC_WORDS:
                continue
            plain = school_links._plain_ascii(word)
            variants = {plain, school_links._plain_ascii(word.replace('ø', 'oe').replace('å', 'aa').replace('æ', 'ae'))}
            if not any(v in text for v in variants):
                continue
            # The kommune's own name only counts with skole/skule in the heading
            if plain in kommune_words and not school_links.SCHOOL_WORDS.search(heading):
                continue
            return True
    return False


def food_facts(fetcher, urls):
    """SFO food facts read from the pages, as aks_mat.merge does for Oslo: (url, facts) or None."""
    pages = []
    for url in urls:
        _, page = fetcher.get(url)
        if not page:
            return None  # a page that could not be read leaves the facts out
        pages.append((False, url, aks_mat.extract(aks_mat.page_text(page))))
    merged = aks_mat.merge([p for p in pages if p[2]])
    if not merged:
        return None
    # Stricter than for Oslo's AKS pages, whose layout is known: a count read from named weekdays
    # ("Vi lager varm-mat på Tysdag og Fredag", "(12.00 onsdag) ... serverer mat") was often wrong,
    # so weekdays, a count that comes from them and extra-matpakke days are left out
    facts = merged['facts']
    if 'days' in facts:
        facts.pop('days')
        facts.pop('perWeek', None)
    facts.pop('packedDays', None)
    return merged if facts else None


def collect(fetcher, orgnr, website, info, shared):
    """Links and facts for one school, or None when its front page is not the school's own."""
    final, page = fetcher.get(website)
    if not page:
        return {'status': 'not read'}
    if not names_school(page, final, info['names'], info['kommune']):
        return {'status': 'not the school'}
    if shared > 2 and urllib.parse.urlsplit(final).path.strip('/') == '':
        return {'status': 'shared front page'}
    scope = _scope(final)
    own_name = lambda title: names_school(f'<title>{html.escape(title)}</title>', 'https://x/', info['names'], info['kommune'])
    front = links_on(page, final, scope, own_name)
    result = {'links': {}}
    found = result['links']
    for kind in ('sfo', 'skolemat', 'leksehjelp', 'kurs', 'ferie', 'devices'):
        link = pick(front, kind)
        if link:
            found[kind] = link
    pages_read = 1
    care_links = []
    if 'sfo' in found and pages_read < MAX_PAGES:
        care_final, care_page = fetcher.get(found['sfo']['url'])
        pages_read += 1
        if care_page:
            # The site menu repeats on every page: only links the front page does not have
            on_front = {l['url'] for l in front}
            care_links = [l for l in links_on(care_page, care_final, scope, own_name) if l['url'] not in on_front]
            for kind in ('leksehjelp', 'kurs', 'ferie', 'sfoMat'):
                link = pick(care_links, kind, on_care_page=True)
                if link and kind not in found:
                    found[kind] = link
    if 'sfo' in found:
        food_pages = ([found['sfoMat']['url']] if 'sfoMat' in found else []) + [found['sfo']['url']]
        pages_read += len(food_pages) - 1
        food = food_facts(fetcher, food_pages)
        if food:
            result['sfoFood'] = food
    result['status'] = 'ok'
    result['pages'] = pages_read
    return result


def _schools():
    """orgnr -> (website, info) for every school with a working website."""
    links = school_links.load_cache()
    wanted = school_links._wanted()
    schools = {}
    for orgnr, entry in links.items():
        website = entry.get('websiteChecked') or entry.get('website')
        if website and entry.get('websiteStatus') != 'broken' and orgnr in wanted:
            schools[orgnr] = (school_links._clean_url(website), wanted[orgnr])
    return schools


def run(fetch=True, refetch=False, path=OUTPUT):
    schools = _schools()
    fetcher = Fetcher(refetch=refetch)
    if not fetch:
        # Extract from the cache only: a page not in the cache counts as not read
        fetcher._open = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('offline'))
        fetcher.get = _offline(fetcher)
    shared = collections.Counter(w.rstrip('/').lower() for w, _ in schools.values())
    by_host = collections.defaultdict(list)
    for orgnr, (website, info) in schools.items():
        by_host[urllib.parse.urlsplit(website).netloc].append(orgnr)
    print(f"  Reading {len(schools)} school websites on {len(by_host)} hosts")
    results, done = {}, [0]

    def host_job(orgnrs):
        for orgnr in orgnrs:
            website, info = schools[orgnr]
            try:
                results[orgnr] = collect(fetcher, orgnr, website, info, shared[website.rstrip('/').lower()])
            except Exception as error:
                results[orgnr] = {'status': f'error {type(error).__name__}'}
            done[0] += 1
            if done[0] % 100 == 0:
                print(f"  {done[0]}/{len(schools)} schools, {fetcher.fetched} pages fetched", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
        # The hosts with most schools first, so they do not finish last
        list(pool.map(host_job, sorted(by_host.values(), key=len, reverse=True)))
    if fetch:
        fetcher.save()
    write(results, path)


def _offline(fetcher):
    def get(url):
        url = url.split('#')[0]
        cached = fetcher.index.get(url)
        if not cached or not cached.get('file'):
            return None, ''
        return cached['final'], gzip.decompress((PAGE_DIR / cached['file']).read_bytes()).decode('utf-8')
    return get


def write(results, path=OUTPUT):
    old = load(path)['schools']
    schools = {}
    for orgnr, result in sorted(results.items()):
        if result.get('status') != 'ok':
            continue
        entry = {k: v for k, v in (('links', result['links']), ('sfoFood', result.get('sfoFood'))) if v}
        if entry:
            schools[orgnr] = entry
    data = {'fetched': datetime.date.today().isoformat(), 'schools': schools}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    status = collections.Counter(r.get('status') for r in results.values())
    kinds = collections.Counter(k for e in schools.values() for k in e.get('links', {}))
    food = collections.Counter(k for e in schools.values() for k in (e.get('sfoFood') or {}).get('facts', {}))
    print(f"  Front pages: {dict(status)}")
    print(f"  Saved {len(schools)} schools to {path}. Links: {dict(kinds)}. SFO food facts: {dict(food)}")
    changed = [o for o in set(old) | set(schools) if old.get(o) != schools.get(o)]
    if old:
        print(f"  {len(changed)} schools changed since the last run")


def load(path=OUTPUT):
    if not path.exists():
        return {'fetched': None, 'schools': {}}
    return json.loads(path.read_text(encoding='utf-8'))


# Example links (title, address) and the kind they should count as; None = no kind
EXAMPLES = [
    (('SFO', 'https://x.no/sfo/'), False, 'sfo'),
    (('Skolefritidsordningen', 'https://x.no/skolefritidsordning'), False, 'sfo'),
    (('Søknad om SFO-plass', 'https://x.no/sfo-soknad'), False, None),
    (('Priser og betaling SFO', 'https://x.no/sfo-pris'), False, None),
    (('Leksehjelp', 'https://x.no/leksehjelp'), False, 'leksehjelp'),
    (('Ferie-SFO', 'https://x.no/ferie-sfo'), False, 'ferie'),
    (('Ferietilbud', 'https://x.no/sfo/ferie'), True, 'ferie'),
    (('Ferietilbud', 'https://x.no/ferie'), False, None),
    (('Skolerute 2026-27', 'https://x.no/skolerute'), True, None),
    (('Mat på SFO', 'https://x.no/sfo/mat'), True, 'sfoMat'),
    (('Skolemat', 'https://x.no/skolemat'), False, 'skolemat'),
    (('Frukt og grønt', 'https://x.no/frukt'), False, 'skolemat'),
    (('Kurs og aktiviteter', 'https://x.no/sfo/kurs'), True, 'kurs'),
    (('Aktiviteter', 'https://x.no/aktiviteter'), False, None),
    (('Læringsbrett', 'https://x.no/ipad'), False, 'devices'),
    (('Slik sperrer du internett på læringsbrett og pc (ekstern lenke)', 'https://x.no/a'), False, None),
    (('Skolemateriell', 'https://x.no/skolemateriell'), False, None),
    (('Skolemelk og skolefrukt for skoleåret 2026-2027 Les mer 15.06.2026', 'https://x.no/a'), False, None),
    (('Siste skoledag før jul Sfo åpen', 'https://x.no/a'), False, None),
    (('Planleggingsdag fredag 18.9: skolen er stengt (SFO er åpent)', 'https://x.no/a'), True, None),
    (('Aktivitetsplan for november', 'https://x.no/a'), True, None),
    (('Ferie-AKS', 'https://x.no/a'), False, 'ferie'),
    (('Skulemjølk/frukt', 'https://x.no/a'), False, 'skolemat'),
    (('Søkje SFO-plass', 'https://x.no/a'), False, None),
    (('Aktivitetsplan for langdager i vinterferie', 'https://x.no/a'), True, None),
]


def run_examples():
    failed = 0
    order = ['sfo', 'leksehjelp', 'skolemat', 'devices', 'sfoMat', 'kurs', 'ferie']
    for (title, url), on_care, expected in EXAMPLES:
        link = {'title': title, 'url': url}
        got = next((k for k in order if classify(link, k, on_care)), None)
        if got != expected:
            failed += 1
            print(f"  FAIL {title!r} on_care={on_care}: expected {expected}, got {got}")
    print(f"  {len(EXAMPLES) - failed} of {len(EXAMPLES)} examples pass")
    return failed == 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Links and facts from every school website.')
    parser.add_argument('--refresh', action='store_true', help='fetch pages not in the cache, then extract')
    parser.add_argument('--refetch', action='store_true', help='with --refresh: read every page again')
    parser.add_argument('--extract', action='store_true', help='extract from the cached pages only')
    parser.add_argument('--test', action='store_true', help='check the link rules on examples')
    args = parser.parse_args()
    if args.test:
        raise SystemExit(0 if run_examples() else 1)
    if args.refresh:
        run(fetch=True, refetch=args.refetch)
    elif args.extract:
        run(fetch=False)
    else:
        parser.print_help()
