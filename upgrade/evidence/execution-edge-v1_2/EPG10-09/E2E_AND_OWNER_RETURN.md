# EPG10-09 — E2E, durable command and recovery

Tracking authority: [main plan §23.18](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2318-epg10-09-e2e-command-and-recovery-execution--2026-10-16).
Requirements: [Edge09](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#epg10-09-kiểm-thử-e2e-dữ-liệu-command-và-recovery),
[BE14–17](../../../upgrade_v1.2/EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md),
[FINAL Score11–12/A](../../../upgrade_v1.2/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md),
[decisions4–5/7–9](../../../upgrade_v1.2/REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md).

## Disposition

Independent implementation/test/cleanup round COMPLETE:606 final tests PASS,
zero FAIL/skip/ignored; fmt/strict zero-warning Clippy PASS. No known owned
defect remains in tested scope. Phase status stays IN_PROGRESS because full
three-system09 acceptance is NOT_MET until the connected returns below pass.
No activation, financial command, shared DB mutation or peer source edit.
Independent and connected rounds are separate per the owner's parallel-work rule.

## Owned verification boundary

Reuse the accepted04–08 runner and Rust modules, not a second framework:

- `scripts/epg10-04/{run.py,test_run.py}`: explicit09 profile, same ten unit
  crates, Edge binary, strict TLS, bootstrap/read/resource/manager/command PG
  suites. Exact counts/hash-bound inputs, isolated ownership/cleanup and locks.
- `projection-store-pg/tests/epg10_09/read_e2e.rs` (child of05): staged group
  invisible through scoped query/replay; atomic two-entity COMMIT; lost-ACK
  retry/reconnected store; history/replay no duplicate; resync/rebootstrap same
  payload digest; old cursor rejected; correction/tombstone current/history/SSE
  convergence; unavailable command does not poison independent read; changed
  scope/current revocation refuses old export continuation.
- `.../epg10_09/command_e2e.rs` (child of07): real PG correlation survives
  new store/relay; actor/workload/full receipt preserved; fixture one-send;
  second connection cannot read uncommitted delivery; SQL rollback leaves
  UNKNOWN; conflicting terminal receipt cannot overwrite truth; ACK/restart
  never fabricates APPLIED/REJECTED or enables disabled sending.
- `scripts/epg10-09/oracles.py`: consume exact committed Research calculator,
  decimal helper, existing tests and exact guide block. No copied formula in
  Edge runtime; no fixture anchors promoted to runtime defaults. Vite writes
  cache only inside the disposable target, not peer checkout/dependencies.

Target `/tmp/epg10-09-pJye2Rpu` on SGP; PG runs only there with fresh ephemeral
credentials, no volume, dynamic loopback port. Test producer proofs/current
policy/command port are explicitly TEST_ONLY. Persistence/SQL transactions are
real; they do not prove native source fencing, broker effects, HA, actual user
trust, service/process failover or production capacity. Store/relay recreation
is not falsely labelled host/process crash evidence.

Inherited PG04 `t04_02_database_disconnect_before_commit_and_lost_ack_after_commit`
does terminate the exact disposable PostgreSQL writer backend while checkpoint
COMMIT is paused, checks zero visible facts/no cursor advance, then retries and
reconnects after durable COMMIT. This is real DB-backend termination/rollback,
not termination of a TS publisher, Edge worker, Research/BFF or whole PG host.
Those actual multi-service crash cases remain in the connected return below.

Reproduction uses existing `scripts/epg10-04/run.py` and `test_run.py`, exact
`qualification.json.input_hashes` source layout and helpers from03/06; no new
test stack/framework. Select `EPG10_TEST_PROFILE=09`, baseline revision
`cfeeee7e6dc4680dd736ac4e4076ea997d9cbb87`, expected PG counts
bootstrap22/read42/resource8/manager11/command27 and TLS12. Rust toolchain1.85.1,
cached PG digest and finite resource envelope are in the receipt/main plan.
After its PASS/lease release, run `python3 -B oracles.py` from the exact private
target with a fresh lock. Oracle inputs are committed Research630eafc5, not
staged commissioning WIP; no package installation or peer build is needed.

## Actual verification and cleanup

| Final executable gate | Result | Receipt |
|---|---|---|
|Runner90 + Rust libs250 + Edge42 + TLS12 + PG22/42/8/11/27|504PASS,0FAIL/skip/ignored/filtered; fmt/compile/check/strict Clippy PASS|[qualification](qualification.json)|
|Exact FINAL reference + existing Research vectors + rolling peak-exit|47+54+1=102PASS,0FAIL/pending/skip; altered guide denied; no new calculator|[shared oracles](shared-oracles.json)|
|Source binding|All428 local source hashes + manifest and final helper/oracle hashes match; repeated90helper checks not double-counted|Both receipts above|
|Failure history|Attempt1 TLS fixture root; attempt2 comment lint. Both owned defects fixed; full final run passed|[bounded attempts](attempt-history.json)|
|C4 teardown and protected runtime|8,386,752,512B allocated test files removed; target/PG/process/lease absent; all23 runtime tuples unchanged|[final reconciliation](final-reconciliation.json)|

No operational source requests, shared DB writes or financial commands;0new
images/pulls/BuildKit cache/volumes/networks. Root free
159,602,663,424→167,988,871,168B is observational on a shared host, not an exact
capacity claim. Test PG/TLS keys/cache/logs were discarded; no operational
release/rollback/source/private PKI or peer dependencies removed. All phase
timings/CPU/RSS/IO/WAL remain explicitly capacity-tainted. Docker inventories,
canonical/release/runtime image+config tuples, six active worktrees and named
recovery retention are in reconciliation. No shared prune.

Peer audit: [source review](source-review.json). Active Research commissioning
advanced to29staged files at14:15Z, but terminal retake/current real provider
return not yet supplied. Existing committed oracle is usable; moving WIP is
not certified actual authority.14:30Z recheck: same HEAD/diff/packet, terminal
receipt still absent, actual provider uninstalled and identity UNMAPPED.
TS/PM/DL source branches were not changed.

## T09-01…21 exact traceability

The rows below name the executable independent boundary and the **additional**
full-case requirement. No row earns full PASS just from a matching unit vector.
`PG04/05/06/07`, `TLS08`, `Rust` refer to suites in the final qualification
receipt; `Research` and `FINAL47` to the shared-oracle receipt. Execution counts
and exact outcome are recorded in the receipts above, not inferred from this
table. Full connected21cases:0PASS/0FAIL/21NOT_RUN(BLOCKED_DEPENDENCY). This is
an execution gap register with named inputs, not21skipped automated tests.

| T09 | Full connected result | Independent assertion / executable boundary | Connected round2 requirement / owner |
|---|---|---|---|
|01|NOT_RUN / BLOCKED_DEPENDENCY|PG04/05 bounded catalogue traversal, atomic group/history/field exactness; Research cashflow metrics|TS/PM complete authenticated financial dataset/history → Edge → Research report/BFF receipt; current-page96relations is not full history|
|02|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 cash-flow TWR/PnL fixtures; Research net-ledger path semantics|PM attributable flow/cost/valuation facts + Research identical source-set/window and approved accounting oracle|
|03|NOT_RUN / BLOCKED_DEPENDENCY|PG07 timeout/UNKNOWN/restart/same-key/actor/revoke; new full-receipt tests|PM actual port/full durable outcome,08 native current lease through COMMIT, target/effect/version correlation and authorized Demo operation if trading flow|
|04|NOT_RUN / BLOCKED_DEPENDENCY|PG04 atomic rollback/fencing; new PG05 retry/reconnect/resync payload digest and old cursor denial|TS native publisher fence; authenticated snapshot/delta/retention; actual source/export/consumer/BFF crash-and-recovery receipt|
|05|NOT_RUN / BLOCKED_DEPENDENCY|Rust scope/profile contract negatives; TLS08 strict peer verification; PG05 scope-bound cursors|Verified human/workload/profile mapping and actual Paper/Sandbox/Live composition; existing08 workload-read qualification is not new09 human E2E|
|06|NOT_RUN / BLOCKED_DEPENDENCY|PG06 resource admission/overload/backpressure; runner CPU/RSS/WAL observations|01 approved measured budgets +06 connected coexistence/F-LOAD with TS/DL/Research; isolated timing is never production capacity|
|07|NOT_RUN / BLOCKED_DEPENDENCY|Shared Research calculator vectors, PG05 correction/tombstone lineage|Research source-set/version/window report/BFF output and correction invalidation with actual PM sources/config|
|08|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 regime fixture/abstention; Research continuity binding tests|Research approved regime runtime/source features/reference cutoff, stage/run/version binding and no-lookahead integration|
|09|NOT_RUN / BLOCKED_DEPENDENCY|No lifecycle/allocator action added to Edge; existing scoped read/resource controls only|TS/PM Archive watch publication/retention + Research bounded cadence integration and zero-actuation proof; lifecycle case NOT_RUN without that input|
|10|NOT_RUN / BLOCKED_DEPENDENCY|New PG05 unbound-command/current-read isolation; Research policy_pending tests|Actual certified independent read + absent score/command provider composition at BFF; no global gate|
|11|NOT_RUN / BLOCKED_DEPENDENCY|Existing DTO/lineage contracts; no clone/mutation API added|TS/PM explicit authorized Archive/Paper-clone disposition + Research original-history/scope lineage receipt; actual disposition NOT_RUN|
|12|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research P80/R66/B70 →73.3/fair, unrounded band boundaries|Same source-set/window/version report/BFF/UI parity (UI evidence belongs to Research/FE, no UI implemented here)|
|13|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research composition/coverage/direct-NAV independence vectors|Research actual missing-input/diagnostic partition and authoritative NAV/currency/source coverage|
|14|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research provisional same-value/maturity and allocation vectors|Approved horizon/basis/maturity runtime calibration; real5d/30d independent-facet output|
|15|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research missing Sharpe62.5…76, partial stress/cost dependencies|PM complete attributable baseline fees/notional/cost facts + Research partial DTO propagation|
|16|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research stress .009 and monotonic/guard vectors|PM fill-side dedupe/instrument notional/cost/transfer authority; actual stress input proof, no fabricated turnover|
|17|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research path/grid/block/late-cost invalidation vectors and deposit TWR7.1%/PnL9.1|PM event-time valuation/flow/cost/FX watermarks + Research report completeness and correction proof|
|18|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research actual-path continuity/mixed forward non-economic semantics|PM/TS predeclared source selection/config/equivalence/handoff facts + Research actual stage stitching proof|
|19|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research direct portfolio/coverage/grouping/allocation vectors|PM unique account ownership/internal-transfer elimination + Research manager consolidation proof, not mean child scores|
|20|NOT_RUN / BLOCKED_DEPENDENCY|Research TEST_ONLY/policy_pending exclusion; Edge independent command/read gates|Owner-approved runtime calibration + Research availability isolation; actual authorized reduce-risk acceptance needs07/08 command authority|
|21|NOT_RUN / BLOCKED_DEPENDENCY|FINAL47 + Research finite/overflow/path guards; rolling peak-exit oracle|Research full rolling-window correction/invalidation and serialization on same actual source-set/window; no fixture financial certification|

## XLC01…11

| XLC | Full connected result | Independent evidence | Remaining full connected proof |
|---|---|---|---|
|01|NOT_MET / BLOCKED_DEPENDENCY|08 authority adapters/typed denials + PG07 identity persistence|TS/PM current human/workload authority, no self-elevation through actual COMMIT|
|02|NOT_MET / BLOCKED_DEPENDENCY|PG05 whole traversal and bounded retained-history export|Authenticated full published catalogue/history and matching Research coverage|
|03|NOT_MET / BLOCKED_DEPENDENCY|PG04/05 atomic checkpoint, replay, resync digest|03 native stale-publisher fence and actual crash recovery|
|04|NOT_MET / BLOCKED_DEPENDENCY|PG07 durable correlation/UNKNOWN/full receipt with TEST_ONLY port|Native same-key one economic effect + actual target receipt/UI terminal correlation|
|05|NOT_MET / BLOCKED_DEPENDENCY|PG05 current-policy/cache/cursor/SSE and08 controls|Actual revocation timeline across Research and native transaction COMMIT|
|06|NOT_MET / BLOCKED_DEPENDENCY|PG06 bounded isolation, no capacity claim|01/06 measured integrated budgets/fault/reconnect coexistence|
|07|NOT_MET / BLOCKED_DEPENDENCY|Shared numerical/capital oracles, PG correction history|Authoritative money facts/attribution and corrected Research reports|
|08|NOT_MET / BLOCKED_DEPENDENCY|Fresh source/runtime pins, honest fixture/connected split|09 full connected correlation + scoped release/rollback sign-off; P184 performance gate not waived|
|09|NOT_MET / BLOCKED_DEPENDENCY|08 selected-field/current-link fixtures and denials|Actual full-manager and accepted restricted-researcher identity/policy composition|
|10|NOT_MET / BLOCKED_DEPENDENCY|02 DTO/lineage contracts; no Edge lifecycle authority added|Authorized TS/PM disposition and Research Archive/watch/manager lineage integration|
|11|NOT_MET / BLOCKED_DEPENDENCY|Only existing shared calculator/reference consumed|Approved calibration/source-set/correction/cache/compute runtime evidence in Research|

## Integration debt, same09 round2 (not new subphases)

| ID | Owner / exact input | Affected scope / exit |
|---|---|---|
|09-SOURCE|TS native publisher owner/generation/lease fence + paused-old-writer drill; PM13 complete capture coverage, authenticated snapshot/delta/archive, retention/source permits|01/02/04/07/09/11/15–19 source-dependent assertions. Bind exact qualified artifact when returned, run original03/04/05 dependencies and09 matching-source digest/recovery. No fake source endpoint|
|09-COMMAND|PM14 network-mounted typed intent/full outcome/status/recovery port and current human/workload provider; inherited08-COMMAND-COMMIT native lease/race proof|03/20 command branch and XLC01/04/05. Correlate original actor/key/digest, owning receipt, target version/effect; run revoke-first/commit-first + lost response + recovery, no automatic retry|
|09-RESEARCH|Research commissioning coherent tested commit/runtime target, verified identity mapping/current-policy/accepted fields, approved metric config/source-set, ELP2-10/11 and applicable FE receipts|Report/BFF/current-scope/correction/Archive/metric parity branches. Bind shared version, run actual scoped positives/negatives/revoke and source-vs-report comparison; optional metrics do not block unrelated certified read|
|09-LOAD|TS/DL/Research real source/coexistence workload and clean measurement window; Edge owns binding/measuring01/06 production budgets on those inputs.06 isolated numeric sizing/instrumentation/target preparation already complete. Impacted trading flow additionally actual OKX Demo certification|06/XLC06 production-load acceptance only. Finish connected Edge composition/observer and measure all processes/replicas, burst/outage/resync and correctness reconciliation with no unexplained gap/duplicate/loss/latency regression; no owned preparation deferred as external debt|

These are genuine external publication/business-authority/configuration and
measurement dependencies, not a label for failed owned tests. Inherited08 debts
stay in08. An available return immediately makes the matching binding/test work
runnable in its original phase. Do not require all PM13/P184 for an independent
current-read trust return; do not reopen the already-repaired TLS-expiry issue.

## Release / recommendation

No09 runtime release or promotion. Existing active + named rollback artifacts
remain protected; own test resources cleaned completely. No independently
runnable09 code/test/cleanup remains. Recommend Bobby approve10 independent
shadow/fenced-cutover/rollback preparation and isolated drill now; actual
connected cutover/release still requires the applicable returns above.
09 round2 integration/tests run as each exact input arrives in the original
phase.10/11 remain NOT_STARTED, no repeated approval required for09. Do not
claim full09 complete or three-system production readiness from this packet.
