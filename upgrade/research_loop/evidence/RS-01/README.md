# RS-01 — Correctness, immutable consistency and bounded recovery

**Status:** `BACKEND_REMEDIATED · FEATURE_DARK · CLAUDE_CONSUMER_REVIEW_PENDING`  
**Date:** 2026-09-22  
**Scope:** P13–P17 repair slice A01–A08 only; no source expansion, runtime
activation, deployment, global Execution pool policy, direct database access or
frontend code change.

The canonical phase report is [phase-report.md](./phase-report.md). The only
frontend work created by this slice is a generated-contract consumption review
in [frontend-handoff-claude.md](./frontend-handoff-claude.md). It is not a
request to replace a rich screen with a generic error view.

## Delivered contract facts

- R1 evidence receipts retain their historical metric registry/labels and stay
  readable. R2 receipts use `P13_SOURCE_R2`, `research.metric-registry.v2`,
  explicit direct-metric scopes and per-series coverage/digests.
- Monthly returns use the prior calendar-month close, not the first observed
  point in the month. All financial ratios are exact decimal strings.
- R2 receipt serialization is capped at 24 KiB before journal persistence;
  sampling/omission metadata explains retained transport points.
- Hub, lazy series and replay load one immutable repeatable-read bundle. A
  digest/count/sampling mismatch is a typed unavailable response, never a
  reconstructed or mixed revision.
- Replay responses are `Cache-Control: private, no-store`; they do not emit an
  ETag/304 response for cursor-bearing output. Expired opaque cursors become
  `409 RESEARCH_REPLAY_CURSOR_EXPIRED`; `at_ordinal` is the public safe
  re-location input.
- Terminal completion is `FINISHING` until its immutable materialization row is
  visible. Exact duplicate terminal delivery re-fanouts only after sidecars and
  lifecycle are durable; it never reruns QuantBT.
- Research has a local read-admission boundary (2 active, 8 queued, 750 ms
  queue/acquire deadlines) with cancellation and late pool-client release.

## Explicit non-claims

RS-01 does not make P13–P17 feature-complete. It does not invent optimizer
trials, execution replay, market data, artifact bytes, holdout authority or a
browser product receipt. Those remain RS-02/RS-03 work or exact source facts.

