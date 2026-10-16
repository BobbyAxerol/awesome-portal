# ELP2-10 — Performance, quality và coexistence

**Latest commissioning return2026-10-16:**
[implementation, tests, current source pins and consolidated action packet](commissioning.md)
supersedes the historical “unmounted consumer / no Score runtime DTO” statements
below. Registered fail-closed lifecycle, bounded lease/fenced consumer, ACK after
commit, immutable lost-ACK Score reuse, exact pinned policy loader and additive
generated precomputed-Score contract are now implemented. Default source provider
is still absent: no timer/activation or human/source authority invented. Local
normal-hook landing receipt is linked there. **Full10 NOT_MET** until the real
qualified provider, approved budgets/calibration, paired coexistence and assigned
browser acceptance; source-connected tests are not replaced by fixtures.

## Entry / assigned scope

Bobby assigned ELP2-10 on2026-10-16. Repo `/home/bobby/portal-research`,
branch `docs/research-loop-plan`, clean entry
`e6620f416e43bc8c18a044339a598c436d8556ba`. Backend only; no goal, push,
dev/main merge, signing, deployment, preview/FE build, source activation or HK
mutation. Prior09 component tests are not source/runtime certification.

Read Unified§14/ELP2-10, Portal guide§13/15, Edge§9/EPG10-01/06/09,
Score§12P3/13 and campaign rules/template. Authority remains Portal app,
TS economics and Edge transport/projection. Requirements T10-01…14.

Targets: local source and existing isolated test runner only; one heavy lane,
aggregate4CPU/4GiB, worker1,≤8GiB transient. No TS/DL/production load.
Existing approved SLOs require exact scope/metric verification before reuse;
missing thresholds/calibration/source/runtime evidence remain BLOCKED, never
invented production defaults. Local component measurements are not paired
TS/DL B0/B1/B2 or P184 performanceG2 receipts.

Goal: complete bounded quality/resource/lease controls and reproducible
measurement/readiness tooling in the approved backend scope; measure supported
isolated paths honestly; publish placement/DR/budget/consumer handoff and exact
gate dispositions. No mounted financial/realtime service is implied.

### Task map before delegation

| Task | Owner / write allowlist | Input/output and acceptance | Resource exclusions |
| --- | --- | --- | --- |
|10-SOURCE|Read-only source agent; only `ELP2-10/source-alignment.md`|Repin exact HK PM R2/Edge source, measurement locks,01/06/09 budgets/receipts and calibrated config; distinguish approved vs proposed vs runtime; exact blockers/locators|SSH metadata/source only; no API/DB load, tests/build, mutations, credential work or Git writes|
|10-REVIEW|Independent review agent; only `ELP2-10/reuse-review.md`|Inventory existing query/coalescing/pools/lease/metric/quality controls and reusable measurements; discriminating tests and bottlenecks, not test-plan PASS|Read-only application; no shared docs/contracts edits, Git or heavy commands|
|10-CORE|Primary; other owned backend/contracts/tests/tooling and phase docs|Freeze changes/schema, bounded implementation, integration tests/measurements, manifest/runbook/handoff and coherent normal-hook commit|One heavy lane; no frontend/Research implementation/source/trading changes|
|10-TEST|Independent test writer; only `apps/control-api/test/elp210-performance.spec.ts`|Frozen exact-tuple fast path/coalesced document API; parity/negative/cap/error/mutation tests, optional local timing observations explicitly not capacity certification|No app/contracts/shared docs/Git writes, no heavy tests/build/DB/load|

All gates NOT_RUN at entry. Frontend NOT_STARTED_BY_OWNER_DIRECTION;
consumer handoff AWAITING_CONSUMER_REVIEW. Primary owns shared artifacts,
resources and final receipt review; one writer per path.

Risk/rollback: false capacity/calibration approval, stale writer and expensive
analytics starvation. Keep configured limits explicit and fail closed; disable
only affected new background/read work, preserve facts/checkpoints and rights.
Do not weaken security/correctness or erase retained history to meet latency.

Implementation reservation: additive migration137 for isolated Manager consumer
lease/fence only, after review found legacy lease never checked at commit.
Primary owns137/store ledger/commit integration and real PostgreSQL tests. The
legacy polling worker is not changed or declared fenced by this delivery.

## Current backend return — 2026-10-16

This packet is a **bounded local backend delivery**, not production performance
or whole-phase certification. Producer is the coherent normal-hook commit
containing this packet, parent `e6620f416e43bc8c18a044339a598c436d8556ba`.
Final normal-hook exit0 is required before landing; actual SHA, final counts,
log digests, source manifest and teardown verification are recorded separately
at `/home/bobby/.local/state/portal-execution-elp210/20261016/landing-receipt.json`.
No planned/future hook is recorded as already PASS here.

**Terminal correction / qualification continuation:** this backend slice landed
as `169195ca534462dd07376bcc5872b474ba366567`. Its actual normal-hook exit0:
677contract tests;3886API tests +3existing skips; build and scoped-policy
dump/restore PASS. Source hashes in the terminal receipt bind those results;
future-tense entries below describe the original pre-landing packet, not a
currently pending hook. See [remaining operational qualification](qualification-continuation.md)
for the new assignment, fresh PM/Edge/TLS pins, actual old-preview browser
observations, nine distinct prerequisites and test58/58. **Full10 remains
NOT_MET**: trusted adapter/writer/Score publication and new Manager consumers
are not installed; this is not only a missing external measurement.

Inputs and evidence:
[current HK source pins/budgets/measurement lock](source-alignment.md),
[independent review including C1/C2 fixes](reuse-review.md),
[126 family/environment measurement manifest](measurement-manifest.json),
[actual local measurements](measurements.md),
[placement/lease/storage/DR runbook](capacity-recovery-runbook.md),
[contract/Claude handoff and canonical debt](coverage-and-handoff.md).

### Delivered / files / compatibility

- `read-projection.ts`: exact five-anchor scope index removes the full tuple
  population scan for fully correlated rows. Partial rows still require every
  matching tuple to be allowed; descriptor/getter/strategy lineage semantics
  are preserved. No weaker account/portfolio aggregate scope.
- `manager-model.store.ts`: finite in-flight-only immutable-document coalescing,
  exact workspace/environment/profile/revision key, detached result per reader,
  four unique flights by default, bounded internal1…16 and32 total pending
  readers. Errors/null/success remove slots; no TTL/auth/head cache. Read-side
 8MiB input guard matches preparation; current authority/head fences remain.
- `manager-model.ts`: missing PnL/return methodology becomes null with
  `METHODOLOGY_NOT_PUBLISHED` only for dependent metrics, never globally hides
  independent balances/NAV/capital/fees or turns absent cost into0.
- New private `manager-lease.ts` and additive migration137 provide DB-clock
  monotonic token/epoch ownership, finite explicit TTL, takeover/release, strict
  scope and quiesced-restore CAS. Lease lock, revision/head and checkpoint share
  one transaction; a deferred DB trigger checks expiry at COMMIT, and an XID
  guard refuses autocommit. ACK remains after durable commit/connection release.
  This does not add a worker/renewal loop/command/API or fence the old poller.
- `execution/store-schema.ts` appends137 without changing frozen131/135 ledger
  digests. Persistence-ownership ledger classifies only this coordination table,
  retained monotonic row rather than financial/identity authority or TTL cache.
  **No live migration** was run; source-shaped publication still fails closed.
- Shared Manager row fixture now includes missing methodology next to real
  source-zero. Public Zod/OpenAPI/schema/generated types remain byte-identical;
  no new enum/query/API. Fixture snapshot refreshed; no FE/UI/baseline edits.

### Validation and resource evidence

| Check | Actual evidence / limit |
| --- | --- |
| Initial focused pure candidate |219/219 PASS,3files,16.90s; before later32-follower/diagnostic/cashflow additions; not final total |
| Host no-emit build |exit0; before final lease XID guard, canonical final build remains hook gate |
| Canonical focused PG run1 |355/356 PASS,5files,35.81s. Seven new lease safety tests passed; one source-dark assertion used code-as-message and failed on intentionally sanitized public text. Fixed to inspect typed `code/status`; **do not call run1 whole-suite PASS** |
| Run1 diagnostic |20same-key readers:20→1document SELECT; paired warm p95≈2251–2266ms→942–953ms;1.197MB/1000fact synthetic input. Mixed successor+20old-revision reads kept both digests. Actual index plan/storage/CPU/RSS in measurements; not HTTP/source capacity |
| Pure exact-index diagnostic |256tuples/512inputs×4, full result/digest parity; linear30.174ms vs indexed10.061ms. Oracle, not a parent binary or universal speed claim |
| Schema/manifest/static guards |Manager generator `--check`, contract snapshot write/check,126-pair catalogue match, N29 and EDS-12 static verify exit0; runtime_effect NONE |
| Final normal hook |Required terminal receipt at path above; reruns current added tests, all API regressions/build, contracts and scoped PostgreSQL dump/restore. Overlapping focused/full tests are not summed |
| Source/runtime/browser |Read-only HK code/journals only. No source API/DB load, source calls/SLA, actual restore, mounted writer, TS/DL/Research coexistence or UXM-10 acceptance |

The final hook is the retake for the corrected typed-error assertion and later
cashflow test; no second standalone full-suite run is scheduled. The mandatory
hook checks unrelated legacy surfaces as required, not an excuse to rebuild
frontend/preview or repeat engine runs.

### Requirement → code/evidence → exit disposition

PASS means only the proof boundary stated; final regressions must have terminal
normal-hook exit0. Source/methodology/config/real-browser gates remain distinct.

| Gate | Reuse/change/new and discriminating evidence | Disposition / remaining owner |
| --- | --- | --- |
|T10-01 cashflow-only|NEW deposit500/withdrawal200/opening1000/NAV1300, independent budget800; real published PnL0 vs absent PnLnull; pure fixture in `elp210-performance.spec.ts`|Defined for final hook; no source cashflow receipt invented |
|T10-02 methodology|CHANGE narrow dependent PnL/return guard; null method with independently available capital and exact zero fee; canonical row fixture/parity|PASS component run1; real source methods retain05/06 authority gate |
|T10-03 exact FX/aggregate/quality|REUSE06 exact decimal, currency/profile/cutoff/ownership dedupe, full authorized totals/cursor/filter/partial tests; scoped predicate106 and Manager49 rerun|PASS component run1; no FX rate is guessed and no new FX production path claimed |
|T10-04 amplification|CHANGE document coalescing real PG20→1 and161pure scope/coalescing cases; REUSE unchanged09 bounded source-flight/slow-client tests by source hash, retaken in hook|PASS local SQL bounds; real browser→source amplification NOT_MEASURED |
|T10-05 mixed load|NEW actual PG concurrent successor+20immutable-history reads, digest/head parity, plan and relation bytes|PASS local ingest/read; positive export N/A absent Execution Manager export route; source-connected mixed workload BLOCKED |
|T10-06 coexistence|Source audit confirms source owner budgets/locks and EPG10-06 test-only reservations; no new service/TS computation|NOT_RUN production/Research/TS/DL paired regression;10-002 |
|T10-07 lease/retention/DR|NEW real PG race/takeover/autocommit/expiry-at-COMMIT/noACK/ABA/restore-epoch/scope/mutation; REUSE immutable dedupe/resnapshot/retention cap/lost-ACK tests|PASS lease component run1; source-dark assertion retake in hook; actual host DR/source floor reset remains operational gate |
|T10-08 approved thresholds|NEW manifest42×3 plus exact source14null budgets; diagnostics explicitly have no product-SLO assertion|BLOCKED_APPROVED_SCOPE_BUDGETS; do not port UDB500/600ms or use a cap as capacity approval |
|T10-09 funding bucket|NEW source-zero/absent/capital-movement oracle; REUSE exact denominators and null lot-attribution production response|No invented funding PnL; final cashflow hook required; lot method remains unavailable |
|T10-10 canonical/window|REUSE unchanged `manager-score.ts` hash `152fcc02…`, Q03/Q13/Q19/source-grid/continuity/cost/ownership tests; no second Score implementation|Component invariants retained/retaken in hook; numerical fixtures not source temporal or P3 calibration proof |
|T10-11 bounded recompute|CHANGE finite document flights/followers; REUSE09 bounded byte/client/source slots; no TS-side analytics added|Read-side bounds delivered. Actual qualified bounded recompute worker NOT_MOUNTED, canonical06-002; no pretend production queue |
|T10-12 performanceG2|NEW explicit proof classification/manifest; Edge original per-feed metrics and B0/B1/B2 recorded|BLOCKED where applicable until exact performance receipt; optional mainnetG2 does not waive this |
|T10-13 P3 calibration|REUSE approved formula, pending runtime anchors/stress/block/grid/maturity; unchanged pure reference rejects missing/test-only policy|BLOCKED_APPROVED_CALIBRATION_ARTIFACT, canonical00-005/06-002; no scientific/certification claim |
|T10-14 evidence separation|NEW per-run diagnostic labels, manifest, quality matrix/handoff; dependent-method-only absence tests|PASS component handling; source temporal/replay/security and browser remain separately OPEN |

### Review, cleanup, rollback and next work

Independent review discovered **C1 autocommit loses the transaction fence** and
**C2 takeover TTL computed before lock wait**. Both fixed, source reviewer
ACCEPTED_AFTER_CHANGE. New PG negatives passed run1 for autocommit and commit
expiry; no received source review is presented as a test run.

One heavy lane, existing test script trap owns its cell/network/temp directory;
run1 exit1 tears them down too. Final hook uses its own canonical disposable
cell and cleanup. No runtime volume/data/image was removed; no broad prune.
Pre-heavy observation32,092MiB RAM/11,106MiB available; root621GiB/150GiB free.
Later root149GiB free (~24%), RAM12,243MiB available. Phase cell sample Node
1.067GiB/3GiB and PG68.86MiB/1GiB; sample, **not peak**. Capacity below30%free is
recorded; existing C4-GOV-CAPACITY-01 inventory follow-up stays separate. Final
owned-resource zero count/Docker df/runner state/log hashes must be in landing
receipt; no claim cleanup complete based only on tests.

Rollback disables only new consumer/fanout/expensive query features; preserves
all facts, original/restated history, current grants and fencing rows. No
destructive down migration or self-activation; placement/DR detail in runbook.

- **Backend:** local implementation/measurement slice delivered subject to
  terminal hook. **Full10 NOT_MET_SOURCE_BUDGET_CALIBRATION_COEXISTENCE_BROWSER**;
  no tested scope or SLO silently reduced to turn it green.
- **Backend next:** selected10 operational qualification after exact05/06/07
  source/trust/profile + budget/calibration artifacts/window.11 is not assigned
  or fully dependency-ready; only separate approved preparatory work can begin.
- **Claude next:** when Bobby assigns, UXM-08/10 design/fixture consumers and
  independent null/zero/capacity/quality/a11y/browser performance proof; no UI
  assignment or accepted product receipt inferred here.
- **Requests:**10-001 AWAITING_CONSUMER_REVIEW;10-002 BLOCKED budget/coexistence;
  canonical05-001/06-002/07-001 and00/09 dependencies linked, not duplicated.
  No new FE→BE request was received during this slice.
- **Bobby decisions:** formula/weights/bands not reopened. For runtime
  qualification owners must supply exact approved envelope/calibration and
  selected source test window. No permission required again for delivered
  local scope; no goal/push/dev/main/release/deploy/activation occurred.
