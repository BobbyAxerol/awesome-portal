"""TEST_ONLY pure driver checks; no runtime/session/DB/HTTP is contacted."""
import copy
from hashlib import sha256
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
SAMPLE_CATALOGUE = "6d4c4a6505c02f58d32f0be70a3a80c7073dfbd5666ce9a5490fba645c049142"
# Copy of Core's real offline sample (CORE_STAGE2A_SAMPLE_SNAPSHOT_BODY_20261113.json, fake epoch/time, no data): the envelope
# of the actual service on the seed row. Embedded so the test does not depend on the evidence path.
SAMPLE_SEED_BODY = json.loads(r'''{"schema_version": "portal.execution.profile-realtime.v1", "event_type": "snapshot",
"terminal": false, "reconnect_required": false, "workspace_id": "ws_06G19F61YB8CFR7TEWMS7HQ660", "environment": "paper",
"profile_id": "PAPER_BINANCE_USDM", "cursor": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:1",
"projection_epoch": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "projection_sequence": 1,
"payload_digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222", "source_as_of": null,
"received_at": "2026-11-13T17:17:59.336Z", "last_successful_refresh_at": "2026-11-13T17:17:59.336Z",
"availability": "AVAILABLE", "freshness": "FRESH", "completeness": "UNKNOWN",
"recovery": {"state": "HEALTHY", "reason_code": null, "retry_not_before": null},
"observation": {"authority": "PORTAL_OBSERVATION", "semantics": "BOUNDED_CURRENT_PAGE", "derived": false,
"operation_id": "EXECUTION_PROFILE_OBSERVATION_REVISION",
"scope": {"workspace_id": "ws_06G19F61YB8CFR7TEWMS7HQ660", "environment": "paper", "profile_id": "PAPER_BINANCE_USDM",
"resource_kind": "PROFILE", "resource_id": "PAPER_BINANCE_USDM", "venue": null},
"source": {"contract_revision": "trading-system.portal-execution.manager-v2.runtime.v1",
"catalogue_revision": "sha256:6d4c4a6505c02f58d32f0be70a3a80c7073dfbd5666ce9a5490fba645c049142",
"as_of_ms": null, "received_at_ms": 1794590279336},
"coverage": {"kind": "CURRENT_PROFILE_PROJECTION", "relation_count": 1}},
"payload": {"snapshot_mode": "CURSOR_ONLY", "relation_count": 1,
"source_contract_revision": "trading-system.portal-execution.manager-v2.runtime.v1",
"source_catalogue_sha256": "sha256:6d4c4a6505c02f58d32f0be70a3a80c7073dfbd5666ce9a5490fba645c049142"}}''')
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


class SharedReferencePinTests(unittest.TestCase):
    def test_actual_reviewed_helper_loads_with_duplicate_and_nonfinite_guards(self):
        helper = driver.shared()
        self.assertEqual(helper.decode(b'{"TEST_ONLY":1}'), {"TEST_ONLY": 1})
        for raw in (b'{"key":1,"key":2}', b'{"key":NaN}', b'{"key":Infinity}'):
            with self.subTest(raw=raw), self.assertRaisesRegex(ValueError, "INPUT_INVALID"):
                helper.decode(raw)

    def test_altered_helper_is_refused_before_any_exec(self):
        with patch.object(Path, "read_bytes", return_value=b'raise RuntimeError("TEST_ONLY")'):
            with patch("builtins.exec") as execute:
                with self.assertRaisesRegex(driver.Refused, "HELPER_PIN_CHANGED"):
                    driver.shared()
                execute.assert_not_called()


class DriverTests(unittest.TestCase):
    def setUp(self):
        self.cfg, self.docs = inputs()
        self.reader = patch.object(driver, "document", side_effect=lambda ref:
            copy.deepcopy(self.docs[ref["path"]]))
        self.reader.start()
        self.addCleanup(self.reader.stop)

    def prepare(self):
        return driver.prepare(self.cfg, NOW)

    def pagination_config(self, *, pages=5, rows=20, size=8192):
        self.cfg["bounded_page_probe"] = {
            "max_pages": pages, "max_rows": rows, "max_total_bytes": size}
        self.cfg["limit"] = 2
        return self.prepare()

    def deployment_page(self, ids, next_cursor=None, *, completeness="COMPLETE"):
        result = json.loads(page("deployments", self.cfg))
        result["source_health"]["completeness"] = completeness
        result["records"] = [{"deployment_id": identity} for identity in ids]
        result["page"] = {"next_cursor": next_cursor, "has_more": next_cursor is not None,
            "truncated": False, "total_unknown": True, "maximum_page_rows": 200,
            "maximum_response_bytes": 1048576}
        return json.dumps(result).encode()

    def test_bounded_pages_observe_distinct_keys_without_claiming_r03(self):
        prepared = self.pagination_config()
        responses = iter([(200, {}, self.deployment_page(["PRIVATE-A"], "PRIVATE-CURSOR")),
                          (200, {}, self.deployment_page(["PRIVATE-B"]))])
        requests = []
        def request(name, cursor):
            requests.append((name, cursor))
            return next(responses)
        result = driver.bounded_deployment_pages(prepared, request)
        self.assertEqual(requests, [("deployments", None), ("deployments", "PRIVATE-CURSOR")])
        self.assertEqual((result["status"], result["pages"], result["rows"]),
                         ("OBSERVED_NOT_PROVEN", 2, 2))
        self.assertTrue(result["more_than_one_page"])
        self.assertTrue(result["terminal_page"])
        self.assertTrue(result["terminal_source_complete"])
        self.assertEqual(result["source_oracle"], "NOT_CORRELATED")
        self.assertEqual(result["source_ack"], "NOT_CORRELATED")
        public = json.dumps(result)
        for value in ("PRIVATE-A", "PRIVATE-B", "PRIVATE-CURSOR"):
            self.assertNotIn(value, public)

    def test_bounded_pages_single_partial_and_page_cap_never_claim_completeness(self):
        prepared = self.pagination_config(pages=1)
        result = driver.bounded_deployment_pages(prepared,
            lambda *_: (200, {}, self.deployment_page(["A"], "next", completeness="PARTIAL")))
        self.assertFalse(result["more_than_one_page"])
        self.assertFalse(result["terminal_page"])
        self.assertFalse(result["terminal_source_complete"])
        terminal = driver.bounded_deployment_pages(prepared,
            lambda *_: (200, {}, self.deployment_page(["A"], completeness="PARTIAL")))
        self.assertTrue(terminal["terminal_page"])
        self.assertFalse(terminal["terminal_source_complete"])
        self.assertEqual(terminal["status"], "OBSERVED_NOT_PROVEN")

    def test_bounded_pages_refuse_duplicate_key_and_cursor_cycle(self):
        prepared = self.pagination_config()
        for second, expected in ((self.deployment_page(["A"]), "R03_DUPLICATE_IDENTITY"),
                                 (self.deployment_page(["B"], "again"), "R03_CURSOR_CYCLE")):
            with self.subTest(expected=expected):
                replies = iter([(200, {}, self.deployment_page(["A"], "again")),
                                (200, {}, second)])
                with self.assertRaisesRegex(driver.Refused, expected):
                    driver.bounded_deployment_pages(prepared, lambda *_: next(replies))

    def test_bounded_pages_reject_invalid_shape_scope_freshness_and_bounds(self):
        prepared = self.pagination_config(rows=1, size=8192)
        for raw, expected in ((self.deployment_page(["A", "B"]), "R03_ROW_BOUND_EXCEEDED"),
                              (self.deployment_page([], "next"), "R03_EMPTY_CONTINUATION")):
            with self.subTest(expected=expected), self.assertRaisesRegex(driver.Refused, expected):
                driver.bounded_deployment_pages(prepared, lambda *_: (200, {}, raw))
        original = json.loads(self.deployment_page(["A"]))
        for change, expected in (({"environment": "live"}, "READ_SCOPE_MISMATCH"),
                                 ({"profile_id": "LIVE_BINANCE_USDM"}, "READ_SCOPE_MISMATCH"),
                                 ({"source_catalogue_sha256": "bad"}, "NATIVE_PAGE_UNPROVED")):
            body = dict(original, **change)
            with self.subTest(change=change), self.assertRaisesRegex(driver.Refused, expected):
                driver.bounded_deployment_pages(prepared,
                    lambda *_: (200, {}, json.dumps(body).encode()))
        original["source_health"]["freshness"] = "STALE"
        with self.assertRaisesRegex(driver.Refused, "NATIVE_PAGE_UNPROVED"):
            driver.bounded_deployment_pages(prepared,
                lambda *_: (200, {}, json.dumps(original).encode()))
        prepared["config"]["bounded_page_probe"]["max_total_bytes"] = 1
        with self.assertRaisesRegex(driver.Refused, "R03_BYTE_BOUND_EXCEEDED"):
            driver.bounded_deployment_pages(prepared,
                lambda *_: (200, {}, self.deployment_page(["A"])))

    def test_pagination_mode_runs_without_snapshot_stream_command_or_event(self):
        self.pagination_config()
        transport = MagicMock()
        transport.request.side_effect = [(200, {}, self.deployment_page(["A"], "next")),
                                         (200, {}, self.deployment_page(["B"]))]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual(result["requests"], 2)
        self.assertEqual(result["cases"]["r03_deployment_pages"]["status"], "OBSERVED_NOT_PROVEN")
        self.assertEqual((result["full_08"], result["full_09"]), ("NOT_MET", "NOT_MET"))
        self.assertTrue(all(call.args[0] == "deployments" for call in transport.request.call_args_list))
        for case, value in result["cases"].items():
            if case != "r03_deployment_pages":
                self.assertEqual(value["status"], "NOT_RUN")

    def test_pagination_bounds_fail_before_any_transport(self):
        self.pagination_config()
        for key, value in (("max_pages", 0), ("max_pages", 101),
                           ("max_rows", 20001), ("max_total_bytes", 20971521),
                           ("max_rows", True)):
            with self.subTest(key=key, value=value):
                saved = self.cfg["bounded_page_probe"][key]
                self.cfg["bounded_page_probe"][key] = value
                self.assertRefusedNoNetwork("R03_BOUNDS_INVALID")
                self.cfg["bounded_page_probe"][key] = saved
        self.cfg["probe_stream"] = True
        self.assertRefusedNoNetwork("R03_BOUNDS_INVALID")

    def test_bounded_pages_enforce_core_declared_limits(self):
        prepared = self.pagination_config()
        for field, value in (("maximum_page_rows", True), ("maximum_page_rows", 0),
                             ("maximum_page_rows", 201), ("maximum_response_bytes", True),
                             ("maximum_response_bytes", 1),
                             ("maximum_response_bytes", 1048577)):
            with self.subTest(field=field, value=value):
                body = json.loads(self.deployment_page(["A"]))
                body["page"][field] = value
                with self.assertRaisesRegex(driver.Refused, "R03_PAGE_INVALID"):
                    driver.bounded_deployment_pages(prepared,
                        lambda *_: (200, {}, json.dumps(body).encode()))
        prepared["config"]["max_bytes"] = 1
        with self.assertRaisesRegex(driver.Refused, "R03_PAGE_BYTE_BOUND_EXCEEDED"):
            driver.bounded_deployment_pages(prepared,
                lambda *_: (200, {}, self.deployment_page(["A"])))

    def test_valid_current_installed_scope(self):
        self.assertEqual(self.prepare()["headers"]["Cookie"], self.docs["/TEST_ONLY/session"]["cookie"])

    def test_environment_requires_a_matching_installed_receipt(self):
        for environment in ("paper", "sandbox", "live"):
            with self.subTest(environment=environment):
                self.cfg["environment"] = environment
                self.docs["/TEST_ONLY/core"]["environment"] = environment
                self.assertEqual(self.prepare()["config"]["environment"], environment)
                self.docs["/TEST_ONLY/core"]["environment"] = "wrong_environment"
                self.assertRefusedNoNetwork("SELECTION_MISMATCH")

    def test_canary_is_not_assumed_to_be_a_live_binding(self):
        self.cfg["environment"] = "canary"
        self.docs["/TEST_ONLY/core"]["environment"] = "canary"
        self.assertRefusedNoNetwork("SCOPE_INVALID")

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

    def test_original_read_slot_2700s_session_is_not_a_two_hour_grant(self):
        session = official_session()
        session["absolute_expires_at"] = "2026-11-13T08:00:00Z"
        producer = {"session_id": session["session_id"], "subject": session["user_id"]}
        original = copy.deepcopy(session)
        stamp = driver.utc
        for now in ("2026-11-13T07:30:00Z", "2026-11-13T07:58:59Z"):
            with self.subTest(now=now):
                _, evidence = driver.session_headers(session, producer, stamp(now), 60)
                self.assertEqual(evidence, SESSION_EVIDENCE)
        for now, margin in (("2026-11-13T07:59:00Z", 0),
                            ("2026-11-13T08:00:00Z", 0),
                            ("2026-11-13T09:20:00Z", 0),
                            ("2026-11-13T07:58:59Z", 60)):
            with self.subTest(now=now, margin=margin):
                with self.assertRaisesRegex(driver.Refused, "SESSION_INVALID"):
                    driver.session_headers(session, producer, stamp(now), 60, margin)
        self.assertEqual(session, original)  # No implicit expiry extension or reissue.

    def test_agreed_session_reserve_accepts_exactly_630_seconds_remaining(self):
        self.cfg["session_margin_seconds"] = 600
        self.use_official_session()["absolute_expires_at"] = "2026-10-20T06:10:30Z"
        self.assertEqual(self.prepare()["session_evidence_class"], SESSION_EVIDENCE)

    def test_short_session_reserve_refuses_before_transport(self):
        self.cfg["session_margin_seconds"] = 600
        for expiry in ("2026-10-20T06:00:31Z", "2026-10-20T06:10:29Z",
                       "2026-10-20T06:10:29.999999Z"):
            with self.subTest(expiry=expiry):
                self.use_official_session()["absolute_expires_at"] = expiry
                self.assertRefusedNoNetwork("SESSION_INVALID")

    def test_session_margin_requires_bounded_integer_before_transport(self):
        self.use_official_session()
        for margin in (True, False, -1, 601, "600", 600.0, None):
            with self.subTest(margin=margin):
                self.cfg["session_margin_seconds"] = margin
                self.assertRefusedNoNetwork("SESSION_MARGIN_INVALID")

    def test_legacy_cookie_cannot_prove_requested_session_reserve(self):
        self.cfg["session_margin_seconds"] = 600
        self.assertRefusedNoNetwork("SESSION_EXPIRY_UNVERIFIABLE")
        self.cfg["session_margin_seconds"] = 0
        self.assertEqual(self.prepare()["headers"]["Cookie"],
                         self.docs["/TEST_ONLY/session"]["cookie"])

    def test_portal_session_reserve_does_not_extend_native_or_ready_expiry(self):
        self.cfg["session_margin_seconds"] = 600
        self.use_official_session()["absolute_expires_at"] = "2026-10-20T06:10:30Z"
        for key in ("native_expires_at", "trust_expires_at", "expires_at"):
            self.docs["/TEST_ONLY/core"][key] = "2026-10-20T06:00:31Z"
        self.assertEqual(self.prepare()["session_evidence_class"], SESSION_EVIDENCE)
        self.docs["/TEST_ONLY/core"]["native_expires_at"] = "2026-10-20T06:00:30Z"
        self.assertRefusedNoNetwork("INPUT_EXPIRED")

    def test_session_reserve_receipt_contains_bound_without_credentials(self):
        self.cfg["session_margin_seconds"] = 600
        self.use_official_session()["absolute_expires_at"] = "2026-10-20T06:10:30Z"
        self.pagination_config()
        transport = MagicMock()
        transport.request.return_value = (200, {}, self.deployment_page([]))
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual(result["session_margin_seconds"], 600)
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        public = json.dumps(result)
        for value in ("TEST_ONLY_PRIVATE_TOKEN", "__Host-portal_session", "/TEST_ONLY/session"):
            self.assertNotIn(value, public)

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

    def test_missing_ready_fields_never_start_transport(self):
        required = ("schema_version", "status", "native_selection_verified", "origin",
            "environment", "workspace_id", "profile_id", "core_config_sha256",
            "field_policy_sha256", "catalogue_sha256", "core_commit", "core_image",
            "projection_epoch", "subject", "native_revision", "policy_revision",
            "manager_grant_id", "manager_grant_revision", "acceptance_id",
            "read_authorized", "stream_authorized", "native_revoked", "expires_at",
            "trust_expires_at", "native_expires_at", "session_sha256", "api_ip")
        receipt = self.docs["/TEST_ONLY/core"]
        for field in required:
            with self.subTest(field=field):
                original = receipt.pop(field)
                try:
                    self.assertRefusedNoNetwork()
                finally:
                    receipt[field] = original

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

    def test_page_receipt_preserves_freshness_and_completeness(self):
        for completeness in ("PARTIAL", "COMPLETE"):
            with self.subTest(completeness=completeness):
                body = json.loads(page("deployments", self.cfg))
                body["source_health"]["completeness"] = completeness
                result = driver.finite("deployments", 200, {}, json.dumps(body).encode(),
                    self.prepare())
                self.assertEqual(result["freshness"], "FRESH")
                self.assertEqual(result["completeness"], completeness)
        body["source_health"]["freshness"] = "STALE"
        with self.assertRaisesRegex(driver.Refused, "NATIVE_PAGE_UNPROVED"):
            driver.finite("deployments", 200, {}, json.dumps(body).encode(), self.prepare())

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
        result = driver.finite("snapshot", 200, headers, raw, self.prepare())
        self.assertEqual(result["status"], "PASS")
        self.assertEqual((result["freshness"], result["completeness"]), ("FRESH", "PARTIAL"))
        complete = json.dumps({**snapshot, "completeness": "COMPLETE"}).encode()
        self.assertEqual(driver.finite("snapshot", 200, headers, complete,
            self.prepare())["completeness"], "COMPLETE")
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

    # --- owner-staged acceptance, stage 1: deployments read + its repeat only (no snapshot/cursor/relation/stream) ---
    def test_deployments_only_baseline_runs_two_reads_and_writes_no_cursor(self):
        self.cfg["read_scope"] = "deployments_only"
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = [(200, {}, page("deployments", self.cfg))] * 2
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual(result["requests"], 2)
        self.assertEqual(result["read_scope"], "deployments_only")
        self.assertEqual([c.args[0] for c in transport.request.call_args_list], ["deployments", "deployments"])
        self.assertEqual((result["cases"]["deployments"]["status"], result["cases"]["repeat_read"]["status"]),
                         ("PASS", "PASS"))
        for case in ("snapshot", "relation", "cursor_resume", "stream_notice", "post_revoke_cursor"):
            self.assertEqual(result["cases"][case]["status"], "NOT_RUN")
        self.assertEqual((result["full_08"], result["full_09"]), ("NOT_MET", "NOT_MET"))
        checkpoint = sink.call_args.args[0]
        self.assertNotIn("cursor", checkpoint)
        self.assertEqual(checkpoint["schema_version"], "portal.execution.connected-read-baseline.v1")

    def test_failed_read_reports_http_status_and_safe_error_code_only(self):
        self.cfg["read_scope"] = "deployments_only"
        for status, body, code in ((403, json.dumps({"error": {"code": "NATIVE_MANAGER_READ_DENIED", "message": "secret-ish"}}).encode(),
                                    "NATIVE_MANAGER_READ_DENIED"), (404, b"not json at all", None),
                                   (503, json.dumps({"error": {"code": "bad code with spaces"}}).encode(), None)):
            with self.subTest(status=status):
                transport = MagicMock()
                transport.request.side_effect = [(status, {}, body)]
                with patch.object(driver.time, "time", return_value=NOW):
                    result = driver.run(self.cfg, lambda _: transport)
                self.assertEqual((result["status"], result["reason"], result["requests"]), ("FAIL", "READ_NOT_AVAILABLE", 1))
                self.assertEqual(result["http_status"], status)
                self.assertEqual(result.get("error_code"), code)
                self.assertNotIn("secret-ish", json.dumps(result))

    def test_read_spacing_pauses_between_reads_and_keeps_a_pass_when_the_next_read_fails(self):
        self.cfg["read_scope"] = "deployments_only"
        self.cfg["read_spacing_seconds"] = 3
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = [(200, {}, page("deployments", self.cfg)), (502, {}, b"x")]
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep") as pause:
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        pause.assert_called_once_with(3)
        self.assertEqual((result["status"], result["requests"], result["http_status"]), ("FAIL", 2, 502))
        self.assertEqual(result["cases"]["deployments"]["status"], "PASS")
        self.assertEqual(result["cases"]["repeat_read"]["status"], "NOT_RUN")
        sink.assert_not_called()

    def test_read_spacing_is_bounded_and_off_by_default(self):
        self.cfg["read_spacing_seconds"] = 11
        with self.assertRaisesRegex(driver.Refused, "READ_SPACING_INVALID"):
            self.prepare()
        self.cfg["read_spacing_seconds"] = True
        with self.assertRaisesRegex(driver.Refused, "READ_SPACING_INVALID"):
            self.prepare()
        self.cfg, self.docs = inputs()
        transport = MagicMock()
        transport.request.side_effect = [(404, {}, b"{}")]
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep") as pause:
            driver.run(self.cfg, lambda _: transport)
        pause.assert_not_called()

    def test_full_scope_receipt_has_no_read_scope_marker(self):
        transport = MagicMock()
        transport.request.side_effect = [(404, {}, b"{}")]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertNotIn("read_scope", result)

    def test_deployments_only_refuses_invalid_value_and_stream_or_page_combinations(self):
        self.cfg["read_scope"] = "snapshot_nope"
        with self.assertRaisesRegex(driver.Refused, "READ_SCOPE_INVALID"):
            self.prepare()
        for key, value in (("probe_stream", True), ("observe_active_stream", True),
                           ("bounded_page_probe", {"max_pages": 2, "max_rows": 4, "max_total_bytes": 4096})):
            with self.subTest(key=key):
                self.cfg, self.docs = inputs()
                self.cfg["read_scope"] = "deployments_only"
                self.cfg[key] = value
                if key == "observe_active_stream":
                    self.cfg["probe_stream"] = True
                with self.assertRaises(driver.Refused):
                    self.prepare()

    def test_deployments_only_post_revoke_accepts_cursorless_baseline_and_runs_one_denied_read(self):
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2")
        del self.docs["/TEST_ONLY/baseline"]["cursor"]
        with self.assertRaisesRegex(driver.Refused, "BASELINE_PROVENANCE_INVALID"):
            self.prepare()
        self.cfg["read_scope"] = "deployments_only"
        transport = MagicMock()
        transport.request.side_effect = [(403, {}, json.dumps({"error": {"code": "NATIVE_MANAGER_READ_DENIED"}}).encode())]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual(result["requests"], 1)
        self.assertEqual(result["cases"]["post_revoke_read"]["status"], "PASS")
        self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "NOT_RUN")
        self.assertEqual(result["read_scope"], "deployments_only")

    # --- owner-staged acceptance, stage 2a (snapshot_stage): deployments, its repeat and the native snapshot only ---
    CURSOR = "TEST_ONLY-PRIVATE-REALTIME-CURSOR-VALUE"

    def snapshot_reply(self, **changes):
        body = {"schema_version": "portal.execution.profile-realtime.v1",
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
        body.update(changes)
        return (200, {"x-portal-realtime-state": "NATIVE_SCOPED_BASELINE_V1",
                      "x-portal-realtime-cursor": self.CURSOR}, json.dumps(body).encode())

    def snapshot_stage(self, replies, *, spacing=3):
        self.cfg.update(read_scope="snapshot_stage", read_spacing_seconds=spacing)
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = replies
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep") as pause:
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        return result, transport, sink, pause

    def test_snapshot_stage_runs_three_reads_in_order_and_keeps_the_cursor_out_of_the_receipt(self):
        page_reply = (200, {}, page("deployments", self.cfg))
        result, transport, sink, pause = self.snapshot_stage([page_reply, page_reply, self.snapshot_reply()])
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual((result["requests"], result["read_scope"]), (3, "snapshot_stage"))
        self.assertEqual([c.args[0] for c in transport.request.call_args_list],
                         ["deployments", "deployments", "snapshot"])
        self.assertEqual([c.args[0] for c in pause.call_args_list], [3, 3])
        for case in ("deployments", "repeat_read", "snapshot"):
            self.assertEqual(result["cases"][case]["status"], "PASS")
        for case in ("relation", "stream_notice", "post_revoke_cursor"):
            self.assertEqual(result["cases"][case]["status"], "NOT_RUN")
        self.assertEqual(result["cases"]["cursor_resume"],
                         {"status": "NOT_RUN", "reason": "STREAM_SCOPE_NOT_IN_STAGE_2A"})
        snapshot = result["cases"]["snapshot"]
        self.assertEqual((snapshot["realtime_state"], snapshot["cursor_length"], snapshot["cursor_sha256"]),
            ("NATIVE_SCOPED_BASELINE_V1", len(self.CURSOR), sha256(self.CURSOR.encode()).hexdigest()))
        self.assertNotIn(self.CURSOR, json.dumps(result))      # the serialized receipt (what main() prints)
        self.assertEqual(sink.call_args.args[0]["cursor"], self.CURSOR)   # only the private checkpoint keeps it
        self.assertEqual((result["full_08"], result["full_09"]), ("NOT_MET", "NOT_MET"))

    def test_snapshot_stage_never_runs_relation_even_when_the_ready_doc_pins_one(self):
        self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = PIN
        page_reply = (200, {}, page("deployments", self.cfg))
        result, transport, _, _ = self.snapshot_stage([page_reply, page_reply, self.snapshot_reply()])
        self.assertEqual([c.args[0] for c in transport.request.call_args_list],
                         ["deployments", "deployments", "snapshot"])
        self.assertEqual(result["cases"]["relation"]["status"], "NOT_RUN")

    def test_snapshot_stage_refuses_stream_page_cache_combinations_low_spacing_and_stream_grant(self):
        base = {"read_scope": "snapshot_stage", "read_spacing_seconds": 3}
        for label, change in (("probe_stream", {"probe_stream": True}),
                              ("observe", {"probe_stream": True, "observe_active_stream": True}),
                              ("pages", {"bounded_page_probe": {"max_pages": 2, "max_rows": 4, "max_total_bytes": 4096}}),
                              ("cache", {"cache_proof": {"path": "/TEST_ONLY/cache", "sha256": PIN}}),
                              ("revoke_action", {"revoke_action": "stream.subscribe"})):
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                self.cfg.update(base, **change)
                with self.assertRaises(driver.Refused):
                    self.prepare()
        for spacing in (None, 0, 1, 2):
            with self.subTest(spacing=spacing):
                self.cfg, self.docs = inputs()
                self.cfg["read_scope"] = "snapshot_stage"
                if spacing is not None:
                    self.cfg["read_spacing_seconds"] = spacing
                with self.assertRaisesRegex(driver.Refused, "READ_SPACING_TOO_LOW_FOR_SNAPSHOT_STAGE"):
                    self.prepare()
        self.cfg, self.docs = inputs()
        self.cfg.update(base)
        self.assertEqual(self.prepare()["config"]["read_scope"], "snapshot_stage")
        self.docs["/TEST_ONLY/core"]["stream_authorized"] = True
        with self.assertRaisesRegex(driver.Refused, "STREAM_AUTHORIZED_IN_SNAPSHOT_STAGE"):
            self.prepare()

    def test_snapshot_stage_keeps_passes_when_a_later_read_fails(self):
        page_reply = (200, {}, page("deployments", self.cfg))
        result, _, sink, _ = self.snapshot_stage([page_reply, page_reply, (502, {}, b"x")])
        self.assertEqual((result["status"], result["requests"], result["http_status"]), ("FAIL", 3, 502))
        self.assertEqual((result["cases"]["deployments"]["status"], result["cases"]["repeat_read"]["status"]),
                         ("PASS", "PASS"))
        self.assertEqual(result["cases"]["snapshot"]["status"], "NOT_RUN")
        sink.assert_not_called()
        result, _, _, _ = self.snapshot_stage([page_reply, (503, {}, b"x")])
        self.assertEqual(result["cases"]["deployments"]["status"], "PASS")
        self.assertEqual(result["cases"]["repeat_read"]["status"], "NOT_RUN")

    def test_snapshot_stage_does_not_loosen_snapshot_checks_and_leaks_no_cursor_on_failure(self):
        page_reply = (200, {}, page("deployments", self.cfg))
        for label, change in (("unknown completeness", {"completeness": "UNKNOWN"}),
                              ("unavailable", {"availability": "UNAVAILABLE"}),
                              ("stale", {"freshness": "STALE"}),
                              ("unhealthy", {"recovery": {"state": "DEGRADED"}}),
                              ("other epoch", {"projection_epoch": "OTHER-epoch"})):
            with self.subTest(label):
                result, _, sink, _ = self.snapshot_stage([page_reply, page_reply, self.snapshot_reply(**change)])
                self.assertEqual((result["status"], result["reason"]), ("FAIL", "NATIVE_SNAPSHOT_UNPROVED"))
                self.assertEqual(result["cases"]["snapshot"]["status"], "NOT_RUN")
                self.assertEqual(result["cases"]["deployments"]["status"], "PASS")
                self.assertNotIn(self.CURSOR, json.dumps(result))
                sink.assert_not_called()

    def test_full_scope_snapshot_result_exposes_state_length_and_digest_but_not_the_cursor(self):
        status, headers, raw = self.snapshot_reply()
        result = driver.finite("snapshot", status, headers, raw, self.prepare())
        self.assertEqual((result["realtime_state"], result["cursor_length"], result["cursor_sha256"]),
            ("NATIVE_SCOPED_BASELINE_V1", len(self.CURSOR), sha256(self.CURSOR.encode()).hexdigest()))
        self.assertNotIn(self.CURSOR, json.dumps(result))

    def use_sample(self):
        """Point the fixture config and ready doc at the real sample's identifiers so the sample is used unmodified."""
        sample = copy.deepcopy(SAMPLE_SEED_BODY)
        self.cfg["workspace_id"] = sample["workspace_id"]
        ready = self.docs["/TEST_ONLY/core"]
        ready.update(workspace_id=sample["workspace_id"], projection_epoch=sample["projection_epoch"],
                     catalogue_sha256=SAMPLE_CATALOGUE)
        return sample

    def seed_reply(self, mutate=None, **headers):
        sample = self.use_sample()
        if mutate:
            mutate(sample)
        return (200, {"x-portal-realtime-state": "NATIVE_SCOPED_BASELINE_V1",
                      "x-portal-realtime-cursor": self.CURSOR, **headers}, json.dumps(sample).encode())

    def seed_stage(self, replies):
        self.cfg["snapshot_expectation"] = "seed_read_path"
        return self.snapshot_stage(replies)

    def deployments_reply(self):
        return (200, {}, json.dumps({**json.loads(page("deployments", self.cfg)),
                "source_catalogue_sha256": "sha256:" + SAMPLE_CATALOGUE}).encode())

    def test_real_sample_body_is_accepted_as_read_path_only_and_never_as_pass(self):
        page_reply = self.deployments_reply()
        result, transport, sink, _ = self.seed_stage([page_reply, page_reply, self.seed_reply()])
        self.assertEqual((result["status"], result["requests"]), ("SCOPED_OBSERVATIONS_ONLY", 3))
        read_path = result["cases"]["snapshot_read_path"]
        self.assertEqual((read_path["status"], read_path["rows"], read_path["snapshot_mode"], read_path["relation_count"]),
                         ("READ_PATH_ONLY", 0, "CURSOR_ONLY", 1))
        self.assertEqual((read_path["completeness"], read_path["availability"], read_path["freshness"]),
                         ("UNKNOWN", "AVAILABLE", "FRESH"))
        self.assertIs(read_path["envelope_health_is_source_health"], False)
        self.assertEqual((read_path["realtime_state"], read_path["cursor_length"], read_path["cursor_sha256"]),
            ("NATIVE_SCOPED_BASELINE_V1", len(self.CURSOR), sha256(self.CURSOR.encode()).hexdigest()))
        self.assertEqual(result["cases"]["snapshot"]["status"], "NOT_RUN")        # never the stage's snapshot PASS
        self.assertEqual(result["cases"]["cursor_resume"]["status"], "NOT_RUN")
        self.assertNotIn("PASS", [result["cases"][c]["status"] for c in ("snapshot", "snapshot_read_path")])
        public = json.dumps(result)
        for secret in (self.CURSOR, SAMPLE_SEED_BODY["cursor"]):                  # header cursor and the body's own cursor
            self.assertNotIn(secret, public)
        self.assertEqual(sink.call_args.args[0]["cursor"], self.CURSOR)

    def test_seed_read_path_does_not_assert_availability_or_freshness_values_but_requires_strings(self):
        page_reply = self.deployments_reply()
        for freshness in ("AGING", "STALE", "FRESH"):
            with self.subTest(freshness=freshness):
                self.cfg, self.docs = inputs()
                result, _, _, _ = self.seed_stage([page_reply, page_reply,
                    self.seed_reply(lambda b: b.update(freshness=freshness))])
                self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "READ_PATH_ONLY")
                self.assertEqual(result["cases"]["snapshot_read_path"]["freshness"], freshness)
        for key, value in (("freshness", None), ("availability", None), ("freshness", 5), ("availability", "")):
            with self.subTest(key=key, value=value):
                self.cfg, self.docs = inputs()
                result, _, _, _ = self.seed_stage([page_reply, page_reply,
                    self.seed_reply(lambda b: b.update({key: value}))])
                self.assertEqual((result["status"], result["reason"]), ("FAIL", "SEED_SIGNATURE_MISMATCH"))

    def test_seed_read_path_refuses_every_deviation_and_still_runs_the_other_snapshot_checks(self):
        def payload(**changes):
            return lambda b: b["payload"].update(changes)
        def drop(*path):
            def go(b):
                node = b
                for key in path[:-1]:
                    node = node[key]
                del node[path[-1]]
            return go
        def put(path, value):
            def go(b):
                node = b
                for key in path[:-1]:
                    node = node[key]
                node[path[-1]] = value
            return go
        deviations = {
            "relation_count 2": payload(relation_count=2),
            "relation_count bool": payload(relation_count=True),
            "wrong snapshot_mode": payload(snapshot_mode="FULL"),
            "wrong payload catalogue": payload(source_catalogue_sha256="sha256:" + "9" * 64),
            "wrong payload contract": payload(source_contract_revision="other.contract.v1"),
            "extra payload key": payload(relations=[{"relation": "x"}]),
            "missing payload key": drop("payload", "snapshot_mode"),
            "wrong observation catalogue": put(("observation", "source", "catalogue_revision"), "sha256:" + "9" * 64),
            "wrong observation contract": put(("observation", "source", "contract_revision"), "other.contract.v1"),
            "wrong epoch": put(("projection_epoch",), "other-epoch"),
            "completeness COMPLETE": put(("completeness",), "COMPLETE"),
            "completeness PARTIAL": put(("completeness",), "PARTIAL"),
            "completeness missing": drop("completeness"),
            "source_as_of set": put(("source_as_of",), "2026-11-13T17:00:00.000Z"),
            "as_of_ms set": put(("observation", "source", "as_of_ms"), 1794590000000),
            "coverage missing": drop("observation", "coverage"),
            "coverage wrong kind": put(("observation", "coverage", "kind"), "OTHER"),
            "coverage relation_count 2": put(("observation", "coverage", "relation_count"), 2),
            "unhealthy recovery": put(("recovery", "state"), "DEGRADED"),
            "terminal": put(("terminal",), True),
            "reconnect required": put(("reconnect_required",), True),
            "wrong event": put(("event_type",), "update"),
            "wrong workspace": put(("workspace_id",), "ws_OTHER12345678"),
            "wrong profile": put(("profile_id",), "OTHER_PROFILE"),
            "wrong authority": put(("observation", "authority"), "OTHER"),
            "derived": put(("observation", "derived"), True),
            "bad digest": put(("payload_digest",), "sha256:short"),
            "sequence negative": put(("projection_sequence",), -1),
        }
        page_reply = self.deployments_reply()
        for label, mutate in deviations.items():
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                result, _, sink, _ = self.seed_stage([page_reply, page_reply, self.seed_reply(mutate)])
                self.assertEqual(result["status"], "FAIL")
                self.assertIn(result["reason"], ("SEED_SIGNATURE_MISMATCH", "NATIVE_SNAPSHOT_UNPROVED", "READ_SCOPE_MISMATCH"))
                self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "NOT_RUN")
                self.assertEqual(result["cases"]["deployments"]["status"], "PASS")
                self.assertNotIn(self.CURSOR, json.dumps(result))
                sink.assert_not_called()
        for label, headers in (("header state", {"x-portal-realtime-state": "OTHER"}),
                               ("cursor characters", {"x-portal-realtime-cursor": "bad cursor!"})):
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                result, _, _, _ = self.seed_stage([page_reply, page_reply, self.seed_reply(None, **headers)])
                self.assertEqual((result["status"], result["reason"]), ("FAIL", "NATIVE_SNAPSHOT_UNPROVED"))

    def test_strict_snapshot_still_refuses_the_seed_envelope_and_the_expectation_is_scope_bound(self):
        page_reply = self.deployments_reply()
        status, headers, raw = self.seed_reply()
        with self.assertRaisesRegex(driver.Refused, "NATIVE_SNAPSHOT_UNPROVED"):          # strict (full scope): completeness UNKNOWN
            driver.finite("snapshot", status, headers, raw, self.prepare())
        self.cfg, self.docs = inputs()
        result, _, _, _ = self.snapshot_stage([page_reply, page_reply, self.seed_reply()])   # default expectation: complete
        self.assertEqual((result["status"], result["reason"]), ("FAIL", "NATIVE_SNAPSHOT_UNPROVED"))
        for scope in ("full", "deployments_only"):
            with self.subTest(scope=scope):
                self.cfg, self.docs = inputs()
                self.cfg.update(read_scope=scope, snapshot_expectation="seed_read_path", read_spacing_seconds=3)
                with self.assertRaisesRegex(driver.Refused, "SNAPSHOT_EXPECTATION_INVALID"):
                    self.prepare()
        self.cfg, self.docs = inputs()
        self.cfg.update(read_scope="snapshot_stage", read_spacing_seconds=3, snapshot_expectation="whatever")
        with self.assertRaisesRegex(driver.Refused, "SNAPSHOT_EXPECTATION_INVALID"):
            self.prepare()

    # --- snapshot_only: the ONE-request redo of the snapshot after a snapshot_stage run failed there ---
    def snapshot_only_setup(self, **prior_changes):
        sample = self.use_sample()
        scope = self.prepare_baseline_scope()
        prior = {"schema_version": "portal.execution.connected-read-result.v1", "status": "FAIL", "requests": 3,
                 "read_scope": "snapshot_stage", "producer_sha256": PIN, "scope_sha256": scope,
                 "cases": {"deployments": {"status": "PASS", "body_sha256": "1" * 64},
                           "repeat_read": {"status": "PASS", "body_sha256": "2" * 64},
                           "snapshot": {"status": "NOT_RUN"}, "snapshot_read_path": {"status": "NOT_RUN"}}}
        prior.update(prior_changes)
        self.docs["/TEST_ONLY/prior"] = prior
        self.cfg.update(read_scope="snapshot_only", snapshot_expectation="seed_read_path",
                        carry_forward_result={"path": "/TEST_ONLY/prior", "sha256": "c" * 64})
        return prior

    def run_snapshot_only(self, replies):
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = replies
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep") as pause:
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        return result, transport, sink, pause

    def test_snapshot_only_makes_one_request_carries_the_passes_and_writes_the_checkpoint(self):
        self.snapshot_only_setup()
        result, transport, sink, pause = self.run_snapshot_only([self.seed_reply(), self.seed_reply()])
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 1, "snapshot_only"))
        self.assertEqual([c.args[0] for c in transport.request.call_args_list], ["snapshot"])
        pause.assert_not_called()
        for case, digest_char in (("deployments", "1"), ("repeat_read", "2")):
            self.assertEqual(result["cases"][case], {"status": "CARRIED_PASS",
                "carried_from_result_sha256": "c" * 64, "body_sha256": digest_char * 64})
        self.assertEqual(result["carried_from_result_sha256"], "c" * 64)
        self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "READ_PATH_ONLY")
        self.assertEqual(result["cases"]["snapshot"]["status"], "NOT_RUN")
        self.assertEqual(result["cases"]["cursor_resume"]["status"], "NOT_RUN")
        self.assertNotIn("PASS", [v["status"] for v in result["cases"].values()])
        checkpoint = sink.call_args.args[0]
        self.assertEqual((checkpoint["prime_body_sha256"], checkpoint["read_body_sha256"], checkpoint["cursor"]),
                         ("1" * 64, "2" * 64, self.CURSOR))
        public = json.dumps(result)
        for secret in (self.CURSOR, SAMPLE_SEED_BODY["cursor"]):
            self.assertNotIn(secret, public)

    def test_snapshot_only_failed_snapshot_keeps_carried_cases_counts_one_request_and_writes_no_checkpoint(self):
        self.snapshot_only_setup()
        result, transport, sink, _ = self.run_snapshot_only([(502, {}, b"x"), self.seed_reply()])
        self.assertEqual((result["status"], result["requests"], result["http_status"]), ("FAIL", 1, 502))
        self.assertEqual(transport.request.call_count, 1)
        self.assertEqual(result["cases"]["deployments"]["status"], "CARRIED_PASS")
        self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "NOT_RUN")
        sink.assert_not_called()
        self.cfg, self.docs = inputs()          # a non-seed body is still refused on the single read
        self.snapshot_only_setup()
        result, _, sink, _ = self.run_snapshot_only([self.seed_reply(lambda b: b.update(completeness="COMPLETE"))])
        self.assertEqual((result["status"], result["reason"], result["requests"]), ("FAIL", "SEED_SIGNATURE_MISMATCH", 1))
        self.assertNotIn(self.CURSOR, json.dumps(result))
        sink.assert_not_called()

    def test_snapshot_only_refuses_an_invalid_carried_result_or_scope_combination_before_any_network(self):
        refusals = {
            "prior status PASS": lambda p: p.update(status="PASS"),
            "prior not snapshot_stage": lambda p: p.update(read_scope="deployments_only"),
            "prior scope missing": lambda p: p.pop("read_scope"),
            "other producer": lambda p: p.update(producer_sha256="9" * 64),
            "other scope": lambda p: p.update(scope_sha256="8" * 64),
            "wrong schema": lambda p: p.update(schema_version="portal.execution.other.v1"),
            "deployments not PASS": lambda p: p["cases"]["deployments"].update(status="NOT_RUN"),
            "deployments FAIL": lambda p: p["cases"]["deployments"].update(status="FAIL"),
            "repeat not PASS": lambda p: p["cases"]["repeat_read"].update(status="NOT_RUN"),
            "carried PASS not plain": lambda p: p["cases"]["deployments"].update(status="CARRIED_PASS"),
            "no body hash": lambda p: p["cases"]["repeat_read"].pop("body_sha256"),
            "bad body hash": lambda p: p["cases"]["deployments"].update(body_sha256="nothex"),
            "snapshot already PASS": lambda p: p["cases"]["snapshot"].update(status="PASS"),
            "cases missing": lambda p: p.pop("cases"),
        }
        for label, change in refusals.items():
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                prior = self.snapshot_only_setup()
                change(prior)
                with self.assertRaisesRegex(driver.Refused, "CARRY_FORWARD_INVALID"):
                    self.prepare()
        for label, change, code in (
                ("expectation complete", {"snapshot_expectation": "complete"}, "SNAPSHOT_EXPECTATION_INVALID"),
                ("probe_stream", {"probe_stream": True}, None),
                ("observe", {"probe_stream": True, "observe_active_stream": True}, None),
                ("pages", {"bounded_page_probe": {"max_pages": 2, "max_rows": 4, "max_total_bytes": 4096}}, None),
                ("cache", {"cache_proof": {"path": "/TEST_ONLY/cache", "sha256": PIN}}, None),
                ("revoke_action", {"revoke_action": "stream.subscribe"}, None)):
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                self.snapshot_only_setup()
                self.cfg.update(change)
                with self.assertRaisesRegex(driver.Refused, code or ".") as caught:
                    self.prepare()
        self.cfg, self.docs = inputs()
        self.snapshot_only_setup()
        del self.cfg["snapshot_expectation"]
        with self.assertRaisesRegex(driver.Refused, "SNAPSHOT_EXPECTATION_INVALID"):
            self.prepare()
        self.cfg, self.docs = inputs()
        self.snapshot_only_setup()
        del self.cfg["carry_forward_result"]
        with self.assertRaisesRegex(driver.Refused, "CARRY_FORWARD_INVALID"):
            self.prepare()
        self.cfg, self.docs = inputs()
        self.snapshot_only_setup()
        self.cfg["read_scope"] = "snapshot_stage"; self.cfg["read_spacing_seconds"] = 3     # carry key outside snapshot_only
        with self.assertRaisesRegex(driver.Refused, "CARRY_FORWARD_INVALID"):
            self.prepare()
        self.cfg, self.docs = inputs()
        self.snapshot_only_setup()
        self.docs["/TEST_ONLY/core"]["stream_authorized"] = True
        with self.assertRaisesRegex(driver.Refused, "STREAM_AUTHORIZED_IN_SNAPSHOT_STAGE"):
            self.prepare()

    def test_snapshot_only_allows_but_does_not_require_read_spacing(self):
        self.snapshot_only_setup()
        self.assertEqual(self.prepare()["config"]["read_scope"], "snapshot_only")      # no spacing set
        self.cfg["read_spacing_seconds"] = 3
        self.assertEqual(self.prepare()["config"]["read_spacing_seconds"], 3)

    def test_snapshot_only_post_revoke_runs_one_denied_read_and_takes_no_carry_forward(self):
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2")
        self.cfg.update(read_scope="snapshot_only", snapshot_expectation="seed_read_path")
        transport = MagicMock()
        transport.request.side_effect = [(403, {}, json.dumps({"error": {"code": "NATIVE_MANAGER_READ_DENIED"}}).encode())]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 1, "snapshot_only"))
        self.assertEqual(result["cases"]["post_revoke_read"]["status"], "PASS")
        self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "NOT_RUN")
        self.cfg["carry_forward_result"] = {"path": "/TEST_ONLY/prior", "sha256": "c" * 64}
        with self.assertRaisesRegex(driver.Refused, "CARRY_FORWARD_INVALID"):
            self.prepare()

    # --- stage 2b (relation_stage): deployments, ONE relation read (account balances), seed snapshot; typed refusal or empty page ---
    RELATION_PIN = PIN

    def relation_reply(self, mutate=None, status=200):
        body = json.loads(page("relation", self.cfg))
        body["page"] = {"next_cursor": None, "has_more": False}
        if mutate:
            mutate(body)
        return (status, {}, json.dumps(body).encode())

    def typed_reply(self, status, code):
        return (status, {}, json.dumps({"error": {"code": code, "message": "text that must never reach a receipt"}}).encode())

    def relation_stage(self, replies, *, spacing=3, seed=True):
        self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = self.RELATION_PIN
        self.cfg.update(read_scope="relation_stage", read_spacing_seconds=spacing,
                        snapshot_expectation="seed_read_path")
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = replies
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep") as pause:
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        return result, transport, sink, pause

    def test_relation_stage_empty_page_is_observed_not_passed_and_runs_in_order_with_spacing(self):
        snapshot = self.seed_reply()           # also points the fixture at the sample identifiers
        result, transport, sink, pause = self.relation_stage([self.deployments_reply(), self.relation_reply(), snapshot])
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 3, "relation_stage"))
        self.assertEqual([c.args[0] for c in transport.request.call_args_list], ["deployments", "relation", "snapshot"])
        self.assertEqual([c.args[0] for c in pause.call_args_list], [3, 3])
        relation = result["cases"]["relation"]
        self.assertEqual((relation["status"], relation["rows"], relation["has_more"], relation["completeness"],
                          relation["freshness"]), ("RELATION_PAGE_OBSERVED", 0, False, "PARTIAL", "FRESH"))
        self.assertEqual(relation["body_sha256"], sha256(self.relation_reply()[2]).hexdigest())
        self.assertEqual(result["cases"]["deployments"]["status"], "PASS")
        self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "READ_PATH_ONLY")
        for case in ("repeat_read", "snapshot", "cursor_resume", "stream_notice"):
            self.assertEqual(result["cases"][case]["status"], "NOT_RUN")
        self.assertNotEqual(result["cases"]["relation"]["status"], "PASS")
        checkpoint = sink.call_args.args[0]
        self.assertEqual(checkpoint["cursor"], self.CURSOR)
        self.assertNotIn("read_body_sha256", checkpoint)          # no repeat_read in this scope
        public = json.dumps(result)
        for secret in (self.CURSOR, SAMPLE_SEED_BODY["cursor"]):
            self.assertNotIn(secret, public)

    def test_relation_stage_page_with_more_records_is_observed_without_following_or_recording_the_cursor(self):
        snapshot = self.seed_reply()
        def more(body):
            body["records"] = [{"account_id": "A"}]
            body["page"] = {"next_cursor": "NEXT-PRIVATE-CURSOR", "has_more": True}
        result, transport, _, _ = self.relation_stage([self.deployments_reply(), self.relation_reply(more), snapshot])
        self.assertEqual((result["cases"]["relation"]["status"], result["cases"]["relation"]["rows"],
                          result["cases"]["relation"]["has_more"]), ("RELATION_PAGE_OBSERVED", 1, True))
        self.assertEqual(transport.request.call_count, 3)          # the continuation is never read (no R03)
        self.assertNotIn("NEXT-PRIVATE-CURSOR", json.dumps(result))

    def test_relation_stage_typed_refusals_are_recorded_and_the_run_continues_to_the_snapshot(self):
        for status, code in ((400, "MANAGER_V2_INVALID_RELATION"), (400, "MANAGER_V2_INVALID_PAGE_LIMIT"),
                             (400, "MANAGER_V2_INVALID_CURSOR"), (404, "MANAGER_V2_RELATION_NOT_CATALOGUED"),
                             (502, "MANAGER_V2_AUTHORITY_REJECTED"), (413, "MANAGER_V2_SOURCE_RESPONSE_TOO_LARGE"),
                             (400, "MANAGER_V2_FUTURE_CODE"), (503, "SOURCE_UNAVAILABLE"), (409, "SCOPE_CHANGED")):
            with self.subTest(code=code):
                self.cfg, self.docs = inputs()
                snapshot = self.seed_reply()
                reply = self.typed_reply(status, code)
                result, transport, sink, _ = self.relation_stage([self.deployments_reply(), reply, snapshot])
                relation = result["cases"]["relation"]
                self.assertEqual((relation["status"], relation["http_status"], relation["error_code"], relation["rows"]),
                                 ("RELATION_TYPED_REFUSAL", status, code, 0))
                self.assertEqual(relation["body_sha256"], sha256(reply[2]).hexdigest())
                self.assertEqual((result["status"], result["requests"]), ("SCOPED_OBSERVATIONS_ONLY", 3))
                self.assertEqual([c.args[0] for c in transport.request.call_args_list],
                                 ["deployments", "relation", "snapshot"])
                self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "READ_PATH_ONLY")
                self.assertEqual(result["cases"]["deployments"]["status"], "PASS")
                self.assertNotIn("text that must never reach a receipt", json.dumps(result))
                self.assertNotIn(self.CURSOR, json.dumps(result))
                self.assertEqual(sink.call_args.args[0]["cursor"], self.CURSOR)

    def test_relation_stage_anything_else_is_a_fail_and_stops_with_the_deployments_pass_kept(self):
        untyped = ReadNotAvailable = driver.ReadNotAvailable("JSON_CONTENT_TYPE_INVALID")
        untyped.http_status, untyped.error_code, untyped.content_type = 502, None, "text/plain"
        def swap(**fields):
            return lambda body: body.update(fields)
        cases = {
            "502 text/plain at transport": untyped,
            "denial is not typed": self.typed_reply(403, "NATIVE_MANAGER_READ_DENIED"),
            "access denied is not typed": self.typed_reply(403, "ACCESS_DENIED"),
            "502 json without code": (502, {}, b'{"error": {"message": "x"}}'),
            "lowercase code": self.typed_reply(400, "manager_v2_invalid_relation"),
            "non-json 500": (500, {}, b"<html>bad gateway</html>"),
            "bad json 200": (200, {}, b"not json"),
            "wrong schema": self.relation_reply(swap(schema_version="portal.execution.other.v1")),
            "wrong authority": self.relation_reply(swap(record_authority="OTHER")),
            "wrong pin": self.relation_reply(swap(source_catalogue_sha256="sha256:" + "9" * 64)),
            "unavailable health": self.relation_reply(swap(source_health={"availability": "UNAVAILABLE",
                "freshness": "FRESH", "completeness": "PARTIAL"})),
            "records over limit": self.relation_reply(swap(records=[{"a": i} for i in range(6)])),
            "has_more without cursor": self.relation_reply(swap(page={"next_cursor": None, "has_more": True})),
            "cursor without has_more": self.relation_reply(swap(page={"next_cursor": "NEXT", "has_more": False})),
            "has_more not bool": self.relation_reply(swap(page={"next_cursor": None, "has_more": 0})),
        }
        for label, reply in cases.items():
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                self.cfg["limit"] = 5
                snapshot = self.seed_reply()
                self.cfg["limit"] = 5
                replies = [self.deployments_reply(), reply, snapshot]
                result, transport, sink, _ = self.relation_stage(replies)
                self.assertEqual(result["status"], "FAIL")
                self.assertEqual(result["requests"], 2)
                self.assertEqual(transport.request.call_count, 2)
                self.assertEqual(result["cases"]["deployments"]["status"], "PASS")
                self.assertEqual(result["cases"]["relation"]["status"], "NOT_RUN")
                self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "NOT_RUN")
                sink.assert_not_called()

    def test_relation_stage_needs_the_relation_pin_spacing_seed_expectation_and_refuses_stream_page_cache_combinations(self):
        def fresh():
            self.cfg, self.docs = inputs()
            self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = PIN
            self.cfg.update(read_scope="relation_stage", read_spacing_seconds=3, snapshot_expectation="seed_read_path")
        fresh()
        self.assertEqual(self.prepare()["config"]["read_scope"], "relation_stage")
        for label, value in (("missing", None), ("not hex", "xyz"), ("short", "a" * 63), ("not string", 5)):
            with self.subTest(pin=label):
                fresh()
                if value is None:
                    del self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"]
                else:
                    self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = value
                with self.assertRaisesRegex(driver.Refused, "RELATION_CATALOGUE_UNDECLARED"):
                    self.prepare()
        for spacing in (None, 0, 2):
            with self.subTest(spacing=spacing):
                fresh()
                if spacing is None:
                    del self.cfg["read_spacing_seconds"]
                else:
                    self.cfg["read_spacing_seconds"] = spacing
                with self.assertRaisesRegex(driver.Refused, "READ_SPACING_TOO_LOW_FOR_SNAPSHOT_STAGE"):
                    self.prepare()
        for label, change in (("expectation complete", {"snapshot_expectation": "complete"}),
                              ("probe_stream", {"probe_stream": True}),
                              ("observe", {"probe_stream": True, "observe_active_stream": True}),
                              ("pages", {"bounded_page_probe": {"max_pages": 2, "max_rows": 4, "max_total_bytes": 4096}}),
                              ("cache", {"cache_proof": {"path": "/TEST_ONLY/cache", "sha256": PIN}}),
                              ("revoke_action", {"revoke_action": "stream.subscribe"}),
                              ("carry forward", {"carry_forward_result": {"path": "/TEST_ONLY/prior", "sha256": "c" * 64}})):
            with self.subTest(label):
                fresh()
                self.cfg.update(change)
                with self.assertRaises(driver.Refused):
                    self.prepare()
        fresh()
        del self.cfg["snapshot_expectation"]
        with self.assertRaisesRegex(driver.Refused, "SNAPSHOT_EXPECTATION_INVALID"):
            self.prepare()
        fresh()
        self.docs["/TEST_ONLY/core"]["stream_authorized"] = True
        with self.assertRaisesRegex(driver.Refused, "STREAM_AUTHORIZED_IN_SNAPSHOT_STAGE"):
            self.prepare()

    def test_relation_stage_post_revoke_runs_one_denied_read_and_nothing_else(self):
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2", relation_catalogue_sha256=PIN)
        self.cfg.update(read_scope="relation_stage", read_spacing_seconds=3, snapshot_expectation="seed_read_path")
        transport = MagicMock()
        transport.request.side_effect = [(403, {}, json.dumps({"error": {"code": "NATIVE_MANAGER_READ_DENIED"}}).encode())]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 1, "relation_stage"))
        self.assertEqual([c.args[0] for c in transport.request.call_args_list], ["deployments"])
        self.assertEqual(result["cases"]["post_revoke_read"]["status"], "PASS")
        self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "NOT_RUN")
        self.assertEqual(result["cases"]["relation"]["status"], "NOT_RUN")

    # --- stage 2c (relation_walk): R03/R02 on the Binance-predicate rows; pages walked with hashes only ---
    def walk_page(self, keys, *, column="portfolio_id", next_cursor=None, **page_changes):
        body = json.loads(page("relation", self.cfg))
        body["records"] = [{"resource_id": "por1_" + "0" * 8, "values": {column: key}} for key in keys]
        body["page"] = {"next_cursor": next_cursor, "has_more": next_cursor is not None, "total_unknown": True,
                        **page_changes}
        return (200, {}, json.dumps(body).encode())

    def walk_run(self, spec, replies, *, spacing=3, limit=200):
        self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = PIN
        self.cfg.update(read_scope="relation_walk", read_spacing_seconds=spacing, relation_walk=spec, limit=limit)
        clock, calls, queue = [0.0], [], list(replies)
        def fake_sleep(seconds):
            clock[0] += seconds
        def fake_request(name, cursor, stream=False):
            calls.append((name, cursor, clock[0]))
            return queue.pop(0)
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = fake_request
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep", fake_sleep):
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        return result, calls, sink

    def gaps_at_least(self, calls, seconds=3):
        return all(later[2] - earlier[2] >= seconds for earlier, later in zip(calls, calls[1:]))

    def test_relation_walk_two_pages_with_a_hand_computed_keyset_and_no_raw_keys_or_cursors_in_the_receipt(self):
        spec = [{"relation": "portfolios", "limit": 1, "max_pages": 3, "max_rows": 10}]
        first, second = self.walk_page(["PRIVATE-KEY-BBB"], next_cursor="PRIVATE-CURSOR-1"), self.walk_page(["PRIVATE-KEY-AAA"])
        result, calls, sink = self.walk_run(spec, [first, second])
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 2, "relation_walk"))
        self.assertEqual([c[:2] for c in calls], [("relation_walk:portfolios:1", None),
                                                  ("relation_walk:portfolios:1", "PRIVATE-CURSOR-1")])
        self.assertTrue(self.gaps_at_least(calls))
        walk = result["cases"]["walk_portfolios"]
        # sorted keys PRIVATE-KEY-AAA, PRIVATE-KEY-BBB serialised exactly like this, then sha256:
        hand = sha256(b'["PRIVATE-KEY-AAA","PRIVATE-KEY-BBB"]').hexdigest()
        self.assertEqual((walk["status"], walk["pages"], walk["rows"], walk["terminal_page"], walk["more_than_one_page"],
                          walk["keyset_sha256"], walk["limit"], walk["key_columns"]),
                         ("RELATION_WALK_OBSERVED", 2, 2, True, True, hand, 1, ["portfolio_id"]))
        self.assertEqual(walk["page_body_sha256"], [sha256(first[2]).hexdigest(), sha256(second[2]).hexdigest()])
        self.assertEqual((walk["completeness"], walk["freshness"]), ("PARTIAL", "FRESH"))
        self.assertEqual(result["cases"]["cursor_resume"]["status"], "NOT_RUN")
        public = json.dumps(result)
        for secret in ("PRIVATE-KEY-AAA", "PRIVATE-KEY-BBB", "PRIVATE-CURSOR-1"):
            self.assertNotIn(secret, public)
        checkpoint = sink.call_args.args[0]
        self.assertEqual(checkpoint["prime_body_sha256"], sha256(first[2]).hexdigest())
        self.assertNotIn("cursor", checkpoint)
        self.assertNotIn("read_body_sha256", checkpoint)

    def test_relation_walk_271_rows_over_two_pages_and_the_composite_key_canonicalisation(self):
        keys = ["cmd-%03d" % n for n in range(271)]
        spec = [{"relation": "command_journal", "limit": 200, "max_pages": 3, "max_rows": 300}]
        replies = [self.walk_page(keys[:200], column="command_id", next_cursor="C-NEXT"),
                   self.walk_page(keys[200:], column="command_id")]
        result, calls, _ = self.walk_run(spec, replies)
        walk = result["cases"]["walk_command_journal"]
        hand = sha256(("[" + ",".join('"%s"' % key for key in sorted(keys)) + "]").encode()).hexdigest()
        self.assertEqual((walk["pages"], walk["rows"], walk["terminal_page"], walk["keyset_sha256"]), (2, 271, True, hand))
        self.assertEqual(calls[0][0], "relation_walk:command_journal:200")
        # composite key (account_balances): values joined by U+0000 in catalogue order, then json.dumps escapes it
        self.cfg, self.docs = inputs()
        record_page = self.walk_page([], column="account_id")
        body = json.loads(record_page[2])
        body["records"] = [{"resource_id": "por1_x", "values": {"account_id": "acc1", "currency": "USDT"}}]
        result, _, _ = self.walk_run([{"relation": "account_balances", "limit": 10, "max_pages": 1, "max_rows": 5}],
                                     [(200, {}, json.dumps(body).encode())])
        self.assertEqual(result["cases"]["walk_account_balances"]["keyset_sha256"],
                         sha256(b'["acc1\\u0000USDT"]').hexdigest())
        self.assertEqual(driver.keyset_sha256(["b", "a"]), sha256(b'["a","b"]').hexdigest())

    def test_relation_walk_refuses_cycles_duplicates_empty_continuation_inconsistent_paging_and_bounds(self):
        spec = [{"relation": "portfolios", "limit": 1, "max_pages": 5, "max_rows": 3}]
        cases = {
            "cursor cycle": ([self.walk_page(["A"], next_cursor="C1"), self.walk_page(["B"], next_cursor="C1"),
                              self.walk_page(["C"])], "R03_CURSOR_CYCLE"),
            "duplicate key": ([self.walk_page(["A"], next_cursor="C1"), self.walk_page(["A"])], "R03_DUPLICATE_IDENTITY"),
            "has_more with empty records": ([self.walk_page(["A"], next_cursor="C1"),
                                             self.walk_page([], next_cursor="C2")], "R03_EMPTY_CONTINUATION"),
            "has_more without cursor": ([self.walk_page(["A"], has_more=True)], "R03_CURSOR_INVALID"),
            "cursor with has_more false": ([self.walk_page(["A"], next_cursor="C1", has_more=False)], "R03_CURSOR_INVALID"),
            "bad cursor characters": ([self.walk_page(["A"], next_cursor="bad cursor!")], "R03_CURSOR_INVALID"),
            "page missing": ([(200, {}, json.dumps({k: v for k, v in json.loads(self.walk_page(["A"])[2]).items()
                                                    if k != "page"}).encode())], "R03_PAGE_INVALID"),
            "no key values": ([(200, {}, json.dumps({**json.loads(self.walk_page([])[2]), "records": [{"resource_id": "x"}]}).encode())],
                              "WALK_KEY_UNAVAILABLE"),
            "empty key": ([self.walk_page([""])], "WALK_KEY_UNAVAILABLE"),
            "boolean key": ([self.walk_page([True])], "WALK_KEY_UNAVAILABLE"),
        }
        for label, (replies, reason) in cases.items():
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                result, calls, sink = self.walk_run(spec, replies, limit=200)
                self.assertEqual((result["status"], result["reason"]), ("FAIL", reason))
                self.assertEqual(result["cases"]["walk_portfolios"]["status"], "NOT_RUN")
                sink.assert_not_called()
        self.cfg, self.docs = inputs()      # more rows than max_rows (limit 2, max_rows 3)
        result, _, sink = self.walk_run([dict(spec[0], limit=2)], [self.walk_page(["A", "B"], next_cursor="C1"),
                                                                    self.walk_page(["C", "D"])])
        self.assertEqual((result["status"], result["reason"]), ("FAIL", "R03_ROW_BOUND_EXCEEDED"))
        sink.assert_not_called()
        self.cfg, self.docs = inputs()      # records above the walk limit are refused by the page checks
        result, _, _ = self.walk_run(spec, [self.walk_page(["A", "B"])])
        self.assertEqual((result["status"], result["reason"]), ("FAIL", "NATIVE_PAGE_UNPROVED"))
        self.cfg, self.docs = inputs()      # reaching max_pages with more pages left is observed, not terminal
        capped = [{"relation": "portfolios", "limit": 1, "max_pages": 2, "max_rows": 10}]
        result, calls, _ = self.walk_run(capped, [self.walk_page(["A"], next_cursor="C1"),
                                                  self.walk_page(["B"], next_cursor="C2"), self.walk_page(["C"])])
        walk = result["cases"]["walk_portfolios"]
        self.assertEqual((walk["pages"], walk["terminal_page"], walk["more_than_one_page"], len(calls)), (2, False, True, 2))

    def test_relation_walk_typed_refusal_continues_and_anything_else_fails_keeping_earlier_relations(self):
        spec = [{"relation": "portfolios", "limit": 1, "max_pages": 3, "max_rows": 10},
                {"relation": "venues", "limit": 5, "max_pages": 2, "max_rows": 10}]
        refused = self.typed_reply(404, "MANAGER_V2_RELATION_NOT_CATALOGUED")
        result, calls, sink = self.walk_run(spec, [refused, self.walk_page(["BINANCE"], column="venue")])
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        first = result["cases"]["walk_portfolios"]
        self.assertEqual((first["status"], first["http_status"], first["error_code"], first["after_pages"]),
                         ("RELATION_TYPED_REFUSAL", 404, "MANAGER_V2_RELATION_NOT_CATALOGUED", 0))
        self.assertEqual(result["cases"]["walk_venues"]["status"], "RELATION_WALK_OBSERVED")
        self.assertEqual([c[0] for c in calls], ["relation_walk:portfolios:1", "relation_walk:venues:5"])
        self.assertTrue(self.gaps_at_least(calls))         # spacing also across the relation boundary
        self.assertEqual(sink.call_args.args[0]["prime_body_sha256"], sha256(refused[2]).hexdigest())
        self.assertNotIn("text that must never reach a receipt", json.dumps(result))
        self.cfg, self.docs = inputs()                       # typed refusal in the middle of a walk
        mid = self.typed_reply(502, "MANAGER_V2_AUTHORITY_REJECTED")
        result, calls, _ = self.walk_run(spec[:1], [self.walk_page(["A"], next_cursor="C1"), mid])
        self.assertEqual((result["cases"]["walk_portfolios"]["status"], result["cases"]["walk_portfolios"]["after_pages"]),
                         ("RELATION_TYPED_REFUSAL", 1))
        self.assertTrue(self.gaps_at_least(calls))
        for label, bad in (("denial", self.typed_reply(403, "NATIVE_MANAGER_READ_DENIED")),
                           ("text 502", (502, {}, b"<html>bad gateway</html>")),
                           ("wrong schema", (200, {}, json.dumps({**json.loads(self.walk_page(["A"])[2]),
                                                                  "schema_version": "x"}).encode()))):
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                result, _, sink = self.walk_run(spec[::-1], [self.walk_page(["BINANCE"], column="venue"), bad])
                self.assertEqual(result["status"], "FAIL")
                self.assertEqual(result["cases"]["walk_venues"]["status"], "RELATION_WALK_OBSERVED")    # earlier pass kept
                self.assertEqual(result["cases"]["walk_portfolios"]["status"], "NOT_RUN")
                sink.assert_not_called()

    def test_relation_walk_config_bounds_scope_spacing_and_safety_refusals(self):
        good = {"relation": "portfolios", "limit": 1, "max_pages": 2, "max_rows": 10}
        def fresh(spec=None):
            self.cfg, self.docs = inputs()
            self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = PIN
            self.cfg.update(read_scope="relation_walk", read_spacing_seconds=3, relation_walk=[dict(good)] if spec is None else spec)
        fresh()
        self.assertEqual(self.prepare()["config"]["read_scope"], "relation_walk")
        bad_specs = {
            "not a list": dict(good), "empty": [], "unknown relation": [dict(good, relation="orders")],
            "hyphenated relation": [dict(good, relation="command-journal")], "duplicate": [dict(good), dict(good)],
            "extra key": [dict(good, cursor="x")], "missing key": [{k: v for k, v in good.items() if k != "max_rows"}],
            "limit 0": [dict(good, limit=0)], "limit 201": [dict(good, limit=201)], "limit bool": [dict(good, limit=True)],
            "limit text": [dict(good, limit="1")], "pages 0": [dict(good, max_pages=0)], "pages 21": [dict(good, max_pages=21)],
            "rows 0": [dict(good, max_rows=0)], "rows 1001": [dict(good, max_rows=1001)],
            "total requests 21": [dict(good, max_pages=11), dict(good, relation="venues", max_pages=10)],
            "six relations": [dict(good, relation=r) for r in ("portfolios", "venues", "instruments", "command_journal",
                                                                "account_balances", "orders")],
        }
        for label, spec in bad_specs.items():
            with self.subTest(label):
                fresh(spec)
                with self.assertRaisesRegex(driver.Refused, "RELATION_WALK_INVALID"):
                    self.prepare()
        fresh([dict(good, max_pages=10), dict(good, relation="venues", max_pages=10)])
        self.assertEqual(self.prepare()["config"]["read_scope"], "relation_walk")        # exactly 20 total is allowed
        fresh()
        del self.cfg["relation_walk"]
        with self.assertRaisesRegex(driver.Refused, "RELATION_WALK_INVALID"):
            self.prepare()
        fresh()
        self.cfg.update(read_scope="relation_stage", snapshot_expectation="seed_read_path")   # key outside its scope
        with self.assertRaisesRegex(driver.Refused, "RELATION_WALK_INVALID"):
            self.prepare()
        for spacing in (None, 0, 2):
            with self.subTest(spacing=spacing):
                fresh()
                if spacing is None:
                    del self.cfg["read_spacing_seconds"]
                else:
                    self.cfg["read_spacing_seconds"] = spacing
                with self.assertRaisesRegex(driver.Refused, "READ_SPACING_TOO_LOW_FOR_SNAPSHOT_STAGE"):
                    self.prepare()
        for label, change in (("seed expectation", {"snapshot_expectation": "seed_read_path"}),
                              ("probe_stream", {"probe_stream": True}),
                              ("observe", {"probe_stream": True, "observe_active_stream": True}),
                              ("pages", {"bounded_page_probe": {"max_pages": 2, "max_rows": 4, "max_total_bytes": 4096}}),
                              ("cache", {"cache_proof": {"path": "/TEST_ONLY/cache", "sha256": PIN}}),
                              ("revoke_action", {"revoke_action": "stream.subscribe"}),
                              ("carry forward", {"carry_forward_result": {"path": "/TEST_ONLY/prior", "sha256": "c" * 64}})):
            with self.subTest(label):
                fresh()
                self.cfg.update(change)
                with self.assertRaises(driver.Refused):
                    self.prepare()
        fresh()
        del self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"]
        with self.assertRaisesRegex(driver.Refused, "RELATION_CATALOGUE_UNDECLARED"):
            self.prepare()
        fresh()
        self.docs["/TEST_ONLY/core"]["stream_authorized"] = True
        with self.assertRaisesRegex(driver.Refused, "STREAM_AUTHORIZED_IN_SNAPSHOT_STAGE"):
            self.prepare()

    def test_relation_walk_routes_are_fixed_and_the_limit_travels_in_the_name(self):
        self.cfg.update(workspace_id="ws_TESTONLY12345", environment="paper")
        for relation, segment in (("account_balances", "account-balances"), ("portfolios", "portfolios"),
                                  ("venues", "venues"), ("instruments", "instruments"), ("command_journal", "command-journal")):
            self.assertEqual(driver.route("relation_walk:%s:200" % relation, self.cfg),
                "/api/v1/execution/manager/current/%s?workspace_id=ws_TESTONLY12345&environment=paper&limit=200" % segment)
        self.assertTrue(driver.route("relation_walk:portfolios:1", self.cfg, "CUR-1").endswith("&limit=1&cursor=CUR-1"))
        for name in ("relation_walk:orders:5", "relation_walk:portfolios:0", "relation_walk:portfolios:201",
                     "relation_walk:portfolios", "relation_walk:command-journal:5", "relation_walk:portfolios:5/../x"):
            with self.assertRaisesRegex(driver.Refused, "ROUTE_NOT_ALLOWED"):
                driver.route(name, self.cfg)
        with self.assertRaisesRegex(driver.Refused, "CURSOR_INVALID"):
            driver.route("relation_walk:portfolios:1", self.cfg, "bad cursor!")

    def test_relation_walk_post_revoke_makes_one_denied_read_on_the_first_route_with_a_cursorless_baseline(self):
        spec = [{"relation": "venues", "limit": 5, "max_pages": 2, "max_rows": 10},
                {"relation": "portfolios", "limit": 1, "max_pages": 3, "max_rows": 10}]
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2", relation_catalogue_sha256=PIN)
        self.cfg.update(read_scope="relation_walk", read_spacing_seconds=3, relation_walk=spec)
        del self.docs["/TEST_ONLY/baseline"]["cursor"]                       # the walk baseline has no snapshot cursor
        for status, code in ((403, "NATIVE_MANAGER_READ_DENIED"), (403, "ACCESS_DENIED"), (404, "WORKSPACE_NOT_FOUND")):
            with self.subTest(code=code):
                transport = MagicMock()
                transport.request.side_effect = [(status, {}, json.dumps({"error": {"code": code}}).encode())]
                with patch.object(driver.time, "time", return_value=NOW):
                    result = driver.run(self.cfg, lambda _: transport)
                self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                                 ("SCOPED_OBSERVATIONS_ONLY", 1, "relation_walk"))
                self.assertEqual([c.args[:2] for c in transport.request.call_args_list], [("relation_walk:venues:5", None)])
                self.assertEqual(result["cases"]["post_revoke_read"]["status"], "PASS")
                self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "NOT_RUN")
        transport = MagicMock()                                               # a read that is NOT denied fails
        transport.request.side_effect = [self.walk_page(["BINANCE"], column="venue")]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual((result["status"], result["reason"]), ("FAIL", "REVOKED_ACCESS_NOT_DENIED"))
        self.docs["/TEST_ONLY/baseline"]["cursor"] = "TEST_ONLY-opaque"       # a baseline that has a cursor is fine too
        self.assertEqual(self.prepare()["config"]["read_scope"], "relation_walk")
        del self.cfg["relation_walk"]                                         # post_revoke needs the walk list
        with self.assertRaisesRegex(driver.Refused, "RELATION_WALK_INVALID"):
            self.prepare()
        self.cfg["read_scope"] = "snapshot_stage"; self.cfg["read_spacing_seconds"] = 3     # other scopes still need a cursor
        del self.docs["/TEST_ONLY/baseline"]["cursor"]
        with self.assertRaisesRegex(driver.Refused, "BASELINE_PROVENANCE_INVALID"):
            self.prepare()

    # --- stage 2d (relation_sweep): ONE page of each listed relation route; typed refusals recorded; hashes only ---
    SWEEP_26 = ("account-policies", "account-reservations", "account-sync-current-state", "account-sync-effective",
                "account-sync-snapshots", "accounts", "broker-account-sync-current-state", "broker-account-sync-effective",
                "broker-account-sync-snapshots", "broker-sync-state-history", "broker-sync-valuation-current-state",
                "broker-sync-valuation-history", "conditional-order-groups", "execution-sessions", "fills",
                "operator-operations", "order-brackets", "orders", "portfolio-allocations", "portfolio-capital-ledger",
                "positions-v2", "reconciliation-findings", "risk-grants", "risk-profiles", "sizing-decisions",
                "strategy-deployments")
    KEYLESS = ("account_sync_effective", "broker_account_sync_effective", "risk_profiles")

    def sweep_names(self):
        return [route.replace("-", "_") for route in self.SWEEP_26]

    def sweep_page(self, rows=(), next_cursor=None, has_more=None):
        body = json.loads(page("relation", self.cfg))
        body["records"] = [{"resource_id": "por1_x", "values": row} for row in rows]
        body["page"] = {"next_cursor": next_cursor, "has_more": next_cursor is not None if has_more is None else has_more}
        return (200, {}, json.dumps(body).encode())

    def sweep_run(self, spec, replies, *, spacing=3):
        self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = PIN
        self.cfg.update(read_scope="relation_sweep", read_spacing_seconds=spacing, relation_sweep=spec)
        clock, calls, queue = [0.0], [], list(replies)
        def fake_sleep(seconds):
            clock[0] += seconds
        def fake_request(name, cursor, stream=False):
            calls.append((name, cursor, clock[0]))
            return queue.pop(0)
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = fake_request
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep", fake_sleep):
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        return result, calls, sink

    def test_relation_sweep_all_26_in_order_one_request_each_with_spacing_and_keyless_relations(self):
        names = self.sweep_names()
        self.assertEqual(len(names), 26)
        self.assertEqual(set(names) | {"account_balances", "command_journal", "instruments", "portfolios", "venues"},
                         set(driver.SWEEP_RELATIONS))                       # 26 + the 5 walked ones = the 31
        replies = [self.sweep_page() for _ in names]
        result, calls, sink = self.sweep_run(names, replies)
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 26, "relation_sweep"))
        self.assertEqual([c[0] for c in calls], ["relation_sweep:%s:50" % n for n in names])    # default limit 50
        self.assertTrue(all(c[1] is None for c in calls))
        self.assertTrue(all(b[2] - a[2] >= 3 for a, b in zip(calls, calls[1:])))              # fake clock: >= 3 s each
        self.assertEqual(calls[-1][2], 75.0)
        empty_keyset = sha256(b"[]").hexdigest()
        for name in names:
            case = result["cases"]["sweep_" + name]
            self.assertEqual((case["status"], case["pages"], case["rows"], case["has_more"]),
                             ("RELATION_PAGE_OBSERVED", 1, 0, False))
            self.assertEqual(case["body_sha256"], sha256(replies[0][2]).hexdigest())
            self.assertEqual((case["completeness"], case["freshness"], case["limit"]), ("PARTIAL", "FRESH", 50))
            if name in self.KEYLESS:
                self.assertEqual((case["key_columns"], case["keyset_sha256"]), ([], None))
            else:
                self.assertEqual(case["keyset_sha256"], empty_keyset)
                self.assertTrue(case["key_columns"])
        self.assertEqual(result["cases"]["cursor_resume"]["status"], "NOT_RUN")
        checkpoint = sink.call_args.args[0]
        self.assertEqual(checkpoint["prime_body_sha256"], sha256(replies[0][2]).hexdigest())
        self.assertNotIn("cursor", checkpoint)
        self.assertNotIn("read_body_sha256", checkpoint)

    def test_relation_sweep_keys_are_hashed_never_recorded_and_a_continuation_is_noted_not_followed(self):
        spec = [{"relation": "accounts", "limit": 5}, {"relation": "fills", "limit": 5}, {"relation": "risk_profiles", "limit": 5}]
        replies = [self.sweep_page([{"account_id": "PRIVATE-KEY-ZZZ"}, {"account_id": "PRIVATE-KEY-AAA"}],
                                   next_cursor="PRIVATE-CURSOR-9"),
                   self.sweep_page([{"fill_id": "F1", "trade_time": "2026-11-13T00:00:00.000Z"}]),
                   self.sweep_page([{"strategy_id": "S", "mode": "paper"}])]            # keyless: no key is read
        result, calls, sink = self.sweep_run(spec, replies)
        accounts = result["cases"]["sweep_accounts"]
        self.assertEqual((accounts["rows"], accounts["has_more"]), (2, True))
        self.assertEqual(accounts["keyset_sha256"], sha256(b'["PRIVATE-KEY-AAA","PRIVATE-KEY-ZZZ"]').hexdigest())
        self.assertEqual(result["cases"]["sweep_fills"]["keyset_sha256"],
                         sha256(b'["F1\\u00002026-11-13T00:00:00.000Z"]').hexdigest())     # composite: joined by U+0000
        self.assertEqual((result["cases"]["sweep_risk_profiles"]["rows"], result["cases"]["sweep_risk_profiles"]["keyset_sha256"]),
                         (1, None))
        self.assertEqual(len(calls), 3)                                                  # the continuation was not followed
        self.assertTrue(all(call[1] is None for call in calls))
        public = json.dumps(result)
        for secret in ("PRIVATE-KEY-ZZZ", "PRIVATE-KEY-AAA", "PRIVATE-CURSOR-9"):
            self.assertNotIn(secret, public)

    def test_relation_sweep_typed_refusal_continues_and_anything_else_fails_keeping_earlier_passes(self):
        names = ["accounts", "orders", "fills", "positions_v2"]
        refusal = self.typed_reply(404, "MANAGER_V2_RELATION_NOT_CATALOGUED")
        result, calls, sink = self.sweep_run(names, [self.sweep_page(), refusal, self.sweep_page(), self.sweep_page()])
        self.assertEqual((result["status"], result["requests"]), ("SCOPED_OBSERVATIONS_ONLY", 4))
        case = result["cases"]["sweep_orders"]
        self.assertEqual((case["status"], case["http_status"], case["error_code"], case["rows"]),
                         ("RELATION_TYPED_REFUSAL", 404, "MANAGER_V2_RELATION_NOT_CATALOGUED", 0))
        self.assertEqual(result["cases"]["sweep_fills"]["status"], "RELATION_PAGE_OBSERVED")      # continued after it
        self.assertEqual(result["cases"]["sweep_positions_v2"]["status"], "RELATION_PAGE_OBSERVED")
        self.assertTrue(all(b[2] - a[2] >= 3 for a, b in zip(calls, calls[1:])))
        self.assertNotIn("text that must never reach a receipt", json.dumps(result))
        def swap(**fields):
            return (200, {}, json.dumps({**json.loads(self.sweep_page()[2]), **fields}).encode())
        bad = {
            "denial": self.typed_reply(403, "NATIVE_MANAGER_READ_DENIED"),
            "text 502": (502, {}, b"<html>bad gateway</html>"),
            "bad json": (200, {}, b"not json"),
            "wrong schema": swap(schema_version="x"),
            "wrong pin": swap(source_catalogue_sha256="sha256:" + "9" * 64),
            "records over limit": self.sweep_page([{"order_id": str(n)} for n in range(6)]),
            "has_more without cursor": swap(page={"next_cursor": None, "has_more": True}),
            "cursor with has_more false": swap(page={"next_cursor": "C", "has_more": False}),
            "page missing": (200, {}, json.dumps({k: v for k, v in json.loads(self.sweep_page()[2]).items() if k != "page"}).encode()),
            "duplicate key": self.sweep_page([{"order_id": "A"}, {"order_id": "A"}]),
            "missing key column": self.sweep_page([{"other": "A"}]),
            "empty key": self.sweep_page([{"order_id": ""}]),
        }
        for label, reply in bad.items():
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                result, calls, sink = self.sweep_run([{"relation": "accounts", "limit": 5}, {"relation": "orders", "limit": 5},
                                                      {"relation": "fills", "limit": 5}],
                                                     [self.sweep_page(), reply, self.sweep_page()])
                self.assertEqual(result["status"], "FAIL")
                self.assertEqual(len(calls), 2)
                self.assertEqual(result["cases"]["sweep_accounts"]["status"], "RELATION_PAGE_OBSERVED")   # earlier pass kept
                self.assertEqual(result["cases"]["sweep_orders"]["status"], "NOT_RUN")
                self.assertEqual(result["cases"]["sweep_fills"]["status"], "NOT_RUN")
                sink.assert_not_called()

    def test_relation_sweep_config_routes_and_safety_refusals(self):
        def fresh(spec=None):
            self.cfg, self.docs = inputs()
            self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"] = PIN
            self.cfg.update(read_scope="relation_sweep", read_spacing_seconds=3,
                            relation_sweep=["accounts"] if spec is None else spec)
        fresh()
        self.assertEqual(self.prepare()["config"]["read_scope"], "relation_sweep")
        fresh(["accounts", {"relation": "orders", "limit": 200}, {"relation": "fills"}])
        self.assertEqual(driver.sweep_spec(self.cfg["relation_sweep"]), [("accounts", 50), ("orders", 200), ("fills", 50)])
        fresh(list(driver.SWEEP_RELATIONS))
        self.assertEqual(len(self.prepare()["config"]["relation_sweep"]), 31)          # all 31 are allowed
        bad = {"not a list": "accounts", "empty": [], "unknown": ["orders_v9"], "hyphenated": ["account-policies"],
               "duplicate": ["accounts", "accounts"], "dup via dict": ["accounts", {"relation": "accounts", "limit": 5}],
               "too many": list(driver.SWEEP_RELATIONS) + ["accounts"], "limit 0": [{"relation": "accounts", "limit": 0}],
               "limit 201": [{"relation": "accounts", "limit": 201}], "limit bool": [{"relation": "accounts", "limit": True}],
               "limit text": [{"relation": "accounts", "limit": "5"}], "extra key": [{"relation": "accounts", "cursor": "x"}],
               "not strings": [5]}
        for label, spec in bad.items():
            with self.subTest(label):
                fresh(spec)
                with self.assertRaisesRegex(driver.Refused, "RELATION_SWEEP_INVALID"):
                    self.prepare()
        fresh()
        del self.cfg["relation_sweep"]
        with self.assertRaisesRegex(driver.Refused, "RELATION_SWEEP_INVALID"):
            self.prepare()
        fresh()
        self.cfg.update(read_scope="relation_stage", snapshot_expectation="seed_read_path")
        with self.assertRaisesRegex(driver.Refused, "RELATION_SWEEP_INVALID"):
            self.prepare()
        for spacing in (None, 0, 2):
            with self.subTest(spacing=spacing):
                fresh()
                if spacing is None:
                    del self.cfg["read_spacing_seconds"]
                else:
                    self.cfg["read_spacing_seconds"] = spacing
                with self.assertRaisesRegex(driver.Refused, "READ_SPACING_TOO_LOW_FOR_SNAPSHOT_STAGE"):
                    self.prepare()
        for label, change in (("seed expectation", {"snapshot_expectation": "seed_read_path"}),
                              ("probe_stream", {"probe_stream": True}),
                              ("observe", {"probe_stream": True, "observe_active_stream": True}),
                              ("pages", {"bounded_page_probe": {"max_pages": 2, "max_rows": 4, "max_total_bytes": 4096}}),
                              ("cache", {"cache_proof": {"path": "/TEST_ONLY/cache", "sha256": PIN}}),
                              ("revoke_action", {"revoke_action": "stream.subscribe"}),
                              ("carry forward", {"carry_forward_result": {"path": "/TEST_ONLY/prior", "sha256": "c" * 64}}),
                              ("walk list", {"relation_walk": [{"relation": "portfolios", "limit": 1, "max_pages": 1, "max_rows": 1}]})):
            with self.subTest(label):
                fresh()
                self.cfg.update(change)
                with self.assertRaises(driver.Refused):
                    self.prepare()
        fresh()
        del self.docs["/TEST_ONLY/core"]["relation_catalogue_sha256"]
        with self.assertRaisesRegex(driver.Refused, "RELATION_CATALOGUE_UNDECLARED"):
            self.prepare()
        fresh()
        self.docs["/TEST_ONLY/core"]["stream_authorized"] = True
        with self.assertRaisesRegex(driver.Refused, "STREAM_AUTHORIZED_IN_SNAPSHOT_STAGE"):
            self.prepare()
        # routes: data-driven allowlist, the limit travels in the name, never a cursor
        self.cfg.update(workspace_id="ws_TESTONLY12345", environment="paper")
        for relation, entry in driver.SWEEP_RELATIONS.items():
            self.assertEqual(entry["route"], relation.replace("_", "-"))               # all 31 are the hyphenated table name
            self.assertEqual(driver.route("relation_sweep:%s:50" % relation, self.cfg),
                "/api/v1/execution/manager/current/%s?workspace_id=ws_TESTONLY12345&environment=paper&limit=50" % entry["route"])
        for relation, entry in driver.WALK_RELATIONS.items():                           # consistent with the live-proven routes
            self.assertEqual(driver.SWEEP_RELATIONS[relation]["route"], entry["route"])
            self.assertEqual(driver.SWEEP_RELATIONS[relation]["key"], entry["key"])
        for name in ("relation_sweep:orders_v9:5", "relation_sweep:accounts:0", "relation_sweep:accounts:201",
                     "relation_sweep:accounts", "relation_sweep:account-policies:5", "relation_sweep:accounts:5/../x"):
            with self.assertRaisesRegex(driver.Refused, "ROUTE_NOT_ALLOWED"):
                driver.route(name, self.cfg)
        with self.assertRaisesRegex(driver.Refused, "CURSOR_INVALID"):
            driver.route("relation_sweep:accounts:5", self.cfg, "C")

    def test_relation_sweep_post_revoke_makes_one_denied_read_on_the_first_route_with_a_cursorless_baseline(self):
        spec = [{"relation": "orders", "limit": 7}, "fills"]
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2", relation_catalogue_sha256=PIN)
        self.cfg.update(read_scope="relation_sweep", read_spacing_seconds=3, relation_sweep=spec)
        del self.docs["/TEST_ONLY/baseline"]["cursor"]
        for status, code in ((403, "NATIVE_MANAGER_READ_DENIED"), (403, "ACCESS_DENIED"), (404, "WORKSPACE_NOT_FOUND")):
            with self.subTest(code=code):
                transport = MagicMock()
                transport.request.side_effect = [(status, {}, json.dumps({"error": {"code": code}}).encode())]
                with patch.object(driver.time, "time", return_value=NOW):
                    result = driver.run(self.cfg, lambda _: transport)
                self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                                 ("SCOPED_OBSERVATIONS_ONLY", 1, "relation_sweep"))
                self.assertEqual([c.args[:2] for c in transport.request.call_args_list], [("relation_sweep:orders:7", None)])
                self.assertEqual(result["cases"]["post_revoke_read"]["status"], "PASS")
                self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "NOT_RUN")
        transport = MagicMock()
        transport.request.side_effect = [self.sweep_page()]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual((result["status"], result["reason"]), ("FAIL", "REVOKED_ACCESS_NOT_DENIED"))
        del self.cfg["relation_sweep"]
        with self.assertRaisesRegex(driver.Refused, "RELATION_SWEEP_INVALID"):
            self.prepare()

    # --- stage "stream_stage": snapshot cursor, first stream (first notice), resume (one more notice); STREAM grant distinct ---
    def stream_setup(self, expectation="seed_read_path"):
        snapshot = self.seed_reply()           # points the fixture at the sample identifiers first
        self.docs["/TEST_ONLY/core"].update(stream_authorized=True, source_set_ref="TEST_ONLY-source-set",
            stream_grant_id="stream-grant-TEST_ONLY", stream_grant_revision="stream-revision-1")
        self.cfg.update(read_scope="stream_stage", read_spacing_seconds=3, probe_stream=True,
                        snapshot_expectation=expectation)
        return snapshot

    def stream_result(self, notices, cursor="PRIVATE-NOTICE-1", termination="EOF", frames=None):
        return (200, {}, {"frames": notices if frames is None else frames, "notices": notices, "bytes": 100 * notices,
                          "cursor": cursor if notices else None, "termination": termination})

    def stream_run(self, replies):
        clock, calls, queue = [0.0], [], list(replies)
        def fake_sleep(seconds):
            clock[0] += seconds
        def fake_request(name, cursor, stream=False):
            calls.append((name, cursor, stream, clock[0]))
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        transport, sink = MagicMock(), MagicMock()
        transport.request.side_effect = fake_request
        with patch.object(driver.time, "time", return_value=NOW), patch.object(driver.time, "sleep", fake_sleep):
            result = driver.run(self.cfg, lambda _: transport, checkpoint_sink=sink)
        return result, calls, sink

    def test_stream_stage_two_notices_pass_with_pacing_and_no_cursor_bytes_in_the_receipt(self):
        snapshot = self.stream_setup()
        first, resumed = self.stream_result(1, "PRIVATE-NOTICE-1"), self.stream_result(1, "PRIVATE-NOTICE-2")
        result, calls, sink = self.stream_run([snapshot, first, resumed])
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 3, "stream_stage"))
        self.assertEqual([(c[0], c[1], c[2]) for c in calls], [("snapshot", None, False), ("stream", self.CURSOR, True),
                                                               ("stream", "PRIVATE-NOTICE-1", True)])
        self.assertTrue(all(b[3] - a[3] >= 3 for a, b in zip(calls, calls[1:])))      # pacing before each stream request
        self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "READ_PATH_ONLY")
        self.assertEqual(result["cases"]["stream_notice"],
                         {"status": "PASS", "frames": 1, "notices": 1, "bytes": 100, "termination": "EOF"})
        self.assertEqual(result["cases"]["cursor_resume"],
                         {"status": "PASS", "frames": 1, "notices": 1, "bytes": 100, "termination": "EOF"})
        for case in ("deployments", "relation", "repeat_read", "snapshot", "post_revoke_read", "post_revoke_cursor",
                     "post_revoke_stream", "post_revoke_stream_read_preserved", "cache_revocation",
                     "active_stream_revocation", "unaffected_scope", "r03_deployment_pages"):
            self.assertEqual(result["cases"][case]["status"], "NOT_RUN")
        public = json.dumps(result)
        for secret in (self.CURSOR, "PRIVATE-NOTICE-1", "PRIVATE-NOTICE-2", SAMPLE_SEED_BODY["cursor"],
                       "stream-grant-TEST_ONLY", "stream-revision-1"):
            self.assertNotIn(secret, public)
        checkpoint = sink.call_args.args[0]                                            # private file only
        self.assertEqual((checkpoint["cursor"], checkpoint["stream_authorized"], checkpoint["stream_grant_id"],
                          checkpoint["stream_grant_revision"]),
                         (self.CURSOR, True, "stream-grant-TEST_ONLY", "stream-revision-1"))
        self.assertNotIn("read_body_sha256", checkpoint)
        self.assertEqual(checkpoint["prime_body_sha256"], result["cases"]["snapshot_read_path"]["body_sha256"])

    def test_stream_stage_never_passes_a_quiet_stream_a_timeout_or_a_replayed_notice(self):
        for termination in ("SOCKET_TIMEOUT", "DEADLINE", "EOF", "FRAME_LIMIT", "TERMINAL"):
            with self.subTest(first_quiet=termination):
                self.cfg, self.docs = inputs()
                snapshot = self.stream_setup()
                result, calls, _ = self.stream_run([snapshot, self.stream_result(0, termination=termination, frames=2)])
                self.assertEqual((result["status"], result["requests"]), ("SCOPED_OBSERVATIONS_ONLY", 2))
                self.assertEqual(result["cases"]["stream_notice"], {"status": "NOT_RUN", "frames": 2, "notices": 0,
                    "bytes": 0, "termination": termination, "reason": "NO_NOTICE_" + termination})
                self.assertEqual(result["cases"]["cursor_resume"], {"status": "NOT_RUN", "reason": "FIRST_STREAM_NO_NOTICE"})
                self.assertEqual(len(calls), 2)                                          # no resume on a quiet stream
        self.cfg, self.docs = inputs()
        snapshot = self.stream_setup()
        result, calls, _ = self.stream_run([snapshot, self.stream_result(1), self.stream_result(0, termination="SOCKET_TIMEOUT")])
        self.assertEqual(result["cases"]["stream_notice"]["status"], "PASS")              # kept: one notice was really seen
        self.assertEqual(result["cases"]["cursor_resume"], {"status": "NOT_RUN", "frames": 0, "notices": 0, "bytes": 0,
            "termination": "SOCKET_TIMEOUT", "reason": "NO_NOTICE_SOCKET_TIMEOUT"})
        self.cfg, self.docs = inputs()
        snapshot = self.stream_setup()
        result, _, _ = self.stream_run([snapshot, self.stream_result(1, "PRIVATE-NOTICE-1"),
                                        self.stream_result(1, "PRIVATE-NOTICE-1")])        # same notice id again: a replay
        self.assertEqual((result["cases"]["cursor_resume"]["status"], result["cases"]["cursor_resume"]["reason"]),
                         ("NOT_RUN", "RESUME_REPLAYED_SAME_NOTICE"))
        self.assertNotIn("PRIVATE-NOTICE-1", json.dumps(result))

    def test_stream_stage_failures_keep_earlier_cases_and_report_only_status_and_code(self):
        refused = driver.ReadNotAvailable("JSON_CONTENT_TYPE_INVALID")
        refused.http_status, refused.error_code, refused.content_type = 502, None, "text/plain"
        for label, reply, reason in (
                ("typed 403", (403, {}, json.dumps({"error": {"code": "ACCESS_DENIED", "message": "private text"}}).encode()),
                 "READ_NOT_AVAILABLE"),
                ("200 but not a stream result", (200, {}, b"{}"), "STREAM_NOT_AVAILABLE"),
                ("proxy 502 text", refused, "JSON_CONTENT_TYPE_INVALID"),
                ("deadline", driver.Refused("DEADLINE_EXCEEDED"), "DEADLINE_EXCEEDED"),
                ("bad content type", driver.Refused("STREAM_CONTENT_TYPE_INVALID"), "STREAM_CONTENT_TYPE_INVALID")):
            with self.subTest(label):
                self.cfg, self.docs = inputs()
                snapshot = self.stream_setup()
                result, calls, sink = self.stream_run([snapshot, reply])
                self.assertEqual((result["status"], result["reason"], result["requests"]), ("FAIL", reason, 2))
                self.assertEqual(result["cases"]["snapshot_read_path"]["status"], "READ_PATH_ONLY")   # kept
                self.assertEqual(result["cases"]["stream_notice"]["status"], "NOT_RUN")
                self.assertEqual(result["cases"]["cursor_resume"]["status"], "NOT_RUN")
                self.assertNotIn("private text", json.dumps(result))
                self.assertNotIn(self.CURSOR, json.dumps(result))
        self.cfg, self.docs = inputs()                 # a failing resume keeps the first stream's PASS
        snapshot = self.stream_setup()
        result, _, _ = self.stream_run([snapshot, self.stream_result(1), (503, {}, b'{"error": {"code": "SOURCE_UNAVAILABLE"}}')])
        self.assertEqual((result["status"], result["http_status"], result["error_code"]), ("FAIL", 503, "SOURCE_UNAVAILABLE"))
        self.assertEqual(result["cases"]["stream_notice"]["status"], "PASS")
        self.assertEqual(result["cases"]["cursor_resume"]["status"], "NOT_RUN")

    def test_stream_stage_needs_a_distinct_stream_grant_before_any_request_and_refuses_combinations(self):
        def fresh():
            self.cfg, self.docs = inputs()
            self.stream_setup()
        fresh()
        self.assertEqual(self.prepare()["config"]["read_scope"], "stream_stage")
        fresh(); self.cfg["snapshot_expectation"] = "complete"                           # a real strict snapshot is allowed too
        self.assertEqual(self.prepare()["config"]["snapshot_expectation"], "complete")
        for label, change in (("not authorised", {"stream_authorized": False}),
                              ("no grant id", {"stream_grant_id": None}), ("no grant revision", {"stream_grant_revision": None})):
            with self.subTest(label):
                fresh()
                for key, value in change.items():
                    if value is None:
                        del self.docs["/TEST_ONLY/core"][key]
                    else:
                        self.docs["/TEST_ONLY/core"][key] = value
                with self.assertRaises(driver.Refused):
                    self.prepare()
                transport = MagicMock()
                with patch.object(driver.time, "time", return_value=NOW):
                    result = driver.run(self.cfg, lambda _: transport)
                self.assertEqual((result["status"], result["requests"]), ("NOT_READY", 0))
                transport.request.assert_not_called()
        fresh(); self.docs["/TEST_ONLY/core"]["stream_grant_id"] = self.docs["/TEST_ONLY/core"]["manager_grant_id"]
        with self.assertRaisesRegex(driver.Refused, "STREAM_GRANT_INVALID"):
            self.prepare()
        fresh(); del self.docs["/TEST_ONLY/core"]["source_set_ref"]
        with self.assertRaisesRegex(driver.Refused, "STREAM_SOURCE_SET_UNDECLARED"):
            self.prepare()
        for label, change in (("probe_stream false", {"probe_stream": False}),
                              ("observe", {"observe_active_stream": True}),
                              ("pages", {"bounded_page_probe": {"max_pages": 2, "max_rows": 4, "max_total_bytes": 4096}}),
                              ("cache", {"cache_proof": {"path": "/TEST_ONLY/cache", "sha256": PIN}}),
                              ("revoke action in baseline", {"revoke_action": "stream.subscribe"}),
                              ("walk key", {"relation_walk": [{"relation": "portfolios", "limit": 1, "max_pages": 1, "max_rows": 1}]}),
                              ("sweep key", {"relation_sweep": ["accounts"]}),
                              ("carry forward", {"carry_forward_result": {"path": "/TEST_ONLY/prior", "sha256": "c" * 64}}),
                              ("bad expectation", {"snapshot_expectation": "whatever"})):
            with self.subTest(label):
                fresh(); self.cfg.update(change)
                with self.assertRaises(driver.Refused):
                    self.prepare()
        for spacing in (None, 0, 2):
            with self.subTest(spacing=spacing):
                fresh()
                if spacing is None:
                    del self.cfg["read_spacing_seconds"]
                else:
                    self.cfg["read_spacing_seconds"] = spacing
                with self.assertRaisesRegex(driver.Refused, "READ_SPACING_TOO_LOW_FOR_SNAPSHOT_STAGE"):
                    self.prepare()
        for scope in ("snapshot_stage", "relation_stage", "relation_walk", "relation_sweep", "snapshot_only"):
            with self.subTest(other_scope=scope):          # the narrow scopes keep refusing a STREAM ready doc
                self.cfg, self.docs = inputs()
                self.docs["/TEST_ONLY/core"].update(stream_authorized=True, relation_catalogue_sha256=PIN)
                self.cfg.update(read_scope=scope, read_spacing_seconds=3)
                with self.assertRaises(driver.Refused):
                    self.prepare()

    def test_stream_stage_post_revoke_refuses_the_revoked_stream_and_preserves_one_read(self):
        snapshot = self.stream_setup()
        producer, prior, _, _ = self.stream_revoke_inputs()
        producer["source_set_ref"] = "TEST_ONLY-source-set"
        self.cfg.update(read_scope="stream_stage", read_spacing_seconds=3, snapshot_expectation="seed_read_path")
        denied = (403, {}, json.dumps({"error": {"code": "ACCESS_DENIED"}}).encode())
        result, calls, _ = self.stream_run([snapshot, denied, denied])
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 3, "stream_stage"))
        self.assertEqual([(c[0], c[1], c[2]) for c in calls], [("snapshot", None, False), ("stream", None, False),
                                                               ("stream", "TEST_ONLY-opaque", False)])
        self.assertTrue(all(b[3] - a[3] >= 3 for a, b in zip(calls, calls[1:])))
        preserved = result["cases"]["post_revoke_stream_read_preserved"]
        self.assertEqual((preserved["status"], preserved["snapshot"]["status"]), ("PASS", "READ_PATH_ONLY"))
        self.assertNotIn("page", preserved)                                              # this scope read no deployments
        for case in ("post_revoke_stream", "post_revoke_cursor"):
            self.assertEqual((result["cases"][case]["status"], result["cases"][case]["http_status"]), ("PASS", 403))
        for case in ("deployments", "post_revoke_read", "stream_notice", "cursor_resume", "cache_revocation",
                     "active_stream_revocation", "unaffected_scope"):
            self.assertEqual(result["cases"][case]["status"], "NOT_RUN")
        self.assertNotIn("TEST_ONLY-opaque", json.dumps(result))
        ok = (200, {}, b"{}")                                                            # a stream that is NOT denied fails
        result, _, _ = self.stream_run([snapshot, ok])
        self.assertEqual((result["status"], result["reason"]), ("FAIL", "REVOKED_STREAM_NOT_DENIED"))
        self.cfg.pop("revoke_action")                                                    # the revoke action is mandatory
        with self.assertRaisesRegex(driver.Refused, "READ_SCOPE_COMBINATION_INVALID"):
            self.prepare()

    def test_snapshot_stage_post_revoke_runs_one_denied_read_and_needs_the_baseline_cursor(self):
        producer, _ = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2")
        self.cfg.update(read_scope="snapshot_stage", read_spacing_seconds=3)
        baseline_cursor = self.docs["/TEST_ONLY/baseline"].pop("cursor")
        with self.assertRaisesRegex(driver.Refused, "BASELINE_PROVENANCE_INVALID"):
            self.prepare()
        self.docs["/TEST_ONLY/baseline"]["cursor"] = baseline_cursor
        transport = MagicMock()
        transport.request.side_effect = [(403, {}, json.dumps({"error": {"code": "NATIVE_MANAGER_READ_DENIED"}}).encode())]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual((result["status"], result["requests"], result["read_scope"]),
                         ("SCOPED_OBSERVATIONS_ONLY", 1, "snapshot_stage"))
        self.assertEqual(result["cases"]["post_revoke_read"]["status"], "PASS")
        self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "NOT_RUN")
        self.assertNotIn(baseline_cursor, json.dumps(result))

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
                patch.object(driver, "finite", return_value={"status": "PASS", "body_sha256": PIN}):
            result = driver.run(self.cfg, lambda _: transport, checkpoints.append)
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual(result["requests"], 4)
        self.assertEqual(transport.request.call_count, 4)
        self.assertEqual(transport.request.call_args.args,
            ("stream", "TEST_ONLY-baseline-private-cursor"))
        self.assertEqual(transport.request.call_args.kwargs, {"stream": True})
        self.assertEqual(result["active_stream_observation"], observation)
        self.assertEqual(len(checkpoints), 1)
        self.assertEqual(checkpoints[0]["prime_body_sha256"], PIN)
        self.assertEqual(checkpoints[0]["read_body_sha256"], PIN)
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

    def test_actual_typed_scope_denial_is_supported_without_loosening_other_403s(self):
        self.stream_revoke_inputs()
        transport = MagicMock()
        transport.request.side_effect = [(200, {}, b"TEST_ONLY-page"), (200, {}, b"TEST_ONLY-snapshot"),
            (403, {}, b'{"error":{"code":"EXECUTION_READ_SCOPE_REQUIRED"}}'),
            (403, {}, b'{"code":"EXECUTION_READ_SCOPE_REQUIRED"}')]
        with patch.object(driver, "prepare", return_value=self.prepare()), \
                patch.object(driver, "finite", return_value={"status": "PASS"}):
            result = driver.run(self.cfg, lambda _: transport)
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual(result["cases"]["post_revoke_cursor"]["status"], "PASS")
        for case in ("cache_revocation", "active_stream_revocation", "unaffected_scope"):
            self.assertEqual(result["cases"][case]["status"], "NOT_RUN")

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


class CacheProofTests(unittest.TestCase):
    """TEST_ONLY P22 receipts; no key, DB, HTTP, authority or runtime issued."""
    setUp = DriverTests.setUp
    prepare = DriverTests.prepare
    post_inputs = DriverTests.post_inputs
    prepare_baseline_scope = DriverTests.prepare_baseline_scope
    assertRefusedNoNetwork = DriverTests.assertRefusedNoNetwork

    def cache_inputs(self):
        producer, revoke = self.post_inputs("CORE_MANAGER_DOMAIN")
        producer.update(read_authorized=False, policy_revision="policy-2",
                        manager_grant_revision="grant-revision-2")
        prior = self.docs["/TEST_ONLY/baseline"]
        prior["prime_body_sha256"] = "a" * 64
        prior["read_body_sha256"] = "b" * 64
        revoke["official_receipt"] = {"path": "/TEST_ONLY/official", "sha256": "f" * 64}
        decided = int(datetime(2026, 10, 20, 5, 0, 30, tzinfo=timezone.utc).timestamp() * 1000)
        self.docs["/TEST_ONLY/official"] = {
            "schema_version": "portal.native-research-manager-revoke.v1", "results": [{
                "schema_version": "portal.manager-domain-revoke-receipt.v1",
                "revocation_id": "TEST_ONLY-revocation", "receipt_id": "TEST_ONLY-receipt",
                "grant_id": producer["manager_grant_id"], "action": "business.read_all",
                "mode": "REVOKE", "outcome": "REVOKED", "grant_revision_before": "grant-revision-1",
                "grant_revision_after": "grant-revision-2", "policy_revision": "policy-2",
                "valid_until_ms_before": decided + 3600000, "valid_until_ms_after": decided + 3600000,
                "revoked_at_ms": decided, "decided_at_ms": decided, "replayed": False}]}
        self.cfg["cache_proof"] = {"path": "/TEST_ONLY/cache-proof", "sha256": "1" * 64}
        envelope = {"schema_version": "portal.execution.connected-cache-proof.v1",
            "baseline_sha256": self.cfg["baseline"]["sha256"],
            "producer_sha256": prior["producer_sha256"], "scope_sha256": prior["scope_sha256"],
            "prime": {"path": "/TEST_ONLY/prime", "sha256": "2" * 64},
            "hit": {"path": "/TEST_ONLY/hit", "sha256": "3" * 64}}
        self.docs["/TEST_ONLY/cache-proof"] = envelope
        for name, n in (("prime", 1), ("hit", 2)):
            obs = {"schema_version": "portal.native-cache-observation.v1",
                "lease_id": f"00000000-0000-4000-8000-{n:012d}",
                "attempt_id": f"00000000-0000-4000-8001-{n:012d}",
                "operation_id": "maximumDataDeploymentPageV1",
                "cache_state": "MISS" if name == "prime" else "HIT",
                "cache_identity_mac": "hmac-sha256:" + PIN,
                "native_epoch_mac": "hmac-sha256:" + "b" * 64,
                "body_digest": "sha256:" + prior[
                    "prime_body_sha256" if name == "prime" else "read_body_sha256"],
                "egress_evidence_kind": "FINAL_HTTP_SEND_COMPLETED",
                "egress_semantics": "LOCAL_CORE_HTTP_EGRESS_ONLY"}
            self.docs["/TEST_ONLY/" + name] = {
                "schema_version": "portal.native-cache-observation-receipt.v1",
                "observation": obs, "custody": {**{k: obs[k] for k in
                    ("lease_id", "attempt_id", "body_digest")}, "phase": "SERVED",
                    "receipt_digest": "sha256:" + PIN, "source_ack_digest": "sha256:" + PIN,
                    "source_reconciled": True},
                "checks": {k: True for k in ("lease_attempt_match", "body_digest_match",
                    "egress_phase_consistent")}, "durable_egress": "SERVED", "verdict": "CORRELATED"}
        return envelope

    def execute(self, responses=None):
        transport = MagicMock()
        transport.request.side_effect = responses or [
            (403, {}, b'{"code":"NATIVE_MANAGER_READ_DENIED"}'),
            (403, {}, b'{"code":"EXECUTION_READ_SCOPE_REQUIRED"}')]
        with patch.object(driver.time, "time", return_value=NOW):
            result = driver.run(self.cfg, lambda _: transport)
        return result, transport

    def test_actual_p22_pair_and_current_denials_credit_only_cache_case(self):
        self.cache_inputs()
        result, transport = self.execute()
        self.assertEqual(result["status"], "SCOPED_OBSERVATIONS_ONLY")
        self.assertEqual(result["cases"]["cache_revocation"]["status"], "PASS")
        self.assertEqual((result["requests"], transport.request.call_count, result["mutations"]), (2, 2, 0))
        for name in ("active_stream_revocation", "unaffected_scope"):
            self.assertEqual(result["cases"][name]["status"], "NOT_RUN")
        self.assertEqual((result["full_08"], result["full_09"]), ("NOT_MET", "NOT_MET"))
        public = json.dumps(result)
        for private in ("hmac-sha256:", "00000000-0000-4000", "/TEST_ONLY/", "TEST_ONLY_PRIVATE_COOKIE"):
            self.assertNotIn(private, public)

    def test_default_without_p22_pair_keeps_cache_not_run(self):
        self.cache_inputs()
        del self.cfg["cache_proof"]
        self.assertEqual(self.execute()[0]["cases"]["cache_revocation"]["status"], "NOT_RUN")

    def test_proof_is_bound_to_exact_baseline_producer_and_scope(self):
        for field in ("schema_version", "baseline_sha256", "producer_sha256", "scope_sha256"):
            with self.subTest(field=field):
                self.cfg, self.docs = inputs()
                self.cache_inputs()[field] = "0" * 64
                self.assertRefusedNoNetwork("CACHE_PROOF_PROVENANCE_INVALID")

    def test_historical_checkpoint_without_actual_read_body_cannot_credit_cache(self):
        for field in ("prime_body_sha256", "read_body_sha256"):
            with self.subTest(field=field):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                del self.docs["/TEST_ONLY/baseline"][field]
                self.assertRefusedNoNetwork("CACHE_PROOF_PROVENANCE_INVALID")

    def test_cache_denial_requires_real_read_revoke_not_expiry_noop_or_stream_revoke(self):
        for field, value in (("outcome", "NOOP_EXPIRED"), ("outcome", "NOOP_ALREADY_REVOKED"),
                ("action", "stream.subscribe"), ("replayed", True), ("replayed", 0),
                ("grant_id", "TEST_ONLY-other-grant"), ("grant_revision_before", "OTHER"),
                ("grant_revision_after", "grant-revision-1"), ("policy_revision", "OTHER"),
                ("valid_until_ms_before", 0), ("revoked_at_ms", 0)):
            with self.subTest(field=field):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                self.docs["/TEST_ONLY/official"]["results"][0][field] = value
                self.assertRefusedNoNetwork("CACHE_REVOKE_RECEIPT_INVALID")
        del self.docs["/TEST_ONLY/revoke"]["official_receipt"]
        self.assertRefusedNoNetwork("CACHE_REVOKE_RECEIPT_INVALID")

    def test_original_read_slot_pre_expiry_revoke_is_a_positive_control(self):
        self.cache_inputs()
        producer = self.docs["/TEST_ONLY/core"]
        prior, revoke = self.docs["/TEST_ONLY/baseline"], self.docs["/TEST_ONLY/revoke"]
        prior["at_utc"] = "2026-11-13T07:16:00Z"
        revoke["committed_at_utc"] = "2026-11-13T07:30:01Z"
        official = self.docs["/TEST_ONLY/official"]["results"][0]
        expiry = int(driver.utc("2026-11-13T09:15:00Z") * 1000)
        decided = int(driver.utc("2026-11-13T07:30:00Z") * 1000)
        official.update(valid_until_ms_before=expiry, valid_until_ms_after=expiry,
                        revoked_at_ms=decided, decided_at_ms=decided)
        driver.validate_domain_revoke(producer, prior, revoke,
                                     driver.utc("2026-11-13T07:31:00Z"), "business.read_all")
        self.assertEqual(official["valid_until_ms_after"], expiry)

    def test_original_read_slot_revoke_at_or_after_0915_is_not_active_revoke(self):
        for stamp in ("2026-11-13T09:15:00Z", "2026-11-13T09:20:00Z"):
            with self.subTest(revoked_at=stamp):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                producer = self.docs["/TEST_ONLY/core"]
                prior = self.docs["/TEST_ONLY/baseline"]
                revoke = self.docs["/TEST_ONLY/revoke"]
                prior["at_utc"] = "2026-11-13T07:16:00Z"
                revoke["committed_at_utc"] = stamp
                official = self.docs["/TEST_ONLY/official"]["results"][0]
                expiry = int(driver.utc("2026-11-13T09:15:00Z") * 1000)
                decided = int(driver.utc(stamp) * 1000)
                official.update(valid_until_ms_before=expiry, valid_until_ms_after=expiry,
                                revoked_at_ms=decided, decided_at_ms=decided)
                with self.assertRaisesRegex(driver.Refused, "CACHE_REVOKE_RECEIPT_INVALID"):
                    driver.validate_domain_revoke(producer, prior, revoke,
                                                 driver.utc("2026-11-13T09:21:00Z"),
                                                 "business.read_all")

    def test_envelope_and_receipt_unknown_fields_are_not_accepted(self):
        for path in ("/TEST_ONLY/cache-proof", "/TEST_ONLY/hit"):
            with self.subTest(path=path):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                self.docs[path]["TEST_ONLY_secret"] = "TEST_ONLY_PRIVATE_PAYLOAD"
                self.assertRefusedNoNetwork()

    def test_noncorrelated_or_no_observation_never_proves_hit(self):
        for verdict in ("NO_OBSERVATION", "NO_CUSTODY_ROW", "MISMATCH", None):
            with self.subTest(verdict=verdict):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                self.docs["/TEST_ONLY/hit"]["verdict"] = verdict
                self.assertRefusedNoNetwork("CACHE_PROOF_RECEIPT_INVALID")

    def test_correlated_but_unresolved_aborted_or_unacked_is_refused(self):
        for field, value in (("phase", "UNKNOWN"), ("phase", "ABORTED"), ("phase", "CANCELLED"),
                ("source_reconciled", False), ("source_reconciled", 1),
                ("source_ack_digest", None), ("receipt_digest", None), ("source_ack_digest", PIN)):
            with self.subTest(field=field, value=value):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                self.docs["/TEST_ONLY/hit"]["custody"][field] = value
                self.assertRefusedNoNetwork("CACHE_PROOF_CUSTODY_INVALID")

    def test_correlator_boolean_flags_do_not_replace_independent_key_body_checks(self):
        for field, value in (("lease_id", "00000000-0000-4000-8000-999999999999"),
                ("attempt_id", "00000000-0000-4000-8001-999999999999"), ("body_digest", "sha256:" + PIN)):
            with self.subTest(field=field):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                self.docs["/TEST_ONLY/hit"]["custody"][field] = value
                self.assertRefusedNoNetwork("CACHE_PROOF_CUSTODY_INVALID")

    def test_checks_require_exact_true_not_truthy_or_extra(self):
        for change in ("false", "truthy", "missing", "extra"):
            with self.subTest(change=change):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                checks = self.docs["/TEST_ONLY/hit"]["checks"]
                if change == "missing":
                    del checks["body_digest_match"]
                elif change == "extra":
                    checks["extra"] = True
                else:
                    checks["body_digest_match"] = 1 if change == "truthy" else False
                self.assertRefusedNoNetwork("CACHE_PROOF_CUSTODY_INVALID")

    def test_wrong_operation_body_and_egress_are_refused(self):
        for field, value in (("operation_id", "portal.manager-observation.snapshot.v1"),
                ("body_digest", "sha256:" + PIN), ("egress_semantics", "BROWSER_ACK"),
                ("egress_evidence_kind", "NO_FINAL_WITNESS"),
                ("egress_evidence_kind", "FINAL_HTTP_ABORT_CONFIRMED"),
                ("lease_id", "not-a-uuid"), ("attempt_id", None),
                ("native_epoch_mac", "sha256:" + PIN)):
            with self.subTest(field=field):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                self.docs["/TEST_ONLY/hit"]["observation"][field] = value
                self.assertRefusedNoNetwork("CACHE_PROOF_OBSERVATION_INVALID")

    def test_observed_return_absence_is_accepted_only_with_genuine_durable_served_ack(self):
        self.cache_inputs()
        self.docs["/TEST_ONLY/hit"]["observation"]["egress_evidence_kind"] = "EGRESS_NOT_OBSERVED_IN_RETURN"
        self.assertEqual(self.execute()[0]["cases"]["cache_revocation"]["status"], "PASS")

    def test_miss_coalesced_different_cache_or_epoch_cannot_be_called_hit(self):
        for field, value in (("cache_state", "MISS"), ("cache_state", "COALESCED"),
                ("cache_identity_mac", "hmac-sha256:" + "c" * 64),
                ("native_epoch_mac", "hmac-sha256:" + "c" * 64)):
            with self.subTest(field=field):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                self.docs["/TEST_ONLY/hit"]["observation"][field] = value
                self.assertRefusedNoNetwork("CACHE_HIT_NOT_PROVED")

    def test_same_lease_attempt_or_receipt_replay_cannot_prove_two_requests(self):
        for field in ("lease_id", "attempt_id", "sha256"):
            with self.subTest(field=field):
                self.cfg, self.docs = inputs()
                envelope = self.cache_inputs()
                if field == "sha256":
                    envelope["hit"][field] = envelope["prime"][field]
                else:
                    value = self.docs["/TEST_ONLY/prime"]["observation"][field]
                    self.docs["/TEST_ONLY/hit"]["observation"][field] = value
                    self.docs["/TEST_ONLY/hit"]["custody"][field] = value
                self.assertRefusedNoNetwork("CACHE_HIT_NOT_PROVED")

    def test_p22_pair_never_turns_404_or_cursor409_into_cache_revoke_proof(self):
        for read, cursor in ((404, 403), (403, 409)):
            with self.subTest(read=read, cursor=cursor):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                responses = [(read, {}, b'{"code":"WORKSPACE_NOT_FOUND"}' if read == 404 else
                    b'{"code":"ACCESS_DENIED"}'), (cursor, {}, b'{"code":"SCOPE_CHANGED"}' if cursor == 409
                    else b'{"code":"ACCESS_DENIED"}')]
                result, _ = self.execute(responses)
                self.assertEqual(result["status"], "FAIL")
                self.assertEqual(result["reason"], "CACHE_REVOKE_DENIAL_NOT_PROVED")
                self.assertEqual(result["cases"]["cache_revocation"]["status"], "NOT_RUN")

    def test_invalid_pair_denied_before_any_network_or_session_mutation(self):
        self.cache_inputs()
        self.docs["/TEST_ONLY/hit"]["custody"]["source_reconciled"] = False
        self.assertRefusedNoNetwork("CACHE_PROOF_CUSTODY_INVALID")

    def test_pm_native_or_stream_only_revoke_cannot_borrow_cache_proof(self):
        for authority in ("PM_NATIVE_READ", "CORE_MANAGER_DOMAIN"):
            with self.subTest(authority=authority):
                self.cfg, self.docs = inputs()
                self.cache_inputs()
                if authority == "PM_NATIVE_READ":
                    self.docs["/TEST_ONLY/revoke"]["authority"] = authority
                    self.docs["/TEST_ONLY/core"].update(read_authorized=True, native_revoked=True, native_revision=4)
                else:
                    self.cfg, self.docs = inputs()
                    DriverTests.stream_revoke_inputs(self)
                    self.cfg["cache_proof"] = {"path": "/TEST_ONLY/cache-proof", "sha256": PIN}
                self.assertRefusedNoNetwork("CACHE_PROOF_SCOPE_INVALID")


if __name__ == "__main__":
    unittest.main()
