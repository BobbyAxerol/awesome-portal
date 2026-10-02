"""Synthetic installed-result unit custody; no backtest/runtime evidence."""
from __future__ import annotations

import copy
import dataclasses
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pytest
from quantbt.core.results import BacktestResultV2

from portal_api.services import research_fixed_replay as replay
from portal_api.services.research_artifacts import ResearchArtifactStore
from portal_api.services.research_retained_receipt import ResearchRetainedReceiptClient, ResearchRetainedReceiptError


def actual_source(count=408):
    index = pd.date_range("2026-01-01", periods=count, freq="h", tz="UTC")
    close = pd.Series(100 + np.arange(count) / 10, index=index)
    market = pd.DataFrame({"open": close, "high": close + 2, "low": close - 2,
        "close": close + .1, "volume": (100 + np.arange(count)).astype(float)}, index=index)
    equity = pd.Series(1000 + np.arange(count) * 2 + np.sin(np.arange(count)) * 20, index=index)
    equity.iloc[:8] += 10_000  # full-child peaks must not change OOS drawdown
    returns = equity.pct_change().fillna(0)
    result = BacktestResultV2(equity=equity, returns=returns,
        positions=pd.DataFrame({"Position_BTCUSDT": [0.5 if i % 2 else -0.25 for i in range(count)]}, index=index),
        closes=pd.DataFrame({"Close_BTCUSDT": market.close.copy()}, index=index), symbols=["BTCUSDT"], initial_capital=500)
    start = int(index[8].value // 1_000_000)
    end = int((index[-1] + pd.Timedelta(hours=1)).value // 1_000_000)
    return result, market, start, end


def capture(tmp_path, count=408):
    result, market, start, end = actual_source(count)
    source = replay.capture_fixed_replay(result=result, market=market, output_directory=tmp_path,
        oos_start_utc_ms=start, oos_end_exclusive_utc_ms=end)
    return source, result, market


def request():
    return SimpleNamespace(workspace_id="ws_fixed", run_id="rrun_fixed", job_id="rjob_fixed",
        worker_attempt_id="rwa_fixed", lease_epoch=3,
        research=SimpleNamespace(alpha_version_id="av_fixed", adapter_contract_digest="a" * 64,
            requested_spec_digest="b" * 64, effective_spec_digest="c" * 64, dataset_binding_digest="d" * 64,
            requested_spec={"data": {"symbol": "BTCUSDT"}},
            execution_profile_id="p04.fixed-qualification.v1", execution_profile_digest=None))


def receipt(source):
    req = request()
    return {"schema_version": "research.p10.delta-qualification-receipt.v1", "run_id": req.run_id,
        "requested_spec_digest": req.research.requested_spec_digest,
        "effective_spec_digest": req.research.effective_spec_digest,
        "dataset_binding_digest": req.research.dataset_binding_digest,
        "fixed_replay_source": source, "engine": {"bars": 408, "final_equity": 1831.234}}


def private_client(monkeypatch, calls):
    client = ResearchRetainedReceiptClient(endpoint="http://control-api:4000", secret="fixed-replay-test-secret")

    def post(operation, body):
        calls.append((operation, body))
        if operation == "reserve":
            return {"schema_version": "research.artifact-reservation.v1", "artifact_id": body["artifact_id"],
                "artifact_revision": 1, "state": "WRITING"}
        if operation == "seal":
            return {"schema_version": "research.artifact-seal.v1", "sealed": True}
        if operation == "fixed-replay/batches":
            return {"schema_version": "research.fixed-replay-companion-batch-receipt.v1", "state": "ACCEPTED",
                "batch_ordinal": body["batch_ordinal"], "row_count": len(body["rows"])}
        assert operation == "fixed-replay/seal"
        return {"schema_version": "research.fixed-replay-companion-seal-receipt.v1", "state": "SEALED",
            "companion_digest": body["companion_digest"]}

    monkeypatch.setattr(client, "_post", post)
    return client


def test_capture_exact_full_oos_values_and_all_three_hash_domains(tmp_path):
    source, result, market = capture(tmp_path, count=409)
    rows = [row for batch in replay.iter_parquet_rows(tmp_path / replay.FILE_NAME) for row in batch]
    assert source["row_count"] == len(rows) == 401
    assert source["normalized_rows_sha256"] == hashlib.sha256(replay.canonical_rows_json(rows)).hexdigest()
    assert source["file_sha256"] == hashlib.sha256((tmp_path / replay.FILE_NAME).read_bytes()).hexdigest()
    assert len(replay.canonical_rows_json(source)) < 2048
    assert [row["source_ordinal"] for row in rows] == list(range(401))
    assert [len(batch) for batch in replay.iter_parquet_rows(tmp_path / replay.FILE_NAME)] == [200, 200, 1]
    assert pq.ParquetFile(tmp_path / replay.FILE_NAME).metadata.num_row_groups == 3
    eq = result.equity.iloc[8:]
    actual_dd = (eq - eq.cummax()) / eq.cummax()
    for row, at in zip(rows, eq.index, strict=True):
        assert float(row["equity"]) == result.equity.loc[at]
        assert float(row["return_fraction"]) == result.returns.loc[at]
        assert float(row["drawdown_fraction"]) == pytest.approx(actual_dd.loc[at], abs=1e-15)
        assert row["positions"] == {"BTCUSDT": replay.decimal_text(result.positions.loc[at, "Position_BTCUSDT"])}
        assert all(float(row[name]) == market.loc[at, name] for name in ("open", "high", "low", "close", "volume"))
        assert not set(row) & {"orders", "fills", "trades", "signal"}
    assert rows[0]["drawdown_fraction"] == "0"
    replay.verify_fixed_replay_file(tmp_path / replay.FILE_NAME, source)
    destination = tmp_path / "copied.parquet"
    replay.copy_fixed_replay_file(tmp_path / replay.FILE_NAME, destination, source)
    assert destination.read_bytes() == (tmp_path / replay.FILE_NAME).read_bytes()
    with pytest.raises(FileExistsError):
        replay.copy_fixed_replay_file(tmp_path / replay.FILE_NAME, destination, source)


def test_row_cap_typed_absence_does_not_truncate_or_write(tmp_path):
    source, _, _ = capture(tmp_path, count=20_009)
    assert source["state"] == "NOT_PUBLISHED" and source["reason_code"] == "FIXED_REPLAY_ROW_LIMIT_EXCEEDED"
    assert not list(tmp_path.iterdir())


def test_file_cap_returns_absence_before_unchanged_rlimit_and_cleans_only_partial(tmp_path, monkeypatch):
    monkeypatch.setattr(replay, "MAX_BYTES", 512)
    sentinel = tmp_path / "unrelated"
    sentinel.touch()
    source, _, _ = capture(tmp_path)
    assert source["state"] == "NOT_PUBLISHED" and source["reason_code"] == "FIXED_REPLAY_FILE_LIMIT_EXCEEDED"
    assert list(tmp_path.iterdir()) == [sentinel]


@pytest.mark.parametrize("missing", ["volume", "open", "high", "low", "close"])
def test_missing_market_field_has_no_substitute(tmp_path, missing):
    result, market, start, end = actual_source()
    source = replay.capture_fixed_replay(result=result, market=market.drop(columns=[missing]), output_directory=tmp_path,
        oos_start_utc_ms=start, oos_end_exclusive_utc_ms=end)
    assert source["reason_code"] == "FIXED_REPLAY_MARKET_FIELDS_UNAVAILABLE"
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("bad", [float("nan"), float("inf")])
def test_nonfinite_volume_is_absent_not_zero(tmp_path, bad):
    result, market, start, end = actual_source()
    market.iloc[9, market.columns.get_loc("volume")] = bad
    source = replay.capture_fixed_replay(result=result, market=market, output_directory=tmp_path,
        oos_start_utc_ms=start, oos_end_exclusive_utc_ms=end)
    assert source["state"] == "NOT_PUBLISHED"


@pytest.mark.parametrize("fault", ["alignment", "holdout", "ordinal", "nonfinite", "positions", "closes", "substituted_market", "fake"])
def test_source_custody_errors_fail_closed(tmp_path, fault):
    result, market, start, end = actual_source()
    if fault == "alignment":
        result = dataclasses.replace(result, returns=result.returns.rename(index={result.equity.index[0]: result.equity.index[0] - pd.Timedelta(seconds=1)}))
    elif fault == "holdout":
        end = int(result.equity.index[-1].value // 1_000_000)
    elif fault == "ordinal":
        market = market.iloc[::-1]
    elif fault == "nonfinite":
        result.equity.iloc[10] = float("nan")
    elif fault == "positions":
        result.positions.columns = ["inferred_signal"]
    elif fault == "closes":
        result.closes.columns = ["wrong_symbol"]
    elif fault == "substituted_market":
        market.iloc[10, market.columns.get_loc("close")] += .25
    else:
        result = SimpleNamespace()
    with pytest.raises(ValueError):
        replay.capture_fixed_replay(result=result, market=market, output_directory=tmp_path,
            oos_start_utc_ms=start, oos_end_exclusive_utc_ms=end)
    assert not (tmp_path / replay.FILE_NAME).exists()


@pytest.mark.parametrize("substituted", [False, True])
def test_pinned_native_default_prefix_fixture_keeps_actual_label_and_exact_price_parity(tmp_path, substituted):
    result, market, start, end = actual_source(count=10)
    result = dataclasses.replace(result, symbols=["DEFAULT"],
        positions=result.positions.rename(columns={"Position_BTCUSDT": "Position_DEFAULT"}),
        closes=result.closes.rename(columns={"Close_BTCUSDT": "Close_DEFAULT"}))
    assert isinstance(result, BacktestResultV2)
    assert list(result.closes.columns) == ["Close_DEFAULT"]
    if substituted:
        market.iloc[8, market.columns.get_loc("close")] += .25
        with pytest.raises(ValueError, match="actual consumed engine closes"):
            replay.capture_fixed_replay(result=result, market=market, output_directory=tmp_path,
                oos_start_utc_ms=start, oos_end_exclusive_utc_ms=end)
        assert not list(tmp_path.iterdir())
        return
    source = replay.capture_fixed_replay(result=result, market=market, output_directory=tmp_path,
        oos_start_utc_ms=start, oos_end_exclusive_utc_ms=end)
    rows = [row for batch in replay.iter_parquet_rows(tmp_path / replay.FILE_NAME) for row in batch]
    assert all(set(row["positions"]) == {"DEFAULT"} for row in rows)
    assert source["row_count"] == 2


@pytest.mark.parametrize("fault", ["bytes", "hash", "count", "time", "schema"])
def test_source_file_validation_rejects_all_custody_mismatches(tmp_path, fault):
    source, _, _ = capture(tmp_path)
    source = copy.deepcopy(source)
    if fault == "bytes":
        with (tmp_path / replay.FILE_NAME).open("ab") as handle:
            handle.write(b"tamper")
    elif fault == "hash":
        source["normalized_rows_sha256"] = "0" * 64
    elif fault == "count":
        source["row_count"] -= 1
    elif fault == "time":
        source["first_observed_utc_ms"] += 1
    else:
        source["raw_rows"] = []
    with pytest.raises(ValueError):
        replay.verify_fixed_replay_file(tmp_path / replay.FILE_NAME, source)


def test_p05_retains_exact_rows_and_replays_same_seal_without_mutation(tmp_path, monkeypatch):
    work = tmp_path / "work"; work.mkdir()
    source, _, _ = capture(work, count=409)
    calls = []
    client = private_client(monkeypatch, calls)
    root = tmp_path / "durable"
    req = request()
    digest = client.retain(request=req, receipt=receipt(source), artifact_root=root,
        fence_validator=lambda fence: fence.lease_epoch == 3, fixed_replay_path=work / replay.FILE_NAME)
    assert [op for op, _ in calls] == ["reserve", "seal", "fixed-replay/batches", "fixed-replay/batches", "fixed-replay/batches", "fixed-replay/seal"]
    batches = [body for op, body in calls if op == "fixed-replay/batches"]
    assert [len(body["rows"]) for body in batches] == [200, 200, 1]
    original_rows = [row for batch in replay.iter_parquet_rows(work / replay.FILE_NAME) for row in batch]
    assert [row for body in batches for row in body["rows"]] == original_rows
    store = ResearchArtifactStore(root / "research-retained")
    manifest, loaded = store._load_and_verify_manifest(calls[0][1]["artifact_id"], verify_parts=True)
    assert loaded == digest
    fixed = next(table for table in manifest["tables"] if table["table_kind"] == "fixed_replay")
    assert fixed["schema_version"] == "research.fixed-replay-table.v1" and fixed["rows"] == 401
    assert len(fixed["parts"]) == 3 and all(part["sha256"] != source["file_sha256"] for part in fixed["parts"])
    for body in [*batches, calls[-1][1]]:
        assert hashlib.sha256(body["artifact_manifest_json"].encode()).hexdigest() == digest
        assert json.loads(body["run_receipt_json"])["fixed_replay_source"] == source
        assert body["companion_digest"] == hashlib.sha256(replay.canonical_rows_json(body["manifest"])).hexdigest()
        assert body["manifest"]["execution_profile_digest"] is None
        assert body["manifest"]["market_symbol"] == "BTCUSDT"
        assert len(replay.canonical_rows_json(body)) <= 1024 * 1024
    before = (store.artifacts_dir / calls[0][1]["artifact_id"] / "manifest.json").read_bytes()
    # Existing immutable P05 custody can replay after raw child bytes retired.
    assert client.retain(request=req, receipt=receipt(source), artifact_root=root,
        fence_validator=lambda fence: True) == digest
    assert (store.artifacts_dir / calls[0][1]["artifact_id"] / "manifest.json").read_bytes() == before
    conflicting = receipt(source); conflicting["fixed_replay_source"] = copy.deepcopy(source)
    conflicting["fixed_replay_source"]["file_sha256"] = "0" * 64
    with pytest.raises(ResearchRetainedReceiptError, match="exact attempt receipt"):
        client.retain(request=req, receipt=conflicting, artifact_root=root, fence_validator=lambda fence: True)


def test_fresh_source_absence_seals_without_fixed_table_or_batches(tmp_path, monkeypatch):
    source = replay.unavailable_source("FIXED_REPLAY_ROW_LIMIT_EXCEEDED", start=10, end=20)
    calls = []
    client = private_client(monkeypatch, calls)
    client.retain(request=request(), receipt=receipt(source), artifact_root=tmp_path,
        fence_validator=lambda fence: True)
    assert [op for op, _ in calls] == ["reserve", "seal", "fixed-replay/seal"]
    assert calls[1][1]["total_rows"] == 1
    assert calls[-1][1]["manifest"]["source"] == source


def test_fresh_available_without_source_file_never_claims_p05_rows(tmp_path, monkeypatch):
    work = tmp_path / "work"; work.mkdir()
    source, _, _ = capture(work)
    client = private_client(monkeypatch, [])
    with pytest.raises(ResearchRetainedReceiptError, match="requires verified source bytes"):
        client.retain(request=request(), receipt=receipt(source), artifact_root=tmp_path / "durable",
            fence_validator=lambda fence: True)


def test_companion_rechecks_live_fence_and_does_not_seal_stale_batch(tmp_path, monkeypatch):
    work = tmp_path / "work"; work.mkdir()
    source, _, _ = capture(work)
    calls = []
    client = private_client(monkeypatch, calls)
    with pytest.raises(ResearchRetainedReceiptError, match="companion retention failed"):
        client.retain(request=request(), receipt=receipt(source), artifact_root=tmp_path / "durable",
            fixed_replay_path=work / replay.FILE_NAME,
            fence_validator=lambda fence: not any(op == "fixed-replay/batches" for op, _ in calls))
    assert [op for op, _ in calls] == ["reserve", "seal", "fixed-replay/batches"]


@pytest.mark.parametrize("profile", ["p04.fixed-qualification.v1", "p17.imported-signal-notional.v1"])
def test_pinned_fixed_profile_manifest_exactly_binds_private_ingress(tmp_path, monkeypatch, profile):
    from portal_api.domain.research_imported_alpha_profile import IMPORTED_ALPHA_PROFILE_DIGEST

    source = replay.unavailable_source("FIXED_REPLAY_SOURCE_UNAVAILABLE", start=10, end=20)
    req = request()
    req.research.execution_profile_id = profile
    req.research.execution_profile_digest = None if profile.startswith("p04") else IMPORTED_ALPHA_PROFILE_DIGEST
    calls = []
    client = private_client(monkeypatch, calls)
    client.retain(request=req, receipt=receipt(source), artifact_root=tmp_path,
        fence_validator=lambda fence: True)
    assert calls[-1][1]["manifest"]["execution_profile_id"] == profile
    assert calls[-1][1]["manifest"]["execution_profile_digest"] == req.research.execution_profile_digest
    assert calls[-1][1]["manifest"]["market_symbol"] == req.research.requested_spec["data"]["symbol"]


@pytest.mark.parametrize("ack", ["batch", "seal"])
def test_private_incompatible_ack_fails_closed(tmp_path, monkeypatch, ack):
    work = tmp_path / "work"; work.mkdir()
    source, _, _ = capture(work, count=9)
    calls = []
    client = private_client(monkeypatch, calls)
    post = client._post

    def bad(operation, body):
        value = post(operation, body)
        if operation == ("fixed-replay/batches" if ack == "batch" else "fixed-replay/seal"):
            value["schema_version"] = "wrong"
        return value

    monkeypatch.setattr(client, "_post", bad)
    with pytest.raises(ResearchRetainedReceiptError, match="companion retention failed"):
        client.retain(request=request(), receipt=receipt(source), artifact_root=tmp_path / "durable",
            fixed_replay_path=work / replay.FILE_NAME, fence_validator=lambda fence: True)


@pytest.mark.parametrize("bad", ["changed-imported-digest", "unadmitted-profile", "p04-with-digest"])
def test_changed_profile_fails_before_external_reservation(tmp_path, monkeypatch, bad):
    req = request()
    if bad == "changed-imported-digest":
        req.research.execution_profile_id = "p17.imported-signal-notional.v1"
        req.research.execution_profile_digest = "0" * 64
    elif bad == "unadmitted-profile":
        req.research.execution_profile_id = "unapproved.generic"
    else:
        req.research.execution_profile_digest = "0" * 64
    calls = []
    client = private_client(monkeypatch, calls)
    source = replay.unavailable_source("FIXED_REPLAY_SOURCE_UNAVAILABLE", start=10, end=20)
    with pytest.raises(ResearchRetainedReceiptError, match="custody validation"):
        client.retain(request=req, receipt=receipt(source), artifact_root=tmp_path, fence_validator=lambda fence: True)
    assert calls == []


def test_normal_receipt_core_and_enrichment_budgets_are_unchanged(tmp_path):
    from portal_api.services.research_supervisor import IsolatedResearchSupervisor, ResearchChildLimits, ResearchSupervisorError

    supervisor = object.__new__(IsolatedResearchSupervisor)
    assert supervisor._MAX_RESULT_BYTES == 32_768
    assert ResearchChildLimits().scratch_bytes == 64 * 1024 * 1024
    assert ResearchChildLimits().file_bytes == replay.MAX_BYTES == 2 * 1024 * 1024
    source = replay.unavailable_source("FIXED_REPLAY_ROW_LIMIT_EXCEEDED", start=10, end=20)
    result = {"fixed_replay_source": source, "evidence_source": {"core": "x" * 24_000,
        "enriched_analysis": {"display": "y" * 60_000}}}
    path = tmp_path / "result.json"
    path.write_text(json.dumps(result, separators=(",", ":")))
    assert path.stat().st_size < 98_304 and supervisor._read_result(path) == result
    result["evidence_source"]["enriched_analysis"]["display"] = "y" * 65_536
    path.write_text(json.dumps(result, separators=(",", ":")))
    with pytest.raises(ResearchSupervisorError, match="enrichment"):
        supervisor._read_result(path)
    result["evidence_source"] = {"core": "x" * 32_768}
    path.write_text(json.dumps(result, separators=(",", ":")))
    with pytest.raises(ResearchSupervisorError, match="core"):
        supervisor._read_result(path)


def test_supervisor_checks_exact_available_bounds_and_byte_custody(tmp_path):
    from portal_api.services.research_supervisor import IsolatedResearchSupervisor, ResearchSupervisorError

    scratch = tmp_path / "scratch"
    work = scratch / "rjob_fixed" / "rwa_fixed"; work.mkdir(parents=True)
    source, _, _ = capture(work)
    # Pure custody method; never construct a launcher or start a child.
    supervisor = object.__new__(IsolatedResearchSupervisor)
    supervisor._scratch_root = scratch
    child_receipt = SimpleNamespace(job_id="rjob_fixed", worker_attempt_id="rwa_fixed",
        oos_start_utc_ms=source["oos_start_utc_ms"],
        source_windows={"oos": {"start_ms": source["oos_start_utc_ms"], "end_ms": source["oos_end_exclusive_utc_ms"]}})
    assert supervisor._validated_fixed_replay({"fixed_replay_source": source}, child_receipt) == (source, work / replay.FILE_NAME)
    with pytest.raises(ResearchSupervisorError, match="omitted"):
        supervisor._validated_fixed_replay({}, child_receipt)
    bad = copy.deepcopy(source); bad["oos_end_exclusive_utc_ms"] += 1
    with pytest.raises(ResearchSupervisorError, match="custody"):
        supervisor._validated_fixed_replay({"fixed_replay_source": bad}, child_receipt)
    child_receipt.source_windows = None
    assert supervisor._validated_fixed_replay({}, child_receipt) == (None, None)


def test_producer_copies_exact_replay_before_discarding_tape_without_engine_execution(tmp_path):
    from test_research_run_producer import _request, _snapshot
    from portal_api.domain.research_run_producer import ResearchRunProducerRequest
    from portal_api.services.research_run_producer import ResearchRunProducerExecutor
    from portal_api.services.research_supervisor import ResearchChildResult
    from portal_api.workers.research_child import _capture_fixed_replay_source

    snapshots, identity = _snapshot(tmp_path)
    market_root = tmp_path / "market"; market_root.mkdir()
    work = tmp_path / "child"; work.mkdir()

    class ExistingResultSupervisor:
        def run_p04_delta_qualification(self, child_receipt, **kwargs):
            market = pd.read_parquet(child_receipt.market_path)
            index = market.index
            eq = pd.Series(20_000 + np.arange(len(index)), index=index)
            result = BacktestResultV2(equity=eq, returns=eq.pct_change().fillna(0),
                positions=pd.DataFrame({"Position_BTCUSDT": 1.25}, index=index),
                closes=pd.DataFrame({"Close_BTCUSDT": market.close}, index=index), symbols=["BTCUSDT"], initial_capital=20_000)
            output = {}
            _capture_fixed_replay_source(receipt=child_receipt.as_payload(), receipt_dir=work,
                market=market, result=result, output=output)
            return ResearchChildResult(launcher_pid=1, child_pid=2, network_namespace="net:mock",
                engine_version="1.1.1", final_equity=float(eq.iloc[-1]), num_trades=0, bars=len(index),
                elapsed_seconds=.1, peak_rss_bytes=1024, cpu_seconds=.01, enforced_limits={"cpu_seconds": 45},
                evidence_source={"source": {"source_transform_digest": "1" * 64}},
                fixed_replay_source=output["fixed_replay_source"], fixed_replay_path=work / replay.FILE_NAME)

    req = ResearchRunProducerRequest.model_validate(_request(snapshot_id=identity.snapshot_id,
        snapshot_content_hash=identity.content_hash))
    executor = ResearchRunProducerExecutor(snapshots=snapshots, supervisor=ExistingResultSupervisor(), market_root=market_root)
    root = tmp_path / "engine"
    output = executor._execute_sync(req, root, None)
    metadata = output["fixed_replay_source"]
    assert metadata == output["research_receipt"]["fixed_replay_source"]
    copied = root / req.run_id / "research" / replay.FILE_NAME
    replay.verify_fixed_replay_file(copied, metadata)
    assert copied.read_bytes() == (work / replay.FILE_NAME).read_bytes()
    assert not (market_root / req.job_id / req.worker_attempt_id).exists()
    assert not set(metadata) & {"path", "source_path", "raw_rows", "rows", "orders", "fills", "trades"}
