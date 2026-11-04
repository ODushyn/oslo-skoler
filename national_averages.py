"""
National averages on the national tests (nasjonale prøver), per school year and level.

Read from the raw Udir files in source-data/ (row "Alle skoler", Hele landet), the same
open data (NLOD) as the school results. Written to static/js/landssnitt.json:

    {"barneskole": {"2025-26": {"engelsk": 50, "lesing": 49, "regning": 49, "snitt": 49.3}, ...},
     "ungdomsskole": {...}}

The scale has no maximum: it was set so that the national average was 50 in 2022, with a
standard deviation of 10. The school page shows the national average next to the school's
own result instead of an "out of" value.

Kommune averages for the newest school year (rows with EnhetNivaa 3, "Alle skoler" in the
kommune) go to static/js/kommunesnitt.json, keyed by the kommune name as in the Udir files:

    {"year": "2025-26", "barneskole": {"Oslo": {"engelsk": 52, "lesing": 51, "regning": 52}, ...}, ...}

Run (create_map.py also runs it):
    python national_averages.py
"""
import glob
import json
import re
from pathlib import Path

from school_locations import read_udir_file

OUTPUT = Path('static/js/landssnitt.json')
KOMMUNE_OUTPUT = Path('static/js/kommunesnitt.json')
SUBJECTS = ('Engelsk', 'Lesing', 'Regning')


def _number(text):
    try:
        return float(str(text).replace(',', '.'))
    except (TypeError, ValueError):
        return None


def national_averages(pattern='source-data/*.csv'):
    result = {'barneskole': {}, 'ungdomsskole': {}}
    for path in sorted(glob.glob(pattern)):
        level = 'barneskole' if '5._trinn' in path else 'ungdomsskole'
        row = next((r for r in read_udir_file(path) if r.get('EnhetNivaa') == '1' and r.get('Nasjonaltkode') == 'I'), None)
        if not row:
            continue
        for column, value in row.items():
            match = re.match(r'(\d{4}-\d{2})\.(Engelsk|Lesing|Regning)\.(\d+)\. årstrinn\..*Skalapoeng$', column or '')
            # Ungdomsskole results on the map are 8. trinn
            if not match or (level == 'ungdomsskole' and match.group(3) != '8'):
                continue
            year, subject = match.group(1), match.group(2).lower()
            result[level].setdefault(year, {})[subject] = _number(value)
    for years in result.values():
        for scores in years.values():
            valid = [scores.get(s.lower()) for s in SUBJECTS if scores.get(s.lower()) is not None]
            scores['snitt'] = round(sum(valid) / len(valid), 1) if valid else None
    return result


def _scores(row, level):
    """{'engelsk': 52.0, ...} from one row of a Udir file (8. trinn for ungdomsskole)."""
    scores = {}
    for column, value in row.items():
        match = re.match(r'(\d{4}-\d{2})\.(Engelsk|Lesing|Regning)\.(\d+)\. årstrinn\..*Skalapoeng$', column or '')
        if match and not (level == 'ungdomsskole' and match.group(3) != '8') and _number(value) is not None:
            scores[match.group(2).lower()] = _number(value)
    return scores


def kommune_averages(pattern='source-data/*.csv'):
    files = sorted(glob.glob(pattern))
    year = max(Path(f).name[:7] for f in files)
    result = {'year': year, 'barneskole': {}, 'ungdomsskole': {}}
    for path in files:
        if not Path(path).name.startswith(year):
            continue
        level = 'barneskole' if '5._trinn' in path else 'ungdomsskole'
        for row in read_udir_file(path):
            if row.get('EnhetNivaa') == '3' and row.get('Kommune'):
                scores = _scores(row, level)
                if scores:
                    result[level][row['Kommune'].strip()] = scores
    return result


def main():
    data = national_averages()
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    kommuner = kommune_averages()
    KOMMUNE_OUTPUT.write_text(json.dumps(kommuner, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Saved kommune averages {kommuner['year']} to {KOMMUNE_OUTPUT}: "
          f"{len(kommuner['barneskole'])} barneskole, {len(kommuner['ungdomsskole'])} ungdomsskole")
    print(f"Saved national averages to {OUTPUT}: " +
          ', '.join(f"{level} {sorted(years)}" for level, years in data.items()))


if __name__ == '__main__':
    main()
