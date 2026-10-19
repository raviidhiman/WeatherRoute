"""Pure risk classification. Canonical inputs: wind mph, rain/snow in/hr, load lb.
Thresholds are the assessment's rules, not official trucking regulations."""

import math
from typing import NamedTuple

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = range(5)
LEVEL_NAMES = ("low", "moderate", "high", "severe", "no_travel")

# Sanity ceilings: anything above is a bad measurement and is treated as unknown.
MAX_WIND, MAX_PRECIP = 250.0, 40.0


def _valid(v, ceiling: float) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and 0 <= v <= ceiling


def wind_level(wind, load_lb: float):
    if not _valid(wind, MAX_WIND):
        return None
    if wind >= 55:  # any load
        return NO_TRAVEL
    if wind >= 45 and load_lb > 30000:
        return NO_TRAVEL
    level = sum(wind >= b for b in (25, 35, 45))  # 0..3, lower bounds inclusive
    if 35 <= wind < 45 and load_lb > 40000:
        level = max(level, SEVERE)
    return level


def rain_level(rain):
    if not _valid(rain, MAX_PRECIP):
        return None
    return sum(rain >= b for b in (0.10, 0.25, 0.50)) + (rain > 1.00)  # 1.00 itself is Severe


def snow_level(snow):
    if not _valid(snow, MAX_PRECIP):
        return None
    return sum(snow >= b for b in (0.5, 1.0, 2.0)) + (snow > 3.0)  # 3.0 itself is Severe


class Assessment(NamedTuple):
    wind: int | None
    rain: int | None
    snow: int | None
    risk: int | None  # highest known hazard; None when every hazard is unknown
    resolved: bool  # False if any critical hazard is unknown


def assess(wind, rain, snow, load_lb: float) -> Assessment:
    hazards = (wind_level(wind, load_lb), rain_level(rain), snow_level(snow))
    known = [h for h in hazards if h is not None]
    return Assessment(*hazards, max(known) if known else None, len(known) == 3)
