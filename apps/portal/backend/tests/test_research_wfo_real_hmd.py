"""W1 opt-in real-HMD proof: the Delta WFO profile through the real P06 child.

BTCUSDT 1h 2026-06-01..2026-07-15, first OOS 2026-07-01, weekly expanding,
3 trials, seed 42 -- executed by the namespace-isolated child under
``DELTA_WFO_CHILD_LIMITS`` (cpu 120 s / wall 240 s), then exported to RS-02
P05 tables and paged into Control API-sized batches locally (no HTTP, no DB).
Read-only against ``HISTORICAL_MARKET_DATA_ROOT``.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    HistoricalMarketDataProvider,
    MarketDataQuery,
    load_historical_data_runtime,
)
from portal_api.domain.research_delta_wfo_profile import DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter,
    iter_current_source_retention_batches,
    signal_notional_current_source_admission,
)
from portal_api.services.research_artifacts import ArtifactFence, ArtifactIdentity, ResearchArtifactStore
from portal_api.services.research_current_source_retention import MAX_INGEST_BODY_BYTES, encode_ingest_body
from portal_api.services.research_supervisor import (
    DELTA_WFO_CHILD_LIMITS,
    DeltaWfoChildReceipt,
    IsolatedResearchSupervisor,
)


pytestmark = pytest.mark.skipif(
    os.getenv("PORTAL_RUN_HMD_REAL_SMOKE") != "1",
    reason="external-data-unavailable: opt in with PORTAL_RUN_HMD_REAL_SMOKE=1",
)

START = pd.Timestamp("2026-06-01T00:00:00Z")
FIRST_OOS = pd.Timestamp("2026-07-01T00:00:00Z")
END = pd.Timestamp("2026-07-15T00:00:00Z")


def _ms(value: pd.Timestamp) -> int:
    return int(value.value // 1_000_000)


def test_w1_real_hmd_delta_wfo_child_within_half_the_cap(tmp_path: Path) -> None:
    runtime = load_historical_data_runtime(Path(os.environ["HISTORICAL_MARKET_DATA_ROOT"]))
    market = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb").load(
        MarketDataQuery(
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
            symbol="BTCUSDT",
            timeframe="1h",
            start=START,
            end_exclusive=END,
        )
    )
    assert len(market.frame) >= 1_000  # 44 days of 1h bars
    market_root = tmp_path / "market"
    market_root.mkdir(mode=0o700)
    tape = market_root / "btcusdt_1h_wfo.parquet"
    market.frame.to_parquet(tape)
    os.chmod(tape, 0o600)

    run_id = "rrun_w1_real_hmd"
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=market_root)
    result = supervisor.run_delta_wfo(
        DeltaWfoChildReceipt(
            job_id="rjob_w1_real_hmd",
            run_id=run_id,
            worker_attempt_id="rwa_w1_real_hmd",
            lease_epoch=1,
            market_path=tape,
            artifact_root=tmp_path / "p05",
            execution_profile_id=DELTA_WFO_PROFILE_ID,
            execution_profile_digest=DELTA_WFO_PROFILE_DIGEST,
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
            symbol="BTCUSDT",
            data_start_utc_ms=_ms(START),
            data_end_exclusive_utc_ms=_ms(END),
            first_oos_utc_ms=_ms(FIRST_OOS),
        ),
        limits=DELTA_WFO_CHILD_LIMITS,
    )
    measured = {
        "child_cpu_seconds": round(result.cpu_seconds, 3),
        "child_wall_seconds": round(result.elapsed_seconds, 3),
        "child_peak_rss_bytes": result.peak_rss_bytes,
        "cpu_cap_seconds": DELTA_WFO_CHILD_LIMITS.cpu_seconds,
        "wall_cap_seconds": DELTA_WFO_CHILD_LIMITS.wall_seconds,
        "bars": result.bars,
        "n_folds": result.n_folds,
        "trial_rows": result.trial_rows,
        "output_files": result.output_files,
        "output_bytes": result.output_bytes,
    }

    source_root = tmp_path / "source"
    shutil.copytree(result.output_root / run_id, source_root / run_id)
    retained = ResearchArtifactStore(tmp_path / "retained")
    fence = ArtifactFence(workspace_id="ws-w1", run_id=run_id, worker_attempt_id="rwa_w1_real_hmd", lease_epoch=1)
    exported = CurrentSourceArtifactAdapter(
        source_artifacts=ArtifactRepository(source_root),
        retained_artifacts=retained,
    ).export_advanced_walkforward(
        run_id=run_id,
        identity=ArtifactIdentity(
            artifact_id="rart_w1_real_hmd",
            artifact_revision=1,
            workspace_id="ws-w1",
            run_id=run_id,
            engine_release_id="quantbt-engine-1.1.1",
            engine_build_ref="9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
            request_spec_digest="c" * 64,
            effective_spec_digest="d" * 64,
            dataset_binding_digest=market.content_hash if len(market.content_hash) == 64 else "e" * 64,
        ),
        fence=fence,
        admission=signal_notional_current_source_admission(),
        fence_validator=lambda candidate: candidate == fence,
    )
    batches = list(iter_current_source_retention_batches(
        retained_artifacts=retained,
        receipt=exported.receipt,
        cursor_secret=os.urandom(32),
    ))
    largest_body = 0
    for batch in batches:
        assert 1 <= len(batch.rows) <= 200
        body = encode_ingest_body({
            "workspace_id": "ws-w1",
            "run_id": run_id,
            "job_id": "rjob_w1_real_hmd",
            "worker_attempt_id": "rwa_w1_real_hmd",
            "lease_epoch": 1,
            "artifact_id": "rart_w1_real_hmd",
            "schema_version": "research.current-source-batch.v1",
            "artifact_revision": 1,
            "manifest_digest": exported.receipt.manifest_digest,
            "source_transform_digest": exported.receipt.source_transform_digest,
            "table_kind": batch.table_kind,
            "batch_ordinal": batch.batch_ordinal,
            "batch_digest": batch.batch_digest,
            "rows": [dict(row) for row in batch.rows],
        })
        assert len(body) <= min(MAX_INGEST_BODY_BYTES, 1024 * 1024)
        largest_body = max(largest_body, len(body))
    measured.update({
        "table_rows": dict(exported.receipt.table_rows),
        "batches": len(batches),
        "largest_batch_body_bytes": largest_body,
    })
    print("\nW1_REAL_HMD_MEASURED " + json.dumps(measured, sort_keys=True))

    assert result.n_folds >= 2
    assert result.trial_rows == 3
    assert exported.receipt.table_rows["folds"] >= 2
    assert exported.receipt.table_rows["trials"] == 3
    assert {batch.table_kind for batch in batches} == {"OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"}
    # CG-P06-03: the pinned cap must hold with at least 2x headroom.
    assert result.cpu_seconds <= 0.5 * DELTA_WFO_CHILD_LIMITS.cpu_seconds, measured
    assert result.elapsed_seconds <= 0.5 * DELTA_WFO_CHILD_LIMITS.wall_seconds, measured
