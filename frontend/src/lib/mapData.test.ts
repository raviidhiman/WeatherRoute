import { boundsOf, checkpointsToGeoJSON, HEAT_WEIGHT, riskAt, routesToGeoJSON } from "./mapData";
import type { Checkpoint, Route } from "../types";

const cp = (i: number, risk: number | null, fc: (number | null)[]): Checkpoint => ({
  index: i, distance_mi: i * 25, lat: 40 + i, lon: -100 - i, eta: "", segment_mi: 25, wind_mph: 1, rain_in_hr: 0, snow_in_hr: 0, temp_f: 50,
  hazards: { wind: null, rain: null, snow: null }, risk: risk as never, resolved: risk !== null,
  forecast: { wind: [], rain: [], snow: [], temp: [], risk: fc as never },
});
const route: Route = {
  id: "r1", label: "Route A", rank: 1, distance_mi: 50, duration_s: 100, eta: "", eta_method: "proportional", geometry: [[-100, 40], [-102, 42]],
  checkpoints: [cp(0, 1, [3, null]), cp(1, null, [null, 4])], eligibility: "incomplete", severe_miles: 0, high_miles: 0, no_travel_miles: 0,
  unknown_miles: 25, unresolved_checkpoints: 1, average_risk: 1, trip_s: 100, rest_stops: 0, directions: [],
};

describe("map data", () => {
  it("uses ETA risk when hour is null and the forecast otherwise; unknown is -1, never 0", () => {
    expect(riskAt(route.checkpoints[0], null)).toBe(1);
    expect(riskAt(route.checkpoints[0], 0)).toBe(3);
    expect(riskAt(route.checkpoints[1], null)).toBe(-1);
    expect(riskAt(route.checkpoints[0], 1)).toBe(-1);
  });
  it("gives unknown checkpoints no heat and flags the selected route", () => {
    const f = checkpointsToGeoJSON([route], null, "r1").features;
    expect(f[0].properties).toMatchObject({ risk: 1, heat: HEAT_WEIGHT[1], selected: true });
    expect(f[1].properties).toMatchObject({ risk: -1, heat: 0 });
    expect(routesToGeoJSON([route], "x").features[0].properties?.selected).toBe(false);
  });
  it("computes bounds, or null when empty", () => {
    expect(boundsOf([route])).toEqual([[-102, 40], [-100, 42]]);
    expect(boundsOf([])).toBeNull();
  });
});
