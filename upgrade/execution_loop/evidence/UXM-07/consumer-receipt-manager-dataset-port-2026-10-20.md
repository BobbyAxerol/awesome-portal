# UXM-07 — Consumer receipt addendum: the Manager dataset port, the Fleet consumer and the Overview measure switch, 2026-10-20

Writer: Claude (FE writer, manager dataset consumer). Addendum to [consumer-receipt-manager-2026-10-20.md](consumer-receipt-manager-2026-10-20.md) section 4 ("Fleet / Cockpit ... nothing to change") and section 8 ("Debt"). It is the **consumer's** record: not Codex's ACCEPTED, not Bobby's ACK, not a source acceptance. A fixture is never a source acceptance. `FRONTEND_BACKEND_SYNC.md` and `UNIFIED_IMPLEMENTATION_PLAN.md` are **not** edited here.

## 0. Pin and lanes

| Item | Value |
| --- | --- |
| Base | `claude/fe-parity` @ `5152cee3` (before FE-I's `ratio_scale` commits `2e2f7463`, `bdea6393`, which are not in this base) |
| Commits | port `1ed68d73`; Fleet consumer `1c86855d`; Overview measure switch `dd3e22d3`; this receipt |
| Evidence read | the published OpenAPI (`execution-manager-models.openapi.json`, `ManagerDatasetQuery`, six routes), the canonical dataset fixtures (`lifecycle.live`, `partitions`, `rows`, `all-window`, `invariants`, `query-in`). No source, no Docker, no network, no runtime. |

| Lane | Used here |
| --- | --- |
| `FIXTURE_LAB` | nothing new (the dataset reader suites are unchanged and were not touched) |
| `BFF_DOUBLE` | every new test: the REAL http client over a stubbed `fetch` that serves the canonical fixtures (directly, or through `datasetDouble.testbase.ts`, a small server that applies the query to a population and builds each body from the `lifecycle.live` fixture). The real reader and the real answers-this-question guard judge every body. |
| `REAL_READ_RETAINED`, `REAL_READ_QUALIFIED` | **NOT_RUN** (owner: Codex/Bobby via UXM-08; the installed image does not serve the dataset, and the financial series source is `MISSING`) |

## 1. Task 1 — `ExecutionApi.getManagerDataset` (additive)

`api/managerDatasetQuery.ts` (new; **the reader files are untouched**), `ports.ts`, `httpApi.ts`, `fixtureApi.ts` (answers unavailable).

| Query field | Wire (exactly as the OpenAPI types it) |
| --- | --- |
| `surface` (+ `id`) | the route: `FUND` `/manager/fund-overview`, `FLEET` `/manager/fleet`, `PORTFOLIO|ALPHA|ACCOUNT|DEPLOYMENT` `/manager/{portfolios|alphas|accounts|deployments}/{id}/overview` (id percent-encoded) |
| `environment`, `workspaceId`, `q`, `qMode`, `lifecycleFilter`, `limit`, `after`, `before` | plain query values (`q_mode` needs `q`; `after` and `before` never together; limit 1..200; cursors 1..4096) |
| `window` | `content: application/json`: `"30D"` with its quotes, or `{from_ms,to_ms}` (not backwards) |
| `filters` | JSON array, max 16; ops `EQ GTE LTE IS_NULL IN`; `IN` needs `values` (1..32, unique), no `value`; numeric fields need an exact decimal; the FE-033 `IN` examples (`execution-manager-query-in`) encode as published |
| `sort` | JSON array, max 3, a field once |
| `economicPartition` | JSON, all five fields |
| `stageFilter`, `groupBy` | one comma list (`style: form, explode: false`); stages must belong to the environment (paper PAPER, sandbox SANDBOX, live CANARY+LIVE); group_by max 2, unique |

A schema test feeds what the encoder sends (decoded) to the published `ManagerDatasetQuery` schema (the oracle). 42 invalid queries make **no fetch** and answer `unavailable` with `MANAGER_DATASET_QUERY_INVALID`.

Typed `unavailable`, each with its own code, on: any non-2xx; a network failure; a body that is not JSON or that the reader refuses (`MANAGER_DATASET_REFUSED`, the reader's refusal kept); a readable body of another schema (`UNSUPPORTED_SCHEMA <version>`); and a **well-formed body that answers another question** (`MANAGER_DATASET_ANSWERS_ANOTHER_QUERY <what>`). `datasetQueryMismatch` checks, and only these: surface; environment; workspace; the selected window (none asked means none selected, ALL a typed gap); page size; group fields (none asked means no groups); scope (a portfolio or alpha row names the id asked, an account/deployment row holds a child with it); no row shows a stage outside `stage_filter`; `q` (only when `q_mode` says how); plain-text `EQ`/`IN`/`IS_NULL` filters on alpha, version, owner, portfolio, lifecycle, venue, health, source state; the order of a page whose first sort key is `current_stage` (nulls last both directions). **Honest limits**: it does not re-sort or re-filter anything else (money filters, name sort, `current_stage` as a filter, partitions are the server's); `page.limit` must equal the limit asked (an assumption: a server that clamps the page would be refused, fail-closed).

## 2. Task 2 — Fleet over the dataset; Cockpit

**Fleet** (`v2/screens/fleet`): the legacy read is the default and is unchanged when the dataset is not published (the 1234 existing fleet tests are unedited and green).

- *Published for the caller* = a `limit` 1 dataset read of the lens's environment is readable (`useDatasetPublication`). Only a single-environment lens (Real-funded -> live, Sandbox, Paper, or one stage of them) asks; the All lens, an archived view and a stage set across environments make **no** dataset request (the dataset pins one economic profile). Not published, or a port without the method: no `Source` control, no new control, the same Group (`Not published (FE-012)`), Health select and Sort words as today.
- Published: a `Source` control (Fleet read / Manager dataset). `src=dataset` makes the dataset the table's source (`src`, `group`, and a comma list in `health` are screen-local URL params). A URL that asks for the dataset where it is not published shows the fleet read **and a sentence saying so**; a dataset read that fails shows a typed panel with `Try again` and `Use the fleet read` (no silent fallback).
- Rows: one per alpha version and portfolio (the dataset's grain), identity plus lifecycle, no money. **Current stage** is the producer's scalar; a row with none prints `No single stage` with its set (`in Canary, Live`) and the typed reason on the title (`MULTIPLE_ACTIVE_STAGES`); a field the source does not publish is `Not published (FE-027)`. **In stage** is `Not published (FE-027)` with `STAGE_ENTRY_TIME_NOT_PUBLISHED` on the title unless the producer publishes `days_in_stage` (then it prints as published).
- Server-side only: search `q` (`CONTAINS`), owner `EQ`, **health `EQ` for one word and `IN` for several** (a checkbox menu), the lens's stages as `stage_filter`. Nothing is narrowed client-side over a partial page; a server that ignores a filter is refused by the guard (test).
- Sort: `Name`, `Current stage A to Z / Z to A` (stages sort by name, not risk; no-single-stage rows last both ways) and Group: `Current stage`, each offered **only because `query_options.sort_fields` / `group_fields` list `current_stage`**. Groups are the server's (`totals_scope FULL_AUTHORIZED_FILTERED_QUERY`): a chip list over the whole filtered result while the page holds 50.
- Paging: keyset by the server's `next_cursor`; `Showing N of M rows` (M = `authorized_filtered_count` of the newest page); `Load more`; the DOM cap is 200 and is named; a page of another snapshot or another total than the first is **not appended** (`SNAPSHOT_CHANGED`, `Reload`); a repeated row key is kept once; a late answer for a query the screen has left is dropped (generation counter).
- Scope sentences from the contract are printed: the stage rule (`stage_lifecycle`) and statement-before-filters (`statement_scope`): *capital statements, which this screen does not show, are taken before the table filters; counts and groups cover the whole filtered result*.
- Board and Map keep the fleet read (the dataset cannot be chosen there). The KPI strip and lens counts are the fleet read's summary and are not shown in dataset mode.

**Cockpit and Portfolios: intentionally no change.** The Cockpit's rows are approval decisions and waivers (governance reads); it has no sort or group control and its rows are not dataset rows, so a `current_stage` sort there would be client-invented. The Portfolios list sorts portfolios (a portfolio has no single stage). Neither reads the Manager dataset. FE-012 / FE-027 are therefore consumed on **Fleet only**.

## 3. Task 3 — Overview `MeasureSeg` (Net PnL, Return)

`MeasureSeg` is enabled only when the fund series is **served**: the fund NAV read says its `series_source` is `PUBLISHED` (from the last good read, so a refresh does not blink it). Then Net PnL and Return ask the same port for `NET_PNL` / `RETURN` over the same environment and window; pressing the pressed segment returns to the NAV line. **Equity stays disabled** (`Not published (FE-025)`: equity is not NAV). Not served (today: every profile answers `SERIES_SOURCE_NOT_PUBLISHED`), a failed read, a read in flight: all three off, described by `Not published (FE-025)`, no extra request. The panel is the shared `ManagerSeriesPanel`: this screen formats no figure, so RETURN prints through `seriesModel` (`chartUnit` / `seriesValueText`). At this base that is a plain ratio with no `%`; **FE-I's `ratio_scale` commits (`bdea6393`) change the print to the stated scale and make a RETURN without one a typed cell; nothing here bypasses them** and the RETURN test deliberately does not pin the print. The KPI cells Net PnL / Return / Drawdown stay `Not published`. Touches `overview/MeasureSeg.tsx` and 14 lines of `overview/index.tsx` (the Overview is FE-G's area for a11y: expect a trivial merge).

## 4. Fields published / consumed (Fleet, dataset mode)

Consumed: `surface`, `environment`, `workspace_id`, `snapshot_id`, `as_of_ms`, `quality`, `stage_lifecycle`, `statement_scope`, `query_options.sort_fields|group_fields`, `page.*`, `groups[].key|unique_row_count`, row `row_key`, `alpha_id`, `alpha_version_id`, `portfolio_id`, `name`, `owner_user_id`, `health`, `source_state`, `stage_presence`, `current_stage`, `entered_at_ms`, `days_in_stage`, `stage_lifecycle_reasons`. Deliberately not shown (identity-only screen): `metrics`, `economic_partitions`, `capital_statements`, `scores`, `children` beyond the guard, `lineage`, `venue`/`lifecycle` columns (filters exist on the port).

## 5. Test accounting

| Gate | Result | Lane |
| --- | --- | --- |
| `api/managerDataset.port` | 92 passed | BFF_DOUBLE |
| `screens/fleet` (incl. `fleetDataset` 42, `useFleetDataset` 11) | passed (section 6) | BFF_DOUBLE |
| `screens/overview/measureSegSeries` | 9 passed (overview folder 95 passed) | BFF_DOUBLE |
| `tsc --noEmit -p .` | exit 0 | n/a |
| Visual pinned-image, Playwright, ordinary R2/R3 hook, `refresh-release-integrity-ledgers`, Docker | **NOT_RUN** (R1 commits, `--no-verify`, section 10.10; owner: the integrator at R2) | n/a |
| `REAL_READ_*` | **NOT_RUN** | n/a |

## 6. Wide gate

`npx vitest run src/execution/v2/screens/fleet src/execution/v2/screens/cockpit src/execution/v2/screens/portfolios src/execution/v2/readers src/execution/api src/app --maxWorkers=2` (run before the Overview change): **72 files passed, 57911 tests passed, 5 expected-fail (the readers' pinned `it.fails`), 3 skipped, 0 failed**. Then `v2Hygiene`, `v2/boundary`, `failClosed`, `disabledReason`, `productBoundary`, `testHygiene`, `screens/overview`, `screens/fleet`, `screens/slice`: **22 files, 2609 passed**. `tsc --noEmit -p .` exit 0 on the final tree. No failure outside my files. (A first hygiene run executed beside `tsc` lost 10 files to worker/environment errors under memory pressure and was repeated alone: green.) Default-path proof: no existing test was edited; the 1234 pre-existing fleet tests and the 86 pre-existing overview tests pass on the new code, and the new tests have nothing to run on the old code (the port method does not exist there).

## 7. Verdicts and debt

| Id | Consumer verdict |
| --- | --- |
| FE-012 (group/sort by current stage) | **CONSUMED on Fleet** (dataset mode, BFF_DOUBLE only); stays OPEN for the real read |
| FE-027 (current stage, days in stage) | current stage **consumed**; `entered_at_ms` / `days_in_stage` stay `Not published (FE-027)` with the typed reason; request stays OPEN |
| FE-033 (`IN`) | **CONSUMED** (health `IN`; port encodes the published examples) |
| FE-013 (Net PnL / Return on Overview) | switch **wired**, gated on a published source; real behaviour today is the typed absence |

Debt: (1) e2e BFF doubles do not serve `/manager/fleet`, so a Playwright run answers the probe with an error and shows today's screen (no visual change); no Playwright/visual run here. (2) The probe is one `limit` 1 read per single-environment Fleet view. (3) Health/owner options in dataset mode come from the rows loaded so far (as in the legacy screen). (4) `q` is sent as `CONTAINS`; the legacy search mode is not stated anywhere. (5) New controls (Source, Health menu) are unreviewed against the HiFi and unmeasured for pixels. (6) Overview merge with FE-G / FE-I (section 3).
