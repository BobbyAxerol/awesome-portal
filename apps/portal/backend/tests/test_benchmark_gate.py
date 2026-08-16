from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT = REPO_ROOT / "apps" / "portal" / "scripts" / "benchmark_query_path.py"
REPORT = REPO_ROOT / "upgrade" / "backend" / "bar14" / "benchmark-report.json"


def _module():
    spec = importlib.util.spec_from_file_location("benchmark_query_path", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_extraction_gate_decision_logic() -> None:
    module = _module()

    assert module.decide(150.0) == "rust-extraction-eligible"
    assert module.decide(201.0) == "rust-not-started"
    assert module.decide(200.0) == "rust-extraction-eligible"
    assert module.TARGET_P95_MS == 200.0


def test_benchmark_report_schema_and_committed_baseline() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))

    assert report["schema_version"] == "bar14.benchmark.v1"
    assert report["iterations"] >= 20
    assert set(report["latency_ms"]) == {"p50", "p95", "p99", "max"}
    assert report["latency_ms"]["p95"] <= report["latency_ms"]["p99"]
    assert report["target_p95_ms"] == 200.0
    assert report["decision"] in {"rust-extraction-eligible", "rust-not-started"}
    assert report["peak_traced_bytes"] > 0
    assert report["rows"] == 200_000


def test_benchmark_harness_runs_and_reports() -> None:
    module = _module()
    report = module.run_benchmark(iterations=5)
    assert report["iterations"] == 5
    assert report["latency_ms"]["p95"] >= report["latency_ms"]["p50"]
    assert report["decision"] == module.decide(report["latency_ms"]["p95"])
