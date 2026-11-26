"""Serve the local frontend and its public runtime configuration."""
import base64
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
ASSETS = {"assets", "css", "frames", "js"}


def public_key(key):
    if not key or key.startswith("sb_publishable_"):
        return True
    try:
        payload = key.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "===")).get("role") == "anon"
    except (IndexError, ValueError, AttributeError):
        return False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def do_GET(self):
        self.serve_asset()

    def do_HEAD(self):
        self.serve_asset(head=True)

    def serve_asset(self, head=False):
        path = unquote(urlsplit(self.path).path)
        if path == "/js/runtime-config.js":
            key = os.getenv("SUPABASE_ANON_KEY", "")
            if not public_key(key):
                self.send_error(500, "A public Supabase key is required")
                return
            data = ("window.AtelierRuntime = " + json.dumps({
                "supabaseUrl": os.getenv("SUPABASE_URL", ""),
                "supabaseKey": key,
                "apiUrl": os.getenv("ATELIER_API_URL", "http://127.0.0.1:8001"),
            }) + ";").encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if not head:
                self.wfile.write(data)
            return

        parts = [part for part in path.split("/") if part]
        if path == "/":
            parts = ["index.html"]
        if not parts or any(part.startswith(".") for part in parts):
            self.send_error(404)
            return
        if len(parts) == 1 and not Path(parts[0]).suffix:
            parts[0] += ".html"
        target = ROOT.joinpath(*parts).resolve()
        public = (
            len(parts) == 1 and (target.suffix == ".html" or target.name == "video.mp4")
            or len(parts) > 1 and parts[0] in ASSETS and target.is_relative_to(ROOT / parts[0])
        )
        if not public or not target.is_relative_to(ROOT) or not target.is_file():
            self.send_error(404)
            return
        self.path = "/" + "/".join(parts)
        if head:
            super().do_HEAD()
        else:
            super().do_GET()


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 5500), Handler) as server:
        print("Frontend disponible sur http://localhost:5500", flush=True)
        server.serve_forever()
