"""Synthetic unit input only; these tests do not execute QuantBT or prove source authority."""
from __future__ import annotations
import hashlib
import json
from io import BytesIO
from pathlib import Path
import urllib.error

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter
from portal_api.services.research_child_audit_companion import ChildAuditCompanionCapture, canonical_bytes, digest, source_file_digest
from portal_api.services.research_current_source_retention import ResearchCurrentSourceRetentionClient, ResearchCurrentSourceRetentionError


def row(ordinal: int) -> dict:
    adapter = object.__new__(CurrentSourceArtifactAdapter)
    return {**adapter._child_audit_record(ordinal, {"candidate_id": f"candidate-{ordinal}", "context": "anti-leakage in-sample search"}, "fold_000"),
        "run_fingerprint": "synthetic-unit-run"}


def binding() -> dict:
    return {"workspace_id": "audit-workspace", "run_id": "audit-run", "artifact_id": "audit-artifact", "artifact_revision": 1,
        "manifest_digest": "a" * 64, "source_transform_digest": "b" * 64,
        "requested_spec_digest": "c" * 64, "effective_spec_digest": "d" * 64, "dataset_binding_digest": "e" * 64,
        "execution_profile_id": "synthetic-unit-profile", "execution_profile_digest": "1" * 64,
        "source_adapter_id": "synthetic-unit-adapter", "profile_id": "synthetic-unit-lane"}


def capture(count=201, dropped=2212) -> ChildAuditCompanionCapture:
    return ChildAuditCompanionCapture(tuple(row(i) for i in range(count)), "f" * 64, "0" * 64, dropped, "strict")


def test_full_capture_fixed_chunks_original_ordinals_and_hashes() -> None:
    audit = capture()
    batches = list(audit.batches())
    assert [len(batch["rows"]) for batch in batches] == [200, 1]
    assert [batch["batch_ordinal"] for batch in batches] == [0, 1]
    assert [record["audit_ordinal"] for batch in batches for record in batch["rows"]] == list(range(201))
    assert all(batch["batch_digest"] == digest(batch["rows"]) for batch in batches)
    manifest = audit.bind(binding())
    assert manifest["source_record_count"] == 201 and manifest["source_total_count"] == 2413
    assert manifest["records_dropped_by_source"] == 2212 and manifest["rows_digest"] == digest(list(audit.rows))
    assert manifest["authority"] == "SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK"
    assert digest(manifest) == digest(audit.bind(binding()))
    assert capture(dropped=None).bind(binding())["source_total_count"] is None


def test_capture_rejects_gaps_and_overbounds_and_file_digest_is_original_bytes(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="ROW_INVALID"):
        ChildAuditCompanionCapture((row(1),), "a" * 64, "b" * 64, 0, None)
    with pytest.raises(ValueError, match="ROWS_EXCEED"):
        ChildAuditCompanionCapture(tuple({"audit_ordinal": i} for i in range(20_001)), "a" * 64, "b" * 64, 0, None)
    with pytest.raises(ValueError, match="ROW_INVALID"):
        ChildAuditCompanionCapture(({"audit_ordinal": 0, "unknown": "x" * 5000},), "a" * 64, "b" * 64, 0, None)
    source = tmp_path / "synthetic-unit.parquet"
    pq.write_table(pa.table({"audit_ordinal": [0, 1]}), source)
    assert source_file_digest(source) == hashlib.sha256(source.read_bytes()).hexdigest()
    link = tmp_path / "link.parquet"
    link.symlink_to(source)
    with pytest.raises(ValueError): source_file_digest(link)
    pq.write_table(pa.table({"ordinal": list(range(20_001))}), source)
    with pytest.raises(ValueError, match="ROWS_EXCEED"): source_file_digest(source)


class LegacyNormalization(CurrentSourceArtifactAdapter):
    """Verbatim pre-companion normalization; witness bytes are the invariant."""
    def _child_audit_record(self, ordinal, record, fold_id):
        context = record.get("context")
        return {"audit_ordinal": ordinal, "candidate_id": self._fact_token(record.get("candidate_id")), "fold_id": fold_id,
            "seed": self._fact_int(record.get("seed")), "context": context if isinstance(context, str) and 0 < len(context) <= 96 else None,
            "lifecycle_kind": self._fact_token(record.get("lifecycle_kind")), "policy": self._fact_token(record.get("policy")),
            "certified_isolation": self._fact_bool(record.get("certified_isolation")), "spawned": self._fact_bool(record.get("spawned")),
            "reset_called": self._fact_bool(record.get("reset_called")), "warmup_called": self._fact_bool(record.get("warmup_called")),
            "warmup_bars": self._fact_int(record.get("warmup_bars")), "closed": self._fact_bool(record.get("closed")),
            "state_before": self._fact_token(record.get("state_before")),
            "cutoff_utc_ms": self._nullable_utc_ms(record.get("cutoff"), "lifecycle cutoff"),
            "train_start_utc_ms": self._nullable_utc_ms(record.get("train_start"), "lifecycle train start"),
            "train_end_utc_ms": self._nullable_utc_ms(record.get("train_end"), "lifecycle train end"),
            "test_start_utc_ms": self._nullable_utc_ms(record.get("test_start"), "lifecycle test start"),
            "test_end_utc_ms": self._nullable_utc_ms(record.get("test_end"), "lifecycle test end"),
            "strategy_fingerprint": self._fact_token(record.get("strategy_fingerprint")), "market_fingerprint": self._fact_token(record.get("market_fingerprint"))}


def test_legacy_fold64_generation_and_selected_witness_bytes_unchanged() -> None:
    records = [{"candidate_id": f"candidate-{i}", "context": "anti-leakage in-sample search", "fold_id": "fold_000", "run_id": "synthetic-unit-run",
        "seed": 42, "warmup_bars": 300, "cutoff": "2024-01-01T00:00:00Z", "strategy_fingerprint": "unit-fingerprint"} for i in range(80)]
    records.append({**records[79], "context": "out-of-sample generation"})
    records.append({**records[0], "fold_id": "unmatched-unit-fold"})
    lifecycle = pd.DataFrame(records)
    old_folds = [{"fold_id": "fold_000", "payload_json": '{"original":"unchanged"}'}]
    new_folds = [dict(f) for f in old_folds]
    old_summary = object.__new__(LegacyNormalization)._attach_child_audit(old_folds, lifecycle=lifecycle, contract={"records_dropped": 2212})
    new_summary = object.__new__(CurrentSourceArtifactAdapter)._attach_child_audit(new_folds, lifecycle=lifecycle, contract={"records_dropped": 2212})
    assert canonical_bytes(old_folds) == canonical_bytes(new_folds)
    assert canonical_bytes(old_summary) == canonical_bytes(new_summary)
    sample = json.loads(new_folds[0]["payload_json"])["child_audit"]["records"]
    assert len(sample) == 64 and [r["audit_ordinal"] for r in sample][-2:] == [79, 80]
    assert new_summary["source_record_count"] == 82 and new_summary["unmatched_record_count"] == 1


class AuditAcknowledgement:
    @staticmethod
    def answer(operation, body):
        if operation == "child-audit/batches":
            return {"schema_version": "research.child-audit-companion-batch-receipt.v1", "accepted": True,
                "batch_ordinal": body["batch_ordinal"], "row_count": len(body["rows"]), "replayed": False}
        if operation == "child-audit/seal":
            return {"schema_version": "research.child-audit-companion-seal-receipt.v1", "sealed": True,
                "companion_digest": body["companion_digest"], "replayed": False}
        raise AssertionError("Unit transport only accepts companion operations")


def test_private_parent_upload_exact_binding_bounded_identical_transport_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    identity = {key: binding()[key] for key in ("workspace_id", "run_id", "artifact_id")}
    identity.update({"job_id": "audit-job", "worker_attempt_id": "audit-worker", "lease_epoch": 1})
    requests = []
    class Response(BytesIO):
        status = 200
    def send(request, **kwargs):
        operation = "child-audit/" + request.full_url.rsplit("/", 1)[1]
        requests.append((operation, request.data, request.headers))
        if len(requests) == 1: raise urllib.error.URLError("synthetic-unit-drop")
        if len(requests) == 2: raise urllib.error.HTTPError(request.full_url, 503, "synthetic-unit-unavailable", {}, BytesIO(b"{}"))
        return Response(json.dumps(AuditAcknowledgement.answer(operation, json.loads(request.data))).encode())
    monkeypatch.setattr("urllib.request.urlopen", send)
    client = ResearchCurrentSourceRetentionClient(endpoint="http://127.0.0.1:1", secret="synthetic-unit-principal-secret", sleep=lambda _: None)
    client._retain_child_audit(capture(), binding=binding(), identity_fields=identity)
    assert [op for op, _, _ in requests] == ["child-audit/batches"] * 4 + ["child-audit/seal"]
    raw = [raw for op, raw, _ in requests if op == "child-audit/batches"]
    assert raw[0] == raw[1] == raw[2] and raw[3] != raw[0]
    for body in [json.loads(raw) for op, raw, _ in requests if op == "child-audit/batches"]:
        assert body["manifest"] == capture().bind(binding())
        assert body["companion_digest"] == digest(body["manifest"])
        assert body["batch_digest"] == digest(body["rows"])
        assert len(canonical_bytes(body)) <= 1_000_000
        assert not {"secret", "source_path", "database_url"} & set(body)


def test_private_parent_rejects_incompatible_ack_without_success() -> None:
    client = ResearchCurrentSourceRetentionClient(endpoint="http://127.0.0.1:1", secret="synthetic-unit-principal-secret")
    client._post = lambda *args: {"events": []}
    with pytest.raises(ResearchCurrentSourceRetentionError, match="acknowledgement"):
        client._retain_child_audit(capture(), binding=binding(), identity_fields={})
