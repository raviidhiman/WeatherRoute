import math

import pytest

from services.risk import HIGH, LOW, MODERATE, NO_TRAVEL, SEVERE, assess, rain_level, snow_level, wind_level

L, M, H, S, N = LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL


@pytest.mark.parametrize("v,exp", [(0, L), (24.99, L), (25, M), (34.99, M), (35, H), (44.99, H), (45, S), (54.99, S), (55, N), (80, N)])
def test_wind_light_load(v, exp):
    assert wind_level(v, 10_000) == exp


@pytest.mark.parametrize("v,exp", [(0.099, L), (0.10, M), (0.249, M), (0.25, H), (0.499, H), (0.50, S), (1.00, S), (1.001, N)])
def test_rain(v, exp):
    assert rain_level(v) == exp


@pytest.mark.parametrize("v,exp", [(0.499, L), (0.5, M), (0.999, M), (1.0, H), (1.999, H), (2.0, S), (3.0, S), (3.001, N)])
def test_snow(v, exp):
    assert snow_level(v) == exp


@pytest.mark.parametrize("load,exp", [(30_000, S), (30_000.01, N), (40_000, N), (100_000, N)])
def test_wind_45_to_55_load_rule(load, exp):
    assert wind_level(50, load) == exp


@pytest.mark.parametrize("load,exp", [(40_000, H), (40_000.01, S), (10_000, H)])
def test_wind_35_to_45_load_rule(load, exp):
    assert wind_level(40, load) == exp


def test_55_is_no_travel_for_any_load():
    assert wind_level(55, 1) == N


def test_load_rule_never_lowers_severity():
    assert wind_level(44.99, 50_000) == S  # raised from High
    assert wind_level(25, 50_000) == M  # rule does not apply below 35 mph


def test_overall_is_highest_and_hazards_retained():
    a = assess(30, 0.6, 0.0, 10_000)
    assert (a.wind, a.rain, a.snow, a.risk, a.resolved) == (M, S, L, S, True)


@pytest.mark.parametrize("bad", [None, math.nan, math.inf, -1, "12", True, 1e6])
def test_invalid_values_are_unknown_never_zero(bad):
    assert wind_level(bad, 1) is None and rain_level(bad) is None and snow_level(bad) is None


def test_unknown_is_unresolved_not_low():
    a = assess(10, None, 0, 1000)
    assert a.risk == LOW and a.resolved is False
    assert assess(None, None, None, 1000).risk is None


def test_no_travel_with_other_unknown_is_still_confirmed():
    a = assess(60, None, None, 1000)
    assert a.risk == N and not a.resolved
