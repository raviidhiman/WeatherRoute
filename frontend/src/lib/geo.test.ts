import { cumulativeMi, haversineMi, navInfo, progressAlong } from "./geo";
import type { Route } from "../types";

// ~ 69 mi per degree of latitude: a straight north-south line of 1 degree
const geom: [number, number][] = Array.from({ length: 101 }, (_, i) => [-100, 40 + i / 100]);
const cum = cumulativeMi(geom);
const route = {
  geometry: geom, distance_mi: cum[100],
  directions: [{ text: "Head north on I-25", road: "I-25", start_mi: 0, distance_mi: 40 }, { text: "Turn left onto US-6", road: "US-6", start_mi: 40, distance_mi: 29 }],
} as unknown as Route;

describe("geo", () => {
  it("haversine ~ 69 miles per degree of latitude", () => expect(haversineMi(40, -100, 41, -100)).toBeCloseTo(69.09, 1));
  it("finds progress along the route", () => {
    const p = progressAlong(geom, cum, 40.5, -100.0001);
    expect(p.mile).toBeCloseTo(34.5, 0);
    expect(p.offRouteMi).toBeLessThan(0.1);
  });
  it("reports the next maneuver and the remaining distance", () => {
    const n = navInfo(route, cum, { lat: 40.3, lon: -100 });
    expect(n.next?.text).toBe("Turn left onto US-6");
    expect(n.toNextMi).toBeCloseTo(40 - 20.7, 0);
    expect(n.remainingMi).toBeCloseTo(cum[100] - 20.7, 0);
    expect(n.offRoute).toBe(false);
  });
  it("flags off-route positions and finished trips", () => {
    expect(navInfo(route, cum, { lat: 40.5, lon: -101 }).offRoute).toBe(true);
    expect(navInfo(route, cum, { lat: 41, lon: -100 }).next).toBeNull();
  });
});
