// Pure conversions. Canonical units: mi, mph, lb, in/hr, °F. Display only: risk decisions come from the API.
export type UnitPrefs = {
  distance: "mi" | "km"; speed: "mph" | "kmh"; temperature: "F" | "C"; weight: "lb" | "kg"; precip: "in_per_hr" | "mm_per_hr";
};
export const US_UNITS: UnitPrefs = { distance: "mi", speed: "mph", temperature: "F", weight: "lb", precip: "in_per_hr" };
export const METRIC_UNITS: UnitPrefs = { distance: "km", speed: "kmh", temperature: "C", weight: "kg", precip: "mm_per_hr" };

const FACTOR = { mi: 1, km: 1.609344, mph: 1, kmh: 1.609344, lb: 1, kg: 0.45359237, in_per_hr: 1, mm_per_hr: 25.4 } as const;
export type LinearUnit = keyof typeof FACTOR;
export const fromCanonical = (v: number, u: LinearUnit) => v * FACTOR[u];
export const toCanonical = (v: number, u: LinearUnit) => v / FACTOR[u];
export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;

export const UNIT_LABEL: Record<string, string> = {
  mi: "mi", km: "km", mph: "mph", kmh: "km/h", lb: "lb", kg: "kg", in_per_hr: "in/hr", mm_per_hr: "mm/hr", F: "°F", C: "°C",
};

const NA = "n/a";
const num = (v: number, digits: number) => v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const formatDistance = (mi: number | null, p: UnitPrefs) =>
  mi == null ? NA : `${num(fromCanonical(mi, p.distance), 1)} ${UNIT_LABEL[p.distance]}`;
export const formatSpeed = (mph: number | null, p: UnitPrefs) =>
  mph == null ? NA : `${num(fromCanonical(mph, p.speed), 0)} ${UNIT_LABEL[p.speed]}`;
export const formatPrecip = (inHr: number | null, p: UnitPrefs) =>
  inHr == null ? NA : `${num(fromCanonical(inHr, p.precip), p.precip === "in_per_hr" ? 2 : 1)} ${UNIT_LABEL[p.precip]}`;
export const formatTemp = (f: number | null, p: UnitPrefs) =>
  f == null ? NA : `${num(p.temperature === "F" ? f : fToC(f), 0)} ${UNIT_LABEL[p.temperature]}`;
export const formatWeight = (lb: number, p: UnitPrefs) => `${num(fromCanonical(lb, p.weight), 0)} ${UNIT_LABEL[p.weight]}`;

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** Converts the number typed in the weight field when the user switches weight units. */
export function convertWeightInput(text: string, from: "lb" | "kg", to: "lb" | "kg"): string {
  const v = Number(text);
  if (from === to || text.trim() === "" || !Number.isFinite(v)) return text;
  return String(Math.round(fromCanonical(toCanonical(v, from), to) * 100) / 100);
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
}
