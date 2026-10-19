import type { Location } from "../types";

export type RecentTrip = { origin: Location; destination: Location };
const KEY = "weatherroute.recent.v1";
const MAX = 5;
const isLoc = (x: unknown): x is Location => {
  const l = x as Location;
  return !!l && typeof l.label === "string" && l.label.length <= 120 && Number.isFinite(l.lat) && Number.isFinite(l.lon);
};

/** Stored only in this browser (localStorage); validated on read because storage is untrusted. */
export function loadRecent(): RecentTrip[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((t) => isLoc(t?.origin) && isLoc(t?.destination)).slice(0, MAX) : [];
  } catch { return []; }
}

export function saveRecent(trip: RecentTrip): RecentTrip[] {
  const same = (a: RecentTrip) => a.origin.label === trip.origin.label && a.destination.label === trip.destination.label;
  const next = [trip, ...loadRecent().filter((t) => !same(t))].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: feature degrades silently */ }
  return next;
}

export function clearRecent() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
