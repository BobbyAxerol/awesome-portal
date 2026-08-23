# EX-BE-05b/F2 — Portal Sandbox Certification

Date: 2026-08-23  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Runtime cell: SGP Research Portal only

## 1. Goal and authority boundary

F2 delivers the Portal-owned backend foundation for Phase 10 Sandbox
Certification. The Control API, PostgreSQL workflow and product audit remain on
SGP. It does not deploy a Portal application to AWS-HK, modify the Trading
System, activate a sandbox account or contact a broker.

The certification workflow is forward-only:

```text
DRAFT → IN_REVIEW → APPROVED | DENIED
```

The seven canonical certification steps are fixed and ordered:

```text
CONNECT → SYNC → ORDER_TYPES → RECONCILIATION
→ TIMEBOXED_RUN → CLEANUP → EXIT_REVIEW
```

Portal owns the certification identity, workflow, lineage, policy identity,
decision, audit and blocked promotion intent. Step evidence retains its own
authority: broker connectivity/sync/order types are `BROKER`, the timeboxed run
is `EXECUTION`, reconciliation/cleanup are `DERIVED`, and exit review is
`PORTAL`.

The deployed profile remains `fixture/UNAVAILABLE`. The public API has no route
for inserting source evidence. A future D4 trusted adapter may append verified
shadow evidence only after its dedicated read identity, typed source contract,
projection epoch and parity gates are accepted.

## 2. Fail-closed workflow

Every detail returns exactly seven steps, including missing steps as
`UNAVAILABLE`; missing evidence is never converted to pending success. The
server computes a deterministic evidence-set hash over policy identity, all
step evidence, expiry, cursors and unresolved blocking findings.

- Submit requires `7/7 PASS`, verified and unexpired evidence, no unresolved
  blocking finding, matching workflow version and matching evidence hash.
- Approval requires the same evidence set still to be current, plus separation
  of duties: the submitter cannot approve.
- Denial is allowed only from `IN_REVIEW` and binds the current evidence hash.
- Stale, failed, unavailable or changed evidence rejects approval.
- A CANARY promotion plan may be recorded only after approval and only while
  its approved evidence remains current.
- Every promotion plan is durably `BLOCKED` by
  `PRODUCTION_COMMAND_INACTIVE` and `CANARY_OWNER_GATE_REQUIRED`.
- `source_side_effect_requested`, `runtime_activation_requested` and
  `promotion_execution_requested` are database-checked `false`.
- No `outbox_messages` row, AWS-HK call, Trading System call or broker call is
  possible in F2.

## 3. API and storage

Same-origin, session/workspace-bound routes:

- `GET /api/v1/execution/deployments/{deployment_id}/certification`;
- `POST /api/v1/execution/governance/sandbox-certifications`;
- `POST .../{certification_id}/submit`;
- `POST .../{certification_id}/decisions`;
- `POST .../{certification_id}/promotion-plans`.

Reads are available to workspace members. Writes require ADMIN, same-origin and
CSRF. Every mutation has a bounded request key and expected workflow version.
Equal retries replay; key reuse for another action, certification or payload is
a typed conflict.

Migration `1723680000010_sandbox-certification.sql` adds:

- `governance_sandbox_certifications` with immutable lineage/authority and a
  database-checked workflow shape;
- append-only latest-per-step `governance_sandbox_step_evidence`;
- append-only, bounded `governance_sandbox_findings`;
- append-only request-key-unique certification events;
- append-only, hash-bound, permanently blocked promotion plans.

Writes run in bounded `SERIALIZABLE` transactions. Accepted workflow changes,
events and `product_audit_events` commit atomically. Only exact serialization,
deadlock and known idempotency races are retried. Child source/evidence history
is immutable.

Canonical contracts:

- `packages/contracts/schemas/execution-sandbox-certification.v1.schema.json`;
- `packages/contracts/openapi/execution-governance.openapi.json`;
- `packages/contracts/generated/execution-governance.d.ts`;
- `execution-sandbox-certification.unavailable.valid.json`.

## 4. Evidence

- Contracts: 45/45 JSON Schema, semantic fixture and OpenAPI/generated-type
  parity tests pass.
- Control API: TypeScript build and 19 suites, 163/163 tests pass on a fresh
  PostgreSQL 16 database.
- Migration/DR: eleven-migration gate and custom `pg_dump`/`pg_restore`
  signature including all five F2 tables pass.
- Security: session, ADMIN write, workspace isolation, Origin and CSRF gates
  pass; operator reasons reject credential-like assignments.
- Workflow: source-dark 0/7 submission denial, 7/7 happy path, deterministic
  stale evidence denial, optimistic versioning, evidence-hash TOCTOU refusal,
  submitter/approver SoD and immutable evidence pass.
- Concurrency: equal concurrent creates serialize to one certification, one
  event, one audit record and one replay.
- Safety: approved promotion planning remains blocked; outbox count remains
  zero and all three side-effect flags remain false.

These results qualify only the SGP Portal workflow. They do not claim a live
Sandbox source, broker reconciliation, cross-cell transport, activation or
production command authority.

## 5. Residual work and next phase

Claude can integrate Phase 10 Lane A from the generated declaration and
unavailable fixture. It must render the seven server steps and three independent
Internal/Broker/Difference panels, preserve profile labels and keep submit/exit
controls fail-closed.

Real Sandbox panels require accepted D2/D3, D4-compatible source transport, a
dedicated authenticated Sandbox read identity, published bounded source
contracts and source parity. Phase 11 Canary Control Room is the next Portal
product backend slice that can be designed source-dark; live source activation
and protective commands remain independent owner/evidence gates.
