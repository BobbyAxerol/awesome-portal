# UDB-03 → Claude / UDB-04 — exact retained-read consumer handoff

2026-10-10 · same `docs/research-loop-plan` branch. Read
[Unified phase](../../../UNIFIED_IMPLEMENTATION_PLAN.md#udb-03),
[coverage baseline](../UDB-02/handoff.md), [screen matrix](./screen-matrix.md)
and [phase receipt](./phase-report.md) first. Codex changed **no frontend
source, component, theme, layout, router or visual baseline**.

## What is available now

`research-portal.primusspark.com` keeps its existing Research+Execution web.
Only its local Control API is updated. `retained_review_v1` is explicit,
local/dev-only, uses the isolated Portal Execution DB and three exact profile
bindings. All upstream/current-source workers, mirror writer/reads, market
transport, SSE and command relay remain disabled. This is not source
qualification or Trading System authority. No production/development release.

Existing rich-screen operations work on retained snapshots/current entities
and bounded legacy history. Named aliases stay the same; no relation, SQL,
origin, DSN, JWT, mTLS or source cursor input is added. The 54-alias static
manifest is unchanged. Uncaptured aliases return HTTP200 typed UNAVAILABLE
with `UDB_RETAINED_PANEL_NOT_CAPTURED`, not authoritative empty. Invalid
captured identity/scalar fails typed503, rather than silently changing values.
Decimal/integer strings remain exact; timestamps are UTC milliseconds.

All retained observations are STALE/PARTIAL. Latest accepted nonempty rows
win; older stored rows fill only missing/refused/empty relations. This **does
not** update accepted source snapshots or their refusals/clocks. The context
exposes original source availability, reason and nullable as_of separately.
Charts render primary STALE with explicit partial reason and retained coverage.
Historical malformed1970 fill timestamps are preserved, not repaired.

## Regenerate and consume the new context

Run `npm run generate:execution-retained-review` in `packages/contracts`.
Types in `generated/execution-retained-review.d.ts`:

- `RetainedReviewResponse`, `RetainedReviewProfile`, `RetainedReviewPanel`:
  `GET /api/v1/execution/retained-review` / `executionRetainedReviewV1`.
- `RetainedNamedOperationPage` / `executionRetainedNamedOperationPageV1`:
  retained variant of the existing `manager/current/{operation_id}` envelope.
- `executionRetainedRealtimeBootstrapV1`: intentional204/no cursor,
  header `X-Portal-Realtime-State: UDB_RETAINED_STREAM_DISABLED`.

Synthetic contract fixtures are labelled synthetic. Actual private responses
and hashes are in the phase receipt; never treat a fixture as an API receipt.
The original Research `pregenerate` pipeline is preserved and the new target
is appended, not substituted.

## FE-UDB03-01 — profile, states and effective actions

Consume the named context once per review entry/explicit refresh, using
same-origin session. Keep existing rich compositions and chart components;
change bindings/states inside their panels only. Show retained/read-only
context without presenting local observation time as source freshness.
Keep separate unknown/uncaptured/refused/empty/partial states. Numeric0 is
shown only when a captured source fact is actually0.

`permissions` applies **only to this Execution retained-review profile**,
not the caller's global Research/Core/account-admin rights. Read/query are
allowed; manage/download/command/stream/research_create/governance_decide
are false within this profile. `is_owner` comes from Core's immutable owner
anchor, never the username or ADMIN role. Do not infer resource management
support from retained Account/Portfolio rows. Future TS management remains
typed `TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED` until a published
owner contract exists; existing read panels are not blocked by that gap.

Server guard rejects every Execution mutation even for owner in this profile.
The CLI issued a30-day **GET-only** preview grant to existing claude-preview,
not a workspace membership/role or Research/Governance grant. Core owner,
passwords/activation/global grants and ordinary Research writes are unchanged.
Grant expiry/revocation/disabled user is checked per request; HTTP is private
no-store; permission cache0. Data view cache is separate:2s/3profile entries/
8MiB serialized-byte cap, never authority, never source clock renewal.
Do not cache permissions merely because a view/cursor is still available.

## FE-UDB03-02 — no stream/retry/poll inference

When context says `stream_enabled=false`, do not call bootstrap or construct
EventSource. Existing consumers now stop at intentional204 (no cursor);
they currently label it `REALTIME_SNAPSHOT_INVALID` internally. Refine that
copy to retained/no streaming by consuming the typed context, not by inventing
an active heartbeat. Direct stream remains404 typed disabled before hijack.
No resnapshot or source refresh is eligible in this profile.

`src/execution/useRelationFacts.ts` still schedules its old bounded local
re-read cadence; `useRevision.ts` also has the15s fallback. For static retained
review, use initial read + explicit refresh, stopping periodic drains via
context rather than faking a live update. Existing cadence did not call Edge,
but is not the final consumer optimisation. Genuine source-live pacing is a
separate dev/main activation scope, not to be enabled in this handoff.

## FE-UDB03-03 — workspace and visual checks

Core Command Center workflow/catalogues and Governance stay on their Core
workspace; source facts use the configured Execution workspace. Research RC
publication → existing R1 deep link keeps its explicit Research workspace
through direct navigation and reload. Do not replace it with the retained
source workspace, infer R2/Canary/Live approval, or make a client-side grant.

Browser audit identified Alpha360 at1280 overflowing to1411px and the known
R1 mobile-rail refinement. Keep approved HiFi typography/layout/components;
inspect before proposing visual changes. This handoff does not authorise
baseline re-recording or new design. Available contracts are not consumer
acceptance: record READ→MAPPED→CONSUMED→BROWSER_VERIFIED per matrix row.
The new review context remains READ/GENERATED until Claude lands its consumer.

## Exit / prompt to resume

Claude: consume FE-UDB03-01/02, preserve existing design, use browser1280/660
to compare HiFi and actual rich routes, assert profile/no-store/action states,
no stream/no product write/no external data request, honest coverage/decimals,
RC→R1 explicit workspace/deep link/reload. Update the Unified row and this
packet with consumer commit and receipt. Do not claim source-live, full
cross-stack ProductGO or UDB-04 acceptance. Ask Bobby before visual changes.

UDB-04 still requires Bobby's separate approval and an exact reviewed clean
candidate/image/config/migration set. Reuse unchanged UDB-01/02 custody and
storage/import/restart/rollback proofs; retake only dependency-affected gates.
