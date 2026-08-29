#!/usr/bin/env python3
"""Offline N14B immutable current-source compatibility tests."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


def load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


HERE = pathlib.Path(__file__).resolve().parent
N14A = load("portal_release_authority_n14b_test", HERE / "portal-release-authority.py")
N14B = load("portal_current_source_release_test", HERE / "portal-current-source-release.py")


class PortalCurrentSourceReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.evidence = self.root / "evidence"
        self.evidence.mkdir()
        for service in N14A.SERVICES:
            for kind in ("signature", "sbom", "provenance"):
                self.write(self.evidence / f"{service}-{kind}.json", {"service": service, "kind": kind, "verified": True})
            self.write(self.evidence / f"{service}-trivy.json", {"Results": []})
        self.gates: dict[str, pathlib.Path] = {}
        for gate in N14A.GATES:
            path = self.root / f"{gate}.txt"
            path.write_text(f"{gate}: PASS\n", encoding="utf-8")
            self.gates[gate] = path
        self.n14a_counter = 0
        self.n14b_counter = 0

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def write(path: pathlib.Path, value) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    @staticmethod
    def read(path: pathlib.Path):
        return json.loads(path.read_text(encoding="utf-8"))

    def n14a_pack(self, commit_char: str = "a") -> pathlib.Path:
        self.n14a_counter += 1
        output = self.root / f"n14a-{self.n14a_counter}"
        images = [
            f"{service}=ghcr.io/primus/portal-{service}@sha256:{str((index + self.n14a_counter) % 9 + 1) * 64}"
            for index, service in enumerate(N14A.SERVICES)
        ]
        N14A.generate(argparse.Namespace(
            output_dir=output,
            source_commit=commit_char * 40,
            source_ref="refs/heads/main",
            image=images,
            evidence_dir=self.evidence,
            gate_evidence=[f"{gate}={path}" for gate, path in self.gates.items()],
            previous_manifest_sha256=N14A.ZERO_DIGEST,
        ))
        return output

    def n14b_pack(self, n14a_pack: pathlib.Path, previous: str = N14B.ZERO_DIGEST) -> pathlib.Path:
        self.n14b_counter += 1
        output = self.root / f"n14b-{self.n14b_counter}"
        N14B.generate(argparse.Namespace(
            n14a_pack_dir=n14a_pack,
            output_dir=output,
            previous_compatibility_sha256=previous,
        ))
        return output

    def rewrite_pack(self, pack: pathlib.Path, payload: dict) -> None:
        path = pack / N14B.OUTPUT_NAME
        N14B.write_json(path, payload)
        (pack / "SHA256SUMS").write_text(
            f"{N14B.digest(path).split(':', 1)[1]}  {N14B.OUTPUT_NAME}\n",
            encoding="utf-8",
        )

    def test_generate_verify_and_rehearse_exact_paper_candidate(self):
        n14a = self.n14a_pack()
        n14b = self.n14b_pack(n14a)
        payload = N14B.verify_pack(n14b, n14a)
        self.assertEqual(payload["profile"]["screen_ids"], ["PAPER_TRADING_SCREEN"])
        self.assertEqual(len(payload["profile"]["capability_ids"]), 3)
        self.assertFalse(payload["authority"]["runtime_deployed"])
        result = N14B.rehearse(argparse.Namespace(
            pack_dir=n14b, n14a_pack_dir=n14a,
            forward_pack_dir=None, forward_n14a_pack_dir=None,
        ))
        self.assertEqual(result["decision"], "N14B_PROFILE_RELEASE_REHEARSAL_PASSED")
        self.assertFalse(result["source_traffic"])

    def test_target_is_derived_from_the_current_source_map(self):
        source_map = N14B.read_json(N14B.ROOT / N14B.SOURCE_MAP_REL)
        target = N14B.accepted_paper_target(source_map)
        self.assertEqual(
            target["capability_ids"],
            ["deployments.positions", "deployments.execution-quality", "sessions.current"],
        )
        self.assertEqual(
            target["source_binding_ids"],
            ["manager.deployments", "manager.performance", "manager.positions", "manager.sessions"],
        )

    def test_action_or_unqualified_source_cannot_enter_first_release(self):
        source_map = N14B.read_json(N14B.ROOT / N14B.SOURCE_MAP_REL)
        unsafe = copy.deepcopy(source_map)
        screen = next(row for row in unsafe["screens"] if row["screen_id"] == "PAPER_TRADING_SCREEN")
        screen["action_capabilities"] = ["command.plan"]
        with self.assertRaisesRegex(N14B.CompatibilityError, "read-only"):
            N14B.accepted_paper_target(unsafe)
        unsafe = copy.deepcopy(source_map)
        screen = next(row for row in unsafe["screens"] if row["screen_id"] == "PAPER_TRADING_SCREEN")
        screen["read_capabilities"].append("market.candles")
        with self.assertRaisesRegex(N14B.CompatibilityError, "unaccepted"):
            N14B.accepted_paper_target(unsafe)

    def test_profile_flags_cannot_widen_sandbox_live_or_commands(self):
        source_map = N14B.read_json(N14B.ROOT / N14B.SOURCE_MAP_REL)
        target = N14B.accepted_paper_target(source_map)
        profile = N14B.read_json(N14B.ROOT / N14B.PROFILE_REL)
        for key in ("control_api_current_source_sandbox", "control_api_current_source_live", "edge_command_relay"):
            unsafe = copy.deepcopy(profile)
            unsafe["candidate_flags"][key] = True
            with self.assertRaisesRegex(N14B.CompatibilityError, "widened"):
                N14B.validate_profile_definition(unsafe, target)

    def test_phase_approval_cannot_be_relabelled_runtime_authority(self):
        source_map = N14B.read_json(N14B.ROOT / N14B.SOURCE_MAP_REL)
        target = N14B.accepted_paper_target(source_map)
        profile = N14B.read_json(N14B.ROOT / N14B.PROFILE_REL)
        profile["phase_authorization"]["runtime_deploy_authorized"] = True
        with self.assertRaisesRegex(N14B.CompatibilityError, "authorization"):
            N14B.validate_profile_definition(profile, target)

    def test_n14a_manifest_and_image_tamper_fail_closed(self):
        n14a = self.n14a_pack()
        n14b = self.n14b_pack(n14a)
        payload = self.read(n14b / N14B.OUTPUT_NAME)
        payload["image_bindings"]["execution-edge"]["digest"] = "sha256:" + "f" * 64
        self.rewrite_pack(n14b, payload)
        with self.assertRaisesRegex(N14B.CompatibilityError, "image compatibility"):
            N14B.verify_pack(n14b, n14a)

        n14a = self.n14a_pack()
        n14b = self.n14b_pack(n14a)
        manifest = self.read(n14a / "release-manifest.json")
        manifest["services"][0]["source_enabled"] = True
        self.write(n14a / "release-manifest.json", manifest)
        with self.assertRaisesRegex(N14B.CompatibilityError, "N14A candidate"):
            N14B.verify_pack(n14b, n14a)

    def test_source_map_profile_and_adapter_digests_are_exact(self):
        n14a = self.n14a_pack()
        n14b = self.n14b_pack(n14a)
        for mutation, message in (
            (("source_map", "sha256"), "source set"),
            (("profile_definition", "sha256"), "profile definition"),
            (("adapter_files", 0, "sha256"), "adapter file"),
        ):
            payload = self.read(n14b / N14B.OUTPUT_NAME)
            if len(mutation) == 2:
                payload[mutation[0]][mutation[1]] = "sha256:" + "e" * 64
            else:
                payload[mutation[0]][mutation[1]][mutation[2]] = "sha256:" + "e" * 64
            self.rewrite_pack(n14b, payload)
            with self.assertRaisesRegex(N14B.CompatibilityError, message):
                N14B.verify_pack(n14b, n14a)
            n14b = self.n14b_pack(n14a)

    def test_runtime_authority_and_rollback_are_fail_closed(self):
        n14a = self.n14a_pack()
        n14b = self.n14b_pack(n14a)
        payload = self.read(n14b / N14B.OUTPUT_NAME)
        payload["authority"]["runtime_deployed"] = True
        self.rewrite_pack(n14b, payload)
        with self.assertRaisesRegex(N14B.CompatibilityError, "authority widened"):
            N14B.verify_pack(n14b, n14a)
        n14b = self.n14b_pack(n14a)
        payload = self.read(n14b / N14B.OUTPUT_NAME)
        payload["rollback"]["database_action"] = "DROP_AND_RESTORE"
        self.rewrite_pack(n14b, payload)
        with self.assertRaisesRegex(N14B.CompatibilityError, "rollback contract"):
            N14B.verify_pack(n14b, n14a)

    def test_checksum_symlink_and_secret_shaped_artifact_fail_closed(self):
        n14a = self.n14a_pack()
        n14b = self.n14b_pack(n14a)
        (n14b / "SHA256SUMS").write_text("bad\n", encoding="utf-8")
        with self.assertRaisesRegex(N14B.CompatibilityError, "checksum"):
            N14B.verify_pack(n14b, n14a)
        n14b = self.n14b_pack(n14a)
        path = n14b / N14B.OUTPUT_NAME
        path.unlink()
        path.symlink_to(n14a / "release-manifest.json")
        with self.assertRaisesRegex(N14B.CompatibilityError, "non-symlinks"):
            N14B.verify_pack(n14b, n14a)
        secret = self.root / "secret-shaped.json"
        self.write(secret, {"api_key": "forbidden"})
        with self.assertRaisesRegex(N14B.CompatibilityError, "secret-shaped"):
            N14B.read_json(secret)

    def test_previous_digest_must_be_valid(self):
        with self.assertRaisesRegex(N14B.CompatibilityError, "previous compatibility"):
            self.n14b_pack(self.n14a_pack(), "not-a-digest")

    def test_forward_fix_is_chained_without_source_scope_drift(self):
        first_n14a = self.n14a_pack("a")
        first = self.n14b_pack(first_n14a)
        second_n14a = self.n14a_pack("b")
        second = self.n14b_pack(second_n14a, N14B.digest(first / N14B.OUTPUT_NAME))
        result = N14B.rehearse(argparse.Namespace(
            pack_dir=first,
            n14a_pack_dir=first_n14a,
            forward_pack_dir=second,
            forward_n14a_pack_dir=second_n14a,
        ))
        self.assertEqual(result["forward_fix"], "PASS")

        payload = self.read(second / N14B.OUTPUT_NAME)
        payload["rollback"]["previous_compatibility_sha256"] = N14B.ZERO_DIGEST
        self.rewrite_pack(second, payload)
        with self.assertRaisesRegex(N14B.CompatibilityError, "not chained"):
            N14B.rehearse(argparse.Namespace(
                pack_dir=first,
                n14a_pack_dir=first_n14a,
                forward_pack_dir=second,
                forward_n14a_pack_dir=second_n14a,
            ))


if __name__ == "__main__":
    unittest.main()
