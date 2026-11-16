# Tests

Nothing to install: Python 3.12 (standard library only) and Node 20 or newer. Run from the repository root.

```sh
python3 -m unittest discover -s tests -v   # Python unit tests (skolekretser, gsi, elevundersokelsen)
node --test tests/js/*.test.mjs            # JavaScript unit tests (static/js/shared.js)
python3 tests/check_data.py                # sanity checks on the built data, also runs check_i18n.py
```

- `test_*.py` test pure helpers with small inline fixtures; nothing is downloaded.
- `js/shared.test.mjs` loads `static/js/shared.js` in a `vm` context with stubs for `t()` and `I18N`.
  Name the files (the glob): newer Node versions read a directory argument as a file name.
- `check_data.py` reads `static/js/school-data.json`, `static/js/skolekretser.json`, `sitemap.xml`,
  `static/data/skoler/*.json` and `source-data/*.geojson`. It prints every problem and exits 1 when
  there is one. It also fails on test kretser left in the data.

CI (`.github/workflows/ci.yml`) runs all three on every push and pull request. The nightly refresh
(`oppdater-data.yml`) runs `check_data.py` after rebuilding and does not commit when it fails.
