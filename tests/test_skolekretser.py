import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest import mock

try:
    from tests import _path  # noqa: F401
except ImportError:
    import _path  # noqa: F401

import skolekretser as sk

# A 1x1 square with a 0.4x0.4 hole in the middle; coordinates are [lng, lat]
SQUARE = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
HOLE = [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.3]]


def utm_forward(lat, lng, zone):
    """Independent forward transverse Mercator (Krüger series, GRS80) for the round trip."""
    a, f, k0 = 6378137.0, 1 / 298.257222101, 0.9996
    n = f / (2 - f)
    big_a = a / (1 + n) * (1 + n ** 2 / 4 + n ** 4 / 64)
    alpha = [n / 2 - 2 * n ** 2 / 3 + 5 * n ** 3 / 16, 13 * n ** 2 / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240]
    phi, lam = math.radians(lat), math.radians(lng - (zone * 6 - 183))
    c = 2 * math.sqrt(n) / (1 + n)
    t = math.sinh(math.atanh(math.sin(phi)) - c * math.atanh(c * math.sin(phi)))
    xi, eta = math.atan(t / math.cos(lam)), math.atanh(math.sin(lam) / math.sqrt(1 + t * t))
    east = 500000 + k0 * big_a * (eta + sum(al * math.cos(2 * j * xi) * math.sinh(2 * j * eta)
                                            for j, al in enumerate(alpha, 1)))
    north = k0 * big_a * (xi + sum(al * math.sin(2 * j * xi) * math.cosh(2 * j * eta)
                                   for j, al in enumerate(alpha, 1)))
    return north, east


class InsideTest(unittest.TestCase):
    def test_square(self):
        self.assertTrue(sk._inside(0.5, 0.1, [SQUARE]))
        self.assertFalse(sk._inside(1.5, 0.5, [SQUARE]))
        self.assertFalse(sk._inside(0.5, -0.1, [SQUARE]))

    def test_hole(self):
        self.assertFalse(sk._inside(0.5, 0.5, [SQUARE, HOLE]))
        self.assertTrue(sk._inside(0.1, 0.5, [SQUARE, HOLE]))

    def test_open_ring_works_too(self):
        self.assertTrue(sk._inside(0.5, 0.5, [SQUARE[:-1]]))


class MetresToBorderTest(unittest.TestCase):
    def test_distance_to_nearest_edge(self):
        lat = 60.0
        ring = [[10.0, lat], [10.01, lat], [10.01, lat + 0.01], [10.0, lat + 0.01], [10.0, lat]]
        # 0.001 degrees north of the south edge, in the middle of it
        self.assertAlmostEqual(sk._metres_to_border(10.005, lat + 0.001, [ring]), 111.32, delta=0.5)

    def test_degenerate_zero_length_segment(self):
        ring = [[10.0, 60.0], [10.0, 60.0]]   # one point twice: no division by zero
        d = sk._metres_to_border(10.0, 60.001, [ring])
        self.assertAlmostEqual(d, 111.32, delta=0.5)

    def test_no_segments(self):
        self.assertEqual(sk._metres_to_border(10.0, 60.0, [[[10.0, 60.0]]]), float('inf'))


class DissolveTest(unittest.TestCase):
    def test_two_adjacent_squares_become_one_ring(self):
        left = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        right = [[[1, 1], [2, 1], [2, 0], [1, 0], [1, 1]]]   # clockwise: is turned round
        rings = sk._dissolve([left, right])
        self.assertEqual(len(rings), 1)
        ring = [tuple(p) for p in rings[0]]
        self.assertEqual(ring[0], ring[-1])
        self.assertEqual(set(ring), {(0, 0), (1, 0), (2, 0), (2, 1), (1, 1), (0, 1)})
        self.assertEqual(len(ring), 7)
        edges = {frozenset(e) for e in zip(ring, ring[1:])}
        self.assertNotIn(frozenset({(1, 0), (1, 1)}), edges)

    def test_separate_squares_stay_separate(self):
        a = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        b = [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]
        self.assertEqual(len(sk._dissolve([a, b])), 2)


class PostnummerTest(unittest.TestCase):
    def test_min_share_is_respected(self):
        self.assertEqual(sk.POSTAL_MIN_SHARE, 0.10)

        def strip(number, x1, x2):
            ring = [(x1, 0), (x2, 0), (x2, 1), (x1, 1), (x1, 0)]
            return number, [ring], (x1, 0, x2, 1)

        # The krets is the unit square, sampled on a 20x20 grid (x = 0.025, 0.075, ... 0.975):
        # 0000 gets 17 columns (85 %), 1111 two columns (exactly 10 %), 2222 one column (5 %)
        areas = [strip('0000', 0, 0.85), strip('1111', 0.85, 0.95), strip('2222', 0.95, 1)]
        calls = []

        def fake(south, west, north, east):
            calls.append((south, west, north, east))
            return areas

        kretser = [{'kommune': 'Testby', 'name': 'A', 'rings': [SQUARE]}]
        with mock.patch.object(sk, 'postal_areas', fake), mock.patch('builtins.print'):
            sk.add_postnummer(kretser)
        self.assertEqual(calls, [(0, 0, 1, 1)])
        self.assertEqual(kretser[0]['postnummer'], ['0000', '1111'])

    def test_outside_areas_give_nothing(self):
        kretser = [{'kommune': 'Testby', 'name': 'A', 'rings': [SQUARE]}]
        far = ('9999', [[(5, 5), (6, 5), (6, 6), (5, 6), (5, 5)]], (5, 5, 6, 6))
        with mock.patch.object(sk, 'postal_areas', lambda *a: [far]), mock.patch('builtins.print'):
            sk.add_postnummer(kretser)
        self.assertEqual(kretser[0]['postnummer'], [])


class UtmTest(unittest.TestCase):
    def test_central_meridian(self):
        lat, lng = sk.utm_to_latlng(6650000, 500000, 32)
        self.assertAlmostEqual(lng, 9.0, places=9)

    def test_oslo_round_trip_within_a_metre(self):
        lat, lng = 59.91273, 10.74609    # Oslo sentrum
        north, east = utm_forward(lat, lng, 32)
        self.assertAlmostEqual(east, 597_000, delta=1_000)       # sanity: Oslo is about E 597 km, N 6643 km
        self.assertAlmostEqual(north, 6_643_000, delta=1_000)
        got_lat, got_lng = sk.utm_to_latlng(north, east, 32)
        self.assertLess(abs(got_lat - lat) * 111_320, 1.0)
        self.assertLess(abs(got_lng - lng) * 111_320 * math.cos(math.radians(lat)), 1.0)


class MatchSchoolsTest(unittest.TestCase):
    def setUp(self):
        schools = [
            {'name': 'Majorstuen skole', 'kommune': 'Oslo', 'schoolType': 'barneskole'},
            {'name': 'Tiurleiken skole', 'kommune': 'Oslo', 'schoolType': 'barneskole'},
            {'name': 'Tistedal skole', 'kommune': 'Halden', 'schoolType': 'barneskole'},
            {'name': 'Tistedal ungdomsskole', 'kommune': 'Halden', 'schoolType': 'ungdomsskole'},
            {'name': 'Privat skole', 'kommune': 'Halden', 'schoolType': 'barneskole', 'eierform': 'privat'},
        ]
        self.tmp = tempfile.TemporaryDirectory()
        path = Path(self.tmp.name) / 'school-data.json'
        path.write_text(json.dumps({'schools': schools}), encoding='utf-8')
        patcher = mock.patch.object(sk, 'SCHOOL_DATA', path)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_aliases_and_fuzzy_names(self):
        kretser = [
            {'kommune': 'Oslo', 'level': 'barneskole', 'name': 'Majorstua'},
            {'kommune': 'Oslo', 'level': 'barneskole', 'name': 'Svarttjern og Tiurleiken'},
            {'kommune': 'Stavanger', 'level': 'barneskole', 'name': 'Fogn'},
            {'kommune': 'Halden', 'level': 'barneskole', 'name': 'Tistedal'},
            {'kommune': 'Halden', 'level': 'barneskole', 'name': 'Privat'},   # private schools are left out
        ]
        unmatched = sk.match_schools(kretser)
        self.assertEqual([k['school'] for k in kretser],
                         ['Majorstuen skole', 'Tiurleiken skole', 'Fogn oppvekstsenter', 'Tistedal skole', None])
        self.assertEqual(unmatched, ['Privat (Halden, barneskole)'])


class SavedKommunerTest(unittest.TestCase):
    def test_kretser_and_sources_are_added(self):
        saved = {'kommuner': {'Bergen': {'levels': ['barneskole'], 'source': 'Bergen kommune'}},
                 'kretser': [{'kommune': 'Bergen', 'level': 'barneskole', 'name': 'Ny-Krohnborg',
                              'school': 'Ny-Krohnborg skole', 'rings': [SQUARE]}]}
        with tempfile.TemporaryDirectory() as folder, mock.patch.dict(sk.SOURCES, clear=False):
            path = Path(folder) / 'saved.json'
            path.write_text(json.dumps(saved), encoding='utf-8')
            self.assertEqual(sk.saved_kommuner(path), saved['kretser'])
            self.assertEqual(sk.SOURCES['Bergen']['source'], 'Bergen kommune')

    def test_missing_file_gives_nothing(self):
        self.assertEqual(sk.saved_kommuner(Path('no-such-file.json')), [])


if __name__ == '__main__':
    unittest.main()
