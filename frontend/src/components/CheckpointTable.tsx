import DownloadIcon from "@mui/icons-material/Download";
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { memo } from "react";
import { downloadText, routeToCsv } from "../lib/export";
import { metaOf, RiskLabel, riskColor } from "../lib/risk";
import { formatDateTime, formatDistance, formatPrecip, formatSpeed, formatTemp, type UnitPrefs } from "../lib/units";
import type { Checkpoint, Level, Route } from "../types";

const Hazard = ({ text, level }: { text: string; level: Level | null }) => {
  const m = metaOf(level);
  return <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: (t) => riskColor(m, t.palette.mode === "dark"), whiteSpace: "nowrap" }} title={`${m.label}`}>
    <m.Icon sx={{ fontSize: 15 }} aria-hidden /><span>{text}</span><Box component="span" sx={{ position: "absolute", left: -9999 }}>{m.label}</Box>
  </Box>;
};

const Row = memo(function Row({ c, u, tz }: { c: Checkpoint; u: UnitPrefs; tz: string }) {
  return (
    <TableRow sx={{ contentVisibility: "auto" }}>
      <TableCell>{formatDistance(c.distance_mi, u)}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(c.eta, tz)}</TableCell>
      <TableCell><Hazard text={formatSpeed(c.wind_mph, u)} level={c.hazards.wind} /></TableCell>
      <TableCell><Hazard text={formatPrecip(c.rain_in_hr, u)} level={c.hazards.rain} /></TableCell>
      <TableCell><Hazard text={formatPrecip(c.snow_in_hr, u)} level={c.hazards.snow} /></TableCell>
      <TableCell>{formatTemp(c.temp_f, u)}</TableCell>
      <TableCell><RiskLabel level={c.risk} />{!c.resolved && <Typography variant="caption" color="text.secondary">data incomplete</Typography>}</TableCell>
    </TableRow>
  );
});

export default function CheckpointTable({ route, units, tz }: { route: Route; units: UnitPrefs; tz: string }) {
  const { checkpoints, label } = route;
  return (
    <Paper>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5 }}>
        <Typography variant="h3" component="h2">{label} checkpoints</Typography>
        <Button size="small" startIcon={<DownloadIcon />} onClick={() => downloadText(`weatherroute-${label.replace(" ", "-").toLowerCase()}.csv`, routeToCsv(route, units, tz))}>Download CSV</Button>
      </Stack>
      <TableContainer sx={{ maxHeight: 420 }} tabIndex={0} aria-label={`${label} checkpoint weather`}>
        <Table size="small" stickyHeader>
          <TableHead><TableRow>
            {["Mile", "Arrival", "Wind", "Rain", "Snow", "Temp", "Risk"].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>{checkpoints.map((c) => <Row key={c.index} c={c} u={units} tz={tz} />)}</TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
