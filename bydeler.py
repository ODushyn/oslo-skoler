"""
Bydeler (city districts) in Oslo for the map page (kart.html).

Oslo kommune does not publish the bydel boundaries as open data (Geonorge, November 2026).
OpenStreetMap has them as administrative boundaries (admin_level 9 inside Oslo, relation 406091),
under the Open Database License (ODbL): free to use with the credit «© OpenStreetMap».
Besides the 15 bydeler, OpenStreetMap has Sentrum and Marka, which belong to no bydel.

The Overpass API answers only requests that name the program (User-Agent).

Writes static/js/bydeler-oslo.json. Run:
    python bydeler.py                 # asks the Overpass API
    python bydeler.py overpass.json   # uses an answer saved earlier, e.g. with curl
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

OUTPUT = Path('static/js/bydeler-oslo.json')
SCHOOL_DATA = Path('static/js/school-data.json')
USER_AGENT = 'skolekartet.no data refresh (https://skolekartet.no)'
OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
QUERY = ('[out:json][timeout:100];area(3600406091)->.oslo;'
         'rel(area.oslo)["boundary"="administrative"]["admin_level"="9"];out geom;')
NOT_BYDEL = {'Sentrum', 'Marka'}
BYDELER = 15
TOLERANCE = 0.00004  # degrees, about 3 metres: drops points that do not change the line
SOURCE = {
    'source': 'OpenStreetMap, administrative grenser for Oslo (ODbL)',
    'sourceUrl': 'https://www.openstreetmap.org/relation/406091',
    'licence': '© OpenStreetMap-bidragsytere, Open Database License',
}


def fetch():
    if len(sys.argv) > 1:
        return json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    data = urllib.parse.urlencode({'data': QUERY}).encode()
    request = urllib.request.Request(OVERPASS_URL, data=data,
                                     headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def join_ways(ways):
    """Joins the ways of one role (outer or inner) end to end into closed rings."""
    ways = [list(w) for w in ways if len(w) > 1]
    rings = []
    while ways:
        ring = ways.pop(0)
        while ring[0] != ring[-1]:
            for i, way in enumerate(ways):
                if way[0] == ring[-1]:
                    ring += way[1:]
                elif way[-1] == ring[-1]:
                    ring += way[-2::-1]
                elif way[-1] == ring[0]:
                    ring = way[:-1] + ring
                elif way[0] == ring[0]:
                    ring = way[:0:-1] + ring
                else:
                    continue
                ways.pop(i)
                break
            else:
                raise ValueError('a ring does not close')
        rings.append(ring)
    return rings


def simplify(points, tolerance=TOLERANCE):
    """Douglas–Peucker on [lng, lat] points; keeps the first and last point."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    length = (dx * dx + dy * dy) ** 0.5
    farthest, index = 0, 0
    for i in range(1, len(points) - 1):
        x, y = points[i]
        distance = (abs(dy * x - dx * y + x2 * y1 - y2 * x1) / length if length
                    else ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5)
        if distance > farthest:
            farthest, index = distance, i
    if farthest <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def _inside(x, y, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def _edge_distance(x, y, ring):
    best = float('inf')
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) if dx or dy else 0
        best = min(best, ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5)
    return best


def school_points():
    """Oslo's schools: they stand on land, while the bydel boundaries in OpenStreetMap reach out into the fjord."""
    data = json.loads(SCHOOL_DATA.read_text(encoding='utf-8'))
    return [(s['lng'], s['lat']) for s in data['schools'] if s.get('kommune') == 'Oslo' and s.get('lat')]


def _near_school(x, y, schools, km=1.0):
    return any(((x - sx) * 55.6) ** 2 + ((y - sy) * 111.2) ** 2 < km * km for sx, sy in schools)


def label_point(rings, schools=()):
    """The point deepest inside the largest ring, where the name fits best (grid search, refined twice).
    Where the bydel has schools, only points within a kilometre of one count, so the name lands on land."""
    ring = max(rings, key=len)
    near = [p for p in schools if _inside(*p, ring)]
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    box = (min(xs), min(ys), max(xs), max(ys))
    best = None
    for _ in range(3):
        x0, y0, x1, y1 = box
        for i in range(25):
            for j in range(25):
                # Longitude degrees are shorter than latitude degrees at 60° north, so compare in kilometres
                x, y = x0 + (x1 - x0) * (i + 0.5) / 25, y0 + (y1 - y0) * (j + 0.5) / 25
                if _inside(x, y, ring) and (not near or _near_school(x, y, near)):
                    depth = _edge_distance(x * 0.5, y, [(px * 0.5, py) for px, py in ring])
                    if best is None or depth > best[0]:
                        best = (depth, x, y)
        _, x, y = best
        w, h = (x1 - x0) / 5, (y1 - y0) / 5
        box = (x - w, y - h, x + w, y + h)
    return [round(best[1], 5), round(best[2], 5)]


def bydel(relation, schools):
    rings = {'outer': [], 'inner': []}
    for member in relation['members']:
        if member['type'] == 'way' and member.get('role') in rings:
            rings[member['role']].append([(p['lon'], p['lat']) for p in member['geometry']])
    outer = [simplify(r) for r in join_ways(rings['outer'])]
    inner = [simplify(r) for r in join_ways(rings['inner'])]
    name = relation['tags']['name']
    return {
        'name': name,
        'bydel': name not in NOT_BYDEL,
        'number': relation['tags'].get('ref'),
        'label': label_point(outer, schools),
        'rings': [[[round(x, 5), round(y, 5)] for x, y in r] for r in outer + inner],
    }


def main():
    schools = school_points()
    bydeler = sorted((bydel(r, schools) for r in fetch()['elements'] if r['type'] == 'relation'), key=lambda b: b['name'])
    count = sum(b['bydel'] for b in bydeler)
    if count != BYDELER:
        raise SystemExit(f'Expected {BYDELER} bydeler, got {count}: {[b["name"] for b in bydeler]}')
    OUTPUT.write_text(json.dumps({**SOURCE, 'bydeler': bydeler}, ensure_ascii=False, separators=(',', ':')),
                      encoding='utf-8')
    print(f"Saved {count} bydeler and {len(bydeler) - count} other areas to {OUTPUT} ({OUTPUT.stat().st_size // 1024} kB)")


if __name__ == '__main__':
    main()
