import type { Analysis, AnalyzeRequest, CurrentWeather, ExplainResponse, Location } from "./types";

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0, public fields: Record<string, string> = {}, public requestId?: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("network", "Could not reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(err?.code ?? "error", err?.message ?? "Something went wrong. Try again.", res.status, err?.fields ?? {}, err?.request_id);
  }
  return body as T;
}

export const analyzeRoutes = (req: AnalyzeRequest, signal: AbortSignal) =>
  request<Analysis>("/api/v1/routes/analyze/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }, signal);

export const searchLocations = (q: string, signal: AbortSignal) =>
  request<{ results: Location[] }>(`/api/v1/geocode/?q=${encodeURIComponent(q)}`, { method: "GET" }, signal).then((r) => r.results);

export const getCurrentWeather = (lat: number, lon: number, loadLb: number, signal: AbortSignal) =>
  request<CurrentWeather>(`/api/v1/weather/current/?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&load_lb=${Math.round(loadLb)}`, { method: "GET" }, signal);

export const explainAnalysis = (analysisId: string, units: { distance: string; speed: string; precip: string; weight: string }, ai: boolean, signal: AbortSignal) =>
  request<ExplainResponse>("/api/v1/routes/explain/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysis_id: analysisId, units, ai }) }, signal);
