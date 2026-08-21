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
  — Execution Loop phases 1–2. **Operational evidence pending:** TypeScript /
  PostgreSQL approval inbox, immutable evidence/findings/decisions, R1
  plan→apply→poll, SoD, idempotency, optimistic concurrency, audit/outbox and
  independent rotatable HMAC keyrings are implemented. Linked Research and
  Execution panels remain explicitly unavailable; registry profile remains
  `fixture`. Strict typecheck and token/keyring tests pass; the final fresh-PG
  rerun is not claimed because this runner cannot access Docker.

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
- `EX-BE-05a` **implementation complete / operational evidence pending:**
  Approval Inbox và Gate R1 đã có PostgreSQL repository + session/RBAC/CSRF API,
  evidence-bound immutable decision workflow, audit/outbox và plan/apply/poll.
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
- Backend tiếp theo là `EX-BE-03`: projection schema, reducer, cursor/epoch,
  replay/snapshot và freshness evaluator. Runtime evidence luôn thắng schema/
  rollout prose; Portal chỉ dùng versioned HTTP API, không đọc DB/Redis/CLI.

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
