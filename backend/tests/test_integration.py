"""End-to-end through the REAL HTTP path against local fake OSRM / Open-Meteo / Photon servers."""

import json
import threading
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


def enc(coords, precision=6):  # polyline encoder (inverse of the app's decoder)
    out, plat, plon, f = [], 0, 0, 10**precision
    for lat, lon in coords:
        for v, prev in ((round(lat * f), plat), (round(lon * f), plon)):
            d = v - prev
            d = ~(d << 1) if d < 0 else d << 1
            while d >= 0x20:
                out.append(chr((0x20 | (d & 0x1F)) + 63))
                d >>= 5
            out.append(chr(d + 63))
        plat, plon = round(lat * f), round(lon * f)
    return "".join(out)


def line(off):
    return [(39.74 + off + 0.0033 * i, -104.99 - 0.0229 * i) for i in range(300)]


class Fake(BaseHTTPRequestHandler):
    hits = {"osrm": 0, "wx": 0}

    def log_message(self, *a):
        pass

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        u = urlsplit(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path.startswith("/route/"):
            Fake.hits["osrm"] += 1
            routes = []
            for k, off in enumerate((0, 0.3, -0.3)):
                pts = line(off)
                routes.append(
                    {
                        "geometry": enc(pts),
                        "distance": 600000.0,
                        "duration": 21000.0 + k * 1800,
                        "legs": [{"steps": [{"distance": 300000.0, "duration": 8000.0}, {"distance": 300000.0, "duration": 13000.0 + k * 1800}]}],
                    }
                )
            self._send({"code": "Ok", "routes": routes})
        elif u.path == "/forecast":
            if Fake.hits["wx"] == 0:  # first call: transient failure => exercises retry
                Fake.hits["wx"] += 1
                return self._send({"reason": "busy"}, 503)
            Fake.hits["wx"] += 1
            lats, lons = q["latitude"].split(","), q["longitude"].split(",")
            t0 = int((datetime.now(UTC) - timedelta(hours=24)).timestamp() // 3600) * 3600
            times = [t0 + 3600 * i for i in range(400)]
            blocks = []
            for lon in lons:
                wind = 38.0 if float(lon) < -108 else 10.0  # west part of the trip is windy
                blocks.append(
                    {
                        "hourly": {
                            "time": times,
                            "wind_speed_10m": [wind] * 400,
                            "rain": [0.0] * 400,
                            "showers": [0.0] * 400,
                            "snowfall": [0.0] * 400,
                            "temperature_2m": [50.0] * 400,
                        }
                    }
                )
            self._send(blocks if len(lats) > 1 else blocks[0])
        elif u.path == "/api":
            self._send(
                {
                    "features": [
                        {"properties": {"name": "Denver", "state": "Colorado", "countrycode": "US"}, "geometry": {"coordinates": [-104.99, 39.74]}}
                    ]
                }
            )
        else:
            self._send({}, 404)


@pytest.fixture(scope="module")
def fake_server():
    srv = HTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


@pytest.fixture
def client(fake_server, settings, monkeypatch):
    cache.clear()
    Fake.hits.update(osrm=0, wx=0)
    settings.OSRM_BASE_URL, settings.WEATHER_URL, settings.PHOTON_URL = fake_server, fake_server + "/forecast", fake_server + "/api"
    settings.PROVIDER_HOSTS = {"127.0.0.1"}
    settings.DEBUG = True  # http:// allowed only in DEBUG; the guard itself is tested in test_weather_providers
    monkeypatch.setattr("services.http.time.sleep", lambda s: None)  # no real backoff delay in tests
    return APIClient()


def body(**o):
    dep = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT%H:00")
    return {
        "origin": {"label": "Denver", "lat": 39.74, "lon": -104.99},
        "destination": {"label": "SLC", "lat": 40.76, "lon": -111.89},
        "departure_local": dep,
        "timezone": "America/Denver",
        "load_weight": 28000,
        "load_unit": "lb",
        "checkpoint_interval": 25,
        **o,
    }


def test_full_pipeline_over_real_http(client):
    r = client.post("/api/v1/routes/analyze/", body(), format="json")
    assert r.status_code == 200, r.content
    d = r.json()
    assert d["status"] == "complete" and len(d["routes"]) == 3
    assert Fake.hits["wx"] >= 2  # 1st call 503 -> retried successfully
    rt = d["routes"][0]
    assert rt["eta_method"] == "step_durations" and rt["checkpoints"][0]["resolved"]
    # 38 mph is High for light loads in the windy western part: High miles > 0, none Severe
    assert rt["high_miles"] > 0 and rt["severe_miles"] == 0 and rt["eligibility"] == "eligible"
    miles = sum(c["segment_mi"] for c in rt["checkpoints"])
    assert miles == pytest.approx(rt["distance_mi"], abs=0.05)
    assert 2 <= len(rt["geometry"]) <= 300  # bounded; thinning itself is unit-tested
    # same trip, heavy load: 38 mph + >40,000 lb is Severe
    d2 = client.post("/api/v1/routes/analyze/", body(load_weight=45000), format="json").json()
    assert d2["routes"][0]["severe_miles"] > 0 and d2["routes"][0]["high_miles"] == 0
    # independent check of the ranking rule: fewest Severe, then High, then average risk, then time
    best = min(d["routes"], key=lambda r: (round(r["severe_miles"], 6), round(r["high_miles"], 6), round(r["average_risk"], 6), r["duration_s"]))
    assert d["recommendation"]["route_id"] == best["id"] and best["rank"] == 1


def test_weather_cached_between_requests(client):
    client.post("/api/v1/routes/analyze/", body(), format="json")
    before = Fake.hits["wx"]
    client.post("/api/v1/routes/analyze/", body(), format="json")
    assert Fake.hits["wx"] == before  # all locations served from cache


def test_geocode_over_http(client):
    r = client.get("/api/v1/geocode/?q=denver")
    assert r.status_code == 200 and r.json()["results"][0]["label"] == "Denver, Colorado"


def test_provider_outage_never_becomes_low_risk(client, settings):
    settings.WEATHER_URL = settings.WEATHER_URL.replace("/forecast", "/missing")  # 404 from provider
    d = client.post("/api/v1/routes/analyze/", body(), format="json").json()
    assert d["status"] == "partial" and d["recommendation"]["level"] == "provisional"
    assert all(c["risk"] is None for c in d["routes"][0]["checkpoints"])


def test_routing_outage_is_502(client, settings):
    settings.OSRM_BASE_URL = "http://127.0.0.1:9"  # connection refused
    assert client.post("/api/v1/routes/analyze/", body(), format="json").status_code == 502
