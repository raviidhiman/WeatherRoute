"""Stateless API: no database, sessions, cookies or admin, so CSRF does not apply."""

import os
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

from config.envfile import load_env_file


def env_list(name: str, default: str = "") -> list[str]:
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_env_file(os.path.join(BASE_DIR, ".env"))  # local convenience; .env is git-ignored and real env vars take priority
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DEBUG is off.")
    SECRET_KEY = "dev-only-key-not-for-production"  # nosec B105

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):  # injected by Render
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])
if DEBUG:
    ALLOWED_HOSTS += ["localhost", "127.0.0.1", "testserver"]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must be set when DEBUG is off.")

INSTALLED_APPS = ["corsheaders", "rest_framework", "api"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
DATABASES: dict = {}
USE_TZ = True
TIME_ZONE = "UTC"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- CORS: explicit origins only ---
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173" if DEBUG else "")
CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"]
CORS_ALLOW_HEADERS = ["content-type"]
CORS_PREFLIGHT_MAX_AGE = 600

# --- Transport / header hardening ---
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/$"]  # platform health probe is plain HTTP
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
DATA_UPLOAD_MAX_MEMORY_SIZE = 16 * 1024
MAX_BODY_BYTES = 16 * 1024  # enforced explicitly in the view (DRF reads the stream directly)

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "analyze": os.environ.get("RATE_ANALYZE", "12/min"),
        "geocode": os.environ.get("RATE_GEOCODE", "60/min"),
        "health": "120/min",
        "weather": os.environ.get("RATE_WEATHER", "60/min"),
        "explain": os.environ.get("RATE_EXPLAIN", "10/min"),
    },
    "NUM_PROXIES": None if DEBUG else int(os.environ.get("NUM_PROXIES", "1")),
    "EXCEPTION_HANDLER": "api.errors.handler",
}
# locmem is per-process; production runs a single gunicorn worker (threads) so limits are global.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "OPTIONS": {"MAX_ENTRIES": 4000}}}

# --- Providers (free-first; operator-configured, never client-supplied) ---
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
PHOTON_URL = os.environ.get("PHOTON_URL", "https://photon.komoot.io/api/")
WEATHER_URL = os.environ.get("WEATHER_URL", "https://api.open-meteo.com/v1/forecast")
# Optional AI advisor: any OpenAI-compatible chat-completions provider. Off unless all three are set.
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "").rstrip("/")
AI_MODEL = os.environ.get("AI_MODEL", "")
AI_TIMEOUT = float(os.environ.get("AI_TIMEOUT", "20"))
PROVIDER_HOSTS = {urlsplit(u).hostname for u in (OSRM_BASE_URL, PHOTON_URL, WEATHER_URL, AI_BASE_URL or WEATHER_URL)}
PROVIDER_USER_AGENT = os.environ.get("PROVIDER_USER_AGENT", "WeatherRoute/1.0 (set-contact-in-env)")
PROVIDER_TIMEOUT = float(os.environ.get("PROVIDER_TIMEOUT", "10"))
PROVIDER_MAX_BYTES = 25 * 1024 * 1024

# --- Resource limits ---
MAX_CHECKPOINTS = 200  # per route
MAX_CONCURRENT_ANALYSES = 4
WEATHER_CONCURRENCY = 4
WEATHER_BUDGET_SECONDS = float(os.environ.get("WEATHER_BUDGET_SECONDS", "35"))
WEATHER_TIMEOUT = float(os.environ.get("WEATHER_TIMEOUT", "15"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
