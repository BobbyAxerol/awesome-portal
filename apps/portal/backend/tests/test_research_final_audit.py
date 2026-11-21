"""Pinned audit contract and native engine proof; fixture lane, not HMD receipt.

Uses stdlib unittest so it also runs inside the existing pinned runtime image
without installing a test dependency or changing the shared preview worker.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from golden_fixture import GOLDEN_PARAMS, build_market_frame
from portal_api.domain.requests import ParameterSpaceConfig, ParameterSpec, PortalRunRequest
from portal_api.domain.research_final_audit import (
    PinnedSelectionAuditTarget, exact_parameter, original_document, audit_digest,
    PINNED_FINAL_AUDIT_PROFILE_ID, PINNED_FINAL_AUDIT_PROFILE_DIGEST, PinnedAuditPreparation,
)
from portal_api.repositories.artifacts import ArtifactRepository, with_portal_provenance
from portal_api.services.research_final_audit import pinned_audit_request, run_pinned_final_audit, verify_retained_target, prepare_pinned_audit_target
from portal_api.services.research_supervisor import IsolatedResearchSupervisor, PinnedAuditChildReceipt, ResearchChildLimits
from strategy.specification import DELTA_RSI_SPECIFICATION


def target_payload(snapshot_hash: str = "f" * 64) -> dict:
    request = PortalRunRequest.model_validate({
        "strategy_id": "delta-rsi-polynomial-alpha", "dataset_id": "golden-fixture",
        "symbol": "ETHUSDT", "timeframe": "1h", "protocol": "advanced_walk_forward",
        "parameter_space": ParameterSpaceConfig({
            name: ParameterSpec(kind="float_range" if isinstance(low, float) else "int_range", low=low, high=high, step=step)
            for name, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
        }),
        "account": {"initial_capital": 23000, "leverage": 3, "alloc_per_trade": 2000},
        "execution": {"target_mode": "signal_notional", "slippage": 0.0002},
        "calibration": {"data_start": "2024-01-01T00:00:00Z", "data_end_exclusive": "2024-01-21T20:00:00Z",
            "split_mode": "2024-01-08", "split_frequency": "weekly", "window_mode": "expanding",
            "optimization_mode": "mode_1_decay", "optimization_schedule": "global", "optuna_trials": 3,
            "random_seed": 17},
    })
    config = json.dumps(with_portal_provenance("config.json", request.model_dump(mode="json")), sort_keys=True, indent=2)
    selection = json.dumps(with_portal_provenance("selected_params.json", {"params": GOLDEN_PARAMS, "trial_id": 2,
        "optimization_mode": "mode_1_decay", "optimization_schedule": "global"}), sort_keys=True, indent=2)
    return {"schema_version": "research.pinned-selection-audit-target.v1",
        "parent_run_id": "rrun_parent", "parent_artifact_id": "rart_parent", "parent_artifact_revision": 1,
        "parent_manifest_digest": "a" * 64, "dataset_binding_digest": "b" * 64,
        "snapshot_id": "dss_" + "c" * 32, "snapshot_content_hash": snapshot_hash,
        "engine_release_id": "er_quantbt_111", "engine_version": "1.1.1", "alpha_version_id": "av_original",
        "execution_adapter_id": "p04.delta-rsi.v1",
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "source_config_raw": config, "source_config_digest": hashlib.sha256(config.encode()).hexdigest(),
        "source_selection_kind": "ENGINE_SELECTED_PARAMS_DOCUMENT",
        "source_selection_raw": selection, "source_selection_digest": hashlib.sha256(selection.encode()).hexdigest()}


def replace_config(payload: dict, change) -> dict:
    config = json.loads(payload["source_config_raw"])
    change(config)
    raw = json.dumps(config)
    return {**payload, "source_config_raw": raw, "source_config_digest": hashlib.sha256(raw.encode()).hexdigest()}


def retained_target(directory: Path, snapshot_hash: str = "f" * 64) -> PinnedSelectionAuditTarget:
    import pandas as pd
    payload = target_payload(snapshot_hash)
    root = directory / "research-retained/artifacts" / payload["parent_artifact_id"]
    (root / "tables/selection").mkdir(parents=True)
    config = root / "source_config.json"
    config.write_bytes(payload["source_config_raw"].encode())
    parameters = json.dumps({key: exact_parameter(value) for key, value in GOLDEN_PARAMS.items()}, sort_keys=True)
    part = root / "tables/selection/part-000001.parquet"
    pd.DataFrame([{"source_ordinal": 0, "parameters_json": parameters}]).to_parquet(part, index=False)
    part_hash = hashlib.sha256(part.read_bytes()).hexdigest()
    manifest = {"run_id": payload["parent_run_id"], "artifact_id": payload["parent_artifact_id"], "artifact_revision": 1,
        "documents": [{"name": "source_config", "relative_path": "source_config.json",
            "bytes": config.stat().st_size, "sha256": payload["source_config_digest"]}],
        "tables": [{"table_kind": "selection", "rows": 1, "parts": [{"relative_path": "tables/selection/part-000001.parquet",
            "rows": 1, "bytes": part.stat().st_size, "sha256": part_hash}]}]}
    raw = json.dumps(manifest).encode()
    (root / "manifest.json").write_bytes(raw)
    payload.update(parent_manifest_digest=hashlib.sha256(raw).hexdigest(),
        source_selection_kind="P05_SELECTION_PARAMETERS_JSON", source_selection_raw=parameters,
        source_selection_digest=hashlib.sha256(parameters.encode()).hexdigest(), source_selection_part_digest=part_hash,
        source_selection_part_relative_path="tables/selection/part-000001.parquet")
    return PinnedSelectionAuditTarget.model_validate(payload)


def producer_payload(target: PinnedSelectionAuditTarget) -> dict:
    source = target.source_request()
    spec = {"schema_version": "research.requested-spec.v1", "strategy_id": source.strategy_id,
        "protocol": "advanced", "execution_route": "signal_notional",
        "alpha_binding": {"alpha_id": source.strategy_id, "alpha_version_id": target.alpha_version_id},
        "data": {"dataset_id": source.dataset_id, "symbol": source.symbol, "timeframe": source.timeframe},
        "client": {"engine_release_id": target.engine_release_id}, "random_seed": source.calibration.random_seed}
    effective_digest = "d" * 64
    work = audit_digest({"schema_version": "research.pinned-audit-work.v1", "target_digest": target.target_digest(),
        "requested_spec_digest": audit_digest(spec), "effective_spec_digest": effective_digest,
        "profile_digest": PINNED_FINAL_AUDIT_PROFILE_DIGEST})
    return {"strategy_id": source.strategy_id, "dataset_id": source.dataset_id, "protocol": "advanced",
        "research_contract_version": "research.run-request.v1", "run_id": "rrun_child", "workspace_id": "ws_audit",
        "job_id": "rjob_audit", "worker_attempt_id": "rwa_audit", "lease_epoch": 1,
        "research": {"schema_version": "research.run-producer.v1", "client_intent_id": "audit:pinned-original",
            "intent_kind": "DIAGNOSTIC", "preflight_token": "rpft_original",
            "requested_spec": spec, "requested_spec_digest": audit_digest(spec), "effective_spec_digest": effective_digest,
            "dataset_binding_digest": target.dataset_binding_digest, "manifest_digest": "e" * 64,
            "snapshot_id": target.snapshot_id, "snapshot_content_hash": target.snapshot_content_hash,
            "alpha_id": source.strategy_id, "alpha_version_id": target.alpha_version_id,
            "execution_adapter_id": target.execution_adapter_id, "adapter_contract_digest": target.adapter_contract_digest,
            "execution_profile_id": PINNED_FINAL_AUDIT_PROFILE_ID,
            "execution_profile_digest": PINNED_FINAL_AUDIT_PROFILE_DIGEST, "work_digest": work,
            "final_audit_target": target.model_dump(mode="json"), "final_audit_target_digest": target.target_digest()}}


class PinnedAuditProducerContractTests(unittest.TestCase):
    def test_profile_pins_and_work_digest_cannot_be_changed(self):
        from portal_api.domain.research_run_producer import ResearchRunProducerRequest
        with tempfile.TemporaryDirectory() as directory:
            target = retained_target(Path(directory))
            payload = producer_payload(target)
            request = ResearchRunProducerRequest.model_validate(payload)
            self.assertTrue(request.research.is_final_audit)
            self.assertFalse(request.research.is_whatif)
            self.assertFalse(request.research.is_delta_wfo)
            for field, value in (("execution_profile_digest", "0" * 64), ("work_digest", "0" * 64),
                    ("final_audit_target_digest", "0" * 64), ("alpha_version_id", "av_other"),
                    ("snapshot_content_hash", "0" * 64), ("intent_kind", "NEW")):
                with self.subTest(field=field), self.assertRaises(ValueError):
                    ResearchRunProducerRequest.model_validate({**payload, "research": {**payload["research"], field: value}})
            # A genuine-looking JSON target without original retained bytes is
            # useful in a fixture, never an accepted production child envelope.
            with self.assertRaisesRegex(ValueError, "EXACT_RETAINED_TARGET"):
                ResearchRunProducerRequest.model_validate(producer_payload(PinnedSelectionAuditTarget.model_validate(target_payload())))

    def test_zero_optimizer_progress_has_no_invented_trial(self):
        from portal_api.services.research_progress import ResearchProgressJournal
        with tempfile.TemporaryDirectory() as directory:
            journal = ResearchProgressJournal(Path(directory), run_id="rrun_audit", attempt_id="rwa_audit",
                lease_epoch=1, planned_trials=0, cpu_cap_seconds=120, profile="PINNED_FINAL_AUDIT")
            self.assertEqual(journal.snapshot()["overall"]["trials_declared"], 0)
            self.assertEqual(journal.snapshot()["overall"]["trials_done"], 0)
            journal.emit("run_started")
            for stage in ("S1", "S2", "S3", "S4"):
                journal.emit("stage_started", {"stage": stage})
                journal.emit("stage_completed", {"stage": stage})
            self.assertEqual(journal.snapshot()["overall"]["pct"], 85)
            with self.assertRaises(Exception):
                journal.emit("trial_completed", {"trial": 1})
            for profile, trials in (("P04_FIXED", 0), ("DELTA_WFO", 0), ("PINNED_FINAL_AUDIT", 1)):
                with self.subTest(profile=profile), self.assertRaises(Exception):
                    ResearchProgressJournal(Path(directory), run_id="rrun_invalid", attempt_id="rwa_invalid",
                        lease_epoch=1, planned_trials=trials, cpu_cap_seconds=120, profile=profile)

    def test_native_producer_and_fenced_p05_retention_preserve_the_original_selection(self):
        from types import SimpleNamespace
        import pyarrow as pa
        import pyarrow.parquet as pq
        from portal_api.domain.research_run_producer import ResearchRunProducerRequest
        from portal_api.services.research_run_producer import ResearchRunProducerExecutor, WFO_SOURCE_DIRNAME
        from portal_api.services.research_retained_receipt import ResearchRetainedReceiptClient
        from portal_api.services.research_artifacts import ResearchArtifactStore
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "PORTAL_FEATURE_RESEARCH_WFO_PROFILE": "true", "PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS": "true"}):
            root = Path(directory)
            snapshot = root / "frame.parquet"
            build_market_frame().to_parquet(snapshot)
            before = hashlib.sha256(snapshot.read_bytes()).hexdigest()
            target = retained_target(root / "parent", before)
            parent_before = {str(path.relative_to(root / "parent")): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in (root / "parent").rglob("*") if path.is_file()}
            request = ResearchRunProducerRequest.model_validate(producer_payload(target))
            market_root = root / "market"
            market_root.mkdir()
            supervisor = IsolatedResearchSupervisor(root / "scratch", allowed_market_root=market_root)
            executor = ResearchRunProducerExecutor(
                snapshots=SimpleNamespace(describe=lambda _id: (SimpleNamespace(content_hash=before), None),
                    snapshot_path=lambda _id: root), supervisor=supervisor, market_root=market_root,
                parent_retained_root=root / "parent")
            events = []
            result = executor._execute_sync(request, root / "outputs",
                SimpleNamespace(emit=lambda event, payload=None: events.append((event, payload))))
            self.assertEqual(result["status"], "COMPLETED")
            self.assertEqual(result["research_receipt"]["audit"]["optimizer_trials"], 0)
            self.assertFalse(any(event == "trial_completed" for event, _ in events))
            source = root / "outputs" / WFO_SOURCE_DIRNAME / request.run_id
            client = ResearchRetainedReceiptClient(endpoint="http://control-api:4000", secret="unit-audit-principal-not-runtime")
            calls = []
            def private_post(operation, body):
                calls.append((operation, body))
                if operation == "audit/seal":
                    return {"schema_version": "research.pinned-audit-seal.v1", "verified": True}
                return ({"schema_version": "research.artifact-reservation.v1", "artifact_id": body["artifact_id"],
                    "artifact_revision": 1, "state": "WRITING"} if operation == "reserve" else
                    {"schema_version": "research.artifact-seal.v1", "sealed": True})
            client._post = private_post
            options = {"request": request, "receipt": result["research_receipt"], "artifact_root": root / "child-custody",
                "audit_source_root": source, "fence_validator": lambda fence: fence.lease_epoch == 1}
            digest = client.retain(**options)
            self.assertEqual(client.retain(**options), digest)  # Exact replay reuses the original P05 bytes.
            store = ResearchArtifactStore(root / "child-custody/research-retained")
            manifest, verified = store._load_and_verify_manifest(calls[0][1]["artifact_id"], verify_parts=True)
            self.assertEqual(verified, digest)
            tables = {table["table_kind"]: table for table in manifest["tables"]}
            self.assertEqual(set(tables), {"run_receipt", "audit_equity", "audit_folds", "audit_account_ledger", "audit_lifecycle"})
            self.assertEqual(tables["audit_folds"]["rows"], result["research_receipt"]["audit"]["n_folds"])
            original = pq.read_table(source / "series/stitched.parquet")
            retained = pa.concat_tables([pq.read_table(store.artifacts_dir / manifest["artifact_id"] / part["relative_path"])
                for part in tables["audit_equity"]["parts"]])
            self.assertTrue(original.equals(retained))  # Native float/index columns retained, not rounded DTO values.
            selection_document = next(document for document in manifest["documents"] if document["name"] == "audit_selection")
            selection = json.loads((store.artifacts_dir / manifest["artifact_id"] / selection_document["relative_path"]).read_bytes())
            self.assertEqual(selection["trial_id"], 0)  # Native fixed evaluation, not an optimizer trial.
            self.assertEqual(selection["n_studies"], 0)
            self.assertIsInstance(selection["objective"], float)
            original_receipt = result["research_receipt"]
            with self.assertRaises(Exception):
                client.retain(**{**options, "receipt": {**original_receipt, "audit": {**original_receipt["audit"], "optimizer_trials": 1}}})
            self.assertEqual(len(calls), 6)
            with self.assertRaises(Exception):
                client.retain(**{**options, "fence_validator": lambda _fence: False})
            self.assertEqual(len(calls), 7)  # Reserve replay only; no post-fence seal.
            self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), before)
            self.assertEqual({str(path.relative_to(root / "parent")): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in (root / "parent").rglob("*") if path.is_file()}, parent_before)
            self.assertFalse((market_root / request.job_id / request.worker_attempt_id).exists())
            self.assertTrue(executor.retire_terminal_scratch(job_id=request.job_id, run_id=request.run_id,
                worker_attempt_id=request.worker_attempt_id, lease_epoch=request.lease_epoch))


class PinnedAuditContractTests(unittest.TestCase):
    def test_preserves_resolved_account_window_seed_and_guards(self):
        target = PinnedSelectionAuditTarget.model_validate(target_payload())
        source = target.source_request()
        audit = pinned_audit_request(target)
        self.assertEqual(source.account, audit.account)
        self.assertEqual(source.execution, audit.execution)
        original_calibration = source.calibration.model_dump(mode="json")
        audited = audit.calibration.model_dump(mode="json")
        for key in ("optimization_mode", "optimization_schedule", "optuna_trials", "optuna_early_stopping"):
            original_calibration.pop(key)
            audited.pop(key)
        self.assertEqual(original_calibration, audited)
        self.assertEqual(audit.calibration.optuna_trials, 0)
        self.assertEqual(audit.calibration.optimization_mode.value, "none")
        self.assertEqual({key: exact_parameter(spec.value) for key, spec in audit.parameter_space.root.items()}, target.parameters())
        self.assertTrue(all(spec.kind == "fixed" for spec in audit.parameter_space.root.values()))

    def test_changed_original_bytes_are_refused(self):
        for key in ("source_config_raw", "source_selection_raw"):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "DIGEST_MISMATCH"):
                PinnedSelectionAuditTarget.model_validate({**target_payload(), key: target_payload()[key] + " "})

    def test_sparse_old_defaults_are_not_resolved(self):
        payload = replace_config(target_payload(), lambda config: config["account"].pop("leverage"))
        with self.assertRaisesRegex(ValueError, "RESOLVED_SOURCE_SETTINGS_REQUIRED"):
            PinnedSelectionAuditTarget.model_validate(payload)

    def test_seed_must_be_explicit(self):
        payload = replace_config(target_payload(), lambda config: config["calibration"].pop("random_seed"))
        with self.assertRaisesRegex(ValueError, "EXPLICIT_SOURCE_WINDOW_AND_SEED_REQUIRED"):
            PinnedSelectionAuditTarget.model_validate(payload)

    def test_causal_source_is_not_flattened_to_last_fold(self):
        def change(config):
            config["calibration"].update(optimization_schedule="per_fold_causal", optimization_mode="mode_4_is_only_robust")
        with self.assertRaisesRegex(ValueError, "PER_FOLD_TARGET_SEQUENCE_REQUIRED"):
            PinnedSelectionAuditTarget.model_validate(replace_config(target_payload(), change))

    def test_missing_parameter_surface_is_refused(self):
        payload = target_payload()
        selection = json.loads(payload["source_selection_raw"])
        selection["params"].pop("window")
        raw = json.dumps(selection)
        payload.update(source_selection_raw=raw, source_selection_digest=hashlib.sha256(raw.encode()).hexdigest())
        with self.assertRaisesRegex(ValueError, "PARAMETER_SURFACE_MISMATCH"):
            PinnedSelectionAuditTarget.model_validate(payload)

    def test_duplicate_keys_and_nonfinite_original_numbers_are_refused(self):
        for raw, reason in (("{\"params\":{},\"params\":{}}", "DUPLICATE"), ("{\"params\":NaN}", "NONFINITE")):
            with self.subTest(raw=raw), self.assertRaisesRegex(ValueError, reason):
                original_document(raw, hashlib.sha256(raw.encode()).hexdigest(), limit=16384)

    def test_exact_decimals_do_not_round_or_allow_unbounded_expansion(self):
        self.assertEqual(exact_parameter("1.234567890123456789012345678901234"), "1.234567890123456789012345678901234")
        for value in (True, "NaN", "Infinity", "1e999999999", "0e-999999999", "1" * 81):
            with self.subTest(value=value), self.assertRaises(ValueError):
                exact_parameter(value)

    def test_replay_changed_target_or_parent_id_has_no_output(self):
        target = PinnedSelectionAuditTarget.model_validate(target_payload())
        with tempfile.TemporaryDirectory() as directory:
            artifacts = ArtifactRepository(Path(directory) / "outputs")
            for run_id, digest, error in (("rrun_parent", target.target_digest(), "DISTINCT"),
                    ("rrun_child", "0" * 64, "TARGET_DIGEST_MISMATCH"), ("rrun_../bad", target.target_digest(), "unsafe")):
                with self.subTest(run_id=run_id), self.assertRaisesRegex(Exception, error):
                    run_pinned_final_audit(target, expected_target_digest=digest, snapshot_path=Path(directory) / "input.parquet",
                        artifacts=artifacts, run_id=run_id)
            self.assertEqual(list(artifacts.root.iterdir()), [])

    def test_changed_or_symlink_snapshot_refused_before_engine(self):
        target = PinnedSelectionAuditTarget.model_validate(target_payload())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.parquet"
            path.write_bytes(b"different original bytes")
            artifacts = ArtifactRepository(Path(directory) / "outputs")
            link = Path(directory) / "link.parquet"
            link.symlink_to(path)
            for candidate, reason in ((path, "SNAPSHOT_BYTE_DIGEST_MISMATCH"), (link, "IMMUTABLE_SNAPSHOT_FILE_REQUIRED")):
                with self.subTest(candidate=candidate), self.assertRaisesRegex(ValueError, reason):
                    run_pinned_final_audit(target, expected_target_digest=target.target_digest(), snapshot_path=candidate,
                        artifacts=artifacts, run_id="rrun_child")
            self.assertEqual(list(artifacts.root.iterdir()), [])


class NativePinnedAuditTests(unittest.TestCase):
    def test_native_fixed_evaluation_does_not_create_optuna_study(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.parquet"
            build_market_frame().to_parquet(path)
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            target = PinnedSelectionAuditTarget.model_validate(target_payload(before))
            artifacts = ArtifactRepository(Path(directory) / "outputs")
            with patch("optuna.create_study", side_effect=AssertionError("AUDIT_MUST_NOT_CREATE_OPTIMIZER")) as optimizer:
                receipt = run_pinned_final_audit(target, expected_target_digest=target.target_digest(), snapshot_path=path,
                    artifacts=artifacts, run_id="rrun_child")
            optimizer.assert_not_called()
            self.assertEqual(receipt["engine_version"], "1.1.1")
            self.assertEqual(receipt["optimizer_trials"], 0)
            self.assertFalse(receipt["optimizer_reinvoked"])
            self.assertGreaterEqual(receipt["n_folds"], 2)
            self.assertEqual(receipt["parent_run_id"], "rrun_parent")
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
            self.assertEqual({key: exact_parameter(value) for key, value in artifacts.read_json("rrun_child", "selection/selected_params.json")["params"].items()}, target.parameters())
            self.assertEqual([p.name for p in artifacts.root.iterdir()], ["rrun_child"])


class RetainedSelectionPinTests(unittest.TestCase):
    def test_private_preparation_binds_original_parts_without_engine_or_parent_write(self):
        with tempfile.TemporaryDirectory(prefix="p23-audit-prepare-") as temporary:
            root = Path(temporary)
            target = retained_target(root)
            pins = PinnedAuditPreparation.model_validate({key: getattr(target, key) for key in PinnedAuditPreparation.model_fields})
            before = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in root.rglob("*") if path.is_file()}
            prepared = prepare_pinned_audit_target(root / "research-retained", pins)
            self.assertEqual(prepared, target)
            self.assertEqual({str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in root.rglob("*") if path.is_file()}, before)
            changed = pins.model_copy(update={"parent_manifest_digest": "0" * 64})
            with self.assertRaisesRegex(ValueError, "AUDIT_PARENT_MANIFEST_DIGEST_MISMATCH"):
                prepare_pinned_audit_target(root / "research-retained", changed)
            part = root / "research-retained/artifacts/rart_parent/tables/selection/part-000001.parquet"
            part.write_bytes(part.read_bytes() + b"changed")
            with self.assertRaisesRegex(ValueError, "AUDIT_ORIGINAL_RETAINED_DIGEST_MISMATCH"):
                prepare_pinned_audit_target(root / "research-retained", pins)

    def test_original_parquet_selection_and_config_bytes_are_independently_verified(self):
        import pandas as pd
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory)
            payload = target_payload()
            root = store / "research-retained/artifacts" / payload["parent_artifact_id"]
            (root / "tables/selection").mkdir(parents=True)
            config = root / "source_config.json"
            config.write_bytes(payload["source_config_raw"].encode())
            parameters = json.dumps({key: exact_parameter(value) for key, value in GOLDEN_PARAMS.items()}, sort_keys=True)
            part = root / "tables/selection/part-000001.parquet"
            pd.DataFrame([{"source_ordinal": 0, "parameters_json": parameters}]).to_parquet(part, index=False)
            part_hash = hashlib.sha256(part.read_bytes()).hexdigest()
            manifest = {"run_id": payload["parent_run_id"], "artifact_id": payload["parent_artifact_id"], "artifact_revision": 1,
                "documents": [{"name": "source_config", "relative_path": "source_config.json",
                    "bytes": config.stat().st_size, "sha256": payload["source_config_digest"]}],
                "tables": [{"table_kind": "selection", "rows": 1, "parts": [{"relative_path": "tables/selection/part-000001.parquet",
                    "rows": 1, "bytes": part.stat().st_size, "sha256": part_hash}]}]}
            original_manifest = json.dumps(manifest).encode()
            (root / "manifest.json").write_bytes(original_manifest)
            payload.update(parent_manifest_digest=hashlib.sha256(original_manifest).hexdigest(),
                source_selection_kind="P05_SELECTION_PARAMETERS_JSON", source_selection_raw=parameters,
                source_selection_digest=hashlib.sha256(parameters.encode()).hexdigest(), source_selection_part_digest=part_hash,
                source_selection_part_relative_path="tables/selection/part-000001.parquet")
            target = PinnedSelectionAuditTarget.model_validate(payload)
            verify_retained_target(target, store)
            self.assertEqual(target.parameters(), {key: exact_parameter(value) for key, value in GOLDEN_PARAMS.items()})
            # Equal numeric values with different text are not original bytes.
            alternate = parameters + " "
            with self.assertRaisesRegex(ValueError, "SELECTION_ROW_MISMATCH"):
                verify_retained_target(PinnedSelectionAuditTarget.model_validate({**payload,
                    "source_selection_raw": alternate, "source_selection_digest": hashlib.sha256(alternate.encode()).hexdigest()}), store)
            original_part = part.read_bytes()
            part.write_bytes(original_part[:-1] + b"X")
            with self.assertRaisesRegex(ValueError, "PART_BYTE_MISMATCH"):
                verify_retained_target(target, store)
            part.write_bytes(original_part)
            config.write_bytes(config.read_bytes() + b" ")
            with self.assertRaisesRegex(ValueError, "CONFIG_BYTE_MISMATCH"):
                verify_retained_target(target, store)

    def test_retained_target_cannot_omit_part_pins_or_origin(self):
        for change in ({"source_selection_kind": "P05_SELECTION_PARAMETERS_JSON"},
                {"source_selection_part_digest": "0" * 64}, {"source_selection_part_relative_path": "../../manifest.json"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                PinnedSelectionAuditTarget.model_validate({**target_payload(), **change})


class IsolatedPinnedAuditTests(unittest.TestCase):
    def test_real_namespace_child_preserves_pins_and_rejects_duplicate_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "snapshot.parquet"
            build_market_frame().to_parquet(snapshot)
            before = hashlib.sha256(snapshot.read_bytes()).hexdigest()
            target = PinnedSelectionAuditTarget.model_validate(target_payload(before))
            receipt = PinnedAuditChildReceipt(job_id="rjob_audit", run_id="rrun_child",
                worker_attempt_id="rwa_audit", lease_epoch=1, market_path=snapshot,
                artifact_root=root / "custody", target=target, expected_target_digest=target.target_digest())
            supervisor = IsolatedResearchSupervisor(root / "scratch", allowed_market_root=root)
            result = supervisor.run_delta_wfo(receipt)
            self.assertNotEqual(result.network_namespace, os.readlink("/proc/self/ns/net"))
            self.assertNotEqual(result.launcher_pid, os.getpid())
            # Both processes may be PID 1 in different namespaces. Comparing
            # namespace-local child PID to the parent PID is not isolation proof.
            self.assertEqual(result.child_pid, 1)
            self.assertEqual(result.engine_version, "1.1.1")
            self.assertEqual(result.trial_rows, 0)
            self.assertEqual(result.audit_receipt["target_digest"], target.target_digest())
            self.assertFalse(result.audit_receipt["optimizer_reinvoked"])
            self.assertEqual(result.audit_receipt["optimizer_trials"], 0)
            self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), before)
            self.assertLessEqual(result.output_files, 64)
            self.assertLessEqual(result.output_bytes, 64 * 1024 ** 2)
            self.assertFalse(Path(f"/proc/{result.launcher_pid}").exists())
            with self.assertRaisesRegex(Exception, "only once"):
                supervisor.run_delta_wfo(receipt)
            self.assertTrue(supervisor.retire_terminal_scratch(job_id=receipt.job_id, run_id=receipt.run_id,
                worker_attempt_id=receipt.worker_attempt_id, lease_epoch=receipt.lease_epoch))
            self.assertFalse((root / "scratch" / receipt.job_id / receipt.worker_attempt_id).exists())

    def test_audit_limits_cannot_expand_with_preview_flag(self):
        target = PinnedSelectionAuditTarget.model_validate(target_payload())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = PinnedAuditChildReceipt(job_id="rjob_audit", run_id="rrun_child", worker_attempt_id="rwa_audit",
                lease_epoch=1, market_path=root / "none.parquet", artifact_root=root / "custody",
                target=target, expected_target_digest=target.target_digest())
            supervisor = IsolatedResearchSupervisor(root / "scratch", allowed_market_root=root)
            for limits in (ResearchChildLimits(cpu_seconds=121), ResearchChildLimits(wall_seconds=241),
                    ResearchChildLimits(memory_bytes=5 * 1024 ** 3), ResearchChildLimits(scratch_bytes=129 * 1024 ** 2)):
                with self.subTest(limits=limits), self.assertRaisesRegex(Exception, "cannot widen"):
                    supervisor.run_delta_wfo(receipt, limits=limits)

    def test_lease_epoch_and_target_are_strict_and_child_has_no_search_knobs(self):
        target = PinnedSelectionAuditTarget.model_validate(target_payload())
        base = {"job_id": "rjob_audit", "run_id": "rrun_child", "worker_attempt_id": "rwa_audit", "lease_epoch": 1,
            "market_path": Path("/input.parquet"), "artifact_root": Path("/custody"),
            "target": target, "expected_target_digest": target.target_digest()}
        for change in ({"lease_epoch": True}, {"expected_target_digest": "0" * 64}, {"run_id": target.parent_run_id}):
            with self.subTest(change=change), self.assertRaises(Exception):
                PinnedAuditChildReceipt(**{**base, **change}).as_payload(output_root=Path("/output"))
        payload = PinnedAuditChildReceipt(**base).as_payload(output_root=Path("/output"))
        self.assertNotIn("optuna_trials", payload)
        self.assertNotIn("pinned_parameters", payload)
        self.assertEqual(payload["task"], "P23_PINNED_FINAL_AUDIT")

    def test_child_rejects_extra_search_knobs_before_execution(self):
        from portal_api.workers.research_child import _run_p23_pinned_final_audit
        target = PinnedSelectionAuditTarget.model_validate(target_payload())
        receipt = PinnedAuditChildReceipt(job_id="rjob_audit", run_id="rrun_child", worker_attempt_id="rwa_audit",
            lease_epoch=1, market_path=Path("/input.parquet"), artifact_root=Path("/custody"), target=target,
            expected_target_digest=target.target_digest()).as_payload(output_root=Path("/output"))
        for extra in ({"optuna_trials": 1}, {"pinned_parameters": {"window": "32"}}, {"url": "https://source"}):
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, "exactly"):
                _run_p23_pinned_final_audit({**receipt, **extra}, Path("/output"))


if __name__ == "__main__":
    unittest.main()
