import { RISK, riskColor } from "./lib/risk";
import { makeTheme } from "./theme";

describe("theme", () => {
  it("has separate light and dark palettes with theme-aware borders", () => {
    const light = makeTheme("light"), dark = makeTheme("dark");
    expect(light.palette.mode).toBe("light");
    expect(dark.palette.mode).toBe("dark");
    expect(light.palette.background.paper).not.toBe(dark.palette.background.paper);
    expect(light.palette.divider).not.toBe(dark.palette.divider);
  });

  it("uses a lighter risk text color on dark backgrounds", () => {
    for (const m of RISK) {
      expect(riskColor(m, false)).toBe(m.color);
      expect(riskColor(m, true)).toBe(m.darkColor);
      expect(m.darkColor).not.toBe(m.color);
    }
  });
});
