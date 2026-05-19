"""Fetches metro stations and surface-transit stops for Sofia from the
OpenStreetMap Overpass API and caches them locally as GeoJSON.

We previously targeted the (now-defunct) SUMC drone.sumc.bg endpoint; OSM/Overpass
covers the same data, is openly licensed (ODbL), and stays reachable.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache" / "sumc"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "SofiaDistrictIntelligence/0.3 (contact: local)"

# Rough bounding box around Sofia (south, west, north, east)
SOFIA_BBOX = (42.55, 23.18, 42.78, 23.50)


METRO_QUERY = """
[out:json][timeout:60];
(
  node["station"="subway"](42.55,23.18,42.78,23.50);
  node["railway"="station"]["subway"="yes"](42.55,23.18,42.78,23.50);
  node["public_transport"="station"]["subway"="yes"](42.55,23.18,42.78,23.50);
  way["station"="subway"](42.55,23.18,42.78,23.50);
  way["railway"="station"]["subway"="yes"](42.55,23.18,42.78,23.50);
  relation["station"="subway"](42.55,23.18,42.78,23.50);
);
out center;
""".strip()


STOPS_QUERY = """
[out:json][timeout:120];
(
  node["highway"="bus_stop"](42.55,23.18,42.78,23.50);
  node["railway"="tram_stop"](42.55,23.18,42.78,23.50);
  node["public_transport"="stop_position"]["bus"="yes"](42.55,23.18,42.78,23.50);
  node["public_transport"="stop_position"]["tram"="yes"](42.55,23.18,42.78,23.50);
  node["public_transport"="stop_position"]["trolleybus"="yes"](42.55,23.18,42.78,23.50);
);
out;
""".strip()


def _overpass(query: str) -> bytes:
    body = urlencode({"data": query}).encode("utf-8")
    request = Request(
        OVERPASS_URL,
        data=body,
        headers={
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urlopen(request, timeout=180) as response:
        return response.read()


def _vehicle_type_for(tags: dict) -> str:
    if tags.get("railway") == "tram_stop" or tags.get("tram") == "yes":
        return "tram"
    if tags.get("trolleybus") == "yes":
        return "trolleybus"
    return "bus"


def _to_geojson(elements: list, *, kind: str) -> dict:
    seen: set[tuple[float, float, str]] = set()
    features = []
    for el in elements:
        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None or lon is None:
            center = el.get("center") or {}
            lat = center.get("lat")
            lon = center.get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags") or {}
        name = (tags.get("name:bg") or tags.get("name") or "").strip()
        # Dedupe near-duplicate stops sharing a name/location.
        key = (round(float(lat), 5), round(float(lon), 5), name)
        if key in seen:
            continue
        seen.add(key)

        props: dict = {
            "osmId": el.get("id"),
            "name": name,
            "code": tags.get("ref") or tags.get("local_ref") or "",
        }
        if kind == "metro":
            props["network"] = tags.get("network") or ""
            props["line"] = tags.get("line") or ""
        else:
            props["vehicleType"] = _vehicle_type_for(tags)
            props["operator"] = tags.get("operator") or ""

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": props,
        })

    return {"type": "FeatureCollection", "features": features}


def _build(name: str, query: str, kind: str, force: bool) -> bytes:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / name
    if cache_file.exists() and not force:
        return cache_file.read_bytes()

    raw = _overpass(query)
    data = json.loads(raw)
    payload = _to_geojson(data.get("elements") or [], kind=kind)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    cache_file.write_bytes(body)
    return body


def get_metro_stations(force: bool = False) -> bytes:
    return _build("metro.geojson", METRO_QUERY, kind="metro", force=force)


def get_surface_stops(force: bool = False) -> bytes:
    return _build("stops.geojson", STOPS_QUERY, kind="stops", force=force)


if __name__ == "__main__":
    metro = get_metro_stations(force=True)
    stops = get_surface_stops(force=True)
    metro_count = len(json.loads(metro)["features"])
    stops_count = len(json.loads(stops)["features"])
    print(f"metro.geojson: {metro_count} stations, {len(metro):,} bytes")
    print(f"stops.geojson: {stops_count} stops, {len(stops):,} bytes")
