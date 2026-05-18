from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

from datasets import get_or_build_profiles


ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/health":
            self.send_json(b'{"ok":true,"service":"sofia-district-intelligence"}')
            return

        if path == "/api/profiles":
            force = "refresh" in self.path
            try:
                body = get_or_build_profiles(force=force)
            except Exception as exc:  # noqa: BLE001
                self.send_error(502, f"SofiaPlan fetch failed: {exc}")
                return
            self.send_json(body)
            return

        super().do_GET()

    def send_json(self, body: bytes):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(os.environ.get("PORT", "8081"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Интелигентна карта на София: http://127.0.0.1:{port}")
    print("Отговорите от СофияПлан се кешират в .cache/sofiaplan")
    server.serve_forever()


if __name__ == "__main__":
    main()
