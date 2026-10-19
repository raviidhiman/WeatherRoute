import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { METRIC_UNITS, US_UNITS, type UnitPrefs } from "../lib/units";

const same = (a: UnitPrefs, b: UnitPrefs) => (Object.keys(a) as (keyof UnitPrefs)[]).every((k) => a[k] === b[k]);

/** One-click US customary / Metric preset. Neither is selected when units were mixed individually. */
export default function UnitToggle({ value, onChange, dark = false }: { value: UnitPrefs; onChange: (u: UnitPrefs) => void; dark?: boolean }) {
  const current = same(value, US_UNITS) ? "us" : same(value, METRIC_UNITS) ? "metric" : null;
  const sx = dark ? { color: "#fff", borderColor: "#5E8A96", "&.Mui-selected": { bgcolor: "#fff", color: "primary.main", "&:hover": { bgcolor: "#fff" } } } : {};
  return (
    <ToggleButtonGroup exclusive size="small" value={current} aria-label="Unit system" onChange={(_, v) => v && onChange(v === "us" ? US_UNITS : METRIC_UNITS)}>
      <ToggleButton value="us" sx={{ ...sx, px: 1.25 }}>US</ToggleButton>
      <ToggleButton value="metric" sx={{ ...sx, px: 1.25 }}>Metric</ToggleButton>
    </ToggleButtonGroup>
  );
}
