# EX-BE-05b/F3 — Portal Canary Control Room source-dark

Date: 2026-08-23  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Runtime cell: SGP Research Portal only

## 1. Goal and authority boundary

F3 delivers the Portal-owned backend foundation for Phase 11 Canary Control
Room. The full Portal, Control API and governance PostgreSQL remain on SGP. F3
does not deploy to AWS-HK, read a Trading System source, start a canary runtime
or expose a protective/scale command route.

The Portal may record only an immutable `DRAFT` capital envelope. Creation
requires a current approved F2 Sandbox Certification and its exact blocked
CANARY promotion plan. The record is a proposal, not activation authority.

## 2. Versioned envelope invariants

Migration `1723680000011_canary-control-room.sql` adds
`governance_canary_envelopes` with:

- exact-decimal capital, gross-notional and daily-loss caps;
- open-order and duration caps;
- immutable certification, promotion-plan and evidence-set lineage;
- monotonically increasing per-deployment revision;
- exact predecessor comparison, including first-revision `null` semantics;
- append-only rows and database-enforced approved/current lineage;
- permanent `fixture/UNAVAILABLE`, `DRAFT` and false side-effect/activation/
  command flags;
- required blockers `PRODUCTION_COMMAND_INACTIVE`,
  `CANARY_OWNER_GATE_REQUIRED`, `LIVE_SOURCE_UNAVAILABLE` and
  `BASE_RISK_PROFILE_UNVERIFIED`.

Writes are bounded `SERIALIZABLE` transactions. The certification aggregate is
locked before the evidence set is evaluated. Equal request-key retries replay;
payload drift and predecessor drift fail with typed conflicts. The envelope
and `product_audit_events` record commit atomically. No outbox is written.

## 3. API and read model

- `POST /api/v1/execution/governance/canary-envelopes` — ADMIN, same-origin,
  CSRF and workspace-member gated; creates only an immutable DRAFT revision.
- `GET /api/v1/execution/deployments/{deployment_id}/canary` — workspace-member
  read of the latest Portal envelope plus source-dark screen model.

The response publishes five KPI slots, Internal/Broker/Difference panels,
envelope compliance, positions, blotter, adaptive-series placeholder and
rollback readiness. Every source-backed value is explicitly `UNAVAILABLE`,
with null runtime state and exact totals unknown rather than zero.

The command policy encodes the future asymmetric rule:

```text
BROKER_STALE_BLOCKS_SCALE_ONLY
protective.broker_sync_blocks = false
scale_up.broker_sync_blocks   = true
```

Both action groups are currently invisible and disabled because
`production_command_active=false`. F3 does not claim that protective commands
are executable merely because broker freshness will not be their future gate.

Canonical contract files:

- `packages/contracts/schemas/execution-canary-control-room.v1.schema.json`;
- `packages/contracts/openapi/execution-canary.openapi.json`;
- `packages/contracts/generated/execution-canary.d.ts`;
- `execution-canary-control-room.unavailable.valid.json`.

## 4. Evidence

- Contract fixture/schema/OpenAPI/generated-type suite: 47/47.
- Control API: TypeScript build plus 20 suites/167 tests on a fresh
  PostgreSQL 16 database.
- Migration/DR: twelve migrations plus custom `pg_dump`/`pg_restore`
  signature including the Canary table.
- Security: session, workspace, ADMIN write, Origin and CSRF boundaries.
- Governance: approved/current certification, evidence-set hash and exact
  blocked promotion plan are all required.
- Concurrency: equal concurrent creates yield one row, one audit event and one
  replay; request drift and predecessor drift fail closed.
- Safety: source panels unavailable, runtime null, commands hidden/disabled,
  no outbox and every source/runtime/promotion side-effect flag false.

These gates qualify only the SGP Portal workflow and interface. They do not
qualify live-canary source parity, broker sync, rollback readiness, D2/D3/D4 or
production command authority.

## 5. Residual work and next phase

Claude can integrate Phase 11 Lane A from the generated declaration and fixture
while retaining the explicit fixture/production-inactive guard. Real Canary
values require D2→D4, source-backed projection parity, broker/account identity,
rollback evidence and owner activation.

Phase 12 Live Full Operations is the next source-dark Portal product contract
that can be designed independently. Actual Canary and Live activation remain
separate owner/evidence/change-window gates.
