# ELP2-06 — immutable policy-only calculation revisions

## Focus terminal and derived-reason contract correction — 2026-10-17T11:06UTC

`finite-followthrough-focus-105640/controller.json` is TERMINAL, exit1:
APIbuild PASS;329/330API tests PASS across10files; one new authorized METRICS
read failed. Logsha256
`1d47cc4741d7ac0bb34053c8b717f3f05aed7b4313728f64bd0d5695616adebc`.
Source/index/eight protected runtime tuples unchanged; exact Node/PG/network
resources absent and lease released. Restore NOT_RUN after the failed test.
Actual-PG means disposable DB with SYNTHETIC authority/calibration, not source
commissioning. Prior failures remain preserved.

Root cause is a real projection-contract mismatch: Score permits64reasons,
including the32original reasons plus a derivation-absence reason, while the
row's `ManagerMetric.quality.reasons` allowed only32. No source fact or current
permission was wrong. The bounded correction gives metric quality64reasons,
keeps source/document `managerQuality` at32, and never truncates a reason.
Regenerated dataset JSONschema/OpenAPI with the existing generator; regenerated
`execution-manager-models.d.ts` has no textual change because array bounds are
not represented in TS. New canonical synthetic metric fixture and contract
regressions cover33/64accepted,65refused, unchanged source32cap and full response
parity. No field, numerical policy, authority, migration or UI change.

Independent review accepted this narrow fix. Initial host generator lacked
its Zod resolution path; it wrote no schema. Reran using the existing API
node_modules via NODE_PATH, no install/lockfile change. Generated-type command
then completed. Corrected case/contract/hook are **NOT_RUN** at this entry;
the coherent normal hook will exercise them once, not repeat the entire focus.
Claude remains held/AWAITING_CONSUMER_REVIEW; future consumers may preserve up
to64metric reasons, not silently drop derived absence.

Landing attempt `finite-followthrough-land-110740` stopped at the normal
pre-build snapshot gate: two generated contract digests had not yet been
refreshed. No build/test/DB cell started, no commit and no source/runtime
change; owned resources empty. Refresh the canonical snapshot using its
existing script and register the new synthetic fixture, then resume the same
normal hook with the exact owned staged paths preserved. No hook bypass.

Second early landing `finite-followthrough-land-111033` stopped at EDS-12's
stale `projection_relation_ladder` hash for the changed static Bracket catalogue.
Again no APIbuild/DB cell started, no commit, unchanged source/runtime and
empty owned resources. Existing release-integrity refresh script updates only
the generated static ledger/manifests; authority remains false and runtime
effect NONE. Static verifier passed after refresh; this is not a release or
deployment qualification. Continue normal hook after these exact metadata
dependencies, not rerun a previous load/DR/source job.

## Current METRICS follow-through — 2026-10-17T10:55UTC

Baseline322e23472c391f80d929436da050227f53c5068d landed the original PATH
chain through normal hook/build/restore. New private METRICS support is
APPLIED/UNCOMMITTED; focused results NOT_RUN at entry. No public schema,
formula, calibration/default, migration, source sequence/ACK or runtime change.

Private `ManagerScoreRecalculationTask.metrics_dependency` records exact source
revision/set/as-of, original metrics input digest, method, stress delta and
source locator. A qualified adapter must bind its digest into the ORIGINAL
worker input before calculation. Neither custody nor current policy may mint
that provenance. Exact input JSON remains separately retained across JSONB.

Same method/delta reuses six actual scalar metrics; a changed stress delta
nulls only stress with `STRESS_INPUTS_NOT_RETAINED_FOR_POLICY`, preserving the
other five and independently recomputable PATH siblings. Missing source
dependencies yields null components with `METRIC_DEPENDENCIES_NOT_RETAINED`,
not zero or invented paths. Returning to a compatible policy uses original
inputs rather than the previous partial result. No request-side calculation.

Independent review found mutable sidecar metadata alone was insufficient.
The correction always compares original task bytes to the immutable SOURCE
score input digest, including derived reads/restart. Rehashing a substituted
dependency, task, derived score and all mutable keys must still fail. New PG
corruption regressions exercise both wrapper-only and coherent forged-task
paths; original source and ACK must stay unchanged. Reject asymmetric missing
dependency/digest, controls/final-newline grammar and invalid source pins.

Existing original-cutoff policy/method eligibility is NOT weakened. Explicit
later-policy RESTATED and policy-independent source-method custody require
their own additive versioned contract/history; they remain real backend debt,
as do Composition/Regime dependency recalculations and actual source tie-out.
Fixture-derived dependency artifacts are TEST_ONLY, not installed PM evidence.

Grouped validation covers actual disposablePG, Score runtime and reader
regressions in the same bounded correctness cell as04/07. Rollback retains
immutable original source/revisions; no SQL data deletion. Claude held;
AWAITING_CONSUMER_REVIEW. Existing score provenance/quality types suffice for
this private input extension; consumer must keep typed partial/null reasons.

The prior historical entries below remain intact. New terminal results and
commit supersede only this entry's APPLIED/NOT_RUN state after actual review.

## Entry and approved scope — 2026-10-17

Bobby's active remaining-backend 02–11 assignment, Unified §14.13. Previous
goal turn made progress: Regime/realtime and finite reader/workflow correctness
receipts are terminal PASS; they do not close actual source/config acceptance.
Current `/home/bobby/portal-research`, `docs/research-loop-plan`, HEAD
fdab164ce0187ac164efbf30ee232e8f3e1d5f3a. Preserve the other owner's 12 staged
paths/index, including their Unified hunk. No frontend/source worktree edits,
source installation, command/Live activation, push or release/deploy.

Goal: a functioning original retained PATH → existing worker → immutable
derived revision → current-policy API chain on an unchanged financial source.
Do not invent PATH inputs from scalar metrics, rewrite sealed source bytes,
advance source sequence/ACK, or relabel later calibration as original knowledge.
METRICS and Composition/Regime dependency recalculation remain explicitly open
until supported by retained inputs and their own implementation/proof.

Primary reserves migration **138** for two private rebuildable calculation
tables after checking actual local migrations through 137. No runtime migration
is run by this reservation. Register the new forward in the isolated-store
ledger without editing historical SQL/digests. Retain old rows on rollback.

| Task / owner | Output | Bounds and acceptance |
| --- | --- | --- |
| Primary | New recalculation module; private policy descriptor; runtime/consumer/service integration; migration 138 and isolated-store ledger; tests/docs | Original inputs atomically retained with source; new policy must already be eligible at unchanged source cutoff; immutable append/CAS; existing consumer lease/deadline/IDLE tick only; current-policy/source/derived fences; no new public schema or numerical defaults |
| Independent reviewer | Private review of existing draft, actual integration and fault cases | Read-only repo/private notes; no jobs, code/index/Git/source edits. Report concrete correctness/security defects, not fixture/source acceptance |
| Disjoint test writer (reviewer follow-through) | `apps/control-api/test/elp206-policy-recalculation.spec.ts` only | Read applicable rules and existing PG chain patterns; implement tests against the private opt-in `score.recalculation` config and `runtime.recalculationFor(scope)`. No source/shared/generated/SQL/docs/index/Git edits, no test/build/DB jobs. Primary runs the grouped disposable-PG gate after integration/review. |

One correctness cell at most 4 CPU/4 GiB/8 GiB transient, no parallel full
suites/load/browser/HK jobs. Test source is synthetic and actual DB disposable;
not genuine installed authority/calibration. Expected: initial atomic capture,
IDLE recalculation, exact retry/restart, original bytes/ACK preservation, method/
cutoff/current policy isolation, lease/head races, retention caps and rollback.
All new tests are NOT_RUN at entry. Normal-hook remains mandatory for landing;
foreign staged work must not be unstaged or included to force a commit.

## Handoff and exit at entry

UNIMPLEMENTED / NOT_RUN. Private prior module/checkpoint is not an applicable
complete patch; primary must complete missing descriptor, SQL, integration and
tests and address its documented defects before delivery. No phase PASS.
Claude NOT_STARTED_BY_OWNER_DIRECTION; AWAITING_CONSUMER_REVIEW. Future consumer
uses the existing score publication/provenance and typed absence, never computes
or guesses a policy result. Backend next can continue 03/07 after write
coordination and other 04/05/08/09 adapters independently; actual trust/config,
budget/coexistence/G2 and full 11 remain open. No new duplicate request ID.

## Integrated focused-gate entry — 2026-10-17T09:37UTC

Repinned HEAD d483357a416f7944d06ab8d4e2a80062656dac92; foreign commit
landed and index is empty. Own changes remain UNCOMMITTED. Private opt-in now
connects retained original PATH tasks, existing worker, migration138 immutable
append/head, serial consumer IDLE and authorized Manager read. It preserves
original task JSON bytes separately from JSONB key ordering and accepts only
the worker's existing optional-undefined object semantics at initial capture.
Stored publication/bundle parsing stays strict. No numerical default or source
sequence, original projection, ACK, timer, public field or runtime is changed.

Seventeen actual disposable-PG cases are applied, NOT_RUN before this gate:
original-byte round-trip, optional undefined, duplicate rejection, initial
atomic rollback, IDLE calculation, no request-time work, repeat/restart/lost
COMMIT response, approval cutoff/method change, revoke/lease/source-head races,
row/actual-jsonb-byte caps, provider mutation and final access-I/O revocation.
One grouped API build/focused/restore gate also covers existing Score/runtime,
Manager store/model/service and Regime integration. Await its terminal result;
do not inherit PASS from earlier changed runtime/service dependencies.

Coordination exception retained honestly: the prior owner's normal commit
hook exited0 and landed d483357a, but its controller reported NOT_PASS /
OWNED_JOURNAL_OR_WORKING_SOURCE_DRIFT (working_source_unchanged=false).
Own policy edits occurred before recognizing the global source pin. Its log
is not acceptance for this new policy slice; no rewrite or rerun just to hide
that history. Exact prior receipt: /tmp/epg10-current-relations-commit-z_05lctj/receipt.json.
The source pin is now released, own cell takes a new freeze. No source/job
overlap, foreign index mutation, runtime/config/credential or frontend edit.

## Focused terminal and fixture-only correction — 2026-10-17T09:41UTC

Actual focused cell `policy-focus-093624` finished at09:40:58UTC with API
build PASS, **238/241 tests PASS,3 FAIL**, not a completed gate. Fourteen of
the17 new actual-PG policy cases passed. Three API-reader cases stopped before
the reader under test: the synthetic authority narrowed tuples to OWN while
retaining PEER strategy lineage, correctly rejected with
`EXECUTION_READ_PUBLICATION_NOT_QUALIFIED`. Correct the fixture's resources and
lineage to the same OWN tuple; **no production authorization was weakened**.
The corrected three cases are NOT_RUN until the coherent normal hook below.
PG restore was NOT_RUN because the script stops on a test failure.

Private controller/log root:
`/home/bobby/.local/state/portal-execution-elp210/20261017/policy-focus-093624`.
Log sha256 `9f8c9e57f0e97e627323b19e85aa7e82d748c7e709a0524a2508ebcd223b1195`.
Source/index and eight protected runtimes unchanged; all owned containers,
network and measurement lease disposed. Instant sample09:38:31UTC was
Node1016MiB/3GiB, PostgreSQL71.16MiB/1GiB, not a peak or production budget.
Existing seven suites passed but overlap old receipts; no additive test count.

Independent review's original-byte/optional-undefined and actual-jsonb-byte-cap
findings have been addressed. The next **single coherent normal-hook landing**
covers this correction plus Regime/realtime, finite readers/workflows and exact
command grant/final-clock regressions. No second separate full focus is required
before that hook. Terminal results must be read from that new controller,
not predeclared here. METRICS/RESTATED and Composition/Regime dependency-policy
recalculation, genuine source/config and Claude acceptance remain OPEN.

## Corrected policy-suite result — 2026-10-17T10:16UTC

All17/17 policy actual-PG cases now PASS inside the preserved coherent normal
hook `followthrough-land-094649`. APIbuild and715contracts also PASS. The hook
as a whole did NOT land: a different command-PG suite failed setup because its
test credential was blocklisted. No scoped restore ran after that failure.
See the canonical10 terminal receipt; do not relabel that hook PASS or reuse
it as source/config/complete-chain commissioning. This supersedes only the
three pending policy-fixture results above. Source/migration138 bytes are
unchanged since this successful policy suite. Subsequent changes affect
retained reader/session joins and command test setup, not this module's logic.
Actual source, METRICS/RESTATED/Composition/Regime recalculation and full06
acceptance remain open. Normal coherent landing still PENDING; no runtime edit.
