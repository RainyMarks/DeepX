from __future__ import annotations

import time
from typing import Protocol

import httpx


class ScholarlySource(Protocol):
    name: str

    def search(self, query: str, limit: int = 100) -> list[dict]: ...


RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def get_with_retry(
    client: httpx.Client,
    url: str,
    params: dict | None = None,
    attempts: int = 4,
    max_delay: float = 60.0,
) -> httpx.Response:
    """GET with exponential backoff for rate limits, server errors and dropped connections.

    A Retry-After longer than ``max_delay`` (e.g. an exhausted daily quota)
    is not waited out: the error is raised so the caller can record it.
    """
    for attempt in range(attempts):
        try:
            response = client.get(url, params=params)
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == attempts - 1:
                raise
            time.sleep(min(max_delay, 2.0 * 2**attempt))
            continue
        if response.status_code not in RETRYABLE_STATUS or attempt == attempts - 1:
            response.raise_for_status()
            return response
        try:
            delay = float(response.headers.get("retry-after", ""))
        except ValueError:
            delay = 2.0 * 2**attempt
        if delay > max_delay:
            response.raise_for_status()
        time.sleep(max(1.0, delay))
    raise RuntimeError("unreachable")
