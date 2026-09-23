# P15 frontend composition — Screen 06 S2 Search & Selection

**Status:** `FE_SEARCH_MOUNTED` · Claude · 2026-09-22
**Build under test:** `39514a15` (worktree `portal-research`, branch `docs/research-loop-plan`)
**Route:** `/research/quantbt/runs/:runId/search` · **Viewports:** 1280×1000 and 660×1000
**Contracts:** `@portal/contracts-research-search` (`research-search.d.ts`, 235 lines)
and `@portal/contracts-research-current-source`. No DTO is hand-written, no
error string parsed, no objective, rank, score or position computed.

## Handoff chain read (A13.1, CLAUDE.md §7.9)

| Document | Read |
|---|---|
| [`CLAUDE-FOR-thanhvuong.md`](../../CLAUDE-FOR-thanhvuong.md) A13.1–A13.4 | working tree at `39514a15` |
| [P15 packet](./README.md) · [phase report](./phase-report.md) · [frontend handoff](./frontend-handoff-claude.md) | working tree, with its RS-01 and Astra `AUDIT_REOPENED` heads |
| [P13 packet](../P13/README.md) + [run-identity/fold amendment](../P13/contract-amendment-run-identity-fold-navigation.md) | consumed at `f8e2d8cf` |
| [P14 packet](../P14/README.md) + [handoff](../P14/frontend-handoff-claude.md) + my [P14 composition](../P14/frontend-composition-claude.md) | working tree |
| [P11 display-fact amendment](../P11/contract-amendment-display-facts.md) · [P12 packet](../P12/README.md) | working tree |
| [RS-01](../RS-01/frontend-handoff-claude.md) · [RS-02](../RS-02/frontend-handoff-claude.md) + [coverage matrix](../RS-02/field-action-coverage-matrix.md) | working tree |
| [spec 06](../../release-v1.1/docs/screens/06_s2_search.md) | read in full |
| `QuantBT 06 S2 Search and Selection.dc.html` | **rendered in Chromium at 1280 and 660** and read against the build |

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/SearchDetail.tsx` | 647 | breadcrumb · source strip · Stage A · freeze line · Stage B · ledger · rules footer |
| `src/research/searchDetail.test.tsx` | 488 | `P15-T01…T06`, 20 tests |
| `src/research/searchClient.ts` | 207 | two named operations, gap vocabulary, refusals |
| `src/research/useSearch.ts` | 107 | one search read with the fold selector, one optional ledger read |
| `src/research/SearchRoute.tsx` | 32 | the product route, on the shared cursor |
| `e2e/_probe-research-product.spec.ts` | +119 | six browser tests |
| `e2e/research-foundation/search-detail.json` | 63 | fixed profile with four parameters, seven diagnostic absences |
| `e2e/fixtures.ts` | +25 | both operations stubbed, the retained lane as a typed refusal |
| `QuantBTModule.tsx`, `tsconfig.json`, `researchBoundary.test.ts` | +12 | route, alias, fetch allowlist |

`git diff --stat 30244306 39514a15`: **11 files, +1862, −2**.

## Mapping matrix

| Hi-fi element / interaction | Component | Generated field | Typed state | Browser assertion |
|---|---|---|---|---|
| Breadcrumb + `← S1 Split` | `SearchScreen` | — | — | `…walks back to the hub and to S05` |
| Title + subtitle | `SearchScreen` | — (verbatim) | — | `…renders every block` |
| mode × schedule header | source strip | `requested_optimizer.mode`, `.schedule`, `.state` | `DECLARED_NOT_EXECUTED` | same |
| 5 mode pills / switcher | **not built** | — | — | `…offers no mode switcher` (unit) |
| installed source | `Chip` | `source_profile.state` | `FIXED_PROFILE_NO_SEARCH` | never reads inactive/broken |
| A1 search space | `ParameterTable` | `fixed_profile.parameters[]` | `AVAILABLE` | four rows, exact decimals |
| θ* tick in range | `ParameterTable` | `position_percent` | server-placed | `style.left === position_percent%` |
| bound state | `ParameterTable` | `bound_state` | `WITHIN_DECLARED_RANGE` | stated once under the table |
| strict outer OOS | `Gap` | `fixed_profile.strict_outer_oos` | **`NOT_ASSERTED`** | no verdict badge |
| A2 trial surface | `EmptyPanel` | `diagnostics.scatter` | `NOT_APPLICABLE` | no canvas, no svg |
| A3 progression / pruned rail | `EmptyPanel` | `diagnostics.progression`, `.prune_reasons` | `NOT_APPLICABLE` | reason code shown |
| A4 distributions · frequency | `EmptyPanel` | `diagnostics.distributions`, `.parameter_frequency` | `NOT_APPLICABLE` | same |
| A5 importance · interactions | `EmptyPanel` | `diagnostics.importance`, `.interactions` | **`NOT_PUBLISHED`** | different word from the five above |
| freeze line | `SearchScreen` | `selection.state` | kept in the geometry | title explains it froze nothing |
| B1 pool funnel · B3 best≠selected · B4 θ* journey | `selection` panel | `selection.selected_trial_ref` (null) | no best card, no pick | `…points at no trial` |
| B2 formula | `Gap` | `selection.selection_trace` | `NOT_PUBLISHED` | unit `P15-T04` |
| fold inspection | `inspection` panel | `inspection.requested_fold`, `.state` | `NOT_APPLICABLE` | `fold=3` sent, answered not applicable |
| trial ledger | `LedgerPanel` | `researchCurrentSourceSearchGetV1` / `ledger.reason_code` | ready / refused | ledger reason `P04_RAN_NO_TRIALS` shown |
| selected vs raw-best vs inspected | `LedgerRows` | `selection.selected_trial_id`, `ledger.trials[]` | distinct | unit `P15-T05` |
| rules footer | `SearchScreen` | — | — | `…renders every block` |
| 400/401/403/404/503 | `ResearchPanel` | `Problem` | typed grammar | unit `P15-T06` |

### Deliberate deviations

| Hi-fi | Built | Reason |
|---|---|---|
| Five-mode demo tape with a live switcher | not built | The handoff allows it only if visibly labelled fixture and never on a product route. A demo lane beside real facts is the failure mode this campaign keeps finding; the product route renders the contract and nothing else. |
| KaTeX objective formula per mode | omitted | `selection_trace` is `NOT_PUBLISHED`; a formula would be a claim about how a selection was made that no response supports. |
| Trial surface, progression, distributions, importance, pool funnel | empty panels with reason codes | The source ran no trials. |
| "Search cinema" playback | omitted | It replays search artifacts; there are none. |

## Browser receipt

```
cd apps/portal/frontend
npm run build                                              # BUILD_EXIT=0
npx playwright test --config=playwright.research-probe.config.ts -g "S06"
```

`PRODUCT_ROUTE_BROWSER_RECEIPT` against `vite preview` on `127.0.0.1:4317`
serving the `39514a15` build.

| Lane | Command | Result |
|---|---|---|
| Unit · Screen 06 | `npx vitest run src/research/searchDetail.test.tsx` | **20 passed** |
| Unit · whole frontend | `npx vitest run` | **2893 passed, 1 skipped (167 files)** |
| Typecheck · build | `tsc --noEmit`, `npm run build` | exit 0, exit 0 |
| Browser · S06 | `-g "S06"` | **6 passed** |
| Browser · all Research product routes | full probe config | **61 passed** |
| Console / page errors | recorded in the S06 tests | **0** beyond the deliberately refused retained read |
| Horizontal overflow | 1280 and 660 | `≤ 0` at both |

Screenshots: `s06-search-laptop.png`, `s06-search-mobile.png`, read against
`hifi-06-laptop.png` / `hifi-06-mobile.png`.

**One defect the browser found.** Every empty panel repeated the same
paragraph, so seven identical sentences buried the one thing that differed —
which panel is empty for which reason. The rule is now stated once above the
panels and each panel carries only its own reason code. The per-row
`within declared range` chip wrapped to three lines and pushed the values off
the line; it is a constant for every row, so it is stated once under the table.

## Source gaps — one focused request

**`CG-P15-01` — the objective definition for a fixed profile.**
Spec 06 §5 gives Stage B a formula panel (`J` per mode). The contract publishes
`selection.selection_trace` as `NOT_PUBLISHED`, so no formula is drawn. For a
run that ran no search that is arguably correct — but the *candidate selection
metric* the hi-fi shows in its claim row is a property of the requested mode,
not of a trial, and might be publishable even here.
*Source locator:* `research-search.openapi.json` → `Selection` (no metric or
objective definition field).
*Expected:* either a typed `candidate_selection_metric` on the requested
optimizer, or a ruling that a declared-not-executed request publishes no
metric.
*Actual:* neither, so the formula panel and the metric chip are both absent.
Nothing is inferred from the mode name in the meantime.

## Re-audit, 2026-09-23 (`bdeb0268`)

Read back against this phase's handoff, spec and hi-fi. What the first pass
missed, and what was done about it:

| Finding | Fix |
|---|---|
| Provenance was rendered nowhere | shared `ProvenanceStrip` disclosure |
| `readiness` was never shown, though the contract publishes it — and `PARTIAL` here means a source that published a profile and no study, not a partial failure | readiness chip in the source strip |
| Spec 06 §10's switcher note was absent | its second half is rendered verbatim — "a real run's mode is fixed at submit" — and the first half, which points at a demo control this route does not have, is dropped with the reason in the file |
| No hard-refresh, keyboard-name or ETag check in the browser lane | all three added |

Counts after the audit: **21 unit tests**, **8 browser tests**, suite 2920
passed, probe 74 passed.

## Not claimed

Fixture receipts only; no backend called, `REAL_API_E2E_RECEIPT` not claimed.
No visual baseline re-recorded, no threshold widened. The Astra items reopened
for P15 (A09 Portal producer/retention/ledger integration) are backend work and
are not closed by this screen. Screen 07 has no route yet at this commit, so
the next-stage navigation is not wired from here.

All open requests from this phase are consolidated in [the Codex request list](../CODEX_REQUESTS_FROM_CLAUDE_P13_P16.md).
