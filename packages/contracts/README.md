# Portal Contracts — canonical schema authority (U09 / BAR-06)

`packages/contracts/` is the source-controlled canonical contract workspace:
IDs, timestamps, decimals, RFC 7807 problem documents, command envelopes
(idempotency + optimistic concurrency) and event envelopes (§6.7 of the v0.4
guide). Schemas live in `schemas/`, canonical fixtures in `fixtures/`, and the
committed TypeScript types generated from the Portal OpenAPI in `generated/`.

Execution analytics has its own narrow, source-backed screen contract at
`openapi/execution-analytics.openapi.json`, generated as
`generated/execution-analytics.d.ts`. It covers the six EX-BE-07b analytics
routes plus the N07 deployment-scoped Paper Workbench shadow panel route; it is
not a generic analytics/query API. Its envelopes keep
epoch, source snapshot, capability identity, delivery profile, projection
sequence, freshness policy and string decimals explicit.

N10 adds a deliberately source-dark series authority at
`openapi/execution-analytics-series.openapi.json`, generated as
`generated/execution-analytics-series.d.ts`. It defines an adaptive
equity/drawdown/approved-band response and semantic line, histogram, funnel,
waterfall, heatmap and bar tiles. V1 hard-codes `runtime_active=false`; it does
not mount a route, read Trading System data or retire frontend smoke data.
Approved bands are joined only by immutable run ID plus artifact digest, gaps
remain explicit, and a response is bounded to 5,000 items / 2 MiB. The same
pack fixes Execution mapper events to the string schema version
`execution.event.v1` and provides one typed, secret-free fixture per event type.

Execution governance and realtime use separate narrow contracts:
`openapi/execution-governance.openapi.json` / `generated/execution-governance.d.ts`
for the Portal-owned active R2 binding plus the source-safe Paper Exit
read/plan/apply/poll boundary, and
`openapi/execution-realtime.openapi.json` / `generated/execution-realtime.d.ts`
for the same-origin SSE boundary. The projection-page component is now bound to
the commissioned Paper Workbench `orders|positions` route. Rust injects the
deployment filter and signs cursor scope; the component does not authorize a
generic query route or registry/profile promotion.

PRE-IAM-03 publishes the dark Command Center snapshot separately at
`openapi/execution-command-center.openapi.json`. Its five canonical fixtures
cover busy, empty, partial, stale and unavailable states. The contract is
bounded to top-10 triage, six fleet cells, five user pins and twelve Today
items; ranking is server-owned (`command-center.triage-rank.v1`). Composite
totals are exact only when every contributing source is available, otherwise
they are null rather than a fabricated zero. SSE identity and every live
delivery profile remain disabled in v1.

EX-BE-05b/F0 publishes the offline execution-operations boundary at
`openapi/execution-operations.openapi.json`, generated as
`generated/execution-operations.d.ts`. Its catalogue is deterministically
generated from the immutable Trading System CLI/OpenAPI extract and contains
exactly 64 canonical `noun/verb` entries. Every F0 entry has
`portal_reachable=false`; the eight unpublished `ops` actions and generic
Redis access stay explicitly blocked. Plan records are immutable and blocked,
apply is denied before relay construction, verification remains `NOT_STARTED`,
and no source request or outbox command is created. `TypedCondition` is the
canonical multi-condition shape; a singular governance condition is accepted
only as a deprecated transition alias.

EX-BE-05b/F1a and F1b add the Portal-owned Operations Queue and Incident Detail
surfaces to the same contract. Incident responses keep four Execution source
panels explicitly unavailable, bound all history collections to 250 rows and
guarantee `source_side_effect_requested=false` plus
`deployment_resume_requested=false`. Evidence is hash-only metadata; no raw
artifact body or Trading System payload belongs in these schemas.

EX-BE-05b/F2 adds the Portal-owned Sandbox Certification contract: exactly
seven ordered authority-labelled steps, immutable evidence lineage,
hash/version-bound submit and decision semantics, and a CANARY promotion plan
that is always blocked while production commands are inactive. The fixture is
explicitly `fixture/UNAVAILABLE`; no source-evidence ingestion, outbox, runtime
activation or promotion execution is part of this contract.

EX-BE-05b/F3 adds a separate Canary contract surface. Portal DRAFT capital
envelopes are immutable, exact-decimal, evidence/plan-bound revisions. The
control-room fixture keeps runtime and every source-backed value explicitly
unavailable and encodes `BROKER_STALE_BLOCKS_SCALE_ONLY`; both protective and
scale actions remain invisible/disabled while production commands are
inactive. No source ingestion, outbox, activation or command endpoint is part
of this contract.

EX-BE-05b/F4 adds the source-dark Live Full Operations read contract. It
requires a Portal Canary predecessor but never treats that DRAFT envelope as
active Live authority. Runtime, five KPIs, Internal/Broker/Difference,
positions, orders, exact open-order footer, incidents, series, projection
continuity, rollback and realtime are explicitly unavailable. The broker panel
is suppressed and cannot carry data; `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4`
is machine-checked while both R3 and R4 actions remain invisible/disabled.

Rules:

- JSON Schema Draft 2020-12 with `additionalProperties: false`; unknown fields
  are breaking.
- IDs are opaque: clients never parse them. New durable aggregates use the
  prefixed ULID shape; the control-api's prefixed UUID-hex shape remains
  valid during the compatibility window (ADR-002).
- Timestamps are timezone-aware UTC ISO 8601 with explicit precision.
- Decimals cross service boundaries as strings (decimal.v1), never floats.
- Errors are RFC 7807 documents with a stable machine `code`, safe `detail`
  and `request_id`; no stack, secret, host path or raw upstream assertion.
- Commands carry `request_id`, `actor_id`, `workspace_id`, `idempotency_key`,
  `expected_aggregate_version` and `payload_schema_version`; events carry the
  canonical §6.7 envelope with `traceparent` and producer provenance.
- List endpoints use `keyset-page.v1`: exact total/filtered counts, mutually
  exclusive opaque navigation cursors at request time, server-echoed filters
  and stable sort, with a hard 250-row response cap. Offset/page-number fields
  are not part of the contract.
- Fixtures contain no business fakes: every fixture validates against its
  schema in both Python (jsonschema) and TypeScript (ajv) — cross-language
  fixture compilation is the acceptance gate.
- Breaking changes: a drift in any digest in `contracts-snapshot.json`, in
  the committed generated types or in the frozen OpenAPI snapshots fails CI
  before application tests.

Layout:

```text
packages/contracts/
  README.md
  schemas/
    common.v1.schema.json
    problem.v1.schema.json
    command-envelope.v1.schema.json
    event-envelope.v1.schema.json
    keyset-page.v1.schema.json
    execution-projection-page.v1.schema.json
    execution-governance-r2-review.v1.schema.json
    execution-governance-paper-exit.v1.schema.json
    execution-realtime-event.v1.schema.json
    execution-analytics-series.v1.schema.json
    execution-event-envelope.v1.schema.json
    execution-command-center-snapshot.v1.schema.json
    execution-operations.v1.schema.json
  fixtures/
    problem.valid.json
    command.valid.json
    event.valid.json
    keyset-page.valid.json
    execution-analytics.capital-preview.valid.json
    execution-analytics.order-funnel.valid.json
    execution-analytics.insight-batch.valid.json
    execution-analytics.correlation.valid.json
    execution-analytics.capital-ledger.valid.json
    execution-analytics.binding-exposure.valid.json
    execution-analytics.equity-projection.valid.json
    execution-analytics.insight-{line,histogram,funnel,waterfall,heatmap,bar}.valid.json
    execution-events.corpus.valid.json
    execution-projection-page.valid.json
    execution-governance.r2-review.valid.json
    execution-governance.paper-exit-review.valid.json
    execution-realtime.auth-expiring.valid.json
    execution-realtime.projection-gap.valid.json
    execution-command-center.{busy,empty,partial,stale,unavailable}.valid.json
    execution-command-{catalog,plan,operation,relay-denied}.valid.json
  openapi/
    execution-analytics.openapi.json
    execution-analytics-series.openapi.json
    execution-governance.openapi.json
    execution-realtime.openapi.json
    execution-command-center.openapi.json
    execution-operations.openapi.json
  generated/
    portal-api.d.ts
    execution-analytics.d.ts
    execution-analytics-series.d.ts
    execution-governance.d.ts
    execution-realtime.d.ts
    execution-command-center.d.ts
    execution-operations.d.ts
  contracts-snapshot.json
  package.json
  tsconfig.json
  vitest.config.ts
  test/fixtures.spec.ts
```
