"""Shared helpers for Portal contract-pack extraction scripts.

READ-ONLY BY CONSTRUCTION: these helpers only read files / issue HTTP GET.
They never write into the Trading System repository or runtime.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

TS_ROOT = Path(os.environ.get("TS_ROOT", "/home/bobby/trading_system")).resolve()
DL_ROOT = Path(os.environ.get("DL_ROOT", "/home/bobby/data_layer")).resolve()
PACK_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PACK_ROOT / "extract"
EVIDENCE_DIR = PACK_ROOT / "evidence"


def out(name: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    return OUT_DIR / name


def write_json(name: str, payload: Any) -> Path:
    p = out(name)
    p.write_text(json.dumps(payload, indent=2, sort_keys=False, ensure_ascii=False) + "\n")
    return p


def write_text(name: str, text: str) -> Path:
    p = out(name)
    p.write_text(text if text.endswith("\n") else text + "\n")
    return p


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read(path: Path) -> str:
    return path.read_text(errors="replace")


def git(*args: str, cwd: Path = TS_ROOT) -> str:
    try:
        return subprocess.run(
            ["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=30
        ).stdout.strip()
    except Exception as exc:  # pragma: no cover - defensive
        return f"ERROR:{exc}"


def provenance(script: str, sources: list[str]) -> dict:
    return {
        "generated_by": script,
        "read_only": True,
        "trading_system_commit": git("rev-parse", "HEAD"),
        "sources": sources,
        "note": "Derived from source/runtime read-only inspection. No Trading System file was modified.",
    }
