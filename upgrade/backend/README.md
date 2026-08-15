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
  health/ready/diagnostics/error. Kế tiếp là BAR-04 (U07 thin identity BFF).

Agent chỉ được implement deep dive khi phase tương ứng đang active và owner đã
giao scope. Tài liệu của phase sau là thiết kế trước, không phải implementation
authority.
