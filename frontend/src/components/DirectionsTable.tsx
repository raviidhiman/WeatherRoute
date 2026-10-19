import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { formatDistance, type UnitPrefs } from "../lib/units";
import type { Route } from "../types";

export default function DirectionsTable({ route, units }: { route: Route; units: UnitPrefs }) {
  return (
    <Paper>
      <Typography variant="h3" component="h2" sx={{ p: 1.5 }}>{route.label} directions</Typography>
      {route.directions.length === 0 ? <Typography sx={{ p: 2 }} color="text.secondary">The routing provider returned no turn-by-turn steps for this route.</Typography> : (
        <TableContainer sx={{ maxHeight: 520 }} tabIndex={0} aria-label={`${route.label} turn-by-turn directions`}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow><TableCell>#</TableCell><TableCell>Instruction</TableCell><TableCell>At</TableCell><TableCell>Then for</TableCell></TableRow></TableHead>
            <TableBody>
              {route.directions.map((d, i) => (
                <TableRow key={i}><TableCell>{i + 1}</TableCell><TableCell>{d.text}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{formatDistance(d.start_mi, units)}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{formatDistance(d.distance_mi, units)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
