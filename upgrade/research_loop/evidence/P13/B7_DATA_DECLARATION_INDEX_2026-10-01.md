# B7 — indexed data declaration foundation

Owner: Codex; branch `codex/be-gaps`, landing `docs/research-loop-plan`.
Scope: [B7 spec](../../DATA_DECLARATION_SPEC_2026-10-01.md), DR-01/02/04,
target-bar parts of DR-06/07, canonical contracts, and B6 wire absence.
**Initial code/source record; superseded by PREVIEW_ACCEPTED journal in §6 below.**
Do not read this as complete DR-01…10, frontend acceptance, P23 or P24.

## 1. Implementation and protected authority

- One `enrich_dataset_catalog` service: explicit timestamp-index operator,
  immutable SHA-256 revisions, source-manifest binding, clock/range, atomic
  publish/retry and bounded custody. Reads never execute the index operator or
  load market prices. Public catalog has a 30-second namespace cache, invalidated
  on source/index revision changes; index metadata is immutable.
- V1 unchanged. Three new named Control-API GETs, authenticated session and
  workspace membership, existing signed private-principal boundary, one-MiB
  streamed response cap, no browser paths/HMD handles/credentials.
- Symbol keyset binds workspace, dataset, filter, limit and full metadata
  revision. Incomplete timeframe coverage has `total:null`, never a fabricated
  zero. Truncated namespace is refused rather than pretending all rows were read.
- Window counts and warmup come from compressed timestamp runs, not a price
  scan or new preflight token. Exact UTC half-open/aligned bounds; queries outside
  verified index return `WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE` with null facts.
- New `enriched_analysis_availability` on current-source Evidence, EvidenceHub
  and Report: `AVAILABLE`, or `SEALED_ENRICHMENT_NOT_COMPUTED` /
  `SOURCE_EVIDENCE_NOT_SEALED`. Original seals and frozen Report core unchanged.
- No frontend, protected strategy, migrations, source data, engine wheel,
  production flags, dev/main or remote push changed.

## 2. Real HMD source proof

Approved reader **0.1.0rc3**, manifest
`f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47`.
Explicit index uses all **29 current namespace symbols × seven intervals**:
`1min`, `5min`, `15min`, `30min`, `1h`, `4h`, `1d`.
One sequential one-minute pass per symbol, bounded 31-day chunks; UTC nonempty-bin
presence matches the installed reader's target resampling. No OHLCV values stored.

- Revision: `f071401914c2734171308903cd6390422ac53a99a38dd3f89a8f52699a9a1374`.
- Source clock: **1790895894892 UTC ms**; requested interval 2020-01-01 through
  2026-10-02 clipped to source partition spans and the observation clock.
- **203 entries / 28,932,931 target-interval bar observations / 54,983 bytes**.
  The sum counts each interval separately, not unique one-minute bars.
- Public catalog JSON: **140,109 bytes**; below the one-MiB BFF bound.
- **21/21 independent target-reader comparisons PASS**: BTCUSDT Jul–Aug 2026,
  BNBUSDT Feb 2020, BTCUSDT_210326 Feb–Mar 2021, across all seven intervals.
  Example 1h counts: **1,488 / 472 / 1,216** respectively; exact first/last agree.
- Private source-oracle receipt SHA-256:
  `66c8ff998b3fba8dd50b376e3d9504bfd0d245c4d2d2d35f045509de6300ee36`.
  Located under Bobby's private `2026-10-01-b7` operator state, not in Git.
- Current real target intervals have no internal timestamp gaps. Synthetic
  tests prove gap counting and missing warmup. **No invented real gap receipt**.

Quality means target-bar gaps between observed first/last, within the declared
index range. It does **not** certify full constituent-minute completeness,
listing/expiry history, raw duplicate records or a session calendar. Aggregate
`symbols[].quality` is typed `HMD_QUALITY_IS_TIMEFRAME_SPECIFIC`; FE uses the
selected `coverage_by_timeframe` metrics. `as_of` must stay visible: this explicit
operator is not a streaming market-feed or a GET-triggered background writer.

## 3. Source inventory: data exists ≠ Portal adapter qualified

The HMD release manifest includes `binance_perpetual_spot_quarterly`,
`binance_metrics_orderbook`, `vn_stock_daily`, `vn_derivatives_continuous`,
`vn_daily_matrix`, `binance_daily_matrix`, `vn_futures_1m` and Deribit products.
The installed source module exposes crypto spot/quarterly, metrics/book, VN
stock/futures/derivatives/matrix classes. Some Deribit products require reader
rc4/rc5, while this approved runtime is rc3.

**Do not claim these datasets are absent from HMD.** Portal currently qualifies
only its Binance futures OHLCV provider/calendar/profile. DR-03 still needs
source-specific Portal adapters and truthful inventory/activation compatibility.
We do not mark a route runnable merely because a loader class exists.

The installed `CryptoBinance1m` exposes `load`/`load_resampled`, not official
tick/lot/multiplier/listing/expiry metadata. New `instrument` fields therefore
remain null with `HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED`, origin explicit.
No `_YYMMDD` or symbol-suffix inference. Legacy `contract_kind` is retained as a
V1 namespace hint; it is not upgraded into an official instrument fact.

## 4. Tests and DR status

Focused Python **18/18**: gap/closed edge, warmup/range, deterministic hash,
retry/corruption, bounds, source drift, single-pass resampling, cache invalidation,
signed/unsigned private route and no HMD loads on GET.
Focused Control API and contracts results plus the mandatory hook are recorded
below only after execution. Fixtures are explicitly synthetic, not real-source
or product receipts.

| ID | Delivered in this slice | Still required |
|---|---|---|
| DR-01 | Immutable bounded timestamp index, source-binding, cached public read | Preview/API receipt below; source-specific expansion tracked by DR-03 |
| DR-02 | Existing canonical lower-case intervals preserved | None in this slice |
| DR-03 | Actual source inventory documented, qualified Binance unchanged | Other Portal dataset/calendar/profile adapters; no claim that source lacks data |
| DR-04 | Search/kind/timeframe/keyset, exact total or typed partial | Real preview paging/isolation receipt |
| DR-05 | Checked installed reader; official instrument facts typed absent | Official source adapter, never guess |
| DR-06 | Exact per-timeframe target-bar quality; synthetic gaps | No source with a real target gap found; no fabricated proof |
| DR-07 | Named exact window/warmup metadata before admission | FE binds windows; final preflight stays authoritative |
| DR-08/09 | Not delivered by this slice | Profile-aware fold/conditions estimate and admission-compatible constraints |
| DR-10 | OpenAPI/types + four canonical fixture states | Whole S02 declaration → new WFO/P04 run and browser acceptance remain open |

## 5. Exact handoff to Claude

Generate with `npm run generate:research-dataset-index` in `packages/contracts`.
Use `components` / `operations` from `generated/research-dataset-index.d.ts`:

| Operation | Same-origin route | DTO |
|---|---|---|
| `researchDatasetCatalogGetV2` | `/api/v1/research/datasets/catalog-v2?workspace_id=…` | `DatasetCatalogV2` |
| `researchDatasetSymbolsGetV1` | `/api/v1/research/datasets/{dataset_id}/symbols` | `SymbolPage` |
| `researchDatasetBarMetadataGetV1` | `/api/v1/research/datasets/{dataset_id}/bar-metadata` | `BarMetadata` |

Symbol query: `workspace_id`, `q`, `kind`, `timeframe`, `limit` (1–200),
opaque `cursor`. Keep filters/limit/workspace identical when continuing a cursor.
Bar query: `workspace_id`, `symbol`, `timeframe`, `start_utc_ms`,
`end_exclusive_utc_ms`, `warmup_bars` (0–100,000). Call per declared window;
debounce user changes and ignore stale response generations. No client-derived
bar/warmup counts or fake listing boundary. Metadata availability is not permission
to create a run; existing preflight/admission remains the server enforcer.

V1 is still `/api/v1/research/datasets`; do not send v2 shapes through its client.
Do not modify the accepted rich composition, browser design or frozen Report core.
S04/S09 absence text reads the new generated `EnrichedAnalysisAvailability`,
not a frontend-created reason. Canonical fixtures live in `packages/contracts`.

## 6. Preview acceptance journal — supersedes initial pending record

**B7 index/BFF slice PREVIEW_ACCEPTED**, code `8829f7a0`, 46 files,
**+4,988 / −19** (includes generated contract/fixtures, tests and docs).
Required hook PASS: contracts **215/215**, Control API **1,429 pass / 1 skip**;
route census **247 / zero collisions**, N29/EDS static digests unchanged,
protected strategy hash unchanged. Focused Python **18/18** and independent
reader oracle **21/21**, plus three window/warmup checks, PASS.

Rebuilt only Control API/Python backend, then used the existing preview helper.
Its migration/bootstrap jobs exited 0; no new migration was introduced. Same
web image before/after, no frontend build or modification. The short readiness
retry observed one gateway 502 while nginx re-resolved backend addresses, then
the ready gate and all API requests succeeded.

| Preview component | Exact running image |
|---|---|
| Control API | `sha256:9f5c0c0ff834f978c70b3971970fcecbb36cfa548a90a7ae930ddebe3b770ed1` |
| Python API / existing worker service | `sha256:d18a3196653bdcfc754884b46b259293c805563e19cc87a7cc45c5c4f552818e` |
| Frontend (unchanged) | `sha256:10311d69db2b481d85b9e2a6945c8d8106a6060be646949e280e3516a5f23fa2` |

Before publication: v2 catalog returned 29 source symbols, **typed
`HMD_METADATA_INDEX_NOT_BUILT`**, empty coverage arrays and null clock, not fake
available data. Published the exact verified 54,983-byte immutable index into
this preview's artifact volume; no second source scan. Operator retry returned
the same revision and one stored revision, no duplicate storage.

**46/46 real same-origin GETs PASS**, via the owner-approved preview identity:

Automation uses the existing preview-only auto-login `GET /api/auth/context`;
the receipt verified `AUTHENTICATED` and retained its cookie privately. No Bobby
password/reset/grant or automation-account password file was changed. An old
password login failure is not a blocker for this approved preview lane; do not
claim that the old password itself was repaired.

- V2 full catalog matches the independent source-oracle document exactly;
  V1 remains the V1 shape. 29 symbols/203 interval records, bounded JSON.
- Three keyset pages exhaust exactly 29 distinct symbols; changed filter/limit
  cursor is 400, foreign workspace 404, unknown dataset 404. `q` + timeframe
  filter has the exact source-derived total.
- 21 window counts/edges agree with independent target-reader checks. Separate
  BTCUSDT 1h windows: IS **744 + 100 warmup**, OOS **744**, Holdout **720**.
- Unaligned boundaries/excessive warmup are 400; unindexed symbol/out-of-range
  window stays null/typed absence, not zero. Reads do not admit/create a run.
- R-WFO-020 and R-P04-021 Evidence/Report carry typed enrichment availability,
  same supplemental block and **304** conditional Evidence reads. Frozen Report
  cores equal the prior B6 real receipt, byte-for-byte field parity.

Private real API receipt **file-byte SHA-256**:
`a2dac63c8756e9307f7e1e1c9705a594dfa2ee411cef226bef8e5d3fffb19716`.
Its separately canonicalized object digest (not file-byte hash) is
`87ae7d3898eaa0cb7527f68f9f58f93fa0b3e424ce4921ca24f2094d769872f5`.
Three-window oracle receipt byte hash:
`09a6db8341ee071587124eb46b95eaae5eee7b6c885c26a03437855dcec183b8`.
Private state remains outside Git; no cookie/principal, raw price or credential
is included in this public handoff.

C4: isolated gate containers cleaned by their EXIT traps; no matching test cell
left after the hook. Preview services healthy, retained volume/source intact;
HMD bind inspected **read-write=false**. Approx. **214 GiB disk free / 15 GiB
RAM available**. Keep the preview and rollback images; no global prune, source
or business deletion, unrelated agent restart, remote push or production change.
The Docker build reported four existing high-severity npm advisory findings;
dependency changes were not smuggled into this data contract slice. Triage/pin
belongs to the pending P23/P24 candidate security qualification, not a silent
`npm audit fix` or a claim that security acceptance is complete.

### Consumer wiring still required (read-only audit of Claude's WIP)

Read-only audit at Claude's newly landed **`138300f1`** (preserved during rebase):
`datasetClient.ts` still calls V1 `/datasets` and normalizes
unknown proposed v2 extras. It will **not** see this new v2 data until switched
to the named generated client in §5. Replace proposed/manual wire types with
the published `DatasetCatalogV2` / `SymbolPage` / `BarMetadata`; supply workspace
to symbol search, preserve refusal/partial reason instead of silently presenting
the old list as complete. Read quality from the selected interval, not aggregate
unknown `symbols[].quality`. Wire window/warmup metadata without assuming it is
fold/profile/admission acceptance. No Codex frontend path was changed.

DR-01/02/04 and the scoped DR-06/07 backend foundation have actual proof now;
**DR-03 expansion, DR-05 official facts, DR-08/09 and complete DR-10 remain open**.
Browser/S02 new-run acceptance remains Claude's next consumer task, not implied
by source or fixture gates. Next backend: DR-08/09, DR-03 qualification, executor
v2, audit-of-selection/exposure and whole-candidate P23/P24, in queue order.
