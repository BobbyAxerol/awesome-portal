# UXM-07 — Consumer receipt: Manager dataset (BE-P1 + BE-P4) and Manager series (BE-P4), 2026-10-20

Writer: Claude (FE writer, manager consumer). Consumer receipt per Rules §10.12.4 for the backend merge BE-CLAUDE-2026-10-20
([BE-P1](../BE-CLAUDE-2026-10-20/BE-P1.md), [BE-P4](../BE-CLAUDE-2026-10-20/BE-P4.md)). This is the **consumer's** record. It is not Codex's
ACCEPTED (producer side), not Bobby's ACK (§10.3), and not a source acceptance: a fixture is never a source acceptance.
`FRONTEND_BACKEND_SYNC.md` and `UNIFIED_IMPLEMENTATION_PLAN.md` are **not** edited here; the cells to paste are in section 7.

## 0. Pin and lanes

| Item | Value |
| --- | --- |
| Producer | `claude/fe-parity` @ `7df531d3` (contains the merged BE-P1 / BE-P4 contracts: `execution-manager-dataset.v1.schema.json`, `execution-manager-series.v1.schema.json`, `execution-manager-models.openapi.json`, `execution-manager-series.openapi.json`, 10 fixtures) |
| Consumer commits | `8b8241f5` dataset reader, `e1707c04` series reader, `27b6a20d` port + adapter, `83cca91f` Overview, `63dedf85` Portfolio 360, `849bd22c` Compare |
| Evidence read | the published schemas / OpenAPI / fixtures and the two ledgers only. No source (HK), no Docker, no network, no runtime. |

Test lane labels (every test below is one of these; `REAL_READ_*` has **no** run):

| Lane | What it is | Used here |
| --- | --- | --- |
| `FIXTURE_LAB` | published synthetic fixtures + the published schema as oracle, no HTTP | `managerDataset*.test.ts`, `managerSeries*.test.ts`, `seriesModel.test.ts` |
| `BFF_DOUBLE` | stubbed `fetch` / a hand-written port serving the published fixtures, rewriting only subject ids, metric, environment, window | `api/managerSeries.port.test.ts`, Overview, Portfolio 360 and Compare screen tests |
| `REAL_READ_RETAINED` | a real Edge read of retained (non-qualified) data | **NOT_RUN** (owner: Codex/Bobby via UXM-08; the installed image does not serve the new fields) |
| `REAL_READ_QUALIFIED` | a real read of a qualified source | **NOT_RUN** (owner: Codex; the financial normalized series source is `MISSING`, BE-P4 section 2: every profile answers `SERIES_SOURCE_NOT_PUBLISHED`) |

## 1. Why the dataset suites were red, and the exact differences (published vs reader)

Before: `managerDataset.conformance` 108 and `managerDataset.test` 17 red (125 of 2419). All came from five published changes, none from a bug in an old rule.

| # | Published | Reader before | Now |
| --- | --- | --- | --- |
| 1 | Row: `current_stage` (stage or null), `entered_at_ms`, `days_in_stage` (int or null), `stage_lifecycle_reasons {current_stage, entered_at_ms, days_in_stage}` all **required**, object closed | closed key list without them: every row refused | read exactly; schema `allOf` mirrored: value null iff reason set; `days_in_stage` needs `entered_at_ms`; a published `current_stage` is the only `stage_presence`; no presence means `STAGE_FIELD_NOT_PUBLISHED`, otherwise a missing stage means `MULTIPLE_ACTIVE_STAGES` |
| 2 | Root constant `stage_lifecycle` (`current_stage_rule`, `covers`, `entry_time`), required | unknown key: whole body refused | required and exact; surfaced as `dataset.stageLifecycle` for a caption (not re-derived) |
| 3 | `current_stage` added to `sort_fields` (18) and `group_fields` (9, schema order: after `stage_presence`) and to the group-key field enum | enums without it | added to `MANAGER_SORT_FIELDS` / `MANAGER_GROUP_FIELDS`; the `sameSet(group, sort)` rule still holds |
| 4 | `unavailable_fields` = `[days_in_stage, entered_at_ms]`, both `STAGE_ENTRY_TIME_NOT_PUBLISHED` (was `[current_stage, days_in_stage]`) | old pair and reason | new pair, in the schema's `prefixItems` order |
| 5 | Three dataset fixtures regenerated, plus `partitions`, `invariants.negative` and `lifecycle.live` | n/a | L0 now reads five dataset fixtures (lifecycle.live added to the family list and the digest) |

### Reader vs producer differences (BE-P1 "Reader and producer disagree") — all three adopted

1. **MD-S5 replaced** (`headlineIsAPartitionFigure`). Old rule: a row-level money figure that names a currency must have the currency of *every* partition that publishes the same key. It wrongly refused the legitimate pinned-partition body (query pins one `economic_partition`; the row still lists its other-currency partitions; the headline is the pinned partition's figure). New rule: the headline is **deep-equal to the same-key metric of one partition on that row** (structural equality of the two reads, which are injective on the raw bodies). Justification: (a) it is the producer's real invariant (`MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE`, MD-8); (b) it still forbids what the old rule existed for, because a cross-currency sum equals neither partition's metric, so a total in disguise cannot pass; (c) it is stricter in one more way than the old rule, deliberately: a USDT headline of `87.75` over a USDT partition of `100.25` is now refused (it is a figure no partition publishes), where the old rule accepted it. Only the five partitioned money keys are judged, exactly like the producer; a headline naming no currency (absence, ratio) needs no partition. Tests: matrix P rewritten (60 states: layout x inside-currency x headline, with `copy of first/last partition` and `own figure`), the pinned-partition case, one-digit-off refusal, no-partition refusal, an absence needing none.
2. **Partition identity is the producer's four fields** (domain, currency, basis, `native_profile_ref`); `domain_proof_ref` is evidence. A repeat that differs only in the proof reference is now refused by the reader too (`managerMetric.ts`). The published negative `MD-3/partition-identity-repeated-with-other-content` was the one case the reader accepted; it is now refused (the check expects `[]` accepted cases).
3. **Empty past-the-end page** is legal: "no cursor either way means the whole result" applies only to a **non-empty** page (`returned_count > 0`); the schema states the empty case exactly. Tests: an empty page with `authorized_filtered_count` 7 and no cursor reads; a count that disagrees with the rows is still refused both ways.

### MD-4 — plain statement of the semantic change (for Codex ACCEPTED / CHANGES_REQUESTED)

An unpublished preset (`7D`/`30D`/`90D` with `data_state NOT_PUBLISHED`) **no longer carries its would-be window**: the producer emits `resolved: null` unless the preset is `METRIC_SPECIFIC`. Consumers therefore lose the range they could previously read from `query_options.window.presets[i].resolved`; they still get the window the server selected in `selected_window` when they request that preset. The reader already required "unpublished means no bounds" (old named group MD-S9) and the schema now says it, so **nothing in this build depends on the lost value** (no screen consumes `query_options.window.presets`). Consumer verdict: **ACCEPTED** (no `schema_version` bump needed from the consumer's side). It is a behaviour change of an existing producer, so the producer's ACCEPTED is Codex's to give.

### MD-5 — negative zero: stays pending

Not changed. The reader still refuses `-0*` as a decimal value (named group MD-S2, 24 corpus cases, pinned); the schema and the producer admit it. I did **not** touch any shared decimal helper (`exactValue`, `exactDecimal`, `readDecimal`), nor any seal or source data. **Recommendation: option C** (canonical zero on emit, limited to the manager decimals, `-0*` forbidden in the published schema for those keys): numerically identical, no financial fact changed, no 503, and it removes the only place where reader and schema disagree on a *well-formed* value. Options A (leave it) keeps a permanent reader-stricter pin; B (forbid on input) turns one bad source representation into a 503 for the whole dataset.

## 2. Dataset reader — fields published vs consumed

| Group | Published | Consumed | Notes |
| --- | --- | --- | --- |
| Root | 25 required keys incl. `stage_lifecycle`; 3 optional details arrays | 25/25; details counted, never read (named looser group MD-L1, unchanged) | |
| Row | 18 keys (4 new) | 18/18 | `currentStage`, `enteredAtMs`, `daysInStage`, `stageLifecycleReasons` on `ManagerRow` |
| `query_options` | sort 18, group 9, `unavailable_fields` 2 | all | |
| Page | MD-1 rules | all, incl. the empty page | |
| Groups | MD-6/7 (field enum, once per key, count) | all | `current_stage` is a groupable field |
| Deliberate omissions | `score_details`, `composition_details`, `regime_details` content | not read | other families |
| Not derived | a stage from `stage_presence`, an entry time from `valid_from_ms` or a decision date, a day count | never | `current_stage: null` with one visible stage (stage filter) is legal and is never "fixed" |

New named stricter-than-schema group **MD-S13** (the producer's Zod arithmetic, which JSON Schema cannot state): `days_in_stage == floor((as_of_ms - entered_at_ms) / 86_400_000)`, `entered_at_ms <= as_of_ms` when a day count exists, and an entry time needs a published `current_stage`. Matrix L (108 states: presence x stage x reason x entry pair) checks the reader against the schema state by state: the reader never accepts what the schema refuses, and refuses on its own only for MD-S13.

Conformance accounting (generated corpus, 1469 cases): schema refuses 1377; the reader accepts **0** of those (never looser); reader-stricter schema-valid refusals now **72** in 5 named groups (MD-S1 41, MD-S2 24, MD-S5 4 (a headline edited alone), MD-S7 page 1 + cursor 2); pinned by hand 30 cases in 12 groups (MD-S1..S13 less MD-S9, which became a schema rule). Matrix P: reader refuses the states in which a headline names a currency no partition publishes, all of the repeated-partition layouts (schema-invalid too), and the foreign-currency figures.

`it.fails`: BE-P1 already flipped every gap the schema can now state (MD-1 empty page, MD-3 exact repeat, MD-4, MD-6 exact repeat, MD-7 field enum and a field once). Five remain `it.fails` **on purpose** (they pass while the schema stays silent and turn red the day a rule becomes expressible): MD-1 exact count, MD-2 currency of a metric in its partition, MD-6 shared `row_key`, MD-7 `unique_row_count`, MD-8 headline. Verified: 5 expected-fail, all still failing as intended.

## 3. Series reader (`readers/managerSeries.ts`) — fields published vs consumed

| Group | Published | Consumed |
| --- | --- | --- |
| Envelope | 14 required keys (workspace, environment, authorities, metric, `selected_window`, `series_source`, clocks, quality, `series` 1..4, `comparison`, `lineage`) | 14/14, closed |
| Entry | 16 keys; three states; 8 closed UNAVAILABLE reasons + `NO_POINTS_PUBLISHED_IN_WINDOW`; points as exact decimal strings (max 2000), gaps (max 256, 4 reasons), partition (5 fields), unit MONEY/RATIO, currency, basis, `methodology_ref`, window, quality, provenance | 16/16 |
| Comparison | `state`, `reason_code`, `transform`, `common`, `axis_ms` (max 8000) | 5/5, **re-derived locally** with the producer's precedence (CURRENCY_MIXED, ECONOMIC_PARTITION_MIXED, BASIS_MIXED, UNIT_MIXED, METHODOLOGY_MIXED, WINDOW_MISMATCH, then UNAVAILABLE, then ALIGNED); a body whose `comparison` disagrees is refused |
| Fixtures | 6 files: 4 response bodies (populated, empty, unavailable, currency-mixed), 1 stored publication, 1 query example | the 4 bodies read; the publication and the query are used as non-series input (the query examples drive `encodeManagerSeriesQuery` tests) |
| Not consumed | the stored publication form (`ManagerSeriesPublication`) | it is a producer input, never a response |

Named stricter-than-schema groups (all producer rules JSON Schema cannot state; each has a pinned hand case, 23 cases in 10 groups, and the corpus is counted): MS-S1 display safety, MS-S2 negative zero, MS-S3 empty/backwards window, MS-S4 points strictly ascending and inside the window, gaps ordered and inside, MS-S5 the entry carries the selected resolved window and ends by the cutoff, MS-S6 the unit follows the metric (NAV/NET_PNL MONEY in the partition currency, RETURN RATIO), basis is the partition's, MS-S7 a subject once and the NOT_PUBLISHED reasons, MS-S8 ALL is a gap (no points for it), MS-S9 comparison equals the derived value, MS-S10 clock range. Corpus: 890 cases, schema refuses 831, the reader accepts **0** of those, reader-stricter 55, all in named groups. L2: 4 subjects x 2000 points + 256 gaps (8000-point axis) inside the budget. Honest limit: `WINDOW_MISMATCH` and `UNIT_MIXED` are derivable but **unreachable in a valid body** (the entry window must equal the selected window; the unit follows the metric), so the tests exercise them only through "a lying comparison is refused".

## 4. Port, adapter, screens (BFF_DOUBLE lane)

- `ExecutionApi.getManagerSeries(query)` (additive). `subjects`, `window`, `economic_partition` are JSON-encoded query values as the OpenAPI says. Typed `unavailable` on any non-2xx, network failure, unreadable body, and (new) on a **well-formed body that answers another question** (`seriesAnswersQuery`: another subject, order, count, environment, metric, workspace or window). A request the server would refuse (0 or 5 subjects, a duplicate, a backwards window) is refused with **no fetch**. The fixture api answers unavailable. The components never call `fetch`; they use `useManagerSeries` over the port.
- **Overview**: the fund's NAV for the URL's environment and window; AVAILABLE draws the line on `EquityPanel` with a caption of methodology, basis, exact window and stated gaps (nothing filled); the NAV KPI is the **latest published point**, exact string on `title`; EMPTY says `No points in this window`; UNAVAILABLE prints the typed reason (a source not published keeps `Not published (FE-005/006/013/025)`); a failed read is typed `Not available`. Net PnL, Return and Drawdown stay `Not published`.
- **Portfolio 360**: one PORTFOLIO subject, selected environment, page window; a NAV card, the NAV KPI and the NAV row of the capital statements share one `NavFigure`; the three states behave as above.
- **Compare**: the comparable picks (2..4 on one basis, by the existing client list rule) are asked for as **one** read. ALIGNED draws every series on the published `axis_ms` with `CompareOverlay` (no fill: a readout where a subject has no point says `No point at this time`; no rebase; no conversion), basis caption from `comparison.common`; INCOMPARABLE lists each subject apart with the mismatch sentence and its own currency/methodology (no chart); UNAVAILABLE keeps `Not published (FE-013/033)` when the source is not published, otherwise `Not available`, with a per-subject typed reason; one EMPTY subject makes the picks not aligned (nothing is drawn from the other). Fewer than two comparable picks: no read, `Pick two comparable portfolios`. The measure switch (NAV, Net PnL, Return) re-asks with the other metric.
- **Fleet / Cockpit sort and group by `current_stage`**: **nothing to change**. No screen or port method consumes `readManagerDataset` yet (Fleet and Cockpit read `/alphas`, the Manager dataset has no `ExecutionApi` method), so there is no control to extend by one line. Wiring needs a `getManagerDataset` port + a screen that reads it; not started (owner: next FE round).

## 5. Test accounting

| Gate | Result | Lane |
| --- | --- | --- |
| `vitest run src/execution/v2/readers/managerDataset` | 2442 passed + 5 expected-fail (was 125 red of 2419) | FIXTURE_LAB |
| `vitest run src/execution/v2/readers/managerSeries` | 1122 passed | FIXTURE_LAB |
| `vitest run src/execution/api/managerSeries.port` | 16 passed | BFF_DOUBLE |
| screens: overview 86, portfolios 235 + 10 new NAV, compare 95 (new series tests), series 7 | all passed | BFF_DOUBLE |
| `tsc --noEmit -p .` | exit 0, no output | n/a |
| `vitest run src/execution/v2 src/app --maxWorkers=2` (HEAD `849bd22c`) | 151 of 155 files green; 57389 passed, 70 failed, 5 expected-fail, 3 skipped; none of the 70 is in a file this round touched (section 6) | mixed |
| Visual pinned-image, Playwright, ordinary R2/R3 hook, `refresh-release-integrity-ledgers`, Docker | **NOT_RUN**; owner: the integrator at the R2 milestone (these are R1 commits, `--no-verify`, §10.10) | n/a |
| `REAL_READ_RETAINED`, `REAL_READ_QUALIFIED` | **NOT_RUN**; owner: Codex (series source `MISSING`) / Bobby (UXM-08) | n/a |

## 6. Wide gate

`npx vitest run src/execution/v2 src/app --maxWorkers=2` at `849bd22c`: 4 files red, 70 tests, **all outside this round's files and owned by the other two writers** (they are red because the same backend merge moved their contracts):

| File | Red | Owner |
| --- | --- | --- |
| `v2/readers/commandCurrency.conformance.test.ts` | 52 | FE-B (command / pending / eligibility / request) |
| `v2/readers/commandCurrency.test.ts` | 10 | FE-B |
| `v2/screens/canary/readCanary.conformance.test.ts` | 3 | FE-C (stage bodies; likely the `testkit/schema.ts` keyword gap) |
| `v2/screens/sandbox/readSandbox.conformance.test.ts` | 5 | FE-C |

`realtimeProducerConsumer` was not in the failing set. The v2 hygiene suites (`v2Hygiene`, boundary, charts hygiene, slice boundary, product boundary) are green with the new `css/series.css`, `screens/series/*` and the `.testbase.ts` doubles. I did not verify these 70 fail on the untouched base by a separate run; they are in files I did not edit and read contracts I did not edit.

## 7. Verdict per request id (consumer side; the producer's ACCEPTED is Codex's)

| Id | Consumer verdict | Why / what is still open |
| --- | --- | --- |
| FE-027 (`current_stage`) | **ACCEPTED** for the contract and the reader | `entered_at_ms`, `days_in_stage` are typed `NOT_PUBLISHED` and stay `Not published (FE-027)`; nothing is derived. No screen consumes the dataset yet. Request stays OPEN for the entry-time part and the gate state. |
| FE-012 (group by `current_stage`) | **ACCEPTED** for the contract (field in sort and group lists, groups are disjoint) | no consumer wired (see section 4); the cell is not closable by the FE until a screen reads the dataset |
| FE-013 (NAV / Net PnL / Return series) | **ACCEPTED** for the contract and the consumer; **CHANGES_REQUESTED, non-blocking**: (1) RATIO carries no scale (fraction or percent), so the FE prints it as a plain `ratio` with no `%`: please add a `ratio_scale` or state it in the unit; (2) the response validator does not tie the unit to the metric (only the stored publication does), the reader enforces it (MS-S6): please enforce it in `managerSeriesResponse` too | data side is `MISSING` (BE-P4 section 2): every profile answers `SERIES_SOURCE_NOT_PUBLISHED`, so the real behaviour is the typed absence; `REAL_READ_QUALIFIED` NOT_RUN |
| FE-033 (aligned series, typed refusal on mixed currency) | **ACCEPTED** for the contract and the consumer | note: `WINDOW_MISMATCH` and `UNIT_MIXED` cannot occur in a body that satisfies the response rules; consider documenting or dropping them from the response vocabulary |
| MD-1 page counts | **ACCEPTED** | empty past-the-end page is legal (reader adjusted) |
| MD-2 currency in a partition | **ACCEPTED** | producer-only in the schema; reader enforced it already (`it.fails` pin stays) |
| MD-3 partition duplicates | **ACCEPTED** | reader now uses the producer's four-field identity |
| MD-4 unpublished preset has no window | **ACCEPTED** | semantic change stated in section 1; Codex's ACCEPTED needed |
| MD-5 negative zero | **PENDING (owner decision, Bobby)** | recommend option C; no helper or source data touched |
| MD-6 duplicate rows / groups | **ACCEPTED** | shared `row_key` stays producer-only (`it.fails`) |
| MD-7 group membership | **ACCEPTED** | enum and once-per-key in the schema; offered-field and count producer-only |
| MD-8 headline identity | **ACCEPTED** | the reader rule is rewritten to identity (section 1); `it.fails` pin stays |

## 8. Debt / not done

- No `getManagerDataset` port method and no screen consumes the dataset (Fleet/Cockpit `current_stage` sort/group is therefore not wired).
- Series: `ALPHA` / `DEPLOYMENT` subjects are not built by the producer; the Compare "Alphas" choice stays off (`Not published (FE-033)`).
- Overview's `MeasureSeg` (Net PnL / Return / Equity) stays disabled: the fund NAV is the only fund series this round wires.
- Testkit: no `dependentRequired` was needed; `testkit/schema.ts` was not edited.
