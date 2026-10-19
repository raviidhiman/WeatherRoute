import { useEffect, useRef, useState } from "react";
import { getCurrentWeather } from "../api";
import { haversineMi } from "../lib/geo";
import type { CurrentWeather } from "../types";
import type { LivePos } from "./useLiveLocation";

const REFRESH_MS = 10 * 60_000;
const MOVE_MI = 3;

/** Weather at the user's position: refetched after moving > 3 mi or every 10 min. Stale responses are ignored. */
export function useCurrentWeather(pos: LivePos | null, loadLb: number) {
  const [data, setData] = useState<CurrentWeather | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const last = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const seq = useRef(0);
  const ctl = useRef(new AbortController());

  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS); return () => clearInterval(id); }, []);
  useEffect(() => { const c = ctl.current; return () => c.abort(); }, []);

  useEffect(() => {
    if (!pos) { setData(null); setFailed(false); last.current = null; return; }
    const l = last.current;
    if (l && Date.now() - l.t < REFRESH_MS && haversineMi(l.lat, l.lon, pos.lat, pos.lon) < MOVE_MI) return;
    last.current = { lat: pos.lat, lon: pos.lon, t: Date.now() };
    const mine = ++seq.current;
    getCurrentWeather(pos.lat, pos.lon, loadLb, ctl.current.signal)
      .then((d) => { if (mine === seq.current) { setData(d); setFailed(false); } })
      .catch(() => { if (mine === seq.current && !ctl.current.signal.aborted) setFailed(true); });
  }, [pos, loadLb, tick]);

  return { data, failed };
}
