/** Live precipitation radar tiles from RainViewer's public index (free, no key). Everything it returns is validated. */
const INDEX = "https://api.rainviewer.com/public/weather-maps.json";

export async function fetchRadarTiles(signal: AbortSignal): Promise<string> {
  const res = await fetch(INDEX, { signal });
  if (!res.ok) throw new Error("radar index unavailable");
  const j = await res.json();
  const host: unknown = j?.host;
  const past: { path?: unknown }[] = Array.isArray(j?.radar?.past) ? j.radar.past : [];
  const path = past[past.length - 1]?.path;
  const hostOk = typeof host === "string" && /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.rainviewer\.com$/.test(host);
  const pathOk = typeof path === "string" && /^\/v2\/radar\/[A-Za-z0-9_-]+$/.test(path);
  if (!hostOk || !pathOk) throw new Error("unexpected radar index");
  return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
}
