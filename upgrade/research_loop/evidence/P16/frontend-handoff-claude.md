# P16 frontend handoff — Screen 07 Freeze / integrity / what-if

> **RS-01 amendment (2026-09-22):** no Freeze fact/action is added. Preserve
> the exact partial-integrity UI and typed absence panels. Underlying retained
> Split reads now enforce chronology/cancellation server-side; do not duplicate
> either rule in the browser. See
> [RS-01 handoff](../RS-01/frontend-handoff-claude.md).

**Astra review addendum — 2026-09-22: `AUDIT_REOPENED`.** Read the
[P13–P17 audit/remediation guide](../../P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md)
and Unified checkpoint before using this handoff. The v1 facts below describe
a partial fixed-profile surface, not full screen/backend acceptance or proof
that QuantBT lacks the omitted capabilities. Preserve your rich composition;
consume new generated contracts per panel when published. No backend/runtime
change is authorized by this audit note. Finish/preserve your P12 work.

P16 backend and generated contracts are ready, but runtime remains dark. Work
only in Screen-07 composition, route, client and tests you own. Do not modify
P16 Control API, OpenAPI, P10/P11/P14 source chain, migration, PostgreSQL role,
deployment overlay, Execution code or the in-progress P12 files to make a
generic optimizer screen appear.

## Mandatory reading chain — record `READ`

1. [`CLAUDE-FOR-thanhvuong.md` A13.1–A13.4](../../CLAUDE-FOR-thanhvuong.md),
   particularly ownership, handoff chain and browser-first HiFi rules.
2. P10–P15 packets; finish/commit your P12 work before adding a Screen-07
   client alias.
3. This handoff and [phase report](./phase-report.md).
4. Screen-07 [spec](../../release-v1.1/docs/screens/07_s3_freeze.md) and
   `QuantBT 07 S3 Freeze.dc.html` **opened in a browser** at 1280px and 660px.
5. Generated source only:
   [`research-freeze.openapi.json`](../../../../packages/contracts/openapi/research-freeze.openapi.json)
   and [`research-freeze.d.ts`](../../../../packages/contracts/generated/research-freeze.d.ts).

## Generated operations only

```bash
npm --prefix packages/contracts run generate:research-freeze
```

| Operation | Product role |
|---|---|
| `researchFreezeDetailGetV1` | one immutable Screen-07 snapshot; preserve revision/ETag and UTC milliseconds exactly |
| `researchFreezeVerifyPostV1` | explicit user-triggered re-read with the existing same-origin CSRF helper; invalidate/refetch only after the typed response |

Do not write a local DTO, derive a digest/date/verdict, parse raw error prose,
call an internal/legacy/worker/source/artifact/Parquet route, send relation,
cursor, revision, parameter override or job input, or emit a mutation from a
slider/mount/fold change. The screen must never state that `PARTIAL_MATCH` is
an artifact/causal-order/selection pass.

## Required rich-but-truthful Screen-07 composition

Keep the full HiFi shell and responsive geometry. Replace panel contents with
typed current-source truth rather than replacing the route with an unavailable
envelope.

| Generated fact/state | Product rule |
|---|---|
| `integrity.state=PARTIAL`, verify `result=PARTIAL_MATCH` | label exactly as retained Portal binding match; render `source_artifact_bytes=NOT_ATTESTED`; never say “chain intact” or add a green source-integrity claim |
| `integrity.state=BLOCKED` | show a rich blocked banner and the individual mismatched check; frozen table is intentionally empty, never repopulated from fixture/current local defaults |
| `frozen_parameters` | render exact decimal strings/bounds/steps only when supplied; no browser percent/digest/value recalculation |
| `ordering.data_time` | render server UTC-ms data windows; `ordering.wall_clock=NOT_ASSERTED` is not a timeline nor causal pass/fail verdict |
| selection/pool/trial gaps | retain visual card with typed source reason; do not show a selected trial, candidate total, fold map or selection trace |
| what-if fields/actions | show `NOT_APPLICABLE`; no sliders, local J formula, 9×9 fixture grid, POST on mount, diagnostic queue, or sibling navigation on a product P04 run |
| pending/legacy/not-published and typed 400/401/403/404/503 | preserve breadcrumb/shell and use existing typed-error grammar; never show internal error text or source fields |

The rich generic HiFi fixture lane may be retained only as visibly labelled
fixture/demo. It must not share product response state or claims with a real
P04 run. A future source revision gets a new discriminated generated contract;
do not add speculative fields to this client.

## Browser/HiFi receipt required

Audit the actual HiFi and product implementation at 1280px and 660px. Record:

`HiFi element / interaction / copy → component/panel → generated field or
operation → typed state → browser assertion`.

Exercise loading, current partial, blocked mismatch, pending, legacy,
not-published, 400/401/403/404/503, ETag refresh, hard refresh/deep-link,
verify race, keyboard/focus and overflow. Assert that a slider/fold/mount sends
no POST and all network traffic stays at named same-origin BFF operations.
Distinguish `COMPONENT_FIXTURE_BROWSER_RECEIPT`,
`PRODUCT_ROUTE_BROWSER_RECEIPT` and `REAL_API_E2E_RECEIPT`; do not re-record
broad baselines to conceal drift.

## Return packet

Return one P16 receipt to Codex: files/line count, generated contract revision,
mapping matrix, browser command/build SHA/routes/viewports, console/network
result, test counts, source gaps and no-debt conclusion. If a source fact is
needed, send exactly one focused `CG-P16-*` request with locator and
expected/actual typed shape; do not hand-map it.
