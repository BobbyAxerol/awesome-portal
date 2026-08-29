# Backend Architecture Deep Dives

Các tài liệu trong thư mục này triển khai chi tiết từng `BAR-*` slice của
[Backend Architecture Implementation Guide](../BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md).
Chúng không thay thế phase hoặc exit gate trong
[Unified Implementation Plan](../UNIFIED_IMPLEMENTATION_PLAN.md).

## Active deep dives

- [Official Trading System owner request — Portal Execution capability campaign](./TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md)
  — **the only active document to send to the Trading System owner.** It
  consolidates N02/N03 incremental source, N06 evidence, all 24 N11 reads, all
  nine N12 commands, N15 Event/Artifact authority and the N13–N17 operational
  evidence ladder. Older D4, Claude, N11 and N12 request prose is audit or a
  machine annex and must not be sent separately.
- [Execution Loop backend unified plan](../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md)
  now splits every remaining N13–N17 phase into `A` (Portal-owned,
  source-dark, can continue immediately) and `B` (owner artifacts or real
  runtime required). A completion never implies B activation.

- [EX-BE-02B — Manager-v2 Multi-profile Read Readiness](./EX_BE_02B_MANAGER_V2_MULTI_PROFILE_READ.md)
  — **Implemented / private read-ready:** the sealed Manager-v2 backend path
  is now deployment-bound for Paper, Sandbox and Live. Each profile requires
  the same exact profile identifier in the Edge configuration, delegated
  assertion, owner facade and Source Proxy upstream overlay; the Proxy can
  alter only its dedicated loopback facade/issuer ports from the frozen
  five-GET template. It remains a bounded catalogue read plane, not direct
  DB/SQL, commands, broker/Event traffic or a browser/UI route. Historical
  Paper remains active; Sandbox/Live profile deployments are prepared without
  auto-starting them, and Live currently returns no canonical rows until
  Trading System produces them.

- [EX-BE-02A — Manager-v2 Edge Read-through API](./EX_BE_02A_MANAGER_V2_EDGE_READTHROUGH_API.md)
  — **Backend complete / private Paper runtime qualified:** the existing
  private Rust Edge has four resource-scoped Manager-v2 Paper read-through
  routes. The approved SGP signer/mTLS identity qualified all four over HTTP/2
  with exact no-JWT and wrong-resource denials; only one AWS Edge was replaced.
  The one-shot signer candidate was removed afterward; Source Proxy, Trading
  System and all V1/D4/command/event/SSE paths remain untouched and dark.

- [EX-BE-02 — Manager-v2 Backend Consumer](./EX_BE_02_MANAGER_V2_BACKEND_CONSUMER.md)
  — **Complete / backend only / no runtime activation:** separate sealed Rust
  contract/client crates consume exactly the already-qualified five Manager-v2
  Paper GET routes with workload mTLS. No Edge route, browser/UI, cache,
  projection, database write, poller or runtime activation is in scope.

- [EX-BE-02 — Manager-v2 Paper Read Route and Owner Handoff](./EX_BE_02_MANAGER_V2_PAPER_READ_HANDOFF.md)
  — **Complete / private Paper route qualified / no product consumer:**
  byte-locked owner contract/publication import, five exact Source Proxy
  routes backed by mTLS and a short-lived certificate-bound JWT issuer, and
  real private route/fault/rollback qualification are complete. It neither
  modifies D4/V1 nor enables Edge ingestion/query/SSE/commands, a database
  client, projection/UI consumer or Sandbox/Canary/Live authority.

- [BAR-01 — Feature/Screen/Concern Registry & Command Center Summary Contract](./BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md)
  — contract backend cho U02/U03. **Backend contract complete (BE1–BE6):**
  registry + API, hai read-only summary adapter, deadline-aware aggregator,
  public summary endpoint và frontend handoff (OpenAPI + fixtures + state
  semantics). Frontend agent bắt đầu từ
  `apps/portal/registry/FRONTEND_HANDOFF.md`. Không tạo
  database/service authority mới.
- [BAR-02 — Compatibility Boundaries and Parity Freeze](./BAR_02_COMPATIBILITY_BOUNDARIES_AND_PARITY_FREEZE.md)
  — parity freeze cho U04/U05. **Complete (BE1–BE3):** snapshot OpenAPI
  Portal/Planning + run-request schema với digest manifest
  (`upgrade/backend/bar02/snapshots/`), additive artifact provenance
  (`artifact_schema_version` + `producer` trên mọi Portal-written artifact),
  cross-link sidecar `portal.links.v1` + `GET /api/v1/portal/links` với
  integrity block. Services vẫn private, protected hash và Planning state
  không đổi.
- [BAR-03 — Operational Ingress Boundary](./BAR_03_OPERATIONAL_INGRESS_BOUNDARY.md)
  — U06 backend slice. **Complete:** `X-Request-ID`/W3C `traceparent`
  correlation qua ASGI middleware + nginx `$request_id`, `/api/diagnostics`
  dependency states an toàn, SSE unbuffered (backend headers + nginx
  location), request_id trong mọi error envelope, redaction tests cho
  health/ready/diagnostics/error.
- [BAR-04 — Thin Identity BFF](./BAR_04_THIN_IDENTITY_BFF.md)
  — U07 slice Control API đầu tiên. **Complete:** `apps/control-api/`
  (NestJS/Fastify) với 6 bảng identity PostgreSQL (ADR-003: node-pg-migrate +
  typed `pg`, không ORM), Cloudflare JWT/JWKS verify + rotation, Argon2id +
  blocklist policy, activation credentials dùng một lần, opaque sessions
  `__Host-portal_session` + CSRF/origin, throttling/lockout, RBAC ADMIN guard,
  HMAC-signed internal principal, bootstrap CLI idempotent (bobby/stan/
  thanhvuong, secret sinh runtime không commit) và full security matrix (24
  tests trên PostgreSQL thật). BFF chưa wire vào gateway (U10), không có
  run/data/alpha authority.
- [BAR-05 — Reproducibility Freeze](./BAR_05_REPRODUCIBILITY_FREEZE.md)
  — U08 M0 slice. **Complete:** digest manifest
  (`upgrade/backend/bar05/m0-freeze-manifest.json`, 27 files: protected
  kernel, pins, OpenAPI, golden fixtures, config, control-api/frontend
  lockfiles), credential-free environment report, Planning export có
  `counts` + `content_hash`, `scripts/verify-m0-golden.sh` gate (27 tests).
- [BAR-06 — Shared Contract Authority](./BAR_06_SHARED_CONTRACT_AUTHORITY.md)
  — U09 foundation. **Complete:** `packages/contracts/` canonical schemas
  (opaque IDs/UTC timestamps/decimals/RFC 7807 problem/command envelope với
  idempotency + optimistic concurrency/§6.7 event envelope), cross-language
  fixture compilation (Python jsonschema + TS ajv), generated
  `portal-api.d.ts` từ frozen OpenAPI (sync gate), `contracts-snapshot.json`
  breaking-change gate, Python canonical models, ADR-001/002/005 (Proposed
  cho owner confirm).
- [BAR-07 — Control API Façade](./BAR_07_CONTROL_API_FACADE.md)
  — U10 vertical slices đầu tiên. **Complete:** workspaces/memberships, run
  read models, product audit + transactional outbox, ADMIN-first
  authenticated proxy tới portal-api với signed `X-Portal-Principal` +
  freshness passthrough, write idempotent (replay/conflict 409, không
  double-fire upstream), RBAC cross-workspace fail-closed, feature flag
  rollback `FEATURE_PROXY_PORTAL`. 31 control-api tests trên PostgreSQL
  thật.
- [BAR-08 — Durable Quant Worker & Immutable Artifacts](./BAR_08_DURABLE_QUANT_WORKER_AND_IMMUTABLE_ARTIFACTS.md)
  — U11 authority. **Complete:** tách `run` immutable khỏi `run_attempt`
  (history append-only, retry tạo attempt mới), claim-lease/heartbeat +
  standardized failure codes, content-addressed bundles (temp → checksums →
  manifest v2.0.0 → blobs sha256, tamper detection, reconcile, legacy
  import), NATS JetStream + MinIO + `quant-worker-py` trong Compose, broker
  port in-memory/NATS, 9 tests + smoke end-to-end (chạy three-window thật,
  bundle 17 files, redelivery không duplicate). ADR-004/006 Proposed.
- [BAR-09 — Engine Capability Authority](./BAR_09_ENGINE_CAPABILITY_AUTHORITY.md)
  — U12 authority. **Complete:** manifest `engine-capabilities.v1` pin
  `quantbt-engine==1.0.8` (installer-independent canonical dist-info RECORD
  sha256) + 2 certified
  capabilities, loader fail-closed lúc startup, inspector verify installed
  wheel, capability preflight trong mọi run/preflight (protocol/data
  class/optuna trials/parameter space), reject unadvertised/uncertified dù
  request hợp lệ, gate: synthetic capability thêm bằng manifest-only không
  cần sửa code, endpoint read-only `/api/v1/portal/capabilities`. 12 tests.
- [BAR-10 — Data Catalog & Immutable Snapshots](./BAR_10_DATA_CATALOG_AND_IMMUTABLE_SNAPSHOTS.md)
  — U13 authority. **Complete:** catalog `data-catalog.v1` (11 families:
  candle/matrix/metrics/orderbook, quality profile, release-manifest
  provenance; không family nào activated tới khi digest manifest thật được
  xác nhận), loader fail-closed, `SnapshotStore` digest-addressed immutable
  (register → quality block → open-by-digest + tamper detection →
  repair-as-new-snapshot), query contract range/max_points + downsampling
  metadata, quality preflight cho historical run, 4 endpoint read-only
  `/api/v1/data/*`. 12 tests.
- [BAR-11 — Alpha Registry & Research Platform foundation](./BAR_11_ALPHA_REGISTRY_AND_RESEARCH_PLATFORM.md)
  — U14 foundation. **Complete:** registry `alphas.v1` với
  `delta-rsi-polynomial` v1.0.0 (artifact digest trùng protected strategy
  package, lifecycle RESEARCH, golden-parity certification), loader
  fail-closed, quarantine gate chặn mọi run/promotion khi quarantined,
  `verify_artifact` phát hiện digest drift, 3 endpoint read-only
  `/api/v1/alphas*` với public projection an toàn (không maintainer/lock
  digest). 12 tests.
- [BAR-12 — Approval, Promotion, Paper & Sandbox foundations](./BAR_12_APPROVAL_PROMOTION_PAPER_SANDBOX.md)
  — U15 foundations. **Complete:** ApprovalAuthority (policy v1, request
  gắn immutable artifact/audit digest, separation of duties chặn
  self-approval, gate matrix §10.5 đánh giá server-side, promotion state
  machine §10.4 + PAUSED/ROLLED_BACK/RETIRED), PaperLedger deterministic
  (chỉ lưu secret reference, replay từ fills, reconciliation phát hiện
  drift). 9 tests.
- [BAR-13 — Live Control & Operational Safety](./BAR_13_LIVE_CONTROL_AND_OPERATIONAL_SAFETY.md)
  — U16. **Complete:** signed/expiring/idempotent deployment intents, dual
  approval + step-up grant ngắn hạn, fail-closed UNKNOWN/STALE state,
  incident state machine audited + idempotent, break-glass audit. 7 tests.
- [BAR-14 — Rust fast paths: benchmark gate](./BAR_14_RUST_FAST_PATHS_GATE.md)
  — U17. **Complete:** benchmark harness (p50/p95/p99/bytes/RSS) + baseline
  p95 87.6 ms < 200 ms → **Rust NOT STARTED** (đúng gate §15.6). 3 tests.
- [BAR-15 — Planning/PostgreSQL cutover](./BAR_15_PLANNING_POSTGRES_CUTOVER.md)
  — U18. **Complete:** export legacy_id + checksum, import idempotent,
  reconcile exact, cutover state machine NOT_STARTED→ARCHIVED. 5 tests.
- [BAR-16 — Release, DR & hardening](./BAR_16_RELEASE_DR_HARDENING.md)
  — U19. **Complete:** release report credential-free (provenance digests,
  backup commands, DR checklist) + secret-hygiene scan. 4 tests.
- [EX-BE-04a — TypeScript Control-Plane Query Primitives](./EX_BE_04A_CONTROL_PLANE_QUERY_PRIMITIVES.md)
  — Execution Loop query foundation. **Foundation complete:** signed/expiring
  bidirectional keyset, canonical allowlisted filter/sort, immutable-ID
  tie-break, exact counts and public-column projection in one read-only
  repeatable-read PostgreSQL snapshot. Evidence: 14 focused tests over 182,000
  rows, Control API 76/76 and contracts 8/8. It deliberately did not create an
  Approval endpoint; `EX-BE-05a` below is the integration slice.
- [EX-BE-05a — Governance, Evidence, Approval Repository and API](./EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md)
  — Execution Loop phases 1–2. **Integration complete / production inactive:** TypeScript /
  PostgreSQL approval inbox, immutable evidence/findings/decisions, R1
  plan→apply→poll, SoD, idempotency, optimistic concurrency, audit/outbox and
  independent rotatable HMAC keyrings are implemented. Linked Research and
  Execution panels remain explicitly unavailable; registry profile remains
  `fixture`. Fresh PostgreSQL is green at 117/117 tests and the isolated
  public-gateway smoke proves password rotation, Inbox/R1, CSRF denial,
  canonical plan→apply→poll and exact 1:1:1 decision/audit/outbox atomicity.
  SGP runs in research mode with independent file-backed keyrings; closeout:
  [PRE-IAM-01 SGP Phase 1–2](./EX_BE_05A_SGP_PHASE_1_2_CLOSEOUT.md).
- [PRE-IAM-02 — Paper Exit Review Backend Closeout](./PRE_IAM_02_PAPER_EXIT_REVIEW_CLOSEOUT.md)
  — Execution Loop Phase 5 backend **integration complete / production
  inactive:** TypeScript/PostgreSQL owns immutable Paper Exit lineage, four
  source-attributed evidence panels, deterministic fail-closed evaluation and
  canonical read/plan/apply/poll. `PROMOTE` creates only a scoped Portal grant;
  it never activates Sandbox or calls Trading System. Evidence: fresh
  PostgreSQL 14 suites/129 tests, Paper Exit 12/12, contracts 20/20, migration
  `0004` and SGP public-gateway/auth runtime gate green. Registry/source/command
  profiles remain off; Claude's HTTP/eligibility mapping and later real-source
  activation remain explicit dependencies.
- [PRE-IAM-03 — Dark Command Center Snapshot Backend Closeout](./PRE_IAM_03_DARK_COMMAND_CENTER_SNAPSHOT_CLOSEOUT.md)
  — Execution Loop Phase 9 backend snapshot **integration complete / production
  inactive:** the TypeScript Control API composes bounded server-ranked
  governance, Fleet, user-pin and Today panels with per-source authority,
  freshness and exact-count semantics. Missing Execution incident/operation/
  Fleet sources remain unavailable rather than fake-empty; SSE/cursor identity
  and every delivery/source/command flag remain dark. Evidence: fresh
  PostgreSQL 15 suites/139 tests, Command Center 10/10, contracts 26/26 and a
  20,000-row response-budget gate. Claude's five-state mapping and later real
  source/SSE parity remain explicit dependencies.
- [PRE-IAM-04 — Offline Hardening Closeout](./PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md)
  — **integration complete / production inactive:** H-1–H-12 are closed with
  loss-detectable cursor/gap semantics, typed analytics errors, bounded exact
  Ledger/Funnel windows, six-fixture OpenAPI/Rust parity and executable
  restore/rollback evidence. Current evidence is contracts 32/32, fresh-PG
  Control API 139/139 and Rust/PostgreSQL 89/89.
- [PRE-IAM-05 — D2 Dark Preparation Closeout](./PRE_IAM_05_D2_DARK_PREPARATION_CLOSEOUT.md)
  — **integration complete / production inactive:** pinned Edge/Source Proxy
  images, non-root/read-only/resource-bounded manifests, identity/config
  preflight and config-preserving rollback are accepted offline. D2 is not
  authorized and no AWS/network/source/service/runtime state changed.
- [PRE-IAM-06 — Tracking Reconciliation Closeout](./PRE_IAM_06_TRACKING_RECONCILIATION_CLOSEOUT.md)
  — **integration complete / production inactive:** Master Plan, backend
  guide, shared tracker, frontend roadmap and canonical request ledger agree on
  owner/blocker/status. `execution-tracking-test.sh` prevents drift and keeps
  all eight unpublished `ops` routes externally owned and unreachable.
- [EX-BE-05b/F0 — Offline Operations Contract Foundation](./EX_BE_05B_F0_OFFLINE_OPERATIONS_FOUNDATION.md)
  — **foundation complete / production inactive:** generated 64-action
  catalogue revision 2 with ADMIN/workspace/actor/environment/entity/risk scope,
  conservative non-GET owner-review policy, BR-EX-29 typed conditions,
  bounded/redacted payload validation and `HASH_ONLY_NO_RAW` immutable blocked
  TypeScript plans. Bounded serializable retry is proven under real concurrent
  duplicate/conflict requests. Apply remains denied/no-outbox and the networkless
  Rust relay journal retains replay/conflict/`UNCERTAIN` no-retry rules. All
  actions remain unreachable; the eight unpublished `ops` routes and generic
  Redis access stay blocked.
- [EX-BE-05b/F1a — Portal Operations Queue and Incident Triage Sidecar](./EX_BE_05B_F1A_OPERATIONS_QUEUE.md)
  — **integration complete / production inactive:** ADMIN/workspace-bound
  TypeScript/PostgreSQL queue on SGP with exact counts, 182k bidirectional
  keyset qualification and ordered acknowledge→resolve workflow. Source result
  fields are immutable; transitions write audit/event atomically and create no
  outbox/source side effect. Contracts 41/41 and fresh-PG Control API 155/155
  plus dump/restore are green. Registry remains `fixture`; source-backed
  operations remain a later slice and Portal-owned Incident Detail is closed
  by F1b below.
- [EX-BE-05b/F1b — Portal Incident Detail](./EX_BE_05B_F1B_INCIDENT_DETAIL.md)
  — **`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`:** ADMIN/workspace-bound
  TypeScript/PostgreSQL incident workflow on SGP with forward-only
  OPEN→MITIGATED→RESOLVED state, acknowledgement, assignment, append-only
  annotations/evidence/timeline and same-workspace operation correlation.
  Mitigation and resolution require stored hash-only evidence; resolve never
  resumes a deployment. Four Execution source panels remain typed unavailable,
  all source/relay/outbox side effects remain false. Contracts 44/44 and
  fresh-PG Control API 159/159 plus dump/restore are green.
- [EX-BE-05b/F2 — Portal Sandbox Certification](./EX_BE_05B_F2_SANDBOX_CERTIFICATION.md)
  — **`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`:** SGP TypeScript/PostgreSQL
  owns the forward-only DRAFT→IN_REVIEW→APPROVED|DENIED certification workflow,
  exactly seven authority-labelled steps, immutable evidence lineage,
  deterministic evidence-set hash, submitter/approver separation of duties and
  blocked CANARY promotion intents. Public source-evidence ingestion does not
  exist; the profile remains `fixture/UNAVAILABLE`. No outbox, AWS-HK/source
  request or runtime/promotion activation is possible. Contracts 45/45 and
  fresh-PG Control API 163/163 across eleven migrations plus dump/restore are
  green.
- [EX-BE-05b/F3 — Portal Canary Control Room](./EX_BE_05B_F3_CANARY_CONTROL_ROOM.md)
  — **`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`:** SGP
  TypeScript/PostgreSQL owns immutable versioned DRAFT capital envelopes bound
  to current approved F2 evidence and the exact blocked CANARY promotion plan.
  Exact predecessor, serializable idempotency and append-only/audit gates
  prevent forks. All runtime/KPI/position/blotter/series/rollback facts remain
  `fixture/UNAVAILABLE`; `BROKER_STALE_BLOCKS_SCALE_ONLY` is typed, but both
  protective and scale groups remain invisible/disabled. No source ingestion,
  outbox, runtime activation or command route exists. Contracts 47/47 and
  fresh-PG Control API 167/167 across twelve migrations plus dump/restore are
  green.
- [EX-BE-05b/F4 — Portal Live Full Operations](./EX_BE_05B_F4_LIVE_FULL_OPERATIONS.md)
  — **`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`:** SGP composes the latest
  Canary predecessor into a read-only source-dark Phase 12 response. Broker
  values are schema-suppressed, source gaps are typed R4 blockers, every source/
  runtime/realtime fact stays unavailable and both action groups remain hidden.
  Canonical guard is
  `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4`.
  No source call, outbox, activation, SSE or command route exists. Contracts
  49/49 and fresh-PG Control API 169/169 plus dump/restore are green.

**Runway complete (BAR-00 → BAR-16).** Guide v0.5 bổ sung (không thay thế)
tại `upgrade/RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md`
mở runway dual-cell **BAR-17 → BAR-20** (deployment/release authority,
inter-cell gateway, single-domain routing & emergency ops, production
activation/DR). §8 audit matrix + §8.3 discrepancies là review bắt buộc trước
BAR-17. Paper→live theo 2 supplement (không thay thế):
`upgrade/PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md`
và `upgrade/DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md` (schema prose còn ghi
88 tables/2 views; runtime contract pack hiện quan sát 94 tables/2 views và
được ưu tiên khi có drift). Phần còn lại là các slice theo phase:
façade cutover gateway, Planning PG production adapter + real cutover, Rust
chỉ khi heavier-path profiling vượt gate §15.6, và release/DR owner-
operational theo BAR-16 report.

Agent chỉ được implement deep dive khi phase tương ứng đang active và owner đã
giao scope. Tài liệu của phase sau là thiết kế trước, không phải implementation
authority.

## Execution Loop backend plan — 2026-08-21

- [Execution Loop Portal Backend and HiFi Master Plan](../EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md)
  là authority mới cho backend phục vụ 17 màn Execution HiFi và board 19 phase.
  Tài liệu khóa dual-cell: TypeScript tại SGP giữ Portal control plane; Rust
  `portal-execution-edge-rs` tại AWS HK chỉ giữ compatibility adapters,
  projection/query/aggregation, SSE và command relay; Trading System vẫn là
  authority tuyệt đối cho Paper/Sandbox/Canary/Live. Python chỉ còn research,
  QuantBT compute và adapter thực sự bắt buộc bằng Python.
- Registry revision 3 đã giao ở `e78a597`: 8 groups, 22 features, 34 screens,
  trong đó đúng 17 `EXECUTION_*` routes. Evidence: 53 focused contract/API tests
  và root `./scripts/portal verify`; Docker contract suite chưa chạy được vì
  daemon không khả dụng và không được ghi nhận là pass.
- Phản biện `BACKEND_PLAN_REVIEW.md` đã được reconcile: cả 22 `BR-EX-*` có
  quyết định tại master plan §15.1 và F-1–F-9 có disposition tại §15.4. Runway
  tách `EX-BE-04a/05a` TypeScript governance khỏi `EX-BE-01→02→03→04b→06`
  Rust cross-cell; Approval Inbox/Gate R1 không còn chờ AWS hay Trading System.
- `EX-BE-00R4` **complete:** registry revision 4 đưa `delivery_profile` và
  `delivery_policy` versioned vào mọi commissioned screen; 17 Execution screens
  đều ở `fixture`, bảy runtime/command flags đều false. Schema/repository fail
  closed, public fixture/OpenAPI/generated TypeScript contract đồng bộ; không
  ngụ ý query/projection/SSE/command thật đã active.
- `EX-BE-04a` **foundation complete:** contract `keyset-page.v1` và TypeScript
  query primitives đã khớp wire adapter của Claude; 182k corpus chứng minh
  exact count, forward/back, concurrent insert, RBAC và cursor security.
- `EX-BE-05a` **integration complete / production inactive:**
  Approval Inbox và Gate R1 đã có PostgreSQL repository + session/RBAC/CSRF API,
  evidence-bound immutable decision workflow, audit/outbox và plan/apply/poll.
  Fresh-PG 13 suites/117 tests và isolated public-gateway smoke đều xanh;
  runtime SGP research dùng file-backed keyrings, không inline secret. Registry
  vẫn `fixture`, toàn bộ execution flags vẫn false; Claude còn phải sửa canonical
  route/CSRF và chốt policy riêng cho Portal governance write trước activation.
  Chi tiết contract/handoff/test ở
  [`EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md`](./EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md).
- `EX-BE-01` **contract complete:** Rust 1.85.1 workspace đã khóa canonical
  envelopes/exact decimals, `ts-contract-v1`, GET-only compatibility adapter,
  đủ 22 Python enums + 91 database CHECK vocabularies và golden/error fixtures.
  Contract pack, dependency lock và CI image đều pin; 14/14 Rust tests,
  `rustfmt` và strict Clippy pass. Chi tiết:
  [`EX_BE_01_RUST_CONTRACTS_AND_TS_ADAPTER.md`](./EX_BE_01_RUST_CONTRACTS_AND_TS_ADAPTER.md).
- `EX-BE-02` **foundation complete / cross-cell evidence pending:** AWS-HK-only
  Rust edge bắt buộc TLS 1.3 mTLS + delegated RS256 read JWT tối đa 60 giây;
  source transport exact-origin, GET-only, giới hạn queue/concurrency/timeout/
  body/retry và negotiation digest/contract v1 fail-closed. 27/27 Rust tests,
  strict Clippy/rustfmt, fresh-PG Control API suite, TypeScript production build,
  production image non-root 32.1 MB và Compose render đều pass. Chưa có
  WireGuard endpoint/PKI/credential production nên live SGP↔AWS vẫn
  `INTEGRATION_PENDING`; registry flags giữ false. Chi tiết:
  [`EX_BE_02_MTLS_DELEGATED_AUTH_AND_PROBES.md`](./EX_BE_02_MTLS_DELEGATED_AUTH_AND_PROBES.md).
- `EX-BE-02-LIVE` **D0 evidence complete / D1 owner decision pending:** the
  AWS-HK response and SGP host inventory have been reconciled without mutation.
  Contract compatibility is proven, but AWS OOM/I/O admission, stable endpoints,
  route/SG authority, PKI, dedicated TS read identity, private PostgreSQL,
  observability and backup ownership remain blockers. The locked route is SGP
  TypeScript → WireGuard/H2 mTLS/delegated JWT → AWS Portal Edge; an AWS-local
  Portal Source Proxy alone calls the loopback TS gateway through exact GETs.
  SSH is operator-only. D1 is network-only; D2 dark-deploys Portal services;
  D3 proves public/auth transport; D4 begins Paper read BUILDING-epoch evidence.
  No flag/profile changed. Evidence and decision sheet:
  [`EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md`](./EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md).
- `EX-BE-02-LIVE` **D1 offline preparation complete / owner execution
  pending:** candidate WireGuard, workload mTLS, delegated JWT, AWS-local
  Source Proxy, dark Edge/Proxy Compose, redacting preflight and rollback assets
  are versioned and tested. This is preparation only: no live network/service,
  source read, flag/profile or Trading System state changed. Deferred EIP
  allocation and route-table IDs warn at D1 and hard-fail the production gate.
  Detail:
  [`EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md`](./EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md).
- `EX-BE-02-LIVE` **D1 network accepted / application dark:** scoped STS and
  EC2 inventory verified the expected AWS boundary; exactly one UDP
  51820-from-SGP-`/32` rule is privately recorded by its rollback `sgr-...`.
  Both activation preflights, bidirectional WireGuard and link-loss containment
  passed; public 8443/8444 remain denied, existing SGP/Trading-System health
  stayed HTTP 200 and both units are enabled. No Portal service or business
  traffic started. The temporary operator instance profile must be detached or
  separately isolated before D2. Evidence:
  [`EX_BE_02_LIVE_D1_EXECUTION_EVIDENCE.md`](./EX_BE_02_LIVE_D1_EXECUTION_EVIDENCE.md).
- `EX-BE-02-LIVE` **IAM verified / D1 revalidated / application dark
  (2026-08-23):** the real instance role successfully re-read STS, instance,
  VPC, subnet, SG, EIP and effective route-table state against the private
  owner record. Exactly one UDP 51820-from-SGP-`/32` rule exists and its ID
  matches the rollback record; zero duplicate or broad rules were observed.
  Both peers are active with current handshakes, 0%-loss peer-only probes,
  public 8443/8444 denial, no Execution Portal containers/listeners and
  unchanged Trading System public health. The same verifier confirms D2 is
  still blocked by the attached D1 role and IMDS hop-limit two. Evidence:
  [`EX_BE_02_LIVE_IAM_VERIFICATION_AND_D1_REVALIDATION.md`](./EX_BE_02_LIVE_IAM_VERIFICATION_AND_D1_REVALIDATION.md).
  Exact status: `IAM_VERIFIED / D1_REVALIDATED / APPLICATION_DARK`.
- `EX-BE-02-LIVE` **D2 hardened / live deployment blocked:** the audit removed
  all startup/background source probes from dark mode, replaced the premature
  Trading System credential with seven exact 503 guards and added the private
  TLS/SCRAM projection PostgreSQL + separate owner/runtime roles + one-shot
  Rust migrator. The isolated gate proves migration/check, runtime DDL denial,
  plaintext denial and Edge readiness with no Source Proxy present. Live D2
  still waits for operator-instance-role isolation, signed Edge/Proxy digests,
  real workload PKI/JWKS, pressure admission and a new window. Evidence:
  [`EX_BE_02_LIVE_D2_HARDENING_CHECKPOINT.md`](./EX_BE_02_LIVE_D2_HARDENING_CHECKPOINT.md).
  The publication lane is also prepared: scoped `execution-d2` dispatch,
  digest-bound Trivy reports/CRITICAL rejection, OIDC Cosign sign+verify and a
  checksummed evidence artifact. It remains unexecuted until this workflow
  revision reaches the default branch.
- `EX-BE-02-LIVE` **historical D2 admission rejection / application dark:** the
  first live admission proved the SG/listener/capacity boundaries and recorded
  elevated shared-host I/O plus two non-Portal 256 MiB worker OOM exits. Bobby
  has reviewed that attribution; the former absolute 5% I/O rule is superseded
  by the shared-host preflight plus baseline/delta observation gate. The
  instance-role/IMDS and unpublished signed-image gates still remain.
  Historical evidence:
  [`EX_BE_02_LIVE_D2_ADMISSION_CHECKPOINT.md`](./EX_BE_02_LIVE_D2_ADMISSION_CHECKPOINT.md).
- `EX-BE-02-LIVE` **D2 authorization contract prepared / live unauthorized:**
  the public schema and non-sourcing validator bind exact deployment/image and
  evidence digests, signature/identity review, host/OOM/resource decisions,
  named owners, the temporary profile association, IMDS hardening and a
  <=2-hour window. Readiness and activation are distinct; activation requires
  proven profile detachment and hop-limit one. All source/query/realtime/
  profile/command/Trading System flags remain false. Exact status:
  `D2_AUTHORIZATION_CONTRACT_PREPARED / LIVE_D2_UNAUTHORIZED`. Evidence:
  [`EX_BE_02_LIVE_D2_AUTHORIZATION_CONTRACT.md`](./EX_BE_02_LIVE_D2_AUTHORIZATION_CONTRACT.md).
  A 05:43 UTC recheck showed the shared 3,000-IOPS root volume was already busy
  before Portal existed. The role also failed the then-current IMDS-hardening
  DryRun. No service or cloud state changed during that checkpoint.
- `EX-BE-02-LIVE` **D2 shared-host realignment complete / live unauthorized:**
  Bobby selected the existing AWS-HK execution host for the minimal Rust Edge,
  Source Proxy and schema-only projection boundary; full Portal remains SGP and
  `DEDICATED_SPLIT_PORTAL_CELL` is withdrawn. No new EC2/EIP/D1B is part of D2.
  Resource ceilings are raised to a
  5.00 CPU / 5,632 MiB startup hard ceiling (4.00 CPU / 4,608 MiB long-running)
  and admission now compares bounded positive
  PSI deltas with the exact pre-start baseline. D4 still requires separately
  approved encrypted projection storage on the same host or another approved
  store. Exact status:
  `D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED`. Detail:
  [`EX_BE_02_D2_PLACEMENT_DECISION.md`](./EX_BE_02_D2_PLACEMENT_DECISION.md).
- **EX-BE-02-LIVE D2 shared-host requalification (2026-08-23):** the live
  schema-v2 aggregate preflight accepted the existing AWS-HK host with zero
  blockers (about 8.5 GiB memory and 57.5 GiB Docker disk available, zero
  Portal container/listener collision). Existing I/O remains a visible
  baseline warning. The diagnostic expired and is not deployment evidence.
  The IMDS hop-limit-one DryRun still returned `UnauthorizedOperation`, proving
  the private D2 policy is not effective on the actual D1 operator role.
  Status is `HOST_PREFLIGHT_ACCEPTED / IAM_ISOLATION_NOT_AUTHORIZED /
  LIVE_D2_UNAUTHORIZED`; no service started. Evidence:
  [`EX_BE_02_LIVE_D2_SHARED_HOST_REQUALIFICATION.md`](./EX_BE_02_LIVE_D2_SHARED_HOST_REQUALIFICATION.md).
  The exact IMDS→detach→credential-absence order is now enforced by a tested
  operator tool with status `D2_ISOLATION_EXECUTABLE_PREPARED /
  LIVE_D2_UNAUTHORIZED`; its verify mode is read-only and activation remains
  window-gated. A post-attachment recheck at `2026-08-23T08:36:20Z` proved the
  caller/instance/profile association are exact but AWS still reports that no
  identity-based policy allows the metadata action. The console attachment or
  boundary placement must therefore be corrected; no detachment occurred.
  A later propagation retry also failed. The mode-0600 private policy has been
  narrowed to revision 2 with the exact two actions, instance ARN and region,
  but without request-parameter conditions that did not create an effective
  Allow. After the earlier rejected attachment, Bobby made revision 2 the
  default permissions-policy version on the exact existing role and confirmed
  there is no permissions boundary. The exact 2026-08-24 verifier then passed
  with `D2_ISOLATION_AUTHORITY_VERIFIED`: EC2 returned the required
  `DryRunOperation` for hop limit one. Status is now
  `IAM_EFFECTIVE_ALLOW_VERIFIED / LIVE_D2_UNAUTHORIZED`. No EC2 setting or
  association changed; the role is retained until the bounded D2 window and no
  detach/delete workaround is allowed. Evidence:
  [`EX_BE_02_D2_IAM_POLICY_REVISION_2.md`](./EX_BE_02_D2_IAM_POLICY_REVISION_2.md).
- `EX-BE-02-LIVE` **D2 image HIGH applicability checked / owner disposition
  pending:** exact-image inspection proves the Rust Edge uses `rustls` and does
  not dynamically link OpenSSL; its Distroless OpenSSL 3.0.20 is also outside
  the affected branch. The Nginx Source Proxy does link affected OpenSSL 3.5.7,
  but D2 config has no QUIC/HTTP3/UDP listener, so the required QUIC-server
  trigger is not reachable. Preflight now fail-closes on any `quic`, `http3`,
  `Alt-Svc` or extra listener and the negative integration test passes. This is
  mitigation, not automatic owner acceptance; live D2 stays unauthorized until
  Bobby records a disposition and opens a fresh bounded window. Evidence:
  [`EX_BE_02_D2_CVE_2026_14456_APPLICABILITY.md`](./EX_BE_02_D2_CVE_2026_14456_APPLICABILITY.md).
- `EX-BE-02-LIVE` **D2 release candidate remediated / live unauthorized:** the
  first main publication caught floating Python patch drift and four CRITICAL
  findings in unused Debian-slim runtime packages before signing. CI/runtime
  now pin Python 3.12.14, and the shell-less Rust Edge uses pinned Distroless
  `cc-debian12:nonroot`. Python 401/401 executable tests passed (plus one
  skip), the full D2 image/PostgreSQL/source-dark gate passed and the fixed
  Edge scan reports zero CRITICAL findings. The first republish then caught two
  fixed OpenSSL CRITICAL findings in the old Source Proxy base; it now pins
  official NGINX 1.31.4 / Alpine 3.24 slim by digest and its exact offline scan
  also reports zero CRITICAL findings. The D3 Control API additionally pins
  Node 22.23.2 / Alpine 3.24 and removes build-only package managers from its
  runtime after an exact-image scan found npm's vulnerable `node-tar`; the
  fixed image reports zero HIGH/CRITICAL findings. The later IAM DryRun is now
  accepted, but the separate image-HIGH disposition, fresh admission and owner
  window still keep D2 closed; no AWS/runtime state changed here. Evidence:
  [`EX_BE_02_D2_RELEASE_GATE_REMEDIATION.md`](./EX_BE_02_D2_RELEASE_GATE_REMEDIATION.md).
- `EX-BE-02-LIVE` **D3 offline preparation complete / live unauthorized**
  (`D3_OFFLINE_PREPARATION_COMPLETE / LIVE_D3_UNAUTHORIZED`): a
  separate Compose/env/config delta opens only three credential-free public
  source probes; four alpha routes remain 503 and every business capability
  remains false/`fixture`. The Control API canonical issuer creates the
  short-lived positive/negative assertion corpus, while the live harness forces
  H2/TLS1.3 mTLS and emits status/timing/snapshot-only evidence. Offline gates
  cover 19 probe outcomes and preserve D2 rollback. This historical offline
  milestone was superseded by the accepted live D3 evidence below. Detail:
  [`EX_BE_02_LIVE_D3_OFFLINE_PREPARATION.md`](./EX_BE_02_LIVE_D3_OFFLINE_PREPARATION.md).
- `EX-BE-02-LIVE` **D2 dark accepted / source inactive (2026-08-24):** the
  exact IAM isolation sequence hardened IMDS to hop limit one, detached the
  temporary operator profile and proved workload credentials absent before
  startup. Three private services passed a 15-minute four-sample admission
  soak, zero restart/OOM/source-access evidence, PostgreSQL TLS/SCRAM and role
  checks, WireGuard/mTLS/public-denial checks and a volume-preserving full
  rollback/redeploy rehearsal while Trading System health stayed HTTP 200.
  Every source/query/analytics/SSE/command/profile flag remains false/fixture.
  Status: `D2_DARK_ACCEPTED / SOURCE_INACTIVE`. Evidence:
  [`EX_BE_02_LIVE_D2_DARK_EXECUTION_EVIDENCE.md`](./EX_BE_02_LIVE_D2_DARK_EXECUTION_EVIDENCE.md).
- `EX-BE-02-LIVE` **D3 gateway identity remediation (2026-08-24):** the first
  live D3 window rejected fail-closed before JWT probes because the signed Edge
  image locked gateway digest `sha256:4f63...` while the compatible current
  Trading System gateway is `sha256:8a81...`. Workload mTLS proved only the
  exact public `200/200/200` and guarded business `503/503/503/503` matrix;
  projection rows stayed zero and D2 rollback passed with zero restart/OOM.
  The lock and preflight are updated in source so future drift stops before
  Compose mutation. At that checkpoint D3 remained closed pending full gates
  and a protected-main signed Edge republish. Historical status:
  `D3_ATTEMPT_REJECTED_FAIL_CLOSED / D2_RESTORED / SIGNED_EDGE_REPUBLISH_REQUIRED`.
  Evidence:
  [`EX_BE_02_LIVE_D3_GATEWAY_IDENTITY_REMEDIATION.md`](./EX_BE_02_LIVE_D3_GATEWAY_IDENTITY_REMEDIATION.md).
- `EX-BE-02-LIVE` **D3 transport accepted (2026-08-24):** protected-main signed
  images passed real SGP→AWS-HK HTTP/2 + TLS 1.3 mTLS, the complete delegated-
  JWT positive/negative matrix, bounded latency, Source Proxy loss/recovery and
  unchanged-D2 rollback. Safe logs contained only the three public routes;
  business reads and projection state stayed zero. Runtime exited on D2
  source-dark. Status: `D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK /
  D2_RUNTIME_RESTORED`. Evidence:
  [`EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md`](./EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md).
- [EX-BE-02-LIVE D4 offline Paper-shadow authorization](./EX_BE_02_LIVE_D4_OFFLINE_AUTHORIZATION_PREPARATION.md)
  — **offline authorization prepared / D3 accepted / live inputs blocked:** credential-
  free owner/evidence schema, fail-closed readiness/qualification validator and
  BUILDING-epoch-only rollback runbook. The current optional-key source reads,
  incomplete paging/event semantics and unapproved projection storage are hard
  blockers. D4 cannot enable Query, analytics, SSE, commands, activation or a
  non-fixture registry profile. Status:
  `D4_OFFLINE_AUTHORIZATION_PREPARED / D3_PREDECESSOR_ACCEPTED /
  LIVE_D4_INPUTS_BLOCKED`.
- [EX-BE-02-LIVE D4 readiness audit and owner request](./EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md)
  — **readiness audited / no source read:** the sanitized contract pack still
  has optional alpha auth, unstable list paging and incomplete event/resync
  semantics. AWS-HK has only the unencrypted root-backed D2 volume, so no D4
  business store exists. The request locks the exact identity, four GET routes,
  cursor/completeness/resync and runtime evidence the Trading System owner must
  publish before Portal can build a source mapper. Status:
  `D4_READINESS_AUDITED / LIVE_D4_INPUTS_BLOCKED / NO_SOURCE_READ`.
- [EX-BE-02-LIVE D4 mapper core and readiness hardening](./EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md)
  — **offline mapper core complete / runtime fail-closed / live inputs
  blocked:** Rust now normalizes exact-decimal order/fill/position/event facts,
  rejects cross-alpha rows and ambiguous event cursors, seals a synthetic
  replay corpus and proves BUILDING-only PostgreSQL replay. Edge readiness
  distinguishes store health from a real ingestor, preventing an empty
  database from reporting D4 ready. No live source call/runtime integration or
  profile activation exists. Status: `D4_MAPPER_CORE_OFFLINE_COMPLETE /
  RUNTIME_FAIL_CLOSED / LIVE_INPUTS_BLOCKED`.
- [EX-BE-02-LIVE D4 encrypted projection-storage boundary](./EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md)
  — **storage boundary prepared / live volume absent / no source read:** a
  credential-free owner schema, read-only template/offline/readiness validator
  and D4-only bind-backed Compose overlay prohibit root-filesystem and D2-volume
  reuse. The gate requires independent encrypted-EBS/KMS evidence, a distinct
  filesystem UUID and hardened mount ownership/options. It creates no AWS,
  filesystem, Docker or Trading System state. Status:
  `D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED / LIVE_VOLUME_NOT_PROVISIONED /
  NO_SOURCE_READ`.
- [EX-BE-02-LIVE D4 owner action packet](./EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md)
  — **owner instructions prepared / actions pending / no source read:** exact
  40-GiB encrypted gp3 configuration, safe Nitro device/mount procedure,
  credential-free evidence return fields and a copy-paste Trading System agent
  request for the mandatory Paper read identity plus stable four-resource
  cursor/completeness/resync contract. Status:
  `D4_OWNER_ACTION_PACKET_PREPARED / OWNER_ACTIONS_PENDING / NO_SOURCE_READ`.
- [EX-BE-02-LIVE D4 source and storage reconciliation](./EX_BE_02_LIVE_D4_SOURCE_AND_STORAGE_RECONCILIATION.md)
  — **owner inputs reconciled / contract import pending / no Portal source
  traffic:** the dedicated loopback-only facade, mandatory read identity,
  revoked-key evidence, exact snapshot/event protocol and encrypted gp3 host
  storage are now pinned without exposing secrets or business payloads. The v2
  Portal authorization manifest additionally gates exact source commits/image,
  frozen scope/bounds and Source Proxy delivery. Rust artifact import,
  production ingestor and the live BUILDING-epoch drills remain pending.
  Status: `D4_SOURCE_AND_STORAGE_INPUTS_RECONCILED /
  CONTRACT_ARTIFACT_IMPORT_PENDING / NO_PORTAL_SOURCE_TRAFFIC`.
- [EX-BE-02-LIVE D4 contract import](./EX_BE_02_LIVE_D4_CONTRACT_IMPORT.md)
  — **contract import complete / adapter pending / no source call:** the five
  non-secret source artifacts are byte-locked to Trading System
  runtime-acceptance commit `99e912f` and unchanged observed HEAD `4ad8f87`.
  A later read-only audit at source HEAD `6049a73` again found an empty
  five-path diff and matching acceptance/current/Portal hashes. The import
  remains the separate earlier commit `fdd1f34`; no Source Proxy activation,
  credential, source request, projection epoch or registry change is included.
- [EX-BE-02-LIVE D4 Rust source-contract adapter](./EX_BE_02_LIVE_D4_SOURCE_CONTRACT_ADAPTER.md)
  — **adapter complete / transport pending / no source call:** build-time
  hashes and authority checks bind the exact four-route facade pack. Strict
  request/response types enforce fixed scope, decimal strings, bounded opaque
  cursors, snapshot completeness, ordered idempotent deltas and typed resync.
  Eleven tests plus rustfmt/strict Clippy pass; Source Proxy, credentials,
  storage, epochs and runtime flags remain untouched.
- [EX-BE-02-LIVE D4 bounded Source Proxy transport](./EX_BE_02_LIVE_D4_BOUNDED_SOURCE_TRANSPORT.md)
  — **transport complete / ingestor pending / no source call:** enum-derived
  GETs only, TLS 1.3 workload mTLS, HTTP/2, pathless origin, no redirects or
  environment proxy, bounded resource use and no implicit cursor retry. The
  client cannot possess the Trading System read key. Five tests plus
  rustfmt/strict Clippy pass; no Source Proxy/runtime/storage/epoch state
  changed.
- [EX-BE-02-LIVE D4 BUILDING-only ingestion state machine](./EX_BE_02_LIVE_D4_BUILDING_INGESTION_STATE_MACHINE.md)
  — **state machine complete / PostgreSQL writer pending / no source call:**
  durable snapshot-lease, baseline and event-page ACK barriers prevent cursor
  advancement before commit; exact descriptor counts and `410` rebuild are
  fail-closed. Eight tests plus rustfmt/strict Clippy pass. No network,
  PostgreSQL, runtime or delivery-profile state changed.
- [EX-BE-02-LIVE D4 PostgreSQL BUILDING writer](./EX_BE_02_LIVE_D4_POSTGRES_BUILDING_WRITER.md)
  — **offline writer complete / live qualification pending / no source call:**
  first-class global-stream sequence and DELETE semantics now feed an atomic,
  BUILDING-only PostgreSQL lease/baseline/event-page writer. Opaque tokens stay
  redacted and cursor advancement shares the data transaction; proven gaps
  preserve the prior cursor and mark the epoch `FAILED/REBUILD_REQUIRED`.
  Fresh-PG restart/replay/idempotency/gap tests, strict Clippy and the D4-aware
  dump/restore signature are green. Source Proxy, credentials, Query/SSE,
  activation and registry profiles remain untouched.
- [EX-BE-02-LIVE D4 qualification runtime entrypoint](./EX_BE_02_LIVE_D4_QUALIFICATION_RUNTIME_ENTRYPOINT.md)
  — **offline runtime entrypoint accepted / live window pending / no source
  call:** the Edge image now has separate `d4-prepare-building` and finite
  `d4-qualify` commands. A profile-gated no-port container revalidates the
  <=2-hour owner window, exact D2/D3/source/storage evidence and permanent
  false authority flags before creating/resuming only the declared BUILDING
  epoch. Evidence is 142 Rust tests, strict Clippy/rustfmt, fresh PostgreSQL,
  replay/restart/gap/load, dump/restore and exact-route Compose/Nginx gates.
  Live source traffic and qualification evidence remain pending.
- [EX-BE-02-LIVE D4 qualification attempt and compatibility remediation](./EX_BE_02_LIVE_D4_QUALIFICATION_ATTEMPT_AND_REMEDIATION.md)
  — **live attempt failed closed / Portal compatibility remediated / signed
  republish required / D2 dark restored:** D4 reached the mandatory-auth source
  through Source Proxy and created one encrypted, non-queryable BUILDING epoch.
  The qualifier then rejected an Nginx pagination `429` and exact scientific
  decimal notation before committing a baseline. The sustained request limit
  remains 120/minute with a bounded one-minute burst; the Rust source adapter
  now normalizes exact scientific strings without float conversion. Offline
  gates pass and D2 is healthy/dark again. D4 acceptance still requires signed
  protected-main images and one fresh finite owner window; no frontend Lane B,
  Query, analytics, SSE, command or activation authority is unlocked.
- [EX-BE-02-LIVE D4 Paper read-shadow acceptance](./EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md)
  — **Paper read shadow accepted / BUILDING only / D2 dark restored / business
  reader still dark:** protected-main signed images completed one fresh finite
  mandatory-auth qualification into separately encrypted storage. Baseline,
  replay parity, freshness, source-loss/recovery, PostgreSQL restart,
  idempotency, bounded load and encrypted dump/restore passed; the full offline
  gate is 143 Rust/PostgreSQL tests plus strict Clippy/rustfmt. The epoch remains
  BUILDING, registry remains `fixture`, and Query/analytics/SSE/commands/
  activation remain disabled. Sanitized machine-readable evidence is
  [`EX_BE_02_LIVE_D4_ACCEPTANCE_EVIDENCE.json`](./EX_BE_02_LIVE_D4_ACCEPTANCE_EVIDENCE.json).
- [EX-BE-02-LIVE D4 Source Facade Runtime Optimization Backlog](./EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md)
  — **qualification bridge only / steady state not accepted:** the accepted
  D4 finite shadow does not authorize the Trading System-owned Python facade
  to remain always on. Read-only inspection found an unconditional 500 ms
  full-scope refresh with about 2.4–3.3 MiB/s idle database traffic and no
  consumer demand. The next owner window must make the facade dormant and
  later replace full rescans with a lease-aware incremental cursor, bounded
  retention/backpressure and a separate 24-hour soak. This changes no current
  Trading System or Portal runtime and unlocks no frontend delivery profile.
- [EX-BE-02 / N01 D4 Dormant Closeout Discipline](./EX_BE_02_D4_DORMANT_CLOSEOUT_DISCIPLINE.md)
  — **offline implementation accepted / live closeout evidence pending / D4
  reader dark:** an exact-label host guard now closes on missed start,
  qualifier completion, revoked authorization or owner-window expiry; it stops
  only the qualifier, D4 Source Proxy and the dedicated facade, then restores
  the accepted D2 dark proxy with no image pull. Exact-schema mode-0600 owner
  evidence must prove zero source sessions, SELECT delta and byte delta before
  `D4_DORMANT_VERIFIED`. No live window, registry profile, epoch activation or
  Trading System change was made.
- [EX-BE-02 / N02 Incremental Source Contract Revision](./EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md)
  — **Portal request/verifier complete / narrow request superseded / consolidated read pack pending / runtime v1
  locked:** a request-only v2 schema now locks consumer lease, cursor/delta,
  tombstone, retention, resync, completeness and bounded authority. An exact
  four-file digest envelope and 15-case fail-closed verifier are green. No v2
  owner publication was found, so no contract import, Rust reader change,
  source traffic, registry promotion or Trading System edit was made.
- [EX-BE-02 / N03 Trading-System-owned Incremental Source Implementation](./EX_BE_02_N03_TRADING_SYSTEM_INCREMENTAL_SOURCE_IMPLEMENTATION.md)
  — **Portal acceptance harness complete / narrow request superseded / consolidated read pack pending / N02 and owner implementation
  pending:** an exact five-file evidence envelope chains immutable source
  commit/image to accepted N02 bytes and proves zero idle SELECT/bytes, no
  ordinary-delta full scan, query-plan/resource bounds and 14 recovery/security
  scenarios. The current AWS-HK v1 facade remains dormant; Portal did not edit,
  deploy or call Trading System.
- [Trading System D4 Paper Read v2 implementation request](./TRADING_SYSTEM_D4_PAPER_READ_V2_IMPLEMENTATION_REQUEST.md)
  — **superseded before implementation:** historical narrow N02+N03 handoff.
  Trading System must keep v1 dormant and wait for the final consolidated,
  capability-negotiated N02/N03/N11 read pack. It grants no source mutation,
  command, broker, live/canary or Portal activation authority.
- [EX-BE-03 / N04 Lease-aware Rust Shared Consumer](./EX_BE_03_N04_LEASE_AWARE_RUST_SHARED_CONSUMER.md)
  — **source-dark core + PostgreSQL fencing complete / N02-N03 wire integration
  pending / live source off:** one Rust shared-consumer state machine now owns
  demand idle, bounded request/queue/retry, typed circuit/rebuild states and
  redacted metrics. PostgreSQL supplies a singleton DB-time lease with monotonic
  fencing; stale workers cannot atomically commit facts/DELETE/cursor after lease
  loss. Synthetic fixtures and fresh-PG/restart/restore tests are green. No v2
  request example became runtime and no AWS-HK traffic was opened.
- [EX-BE-03 / N05 Retention, Recovery and Cleanup](./EX_BE_03_N05_RETENTION_RECOVERY_CLEANUP.md)
  — **source-dark retention/recovery core complete / live policy inactive:**
  immutable policy/checkpoint evidence, five-state retention truth, new-epoch
  rebuild directives and rollback-window/lease-gated atomic cleanup are backed
  by fresh PostgreSQL replay/restore tests. No source traffic, backup schedule,
  production cleanup or profile promotion was enabled.
- [EX-BE-03 / N06 Real-source Qualification and Soak](./EX_BE_03_N06_REAL_SOURCE_QUALIFICATION_AND_SOAK.md)
  — **Portal qualification authority complete / Bobby Paper-fast profile
  approved / real source bytes pending:** Rust now binds exact N02/N03 bytes,
  immutable image/schema identity, BUILDING parity, twelve failure/recovery
  drills and bounded route/Rust/PG metrics into either a 30-minute Paper-fast or
  separate extended 24-hour decision. Both retain the full safety corpus;
  synthetic evidence cannot pass real modes and accepted evidence still cannot
  activate a reader. No N02/N03 owner pack or real N06 window exists locally,
  so no source call or runtime/profile change occurred.
- [EX-BE-03 / N07 Projection, Query, analytics and narrow screen APIs in shadow](./EX_BE_03_N07_PROJECTION_QUERY_ANALYTICS_SHADOW.md)
  — **Portal implementation complete / Bobby shadow promotion approved /
  runtime fail-closed:** immutable
  compatibility evidence now gates an atomic epoch cutover, and the first
  commissioned Paper Workbench `orders`/`positions` API is deployment-scoped
  through Rust Query plus a session/mTLS/H2/delegated-JWT TypeScript BFF.
  Signed keysets, exact in-scope counts/aggregates, exact decimals, freshness,
  partiality, retention and typed recovery are contract-tested. The owner
  decision is recorded and must not be requested again; N06 real Paper-fast
  evidence remains absent, so registry is still `fixture`, flags are false and
  no source/runtime was touched.
- [EX-BE-06 / N08 SSE Real-source Activation](./EX_BE_06_N08_SSE_REAL_SOURCE_ACTIVATION.md)
  — **Portal implementation complete / owner promotion approved / runtime
  fail-closed:** one exact Rust activation capability binds N06, active N07
  authority/epoch, immutable contracts/images, nine evidence hashes and owner
  approval. The Edge exposes an exact snapshot-before-stream route; TypeScript
  proxies snapshot/SSE over reusable mTLS HTTP/2 with short delegated JWT; the
  browser closes EventSource on terminal/generic errors. Feature flags remain
  false until the single external `d4.paper-read.v2` source-evidence dependency
  exists; command authority is unchanged.
- [EX-BE-05 / N09 Portal-owned Governance and Workflow Gaps](./EX_BE_05_N09_PORTAL_GOVERNANCE_WORKFLOW_GAPS.md)
  — **integration complete / production inactive:** R2 immutable R1 lineage,
  independent governance-write policy, explicit operation assignment and
  incident link, bidirectional approval history, `REQUEST_CHANGES`, typed R1
  limitations and bounded Sandbox smoke-plan evidence are now canonical across
  PostgreSQL, Control API, OpenAPI, fixtures and generated TypeScript. Registry
  policy remains false; no Trading System, AWS-HK, source or command authority
  changed.
- [EX-BE-07 / N10 Series and Insight Analytics Contracts](./EX_BE_07_N10_SERIES_AND_INSIGHT_ANALYTICS_CONTRACTS.md)
  — **contract and pure-engine complete / production inactive:** exact-decimal
  equity/drawdown/approved-band series, adaptive bounded intervals, explicit
  gap and lineage semantics, six typed insight series, the twelve-tile Alpha
  360 catalogue and ten typed Execution mapper envelopes are canonical across
  JSON Schema, OpenAPI, Rust, generated TypeScript and fixtures. Routes remain
  unmounted and source-dark; no Trading System, AWS-HK, registry, SSE or
  command authority changed.
- `EX-BE-03` **foundation complete / source-ingestion integration pending:**
  pure Rust reducer idempotent, structured source cursor, explicit completeness,
  snapshot/replay, semantic parity, epoch overlap+jitter và server freshness đã
  được khóa. SQLx migration tạo Portal-owned projection schema với atomic
  ingestion/current row/journal/checkpoint/gap, immutable evidence và parity-only
  epoch activation. Gate PostgreSQL 16 thật cùng 42 Rust tests, strict Clippy/
  rustfmt và corpus 182.000 observations xanh. Runtime feature flag giữ false;
  không có direct Trading System DB/Redis/CLI. Chi tiết:
  [`EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`](./EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md).
- `EX-BE-04b` **foundation complete / screen API and source integration
  pending:** crate Rust `query-api` khóa signed bidirectional keyset gắn
  scope/epoch/query, filter/sort allowlist, count + aggregate exact trên toàn
  tập lọc và decimal không qua float. PostgreSQL migration/repository thêm sáu
  rung series 1m→1d tối đa 5.000 điểm cùng retention typed
  `HOT/PARTIAL_HOT/COLD_REQUESTABLE/PURGED/UNKNOWN`. Gate PostgreSQL 16 thật có
  47 Rust tests, 182.000 projection rows, concurrent insert + eviction +
  backward navigation và 2.881 điểm exact-decimal. Chi tiết:
  [`EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md`](./EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md).
- `EX-BE-06` **foundation complete / source and activation evidence pending:**
  Rust bounded journal fan-out, retained replay, Last-Event-ID, typed
  gap/epoch/source-discontinuity recovery, 100-client fan-out and slow-consumer
  backpressure are wired through a TypeScript same-origin mTLS HTTP/2 proxy.
  Delegated JWT stays server-only, session revocation is bounded, and both
  runtime flags remain false. Evidence: 51 Rust/PostgreSQL tests, Control API
  build and 102/102 tests, canonical Base64URL cursor enforcement, and clean
  base/AWS-edge/SGP-overlay Compose renders. Detail:
  [`EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md`](./EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md).
- `EX-BE-07a` **foundation complete / source repository and screen API
  pending:** crate Rust `analytics` khóa exact-decimal capital preview có stale
  blocker, funnel bốn stage không suy diễn, batch insight tối đa 64 item gắn
  `portfolio_id`, correlation packed tới 150/ranked fallback trên 150, exposure
  đủ population theo currency và capital-ledger reconcile. Mọi output có
  `DERIVED`, formula version, freshness floor và partiality. Evidence: 21 test
  analytics, tổng gate Rust/PostgreSQL 72 tests + 182.000 rows, strict Clippy/
  rustfmt. Không endpoint/flag/source write nào được thêm. Chi tiết:
  [`EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md`](./EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md).
- `EX-BE-07b` **integration complete / source activation and operational
  evidence pending:** PostgreSQL source snapshots/facts và sáu repository đọc
  active epoch trong `REPEATABLE READ READ ONLY`; profile, capability, adapter,
  declared fact count và typed payload đều fail-closed. Sáu screen API Rust chỉ
  đi qua TypeScript same-origin BFF có session, reusable mTLS HTTP/2 và delegated
  JWT đúng resource. OpenAPI/generated types/fixture đã khóa contract. Hai
  runtime flag vẫn false, registry vẫn `fixture`, không đọc storage riêng hay
  tạo side effect bên Trading System. Chi tiết:
  [`EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md`](./EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md).
- [Execution backend hardening checkpoint](./EX_BE_HARDENING_CHECKPOINT.md)
  — **H1–H3 complete:** downstream/session-owned SSE cleanup,
  ACTIVE-epoch cursors, poller liveness/readiness and versioned realtime
  freshness are hardened; delegated JWTs preserve session `auth_time`, and R2
  Capital Preview is ADMIN-only plus immutable workspace/portfolio/currency
  bound. Ordered analytics digests, multi-fact venue-aware quality, aggregate
  payload bounds and a bounded TypeScript HTTP/2 analytics bulkhead close H3.
  Evidence: Rust/PostgreSQL 75/75 + strict Clippy/rustfmt; fresh-PG Control API
  build + 111/111. No runtime/profile activation was made.
- **Execution frontend contract reconciliation (2026-08-22):** native
  EventSource reconnects now prefer a newer `Last-Event-ID` over the retained
  URL cursor; `auth.expiring` carries the verified assertion's RFC3339 expiry;
  and reason-specific `projection.gap` facts are documented as nullable. Rust
  keyset pages use the published `next_cursor`/`prev_cursor`/`applied_sort`
  names and surface exact currency aggregates plus fail-closed page retention
  (`UNKNOWN` until a source policy and time range can classify it). A read-only
  R2 detail endpoint now provides immutable `portfolio_id` and `currency`.
  `DecimalString` rejects precision that would round, and the canonical Approval
  Inbox selector is `view` (`filter` now fails closed). No generic order list,
  aggregate exposure verdict, or packed-matrix sample count was invented: those
  remain owner/source capability decisions. The registry stays `fixture`; all
  runtime flags stay false.
- [EX-BE-08a offline source qualification](./EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md)
  — **offline foundation complete / live evidence pending:** sealed
  contract/gateway/adapter/capability-bound corpora, frozen semantic digest,
  reducer↔replay parity, explicit gap blockers, resource bounds and redacted
  metrics/report. Rust/PostgreSQL gate 81/81 + strict Clippy/rustfmt. No AWS
  endpoint, source credential, production mapper, runtime flag or registry
  profile was changed.
- Backend tiếp theo của `EX-BE-08a` chỉ bắt đầu sau owner-approved D1–D4: real
  source mapper/parity, BUILDING epoch shadow, cross-cell load/fault/soak/
  restore/rollback evidence, rồi owner quyết định `fixture -> shadow`.
  Live `EX-BE-05b` vẫn chờ source command capability và không bị read
  qualification ngầm mở khóa. Phần contract-only `EX-BE-05b/F0` đã hoàn tất
  offline: canonical BR-EX-28 catalogue, BR-EX-29 typed conditions và
  deny-by-default plan/apply/verify/Rust relay foundation. Tám `ops` route chưa
  được Trading System công bố giữ `portal_reachable=false`; không thay bằng
  DB/Redis/CLI trực tiếp. F1a/F1b đã đóng workflow Operations Queue/Incident
  trên dữ liệu Portal/fixture; F2 đã đóng workflow Sandbox Certification
  source-dark với bảy bước và promotion plan luôn `BLOCKED`; F3 đã đóng Canary
  DRAFT-envelope/read-model source-dark; F4 đã đóng Live Full Lane A source-dark
  và broker suppression contract. Source adapters vẫn chờ owner publish
  typed HTTP contracts và accepted D2→D4/rollback evidence.

## BAR-21 — Strategy Import & Quarantine Ingest foundation

Quarantine write path for U14 (see `BAR_21_STRATEGY_IMPORT.md`):
`POST /api/v1/alphas/import` (source-reference JSON, R11 — no browser upload) +
`GET /api/v1/alphas/imports`, digest-verified fail-closed import into a
runtime quarantine store; the source registry stays immutable and imported
alphas are never executable. Fixtures: `visual-baseline-run` (COMPLETED) +
`visual-baseline-run-running` (RUNNING).

## Backend state — 2026-08-17 (tracking snapshot)

- Backend requests R1–R15 (FRONTEND_HANDOFF §8.3) all closed; see the
  authoritative list there.
- Gateway wire ON (`PORTAL_WEB_UPSTREAM=control-api:4000` default): /api/
  through the Control API façade — session required, reads open (cross-user),
  mutations ADMIN-only; rollback 1 line. Separate one-shot Compose services run
  migrations and idempotent bootstrap before the hardened long-lived API starts;
  users are declared in `deploy/control-api/bootstrap-users.yaml`.
- Remaining backend is phase-scoped (not open requests): U14 certification
  slice, capability expansion of quantbt-engine (BAR-09/U12), SSE through
  façade (BAR-07), Command Center read model (U10), workspace tenancy (U10),
  maintenance screen (U07), BAR-17→20 / U18 / U19. See
  `BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` §14.1 for detail.

## Backend state — 2026-08-18 (PR #35 CI recovery)

- Fixed clean-runner npm permissions for contracts and Control API by setting
  a writable unprivileged cache and using `npm ci`; the reproduced
  `EACCES`/exit-243 failure no longer occurs.
- Hardened the Control API façade against the CodeQL SSRF finding: configured
  upstream must be an origin-only HTTP(S) URL, request path remains inside
  `/api`, traversal/authority tricks are rejected, and final scheme/host/port
  must match before dispatch. Evidence: contracts 6/6, Control API 49/49,
  typecheck/build, actionlint and workspace verify passed locally; remote
  checks are pending merge of the fix branch into `dev`.
- Made composed-smoke cleanup unconditional for its scoped Compose project,
  including partial `compose up` failure. Full build/health/web/Planning
  create-transition-activity smoke passed on `portal-smoke-pr35:18081` and
  teardown removed all test containers and volumes.
- Owner scope is locked: future Rust backend work concentrates on measured
  Paper→Sandbox→Live-Canary→Live Execution Cell fast paths. TypeScript keeps
  control/approval authority; Python keeps research/QuantBT compute; BAR-14
  profiling, parity, shadow and rollback gates remain mandatory.

## Backend state — 2026-08-19 (stable v1.0.1 Planning hotfix)

- Planning is no longer browser-local in the deployable Portal: the web build
  defaults to `v1` persistence and sends same-origin session + CSRF credentials.
- The gateway routes `/roadmap-task-board/api/*` through an authenticated
  Control API façade. Actor is derived from the active Portal session and
  overwrites all browser input before the private compatibility service writes
  activity/outbox state. USER may perform normal task collaboration; destructive
  import/delete/restore and Roadmap writes remain ADMIN-only.
- Lark transition text identifies the actor separately from the task owner;
  production Compose passes only runtime Lark configuration, never secrets in
  source. A release audit also fixed bodyless DELETE requests incorrectly
  declaring JSON and failing in Fastify before CSRF/RBAC. Local gates: Control
  API 62/62, Planning backend 30/30, Planning frontend 80/80 + build, Portal
  frontend 381 passed/3 skipped + build.
- This closes the stable Task Tracking operational gap only. BAR-15/U18 remains
  the authority for moving Planning persistence from SQLite to PostgreSQL.

## Backend state — 2026-08-27 (stable Lark delivery repair)

- Root cause was deployment drift: stable enabled `lark` while omitting its
  webhook URL/signing secret/mention map. Seven auditable deliveries queued but
  no HTTP call was attempted. Application startup and the release-channel gate
  now reject that contradictory configuration.
- Stable text notifications expose the authenticated action actor, task title,
  bounded/escaped description, transition, assignee, assignment time, optional
  deadline remaining and workstream/timeline. Alias matching is limited to the
  three configured team members; unknown or task-supplied markup cannot create
  an `@` mention.
- The persisted seven-message backlog is retained as terminal/superseded audit
  evidence during rollout instead of flooding the Lark group. Interactive-card
  presentation is delegated by
  `LARK_MESSAGE_PRESENTATION_HANDOFF_2026-08-27.md`; it does not delay this
  delivery/configuration hotfix.

### Claude card follow-up

- Claude's `LARK_CARD_DESIGN_2026-08-27.md` is implemented behind the bounded
  `LARK_MESSAGE_FORMAT=text|card` deployment setting.
- Text and card rendering share one normalized field contract. Task content is
  always treated as untrusted text; only an allowlisted
  `LARK_ORG_USER_ID_MAP` entry may start assignee resolution.
- A rejected interactive card falls back to the exact text renderer once in
  the same outbox attempt. Network failures remain normal bounded retries and
  never cause a second immediate request.
- The Planning dev dependency set includes Starlette's current `httpx2` test
  transport explicitly; a clean 2026 resolver must not silently fall back to
  the deprecated `httpx` TestClient path and hang before application startup.

### Organization user_id mention resolution

- Bobby supplies stable, tenant-scoped organization `user_id` values rather
  than app-specific `open_id` values. The private Lark internal-app credential
  resolves `GET /contact/v3/users/{id}?user_id_type=user_id`; only the returned
  bounded `ou_...` value enters message markup and is cached in memory.
- The owner map may be partial: a blank value is filtered out intentionally,
  so Bobby can receive readable task updates without self-mentions while Stan
  and Thanhvuong remain tagged.
- Directory/token failures are fail-closed mention enrichment failures: the
  task notification still delivers with the escaped assignee name and never
  guesses or tags another user. IDs, tokens and response bodies are not logged.
- Plain text uses Lark's text mention syntax while interactive cards use the
  card-native `<at id=ou_...></at>` syntax. Unknown assignees remain plain text.
- Production Compose passes `LARK_APP_ID`, `LARK_APP_SECRET`, and
  `LARK_ORG_USER_ID_MAP`; the prior `LARK_MENTION_MAP` contract is removed.
  Runtime activation waits for Bobby to populate the private mode-0600 env.
  Roadmap backend regression evidence: 45/45 tests passed on 2026-08-28.
- The first redacted tenant probe accepted the app credential/token exchange
  (`HTTP 200`, Lark code `0`) but rejected both configured non-blank directory
  lookups with Lark code `99991672`. The Lark response lists
  `contact:contact.base:readonly` as the least-privilege alternative. Stable is
  intentionally unchanged until that app scope is approved/published and its
  Contact Data Scope includes the intended members.

## Backend state — 2026-08-27 (stable Bobby activation repair)

- Root cause: credential reset left an existing password hash in place while
  the activation login created a session with no durable record of which
  one-time credential authenticated it. Password change therefore compared the
  activation token with Bobby's old password hash and denied the valid flow.
- Each activation login now atomically consumes one token and stores only its
  activation identifier on the resulting session. Password change accepts only
  the exact consumed activation proof bound to that session; ordinary sessions
  still require the current Argon2id password. Reset accounts cannot keep using
  their old password while `must_change_password` is set.
- Migration `1723680000012` adds the nullable, unique session-to-activation
  proof link. Credential rotation revokes both unused and consumed activation
  records; no plaintext token is persisted or logged.

## Backend state — 2026-08-19 (v1.0.1 HMD mount permission hotfix)

- Root cause for WFO/three-window `PermissionError` was a numeric group
  mismatch: host ACL grants `primus-market-data-readers` GID `996`, while
  Portal Compose used `10001` (the container's own portal group). No market
  data, release manifest, reader wheel or QuantBT artifact was corrupt.
- `scripts/portal up|run` now fail before container creation when the rendered
  `/data:ro` bind, manifest or effective ACL cannot satisfy UID 10001 plus the
  configured reader GID. `scripts/portal hmd-doctor` verifies the installed
  wheel and accepted release under the exact Compose identity.
- Operational repair is to set `PORTAL_HMD_READER_GID` to the numeric host
  reader group and recreate `portal-api`; never chmod canonical storage
  world-readable. Real doctor, bounded market-data smoke, three-window and WFO
  regression evidence are required before merge.

## Backend state — 2026-08-23 (test sweep on feat/execution_loop — for codex)

Full backend sweep (portal pytest, roadmap, control-api 173, contracts, FE
1423, verify) found **5 failing backend gates — all tracking/stale, no
runtime logic errors**. Please regenerate/update:

1. `test_compat_parity.py::test_only_the_web_gateway_exposes_a_public_port` —
   compose.yaml restructured (control-api first + `control-api-migrate` /
   `control-api-bootstrap` one-shots); the test splits on `"portal-api:"` and
   now matches the image line instead of the service block. portal-api still
   `expose: 8000` (safe), web still the only public port — the test needs to
   anchor on the service block, not a substring.
2. `test_m0_freeze.py` (both tests) — `compose.yaml`, `deploy/nginx/portal.conf`,
   `.env.example` changed but `upgrade/backend/bar05/m0-freeze-manifest.json`
   was not regenerated (`python apps/portal/scripts/export_m0_freeze.py`).
3. `test_canonical_contracts.py::test_contracts_snapshot_digests_verify_every_tracked_file`
   — `packages/contracts/README.md` drifted from `contracts-snapshot.json`
   (regenerate with `packages/contracts/tooling/snapshot.py`).
4. `test_release_report.py::test_hygiene_scan_is_clean_and_detects_planted_secrets`
   — false positive: `scripts/control-api-provision-keyrings.sh:43` uses
   `query_secret="$(openssl rand -hex 32)"` (generates, never leaks); the
   scanner needs an exception for `$(openssl rand ...)` patterns.

Nothing else fails: portal backend 405 passed/1 skipped, control-api 173/173,
FE 1423 passed/1 skipped, verify-workspace pass.

## Backend state — 2026-08-24 (U10 QuantBT run-SSE façade cutover)

The five stale-gate findings above were closed by `04de84d`: parity anchoring,
M0/release manifests, contract snapshots and the hygiene false-positive were
regenerated or corrected before this slice. They are no longer open blockers.

`GET /api/runs/{run_id}/events` now follows the default U10 browser boundary:
Nginx → authenticated TypeScript Control API → signed internal principal →
private Python compatibility stream. The façade validates the canonical run ID,
keeps the upstream origin fixed, applies a bounded header/connect deadline,
rejects non-SSE responses, preserves no-buffer headers/backpressure and aborts
the upstream when the browser disconnects. `PORTAL_WEB_UPSTREAM=portal-api:8000`
remains the one-line gateway rollback.

The browser lifecycle now closes the EventSource on every error, including a
pre-open session rejection. This prevents native retry loops against the
session guard while retaining fast polling as the authoritative fallback. It
does not add a preflight request or change the façade/SSE wire contract.

This is the QuantBT Research progress stream, not EX-BE-06 Execution realtime;
no AWS-HK, source, projection, analytics or command flag changed. Fresh evidence:
TypeScript build, 20 Control API suites / 173 tests and PostgreSQL restore passed.
U11 still owns migration from the Python compatibility event source to committed
durable run/attempt events. Detailed evidence:
[`U10_QUANTBT_RUN_SSE_FACADE_CUTOVER.md`](./U10_QUANTBT_RUN_SSE_FACADE_CUTOVER.md).

## Backend state — 2026-08-26 (N11 external read publication gate)

- One consolidated request now enumerates all 24 known Trading System read
  capabilities needed by Execution Loop instead of emitting per-screen prose
  requests. Exact GET path, mTLS+delegated-JWT mode, scope, row/byte bounds,
  semantic rulings, schemas, fixtures and acceptance evidence are mandatory.
- The offline verifier binds actual regular schema/fixture bytes to the owner
  catalogue/corpus/manifest and rejects authority widening, invented hashes,
  secret-shaped fixtures and incomplete acceptance.
- The source-dark Rust adapter locks request/query/header/envelope behavior and
  keeps unpublished/denied/incompatible/retryable/unavailable distinct.
- Status is `PORTAL_REQUEST_GATE_AND_ADAPTER_COMPLETE /
  OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`; no source route, profile,
  network, secret, DB/Redis/CLI/broker or command authority changed. Detail:
  [`EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md`](./EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md).
- N11 is a machine annex of the official master owner request; it is not sent
  as an independent change request.

## Backend state — 2026-08-26 (N12 live command relay gate)

- One consolidated owner request defines nine exact Paper/Sandbox/Live
  command capabilities with separate R1/R2/R3/R4 policy and a dedicated
  command identity; it never derives authority from the CLI catalogue.
- The publication verifier binds real schema/request/accepted/terminal fixture
  bytes, source identity and negative/acceptance evidence. Acceptance still
  returns `portal_activation=false`.
- The Rust relay validates independent command flags/kill switch,
  operation-scoped delegation, target version, WebAuthn/dual approval and
  bounded routes. Its restart-safe journal keeps 202 non-terminal and preserves
  `UNCERTAIN` target locks without blind retry.
- Status is `PORTAL_COMMAND_PUBLICATION_GATE_AND_RELAY_COMPLETE /
  OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`; runtime flags remain false
  and TypeScript apply remains denied. Detail:
  [`EX_BE_05B_N12_LIVE_COMMAND_RELAY.md`](./EX_BE_05B_N12_LIVE_COMMAND_RELAY.md).
- N12 is a separately gated machine annex of the same official master owner
  request, not a second owner campaign.

## Backend state — 2026-08-26 (N13A source-dark staged activation)

- TypeScript now owns an authenticated, workspace-scoped plan/apply/verify
  boundary for seven independent delivery capabilities. Legal transitions,
  request-key replay, optimistic versions and affected-capability rollback are
  durable in isolated Portal PostgreSQL.
- Immutable evidence/signature/compatibility references are structurally
  validated but explicitly untrusted. Partial, stale, incompatible, denied,
  rollback and restart states are canonical contracts for Claude.
- Database constraints force effective profile `fixture`, source/runtime false,
  owner import false and kill switches engaged. N13A can apply only a rollback
  to fixture; real promotion remains a separately approved N13B operation.
- Status is `PORTAL_FOUNDATION_COMPLETE / SOURCE_DARK /
  N13B_REBASELINED_READY_FOR_OWNER_APPROVAL`. No AWS-HK/Trading System call, registry profile,
  network, secret or runtime flag changed. Detail:
  [`EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md`](./EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md).

## Backend state — 2026-08-26 (N14A Portal release authority)

- The exact protected-main Portal commit is bound to six immutable image
  digests, two isolated deployment profiles, source-dark compatibility,
  migration-chain evidence and a per-cell rollback contract.
- All images now publish SBOM/SLSA provenance, Trivy evidence and keyless
  signatures. A successful same-commit Portal CI check is mandatory before a
  candidate exists; CRITICAL findings block it and HIGH findings remain visible
  for explicit owner acceptance.
- Stable SGP is project `portal-stable`, port 18081, digest-only and owns
  distinct PostgreSQL/Roadmap/artifact volumes. Dev remains project `portal`,
  port 8080 and cannot route to or mutate stable state.
- Production requires an exact candidate run/manifest digest, protected
  environment acceptance and signed manifest/decision verification. The
  decision authorizes only source-dark Portal deployment.
- Evidence is 17/17 release/security tests, actionlint, Compose rendering and a
  real dev/stable/restore PostgreSQL backup/restore/forward-fix rehearsal.
- Status is `N14A_COMPLETE_SOURCE_DARK / PRODUCTION_INACTIVE`. N14B separately
  binds the exact current source/adapter/profile revisions selected by N13B; no
  AWS-HK/source/Query/SSE/command authority changed. Detail:
  [`EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md`](./EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md).

## Backend state — 2026-08-26 (N15A four-interface gateway)

- Query, Command, Event and Artifact are four independent versioned
  authorities; each has its own preferred/rollback version and typed
  compatible/unavailable/incompatible outcome.
- Read and command identities are distinct. Delegated assertions are exact
  resource scoped, short lived and replay protected; commands additionally
  require approved-operation binding.
- TLS1.3/HTTP2 transport blueprints are bounded and redirect-free. No request
  retries after dispatch, and Command never retries automatically.
- Event replay/gap/out-of-order/epoch semantics and Artifact
  digest/schema/size/access/expiry policy have pure Rust authorities and local
  failure corpora.
- OpenAPI is component-only with no path/server. The local double records
  `network_attempts=0`; no AWS-HK/Trading System call, listener, credential,
  migration or runtime flag was introduced.
- Status is `N15A_COMPLETE_SOURCE_DARK /
  N15B_READY_FOR_CURRENT_QUERY_ACCEPTANCE / PRODUCTION_INACTIVE`. N15B accepts
  each current interface/capability independently; an absent Event or Artifact
  publication does not block unrelated Query capability. Detail:
  [`EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md`](./EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md).

## Backend state — 2026-08-27 (N16A source-dark emergency routing)

- One logical Portal origin and `/ops/emergency/*` prefix are canonical, but
  origin selection is server-side and the route remains unmounted.
- Rust owns short-session/WebAuthn ceremony validation, R3/R4 separation,
  immutable audit and local Research/Cloudflare/execution-origin/rollback
  decisions. Every effective route target remains `NONE`.
- N12 R3 is unpublished, command identity is unbound and all controls plus
  PLAN/APPLY/VERIFY are false. R4 resume/scale is structurally forbidden.
- OpenAPI has no paths/servers; the Nginx template has no forwarding directive.
  No Cloudflare/DNS/tunnel/AWS/source/runtime changed and `network_attempts=0`.
- Status is `N16A_COMPLETE_SOURCE_DARK /
  N16B_REBASELINED_WAITING_SUPPORTED_COMMAND_SET / PRODUCTION_INACTIVE`. N16B
  maps only semantically equivalent current command primitives under a separate
  command identity and proves acknowledgement/reconciliation in a change window.
  Detail:
  [`EX_BE_19_N16A_SOURCE_DARK_ROUTING_AND_EMERGENCY_POLICY.md`](./EX_BE_19_N16A_SOURCE_DARK_ROUTING_AND_EMERGENCY_POLICY.md).

## Backend state — 2026-08-27 (N17A source-dark production/DR preparation)

- Pure Rust and canonical contracts now distinguish provisional interaction
  budgets from measured production SLO/error budgets and keep production RPO,
  RTO and monthly cost null/owner-gated.
- Recovery covers control DB encrypted PITR, projection deterministic rebuild
  and object-evidence hash restore. Five distinct identity families have
  bounded overlap, verify-before-revoke and command-first compromise policy.
- Unmounted alert/dashboard, capacity/retention/cost, owner and quarterly
  game-day blueprints contain no datasource, origin, secret or runtime binding.
- A real internal-only Docker drill proves WAL PITR to an exact LSN, encrypted
  logical restore, deterministic projection rebuild, identity rotation/
  compromise, release rollback and eight digest-sealed fault scenarios.
- Status is `N17A_COMPLETE_SOURCE_DARK /
  N17B_REBASELINED_WAITING_EXACT_ACCEPTED_SET / PRODUCTION_INACTIVE`. No
  stable/dev/AWS-HK/Trading System resource changed and every source/command/
  production flag remains false. Detail:
  [`EX_BE_20_N17A_SOURCE_DARK_PRODUCTION_DR_PREPARATION.md`](./EX_BE_20_N17A_SOURCE_DARK_PRODUCTION_DR_PREPARATION.md).

## Backend decision — 2026-08-29 (N13B–N17B source-as-is rebaseline)

- The canonical unified plan now treats the master owner return as a preferred
  capability/evidence catalogue, not a global blocker.
- Manager-v2, current Gateway APIs, current market/data services,
  Portal-owned control facts and versioned Portal derivations are valid bounded
  sources behind Rust compatibility adapters and TypeScript narrow APIs.
- N11 remains the Portal output contract. N13B starts with a machine-readable
  capability-to-source map and qualifies Paper/Sandbox/Live reads independently;
  Canary is Portal governance joined to Live facts.
- Read and command identities remain separate. Mutation, broker authority,
  production publication and Live risk still require exact independent gates.
- This decision changes documentation/status only. No runtime, source, profile,
  route, credential, command or stable deployment changed.

## Backend state — 2026-08-29 (N13B current-source staged activation)

- The canonical current-source map pins 4 profile interpretations, 16 fixed
  sources, 29 capabilities and 20 screens to the current Manager-v2/Gateway/
  market/Portal boundary.
- Rust validates the map and serves exact GET-only screen/source/relation reads
  with environment/profile/JWT/cursor/catalogue isolation. TypeScript provides
  the same-origin session BFF with independent Paper/Sandbox/Live configuration;
  Canary is a Portal-governance join over Live.
- Owner publication and real Paper runtime qualification manifests are
  digest-pinned. Sandbox source reachability with rows and Live source
  reachability with an empty result are retained as honest current evidence.
- Commands, Gateway market-latest and Historical/QDL adapters remain inactive;
  venue calendar remains honestly absent. Runtime profile flags and registry
  data modes remain unchanged until N14B.
- Status is `N13B_PORTAL_IMPLEMENTATION_ACCEPTED /
  CURRENT_SOURCE_SET_PINNED / PROFILE_RUNTIME_DARK_PENDING_N14B`. Detail:
  [`EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md`](./EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md).

## Backend state — 2026-08-29 (N14B immutable current-source compatibility)

- A separate immutable compatibility adjunct consumes and re-verifies the
  signed N14A candidate; N14A bytes are never edited or relabelled.
- The first bounded Paper target binds the N13B map/qualification/profile,
  thirteen adapter/config digests, exact Control API/Execution Edge/Source
  Proxy image digests and rollback/previous-adjunct chain.
- Eleven unit/negative tests, real candidate/rollback Compose renders,
  publication tests, actionlint and the full Portal gate pass.
- This accepts compatibility only. Runtime deployment, registry promotion,
  source/Query/SSE/command activation, Trading System release and database copy
  remain false.
- Status is `N14B_PORTAL_COMPATIBILITY_ACCEPTED /
  PROFILE_RUNTIME_NOT_ACTIVATED`; N15B current Query acceptance is next. Detail:
  [`EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md`](./EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md).
