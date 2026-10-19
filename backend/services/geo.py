"""Route geometry helpers. Cumulative-distance array + binary search => O(n + m log n)."""

from bisect import bisect_left
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_MI = 3958.7613
# Contiguous-US bounding box (coarse: also contains slivers of Canada/Mexico; documented limitation).
US_BOUNDS = (24.0, 49.5, -125.0, -66.5)  # min_lat, max_lat, min_lon, max_lon


def in_us(lat: float, lon: float) -> bool:
    return US_BOUNDS[0] <= lat <= US_BOUNDS[1] and US_BOUNDS[2] <= lon <= US_BOUNDS[3]


def haversine_mi(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * asin(min(1.0, sqrt(a)))


def cumulative(coords: list[tuple[float, float]]) -> list[float]:
    cum = [0.0]
    for (la1, lo1), (la2, lo2) in zip(coords, coords[1:]):
        cum.append(cum[-1] + haversine_mi(la1, lo1, la2, lo2))
    return cum


def build_checkpoints(coords, cum, interval_mi: float) -> list[tuple[float, float, float]]:
    """(distance_mi, lat, lon) at 0, I, 2I ... plus the destination (final partial segment included)."""
    total = cum[-1]
    targets = [k * interval_mi for k in range(int(total // interval_mi) + 1) if k * interval_mi < total - 1e-9]
    targets.append(total)
    out = []
    for d in targets:
        i = min(max(bisect_left(cum, d), 1), len(cum) - 1)
        span = cum[i] - cum[i - 1]
        f = 0.0 if span <= 0 else min(1.0, max(0.0, (d - cum[i - 1]) / span))
        (la1, lo1), (la2, lo2) = coords[i - 1], coords[i]
        out.append((d, la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f))
    return out


def decimate(coords, min_mi: float = 0.3) -> list[list[float]]:
    """Radial-distance thinning for transport/rendering only; analysis uses full geometry. O(n)."""
    kept = [coords[0]]
    for c in coords[1:-1]:
        if haversine_mi(*kept[-1], *c) >= min_mi:
            kept.append(c)
    kept.append(coords[-1])
    return [[round(lon, 5), round(lat, 5)] for lat, lon in kept]
