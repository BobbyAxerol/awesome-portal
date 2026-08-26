# N10 — Series and Insight Analytics Contracts

Status: `CONTRACT_COMPLETE / PRODUCTION_INACTIVE`  
Date: 2026-08-26  
Owner: Portal backend  
Scope: BR-EX-34, BR-EX-39, BR-EX-40 only

## 1. Outcome

N10 closes the source-independent contract and pure-engine work needed by the
Execution equity panels and Alpha 360 insight grid. It does not mount a public
route, read AWS-HK, change a registry delivery profile, enable SSE or issue a
Trading System command.

```text
canonical JSON Schema / fixtures
              |
      OpenAPI route contract
              |
      generated TypeScript
              |
        Rust pure engines
```

Both N10 response schemas carry `runtime_active=false` and
`source_side_effect_requested=false`. Source-backed activation remains a later
promotion and cannot happen accidentally through this commit.

## 2. BR-EX-34 — equity projection

The contract publishes:

- equity and drawdown as exact decimal strings;
- the shared Query API six-rung interval ladder (`1m`, `5m`, `15m`, `1h`,
  `4h`, `1d`), choosing the finest interval with no more than 5,000 buckets;
- explicit gaps; a null point without a covering gap is rejected;
- no interpolation across a gap;
- approved lower/upper bands only when both immutable `run_id` and
  `artifact_digest` match the deployment lineage;
- exact `returned_buckets / expected_buckets` coverage;
- retention classification, source-row count, freshness, completeness and
  formula version `equity_projection.v1`;
- a 2 MiB serialized response limit.

The source-dark route contract is:

```http
GET /api/v1/execution/deployments/{deploymentId}/equity-projection
    ?window=30d&intent=overview
```

Clients cannot force a bucket and therefore cannot create an unbounded or
misleading downsample request.

## 3. BR-EX-40 — semantic insight tiles

`tile_kind` is a wire-level semantic discriminator, not a display hint.

| Kind | Server invariant |
|---|---|
| `line` | timestamps strictly ascending; null remains a gap |
| `histogram` | ordered, non-overlapping exact-decimal bins |
| `funnel` | counts cannot increase; conversion is exact previous-stage ratio |
| `waterfall` | every step satisfies `start + delta = end`; steps are continuous |
| `heatmap` | unique x/y cells; at most 4,096 cells |
| `bar` | unique labels; exact-decimal value; optional currency |

A batch is limited to twelve tiles, 5,000 total series items and 2 MiB. Each
tile declares formula version, authority, freshness, completeness, `as_of`,
minimum samples, observed samples and typed state. A tile below its minimum
cannot carry a series; a READY tile must carry the matching series kind.

The canonical Alpha 360 catalogue contains all twelve requested tiles. The
source-dark route contract is:

```http
POST /api/v1/execution/alphas/{alphaId}/insight-series
```

## 4. BR-EX-39 — Execution event parity

The generic Portal event envelope remains backward compatible. Execution
mapper events now have a separate canonical version:

```text
schema_version = "execution.event.v1"  # always a JSON string
```

Rust derives `event_type` and `entity_kind` from the typed payload variant and
validates both after deserialization. The corpus contains one complete,
secret-free envelope and payload for each published mapper event:

1. `order.updated`
2. `fill.recorded`
3. `position.updated`
4. `source_event.observed`
5. `runtime.updated`
6. `account.updated`
7. `broker_binding.updated`
8. `reconciliation.updated`
9. `performance.updated`
10. `operation.updated`

This resolves integer `1` versus string `"v1"` for the Execution domain
without rewriting unrelated Portal events. It does not yet replace the
current arbitrary D4 realtime payload mapper; that source-backed integration
belongs to N11/N08 parity work.

## 5. Canonical artifacts

- `packages/contracts/schemas/execution-analytics-series.v1.schema.json`
- `packages/contracts/schemas/execution-event-envelope.v1.schema.json`
- `packages/contracts/openapi/execution-analytics-series.openapi.json`
- `packages/contracts/generated/execution-analytics-series.d.ts`
- `packages/contracts/fixtures/execution-analytics.equity-projection.valid.json`
- six `execution-analytics.insight-*.valid.json` fixtures
- `packages/contracts/fixtures/execution-events.corpus.valid.json`
- Rust `analytics::{series,tiles}` and `execution-contracts::events`

All are covered by the canonical contract snapshot and workspace verification.

## 6. Acceptance evidence

| Gate | Result |
|---|---:|
| Focused Rust analytics + event contracts | 38/38 passed |
| Full Rust workspace regression | 204/204 passed |
| Rust clippy, all workspace targets, `-D warnings` | passed |
| AJV canonical fixture/negative suite | 61/61 passed |
| OpenAPI → TypeScript generated drift | passed |
| rustfmt check | passed |

Tests cover exact-decimal preservation, adaptive interval choice, 5,000-point
and 2 MiB bounds, implicit-gap rejection, band lineage mismatch,
positive-drawdown rejection, all six series invariants, sample-state honesty,
ten event discriminators, integer schema-version rejection and event/payload
kind mismatch. The canonical equity fixture, all six tile fixtures and the
ten-event corpus also deserialize through the actual Rust wire types, so JSON
Schema/OpenAPI/generated TypeScript and Rust cannot drift silently.

## 7. Explicit non-goals and rollback

Not changed: Trading System source/database/API/CLI; AWS-HK network, mTLS,
delegated JWT, Source Proxy or Edge runtime; registry profile; N06 evidence;
public route mounting; frontend smoke; command/outbox authority.

Rollback is one source commit. Because both new response contracts are
source-dark and unmounted, rollback has no migration, network or runtime step.

## 8. Next backend phase

Proceed to N11 only after assembling the one final consolidated Trading System
read request. N11 publishes external read capabilities/adapters for
BR-EX-24/25/26/27 and later HiFi screen packages. Do not send a narrow
per-screen owner request before that consolidated pack is final.
