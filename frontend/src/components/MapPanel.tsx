import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import LayersIcon from "@mui/icons-material/Layers";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import UmbrellaIcon from "@mui/icons-material/BeachAccess";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Paper, ToggleButton, Tooltip } from "@mui/material";
import { lazy, Suspense, useEffect, useState } from "react";
import type { LivePos, LiveState } from "../hooks/useLiveLocation";
import type { PinTarget } from "../lib/pin";
import type { UnitPrefs } from "../lib/units";
import type { Analysis, Location, Route } from "../types";
import ForecastSlider from "./ForecastSlider";
import RiskLegend from "./RiskLegend";
import TripRibbon from "./TripRibbon";

const RouteMap = lazy(() => import("./RouteMap")); // the map library loads after first paint

type Props = {
  analysis: Analysis | null; route: Route | null; selectedId: string | null; hour: number; follow: boolean;
  onHour: (h: number) => void; onFollow: (f: boolean) => void; onSelect: (id: string) => void;
  units: UnitPrefs; onUnits: (u: UnitPrefs) => void; origin?: string; destination?: string;
  live: { pos: LivePos | null; state: LiveState; toggle: () => void };
  pins: { origin: Location | null; destination: Location | null }; pickTarget: PinTarget | null;
  onPickPoint: (loc: Location) => void; onCancelPick: () => void; onPinMove: (t: PinTarget, loc: Location) => void;
};

const pill = { bgcolor: "background.paper", "&.Mui-selected": { bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" } } };

/** Map + trip ribbon + forecast slider. "Full screen" fills the window (Esc exits) so menus and dialogs still work. */
export default function MapPanel({ analysis, route, selectedId, hour, follow, onHour, onFollow, onSelect, units, onUnits, origin, destination, live, pins, pickTarget, onPickPoint, onCancelPick, onPinMove }: Props) {
  const [full, setFull] = useState(false);
  const [legend, setLegend] = useState(false);
  const [radar, setRadar] = useState(false);
  const [radarFailed, setRadarFailed] = useState(false);
  const [followMe, setFollowMe] = useState(true);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [full]);

  const routes = analysis?.routes ?? [];
  return (
    <Paper sx={full
      ? { position: "fixed", inset: 0, zIndex: 1200, borderRadius: 0, display: "flex", flexDirection: "column" }
      : { display: "flex", flexDirection: "column", height: { xs: "88dvh", md: "calc(100dvh - var(--nav-h, 76px) - 32px)" }, minHeight: 420, overflow: "hidden" }}>
      <TripRibbon origin={origin} destination={destination} route={route} loadLb={analysis?.load_lb ?? null} units={units} onUnits={onUnits} />
      <Box sx={{ flex: 1, minHeight: 140, position: "relative" }}>
        <Suspense fallback={<Box p={2}>Loading map…</Box>}>
          <RouteMap routes={routes} selectedId={selectedId} hour={follow ? null : hour} units={units} tz={analysis?.timezone ?? "UTC"} onSelect={onSelect}
            me={live.pos} followMe={followMe && live.state === "on"} radar={radar && !radarFailed} onRadarError={() => { setRadarFailed(true); setRadar(false); }} resizeKey={full}
            pins={pins} pickTarget={pickTarget} onPickPoint={onPickPoint} onCancelPick={onCancelPick} onPinMove={onPinMove}
            toolbar={
              <>
                <Tooltip title={radarFailed ? "Radar is unavailable right now" : "Live precipitation radar (RainViewer)"}>
                  <span><ToggleButton value="radar" size="small" selected={radar} onChange={() => { setRadarFailed(false); setRadar(!radar); }} sx={pill} aria-label="Live radar"><UmbrellaIcon fontSize="small" /></ToggleButton></span>
                </Tooltip>
                <Tooltip title={live.pos ? "Keep the map centred on me" : "Turn on live location (top bar) first"}>
                  <span><ToggleButton value="follow" size="small" selected={followMe && !!live.pos} disabled={!live.pos} onChange={() => setFollowMe(!followMe)} sx={pill} aria-label="Follow my location"><MyLocationIcon fontSize="small" /></ToggleButton></span>
                </Tooltip>
                <Tooltip title="Risk legend"><IconButton size="small" onClick={() => setLegend(true)} aria-label="Risk legend" sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1 }}><LayersIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={full ? "Exit full screen (Esc)" : "Full screen"}>
                  <IconButton size="small" onClick={() => setFull(!full)} aria-label={full ? "Exit full screen" : "Full screen"} sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1 }}>
                    {full ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </>
            } />
        </Suspense>
      </Box>
      {analysis && <ForecastSlider departureUtc={analysis.departure_utc} tz={analysis.timezone} routes={routes} selectedId={selectedId} hour={hour} follow={follow} onHour={onHour} onFollow={onFollow} />}
      <Dialog open={legend} onClose={() => setLegend(false)} maxWidth="sm" fullWidth aria-labelledby="legend-title">
        <DialogTitle id="legend-title" sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Risk legend <IconButton onClick={() => setLegend(false)} aria-label="Close legend"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent><RiskLegend units={units} /></DialogContent>
      </Dialog>
    </Paper>
  );
}
