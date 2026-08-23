# EX-BE-05b/F1a — Portal Operations Queue and Incident Triage Sidecar

Date: 2026-08-23  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Runtime cell: SGP Research Portal only

## 1. Decision and authority boundary

F1a is accepted as the first production-shaped Operations Queue backend while
remaining source-dark. It is a TypeScript/PostgreSQL Portal control-plane
feature on SGP, not an AWS-HK Execution Edge feature and not a Trading System
implementation.

The Portal owns only triage facts: `UNACKNOWLEDGED → ACKNOWLEDGED → RESOLVED`.
The original operation identity, source authority, source status and
verification result are immutable in this slice. Acknowledge and resolve:

- never call AWS-HK or Trading System;
- never create an outbox message or relay request;
- never reinterpret `BLOCKED`/`NOT_STARTED` as execution success;
- never require direct PostgreSQL, Redis, CLI or broker access;
- remain `delivery_profile=fixture` and
  `source_integration_state=UNAVAILABLE`.

F0 blocked command plans are inserted into the queue atomically with plan and
audit creation. Future source-backed operations require a later adapter and a
new migration; they are not fabricated from missing source data.

## 2. API contract

Session/RBAC/workspace boundaries are shared with the TypeScript Control API:

- `GET /api/v1/execution/operations` — ADMIN-only, exact total/filtered count,
  opaque signed/expiring bidirectional keysets, maximum 250 records;
- `POST /api/v1/execution/operations/{operation_id}/acknowledge` — ADMIN-only,
  Origin/CSRF, request-key idempotency and expected workflow version;
- `POST /api/v1/execution/operations/{operation_id}/resolve` — ADMIN-only,
  acknowledge-first, bounded reason, immutable SHA-256 evidence reference,
  request-key idempotency and expected workflow version.

Query fields are allowlisted: triage state, environment, source status,
verification result, severity, target type and command key. Sort is limited to
`created_at`; `operation_id` is the immutable tie-break. Cursor reuse under a
different workspace/filter/sort/limit is rejected by the existing signed
query fingerprint.

Canonical artifacts:

- `packages/contracts/schemas/execution-operations.v1.schema.json`;
- `packages/contracts/openapi/execution-operations.openapi.json`;
- `packages/contracts/generated/execution-operations.d.ts`;
- `execution-operations-queue.valid.json` and
  `execution-operation-workflow.valid.json` fixtures.

## 3. PostgreSQL model and transaction rules

Migration `1723680000008_execution-operations-queue.sql` creates:

- `execution_operation_queue_items`, with database state-shape checks and an
  immutable identity/source-result trigger;
- append-only `execution_operation_workflow_events`, unique by
  workspace/actor/request key;
- workspace/created and workspace/triage keyset indexes;
- a backfill for existing F0 plans.

Workflow writes run at `SERIALIZABLE`, retry only SQLSTATE `40001`/`40P01`, at
most three fresh attempts with bounded backoff. Each accepted transition writes
the queue row, workflow event and `product_audit_events` in one transaction.
Version mismatch, acknowledge-after-ack, resolve-before-ack and request-key
reuse for another action all return typed conflicts. No workflow transition
writes `outbox_messages`.

## 4. Evidence

- Control API: 17 suites, 155/155 tests on fresh PostgreSQL; TypeScript build,
  nine-migration gate and dump/restore signature pass.
- Scale: 182,000 queue records; exact count, bounded 250-row response and
  signed forward/back cursor behavior pass.
- Workflow: ADMIN denial, acknowledge-before-resolve, request replay, stale
  version conflict, concurrent equal-key serialization to one event/one replay,
  immutable source-result trigger, two workflow events, two audit events and
  zero outbox messages pass.
- Contracts: 41/41 schema/fixture tests plus OpenAPI/generated declaration
  parity pass.

The scale assertion is a deterministic integration budget, not an end-to-end
SGP↔AWS latency SLO. Live cross-cell performance remains D3/D4 evidence.

## 5. Residual work

F1a does not make Incident Detail source-backed. The next safe SGP slice is
`EX-BE-05b/F1b`: Portal incident records, assignment/annotation/evidence and
correlation to queue operations, still source-dark. Purpose-built Trading
System routes for command journal, findings, alerts, dead letters, trace order,
streams and alpha activity remain external contract blockers.

D2/D3/D4 progress independently: AWS-HK hosts only the bounded Rust Edge,
Source Proxy, projection PostgreSQL and migrator. Full Portal/Control API and
this queue remain on SGP.
