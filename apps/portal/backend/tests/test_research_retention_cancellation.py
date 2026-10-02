from __future__ import annotations

import asyncio
import threading

import pytest

from portal_api.workers.durable_worker import _joined_retention_thread


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_retention_cancellation_fences_and_joins_before_cleanup(tmp_path):
    entered, release, settled = threading.Event(), threading.Event(), threading.Event()
    source = tmp_path / "source"
    source.write_bytes(b"immutable source")
    facts = []

    def retain(*, fence_validator, source):
        entered.set()
        assert release.wait(3), "test worker did not release bounded thread"
        try:
            assert source.read_bytes() == b"immutable source", "scratch retired before join"
            facts.append(fence_validator(object()))
            raise RuntimeError("expected cancellation fence refusal")
        finally:
            settled.set()

    async def own_and_cleanup():
        try:
            return await _joined_retention_thread(retain, fence_validator=lambda _: True, source=source)
        finally:
            assert settled.is_set(), "terminal transition/cleanup raced custody thread"
            source.unlink()

    task = asyncio.create_task(own_and_cleanup())
    try:
        async with asyncio.timeout(2):
            while not entered.is_set():
                await asyncio.sleep(0.001)
        task.cancel()
        await asyncio.sleep(0.01)
        assert not task.done() and source.exists()
        task.cancel()  # Repeated shutdown cancellation cannot bypass the join.
        await asyncio.sleep(0.01)
        assert not task.done() and source.exists()
    finally:
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert facts == [False]
    assert not source.exists()


@pytest.mark.anyio
async def test_retention_success_and_failure_preserve_original_fence():
    def retain(*, fence_validator, value):
        assert fence_validator("exact-fence")
        return value

    assert await _joined_retention_thread(retain, fence_validator=lambda v: v == "exact-fence", value=7) == 7

    def broken(*, fence_validator):
        raise ValueError("source refused")

    with pytest.raises(ValueError, match="source refused"):
        await _joined_retention_thread(broken, fence_validator=lambda _: True)
