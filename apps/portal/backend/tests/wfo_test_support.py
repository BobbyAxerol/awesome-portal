"""Shared W1 Delta-WFO test helpers: a WFO producer request and a local
Control API stand-in built on ``http.server`` (no mock transport)."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_PROFILE,
    DELTA_WFO_PROFILE_DIGEST,
    DELTA_WFO_PROFILE_ID,
)

INGEST_PREFIX = "/internal/research/progress/artifacts/"


def wfo_request(
    *,
    snapshot_id: str = "dss_0123456789abcdef0123456789abcdef",
    snapshot_content_hash: str = "a" * 64,
    run_id: str = "rrun_w1_wfo",
    job_id: str = "rjob_w1_wfo",
    worker_attempt_id: str = "rwa_w1_wfo",
    start: str = "2024-01-01T00:00:00Z",
    split_mode: str = "2024-01-08",
    end_exclusive: str = "2024-01-21T20:00:00Z",
) -> dict[str, Any]:
    requested_spec = {
        "schema_version": "research.requested-spec.v1",
        "alpha_binding": {
            "alpha_id": "delta-rsi-polynomial-alpha",
            "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_0",
        },
        "not_publishable": False,
        "strategy_id": "delta-rsi-polynomial-alpha",
        "execution_route": "signal_notional",
        "route_params": {},
        "data": {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": "1h"},
        "protocol": "advanced",
        "walk_forward": {
            "start": start,
            "end_exclusive": end_exclusive,
            "split_mode": split_mode,
            "frequency": "weekly",
            "window_mode": "expanding",
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "parameter_space_overrides": [],
        "optuna_trials": 3,
        "early_stopping": None,
        "random_seed": 42,
        "optimization_config": {},
        "client": {"engine_release_id": "er_quantbt_111", "config_digest": "b" * 64},
    }
    return {
        "strategy_id": "delta-rsi-polynomial-alpha",
        "dataset_id": "crypto-binance-1m",
        "protocol": "advanced",
        "research_contract_version": "research.run-request.v1",
        "run_id": run_id,
        "workspace_id": "w1-workspace",
        "job_id": job_id,
        "worker_attempt_id": worker_attempt_id,
        "lease_epoch": 1,
        "research": {
            "schema_version": "research.run-producer.v1",
            "client_intent_id": "w1-intent-wfo",
            "intent_kind": "NEW",
            "preflight_token": "rpft_w1_wfo",
            "requested_spec": requested_spec,
            "requested_spec_digest": "c" * 64,
            "effective_spec_digest": "d" * 64,
            "dataset_binding_digest": "e" * 64,
            "manifest_digest": "f" * 64,
            "snapshot_id": snapshot_id,
            "snapshot_content_hash": snapshot_content_hash,
            "alpha_id": "delta-rsi-polynomial-alpha",
            "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_0",
            "execution_adapter_id": "p04.delta-rsi.v1",
            "adapter_contract_digest": DELTA_WFO_PROFILE["adapter_contract_digest"],
            "execution_profile_id": DELTA_WFO_PROFILE_ID,
            "execution_profile_digest": DELTA_WFO_PROFILE_DIGEST,
            "work_digest": "2" * 64,
        },
    }


class FakeControlApi:
    """A real local HTTP server that records every private ingest request.

    ``faults`` maps an operation (``reserve``, ``seal``,
    ``current-source/batches``, ``current-source/seal``) to a list consumed
    per request: ``"drop"`` closes the connection without a response, an
    ``int`` answers with that HTTP status, ``None`` answers normally.
    """

    def __init__(self, *, on_request: Callable[[str, dict[str, Any]], None] | None = None) -> None:
        self.requests: list[tuple[str, bytes, dict[str, str]]] = []
        self.faults: dict[str, list[Any]] = {}
        self._on_request = on_request
        self._lock = threading.Lock()
        api = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args: Any) -> None:  # keep pytest output clean
                return

            def do_POST(self) -> None:  # noqa: N802 - http.server API
                length = int(self.headers.get("content-length", "0"))
                raw = self.rfile.read(length)
                path = self.path
                operation = path[len(INGEST_PREFIX):] if path.startswith(INGEST_PREFIX) else path
                with api._lock:
                    api.requests.append((operation, raw, {key.lower(): value for key, value in self.headers.items()}))
                    queue = api.faults.get(operation)
                    fault = queue.pop(0) if queue else None
                if fault == "drop":
                    self.close_connection = True
                    self.connection.shutdown(2)
                    return
                if isinstance(fault, int):
                    self.send_response(fault)
                    self.send_header("content-type", "application/json")
                    body = json.dumps({"code": "FAULT", "status": fault}).encode()
                    self.send_header("content-length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                body = json.loads(raw)
                if api._on_request is not None:
                    api._on_request(operation, body)
                answer = api.answer(operation, body)
                encoded = json.dumps(answer).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @staticmethod
    def answer(operation: str, body: dict[str, Any]) -> dict[str, Any]:
        if operation == "reserve":
            return {
                "schema_version": "research.artifact-reservation.v1",
                "artifact_id": body["artifact_id"],
                "artifact_revision": 1,
                "state": "WRITING",
                "replayed": False,
            }
        if operation == "seal":
            return {"schema_version": "research.artifact-seal.v1", "sealed": True, "replayed": False}
        if operation == "current-source/batches":
            return {"schema_version": "research.current-source-batch-ack.v1", "accepted": True}
        if operation == "current-source/seal":
            return {"schema_version": "research.current-source-seal-ack.v1", "sealed": True}
        if operation == "child-audit/batches":
            return {"schema_version": "research.child-audit-companion-batch-receipt.v1", "accepted": True,
                    "batch_ordinal": body["batch_ordinal"], "row_count": len(body["rows"]), "replayed": False}
        if operation == "child-audit/seal":
            return {"schema_version": "research.child-audit-companion-seal-receipt.v1", "sealed": True,
                    "companion_digest": body["companion_digest"], "replayed": False}
        if operation == "what-if/seal":
            return {"schema_version": "research.whatif-grid-sealed.v1", "sealed": True, "replayed": False}
        return {"events": []}

    @property
    def origin(self) -> str:
        host, port = self._server.server_address[:2]
        return f"http://{host}:{port}"

    def operations(self) -> list[str]:
        return [operation for operation, _, _ in self.requests]

    def bodies(self, operation: str) -> list[dict[str, Any]]:
        return [json.loads(raw) for op, raw, _ in self.requests if op == operation]

    def __enter__(self) -> "FakeControlApi":
        self._thread.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)
