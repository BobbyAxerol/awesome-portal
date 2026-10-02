# B8 — causal/inner profile and actual current-source integration

Continues Bobby-approved group 6 on `codex/be-gaps`, landing only on
`docs/research-loop-plan`; base `8fc17a03`. This is a **scoped backend
qualification**, not full six-group, frontend, P23/P24 or signed-release
acceptance. No new engine version, service, datastore or business authority.

## Delivered semantics

- Additional immutable profile `p10.delta-signal-notional-causal-inner.v1`,
  digest `60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1`.
  Installed QuantBT **1.1.1** already supplies causal/inner execution. Fixed,
  global v1/v2 and imported profiles/digests remain unchanged.
- Admission binds requested-spec v2, Mode 1, `per_fold_causal`, 1h, seed 42,
  actual P08 engine-built inner topology and exact historic adapter digest.
  Required inner folds: 2–16 per outer fold; outer folds: 2–16; **3 trials
  per study / at most 48 overall**, 120 CPU / 240 wall seconds. The separate
  400-trial preview exception never applies to this profile.
- Migration **089** widens only exact producer/profile and current-source
  pair constraints. It updates no historical row/seal, adds no retained table
  and preserves forced tenant isolation and existing worker lease/fencing.
- Child retains actual `params_by_fold`, native study/local-trial identity,
  `fold_selection_table` and `inner_fold_table` before scratch retirement.
  Source-owned study seeds/counts are retained, not calculated by the browser.
  Seven observed inner folds are not confused with a declared minimum of two.
- P05 uses the existing five-table seal. Under its advisory lock, cross-table
  validation joins each selected trial/candidate to its own fold/study and
  exact parameter digest; rejects pruned/stage-mismatched/orphan selections,
    mixed custody, wrong final singleton, shifted outer ranges, contradictory
    causal claims and changed immutable inner controls. Source inclusive end
    timestamps must match the P08 half-open boundary after exactly one 1h bar.
  Every selected and nonselected TRIAL/CANDIDATE must preserve its native
  Stage-A/Stage-B objective domain. Legitimate nonselected trial pruning stays
  valid; a wrong-domain row cannot seal and later break Search/Report.
- A TRIAL objective is inner Stage-A IS mean; a CANDIDATE objective is native
  inner Mode-1 J. They are not interchangeable. Post-selection outcome facts
  explicitly distinguish INNER-IS mean, actual outer OOS and native
  INNER-IS-minus-outer-OOS decay. No all-outer-IS score or trade count is invented.
- Search preserves a complete study-qualified ledger. A causal run has no
  single global ranking, K or theta. Its legacy global surface is typed
  NOT_APPLICABLE; bounded `surfaces_by_study` exposes each actual study's own
  points/distributions/grid and selection without pooling objectives from
  different training populations. Pool scope is `PER_FOLD_STUDY`; run-global
  K/rule remains typed absence. Global-profile behavior stays unchanged.
- Search/Freeze singleton selection and declared-space values mean
  `LAST_FOLD_DEPLOYMENT`, not run-global theta. Replay segments and Report
  rows carry each fold's own parameter map/digest. Stage 4 validates the own
  selected generation candidate; it cannot apply a global candidate to every
  fold. Data-time causal verdict is distinct from unavailable engine clocks.
- Library never treats INNER candidate OOS summaries as outer-run OOS.
  Compare/Lineage use complete outer-fold facts or existing separately scoped
  all-time analytics; causal decay definitions spell out their metric basis.
  No partial fold mean masquerades as a complete run statistic.

## Actual owned product proof

Cell `portal-research-p23-ol12`, loopback **8096**, workspace
`ws_06GE6XY0SKNPFS7TP8WCE938Z5`. Read-only HMD **0.1.0rc3** historical
store. The existing `p23-owner` anchor is reused; no credentials reset or
retired-account reactivation. Private receipts are 0600 and not committed.

Real producer **`rrun_becde1e160a2770d49246f7f665208ce`**:

- Dataset `crypto-binance-1m`, symbol BTCUSDT, target 1h; June 1–July 15 UTC;
  first outer OOS July 1; weekly expanding outer and weekly rolling 14D inner.
- P08 → P10 → isolated child → P05 → named authenticated APIs completed
  **COMPLETED / READY**. Actual 2 outer folds, 6 trials, 2 candidates,
  **7 inner folds (3 + 4)** and 1,056 retained observations.
- Fold 0 selects `study_0.trial_2`, parameter digest
  `f55b08613f88f29ae18cc0f302e7d81d1a7026ad608b336a64f1129f2c88d1f2`.
  Fold 1 selects `study_1.trial_2`, digest
  `71272c0fefb23ce13e59ab734551ca9d825a0170e45524a715407aa6690698ac`.
  Parameter sets happen to differ in this run; the validator does not demand
  difference from a legitimate optimizer outcome.
- Exact P05 manifest
  `e9eab661bf110bf4b4e112764f09c2d3aa43c595edf5a8ddb03d93f1ff218ad2`;
  normalized retained import
  `b7fd04ec13c6dd566cd10714f9a759f1d123b0662a2fbb2ac6cdc04ec33b7321`.
  The source transform hash is a separate domain, not either of these hashes.
- Hub, Evidence, Split, Search, Freeze, Replay, Report, Compare and Lineage
  all returned **200**. Independent retained-DB-to-named-API oracle verifies
  exact producer/request/effective/dataset/profile/seal identities, complete
  trials, own-fold selections/inner ranges, Replay params and Report basis.
  Both selected OOS generation children match their own candidate.
- Engine freeze/first-OOS-read wall clocks remain NOT_PUBLISHED. P11 clocks
  remain explicitly orchestration. Compare may choose its separately scoped
  all-time OOS metric; no outer-mean field is fabricated to force an assertion.

The first functional receipt used diagnostic images Control
`sha256:ff8e2fcabf75082398fede46be8477ab64109f9ecfa7599e036d72947e1a819f`
and Python API/worker
`sha256:7ea5e0ab4532506333f1c4b53a050fd32310c5cddc637190c5f554c61d0d0905`.
Identity pins source `8fc17a03` with **dirty=true**; this is not a clean/signed
P23 candidate. Subsequent Control-only corrections reuse the completed run,
without another engine run; final read/negative image and hashes are recorded
below before commit.

Final read/negative Control image:
`sha256:55a50647d3c0e2618e81df55124593c4f49bcab2c2f477dbf1ae98ecbc07ae79`.
Python/worker image remains exactly the above source-time image. All nine
named reads still return 200. Each of the two study surfaces now contains
exactly its three original trial IDs/ordinals/params/objectives; the run-global
surface is NOT_APPLICABLE, while the real six completed trials remain visible.
The verdict-rule basis matches its causal rows. No child rerun or new seal.

Actual GET-negative matrix: **13/13 PASS** — unauthenticated 401, verified
nonmember-workspace 404, malformed/over-bound query 400 and malformed/tampered/
changed-query opaque cursor 400. Job and preflight counts are unchanged;
the only POSTs are normal login/logout. Unknown/missing scope is not silently
treated as a default or permissive profile.

| Private receipt filename | Exact file-byte SHA-256 |
| --- | --- |
| `b8-causal-inner-20261002.json` | `c4fe508f68767d31be14d7063ac742a83717bf508aa9beac2aaa504f63624f66` |
| `b8-causal-inner-negative-20261002.json` | `698bb8178024577be6f1bcba71d4f6086824a8189eb3b630b3f7202b2b060bac` |
| `b8-causal-inner-20261002.pre-review.json` | `9faac5e71328550bbcda0d468c6828a9dd630eda89f5db80f4a1d825895a6cb1` |
| `b8-causal-inner-20261002.failed-count-oracle.json` | `ce4225884bea0bf42a4db5e61b6a50970e736675481a598110d32bcb0dd41f7c` |

The failed intermediate oracle wrongly expected zero completed source trials
when the global ranking was not applicable. Corrected to independently check
the actual completed count while requiring no global points/ranking/theta;
added a regression. That failed attempt stays preserved, not counted as PASS.
The private directory is
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.

## Independent review, tests and resource discipline

Three disjoint agents implemented/reviewed Python source custody, TS current
and ancillary readers, and independent runtime oracle. Root integrates
admission, constraints, schema/type generation, docs and runtime receipts.
Review caught and repaired native FOLD pool-label ambiguity, cross-study
surface ranking, inconsistent verdict-rule basis and insufficient immutable
outer-bound checking. Synthetic tests remain labeled as such, not engine proof.
The last independent seal review additionally tightened all-row objective
domains; **23/23** focused seal tests pass, including nonselected pruning.
This final malformed-ingress defense is covered by focused/static tests; the
already completed functional run is not rerun or represented as a new seal.

Focused Python source/progress/temporal tests: 90 PASS; final causal/P11
54 PASS; localhost retention/worker 46 PASS (overlapping selections, **not**
a sum reported as a full gate). Focused admission/seal 31 PASS after boundary
negatives; final mixed-score seal negatives **18/18**, study/read/global surface
tests **52/52**, causal rule/Compare/Lineage **58/58**, contract transport
**3/3**, plus positive/negative synthetic receipt checks accompany the
same slice. The mandatory combined hook is grouped at commit and its full log
is retained privately as `b8-causal-inner-commit-hook.log`. No hook bypass,
frontend rebuild, dependency reinstall or redundant optimizer run.

The first grouped hook failed at canonical contract parity: current-source
`Stage4Binding.selection_scope` was not mirrored in the standalone P16 Freeze
OpenAPI. **238 contracts passed / one failed**; no commit was created and this
is not a full PASS. The canonical generator now synchronizes the three shared
Stage-4/parameter schemas before type generation. Focused Freeze+causal
contract checks passed **9/9** without weakening the existing parity test.
That failed hook stays privately preserved as
`b8-causal-inner-commit-hook-freeze-parity-failure.log`; the final grouped
mandatory hook must complete before landing. It does not imply frontend PASS.

The next grouped hook passed all **239 contracts** but stopped at two stale
assertions in the existing run-display-label test: it still expected three
profiles and the previous two-profile WFO SQL partition. **1,700 backend
tests passed / two failed / one opt-in skip**. The updated exact allowlist
contains four admitted profiles; both sides of the WFO partition explicitly
include the causal profile, while PRIMARY/workspace/creation ordering and
unknown-child refusal remain enforced. Its failed log is preserved as
`b8-causal-inner-commit-hook-display-label-failure.log`, not counted as PASS.

## Claude consumer handoff

Regenerate typed consumers; no manual source-string parsing or client analytics.

| Screen | Exact current-source binding |
| --- | --- |
| S02 | Atlas `portal_admission.profiles`: distinct immutable causal profile, required inner controls and per-study/total caps. Do not infer support from v2 alone. |
| S03 | Actual planned/reported folds; cumulative display trial ordinal is not a native trial ID. `PER_FOLD_STUDY` progress keeps both `study_id` and `source_trial_id`. |
| S04/S05 | `fold_plan.folds[].causal_selection`, observed inner rows/counts versus `guards.inner_min_folds`; verdict row **and rule** metric basis must be shown accurately. |
| S06 | Qualified `ledger.trials[].facts.study_id/evaluation_scope`; optional `surfaces_by_study` with `INNER_VALIDATION_OUTER_STUDY`. Parent run-global surface and K are not applicable, not broken data. Declared-space/final selection is last-fold deployment only. |
| S07 | `fold_ordering.selection_scope=PER_FOLD`; own-fold selected candidate/digest and causal data-time verdict. Unpublished engine clocks stay absent; orchestration clock is not substituted. |
| S08 | `execution.fold_capital.segments[]` own params/digest/study/selected trial; retain current OOS observation semantics, no global theta overlay. |
| S09 | Fold rows `score_basis`; `params_handoff=PER_FOLD_SELECTION_APPLIES_TO_OWN_OOS`, final audit target `PER_FOLD_PARAMETER_SELECTIONS`. Keep frozen-core/sidecar distinction. |
| S10/S12/S13 | Library/Compare/Lineage use the published all-time or complete outer-fold basis, never pooled inner candidates or browser-recomputed run metrics. |

Keep accepted layout, color, typography and baselines. These new bindings have
backend API proof only; frontend/browser acceptance is not claimed here.

### Consumer compile follow-up (not a backend/runtime PASS)

`npx tsc --noEmit` on the integrated `86707410` frontend plus these generated
contracts reports three Research consumer adjustments owned by Claude:

- `FreezeDetail.tsx:1315`: exhaustive `FOLD_VERDICT_WORDS` must include
  `CAUSAL_DATA_TIME_SELECTION`, labeled as data-time selection, never an
  unavailable engine freeze/read-clock guarantee.
- `FreezeDetail.tsx:1414`: the verdict `reason_code` is nullable for an actual
  successful causal verdict; pass `reason_code ?? undefined` to the HTML title.
- `StageLedger.tsx:34`: exhaustive `SCOPE_RAN_NO_SEARCH` must include
  `PER_FOLD_STUDY: false`; this scope runs a real study per outer fold.

No frontend file is changed in this backend slice. The isolated BE worktree
also lacks the Planning frontend's local dependencies, producing separate
`react`/`mermaid` resolution diagnostics; those are not presented as Research
contract regressions. Do not mark the whole frontend build or browser lane
green from the backend hook. Claude should consume the contract and retake
the scoped frontend compile/tests in its fully provisioned worktree.

## Remaining scope

This supersedes “causal/inner execution unimplemented”, not missing source
facts or existing acceptance gates. Claude's later `97308396` records G-20
chart amendments and bindings completed; retain that evidence, do not redo
them. Still open: remaining G-21 exact-pair/browser proof and G-22 fresh-source
shared-preview receipt; genuine VN calendar/instrument/daily
execution qualification; unavailable engine wall clocks/trade execution facts;
mixed-load and old test-store artifact loss, second-engine upgrade proof,
whole frontend/owner acceptance and signed P24 release. Rolling analytics are
excluded by D-AN-01. No shared :8095, remote, dev/main or production action.

Cleanup at **14:34:20 UTC** verifies **0 active jobs / 0 active test sessions**,
the owner anchor ACTIVE and all **21 retired users DISABLED**. The first
read-only cleanup query used an incorrect user-column name and yielded no
proof; a PostgreSQL-only/one-shot read then verified the actual counts without
starting a worker or changing accounts. The owned cell is down without `-v`;
volumes, seals, backups, receipt files and rollback image pins are retained.
Capacity before final build: **205 GiB free (32%) / 13 GiB available RAM**.
No broad prune or image/volume deletion. Resource decision: NO_ACTION_NEEDED
beyond exact owned-cell teardown.
