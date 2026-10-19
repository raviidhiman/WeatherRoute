import { makeSchema } from "./validation";

const loc = (lat: number, lon: number) => ({ label: "x", lat, lon });
const ok = { origin: loc(39.7, -105), destination: loc(40.7, -111.9), departure_local: "2026-10-20T08:00", timezone: "America/Denver", load_weight: "28000", checkpoint_interval: 25 as const, hos: false };

describe("form schema", () => {
  it("accepts a valid trip", () => expect(makeSchema("lb").safeParse(ok).success).toBe(true));
  it.each([["origin", null], ["load_weight", "-4"], ["load_weight", "abc"], ["load_weight", ""], ["load_weight", "9999999"],
    ["checkpoint_interval", 7], ["timezone", "Europe/London"], ["departure_local", ""]])("rejects bad %s", (k, v) => {
    expect(makeSchema("lb").safeParse({ ...ok, [k]: v }).success).toBe(false);
  });
  it("rejects non-US coordinates and identical endpoints", () => {
    expect(makeSchema("lb").safeParse({ ...ok, origin: loc(51.5, -0.12) }).success).toBe(false);
    expect(makeSchema("lb").safeParse({ ...ok, destination: ok.origin }).success).toBe(false);
  });
  it("interprets the weight range in the selected unit", () => {
    expect(makeSchema("kg").safeParse({ ...ok, load_weight: "13607" }).success).toBe(true);
    expect(makeSchema("kg").safeParse({ ...ok, load_weight: "0.2" }).success).toBe(false);
  });
});
