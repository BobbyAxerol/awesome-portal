# P13 frontend composition — Screen 04 Evidence Flow hub

**Status:** `FE_EVIDENCE_HUB_MOUNTED` · Claude · 2026-09-22
**Build under test:** `d6525a31` (worktree `portal-research`, branch `docs/research-loop-plan`)
**Route:** `/research/quantbt/runs/:runId/evidence` · **Viewports:** 1280×1000 and 660×1000
**Contracts:** `@portal/contracts-research-evidence`
(`research-evidence.d.ts`, 305 lines) and `@portal/contracts-research-current-source`
(`research-current-source.d.ts`, 644 lines). No DTO is hand-written, no error
string parsed, no reader URL authored, no value computed.

## Handoff chain read (A13.1)

| Document | Read |
|---|---|
| [`CLAUDE-FOR-thanhvuong.md`](../../CLAUDE-FOR-thanhvuong.md) A13.1–A13.4 | working tree at `d6525a31` |
| [P10 packet](../P10/README.md) · [P11 packet](../P11/README.md) · [P11 display-fact amendment](../P11/contract-amendment-display-facts.md) | working tree |
| [P12 packet](../P12/README.md) + my [P12 composition](../P12/frontend-composition-claude.md) | working tree |
| [P13 packet](./README.md) · [P13 phase report](./phase-report.md) · [P13 frontend handoff](./frontend-handoff-claude.md) | working tree |
| [RS-01 frontend handoff](../RS-01/frontend-handoff-claude.md) | working tree |
| [RS-02 frontend handoff](../RS-02/frontend-handoff-claude.md) + [field/action coverage matrix](../RS-02/field-action-coverage-matrix.md) | working tree |
| Unified §13 rows P13, RS-01, RS-02, RS-03 and the Astra `AUDIT_REOPENED` checkpoint | working tree |
| [spec 04](../../release-v1.1/docs/screens/04_evidence_flow.md), 485 lines | read in full |
| `QuantBT 04 Evidence Flow.dc.html` | **rendered in Chromium at 1280 and 660** and read against the build |
| `research-evidence.openapi.json`, `research-current-source.openapi.json` | generated types consumed |

Where the hi-fi HTML and spec 04 differ, spec 04 wins: it states its copy is
VERBATIM. Where the Astra checkpoint and the original P13 handoff differ, the
checkpoint wins: this is a partial fixed-profile surface, not full acceptance.

## Which contract answers what

The screen reads **both**, because they answer different questions about the
same run and neither is a fallback for the other:

| Read | Operation | What it gives Screen 04 |
|---|---|---|
| spine, on mount | `researchEvidenceHubGetV1` | metric registry, Stage-5 claim, methodology certificate, stage timeline, four series links, declared source absences, core digests |
| one panel, lazily | `researchCurrentSourceEvidenceGetV1` | the retained Advanced-WFO passport: artifact table row counts, exact equity/return/drawdown, its own three named absences |
| per panel, lazily | `researchEvidenceSeriesGetV1` | one named series, bound to the Hub revision |

RS-02 admits one profile and refuses the rest rather than falling back, so a
refusal there is a **fact about the run**. It is rendered inside the passport
panel; it never becomes the route's state. Nothing in the browser decides which
profile a run is — the screen asks and renders the answer.

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/EvidenceFlow.tsx` | 1494 | claim strip · run header · dataset drawer · 7 tabs · cursor bar · charts · gaps |
| `src/research/evidenceFlow.test.tsx` | 704 | `P13-T01…T09`, 42 tests |
| `src/research/evidenceClient.ts` | 251 | four named operations, ETag/304, revision binding, refusals |
| `src/research/useEvidence.ts` | 198 | hub read, lazy per-panel series, mismatch discard/reread, passport |
| `src/research/evidenceCursor.ts` | 173 | the hash cursor contract, exported for Screens 05–08 |
| `src/research/EvidenceFlowRoute.tsx` | 38 | the product route |
| `e2e/_probe-research-product.spec.ts` | +291 | nine browser tests |
| `e2e/research-foundation/evidence-*.json` | 1343 | hub + three series fixtures |
| `e2e/fixtures.ts` | +35 | the four operations stubbed, including the typed passport refusal |
| `src/features/quantbt/QuantBTModule.tsx` | +9/−3 | route mounted; legacy passport fetch stopped for `/evidence` |
| `src/research/RunLibrary.tsx` | +11/−9 | Screen 01's `open evidence →` is a link again |
| `tsconfig.json`, `researchBoundary.test.ts` | +7 | aliases, fetch allowlist |

`git diff --stat c2115cd7 d6525a31`: **16 files, +4541, −13**.

## Route — needs Bobby's acknowledgement

Spec 04 §1 gives the hub `/research/quantbt/runs/{id}`. That address belongs to
the approved legacy run workspace, so Screen 04 mounts beside it at
`/research/quantbt/runs/:runId/evidence` — the address Screen 01's
`open evidence →` already names. Taking the root would displace an approved
screen; the swap is one line if that is wanted.

## Mapping matrix — hi-fi element → component → contract → state → assertion

| Hi-fi element / interaction | Component | Generated field / operation | Typed state | Browser assertion |
|---|---|---|---|---|
| Claim strip (sticky) | `ClaimStrip` | `claim.state`, `claim.text` | `ISSUED` / `FORECAST` / withheld | `S04 …renders every block` |
| `cert B` chip + tooltip | `ClaimStrip` | `claim.methodology_certificate` | `ISSUED` only | unit `P13-T04`; strip chip jumps to claim tab |
| registry / readiness chips | `ClaimStrip` | `metric_registry_version`, `readiness` | — | `…renders every block` |
| run id · engine · adapter · instrument | `RunHeader` | `run_id`, `core.engine_version`, `core.source_adapter_id`, `core.data.*` | `AVAILABLE` / withheld | `…renders every block` |
| revision | `RunHeader` | `revision` | shown, never parsed | `[data-revision]` contains `rev_7` |
| `generate report →` / `release candidate →` | `RunHeader` | — (Screens 09/11 unrouted) | refused with reason | `…every control is named` |
| `copy evidence link` | `RunHeader` | cursor serialisation | — | unit `P13-T05` |
| dataset chip → drawer | `DatasetDrawer` | `core.data.*`, five digests | per-row withheld | `…opens the dataset drawer` |
| drawer coverage bar / gap scan / vendor | `SourceGap` | — | source gap | `[data-gap='dataset-coverage']` |
| drawer footer copy | `DatasetDrawer` | — (verbatim spec §9) | — | — |
| 7 stage tabs + subs | `StageTabs` | `stages[].state`, `metrics.length`, `series.length`, cert grade | — | `…renders every block`, `…operable by keyboard` |
| evidence cursor bar | `CursorBar` | hash only | `trial`/`params`/fold count withheld | `…keeps one cursor across seven tabs` |
| metric tiles | `MetricTile` | `metrics[]` label/value/unit/scope/origin | `AVAILABLE` / `NOT_PUBLISHED` / `NOT_APPLICABLE` | 8 tiles; benchmark "not published"; funding "not applicable" |
| warnings | `SummaryTab` | `warnings[]` state + copy | `ACTIVE` / `NOT_APPLICABLE` | unit `P13-T04` |
| equity + underwater | `EquityChart` | `researchEvidenceSeriesGetV1` `EQUITY_OOS` | ready / refused / mismatch | two canvases from one response |
| rolling 20 | `RollingChart` | `ROLLING_RETURNS_20` | ready | `…reads only the series the open tab draws` |
| monthly heat | `MonthlyHeat` | `MONTHLY_RETURNS` | ready | same |
| return distribution | `DistributionChart` | `RETURN_DISTRIBUTION` | `NOT_APPLICABLE` here | panel says "not applicable", never requested |
| sampling disclosure | `SeriesPanel` | `source_sample.*` | — | `…renders every block` |
| retained passport | `PassportPanel` | `researchCurrentSourceEvidenceGetV1` | ready / refused | `…says what it was never given` |
| per-fold verdict table | `SourceGap` | — | source gap | `[data-gap='per-fold-verdict']` |
| behaviour tiles | `SourceGap` | — | source gap | `[data-gap='behavior-tiles']` |
| S1–S4 summary panels + `open deep dive →` | `StagePreviewTab` | `stages[]` timeline | gap + refused affordance | `…keeps one cursor`, carried-cursor line |
| claim tables | `ClaimTab` | `claim.*` | — | `…says what it was never given` |
| cert chain | `SourceGap` | — | source gap | `[data-gap='cert-chain']` |
| artifact manifest | `SourceGap` | — | source gap | `[data-gap='artifact-manifest']` |
| declared absences | `ClaimTab` | `source_absences{}` | per-entry | three entries, each with its reason |
| window disclosure | `SummaryTab` | — (verbatim spec §9) | — | unit `P13-T04` |
| Atlas preview | `AtlasTab` | — | gap + link to Screen 12 | `…operable by keyboard` |
| `RUNNING` guard | `EvidenceFlow` | `readiness === "NOT_READY"` | link to Screen 03 | unit `P13-T07` |

## Browser receipt

```
cd apps/portal/frontend
npm run build                                              # BUILD_EXIT=0
npx playwright test --config=playwright.research-probe.config.ts -g "S04"
```

`PRODUCT_ROUTE_BROWSER_RECEIPT`, against `vite preview` on
`http://127.0.0.1:4317` serving the `d6525a31` build, both viewports, Portal
shell and session from the repository's own stubs, the four evidence
operations from the fixtures above.

| Lane | Command | Result |
|---|---|---|
| Unit · Screen 04 | `npx vitest run src/research/evidenceFlow.test.tsx` | **42 passed** |
| Unit · Research | `npx vitest run src/research` | **425 passed** |
| Unit · whole frontend | `npx vitest run` | **2836 passed, 1 skipped (165 files)** |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Build | `npm run build` | exit 0 |
| Browser · S04 | `-g "S04"` | **9 passed** |
| Browser · all Research product routes | full probe config | **49 passed** |
| Console / page errors | recorded in every S04 test | **0**, except one browser-level line for the deliberately refused passport read (named and asserted in the probe) |
| Horizontal overflow | measured at 1280 and 660 | `scrollWidth − clientWidth ≤ 0` at both |

Screenshots (ephemeral, `/tmp/research-shots`): `s04-evidence-laptop.png`,
`s04-evidence-mobile.png`, read against `hifi-04-laptop.png` /
`hifi-04-mobile.png` rendered from the hi-fi HTML at the same widths.

## Three defects only the browser found

**1 · The equity chart drew nothing.** An array of axes was passed through the
shared `baseOption`, whose merge expects one axis object; ECharts received an
object with numeric keys and rendered an empty 268px box. The unit lane cannot
see this — jsdom never initialises a chart. Split into equity and its
underwater restatement, which is how the hi-fi draws them, both from one
response.

**2 · The charts were ECharts' default palette** — a blue equity line and a
highlighter-green drawdown on a paper surface. Colours now come from the chart
theme: OOS equity takes the OOS role colour and its drawdown the same family,
because `--bad` is this surface's word for a refusal and a trough is not one.
The legend, which named a series the heading already named and landed on the
first y-axis label, and the zoom slider, which offers a deep read spec 04 §7
puts on Screen 08, are both off.

**3 · Two repo gates caught what review would not.** `tokens.test.ts` found a
hand-mixed `rgba()` scrim and drawer shadow; `disabledReason.test.ts` found a
disabled fold step with no stated reason. Both fixed.

## Typed states exercised

`AVAILABLE`, `NOT_PUBLISHED`, `NOT_APPLICABLE`, `PENDING_SOURCE_CALLBACK`,
`LEGACY_METADATA_ONLY` · claim `ISSUED` / `FORECAST` / `NOT_ISSUED` /
`NOT_PUBLISHED` · certificate `ISSUED` / `NOT_ISSUED` / `NOT_PUBLISHED` ·
readiness `COMPLETE` / `NOT_READY` · series ready / refused /
revision-mismatch / absent · passport ready / refused · 400 · 401 · 403 · 404 ·
409 · 503 · `304` · deep link · hard refresh · keyboard · drawer focus trap.

## Source gaps — two focused requests

**`CG-P13-01` — run identity on the Hub.**
Spec 04 §2.2 gives the run header a status pill, the alpha binding
(`alpha_name · av_`), `created_at`, mode, schedule, the route contract, the
config digest and the seed. `EvidenceHub.core` publishes the engine version,
adapter, input scope, five digests and the dataset triple — none of the above.
*Source locator:* `research-evidence.openapi.json` → `EvidenceHub.core`.
*Expected:* those identity fields, or a named sub-object carrying them.
*Actual:* absent, so the header is thinner than the spec and the screen shows
what it has rather than reading Screen 01's list operation for one run, which
would be a second source for the same facts.

**`CG-P13-02` — the fold plan.**
The cursor is the spine of Screens 04–08 and its first key is `fold`. No
operation on this screen publishes how many folds a run has, so the step
buttons cannot be bounded: the bar now prints `fold N of not published` rather
than letting a reader walk to fold 40 of a five-fold run.
*Source locator:* `EvidenceHub` (no fold field) vs
`research-current-source.openapi.json` → `Split.fold_plan.folds[]`, which has
exactly this and belongs to Screen 05.
*Expected:* a fold count (and ideally the boundaries) on the Hub, **or** an
explicit sanction for Screen 04 to read `researchCurrentSourceSplitGetV1` for
the cursor bound.
*Actual:* neither, so the cursor is honest but unbounded.

Neither is worked around: no fold count is derived, and no identity is read
from another screen's operation.

## Not claimed

Fixture receipts only — no backend was called, and `REAL_API_E2E_RECEIPT` is
not claimed. Visual baselines were **not** re-recorded and no threshold was
widened; Screen 04 is not in the immutable visual suite. The Astra
`AUDIT_REOPENED` items (A01/A02/A04/A05/A07), the RS-03 cross-screen journeys
and `PRODUCT_ACTIVE` are not mine to close. Screens 05–08 and 09/11 have no
routes, so their affordances here are shown refused rather than linked.

One observation, recorded rather than claimed: `foundation.test.tsx` (P09)
failed once in isolation during this session and then passed three times in a
row in this tree and three times at `c2115cd7`. It was not reproducible in
either tree and nothing in P13 imports it; it is logged here as a one-off, not
as a fixed or an open defect.
