import pytest

from services.eta import make_time_fn
from services.geo import build_checkpoints, cumulative, decimate, haversine_mi
from services.ranking import rank_routes, recommend, route_metrics

LINE = [(40.0, -100.0 - i * 0.05) for i in range(0, 401)]  # ~ 15 mi per degree of lon at 40N... long straight line


def test_checkpoint_spacing_and_final_partial_segment():
    cum = cumulative(LINE)
    cps = build_checkpoints(LINE, cum, 25)
    ds = [c[0] for c in cps]
    assert ds[0] == 0 and ds[-1] == pytest.approx(cum[-1])
    assert all(b - a == pytest.approx(25) for a, b in zip(ds[:-2], ds[1:-1]))
    assert 0 < ds[-1] - ds[-2] <= 25 + 1e-6
    assert haversine_mi(*LINE[0], cps[1][1], cps[1][2]) == pytest.approx(25, rel=1e-3)


def test_route_shorter_than_interval_has_two_checkpoints():
    pts = [(40.0, -100.0), (40.0, -99.9)]
    cps = build_checkpoints(pts, cumulative(pts), 50)
    assert len(cps) == 2 and cps[0][0] == 0


def test_exact_multiple_has_no_zero_length_tail():
    pts = [(0.0, 0.0), (0.0, 1.0)]
    cum = cumulative(pts)
    cps = build_checkpoints(pts, cum, cum[-1] / 4)
    assert len(cps) == 5


def test_eta_steps_and_proportional():
    steps = [(1000, 100), (1000, 300)]  # second half is slower
    f, m = make_time_fn(10.0, 400, steps)
    assert m == "step_durations" and f(0) == 0 and f(5) == pytest.approx(100) and f(10) == pytest.approx(400)
    g, m2 = make_time_fn(10.0, 400, None)
    assert m2 == "proportional" and g(5) == 200 and g(99) == 400


def test_decimate_keeps_endpoints_and_thins():
    dense = [(40.0, -100.0 - i * 0.001) for i in range(1000)]  # ~0.05 mi apart
    out = decimate(dense)
    assert out[0] == [-100.0, 40.0] and out[-1] == [round(dense[-1][1], 5), 40.0] and len(out) < len(dense) / 3


def cp(mi, risk, resolved=True):
    return {"segment_mi": mi, "risk": risk, "resolved": resolved}


def route(i, cps, dur):
    m = route_metrics(cps)
    return {"id": f"r{i}", "index": i, "duration_s": dur, **m}


def test_metrics_use_actual_segment_miles():
    m = route_metrics([cp(25, 3), cp(25, 2), cp(7.5, 3), cp(0, 0)])
    assert m["severe_miles"] == 32.5 and m["high_miles"] == 25 and m["eligibility"] == "eligible"
    assert m["average_risk"] == pytest.approx((75 + 50 + 22.5) / 57.5)


def test_ranking_priority_time_never_beats_risk():
    fast_severe = route(0, [cp(10, 3), cp(0, 0)], 100)
    slow_clean = route(1, [cp(10, 0), cp(0, 0)], 9999)
    order = rank_routes([fast_severe, slow_clean])
    assert [r["id"] for r in order] == ["r1", "r0"]
    assert recommend(order)["route_id"] == "r1"


def test_ranking_order_high_then_avg_then_time_then_index():
    a = route(0, [cp(10, 2), cp(0, 0)], 500)
    b = route(1, [cp(10, 1), cp(0, 0)], 600)
    c = route(2, [cp(10, 1), cp(0, 0)], 600)
    order = rank_routes([a, c, b])
    assert [r["id"] for r in order] == ["r1", "r2", "r0"]  # tie b/c broken by index


def test_restricted_excluded_and_all_restricted():
    r = route(0, [cp(10, 4), cp(0, 0)], 10)
    ok = route(1, [cp(10, 3), cp(0, 0)], 99)
    assert recommend(rank_routes([r, ok]))["route_id"] == "r1"
    rec = recommend(rank_routes([route(0, [cp(1, 4), cp(0, 0)], 1)]))
    assert rec["level"] == "none" and rec["route_id"] is None


def test_incomplete_route_is_provisional_never_recommended_as_verified():
    inc = route(0, [cp(10, 0, resolved=False), cp(0, None, resolved=False)], 10)
    assert inc["eligibility"] == "incomplete"
    rec = recommend(rank_routes([inc]))
    assert rec["level"] == "provisional" and rec["reasons"][0]["code"] == "provisional"


def test_eligible_beats_incomplete_even_if_incomplete_looks_cleaner():
    inc = route(0, [cp(10, None, resolved=False), cp(0, None, resolved=False)], 10)
    ok = route(1, [cp(10, 3), cp(0, 0)], 999)
    assert recommend(rank_routes([inc, ok]))["route_id"] == "r1"
