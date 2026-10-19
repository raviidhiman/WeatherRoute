import threading
import time
from datetime import UTC, datetime

from django.conf import settings
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

from services import advisor, geocode
from services import weather as wx
from services.analyze import analyze
from services.errors import AnalysisError
from services.risk import assess

from .serializers import AnalyzeSerializer, CurrentWeatherSerializer, ExplainSerializer, GeocodeQuerySerializer

_slots = threading.BoundedSemaphore(settings.MAX_CONCURRENT_ANALYSES)


class HealthView(APIView):
    throttle_scope = "health"

    def get(self, request):
        return Response({"status": "ok"})


class GeocodeView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        s = GeocodeQuerySerializer(data=request.query_params.dict())
        s.is_valid(raise_exception=True)
        return Response({"results": geocode.search(s.validated_data["q"])})


class AnalyzeView(APIView):
    throttle_scope = "analyze"

    def post(self, request):
        if int(request.META.get("CONTENT_LENGTH") or 0) > settings.MAX_BODY_BYTES:
            raise AnalysisError("payload_too_large", "Request body is too large.", 413)
        s = AnalyzeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if not _slots.acquire(timeout=2):  # bounded concurrency: shed load instead of piling up
            raise AnalysisError("busy", "The service is busy. Please retry in a moment.", 503)
        try:
            return Response(analyze(s.validated_data))
        finally:
            _slots.release()


class CurrentWeatherView(APIView):
    """Conditions at a point right now (hourly model data, cached <= 30 min). Works for any valid coordinate."""

    throttle_scope = "weather"

    def get(self, request):
        s = CurrentWeatherSerializer(data=request.query_params.dict())
        s.is_valid(raise_exception=True)
        d = s.validated_data
        key = (round(d["lat"], 2), round(d["lon"], 2))
        now = time.time()
        v = wx.values_at(wx.fetch({key}).get(key), now)
        a = assess(v["wind"], v["rain"], v["snow"], d["load_lb"])
        return Response(
            {
                "as_of": datetime.fromtimestamp(now, UTC).isoformat(),
                "wind_mph": v["wind"],
                "rain_in_hr": v["rain"],
                "snow_in_hr": v["snow"],
                "temp_f": v["temp"],
                "hazards": {"wind": a.wind, "rain": a.rain, "snow": a.snow},
                "risk": a.risk,
                "resolved": a.resolved,
            }
        )


class ExplainView(APIView):
    throttle_scope = "explain"

    def post(self, request):
        s = ExplainSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        summary = cache.get(f"an:{d['analysis_id']}")
        if summary is None:
            raise AnalysisError("analysis_expired", "This analysis has expired. Run the comparison again.", 404)
        units = dict(d["units"])
        bullets = advisor.deterministic(summary, units)
        out = {"ai_enabled": advisor.ai_enabled(), "advisor": bullets, "ai_text": None, "ai_error": None}
        if d["ai"]:
            try:
                out["ai_text"] = advisor.ask_llm(bullets, summary, units)
            except AnalysisError as exc:  # the rule-based summary is still returned
                out["ai_error"] = exc.code
        return Response(out)
