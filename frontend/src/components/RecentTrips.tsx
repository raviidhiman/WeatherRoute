import { shortLabel } from "../lib/pin";
import { Button, Chip, Stack, Typography } from "@mui/material";
import type { RecentTrip } from "../lib/recent";

export default function RecentTrips({ trips, onPick, onClear }: { trips: RecentTrip[]; onPick: (t: RecentTrip) => void; onClear: () => void }) {
  if (!trips.length) return null;
  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h3" component="h2">Recent trips</Typography>
        <Button size="small" onClick={onClear}>Clear</Button>
      </Stack>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {trips.map((t, i) => <Chip key={i} variant="outlined" onClick={() => onPick(t)} label={`${shortLabel(t.origin.label)} → ${shortLabel(t.destination.label)}`} />)}
      </Stack>
      <Typography variant="caption" color="text.secondary">Saved only in this browser.</Typography>
    </Stack>
  );
}
