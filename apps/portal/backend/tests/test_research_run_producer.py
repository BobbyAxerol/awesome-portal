from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from pathlib import Path

import httpx
import pandas as pd
import pytest

from portal_api.main import create_app
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.artifact_store import ContentAddressedArtifactStore
from portal_api.services.data_catalog import (
    DataFamily,
    QualityProfile,
    ReleaseManifestRef,
    SnapshotStore,
)
from portal_api.services.durable_runs import AttemptRegistry, RunIntent
from portal_api.services.job_broker import InMemoryJobBroker
from portal_api.services.research_progress import ResearchProgressJournal
from portal_api.services.research_run_producer import (
    ResearchRunProducerError,
    ResearchRunProducerExecutor,
)
from portal_api.services.research_supervisor import IsolatedResearchSupervisor
import portal_api.workers.durable_worker as durable_worker_module
from portal_api.workers.durable_worker import DurableQuantWorker


P04_PARAMETERS: dict[str, int | float] = {
    "window": 32,
    "rsi_l": 20,
    "signalLength": 9,
    "len_atr1": 10,
    "len_atr2": 42,
    "rvol": 1.6,
    "len_vol": 16,
    "slpercent": 1.3,
}


@pytest.fixture
def anyio_backend() -> str:
    """The P10 worker tests exercise asyncio broker/task semantics only.

    Running an additional Trio parametrisation does not add transport
    coverage here and is not supported by the namespace-isolated child test
    harness.  Pinning the backend also keeps the P11 crash-window proofs
    deterministic in CI and local shells.
    """

    return "asyncio"


def _signed_internal_principal(secret: str, *, methods: list[str]) -> str:
    """Build the exact short-lived private principal used only by this test."""

    payload = {
        "principalId": "p10-control-api",
        "username": "p10-control-api",
        "accessSubject": None,
        "accessEmail": None,
        "role": "ADMIN",
        "authnMethods": methods,
        "sessionId": "p10-session",
        "mustChangePassword": False,
        "issuedAt": "2026-09-21T00:00:00.000Z",
        "exp": int(time.time()) + 60,
        "policyVersion": "auth-policy-v1",
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")
    return f"{encoded}.{signature}"


def _family() -> DataFamily:
    return DataFamily(
        family_id="p10-candles",
        label="P10 test candles",
        kind="candle",
        schema_version="candle.v1",
        activated=True,
        release_manifest=ReleaseManifestRef(
            manifest_sha256="a" * 64,
            accepted_at="2026-09-21T00:00:00Z",
        ),
        quality=QualityProfile(max_gap_ratio=0.1, max_duplicate_rows=0),
    )


def _request(
    *,
    snapshot_id: str,
    snapshot_content_hash: str,
    run_id: str = "rrun_p10_real",
    job_id: str = "rjob_p10_real",
    worker_attempt_id: str = "rwa_p10_real",
) -> dict:
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
        "protocol": "three_window_decay",
        "windows": {
            "is": {"start": "2024-01-01T00:00:00Z", "end_exclusive": "2024-01-08T00:00:00Z"},
            "oos": {"start": "2024-01-08T00:00:00Z", "end_exclusive": "2024-01-15T00:00:00Z"},
            "holdout": {"start": "2024-01-15T00:00:00Z", "end_exclusive": "2024-01-22T00:00:00Z"},
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "parameter_space_overrides": [],
        "optuna_trials": 1,
        "early_stopping": None,
        "random_seed": None,
        "optimization_config": {},
        "client": {"engine_release_id": "er_quantbt_111", "config_digest": "b" * 64},
    }
    return {
        "strategy_id": "delta-rsi-polynomial-alpha",
        "dataset_id": "crypto-binance-1m",
        "protocol": "three_window_decay",
        "research_contract_version": "research.run-request.v1",
        "run_id": run_id,
        "workspace_id": "p10-workspace",
        "job_id": job_id,
        "worker_attempt_id": worker_attempt_id,
        "lease_epoch": 1,
        "research": {
            "schema_version": "research.run-producer.v1",
            "client_intent_id": "p10-intent-real",
            "intent_kind": "NEW",
            "preflight_token": "rpft_p10_real",
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
            "adapter_contract_digest": "1" * 64,
            "p04_parameters": P04_PARAMETERS,
            "work_digest": "2" * 64,
        },
    }


def _snapshot(tmp_path: Path):
    frame = pd.read_parquet(Path(__file__).parent / "fixtures" / "golden_market.parquet")
    store = SnapshotStore(tmp_path / "snapshots")
    identity, _ = store.register(
        frame=frame,
        family=_family(),
        lineage=("p10-test",),
        expected_frequency="1h",
    )
    return store, identity


def test_p10_t04_t13_real_snapshot_to_isolated_delta_to_receipt_has_no_holdout_or_scratch_leak(
    tmp_path: Path,
) -> None:
    """P10 runs a real P04 child but passes it only bounded IS/OOS tape."""

    snapshots, identity = _snapshot(tmp_path)
    market_root = tmp_path / "market-scratch"
    market_root.mkdir(mode=0o700)
    executor = ResearchRunProducerExecutor(
        snapshots=snapshots,
        supervisor=IsolatedResearchSupervisor(
            tmp_path / "child-scratch", allowed_market_root=market_root
        ),
        market_root=market_root,
    )
    payload = _request(
        snapshot_id=identity.snapshot_id,
        snapshot_content_hash=identity.content_hash,
    )
    # The worker's async wrapper delegates this exact bounded implementation
    # to a thread. Test the implementation synchronously so pytest does not
    # retain an unrelated default-executor thread after the real child exits.
    result = executor._execute_sync(
        ResearchRunProducerRequest.model_validate(payload),
        tmp_path / "engine-output",
    )

    assert result["status"] == "COMPLETED"
    config_path = tmp_path / "engine-output" / "rrun_p10_real" / "config" / "request.json"
    receipt_path = tmp_path / "engine-output" / "rrun_p10_real" / "research" / "p10-receipt.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert config["schema_version"] == "research.p10.run-config.v1"
    assert config["requested_spec"] == payload["research"]["requested_spec"]
    assert receipt["holdout_rows_exposed_to_child"] == 0
    assert receipt["input_scope"] == "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY"
    assert receipt["p04_parameters"] == P04_PARAMETERS
    assert receipt["engine"]["bars"] < identity.row_count

    # The sealed bundle is a future authorized read surface, not a copy of the
    # private Control-API-to-worker envelope.  Keep the user-reviewable spec
    # and immutable public digests, but prove opaque capability/fence/custody
    # facts cannot leak through either public JSON artifact (including nested
    # requested-spec values as the contract evolves).
    serialized_public_artifacts = "\n".join(
        json.dumps(document, sort_keys=True) for document in (config, receipt)
    )
    for private_key in (
        "preflight_token",
        "client_intent_id",
        "job_id",
        "worker_attempt_id",
        "lease_epoch",
        "snapshot_id",
        "snapshot_content_hash",
        "work_digest",
    ):
        assert private_key not in config
        assert private_key not in receipt

    for opaque_private_value in (
        payload["research"]["preflight_token"],
        payload["research"]["client_intent_id"],
        payload["job_id"],
        payload["worker_attempt_id"],
        payload["research"]["snapshot_id"],
        payload["research"]["snapshot_content_hash"],
        payload["research"]["work_digest"],
    ):
        assert opaque_private_value not in serialized_public_artifacts

    assert not list(market_root.rglob("*.parquet"))
    assert not list((tmp_path / "engine-output").rglob("*.parquet"))
    assert config_path.stat().st_mode & 0o777 == 0o600
    assert receipt_path.stat().st_mode & 0o777 == 0o600


def test_p10_t07_rejects_snapshot_hash_tampering_before_child_launch(tmp_path: Path) -> None:
    snapshots, identity = _snapshot(tmp_path)
    market_root = tmp_path / "market-scratch"
    market_root.mkdir(mode=0o700)
    executor = ResearchRunProducerExecutor(
        snapshots=snapshots,
        supervisor=IsolatedResearchSupervisor(
            tmp_path / "child-scratch", allowed_market_root=market_root
        ),
        market_root=market_root,
    )
    payload = _request(snapshot_id=identity.snapshot_id, snapshot_content_hash="0" * 64)
    with pytest.raises(ResearchRunProducerError, match="hash no longer matches"):
        executor._execute_sync(
            ResearchRunProducerRequest.model_validate(payload),
            tmp_path / "engine-output",
        )
    # The test owns the empty custody root; hash rejection must leave it empty
    # and must not create a staged tape or child-derived output below it.
    assert not list(market_root.iterdir())


@pytest.mark.anyio
async def test_p10_t11_t14_worker_uses_research_executor_only_and_cleans_attempt_temp(
    tmp_path: Path,
) -> None:
    broker = InMemoryJobBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    payload = _request(
        snapshot_id="dss_0123456789abcdef0123456789abcdef",
        snapshot_content_hash="a" * 64,
        run_id="rrun_p10_worker",
        job_id="rjob_p10_worker",
        worker_attempt_id="rwa_p10_worker",
    )
    generic_calls = 0
    research_calls = 0

    async def generic_executor(_request_json: dict, _run_id: str, _artifact_root: Path) -> dict:
        nonlocal generic_calls
        generic_calls += 1
        raise AssertionError("P10 must not use the generic legacy executor")

    async def research_executor(_request_json: dict, run_id: str, artifact_root: Path) -> dict:
        nonlocal research_calls
        research_calls += 1
        output = artifact_root / run_id
        output.mkdir(parents=True)
        (output / "receipt.json").write_text('{"p10":true}', encoding="utf-8")
        return {"status": "COMPLETED"}

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        executor=generic_executor,
        research_executor=research_executor,
    )
    await worker.start()
    await broker.publish(
        "quant.run.requested.research",
        {
            "schema_version": "research.run-producer-job.v1",
            "run_id": "rrun_p10_worker",
            "run_attempt_id": "rwa_p10_worker",
            "lease_epoch": 1,
            "request_json": payload,
        },
    )
    attempt = registry.attempt("rrun_p10_worker", "rwa_p10_worker")
    assert attempt is not None and attempt.status == "SUCCEEDED"
    assert research_calls == 1
    assert generic_calls == 0
    assert attempt.artifacts_sha256 is not None
    manifest = store.open_bundle("rrun_p10_worker", "rwa_p10_worker", attempt.artifacts_sha256)
    assert "receipt.json" in manifest["files"]
    assert not list(store.temp_dir("rrun_p10_worker", "rwa_p10_worker").iterdir())
    await worker.stop()


@pytest.mark.anyio
async def test_p10_t11_terminal_observation_loss_does_not_rewrite_a_sealed_success(
    tmp_path: Path,
) -> None:
    """P11 owns event durability; P10 must keep a committed bundle successful."""

    class TerminalEventUnavailableBroker(InMemoryJobBroker):
        async def publish(self, subject: str, payload: dict) -> None:
            if subject == "quant.run.succeeded":
                raise OSError("no durable terminal-event stream is configured")
            await super().publish(subject, payload)

    broker = TerminalEventUnavailableBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    payload = _request(
        snapshot_id="dss_0123456789abcdef0123456789abcdef",
        snapshot_content_hash="a" * 64,
        run_id="rrun_p10_terminal_loss",
        job_id="rjob_p10_terminal_loss",
        worker_attempt_id="rwa_p10_terminal_loss",
    )

    async def research_executor(_request_json: dict, run_id: str, artifact_root: Path) -> dict:
        output = artifact_root / run_id
        output.mkdir(parents=True)
        (output / "receipt.json").write_text('{"p10":true}', encoding="utf-8")
        return {"status": "COMPLETED"}

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        research_executor=research_executor,
    )
    await worker.start()
    await broker.publish(
        "quant.run.requested.research",
        {
            "schema_version": "research.run-producer-job.v1",
            "run_id": "rrun_p10_terminal_loss",
            "run_attempt_id": "rwa_p10_terminal_loss",
            "lease_epoch": 1,
            "request_json": payload,
        },
    )
    attempt = registry.attempt("rrun_p10_terminal_loss", "rwa_p10_terminal_loss")
    assert attempt is not None and attempt.status == "SUCCEEDED"
    assert attempt.artifacts_sha256 is not None
    assert not list(store.temp_dir("rrun_p10_terminal_loss", "rwa_p10_terminal_loss").iterdir())
    await worker.stop()


def _seed_p11_source_journal(
    *,
    registry: AttemptRegistry,
    store: ContentAddressedArtifactStore,
    run_id: str,
    attempt_id: str,
    terminal: bool,
) -> ResearchProgressJournal:
    """Build only durable P11 facts; never invoke an engine for recovery tests."""

    journal = ResearchProgressJournal(
        registry.root,
        run_id=run_id,
        attempt_id=attempt_id,
        lease_epoch=1,
    )
    journal.emit("run_started")
    if not terminal:
        return journal

    journal.emit("stage_started", {"stage": "S5"})
    temp = store.temp_dir(run_id, attempt_id)
    journal_path = temp / "research" / "progress-journal.ndjson"
    receipt_path = temp / "research" / "progress-receipt.json"
    journal_path.parent.mkdir(parents=True)
    journal_path.write_text('{"source":"test"}\n', encoding="utf-8")
    receipt_path.write_text('{"source":"test"}\n', encoding="utf-8")
    bundle = store.commit_bundle(
        run_id=run_id,
        attempt_id=attempt_id,
        temp_dir=temp,
        required_files=("research/progress-journal.ndjson", "research/progress-receipt.json"),
    )
    bundle_bytes = sum((temp / name).stat().st_size for name in bundle.files)
    journal.mark_mandatory_sealed(
        bundle_digest=bundle.bundle_sha256,
        bundle_bytes=bundle_bytes,
    )
    for name in ("research/progress-journal.ndjson", "research/progress-receipt.json"):
        journal.emit("artifact_writing", {"name": name})
        journal.emit("artifact_sealed", {
            "name": name,
            "size": str((temp / name).stat().st_size),
            "digest": bundle.files[name],
            "reader_href": None,
        })
    journal.emit("stage_completed", {"stage": "S5"})
    journal.emit("run_completed", {
        "usage": {
            "peak_rss_bytes": 0,
            "cpu_seconds": 0,
            "scratch_bytes": 0,
            "fd_peak": 0,
        }
    })
    return journal


@pytest.mark.anyio
async def test_p11_terminal_source_reconciles_local_attempt_without_reexecution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Crash after source terminal / before local ledger is a no-execute recovery."""

    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PROGRESS", "true")
    monkeypatch.setattr(
        durable_worker_module.ResearchProgressRelay,
        "from_environment",
        classmethod(lambda _cls, **_kwargs: None),
    )
    broker = InMemoryJobBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    run_id, attempt_id = "rrun_p11_crash", "rwa_p11_crash"
    payload = _request(
        snapshot_id="dss_0123456789abcdef0123456789abcdef",
        snapshot_content_hash="a" * 64,
        run_id=run_id,
        job_id="rjob_p11_crash",
        worker_attempt_id=attempt_id,
    )
    registry.create_run_intent(RunIntent(
        run_id=run_id,
        run_spec_sha256="a" * 64,
        workspace_id="p10-workspace",
        created_at="2026-09-21T00:00:00Z",
        payload=payload,
    ))
    registry.create_attempt(run_id, attempt_id=attempt_id)
    journal = _seed_p11_source_journal(
        registry=registry,
        store=store,
        run_id=run_id,
        attempt_id=attempt_id,
        terminal=True,
    )
    research_calls = 0

    async def research_executor(_request_json: dict, _run_id: str, _artifact_root: Path) -> dict:
        nonlocal research_calls
        research_calls += 1
        raise AssertionError("a terminal P11 source journal must not execute again")

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        research_executor=research_executor,
    )
    await worker.start()
    await broker.publish("quant.run.requested.research", {
        "schema_version": "research.run-producer-job.v1",
        "run_id": run_id,
        "run_attempt_id": attempt_id,
        "lease_epoch": 1,
        "request_json": payload,
    })
    attempt = registry.attempt(run_id, attempt_id)
    assert attempt is not None and attempt.status == "SUCCEEDED"
    assert attempt.artifacts_sha256 == journal.snapshot()["mandatory_bundle"]["digest"]
    assert research_calls == 0
    assert [subject for subject, _payload in broker.published].count("quant.run.succeeded") == 1
    await worker.stop()


@pytest.mark.anyio
async def test_p11_reclaimed_nonterminal_source_is_fenced_not_reexecuted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """P11 has no in-place retry semantics: a P12 retry needs a new attempt."""

    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PROGRESS", "true")
    monkeypatch.setattr(
        durable_worker_module.ResearchProgressRelay,
        "from_environment",
        classmethod(lambda _cls, **_kwargs: None),
    )
    broker = InMemoryJobBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    run_id, attempt_id = "rrun_p11_fence", "rwa_p11_fence"
    payload = _request(
        snapshot_id="dss_0123456789abcdef0123456789abcdef",
        snapshot_content_hash="a" * 64,
        run_id=run_id,
        job_id="rjob_p11_fence",
        worker_attempt_id=attempt_id,
    )
    registry.create_run_intent(RunIntent(
        run_id=run_id,
        run_spec_sha256="b" * 64,
        workspace_id="p10-workspace",
        created_at="2026-09-21T00:00:00Z",
        payload=payload,
    ))
    registry.create_attempt(run_id, attempt_id=attempt_id)
    journal = _seed_p11_source_journal(
        registry=registry,
        store=store,
        run_id=run_id,
        attempt_id=attempt_id,
        terminal=False,
    )
    research_calls = 0

    async def research_executor(_request_json: dict, _run_id: str, _artifact_root: Path) -> dict:
        nonlocal research_calls
        research_calls += 1
        raise AssertionError("a non-terminal reclaimed journal must not execute in place")

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        research_executor=research_executor,
    )
    await worker.start()
    await broker.publish("quant.run.requested.research", {
        "schema_version": "research.run-producer-job.v1",
        "run_id": run_id,
        "run_attempt_id": attempt_id,
        "lease_epoch": 1,
        "request_json": payload,
    })
    attempt = registry.attempt(run_id, attempt_id)
    assert attempt is not None and attempt.status == "LEASE_LOST"
    assert journal.snapshot()["status"] == "RUNNING"
    assert research_calls == 0
    await worker.stop()


@pytest.mark.anyio
async def test_p10_t14_missing_research_executor_never_falls_back_to_generic(tmp_path: Path) -> None:
    broker = InMemoryJobBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    payload = _request(
        snapshot_id="dss_0123456789abcdef0123456789abcdef",
        snapshot_content_hash="a" * 64,
        run_id="rrun_p10_missing",
        job_id="rjob_p10_missing",
        worker_attempt_id="rwa_p10_missing",
    )

    async def generic_executor(_request_json: dict, _run_id: str, _artifact_root: Path) -> dict:
        raise AssertionError("P10 must not invoke generic executor")

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        executor=generic_executor,
        research_executor=None,
    )
    await worker.start()
    await broker.publish(
        "quant.run.requested.research",
        {
            "schema_version": "research.run-producer-job.v1",
            "run_id": "rrun_p10_missing",
            "run_attempt_id": "rwa_p10_missing",
            "lease_epoch": 1,
            "request_json": payload,
        },
    )
    attempt = registry.attempt("rrun_p10_missing", "rwa_p10_missing")
    assert attempt is not None and attempt.status == "FAILED"
    assert attempt.failure_code == "CAPABILITY_MISMATCH"
    await worker.stop()


@pytest.mark.anyio
async def test_p10_t06_private_ingress_requires_exact_signed_authn_and_never_falls_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The P10 envelope shares /api/runs but cannot enter the legacy branch.

    This is an HTTP boundary proof, not merely a model-validation test: an
    unsigned browser request and a signed non-P10 principal both fail before
    publishing.  Only the deployment-bound Control-API principal with the
    dedicated authn marker can enqueue the isolated Research subject.
    """

    secret = "p10-test-principal-secret-0123456789"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_RUN_PRODUCER", "true")
    broker = InMemoryJobBroker()
    app = create_app(research_run_publisher=broker)
    payload = _request(
        snapshot_id="dss_0123456789abcdef0123456789abcdef",
        snapshot_content_hash="a" * 64,
        run_id="rrun_p10_private",
        job_id="rjob_p10_private",
        worker_attempt_id="rwa_p10_private",
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            unsigned = await client.post("/api/runs", json=payload)
            wrong_authn = await client.post(
                "/api/runs",
                json=payload,
                headers={
                    "x-portal-principal": _signed_internal_principal(
                        secret, methods=["portal_session"]
                    )
                },
            )
            accepted = await client.post(
                "/api/runs",
                json=payload,
                headers={
                    "x-portal-principal": _signed_internal_principal(
                        secret,
                        methods=["portal_session", "research_run_producer"],
                    )
                },
            )
    finally:
        app.state.run_manager.shutdown()

    assert unsigned.status_code == 401
    assert wrong_authn.status_code == 403
    assert accepted.status_code == 202
    assert accepted.json() == {
        "run_id": "rrun_p10_private",
        "status": "QUEUED",
        "producer": "research.run-producer.v1",
    }
    assert [(subject, message["run_id"]) for subject, message in broker.published] == [
        ("quant.run.requested.research", "rrun_p10_private")
    ]
