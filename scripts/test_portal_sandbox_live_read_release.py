#!/usr/bin/env python3
"""Offline tests for the N23 immutable Sandbox/Live release adjunct."""

from __future__ import annotations

import argparse
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
N14A = load("portal_release_authority_n23_test", HERE / "portal-release-authority.py")
N14B = load("portal_current_source_release_n23_test", HERE / "portal-current-source-release.py")
N22 = load("portal_full_paper_read_release_n23_test", HERE / "portal-full-paper-read-release.py")
N23 = load("portal_sandbox_live_read_release_test", HERE / "portal-sandbox-live-read-release.py")


class N23ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        evidence = self.root / "evidence"
        evidence.mkdir()
        for service in N14A.SERVICES:
            for kind in ("signature", "sbom", "provenance"):
                (evidence / f"{service}-{kind}.json").write_text(
                    json.dumps({"service": service, "kind": kind, "verified": True}), encoding="utf-8",
                )
            (evidence / f"{service}-trivy.json").write_text('{"Results": []}', encoding="utf-8")
        gates = []
        for gate in N14A.GATES:
            path = self.root / f"{gate}.txt"
            path.write_text(f"{gate}: PASS\n", encoding="utf-8")
            gates.append(f"{gate}={path}")
        self.n14a = self.root / "n14a"
        N14A.generate(argparse.Namespace(
            output_dir=self.n14a, source_commit="a" * 40, source_ref="refs/heads/main",
            image=[f"{service}=ghcr.io/primus/portal-{service}@sha256:{index + 1}" + "0" * 63
                   for index, service in enumerate(N14A.SERVICES)],
            evidence_dir=evidence, gate_evidence=gates,
            previous_manifest_sha256=N14A.ZERO_DIGEST,
        ))
        self.n14b = self.root / "n14b"
        N14B.generate(argparse.Namespace(
            n14a_pack_dir=self.n14a, output_dir=self.n14b,
            previous_compatibility_sha256=N14B.ZERO_DIGEST,
        ))
        self.n22 = self.root / "n22"
        N22.generate(argparse.Namespace(
            n14a_pack_dir=self.n14a, n14b_pack_dir=self.n14b,
            output_dir=self.n22, previous_release_sha256=N22.ZERO_DIGEST,
        ))

    def tearDown(self):
        self.temporary.cleanup()

    def generate(self) -> pathlib.Path:
        output = self.root / "n23"
        N23.generate(argparse.Namespace(
            n14a_pack_dir=self.n14a, n14b_pack_dir=self.n14b,
            n22_pack_dir=self.n22, output_dir=output,
            previous_release_sha256=N23.ZERO_DIGEST,
        ))
        return output

    def rewrite(self, pack: pathlib.Path, payload: dict) -> None:
        path = pack / N23.OUTPUT_NAME
        path.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        (pack / "SHA256SUMS").write_text(
            f"{N23.digest(path).split(':', 1)[1]}  {N23.OUTPUT_NAME}\n", encoding="utf-8",
        )

    def test_exact_two_profile_release_and_truthful_canary_mapping(self):
        pack = self.generate()
        payload = N23.verify(pack, self.n22, self.n14b, self.n14a)
        self.assertEqual(set(payload["profile"]["profiles"]), {"sandbox", "live"})
        self.assertEqual(payload["profile"]["canary"], {
            "trading_system_mode": None,
            "source_profile": "LIVE_BINANCE_USDM",
            "composition": "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS",
        })
        self.assertFalse(payload["authority"]["runtime_deployed"])
        self.assertFalse(payload["authority"]["command_or_mutation"])

    def test_scope_is_derived_from_current_source_map(self):
        target = N23.target_from_source_map(N23.read_json(N23.ROOT / N23.SOURCE_MAP_REL))
        self.assertEqual(len(target["activated"]), 7)
        self.assertEqual(len(target["sources"]), 7)
        self.assertEqual(target["unavailable"], ["market.ticks"])

    def test_profile_image_file_and_authority_tamper_fail_closed(self):
        for mutate, message in (
            (lambda value: value["profile"]["profiles"]["live"].update({"manager_profile_id": "SANDBOX_BINANCE_USDM"}), "scope drifted"),
            (lambda value: value["image_bindings"]["control-api"].update({"digest": "sha256:" + "f" * 64}), "image/source lineage"),
            (lambda value: value["file_bindings"][0].update({"sha256": "sha256:" + "f" * 64}), "bound bytes"),
            (lambda value: value["authority"].update({"command_or_mutation": True}), "authority widened"),
        ):
            pack = self.generate()
            payload = json.loads((pack / N23.OUTPUT_NAME).read_text(encoding="utf-8"))
            mutate(payload)
            self.rewrite(pack, payload)
            with self.assertRaisesRegex(N23.N23ReleaseError, message):
                N23.verify(pack, self.n22, self.n14b, self.n14a)
            pack.rename(self.root / f"used-{len(list(self.root.glob('used-*')))}")

    def test_independent_rollback_and_chain_tamper_fail_closed(self):
        pack = self.generate()
        payload = json.loads((pack / N23.OUTPUT_NAME).read_text(encoding="utf-8"))
        payload["rollback"]["sandbox"] = payload["rollback"]["live"]
        self.rewrite(pack, payload)
        with self.assertRaisesRegex(N23.N23ReleaseError, "rollback contract"):
            N23.verify(pack, self.n22, self.n14b, self.n14a)
        with self.assertRaisesRegex(N23.N23ReleaseError, "previous N23"):
            N23.generate(argparse.Namespace(
                n14a_pack_dir=self.n14a, n14b_pack_dir=self.n14b,
                n22_pack_dir=self.n22, output_dir=self.root / "bad",
                previous_release_sha256="not-a-digest",
            ))


if __name__ == "__main__":
    unittest.main()
