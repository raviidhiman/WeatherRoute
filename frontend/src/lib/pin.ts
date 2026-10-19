import type { Location } from "../types";

export type PinTarget = "origin" | "destination";

/** A location made from raw coordinates (dropped pin, device position). The server still validates US coverage. */
export const coordLocation = (kind: "Dropped pin" | "My location", lat: number, lon: number): Location => ({
  label: `${kind} (${lat.toFixed(4)}, ${lon.toFixed(4)})`, lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)),
});

/** Short name for tight spaces: "Denver, Colorado" -> "Denver"; "Dropped pin (39.7, -104.9)" -> "Dropped pin". */
export const shortLabel = (label: string): string => label.replace(/\s*\(.*$/, "").split(",")[0].trim() || label;
