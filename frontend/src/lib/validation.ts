import { z } from "zod";

export const US_ZONES = [
  ["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"], ["America/Los_Angeles", "Pacific"],
] as const;
export const INTERVALS = [10, 25, 50] as const;

// Display-side bounds only; the backend re-validates everything.
const inUS = (lat: number, lon: number) => lat >= 24 && lat <= 49.5 && lon >= -125 && lon <= -66.5;

const location = z
  .object({ label: z.string().min(1).max(120), lat: z.number(), lon: z.number() })
  .nullable()
  .refine((v) => v !== null && inUS(v.lat, v.lon), { message: "Choose a US location from the suggestions." });

export const makeSchema = (weightUnit: "lb" | "kg") =>
  z
    .object({
      origin: location,
      destination: location,
      departure_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a departure date and time."),
      timezone: z.enum(US_ZONES.map((z) => z[0]) as [string, ...string[]]),
      load_weight: z.string().refine((s) => {
        const n = Number(s);
        const lb = weightUnit === "lb" ? n : n / 0.45359237;
        return s.trim() !== "" && Number.isFinite(n) && lb >= 1 && lb <= 200000;
      }, `Enter a weight from 1 to 200,000 lb (${weightUnit === "kg" ? "about 90,718 kg" : "or the kg equivalent"}).`),
      checkpoint_interval: z.union([z.literal(10), z.literal(25), z.literal(50)]),
      hos: z.boolean(),
    })
    .refine((v) => !(v.origin && v.destination && v.origin.lat === v.destination.lat && v.origin.lon === v.destination.lon), {
      message: "Destination must differ from the origin.", path: ["destination"],
    });

export type FormValues = z.infer<ReturnType<typeof makeSchema>>;
