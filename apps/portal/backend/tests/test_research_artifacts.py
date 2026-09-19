"""P05 failure-injection, bounded-storage and real Delta bundle tests.

Most cases intentionally use small Arrow batches so each storage failure can
be injected deterministically.  ``V11-P05-DR`` additionally persists the
actual P04 QuantBT 1.1.1 Delta-RSI equity result, then reads it from a fresh
process after the compute object is gone.  P06 still owns the *durable child*
and whole-workload proof; this file must not pretend that a unit process is a
scheduler or an isolated worker.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import gc
import hashlib
from pathlib import Path
import resource
import pyarrow as pa
import pytest

from portal_api.services.research_artifacts import (
    ArtifactFaultInjected,
    ArtifactFence,
    ArtifactIdentity,
    ArtifactQuota,
    ArtifactReference,
    ArtifactRetentionPolicy,
    ArtifactSchemaRegistry,
    ArtifactTableSchema,
    ResearchArtifactError,
    ResearchArtifactStore,
    build_control_api_seal_request,
    grid_cell_to_evaluation_map,
)


_DIGEST = "a" * 64
_SECRET = b"p05-reader-cursor-secret-is-at-least-32-bytes"


def _schema() -> ArtifactTableSchema:
    return ArtifactTableSchema(
        table_kind="trial_index",
        schema_version="research.trial-index.v1",
        arrow_schema=pa.schema(
            [
                pa.field("trial_id", pa.string(), nullable=True),
                pa.field("seq", pa.int64(), nullable=False),
                pa.field("objective", pa.decimal128(20, 8), nullable=True),
                pa.field("objective_defined", pa.bool_(), nullable=False),
                pa.field("unit", pa.string(), nullable=False),
            ]
        ),
        sequence_column="seq",
        id_column="trial_id",
        units={"objective": "ratio"},
    )


def _registry() -> ArtifactSchemaRegistry:
    return ArtifactSchemaRegistry([_schema()])


def _batch(*, start: int = 0, rows: int = 3) -> pa.RecordBatch:
    schema = _schema().arrow_schema
    return pa.record_batch(
        [
            pa.array([None if index == 0 and start == 0 else f"trial-{start + index}" for index in range(rows)], type=pa.string()),
            pa.array([start + index * 7 + 1 for index in range(rows)], type=pa.int64()),
            pa.array(
                [None if index == 1 else Decimal(f"{1 + start + index}.12500000") for index in range(rows)],
                type=pa.decimal128(20, 8),
            ),
            pa.array([index != 1 for index in range(rows)], type=pa.bool_()),
            pa.array(["ratio"] * rows, type=pa.string()),
        ],
        schema=schema,
    )


def _rss_bytes() -> int:
    """Read current RSS without adding a test-only runtime dependency."""

    statm = Path("/proc/self/statm")
    if statm.is_file():
        pages = int(statm.read_text(encoding="ascii").split()[1])
        return pages * os.sysconf("SC_PAGE_SIZE")
    # ``ru_maxrss`` is a conservative fallback: macOS reports bytes, while
    # the Linux CI convention reports KiB.  It is only used for a bounded
    # regression threshold, never product telemetry.
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform == "darwin" else value * 1024)


def _stream_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _identity(artifact_id: str) -> ArtifactIdentity:
    return ArtifactIdentity(
        artifact_id=artifact_id,
        artifact_revision=1,
        workspace_id="ws_p05",
        run_id="run_p05",
        engine_release_id="quantbt_1_1_1",
        engine_build_ref="wheel-sha256-pinned",
        request_spec_digest=_DIGEST,
        effective_spec_digest="b" * 64,
        dataset_binding_digest="c" * 64,
    )


def _fence() -> ArtifactFence:
    return ArtifactFence("ws_p05", "run_p05", "worker_p05", 7)


def _writer(store: ResearchArtifactStore, artifact_id: str, *, active: dict[str, bool] | None = None, fault=None):
    active = active if active is not None else {"value": True}
    return store.begin_write(
        identity=_identity(artifact_id),
        fence=_fence(),
        schema_registry=_registry(),
        fence_validator=lambda _fence: active["value"],
        fault_hook=fault,
    )


def _seal(store: ResearchArtifactStore, artifact_id: str = "art_p05"):
    writer = _writer(store, artifact_id)
    writer.append_batch("trial_index", _batch())
    writer.write_small_document("selection", {"selected_trial_id": "trial-1", "objective": Decimal("1.125")})
    return writer.seal()


def test_p05_t01_round_trip_preserves_nullable_ids_units_decimals_and_worker_exit(tmp_path: Path) -> None:
    """Raw bounded output → Parquet → another process has the exact projection."""

    store = ResearchArtifactStore(tmp_path / "research-store")
    candidate = _seal(store)
    page = store.reader(cursor_secret=_SECRET).read_page(
        artifact_id=candidate.artifact_id,
        table_kind="trial_index",
        columns=("trial_id", "seq", "objective", "objective_defined", "unit"),
    )
    assert page.rows[0] == {
        "trial_id": None,
        "seq": 1,
        "objective": "1.12500000",
        "objective_defined": True,
        "unit": "ratio",
    }
    assert page.rows[1]["objective"] is None
    assert page.rows[1]["objective_defined"] is False
    assert page.rows[2]["seq"] == 15

    # A fresh process models the compute worker being gone.  It can only use
    # sealed disk bytes and a bounded reader, never writer memory.
    source_root = Path(__file__).parents[1] / "src"
    portal_root = Path(__file__).parents[2]
    script = """
import json, sys
from pathlib import Path
from portal_api.services.research_artifacts import ResearchArtifactStore
store = ResearchArtifactStore(Path(sys.argv[1]))
page = store.reader(cursor_secret=b'p05-reader-cursor-secret-is-at-least-32-bytes').read_page(
    artifact_id=sys.argv[2], table_kind='trial_index', limit=2
)
print(json.dumps({'rows': list(page.rows), 'next': bool(page.next_cursor)}))
"""
    completed = subprocess.run(
        [sys.executable, "-c", script, str(store.root), candidate.artifact_id],
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": os.pathsep.join((str(source_root), str(portal_root)))},
    )
    child = json.loads(completed.stdout)
    assert child["rows"][0]["trial_id"] is None
    assert child["rows"][0]["objective"] == "1.12500000"
    assert child["next"] is True

    # The Python writer has no DB credential. It can only hand P06 this exact,
    # bounded DTO, whose field names/types match the P05 Control API contract.
    seal_request = build_control_api_seal_request(store, candidate)
    assert seal_request["artifactId"] == candidate.artifact_id
    assert seal_request["workerAttemptId"] == "worker_p05"
    assert seal_request["leaseEpoch"] == 7
    assert seal_request["totalRows"] == 3
    assert seal_request["parts"] == [
        {
            "tableKind": "trial_index",
            "schemaVersion": "research.trial-index.v1",
            "partOrdinal": 1,
            "relativePath": "tables/trial_index/part-000001.parquet",
            "partDigest": seal_request["parts"][0]["partDigest"],
            "rowCount": 3,
            "byteCount": seal_request["parts"][0]["byteCount"],
            "sequenceMin": "1",
            "sequenceMax": "15",
        }
    ]


def test_v11_p05_dr_actual_p04_delta_bundle_survives_compute_exit(tmp_path: Path) -> None:
    """Persist P04's real pinned-engine result without retaining its output.

    The immutable Golden Delta fixture is the approved P04 technical bundle.
    This test intentionally uses the project venv (enforced by the P05 gate
    script) so ``QuantBTGateway`` proves the `quantbt-engine==1.1.1` public
    adapter instead of silently using the pool's historical 1.0.8 environment.
    """

    from golden_fixture import GOLDEN_PARAMS, MARKET_PATH, generate_golden_signals, load_golden
    from portal_api.adapters.quantbt import QUANTBT_ENGINE_VERSION, QuantBTGateway

    market, _golden, metadata = load_golden()
    signal = generate_golden_signals(market)["pos_weight"]
    endpoint = QuantBTGateway().signal_notional_endpoint(
        initial_capital=20_000,
        leverage=3,
        alloc_per_trade=2_000,
        fee_rate=0.0005,
        use_funding=False,
    )
    result = endpoint.backtest(data=market, signal=signal)
    report = result.full_report()
    assert report["final_equity"] == pytest.approx(20_589.74597203475)
    assert report["num_trades"] == 8

    schema = ArtifactTableSchema(
        table_kind="delta_equity_curve",
        schema_version="research.delta-equity-curve.v1",
        arrow_schema=pa.schema(
            [
                pa.field("bar_id", pa.string(), nullable=False),
                pa.field("bar_utc_ms", pa.int64(), nullable=False),
                pa.field("equity", pa.float64(), nullable=False),
                pa.field("position_weight", pa.float64(), nullable=False),
            ]
        ),
        sequence_column="bar_utc_ms",
        id_column="bar_id",
        units={"equity": "account_currency", "position_weight": "ratio"},
    )
    params_digest = hashlib.sha256(
        json.dumps(GOLDEN_PARAMS, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    identity = ArtifactIdentity(
        artifact_id="art_p05_delta_bundle",
        artifact_revision=1,
        workspace_id="ws_p05",
        run_id="run_p05_delta",
        engine_release_id="er_quantbt_111",
        engine_build_ref=f"quantbt-engine-{QUANTBT_ENGINE_VERSION}",
        request_spec_digest=params_digest,
        effective_spec_digest=params_digest,
        dataset_binding_digest=_stream_sha256(MARKET_PATH),
    )
    fence = ArtifactFence("ws_p05", "run_p05_delta", "worker_p05_delta", 1)
    store = ResearchArtifactStore(tmp_path / "research-store")
    writer = store.begin_write(
        identity=identity,
        fence=fence,
        schema_registry=ArtifactSchemaRegistry([schema]),
        fence_validator=lambda current: current == fence,
    )
    utc_ms = [int(timestamp.value // 1_000_000) for timestamp in result.equity.index]
    batch = pa.record_batch(
        [
            pa.array([timestamp.isoformat() for timestamp in result.equity.index], type=pa.string()),
            pa.array(utc_ms, type=pa.int64()),
            pa.array(result.equity.to_numpy(dtype=float), type=pa.float64()),
            pa.array(signal.to_numpy(dtype=float), type=pa.float64()),
        ],
        schema=schema.arrow_schema,
    )
    writer.append_batch("delta_equity_curve", batch)
    writer.write_small_document(
        "delta_run_evidence",
        {
            "engine_version": QUANTBT_ENGINE_VERSION,
            "fixture": metadata["fixture"],
            "kernel_sha256": metadata["kernel_sha256"],
            "report": {key: value.item() if hasattr(value, "item") else value for key, value in report.items()},
        },
    )
    candidate = writer.seal()

    # The child has no engine/result object.  It discovers only sealed bytes
    # through the bounded reader and keeps one page in memory at a time.
    del batch, signal, result, endpoint, market
    gc.collect()
    source_root = Path(__file__).parents[1] / "src"
    portal_root = Path(__file__).parents[2]
    script = """
import json, sys
from pathlib import Path
from portal_api.services.research_artifacts import ResearchArtifactStore
store = ResearchArtifactStore(Path(sys.argv[1]))
reader = store.reader(cursor_secret=b'p05-reader-cursor-secret-is-at-least-32-bytes')
cursor = None
count = 0
first = last = None
while True:
    page = reader.read_page(artifact_id=sys.argv[2], table_kind='delta_equity_curve', cursor=cursor, limit=200)
    if page.rows:
        first = page.rows[0] if first is None else first
        last = page.rows[-1]
        count += len(page.rows)
    if page.next_cursor is None:
        break
    cursor = page.next_cursor
print(json.dumps({'count': count, 'first': first, 'last': last}))
"""
    completed = subprocess.run(
        [sys.executable, "-c", script, str(store.root), candidate.artifact_id],
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": os.pathsep.join((str(source_root), str(portal_root)))},
    )
    persisted = json.loads(completed.stdout)
    assert persisted["count"] == 500
    assert persisted["first"]["bar_utc_ms"] == 1_704_067_200_000
    assert persisted["last"]["equity"] == pytest.approx(report["final_equity"])
    assert store.reader(cursor_secret=_SECRET).inspect(candidate.artifact_id).total_rows == 500


def test_p05_t02_t07_batches_and_reservations_are_byte_bounded(tmp_path: Path) -> None:
    store = ResearchArtifactStore(
        tmp_path / "research-store",
        quota=ArtifactQuota(max_batch_bytes=32, max_buffered_bytes=64, max_staging_bytes=1_024),
    )
    writer = _writer(store, "art_p05_bounds")
    with pytest.raises(ResearchArtifactError, match="BACKPRESSURE"):
        writer.append_batch("trial_index", _batch(rows=3))
    assert writer.buffered_bytes == 0
    assert not list(store.artifacts_dir.iterdir())
    # A rejected input leaves only the exact random scratch directory for the
    # lease-aware recovery lane; it never builds an in-memory queue.
    assert len(store.reconcile()["staging"]) == 1
    writer.abort()
    assert store.reconcile()["staging"] == ()


@pytest.mark.parametrize("fault_point", ["before_manifest_fsync", "after_manifest_fsync"])
def test_p05_t03_pre_rename_crash_remains_recoverable_staging(tmp_path: Path, fault_point: str) -> None:
    def fault(point: str) -> None:
        if point == fault_point:
            raise ArtifactFaultInjected(point)

    store = ResearchArtifactStore(tmp_path / "research-store")
    writer = _writer(store, f"art_p05_{fault_point}", fault=fault)
    writer.append_batch("trial_index", _batch())
    with pytest.raises(ArtifactFaultInjected):
        writer.seal()
    report = store.reconcile()
    assert report["unregistered"] == ()
    assert len(report["staging"]) == 1


def test_p05_t03_post_rename_candidate_is_not_sealed_without_control_api_registration(tmp_path: Path) -> None:
    def fault(point: str) -> None:
        if point == "after_rename_before_register":
            raise ArtifactFaultInjected(point)

    store = ResearchArtifactStore(tmp_path / "research-store")
    writer = _writer(store, "art_p05_after_rename", fault=fault)
    writer.append_batch("trial_index", _batch())
    with pytest.raises(ArtifactFaultInjected):
        writer.seal()
    report = store.reconcile(registered_artifact_ids=())
    assert report["unregistered"] == ("art_p05_after_rename",)
    # Bytes are inspectable for recovery, but filesystem sealing is not the
    # database authority's durable `SEALED` transition.
    assert store.reader(cursor_secret=_SECRET).inspect("art_p05_after_rename").artifact_id == "art_p05_after_rename"


def test_p05_t04_same_input_digest_uses_independent_random_staging(tmp_path: Path) -> None:
    store = ResearchArtifactStore(tmp_path / "research-store")
    first = _writer(store, "art_p05_writer_a")
    second = _writer(store, "art_p05_writer_b")
    assert first.staging_dir != second.staging_dir
    assert first.staging_dir.parent == second.staging_dir.parent
    first.append_batch("trial_index", _batch())
    second.append_batch("trial_index", _batch())
    one = first.seal()
    two = second.seal()
    assert one.artifact_id != two.artifact_id
    assert store.reader(cursor_secret=_SECRET).inspect(one.artifact_id).manifest_digest != ""
    assert store.reader(cursor_secret=_SECRET).inspect(two.artifact_id).manifest_digest != ""


def test_p05_t05_missing_or_corrupt_part_never_becomes_sealed(tmp_path: Path) -> None:
    store = ResearchArtifactStore(tmp_path / "research-store")
    candidate = _seal(store, "art_p05_corrupt")
    part = next((store.artifacts_dir / candidate.artifact_id / "tables").rglob("*.parquet"))
    with part.open("r+b") as handle:
        handle.seek(0)
        handle.write(b"BAD!")
        handle.flush()
        os.fsync(handle.fileno())
    with pytest.raises(ResearchArtifactError, match="CORRUPT"):
        store.reader(cursor_secret=_SECRET).inspect(candidate.artifact_id)
    report = store.reconcile(registered_artifact_ids=(candidate.artifact_id,))
    assert report["corrupt"] == (candidate.artifact_id,)


def test_p05_t06_stale_fence_cannot_seal(tmp_path: Path) -> None:
    store = ResearchArtifactStore(tmp_path / "research-store")
    active = {"value": True}
    writer = _writer(store, "art_p05_stale", active=active)
    writer.append_batch("trial_index", _batch())
    active["value"] = False
    with pytest.raises(ResearchArtifactError, match="FENCE_REJECTED"):
        writer.seal()
    assert not (store.artifacts_dir / "art_p05_stale").exists()


def test_p05_t08_large_export_streams_and_cleans_only_its_own_temp_file(tmp_path: Path) -> None:
    store = ResearchArtifactStore(tmp_path / "research-store")
    writer = _writer(store, "art_p05_export")
    for offset in range(0, 20_000, 1_000):
        writer.append_batch("trial_index", _batch(start=offset, rows=1_000))
    candidate = writer.seal()
    before = _rss_bytes()
    export = store.reader(cursor_secret=_SECRET).create_export(artifact_id=candidate.artifact_id)
    exported_bytes = sum(len(chunk) for chunk in export)
    after = _rss_bytes()
    assert exported_bytes > 0
    assert not export.path.exists()
    # Native Arrow/zip allocator allowance remains materially below the 20k
    # row payload; this catches accidental read-all export regressions.
    assert after - before < 96 * 1024 * 1024


def test_p05_t09_t10_t13_retention_keeps_durable_refs_without_dataset_copies(tmp_path: Path) -> None:
    now = datetime.now(UTC)
    decision = ArtifactRetentionPolicy.decide(
        retention_class="EPHEMERAL_DIAGNOSTIC",
        eligible_after=now - timedelta(seconds=1),
        references=(ArtifactReference("ACTIVE_LEASE", "lease_1", now + timedelta(minutes=1)),),
        now=now,
    )
    assert decision.collectable is False and decision.reason == "PINNED_BY_ACTIVE_LEASE"
    for kind in ("CHILD_RUN", "EXPOSURE", "RELEASE_CANDIDATE", "SELECTION", "VERIFICATION"):
        assert ArtifactRetentionPolicy.decide(
            retention_class="EPHEMERAL_DIAGNOSTIC",
            eligible_after=now - timedelta(seconds=1),
            references=(ArtifactReference(kind, f"ref_{kind.lower()}"),),
            now=now,
        ).collectable is False
    assert ArtifactRetentionPolicy.decide(
        retention_class="EPHEMERAL_DIAGNOSTIC",
        eligible_after=now - timedelta(seconds=1),
        references=(),
        now=now,
    ).collectable is True

    store = ResearchArtifactStore(tmp_path / "research-store")
    _seal(store, "art_p05_parent")
    before = sorted(path.name for path in store.artifacts_dir.iterdir())
    # Child/evidence relationships are immutable metadata references.  They do
    # not call copytree or create a second data directory.
    _ = ArtifactReference("CHILD_RUN", "child_run_1")
    assert sorted(path.name for path in store.artifacts_dir.iterdir()) == before
    # A zero-byte manifest cache forces eviction; durable logical pins above
    # remain policy facts rather than cache entries.
    store.reader(cursor_secret=_SECRET, manifest_cache_bytes=1).read_page(
        artifact_id="art_p05_parent", table_kind="trial_index", limit=1
    )


def test_p05_t11_grid_mapping_is_deduplicated_and_t12_cursor_handles_noncontiguous_sequence(tmp_path: Path) -> None:
    cells = [
        {"cell_id": f"cell_{index:02d}", "effective_config": {"window": index % 9, "seed": 7}}
        for index in range(81)
    ]
    mapping = grid_cell_to_evaluation_map(cells)
    assert len(mapping) == 9
    assert sum(len(cell_ids) for cell_ids in mapping.values()) == 81

    store = ResearchArtifactStore(tmp_path / "research-store")
    candidate = _seal(store, "art_p05_cursor")
    reader = store.reader(cursor_secret=_SECRET)
    first = reader.read_page(artifact_id=candidate.artifact_id, table_kind="trial_index", limit=1)
    assert first.rows[0]["seq"] == 1 and first.rows[0]["trial_id"] is None
    assert first.next_cursor is not None
    second = reader.read_page(
        artifact_id=candidate.artifact_id,
        table_kind="trial_index",
        cursor=first.next_cursor,
        limit=1,
    )
    assert second.rows[0]["seq"] == 8
    with pytest.raises(ResearchArtifactError, match="CURSOR_INVALID"):
        reader.read_page(
            artifact_id=candidate.artifact_id,
            table_kind="trial_index",
            cursor=first.next_cursor + "tampered",
            limit=1,
        )
