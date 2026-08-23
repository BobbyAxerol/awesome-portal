# Codex → Claude — EX-BE-05b/F0 Consumer Handoff

Date: 2026-08-22  
Backend status: `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`  
Frontend lane: Lane A only; no registry/profile/runtime activation

## 1. Read order

1. `packages/contracts/generated/execution-operations.d.ts`
2. `packages/contracts/fixtures/execution-command-catalog.valid.json`
3. `packages/contracts/fixtures/execution-command-plan.valid.json`
4. `packages/contracts/fixtures/execution-command-operation.valid.json`
5. `packages/contracts/fixtures/execution-command-relay-denied.valid.json`
6. `packages/contracts/openapi/execution-operations.openapi.json`
7. `upgrade/backend/EX_BE_05B_F0_OFFLINE_OPERATIONS_FOUNDATION.md`

The generated declaration and fixtures win over prose. Do not copy the
generated type into a second hand-maintained model.

## 2. What Claude can implement now

- Replace the Phase 6 catalogue fixture with the same-origin
  `GET /api/v1/execution/commands/catalog` response behind the existing Lane A
  adapter. The route is ADMIN-only; handle 403 for USER without leaking the
  catalogue.
- Render 64 canonical `noun/verb` actions, grouped using server `group` and
  showing exact `risk_tier`, `owner_review_required`, plan/apply/verify facts,
  route state and blocked reason.
- Consume catalogue revision 2 scope and exact total/returned counts. Optional
  environment/entity/risk filters are server-owned, and an entity target is
  always the `target_type` + `target_id` pair.
- Keep every entry unavailable while `portal_reachable=false`; unavailable
  actions stay visible and explain why.
- Model the F0 plan response as a blocked preview: no apply token, no source
  side effect and no claim of terminal execution.
- Model apply denial and operation polling distinctly. HTTP 202 remains an
  acknowledgement in future profiles, never proof of completion.
- Display `payload_storage_policy=HASH_ONLY_NO_RAW` as the plan evidence rule;
  never expect the API to return submitted payload values. Map
  `SENSITIVE_PAYLOAD_FIELD_FORBIDDEN` and bounded-payload rejection without
  echoing the rejected value.
- Replace flattened condition text with canonical `conditions[]` containing
  `text`, `owner`, `deadline`, wire `expires_at` and `blocking`. Retain a read
  compatibility path only where old stored responses still expose singular
  `condition`.

## 3. Stop gates

Do not:

- enable a Phase 6 product route, registry command policy or delivery profile;
- infer reachability from non-null `http_path`;
- expose generic Redis, PostgreSQL or CLI access;
- invent an endpoint for any unpublished `ops` action;
- turn `BLOCKED`, `UNPUBLISHED`, `AMBIGUOUS`, `NOT_STARTED` or denied apply into
  success/empty state;
- assume all mutations have plan/apply/verify;
- downgrade an observed non-GET action from its canonical risk/review policy;
- treat source risk as Portal effective risk;
- implement live/sandbox command semantics or retry an `UNCERTAIN` outcome.

These eight actions must remain visibly unavailable:

`ops/trace-order`, `ops/dead-letters`, `ops/findings`, `ops/streams`,
`ops/command-journal`, `ops/redis-retention`, `ops/alerts`,
`ops/alpha-activity`.

## 4. Required frontend tests

1. exactly 64 unique keys and no locally invented entry;
2. every unreachable entry renders disabled with the backend reason;
3. the eight unpublished actions remain unavailable even if an inherited HTTP
   path appears in a future source extract;
4. generic `redis/get` and `redis/scan` cannot produce an actionable control;
5. every observed non-GET item is at least R1 and visibly requires owner review;
6. every R1–R4 item has plan and apply; step display still follows entry
   booleans rather than a separate frontend policy;
7. blocked plan has no apply CTA/token and is not announced as completed;
8. denied apply displays safe retry/source-request facts;
9. multiple typed conditions round-trip without flattening; legacy singular
   and canonical array are never sent together;
10. plan copy states hash-only retention, and sensitive/oversized payload
    failures do not echo user data;
11. two concurrent equal requests render one replayed operation, while payload
    drift renders the typed conflict and never auto-retries;
12. malformed/unknown schema or blocked reason fails closed;
13. keyboard/focus/reduced-motion and narrow drawer states remain covered;
14. all registry/source/realtime/command flags remain false in tests.

## 5. Coordination after this packet

Claude owns the consumer/UX tests above and updates FE status/evidence on
`PHASE_TRACKER.md`; Codex owns backend status and §6 coordination. The eight
source routes remain external owner work. When the Trading System owner
publishes typed authenticated routes, Codex will add compatibility adapters;
Claude must not remove the unavailable states in anticipation.
