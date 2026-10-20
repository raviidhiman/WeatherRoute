from datetime import UTC, datetime

import pytest
from django.core.cache import cache

from services import routing
from services import weather as wx
from services.errors import AnalysisError
from services.http import ProviderError, _check, get_json

T0 = datetime(2026, 10, 20, 12, tzinfo=UTC)
H0 = int(T0.timestamp() // 3600)
START = T0.isoformat()  # 2026-10-20T12:00:00+00:00


def layer(uom, values, dur="PT1H"):
    return {
        "uom": uom,
        "values": [
            {
                "validTime": f"{START}/{dur}" if i == 0 else f"{datetime.fromtimestamp((H0 + i * int(dur[2:-1])) * 3600, UTC).isoformat()}/{dur}",
                "value": v,
            }
            for i, v in enumerate(values)
        ],
    }


def grid_payload(wind_kmh=None, qpf_mm=None, snow_mm=None, temp_c=None, n=12):
    """A trimmed api.weather.gov gridpoint response (same shape: properties.<layer>.{uom,values[{validTime,value}]})."""
    w = [10.0] * n if wind_kmh is None else wind_kmh
    return {
        "properties": {
            "windSpeed": layer("wmoUnit:km_h-1", w),
            "quantitativePrecipitation": layer("wmoUnit:mm", [0.0, 0.0] if qpf_mm is None else qpf_mm, "PT6H"),
            "snowfallAmount": layer("wmoUnit:mm", [0.0, 0.0] if snow_mm is None else snow_mm, "PT6H"),
            "temperature": layer("wmoUnit:degC", [10.0] * n if temp_c is None else temp_c),
        }
    }


def point(office="TST", x=10, y=20):
    return {"properties": {"gridId": office, "gridX": x, "gridY": y}}


class FakeNWS:
    """Routes get_json calls like api.weather.gov would; counts requests."""

    def __init__(self, points, grids):
        self.points, self.grids, self.calls = points, grids, []

    def __call__(self, url, params, **kw):
        assert kw.get("accept") == "application/geo+json"
        self.calls.append(url)
        path = url.split("api.weather.gov")[1]
        table = self.points if path.startswith("/points/") else self.grids
        out = table[path]
        if isinstance(out, Exception):
            raise out
        return out


@pytest.fixture(autouse=True)
def _clear():
    cache.clear()


def test_normalizes_units_and_values_at(monkeypatch):
    # 88.51392 km/h = 55 mph; 15.24 mm over 6 h = 0.1 in/hr total; 30.48 mm of snow over 6 h = 0.2 in/hr of snow
    g = grid_payload(wind_kmh=[88.51392] * 12, qpf_mm=[15.24, 15.24], snow_mm=[30.48, 30.48], temp_c=[0.0] * 12)
    fake = FakeNWS({"/points/40.0,-100.0": point()}, {"/gridpoints/TST/10,20": g})
    monkeypatch.setattr(wx, "get_json", fake)
    out = wx.fetch([(40.0, -100.0)])
    v = wx.values_at(out[(40.0, -100.0)], 3600 * (H0 + 3))
    assert v["wind"] == pytest.approx(55.0)
    assert v["snow"] == pytest.approx(0.2)
    assert v["rain"] == pytest.approx(0.1 - 0.02)  # liquid total minus snow water equivalent (10:1)
    assert v["temp"] == pytest.approx(32.0)
    assert wx.values_at(out[(40.0, -100.0)], 3600 * (H0 + 500)) == {"wind": None, "rain": None, "snow": None, "temp": None}


@pytest.mark.parametrize("dur,hours", [("PT1H", 1), ("PT6H", 6), ("P1D", 24), ("P1DT6H", 30), ("PT30M", 1), ("PT90M", 2)])
def test_duration_parsing(dur, hours):
    assert wx._hours(dur) == hours


@pytest.mark.parametrize("bad", ["", "PT", "P", "xyz", "P0D", "PT0H", "-PT1H", "PT1H/extra", "P999DT1H"])
def test_bad_durations_rejected(bad):
    assert wx._hours(bad) is None


def test_unknown_units_and_nulls_never_become_zero():
    g = grid_payload(wind_kmh=[None, 20.0, 30.0] + [10.0] * 9)
    g["properties"]["temperature"]["uom"] = "wmoUnit:furlongs"  # unit we cannot convert: layer unusable, not guessed
    s = wx._parse(g)
    assert s["wind"][0] is None and s["wind"][1] == pytest.approx(20 / 1.609344)
    assert set(s["temp"]) == {None}


def test_rain_stays_unknown_when_snow_layer_is_missing():
    g = grid_payload()
    del g["properties"]["snowfallAmount"]
    s = wx._parse(g)
    assert set(s["rain"]) == {None} and s["snow"] == [None] * len(s["snow"])


def test_nothing_usable_is_rejected():
    with pytest.raises(ValueError):
        wx._parse({"properties": {}})


def test_provider_failure_yields_unknown_not_zero(monkeypatch):
    def boom(url, params, **kw):
        raise ProviderError("unavailable")

    monkeypatch.setattr(wx, "get_json", boom)
    assert wx.fetch([(40.0, -100.0)]) == {}
    assert wx.values_at(None, 123) == {"wind": None, "rain": None, "snow": None, "temp": None}


def test_point_outside_coverage_is_unknown_and_remembered(monkeypatch):
    fake = FakeNWS({"/points/10.0,10.0": ProviderError("status 404")}, {})
    monkeypatch.setattr(wx, "get_json", fake)
    assert wx.fetch([(10.0, 10.0)]) == {}
    assert wx.fetch([(10.0, 10.0)]) == {} and len(fake.calls) == 1  # the 404 is cached, no repeat request


@pytest.mark.parametrize(
    "bad",
    [
        {"properties": {"gridId": "../x", "gridX": 1, "gridY": 2}},
        {"properties": {"gridId": "TST", "gridX": "1", "gridY": 2}},
        {"properties": {"gridId": "TST", "gridX": True, "gridY": 2}},
        {"properties": {"gridId": "TST", "gridX": -1, "gridY": 2}},
        {"oops": 1},
    ],
)
def test_malformed_grid_reference_is_never_followed(monkeypatch, bad):
    fake = FakeNWS({"/points/1.0,1.0": bad}, {})
    monkeypatch.setattr(wx, "get_json", fake)
    assert wx.fetch([(1.0, 1.0)]) == {} and fake.calls == ["https://api.weather.gov/points/1.0,1.0"]  # no gridpoints request was made


def test_locations_in_the_same_cell_share_one_request_and_results_are_cached(monkeypatch):
    fake = FakeNWS(
        {"/points/40.0,-100.0": point(), "/points/40.01,-100.0": point(), "/points/41.0,-101.0": point("TSB", 3, 4)},
        {"/gridpoints/TST/10,20": grid_payload(wind_kmh=[16.09344] * 12), "/gridpoints/TSB/3,4": grid_payload(wind_kmh=[80.4672] * 12)},
    )
    monkeypatch.setattr(wx, "get_json", fake)
    keys = [(40.0, -100.0), (40.01, -100.0), (41.0, -101.0)]
    out = wx.fetch(keys)
    assert len(out) == 3 and sum("/gridpoints/" in c for c in fake.calls) == 2  # two distinct cells, not three requests
    assert wx.values_at(out[(41.0, -101.0)], 3600 * H0)["wind"] == pytest.approx(50.0)
    fake.calls.clear()
    assert len(wx.fetch(keys)) == 3 and fake.calls == []  # served from cache


def test_one_failed_cell_does_not_discard_the_others(monkeypatch):
    fake = FakeNWS(
        {"/points/40.0,-100.0": point(), "/points/41.0,-101.0": point("TSB", 3, 4)},
        {"/gridpoints/TST/10,20": grid_payload(), "/gridpoints/TSB/3,4": ProviderError("status 500")},
    )
    monkeypatch.setattr(wx, "get_json", fake)
    out = wx.fetch([(40.0, -100.0), (41.0, -101.0)])
    assert (40.0, -100.0) in out and (41.0, -101.0) not in out


def test_accept_header_is_passed_through():
    assert _check("https://api.weather.gov/points/1,1", "application/geo+json")["Accept"] == "application/geo+json"
    assert _check("https://api.weather.gov/points/1,1")["Accept"] == "application/json"


def test_outbound_host_allowlist_blocks_arbitrary_urls():
    for url in ("https://evil.example.com/x", "http://169.254.169.254/latest", "ftp://api.weather.gov/points/1,1"):
        with pytest.raises(ProviderError):
            get_json(url, {})


def test_routing_polyline_and_failure(monkeypatch):
    assert routing.decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)[0] == (38.5, -120.2)

    def boom(url, params, **kw):
        raise ProviderError("unavailable")

    monkeypatch.setattr(routing, "get_json", boom)
    with pytest.raises(AnalysisError) as e:
        routing.fetch_routes({"lat": 40, "lon": -100}, {"lat": 41, "lon": -101})
    assert e.value.status == 502 and "unavailable" in e.value.message.lower()