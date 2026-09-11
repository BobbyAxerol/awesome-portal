# BE-R2-6 — Governance read truth, V1 compatibility and idempotency closeout

**Status:** code complete; runtime unchanged  
**Scope:** Portal-owned Control API and generated contracts only  
**Date:** 2026-09-11

## Contract decisions

1. `pinned_watchlist` remains a required **deprecated** V1 compatibility
   member.  Its only authoritative value is the fixed empty list: the former
   pin writer was retired.  No endpoint, table, migration or browser control
   may resurrect it.  OpenAPI, JSON Schema, generated declaration and contract
   snapshot are generated together by the canonical contract generator.
2. Approval inbox, approval history, conditions/waivers register and
   Operations Queue now carry `read_truth`.

   - `EMPTY` with `NO_MATCHING_PORTAL_GOVERNANCE_RECORDS` or
     `NO_MATCHING_PORTAL_OPERATION_RECORDS` means the authorized request's
     exact filter/cursor scope has zero matching Portal-owned records.
   - `AVAILABLE` means the filtered relation contains rows, even if a supplied
     cursor selects no rows for the current page.  A cursor-page artifact must
     not be misreported as global absence.
   - Authentication, authorization, concealed workspace scope, external
     projection availability and policy eligibility are not normalized to
     `EMPTY`: they retain their existing `401`, `403`, `404`, panel-state or
     `eligibility.locks` contract respectively.
3. `GET /api/v1/execution/governance/approvals` is now a published operation
   (`executionApprovalInbox`) rather than an implementation-only route.  Its
   request bounds and response schema are part of the generated surface.
4. Approval creation preserves one canonical result for a byte-identical
   `request_key` plus request payload.  Concurrent duplicate writes settle as
   one created response and replay responses; a reused key with a different
   payload stays a `409 REQUEST_KEY_PAYLOAD_CONFLICT`; a distinct duplicate
   alpha/run remains `409 DUPLICATE_OPEN_APPROVAL`.

## State rendering boundary

The Control API is the policy authority.  A consumer must render the server
state rather than infer policy or manufacture data:

| Server outcome | Consumer treatment |
|---|---|
| `read_truth: EMPTY` | Keep the rich panel mounted and render the compact, scoped empty state. |
| `403` | Existing permission/action-denied state; never show an empty inbox. |
| `404` | Existing concealed/not-visible workspace state; never disclose existence. |
| `linked_panels[*].panel_state: unavailable` | Render the named external panel unavailable with its code. |
| `eligibility.locks` or row `inert: BLOCKED` | Render the server policy explanation; do not reimplement eligibility client-side. |

No shared development/stable runtime is seeded with fake approvals, incidents,
queue entries or commands under this phase.

## Isolated review-data procedure

`./scripts/control-api-test.sh` is the supported automated proof.  Each run
copies source into a disposable Docker cell, creates an internal temporary
PostgreSQL container, runs migration/build/tests and performs a dump/restore
comparison.  It removes the cell, network and temporary files on exit.  It
does not access Portal runtime volumes, stable data, the Trading System, Edge,
Source Proxy, broker or command plane.

For an interactive visual review, create a separately named, explicitly
approved non-stable review environment through normal authenticated Portal
APIs.  Use an ordinary test workspace and test identities there; do not seed
or mutate shared dev/stable databases directly.  This repository intentionally
does not provide a shortcut that writes retained demo data into a shared
runtime.

## Verification and rollback

- Contract fixtures validate the new Inbox operation, V1 snapshot and all
  typed read-truth DTOs.
- Focused tests cover exact zero-match truth, cursor-page semantics,
  role/workspace/CSRF negatives, external-unavailable versus policy-blocked
  rendering inputs, and a delayed four-request concurrent idempotency race.
- The full Control API gate runs TypeScript build, real PostgreSQL tests and
  dump/restore verification in an isolated cell.

This is a source/contract-only change.  There is no runtime migration, flag,
container, source read, command activation or release rollout to roll back.
If a consumer must be rolled back, deploy the prior immutable application
artifact; the deprecated V1 member is additive and remains safe to consume.
