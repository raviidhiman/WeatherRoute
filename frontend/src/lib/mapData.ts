import type { FeatureCollection, Feature, LineString, Point } from "geojson";
import type { Level, Route } from "../types";

export const ROUTE_COLORS = ["#0B6BCB", "#8A3FFC", "#B25E09"];
/** Heatmap weight per risk level; unknown (-1) contributes nothing. */
export const HEAT_WEIGHT = [0.05, 0.3, 0.55, 0.85, 1];

export function routesToGeoJSON(routes: Route[], selectedId: string | null): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: routes.map((r, i): Feature<LineString> => ({
      type: "Feature",
      properties: { id: r.id, label: r.label, color: ROUTE_COLORS[i % ROUTE_COLORS.length], selected: r.id === selectedId },
      geometry: { type: "LineString", coordinates: r.geometry },
    })),
  };
}

/** risk at a checkpoint for a forecast hour (0..48 after departure) or, when hour is null, at the truck's ETA. -1 = unknown. */
export const riskAt = (cp: Route["checkpoints"][number], hour: number | null): Level | -1 => (hour === null ? cp.risk : cp.forecast.risk[hour]) ?? -1;

export function checkpointsToGeoJSON(routes: Route[], hour: number | null, selectedId: string | null): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const r of routes) {
    for (const c of r.checkpoints) {
      const risk = riskAt(c, hour);
      features.push({
        type: "Feature",
        properties: { routeId: r.id, index: c.index, risk, heat: risk < 0 ? 0 : HEAT_WEIGHT[risk], selected: r.id === selectedId },
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export function boundsOf(routes: Route[]): [[number, number], [number, number]] | null {
  let w = 180, s = 90, e = -180, n = -90, any = false;
  for (const r of routes) for (const [lon, lat] of r.geometry) { any = true; w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat); }
  return any ? [[w, s], [e, n]] : null;
}
