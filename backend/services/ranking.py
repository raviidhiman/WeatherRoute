"""Route metrics + deterministic lexicographic ranking (O(n) metrics, O(r log r) sort).
Risk scale for averages: low=0, moderate=1, high=2, severe=3, no_travel=4."""

from .risk import HIGH, NO_TRAVEL, SEVERE

NDIGITS = 6  # strips float noise from mile sums before comparing; not display rounding


def route_metrics(checkpoints: list[dict]) -> dict:
    severe = high = no_travel = unknown = weighted = known = 0.0
    unresolved = 0
    restricted = False
    for c in checkpoints:
        m, r = c["segment_mi"], c["risk"]
        if r == SEVERE:
            severe += m
        elif r == HIGH:
            high += m
        elif r == NO_TRAVEL:
            no_travel += m
            restricted = True
        if not c["resolved"]:
            unresolved += 1
            unknown += m
        if r is not None:
            weighted += r * m
            known += m
    return {
        "severe_miles": severe,
        "high_miles": high,
        "no_travel_miles": no_travel,
        "unknown_miles": unknown,
        "unresolved_checkpoints": unresolved,
        "average_risk": weighted / known if known > 0 else None,
        "eligibility": "restricted" if restricted else "incomplete" if unresolved else "eligible",
    }


def _key(r: dict) -> tuple:
    return (
        round(r["severe_miles"], NDIGITS),
        round(r["high_miles"], NDIGITS),
        round(r["average_risk"] or 0.0, NDIGITS),
        round(r["duration_s"], 3),
        r["index"],
    )


def _provisional_key(r: dict) -> tuple:  # less missing data first, so gaps never win by default
    return (round(r["unknown_miles"], NDIGITS), *_key(r))


def rank_routes(routes: list[dict]) -> list[dict]:
    """Assigns `rank` (None for restricted) and returns routes in ranked order."""
    by = {"eligible": [], "incomplete": [], "restricted": []}
    for r in routes:
        by[r["eligibility"]].append(r)
    ordered = sorted(by["eligible"], key=_key) + sorted(by["incomplete"], key=_provisional_key) + sorted(by["restricted"], key=_key)
    for n, r in enumerate(ordered, 1):
        r["rank"] = None if r["eligibility"] == "restricted" else n
    return ordered


CRITERIA = (
    ("fewer_severe_miles", "severe_miles"),
    ("fewer_high_miles", "high_miles"),
    ("lower_average_risk", "average_risk"),
    ("shorter_travel_time", "duration_s"),
)


def recommend(ordered: list[dict]) -> dict:
    """Structured reasons (codes + values) so the UI can render them in the user's units."""
    pools = (("recommended", "eligible"), ("provisional", "incomplete"))
    level, pool = next(((lv, p) for lv, nm in pools if (p := [r for r in ordered if r["eligibility"] == nm])), (None, []))
    if not pool:
        return {"route_id": None, "level": "none", "reasons": [{"code": "all_restricted"}]}
    best, reasons = pool[0], []
    if level == "provisional":
        reasons.append({"code": "provisional"})
    if len(pool) == 1:
        reasons.append({"code": "only_route"})
    else:
        other = pool[1]
        for code, field in CRITERIA:
            a, b = round(best[field] or 0.0, NDIGITS), round(other[field] or 0.0, NDIGITS)
            if a != b:
                reasons.append({"code": code, "other_id": other["id"], "value": best[field], "other_value": other[field]})
                break
        else:
            reasons.append({"code": "tie", "other_id": other["id"]})
    excluded = [r["id"] for r in ordered if r["eligibility"] == "restricted"]
    if excluded:
        reasons.append({"code": "excluded", "ids": excluded})
    return {"route_id": best["id"], "level": level, "reasons": reasons}
