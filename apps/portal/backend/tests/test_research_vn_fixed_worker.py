"""VN fixed worker contract/clock proofs; synthetic inputs, not runtime acceptance."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.domain.research_vn_observed_fixed_profile import (
    VN_OBSERVED_FIXED_PROFILE_ID as ID, VN_OBSERVED_FIXED_PROFILE_DIGEST as DIGEST, vn_source_instant,
)
from portal_api.services.research_fixed_replay_retention import fixed_replay_profile
from portal_api.services.research_supervisor import ResearchChildReceipt
from portal_api.workers.research_child import _run_p04_delta_smoke
from test_research_run_producer import _request, P04_PARAMETERS


def sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def tape():
    index = pd.bdate_range("2023-01-02", periods=380, tz="Asia/Ho_Chi_Minh").tz_convert("UTC")
    close = 100 + np.arange(len(index)) / 10 + np.sin(np.arange(len(index)) / 8)
    return pd.DataFrame({"open": close, "high": close + 2, "low": close - 2, "close": close,
        "volume": 1000 + np.arange(len(index))}, index=index)


def payload():
    value = _request(snapshot_id="dss_" + "0" * 32, snapshot_content_hash="a" * 64)
    research = value["research"]
    spec = research["requested_spec"]
    frame = tape()
    local = frame.index.tz_convert("Asia/Ho_Chi_Minh")
    spec["data"] = {"dataset_id": "vn-stock-daily", "symbol": "FPT", "timeframe": "1d"}
    windows = [(300, 325), (325, 355), (355, 379)]
    spec["windows"] = {kind: {"start": local[start].tz_localize(None).isoformat(),
        "end_exclusive": local[end].tz_localize(None).isoformat()} for kind, (start, end) in zip(("is", "oos", "holdout"), windows, strict=True)}
    research.update(execution_profile_id=ID, execution_profile_digest=DIGEST,
        adapter_contract_digest="9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        source_observation={"dataset_id": "vn-stock-daily", "symbol": "FPT", "timeframe": "1d",
            "clock_basis": "OBSERVED_SOURCE_LOCAL_DATE_V1", "source_timezone": "Asia/Ho_Chi_Minh",
            "metadata_index_revision": "b" * 64, "metadata_index_source_manifest_digest": "c" * 64,
            "metadata_index_as_of_utc_ms": 1_790_000_000_000, "warmup_semantics": "LAST_N_OBSERVED_PREDECESSORS_V1",
            "warmup_start_utc_ms": int(frame.index[0].value // 1_000_000)})
    value["dataset_id"] = "vn-stock-daily"
    rehash(value)
    return value


def rehash(value):
    r = value["research"]
    r["requested_spec_digest"] = sha(r["requested_spec"])
    r["work_digest"] = sha({"schema_version": "research.p10.vn-observed-fixed-work.v1",
        **{key: r[key] for key in ("requested_spec_digest", "effective_spec_digest", "dataset_binding_digest", "manifest_digest")},
        "snapshot": {key: r[key] for key in ("snapshot_id", "snapshot_content_hash")},
        "alpha": {"alpha_id": r["alpha_id"], "alpha_version_id": r["alpha_version_id"],
            "adapter_id": r["execution_adapter_id"], "adapter_contract_digest": r["adapter_contract_digest"],
            "fixed_parameters": r["p04_parameters"]},
        "execution_profile": {"profile_id": r["execution_profile_id"], "profile_digest": r["execution_profile_digest"]},
        "source_observation": r["source_observation"], "engine_release_id": "er_quantbt_111", "requested_spec": r["requested_spec"]})


def child_receipt(path: Path):
    req = ResearchRunProducerRequest.model_validate(payload())
    windows = req.research.requested_spec["windows"]
    normalized = {kind: {"start_ms": int(vn_source_instant(window["start"]).timestamp() * 1000),
        "end_ms": int(vn_source_instant(window["end_exclusive"]).timestamp() * 1000),
        "source_locator": f"P10.immutable_requested_spec.windows.{kind}"} for kind, window in windows.items()}
    return ResearchChildReceipt(job_id=req.job_id, run_id=req.run_id, worker_attempt_id=req.worker_attempt_id,
        lease_epoch=req.lease_epoch, market_path=path, artifact_root=path.parent / "artifacts",
        p04_parameters=P04_PARAMETERS.copy(), is_start_utc_ms=normalized["is"]["start_ms"],
        oos_start_utc_ms=normalized["oos"]["start_ms"], source_windows=normalized,
        execution_profile_id=ID, execution_profile_digest=DIGEST,
        source_observation=req.research.source_observation.model_dump(mode="json"))


def test_private_vn_request_pins_source_profile_digest_and_legacy_wire_stays_unchanged():
    request = ResearchRunProducerRequest.model_validate(payload())
    assert request.research.is_vn_observed_fixed
    assert request.model_dump(mode="json")["research"]["source_observation"]["symbol"] == "FPT"
    original = _request(snapshot_id="dss_" + "0" * 32, snapshot_content_hash="a" * 64)
    legacy = ResearchRunProducerRequest.model_validate(original).model_dump(mode="json")
    assert legacy == original
    assert "source_observation" not in legacy["research"]


@pytest.mark.parametrize("change", ["symbol", "timezone", "source_digest", "work_digest", "profile_digest", "bool_warmup", "requested_digest", "adapter_digest"])
def test_private_vn_refuses_mixed_or_tampered_pins(change):
    value = payload()
    r = value["research"]
    if change == "symbol": r["requested_spec"]["data"]["symbol"] = "VCB"; rehash(value)
    if change == "timezone": r["source_observation"]["source_timezone"] = "UTC"; rehash(value)
    if change == "source_digest": r["source_observation"]["metadata_index_revision"] = "d" * 64
    if change == "work_digest": r["work_digest"] = "d" * 64
    if change == "profile_digest": r["execution_profile_digest"] = "d" * 64
    if change == "bool_warmup": r["source_observation"]["warmup_start_utc_ms"] = True; rehash(value)
    if change == "requested_digest": r["requested_spec_digest"] = "d" * 64
    if change == "adapter_digest": r["adapter_contract_digest"] = "d" * 64; rehash(value)
    with pytest.raises(ValueError): ResearchRunProducerRequest.model_validate(value)


def test_real_quantbt_fixed_child_uses_observed_clock_exact_warmup_and_fpt_symbol(tmp_path, monkeypatch):
    monkeypatch.setenv("RESEARCH_IS_QUALIFICATION_CAPTURE", "true")
    frame = tape()
    receipt = child_receipt(tmp_path / "tape.parquet")
    end = receipt.source_windows["oos"]["end_ms"]
    frame.loc[frame.index < pd.Timestamp(end, unit="ms", tz="UTC")].to_parquet(receipt.market_path)
    result = _run_p04_delta_smoke(receipt.as_payload(), receipt_dir=tmp_path)
    assert result["engine_version"] == "1.1.1"
    assert result["bars"] == 355
    assert result["execution_profile_id"] == ID
    assert result["fixed_replay_source"]["row_count"] == 30
    actual_windows = result["evidence_source"]["enriched_analysis"]["windows"]
    for kind, bounds in receipt.source_windows.items():
        assert {key: actual_windows[kind][key] for key in bounds} == bounds
    assert receipt.oos_start_utc_ms == int(frame.index[325].value // 1_000_000)
    import pyarrow.parquet as pq
    replay = pq.read_table(tmp_path / result["fixed_replay_source"]["file_name"]).to_pylist()
    assert set(json.loads(replay[0]["positions_json"])) == {"FPT"}
    from portal_api.services.research_is_qualification_retention import retain_is_qualification
    request = ResearchRunProducerRequest.model_validate(payload())
    retain_is_qualification(request=request, source=result["is_qualification_source"],
        source_path=tmp_path / result["is_qualification_source"]["file_name"], private_root=tmp_path / "private",
        evidence=result["evidence_source"], fence_validator=lambda _fence: True)
    metadata = next((tmp_path / "private").rglob("qualification-metadata.json"))
    assert json.loads(metadata.read_text())["source_windows"] == receipt.source_windows


def test_child_rejects_cross_profile_provenance_and_legacy_receipt_remains_sparse(tmp_path):
    receipt = child_receipt(tmp_path / "tape.parquet")
    bad = copy.deepcopy(receipt.as_payload())
    bad["execution_profile_digest"] = "d" * 64
    with pytest.raises(ValueError): _run_p04_delta_smoke(bad)
    old = ResearchChildReceipt(job_id="job", run_id="run", worker_attempt_id="attempt", lease_epoch=1,
        market_path=tmp_path / "old.parquet", artifact_root=tmp_path / "artifacts")
    assert "execution_profile_id" not in old.as_payload()
    assert "source_observation" not in old.as_payload()


def test_fixed_replay_allows_only_exact_vn_profile_pair():
    request = ResearchRunProducerRequest.model_validate(payload())
    assert fixed_replay_profile(request.research) == (ID, DIGEST)
    with pytest.raises(ValueError): fixed_replay_profile(SimpleNamespace(execution_profile_id=ID, execution_profile_digest="d" * 64))


def test_snapshot_producer_preserves_real_observed_tape_through_child_and_p05_receipt(tmp_path, monkeypatch):
    """The wrapper uses real Parquet+QuantBT, but no namespace/runtime proof is claimed."""
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_VN_OBSERVED_PROFILE", "true")
    from portal_api.services.research_run_producer import ResearchRunProducerExecutor
    frame = tape()
    snapshot = tmp_path / "snapshot"
    snapshot.mkdir()
    frame.to_parquet(snapshot / "frame.parquet")
    raw = payload()
    raw["research"]["snapshot_content_hash"] = hashlib.sha256((snapshot / "frame.parquet").read_bytes()).hexdigest()
    rehash(raw)
    request = ResearchRunProducerRequest.model_validate(raw)
    snapshots = SimpleNamespace(describe=lambda _id: (SimpleNamespace(content_hash=request.research.snapshot_content_hash), {}),
        snapshot_path=lambda _id: snapshot)
    captured = []
    class RecordingChild:
        def run_p04_delta_qualification(self, receipt, **kwargs):
            captured.append(receipt.as_payload())
            result = _run_p04_delta_smoke(receipt.as_payload(), receipt_dir=receipt.market_path.parent)
            return SimpleNamespace(engine_version=result["engine_version"], final_equity=result["final_equity"],
                num_trades=result["num_trades"], bars=result["bars"], elapsed_seconds=1, peak_rss_bytes=1,
                cpu_seconds=1, enforced_limits={"cpu_seconds":45}, evidence_source=result["evidence_source"],
                fixed_replay_source=result["fixed_replay_source"], fixed_replay_path=receipt.market_path.parent / "fixed-replay.parquet",
                imported_source_digest=None, is_qualification_source=None, is_qualification_path=None)
    executor = ResearchRunProducerExecutor(snapshots=snapshots, supervisor=RecordingChild(), market_root=tmp_path / "market")
    result = executor._execute_sync(request, tmp_path / "output")
    assert result["status"] == "COMPLETED"
    receipt = result["research_receipt"]
    assert receipt["source_observation"] == raw["research"]["source_observation"]
    assert receipt["calendar_authority"] == "NOT_PUBLISHED"
    assert receipt["account_model"] == "GENERIC_SIGNAL_NOTIONAL_RESEARCH_NOT_VN_VENUE"
    assert captured[0]["execution_profile_digest"] == DIGEST
    assert receipt["holdout_rows_exposed_to_child"] == 0
    assert receipt["fixed_replay_source"]["row_count"] == 30
    assert not Path(captured[0]["market_path"]).exists()


def test_vn_worker_flag_off_refuses_before_snapshot_or_child(tmp_path, monkeypatch):
    monkeypatch.delenv("PORTAL_FEATURE_RESEARCH_VN_OBSERVED_PROFILE", raising=False)
    from portal_api.services.research_run_producer import ResearchRunProducerExecutor, ResearchRunProducerError
    executor = ResearchRunProducerExecutor(snapshots=SimpleNamespace(), supervisor=SimpleNamespace(), market_root=tmp_path)
    with pytest.raises(ResearchRunProducerError, match="not enabled"):
        executor._execute_sync(ResearchRunProducerRequest.model_validate(payload()), tmp_path / "out")
