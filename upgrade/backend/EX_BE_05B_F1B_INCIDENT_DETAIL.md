# EX-BE-05b/F1b — Portal Incident Detail

Date: 2026-08-23  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Runtime cell: SGP Research Portal only

## 1. Decision and authority boundary

F1b delivers the Portal-owned half of Phase 8 Incident Detail. It is a
TypeScript/PostgreSQL control-plane workflow on SGP. It is not an AWS-HK Edge
service, a Trading System implementation or a source-availability claim.

The forward-only workflow is `OPEN → MITIGATED → RESOLVED`.

The Portal owns incident identity, acknowledgement, assignment, operator
annotations, hash-only evidence references and correlation to Portal operation
records. It does not own Trading System findings, alerts, dead letters or
order traces. Those four panels are typed `unavailable`, carry their original
`EXECUTION` authority and contain no invented data.

Every response locks the following invariants:

- `record_authority=PORTAL` and `delivery_profile=fixture`;
- `source_integration_state=UNAVAILABLE`;
- `source_side_effect_requested=false`;
- `deployment_resume_requested=false`;
- no AWS-HK, Trading System, DB, Redis, CLI, broker, relay or outbox call;
- resolving an incident never resumes a deployment.

## 2. API and workflow contract

All routes require a valid Portal session, ADMIN role and workspace
membership. Mutations additionally require same-origin and CSRF validation.

- `POST /api/v1/execution/operations/incidents` creates an incident and may
  correlate up to 20 same-workspace Portal operations;
- `GET /api/v1/execution/operations/incidents/{incident_id}` returns one
  bounded detail document;
- `POST .../{incident_id}/acknowledge` records acknowledgement;
- `POST .../{incident_id}/assign` binds a current workspace member;
- `POST .../{incident_id}/annotations` appends a bounded operator note;
- `POST .../{incident_id}/evidence` appends a SHA-256 reference, schema,
  declared authority and capture time without storing an artifact body;
- `POST .../{incident_id}/operations` appends a same-workspace operation
  correlation;
- `POST .../{incident_id}/mitigate` advances only when acknowledged, assigned
  and backed by a stored `MITIGATION_ATTESTATION` hash;
- `POST .../{incident_id}/resolve` advances only from `MITIGATED` with a
  stored `CLEAN_DRY_RUN` hash and a bounded reason.

Mutation requests include a unique `request_key` and
`expected_workflow_version`. Equal retries replay the durable result; reuse for
another action, incident or payload returns a typed conflict. Credential-like
assignments in title, summary, annotations, evidence summary or resolution
reason fail validation before persistence.

Detail collections expose `total_count`, `returned_count`, `truncated` and at
most 250 rows for operations, evidence, annotations and timeline. The frontend
must not manufacture totals or infer source completeness from the Portal
timeline.

Canonical artifacts:

- `packages/contracts/schemas/execution-operations.v1.schema.json`;
- `packages/contracts/openapi/execution-operations.openapi.json`;
- `packages/contracts/generated/execution-operations.d.ts`;
- `execution-incident-detail.open.valid.json`;
- `execution-incident-workflow.resolved.valid.json`.

## 3. PostgreSQL and transaction model

Migration `1723680000009_execution-incidents.sql` adds:

- `execution_incidents`, with database workflow-shape checks and immutable
  identity/authority/source-side-effect fields;
- same-workspace `execution_incident_operation_links`;
- append-only `execution_incident_annotations`;
- append-only `execution_incident_evidence`;
- append-only, request-key-unique `execution_incident_events`;
- exact workspace/incident foreign keys and timeline indexes.

Writes use fresh `SERIALIZABLE` transactions with at most three bounded
attempts. SQLSTATE `40001`/`40P01` and the exact event request-key race are the
only retry conditions. The incident row, append-only event and
`product_audit_events` record commit atomically. Detail is loaded after commit
through the PostgreSQL pool, avoiding concurrent queries on one transaction
client and shortening lock duration.

Incident version increments exactly once per accepted write. Resolved
incidents and child history are immutable. No mutation writes
`outbox_messages`.

## 4. Evidence

- Control API: TypeScript build and 18 suites, 159/159 tests on fresh
  PostgreSQL pass.
- Migration/DR: ten-migration gate and full custom dump/restore signature,
  including all five incident tables, pass.
- Workflow: ADMIN/workspace/Origin/CSRF, create replay/drift conflict,
  optimistic-version conflict, cross-workspace correlation refusal,
  acknowledge/assign/mitigate/resolve ordering and exact evidence gates pass.
- Concurrency: equal concurrent creates serialize to one incident, one event,
  one audit record and one replay.
- Safety: credential-like note rejected, source/authority mutation rejected,
  append-only history enforced, all source panels unavailable and outbox count
  remains zero.
- Contracts: 44/44 JSON Schema fixture/semantic tests plus OpenAPI/generated
  TypeScript parity pass.

These are SGP control-plane integration results. They do not claim cross-cell
latency, Trading System parity or production source availability.

## 5. Residual work

Claude can now integrate Phase 8 Lane A using the generated contract and two
fixtures. Registry/profile activation remains prohibited.

Source-backed findings, alerts, dead letters and trace-order require dedicated
Trading System read contracts, the dedicated Paper read identity and accepted
D2→D3→D4 evidence. The Portal must add compatibility adapters at that time; it
must not replace those contracts with direct database, Redis or CLI access.

D2 remains a separate AWS-HK infrastructure lane. The full Portal, Control API,
this workflow and its product database stay on SGP. AWS-HK will host only the
minimal Source Proxy/Rust Edge/projection boundary after IAM isolation, signed
images, workload identity and change-window gates are accepted.
