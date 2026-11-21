# UXM-07 — Consumer receipt: Alpha screens on the SCOPED_V2 variants (R-3, S3-U2), 2026-10-20

Writer: Claude (frontend). Consumer receipt per Rules §10.12.4 for request **R-3** (written in
[consumer-receipt-be-p2-p3-2026-10-20.md](consumer-receipt-be-p2-p3-2026-10-20.md) §3) and the open half of **S3-U2** ("variants per kind",
[BE-P3](../BE-CLAUDE-2026-10-20/BE-P3.md)). This is the consumer's record, **not** a Bobby ACK (§10.3). `FRONTEND_BACKEND_SYNC.md` and
`UNIFIED_IMPLEMENTATION_PLAN.md` are **not edited**; ledger cells are proposed in §7.

## 0. Pin and lanes

| Item | Value |
| --- | --- |
| Base | worktree of `claude/fe-parity` @ `be6d98d1`; four commits on top (§6), not pushed, not landed |
| Read as evidence | `execution-resource-scoped.v2` (schema + `execution-resource-scoped.synthetic.valid.json`), `execution-scoped-records.openapi.json` (+ fixture), `execution-alpha-resource.v1`, `execution-subject-records.v1`. No HK/Edge source was read |
| Lane FIXTURE_LAB | reader conformance, view and screen suites over the canonical bodies. A synthetic fixture is not source acceptance |
| Lane BFF_DOUBLE | the Alpha screens through the e2e double (v2 bodies for the sentinel workspace `ws_TEST_SCOPED_V2` only), judged against the published schemas by `fixtureBff/server.test.ts`; one Playwright spec |
| Lane REAL_READ_RETAINED / QUALIFIED | **NOT_RUN** (owner Bobby, UXM-08). Nothing here says what a real SCOPED_V2 workspace answers |

## 1. Verdicts

| Id | Verdict | Published | Consumed | Left out, on purpose |
| --- | --- | --- | --- | --- |
| **R-3** Alpha screens on the SCOPED_V2 variants | **DELIVERED** (FE-owned). Consumer **ACCEPTED** `alpha-resource.v2` and `subject-records.v2` as contracts; **CHANGES_REQUESTED** on five members the v2 bodies cannot answer: requests **R-5..R-9** (§4) | §2 census | the Alpha 360 and Trade Replay read both variants by `schema_version`; the scoped authority label is printed | §3: every member v2 does not publish is a typed absence, none is inferred |
| **S3-U2** variants per kind | **ACCEPTED** for all four kinds. Alpha resource and subject records: both variants consumed. Observed timeline and market candles: one wire version, unchanged | alpha-resource v1/v2, subject-records v1/v2, observed-timeline v1, market-candles v1 (+ `/market/candles`) | see §2 | the replay reads venue candles and `/market/candles` **unmerged** (BE-P3); neither has a scoped variant, so in a SCOPED_V2 workspace they are read as they are |

## 2. Census: published / consumed / omitted

"Closed" = the strict reader refuses an unknown key at any depth. Counts are schema members.

### 2.1 Alpha resource (`GET /resources/alphas/{id}`)

| Layer | v1 `execution.alpha-resource.v1` | v2 `execution.alpha-resource.v2` |
| --- | --- | --- |
| Reader | existing `readProfileEnvelope` + `readAlphaFleetItem` (tolerant, unchanged; refuses a body with the v2-only authority members) | `readAlphaResourceScoped`, **closed**, full / empty / bounded shapes, 18 relation panels |
| Envelope members | 21 | 26 = the 21 + `visibility`, `coverage`, `totals_scope`, `is_full_portfolio`, `read_scope` |
| Consumed (envelope) | `state`, `freshness`, `completeness`, `as_of_ms`, `workspace_id` | `state`, `freshness`, `completeness` (const `PARTIAL`), `workspace_id`, `delivery_profile`, the five authority members, `actor.username`, `resource.id` / `label`, per-panel `state` / `reason_code` / `source_total` / `returned_count`. `as_of_ms` is always `null` in v2: "Source time not published" |
| Read, not drawn (envelope) | `capabilities`, `projection`, `panels`, `unavailable_branches` | `requested_environment`, `selected_environment`, `projection`, `capabilities`, `unavailable_branches`, `read_at_ms`, `read_at` |
| Alpha summary (`data.alpha`) | 18 members: `alpha_id`, `alpha_label`, `version`, `owner`, `stage`, `stages`, `portfolios`, `deployments` (20 members each), `allocations`, `balances`, `position_pnl`, `exposure`, `health`, `attention_reasons`, `metrics_availability`, `updated_at(_ms)`, `valuation_warning` | 16 members: `kind`, `id`, `visibility`, `coverage`, `financial_summary` (`UNAVAILABLE` + `SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS`), `deployments`, `portfolios`, `metrics_availability` (3), and optional `alpha_id`, `portfolio_id`, `account_id`, `binding_id`, `name`, `display_name`, `state`, `base_currency` |
| Consumed (summary) | `alpha_id`, `alpha_label` and `version` (unless the producer's literals), `owner`, `portfolios`, `deployments` (10 of 20 members), `stage`, `position_pnl`, `exposure` | `id`, `name` / `display_name` (title, when stated), `portfolios` (names), `financial_summary.reason_code` (the money absence). `deployments` is read closed; its rows are drawn from `data.deployments` |
| Read, not drawn (summary) | `stages`, `allocations`, `balances`, `health`, `attention_reasons`, `metrics_availability`, `updated_at`, `valuation_warning`, 10 deployment members | `alpha_id`, `portfolio_id`, `account_id`, `binding_id`, `state`, `base_currency`, `metrics_availability` |
| Relation rows | `data.*` arrays of **untyped** rows (object, `maxProperties 80`); the screen reads 9 keys of `positions`, 5 of `reconciliation` | 18 relations, **230 typed row members**, all optional and nullable except `profile_environment`; closed; field tables checked equal to the schema |
| Consumed (rows) | positions: `position_id`, `symbol` / `instrument_id` (split at `.`), `position_side` / `side`, `account_id`, `quantity`, `avg_px_open`, `mark_price`, `unrealized_pnl`, `notional`, `currency`; reconciliation: `finding_id`, `venue`, `finding_type`, `status`, `resolved_at` | **22 of 230**: deployments 7 (`profile_environment` as the book, `deployment_id`, `account_id`, `venue`, `currency`, `portfolio_id`, `state`); portfolios 2 (`portfolio_id`, `name`); portfolio_allocations 2 (`deployment_id`, `allocated_capital`, joined only when exactly one row); positions 9 (`position_id`, `instrument_id` as stated, `side`, `account_id`, `quantity`, `avg_px_open`, `mark_price`, `unrealized_pnl`, `notional`); reconciliation 2 (`status`, `venue`). Every relation's returned count and `source_total` feed the population table |
| Omitted (rows) | | 208 members: the 13 other relations (accounts, balances, margin, sync, broker, venue accounts, sessions, orders, fills, performance, equity, strategies, journal) are not drawn on Alpha 360 (the V1 screen did not draw them either). `strategies.stage` is **published and deliberately not read** as the alpha's stage (it is per strategy and per book) |

### 2.2 Subject records (`GET /resources/alphas/{id}/orders|fills`)

| Layer | v1 `portal.execution.subject-records.v1` | v2 `portal.execution.subject-records.v2` |
| --- | --- | --- |
| Reader | existing `readSubjectActivity` (tolerant, unchanged; refuses a body carrying `read_scope` / `reason_code`) | `readSubjectRecordsScoped`, **closed** |
| Page members | 15 incl. `timeframe`, `source_health`, `projection`, `resource.resolution` | 14: adds `read_scope`, `reason_code`; has **none** of `timeframe`, `source_health`, `projection`, `resolution` |
| Page consumed | `state`, `page.*` (cursor opaque), `timeframe` (replay interval), `source_health.as_of_ms` | `state`, `page.*` (cursor opaque), `coverage`; interval, "as of" and health are `null` (replay says the interval is not published) |
| Record `values` | open object; the replay reads 19 order keys and 15 fill keys | closed `ScopedRecordFields`, 35 members. Orders consume `order_id`, `account_id`, `instrument_id`, `side`, `status`, `price`, `quantity`, time; fills `fill_id`, `account_id`, `instrument_id`, `side`, `price`, `quantity`, `realized_pnl`, time |
| Absent in v2 (no column drawn; one note says so) | | `client_order_id`, `order_type`, `execution_session_id`, `venue_order_id`, trigger price, reduce/post-only, time in force, error code/message, fee, fee currency, liquidity, trade id |
| Time | `submitted_at` / `trade_time` text | **only** `occurred_at_ms`, else `timestamp_ms`. `observed_at_ms` (the Portal clock) is never a trade or order time; integer `created_at` / `updated_at` state no unit and are not read as instants. A record with no such member is **returned and not shown**, counted in the Orders & Fills note and in the replay audit |

### 2.3 One wire version, unchanged

Observed timeline (`portal.execution.observed-timeline-bff.v1`), `/market/venue-candles` and `/market/candles`, the equity chart: no scoped variant exists; read as in the BE-P3 receipt. The replay never merges the two candle sources.

## 3. What the screen prints for a member v2 does not publish

| Member (v1 had it) | Cell | Id | Reason in the title |
| --- | --- | --- | --- |
| alpha name, version | `Not published` | FE-066 | `execution.alpha-resource.v2 states no alpha name / version`. The producer's literal `Unnamed alpha` in `resource.label` is not a name; a stated `display_name`, `name` or other label is |
| owner | `Not published` | FE-030 | `states no owner` |
| current stage, stage detail | "The source names no current stage" + note | FE-027/028 | the body states each deployment's book only. A deployment sits in its book (Paper, Sandbox, or **Live book**: Canary vs Live is not stated and is never picked; it is listed under both with "Stage not published") |
| net PnL, exposure (KPIs, Score drawer, Contribution, Deployments columns) | `Not published` | FE-005 (nearest ledger id; Codex to confirm) | `SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS`. Nothing is summed from a row |
| deployment allocation | the one `allocated_capital` row of that `deployment_id`; else `Not published` | FE-005 | none or several rows: absent, never a sum |
| health, attention reasons | not drawn (the V1 screen drew neither) | | |
| reconciliation finding type, resolution time | `Not published` | FE-072 | the scoped relation has neither |
| orders / fills members in §2.2 | no column; one note | | `portal.execution.subject-records.v2` |
| bounded shape | the label says the Portal cut the response; every table says its rows "are not in this response" | | `EDS04_RESOURCE_RESPONSE_BYTE_BOUND` |

The scope label (a `role=note` banner, then a details table) prints exactly what the contract publishes: authorized rows only, totals over visible rows only, not a full portfolio, completeness, workspace, delivery profile, read-for, policy revision per book, and per relation rows returned against the source's own total (a total the source did not state reads "Total not published"). The generic "Partial" banner is the legacy body's and is not shown twice.

## 4. Requests written (not opened by me)

| Id | Locator | UI impact today | Done when |
| --- | --- | --- | --- |
| **R-5** time semantics | `ScopedRecordFields`: `occurred_at_ms`, `timestamp_ms`, `created_at`, `updated_at` | the screen reads a trade or order time only from `occurred_at_ms`, else `timestamp_ms`, by name; the integer `created_at` / `updated_at` (unit unstated) are not read. A fill with neither is returned and not shown | Codex states which member is the order submission time and the fill trade time, and the unit of the integer stamps |
| **R-6** alpha-level facts | `AlphaScopedSummary` | no name, version, owner or alpha stage in a SCOPED_V2 workspace | decide whether v2 may publish them (a stated `name` is already read when present) |
| **R-7** per-deployment money | `financial_summary`, `DeploymentsScopedRow` | net PnL / exposure / allocation are `Not published (FE-005)`; Contribution draws nothing | a published, authorized per-deployment figure (not a sum of visible rows), or a decision that the screen stays without it |
| **R-8** reconciliation member set | `ReconciliationScopedRow` | finding type and resolution time are `Not published (FE-072)` | `finding_type`, `resolved_at` (or `finding_id`) on the scoped row |
| **R-9** scoped record fields for orders | `ScopedRecordFields` | no client order id, order type, fee, liquidity: the replay's leg grouping (entry / TP / SL by client id suffix) cannot be built | add the members, or accept an orders table without them |

## 5. Tests run (R1, focused, unlocked, `--maxWorkers=2`; lane FIXTURE_LAB / BFF_DOUBLE)

| Gate | Result |
| --- | --- |
| `tsc --noEmit -p .` | exit 0 |
| `alphaResourceScoped.conformance` | 903 passed: L0 canonical verbatim + field tables equal the schema; L1 matrices (panel state x reason x has_more x truncated x total x retryable = 672; state x freshness x requested x selected = 320; every member x legal and illegal values; shapes; branches; authority constants); L2 3,600 rows / 512-char texts in budget; L3 generated negatives. **Looser than the schema: 0** (asserted) |
| `subjectRecordsScoped.conformance` | 508 passed, same tiers; looser than the schema 0 |
| `alpha.scoped.test.tsx` | 23 passed (screen through the real http client + dispatch + double) |
| `view.test.ts`, `scopedBook.test.ts`, `api/alphaVersionedPort.test.ts` | 11 + 5 + 7 passed |
| focused gate: `v2/screens/alpha`, `v2/readers`, `fixtureBff`, `execution/api`, v2 hygiene, `failClosed`, `disabledReason`, `scopedEviction` | 68 files, **58,422 passed**, 5 expected fail (pre-existing), 1 skipped |
| existing legacy Alpha suites (`alpha.test`, `alpha.flow`, replay, model, double, `canonicalServing`) | pass **unchanged**; only `scopedEviction.test.tsx` changed (its stub faked `getAlpha360Resource` only; it now answers the versioned method) |
| fixtureBff golden / equivalence | **not re-recorded**: all 882 entries byte-identical (the request matrix is untouched; this is the proof the v1 answers did not change). Six new route-table entries judged against the v2 schemas; `ROUTES.md` regenerated |
| Playwright `execution-v2-alpha-scoped.spec.ts`, project `chromium-v2`, **run once alone** on a temporary config (port 4196, deleted; 4174-4176 were free but the standard config builds all three) | **9 passed**: scoped @1280 and @660 (labelled, console clean, no overflow on 9 tabs, URL / workspace kept); Deployments and Orders & Fills with the Portal cursor unchanged, Back and reload; replay reads both candle sources; a late page of another book dropped; withdrawn scope typed at 1280 and 660 and no residue in text or DOM; denied / down / empty / bounded; legacy page unchanged. Not compared to any visual baseline |

## 6. Commits and files (shared ones marked *)

`73a7f36d` readers + dispatch + additive port; `b31be131` double + route table; `20949ad9` screens; `dc93b745` Playwright spec, port test, CSS.

Readers: `v2/readers/alphaResourceScoped.ts`, `subjectRecordsScoped.ts` (new), `dispatch.ts`* (two dispatchers, two wrappers that refuse a v2 body under a v1 label). Ports, **additive only**: `api/ports.ts`* (`getAlpha360ResourceVersioned`, `getSubjectActivityVersioned`), `api/httpApi.ts`*, `api/fixtureApi.ts`*, `api/subjectActivity.ts`* (optional `workspaceId`, absent from the request when not given). Screens: `v2/screens/alpha/{view,scopedBook,ScopeBanner}`, `index`, `Lifecycle`, `TableTabs`, `PerformanceTab`, `OrdersTab`, `ScoreDrawer`, `model` (widened types), `useAlphaReads`, `replay/{index,ReplayView}`; `v2/css/alpha.css` (V2-only). Double: `e2e/bffDoubleAlpha.ts`, `fixtureBff/routeTable.ts`*, `apps/portal/fixture-bff/ROUTES.md`*. Not touched: `screens/{workbench,canary,sandbox,live,fleet,cockpit,operations}`, `FRONTEND_BACKEND_SYNC.md`, `UNIFIED_IMPLEMENTATION_PLAN.md`, any backend file.

**Behaviour change to flag:** the V2 Alpha screen now sends `?workspace_id=` on the resource and record reads **when the URL or the caller names one** (the legacy v1 route accepts it; before, the URL's workspace was ignored on those two reads). With no workspace the request is byte-identical to before.

## 7. NOT_RUN and proposed ledger cells

NOT_RUN: visual pinned-image suite, full hook (R2), Docker, PostgreSQL, wide vitest, `refresh-release-integrity-ledgers.sh --write` (`--check` reports the N29 ledger stale; it is also stale with my `fixtureApi.ts` change reverted, so staleness predates this package; the integrator re-pins at R2), real reads (UXM-08).

Proposed: `R-3 | DELIVERED -> consumer ACCEPTED 2026-10-20 (alpha-resource.v2, subject-records.v2); R-5..R-9 written | S3-U2 | consumer ACCEPTED (all four kinds; timeline and candles one version)`.
