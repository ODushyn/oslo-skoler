import unittest

try:
    from tests import _path  # noqa: F401
except ImportError:
    import _path  # noqa: F401

import elevundersokelsen as eu


class NumberTest(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(eu._number('4,2'), 4.2)
        self.assertEqual(eu._number('12'), 12.0)
        self.assertEqual(eu._number(3.5), 3.5)

    def test_hidden(self):
        for value in ('*', '', None, 'n/a'):
            self.assertIsNone(eu._number(value))


TRIVSEL = {'year': '2025-26', 'national': {'7': 4.1, '10': 4.0}, 'schools': {
    '111': {'7': {'score': 4.3, 'answers': 52.0}, '10': {'score': None, 'answers': 3.0}},
    '222': {'10': {'score': 3.9, 'answers': None}},
}}
MOBBING = {'year': '2025-26', 'national': {'7': 6.1, '10': 8.0}, 'schools': {'111': {'7': 4.0}}}


class TrivselForTest(unittest.TestCase):
    def test_barneskole_uses_7(self):
        self.assertEqual(eu.trivsel_for(TRIVSEL, '111', 'barneskole'),
                         {'score': 4.3, 'trinn': '7', 'year': '2025-26', 'answers': 52, 'national': 4.1})

    def test_hidden_score(self):
        self.assertIsNone(eu.trivsel_for(TRIVSEL, '111', 'ungdomsskole'))

    def test_no_answers(self):
        self.assertIsNone(eu.trivsel_for(TRIVSEL, '222', 'ungdomsskole')['answers'])

    def test_missing(self):
        self.assertIsNone(eu.trivsel_for(TRIVSEL, None, 'barneskole'))
        self.assertIsNone(eu.trivsel_for(TRIVSEL, '999', 'barneskole'))


class MobbingForTest(unittest.TestCase):
    def test_found(self):
        self.assertEqual(eu.mobbing_for(MOBBING, '111', 'barneskole'),
                         {'share': 4.0, 'trinn': '7', 'year': '2025-26', 'national': 6.1})

    def test_missing(self):
        self.assertIsNone(eu.mobbing_for(MOBBING, '111', 'ungdomsskole'))
        self.assertIsNone(eu.mobbing_for(MOBBING, '', 'barneskole'))


class HistoryForTest(unittest.TestCase):
    def test_sorted_years_with_national(self):
        history = {
            'trivsel': {'national': {'7': {'2023-24': 4.2, '2024-25': 4.3}},
                        'schools': {'111': {'7': {'2024-25': 4.5, '2023-24': 4.1}}}},
            'mobbing': {'national': {}, 'schools': {}},
        }
        self.assertEqual(eu.history_for(history, '111'), {'trivsel': {'7': [
            {'year': '2023-24', 'value': 4.1, 'national': 4.2},
            {'year': '2024-25', 'value': 4.5, 'national': 4.3}]}})
        self.assertEqual(eu.history_for(history, '999'), {})


class IndicatorsForTest(unittest.TestCase):
    def test_rows(self):
        cache = {
            'years': ['2024-25', '2025-26'], 'labels': {'trivsel': 'Trivsel'},
            'national': {'trivsel': {'7': {'2025-26': 4.2}}},
            'kommuner': {'0301': {'name': 'Oslo', 'trivsel': {'7': {'2025-26': 4.1}}}},
            'schools': {'111': {'kommune': '0301', 'trivsel': {'7': {'2025-26': [4.4, 50], '2024-25': [None, None]}}}},
        }
        out = eu.indicators_for(cache, '111')
        self.assertEqual(out['kommune'], 'Oslo')
        self.assertEqual(out['years'], ['2024-25', '2025-26'])
        self.assertEqual(out['rows']['trivsel']['7'], [
            {'year': '2024-25', 'value': None, 'answers': None, 'kommune': None, 'national': None},
            {'year': '2025-26', 'value': 4.4, 'answers': 50, 'kommune': 4.1, 'national': 4.2}])
        self.assertIsNone(eu.indicators_for(cache, '999'))


if __name__ == '__main__':
    unittest.main()
