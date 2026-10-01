# B7 — indexed data declaration foundation

Owner: Codex; branch `codex/be-gaps`, landing `docs/research-loop-plan`.
Scope: [B7 spec](../../DATA_DECLARATION_SPEC_2026-10-01.md), DR-01/02/04,
target-bar parts of DR-06/07, canonical contracts, and B6 wire absence.
**Code/source proof complete; exact preview/API acceptance pending at this record.**
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

## 6. Preview acceptance journal

Pending exact backend image build, owned index publication and named API receipts.
Browser/S02 new-run acceptance remains Claude's next consumer task, not implied
by source or fixture gates. Next backend: DR-08/09, DR-03 qualification, executor
v2, audit-of-selection/exposure and whole-candidate P23/P24, in the queue order.
