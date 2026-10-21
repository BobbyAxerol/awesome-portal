# C5 — selected financial source bridge / producer review for Claude

21 October 2026, 15:50 UTC. **SOURCE_REVIEW_CHANGE / SOURCE_MAPPING_REQUESTED**.
Within ELP2-10 and campaign §10.13; Claude owns remaining Portal backend and
frontend, Codex independently reviews/integrates, PM/TS own economic semantics,
Edge owns transport/projection. No source qualification or runtime activation.

Pins: integration `432da03d916166a95cdd10c6f430d6d8daf6374d`, Claude
`3394b04f868059f58a79077b197f1fb9869f6572` → documentation-only `eb498116`;
financial source/measurement artifacts agree. Source PM owning rules are
[the received PM ACK, C5](PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md).
This is not a claim that currently mounted financial data is corrupt: selected
normalized financial source still remains MISSING/unqualified.

## ACCEPT / CHANGE with code locators

Source locators below are in `/home/bobby/portal-elp210-landing` at the pin above.

**ACCEPT:** dataset and series share exact-decimal `managerPartitionTotals`;
series preserves partition/basis/window and refuses incomplete documents or
inconsistent cuts (`manager-series-observation.ts:97–138`,
`manager-series-materializer.ts:93–105,134–173`, `manager-series.ts:42–74`, under
`apps/control-api/src/execution-v2/`). No FX/carry-forward/fabricated ALL/RETURN.

**CHANGE before selected financial admission:**

| Missing proof | Current locator / consequence |
| --- | --- |
| Trusted source identity, economic leaves, original content identity | `manager-model.contract.ts:61–68`; `fact_id` / Portal economic refs do not prove source identity/disjointness |
| Duplicate/conflict/overlap semantics | `manager-model.ts:69–77,110–119`: fact-ID dedupe and snapshot ownership dedupe do not guard different NET_PNL facts with overlapping economic leaves |
| Expected source/economic census | `manager-model.ts:123–145`: tuple coverage is not the expected economic source/valuation population |
| Economic/cashflow/valuation/ownership revisions, full cost coverage and correction provenance | Current opaque methodology/document revisions do not supply those source-owned facts |
| Aligned valuation cut | Dataset `manager-model.ts:93–94` and series observation113–124 differ in what valued facts they check; do not infer NET_PNL valuation semantics from an arbitrary timestamp |

PM rule: at the same cut/currency/basis/environment, same trusted source ID
and equal immutable row counts once; changed content conflicts; different
identities with overlapping leaves refuse; only validated disjoint sources
add. Missing expected source/valuation remains null/PARTIAL. Physical-account
equality, equal money or different Portal fact IDs proves neither duplication
nor disjointness. Cumulative snapshots are not events to sum across time.

## PM/Edge return: one exact selected-producer mapping

Return source contract/revision/locator plus genuine reconciled examples, or
typed NOT_PUBLISHED with source locator. This table states required semantics,
**not proposed producer column names or invented mappings**:

| Input | Owning evidence required |
| --- | --- |
| Trusted row identity | Source-ID namespace/lifetime, immutable content comparison and correction rules |
| Economic leaves and census | Leaf identity grammar, expected identities/population, overlap/disjointness and missing-source treatment |
| Shared-account attribution | Logical/physical scope, original/effective ownership history, assignment/owner digests and current access |
| Valuation/window | Effective/recorded/valuation cutoffs, source/model revisions, window/origin and all-time semantics |
| Comparability | Currency/basis/environment/venue/mode, explicit FX policy if any |
| Economics/costs | Economic/cashflow/valuation/ownership revisions, methodology, included/missing fee/funding/interest/borrow/slippage/other cost layers and denominator |
| Restatement | Original/corrected/restated source relation and content provenance |
| Portal refs | Accepted bridge, or typed absence, for `economic_account_ref` and `ownership_partition_ref`; never copy account/deployment IDs by convenience |

The compatibility realized+unrealized+funding−fees producer does not prove all
costs or arbitrary Portal windows/Score methodology. PM's14/28/null examples
are TEST_ONLY, useful for fixtures, not commissioning. This is not a second ledger.

## Claude ACT_NOW — dark strict proposal without waiting on runtime

Reserve these disjoint new paths for Claude under the existing all-backend
assignment, provided its lane has no other writer:

- `apps/control-api/src/execution-v2/manager-economic-source.contract.ts`
- `apps/control-api/src/execution-v2/manager-economic-source-reducer.ts`
- `apps/control-api/test/manager-economic-source-reducer.spec.ts`

Prepare a pure strict proposal and clearly synthetic fixtures from PM's
returned rules. Do not wire runtime, widen existing admission or invent a
producer mapping. One reducer must ultimately serve datasets **and** series.
Existing shared model/series/OpenAPI/generated paths need explicit one-writer
scheduling and producer mapping review before integration.

Focused tests: identical source row once; same-ID changed content conflict;
different-ID overlapping leaves refusal; validated disjoint exact-decimal sum;
missing expected source/valuation/ownership -> typed null/PARTIAL; mismatched
currency/basis/env/cut/window/revision refusal; equal money/physical ID/fact ID
not dedupe proof; legacy unproven input unavailable; reader/writer economic-set
parity. Focused pure specs/tsc first, contract regeneration when an actual
public schema changes; connected proof and final normal remain distinct.

## Budget/calibration / stale handoff corrections

Do not re-ask D1–D7 generically: latest budget proposal §9 records D1–D4
approved, D5 scan1/2/4/8/16tabs, D6 requesting exclusive windows, D7 Codex as
independent calibration reviewer. Those decisions do **not** approve numeric
production budgets/calibration. All15 measurement JSONs retain
`approved_budget:false` / `calibration_evidence:false`; M5/M7 still need their
source-authorized target/config/window/stop conditions. Existing candidate
2CPU/1536MiB cap is correctness-only, not proposed3CPU/2560MiB approval.
Keep original G2/per-feed limits distinct from optional mainnet evidence.

Existing calibration census contains four identical overlapping 14-day OOS
tapes, unknown currency/basis: `RESEARCH_INPUT_NOT_RUNTIME_SCOPE`, not fitting
anchors. Next useful calibration work is a pinned comparable non-overlapping
population and frozen fit/evaluation split, then independent review, not a fit
using fixture constants or a formula change.

Append-only corrections for Claude's current measurement/source handoff:

1. Whole-Fleet snapshot/STREAM operations **already exist** in
   `execution-alpha-fleet-realtime.openapi.json` (BE-P17):
   `executionAlphaFleetRealtimeSnapshotGetV1` and
   `executionAlphaFleetRealtimeStreamGetV1`. Old M3c/window text saying no
   operation is historical. Missing: qualified publication/notices, runtime,
   separate ROOT STREAM grant and connected receipts. Do not build another API.
2. Source request “count each physical account once” is superseded by PM's
   source-ID/disjoint-leaf rule above. Preserve old receipts; correct current use.
3. Old Core-unbuilt/image7b2 notes are historical; use the separate installed
   and qualified pins in the [current Core return](CORE009_CURRENT_TRUST_AND_READ_STREAM_RETURN_2026-10-21.md).
   Built/source-tested is not installed or a fresh eligible window.

No heavy test/build/source mutation for this review. Independent review draft
SHA256 `877bf281c10188224c3d678ff47900094f3c654383bf56ddfa7d1f28baba51d3`
is retained at `/tmp/elp210-financial-source-review-20261021.md`; root verified
the cited reducer/contract and latest decision record. Verification: R0 repo
diff/link/tracking; no financial runtime PASS or ELP2-10 closure claimed.
