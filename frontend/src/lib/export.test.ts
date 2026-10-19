import { routeToCsv } from "./export";
import { METRIC_UNITS, US_UNITS } from "./units";
import type { Checkpoint, Route } from "../types";

const cp = (over: Partial<Checkpoint>): Checkpoint => ({
  index: 0, distance_mi: 10, lat: 0, lon: 0, eta: "2026-10-20T14:00:00+00:00", segment_mi: 10, wind_mph: 55, rain_in_hr: 0.1, snow_in_hr: 0, temp_f: 32,
  hazards: { wind: 4, rain: 1, snow: 0 }, risk: 4, resolved: true, forecast: { wind: [], rain: [], snow: [], temp: [], risk: [] }, ...over,
});
const route = (cps: Checkpoint[]) => ({ checkpoints: cps }) as Route;

describe("CSV export", () => {
  it("converts to display units and labels the columns", () => {
    const [head, row] = routeToCsv(route([cp({})]), METRIC_UNITS, "America/Denver").split("\n");
    expect(head).toContain("Mile (km)");
    expect(head).toContain("Wind (km/h)");
    expect(row.startsWith("16.1,")).toBe(true);
    expect(row).toContain("88.5");
    expect(row).toContain("No Travel");
  });
  it("leaves unknown values empty, never zero", () => {
    const row = routeToCsv(route([cp({ wind_mph: null, risk: null, resolved: false })]), US_UNITS, "UTC").split("\n")[1].split(",");
    expect(row[2]).toBe("");
    expect(row.slice(-2)).toEqual(["Unknown", "no"]);
  });
});
