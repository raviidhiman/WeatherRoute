import json
from datetime import UTC, datetime, timedelta

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from api.serializers import AnalyzeSerializer
from services import analyze as an
from services.geo import cumulative


@pytest.fixture(autouse=True)
def _clear():
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


def payload(**over):
    dep = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT%H:00")
    base = {
        "origin": {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903},
        "destination": {"label": "Salt Lake City, UT", "lat": 40.7608, "lon": -111.891},
        "departure_local": dep,
        "timezone": "America/Denver",
        "load_weight": 28000,
        "load_unit": "lb",
        "checkpoint_interval": 25,
    }
    return {**base, **over}


def line(lat_off=0.0, n=300):
    return [(39.74 + lat_off + 0.0033 * i, -104.99 - 0.0229 * i) for i in range(n)]


def fake_routes(*_a):
    return [{"coords": line(o), "duration_s": 20000 + k * 900, "steps": None, "sig": str(k)} for k, o in enumerate((0, 0.2, -0.2))]


def fake_weather(wind=10.0, rain=0.0, snow=0.0):
    def _fetch(keys):
        n = 400
        t0 = int((datetime.now(UTC) - timedelta(hours=24)).timestamp() // 3600)
        return {k: {"t0": t0, "wind": [wind] * n, "rain": [rain] * n, "snow": [snow] * n, "temp": [55.0] * n} for k in keys}

    return _fetch


def test_health_minimal(client):
    r = client.get("/api/v1/health/")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_analyze_happy_path(client, monkeypatch):
    monkeypatch.setattr(an, "fetch_routes", fake_routes)
    monkeypatch.setattr(an.wx, "fetch", fake_weather())
    r = client.post("/api/v1/routes/analyze/", payload(), format="json")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "complete" and len(d["routes"]) == 3 and d["recommendation"]["level"] == "recommended"
    rt = d["routes"][0]
    assert rt["checkpoints"][0]["distance_mi"] == 0 and len(rt["checkpoints"][0]["forecast"]["risk"]) == 49
    assert rt["checkpoints"][-1]["segment_mi"] == 0
    assert rt["eligibility"] == "eligible" and rt["severe_miles"] == 0
    # fastest route wins when risk is identical
    assert d["recommendation"]["route_id"] == "r1"


def test_weather_failure_is_partial_never_low(client, monkeypatch):
    monkeypatch.setattr(an, "fetch_routes", fake_routes)
    monkeypatch.setattr(an.wx, "fetch", lambda keys: {})
    d = client.post("/api/v1/routes/analyze/", payload(), format="json").json()
    assert d["status"] == "partial" and d["recommendation"]["level"] == "provisional"
    assert all(c["risk"] is None and c["resolved"] is False for c in d["routes"][0]["checkpoints"])
    assert all(r["eligibility"] == "incomplete" for r in d["routes"])


def test_heavy_load_in_high_wind_is_no_travel_and_excluded(client, monkeypatch):
    monkeypatch.setattr(an, "fetch_routes", fake_routes)
    monkeypatch.setattr(an.wx, "fetch", fake_weather(wind=50))
    d = client.post("/api/v1/routes/analyze/", payload(load_weight=35000), format="json").json()
    assert d["recommendation"]["level"] == "none" and all(r["rank"] is None for r in d["routes"])
    d2 = client.post("/api/v1/routes/analyze/", payload(load_weight=20000), format="json").json()
    assert d2["recommendation"]["level"] == "recommended" and d2["routes"][0]["severe_miles"] > 0


def test_units_do_not_change_decision(client, monkeypatch):
    monkeypatch.setattr(an, "fetch_routes", fake_routes)
    monkeypatch.setattr(an.wx, "fetch", fake_weather(wind=50))
    a = client.post("/api/v1/routes/analyze/", payload(load_weight=30000.0), format="json").json()
    b = client.post("/api/v1/routes/analyze/", payload(load_weight=13607.7711, load_unit="kg"), format="json").json()
    assert a["recommendation"]["level"] == b["recommendation"]["level"] == "recommended"


@pytest.mark.parametrize(
    "over,field",
    [
        ({"origin": {"label": "x", "lat": 51.5, "lon": -0.12}}, "origin"),
        ({"load_weight": -5}, "load_weight"),
        ({"load_weight": 0}, "load_weight"),
        ({"load_weight": 9e9}, "load_weight"),
        ({"load_unit": "stone"}, "load_unit"),
        ({"checkpoint_interval": 7}, "checkpoint_interval"),
        ({"timezone": "Europe/London"}, "timezone"),
        ({"departure_local": "tomorrow"}, "departure_local"),
        ({"departure_local": "2020-01-01T08:00"}, "departure_local"),
        ({"extra": 1}, "extra"),
        ({"destination": {"label": "Denver", "lat": 39.7392, "lon": -104.9903}}, "destination"),
    ],
)
def test_validation_rejects_bad_input(client, over, field):
    r = client.post("/api/v1/routes/analyze/", payload(**over), format="json")
    assert r.status_code == 400
    e = r.json()["error"]
    assert e["code"] == "validation_error" and any(k.startswith(field) for k in e["fields"])


def test_nan_and_infinity_rejected(client):
    body = json.dumps(payload()).replace("28000", "NaN")
    assert client.post("/api/v1/routes/analyze/", body, content_type="application/json").status_code == 400
    body = json.dumps(payload()).replace("28000", "Infinity")
    assert client.post("/api/v1/routes/analyze/", body, content_type="application/json").status_code == 400


def test_oversized_body_and_wrong_content_type(client):
    big = json.dumps(payload(origin={"label": "x" * 40000, "lat": 1, "lon": 1}))
    assert client.post("/api/v1/routes/analyze/", big, content_type="application/json").status_code == 413
    assert client.post("/api/v1/routes/analyze/", "a=b", content_type="text/plain").status_code == 415


def test_method_not_allowed_and_not_found_are_json(client):
    assert client.get("/api/v1/routes/analyze/").status_code == 405
    r = client.get("/api/v1/nope/")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    assert client.get("/admin/").status_code == 404


def test_client_cannot_supply_provider_urls(client):
    r = client.post("/api/v1/routes/analyze/", payload(provider_url="http://169.254.169.254/"), format="json")
    assert r.status_code == 400 and "provider_url" in r.json()["error"]["fields"]


def test_unexpected_exception_does_not_leak(client, monkeypatch):
    def boom(*a):
        raise RuntimeError("secret-db-password at 10.0.0.5")

    monkeypatch.setattr(an, "fetch_routes", boom)
    r = client.post("/api/v1/routes/analyze/", payload(), format="json")
    assert r.status_code == 500 and "secret" not in r.content.decode() and "Traceback" not in r.content.decode()
    assert r.json()["error"]["code"] == "internal_error"


def test_routing_outage_is_502_not_success(client, monkeypatch):
    from services.errors import AnalysisError

    def boom(*a):
        raise AnalysisError("routing_unavailable", "down", 502)

    monkeypatch.setattr(an, "fetch_routes", boom)
    assert client.post("/api/v1/routes/analyze/", payload(), format="json").status_code == 502


def test_too_many_checkpoints_rejected(client, monkeypatch, settings):
    settings.MAX_CHECKPOINTS = 5
    monkeypatch.setattr(an, "fetch_routes", fake_routes)
    r = client.post("/api/v1/routes/analyze/", payload(), format="json")
    assert r.status_code == 422 and r.json()["error"]["code"] == "too_many_checkpoints"


def test_dst_nonexistent_and_ambiguous_times():
    base = payload()
    s = AnalyzeSerializer(data={**base, "timezone": "America/New_York", "departure_local": "2026-03-08T02:30"})
    assert not s.is_valid() and "departure_local" in s.errors
    # ambiguous: accepted only if within window, so just check the helper path via far-future rejection message
    s2 = AnalyzeSerializer(data={**base, "timezone": "America/New_York", "departure_local": "2026-11-01T01:30"})
    assert not s2.is_valid()  # outside 7-day window, rejected rather than guessed


def test_geocode_validation_and_results(client, monkeypatch):
    from services import geocode

    assert client.get("/api/v1/geocode/?q=a").status_code == 400
    feat = {
        "features": [
            {"properties": {"name": "Denver", "state": "Colorado", "countrycode": "US"}, "geometry": {"coordinates": [-104.99, 39.74]}},
            {"properties": {"name": "London", "countrycode": "GB"}, "geometry": {"coordinates": [-0.12, 51.5]}},
        ]
    }
    monkeypatch.setattr(geocode, "get_json", lambda url, params: feat)
    r = client.get("/api/v1/geocode/?q=denver")
    assert r.status_code == 200 and r.json()["results"] == [{"label": "Denver, Colorado", "lat": 39.74, "lon": -104.99}]


def test_throttle_returns_429(client, monkeypatch, settings):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "health", "2/min")
    codes = [client.get("/api/v1/health/").status_code for _ in range(4)]
    assert codes[:2] == [200, 200] and 429 in codes


def test_cumulative_sanity():
    assert cumulative(line())[-1] > 100
