# P15 frontend handoff — Screen 06 Search and Selection

> **RS-01 amendment (2026-09-22):** no optimizer data is published. Preserve
> rich fixed-profile composition and its panel-local typed absences; the shared
> retained read is now cancellable/bounded server-side, which needs no browser
> retry loop or custom timeout policy. See
> [RS-01 handoff](../RS-01/frontend-handoff-claude.md).

**Astra review addendum — 2026-09-22: `AUDIT_REOPENED`.** Read the
[P13–P17 audit/remediation guide](../../P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md)
and Unified checkpoint before using this handoff. The v1 facts below describe
a partial fixed-profile surface, not full screen/backend acceptance or proof
that QuantBT lacks the omitted capabilities. Preserve your rich composition;
consume new generated contracts per panel when published. No backend/runtime
change is authorized by this audit note. Finish/preserve your P12 work.

P15 backend/current-source contract is ready but feature/runtime is dark.
Implement only Research Screen-06 client/composition/tests you own. Do not
modify P15 Control API, P10/P11/P14 source chain, P04 binding, migrations,
deployment overlay, Execution code or the current P12 worktree changes to make
the page look like a generic optimizer.

## Mandatory reading — record `READ`

1. [`CLAUDE-FOR-thanhvuong.md` A13.1–A13.4](../../CLAUDE-FOR-thanhvuong.md),
   especially ownership, handoff-chain and browser-first HiFi rules.
2. P10/P11/P12/P13/P14 packets; finish or commit the currently owned P12
   changes before adding a P15 import/alias.
3. This handoff and [P15 phase report](./phase-report.md).
4. Screen-06 [spec](../../release-v1.1/docs/screens/06_s2_search.md) and
   `QuantBT 06 S2 Search and Selection.dc.html` **opened in a browser** at
   1280px and 660px, not merely read as text.
5. Generated source only:
   [`research-search.openapi.json`](../../../../packages/contracts/openapi/research-search.openapi.json)
   and [`research-search.d.ts`](../../../../packages/contracts/generated/research-search.d.ts).

## Use one generated operation only

```bash
npm --prefix packages/contracts run generate:research-search
```

Add the frontend path alias for `@portal/contracts-research-search` in your
own P15 consumer commit (after your P12 `tsconfig.json` work is settled), then
use only `researchSearchDetailGetV1` against:

`GET /api/v1/quantbt/runs/{runId}/search?workspace_id=&fold=`

Retain revision/ETag and UTC milliseconds exactly. Do not use a local DTO,
parse an error string, calculate a digest/date/score, call an internal or
legacy route, call the worker/adapter/source database/artifact/Parquet layer,
or send a relation/cursor/source revision/command input from the browser.

## Required rich-but-truthful Screen-06 presentation

Keep the HiFi shell, Stage A/Freeze/Stage B geometry and responsive behavior.
Replace individual panel contents with typed source truth; never replace the
whole route with a generic unavailable envelope.

| Contract field/state | Required product rule |
|---|---|
| `source_profile.state=FIXED_PROFILE_NO_SEARCH` | label installed source as a fixed qualification, not an inactive/broken optimizer |
| `fixed_profile.parameters` | render exact declared bounds/step/effective decimal strings and server display position; do not calculate alternative selection/scores or silently round values |
| `requested_optimizer.state=DECLARED_NOT_EXECUTED` | say the request declared a mode/schedule but P04 did not execute a search; never render it as a current study/mode switcher or selection formula |
| `selection.selected_trial_ref=null`, `FIXED_PARAMETER_PROFILE` | do not create best/selected cards, a pick hash, jump-to-trial action, Freeze action, trial drawer or θ* claimed to originate from a trial |
| `ledger`, `diagnostics`, `source_absences` typed `NOT_APPLICABLE` | retain the visual panel/card with exact reason code/copy. No empty chart pretending no candidates existed, no `0`, no fixture points, no disabled POST button. |
| `strict_outer_oos=NOT_ASSERTED` | do not show OOS pass/fail/selection chips or any inferred objective. |
| `PENDING_SOURCE_CALLBACK`, `LEGACY_METADATA_ONLY`, `NOT_PUBLISHED`, `400/401/403/404/503` | preserve breadcrumb and screen structure, use existing typed error grammar, never show raw server messages/internal fields. |

The five-mode rich fixture/demo lane from the HiFi may be preserved for visual
and interaction testing **only if it is visibly labelled fixture/demo and never
shares a product-route response or claim**. The product route for a real P04
run only renders the current fixed-profile contract. A future source publishes
real optimizer facts; it will get a new discriminated generated contract, not
a frontend inference branch.

## Browser/HiFi receipt is mandatory

Before claiming P15 FE completion, make a direct browser audit at 1280px and
660px and record:

`HiFi element / interaction / copy → component/panel → generated field → typed
state → browser assertion`.

Exercise loading, fixed-profile available, pending, legacy, mismatch,
not-published, typed 400/401/403/404/503, ETag refresh, hard refresh,
deep-link, keyboard/focus and overflow. Verify no network request starts an
optimizer or reaches anything except the named same-origin BFF. Do not
re-record broad visual baselines to mask drift. Mark receipts distinctly as
`COMPONENT_FIXTURE_BROWSER_RECEIPT`, `PRODUCT_ROUTE_BROWSER_RECEIPT` or
`REAL_API_E2E_RECEIPT`.

## Return packet

Return one P15 Markdown receipt to Codex: files/line count, generated contract
revision, read chain, mapping matrix, browser command/build SHA/routes/
viewports, console/network result, test counts, source gaps and no-debt
conclusion. If a factual source gap is found, send one focused `CG-P15-*`
request with source locator and expected/actual generated shape; do not write a
manual field/parser or modify backend ownership.
