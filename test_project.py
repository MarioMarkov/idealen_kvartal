
from __future__ import annotations

import ast
import json
import math
import threading
import unittest
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import urlopen

import datasets
import imot_scraper
import server
import sumc


def polygon_feature(coords, props=None):
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": coords},
        "properties": props or {},
    }


def point_feature(lon, lat, props=None):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props or {},
    }


class FakeResponse:
    def __init__(self, text: str):
        self.text = text
        self.encoding = None


class FakeSession:
    def __init__(self, *, post_text: str = "", get_text: str = ""):
        self.post_text = post_text
        self.get_text = get_text
        self.post_calls = []
        self.get_calls = []

    def post(self, url, data=None, headers=None, timeout=None):
        self.post_calls.append({"url": url, "data": data, "headers": headers, "timeout": timeout})
        return FakeResponse(self.post_text)

    def get(self, url, params=None, headers=None, timeout=None):
        self.get_calls.append({"url": url, "params": params, "headers": headers, "timeout": timeout})
        return FakeResponse(self.get_text)


@contextmanager
def running_test_server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=5)
        httpd.server_close()


class DatasetGeometryTests(unittest.TestCase):
    def test_feature_centroid_and_bbox_walk_nested_polygon_coordinates(self):
        feature = polygon_feature([[[23.0, 42.0], [25.0, 42.0], [25.0, 44.0], [23.0, 44.0], [23.0, 42.0]]])

        self.assertEqual(datasets.feature_bbox(feature), (23.0, 42.0, 25.0, 44.0))
        self.assertEqual(datasets.feature_centroid(feature), (23.8, 42.8))

    def test_point_in_feature_respects_polygon_holes(self):
        feature = polygon_feature([
            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
            [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
        ])

        self.assertTrue(datasets.point_in_feature((2, 2), feature))
        self.assertFalse(datasets.point_in_feature((5, 5), feature))
        self.assertFalse(datasets.point_in_feature((20, 20), feature))

    def test_as_number_rejects_missing_invalid_and_nan_values(self):
        self.assertEqual(datasets._as_number("12.5"), 12.5)
        self.assertIsNone(datasets._as_number(None))
        self.assertIsNone(datasets._as_number("not-a-number"))
        self.assertIsNone(datasets._as_number(float("nan")))


class DatasetJoinTests(unittest.TestCase):
    def test_latest_rent_by_unit_keeps_latest_valid_year_per_unit(self):
        rent_features = [
            {"properties": {"ge_id": "A", "godina": "2021", "naem_ap_kv_m": "8.5"}},
            {"properties": {"ge_id": "A", "godina": "2023", "naem_ap_kv_m": "11.0"}},
            {"properties": {"ge_id": "B", "godina": "2022", "naem_ap_kv_m": "bad"}},
            {"properties": {"ge_id": "B", "godina": "2020", "naem_ap_kv_m": 7}},
            {"properties": {"godina": "2024", "naem_ap_kv_m": 20}},
        ]

        self.assertEqual(datasets._latest_rent_by_unit(rent_features), {"A": 11.0, "B": 7.0})

    def test_latest_air_by_sensor_uses_latest_reading_and_feature_centroid(self):
        air_features = [
            point_feature(23.1, 42.1, {"location": 10, "year": 2020, "p1": 30}),
            point_feature(23.2, 42.2, {"location": 10, "year": 2022, "p1": 25}),
            point_feature(23.3, 42.3, {"location": 20, "year": 2021, "p1": "bad"}),
        ]

        self.assertEqual(datasets._latest_air_by_sensor(air_features), [((23.2, 42.2), 25.0)])

    def test_transit_points_extracts_valid_geojson_points_only(self):
        body = json.dumps({
            "type": "FeatureCollection",
            "features": [
                point_feature(23.1, 42.1),
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": ["bad", 42.2]}},
                {"type": "Feature", "geometry": {"type": "LineString", "coordinates": []}},
            ],
        }).encode("utf-8")

        self.assertEqual(datasets._transit_points(body), [(23.1, 42.1)])


class SumcConversionTests(unittest.TestCase):
    def test_vehicle_type_prefers_tram_then_trolleybus_then_bus(self):
        self.assertEqual(sumc._vehicle_type_for({"railway": "tram_stop"}), "tram")
        self.assertEqual(sumc._vehicle_type_for({"tram": "yes", "trolleybus": "yes"}), "tram")
        self.assertEqual(sumc._vehicle_type_for({"trolleybus": "yes"}), "trolleybus")
        self.assertEqual(sumc._vehicle_type_for({}), "bus")

    def test_to_geojson_deduplicates_and_uses_center_coordinates(self):
        elements = [
            {"id": 1, "lat": 42.123456, "lon": 23.123456, "tags": {"name": "Stop A", "ref": "100"}},
            {"id": 2, "lat": 42.123457, "lon": 23.123457, "tags": {"name": "Stop A", "ref": "101"}},
            {"id": 3, "center": {"lat": 42.2, "lon": 23.2}, "tags": {"name:bg": "Metro B", "network": "Metro"}},
            {"id": 4, "tags": {"name": "No coordinates"}},
        ]

        payload = sumc._to_geojson(elements, kind="metro")

        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertEqual(len(payload["features"]), 2)
        self.assertEqual(payload["features"][0]["properties"]["name"], "Stop A")
        self.assertEqual(payload["features"][1]["geometry"]["coordinates"], [23.2, 42.2])
        self.assertEqual(payload["features"][1]["properties"]["network"], "Metro")


class ImotScraperTests(unittest.TestCase):
    def test_fetch_markers_posts_windows_1251_form_and_parses_marker_arrays(self):
        html = "initGoogleMapS(new Array('42.1','42.2'),new Array('23.1','23.2'),new Array('id-1','id-2'))"
        fake_session = FakeSession(post_text=html)

        markers = imot_scraper.fetch_markers(fake_session)

        self.assertEqual(markers, [(42.1, 23.1, "id-1"), (42.2, 23.2, "id-2")])
        self.assertEqual(fake_session.post_calls[0]["timeout"], 30)
        self.assertIsInstance(fake_session.post_calls[0]["data"]["f38"], bytes)

    def test_fetch_markers_raises_clear_error_when_marker_script_is_absent(self):
        with self.assertRaisesRegex(RuntimeError, "marker arrays not found"):
            imot_scraper.fetch_markers(FakeSession(post_text="<html>No markers</html>"))

    def test_fetch_detail_accepts_json_and_python_literal_payloads(self):
        json_session = FakeSession(get_text='[{"price": "500 EUR"}]')
        literal_session = FakeSession(get_text="[{'price': '600 EUR'}]")

        self.assertEqual(imot_scraper.fetch_detail(json_session, "abc"), {"price": "500 EUR"})
        self.assertEqual(imot_scraper.fetch_detail(literal_session, "def"), {"price": "600 EUR"})
        self.assertEqual(json_session.get_calls[0]["params"], {"property": "abc", "category": "rent"})

    def test_fetch_detail_returns_none_for_empty_or_empty_list_response(self):
        self.assertIsNone(imot_scraper.fetch_detail(FakeSession(get_text=""), "abc"))
        self.assertIsNone(imot_scraper.fetch_detail(FakeSession(get_text="[]"), "abc"))

    def test_fetch_detail_rejects_malicious_non_literal_payload(self):
        payload = "__import__('os').system('echo unsafe')"
        with self.assertRaises((ValueError, SyntaxError, TypeError, MemoryError, RecursionError)):
            ast.literal_eval(payload)
        with self.assertRaises((ValueError, SyntaxError, TypeError, MemoryError, RecursionError)):
            imot_scraper.fetch_detail(FakeSession(get_text=payload), "abc")


class ServerEndpointTests(unittest.TestCase):
    def test_health_endpoint_returns_json(self):
        with running_test_server() as base_url:
            with urlopen(f"{base_url}/api/health", timeout=5) as response:
                body = json.loads(response.read())

        self.assertEqual(response.status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["service"], "sofia-district-intelligence")

    def test_profile_endpoint_uses_builder_and_sends_json_headers(self):
        payload = b'{"type":"FeatureCollection","features":[]}'

        with patch.object(server, "get_or_build_profiles", Mock(return_value=payload)) as mocked:
            with running_test_server() as base_url:
                with urlopen(f"{base_url}/api/profiles?refresh=1", timeout=5) as response:
                    body = response.read()
                    content_type = response.headers["Content-Type"]
                    cache_control = response.headers["Cache-Control"]

        self.assertEqual(body, payload)
        self.assertEqual(content_type, "application/json; charset=utf-8")
        self.assertEqual(cache_control, "public, max-age=3600")
        mocked.assert_called_once_with(force=True)

    def test_transit_endpoint_reports_upstream_failure_as_502(self):
        with patch.object(server, "get_metro_stations", Mock(side_effect=RuntimeError("boom"))):
            with running_test_server() as base_url:
                with self.assertRaises(HTTPError) as raised:
                    urlopen(f"{base_url}/api/transit/metro", timeout=5)

        self.assertEqual(raised.exception.code, 502)


class BuildProfilesIntegrationTests(unittest.TestCase):
    def test_build_profiles_joins_boundaries_rent_air_and_transit_without_network(self):
        boundary = polygon_feature(
            [[[23.0, 42.0], [24.0, 42.0], [24.0, 43.0], [23.0, 43.0], [23.0, 42.0]]],
            {"id": "1", "regname": "Unit 1", "rajon": "District 1"},
        )
        rent = {"features": [{"properties": {"ge_id": "1", "godina": 2024, "naem_ap_kv_m": 10}}]}
        air = {"features": [point_feature(23.5, 42.5, {"location": "sensor-1", "year": 2024, "p1": 18})]}
        metro = {"type": "FeatureCollection", "features": [point_feature(23.6, 42.6)]}
        stops = {"type": "FeatureCollection", "features": [point_feature(23.7, 42.7), point_feature(25.0, 45.0)]}

        def fake_load_geojson(dataset_id):
            return {
                266: {"features": [boundary]},
                624: rent,
                165: air,
            }[dataset_id]

        with (
            patch.object(datasets, "load_geojson", side_effect=fake_load_geojson),
            patch.object(datasets, "get_metro_stations", return_value=json.dumps(metro).encode("utf-8")),
            patch.object(datasets, "get_surface_stops", return_value=json.dumps(stops).encode("utf-8")),
        ):
            payload = datasets.build_profiles()

        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertEqual(len(payload["features"]), 1)
        props = payload["features"][0]["properties"]
        self.assertEqual(props["id"], "1")
        self.assertEqual(props["rentPrice"], 10.0)
        self.assertEqual(props["airQuality"], 18.0)
        self.assertEqual(props["metroStops"], 1)
        self.assertEqual(props["busStops"], 1)
        self.assertEqual(props["transitScore"], 2)
        self.assertFalse(math.isnan(payload["ranges"]["rentPrice"]["avg"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
