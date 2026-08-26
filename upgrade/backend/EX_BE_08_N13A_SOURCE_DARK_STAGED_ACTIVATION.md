# N13A — Source-dark staged activation foundation

Status: `PORTAL_FOUNDATION_COMPLETE / SOURCE_DARK / N13B_OWNER_RETURN_PENDING`  
Date: 2026-08-26  
Authority: Portal TypeScript control plane + isolated Portal PostgreSQL

## 1. Outcome

N13A implements the control-plane half of staged product activation without
selecting or contacting a Trading System source. It adds a legal delivery-
profile graph, seven independently versioned capability records, immutable
compatibility/evidence references and authenticated plan/apply/verify APIs.

The database—not only application code—currently enforces:

- effective profile is exactly `fixture`;
- source and runtime flags are `false`;
- the capability kill switch is engaged;
- imported owner authority is `false`;
- evidence references are structurally valid metadata only, with
  `owner_accepted=false` and `trusted_for_activation=false`.

A future N13B needs an explicit reviewed migration before any of those
constraints can change. Completing N13A therefore cannot activate Query, SSE,
R1, R2, R3 or R4 by configuration drift.

## 2. Capability and profile model

The seven independent capability keys are:

1. `PROJECTION`;
2. `QUERY`;
3. `SSE`;
4. `COMMAND_R1`;
5. `COMMAND_R2`;
6. `COMMAND_R3`;
7. `COMMAND_R4`.

The target ladder is:

```text
fixture -> shadow -> paper -> sandbox -> live_canary -> live_full
```

There is no global green switch. N13A evaluates one capability at a time and
only accepts a promotion to the immediately adjacent profile. Because the
effective profile is still `fixture`, `fixture -> live_full` is denied rather
than interpreted as a shortcut.

All non-fixture promotions remain `BLOCKED` even when their references are
well-formed. The canonical blockers include owner acceptance, N06 real Paper
evidence and the source-dark runtime lock. Missing, expired or mismatched
references add `EVIDENCE_PARTIAL`, `EVIDENCE_STALE` or
`CONTRACT_INCOMPATIBLE` without replacing the primary owner gate.

The one applicable N13A operation is an affected-capability-only rollback to
`fixture`. It increments only that capability version, reasserts both false
flags and the kill switch, then requires a separate verify transition.

## 3. PostgreSQL ownership and durability

Migration `1723680000013_execution-staged-activation.sql` adds:

- `execution_activation_capabilities`: current per-capability state and
  optimistic version;
- `execution_activation_plans`: request-key-bound immutable intent plus
  bounded lifecycle (`READY|BLOCKED|DENIED|APPLIED|VERIFIED`);
- `execution_activation_evidence_refs`: hash/signature/reference metadata;
- `execution_activation_compatibility_requirements`: exact revision and digest
  requirements;
- `execution_activation_events`: append-only plan/apply/verify journal.

Evidence, requirements and transition events reject update/delete. Every
mutation runs in a SERIALIZABLE transaction and writes the domain state,
`product_audit_events` and `outbox_messages` atomically. Apply/verify use both
plan and capability optimistic versions. Duplicate request keys replay exactly;
the same key with a different intent returns a typed 409.

No runtime credential, artifact body, owner business data, DSN, Trading System
row, Redis value, CLI result or broker payload is stored.

## 4. TypeScript APIs

All routes are session-guarded and workspace-scoped:

| Method | Route | Meaning |
|---|---|---|
| GET | `/api/v1/execution/activation/capabilities` | seven independent effective/desired states |
| POST | `/api/v1/execution/activation/plans` | ADMIN + origin/CSRF; create/replay immutable plan |
| GET | `/api/v1/execution/activation/plans/{plan_id}` | durable plan/evidence/requirement snapshot |
| POST | `/api/v1/execution/activation/plans/{plan_id}/apply` | ADMIN + origin/CSRF; N13A permits fixture rollback only |
| POST | `/api/v1/execution/activation/plans/{plan_id}/verify` | ADMIN + origin/CSRF; verifies persisted source-dark result |

Apply returns HTTP 202 because it is not terminal. Verify is the authoritative
terminal control-plane result. Neither response claims source activation.

Evidence input validates digest, schema revision, signer fingerprint,
detached-signature shape, expiry and exact compatibility metadata. N13A does
not cryptographically accept the signer or import owner bytes; that is N13B.

## 5. Canonical frontend boundary

The contract workspace adds:

- `execution-staged-activation.v1.schema.json`;
- `execution-staged-activation.openapi.json`;
- generated `execution-staged-activation.d.ts`;
- a seven-capability source-dark fixture;
- a blocked promotion fixture;
- a seven-state Claude corpus: fixture, denied, incompatible, stale, partial,
  rollback and restart.

Schemas hard-code false runtime authority. Hashes and signer fingerprints are
audit/detail fields; the primary UI should show profile, state, blockers and
operator recovery, not raw digests.

## 6. Verification evidence

Required gates:

- TypeScript compile;
- fresh PostgreSQL 16 migration and table/constraint gate;
- API session/workspace/RBAC/origin/CSRF matrix;
- exact replay, request-key drift and optimistic version conflict;
- denied/partial/stale/incompatible promotion corpus;
- blocked promotion apply;
- fixture rollback apply, apply replay, verify and repository re-instantiation;
- affected-capability-only rollback assertion;
- database rejection of runtime enable and evidence trust mutation;
- atomic audit/outbox counts;
- PostgreSQL dump/restore signature;
- canonical AJV/OpenAPI/generated-type contract gate.

Final command counts are recorded in the closeout commit and shared tracker.

## 7. Explicit non-goals

N13A did not:

- import the owner master return or trust a candidate;
- call AWS-HK, Source Proxy or Trading System;
- change WireGuard, mTLS, JWT, secrets, IAM or network rules;
- read orders/fills/positions/events;
- activate projection, Query, SSE, analytics or commands;
- change registry delivery profiles;
- modify Trading System code or databases.

## 8. Rollback

Before merge, rollback is removal of the N13A source/migration/contracts. After
deployment, use the migration down path only in a controlled change window and
only if no N13A plans must be retained. Product rollback is narrower: create an
ADMIN rollback plan for the affected capability, apply once and verify. It
does not change any sibling capability.

## 9. Next backend phase

N13B remains blocked on the exact accepted owner master return plus N06 real
Paper evidence. Portal work that does not depend on those bytes can continue
with N14A release authority. N13B must first import and verify exact owner
bytes, then promote one read-only Paper capability `fixture -> shadow`; it may
not remove every database lock or activate all capabilities together.
