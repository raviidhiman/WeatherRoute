# WeatherRoute

Weather-aware truck routing for the United States. Enter an origin, destination, departure time and cargo weight; WeatherRoute fetches up to three alternative routes, samples the forecast every 10/25/50 miles **at the truck's estimated arrival time**, classifies risk with the assessment's rules, and recommends a route. React + TypeScript + MUI + MapLibre on the front, Django REST Framework on the back. No database, no paid services, no secrets in the browser.

## Architecture

```
React (Vite, MUI, Leaflet)  --HTTPS/JSON-->  Django REST Framework (stateless)
                                                 api/        serializers, views, error handler
                                                 services/   http (only outbound path) · routing (OSRM) · weather (Open-Meteo)
                                                             geocode (Photon) · geo (checkpoints) · eta · risk · ranking · analyze
```

`risk.py`, `ranking.py`, `geo.py`, `eta.py` and `units.py` are pure functions with no provider imports. The backend is the sole authority for eligibility, risk and recommendation; the frontend only formats.

**Data flow of `POST /api/v1/routes/analyze/`:** validate → OSRM alternatives → per route: cumulative distance array, checkpoints by binary search, ETA by step-duration interpolation → one deduplicated, chunked, bounded-concurrency Open-Meteo fetch → classify every checkpoint (at ETA and for each forecast hour 0–48) → route metrics → lexicographic ranking → response.

### Algorithms / complexity
| Task | Approach | Cost |
|---|---|---|
| Checkpoints | cumulative-distance array + `bisect` + interpolation | O(n + m log n) |
| ETA | cumulative step durations + `bisect`, piecewise-linear | O(log n) per checkpoint |
| Weather | set-dedupe on ~1 km grid, 40 locations/request, 4 threads, 30-min cache, 25 s budget | ≤ ⌈m/40⌉ calls |
| Risk | explicit comparisons, one pass over checkpoints | O(m) |
| Ranking | tuple-key sort | O(r log r), r ≤ 3 |
| Geometry for the browser | radial-distance thinning (analysis uses full geometry) | O(n) |

## Risk model (assessment rules, not official regulations)
Canonical units: mi, mph, in/hr, lb, °F. Lower bounds inclusive; Rain ≤ 1.00 and Snow ≤ 3.0 are Severe, above is No Travel. Load rules run after normal wind classification: wind ≥ 55 → No Travel; 45 ≤ wind < 55 and load > 30,000 lb → No Travel; 35 ≤ wind < 45 and load > 40,000 lb → at least Severe. Checkpoint risk = highest hazard (individual hazards are kept for explanation).

**Unknown is never Low.** A missing, invalid or out-of-forecast value is `null`. A checkpoint with any unknown hazard is *unresolved*; a confirmed No Travel hazard still excludes the route even if another hazard is unknown.

**Eligibility:** `eligible` (everything resolved, no No Travel) · `incomplete` (unresolved data) · `restricted` (confirmed No Travel, excluded). **Status:** `complete` (all resolved) · `partial` (any unresolved). Failures return an HTTP error, never a Low-risk result.

**Segments.** Checkpoint *i* represents the road from its mile to the next checkpoint; the destination checkpoint is sampled and checked but represents 0 miles; a final partial segment keeps its real length. Severe/High miles are sums of real segment miles.

**Ranking** (exact, lexicographic): fewest Severe miles → fewest High miles → lowest mile-weighted average risk (low 0 … no travel 4) → shortest time → route order. Floats are rounded to 6 dp before comparing to strip summation noise. Eligible routes always outrank incomplete ones; if only incomplete routes exist the pick is labelled **Provisional (not verified safe)** and ranks by least missing data first. If every route is restricted, no route is recommended. Reasons are returned as structured codes so the UI states them in the user's units.

## Units
Independent distance / speed / temperature / weight / precipitation toggles plus US and Metric presets, using the exact constants in the spec. Internals and all thresholds are canonical; conversion happens only at input/output boundaries. Changing units converts the cargo value already typed and never alters a decision. `load_to_lb` rounds to 1e-6 lb at input only, so 13,607.7711 kg is exactly the 30,000 lb threshold.

## Providers (all free, no API key) and their limits
| Need | Provider | Notes — verify current terms before production |
|---|---|---|
| Routing | OSRM public demo (`OSRM_BASE_URL`) | Car profile → **truck restrictions are not applied** (API warns). Demo server is best-effort and not for heavy use; self-host or swap the adapter for production. May return fewer than 3 alternatives; none are invented. |
| Geocoding | Photon (komoot) | Fair-use; built for search-as-you-type. Debounced 400 ms, cached 24 h, US results only. |
| Weather | Open-Meteo | Hourly wind (10 m sustained speed, not gusts), rain+showers, snowfall (in/hr), up to 16 days. **Free tier is non-commercial.** Cached 30 min. Precipitation probability is never substituted for intensity. |
| Radar | RainViewer public index | Optional overlay, fetched by the browser and validated (host must be *.rainviewer.com). Not verified from my sandbox; its free-tier terms and zoom limits may change. If it fails the toggle turns itself off. |
| Basemap | OpenStreetMap, Esri streets, Esri satellite (raster tiles, no key) | Attribution shown by the map control. Auto-falls back OSM → Esri streets → Plain if tiles fail. |

Live location uses the browser Geolocation API (HTTPS or localhost only); positions stay in the browser except a ~1 km-rounded point sent for weather. Routes remain US-only even though live weather works anywhere.

Other limits: US coverage is the contiguous-US bounding box (also contains slivers of Canada/Mexico; Alaska/Hawaii unsupported). Departure must be within the next 7 days. Max 200 checkpoints per route (use a larger interval for very long trips). ETAs use the provider's car-profile durations and are estimates. Times display in the departure time zone you choose; per-checkpoint local zones are not computed. Ambiguous DST times use the earlier occurrence (with a warning); non-existent times are rejected.

## Choosing the start and end
Type to search, press the target icon in a field to use your device's current position once, or press the pin icon and click the map to drop the pin (A = origin, B = destination; drag a pin to move it, Esc cancels). Pins are labelled with their coordinates, and the server still checks they are inside US coverage.

## Forecast slider and heatmap
Reference time = **departure**. Hour *h* shows the provider forecast for departure + *h* hours at every checkpoint, so the 0–48 h range is real hourly data (no interpolation or synthetic weather). With "Use each checkpoint's arrival time" on (default) the map shows conditions at each ETA. The heat layer weights checkpoints by risk; unknown checkpoints appear as hollow grey circles. Color is always paired with a label/icon.

## Features
**Planning:** up to three routes with risk ribbons (real segment miles), Fastest/Shortest tags and plain-language reasons · optional **hours-of-service** breaks (30 min after 8 h driving, 10 h rest after 11 h; simplified, not a compliance tool) that delay ETAs and therefore the weather you meet · **Best time to leave** (same trip at +0/2/4/6/9/12/18/24 h using the weather already fetched, with a "Use" button) · **Route advisor**: a rule-based briefing in your units, plus an optional AI explanation.

**Map:** hourly forecast slider + risk heatmap · optional **live radar** (RainViewer) · **live location** with a moving marker, follow-me, and weather at your position · **Full screen** (Esc exits) · basemap switcher (OpenStreetMap / Streets / Satellite / Plain) with automatic fallback · trip **ribbon** above the map (origin → destination, distance, avg speed, temperature range, cargo, max precipitation; click any value to flip its unit, or use the US/Metric toggle).

**Top bar:** a live ribbon with the **next direction** (distance to the next maneuver, distance to go; uses your position when live location is on) and the **weather broadcast** (at your location, or at the route start), plus unit presets, a unit-settings popover and the country selector.

**Workflow:** the Trip form collapses to a one-line summary once results arrive (expand to edit) · swap origin/destination · recent trips (this browser only) · **Retry weather** · *View checkpoints*, *View directions* and *Download CSV* all follow the selected route; the long lists stay hidden until clicked and then open full width at the bottom.

### Optional AI advisor
Off by default. Set `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` on the server to any **OpenAI-compatible chat-completions API** and an "Ask AI to reason" button appears. The model only *explains* results: eligibility, risk and the recommendation stay rule-based. It receives only facts the server cached itself (never client text, place names or coordinates), the key never reaches the browser, output is capped and rendered as plain text, and any failure falls back to the rule-based briefing. xKiro is supported this way: `AI_BASE_URL=https://api.xkiro.com/v1` (confirm in the xKiro docs), `AI_MODEL=mistralai/mistral-large-4-0`, and your key in `AI_API_KEY` (never in code or `VITE_*`). Tested against a local fake server only; a real xKiro call has not been tested from here.

## Run locally
**Windows PowerShell:** bash syntax (`source`, `&&`) does not work. Use:
```powershell
cd backend; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements-dev.txt
$env:DJANGO_DEBUG="1"; $env:CORS_ALLOWED_ORIGINS="http://localhost:5173"; $env:PROVIDER_USER_AGENT="WeatherRoute/1.0 (you@example.com)"
python manage.py runserver 8000
# second window:  cd frontend; npm ci; npm run dev     (do not run npm ci while Vite is running)
```
macOS/Linux:
```bash
# backend (Python 3.12)
cd backend && python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env  (then edit .env; the backend reads it automatically)
python manage.py runserver 8000

# frontend (Node 22), in a second terminal
cd frontend && npm ci && npm run dev        # http://localhost:5173 (Vite proxies /api)
```

### Troubleshooting
- **Weather shows Unknown:** the free weather service was slow or rate-limited. Click **Retry weather** (only missing locations are re-fetched). The Django console prints lines like `weather batch of 15 failed: unavailable` that name the cause (`status 429` = rate limit, `unavailable`/`deadline` = timeout). Tunables: `WEATHER_TIMEOUT` (default 15 s), `WEATHER_BUDGET_SECONDS` (35 s).
- **No map background:** pick *Plain (no tiles)* in the map's dropdown; routes and heat still draw. Other backgrounds need `tile.openstreetmap.org`, `server.arcgisonline.com` or `server.arcgisonline.com` to be reachable (the map switches by itself after a few seconds).
- **Proxy `ECONNREFUSED ::1:8000`:** already fixed (proxy targets 127.0.0.1).

## Tests and checks
```bash
cd backend  && pytest -q && ruff check . && bandit -q -r config api services && pip-audit -r requirements.txt
cd frontend && npm test && npm run build && npm audit --omit=dev
```
Backend (126 tests): every threshold boundary (wind 24.99/25/…/55, rain 0.099/0.10/…/1.001, snow 0.499/…/3.001, load 30,000/+ε/40,000/+ε), unknown ≠ Low, unit invariance, checkpoint spacing and final partial segment, ETA, ranking priority/ties/all-restricted/provisional, provider failure/malformed data, validation, SSRF host allowlist, oversize/NaN/unknown-field payloads, error leakage, rate limiting, and an end-to-end test over real HTTP against local fake OSRM/Open-Meteo/Photon servers (including a 503 retry and caching). Frontend (50 tests, incl. ribbon unit switching, navigation maths and radar-index validation): conversions, validation, map data, country dialog, form unit conversion.

## API
`GET /api/v1/health/` · `GET /api/v1/weather/current/?lat=&lon=&load_lb=` (hourly model data at a point, any valid coordinate; unknown stays `null`) · `POST /api/v1/routes/explain/` `{analysis_id, units, ai}` (advisor; analysis facts expire after 30 min) · `GET /api/v1/geocode/?q=denver` → `{"results":[{"label","lat","lon"}]}`

`POST /api/v1/routes/analyze/`
```json
{ "origin": {"label":"Denver, CO","lat":39.7392,"lon":-104.9903},
  "destination": {"label":"Salt Lake City, UT","lat":40.7608,"lon":-111.891},
  "departure_local": "2026-10-20T08:00", "timezone": "America/Denver",
  "load_weight": 28000, "load_unit": "lb", "checkpoint_interval": 25 }
```
Response: `analysis_id, status, departure_utc, timezone, routes[], recommendation{route_id, level, reasons[]}, warnings[]`. Each route has `id, label, rank, distance_mi, duration_s, eta, eta_method, geometry, eligibility, severe_miles, high_miles, no_travel_miles, unknown_miles, average_risk` and `checkpoints[]` (`distance_mi, lat, lon, eta, segment_mi, wind_mph, rain_in_hr, snow_in_hr, temp_f, hazards, risk, resolved, forecast{wind,rain,snow,temp,risk}[49]`). Errors: `{"error":{"code","message","request_id","fields?"}}` with 400 validation · 413 · 415 · 422 (`no_route`, `too_many_checkpoints`) · 429 · 502 (`routing_unavailable`) · 503 (`busy`) · 500 (generic).

## Security
Strict serializers (unknown fields rejected, finite numbers only, US bounds, enums, 16 KB body cap) · clients can never supply URLs: the single outbound function allows only HTTPS hosts derived from operator env vars, no redirects, 25 MB cap, retries only for idempotent GETs on 429/5xx/timeouts with jittered backoff · per-IP scoped rate limits and a bounded-concurrency gate (503 when busy) · explicit `ALLOWED_HOSTS` and CORS origins, app refuses to boot in production without `DJANGO_SECRET_KEY`/`ALLOWED_HOSTS` · HTTPS redirect, HSTS, nosniff, DENY framing · stateless (no cookies/sessions/DB), so CSRF does not apply · errors are fixed messages with a `request_id`; logs record exception types only, never bodies, coordinates or provider URLs · no secrets in the frontend (only public `VITE_*` values) · dependency audits clean at time of writing.

## Deploy on Render (free)
1. Push to GitHub. Render → New → **Blueprint** → select the repo (`render.yaml`).
2. After the first deploy, set `CORS_ALLOWED_ORIGINS` (API) to the static site URL and `VITE_API_BASE_URL` (web) to the API URL; redeploy the web service. Set `PROVIDER_USER_AGENT` to a contact address.
3. Check `https://<api>/api/v1/health/`, run one analysis, confirm the map loads and the browser console shows no CSP report-only violations, then rename the header to `Content-Security-Policy` in `render.yaml`.

Free-tier caveats: the API sleeps after inactivity (first request is slow), memory is 512 MB, and the in-memory cache/rate-limit state resets on restart. The one-worker setting is deliberate; scaling out needs a shared cache such as Redis.

Deployment checklist: `DEBUG=0` · generated secret key · exact hosts/origins · HTTPS only · no `.env` committed (`.gitignore`) · CI green · audits clean · logs contain no coordinates · smoke test after deploy.

## 5–10 minute walkthrough
1. (1 min) Problem and architecture diagram; why the backend owns the rules.
2. (2 min) Denver → Salt Lake City, 28,000 lb, 25 mi: three routes, risk ribbons, recommendation reasons.
3. (2 min) Raise weight to 45,000 lb and toggle Metric: units convert, decisions do not; show the Severe/No Travel change.
4. (2 min) Forecast slider and heatmap; click a checkpoint; unknown (hollow) checkpoints and the Provisional label.
5. (1 min) Country selector → Coming Soon dialog, keyboard and Esc, form preserved.
6. (2 min) Code tour: `risk.py` + boundary tests, `geo.py`/`eta.py` bisect, `ranking.py`, `http.py` safeguards, integration test.
