import math
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from rest_framework import serializers

from services.geo import haversine_mi, in_us
from services.units import load_to_lb

US_ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles"]
LOAD_LB_RANGE = (1.0, 200_000.0)  # resource/sanity bounds, not legal limits


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            extra = set(data) - set(self.fields)
            if extra:
                raise serializers.ValidationError({k: "Unknown field." for k in sorted(extra)})
        return super().to_internal_value(data)


class PointSerializer(StrictSerializer):
    label = serializers.CharField(max_length=120)
    lat = serializers.FloatField()
    lon = serializers.FloatField()

    def validate(self, v):
        if not (math.isfinite(v["lat"]) and math.isfinite(v["lon"])) or not in_us(v["lat"], v["lon"]):
            raise serializers.ValidationError("Location must be within the contiguous United States.")
        return v


class AnalyzeSerializer(StrictSerializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure_local = serializers.RegexField(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
    timezone = serializers.ChoiceField(US_ZONES)
    load_weight = serializers.FloatField()
    load_unit = serializers.ChoiceField(["lb", "kg"])
    checkpoint_interval = serializers.ChoiceField([10, 25, 50])
    hos = serializers.BooleanField(required=False, default=False)

    def validate_checkpoint_interval(self, v):
        return int(v)

    def validate(self, v):
        warnings = []
        # load
        w = v["load_weight"]
        lb = load_to_lb(w, v["load_unit"]) if math.isfinite(w) else math.nan
        if not LOAD_LB_RANGE[0] <= lb <= LOAD_LB_RANGE[1]:
            raise serializers.ValidationError({"load_weight": "Enter a weight between 1 and 200,000 lb (or the equivalent in kg)."})
        # locations
        o, d = v["origin"], v["destination"]
        if haversine_mi(o["lat"], o["lon"], d["lat"], d["lon"]) < 0.5:
            raise serializers.ValidationError({"destination": "Destination must differ from the origin."})
        # departure: resolve the user's local wall time in the chosen IANA zone (DST-aware)
        try:
            naive = datetime.strptime(v["departure_local"], "%Y-%m-%dT%H:%M")
        except ValueError:
            raise serializers.ValidationError({"departure_local": "Enter a valid date and time."}) from None
        zone = ZoneInfo(v["timezone"])
        local = naive.replace(tzinfo=zone)
        utc = local.astimezone(UTC)
        if utc.astimezone(zone).replace(tzinfo=None) != naive:
            raise serializers.ValidationError({"departure_local": "That local time does not exist (daylight-saving change). Pick another time."})
        if local.replace(fold=1).utcoffset() != local.utcoffset():
            warnings.append("Departure time is ambiguous (clocks repeat); the earlier occurrence was used.")
        now = datetime.now(UTC)
        if not now - timedelta(hours=1) <= utc <= now + timedelta(days=7):
            raise serializers.ValidationError({"departure_local": "Departure must be within the next 7 days."})
        return {
            "origin": dict(o),
            "destination": dict(d),
            "departure_utc": utc,
            "timezone": v["timezone"],
            "load_lb": lb,
            "interval_mi": v["checkpoint_interval"],
            "hos": v["hos"],
            "warnings": warnings,
        }


class GeocodeQuerySerializer(StrictSerializer):
    q = serializers.CharField(min_length=3, max_length=100)

    def validate_q(self, v):
        return "".join(ch for ch in v if ch.isprintable()).strip()


class UnitsSerializer(StrictSerializer):
    distance = serializers.ChoiceField(["mi", "km"])
    speed = serializers.ChoiceField(["mph", "kmh"])
    precip = serializers.ChoiceField(["in_per_hr", "mm_per_hr"])
    weight = serializers.ChoiceField(["lb", "kg"])


class ExplainSerializer(StrictSerializer):
    analysis_id = serializers.RegexField(r"^[0-9a-f]{32}$")
    units = UnitsSerializer()
    ai = serializers.BooleanField(required=False, default=False)


class CurrentWeatherSerializer(StrictSerializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    load_lb = serializers.FloatField(min_value=0, max_value=200_000, required=False, default=0)

    def validate(self, v):
        if not (math.isfinite(v["lat"]) and math.isfinite(v["lon"]) and math.isfinite(v["load_lb"])):
            raise serializers.ValidationError("Invalid coordinates.")
        return v
