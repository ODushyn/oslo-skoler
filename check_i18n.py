"""
Check the translations: every English key (EN in static/js/i18n.js) should have a Ukrainian text
(I18N_UK in static/js/i18n-uk.js) with the same placeholders, such as {count}. Run:
    python check_i18n.py
"""
import json
import re
import subprocess
import sys

SCRIPT = r"""
const fs = require('fs');
const src = fs.readFileSync('static/js/i18n.js', 'utf8');
const start = src.indexOf('const EN = {');
const end = src.indexOf('\n    };', start);
const EN = eval('(' + src.slice(start + 11, end + 6) + ')');
global.window = {};
eval(fs.readFileSync('static/js/i18n-uk.js', 'utf8'));
console.log(JSON.stringify({ en: EN, uk: window.I18N_UK }));
"""


def placeholders(text):
    return sorted(re.findall(r'\{\w+\}', text))


def main():
    data = json.loads(subprocess.run(['node', '-e', SCRIPT], capture_output=True, text=True, check=True).stdout)
    en, uk = data['en'], data['uk']
    missing = [k for k in en if k not in uk]
    extra = [k for k in uk if k not in en]
    wrong = [k for k in en if k in uk and placeholders(k) != placeholders(uk[k])]
    print(f"{len(en)} English texts, {len(uk)} Ukrainian texts")
    for title, keys in (('Missing in Ukrainian', missing), ('Only in Ukrainian', extra), ('Placeholders differ', wrong)):
        if keys:
            print(f"{title} ({len(keys)}):")
            for key in keys:
                print(f"  {key}")
    sys.exit(1 if missing or wrong else 0)


if __name__ == '__main__':
    main()
