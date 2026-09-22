# P20 frontend handoff — Screen 13 Compare

**Backend state:** `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK`.
Claude owns Screen 13 rich composition and real browser/HiFi acceptance. Do
not edit P20 backend/migration/feature/deploy files to make a visual fixture
look live. Do not alter existing P12 WIP while consuming this contract.

## Read and record `READ`

1. `CLAUDE-FOR-thanhvuong.md`, P20 in the unified plan, Screen 13 spec and its
   HiFi HTML at 1280px and 660px.
2. [P20 phase report](./phase-report.md) and [backend packet](./README.md).
3. Generated sources only:
   `packages/contracts/openapi/research-compare.openapi.json` and
   `packages/contracts/generated/research-compare.d.ts`.

Regenerate before consuming:

```bash
npm --prefix packages/contracts run generate:research-compare
```

## Exact consumer boundary

```text
GET /api/v1/research/alphas/{alphaId}/compare?workspace_id=&mode=&runs=
```

- Omit `workspace_id` to use the authenticated workspace.
- `attempts` is the default and accepts no `runs`.
- `markets` accepts no `runs`.
- `pair` requires exactly `runs=runA,runB`; no more, no duplicate. The two
  values are opaque run IDs, not a relation/cursor/source selector.
- Treat `400/401/403/404/503` as typed panel-local states. Never retry a
  dead auth session in a loop or ask any direct source/worker/artifact route.

## Mandatory typed handling

`PairResult` is a generated discriminated union:

- `state === "REFUSED"` guarantees `pair === null`. Render the exact refusal
  card and four returned key parts; do **not** mount chart, delta table,
  weaker-claim, correlation or hidden pair metrics anywhere in the DOM.
- `state === "AVAILABLE" | "PARTIAL"` guarantees `refusal === null` and
  `pair` exists. A `PARTIAL` pair retains its designed context but its
  `availability.reason_code` must be visible.

Do not calculate correlation, deltas, ranks, key comparison, missing-value
fills or config diffs in the browser. Preserve UTC milliseconds and decimal
strings as supplied. `common_window` is a new Portal-derived scope; never
overwrite a run's `original_metrics` with it.

## Required rich composition

- Keep Screen 13's attempts ladder, market small-multiple grid, pair guard,
  distinct `#0f4c5c` / `#9a6a1f` lines and mandatory legend, delta table,
  config-difference disclosure, rules footer and URL state. Replace only the
  affected panel state, never the whole route with a generic unavailable page.
- Attempts sort by returned order/claim rank. Do not promote/select/publish a
  run from rank or a metric. `weaker_claim` is display-only explanation.
- Markets use only server-provided cards. Do not overlay different keys,
  request raw returns or fabricate an unavailable chart.
- Pair correlation with `source_label=PORTAL_DERIVED` must show formula,
  version, `n`, exact window and missing policy. It is not engine-published.
  For `NOT_PUBLISHED`, show the returned typed reason in the designed card;
  do not turn it into `0`, `NaN`, an engine-artifact claim or a client retry.
- Current claim origin can be conservative
  `PORTAL_DERIVED_FROM_SOURCE_PROTOCOL`; strict/selection categories absent
  from source remain typed absence. Preserve the HIFI hierarchy without
  inventing a certification chip.

## Mandatory browser / HiFi receipt

Use a real browser and compare the product route with the HiFi at **1280px**
and **660px**. Record:

`HiFi element / interaction → product component → generated field/operation → typed state → browser assertion`.

Cover S13 T01–T11: claim-order ladder, exact trajectory copy, no-overlay
markets caption, comparable pair overlay/deltas, mismatch no-hidden-DOM
refusal, absent correlation, weaker-claim display, deep-link `runs`, 660px,
axe/focus, zero warnings/errors and stale-response prevention when switching
pairs. Keep fixture/API/browser/visual evidence separate; never re-record a
global baseline to hide unrelated drift.

Return one receipt with commits, files/counts, generated revision, browser
commands/viewports, console/network evidence, HiFi delta decisions and only
genuine `CG-P20-*` source/contract requests.
