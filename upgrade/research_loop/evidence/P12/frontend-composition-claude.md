# P12 frontend composition — Screen 01 Run Library

**Status:** `FE_RUN_LIBRARY_MOUNTED` · Claude · 2026-09-22
**Build under test:** `c2115cd7` (worktree `portal-research`, branch `docs/research-loop-plan`)
**Route:** `/research/quantbt/runs` · **Viewports:** 1280×900 and 660×900
**Contract:** `@portal/contracts-research-run-library`
(`packages/contracts/generated/research-run-library.d.ts`, 302 lines,
`research-run-library.openapi.json` v1.0.0, generated at `00b5114b`). No DTO is
hand-written, no error string parsed, no reader URL authored.

## Handoff chain read (A13.1)

| Document | Revision read |
|---|---|
| [`CLAUDE-FOR-thanhvuong.md`](../../CLAUDE-FOR-thanhvuong.md) A10, A13.1–A13.4 | working tree at `c2115cd7` |
| [P11 backend packet](../P11/README.md) | working tree |
| [P11 frontend handoff](../P11/frontend-handoff-claude.md) | working tree |
| [P11 display-fact amendment](../P11/contract-amendment-display-facts.md) | working tree — consumed at `cdea95d5` |
| [P12 backend packet](./README.md) | working tree |
| [P12 phase report](./phase-report.md) | working tree |
| [P12 frontend handoff](./frontend-handoff-claude.md) | working tree |
| [spec 01](../../release-v1.1/docs/screens/01_run_library.md) | 504 lines |
| `QuantBT 01 Run Library.dc.html` | rendered in Chromium at both viewports and read against the build |
| `research-run-library.openapi.json` + generated `.d.ts` | v1.0.0 / 302 lines |

Where the hi-fi HTML and spec 01 disagree, spec 01 wins — it states its copy is
VERBATIM. That decides three details below.

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/RunLibrary.tsx` | 914 | The full Screen-01 composition |
| `src/research/runLibrary.test.tsx` | 610 | `P12-T01…T07`, 38 tests |
| `src/research/useRunLibrary.ts` | 377 | URL state, keyset paging, the bounded poll, the lazy read |
| `src/research/runLibraryClient.ts` | 222 | Two typed operations, the query builder, comparability, refusals |
| `src/research/RunLibraryRoute.tsx` | 30 | The product route |
| `e2e/_probe-research-product.spec.ts` | +355 | Eleven browser tests |
| `e2e/research-foundation/run-library.json` | 698 | Four rows covering the typed states |
| `e2e/research-foundation/run-sparkline.json` | 19 | One published series |
| `e2e/fixtures.ts` | +15 | The two published paths stubbed |
| `src/features/quantbt/QuantBTModule.tsx` | +11/−3 | Route mounted; legacy preserved |
| `src/research/researchBoundary.test.ts` | +1 | Client added to the fetch allowlist |
| `tsconfig.json` | +3 | Contract alias |

`git diff --stat cdea95d5 c2115cd7`: **12 files, +3252, −3**.

## The route swap — needs Bobby's acknowledgement

Screen 01 now occupies `/research/quantbt/runs`. The Run Library that stood
there is **not deleted**: it is reachable at `/research/quantbt/runs/legacy`,
and the swap is one line in `QuantBTModule.tsx` to reverse. It changes an
approved screen's address, so it is flagged rather than assumed.

## A reader URL the frontend had authored for itself

The first draft of `runLibraryClient.ts` read `/api/v1/research/run-library` —
a path **no contract publishes**. The contract publishes
`GET /api/v1/quantbt/runs` and `GET /api/v1/quantbt/runs/{runId}/sparkline`.
Every other Research client's base string matches its generated contract
exactly; this one did not, and nothing in the unit lane could tell, because the
unit lane stubs whatever string the client asks for. Corrected at `d62c5e9c`;
`P12-T07` now asserts the client names that path and no other.

## Mapping matrix — hi-fi element → contract → state → assertion

| Hi-fi element / copy | Component | Generated field / operation | Typed state | Browser assertion |
|---|---|---|---|---|
| Title `Run Library` | `RunLibrary` header | — (static, spec §2.2) | — | `S01 …renders every block` |
| Subtitle "Every card carries its own evidence…" | `SUBTITLE` | — (verbatim spec §2.2) | — | same |
| `new run →` | `Link` → `/runs/new` | — | — | same |
| Filter input | `filters.q` | `researchRunLibraryListV1.q` | — | `…URL across reload and back` |
| status / mode / alpha chips | filter bar | `status`, `mode`, `alpha`; chips from `filter_catalog` | — | same |
| `group by alpha` | `groupRuns()` | `binding.alpha_id`, `binding.av`, `strategy_id` | `AVAILABLE` / `LEGACY_METADATA_ONLY` | `…groups the loaded page by alpha` |
| `{N} of {M} runs` | `[data-counter]` | `page.filtered_rows` / `page.total_rows` | — | `…renders every block` |
| claims ledger strip | `[data-ledger-bar]` | `claim_ledger.{issued,not_issued,pending_source,failed}` | — | `…draws the claim ledger as a bar` |
| compare checkbox | `[data-compare-check]` | `run_id` | — | `…reachable and operable by keyboard` |
| run id | header #2 | `run_id` | — | `…renders every block` |
| status pill + pulse | `StatusPill` | `status` | `RUNNING` only | `…beats the pulse only for a running run` |
| mode chip | `Chip` | `mode.display` / `mode.availability` | `AVAILABLE` / `LEGACY_METADATA_ONLY` | `…says what each row withheld` |
| binding chip | `Chip` / `Withheld` | `binding`, `binding_availability` | bound · scratch · `LEGACY_METADATA_ONLY` | same |
| instrument | `[data-instrument]` | `instrument.display` | `AVAILABLE` | `…renders every block` |
| rc chip | **not rendered** | `rc: null` (pinned) | — | `expect([data-rc]).toHaveCount(0)` |
| cert chip | `Chip` | `certificate.grade` + `.availability` | `AVAILABLE` only | `…says what each row withheld` |
| created | `[data-created]` | `created_at_utc_ms` | — | `…renders every block` |
| `watch progress →` | `Link` → Screen 03 | `status === "RUNNING"` | — | `…offers evidence honestly` |
| `open evidence →` | `[data-open-evidence]` | — (Screen 04 unrouted) | refused with reason | same |
| evidence trail S1…S5 | `EvidenceTrail` | `stages[].state`, `.tip`, `.tooltip_source` | `SOURCE_VERBATIM` / `DERIVED_FROM_PERSISTED_STATE` / `NOT_PUBLISHED` | `…says what each row withheld` |
| sparkline | `Sparkline` | `sparkline.kind` + `researchRunLibrarySparklineV1` | `AVAILABLE` / `NOT_PUBLISHED` | `…reads a sparkline only for a visible row` |
| 3 stats | `Stats` | `stats[].label/.value/.tone/.availability` | `AVAILABLE` / `NOT_PUBLISHED` / `LEGACY_METADATA_ONLY` | `…says what each row withheld` |
| claim quote | `[data-claim]` | `claim.text` / `claim.availability` | `AVAILABLE` / `PENDING_SOURCE_CALLBACK` / `NOT_PUBLISHED` | same |
| superseded strip | `[data-superseded]` | `superseded_note` | — | `…renders every block` |
| compare bar (1 / 2-same / 2-different) | `CompareBar` | `comparison.key` | `pending` / `ready` / `refused` | `…refuses a two-card compare across contract keys` |
| rules footer | `RULES_FOOTER` | — (verbatim) | — | `…renders every block` |
| empty state | `[data-empty]` | `items.length === 0` | `empty` | unit `P12-T04` |
| 400/401/403/404/503 | `ResearchPanel` + `toLibraryRefusal` | `Problem` | `denied` / `unavailable` | unit `P12-T06` |

### Where spec 01 and the hi-fi HTML disagree

| Detail | Hi-fi HTML | Built | Why |
|---|---|---|---|
| Title / subtitle | "Run Library — the entry point" + a different subtitle | spec §2.2 wording | Spec states its copy is VERBATIM |
| Cert chip | `cert B` | `B` | Spec §2.5 row 8 |
| Filter-bar right end | `7 runs · 5 completed · 1 running · 1 failed` | claim ledger bar + caption | The contract publishes `claim_ledger`, not a status census; `counters` counts row kinds, not statuses |
| rc chip | `rc_2026_08_c · APPROVED` | omitted | `rc` is pinned `null`; the handoff forbids reserving space for it |

## Browser receipt

```
cd apps/portal/frontend
npm run build                                              # BUILD_EXIT=0
npx playwright test --config=playwright.research-probe.config.ts -g "S01"
```

Product lane, against `vite preview` on `http://127.0.0.1:4317` serving the
`c2115cd7` build, both viewports, Portal shell and session answered by the
repository's own stubs, the two library operations answered from the fixtures
above.

| Lane | Command | Result |
|---|---|---|
| Unit (`src/research`) | `npx vitest run src/research` | **383 passed** |
| Unit (whole frontend) | `npx vitest run` | **2794 passed, 1 skipped** |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Build | `npm run build` | exit 0 |
| Browser · S01 | `-g "S01"` | **11 passed** |
| Browser · all Research product routes | full probe config | **40 passed** |
| Console / page errors | recorded in every S01 test | **0 error, 0 warning** |
| Horizontal overflow | measured at 1280 and 660 | `scrollWidth − clientWidth ≤ 0` at both |

Screenshots (ephemeral, `/tmp/research-shots`): `s01-run-library-laptop.png`,
`s01-run-library-mobile.png`, read against `hifi-01-laptop.png` /
`hifi-01-mobile.png` rendered from the hi-fi HTML at the same two widths.

## Two defects only the browser could find

**1 · The poll drove itself.** `observeVisible` depended on the response
object, so every patch handed each card a new callback; each card's
`IntersectionObserver` was torn down and rebuilt, and the teardown un-marks the
card. The visible set emptied and refilled, the poll effect stopped and
restarted, and its "poll as soon as a card becomes eligible" timer fired again.
Measured: **32 requests in ~700 ms**, each one caused by the last. The unit
lane called `observeVisible` by hand, so nothing there ever re-created an
observer. Fixed by reading rows through a ref; the poll effect now depends on
the joined eligible ids rather than the response identity. Measured after:
**1 request on mount, 1 per 10 s**.

**2 · Four spec blocks were absent** and the unit lane had nothing to compare
against: `group by alpha` changed the URL and nothing else, the RUNNING pill had
no pulse, settled cards offered no way in at all, and the claim ledger was a
caption with no bar. Also caught by eye: every withheld state printed the same
words, so a legacy row and an unpublished metric read identically; and the lazy
placeholder was a blank grey box that reads as "still loading".

Both are now pinned by tests in both lanes.

## Typed states exercised

`AVAILABLE`, `NOT_PUBLISHED`, `LEGACY_METADATA_ONLY`, `PENDING_SOURCE_CALLBACK`
· `COMPLETED`, `RUNNING`, `FAILED` · `LOGICAL_RUN`, `LEGACY_RUN` ·
`RESEARCH_DURABLE`, `LEGACY_1_0_8_METADATA` · `SOURCE_VERBATIM`,
`DERIVED_FROM_PERSISTED_STATE`, `NOT_PUBLISHED` tooltip provenance ·
comparable / non-comparable / unpublished comparison key · 400 · 401 · 403 ·
404 · 503 · empty page · first and last page.

`DRAFT`, `QUEUED`, `CANCELLED` and `RECOVERY_REQUIRED` are covered in the unit
lane only (`P12-T04`); the probe fixture carries four rows and does not spend
one on each.

## Known source gaps

| Id | Gap | Effect on Screen 01 |
|---|---|---|
| `CG-P12-01` (not filed) | The contract publishes no status census; the hi-fi's `7 runs · 5 completed · 1 running · 1 failed` cannot be rendered from `counters` | The claim ledger stands in its place. Filing is not proposed: the ledger is the more honest of the two |
| — | Screen 04 (run evidence) has no route | `open evidence →` is shown refused with its reason, on every settled card |
| — | The fixtures are mine, not canonical | Same standing gap as `CG-P09-02`: no published fixture set for these two reads |

## Not claimed

Visual baselines were **not** re-recorded and no threshold was widened. The
immutable visual suite was not run in this pass and Screen 01 is not in it.
Nothing was verified against a real backend: every lane here is fixture-backed,
and the product-route lane is labelled as such. `P12-T08`+ (backend-owned) and
the phase's `full product complete` call are not mine to make.
