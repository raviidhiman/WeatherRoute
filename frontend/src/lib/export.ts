import type { Route } from "../types";
import { fromCanonical, fToC, UNIT_LABEL, type UnitPrefs } from "./units";
import { metaOf } from "./risk";

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const r = (v: number | null, d: number) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** CSV of one route's checkpoints in the user's display units (full precision is kept server-side). */
export function routeToCsv(route: Route, u: UnitPrefs, tz: string): string {
  const head = [`Mile (${UNIT_LABEL[u.distance]})`, `Arrival (${tz})`, `Wind (${UNIT_LABEL[u.speed]})`, `Rain (${UNIT_LABEL[u.precip]})`,
    `Snow (${UNIT_LABEL[u.precip]})`, `Temp (${UNIT_LABEL[u.temperature]})`, "Risk", "Data complete"];
  const rows = route.checkpoints.map((c) => [
    r(fromCanonical(c.distance_mi, u.distance), 1), c.eta,
    r(c.wind_mph === null ? null : fromCanonical(c.wind_mph, u.speed), 1),
    r(c.rain_in_hr === null ? null : fromCanonical(c.rain_in_hr, u.precip), 3),
    r(c.snow_in_hr === null ? null : fromCanonical(c.snow_in_hr, u.precip), 3),
    r(c.temp_f === null ? null : u.temperature === "F" ? c.temp_f : fToC(c.temp_f), 1),
    metaOf(c.risk).label, c.resolved ? "yes" : "no",
  ]);
  return [head, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
