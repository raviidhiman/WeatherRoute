"""Orchestration: routes -> checkpoints/ETA -> weather -> risk -> ranking -> response.
Weather is fetched once; the departure-time comparison re-evaluates the same cached series (no extra network)."""

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import cache

from . import weather as wx
from .directions import build as build_directions
from .errors import AnalysisError
from .eta import hos_clock, make_time_fn, rest_stops
from .geo import build_checkpoints, cumulative, decimate
from .ranking import rank_routes, recommend, route_metrics
from .risk import LEVEL_NAMES, assess
from .routing import fetch_routes

FORECAST_HOURS = 49  # slider 0..48, relative to departure
OFFSETS_H = (0, 2, 4, 6, 9, 12, 18, 24)  # departure-time comparison
LABELS = "ABC"
SUMMARY_TTL = 1800
LEVEL_RANK = {"recommended": 0, "provisional": 1, "none": 2}


def _wkey(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, 2), round(lon, 2))  # dedupe + privacy: ~1 km


def _r(v, n):
    return None if v is None else round(v, n)  # presentation rounding only, after classification


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat()


def _checkpoint(i, cp, nxt_d, series, dep_ts, elapsed, load, with_forecast):
    d, lat, lon = cp
    eta_ts = dep_ts + elapsed
    now = wx.values_at(series, eta_ts)
    a = assess(now["wind"], now["rain"], now["snow"], load)
    out = {
        "index": i,
        "distance_mi": d,
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "eta": _iso(eta_ts),
        "segment_mi": 0.0 if nxt_d is None else nxt_d - d,
        "wind_mph": _r(now["wind"], 1),
        "rain_in_hr": _r(now["rain"], 3),
        "snow_in_hr": _r(now["snow"], 3),
        "temp_f": _r(now["temp"], 1),
        "hazards": {"wind": a.wind, "rain": a.rain, "snow": a.snow},
        "risk": a.risk,
        "resolved": a.resolved,
    }
    if with_forecast:
        fc = {"wind": [], "rain": [], "snow": [], "temp": [], "risk": []}
        for h in range(FORECAST_HOURS):
            v = wx.values_at(series, dep_ts + h * 3600)
            ah = assess(v["wind"], v["rain"], v["snow"], load)
            fc["wind"].append(_r(v["wind"], 1))
            fc["rain"].append(_r(v["rain"], 3))
            fc["snow"].append(_r(v["snow"], 3))
            fc["temp"].append(_r(v["temp"], 1))
            fc["risk"].append(ah.risk)
        out["forecast"] = fc
    return out


def _evaluate(prepared, series, dep_ts, load, hos, with_forecast):
    routes = []
    for idx, p in enumerate(prepared):
        clock = (lambda d, f=p["time_fn"]: hos_clock(f(d))) if hos else p["time_fn"]
        cps = p["cps"]
        out = [
            _checkpoint(i, c, cps[i + 1][0] if i + 1 < len(cps) else None, series.get(_wkey(c[1], c[2])), dep_ts, clock(c[0]), load, with_forecast)
            for i, c in enumerate(cps)
        ]
        trip = hos_clock(p["duration_s"]) if hos else p["duration_s"]
        routes.append(
            {
                "id": f"r{idx + 1}",
                "index": idx,
                "label": f"Route {LABELS[idx]}",
                "distance_mi": round(p["total"], 2),
                "duration_s": round(p["duration_s"]),
                "trip_s": round(trip),
                "rest_stops": rest_stops(p["duration_s"]) if hos else 0,
                "eta": _iso(dep_ts + trip),
                "eta_method": p["method"],
                "checkpoints": out,
                **route_metrics(out),
            }
        )
    return routes


def _options(prepared, series, dep_ts, load, hos, tz):
    """Best route if the truck leaves OFFSETS_H hours later; the single best option is flagged."""
    zone, opts = ZoneInfo(tz), []
    for off in OFFSETS_H:
        t = dep_ts + off * 3600
        routes = _evaluate(prepared, series, t, load, hos, False)
        ordered = rank_routes(routes)
        rec = recommend(ordered)
        best = next((r for r in routes if r["id"] == rec["route_id"]), None)
        opts.append(
            {
                "offset_h": off,
                "depart_local": datetime.fromtimestamp(t, zone).strftime("%Y-%m-%dT%H:%M"),
                "depart_utc": _iso(t),
                "level": rec["level"],
                "route_id": rec["route_id"],
                "severe_miles": best["severe_miles"] if best else None,
                "high_miles": best["high_miles"] if best else None,
                "average_risk": best["average_risk"] if best else None,
                "unresolved": best["unresolved_checkpoints"] if best else None,
                "best": False,
            }
        )

    def key(o):
        return (
            LEVEL_RANK[o["level"]],
            round(o["severe_miles"] or 0, 6),
            round(o["high_miles"] or 0, 6),
            round(o["average_risk"] or 0, 6),
            o["offset_h"],
        )

    min(opts, key=key)["best"] = True
    return opts


def _hotspots(route):
    worst = sorted((c for c in route["checkpoints"] if c["risk"] is not None and c["risk"] >= 1), key=lambda c: (-c["risk"], c["distance_mi"]))[:3]
    return [
        {
            "mile": round(c["distance_mi"]),
            "level": LEVEL_NAMES[c["risk"]],
            "wind_mph": c["wind_mph"],
            "rain_in_hr": c["rain_in_hr"],
            "snow_in_hr": c["snow_in_hr"],
            "eta": c["eta"],
        }
        for c in worst
    ]


def analyze(req: dict) -> dict:
    dep_ts, load, hos, tz = req["departure_utc"].timestamp(), req["load_lb"], req.get("hos", False), req["timezone"]
    raw = fetch_routes(req["origin"], req["destination"])

    prepared, keys = [], set()
    for rt in raw:
        cum = cumulative(rt["coords"])
        if cum[-1] < 0.5:
            raise AnalysisError("route_too_short", "Origin and destination are too close together.", 422)
        cps = build_checkpoints(rt["coords"], cum, req["interval_mi"])
        if len(cps) > settings.MAX_CHECKPOINTS:
            raise AnalysisError("too_many_checkpoints", "This trip needs too many checkpoints. Choose a larger interval.", 422)
        time_fn, method = make_time_fn(cum[-1], rt["duration_s"], rt["steps"])
        keys.update(_wkey(c[1], c[2]) for c in cps)
        prepared.append(
            {
                "cps": cps,
                "total": cum[-1],
                "duration_s": rt["duration_s"],
                "time_fn": time_fn,
                "method": method,
                "coords": rt["coords"],
                "maneuvers": rt.get("maneuvers"),
            }
        )

    series = wx.fetch(keys)
    routes = _evaluate(prepared, series, dep_ts, load, hos, True)
    for r, p in zip(routes, prepared):
        r["geometry"] = decimate(p["coords"])
        r["directions"] = build_directions(p["maneuvers"], p["total"])
    ordered = rank_routes(routes)
    rec = recommend(ordered)
    options = _options(prepared, series, dep_ts, load, hos, tz)

    analysis_id = uuid.uuid4().hex
    cache.set(
        f"an:{analysis_id}",
        {  # compact facts for the advisor; the client never supplies them
            "load_lb": load,
            "timezone": tz,
            "hos": hos,
            "options": options,
            "recommendation": {"route_id": rec["route_id"], "level": rec["level"]},
            "routes": [
                {
                    "id": r["id"],
                    "label": r["label"],
                    "distance_mi": r["distance_mi"],
                    "duration_s": r["duration_s"],
                    "trip_s": r["trip_s"],
                    "rest_stops": r["rest_stops"],
                    "eligibility": r["eligibility"],
                    "severe_miles": r["severe_miles"],
                    "high_miles": r["high_miles"],
                    "unknown_miles": r["unknown_miles"],
                    "average_risk": r["average_risk"],
                    "unresolved": r["unresolved_checkpoints"],
                    "hotspots": _hotspots(r),
                }
                for r in routes
            ],
        },
        SUMMARY_TTL,
    )
    for r in routes:
        r.pop("index")

    warnings = ["Routes use a general driving profile; truck height, weight and hazmat restrictions are not applied."]
    if len(routes) < 3:
        warnings.append(f"The routing provider returned {len(routes)} route(s); no alternatives were invented.")
    if any(r["eta_method"] == "proportional" for r in routes):
        warnings.append("Arrival times are estimated proportionally to distance (approximate).")
    if hos:
        warnings.append(
            "Arrival times include simplified hours-of-service breaks (30 min after 8 h, 10 h rest after 11 h of driving). Not a compliance tool."
        )
    unresolved = sum(r["unresolved_checkpoints"] for r in routes)
    if unresolved:
        warnings.append(f"Weather data is missing or out of forecast range at {unresolved} checkpoint(s); those are not treated as safe.")

    best_opt = next(o for o in options if o["best"])
    return {
        "analysis_id": analysis_id,
        "status": "partial" if unresolved else "complete",
        "generated_at": _iso(datetime.now(UTC).timestamp()),
        "departure_utc": req["departure_utc"].isoformat(),
        "timezone": tz,
        "hos": hos,
        "load_lb": load,
        "units": {"distance": "mi", "speed": "mph", "precipitation": "in_per_hr", "temperature": "F", "weight": "lb"},
        "routes": routes,  # stable A/B/C order; `rank` carries the ordering
        "recommendation": rec,
        "departure_options": options,
        "best_departure_offset_h": best_opt["offset_h"],
        "warnings": warnings + req.get("warnings", []),
    }
