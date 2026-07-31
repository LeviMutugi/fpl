"""Shared HTTP helper.

Distinguishes "the network refused us" from "the source returned an error" so
each ingest run can log the honest status (`unreachable` vs `error`) instead of
collapsing everything into a generic failure.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import httpx

from ..app import config


class SourceUnreachable(RuntimeError):
    """No transport to the host: DNS, proxy denial, TLS, or timeout."""


class SourceError(RuntimeError):
    """Reached the host, but it answered with an error status."""


@dataclass(slots=True)
class Fetched:
    payload: Any
    url: str
    sha256: str


def fetch_json(url: str, *, headers: dict[str, str] | None = None, params: dict[str, Any] | None = None) -> Fetched:
    hdrs = {"User-Agent": config.FPL_USER_AGENT, "Accept": "application/json"}
    hdrs.update(headers or {})
    try:
        with httpx.Client(timeout=config.HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url, headers=hdrs, params=params)
    except httpx.HTTPError as exc:  # transport-level
        raise SourceUnreachable(f"{type(exc).__name__}: {exc}") from exc
    if resp.status_code >= 400:
        raise SourceError(f"HTTP {resp.status_code} from {url}: {resp.text[:200]}")
    try:
        payload = resp.json()
    except json.JSONDecodeError as exc:
        raise SourceError(f"non-JSON response from {url}") from exc
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return Fetched(payload=payload, url=url, sha256=hashlib.sha256(raw).hexdigest())


def sha256_of(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()
