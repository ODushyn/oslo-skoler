"""
Local web server for working on the site: like `python3 -m http.server`, but it tells the browser not to
keep old copies (Cache-Control: no-store), so a reload always shows the latest HTML, CSS and JS. Like GitHub
Pages it serves a page without its .html ending: /kart gives kart.html, /skoler/oslo/majorstuen-skole its page.

    python3 dev_server.py          # http://localhost:8000
    python3 dev_server.py 8080     # another port

GitHub Pages serves the real site; this is only for local testing.

It also takes the choices from the photo review page (review/bilder.html, see photo_search.py): POST
/review/photo-review with {"page": <Commons file page>, "value": "ok" | "no" | ""} saves them in
cached-data/photo-review.json. The server only listens on this computer (127.0.0.1).
"""
import functools
import http.server
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
REVIEW_FILE = ROOT / 'cached-data' / 'photo-review.json'


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        file = super().translate_path(path)
        if not Path(file).exists() and Path(file + '.html').is_file():
            return file + '.html'
        return file

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        if self.path != '/review/photo-review':
            self.send_error(404)
            return
        try:
            choice = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
            page, value = choice.get('page', ''), choice.get('value', '')
            if not page.startswith('https://commons.wikimedia.org/wiki/File:') or value not in ('ok', 'no', ''):
                raise ValueError('not a Commons file page or a known choice')
        except (ValueError, json.JSONDecodeError) as error:
            self.send_error(400, str(error))
            return
        review = json.loads(REVIEW_FILE.read_text(encoding='utf-8')) if REVIEW_FILE.exists() else {}
        if value:
            review[page] = value
        else:
            review.pop(page, None)
        REVIEW_FILE.write_text(json.dumps(dict(sorted(review.items())), ensure_ascii=False, indent=0), encoding='utf-8')
        self.send_response(204)
        self.end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'Skolekartet on http://localhost:{port} (no browser cache). Stop with Ctrl+C.')
        server.serve_forever()


if __name__ == '__main__':
    main()
