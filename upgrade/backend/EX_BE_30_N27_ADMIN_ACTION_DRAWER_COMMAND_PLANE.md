# EX-BE-30 — N27 Admin Action Drawer Command Plane

**Status:** `COMPLETE / CURRENT_SOURCE_CLASSIFIED / SOURCE_COMMAND_DARK`  
**Date:** 2026-08-30  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** no command identity, relay, source dispatch or Trading System mutation

## 1. Result

N27 turns BR-EX-68 into a server-owned, typed catalogue rather than a
hard-coded browser list. It covers exactly 24 operator tasks in six groups and
classifies the complete 64-entry owner CLI/API catalogue without treating CLI
presence as Portal authority.

Current source truth is:

- `CONNECTED`: 0;
- `SUPPORTED_BUT_INACTIVE`: 14; and
- `SEMANTICALLY_INCOMPATIBLE`: 10.

The accepted N16B `live.emergency-close` primitive is correctly classified as
compatible-but-inactive and retains its WebAuthn/two-person policy. Direct
Redis, ambiguous/unpublished routes and host-destructive resets cannot become
incidental Portal commands.

## 2. API and form contract

The ADMIN/session/workspace-scoped API exposes:

```text
GET  /api/v1/execution/commands/tasks
POST /api/v1/execution/commands/tasks/{task_id}/run
POST /api/v1/execution/commands/tasks/{task_id}/plan
```

The catalogue publishes bounded registry-backed parameters, constraints,
risk/step-up/SoD metadata, typed-confirm words, current source classification
and factual reason codes. There is no raw shell, SQL, hostname, generic URL,
credential field or arbitrary JSON object. Requests accept at most eight
primitive allowlisted parameters and the existing payload policy rejects
credential-like data.

Every R0 run is currently rejected before dispatch and writes only an audit
record plus parameter digest. A mutation can create the existing idempotent,
five-minute, hash-only blocked plan after CSRF/origin/session/workspace/ADMIN,
typed-key, reason and optimistic-version checks. Conflicting request-key reuse
returns HTTP 409. Apply remains denied; no outbox/source request, raw payload,
transcript or secret is stored.

## 3. Honest source-dark boundary

No current owner catalogue entry has both an activated dedicated Portal
command identity and authoritative terminal verification. N27 therefore does
not mark any task `CONNECTED` and does not expose a clickable control that can
pretend to succeed. This closes the Portal-owned current-source phase without
inventing a relay.

Future activation is per task, never global. It requires an exact immutable
route/schema, environment/target policy, command identity, step-up/SoD,
idempotency or uncertainty semantics and terminal verify contract. A direct
owner semantic may use a controlled direct-apply wrapper, but HTTP 202 remains
non-terminal and an ambiguous dispatch is never automatically retried.

## 4. Verification

- canonical JSON Schema, OpenAPI, generated TypeScript and exact 24-task
  fixture validation;
- exact task order, six groups, bounds and 14/10/0 classification counts;
- all 64 source catalogue entries receive one of the three states;
- unknown task/parameter, credential-like payload, role/workspace/session,
  CSRF/origin and mutation/read-mode negative tests;
- idempotent blocked plan, payload-conflict 409, hash-only persistence,
  immutable audit and zero-outbox/source-dispatch assertions;
- exact N16B protective classification and two-person metadata;
- release manifest, rollback, secret and no-arbitrary-path static gates; and
- full Control API fresh-PostgreSQL build/test/restore gate.

## 5. Closeout

There is no dead enabled Drawer control and no unbounded command path. The
source-command transport remains an explicit external activation gate, not an
unfinished hidden implementation. N28 may request only the exact command
semantics that the N18/N27 evidence proves genuinely absent; it must not reopen
these source-honesty or safety decisions.

