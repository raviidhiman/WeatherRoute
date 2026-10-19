import MyLocationIcon from "@mui/icons-material/MyLocation";
import NavigationIcon from "@mui/icons-material/NavigationOutlined";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import ThermostatIcon from "@mui/icons-material/DeviceThermostat";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import { Box, Container, IconButton, Popover, Stack, ToggleButton, Tooltip, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import type { UnitPrefs } from "../lib/units";
import type { Mode } from "../theme";
import CountrySelector from "./CountrySelector";
import UnitSettings from "./UnitSettings";
import UnitToggle from "./UnitToggle";

type Props = {
  units: UnitPrefs; onUnits: (u: UnitPrefs) => void;
  direction: string; weather: ReactNode; liveOn: boolean; liveNote: string | null; onToggleLive: () => void;
  mode: Mode; onToggleMode: () => void;
};

/** Brand + live "direction and weather" ribbon + unit controls + country. */
export default function NavBar({ units, onUnits, direction, weather, liveOn, liveNote, onToggleLive, mode, onToggleMode }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box component="header" sx={{ bgcolor: "primary.main", color: "#fff", py: 1 }}>
      <Container maxWidth={false} sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AltRouteIcon aria-hidden />
          <Typography variant="h1" component="h1">WeatherRoute</Typography>
        </Stack>

        <Stack role="status" aria-live="polite" direction="row" alignItems="center" gap={2}
          sx={{ flex: "1 1 360px", minWidth: 0, bgcolor: "rgba(255,255,255,0.12)", borderRadius: 1, px: 1.5, py: 0.5 }}>
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0, flex: "1 1 50%" }}>
            <NavigationIcon fontSize="small" aria-hidden />
            <Typography variant="body2" noWrap title={direction}>{direction}</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0, flex: "1 1 50%" }}>
            <ThermostatIcon fontSize="small" aria-hidden />
            <Box sx={{ minWidth: 0, overflow: "hidden" }}>{weather}</Box>
          </Stack>
          <Tooltip title={liveNote ?? (liveOn ? "Stop live location" : "Use my live location")}>
            <ToggleButton value="live" selected={liveOn} onChange={onToggleLive} size="small" aria-label="Live location"
              sx={{ color: "#fff", borderColor: "#5E8A96", "&.Mui-selected": { bgcolor: "#fff", color: "primary.main" } }}>
              <MyLocationIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </Stack>

        <Stack direction="row" alignItems="center" gap={1}>
          <UnitToggle value={units} onChange={onUnits} dark />
          <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <IconButton aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleMode} sx={{ color: "#fff" }}>
              {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          <IconButton aria-label="Unit settings" onClick={(e) => setAnchor(e.currentTarget)} sx={{ color: "#fff" }}><TuneIcon /></IconButton>
          <CountrySelector />
        </Stack>
      </Container>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Box sx={{ p: 2, width: 360, maxWidth: "90vw" }}>
          <Typography variant="h3" component="h2" mb={1}>Units</Typography>
          <UnitSettings value={units} onChange={onUnits} />
        </Box>
      </Popover>
    </Box>
  );
}
