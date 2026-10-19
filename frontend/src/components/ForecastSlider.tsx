import { FormControlLabel, Paper, Slider, Stack, Switch, Typography, useTheme } from "@mui/material";
import { useDeferredValue, useMemo } from "react";
import { riskAt } from "../lib/mapData";
import { metaOf, riskColor } from "../lib/risk";
import { formatDateTime } from "../lib/units";
import type { Level, Route } from "../types";

type Props = { departureUtc: string; tz: string; routes: Route[]; selectedId: string | null; hour: number; follow: boolean; onHour: (h: number) => void; onFollow: (f: boolean) => void };

/** Slider reference time = departure. Hour h shows the provider's forecast for departure + h hours at every checkpoint. */
export default function ForecastSlider({ departureUtc, tz, routes, selectedId, hour, follow, onHour, onFollow }: Props) {
  const deferred = useDeferredValue(hour);
  const dark = useTheme().palette.mode === "dark";
  const at = new Date(new Date(departureUtc).getTime() + hour * 3600_000).toISOString();
  const counts = useMemo(() => {
    const route = routes.find((r) => r.id === selectedId) ?? routes[0];
    const c = new Map<Level | -1, number>();
    for (const cp of route?.checkpoints ?? []) { const k = riskAt(cp, follow ? null : deferred); c.set(k, (c.get(k) ?? 0) + 1); }
    return [...c.entries()].sort((a, b) => b[0] - a[0]);
  }, [routes, selectedId, follow, deferred]);

  return (
    <Paper square sx={{ px: 1.5, pt: 0.75, pb: 1, borderWidth: "1px 0 0 0", flex: "none" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h3" component="h2">Weather forecast</Typography>
        <FormControlLabel label="Use each checkpoint's arrival time" control={<Switch checked={follow} onChange={(e) => onFollow(e.target.checked)} />} />
      </Stack>
      <Slider size="small" min={0} max={48} step={1} value={hour} disabled={follow} onChange={(_, v) => onHour(v as number)} aria-label="Forecast hour after departure"
        marks={[0, 12, 24, 36, 48].map((v) => ({ value: v, label: `+${v} h` }))} valueLabelDisplay="auto" valueLabelFormat={(v) => `+${v} h`} sx={{ mx: 1, width: "calc(100% - 16px)", mt: 0, mb: 3.5, py: 1 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" columnGap={2} rowGap={0.5}>
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          {follow ? "Showing conditions at the estimated arrival time of each checkpoint." : `Forecast for ${formatDateTime(at, tz)} (+${hour} h after departure).`}
        </Typography>
        <Stack direction="row" gap={1.5} flexWrap="wrap">
          {counts.map(([k, n]) => { const m = metaOf(k); return (
            <Stack key={k} direction="row" spacing={0.5} alignItems="center" sx={{ color: riskColor(m, dark) }}>
              <m.Icon sx={{ fontSize: 16 }} aria-hidden /><Typography variant="body2" sx={{ color: "inherit", fontWeight: 600 }}>{n} {m.label}</Typography>
            </Stack>); })}
        </Stack>
      </Stack>
    </Paper>
  );
}
