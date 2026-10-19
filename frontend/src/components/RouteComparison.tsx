import { Alert, AlertTitle, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/CheckCircle";
import { memo } from "react";
import { eligibilityText, reasonText } from "../lib/reasons";
import { RISK } from "../lib/risk";
import { ROUTE_COLORS } from "../lib/mapData";
import { formatDateTime, formatDistance, formatDuration, type UnitPrefs } from "../lib/units";
import type { Analysis, Route } from "../types";

/** One strip per route: each checkpoint segment drawn with width proportional to its real miles. */
const Ribbon = memo(function Ribbon({ route }: { route: Route }) {
  const total = route.distance_mi || 1;
  return (
    <Box role="img" aria-label={`${route.label} risk along the route: ${route.severe_miles.toFixed(0)} severe and ${route.high_miles.toFixed(0)} high-risk miles`}
      sx={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", bgcolor: "divider" }}>
      {route.checkpoints.map((c) => c.segment_mi > 0 && (
        <Box key={c.index} sx={{ flexBasis: `${(c.segment_mi / total) * 100}%`, bgcolor: c.risk === null ? undefined : RISK[c.risk].color,
          backgroundImage: c.risk === null ? "repeating-linear-gradient(45deg,#8A979D 0 3px,transparent 3px 6px)" : undefined,
          opacity: c.risk === 0 ? 0.55 : 1 }} />
      ))}
    </Box>
  );
});

type Props = { analysis: Analysis; selectedId: string | null; onSelect: (id: string) => void; units: UnitPrefs };

export default function RouteComparison({ analysis, selectedId, onSelect, units }: Props) {
  const { routes, recommendation: rec, timezone: tz } = analysis;
  const fastest = routes.reduce((a, b) => (b.duration_s < a.duration_s ? b : a), routes[0]).id;
  const shortest = routes.reduce((a, b) => (b.distance_mi < a.distance_mi ? b : a), routes[0]).id;
  const severity = rec.level === "recommended" ? "success" : rec.level === "provisional" ? "warning" : "error";
  const title = rec.level === "recommended" ? `Recommended: ${routes.find((r) => r.id === rec.route_id)?.label}`
    : rec.level === "provisional" ? `Provisional pick: ${routes.find((r) => r.id === rec.route_id)?.label} (not verified)` : "No eligible route";
  return (
    <Stack spacing={2}>
      <Alert severity={severity} role="status">
        <AlertTitle>{title}</AlertTitle>
        <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
          {rec.reasons.map((r, i) => <li key={i}>{reasonText(r, routes, rec.route_id, units)}</li>)}
        </Stack>
      </Alert>
      {analysis.warnings.map((w) => <Alert key={w} severity="info" variant="outlined">{w}</Alert>)}
      <Stack spacing={1.5} role="radiogroup" aria-label="Routes">
        {routes.map((r, i) => {
          const picked = r.id === selectedId;
          return (
            <Paper key={r.id} component="button" role="radio" aria-checked={picked} onClick={() => onSelect(r.id)}
              sx={{ p: 1.5, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", width: "100%",
                borderColor: picked ? ROUTE_COLORS[i % 3] : undefined, borderWidth: picked ? 2 : 1, bgcolor: picked ? "action.hover" : "background.paper",
                "&:focus-visible": { outline: "3px solid #0B6BCB", outlineOffset: 2 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} gap={1} flexWrap="wrap">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: ROUTE_COLORS[i % 3] }} aria-hidden />
                  <Typography variant="h3" component="span">{r.label}</Typography>
                  {routes.length > 1 && r.id === fastest && <Chip size="small" variant="outlined" label="Fastest" />}
                  {routes.length > 1 && r.id === shortest && <Chip size="small" variant="outlined" label="Shortest" />}
                  {r.id === rec.route_id && <Chip size="small" color={rec.level === "recommended" ? "success" : "warning"} icon={<CheckIcon />} label={rec.level === "recommended" ? "Recommended" : "Provisional"} />}
                </Stack>
                <Chip size="small" variant="outlined" label={eligibilityText[r.eligibility]} />
              </Stack>
              <Ribbon route={r} />
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 1, mt: 1.25 }}>
                <Stat k="Distance" v={formatDistance(r.distance_mi, units)} />
                <Stat k={r.rest_stops > 0 ? `Trip time (+${r.rest_stops} rest)` : "Travel time"} v={formatDuration(r.trip_s)} />
                <Stat k="Arrival" v={formatDateTime(r.eta, tz)} />
                <Stat k="Severe road" v={formatDistance(r.severe_miles, units)} />
                <Stat k="High road" v={formatDistance(r.high_miles, units)} />
                <Stat k="Average risk" v={r.average_risk === null ? "n/a" : `${r.average_risk.toFixed(2)} / 4`} />
              </Box>
              {r.unresolved_checkpoints > 0 && <Typography variant="body2" color="text.secondary" mt={1}>Weather unknown at {r.unresolved_checkpoints} checkpoint(s) ({formatDistance(r.unknown_miles, units)}).</Typography>}
              {r.eta_method === "proportional" && <Typography variant="caption" color="text.secondary">Arrival time is approximate.</Typography>}
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
}

const Stat = ({ k, v }: { k: string; v: string }) => (
  <Box><Typography variant="caption" color="text.secondary" display="block">{k}</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{v}</Typography></Box>
);
