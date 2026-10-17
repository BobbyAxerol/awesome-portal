# ELP2-06 — Assigned-capital Composition publication chain

## Scope, pins and ownership

Bobby's approved remaining-backend02–11 batch covers this follow-through of
06-002/00-005. Integration checkout `/home/bobby/portal-research`, branch
`docs/research-loop-plan`, parent `68923d2912b2fa58db2789e10f559a17cf600817`.
Initial dirty paths are this batch's backend/contract changes only. No frontend,
new migration, external service, startup installation, source command, grant,
credential, runtime profile, push, dev/main promotion or deployment is changed.

Authority: Portal backend guidev1.2 ELP2-06; FINAL Scorev1.1 assigned-capital
composition/full-denominator/independent direct-NAV semantics; campaign rules
§§3/4/6–8. Formula/weights/bands are reused, not recalibrated. Synthetic approval
pins are test inputs, not production calibration/authority.

| Task | Owner / write boundary | Output / acceptance |
| --- | --- | --- |
| Allocation worker draft | Independent backend agent, private drafts only | Closed byte-pinned loader and bounded calculation; no shared writes/jobs |
| Integration tests draft | Independent test agent, private patch only | Worker→disposablePG→Manager controller/service and negatives; no jobs/Git |
| Security/economics review | Independent read-only reviewer | Full accounting, trusted clock, no read-side aggregate, current-authority proof; not runtime PASS |
| Integration / shared contracts | Primary only | Applied modules, generated schema/types/fixture, single resource lane, receipt, journal and normal-hook commit |

## Implementation / semantics

- `manager-composition-runtime.ts` loads strict finite allocation bytes with
  SHA256 matched to a separately installed approval pin: exact workspace/env/
  profile/catalogue, source revision/set/cut, population/stages, allocation
  revision, ownership/full-accounting manifests and timestamps. Browser JSON
  cannot become the private identity-branded handle. Bytes/rows/depth/nodes,
  inflight work, detached plain-data capture and cancellation are bounded.
- Complete tuple+stage census, unique economic ownership, exact alpha RAW
  bindings/window/basis and full positive assigned-capital denominator precede
  existing shared aggregation. Missing/archived members stay in the denominator;
  score0 is real, not absence. Verified empty allocation is `no_allocation`.
- Grouping and reconciled NAV have independent optional approvals. Missing or
  expired auxiliaries withhold only relevant HHI/NAV ratios, not valid A.
  Assigned capital may exceed current NAV after losses. NAV coverage requires
  the same current allocation amounts, never renormalization.
- Existing `ExecutionManagerRuntime` computes Composition after RAW/DIRECT_NAV,
  off request path within combined128 tasks. Source cannot inject worker
  outputs. Existing atomic revision/head/checkpoint path persists both arrays;
  ACK follows commit. Lost ACK/restart reuses exact arrays/timestamps, not a new
  calculation in an old revision. No new table/scheduler/economic ledger.
- Only Fund/Portfolio, exact partition/population/stages, full current accounting
  grants and score/allocation/financial/provenance fields expose Composition.
  Researcher fields/visible subsets do not grant accounting authority. Filters/
  pages never change the denominator. BFF only selects and checks references;
  it does **not** recalculate A. Auxiliary expiry redacts a read copy, not the
  immutable revision. Both final asynchronous fences recheck current approval.
- Additive closed `ManagerCompositionPublication` is separate from RAW and
  DIRECT_NAV. Optional `composition_details` preserves older payloads;
  `scores.composition` adds typed partial/no-allocation/invalid states. DirectNAV
  remains independent. No formula/weights/bands or existing RAW schema change.

## Validation / impact

One Core lane≤4CPU/4GiB/8GiB transient; Node3CPU/3GiB+PG1CPU/1GiB, one worker.
Wait for foreign measurement lock release; never replace it. No HK jobs/business
rows. Inherited whole-hook jobs are not all capped by this envelope; this is
not matched coexistence/G2 or production capacity evidence.

| Gate | Actual at prepared checkpoint |
| --- | --- |
| Independent draft review | Two findings fixed: read-side aggregate on auxiliary expiry; caller timestamp instead of trusted post-yield clock. Corrected draft and applied integration ACCEPT_SOURCE_ONLY |
| Narrow regeneration | PASS with existing API Zod via NODE_PATH; no host install/lockfile change. Initial missing contracts-local Zod attempt failed and is not PASS |
| Contracts | Synthetic fixture/schema/OpenAPI/types and eight new parser/semantic cases prepared; test NOT_RUN |
| Worker / PG / Manager |23 expanded new cases prepared plus impacted regressions; test/build/restore NOT_RUN |
| Normal hook | NOT_RUN; code lands only on exit0; terminal controller/log determines acceptance |
| Genuine source / product / browser | NOT_RUN. Synthetic pins plus real disposablePG are not genuine TS/config authority or consumer acceptance |

Generation in `packages/contracts`:

```bash
NODE_PATH=/home/bobby/portal-research/apps/control-api/node_modules npm run generate:execution-manager-models
python3 tooling/snapshot.py
```

Contract harness copies the new pure contract only, no private artifacts or
credentials. Existing verifier compares exact Zod-based outputs/types; snapshot
includes the new synthetic fixture. No new route/table/census item.

## Claude handoff — additive contract, not assignment

Type: `packages/contracts/generated/execution-manager-models.d.ts`,
`components["schemas"]["ManagerCompositionPublication"]`. Existing six
`executionManager{FundOverview,Fleet,Portfolio360,Alpha360,Account360,Deployment360}GetV1`
operations unchanged; Composition details only on authorized Fund/Portfolio.

Fixture `packages/contracts/fixtures/execution-manager-composition.synthetic.valid.json`
is TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT: A80, capital80, coverage1,
contributions67.5/12.5; not genuine source/calibrated production. Exact decimal
strings, UTC epochms, null≠0. When assigned UXM08, consume summary/details, full
capital, coverage/unscored/provisional weights, bounds, independent NAV coverage
and reasons/provenance; do not recompute weights/bands. Contributions have no
quality band. Partial coverage is not numeric A; missing grouping does not hide
A. Keep direct NAV and RAW separate; a rejected stale cursor requires a fresh
read (400 for invalid opaque query cursor;409 for a mid-delivery authority change).

Delivery WORKING_TREE_PENDING_GATE; frontend NOT_STARTED_BY_OWNER_DIRECTION;
AWAITING_CONSUMER_REVIEW. Existing06-001 owns consumer acceptance,06-002 full
source/recompute; no duplicate request. Codex changed no frontend.

## Gaps / next backend / rollback

Only the local Composition chain closes after actual gates.06-002/00-005 remain:
genuine source/allocation/config installation and connected tie-out; policy-only
recompute without rewriting source revision; Regime loader→worker→projection→API;
qualified partitioned cross-profile ALL; production numeric calibration.
At this historical entry Regime was pure math only; the later
[Regime publication batch](regime-publication.md) supersedes that observation,
not its remaining source/config/consumer gates.

Backend can continue independent approved02–11 work; Claude's hold is not its
dependency.10 commissioning/budget/coexistence/G2 and11 exact candidate/release
remain open. Protected-owner recovery intentionally stays off. Rollback removes
additive unmounted materializer delivery only; preserve RAW/DIRECT_NAV, identity,
grants/revocations, accepted/UNKNOWN commands, immutable history/audit. Teardown
only owned disposable DB/cells/network/measurement lease; retain logs/evidence
and all existing runtime images/volumes.

### Focused gate terminal — 2026-10-17 14:32Asia/Saigon

301/301PASS across six impacted API files; commissioning spec34 cases includes
23new Composition cases, not34+23 unique. APIbuild and real disposablePGrestore
including four scoped-access row digests PASS. Controller
`/home/bobby/.local/state/portal-execution-elp210/20261017/composition-focus-072853/controller.json`,
terminal07:32:50UTC, logSHA256
`c63dbb7b4669f962a11e828af530bb27516cd189dcc8c5f69ec56032a6dcd47b`.
Sources stable, eight runtime tuples unchanged, owned resources empty. One
read-only build sample07:30UTC:143.85% CPU,895.1MiB/3GiB Node RAM; not peak,
coexistence or SLO. All source fixtures/pins are synthetic, not real TS receipts.

Parsed OpenAPI comparison confirms only the Composition component, optional
detail and summary vocabulary changed; other paths/query/components identical.
No rerun of unrelated engine/browser/load gates. Full contract fixture/generated
verification and the mandatory normal-hook landing remain the next gate. The
prepared NOT_RUN rows above are historical; they do not override this focused
result. Code/schema bytes remain unchanged after the focus; only packets change
before the coherent commit. Final landing requires normal-hook exit0.

## Terminal normal-hook receipt — 2026-10-17

Landed `fdab164ce0187ac164efbf30ee232e8f3e1d5f3a`,23files,+4194/−1123.
Normal hook:706contracts PASS;4639API PASS+3existing skips; APIbuild and actual
disposablePG dump/restore/four scoped digests PASS. Controller
`/home/bobby/.local/state/portal-execution-elp210/20261017/composition-land-073419/controller.json`
finished07:59:15UTC, logsha256
`161deb59540a41bbdeeaedb2d2214dc914ad154da80eefd2570ba6910e930df1`.
Source unchanged during gate, eight protected runtime tuples unchanged and
remaining owned resources empty. Focused301 is overlapping, not706+4639+301
unique coverage. No source/runtime/FE activation or promotion.

Subsequent source review found a correlated tuple→stage census check needed
alongside the tuple digest and stage set. The Regime coherent batch adds that
private Composition fence and regression, including an approved empty census;
its own terminal gate determines acceptance. No public formula or denominator
changes and no researcher-filtered partial full-accounting result.
