# B6 — shared all-time `enrich_analysis`

Owner request: Bobby, 2026-10-01. Detailed authority:
[ER-01…10 spec](../../ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md).
This receipt closes only enrichment, not the aggregate P23/P24 campaign.

## Implementation

- One pure Python builder consumes immutable retained OBSERVATION/FOLD rows or
  the historical fixed passport. Existing analytics/distribution arithmetic is
  reused; GET never starts Python, HMD access or a strategy/optimizer run.
- Migration **083** adds `research.enriched_analysis_v1`: append-only, UPDATE/
  DELETE trigger, runtime SELECT-only. Identity binds workspace/run/source kind,
  original revision/import digest and canonical enrichment SHA-256. Source-time
  ingest writes the companion in the source transaction. Operator backfill is
  explicit `--dry-run` / `--apply`, verifies original receipts/ordinals/counts,
  and uses the same builder. Retry validates the existing document; no overwrite.
- Public reads verify document hash/run and latest source revision under the
  existing scoped read transaction. Library uses one lateral join, not N+1
  source reads. Corruption produces the domain's typed 503. Absence remains
  absence on old/unbackfilled sources; no invented zero.
- All-time OOS curves, ≤64 extrema-preserving Library points, ≤120 monthly
  points including the first/single partial month, 12 integer daily-return bins,
  ten deepest drawdown episodes, total/open/longest-open disclosure. No rolling.
- The existing wire `last_30d` remains compatible, not relabelled all-time.
  New P04/WFO source-time output gets a full enrichment. Historical P04 uses
  `SAMPLED_RETAINED_EQUITY`; already sealed v2 facts are preserved. Its sampled
  monthly/curve/episodes do not become a full daily/position ledger; histogram
  is NOT_PUBLISHED if only sampled equity survived. Missing benchmark/IS/
  Holdout retains typed reason and locator.
- Report returns a **top-level supplemental block**. Original frozen core,
  report revision, exports, source seal and prior 081/082 companions are not
  modified. Enrichment affects relevant public ETags, not unrelated source
  Freeze/Replay identities.
- A long-P04 regression found legacy v1/v2 display curves could exceed the
  existing core budget. Future-source fitting coarsens display curves only;
  scalar facts/counts/digests stay, legacy core stays ≤24 KiB and enrichment
  has its own ≤64 KiB compact budget. No historical passport rewrite.

## Gates and runtime status

**CODE_READY; mandatory hook / preview receipt still pending at this record.**
Results will be appended below after actual execution, not presumed.

- Focused existing reader tests: 62/62 before the new cases.
- New schema tests: Control API 5/5; contracts 4/4.
- Pinned Python combined builder/child/retainer tests: 30 pass / 2 optional skips.
  These are synthetic/regression gates, not a product/real-HMD receipt.
- TypeScript build passes. Generated four consumer surfaces and contract
  snapshot updated. Disposable PostgreSQL migration/immutable-grant tests are
  part of the mandatory hook; running them without a test DB only established
  missing test infrastructure, not a migration result.
- Pending actual-image checks: old R-WFO-020, newer R-WFO-023 and historical
  P04 dry/apply/retry; all-time Hub/Library/monthly/distribution/Report read;
  unchanged original source and frozen-core hashes. No optimizer re-run needed
  for those existing immutable rows. New source-time ingress has focused tests;
  actual new-run receipt must not be confused with an old-source backfill.

## Claude handoff — exact wire paths

Use generated `components["schemas"]["EnrichedAnalysis"]` in:

- `packages/contracts/generated/research-current-source.d.ts`:
  Evidence **`enriched_analysis`**.
- `packages/contracts/generated/research-evidence.d.ts`:
  EvidenceHub **top-level `enriched_analysis`**, not `core.enriched_analysis`.
- `packages/contracts/generated/research-report.d.ts`:
  ReportDetail **top-level `enriched_analysis`**; keep old frozen core visible.
- `packages/contracts/generated/research-run-library.d.ts`:
  RunLibraryItem **`analytics_all_time`** (= shared `library_summary`).

Canonical synthetic fixtures (not real run receipts):
`research-enriched-analysis.{healthy,no-benchmark,partial-month}.valid.json`.
`research-enriched-analysis.old-seal-absent.valid.json` is an absence guard
fixture, **not a complete Evidence/Report response**. One-month FIXED fixture
declares sampled coverage; no fabricated complete daily histogram.

Bind integer `return_distribution.buckets[].count` in the new block. Legacy
named histogram routes still return string counts for compatibility. Use
`monthly_returns.values[].partial`, counts/basis and declared coverage. Dates
are UTC milliseconds; exact decimal strings stay strings. IS/Holdout have no
payload and remain NOT_PUBLISHED. Do not infer values from the label or turn
typed absence into zero; no frontend design/baseline is changed by Codex.

## Remaining scope

Metadata index/BR-F4-02…08, requested-spec v2 executor, linked audit/exposure
writers, aggregate P23/DR/browser/identity qualification and P24 remain open.
No remote push, dev/main merge or production action. C4 records appended with
actual runtime results; active preview and other agents' resources protected.
