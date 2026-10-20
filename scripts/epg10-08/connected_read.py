#!/usr/bin/env python3
"""Bounded original08 Core API acceptance driver, NOT a product data adapter.

Run isolated/no-bytecode with --config PATH --sha256 PIN. Config, genuine Core
session and owner receipts are private pinned references. This driver never
issues identity, grants, JWTs, SQL, commands or revocation. Core/PM perform their
official revoke separately. Baseline/post_revoke are distinct finite specimens;
reconnect denial is NOT proof of active-stream revocation or a cache HIT.
Opt-in observe_active_stream holds the existing stream past its first notice
to collect bounded client-side facts while the owner revokes separately. Those
facts never prove server final-egress or grant a mutation capability.

Optional --checkpoint-fd writes ONLY an opaque baseline cursor/provenance to an
already open private owner file (never stdout). Public stdout contains bounded
hashes/counts/results only. Missing inputs are NOT_READY/NOT_RUN, not full08/09
PASS. Do not point this browser API client at reverse-mTLS identity port28444.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import ssl
import stat
import sys
import threading
import time
from types import ModuleType
from urllib.parse import urlencode

ORIGIN = "https://research-portal.primusspark.com"
HOST = "research-portal.primusspark.com"
MAX_BYTES = 1024 * 1024
HELPER_PIN = "e108a0a740831a3905c6174597420888160097de7ff4edd682bf276965f42424"
CASES = ("deployments", "relation", "repeat_read", "snapshot", "cursor_resume",
         "stream_notice", "post_revoke_read", "post_revoke_cursor",
         "post_revoke_stream", "post_revoke_stream_read_preserved",
         "cache_revocation", "active_stream_revocation", "unaffected_scope")


class Refused(ValueError):
    pass


def require(condition, code):
    if not condition:
        raise Refused(code)


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                             allow_nan=False).encode()).hexdigest()


def shared():
    """Reuse the qualified private-reference/duplicate-key parser verbatim."""
    source = Path(__file__).resolve().parents[2] / (
        "upgrade/integration/execution-native-read-v1/research-identity-intake/identity_operator.py")
    require(source.is_file() and not source.is_symlink(), "HELPER_PIN_CHANGED")
    raw = source.read_bytes()
    require(sha256(raw).hexdigest() == HELPER_PIN, "HELPER_PIN_CHANGED")
    module = ModuleType("connected_read_reference")
    # Execute these exact checked bytes, never reopen source or load a cached pyc.
    exec(compile(raw, str(source), "exec"), module.__dict__)
    return module


def reference(ref, *, private=True):
    helper = shared()
    fd, raw = helper.open_reference(ref, private=private, maximum=131072)
    os.close(fd)
    return raw


def document(ref):
    return shared().decode(reference(ref))


def utc(value):
    require(type(value) is str, "TIME_INVALID")
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(stamp.utcoffset() is not None and stamp.utcoffset().total_seconds() == 0,
            "TIME_INVALID")
    return stamp.timestamp()


def pin(value):
    return type(value) is str and re.fullmatch("[a-f0-9]{64}", value) is not None


def session_headers(session, producer, now, deadline_seconds):
    """Read either existing owner input or the actual Core-issued token file.

    This formats an existing credential in memory only. It never issues a
    session or infers Cloudflare/password/human-presence authentication.
    """
    require(type(session) is dict, "SESSION_INVALID")
    if "schema_version" in session:
        require(set(session) == {"schema_version", "session_id", "user_id", "cookie_name",
                                 "token", "absolute_expires_at"} and
                session["schema_version"] == "portal.research-acceptance-session-token.v1" and
                type(session["session_id"]) is str and
                re.fullmatch(r"ses_[A-Za-z0-9_-]{1,128}", session["session_id"]) and
                session["session_id"] == producer.get("session_id") and
                session["user_id"] == producer["subject"] and
                session["cookie_name"] == "__Host-portal_session" and
                type(session["token"]) is str and
                re.fullmatch(r"[A-Za-z0-9_.~%-]{16,4096}", session["token"]), "SESSION_INVALID")
        try:
            require(utc(session["absolute_expires_at"]) > now + deadline_seconds,
                    "SESSION_INVALID")
        except (ValueError, TypeError, OverflowError):
            raise Refused("SESSION_INVALID") from None
        return {"Cookie": "__Host-portal_session=" + session["token"], "Accept": "application/json"}, (
            "RESEARCH_APPLICATION_SESSION_NOT_CLOUDFLARE_NOT_PASSWORD_NOT_HUMAN_PRESENCE")
    require(set(session) <= {"cookie", "cf_access_assertion", "subject"} and
            session.get("subject") == producer["subject"] and
            re.fullmatch(r"__Host-portal_session=[A-Za-z0-9_.~%-]{16,4096}",
                         session.get("cookie", "")), "SESSION_INVALID")
    headers = {"Cookie": session["cookie"], "Accept": "application/json"}
    if session.get("cf_access_assertion") is not None:
        assertion = session["cf_access_assertion"]
        require(type(assertion) is str and re.fullmatch(r"[A-Za-z0-9_.-]{20,16384}", assertion),
                "SESSION_INVALID")
        headers["Cf-Access-Jwt-Assertion"] = assertion
    return headers, None


def prepare(config, now=None):
    """The receipt is an owner attestation, not authority created by this tool."""
    now = time.time() if now is None else now
    require(type(config) is dict and config.get("schema_version") ==
            "portal.execution.connected-read-config.v1", "CONFIG_INVALID")
    require(config.get("origin") == ORIGIN and config.get("stage") in
            ("baseline", "post_revoke"), "ORIGIN_OR_STAGE_INVALID")
    require(config.get("environment") in ("paper", "sandbox", "live") and
            re.fullmatch(r"ws_[A-Za-z0-9]{8,96}", config.get("workspace_id", "")) and
            re.fullmatch(r"[A-Z][A-Z0-9_]{2,95}", config.get("profile_id", "")), "SCOPE_INVALID")
    for key, bound in (("limit", 200), ("deadline_seconds", 60), ("max_bytes", MAX_BYTES)):
        require(type(config.get(key)) is int and 1 <= config[key] <= bound, "BOUNDS_INVALID")
    require(type(config.get("probe_stream")) is bool and
            type(config.get("observe_active_stream", False)) is bool, "BOUNDS_INVALID")
    require(not config.get("observe_active_stream", False) or
            (config["stage"] == "baseline" and config["probe_stream"]), "OBSERVATION_MODE_INVALID")
    action = config.get("revoke_action", "business.read_all")
    require(action in ("business.read_all", "stream.subscribe") and
            ("revoke_action" not in config or config["stage"] == "post_revoke"), "REVOKE_ACTION_INVALID")
    receipt = document(config["core_return"])
    require(type(receipt) is dict and receipt.get("schema_version") ==
            "portal.execution.connected-read-ready.v1" and receipt.get("status") == "INSTALLED" and
            receipt.get("native_selection_verified") is True, "NATIVE_NOT_INSTALLED")
    require(all(receipt.get(k) == config[k] for k in
                ("origin", "environment", "workspace_id", "profile_id")), "SELECTION_MISMATCH")
    require(all(pin(receipt.get(k)) for k in
                ("core_config_sha256", "field_policy_sha256", "catalogue_sha256")) and
            re.fullmatch("[a-f0-9]{40}", receipt.get("core_commit", "")) and
            re.fullmatch("sha256:[a-f0-9]{64}", receipt.get("core_image", "")), "PINS_INVALID")
    require(type(receipt.get("projection_epoch")) is str and
            re.fullmatch(r"[^\x00-\x20\x7f]{1,256}", receipt["projection_epoch"]), "PROJECTION_UNDECLARED")
    require(receipt.get("api_leaf_sha256") is None or pin(receipt["api_leaf_sha256"]), "PINS_INVALID")
    require(type(receipt.get("subject")) is str and receipt["subject"].startswith("usr_") and
            type(receipt.get("native_revision")) is int and receipt["native_revision"] >= 1 and
            type(receipt.get("policy_revision")) is str and bool(receipt["policy_revision"]) and
            all(type(receipt.get(k)) is str and 1 <= len(receipt[k]) <= 256 for k in
                ("manager_grant_id", "manager_grant_revision")) and
            type(receipt.get("acceptance_id")) is str and bool(receipt["acceptance_id"]) and
            type(receipt.get("read_authorized")) is bool and
            type(receipt.get("stream_authorized")) is bool and
            type(receipt.get("native_revoked")) is bool, "SOURCE_OR_AUTHORITY_NOT_CURRENT")
    if "stream_grant_id" in receipt or "stream_grant_revision" in receipt:
        require(all(type(receipt.get(k)) is str and 1 <= len(receipt[k]) <= 256 for k in
                    ("stream_grant_id", "stream_grant_revision")) and
                receipt["stream_grant_id"] != receipt["manager_grant_id"], "STREAM_GRANT_INVALID")
    if config["stage"] == "baseline":
        require(receipt["read_authorized"] and not receipt["native_revoked"],
                "SOURCE_OR_AUTHORITY_NOT_CURRENT")
    require(not config.get("observe_active_stream", False) or receipt["stream_authorized"],
            "STREAM_NOT_AUTHORIZED")
    if config["probe_stream"] and receipt["stream_authorized"]:
        require(type(receipt.get("source_set_ref")) is str and bool(receipt["source_set_ref"]),
                "STREAM_SOURCE_SET_UNDECLARED")
    require(min(utc(receipt[k]) for k in ("expires_at", "trust_expires_at", "native_expires_at"))
            > now + config["deadline_seconds"], "INPUT_EXPIRED")
    session = document(config["session"])
    require(receipt.get("session_sha256") == config["session"]["sha256"], "SESSION_INVALID")
    headers, session_evidence_class = session_headers(
        session, receipt, now, config["deadline_seconds"])
    ip = ipaddress.ip_address(receipt.get("api_ip", ""))
    require(ip.is_global, "API_IP_INVALID")  # No DNS/unbounded resolver or generic upstream.
    scope = digest({k: receipt[k] for k in ("origin", "subject", "workspace_id", "environment",
        "profile_id", "acceptance_id", "catalogue_sha256", "field_policy_sha256", "manager_grant_id")})
    prior = revoke = None
    if config["stage"] == "post_revoke":
        prior, revoke = document(config["baseline"]), document(config["revoke_return"])
        require(prior.get("schema_version") == "portal.execution.connected-read-baseline.v1" and
                prior.get("scope_sha256") == scope and pin(prior.get("producer_sha256")) and
                cursor_valid(prior.get("cursor")), "BASELINE_PROVENANCE_INVALID")
        require(revoke.get("schema_version") == "portal.execution.connected-read-revoke.v1" and
                revoke.get("status") == "COMMITTED" and revoke.get("authority") in
                ("CORE_MANAGER_DOMAIN", "PM_NATIVE_READ") and
                revoke.get("baseline_sha256") == config["baseline"]["sha256"] and
                revoke.get("scope_sha256") == scope and
                revoke.get("previous_producer_sha256") == prior["producer_sha256"] and
                revoke.get("current_producer_sha256") == config["core_return"]["sha256"] and
                pin(revoke.get("official_receipt_sha256")) and
                utc(prior["at_utc"]) <= utc(revoke["committed_at_utc"]) <= now and
                revoke.get("previous_policy_revision") == prior.get("policy_revision") and
                revoke.get("previous_manager_grant_revision") == prior.get("manager_grant_revision") and
                revoke.get("previous_native_revision") == prior.get("native_revision") and
                ((action == "business.read_all" and revoke["authority"] == "CORE_MANAGER_DOMAIN" and
                  not receipt["read_authorized"] and
                  (receipt["policy_revision"] != prior["policy_revision"] or
                   receipt["manager_grant_revision"] != prior["manager_grant_revision"]) and
                  receipt["native_revision"] == prior["native_revision"]) or
                 (action == "business.read_all" and revoke["authority"] == "PM_NATIVE_READ" and
                  receipt["native_revoked"] and receipt["native_revision"] > prior["native_revision"]) or
                 (action == "stream.subscribe" and revoke["authority"] == "CORE_MANAGER_DOMAIN" and
                  revoke.get("action") == action and receipt["read_authorized"] and
                  not receipt["stream_authorized"] and not receipt["native_revoked"] and
                  prior.get("read_authorized") is True and prior.get("stream_authorized") is True and
                  receipt["policy_revision"] == prior["policy_revision"] and
                  receipt["manager_grant_revision"] == prior["manager_grant_revision"] and
                  receipt["native_revision"] == prior["native_revision"] and
                  type(receipt.get("stream_grant_id")) is str and
                  receipt["stream_grant_id"] == prior.get("stream_grant_id") and
                  type(prior.get("stream_grant_revision")) is str and
                  1 <= len(prior["stream_grant_revision"]) <= 256 and
                  receipt["stream_grant_revision"] != prior["stream_grant_revision"])),
                "REVOKE_PROVENANCE_INVALID")
        if action == "stream.subscribe":
            validate_stream_revoke(receipt, prior, revoke, now)
    return {"config": config, "producer": receipt, "headers": headers, "ip": str(ip),
            "scope": scope, "prior": prior, "revoke": revoke,
            "revoke_action": action, "session_evidence_class": session_evidence_class}


def validate_stream_revoke(producer, prior, revoke, now):
    """Bind the distinct STREAM grant to the real coordinator receipt, not a label.

    READY/checkpoint data is assembled from actual install ACK/readback. The
    official receipt remains a private pinned document; no new exporter/API.
    """
    ref = revoke.get("official_receipt")
    require(type(ref) is dict and ref.get("sha256") == revoke["official_receipt_sha256"],
            "STREAM_REVOKE_RECEIPT_INVALID")
    envelope = document(ref)
    require(type(envelope) is dict and envelope.get("schema_version") ==
            "portal.native-research-manager-revoke.v1" and
            type(envelope.get("results")) is list and len(envelope["results"]) == 1 and
            all(type(item) is dict for item in envelope["results"]), "STREAM_REVOKE_RECEIPT_INVALID")
    selected = [item for item in envelope["results"] if item.get("grant_id") == producer["stream_grant_id"]]
    require(len(selected) == 1, "STREAM_REVOKE_RECEIPT_INVALID")
    official = selected[0]
    require(type(official) is dict and official.get("schema_version") ==
            "portal.manager-domain-revoke-receipt.v1" and
            official.get("grant_id") == producer["stream_grant_id"] and
            official.get("action") == "stream.subscribe" and official.get("mode") == "REVOKE" and
            official.get("outcome") == "REVOKED" and
            official.get("grant_revision_before") == prior["stream_grant_revision"] and
            official.get("grant_revision_after") == producer["stream_grant_revision"] and
            official.get("policy_revision") == producer["policy_revision"] and
            official.get("replayed") is False and
            all(type(official.get(k)) is str and 1 <= len(official[k]) <= 256
                for k in ("revocation_id", "receipt_id")) and
            all(type(official.get(k)) is int and 0 <= official[k] <= 9007199254740991 for k in
                ("valid_until_ms_before", "valid_until_ms_after", "revoked_at_ms", "decided_at_ms")) and
            official["valid_until_ms_before"] == official["valid_until_ms_after"] and
            official["valid_until_ms_before"] > official["decided_at_ms"] and
            official["decided_at_ms"] == official["revoked_at_ms"] and
            utc(prior["at_utc"]) * 1000 <= official["revoked_at_ms"] <=
            utc(revoke["committed_at_utc"]) * 1000 <= now * 1000,
            "STREAM_REVOKE_RECEIPT_INVALID")


def cursor_valid(value):
    return type(value) is str and 1 <= len(value) <= 4096 and re.fullmatch(r"[A-Za-z0-9._~-]+", value)


def route(name, config, cursor=None):
    require(name in ("deployments", "relation", "snapshot", "stream"), "ROUTE_NOT_ALLOWED")
    env = config["environment"]
    if name in ("deployments", "relation"):
        path = "/api/v1/execution/manager/" + (
            "deployments" if name == "deployments" else "current/account-balances")
        query = {"workspace_id": config["workspace_id"], "environment": env, "limit": config["limit"]}
    else:
        path = f"/api/v1/execution/profiles/{env}/" + (
            "realtime-snapshot" if name == "snapshot" else "stream")
        query = {}
    if cursor is not None:
        require(name in ("deployments", "relation", "stream") and cursor_valid(cursor), "CURSOR_INVALID")
        query["cursor"] = cursor
    return path + ("?" + urlencode(query) if query else "")


class Transport:
    def __init__(self, prepared):
        self.p = prepared
        self.end = time.monotonic() + prepared["config"]["deadline_seconds"]
        self.context = ssl.create_default_context()
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2

    def request(self, name, cursor=None, *, stream=False):
        remaining = self.end - time.monotonic()
        require(remaining > 0, "DEADLINE_EXCEEDED")
        connection = http.client.HTTPSConnection(HOST, timeout=min(5, remaining), context=self.context)
        # Fixed public API SNI/hostname, exact commissioned global IP; never reverse28444.
        connection._create_connection = lambda address, timeout, source_address=None: socket.create_connection(
            (self.p["ip"], 443), timeout, source_address)
        tls_socket, response = None, None
        expired = threading.Event()
        def abort():
            # HTTPConnection detaches a Connection:close socket into HTTPResponse;
            # keep the physical socket so slow-drip bodies cannot outlive this run.
            if tls_socket is not None:
                try:
                    tls_socket.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            connection.close()
        def expire():
            expired.set()
            abort()
        timer = threading.Timer(remaining, expire)
        timer.daemon = True
        timer.start()
        try:
            connection.connect()
            tls_socket = connection.sock
            require(time.monotonic() < self.end, "DEADLINE_EXCEEDED")
            cert_pin = self.p["producer"].get("api_leaf_sha256")
            if cert_pin is not None:
                require(pin(cert_pin) and tls_socket is not None and
                        sha256(tls_socket.getpeercert(binary_form=True)).hexdigest() == cert_pin,
                        "API_CERT_PIN_CHANGED")  # Check BEFORE sending the genuine session.
            headers = dict(self.p["headers"])
            if stream:
                headers["Accept"] = "text/event-stream"
                if cursor:
                    headers["Last-Event-ID"] = cursor
            connection.request("GET", route(name, self.p["config"], cursor), headers=headers)
            response = connection.getresponse()
            require(not 300 <= response.status < 400, "REDIRECT_REFUSED")
            require(response.getheader("Content-Encoding", "identity") == "identity", "ENCODING_REFUSED")
            length = response.getheader("Content-Length")
            require(length is None or (length.isdigit() and int(length) <= self.p["config"]["max_bytes"]),
                    "RESPONSE_LIMIT")
            if stream and response.status == 200:
                require(response.getheader("Content-Type", "").split(";")[0] == "text/event-stream",
                        "STREAM_CONTENT_TYPE_INVALID")
                observe = self.p["config"].get("observe_active_stream", False)
                if observe:
                    # The global abort timer still owns the physical socket even
                    # after HTTPConnection detaches it. Quiet streams may stay
                    # open until that bounded deadline, not just the5s connect cap.
                    tls_socket.settimeout(max(0.001, self.end - time.monotonic()))
                result = read_sse(response, self.p["config"]["max_bytes"], self.end,
                                  self.p["producer"]["projection_epoch"], self.p["producer"]["source_set_ref"],
                                  observe=observe)
                require(observe or not result["notices"] or
                        (not expired.is_set() and time.monotonic() < self.end),
                        "DEADLINE_EXCEEDED")
                return response.status, dict(response.getheaders()), result
            require(response.getheader("Content-Type", "").split(";")[0] == "application/json",
                    "JSON_CONTENT_TYPE_INVALID")
            raw = response.read(self.p["config"]["max_bytes"] + 1)
            require(len(raw) <= self.p["config"]["max_bytes"], "RESPONSE_LIMIT")
            require(not expired.is_set() and time.monotonic() < self.end, "DEADLINE_EXCEEDED")
            return response.status, {k.lower(): v for k, v in response.getheaders()}, raw
        finally:
            timer.cancel()
            abort()
            if response is not None:
                response.close()


def read_sse(response, maximum, end, expected_epoch, source_set_ref, *, observe=False):
    count, notices, total, event, data, identifier = 0, 0, 0, None, [], None
    last = None
    started = time.monotonic() if observe else None
    observation = {"status": "OBSERVED_ONLY", "termination": None, "first_notice_after_ms": None,
        "terminal_event": None, "frame_observations": [], "final_egress_proved": False}
    if observe:
        observation["started_at_utc"] = datetime.now(timezone.utc).isoformat()
    while count < 8 and time.monotonic() < end:
        try:
            line = response.readline(min(65537, maximum - total + 1))
        except TimeoutError:
            observation["termination"] = "DEADLINE" if time.monotonic() >= end else "SOCKET_TIMEOUT"
            break  # A quiet real stream is NOT_RUN, never a manufactured source notice.
        except OSError:
            if not observe or time.monotonic() < end:
                raise
            observation["termination"] = "DEADLINE"
            break  # Physical abort at the global deadline is not a server deny.
        total += len(line)
        require(total <= maximum and len(line) <= 65536, "STREAM_LIMIT")
        if observe and time.monotonic() >= end:
            observation["termination"] = "DEADLINE"
            break  # Includes EOF caused by our own physical deadline abort.
        if not line:
            observation["termination"] = "EOF"
            break
        text = line.decode("utf-8").rstrip("\r\n")
        if text == "":
            if data:
                frame = shared().decode("\n".join(data))
                require(type(frame) is dict and frame.get("schema_version") ==
                        "portal.execution.scoped-realtime.v1" and frame.get("semantics") ==
                        "NOTIFICATION_ONLY" and frame.get("event_type") == event,
                        "STREAM_FRAME_INVALID")
                require(set(frame) == {"schema_version", "semantics", "event_type", "terminal",
                        "reconnect_required", "resume_cursor", "projection_generation", "quality",
                        "next_action", "reason_code"}, "STREAM_FRAME_INVALID")
                count += 1
                require(event in ("revalidate", "heartbeat", "resync_required", "access_revoked", "unavailable"),
                        "STREAM_EVENT_INVALID")
                terminal = event in ("resync_required", "access_revoked", "unavailable")
                require(frame.get("terminal") is terminal and
                        frame.get("reconnect_required") is (event == "resync_required") and
                        (all(frame.get(k) is None for k in ("resume_cursor", "projection_generation", "quality"))
                         and frame.get("reason_code") in ("SNAPSHOT_REQUIRED", "CURSOR_INVALID_OR_EXPIRED",
                         "SCOPE_CHANGED", "GENERATION_CHANGED", "SOURCE_COVERAGE_UNPROVED", "SOURCE_UNAVAILABLE",
                         "SLOW_CLIENT", "ACCESS_CHANGED", "RECONNECT_LIMIT", "STOPPED") if terminal else
                         cursor_valid(identifier) and frame.get("resume_cursor") == identifier and
                         frame.get("projection_generation") == expected_epoch and frame.get("reason_code") is None),
                        "STREAM_FRAME_INCONSISTENT")
                received = time.monotonic() if observe else None
                if observe and received >= end:
                    observation["termination"] = "DEADLINE"
                    break  # Buffered bytes after the deadline are not fresh observations.
                if event == "revalidate":
                    require(observe or time.monotonic() < end, "DEADLINE_EXCEEDED")
                    require(frame.get("next_action") == "READ_NAMED_SNAPSHOT" and
                            quality_valid(frame.get("quality")) and
                            frame["quality"]["source_set_ref"] == source_set_ref, "STREAM_NOTICE_INVALID")
                    notices += 1
                    last = identifier
                    if not observe:
                        break  # Old finite specimen: one notice, no active-stream proof.
                    if observation["first_notice_after_ms"] is None:
                        observation["first_notice_after_ms"] = max(0, int((received - started) * 1000))
                require(event != "heartbeat" or (frame.get("next_action") == "RESUME_PORTAL_CURSOR"
                        and frame.get("quality") is None), "STREAM_FRAME_INCONSISTENT")
                if terminal:
                    require(frame["next_action"] == {"resync_required": "READ_NAMED_SNAPSHOT",
                        "access_revoked": "SIGN_IN_OR_REQUEST_ACCESS", "unavailable": "WAIT"}[event],
                        "STREAM_FRAME_INCONSISTENT")
                if observe:
                    observation["frame_observations"].append({"event_type": event,
                        "frame_sha256": digest(frame),
                        "received_after_ms": max(0, int((received - started) * 1000))})
                if frame.get("terminal") is True:
                    observation.update(termination="TERMINAL", terminal_event=event)
                    break
            event, data, identifier = None, [], None
        elif text.startswith("event:"):
            event = text[6:].strip()
        elif text.startswith("data:"):
            data.append(text[5:].lstrip(" "))
        elif text.startswith("id:"):
            identifier = text[3:].strip()
        else:
            require(text.startswith(":"), "STREAM_FIELD_INVALID")
    if observation["termination"] is None:
        observation["termination"] = "DEADLINE" if time.monotonic() >= end else "FRAME_LIMIT"
    result = {"frames": count, "notices": notices, "bytes": total, "cursor": last}
    if observe:
        observation["elapsed_ms"] = max(0, int((time.monotonic() - started) * 1000))
        result["observation"] = observation
    return result


def quality_valid(value):
    return (type(value) is dict and set(value) == {"source_set_ref", "portal_observed_at_ms",
        "source_as_of_ms", "completeness", "freshness", "coverage", "confidence", "reasons"} and
        type(value["source_set_ref"]) is str and 1 <= len(value["source_set_ref"]) <= 256 and
        type(value["portal_observed_at_ms"]) is int and 0 <= value["portal_observed_at_ms"] <= 9007199254740991 and
        (value["source_as_of_ms"] is None or type(value["source_as_of_ms"]) is int and
         0 <= value["source_as_of_ms"] <= 9007199254740991) and
        value["completeness"] in ("COMPLETE", "PARTIAL", "UNRESOLVED") and
        value["freshness"] == "FRESH" and value["coverage"] in
        ("AUTHORIZED_ONLY", "CURRENT_PAGE_ONLY", "RETAINED_OBSERVATIONS") and
        value["confidence"] in ("VERIFIED", "PROVISIONAL", "UNKNOWN") and
        type(value["reasons"]) is list and len(value["reasons"]) <= 32 and
        all(type(x) is str and 1 <= len(x) <= 256 for x in value["reasons"]))


def finite(name, status, headers, raw, prepared):
    require(status == 200, "READ_NOT_AVAILABLE")
    body = shared().decode(raw)
    cfg, producer = prepared["config"], prepared["producer"]
    require(type(body) is dict and body.get("environment") == cfg["environment"] and
            body.get("profile_id") == cfg["profile_id"], "READ_SCOPE_MISMATCH")
    if name == "snapshot":
        observation = body.get("observation")
        require(type(observation) is dict and type(observation.get("scope")) is dict and
                type(observation.get("source")) is dict, "NATIVE_SNAPSHOT_UNPROVED")
        require(body.get("schema_version") == "portal.execution.profile-realtime.v1" and
                body.get("event_type") == "snapshot" and body.get("terminal") is False and
                body.get("reconnect_required") is False and body.get("workspace_id") == cfg["workspace_id"] and
                body.get("availability") == "AVAILABLE" and body.get("freshness") == "FRESH" and
                body.get("completeness") in ("COMPLETE", "PARTIAL") and
                type(body.get("payload")) is dict and type(body.get("payload_digest")) is str and
                re.fullmatch(r"(?:sha256:)?[a-f0-9]{64}", body["payload_digest"]) and
                type(body.get("recovery")) is dict and body["recovery"].get("state") == "HEALTHY" and
                body.get("projection_epoch") == producer.get("projection_epoch") and
                body.get("projection_epoch") is not None and
                type(body.get("projection_sequence")) is int and body["projection_sequence"] >= 0 and
                headers.get("x-portal-realtime-state") == "NATIVE_SCOPED_BASELINE_V1" and
                cursor_valid(headers.get("x-portal-realtime-cursor")), "NATIVE_SNAPSHOT_UNPROVED")
        require(observation.get("authority") == "PORTAL_OBSERVATION" and
                observation.get("semantics") == "BOUNDED_CURRENT_PAGE" and observation.get("derived") is False and
                all(observation["scope"].get(k) == cfg[k] for k in ("workspace_id", "environment", "profile_id")) and
                observation["source"].get("catalogue_revision", "").removeprefix("sha256:") ==
                producer["catalogue_sha256"], "NATIVE_SNAPSHOT_UNPROVED")
    else:
        expected = "portal.execution." + ("maximum-data.deployment-page.v1" if
            name == "deployments" else "eds11r.manager-relation-page.v1")
        require(body.get("schema_version") == expected and body.get("record_authority") ==
                "PORTAL_CONTROL_API" and body.get("source_health", {}).get("availability") ==
                "AVAILABLE" and body.get("source_health", {}).get("freshness") == "FRESH" and
                body.get("source_health", {}).get("completeness") in ("COMPLETE", "PARTIAL") and
                type(body.get("records")) is list and len(body["records"]) <= cfg["limit"] and
                body.get("source_catalogue_sha256", "").removeprefix("sha256:") ==
                producer["catalogue_sha256" if name == "deployments" else "relation_catalogue_sha256"],
                "NATIVE_PAGE_UNPROVED")
    return {"status": "PASS", "body_sha256": sha256(raw).hexdigest(), "bytes": len(raw),
            "rows": len(body.get("records", []))}


def run(config, transport_factory=Transport, checkpoint_sink=None):
    receipt = {"schema_version": "portal.execution.connected-read-result.v1", "status": "NOT_READY",
        "full_08": "NOT_MET", "full_09": "NOT_MET", "mutations": 0, "requests": 0,
        "cases": {name: {"status": "NOT_RUN"} for name in CASES}}
    try:
        p = prepare(config)
        receipt.update(producer_sha256=config["core_return"]["sha256"], scope_sha256=p["scope"])
        if p["session_evidence_class"] is not None:
            receipt["session_evidence_class"] = p["session_evidence_class"]
        transport = transport_factory(p)
        def request(name, cursor=None, stream=False):
            receipt["requests"] += 1
            return transport.request(name, cursor, stream=stream)
        if config["stage"] == "post_revoke":
            if p["revoke"]["authority"] == "PM_NATIVE_READ":
                # PM refusal after Core hijack may destroy HTTP without bytes. A
                # generic EOF/timeout is not native DENIED proof; the owning
                # attempt/receipt observer must correlate that separate drill.
                receipt["reason"] = "PM_DENIAL_REQUIRES_CORRELATED_OWNER_RECEIPT"
                return receipt
            if p["revoke_action"] == "stream.subscribe":
                # Positive READ uses the same subject/domain/native selection,
                # not a fake unaffected principal or a cache-HIT assertion.
                status, headers, raw = request("deployments")
                read_page = finite("deployments", status, headers, raw, p)
                status, headers, raw = request("snapshot")
                read_snapshot = finite("snapshot", status, headers, raw, p)
                receipt["cases"]["post_revoke_stream_read_preserved"] = {
                    "status": "PASS", "page": read_page, "snapshot": read_snapshot}
                for case, cursor in (("post_revoke_stream", None),
                                     ("post_revoke_cursor", p["prior"]["cursor"])):
                    status, _, raw = request("stream", cursor)
                    body = shared().decode(raw)
                    error = body.get("error", body) if type(body) is dict else None
                    require(status == 403 and type(error) is dict and error.get("code") ==
                            "ACCESS_DENIED", "REVOKED_STREAM_NOT_DENIED")
                    receipt["cases"][case] = {"status": "PASS", "http_status": status,
                        "body_sha256": sha256(raw).hexdigest()}
                receipt["status"] = "SCOPED_OBSERVATIONS_ONLY"
                return receipt
            for case, name, cursor in (("post_revoke_read", "deployments", None),
                                      ("post_revoke_cursor", "stream", p["prior"]["cursor"])):
                status, _, raw = request(name, cursor)
                body = shared().decode(raw)
                code = (body.get("error", body).get("code") if type(body) is dict and
                    type(body.get("error", body)) is dict else None)
                allowed = ({403: ("NATIVE_MANAGER_READ_DENIED", "ACCESS_DENIED"),
                            404: ("WORKSPACE_NOT_FOUND",)} if name == "deployments" else
                           {403: ("NATIVE_MANAGER_READ_DENIED", "ACCESS_DENIED"),
                            409: ("SCOPE_CHANGED", "CURSOR_INVALID_OR_EXPIRED")})
                require(code in allowed.get(status, ()),
                        "REVOKED_ACCESS_NOT_DENIED")
                receipt["cases"][case] = {"status": "PASS", "http_status": status,
                    "body_sha256": sha256(raw).hexdigest()}
        else:
            finite_results = {}
            for case, name in (("deployments", "deployments"), ("relation", "relation"),
                               ("repeat_read", "deployments"), ("snapshot", "snapshot")):
                if name == "relation" and not pin(p["producer"].get("relation_catalogue_sha256")):
                    continue  # A deployment source does not imply a separately selected relation source.
                status, headers, raw = request(name)
                finite_results[case] = finite(name, status, headers, raw, p)
            # Unchanged V1 JSON cannot prove native selection by itself. Do not
            # credit those finite observations before the native snapshot proof.
            receipt["cases"].update(finite_results)
            cursor = headers["x-portal-realtime-cursor"]
            if checkpoint_sink is not None:
                checkpoint = {"schema_version": "portal.execution.connected-read-baseline.v1",
                    "scope_sha256": p["scope"], "producer_sha256": config["core_return"]["sha256"],
                    "policy_revision": p["producer"]["policy_revision"],
                    "manager_grant_revision": p["producer"]["manager_grant_revision"],
                    "native_revision": p["producer"]["native_revision"],
                    "read_authorized": p["producer"]["read_authorized"],
                    "stream_authorized": p["producer"]["stream_authorized"],
                    "at_utc": datetime.now(timezone.utc).isoformat(), "cursor": cursor}
                if "stream_grant_id" in p["producer"]:
                    checkpoint.update({k: p["producer"][k] for k in
                                       ("stream_grant_id", "stream_grant_revision")})
                checkpoint_sink(checkpoint)
            if config["probe_stream"] and p["producer"]["stream_authorized"]:
                status, _, stream = request("stream", cursor, True)
                require(status == 200 and type(stream) is dict, "STREAM_NOT_AVAILABLE")
                receipt["cases"]["stream_notice"] = {"status": "PASS" if stream["notices"] else "NOT_RUN",
                    "frames": stream["frames"], "notices": stream["notices"], "bytes": stream["bytes"]}
                if config.get("observe_active_stream", False):
                    receipt["active_stream_observation"] = stream["observation"]
                    # Leave active_stream_revocation NOT_RUN. Timing and EOF are
                    # client facts, not correlated official final-egress proof.
                elif stream["notices"]:
                    status, _, resumed = request("stream", stream["cursor"], True)
                    require(status == 200 and type(resumed) is dict, "RESUME_NOT_AVAILABLE")
                    receipt["cases"]["cursor_resume"] = {"status": "PASS" if resumed["notices"] else "NOT_RUN",
                        "notices": resumed["notices"], "bytes": resumed["bytes"]}
        receipt["status"] = "SCOPED_OBSERVATIONS_ONLY"
    except Exception as error:
        # Never stringify arbitrary exceptions: HTTP/JSON errors may contain data/session refs.
        receipt["status"] = "FAIL" if receipt["requests"] else "NOT_READY"
        receipt["reason"] = str(error) if isinstance(error, Refused) else "INPUT_OR_TRANSPORT_REFUSED"
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--checkpoint-fd", type=int)
    args = parser.parse_args()
    try:
        require(sys.flags.isolated and sys.dont_write_bytecode, "ISOLATED_NO_BYTECODE_REQUIRED")
        config = document({"path": args.config, "sha256": args.sha256})
        sink = None
        if args.checkpoint_fd is not None:
            meta = os.fstat(args.checkpoint_fd)
            require(args.checkpoint_fd >= 3 and stat.S_ISREG(meta.st_mode) and meta.st_uid == os.geteuid()
                    and stat.S_IMODE(meta.st_mode) == 0o600 and meta.st_nlink == 1 and meta.st_size == 0,
                    "PRIVATE_CHECKPOINT_FD_REQUIRED")
            def sink(value):
                raw = json.dumps(value, separators=(",", ":")).encode() + b"\n"
                require(os.write(args.checkpoint_fd, raw) == len(raw), "CHECKPOINT_WRITE_FAILED")
        result = run(config, checkpoint_sink=sink)
    except Exception:
        result = {"schema_version": "portal.execution.connected-read-result.v1", "status": "NOT_READY",
                  "reason": "PRIVATE_INPUT_REFUSED", "requests": 0, "full_08": "NOT_MET", "full_09": "NOT_MET",
                  "cases": {name: {"status": "NOT_RUN"} for name in CASES}}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "SCOPED_OBSERVATIONS_ONLY" else 2


if __name__ == "__main__":
    raise SystemExit(main())
