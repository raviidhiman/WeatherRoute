import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { ApiError, explainAnalysis } from "../api";
import type { UnitPrefs } from "../lib/units";
import type { ExplainResponse } from "../types";

/** Rule-based briefing loads automatically; the optional AI explanation is requested on demand and is advisory only. */
export default function Advisor({ analysisId, units }: { analysisId: string; units: UnitPrefs }) {
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const u = { distance: units.distance, speed: units.speed, precip: units.precip, weight: units.weight };
  const key = `${analysisId}|${u.distance}|${u.speed}|${u.precip}|${u.weight}`;

  const load = (ai: boolean) => {
    ctl.current?.abort();
    const mine = (ctl.current = new AbortController());
    setBusy(true); setErr(null);
    explainAnalysis(analysisId, u, ai, mine.signal)
      .then((d) => { if (!mine.signal.aborted) setData(d); })
      .catch((e) => { if (!mine.signal.aborted) setErr(e instanceof ApiError ? e.message : "Could not load the briefing."); })
      .finally(() => { if (!mine.signal.aborted) setBusy(false); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); return () => ctl.current?.abort(); }, [key]);

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1} gap={1} flexWrap="wrap">
        <Typography variant="h3" component="h2">Route advisor</Typography>
        {data?.ai_enabled && <Button size="small" variant="outlined" startIcon={busy ? <CircularProgress size={14} /> : <AutoAwesomeIcon />} disabled={busy} onClick={() => load(true)}>Ask AI to reason</Button>}
      </Stack>
      {err && <Alert severity="warning">{err}</Alert>}
      {data && (
        <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>{data.advisor.map((t, i) => <Typography component="li" variant="body2" key={i}>{t}</Typography>)}</Stack>
      )}
      {data?.ai_text && (
        <Box sx={{ mt: 1.5, p: 1.25, borderLeft: 3, borderColor: "primary.main", bgcolor: "action.hover" }}>
          <Typography variant="caption" color="text.secondary" display="block">AI explanation (advisory only; the recommendation is rule-based)</Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{data.ai_text}</Typography>
        </Box>
      )}
      {data?.ai_error && <Alert severity="info" sx={{ mt: 1 }}>{data.ai_error === "ai_disabled" ? "AI reasoning is not configured on this server." : "The AI service did not respond. The rule-based summary above is still valid."}</Alert>}
      {data && !data.ai_enabled && <Typography variant="caption" color="text.secondary" display="block" mt={1}>AI reasoning is off. To enable it, set AI_BASE_URL, AI_MODEL and AI_API_KEY on the server.</Typography>}
      {!data && busy && <Typography variant="body2">Preparing briefing…</Typography>}
    </Paper>
  );
}
