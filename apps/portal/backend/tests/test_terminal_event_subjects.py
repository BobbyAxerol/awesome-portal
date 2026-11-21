"""The JetStream stream retains only `quant.run.requested.>`; the worker's terminal events (`quant.run.succeeded` / `quant.run.failed`) match no stream and
have no subscriber. A broker that says it does not cover a subject is not asked to publish it (no failing publish, no traceback per run); every other broker
publishes exactly as before (see test_durable_worker)."""

import logging
from pathlib import Path

import pytest

from portal_api.services.artifact_store import ContentAddressedArtifactStore
from portal_api.services.durable_runs import AttemptRegistry
from portal_api.services.job_broker import InMemoryJobBroker, NatsJetStreamBroker, nats_subject_matches
from portal_api.workers.durable_worker import DurableQuantWorker


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.parametrize(
    ("pattern", "subject", "expected"),
    [
        ("quant.run.requested.>", "quant.run.requested.research", True),
        ("quant.run.requested.>", "quant.run.requested.a.b", True),
        ("quant.run.requested.>", "quant.run.requested", False),
        ("quant.run.requested.>", "quant.run.succeeded", False),
        ("quant.run.*", "quant.run.failed", True),
        ("quant.run.*", "quant.run.failed.extra", False),
        ("quant.run.requested", "quant.run.requested", True),
        ("quant.>", "quant", False),
    ],
)
def test_nats_wildcards(pattern: str, subject: str, expected: bool) -> None:
    assert nats_subject_matches(pattern, subject) is expected


def test_the_stream_covers_work_requests_but_not_terminal_events() -> None:
    broker = NatsJetStreamBroker(["nats://unused.invalid:4222"])
    assert broker.covers("quant.run.requested.research") is True
    assert broker.covers("quant.run.succeeded") is False
    assert broker.covers("quant.run.failed") is False


class _UncoveredBroker(InMemoryJobBroker):
    def covers(self, subject: str) -> bool:
        return False


class _RefusingBroker(InMemoryJobBroker):
    """Would fail like JetStream does for a subject no stream retains."""

    async def publish(self, subject: str, payload: dict) -> None:
        raise OSError("nats: no response from stream")


def _worker(broker: InMemoryJobBroker, tmp_path: Path) -> DurableQuantWorker:
    return DurableQuantWorker(
        broker=broker,
        registry=AttemptRegistry(tmp_path / "runs"),
        artifact_store=ContentAddressedArtifactStore(tmp_path / "artifacts"),
        executor=lambda *args, **kwargs: {"status": "COMPLETED"},
    )


@pytest.mark.anyio
async def test_an_uncovered_terminal_event_is_skipped_with_an_info_line_not_a_warning(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    broker = _UncoveredBroker()
    worker = _worker(broker, tmp_path)
    with caplog.at_level(logging.INFO):
        await worker._publish_terminal_event("quant.run.succeeded", {"run_id": "run_1"})
    assert broker.published == []
    assert [record.levelno for record in caplog.records if "terminal worker notification" in record.getMessage()] == [logging.INFO]
    assert not any(record.exc_info for record in caplog.records)


@pytest.mark.anyio
async def test_a_covered_or_unspecified_broker_still_publishes_and_still_tolerates_loss(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    plain = InMemoryJobBroker()
    await _worker(plain, tmp_path)._publish_terminal_event("quant.run.succeeded", {"run_id": "run_2"})
    assert plain.published == [("quant.run.succeeded", {"run_id": "run_2"})]
    with caplog.at_level(logging.WARNING):
        await _worker(_RefusingBroker(), tmp_path)._publish_terminal_event("quant.run.failed", {"run_id": "run_3"})
    assert any("durable state remains authoritative" in record.getMessage() for record in caplog.records)
