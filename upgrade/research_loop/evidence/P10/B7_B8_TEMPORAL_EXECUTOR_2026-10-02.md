# B7/B8 — declaration conditions and temporal executor

Date: 2026-10-02 UTC. **IMPLEMENTED; PRODUCT API RECEIPT PENDING.**
This packet does not close whole-candidate P23/P24 or the remaining audit lane.

Continuation also adds the T14 WFO writer: execution completion and actual OOS
range from the adapter's source manifest/folds, `PORTAL_ADAPTER_ENGINE_CALL_COMPLETED`
basis (NOT an engine first-read claim), source-attested SELECTION_INPUT/OUTER_OOS,
server producer snapshot digest, locked live lease, same-transaction seal +
append-only exposure + audit. An identical seal retry writes neither twice.
Old output missing the clock/role fact remains absent; no invented backfill.

## Declaration and source facts

`researchDeclarationEstimatePostV1` computes P08-compatible folds/window counts
from verified indexed timestamps only: no OHLCV scan, preflight token or run
authorization. Session, Origin/CSRF, workspace and server AlphaVersion warmup
precede source access. Bounds: 100,000 timestamps; 64-entry/30s process cache,
keyed by source revision, full spec and declared warmup.

Spot and quarterly use distinct installed HMD loaders. Seven intervals compared
against their installed direct readers on Aug 1, 2026 real read-only history:
**14/14** pass. VN/session, options and feature datasets are not implicitly
OHLCV-qualified. Safe index append preserves old coverage/source clock; it cannot
relabel old coverage fresh. UTC unaligned edges return `WINDOW_BOUND_NOT_ALIGNED`
before source I/O. Warmup count is measured within declared lookback and capped
at the required count; it does not mean all history preceding start.

## Executor and additive contract

New profile `p10.delta-signal-notional-wfo.v2`, exact digest
`d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0`.
Migration 084 adds the pair without changing prior pins or rows. Delta/global
v2 supports weekly/monthly/quarterly, expanding/rolling train width and label
horizon/purge/embargo. Admission, envelope, isolated child, progress and P05
retention share the same pin. V1's profile digest remains unchanged.
Inner/per-fold causal selection is explicitly not admitted by this global
retainer; preflight exposes the same admission refusal, not `may_create_run`.

Atlas adds `requested_spec_versions`, `seed_policy`, `trial_default`,
`early_stopping_policy`, `frequencies`, `window_modes`, `inner_validation`.
Library adds `enriched_analysis_availability`, distinguishing unsealed source
from a sealed WFO missing enrichment even without a Hub projection. No zero-fill.

## Executed child/retention evidence (not product API evidence)

QuantBT 1.1.1 / HMD 0.1.0rc3; BTCUSDT 1h, 2026-06-01..07-15,
first OOS 2026-07-01; `test_research_temporal_executor_real_hmd.py`:

| Fact | Actual |
|---|---|
| Bars / folds / optimizer trials | 1,056 / 2 / 3 |
| Window / temporal guards | rolling 14D / horizon 1, purge 2, embargo 3 |
| Child CPU / wall | 5.143 s / 5.277 s |
| Retained rows | 1,056 observations, 2 folds, 3 trials, 1 candidate, 1 selection |
| P05 manifest digest | `e7be8dff80686b5136992bec57fdba66e4bcf2141e4d547cfbac0bef828f3b7a` |

Assertions inspect real config/source-published guards and seal/page all five
tables, <=200 rows/batch. Focused conditions/admission/index/enrichment **38/38**;
Library mapping **25/25** before its extra absence regression; index/append
**19/19** after correcting a misplaced test assertion. Mandatory hook/PG results
are appended after execution only. Earlier hook stopped at the new test's fixture
root in Docker; it now respects `PORTAL_CONTRACTS_DIR`. That failed run is not PASS.
The next hook reached contracts 218/218 and Control API 1,449 pass / 1 skip,
but stopped on an old display-label assertion expecting only two shipped
profiles. It is corrected for v2; WFO v1/v2 now share a display ordinal partition
to avoid duplicate R-WFO labels. No failed hook is represented as success.
Exposure focused tests: Control API 30/30; Python 9 pass / 1 opt-in skip;
source observation missing-clock/role, UTC range and sealed retry all exercised.
The following hook reached 1,453 pass / 1 skip and found one old RS-02 PG
fixture with no live job/worker parents. Its repair adds those parents and
exercises the real runtime role: seal + one exposure/audit, identical retry,
expired lease refusal, then release of the test-only heavy slot. Focused
disposable PostgreSQL retake: **10/10 PASS**. No production fence was relaxed.

## Claude handoff / next gates

Preserve `b5f180e8`'s named catalog/symbol/bar-metadata consumer. Consume generated
`DeclarationEstimate` / `researchDeclarationEstimatePostV1`; render conditions
inside existing S02 composition, still use actual preflight `run_admission`.
Choose Atlas profile by requested-spec version; seed/default/early-stop policy
are server facts. Bind Library `enriched_analysis_availability` without invented
reasons. No frontend/baseline, protected kernel, production or remote change.

Next: mandatory hook/landing and real API v2/fixed receipts; remaining calendar-
correct HMD qualification; pinned-selection audit/exposure; one final P23
candidate then P24/release rehearsal. None are silently marked complete.

### Candidate build correction

Source landed at `00bf0762`; mandatory hook PASS (contracts 218/218,
Control API 1,454 pass / 1 skip). The first clean-image build then caught a
generated-contract regression: `WINDOW_BOUND_NOT_ALIGNED` had expanded the old
P08 error union and broken Claude's exhaustive frontend refusal map. Correction
isolates this fixed-copy error in the metadata operation family and its own
Problem schema; P08's accepted vocabulary is unchanged. No frontend file is
edited and the failed build is not an acceptance receipt.

### Actual preflight correction

Clean candidate `36420654` built and started with all seven services healthy.
The first v2 product preflight passed its 17 source/declaration gates and built
two rolling folds, but run admission returned false: the fold-count helper
still compared every source topology to W1's weekly/expanding constants. Its
unit fixture had also defaulted to that old topology, hiding the error.
The correction binds source frequency/window mode to the admitted request;
W1's earlier exact-set check stays unchanged. Regression fixtures now carry
actual rolling/monthly/quarterly topology and refuse mismatched source shapes.
No failed admission is counted as a completed run or product receipt.

### Source namespace and retained audit readback

On `36420654`, metadata BFFs pass 14/14 for Spot BTCUSDT and Quarterly
BTCUSDT_260925 (Aug 1..Sep 1 × seven intervals), and namespace-crossed cursors
return typed 400. Declaration API passes 2 folds/20 conditions/300 warmup bars;
UTC-misaligned 400 creates no job (196→196).
The v2 expanding product probe `rrun_78d9ef519a64da31aa2fe086cd21b6f7`
completes READY and writes one SELECTION_INPUT exposure with the producer's
snapshot hash. Spot probe `rrun_6b076ba549a4f8ffef4307afcc2cfeab` also completes.
Quarterly probe `rrun_73bb0981470c1468ad92dd6ed3ff08cd` fails at current-source
seal after retryable private refusals; it is NOT execution-qualified yet.

The v2 RC read still selected the P04 lane because the repository recognized
only v1; its historical parameter-kind registry also lacked the new v2 digest.
This correction adds the exact v2 registry entry without deleting v1, loads
the retained lane only for verified profile/digest pairs, and lets report
repair use those same exact pairs. It never promotes a diagnostic into audit.
The P13 Hub is still a separate reader from WFO current-source Evidence;
its absence is not relabeled AVAILABLE. Bounded SQLSTATE-only diagnostics
for private 503s log no SQL, rows, credentials or raw exception text.
