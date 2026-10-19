import DirectionsIcon from "@mui/icons-material/Directions";
import DownloadIcon from "@mui/icons-material/Download";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { Button, Paper, Stack, Typography } from "@mui/material";

export type ToolPanel = "checkpoints" | "directions" | null;
type Props = { label: string; panel: ToolPanel; onPanel: (p: ToolPanel) => void; onCsv: () => void };

/** The long lists stay hidden until asked for; they open full width below the page. All actions follow the selected route. */
export default function RouteTools({ label, panel, onPanel, onCsv }: Props) {
  const toggle = (p: Exclude<ToolPanel, null>) => onPanel(panel === p ? null : p);
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h3" component="h2" mb={1}>Details for {label}</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant={panel === "checkpoints" ? "contained" : "outlined"} startIcon={<ListAltIcon />} onClick={() => toggle("checkpoints")} aria-expanded={panel === "checkpoints"}>View checkpoints</Button>
        <Button variant={panel === "directions" ? "contained" : "outlined"} startIcon={<DirectionsIcon />} onClick={() => toggle("directions")} aria-expanded={panel === "directions"}>View directions</Button>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onCsv}>Download CSV · {label}</Button>
      </Stack>
    </Paper>
  );
}
