from bisect import bisect_right
from itertools import accumulate


def make_time_fn(geom_total_mi: float, duration_s: float, steps):
    """Return f(distance_mi) -> elapsed seconds.
    Uses provider step durations (piecewise-linear, binary search) when present; else a
    proportional-distance estimate. `steps` = [(distance_m, duration_s), ...]."""
    if steps:
        cum_d = [0.0, *accumulate(d for d, _ in steps)]
        cum_t = [0.0, *accumulate(t for _, t in steps)]
        if cum_d[-1] > 0 and cum_t[-1] > 0:

            def by_steps(d_mi: float) -> float:
                x = min(max(d_mi / geom_total_mi, 0.0), 1.0) * cum_d[-1]
                i = min(max(bisect_right(cum_d, x), 1), len(cum_d) - 1)
                span = cum_d[i] - cum_d[i - 1]
                f = 0.0 if span <= 0 else (x - cum_d[i - 1]) / span
                return cum_t[i - 1] + (cum_t[i] - cum_t[i - 1]) * f

            return by_steps, "step_durations"
    return (lambda d_mi: duration_s * min(max(d_mi / geom_total_mi, 0.0), 1.0)), "proportional"


# --- Hours of service (simplified FMCSA property-carrying rules) ---
# 30-minute break after 8 h of driving, 10 h off duty after 11 h of driving. Ignores sleeper-berth splits,
# the 14-hour window and the 60/70-hour weekly limits, so it is an estimate, not a compliance tool.
SHIFT_S, BREAK_AFTER_S, BREAK_S, REST_S = 11 * 3600, 8 * 3600, 30 * 60, 10 * 3600


def rest_stops(drive_s: float) -> int:
    return int(max(drive_s - 1e-6, 0) // SHIFT_S)


def hos_clock(drive_s: float) -> float:
    """Wall-clock seconds elapsed after `drive_s` seconds of driving, including mandatory breaks."""
    full = rest_stops(drive_s)
    rem = drive_s - full * SHIFT_S
    return drive_s + full * (BREAK_S + REST_S) + (BREAK_S if rem > BREAK_AFTER_S else 0)
