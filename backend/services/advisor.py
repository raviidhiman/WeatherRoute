"""Route advisor. The deterministic summary is always available and needs no AI.
An OpenAI-compatible model can optionally add a short plain-language explanation. The model only
*explains* computed results: it never changes eligibility, risk or the recommendation, and it only
sees facts the server cached itself (never client-supplied text)."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings

from . import units as U
from .errors import AnalysisError
from .http import ProviderError, post_json

log = logging.getLogger(__name__)
LABEL = {"mi": "mi", "km": "km", "mph": "mph", "kmh": "km/h", "lb": "lb", "kg": "kg", "in_per_hr": "in/hr", "mm_per_hr": "mm/hr"}
TITLE = {"low": "Low", "moderate": "Moderate", "high": "High", "severe": "Severe", "no_travel": "No Travel"}
SYSTEM = (
    "You are a cautious trucking route-weather advisor. Use ONLY the facts provided. Never contradict the stated "
    "eligibility or recommendation, never call a route safe, and say so when data is incomplete. Reply in plain text "
    "(no markdown), at most 110 words, using the units given."
)


def ai_enabled() -> bool:
    return bool(settings.AI_API_KEY and settings.AI_BASE_URL and settings.AI_MODEL)


def _d(mi, u):
    return f"{U.from_canonical(mi, u['distance']):,.0f} {LABEL[u['distance']]}"


def _hours(s):
    return f"{int(s // 3600)} h {int(s % 3600 // 60):02d} min"


def _when(iso, tz):
    dt = datetime.fromisoformat(iso).astimezone(ZoneInfo(tz))
    return f"{dt:%a} {dt.hour % 12 or 12} {'AM' if dt.hour < 12 else 'PM'}"


def deterministic(s: dict, u: dict) -> list[str]:
    out, rec = [], s["recommendation"]
    best = next((r for r in s["routes"] if r["id"] == rec["route_id"]), None)
    if rec["level"] == "none" or not best:
        out.append(
            "No route is eligible: every route has a confirmed No Travel condition for this load and departure. Try another departure time or a lighter load."
        )
    else:
        lead = "the recommended route" if rec["level"] == "recommended" else "a provisional pick (weather data is incomplete, so it is not verified)"
        out.append(
            f"{best['label']} is {lead}: {_d(best['severe_miles'], u)} of Severe and {_d(best['high_miles'], u)} of High-risk road over {_d(best['distance_mi'], u)}, about {_hours(best['trip_s'])} door to door."
        )
        for h in best["hotspots"][:2]:
            sp, pr = U.from_canonical(h["wind_mph"] or 0, u["speed"]), u["precip"]
            out.append(
                f"Watch mile {_d(h['mile'], u)} on {best['label']} around {_when(h['eta'], s['timezone'])}: {TITLE[h['level']]} risk, wind {sp:.0f} {LABEL[u['speed']]}, "
                f"rain {U.from_canonical(h['rain_in_hr'] or 0, pr):.2f} and snow {U.from_canonical(h['snow_in_hr'] or 0, pr):.2f} {LABEL[pr]}."
            )
        if best["rest_stops"]:
            out.append(
                f"Expect {best['rest_stops']} required 10-hour rest(s) (hours-of-service estimate); weather is checked at your delayed arrival times."
            )
    opts = s["options"]
    now, top = opts[0], next(o for o in opts if o["best"])
    order = {"recommended": 0, "provisional": 1, "none": 2}
    better = (order[top["level"]], top["severe_miles"] or 0, top["high_miles"] or 0) < (
        order[now["level"]],
        now["severe_miles"] or 0,
        now["high_miles"] or 0,
    )
    if top["offset_h"] > 0 and better:
        out.append(
            f"Leaving about {top['offset_h']} h later would lower exposure (Severe {_d(top['severe_miles'] or 0, u)}, High {_d(top['high_miles'] or 0, u)} on the best route then)."
        )
    elif top["offset_h"] == 0:
        out.append("Leaving at your chosen time is the best of the departure times compared (up to 24 h later).")
    unresolved = sum(r["unresolved"] for r in s["routes"])
    if unresolved:
        out.append(f"Weather was unavailable at {unresolved} checkpoint(s); unknown is never treated as safe. Retry before relying on this result.")
    return out


def ask_llm(findings: list[str], s: dict, u: dict) -> str:
    if not ai_enabled():
        raise AnalysisError("ai_disabled", "AI reasoning is not configured on this server.", 503)
    facts = [
        f"{r['label']}: {r['eligibility']}, {_d(r['distance_mi'], u)}, Severe {_d(r['severe_miles'], u)}, High {_d(r['high_miles'], u)}, unknown {_d(r['unknown_miles'], u)}"
        for r in s["routes"]
    ]
    user = (
        "Recommendation: "
        + s["recommendation"]["level"]
        + "\nRoutes:\n"
        + "\n".join(facts)
        + "\nFindings:\n"
        + "\n".join(findings)
        + "\nWrite a short, practical briefing for the driver or dispatcher."
    )
    payload = {
        "model": settings.AI_MODEL,
        "temperature": 0.2,
        "max_tokens": 900,  # reasoning models spend part of the budget thinking; output is capped again below
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
    }
    try:
        data = post_json(f"{settings.AI_BASE_URL}/chat/completions", payload, {"Authorization": f"Bearer {settings.AI_API_KEY}"}, settings.AI_TIMEOUT)
        text = data["choices"][0]["message"]["content"]
        if not isinstance(text, str) or not text.strip():
            raise ValueError("empty")
    except (ProviderError, KeyError, IndexError, TypeError, ValueError) as exc:
        log.warning("ai advisor failed: %s", type(exc).__name__)
        raise AnalysisError("ai_unavailable", "The AI service did not respond. The rule-based summary is still shown.", 502) from None
    return text.strip()[:1500]
