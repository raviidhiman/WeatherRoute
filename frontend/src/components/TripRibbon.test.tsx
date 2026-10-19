import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { US_UNITS, type UnitPrefs } from "../lib/units";
import type { Route } from "../types";
import TripRibbon from "./TripRibbon";

const cp = (i: number, temp: number, rain: number) => ({ index: i, temp_f: temp, rain_in_hr: rain, snow_in_hr: 0 });
const route = { label: "Route A", trip_s: 3600 * 5, distance_mi: 100, duration_s: 3600 * 2, checkpoints: [cp(0, 32, 0.1), cp(1, 50, 0.25)] } as unknown as Route;

function Harness() {
  const [u, setU] = useState<UnitPrefs>(US_UNITS);
  return <TripRibbon origin="Denver, Colorado" destination="Salt Lake City, Utah" route={route} loadLb={30000} units={u} onUnits={setU} />;
}

describe("TripRibbon", () => {
  it("shows the trip summary in US units", () => {
    render(<Harness />);
    expect(screen.getByText("Denver")).toBeInTheDocument();
    expect(screen.getByText("Salt Lake City")).toBeInTheDocument();
    expect(screen.getByText("100 mi")).toBeInTheDocument();
    expect(screen.getByText("50 mph")).toBeInTheDocument();
    expect(screen.getByText("32–50 °F")).toBeInTheDocument();
    expect(screen.getByText("30,000 lb")).toBeInTheDocument();
    expect(screen.getByText(/rain 0.25/)).toBeInTheDocument();
  });
  it("each value switches its own unit and the preset switches all", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /^Distance/ }));
    expect(screen.getByText("160.9 km")).toBeInTheDocument();
    expect(screen.getByText("50 mph")).toBeInTheDocument(); // others untouched
    await user.click(screen.getByRole("button", { name: "Metric" }));
    expect(screen.getByText("80 km/h")).toBeInTheDocument();
    expect(screen.getByText("0–10 °C")).toBeInTheDocument();
    expect(screen.getByText("13,608 kg")).toBeInTheDocument();
    expect(screen.getByText(/rain 6.4 · snow 0 mm\/hr/)).toBeInTheDocument();
  });
});
