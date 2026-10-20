"""TEST_ONLY pure driver checks; no runtime/session/DB/HTTP is contacted."""
import copy
from datetime import datetime, timezone
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

SPEC = importlib.util.spec_from_file_location("epg08_connected_read",
    Path(__file__).with_name("connected_read.py"))
driver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(driver)
PIN = "a" * 64
NOW = datetime(2026, 10, 20, 6, tzinfo=timezone.utc).timestamp()
SESSION_EVIDENCE = (
    "RESEARCH_APPLICATION_SESSION_NOT_CLOUDFLARE_NOT_PASSWORD_NOT_HUMAN_PRESENCE")


def official_session():
    return {"schema_version": "portal.research-acceptance-session-token.v1",
        "session_id": "ses_TEST_ONLY", "user_id": "usr_TEST_ONLY",
        "cookie_name": "__Host-portal_session", "token": "TEST_ONLY_PRIVATE_TOKEN",
        "absolute_expires_at": "2026-10-20T08:00:00Z"}


def inputs():
    cfg = {"schema_version": "portal.execution.connected-read-config.v1", "origin": driver.ORIGIN,
        "stage": "baseline", "environment": "paper", "workspace_id": "ws_TESTONLY12345",
        "profile_id": "PAPER_BINANCE_USDM", "limit": 200, "max_bytes": 1048576,
        "deadline_seconds": 30, "probe_stream": False,
        "core_return": {"path": "/TEST_ONLY/core", "sha256": PIN},
        "session": {"path": "/TEST_ONLY/session", "sha256": "b" * 64}}
    ready = {"schema_version": "portal.execution.connected-read-ready.v1", "status": "INSTALLED",
        "native_selection_verified": True, "core_config_sha256": PIN, "field_policy_sha256": PIN,
        "catalogue_sha256": PIN, "core_commit": "c" * 40, "core_image": "sha256:" + PIN,
        "subject": "usr_TEST_ONLY", "native_revision": 3, "policy_revision": "policy-1",
        "manager_grant_id": "grant-TEST_ONLY", "manager_grant_revision": "grant-revision-1",
        "session_sha256": "b" * 64,
        "acceptance_id": "TEST_ONLY-acceptance", "read_authorized": True,
        "stream_authorized": False, "native_revoked": False, "api_ip": "1.1.1.1",
        "projection_epoch": "TEST_ONLY-epoch", "expires_at": "2026-10-20T08:00:00Z",
        "trust_expires_at": "2026-10-20T08:00:00Z", "native_expires_at": "2026-10-20T08:00:00Z",
        **{k: cfg[k] for k in ("origin", "environment", "workspace_id", "profile_id")}}
    return cfg, {"/TEST_ONLY/core": ready,
        "/TEST_ONLY/session": {"cookie": "__Host-portal_session=TEST_ONLY_PRIVATE_COOKIE",
            "subject": "usr_TEST_ONLY"}}


def page(name, cfg):
    return json.dumps({"schema_version": "portal.execution." +
        ("maximum-data.deployment-page.v1" if name == "deployments" else "eds11r.manager-relation-page.v1"),
        "record_authority": "PORTAL_CONTROL_API", "environment": cfg["environment"],
        "profile_id": cfg["profile_id"], "source_catalogue_sha256": "sha256:" + PIN,
        "source_health": {"availability": "AVAILABLE", "freshness": "FRESH", "completeness": "PARTIAL"},
        "records": []}).encode()


class DriverTests(unittest.TestCase):
    def setUp(self):
        self.cfg, self.docs = inputs()
        self.reader = patch.object(driver, "document", side_effect=lambda ref:
            copy.deepcopy(self.docs[ref["path"]]))
        self.reader.start()
        self.addCleanup(self.reader.stop)

    def prepare(self):
        return driver.prepare(self.cfg, NOW)

    def test_valid_current_installed_scope(self):
        self.assertEqual(self.prepare()["headers"]["Cookie"], self.docs["/TEST_ONLY/session"]["cookie"])

    def use_official_session(self):
        self.docs["/TEST_ONLY/session"] = official_session()
        self.docs["/TEST_ONLY/core"]["session_id"] = "ses_TEST_ONLY"
        return self.docs["/TEST_ONLY/session"]

    def test_official_session_matches_exact_installed_subject_and_session(self):
        session = self.use_official_session()
        prepared = self.prepare()
        self.assertEqual(prepared["headers"], {
            "Cookie": "__Host-portal_session=" + session["token"], "Accept": "application/json"})
        self.assertEqual(prepared["session_evidence_class"], SESSION_EVIDENCE)

    def test_legacy_owner_session_preserves_optional_access_assertion(self):
        self.docs["/TEST_ONLY/session"]["cf_access_assertion"] = "TEST_ONLY_ACCESS_ASSERTION"
        prepared = self.prepare()
        self.assertEqual(prepared["headers"]["Cookie"], self.docs["/TEST_ONLY/session"]["cookie"])
        self.assertEqual(prepared["headers"]["Cf-Access-Jwt-Assertion"], "TEST_ONLY_ACCESS_ASSERTION")
        self.assertIsNone(prepared["session_evidence_class"])

    def test_official_session_requires_matching_producer_session_id_before_network(self):
        self.use_official_session()
        producer = self.docs["/TEST_ONLY/core"]
        for label, value in (("missing", None), ("other", "ses_OTHER"), ("boolean", True)):
            with self.subTest(case=label):
                if value is None:
                    producer.pop("session_id", None)
                else:
                    producer["session_id"] = value
                self.assertRefusedNoNetwork("SESSION_INVALID")

    def test_official_session_shape_scope_and_schema_refused_before_network(self):
        changes = (("subject", "user_id", "usr_OTHER"),
            ("schema", "schema_version", "portal.research-acceptance-session-token.v2"),
            ("cookie", "cookie_name", "portal_session"),
            ("extra", "cf_access_assertion", "TEST_ONLY_ACCESS_ASSERTION"),
            ("mixed_legacy", "cookie", "__Host-portal_session=TEST_ONLY_PRIVATE_COOKIE"))
        for label, key, value in changes:
            with self.subTest(case=label):
                self.use_official_session()[key] = value
                self.assertRefusedNoNetwork("SESSION_INVALID")

    def test_official_session_requires_all_six_fields_before_network(self):
        for key in official_session():
            with self.subTest(field=key):
                session = self.use_official_session()
                del session[key]
                self.assertRefusedNoNetwork("SESSION_INVALID")

    def test_official_session_id_shape_not_only_string_equality(self):
        for session_id in ("TEST_ONLY", "ses_TEST_ONLY\r\n", "ses_", "ses_" + "x" * 129):
            with self.subTest(length=len(session_id)):
                self.use_official_session()["session_id"] = session_id
                self.docs["/TEST_ONLY/core"]["session_id"] = session_id
                self.assertRefusedNoNetwork("SESSION_INVALID")

    def test_official_session_must_outlive_the_complete_request_deadline(self):
        for label, expiry in (("expired", "2026-10-20T05:59:59Z"),
                ("within_deadline", "2026-10-20T06:00:29Z"),
                ("at_deadline", "2026-10-20T06:00:30Z")):
            with self.subTest(case=label):
                self.use_official_session()["absolute_expires_at"] = expiry
                self.assertRefusedNoNetwork("SESSION_INVALID")
        self.use_official_session()["absolute_expires_at"] = "2026-10-20T06:00:31Z"
        self.assertEqual(self.prepare()["session_evidence_class"], SESSION_EVIDENCE)

    def test_official_session_expiry_requires_a_valid_utc_timestamp(self):
        for label, expiry in (("naive", "2026-10-20T08:00:00"),
                ("non_utc", "2026-10-20T08:00:00+01:00"),
                ("malformed", "TEST_ONLY_NOT_A_TIMESTAMP"), ("boolean", True)):
            with self.subTest(case=label):
                self.use_official_session()["absolute_expires_at"] = expiry
                self.assertRefusedNoNetwork("SESSION_INVALID")

    def test_official_session_token_bounds_are_inclusive(self):
        for length in (16, 4096):
            with self.subTest(length=length):
                token = "x" * length
                self.use_official_session()["token"] = token
                self.assertEqual(self.prepare()["headers"]["Cookie"], "__Host-portal_session=" + token)

    def test_official_session_unsafe_or_unbounded_tokens_never_reach_transport(self):
        for label, token in (("short", "x" * 15), ("oversize", "x" * 4097),
                ("header_injection", "TEST_ONLY_PRIVATE_TOKEN\r\nX-Injected: yes"),
                ("cookie_injection", "TEST_ONLY_PRIVATE_TOKEN;other=value"),
                ("space", "TEST_ONLY PRIVATE_TOKEN"),
                ("control", "TEST_ONLY_PRIVATE_TOKEN\x00"), ("non_string", True)):
            with self.subTest(case=label):
                self.use_official_session()["token"] = token
                self.assertRefusedNoNetwork("SESSION_INVALID")

    def test_official_session_failure_output_reports_evidence_without_private_input(self):
        self.use_official_session()
        for failure in ("factory", "request"):
            with self.subTest(failure=failure):
                transport = MagicMock()
                private_error = "TEST_ONLY_PRIVATE_TOKEN /TEST_ONLY/session ses_TEST_ONLY"
                transport.request.side_effect = ValueError(private_error)
                prepared = []
                def factory(value):
                    prepared.append(value)
                    if failure == "factory":
                        raise ValueError(private_error)
                    return transport
                with patch.object(driver.time, "time", return_value=NOW):
                    result = driver.run(self.cfg, factory)
                self.assertEqual(len(prepared), 1)
                self.assertEqual(prepared[0]["headers"]["Cookie"],
                    "__Host-portal_session=TEST_ONLY_PRIVATE_TOKEN")
                self.assertEqual(result["requests"], 0 if failure == "factory" else 1)
                self.assertEqual(result["status"], "NOT_READY" if failure == "factory" else "FAIL")
                self.assertEqual(result["reason"], "INPUT_OR_TRANSPORT_REFUSED")
                self.assertEqual(result["session_evidence_class"], SESSION_EVIDENCE)
                self.assertEqual((result["full_08"], result["full_09"]), ("NOT_MET", "NOT_MET"))
                public = json.dumps(result)
                for private in ("TEST_ONLY_PRIVATE_TOKEN", "/TEST_ONLY/session", "ses_TEST_ONLY",
                                "__Host-portal_session"):
                    self.assertNotIn(private, public)
                self.assertTrue(all(v["status"] == "NOT_RUN" for v in result["cases"].values()))

    def test_only_public_api_not_reverse_identity(self):
        self.cfg["origin"] = "https://core.elp210.candidate.invalid:28444"
        with self.assertRaisesRegex(driver.Refused, "ORIGIN_OR_STAGE_INVALID"):
            self.prepare()

    def test_source_only_and_false_native_marker_are_refused(self):
        for key, value in (("status", "SOURCE_ONLY"), ("native_selection_verified", False)):
            with self.subTest(key=key):
                old = self.docs["/TEST_ONLY/core"][key]
                self.docs["/TEST_ONLY/core"][key] = value
                with self.assertRaisesRegex(driver.Refused, "NATIVE_NOT_INSTALLED"):
                    self.prepare()
                self.docs["/TEST_ONLY/core"][key] = old

    def test_retired_or_expired_head_is_not_ready(self):
        for key, value in (("native_revoked", True), ("read_authorized", False),
                           ("native_expires_at", "2026-10-20T04:35:00Z")):
            with self.subTest(key=key):
                original = self.docs["/TEST_ONLY/core"][key]
                self.docs["/TEST_ONLY/core"][key] = value
                with self.assertRaises(driver.Refused):
                    self.prepare()
                self.docs["/TEST_ONLY/core"][key] = original

    def test_bounds_are_strict_int_not_boolean(self):
        for key, value in (("limit", 201), ("limit", True), ("deadline_seconds", 61),
                           ("max_bytes", 1048577)):
            with self.subTest(key=key, value=value):
                old = self.cfg[key]
                self.cfg[key] = value
                with self.assertRaisesRegex(driver.Refused, "BOUNDS_INVALID"):
                    self.prepare()
                self.cfg[key] = old

    def test_scope_mismatch_denied_before_transport(self):
        self.docs["/TEST_ONLY/core"]["workspace_id"] = "ws_OTHER12345"
        self.assertRefusedNoNetwork()

    def test_header_injection_and_private_ip_denied(self):
        for cookie in ("__Host-portal_session=TEST_ONLY\r\nX-Injected:yes", "other=TEST_ONLY"):
            self.docs["/TEST_ONLY/session"]["cookie"] = cookie
            with self.assertRaises(driver.Refused):
                self.prepare()
        self.docs["/TEST_ONLY/session"]["cookie"] = "__Host-portal_session=TEST_ONLY_PRIVATE_COOKIE"
        self.docs["/TEST_ONLY/core"]["api_ip"] = "127.0.0.1"
        with self.assertRaisesRegex(driver.Refused, "API_IP_INVALID"):
            self.prepare()

    def test_other_subject_or_session_artifact_cannot_borrow_selected_producer(self):
        self.docs["/TEST_ONLY/session"]["subject"] = "usr_OTHER"
        with self.assertRaisesRegex(driver.Refused, "SESSION_INVALID"):
            self.prepare()
        self.docs["/TEST_ONLY/session"]["subject"] = "usr_TEST_ONLY"
        self.cfg["session"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(driver.Refused, "SESSION_INVALID"):
            self.prepare()

    def assertRefusedNoNetwork(self, reason=None):
        factory = unittest.mock.Mock(side_effect=AssertionError("NETWORK_MUST_NOT_START"))
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, factory)
        self.assertEqual(result["status"], "NOT_READY")
        self.assertEqual(result["requests"], 0)
        self.assertFalse(factory.called)
        self.assertTrue(all(v["status"] == "NOT_RUN" for v in result["cases"].values()))
        if reason is not None:
            self.assertEqual(result["reason"], reason)

    def test_unknown_unavailable_and_legacy_200_not_accepted(self):
        p = self.prepare()
        for raw in (b'{}', b'{"status":"healthy"}', page("deployments", self.cfg).replace(
                b'"AVAILABLE"', b'"UNAVAILABLE"'), page("deployments", self.cfg).replace(
                b'"PARTIAL"', b'"UNKNOWN"')):
            with self.assertRaises(driver.Refused):
                driver.finite("deployments", 200, {}, raw, p)

    def test_valid_bounded_page(self):
        self.assertEqual(driver.finite("deployments", 200, {}, page("deployments", self.cfg),
            self.prepare())["rows"], 0)

    def test_snapshot_requires_native_marker_and_expected_epoch(self):
        snapshot = {"schema_version": "portal.execution.profile-realtime.v1",
            "environment": "paper", "profile_id": self.cfg["profile_id"],
            "workspace_id": self.cfg["workspace_id"], "event_type": "snapshot", "terminal": False,
            "reconnect_required": False, "availability": "AVAILABLE", "freshness": "FRESH",
            "completeness": "PARTIAL", "recovery": {"state": "HEALTHY"},
            "payload": {}, "payload_digest": "sha256:" + PIN,
            "projection_epoch": "TEST_ONLY-epoch", "projection_sequence": 1,
            "observation": {"authority": "PORTAL_OBSERVATION", "semantics": "BOUNDED_CURRENT_PAGE",
                "derived": False, "scope": {k: self.cfg[k] for k in
                    ("workspace_id", "environment", "profile_id")},
                "source": {"catalogue_revision": "sha256:" + PIN}}}
        raw = json.dumps(snapshot).encode()
        headers = {"x-portal-realtime-state": "NATIVE_SCOPED_BASELINE_V1",
            "x-portal-realtime-cursor": "TEST_ONLY-opaque"}
        self.assertEqual(driver.finite("snapshot", 200, headers, raw, self.prepare())["status"], "PASS")
        for field in headers:
            changed = dict(headers)
            del changed[field]
            with self.assertRaises(driver.Refused):
                driver.finite("snapshot", 200, changed, raw, self.prepare())
        for key, value in (("workspace_id", "ws_OTHER12345"), ("freshness", "STALE"),
                           ("availability", "UNKNOWN"), ("event_type", "heartbeat")):
            with self.subTest(key=key):
                changed = json.dumps({**snapshot, key: value}).encode()
                with self.assertRaises(driver.Refused):
                    driver.finite("snapshot", 200, headers, changed, self.prepare())

    def test_fixed_routes_no_arbitrary_sql_path_or_snapshot_workspace_override(self):
        self.assertIn("current/account-balances?", driver.route("relation", self.cfg))
        self.assertEqual(driver.route("snapshot", self.cfg),
            "/api/v1/execution/profiles/paper/realtime-snapshot")
        with self.assertRaisesRegex(driver.Refused, "ROUTE_NOT_ALLOWED"):
            driver.route("https://evil.invalid", self.cfg)

    def test_missing_revoke_provenance_refused(self):
        self.cfg.update(stage="post_revoke", baseline={"path": "/TEST_ONLY/baseline", "sha256": PIN},
            revoke_return={"path": "/TEST_ONLY/revoke", "sha256": PIN})
        self.docs["/TEST_ONLY/baseline"] = {"schema_version": "portal.execution.connected-read-baseline.v1",
            "scope_sha256": self.prepare_baseline_scope(), "producer_sha256": PIN,
            "cursor": "TEST_ONLY-opaque", "at_utc": "2026-10-20T05:00:00Z"}
        self.docs["/TEST_ONLY/revoke"] = {"revoked": True}
        with self.assertRaisesRegex(driver.Refused, "REVOKE_PROVENANCE_INVALID"):
            self.prepare()

    def post_inputs(self, authority):
        scope = self.prepare_baseline_scope()
        prior = {"schema_version": "portal.execution.connected-read-baseline.v1",
            "scope_sha256": scope, "producer_sha256": "d" * 64, "policy_revision": "policy-1",
            "manager_grant_revision": "grant-revision-1",
            "native_revision": 3, "cursor": "TEST_ONLY-opaque", "at_utc": "2026-10-20T05:00:00Z"}
        revoke = {"schema_version": "portal.execution.connected-read-revoke.v1", "status": "COMMITTED",
            "authority": authority, "baseline_sha256": "e" * 64, "scope_sha256": scope,
            "previous_producer_sha256": "d" * 64, "current_producer_sha256": PIN,
            "official_receipt_sha256": "f" * 64, "committed_at_utc": "2026-10-20T05:01:00Z",
            "previous_policy_revision": "policy-1", "previous_native_revision": 3}
        revoke["previous_manager_grant_revision"] = "grant-revision-1"
        self.cfg.update(stage="post_revoke", baseline={"path": "/TEST_ONLY/baseline", "sha256": "e" * 64},
            revoke_return={"path": "/TEST_ONLY/revoke", "sha256": "f" * 64})
        self.docs.update({"/TEST_ONLY/baseline": prior, "/TEST_ONLY/revoke": revoke})
        return self.docs["/TEST_ONLY/core"], revoke

    def test_core_policy_revoke_unchanged_native_head_binds_exact_baseline(self):
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2")
        self.assertEqual(self.prepare()["prior"]["native_revision"], producer["native_revision"])

    def test_pm_revoke_requires_new_head_not_policy_revision_change(self):
        producer, _ = self.post_inputs("PM_NATIVE_READ")
        producer.update(native_revoked=True, native_revision=4)
        self.assertEqual(self.prepare()["producer"]["policy_revision"], "policy-1")

    def test_core_revoke_accepts_changed_official_grant_revision_with_same_policy(self):
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, manager_grant_revision="grant-revision-2")
        self.assertEqual(self.prepare()["producer"]["policy_revision"], "policy-1")

    def test_self_reported_revoke_without_changed_current_authority_refused(self):
        self.post_inputs("CORE_MANAGER_DOMAIN")
        with self.assertRaisesRegex(driver.Refused, "REVOKE_PROVENANCE_INVALID"):
            self.prepare()

    def test_revoke_cannot_borrow_another_baseline_or_producer(self):
        producer, revoke = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2")
        for key in ("scope_sha256", "baseline_sha256", "previous_producer_sha256", "current_producer_sha256"):
            with self.subTest(key=key):
                original = revoke[key]
                revoke[key] = "0" * 64
                with self.assertRaisesRegex(driver.Refused, "REVOKE_PROVENANCE_INVALID"):
                    self.prepare()
                revoke[key] = original

    def prepare_baseline_scope(self):
        cfg = dict(self.cfg, stage="baseline")
        return driver.prepare(cfg, NOW)["scope"]

    def test_public_receipt_suppresses_arbitrary_exception_and_private_data(self):
        with patch.object(driver, "prepare", side_effect=ValueError("PRIVATE_COOKIE_PASSWORD")):
            receipt = driver.run(self.cfg)
        self.assertNotIn("PRIVATE_COOKIE_PASSWORD", json.dumps(receipt))
        self.assertEqual(receipt["full_08"], "NOT_MET")

    def test_wrong_api_leaf_pin_is_rejected_before_sending_session(self):
        p = self.prepare()
        p["producer"]["api_leaf_sha256"] = "0" * 64
        connection = MagicMock()
        connection.sock.getpeercert.return_value = b"TEST_ONLY_DER"
        with patch.object(driver.http.client, "HTTPSConnection", return_value=connection), \
                patch.object(driver.threading, "Timer"):
            with self.assertRaisesRegex(driver.Refused, "API_CERT_PIN_CHANGED"):
                driver.Transport(p).request("deployments")
        connection.request.assert_not_called()
        connection.sock.shutdown.assert_called_once()

    def test_deadline_abort_retains_socket_after_connection_close_detaches(self):
        p = self.prepare()
        connection, response, tls = MagicMock(), MagicMock(), MagicMock()
        connection.sock = tls
        response.status = 200
        response.getheader.side_effect = lambda key, default=None: {
            "Content-Type": "application/json", "Content-Length": "2"}.get(key, default)
        response.getheaders.return_value = [("Content-Type", "application/json")]
        callbacks = []
        def timer(_seconds, callback):
            callbacks.append(callback)
            return MagicMock()
        def detach():
            connection.sock = None
            return response
        connection.getresponse.side_effect = detach
        def slow_body(_maximum):
            callbacks[0]()  # Model exact global deadline during detached body read.
            self.assertTrue(tls.shutdown.called)
            return b'{}'
        response.read.side_effect = slow_body
        with patch.object(driver.http.client, "HTTPSConnection", return_value=connection), \
                patch.object(driver.threading, "Timer", side_effect=timer):
            with self.assertRaisesRegex(driver.Refused, "DEADLINE_EXCEEDED"):
                driver.Transport(p).request("deployments")
        response.close.assert_called_once()

    def test_failed_native_baseline_never_credits_legacy_finite_json(self):
        p = self.prepare()
        transport = MagicMock()
        transport.request.side_effect = [
            (200, {}, page("deployments", self.cfg)),
            (200, {}, page("deployments", self.cfg)),
            (200, {}, b'{"status":"healthy legacy response"}')]
        with patch.object(driver, "prepare", return_value=p):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual(result["status"], "FAIL")
        self.assertTrue(all(case["status"] != "PASS" for case in result["cases"].values()))

    def test_active_observation_requires_strict_flag_baseline_probe_and_stream_grant(self):
        for value in (1, 0, None, "true", {}):
            with self.subTest(flag_type=type(value).__name__):
                self.cfg["observe_active_stream"] = value
                self.assertRefusedNoNetwork("BOUNDS_INVALID")
        self.cfg["observe_active_stream"] = True
        self.assertRefusedNoNetwork("OBSERVATION_MODE_INVALID")
        self.cfg.update(probe_stream=True, stage="post_revoke")
        self.assertRefusedNoNetwork("OBSERVATION_MODE_INVALID")
        self.cfg["stage"] = "baseline"
        self.assertRefusedNoNetwork("STREAM_NOT_AUTHORIZED")
        self.docs["/TEST_ONLY/core"]["stream_authorized"] = True
        self.assertRefusedNoNetwork("STREAM_SOURCE_SET_UNDECLARED")

    def test_active_observation_transport_uses_remaining_deadline_and_owns_detached_socket(self):
        self.cfg.update(observe_active_stream=True, probe_stream=True)
        self.docs["/TEST_ONLY/core"].update(stream_authorized=True, source_set_ref="TEST_ONLY-source-set")
        prepared = self.prepare()
        connection, response, tls, timer_handle = MagicMock(), MagicMock(), MagicMock(), MagicMock()
        connection.sock = tls
        response.status = 200
        response.getheader.side_effect = lambda key, default=None: {
            "Content-Type": "text/event-stream"}.get(key, default)
        response.getheaders.return_value = [("Content-Type", "text/event-stream")]
        callbacks = []
        def timer(_seconds, callback):
            callbacks.append(callback)
            return timer_handle
        def detach():
            connection.sock = None
            return response
        connection.getresponse.side_effect = detach
        parsed = {"frames": 1, "notices": 1, "bytes": 128, "cursor": "TEST_ONLY-opaque",
            "observation": {"status": "OBSERVED_ONLY", "termination": "DEADLINE",
                "first_notice_after_ms": 0, "terminal_event": None,
                "frame_observations": [], "final_egress_proved": False}}
        def parser(*_args, **_kwargs):
            self.assertIsNone(connection.sock)
            tls.settimeout.assert_called_once_with(30.0)
            callbacks[0]()  # TEST_ONLY model of the owning global timer during the held stream.
            tls.shutdown.assert_called_once_with(driver.socket.SHUT_RDWR)
            return parsed
        with patch.object(driver.time, "monotonic", return_value=10.0), \
                patch.object(driver.http.client, "HTTPSConnection", return_value=connection), \
                patch.object(driver.threading, "Timer", side_effect=timer), \
                patch.object(driver, "read_sse", side_effect=parser) as read_sse:
            result = driver.Transport(prepared).request("stream", "TEST_ONLY-opaque", stream=True)
        read_sse.assert_called_once_with(response, self.cfg["max_bytes"], 40.0,
            "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)
        self.assertEqual(result[2], parsed)
        self.assertEqual(connection.request.call_args.args[0], "GET")
        self.assertEqual(tls.shutdown.call_count, 2)
        self.assertEqual(connection.close.call_count, 2)
        response.close.assert_called_once()
        timer_handle.cancel.assert_called_once()

    def test_active_observation_run_publishes_only_side_facts_and_never_credits_revoke(self):
        self.cfg.update(observe_active_stream=True, probe_stream=True)
        self.docs["/TEST_ONLY/core"].update(stream_authorized=True, source_set_ref="TEST_ONLY-source-set",
            stream_grant_id="stream-grant-TEST_ONLY", stream_grant_revision="stream-revision-1")
        observation = {"status": "OBSERVED_ONLY", "termination": "SOCKET_TIMEOUT",
            "first_notice_after_ms": 0, "terminal_event": None,
            "frame_observations": [{"event_type": "revalidate", "frame_sha256": PIN,
                "received_after_ms": 0}], "final_egress_proved": False}
        transport = MagicMock()
        finite_response = (200, {"x-portal-realtime-cursor": "TEST_ONLY-baseline-private-cursor"}, b"{}")
        transport.request.side_effect = [finite_response, finite_response, finite_response,
            (200, {}, {"frames": 1, "notices": 1, "bytes": 128,
                "cursor": "TEST_ONLY-stream-private-cursor", "raw": "TEST_ONLY_PRIVATE_RAW",
                "observation": observation})]
        checkpoints = []
        with patch.object(driver.time, "time", return_value=NOW), \
                patch.object(driver, "finite", return_value={"status": "PASS"}):
            result = driver.run(self.cfg, lambda _: transport, checkpoints.append)
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual(result["requests"], 4)
        self.assertEqual(transport.request.call_count, 4)
        self.assertEqual(transport.request.call_args.args,
            ("stream", "TEST_ONLY-baseline-private-cursor"))
        self.assertEqual(transport.request.call_args.kwargs, {"stream": True})
        self.assertEqual(result["active_stream_observation"], observation)
        self.assertEqual(len(checkpoints), 1)
        for key, value in (("read_authorized", True), ("stream_authorized", True),
                ("stream_grant_id", "stream-grant-TEST_ONLY"),
                ("stream_grant_revision", "stream-revision-1"),
                ("cursor", "TEST_ONLY-baseline-private-cursor")):
            self.assertEqual(checkpoints[0][key], value)
        for case in ("active_stream_revocation", "cache_revocation", "unaffected_scope", "cursor_resume"):
            self.assertEqual(result["cases"][case]["status"], "NOT_RUN")
        self.assertEqual((result["full_08"], result["full_09"]), ("NOT_MET", "NOT_MET"))
        for private in ("TEST_ONLY_PRIVATE_RAW", "TEST_ONLY-stream-private-cursor",
                        "TEST_ONLY-baseline-private-cursor", "TEST_ONLY_PRIVATE_COOKIE",
                        "stream-grant-TEST_ONLY", "stream-revision-1"):
            self.assertNotIn(private, json.dumps(result))


    def stream_revoke_inputs(self):
        producer = self.docs["/TEST_ONLY/core"]
        producer.update(stream_authorized=True, stream_grant_id="stream-grant-TEST_ONLY",
                        stream_grant_revision="stream-revision-1")
        producer, revoke = self.post_inputs("CORE_MANAGER_DOMAIN")
        prior = self.docs["/TEST_ONLY/baseline"]
        prior.update(read_authorized=True, stream_authorized=True,
                     stream_grant_id=producer["stream_grant_id"],
                     stream_grant_revision="stream-revision-1")
        producer.update(stream_authorized=False, stream_grant_revision="stream-revision-2")
        self.cfg["revoke_action"] = "stream.subscribe"
        revoke.update(action="stream.subscribe", official_receipt={
            "path": "/TEST_ONLY/official", "sha256": "f" * 64})
        decided = int(datetime(2026, 10, 20, 5, 0, 30, tzinfo=timezone.utc).timestamp() * 1000)
        official = {"schema_version": "portal.manager-domain-revoke-receipt.v1",
            "revocation_id": "TEST_ONLY-revocation", "receipt_id": "TEST_ONLY-receipt",
            "grant_id": producer["stream_grant_id"], "action": "stream.subscribe",
            "mode": "REVOKE", "outcome": "REVOKED", "grant_revision_before": "stream-revision-1",
            "grant_revision_after": "stream-revision-2", "policy_revision": "policy-1",
            "valid_until_ms_before": decided + 3600000, "valid_until_ms_after": decided + 3600000,
            "revoked_at_ms": decided, "decided_at_ms": decided, "replayed": False}
        self.docs["/TEST_ONLY/official"] = {
            "schema_version": "portal.native-research-manager-revoke.v1", "results": [official]}
        return producer, prior, revoke, official

    def test_stream_only_revoke_preserves_read_policy_and_native_revision(self):
        producer, prior, _, _ = self.stream_revoke_inputs()
        prepared = self.prepare()
        self.assertEqual(prepared["revoke_action"], "stream.subscribe")
        for key in ("policy_revision", "manager_grant_revision", "native_revision"):
            self.assertEqual(producer[key], prior[key])
        self.assertTrue(producer["read_authorized"])
        self.assertFalse(producer["stream_authorized"])

    def test_stream_revoke_requires_same_live_read_and_native_and_selected_stream(self):
        changes = (("read_authorized", False), ("stream_authorized", True),
            ("native_revoked", True), ("policy_revision", "policy-2"),
            ("manager_grant_revision", "grant-revision-2"), ("native_revision", 4),
            ("stream_grant_id", "stream-OTHER"), ("stream_grant_id", "grant-TEST_ONLY"),
            ("stream_grant_revision", "stream-revision-1"), ("stream_grant_revision", None))
        for key, value in changes:
            with self.subTest(field=key, value=value):
                self.cfg, self.docs = inputs()
                producer, _, _, _ = self.stream_revoke_inputs()
                producer[key] = value
                self.assertRefusedNoNetwork()

    def test_stream_revoke_cannot_borrow_an_unobserved_baseline_grant(self):
        for key in ("read_authorized", "stream_authorized", "stream_grant_id", "stream_grant_revision"):
            with self.subTest(field=key):
                self.cfg, self.docs = inputs()
                _, prior, _, _ = self.stream_revoke_inputs()
                del prior[key]
                self.assertRefusedNoNetwork("REVOKE_PROVENANCE_INVALID")

    def test_stream_receipt_requires_official_pinned_envelope_and_unique_selected_grant(self):
        for change in ("missing", "hash", "bare", "schema", "empty", "duplicate", "mixed_read", "nondict"):
            with self.subTest(change=change):
                self.cfg, self.docs = inputs()
                _, _, revoke, official = self.stream_revoke_inputs()
                envelope = self.docs["/TEST_ONLY/official"]
                if change == "missing":
                    del revoke["official_receipt"]
                elif change == "hash":
                    revoke["official_receipt"]["sha256"] = "0" * 64
                elif change == "bare":
                    self.docs["/TEST_ONLY/official"] = official
                elif change == "schema":
                    envelope["schema_version"] = "TEST_ONLY-unofficial"
                elif change == "empty":
                    envelope["results"] = []
                elif change == "duplicate":
                    envelope["results"].append(copy.deepcopy(official))
                elif change == "mixed_read":
                    envelope["results"].append(dict(official, action="business.read_all",
                        grant_id="grant-TEST_ONLY"))
                else:
                    envelope["results"] = [None]
                self.assertRefusedNoNetwork("STREAM_REVOKE_RECEIPT_INVALID")

    def test_stream_receipt_is_a_fresh_actual_transition_not_expiry_noop_or_replay(self):
        changes = (("action", "business.read_all"), ("outcome", "NARROWED"),
            ("outcome", "NOOP_ALREADY_REVOKED"), ("outcome", "NOOP_EXPIRED"), ("mode", "NARROW"),
            ("replayed", True), ("replayed", 0), ("grant_id", "grant-OTHER"),
            ("grant_revision_before", "stream-revision-OTHER"),
            ("grant_revision_after", "stream-revision-OTHER"), ("policy_revision", "policy-OTHER"),
            ("receipt_id", ""), ("revocation_id", None), ("revoked_at_ms", True),
            ("decided_at_ms", 0), ("valid_until_ms_after", 0), ("revoked_at_ms", int(NOW * 1000)))
        for key, value in changes:
            with self.subTest(field=key, value=value):
                self.cfg, self.docs = inputs()
                _, _, _, official = self.stream_revoke_inputs()
                official[key] = value
                self.assertRefusedNoNetwork("STREAM_REVOKE_RECEIPT_INVALID")

    def test_stream_action_does_not_silently_select_read_or_pm_revoke(self):
        for change in ("config", "owner_action", "pm_authority"):
            with self.subTest(change=change):
                self.cfg, self.docs = inputs()
                _, _, revoke, _ = self.stream_revoke_inputs()
                if change == "config":
                    del self.cfg["revoke_action"]
                elif change == "owner_action":
                    del revoke["action"]
                else:
                    revoke["authority"] = "PM_NATIVE_READ"
                self.assertRefusedNoNetwork("REVOKE_PROVENANCE_INVALID")

    def test_stream_poststage_probes_preserved_read_then_fresh_and_old_cursor_denial(self):
        self.stream_revoke_inputs()
        p = self.prepare()
        transport = MagicMock()
        transport.request.side_effect = [(200, {}, b"TEST_ONLY-page"), (200, {}, b"TEST_ONLY-snapshot"),
            (403, {}, b'{"error":{"code":"ACCESS_DENIED"}}'),
            (403, {}, b'{"error":{"code":"ACCESS_DENIED"}}')]
        with patch.object(driver, "prepare", return_value=p), \
                patch.object(driver, "finite", return_value={"status": "PASS", "bytes": 1}):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual(result["requests"], 4)
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual([x.args[:2] for x in transport.request.call_args_list], [
            ("deployments", None), ("snapshot", None), ("stream", None), ("stream", "TEST_ONLY-opaque")])
        for name in ("post_revoke_stream", "post_revoke_cursor", "post_revoke_stream_read_preserved"):
            self.assertEqual(result["cases"][name]["status"], "PASS")
        for name in ("post_revoke_read", "active_stream_revocation", "cache_revocation", "unaffected_scope"):
            self.assertEqual(result["cases"][name]["status"], "NOT_RUN")
        self.assertEqual((result["full_08"], result["full_09"]), ("NOT_MET", "NOT_MET"))
        self.assertEqual(result["mutations"], 0)
        public = json.dumps(result)
        for private in ("TEST_ONLY-opaque", "stream-grant-TEST_ONLY", "TEST_ONLY-receipt",
                        "TEST_ONLY_PRIVATE_COOKIE"):
            self.assertNotIn(private, public)

    def test_stream_probe_cannot_credit_invalid_cursor_or_pm_eof_as_current_policy_denial(self):
        for status, raw in ((200, b'{}'), (409, b'{"code":"CURSOR_INVALID_OR_EXPIRED"}'),
                (403, b'{"code":"NATIVE_MANAGER_READ_DENIED"}'), (403, b'{"code":"OTHER"}')):
            with self.subTest(status=status, body=raw):
                self.cfg, self.docs = inputs()
                self.stream_revoke_inputs()
                transport = MagicMock()
                transport.request.side_effect = [(200, {}, b"TEST_ONLY-page"),
                    (200, {}, b"TEST_ONLY-snapshot"), (status, {}, raw)]
                with patch.object(driver, "prepare", return_value=self.prepare()), \
                        patch.object(driver, "finite", return_value={"status": "PASS"}):
                    result = driver.run(self.cfg, lambda _: transport)
                self.assertEqual(result["reason"], "REVOKED_STREAM_NOT_DENIED")
                self.assertEqual(result["cases"]["post_revoke_stream"]["status"], "NOT_RUN")

    def test_legacy_read_revoke_still_runs_exact_two_denial_probes(self):
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2")
        transport = MagicMock()
        transport.request.side_effect = [(403, {}, b'{"code":"ACCESS_DENIED"}'),
            (409, {}, b'{"code":"CURSOR_INVALID_OR_EXPIRED"}')]
        with patch.object(driver, "prepare", return_value=self.prepare()):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual(result["requests"], 2)
        self.assertEqual(result["cases"]["post_revoke_read"]["status"], "PASS")
        self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "PASS")
        self.assertEqual(result["cases"]["post_revoke_stream"]["status"], "NOT_RUN")


class SseTests(unittest.TestCase):
    def wire(self, event, **changes):
        quality = {"source_set_ref": "TEST_ONLY-source-set", "portal_observed_at_ms": 0,
            "source_as_of_ms": None, "completeness": "PARTIAL", "freshness": "FRESH",
            "coverage": "CURRENT_PAGE_ONLY", "confidence": "VERIFIED", "reasons": []}
        frame = {"schema_version": "portal.execution.scoped-realtime.v1", "semantics": "NOTIFICATION_ONLY",
            "event_type": event, "terminal": False, "reconnect_required": False, "reason_code": None,
            "next_action": "RESUME_PORTAL_CURSOR" if event == "heartbeat" else "READ_NAMED_SNAPSHOT",
            "resume_cursor": "TEST_ONLY-opaque", "projection_generation": "TEST_ONLY-epoch",
            "quality": None if event == "heartbeat" else quality, **changes}
        return ("id: TEST_ONLY-opaque\nevent: " + event + "\ndata: " + json.dumps(frame) + "\n\n").encode()

    def test_real_revalidate_notice_not_heartbeat(self):
        for event, expected in (("heartbeat", 0), ("revalidate", 1)):
            with self.subTest(event=event):
                result = self.read(self.wire(event))
                self.assertEqual(result["notices"], expected)

    def read(self, raw, maximum=8192):
        return driver.read_sse(io.BytesIO(raw), maximum, driver.time.monotonic() + 2,
            "TEST_ONLY-epoch", "TEST_ONLY-source-set")

    def test_mismatched_json_event_is_rejected(self):
        with self.assertRaisesRegex(driver.Refused, "STREAM_FRAME_INVALID"):
            self.read(self.wire("revalidate").replace(b'event: revalidate', b'event: heartbeat'))

    def test_total_and_frame_bytes_bounded(self):
        with self.assertRaisesRegex(driver.Refused, "STREAM_LIMIT"):
            self.read(self.wire("revalidate"), 10)

    def test_raw_row_event_cannot_be_notification(self):
        with self.assertRaises(driver.Refused):
            self.read(self.wire("order"))

    def test_wrong_generation_or_source_set_is_not_positive(self):
        for raw in (self.wire("revalidate", projection_generation="OTHER"),
                    self.wire("revalidate").replace(b'TEST_ONLY-source-set', b'OTHER-source-set')):
            with self.assertRaises(driver.Refused):
                self.read(raw)

    def test_terminal_contract_and_quiet_stream_are_not_positive(self):
        raw = self.wire("access_revoked", terminal=True, resume_cursor=None,
            projection_generation=None, quality=None, reason_code="ACCESS_CHANGED",
            next_action="SIGN_IN_OR_REQUEST_ACCESS")
        self.assertEqual(self.read(raw)["notices"], 0)
        self.assertEqual(self.read(b'')["notices"], 0)
        with self.assertRaises(driver.Refused):
            self.read(self.wire("access_revoked", terminal=True))

    def test_buffered_notice_after_absolute_deadline_cannot_pass(self):
        with patch.object(driver.time, "monotonic", side_effect=[0, 0, 0, 0, 2]):
            with self.assertRaisesRegex(driver.Refused, "DEADLINE_EXCEEDED"):
                driver.read_sse(io.BytesIO(self.wire("revalidate")), 8192, 1,
                    "TEST_ONLY-epoch", "TEST_ONLY-source-set")

    def capture(self, raw, maximum=8192):
        with patch.object(driver.time, "monotonic", return_value=10.0):
            return driver.read_sse(io.BytesIO(raw), maximum, 12.0,
                "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)

    def assertObservation(self, result, termination, events):
        observation = result["observation"]
        self.assertEqual(set(observation), {"status", "termination", "first_notice_after_ms",
            "terminal_event", "frame_observations", "final_egress_proved", "started_at_utc", "elapsed_ms"})
        self.assertEqual(datetime.fromisoformat(observation["started_at_utc"]).utcoffset().total_seconds(), 0)
        self.assertIs(type(observation["elapsed_ms"]), int)
        self.assertGreaterEqual(observation["elapsed_ms"], 0)
        self.assertEqual(observation["status"], "OBSERVED_ONLY")
        self.assertEqual(observation["termination"], termination)
        self.assertIs(observation["final_egress_proved"], False)
        self.assertEqual([frame["event_type"] for frame in observation["frame_observations"]], events)
        for frame in observation["frame_observations"]:
            self.assertEqual(set(frame), {"event_type", "frame_sha256", "received_after_ms"})
            self.assertRegex(frame["frame_sha256"], r"\A[a-f0-9]{64}\Z")
            self.assertIs(type(frame["received_after_ms"]), int)
            self.assertGreaterEqual(frame["received_after_ms"], 0)
        public = json.dumps(observation)
        for private in ("TEST_ONLY-opaque", "TEST_ONLY-epoch", "TEST_ONLY-source-set",
                        "resume_cursor", "projection_generation", "payload", "quality"):
            self.assertNotIn(private, public)
        return observation

    def test_observation_is_opt_in_and_default_still_stops_at_first_notice(self):
        first = self.wire("revalidate")
        raw = first + self.wire("heartbeat") + self.wire("revalidate")
        for kwargs in ({}, {"observe": False}):
            with self.subTest(explicit=bool(kwargs)), \
                    patch.object(driver.time, "monotonic", return_value=10.0):
                result = driver.read_sse(io.BytesIO(raw), 8192, 12.0,
                    "TEST_ONLY-epoch", "TEST_ONLY-source-set", **kwargs)
            self.assertEqual(result, {"frames": 1, "notices": 1,
                "bytes": len(first), "cursor": "TEST_ONLY-opaque"})

    def test_observation_keeps_reading_and_hashes_each_valid_frame_without_raw_data(self):
        wires = [self.wire(event) for event in ("revalidate", "heartbeat", "revalidate")]
        raw = b"".join(wires)
        result = self.capture(raw)
        observation = self.assertObservation(result, "EOF", ["revalidate", "heartbeat", "revalidate"])
        self.assertEqual((result["frames"], result["notices"], result["bytes"]), (3, 2, len(raw)))
        self.assertEqual(result["cursor"], "TEST_ONLY-opaque")
        self.assertEqual(observation["first_notice_after_ms"], 0)
        self.assertIsNone(observation["terminal_event"])
        for wire, observed in zip(wires, observation["frame_observations"]):
            frame = json.loads(next(line[6:] for line in wire.splitlines() if line.startswith(b"data: ")))
            self.assertEqual(observed["frame_sha256"], driver.digest(frame))

    def test_observation_stops_at_valid_terminal_not_the_preceding_notice(self):
        terminal = self.wire("access_revoked", terminal=True, resume_cursor=None,
            projection_generation=None, quality=None, reason_code="ACCESS_CHANGED",
            next_action="SIGN_IN_OR_REQUEST_ACCESS")
        prefix = self.wire("revalidate") + terminal
        result = self.capture(prefix + b"TEST_ONLY_UNREAD_INVALID_TAIL\n\n")
        observation = self.assertObservation(result, "TERMINAL", ["revalidate", "access_revoked"])
        self.assertEqual((result["frames"], result["notices"], result["bytes"]), (2, 1, len(prefix)))
        self.assertEqual(observation["terminal_event"], "access_revoked")

    def test_each_valid_terminal_observation_is_not_final_egress_or_source_notice(self):
        for event, reason, action in (("access_revoked", "ACCESS_CHANGED", "SIGN_IN_OR_REQUEST_ACCESS"),
                ("resync_required", "SNAPSHOT_REQUIRED", "READ_NAMED_SNAPSHOT"),
                ("unavailable", "SOURCE_UNAVAILABLE", "WAIT")):
            with self.subTest(event=event):
                raw = self.wire(event, terminal=True, reconnect_required=event == "resync_required",
                    resume_cursor=None, projection_generation=None, quality=None,
                    reason_code=reason, next_action=action)
                result = self.capture(raw)
                observation = self.assertObservation(result, "TERMINAL", [event])
                self.assertEqual(observation["terminal_event"], event)
                self.assertIsNone(observation["first_notice_after_ms"])
                self.assertEqual(result["notices"], 0)
                self.assertIsNone(result["cursor"])

    def test_empty_comment_and_heartbeat_eof_do_not_manufacture_a_notice(self):
        for raw, events in ((b"", []), (b": TEST_ONLY keepalive\n\n", []),
                            (self.wire("heartbeat"), ["heartbeat"])):
            with self.subTest(events=events, bytes=len(raw)):
                result = self.capture(raw)
                observation = self.assertObservation(result, "EOF", events)
                self.assertEqual(result["notices"], 0)
                self.assertIsNone(result["cursor"])
                self.assertIsNone(observation["first_notice_after_ms"])
                self.assertIsNone(observation["terminal_event"])

    def test_observation_socket_timeout_is_not_a_revoke_or_final_egress(self):
        class TimeoutAfterBytes(io.BytesIO):
            def readline(self, maximum):
                line = super().readline(maximum)
                if not line:
                    raise TimeoutError("TEST_ONLY_QUIET_STREAM")
                return line
        for raw, events, notices in ((b"", [], 0), (self.wire("revalidate"), ["revalidate"], 1)):
            with self.subTest(events=events), patch.object(driver.time, "monotonic", return_value=10.0):
                result = driver.read_sse(TimeoutAfterBytes(raw), 8192, 12.0,
                    "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)
            observation = self.assertObservation(result, "SOCKET_TIMEOUT", events)
            self.assertEqual(result["notices"], notices)
            self.assertIsNone(observation["terminal_event"])

    def test_observation_frame_limit_is_exactly_eight_without_reading_the_ninth(self):
        wire = self.wire("revalidate")
        result = self.capture(wire * 9, maximum=16384)
        self.assertObservation(result, "FRAME_LIMIT", ["revalidate"] * 8)
        self.assertEqual((result["frames"], result["notices"], result["bytes"]), (8, 8, len(wire) * 8))

    def test_observation_expired_deadline_performs_no_read_and_credits_no_notice(self):
        response = MagicMock()
        response.readline.side_effect = AssertionError("TEST_ONLY_MUST_NOT_READ")
        with patch.object(driver.time, "monotonic", return_value=12.0):
            result = driver.read_sse(response, 8192, 12.0,
                "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)
        observation = self.assertObservation(result, "DEADLINE", [])
        self.assertEqual((result["frames"], result["notices"], result["bytes"]), (0, 0, 0))
        self.assertIsNone(observation["first_notice_after_ms"])
        response.readline.assert_not_called()

    def test_observation_does_not_credit_a_frame_delivered_after_the_deadline(self):
        clock = [10.0]
        class LateDelimiter(io.BytesIO):
            def readline(self, maximum):
                line = super().readline(maximum)
                if line == b"\n":
                    clock[0] = 12.0
                return line
        with patch.object(driver.time, "monotonic", side_effect=lambda: clock[0]):
            result = driver.read_sse(LateDelimiter(self.wire("revalidate")), 8192, 12.0,
                "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)
        observation = self.assertObservation(result, "DEADLINE", [])
        self.assertEqual(result["notices"], 0)
        self.assertIsNone(result["cursor"])
        self.assertIsNone(observation["first_notice_after_ms"])

    def test_observation_times_first_notice_and_frames_from_the_same_monotonic_origin(self):
        clock = [10.0]
        class TimedFrames(io.BytesIO):
            def readline(self, maximum):
                line = super().readline(maximum)
                if line == b"\n":
                    clock[0] += 0.125
                return line
        raw = self.wire("heartbeat") + self.wire("revalidate") + self.wire("revalidate")
        with patch.object(driver.time, "monotonic", side_effect=lambda: clock[0]):
            result = driver.read_sse(TimedFrames(raw), 8192, 12.0,
                "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)
        observation = self.assertObservation(result, "EOF", ["heartbeat", "revalidate", "revalidate"])
        self.assertEqual(observation["first_notice_after_ms"], 250)
        self.assertEqual([frame["received_after_ms"] for frame in observation["frame_observations"]],
            [125, 250, 375])

    def test_observation_keeps_byte_and_line_limits_fail_closed(self):
        for raw, maximum in ((self.wire("revalidate"), 10),
                             (b":" + b"x" * 65536 + b"\n", 1048576)):
            with self.subTest(maximum=maximum), self.assertRaisesRegex(driver.Refused, "STREAM_LIMIT"):
                self.capture(raw, maximum)

    def test_observation_does_not_relax_frame_scope_terminal_or_payload_validation(self):
        for raw in (self.wire("revalidate", projection_generation="TEST_ONLY_OTHER"),
                self.wire("revalidate").replace(b"TEST_ONLY-source-set", b"TEST_ONLY-OTHER"),
                self.wire("revalidate").replace(b"event: revalidate", b"event: heartbeat"),
                self.wire("access_revoked", terminal=True),
                self.wire("revalidate", payload={"TEST_ONLY_SECRET": "TEST_ONLY_VALUE"})):
            with self.subTest(bytes=len(raw)), self.assertRaises(driver.Refused):
                self.capture(raw)

    def test_observation_only_classifies_physical_abort_as_deadline_after_deadline(self):
        for after_deadline in (False, True):
            clock = [10.0]
            class AbortedStream:
                def readline(self, _maximum):
                    if after_deadline:
                        clock[0] = 12.0
                    raise OSError("TEST_ONLY_PHYSICAL_ABORT")
            with self.subTest(after_deadline=after_deadline), \
                    patch.object(driver.time, "monotonic", side_effect=lambda: clock[0]):
                if after_deadline:
                    result = driver.read_sse(AbortedStream(), 8192, 12.0,
                        "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)
                    self.assertObservation(result, "DEADLINE", [])
                    self.assertEqual(result["notices"], 0)
                else:
                    with self.assertRaisesRegex(OSError, "TEST_ONLY_PHYSICAL_ABORT"):
                        driver.read_sse(AbortedStream(), 8192, 12.0,
                            "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)

    def test_observation_deadline_aborted_eof_is_not_labeled_peer_eof(self):
        clock = [10.0]
        class DeadlineEof:
            def readline(self, _maximum):
                clock[0] = 12.0
                return b""
        with patch.object(driver.time, "monotonic", side_effect=lambda: clock[0]):
            result = driver.read_sse(DeadlineEof(), 8192, 12.0,
                "TEST_ONLY-epoch", "TEST_ONLY-source-set", observe=True)
        observation = self.assertObservation(result, "DEADLINE", [])
        self.assertEqual(observation["elapsed_ms"], 2000)
        self.assertEqual(result["notices"], 0)


if __name__ == "__main__":
    unittest.main()
