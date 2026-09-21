# P13 backend and contract packet — Evidence Flow Hub and metric projections

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE; feature-dark; Screen-04 rich
consumer, browser/HiFi and product-route acceptance remain Claude-owned.**
This packet does not claim a running QuantBT deployment, artifact browse,
raw-market read, direct database access, Execution Edge/Trading System access,
CLI action, or `PRODUCT_ACTIVE`.

Read [phase-report.md](./phase-report.md) for the exact proof and
[frontend-handoff-claude.md](./frontend-handoff-claude.md) before touching
Screen 04.

## Delivered boundary

P13 publishes exactly two authenticated, same-origin read operations:

| Generated operation | HTTP route | Bound |
|---|---|---|
| `researchEvidenceHubGetV1` | `GET /api/v1/quantbt/runs/{runId}/evidence` | one compact immutable Portal projection; exact revision/ETag; no source selector |
| `researchEvidenceSeriesGetV1` | `GET /api/v1/quantbt/runs/{runId}/evidence/series?kind=…` | one named lazy series, at most 192 exact-value points, bound to the Hub revision |

The input worker receipt is accepted only alongside a P11 `run_completed`
event whose `evidence_digest` matches the canonical bounded document. The
P11 journal fsyncs that document before terminal emission; lost callbacks can
redeliver the same document without rerunning QuantBT. PostgreSQL stores an
append-only source receipt, immutable projection revision and four independent
lazy vectors. A page-open neither invokes QuantBT nor opens a bundle, worker
journal, artifact/Parquet file, source database, broker, Redis or CLI.

All reads repeat membership inside a `REPEATABLE READ READ ONLY` transaction
under `portal_research_runtime`, use finite statement/lock/idle budgets, and
are admission-bounded to two active/eight queued readers. Browser input cannot
name a relation, cursor, revision, worker/lease identity, artifact path,
market row, transport or credential.

## Current P04 truth

| Surface | P13 treatment |
|---|---|
| OOS initial/final equity, net return, max drawdown, OOS equity passport | actual P04 result; exact decimal strings; full source result is used for metrics, chart is bounded separately |
| final `num_trades`, processed bars | direct confined QuantBT/P06 facts, scoped as `IS_PLUS_OOS` |
| monthly returns, rolling-20 returns, return distribution | source-derived while the confined child still owns the result; `NOT_APPLICABLE` carries a reason rather than empty data masquerading as zero |
| benchmark, funding, audited fills, per-fold metrics | current P04 source does not publish them: typed `NOT_PUBLISHED`, never inferred from price or UI copy |
| claim and methodology certificate | only P11 typed source fact; no certificate is created from a claim string or presentation rule |

The metric/warning registry is versioned as `research.metric-registry.v1`.
Sampling changes a chart only; it never recomputes an official metric from a
downsample. A stale series response cannot be mixed with a Hub of another
revision; the consumer must discard it and reread the Hub.

## Feature, rollout and rollback

`FEATURE_RESEARCH_EVIDENCE` defaults to `false`. Its reader can be activated
later for retained immutable receipts without starting P10/P11. The source
side remains governed by the P10/P11 change window. Migration
`1723680000046_research-evidence-flow-v1.sql` is additive and intentionally
has no destructive down migration. The deployment overlay and exact procedure
are in [research-p13-evidence-dark-and-rollback.md](../../../../deploy/runbooks/research-p13-evidence-dark-and-rollback.md).

Rollback is the signed feature flag only. It must not delete evidence tables,
rewrite source receipts, alter a sealed bundle, restart a worker, or change an
Execution profile.

## Next owner

Claude should continue the currently uncommitted P12 work without staging,
rewriting, or absorbing it into P13. When quota returns, read the full handoff
chain listed in [frontend-handoff-claude.md](./frontend-handoff-claude.md),
regenerate only the P13 contract and build Screen 04 as a rich panel-local
typed-state consumer. The required browser comparison is direct HiFi HTML vs
implementation at 1280px and 660px; a fixture receipt is not product or
real-source acceptance.
