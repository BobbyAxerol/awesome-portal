# EPG10-01 — measurement preparation and placement inventory

Status: **IN_PROGRESS / MEASUREMENTS_BLOCKED / EXIT_NOT_MET**. Bobby approved
this phase; no repeat generic approval required. This package is a tested
preparation slice, **not** a two-host baseline, capacity result, final placement
approval, service activation or closure of the six EPG10-T01 tests.

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

## 5. One consolidated completion packet — same phase, not new gates

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
