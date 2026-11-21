"""A seal verifies the whole companion on the server, so the worker's client must wait for it (BR-S02-22 / §48 addendum)."""
from __future__ import annotations

import io
import urllib.error

import pytest

from portal_api.services import research_current_source_retention as retention
from portal_api.services.research_current_source_retention import (
    SEAL_RETRY_BACKOFF_SECONDS,
    SEAL_TIMEOUT_SECONDS,
    ResearchCurrentSourceRetentionClient,
    ResearchCurrentSourceRetentionError,
)

SECRET = "x" * 32


class _Response:
    status = 200

    def __init__(self, body: bytes = b"{}") -> None:
        self._body = body

    def read(self, _n: int) -> bytes:
        return self._body

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_exc: object) -> None:
        return None


def _client(sleeps: list[float]) -> ResearchCurrentSourceRetentionClient:
    return ResearchCurrentSourceRetentionClient(endpoint="http://control.invalid", secret=SECRET, sleep=sleeps.append)


def _http_503(url: str) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(url, 503, "unavailable", {}, io.BytesIO(b"{}"))  # type: ignore[arg-type]


def test_a_seal_waits_the_ceiling_and_an_append_keeps_its_short_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, float]] = []

    def fake_urlopen(request, timeout):  # noqa: ANN001
        seen.append((request.full_url.rsplit("/artifacts/", 1)[1], timeout))
        return _Response()

    monkeypatch.setattr(retention.urllib.request, "urlopen", fake_urlopen)
    client = _client([])
    client._post("window-execution/batches", {"schema_version": "x"})
    client._post("window-execution/seal", {"schema_version": "x"})
    client._post("child-audit/seal", {"schema_version": "x"})
    assert seen == [
        ("window-execution/batches", 5.0),
        ("window-execution/seal", SEAL_TIMEOUT_SECONDS),
        ("child-audit/seal", SEAL_TIMEOUT_SECONDS),
    ]
    assert SEAL_TIMEOUT_SECONDS == 30.0


def test_a_seal_pauses_longer_between_resends_than_an_append(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    def flaky(request, timeout):  # noqa: ANN001
        calls["n"] += 1
        if calls["n"] <= 2:
            raise _http_503(request.full_url)
        return _Response()

    monkeypatch.setattr(retention.urllib.request, "urlopen", flaky)
    sleeps: list[float] = []
    _client(sleeps)._post("window-execution/seal", {"schema_version": "x"})
    assert sleeps == [SEAL_RETRY_BACKOFF_SECONDS * 1, SEAL_RETRY_BACKOFF_SECONDS * 2]

    calls["n"] = 0
    sleeps.clear()
    _client(sleeps)._post("window-execution/batches", {"schema_version": "x"})
    assert sleeps == [0.25 * 1, 0.25 * 2]


def test_a_seal_that_never_answers_still_fails_after_the_same_bounded_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    def always_503(request, timeout):  # noqa: ANN001
        raise _http_503(request.full_url)

    monkeypatch.setattr(retention.urllib.request, "urlopen", always_503)
    with pytest.raises(ResearchCurrentSourceRetentionError, match="unavailable after"):
        _client([])._post("window-execution/seal", {"schema_version": "x"})
