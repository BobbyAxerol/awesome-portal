# EX-BE-05b/F4 — Live Full Operations source-dark

> Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
> Portal placement: SGP TypeScript Control API  
> Source/runtime impact: none

## Goal and boundary

F4 closes the Portal-owned Lane A backend contract for HiFi Phase 12 without
claiming that a Live Full deployment exists. It composes the latest immutable
F3 Canary envelope and its F2 lineage into a fail-closed read model at:

```http
GET /api/v1/execution/deployments/{deployment_id}/live?workspace_id=...
```

No F4 POST/command/SSE/source-ingestion route exists. The endpoint does not
call AWS-HK, the Trading System, a broker, Redis, CLI or an Execution database.
It creates no audit or outbox record and cannot activate runtime, promotion,
realtime, delivery profile or command authority.

## Response semantics

- requires an authenticated workspace member and an existing Portal Canary
  predecessor;
- exposes the predecessor envelope as `active_for_live_full=false`;
- keeps runtime and activation timestamps null;
- returns exactly five null KPI slots with authority-labelled envelopes;
- returns bounded empty positions, orders and incidents with exact counts null;
- keeps the open-order footer exact count null rather than fabricating zero;
- keeps series, rollback and realtime explicitly unavailable;
- publishes projection continuity as unavailable, with no cursor/epoch/sequence;
- suppresses the broker panel and forbids broker data in the canonical schema;
- publishes `SUPPRESS_ALL_BROKER_VALUES` as the mismatch behaviour;
- publishes
  `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4` as the future
  guard semantic;
- keeps both R3 protective and R4 risk-increasing action groups invisible and
  disabled. A gap is typed as an R4 blocker, but this does not activate R3.

## Contract and implementation

- `apps/control-api/src/live/live-operations.controller.ts`
- `apps/control-api/src/live/live-operations.service.ts`
- `packages/contracts/schemas/execution-live-full-operations.v1.schema.json`
- `packages/contracts/openapi/execution-live-full.openapi.json`
- `packages/contracts/generated/execution-live-full.d.ts`
- `packages/contracts/fixtures/execution-live-full-operations.unavailable.valid.json`

The source-dark v1 schema intentionally permits no source values. Real
`shadow/live_full` responses require a later version after D2→D4, parity,
continuity and EX-BE-08 evidence are accepted.

## Verification

- contracts: 49/49, including rejection of broker data, production command or
  realtime activation in the unavailable fixture;
- Control API: 20 suites, 169/169 tests against fresh PostgreSQL 16;
- database migration count remains 12; no F4 table is needed;
- dump/restore drill passed;
- integration tests cover USER read, workspace isolation, missing Canary
  predecessor, suppression semantics and zero outbox/source side effects.

## Remaining production gates

F4 does not satisfy real Phase 12. Live Full still requires accepted D2/D3/D4,
dedicated read identity, encrypted projection storage, source gap/parity and
freshness evidence, Canary exit, Live dual approval, capital/rollback evidence,
EX-BE-08 cross-cell soak/restore/rollback and a separately authorized
authenticated command relay.

