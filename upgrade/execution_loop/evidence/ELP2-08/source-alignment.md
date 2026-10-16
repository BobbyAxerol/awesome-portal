# ELP2-08 — source workflow and obligation alignment

Observation window: **2026-10-16 09:41:43–09:42:51 UTC**, read-only SSH to
`bobby@16.163.212.33`. Portal entry:
`docs/research-loop-plan@3d537127313fb3c282eda054fd180499fe4732ca`.
This subtask owns only this document. No remote writes, tests/builds, API calls,
business DB queries, runtime/container inspection, credentials, branches,
activation or command dispatch. Source observations are not one atomic runtime
snapshot. ELP2-07 source receipt remains historical; deltas below supersede only
its corresponding source-status assertions, not its actual tests or limits.

## 1. Fresh pins and concurrent source work

Both paths are under `/home/bobby/.worktrees/` on HK.

| Worktree | Branch | Full SHA | State observed |
| --- | --- | --- | --- |
| `trading-system-pm-v1_1` | `feat/portfolio-account-v1_1-parallel` | `d16aa2b5f251596e469807f57e81fe14cdc7e763` | Clean, unchanged from ELP2-07 |
| `portal-execution-edge-upgrade-v1_2` | `feat/execution-edge-upgrade-v1_2` | `e15e7064dba5f9cc912ce52198dfc450ccf6d3e8` | Concurrent EPG10-07 WIP; exact paths below |

Edge advanced from ELP2-07's `f762730f...` through `b13828b15a1178b26e7c6f6e29472d816b3526ba`
(agent workflow docs) and `e15e7064...` (EPG10-06 offline sizing/target
preparation). Dirty tracked paths at initial/final check:

- `services/portal-execution-edge-rs/crates/command-relay/Cargo.toml`
- `services/portal-execution-edge-rs/crates/command-relay/src/lib.rs`
- `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`

One untracked public source path:
`services/portal-execution-edge-rs/crates/command-relay/src/durable.rs`.
Preserved; no import, checkout, stash or modification.

SHA256 of Edge `git diff --no-ext-diff` at initial/final check:
`d3fa02020214b528842da5316483f6a6c518d76c189a2038cf51e5c9473dc739`.
Its untracked path-list hash (`git ls-files --others --exclude-standard`):
`aa804ca4597579a0c6943f5b0ae3a5e4004a6acc57c42cc8550b26ba854a1734`.
All staged diffs and PM tracked/untracked outputs were empty, SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

### Guide and journal pins

| Worktree / relative path | SHA256 |
| --- | --- |
| PM `upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md` | `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945` |
| PM `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` | `96ee825d90a33f3cab614b8c7053408fc34b6ae965db867e6efc33ef769735fd` |
| Edge `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` | `21e2ff154d51c54fb36ac11ed199245fb4277410ca778d4b6695a2c0dc6d4887` |

PM R2 remains the authoritative guide in the **PM worktree**, not the
non-authoritative TS/Library copy. Economic backing, margin/risk budget,
independent exposure cap and native capacity stay separate; no universal1×
semantics or transfer inference is introduced by workflow projection.

## 2. Meaningful source-status changes since ELP2-07

**Edge EPG10-07 is now BOBBY_APPROVED / IN_PROGRESS**, not NOT_STARTED.
Current journal §23.16 at12291–12350 records its pre-code scope and acceptance
plan. It explicitly preserves default command denial, exact operation/profile
authority, durable correlation, no ambiguous resend and read/status recovery.
This is a source/WIP status observation, **not implemented/tested/runtime PASS**.

At the inspected bytes, `command-relay/src/lib.rs:52–65` still returns
`COMMAND_RELAY_DISABLED`, `retry_allowed=false`, `source_request_sent=false`.
The new untracked `durable.rs` contains bounded internal command scope/intent,
payload validation and delivery/business values. Its header says pure internal
values; construction authenticates no authority. Reading these WIP values does
not qualify a durable store, mounted endpoint, TS commit, active relay or
financial receipt. Do not depend on uncommitted source as a stable wire contract.

The Edge journal records foreign HK measurement lock `claude-drain-rate`,
09:30:38–11:30:38 UTC. We read source only and launched no workload. The preceding
EPG10-06 entry reports offline preparation results and preserves full06 NOT_MET;
those are **reported historical evidence**, not tests run or capacity certified
by this subtask. No additional test count is earned by reading the journal.

PM journal §58.63 still reports15/16 IN_PROGRESS. Qualified registration/compiler
providers, actual sender/readback, complete multi-step/Paper effects, historical
source and export/full-campaign integration remain unfinished. No change in PM
source makes capital/management actions automatically executable through Portal.
Previous ELP2-07 trust/publication/operation debts remain canonical; do not mint
new duplicates just because workflow fixtures now describe them.

## 3. SOURCE_CONFIRMED workflow constraints for ELP2-08

Locators are relative to PM `services/portfolio_management/`. These are
candidate/pure/repository source semantics, **not deployed operation claims**.

| Requirement / source locator | Constraint for public workflow states and fixtures |
| --- | --- |
| T08-02, `instance_contract.py:101–145`; `instance_repository.py:210–237,256–300`; `operator_management.py:192,253–260` | Registration starts `REGISTERED_UNFUNDED`; retry preserves original token/identity even after archive. Materialization/lifecycle receipt is not FUND, budget grant, trading activation or native execution. Funded lifecycle needs separate owning authority. CREATE_PORTFOLIO is a guide requirement, not a new route proved by this audit. |
| T08-03…05, `operator_api_contract.py:173–186,229–277` | Exact Decimal partition requested=applied+pending+cancelled+rejected. APPLIED/REJECTED/pending/cancel states have their own amount invariants. Applied capital (except root-limit) requires paired parent receipt; ACK is not source outcome. `physical_transfer_performed=false`. |
| T08-04/05, `recall_contract.py:1–6,25–85,90–145,170–189`; PM R2§7.9–7.10 | Immediate decrease is all-or-nothing and cannot consume older FIFO pending claims. Recall freezes original requested amount; pending is an overlapping intent on existing budget, not an extra disjoint amount lock. Release requires current scoped model/revision/fence evidence. Unknown/stale proof is not free cash. Cancel only unapplied remainder; applied is never silently undone. |
| T08-06, `lock_reallocation_contract.py:25–107`; PM R2§7.12 | AMOUNT locks are exact disjoint positive claims; ALL_NEW_RISK gate has no amount. Unlock takes exact lock/version and removes only that lock. No expiry/scheduler semantics or blanket unlock. Independent HALT/recall/ancestor/native reasons remain. |
| T08-06/17, `admission_contract.py:128–136,190–215` | NEW_RISK and REDUCE are separate. REDUCE may ignore only specific new-risk/recall restrictions under source reduction proof; ARCHIVED and other independent reasons still apply. Resume requires current ancestors ACTIVE/no restrictions, exact revision and risk/source proof; local unlock does not imply resume. Analytics unavailability is not an authority substitute or extra reduce-risk gate. |
| T08-07/08, `binding_contract.py:97–128,131–190`; `binding_repository.py:197–234` | Exact immutable account/deployment pair, two current portfolio authorities, same binding/root/currency, version and effective interval. Full move census has exactly positions/orders/reservations/unknown/locks/pending_recall/fees. Any nonzero gives PENDING_DRAIN. Empty census without exact capital receipts gives BLOCKED_RECEIPTS, not APPLIED. |
| T08-08, `binding_contract.py:131–190`; `binding_repository.py:217–234` | MoveProofs bind source/root/origin/target/account/assignment-version/currency plus budget-return, target-grant and residual-settlement receipts. READY_FOR_AUTHORITY_RECHECK is a preview, never business success. Only owning repository after recheck writes new assignment revision/causal refs and APPLIED. Original intervals/history remain for late attribution; Portal must not relabel prior facts by current owner. This read does not certify end-to-end late-fact ingestion. |
| T08-09, `binding_repository.py:180–194` | REVISE_BINDING permits credential revision only, preserving binding scope. Native rebind/profile transition is a separate guarded authority. Cannot reuse assignment move to silently change venue/native pool or bypass outstanding obligations. |
| T08-10, `binding_repository.py:201–208,232–252`; `operator_management.py:234–260` | Same accepted move can progress by same intent; APPLIED/CANCELLED reuse original. Cancel requires pending/blocked state and owned guard; already committed move needs a new authorized command. Preview has business_applied=false/reserved=false. Status absence remains UNKNOWN/QUERY_SAME_INTENT. |
| T08-12/13, `instance_contract.py:141–145`; `admission_contract.py:208–215`; PM R2§7.5 matrix | Lifecycle/stage independent. Source archive currently requires non-ACTIVE state, zero budget/no restrictions and complete zero census including active_children; known descendants drained too. Guide-level approved retention/disposition must not be treated as an already supported exception. Archive is terminal in this candidate source; no auto-reactivation/live, liquidation/cancel or return. |

### Archive / paper-monitor readiness

Portal/UX guide requires explicit residual disposition and optional separate
Paper clone lineage (origin deployment/version, reason, effective time, approved
config). The inspected PM registration/lifecycle/move implementations **do not
establish a commissioned CREATE_PAPER_CLONE command or archive-with-residuals
acceptance**. A contract may represent blocked/proposed/unknown states and
lineage as sourced facts, but must not manufacture a clone, call monitoring a
closed original position, move native economic assets into Paper, or silently
declare unsupported retention “accepted”. Missing source contract remains typed.

### Score / Regime boundary

No PM/Edge score formula/config authority changed in this audit. ELP2-06 shared
calculator and its canonical metadata remain the reuse boundary; actual runtime
anchors/calibration/config still require their own owner artifact. Workflow
fixtures can exercise q73.3 fair/provisional, raw vs contribution vs composition
vs direct, windows/duration and policy_pending **as synthetic examples only**.
They cannot open trading, grant hidden denominators or promote an unavailable
score to zero. This source subtask did not execute score numerical tests.

## 4. Selected public source byte pins

| Worktree / relative path | SHA256 |
| --- | --- |
| PM `services/portfolio_management/instance_contract.py` | `6effd65e8029c11397bbfc155598c2c6093e3955395a7d6207577b390b4c0ea5` |
| PM `services/portfolio_management/binding_contract.py` | `1bf9848a8e37ad9324cce0959b9b8df970df6efba36f6a413c5abc57b00814a5` |
| PM `services/portfolio_management/binding_repository.py` | `f1c8eef0a73b43aecc38cc9e4ba63cf304043c63b517bee0cdff0aff903ca48a` |
| PM `services/portfolio_management/admission_contract.py` | `16de4062f726346d9b89c08ac408c53e1e972f50db1a174934cbbd0e9fd38544` |
| PM `services/portfolio_management/operator_management.py` | `06540b3749495c24cecf15ad10abd1666459f3a5df730c5544e4640707f3e2a1` |
| PM `services/portfolio_management/operator_api_contract.py` | `20a8fb316ca8441dc46659416db58d5dee45c46218b4b84c71077293636c46f2` |
| PM `services/portfolio_management/recall_contract.py` | `904575d700faaa919190e24488b20dac69c6d9b0f9dd3a09e41b9ef66c251857` |
| PM `services/portfolio_management/lock_reallocation_contract.py` | `8e90855dc08c9457cb396cda218cefb767ef87cff11274cd263a354b2ef628cf` |
| Edge `services/portal-execution-edge-rs/crates/command-relay/Cargo.toml` (WIP) | `721d5f51dde1202067b34ca6a84a1e476fc3214a886483bb8e62271f887858f0` |
| Edge same crate `src/lib.rs` (WIP) | `aa0f1a729016ded2dd435969b0d5f747cde9dc26ee3d4ffb7ca05c71c643b9b9` |
| Edge same crate `src/durable.rs` (untracked WIP) | `f49605484d8626b0a5d092ab8f45c60c235f8c46d46b426ea8635224bdfc7769` |

## 5. Verdict, handoff and cleanup

**SOURCE_CONFIRMED:** fresh PM/Edge pins and WIP, current PM R2, exact capital
partition, registration distinction, scoped lock/recall/ancestor restrictions,
move census/receipt boundary, native-rebind separation and strict source archive
predicates. This supports honest state/fixture design and pure server projection.

**RUNTIME_VERIFIED: none.** Deployed image/schema, effective config/trust/mTLS,
actual source publication, enabled operation×environment/profile, current financial
facts, command outcome/recovery, browser/HiFi and real source-connected evidence
are NOT_OBSERVED. Do not infer them from source enums, this document, a journal
plan, another agent's isolated tests or the Portal ELP2-08 assignment.

No new duplicate debt ID is opened here. Primary should retain original ELP2-05/06/07
source/trust/consumer records and map unsupported archive/clone/rebind actions
to an explicit inherited source gap in the ELP2-08 matrix/handoff. Claude can
consume generated synthetic state fixtures when assigned, with command runtime
still disabled and source quality/provenance displayed. Backend phase readiness
and browser/design acceptance remain separate.

Tests run by this subtask: **none**, per read-only task map. Rollback is deleting
this additive document only; no runtime rollback. Cleanup **NO_ACTION_NEEDED**:
no remote files/keys, jobs, containers, networks, volumes or local build artifacts
created. Concurrent HK work and measurement lock preserved. No next phase opened.
