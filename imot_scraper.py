import re
import ast
import time
import json
import requests

BASE = "https://www.imot.bg/pcgi"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Referer": "https://www.imot.bg/obiavimap/naemi/grad-sofiya",
}

# Form data copied from the browser. Refresh `slink` from DevTools if results dry up.
MAP_FORM = {
    "locationIdentifier": "", "act": "4", "rub": "2", "topmenu": "2",
    "srcena0": "1865.05", "srcena1": "20.6", "srcena2": "1001",
    "srcena3": "117", "srcena4": "25324",
    "f30": "EUR",
    "f38": "град София",  # requests will encode as windows-1251 below
    "f41": "1", "f53": "0",
    "fe0": "0", "fe1": "0", "fe2": "0", "fe5": "0", "fe6": "0", "fe7": "0", "fe9": "0",
    "slink": "h54ueu", "plink": "0", "plnk": "",
}

MARKER_RE = re.compile(
    r"initGoogleMapS\(new Array\(([^)]*)\),new Array\(([^)]*)\),new Array\(([^)]*)\)",
    re.DOTALL,
)


def fetch_markers(session: requests.Session) -> list[tuple[float, float, str]]:
    # imot.bg expects windows-1251 form encoding for Cyrillic fields
    encoded = {k: (v.encode("windows-1251") if isinstance(v, str) else v) for k, v in MAP_FORM.items()}
    r = session.post(f"{BASE}/mapgfix.cgi", data=encoded, headers=HEADERS, timeout=30)
    r.encoding = "windows-1251"
    m = MARKER_RE.search(r.text)
    if not m:
        raise RuntimeError("marker arrays not found — slink may be expired")
    lats = [float(x.strip().strip("'\"")) for x in m.group(1).split(",")]
    lngs = [float(x.strip().strip("'\"")) for x in m.group(2).split(",")]
    ids  = [x.strip().strip("'\"") for x in m.group(3).split(",")]
    return list(zip(lats, lngs, ids))


def fetch_detail(session: requests.Session, pid: str) -> dict | None:
    r = session.get(f"{BASE}/mapgfixd.cgi", params={"property": pid, "category": "rent"},
                    headers=HEADERS, timeout=15)
    r.encoding = "utf-8"
    text = r.text.strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # response uses Python-style single quotes, not valid JSON
        data = ast.literal_eval(text)
    return data[0] if data else None


LIMIT = 1001  # set to None to scrape all markers


def main():
    s = requests.Session()
    markers = fetch_markers(s)
    print(f"got {len(markers)} markers")
    if LIMIT:
        markers = markers[:LIMIT]
        print(f"limiting to first {len(markers)} for testing")

    total = len(markers)
    out = []
    for i, (lat, lng, pid) in enumerate(markers, 1):
        try:
            d = fetch_detail(s, pid)
        except Exception as e:
            print(f"  [{i}/{total}] {pid} -> error: {e}", flush=True)
            d = None
        if d:
            d.update({"id": pid, "lat": lat, "lng": lng})
            out.append(d)
            print(f"  [{i}/{total}] {pid} -> ok ({len(out)} collected)", flush=True)
        else:
            print(f"  [{i}/{total}] {pid} -> empty", flush=True)
        if i % 50 == 0:
            print(f"--- checkpoint {i}/{total}: {len(out)} listings so far ---", flush=True)
        time.sleep(0.4)

    with open("listings.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"wrote {len(out)} listings to listings.json")


if __name__ == "__main__":
    main()
