import { useCallback, useEffect, useRef, useState } from "react";
import { haversineMi } from "../lib/geo";

export type LivePos = { lat: number; lon: number; accuracy: number; speedMps: number | null; heading: number | null };
export type LiveState = "off" | "asking" | "on" | "denied" | "unavailable";

/** Browser geolocation, only while the user has switched it on. Ignores jitter under 30 m. Needs HTTPS or localhost. */
export function useLiveLocation() {
  const [pos, setPos] = useState<LivePos | null>(null);
  const [state, setState] = useState<LiveState>("off");
  const watch = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setPos(null);
    setState("off");
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) { setState("unavailable"); return; }
    if (watch.current !== null) return;
    setState("asking");
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setState("on");
        const next: LivePos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, speedMps: p.coords.speed, heading: p.coords.heading };
        setPos((prev) => (prev && haversineMi(prev.lat, prev.lon, next.lat, next.lon) < 0.02 ? prev : next));
      },
      (e) => { watch.current = null; setState(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"); },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);
  return { pos, state, start, stop, toggle: () => (watch.current === null ? start() : stop()) };
}
