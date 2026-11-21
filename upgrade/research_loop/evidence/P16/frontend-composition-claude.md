# P16 frontend composition — Screen 07 S3 Freeze

**Status:** `FE_FREEZE_MOUNTED` · Claude · 2026-09-22
**Build under test:** `13b0c176` (worktree `portal-research`, branch `docs/research-loop-plan`)
**Route:** `/research/quantbt/runs/:runId/freeze` · **Viewports:** 1280×1000 and 660×1000
**Contracts:** `@portal/contracts-research-freeze` (`research-freeze.d.ts`, 300 lines)
and `@portal/contracts-research-current-source`. No DTO hand-written, no digest
derived, no verdict computed, no error prose parsed.

## Handoff chain read (A13.1, CLAUDE.md §7.9)

| Document | Read |
|---|---|
| [`CLAUDE-FOR-thanhvuong.md`](../../CLAUDE-FOR-thanhvuong.md) A13.1–A13.4 | working tree at `13b0c176` |
| [P16 packet](./README.md) · [phase report](./phase-report.md) · [frontend handoff](./frontend-handoff-claude.md) | working tree, with its RS-01 and Astra `AUDIT_REOPENED` heads |
| [P13 amendment](../P13/contract-amendment-run-identity-fold-navigation.md) | consumed at `f8e2d8cf` |
| [P14](../P14/frontend-handoff-claude.md) + my [P14 composition](../P14/frontend-composition-claude.md) | working tree |
| [P15](../P15/frontend-handoff-claude.md) + my [P15 composition](../P15/frontend-composition-claude.md) | working tree |
| [P11 display-fact amendment](../P11/contract-amendment-display-facts.md) · [P12 packet](../P12/README.md) | working tree |
| [RS-01](../RS-01/frontend-handoff-claude.md) · [RS-02](../RS-02/frontend-handoff-claude.md) + [coverage matrix](../RS-02/field-action-coverage-matrix.md) | working tree |
| [spec 07](../../release-v1.1/docs/screens/07_s3_freeze.md) | read |
| `QuantBT 07 S3 Freeze.dc.html` | **rendered in Chromium at 1280 and 660** and read against the build |

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/FreezeDetail.tsx` | 683 | breadcrumb · freeze strip · integrity · frozen parameters · ordering · what-if · inspection · retained custody · rules footer |
| `src/research/freezeDetail.test.tsx` | 600 | `P16-T01…T07`, 23 tests |
| `src/research/freezeClient.ts` | 215 | three named operations, CSRF on the one write, scope copy, refusals |
| `src/research/useFreeze.ts` | 140 | one read, one click-only verification, one optional retained check |
| `src/research/FreezeRoute.tsx` | 34 | the product route, on the shared cursor |
| `e2e/_probe-research-product.spec.ts` | +126 | six browser tests |
| `e2e/research-foundation/freeze-detail.json` + `freeze-verification.json` | 143 | a `PARTIAL` snapshot and its verification |
| `e2e/fixtures.ts` | +29 | all three operations stubbed |
| `QuantBTModule.tsx`, `tsconfig.json`, `researchBoundary.test.ts` | +12 | route, alias, fetch allowlist |

`git diff --stat 61ee9be4 13b0c176`: **12 files, +2138, −2**.

## Mapping matrix

| Hi-fi element / interaction | Component | Generated field / operation | Typed state | Browser assertion |
|---|---|---|---|---|
| Breadcrumb + `← S2 Search` | `FreezeScreen` | — | — | unit `P16-T06` |
| Title + subtitle | `FreezeScreen` | — | — | `…renders every block` |
| ordering scenario strip | freeze strip | `freeze.source_profile.state` | `FIXED_PROFILE_NO_SELECTION_ARTIFACT` | same |
| `✓ ORDER VERIFIED` badge | **not built** | `ordering.state = NOT_ASSERTED` | no verdict at all | `[data-panel='ordering'] [data-verdict]` is empty |
| F1 two axes — data time | `WindowRow` ×3 | `ordering.data_time.{is,outer_oos,holdout}` | `AVAILABLE` | three rows, server UTC-ms |
| F1 wall clock rail | `Gap` | `ordering.wall_clock` | `NOT_ASSERTED` | unit `P16-T04` |
| F2 frozen θ* per fold | `FrozenParameters` | `frozen_parameters[]` | exact decimals + server position | three rows at 1280 |
| F3 digest chain | `IntegrityPanel` | `integrity.checks[]` | `MATCH` ×3 | both digests printed per check |
| chain scope | `IntegrityPanel` | `integrity.verification_scope` | `PORTAL_RETAINED_DIGEST_BINDING_ONLY` | `…never lets three matches read as a verified chain` |
| artifact bytes | `Gap` | `integrity.source_artifact_bytes` | **`NOT_ATTESTED`** | in the same panel as the matches |
| `VERIFY DIGEST` | `IntegrityPanel` button | `researchFreezeVerifyPostV1` | click-only, CSRF | `…writes only when the reader clicks verify` |
| blocked banner | `IntegrityPanel` + `FrozenParameters` | `integrity.state = BLOCKED` | empty table + named mismatch | unit `P16-T02` |
| what-if grid + sliders | **not built** | `what_if.grid`, `.actions.*` | `NOT_APPLICABLE`, `may_submit:false` | no `input[type=range]`, one button on the page |
| sibling draft action | `what-if` panel | `actions.sibling_draft.may_create` | false | `[data-may-create='false']` |
| fold navigation | `inspection` panel | `freeze.inspection.requested_fold`, `.state` | `NOT_APPLICABLE` | fold from the cursor, answered typed |
| retained custody | `RetainedPanel` | `researchCurrentSourceFreezeGetV1` | ready / refused | scope sentence asserted |
| rules footer | `FreezeScreen` | — | — | unit `P16-T06` |
| 400/401/403/404/409/503 | `ResearchPanel` | `Problem` | typed grammar | unit `P16-T06` |

### Deliberate deviations

| Hi-fi | Built | Reason |
|---|---|---|
| `✓ ORDER VERIFIED` | no badge | `ordering.state` is `NOT_ASSERTED`; a green tick would assert what the source refused to. |
| per-fold frozen sets with a fold selector | one frozen set | The contract publishes one `frozen_parameters` list and no fold selection artifact. |
| what-if grid, sliders, `VERIFY` on a cell | nothing | `may_submit` and `may_create` are pinned false; a disabled slider still promises movement. |
| `CERT FROM THIS STAGE · B` | omitted | No certificate is published on this screen. |
| Ordering scenario switcher (4 demo scenarios) | omitted | Demo lanes may not share a product route; a run has one ordering. |

## Browser receipt

```
cd apps/portal/frontend
npm run build                                              # BUILD_EXIT=0
npx playwright test --config=playwright.research-probe.config.ts -g "S07"
```

`PRODUCT_ROUTE_BROWSER_RECEIPT` against `vite preview` on `127.0.0.1:4317`
serving the `13b0c176` build.

| Lane | Command | Result |
|---|---|---|
| Unit · Screen 07 | `npx vitest run src/research/freezeDetail.test.tsx` | **23 passed** |
| Unit · whole frontend | `npx vitest run` | **2916 passed, 1 skipped (168 files)** |
| Typecheck · build | `tsc --noEmit`, `npm run build` | exit 0, exit 0 |
| Browser · S07 | `-g "S07"` | **6 passed** |
| Browser · all Research product routes | full probe config | **67 passed** |
| Console / page errors | recorded in the S07 tests | **0** beyond the deliberately refused retained read |
| Horizontal overflow | 1280 and 660 | `≤ 0` at both |

Screenshots: `s07-freeze-laptop.png`, `s07-freeze-mobile.png`, read against
`hifi-07-laptop.png` / `hifi-07-mobile.png`.

**Two flakes observed, recorded rather than patched.** `foundation.test.tsx`
(P09) failed once in isolation during the P13 slice and then passed three times
in this tree and three at `c2115cd7`. `tradeReplayEvents.test.tsx` (Execution)
failed once in a full parallel run here and passed twice alone and once in a
full re-run (2916/2916). Neither is in a file this campaign touched; both are
logged as load-dependent flakes, and no test was changed to make them pass.

## Source gaps — one focused request

**`CG-P16-01` — what a verification proves, as a typed fact.**
The screen prints the scope sentence from `verification_scope`, which is the
right source. But `FreezeVerification` carries `result` and `integrity` and no
`verified_scope` of its own, so a re-read's own scope has to be taken from the
snapshot it refreshed.
*Source locator:* `research-freeze.openapi.json` → `FreezeVerification`.
*Expected:* `verification_scope` on the verification itself, so the result a
reader just triggered carries the qualification that belongs to it.
*Actual:* absent; the screen shows the snapshot's scope beside the result, which
is correct today only because both come from the same run at the same moment.

## Re-audit, 2026-09-23 (`bdeb0268`)

Read back against this phase's handoff, spec and hi-fi. What the first pass
missed, and what was done about it:

| Finding | Fix |
|---|---|
| Provenance was rendered nowhere, including `p14_split_revision` and `source_split_digest` | shared `ProvenanceStrip` disclosure |
| A window's `evaluation_state`, the frozen table's `bound_state`, the contract's `readiness` and the verification's own `freeze_revision` were all unread | each rendered; the fixture now publishes an `evaluation_state` so the browser asserts it |
| The title was paraphrased; spec 07 §2.1 fixes it | restored verbatim: "S3 · Freeze — ordering & integrity" |
| The verify button read "verify again"; spec 07 §7 fixes "verify now" | corrected |
| Spec 07 §2.2's two-clock note was absent | rendered verbatim, followed by the fact that only one of those clocks is published for this run |
| Spec 07 §2.1's subtitle is **not** rendered | it asserts "Selection closed before any out-of-sample bar was read", which is exactly the ordering `ordering.state = NOT_ASSERTED` refuses to claim and the handoff forbids. The reason sits in the file where the string would have gone |
| No hard-refresh, keyboard-name or ETag check in the browser lane | all three added |

Counts after the audit: **24 unit tests**, **8 browser tests**, suite 2920
passed, probe 74 passed.

## `CG-P16-01` closed and consumed — 2026-09-23 (`c650307d`)

`FreezeVerification` now carries its own `verification_scope`
([amendment](./contract-amendment-verification-scope.md)). The result a reader
triggers prints the scope that came with it rather than borrowing the
snapshot's; the nested detail scope stays with the integrity panel, where it
belongs. Neither line permits "chain intact".

The two agree today because both describe the same run at the same moment. The
day they do not, the line under the result is the true one.

## Not claimed

Fixture receipts only; no backend called, `REAL_API_E2E_RECEIPT` not claimed.
No visual baseline re-recorded, no threshold widened. The Astra items reopened
for P16 are backend remediation and are not closed by this screen. Screen 08
has no route, so no next-stage navigation is wired from here.

All open requests from this phase are consolidated in [the Codex request list](../CODEX_REQUESTS_FROM_CLAUDE_P13_P16.md).
