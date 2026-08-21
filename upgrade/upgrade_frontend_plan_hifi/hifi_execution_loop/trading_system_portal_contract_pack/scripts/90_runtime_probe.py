#!/usr/bin/env python3
"""90_runtime_probe.py — CONFIRMED_RUNTIME evidence from safe GET probes.

Two probe classes, both read-only:

  A. PUBLIC endpoints (no credential): full response captured, then reduced to a
     TYPE SKELETON (keys + value types, values dropped) so nothing sensitive can
     leak into the pack. Scalar values are kept only for a small allowlist of
     non-sensitive contract fields (status, version, rollout_state, ...).

  B. PROTECTED endpoints probed WITHOUT any credential. The purpose is to capture
     the *rejection contract* (status code, body shape, headers) — which is itself
     contract evidence — and to prove the auth gate is enforced. No credential is
     read, held or sent.

Also records the contract-negotiation headers on every response and probes an
unsupported `X-Trading-Contract-Revision` to capture the 406 shape.

NEVER issues POST/PUT/PATCH/DELETE. Refuses to run if asked to.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import EVIDENCE_DIR, provenance, write_json  # noqa: E402

GW = "http://127.0.0.1:8000"
DL = "http://127.0.0.1:8100"

# Values safe to keep verbatim: contract/negotiation facts, never business data.
KEEP_VALUES = {
    "status", "openapi", "version", "title", "rollout_state", "venue", "product",
    "mode", "adapter", "supported_modes", "position_modes", "credential_scope",
    "rate_limit_scope", "time_sync_scope", "execution_available",
    "market_data_available", "private_events_available", "account_sync_available",
    "reconciliation_available", "reason", "code", "detail", "requested_revision",
    "supported_revisions", "authoritative_revision", "schema_version",
    "canonical_contract_version", "revision", "service", "service_name", "rollout",
    "state", "kind", "type", "severity", "enabled", "circuit_open", "fresh",
    "market", "currency", "base_currency", "settlement_policy", "calendar",
}

PUBLIC_PROBES = [
    ("gw_health", f"{GW}/v1/health"),
    ("gw_capabilities", f"{GW}/v1/health/capabilities"),
    ("gw_contracts", f"{GW}/v1/contracts"),
    ("gw_health_legacy", f"{GW}/health"),
    ("gw_openapi_info", f"{GW}/openapi.json"),
    ("dl_health", f"{DL}/v1/health"),
    ("dl_openapi_info", f"{DL}/openapi.json"),
]

# Probed WITHOUT credentials on purpose — captures the rejection contract only.
UNAUTH_PROBES = [
    ("admin_no_token", f"{GW}/v1/admin/portfolios"),
    ("admin_events_no_token", f"{GW}/v1/admin/events"),
    ("alpha_no_key_unknown_alpha", f"{GW}/v1/orders?alpha_id=portal_probe_nonexistent"),
    ("alpha_positions_no_alpha_id", f"{GW}/v1/positions"),
    ("alpha_events_no_alpha", f"{GW}/v1/events?alpha_id=portal_probe_nonexistent"),
    ("unknown_path", f"{GW}/v1/portal-probe-unknown-path"),
]

HEADER_PROBES = [
    ("unsupported_revision", f"{GW}/v1/health",
     ["-H", "X-Trading-Contract-Revision: portal-probe-v99"]),
    ("supported_revision_v1", f"{GW}/v1/health",
     ["-H", "X-Trading-Contract-Revision: v1"]),
]


def curl(url: str, extra: list[str] | None = None) -> dict:
    """GET only. Returns status, headers and parsed body."""
    sep = "\n<<<PORTAL-PROBE-SPLIT>>>\n"
    cmd = ["curl", "-s", "-S", "--max-time", "15", "-X", "GET", "-D", "-",
           "-o", "-", "-w", f"{sep}%{{http_code}}", *(extra or []), url]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    raw = r.stdout
    code = raw.rsplit(sep, 1)[1].strip() if sep in raw else ""
    head_body = raw.rsplit(sep, 1)[0]
    parts = head_body.split("\r\n\r\n", 1)
    if len(parts) == 1:
        parts = head_body.split("\n\n", 1)
    headers_raw, body = (parts + [""])[:2]
    headers = {}
    for ln in headers_raw.splitlines():
        if ":" in ln:
            k, v = ln.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    try:
        parsed = json.loads(body)
    except Exception:
        parsed = {"__non_json_body__": body[:400]}
    return {"http_status": code, "headers": headers, "body": parsed,
            "body_bytes": len(body)}


def skeleton(value, key: str | None = None, depth: int = 0):
    """Reduce a response to types; keep values only for allowlisted contract keys."""
    if depth > 6:
        return "<depth-limit>"
    if isinstance(value, dict):
        return {k: skeleton(v, k, depth + 1) for k, v in list(value.items())[:60]}
    if isinstance(value, list):
        if not value:
            return []
        return [skeleton(value[0], key, depth + 1), f"<+{len(value) - 1} more>"] \
            if len(value) > 1 else [skeleton(value[0], key, depth + 1)]
    if key in KEEP_VALUES and isinstance(value, (str, bool, int)) and \
            not (isinstance(value, str) and len(value) > 80):
        return value
    if value is None:
        return "null"
    return type(value).__name__


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default=str(EVIDENCE_DIR / "phaseF" / "probes"))
    args = ap.parse_args()
    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)

    results: dict[str, dict] = {}

    for name, url in PUBLIC_PROBES:
        r = curl(url)
        body = r["body"]
        if name.endswith("_openapi_info") and isinstance(body, dict):
            body = {"openapi": body.get("openapi"), "info": body.get("info"),
                    "path_count": len(body.get("paths", {})),
                    "operation_count": sum(
                        len([m for m in v if m.upper() in
                             {"GET", "POST", "PUT", "PATCH", "DELETE"}])
                        for v in body.get("paths", {}).values()),
                    "component_schemas": list(
                        body.get("components", {}).get("schemas", {}).keys()),
                    "security_schemes": body.get("components", {}).get("securitySchemes")}
        results[name] = {
            "class": "PUBLIC", "url": url.replace(GW, "<gateway>").replace(DL, "<data_layer>"),
            "http_status": r["http_status"], "body_bytes": r["body_bytes"],
            "contract_headers": {k: v for k, v in r["headers"].items()
                                 if k.startswith("x-") or k in
                                 {"content-type", "cache-control"}},
            "response_skeleton": skeleton(body),
        }

    for name, url in UNAUTH_PROBES:
        r = curl(url)
        results[name] = {
            "class": "UNAUTHENTICATED_REJECTION_PROBE",
            "url": url.replace(GW, "<gateway>"),
            "http_status": r["http_status"],
            "contract_headers": {k: v for k, v in r["headers"].items() if k.startswith("x-")},
            "response_body": r["body"] if r["body_bytes"] < 1200 else skeleton(r["body"]),
            "note": "probed with NO credential — captures the rejection contract only",
        }

    for name, url, extra in HEADER_PROBES:
        r = curl(url, extra)
        results[name] = {
            "class": "CONTRACT_NEGOTIATION_PROBE",
            "url": url.replace(GW, "<gateway>"), "request_headers": extra,
            "http_status": r["http_status"],
            "contract_headers": {k: v for k, v in r["headers"].items() if k.startswith("x-")},
            "response_body": r["body"] if r["body_bytes"] < 800 else skeleton(r["body"]),
        }

    payload = {
        "provenance": provenance("scripts/90_runtime_probe.py",
                                 ["runtime GET probes on 127.0.0.1:8000 / :8100"]),
        "method_guarantee": "GET only. No credential was read, held or transmitted. "
                            "Public bodies are reduced to type skeletons; scalar values "
                            "survive only for an allowlist of contract fields.",
        "summary": {
            "public_probes": len(PUBLIC_PROBES),
            "rejection_probes": len(UNAUTH_PROBES),
            "negotiation_probes": len(HEADER_PROBES),
            "status_codes": {k: v["http_status"] for k, v in results.items()},
        },
        "probes": results,
    }
    p = write_json("runtime-probes.json", payload)
    print(json.dumps(payload["summary"], indent=2))
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
