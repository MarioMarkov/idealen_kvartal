"""Fetches and joins SofiaPlan datasets into a single composite profile.

Keeps stdlib-only. Each dataset is cached as raw JSON under .cache/sofiaplan/.
The composite (boundaries enriched with rent + air metrics) is cached under
.cache/sofiaplan/profiles.json so the server can serve it instantly.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache" / "sofiaplan"
SOFIAPLAN_API = "https://api.sofiaplan.bg/datasets"
SOFIAPLAN_PAGE = "https://sofiaplan.bg/portfolio/opendata"


DATASETS = {
    "boundaries": {
        "id": 266,
        "label": "Планови единици",
        "internal": True,
    },
    "rent": {
        "id": 624,
        "label": "Цени за наем и покупка на имоти",
        "category": "Основни икономически показатели",
        "metric": "rentPrice",
        "metric_label": "Наем (€/м²)",
        "metric_field": "naem_ap_kv_m",
    },
    "air": {
        "id": 165,
        "label": "Качество на въздуха (ФПЧ)",
        "category": "Атмосферен въздух",
        "metric": "airQuality",
        "metric_label": "ФПЧ10 (µg/m³)",
        "metric_field": "p1",
    },
}


def fetch_raw(dataset_id: int) -> bytes:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{dataset_id}.json"
    if cache_file.exists():
        return cache_file.read_bytes()

    request = Request(
        f"{SOFIAPLAN_API}/{dataset_id}",
        headers={
            "Accept": "application/json",
            "User-Agent": "SofiaDistrictIntelligence/0.2",
        },
    )
    with urlopen(request, timeout=120) as response:
        body = response.read()
    cache_file.write_bytes(body)
    return body


def load_geojson(dataset_id: int) -> dict:
    return json.loads(fetch_raw(dataset_id))


def feature_centroid(feature: dict) -> tuple[float, float] | None:
    geometry = feature.get("geometry") or {}
    points: list[tuple[float, float]] = []
    _walk_coords(geometry.get("coordinates"), points)
    if not points:
        return None
    lon = sum(p[0] for p in points) / len(points)
    lat = sum(p[1] for p in points) / len(points)
    return (lon, lat)


def _walk_coords(value, points: list[tuple[float, float]]):
    if not isinstance(value, list):
        return
    if len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
        points.append((float(value[0]), float(value[1])))
        return
    for child in value:
        _walk_coords(child, points)


def feature_bbox(feature: dict) -> tuple[float, float, float, float] | None:
    geometry = feature.get("geometry") or {}
    points: list[tuple[float, float]] = []
    _walk_coords(geometry.get("coordinates"), points)
    if not points:
        return None
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    return (min(lons), min(lats), max(lons), max(lats))


def point_in_polygon(point: tuple[float, float], rings: list) -> bool:
    if not rings:
        return False
    if not _point_in_ring(point, rings[0]):
        return False
    for hole in rings[1:]:
        if _point_in_ring(point, hole):
            return False
    return True


def _point_in_ring(point: tuple[float, float], ring: list) -> bool:
    x, y = point
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_feature(point: tuple[float, float], feature: dict) -> bool:
    geometry = feature.get("geometry") or {}
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Polygon":
        return point_in_polygon(point, coords)
    if gtype == "MultiPolygon":
        return any(point_in_polygon(point, polygon) for polygon in coords)
    return False


def _as_number(value) -> float | None:
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if num != num:  # NaN
        return None
    return num


def _latest_rent_by_unit(rent_features: Iterable[dict]) -> dict[str, float]:
    """For each planning unit (ge_id), pick the latest year's apartment rent."""
    by_unit: dict[str, tuple[int, float]] = {}
    for feature in rent_features:
        props = feature.get("properties") or {}
        unit_id = props.get("ge_id")
        if unit_id is None:
            continue
        key = str(unit_id)
        year = int(_as_number(props.get("godina")) or 0)
        rent = _as_number(props.get("naem_ap_kv_m"))
        if rent is None:
            continue
        previous = by_unit.get(key)
        if previous is None or year > previous[0]:
            by_unit[key] = (year, rent)
    return {key: value for key, (_, value) in by_unit.items()}


def _latest_air_by_sensor(air_features: Iterable[dict]) -> list[tuple[tuple[float, float], float]]:
    """Take the latest year per sensor location, return (centroid, p1) tuples."""
    by_sensor: dict[float, tuple[int, float, tuple[float, float]]] = {}
    for feature in air_features:
        props = feature.get("properties") or {}
        location = props.get("location")
        if location is None:
            continue
        year = int(_as_number(props.get("year")) or 0)
        pm = _as_number(props.get("p1"))
        if pm is None:
            continue
        centroid = feature_centroid(feature)
        if centroid is None:
            continue
        previous = by_sensor.get(location)
        if previous is None or year > previous[0]:
            by_sensor[location] = (year, pm, centroid)
    return [(centroid, pm) for (_, pm, centroid) in by_sensor.values()]


def _bbox_contains(bbox: tuple[float, float, float, float], point: tuple[float, float]) -> bool:
    return bbox[0] <= point[0] <= bbox[2] and bbox[1] <= point[1] <= bbox[3]


def build_profiles() -> dict:
    """Fetch all required datasets, join them, and return the composite payload."""
    boundaries = load_geojson(266)
    rent = load_geojson(624)
    air = load_geojson(165)

    rent_by_unit = _latest_rent_by_unit(rent.get("features") or [])
    if rent_by_unit:
        avg_rent = sum(rent_by_unit.values()) / len(rent_by_unit)
        cutoff = avg_rent * 2  # drop values >100% above the average
        rent_by_unit = {key: value for key, value in rent_by_unit.items() if value <= cutoff}
    air_points = _latest_air_by_sensor(air.get("features") or [])

    features_out: list[dict] = []
    for feature in boundaries.get("features") or []:
        props = feature.get("properties") or {}
        unit_id = props.get("id")
        if unit_id is None:
            continue
        key = str(unit_id)
        rent_value = rent_by_unit.get(key)

        bbox = feature_bbox(feature)
        inside_pm = []
        if bbox is not None:
            for (point, pm) in air_points:
                if not _bbox_contains(bbox, point):
                    continue
                if point_in_feature(point, feature):
                    inside_pm.append(pm)
        air_value = statistics.fmean(inside_pm) if inside_pm else None

        features_out.append({
            "type": "Feature",
            "geometry": feature.get("geometry"),
            "properties": {
                "id": key,
                "name": props.get("regname") or f"Планова единица {key}",
                "district": props.get("rajon") or "",
                "rentPrice": rent_value,
                "airQuality": air_value,
                "airSamples": len(inside_pm),
            },
        })

    ranges = {}
    for metric in ("rentPrice", "airQuality"):
        values = [f["properties"][metric] for f in features_out if isinstance(f["properties"][metric], (int, float))]
        if values:
            ranges[metric] = {
                "min": min(values),
                "max": max(values),
                "avg": sum(values) / len(values),
                "count": len(values),
            }
        else:
            ranges[metric] = {"min": 0, "max": 1, "avg": None, "count": 0}

    dataset_meta = []
    for key, config in DATASETS.items():
        if config.get("internal"):
            continue
        dataset_meta.append({
            "key": key,
            "label": config["label"],
            "category": config.get("category", ""),
            "metric": config["metric"],
            "metricLabel": config["metric_label"],
            "datasetId": config["id"],
            "apiUrl": f"{SOFIAPLAN_API}/{config['id']}",
            "pageUrl": SOFIAPLAN_PAGE,
            "rowCount": ranges[config["metric"]]["count"],
        })

    return {
        "type": "FeatureCollection",
        "datasets": dataset_meta,
        "ranges": ranges,
        "features": features_out,
    }


def get_or_build_profiles(force: bool = False) -> bytes:
    cache_file = CACHE_DIR / "profiles.json"
    if cache_file.exists() and not force:
        return cache_file.read_bytes()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = build_profiles()
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    cache_file.write_bytes(body)
    return body


if __name__ == "__main__":
    body = get_or_build_profiles(force=True)
    print(f"Built profiles.json: {len(body):,} bytes")
