# EX-BE-05b/F0 — Offline Operations Contract Foundation

Date: 2026-08-22  
Branch: `feat/execution_loop`  
Status: `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`  
Scope: Portal-owned catalogue, typed conditions, blocked operation planning and
deny-by-default Rust relay primitives only

## 1. Acceptance decision

F0 is accepted as an offline foundation. It gives the Portal and Claude one
canonical contract for Admin Action Drawer while granting no Trading System
authority:

- exactly 64 immutable `noun/verb` catalogue entries are generated from the
  supplied read-only Trading System contract pack;
- all entries have `portal_reachable=false` in F0;
- eight `ops` actions without purpose-built Trading System HTTP routes remain
  `UNPUBLISHED`;
- generic `redis/get` and `redis/scan` remain prohibited capabilities;
- TypeScript can create only immutable `BLOCKED` plans and never an apply token
  or outbox command;
- apply always fails before relay/source construction with
  `COMMAND_RELAY_DISABLED`, `source_request_sent=false` and
  `retry_allowed=false`;
- the Rust relay boundary has no HTTP client and models replay, payload conflict
  and `UNCERTAIN` reconciliation without retry;
- every runtime, source, realtime and command flag remains false.

This phase did not connect AWS-HK, start D1/D2, read a Trading System source,
modify Trading System, access its PostgreSQL/Redis/CLI, or change a registry
delivery profile. Stable v1.0.1 was not touched.

## 2. Canonical contract and provenance

`packages/contracts/tooling/generate-execution-command-catalog.mjs` consumes:

- `extract/cli-command-map.json` at Trading System commit
  `9081397de9e981c43b4e0f67fabe747e7ed964c7`;
- `openapi.sanitized.json` from the same immutable contract pack.

It verifies the source contains 64 unique actions and emits both the public
fixture and the TypeScript server constant. The output carries SHA-256 digests
of both source documents so a contract-pack change cannot masquerade as the
same catalogue revision.

Each entry publishes command/action/group, conservative risk, source risk,
plan/apply/verify facts, source route state, observed HTTP mapping when exact,
blocked reason and source reference. `allocation/<root>` receives an R1 floor;
it cannot fall to R0 until the owner publishes a narrower semantic ruling.

The eight stop-gated actions are:

`ops/trace-order`, `ops/dead-letters`, `ops/findings`, `ops/streams`,
`ops/command-journal`, `ops/redis-retention`, `ops/alerts` and
`ops/alpha-activity`.

F0 does not create the missing routes. Their owner remains the Trading System
contract owner; Codex may add a Portal compatibility adapter only after typed,
authenticated, bounded routes are published.

## 3. TypeScript control-plane boundary

The session-guarded same-origin API now exposes:

- `GET /api/v1/execution/commands/catalog`;
- `POST /api/v1/execution/commands/plans` for
  `execution.command-plan-request.v1`;
- `POST /api/v1/execution/operations/{operation_id}/apply` for the execution
  command discriminator, always denied in F0;
- `GET /api/v1/execution/operations/{operation_id}` returning `BLOCKED` and
  `verification_result=NOT_STARTED`.

Planning is ADMIN-only, workspace-bound, Origin/CSRF-protected and request-key
idempotent. The canonical payload hash binds command version/key, environment,
target/version, payload and conditions. Equal replay returns the same operation;
payload drift returns `REQUEST_KEY_PAYLOAD_CONFLICT`.

Migration `1723680000006_execution-operations-f0.sql` adds an immutable F0
plan table with database CHECK constraints that prohibit non-blocked status,
relay capability and source side effects. Plan insert and denial audit are one
serializable transaction. No outbox row is written. A post-migration test gate
requires both seven migration records and the F0 relation, preventing the
"recorded but not applied" class of migration failure.

## 4. BR-EX-29 typed conditions

The canonical condition is now:

```json
{
  "text": "Keep gross notional below the reviewed paper capacity.",
  "owner": "risk-team",
  "deadline": "2026-09-01",
  "expires_at": "2026-09-30",
  "blocking": true
}
```

Governance accepts either canonical `conditions[]` or the deprecated singular
`condition`, never both. New canonical writes preserve all typed conditions in
PostgreSQL; the singular column/response remains a transition-only first-text
alias. TypeScript and PostgreSQL both enforce bounded cardinality, exact keys,
date shape, expiry not before deadline and uniqueness. Decision rows remain
append-only.

## 5. Rust relay boundary

The new `command-relay` crate is intentionally pure and non-operational:

- `RelayPolicy` always denies with no source request;
- there is no network client, source credential or command endpoint;
- a same-key/same-payload registration replays the original operation;
- same-key/different-payload fails with `PayloadConflict`;
- an ambiguous outcome becomes `UNCERTAIN` and cannot be retried until an
  external source-reconciliation contract exists.

The Edge refuses startup when `EDGE_COMMAND_RELAY_ENABLED=true`. The Control
API independently refuses startup when `FEATURE_EXECUTION_COMMAND_RELAY=true`.
D1, D2 and production manifests explicitly set both flags false, and preflight
tests reject attempted activation.

## 6. Verification evidence

- Contract gate: schema/fixture validation, catalogue regeneration drift and
  OpenAPI generated-type parity pass.
- Control API gate: fresh PostgreSQL migration/build/tests and dump/restore pass;
  146 tests include catalogue auth, 64-entry invariants, immutable plan,
  no-outbox, replay/conflict, role denial and denied apply/readback.
- Rust gate: 94 tests, strict Clippy and PostgreSQL restore pass; 5 are dedicated
  to the F0 relay/catalogue/idempotency boundary.
- D1/D2 gates assert relay false and reject any non-dark configuration.
- Root verification tracks every F0 contract, migration, TypeScript service,
  Rust crate and closeout document.

The migration defect found during verification was real: the first F0 SQL file
lacked `-- Up Migration`, so node-pg-migrate recorded revision seven without
applying the schema. The marker was restored and the explicit relation gate was
kept as a permanent regression control.

## 7. Claude handoff

Claude may now replace the Phase 6 fixture catalogue with the generated
`execution-operations.d.ts` contract on Lane A and send canonical
`conditions[]`. The frontend must:

1. render all 64 entries from the server catalogue rather than hardcode a
   second feature model;
2. keep `portal_reachable=false` entries visible but unavailable with their
   exact `blocked_reason`;
3. keep the eight unpublished `ops` actions unavailable;
4. preserve plan/apply/verify facts per entry instead of assuming every
   mutation has all three stages;
5. treat blocked plan and denied apply as expected F0 states, never success;
6. remove condition flattening only after using typed `conditions[]` end to end;
7. keep Phase 6 outside production navigation/profile activation until a later
   reviewed gate.

The detailed consumer map is
[`CODEX_TO_CLAUDE_EX_BE_05B_F0_HANDOFF.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F0_HANDOFF.md).

## 8. Residual work and next backend step

Full EX-BE-05b remains `PRODUCTION_INACTIVE`. It still requires owner-published
Trading System command/auth/idempotency/terminal-outcome contracts, exact typed
routes, D1–D3 transport evidence, durable cross-cell journal/receipt
reconciliation, risk-tier step-up/SoD policy, load/fault/soak evidence and an
explicit activation decision.

Without IAM, the next safe backend work is the Portal-owned portion of
Operations Queue/Incident workflow: define bounded operation/incident records,
acknowledge versus resolve semantics, evidence/optimistic-concurrency rules and
keyset read contracts using fixture or Portal-owned data only. Source-backed
`command-journal`, findings, alerts, dead letters and trace-order adapters stay
blocked until the Trading System owner publishes their purpose-built HTTP
contracts.
