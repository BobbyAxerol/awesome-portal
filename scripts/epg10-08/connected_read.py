#!/usr/bin/env python3
"""Bounded original08 Core API acceptance driver, NOT a product data adapter.

Run isolated/no-bytecode with --config PATH --sha256 PIN. Config, genuine Core
session and owner receipts are private pinned references. This driver never
issues identity, grants, JWTs, SQL, commands or revocation. Core/PM perform their
official revoke separately. Baseline/post_revoke are distinct finite specimens;
reconnect denial is NOT proof of active-stream revocation or a cache HIT.
Optional private cache_proof pins the existing P22 CLI prime/HIT receipts to
this baseline. It requires a real pre-expiry READ revoke, durable SERVED/source
ACK and two current HTTP403 denials; P22 MACs are not verified by this driver.
Opt-in observe_active_stream holds the existing stream past its first notice
to collect bounded client-side facts while the owner revokes separately. Those
facts never prove server final-egress or grant a mutation capability.

Optional --checkpoint-fd writes ONLY an opaque baseline cursor/provenance to an
already open private owner file (never stdout). Public stdout contains bounded
hashes/counts/results only. Missing inputs are NOT_READY/NOT_RUN, not full08/09
PASS. Do not point this browser API client at reverse-mTLS identity port28444.
Optional session_margin_seconds (0..600) requires a verifiable Core session
expiry beyond the global deadline plus that reserve. It does not extend a
session/grant or change workload JWT/native lease TTL. Legacy configs default0.
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
from uuid import UUID

ORIGIN = "https://research-portal.primusspark.com"
HOST = "research-portal.primusspark.com"
MAX_BYTES = 1024 * 1024
HELPER_PIN = "a6fa59aeb1438a4cff2147dc2359f614c347e2d3f6dbfbed8e108faffa77ad1f"
CASES = ("deployments", "relation", "repeat_read", "snapshot", "cursor_resume",
         "stream_notice", "post_revoke_read", "post_revoke_cursor",
         "post_revoke_stream", "post_revoke_stream_read_preserved",
         "cache_revocation", "active_stream_revocation", "unaffected_scope",
         "r03_deployment_pages")


class Refused(ValueError):
    pass


class ReadNotAvailable(Refused):
    """A read that did not return HTTP 200: carries ONLY the status and a short error code string (never the body)."""


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


def session_headers(session, producer, now, deadline_seconds, margin_seconds=0):
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
            expiry = utc(session["absolute_expires_at"])
            require(expiry > now + deadline_seconds and
                    expiry >= now + deadline_seconds + margin_seconds,
                    "SESSION_INVALID")
        except (ValueError, TypeError, OverflowError):
            raise Refused("SESSION_INVALID") from None
        return {"Cookie": "__Host-portal_session=" + session["token"], "Accept": "application/json"}, (
            "RESEARCH_APPLICATION_SESSION_NOT_CLOUDFLARE_NOT_PASSWORD_NOT_HUMAN_PRESENCE")
    require(margin_seconds == 0, "SESSION_EXPIRY_UNVERIFIABLE")
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
    margin = config.get("session_margin_seconds", 0)
    require(type(margin) is int and 0 <= margin <= 600, "SESSION_MARGIN_INVALID")
    require(type(config.get("probe_stream")) is bool and
            type(config.get("observe_active_stream", False)) is bool, "BOUNDS_INVALID")
    require(type(config.get("read_spacing_seconds", 0)) is int and 0 <= config.get("read_spacing_seconds", 0) <= 10,
            "READ_SPACING_INVALID")
    # Owner-staged acceptance (stage 1): deployments read + its repeat only. snapshot/cursor/relation/stream stay NOT_RUN.
    # Stage 2a ("snapshot_stage"): deployments, its repeat and the native snapshot only. Relation, stream and
    # cursor_resume cannot run in this scope; the one native read at a time spacing must be at least 3 s.
    require(config.get("read_scope", "full") in ("full", "deployments_only", "snapshot_stage", "snapshot_only", "relation_stage", "relation_walk",
                                                              "relation_sweep", "stream_stage"),
            "READ_SCOPE_INVALID")
    require(config.get("read_scope", "full") not in ("snapshot_stage", "relation_stage", "relation_walk", "relation_sweep",
                                                              "stream_stage") or
            3 <= config.get("read_spacing_seconds", 0) <= 10, "READ_SPACING_TOO_LOW_FOR_SNAPSHOT_STAGE")
    require(config.get("read_scope", "full") in ("full", "stream_stage") or not (
        config["probe_stream"] or config.get("observe_active_stream", False) or "bounded_page_probe" in config or
        "cache_proof" in config or config.get("revoke_action", "business.read_all") != "business.read_all"),
        "READ_SCOPE_COMBINATION_INVALID")
    # Stage "stream_stage": the STREAM + cursor_resume window. Baseline: the snapshot (cursor), the first stream collecting its
    # first notice, the resume collecting one more; probe_stream must be true; no observe/page/cache probe. post_revoke: the
    # existing stream.subscribe revoke path (STREAM denied, one READ read preserved); no relation/walk/sweep/carry keys.
    require(config.get("read_scope", "full") != "stream_stage" or (
        not config.get("observe_active_stream", False) and "bounded_page_probe" not in config and
        "cache_proof" not in config and
        ((config["stage"] == "baseline" and config["probe_stream"] is True and "revoke_action" not in config) or
         (config["stage"] == "post_revoke" and config.get("revoke_action") in ("stream.subscribe", "business.read_all")))),
        "READ_SCOPE_COMBINATION_INVALID")
    # stream_hold (stage 2f): the baseline holds ONE stream open, writes the public revoke-signal file after min_notices notices and measures
    # the time to the end of the stream. Only for stream_stage baseline; the signal file is a fixed-name public note in an existing directory.
    hold = config.get("stream_hold")
    require(hold is None or (
        config.get("read_scope", "full") == "stream_stage" and config["stage"] == "baseline" and type(hold) is dict and
        set(hold) == {"min_notices", "signal_path", "max_after_signal_seconds"} and
        type(hold["min_notices"]) is int and 2 <= hold["min_notices"] <= 5 and
        type(hold["max_after_signal_seconds"]) is int and 5 <= hold["max_after_signal_seconds"] <= 30 and
        type(hold["signal_path"]) is str and
        re.fullmatch(r"/[A-Za-z0-9_./-]{1,400}/EDGE_W7_REVOKE_STREAM_NOW_[0-9]{8}\.md", hold["signal_path"]) is not None and
        os.path.isdir(os.path.dirname(hold["signal_path"]))), "STREAM_HOLD_INVALID")
    # "snapshot_only": the redo of ONE snapshot read after a prior snapshot_stage run failed at the snapshot; the two
    # deployments passes are carried forward from that private result (never counted as requests, never plain PASS).
    require(config.get("snapshot_expectation", "complete") in ("complete", "seed_read_path") and
            (config.get("snapshot_expectation", "complete") == "complete" or
             config.get("read_scope", "full") in ("snapshot_stage", "snapshot_only", "relation_stage", "stream_stage")) and
            (config.get("read_scope", "full") not in ("snapshot_only", "relation_stage") or
             config.get("snapshot_expectation") == "seed_read_path"), "SNAPSHOT_EXPECTATION_INVALID")
    # Stage 2c ("relation_walk"): R03/R02 on the Binance-predicate rows: walk the pages of a fixed allowlist of relations; no
    # deployments, no snapshot (a seed expectation is refused), spacing of at least 3 s between EVERY request.
    require(config.get("read_scope", "full") not in ("relation_walk", "relation_sweep") or
            config.get("snapshot_expectation", "complete") == "complete", "SNAPSHOT_EXPECTATION_INVALID")
    # Stage 2d ("relation_sweep"): ONE page of each listed relation route; typed refusals recorded; spacing before every request.
    require(("relation_sweep" in config) == (config.get("read_scope", "full") == "relation_sweep"), "RELATION_SWEEP_INVALID")
    if "relation_sweep" in config:
        sweep_spec(config["relation_sweep"])
    require(("relation_walk" in config) == (config.get("read_scope", "full") == "relation_walk"), "RELATION_WALK_INVALID")
    if "relation_walk" in config:
        walk_spec(config["relation_walk"])
    require(("carry_forward_result" in config) == (config.get("read_scope", "full") == "snapshot_only" and
            config["stage"] == "baseline") and
            ("carry_forward_result" not in config or type(config["carry_forward_result"]) is dict),
            "CARRY_FORWARD_INVALID")
    if "bounded_page_probe" in config:
        probe = config["bounded_page_probe"]
        require(config["stage"] == "baseline" and not config["probe_stream"] and
                not config.get("observe_active_stream", False) and type(probe) is dict and
                set(probe) == {"max_pages", "max_rows", "max_total_bytes"} and
                all(type(probe.get(k)) is int and 1 <= probe[k] <= cap for k, cap in
                    (("max_pages", 100), ("max_rows", 20000),
                     ("max_total_bytes", 20971520))), "R03_BOUNDS_INVALID")
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
    require(config.get("read_scope", "full") != "stream_stage" or config["stage"] != "baseline" or
            (receipt["stream_authorized"] is True and "stream_grant_id" in receipt and "stream_grant_revision" in receipt),
            "STREAM_NOT_AUTHORIZED")   # stream_stage needs a STREAM grant distinct from the READ grant, before any request
    require(config.get("read_scope", "full") not in ("snapshot_stage", "snapshot_only", "relation_stage", "relation_walk",
                                                              "relation_sweep") or
            not receipt["stream_authorized"],
            "STREAM_AUTHORIZED_IN_SNAPSHOT_STAGE")   # 2a has no STREAM scope: a ready doc that grants one is refused
    # Stage 2b ("relation_stage"): deployments, ONE relation read (account balances) and the seed snapshot; the relation needs
    # its own catalogue pin in the ready doc.
    require(config.get("read_scope", "full") not in ("relation_stage", "relation_walk", "relation_sweep") or
            pin(receipt.get("relation_catalogue_sha256")),
            "RELATION_CATALOGUE_UNDECLARED")
    if config["probe_stream"] and receipt["stream_authorized"]:
        require(type(receipt.get("source_set_ref")) is str and bool(receipt["source_set_ref"]),
                "STREAM_SOURCE_SET_UNDECLARED")
    require(min(utc(receipt[k]) for k in ("expires_at", "trust_expires_at", "native_expires_at"))
            > now + config["deadline_seconds"], "INPUT_EXPIRED")
    session = document(config["session"])
    require(receipt.get("session_sha256") == config["session"]["sha256"], "SESSION_INVALID")
    headers, session_evidence_class = session_headers(
        session, receipt, now, config["deadline_seconds"], margin)
    ip = ipaddress.ip_address(receipt.get("api_ip", ""))
    require(ip.is_global, "API_IP_INVALID")  # No DNS/unbounded resolver or generic upstream.
    scope = digest({k: receipt[k] for k in ("origin", "subject", "workspace_id", "environment",
        "profile_id", "acceptance_id", "catalogue_sha256", "field_policy_sha256", "manager_grant_id")})
    prior = revoke = carried = None
    if "carry_forward_result" in config:
        carried = document(config["carry_forward_result"])
        cases = carried.get("cases") if type(carried) is dict else None
        require(type(cases) is dict and carried.get("schema_version") == "portal.execution.connected-read-result.v1" and
                carried.get("status") == "FAIL" and carried.get("read_scope") == "snapshot_stage" and
                carried.get("producer_sha256") == config["core_return"]["sha256"] and
                carried.get("scope_sha256") == scope and
                all(type(cases.get(k)) is dict and cases[k].get("status") == "PASS" and pin(cases[k].get("body_sha256"))
                    for k in ("deployments", "repeat_read")) and
                type(cases.get("snapshot")) is dict and cases["snapshot"].get("status") == "NOT_RUN",
                "CARRY_FORWARD_INVALID")
    if config["stage"] == "post_revoke":
        prior, revoke = document(config["baseline"]), document(config["revoke_return"])
        require(prior.get("schema_version") == "portal.execution.connected-read-baseline.v1" and
                prior.get("scope_sha256") == scope and pin(prior.get("producer_sha256")) and
                (cursor_valid(prior.get("cursor")) or (config.get("read_scope", "full") in ("deployments_only", "relation_walk",
                                                                                            "relation_sweep")
                                                        and "cursor" not in prior)), "BASELINE_PROVENANCE_INVALID")
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
                  type(prior.get("stream_grant_revision")) is str and
                  1 <= len(prior["stream_grant_revision"]) <= 256 and
                  stream_revoke_identity_ok(receipt, prior, revoke))),
                "REVOKE_PROVENANCE_INVALID")
        if action == "stream.subscribe" and "stream_grant_id" in receipt:
            validate_stream_revoke(receipt, prior, revoke, now)   # full design: stream identity inside the post document + official file
        if action == "business.read_all" and config.get("read_scope", "full") == "stream_stage":
            # Both grants revoked in one official document (READ and STREAM): the STREAM grant must have been live in the baseline and
            # must no longer be authorised; the READ refusal and the STREAM refusal are then the two post_revoke requests.
            require(prior.get("stream_authorized") is True and receipt.get("stream_authorized") is False, "REVOKE_PROVENANCE_INVALID")
    cache = None
    if "cache_proof" in config:
        require(config["stage"] == "post_revoke" and action == "business.read_all" and
                revoke["authority"] == "CORE_MANAGER_DOMAIN", "CACHE_PROOF_SCOPE_INVALID")
        validate_domain_revoke(receipt, prior, revoke, now, "business.read_all")
        cache = validate_cache_proof(config, prior, scope)
    return {"config": config, "producer": receipt, "headers": headers, "ip": str(ip),
            "scope": scope, "prior": prior, "revoke": revoke, "carried": carried,
            "revoke_action": action, "session_evidence_class": session_evidence_class,
            "cache_proof": cache}


def validate_cache_proof(config, prior, scope):
    """Consume pinned outputs of the EXISTING Core private exact-key P22 CLI.

    The private owner envelope binds those outputs to the observed baseline;
    P22 MACs alone disclose neither scope nor time. This creates no authority,
    authenticates no MAC, and is not a substitute for installed-producer pins.
    PASS is credited only later, after this driver observes post-revoke denial.
    """
    proof = document(config["cache_proof"])
    require(type(proof) is dict and set(proof) == {"schema_version", "baseline_sha256",
            "producer_sha256", "scope_sha256", "prime", "hit"} and
            proof["schema_version"] == "portal.execution.connected-cache-proof.v1" and
            proof["baseline_sha256"] == config["baseline"]["sha256"] and
            proof["producer_sha256"] == prior["producer_sha256"] and
            proof["scope_sha256"] == scope and pin(prior.get("read_body_sha256")) and
            pin(prior.get("prime_body_sha256")),
            "CACHE_PROOF_PROVENANCE_INVALID")
    observations = []
    refs = []
    for name in ("prime", "hit"):
        ref = proof[name]
        require(type(ref) is dict and set(ref) == {"path", "sha256"} and pin(ref["sha256"]),
                "CACHE_PROOF_RECEIPT_INVALID")
        value = document(ref)
        require(type(value) is dict and set(value) == {"schema_version", "observation",
                "custody", "checks", "durable_egress", "verdict"} and
                value["schema_version"] == "portal.native-cache-observation-receipt.v1" and
                value["verdict"] == "CORRELATED" and value["durable_egress"] == "SERVED",
                "CACHE_PROOF_RECEIPT_INVALID")
        obs, custody, checks = value["observation"], value["custody"], value["checks"]
        require(type(obs) is dict and set(obs) == {"schema_version", "lease_id", "attempt_id",
                "operation_id", "cache_state", "cache_identity_mac", "native_epoch_mac",
                "body_digest", "egress_evidence_kind", "egress_semantics"} and
                obs["schema_version"] == "portal.native-cache-observation.v1" and
                obs["operation_id"] == "maximumDataDeploymentPageV1" and
                obs["cache_state"] in ("HIT", "MISS", "COALESCED") and
                obs["body_digest"] == "sha256:" + prior[
                    "prime_body_sha256" if name == "prime" else "read_body_sha256"] and
                obs["egress_evidence_kind"] in ("FINAL_HTTP_SEND_COMPLETED",
                    "EGRESS_NOT_OBSERVED_IN_RETURN") and
                obs["egress_semantics"] == "LOCAL_CORE_HTTP_EGRESS_ONLY" and
                all(type(obs[k]) is str and re.fullmatch(r"hmac-sha256:[a-f0-9]{64}", obs[k])
                    for k in ("cache_identity_mac", "native_epoch_mac")),
                "CACHE_PROOF_OBSERVATION_INVALID")
        for key in ("lease_id", "attempt_id"):
            require(type(obs[key]) is str and
                    re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", obs[key]) and
                    str(UUID(obs[key])) == obs[key], "CACHE_PROOF_OBSERVATION_INVALID")
        require(type(custody) is dict and set(custody) == {"lease_id", "attempt_id", "phase",
                "body_digest", "receipt_digest", "source_ack_digest", "source_reconciled"} and
                all(custody[k] == obs[k] for k in ("lease_id", "attempt_id", "body_digest")) and
                custody["phase"] == "SERVED" and custody["source_reconciled"] is True and
                all(type(custody[k]) is str and re.fullmatch(r"sha256:[a-f0-9]{64}", custody[k])
                    for k in ("receipt_digest", "source_ack_digest")) and
                type(checks) is dict and set(checks) == {"lease_attempt_match", "body_digest_match",
                    "egress_phase_consistent"} and all(x is True for x in checks.values()),
                "CACHE_PROOF_CUSTODY_INVALID")
        observations.append(obs)
        refs.append(ref["sha256"])
    prime, hit = observations
    require(hit["cache_state"] == "HIT" and
            all(prime[k] == hit[k] for k in ("cache_identity_mac", "native_epoch_mac")) and
            all(prime[k] != hit[k] for k in ("lease_id", "attempt_id")) and refs[0] != refs[1],
            "CACHE_HIT_NOT_PROVED")
    return {"status": "PASS", "evidence_class": "OWNER_PINNED_P22_AND_HTTP_DENIAL",
            "prime_cli_sha256": refs[0], "hit_cli_sha256": refs[1]}


def stream_revoke_identity_ok(receipt, prior, revoke):
    """Where the revoked STREAM grant's identity comes from.

    Full design (stage 2c-era tests): the post ready doc names the stream grant id and its NEW revision. Core's ready-doc schema refuses stream
    fields when ``stream_authorized`` is false, so the real STREAM-only post document carries none: the identity is then the baseline's
    ``stream_grant_id`` and the revoke-return states it (``stream_grant_id``, ``stream_grant_revision_before`` = the baseline's, a different
    ``stream_grant_revision_after``, integer ``revoked_at_ms`` between the baseline time and the commit). The official receipt stays pinned by
    hash only in that mode (its content is not read by Edge)."""
    if "stream_grant_id" in receipt or "stream_grant_revision" in receipt:
        return (type(receipt.get("stream_grant_id")) is str and receipt["stream_grant_id"] == prior.get("stream_grant_id") and
                receipt.get("stream_grant_revision") != prior["stream_grant_revision"])
    after, before = revoke.get("stream_grant_revision_after"), revoke.get("stream_grant_revision_before")
    return (type(prior.get("stream_grant_id")) is str and revoke.get("stream_grant_id") == prior["stream_grant_id"] and
            before == prior["stream_grant_revision"] and type(after) is str and 1 <= len(after) <= 256 and after != before and
            type(revoke.get("revoked_at_ms")) is int and
            round(utc(prior["at_utc"]) * 1000) <= revoke["revoked_at_ms"] <= round(utc(revoke["committed_at_utc"]) * 1000))


def validate_stream_revoke(producer, prior, revoke, now):
    validate_domain_revoke(producer, prior, revoke, now, "stream.subscribe")


def validate_domain_revoke(producer, prior, revoke, now, action):
    """Bind the selected READ/STREAM grant to a real pre-expiry coordinator revoke.

    READY/checkpoint data is assembled from actual install ACK/readback. The
    official receipt remains a private pinned document; no new exporter/API.
    """
    prefix = "stream" if action == "stream.subscribe" else "manager"
    code = "STREAM_REVOKE_RECEIPT_INVALID" if prefix == "stream" else "CACHE_REVOKE_RECEIPT_INVALID"
    ref = revoke.get("official_receipt")
    require(type(ref) is dict and ref.get("sha256") == revoke["official_receipt_sha256"],
            code)
    envelope = document(ref)
    require(type(envelope) is dict and envelope.get("schema_version") ==
            "portal.native-research-manager-revoke.v1" and
            type(envelope.get("results")) is list and len(envelope["results"]) == 1 and
            all(type(item) is dict for item in envelope["results"]), code)
    selected = [item for item in envelope["results"] if item.get("grant_id") == producer[prefix + "_grant_id"]]
    require(len(selected) == 1, code)
    official = selected[0]
    require(type(official) is dict and official.get("schema_version") ==
            "portal.manager-domain-revoke-receipt.v1" and
            official.get("grant_id") == producer[prefix + "_grant_id"] and
            official.get("action") == action and official.get("mode") == "REVOKE" and
            official.get("outcome") == "REVOKED" and
            official.get("grant_revision_before") == prior[prefix + "_grant_revision"] and
            official.get("grant_revision_after") == producer[prefix + "_grant_revision"] and
            official.get("grant_revision_before") != official.get("grant_revision_after") and
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
            code)


# Stage 2a "seed_read_path" expectation. Core's one-shot seed row reads no source: the snapshot envelope is the real
# portal.execution.profile-realtime.v1 body with a CURSOR_ONLY payload (sample: CORE_STAGE2A_SAMPLE_SNAPSHOT_BODY_20261113.json).
# completeness UNKNOWN is the honest marker. availability and freshness are health/age based (FRESH/AGING/STALE), NOT source
# health, so only their presence as strings is required, never a value: an AVAILABLE/FRESH envelope over a seeded empty row proves
# the read path only. The case is recorded as READ_PATH_ONLY, never PASS.
SEED_READ_PATH = {"snapshot_mode": "CURSOR_ONLY", "relation_count": 1, "completeness": "UNKNOWN",
                  "contract_revision": "trading-system.portal-execution.manager-v2.runtime.v1",
                  "coverage": {"kind": "CURRENT_PROFILE_PROJECTION", "relation_count": 1}}


def seed_read_path_signature(body, producer):
    """Refuse anything that is not exactly Core's CURSOR_ONLY seed envelope; every other snapshot check has already run."""
    for key in ("availability", "freshness"):   # health/age markers: present strings, values deliberately not asserted
        require(type(body.get(key)) is str and body[key] != "", "SEED_SIGNATURE_MISMATCH")
    payload, observation = body["payload"], body["observation"]
    require(body.get("completeness") == SEED_READ_PATH["completeness"] and body.get("source_as_of") is None and
            set(payload) == {"snapshot_mode", "relation_count", "source_contract_revision", "source_catalogue_sha256"} and
            payload["snapshot_mode"] == SEED_READ_PATH["snapshot_mode"] and
            type(payload["relation_count"]) is int and payload["relation_count"] == SEED_READ_PATH["relation_count"] and
            payload["source_contract_revision"] == SEED_READ_PATH["contract_revision"] and
            type(payload["source_catalogue_sha256"]) is str and
            payload["source_catalogue_sha256"].removeprefix("sha256:") == producer["catalogue_sha256"],
            "SEED_SIGNATURE_MISMATCH")
    source, coverage = observation["source"], observation.get("coverage")
    require(source.get("contract_revision") == SEED_READ_PATH["contract_revision"] and source.get("as_of_ms") is None and
            type(coverage) is dict and coverage == SEED_READ_PATH["coverage"] and
            type(coverage["relation_count"]) is int, "SEED_SIGNATURE_MISMATCH")


def cursor_valid(value):
    return type(value) is str and 1 <= len(value) <= 4096 and re.fullmatch(r"[A-Za-z0-9._~-]+", value)


def route(name, config, cursor=None):
    walked = re.fullmatch(r"relation_walk:([a-z_]{1,32}):([0-9]{1,3})", name)
    if walked is not None:   # stage 2c: one fixed Core relation route; the per-relation limit travels in the name
        require(walked.group(1) in WALK_RELATIONS and 1 <= int(walked.group(2)) <= 200, "ROUTE_NOT_ALLOWED")
        query = {"workspace_id": config["workspace_id"], "environment": config["environment"],
                 "limit": int(walked.group(2))}
        if cursor is not None:
            require(cursor_valid(cursor), "CURSOR_INVALID")
            query["cursor"] = cursor
        return ("/api/v1/execution/manager/current/" + WALK_RELATIONS[walked.group(1)]["route"] + "?" + urlencode(query))
    swept = re.fullmatch(r"relation_sweep:([a-z0-9_]{1,48}):([0-9]{1,3})", name)
    if swept is not None:   # stage 2d: one fixed Core relation route per relation; the limit travels in the name
        require(swept.group(1) in SWEEP_RELATIONS and 1 <= int(swept.group(2)) <= 200, "ROUTE_NOT_ALLOWED")
        require(cursor is None, "CURSOR_INVALID")   # a sweep never follows a page
        return ("/api/v1/execution/manager/current/" + SWEEP_RELATIONS[swept.group(1)]["route"] + "?" +
                urlencode({"workspace_id": config["workspace_id"], "environment": config["environment"],
                           "limit": int(swept.group(2))}))
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
        self.hold = None   # stream_hold: the StreamHold the driver attaches before the stream request

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
                observe = self.p["config"].get("observe_active_stream", False) or "stream_hold" in self.p["config"]
                if observe:
                    # The global abort timer still owns the physical socket even
                    # after HTTPConnection detaches it. Quiet streams may stay
                    # open until that bounded deadline, not just the5s connect cap.
                    tls_socket.settimeout(max(0.001, self.end - time.monotonic()))
                result = read_sse(response, self.p["config"]["max_bytes"], self.end,
                                  self.p["producer"]["projection_epoch"], self.p["producer"]["source_set_ref"],
                                  observe=observe,
                                  **({"report_termination": True}
                                     if self.p["config"].get("read_scope") == "stream_stage" else {}),
                                  **({"hold": self.hold, "frame_cap": 100} if "stream_hold" in self.p["config"] else {}))
                require(observe or not result["notices"] or
                        (not expired.is_set() and time.monotonic() < self.end),
                        "DEADLINE_EXCEEDED")
                return response.status, dict(response.getheaders()), result
            if response.getheader("Content-Type", "").split(";")[0] != "application/json":
                error = ReadNotAvailable("JSON_CONTENT_TYPE_INVALID")
                kind = response.getheader("Content-Type", "")
                error.http_status, error.error_code = response.status, None
                error.content_type = kind if re.fullmatch(r"[A-Za-z0-9/+.;= _-]{1,64}", kind) else "UNPARSEABLE"
                raise error
            raw = response.read(self.p["config"]["max_bytes"] + 1)
            require(len(raw) <= self.p["config"]["max_bytes"], "RESPONSE_LIMIT")
            require(not expired.is_set() and time.monotonic() < self.end, "DEADLINE_EXCEEDED")
            return response.status, {k.lower(): v for k, v in response.getheaders()}, raw
        finally:
            timer.cancel()
            abort()
            if response is not None:
                response.close()


class StreamHold:
    """stage 2f: after ``min_notices`` valid revalidate notices write the public revoke-signal file ONCE and bound the rest of the read.

    The file holds only fixed public text and the runner's UTC time; no frame value, cursor or key. ``hard_end`` stops the read
    ``max_after_signal_seconds`` after the signal (a stream that is still open then is a finding, not a pass)."""

    def __init__(self, spec):
        self.min_notices, self.path, self.max_after = spec["min_notices"], spec["signal_path"], spec["max_after_signal_seconds"]
        self.signal_utc = self.signal_mono = self.notices_before_signal = self.hard_end = self.stream_started_mono = None

    def on_notice(self, notices):
        if self.signal_mono is not None or notices < self.min_notices:
            return
        self.signal_mono, self.signal_utc = time.monotonic(), datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        self.notices_before_signal = notices
        self.hard_end = self.signal_mono + self.max_after
        text = ("# Edge -> Core: W7 revoke the STREAM grant now (public text only)\n\n"
                f"Written {self.signal_utc} (runner clock). The stream_stage runner holds ONE stream open and has seen "
                f"{notices} notices. Please revoke ONLY the stream.subscribe grant now (READ stays). The runner measures the time "
                f"from this file to the end of the stream (bound {self.max_after} s).\n")
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        try:
            os.write(fd, text.encode())
        finally:
            os.close(fd)
        digest_file = self.path[:-3] + ".sha256"
        fd = os.open(digest_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        try:
            os.write(fd, (sha256(text.encode()).hexdigest() + "  " + os.path.basename(self.path) + "\n").encode())
        finally:
            os.close(fd)


def read_sse(response, maximum, end, expected_epoch, source_set_ref, *, observe=False, report_termination=False,
             hold=None, frame_cap=8):
    count, notices, total, event, data, identifier = 0, 0, 0, None, [], None
    last = None
    started = time.monotonic() if observe else None
    if hold is not None:
        hold.stream_started_mono = started
    observation = {"status": "OBSERVED_ONLY", "termination": None, "first_notice_after_ms": None,
        "terminal_event": None, "frame_observations": [], "final_egress_proved": False}
    if observe:
        observation["started_at_utc"] = datetime.now(timezone.utc).isoformat()
    while count < frame_cap and time.monotonic() < end:
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
        if hold is not None and hold.hard_end is not None and time.monotonic() >= hold.hard_end:
            observation["termination"] = "POST_SIGNAL_BOUND"
            break  # the stream was still open max_after_signal_seconds after the signal
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
                    require(frame.get("next_action") == "READ_NAMED_SNAPSHOT", "STREAM_NOTICE_NEXT_ACTION_INVALID")
                    require(quality_valid(frame.get("quality")), "STREAM_NOTICE_QUALITY_INVALID")
                    require(frame["quality"]["source_set_ref"] == source_set_ref, "STREAM_NOTICE_SOURCE_SET_REF_MISMATCH")
                    notices += 1
                    last = identifier
                    if hold is not None:
                        hold.on_notice(notices)
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
                        "received_after_ms": max(0, int((received - started) * 1000)),
                        **({"portal_observed_at_ms": frame["quality"]["portal_observed_at_ms"]
                            if type(frame.get("quality")) is dict else None} if hold is not None else {})})
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
    if report_termination:   # stream_stage only: why the read ended (SOCKET_TIMEOUT, DEADLINE, EOF, FRAME_LIMIT, TERMINAL)
        result["termination"] = observation["termination"]
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
        value["freshness"] in ("FRESH", "STALE", "UNKNOWN") and value["coverage"] in
        ("AUTHORIZED_ONLY", "CURRENT_PAGE_ONLY", "RETAINED_OBSERVATIONS") and
        value["confidence"] in ("VERIFIED", "PROVISIONAL", "UNKNOWN") and
        type(value["reasons"]) is list and len(value["reasons"]) <= 32 and
        all(type(x) is str and 1 <= len(x) <= 256 for x in value["reasons"]))


def finite(name, status, headers, raw, prepared):
    if status != 200:
        error = ReadNotAvailable("READ_NOT_AVAILABLE")
        error.http_status, error.error_code = status, None
        try:
            parsed = shared().decode(raw)
            inner = parsed.get("error", parsed) if type(parsed) is dict else None
            code = inner.get("code") if type(inner) is dict else None
            error.error_code = code if type(code) is str and re.fullmatch(r"[A-Z0-9_]{1,64}", code) else None
        except Exception:
            pass
        raise error
    body = shared().decode(raw)
    cfg, producer = prepared["config"], prepared["producer"]
    require(type(body) is dict and body.get("environment") == cfg["environment"] and
            body.get("profile_id") == cfg["profile_id"], "READ_SCOPE_MISMATCH")
    seed = name == "snapshot" and cfg.get("snapshot_expectation", "complete") == "seed_read_path"
    if name == "snapshot":
        observation = body.get("observation")
        require(type(observation) is dict and type(observation.get("scope")) is dict and
                type(observation.get("source")) is dict, "NATIVE_SNAPSHOT_UNPROVED")
        require(body.get("schema_version") == "portal.execution.profile-realtime.v1" and
                body.get("event_type") == "snapshot" and body.get("terminal") is False and
                body.get("reconnect_required") is False and body.get("workspace_id") == cfg["workspace_id"] and
                (seed or (body.get("availability") == "AVAILABLE" and body.get("freshness") == "FRESH" and
                          body.get("completeness") in ("COMPLETE", "PARTIAL"))) and
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
        if seed:
            seed_read_path_signature(body, producer)
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
    if seed:
        # Read-path proof only: never PASS, never business data, never the stage's snapshot PASS. The receipt keeps
        # the state string and only the length plus a digest of the opaque cursor, never its bytes.
        cursor = headers["x-portal-realtime-cursor"]
        return {"status": "READ_PATH_ONLY", "body_sha256": sha256(raw).hexdigest(), "bytes": len(raw), "rows": 0,
                "snapshot_mode": SEED_READ_PATH["snapshot_mode"], "relation_count": SEED_READ_PATH["relation_count"],
                "completeness": body["completeness"], "availability": body["availability"],
                "freshness": body["freshness"], "envelope_health_is_source_health": False,
                "realtime_state": headers["x-portal-realtime-state"], "cursor_length": len(cursor),
                "cursor_sha256": sha256(cursor.encode()).hexdigest()}
    quality = body if name == "snapshot" else body["source_health"]
    result = {"status": "PASS", "body_sha256": sha256(raw).hexdigest(), "bytes": len(raw),
              "rows": len(body.get("records", [])), "freshness": quality["freshness"],
              "completeness": quality["completeness"]}
    if name == "snapshot":
        # The receipt keeps the state string and only the length plus a digest of the opaque cursor, never its
        # bytes; the cursor itself may only reach the private 0600 checkpoint file.
        cursor = headers["x-portal-realtime-cursor"]
        result.update(realtime_state=headers["x-portal-realtime-state"], cursor_length=len(cursor),
                      cursor_sha256=sha256(cursor.encode()).hexdigest())
    return result


# Stage 2b relation outcomes. Core accepts BOTH a typed refusal and an empty page, recorded as such and never as a pass of
# business data. Typed = a JSON non-200 whose safe code is an Edge manager-v2 code (MANAGER_V2_*: INVALID_RELATION,
# INVALID_PAGE_LIMIT, INVALID_CURSOR, RELATION_NOT_CATALOGUED, AUTHORITY_REJECTED, SOURCE_RESPONSE_TOO_LARGE, ...) or one of
# Core's reason codes. Authorisation denials (NATIVE_MANAGER_READ_DENIED, ACCESS_DENIED) are NOT typed outcomes: they stay a FAIL.
RELATION_CORE_TYPED_CODES = ("SCOPE_CHANGED", "SOURCE_COVERAGE_UNPROVED", "SOURCE_UNAVAILABLE")


def typed_relation_refusal(status, raw):
    code = None
    try:
        parsed = shared().decode(raw)
        inner = parsed.get("error", parsed) if type(parsed) is dict else None
        value = inner.get("code") if type(inner) is dict else None
        code = value if type(value) is str and re.fullmatch(r"[A-Z0-9_]{1,64}", value) else None
    except Exception:
        pass
    if code is not None and (re.fullmatch(r"MANAGER_V2_[A-Z0-9_]{1,48}", code) or code in RELATION_CORE_TYPED_CODES):
        return {"status": "RELATION_TYPED_REFUSAL", "http_status": status, "error_code": code,
                "body_sha256": sha256(raw).hexdigest(), "rows": 0}
    return None


def relation_stage_outcome(status, headers, raw, prepared):
    if status != 200:
        refusal = typed_relation_refusal(status, raw)
        if refusal is not None:
            return refusal
        finite("relation", status, headers, raw, prepared)   # raises ReadNotAvailable: untyped answers stay a FAIL
    result = finite("relation", status, headers, raw, prepared)   # schema, authority, relation pin, records <= limit
    body = shared().decode(raw)
    page = body.get("page")
    has_more = None
    if page is not None:   # consistency only: no continuation is ever followed (no R03), the next cursor is never recorded
        require(type(page) is dict and type(page.get("has_more")) is bool, "NATIVE_PAGE_UNPROVED")
        next_cursor = page.get("next_cursor")
        require((next_cursor is None and page["has_more"] is False) or
                (cursor_valid(next_cursor) and page["has_more"] is True and body["records"]), "NATIVE_PAGE_UNPROVED")
        has_more = page["has_more"]
    return {"status": "RELATION_PAGE_OBSERVED", "body_sha256": result["body_sha256"], "bytes": result["bytes"],
            "rows": result["rows"], "freshness": result["freshness"], "completeness": result["completeness"],
            "has_more": has_more}


# Stage 2c (relation_walk): a fixed allowlist of Core relation routes and the selected primary key of each, from the installed
# catalogue (edge-m0-r2-20261112/relation-catalogue.json, seal 6d4c4a65...: key.selected.columns). Keys are only ever hashed.
WALK_RELATIONS = {"account_balances": {"route": "account-balances", "key": ("account_id", "currency")},
                  "portfolios": {"route": "portfolios", "key": ("portfolio_id",)},
                  "venues": {"route": "venues", "key": ("venue",)},
                  "instruments": {"route": "instruments", "key": ("instrument_id",)},
                  "command_journal": {"route": "command-journal", "key": ("command_id",)}}
WALK_BOUNDS = {"limit": (1, 200), "max_pages": (1, 20), "max_rows": (1, 1000)}


def walk_spec(value):
    """Validate the relation_walk list: fixed allowlist, bounded limits/pages/rows, total requests <= 20."""
    require(type(value) is list and 1 <= len(value) <= len(WALK_RELATIONS), "RELATION_WALK_INVALID")
    seen, total = set(), 0
    for entry in value:
        require(type(entry) is dict and set(entry) == {"relation", "limit", "max_pages", "max_rows"} and
                entry["relation"] in WALK_RELATIONS and entry["relation"] not in seen, "RELATION_WALK_INVALID")
        seen.add(entry["relation"])
        for key, (low, high) in WALK_BOUNDS.items():
            require(type(entry[key]) is int and low <= entry[key] <= high, "RELATION_WALK_INVALID")
        total += entry["max_pages"]
    require(total <= 20, "RELATION_WALK_INVALID")   # worst-case request count of the whole run
    return value


def walk_route_name(entry):
    return f"relation_walk:{entry['relation']}:{entry['limit']}"


def keyset_sha256(keys):
    """Canonical keyset digest: sha256 of json.dumps(sorted(keys), separators=(',', ':')) (ensure_ascii default), UTF-8, where
    each key is str(value) of the selected key column, or the values of a composite key joined by U+0000 in catalogue order."""
    return sha256(json.dumps(sorted(keys), separators=(",", ":")).encode("utf-8")).hexdigest()


def walk_one_relation(entry, p, request, pause):
    """Walk the pages of one relation (R03 rules). Cursors and keys stay in memory; the receipt gets hashes only."""
    columns = WALK_RELATIONS[entry["relation"]]["key"]
    walk_prepared = dict(p, config={**p["config"], "limit": entry["limit"]})
    name, cursor = walk_route_name(entry), None
    keys, seen_cursors, hashes, pages, terminal, last = set(), set(), [], 0, False, None
    while pages < entry["max_pages"]:
        pause()
        status, headers, raw = request(name, cursor)
        if status != 200:
            refusal = typed_relation_refusal(status, raw)
            if refusal is not None:
                return {**refusal, "after_pages": pages}
            finite("relation", status, headers, raw, walk_prepared)   # raises ReadNotAvailable: untyped answers stay a FAIL
        result = finite("relation", status, headers, raw, walk_prepared)   # schema, authority, pin, records <= limit
        body = shared().decode(raw)
        page, records = body.get("page"), body["records"]
        require(type(page) is dict and type(page.get("has_more")) is bool, "R03_PAGE_INVALID")
        next_cursor = page.get("next_cursor")
        require((next_cursor is None and page["has_more"] is False) or
                (cursor_valid(next_cursor) and page["has_more"] is True), "R03_CURSOR_INVALID")
        require(not page["has_more"] or records, "R03_EMPTY_CONTINUATION")
        for record in records:
            values = record.get("values") if type(record) is dict else None
            require(type(values) is dict and all(column in values for column in columns), "WALK_KEY_UNAVAILABLE")
            parts = [values[column] for column in columns]
            require(all(type(part) in (str, int) and type(part) is not bool and part != "" for part in parts),
                    "WALK_KEY_UNAVAILABLE")
            key = "\u0000".join(str(part) for part in parts)
            require(key not in keys, "R03_DUPLICATE_IDENTITY")
            require(len(keys) < entry["max_rows"], "R03_ROW_BOUND_EXCEEDED")
            keys.add(key)
        hashes.append(sha256(raw).hexdigest())
        pages += 1
        last = result
        if next_cursor is None:
            terminal = True
            break
        require(next_cursor not in seen_cursors, "R03_CURSOR_CYCLE")
        seen_cursors.add(next_cursor)
        cursor = next_cursor
    return {"status": "RELATION_WALK_OBSERVED", "pages": pages, "rows": len(keys), "terminal_page": terminal,
            "more_than_one_page": pages > 1, "page_body_sha256": hashes, "limit": entry["limit"],
            "completeness": last["completeness"], "freshness": last["freshness"],
            "key_columns": list(columns), "keyset_sha256": keyset_sha256(keys)}


# Stage 2d (relation_sweep): the 31 screen-bound relation routes of tuple A. DATA-DRIVEN: "route" is Core's registry route_id
# (generated registry, operations[].route_id; all 31 equal the hyphenated table name) and "key" is the catalogue's selected key
# (key.selected.columns); the three relations whose selected key is PENDING_QUERY_KEY (account_sync_effective,
# broker_account_sync_effective, risk_profiles) have no key and no keyset hash. A name or key fix is a one-line change here.
SWEEP_RELATIONS = {
    'account_balances': {"route": 'account-balances', "key": ('account_id', 'currency')},
    'account_policies': {"route": 'account-policies', "key": ('account_policy_id',)},
    'account_reservations': {"route": 'account-reservations', "key": ('reservation_id',)},
    'account_sync_current_state': {"route": 'account-sync-current-state', "key": ('account_id',)},
    'account_sync_effective': {"route": 'account-sync-effective', "key": ()},
    'account_sync_snapshots': {"route": 'account-sync-snapshots', "key": ('sync_id',)},
    'accounts': {"route": 'accounts', "key": ('account_id',)},
    'broker_account_sync_current_state': {"route": 'broker-account-sync-current-state', "key": ('venue', 'mode', 'external_account_ref')},
    'broker_account_sync_effective': {"route": 'broker-account-sync-effective', "key": ()},
    'broker_account_sync_snapshots': {"route": 'broker-account-sync-snapshots', "key": ('sync_id',)},
    'broker_sync_state_history': {"route": 'broker-sync-state-history', "key": ('history_id',)},
    'broker_sync_valuation_current_state': {"route": 'broker-sync-valuation-current-state', "key": ('scope_type', 'scope_key', 'mode', 'venue')},
    'broker_sync_valuation_history': {"route": 'broker-sync-valuation-history', "key": ('scope_type', 'scope_key', 'mode', 'venue', 'bucket_start')},
    'command_journal': {"route": 'command-journal', "key": ('command_id',)},
    'conditional_order_groups': {"route": 'conditional-order-groups', "key": ('group_id',)},
    'execution_sessions': {"route": 'execution-sessions', "key": ('execution_session_id',)},
    'fills': {"route": 'fills', "key": ('fill_id', 'trade_time')},
    'instruments': {"route": 'instruments', "key": ('instrument_id',)},
    'operator_operations': {"route": 'operator-operations', "key": ('operation_id',)},
    'order_brackets': {"route": 'order-brackets', "key": ('bracket_group_id',)},
    'orders': {"route": 'orders', "key": ('order_id',)},
    'portfolio_allocations': {"route": 'portfolio-allocations', "key": ('allocation_id',)},
    'portfolio_capital_ledger': {"route": 'portfolio-capital-ledger', "key": ('capital_ledger_id',)},
    'portfolios': {"route": 'portfolios', "key": ('portfolio_id',)},
    'positions_v2': {"route": 'positions-v2', "key": ('position_id',)},
    'reconciliation_findings': {"route": 'reconciliation-findings', "key": ('finding_id',)},
    'risk_grants': {"route": 'risk-grants', "key": ('risk_grant_id',)},
    'risk_profiles': {"route": 'risk-profiles', "key": ()},
    'sizing_decisions': {"route": 'sizing-decisions', "key": ('decision_id',)},
    'strategy_deployments': {"route": 'strategy-deployments', "key": ('deployment_id',)},
    'venues': {"route": 'venues', "key": ('venue',)},
}
SWEEP_DEFAULT_LIMIT = 50


def sweep_spec(value):
    """Validate relation_sweep: a list of relation names (or {relation, limit}) from the allowlist; returns [(relation, limit)]."""
    require(type(value) is list and 1 <= len(value) <= len(SWEEP_RELATIONS), "RELATION_SWEEP_INVALID")
    out, seen = [], set()
    for entry in value:
        if type(entry) is str:
            entry = {"relation": entry}
        require(type(entry) is dict and set(entry) in ({"relation"}, {"relation", "limit"}) and
                type(entry["relation"]) is str and entry["relation"] in SWEEP_RELATIONS and
                entry["relation"] not in seen, "RELATION_SWEEP_INVALID")
        limit = entry.get("limit", SWEEP_DEFAULT_LIMIT)
        require(type(limit) is int and 1 <= limit <= 200, "RELATION_SWEEP_INVALID")
        seen.add(entry["relation"])
        out.append((entry["relation"], limit))
    return out


def sweep_route_name(entry):
    relation, limit = sweep_spec([entry])[0]
    return f"relation_sweep:{relation}:{limit}"


def sweep_one_relation(relation, limit, p, request):
    """Exactly ONE request for one relation; a continuation is noted (has_more), never followed. Hashes only."""
    columns = SWEEP_RELATIONS[relation]["key"]
    swept_prepared = dict(p, config={**p["config"], "limit": limit})
    status, headers, raw = request(f"relation_sweep:{relation}:{limit}", None)
    if status != 200:
        refusal = typed_relation_refusal(status, raw)
        if refusal is not None:
            return refusal
        finite("relation", status, headers, raw, swept_prepared)   # raises ReadNotAvailable: untyped answers stay a FAIL
    result = finite("relation", status, headers, raw, swept_prepared)   # schema, authority, pin, records <= limit
    body = shared().decode(raw)
    page, records = body.get("page"), body["records"]
    require(type(page) is dict and type(page.get("has_more")) is bool, "R03_PAGE_INVALID")
    next_cursor = page.get("next_cursor")
    require((next_cursor is None and page["has_more"] is False) or
            (cursor_valid(next_cursor) and page["has_more"] is True and records), "R03_CURSOR_INVALID")
    keys = set()
    for record in records:
        require(type(record) is dict, "SWEEP_RECORD_INVALID")
        if columns:
            values = record.get("values")
            require(type(values) is dict and all(column in values for column in columns), "WALK_KEY_UNAVAILABLE")
            parts = [values[column] for column in columns]
            require(all(type(part) in (str, int) and type(part) is not bool and part != "" for part in parts),
                    "WALK_KEY_UNAVAILABLE")
            key = "\u0000".join(str(part) for part in parts)
            require(key not in keys, "R03_DUPLICATE_IDENTITY")
            keys.add(key)
    return {"status": "RELATION_PAGE_OBSERVED", "pages": 1, "rows": len(records), "has_more": page["has_more"],
            "completeness": result["completeness"], "freshness": result["freshness"],
            "body_sha256": sha256(raw).hexdigest(), "limit": limit, "key_columns": list(columns),
            "keyset_sha256": keyset_sha256(keys) if columns else None}


def relation_sweep_baseline(config, p, receipt, request, checkpoint_sink):
    spec = sweep_spec(config["relation_sweep"])
    for relation, _ in spec:
        receipt["cases"]["sweep_" + relation] = {"status": "NOT_RUN"}
    receipt["cases"]["cursor_resume"] = {"status": "NOT_RUN", "reason": "STREAM_SCOPE_NOT_IN_RELATION_SWEEP"}
    first_hash = None
    for index, (relation, limit) in enumerate(spec):
        if index:
            time.sleep(config["read_spacing_seconds"])   # before EVERY request after the first
        outcome = sweep_one_relation(relation, limit, p, request)
        receipt["cases"]["sweep_" + relation] = outcome   # a finished relation is kept even if a later one fails
        first_hash = first_hash or outcome["body_sha256"]
    if checkpoint_sink is not None:
        # No snapshot cursor in this scope: cursorless checkpoint (accepted by post_revoke for relation_sweep only).
        checkpoint_sink({"schema_version": "portal.execution.connected-read-baseline.v1",
            "scope_sha256": p["scope"], "producer_sha256": config["core_return"]["sha256"],
            "policy_revision": p["producer"]["policy_revision"],
            "manager_grant_revision": p["producer"]["manager_grant_revision"],
            "native_revision": p["producer"]["native_revision"], "prime_body_sha256": first_hash,
            "read_authorized": p["producer"]["read_authorized"],
            "stream_authorized": p["producer"]["stream_authorized"],
            "at_utc": datetime.now(timezone.utc).isoformat()})


def relation_walk_baseline(config, p, receipt, request, checkpoint_sink):
    spec = config["relation_walk"]
    for entry in spec:
        receipt["cases"]["walk_" + entry["relation"]] = {"status": "NOT_RUN"}
    receipt["cases"]["cursor_resume"] = {"status": "NOT_RUN", "reason": "STREAM_SCOPE_NOT_IN_RELATION_WALK"}
    sent = []
    def pause():   # spacing between EVERY request of the run, including successive pages and relations
        if sent:
            time.sleep(config["read_spacing_seconds"])
        sent.append(True)
    first_hash = None
    for entry in spec:
        outcome = walk_one_relation(entry, p, request, pause)
        receipt["cases"]["walk_" + entry["relation"]] = outcome   # a finished relation is kept even if a later one fails
        if first_hash is None:
            first_hash = (outcome["page_body_sha256"][0] if outcome["status"] == "RELATION_WALK_OBSERVED" and
                          outcome["page_body_sha256"] else outcome.get("body_sha256"))
    if checkpoint_sink is not None and first_hash is not None:
        # No snapshot cursor exists in this scope: the checkpoint is cursorless, like stage 1; post_revoke accepts that
        # for relation_walk only. prime_body_sha256 is the first walked body; there is no repeat_read.
        checkpoint_sink({"schema_version": "portal.execution.connected-read-baseline.v1",
            "scope_sha256": p["scope"], "producer_sha256": config["core_return"]["sha256"],
            "policy_revision": p["producer"]["policy_revision"],
            "manager_grant_revision": p["producer"]["manager_grant_revision"],
            "native_revision": p["producer"]["native_revision"], "prime_body_sha256": first_hash,
            "read_authorized": p["producer"]["read_authorized"],
            "stream_authorized": p["producer"]["stream_authorized"],
            "at_utc": datetime.now(timezone.utc).isoformat()})


def stream_stage_streams(config, p, receipt, request, cursor):
    """STREAM window: first stream with the snapshot cursor until its first notice, then the resume with that notice's cursor
    until one MORE notice. PASS only for notices actually observed; a quiet stream, timeout, EOF or replay is NOT_RUN with the
    reason. Receipts keep frames/notices/bytes/termination only: no frame body, no cursor."""
    def read(case, resume_cursor):
        status, headers, stream = request("stream", resume_cursor, True)
        if status != 200:
            finite("stream", status, headers, stream if isinstance(stream, bytes) else b"", p)   # ReadNotAvailable with status/code
        require(type(stream) is dict, "STREAM_NOT_AVAILABLE")
        return stream
    def counts(stream):
        return {"frames": stream["frames"], "notices": stream["notices"], "bytes": stream["bytes"],
                "termination": stream["termination"]}
    time.sleep(config["read_spacing_seconds"])   # let the snapshot's native attempt retire before a stream frame takes one
    first = read("stream_notice", cursor)
    receipt["cases"]["stream_notice"] = {"status": "PASS" if first["notices"] else "NOT_RUN", **counts(first)}
    if not first["notices"]:
        receipt["cases"]["stream_notice"]["reason"] = "NO_NOTICE_" + first["termination"]
        receipt["cases"]["cursor_resume"] = {"status": "NOT_RUN", "reason": "FIRST_STREAM_NO_NOTICE"}
        return
    time.sleep(config["read_spacing_seconds"])   # one unresolved native attempt at a time
    resumed = read("cursor_resume", first["cursor"])
    outcome = {"status": "PASS", **counts(resumed)}
    if not resumed["notices"]:
        outcome.update(status="NOT_RUN", reason="NO_NOTICE_" + resumed["termination"])
    elif resumed["cursor"] == first["cursor"]:   # the same notice again is a replay, not a resumed one
        outcome.update(status="NOT_RUN", reason="RESUME_REPLAYED_SAME_NOTICE")
    receipt["cases"]["cursor_resume"] = outcome


def stream_hold_stage(config, p, receipt, request, cursor, hold):
    """Stage 2f, active-stream revocation: ONE stream opened with the snapshot cursor and kept open. After ``min_notices`` notices the
    StreamHold wrote the public signal file; Core then revokes ONLY the stream.subscribe grant and the stream must end by itself.
    The receipt keeps counts, timings, the end kind and the public portal_observed_at_ms of each notice (for the causation comparison
    with Core's published bump times): no frame body, no cursor, no key. A stream still open after the bound is a FAIL case, never a
    pass; timing and EOF are client facts, not correlated official final-egress proof."""
    time.sleep(config["read_spacing_seconds"])   # let the snapshot's native attempt retire before a stream frame takes one
    status, headers, stream = request("stream", cursor, True)
    ended = time.monotonic()
    if status != 200:
        finite("stream", status, headers, stream if isinstance(stream, bytes) else b"", p)
    require(type(stream) is dict and type(stream.get("observation")) is dict, "STREAM_NOT_AVAILABLE")
    obs = stream["observation"]
    counts = {"frames": stream["frames"], "notices": stream["notices"], "bytes": stream["bytes"], "termination": stream["termination"]}
    observed = [f.get("portal_observed_at_ms") for f in obs["frame_observations"] if f["event_type"] == "revalidate"]
    receipt["cases"]["stream_notice"] = {"status": "PASS" if stream["notices"] else "NOT_RUN", **counts,
                                         "portal_observed_at_ms": observed}
    if hold.signal_mono is None:
        receipt["cases"]["active_stream_revocation"] = {"status": "NOT_RUN", "reason": "FEWER_NOTICES_THAN_REQUIRED_" + stream["termination"],
                                                        "min_notices": hold.min_notices}
        receipt["cases"]["cursor_resume"] = {"status": "NOT_RUN", "reason": "NOT_IN_THIS_RUN"}
        return
    event = obs.get("terminal_event")
    kind = ("ACCESS_REVOKED_FRAME" if stream["termination"] == "TERMINAL" and event == "access_revoked" else
            "CLOSED_BY_SERVER" if stream["termination"] == "EOF" else None)
    case = {"signal_utc": hold.signal_utc, "signal_after_stream_start_ms": max(0, int((hold.signal_mono - hold.stream_started_mono) * 1000)),
            "notices_before_signal": hold.notices_before_signal, "notices_after_signal": stream["notices"] - hold.notices_before_signal,
            "ended_after_signal_ms": max(0, int((ended - hold.signal_mono) * 1000)), "bound_ms": hold.max_after * 1000,
            "termination": stream["termination"], "client_fact_not_final_egress_proof": True}
    if kind is None:
        case.update(status="FAIL", reason=("STREAM_ENDED_BY_OTHER_TERMINAL_" + str(event).upper()) if stream["termination"] == "TERMINAL"
                    else "STREAM_NOT_TERMINATED_AFTER_SIGNAL")
    else:
        case.update(status="PASS", end_kind=kind)
        if case["ended_after_signal_ms"] > case["bound_ms"]:
            case.update(status="FAIL", reason="STREAM_ENDED_AFTER_BOUND")
    receipt["cases"]["active_stream_revocation"] = case
    receipt["cases"]["cursor_resume"] = {"status": "NOT_RUN", "reason": "NOT_IN_THIS_RUN"}


def bounded_deployment_pages(prepared, request):
    """Observe one bounded Core deployment scan; never infer source completeness.

    Identifiers and cursors remain in memory. A digest is useful for later
    correlation with a separately obtained, same-scope source oracle, but is not
    itself proof of an atomic snapshot, source ACK, R02 or R03 acceptance.
    """
    config, bounds = prepared["config"], prepared["config"]["bounded_page_probe"]
    seen_ids, seen_cursors = set(), set()
    total_bytes = pages = 0
    cursor = None
    complete_terminal = False
    while pages < bounds["max_pages"]:
        status, headers, raw = request("deployments", cursor)
        require(len(raw) <= config["max_bytes"], "R03_PAGE_BYTE_BOUND_EXCEEDED")
        finite("deployments", status, headers, raw, prepared)
        total_bytes += len(raw)
        require(total_bytes <= bounds["max_total_bytes"], "R03_BYTE_BOUND_EXCEEDED")
        body = shared().decode(raw)
        page, records = body.get("page"), body["records"]
        require(type(page) is dict and type(page.get("has_more")) is bool and
                page.get("truncated") is False and page.get("total_unknown") is True and
                type(page.get("maximum_page_rows")) is int and
                1 <= page["maximum_page_rows"] <= 200 and
                len(records) <= page["maximum_page_rows"] and
                type(page.get("maximum_response_bytes")) is int and
                1 <= page["maximum_response_bytes"] <= MAX_BYTES and
                len(raw) <= page["maximum_response_bytes"],
                "R03_PAGE_INVALID")
        next_cursor = page.get("next_cursor")
        require((next_cursor is None and page["has_more"] is False) or
                (cursor_valid(next_cursor) and page["has_more"] is True), "R03_CURSOR_INVALID")
        require(not page["has_more"] or records, "R03_EMPTY_CONTINUATION")
        for record in records:
            require(type(record) is dict and type(record.get("deployment_id")) is str and
                    1 <= len(record["deployment_id"].encode("utf-8")) <= 4096 and
                    all(ord(ch) >= 32 and ord(ch) != 127 for ch in record["deployment_id"]),
                    "R03_IDENTITY_INVALID")
            identity = record["deployment_id"]
            require(identity not in seen_ids, "R03_DUPLICATE_IDENTITY")
            require(len(seen_ids) < bounds["max_rows"], "R03_ROW_BOUND_EXCEEDED")
            seen_ids.add(identity)
        pages += 1
        if next_cursor is None:
            complete_terminal = body["source_health"]["completeness"] == "COMPLETE"
            break
        require(next_cursor not in seen_cursors, "R03_CURSOR_CYCLE")
        seen_cursors.add(next_cursor)
        cursor = next_cursor
    identities = json.dumps(sorted(seen_ids), ensure_ascii=False,
                            separators=(",", ":")).encode("utf-8")
    return {"status": "OBSERVED_NOT_PROVEN", "dataset": "strategy_deployments",
            "pages": pages, "rows": len(seen_ids), "bytes": total_bytes,
            "more_than_one_page": pages > 1, "terminal_page": next_cursor is None,
            "terminal_source_complete": complete_terminal,
            "identity_digest_algorithm": "sha256-canonical-json-sorted-utf8-v1",
            "identity_digest": sha256(identities).hexdigest(),
            "source_oracle": "NOT_CORRELATED", "source_ack": "NOT_CORRELATED"}


def run(config, transport_factory=Transport, checkpoint_sink=None):
    receipt = {"schema_version": "portal.execution.connected-read-result.v1", "status": "NOT_READY",
        "full_08": "NOT_MET", "full_09": "NOT_MET", "mutations": 0, "requests": 0,
        "cases": {name: {"status": "NOT_RUN"} for name in CASES}}
    try:
        p = prepare(config)
        receipt.update(producer_sha256=config["core_return"]["sha256"], scope_sha256=p["scope"])
        if config.get("session_margin_seconds", 0):
            receipt["session_margin_seconds"] = config["session_margin_seconds"]
        if config.get("read_scope", "full") != "full":
            receipt["read_scope"] = config["read_scope"]
        if p["session_evidence_class"] is not None:
            receipt["session_evidence_class"] = p["session_evidence_class"]
        transport = transport_factory(p)
        hold = StreamHold(config["stream_hold"]) if "stream_hold" in config else None
        if hold is not None:
            transport.hold = hold
        def request(name, cursor=None, stream=False):
            receipt["requests"] += 1
            return transport.request(name, cursor, stream=stream)
        if "bounded_page_probe" in config:
            receipt["cases"]["r03_deployment_pages"] = bounded_deployment_pages(p, request)
            receipt["status"] = "SCOPED_OBSERVATIONS_ONLY"
            return receipt
        if config["stage"] == "baseline" and config.get("read_scope", "full") == "relation_walk":
            relation_walk_baseline(config, p, receipt, request, checkpoint_sink)
            receipt["status"] = "SCOPED_OBSERVATIONS_ONLY"
            return receipt
        if config["stage"] == "baseline" and config.get("read_scope", "full") == "relation_sweep":
            relation_sweep_baseline(config, p, receipt, request, checkpoint_sink)
            receipt["status"] = "SCOPED_OBSERVATIONS_ONLY"
            return receipt
        if config["stage"] == "post_revoke":
            if p["revoke"]["authority"] == "PM_NATIVE_READ":
                # PM refusal after Core hijack may destroy HTTP without bytes. A
                # generic EOF/timeout is not native DENIED proof; the owning
                # attempt/receipt observer must correlate that separate drill.
                receipt["reason"] = "PM_DENIAL_REQUIRES_CORRELATED_OWNER_RECEIPT"
                return receipt
            if p["revoke_action"] == "stream.subscribe" and config.get("read_scope", "full") == "stream_stage":
                # One READ read must survive the STREAM revoke (the snapshot: this scope read no deployments), then the revoked
                # STREAM grant must be refused without and with the baseline cursor; every request paced (one unresolved lease).
                status, headers, raw = request("snapshot")
                receipt["cases"]["post_revoke_stream_read_preserved"] = {
                    "status": "PASS", "snapshot": finite("snapshot", status, headers, raw, p)}
                for case, cursor in (("post_revoke_stream", None), ("post_revoke_cursor", p["prior"]["cursor"])):
                    time.sleep(config["read_spacing_seconds"])
                    status, _, raw = request("stream", cursor)
                    body = shared().decode(raw)
                    error = body.get("error", body) if type(body) is dict else None
                    require(status == 403 and type(error) is dict and error.get("code") in
                            ("ACCESS_DENIED", "EXECUTION_READ_SCOPE_REQUIRED"), "REVOKED_STREAM_NOT_DENIED")
                    receipt["cases"][case] = {"status": "PASS", "http_status": status,
                        "body_sha256": sha256(raw).hexdigest()}
                receipt["status"] = "SCOPED_OBSERVATIONS_ONLY"
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
                    require(status == 403 and type(error) is dict and error.get("code") in
                            ("ACCESS_DENIED", "EXECUTION_READ_SCOPE_REQUIRED"),
                            "REVOKED_STREAM_NOT_DENIED")
                    receipt["cases"][case] = {"status": "PASS", "http_status": status,
                        "body_sha256": sha256(raw).hexdigest()}
                receipt["status"] = "SCOPED_OBSERVATIONS_ONLY"
                return receipt
            for case, name, cursor in (("post_revoke_read", walk_route_name(config["relation_walk"][0])
                                        if config.get("read_scope", "full") == "relation_walk" else
                                        sweep_route_name(config["relation_sweep"][0])
                                        if config.get("read_scope", "full") == "relation_sweep" else "deployments", None),
                                      ("post_revoke_cursor", "stream", p["prior"].get("cursor")))[
                    :1 if config.get("read_scope", "full") in ("deployments_only", "snapshot_stage", "snapshot_only", "relation_stage",
                                                              "relation_walk", "relation_sweep") else 2]:
                status, _, raw = request(name, cursor)
                body = shared().decode(raw)
                code = (body.get("error", body).get("code") if type(body) is dict and
                    type(body.get("error", body)) is dict else None)
                allowed = ({403: ("NATIVE_MANAGER_READ_DENIED", "ACCESS_DENIED"),
                            404: ("WORKSPACE_NOT_FOUND",)} if name == "deployments" or name.startswith(("relation_walk:", "relation_sweep:")) else
                           {403: ("NATIVE_MANAGER_READ_DENIED", "ACCESS_DENIED",
                                  "EXECUTION_READ_SCOPE_REQUIRED"),
                            409: ("SCOPE_CHANGED", "CURSOR_INVALID_OR_EXPIRED")})
                require(code in allowed.get(status, ()),
                        "REVOKED_ACCESS_NOT_DENIED")
                receipt["cases"][case] = {"status": "PASS", "http_status": status,
                    "body_sha256": sha256(raw).hexdigest()}
            if p["cache_proof"] is not None:
                # A scoped 404 or invalidated cursor409 alone cannot establish
                # current authorization denial of an existing cached entry.
                require(all(receipt["cases"][name]["http_status"] == 403
                            for name in ("post_revoke_read", "post_revoke_cursor")),
                        "CACHE_REVOKE_DENIAL_NOT_PROVED")
                receipt["cases"]["cache_revocation"] = p["cache_proof"]
        else:
            finite_results = {}
            scope = config.get("read_scope", "full")
            stage1 = scope == "deployments_only"
            keep = scope != "full"   # narrow scopes keep a pass in the receipt even if a later case fails
            if config.get("snapshot_expectation") == "seed_read_path":
                receipt["cases"]["snapshot_read_path"] = {"status": "NOT_RUN"}
            carried_cases = {}
            if scope == "snapshot_only":   # ONE request: the snapshot; deployments/repeat are carried, not re-read, not PASS
                sha = config["carry_forward_result"]["sha256"]
                carried_cases = {case: {"status": "CARRIED_PASS", "carried_from_result_sha256": sha,
                                        "body_sha256": p["carried"]["cases"][case]["body_sha256"]}
                                 for case in ("deployments", "repeat_read")}
                receipt["cases"].update(carried_cases)
                receipt["carried_from_result_sha256"] = sha
                plan = (("snapshot_read_path", "snapshot"),)
            elif scope == "stream_stage":   # the STREAM window: only the snapshot here (its cursor feeds the stream), then the streams
                plan = (("snapshot_read_path" if config.get("snapshot_expectation") == "seed_read_path" else "snapshot",
                         "snapshot"),)
            elif scope == "relation_stage":   # stage 2b: deployments, relation (account balances), seed snapshot; no repeat_read
                plan = (("deployments", "deployments"), ("relation", "relation"), ("snapshot_read_path", "snapshot"))
            elif stage1:
                plan = (("deployments", "deployments"), ("repeat_read", "deployments"))
            elif scope == "snapshot_stage":   # stage 2a: no relation by construction, whatever the ready doc pins
                plan = (("deployments", "deployments"), ("repeat_read", "deployments"),
                        ("snapshot_read_path" if config.get("snapshot_expectation") == "seed_read_path" else "snapshot",
                         "snapshot"))
            else:
                plan = (("deployments", "deployments"), ("relation", "relation"),
                        ("repeat_read", "deployments"), ("snapshot", "snapshot"))
            for case, name in plan:
                if name == "relation" and not pin(p["producer"].get("relation_catalogue_sha256")):
                    continue  # A deployment source does not imply a separately selected relation source.
                if finite_results and config.get("read_spacing_seconds", 0):
                    time.sleep(config["read_spacing_seconds"])   # one unresolved native read at a time: let the previous retire
                status, headers, raw = request(name)
                finite_results[case] = (relation_stage_outcome(status, headers, raw, p)
                                        if scope == "relation_stage" and name == "relation"
                                        else finite(name, status, headers, raw, p))
                if keep:   # narrow scopes keep a pass even if a later case fails; the full scope never credits finite JSON before the snapshot proof
                    receipt["cases"][case] = finite_results[case]
            # Unchanged V1 JSON cannot prove native selection by itself. Do not
            # credit those finite observations before the native snapshot proof.
            receipt["cases"].update(finite_results)
            if scope in ("snapshot_stage", "snapshot_only", "relation_stage"):   # 2a/2b have no STREAM scope, so cursor_resume is recorded as not run, with the reason
                receipt["cases"]["cursor_resume"] = {"status": "NOT_RUN", "reason": "STREAM_SCOPE_NOT_IN_STAGE_2A"}
            cursor = None if stage1 else headers["x-portal-realtime-cursor"]
            if checkpoint_sink is not None:
                checkpoint = {"schema_version": "portal.execution.connected-read-baseline.v1",
                    "scope_sha256": p["scope"], "producer_sha256": config["core_return"]["sha256"],
                    "policy_revision": p["producer"]["policy_revision"],
                    "manager_grant_revision": p["producer"]["manager_grant_revision"],
                    "native_revision": p["producer"]["native_revision"],
                    "prime_body_sha256": ({**carried_cases, **finite_results}.get("deployments") or
                                          next(iter(finite_results.values())))["body_sha256"],
                    "read_body_sha256": ({**carried_cases, **finite_results}.get("repeat_read") or {}).get("body_sha256"),
                    "read_authorized": p["producer"]["read_authorized"],
                    "stream_authorized": p["producer"]["stream_authorized"],
                    "at_utc": datetime.now(timezone.utc).isoformat()}
                if checkpoint["read_body_sha256"] is None:   # relation_stage has no repeat_read; nothing consumes the field
                    del checkpoint["read_body_sha256"]
                if cursor is not None:
                    checkpoint["cursor"] = cursor
                if "stream_grant_id" in p["producer"]:
                    checkpoint.update({k: p["producer"][k] for k in
                                       ("stream_grant_id", "stream_grant_revision")})
                checkpoint_sink(checkpoint)
            if scope == "stream_stage" and hold is not None:
                stream_hold_stage(config, p, receipt, request, cursor, hold)
            elif scope == "stream_stage":
                stream_stage_streams(config, p, receipt, request, cursor)
            elif config["probe_stream"] and p["producer"]["stream_authorized"]:
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
        if isinstance(error, ReadNotAvailable):
            receipt["http_status"] = error.http_status
            if error.error_code is not None:
                receipt["error_code"] = error.error_code
            if getattr(error, "content_type", None) is not None:
                receipt["content_type"] = error.content_type
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
