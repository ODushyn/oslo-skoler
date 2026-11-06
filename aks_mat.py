"""
Food at Aktivitetsskolen (AKS) in Oslo, from the AKS pages on each school's own website.

Data source: the AKS start page and every page in its menu on the school's website
(osloskolen.no; links in cached-data/school-links.json, see school_links.py). Only a few facts
are kept, never the page text:
- perWeek:     how many days a week AKS serves food ("4 ganger i uken", "hver dag")
- days:        which weekdays, when they are named and match perWeek
- warm:        the page says that warm food is served; warmPerWeek when it says how often
- packedDays:  weekdays when the children must bring an extra matpakke

The rules are strict on purpose:
- Pages about holidays, the club for older pupils (Klubben), school starters and weekly plans are
  skipped, and so are sentences about holidays, breakfast or fruit only.
- A sentence with "matpakke" only counts the part before it for serving days ("Vi serverer mat
  tirsdag og torsdag, så disse dagene sender dere med en matpakke").
- A number is not read when the sentence has two of them ("varmmat 2 dager og brødmat 3 dager"),
  and warm food "eller" something else every day does not count as warm food every day.
- Sentences and pages for one group (base, trinn, AKS 2.0) only count when two such pages say
  the same, and a group page that says otherwise removes the fact for the whole school.
- When two pages of a school disagree, that fact is left out.
A school without a clear match gets no facts, and the school page shows "Se menyen" instead.
Menus change, so the school page always links to the page and shows the date it was read.

Cached in cached-data/aks-mat.json. Refresh with:
    python aks_mat.py --refresh    # reads the pages again and lists what changed since last time
    python aks_mat.py --test       # checks the rules on example sentences
"""
import argparse
import concurrent.futures
import datetime
import html
import json
import re
import urllib.request
from pathlib import Path

import school_links

CACHE_FILE = Path('cached-data/aks-mat.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
FOOD_LINK = re.compile(r'\bmat|\bmeny', re.I)
# Pages that are not about the usual AKS week for everyone
SKIP_PAGE = re.compile(r'klubb|ferie|heldag|skolestart|oppstart|ukeplan|månedsplan|periodeplan|ny på aks', re.I)
# Pages for one base or trinn
GROUP_PAGE = re.compile(r'\d\.?\s*trinn|\bbase\s*\d|\b(?:lille|store|mellom|mini|små)basen\b|trinnsbasen|\baks\s*2\.0', re.I)

DAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag']
DAY = r'(?:mandag|tirsdag|onsdag|torsdag|fredag)(?:er|en)?'
RANGE = re.compile(rf'\b({DAY})\s*[-–]\s*({DAY})\b|\bfra\s+({DAY})\s+til\s+({DAY})\b', re.I)
NUMBERS = {'en': 1, 'én': 1, 'èn': 1, 'ett': 1, 'to': 2, 'tre': 3, 'fire': 4, 'fem': 5}
SERVE = re.compile(r'\bserver(?:er|es)\b|\bservert\b|\bmatservering\b|\bvi lager mat\b|\btilbyr\b|\btilbys\b', re.I)
MEAL = re.compile(r'\bmat\b|\bmatservering\b|måltid|mellommåltid|\bretter\b|varm', re.I)
WARM = re.compile(r'\bvarm(?:e)? (?:mat|retter|lunsj|middag|måltider)|\bvarmmat\b|\bvarm \w+mat\b', re.I)
# "2-3 ganger pr. uke" is a range, not a number, so a number right after a dash does not count
TIMES = re.compile(r'(?<![-–\d])(?<![-–]\s)\b(\d|en|én|èn|to|tre|fire|fem)\s+(?:ganger|gang|måltider|dager|dag)\s+(?:i|pr\.?|per)\s+(?:uken|uka|uke)\b', re.I)
COUNT = re.compile(r'\b(?:\d|en|én|èn|to|tre|fire|fem)\s+(?:ganger|gang|måltider|dager|dag)\b', re.I)
EVERY_DAY = re.compile(r'\bhver dag\b|\balle dager\b|\bdaglig\b', re.I)
EXCEPT = re.compile(r'\b(?:unntatt|utenom|bortsett fra|med unntak av)\b', re.I)
PACKED = re.compile(r'matpakke', re.I)
EXTRA_PACKED = re.compile(r'ekstra|egen|må ha med|tas med|ta med|sende med en ekstra', re.I)
# "hver dag unntatt i ferier" still says something about the usual week
HOLIDAY_EXCEPT = re.compile(r'(?:med unntak av|unntatt|utenom|bortsett fra)\s+(?:i\s+)?(?:skolens\s+)?ferie\w*', re.I)


def _get(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read(2_000_000).decode('utf-8', errors='replace')


def page_text(raw):
    """Main content of an osloskolen.no page as plain text."""
    match = re.search(r'<main.*?</main>', raw, re.S) or re.search(r'<article.*?</article>', raw, re.S)
    body = match.group(0) if match else raw
    body = re.sub(r'<(script|style|nav|header|footer)[^>]*>.*?</\1>', ' ', body, flags=re.S)
    # Headings end a sentence, so they do not run into the first line of text
    body = re.sub(r'</h\d>', '. ', body)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', body))).strip()


def sentences(text):
    text = re.sub(r'\bpr\.\s', 'pr ', text)
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]


def _day(word):
    return DAYS.index(re.sub(r'(er|en)$', '', word.lower()))


def days_in(sentence):
    """Weekdays named in a sentence; 'mandag-onsdag' and 'fra mandag til torsdag' count as ranges."""
    found = set()
    for match in RANGE.finditer(sentence):
        start, end = (d for d in match.groups() if d)
        found.update(DAYS[_day(start):_day(end) + 1])
    for day in DAYS:
        if re.search(rf'\b{day}(?:er|en)?\b', sentence, re.I):
            found.add(day)
    return [d for d in DAYS if d in found]


def except_days(sentence):
    """Days after "unntatt/utenom ...": [] without such words, None when it names no day."""
    match = EXCEPT.search(sentence)
    if not match:
        return []
    days = re.match(rf'\s*((?:{DAY})(?:\s*(?:,|og)\s*(?:{DAY}))*)', sentence[match.end():], re.I)
    return days_in(days.group(1)) if days else None


def _number(word):
    return int(word) if word.isdigit() else NUMBERS.get(word.lower())


def frequency(part):
    """Days a week said in a sentence part, or None when it is missing or unclear."""
    if 'måned' in part.lower() or len(COUNT.findall(part)) > 1:
        return None
    match = TIMES.search(part)
    if match:
        return _number(match.group(1))
    if EVERY_DAY.search(part):
        skipped = except_days(part)
        return None if skipped is None else 5 - len(skipped)
    return None


def before_packed(sentence):
    """The part of a sentence before the clause about matpakke ('' when it starts with it)."""
    match = PACKED.search(sentence)
    if not match:
        return sentence
    cut = max(sentence.rfind(',', 0, match.start()), sentence.rfind(';', 0, match.start()),
              sentence.lower().rfind(' så ', 0, match.start()), sentence.lower().rfind(' da ', 0, match.start()))
    return sentence[:cut] if cut > 0 else ''


def _clause_after(sentence, start):
    """From a position to the end of its clause (next comma, semicolon or "og")."""
    end = re.search(r',|;|\bog\b', sentence[start:])
    return sentence[start:start + end.start()] if end else sentence[start:]


def extract(text):
    """Facts about food at AKS from one page, or {} when nothing is clear."""
    facts, day_sets = {}, []
    for s in sentences(text):
        s = HOLIDAY_EXCEPT.sub('', s)
        lower = s.lower()
        # Holidays, breakfast and the club for older pupils say nothing about the usual AKS meal
        # A sentence starting with "trinn" is the rest of "3. trinn ..." and is about one group
        if re.search(r'ferie|heldag|frokost', lower) or lower.startswith('trinn') or (
                'klubb' in lower and 'aks' not in lower and 'aktivitetsskol' not in lower):
            continue
        warm = WARM.search(s) if 'ikke' not in lower else None
        either = re.search(r'\beller\b', s)
        if warm:
            facts['warm'] = True
            # "hver dag, utenom fredag" needs the whole sentence; otherwise the clause after "varm mat"
            part = s if EXCEPT.search(s) else _clause_after(s, warm.start())
            how_often = None if either else (frequency(part) or frequency(s))
            if how_often:
                facts['warmPerWeek'] = how_often
        # A meal, not only fruit; warm food "eller" bread counts as a meal, not as warm food
        meal = SERVE.search(s) and MEAL.search(s) and 'ikke' not in lower and ('frukt' not in lower or warm)
        if meal and (not warm or either):
            part = before_packed(s)
            how_often = frequency(part)
            if how_often:
                facts.setdefault('perWeek', how_often)
            skipped = except_days(part)
            days = [d for d in DAYS if d not in skipped] if skipped and EVERY_DAY.search(part) else days_in(part)
            if days and len(days) < 5:
                day_sets.append(days)
        if PACKED.search(s) and EXTRA_PACKED.search(s):
            # Days in the sentence except the days it says food is served
            served = before_packed(s)
            served_days = days_in(served) if SERVE.search(served) and MEAL.search(served) and not re.search(
                r'ikke|frukt', served.lower()) else []
            days = [d for d in days_in(s) if d not in served_days]
            if 0 < len(days) < 5:
                facts['packedDays'] = days
    # Different days for different groups: say nothing about days
    distinct = {tuple(d) for d in day_sets}
    if len(distinct) == 1:
        days = list(distinct.pop())
        if facts.get('perWeek', len(days)) == len(days):
            facts['days'] = days
            facts['perWeek'] = len(days)
    elif len(distinct) > 1:
        facts.pop('perWeek', None)
    # Warm food every day means food every day
    if 'perWeek' not in facts and facts.get('warmPerWeek') == 5:
        facts['perWeek'] = 5
    return _consistent(facts)


def _consistent(facts):
    """Drop facts that contradict each other."""
    if set(facts.get('days', [])) & set(facts.get('packedDays', [])):
        facts.pop('days', None)
        facts.pop('packedDays', None)
    if facts.get('perWeek') and facts.get('packedDays') and facts['perWeek'] + len(facts['packedDays']) > 5:
        facts.pop('packedDays')
    if facts.get('warmPerWeek') and facts.get('perWeek') and facts['warmPerWeek'] > facts['perWeek']:
        facts.pop('warmPerWeek')
    return facts


KEYS = ['perWeek', 'days', 'warm', 'warmPerWeek', 'packedDays']


def merge(pages):
    """One school's facts from its pages: [(is_group, url, facts)], food pages first.
    A fact is kept when no page says otherwise; facts only on group pages need two of them."""
    kept, used = {}, []
    for key in KEYS:
        stated = [(is_group, url, f[key]) for is_group, url, f in pages if key in f]
        if not stated or any(value != stated[0][2] for _, _, value in stated):
            continue
        on_school_page = [url for is_group, url, _ in stated if not is_group]
        if on_school_page or len(stated) >= 2:
            kept[key] = stated[0][2]
            used.append(on_school_page[0] if on_school_page else stated[0][1])
    if 'days' in kept and kept.get('perWeek') != len(kept['days']):
        kept.pop('days')
    kept = _consistent(kept)
    if not kept:
        return None
    # Link to the school-wide page that gave most facts (the food page when it is a tie)
    school_wide = {url for is_group, url, _ in pages if not is_group}
    links = [url for url in used if url in school_wide] or used
    url = max(dict.fromkeys(links), key=links.count)
    return {'url': url, 'facts': {key: kept[key] for key in KEYS if key in kept}}


def school_pages(entry):
    """The AKS pages of one school to read, food pages first: [(is_group, url)]."""
    aks = entry.get('aks') or {}
    links = [l for l in aks.get('links', []) if not SKIP_PAGE.search(l['title'])]
    food = [l for l in links if FOOD_LINK.search(l['title']) and not GROUP_PAGE.search(l['title'])]
    rest = [l for l in links if l not in food]
    pages = [(False, l['url']) for l in food] + [(False, aks['url'])]
    pages += [(bool(GROUP_PAGE.search(l['title'])), l['url']) for l in rest]
    return list(dict.fromkeys(pages))


def _read(url):
    try:
        return url, extract(page_text(_get(url)))
    except Exception:
        return url, None


def refresh_cache(path=CACHE_FILE):
    schools = {orgnr: school_pages(entry) for orgnr, entry in school_links.load_cache().items()
               if (entry.get('aks') or {}).get('links')}
    urls = sorted({url for pages in schools.values() for _, url in pages})
    print(f"  Reading {len(urls)} AKS pages of {len(schools)} schools")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        found = dict(pool.map(_read, urls))
    result = {}
    for orgnr, pages in schools.items():
        # A page that could not be read leaves the school out, so a fact is never kept by mistake
        if any(found[url] is None for _, url in pages):
            continue
        school = merge([(is_group, url, found[url]) for is_group, url in pages if found[url]])
        if school:
            result[orgnr] = school
    old = load_cache()['schools']
    data = {'fetched': datetime.date.today().isoformat(), 'schools': dict(sorted(result.items()))}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f"  Saved food facts for {len(result)} of {len(schools)} schools with AKS pages to {path}")
    # Pages change: list every school whose facts changed, so they can be checked by hand
    for orgnr in sorted(set(old) | set(result)):
        before, after = (old.get(orgnr) or {}).get('facts'), (result.get(orgnr) or {}).get('facts')
        if before != after:
            url = (result.get(orgnr) or old.get(orgnr))['url']
            print(f"  Changed {url}: {before} -> {after}")


def load_cache(path=CACHE_FILE):
    if not path.exists():
        return {'fetched': None, 'schools': {}}
    return json.loads(path.read_text(encoding='utf-8'))


# Example sentences (written for the test, in the style of the pages) and the facts they give
EXAMPLES = [
    ('Vi serverer mat 4 ganger i uken, mandag, tirsdag, onsdag og fredag. '
     'Torsdag serverer vi ikke mat, da må barna ha med seg ekstra matpakke.',
     {'perWeek': 4, 'days': ['mandag', 'tirsdag', 'onsdag', 'fredag'], 'packedDays': ['torsdag']}),
    ('Vi serverer et måltid tirsdag og torsdag, så disse dagene sender dere med en matpakke.',
     {'perWeek': 2, 'days': ['tirsdag', 'torsdag']}),
    ('Elevene må ha med seg matpakke fra mandag til torsdag. Fredager serveres det mat på AKS.',
     {'perWeek': 1, 'days': ['fredag'], 'packedDays': ['mandag', 'tirsdag', 'onsdag', 'torsdag']}),
    ('AKS serverer mat alle dager unntatt torsdag.',
     {'perWeek': 4, 'days': ['mandag', 'tirsdag', 'onsdag', 'fredag']}),
    ('Barna får servert varmmat hver dag, utenom fredag.', {'warm': True, 'warmPerWeek': 4}),
    ('Alle får servert varmmat eller knekkebrød med pålegg og frukt hver dag.', {'warm': True, 'perWeek': 5}),
    ('Varmmat 2 dager og brødmat 3 dager i uken.', {'warm': True}),
    ('Vi serverer varm mat 5 dager i uka.', {'warm': True, 'warmPerWeek': 5, 'perWeek': 5}),
    ('Vi har varm mat siste fredag i måneden.', {'warm': True}),
    ('Barna må ha med to matpakker hver dag, én til skolen og én til AKS.', {}),
    ('AKS serverer frukt mandag og onsdag.', {}),
    ('Vi lager mat 2-3 ganger pr. uke.', {}),
    ('I skolens ferier serverer vi mat hver dag.', {}),
    ('Vi serverer mat hver dag, unntatt i ferier.', {'perWeek': 5}),
    ('De som vil spise frokost tirsdag og torsdag kan ta med matpakke.', {}),
    ('AKS tilbyr mat to dager pr uke, matpakke må tas med til AKS tre dager pr uke.', {'perWeek': 2}),
    ('Hver base får servert varm mat 2 ganger i uka og brødmat 2 ganger i uka.', {'warm': True, 'warmPerWeek': 2}),
    ('Tre ganger i uka serveres varm mat.', {'warm': True, 'warmPerWeek': 3}),
    ('De andre dagene (mandag, tirsdag og torsdag) må barna ha med seg en ekstra matpakke.',
     {'packedDays': ['mandag', 'tirsdag', 'torsdag']}),
    ('Vi serverer mat mandag og onsdag, de andre dagene må barna ha med ekstra matpakke.',
     {'perWeek': 2, 'days': ['mandag', 'onsdag']}),
    ('trinn: Vi serverer varm mat på mandager og fredager.', {}),
    ('Mandager og onsdager serverer vi frukt, men barna må i tillegg ha med ekstra matpakke.',
     {'packedDays': ['mandag', 'onsdag']}),
]


def run_examples():
    failed = 0
    for text, expected in EXAMPLES:
        got = extract(text)
        if got != expected:
            failed += 1
            print(f"  FAIL {text!r}\n       expected {expected}\n       got      {got}")
    print(f"  {len(EXAMPLES) - failed} of {len(EXAMPLES)} examples pass")
    return failed == 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Read food facts from the AKS pages of Oslo schools.')
    parser.add_argument('--refresh', action='store_true', help='read the pages again')
    parser.add_argument('--test', action='store_true', help='check the rules on example sentences')
    args = parser.parse_args()
    if args.test:
        raise SystemExit(0 if run_examples() else 1)
    if args.refresh or not CACHE_FILE.exists():
        refresh_cache()
    cache = load_cache()
    for orgnr, entry in cache['schools'].items():
        print(orgnr, entry['url'].split('//')[1].split('.')[0], entry['facts'])
