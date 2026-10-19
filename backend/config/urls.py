from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [path("api/v1/", include("api.urls"))]


def _json_error(status: int, code: str, message: str):
    return lambda request, *a, **k: JsonResponse({"error": {"code": code, "message": message}}, status=status)


handler404 = _json_error(404, "not_found", "Not found.")
handler500 = _json_error(500, "internal_error", "Unexpected server error.")
handler400 = _json_error(400, "bad_request", "The request could not be understood.")
