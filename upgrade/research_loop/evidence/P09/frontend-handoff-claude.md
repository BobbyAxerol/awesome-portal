# P09 frontend handoff — same-origin Journey Map and Engine Atlas

Status: `BACKEND_AND_TYPED_CONTRACT_READY` · Codex delivered; Claude owns
product composition, browser/HIFI receipt and visual acceptance.

## Use one generated contract; never construct local DTOs

- Canonical OpenAPI: `packages/contracts/openapi/research-foundation.openapi.json`
- Generated declarations: `packages/contracts/generated/research-foundation.d.ts`
- Frontend alias: `@portal/contracts-research-foundation`
- Regenerate/check: `cd packages/contracts && npm run generate:research-foundation && ./tooling/verify-generated.sh`

Use generated `paths`, `operations` and `components` types.  Do not hand-parse
the server error string, reproduce response shapes, or import Control API,
Portal API, QuantBT, a historical loader, PostgreSQL or an Execution adapter
from browser code.

## The only two browser operations

| Screen need | Method/path | Typed inputs | Required rendering truth |
|---|---|---|---|
| S00 Journey Map plus deep-link inspection | `GET /api/v1/research/journey` | optional `workspace_id`, `run_id`, and only P02 keys | descriptor phases, `inspection`, `etag` |
| S12 Engine Atlas, current/historical | `GET /api/v1/research/quantbt/atlas` | optional `workspace_id`, `release_id`, `route`, `mode` | selected release, 14 routes, 5 modes, 7 claims, `etag` |

Requests are same-origin and session-bound.  Do not use P04's old direct
Portal API route as a product fallback.  A `304` keeps the last exact typed
response; `400`, `404`, `502`, and `503` must retain their generated typed
meaning.  Do not turn an unavailable Atlas into a plausible local manifest.

## S00 composition rules

1. S00 is a **shell-free route**.  It must use the existing Portal Research
   shell once; do not nest a second navigation shell inside it.
2. The descriptor's `target_key` is presentation data, not a browser authority
   to invent a path.  Keep one owned `SCREEN_ROUTES` map and resolve keys only
   there.
3. Preserve P02 URL rules: IDs remain opaque; render `pick` as inspection
   only; do not promote/select/dispatch from a journey deep link.  `seq` and
   legacy `event_seq` must never be combined with unequal values.
4. Unknown or denied workspace/route values render their typed state inside
   the composition; do not replace the entire product route with a generic
   envelope or fixture.

## S12 composition rules

1. Build exactly the three HIFI Atlas tabs from the manifest response.  The
   14 routes, five modes and seven claims are source facts; no copied static
   route/mode list.
2. Current versus historical is driven solely by
   `selected_release_id`/`selected_release_kind`.  A historical retained
   identity is not a promise that it can run.
3. Keep early P07 components in their declared boundary: registration/activate
   remains controlled by P07's typed `may_activate`; Atlas itself is read-only.
4. Use Research Light scoped tokens, installed fonts and existing chart
   packages.  Do not copy prototype `support.js`, CDN runtime or global token
   changes.

## Required frontend evidence before P09 full exit

- Unit tests cover normal, typed `400/404/502/503`, ETag/304, P02 alias and
  `pick` inspection-only behaviour; source sweep proves neither component
  creates a manual P09 DTO or external request.
- Browser receipts against the actual S00/S12 product routes at 1280/660 and
  the spec viewport: HIFI comparison, keyboard and reduced-motion behavior,
  zero console warnings/errors, no overflow, no nested shell.
- Regression receipt proves Execution and Planning visuals did not change.
- Run narrow relevant tests first; do not rebuild/deploy an image merely to
  render fixtures.  Return command/count/trace or screenshot **private refs**
  to `upgrade/research_loop/evidence/P09/`.

## P08 decision now required: `S14-VIS-01`

HIFI S14 has four visual groups but the frozen authority model has only three
functional stages.  Please explicitly record this decision before/while
mounting routes:

> Keep three backend authority states — **parse**, **seven gates**,
> **register/activate**.  Render **Code anatomy** as a presentation-only
> substage beneath parse.  Do not add a lifecycle state, API field, migration,
> or backend transition.

This preserves the HIFI information hierarchy without falsifying authority.
