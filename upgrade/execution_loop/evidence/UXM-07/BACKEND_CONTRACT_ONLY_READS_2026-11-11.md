# Contract-only Execution reads: what the Portal answers without a source, and what it must be asked for (11 November 2026)

Package BK1 (Bobby handed the backend role to Claude: "do the remaining owed backend, all of it, smartly"). It follows B3
(`TypedAbsenceController`, four reads) and decides the nine reads the frontend sends through optional ports for which no control-api
controller exists (`scripts/audit/execution-v2-route-coverage.mjs`, finding (1)).

Rule applied to each route: a no-source answer is served only if the published contract itself can state "no owning source" in a body that
asserts no value: every shape the body must carry is either an echo of what the request named and the Portal validated, or an optional
section, and omitting an optional section is the contract's own `NO_SOURCE` (the strict reader, `strictRead.ts` `obj`, reads omitted as
`NO_SOURCE` and `null` as `NOT_READ`). A required field that asserts a state, a count, a list, a zero or an empty set cannot be satisfied
without inventing a value, so the route stays unserved and the exact request is written here. Nothing below touches a database, an Edge,
a mutation or a Live path.

## 1. Decisions

| Route | Contract | Decision | Why |
|---|---|---|---|
| `GET /api/v1/execution/blotter/summary` | `execution-blotter-summary.openapi.json#executionBlotterSummaryGetV1` | **(A) served** | Required: envelope and `environment` (an echo of the validated `environment` query). `status_buckets` and `funnel` are optional (`anyOf` array/null): omitted. A request that names no `environment` gets the published 404 (the body cannot name one). |
| `GET /api/v1/execution/cost-events` | `execution-cost-events.openapi.json#executionCostEventsGetV1` | **(A) served** | Required: envelope and `subject {type,id}` (echo of validated `subject_type` in the contract enum and `subject_id` in the id grammar). `events`, `totals` optional: omitted. `window` is validated and never echoed. |
| `GET /api/v1/execution/grants` | `execution-grants.openapi.json#executionGrantsGetV1` | **(A) served** | Same: envelope and subject echo, `items` omitted. |
| `GET /api/v1/execution/limits` | `execution-limits.openapi.json#executionLimitsGetV1` | **(A) served** | Same: envelope and subject echo, `items` omitted (no `used_ratio`, state or cap is stated). |
| `GET /api/v1/execution/recovery-events` | `execution-recovery-events.openapi.json#executionRecoveryEventsGetV1` | **(A) served** | Same: envelope and subject echo, `events` omitted. |
| `GET /api/v1/execution/reports` | `execution-report-snapshots.openapi.json#executionReportSnapshotsGetV1` | **(A) served** | Same: envelope and subject echo, `items` omitted. |
| `GET /api/v1/execution/readiness` | `execution-alpha-readiness.openapi.json#executionAlphaReadinessGetV1` | **(B) requested** | `items` is a REQUIRED array. The only body the schema accepts without a source is `items: []`, which is the contract's `empty` fixture: "this fleet has no alpha". The Fleet KPIs (Ready for exit, Archive in progress), the 7-segment stage and the Archived lens would read that as a zero. No `null`, no omission. |
| `GET /api/v1/execution/commands/{operation_id}/receipt` | `execution-command-receipt.openapi.json#executionCommandReceiptGetV1` | **(B) requested** | `command_key`, `request_key`, `state` (PLANNED/DENIED/APPLIED/VERIFIED/FAILED/EXPIRED) and `side_effect` are REQUIRED. Every body asserts a command state (and a relay state). The contract's "typed absence" for a command with no receipt is the unserved 404, which the port already reports as unavailable. |
| `GET /api/v1/execution/search` | `execution-entity-search.openapi.json#executionEntitySearchGetV1` | **(B) requested** | `groups` is REQUIRED and each group carries `rows` (required). A group with `rows: []` states "nothing matched" and `total_matched: null` only says the count is unknown, not that the kind was not searched. The contract defines no "not commissioned" result and the route has no 404 response. It also needs per-kind authorization (operations, incidents and approvals are Portal PG records; alphas, portfolios and accounts come from the Manager source under the read scope), so an answer that searched any kind would need the PG cell for every negative case. The command bar keeps fanning out to the list reads. |

## 2. How the six served routes behave (all in `TypedAbsenceController`, same rules as B3)

- Unmounted by default: AppModule dependency key `typedAbsence`, mounted only on `EXECUTION_READ_PROFILE=retained_review_v1`
  (`typedAbsenceDependency`, unchanged from B3: the same controller carries the new routes, so there is no new AppModule or main.ts line).
- `SessionGuard`, then the same `canReadExecution(workspace, user, environment)` as B3 (blotter passes its `environment`); `Cache-Control: private, no-store` on every answer.
- Query: unknown keys and repeated keys are `400 EXECUTION_READ_QUERY_INVALID`; so are an `environment` outside `paper|sandbox|live`, a `subject_type` outside the contract's seven kinds (case-sensitive) and a `subject_id` outside `^[A-Za-z0-9._:-]{1,191}$`. The 400 comes before the workspace check, as for B3's reads.
- A request that is valid but names no `environment` (blotter) or no subject (the other five) cannot be answered by a body that names it: it gets the published `404 EXECUTION_READ_NOT_AVAILABLE`, after the workspace check, so an unreadable workspace is never told what was missing. Both published codes are in each route's own `*Problem` enum; no off-contract code is used.
- Only the validated scope is echoed. No count, bucket, funnel, state, ratio, cap, currency or zero is stated; no database or Edge read; no existence of the subject is confirmed (the same stance as B3's echoed `alpha_id`).

## 3. Exact requests for the three (B) reads (owner: Codex with the Edge/Core inputs in `WP_K_CONTRACTS_2026-10-23.md`; Claude consumes)

1. `GET /api/v1/execution/readiness` (GAP-9)
   - Needed: a producer that states, per alpha the caller may see in the environment, `readiness {met,total}` (gate readiness, `total >= 1`) and `archive_state`. Until one exists the route stays unserved (404 = unavailable).
   - Contract change that would make a no-source answer honest (Codex decides): make `items` optional/nullable like every other sibling (`anyOf [array, null]`) so that "omitted" is `NO_SOURCE` and `null` is `NOT_READ`; the strict reader (`siblings.generated.ts#alpha-readiness`) would then need `S.sec(...)` on `items`. Both are contract and generator changes (`packages/contracts/tooling/generate-execution-siblings.mjs`), which Claude does not make without Codex.
2. `GET /api/v1/execution/commands/{operation_id}/receipt` (GAP-2)
   - Needed: the Portal command-operation record (state, command_key, request_key, side_effect) joined to the Edge receipt (`receipt_ref`, `content_hash`, `what_changes`, verification). Source: the command-operation store, which exists only under Codex's in-flight `command-status-*` / `command-source-assertion*` work, so Claude does not build it.
   - No honest no-source body exists: the 404 stays the typed absence.
3. `GET /api/v1/execution/search` (FE-023)
   - Needed: per-kind authorization decided before any row: operations, incidents and approvals from the Portal PG records, alphas, portfolios and accounts from the Manager source under the read scope; `total_matched` an integer only when the source counted it.
   - Contract change that would allow a typed answer: a per-group not-commissioned state (for example `groups[].state: "NOT_COMMISSIONED"` with `rows` omitted) or `404 EXECUTION_READ_NOT_AVAILABLE` published on this route (today it lists 200, 400, 401 and 503 only). Until then the bar fans out to the list reads and matches in the browser.

## 4. Evidence

- `apps/control-api/test/typed-absence-http.spec.ts` (per added route: 200 body validated against the contract's own schema, key set pinned to the envelope plus the echoed scope, 401, 404 for an unreadable workspace and for an unnamed scope, 400 for unknown, repeated and malformed keys, problem bodies validated against the contract's `*Problem` schema).
- `apps/portal/frontend/src/execution/v2/readers/siblings.typedAbsence.test.ts` (the produced bodies pass the published schema and the generated strict reader, which reads every omitted section as `NO_SOURCE`).
- Ledgers: route inventory, capability inventory and release-integrity pins refreshed in the same change (see the commit messages).
- Not claimed: no source receipt, no PG cell, no network, no Edge, no mount. The routes answer nothing until the coordinator wires the existing `typedAbsence` key.
