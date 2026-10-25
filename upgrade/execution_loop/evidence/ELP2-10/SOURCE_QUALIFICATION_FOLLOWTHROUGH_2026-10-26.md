# ELP2-10 source qualification follow-through — 26 Oct 2026 (Asia/Saigon)

## Entry / scope / task map

Bobby: finish the remaining financial/economic/health, metadata,
calendar/Edge notice and actual connected/browser gates. Continue in the
approved candidate; do not overwrite Claude WIP or call fixtures real sources.
No push, stable/dev/main/provider28445/command SUBMIT/Live change.

Core `/home/bobby/portal-backend-residuals-20261025`, branch
`chore/backend-residuals-20261025`, entry
`0fb83bf2121c88c094ca05d592d49dc3722883aa`, clean. Canonical
`685bc1915db51c7869254c1fdfa68991d7e4aae4` and Claude
`00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` clean, unchanged. Edge peer
`8727e5303b1815d54bc2bdcb927a55457ff4da5b`; existing WIP preserved.

Delegation follows campaign §8. Initial reviews are read-only and independent;
no helper may run a heavy gate, edit shared code/contracts/docs, create a
worktree, commit, install, mutate a remote or handle secret values. Primary is
sole integrator, migration/contract/tracker writer and resource scheduler.

| Task | Owner / allowed work | Required return / acceptance |
| --- | --- | --- |
| Financial/economic source qualification | Independent source reviewer; read Core candidate, PM owning source/owner receipts and Edge contracts/source read-only | Exact implementation missing vs source input, no guessed identity/ownership; concrete non-duplicate patch or commissioning plan with source pins |
| Metadata + calendar/notices source coverage | Independent source reviewer; read Core and exact Edge candidate/catalogue read-only | Original grain/field policy mapping, actual supported operations, unmounted vs missing; disjoint Core implementation proposed if justified |
| Provider/trust/finite/SSE/browser readiness | Primary | Inspect current commissioning configuration/receipts safely; prepare or execute only in the already approved isolated Research scope; no credential values in output |

Validation: focused pure tests/build for changed modules; real disposable PG
only if persistence changes. One heavy command at a time under the approved
cell budget; reuse unaffected receipts. Source/image/config/schema pins and
original principal are required for connected credit. Browser read-only only,
without changing accepted components or recording visual baselines.

Exit/rollback: each completed implementation committed with tests and handoff;
no phase COMPLETE without mandatory source/connected/consumer evidence.
Candidate-only changes can remain unselected; preserve all originals, grants,
custody, receipts and audit. Any missing owner input gets an exact owner/action,
not a fabricated qualified value. Results and next actions are appended below.

## 1. Concrete Core gap repaired — explicit financial owner context

The prior manifest prepared the exact actor, but bootstrap dropped it. Normal
AppModule only started the financial listeners, and production code had no
`FinancialSourceComposition.withPrincipal` caller. Edge financial runtime
requires `original_context`; loading these manifests alone could not supply it.

`prepareFinancialSourceApplication` now returns `owner.withOwnerContext(use,
{deadline_ms,signal?})` for an explicit private operator composition. It is not
a public endpoint or onModuleInit action. Constructing or starting the ordinary
app still issues no identity/context, session, grant, source request or lease.

- Capture one detached preparation **before** schema awaits: original actor,
  schema/scope/source pins, paths, TLS bytes/peer, recovery and listener targets.
  Key handles remain immutable; loader and temporary PEM bytes are erased after
  independent transport/recovery copies are owned. Independent review found
  the partial snapshot race; the complete snapshot and deferred-schema
  mutation regression resolve it.
- In the same existing bounded pool, a short READ COMMITTED transaction calls
  `lockCurrentHumanSnapshot` and refuses an active global drain. COMMIT/client
  release completes before the private callback can export a context or do
  network/source work. Caller cannot replace the configured actor.
- Actual registration expiry is returned separately from the earlier operation
  deadline. Bound by explicit duration, session expiry, installation expiry and
  registration expiry; monotonic time prevents UTC rollback from extending the
  duration. One operation at a time; no hidden retry or waiting queue.
- Abort retires **context admission only**, immediately. The callback/ISSUE
  promise remains owned until truly settled. The reverse listener stays alive
  for the original terminal/recovery. No Promise.race pretending a worker has
  stopped, no SQL retirement, ACK, replacement attempt or pool disposal.
- A private owner callback must export/remove its own protected reference and
  join its worker. Its failure cannot leak paths/credentials through the new
  error boundary. Genuine typed authority/source errors remain typed.

This closes a Core orchestration gap, **not** financial-purpose proof,
selected-producer economics, COMMIT/APPLIED/source ACK or installed acceptance.
An exported context is identity orchestration, not a READ/STREAM grant.

## 2. Repinned sources — precise missing work, not duplicate stubs

All Edge Rust paths below are under
`services/portal-execution-edge-rs/crates/` in owned Edge
`86178d694abf156453cdf450553fa80bdd9becab`. Primary independently reread the
CURRENT-only router, global observation payload and PM owning economic return
after the two read-only reviews. No remote code/DB/runtime/credential changed.

| Lane | Existing source / exact remaining action through Edge coordinator |
| --- | --- |
| Financial publication | Existing Edge `financial_runtime.rs` and financial-purpose trust; PM checked-authority receiver plus durable ACK are implemented. Need actual original/receiver/transaction group, financial-purpose issuer/acceptance refs and source ACK registration. Core's new explicit owner operation supplies the missing live-context call path once installed; it never substitutes those proofs. Reuse TEST_ONLY chain only for unchanged protocol coverage. |
| Economic NET_PNL | PM `upgrade/PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md` at peer6f474c720 is still `WIRE_MAPPING_OPEN`. Accepted source_id/leaves duplicate/conflict/overlap rules exist, but no accepted `economic_account_ref`/`ownership_partition_ref` wire mapping. Edge obtains the selected producer namespace/census/cut/ownership/cost/revision/provenance. Do not alias account, deployment or portfolio IDs. Existing Core dataset AND series runtime stays ready for that mapping. |
| Operations health | Core migration154, bounded immutable writer and filtered queue integration already exist. Need owning operation→target/workflow delivery/display observations, authenticated source hold through COMMIT, explicit retained-receipt budget/retirement. Queue SUCCEEDED is not financial APPLIED or venue success. Do not create a second writer or infer health from fixture status. |
| Remaining metadata | Manager feeds contain account policies/reservations, deployments/allocations/risk plus orders/fills/positions (`manager-projection/src/lib.rs:129–208`). Candidate policy columns exist in `contracts/maximum-data-return-v1/COLUMN_SEMANTICS_CATALOG.csv:61–78`, but E2_REQUIRED is not selected/permitted source authority. Need reviewed exact-grain selection+field policy/publication revision. Credential identifiers are SECRET_MATERIAL_METADATA_ONLY, not ordinary account metadata. Periodic feed excludes session history; runtime rows do not replace it. |
| Venue calendar | Blueprint `missing-capability-adapter/src/lib.rs:477` and normalizer648–708 exist for CURRENT_SESSION_RULES, max8rows/262144bytes. No executable authenticated source transport invokes the blueprint; current source map says SOURCE_DOES_NOT_CURRENTLY_EXIST, N28 registry SOURCE_DARK. Edge must commission the operation with real source revision/as-of and original-human policy/custody before Core's existing BFF source seam can be installed. No DL bypass, fetch-clock alias or holiday invention. |
| Edge notices | **Durable Manager cycle journal EXISTS**, not wholly missing: migration0014 and `projection-store-pg/src/realtime.rs:89,130,195` expose authority/epoch bounds/bounded complete-cycle records. Missing is the original-human Manager scoped STREAM/replay adapter. Owned `manager_current_source.rs:355–362` is explicitly CURRENT-only; generic `scoped_read.rs:987–999` reads bootstrap groups instead. Legacy delegated workspace realtime is not an authority substitute. |

Manager cycle observation (`manager_projection.rs:1577–1614`) carries global
fact_count/state_digest/source_input_digest, not affected-entity membership.
Narrow notices must prove the affected authorized slice from durable cycle
membership, or remain unavailable. An explicitly qualified whole-profile
authority may use a coalesced notification-only hint without global payload.
Do not emit every global cycle to narrow users. Reuse existing store/hub/opaque
cursor/per-frame fences; no second DB, journal or per-browser poller. Portal's
`mf1.` Fleet revision cursor remains different lineage, never relabelled Edge.
STREAM/HISTORY/REPLAY require separate rights; CURRENT never supplies them.

| Reviewed public file | SHA256 |
| --- | --- |
| Edge `edge-service/src/manager_current_source.rs` | `c7eebe03d03d495b48071fc789d99105c9a722eae45d8fed22c1a61d903517ea` |
| Edge `projection-store-pg/src/realtime.rs` | `6712425dc8de575b3d48c862200d9d13fa31292541ea86c61bf75d19b78ddab7` |
| Edge migration0014 | `4da8c1c937394e8e553f093cba3096548981165dc1c6012c67bdb7805a8f0680` |
| Edge `realtime-sse/src/scoped.rs` | `348d5fc61a5a53ff704104c0a1953ed6566284c8fccc106c171402845bd6e127` |
| Edge `projection-store-pg/src/scoped_read.rs` | `c67cb927591ca186f0991b37f8b9595546ee21376ab43eaab981763aab9b1390` |

## 3. Tests / resource disposition

Tier R1; no landing/push. Gate selector chose BE-PURE; add a real disposable PG
lane because the new preflight takes authority/session locks. One primary-owned
heavy job at a time. No full hook merely to record an intermediate source slice
(campaign§10.10c); old integration R2/visual remains RED separately.

- Focused5specs: initial **144/146**,16.23s. One new assertion compared a Buffer
  with structuredClone's Uint8Array, not changed bytes/pins; corrected both
  expected snapshots. One real loopback-TLS test was sandbox-denied.
- Exact retake: **3PASS**,11.58s,51unselected. Includes both existing TLS start
  variants and the one snapshot regression. Compatible union **146 unique
  cases PASS**, not149 or a single146/146 run. Unit host Node20.20.2; no source
  DB, financial originals or actual Edge transport in these unit fixtures.
- Both full pinned Node22 runner attempts stopped in production compile before
  SQL tests: V8 auto heap ceiling~640MiB, then explicit1024MiB, both exit134.
  Container total remained2CPU/1536MiB/300s; no third full-compile retry or budget
  increase. Split the lanes: production-source host tsc completed exit0 with
  heap3072MiB; focused real-PG correctness completed separately below. This is
  **not** an official full build/restore runner PASS or a pinned-Node22 tsc PASS.
- Focused pinned Node22/PG16: **14/14 PASS**,27.01s (SQL tests11.93s), exit0.
  Five new cases cover a real current session/transaction released before
  callback, actual REVOKED/EXPIRED sessions, actual shared-authority drain,
  and real original ISSUE followed by typed lost worker response. The latter
  retains exactly the same unresolved lease, no fabricated terminal/ACK/retry.
  Existing nine cross-workload COMMIT/ROLLBACK/UNKNOWN/recovery regressions
  remain green. New context-port doubles are TEST_ONLY, not genuine PM proof.
- Local focused-runner setup failures were also retained: nested mountpoint,
  PostgreSQL init Unix-socket/restart race (two attempts), then Vite config
  cache on read-only dependencies. Final runner waits for the actual TCP
  server, uses the supported runner config loader/no cache, and leaves source
  and dependencies read-only. No test, gate assertion or source fence changed.
- Baseline control uses the exact original bootstrap blob
  `47f56b63f9964c57bef4b2a48d1fc315bf5ba34c`: unchanged absent-profile case
  **PASS**, new detached-trust regression **FAIL** at the changed selection,
  15unselected. The same regression passes on the new source. Both temporary
  control files removed after the check; no control failure hidden as a flake.
- `refresh-release-integrity-ledgers.sh --check`, diff checks and production
  tsc PASS. Tracking validation and final docs disposition are recorded at
  closeout below. No public schema/type/fixture change calls for regeneration.

| Evidence retained locally | SHA256 |
| --- | --- |
| `/tmp/elp210-financial-owner-20261026.json` | `511e1042b958c07086cd23ad29cd88271e4da26c66f85b7b4681e17ea0bc1064` |
| `/tmp/elp210-financial-owner-retake-20261026.json` | `9101f6ffbe6cf62e4ea76d05c8dcbd5481b030009edab6407216c6d201579ca6` |
| `~/.local/state/portal-backend-residuals/20261026/financial-owner/pg-build-restore.log` | `1985ef6883a5bf179202bdaa6c0d4c69a4532d5d35e91f150ff32f240946d4fb` |
| Same directory `pg-build-restore-retake.log` | `df615c2fedd82094cd626cead22089bb4d205340d5d8cef57a8ab83cfd30d662` |
| Same directory `run-bounded-pg.sh` | `d36dcee9a56eb6287a9b5db20f77ad4025d31e36ad4b83640bd28d4a08972a81` |
| Same directory `focused-pg-runner.log` — final14/14 | `ab5fd2e7ba7b428aac688c0c768fd6fcf5cd6f206d693d32a95a8028708bf34a` |
| Same directory `run-focused-pg.sh` | `df90ddb56d98ca4c01765931f8773a8259254426c8d8c696c39108d419f62e6c` |
| `/tmp/elp210-financial-owner-baseline-control-20261026.json` | `2c082d02bb32c34a571e4030f8dac5d285843ee33a8fb1b3731299f8ab348b9e` |

The first wrapper only changed resource flags around the tracked repo runner;
that runner reached neither tests nor restore. The final **separate** focused
wrapper ran exact tracked SQL tests/migrations, not production compile or
restore. Do not convert those distinct outcomes into one full-runner receipt.
No gate assertion, source identity or production budget is relaxed. Node cell
1.5CPU/1280MiB and PG0.5CPU/256MiB, swap==RAM, both OOMKilled=false. Limits
are not measured production RSS or a load budget. No leftover own container/
network after trap cleanup; only fresh mktemp staging was removed, while all
test logs and original source/custody remain preserved.

## 4. Runtime / Claude handoff / exit / next

Actual read-only installed identity remains Core
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`,
web `sha256:0653eece6e611c99e7f7fbb4bf38068ddf97ac8ddd05834a918fbe76c899c5b3`,
both healthy. These are **older installed bytes**, not this candidate. No new
image/schema/config/listener/source installation or connected acceptance here.
The24Oct native trust has expired; do not arm it or reuse an expired window.
Source originals, actual grants/trust and financial/economic source mapping
remain required. Earlier denied source-bundle transfer was not retried.

**Claude ACT_NOW:** no public DTO, enum, fixture, component, layout or baseline
change in this slice. Keep the existing calendar/Facts, health and metadata
readers, rich fixture lanes and independent consumer ACK. Do not draw Manager
global notices for a narrow scope or call local Fleet revision notices Edge
data. Once each exact source is qualified, capture its real response through
the unchanged boundary then inspect that lane in browser. No positive source
or browser ACK is asserted by Core tests or an HTTP200 on old preview bytes.

**Backend next in the same assigned phases:** install the source-compatible
candidate only when original-principal policy, source/financial-purpose trust
and binding actually match; financial owner callback keeps protected reference
and worker join explicit. Edge is the sole coordinator for PM/TS inputs in§2.
No new phase is inferred. ELP2-05/06/07/09/10 source/runtime exits remain OPEN;
existing ELP2-11 preparation is preserved, not final acceptance. Numeric
budget/calibration and matched coexistence/G2 remain separate approved inputs,
not this bounded correctness cell.

Rollback: leave optional owner API uninvoked/unmounted; no source/data/grant
rewrite needed. Never delete original identities, leases, audit, custody or
receipts. No source-code upload, remote push, shared-preview, stable/dev/main,
provider28445, command SUBMIT/Live or frontend change. Two existing helpers
reused, no new helper spawned; independent review ACCEPT after the snapshot
finding was fixed, not official Edge or Claude acceptance.

## 5. Source delivery / next acceptance

Code `4ecaa23c418c567205c681dd8d0853af50254aed`, tree
`f5d3d48cf51806aa61828135cb5893a5abea8689`: **7code/test files,+592/−22**.
Verification R1 under campaign§10.10c, explicit owned paths only. No frontend,
OpenAPI/generated contract, migration or deployment change. Full integration
R2/visual remains RED/pending from the separate integration candidate; this
focused success does not authorize ff-landing or overwrite Claude's checkout.
Machine-readable [test disposition](source-qualification-followthrough-2026-10-26.test-results.json).

**Edge coordinator action, independently deliverable:** register the exact
selected producer financial-purpose trust/originals and NET_PNL wire mapping;
commission the authenticated current-calendar transport; map Manager committed
cycles into separately authorized scoped notice STREAM/replay with affected
membership proof. Supply source SHA/config/schema/original-principal and
expiry pins for each READY lane, not a global BLOCKED flag. No request to mint
replacement attempts, reuse expired native24Oct trust, copy stable rights,
upload the previously denied source bundle or bypass Edge to TS/PM/DL.

**Core next:** consume those actual qualified bindings through the already
implemented financial/BFF seams, then measure affected finite/cache/cursor/
SSE/revoke/restart/recovery lanes on the installed candidate. For health/detail,
require owning operation observations and exact source field policy first.
Only then request Claude's unchanged component/browser acceptance on real
responses. Calendar stays SOURCE_DARK today. No new frontend work is blocked
on this private additive owner API; fixture acceptance may continue in parallel.

Closeout checks: execution tracking PASS; five newly introduced relative links
resolve, machine-readable JSON parses, diff checks PASS. Canonical and Claude
SHAs remain exactly the entry pins and both checkouts are clean. R0 documentation
commit records only this primary's six explicit packet/tracker paths; no full
build rerun for Markdown, no remote source installation implied.
