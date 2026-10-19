import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Container, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeRoutes, ApiError } from "./api";
import Advisor from "./components/Advisor";
import CheckpointTable from "./components/CheckpointTable";
import DepartureOptions from "./components/DepartureOptions";
import DirectionsTable from "./components/DirectionsTable";
import MapPanel from "./components/MapPanel";
import NavBar from "./components/NavBar";
import RecentTrips from "./components/RecentTrips";
import RouteComparison from "./components/RouteComparison";
import RouteForm from "./components/RouteForm";
import RouteTools, { type ToolPanel } from "./components/RouteTools";
import WeatherBrief from "./components/WeatherBrief";
import { useCurrentWeather } from "./hooks/useCurrentWeather";
import { useLiveLocation } from "./hooks/useLiveLocation";
import { downloadText, routeToCsv } from "./lib/export";
import { shortLabel, type PinTarget } from "./lib/pin";
import { cumulativeMi, navInfo } from "./lib/geo";
import { clearRecent, loadRecent, saveRecent, type RecentTrip } from "./lib/recent";
import { formatDistance, formatWeight, UNIT_LABEL, US_UNITS, type UnitPrefs } from "./lib/units";
import type { Mode } from "./theme";
import type { Analysis, AnalyzeRequest, DepartureOption, Location } from "./types";

type Prefill = { origin?: Location; destination?: Location; departure_local?: string; n: number };
const LIVE_NOTE = { asking: "Waiting for location permission…", denied: "Location permission was denied. Allow it in the browser address bar.", unavailable: "Location is unavailable on this device or connection." } as const;

export default function App({ mode = "light", onToggleMode = () => {} }: { mode?: Mode; onToggleMode?: () => void }) {
  const [units, setUnits] = useState<UnitPrefs>(US_UNITS);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hour, setHour] = useState(0);
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [panel, setPanel] = useState<ToolPanel>(null);
  const [trip, setTrip] = useState<AnalyzeRequest | null>(null);
  const [recent, setRecent] = useState<RecentTrip[]>(loadRecent);
  const [prefill, setPrefill] = useState<Prefill | undefined>();
  const [pickTarget, setPickTarget] = useState<PinTarget | null>(null);
  const [points, setPoints] = useState<{ origin: Location | null; destination: Location | null }>({ origin: null, destination: null });
  const navRef = useRef<HTMLDivElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const live = useLiveLocation();
  const liveWx = useCurrentWeather(live.pos, analysis?.load_lb ?? 0);

  useEffect(() => {  // lets the dashboard panels fit exactly under the header, whatever its height
    const el = navRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--nav-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setPoint = (t: PinTarget, loc: Location) => { setPrefill({ [t]: loc, n: Date.now() }); setExpanded(true); };
  const dropPin = (loc: Location) => { if (pickTarget) setPoint(pickTarget, loc); setPickTarget(null); };

  useEffect(() => () => ctl.current?.abort(), []); // leaving the page cancels any request in flight

  const run = useCallback(async (req: AnalyzeRequest) => {
    ctl.current?.abort(); // an older response can never overwrite a newer one
    const mine = (ctl.current = new AbortController());
    setBusy(true); setError(null);
    try {
      const res = await analyzeRoutes(req, mine.signal);
      if (mine.signal.aborted) return;
      setAnalysis(res); setTrip(req); setPicked(null); setHour(0); setFollow(true); setPanel(null);
      setExpanded(false); // results are in: shrink the form to a one-line summary
      setRecent(saveRecent({ origin: req.origin, destination: req.destination }));
    } catch (e) {
      if (mine.signal.aborted) return;
      setAnalysis(null); setExpanded(true);
      setError(e instanceof ApiError ? e : new ApiError("error", "Something went wrong. Try again."));
    } finally {
      if (!mine.signal.aborted) setBusy(false);
    }
  }, []);

  const routes = analysis?.routes ?? [];
  const selectedId = picked ?? analysis?.recommendation.route_id ?? routes[0]?.id ?? null; // derived, not stored
  const selected = routes.find((r) => r.id === selectedId) ?? null;
  const cum = useMemo(() => (selected ? cumulativeMi(selected.geometry) : []), [selected]);
  const nav = selected && live.pos ? navInfo(selected, cum, live.pos) : null;

  useEffect(() => {
    if (!panel) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [panel]);

  const direction = !selected
    ? live.state === "on" ? "Live location on. Compare routes to get directions." : "Directions appear here after you compare routes."
    : nav?.offRoute ? `Off route. Head back to ${selected.label}.`
    : nav?.next ? `${nav.next.text} in ${formatDistance(nav.toNextMi, units)} · ${formatDistance(nav.remainingMi, units)} to go`
    : nav ? `Arrive at your destination · ${formatDistance(nav.remainingMi, units)} to go`
    : `${selected.label}: ${selected.directions[0]?.text ?? "route ready"} · ${formatDistance(selected.distance_mi, units)}`;

  const first = selected?.checkpoints[0];
  const weather = live.state === "on" || live.state === "asking"
    ? liveWx.data ? <WeatherBrief source="Here" temp={liveWx.data.temp_f} wind={liveWx.data.wind_mph} rain={liveWx.data.rain_in_hr} risk={liveWx.data.risk} units={units} />
      : <Typography variant="body2" noWrap>{liveWx.failed ? "Weather unavailable at your location" : "Loading weather at your location…"}</Typography>
    : first ? <WeatherBrief source="At start" temp={first.temp_f} wind={first.wind_mph} rain={first.rain_in_hr} risk={first.risk} units={units} />
    : <Typography variant="body2" noWrap>Weather appears here. Turn on live location for your position.</Typography>;

  const useDeparture = (o: DepartureOption) => {
    if (!trip) return;
    setPrefill({ departure_local: o.depart_local, n: Date.now() });
    run({ ...trip, departure_local: o.depart_local });
  };
  const csv = () => selected && analysis && downloadText(`weatherroute-${selected.label.replace(" ", "-").toLowerCase()}.csv`, routeToCsv(selected, units, analysis.timezone));
  const liveNote = live.state === "off" || live.state === "on" ? null : LIVE_NOTE[live.state];

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: { md: "flex" }, flexDirection: "column", height: { md: "100dvh" }, overflow: { md: "hidden" } }}>
      <Box ref={navRef} sx={{ flex: "none" }}><NavBar units={units} onUnits={setUnits} direction={direction} weather={weather} liveOn={live.state === "on" || live.state === "asking"} liveNote={liveNote} onToggleLive={live.toggle} mode={mode} onToggleMode={onToggleMode} /></Box>

      <Container maxWidth={false} component="main" sx={{ py: 2, flex: { md: "1 1 auto" }, minHeight: { md: 0 }, overflowY: { md: "auto" } }}>
        <Box sx={{
          display: "grid", gap: 2, alignItems: "start",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(380px, 460px) minmax(0, 1fr)" },
          gridTemplateAreas: { xs: '"trip" "alerts" "map" "results"', md: '"left map"' },
        }}>
          {/* Phones: these children join the grid directly. Desktop: one column that scrolls on its own, so the map never leaves the screen. */}
          <Box sx={{ gridArea: { md: "left" }, display: { xs: "contents", md: "flex" }, flexDirection: "column", gap: 2, minWidth: 0, maxHeight: { md: "calc(100dvh - var(--nav-h, 76px) - 32px)" }, overflowY: { md: "auto" }, pr: { md: 0.5 } }}>
          <Stack spacing={2} sx={{ gridArea: "trip" }}>
            <Accordion expanded={expanded} onChange={(_, v) => setExpanded(v)} disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 1, "&:before": { display: "none" } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-label="Trip details, expand or collapse">
                <Stack minWidth={0}>
                  <Typography variant="h2">Trip</Typography>
                  {!expanded && trip && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {shortLabel(trip.origin.label)} → {shortLabel(trip.destination.label)} · {formatWeight(analysis?.load_lb ?? 0, units)} · every {Math.round(trip.checkpoint_interval * (units.distance === "km" ? 1.609344 : 1))} {UNIT_LABEL[units.distance]}
                    </Typography>
                  )}
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}><RouteForm units={units} busy={busy} serverError={error} onSubmit={run} prefill={prefill} pickTarget={pickTarget} onPickTarget={(t) => { setPickTarget(t); if (t) setExpanded(true); }} onPoints={setPoints} /></AccordionDetails>
            </Accordion>
            {recent.length > 0 && <Paper sx={{ p: 2 }}><RecentTrips trips={recent} onPick={(t) => { setPrefill({ ...t, n: Date.now() }); setExpanded(true); }} onClear={() => { clearRecent(); setRecent([]); }} /></Paper>}
          </Stack>

          <Stack spacing={2} sx={{ gridArea: "alerts" }} aria-live="polite">
            {busy && <Box><LinearProgress /><Typography variant="body2" mt={0.5}>Finding routes and checking weather along each one…</Typography></Box>}
            {error && !Object.keys(error.fields).length && (
              <Alert severity="error">{error.message}{error.requestId && <Typography variant="caption" display="block">Reference: {error.requestId}</Typography>}</Alert>
            )}
            {!busy && analysis?.status === "partial" && (
              <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => trip && run(trip)}>Retry weather</Button>}>
                Some weather data could not be loaded, so those checkpoints show as Unknown (never as safe). Retrying only fetches what is missing.
              </Alert>
            )}
            {!busy && !analysis && !error && <Alert severity="info" variant="outlined">Enter origin, destination, departure and cargo weight. WeatherRoute checks the forecast at each checkpoint when your truck is expected to be there.</Alert>}
          </Stack>

          {analysis && selected && (
            <Stack spacing={2} sx={{ gridArea: "results", minWidth: 0 }}>
              <RouteComparison analysis={analysis} selectedId={selectedId} onSelect={setPicked} units={units} />
              <RouteTools label={selected.label} panel={panel} onPanel={setPanel} onCsv={csv} />
              <DepartureOptions analysis={analysis} units={units} onUse={useDeparture} />
              <Advisor analysisId={analysis.analysis_id} units={units} />
            </Stack>
          )}
          </Box>
          <Box sx={{ gridArea: "map", minWidth: 0 }}>
            <MapPanel analysis={analysis} route={selected} selectedId={selectedId} hour={hour} follow={follow} onHour={setHour} onFollow={setFollow} onSelect={setPicked}
              units={units} onUnits={setUnits} origin={trip?.origin.label} destination={trip?.destination.label} live={live}
              pins={points} pickTarget={pickTarget} onPickPoint={dropPin} onCancelPick={() => setPickTarget(null)} onPinMove={setPoint} />
          </Box>

        </Box>

        {analysis && selected && panel && (
          <Box ref={panelRef} sx={{ mt: 3, scrollMarginTop: 12 }}>
            {panel === "checkpoints" ? <CheckpointTable route={selected} units={units} tz={analysis.timezone} /> : <DirectionsTable route={selected} units={units} />}
          </Box>
        )}
      </Container>
    </Box>
  );
}
