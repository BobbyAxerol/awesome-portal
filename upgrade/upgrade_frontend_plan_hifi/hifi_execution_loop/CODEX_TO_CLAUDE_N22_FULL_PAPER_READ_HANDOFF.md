# Codex → Claude — N22 Full Paper Read handoff

**Backend status:** `N22_COMPLETE / PAPER_PRODUCT_APIS_VERSIONED / SIGNED_DEV_DEPLOYMENT_PENDING`  
**Frontend scope:** four existing Paper screens only

## Product routes

| Screen | Same-origin route | Schema version |
| --- | --- | --- |
| Paper Overview | `/api/v1/execution/screens/paper` | `execution.paper-overview.v1` |
| Paper Workbench | `/api/v1/execution/screens/paper/{deploymentId}` | `execution.paper-workbench.v1` |
| VN Paper Workbench | `/api/v1/execution/screens/paper/{deploymentId}/vn-market` | `execution.paper-workbench-vnm.v1` |
| Full Blotter | `/api/v1/execution/screens/blotter` | `execution.full-blotter.v1` |

Use the generated `execution-paper-read.d.ts`. Do not call Manager-v2, the
Execution Edge, Source Proxy or any relation route from browser code.

## UI truth contract

Render the top-level `state` and per-capability `state/reason_code` exactly:

- `ready`: current source facts are usable;
- `empty`: valid Paper scope with no rows;
- `stale`: keep the last facts visible with a clear stale marker;
- `partial`: render available sections and localize unavailable sections;
- `unavailable`: keep the screen shell and recovery explanation, no fake row.

Never infer freshness, completion, policy verdicts, exact counts or joins in
the client. Never show source relation names, source URLs, opaque keys, hashes,
JWT/mTLS detail or a retry loop. One deliberate user retry is acceptable.

## Explicit unavailable branches

- `paper.derived-insights` waits for N25;
- `workbench.analytics` waits for N25;
- `blotter.exact-query` waits for N25;
- `market.candles` waits for N28;
- VN `venue.calendar` waits for N28.

These do not make the current facts fake or unavailable. Present each as a
bounded local section state, not a page-wide error and not a `SOON` marketing
card.

## Fixture retirement rule

Keep the current approved UI fixture for a field/section until a dev response
has canonical field parity. Then switch that section to this product API and
remove only its matching smoke path. Do not delete all Paper fixtures in one
mechanical change, and do not merge source arrays in the browser.

Canonical backend fixtures live under
`packages/contracts/fixtures/execution-paper-*` and
`execution-full-blotter.partial.valid.json`. Consumer tests must cover ready,
empty, stale, partial and unavailable before the switch.

## Parallel frontend work

Claude can now:

1. add one typed client for the four routes;
2. wire Paper Overview first, preserving the approved Carbon visual system;
3. wire the two Workbenches and Full Blotter section-by-section;
4. test session expiry, foreign workspace 404, stale banners and partial
   section rendering;
5. retain candles, venue calendar and exact-query UI as typed unavailable
   until N25/N28.

N23 is the next backend phase. Do not reuse Paper cache/cursor data or infer a
Live/Canary profile while that phase is pending.
