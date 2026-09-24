"""The P05 start gate tolerates Control API's DISPATCHED write racing the worker."""

from __future__ import annotations

import asyncio

from portal_api.workers.durable_worker import _await_start_acknowledged


class _Relay:
    def __init__(self, refusals: int) -> None:
        self.refusals = refusals
        self.calls = 0

    async def flush(self) -> bool:
        self.calls += 1
        return self.calls > self.refusals


def test_start_ack_waits_out_a_stale_lease_race() -> None:
    relay = _Relay(refusals=3)
    assert asyncio.run(_await_start_acknowledged(relay, window_seconds=2.0, retry_seconds=0.01)) is True
    assert relay.calls == 4


def test_start_ack_accepts_the_first_acknowledgement_without_waiting() -> None:
    relay = _Relay(refusals=0)
    assert asyncio.run(_await_start_acknowledged(relay, window_seconds=2.0, retry_seconds=0.01)) is True
    assert relay.calls == 1


def test_start_ack_fails_closed_when_the_lease_never_becomes_current() -> None:
    relay = _Relay(refusals=10_000)
    assert asyncio.run(_await_start_acknowledged(relay, window_seconds=0.05, retry_seconds=0.01)) is False
    assert relay.calls >= 2
