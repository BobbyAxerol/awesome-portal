#!/usr/bin/env python3
"""Offline and cryptographic tests for N14A release authority."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("portal-release-authority.py")
SPEC = importlib.util.spec_from_file_location("portal_release_authority", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PortalReleaseAuthorityTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.evidence = self.root / "image-evidence"
        self.evidence.mkdir()
        for service in MODULE.SERVICES:
            for kind in ("signature", "sbom", "provenance"):
                self.write(self.evidence / f"{service}-{kind}.json", {"kind": kind, "service": service, "verified": True})
            self.write(self.evidence / f"{service}-trivy.json", {"Results": []})
        self.gates = {}
        for gate in MODULE.GATES:
            path = self.root / f"{gate}.txt"
            path.write_text(f"{gate}: PASS\n", encoding="utf-8")
            self.gates[gate] = path
        self.commit = "a" * 40

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    @staticmethod
    def read(path):
        return json.loads(path.read_text(encoding="utf-8"))

    def generation_args(self, output=None):
        return argparse.Namespace(
            output_dir=output or self.root / f"pack-{len(list(self.root.glob('pack-*')))}",
            source_commit=self.commit,
            source_ref="refs/heads/main",
            image=[f"{service}=ghcr.io/primus/portal-{service}@sha256:{str(index + 1) * 64}" for index, service in enumerate(MODULE.SERVICES)],
            evidence_dir=self.evidence,
            gate_evidence=[f"{gate}={path}" for gate, path in self.gates.items()],
            previous_manifest_sha256=MODULE.ZERO_DIGEST,
        )

    def pack(self):
        args = self.generation_args()
        MODULE.generate(args)
        return args.output_dir

    def decision(self, pack):
        path = pack / "release-owner-decision.json"
        MODULE.create_decision(argparse.Namespace(
            pack_dir=pack, output=path, decided_by="bobby",
            rationale="Accept the exact Portal source-dark release evidence only.",
        ))
        return path

    def test_template_is_non_authoritative(self):
        result = MODULE.validate_template()
        self.assertEqual(result["service_count"], 6)
        self.assertFalse(result["deployment_authorized"])
        self.assertFalse(result["source_activation"])

    def test_generate_and_validate_exact_candidate(self):
        pack = self.pack()
        manifest = self.read(pack / "release-manifest.json")
        services, evidence = MODULE.validate_manifest(pack, manifest, "candidate")
        self.assertEqual(set(services), set(MODULE.SERVICES))
        self.assertFalse(evidence["source_traffic_observed"])
        self.assertEqual(manifest["source_ref"], "refs/heads/main")

    def test_acceptance_verifies_manifest_and_decision_signatures(self):
        pack = self.pack()
        decision = self.decision(pack)
        private_key = self.root / "release.key"
        public_key = self.root / "release.pub"
        subprocess.run(["openssl", "genpkey", "-algorithm", "ED25519", "-out", private_key], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["openssl", "pkey", "-in", private_key, "-pubout", "-out", public_key], check=True, stdout=subprocess.DEVNULL)
        manifest_signature = self.root / "manifest.sig"
        decision_signature = self.root / "decision.sig"
        for payload, signature in ((pack / "release-manifest.json", manifest_signature), (decision, decision_signature)):
            subprocess.run(["openssl", "pkeyutl", "-sign", "-inkey", private_key, "-rawin", "-in", payload, "-out", signature], check=True, stdout=subprocess.DEVNULL)
        args = argparse.Namespace(public_key=public_key, certificate_identity=None, certificate_issuer=None)
        MODULE.verify_blob("openssl", pack / "release-manifest.json", manifest_signature, args)
        MODULE.verify_blob("openssl", decision, decision_signature, args)

    def test_tampered_signature_fails(self):
        pack = self.pack()
        private_key = self.root / "key"
        public_key = self.root / "pub"
        signature = self.root / "sig"
        subprocess.run(["openssl", "genpkey", "-algorithm", "ED25519", "-out", private_key], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["openssl", "pkey", "-in", private_key, "-pubout", "-out", public_key], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["openssl", "pkeyutl", "-sign", "-inkey", private_key, "-rawin", "-in", pack / "release-manifest.json", "-out", signature], check=True, stdout=subprocess.DEVNULL)
        manifest = self.read(pack / "release-manifest.json")
        manifest["created_at"] = "2026-08-27T00:00:00Z"
        self.write(pack / "release-manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.ReleaseError, "signature"):
            MODULE.verify_blob("openssl", pack / "release-manifest.json", signature, argparse.Namespace(public_key=public_key, certificate_identity=None, certificate_issuer=None))

    def test_critical_vulnerability_blocks_generation(self):
        self.write(self.evidence / "portal-api-trivy.json", {"Results": [{"Vulnerabilities": [{"Severity": "CRITICAL"}]}]})
        with self.assertRaisesRegex(MODULE.ReleaseError, "critical"):
            MODULE.generate(self.generation_args())

    def test_high_finding_is_visible_and_requires_owner_review(self):
        self.write(self.evidence / "portal-web-trivy.json", {"Results": [{"Vulnerabilities": [{"Severity": "HIGH"}]}]})
        pack = self.pack()
        evidence = self.read(pack / "release-candidate-evidence.json")
        web = next(row for row in evidence["images"] if row["service_id"] == "portal-web")
        self.assertEqual(web["vulnerability"]["disposition"], "OWNER_REVIEW_REQUIRED")
        self.assertEqual(web["vulnerability"]["high"], 1)

    def test_missing_quality_gate_blocks_generation(self):
        del self.gates["frontend"]
        with self.assertRaisesRegex(MODULE.ReleaseError, "all release quality gates"):
            MODULE.generate(self.generation_args())

    def test_image_tag_or_service_set_drift_is_rejected(self):
        args = self.generation_args()
        args.image.pop()
        with self.assertRaisesRegex(MODULE.ReleaseError, "all six"):
            MODULE.generate(args)
        args = self.generation_args()
        args.source_ref = "refs/heads/dev"
        with self.assertRaisesRegex(MODULE.ReleaseError, "main commit"):
            MODULE.generate(args)

    def test_manifest_image_and_evidence_digest_drift_is_rejected(self):
        pack = self.pack()
        manifest = self.read(pack / "release-manifest.json")
        manifest["services"][0]["image_digest"] = "sha256:" + "f" * 64
        self.write(pack / "release-manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.ReleaseError, "digest-pinned"):
            MODULE.validate_manifest(pack, manifest, "candidate")
        pack = self.pack()
        evidence = pack / "evidence/portal-api-sbom.json"
        self.write(evidence, {"tampered": True})
        with self.assertRaisesRegex(MODULE.ReleaseError, "digest mismatch"):
            MODULE.validate_manifest(pack, self.read(pack / "release-manifest.json"), "candidate")

    def test_symlink_and_secret_shaped_evidence_are_rejected(self):
        pack = self.pack()
        target = pack / "evidence/portal-api-signature.json"
        target.unlink()
        target.symlink_to(pack / "evidence/portal-api-sbom.json")
        with self.assertRaisesRegex(MODULE.ReleaseError, "non-symlinks"):
            MODULE.validate_manifest(pack, self.read(pack / "release-manifest.json"), "candidate")
        self.write(self.evidence / "portal-api-signature.json", {"api_key": "forbidden"})
        with self.assertRaisesRegex(MODULE.ReleaseError, "secret-shaped"):
            MODULE.generate(self.generation_args())

    def test_source_or_command_activation_is_rejected(self):
        pack = self.pack()
        manifest = self.read(pack / "release-manifest.json")
        manifest["services"][4]["source_enabled"] = True
        self.write(pack / "release-manifest.json", manifest)
        with self.assertRaisesRegex(MODULE.ReleaseError, "forbidden capability"):
            MODULE.validate_manifest(pack, manifest, "candidate")

    def test_shared_profile_volume_and_runtime_flag_are_rejected(self):
        profiles = self.read(MODULE.MANIFEST_DIR / "deployment-profiles.source-dark.json")
        profiles["profiles"][1]["mutable_volumes"] = [profiles["profiles"][0]["mutable_volumes"][0]]
        with self.assertRaisesRegex(MODULE.ReleaseError, "share a mutable volume"):
            MODULE.validate_profiles(profiles)
        profiles = self.read(MODULE.MANIFEST_DIR / "deployment-profiles.source-dark.json")
        profiles["profiles"][1]["query_enabled"] = True
        with self.assertRaisesRegex(MODULE.ReleaseError, "source-dark"):
            MODULE.validate_profiles(profiles)

    def test_owner_decision_is_exact_and_cannot_authorize_source(self):
        pack = self.pack()
        decision = self.decision(pack)
        payload = self.read(decision)
        payload["source_activation_authorized"] = True
        self.write(decision, payload)
        manifest = self.read(pack / "release-manifest.json")
        with self.assertRaisesRegex(MODULE.ReleaseError, "widened"):
            MODULE.validate_decision(decision, pack / "release-manifest.json", pack / manifest["candidate_evidence"]["file"])

    def test_owner_decision_cannot_be_reused_for_another_manifest(self):
        pack = self.pack()
        decision = self.decision(pack)
        manifest_path = pack / "release-manifest.json"
        manifest = self.read(manifest_path)
        manifest["created_at"] = "2026-08-28T00:00:00Z"
        self.write(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.ReleaseError, "exact release"):
            MODULE.validate_decision(decision, manifest_path, pack / manifest["candidate_evidence"]["file"])

    def test_stable_compose_requires_exact_service_digests(self):
        compose = (MODULE.ROOT / "deploy/compose.production.yaml").read_text(encoding="utf-8")
        for variable in (
            "PORTAL_API_IMAGE", "PORTAL_WEB_IMAGE", "PORTAL_CONTROL_API_IMAGE",
            "PORTAL_ROADMAP_API_IMAGE",
        ):
            self.assertIn(f"${{{variable}:?", compose)
        self.assertNotIn("-portal-api:${PORTAL_IMAGE_TAG", compose)
        self.assertNotIn("-portal-web:${PORTAL_IMAGE_TAG", compose)
        self.assertNotIn("-control-api:${PORTAL_IMAGE_TAG", compose)
        self.assertNotIn("-roadmap-task-board-api:${PORTAL_IMAGE_TAG", compose)

    def test_publication_binds_all_six_images_to_ci_and_supply_chain_evidence(self):
        workflow = (MODULE.ROOT / ".github/workflows/publish-images.yml").read_text(encoding="utf-8")
        self.assertIn("Wait for commit-bound Portal CI release gates", workflow)
        for suffix in ("signature", "sbom", "provenance"):
            self.assertIn(f'${{service}}-{suffix}.json', workflow)
        for service in MODULE.SERVICES:
            self.assertIn(f"{service}-trivy.json", workflow)
            self.assertIn(f"verify_release_image {service} ", workflow)
            self.assertIn(f'--image "{service}=', workflow)
        for gate in MODULE.GATES:
            self.assertIn(f'--gate-evidence "{gate}=', workflow)
        self.assertIn("portal-release-candidate-${{ github.sha }}", workflow)

    def test_deploy_requires_exact_candidate_owner_acceptance_and_digest_images(self):
        workflow = (MODULE.ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
        for required in (
            "publication_run_id", "release_manifest_sha256",
            "accept_vulnerability_evidence", "--mode candidate",
            "--mode acceptance", "ACCEPT_VULNERABILITY_EVIDENCE",
            "N14_RELEASE_MANIFEST_SHA256", "N14_RELEASE_DECISION_SHA256",
            "publication-workflow-run.json", ".github/workflows/publish-images.yml",
        ):
            self.assertIn(required, workflow)
        self.assertNotIn("PORTAL_IMAGE_TAG=\"${IMAGE_TAG}\" docker compose", workflow)


if __name__ == "__main__":
    unittest.main()
