# ELP2-10 — source budgets, placement and coexistence alignment

Observation **2026-10-16 11:29:07–11:31:08 UTC**, read-only SSH
`bobby@16.163.212.33`, hostname verified `ip-172-31-16-126`. Portal entry
`docs/research-loop-plan@e6620f416e43bc8c18a044339a598c436d8556ba`.
Task10-SOURCE owns only this file. No remote write, Git mutation, business
API/DB call, test/build/load, runtime/container inspection, credentials or
service operation. The initial sandbox network denial was followed by the
normal approved read-only SSH escalation; no alternative access path used.
Remote `rg` is absent; bounded `grep`/`find` source reads used instead.

## 1. Current custody — HEAD is not the whole candidate

| Worktree / branch | HEAD | Current owned-by-peer state |
| --- | --- | --- |
| `/home/bobby/.worktrees/trading-system-pm-v1_1` / `feat/portfolio-account-v1_1-parallel` | `d16aa2b5f251596e469807f57e81fe14cdc7e763` | Two tracked files modified; two new source/test files; PM service-recovery work uncommitted |
| `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2` / `feat/execution-edge-upgrade-v1_2` | `f10c15f6bd6d7e30358af5946c2877b33b8fe4c2` | Fifteen tracked files modified; four untracked status entries; EPG10-08 qualification WIP |

PM tracked modifications: `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md`,
`services/portfolio_management/binding_repository.py`; new
`services/portfolio_management/profile_recovery.py` and
`tests/integration/test_pma11_profile_worker_recovery.py`.
PM tracked diff SHA256 remained
`999dffa9eafc7c91bb87248e7e19b12669cd342298579a193effd1d2ef6dedec`;
untracked path-list hash
`b15d2f84290d1aa72e78a4db8f8e4dbf1134a98744999ad27b9d38e490732e65`;
untracked content-manifest hash
`c2e465333d462f2b3c0cc065c287bd515390d605fb957378abcb68b969da04bd`.

Edge tracked changes cover existing runner, Cargo lock, auth/transport/client,
service, scoped authorization and two PG test files, plus four journals/indexes.
Untracked entries are manager-client TLS tests, scoped `authority.rs`,
`EPG10-08/` evidence, and feasibility review. Tracked diff changed during this
read: initial `c38d90891ba14043c534a4a80662b7f1e4fec40287ffaaa4419fc62d4d2fd126`
to `106312559fd888db8b74dbb9b00ab5256e8ebd42a87a918f36f9e72496060183`
at11:30:53. Untracked path-list changed from
`2e111a587514907e56e186b64814c723a27a7047907915b89ea597f87eb23593`
to `8defbbd407a2acdcbb7054e12119ae6ae48c8df00eb6dd114eb0800d18c3f056`;
final untracked content-manifest hash
`4fe0598665313d1bc74c459a03f2e1e898689fa7b515c31e8e3688d402d82d79`.
Content-manifest means SHA256 of `git ls-files --others --exclude-standard -z`
file-by-file SHA256 output. Both staged diffs remained empty, SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
No HEAD moved. Preserve this WIP; do not copy it as a stable authority artifact.

Current PM guide is **OWNER_APPROVED_DESIGN_R2**, header line10 in its own
`upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`.
SHA256 `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945`.
Latest PM journal§58.64, lines76246–76263, explicitly records source-only worker
recovery with six prepared PostgreSQL tests **NOT_RUN**, absent actual current
workload authority provider, native integration/export and whole campaign.
PM15/16 remain IN_PROGRESS; this is not a mounted cross-system revoke protocol.
Final PM journal hash
`743a79462f9f861a0b73411f77a7de056b1a13aee6dc0e5a1ab8c5b5781c621e`.
Final Edge journal hash
`2df6d9e0ffa86fe819ef7a9cdd4065a18ac9575c94ed787e3683c745ca05d435`.

## 2. Numeric limits: production decisions still separate

Source locators are relative to the Edge worktree above:

| Locator | Verified source/evidence meaning | Not established |
| --- | --- | --- |
| `upgrade/evidence/execution-edge-v1_2/EPG10-01/measurement-plan.json`, `budgets[]` | All14 production groups retain `approval_ref:null`, baseline/bounds null; B-TS CPU/RAM/DB/IO, TRADE, RS, FRESH, REVOKE, RECOVERY, CMD, HISTORY, DL, EDGE, ANALYTICS | No production CPU/RSS/query/latency/freshness/storage/recompute envelope can be inferred from test caps |
| Same file, `paired_protocol`/`workloads` | B0 TS+DL baseline, B1 minimal producer+projection, B2 dashboards/history/analytics; pinned6000/9000 canonical TRADE/s,600s×2; exact common source/config/coverage/cache/clock populations | No fresh paired B0/B1/B2 evidence; historical P184/B16 results are not Portal capacity |
| `EPG10-06/resource-profile.json` | `TEST_ONLY_ISOLATED_SAFETY_TRIPWIRES_NOT_PRODUCTION_APPROVAL`, `capacity_acceptance:false`, runtime activation false | Not approved runtime defaults or process RSS measurement |
| `EPG10-06/verification.json`, formal families |317 isolated tests: T06-10 PASS_ISOLATED, seven PARTIAL, two NOT_RUN, full06 NOT_MET | No TS/DL/Research coexistence, actual source amplification, production SLO or all-replica enforcement |

06 isolated envelope: active3, foreground reserve1;8192 logical entries with2048
reserved;128MiB logical bytes with40MiB reserved; pool3; no wait queue; storage
sample age60s. Cache/control test envelope is separate: active2/reserved1,
4096entries/reserved1024,64MiB/reserved8MiB,pool2. These are conservative logical
reservations, not heap/RSS. Synthetic disk100/200/300byte soft/high/hard values
are explicitly test observations, **never disk settings**. Missing/future/stale
storage observations deny fact writes; high pauses background; hard refuses
all new fact writes without ACK. No automatic history deletion is installed.

01 historical narrow retained test measured7-row/1h history reads and11,184,215B
snapshot serialization. Its proposed5ms history p95 /10ms p99 and2500ms
instrumented snapshot tripwires are **proposals for that one test target**,
not universal Manager/API SLOs. Configured host container maxima are not reserve.
Native P184 G2 remains per-feed p95≤500ms, trade max<1500ms and quote/mark
max<1000ms, only for its exact population; do not relabel as Portal API latency.

The current foreign HK measurement window is **claude-burst-b16-a1parity until
2026-10-16T13:48:52Z**, recorded in both Edge§23.17 and PM§58.64. It was read
from journals, not acquired/modified directly. No HK workloads were started.
Do not assume its future expiry reserves a new window.

## 3. Placement, writer fencing, retention and recovery

`EPG10-06/RESOURCE_ENVELOPE_AND_HOT_PATH.md` explicitly retains the existing
topology: minimal source export/admission near TS; Research-side projection,
history, query/fanout and heavy score/regime/Archive compute. It adds no service,
scheduler, accepting policy adapter, storage sampler or runtime binding.
One shared process-local `ResourceEnvelope` is opt-in for governed04/05 PG/cache/
hub paths; legacy constructors/allManagerAPIs/otherreplicas are not covered.
Class reserves prioritize committed delta/control over background work, not
Live-trading authority. Pool/cgroup limits do not isolate shared I/O/WAL.

Concrete existing source, Rust-root relative:

- `crates/projection-store-pg/src/manager_projection.rs:341–563`: database-clock
  persisted per-workspace/profile lease, exact UUID/owner/epoch/fencing token,
  expiry takeover increments fence, exact renewal/release, commit checks.
- `crates/projection-store-pg/src/bootstrap.rs:163–218,316,384,455,687–725`:
  fence in **same transaction** as data/checkpoint, new generation fences old
  writer; explicit retention/source-loss reset. These are local durable fences,
  not proof that TS stale publishers are fenced.
- `crates/manager-projection/src/lib.rs:32–34,79–199,283–362`:13 existing feeds,
  transactional/account-state/metadata cadence classes; per-feed actual clocks;
  caps20,000records/100pages per feed. These construction bounds are not fresh
  source availability or total-history caps. Unexhausted/incomplete input must
  not become COMPLETE.
- `EPG10-01/PLACEMENT_AND_QUERY_INVENTORY.md:46–58` records historical settings:
  HK Manager admission8r/s,8concurrent,750ms cache,7s lease,60s worker cadence;
  SGP15r/s,64concurrent,15s localprojection,120s lease,300s stale ceiling,
  journal86400s/10,000entries. This task did not reobserve effective runtime;
  do not call them current v2 approved cadence/horizon budgets.

Future runtime ownership must name the one ingest authority and exact DB/pool,
partition lease, checkpoint/restore epoch and resnapshot floor. Restore cannot
reactivate old grants/generation/cursors. Retention floor may advance without
all ACKs: behind-floor consumer resnapshots; transport retention is separate
from immutable economic/audit history. No unlimited/ACK-pinned history promise.
Placement/lease/DR design can use these mechanisms; deployment ownership and
numeric retention/outage objectives remain unqualified.

## 4. New source movement does not close inherited dependencies

EPG10-03 publisher fence/complete source publication remains missing in the
same producer packet. EPG10-08 is now **actively implementing/qualifying**, no
longer merely unassigned: Edge§23.17 lines12572–12715, first candidate11:30UTC
had250 library PASS and Edge binary38PASS/4fixtureFAIL; fixture-only fixes and
new cases require final immutable rerun. No final08 acceptance observed.

08 journal11:22UTC and `EPG10-08/tls-observations.json` report all6 TS-owned
Manager facade/issuer loaded leafs expired2026-09-27T03:40:51Z and shared Manager
client leaf expired; SourceProxy frontend TLS1.3 narrow handshake verified.
That limited frontend result does not qualify Manager upstream transport/current
identity or TS commit authority. Exact renewal/reload proposal belongs to the
existing08 owner-return; no unsolicited credential/PKI change here.

EPG10-09 has only frozen plan at journal10181–10186; no execution§23.18 or
09receipt directory was observed. Source runtime images/schema/effectiveconfig,
current grants, cross-host clocks/source lag, production source calls, B0/B1/B2
and backend→browser delivery remain **NOT_OBSERVED** by this audit. Other
journals' runtime tuples are reported history, not direct verification here.
Keep inherited ELP2-REQ-05-001/06-002/07-001 in their canonical packets; do not
open a duplicate generic “waiting TS” debt or treat these as a block on local
quality/budget/lease instrumentation and isolated tests.

## 5. Score P3 and calibrated configuration

Both local campaign and current Edge `upgrade/upgrade_v1.2/` retain FINAL Score
v1.1. §12P3 lines1052–1058 and§13.2 lines1072–1082 require approved horizon
anchors, stress delta, observation/block/maturity/freshness policy and temporal
calibration artifact; Regime support thresholds have separate calibration.
Source search in `upgrade/` found specification and feasibility review, **no
approved calibration artifact supplied by these packets**. Feasibility§3/§5
explicitly says runtime policy remains pending. This is evidence of missing
input in inspected scope, not a claim that no private artifact exists anywhere.
Formula/weights/bands remain approved; do not ask to choose formula again.
No fixture constants become runtime defaults or empirical certification.
Affected metrics stay `policy_pending`; unrelated absolute economic/capital
reads and qualified direct NAV calculations are not globally disabled.

## 6. Reproduction hashes / verdict / cleanup

| Edge-relative public source/evidence | SHA256 |
| --- | --- |
| `EPG10-01/measurement-plan.json` under evidence root | `aaa1c7d023bd5a36f9a5a219b958c7ea88be67dea332b3a674ff6073ee9a17a1` |
| `EPG10-06/resource-profile.json` | `a148533861168c268c469321727c526b54ca219ea24773ab8e087ee6d2a9d7bd` |
| `EPG10-06/isolated-target.json` | `2fd7e45a526c7f7a37034c254ee8df5a0bebe28d134553ca773ac08166c41418` |
| `EPG10-06/qualification.json` | `8f9655670566de0b1587f5cc757818fb27f4a13c3ab9889f9e10e588ef999c2d` |
| `EPG10-06/verification.json` | `314fd5514c34e31d5aceaee1bd6a90d1424fd4e1e3a90f5a0867e07dfa22d910` |
| `EPG10-08/tls-observations.json` (WIP) | `d018a688fd2956803a0e8db8aa7d2410d462429974a2b30ba7bd8b02f7179996` |
| `services/portal-execution-edge-rs/crates/projection-core/src/resources.rs` | `c8da1cc9cb91c43efa768ec555965b1b843ece484118e1a59c77dd9b7692fbdf` |
| `…/projection-store-pg/src/manager_projection.rs` | `86cee62ac4bb4d3e944a573fc3f6eb3063bf206de3f7451c554aa4508af92e9a` |
| `…/manager-projection/src/lib.rs` | `d4f0c053a539fae8090ea69388a17b400c5daa7510ab7bd596d51b4cd1b505b7` |
| `…/projection-store-pg/src/bootstrap.rs` | `9c14fc9074715c7f157d8cb5f51a54e71801737408baa7eba8eec56b6723afe4` |
| `…/projection-store-pg/src/scoped_read.rs` | `32aa5b8073ad988b038e136b2c069782a51edb2c70ef6845a98ffce0734ebeaa` |
| `upgrade/upgrade_v1.2/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` | `d77a05fc0c6b481114c0d4055a2ff0c09f6b7a3cc0ca1447f691d92f139adbad` |

Evidence root in table: `upgrade/evidence/execution-edge-v1_2/`.
**SOURCE_CONFIRMED:** pins/WIP, finite source controls, actual budget nulls,
source lease/cadence/retention mechanisms and current dependency disposition.
**HISTORICAL_EVIDENCE:** named source qualification/observations only, no extra
tests earned. **RUNTIME_VERIFIED: none.** Tests/build/load executed:none;
resources created:none; cleanup **NO_ACTION_NEEDED**. Resource consumption of
SSH source reads NOT_MEASURED; no capacity claim. Rollback removes this additive
document only, never peer work/facts/grants/checkpoints. Primary owns10local
implementation/measurements and final gate verdict; nextphase needs assignment.
