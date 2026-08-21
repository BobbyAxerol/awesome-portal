#!/usr/bin/env python3
"""85_config_surface.py — declared runtime configuration surface (defaults only).

`shared/config.py` is the single Settings class for every service. Its *declared
defaults* are contract-relevant: rate limits, timeouts, feature flags, endpoint
names, retention windows. Its *effective values* are not (they come from env and
may hold secrets).

This script reads ONLY the source declarations — it never reads the environment,
never runs `docker inspect`, and never reads a `*_FILE` target. Any setting whose
name matches the secret pattern is emitted as name + type + "declared" with the
default value replaced by a redaction marker, so the Portal learns the setting
EXISTS without any credential material entering the pack.

READ-ONLY: ast.parse of one file.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import TS_ROOT, provenance, write_json, write_text  # noqa: E402

CONFIG = TS_ROOT / "shared" / "config.py"
SECRET_RE = re.compile(
    r"(PASSWORD|TOKEN|SECRET|API_KEY|APIKEY|PEPPER|PRIVATE|CREDENTIAL|COOKIE|"
    r"SALT|CERT|_PEM|_KEY$|_KEY_|SIGNING|OTP)", re.I)
# URL/DSN defaults are internal service names, not credentials — but redact any
# default that embeds userinfo (scheme://user:pass@host).
USERINFO_RE = re.compile(r"://[^/\s:@]+:[^/\s@]+@")

CATEGORIES = [
    (re.compile(r"^(GATEWAY|TRADING_ADMIN)", re.I), "gateway/admin"),
    (re.compile(r"(RATE_LIMIT|BURST|THROTTL)", re.I), "rate limiting"),
    (re.compile(r"(TIMEOUT|INTERVAL|SECONDS|TTL|BACKOFF|RETRY|ATTEMPT|STALE)", re.I), "timing"),
    (re.compile(r"(ENABLED|_FLAG|ROLLOUT|SHADOW|MODE$)", re.I), "feature flag"),
    (re.compile(r"(REDIS|POSTGRES|DB_|DSN|DATABASE)", re.I), "datastore"),
    (re.compile(r"(BINANCE|OKX|DNSE|BROKER|VENUE)", re.I), "venue/broker"),
    (re.compile(r"(REPLAY|JOURNAL|OUTBOX|COPY|EVENT)", re.I), "event/command plane"),
    (re.compile(r"(URL|HOST|PORT|ENDPOINT)", re.I), "endpoint"),
]


def categorise(name: str) -> str:
    for rx, label in CATEGORIES:
        if rx.search(name):
            return label
    return "other"


def main() -> int:
    if not CONFIG.exists():
        return write_json("config-surface.json", {"status": "MISSING",
                                                  "expected": str(CONFIG)}) and 1
    tree = ast.parse(CONFIG.read_text(errors="replace"))
    settings: list[dict] = []
    for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
        for stmt in cls.body:
            if not (isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name)):
                continue
            name = stmt.target.id
            if name.startswith("_") or name == "model_config":
                continue
            try:
                default = ast.literal_eval(stmt.value) if stmt.value is not None else None
            except Exception:
                default = ast.unparse(stmt.value) if stmt.value is not None else None

            secret = bool(SECRET_RE.search(name)) or (
                isinstance(default, str) and bool(USERINFO_RE.search(default)))
            settings.append({
                "name": name,
                "type": ast.unparse(stmt.annotation),
                "declared_default": ("<redacted — secret-shaped setting; declaration only>"
                                     if secret else default),
                "is_secret_shaped": secret,
                "category": categorise(name),
                "class": cls.name,
                "source": f"shared/config.py:{stmt.lineno}",
            })

    by_cat: dict[str, int] = {}
    for s in settings:
        by_cat[s["category"]] = by_cat.get(s["category"], 0) + 1

    payload = {
        "provenance": provenance("scripts/85_config_surface.py", ["shared/config.py"]),
        "redaction_guarantee": "Only source-declared defaults are read. The process "
                               "environment, *_FILE targets, docker inspect and compose "
                               "config were never read. Secret-shaped settings appear by "
                               "name and type only.",
        "summary": {
            "settings_declared": len(settings),
            "secret_shaped_redacted": sum(1 for s in settings if s["is_secret_shaped"]),
            "by_category": dict(sorted(by_cat.items())),
        },
        "portal_relevant_highlights": {
            s["name"]: s["declared_default"] for s in settings
            if not s["is_secret_shaped"] and re.search(
                r"(RATE_LIMIT|STALE|TIMEOUT|MAX_ATTEMPT|REPLAY_V2|JOURNAL|ROLLOUT|"
                r"LEGACY_PLAINTEXT|RETENTION|MAXLEN|SHADOW)", s["name"], re.I)
        },
        "settings": settings,
    }
    p = write_json("config-surface.json", payload)

    md = ["# Declared configuration surface (defaults only, secrets redacted)", "",
          "| Setting | Type | Declared default | Category |", "|---|---|---|---|"]
    for s in settings:
        md.append("| `{n}` | `{t}` | {d} | {c} |".format(
            n=s["name"], t=s["type"],
            d=("🔒 redacted" if s["is_secret_shaped"] else f"`{s['declared_default']}`"),
            c=s["category"]))
    write_text("config-surface.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2))
    print(json.dumps(payload["portal_relevant_highlights"], indent=2)[:1400])
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
