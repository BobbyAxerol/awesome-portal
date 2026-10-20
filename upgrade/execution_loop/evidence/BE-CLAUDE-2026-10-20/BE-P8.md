# BE-P8 — Manager series: FE-013 invariants, MD-4 / FE-065 review, ELP2-REQ-06-002 qualification checklist (Claude, 2026-10-20)

Owner Claude (backend writer, Bobby's assignment of ALL remaining backend, 2026-10-20). Codex reviews. Branch: private worktree branch reset to
`5152cee3` (the named `claude/fe-parity` ref is held by `/home/bobby/portal-research-fe`). Tier **R3, focused gates only**; ordinary hook
**NOT_RUN** (`git -c core.hooksPath=/dev/null`). No migration, no source/HK/SSH/credential/runtime access, no FE edit, no edit to
`UNIFIED_IMPLEMENTATION_PLAN.md` / `FRONTEND_BACKEND_SYNC.md`; `contracts-snapshot.json` and the EDS-12/N29 ledgers are not committed (the lead
regenerates). Nothing below is a financial fact: every fixture value is `TEST_ONLY`.

## Status

| ID | Status | Commit |
| --- | --- | --- |
| FE-013 metric <-> unit tie + RETURN `ratio_scale` (receipt CHANGES_REQUESTED 1 and 2) | CONTRACT_DELIVERED_AT_COMMIT; PENDING_GATE; FRONTEND_INTEGRATION_PENDING (reader change below); **Codex ACCEPTED / CHANGES_REQUESTED requested** | `9e219e44` |
| MD-4 unpublished preset has no window | already delivered in BE-P1; review below: **recommend ACCEPT**, nothing to change | (BE-P1) |
| Lifecycle semantics (`current_stage` rule, BE-P4 s.1) | review below: **recommend ACCEPT as delivered**, nothing to change | (BE-P4 `4ecef0f8`) |
| FE-065 `currency` grammar | review below: **CHANGE = request to the PM source owner first**; Portal narrows nothing today | none |
| ELP2-REQ-06-002 qualified `precomputed_series` publication | checklist below; **no writer built (no source)** | this file |

## 1. FE-013 — what changed

**Rule.** NAV and NET_PNL are `MONEY` with `currency == partition.currency`. RETURN is `RATIO` with `currency = null` and a `ratio_scale`
that the SOURCE states: `FRACTION` (1.0 = 100%, 0.0123 is 1.23%) or `PERCENT` (100 = 100%, 1.23 is 1.23%). No other combination. The scale is
never inferred from magnitudes. A producer with no authoritative scale cannot publish RETURN values: the stored form admits `ratio_scale: null`
only with zero points, and the read answers `UNAVAILABLE / RATIO_SCALE_NOT_PUBLISHED` (a typed absence, RETURN only; `points: []`, `unit: null`).

| Where | Enforcement | Code |
| --- | --- | --- |
| Response `managerSeriesResponse` | every non-UNAVAILABLE entry's `unit` must equal the unit of the response `metric` | `MANAGER_SERIES_METRIC_UNIT_MISMATCH` |
| Entry `managerSeriesEntry` | MONEY has `ratio_scale null`; RATIO has a scale (EMPTY included); UNAVAILABLE has `null` | `MANAGER_SERIES_RATIO_SCALE_INVALID`, `MANAGER_SERIES_UNAVAILABLE_INVALID` |
| Response | `RATIO_SCALE_NOT_PUBLISHED` only when `metric == RETURN` | `MANAGER_SERIES_REASON_METRIC_INVALID` |
| Comparison | `common.ratio_scale`; `RATIO_SCALE_MIXED` (after `UNIT_MIXED`, before `METHODOLOGY_MIXED`) — reachable, unlike `UNIT_MIXED` | `MANAGER_SERIES_COMPARISON_NOT_DERIVED` when lied about |
| Stored publication | `seriesBodyIssues` (shared with the entry): metric -> unit, MONEY has no scale, RATIO with points has a scale | `MANAGER_SERIES_METRIC_UNIT_MISMATCH`, `MANAGER_SERIES_RATIO_SCALE_INVALID` |
| Selector `manager-series.ts` | exact publication with RATIO + null scale -> `RATIO_SCALE_NOT_PUBLISHED`, never served | typed absence |
| Published JSON Schema (response, `ManagerSeriesEntry`, `ManagerSeriesPublication`) | `if metric RETURN then items.unit in {RATIO,null} else {MONEY,null}` (+ reason clause); `if unit MONEY then currency string, ratio_scale null`; `if unit RATIO then currency null, ratio_scale non-null`; UNAVAILABLE has null scale; stored: `if binding.metric RETURN then RATIO/null currency else MONEY/currency/null scale`, `RATIO + null scale -> points maxItems 0` | schema refusal |

What JSON Schema cannot state stays Zod-only and is labelled `PRODUCER_ONLY` in the fixture (the scales-mixed-called-aligned case: the comparison is re-derived).

**Fixtures** (generator-written, all in `packages/contracts/fixtures/`): `execution-manager-series.return`, `.return-scale-mixed`,
`.return-scale-not-published`, `execution-manager-series-publication.return` (valid) and `execution-manager-series.metric-unit.synthetic.negative.json`
(9 response cases + 4 stored cases, with `bases`, `scales`, `refused_by`, `code`). The generator proves every negative case refused with its code by the
real Zod contract before writing a byte; the existing populated/empty/unavailable/currency-mixed/publication fixtures were regenerated (`ratio_scale: null`).
Negative proof (NAV/RATIO, NET_PNL/RATIO, RETURN/MONEY, RETURN without scale, MONEY with scale, RETURN with currency, UNAVAILABLE with scale, scale reason on a
money metric, scales mixed called ALIGNED; stored: NAV/RATIO, RETURN/MONEY, RETURN points without scale, MONEY with scale).

**Behaviour change to review (Codex).** (a) `ratio_scale` is a new required key on every series entry and `common.ratio_scale` on the comparison:
a closed-allowlist reader refuses the new body until it is updated (below). I did not bump `schema_version`: no profile publishes a series today
(`SERIES_SOURCE_NOT_PUBLISHED` everywhere), so no live consumer sees a populated body. If you prefer `portal.execution.manager-series.v2`, say so.
(b) `COMPARISON_MISMATCH_REASONS` grows 6 -> 7 (`RATIO_SCALE_MIXED`); `SERIES_UNAVAILABLE_REASONS` grows by `RATIO_SCALE_NOT_PUBLISHED`.
(c) The vocabulary is two values on purpose; basis points or others are an additive enum extension the day an authority names them.

### FE reader change (FE NOT edited; list for the FE writer)

`apps/portal/frontend/src/execution/v2/readers/managerSeries.ts` (closed allowlist):
1. `ENTRY_KEYS` (l.219): add `ratio_scale`. New `MANAGER_SERIES_RATIO_SCALES = ["FRACTION","PERCENT"]`; `ManagerSeriesDescribed` gains `ratioScale: "FRACTION" | "PERCENT" | null`.
2. UNAVAILABLE branch (l.296-299): require `ratio_scale === null` too. Available/empty branch (l.312-320): `unit === "RATIO"` requires a non-null scale from the closed set; `unit === "MONEY"` requires `null` (rule MS-S6 extended: "the unit follows the metric; a ratio states its scale").
3. `SERIES_UNAVAILABLE_REASONS` (l.71): add `RATIO_SCALE_NOT_PUBLISHED`; accept it only when the response `metric === "RETURN"`. Do NOT add it to `SOURCE_NOT_PUBLISHED_REASONS` (l.78): it needs a published source.
4. `COMPARISON_MISMATCH_REASONS` (l.84): insert `RATIO_SCALE_MIXED` after `UNIT_MIXED`; the local re-derivation (l.201-205) adds `["RATIO_SCALE_MIXED", e => e.ratioScale !== first.ratioScale]` in the same position; `common` keys (l.338) gain `ratio_scale` (nullable closed enum) and the common equality (l.353) compares it.
5. `screens/series/seriesModel.ts` (l.53-54, 95, 119): replace "a ratio with no `%` invented" by the stated scale: `FRACTION` -> print the exact decimal shifted two places with `%` (string shift, no `Number`: `0.0123` -> `1.23%`); `PERCENT` -> print as is with `%`. `chartUnit` for RATIO stays a ratio axis; the axis label, tooltip and last-value readout take the scale from `entry.ratioScale`. For `RATIO_SCALE_NOT_PUBLISHED` print the typed cell `Not published (FE-013): the source states no ratio scale`. Compare: `RATIO_SCALE_MIXED` sentence "These returns are stated on different scales and are not drawn together".
6. Tests/fixtures: read the 3 new response fixtures and the `metric-unit` negative fixture (`cases[].ops` applied to `bases[case.base]`); the corpus counts in `managerSeries.conformance.test.ts` change (5 new valid/negative groups; `MS-S6` grows; `UNIT_MIXED`-style "unreachable" note does NOT apply to `RATIO_SCALE_MIXED`). Existing 4 fixtures were regenerated with `ratio_scale: null`.

## 2. MD-4 — unpublished preset carries no window: review

**What it is.** `query_options.window.presets[i].resolved` is `null` unless `data_state == METRIC_SPECIFIC` (`manager-query-p1.contract.ts` ~l.50-63,
Zod `MANAGER_WINDOW_OPTION_INVALID`; JSON Schema finite conditional; producer helper emits `resolved: null`). `selected_window.resolved` (what the server
selected for a REQUESTED preset) is unchanged, and the series read still tells the truth: `EXACT_METRIC_WINDOW_NOT_PUBLISHED`.

**Recommendation: ACCEPT, no change.**
- It states what the reader already enforced (MD-S9) and what the project rule says (a window nobody published is not offered as bounds).
- It was a real producer defect (a would-be window was emitted whenever `as_of` was past the epoch; the test fixtures' tiny `as_of` hid it); the actual-read test with `as_of = 1.8e12` now pins it.
- Cost: consumers lose the would-be range in `presets[]`; no screen consumes `query_options.window.presets` (consumer receipt).
- No `schema_version` bump: the change only removes a value the contract never promised (`null` was already legal for ALL). If Codex wants a bump, it is a pure
  constant change in the generator plus fixtures; I recommend against it (no consumer depends on the lost value, a bump forces a second reader pass).
- Closure condition: Codex ACCEPTED in the producer receipt, ordinary hook on the merged tree.
- Residual note (not a defect): the series read resolves a requested preset to `selected_window.resolved` even when the series for it is unpublished; that is the REQUESTED window with a typed reason, not a published bound.

## 3. Lifecycle semantics (`current_stage`, BE-P4 s.1) and FE-065

**Lifecycle (the handoff row says "unresolved preset and lifecycle semantics").** `current_stage` is the single financial stage in which the row has an active
authorized member in the selected environment at the cutoff; two stages (Canary + Live) -> `null` with `MULTIPLE_ACTIVE_STAGES`; `entered_at_ms`/`days_in_stage`
are `null` with `STAGE_ENTRY_TIME_NOT_PUBLISHED` (validator ready for a populated, arithmetic-consistent pair).
**Recommendation: ACCEPT as delivered.** It restates a published fact (`stage_presence`), invents no winner, no timestamp and no day count, states its limits in
every body (`stage_lifecycle`), and is read before the `stage_filter`. The alternative (withhold `current_stage` until a grain decision) is a one-line flip in
`deriveManagerRowLifecycle` and costs the Fleet table its only stage sort; I see no safety gain. Still open and NOT mine: the effective stage-transition source (PM stage timeline, source truth s.58.154) for `entered_at_ms`.

**FE-065 (as defined in `FRONTEND_BACKEND_SYNC.md`: finite grammar for `currency`, no bidi/zero-width on PM text).** Today Manager `currency` / `partition.currency` are
open `text` (1..256) inherited from the PM account text. **Recommendation: CHANGE, but as a request to the PM source owner, not a Portal narrowing.**
Reasons: (1) the Portal admits a document whole, so a Portal-side grammar turns one unexpected source currency into a 503 for the whole dataset, or silently drops a
partition, which is worse than showing it; (2) the correct grammar (ISO 4217 codes, crypto tickers such as `USDT`, perpetual suffixes) is a PM fact I must not invent;
(3) the FE reader already refuses bidi/zero-width and `currency` is rendered escaped (RK-9). Implemented: nothing. Ask for PM: the finite grammar or vocabulary and its version, a statement whether
`currency` can carry anything other than a code. Once stated, the Portal mirrors it at document admission (`manager-model.contract.ts` partition/series `currency`) as one shared
`managerCurrency` schema + JSON Schema `pattern` + negative fixtures; until then the display-side refusal in the FE stays the only guard. MD-5 (canonical zero) is a separate, already-closed decision (BE-P6).

## 4. ELP2-REQ-06-002 — what a qualified `precomputed_series` publication must carry

No writer exists and none is built here: every row marked MISSING needs a source owner input I do not have. The contract is the only way in; a series is
served iff exactly one stored publication satisfies all hooks below (`manager-series-publication.contract.ts` = `PUB`, `manager-series.ts` = `SEL`,
`manager-series.contract.ts` = `RESP`). Authority precedes search: `scopeAllowsField(metric, currency, provenance_ref)` + `scopeAllowsFullAccountingPopulation` are checked
BEFORE any publication is read (restricted population -> `SERIES_SCOPE_NOT_AUTHORIZED`, same answer for an unknown portfolio); a `TEST_ONLY` or non-FRESH/COMPLETE document -> `SOURCE_NOT_QUALIFIED`.

| # | Must carry | Hook that enforces it today | Gap | Missing source-owner input |
| --- | --- | --- | --- | --- |
| 1 | **Population**: subject (`portfolio` / `manager_book`) + `tuple_population_digest` = `managerScorePopulationDigest(active authorized members)`; `stage_filter` == the environment's stages | SEL candidate filter (digest and stage-set equality, else `SERIES_SOURCE_NOT_PUBLISHED`); PUB `MANAGER_SERIES_STAGE_ENVIRONMENT_MISMATCH`; `MANAGER_SERIES_DUPLICATE_BINDING`; SEL `AMBIGUOUS_SERIES_PUBLICATION` | admission only checks the digest's format; a digest of no real population never selects (safe, silent) | Core/PM: the population definition the producer computed over (tuple set, ownership scope) and agreement that it is `managerScorePopulationDigest` |
| 2 | **Window**: exact `window_start_ms`/`window_end_ms` <= source cutoff; points ascending inside it; gaps stated, ordered, inside | PUB `MANAGER_SERIES_WINDOW_INVALID`, `POINT_OUTSIDE_WINDOW`, `POINTS_NOT_ASCENDING`, `GAP_INVALID`, `WINDOW_AFTER_CUTOFF`; SEL exact-window equality (`EXACT_METRIC_WINDOW_NOT_PUBLISHED`; a 30D series is never re-cut); RESP `MANAGER_SERIES_WINDOW_NOT_SELECTED`, `WINDOW_AFTER_CUTOFF`; ALL -> `ALL_HISTORY_WINDOW_NOT_PUBLISHED` | none in the contract | Edge/PM: which windows are computed (7D/30D/90D/custom), day-boundary and inclusive/exclusive convention, an inception witness before ALL can exist |
| 3 | **Basis**: `series.basis == partition.basis` | PUB `MANAGER_SERIES_BASIS_MISMATCH`; comparison `BASIS_MIXED` | the basis vocabulary is free text | Edge/PM: the valuation-basis vocabulary and the same-basis valuation partition (source truth s.8) |
| 4 | **Currency**: MONEY in exactly the partition currency, domain == environment (live -> ACTUAL), RETURN none | PUB/RESP `MANAGER_SERIES_UNIT_CURRENCY_INVALID`, `METRIC_UNIT_MISMATCH` (FE-013), `MANAGER_SERIES_DOMAIN_ENVIRONMENT_MISMATCH`; comparison `CURRENCY_MIXED` | currency text is open (FE-065, section 3) | PM: currency grammar/vocabulary |
| 5 | **Quality**: `quality {completeness, freshness, reasons}`, `source_confidence`; values only from `SOURCE_VERIFIED` | PUB `MANAGER_SERIES_SOURCE_NOT_QUALIFIED` (points need SOURCE_VERIFIED), `MANAGER_SERIES_QUALITY_UNRESOLVED`; SEL document must be SOURCE_VERIFIED + FRESH + COMPLETE | a series may be served `PARTIAL`/`STALE`/`PROVISIONAL`, honestly labelled; nothing refuses it | Edge/PM: criteria for COMPLETE (no unstated gap) and whether PARTIAL may be AVAILABLE at all (owner decision) |
| 6 | **`methodology_ref`**: mandatory, one per series | PUB required non-empty text; comparison `METHODOLOGY_MIXED` | any string passes: no registry or grammar | Core/Edge: the methodology registry, its grammar and versioning, and what a methodology must define (TWR/MWR, valuation timing, cost treatment, denominator, FX) |
| 7 | **Cashflow / economic revisions** used to compute the series | partial only: `provenance.source_revision == document revision` (`MANAGER_SERIES_NOT_BOUND_TO_DOCUMENT`), `calculation_revision`, `policy_revision`, `input_digest` | **no field** for the cashflow-ledger revision or the economic-fact revision | PM/Edge: the revision identifiers of the cashflow ledger (deposit/withdraw/transfer) and of the economic facts; then an additive `cashflow_revision` / `economic_revision` pair bound to the document |
| 8 | **FX** | single currency per series; `transform` constant `NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM`; `CURRENCY_MIXED`; a fund with several currency partitions answers `ECONOMIC_PARTITION_REQUIRED` | **no field and no conversion by design**: a fund total across currencies cannot exist | Core/PM: an FX rate source + policy (rate timestamp, pair, rounding) before any cross-currency series; otherwise per-partition fund series only |
| 9 | **Cost / funding** treatment of NET_PNL | none (only `methodology_ref` text) | NET_PNL's "net of what" is not machine-readable | PM/Edge: the cost classes (fees, funding, slippage, borrow) included, as a closed list the series states |
| 10 | **Denominator NAV** of RETURN | FE-013 gives unit RATIO + `ratio_scale`; nothing about the denominator | RETURN is not reproducible from the NAV series | Core/PM: the denominator definition (opening NAV / time-weighted capital) and a reference to the NAV publication it divides by |
| 11 | **Dedup of the physical account** (no double count when two portfolios share one account) | for facts: `dedupeManagerFacts` on (domain, native_profile_ref, fact_id) and ownership partition (`ownership_partition_ref`, "economic ownership, not custody"); for a series: **none** (the population digest dedupes tuples, not accounts) | a fund series could count a shared account twice | Core/PM: proof the producer counted each account once per `ownership_partition_ref`, then an additive statement the validator can bind to the population |
| 12 | **Original / restated lineage** | PUB `source_revision` == document revision, `source_set_digest`, `input_digest`; one publication per binding (`DUPLICATE_BINDING`, `AMBIGUOUS_SERIES_PUBLICATION`) | no `supersedes` / original-custody link: Score has a restatement + original-custody path, the series has none | Core: restatement policy for series (replace by a new document revision with the original retained in custody) before any restated series is served |

Not an item but required before it is real: the producer writes `precomputed_series[]` into `ManagerModelDocument` off request (never a request body), a real
API -> UI receipt (`REAL_READ_QUALIFIED`, owner Codex/Bobby) shows a populated NAV/NET_PNL/RETURN, and the restricted-population read is shown to answer
`SERIES_SCOPE_NOT_AUTHORIZED` before any aggregate.

## Tests and gates

| Gate | Result |
| --- | --- |
| control-api `be-p4-manager-series` (+15 FE-013 tests, 80 total), `elp206-manager-model`, `be-p4-manager-lifecycle` | 3 files, 182 / 182 |
| contracts host vitest `execution-manager-series` (+ metric-unit block, Zod and Ajv side by side), `execution-manager-models`, `execution-manager-lifecycle` | 3 files, 156 / 156 |
| `generate-execution-manager-series.mjs` (+ `openapi-typescript` for the d.ts) / `generate-execution-manager-models.mjs --check` | ran; every negative case proven refused before writing; both `--check` clean |
| `tsc -p apps/control-api/tsconfig.build.json --noEmit` | exit 0 |
| `scripts/contracts-test.sh` (docker wrapper, `/tmp/portal-heavy.lock`, once) | see the final report line |

NOT_RUN: PostgreSQL-backed specs, the ordinary R3 hook, the Docker control-api suite, FE tests against the regenerated fixtures (FE not edited; the reader change above is owed),
`contracts-snapshot.json` and EDS-12/N29 regeneration (lead), adding the new fixtures to `snapshot.py`'s TRACKED list (lead, with the snapshot regeneration; the BE-P6 negative-zero fixture is not tracked either).

## Producer-receipt request to Codex

1. ACCEPTED / CHANGES_REQUESTED on: the FE-013 rule text, `ratio_scale` vocabulary (FRACTION, PERCENT), no `schema_version` bump, `RATIO_SCALE_MIXED`, `RATIO_SCALE_NOT_PUBLISHED`.
2. ACCEPTED / CHANGES_REQUESTED on the MD-4, lifecycle and FE-065 recommendations (sections 2-3).
3. Route the section-4 "missing source-owner input" column to Edge/PM/Core as the ELP2-REQ-06-002 input list; no writer starts before items 1, 2, 3, 6, 7 have an owner answer.
4. Run the PostgreSQL-backed specs and the ordinary R3 hook on the merged tree; regenerate `contracts-snapshot.json` and EDS-12/N29.
