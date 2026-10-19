import pytest
from django.core.cache import cache

from services import routing
from services import weather as wx
from services.errors import AnalysisError
from services.http import ProviderError, get_json


def block(n=50, t0=3600 * 1000, wind=10.0):
    return {
        "hourly": {
            "time": [t0 + 3600 * i for i in range(n)],
            "wind_speed_10m": [wind] * n,
            "rain": [0.0] * n,
            "showers": [0.0] * n,
            "snowfall": [0.0] * n,
            "temperature_2m": [50.0] * n,
        }
    }


@pytest.fixture(autouse=True)
def _clear():
    cache.clear()


def test_fetch_normalizes_and_values_at(monkeypatch):
    monkeypatch.setattr(wx, "get_json", lambda url, params, **kw: [block(), block(wind=40)])
    out = wx.fetch([(40.0, -100.0), (41.0, -101.0)])
    assert wx.values_at(out[(41.0, -101.0)], 3600 * 1005)["wind"] == 40
    assert wx.values_at(out[(41.0, -101.0)], 3600 * 5000)["wind"] is None  # outside coverage => unknown


def test_provider_failure_yields_unknown_not_zero(monkeypatch):
    def boom(url, params, **kw):
        raise ProviderError("unavailable")

    monkeypatch.setattr(wx, "get_json", boom)
    assert wx.fetch([(40.0, -100.0)]) == {}
    assert wx.values_at(None, 123) == {"wind": None, "rain": None, "snow": None, "temp": None}


@pytest.mark.parametrize("bad", [{"hourly": {}}, {"hourly": {"time": [1, 2]}}, [block()] * 3, {"oops": 1}])
def test_malformed_payloads_rejected(monkeypatch, bad):
    monkeypatch.setattr(wx, "get_json", lambda url, params, **kw: bad)
    assert wx.fetch([(40.0, -100.0)]) == {}


def test_null_and_nan_values_become_none(monkeypatch):
    b = block()
    b["hourly"]["wind_speed_10m"][0] = None
    b["hourly"]["rain"][1] = float("nan")
    monkeypatch.setattr(wx, "get_json", lambda url, params, **kw: b)
    s = wx.fetch([(1.0, 1.0)])[(1.0, 1.0)]
    assert s["wind"][0] is None and s["rain"][1] is None


def test_outbound_host_allowlist_blocks_arbitrary_urls():
    for url in ("https://evil.example.com/x", "http://169.254.169.254/latest", "ftp://api.open-meteo.com/v1"):
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


def test_one_bad_location_does_not_discard_the_batch(monkeypatch):
    monkeypatch.setattr(wx, "get_json", lambda url, params, **kw: [block(), {"hourly": {}}])
    out = wx.fetch([(40.0, -100.0), (41.0, -101.0)])
    assert (40.0, -100.0) in out and (41.0, -101.0) not in out


def test_failed_batch_is_retried_in_smaller_batches_and_cached(monkeypatch):
    monkeypatch.setattr(wx, "CHUNK", 16)
    monkeypatch.setattr(wx, "RETRY_CHUNK", 4)
    calls = []

    def flaky(url, params, **kw):
        n = len(params["latitude"].split(","))
        calls.append(n)
        if n > 4:
            raise ProviderError("unavailable")  # big batches time out
        return [block() for _ in range(n)]

    monkeypatch.setattr(wx, "get_json", flaky)
    keys = [(30.0 + i, -100.0) for i in range(10)]
    assert len(wx.fetch(keys)) == 10
    assert calls[0] == 10 and sorted(calls[1:]) == [2, 4, 4]
    calls.clear()
    assert len(wx.fetch(keys)) == 10 and calls == []  # now served from cache
