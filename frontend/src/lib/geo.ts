import type { Direction, Route } from "../types";

const R_MI = 3958.7613;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Cumulative miles along a [lon, lat] polyline. */
export function cumulativeMi(geom: [number, number][]): number[] {
  const cum = [0];
  for (let i = 1; i < geom.length; i++) cum.push(cum[i - 1] + haversineMi(geom[i - 1][1], geom[i - 1][0], geom[i][1], geom[i][0]));
  return cum;
}

/** Nearest route vertex to a position (route vertices are ~0.3 mi apart, which bounds the error). O(n). */
export function progressAlong(geom: [number, number][], cum: number[], lat: number, lon: number) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < geom.length; i++) {
    const d = haversineMi(lat, lon, geom[i][1], geom[i][0]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { mile: cum[best] ?? 0, offRouteMi: bestD };
}

export type NavInfo = { mile: number; remainingMi: number; toNextMi: number | null; next: Direction | null; offRoute: boolean };

/** Where the user is on the selected route and what comes next. Off route when > 2 mi from the line. */
export function navInfo(route: Route, cum: number[], pos: { lat: number; lon: number }): NavInfo {
  const { mile, offRouteMi } = progressAlong(route.geometry, cum, pos.lat, pos.lon);
  const total = cum[cum.length - 1] ?? route.distance_mi;
  const next = route.directions.find((d) => d.start_mi > mile + 0.05) ?? null;
  return { mile, remainingMi: Math.max(0, total - mile), toNextMi: next ? next.start_mi - mile : null, next, offRoute: offRouteMi > 2 };
}
