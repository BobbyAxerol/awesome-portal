#!/usr/bin/env python3
"""Offline fail-closed tests for the N02 owner contract-pack verifier."""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("execution-n02-contract-verify.py")
SPEC = importlib.util.spec_from_file_location("execution_n02_contract_verify", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class N02ContractVerifyTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        request = MODULE.REQUEST_DIRECTORY
        self.contract_template = json.loads(
            (request / "incremental-contract.example.json").read_text(encoding="utf-8")
        )
        self.fixtures_template = json.loads(
            (request / "compatibility-fixtures.example.json").read_text(encoding="utf-8")
        )
        self.errors_template = json.loads(
            (request / "error-corpus.example.json").read_text(encoding="utf-8")
        )
        self.manifest_template = json.loads(
            (request / "owner-pack.manifest.example.json").read_text(encoding="utf-8")
        )

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def _write(path, value):
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def pack(self, *, accepted=False, contract_mutator=None, manifest_mutator=None):
        pack = self.root / f"pack-{len(list(self.root.iterdir()))}"
        pack.mkdir()
        contract = copy.deepcopy(self.contract_template)
        contract["status"] = "OWNER_PUBLISHED" if accepted else "OWNER_DRAFT"
        if contract_mutator:
            contract_mutator(contract)
        fixtures = copy.deepcopy(self.fixtures_template)
        errors = copy.deepcopy(self.errors_template)
        self._write(pack / "incremental-contract.json", contract)
        self._write(pack / "compatibility-fixtures.json", fixtures)
        self._write(pack / "error-corpus.json", errors)

        manifest = copy.deepcopy(self.manifest_template)
        manifest["source_contract_commit"] = "1" * 40
        manifest["published_at_utc"] = "2026-08-25T12:00:00Z"
        manifest["owner_accepted"] = accepted
        manifest["owner_acceptance_evidence_sha256"] = (
            "sha256:" + ("2" * 64 if accepted else "0" * 64)
        )
        manifest["files"] = {
            name: MODULE.digest(pack / name) for name in sorted(MODULE.PACK_FILES)
        }
        manifest["capability_contract_sha256"] = manifest["files"][
            "incremental-contract.json"
        ]
        if manifest_mutator:
            manifest_mutator(manifest)
        self._write(pack / "owner-pack.manifest.json", manifest)
        return pack

    def test_request_template_is_valid_and_cannot_claim_acceptance(self):
        result = MODULE.validate_template()
        self.assertEqual(result["decision"], "N02_REQUEST_TEMPLATE_VALID")
        self.assertFalse(result["owner_accepted"])

    def test_candidate_pack_is_digest_bound_but_not_accepted(self):
        pack = self.pack()
        result = MODULE.validate_pack(pack, mode="candidate")
        self.assertEqual(result["decision"], "N02_OWNER_PACK_CANDIDATE_VALID")
        self.assertFalse(result["owner_accepted"])
        self.assertFalse(result["runtime_active"])

    def test_acceptance_requires_owner_published_bytes_and_decision(self):
        pack = self.pack(accepted=True)
        result = MODULE.validate_pack(pack, mode="acceptance")
        self.assertEqual(result["decision"], "N02_OWNER_PACK_ACCEPTED")
        self.assertTrue(result["owner_accepted"])
        self.assertRegex(result["capability_contract_sha256"], r"^sha256:[0-9a-f]{64}$")

        draft = self.pack()
        with self.assertRaisesRegex(MODULE.ContractError, "publication status"):
            MODULE.validate_pack(draft, mode="acceptance")

    def test_v1_or_unknown_revision_is_rejected(self):
        pack = self.pack(contract_mutator=lambda value: value.update(contract_revision="d4.paper-read.v1"))
        with self.assertRaisesRegex(MODULE.ContractError, "cannot accept the v1"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_manifest_hash_drift_and_capability_mismatch_are_rejected(self):
        pack = self.pack(accepted=True)
        contract = json.loads((pack / "incremental-contract.json").read_text(encoding="utf-8"))
        contract["consumer_lease"]["ttl_seconds"] = 31
        self._write(pack / "incremental-contract.json", contract)
        with self.assertRaisesRegex(MODULE.ContractError, "byte digest mismatch"):
            MODULE.validate_pack(pack, mode="acceptance")

        pack = self.pack(
            accepted=True,
            manifest_mutator=lambda value: value.update(capability_contract_sha256="sha256:" + "3" * 64),
        )
        with self.assertRaisesRegex(MODULE.ContractError, "does not bind"):
            MODULE.validate_pack(pack, mode="acceptance")

    def test_pack_rejects_extra_files_symlinks_and_relative_paths(self):
        pack = self.pack()
        (pack / "secret.env").write_text("NO=\n", encoding="utf-8")
        with self.assertRaisesRegex(MODULE.ContractError, "unexpected entry"):
            MODULE.validate_pack(pack, mode="candidate")

        pack = self.pack()
        target = pack / "error-corpus.json"
        target.unlink()
        target.symlink_to(MODULE.REQUEST_DIRECTORY / "error-corpus.example.json")
        manifest = json.loads((pack / "owner-pack.manifest.json").read_text(encoding="utf-8"))
        manifest["files"]["error-corpus.json"] = MODULE.digest(target)
        self._write(pack / "owner-pack.manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.ContractError, "non-symlinks"):
            MODULE.validate_pack(pack, mode="candidate")

        with self.assertRaisesRegex(MODULE.ContractError, "absolute"):
            MODULE.validate_pack(pathlib.Path("relative-pack"), mode="candidate")

    def test_duplicate_json_keys_fail_closed(self):
        path = self.root / "duplicate.json"
        path.write_text('{"schema_version":"one","schema_version":"two"}', encoding="utf-8")
        with self.assertRaisesRegex(MODULE.ContractError, "duplicate object key"):
            MODULE.read_json(path)

    def test_consumer_lease_requires_zero_idle_source_selects(self):
        pack = self.pack(
            contract_mutator=lambda value: value["consumer_lease"].update(
                source_selects_after_expiry=1
            )
        )
        with self.assertRaisesRegex(MODULE.ContractError, "fail dormant"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_cursor_atomicity_duplicate_and_gap_invariants_are_required(self):
        pack = self.pack(
            contract_mutator=lambda value: value["cursor"].update(
                advance_only_after_atomic_projection_commit=False
            )
        )
        with self.assertRaisesRegex(MODULE.ContractError, "cursor invariant"):
            MODULE.validate_pack(pack, mode="candidate")

        pack = self.pack(
            contract_mutator=lambda value: value["cursor"].update(gap_error="EMPTY_PAGE")
        )
        with self.assertRaisesRegex(MODULE.ContractError, "failure codes"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_tombstones_and_full_resync_cannot_be_omitted(self):
        pack = self.pack(
            contract_mutator=lambda value: value["delta"].update(delete_requires_tombstone=False)
        )
        with self.assertRaisesRegex(MODULE.ContractError, "tombstone"):
            MODULE.validate_pack(pack, mode="candidate")

        pack = self.pack(
            contract_mutator=lambda value: value["resync"].update(silent_skip_forbidden=False)
        )
        with self.assertRaisesRegex(MODULE.ContractError, "resync"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_retention_floor_and_recovery_window_are_bounded(self):
        pack = self.pack(
            contract_mutator=lambda value: value["retention"].update(
                floor_published_on_every_page=False
            )
        )
        with self.assertRaisesRegex(MODULE.ContractError, "retention floor"):
            MODULE.validate_pack(pack, mode="candidate")

        pack = self.pack(
            contract_mutator=lambda value: value["retention"].update(
                maximum_age_seconds=60
            )
        )
        with self.assertRaisesRegex(MODULE.ContractError, "shorter"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_entity_completeness_and_poll_interval_are_consistent(self):
        def mutate(value):
            value["entities"][1]["poll_interval_ms"] = None

        pack = self.pack(contract_mutator=mutate)
        with self.assertRaisesRegex(MODULE.ContractError, "poll interval"):
            MODULE.validate_pack(pack, mode="candidate")

        def overclaim(value):
            value["entities"][0]["source_completeness"] = "MAGIC_COMPLETE"

        pack = self.pack(contract_mutator=overclaim)
        with self.assertRaisesRegex(MODULE.ContractError, "completeness enum"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_fixture_and_error_corpora_are_complete_and_synthetic(self):
        pack = self.pack()
        fixtures = json.loads((pack / "compatibility-fixtures.json").read_text(encoding="utf-8"))
        fixtures["scenarios"].pop()
        self._write(pack / "compatibility-fixtures.json", fixtures)
        manifest = json.loads((pack / "owner-pack.manifest.json").read_text(encoding="utf-8"))
        manifest["files"]["compatibility-fixtures.json"] = MODULE.digest(
            pack / "compatibility-fixtures.json"
        )
        self._write(pack / "owner-pack.manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.ContractError, "corpus is incomplete"):
            MODULE.validate_pack(pack, mode="candidate")

        pack = self.pack()
        errors = json.loads((pack / "error-corpus.json").read_text(encoding="utf-8"))
        errors["cases"][2]["requires_resync"] = False
        self._write(pack / "error-corpus.json", errors)
        manifest = json.loads((pack / "owner-pack.manifest.json").read_text(encoding="utf-8"))
        manifest["files"]["error-corpus.json"] = MODULE.digest(pack / "error-corpus.json")
        self._write(pack / "owner-pack.manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.ContractError, "mapping drifted"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_all_runtime_and_trading_authorities_remain_false(self):
        pack = self.pack(
            contract_mutator=lambda value: value["authority"].update(database=True)
        )
        with self.assertRaisesRegex(MODULE.ContractError, "widened"):
            MODULE.validate_pack(pack, mode="candidate")

        pack = self.pack(
            manifest_mutator=lambda value: value["authority"].update(source_traffic=True)
        )
        with self.assertRaisesRegex(MODULE.ContractError, "widened"):
            MODULE.validate_pack(pack, mode="candidate")

    def test_acceptance_rejects_placeholder_commit_and_evidence(self):
        pack = self.pack(
            accepted=True,
            manifest_mutator=lambda value: value.update(source_contract_commit="0" * 40),
        )
        with self.assertRaisesRegex(MODULE.ContractError, "commit"):
            MODULE.validate_pack(pack, mode="acceptance")

        pack = self.pack(
            accepted=True,
            manifest_mutator=lambda value: value.update(
                owner_acceptance_evidence_sha256="sha256:" + "0" * 64
            ),
        )
        with self.assertRaisesRegex(MODULE.ContractError, "placeholder"):
            MODULE.validate_pack(pack, mode="acceptance")


if __name__ == "__main__":
    unittest.main()
