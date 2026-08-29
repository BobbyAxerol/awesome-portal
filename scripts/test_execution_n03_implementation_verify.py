#!/usr/bin/env python3
"""Offline fail-closed tests for the N03 owner implementation verifier."""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("execution-n03-implementation-verify.py")
SPEC = importlib.util.spec_from_file_location("execution_n03_implementation_verify", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class N03ImplementationVerifyTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        request = MODULE.REQUEST_DIRECTORY
        self.profile_template = self._read(request / "implementation-profile.example.json")
        self.metrics_template = self._read(request / "source-metrics.example.json")
        self.query_template = self._read(request / "query-plan-evidence.example.json")
        self.results_template = self._read(request / "acceptance-results.example.json")
        self.manifest_template = self._read(request / "owner-implementation.manifest.example.json")
        self.n02_pack = self._make_n02_pack()
        self.n02_result = MODULE.N02.validate_pack(self.n02_pack, mode="acceptance")

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def _read(path):
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write(path, value):
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def _make_n02_pack(self):
        pack = self.root / "n02-owner-pack"
        pack.mkdir()
        source = MODULE.N02.REQUEST_DIRECTORY
        contract = self._read(source / "incremental-contract.example.json")
        contract["status"] = "OWNER_PUBLISHED"
        fixtures = self._read(source / "compatibility-fixtures.example.json")
        errors = self._read(source / "error-corpus.example.json")
        self._write(pack / "incremental-contract.json", contract)
        self._write(pack / "compatibility-fixtures.json", fixtures)
        self._write(pack / "error-corpus.json", errors)
        manifest = self._read(source / "owner-pack.manifest.example.json")
        manifest.update(
            source_contract_commit="1" * 40,
            owner_accepted=True,
            owner_acceptance_evidence_sha256="sha256:" + "2" * 64,
        )
        manifest["files"] = {
            name: MODULE.N02.digest(pack / name) for name in sorted(MODULE.N02.PACK_FILES)
        }
        manifest["capability_contract_sha256"] = manifest["files"]["incremental-contract.json"]
        self._write(pack / "owner-pack.manifest.json", manifest)
        return pack

    def pack(
        self,
        *,
        accepted=False,
        profile_mutator=None,
        metrics_mutator=None,
        query_mutator=None,
        results_mutator=None,
        manifest_mutator=None,
    ):
        pack = self.root / f"n03-pack-{len(list(self.root.iterdir()))}"
        pack.mkdir()
        profile = copy.deepcopy(self.profile_template)
        profile["status"] = "OWNER_PUBLISHED" if accepted else "OWNER_DRAFT"
        if profile_mutator:
            profile_mutator(profile)
        metrics = copy.deepcopy(self.metrics_template)
        metrics["synthetic_example"] = False
        if metrics_mutator:
            metrics_mutator(metrics)
        query = copy.deepcopy(self.query_template)
        query["synthetic_example"] = False
        for index, entity in enumerate(query["entities"], start=3):
            entity["plan_sha256"] = "sha256:" + str(index) * 64
        if query_mutator:
            query_mutator(query)
        results = copy.deepcopy(self.results_template)
        if accepted:
            for index, case in enumerate(results["cases"]):
                case["passed"] = True
                case["evidence_sha256"] = "sha256:" + format(index + 1, "x") * 64
        if results_mutator:
            results_mutator(results)
        values = {
            "implementation-profile.json": profile,
            "source-metrics.json": metrics,
            "query-plan-evidence.json": query,
            "acceptance-results.json": results,
        }
        for name, value in values.items():
            self._write(pack / name, value)

        manifest = copy.deepcopy(self.manifest_template)
        manifest.update(
            source_implementation_commit="a" * 40,
            image_digest="sha256:" + "b" * 64,
            contract_sha256=self.n02_result["capability_contract_sha256"],
            n02_owner_pack_manifest_sha256=self.n02_result["owner_pack_manifest_sha256"],
            owner_accepted=accepted,
            owner_acceptance_evidence_sha256=(
                "sha256:" + ("c" * 64 if accepted else "0" * 64)
            ),
        )
        manifest["files"] = {
            name: MODULE.digest(pack / name) for name in sorted(MODULE.PACK_FILES)
        }
        if manifest_mutator:
            manifest_mutator(manifest)
        self._write(pack / "owner-implementation.manifest.json", manifest)
        return pack

    def test_request_template_is_valid_and_non_authoritative(self):
        result = MODULE.validate_template()
        self.assertEqual(result["decision"], "N03_IMPLEMENTATION_REQUEST_TEMPLATE_VALID")
        self.assertFalse(result["owner_accepted"])
        self.assertFalse(result["runtime_active"])

    def test_candidate_is_bound_to_an_accepted_n02_pack(self):
        pack = self.pack()
        result = MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        self.assertEqual(result["decision"], "N03_OWNER_IMPLEMENTATION_CANDIDATE_VALID")
        self.assertFalse(result["portal_activation"])

    def test_acceptance_requires_owner_publication_and_all_results(self):
        pack = self.pack(accepted=True)
        result = MODULE.validate_pack(pack, mode="acceptance", n02_pack_dir=self.n02_pack)
        self.assertEqual(result["decision"], "N03_OWNER_IMPLEMENTATION_ACCEPTED")
        self.assertTrue(result["owner_accepted"])
        draft = self.pack()
        with self.assertRaisesRegex(MODULE.ImplementationError, "publication status"):
            MODULE.validate_pack(draft, mode="acceptance", n02_pack_dir=self.n02_pack)

    def test_unaccepted_or_drifted_n02_pack_blocks_n03(self):
        manifest = self._read(self.n02_pack / "owner-pack.manifest.json")
        manifest["owner_accepted"] = False
        self._write(self.n02_pack / "owner-pack.manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.ImplementationError, "accepted N02 owner pack"):
            MODULE.validate_pack(self.pack(), mode="candidate", n02_pack_dir=self.n02_pack)

    def test_contract_and_n02_manifest_digest_drift_fail_closed(self):
        pack = self.pack(
            manifest_mutator=lambda value: value.update(contract_sha256="sha256:" + "d" * 64)
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "accepted N02 contract"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            manifest_mutator=lambda value: value.update(
                n02_owner_pack_manifest_sha256="sha256:" + "e" * 64
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "accepted N02 owner pack"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_v1_scope_listener_method_and_route_widening_are_rejected(self):
        pack = self.pack(
            profile_mutator=lambda value: value.update(contract_revision="d4.paper-read.v1")
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "not bound"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        for mutator in (
            lambda value: value["scope"].update(caller_selectable=True),
            lambda value: value["transport"].update(host_publication="PUBLIC"),
            lambda value: value["transport"].update(methods=["GET", "POST"]),
            lambda value: value["transport"].update(routes=["/v2/events", "/admin"]),
        ):
            pack = self.pack(profile_mutator=mutator)
            with self.assertRaises(MODULE.ImplementationError):
                MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_read_identity_and_portal_credential_boundary_are_required(self):
        pack = self.pack(
            profile_mutator=lambda value: value["source_access"].update(
                portal_receives_database_credential=True
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "read-only"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_consumer_lease_must_stop_idle_source_scans(self):
        pack = self.pack(
            profile_mutator=lambda value: value["lease_and_demand"].update(
                no_background_scan_without_active_lease=False
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "source-idle"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            metrics_mutator=lambda value: value["observation"].update(
                idle_source_select_delta=1
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "non-zero"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_ordinary_delta_full_scan_and_unsafe_cursor_behavior_are_rejected(self):
        pack = self.pack(
            profile_mutator=lambda value: value["query_behavior"].update(
                ordinary_delta_request_full_scan=True
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "unsafe"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            profile_mutator=lambda value: value["query_behavior"].update(
                cursor_advance_after_durable_page_ack=False
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "unsafe"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_metrics_are_monotonic_and_within_declared_resource_bounds(self):
        pack = self.pack(
            metrics_mutator=lambda value: value["observation"].update(
                p50_freshness_ms=500, p95_freshness_ms=100
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "not monotonic"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            metrics_mutator=lambda value: value["observation"].update(
                peak_rss_bytes=536870913
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "RSS"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            profile_mutator=lambda value: value["bounds"].update(maximum_page_rows=1001)
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "accepted N02 contract"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_query_plan_evidence_is_complete_redacted_and_incremental(self):
        pack = self.pack(
            query_mutator=lambda value: value.update(contains_sql_or_business_values=True)
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "redaction"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            query_mutator=lambda value: value["entities"][0].update(
                ordinary_delta_seq_scan=True
            )
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "bounded incremental"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_acceptance_requires_thirty_minute_idle_and_meaningful_active_sample(self):
        pack = self.pack(
            accepted=True,
            metrics_mutator=lambda value: value["observation"].update(
                idle_after_lease_expiry_seconds=1799
            ),
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "too short"):
            MODULE.validate_pack(pack, mode="acceptance", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            accepted=True,
            metrics_mutator=lambda value: value["observation"].update(active_request_count=99),
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "too short"):
            MODULE.validate_pack(pack, mode="acceptance", n02_pack_dir=self.n02_pack)

    def test_acceptance_corpus_is_exact_and_every_case_is_proven(self):
        pack = self.pack(
            accepted=True,
            results_mutator=lambda value: value["cases"][3].update(passed=False),
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "not proven"):
            MODULE.validate_pack(pack, mode="acceptance", n02_pack_dir=self.n02_pack)
        pack = self.pack(results_mutator=lambda value: value["cases"].pop())
        with self.assertRaisesRegex(MODULE.ImplementationError, "incomplete"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)

    def test_manifest_digest_image_commit_and_owner_evidence_are_required(self):
        pack = self.pack(
            manifest_mutator=lambda value: value.update(source_implementation_commit="0" * 40)
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "commit"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            manifest_mutator=lambda value: value.update(image_digest=MODULE.ZERO_SHA256)
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "image digest"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack(
            accepted=True,
            manifest_mutator=lambda value: value.update(
                owner_acceptance_evidence_sha256=MODULE.ZERO_SHA256
            ),
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "placeholder"):
            MODULE.validate_pack(pack, mode="acceptance", n02_pack_dir=self.n02_pack)

    def test_extra_files_symlinks_relative_paths_duplicate_keys_and_authority_fail(self):
        pack = self.pack()
        (pack / "runtime-secret.env").write_text("NO=\n", encoding="utf-8")
        with self.assertRaisesRegex(MODULE.ImplementationError, "unexpected files"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        pack = self.pack()
        target = pack / "source-metrics.json"
        target.unlink()
        target.symlink_to(MODULE.REQUEST_DIRECTORY / "source-metrics.example.json")
        with self.assertRaisesRegex(MODULE.ImplementationError, "non-symlinks"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)
        with self.assertRaisesRegex(MODULE.ImplementationError, "absolute"):
            MODULE.validate_pack(
                pathlib.Path("relative"), mode="candidate", n02_pack_dir=self.n02_pack
            )
        duplicate = self.root / "duplicate.json"
        duplicate.write_text('{"schema_version":"one","schema_version":"two"}')
        with self.assertRaisesRegex(MODULE.ImplementationError, "duplicate object key"):
            MODULE.read_json(duplicate)
        pack = self.pack(
            manifest_mutator=lambda value: value["authority"].update(portal_activation=True)
        )
        with self.assertRaisesRegex(MODULE.ImplementationError, "widened"):
            MODULE.validate_pack(pack, mode="candidate", n02_pack_dir=self.n02_pack)


if __name__ == "__main__":
    unittest.main()
