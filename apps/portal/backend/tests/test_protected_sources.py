from __future__ import annotations

import hashlib
from pathlib import Path


def test_strategy_main_matches_protected_checksum() -> None:
    project_root = Path(__file__).resolve().parents[2]
    strategy_root = project_root / "strategy"
    expected = (strategy_root / "PROTECTED_SHA256").read_text(encoding="utf-8").split()[0]
    actual = hashlib.sha256((strategy_root / "main.py").read_bytes()).hexdigest()
    assert actual == expected
