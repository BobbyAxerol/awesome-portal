# ELP2-06 — Immutable Original and explicit historical Restated

**2026-10-17 follow-through:** [scoped retained History and archived policy
classification](scoped-score-history.md) replaces the history-stub limitation
below. Older records remain as historical entry state. Latest validation is
recorded there; implementation is not source/transport commissioning.

## Assignment, entry and authority

Bobby's active backend-gap batch02–11 and latest continuation authorize this
local implementation, not source/runtime installation. Entry HEAD
`f1f5fc7d541a2bd9b4aeb324e932d2b4f223ade7`, branch
`docs/research-loop-plan`, `/home/bobby/portal-research`. All dirty files in
this slice are primary-owned. Claude UXM00–10 remains
`NOT_STARTED_BY_OWNER_DIRECTION`; no frontend path is edited.

Inputs: current backend guide, SCORE specification, campaign rules and
[prior immutable recalculation](policy-recalculation.md). Private drafts and
independent reviews are retained under
`/home/bobby/.local/state/portal-execution-elp210/20261017/`. Source-only review
is not a test receipt. No production calibration is supplied by synthetic data.

## Requirement → delivery → validation

| Requirement | Actual implementation | Validation at entry |
|---|---|---|
| Preserve pending Original independently of later policy | `manager-score-original-custody.ts`, exact original worker JSON/input hash and source publication cross-bind, immutable ORIGINAL_INPUTS pointer | New disposable-PG custody/compatibility tests NOT_RUN |
| Bounded later-policy historical calculation | `manager-score-runtime.ts`, `manager-score-restatement.ts`: approved WeakMap handle, source/policy/method/clock checks; off-request consumer IDLE only | Worker/coordinator actual-PG tests NOT_RUN |
| No input-admission regression | Early detached tasks preserve original actual JSON byte limit; optional custody bytes do not double-count the input, numeric-array conservative accounting is not a new source limit | Two real-runtime regressions NOT_RUN |
| Immutable revisions, retry/restart reuse | Migration139 mode heads reference existing138 payloads; semantic policy/input key reuses persisted K/result; CAS and common count/actual JSONB byte budget | Actual-PG restart, cap, lease/source/policy fault cases NOT_RUN |
| Selected authorized Original/Restated API | Separate `ManagerScoreRevisionService/Controller`, exact current grant/field/population/partition; current or exact retained source metadata | Component and actual-PG→named-BFF cases NOT_RUN |
| Historical is never an ordinary operational score | `HISTORICAL_ANALYSIS_ONLY`, `operational_current:false`; later current-feed age separate from original intrinsic quality | Closed Zod/JSON/OpenAPI fixtures/tests NOT_RUN |

### Storage and concurrency

New forward migration
`1723680000139_execution-manager-score-mode-heads.sql` adds only scoped mode
pointers. Original input pointer is write-once; no source projection/ACK or
original publication is rewritten. Existing131/135/137/138 SQL is unchanged.
Custody and financial-source publication share the caller's real transaction;
the optional custody cap can omit custody via a savepoint without dropping a
valid financial source. Malformed/hash-mismatched custody is not silently
accepted. Subsequent IDLE recognizes an absent original pointer as typed
absence rather than poisoning that financial source.

Restatement uses existing consumer lease/timer/deadline and shared138 quotas,
not a second poller or request-time calculation. Physical DB lease fencing at
COMMIT is tested separately from source final checks. **A sequential async
source recheck plus synchronous assertion is not a distributed held-source
COMMIT proof.** That source integration remains open.

METRICS may be reused only with original input-hash-bound method/dependency
evidence. Changed stress delta with no retained stress inputs withholds exactly
that scalar; it does not invent a new result from the old scalar. PATH method
proof is still not retained by this new wrapper. No current policy is used to
manufacture an old method artifact.

## Published contract and Claude handoff

Delivery at entry: **APPLIED / UNCOMMITTED / NOT_RUN**, not consumer accepted.
Existing six current Manager DTOs/routes and freshness checks remain intact.
Two new named reads in `execution-manager-models.openapi.json`:

| Operation | Route | Response generated type |
|---|---|---|
| `executionManagerScoreRevisionGetV1` | GET `/api/v1/execution/manager/score-view` | `components["schemas"]["ManagerScoreRevisionView"]` |
| `executionManagerScoreRevisionHistoryGetV1` | GET `/api/v1/execution/manager/score-revisions` | `components["schemas"]["ManagerScoreRevisionHistory"]` |

Closed query requires environment, target surface/id, explicit economic
partition and source selector. `RETAINED_REVISION` requires exact source
revision and is authorized against its own generation/catalogue; today's
metadata is never substituted. Workspace and stage context are explicit.
`revision_ref` is a selected-view concurrency pin, not permission or an
arbitrary old calculation-key lookup. Public source/input/config refs are
scope/target/domain-separated keyed HMACs; never raw profile-wide source or
private custody hashes. Reads are private/no-store, with sanitized400/404/409/
503 distinctions. Operational workspace lookup failure is503, not malformed400.

- ORIGINAL retains original status/value, even policy_pending. Its unrecorded
  K/feed threshold and aggregate compute time are explicit typed absence; do
  not stamp today's policy onto old input. Per-entry original compute time is
  published when recorded.
- RESTATED publishes persisted K/compute and current policy identity, but is
  still historical-only. Each calculated entry carries exact worker
  `feed_freshness` status, checked-at, age and approved maximum; it is not a
  live freshness measurement at request time. Original intrinsic stale/gap/
  cost/validity is not cleared. Missing coordinator/custody/result is typed
  `RESTATEMENT_NOT_PUBLISHED`, not zero.
- Uninstalled keyset history is honestly
  `SCOPED_HISTORY_ENUMERATION_NOT_INSTALLED`, counts/cursors null. An empty
  array is not a claim of a complete zero-row history. Historical supersedes,
  older archived-policy classification and dependent Composition/Regime
  restatement remain open.

Canonical fixtures under `packages/contracts/fixtures/`:
`execution-manager-score-{original,restated,history}.synthetic.valid.json`.
All are `TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`. Generation:
`npm run generate:execution-manager-models` in packages/contracts, then the
repository snapshot generator. New schemas have dedicated versioned IDs.
Do not parse reason strings or calculate Score/freshness thresholds in UI.
Claude next: when assigned, design an explicit historical selector/disclosure
using these generated fields, retain ordinary current Manager behavior and
implement typed absence. Handoff **AWAITING_CONSUMER_REVIEW**, not UI-ready
or source/runtime-ready merely because the contract exists.

## Review, tests and resource plan

Independent review found two source-admission regressions, corrected before
the grouped gate, plus dropped public feed-age disclosure and HTTP workspace
error classification, also corrected with regressions. Source review accepts
HMAC/current-scope/exact-retained/full-accounting boundaries; it is not a PASS
for actual PM transport or production calibration.

One coherent normal-hook gate is planned: generated contracts, API build,
actual disposable PG suites and scoped restore. No duplicate heavy load,
engine run, browser or source job is required for unchanged gates. Frozen
controller pins source and eight protected runtimes, <=4CPU/4GiB/8GiB transient,
exact owned resource cleanup and host lease. New results remain **NOT_RUN**
until its terminal receipt. Migration139 is exercised only in disposable DB,
not any running Portal DB. Production resource/SLO/coexistence/G2 NOT_MEASURED.

First normal precheck `restatement-land-115832` stopped at whitespace validation
(new blank EOF in a newly added contract); no build/test/DB job ran. Corrected
that whitespace only. Failure/controller preserved, eight protected runtimes
unchanged, owned resources empty/lease released. Retry retains only this batch's
own staged paths; no foreign index is reset or bypassed.

Second precheck `restatement-land-115853` correctly detected the two new routes
missing from Research's shared *live* route census. Regenerated only
`P01/route-inventory.live.json` through `p01-baseline.mjs --write-live-routes`;
no historical P01 baseline, accepted Research behavior or protected kernel
changed. Added exactly the two named GETs; no removed route. No API build/DB
or contract test had run before this precheck refusal. Preserve this attempt.

### First contract-gate terminal and exact isolation-copy correction

`20261017/restatement-land-120000` ended **FAIL_OR_INCOMPLETE** at
12:03:02UTC, exit1, before API build/PG/restore. The networkless contracts
cell copied the existing pure Score validators but omitted the new pure
`manager-score-revision.contract.ts` dependency. The Manager suite could
not import; 63 other files/690 tests passed. This is not a successful
contract receipt and says nothing about new API/PG tests. Logsha256
`c9174580469bf49208f48cd9f107ab1415fb1b3b1b241171baef5ba0b2ad89e5`.
Source/index and eight protected runtimes unchanged; remaining owned
resources empty, lease released. Correct only the explicit pure-validator
copy list in `scripts/contracts-test.sh`; no runtime/config/credential mount
and no network entitlement. One coherent normal-hook retry includes this
correction; all prior failures remain recorded.

The next normal hook, `20261017/restatement-land-120355`, reached all64
contract files:718 tests PASS/1FAIL. The remaining failure is the test's
second compile of the same schema `$id` into one Ajv registry, not a rejected
response. Reuse the already-compiled validator for the second historical
fixture; preserve strict schema registration and all semantic assertions.
APIbuild/PG/restore NOT_RUN. Exact failure/controller remains under that path;
all owned resources/lease cleaned and all protected runtimes unchanged.
Logsha256 `f68f3bf037e1842642e43c4d623dc555efd1479268e701dd2625c7043e532cbe`.
After this test-only correction, focused host Vitest4.1.11 validates the
Manager contract **29/29 PASS** at12:07:16UTC (2.12s, one worker, 1GiB JS
heap ceiling). This verifies the strict fixtures/assertions, not the Node22
networkless cell, APIbuild, actualPG or source/runtime qualification.

The next normal hook, `20261017/restatement-land-120748`, passed all64
contract files/**719 tests** and generated-client parity, then failed the
API build with TS1005 in `manager-score-runtime.ts:193`. This was an actual
syntax error in this batch's multiline TypeScript assertion, not an
environment failure. API tests, disposable-PG correctness and restore did
not run; do not count them as PASS. Terminal12:15:00UTC, exit1; logsha256
`ea57ead003d2be09e99de17bde55614f7deefba53feeecd6b30bdca93237d1d5`.
Source/index and all eight protected runtimes were unchanged, owned resources
empty and lease released. One resource observation was Node100.71%CPU /
1.284GiB of3GiB and PG0%CPU /71.75MiB of1GiB; not a peak, SLO or G2 proof.
Moved the assertion into a separate `withheldReasonFields` initializer,
without changing validation semantics. An in-memory TypeScript syntax scan
of all25 changed non-declaration TS files then passed (zero diagnostics);
this is syntax-only, not semantic-build or PG evidence. Preserve the failed
receipt and run the required normal hook only after this correction.

`20261017/restatement-land-121803` also ended **FAIL_OR_INCOMPLETE**,
12:25:20UTC, exit1. Contracts719/64files and generated parity PASS; semantic
API build refused nullable/optional values in the two new custody/restatement
modules. All diagnostics follow guards using inferred const-arrow `never`
helpers that TypeScript did not treat as terminating control flow. Declare
the two helpers as named functions returning `never`; keep every rejection
and predicate, do not add non-null assertions or loosen strictNullChecks.
API/PG/restore NOT_RUN. Logsha256
`9b64bf9d7a8771e061b8bb2fabcf7ddfd089096d0c123d92468a0fc623dc887d`;
source/index and eight protected runtimes unchanged, owned resources empty,
lease released. Next use the bounded impacted build/PG profile to catch all
semantic/integration defects before repeating the coherent normal hook.
The already passing719-contract receipt is reusable for this intermediate
profile because no contract/schema/generator/client changed after that pin;
the final normal hook still verifies the whole coherent delivery.

The first focus invocation `restatement-focus-122724` refused its private
controller's stale test filename at argument validation (exit2,12:27:29UTC),
before build or resource creation. Use the actual existing
`elp210-manager-consumer.spec.ts`, and validate every focus path before
acquiring a measurement lease. No API correctness result is implied.
Logsha256 `6dbce77dcb0536a59a42b64c3eb3caa22fe378c40925d8800ed331750ed697f6`;
source/index/protected runtimes unchanged, resources empty/lease released.

<a id="elp206-restated-focus-1235"></a>

### Impacted build/PG terminal —2026-10-17T12:35UTC

`20261017/restatement-focus-122841` built the API successfully and ran18
impacted suites: **560PASS/1FAIL**,17files PASS/1FAIL, no skips. Actual PG
Score coordinator/named BFF21, runtime9, original custody31 and worker40
cases all PASS; revision read/controller13 and prior policy-recalculation41
also PASS. These are overlapping focused receipts, not additive new coverage.
Heartbeat ROOT42 and candidate PM39/36 PASS in the same cell, with synthetic
source/authority/calibration inputs clearly distinguished from Core PG.

The one failure was the new heartbeat-capture test expecting a rejected
promise. Existing worker correctly rejected the cross-profile envelope,
committed no Paper snapshot, and recorded a durable RECOVERING circuit before
continuing other profiles. Correct only that assertion; now also assert exact
recovery code/timing, no Paper mirror row and independent Sandbox/Live data.
Do not change worker isolation/backoff semantics to satisfy the test.
The corrected case awaits the normal hook, not called PASS yet. Restore was
NOT_RUN after the test failure. Terminal12:35:18UTC, exit1, logsha256
`f16aa0820b8a4ab26283816f7c3b57feba8b183fd44416e19323269f692b03dd`.
Source/index/eight runtime tuples unchanged; owned resources empty and lease
released. Required final normal-hook landing remains pending; no runtime,
calibration, source trust, latency, G2 or consumer acceptance is inferred.

## Exit, rollback and next backend

Local implementation is not full06/10 PASS. Remaining: PATH proof/custody,
scoped history and archived policy classification, dependent Composition/
Regime recalculation, actual qualified economics/provider installation,
approved calibration and consumer acceptance. Independent04/07/09 work may
continue under the existing batch.11 remains NOT_ENTRY_READY.

Rollback removes only opt-in coordinator/new readers in a reviewed patch;
stop scheduling new restatements, retain immutable originals/revisions/audit
and SQL139 data. Never run a destructive down migration or remove historical
proof to make an old view appear current. No runtime, credential, grants,
source/SSE/command/Live, push, dev/main, sign or deploy action in this slice.
