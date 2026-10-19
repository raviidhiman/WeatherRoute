"""Turn-by-turn list from provider maneuvers: same-road steps are merged to keep the payload small."""

MAX_STEPS = 400
ROUNDABOUT = {"roundabout", "rotary", "roundabout turn", "exit roundabout", "exit rotary"}


def _text(m: dict, road: str) -> str:
    t, mod = m["type"], m["modifier"]
    if t == "depart":
        return f"Head {mod} on {road}".replace("  ", " ")
    if t == "arrive":
        return "Arrive at your destination"
    if t in ("turn", "end of road"):
        return f"Turn {mod} onto {road}" if mod else f"Turn onto {road}"
    if t == "on ramp":
        return f"Take the ramp onto {road}"
    if t == "off ramp":
        return f"Take the exit onto {road}"
    if t == "merge":
        return f"Merge onto {road}"
    if t == "fork":
        return f"Keep {mod} onto {road}" if mod else f"Keep onto {road}"
    if t in ROUNDABOUT:
        return f"At the roundabout, continue onto {road}"
    return f"Continue on {road}"


def build(mans: list[dict] | None, geom_total_mi: float) -> list[dict]:
    """[{text, road, start_mi, distance_mi}], distances scaled so they sum to the geometry length."""
    if not mans:
        return []
    total_m = sum(m["d"] for m in mans) or 1.0
    out, start_m = [], 0.0
    for m in mans:
        road = m["ref"] or m["name"] or "unnamed road"
        mi = m["d"] / total_m * geom_total_mi
        if out and out[-1]["road"] == road and m["type"] != "arrive":
            out[-1]["distance_mi"] += mi
        else:
            out.append({"text": _text(m, road), "road": road, "start_mi": start_m / total_m * geom_total_mi, "distance_mi": mi})
        start_m += m["d"]
    return [{**s, "start_mi": round(s["start_mi"], 2), "distance_mi": round(s["distance_mi"], 2)} for s in out[:MAX_STEPS]]
