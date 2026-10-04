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


def _w3_dr_receipt(run_dir: Path, exported, batches) -> dict:
    """W3 DR gate: every served number equals a direct recomputation from raw QuantBT output.

    Exact decimal equality against ``Decimal(str(float))`` of the engine's
    own parquet/JSON values; the only tolerance is 1e-12 on the derived fold
    path facts, which this test recomputes independently in float.
    """

    from decimal import Decimal

    stitched = pd.read_parquet(run_dir / "series" / "stitched.parquet")
    trials = pd.read_parquet(run_dir / "wfo" / "trials.parquet")
    selected = json.loads((run_dir / "selection" / "selected_params.json").read_text())
    fold_metrics = json.loads((run_dir / "wfo" / "selected_fold_metrics.v1.json").read_text())["fold_metrics"]
    rows: dict[str, list[dict]] = {}
    for batch in batches:
        rows.setdefault(batch.table_kind, []).extend(dict(row) for row in batch.rows)
    summary = exported.receipt.summary
    exact = lambda value: Decimal(str(value))  # noqa: E731

    initial, final = stitched["equity"].iloc[0], stitched["equity"].iloc[-1]
    assert Decimal(summary["metrics"]["initial_equity"]) == exact(initial)
    assert Decimal(summary["metrics"]["final_equity"]) == exact(final)
    assert Decimal(summary["metrics"]["max_drawdown_fraction"]) == min(exact(value) for value in stitched["drawdown"])
    assert Decimal(summary["metrics"]["net_return_fraction"]) == exact(final) / exact(initial) - 1

    served_trials = {row["sourceId"]: row["payload"] for row in rows["TRIAL"]}
    for record in trials.to_dict(orient="records"):
        payload = served_trials[str(record["trial_id"])]
        assert Decimal(payload["objective"]) == exact(record["objective"])
        assert {key: Decimal(value) for key, value in payload["parameters"].items()} == {
            key: exact(value) for key, value in json.loads(record["params_json"]).items()
        }
    assert summary["selection"]["trial_id"] == str(selected["trial_id"])
    assert Decimal(summary["selection"]["objective"]) == exact(selected["objective"])
    assert {key: Decimal(value) for key, value in summary["selection"]["parameters"].items()} == {
        key: exact(value) for key, value in selected["params"].items()
    }

    folds = []
    for row, metrics in zip(rows["FOLD"], fold_metrics, strict=True):
        facts = row["payload"]["fold_facts"]
        for key in ("oos_sharpe", "is_sharpe", "decay", "oos_trade_count"):
            assert Decimal(facts["oos_score"][key]) == exact(metrics[key]), key
        start = pd.Timestamp(row["payload"]["test_start_utc_ms"], unit="ms", tz="UTC")
        end = pd.Timestamp(row["payload"]["test_end_utc_ms"], unit="ms", tz="UTC")
        window = stitched.loc[(stitched.index >= start) & (stitched.index <= end)]
        base = float(stitched.loc[stitched.index < start, "equity"].iloc[-1])
        peak = window["equity"].cummax().clip(lower=base)
        recomputed = {
            "return_fraction": float(window["equity"].iloc[-1] / base - 1),
            "max_drawdown_fraction": float((window["equity"] / peak - 1).min()),
            "worst_return_fraction": float(window["returns"].min()),
        }
        for key, value in recomputed.items():
            assert abs(float(facts["oos_path"][key]) - value) <= 1e-12, key
        folds.append({
            "fold_id": row["sourceId"],
            "oos_sharpe": facts["oos_score"]["oos_sharpe"],
            "decay": facts["oos_score"]["decay"],
            "oos_trade_count": facts["oos_score"]["oos_trade_count"],
            **{key: facts["oos_path"][key] for key in recomputed},
            "recomputed": recomputed,
        })
    numbers = {
        "passport": dict(summary["metrics"]),
        "selection": {"trial_id": summary["selection"]["trial_id"], "objective": summary["selection"]["objective"]},
        "trials": {trial_id: payload["objective"] for trial_id, payload in served_trials.items()},
        "folds": folds,
        "claims": summary["source_facts"]["claims"],
    }
    expected = {
        "passport": {
            "initial_equity": str(exact(initial)),
            "final_equity": str(exact(final)),
            "max_drawdown_fraction": str(min(exact(value) for value in stitched["drawdown"])),
        },
        "selection": {
            "trial_id": str(selected["trial_id"]),
            "objective": str(exact(selected["objective"])),
            "parameters": {key: str(exact(value)) for key, value in selected["params"].items()},
        },
        "trials": {str(record["trial_id"]): str(exact(record["objective"])) for record in trials.to_dict(orient="records")},
        "folds": [
            {"fold_id": fold["fold_id"], **{key: str(exact(metrics[key])) for key in ("oos_sharpe", "decay", "oos_trade_count")}, **fold["recomputed"]}
            for fold, metrics in zip(folds, fold_metrics, strict=True)
        ],
    }
    return {"numbers": numbers, "expected": expected}


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
    # Current child capture is source-time evidence, not reconstructed from
    # this test's trial table. P05 must keep its exact byte hash after sealing.
    trace = exported.receipt.summary["source_facts"]["search"]["sampler_trace"]
    assert trace["state"] == "AVAILABLE"
    assert trace["recorded_trial_count"] == 3 and trace["omitted_trial_count"] == 0
    assert trace["capture_complete"] is True
    assert trace["studies"][0]["sampler_class"] == "TPESampler"
    assert trace["studies"][0]["source_study_id"] == "0"
    manifest = json.loads((retained.artifacts_dir / exported.candidate.artifact_id / "manifest.json").read_text())
    trace_document = next(document for document in manifest["documents"] if document["name"] == "source_sampler_public_trace")
    assert trace_document["sha256"] == trace["artifact_sha256"]
    assert trace_document["bytes"] == trace["size_bytes"]
    print("SAMPLER_REAL_HMD_RETAINED " + json.dumps(trace, sort_keys=True))
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
    dr = _w3_dr_receipt(source_root / run_id, exported, batches)
    print("W3_REAL_HMD_DR " + json.dumps(dr["numbers"], sort_keys=True))
    export_dir = os.getenv("PORTAL_W3_DR_EXPORT_DIR")
    if export_dir:
        # Opt-in hand-off to the Control API DR spec
        # (apps/control-api/test/research-w3-real-dr.spec.ts): the exact rows
        # the worker would POST, the seal summary, and the raw recomputation.
        Path(export_dir).mkdir(parents=True, exist_ok=True)
        (Path(export_dir) / "w3-real-hmd-dr.json").write_text(json.dumps({
            "run_id": run_id,
            "table_rows": {
                "OBSERVATION": exported.receipt.table_rows["observations"],
                "FOLD": exported.receipt.table_rows["folds"],
                "TRIAL": exported.receipt.table_rows["trials"],
                "CANDIDATE": exported.receipt.table_rows["candidates"],
                "SELECTION": exported.receipt.table_rows["selection"],
            },
            "manifest_digest": exported.receipt.manifest_digest,
            "source_transform_digest": exported.receipt.source_transform_digest,
            "summary": exported.receipt.summary,
            "batches": [
                {"table_kind": batch.table_kind, "batch_ordinal": batch.batch_ordinal, "batch_digest": batch.batch_digest, "rows": [dict(row) for row in batch.rows]}
                for batch in batches
            ],
            "expected": dr["expected"],
        }, sort_keys=True))

    # W5b (P17): the child's own account ledger, bar by bar, on real HMD.
    from test_current_source_w5b_replay import _assert_replay_ledger

    rows_by_kind: dict[str, list[dict]] = {}
    for batch in batches:
        rows_by_kind.setdefault(batch.table_kind, []).extend(dict(row) for row in batch.rows)
    replay = _assert_replay_ledger(ArtifactRepository(source_root), run_id, exported, rows_by_kind)
    print("W5B_REAL_HMD_REPLAY " + json.dumps(replay, sort_keys=True))
    replay_export = os.getenv("PORTAL_W5B_REPLAY_EXPORT_DIR")
    if replay_export:
        # Opt-in hand-off to the Control API replay spec
        # (apps/control-api/test/research-w5b-replay.spec.ts): every retained
        # row the worker would POST, with the seal facts, from the real child.
        Path(replay_export).mkdir(parents=True, exist_ok=True)
        (Path(replay_export) / "research-w5b-real-replay.fixture.json").write_text(json.dumps({
            "_provenance": (
                "W5b real-HMD export (apps/portal/backend/tests/test_research_wfo_real_hmd.py with "
                "PORTAL_W5B_REPLAY_EXPORT_DIR): BTCUSDT 1h 2026-06-01..07-15, first OOS 2026-07-01, weekly "
                "expanding, QuantBT 1.1.1 Delta signal-notional WFO through the P06 child, 3 trials, seed 42."
            ),
            "run_id": run_id,
            "manifest_digest": exported.receipt.manifest_digest,
            "source_transform_digest": exported.receipt.source_transform_digest,
            "table_rows": {
                "OBSERVATION": exported.receipt.table_rows["observations"],
                "FOLD": exported.receipt.table_rows["folds"],
                "TRIAL": exported.receipt.table_rows["trials"],
                "CANDIDATE": exported.receipt.table_rows["candidates"],
                "SELECTION": exported.receipt.table_rows["selection"],
            },
            "summary": exported.receipt.summary,
            "rows": rows_by_kind,
        }, sort_keys=True, separators=(",", ":")))

    assert result.n_folds >= 2
    assert result.trial_rows == 3
    assert exported.receipt.table_rows["folds"] >= 2
    assert exported.receipt.table_rows["trials"] == 3
    assert {batch.table_kind for batch in batches} == {"OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"}
    # CG-P06-03: the pinned cap must hold with at least 2x headroom.
    assert result.cpu_seconds <= 0.5 * DELTA_WFO_CHILD_LIMITS.cpu_seconds, measured
    assert result.elapsed_seconds <= 0.5 * DELTA_WFO_CHILD_LIMITS.wall_seconds, measured
