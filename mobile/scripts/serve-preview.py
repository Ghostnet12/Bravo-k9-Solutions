"""Local-only SPA server for the exported web acceptance tests."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent / 'dist'

class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        route = urlsplit(self.path).path
        if not Path(route).suffix:
            self.path = '/index.html'
        super().do_GET()

    def log_message(self, *_args):
        pass

ThreadingHTTPServer(('127.0.0.1', 8094), Preview).serve_forever()
