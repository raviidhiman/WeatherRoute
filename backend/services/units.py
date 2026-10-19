"""Unit conversions. Canonical units: mi, mph, lb, in/hr, degF. Exact constants from the spec."""

KM_PER_MI = 1.609344
KG_PER_LB = 0.45359237
MM_PER_IN = 25.4

# unit -> multiplier that converts canonical -> unit
_FACTOR = {
    "mi": 1.0,
    "km": KM_PER_MI,
    "mph": 1.0,
    "kmh": KM_PER_MI,
    "lb": 1.0,
    "kg": KG_PER_LB,
    "in_per_hr": 1.0,
    "mm_per_hr": MM_PER_IN,
}


def to_canonical(value: float, unit: str) -> float:
    return value / _FACTOR[unit]


def from_canonical(value: float, unit: str) -> float:
    return value * _FACTOR[unit]


def f_to_c(f: float) -> float:
    return (f - 32) * 5 / 9


def c_to_f(c: float) -> float:
    return c * 9 / 5 + 32


def load_to_lb(value: float, unit: str) -> float:
    """Input-boundary conversion. Rounded to 1e-6 lb only to remove float noise so that
    e.g. 13607.7711 kg is exactly the 30,000 lb threshold, never 30000.000000000004."""
    return round(to_canonical(value, unit), 6)
