# BE-P4 — ELP2-06 lifecycle + series (Claude, backend writer, 2026-10-20)

Owner assignment: Bobby, 2026-10-20, from Codex's debt list (rules §10.11). Commits `4ecef0f8`, `9fca133e`, `e6eb15c9`. Branch
`claude/be-p4-lifecycle-series` (private; see "Branch note"), base `792319bb`.
Tier **R3 focused** (rules §10.10): focused control-api + contracts specs, `tsc`; the ordinary hook is
**NOT_RUN** here and is owed at landing. No source, HK, SSH, credential, Docker runtime, network or migration was
used. Nothing below is a financial fact: every value in a fixture is `TEST_ONLY`.

| Request | Status | Commit |
| --- | --- | --- |
| FE-027 + FE-012 `current_stage`, `days_in_stage`, `entered_at_ms` on `ManagerDatasetRow` | `current_stage`: CONTRACT_DELIVERED_AT_COMMIT (derived, qualified rule). `entered_at_ms`, `days_in_stage`: typed `NOT_PUBLISHED` (`STAGE_ENTRY_TIME_NOT_PUBLISHED`), validator ready for a populated pair. PENDING_GATE (hook, FE reader, producer receipt) | `4ecef0f8` |
| FE-013 NAV / Net PnL / Return series (portfolio, fund) | CONTRACT_DELIVERED_AT_COMMIT for contract, validator, fixtures (populated / empty / unavailable / currency-mixed), pure selector, service + controller. Source: `MISSING` → every profile answers `SERIES_SOURCE_NOT_PUBLISHED`. PENDING_GATE | `9fca133e` |
| FE-033 aligned series for 2-4 subjects, typed refusal on mixed currency | CONTRACT_DELIVERED_AT_COMMIT (same read; `comparison` re-derived by the validator). The `IN` op was already delivered by Codex (`d0789674`/C7). PENDING_GATE | `9fca133e` |
| Shared wiring (contracts-test cp list, verify-generated, package script, snapshot TRACKED list) | PENDING_GATE (lead regenerates `contracts-snapshot.json`, EDS-12/N29, ledgers) | `e6eb15c9` |

## 1. FE-027 / FE-012 — lifecycle scalars

### Derivation check (what the Portal already holds)
| Candidate source | Verdict |
| --- | --- |
| `ManagerMember.stage` (active tuples at the snapshot cutoff, `SOURCE_VERIFIED` document) | **Usable for `current_stage`** under an explicit rule below. It is a published fact (`stage_presence`), restated as a scalar. |
| `ManagerMember.valid_from_ms` | **Not usable for entry time.** It is the start of an assignment/owner/binding *revision* interval (the member carries three revisions); an owner change that leaves the stage untouched moves it. It bounds nothing about the stage transition. |
| Approvals / gates R1, R2, Paper-exit, Sandbox, Canary, Live in `governance` | **Not usable.** They are *recorded decisions*, not effective stage moves (approved ≠ deployed). Codex's own `recorded-portal-workflow.v1` already publishes `effective_stage` / `days_in_stage` as `SOURCE_EFFECTIVE_STAGE_TRANSITION_NOT_PUBLISHED`. R1/R2 alphas have no deployment and therefore no Manager row. |
| PM stage timeline | `IMPLEMENTING`, tests `NOT_RUN` (source truth §58.154); Codex: "do not satisfy C4's stage/window requests with this untested planned source". |

### Rule (`apps/control-api/src/execution-v2/manager-lifecycle.ts`)
`current_stage` = the one financial stage in which the row (alpha, version, portfolio) has an **authorized active member** in
the **selected environment** at the cutoff. Exactly one distinct stage → published. Canary + Live → `null` with
`MULTIPLE_ACTIVE_STAGES` (stage membership is not a rank; `query_policy.stage_order` is unchanged). It is read **before** the
`stage_filter`, so filtering to Canary never crowns Canary the only stage. It covers deployed stages of one environment only:
no R1/R2, no cross-environment lifecycle. `stage_lifecycle` (response constant) says so in every body.
`entered_at_ms` / `days_in_stage`: `null` + `STAGE_ENTRY_TIME_NOT_PUBLISHED`. A non-null pair is already valid when
`days_in_stage == floor((as_of_ms - entered_at_ms) / 86_400_000)`, `entered_at_ms <= as_of_ms` and a single stage exists.

### Contract names
- Row (additive, required): `current_stage` (stage | null), `entered_at_ms` (int | null), `days_in_stage` (int | null),
  `stage_lifecycle_reasons {current_stage, entered_at_ms, days_in_stage}` (reason iff value null; closed enums).
- Response: `stage_lifecycle {current_stage_rule, covers, entry_time}` (constants); `query_options.sort_fields` and
  `group_fields` gain `current_stage` (sortable, filterable `EQ/IN/IS_NULL`, groupable; groups are disjoint, unlike `stage_presence`);
  `query_options.unavailable_fields` becomes `[days_in_stage, entered_at_ms]` (was `[current_stage, days_in_stage]`).
- `days_in_stage` / `entered_at_ms` are deliberately **not** in `sort_fields`: a sort on an always-null column is not an ordering.
  When a source lands, add an INTEGER scalar type and the two names to the sort enum (additive).
- Fixtures: `execution-manager-dataset.{synthetic,rows.synthetic,all-window.synthetic}.valid.json` regenerated;
  new `execution-manager-dataset.lifecycle.live.synthetic.valid.json` (one Live row published, one Canary+Live row withheld).
- Zod + JSON Schema: same rules for null/reason, single-presence, stage-in-presence; the day arithmetic is Zod-only (stated in tests).

### Behavioural change to review (Codex)
`elp206-manager-model.spec.ts` asserted `unavailable_fields == [current_stage, days_in_stage]` under the title "without inventing a
singular current stage". The *spirit* is kept (no winner is chosen among Canary/Live) but `current_stage` is now published for
single-stage rows. I changed that one assertion and added the Canary+Live expectation. Please confirm this reading of
`CURRENT_STAGE_GRAIN_NOT_PUBLISHED`; if you want the field withheld until a grain decision, flip `deriveManagerRowLifecycle` to
always return `MULTIPLE_ACTIVE_STAGES`/a new reason — the rest of the contract needs no change.

## 2. FE-013 / FE-033 — Manager series

### Read
`GET /api/v1/execution/manager/series?environment=&metric=NAV|NET_PNL|RETURN&subjects=[{subject_type:"FUND"}|{subject_type:"PORTFOLIO",subject_id}]&window=7D|30D|90D|ALL|{from_ms,to_ms}[&economic_partition={…}]`
(`operationId executionManagerSeriesGetV1`, `Cache-Control: private, no-store`, `as_of_ms` refused as `CURRENT_ONLY`).
1-4 distinct subjects, window mandatory. Response `portal.execution.manager-series.v1`:

- `series[]` one entry per subject, in request order: `state AVAILABLE | EMPTY | UNAVAILABLE`, `reason_code`, `partition`, `unit
  (MONEY|RATIO)`, `currency`, `basis`, `methodology_ref`, `window`, `points[{ts_ms, value: exact decimal string}]`, `gaps[]`,
  `quality`, `source_confidence`, `provenance_refs`, `calculation_revision`, `policy_revision`.
- `comparison {state SINGLE_SUBJECT|ALIGNED|INCOMPARABLE|UNAVAILABLE, reason_code, transform: NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM, common, axis_ms}`.
  Re-derived by the validator (`deriveSeriesComparison`); first mismatch wins: `CURRENCY_MIXED`, `ECONOMIC_PARTITION_MIXED`,
  `BASIS_MIXED`, `UNIT_MIXED`, `METHODOLOGY_MIXED`, `WINDOW_MISMATCH`. Mixed currencies deliver each series untouched and refuse
  to align: no rebase, no sum, no shared axis. `axis_ms` (ALIGNED only) is the union of timestamps; nothing is filled at a missing point.
- `series_source {PUBLISHED | NOT_PUBLISHED, FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED}` — the profile-level flag.
- Unavailable reasons (closed): `SERIES_SOURCE_NOT_PUBLISHED`, `EXACT_METRIC_WINDOW_NOT_PUBLISHED`,
  `ALL_HISTORY_WINDOW_NOT_PUBLISHED`, `ECONOMIC_PARTITION_REQUIRED`, `SERIES_SCOPE_NOT_AUTHORIZED`, `SOURCE_NOT_QUALIFIED`,
  `AMBIGUOUS_SERIES_PUBLICATION`, `SUBJECT_HAS_NO_ACTIVE_MEMBERS`. `EMPTY` carries `NO_POINTS_PUBLISHED_IN_WINDOW`.

### Runtime behaviour today
The financial normalized source is `MISSING` (Codex, source truth §8: "unique NAV, same-basis valuation partition, flow/cost grids…").
`ManagerModelDocument.precomputed_series` is absent on every profile, so every request returns `200` with all subjects
`UNAVAILABLE / SERIES_SOURCE_NOT_PUBLISHED`, `series_source NOT_PUBLISHED`, `comparison UNAVAILABLE`. Nothing is computed from
`equity`, `cross-equity`, `equity-projection` or facts: `cross-equity` is only first/last equity per (portfolio, currency) and the
equity relation is a retained observation, not a methodology-bearing NAV. Authority precedes search: fund needs `business.read_all`
over the whole population, a portfolio needs `portfolio.read` (restricted viewer falls to `SERIES_SCOPE_NOT_AUTHORIZED`), the
full accounting population of the portfolio is checked **before** any publication is looked at, and an unknown portfolio is
indistinguishable from an unauthorized one. Each subject is fenced by `ExecutionReadScopes.deliver` (nested, ≤4), the head is
re-read after the document, and a `TEST_ONLY` document is never served (503), as for every Manager read.

### The stored form a producer must publish (`ManagerSeriesPublication`, `manager-series-publication.contract.ts`)
Optional `precomputed_series[]` (≤256) in `ManagerModelDocument`, validated at document admission: bound to the document's
workspace/environment/profile/catalogue/revision/source-set/cutoff, domain = environment (live ⇒ `ACTUAL`), stages ⊆ environment,
no duplicate binding, points strictly ascending inside `[window_start, window_end]`, window ≤ cutoff, MONEY currency == partition
currency, basis == partition basis, `methodology_ref` mandatory, RETURN unitless, values only from `SOURCE_VERIFIED`. Selection (pure,
`manager-series.ts`) requires: subject, metric, exact authorized-population digest (`managerScorePopulationDigest`), stage set,
single economic partition (or the request's), **exact** window (a 30D series is never re-cut for 7D), same revision and cutoff;
two matches → `AMBIGUOUS_SERIES_PUBLICATION` (also rejected at admission).

### Files
Contracts: `schemas/execution-manager-series.v1.schema.json`, `openapi/execution-manager-series.openapi.json`,
`generated/execution-manager-series.d.ts` (generated, not hand-edited), `tooling/generate-execution-manager-series.mjs`,
`tooling/execution-manager-series-fixtures.mjs`, fixtures `execution-manager-series.{populated,empty,unavailable,currency-mixed}.synthetic.valid.json`,
`execution-manager-series-publication.synthetic.valid.json`, `execution-manager-series-query.synthetic.valid.json`.
Control-api: `execution-v2/manager-series{.contract,-publication.contract,.service,.controller}.ts`, `execution-v2/manager-series.ts`;
shared (minimal): `manager-model.contract.ts` (one import, one optional field, one validator call), `app.module.ts` (controller + service).

## 3. Tests (what ran, what did not)
| Spec | Result |
| --- | --- |
| `apps/control-api/test/be-p4-manager-lifecycle.spec.ts` (new) | 19 PASS |
| `apps/control-api/test/be-p4-manager-series.spec.ts` (new) | 63 PASS |
| `elp206-manager-model` / `-service` / `-store` / `elp210-manager-consumer` | 78 + 19 PASS; store 28 and 18 of consumer SKIPPED (PostgreSQL) |
| `packages/contracts/test/execution-manager-lifecycle.spec.ts` (new) | 14 PASS |
| `packages/contracts/test/execution-manager-series.spec.ts` (new) | 47 PASS |
| `packages/contracts/test/execution-manager-models.spec.ts` | 37 PASS |
| `tsc -p apps/control-api/tsconfig.build.json --noEmit` | PASS (exit 0) |
| `scripts/contracts-test.sh` (Docker, via wrapper) | PASS: 80 files / 1217 tests, all generate --check and d.ts compares OK (Docker, flock, wrapper) at `e6eb15c9` |
| PostgreSQL-backed specs; ordinary R3 hook; browser | **NOT_RUN** (no runtime / DB allowed; hook owed at landing) |

## 4. Exact FE reader change per field (FE not edited)
`apps/portal/frontend/src/execution/v2/readers/managerDataset.ts` is a closed-allowlist reader; both fixtures and the live shape
change, so reader + fixtures + conformance test must land with this server change.
1. `MANAGER_SORT_FIELDS` and `MANAGER_GROUP_FIELDS`: add `"current_stage"` (the `sameSet(groupFields, intersect(GROUP, sort))` rule holds).
2. `ROW_KEYS` (l.432): add `current_stage`, `entered_at_ms`, `days_in_stage`, `stage_lifecycle_reasons`; `ManagerRow` gains
   `currentStage: ManagerStage | null`, `enteredAtMs: number | null`, `daysInStage: number | null`, `stageLifecycleReasons`.
   Read `current_stage` with `oneOf(allowedStages)` nullable; both ints as safe non-negative integers or null; reasons object
   `hasOnly` its three keys with the closed enums. Mirror the null↔reason rule and "published stage == the single `stage_presence`".
3. `readQueryOptions` (l.374): `unavailable_fields` expected is now `[["days_in_stage","STAGE_ENTRY_TIME_NOT_PUBLISHED"],["entered_at_ms","STAGE_ENTRY_TIME_NOT_PUBLISHED"]]`;
   `ManagerQueryOptions.unavailableFields[].field` becomes `"days_in_stage" | "entered_at_ms"`.
4. Response root: allow the new constant `stage_lifecycle` (`current_stage_rule`, `covers`, `entry_time`); surface it as a caption
   ("Stage = the only deployed stage in this environment; Canary+Live shows 'In two stages'").
5. Consumers (no new data needed): Fleet table sort header and Board lanes use `current_stage`; Alpha 360 header reads the row.
   `days in stage` stays `Not published (FE-027)` with reason `STAGE_ENTRY_TIME_NOT_PUBLISHED`; do NOT derive a day count from
   `valid_from_ms` or a decision date. Cockpit spine R1/R2 stays `Not published` (no member exists before Paper).
6. Fixtures: replace the three dataset fixtures; add the `lifecycle.live` fixture to `managerDataset.conformance.test.ts`.

Series (new reader `readers/managerSeries.ts`, `ExecutionApi.getManagerSeries(query)`, http adapter `GET /manager/series` with JSON-encoded
`subjects`/`window`/`economic_partition`):
- Parse closed keys; `series_source`; per-entry state/reason; decimals via the existing exact-decimal helper (no `Number`); `comparison`
  re-derived locally with the same precedence (do not trust `ALIGNED` without checking one currency/partition/basis/unit/methodology/window).
- Compare screen: replace `PF_FE.compareSeries` / `CompareOverlay` "Not published (FE-033)" with: `ALIGNED` → draw on `axis_ms` (leave gaps, no
  fill); `INCOMPARABLE` → list each subject apart with `comparison.reason_code` (`CURRENCY_MIXED` copy: "different currencies are never converted or summed");
  `UNAVAILABLE`/`series_source NOT_PUBLISHED` → keep the `Not published (FE-013)` cell until a producer publishes.
- Overview / Portfolio 360 NAV (FE-013): request `metric=NAV`, one subject; `AVAILABLE` → line + exact last value with `methodology_ref` and window in the caption;
  `EMPTY` → "No points in this window" (not a zero line); `UNAVAILABLE` → typed cell with the reason. Drawdown stays derived by the FE from exact points (not published).
- Board row: `Not published (FE-013)` cells stay valid and honest until `series_source.state == PUBLISHED`.

## 5. Remaining and producer-receipt request to Codex
1. **Producer (Codex, financial normalized pipeline)**: write `precomputed_series[]` into `ManagerModelDocument` for (portfolio, fund) × (NAV, NET_PNL, RETURN)
   × exact windows (7D/30D/90D and custom) × partition. Needs the missing unique NAV / same-basis valuation / methodology. Until then FE-013/033 is honestly empty.
2. **Producer receipt requested**: ACCEPTED / CHANGES_REQUESTED on (a) the `current_stage` rule above (see "Behavioural change"), (b) `manager-series` read and
   publication shape, (c) whether `ALPHA`/`DEPLOYMENT` subjects are wanted (not built: the stage-drift / equity-projection reads cover deployment equity today),
   (d) whether the retained `portfolio_equity_snapshots` relation may be offered as a *separately labelled* `RETAINED_OBSERVATIONS_NOT_FINANCIAL_CERTIFICATION`
   series (like stage-drift v2) — it needs a PostgreSQL-backed test I could not run here, and it carries no `methodology_ref`, so I did not ship it as NAV.
3. `entered_at_ms` / `days_in_stage`: need the PM stage timeline (§58.154) or an effective-stage event journal; then add the INTEGER scalar type + sort enum entries.
4. Not delivered: FE-027 `gate_state` scalar and the ordered stage-transition list (needs the same timeline + criteria x/7, owned by C5/FE-028).
5. Gates owed by the lead/Codex: `contracts-snapshot.json`, EDS-12/N29 pins, `refresh-release-integrity-ledgers`, r2 route ledger/`capability-inventory` (new route
   `GET /api/v1/execution/manager/series`), ordinary R3 hook, Docker `control-api-test.sh` for the PG-skipped specs.

## Branch note
All four BE writers were told to use `claude/be-gaps-2`; that ref is shared by several worktrees, and another writer's commit moved it under this worktree's
index (a plain `git commit` would have reverted it). This package therefore committed on the private branch `claude/be-p4-lifecycle-series`
(`git symbolic-ref` + `reset --mixed 792319bb`); nothing was force-written to `claude/be-gaps-2`. The lead should cherry-pick the three commits above.
