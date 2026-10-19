"""OSRM adapter (free, no key). Normalizes to {coords, duration_s, steps}. Car profile:
truck restrictions are NOT applied, and the API response says so."""

import logging

from django.conf import settings

from .errors import AnalysisError
from .http import ProviderError, get_json

log = logging.getLogger(__name__)
MAX_POINTS = 200_000


def decode_polyline(s: str, precision: int = 6) -> list[tuple[float, float]]:
    coords, i, lat, lon, f = [], 0, 0, 0, 10**precision
    while i < len(s):
        for axis in (0, 1):
            shift = result = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += delta
            else:
                lon += delta
        coords.append((lat / f, lon / f))
        if len(coords) > MAX_POINTS:
            raise ValueError("geometry too large")
    return coords


def _parse_route(raw: dict) -> dict:
    coords = decode_polyline(raw["geometry"])
    duration = float(raw["duration"])
    if len(coords) < 2 or not duration > 0 or not all(in_us_loose(*c) for c in coords[:: max(1, len(coords) // 50)]):
        raise ValueError("invalid route")
    steps, mans = [], []
    for leg in raw.get("legs", []):
        for s in leg.get("steps", []):
            d, t = float(s["distance"]), float(s["duration"])
            if d < 0 or t < 0:
                raise ValueError("invalid step")
            steps.append((d, t))
            m = s.get("maneuver") or {}
            # provider text is untrusted: truncated here, rendered as plain text only by the UI
            mans.append(
                {
                    "type": str(m.get("type", ""))[:20],
                    "modifier": str(m.get("modifier", ""))[:20],
                    "name": str(s.get("name", ""))[:60],
                    "ref": str(s.get("ref", ""))[:20],
                    "d": d,
                }
            )
    return {"coords": coords, "duration_s": duration, "steps": steps or None, "maneuvers": mans, "sig": raw["geometry"]}


def in_us_loose(lat: float, lon: float) -> bool:  # sanity only; origin/destination are strictly validated
    return -90 <= lat <= 90 and -180 <= lon <= 180


def fetch_routes(origin: dict, dest: dict) -> list[dict]:
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{origin['lon']:.5f},{origin['lat']:.5f};{dest['lon']:.5f},{dest['lat']:.5f}"
    try:
        data = get_json(url, {"alternatives": "3", "overview": "full", "geometries": "polyline6", "steps": "true"})
    except ProviderError as exc:
        log.warning("routing failed: %s", exc)
        raise AnalysisError("routing_unavailable", "The routing service is unavailable. Try again shortly.", 502) from None
    if not isinstance(data, dict) or data.get("code") != "Ok":
        raise AnalysisError("no_route", "No drivable route was found between these locations.", 422)
    routes, seen = [], set()
    for raw in data.get("routes", [])[:3]:
        try:
            r = _parse_route(raw)
        except (KeyError, TypeError, ValueError, IndexError):
            log.warning("skipped malformed route")
            continue
        if r["sig"] not in seen:
            seen.add(r["sig"])
            routes.append(r)
    if not routes:
        raise AnalysisError("no_route", "No drivable route was found between these locations.", 422)
    return routes
