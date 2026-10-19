import MyLocationIcon from "@mui/icons-material/MyLocation";
import PinDropIcon from "@mui/icons-material/PinDrop";
import { Autocomplete, CircularProgress, IconButton, InputAdornment, TextField, Tooltip } from "@mui/material";
import { useEffect, useState } from "react";
import { searchLocations } from "../api";
import { coordLocation } from "../lib/pin";
import type { Location } from "../types";

type Props = { label: string; value: Location | null; onChange: (v: Location | null) => void; error?: string; picking?: boolean; onPick?: () => void };

/** Debounced (400 ms) US location search; each keystroke aborts the previous request. */
export default function LocationField({ label, value, onChange, error, picking, onPick }: Props) {
  const [text, setText] = useState(value?.label ?? "");
  const [options, setOptions] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  /** One-shot device position (not the live-tracking switch in the top bar). */
  const useMyLocation = () => {
    if (!("geolocation" in navigator)) { setGeoError("This device cannot share its location."); return; }
    setLocating(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); onChange(coordLocation("My location", p.coords.latitude, p.coords.longitude)); },
      (e) => { setLocating(false); setGeoError(e.code === e.PERMISSION_DENIED ? "Location permission was denied. Allow it in the browser address bar." : "Your location could not be found. Try again."); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  useEffect(() => { setText(value?.label ?? ""); }, [value]); // follow swaps / recent-trip fills

  useEffect(() => {
    const q = text.trim();
    if (q.length < 3 || q === value?.label) { setOptions(value ? [value] : []); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true); setFailed(false);
      try { setOptions(await searchLocations(q, ctl.signal)); }
      catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) { setOptions([]); setFailed(true); } }
      finally { if (!ctl.signal.aborted) setLoading(false); }
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text, value]);

  return (
    <Autocomplete
      value={value} options={options} loading={loading} filterOptions={(x) => x}
      getOptionLabel={(o) => o.label} isOptionEqualToValue={(a, b) => a.lat === b.lat && a.lon === b.lon}
      inputValue={text} onInputChange={(_, v, reason) => { setText(v); if (reason === "clear") onChange(null); }}
      onChange={(_, v) => onChange(v)}
      noOptionsText={failed ? "Location search is unavailable. Try again shortly." : text.trim().length < 3 ? "Type at least 3 characters" : "No US matches"}
      renderInput={(p) => (
        <TextField {...p} label={label} size="small" error={!!error || !!geoError} helperText={error ?? geoError}
          slotProps={{ input: { ...p.InputProps, endAdornment: (
            <>
              {loading && <CircularProgress size={16} />}
              <InputAdornment position="end" sx={{ mr: 0 }}>
                <Tooltip title="Use my current location">
                  <span><IconButton size="small" onClick={useMyLocation} disabled={locating} aria-label={`Use my current location as ${label.toLowerCase()}`}>{locating ? <CircularProgress size={18} /> : <MyLocationIcon fontSize="small" />}</IconButton></span>
                </Tooltip>
                {onPick && (
                  <Tooltip title="Drop a pin on the map">
                    <IconButton size="small" onClick={onPick} color={picking ? "primary" : "default"} aria-pressed={!!picking} aria-label={`Pick ${label.toLowerCase()} on the map`}><PinDropIcon fontSize="small" /></IconButton>
                  </Tooltip>
                )}
              </InputAdornment>
              {p.InputProps.endAdornment}
            </>
          ) } }} />
      )}
    />
  );
}
