import logging
import uuid

from django.core.exceptions import SuspiciousOperation
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler

from services.errors import AnalysisError

log = logging.getLogger(__name__)

GENERIC = {
    400: "bad_request",
    404: "not_found",
    405: "method_not_allowed",
    413: "payload_too_large",
    415: "unsupported_media_type",
    429: "rate_limited",
}
MESSAGES = {
    400: "The request could not be understood.",
    404: "Not found.",
    405: "Method not allowed.",
    413: "Request body is too large.",
    415: "Content-Type must be application/json.",
    429: "Too many requests. Please slow down.",
}


def _flatten(detail, prefix=""):
    if isinstance(detail, dict):
        out = {}
        for k, v in detail.items():
            out.update(_flatten(v, f"{prefix}{k}."))
        return out
    if isinstance(detail, list):
        first = detail[0] if detail else ""
        return _flatten(first, prefix) if isinstance(first, (dict, list)) else {prefix.rstrip("."): str(first)}
    return {prefix.rstrip("."): str(detail)}


def _body(code, message, rid, fields=None):
    err = {"code": code, "message": message, "request_id": rid}
    if fields:
        err["fields"] = fields
    return {"error": err}


def handler(exc, context):
    rid = uuid.uuid4().hex[:12]
    if isinstance(exc, AnalysisError):
        return Response(_body(exc.code, exc.message, rid), status=exc.status)
    if isinstance(exc, SuspiciousOperation):
        return Response(_body("bad_request", MESSAGES[400], rid), status=400)
    resp = drf_handler(exc, context)
    if resp is None:  # unexpected: log the type only (messages can embed user data), never leak details
        log.error("unhandled %s request_id=%s", type(exc).__name__, rid)
        return Response(_body("internal_error", "Unexpected server error.", rid), status=500)
    code = resp.status_code
    if isinstance(exc, exceptions.ValidationError):
        resp.data = _body("validation_error", "Some fields are invalid.", rid, _flatten(exc.detail))
    else:
        headers = {"Retry-After": resp.get("Retry-After")} if code == status.HTTP_429_TOO_MANY_REQUESTS and resp.get("Retry-After") else None
        resp = Response(_body(GENERIC.get(code, "error"), MESSAGES.get(code, "Request failed."), rid), status=code, headers=headers)
    return resp
