# EX-BE-05 / N09 Portal-owned governance and workflow gaps

Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`

Date: 2026-08-26

## 1. Outcome

N09 closes the source-independent backend gaps BR-EX-30, 31, 32, 33, 35, 36,
37 and 38. Portal now has canonical contracts, PostgreSQL persistence,
repositories, APIs, generated TypeScript readers and regression evidence for
the governance chain, explicit operation ownership and a bounded Sandbox smoke
plan.

This slice is Portal control-plane work only. It did not change Trading System
code, AWS-HK runtime, source routes, network policy, broker access, registry
activation or command authority. Every new delivery flag remains false.

Later hi-fi requests BR-EX-41…58 remain recorded in the unified intake ledger.
They are not silently claimed by this closeout: they must be triaged into N09
extensions, N10 analytics, N11 external reads or N13 product activation with
their own contract and evidence.

## 2. Locked product semantics

### 2.1 `REQUEST_CHANGES`

`REQUEST_CHANGES` terminates exactly one immutable approval attempt as
`CHANGES_REQUESTED`. It:

- requires one to sixteen typed remediation conditions;
- preserves the reviewed evidence and decision forever;
- does not deny or close the governed promotion gate;
- does not create a replacement approval automatically;
- never gives a reviewer permission to replace research evidence.

A future trusted-intake flow may create a new approval with
`supersedes_approval_id`. That intake route is deliberately absent from N09;
there is no public “resubmit” shortcut.

### 2.2 Operations `Mine`

`assigned_to=me` means explicit ownership only. It never aliases creator,
acknowledger or resolver. Acknowledging an unassigned operation atomically
self-assigns it; acknowledging an already assigned operation does not steal it.

### 2.3 Sandbox smoke plan

The optional smoke plan is immutable bounded evidence:

- exact positive decimal `qty` and `cap`, with `cap >= qty`;
- uppercase currency identifier;
- five to 240 minute timebox;
- immutable operator identity and bounds;
- one forward transition from `PLANNED` to `APPROVED` or `REJECTED`;
- `source_side_effect_requested=false` enforced by schema and PostgreSQL.

It is not an execution request, source command or promotion authority.

## 3. Persistence and repository boundary

Migration `1723680000012_execution-n09-governance-workflow.sql` adds:

- `CHANGES_REQUESTED`, `REQUEST_CHANGES` and approval supersession lineage;
- immutable `governance_approval_known_limitations`;
- immutable `governance_r2_lineage` bound to one workspace, R1 and R2 gate;
- `governance_approval_history`, ordered for bidirectional keyset reads;
- operation assignment timestamps and `execution_operation_queue_read`,
  including the latest nullable incident link;
- immutable bounded `governance_sandbox_smoke_plans`.

Database constraints and triggers protect terminal shapes, typed condition
requirements, exact smoke-plan bounds and append-only evidence. The down
migration restores the previous constraints and removes the N09 objects in
dependency-safe order. Dump/restore signatures now include every N09 table,
view and critical field.

## 4. API and contract delivery

### Governance

- `GET /api/v1/execution/governance/approvals/:approval_id/r1`
  includes typed `known_limitations[]` and `can_request_changes`.
- `GET /api/v1/execution/governance/approvals/:approval_id/r2`
  publishes R1 reference/state/expiry/digest, grant, required approver role,
  plan author, evidence manifest and fail-closed eligibility locks.
- `GET /api/v1/execution/governance/approvals/history`
  provides exact total/filtered counts, allowlisted filters and signed
  bidirectional keysets over immutable terminal attempts.
- Existing plan/apply routes accept `REQUEST_CHANGES` with CSRF, ADMIN RBAC,
  separation of duties, idempotency and optimistic concurrency unchanged.

R2 refuses approval when lineage is absent, R1 is not approved, R1 expired,
R1 evidence is incomplete or the stored manifest no longer matches its
immutable entries. Legacy R2 records are represented honestly as missing
lineage; no grant or approver is invented.

### Operations and Sandbox

- Operations Queue accepts canonical `assigned_to=me` and returns typed
  `assigned_to`, `assigned_at` and nullable `incident_id`.
- Sandbox Certification create/read responses carry the optional bounded
  smoke plan. Approval follows the existing certification decision and cannot
  produce a Trading System outbox message.

### Canonical artifacts

- `packages/contracts/schemas/execution-governance-approval-workflow.v1.schema.json`
- `packages/contracts/schemas/execution-governance-r2-review.v1.schema.json`
- `packages/contracts/schemas/execution-operations.v1.schema.json`
- `packages/contracts/schemas/execution-sandbox-certification.v1.schema.json`
- matching canonical fixtures under `packages/contracts/fixtures/`
- Governance OpenAPI v1.3.0 and generated
  `execution-governance.d.ts`, `execution-operations.d.ts`, `portal-api.d.ts`
- regenerated contract, BAR-02 compatibility and BAR-05 freeze snapshots.

## 5. Registry and activation safety

Registry revision 5 / delivery-policy revision 2 adds
`governance_write_enabled` as an independent policy. It cannot be inferred
from command plan/apply/relay, Query or SSE flags. All registry entries and
public fixtures currently publish it as `false`.

Therefore the new API can be built and tested without implying that a deployed
screen may mutate governance. Runtime promotion remains a later reviewed
registry operation.

## 6. Verification evidence

The following gates passed in the N09 worktree:

- `./scripts/control-api-test.sh`: TypeScript build, fresh PostgreSQL migration,
  Control API suites and dump/restore signature;
- `./scripts/contracts-test.sh`: 52/52 contract/codegen tests;
- frontend full Vitest suite including 393 Execution tests, followed by the
  production Vite build;
- Python 3.12.14 Research regression: 404 collected, 403 passed and one
  environment-dependent historical-data test skipped. Memory-heavy QuantBT
  tests were isolated into fresh processes after the all-in-one runner retained
  memory; every case passed individually;
- N09-focused registry regression: 64/64;
- schema fixture validation, exact R2 lineage/expiry/tamper tests,
  `REQUEST_CHANGES` plan/apply/history tests, assignee concurrency tests and
  smoke-plan immutability/negative tests.

No test evidence is relabeled as real Trading System or production evidence.

## 7. Claude handoff

Claude can integrate the generated N09 contracts now while keeping all writes
disabled by policy. The exact consumer rules are in
`../upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N09_GOVERNANCE_WORKFLOW_HANDOFF.md`.

The AWS-HK owner should continue waiting. N09 introduces no source capability;
the final consolidated N02/N03/N11 read pack will be sent only after the Portal
finishes defining the external read surface, avoiding one Trading System change
per later phase.

## 8. Next backend phase

N10 is next: canonical series and insight analytics contracts/pure engines that
can be completed source-dark. N11 then consolidates every required external
read capability into one final owner request. N12 command relay and N13 product
activation remain separate authority gates.
