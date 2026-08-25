# Backend Architecture Deep Dives

Các tài liệu trong thư mục này triển khai chi tiết từng `BAR-*` slice của
[Backend Architecture Implementation Guide](../BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md).
Chúng không thay thế phase hoặc exit gate trong
[Unified Implementation Plan](../UNIFIED_IMPLEMENTATION_PLAN.md).

## Active deep dives

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
  Allow. After the owner reported attaching revision 2, the exact 2026-08-24
  verifier still returned `UnauthorizedOperation`. Status is therefore
  `REVISION_2_REPORTED_ATTACHED / EFFECTIVE_ALLOW_NOT_PROVEN /
  LIVE_D2_UNAUTHORIZED`. The owner must verify the policy is attached under the
  existing role's Permissions policies, is the managed-policy default version,
  and is not denied by a permissions boundary/SCP. The role is retained until
  the D2 change window; no detach/delete workaround is allowed. Evidence:
  [`EX_BE_02_D2_IAM_POLICY_REVISION_2.md`](./EX_BE_02_D2_IAM_POLICY_REVISION_2.md).
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
  fixed image reports zero HIGH/CRITICAL findings. IAM DryRun is still
  unauthorized, so no AWS/runtime state changed and D2 remains closed. Evidence:
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
  Manifest, JSON and exact-file-set checks pass. No Rust adapter/ingestor,
  Source Proxy activation, credential, source request, projection epoch or
  registry change is included.
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

This is the QuantBT Research progress stream, not EX-BE-06 Execution realtime;
no AWS-HK, source, projection, analytics or command flag changed. Fresh evidence:
TypeScript build, 20 Control API suites / 173 tests and PostgreSQL restore passed.
U11 still owns migration from the Python compatibility event source to committed
durable run/attempt events. Detailed evidence:
[`U10_QUANTBT_RUN_SSE_FACADE_CUTOVER.md`](./U10_QUANTBT_RUN_SSE_FACADE_CUTOVER.md).
