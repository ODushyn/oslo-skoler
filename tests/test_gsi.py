import unittest

try:
    from tests import _path  # noqa: F401
except ImportError:
    import _path  # noqa: F401

import gsi

CACHE = {
    'source': 'GSI', 'sourceUrl': 'https://example.org/gsi',
    'national': {'laerertetthet': {'2024-25': {'1-4': 14.0}}, 'elever': {'2024-25': 600000}},
    'kommunes': {'Oslo': {'elever': {'2023-24': 60000, '2024-25': 61000}}},
    'schools': {
        '111': {
            'laerertetthet': {
                '2023-24': {'1-4': 13.0, '5-7': 16.0, '8-10': 18.0},
                '2024-25': {'1-4': 14.0, '5-7': 17.5},          # newest, no 8-10 this year
            },
            'elever': {'2023-24': 300, '2024-25': 320},
            'norsk': {'2024-25': 5.5},
        },
        '222': {'laerertetthet': {'2024-25': {'1-4': 12.0}}},   # only 1-4 reported
    },
}


class NumberTest(unittest.TestCase):
    def test_parses_norwegian_numbers(self):
        self.assertEqual(gsi._number('12,5'), 12.5)
        self.assertEqual(gsi._number('1 234'), 1234.0)
        self.assertEqual(gsi._number('1 234'), 1234.0)   # non-breaking space
        self.assertEqual(gsi._number(7), 7.0)

    def test_hidden_or_empty_is_none(self):
        self.assertIsNone(gsi._number('*'))
        self.assertIsNone(gsi._number(''))
        self.assertIsNone(gsi._number(None))


class LatestForTest(unittest.TestCase):
    def test_barneskole_takes_5_7_from_newest_year(self):
        out = gsi.latest_for(CACHE, 111, 'barneskole')
        self.assertEqual(out['laerertetthet'], 17.5)
        self.assertEqual(out['laerertetthetYear'], '2024-25')
        self.assertEqual((out['elever'], out['eleverYear']), (320, '2024-25'))
        self.assertEqual((out['norsk'], out['norskYear']), (5.5, '2024-25'))

    def test_ungdomsskole_falls_back_to_year_with_8_10(self):
        out = gsi.latest_for(CACHE, '111', 'ungdomsskole')
        self.assertEqual((out['laerertetthet'], out['laerertetthetYear']), (18.0, '2023-24'))

    def test_barneskole_with_only_1_4(self):
        self.assertEqual(gsi.latest_for(CACHE, '222', 'barneskole'),
                         {'laerertetthet': 12.0, 'laerertetthetYear': '2024-25'})

    def test_nothing_for_the_type(self):
        self.assertIsNone(gsi.latest_for(CACHE, '222', 'ungdomsskole'))

    def test_unknown(self):
        self.assertIsNone(gsi.latest_for(CACHE, '999', 'barneskole'))
        self.assertIsNone(gsi.latest_for(None, '111', 'barneskole'))


class HistoryForTest(unittest.TestCase):
    def test_unknown_orgnr(self):
        self.assertIsNone(gsi.history_for(CACHE, '999', 'Oslo'))
        self.assertIsNone(gsi.history_for(None, '111', 'Oslo'))

    def test_rows_with_kommune_and_national(self):
        out = gsi.history_for(CACHE, 111, 'Oslo')
        self.assertEqual(out['kommune'], 'Oslo')
        self.assertEqual((out['source'], out['sourceUrl']), ('GSI', 'https://example.org/gsi'))
        self.assertEqual([r['year'] for r in out['rows']], ['2023-24', '2024-25'])
        newest = out['rows'][1]
        self.assertEqual(newest['laerertetthet'], {'1-4': 14.0, '5-7': 17.5})
        self.assertEqual(newest['elever'], 320)
        self.assertEqual(newest['kommune'], {'laerertetthet': None, 'elever': 61000, 'norsk': None})
        self.assertEqual(newest['national'], {'laerertetthet': {'1-4': 14.0}, 'elever': 600000, 'norsk': None})
        self.assertEqual(out['rows'][0]['national'], {'laerertetthet': None, 'elever': None, 'norsk': None})

    def test_unknown_kommune(self):
        out = gsi.history_for(CACHE, '111', 'Ingensteds')
        self.assertIsNone(out['kommune'])
        self.assertTrue(all(r['kommune'] is None for r in out['rows']))


if __name__ == '__main__':
    unittest.main()
