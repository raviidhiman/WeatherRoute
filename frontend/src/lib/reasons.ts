import type { Reason, Route } from "../types";
import { formatDistance, formatDuration, type UnitPrefs } from "./units";

/** Turns the API's structured recommendation reasons into sentences in the user's units. */
export function reasonText(r: Reason, routes: Route[], bestId: string | null, u: UnitPrefs): string {
  const label = (id?: string) => routes.find((x) => x.id === id)?.label ?? "another route";
  const best = label(bestId ?? undefined);
  const v = r.value ?? 0, o = r.other_value ?? 0;
  switch (r.code) {
    case "provisional": return "Weather data is incomplete on this route, so it is NOT verified safe. Treat this as provisional.";
    case "only_route": return "It is the only route that can be evaluated.";
    case "fewer_severe_miles": return `${best} has ${formatDistance(v, u)} of Severe-risk road versus ${formatDistance(o, u)} on ${label(r.other_id)}.`;
    case "fewer_high_miles": return `Severe miles are equal; ${best} has ${formatDistance(v, u)} of High-risk road versus ${formatDistance(o, u)} on ${label(r.other_id)}.`;
    case "lower_average_risk": return `Severe and High miles are equal; ${best} has a lower average risk (${v.toFixed(2)} vs ${o.toFixed(2)} on a 0–4 scale) than ${label(r.other_id)}.`;
    case "shorter_travel_time": return `Risk is equal; ${best} is faster (${formatDuration(v)} vs ${formatDuration(o)} on ${label(r.other_id)}).`;
    case "tie": return `${best} ties with ${label(r.other_id)} on every criterion and was chosen by provider order.`;
    case "excluded": return `${(r.ids ?? []).map(label).join(", ")} excluded because of a confirmed No Travel condition.`;
    case "all_restricted": return "Every route has a confirmed No Travel condition. No route is eligible for this load and departure time.";
    default: return "";
  }
}

export const eligibilityText: Record<Route["eligibility"], string> = {
  eligible: "Eligible", incomplete: "Incomplete data", restricted: "No Travel",
};
