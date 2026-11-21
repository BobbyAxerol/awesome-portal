# C7 runtime integration — 2026-10-19

Status: IN_PROGRESS; current validation is recorded at the end (including
the failed first focused run). Local implementation
and source/connected/runtime/consumer acceptance are separate gate columns.

## Scope and entry

Bobby assigned completion of the remaining ELP2-10 gates on2026-10-19.
Canonical `/home/bobby/portal-research`, `docs/research-loop-plan`, clean entry
`35953e073f609c154ec484b19b4ceeeb09b566c8`. Claude's earlier delivery is now
included in that source; do not replay or overwrite it. Entry peer ref was
`0362285526458dddf3695ec719d82c2512dd1e1c`; the later read-only peer cut is
recorded below. Recheck before integration/exit.

Implement the missing genuine composition-to-bootstrap/read/realtime lifecycle
on top of e19 and the landed peer source, then verify revoke/replay/shutdown.
Reuse reviewed private proposals only after checking each hunk against the
current source. No wholesale historical43-path replacement. Main alone owns
canonical code, shared contracts/generated outputs and tracking.

No frontend/design/baseline edits, push, dev/main promotion, release or trading.
HK is read-only: no installation, credential/grant/policy change or private
configuration inspection from this package. A real-runtime prerequisite needs
an exact target/package rather than an inferred permission. Existing approved
isolated local cell ceiling remains4CPU/4GiB/8GiB transient, one heavy job under
`/tmp/portal-heavy.lock`; no load against TS/DL/production. Test thresholds and
calibration do not become approved production defaults by passing a test.

## Task map / write ownership

Applicable campaign rules §§7,8,10.8 explicitly request bounded delegation.
Reuse three existing agents; do not spawn a fourth worker or allocate extra
resource jobs. Every delegate reads applicable rules before its own work.

| Owner | Task / inputs | Write allowlist | Acceptance |
|---|---|---|---|
| Main | Integrate finite composition, loader/pool lifecycle, RT admission/drain; publish exact additive contracts, tests, canonical docs | Canonical backend/contracts/own tracking; never frontend or Claude WIP | Current source passes affected real Node22/PG/HTTP/Nest tests; one normal R3 at coherent landing; exact cleanup |
| elp201_wire_review (reuse) | Independent current-source RT/finite integration review and known historical proposal applicability | Private `20261019/c7-review/` only | Concrete blocker/repair table, no test/runtime claims; review final applied diff again |
| elp203_legacy_grants (reuse) | Fresh readonly four-source pins, owning Edge/PM journal/public receipt deltas, financial/config/coexistence inputs | Private `20261019/source-audit/` only | Full SHA/dirty hashes/public locators; distinguish owner-reported from directly observed; no credentials/API/DB/Docker/HK writes |
| status_currency_review (reuse) | Current Claude requests/receipts and remaining qualification/approval matrix versus e19/current HEAD | Private `20261019/claude-intake/` only | Exact still-open IDs and minimal done-when, B1 producer-review deltas; no peer/canonical writes or jobs |

## Requirement / gate matrix

| Gate | Implementation / validation | Entry disposition |
|---|---|---|
| Provider identity/composition | SAME actual pool/trust/current-human mutations; complete pinned file pair; malformed/partial config fails closed; default absent is inert | IN_PROGRESS |
| Finite business read | Existing current session/workspace guards, exact selected person/profile, no fallback after denial, no installer call at bootstrap/read | IN_PROGRESS |
| Revoke/replay | READ independent STREAM, exact captured snapshot and opaque cursor, real source flight retained through timeout/cancel | IN_PROGRESS |
| Shutdown/recovery | Join actual preparation/poll/source flights before owned pool end; rollback/startup failure preserves original outcome; real physical PG faults | IN_PROGRESS |
| Financial inputs | Exact qualified source grain/window/methodology/currency and ownership; no invented amounts or zero-for-absence | SOURCE_AUDIT_PENDING |
| Budget/calibration | Named approved artifacts and exact profile needed; preserve formula/weights/bands; no fixture defaults | SOURCE_AUDIT_PENDING |
| Coexistence/performance G2 | Matched baseline/workload/limits and approved thresholds; owner windows respected; no summing unrelated receipts | SOURCE_AUDIT_PENDING |
| Consumer/browser | Read actual peer acceptance/receipts, identify source/fixture lane; Claude owns changes and UI qualification | INTAKE_PENDING |

## Evidence / rollback / next action

Prior actual e19 normal gate remains valid for its exact source only:
contracts1087PASS; API7965PASS/3skip; build/scoped restore/zero owned resources.
This successor must not inherit PASS for changed lifecycle paths.

Keep failed receipts and source-time cuts intact. Rollback is reviewed source
reversion or disabling only the newly installed candidate path; never erase
audit/business facts, resurrect grants or drop another owner's resources.
ELP2-11 remains NOT_ENTRY_READY. Main will update actual results, resource
measurements, producer SHA, Claude handoff and every unresolved dependency here
and link the disposition from Unified before reporting completion.

## Applied source, pending owning gate

This section describes actual working-tree implementation, not a passing test.
The normal hook must qualify the combined candidate rather than importing
the Edge candidate's test counts.

1. Private runtime reference requires both file and SHA-256; absent stays inert,
   partial/malformed fails closed. Bounded canonical owner-mode files, actual
   Ed25519 material and exact physical PG database/system/role pins are checked.
   Loader/composition never provisions a policy, grant, owner artifact or key.
2. Existing SessionGuard/workspace/shared read authority remain before selected
   native finite/stream paths. Effective Manager trust may be either the exact
   genuine composition's original or its privately registered frozen one-hop
   delegate; copied wrappers and wrong pools/mutation coordinators still fail.
   An explicit selected denial never falls back to a legacy business reader.
3. READ baseline and STREAM are independent. One captured snapshot produces
   the closed baseline coordinate; replay binds actual actor/workspace/policy/
   source/generation. Pending preparation is capped before awaits. Abort or a
   caller timeout does not release capacity while original I/O is unsettled.
4. Preparation, poll peers and original source flights are joined on stop.
   The actual AppModule class ends only an owned Execution pool after successful
   same-module provider shutdown. Explicit standalone native bootstrap ends its
   SAME owned Core pool only after complete app close; generic injected pools
   stay caller-owned. Startup failure is preserved, never retried as business
   success. Pre-handle failure is NOT_SAFE_TO_DISPOSE; failed drain is CLOSE_FAILED.
   OS process termination is not a clean-drain or COMMIT/ROLLBACK receipt.
5. Private selected bootstrap deliberately disables the process-global Nest
   logger before DI construction; it is not an app-local logging switch.
   Standalone main emits fixed failure categories, not raw source exceptions.
   No-config legacy startup behavior stays separate.
6. Four producer corrections: served `ack_only` includes exact original-intent
   currency, separately named `stored_ack_only` keeps private stored grammar;
   public/nested business revisions reuse the canonical int64 counter schema;
   eligibility action/target-kind combinations match actual producer decisions;
   migration133's decision inbox is a derived view with backing-table retention.
   No migration or historical stored event is rewritten.

Inherited counter lexical debt remains explicit: foundation.contract.ts:6–7
and its existing PmCounter JSON regex use JS `$`; terminal LF is accepted by
that inherited runtime/schema grammar. This batch corrects int64 overflow
parity, not that separate cross-source grammar decision. No stricter claim.

## Contract and consumer handoff

- Regenerate with repo `generate:execution-trusted-commands` (existing downstream
  chain), `generate:execution-access`, and `openapi-typescript` for the existing
  `execution-profile-realtime` document; run snapshot tooling. Generated outputs
  are never hand-edited.
- Additive `NativeProfileRealtimeHeaders`: native baseline state plus opaque
  cursor, OR explicit native stream-unavailable state with no cursor. Legacy
  snapshot body/legacy cursor remain unchanged. Header opt-in is not a permit.
  Existing stream documents opaque native cursor, terminal/notification semantics,
  Last-Event-ID precedence and typed 429. Scoped document remains schema-only;
  no fictitious endpoint is mounted by the generator.
- Canonical fixtures: `execution-scoped-realtime.synthetic.valid.json` carries
  baseline/unavailable header variants; `execution-trusted-commands.synthetic.valid.json`
  carries public and stored ACK variants separately. All are TEST_ONLY synthetic.
- Claude: rerun affected command/status, eligibility and `r2Ledger` consumers
  against this delivered producer revision. Convert expected-failure tests only
  after observing the repaired contract. Do not copy `stored_ack_only` into a
  public reader or interpret queue success/ACK as financial APPLIED.
- FE-057 expiry clocks, FE-058 navigation semantics, FE-059 bounded batch,
  FE-060 step-up freshness, FE-061 closed reason/retry typing, FE-062 pending
  recall discovery, FE-063 verified recipient and FE-065 PM lexical currency
  remain individually owned requests; this batch does not claim all delivered.
  FE-064 is not an allocated request. Public self-navigation is advisory and
  does not grant every economic read or command represented by a menu.
- FE-054 is a confirmed backend + legacy wire exactness gap, not a frontend
  formatting issue: `local-query-analytics.service.ts:625–628` coerces exact
  repository decimals to Number before accumulation. Existing `addDecimal`
  can repair arithmetic, but the current V1/peer consumer accepts number|null;
  coercing the final exact sum back to Number would still lose >2^53 precision.
  NEXT_GATE owner Codex: bounded additive/versioned exact-decimal stage read,
  then Claude reader ACK; keep existing V1 compatibility, null gaps and scoped
  authority. This integration batch does not mark FE-054 fixed. Source-only
  triage `claude-intake/FE-054-binary64-triage.md`, SHA-256
  `f1e13a6fddce5df2b14b2e5d4fe8435137bdd2196316353ed85650d4cac4b571`.
- B1 `afc5864e` is already an ancestor. Its incident authorization on both ends,
  scoped counts and repeatable-read aggregate boundary are preserved, not
  replaced with the source candidate's older six dependencies.

## Fresh HK source cut and remaining owners

Read-only sequential cut 2026-10-19T04:16:42Z–04:21:44Z; HEAD alone does not
describe Edge/PM WIP. Main independently rechecked key registry/descriptor facts.
No remote API, DB, Docker, config/credential inspection, writes or jobs.

| Source / approved worktree under `/home/bobby/.worktrees/` | HEAD | Tracked WIP SHA-256 |
|---|---|---|
| Edge `portal-execution-edge-upgrade-v1_2` | `5f433f8c4cb39cf170248304ecde8d61b2d786f1` | `f2df9d39c7a9833347b7b5508c7c68096e7bbbc4c5ddc0463765529a0491b72e` |
| PM `trading-system-pm-v1_1` | `908169aaef3f64a7b0cefa8263d4c106d826a811` | `4347c328387d602513e7b590bd12ee4d297a6af130fbca504644f44e27ad4564` |
| TS `trading-system-next-upgrade` | `365902e1522f666ac94b717118bfc92382dac47a` | clean tracked |
| DL `data-layer-p184-closure` | `9b42667e5afce41d8513b8c781d9203d0fd8d353` | clean tracked |

Edge successor `b87f73dbda3d119dbb09ed9f263b89738abbb874`, base e19, is a
source integration input, not connected commissioning authority. Its nine
actual PG/HTTP/SSE acceptance expansions and compatible test fixtures are
reconciled selectively; keep the stronger actual owner/drain/rollback tests.
The held metadata test pauses after SQL returns: logical preparation join,
not physically blocked SQL. Isolated fault PG tests have their separate scope.

| Remaining gate | Evidence / exact locator | Required owner action |
|---|---|---|
| Genuine provider/current-human installation | Edge `upgrade/integration/execution-native-read-v1/current-core-reconciliation/{README.md,qualification.json}` still connected NOT_MET; separate stable39 target is not Research127 | Explicit exact compatible target/policy/provider package; never copy stable IDs/grants or edit physical-target checks to make them match |
| Source finite/SSE qualification | PM `contracts/baseline/portfolio-account-v1_1/pma11-16-core-manager-runtime.json` runtime43 unqualified; `…runtime-sse.json:143–144` SOURCE_PREPARED_NOT_EXECUTED, 0 actual credit | Owning PM finite failure follow-through and eight real SSE cases, retaining original failure/teardown outcomes |
| Financial inputs | Edge catalogue `registry.json` new_runtime_exports_enabled=false; PM `pma11-14-dataset-discovery.json` runtime_enabled=false; selected-history lacks required generation/checkpoint barrier | Publish qualified exact grain/window/methodology/currency/identity history, not a second Portal ledger or fixture amounts |
| Calibration/budget | No approved exact runtime calibration artifact found in the checked public source surface; formula/weights/bands already fixed | Named approved artifact/revision and operational budget, never test constants as production defaults |
| Matched coexistence/G2 | PM `pma11-16-matched-measurement-preparation.json:3,8,127–144` SOURCE_PREPARED_NOT_RUN, execution_ready=false,17 inputs null | Approve/fill target, baseline/candidate/sole-change, descriptors, initial state, workload, cache/warmup/window/repetitions, budget/SLO, fault/restore scope before a matched reserved measurement |
| Browser/source parity | Current Claude BFF_DOUBLE/fixture receipts do not use a commissioned HK source | Claude owning consumer receipt then actual qualified-source browser lane; no relabeling a fixture as real read |

PM isolated 4 process +26 offline and corrected mixed75 (30driver+34mixed+11PG)
are separate scopes; mixed37 durability outcomes remain UNKNOWN. Preserve
initial74/1 failure. Edge931 source cases and factory7 do not become connected
runtime cases. DL final stage100 at its pinned source reports own G2 PASS but
G4/G8 FAIL/NOT_CERTIFIED; its G2 is not matched Portal coexistence qualification.

Full private source audit and content hashes:
`/home/bobby/.local/state/portal-execution-elp210/20261019/source-audit/source-update.md`
SHA-256 `63a5d0a9accdfec2d367d864f46be342053956abdae2ded17968e58e8d7bb586`.
This cut proves the stated public source dispositions, not a global absence
search or runtime behavior. A new remote installation or matched load needs
the exact package approval required by the authority rules; read-only SSH
permission is not permission to mutate another upgrading worktree.

## Current validation record

Implementation/generation performed; owning focused Node22/PG and normal R3
are PENDING at this document cut. Preserve initial failed attempts if any;
append actual commands, counts, log/source hashes and cleanup at terminal.
Independent static review of applied bootstrap: ACCEPT_SOURCE_ONLY_NOT_RUN,
`c7-review/final-applied-bootstrap-review.md`, SHA-256
`4916939b83eff4d51889978ac6a7a7d6ec5649c34cee26d4ea84258281003e90`.
Three reused agents, zero new agents; none ran a test/resource job.

### First focused terminal and correction —04:51:50Z

Real Node22 build PASS. Disposable-PG focused suite:25files,790tests,
787PASS/3FAIL,232.60s; **FAIL_OR_INCOMPLETE**, not a passing suite. The three
new assertions incorrectly searched for `CURRENT_HUMAN_NATIVE_CONFIG_INVALID`
inside public prose. `CurrentHumanLeaseError` deliberately exposes the stable
code separately and keeps a fixed sanitized message. Correct only these
assertions to check exact code plus safe message; do not weaken the producer
or leak internals to make tests green. Two bounded host-diagnostic attempts
never obtained the shared heavy lock (15s/45s, no test started); no test result
is assigned to either wait. Do not race Claude or repeat the790cases: the
single normal R3 qualifies the combined corrected source, including both files.

Already-observed scoped results include coupled PG/HTTP/SSE52PASS, actual
transaction faults4PASS and app lifecycle9PASS. They are subgroups of the790,
**not extra cases** and not real HK provider/financial/performance qualification.
The original failed run and its unmodified source hashes are preserved at:
`/home/bobby/.local/state/portal-execution-elp210/20261019/native-c7-focus-044303/`.
Log SHA-256 `3edbbefb03ac9859498b6c85b02231bee4ddc6300a82f2edd375648ecb9d28eb`.
Source/index/eight protected runtime identities unchanged during that run;
all three owned disposable resources absent at terminal. A single observed
sample Node1.248GiB/99.41%CPU and PG73.48MiB/0.02%CPU is not peak usage or a
production capacity budget. No broad image/cache/volume cleanup was performed.
Static N29 and EDS-12 pin refreshes reported changed=false/runtime_effect=NONE;
contract snapshot check matched all480tracked inputs after the correction.

Normal R3 result is **PENDING at this tracked source cut**. Its actual terminal
authority is the private `native-c7-land-HHMMSS/controller.json` and `gate.log`
under the same20261019 directory, followed by `c7-terminal.md` with the actual
commit, source/blob hashes, test counts, cleanup and protected-runtime witness.
Do not prefill a future PASS or append a post-commit tracked edit just to
repeat an unchanged heavy gate. Private terminal evidence is not committed
credential/config data and remains available for Bobby's inspection.

### Later source/peer observation —04:46–04:53Z

Read-only four-source cut04:46:08Z–04:46:37Z keeps all four HEADs above.
PM tracked-WIP hash advances to
`904ca5aa9f14df1d3003f599caf215a15b5dc9d495630ed8dbada3d79ff640c1`.
PM owner now reports restored metadata successor,41running/0paused and absent
guards at the reported cuts; this audit did not inspect private metadata or
probe its runtime. Public status is still
`SUCCESSOR_RUNTIME_METADATA_PINNED_SOURCE_CENSUS_PENDING_NOT_LAUNCHABLE`,
actual_cases0/runtime_mutations0. Catalogue/discovery/history/runtime43/SSE and
matched17 hashes are unchanged. No new provider/calibration/budget/G2 PASS.
Exact public locators/content hashes: private `source-audit/final-delta.md`,
SHA-256 `d3a9a98a40a1c93866e8025d12368ca254593dd345dd0e1b31276e0af2f95ca4`.

Peer read pin04:53Z is `4f892c47dcdb984cdddc752d218e504b7a61b10e`:
five FE-only commits/58files,+1519/−136 after the entry peer. New Access/Admin/
Users/Compare and sync-ledger WIP is observed, not staged, overwritten or
treated as committed producer input. No peer merge/rebase/push is done here.
Claude can review this contract delivery once its normal-hook commit exists;
browser/source acceptance and all individually open requests remain separate.

### What can continue / exact remaining gates

- Codex: finish this coherent normal-R3 landing, then FE-054 exact-decimal
  contract and the individually triaged local requests, without altering
  accepted UI or installing an external authority as a shortcut.
- Source owner package: exact Research target, current-human provider/trust/
  policy pins and revoke/COMMIT/replay/close matrix; current PM finite/SSE
  qualification is not supplied by a Core test-double or by stable39.
- Financial/config owners: qualified source inputs and explicit calibration/
  budget artifacts; matched17 measurement inputs must be filled and approved
  before reserved coexistence/G2. These are concrete required inputs, not
  permission to choose production parameters from fixtures.
- Claude: accept public ACK currency/int64/eligibility and derived-view repair;
  consume optional native headers without treating them as authorization.
  Rebase/landing uses the new producer pin only when canonical is clean and
  Bobby's workflow allows it. Current qualified-source browser lane is NOT_RUN.
- Whole ELP2-10 remains NOT_MET; ELP2-11 is NOT_ENTRY_READY. No source activation,
  frontend design change, dev/main merge, signed release, deploy or remote push.
