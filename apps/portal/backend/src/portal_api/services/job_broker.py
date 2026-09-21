"""Job broker port with in-memory and NATS JetStream adapters (U11 / BAR-08-BE2).

The worker depends on the port; NATS is one adapter. The in-memory adapter
drives deterministic redelivery/kill tests without a broker process.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Protocol


@dataclass(frozen=True, slots=True)
class JobMessage:
    subject: str
    payload: dict[str, Any]
    reply: str | None = None


class JobBroker(Protocol):
    async def subscribe(
        self, subject: str, handler: Callable[[JobMessage], Awaitable[None]]
    ) -> None: ...

    async def publish(self, subject: str, payload: dict[str, Any]) -> None: ...

    async def close(self) -> None: ...


class InMemoryJobBroker:
    """Deterministic in-process broker for tests and single-node smoke."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[Callable[[JobMessage], Awaitable[None]]]] = {}
        self.published: list[tuple[str, dict[str, Any]]] = []

    async def subscribe(
        self, subject: str, handler: Callable[[JobMessage], Awaitable[None]]
    ) -> None:
        self._handlers.setdefault(subject, []).append(handler)

    async def publish(self, subject: str, payload: dict[str, Any]) -> None:
        self.published.append((subject, payload))
        for subscription, handlers in self._handlers.items():
            if not _subject_matches(subscription, subject):
                continue
            for handler in handlers:
                await handler(JobMessage(subject=subject, payload=payload))

    async def close(self) -> None:
        self._handlers.clear()


class NatsJetStreamBroker:
    """NATS JetStream pull-consumer adapter (nats-py).

    Durable consumer: the worker acks only after the result is persisted or
    the claim lease is safely released. Redelivery idempotency lives in the
    attempt registry, not the broker.
    """

    def __init__(
        self,
        servers: list[str],
        *,
        stream: str = "QUANT_JOBS",
        consumer: str | None = "quant-worker-py",
    ) -> None:
        self._servers = servers
        self._stream = stream
        self._consumer = consumer
        self._nc: Any = None
        self._js: Any = None
        self._sub: Any = None
        self._task: asyncio.Task | None = None
        self._handlers: dict[str, list[Callable[[JobMessage], Awaitable[None]]]] = {}

    async def connect(self) -> None:
        import nats

        self._nc = await nats.connect(servers=self._servers)
        self._js = self._nc.jetstream()
        from nats.js.api import ConsumerConfig, StreamConfig

        try:
            await self._js.stream_info(self._stream)
        except Exception:
            await self._js.add_stream(
                config=StreamConfig(
                    name=self._stream,
                    subjects=["quant.run.requested.>"],
                    retention="workqueue",
                )
            )
        # A Portal API process that only publishes P10 work must not create a
        # durable pull consumer.  Only the actual worker needs one; this
        # avoids an idle consumer, duplicated delivery state and needless
        # JetStream resource retention on every API replica.
        if self._consumer is not None:
            try:
                await self._js.consumer_info(self._stream, self._consumer)
            except Exception:
                await self._js.add_consumer(
                    stream=self._stream,
                    config=ConsumerConfig(
                        durable_name=self._consumer,
                        ack_policy="explicit",
                    ),
                )

    async def subscribe(
        self, subject: str, handler: Callable[[JobMessage], Awaitable[None]]
    ) -> None:
        if self._consumer is None:
            raise RuntimeError("publisher-only NATS broker cannot subscribe")
        self._handlers.setdefault(subject, []).append(handler)
        if self._sub is None:
            self._sub = await self._js.pull_subscribe(
                f"quant.run.requested.>", durable=self._consumer
            )

        async def consume_loop() -> None:
            while True:
                messages = await self._sub.fetch(1, timeout=30)
                for message in messages:
                    payload = json.loads(message.data.decode("utf-8"))
                    for subscription, handlers in self._handlers.items():
                        if not _subject_matches(subscription, message.subject):
                            continue
                        for subscribed_handler in handlers:
                            await subscribed_handler(
                                JobMessage(subject=message.subject, payload=payload)
                            )
                    await message.ack()

        if self._task is None:
            self._task = asyncio.create_task(consume_loop())

    async def publish(self, subject: str, payload: dict[str, Any]) -> None:
        if self._js is None:
            raise RuntimeError("broker not connected")
        await self._js.publish(subject, json.dumps(payload).encode("utf-8"))

    async def close(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._nc is not None:
            await self._nc.drain()


def _subject_matches(subscription: str, subject: str) -> bool:
    """Minimal NATS-token matcher shared by real and in-memory adapters.

    P10 uses a distinct ``quant.run.requested.research`` subject while the
    historical worker remains on the exact legacy subject.  Keeping matching
    semantics identical in tests prevents an in-memory-only route from
    accidentally claiming a production consumer owns a message.
    """

    wanted = subscription.split(".")
    actual = subject.split(".")
    for index, token in enumerate(wanted):
        if token == ">":
            return index < len(actual)
        if index >= len(actual):
            return False
        if token != "*" and token != actual[index]:
            return False
    return len(actual) == len(wanted)


__all__ = ["InMemoryJobBroker", "JobBroker", "JobMessage", "NatsJetStreamBroker"]
