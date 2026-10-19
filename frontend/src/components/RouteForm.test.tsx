import { fireEvent, render, screen } from "@testing-library/react";
import { coordLocation, shortLabel } from "../lib/pin";
import { METRIC_UNITS, US_UNITS } from "../lib/units";
import RouteForm from "./RouteForm";

const base = { busy: false, serverError: null, onSubmit: () => {}, pickTarget: null, onPickTarget: () => {}, onPoints: () => {} };

describe("RouteForm", () => {
  it("converts the typed cargo weight when the weight unit changes", () => {
    const { rerender } = render(<RouteForm units={US_UNITS} {...base} />);
    const input = screen.getByLabelText("Cargo weight") as HTMLInputElement;
    expect(input.value).toBe("28000");
    rerender(<RouteForm units={METRIC_UNITS} {...base} />);
    expect(input.value).toBe("12700.59");
    rerender(<RouteForm units={US_UNITS} {...base} />);
    expect(Number(input.value)).toBeCloseTo(28000, 1);
  });

  it("blocks submission and explains what to fix", async () => {
    const onSubmit = vi.fn();
    render(<RouteForm units={US_UNITS} {...base} onSubmit={onSubmit} />);
    screen.getByRole("button", { name: /compare routes/i }).click();
    expect((await screen.findAllByText(/choose a us location/i)).length).toBe(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("starts map-pin mode for the chosen end and toggles it off again", () => {
    const onPickTarget = vi.fn();
    const { rerender } = render(<RouteForm units={US_UNITS} {...base} onPickTarget={onPickTarget} />);
    fireEvent.click(screen.getByRole("button", { name: /pick origin on the map/i }));
    expect(onPickTarget).toHaveBeenLastCalledWith("origin");
    fireEvent.click(screen.getByRole("button", { name: /pick destination on the map/i }));
    expect(onPickTarget).toHaveBeenLastCalledWith("destination");
    rerender(<RouteForm units={US_UNITS} {...base} pickTarget="origin" onPickTarget={onPickTarget} />);
    fireEvent.click(screen.getByRole("button", { name: /pick origin on the map/i }));
    expect(onPickTarget).toHaveBeenLastCalledWith(null);
  });

  it("fills the origin from the device position", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 39.7392, longitude: -104.9903 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    render(<RouteForm units={US_UNITS} {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /use my current location as origin/i }));
    expect(((await screen.findByLabelText("Origin")) as HTMLInputElement).value).toBe("My location (39.7392, -104.9903)");
  });

  it("explains a denied location permission instead of failing silently", async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, err: PositionErrorCallback) => err({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    render(<RouteForm units={US_UNITS} {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /use my current location as destination/i }));
    expect(await screen.findByText(/permission was denied/i)).toBeInTheDocument();
  });
});

describe("coordLocation", () => {
  it("rounds to a short label and a 5-decimal point (about 1 m)", () => {
    expect(coordLocation("Dropped pin", 39.739236, -104.990251)).toEqual({ label: "Dropped pin (39.7392, -104.9903)", lat: 39.73924, lon: -104.99025 });
  });
});

describe("shortLabel", () => {
  it("keeps the city, and hides raw coordinates", () => {
    expect(shortLabel("Denver, Colorado")).toBe("Denver");
    expect(shortLabel("Dropped pin (40.2453, -102.8485)")).toBe("Dropped pin");
    expect(shortLabel("My location (39.7392, -104.9903)")).toBe("My location");
  });
});
