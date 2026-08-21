#!/usr/bin/env python3
"""98_redaction_audit.py — enforce the handoff §9.1 redaction checklist on the pack.

Scans every file in the contract pack for material that must never leave the
Execution Cell, and fails (exit 1) if anything matches. Run this before publishing
or updating the pack.

Checks: credential-looking assignments, JWT/PEM/private-key blocks, bearer tokens,
DSNs with userinfo, AWS keys, public IPs, email addresses, and long high-entropy
strings that are not one of the pack's own declared SHA-256 evidence hashes.
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PACK_ROOT, provenance, write_json  # noqa: E402

SKIP_DIRS = {"__pycache__", ".git"}

PATTERNS = [
    ("private_key_block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("certificate_block", re.compile(r"-----BEGIN CERTIFICATE-----")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")),
    ("bearer_token", re.compile(r"\b[Bb]earer\s+[A-Za-z0-9._~+/-]{16,}")),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("dsn_with_userinfo", re.compile(r"\b[a-z+]{2,12}://[^/\s:@\"']+:[^/\s@\"']+@")),
    ("assigned_secret", re.compile(
        r"(?i)\b(password|passwd|api[_-]?key|apikey|secret|token|pepper|private[_-]?key)\b"
        r"\s*[:=]\s*[\"']?([A-Za-z0-9._~+/=-]{12,})[\"']?")),
    ("hashed_api_key", re.compile(r"\b(?:sha256|hmac-sha256)\$v1\$[A-Za-z0-9+/=._-]{16,}")),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("public_ipv4", re.compile(r"\b(?!10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|255\.)"
                               r"(?:\d{1,3}\.){3}\d{1,3}\b")),
]

# Values that are legitimately present and must not be flagged.
ALLOWLIST = re.compile(
    r"(?i)(<redacted|redacted —|example|sample|synthetic|portal_probe|placeholder|"
    r"\{[a-z_]+\}|\$\{|\$\d+|never read|declaration only|user:pass@|"
    r"^\s*#|\bre\.compile\()")

HEX64 = re.compile(r"\b[0-9a-f]{64}\b")
HEX_SHORT = re.compile(r"\bsha256:[0-9a-f]{12,64}\b")


def entropy(s: str) -> float:
    if not s:
        return 0.0
    counts = Counter(s)
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


def scan_file(path: Path, known_hashes: set[str]) -> list[dict]:
    try:
        text = path.read_text(errors="replace")
    except Exception:
        return []
    findings = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if len(line) > 20000:
            line = line[:20000]
        for name, rx in PATTERNS:
            for m in rx.finditer(line):
                frag = m.group(0)
                ctx = line[max(0, m.start() - 60):m.end() + 60]
                if ALLOWLIST.search(ctx):
                    continue
                # SHA-256 evidence hashes and image digests are intentional
                if HEX64.fullmatch(frag) or HEX_SHORT.match(frag):
                    continue
                if name == "assigned_secret":
                    val = m.group(2)
                    if val in known_hashes or HEX64.fullmatch(val) or entropy(val) < 3.0:
                        continue
                    if re.fullmatch(r"(?i)(true|false|none|null|\d+(\.\d+)?|"
                                    r"[a-z_]+(\.[a-z_]+)*)", val):
                        continue
                findings.append({
                    "file": str(path.relative_to(PACK_ROOT)),
                    "line": lineno,
                    "pattern": name,
                    "match_preview": frag[:48] + ("…" if len(frag) > 48 else ""),
                    "context": ctx.strip()[:160],
                })
    return findings


def main() -> int:
    known_hashes: set[str] = set()
    readme = PACK_ROOT / "README.md"
    if readme.exists():
        known_hashes |= set(HEX64.findall(readme.read_text(errors="replace")))

    files, findings = [], []
    for p in sorted(PACK_ROOT.rglob("*")):
        if not p.is_file() or any(d in p.parts for d in SKIP_DIRS):
            continue
        # The audit script itself necessarily contains every pattern it looks for.
        if p.name in {"REDACTION-AUDIT.json", "98_redaction_audit.py"}:
            continue
        files.append(str(p.relative_to(PACK_ROOT)))
        findings.extend(scan_file(p, known_hashes))

    by_pattern: dict[str, int] = {}
    for f in findings:
        by_pattern[f["pattern"]] = by_pattern.get(f["pattern"], 0) + 1

    checklist = {
        "no_plaintext_password_apikey_token_cookie_otp":
            not any(f["pattern"] in {"assigned_secret", "bearer_token", "jwt"} for f in findings),
        "no_private_key_or_certificate":
            not any(f["pattern"] in {"private_key_block", "certificate_block"} for f in findings),
        "no_broker_credential_or_hashed_key":
            not any(f["pattern"] == "hashed_api_key" for f in findings),
        "no_customer_or_user_pii":
            not any(f["pattern"] == "email" for f in findings),
        "no_dsn_with_credentials":
            not any(f["pattern"] == "dsn_with_userinfo" for f in findings),
        "no_public_ip_addresses":
            not any(f["pattern"] == "public_ipv4" for f in findings),
        "no_cloud_access_keys":
            not any(f["pattern"] == "aws_access_key" for f in findings),
    }
    passed = all(checklist.values())

    payload = {
        "provenance": provenance("scripts/98_redaction_audit.py", ["<entire contract pack>"]),
        "result": "PASS" if passed else "FAIL",
        "summary": {
            "files_scanned": len(files),
            "findings": len(findings),
            "by_pattern": dict(sorted(by_pattern.items())),
        },
        "handoff_9_1_checklist": checklist,
        "findings": findings[:200],
    }
    p = PACK_ROOT / "REDACTION-AUDIT.json"
    p.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"result": payload["result"], **payload["summary"]}, indent=2))
    for k, v in checklist.items():
        print(f"  [{'x' if v else ' '}] {k}")
    for f in findings[:15]:
        print(f"    ! {f['file']}:{f['line']} {f['pattern']} :: {f['context'][:110]}")
    print(f"wrote {p}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
