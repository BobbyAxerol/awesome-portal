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

## Preview acceptance — 2026-10-01 (supersedes pending record above)

**B6 backend PREVIEW_ACCEPTED**, not frontend/browser or production acceptance.
Implementation landed on the shared Research branch at `d16058ee` after rebase
over Claude `320c361d`; all Claude code/docs preserved. Its mandatory hook:
contracts **210/210**, Control API **1,419 pass / 1 optional skip**, including
real PostgreSQL migration/grants/source-bound writer tests **10/10**. Pinned
builder/child/retainer regression: **30 pass / 2 optional skips**.

An actual operator dry-run caught a new CLI bug: `requested_spec` was read as a
producer column that does not exist. Corrected to the original immutable
`legacy_request.research.requested_spec.data.timeframe`, so expired preflight
rows cannot erase the cadence. The exact two CLI queries are now shared and
compiled by PostgreSQL regression tests. This error wrote no sidecar/source
data. Backfill acceptance below used the corrected host CLI plus the pinned
preview Python image; final commit/image follow-up is recorded below.

### Actual data/API proof

Migration 083 applied on owned preview :8095 only. **14/14** dry-run → apply →
idempotent retry, and **14/14** real same-origin API reads PASS: twelve sealed
WFO plus R-P04-018/021. Evidence, named monthly/histogram, Library and supplemental
Report read the same canonical SHA-verified document; Hub conditional GET **304
for all fourteen**. GET runs no analytics process/source fetch.

| Run | Retained coverage | Monthly | Daily histogram | Episodes / Library |
|---|---|---|---|---|
| R-WFO-020 `rrun_3258a4c450816129d2d285f25b801061` | 1,440 OOS / 9 folds | June + July; partial disclosed | 59 UTC daily returns | 18 episodes, longest open; 53 all-time spark points |
| R-WFO-023 `rrun_3d5633d2adb712722fe4ba108102aa5d` | 1,488 OOS / 9 folds | July + August; July partial, August complete | 61 UTC daily returns | 44 episodes, longest open; 58 all-time spark points |
| R-P04-021 `rrun_ece579eb6e0538ab5508f154fd3deb23` | 25 retained samples / 744 original OOS bars | July, partial, expected 744 / observed 25 | NOT_PUBLISHED: no complete daily ledger | 1 sampled episode; 25 all-time points; original sealed v2 facts preserved |
| R-P04-018 `rrun_464bf9c3dd8979af87e44388ea6910ef` | 25 retained samples / 744 original OOS bars | July, partial, expected 744 / observed 25 | NOT_PUBLISHED: no complete daily ledger | 1 sampled episode; 25 points; unavailable metrics retain reason/locator |

Independent raw OBSERVATION/FOLD oracle passed on all twelve WFO: OOS count,
every month's arithmetic/population, calendar-daily histogram population/bins,
top-ten deepest drawdown dates/depth/recovery, episode total/open state and
all-time Library first/last bounds. Original seal summaries, fixed passports,
081/082 companions and Report frozen-core digests unchanged on all fourteen;
Freeze/Replay authority content unchanged. P04 Freeze already publishes a
read-transaction `as_of_utc_ms`: its whole-response hash changes with that
clock, not B6. The check recovered **only** the old clock within the captured
five-second window and matched the exact original hash; all other bytes were
unchanged. No loose omission of arbitrary fields or rebaseline.

R-WFO-020 now publishes retained turnover rather than copying the v1 display
scalar. `sharpe_decay` remains `PORTAL_ANALYTICS_IS_OR_OOS_SHARPE_UNAVAILABLE`,
locator `quantbt.full_report.sharpe:sealed_IS_minus_OOS`: no retained IS account
is invented. R-P04-018 missing metrics use
`P04_RETAINED_SAMPLED_EQUITY_HAS_NO_COMPLETE_ANALYTICS_INPUT`; benchmark/hit-rate
absence uses `AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED`. Historical P04 histogram
uses `P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER`. These are input
limitations, not pending endpoint implementation. New-source wiring has the
pure builder and real-PG writer gates; **no new optimizer/backtest was run** in
this slice, and existing R-WFO-023 backfill is not called a new-source run.

| ER | Verdict / proof |
|---|---|
| 01 | Shared pure builder; deterministic bytes/digest and pinned-source regression PASS |
| 02 | Append-only 083, runtime table SELECT/no INSERT/UPDATE/DELETE, narrowly source-bound write procedure, hash-on-read; PostgreSQL PASS |
| 03 | First/single partial months; R-WFO-023 July/August and both P04 July points PASS |
| 04 | All twelve historical/newer WFO panels available after explicit companion backfill |
| 05 | Library `analytics_all_time` exact document parity, all-time range ≤64 points; PASS |
| 06 | Top-ten episodes/total/open plus sampled/full coverage; independent oracle and open regression PASS |
| 07 | Per-fact origin/input digest/reason/locator; retained turnover and truthful absent sharpe decay verified |
| 08 | Same builder, both P04 Hubs top-level supplement, monthly partial and sampled-coverage disclosure PASS |
| 09 | Canonical healthy/no-benchmark/partial-month/absence guard, schema/OpenAPI/four generated types; contracts PASS |
| 10 | Fourteen existing immutable runs, dry/apply/retry/API/oracle/source-immutability receipt PASS |

Private receipts: `/home/bobby/.local/state/portal-research-be-gaps/2026-10-01-b6/`
(0700 directory; JSON 0600). Full API bodies/operational inputs stay private.
SHA-256:

- before: `1f4e98b041c094da4023f84e7db7fe8529fe3e51a7f3308ba0fb22d759adc187`;
- apply: `7ede1e04925d9516bce9b557a9ec8357f8ac2eb522b0f2dcd4aa41c6963f218f`;
- after: `83480490cb81ed3c7cb12552f91a45ac3a9ac24abc596c57969653aff4bdbb95`.

Initial accepted backend candidate `d16058ee`:
Python API/worker `sha256:a4d6c7b2e61247fd93eccf3d01d69e963bacf06426a30801e24954a356d187f1`;
Control API `sha256:30d337da8e774b16bb06a18cae13c9684163b2381c390bb40ed89dac2886867f`.
Claude independently rebuilt the frontend during the gate; Codex did not edit
or build it. His running web `sha256:d654f5cfebe621101a115a736b8b8747ab03d1ba737f48304bb7c50eb958c222`
(created 17:37:33 UTC) was retained by the backend refresh at 17:44 UTC.

### Claude: backend is available now

Consume the generated fields/fixtures in the handoff above, including all-time
Library, P04 top-level supplement, integer histogram counts, partial-month
population/basis and drawdown episodes. Preserve the rich composition and
typed absences; `last_30d` is deprecated UI truth here, not relabelled. On S09
show enrichment **alongside** original immutable Report core/export provenance.
Real preview backend now returns these facts; browser/visual consumer acceptance
belongs to Claude, not this backend receipt. Other queue items remain open.

### Gate follow-up and C4

The query regression's first assertion used `EXPLAIN.rowCount` (PostgreSQL
returns null for that command). This test-only failure was corrected to verify
the returned query-plan rows; it is not an API/migration/source-data failure.
The failed hook's disposable node/PostgreSQL containers and network were
removed by its EXIT trap. Source/API acceptance above remains recorded
separately; a commit is not accepted with a failing hook.

Read-only capacity observation: root **219 GiB free / 65% used**, about **14 GiB
RAM available**. Docker: images44.19GB, build cache104.1GB (28.7GB reclaimable),
volumes106.2GB. Deploy runner active. **NO_ACTION_NEEDED** for broad cleanup:
existing caches/rollback images, active preview and other agents' stacks stay.
No business/source data, runtime volumes, secrets or accounts removed.
Phase-created test cells are owner-trapped; exact final check/commit/image and
capacity evidence are kept with the private API packet in `final.json` under
the directory above. The CLI/query follow-up does not change analytics math or
require another Python/optimizer/frontend build. Only Control API is refreshed.
