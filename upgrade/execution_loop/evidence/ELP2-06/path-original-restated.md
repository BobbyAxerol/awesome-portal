# ELP2-06 — Original PATH custody through historical revisions

## Scope card and authority

Approved02–11 backend follow-through, branch `docs/research-loop-plan`, entry
`0aad2697fe5f47977b1379329c3167f12aea3849`. Main owns five Score modules,
the existing PG integration spec and shared packets; delegated writer owns only
the new PATH custody unit spec, independent reviewer writes private notes only.
No frontend, new migration, public DTO/generator change, source installation,
credentials/grants, runtime build/restart, command, push/dev/main or release.

Requirements: backend guide §7 immutable derived revisions / original-restated
semantics; FINAL Score A19/E09, causal original versus later-policy analysis.
Continue `ELP2-REQ-06-002` and inherited00-005/05-001, not duplicate requests.
Previous terminal and phase census are linked in [History](scoped-score-history.md)
and [commissioning](../ELP2-10/commissioning-followthrough.md).

**Entry: APPLIED/UNCOMMITTED; new tests NOT_RUN.** This packet is implementation
and test scope, not a production calibration or source acceptance receipt.

## Requirement → implementation → affected validation

| Boundary | Implementation / test | Disposition before gate |
|---|---|---|
| Original method known before computation | Explicit private outer `path_dependency`, exact manifest JSON/hash and task marker bind source revision/set/as-of, scope, binding, full method tuple, input, original delta, availability and block-registration ordering | APPLIED, NOT_RUN |
| No retrospective invented proof | `manager-score-original-custody.ts` chooses v2 only for explicit bound outer proof; actual original source input digest and one write-once ORIGINAL pointer remain required | APPLIED, NOT_RUN |
| Legacy compatibility | v1 exact task bytes/root and input opaque markers remain unchanged; descriptor extraction retains old canonical tuple/sorted-cost hash; legacy v1 writer refuses a new outer sidecar rather than silently dropping it | APPLIED, NOT_RUN |
| Historical worker | `manager-score-restatement.ts` matches the retained method; only existing compute/calculation/policy-revision allowlist and independently approved delta may differ; input grid/costs/turnover/quality stay original | APPLIED, NOT_RUN |
| Worker result → retained decode → History | Strict bounded summary/raw-metric/provenance checks; genuine null/partial/stale/invalid outputs remain readable; no PATH calculation on GET | APPLIED, NOT_RUN |
| Current authority and immutable facts | Existing IDLE coordinator/lease/transaction fences, SQL138/139, authorized named revision/history readers reused; actual-PG tests cover final revoke, rollback and restart | APPLIED, NOT_RUN |

Owned implementation files under `apps/control-api/src/execution-v2/`:
`manager-score-runtime.ts`, `manager-score-recalculation.ts`,
`manager-score-original-custody.ts`, `manager-score-restatement.ts`,
`manager-score-history.store.ts`. Tests: new
`test/elp206-path-original-custody.spec.ts` and extended
`test/elp206-score-restatement.spec.ts`.

The new manifest is a **PROPOSED PRIVATE PRODUCER SIDECAR**, not an accepted
Portal↔PM/TS wire. A locator/self-reported availability is not source attestation.
An installed adapter must verify independently retained source proof before
supplying it; today's calibration cannot create that past proof. Original v1
PATH keeps `PATH_METHOD_PROOF_NOT_RETAINED`. Standalone decoding is not authority
and does not defend a DB owner replacing trusted source/result hashes/pointers.

All new positive examples use explicit SYNTHETIC authority, actual canonical
worker and, where stated, actual isolated PostgreSQL. They do not qualify a
source provider, production numeric values or an upstream write.

## Test/resource plan

One bounded correctness cell, maximum4CPU/4GiB/8GiB transient, private network,
one worker, no shared operational DB/ports/volumes. Controller:
`/home/bobby/.local/state/portal-execution-elp210/20261017/followthrough-gate.py`
`focus path`, then one coherent normal-hook `land path` after affected fixes.
Shared Core auth suite initializes the actual base schema for the existing
dump/restore proof; Score suites retain independent disposable DBs.

- New42 unit cases: v1 byte compatibility, exact method hash, v2 capture,
  coherently rehashed cross-binding and malformed/oversize/prototype inputs,
  anti-retrofit and genuine partial worker output.
- Extended PG chain: original pending → later policy IDLE → named revision/
  history → restart/archive without coordinator; delta/anchor revision keeps
  original bytes/K; method mismatch, seven genuine fault shapes, rehashed
  stored summary faults, final grant revoke and policy-revoke rollback.
- Reuse unchanged scoped-history/storage and worker-fence regressions in the
  affected run, not duplicate test counts. Normal hook owns final contracts,
  API build, actual PG and scoped restore. No engine/browser/load/G2 rerun for
  private PATH custody logic. Source acceptance/browser remain NOT_RUN.

Independent applied-code review: `ACCEPT_SOURCE_ONLY`, private
`20261017/path-integration-review.md`, SHA256
`98d3913ff7a0731a86ff52b34dc878b5c763133f9a245bcf6bdfe5042e2fdd1a`.
It is not a test/runtime PASS. Capture actual controller path/log/hash/results
below once terminal; do not prewrite green gates.

## Claude handoff and remaining work

No new public field or generated type. Existing
`executionManagerScoreRevisionGetV1` / `executionManagerScoreRevisionHistoryGetV1`,
`ManagerScoreRevisionView` / `ManagerScoreRevisionHistory` remain the only named
consumer surfaces. With future qualified source proof, bound PATH can produce
the same explicit historical-restated AVAILABLE/PARTIAL union. Preserve nulls,
typed reasons, original/source/knowledge/compute/feed clocks and opaque refs.
Historical Score is never operational-current and never silently replaces the
ordinary current Manager view. Private manifest/input/calculation keys stay off
the wire. See [published operation/fixture handoff](scoped-score-history.md#published-contract-and-future-claude-handoff).

Claude remains **NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW**;
no consumer/browser acceptance is claimed. Producer delivery does not reopen FE.

`06-002` remains OPEN: actual accepted proof/source-provider installation and
economic tie-out, dependent Composition/Regime historical recalculation,
cross-profile integration. Calibration00-005 and source05-001 remain separate.
Independent next backend: remaining finite reader collectors/purposes,
authenticated PM native/current-human bridge and command/replay composition.
ELP2-11 NOT_ENTRY_READY; keep source/trust/budgets/coexistence/P184G2 gates.

Rollback: leave the opt-in source/custody adapter uninstalled; disable new
callers, never erase/rewrite original source, immutable custody or restated rows.
No production rollback needed for isolated tests. Record owned teardown/lease,
capacity and unchanged protected runtime tuples with terminal validation.

<a id="path-affected-20261017-1404"></a>

## Impacted gate terminal —2026-10-17T14:04UTC

Controller `20261017/path-focus-140050`, ended14:04:52UTC exit1:
canonical APIbuild PASS;10files/295tests =294PASS/1FAIL, no skips. New unit42/42
PASS, actual coordinator PG36/37PASS (15new PATH tests included), existing
storage/worker/runtime/history/auth suites PASS. **No overall PASS**: the one
new final-grant-revoke assertion expected404 but actual existing final delivery
fingerprint fence correctly returned409 `EXECUTION_READ_ACCESS_CHANGED`.
Exact implementation `read-scope.ts:revalidate/deliver` was re-read; no
production behavior weakened. Corrected that assertion and added the subsequent
fresh-read404, zero worker calls and actual retained-row equality checks.
Normal hook must exercise these final bytes; no repeated unchanged focus run.

Log SHA256 `e77a9ab7d99ed03d3f3230a1fb7ea272cfb7e80bf8ba428475d331ce8715a05c`.
Source/index freeze and all eight protected runtime tuples unchanged. Exact
owned containers/network removed and lease released. Scoped restore NOT_RUN
because test exit1 stops the script. One observed sample (not peak/capacity):
Node112.77%CPU/1.152GiB of3GiB; PG0%/70.44MiB of1GiB. No source/runtime/browser
qualification inferred from these synthetic-authority actual-PG results.

Final grouped normal-hook landing remains PENDING; at this packet revision no
new commit or final full-suite/restore PASS is claimed. Earlier terminal History
commit remains `0aad2697`, not a PASS for the later PATH changes.

## Coherent landing gate

One normal-hook controller reserved at
`/home/bobby/.local/state/portal-execution-elp210/20261017/path-land-140613`.
At source freeze status is PENDING, not PASS. Read `controller.json` and
`gate.log` for terminal outcome and landed full SHA; no second unchanged focus
or hook bypass. Source/hash/index/runtime checks and exact teardown are part
of that controller, not inferred from a successful Git command.

Pre-gate capacity:9,873MiB available RAM;155GiB free filesystem/76% used,
above20% free; C4 `NO_ACTION_NEEDED`, no prune. Existing4CPU/4GiB/8GiB bounded
test budget unchanged. After this gate, continue real backend debt rather than
calling ELP2-06/10 or the campaign complete; genuine source, calibration,
coexistence and consumer gates remain open as listed above.

<a id="path-terminal-20261017-1432"></a>

## Actual normal-hook terminal —2026-10-17T14:32UTC

Controller `20261017/path-land-140613` finished14:32:36UTC, exit0,
commit `609d11dd67d7ecd22f363707fd1e9476c7c7aa89`. This supersedes the
pending landing entry above, not the preserved failed focus or external gates.
Normal hook:720contracts/64files PASS; Control API build PASS;
5,430API PASS/3existing SKIP,362files; actual scoped PostgreSQL dump/restore
and four access-row digest comparisons PASS. New PATH42/42 and complete
restatement37/37 are included; no separate unchanged retake is needed.

Controller SHA256 `aab856ff098eab1e361cf357398559660dc6eccce34dae5a7cee72c34b42019c`;
log SHA256 `7721d493f0752bfd404bf9aa0e0d6b8f559523e40f2f2ddad96fb9da9cf8ec6f`.
Exact private controller/log directory is
`/home/bobby/.local/state/portal-execution-elp210/20261017/path-land-140613`.
Thirteen owned paths +811/−33; implementation5paths +132/−20, tests2paths
+420/−9, docs6paths +259/−4. No public schema/frontend/runtime change.

Source/index freeze and all eight protected runtime image/start/restart tuples
unchanged. Owned containers/network absent, remaining_owned_resources=[],
lease released. Post-gate capacity156GiB free/75% used,10,680MiB RAM available,
no swap; C4 NO_ACTION_NEEDED. No prune or foreign resource cleanup occurred.
This closes local PATH custody correctness, not accepted real source proof,
Composition/Regime historical recomputation, commissioning or full06/10/11.
