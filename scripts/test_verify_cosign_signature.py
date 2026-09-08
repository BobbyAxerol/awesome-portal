#!/usr/bin/env python3
"""Focused contract tests for object-shaped Cosign evidence."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import unittest
from unittest import mock


SCRIPT = pathlib.Path(__file__).with_name("verify-cosign-signature.py")
SPEC = importlib.util.spec_from_file_location("verify_cosign_signature", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

IMAGE = "ghcr.io/bobbyaxerol/portal-execution-edge@sha256:" + "a" * 64


def record(image: str = IMAGE, *, v3_identity: bool = False) -> dict:
    repository, digest = image.split("@", 1)
    return {
        "critical": {
            "identity": {"docker-reference": image if v3_identity else repository},
            "image": {"docker-manifest-digest": digest},
            "type": "cosign container image signature",
        },
        "optional": {"issuer": "https://token.actions.githubusercontent.com"},
    }


class VerifyCosignSignatureTest(unittest.TestCase):
    def test_wraps_nonempty_subject_bound_array(self):
        payload = MODULE.parse_records(json.dumps([record()]).encode(), IMAGE)
        self.assertEqual(len(payload), 1)

    def test_rejects_digest_or_repository_drift(self):
        wrong_digest = record()
        wrong_digest["critical"]["image"]["docker-manifest-digest"] = "sha256:" + "b" * 64
        with self.assertRaisesRegex(MODULE.SignatureError, "digest binding"):
            MODULE.parse_records(json.dumps([wrong_digest]).encode(), IMAGE)
        wrong_repository = record()
        wrong_repository["critical"]["identity"]["docker-reference"] = "ghcr.io/other/edge"
        with self.assertRaisesRegex(MODULE.SignatureError, "repository binding"):
            MODULE.parse_records(json.dumps([wrong_repository]).encode(), IMAGE)

    def test_accepts_cosign_v3_digest_pinned_identity(self):
        payload = MODULE.parse_records(json.dumps([record(v3_identity=True)]).encode(), IMAGE)
        self.assertEqual(len(payload), 1)

    def test_verify_writes_exact_object_envelope(self):
        args = type("Args", (), {
            "image": IMAGE,
            "certificate_identity": "https://github.com/BobbyAxerol/awesome-portal/.github/workflows/publish-images.yml@refs/heads/main",
            "certificate_oidc_issuer": "https://token.actions.githubusercontent.com",
        })()
        completed = type("Completed", (), {"returncode": 0, "stdout": json.dumps([record()]).encode(), "stderr": b""})()
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            evidence = MODULE.verify(args)
        self.assertEqual(evidence["schema_version"], "portal.cosign-signature-evidence.v1")
        self.assertEqual(evidence["image"], IMAGE)
        self.assertEqual(evidence["record_count"], 1)

    def test_rejects_empty_or_non_array_output(self):
        for payload in ([], {"critical": {}}):
            with self.assertRaisesRegex(MODULE.SignatureError, "signature records"):
                MODULE.parse_records(json.dumps(payload).encode(), IMAGE)


if __name__ == "__main__":
    unittest.main()
