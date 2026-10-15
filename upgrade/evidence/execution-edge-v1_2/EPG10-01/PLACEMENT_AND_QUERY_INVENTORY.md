# EPG10-01 — measurement preparation and placement inventory

Status: **IN_PROGRESS / AVAILABLE_SOURCE_MEASURED / EXIT_NOT_MET**. Bobby approved
this phase; no repeat generic approval required. **Current results and one
consolidated remaining-action packet are in §7 below.** §§1–6 preserve the
earlier preparation observations, not current claims of no measurements.
Both-host passive baselines and a bounded real retained replay cell now exist;
neither is whole-stack capacity, final placement or six-test acceptance.

Authority: [main plan §23.10](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#epg10-01-plan),
[Edge guide §§6.6/9/10](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md),
[BE §13 / ELP2-10](../../../upgrade_v1.2/EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md),
[score §§8.6/10/12](../../../upgrade_v1.2/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md),
[Review §§5/8.1](../../../upgrade_v1.2/REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md).
[Measurement sheet](measurement-plan.json) is the machine-readable workload,
clock/counter protocol, 14-budget register and explicit missing-input list.
All nulls are UNKNOWN/UNDECIDED, never zero or unlimited. No guide bytes changed.

## 1. Read-only host and configuration inventory

Observations UTC 2026-10-15. These are single metadata snapshots under changing
foreign work, **not** steady/burst baselines or safely reservable capacity.

| Host | CPU / memory / disk | Observation and confounder |
| --- | --- | --- |
| AWS HK,16:50:10 |16 logical CPUs;32,903,782,400B RAM;15,242,964,992B MemAvailable;swap0;192,678,240,256B disk available |Load18.37/20.44/20.36; foreign TS/DL production measurement active |
| SGP,16:47–16:50 |8 logical CPUs;32,862,520KiB RAM;11,371,604KiB MemAvailable;swap0;169,270,902,784B disk available |Research Node/PG test jobs active; CPU percentages are diagnostic, not paired evidence |
| SGP,16:57:36 |169,451,610,112B disk available, root75% used |Earlier test stack exited; no lock file, but no reserved EPG window. Normal Research services remain |

HK per-profile configured ceilings (same three sets: Paper/Sandbox/Live):

| Role | CPU quota | Memory hard ceiling | PIDs |
| --- | --- | --- | --- |
| Rust execution-edge |2 cores |2GiB |128 |
| Source Proxy |0.5 cores |0.5GiB |64 |
| Rust manager-projection-worker |1 core |1GiB |64 |
| Projection PostgreSQL |1.5 cores |2GiB |128 |

Across three profiles this is **15 cores /16.5GiB of configured maxima**, not
reservations, actual usage, independent machine capacity or a safe resource
budget. Six additional Manager façade/issuer containers have no explicit Docker
CPU/memory cap. Existing TS/DL and host overhead remain additional costs. Do
not lower/raise these limits from this inventory alone.

HK effective per-Edge settings: request concurrency32, response2MiB; Manager
admission8r/s and8concurrent, cache750ms, wait1s, lease7s; request/connect/queue
timeouts5s/2s/250ms. Realtime queue256, poll100ms, batch512, replay1024,
heartbeat15s. Worker polling60s; local Edge projection false / worker true;
event ledger/source probes/command relay false; Manager read true. These are
current settings, not v1.2 producer ceilings.

SGP stable/integration source admission:64concurrent, queue128,15requests/s,
pace wait1s, request5s, response2MiB, queue250ms. Local projection poll15s,
lease120s, stale ceiling300s, journal86,400s/10,000entries. Shared read cache
20,000rows/256MiB; sweeper60s, startup jitter5s, max2s work/batch128rows/8MiB,
dry-run false. Node PG pool max10/process; Rust projection pool max8/process,
min0, acquire3s, idle60s. API stable/integration/preview lack explicit Docker
CPU/memory/PID ceilings; preview execution PG has1CPU/512MiB/PIDs96.

**Measured bottleneck ranking: NOT_AVAILABLE.** Static risks to measure are
HK co-location/aggregate ceilings, SGP→HK admission interaction, full-list
rewrite/WAL, history aggregation scans and duplicate caches/copies. They are
hypotheses, not proven hot spots.15r/s SGP versus8r/s HK does not itself prove
a defect (profile batches and shared admission differ); measure admitted/rejected
requests, queue waits and source work instead of widening a limit.

## 2. Expensive-path/query inventory

Source authority for current Research paths is SGP
`/home/bobby/portal-research-be@d5d31cbd7adf3db658508b3cc9aedb280c1be2f1`,
not this feature's older dev implementation. Files below are relative to that
checkout. Query shapes were read, **no business rows, EXPLAIN/ANALYZE, DB stats
reset, new index, endpoint request or source query was executed**.

| Path / owner | Trigger, bounds and retained state | Complexity / missing evidence |
| --- | --- | --- |
| `apps/control-api/src/manager-lists/manager-lists.service.ts:340–452`, Research |5s lease; SWR + per-process single-flight; profile-sized batches of8relation drains, Paper performance extra; up to10pages×200rows/drain |Up to25drains/50,000rows for all-profile Fleet is a **theoretical ceiling**, not actual rows/QPS; measure browser, process/replica and key cardinality |
| `…/manager-lists.repository.ts:135–198`, Research PG |Scoped advisory-lock transaction; scope DELETE then reinsert Fleet/bindings/portfolios plus snapshot |Rows rewritten may exceed changed rows; measure calls/time/locks/WAL, cancellation and rollback. No authorization to replace query/index now |
| `apps/control-api/src/execution/profile-projection.worker.ts`, Research |Leased15s poll; ordinary10 / ladder50pages×200; catalogue warm30days/2,000rows per relation, full-depth separate |Cost scales with active bindings/relations, not automatically all96. Current observation continuity is not source journal replay |
| `…/profile-projection.repository.ts:365–414`, Research PG |History JSON recordset append, conflict-ignore; scoped `(ts,row_id)` keyset+LIMIT |Verify applied composite index/real plan, skewed entity selectivity, write amplification and idempotency on isolated approved DB |
| `…/profile-projection.repository.ts:468–612`, shared Research analytics |History count/min/max metadata, window extrema decimation, daily-close/portfolio aggregates |Input scan/sort may scale with full retained history. Chart min/max preservation does not authorize decimated score input; record plan/rows/temp/spill |
| `…/profile-projection.repository.ts:731–798`, Research PG |Atomic snapshot/journal commit, retention DELETE and pg_notify |Measure journal high-water, WAL/vacuum, notification/pool wait and recovery. Do not infer authoritative TS Event semantics |
| `…/profile-realtime.service.ts`, Research |Shared local tail250ms, health1s;16groups×256subscribers,32pending/group, replay1,000 |Expected browser→TS work0 on shared tail; prove with source counters during W-DASH/reconnect/revoke, bound queue bytes not just counts |
| `apps/control-api/src/db/pool.ts`, Research |Shared process pool max10, idle30s |Multiply by actual replicas/targets; record acquire/active/wait counters. Pool count alone is not DB connection usage |
| `services/portal-execution-edge-rs/crates/projection-store-pg/src/lib.rs:135`, Edge |Rust PG pool max8/min0/acquire3s/idle60s |Include each worker/Edge process plus active features and temporary copies, not just one pool |
| TS Manager fixed catalogue queries, TS source owner |Existing read-only bounded pages; static read-pool1–4 / timeout100–5,000ms envelope |Effective runtime pool values, applied index/query plan, scans/WAL/rows/latency still UNKNOWN. Never add a Portal DB/SQL/Redis bypass |

Read-source file SHA256 on SGP:

- Manager service `543ac808479eefdc0a2ff2f1a66af87ca2e212971933574be7876017169b4fa8`;
  repository `20d164d505dc34d860987dea75f5fab7361ac58fce5020d10039d77a62d65159`.
- Profile worker `2c572a2051619e0876170ba2a02ecdf3cda437e110fec4215b11e3c631681a1c`.

## 3. Placement decision boundary and sizing

**PROPOSED / guide-aligned, NOT measured/approved placement:** keep TS as
economic authority and bounded source/export owner; HK Edge minimal Rust
transport/auth/backpressure/recovery metadata. Research owns durable projection,
retained history, user query/fanout and one shared analytics calculator. Reuse
existing process/module boundaries; add no service, ledger, generic query route
or per-browser source poll. Existing deployment remains unchanged until every
impacted axis has a real baseline, approved bound and compatibility evidence.

Sizing must fill **all** process groups and replicas: TS producer/Manager/issuer,
Proxy and network buffers, Edge in-flight compressed+decompressed serialization,
worker pools/queues, both PGs, Research API pool/cache/journal/fanout groups,
analytics queued+running jobs, allocator/runtime overhead and explicitly owned
host reserve. Byte limits cannot be inferred from row/message count alone.
SGP256MiB cache bound is per effective instance; do not count it once for all
replicas or mistake batches for additional persistent cache capacity.

Memory/backlog/catchup formulas and unknown inputs are in the JSON sheet.
The offline helper checks all seven memory components per group×replicas,
measured storage-amplification arithmetic and positive sustainable catchup
capacity. It does **not** discover missing processes, approve limits or prove
recovery. Groups remain empty/NOT_MEASURED rather than invented byte estimates.

Score feasibility companion became discoverable during round2 on SGP:
`/home/bobby/portal-research/upgrade/execution_loop/SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md`,
SHA256 `109659d2f27159052ee684a43eafd130dd2540c4e7dd995a5f0dfe1647029ff9`.
Read fully with campaign rules/README/source receipt; this resolves **document
discovery only**, not inputs/calibration or benchmark evidence. Arithmetic F/band
is O(1); aligned one-window metrics O(n+m), exact rolling MDD/ADD may need O(n)
rebuild per affected subject/window. Regime distance O(kd) plus selection.
History IO, sorting, corrections, subjects/horizons and cadence dominate sizing;
no score computation in TS hot path or browser request. Math44/47 historical
tests are not new EPG capacity tests. Missing Regime/research binding does not
block independent direct-NAV scoring with sufficient certified economic inputs.
Do not implement analytics in phase01.

## 4. Source/runtime rounds and coordination

Local feature root is sole writer; two read-only agents cover TS/DL and Research,
one reviews offline helper invariants. No agent runs a parallel benchmark.

Round1 16:46–16:50Z and round2 16:57–16:58Z:

- TS `feat/v2-rust-first-okx-demo@4e9c5f29313019714bd82aa1b7b491d2689630ca`;
  DL `fix/p184-dl-closure@864774d5df6b9cfe8c9163272847619c20ff3b9f`;
  PM `feat/portfolio-account-v1_1-parallel@d16aa2b5f251596e469807f57e81fe14cdc7e763`.
  All staged/unstaged diff hashes remain SHA256(empty)
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
  TS same untracked historical PM guide hash
  `1ac56bff4e5728650cdb91df0544a8f3e17c5103d56ad49d3549f4b7e864b6e3`,
  **not** current PM R2. TS/DL plan hashes unchanged from phase00 manifest.
- Current P184 stage100#2: driver exited0 and samplers stopped; at16:57 G11
  armed, scorecard absent, **ACCEPTANCE_PENDING**, not PASS. Foreign lock until
  17:42:27Z /00:42:27 Oct16 Asia/Saigon remains authoritative even post-load.
  At17:02:46Z root recheck the foreign lock is now ABSENT (owner removed it);
  this supersedes the earlier active-lock observation, not an EPG window
  reservation or automatic permission for production injection.
  Historical6k/9k PASS and previous failed production stage remain distinct;
  no new N1/F1 readiness or EPG coexistence PASS inferred.
  Final17:03:06Z metadata found scorecard written16:59:45Z:
  `/home/bobby/.local/state/qdl-v2/p184-final-campaign-20261015T162352Z/scorecard.json`,
  SHA256 `6ae7c5249fbf975fe38648aaf24121233876f4ff4eb38986a3079968f3f4d3b6`.
  `protocol_met=true`;8PASS (G1/3/5/6/9/10/11/14),4FAIL
  (G2/4/7/8),2NOT_MEASURED (G12/13). G2 transit and G7 BOOK_SNAPSHOT
  latency remain unresolved. This supersedes ACCEPTANCE_PENDING as a
  **completed external campaign with failures**, not an Edge T01 run or PASS.
- SGP BE unchanged at`d5d31cbd7adf3db658508b3cc9aedb280c1be2f1`, clean;
  FE/docs moved from`5f3f23327367438b8fe3ab048a7ad3ce5ae9a728` to
  `be56efdf8a44b0fd8cd44202b04ada582293a1dd`. FE clean; docs retain peer
  rules/plan edits, unstaged digest
  `8fc3f8db61303da7ffc67a4cfdaf62e638cfffb697e932cc805260bd06d4df35`,
  now11untracked paths, raw path-list digest
  `6d675e487becd2222755f98771624daad2ae6819a133d544f0f44432e4e93e30`.
  No reset, checkout, merge or write into those branches.
- New Research coordination rules read at
  `/home/bobby/portal-research/upgrade/execution_loop/AGENT_WORKING_RULES.md`,
  SHA256 `fda2386b5261be18f2b291f66146378bebdd9c1b11f1dfabedb94c15c024f169`.
  Research integration is `docs/research-loop-plan`; this explicitly approved
  isolated HK Edge feature remains separate. Existing guide-bundle4hashes match;
  new Research source receipt is historical, not a runtime attestation. Its
  earlier missing-feasibility wording is superseded by discovery above, not
  silently edited in the other owner's worktree.
- Canonical SGP `fix/stan-context-password-change-origin@87d9d98c3a80400a72de759e63dfc50af70e0436`;
  stable source main`533162635f56584d630e3d971d77d50860595f15`;
  integration`docs/consolidation-closeout-20260919@c43ee0317a439b4566decd5fddfc8be839db239e`.
  No branch move or deployment inference from these paths.

Runtime images/config/service/release tuple and unchanged rollback retention
remain the [phase00 manifest](../EPG10-00/source-runtime-manifest.json). HK
18/18 image/config/restart tuples compared unchanged in this slice. SGP stable
and integration Control API image/config/restarts unchanged at16:57:36Z.
Manager upstream leaf expiry Sep27 remains; no TLS bypass/rotation or handshake
claim. Health is only process state. No runtime/data/credentials changed.

## 5. Historical preparation packet — superseded by current §7

| Missing input / owner | Smallest required action / evidence |
| --- | --- |
| Clean windows, TS/DL + Research runtime owners |Recheck both hosts/foreign campaign; reserve coordinated measurement lock for owned jobs only. Current lock expiry alone is not permission to stop foreign jobs |
| Exact isolated target, Edge + source owners |Bind source copies/replay, profile/env, immutable B0/B1/B2 artifacts/config, namespaces and bounded generator stop/teardown; no production fault injection. Phase approval is already recorded |
| Paired coverage/transport, Edge + TS owners |Obtain working pinned source path for each impacted case, including TLS repair under its own exact operational scope where needed. Current P184 G2/G4/G7/G8 failures must not be presented as a passing baseline. PM/Event source-dark only blocks dependent features; preserve existing read baseline |
| Fixture/cardinality, TS/DL + Research |Bind original600s×2 6k/9k receipts and real expected catalogue/history/clients; use TEST_ONLY isolated replay where original harness requires it, never market provenance. No smaller replacement called equivalent |
| Clock + counters, measurement operator |Record offset/error, full-window populations, process/DB/WAL/IO/network/queue/allocation scopes. Isolated query plans first; no source-global stat reset |
| Baselines/bounds, Bobby + domain owners |Fill all14budget axes with observed baseline then approve numeric candidate safety/non-regression limits. Unknown budgets stay UNDECIDED. Current Docker caps are not substitute approval |

Then execute all six T01 cases/12 workload shapes as applicable, record exact
exceptions with domain owner (never waive correctness), compare B1−B0/B2−B1/
B2−B0, cost/record and dashboard slope, make measured placement decision and
teardown only owned resources. Continue **EPG10-01**, not phase02+. The helper
does not auto-run anything even if all inputs are later complete.

## 6. Tests, hygiene and debt boundary

Commands/results and exact case separation are in
[verification receipt](verification-receipt.json). Lightweight stdlib helper
tests are TEST_ONLY preparation, not any actual T01 measurement. No candidate
performance numbers or production score defaults invented.

No phase-owned image/container/cache/volume/row/secret/port created; teardown
`NO_ACTION_NEEDED`. HK read-only Docker inventory in this slice:132images,
34.95GB;392BuildCache entries/27.91GB,47active/607.7MB reclaimable at query
time. Image count changed under foreign work, not this phase. Preserve all
operational/active/rollback containers/images/volumes; no prune during shared
campaign. SGP cache summary not collected after bounded query yielded; no
retries or cleanup. HK disk available192,678,240,256→191,654,641,664B;
SGP169,270,902,784→169,451,610,112B. **No cleanup/reclaim attribution**.
Qualified rollback-release inventory remains UNKNOWN; no artifact removed.

No unfixed helper defect remains from review. Missing measurements/approved
numeric bounds are explicit unfinished phase deliverables and external runtime
inputs, **not** debt relabelled as complete. No product/Rust API/contract change
and no delivery or readiness promise to Portal. Source-only and runtime tuples
stay distinct; no push/merge/deploy.

## 7. Current approved continuation — observed, not capacity-certified

Authority unchanged; main journal §23.10.1. Raw source rows/private configuration
never enter this repository. Sanitized current receipts:

- [HK120s/40container observation](hk-observation.json), raw SHA256
  `1c59f428fb5b4bf5602b4c5f11ac186331191c6c412d61921b767a2f8082ec8e`.
- [SGP120s observation1](sgp-observation-1.json), raw SHA256
  `67da4c8a5f455d2e4397112cca332cd3d1883d7afa0c9f23895c8ee026e92578`.
  Includes a short own metadata-only module-resolution process; not a clean
  benchmark repeat. [SGP120s observation2](sgp-observation-2.json), raw SHA256
  `6425f7e5676c923c395630fb562ad738e93aaae885acb3e330bb5b91f3c868b7`.
- [Actual existing retained repository, two runs](retained-repository-runs.json).
- [Exact disposable retained replay cell](isolated-retained-cell.json), including
  native migration idempotency, six-table parity, actual isolated query plans,
  two repository repeats,1Hz PG metrics,10s controlled PG idle and cleanup.
- [Verification / limitations / earlier attempt dispositions](continuation-verification.json).
  The old `verification-receipt.json` remains the historical prep-only receipt.

### 7.1 Observed cost and placement decision

| Population | Actual measurement | Interpretation / limit |
| --- | --- | --- |
| HK host,120s ending18:26:03Z |16CPUs; busy42.1563%, iowait8.7283%; MemAvailable minimum16,740,528,128B |Existing mixed runtime only, no controlled production idle or free CPU reservation |
| HK40selected containers |6.233721average cores; maximum simultaneous sampled memory13,756.72MiB |Does not include all host/allocator/transient memory; shared net namespaces cannot be summed |
| HK12Edge/proxy/worker/PG containers |.305695average cores;1,408.84MiB maximum simultaneous sampled memory |Three profiles, not one new Rust producer's measured bound |
| HK Kafka1/2/3 |.801/.983/1.072average cores; memory.events.max403/396/540, OOM0 |Actual memory/CPU pressure to preserve; no source tuning authorized |
| SGP clean repeated host window |8CPUs; busy14.6767%, iowait.0997%; MemAvailable minimum12,352,135,168B |More apparent headroom in this window; not sustained/HA/analytics capacity |
| Existing SGP history |7rows/1h;100reads/run; p95=2.099/2.211ms, p99=2.262/2.300ms |Exact repeat digest; no heavy-history or sustained capacity claim |
| Repository sharing |16identical in-flight history callers→1query;16warm snapshot reads→0queries |Internal sharing works; not proof of browser/HTTP/source-poller amplification |
| Internal retained snapshot |11,184,215B; existing instrumented cold855/714ms, Node maxRSS158,464KiB |Measured path is much heavier than narrow reads; no profiler attribution to an individual stage |
| Isolated same captured data |3,623rows:1workspace ref,42batches,3revisions,3,569entities,1snapshot,7history |Full current retained profile/FK closure, not complete TS history/catalogue |
| Isolated half-core driver |History p95=1.762/1.804ms; cold snapshot1,824/1,825ms; maxRSS146,236KiB |Different CPU/transport/data universe; not paired improvement over existing DB |
| Isolated actual plans |9shapes/run; max3,569actual rows; no temp spill or plan WAL |ANALYZE ONLY here. Largest root217.571/142.649ms; no source-global stats reset |
| Isolated PG |1Hz sampled memory maximum170,172,416B; OOM0; capped.5CPU and768MiB |True transient peak, all DB/host copies and steady-scale growth still unknown |
| Controlled PG idle |10.105635s,10health reads,0business mutations;.058410average cores;117,866,496B sampled maximum |Includes health psql process cost; not whole-stack W-IDLE |

All snapshot cold measurements include first-seen EXPLAIN instrumentation in
the adapter. They are **instrumented rehearsal times**, not uninstrumented
production latency. DB/OS caches warm; application repository cache is new per
process. Two repeats describe spread, not a statistical capacity guarantee.
The real and isolated history/snapshot digests match exactly. Isolated DB size
17,472,535B; observed `pg_stat_wal`19,392,190→19,392,240B is a whole-cell
counter (+50B/1record), not financial write amplification or durable storage
proof. PGDATA tmpfs IO counters are not a disk/fsync benchmark.

**Measured priority:** broad snapshot processing/output is the largest tested
read operation; narrow indexed history and shared cache reads are cheap at this
cardinality. HK source CPU/IO/memory pressure argues against moving broad
history/analytics there. Keep source authority+minimal auth/export on HK;
Research projection/history/cache/fanout/shared analytics. Reuse existing
modules/processes, add no product service in01. This is a supported placement
direction, **not final candidate capacity acceptance**.

**Contract issue to carry into02, not silently fix now:** whole internal
snapshot11.18MB cannot be sent through the existing Edge2MiB route bound.
Freeze bounded paged/streamed full traversal and explicit oversize behavior;
do not raise production caps, omit rows or describe internal probe as route
qualification. Existing200rows/1MiB Manager compatibility pages remain distinct.

### 7.2 Numeric proposals and all-copy boundary

[Machine-readable proposals](measurement-plan.json) are scoped to this exact
retained rehearsal: history p95<=5ms/p99<=10ms, instrumented snapshot<=2,500ms;
SGP MemAvailable floor8GiB. These are conservative next-rehearsal tripwires
grounded in the observed windows, **not production defaults or universal SLOs**.
Enforced PG768MiB/.5CPU + driver384MiB/.5CPU,256MiB old-space; one DB client,
250ms statement/100ms lock/3s idle-transaction deadlines. No new production
limit/resource/approval introduced. The14production groups remain UNDECIDED
where their actual population/contract is missing; measurement is not waived.

Container hard caps total1,207,959,552B, NOT all-process peak memory. PG512MiB
tmpfs is inside its memory cgroup; do not count it twice. Private capture max32MiB
on host, orchestrator/Docker child overhead, shared OS pagecache, allocation
fragmentation and producer/projector/fanout queues/copies remain additional
terms. Per-process pools/caches in §1 must be multiplied by actual replicas.
Do not insert zero for unknown reserves, outage duration/storage amplification,
sustainable replay throughput, critical trading or freshness populations.

### 7.3 Remaining cases — one packet, exact owner and permitted next action

| Case / current status | Already done | Missing evidence / owner / smallest next action |
| --- | --- | --- |
| T01-01 NOT_RUN full pair |Same-source real and isolated repeats; correctness digests |Edge02/03/04 owners: freeze/build actual schema/producer/projector candidate, then pair B0/B1/B2 under identical coverage/config/cardinality. This is future candidate implementation, not TS-owned debt |
| T01-02 PARTIAL |16→1query sharing;16snapshot hits→0queries |Edge+Research: instrument HTTP/BFF→source counters, representative scopes/tabs/reconnect and byte queues on the actual compatible target; internal sharing alone does not prove browser fanout |
| T01-03 NOT_RUN full resync |Native schema idempotency, exact seed parity, own-session timeout/recovery |Edge exporter/projector owner: actual cursor/retention/generation contract and candidate; then full catalogue/history resync, peak/IO/live-delta starvation and durable recovery. Seed/tmpfs replay is not resync/DR |
| T01-04 PARTIAL |Controlled retained PG idle and absolute cost; both-host passive windows |Edge measurement operator: controlled whole target idle after the candidate exists; do not stop live business/foreign jobs to fake idle |
| T01-05 BLOCKED |Exact native fixture semantics/source scorecard pinned |TS/DL own external source fixes/rerun; Edge owns its later B0/B1/B2 pair. Foreign HK lock must release. Run original600s×2 at6k/9k canonical events/s, never reduced lookalike or orders/s |
| T01-06 PARTIAL |40HK/36SGP observations, actual isolated PG/Node, enforceable test caps |Edge+Research workload owners: all runtime/allocator/DB/pool/task/queue/copy totals and reserve attribution at actual candidate load, plus all14numeric production axes; no magic constants |

External source dependencies apply only to affected features:

| Producer owner | Exact missing return | Does not block |
| --- | --- | --- |
| TS N03 publisher |Accepted external route/workload identity+permit, dataset/profile/schema, cursor/retention and actual fresh read receipt; still SOURCE_DARK |Existing retained read/contract work |
| PM owner |Current full export/source proof, transport delivery and consumer-applied checkpoint; full15/16 still in progress |Non-PM retained and independent schemas |
| Runtime/PKI owner |Manager issuer/facade expired Sep27: bounded authenticated route receipt after its own operational repair window |SGP local retained observations; never disable TLS verification |
| TS/DL P184 owners |Current G2/G4/G7/G8 failures require accepted source rerun; source commits alone are not PASS |Baseline inventory and logical contracts |

01 phase approval remains valid; no generic reapproval request. Exact available
retained-source continuation is delivered. Full01 exit **not met**:0formal
PASS/3PARTIAL/2NOT_RUN/1BLOCKED. Missing Edge measurements are explicitly
unfinished, not relabelled external debt. **Next independent work:**02 logical
catalogue/schema/compatibility when Bobby names it; unknown capacity blocks
load movement/candidate admission, not logical design. No automatic02 start.

### 7.4 Current source/release/runtime and cleanup reconciliation

Read-only parallel source repin18:43:54–18:44:45Z (not deployed provenance):

| Source / branch | Full HEAD | Unstaged diff SHA256 | Journal SHA256 |
| --- | --- | --- | --- |
| TS `feat/v2-rust-first-okx-demo` |`354d91fb39e8c91e82bbf0cf1e06a2d0bd70a956` |`7b4855469e68642d751c387ecc6067bb08f304f8b29b184478e5f4268bc0e3a1` |`ec81e5ace8ceb800fabf0a4ad7f09296c5cf8ee940b7330beb940cb152ffd1d8` |
| DL `fix/p184-dl-closure` |`bb4c85167bfaaa5b269cb1c770bb0b9bef53f665` |`24ee2d4a390f54031cbc58efc11c1d93378bbfe1467a20e0d5dfe38b73896399` |`7719ced1722804f479487420d3f187fdefc0c2ad139a85d92c1b69a096cba7a2` |
| PM `feat/portfolio-account-v1_1-parallel` |`d16aa2b5f251596e469807f57e81fe14cdc7e763` |empty |`96ee825d90a33f3cab614b8c7053408fc34b6ae965db867e6efc33ef769735fd` |

All staged diffs empty. TS/DL untracked NUL-path-list digests respectively
`0f5ccc3e62adf3367f549fa8fc2ab99b763ff0c1580f8bbc0fef1ba4b1d800e2` /
`d5fea5bc0837a444373628874828d97c349ebbf9cc23f7597ad1cf28e6395b54`;
PM empty. DL changed during read: timestamped snapshot, not a locked future
source proof. TS+PM campaign journal hash
`155382b0e5209dfd3f439e412c31fc846e7c077efcc6d820cf695d5f65bbfc2a`.
New TS G2/G8 fixes and DL load-slice/review changes do not change the prior
external scorecard8PASS/4FAIL/2NOT_MEASURED. Historical00manifest preserved;
this is a scoped delta/review, not blind rehash of stale source authority.

SGP BE `d5d31cbd7adf3db658508b3cc9aedb280c1be2f1` unchanged;
Research docs/FE `be56efdf8a44b0fd8cd44202b04ada582293a1dd` at18:48:38Z,
dirty diff `54af0308e513b7c150b65d6ea157d694df7d4f14b0d58fb381be1929ee60b2a5`,
untracked NUL-path-list `aa6d248e23164b7c6cb9a659193f88f788dc908db6b069f84430025e134437d4`.
Peer changes preserved. Actual repository image/module SHA in receipts, not
inferred from those branch names. Re-attest again before candidate execution.

Canonical HK source remains `/home/bobby/.worktrees/portal-execution-manager-v2`,
`feat/manager-v2-paper-read@54c6f5f3cccd68f400f4dd25ae6f4b17320a7db4`.
Upgrade source is this active isolated `feat/execution-edge-upgrade-v1_2`;
six current worktrees preserved (other five names/branches in00manifest).
Stable release locations:
HK `/srv/primus/portal/releases/a9b10385ab6c16350555f70f4379dfa23ca6b20c/deploy`;
SGP `/srv/portal/releases/e4fd93658de1ff0614126a85d70e59a23c25a01f/compose`.

Active Edge/Proxy images unchanged:
`sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e` /
`sha256:aa14e21c546997a94c61238ee46cf92cb650e822c4ea22f357090e275886246b`.
Actual preview API/PG image IDs in isolated receipt; full operational service/
config/image/restart roster in observations. HK40/40 and SGP36/36 final image/
config/restart tuples unchanged (four missing Compose labels normalized null/"").
Source code changed in parallel, no source/runtime equivalence
inferred. No activation/flag/credential/config/index/source/operational restart.

Cell exact labelled PG removed, driver auto-removed after each run; private raw
capture, Unix socket, copied scripts and tempdirs removed. Final18:48:38Z read-only
check: no named cell container, no `epg10-01-*` tempdir, no SGP lock. No image
build/pull, no persistent Docker volume, no test service retained. Existing PG/API
images remain operational; all current/foreign/rollback resources retained, no
new rollback artifact. SGP cell disk169,369,038,848→169,368,662,016B; final
169,368,715,264B. Shared-host net values are not a reclaimed-byte claim.

Read-only final Docker image/BuildKit inventory: HK124/34.66GB and391/27.86GB;
SGP328/88.82GB and3776/195.9GB. No phase-created images/cache to remove; broad
cleanup intentionally not done under shared foreign work/unproven ownership.
No volume/network/operational-container removal. HK disk195,353,194,496B available.
Both hosts `NTPSynchronized=yes`, but no calibrated offset/error bound.
HK foreign lock `claude-n1-opt-20261013`,18:39:08–19:54:08Z, isolated TEST proof
purpose; no local load/build/cargo/pytest started. Separate SGP lock absent
before own job, atomic own lock held during job and removed afterwards.
No push/merge/deploy; all tests/receipts and main/index updates form one commit.
