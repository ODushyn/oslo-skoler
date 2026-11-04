"""
Local web server for working on the site: like `python3 -m http.server`, but it tells the browser not to
keep old copies (Cache-Control: no-store), so a reload always shows the latest HTML, CSS and JS.

    python3 dev_server.py          # http://localhost:8000
    python3 dev_server.py 8080     # another port

GitHub Pages serves the real site; this is only for local testing.
"""
import functools
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).parent))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'Skolekartet on http://localhost:{port} (no browser cache). Stop with Ctrl+C.')
        server.serve_forever()


if __name__ == '__main__':
    main()
