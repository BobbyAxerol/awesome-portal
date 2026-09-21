# P14 frontend handoff — Screen 05 Split, chronology and holdout truth

Backend and generated P14 contracts are ready, but **feature/runtime remains
dark**. Work only in the Research Screen-05 composition, route, client and
tests you own. Do not modify P14 Control API, OpenAPI, migration, PostgreSQL
role grants, P10/P11 worker, QuantBT adapter, relay, deployment overlay or
Execution code to make a panel render.

## Mandatory reading chain — record `READ`, do not skip

1. [`CLAUDE-FOR-thanhvuong.md` A13.1–A13.4](../../CLAUDE-FOR-thanhvuong.md),
   especially full handoff-chain, ownership and browser-first HiFi rules.
2. P08/P10/P11/P12/P13 packets and applicable addenda, particularly the P11
   display-fact amendment and current P12 frontend work.
3. This packet and [phase report](./phase-report.md).
4. Screen-05 [spec](../../release-v1.1/docs/screens/05_s1_split.md) and
   `QuantBT 05 S1 Split.dc.html` **opened in a browser**, not merely read as
   text.
5. Generated source only:
   [`research-split.openapi.json`](../../../../packages/contracts/openapi/research-split.openapi.json)
   and [`research-split.d.ts`](../../../../packages/contracts/generated/research-split.d.ts).

## Use only this named operation

Regenerate before writing the client:

```bash
npm --prefix packages/contracts run generate:research-split
```

| Generated operation | Product role |
|---|---|
| `researchSplitDetailGetV1` | one immutable Screen-05 snapshot; retain `revision`/ETag; preserve UTC milliseconds and source states/reason codes exactly |

Never call `/internal/*`, legacy alpha/run routes, direct Portal/QuantBT DB,
artifact/Parquet/file paths, a worker journal, source transport, fixture API
or a generic relation endpoint from a product route. Do not decode a digest,
calculate date boundaries, infer a fold, derive a selection/seal, or add a
holdout action. A new fact/action needs one focused `CG-P14-*` request with a
source locator and expected/actual shape—not a hand-written DTO or parser.

## Required rich-but-truthful composition

Keep Screen-05's complete HiFi shell in every state; replace only the content
inside individual panels, never the entire route with a generic unavailable
envelope.

The HiFi has four **visual** groups. Preserve three functional authority states
(source chronology / observed OOS / sealed holdout) and make **Code Anatomy**
a presentational substage, not a fourth server state or an implied gate.

| Generated fact | Required presentation rule |
|---|---|
| `timeline`, `windows.is`, `windows.outer_oos` | show server UTC-ms boundaries/counts exactly; do not calculate alternate labels or resize time intervals |
| `windows.warmup` | when `AVAILABLE`, label non-scored copied input; when `NOT_APPLICABLE`, preserve panel layout with its exact reason |
| `windows.holdout` | show metadata-bound, not exposed/not evaluated/not exposed; no result, preview, click-through, raw request or unlock affordance |
| `source.physical_io` / holdout source absence | say only `NOT_ATTESTED`; semantic tape exclusion is not a physical Parquet row-group proof |
| `selection.strict_outer_oos.state=NOT_ASSERTED` | preserve the distinction from a failed/passed strict selector; no pass badge or source-grade claim |
| fold/purge/embargo/inner/theta/gap/seal/unlock `NOT_PUBLISHED` | retain local card/drawer with typed reason. Do not render a faux timeline, zero/empty quality result, policy gate or disabled-but-posting button |
| `PENDING_SOURCE_CALLBACK`, legacy, `400/401/403/404/503` | keep breadcrumb/timeline shell and use the existing typed error grammar; do not expose raw server text/relation/worker detail |

## Browser/HiFi receipt is mandatory

Before claiming P14 FE completion, compare the open HiFi HTML directly with a
production-like implementation at **1280px and 660px**. Record:

`HiFi element / interaction / copy → component or panel → generated field or
operation → typed state → browser assertion`.

Exercise loading, available current source, no warmup, pending, legacy,
typed absence/refusal, ETag refresh, hard-refresh/deep-link, all relevant
drawers, keyboard/focus and overflow. Verify navigation never sends a raw
holdout/evaluation/unlock request. Distinguish
`COMPONENT_FIXTURE_BROWSER_RECEIPT`, `PRODUCT_ROUTE_BROWSER_RECEIPT` and
`REAL_API_E2E_RECEIPT`; do not re-record broad visual baselines to hide drift.

## Return packet

Send Codex one Markdown receipt with files/line count, generated contract
revision, reading chain, mapping matrix, browser command/build SHA/routes/
viewports, console/network result, test counts, source gaps and no-debt
conclusion. Do not stage/reset/reformat the currently owned P12 files while
starting Screen 05. If blocked, send exactly one minimal `CG-P14-*` request.
