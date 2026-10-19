import { Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { formatDateTime, formatDistance, type UnitPrefs } from "../lib/units";
import type { Analysis, DepartureOption } from "../types";

/** Re-evaluates the same trip for later departures using the weather already fetched (no extra provider calls). */
export default function DepartureOptions({ analysis, units, onUse }: { analysis: Analysis; units: UnitPrefs; onUse: (o: DepartureOption) => void }) {
  const label = (id: string | null) => analysis.routes.find((r) => r.id === id)?.label ?? "None";
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h3" component="h2">Best time to leave</Typography>
      <Typography variant="body2" color="text.secondary" mb={1}>Same trip, later departures. Shows the best route for each start time.</Typography>
      <div style={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Leave</TableCell><TableCell>Route</TableCell><TableCell>Severe</TableCell><TableCell>High</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {analysis.departure_options.map((o) => (
              <TableRow key={o.offset_h} selected={o.best}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{o.offset_h === 0 ? "Chosen time" : `+${o.offset_h} h`}<Typography variant="caption" display="block" color="text.secondary">{formatDateTime(o.depart_utc, analysis.timezone)}</Typography></TableCell>
                <TableCell>{label(o.route_id)}{o.level === "provisional" && <Typography variant="caption" display="block" color="warning.main">unverified</Typography>}</TableCell>
                <TableCell>{o.severe_miles === null ? "n/a" : formatDistance(o.severe_miles, units)}</TableCell>
                <TableCell>{o.high_miles === null ? "n/a" : formatDistance(o.high_miles, units)}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" gap={1} justifyContent="flex-end" alignItems="center">
                    {o.best && <Chip size="small" color="success" label="Best" />}
                    {o.offset_h > 0 && <Button size="small" onClick={() => onUse(o)}>Use</Button>}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Paper>
  );
}
