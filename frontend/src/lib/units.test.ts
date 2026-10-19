import { convertWeightInput, cToF, formatDistance, formatPrecip, formatSpeed, formatTemp, fromCanonical, fToC, METRIC_UNITS, toCanonical, US_UNITS } from "./units";

describe("unit conversions", () => {
  it("uses the exact constants", () => {
    expect(fromCanonical(1, "km")).toBe(1.609344);
    expect(fromCanonical(1, "kg")).toBe(0.45359237);
    expect(fromCanonical(1, "mm_per_hr")).toBe(25.4);
    expect(fromCanonical(55, "kmh")).toBeCloseTo(88.51392, 5);
  });
  it.each([["km", 123.4], ["kmh", 88.5], ["kg", 18000.5], ["mm_per_hr", 7.3]] as const)("round-trips %s", (u, v) => {
    expect(fromCanonical(toCanonical(v, u), u)).toBeCloseTo(v, 9);
  });
  it("converts temperature affinely", () => {
    expect(fToC(212)).toBe(100);
    expect(fToC(-40)).toBe(-40);
    expect(cToF(fToC(98.6))).toBeCloseTo(98.6, 9);
  });
  it("formats values in the selected units and never fakes missing data", () => {
    expect(formatSpeed(55, METRIC_UNITS)).toBe("89 km/h");
    expect(formatDistance(10, METRIC_UNITS)).toBe("16.1 km");
    expect(formatPrecip(0.1, METRIC_UNITS)).toBe("2.5 mm/hr");
    expect(formatTemp(32, METRIC_UNITS)).toBe("0 °C");
    expect(formatSpeed(null, US_UNITS)).toBe("n/a");
  });
  it("converts the typed weight when the unit changes", () => {
    expect(convertWeightInput("30000", "lb", "kg")).toBe("13607.77");
    expect(convertWeightInput("", "lb", "kg")).toBe("");
    expect(convertWeightInput("abc", "lb", "kg")).toBe("abc");
    expect(convertWeightInput("100", "lb", "lb")).toBe("100");
  });
});
