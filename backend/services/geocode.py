"""Photon (OSM) geocoder adapter: free, built for search-as-you-type, US results only."""

import hashlib
import logging

from django.conf import settings
from django.core.cache import cache

from .errors import AnalysisError
from .geo import US_BOUNDS, in_us
from .http import ProviderError, get_json

log = logging.getLogger(__name__)


def search(q: str) -> list[dict]:
    key = "geo:" + hashlib.sha256(q.lower().encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    la0, la1, lo0, lo1 = US_BOUNDS
    try:
        data = get_json(settings.PHOTON_URL, {"q": q, "limit": 8, "lang": "en", "bbox": f"{lo0},{la0},{lo1},{la1}"})
    except ProviderError as exc:
        log.warning("geocoding failed: %s", exc)
        raise AnalysisError("geocoding_unavailable", "Location search is unavailable. Try again shortly.", 502) from None
    out = []
    for f in (data.get("features") or [])[:8] if isinstance(data, dict) else []:
        try:
            p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
            lat, lon = float(lat), float(lon)
            if p.get("countrycode") != "US" or not in_us(lat, lon):
                continue
            parts = [p.get("name"), p.get("city"), p.get("state")]
            label = ", ".join(dict.fromkeys(str(x) for x in parts if x))[:120]
            if label:
                out.append({"label": label, "lat": round(lat, 5), "lon": round(lon, 5)})
        except (KeyError, TypeError, ValueError):
            continue
    out = out[:5]
    cache.set(key, out, 86400)
    return out
