# ELP2-10 — independent local reuse and risk review

Review owner: Codex delegated reviewer. Date: 2026-10-16 UTC. Read-only
application review at entry `e6620f416e43bc8c18a044339a598c436d8556ba`,
`docs/research-loop-plan`, `/home/bobby/portal-research`. Only this Markdown
file is owned by the reviewer. No application/shared-contract edits, Git
mutation, migration, API/DB request, test, build, load, service or remote write
was performed by this subtask. Suggestions below are **PROPOSED**, not
implemented or measured evidence. Primary owns integration and actual receipts.

## 1. Instructions and authority read

Read root `AGENTS.md`, campaign `AGENT_WORKING_RULES.md` in full,
`PHASE_PACKET_TEMPLATE.md` in full, Unified ELP2-10, phase entry/task map,
Portal backend guide §§13.1–13.5 and ELP2-10, Edge guide §9 and
EPG10-01/06/09, ELP2-06/09 packets, source reuse locators, and the prior
UDB-04/P23 measurement scope. Portal remains app/identity authority; Trading
System remains economic/business authority; Edge remains transport/projection.
No new service or second financial ledger is needed for the changes below.

Independent review does not approve source activation, production ceilings,
calibration or a new load target. Existing approved local cell allocation is a
resource ceiling, not a certified product SLO/capacity result.

## 2. Reuse inventory and high-value changes

| Path at entry | Observed implementation | Recommended bounded reuse/change | Evidence required |
| --- | --- | --- | --- |
| `execution-v2/manager-model.service.ts:30–61` | Head lookup; authorize; `scopes.deliver`; document read; pure scoped query; current-head check | Preserve every authority/head fence. Coalesce only immutable document loading, never grants, current head or delivery authorization | Same output; concurrent revoke/head change still denied; private SQL count for identical reads |
| `execution-v2/manager-model.store.ts:101–115` | Each document caller independently selects full JSONB, parses Zod and hashes the entire document | Finite **in-flight-only** map keyed workspace/environment/profile/revision, with per-caller detached result; no durable/TTL authority cache | Twenty identical concurrent reads issue one document SELECT; different axes do not join; retry after error; admission cap; mutation isolation |
| `execution/profile-projection.repository.ts:916–970` | Existing finite `snapshotFlights` map, capacity16, cleanup on completion; special retained TTL path | Reuse the single-flight pattern, not its retained-only TTL mode. New Manager qualification is not legacy retained qualification | Capacity/cleanup tests; no new cache tables or side-effecting background source fetch |
| `execution-v2/read-projection.ts:116–150` | Every generic row visibility check scans all qualified tuples and requires all matching tuples allowed | Optional exact-five-anchor index in existing scope-keyed WeakMap; preserve generic partial-row semantics and descriptor checks | Partial shared account/portfolio still fail closed; hidden tuple additions do not change a fully visible exact row; descriptor/getter tests; paired timing on same inputs |
| `execution-v2/manager-model.ts:212–215` | Full Manager member/fact tuples use the generic scan predicate | This is a concrete potential quadratic hotspot, not a measured bottleneck. At maxima30,000 member/fact checks ×10,000 population tuples means up to300million tuple comparisons | Record actual cardinality and equal authorized result digest; do not claim a measured improvement from this arithmetic |
| `execution-v2/manager-model.ts:133–150,243–260` | Groups, exact decimal partitions and full authorized totals are assembled before pagination; page200/1MiB bound checked at end | Keep full-authorized-query semantics. Measure parse/scope/filter/sort/group/serialize separately before introducing a new normalized rollup table | Full counts/groups and cursor traversal unchanged; no truncation to first200 inputs to meet latency |
| `execution-v2/manager-model.store.ts:63–98` | Advisory transaction lock, immutable revision digest, sequence/generation CAS, revision cap1024 | Reuse as atomic projection/checkpoint commit. Add separately qualified durable consumer fence if actual ingest owner is commissioned | Real PostgreSQL multi-connection takeover/expiry/duplicate tests; no ACK for failed commit |
| `execution-v2/realtime.ts:104–227` | Finite clients/pending subscriptions, flights, per-client/global bytes, timeout, coalescing, per-write authority checks | Reuse without another listener/service. Measurements must identify whether clients have the same private scoped binding/cursor | Source-call count vs client growth, slow-client peer isolation, unabortable source slot retention; no economic delta/replay claim |
| `execution-v2/realtime-commit.ts:8–21` | Durable COMMIT then releases connection before external ACK | Preserve; never hold pool client during ACK or undo a committed projection on lost ACK | Existing lost-ACK/single-connection tests reusable if unchanged; new lease negatives must show no ACK |
| `execution-v2/manager-score.ts:145–170,308–385` | Shared pure reference calculator, no runtime defaults; pending/TEST_ONLY gates; linear disjoint block traversal | Keep off TS/request hot path. A bounded runner needs explicit input/job/queued-byte/concurrency limits before mounting recomputation | Input/window/config isolation, finite queue admission, cancel/timeout semantics and no pretending an ignored abort freed an active worker |
| `db/pool.ts:59–86` | Dedicated Execution pool; finite max/queue;2s connection and5s statement timeouts | Reuse this pool; do not create one pool per Manager request or bypass Core session checks. Read/write isolation still shares host IO/WAL | Real queue wait/connection count/query plan metrics; document all replicas, not one instance only |

No new public HTTP/SSE endpoint is required to perform these local improvements.
The source adapter remains private and dark unless separately qualified.

## 3. Lease/fencing finding — legacy lease is not sufficient

**SOURCE_CONFIRMED (local code), not a runtime failure claim.**

`execution/profile-projection.repository.ts:202–234` stores owner and expiry;
acquire permits the same owner or an expired-row takeover; release deletes the
row. `profile-projection.worker.ts:114` acquires once before potentially long
network drains, calls `repository.commit` at367 without an owner/fencing token,
then releases at391. `repository.commit:739–790` locks a snapshot and writes it,
but does not recheck lease identity/expiry. Therefore expired-owner takeover
does not by itself prevent an old worker from committing afterward.

Do **not** reuse this as proof of ELP2-10 split-brain fencing. The Manager
store's advisory transaction lock serializes commits and its CAS prevents
duplicate effects; neither proves that the source fetcher still owns ingest.

Recommended new dark-consumer policy:

1. One durable partition row for workspace/environment/profile, separate from
   user/session authority. Retain owner, monotonic fencing token, lease expiry
   and restore epoch. Token increments on new tenure, including same-owner
   reclaim after expiry. Do not delete/reset the token on release.
2. Acquire/renew using **database clock**, never application wall-clock guesses.
   Fetch outside the DB transaction; finite source read timeout and input bytes.
3. Inside the same projection/checkpoint transaction lock the lease row, compare
   token/owner/restore epoch and expiry, then apply immutable projection/CAS.
4. If TTL is strict through commit, recheck `clock_timestamp()` immediately
   before COMMIT. An entry check alone permits a long transaction to cross
   expiry. Alternative lock-held authority semantics must be stated explicitly
   and have bounded statements/transaction duration; do not silently mix both.
5. Persisted restore epoch is operational input. A DB restore must rotate it
   under the approved DR process before accepting old receipts; a new random
   process owner alone is not restore evidence. Preserve old facts/checkpoints.
6. Lost ACK and replay use the same committed revision/digest; a stale holder
   cannot renew, write, advance checkpoint or ACK on behalf of a new tenure.

Dedicated small coordination table is safer than changing the shared legacy
lease/worker contract incidentally. Primary reserves any migration number.
It is coordination state, not a financial ledger or a separate service.

An advisory **session** leader lock is a possible explicit connection-scoped
policy, but holds a connection over network wait, offers no lease expiry or
persisted restore token and requires careful dedicated-connection teardown.
`pg_advisory_xact_lock` alone only coordinates the short transaction. Neither
is an unqualified substitute for the finite lease/failover contract above.

Discriminating tests: two connections race to acquire; expiry then takeover;
stale prepared payload after takeover; expiry while transaction is active;
same-owner ABA; release/reclaim counter monotonicity; stale owner renewal;
new generation/resnapshot; restore-epoch mismatch; failed commit emits noACK;
lost ACK retries one current revision without resurrection of an old revision.
All are **NOT_RUN by this reviewer**.

## 4. Quality and metric availability

`managerMetric` currently allows `AVAILABLE` with null `methodology_ref`.
`sumMetric` tests identity equality, completeness and cutoff, but equality of
several null methods is not proof of a performance methodology. Add a narrow
availability guard for affected performance facts (return/PnL as required by
their authority contract), not a global rejection of the document. Preserve
available balances, budget fields and exact fees where their own provenance is
sufficient. Missing method/cost/FX affects its dependent metrics only.

For cashflow-only proof, use explicit deposit/withdrawal/capital/budget facts
with real zero trading-PnL facts as a synthetic oracle. Never infer zero PnL
from absence, capital balance change, fund/return or budget top-up/recall.
Funding-bucket PnL remains unavailable without lot attribution. Unknown costs
must not silently become0. Ratio denominators and MONEY partitions remain
exact; no USD/USDT or actual/Paper/Sandbox mixing.

The shared score reference is already tested separately from source/runtime
calibration. `RUNTIME_APPROVED` in a supplied object is not a new permission to
commission production config. Formula/weights/bands stay unchanged; real
anchors/stress/grid/block/maturity/config remain owned pending artifacts.
Preserve `policy_pending`/typed dependent absence, no numerical preview in
production aggregates, and no global block of independent authorized reads.

## 5. Bounded data/retention and failure semantics

- Manager input parser permits10,000 members/20,000 facts and writer separately
  caps serialized input at8MiB. Public page200/1MiB is **not** a bound on the
  full compute input or a full-history guarantee.
- Writer cap1024 revisions is a deliberate fail-closed retention stop, not
  approved deletion. Theoretical8MiB×1024≈8GiB per partition excludes JSONB,
  index, WAL and backup overhead; this is a sizing warning, **not measured
  disk usage**. Do not call retention indefinitely sufficient or silently prune
  original/restated history to keep ingest green.
- Coalescing must bound unique in-flight keys before awaiting. On database
  failure remove the completed flight; do not retain an error or a stale read.
  If query cancellation is not effective, do not reuse its occupied slot solely
  because a wrapper timed out.
- Followers must receive detached immutable data. Sharing one parsed mutable
  document permits accidental cross-request contamination even when scope
  checks are otherwise correct. Scope/current-head fences remain per caller.
- Scope-keyed indexes must not be keyed solely by actor or role; current
  authorized population/field policy has a distinct minted object lifetime.
  Generic partial rows still require all possible tuples allowed.
- Diagnostic events/metrics may expose counters and fixed reason codes only to
  server-owned receipts. No DSN/JWT/raw cursor, grants, hidden tuple names/counts
  or source topology should be returned to a restricted browser.

## 6. Measurement plan and reusable evidence boundaries

Read `scripts/research-p23/read-load.mjs`, mixed-workload harness and
`scripts/research-udb/acceptance-load.mjs` without running them. Reuse their
measurement discipline: pin source/image/schema/config/workload, distinct real
principals for browser acceptance, monotonic full-body timing, per-path
temperature and p50/p95/p99/max, errors and resource samples. Their hardcoded
ports/read allowlists are target protections, **not** knobs to repoint at
another stack without approval.

UDB-04 accepted20 readers + actual child on retained Research/Execution paths;
P23 warm SLOs are summary500ms/trial750ms/replay1000ms and their named cold
counterparts. The earlier Bobby600ms allowance was a specific P13 Evidence
discussion, not a global performance change. None certifies the new Manager
SCOPED_V2/Edge path or grants a new source/replay SLA.

Safe local diagnostic matrix for the primary within the approved cell:

| Diagnostic | Required pinned axes/counters | Meaning of result |
| --- | --- | --- |
| Same revision concurrent read | Same8MiB-or-declared-size payload, full members/facts, twenty requests, cold+overlap+sequential, document SELECT/parse/hash count | Cost of local immutable read coalescing, not20 authenticated HTTP users |
| Authorized Manager query | Whole/restricted scopes, realistic exact facts, multiple pages/groups and same digest; scope-check/parse/query/serialize timing | Local pure/repository cost; not source lag or end-to-end screen SLO |
| Mixed local commit/read | New immutable revisions + same-key readers, source-call stub counters explicitly TEST_ONLY, PG pool wait/EXPLAIN/WAL/rows/bytes | Contention within the test cell; no TS/DL coexistence claim |
| Slow source/client/reconnect | Fixed limits; maximum pending/client/queue bytes; actual source calls, timeout slot lifetime, drain/error counts | Enforced local envelope, not cross-host production propagation |
| Lease outage/restart | Distinct DB clients, fence/epoch/cursor, preserved old-revision digest and noACK on rollback | Local durable failover invariants; actual backup/restore still separate |

Pair unchanged-baseline and candidate on identical fixture/cardinality,
resources, query result and controlled warm/cold order. Include absolute and
relative deltas with near-zero baseline handled as absolute; account for all
replicas/pools/cache/serialization copies. Latency-only improvement does not
prove CPU/RSS/IO/WAL improvement. Sparse per-run diagnostics should say which
axes were **NOT_MEASURED**, not hide them or manufacture confidence intervals.

**Mandatory full-phase gaps remain separate:** exact TS/DL/Edge B0/B1/B2;
original P1846k×2/9k×2 semantics, gate500ms metric/window/repeats; TS trading
and DL lag/errors; approved per-family cadence/freshness/retention/resource
ceilings; actual deployed trust/source continuity; calibrated score shadow
and UXM-10 browser/privacy/resource acceptance. Reviewer neither loaded these
systems nor converted source/journal descriptions into measured receipts.

## 7. Reviewer return and next work

Early findings were sent to primary: exact-tuple hotspot; finite detached
document coalescing; insufficient legacy lease; DB-clock, monotonic-token and
commit-expiry fencing; exact threshold-scope preservation. Primary chooses the
small coherent implementation and adds actual tests/results in its own packet.

This independent subtask has **no PASS test or runtime verdict**. It has no
created process/container/DB/volume to clean; resource effect is file/source
inspection only. Later implemented fixes should be appended here with exact
diff/source locators, not erase this entry analysis or mislabel proposals as
initial measured facts.

Backend can perform assigned ELP2-10 component integration independently of
uncommissioned upstream/browsers. Full ELP2-10 cannot be certified from local
diagnostics alone. Claude can consume published quality/resource/degradation
states once primary freezes and pins the contract; FE remains
`NOT_STARTED_BY_OWNER_DIRECTION` / `AWAITING_CONSUMER_REVIEW` for this scope.
ELP2-11 still needs a separate assignment and its required selected gates.

## 8. Candidate lease/commit review — second independent pass

Primary requested a read-only review of the uncommitted candidate
`manager-lease.ts`, migration137, `manager-model.store.ts` integration and
the added PostgreSQL tests. This is a source review, not another executed test
receipt. Reviewed the test code, not just its names or a reported PASS summary.

### Accepted design

- Dedicated `execution_manager_consumer_fences` coordination table; no extra
  service, source data or economic ledger. Partition is exact workspace,
  environment and profile. Acquire returns one holder; renew compares all
  token/epoch/owner fields and DB-clock expiry. Release retains the row/token;
  same-owner reacquire increments token and rotates epoch. Restore is a private
  quiesced-ops CAS with receipt, not a browser capability or autonomous restore.
- `fenceManagerProjection` changes a validation UUID while acquiring the row
  lock. A `DEFERRABLE INITIALLY DEFERRED` constraint trigger checks the exact
  current holder/token/epoch and DB-clock expiry at COMMIT. This addresses the
  specific entry-check-only flaw identified in§3, including parent transactions
  that do not use the ACK wrapper.
- Prepared lease is detached/frozen before persistence; cross-scope leases
  fail closed. SOURCE_VERIFIED requires a lease defensively. Optional lease is
  limited to explicitly TEST_ONLY inputs, while publication qualification
  **still rejects SOURCE_VERIFIED** (`publication-adapter.ts:51`). This candidate
  does not commission a source, writer, credentials, worker or service.
- Six new PG test bodies exercise distinct-connection acquisition, release/
  same-owner ABA, committed takeover after an old prefetch with noACK, expiry
  after writes with COMMIT rollback, restore-epoch CAS preserving old revision,
  and workspace/environment/profile mismatch plus caller mutation. The extra
  source-shaped-input test preserves source-dark behavior. Deterministic expiry
  SQL is an explicit fault in the disposable test DB, not a fabricated source
  wall-clock claim or evidence of an actual backup/restore operation.

### Changes requested and reported to primary

| Finding | Exact issue | Required change / discriminating test | Review status |
| --- | --- | --- | --- |
|10-REVIEW-C1 explicit transaction|`PoolClient` type and a comment cannot prove caller BEGIN. Under autocommit, advisory lock and fence UPDATE/trigger each finish before later revision/head statements; takeover can occur between them|Reject leased persistence without a containing transaction before any revision/head write. One practical check after the successful fence UPDATE is `pg_current_xact_id_if_assigned()`: the UPDATE assigns an XID in the containing transaction; a new autocommit statement sees null. Add a real PG no-BEGIN negative and preserve ordinary ACK/parent transaction behavior|CHANGES_REQUESTED; primary owns fix and test receipt|
|10-REVIEW-C2 expiry starts after lock wait|Acquire conflict branch sets `expires_at=EXCLUDED.expires_at`, evaluated before row-lock wait; a waited contender can receive an already expired tenure|Set conflict-UPDATE expiry from `clock_timestamp()+ttl` at actual acquisition rather than pre-wait EXCLUDED value. Existing authority remains fail-closed, but availability/TTL semantics become correct|CHANGES_REQUESTED; primary owns fix|

Accepted boundary: the actual commit fence assumes trusted internal SQL does
not deliberately run `SET CONSTRAINTS ... IMMEDIATE` early or disable triggers.
Do not expose that transaction control through an untrusted generic API.
Runtime grants remain read-only for the hydrated retained store; this migration
does not silently grant a live Manager writer permission.

No tests, load, build, migration or runtime actions were run by this reviewer.
Primary must record actual final results and source hash before converting these
review findings to ACCEPTED_AFTER_CHANGE.

### Source retake after the two fixes

Re-read the changed source and test bodies after primary addressed C1/C2.
Both are **ACCEPTED_AFTER_CHANGE (source review only)**:

- `manager-lease.ts` now queries `pg_current_xact_id_if_assigned()` immediately
  after its successful fence UPDATE and throws `MANAGER_TRANSACTION_REQUIRED`
  if the containing transaction has disappeared. The new PostgreSQL negative
  explicitly calls leased persistence without BEGIN and asserts no revisions
  or head. The test is defined; execution result belongs to primary's receipt.
- Acquire conflict UPDATE now derives `expires_at` from its own
  `clock_timestamp()+ttl`, not pre-wait `EXCLUDED.expires_at`. Tokens, epoch,
  scope and ownership conditions remain unchanged.

No reviewer-executed test or performance PASS is implied by this acceptance.
No additional critical source finding remains from this specific lease pass.
