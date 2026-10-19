import pytest

from services import units as u
from services.risk import NO_TRAVEL, wind_level


def test_exact_constants():
    assert u.from_canonical(1, "km") == 1.609344 and u.from_canonical(1, "kg") == 0.45359237
    assert u.from_canonical(1, "mm_per_hr") == 25.4
    assert u.f_to_c(212) == 100 and u.c_to_f(-40) == -40


@pytest.mark.parametrize("unit,v", [("km", 123.4), ("kg", 18000.5), ("mm_per_hr", 7.3), ("kmh", 88.5)])
def test_round_trip(unit, v):
    assert u.from_canonical(u.to_canonical(v, unit), unit) == pytest.approx(v, rel=1e-12)


def test_temperature_is_affine_round_trip():
    for f in (-40, 0, 32, 98.6):
        assert u.c_to_f(u.f_to_c(f)) == pytest.approx(f)


def test_55mph_equals_88_51392_kmh_same_decision():
    kmh = u.from_canonical(55, "kmh")
    assert kmh == pytest.approx(88.51392)
    assert wind_level(round(u.to_canonical(kmh, "kmh"), 9), 1) == NO_TRAVEL


@pytest.mark.parametrize("kg,lb", [(13607.7711, 30000), (18143.6948, 40000)])
def test_kg_threshold_loads_match_lb_exactly(kg, lb):
    assert u.load_to_lb(kg, "kg") == lb
    assert wind_level(50, u.load_to_lb(kg, "kg")) == wind_level(50, lb)
