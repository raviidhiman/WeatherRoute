import { Chip, Stack, Typography } from "@mui/material";
import { metaOf } from "../lib/risk";
import { formatPrecip, formatSpeed, formatTemp, type UnitPrefs } from "../lib/units";
import type { Level } from "../types";

type Props = { source: string; temp: number | null; wind: number | null; rain: number | null; risk: Level | null; units: UnitPrefs };

/** One-line weather summary for the dark top bar; risk is a white chip with icon + label (never color alone). */
export default function WeatherBrief({ source, temp, wind, rain, risk, units }: Props) {
  const m = metaOf(risk);
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
      <Typography variant="body2" noWrap title={`${source}: ${formatTemp(temp, units)}, wind ${formatSpeed(wind, units)}, rain ${formatPrecip(rain, units)}`}>
        {source}: {formatTemp(temp, units)} · wind {formatSpeed(wind, units)} · rain {formatPrecip(rain, units)}
      </Typography>
      <Chip size="small" icon={<m.Icon />} label={m.label} sx={{ bgcolor: "#fff", color: m.color, fontWeight: 700, "& .MuiChip-icon": { color: m.color } }} />
    </Stack>
  );
}
