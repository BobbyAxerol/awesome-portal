# BAR-14 — Rust fast paths: benchmark gate

> **Version:** 0.1 · **Status:** complete (gate harness; Rust NOT STARTED
> unless evidence requires) · **Updated:** 2026-08-16
> **Unified phase:** U17 · **Guide:** v0.4 §6.5, §15.6–15.7

`apps/portal/scripts/benchmark_query_path.py` measures the Python query path
(p50/p95/p99/bytes/RSS over a 200k-row frame) and commits
`upgrade/backend/bar14/benchmark-report.json`. Baseline p95 = 87.6 ms vs the
200 ms metadata target → the metadata query path is inside budget, so **no
Rust extraction starts**; heavier artifact-series profiling remains the
precondition per §15.6. `tests/test_benchmark_gate.py` (**3 tests**) covers
decision logic, report schema and harness determinism. No change was pushed
or deployed.
