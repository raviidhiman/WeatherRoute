import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { LEGEND_ROWS, RiskLabel } from "../lib/risk";
import { fromCanonical, UNIT_LABEL, type UnitPrefs } from "../lib/units";

const conv = (txt: string, factor: number, digits: number) =>
  txt.replace(/\d+(\.\d+)?/g, (m) => String(Math.round(Number(m) * factor * 10 ** digits) / 10 ** digits));

/** Thresholds shown in the user's units. Documentation only: the backend decides every classification. */
export default function RiskLegend({ units }: { units: UnitPrefs }) {
  const w = fromCanonical(1, units.speed), p = fromCanonical(1, units.precip), pd = units.precip === "in_per_hr" ? 2 : 1;
  return (
    <>
      <Table size="small">
        <TableHead><TableRow><TableCell>Level</TableCell><TableCell>Wind ({UNIT_LABEL[units.speed]})</TableCell><TableCell>Rain ({UNIT_LABEL[units.precip]})</TableCell><TableCell>Snow ({UNIT_LABEL[units.precip]})</TableCell></TableRow></TableHead>
        <TableBody>
          {LEGEND_ROWS.map((r) => (
            <TableRow key={r.level}>
              <TableCell><RiskLabel level={r.level} /></TableCell>
              <TableCell>{conv(r.wind.replace(" mph", ""), w, 0)}</TableCell>
              <TableCell>{conv(r.rain, p, pd)}</TableCell>
              <TableCell>{conv(r.snow, p, pd)}</TableCell>
            </TableRow>
          ))}
          <TableRow><TableCell><RiskLabel level={-1} /></TableCell><TableCell colSpan={3}>Forecast missing or out of range. Never treated as Low.</TableCell></TableRow>
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
        Heavy loads raise wind risk: above 40,000 lb, 35–44 mph is Severe; above 30,000 lb, 45–54 mph is No Travel. Map heat shows the worst level near each checkpoint.
      </Typography>
    </>
  );
}
