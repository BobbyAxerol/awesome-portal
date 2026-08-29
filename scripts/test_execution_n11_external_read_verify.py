#!/usr/bin/env python3
"""Offline fail-closed tests for the N11 external-read publication verifier."""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("execution-n11-external-read-verify.py")
SPEC = importlib.util.spec_from_file_location("execution_n11_external_read_verify", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class N11ExternalReadVerifyTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        source = MODULE.REQUEST_DIR
        self.catalogue_template = self.read(source / "capability-catalogue.example.json")
        self.semantics_template = self.read(source / "semantic-rulings.example.json")
        self.corpus_template = self.read(source / "golden-corpus-index.example.json")
        self.results_template = self.read(source / "acceptance-results.example.json")
        self.manifest_template = self.read(source / "owner-publication.manifest.example.json")

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def read(path):
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def pack(
        self,
        *,
        accepted=False,
        partial=False,
        catalogue_mutator=None,
        semantics_mutator=None,
        corpus_mutator=None,
        results_mutator=None,
        manifest_mutator=None,
    ):
        pack = self.root / f"pack-{len(list(self.root.iterdir()))}"
        pack.mkdir()
        catalogue = copy.deepcopy(self.catalogue_template)
        catalogue.update(
            source_contract_revision="trading.portal-read.v1",
            source_contract_commit="a" * 40,
            owner_accepted=accepted,
            partial_publication=partial,
        )
        for capability in catalogue["capabilities"]:
            capability.update(published=True, portal_reachable=True)
        if catalogue_mutator:
            catalogue_mutator(catalogue)

        for capability in catalogue["capabilities"]:
            identifier = capability["id"]
            schema_path = pack / "schemas" / f"{identifier}.schema.json"
            fixture_path = pack / "fixtures" / f"{identifier}.valid.json"
            self.write(
                schema_path,
                {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "required": ["authority", "data"],
                    "properties": {"authority": {"const": "EXECUTION_CELL"}, "data": {"type": "object"}},
                },
            )
            self.write(
                fixture_path,
                {
                    "authority": "EXECUTION_CELL",
                    "as_of": "2026-08-26T00:00:00Z",
                    "source_sequence": 1,
                    "freshness": "FRESH",
                    "completeness": "COMPLETE",
                    "projection_lag_ms": 0,
                    "trace_id": f"n11-{identifier}",
                    "data": {},
                },
            )
            capability.update(
                response_schema_sha256=MODULE.digest(schema_path),
                positive_fixture_sha256=MODULE.digest(fixture_path),
            )

        semantics = copy.deepcopy(self.semantics_template)
        semantics["owner_accepted"] = accepted
        if accepted:
            semantics["order_status_buckets"]["ruling"] = "OWNER_ACCEPTED"
            semantics["order_funnel"]["ruling"] = "FOUR_STAGE_AUTHORITATIVE"
            semantics["packed_correlation"]["ruling"] = "OWNER_ACCEPTED"
            semantics["packed_correlation"]["selected_diagonal_semantics"] = "SELF_PAIR_SAMPLE_COUNT"
            semantics["vnm_calendar"]["ruling"] = "OWNER_PUBLISHED"
        if semantics_mutator:
            semantics_mutator(semantics)

        corpus = copy.deepcopy(self.corpus_template)
        corpus["files"] = {
            capability["id"]: {
                "response_schema_sha256": capability["response_schema_sha256"],
                "response_schema_file": f"schemas/{capability['id']}.schema.json",
                "positive_fixture_sha256": capability["positive_fixture_sha256"],
                "positive_fixture_file": f"fixtures/{capability['id']}.valid.json",
            }
            for capability in catalogue["capabilities"]
            if capability["published"]
        }
        if corpus_mutator:
            corpus_mutator(corpus)

        results = copy.deepcopy(self.results_template)
        results["synthetic_example"] = False
        if accepted:
            for index, case in enumerate(results["cases"], start=1):
                case["passed"] = True
                digit = format(((index - 1) % 15) + 1, "x")
                case["evidence_sha256"] = "sha256:" + digit * 64
        if results_mutator:
            results_mutator(results)

        values = {
            "capability-catalogue.json": catalogue,
            "semantic-rulings.json": semantics,
            "golden-corpus-index.json": corpus,
            "acceptance-results.json": results,
        }
        for name, value in values.items():
            self.write(pack / name, value)

        manifest = copy.deepcopy(self.manifest_template)
        manifest.update(
            source_contract_revision=catalogue["source_contract_revision"],
            source_contract_commit=catalogue["source_contract_commit"],
            source_image_digest="sha256:" + "b" * 64,
            owner_id=catalogue["owner_id"],
            owner_accepted=accepted,
            owner_acceptance_evidence_sha256=("sha256:" + "c" * 64 if accepted else MODULE.ZERO_DIGEST),
            capability_catalogue_sha256=MODULE.digest(pack / "capability-catalogue.json"),
            semantic_rulings_sha256=MODULE.digest(pack / "semantic-rulings.json"),
            golden_corpus_index_sha256=MODULE.digest(pack / "golden-corpus-index.json"),
            acceptance_results_sha256=MODULE.digest(pack / "acceptance-results.json"),
        )
        if manifest_mutator:
            manifest_mutator(manifest)
        self.write(pack / "owner-publication.manifest.json", manifest)
        return pack

    def test_template_is_complete_and_non_authoritative(self):
        result = MODULE.validate_template()
        self.assertEqual(result["decision"], "N11_REQUEST_TEMPLATE_VALID")
        self.assertEqual(result["capability_count"], 24)
        self.assertFalse(result["owner_accepted"])
        self.assertFalse(result["runtime_active"])

    def test_candidate_is_valid_but_cannot_activate_portal(self):
        result = MODULE.validate_pack(self.pack(), "candidate")
        self.assertEqual(result["decision"], "N11_OWNER_PUBLICATION_CANDIDATE_VALID")
        self.assertEqual(result["published_capability_count"], 24)
        self.assertFalse(result["portal_activation"])

    def test_owner_accepted_pack_passes_without_activating_runtime(self):
        result = MODULE.validate_pack(self.pack(accepted=True), "acceptance")
        self.assertEqual(result["decision"], "N11_OWNER_PUBLICATION_ACCEPTED")
        self.assertTrue(result["owner_accepted"])
        self.assertFalse(result["portal_activation"])

    def test_database_redis_cli_broker_and_command_authority_are_rejected(self):
        for field in (
            "portal_database_credential", "portal_redis_authority", "portal_cli_authority",
            "portal_broker_authority", "command_or_mutation",
        ):
            pack = self.pack(catalogue_mutator=lambda value, field=field: value["authority"].update({field: True}))
            with self.assertRaisesRegex(MODULE.PublicationError, "widened"):
                MODULE.validate_pack(pack, "candidate")

    def test_method_route_auth_and_bounds_are_exact(self):
        mutators = (
            lambda value: value["capabilities"][0].update(method="POST"),
            lambda value: value["capabilities"][0].update(path_template="/redis/scan"),
            lambda value: value["capabilities"][0].update(authentication="API_KEY"),
            lambda value: value["capabilities"][0].update(maximum_page_rows=201),
            lambda value: value["capabilities"][0].update(maximum_response_bytes=8_388_609),
        )
        for mutator in mutators:
            with self.assertRaisesRegex(MODULE.PublicationError, "drifted"):
                MODULE.validate_pack(self.pack(catalogue_mutator=mutator), "candidate")

    def test_complete_publication_cannot_omit_a_capability(self):
        pack = self.pack(catalogue_mutator=lambda value: value["capabilities"].pop())
        with self.assertRaisesRegex(MODULE.PublicationError, "missing capabilities"):
            MODULE.validate_pack(pack, "candidate")

    def test_partial_publication_is_explicit_and_corpus_matches_subset(self):
        pack = self.pack(partial=True, catalogue_mutator=lambda value: value["capabilities"].__setitem__(slice(1, None), []))
        result = MODULE.validate_pack(pack, "candidate")
        self.assertTrue(result["partial_publication"])
        self.assertEqual(result["published_capability_count"], 1)

    def test_published_capability_requires_nonzero_schema_and_fixture_digests(self):
        pack = self.pack()
        catalogue = self.read(pack / "capability-catalogue.json")
        catalogue["capabilities"][0]["response_schema_sha256"] = MODULE.ZERO_DIGEST
        self.write(pack / "capability-catalogue.json", catalogue)
        manifest = self.read(pack / "owner-publication.manifest.json")
        manifest["capability_catalogue_sha256"] = MODULE.digest(pack / "capability-catalogue.json")
        self.write(pack / "owner-publication.manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.PublicationError, "evidence digest"):
            MODULE.validate_pack(pack, "candidate")

    def test_manifest_binds_every_owner_file(self):
        pack = self.pack(manifest_mutator=lambda value: value.update(capability_catalogue_sha256="sha256:" + "d" * 64))
        with self.assertRaisesRegex(MODULE.PublicationError, "file digest mismatch"):
            MODULE.validate_pack(pack, "candidate")

    def test_manifest_and_catalogue_owner_identity_must_match(self):
        pack = self.pack(manifest_mutator=lambda value: value.update(owner_id="different-owner"))
        with self.assertRaisesRegex(MODULE.PublicationError, "identity differ"):
            MODULE.validate_pack(pack, "candidate")

    def test_acceptance_rejects_unresolved_semantic_rulings(self):
        pack = self.pack(accepted=True, semantics_mutator=lambda value: value["packed_correlation"].update(selected_diagonal_semantics=None))
        with self.assertRaisesRegex(MODULE.PublicationError, "diagonal semantics"):
            MODULE.validate_pack(pack, "acceptance")

    def test_order_bucket_mapping_cannot_drift(self):
        pack = self.pack(semantics_mutator=lambda value: value["order_status_buckets"]["buckets"]["OPEN"].append("DENIED"))
        with self.assertRaisesRegex(MODULE.PublicationError, "bucket semantics"):
            MODULE.validate_pack(pack, "candidate")

    def test_golden_corpus_must_match_every_published_capability_digest(self):
        pack = self.pack(corpus_mutator=lambda value: value["files"].pop("orders.list"))
        with self.assertRaisesRegex(MODULE.PublicationError, "do not match"):
            MODULE.validate_pack(pack, "candidate")
        pack = self.pack(corpus_mutator=lambda value: value["files"]["orders.list"].update(response_schema_sha256="sha256:" + "e" * 64))
        with self.assertRaisesRegex(MODULE.PublicationError, "differs"):
            MODULE.validate_pack(pack, "candidate")

    def test_golden_corpus_artifact_bytes_are_verified(self):
        pack = self.pack()
        fixture = pack / "fixtures" / "orders.list.valid.json"
        payload = self.read(fixture)
        payload["data"] = {"unexpected": True}
        self.write(fixture, payload)
        with self.assertRaisesRegex(MODULE.PublicationError, "artifact bytes"):
            MODULE.validate_pack(pack, "candidate")

    def test_positive_fixture_requires_source_envelope_and_rejects_secret_shape(self):
        pack = self.pack()
        fixture = pack / "fixtures" / "orders.list.valid.json"
        payload = self.read(fixture)
        payload["api_key"] = "redacted-but-still-forbidden"
        self.write(fixture, payload)
        catalogue = self.read(pack / "capability-catalogue.json")
        corpus = self.read(pack / "golden-corpus-index.json")
        updated = MODULE.digest(fixture)
        catalogue["capabilities"][0]["positive_fixture_sha256"] = updated
        corpus["files"]["orders.list"]["positive_fixture_sha256"] = updated
        self.write(pack / "capability-catalogue.json", catalogue)
        self.write(pack / "golden-corpus-index.json", corpus)
        manifest = self.read(pack / "owner-publication.manifest.json")
        manifest["capability_catalogue_sha256"] = MODULE.digest(pack / "capability-catalogue.json")
        manifest["golden_corpus_index_sha256"] = MODULE.digest(pack / "golden-corpus-index.json")
        self.write(pack / "owner-publication.manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.PublicationError, "secret-shaped"):
            MODULE.validate_pack(pack, "candidate")

    def test_acceptance_requires_all_real_results_and_owner_evidence(self):
        pack = self.pack(accepted=True, results_mutator=lambda value: value["cases"][0].update(passed=False))
        with self.assertRaisesRegex(MODULE.PublicationError, "did not pass"):
            MODULE.validate_pack(pack, "acceptance")
        pack = self.pack(accepted=True, manifest_mutator=lambda value: value.update(owner_acceptance_evidence_sha256=MODULE.ZERO_DIGEST))
        with self.assertRaisesRegex(MODULE.PublicationError, "acceptance evidence"):
            MODULE.validate_pack(pack, "acceptance")

    def test_duplicate_json_key_and_symlink_are_rejected(self):
        path = self.root / "duplicate.json"
        path.write_text('{"a":1,"a":2}\n', encoding="utf-8")
        with self.assertRaisesRegex(MODULE.PublicationError, "duplicate"):
            MODULE.read_json(path)
        target = self.root / "target.json"
        target.write_text("{}\n", encoding="utf-8")
        link = self.root / "link.json"
        link.symlink_to(target)
        with self.assertRaisesRegex(MODULE.PublicationError, "non-symlinks"):
            MODULE.read_json(link)


if __name__ == "__main__":
    unittest.main()
