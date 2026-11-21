# UDB-01 phase report —2026-10-10

**PASS — PREVIEW_STORAGE_BASELINE. Required UDB-01 predicates and C4 passed;
the normal root hook gates the single local commit. Not product/release GO.**

- Scope/identity:Codex backend/infra as Linux bobby; `/home/bobby/portal-research`,
  `docs/research-loop-plan`, parent9745b9ef. UDB-01 owner approval only.
- Delivered:common config+preview/P23 overrides, exact16.15 image pin,
  append-only130 repair, physical-pressure backpressure before source leader,
  real-PG/custody tests, safe preview apply/rollback and bounded qualification.
- Contract/UI:no endpoint/schema/DTO/enum/generated change. Existing typed
  `N21_SHARED_CACHE_CAPACITY_EXHAUSTED` reused; hits preserved. Claude layout,
  CSS,bundle,engine,research consumer source and protected kernel unchanged.
- Preserved:existing capacity lock,reservations,fencing,ETag body reuse and
  expiry-only sweeper. No NATS KV/PgBouncer/Redis or direct TS database.

## Gate results

`bash scripts/research-udb/test.sh`:8 files,95/95 focused tests PASS,47.67s.
Auth/owner/grants/delegation/local-read negatives; fresh migrations and
historical recorded-but-no-op129 fixture,forward130 and rerun with unchanged
ledger/identity bytes. Quota/multiple repositories/TOAST reuse/dry-run/expiry/
SKIP LOCKED/cancellation/time budget/new physical-pressure denial/fresh-hit
preservation/1s reclaim lock timeout. Actual backend SIGKILL in the disposable
PG forces crash recovery:unlogged body cleared,durable marker/user preserved.
Disposable container removed by exact-name trap; no test volume left.

`node --test scripts/research-udb/config.test.mjs scripts/research-preview/unified-preview-config.test.mjs`:
Initial6/6 PASS; new bounded-harness static check also PASS (4 UDB +3 existing
preview cases). Shell/Node syntax and diff whitespace PASS. Rendered isolated P23
long-running budgets total4,600,000,000B; PG900,000,000B,p23.conf128MiB buffers.
No500ms/5GB gate relaxation or new engine run.

Built **only Control API** via preview helper (cached dependency layers,
150.7s compiler/prune). Image
`sha256:f2f8699b52ccb0f5007d00848faba8ef37da41e8398d90e159d0b8110feb0f7f`.
This is the recorded local UDB implementation build, not a clean signed release
or new P23 whole-product candidate. Exact source-file checksums are private;
UDB-04 owns clean final candidate/rebuild after other phases and FE mapping.

## Applied preview change window

`bash scripts/research-udb/preview-profile.sh apply` on the fixed
`portal-research-preview` project,2026-10-10T08:58:11Z. Confirmed no dispatched
or running child; historical undispatched PENDING intent left untouched.
Paused existing application intake/worker, captured catalogs and SHA-256,
backed up actual DB private0600 (24,386,469B custom format), kept the existing
`portal-research-preview_portal-postgres-data` named volume. Recreated only
preview PG with new profile; standard migrator applied129+130,125 ledger rows
vs123 before. No bootstrap,manual SQL patches,ledger rewrite,credential reset.

Actual16.15 profile:shared buffers256MiB,autovacuum memory32MiB,max connections60,
UNLOGGED cache plus expected table/TOAST options,no pending_restart; hard
memory/swap limit1,610,612,736B. [Identity/storage manifest](./storage-and-identity.md)
and all16 Core/Research custody digests before/after match, including original
credentials,activations,sessions,grants,memberships,seals and publications.
Before inventory SHA-256
`0d7b2adf83aca5fca60350060d9d7a81703bb4f346c9b2be114e5dd40b831b3f`;
after `b1ac039ada5fe9f394a21587c3b600e9a9fff4dddbf720813ab2c601e38ca602`.
Metadata/settings/ledger differ intentionally; their whole-file hashes need not
match. Per-table custody does.

Restored previous application services and nginx resolution;Control/API/Web200
after readiness. Initial startup retries observed502 while APIs came up; helper
now waits health before reload. Web/portal-api/worker images unchanged; Control
API image alone changes. Source/profile/projection/mirror/SSE/commands remain
offline,all approved Research profiles preserved. No FE design/baseline edits.
Dev/stable PostgreSQL container IDs and start times remain09/07 and09/08;
memory cap0/defaultconfig unchanged. No Execution/AWS/mTLS/grant change.

Private backup/custody/source checksums/rollback manifest:
`/home/bobby/.local/state/portal-udb01/preview-20261010T085811Z` (30-day retention).
Rollback Compose render restores exact prior image IDs/PG command/resources
with the same named volume. It retains forward cache schema; no old session/
grant snapshot automatic restore. Historical129 defect also covered on fresh
and upgraded disposable DB; no separate migration-number shortcut.

## Historical lane dispositions — not acceptance

Finite background project `portal-udb01-soak`,private internal network,own
new `portal-udb01-soak_pg-data` fixture volume,exact same Control API image.
Started2026-10-10T08:58:11.923Z; initially configured duration24h after schema
setup.15cache requests/s,initial changed2MiB-class payloads then etag sharing
and periodic changes,permanently live sentinel,zero upstream/engine calls.
At09:06UTC:7,134requests,2,444leaders,4,690hits,0denial/error,physical observed
max158,580,736B,live-byte max3,550,248B. That was a historical running snapshot,
not24h PASS. Bobby approved replacing the wait with condition-based tests.

Local SQL samples carry actual WAL/temp/connection/physical/live bytes; dedicated
collector samples actual cgroup charge. Kernel has no memory.peak; no invented
kernel peak and no Docker working-set substitute. Cgroup max enforced,initial
PG current266,334,208B,max899,997,696B,max/oom/oom_kill events0.
Stopped only its owned collector/writer, retained original report/state/hash,
then removed its two fixture containers/network and own newly-created PG
volume. Disposition **SUPERSEDED_NOT_24H_PASS**, not a completion. Original
writer stop exit137/OOMKilled=false is recorded, not hidden as a normal exit.
Reports retained at `/home/bobby/.local/state/portal-udb01/soak`.

The first near2MiB short-harness attempt used sequential awaits:1,475 changed
bodies /142.178s =10.37rps,28 vacuum cycles. It **did not qualify** the declared
15rps load, despite a healthy database. Retained as UNDERLOADED_HARNESS_NOT_PASS
in `qualification-serial-attempt`; exact fixture teardown completed. Fixed
only the test dispatcher: two independent pools, at most4 requests in flight,
continuous15/s scheduling. No app change, budget waiver or gate reduction.

## Approved bounded qualification — PASS

Exact same qualified Control API image/PG digest/config, isolated fixture DB,
zero upstream/engine calls. Continuous changed body2,095,928B,24 rotating keys,
50msTTL and a permanent live sentinel. At least10minutes/14 completed writes/s,
three real TOAST vacuum cycles, last5minute plateau (≤10% or4MiB growth),
physical<1GiB/live-byte/row budgets, no TRUNCATE/fresh eviction. Pressure
injection preserves hits, denies the new leader using the existing typed code,
and removal recovers admission. Deadline20minutes; insufficient proof is FAIL.

The final lane ran2026-10-10T09:35:05.964Z→09:45:13.015Z (16:35→16:45ICT).
All required conditions passed after602.478s;writer exit0/OOMKilled=false.

| Measured condition | Result |
|---|---|
| Changed near2MiB bodies |8,969 writes,body2,095,928B,14.887 measured requests/s;zero normal-load denial/error |
| Actual TOAST vacuum |119 cycles,9,418,011 inserted chunks;not forced manual VACUUM |
| Physical/live size |maximum318,799,872B (304.031MiB),live-byte max2,096,032B;below declared limits |
| Final5minute plateau |baseline231,260,160B→253,509,632B;growth22,249,472B ≤declared23,126,016B tolerance |
| Hit/pressure authority |live sentinel preserved;injected pressure refuses new leader,serves hit;normal admission recovers;no TRUNCATE/fresh eviction |
| Cgroup sampled maxima |PG554,508,288B (528.82MiB),writer59,846,656B (57.08MiB),61 samples each |
| Enforced PG budget |memory.max899,997,696B,max/oom/oom_kill events0;kernel memory.peak unavailable |
| Cleanup |collector exit0/inactive;two containers,internalnetwork and own fixturevolume removed;no remaining project resource |

Actual WAL/temp/IO/connection
samples, cgroup charges/limits/OOM counters and source hashes are retained at
`/home/bobby/.local/state/portal-udb01/qualification`. Collector
`portal-udb01-qualification-final-20261010.service` has RuntimeMaxSec2100.
Source/config checksums and retained report hashes verified after terminal;
status PASS_BOUNDED_QUALIFICATION_NOT_24H,not an extended-soak claim.
No UDB-02…04 implementation or prod GO claimed. Unchanged numerical/UI receipts
reused by scope,not called newly tested. One normal grouped hook, no bypass/push.

## C4 and handoff

Root~169GiB free/73% used; capacity observation retained. Test trap removes only
owned disposable PG. Final collector removed only its2containers/internalnetwork/
own fixturevolume after completion;no active lane or owned resource remains.
Final root181,204,475,904B free (~169GiB),73% used. C4 **NO_ACTION_NEEDED**
within this phase;retain reports,backup and rollback image IDs for30days.
No application image/cache/volume pruning,
no business delete,no VACUUM FULL. Existing outside preview/probe resources
remain inventory-only,not cleanup authority.

Claude:no UI action needed in UDB-01. UDB-02 gets the160table/312FK inventory
and preservation manifest; UDB-03 receives resource-access/retained panel
contracts when approved. Do not bind or enable new source reads from PG config.

## Non-applicable product gates and reporting boundary

Delta RSI source/params/engine and all accepted Research/Execution frontend
files are unchanged: no new engine run, visual baseline, browser screenshot or
numerical-equality claim. Existing product receipts are reused only for those
unchanged surfaces. This storage-only phase is not cross-loop hydration or
P23/P24 whole-product acceptance. Preview readiness is checked through existing
same-origin `/api/control/readyz`, `/api/ready` and `/execution`, all HTTP200.

Common dev/stable settings are versioned for the later authorized workflow;
their runtime remains untouched. UDB-02 owns the explicit Execution store/
pool/FK migration, UDB-03 owns retained reads/access mapping/Claude handoff,
UDB-04 owns the final cross-loop candidate and product tests. No PR/push,
merge/dev/main, stable rollout, Cloudflare/TLS relaxation or command activation.

## Changed-file manifest

Counters below are filled from the actual staged diff against parent9745b9ef,
not inferred from runtime or an empty post-commit worktree. Unified includes
the previously uncommitted approved four-phase planning addendum. No unrelated
Claude code is staged. Final commit identity is obtained from `git log -1` on
`docs/research-loop-plan`; the normal root hook gates this one grouped commit.

| File | + | − |
|---|---:|---:|
| `apps/control-api/migrations/1723680000130_udb-cache-storage-forward-repair.sql` | 20 | 0 |
| `apps/control-api/src/execution/shared-read.repository.ts` | 17 | 2 |
| `apps/control-api/test/execution-shared-read-cache-maintenance.spec.ts` | 32 | 0 |
| `apps/control-api/test/udb-cache-storage.spec.ts` | 69 | 0 |
| `compose.yaml` | 1 | 1 |
| `deploy/compose.production.yaml` | 1 | 1 |
| `deploy/postgres/README.md` | 116 | 0 |
| `deploy/postgres/compose.udb-soak.yaml` | 52 | 0 |
| `deploy/postgres/p23.conf` | 14 | 0 |
| `deploy/postgres/portal.conf` | 6 | 2 |
| `deploy/postgres/preview.conf` | 14 | 0 |
| `deploy/research-preview/compose.research-p23-5gb.yaml` | 4 | 0 |
| `deploy/research-preview/compose.research-preview.yaml` | 10 | 0 |
| `deploy/runbooks/execution-shared-read-cache-lifecycle.md` | 9 | 0 |
| `scripts/research-udb/config.test.mjs` | 42 | 0 |
| `scripts/research-udb/inventory.cjs` | 43 | 0 |
| `scripts/research-udb/monitor.sh` | 31 | 0 |
| `scripts/research-udb/preview-profile.sh` | 99 | 0 |
| `scripts/research-udb/soak.cjs` | 145 | 0 |
| `scripts/research-udb/soak.sh` | 52 | 0 |
| `scripts/research-udb/test.sh` | 64 | 0 |
| `upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` | 18 | 0 |
| `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` | 392 | 0 |
| `upgrade/backend/README.md` | 9 | 0 |
| `upgrade/research_loop/evidence/UDB-01/README.md` | 41 | 0 |
| `upgrade/research_loop/evidence/UDB-01/debt-register.json` | 19 | 0 |
| `upgrade/research_loop/evidence/UDB-01/phase-report.md` | 209 | 0 |
| `upgrade/research_loop/evidence/UDB-01/storage-and-identity.md` | 64 | 0 |

Total: 28 files, +1593 / −6.

