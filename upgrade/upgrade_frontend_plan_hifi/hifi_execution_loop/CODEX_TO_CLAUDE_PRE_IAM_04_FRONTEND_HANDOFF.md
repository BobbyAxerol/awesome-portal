# Codex → Claude — PRE-IAM-04 Frontend Contract Handoff

Date: 2026-08-22  
Backend source commit: `5e28693`  
Backend status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Frontend owner: Claude  
Backend/contracts/infra owner: Codex

## 1. Read order and source authority

Read these files in order before changing frontend code:

1. [`PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md`](../../backend/PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md)
   — accepted backend boundary, H-1…H-12 disposition and exact evidence;
2. [`execution-realtime.d.ts`](../../../packages/contracts/generated/execution-realtime.d.ts)
   — canonical realtime gap envelope;
3. [`execution-analytics.d.ts`](../../../packages/contracts/generated/execution-analytics.d.ts)
   — canonical six-screen analytics responses;
4. [`execution-analytics.openapi.json`](../../../packages/contracts/openapi/execution-analytics.openapi.json)
   and [`execution-realtime.openapi.json`](../../../packages/contracts/openapi/execution-realtime.openapi.json)
   — HTTP response authority;
5. the six `packages/contracts/fixtures/execution-analytics.*.valid.json`
   fixtures and
   `fixtures/execution-realtime.projection-gap.valid.json` — canonical examples;
6. `PHASE_TRACKER.md` §16 and §24A.4 — existing frontend adapter history and
   shared current status;
7. `BR_EX_28_PHASE6_CATALOGUE_AND_UNBLOCK.md` and `EXECUTION_SCALE_AND_REFINE.md`
   BR-EX-29 — separate next-contract requests, not part of PRE-IAM-04.

Generated declarations and contract fixtures win over prose or a duplicated
frontend model. If a generated declaration cannot represent the required UI
state, stop and record a backend contract request; do not patch generated files
or invent a second field name in `apps/portal/frontend`.

## 2. Safety and ownership boundary

Claude may change only frontend-owned source, frontend fixtures/tests and
frontend tracking text. Claude must not:

- change Rust, TypeScript Control API, contract schemas/OpenAPI/generated
  declarations, migrations, Compose, AWS or D1/D2 assets;
- enable a registry `query_enabled`, `realtime_enabled`, source, command or
  Lane B product route;
- create an EventSource while `stream_available=false`;
- infer Trading System data through DB, Redis, CLI, SSH or a guessed HTTP path;
- convert missing, partial, stale, unavailable, gap or typed error into an
  empty-success screen;
- treat an offline test time budget as a production SLO.

Every coherent frontend slice must be tested and committed on the current
feature branch. Do not include Codex-owned or unrelated user files in that
commit.

## 3. Work package C-PI04-01 — contract consumption audit

Goal: make the existing frontend analytics/realtime adapters compile against
the generated declarations without maintaining a second response shape.

Tasks:

1. audit `src/execution/api`, `analytics.ts`, `sse.ts`, screen containers and
   fixtures for local copies of fields changed by PRE-IAM-04;
2. keep the generated declaration as the imported transport type and use a
   small pure adapter only where presentation needs a different view;
3. replace hand-written backend-shaped analytics fixtures with the canonical
   contract fixture or a documented presentation-only derivative;
4. add compile/test coverage that fails if the generated contract changes.

Exit: no duplicate transport interface and no stale renamed field remains.

## 4. Work package C-PI04-02 — loss-detectable realtime recovery

Goal: prepare the reducer and fixture behavior now while leaving the live
EventSource dark.

Canonical new facts:

- reasons include `projection_sequence_gap` and `cursor_ahead` in addition to
  `epoch_changed`, `source_discontinuity`, eviction, replay-window and
  slow-consumer reasons;
- `latest_available_sequence` is nullable and meaningful for cursor-ahead;
- `resnapshot_not_before` is nullable RFC3339 UTC and is the earliest retry
  time, not display decoration;
- `active_epoch_id` identifies the authoritative resnapshot epoch.

Required behavior:

1. `projection_sequence_gap`: mark continuity lost, retain visible stale data
   only as stale, and request a full snapshot no earlier than the supplied
   deadline;
2. `cursor_ahead`: clear the unusable resume cursor, show the active/latest
   sequence facts and perform a full snapshot after the deadline;
3. `epoch_changed`: discard old-epoch continuity and snapshot the active epoch
   after its deadline;
4. `source_discontinuity`: do not relabel it as an ordinary projection gap;
5. do not immediately reconnect every client and create a retry herd;
6. unit-test each reason and a null deadline, but do not attach the reducer to a
   real EventSource until snapshot/SSE parity is accepted.

Exit: reducer/fixtures/tests express recovery without activating realtime.

## 5. Work package C-PI04-03 — cursor failure UX

Goal: stop presenting every rejected cursor as one generic failure.

Map the stable backend codes as follows:

| Code | Frontend recovery |
|---|---|
| `INVALID_CURSOR` | reject the cursor, request a fresh first page and show a bounded “saved position is invalid” state |
| `CURSOR_EXPIRED` | explain that the view lease expired, request a fresh first page and preserve current filters/sort |
| `CURSOR_CONTEXT_MISMATCH` | clear the cursor because workspace/filter/sort context changed; never replay it in the new context |

Do not display a signature, raw cursor, internal parser exception or server
stack. Test that context mismatch cannot reuse rows from another context.

## 6. Work package C-PI04-04 — bounded Funnel and Capital Ledger

Goal: render bounded rows honestly while preserving server-owned exact facts.

Order Funnel:

- `event_count` is the complete validated population count;
- `returned_event_count` is the number of returned events;
- `has_more=true` means the response is a bounded window;
- `window=LIFECYCLE_AND_LATEST` means lifecycle coverage plus latest retained
  events, not a full chronological export;
- each stage has its own exact `event_count`, `returned_event_count` and
  `truncated`.

Capital Ledger:

- `entry_count` is the complete validated population count;
- `returned_entry_count` is the bounded row count;
- `has_more=true` plus `window=LATEST` must be visible to the operator;
- exact currency-isolated gross totals describe the full supplied population,
  not only the latest returned rows.

Required UI/tests:

1. label “showing X of Y” when bounded;
2. keep exact totals/stage counts separate from the row window;
3. never recompute money, gross totals, stage totals or truncation in the
   browser;
4. add a fixture case with `has_more=true` and verify the UI does not claim
   complete history;
5. preserve fixed-height/virtualized table constraints already recorded for
   Full Blotter.

## 7. Work package C-PI04-05 — typed analytics failures

Goal: use actionable, safe failure states instead of one generic “backend
unavailable” panel.

Client-correctable 422 codes:

- `ANALYTICS_INPUT_LIMIT_EXCEEDED`;
- `ANALYTICS_INVALID_CURRENCY`;
- `ANALYTICS_ACCOUNTING_MISMATCH`;
- `ANALYTICS_SCOPE_MISMATCH`;
- `ANALYTICS_DUPLICATE_IDENTIFIER`;
- `ANALYTICS_CORRELATION_INVALID`.

Infrastructure/service failure:

- `ANALYTICS_ARITHMETIC_UNAVAILABLE` remains 503.

Map codes through one shared pure problem adapter. Keep the screen’s last known
data visibly stale where policy permits, show a scoped corrective action for
422, and use retry/unavailable treatment for 503. Unknown codes fail closed.
Never show source identifiers, internal paths or raw exception text.

## 8. Work package C-PI04-06 — six canonical fixtures and evidence

The canonical fixture set is:

1. capital preview → Gate R2;
2. order funnel → Full Blotter;
3. insight batch → Alpha 360°;
4. correlation → Portfolio 360°;
5. capital ledger → Portfolio 360°;
6. binding exposure → Account/Broker 360°.

Add one contract-loading test per fixture and presentation assertions for the
new bounded/error/recovery fields. Keep existing screen-specific synthetic
scale fixtures only when clearly named as presentation/scale fixtures rather
than backend examples.

Frontend exit commands from `apps/portal/frontend`:

```bash
npm run test
npm run build
```

Then run the repository gate:

```bash
./scripts/verify-workspace.sh
```

Record test counts and commit hash in `PHASE_TRACKER.md`. Do not mark Lane B,
realtime, source or production active.

## 9. Tracking corrections Claude owns

After the code slice, update `ROADMAP_FRONTEND.md` without changing backend
authority:

- Section E must retire H-1…H-12 as closed by PRE-IAM-04 instead of listing
  them as still pending;
- B10 remains implementation-ready but activation-blocked by snapshot/SSE
  parity and real profile evidence;
- BR-EX-24…29 remain separate open requests unless their own contract is
  delivered;
- A1a must still state that eight Trading System `ops` HTTP routes are absent;
  Portal may not replace them with direct DB/Redis reads.

## 10. Backend queue while Claude works

### Step 1 — PRE-IAM-05: D2 dark preparation

Codex owns immutable image/config/service manifests, non-root/read-only and
resource-bound checks, offline preflight and rollback. No AWS host is changed,
no interface or route is created, no source is read and all runtime flags stay
false. Claude has no deployment task; continue §3–§9 in parallel.

### Step 2 — PRE-IAM-06: reconciliation (immediately executable)

After PRE-IAM-05, Codex reconciles backend guides, the Master Plan and request
ledger. Claude reconciles `ROADMAP_FRONTEND.md` and frontend evidence. Exit
requires no contradictory status, no bare `COMPLETE`, one exact owner/blocker
per open item and explicit distinction among fixture-built, integration-complete
and production-active. This needs no IAM or live source.

### Step 3 — EX-BE-05b/F0: contract-only operations foundation (immediately executable)

After PRE-IAM-06, Codex can implement the offline portion of existing
EX-BE-05b:

- canonical `noun/verb` command catalogue for BR-EX-28 with risk tier,
  plan/apply/verify facts, reachability and blocked reason;
- typed `conditions[]` contract and transition compatibility for BR-EX-29;
- Portal plan/apply/verify and Rust relay contracts, fixtures, deny-by-default
  capability negotiation and idempotency/uncertain-result tests;
- eight missing `ops` routes remain `portal_reachable=false` until the Trading
  System owner publishes purpose-built authenticated HTTP contracts.

Claude can then replace the Admin Drawer catalogue fixture with the canonical
generated catalogue and replace flattened condition text with typed objects,
while keeping Apply/relay disabled. Neither team may invent Trading System
routes, expose generic Redis `get`/`scan`, or activate a command.

These two steps after PRE-IAM-05 are useful immediately and do not depend on the
weekend IAM window. Live D1/D2/D3/D4 execution remains owner/change-window
gated and is not implied by this queue.
