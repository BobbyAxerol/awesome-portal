#!/usr/bin/env python3
"""Offline tests for the N12 command publication verifier."""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("execution-n12-command-publication-verify.py")
SPEC = importlib.util.spec_from_file_location("execution_n12_command_publication_verify", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class N12CommandPublicationVerifyTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        request = MODULE.REQUEST_DIR
        self.catalogue = self.read(request / "command-capability-catalogue.example.json")
        self.corpus = self.read(request / "terminal-corpus-index.example.json")
        self.results = self.read(request / "acceptance-results.example.json")
        self.manifest = self.read(request / "owner-publication.manifest.example.json")

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def read(path):
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def pack(self, accepted=False, partial=False, mutate_catalogue=None, mutate_corpus=None, mutate_results=None, mutate_manifest=None):
        pack = self.root / f"pack-{len(list(self.root.iterdir()))}"
        pack.mkdir()
        catalogue = copy.deepcopy(self.catalogue)
        catalogue.update(source_contract_revision="trading.portal-command.v1", source_contract_commit="a" * 40, owner_accepted=accepted, partial_publication=partial)
        for index, capability in enumerate(catalogue["capabilities"]):
            published = not partial or index < 2
            capability.update(published=published, portal_reachable=published)
            if not published:
                continue
            identifier = capability["id"]
            request_schema = pack / "schemas" / f"{identifier}.request.schema.json"
            receipt_schema = pack / "schemas" / f"{identifier}.receipt.schema.json"
            request_fixture = pack / "fixtures" / f"{identifier}.request.valid.json"
            accepted_fixture = pack / "fixtures" / f"{identifier}.accepted.valid.json"
            terminal_fixture = pack / "fixtures" / f"{identifier}.terminal.valid.json"
            self.write(request_schema, {"type": "object", "required": ["operation_id"]})
            self.write(receipt_schema, {"type": "object", "required": ["source_operation_id", "status"]})
            self.write(request_fixture, {"schema_version": "trading.command-request.v1", "capability_id": identifier, "operation_id": f"op-{index}", "request_key": f"req-{index}", "payload_hash": "sha256:" + "c" * 64, "environment": capability["environments"][0], "target_type": capability["target_types"][0], "target_id": f"target-{index}", "expected_target_version": 1, "actor_id": "operator-1", "risk_tier": capability["risk_tier"], "expires_at": "2026-08-26T01:00:00Z"})
            self.write(accepted_fixture, {"schema_version": "trading.command-receipt.v1", "capability_id": identifier, "source_operation_id": f"source-{index}", "status": "ACCEPTED_NONTERMINAL", "accepted_at": "2026-08-26T00:00:00Z", "trace_id": f"trace-{index}"})
            self.write(terminal_fixture, {"schema_version": "trading.command-receipt.v1", "capability_id": identifier, "source_operation_id": f"source-{index}", "status": "SUCCEEDED", "terminal_at": "2026-08-26T00:00:01Z", "trace_id": f"trace-{index}"})
            capability["request_schema_sha256"] = MODULE.digest(request_schema)
            capability["receipt_schema_sha256"] = MODULE.digest(receipt_schema)
        if mutate_catalogue:
            mutate_catalogue(catalogue)

        corpus = copy.deepcopy(self.corpus)
        corpus["files"] = {}
        for capability in catalogue["capabilities"]:
            if not capability["published"]:
                continue
            identifier = capability["id"]
            files = {
                "request_schema_file": f"schemas/{identifier}.request.schema.json",
                "receipt_schema_file": f"schemas/{identifier}.receipt.schema.json",
                "request_fixture_file": f"fixtures/{identifier}.request.valid.json",
                "accepted_fixture_file": f"fixtures/{identifier}.accepted.valid.json",
                "terminal_fixture_file": f"fixtures/{identifier}.terminal.valid.json",
            }
            for key, relative in list(files.items()):
                files[key.replace("_file", "_sha256")] = MODULE.digest(pack / relative)
            corpus["files"][identifier] = files
        if mutate_corpus:
            mutate_corpus(corpus)

        results = copy.deepcopy(self.results)
        results["synthetic_example"] = not accepted
        if accepted:
            for index, case in enumerate(results["cases"], start=1):
                case["passed"] = True
                case["evidence_sha256"] = "sha256:" + format(index, "x")[-1] * 64
        if mutate_results:
            mutate_results(results)

        self.write(pack / "command-capability-catalogue.json", catalogue)
        self.write(pack / "terminal-corpus-index.json", corpus)
        self.write(pack / "acceptance-results.json", results)

        manifest = copy.deepcopy(self.manifest)
        manifest.update(source_contract_revision=catalogue["source_contract_revision"], source_contract_commit=catalogue["source_contract_commit"], source_image_digest="sha256:" + "d" * 64, owner_id=catalogue["owner_id"], owner_accepted=accepted, owner_acceptance_evidence_sha256=("sha256:" + "e" * 64 if accepted else MODULE.ZERO_DIGEST), command_capability_catalogue_sha256=MODULE.digest(pack / "command-capability-catalogue.json"), terminal_corpus_index_sha256=MODULE.digest(pack / "terminal-corpus-index.json"), acceptance_results_sha256=MODULE.digest(pack / "acceptance-results.json"))
        if mutate_manifest:
            mutate_manifest(manifest)
        self.write(pack / "owner-publication.manifest.json", manifest)
        return pack

    def test_template_is_non_authoritative(self):
        result = MODULE.validate_template()
        self.assertEqual(result["decision"], "N12_REQUEST_TEMPLATE_VALID")
        self.assertEqual(result["capability_count"], 9)
        self.assertFalse(result["portal_activation"])

    def test_candidate_and_owner_acceptance_never_activate_portal(self):
        candidate = MODULE.validate_pack(self.pack(), "candidate")
        self.assertEqual(candidate["published_capability_count"], 9)
        self.assertFalse(candidate["portal_activation"])
        accepted = MODULE.validate_pack(self.pack(accepted=True), "acceptance")
        self.assertEqual(accepted["decision"], "N12_OWNER_PUBLICATION_ACCEPTED")
        self.assertFalse(accepted["portal_activation"])

    def test_partial_publication_is_explicit_and_bounded(self):
        result = MODULE.validate_pack(self.pack(partial=True), "candidate")
        self.assertEqual(result["published_capability_count"], 2)

    def test_read_identity_or_authority_widening_is_rejected(self):
        def mutate(catalogue):
            catalogue["authority"]["separate_from_read_identity"] = False
        with self.assertRaisesRegex(MODULE.PublicationError, "read identity"):
            MODULE.validate_pack(self.pack(mutate_catalogue=mutate), "candidate")

    def test_risk_policy_or_route_drift_is_rejected(self):
        def mutate(catalogue):
            catalogue["capabilities"][-1]["requires_dual_approval"] = False
        with self.assertRaisesRegex(MODULE.PublicationError, "safety semantics"):
            MODULE.validate_pack(self.pack(mutate_catalogue=mutate), "candidate")

    def test_accepted_202_cannot_be_terminal(self):
        def mutate(corpus):
            first = next(iter(corpus["files"].values()))
            path = self.root / "unused"
            del path
            first["accepted_fixture_sha256"] = "sha256:" + "f" * 64
        with self.assertRaisesRegex(MODULE.PublicationError, "digest mismatch"):
            MODULE.validate_pack(self.pack(mutate_corpus=mutate), "candidate")

    def test_missing_negative_or_failed_acceptance_case_is_rejected(self):
        def mutate(corpus):
            corpus["required_negative_cases"].pop()
        with self.assertRaisesRegex(MODULE.PublicationError, "coverage drifted"):
            MODULE.validate_pack(self.pack(mutate_corpus=mutate), "candidate")
        def fail(results):
            results["cases"][0]["passed"] = False
        with self.assertRaisesRegex(MODULE.PublicationError, "did not pass"):
            MODULE.validate_pack(self.pack(accepted=True, mutate_results=fail), "acceptance")

    def test_manifest_hash_drift_and_symlink_are_rejected(self):
        def mutate(manifest):
            manifest["terminal_corpus_index_sha256"] = "sha256:" + "f" * 64
        with self.assertRaisesRegex(MODULE.PublicationError, "digest mismatch"):
            MODULE.validate_pack(self.pack(mutate_manifest=mutate), "candidate")
        pack = self.pack()
        target = pack / "fixtures" / "paper.halt.request.valid.json"
        target.unlink()
        target.symlink_to(pack / "fixtures" / "paper.halt.accepted.valid.json")
        with self.assertRaisesRegex(MODULE.PublicationError, "non-symlinks"):
            MODULE.validate_pack(pack, "candidate")

    def test_secret_shaped_fixture_and_unsafe_path_are_rejected(self):
        pack = self.pack()
        fixture = pack / "fixtures" / "paper.halt.request.valid.json"
        payload = self.read(fixture)
        payload["api_key"] = "not-a-real-secret"
        self.write(fixture, payload)
        with self.assertRaises(MODULE.PublicationError):
            MODULE.validate_pack(pack, "candidate")
        def unsafe(corpus):
            corpus["files"]["paper.halt"]["request_schema_file"] = "../outside.json"
        with self.assertRaisesRegex(MODULE.PublicationError, "unsafe"):
            MODULE.validate_pack(self.pack(mutate_corpus=unsafe), "candidate")


if __name__ == "__main__":
    unittest.main()
