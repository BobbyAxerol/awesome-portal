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

## 8. Backlog deep-dive (ghi bởi Claude — cập nhật 2026-08-17, slice v1.1)

Nguyên tắc giữ nguyên từ v1: "làm được luồng nào chắc luồng đó". Đây là
**markdown tracking của frontend** (`upgrade/**` là docs của codex, không sửa).
Mọi thứ frontend làm thêm ngoài plan đều phải xuất hiện ở §8.5.

### 8.1 Đã đóng trong slice v1.1

| Vùng | Thuộc mục | Đóng bằng gì |
|---|---|---|
| Gỡ INTERPRETATION / EVIDENCE / PORTAL PREVIEW | v1.1 §2.2 | Xoá khỏi bundle: feature module, route, tab, fragment HTML, CSS. Test chặn tái xuất hiện. |
| Roadmap màn | v1.1 §2.4 | Timeline thay bảng 24 cột `min-width:1240px`; delivery đếm từ task thật, phase không có task báo "chưa có task" chứ không phải 0%; concurrency + milestone marker; đọc được ở 4 breakpoint. |
| Mermaid | v1.1 §2.3 | Đọc token từ computed style thay 20 hex hard-code; node theo workstream ramp; scale theo container; nhãn theo type scale. |
| Task Board — font/tickbox | v1.1 §3.1, §3.2 | Một control family; type/spacing/radius scale; `Checkbox` đủ 5 state (checked/unchecked/indeterminate/disabled/loading), native semantics. |
| Task Board — tính năng | v1.1 §3.3 | Group theo milestone/workstream/owner; bulk transition; activity mở thẳng từ card; đếm task + đếm đã chọn theo cột. |
| Task Board — flow kéo thả | v1.1 §3.4 | Optimistic apply → rollback nguyên snapshot khi lỗi; insertion line cho vị trí drop; Alt+Arrow là đường bàn phím tương đương. |
| Webhook feedback | v1.1 §5 | Toast nói thông báo **đã xếp hàng** (không phải đã gửi — FE không quan sát được outbox). Test quét DOM chặn mọi chuỗi webhook/secret. |
| Portal Map — persona filter | v0.4 §P0.15 | Đọc `lifecycle_stages[].personas` do backend khai báo. |
| Chart envelope — toàn bộ result tab | v0.5 §12.2 | 7 `ChartFigure` còn lại (Optimization ×4, Parameters ×3, Execution ×2) đều mang envelope. Không còn chart nào dùng `sourceId` trần. |
| Contract typed | §8.3 request 1–3 | Regenerate types + narrow tới generated schema; `SummaryMetric` thành alias của `EvidenceValue`. |
| **Visual baseline** | v0.4 §26–§27, U02 exit gate | Playwright cho `apps/portal/frontend`: 39 snapshot = 4 màn × 4 breakpoint × 2 theme + print + 3 summary state. Đã verify tái lập (39/39 pass sau khi record). Runner: `scripts/portal-web-visual.sh`. |
| **Operations Dark review** | v0.4 §26, v0.5 §10.2 | Xong cùng visual baseline. Xác nhận workstream ramp render đúng trên board nhúng trong shell dark. |
| **Run Progress §12.2** | v0.5 §12.2, §8.3 request 5 | Fold Gantt có provenance footer (`config/fold_plan.json` · protocol · số fold · as-of · analysis-frame digest); plan cũ chưa có field thì ghi "chưa công bố". |
| **Trials envelope** | §8.3 request 4 | `{total_rows, returned_rows, rows}`; bỏ suy luận `length >= cap`; chart đếm theo **artifact population**, không theo trang được trả. |

### 8.2 Còn treo

| Vùng | Trạng thái | Vì sao chưa sâu | Slice đề xuất |
|---|---|---|---|
| Import Wizard (U14) | Chưa có UI. Picker đã đọc `/api/v1/alphas` (typed); alpha chưa đăng ký runtime hiển thị kèm lý do. | Backend slice `POST /api/v1/alphas/import` + quarantine pipeline chưa có (strategy contract §6). Làm UI trước sẽ là form không có authority. | Sau BAR-21: Import Flow A/B, digest verify, quarantine state. |
| Command Center | Đủ 7 state, số liệu thật từ summary. Chưa có drill-down drawer. | Read model bền thuộc U10; drawer không có nguồn ổn định để mở. | Sau U10: evidence drawer + cross-filter. |
| Planning: Docs / Reports | Nhúng nguyên feature body. Token và form control đã dùng chung; Reports vẫn render fragment HTML legacy đã khoá. | Fragment là bản byte-preserved của tài liệu gốc, refactor sẽ phá content-integrity hash. | Slice "Reports như dữ liệu" — parse fragment thành model rồi render bằng primitive, giữ hash của nguồn. |
| Profile & Access | `COMMISSIONED` preview. | Chờ U07 wire gateway→BFF; login screens 01B/01C/01D chưa có backend. | Sau U10: Frames 01B–01D + session expired + maintenance screen kèm request ID. |
| Visual baseline — độ phủ | Có 4 màn. **Chưa** có: New Run flow (6 step), Results tabs (Overview/Optimization/Parameters/Execution), Run Progress. | Các màn đó cần stub `/api/runs/*` (summary, series, trials, audit, fold-plan) — nhiều fixture hơn hẳn 4 màn đầu, và hiện repo **không có fixture run nào** dưới `registry/fixtures/`. | Slice "run fixtures": xin backend 1 bộ fixture run hoàn chỉnh (xem request 6), rồi mở rộng matrix. |
| Run Progress — live states | Fold Gantt đã có provenance. Console/ETA/progress strip chưa vào visual baseline. | Phụ thuộc run fixtures như trên; trạng thái live còn phụ thuộc thời gian nên cần freeze clock + fixture theo từng stage. | Cùng slice "run fixtures". |

### 8.3 Backend request

**Đã đóng** (codex giao trong `5e1ff6d`, frontend thu ở `ff5ddf8` + `a631205`):

1. ~~Schema cho `/api/v1/alphas` và `/api/v1/portal/capabilities`~~ → `AlphaRegistryDocument`,
   `EngineCapabilitiesDocument`. Frontend đã narrow tới generated type; đổi tên
   field ở backend giờ là lỗi build chứ không phải `undefined` âm thầm.
2. ~~`source_rows` trên `SeriesPayload`~~ → có cả `source_rows`,
   `returned_rows`, `downsample_stride`. Đây là thứ mở khoá chart envelope
   rollout ở §8.1.
3. ~~`persona` cho lifecycle stage~~ → `lifecycle_stages[].personas`
   (projection-derived, schema-optional, default `[]`). Roll-up tạm ở frontend
   đã xoá.

4. ~~`total_rows` cho `wfo/trials`~~ → envelope `{total_rows, returned_rows, rows}`.
   Suy luận `length >= cap` đã xoá; chart đếm theo artifact population.
5. ~~`as_of` / `source_artifact_digest` cho `fold-plan`~~ → có trong
   `producer`. Fold Gantt đã cite được.

**Còn treo (mới, @codex):**

6. **Response schema cho hai endpoint mới.** Cả
   `GET /api/runs/{id}/wfo/trials` và `GET /api/runs/{id}/fold-plan` vẫn trả
   `{additionalProperties: true}` trong OpenAPI, nên codegen không sinh type —
   frontend lại phải khai `TrialsPayload` / `RunFoldPlan.producer` bằng tay ở
   `src/lib/api.ts`. **Đúng cùng một lớp vấn đề như request 1** (alphas/
   capabilities), đã được giải quyết ở đó bằng cách đặt tên schema. Đề xuất
   `TrialsEnvelope` + `FoldPlanDocument` (kèm `ArtifactProducer`) trong
   `components/schemas`. Không phải blocker — chỉ là chỗ rename ở backend sẽ
   im lặng thành `undefined` thay vì lỗi build.
7. **Fixture cho một run hoàn chỉnh.** `registry/fixtures/` có registry/summary/
   links nhưng không có run nào, nên visual baseline không phủ được New Run,
   Results tabs và Run Progress (xem §8.2). Đề xuất một bộ fixture read-only
   cho 1 run `advanced_walk_forward` đã completed: `runs/{id}` detail, `summary`,
   `audit`, `fold-plan`, `wfo/trials`, `wfo/candidates`, `wfo/folds`,
   `wfo/parameters`, `selection/trace`, `series/{is,oos,holdout_live,stitched}`,
   `presentation/{calendar,rebased}`, `ledger`, `progress`, `console`.
   Cho màn New Run cần thêm `/api/datasets` và `/api/config/options`
   (`alphas.v1.json` + `engine-capabilities.v1.json` đã có; `data-catalog.v1.json`
   **không** cùng shape với `/api/datasets`). Cùng nguồn canonical như các
   fixture hiện có.
8. **Envelope cho `wfo/candidates` và `wfo/folds`.** Hai endpoint này nhận
   `top_n` nhưng trả `list[dict]` trần — không có cách nào biết đã bị cắt hay
   chưa. Hiện FE gọi **không** truyền `top_n` nên `available = rows.length` là
   đúng, nhưng đó là đúng do tình cờ: thêm `top_n` ở bất kỳ đâu (hoặc backend
   đặt cap mặc định) là dòng provenance lập tức thành sai — đúng failure mode
   mà `wfo/trials` vừa sửa. Đề xuất cùng envelope
   `{total_rows, returned_rows, rows}` cho cả hai, để câu chuyện §12.2 nhất
   quán trên mọi chart đọc từ table.
9. **`POST /api/v1/alphas/import` + quarantine pipeline** (strategy contract §6)
   — chặn Import Wizard U14. Cần: nhận artifact + manifest, verify digest, đặt
   alpha vào `quarantined` cho tới khi certify, và một endpoint đọc trạng thái
   import để UI hiển thị tiến trình. Chưa có thì làm UI trước sẽ là form không
   có authority (đã ghi ở §8.2 từ v1, nay nâng thành request chính thức).

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
   §2.1 ("không viết lại nội dung"). v1.1 gỡ **ba màn** và giữ node trong tài
   liệu gốc. **Cần Bobby quyết** nếu muốn sửa cả tài liệu gốc — việc đó phải
   đi kèm regenerate manifest và là thay đổi nội dung, không phải thay đổi UI.

### 8.5 Việc làm thêm ngoài plan (track theo CLAUDE.md §7.3)

| Việc | Vì sao làm | Bằng chứng |
|---|---|---|
| Gate `design-tokens.test.ts` (Planning) | "Không style lẻ" chỉ đúng nếu có kiểm. Gate chặn colour literal ngoài `tokens.css` và chặn dark ramp tái dùng giá trị light. | Bắt được 4 vi phạm thật khi viết. |
| Gate token parity Portal ↔ Planning | Portal import `features.css` của Planning nhưng **không** import `tokens.css`; token mới của v1.1 chỉ có ở Planning → board/timeline nhúng trong shell mất màu. | Bản gate đầu **rỗng** (chỉ quét CSS, `--ws-*` đi qua inline style TSX). Bản hiện tại negative-test: xoá `--ws-1..8` fail, xoá `--text-sm` fail. |
| Workstream categorical ramp (8 hue × 2 theme) | Mermaid + roadmap + task card cần identity colour; Fund Paper chưa có ramp categorical nào. | Validate OKLab + CVD Machado-Oliveira-Fernandes severity 1.0. Cả 2 mode pass 6/6 check, không WARN. Dark re-step riêng cho từng surface (`#182031`, `#161e2a`). |
| `lib/workstream.ts` — slot cố định, không cycle | Hue thứ 9 mà lặp lại sẽ nói dối rằng hai workstream là một. Slot tính từ **toàn bộ** task set nên lọc không repaint. | Workstream thứ 9+ nhận `--ws-other` + luôn kèm nhãn chữ. |
| Alt+Arrow chuyển cột trên task card | Drag-and-drop là affordance chỉ-chuột; đây là primary action của board (v0.4 §26.4). | Test bàn phím trong `task-board-drag.test.tsx`. |
| Đường "giảm điểm: chưa rõ phương pháp" | Dòng cũ hard-code "server max_points", khẳng định một phương pháp mà FE không biết. | Test chặn chuỗi `max_points` xuất hiện khi không có method. |
| Cảnh báo `top_n=5000` trên chart trial | Cap của query là thuộc tính của dữ liệu chart, không phải chi tiết fetch. | Hiện là **suy luận** → đã mở backend request 4 để biến thành khai báo. |
| Regenerate `packages/contracts/generated/portal-api.d.ts` | Codex cập nhật OpenAPI nhưng chưa regenerate types (+202 dòng). Bước cơ học theo CLAUDE.md §7.6. | `cd packages/contracts && npm run generate`. |

| Playwright cho Portal + `scripts/portal-web-visual.sh` | U02 exit gate cần bằng chứng thị giác; runner đóng gói theo đúng image pinned nên baseline so sánh được giữa máy. | 39 snapshot, verify tái lập 39/39. **Chưa wire vào `ci.yml`** — file đó là của codex và vừa được sửa; đề xuất thêm step ở §8.6. |
| 4 defect do visual baseline phát hiện | Không unit test nào thấy được. | (1) chip `tone` mâu thuẫn màu swatch trên **cả 6** phase; (2) label bar bị cắt "W…" khi phase ≤ 12% timeline; (3) print còn hiện action (§26.6); (4) Delete cạnh Edit (§13). Đã sửa cả 4 + 3 unit test khoá lại. |
| Print rule phải viết ở **cả hai** print.css | Portal load `features.css`/`legacy-views.css` của Planning nhưng **không** load `print.css` của nó. Sửa chỉ một bên thì màn Planning nhúng vẫn in ra kèm nút. | Cùng lớp bug với token parity. Đã ghi rule ở cả hai file. |
| `trialsPopulation()` tách khỏi view | Cùng một quyết định "đã bị truncate chưa" sắp bị viết hai lần ở Optimization và Parameters. | 3 unit test, gồm case artifact **đúng bằng** cap (case mà suy luận cũ sai). |
| Giữ nút `×` xoá task trên card | §13 nói destructive không cạnh row action thường. Nút này có từ trước v1.1, tách rời thị giác (góc trên phải, chỉ hiện khi hover) và có `window.confirm`. | Đã review, giữ nguyên có lý do; khác với Edit/Delete kề nhau ở roadmap row nên đã sửa chỗ đó. |

### 8.6 Đề xuất slice kế tiếp

1. **Run fixtures + mở rộng visual baseline** (ưu tiên 1) — cần backend request 7.
   Đây là mảng lớn nhất còn thiếu bằng chứng thị giác: New Run 6 step, 4 Results
   tab và Run Progress. Không thể tự bịa fixture run (rule §3.2/§3.5), nên phải
   xin bộ fixture canonical trước.
2. **Wire visual baseline vào CI** — thêm step `scripts/portal-web-visual.sh`
   vào `.github/workflows/ci.yml`. FE không sửa file đó; đề nghị codex thêm cạnh
   `contracts-test` / `control-api-test`. Không có step này thì baseline chỉ
   chạy khi có người nhớ chạy.
3. **Reports như dữ liệu** — gỡ nốt fragment HTML legacy cuối cùng khỏi Planning
   mà vẫn giữ content-integrity hash của nguồn.
4. **Request 6** — đặt tên schema cho hai endpoint mới để bỏ nốt hai type khai
   tay trong `src/lib/api.ts`.
