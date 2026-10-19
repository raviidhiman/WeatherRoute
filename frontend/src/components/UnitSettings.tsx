import { Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { METRIC_UNITS, US_UNITS, type UnitPrefs } from "../lib/units";

type Row = { key: keyof UnitPrefs; label: string; options: [string, string][] };
const ROWS: Row[] = [
  { key: "distance", label: "Distance", options: [["mi", "mi"], ["km", "km"]] },
  { key: "speed", label: "Speed", options: [["mph", "mph"], ["kmh", "km/h"]] },
  { key: "temperature", label: "Temperature", options: [["F", "°F"], ["C", "°C"]] },
  { key: "weight", label: "Weight", options: [["lb", "lb"], ["kg", "kg"]] },
  { key: "precip", label: "Precipitation", options: [["in_per_hr", "in/hr"], ["mm_per_hr", "mm/hr"]] },
];

export default function UnitSettings({ value, onChange }: { value: UnitPrefs; onChange: (v: UnitPrefs) => void }) {
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={() => onChange(US_UNITS)}>US customary</Button>
        <Button size="small" variant="outlined" onClick={() => onChange(METRIC_UNITS)}>Metric</Button>
      </Stack>
      {ROWS.map((r) => (
        <Stack key={r.key} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="body2" id={`u-${r.key}`}>{r.label}</Typography>
          <ToggleButtonGroup exclusive size="small" value={value[r.key]} aria-labelledby={`u-${r.key}`}
            onChange={(_, v) => v && onChange({ ...value, [r.key]: v })}>
            {r.options.map(([v, l]) => <ToggleButton key={v} value={v} sx={{ px: 1.5, minWidth: 64 }}>{l}</ToggleButton>)}
          </ToggleButtonGroup>
        </Stack>
      ))}
    </Stack>
  );
}
