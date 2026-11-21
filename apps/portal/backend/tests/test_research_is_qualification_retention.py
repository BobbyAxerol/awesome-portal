"""Private custody integration units, never real-source acceptance receipts."""
from __future__ import annotations

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from quantbt.core.results import BacktestResultV2

from portal_api.services.research_enrich_analysis import enrich_analysis, digest_rows
from portal_api.services.research_is_qualification import FILE_NAME, capture_is_qualification
from portal_api.services.research_is_qualification_retention import DIRECTORY_NAME, METADATA_NAME, retain_is_qualification
from portal_api.services.research_supervisor import IsolatedResearchSupervisor, ResearchChildReceipt, ResearchSupervisorError
from portal_api.workers.research_child import _capture_is_qualification_source


def qualification(tmp_path):
    work = tmp_path / "scratch" / "rjob_is_unit" / "rwa_is_unit"
    work.mkdir(mode=0o700, parents=True)
    index = pd.date_range("2026-06-01", periods=336, freq="h", tz="UTC")
    close = pd.Series(100 + np.arange(len(index)) / 10, index=index)
    equity = pd.Series(1000 + np.arange(len(index)) * 2 + np.sin(np.arange(len(index))) * 20, index=index)
    result = BacktestResultV2(equity=equity, returns=equity.pct_change().fillna(0),
        positions=pd.DataFrame({"Position_DEFAULT": np.full(len(index), .25)}, index=index),
        closes=pd.DataFrame({"Close_DEFAULT": close}, index=index), symbols=["DEFAULT"], initial_capital=1000)
    spec = {"windows": {kind: {"start": start, "end_exclusive": end} for kind, start, end in (
        ("is", "2026-06-01T00:00:00Z", "2026-06-08T00:00:00Z"),
        ("oos", "2026-06-08T00:00:00Z", "2026-06-15T00:00:00Z"),
        ("holdout", "2026-06-15T00:00:00Z", "2026-06-17T00:00:00Z"))}}
    from portal_api.services.research_enrich_analysis import declared_source_windows
    windows = declared_source_windows(spec["windows"])
    binding = dict(run_id="rrun_is_unit", job_id="rjob_is_unit", worker_attempt_id="rwa_is_unit", lease_epoch=1)
    locator = "P08.verified_tape:test:close:OOS"
    enriched = enrich_analysis(run_id=binding["run_id"], result=result, mode="FIXED", market_close=close,
        benchmark_locator=locator, is_start_utc_ms=windows["is"]["start_ms"],
        oos_start_utc_ms=windows["oos"]["start_ms"], source_windows=windows,
        source_tables=[{"name": "OBSERVATION", "row_count": 168, "digest": digest_rows([])}])
    metadata = capture_is_qualification(result=result, market_close=close, output_directory=work,
        source_windows=windows, binding=binding, benchmark_locator=locator)
    request = SimpleNamespace(**binding, workspace_id="ws_is_unit", research=SimpleNamespace(
        requested_spec=spec, requested_spec_digest="a" * 64, effective_spec_digest="b" * 64,
        dataset_binding_digest="c" * 64))
    evidence = {"enriched_analysis": enriched, "summary_analytics_v2": {"benchmark_locator": locator}}
    receipt = ResearchChildReceipt(**binding, market_path=work / "market.parquet", artifact_root=tmp_path / "engine",
        source_windows=windows, is_start_utc_ms=windows["is"]["start_ms"], oos_start_utc_ms=windows["oos"]["start_ms"])
    return work, metadata, request, evidence, receipt


def test_private_retention_never_enters_engine_bundle_and_is_byte_exact(tmp_path):
    work, source, request, evidence, _ = qualification(tmp_path)
    root = tmp_path / "store"; root.mkdir()
    retain_is_qualification(request=request, source=source, source_path=work / FILE_NAME,
        private_root=root, evidence=evidence, fence_validator=lambda b: b["lease_epoch"] == 1)
    destination = root / DIRECTORY_NAME / request.run_id / request.worker_attempt_id / "1"
    assert (destination / FILE_NAME).read_bytes() == (work / FILE_NAME).read_bytes()
    assert (destination / FILE_NAME).stat().st_mode & 0o077 == 0
    private = json.loads((destination / METADATA_NAME).read_bytes())
    assert private["source"] == source and private["enrichment_input_digest"] == evidence["enriched_analysis"]["input_digest"]
    assert private["binding"]["run_id"] == request.run_id and private["workspace_id"] == request.workspace_id
    assert not (root / "runs").exists() and not (root / "blobs").exists()
    assert "is_qualification_source" not in evidence and "is_qualification_path" not in evidence
    with pytest.raises(FileExistsError):
        retain_is_qualification(request=request, source=source, source_path=work / FILE_NAME,
            private_root=root, evidence=evidence, fence_validator=lambda _: True)


@pytest.mark.parametrize("live_checks", [0, 1, 2])
def test_qualification_lease_and_cancel_refusal_leave_no_accepted_file(tmp_path, live_checks):
    work, source, request, evidence, _ = qualification(tmp_path)
    root = tmp_path / "store"; root.mkdir()
    calls = []
    def fence(binding):
        calls.append(binding)
        return len(calls) <= live_checks
    with pytest.raises(ValueError, match="lease"):
        retain_is_qualification(request=request, source=source, source_path=work / FILE_NAME,
            private_root=root, evidence=evidence, fence_validator=fence)
    assert not list(root.rglob(FILE_NAME)) and not list(root.rglob(METADATA_NAME))
    assert (work / FILE_NAME).exists()


def test_qualification_refuses_substituted_public_identity_and_private_directory(tmp_path):
    work, source, request, evidence, _ = qualification(tmp_path)
    root = tmp_path / "store"; root.mkdir()
    changed = copy.deepcopy(evidence)
    next(r for r in changed["enriched_analysis"]["source_tables"] if r["name"] == "OBSERVATION_IS")["digest"] = "0" * 64
    with pytest.raises(ValueError, match="public source identity"):
        retain_is_qualification(request=request, source=source, source_path=work / FILE_NAME,
            private_root=root, evidence=changed, fence_validator=lambda _: True)
    (root / DIRECTORY_NAME).symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ValueError, match="private directories"):
        retain_is_qualification(request=request, source=source, source_path=work / FILE_NAME,
            private_root=root, evidence=evidence, fence_validator=lambda _: True)


def test_supervisor_exact_qualification_binding_and_disabled_or_legacy_refusal(tmp_path, monkeypatch):
    work, source, _request, evidence, receipt = qualification(tmp_path)
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=tmp_path)
    payload = {"is_qualification_source": source, "evidence_source": evidence}
    with pytest.raises(ResearchSupervisorError, match="validation"):
        supervisor._validated_is_qualification(payload, receipt)
    monkeypatch.setenv("RESEARCH_IS_QUALIFICATION_CAPTURE", "true")
    assert supervisor._validated_is_qualification(payload, receipt) == (source, work / FILE_NAME)
    wrong = copy.deepcopy(payload); wrong["is_qualification_source"]["binding_sha256"] = "0" * 64
    with pytest.raises(ResearchSupervisorError, match="validation"):
        supervisor._validated_is_qualification(wrong, receipt)
    legacy = ResearchChildReceipt(job_id="p06-legacy", run_id="p06-legacy", worker_attempt_id="p06-legacy",
        lease_epoch=1, market_path=tmp_path / "market.parquet", artifact_root=tmp_path / "engine")
    assert supervisor._validated_is_qualification({}, legacy) == (None, None)
    monkeypatch.delenv("RESEARCH_IS_QUALIFICATION_CAPTURE")
    with pytest.raises(ResearchSupervisorError, match="unexpectedly"):
        supervisor._validated_is_qualification({}, receipt)


def test_child_opt_in_is_exact_literal_and_does_not_rewrite_public_evidence(tmp_path, monkeypatch):
    sentinel = {"unchanged": "public evidence"}
    for flag in ("false", "TRUE", "1", ""):
        monkeypatch.setenv("RESEARCH_IS_QUALIFICATION_CAPTURE", flag)
        output = {"evidence_source": sentinel}
        _capture_is_qualification_source(receipt={}, receipt_dir=None, market=None, result=None, output=output)
        assert output == {"evidence_source": sentinel}
    monkeypatch.setenv("RESEARCH_IS_QUALIFICATION_CAPTURE", "true")
    with pytest.raises(ValueError, match="admitted fixed windows"):
        _capture_is_qualification_source(receipt={}, receipt_dir=tmp_path, market=None, result=None, output={})
