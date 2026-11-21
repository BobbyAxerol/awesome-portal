# ELP2-06 — Descriptive Regime worker/publication chain

Status: IMPLEMENTED_NORMAL_HOOK_PENDING. Claude: NOT_STARTED_BY_OWNER_DIRECTION;
handoff: AWAITING_CONSUMER_REVIEW. This packet does not approve production
calibration, source acceptance, current-human installation, runtime activation,
commands, browser acceptance, release or dev/main promotion.

## Scope, pins and authority

Bobby's approved [02–11 backend batch](../../../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-backend-gap-batch-02-11)
and latest direction to finish independently implementable backend apply.
Repository `/home/bobby/portal-research`, branch `docs/research-loop-plan`,
entry HEAD `fdab164ce0187ac164efbf30ee232e8f3e1d5f3a` after Composition landing;
entry working tree clean. Primary owns shared contracts/integration/Git/docs;
independent agents supplied private source review and isolated module/test
drafts. No frontend or producer worktree edits.

Read with [FINAL Score/Regime specification](../../SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md),
[backend guide](../../EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md),
[private calculator foundation](regime-calculator.md), and
[canonical gap census](../ELP2-10/commissioning-followthrough.md#elp210-backend-gap-census-20261017).
No formula, weights, bands or scientific qualification is changed here.

Latest read-only PM observation: HEAD
`a156f21a49f8be165153b8ea678d53540d60e406`; normalization proposal digest
`a4b9a570ef0926776fe6b12e2ce9931e67a3720e5def7d3cd8b0153d418ca800` remains
NOT_JOINTLY_ACCEPTED / NOT_INSTALLED. Native correspondence/instance-history
and capital-history owner WIP exist; preserve them. Do not describe this as
merely a missing environment variable or infer authority from source code.

## Delivered implementation boundary

- Separate bounded policy artifact plus independently pinned approval, and
  independently accepted source/evidence artifact. Byte hashes, exact workspace/
  environment/profile/catalogue, research/version/params/trade-params mapping,
  knowledge cutoffs, reference census, archive and monitoring provenance are
  checked before creating private WeakMap handles. Public JSON flags cannot
  mint handles; cloned handles fail. Missing receipts never become true/zero.
- Existing pure calculator remains off-request. Regime joins the existing
  bounded serial Manager worker, not another poller/queue. Combined Score,
  Composition and Regime task ceiling is128; source supplied result arrays are
  refused. Independent missing Regime inputs preserve valid financial slots.
- Immutable projection/store/checkpoint/ACK are reused. Lost ACK/restart reuses
  exact stored worker bytes/timestamps; source corrections append revisions.
  Policy-only recalculation without a new source revision remains a separate
  open immutable-revision protocol; do not rewrite an existing revision.
- Manager reads require exact authorized alpha/version/deployment population
  and correlated tuple→stage census before filtering/paging/statistics. Generic
  deployment binding and research binding IDs are distinct namespaces; no
  invented equality. Explicit `regime`, `binding_id`, `provenance_ref` fields are
  necessary, not newly granted by this change.
- Recheck private current policy/evidence after the last awaited scope check.
  Current expiry/revoke withholds an old accepted result. These sequential
  fences are not a held atomic cross-authority COMMIT fence.
- Corrected Composition's analogous tuple/stage swap with a private full-
  census fence; preserve approved empty census, full denominator and auxiliary
  diagnostic independence. No new public Composition formula or input.

## Contract and consumer handoff

Additive `ManagerRegimePublication` and optional `regime_details` on the same
six named Manager GETs. Generated type: `packages/contracts/generated/execution-manager-models.d.ts`;
OpenAPI `execution-manager-models.openapi.json`; canonical synthetic fixture
`fixtures/execution-manager-regime.synthetic.valid.json` is generated from the
actual deterministic runtime result, not a real source/product receipt.

`scores.regime.value` is always null. Summary statuses are supported,
weak_support, out_of_support, insufficient_data, stale, unbound, or unavailable.
Only a single exact Alpha/Deployment publication may set its summary. Fund,
Portfolio, Account and Fleet do not invent aggregate Regime scores. Detailed
historical stage results retain research-simulated / forward-simulated / actual
separately; no pooled ESS, probability, forecast, numeric score or Preview.

Claude, once assigned UXM-08, should consume `regime_details[].result` with
neighbor/episode counts, distances, stage breakdown and descriptive net-TWR
outcomes; show approved policy/evidence provenance and typed reasons. Use UTC
epoch-ms and canonical decimal strings. No recomputation or inference from
empty financial facts, deployment binding IDs, labels or fixture constants.
Run `npm run generate:execution-manager-models` in packages/contracts using
the repository dependency environment; no handwritten consumer types.

Delivery levels remain separate: contract published / code landed / runtime
qualified / consumer accepted. This batch cannot mark the last two achieved.
No new frontend request ID duplicates existing ELP2-REQ-06-001/002 or00-005.

## Validation and resources

Expected focused gates: real calculator and byte-loader regressions, actual
disposable PostgreSQL worker→store→service/controller constructor chain,
scope/field/census isolation, corrections, lost ACK/restart, source injection,
final-await revocation, economic-slot independence; existing Manager/read-scope
regressions, API build and scoped PG dump/restore. Focused and normal-hook
results are PENDING until terminal records below. Never add overlapping suite
counts as new coverage. Canonical schema/fixture parity runs in normal hook.

Approved single cell:4CPU/4GiB/8GiB transient; Node3CPU/3GiB, PG1CPU/1GiB.
No HK/source jobs, engine/browser/load/DR reruns or shared runtime restarts.
Actual resources, source hashes, protected runtime tuples and exact teardown
are retained by the private commissioning controller. This is correctness,
not coexistence/G2 or production budget approval.

## Exit, rollback, debt and next work

Local chain exit PENDING_NORMAL_HOOK. Full06-002/00-005 remain OPEN for qualified real
source/config installation, connected tie-out, policy-only revision protocol,
compatible cross-profile navigation and consumer acceptance. ELP2-10 also
retains exact native-grant/COMMIT trust, approved budgets and matched G2.

Rollback: leave adapters uninstalled; revert reader/materializer code only in
a reviewed coherent change. Keep immutable existing revisions, source facts,
permissions/audit and storage migrations. No data deletion or runtime flag flip.

Backend next independently can continue exact resource/environment relations,
other positive reader adapters, remaining command/workflow adapters and the
concrete realtime source/coordinator in the approved batch. Source-dependent
activation remains conditional. Frontend remains owner-held; handoff awaits
assignment/acknowledgement. ELP2-11 not entry-ready; no sign/deploy/dev/main.

## Actual focused receipt and correction — 2026-10-17

`regime-focus-080347` stopped before tests/resources because the initial
sandbox could not perform the existing sudo runtime inspection (`no_new_privs`).
No guard was bypassed. The approved escalated `regime-focus-080405` ran the
canonical cell: APIbuild PASS;335/336API PASS, one test FAIL; six of seven
files wholly green. All16actualPG worker→store→service/controller cases PASS.
The failing cancellation test awaited a second immediate capacity refusal,
yielding to completion of the first calculation before it aborted. Corrected
the test to request both operations, abort while the first is pending, then
await each outcome; no runtime behavior or acceptance assertion was weakened.
The failed receipt is preserved, not relabeled as a full focused PASS.

Controller finished08:08:12UTC at
`/home/bobby/.local/state/portal-execution-elp210/20261017/regime-focus-080405/controller.json`;
logsha256`2566013801165747e22026fe0fc30ddf240d65bd6fbf6e198c9bdb7f90320ac6`.
Source unchanged,8protected runtime tuples unchanged, owned resources empty.
One sample08:06UTC:Node1.101GiB/3GiB, PG76.21MiB/1GiB; this is not peak or
coexistence performance. Canonical fixture was captured from the actual
deterministic runtime result in that log and now has an exact runtime equality
assertion plus public OpenAPI/Zod/JSON Schema parity and six contract cases.
Fixture pins are synthetic, not actual source/calibration approval.

The final coherent normal hook validates that correction, fixture and contract
cases with all impacted suites once; do not run a redundant separate full
focus just to obtain a second green count. Terminal record is
`regime-land-*/controller.json` in the same private root and can claim PASS
only on exit0. Source review ACCEPT_SOURCE_ONLY, not independent test execution.

### Landing resource precheck — 08:16:30UTC

Normal-hook attempt did **not start**: the controller waited its bounded300s,
then exclusive lease acquisition failed because PM's capital-history owner
still held the canonical window. Advertised until08:13:24UTC is not proof its
resources are idle. No staging/hook/test/resource creation occurred; no peer
lease/process was removed or bypassed. Private exact receipt
`/home/bobby/.local/state/portal-execution-elp210/20261017/regime-land-wait-081630.json`.
Regime remains uncommitted/PENDING_NORMAL_HOOK; corrected cancellation/fixture
and six new contract cases remain NOT_RUN on final bytes. Existing335/336 and
16PG results remain their exact historical scope. Retry the one coherent gate
once the peer releases capacity; do not repeat unaffected engine/load/browser.

### Shared-hook failure and owned fixture-path correction — 08:39UTC

The peer's configured normal hook finished exit1, HEAD unchanged, at08:38:59UTC:
4773API PASS,1FAIL,3existing skips. The sole failure belonged to this Regime
batch: its fixture assertion resolved the checkout-relative contracts path,
whereas `scripts/control-api-test.sh` deliberately mounts contracts at
`/contracts` and supplies `PORTAL_CONTRACTS_DIR`. The actual fixture exists.
The test now uses that environment variable with the existing checkout fallback;
no assertion, fixture value or runtime bound was weakened.

Preserved failed terminal receipt:
`/tmp/epg10-current-relations-commit-y_b6mqta/receipt.json`; complete logsha256
`79e65431ecd4a50215b168e59852058b4da9838bd7bd1117c90e4da10ea73bc3`.
The corrected cancellation test passed in that hook; this is not a full PASS
or a Regime commit. The peer's12staged paths remain untouched. Subsequent
owned Regime/realtime focus reserves its own single correctness lane, preserves
the exact foreign index and eight protected runtimes, and records final bytes.
No source/runtime or consumer acceptance is inferred from this fix.

### Corrected Regime/realtime focused terminal — 08:52UTC

The single owned cell finished2026-10-17T08:52:23.606411Z, exit0:
**407/407API tests in8files PASS**, APIbuild PASS and the existing scoped
PostgreSQL dump/restore gate PASS. This includes16actual-PG Regime chain cases,
41Regime runtime cases and the new Hub/Manager lifecycle regressions. Counts
overlap the earlier suites; they are not407new cases. The canonical contracts
suite and final normal-hook commit remain PENDING, not covered by this focus.

Terminal controller:
`/home/bobby/.local/state/portal-execution-elp210/20261017/regime-focus-084531/controller.json`;
logsha256`6f5b10aaf8287a835dd32c472bc6cbd976bd67c81f90c0a8a93d56b6707e1364`.
Exact source and foreign index unchanged during the gate; eight protected
runtime tuples unchanged; owned containers/network removed and lease released.
Sample08:49:41UTC:Node907.4MiB/3GiB, PG70.77MiB/1GiB,156GiB disk free(25%).
These are samples, not peak/load/G2 measurements or approved production budgets.
The earlier failed receipts remain historical failures. Code is UNCOMMITTED;
foreign staged ownership is preserved. Qualified source/config, policy-only
immutable recalculation and consumer/runtime acceptance remain OPEN.

### Impacted public-contract terminal — 09:04UTC

The subsequent reader/workflow correctness window passed 84/84 contract tests
in `execution-manager-models.spec.ts` and `execution-workflows.spec.ts`, including
this batch's new Regime schema/fixture parity. Its API gate passed 247/247 tests,
API build and scoped PG restore; these API suites do not replace the dedicated
407-test Regime/realtime receipt above. [Exact shared-window receipt](../ELP2-04/finite-retained-aliases.md#terminal-focused-correctness--2026-10-17t090412z).
This supersedes the earlier pending impacted-contract result, not the pending
full normal-hook/commit, genuine source/calibration or browser gates.
