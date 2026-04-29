from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import os
import re


ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache" / "sofiaplan"
SOFIAPLAN_ROOT = "https://api.sofiaplan.bg/datasets"
DATASET_PATH = re.compile(r"^/api/sofiaplan/datasets/(\d+)/?$")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/health":
            self.send_json(b'{"ok":true,"service":"sofia-district-intelligence"}', cache_status="BYPASS")
            return

        match = DATASET_PATH.match(path)
        if match:
            self.proxy_dataset(match.group(1))
            return

        super().do_GET()

    def proxy_dataset(self, dataset_id):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / f"{dataset_id}.json"

        if cache_file.exists():
            self.send_json(cache_file.read_bytes(), cache_status="HIT")
            return

        request = Request(
            f"{SOFIAPLAN_ROOT}/{dataset_id}",
            headers={
                "Accept": "application/json",
                "User-Agent": "SofiaDistrictIntelligence/0.1",
            },
        )

        try:
            with urlopen(request, timeout=90) as response:
                body = response.read()
        except HTTPError as error:
            self.send_error(error.code, f"SofiaPlan API error: {error.reason}")
            return
        except URLError as error:
            self.send_error(502, f"Could not reach SofiaPlan API: {error.reason}")
            return
        except TimeoutError:
            self.send_error(504, "Timed out while fetching SofiaPlan API")
            return

        cache_file.write_bytes(body)
        self.send_json(body, cache_status="MISS")

    def send_json(self, body, cache_status):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.send_header("X-SofiaPlan-Cache", cache_status)
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
