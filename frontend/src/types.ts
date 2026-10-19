export type Level = 0 | 1 | 2 | 3 | 4; // low, moderate, high, severe, no travel
export type Location = { label: string; lat: number; lon: number };

export type Forecast = { wind: (number | null)[]; rain: (number | null)[]; snow: (number | null)[]; temp: (number | null)[]; risk: (Level | null)[] };
export type Checkpoint = {
  index: number; distance_mi: number; lat: number; lon: number; eta: string; segment_mi: number;
  wind_mph: number | null; rain_in_hr: number | null; snow_in_hr: number | null; temp_f: number | null;
  hazards: { wind: Level | null; rain: Level | null; snow: Level | null };
  risk: Level | null; resolved: boolean; forecast: Forecast;
};
export type Eligibility = "eligible" | "incomplete" | "restricted";
export type Route = {
  id: string; label: string; rank: number | null; distance_mi: number; duration_s: number; eta: string;
  eta_method: "step_durations" | "proportional"; geometry: [number, number][]; checkpoints: Checkpoint[];
  trip_s: number; rest_stops: number; directions: Direction[];
  eligibility: Eligibility; severe_miles: number; high_miles: number; no_travel_miles: number; unknown_miles: number;
  unresolved_checkpoints: number; average_risk: number | null;
};
export type Direction = { text: string; road: string; start_mi: number; distance_mi: number };
export type DepartureOption = {
  offset_h: number; depart_local: string; depart_utc: string; level: "recommended" | "provisional" | "none"; route_id: string | null;
  severe_miles: number | null; high_miles: number | null; average_risk: number | null; unresolved: number | null; best: boolean;
};
export type CurrentWeather = {
  as_of: string; wind_mph: number | null; rain_in_hr: number | null; snow_in_hr: number | null; temp_f: number | null;
  hazards: { wind: Level | null; rain: Level | null; snow: Level | null }; risk: Level | null; resolved: boolean;
};
export type ExplainResponse = { ai_enabled: boolean; advisor: string[]; ai_text: string | null; ai_error: string | null };
export type Reason = { code: string; other_id?: string; value?: number; other_value?: number; ids?: string[] };
export type Recommendation = { route_id: string | null; level: "recommended" | "provisional" | "none"; reasons: Reason[] };
export type Analysis = {
  analysis_id: string; status: "complete" | "partial"; generated_at: string; departure_utc: string; timezone: string;
  hos: boolean; load_lb: number; departure_options: DepartureOption[]; best_departure_offset_h: number;
  routes: Route[]; recommendation: Recommendation; warnings: string[];
};
export type AnalyzeRequest = {
  origin: Location; destination: Location; departure_local: string; timezone: string;
  load_weight: number; load_unit: "lb" | "kg"; checkpoint_interval: 10 | 25 | 50; hos: boolean;
};
