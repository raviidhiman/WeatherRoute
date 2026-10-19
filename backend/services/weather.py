"""Open-Meteo adapter (free, no key; non-commercial terms). Hourly series per rounded location.
Unknown stays None; failures never become zero.

Requests are kept light on purpose (small batches, 12 forecast days) because large multi-location
calls time out on slow links. Failed locations are retried in smaller batches, and good results
are cached, so pressing "Retry weather" only fetches what is still missing."""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from math import isfinite

from django.conf import settings
from django.core.cache import cache

from .http import ProviderError, get_json

log = logging.getLogger(__name__)
CHUNK, RETRY_CHUNK, TTL = 15, 4, 1800
FIELDS = ("wind_speed_10m", "rain", "showers", "snowfall", "temperature_2m")


def _num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and isfinite(v) else None


def _add(a, b):
    return None if a is None or b is None else a + b


def _parse(block: dict) -> dict:
    h = block["hourly"]
    t = h["time"]
    n = len(t)
    if not 2 <= n <= 1000 or not all(isinstance(x, int) for x in (t[0], t[-1])) or t[-1] - t[0] != 3600 * (n - 1):
        raise ValueError("irregular time axis")
    col = {k: [_num(x) for x in h[k]] for k in FIELDS}
    if any(len(v) != n for v in col.values()):
        raise ValueError("length mismatch")
    return {
        "t0": t[0] // 3600,
        "wind": col["wind_speed_10m"],
        "rain": [_add(a, b) for a, b in zip(col["rain"], col["showers"])],
        "snow": col["snowfall"],
        "temp": col["temperature_2m"],
    }


def _fetch_chunk(chunk: list[tuple[float, float]], deadline: float) -> dict:
    if time.monotonic() > deadline:
        return {}
    params = {
        "latitude": ",".join(str(k[0]) for k in chunk),
        "longitude": ",".join(str(k[1]) for k in chunk),
        "hourly": ",".join(FIELDS),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timeformat": "unixtime",
        "timezone": "GMT",
        "past_days": 1,
        "forecast_days": 12,
    }
    try:
        data = get_json(settings.WEATHER_URL, params, retries=1, timeout=settings.WEATHER_TIMEOUT, deadline=deadline)
    except ProviderError as exc:  # message holds a status word only, never the URL (it contains coordinates)
        log.warning("weather batch of %d failed: %s", len(chunk), exc)
        return {}
    blocks = data if isinstance(data, list) else [data]
    if len(blocks) != len(chunk):
        log.warning("weather batch rejected: location count mismatch")
        return {}
    out = {}
    for k, b in zip(chunk, blocks):  # one bad location must not discard the rest
        try:
            out[k] = _parse(b)
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            log.warning("weather location rejected: %s", type(exc).__name__)
    return out


def fetch(keys) -> dict:
    """keys: iterable of (lat, lon) rounded to 2 dp. Returns {key: series}; absent key => unknown."""
    keys = set(keys)
    out = {}
    for k in keys:
        hit = cache.get(f"wx:{k[0]}:{k[1]}")
        if hit:
            out[k] = hit
    deadline = time.monotonic() + settings.WEATHER_BUDGET_SECONDS
    for size in (CHUNK, RETRY_CHUNK):  # second pass re-requests only what failed, in smaller batches
        todo = sorted(k for k in keys if k not in out)
        if not todo or time.monotonic() > deadline:
            break
        chunks = [todo[i : i + size] for i in range(0, len(todo), size)]
        with ThreadPoolExecutor(max_workers=settings.WEATHER_CONCURRENCY) as ex:
            for res in ex.map(lambda c: _fetch_chunk(c, deadline), chunks):
                for k, s in res.items():
                    cache.set(f"wx:{k[0]}:{k[1]}", s, TTL)
                    out[k] = s
    return out


def values_at(series, ts: float) -> dict:
    """Nearest hourly values at unix time ts; outside provider coverage => all None."""
    empty = {"wind": None, "rain": None, "snow": None, "temp": None}
    if not series:
        return empty
    i = round(ts / 3600) - series["t0"]
    if not 0 <= i < len(series["wind"]):
        return empty
    return {k: series[k][i] for k in empty}
