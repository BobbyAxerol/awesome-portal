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
  bundle 17 files, redelivery không duplicate). ADR-004/006 Proposed. Kế
  tiếp là BAR-09 (U12 engine capability authority).

Agent chỉ được implement deep dive khi phase tương ứng đang active và owner đã
giao scope. Tài liệu của phase sau là thiết kế trước, không phải implementation
authority.
