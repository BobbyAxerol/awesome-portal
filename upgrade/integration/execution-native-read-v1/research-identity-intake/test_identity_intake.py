"""TEST_ONLY wrapper tests. Lifecycle doubles are NOT runtime/current-human proof.

Signature/digest/scope negatives use the real PM verifier/prepare. Positive
control-flow tests substitute only prepare/context to test output ordering.
They deliberately do not claim a real DB, Core, identity or COMMIT receipt.
"""
import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import datetime, timezone
import json
from types import SimpleNamespace
import time
import unittest
from unittest.mock import patch
from uuid import UUID, uuid4

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import jwt

from identity_intake import (
    IdentityIntakeError, INTAKE_PATH, REQUEST_SCHEMA, ResearchIdentitySelection,
    request_digest, request_id, resolve_identity,
)
from services.portfolio_management.http_request_binding import http_request_digest
from services.portfolio_management.portal_human_candidate import (
    PortalHumanCandidate, SourceAttempt, SourceConfig, SourceResolution,
)
from services.portal_execution_owner.identity.human import (
    HumanIdentityError, HumanTrustPolicy, HumanVerifier, VerifiedHuman,
)
from services.portal_execution_owner.identity.users import TSUser


class IdentityIntakeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.human_key = Ed25519PrivateKey.generate()
        self.source_key = Ed25519PrivateKey.generate()
        self.selection = ResearchIdentitySelection("TEST_ONLY-research", "TEST_ONLY-actor",
            "TEST_ONLY-workspace", "TEST_ONLY-workload")
        self.raw = json.dumps({"schema_version": REQUEST_SCHEMA, "request_id": str(uuid4())},
                              separators=(",", ":")).encode()
        jwk = json.loads(jwt.algorithms.OKPAlgorithm.to_jwk(self.human_key.public_key()))
        jwk["kid"] = "TEST_ONLY-human-key"
        jwk["alg"] = "EdDSA"
        jwk["use"] = "sig"
        verifier = HumanVerifier([HumanTrustPolicy(self.selection.issuer, "TEST_ONLY-identity",
            "paper", self.selection.workspace_id, "TEST_ONLY-human-key", {"keys": [jwk]})])
        class NoIO:
            def acquire(self, **_):
                raise AssertionError("TEST_ONLY unexpected DB borrow")
            async def enter(self, *_):
                raise AssertionError("TEST_ONLY unexpected Core ENTER")
            async def resolve(self, *_):
                raise AssertionError("TEST_ONLY unexpected Core RESOLVE")
        self.candidate = PortalHumanCandidate(NoIO(), verifier, NoIO(), SourceConfig(
            "TEST_ONLY-source", "TEST_ONLY-core", "TEST_ONLY-source-key",
            self.selection.workload_id, self.source_key, 1, 1, 1, 10, 50, 30))
        now = int(time.time())
        self.claims = dict(iss=self.selection.issuer, aud="TEST_ONLY-identity",
            sub=self.selection.subject, sid="TEST_ONLY-session", jti=str(uuid4()),
            iat=now-1, nbf=now-1, exp=now+30, purpose="pma.identity.v1",
            principal_kind="human", session_revision=1, authority_revision=1,
            workspace_id=self.selection.workspace_id, environment="paper",
            workload_id=self.selection.workload_id, request_digest=request_digest(self.raw))
        self.exited = False

    def token(self, key=None, **claims):
        return jwt.encode(dict(self.claims, **claims), key or self.human_key,
            algorithm="EdDSA", headers={"kid": "TEST_ONLY-human-key", "typ": "JWT"})

    def fixture(self, terminal=None, *, release=None, entered=None):
        """Explicit synthetic lifecycle double, not an authentication bypass in code."""
        c = self.claims
        attempt = SourceAttempt(c["jti"], str(uuid4()), c["workspace_id"], "paper",
            c["workload_id"], c["request_digest"], c["iss"], c["sub"], c["sid"], 1, 1, c["exp"])
        principal = VerifiedHuman(c["iss"], c["sub"], "paper", c["workspace_id"],
            c["sid"], 1, 1, c["jti"], c["exp"])
        stamp = datetime.now(timezone.utc)
        user = TSUser(UUID("90000000-0000-4000-8000-000000000001"), c["iss"], c["sub"],
            None, "ACTIVE", 2**53+1, stamp, stamp)
        prepared = SimpleNamespace(attempt=attempt, resolution=SourceResolution("UNKNOWN", None, None, False))
        final = terminal or SourceResolution("COMMITTED", "TEST_ONLY-receipt", "sha256:"+"a"*64, True)
        @asynccontextmanager
        async def authorized_identity():
            try:
                if entered is not None:
                    entered.set()
                yield user, None, principal
                if release is not None:
                    await release.wait()
                prepared.resolution = final
            finally:
                self.exited = True
        prepared.authorized_identity = authorized_identity
        return prepared

    def test_exact_bytes_digest_matches_existing_pm_protocol(self):
        self.assertEqual(request_digest(self.raw), http_request_digest(
            "POST", INTAKE_PATH, b"", self.raw, request_limit=4096))
        self.assertNotEqual(request_digest(self.raw), request_digest(self.raw+b" "))

    def test_request_is_closed_and_canonical_uuid4(self):
        nonce = json.loads(self.raw)["request_id"]
        self.assertEqual(request_id(self.raw), nonce)
        for raw in [b"", b"x"*4097, "not-bytes", None, b"[]", b"null", b"true", b"0",
                    b"\xff", b"{}", b'{"schema_version":"wrong","request_id":"x"}',
                    json.dumps(dict(json.loads(self.raw), username="bobby")).encode(),
                    self.raw.replace(nonce.encode(), nonce.upper().encode()),
                    self.raw.replace(nonce.encode(), b"00000000-0000-0000-0000-000000000000")]:
            with self.subTest(kind=type(raw).__name__), self.assertRaises(IdentityIntakeError):
                request_id(raw)

    def test_duplicate_keys_are_not_collapsed(self):
        value = json.loads(self.raw)
        raw = ('{"schema_version":"'+REQUEST_SCHEMA+'","request_id":"'+value["request_id"]+
               '","request_id":"'+value["request_id"]+'"}').encode()
        with self.assertRaises(IdentityIntakeError):
            request_id(raw)

    def test_selection_is_not_arbitrary_or_mutable(self):
        for bad in ["", " x", "x\n", "x"*129, None]:
            with self.subTest(value_type=type(bad).__name__), self.assertRaises(IdentityIntakeError):
                replace(self.selection, subject=bad)
        with self.assertRaises(AttributeError):
            self.selection.subject = "changed"

    async def test_bad_request_does_not_reach_prepare(self):
        with patch.object(self.candidate, "prepare") as prepare:
            with self.assertRaises(IdentityIntakeError):
                await resolve_identity(self.candidate, self.selection, "unused", b"{}")
            prepare.assert_not_called()

    async def test_requires_actual_sdk_and_pinned_selection(self):
        for candidate, selection in [(object(), self.selection), (self.candidate, {})]:
            with self.assertRaises(IdentityIntakeError):
                await resolve_identity(candidate, selection, "unused", self.raw)

    async def test_real_verifier_rejects_wrong_signature(self):
        with self.assertRaises(HumanIdentityError):
            await resolve_identity(self.candidate, self.selection,
                self.token(key=Ed25519PrivateKey.generate()), self.raw)

    async def test_real_verifier_rejects_wrong_issuer_audience_and_expiry(self):
        for claims in [dict(iss="TEST_ONLY-other"), dict(aud="TEST_ONLY-other"),
                       dict(iat=int(time.time())-40, nbf=int(time.time())-40, exp=int(time.time())-1)]:
            with self.subTest(claims=list(claims)), self.assertRaises(HumanIdentityError):
                await resolve_identity(self.candidate, self.selection, self.token(**claims), self.raw)

    async def test_real_prepare_rejects_digest_workload_and_environment(self):
        for claims in [dict(request_digest="sha256:"+"f"*64), dict(workload_id="TEST_ONLY-other"),
                       dict(environment="live")]:
            with self.subTest(claims=list(claims)), self.assertRaises(HumanIdentityError):
                await resolve_identity(self.candidate, self.selection, self.token(**claims), self.raw)

    async def test_signed_different_subject_is_denied_before_enter(self):
        with self.assertRaisesRegex(IdentityIntakeError, "SCOPE_DENIED"):
            await resolve_identity(self.candidate, self.selection,
                                   self.token(sub="TEST_ONLY-other"), self.raw)

    async def test_output_after_context_ack_only_and_no_private_fields(self):
        with patch.object(self.candidate, "prepare", return_value=self.fixture()):
            result = await resolve_identity(self.candidate, self.selection, "TEST_ONLY-double", self.raw)
        self.assertTrue(self.exited)
        self.assertEqual(result["mapping_version"], "9007199254740993")
        self.assertEqual(set(result), {"schema_version", "request_id", "ts_user_id", "mapping_version",
            "lease_id", "attempt_id", "phase", "portal_acknowledged", "source_receipt_id", "source_receipt_digest"})
        self.assertLess(len(json.dumps(result).encode()), 2048)
        self.assertNotIn("TEST_ONLY-session", json.dumps(result))

    async def test_yielded_mapping_is_not_released_before_terminal_ack(self):
        release, entered = asyncio.Event(), asyncio.Event()
        with patch.object(self.candidate, "prepare", return_value=self.fixture(release=release, entered=entered)):
            task = asyncio.create_task(resolve_identity(self.candidate, self.selection, "TEST_ONLY-double", self.raw))
            await entered.wait()
            self.assertFalse(task.done())
            release.set()
            self.assertEqual((await task)["phase"], "COMMITTED")

    async def test_unknown_rollback_or_missing_ack_never_returns_mapping(self):
        for terminal in [SourceResolution("UNKNOWN", None, None, False),
                         SourceResolution("ROLLED_BACK", "TEST_ONLY-r", "sha256:"+"a"*64, True),
                         SourceResolution("COMMITTED", "TEST_ONLY-r", "sha256:"+"a"*64, False),
                         SourceResolution("COMMITTED", None, "sha256:"+"a"*64, True),
                         SourceResolution("COMMITTED", "TEST_ONLY-r", "bad-digest", True)]:
            with self.subTest(phase=terminal.phase), patch.object(self.candidate, "prepare", return_value=self.fixture(terminal)):
                with self.assertRaisesRegex(IdentityIntakeError, "TERMINAL_UNCONFIRMED"):
                    await resolve_identity(self.candidate, self.selection, "TEST_ONLY-double", self.raw)

    async def test_cancellation_is_not_translated_to_success_or_rollback(self):
        release, entered = asyncio.Event(), asyncio.Event()
        with patch.object(self.candidate, "prepare", return_value=self.fixture(release=release, entered=entered)):
            task = asyncio.create_task(resolve_identity(self.candidate, self.selection, "TEST_ONLY-double", self.raw))
            await entered.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertTrue(self.exited)


if __name__ == "__main__":
    unittest.main()
