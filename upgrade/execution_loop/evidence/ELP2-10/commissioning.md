# ELP2-10 — commissioning implementation continuation

## Entry, scope and task map

Bobby explicitly assigned completion of backend commissioning in ELP2-10 on
2026-10-16. Entry `/home/bobby/portal-research`, branch
`docs/research-loop-plan`, clean `630eafc563159305727bab7c588a27da27df827f`.
Read current Unified §14, campaign rules and preceding qualification return.
This is implementation and isolated qualification, not another readiness-only
audit. Do not begin ELP2-11 or modify frontend, Research, dev/main, credentials,
HK services, production, grants or signed release.

Target: local backend, existing disposable PostgreSQL test runner; aggregate
4CPU/4GiB, one heavy test/build lane, ≤8GiB transient storage. SSH remains
metadata/source-only. No source-connected load without the declared envelope.
No new source endpoint, human mapping, approved budget/calibration, or business
authority may be invented. Missing configuration disables only its dependent
feature, not independently valid reads or risk reduction.

| Task | Owner / paths | Inputs, output and acceptance | Exclusions |
| --- | --- | --- | --- |
|10C-SOURCE|Source reviewer; notes only|Repin current HK PM/Edge worktrees and source contracts, read current authority/export transport, manifests and measurement locks; identify usable exact runtime integration ports and genuine blockers|No remote writes, tests/build/DB/business calls or credentials|
|10C-WRITER|Writer agent; only new `apps/control-api/src/execution-v2/manager-consumer.ts` and `apps/control-api/test/elp210-manager-consumer.spec.ts`|Build bounded explicit-scope consumer using existing prepare/persist/lease, injectable qualified-source port, one in-flight tick, transaction + current-source fence, ACK strictly after commit/release, stop/release and retry semantics. No source authority manufactured|No shared schemas/config/module/main/store edits, migration, Git operation or heavy test|
|10C-SCORE|Score agent; only new `apps/control-api/src/execution-v2/manager-score-runtime.ts` and `apps/control-api/test/elp210-score-runtime.spec.ts`|Bounded off-request runtime wrapper around canonical calculator; exact hash-pinned approved policy loader and immutable calculation provenance; absent/test-only policy cannot produce public numeric Score. Return typed integration API for parent review|No alternate formula/default calibration, public schema/generator/shared files, Git operation or heavy test|
|10C-PRIMARY|Primary owns integration, trust adapter, shared schema/generated/fixtures, configuration/bootstrap, docs and tests|Freeze current source boundary; install explicit fail-closed runtime wiring and integrate bounded writer/Score. Test exact production constructors plus disposable DB faults, publish usable typed contract/handoff and real result|No source activation/remote mutation, UI implementation or invented certification|

Agents read applicable rules and their relevant guide/packet before writing.
One writer per file; primary alone changes shared contracts and runs tests.
Source provider/approval artifacts not supplied remain named source dependencies,
not a reason to leave independently implementable lifecycle/wiring absent.

Validation: focused pure/DB/constructor/contract tests, generation checks if
schema changes, then one normal-hook commit for the coherent implementation.
Reuse unaffected receipts by dependency hash; no extra full suite or engine run.
Risk/rollback: false trust, stale current authority, duplicate writers, lost ACK,
unbounded recompute and scope leaks. Disable only new commissioning provider /
worker; preserve immutable revisions, current grants, fence tokens and audit.

## Implementation return — 2026-10-16

Local commissioning implementation is delivered by the coherent commit containing
this packet (parent630eafc5); **not source-connected runtime certification**.
Terminal commit SHA, normal-hook result/log digest and exact-owned cleanup live
at `/home/bobby/.local/state/portal-execution-elp210/20261016/commissioning-terminal.json`.
The landing hook is required; this document does not predeclare its result.

### Files and actual behavior

- `manager-consumer.ts`: bounded explicit-scope serial ticks, finite source/
  transaction deadlines, renew/takeover and release using existing migration137.
  Recheck current source outside the transaction plus a synchronous pre-COMMIT
  fence inside it. An asynchronous fence is refused. Publication/commissioning
  expiry caps lease expiry absolutely; the existing deferred DB trigger checks
  it at COMMIT. ACK is **after** commit and connection release. Lost ACK retries
  the identical revision, never destroys history or advances an uncommitted ACK.
- `manager-runtime.ts`, `app.module.ts`, `db/pool.ts`: registered Nest lifecycle,
  explicit private provider installation, immutable cadence/scope/bounds, one
  serial loop across at most3partitions; publication reads admit at most4 with
  finite cooperative cancellation. Shutdown aborts and joins consumer work,
  drains publication callbacks (including asynchronous cleanup), and releases
  leases before pool shutdown. Installation cannot fall back to Core or alias
  the exact Core pool object. Execution pool adds a6s client timeout
  beside its existing5s server timeout. Core pool/identity is unchanged.
  **Default installation is absent: zero timers, source calls or worker DB I/O**;
  private state `SOURCE_PROVIDER_NOT_INSTALLED`. No environment flag or HTTP body
  can create a provider. Unrelated existing publication readers are preserved.
- `publication-adapter.ts`, store/lease: qualified source publication can pass
  only with an opaque exact-byte-hash-pinned, separately approved private
  commissioning handle bound to scope/catalogue/family/purpose/four receipt
  pins. A JSON `SOURCE_VERIFIED` string or fabricated handle remains denied.
  This is Portal deployment configuration, **not a new TS export wire**, human
  mapping, signature verifier or permission grant. The installed source adapter
  must itself validate the actual existing transport, current human/policy and
  source semantics. No source URL, credential or arbitrary module path is added.
- `manager-score-runtime.ts`: off-request canonical calculator wrapper, bounded
  no-queue input/task admission, immutable byte snapshot and result, independent
  approval pin over exact policy/config bytes; current expiry and exact source,
  population, subject, partition, stage, window and methodology binding.
  Missing/test-only/unapproved calibration cannot publish a numeric Score.
  Missing components/costs remain typed null; partial results may retain current
  policy provenance without becoming a public number. Formula/weights/bands are
  unchanged; no new runtime anchors/stress/grid/maturity constants are approved.
- `manager-score-publication{,.contract}.ts`, Manager query/service: additive
  precomputed result/provenance DTO. Read path never runs analytics; current
  policy/commissioning rechecked after the **final asynchronous authority fence**.
  Exact authorized tuple population/stage/partition must match before a raw row
  score is used for filtering/sorting. No economic partition means no fabricated
  denominator. Wrong population/revision or conflicting scores remain absent.
  A current approved result with missing costs/components keeps its actual typed
  absence reason in the Fleet row, not the misleading policy-not-approved default.
  Top-level raw and direct consolidated-NAV results are independent; composition
  remains `policy_pending` and Regime unavailable, never averages child scores.
  Cursor query identity includes accepted results so revoked/changed Score cannot
  retain an old ordering cursor. A stale policy during delivery returns existing
  sanitized409, not an earlier numeric answer.
- Lost ACK/restart reuses persisted Score timestamps and bytes, rather than
  recomputing into the same immutable source revision. Source-supplied
  `precomputed_scores` are refused by the installed worker; only its canonical
  calculator may materialize that field.

No additional migration, route/query input, frontend edit, timer activation,
source access, preview rebuild, credential change or HK mutation occurred.

### Contract impact and Claude handoff

The same six named operations still return `ManagerDataset`. Additive optional
`score_details: ManagerScorePublication[]` (maximum128), full typed Score status
and `QUALIFIED_PRECOMPUTED_SCORE` reason are generated in
`packages/contracts/generated/execution-manager-models.d.ts` from the canonical
Zod/OpenAPI/schema. Generator exports the named `ManagerScorePublication` schema.
Canonical synthetic fixture:
`packages/contracts/fixtures/execution-manager-score.synthetic.valid.json`.
It demonstrates P80/R66/B70 → q73.3 with provisional maturity, **not production
calibration or a source receipt**. Snapshot includes this fixture. Existing
200row/1MiB response cap, exact decimals/UTC ms, sanitized errors and current
scope-bound cursor remain; the result may still be absent on an old document.

Claude, **only when assigned**, should regenerate/read the generated type and
map `scores` plus `score_details[].quality`/`raw_metrics`/`provenance` to approved
components. Use server canonical band/status; show P/R/B/window/basis/evidence,
distinguish provisional/null/zero; contribution is not a quality-band score.
Do not calculate/average Score, invent calibration or expose private provider
configuration. Old/source-dark data still shows honest absence. This handoff is
`AWAITING_CONSUMER_REVIEW`; writing it is not Claude acknowledgement or browser
acceptance. No new FE→BE request was received in this continuation.

### Validation, failures and reuse boundaries

| Actual run | Result / scope |
| --- | --- |
|Canonical Node22 + disposable PostgreSQL focused run|Build PASS;74/77 tests PASS in13.04s. Consumer29/29 and Score41/41 passed;3 integration fixture failures came from an extra forbidden top-level workspace key in a strict publication fixture. Removed that key and strengthened the non-null assertion. **Run1 as a whole was FAIL**, not certification|
|Additional review regressions|Added exact read-positive and wrong population/stage/partition/revision cases, current-policy partial null including Fleet absence reason, final async-delivery revoke, publication concurrency/cancel and lost-ACK immutable Score checks. Terminal normal hook is their retake, not another unrecorded focused PASS|
|Contract generation|Pinned offline Node22 generation completed. Attempt to run Vitest directly with read-only dependencies failed at `.vite-temp` startup, before tests. Canonical `scripts/contracts-test.sh` uses its disposable writable workspace and is the terminal contract gate|
|Host build diagnostic|Stopped an incompatible local dependency-tree build; not counted PASS. Canonical Node22 build above passed; no lockfile/dependency edits|
|Prior630eafc5 /169195ca receipts|Historical unchanged pure lease/source/quality tests inform impact review, not added coverage. New module/store/service/schema changes require normal-hook regressions and scoped dump/restore|

Independent review found/fixed: duplicate-revision Score recomputation after
lost ACK; policy expiry during final authority I/O; mutable cadence; unrelated
publication reader replacement; unbounded publication callbacks/task payloads;
and lease time extending beyond approval/publication expiry. Tests exercise the
real production constructors/repositories against disposable PG with explicitly
synthetic providers/pins. **They do not install a real source or approve config.**

Final independent review also found/fixed exact Core-pool alias bypass and
publication callbacks not joined during shutdown. Regression covers same-pool
injection rejection and delayed cancellation cleanup before `STOPPED`. These
edits were staged before the hook's API cell source copy/build; terminal results
must bind the final source hashes, not the earlier working version.

First normal-hook attempt:678/678contracts and Control API build passed, then
API suite was explicitly interrupted by stopping only owned disposable Node cell
`control-api-test-node-1964822`, to correct the Fleet partial-score reason found
in final integration review. Exit1 is **not** a complete API PASS. Script trap
owns its PG/network teardown. The terminal hook retake is the sole final landing
gate; receipts do not add overlapping test totals or hide this interruption.

Pre-heavy local sample: root167,553,966,080free of665,811,062,784bytes (~25%);
RAM11,073MiB available of32,092. Test Node sample99.04%CPU/1.01GiB of3GiB,
PG72.36MiB of1GiB, not peaks. One heavy lane only. Runner/host workloads are
untouched. Cell/network/dependency directories are exact-owned and removed by
traps/explicit cleanup; terminal receipt records final inventory. Existing
`C4-GOV-CAPACITY-01` remains a separate capacity-maintenance follow-up, not
authority to prune active images, volumes, cache or evidence here.

### Fresh source pins and one concrete external action packet

Read-only HK observation13:33:06–13:36:16UTC at `bobby@16.163.212.33`:

- PM `/home/bobby/.worktrees/trading-system-pm-v1_1`, branch
  `feat/portfolio-account-v1_1-parallel`,
  `c401a02365bbe2ae341a7a135391ce3789aeb29d`;5tracked owner changes and6untracked
  capture/source/test files preserved. Current R2 guide SHA256
  `6269f5d867e59c92f99943613f155c9d54badead1fb2d22fe66cc0fd2d26b8fa`.
- Edge `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, branch
  `feat/execution-edge-upgrade-v1_2`,
  `cfeeee7e6dc4680dd736ac4e4076ea997d9cbb87`;owner journal/feasibility WIP
  preserved. `edge-service/src/main.rs` SHA256
  `a50fa6a5ee0ab5a2a1fca45feb5923c8d97328432c364cffaa0443ee33049124`.
- Owner measurement lock `claude-kafka-b`12:53:54–15:43:54UTC, P18.4/G12.
  No remote business/API/DB/load test run. New source-owner strict-TLS receipt
  supersedes earlier expired-TLS blocker; it is owner-reported, not our direct
  transport acceptance.

Existing real routes at Edge main1140–1150 are catalogue/capabilities/projection/
relation current-page reads. Workload delegated JWT/mTLS at2012–2068 is **not**
human policy authority. Relation cursor/page proof at1817–1878 is not a complete
normalized population/barrier/revoke contract. PM candidate report route
`operator_adapters.py485–486` is not production export; its factory390–395 is
explicitly unmounted. `identity/human.py117–122` has no current provider installed.
New owner-WIP `report_source_inputs.py90–166` is SOURCE_DARK/BOOTSTRAP_ONLY:
strategy identity is not Portal alpha/version binding; metric values/checkpoint
are null. Preserve these gaps rather than invent an export route or reuse the
workload identity as a human grant.

**One required owner-delivered commissioning bundle**, using existing source
contracts (not permission to build arbitrary adapters):

1. A real reviewed current-human/policy/publication provider and normalized
   five-anchor population adapter for the selected exact deployment/profile,
   with existing transport/trust/privacy/field-policy receipts, continuity and
   source recheck/ACK semantics. It plugs into `ManagerRuntimeInstallation`;
   until it exists no valid source implementation can be installed honestly.
2. Approved scope-specific resource/SLO/workload/placement envelope and window.
   Current source manifest still has14groups with null budgets/approval/baseline.
   Then measure source/BFF/TS/DL/Research paired coexistence and applicable
   performanceG2, not just our synthetic constructor tests.
3. Independently approved horizon/calibration/config artifact plus exact hash
   pin for numeric Score. Portal loader/calculator/result path now exists;
   production values must not come from this test fixture.

Researcher field matrix/Stan mutation ceiling remain separately deferred,
not prerequisites for otherwise valid authorized manager reads. Command/Live
activation is outside this package. No repeated generic owner-approval request
is necessary for the local implementation already assigned and completed.

### Gate disposition, rollback and next

- T10-04/07/11: bounded writer/lifecycle/fencing/ACK/current-policy local code
  and focused proof delivered; final normal-hook regressions required to land.
  Actual qualified source failover/DR/amplification remain operational gates.
- T10-10/13/14: one canonical computation, independent calibration gate,
  precomputed DTO and null/provisional/quality separation implemented; **approved
  production calibration and temporal/source/browser proof still BLOCKED**.
- T10-06/08/12: source-connected coexistence, approved capacity thresholds and
  applicable performanceG2 remain NOT_RUN/BLOCKED by the bundle above. Existing
  cashflow/methodology/FX/ownership tests are reused/retaken, not relabeled source
  certification. Full ELP2-10 remains **NOT_MET**, not full-PASS.
- Backend next: same ELP2-10, install and qualify the exact reviewed bundle when
  supplied, then run only affected operational gates. No known local worker/
  loader/result-DTO implementation is deferred as “waiting TS”. ELP2-11 remains
  unassigned; no dev/main/push/sign/release/deploy.
- Claude next: six named Manager/360 typed consumers and independent UXM-08/10
  acceptance when Bobby assigns; fixture/design can proceed without claiming
  live source. `ELP2-REQ-10-001` remains awaiting consumer review. Canonical
  `05-001/06-002/00-005` now refer to the exact external provider/calibration
  acceptance above, **not the previously missing local wiring**. `10-002` stays
  budget/coexistence pending. No duplicate generic source request is opened.
- Rollback: omit the private installation or stop its lifecycle; refuse new
  source work, abort bounded in-flight tasks, release current lease. Preserve
  immutable revisions, fencing epochs/current grants and all financial history.
  Disable numeric Score by revoking its policy handle without blocking unrelated
  reads/risk reduction. No down migration, authority fallback or broad cleanup.
