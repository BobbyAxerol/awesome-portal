#!/usr/bin/env python3
"""Offline tests for signed-index Buildx attestation verification."""

from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest


SCRIPT = pathlib.Path(__file__).with_name("verify-buildx-attestations.py")
SPEC = importlib.util.spec_from_file_location("verify_buildx_attestations", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def digest(character: str) -> str:
    return f"sha256:{character * 64}"


def fixtures():
    subject = digest("a")
    attestation_digest = digest("b")
    index = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.index.v1+json",
        "manifests": [
            {
                "mediaType": "application/vnd.oci.image.manifest.v1+json",
                "digest": subject,
                "size": 123,
                "platform": {"os": "linux", "architecture": "amd64"},
            },
            {
                "mediaType": "application/vnd.oci.image.manifest.v1+json",
                "digest": attestation_digest,
                "size": 456,
                "platform": {"os": "unknown", "architecture": "unknown"},
                "annotations": {"vnd.docker.reference.type": "attestation-manifest"},
            },
        ],
    }
    attestation = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "artifactType": "application/vnd.docker.attestation.manifest.v1+json",
        "subject": {
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "digest": subject,
            "size": 123,
        },
        "layers": [
            {
                "mediaType": "application/vnd.in-toto+json",
                "digest": digest("c"),
                "size": 100,
                "annotations": {"in-toto.io/predicate-type": "https://spdx.dev/Document"},
            },
            {
                "mediaType": "application/vnd.in-toto+json",
                "digest": digest("d"),
                "size": 200,
                "annotations": {"in-toto.io/predicate-type": "https://slsa.dev/provenance/v1"},
            },
        ],
    }
    return index, attestation


class BuildxAttestationTest(unittest.TestCase):
    image = f"ghcr.io/bobbyaxerol/portal-portal-api@{digest('e')}"

    def test_valid_signed_index_binding_emits_both_evidence_types(self):
        index, attestation = fixtures()
        evidence = MODULE.build_evidence(self.image, index, attestation)
        self.assertEqual(set(evidence), {"sbom", "provenance"})
        self.assertEqual(evidence["sbom"]["signed_index_digest"], digest("e"))
        self.assertEqual(evidence["sbom"]["subject_manifest_digest"], digest("a"))
        self.assertEqual(evidence["sbom"]["predicate"]["digest"], digest("c"))
        self.assertEqual(evidence["provenance"]["predicate"]["digest"], digest("d"))

    def test_subject_drift_is_fail_closed(self):
        index, attestation = fixtures()
        attestation["subject"]["digest"] = digest("f")
        with self.assertRaisesRegex(MODULE.AttestationError, "subject does not match"):
            MODULE.build_evidence(self.image, index, attestation)

    def test_missing_predicate_is_fail_closed(self):
        index, attestation = fixtures()
        attestation["layers"] = attestation["layers"][:1]
        with self.assertRaisesRegex(MODULE.AttestationError, "slsa.dev/provenance"):
            MODULE.build_evidence(self.image, index, attestation)

    def test_unbound_unknown_manifest_is_fail_closed(self):
        index, attestation = fixtures()
        index["manifests"][1]["annotations"] = {}
        with self.assertRaisesRegex(MODULE.AttestationError, "exactly one Buildx attestation"):
            MODULE.build_evidence(self.image, index, attestation)


if __name__ == "__main__":
    unittest.main()
