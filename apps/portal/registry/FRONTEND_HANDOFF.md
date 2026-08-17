# Frontend Contract Handoff — Portal Registry & Command Center Summary

> **Slice:** BAR-01-BE6 · **Version:** 1 · **Updated:** 2026-08-15
> **Cho:** frontend agent của U02 Shared Foundations và U03 Unified Shell.
> **Authority:** [BAR-01 deep dive](../../../upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md).
> **Runtime hiện tại:** FastAPI compatibility bridge; target Control API
> (TypeScript) giữ nguyên contract này trong các phase sau.

## 1. Hai endpoint public

| Endpoint | Method | Cache | Body |
| --- | --- | --- | --- |
| `/api/v1/portal/registry` | GET | `ETag` + `Cache-Control: no-cache, must-revalidate` + `Vary: Authorization, Cookie` | `portal.registry.v1` |
| `/api/v1/portal/summary` | GET | `Cache-Control: no-store` + `Vary: Authorization, Cookie` | `portal.summary.v1` |
| `/api/v1/portal/links` | GET | `ETag` + `Cache-Control: no-cache, must-revalidate` + `Vary: Authorization, Cookie` | `portal.links.v1` |

Cả hai endpoint đều **read-only**, **không nhận query/header/body input** để
chọn upstream hay file. `Vary: Authorization, Cookie` là future-auth-safe:
khi U07 thêm identity filtering, cache không trả nhầm giữa các visibility
class.

### Registry: ETag và invalidation

- Response luôn kèm strong ETag `"sha256:<content_digest>"` — chính là
  `content_digest` trong body.
- Gửi `If-None-Match: <etag>` → `304` (body rỗng). Hỗ trợ exact, `W/`, list
  và `*`.
- Digest chỉ đổi khi nội dung public registry đổi (revision mới, HIDDEN
  filtering đổi). `served_at`/volatile không bao giờ đổi digest.
- **Không** đặt cache time = source time; luôn revalidate.

### Summary: luôn dynamic

- `no-store`: mỗi request là một snapshot mới (`requested_at` →
  `completed_at`). Không có query key nào hiện tại.
- Không có ETag/304 cho summary trong BAR-01.
- Không retry client-side trong response loop: server đã có hard deadline
  (default 500 ms) và không retry upstream. Nếu cần làm mới, gọi lại
  endpoint.

### Links: cross-link sidecar (BAR-02, U05)

- `GET /api/v1/portal/links` trả `portal.links.v1`: mapping feature/screen/
  concern ↔ `roadmap_epic_id`, `planning_task_ids`, `figma_frame_id`,
  `repository_scope`, `prototype_route`, `activation_gate` + block `integrity`
  (đếm coverage, `dangling_links` luôn 0 vì sidecar validated lúc startup).
- Cùng ETag/304 semantics như registry; dùng cho Feature preview → `Open
  roadmap epic/tasks` và Task drawer → `Open Portal screen` ở U05.
- `planning_task_ids` rỗng nghĩa là chưa có authority mapping — UI không bịa
  link. External existence check với Planning API chờ U05 proper.
- Sidecar là temporary overlay; sẽ migrate vào Planning/PostgreSQL authority
  ở phase sau. Không merge với localStorage.

### Lỗi

- `500` trả envelope typed:
  `{"error": {"code": "SUMMARY_CONTRACT_FAILURE", "message": "..."}, "request_id": "<id>"}`
  (model `PortalErrorResponse` trong OpenAPI). Không có retry ngầm.
- Mọi response (kể cả lỗi) kèm header `X-Request-ID` và `traceparent` (W3C);
  `request_id` trong body = `X-Request-ID` header — dùng để báo lỗi/external
  maintenance screen. Backend accept `X-Request-ID`/`traceparent` hợp lệ từ
  gateway (nginx `$request_id`), nếu không sẽ tự sinh; giá trị unsafe bị thay.
- `4xx` khác: FastAPI mặc định + `request_id`. Registry invalid không xảy ra
  lúc runtime — service không ready khi registry lỗi.
- `/api/diagnostics` (BAR-03) trả dependency states an toàn (không path,
  hostname, secret) kèm `request_id`/`traceparent` của chính request đó.

## 2. Generate types từ OpenAPI — không viết model tay thứ hai

Canonical OpenAPI 3.1: `registry/openapi/portal-api.openapi.json` (tái sinh
bằng `apps/portal/scripts/export_handoff_contract.py`). Toàn bộ
`PortalRegistryDocument`, `PortalSummaryV1` và `PortalErrorResponse` nằm
trong `components/schemas` — đủ để generate typed client:

```bash
npx @hey-api/openapi-ts -i apps/portal/registry/openapi/portal-api.openapi.json -o apps/portal/frontend/src/portal-contracts
# hoặc npx openapi-typescript
```

Rule bắt buộc:

- Sidebar, command palette, route fallback, preview, task links và telemetry
  IDs đọc từ registry endpoint — **không** hard-code feature list thứ hai.
- Bootstrap route được hard-code duy nhất: loading, registry-error, auth
  callback, not-authorized, not-found.

## 3. FeatureMaturity vs AvailabilityState

| Registry `maturity` (metadata tĩnh) | Ý nghĩa |
| --- | --- |
| `AVAILABLE` | implementation + phase evidence hiện có |
| `PROTOTYPE` | interactive subset; thiếu authority phải hiển thị |
| `COMMISSIONED` | designed/planned; chỉ preview, compute/mutation disabled |
| `BLOCKED` | có gate chưa giải quyết rõ |
| `HIDDEN` | **không bao giờ rời backend** trong BAR-01 |
| `DEPRECATED` | chỉ compatibility route |

| Summary `availability.state` (runtime) | Ý nghĩa UI |
| --- | --- |
| `available` | badge xanh, metric render từ `value` |
| `degraded` | một phần nguồn lỗi; badge vàng; phần lỗi hiển thị `unavailable` |
| `stale` | evidence cũ hơn freshness contract; hiển thị `as_of` rõ ràng |
| `unavailable` | badge xám + `reason_code`/`detail`; **không render số 0** |
| `denied` | badge khóa + `PERMISSION_DENIED`; không retry tự động |
| `commissioned` | card preview/brief chỉ từ registry; không claim runtime |

`maturity=AVAILABLE` **không** nghĩa là dependency đang reachable — badge
runtime luôn dùng `availability.state`, không dùng maturity.

**Ngữ nghĩa `environments` (chốt theo quyết định codex):** là danh sách môi
trường nơi feature **được phép chạy/liệt kê khi có runtime**. Feature
`COMMISSIONED` (brief/wireframe) luôn hiển thị ở mọi môi trường — filter
environment chỉ áp cho feature có runtime (`AVAILABLE`/`PROTOTYPE`/
`DEPRECATED`). Ví dụ `PAPER_TRADING` khai `["paper"]` vì chỉ chạy ở paper,
nhưng nhóm Deployments vẫn thấy brief của nó khi đang ở môi trường research.

## 4. States bắt buộc và fixtures

Canonical fixtures (schema-validated, deterministic) ở
`registry/fixtures/`:

| Fixture | Kịch bản | `overall` |
| --- | --- | --- |
| `summary.healthy.json` | QuantBT + Planning available | `available` |
| `summary.empty.json` | Run library/task db rỗng | `available` (zero thật) |
| `summary.partial.json` | Planning `LOCAL_ONLY_STATE` (default local stack) | `degraded` |
| `summary.denied.json` | Planning 403 | `degraded` |
| `summary.stale.json` | Ví dụ contract `stale` (adapter hiện tại chưa emit) | `degraded` |
| `summary.unavailable.json` | Cả hai nguồn down | `unavailable` |
| `registry.public.json` | Public registry thật | — |
| `links.public.json` | Cross-link sidecar + integrity block | — |

UI phải phân biệt rõ **loading / empty / partial / stale / denied /
unavailable / terminal failure** — không gộp trạng thái.

Rule hiển thị:

- `value: null` + `unavailable/denied/commissioned` → render badge + lý do,
  **không bao giờ** biến thành `0`, `-`, hoặc "N/A" như một giá trị số.
- `0` chỉ xuất hiện khi `value` thực sự là 0 với state `available`.
- Card target (Alpha, Data Catalog, Approval, Paper, Sandbox, Live) giữ
  `COMMISSIONED` + brief từ registry; không render metric giả.
- **Không** merge Planning localStorage vào shared server summary.

## 5. Priority items và route constraints

Chỉ 3 type hiện được ủy quyền, thứ tự ưu tiên:

1. `RUN_FAILED` — failed run được evidence bởi run status.
2. `HISTORICAL_DATA_UNAVAILABLE` — Historical down cho backtest feature
   available.
3. `REGISTRY_BLOCKING_CONCERN` — source-controlled blocking concern.

- Planning hiện tại **không** sinh blocker/incident; task status chỉ
  Backlog/Ready/In Progress/Validating/Done.
- `route` trong link/priority luôn từ validated registry (canonical route
  hoặc template `:runId` đã validate). UI mở link trực tiếp; không nhận
  arbitrary URL từ response vào navigation.
- Tie-break trong cùng type: `observed_at` desc → `id` asc (đã sort sẵn).

## 6. Contracts tham chiếu

- `schemas/portal-registry-source.v1.schema.json` — validate file nguồn.
- `schemas/portal-registry.v1.schema.json` — validate public response.
- `schemas/portal-summary.v1.schema.json` — validate summary response.
- `schemas/portal-links.v1.schema.json` — validate cross-link sidecar.
- Tất cả dùng Draft 2020-12, `additionalProperties: false` — field lạ là
  breaking change; additive change yêu cầu bump `revision` (registry) và
  compatible window khi đổi schema major.

## 7. Non-goals hiện tại

- Không có auth/RBAC (U07), không Command Center read model bền (U10),
  không durable queue (U11).
- Permission arrays trong registry là **descriptive**, không phải
  enforcement.
- Frontend không suy diễn backend health/permission/financial state.

## 8. Backlog deep-dive (ghi bởi Claude — cập nhật ở slice v1.1)

Nguyên tắc giữ nguyên từ v1: "làm được luồng nào chắc luồng đó". Mục này
liệt kê phần **làm ở mức đủ dùng nhưng chưa deep-dive**, kèm lý do và slice
đề xuất kế tiếp theo v0.5 §10–§12. Không có placeholder ẩn: mọi màn chưa
implement đều là `COMMISSIONED` trong registry và mở ra Feature Preview.

### 8.1 Đã đóng trong slice v1.1

| Vùng | Đóng bằng gì |
|---|---|
| Planning: Roadmap | Timeline mới thay bảng 24 cột `min-width:1240px`; delivery đếm từ task thật, phase không có task báo "chưa có task" chứ không phải 0%; concurrency + milestone marker; đọc được ở 4 breakpoint. |
| Planning: Task Board | Drag optimistic + rollback nguyên snapshot; drop có vị trí (insertion line); Alt+Arrow là đường bàn phím tương đương; group theo milestone/workstream/owner; bulk transition; activity mở thẳng từ card. |
| Design system Planning | Một control family (`.input`), type/spacing/radius scale, `Checkbox` đủ 5 state, `Select`/`Textarea`/`Field`; gate `design-tokens.test.ts` chặn colour literal ngoài `tokens.css`. |
| Mermaid | Đọc token từ computed style thay vì 20 hex hard-code; node theo workstream ramp; scale theo container. |
| INTERPRETATION / EVIDENCE / PORTAL PREVIEW | Gỡ sạch khỏi bundle: feature module, route, tab, fragment HTML, CSS. Test chặn tái xuất hiện. |
| Portal Map — persona filter | Có filter persona, roll-up từ `screens[].primary_persona` (xem 8.3 điểm 3 để biết vì sao vẫn còn backend request). |

### 8.2 Còn treo

| Vùng | Trạng thái | Vì sao chưa sâu | Slice đề xuất |
|---|---|---|---|
| Import Wizard (U14) | Chưa có UI. Picker đã đọc `/api/v1/alphas`; alpha chưa đăng ký runtime hiển thị kèm lý do. | Backend slice `POST /api/v1/alphas/import` + quarantine pipeline chưa có (strategy contract §6). Làm UI trước sẽ là form không có authority. | Sau BAR-21: Import Flow A/B, digest verify, quarantine state. |
| Run Progress | Giữ nguyên bản v0.1.1 (console + fold Gantt). | Đã hoạt động; chưa áp §12 envelope vì fold Gantt vẽ từ fold plan chứ không từ series artifact. | Chuẩn hoá Gantt theo §12.2, thêm as-of/digest, ETA có confidence. |
| Optimization / Parameters / Execution tabs | Chart chưa mang envelope §12.2 đầy đủ (mới có ở Overview: 7 `ChartFigure` còn dùng `sourceId` string thay vì `provenance`). | Cần trial-level provenance mà artifact hiện chưa expose per-chart, và `SeriesPayload` chưa có `source_rows` (backend request 2) nên envelope sẽ không nói thật được về downsample. | Một slice "chart envelope rollout" sau khi backend request 2 xong. |
| Command Center | Đủ 7 state, số liệu thật từ summary. Chưa có drill-down drawer. | Read model bền thuộc U10; drawer không có nguồn ổn định để mở. | Sau U10: evidence drawer + cross-filter. |
| Planning: Docs / Reports | Nhúng nguyên feature body. Token và form control đã dùng chung sau v1.1; Reports vẫn render fragment HTML legacy đã khoá. | Fragment là bản byte-preserved của tài liệu gốc, refactor sẽ phá content-integrity hash. | Slice "Reports như dữ liệu" — parse fragment thành model rồi render bằng primitive, giữ hash của nguồn. |
| Profile & Access | `COMMISSIONED` preview. | Chờ U07 wire gateway→BFF; login screens 01B/01C/01D chưa có backend. | Sau U10: Frames 01B–01D + session expired + maintenance screen kèm request ID. |
| Visual baseline 4 breakpoint × 3 theme | Chưa có. Playwright đã chạy được cho Planning (2 e2e xanh, image `mcr.microsoft.com/playwright`), nhưng `apps/portal/frontend` chưa có e2e project nào. | Cần dựng Playwright cho Portal + baseline screenshot; là slice riêng, không nhét vào slice UI. | Slice "visual baseline": Playwright cho Portal, screenshot Research Light / Operations Dark / Print. |
| Operations Dark | Token đầy đủ và có parity test giữa hai token file; chưa review thị giác từng màn. | Chưa có visual baseline (trên). | Đi kèm slice visual baseline. |

### 8.3 Backend request còn treo (@codex)

1. `/api/v1/alphas` và `/api/v1/portal/capabilities` chưa có schema trong
   `components/schemas` — codegen ra `unknown`. Frontend đang narrow ở boundary
   (`portal/strategyCatalog.ts`) và có test theo file registry thật. Đề xuất
   đặt tên `AlphaRegistryDocument` + `EngineCapabilityDocument`.
   *(Kiểm lại 2026-08-17: vẫn chưa có.)*
2. `SeriesPayload` chưa công bố `source_rows` — chart envelope §12.2 cần
   "source_rows/returned_rows" để nói thật về downsample. Hiện UI hiển thị
   returned = source khi thiếu field, tức không khẳng định có downsample.
   Đây là thứ chặn slice "chart envelope rollout" ở 8.2.
   *(Kiểm lại 2026-08-17: vẫn chưa có.)*
3. `lifecycle_stages[]` chưa có `persona`. v1.1 đã làm filter bằng cách roll-up
   `screens[].primary_persona` qua `feature_ids` của stage, và UI ghi rõ nguồn
   ("persona (từ screen): …"). Hạn chế còn lại: stage **không có screen nào**
   thì không có persona để lọc — UI hiện giữ nguyên stage đó thay vì ẩn, vì
   registry chưa nói stage đó không liên quan tới persona nào. Một field
   `persona` ở stage sẽ biến suy luận này thành khai báo.

### 8.4 Discrepancy ghi nhận (v1.1)

1. Plan v1.1 §2.1 ghi tài liệu gốc ở
   `features/roadmap-task-board/backend/quant_trading_ecosystem_architecture_migration_portal_vi.html`.
   Thực tế file nằm ở `features/roadmap-task-board/` (gốc feature), và
   `legacy/portal.html` là bản byte-identical
   (`sha256 3ed4e5eb62edccfdb825c9bd52fbc436b11155c6510a666b7e79b04d3621d8c0`
   cho cả hai, khớp `source_sha256` trong content-integrity manifest).
   Nội dung 16/16 doc page khớp đúng bản gốc — **không có page nào lệch hay
   mất**, nên không sửa content.
2. Plan v1.1 §2.2 yêu cầu gỡ EVIDENCE "kể cả node mermaid Backtest Evidence
   Bundle". Node đó nằm trong doc page
   `3-research-alpha-development-runtime-layer` §3.7, là artifact kiến trúc
   giữa `QuantBT Worker` → `Quant / Risk / Manager Review`, không phải một
   phần của màn Evidence. Nó bị khoá bởi content-integrity hash và bởi chính
   §2.1 ("không viết lại nội dung"). v1.1 gỡ **ba màn** (Interpretation,
   Evidence & Source Map, Portal Preview) và giữ node trong tài liệu gốc.
   Cần Bobby quyết nếu muốn sửa cả tài liệu gốc — việc đó phải đi kèm
   regenerate manifest và là thay đổi nội dung, không phải thay đổi UI.
