"""The only outbound HTTP path. Approved hosts only, HTTPS only, no redirects, bounded size,
retries limited to idempotent GETs on transient failures. Errors never carry URLs
(URLs contain coordinates) or credentials."""

import json
import random
import time
from urllib.parse import urlsplit

import requests
from django.conf import settings

RETRY_STATUS = {429, 502, 503, 504}


class ProviderError(Exception):
    pass


def _delay(attempt: int, retry_after: str | None) -> float:
    if retry_after and retry_after.isdigit():
        return min(5.0, float(retry_after))
    return min(5.0, 0.4 * 2**attempt) * (0.5 + random.random())  # nosec B311 - jitter only


def _check(url: str) -> dict:
    parts = urlsplit(url)
    scheme_ok = parts.scheme == "https" or (settings.DEBUG and parts.scheme == "http")
    if not scheme_ok or parts.hostname not in settings.PROVIDER_HOSTS:
        raise ProviderError("blocked host")
    return {"User-Agent": settings.PROVIDER_USER_AGENT, "Accept": "application/json"}


def _read(r) -> bytes:
    chunks, size = [], 0
    for chunk in r.iter_content(65536):
        size += len(chunk)
        if size > settings.PROVIDER_MAX_BYTES:
            raise ProviderError("response too large")
        chunks.append(chunk)
    return b"".join(chunks)


def get_json(url: str, params: dict, retries: int = 2, timeout: float | None = None, deadline: float | None = None):
    headers = _check(url)
    for attempt in range(retries + 1):
        per_try = timeout or settings.PROVIDER_TIMEOUT
        if deadline is not None:  # never run past the caller's overall time budget
            per_try = min(per_try, deadline - time.monotonic())
            if per_try < 0.5:
                raise ProviderError("deadline exceeded")
        try:
            with requests.get(url, params=params, headers=headers, timeout=per_try, allow_redirects=False, stream=True) as r:
                if r.status_code in RETRY_STATUS and attempt < retries:
                    time.sleep(_delay(attempt, r.headers.get("Retry-After")))
                    continue
                if r.status_code != 200:
                    raise ProviderError(f"status {r.status_code}")
                body = _read(r)
            return json.loads(body)
        except (requests.Timeout, requests.ConnectionError):
            if attempt < retries:
                time.sleep(_delay(attempt, None))
                continue
            raise ProviderError("unavailable") from None
        except ValueError:
            raise ProviderError("malformed response") from None
    raise ProviderError("unavailable")


def post_json(url: str, payload: dict, extra_headers: dict, timeout: float):
    """Single attempt (POST is not retried blindly). extra_headers may carry a credential; it is never logged."""
    headers = {**_check(url), **extra_headers}
    try:
        with requests.post(url, json=payload, headers=headers, timeout=timeout, allow_redirects=False, stream=True) as r:
            if r.status_code != 200:
                raise ProviderError(f"status {r.status_code}")
            body = _read(r)
        return json.loads(body)
    except (requests.Timeout, requests.ConnectionError):
        raise ProviderError("unavailable") from None
    except ValueError:
        raise ProviderError("malformed response") from None
