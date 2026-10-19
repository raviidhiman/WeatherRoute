import { shortLabel } from "../lib/pin";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { formatDuration, fromCanonical, fToC, UNIT_LABEL, type UnitPrefs } from "../lib/units";
import type { Route } from "../types";
import UnitToggle from "./UnitToggle";

type Props = { origin?: string; destination?: string; route: Route | null; loadLb: number | null; units: UnitPrefs; onUnits: (u: UnitPrefs) => void };

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d });

function Stat({ k, v, hint, onClick }: { k: string; v: string; hint: string; onClick: () => void }) {
  return (
    <ButtonBase onClick={onClick} aria-label={`${k}: ${v}. ${hint}`} title={hint}
      sx={{ gap: 0.75, alignItems: "baseline", px: 1, py: 0.25, borderRadius: 1, border: 1, borderColor: "divider", bgcolor: "action.hover", textAlign: "left", whiteSpace: "nowrap",
        "&:hover": { bgcolor: "action.selected" }, "&:focus-visible": { outline: "3px solid #0B6BCB" } }}>
      <Typography variant="caption" color="text.secondary">{k}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{v}</Typography>
    </ButtonBase>
  );
}

/** Trip summary strip above the map. Every value switches its own unit when clicked. */
export default function TripRibbon({ origin, destination, route, loadLb, units, onUnits }: Props) {
  const set = (patch: Partial<UnitPrefs>) => onUnits({ ...units, ...patch });
  const stats = route && [
    { k: "Distance", v: `${fmt(fromCanonical(route.distance_mi, units.distance), 1)} ${UNIT_LABEL[units.distance]}`, hint: `Switch to ${units.distance === "mi" ? "km" : "mi"}`, fn: () => set({ distance: units.distance === "mi" ? "km" : "mi" }) },
    { k: "Avg speed", v: `${fmt(fromCanonical(route.distance_mi / (route.duration_s / 3600), units.speed))} ${UNIT_LABEL[units.speed]}`, hint: `Switch to ${units.speed === "mph" ? "km/h" : "mph"}`, fn: () => set({ speed: units.speed === "mph" ? "kmh" : "mph" }) },
    (() => {
      const t = nums(route.checkpoints.map((c) => c.temp_f));
      const f = (x: number) => fmt(units.temperature === "F" ? x : fToC(x));
      return { k: "Temperature", v: t.length ? `${f(Math.min(...t))}–${f(Math.max(...t))} ${UNIT_LABEL[units.temperature]}` : "n/a", hint: `Switch to °${units.temperature === "F" ? "C" : "F"}`, fn: () => set({ temperature: units.temperature === "F" ? "C" : "F" }) };
    })(),
    { k: "Cargo", v: loadLb === null ? "n/a" : `${fmt(fromCanonical(loadLb, units.weight))} ${UNIT_LABEL[units.weight]}`, hint: `Switch to ${units.weight === "lb" ? "kg" : "lb"}`, fn: () => set({ weight: units.weight === "lb" ? "kg" : "lb" }) },
    (() => {
      const rain = nums(route.checkpoints.map((c) => c.rain_in_hr)), snow = nums(route.checkpoints.map((c) => c.snow_in_hr));
      const f = (xs: number[]) => (xs.length ? fmt(fromCanonical(Math.max(...xs), units.precip), units.precip === "in_per_hr" ? 2 : 1) : "n/a");
      return { k: "Precip (max)", v: `rain ${f(rain)} · snow ${f(snow)} ${UNIT_LABEL[units.precip]}`, hint: `Switch to ${units.precip === "in_per_hr" ? "mm/hr" : "in/hr"}`, fn: () => set({ precip: units.precip === "in_per_hr" ? "mm_per_hr" : "in_per_hr" }) };
    })(),
  ];
  return (
    <Box sx={{ px: 1.25, py: 0.75, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
          {origin && destination ? (
            <>
              <Typography variant="h3" component="p" noWrap sx={{ maxWidth: { xs: 110, sm: 200 } }}>{shortLabel(origin)}</Typography>
              <ArrowForwardIcon fontSize="small" aria-label="to" />
              <Typography variant="h3" component="p" noWrap sx={{ maxWidth: { xs: 110, sm: 200 } }}>{shortLabel(destination)}</Typography>
              {route && <Typography variant="body2" color="text.secondary" noWrap>· {route.label} · {formatDuration(route.trip_s)}</Typography>}
            </>
          ) : <Typography variant="body2" color="text.secondary">Compare routes to see the trip summary.</Typography>}
        </Stack>
        <Box sx={{ flex: "none", "& .MuiToggleButton-root": { py: 0.125, fontSize: 12 } }}><UnitToggle value={units} onChange={onUnits} /></Box>
      </Stack>
      {stats && <Stack direction="row" gap={0.75} flexWrap="wrap" mt={0.75}>{stats.map((s) => <Stat key={s.k} k={s.k} v={s.v} hint={s.hint} onClick={s.fn} />)}</Stack>}
    </Box>
  );
}
