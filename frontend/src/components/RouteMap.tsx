import PinDropIcon from "@mui/icons-material/PinDrop";
import { Alert, Box, Button, MenuItem, Select, Typography, useTheme } from "@mui/material";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LivePos } from "../hooks/useLiveLocation";
import { fetchRadarTiles } from "../lib/radar";
import { boundsOf, checkpointsToGeoJSON, riskAt, routesToGeoJSON } from "../lib/mapData";
import { coordLocation, type PinTarget } from "../lib/pin";
import { metaOf, RISK } from "../lib/risk";
import { formatDistance, formatPrecip, formatSpeed, formatTemp, type UnitPrefs } from "../lib/units";
import type { Location, Route } from "../types";

/** Leaflet + free raster tiles. No WebGL, no web worker, no API key. "plain" needs no network at all. */
type Basemap = { label: string; url?: string; attr?: string; max?: number; sub?: string };
const BASEMAPS: Record<string, Basemap> = {
  osm: { label: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap contributors", max: 19 },
  streets: { label: "Streets (Esri)", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attr: "Tiles © Esri", max: 19 },
  esri: { label: "Satellite (Esri)", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Tiles © Esri", max: 18 },
  plain: { label: "Plain (no tiles)" },
};
// Automatic fallback only between real tile providers; "Plain" is a last resort when both are unreachable.
const NEXT_ON_FAIL: Record<string, string> = { osm: "streets", streets: "plain", esri: "osm" };
const TILE_TIMEOUT_MS = 12000;
const TILE_ERRORS_BEFORE_FALLBACK = 10;
const HEAT_COLORS = ["#86EFAC", "#FACC15", "#F97316", "#DC2626", "#5B2A86"];
const riskColors = RISK.map((r) => r.color);
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Props = {
  routes: Route[]; selectedId: string | null; hour: number | null; units: UnitPrefs; tz: string; onSelect: (id: string) => void;
  me: LivePos | null; followMe: boolean; radar: boolean; onRadarError: () => void; resizeKey: unknown; toolbar?: ReactNode;
  pins: { origin: Location | null; destination: Location | null }; pickTarget: PinTarget | null;
  onPickPoint: (loc: Location) => void; onCancelPick: () => void; onPinMove: (t: PinTarget, loc: Location) => void;
};

const PIN_STYLE = "width:28px;height:28px;border-radius:50%;color:#fff;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif";
const pinIcon = (letter: string, color: string) => L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14], html: `<div style="${PIN_STYLE};background:${color}">${letter}</div>` });

/** Pixel radius so neighbouring checkpoint blobs merge into one corridor at every zoom (web-mercator ground resolution). */
function heatRadiusPx(map: L.Map, spacingM: number): number {
  const mpp = (156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** map.getZoom();
  return Math.max(9, Math.min(70, (spacingM * 0.55) / mpp));
}

export default function RouteMap({ routes, selectedId, hour, units, onSelect, me, followMe, radar, onRadarError, resizeKey, toolbar, pins, pickTarget, onPickPoint, onCancelPick, onPinMove }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const drawn = useRef<L.LayerGroup | null>(null);   // routes + checkpoints
  const heat = useRef<L.LayerGroup | null>(null);    // blurred risk corridor
  const meLayer = useRef<L.LayerGroup | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null); // draggable A / B pins
  const heatDots = useRef<L.CircleMarker[]>([]);
  const spacing = useRef(40234);                     // metres between checkpoints (25 mi default)
  const tiles = useRef({ loaded: 0, errors: 0 });
  const dark = useTheme().palette.mode === "dark";
  const [basemap, setBasemap] = useState("osm");
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const basemapRef = useRef(basemap);
  basemapRef.current = basemap;
  // Event handlers read the latest props through a ref so the map is created exactly once.
  const live = useRef({ routes, units, hour, onSelect, onPickPoint, onCancelPick, onPinMove, pins });
  live.current = { routes, units, hour, onSelect, onPickPoint, onCancelPick, onPinMove, pins };

  const fallBack = (why: string) => {
    const next = NEXT_ON_FAIL[basemapRef.current];
    if (!next) return;
    setNote(`${why} Switched to ${BASEMAPS[next].label}; routes and weather still work.`);
    setBasemap(next);
  };

  useEffect(() => {  // create the map once
    const map = L.map(box.current!, { zoomControl: false, center: [39.5, -98.5], zoom: 4, minZoom: 2, worldCopyJump: true });
    L.control.zoom({ position: "topright" }).addTo(map);
    const pane = map.createPane("heat");
    pane.style.zIndex = "350"; pane.style.filter = "blur(9px)"; pane.style.pointerEvents = "none";
    const radarPane = map.createPane("radar");
    radarPane.style.zIndex = "250"; radarPane.style.pointerEvents = "none"; // above tiles, below the heat corridor, and not darkened with the base map
    heat.current = L.layerGroup().addTo(map);
    drawn.current = L.layerGroup().addTo(map);
    meLayer.current = L.layerGroup().addTo(map);
    pinLayer.current = L.layerGroup().addTo(map);
    map.on("zoomend", () => { const r = heatRadiusPx(map, spacing.current); heatDots.current.forEach((d) => d.setRadius(r)); });
    mapRef.current = map;
    setReady(true);
    return () => { map.remove(); mapRef.current = null; baseRef.current = null; heatDots.current = []; setReady(false); };
  }, []);

  useEffect(() => {  // basemap (re)load with an automatic fallback chain: it can never stay blank
    const map = mapRef.current;
    if (!map || !ready) return;
    baseRef.current?.remove(); baseRef.current = null;
    tiles.current = { loaded: 0, errors: 0 };
    const def = BASEMAPS[basemap];
    if (!def.url) return;
    const layer = L.tileLayer(def.url, { attribution: def.attr, maxZoom: def.max, subdomains: def.sub ?? "abc", zIndex: 1 });
    layer.on("tileload", () => { tiles.current.loaded++; });
    layer.on("tileerror", () => { if (++tiles.current.errors >= TILE_ERRORS_BEFORE_FALLBACK && tiles.current.loaded === 0) fallBack("The map tiles could not be loaded."); });
    layer.addTo(map); baseRef.current = layer;
    const timer = window.setTimeout(() => tiles.current.loaded === 0 && fallBack("The map tiles are taking too long to load."), TILE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, basemap]);

  useEffect(() => {  // dark mode: darken the street tiles (satellite imagery is left as is)
    const pane = mapRef.current?.getPane("tilePane");
    if (ready && pane) pane.style.filter = dark && basemap !== "esri" ? "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.92) saturate(0.85)" : "";
  }, [ready, dark, basemap]);

  useEffect(() => {  // routes, checkpoints and the heat corridor: only these layer groups are rebuilt, never the map
    const map = mapRef.current, group = drawn.current, hg = heat.current;
    if (!ready || !map || !group || !hg) return;
    group.clearLayers(); hg.clearLayers(); heatDots.current = [];
    const first = routes[0]?.checkpoints;
    spacing.current = first && first.length > 1 ? Math.max(1, first[1].distance_mi - first[0].distance_mi) * 1609.344 : 40234;
    const radius = heatRadiusPx(map, spacing.current);

    const flip = (c: number[]) => [c[1], c[0]] as L.LatLngTuple;
    const lines = routesToGeoJSON(routes, selectedId).features.sort((a, b) => Number(a.properties?.selected) - Number(b.properties?.selected));
    for (const f of lines) {
      const pts = f.geometry.coordinates.map(flip);
      const { selected: sel, color, id } = f.properties as { selected: boolean; color: string; id: string };
      L.polyline(pts, { color: "#fff", weight: sel ? 9 : 6, opacity: 0.9, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
      L.polyline(pts, { color, weight: sel ? 5 : 3, opacity: sel ? 1 : 0.75, lineCap: "round", lineJoin: "round" })
        .on("click", () => live.current.onSelect(id)).addTo(group);
    }

    const renderer = L.svg({ pane: "heat" });
    for (const f of checkpointsToGeoJSON(routes, hour, selectedId).features) {
      const { risk, selected, routeId, index } = f.properties as { risk: number; selected: boolean; routeId: string; index: number };
      const ll = flip(f.geometry.coordinates);
      if (risk > 0) {
        const dot = L.circleMarker(ll, { renderer, radius, stroke: false, fillColor: HEAT_COLORS[risk], fillOpacity: 0.28 + 0.12 * risk, interactive: false });
        dot.addTo(hg); heatDots.current.push(dot);
      }
      if (!selected) continue;
      const known = risk >= 0;
      L.circleMarker(ll, { radius: 6, weight: known ? 2 : 2.5, color: known ? "#fff" : "#55636A", fillColor: known ? riskColors[risk] : "#fff", fillOpacity: 1, bubblingMouseEvents: false })
        .on("click", () => {
          const { routes: rs, units: u, hour: h } = live.current;
          const cp = rs.find((r) => r.id === routeId)?.checkpoints[index];
          if (!cp) return;
          const at = h === null ? { w: cp.wind_mph, r: cp.rain_in_hr, s: cp.snow_in_hr, t: cp.temp_f } : { w: cp.forecast.wind[h], r: cp.forecast.rain[h], s: cp.forecast.snow[h], t: cp.forecast.temp[h] };
          const node = document.createElement("div");
          const line = (text: string, bold = false) => { const p = document.createElement("div"); p.textContent = text; if (bold) p.style.fontWeight = "700"; node.appendChild(p); };
          line(`${metaOf(riskAt(cp, h)).label} risk · mile ${formatDistance(cp.distance_mi, u)}`, true);
          line(`Wind ${formatSpeed(at.w, u)}`); line(`Rain ${formatPrecip(at.r, u)}`); line(`Snow ${formatPrecip(at.s, u)}`); line(`Temp ${formatTemp(at.t, u)}`);
          line(h === null ? "At estimated arrival" : `Forecast +${h} h after departure`);
          L.popup({ maxWidth: 260 }).setLatLng([cp.lat, cp.lon]).setContent(node).openOn(map);
        }).addTo(group);
    }
  }, [ready, routes, selectedId, hour]);

  useEffect(() => {  // origin / destination pins: draggable, and the map shows them before any route exists
    const map = mapRef.current, g = pinLayer.current;
    if (!ready || !map || !g) return;
    g.clearLayers();
    const defs: [PinTarget, string, string, Location | null][] = [["origin", "A", "#2E7D32", pins.origin], ["destination", "B", "#C62828", pins.destination]];
    for (const [target, letter, color, loc] of defs) {
      if (!loc) continue;
      L.marker([loc.lat, loc.lon], { icon: pinIcon(letter, color), draggable: true, title: `${target === "origin" ? "Origin" : "Destination"}: ${loc.label}. Drag to move.`, keyboard: false, zIndexOffset: 1000 })
        .on("dragend", (e) => { const ll = (e.target as L.Marker).getLatLng().wrap(); live.current.onPinMove(target, coordLocation("Dropped pin", ll.lat, ll.lng)); })
        .addTo(g);
    }
    if (live.current.routes.length === 0) {  // nothing else to frame yet
      const pts = defs.flatMap(([, , , l]) => (l ? [[l.lat, l.lon] as L.LatLngTuple] : []));
      if (pts.length === 1) map.setView(pts[0], 8, { animate: !reduceMotion() });
      else if (pts.length === 2) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: !reduceMotion() });
    }
  }, [ready, pins]);

  useEffect(() => {  // "drop a pin" mode: next click on the map sets the chosen end of the trip; Esc cancels
    const map = mapRef.current;
    if (!ready || !map || !pickTarget) return;
    const el = map.getContainer();
    el.style.cursor = "crosshair";
    const click = (e: L.LeafletMouseEvent) => { const ll = e.latlng.wrap(); live.current.onPickPoint(coordLocation("Dropped pin", ll.lat, ll.lng)); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") live.current.onCancelPick(); };
    map.on("click", click); window.addEventListener("keydown", key);
    return () => { el.style.cursor = ""; map.off("click", click); window.removeEventListener("keydown", key); };
  }, [ready, pickTarget]);

  useEffect(() => {  // fit the view when new routes arrive
    const b = ready ? boundsOf(routes) : null;
    if (!b) return;
    const box = L.latLngBounds([[b[0][1], b[0][0]], [b[1][1], b[1][0]]]);
    for (const l of [live.current.pins.origin, live.current.pins.destination]) if (l) box.extend([l.lat, l.lon]); // keep both pins in view
    mapRef.current?.fitBounds(box, { padding: [48, 48], animate: !reduceMotion() });
  }, [ready, routes]);

  useEffect(() => {  // live position marker; optionally keep the map centred on it
    const map = mapRef.current, g = meLayer.current;
    if (!ready || !map || !g) return;
    g.clearLayers();
    if (!me) return;
    L.circleMarker([me.lat, me.lon], { radius: 16, stroke: false, fillColor: "#0B6BCB", fillOpacity: 0.2, interactive: false }).addTo(g);
    L.circleMarker([me.lat, me.lon], { radius: 7, weight: 3, color: "#fff", fillColor: "#0B6BCB", fillOpacity: 1, interactive: false }).addTo(g);
    if (followMe) map.setView([me.lat, me.lon], Math.max(map.getZoom(), 11), { animate: !reduceMotion() });
  }, [ready, me, followMe]);

  useEffect(() => {  // optional live radar overlay (RainViewer)
    const map = mapRef.current;
    if (!ready || !map || !radar) return;
    const ctl = new AbortController();
    let layer: L.TileLayer | null = null;
    fetchRadarTiles(ctl.signal)
      .then((url) => { if (!ctl.signal.aborted) layer = L.tileLayer(url, { opacity: 0.65, maxNativeZoom: 7, pane: "radar", attribution: "Radar © RainViewer" }).addTo(map); })
      .catch(() => { if (!ctl.signal.aborted) onRadarError(); });
    return () => { ctl.abort(); layer?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, radar]);

  useEffect(() => {  // keep Leaflet in sync with its container (layout changes, full screen, window resize)
    const el = box.current;
    if (!ready || !el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => mapRef.current?.invalidateSize()); });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [ready, resizeKey]);

  return (
    <Box sx={{ position: "absolute", inset: 0 }}>
      {/* Inline style on purpose: it always wins over library CSS, so the map can never collapse to 0 px high. */}
      <div ref={box} role="region" aria-label="Route map" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden", background: dark ? "#0D181D" : "#E3EBEE", zIndex: 0, isolation: "isolate" }} />
      <Box sx={{ position: "absolute", zIndex: 2, top: 10, left: 10, right: 56, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Select size="small" value={basemap} onChange={(e) => { setNote(null); setBasemap(e.target.value); }} inputProps={{ "aria-label": "Map background" }}
          sx={{ bgcolor: "background.paper", fontSize: 14 }}>
          {Object.entries(BASEMAPS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
        </Select>
        {toolbar}
      </Box>
      {pickTarget && (
        <Alert severity="info" icon={<PinDropIcon fontSize="inherit" />} action={<Button color="inherit" size="small" onClick={onCancelPick}>Cancel</Button>} sx={{ position: "absolute", zIndex: 2, left: 10, right: 60, bottom: 28 }} role="status">
          Click the map to drop the {pickTarget} pin (A is origin, B is destination). Press Esc to cancel.
        </Alert>
      )}
      {note && <Alert severity="info" onClose={() => setNote(null)} sx={{ position: "absolute", zIndex: 2, left: 10, right: 60, bottom: pickTarget ? 88 : 28 }}>{note}</Alert>}
      {routes.length === 0 && !note && !pickTarget && !pins.origin && !pins.destination && (
        <Typography sx={{ position: "absolute", zIndex: 2, left: 16, bottom: 28, px: 1.5, py: 0.75, bgcolor: "background.paper", borderRadius: 1, border: 1, borderColor: "divider", pointerEvents: "none" }} variant="body2">
          Enter a trip, or drop pins on the map, to compare routes.
        </Typography>
      )}
    </Box>
  );
}
