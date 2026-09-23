# P14 frontend composition — Screen 05 S1 Split

**Status:** `FE_SPLIT_MOUNTED` · Claude · 2026-09-22
**Build under test:** `a7225304` (worktree `portal-research`, branch `docs/research-loop-plan`)
**Route:** `/research/quantbt/runs/:runId/split` · **Viewports:** 1280×1000 and 660×1000
**Contracts:** `@portal/contracts-research-split` (`research-split.d.ts`, 235 lines)
and `@portal/contracts-research-current-source` (644 lines). No DTO is
hand-written, no error string parsed, no date computed.

## Handoff chain read (A13.1, and CLAUDE.md §7.9)

| Document | Read |
|---|---|
| [`CLAUDE-FOR-thanhvuong.md`](../../CLAUDE-FOR-thanhvuong.md) A13.1–A13.4 | working tree at `a7225304` |
| [P14 packet](./README.md) · [P14 phase report](./phase-report.md) · [P14 frontend handoff](./frontend-handoff-claude.md) | working tree, including the RS-01 and Astra `AUDIT_REOPENED` addenda at its head |
| [P13 packet](../P13/README.md) + its **2026-09-22 amendment** [run identity and fold navigation](../P13/contract-amendment-run-identity-fold-navigation.md) | consumed at `f8e2d8cf` before starting this screen |
| [P11 display-fact amendment](../P11/contract-amendment-display-facts.md) · [P12 packet](../P12/README.md) · my P13 composition | working tree |
| [RS-01](../RS-01/frontend-handoff-claude.md) · [RS-02](../RS-02/frontend-handoff-claude.md) + [coverage matrix](../RS-02/field-action-coverage-matrix.md) | working tree |
| [spec 05](../../release-v1.1/docs/screens/05_s1_split.md), 431 lines | read in full |
| `QuantBT 05 S1 Split.dc.html` | **rendered in Chromium at 1280 and 660** and read against the build |

Two corrections in the chain are honoured: audit A11 (Code Anatomy belongs to
S14, not here — no import stage exists on this screen) and RS-01 (an invalid
chronology or transform mismatch is a server refusal that stays a panel state).

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/SplitDetail.tsx` | 741 | header · protocol strip · window anatomy · fold anatomy · holdout · absences · rules footer |
| `src/research/splitDetail.test.tsx` | 553 | `P14-T01…T07`, 28 tests |
| `src/research/splitClient.ts` | 215 | two named operations, window narrowing, timeline geometry, refusals |
| `src/research/useSplit.ts` | 104 | one split read with ETag, one optional fold read |
| `src/research/SplitRoute.tsx` | 32 | the product route, on the shared cursor |
| `e2e/_probe-research-product.spec.ts` | +131 | six browser tests |
| `e2e/research-foundation/split-detail.json` | 110 | the three windows, a metadata-bound holdout, six protocol absences |
| `e2e/fixtures.ts` | +26 | both operations stubbed, the fold read as a typed refusal |
| `QuantBTModule.tsx`, `tsconfig.json`, `researchBoundary.test.ts` | +12 | route, alias, fetch allowlist |

`git diff --stat a5582c21 a7225304`: **18 files, +2434, −33** (includes the P13
amendment consumption committed at `f8e2d8cf`).

## Mapping matrix — hi-fi element → component → contract → state → assertion

| Hi-fi element / interaction | Component | Generated field | Typed state | Browser assertion |
|---|---|---|---|---|
| Breadcrumb `Evidence Flow / run / Stage 1 · Split` | `SplitScreen` | — | — | `…carries the cursor back to the hub` |
| Title + subtitle | `SplitScreen` | — (verbatim spec §2.1, §9) | — | `…renders every block` |
| Protocol chip | protocol strip | `protocol.kind` | `THREE_WINDOW_CURRENT` / withheld | same |
| `selection` | protocol strip | `protocol.selection.state` | `FIXED_PROFILE_NO_SEARCH` | same |
| strict outer OOS | `Absent` | `protocol.selection.strict_outer_oos` | **`NOT_ASSERTED`** | unit `P14-T04`; no verdict badge |
| parameter bundle digest | protocol strip | `selection.parameter_bundle_digest` | shown, never parsed | `…renders every block` |
| Timeline axis | `WindowAnatomy` | `timeline` | `AVAILABLE` / withheld | endpoints printed as ISO |
| warmup segment | `WindowAnatomy` | `windows.warmup` | `AVAILABLE` / `NOT_APPLICABLE` | hairline + badge, or its reason |
| IS segment | `WindowAnatomy` | `windows.is` | `AVAILABLE` / `AbsentFact` | `2994 bars` in the legend |
| outer OOS segment | `WindowAnatomy` | `windows.outer_oos` | `AVAILABLE` / `AbsentFact` | adjacency asserted in the browser |
| holdout band | `WindowAnatomy` | `windows.holdout` | hatched, labelled | `…describes the holdout` |
| fold rows | `FoldRows` | `researchCurrentSourceSplitGetV1` `fold_plan.folds[]` | ready / refused | `…keeps a fold refusal inside the fold panel` |
| fold row click | `FoldRows` | cursor | — | unit `P14-T05` |
| inner folds | `SourceGap` | `protocol.inner_folds` | source gap + verbatim caption | `[data-gap='inner-folds']` |
| purge · embargo · θ* · gap scan · fold plan | `Absent` | `protocol.*` | six `AbsentFact` rows | six rows asserted |
| holdout integrity | `HoldoutCard` | `snapshot_integrity_state` | `P08_METADATA_BOUND` | never the word SEALED |
| holdout evaluation / exposure | `HoldoutCard` | `evaluation_state`, `child_input_state` | `NOT_EVALUATED`, `NOT_EXPOSED_TO_CHILD_TAPE` | asserted separately |
| physical I/O | `Absent` | `holdout.physical_io` | `NOT_ATTESTED` | reason code in the title |
| seal / unlock record | `Absent` | `holdout.source_seal`, `holdout.unlock` | `AbsentFact` | unit `P14-T03` |
| unlock action | `HoldoutCard` | `actions.holdout_unlock` | `NOT_PUBLISHED`, `href: null` | a click issues **no request** |
| rules footer | `SplitScreen` | — (verbatim spec §2.7) | — | `…renders every block` |
| 400/401/403/404/409/503 | `ResearchPanel` | `Problem` | denied / empty / stale / unavailable | unit `P14-T06` |

### Deliberate deviations from the hi-fi, and why

| Hi-fi | Built | Reason |
|---|---|---|
| `SEALED · LOCKED` holdout chip | `p08 metadata bound` | The contract publishes `P08_METADATA_BOUND` and states no seal record exists. "SEALED" would assert one. |
| "The seal caps this run's certificate at B" | omitted | No cap is published on this screen. The other two holdout rules, which hold regardless, are verbatim. |
| Year ticks along the axis | endpoints + per-window ISO ranges | A tick is a date this screen would have to generate. Spec 05's first rule is that it never computes one. |
| Protocol strip grid (`outer folds 5`, `purge 24h`, `embargo 72h`) | the published facts, the rest as named absences | None of those numbers is published for this run. |
| θ* per fold, gap-scan table, inner-fold rows | typed gaps | Same. |

## Browser receipt

```
cd apps/portal/frontend
npm run build                                              # BUILD_EXIT=0
npx playwright test --config=playwright.research-probe.config.ts -g "S05"
```

`PRODUCT_ROUTE_BROWSER_RECEIPT`, against `vite preview` on
`http://127.0.0.1:4317` serving the `a7225304` build.

| Lane | Command | Result |
|---|---|---|
| Unit · Screen 05 | `npx vitest run src/research/splitDetail.test.tsx` | **28 passed** |
| Unit · whole frontend | `npx vitest run` | **2873 passed, 1 skipped (166 files)** |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Build | `npm run build` | exit 0 |
| Browser · S05 | `-g "S05"` | **6 passed** |
| Browser · all Research product routes | full probe config | **55 passed** |
| Console / page errors | recorded in the S05 tests | **0**, beyond the one browser-level line for the deliberately refused retained-source read |
| Horizontal overflow | 1280 and 660 | `scrollWidth − clientWidth ≤ 0` at both |

Screenshots (ephemeral): `s05-split-laptop.png`, `s05-split-mobile.png`, read
against `hifi-05-laptop.png` / `hifi-05-mobile.png`.

One infrastructure note, recorded rather than hidden: the first full probe run
failed with `ERR_CONNECTION_REFUSED` because the external preview server on
4317 had exited. It was restarted and the suite passed 55/55; no test was
changed to make that happen.

## Source gaps — one focused request

**`CG-P14-01` — the axis, or an explicit ruling that it stays unlabelled.**
Spec 05 §2.3 puts year ticks under the fold anatomy. Every date on this screen
is a server fact, and the split contract publishes exactly four spans plus a
timeline range — no tick series. This screen therefore draws the two endpoints
and each window's own ISO range, and no ticks.
*Source locator:* `research-split.openapi.json` → `SplitDetail.timeline`.
*Expected:* either a published tick/axis label set, or a ruling that generating
axis labels from the timeline range is presentation rather than a computed
boundary.
*Actual:* neither, so the axis is honest and sparse. Nothing is derived in the
meantime.

Not requested, deliberately: purge, embargo, inner folds, θ* per fold and the
gap scan. The contract states the current source publishes none of them, and
the handoff says to keep them as typed gaps — which is what they are.

## Re-audit, 2026-09-23 (`bdeb0268`)

Read back against this phase's handoff, spec and hi-fi. What the first pass
missed, and what was done about it:

| Finding | Fix |
|---|---|
| Provenance was rendered nowhere: `source_adapter_id`, `engine_version`, `input_scope` and five digests all went unread, though spec 05 §2.1 gives the header a `fold_plan` digest chip | shared `ProvenanceStrip` disclosure, with requested and effective spec as two separate facts |
| `windows.holdout.result_exposure_state` was not shown — two of the handoff's three exposure facts were on screen, not three | third chip beside the other two |
| Spec 05 §2.3's ×6 purge/embargo lens is not built | the source publishes no purge or embargo span, so there is nothing to magnify; the hairline floor and its badge serve the same rule for the windows that do exist. Recorded, not hidden |
| No hard-refresh, keyboard-name or ETag check in the browser lane | all three added |

Counts after the audit: **28 unit tests**, **10 browser tests** (6 S05 + the
shared refresh/provenance pair), suite 2920 passed, probe 74 passed.

## Not claimed

Fixture receipts only; no backend was called and `REAL_API_E2E_RECEIPT` is not
claimed. Visual baselines were not re-recorded and no threshold widened;
Screen 05 is not in the immutable visual suite. The Astra `AUDIT_REOPENED`
items for P14 (A03 range validation, warmup/data-use proof, supported fold
mapping) are backend remediation and are not closed by this screen. Screens 06
and 07 have no route yet, so the next-stage navigation is not wired.

All open requests from this phase are consolidated in [the Codex request list](../CODEX_REQUESTS_FROM_CLAUDE_P13_P16.md).
