"""US National Weather Service adapter (api.weather.gov): free, no key, US coverage only.

Per location: /points/{lat},{lon} -> forecast grid cell, then /gridpoints/{office}/{x},{y} -> raw hourly
layers. Grid cells are de-duplicated, both lookups are cached, and everything is bounded by one time budget.
Unknown stays None; a failure never becomes zero.

Intensity caveat (documented, not hidden): NWS publishes precipitation as an AMOUNT over an interval
(usually 6 h). We spread it evenly, so a short heavy burst is averaged with the quiet hours around it.
Rain is the liquid-equivalent total minus the snow's water equivalent (10 mm of snow ~ 1 mm of water);
if either layer is missing the rain value stays unknown instead of being guessed."""

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from math import ceil, isfinite

from django.conf import settings
from django.core.cache import cache

from .http import ProviderError, get_json

log = logging.getLogger(__name__)
TTL = 1800  # forecast grid data: 30 min
POINT_TTL = 30 * 86400  # location -> grid cell never really changes
MISS_TTL = 86400  # "outside NWS coverage" is remembered for a day
MAX_HOURS = 400
SNOW_WATER_RATIO = 10.0  # inches of snow per inch of water (assumption, see module docstring)
GEO = "application/geo+json"
_OFFICE = re.compile(r"^[A-Z]{3}$")
_DURATION = re.compile(r"^P(?:(\d{1,2})D)?(?:T(?:(\d{1,3})H)?(?:(\d{1,4})M)?)?$")

# unit string -> converter into the app's canonical units (mph, inches, degrees F). Unknown unit => layer unusable.
_WIND = {"wmoUnit:km_h-1": lambda v: v / 1.609344, "wmoUnit:m_s-1": lambda v: v * 2.2369362920544, "wmoUnit:mi_h-1": lambda v: v}
_AMOUNT = {"wmoUnit:mm": lambda v: v / 25.4, "wmoUnit:cm": lambda v: v / 2.54}
_TEMP = {"wmoUnit:degC": lambda v: v * 9 / 5 + 32, "wmoUnit:degF": lambda v: v}


def _num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and isfinite(v) else None


def _hours(duration: str) -> int | None:
    """ISO-8601 duration (PT1H, PT6H, P1D, P1DT6H, PT30M) -> whole hours, at least 1; anything else -> None."""
    m = _DURATION.match(duration)
    if not m:
        return None
    d, h, mins = (int(x) if x else 0 for x in m.groups())
    total = d * 24 * 60 + h * 60 + mins
    return ceil(total / 60) if 0 < total <= MAX_HOURS * 60 else None


def _interval(valid_time) -> tuple[int, int] | None:
    """'2026-10-20T12:00:00+00:00/PT6H' -> (start as epoch hour, length in hours)."""
    try:
        start, dur = valid_time.split("/")
        dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None
    hours = _hours(dur)
    if dt.tzinfo is None or hours is None:
        return None
    return int(dt.timestamp() // 3600), hours


def _layer(props: dict, name: str, units: dict, amount: bool) -> dict[int, float]:
    """One NWS layer -> {epoch_hour: value}. Amounts become per-hour rates; null or invalid entries are skipped."""
    node = props.get(name)
    conv = units.get(node.get("uom")) if isinstance(node, dict) else None
    if conv is None:
        return {}
    out: dict[int, float] = {}
    for item in node.get("values") or []:
        if not isinstance(item, dict):
            continue
        v, iv = _num(item.get("value")), _interval(item.get("validTime"))
        if v is None or iv is None or v < 0 and name != "temperature":
            continue
        start, hours = iv
        val = conv(v) / (hours if amount else 1)
        for i in range(hours):
            out[start + i] = val
    return out


def _parse(data: dict) -> dict:
    props = data["properties"]
    wind = _layer(props, "windSpeed", _WIND, False)
    qpf = _layer(props, "quantitativePrecipitation", _AMOUNT, True)
    snow = _layer(props, "snowfallAmount", _AMOUNT, True)
    temp = _layer(props, "temperature", _TEMP, False)
    hours = sorted(set(wind) | set(qpf) | set(snow) | set(temp))
    if not hours:
        raise ValueError("no usable layers")
    t0 = hours[0]
    n = min(hours[-1] - t0 + 1, MAX_HOURS)

    def col(d):
        return [d.get(t0 + i) for i in range(n)]

    q, s = col(qpf), col(snow)
    return {
        "t0": t0,
        "wind": col(wind),
        "rain": [None if a is None or b is None else max(0.0, a - b / SNOW_WATER_RATIO) for a, b in zip(q, s)],
        "snow": s,
        "temp": col(temp),
    }


def _base() -> str:
    return settings.WEATHER_URL.rstrip("/")


def _grid(key: tuple[float, float], deadline: float):
    """Location -> (office, x, y), or None (unknown / outside coverage). Never follows URLs from the response."""
    ck = f"pt:{key[0]}:{key[1]}"
    hit = cache.get(ck)
    if hit is not None:
        return tuple(hit) or None
    try:
        data = get_json(f"{_base()}/points/{key[0]},{key[1]}", {}, retries=1, timeout=settings.WEATHER_TIMEOUT, deadline=deadline, accept=GEO)
        p = data["properties"]
        office, x, y = p["gridId"], p["gridX"], p["gridY"]
        if not (
            isinstance(office, str)
            and _OFFICE.match(office)
            and all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v < 10000 for v in (x, y))
        ):
            raise ValueError("bad grid")
    except ProviderError as exc:
        if str(exc) == "status 404":  # NWS has no forecast for this point (outside US coverage)
            cache.set(ck, [], MISS_TTL)
        else:
            log.warning("weather point lookup failed: %s", exc)
        return None
    except (ValueError, KeyError, TypeError):
        log.warning("weather point lookup rejected: malformed response")
        return None
    cache.set(ck, [office, x, y], POINT_TTL)
    return office, x, y


def _grid_series(grid: tuple[str, int, int], deadline: float):
    ck = f"wxg:{grid[0]}:{grid[1]},{grid[2]}"
    hit = cache.get(ck)
    if hit:
        return hit
    try:
        data = get_json(
            f"{_base()}/gridpoints/{grid[0]}/{grid[1]},{grid[2]}", {}, retries=1, timeout=settings.WEATHER_TIMEOUT, deadline=deadline, accept=GEO
        )
        series = _parse(data)
    except ProviderError as exc:  # message holds a status word only, never the URL (it contains coordinates)
        log.warning("weather grid fetch failed: %s", exc)
        return None
    except (ValueError, KeyError, TypeError, AttributeError):
        log.warning("weather grid rejected: malformed response")
        return None
    cache.set(ck, series, TTL)
    return series


def fetch(keys) -> dict:
    """keys: iterable of (lat, lon) rounded to 2 dp. Returns {key: series}; absent key => unknown."""
    keys = sorted(set(keys))
    deadline = time.monotonic() + settings.WEATHER_BUDGET_SECONDS
    with ThreadPoolExecutor(max_workers=settings.WEATHER_CONCURRENCY) as ex:
        grids = dict(zip(keys, ex.map(lambda k: _grid(k, deadline), keys)))
        unique = sorted({g for g in grids.values() if g})
        series = dict(zip(unique, ex.map(lambda g: _grid_series(g, deadline), unique)))
    return {k: series[g] for k, g in grids.items() if g and series.get(g)}


def values_at(series, ts: float) -> dict:
    """Nearest hourly values at unix time ts; outside provider coverage => all None."""
    empty = {"wind": None, "rain": None, "snow": None, "temp": None}
    if not series:
        return empty
    i = round(ts / 3600) - series["t0"]
    if not 0 <= i < len(series["wind"]):
        return empty
    return {k: series[k][i] for k in empty}