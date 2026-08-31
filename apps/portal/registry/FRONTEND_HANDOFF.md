# Frontend Contract Handoff — Portal Registry & Command Center Summary

> **Slice:** BAR-01-BE6 · **Version:** 1 · **Updated:** 2026-08-15
> **Cho:** frontend agent của U02 Shared Foundations và U03 Unified Shell.
> **Authority:** [BAR-01 deep dive](../../../upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md).
> **Runtime hiện tại:** FastAPI compatibility bridge; target Control API
> (TypeScript) giữ nguyên contract này trong các phase sau.

## 2026-08-23 — Execution D1 private carrier accepted, application dark

- Backend status is `D1_NETWORK_ACCEPTED / APPLICATION_DARK`: the SGP↔AWS-HK
  private carrier passed exact-SG, handshake, public-denial and link-loss gates.
- This changes no frontend delivery profile or capability. Registry remains
  `fixture`; query, analytics, SSE, source ingestion and commands stay disabled.
- Claude should keep explicit unavailable/stale/gap states and must not infer
  source availability from carrier health. D2/D3/D4 retain independent gates.

IAM/D1 revalidation is now
`IAM_VERIFIED / D1_REVALIDATED / APPLICATION_DARK`: live AWS inventory and the
single exact WireGuard rule match the private owner record, but no Edge/Proxy/
projection service is running. The frontend contract does not change: keep
`source_available=false`, `stream_available=false`, profile `fixture`, Lane B,
EventSource and commands off, and do not poll AWS-HK. The attached temporary
role/IMDS condition remains a backend-only D2 blocker.

The owner reported attaching IAM isolation policy revision 2, but the exact
2026-08-24 EC2 DryRun still returned `UnauthorizedOperation`. This is an
owner-side effective-policy/default-version/boundary check only and changes no
frontend contract. Claude keeps every Execution consumer and delivery profile
dark; backend did not detach the role, start a service or change AWS runtime.

D2 host admission is
`D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED`. Bobby accepted
the non-Portal historical-OOM
attribution and the baseline/delta shared-host admission model. This is an
operational backend state only: Claude keeps the same fixture/dark/unavailable
contract and must not enable AWS polling, Query, analytics, SSE, Lane B or
commands.

D2 owner/window validation is
`D2_AUTHORIZATION_CONTRACT_PREPARED / LIVE_D2_UNAUTHORIZED`. It creates no
consumer contract and no window is currently open. Readiness cannot activate a
runtime, while activation remains limited to source-dark D2 and requires
profile-detachment/IMDS proof. Claude keeps every live capability and Lane B
off until a later accepted D2 evidence packet.

The 05:43 UTC admission recheck established the existing AWS-HK I/O baseline
and confirmed two real non-Portal 256 MiB worker OOMs. The owner-selected
placement keeps the full Portal on SGP and allows only the bounded Source
Proxy, Rust Edge and private dark projection boundary on the existing AWS-HK
host. No new EC2/EIP/D1B is part of D2. This remains operations-only: do not
surface a source-ready UI, poll AWS or alter the fixture/dark consumer model.
Claude continues the same dark/fixture/recovery work only.

The D2 hard limits were raised to 5.00 vCPU / 5,632 MiB peak and 4.00 vCPU /
4,608 MiB long-running so an undersized per-container limit does not create a
false OOM. They are not reservations and do not change any frontend profile;
baseline/delta admission and Trading System health rollback remain mandatory.

The subsequent live aggregate preflight accepted the shared host with zero
blockers, but IMDS hop-limit-one DryRun remains unauthorized on the actual D1
operator role. Backend status is `HOST_PREFLIGHT_ACCEPTED /
IAM_ISOLATION_NOT_AUTHORIZED / LIVE_D2_UNAUTHORIZED`. This is not a source or
frontend readiness signal; Claude keeps every AWS-HK consumer disabled.

The IMDS hardening/profile-detach operation is now a tested, window-bound
backend tool with status `D2_ISOLATION_EXECUTABLE_PREPARED /
LIVE_D2_UNAUTHORIZED`. Preparation changed no EC2 state and unlocks no
frontend profile.

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

### 8.1b Đã đóng trong pass deep-dive 2026-08-18

| Việc | Thuộc mục | Commit | Gate |
|---|---|---|---|
| Mỗi artifact `wfo/*` có state riêng: ready/empty/absent/denied/malformed/failed. Candidate 404 không còn giết cả màn Optimization; funnel không in `0` từ artifact vắng mặt | rule §3.3 + §3.4, v0.5 §12.2 | `fa750d5` | `artifacts.test.ts` 9, `OptimizationView.test.tsx` 7 |
| Parameters: strategy theo `strategy_id` của run; percentile không còn bị nén ở range hẹp; publish `oos_used_for_selection` + causality/validation/semantics | rule §3.5, v0.5 §13 | `fa750d5` | `rangePosition.test.ts` 6, `ParametersView.test.tsx` 7 |
| Stage strip đọc events thật; heatmap cell-border token đọc theo theme | v0.5 §12.3 | `fa750d5` | trong `OptimizationView.test.tsx` |
| Toàn bộ UI copy sang tiếng Anh; module đổi tên hiển thị thành Backtest ở mọi chuỗi frontend sở hữu | Bobby chốt 2026-08-18 | `2c0cf9e`, `b23619f` | Portal 383 unit, Planning 79 unit |
| Login: authorisation chain + service facts thật thay danh sách capability hard-code; plate 3 band; ribbon thành thanh chu kỳ; caps-lock | v0.4 §21.1, rule §3.2 | `a13f0d7` | `AuthGate.test.tsx` 18, baseline auth 16 shot |
| Docs migration: navigation trong feature, chế độ đọc toàn văn, CSS tài liệu về `features.css`, token `--rail-w` | §8.5b | `9cd62db` | `docs-feature.test.tsx` 8, token gate Portal |
| Visual baseline re-record 101 shot | v0.4 §26 | `6a712c5` | record + verify lại |

### 8.1 Đã đóng trong slice v1.1

| Vùng | Thuộc mục | Đóng bằng gì |
|---|---|---|
| Gỡ INTERPRETATION / EVIDENCE / PORTAL PREVIEW | v1.1 §2.2 | Xoá khỏi bundle: feature module, route, tab, fragment HTML, CSS. Test chặn tái xuất hiện. |
| Roadmap màn | v1.1 §2.4 | Timeline thay bảng 24 cột `min-width:1240px`; delivery đếm từ task thật, phase không có task báo "chưa có task" chứ không phải 0%; concurrency + milestone marker; đọc được ở 4 breakpoint. |
| Mermaid | v1.1 §2.3 | Đọc token từ computed style thay 20 hex hard-code; node theo workstream ramp; scale theo container; nhãn theo type scale. |
| Task Board — font/tickbox | v1.1 §3.1, §3.2 | Một control family; type/spacing/radius scale; `Checkbox` đủ 5 state (checked/unchecked/indeterminate/disabled/loading), native semantics. |
| Task Board — tính năng | v1.1 §3.3 | Group theo milestone/workstream/owner; bulk transition; activity mở thẳng từ card; đếm task + đếm đã chọn theo cột. |
| Task Board — flow kéo thả | v1.1 §3.4 | Optimistic apply → rollback nguyên snapshot khi lỗi; insertion line cho vị trí drop; Alt+Arrow là đường bàn phím tương đương. |
| Stable v1.0.1 — shared Task Board + trusted actor | Hotfix 2026-08-19 | Embedded Planning đổi từ browser-local sang server-backed `v1`; mutation gửi same-origin cookie + CSRF. Control API derive actor từ authenticated session nên browser không thể giả `X-Portal-Actor`. USER được create/edit/move task; destructive import/delete/restore và Roadmap write ADMIN-only. Lark phân biệt actor với owner. Release audit sửa bodyless DELETE bị gắn JSON content type và chặn trước RBAC. Gate: Control 62/62, Planning backend 30/30, Planning frontend 80/80 + build, Portal 381 passed/3 skipped + build. |
| Webhook feedback | v1.1 §5 | Toast nói thông báo **đã xếp hàng** (không phải đã gửi — FE không quan sát được outbox). Test quét DOM chặn mọi chuỗi webhook/secret. |
| Portal Map — persona filter | v0.4 §P0.15 | Đọc `lifecycle_stages[].personas` do backend khai báo. |
| Chart envelope — toàn bộ result tab | v0.5 §12.2 | 7 `ChartFigure` còn lại (Optimization ×4, Parameters ×3, Execution ×2) đều mang envelope. Không còn chart nào dùng `sourceId` trần. |
| Contract typed | §8.3 request 1–3 | Regenerate types + narrow tới generated schema; `SummaryMetric` thành alias của `EvidenceValue`. |
| **Visual baseline** | v0.4 §26–§27, U02 exit gate | Playwright cho `apps/portal/frontend`: 39 snapshot = 4 màn × 4 breakpoint × 2 theme + print + 3 summary state. Đã verify tái lập (39/39 pass sau khi record). Runner: `scripts/portal-web-visual.sh`. |
| **Operations Dark review** | v0.4 §26, v0.5 §10.2 | Xong cùng visual baseline. Xác nhận workstream ramp render đúng trên board nhúng trong shell dark. |
| **Run Progress §12.2** | v0.5 §12.2, §8.3 request 5 | Fold Gantt có provenance footer (`config/fold_plan.json` · protocol · số fold · as-of · analysis-frame digest); plan cũ chưa có field thì ghi "chưa công bố". |
| **Trials envelope** | §8.3 request 4 | `{total_rows, returned_rows, rows}`; bỏ suy luận `length >= cap`; chart đếm theo **artifact population**, không theo trang được trả. |
| **RowEnvelope cho candidates/folds** | §8.3 request 8 | Cả 3 endpoint row-table dùng chung `rowPopulation()`; fold table có dòng "20/20 fold". |
| **Type generated cho endpoint mới** | §8.3 request 6 | `RowEnvelope`/`FoldPlanDocument`/`ArtifactProducer` thay type khai tay. `FoldRow` vẫn khai local — contract để `folds` là record array (runner ghi cột theo protocol). |
| **Visual baseline — Research screens** | §8.3 request 7, v0.4 §26 | 64 snapshot (từ 39): New Run + 5 run tab × 2 theme × laptop/workstation, trên `visual-baseline-run`. Có staleness gate theo digest fixture. |
| **Login frames 01B/01C/01D** | v0.4 §21.1, U07 | `AuthGate` đứng trước shell, đọc `/api/auth/context`; state machine thuộc backend. Deep link tự sống vì router nằm trong `children`. State lạ → frame khắt khe nhất, không mở shell. 16 snapshot (2 theme × mobile/laptop × 4 frame). |
| **Import Wizard nửa ghi** | strategy contract §5, R11 hướng A | Form source-reference `{alpha_id, version, artifact_relpath, expected_digest, git_ref?}`. **Không có file input** (2 test chặn). 403 hiện là "không đủ quyền", tách khỏi 400 "bị từ chối". |
| **Run Progress baseline** | v0.4 §26, R10 | Stage strip + fold Gantt 20 fold (có provenance §12.2) + live console 20 dòng thật. Route id giờ là authority; body id lệch thì hiện notice. 97 snapshot. |
| **Command Center evidence drawer** | v0.4 §P0.13 | Mở đủ authority/provenance/as-of/checked-at/unit/segment cho **mọi** metric của section — dữ liệu summary đã công bố, không tính thêm. History/cross-filter vẫn thuộc U10 và drawer nói rõ. |
| **Strategy data requirements disclosure** | strategy contract §6 mục 3 (phần làm được) | Hiện `required_columns`, timeframes, `warmup_bars` ở bước Dữ liệu + nói rõ check nào ở đâu. Timeframe vẫn là gate thật. |
| **Preflight gate per-check + seed gate** | strategy contract §6 mục 3, R14/R15 | Bước Review hiện từng gate kèm cột thiếu; bỏ 3 badge `pass` hard-code. Seed gate theo `determinism.seed_required`, phân biệt required / optional / **chưa khai báo**. |
| **Reports như dữ liệu** | §8.6 cũ mục 1 (slice tự đề xuất) | `view-reports` parse thành model typed, render bằng primitive. Fragment **không sửa**, hash vẫn gated. Test content-equivalence hai chiều: không mất, không bịa. `RawViewFeature` xoá (dead code). 77 snapshot. |
| **Alpha import inbox (U14 read half)** | strategy contract §5/§6 mục 4 | `/research/quantbt/imports`: 5 state contract khai báo, reason nguyên văn của service, verify digest on-demand (hiện cả hai digest, không chỉ verdict), empty ≠ failed. **Không có upload** — xem §8.4 điểm 3. 68 snapshot. |
| **Cancel run UI** | §8.6 mục 1 | `useCancelRun` quyết định riêng (test được một mình): `cancellable` chỉ khi status có và không terminal; confirm trước POST; `onSuccess` **invalidate** `["run",id]`+`["runs"]` chứ không tự set CANCELLING (state là của server). 403 hiện là thẩm quyền, tách khỏi lỗi khác. Nút không render khi terminal. 9 test. |
| **Cross-link 2 chiều Planning ↔ Portal** | §8.6 mục 2, v0.4 §P0.23, U05 exit gate | (a) task editor có "Mở màn Portal" — resolver do **host** inject (`portalScreenForTask`), Planning không đọc registry; (b) `roadmap_epic_id`/`default_task_id` ở FeaturePreview thành link thật, "chưa map" chỉ khi thật chưa map; (c) StageBrief liệt kê feature/screen/task của concern. `planningLinks.ts` là chỗ duy nhất dựng deep link (task đi qua query, vì board địa chỉ hoá task bằng selection). |
| **Command Center 2 CTA** | §8.6 mục 3, v0.4 §21.3 | `[New run]` `[Import alpha]` trong header → `/research/quantbt/new`, `/research/quantbt/imports`. |
| **Portal Map — nốt §P0.15** | §8.6 mục 4 | Filter status (độc lập với persona filter — dim theo `personaDimmed \|\| maturityDimmed`), click stage mở `StageBrief` (feature + maturity/data-mode badge, concern kèm `activation_gate`, link concern + roadmap epic). Feature stage khai mà registry không định nghĩa → nói "không có trong registry", không ẩn. |
| **Users & Access (ADMIN)** | §8.6 mục 5 | List/đổi role/reset credential/revoke sessions/disable. Mọi write mang `x-portal-csrf`, **fail closed** khi thiếu cookie CSRF. Role change nói trước là sẽ thu hồi session. One-time credential hiện **một lần**, không lưu, không log. Row của chính mình được đánh dấu. Non-ADMIN thấy `denied` và **không** gọi list (`enabled: isAdmin`) — biên vẫn là gateway, 403 báo nguyên văn. Route xem §8.4 điểm 4. 9 test + 2 snapshot. |
| **SSE cho run events** | §8.6 mục 6 (tuỳ chọn — đã làm) | `useRunEvents` mở `/api/runs/{id}/events`; frame chỉ mang state nên **invalidate query**, không patch bản sao run vào cache. Từ U10 2026-08-24, route đi qua session-guarded TypeScript façade và signed internal principal, không còn unauthenticated Nginx→Python exception. Không có `EventSource` hoặc mất kết nối → đóng source, `streaming:false` và polling giữ nhịp cũ; native EventSource không được retry vô hạn một 401/403 mà nó không cho client đọc status. Khi đang stream, polling **chậm lại (8s floor) chứ không tắt**. Đóng ở mọi error, frame terminal và khi unmount. |
| **Alpha 360° (version detail)** | §8.6 mục 7 | `/research/quantbt/alphas/:alphaId/:version`. Lifecycle là **track chung** DRAFT→LIVE (khoảng cách tới live là thông tin, không chỉ tên stage); certification/evidence trống nói rõ là trống; quarantine trích nguyên văn lý do của service; verify digest hiện cả hai digest. **Không có nút promote** — chuyển stage thuộc certification. ALPHA_POOL vẫn `COMMISSIONED` nên màn nằm dưới quantbt. 9 test + 2 snapshot. |
| **Sửa 3 lỗi nghĩa (audit toàn màn)** | v0.5 §12.3, §13; rule §3.5 | (1) `metricTone` tô xanh mọi metric `direction:"higher"` ≥ 0 → Sharpe 13.20, Calmar 7231 đều "good" dù engine không phán xét; equity xanh vĩnh viễn (màu không bao giờ đổi = không mang tin). Giờ tone theo `toneBasis`: `sign` (return/CAGR), chỉ-mặt-xấu (Sharpe<0, profit factor<1 — đúng định nghĩa của nó), drawdown về **neutral** vì mọi run đều có drawdown và engine chưa công bố threshold. (2) Step rail tick `✓` các bước **chưa mở** (validation rỗng thì trivially valid) → tick giờ cần `visited && !error`, screen-reader nói "chưa mở"/"đã mở, không có lỗi". (3) Danh tính run in **hai lần** (header chip + passport strip cách nhau 40px) → header nhường passport trên run route; nút copy trước đây label là chính run id, giờ có động từ. Kèm: `fmtPct` in `24837.88%` không group → mọi formatter qua một helper. |
| **Typography: vai trò font + scale** | v0.4 §25, v0.5 §10.2 | `table td, table th` là JetBrains Mono → **mọi** nhãn và câu trong bảng đều mono (tệ nhất với dấu tiếng Việt ở 12px). Mono giờ chỉ thuộc về **số** (`.mono`, `td.num`); column header và row-scope header là micro-label chữ prose; `.label` cũng chuyển sang prose. Scale 10/11/12/13/14/16/20/26 (4 bậc trong 3px) → 10/11/12/13/15/18/23/30. Hai file token đổi cùng nhau + gate parity mới cho type scale (đã negative-test). |
| **Chart: theme sống + craft** | v0.5 §12.2/§12.3 | **Bug thật:** `theme.ts` chụp `canvasTokens(activeTheme())` ở module scope — chạy **trước** khi React set `data-theme` → mọi chart ở Operations Dark vẽ bằng palette Research Light (lộ ra ở dataZoom gần trắng trên nền tối). Giờ đọc theo từng lần build option, `useChartTheme()` là nguồn reactive, theme truyền tường minh vì DOM attribute chậm hơn preference một render. Kèm: dataZoom khai đủ mọi phần (không còn rơi về default), crosshair snap + nhãn trục, drawdown có `%` + area 0.07→0.18 (trước vẽ convention mà không thấy) + callout đáy khớp với tile max-drawdown; `MarkPointComponent` chưa từng được register nên callout đó sẽ bị bỏ âm thầm. |
| **Skeleton thay spinner** | v0.4 §26 | Loading là một dòng chữ rồi nhảy sang layout đầy đủ trong một frame — đó là phần lớn cái "không đủ mượt". `Skeleton`/`ResultsSkeleton` giữ đúng footprint ở 4 màn result + run library, đọc một lần bằng chữ, không lọt vào accessibility tree. |
| **Entry bundle 346 → 91 KB gz** | v0.4 §27 (perf) | Không có `React.lazy` nào → entry chunk mang cả ECharts và Task Board nhúng: 346 KB gz trước first paint cho màn chỉ vẽ một thanh tỉ lệ, hai card và một list. Split QuantBT + Planning; ECharts ra khỏi entry; **gate budget** fail ở 140 KB để không tụt lại. |
| **Thứ tự đọc màn khởi đầu** | v0.4 §21.3, §P0.13 | Command Center: priority list nằm **cuối** scroll → giờ act → measure → reference (ledger → mục ưu tiên → section card → lifecycle metadata), có test khoá thứ tự DOM. New Run: bước 1 mở ra 12 dòng contract → 3 dòng quyết định được ("nguồn+version, cột bắt buộc, timeframe") + disclosure "Contract chi tiết"; strip run-context bỏ khỏi /new, /imports, /alphas. |
| **Login 01B + overview: pass sáng tạo** | v0.4 §21.1/§21.3, v0.5 §10.3 | Login thành split full-height (plate column + form trên paper, một hairline làm ranh giới) và plate mang **sơ đồ walk-forward** — instrument của chính sản phẩm, có caption "không phải dữ liệu của một run nào", legend bằng chữ (màu chỉ đồng thuận). Một load sequence, tắt dưới `prefers-reduced-motion`. Command Center: 6 con số registry giờ có thanh tỉ lệ theo thứ tự maturity cố định (không sắp theo độ lớn — feature sẽ nhảy chỗ giữa các snapshot), count 0 **không** vẽ segment, caption nhắc đây là metadata chứ không phải runtime. Không có màu nào ngoài token (gate token-parity phủ). |

### 8.2 Còn treo

| Vùng | Trạng thái | Vì sao chưa sâu | Slice đề xuất |
|---|---|---|---|
| Alpha Pool (`/research/alphas`) | `COMMISSIONED` → Feature Preview. Inbox ở `/research/quantbt/imports`. | **Đã quyết** (R12): giữ `COMMISSIONED` tới slice certification. | Khi certification xong: đổi maturity + chuyển inbox, giữ redirect route cũ. |
| Workspace / tenancy (`/api/workspaces`) | Chưa làm. | Topbar hiện ghi "Default Workspace · Prototype hiện chỉ có một workspace" — đúng sự thật hiện tại. Chỉ làm khi có tenancy thật. | Khi có nhiều workspace thật. |
| Command Center — history / cross-filter | Evidence drawer đã xong (§8.1). Chuỗi theo thời gian và cross-filter thì chưa. | Chờ **U10** read model bền. Dựng chuỗi từ một snapshot là bịa dữ liệu. | Sau U10. |
| Profile & Access (màn `PROFILE_ACCESS`) | `COMMISSIONED` preview. Phần **có backend** (Users & Access) đã làm và nằm ở route riêng — §8.4 điểm 4. | Profile của chính mình + danh sách session của chính mình chưa có endpoint. | Khi U07 công bố `/api/auth/sessions` + profile: gộp vào màn PROFILE_ACCESS và đổi maturity. |
| Maintenance / external-access error screen | Chưa làm. | Thuộc U07 production (Cloudflare Access edge), không phải màn app. | Sau U07 production. |
| Visual baseline — mobile/tablet cho Research | Chỉ chụp laptop + workstation. | Có chủ ý: v0.4 §26.1 đưa research work sang "open on desktop", nên baseline mobile sẽ chốt một layout không ai được yêu cầu làm việc trên đó. | Chỉ mở nếu §26.1 đổi. |

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

**Đã đóng** (codex giao trong `2d7c5ec` + `6be75a8` + `4d889ae`; frontend thu ở `dba271e` + `f9c44ba`):

6. ~~Response schema cho `wfo/trials` + `fold-plan`~~ → `RowEnvelope`,
   `FoldPlanDocument`, `ArtifactProducer`. Type khai tay đã xoá.
7. ~~Fixture cho 1 run hoàn chỉnh~~ → `registry/fixtures/runs/visual-baseline-run`
   (advanced_walk_forward, COMPLETED, 20 fold, 32 trial, series 3.476 bar).
8. ~~Envelope cho `wfo/candidates` + `wfo/folds`~~ → cả hai dùng `RowEnvelope`.

**Đã đóng** (codex giao trong `b02f4c2` + `3f6c9c1`; cập nhật `2026-08-17`):

14. ~~Preflight chỉ trả `valid: false` chung chung~~ → `POST /api/runs/preflight`
    trả `checks: [{id, ok, missing[], detail}]` per-gate: `strategy`,
    `parameter_space`, `dataset`, `required_columns` (kèm `missing` list),
    `symbol`, `timeframe`, `quality`, `capability`, `windows`, `folds`.
    `valid` = conjunction; `create_run` vẫn 422 qua `valid`. Response mang
    `request_id` để correlate. FE hiển thị đúng check nào fail ở bước Review
    và gate submit theo `valid`.
15. ~~`determinism` không public~~ → thực ra schema + registry + model đã có
    (`delta-rsi`: `seed_required: true`); gap là **projection**: đã thêm
    `determinism {seed_required, external_io}` vào `AlphaStrategyPublic` /
    `AlphaSummary` — FE gate seed theo `strategy.determinism.seed_required`
    (đúng §6 mục 3).

10. ~~Fixture run ở state `RUNNING`~~ → `registry/fixtures/runs/visual-baseline-run-running`
    (RUNNING, mid-study: status RUNNING, 16/32 trials, console "fold 8/20
    completed", fold_plan đủ 20 folds, metrics/selection đã bỏ — trung thực
    cho state chưa terminal). Cùng cơ chế `export_run_fixture.py`; có
    `test_run_fixture.py` khóa contract.
11. ~~Đường ingest không qua browser upload~~ → **chọn hướng A — source
    reference**. `POST /api/v1/alphas/import` giờ nhận JSON body
    `{alpha_id, version, artifact_relpath, expected_digest, git_ref?}`; server
    đọc artifact do CI/owner đặt sẵn trong ingest inbox
    (`PORTAL_ALPHA_ARTIFACT_ROOT`, path-traversal-safe) + `manifest.json` kề
    bên, verify digest, ghi quarantine. **Browser không gửi code**, server
    không fetch URI tùy ý (không SSRF). Form upload multipart cũ bị chặn
    (422). UI dựng được ngay: 3 field + preflight + state.

13. ~~Fixture -running run_id không nhất quán~~ → `visual-baseline-run-running`
    giờ có run_id riêng (`status.json` + `manifest.json` + console) — hết
    notice, snapshot sạch.

**Chờ quyết định (không chặn code):**

12. **`maturity` cho `ALPHA_POOL`** — giữ `COMMISSIONED` tới slice
    certification (U14). Codex sẽ đổi `PROTOTYPE`/`AVAILABLE` đúng lúc
    certification; **Claude cứ dùng `/research/quantbt/imports` tạm**, không
    làm hai lần. Không cần request thêm.

**Ghi chú tồn đọng (không phải request):**

9. `POST /api/v1/alphas/import` + quarantine pipeline đã có (`74a3b57`,
   `AlphaImportRecord`). **Chưa làm UI** — xem §8.2 Import Wizard; đây giờ là
   việc của frontend, không còn chặn bởi backend.

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

3. **Import qua browser upload (đã giải quyết).** §5 cấm upload trực tiếp
   từ browser; endpoint multipart cũ trái §5 và đã được **đổi sang source
   reference** (chọn hướng A, request 11 đóng — xem §8.3). UI không bao giờ
   gửi code bytes.

4. **Users & Access không nằm trên `PROFILE_ACCESS`.** Registry khai
   `PROFILE_ACCESS` là `COMMISSIONED` (`/administration/profile-access`).
   Render một màn chạy được sau badge `COMMISSIONED` là để badge nói sai — cùng
   lý do Alpha 360° nằm dưới quantbt thay vì trên route `ALPHA_POOL`. Nên màn
   admin nằm ở `/administration/users` (hard-code cạnh các bootstrap route,
   `ADMIN_USERS_ROUTE`), vào từ topbar cạnh các control của session, **không**
   xuất hiện trong nav dựng từ registry. Đây không phải feature model thứ hai:
   không có nav/preview/task link nào của registry trỏ tới nó.
   *Muốn sạch hơn thì cần registry entry* — đề xuất cho codex (chưa mở request
   vì Bobby chốt slice này không cần backend): một feature `USERS_ACCESS`
   (group `administration`, maturity theo thực tế, permission `users.admin`) để
   nav và Portal Map biết màn này tồn tại.

### 8.4b Backend request (soát lại 2026-08-18, chiều)

R1–R15 đã giao và thu hết. **R16–R18 mở sáng 2026-08-18 và đã đóng cùng ngày**
(`6286d81`, `0743aad`, + rebuild portal-api). Frontend đã verify từng cái trên
stack đang chạy:

| Request | Bằng chứng đã thu |
|---|---|
| R16 label → Backtest | `registry.json` `label: "QuantBT Backtest"`; sidebar + breadcrumb + module header đọc đúng. `canonical_route` giữ `/research/quantbt` — codex chốt, cơ chế legacy redirect đã phủ. 3 snapshot baseline đổi theo, đã re-record. |
| R17 message tiếng Anh | `GET /api/v1/portal/registry` không session trả `{"code":"SESSION_REQUIRED","message":"Invalid session."}`. |
| R18 RowEnvelope | `GET /api/runs/097b4c6be1a241d1/wfo/trials?top_n=3` → `{"total_rows":353,"returned_rows":3,"rows":[…]}`; `wfo/candidates` của run three-window trả envelope, của run walk-forward vẫn 404 — đúng ca `absent` mà `artifactTable` xử lý. |

**Còn treo: không có.** Nội dung ba request giữ lại bên dưới để tra cứu.

<details>
<summary>Nội dung R16–R18 (đã đóng)</summary>


**R16 — đổi tên feature `QUANTBT_RESEARCH` thành Backtest**

```text
Backend request
- Endpoint/field cần: registry.json feature QUANTBT_RESEARCH →
  label "QuantBT Backtest"; (tuỳ codex) canonical_route "/backtest/quantbt"
  với "/research/quantbt" thêm vào legacy_routes.
- Lý do UI: Bobby chốt module này gọi là Backtest, không phải Research
  (2026-08-18). Frontend đã đổi mọi chuỗi nó sở hữu — subnav, module header
  fallback, login, Planning hand-off. Sidebar/breadcrumb/Command Palette đọc
  `label` từ registry nên vẫn hiện "QuantBT Research": tên hiển thị chính
  của module là thứ duy nhất còn sai, và frontend không được sửa registry.
- Ảnh hưởng hiện tại: không route nào thiếu — chỉ là nhãn.
  Nếu đổi cả canonical_route thì `canonicalQuantBTPath` + `navigation.test.ts`
  đã có sẵn cơ chế legacy redirect, frontend chỉ cần regenerate.
- Đề xuất schema: không đổi schema, chỉ đổi giá trị.
```

**R17 — thông điệp lỗi của control-api đang là tiếng Việt**

```text
Backend request
- Endpoint/field cần: control-api error envelope, ví dụ
  GET /api/v1/portal/registry khi chưa có session trả
  {"error":{"code":"SESSION_REQUIRED","message":"Phiên đăng nhập không hợp lệ."}}
- Lý do UI: UI đã chuyển sang tiếng Anh toàn bộ. Rule hiện hành là hiển thị
  **nguyên văn** message của server (không dịch lại ở client, vì dịch tức là
  bịa lại lời của authority) — nên một câu tiếng Việt từ backend sẽ lọt lên
  màn hình tiếng Anh.
- Ảnh hưởng hiện tại: mọi StateView/Callout render `error.message`.
- Đề xuất schema: giữ nguyên `code`, đổi `message` sang tiếng Anh.
```

**R18 — `/api/runs/{id}/wfo/*` của image đang chạy chưa có RowEnvelope**

```text
Backend request
- Endpoint/field cần: không cần code mới — source đã đúng (routes_runs.py
  :417/:458/:472 trả {total_rows, returned_rows, rows}). Cần **rebuild +
  redeploy portal-api**.
- Lý do UI: image portal-api đang chạy (dựng ~2026-08-16) trả mảng JSON trần.
  Frontend đọc theo envelope, nên trước pass này charts vẽ rỗng mà provenance
  vẫn nói "không thiếu gì". Giờ `artifactTable` gọi đúng tên: `malformed`,
  kèm câu "API đang chạy build cũ hơn UI".
- Ảnh hưởng hiện tại: Optimization + Parameters của mọi run trên stack hiện
  tại đều rơi vào trạng thái malformed cho tới khi rebuild.
- Đề xuất schema: không đổi.
```

</details>

**Quan sát chưa mở thành request** (để codex/Bobby quyết): sidebar `group` của
`QUANTBT_RESEARCH` vẫn là `research`, nên breadcrumb đọc "Research / QuantBT
Backtest" và section header sidebar là RESEARCH, trong khi có sẵn một section
BACKTESTS chỉ chứa `APPROVALS`. Taxonomy group là của registry; frontend không
suy diễn. Nếu muốn nhất quán thì đây là chỗ sửa, một dòng.

### 8.5 Việc làm thêm ngoài plan (track theo CLAUDE.md §7.3)

| Việc | Vì sao làm | Bằng chứng |
|---|---|---|
| `features/quantbt/artifacts.ts` — phân loại state cho mọi endpoint `wfo/*` | Một run `advanced_walk_forward` với `optimization_mode: "none"` không ghi `wfo/candidates.parquet`, API trả 404. Optimization biến việc đó thành failure toàn màn, và funnel in `candidates 0 → selected 0` — hai con số không artifact nào sinh ra. | `artifacts.test.ts` 9 test + `OptimizationView.test.tsx` 7 test; trạng thái `absent` giữ population `null` nên không có `0` nào được suy ra. |
| State `malformed` cho response không phải RowEnvelope | `data?.rows ?? []` đọc mảng trần (build API cũ) thành "artifact rỗng": chart trắng dưới một dòng provenance nói không thiếu gì. Đây là chính cái mismatch Bobby báo 2026-08-18. | Test "refuses to render an empty screen when the response is not the row envelope". Backend request R18. |
| `rangePosition` thay `Math.max(1, high - low)` | Guard chống chia 0 âm thầm nén mọi range hẹp hơn 1 đơn vị: `rvol` đứng đỉnh `[1.2,1.6]` in "p40". | `rangePosition.test.ts` 6 test, có case p100 và case range rộng 0 → không có percentile. |
| Parameters đọc strategy theo `strategy_id` của run | Trước lấy `strategies[0]`. Với một strategy đã đăng ký thì vô hình; với alpha import thì mọi percentile và "immutable thesis" thuộc về strategy khác. | `ParametersView.test.tsx` để decoy đứng đầu list và kiểm p35/p100 + tên strategy trong Structural contract. |
| Surface `oos_used_for_selection` / `causality_claim` / `validation_claim` / `params_semantics` | Backend đã publish trong `selected_params.json`; UI chỉ vẽ 8 con số. Người đọc lấy OOS Sharpe làm giá trị mặt trong khi chính payload nói OOS đã được dùng để chọn. | Panel "What this parameter set claims" + test "states that the OOS segment was consulted while selecting". |
| Stage strip đọc `status.json` events | Dải 6 chip "Optimize IS → … → Evaluate" là hằng số, giống hệt nhau ở mọi run. | Test "draws the stages the run actually entered". |
| `auth/deployment.ts` — service facts ở màn login | Danh sách 3 capability hard-code là feature model thứ hai và không thể đúng (registry nằm sau session). Thay bằng version thật của portal-api/control-api đọc từ health endpoint không cần auth. | Fixture visual pin version; service không trả lời hiện "unreachable". |
| Chuyển toàn bộ UI copy sang tiếng Anh | Bobby chốt 2026-08-18. Trước đó tiếng Việt và thuật ngữ Anh trộn trong cùng một câu. | ~70 file Portal + ~25 file Planning; content migration (`content/pages`, `content/views.ts`) giữ nguyên vì là tài liệu gốc có hash. |
| Docs: navigation + chế độ đọc toàn văn + CSS đọc tài liệu về `features.css` | Xem §8.5b. | `docs-feature.test.tsx` 8 test. |
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

| Gate `var(--` trong option ECharts | Chart dùng canvas renderer nên CSS var không resolve; ECharts âm thầm rơi về palette default. `canvasTokens` tồn tại đúng để tránh điều này. | Gate keyed theo tên property chỉ-có-ở-ECharts nên `style={{color:"var(--good)"}}` ở DOM không bị bắt oan. Negative-test trên cây chưa sửa: báo đủ 8 vi phạm. |
| 3 defect do baseline Research phát hiện | Không unit test nào thấy được. | (1) Overview hard-code `formatter:"{yyyy}"` → 4 tick đều "2024"; (2) `var(--…)` trong option ECharts ở Overview + Execution markers; (3) `baseOption` `...extra` thay cả key axis nên view re-declare `xAxis` mất styling theme. Đã sửa + 7 unit test. |
| `export_run_responses.py` + staleness digest | Fixture run là artifact (parquet); image Playwright là Node-only. Chạy qua app thật để body không phải do FE bịa; digest gate chặn baseline số liệu cũ. | Hai digest phải cùng sort key — `Path` của Python và absolute-string của Node không cùng thứ tự khi có thư mục con. |
| Sửa `scripts/portal-web-visual.sh` | Bản gốc mount repo `:ro` nhưng lại chạy `npm ci`, và không map user → file root-owned. | Giữ nguyên ý định gate: tính "chỉ so sánh" đến từ **command** (`e2e:visual` không truyền `--update`), không phải từ mount. |

| Fixture inbox capture qua service thật | Inbox rỗng thì baseline không chứng minh được gì; nhưng tự viết record là bịa dữ liệu. | 2 manifest copy từ `alphas.v1.json` rồi re-identify, submit qua `AlphaImportService.submit` → state/`digest_ok`/reason là output thật của pipeline. Chỉ pin `import_id` + `received_at` (random + wall-clock). |
| `SectionHeading` thay ModuleHeader thứ hai | Khai `maturity` cho một màn registry không mô tả = tự bịa static metadata — cùng lỗi với badge mâu thuẫn dữ liệu đã sửa ở roadmap. | Module QuantBT đã render header với maturity thật từ registry. |

| Content-equivalence test hai chiều | "Render bằng primitive nhưng giữ nội dung" chỉ là lời nói nếu không kiểm. | Mọi string trong model phải có trong fragment (không bịa) **và** prose nhìn thấy của fragment phải được model tiêu thụ hết (không mất). Bỏ `.mermaid-source` trước khi so vì nó là bản `hidden` trùng với `<pre>`. |
| `settle()` chờ mermaid xong | `planning-reports @ print` fail verify **lặp lại** — không phải flake random mà là chụp giữa lúc mermaid render. | Chờ mọi `.mermaid` chứa `svg`. Gỡ được cả một lớp flake cho mọi màn có sơ đồ. Verify ổn định 2 lần. |
| Hai gate bỏ qua dòng comment | Doc comment nhắc `var(--muted)` mà nó vừa thay thế bị chính gate token-parity bắt. Văn xuôi không phải là tiêu thụ token. | Gate bắn vào prose là gate người ta học cách bỏ qua. Negative-test lại: `var(--nope-fake)` thật trong code vẫn fail. |

| AuthGate: gateway không ở trước thì vẫn render shell | `vite dev` và rollback `PORTAL_WEB_UPSTREAM=portal-api:8000` không serve `/api/auth/context`. Đó là Portal **không có** identity BFF, không phải cửa bị khoá. | 404/501 → render shell + banner nói rõ; mọi lỗi khác → chặn. Form login mà không backend nào trả lời được thì tệ hơn. |
| `PortalApiError` có status/code/request_id | Client cũ throw `Error` chỉ có message, nên không phân biệt được 403 (thiếu quyền) với 400 (input sai) — đúng phân biệt mà gateway ADMIN-only tạo ra. | `message` vẫn là tham số đầu nên call site cũ không đổi. |
| Print baseline settle **trước** khi đổi media | `planning-reports @ print` fail verify lặp lại. Nguyên nhân là **thứ tự**, không phải timing: mermaid đo text lúc render, `emulateMedia` đua với render nên geometry SVG khác nhau. | Giờ luôn layout dưới screen CSS rồi mới đổi media. Verify 3/3 lần. |

| Route id là authority, không phải body id | FE đọc `current.run_id` từ response rồi truyền xuống mọi child — một field lệch là console/ledger/mọi result tab trỏ sang run khác. | Route là identity, response chỉ mô tả. Lệch nhau thì **hiện notice**, không normalise — swallow đúng là cách một màn trộn hai run mà không ai biết. |
| Exporter ghi cả status code | `summary` trả 409 cho run chưa terminal; bỏ qua nó thì baseline mất một state thật. | Cũng phát hiện console phải capture ở `tail=5000` (RunProgress dùng số đó, không phải default của client) — nếu không console rỗng và baseline sẽ chốt một màn trông như hỏng. |
| Evidence drawer giữ section theo `feature_id` | Refetch thay object section; giữ theo object thì drawer đóng băng snapshot cũ. | Drawer đi theo snapshot mới. |
| Không dựng gate cho column/seed | Suy `ohlcv` → 5 cột là đoán nội dung frame (rule §3.5). `determinism` thì không tồn tại trong schema. | Làm phần disclosure thật, mở request 14 + 15 cho phần gate. |

| Bỏ 3 badge `pass` hard-code ở Review | Chúng khẳng định schema/boundaries/content-hash pass **bất kể** preflight trả gì — kể cả khi `valid: false`. | Đây là fake state, không phải thiếu tính năng. Thay bằng đúng gate server báo; gate server không nhắc thì **không** hiện là pass. |
| Seed gate giữ ba trạng thái, không hai | `seedRequired === null` (built-in không có manifest) khác `false`. Đọc im lặng thành "seed optional" là suy diễn. | Required → chặn submit; optional → nói rõ; chưa khai báo → nói rõ là chưa khai báo. |
| Thêm `determinism` vào `alphaProjection()` của test | Helper build projection thủ công; thiếu field thì nó lệch với contract nó đại diện. | Nếu không sửa, seed gate sẽ "trông như đã test" trong khi test vẫn pass. |

| `SessionProvider` thay vì mỗi màn tự đọc `/api/auth/context` | `AuthGate` **đã** đọc context để chọn frame; màn admin đọc lần thứ hai thì hai lần đọc có thể bất đồng. | `principal: null` (chưa auth, hoặc gateway không ở trước build này) **không bao giờ** là ADMIN. Test phủ cả hai. |
| Admin API: `role` lạ → `USER`, không phải ADMIN | Parse chống lỗi phải nghiêng về **ít quyền hơn**, không phải nhiều hơn. | `readUser` map snake_case→camelCase; `send()` throw `CSRF_REQUIRED` khi thiếu cookie thay vì gửi request server sẽ từ chối. |
| Non-ADMIN **không** gọi `/api/admin/users` | Gateway trả 403 thật; vẫn gọi thì mỗi người đọc lỡ vào route để lại một request forbidden trong log. | `enabled: isAdmin`. Biên vẫn là gateway — màn chỉ không đi gõ cửa. |
| Bỏ badge role cạnh select | Select đã là role; badge là bản sao thứ hai của cùng một fact và hai bản có thể lệch nhau giữa lúc mutate. | Cùng nguyên tắc với chip `tone` mâu thuẫn swatch đã sửa ở roadmap. |
| Disable nằm dưới một rule **trong** row | §13 nói destructive không cạnh row action thường; nhưng bản đầu cho table scroll ngang và nút Disable trôi khỏi màn. | Nút bị scroll khỏi tầm mắt tệ hơn nút chỉ nằm gần. Tách bằng rule + gap, giữ trong khung. |
| SSE **không tắt** polling, chỉ làm chậm | Stream mở rồi im lặng không phân biệt được với run đứng yên. Tắt polling khi "đang stream" là cách màn hình đóng băng mà không ai biết. | `runPollInterval(streaming, fast)` → floor 8s, không bao giờ `false`. Test khoá cả hai nhánh. |
| SSE frame chỉ invalidate, không patch cache | Frame mang `state`, không mang run. Tự dựng object run từ event là đặt bản sao **đoán** của run state vào cache. | Frame không parse được thì bỏ qua, không dựng state. Test có case JSON rác. |
| Alpha 360° không có nút promote | Contract có lifecycle nhưng không có endpoint chuyển stage; một nút promote sẽ nói quá thẩm quyền của màn. | Callout nói rõ việc chuyển stage thuộc slice certification. Test assert **không** có control promote. |
| Login plate vẽ sơ đồ walk-forward, có caption phủ định | Panel cạnh form login thường là chỗ để decoration. Nhưng một sơ đồ trông như dữ liệu **là** dữ liệu trong mắt người đọc. | Caption "sơ đồ phương pháp — không phải dữ liệu của một run nào"; legend bằng chữ, màu chỉ đồng thuận với chữ. |
| Thanh tỉ lệ registry giữ thứ tự maturity cố định | Sắp theo độ lớn thì cùng một maturity đổi chỗ giữa hai snapshot — reader học sai bản đồ. | Count 0 **không** vẽ segment (sliver tối thiểu sẽ khẳng định có feature không tồn tại). |
| Baseline thêm Users & Access + Alpha 360° (101 shot) | Hai màn này tồn tại để render **hậu quả**; drift CSS làm nút danger thôi trông như danger là đúng thứ unit test không thấy. | Body fixture pin sẵn, hoàn toàn synthetic: không principal thật, không digest thật, không token. |

| `toneBasis` tách khỏi `direction` | "Higher is better" **không** kéo theo "giá trị cao là tin tốt". Sharpe 13.20 vẫn là một mức engine báo, không phải phán xét engine ra. | Trộn hai khái niệm vào một field là cách màu semantic nói quá. Test phủ từng basis + case equity/drawdown về neutral. |
| Gate parity cho type scale | Gate ramp cũ chỉ so `--ws-*`; một split 14px/15px giữa hai file token sẽ đi qua mà không ai thấy — mà Portal ship stylesheet của Planning. | Negative-test: đổi `--text-md` một bên → fail đúng dòng. |
| Chart theme đọc theo từng lần build | Palette bị chụp ở module scope, trước khi `data-theme` được set → **mọi** chart Operations Dark dùng palette Light. Chỉ lộ ra ở một chi tiết (dataZoom gần trắng) nên sống rất lâu. | Test khoá: hai theme cho ra hai palette từ cùng module; theme tường minh thắng DOM attribute; dataZoom khai đủ 7 thuộc tính. |
| `MarkPointComponent` phải register | ECharts tree-shaken: `markPoint` không register thì **bị bỏ im lặng**, không lỗi. Callout đáy drawdown đã "viết xong" mà không hề vẽ. | Cùng họ với bug `var(--…)` trong option canvas: thứ không báo lỗi thì phải có gate hoặc phải nhìn bằng ảnh. |
| Budget entry bundle 140 KB gz | Split route là một dòng `React.lazy`; **bỏ** split cũng là một dòng static import. Không test nào khác thấy được. | Gate đọc `dist/` thật, skip có tiếng khi chưa build (không pass rỗng). Đo được: 346 → 91 KB gz, ECharts ra khỏi entry. |
| Bỏ end-label equity sau khi xem ảnh | Nhãn bị chart clip ở rìa phải **và** lặp lại đúng con số của hero tile ngay trên nó. | Ví dụ vì sao visual baseline là gate chứ không phải trang trí: viết ra thấy hợp lý, nhìn ảnh thấy sai cả hai mặt. |
| Skeleton không lọt accessibility tree | Placeholder là hình dạng, không phải nội dung; screen reader phải nghe "đang tải", không nghe mô tả các khối xám. | `aria-hidden` trên từng khối + đúng một `role="status"` bằng chữ. |
| Hi-fi HTML export (`hifi.config.ts` + `e2e/hifi-export.ts`) | Bobby cần bản HI-FI của domain QuantBT + các màn liên quan để mang đi vẽ lại. Vẽ lại từ ảnh sẽ mất số đo thật; xuất DOM đã render giữ nguyên type, rule, spacing đo được. | 19 màn × 2 theme = 38 file tại `/home/bobby/portal-hifi` (ngoài repo, không commit). CSS inline, script bị gỡ, canvas ECharts → PNG đúng vị trí/kích thước, font copy sang `assets/` + url tương đối. Kiểm chứng: render lại file đã đóng băng cho chiều cao trang **trùng khít** bản live (4363px Optimization, 2137px Parameters). Dùng đúng fixture của visual baseline (`visual-baseline-run`, clock 2026-08-17T12:00Z) nên không có dữ liệu thật. `playwright.config.ts` chỉ match `*.spec.ts` → exporter không bao giờ bị CI thu. |

### 8.5b Docs migration — ba lỗi, không lỗi nào là "thiếu nội dung"

Bobby báo `/planning/docs` "không đầy đủ nội dung như html legacy cũ"
(2026-08-18). Soát ra nội dung **đủ**: 16/16 page có mặt và hash khớp legacy
HTML (`tests/content-integrity.test.ts`, `content-integrity-manifest.json`).
Cái thiếu là mọi đường **đến** nội dung đó.

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Chỉ đọc được page 1 | Điều hướng tài liệu nằm ở sidebar của app standalone. Portal shell cố tình không render sidebar của Planning (§P0.10 — bỏ nested shell), nên khi nhúng thì **không có** điều hướng nào. 15/16 page không tới được dù đã migrate đủ. | Picker + chỉ số vị trí + pager prev/next thuộc về chính DocsFeature, nên tồn tại ở cả hai host. |
| Không đọc được toàn văn | Một tài liệu tham chiếu bị cắt thành 16 trang địa chỉ riêng thì không đọc tuần tự, không Ctrl-F toàn văn, không in trọn được. | Chế độ "Whole document": render đủ 16 section theo thứ tự, mỗi section có marker riêng; contents rail mở rộng theo. Mặc định vẫn là 1 section (tra cứu là ca phổ biến, và first paint chỉ một page markup). |
| Rail contents rơi xuống dưới bài, chữ không style | `.doc-layout`, `.toc-rail`, `.doc-article`, `.toc-item` nằm trong `shell.css` của Planning — file Portal **không** import (rule `.app`/`.workspace` sẽ đánh nhau với host). Không rule nào trong số đó mô tả shell; chúng mô tả một tài liệu. | Chuyển sang `features.css` (file cả hai host đều load). Việc chuyển làm token gate của Portal fail ở `--rail-w` — đúng cái đáng fail từ đầu: rail width không tồn tại ở Portal chính là lý do grid im lặng sập về 1 cột. Token đã khai, gate xanh. |

### 8.6 Slice kế tiếp — "đóng 2 domain cho chắc" (chốt 2026-08-17, Bobby)

**Trạng thái:** login UI (01B/01C/01D), Run Progress baseline, Import Wizard
(nửa ghi) và wire visual baseline vào ci.yml **đã xong** (ghi tại §8.1 — mục
này được soát lại so với phiên bản trước). Wire gateway đang BẬT (`1159d0a`):
cần session, USER đọc được mọi thứ, mutation ADMIN-only; rollback 1 dòng
`PORTAL_WEB_UPSTREAM=portal-api:8000`.

**Cập nhật 2026-08-17 (sau slice này): cả 7 mục dưới đã đóng** — ghi ở §8.1
(Cancel run, cross-link 2 chiều, 2 CTA, Portal Map §P0.15, Users & Access, SSE,
Alpha 360°) cùng "việc nhỏ kèm" (comment stale `ImportInbox.tsx`, soát §8.2) và
pass sáng tạo login/overview. Danh sách gốc giữ lại bên dưới để đối chiếu phạm vi
đã cam kết.

**Làm ngay, theo thứ tự (đều không chặn backend — không cần request mới):**

1. **Cancel run UI** — nút Cancel + xác nhận trong RunLibrary/RunProgress cho
   run chưa terminal. Backend đã sẵn: `POST /api/runs/{id}/cancel` →
   `{run_id, status:"CANCELLING"}` + worker cancel marker; `api.cancelRun` đã có
   trong `lib/api.ts`. Sau cancel: UI phản ánh state CANCELLING/CANCELLED, button
   disabled ở terminal. Test: click cancel → gọi POST → state cập nhật; không cho
   cancel khi `isTerminal(state)`.
2. **Cross-link 2 chiều Planning ↔ Portal (U05 exit gate)** — 3 mảnh (v0.4
   §P0.23): (a) task drawer có "Open Portal screen" (link tới canonical screen từ
   registry); (b) FeaturePreview: `roadmap_epic_id`/`default_task_id` (đang chỉ
   là text "chưa map") thành link mở roadmap epic/task; (c) concern brief liệt
   kê `feature_ids` + `screen_ids` + `task_ids` ảnh hưởng (concern có sẵn trong
   registry — `activation_gate`, `status`, `severity`). Đóng exit gate U05 "đi
   lifecycle → feature → task → feature không mất context".
3. **Command Center — 2 CTA tường minh** `[New run]` `[Import alpha]`
   (v0.4 §21.3): nút primary ở Command Center header → `/research/quantbt/new`
   và `/research/quantbt/imports`. Đã có sẵn route.
4. **Portal Map — nốt §P0.15:** (a) filter theo status
   available/prototype/commissioned/blocked (thêm cạnh persona filter đã có);
   (b) click stage mở Feature Brief; (c) badge maturity + data-mode; (d) link
   concern + roadmap epic từ stage. Registry đã có đủ dữ liệu (`maturity`,
   `lifecycle_stages[].feature_ids`, concerns, `roadmap_epic_id`).
5. **Users & Access UI (admin)** — màn quản lý user/session: list users, đổi
   role, disable, revoke sessions, reset credential (in one-time activation
   token). Backend đã sẵn đầy đủ: `GET/POST /api/admin/users`,
   `PATCH /users/:id`, `POST /users/:id/{reset-credential,revoke-sessions,disable}`
   (ADMIN-only). Gate: chỉ ADMIN thấy menu; USER không thấy. Dùng session cookie
   + CSRF như login.
6. **SSE thay polling cho run progress (tuỳ chọn)** — backend `GET
   /api/runs/{id}/events` (SSE qua authenticated U10 façade) có sẵn; nếu chuyển từ
   `refetchInterval` (1–1.5s) sang `EventSource` thì thêm fallback polling + đóng
   kết nối ở terminal. Không bắt buộc — chỉ khi muốn giảm polling.
7. **Alpha 360° (version detail)** — màn chi tiết alpha từ
   `GET /api/v1/alphas/{id}/versions/{v}` (trả `AlphaVersionDetail`: name,
   entrypoint, artifact_digest, lifecycle đầy đủ — đã có backend). Mở từ catalog
   (ImportInbox hoặc strategy picker): click alpha → xem lineage/version/lifecycle
   + nút "verify digest" (đã có `api.verifyAlpha`). Chưa cần đổi maturity
   ALPHA_POOL (vẫn COMMISSIONED — route tạm dưới quantbt như hiện tại).

**Chờ phase (KHÔNG làm bây giờ):** Command Center history/cross-filter (U10 read
model), workspace/tenancy thật (U10), maintenance screen external-access (U07
production), Alpha Pool promotion + mining/composer/workbench (certification U14),
mở rộng capability quantbt-engine (BAR-09/U12), mobile baseline research (cố ý,
§26.1).

**Việc nhỏ kèm:** soát §8.2 còn 2 dòng stale (Command Center drill-down đã đóng
qua Evidence drawer; Reports "fragment legacy" đã đóng qua "Reports như dữ liệu")
+ sửa comment stale trong `ImportInbox.tsx` (còn nhắc multipart upload — đã đổi
sang source-reference R11).
6. Việc nhỏ: wire `scripts/portal-web-visual.sh` vào `ci.yml` (đã thêm step,
   script skip tới khi Playwright project xong); mermaid theo print (§8.2).

### 8.7 Sẵn sàng push / merge / build (soát 2026-08-17, cập nhật 2026-08-18)

> **Cập nhật PR #36 CI 2026-08-18.** Visual gate đã được tái hiện từ Git
> archive sạch: Playwright cài dependencies của Portal nhưng production build
> compile trực tiếp source Planning nhúng, nên TypeScript không resolve được
> `react`, `react/jsx-runtime` và `mermaid` khi Planning chưa có
> `node_modules`. `scripts/portal-web-visual.sh` nay bootstrap cả hai package
> graph trong cùng container pinned trước khi khởi động webServer; điều này
> loại bỏ việc local pass nhờ cache trong khi clean GitHub runner fail. Gate
> sạch sau đó còn chỉ ra hai fixture `status/console.log` bị wildcard `*.log`
> loại khỏi Git dù digest/index và console-response đều phụ thuộc chúng;
> `.gitignore` nay whitelist chính xác hai log tổng hợp này, không mở runtime
> logs nói chung. Không thay UI hay visual snapshots.
>
> **Cập nhật PR #35 CI 2026-08-18.** Clean `npm ci` tái hiện 3 unhandled
> rejection từ Mermaid khi Docs component unmount trước lúc computed design
> tokens sẵn sàng (`Unsupported color format: ""`). `renderMermaid()` trước
> đây chỉ bắt lỗi `mermaid.run()` nhưng để `initMermaid()` ngoài `try`; hiện cả
> initialize và render cùng đi qua một fail-soft boundary, nên route change/test
> cleanup không còn làm rớt toàn Vitest process. Gate sau sửa: Planning 79/79
> unit + production build; Portal 383 pass, 1 skip + production build; visual
> baseline 101/101. Đây là error-boundary fix, không thay palette hay snapshot.
>
> **Cập nhật 2026-08-18 (chiều).** R16–R18 đã đóng, không còn backend request
> nào treo. Gate chạy lại trên state đã merge: Portal 383 unit + build, Planning
> 79 unit + build + e2e 2, visual baseline 101/101 (re-record 3 shot vì đổi
> label, verify lại xanh), `contracts-test.sh`, `control-api-test.sh`,
> `./scripts/portal verify`. **Không còn gì chặn push/merge phía frontend.**
> Việc còn lại là build lại image từ code mới nhất rồi smoke thật trên HTTPS.
>
> **Cập nhật 2026-08-18.** Định danh đã deploy thật: `portal_users` có bobby
> (ADMIN, ACTIVE), stan và thanhvuong (INVITED); gateway đã route `/api/` qua
> `control-api:4000`; `GET /api/auth/context` trả `ACCESS_REQUIRED` đúng shape.
> Hai giá trị `.env` ở bảng bên dưới **đã được xử lý phía deploy** và
> `825b411` đã bỏ `--generate-one-time-credentials` khỏi CMD, nên rủi ro token
> rơi vào log đã đóng. Phần còn treo duy nhất là **rebuild portal-api**
> (backend request R18): image đang chạy cũ hơn commit `2d7c5ec`, trả mảng JSON
> trần thay vì RowEnvelope, nên Optimization/Parameters sẽ báo `malformed` cho
> tới khi build lại.



**Phía frontend: sẵn sàng.** Gate xanh toàn bộ — Portal 354 unit (1 skip khi chưa
build), Planning 71 unit, visual baseline 101 shot (record + verify lại 2 lần),
`contracts-test.sh`, `control-api-test.sh`, `./scripts/portal verify`, hai build
clean. `ci.yml` đã chạy cả ba script (`:36`, `:39`, `:42`). Không có regression nào
trong branch này; mọi thứ ở §8.1 đều có gate.

**Chặn "chạy được trên domain" — không nằm trong code, thuộc quyền Bobby/codex:**

| Nơi | Đang là | Hậu quả nếu build main như vậy |
|---|---|---|
| `.env:25` `PORTAL_PUBLIC_ORIGIN` | `http://localhost:8080` | `originAllowed()` (`apps/control-api/src/auth/auth.controller.ts:66,101,139`) **403 mọi** login / change-password / logout gửi từ `https://portal.primusspark.com`. Login chết trên domain — không phải bug UI. |
| `.env:23` `CONTROL_API_AUTH_MODE` | `dev` | Tin `x-dev-access-email` thay vì assertion thật của Cloudflare Access. Trên domain public đây là tư thế bypass authentication. |

Hai việc phải làm cùng lúc, không phải sau: `deploy/control-api/bootstrap-users.yaml`
có account thật + credential một lần đã rotate (Portal không tạo account từ UI), và
smoke thật sau build — login → Command Center → mở một run → cancel — vì chuỗi
`__Host-*` cookie + CSRF + Access chỉ đúng dưới HTTPS thật, không môi trường CI nào
ở đây kiểm được. `PORTAL_WEB_UPSTREAM` không cần sửa: `.env` không set nên compose
lấy default `control-api:4000` (`compose.yaml:98`) — đúng.

#### 8.7.1 Trạng thái stack đang chạy (soát 2026-08-18) — không chỉ là account

Soát trực tiếp stack local đang chạy (41h uptime) thì phần định danh **chưa từng
được deploy**, không phải "thiếu mỗi user":

| Bằng chứng | Kết quả |
|---|---|
| `docker inspect` `.Config.Cmd` của `control-api` | `["node","dist/main.js"]` — image cũ hơn CMD hiện tại của `deploy/images/control-api.Dockerfile:65` (`node-pg-migrate up && bootstrap.js && main.js`) |
| `information_schema.tables` trong DB `portal_control` | **0 bảng ứng dụng**; `portal_users` (migration `1723680000000_init-identity.sql`) không tồn tại ở bất kỳ DB nào |
| `grep proxy_pass /etc/nginx/conf.d/*.conf` trong container `portal-web` | `http://portal-api:8000` — image build trước khi `portal.conf` thành template envsubst (`deploy/images/portal-web.Dockerfile:52`); container không có env `PORTAL_WEB_UPSTREAM` |
| `GET /api/auth/context`, `GET /api/control/healthz` qua gateway `:8080` | `404` với thân lỗi kiểu FastAPI (`detail`/`request_id`) → `/api/` vẫn đi thẳng portal-api, façade U10 không nằm trong đường request |

Hệ quả: **rebuild image là bắt buộc, không phải tuỳ chọn** — chỉ đổi `.env` rồi
restart sẽ không đưa control-api vào đường đi, và cũng không tạo schema định danh.
Sau rebuild, CMD tự chạy migrate + bootstrap nên account sinh ra theo
`deploy/control-api/bootstrap-users.yaml` (bobby/ADMIN, stan/USER, thanhvuong/USER,
trạng thái `INVITED` + `must_change_password`). Màn Users & Access hiện gọi
`/api/admin/users` sẽ 404 cho tới lúc đó — đúng như thiết kế, không phải lỗi UI.

Đính chính §8.7 phía trên: câu "`PORTAL_WEB_UPSTREAM` không cần sửa" đúng về giá trị
(compose default `control-api:4000`) nhưng **chưa đủ** — giá trị đó chỉ có tác dụng
với image dựng lại từ template.

Về `CONTROL_API_AUTH_MODE`: `loadConfig` (`apps/control-api/src/config.ts:67`) chặn
`dev` khi `PORTAL_ENV != local`. Hiện `.env` chỉ có `PORTAL_ENVIRONMENT=research`
(biến khác, dành cho portal-api tại `compose.yaml:20`), còn `PORTAL_ENV` không set nên
control-api nhận default `local` — tức guard đang **được thoả một cách tình cờ**. Khi
chuyển sang `cloudflare_access_local_password` phải cấp đủ 4 giá trị Cloudflare
(`.env:27-29` đang comment, `CLOUDFLARE_TEAM_DOMAIN` chưa có dòng nào) và một
`CONTROL_API_INTERNAL_PRINCIPAL_SECRET` thật — default trong `compose.yaml` là chuỗi
`local-dev-principal-secret-0123456789`.

**Backend request (@codex) — activation token rơi vào log:** CMD của
`control-api.Dockerfile:65` chạy `bootstrap.js --generate-one-time-credentials`, in
`ONE_TIME <username> <token>` ra stdout. Lần boot đầu sau rebuild, ba token kích hoạt
sẽ nằm nguyên văn trong `docker compose logs control-api` và trong file json-log trên
đĩa — đọc lại được bởi bất kỳ ai vào được host. Đề xuất (codex quyết): bỏ
`--generate-one-time-credentials` khỏi CMD và chạy bootstrap thủ công một lần khi bàn
giao credential, hoặc ghi token ra fd riêng/secret store thay vì stdout. Frontend
không chạm được phần này; màn Users & Access vẫn là đường chính thức để reset về sau
(token chỉ hiện một lần, không lưu, không log).

### 8.7 Execution Loop — scale & refine pass (2026-08-21)

Bobby khoá scope đợt upgrade này về **Execution Loop** (Approval Gate trở về sau)
và chốt số quy mô. Ghi ở `CLAUDE.md` §0 + §8; refine chi tiết nằm ở
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_SCALE_AND_REFINE.md`
— thư mục đó là carve-out có chủ ý của rule "không sửa `upgrade/**`", phần
`upgrade/**` còn lại vẫn nguyên là docs của codex.

**Số Bobby chốt (v2, sau khi hỏi lại):** **3–5 portfolio × 50–100 alpha mỗi
portfolio** → 150–500 deployment toàn hệ · 5 venue · 1.000 order+fill/ngày · view
mặc định 6 tháng · chart mặc định 1h tuỳ biến theo window.

**Điều số liệu thật làm thay đổi kế hoạch** — ba lo ngại bị loại, không phải
hoãn: (a) blotter 182k dòng thì `COUNT` chính xác chạy trong mili-giây → **bỏ
approximate count**, không có nhãn `~` nào; (b) 1.000 event/ngày = 0,7/phút →
**bỏ coalescing** và **bỏ WebSocket**, SSE phủ hết (spec §16.4 để dành WS cho
"dense tape", đây không phải); (c) 5 venue vừa chip row như hi-fi → **không làm**
overflow pattern. Ghi lại để sau này không ai mở lại ba việc đó.

**Bốn thứ thật sự vỡ và phải làm:** correlation **100×100 = 10.000 ô** mỗi
portfolio (matrix có nhãn → heatmap clustering — spec §16.3 vốn đã viết
"heatmap", lưới có nhãn trong hi-fi chỉ là hệ quả của cast 9 alpha); blotter
182k dòng cần keyset + virtualization, mà **funnel bung inline làm chiều cao
dòng biến thiên — đúng thứ phá virtualization** (Bobby chốt: drawer); 12 tile
Insight Charts = 52k điểm trên một màn; và **Account/Broker 360°** — xem dưới.

**Phát hiện từ identity model (Bobby dặn phải hiểu, và nó ra kết quả).**
`venue_accounts` cho **nhiều virtual account trỏ chung một `external_account_ref`**;
`accounts` thì unique theo (strategy, mode, venue) và không dùng chung giữa
strategy. Với 150–500 virtual account trên ~5 physical ref, **một binding có thể
gánh ~100 linked account** — hi-fi vẽ 3 và cộng `Σ virtual 41.000 vs physical
43.120` **ngay trong browser**. Cộng 3 dòng thì đúng; cộng khi bảng phân trang
thì sai âm thầm, mà đây lại chính là claim an toàn của màn (spec §13.2: đây là
nơi phát hiện tổng virtual vượt physical). → thêm rule **M7: mọi tổng khẳng định
về cả tập phải do server tính**, và request `BR-EX-14`.

Một quan hệ nữa đổi cả scope bar: `portfolio_id` nằm **trên deployment**, không
nằm trên strategy → **cùng một alpha có thể ở hai portfolio qua hai deployment**.
Alpha 360° vì thế phải portfolio-scoped, nếu không nó trộn capital/PnL của hai
portfolio vào một màn không thuộc về portfolio nào (`BR-EX-15`).

**Thang resolution** suy từ trần ≤5.000 điểm/series của §16.4: ≤3d→1m ·
≤30d→15m · ≤6mo→**1h mặc định** · ≤2y→4h · >2y→1d. Mọi nấc lọt dưới trần nên
**không nấc nào cần downsample mất mát** — ta chọn interval đã aggregate sẵn chứ
không decimate. Đây là cách sạch nhất thoả §16.3 "không smoothing làm đổi
extrema", vì stride sampling chính là thứ xoá mất cây nến sụt giá.

**15 Backend request `BR-EX-01..15`** nằm ở §5 tài liệu trên (keyset cursor,
filter/sort server-side, count chính xác, series envelope, re-query khi zoom,
batch tile, correlation snapshot dạng packed array kèm clustering order, ranked
triage, alert grouping, single subscription, sequence-gap semantics, instrument
precision, funnel endpoint riêng, aggregate exposure per binding, portfolio scope
cho Alpha 360°). **Chưa gửi codex** — chờ backend plan để gửi một lượt thay vì
nhỏ giọt.

**4 quyết định Bobby đã chốt 2026-08-21** (§8 tài liệu trên): theme **đi theo
hi-fi** (Carbon DS §7, hex trong hi-fi là authority) nhưng lands như surface
riêng của Execution — không restyle `data-theme="operations"` dùng chung, vì 46/100
baseline là operations-theme và Research thì cấm đụng; funnel **drawer**; dữ liệu
quá 6 tháng **vẫn truy được nhưng hoãn UI**, chỉ cần footer blotter ghi rõ cửa sổ
6 tháng để khoảng trống không bị đọc nhầm thành "không có giao dịch"; cardinality
3–5 portfolio × 50–100 alpha.

**Còn treo:** (a) tỉ lệ 1.000 order+fill/ngày trên 150–500 deployment = ~2–7
mỗi deployment mỗi ngày — cần Bobby xác nhận, vì mọi ngân sách blotter/event/
workbench đều dựa lên nó; (b) **registry revision 3** — nav group hi-fi
(COMMAND/GOVERNANCE/DEPLOYMENTS/ADMINISTRATION) và 17 màn chưa có trong rev 2,
mà nav render từ registry là rule cứng và `registry.json` thuộc backend → nửa nav
của Phase 0 vẫn chặn ở codex, độc lập với nửa component.

### 8.8 Execution command catalogue revision 2 — Codex handoff (2026-08-23)

This packet preserves the accepted PRE-IAM-04 contract/replay/restore boundary,
PRE-IAM-05 dark-deployment boundary and PRE-IAM-06 tracking boundary while
hardening EX-BE-05b/F0.

`EX-BE-05b/F0` remains `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`; this is a
contract hardening revision, not command activation. The canonical consumer is
`GET /api/v1/execution/commands/catalog`, now ADMIN-only and session/workspace
scoped. The response carries `catalogue_revision=2`, exact
`total_entries`/`returned_entries`, actor/environment/entity/risk scope,
capability/freshness state and policy revision. Optional environment, target
and risk filters are server validated; an invalid target pair fails closed.

Claude should consume these revision-2 facts rather than retain a parallel
catalogue model:

1. every observed non-GET route is at least R1 and has
   `owner_review_required=true`;
2. every R1–R4 item requires both plan and apply; the UI must not infer safety
   from the Trading System source label alone;
3. all 64 F0 entries remain `portal_reachable=false`, including all eight
   unpublished `ops` actions and prohibited generic Redis actions;
4. command plan payloads are validated and bounded before hashing; sensitive
   key names fail with `SENSITIVE_PAYLOAD_FIELD_FORBIDDEN`;
5. the durable plan returns `payload_storage_policy=HASH_ONLY_NO_RAW`; raw
   payload values are never retrievable from the Portal plan/audit record;
6. duplicate concurrent request keys replay one immutable plan, while a
   different payload returns the typed conflict and must not be retried as a
   new command.

Frontend tests should cover ADMIN versus USER catalogue access, scoped/filtered
counts, visible owner-review state, hash-only copy, the sensitive-payload error,
and both replay/conflict outcomes. Keep every product/source/realtime/command
flag false. Full backend evidence remains in
`upgrade/backend/EX_BE_05B_F0_OFFLINE_OPERATIONS_FOUNDATION.md` and the detailed
consumer packet in
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F0_HANDOFF.md`.

### 8.9 D2 hardening checkpoint — source remains dark (2026-08-23)

The backend status is `D2_HARDENED / LIVE_DEPLOYMENT_BLOCKED`, not deployed and
not source-active. Dark Edge no longer makes an initial or background source
probe. All seven Source Proxy routes return transport-level 503 before
proxying, and no Trading System read credential exists in D2. The new private
projection PostgreSQL/migrator boundary is backend-only and contains no
business data while ingestion remains false.

Claude should keep `source_available=false`, `stream_available=false`, fixture
analytics and every command control inactive. It is safe to consume the
existing dark/unavailable/error contracts and render explicit degraded states;
it is not safe to open EventSource, switch Lane B, poll AWS-HK, or infer D3/D4
availability. D3 mTLS/JWT compatibility probes and D4 Paper BUILDING-epoch
qualification will each publish a new handoff before any frontend activation.
Full evidence:
`upgrade/backend/EX_BE_02_LIVE_D2_HARDENING_CHECKPOINT.md`.

The image publication workflow is now prepared but has not run. Its future
signed digest/evidence artifact is an operations input only and does not change
any frontend capability or availability state.

### 8.10 D3 offline preparation — no live frontend unlock (2026-08-23)

Backend status is now `D3_OFFLINE_PREPARATION_COMPLETE /
LIVE_D3_UNAUTHORIZED`. This is tooling and contract preparation, not a live
source milestone. The future D3 overlay can probe only contracts, health and
capabilities; orders/fills/positions/events remain blocked, and there is no
projection ingestion, Query API, SSE, analytics source or command capability.

Claude should continue in parallel on fixture and explicit dark/unavailable/
auth-denied/recovery states. Keep `source_available=false`,
`stream_available=false`, analytics profile `fixture`, Lane B closed and every
command affordance disabled. Do not add a browser-to-AWS probe or a second
transport. Codex will publish a new handoff only after real SGP→AWS H2/TLS1.3
mTLS/JWT/fault evidence passes. Full backend detail:
`upgrade/backend/EX_BE_02_LIVE_D3_OFFLINE_PREPARATION.md`.

### 8.11 D4 offline authorization — no live frontend unlock (2026-08-23)

Backend status is `D4_OFFLINE_AUTHORIZATION_PREPARED /
D3_PREDECESSOR_ACCEPTED / LIVE_D4_INPUTS_BLOCKED`. This adds no frontend
availability. Claude may
align fixtures with the published typed freshness/gap/error states, but must
keep profile labelling `fixture`, EventSource closed and Paper source panels
explicitly unavailable. The full Portal remains on SGP; only a future minimal
Source Proxy/Rust Edge/projection boundary runs on AWS-HK. The current optional-
key source reads and incomplete cursor/event semantics are deliberately
rejected instead of hidden by a UI fallback.

### 8.11A D3 live transport accepted — frontend remains source-dark (2026-08-24)

Backend status is `D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK /
D2_RUNTIME_RESTORED`. Real SGP→AWS-HK HTTP/2, TLS 1.3 mTLS, delegated JWT,
bounded latency, source loss/recovery and rollback passed. Only public contract,
health and capability paths were observed; no orders/fills/positions/events or
projection state was read.

This does not activate a frontend profile. Claude keeps `fixture`, explicit
unavailable/degraded states and EventSource off. A source-backed Paper panel
still requires an owner-approved D4 `BUILDING` epoch plus a later, separate
registry activation decision.

The current prerequisite audit is `D4_READINESS_AUDITED /
LIVE_D4_INPUTS_BLOCKED / NO_SOURCE_READ`; see
`upgrade/backend/EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md`. Claude
does not wait on this for V2 fixture UX, but must not replace unavailable states
with invented Paper data.

The offline Rust mapper status is `D4_MAPPER_CORE_OFFLINE_COMPLETE /
RUNTIME_FAIL_CLOSED / LIVE_INPUTS_BLOCKED`; this is not a UI availability
signal. It proves typed exact-decimal normalization and BUILDING-only replay
from a sealed synthetic corpus while the runtime stays fail-closed. Claude must
continue to render source panels as fixture/unavailable and must not open
EventSource or expose mapper rows. A later handoff will name an ACTIVE epoch and
non-fixture delivery profile only after separate D4 live qualification and
activation decisions. Backend evidence:
`upgrade/backend/EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md`.

The D4 storage preparation status is
`D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED / LIVE_VOLUME_NOT_PROVISIONED /
NO_SOURCE_READ`. This is backend infrastructure preparation only: no EBS
volume, mount, business projection or delivery-profile promotion exists.
Claude receives no live UI unlock and must continue to render fixture or typed
unavailable states until separate D4 live qualification is accepted. Detail:
`upgrade/backend/EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md`.

The Bobby/Trading System owner instructions are now
`D4_OWNER_ACTION_PACKET_PREPARED / OWNER_ACTIONS_PENDING / NO_SOURCE_READ`.
This changes no frontend contract: Claude continues fixture/unavailable states
and does not wait for, display or ingest private owner evidence. Detail:
`upgrade/backend/EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md`.

### 8.12 EX-BE-05b/F1a Operations Queue — Lane A can integrate (2026-08-23)

Backend status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. The same-origin
SGP Control API now publishes an ADMIN/workspace-bound queue with exact counts,
opaque forward/back keysets and Portal-only acknowledge→resolve workflow. It
does not make source data available: `delivery_profile=fixture`,
`source_integration_state=UNAVAILABLE`, and source status/verification remain
immutable across triage actions. No outbox or Trading System request exists.

Claude may wire Phase 7 to the generated execution-operations declaration and
the two F1a fixtures, preserving exact server counts and distinct source versus
triage states. Do not add page numbers, browser aggregates, EventSource or any
AWS/DB/Redis/CLI call. Exact read order and UI test matrix:
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F1A_HANDOFF.md`.

### 8.13 EX-BE-05b/F1b Incident Detail — Lane A can integrate (2026-08-23)

Backend status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. The SGP
Control API now publishes the Portal-owned OPEN→MITIGATED→RESOLVED incident
workflow, acknowledgement/assignment, append-only annotations and hash-only
evidence, operation correlation and bounded exact-count timeline collections.
Mitigation and resolution are server-gated; resolve never resumes a deployment.
No outbox, source request or AWS-HK call exists.

Claude may wire Phase 8 to the generated execution-operations declaration and
the two F1b fixtures. Render findings, alerts, dead letters and trace-order as
four independent unavailable panels, preserve `delivery_profile=fixture`, use
server counts and expected workflow versions, and fail closed on typed
conflicts. Do not invent source facts, upload evidence bodies, add auto-resume
or activate the registry route. Exact read order and test matrix:
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F1B_HANDOFF.md`.

### 8.14 EX-BE-05b/F2 Sandbox Certification — Lane A can integrate (2026-08-23)

Backend status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. The SGP
Control API publishes the Portal-owned DRAFT→IN_REVIEW→APPROVED|DENIED
certification workflow, exactly seven ordered steps, authority-labelled
evidence/freshness, blocking findings, evidence-set hash, SoD decisions and a
CANARY promotion plan that is always `BLOCKED`. Profile remains
`fixture/UNAVAILABLE`; there is no public source-evidence ingestion, outbox,
AWS-HK/source call, runtime activation or promotion execution.

Claude may wire Phase 10 to the generated execution-governance declaration and
the unavailable fixture. Render the seven server steps and Internal/Broker/
Difference as independently degradable panels. Do not recompute eligibility or
freshness, turn `runtime_state=null` into HALTED, enable submit/exit on any
missing/stale/failed evidence, or activate registry/source/realtime/command
flags. Exact read order and UI matrix:
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F2_HANDOFF.md`.

### 8.15 EX-BE-05b/F3 Canary Control Room — Lane A can integrate (2026-08-23)

Backend status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. SGP now
publishes immutable versioned DRAFT capital envelopes plus a source-dark Phase
11 response. Envelope caps and Portal lineage are available; runtime, five
KPIs, Internal/Broker/Difference, positions, blotter, series, consumption,
headroom and rollback evidence remain typed unavailable. No outbox, source
ingestion, runtime activation or command route exists.

Claude may wire Phase 11 to `execution-canary.d.ts` and its unavailable
fixture. Preserve the explicit `fixture · PRODUCTION INACTIVE` guard and null
runtime. `BROKER_STALE_BLOCKS_SCALE_ONLY` means broker freshness is a future
scale gate, not a protective gate; it does not make protective actions
executable now. Both action groups remain absent while `visible=false`. Exact
read order and test matrix:
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F3_HANDOFF.md`.

### 8.16 EX-BE-05b/F4 Live Full Operations — Lane A can integrate (2026-08-23)

Backend status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. SGP publishes
a read-only Phase 12 response from the latest Portal Canary predecessor, which
is explicitly `active_for_live_full=false`. Runtime, five KPIs, all source
panels, positions, orders, exact open-order footer, incidents, series,
continuity, rollback and realtime remain typed unavailable. No source call,
outbox, runtime activation, SSE or command route exists.

Claude may wire Phase 12 to `execution-live-full.d.ts` and its unavailable
fixture. Broker is schema-suppressed; render no broker number. Preserve
`BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4`, but keep both R3
and R4 actions absent while `visible=false`. Exact read order and UI matrix:
`upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F4_HANDOFF.md`.

### 8.17 U10 QuantBT run SSE — no visual redesign required (2026-08-24)

The existing `useRunEvents` URL and frame semantics do not change, but its
transport boundary does: `/api/runs/{run_id}/events` now enters the
session-guarded TypeScript Control API, receives a server-signed internal
principal and is piped to the private Python compatibility stream without
buffering. Missing/invalid sessions return 401; an invalid upstream content
type fails closed rather than being presented as SSE. The 3-second default is a
connect/header deadline only, not a stream lifetime.

Lifecycle hardening is fail-closed at the existing client boundary: every
`EventSource.onerror` closes that source before returning to fast polling.
This covers an initial 401/403 handshake, a transient drop and a server
`event: error`; native EventSource therefore cannot retry the protected URL
every few seconds for the lifetime of a dead-session tab. No preflight fetch,
facade-specific SSE error envelope or HTTP/SSE contract change was introduced.

Claude should retain the current polling floor and query invalidation model and
may assert that both pre-open and post-open errors close the source. It must not
patch run state from partial frames or confuse this Research stream with the
still-dark EX-BE-06 Execution realtime stream. No Execution delivery profile
or registry flag changed. Backend evidence:
`upgrade/backend/U10_QUANTBT_RUN_SSE_FACADE_CUTOVER.md`.

### 8.18 U10 run SSE — assertion added, and one question back to codex (2026-08-23)

Claude's side of §8.17 is done, test-only: three assertions in
`useRunEvents.test.tsx`. No behaviour in `useRunEvents.ts` changed — the file is
byte-identical to codex's version, verified after the mutation runs below.

**What was asserted, and why that shape.** The two existing tests cover the
fallback in halves — one that `streaming` goes false, one that the floor is
8000ms while streaming. Neither joins them, and the composition is the part that
protects a reader: after a failure the screen must stop claiming to stream **and**
the caller's poll interval must return to the fast cadence. Either half alone
still passes while someone watches a stale screen refresh every eight seconds.
Added: the cadence returns to fast after a failure; nothing latches when the
failure repeats five times, as an expired session's retries do; and the badge
comes back only on a real `onopen`, never on the mere absence of a further error.

Mutation-proven: neutering `onerror` turns 4 red, and making `runPollInterval`
always return the floor turns 3 red.

**What could not be asserted, honestly.** `EventSource` cannot read an HTTP
status — `onerror` carries no code — so this hook cannot tell a 401 from dropped
WiFi, and a test claiming to distinguish them would be theatre. The 401/502
assertion §8.17 invites is not implementable at this layer as written.

**Question back to codex — a retry loop the cutover introduces.**
`useRunEvents.ts` handles every error with `setStreaming(false)` and does **not**
call `close()`; `close` runs only on unmount or a terminal frame. `EventSource`
therefore auto-reconnects roughly every 3s for as long as the tab is open. Before
the cutover a 401 was impossible on this route, so a permanently-failing error
class did not exist. After it, every tab whose session expired reconnects
forever against the newly session-guarded Control API — the traffic the façade
exists to control.

Data is not affected: polling returns to the fast cadence, so the run keeps
updating. The cost is the loop alone.

Two ways to close it, both codex's call because both are transport changes:
either the façade emits a typed `event: error` frame before closing so the
client can stop on a non-retryable status, or the client preflights with `fetch`
to read the status. Claude did not pick one, and did not change Research
behaviour to work around it.
### 8.18 Execution Loop dev integration preview — fixture-only (2026-08-24)

The 17 reviewed Execution Loop screens are now mounted on their canonical
product routes when the Portal web image is built with
`VITE_EXECUTION_PREVIEW_ENABLED=true`. The Docker/Compose operator input is
`PORTAL_EXECUTION_PREVIEW_ENABLED`; its repository and stable-publication
default is `false`.

This is an integration-review surface, not a delivery-profile promotion. Every
screen still consumes `createFixtureApi()` or a reviewed local fixture, the
registry remains revision 4 with `delivery_profile=fixture`, and all source,
query, analytics, SSE and command capability flags remain false. A persistent
banner labels the screen `DEV INTEGRATION PREVIEW` and states that AWS-HK,
Trading System, broker and realtime are disconnected. Interactive UI actions
are browser-local simulations and grant no authority.

Claude may review the complete navigation, density, responsive flow and
cross-screen visual consistency at `dev.portal.primusspark.com`. Do not remove
the banner, infer source availability, enable EventSource, or replace fixture
adapters until the corresponding backend delivery profile is explicitly
promoted. Stable/main images must continue to build with the flag false.

Acceptance evidence on the integration branch:

- production Vite build passed;
- Vitest passed `67/67` files and `1,486` tests (`1` skipped);
- Playwright visited all 17 canonical screen routes plus seven feature-root
  routes and observed zero `/api/v1/execution` requests;
- registry contract tests prove exact 17-screen coverage, `fixture` profiles
  and false capability flags.

### 8.19 D2 live accepted — runtime dark, no business-data unlock (2026-08-24)

Backend has accepted the minimal AWS-HK runtime as
`D2_DARK_ACCEPTED / SOURCE_INACTIVE`. Rust Edge, Source Proxy and schema-only
PostgreSQL passed exact IAM isolation, private listeners, mTLS/public denial, a
four-sample 15-minute pressure soak and a volume-preserving rollback/redeploy.
There were zero Portal restart/OOM events, zero Source Proxy access lines and
Trading System health stayed HTTP 200.

This is an operational dark milestone, not a frontend delivery-profile
promotion. Claude must keep every screen on fixture data, all source/query/
analytics/SSE/command flags false and Lane B/EventSource closed. It may render
an honest `runtime reachable, business source inactive` state without inventing
orders, fills, positions, events or broker facts. Codex's next backend gate is
D3 live transport acceptance under a new owner window; D3 will open only public
contracts/health/capabilities for H2/TLS1.3/mTLS/JWT/latency/fault evidence.
Full evidence:
`upgrade/backend/EX_BE_02_LIVE_D2_DARK_EXECUTION_EVIDENCE.md`.

### 8.19 Execution screens: handlers are required props; fixtures are data (2026-08-24, EL-V2-03)

Design decision recorded per §7.3. Every interaction handler on the five
directly-mounted Execution screens (`PaperWorkbench`, `AlphaThreeSixty`,
`PortfolioThreeSixty`, `AccountBroker360`, `FullBlotter`) is **required** in
its props type. A screen cannot be mounted enabled-but-inert: optional chaining
had turned clicks into silence on the product preview (handoff §2.3), and a
type error is cheaper than a distrustful operator. Fixture factories therefore
return `<Screen>Data = Omit<Props, handlers>`; behaviour comes from
`src/execution/previewControllers.tsx` on product routes and from
`testHandlers.ts` spies in tests. Capability is never inferred from handler
presence (`AccountBroker360.operatorAdmin` decides visibility alone).

### 8.20 Sandbox: a new entry screen, and one route that had none (2026-08-28)

Recorded per §7.3 — this is a screen the plan did not list.

`/deployments/sandbox` is the canonical route of the `SANDBOX_TRADING` feature,
and it had no screen: entering it opened the certification workbench for
whichever deployment the fixture happened to carry. So the question the
workflow starts with — *what is in certification, and what is holding it* — had
no page. `SandboxOverview` now answers it (hi-fi "Sandbox Overview (entry for
WF 1d)"), and `/deployments/sandbox/:deploymentId` keeps the workbench, the
same split Live and Alpha Fleet already use.

Three decisions worth keeping:

1. **The hi-fi's demo toggle is not a toggle.** The hi-fi drives its
   `reconFinding: NONE | CRITICAL` state from a prop. Here it is the difference
   between two real deployments — `dep_77` (clean, 5/7) and `dep_91` (CRITICAL
   finding, 3/7) — so both states are reachable by switching deployment and
   neither is a mode the data cannot produce. The workbench therefore takes the
   route's `deploymentId`: the fixture publishes one document, so without it the
   switcher would always land back on the same page.
2. **Two claims stay the contract's.** The masthead renders `runtime not stated`
   rather than the hi-fi's `HALTED`, and the readiness verdict comes from the
   same gate the rail reads. The switcher also stopped repeating a runtime word
   for its peer. Everything else in the hi-fi body is smoke and says so.
3. **A blocked action is not a disabled button.** `Open smoke window` and
   `Request Sandbox Exit Review` are rendered as controls only when the server
   would accept them; when blocked they are text naming the blocker. The three
   available actions each open their plan, and Apply is disabled with the reason
   — the `sandbox.*` command routes land with BR-EX-61.

Backend requests: **BR-EX-60** (`sandbox-overview.v1`, new) and **BR-EX-61**
(`sandbox-certification.v1.1`, additive + four command routes), filed in §7.2 of
the unified plan with field-level detail in appendix O of
`upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md`.
Smoke module `src/execution/sandbox.smoke.ts` carries the deletion contract.

Open for codex (appendix O.5): the registry screen `SANDBOX_TRADING_SCREEN` is
still `data_mode: NONE`; `POST_ONLY`/`REDUCE_ONLY` are order flags, not order
types, so the "executed types" list needs a normalisation rule; the `stalled`
threshold; testnet venue naming (`OKX_TESTNET` vs `OKX` + `testnet:true`); and
where the smoke plan `sp_*` lives.

### 8.21 Backend request đang treo — BR-EX-60 / BR-EX-61 (mở 2026-08-28)

Theo CLAUDE.md §5. Intake chính thức là §7.2 của
`portal-backend-plan/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`
(commit `5950da5`); dưới đây là bản rút gọn để soát lại mỗi đầu slice (§7.6).

| Request | Trạng thái | Thứ đang chặn |
|---|---|---|
| BR-EX-60 `sandbox-overview.v1` | `RECEIVED` — chờ codex trả `CONTRACT_PLANNED` | màn `/deployments/sandbox` đang chạy hoàn toàn bằng smoke |
| BR-EX-61 `sandbox-certification.v1.1` + 4 route `sandbox.*` | `RECEIVED` | thân hi-fi của workbench là smoke; 4 action mới có plan, chưa có apply |

```text
Backend request (@codex) — BR-EX-60
- Endpoint/field cần: GET /api/v1/execution/sandbox/overview → sandbox-overview.v1
  (summary · kpis{in_certification, halted{by_finding,by_operator}, open_findings,
  test_fund_equity{enters_portfolio_nav:false}, broker_sync{age,policy,state}} ·
  rows[]{deployment, alpha, venue·account, portfolio→target+approval,
  certification{passed,total,current_step,steps[7]}, runtime_state|null, halt_reason,
  in_stage_days, stalled, next_step{action_key,enabled,blocker_codes}, lineage, note} ·
  order_journal{rows[], order_types[], reject_reasons[]} · connectivity · recently_certified[])
- Lý do UI: /deployments/sandbox là canonical route của feature SANDBOX_TRADING và
  chưa có màn nào. Câu hỏi mở đầu workflow chứng nhận — "cái gì đang trong
  certification, cái gì đang chặn nó" — hiện không có chỗ nào trả lời.
- Ảnh hưởng hiện tại: vào route đó mở thẳng workbench của deployment mà fixture
  tình cờ mang theo. Màn mới đang đọc src/execution/sandbox.smoke.ts.
- Đề xuất schema: phụ lục O.2 (response mẫu + map cột thật + 6 quy tắc) và A.60
  (bảng field/type/null/authority) trong BACKEND_REQUEST_HIFI_V2_2026-08-25.md.
- Codex phải chốt (không đoán): O.5.1 registry data_mode · O.5.2 chuẩn hoá
  POST_ONLY/REDUCE_ONLY (là cờ, không phải order_type) · O.5.3 ngưỡng stalled ·
  O.5.4 tên venue testnet.
```

```text
Backend request (@codex) — BR-EX-61
- Endpoint/field cần: sandbox-certification.v1 → v1.1 (additive: identity ·
  broker_freshness · reconciliation_view{internal,broker,difference} ·
  findings_rows[] · order_type_certification · execution_quality · smoke_plan ·
  cleanup · actions[] · peers[]) + 3 route lệnh:
  POST …/sandbox/{id}/plan {action_key} → plan.v1
  POST …/sandbox/{id}/apply {plan_id, idempotency_key} → operation.v1
  GET  …/operations/{operation_id} → verify
- Lý do UI: v1 công bố steps/findings/panels/plans/timeline nhưng không công bố
  thứ mà workbench dùng để quyết: diff nội bộ↔broker có thẩm quyền, các loại
  lệnh alpha dùng trong production mà chưa từng thực thi, chất lượng thực thi
  kèm INSUFFICIENT_DATA, smoke plan bounded, checklist cleanup, và bốn action
  kèm blocker của chúng.
- Ảnh hưởng hiện tại: thân hi-fi đọc smoke; ba action mở được plan nhưng Apply
  disabled vì chưa có route. Hai claim vẫn là của contract và không bịa:
  runtime_state null render "runtime not stated", verdict lấy từ gate.
- Đề xuất schema: phụ lục O.3 (response mẫu + map cột thật + 6 quy tắc), O.3.3
  (routes + typed error), A.61 (bảng field), D (5 dòng error mới).
- Codex phải chốt (không đoán): O.5.5 smoke plan sp_* nằm ở bảng nào (ảnh hưởng
  cả Admin Action Drawer).
```

**Bất biến frontend sẽ không tự phá, dù backend trả gì:** test funds không vào
NAV portfolio; certification đứng im không tự hết hạn; `INSUFFICIENT_DATA`
không bao giờ thành 0; `PARTIAL` không bao giờ xanh; và một action server sẽ từ
chối thì **không render thành nút disabled** — nó thành chữ nêu đúng blocker.

### 8.22 Paper: the hi-fi was mostly already published (2026-08-28)

Recorded per §7.3, because the finding matters more than the change.

Sandbox needed two new contracts. Paper needed almost nothing: `paper-workbench.v1`
already publishes the KPIs, lineage, lifecycle rail, observation gate and its
unmet criteria, drift vs the approved run, runtime health, accounting, portfolio
contribution and all four journals. Rebuilding the three screens to hi-fi WF 1c /
4h / 4b was therefore a *layout* pass, not a data pass — the smoke module is a
quarter the size of Sandbox's and holds only drawings plus the switcher.

Four decisions taken while doing it:

1. **The variant is chosen by the venue's calendar, not by the deployment id.**
   The id on the route is whatever the operator typed; a session-aware venue is
   a fact of the contract. Keying on the id had the VN screen render the crypto
   hi-fi whenever the preview route used a different identifier.
2. **The switcher chip for the deployment being read prints the contract's own
   progress.** A chip saying 12/30 above a rail saying 30/30 is the page
   arguing with itself, and the reader has no way to tell which half is stale.
3. **Panels moved onto the page keep one copy.** Runtime health, accounting,
   drift and contribution left their tabs for the workbench body; the tabs now
   name where they went. Two copies of a figure is two things to keep in
   agreement.
4. **Full coverage may sit beside an unmet gate.** The exit review's masthead
   shows `30 / 30 days` next to `GATE UNMET` on purpose — the policy knows
   things the coverage numbers do not show, and the verdict stays the server's.

Backend requests: **BR-EX-62** (`paper-workbench.v1.1` + `paper-list.v1`) and
**BR-EX-63** (`paper-exit-review.v1.1`), specified in full in §7.5 of the
unified plan. Smoke module `src/execution/paper.smoke.ts` carries the deletion
contract.

### 8.23 Paper link map — verified by probe, not by reading (2026-08-28)

Owner asked how the three Paper screens reach each other and the rest of the
loop. A probe (`e2e/_probe-paper-links.spec.ts`, scratch harness, not a gate)
walks every `href` on all three routes, opens each one, and fails if any lands
on the registry's not-found. Result: **0 dead**, after four anchors from an
earlier phase (`#ap-322`, `#ap-338`, `#pf-vn`, `#acct-vn`) were replaced with
real routes.

**Between the three**

| From | Control | To |
|---|---|---|
| Paper Workbench `dep_74` | switcher chip · VnMomo | `/deployments/paper/dep_102/vn-market` |
| Paper Workbench (either) | switcher chip · Grid `dep_94`, gate met | `/governance/exit-reviews/EX-771` — a met gate's next stop is its review, not its workbench |
| Paper Workbench (either) | `Request Paper Exit Review` | `/governance/exit-reviews/EX-771?from=<the workbench and its tab>` |
| Paper Exit Review | evidence rows | back to `/deployments/paper/dep_94`, `…#sessions`, `/deployments/blotter?deployment=dep_94`, `/execution/operations?deployment=dep_94` |

**Out of Paper, into the loop**

| Control | To |
|---|---|
| lineage `R1` / `R2` | `/governance/approvals/AP-101/r1`, `/AP-207/r2` (VN: AP-322 / AP-338) |
| lineage `artifact` | `/deployments/alphas/av_2088?tab=Audit` (VN: `av_2110`) |
| lineage `portfolio` | `/deployments/portfolios/PF-MAIN` (VN: `PF-VN`) |
| lineage `account` | `/deployments/accounts/paper-binance-carry-v32` (VN: `paper-dnse-vnmomo`) |
| lineage `venue` | `/deployments/accounts` |
| `Alpha 360° — all deployments` | `/deployments/alphas` — the fleet, deliberately: a per-alpha 360 resolves one cast document in the preview, so a deep link opens a page titled with a different alpha |
| `View approvals` | `/governance/approvals` |
| journals footer `full blotter →` | `/deployments/blotter` |
| exit review `run_5498` | `/research/quantbt/runs/run_5498` |

**Not linked, on purpose:** the lifecycle rail's SANDBOX / CANARY / LIVE steps
carry no href while they are pending. A stage a deployment has not reached has
no decision to link to, and a link that opens someone else's deployment is worse
than no link.

### 8.23 Paper — the link map, and what the hi-fi asks for that no contract publishes (2026-08-28)

Owner asked twice how the three Paper screens reach each other and the rest of
the loop, so it is written down rather than answered in chat. Every row below
was walked by a probe (`e2e/_probe-paper-links.spec.ts`) that opens each link
and checks it does not land on the registry's not-found: **0 dead**.

**Between the three**

| From | Control | To |
|---|---|---|
| Workbench `dep_74` | switcher chip `VnMomo v0.9 · dep_102` | VN workbench |
| Workbench `dep_74` | switcher chip `Grid v2.1 · dep_94 — 30/30 GATE MET → EX-771` | Paper Exit Review — a met gate goes to its review, not to another workbench |
| Workbench (either) | `Request Paper Exit Review` | `EX-771?from=<the workbench and its tab>` |
| VN workbench | switcher chip `Carry v3.2 · dep_74` | crypto workbench |
| Exit Review | `dep_94` / `sessions` in Observation coverage | back to the workbench, at its Sessions tab |

The switcher chip for the deployment being read prints the **contract's** own
progress, not the smoke tail, so it can never contradict the rail four lines
below it.

**Out to the rest of the loop**

| Control | Goes to | Why there |
|---|---|---|
| `Alpha 360° — all deployments →` | **Alpha Fleet** | see below — this is a deliberate departure from the hi-fi |
| lineage `R1` / `R2` | Gate R1 / R2 Review | the decisions this deployment rests on |
| lineage `portfolio` | Portfolio 360 (`PF-MAIN` / `PF-VN`) | where its capital sits |
| lineage `account` | Account/Broker 360 | the account it trades through |
| lineage `venue` | Accounts & Bindings | the binding behind that account |
| lineage `artifact` | Alpha 360 · Audit tab | the digest everything is joined by |
| journal footer `full blotter →` | Full Blotter | the order journal at portfolio scale |
| Exit Review `run_5498` | QuantBT run | the approved evidence drift is measured against |
| Exit Review `operations` | Operations Queue, scoped to the deployment | |
| Exit Review activation plan | Sandbox — the next stage the promotion opens | |

**One deliberate departure.** `Alpha 360°` points at the **fleet**, not at
`/deployments/alphas/<id>`. A per-alpha 360 resolves one cast document in the
preview, so the deep link opened a page titled with a *different* alpha — from
Carry v3.2 the reader landed on Grid v2.1. The fleet answers "all deployments"
correctly for every alpha and stops being a compromise the day BR-EX-49 ships.

**What the hi-fi shows that no contract publishes.** The hi-fi masthead carries
`● ACTIVE` — the deployment's runtime state — beside `✓ READY`, which is its
readiness. `paper-workbench.v1` publishes readiness and freshness but **not
runtime**, so the chip is absent rather than invented: a screen that printed
ACTIVE from a readiness field would say a stopped deployment is running. Added
to BR-EX-62 (§7.5.1) as `runtime_state`.

### 8.24 Paper entry: the owner's hi-fi arrived, the stopgap list retired (2026-08-28)

§8.22 recorded a minimal list at `/deployments/paper` because no hi-fi existed
for the route. It does now — "Paper Overview (entry for WF 1c/4h)" — and the
screen is that overview, measured from the file before building (KPI cells
8/12 with mono-16 values, funnel bars 7px, the runway's 185/320/148/92/104/128
grid, 18px day cells). Two hues the hi-fi mutes on purpose became tokens
(`--good-dim`, `--bad-dim`) because thirty day-cells with full-strength borders
read as noise and the token gate rightly refuses hues declared outside the
token file. BR-EX-62 was amended the same day: `paper-list.v1` grows into
`paper-overview.v1` (§7.5.1 of the unified plan).

### 8.25 Backend request đang treo — BR-EX-64 (mở 2026-08-28)

Theo CLAUDE.md §5. Intake chính thức: §7.2 + §7.6 của
`portal-backend-plan/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`
(commit `896df0f`).

```text
Backend request (@codex) — BR-EX-64
- Endpoint/field cần: không có endpoint mới — một schema fragment dùng chung
  `chart-series.rules.v1`, $ref bởi mọi series được vẽ (41/50/56/57/59/62):
  điểm số + timestamp ISO UTC (không bao giờ toạ độ đã scale) · tiền là decimal
  string · venue đóng cửa = gap tường minh, không nội suy · tổng in cạnh series
  = đúng tổng series · marker nào cũng mang journal id của nó · annotation bằng
  đúng giá trị series tại bucket của nó · cap + downsample giữ extrema và khai
  báo method · tooltip provenance (authority · as_of · formula_version) bắt
  buộc · overlay đa stage chung một join_digest · một chủ sở hữu duy nhất cho
  OHLC.
- Lý do UI: pass chart thật 2026-08-28 thay toàn bộ SVG mô phỏng trên
  Paper/Canary/Live bằng ECharts (marketChart.tsx) — các rule trên đang được
  viết lặp ở từng phụ lục và lệch dần; UI đã va từng cái: bar smoke phải
  *scale* mới khớp tổng in dưới nó, annotation DD ghi Aug 12 nhưng ngồi Jul 25
  cho tới khi data mang đúng đáy.
- Ảnh hưởng hiện tại: BR-EX-41/50/56/57/59/62 đã proven-renderable end-to-end;
  generator trong paper.smoke.ts / canary.smoke.ts là fixture tham chiếu.
- Đề xuất schema: §7.6 đầy đủ (10 rule, DoR §7.6.3, 6 test §7.6.4, amendment
  additive cho 57/59/62 ở §7.6.2).
- Codex phải chốt (leo thang): §7.5.5(1) — OHLC thuộc data-layer snapshot ds_*
  hay Trading System market route; HAI màn đang chặn trên quyết định này
  (Paper overlay 62 + Trade Replay 50).
```

### 8.26 Portfolio 360 — real charts trong contract slots + nút active (2026-08-28)

Pass sửa 3 điểm Bobby chỉ từ screenshot (commit `9709679`):

- **Influence map contract** (`InfluenceMap`, Structure tab): bỏ SVG 320×240 bị
  kéo giãn toàn khung ("phóng to quá") — giờ vẽ bằng `InfluenceGraph`
  (ECharts graph, layout tĩnh, khung 260px): node = alpha (bán kính = exposure
  share đã publish), edge = |ρ| ≥ threshold từ đúng packed matrix. Không xin
  series mới — chỉ đọc contract đã có.
- **Hai khung "not published"** trong disclosure corr.v1 thay bằng chart thật
  có nhãn smoke: ρ-timeline (`PF_CHARTS.rho`, threshold line 0.6 + annotation
  breach 08-12→14) và drawdown-overlap (`EpisodesChart` từ
  `PF_CHARTS.ddOverlap`, episode = interval + depth, joint window có regime
  label, INSUFFICIENT_DATA là state tường minh). Deletion note tại chỗ; đây là
  fixture tham chiếu cho BR-EX-34 — đã ghi backend plan **§7.6.6** (commit
  `7b6f353` bên portal-backend-plan).
- **`Rebalance plan ▾` / `Report pack`** hết disabled: mở plan-preview panel
  (grammar `exec-sbc-plan` của Sandbox); `Apply`/`Generate` bên trong là điểm
  enable duy nhất khi BR-EX-51 giao route plan → apply → verify. KV grid của
  preview (operation · targets · writes · governance) là field list đề xuất
  cho plan endpoint.
- Smoke mới: `PF_CHARTS` trong `portfolio360.smoke.ts` — xoá khi BR-EX-34/51
  giao. Tests: `analytics360.test.tsx` 13/13; full vitest 1706 pass.

### 8.27 Backend request đang treo — BR-EX-65/66 (mở 2026-08-29, audit độ phủ)

Soát lại sau pass Portfolio: hai lỗ hổng, đã file đủ vào plan (commit `35b3a73`
bên portal-backend-plan), row mirror trong `BACKEND_PLAN_7_2_ROWS_2026-08-25.md`:

- **BR-EX-65 — portfolio correlation-risk series** (§7.7): ρ-timeline
  (threshold + breaches server-derived, config `PORTAL_CONTROL`) và
  drawdown-overlap (episodes interval+depth, joint_windows ≥2 alphas,
  regime_label tùy chọn `regime.v1`). Lý do phải có row riêng: §7.6.6(1) trót
  gắn hai series này vào BR-EX-34, nhưng 34 đã **closed 2026-08-26** chỉ với
  equity/drawdown/approved-band — scope mới không được reopen row đã đóng.
  Smoke note trong `PortfolioThreeSixty.tsx` + `portfolio360.smoke.ts` đã trỏ
  lại BR-EX-65.
- **BR-EX-66 — portfolio actions** (§7.8): `rebalance` plan → apply → verify
  (plan dry-run echo đúng KV grid của preview; apply idempotent theo
  plan_digest, step-up + dual approval; verify PARTIAL không bao giờ xanh) và
  `report-pack` generate/status với từng section pin theo digest lúc đọc
  (`stale_at_generation` khi lệch). Đây là contract cho hai nút đã active;
  `Apply`/`Generate` là điểm enable duy nhất. Row WRITE — activation gate
  riêng, chờ Bobby duyệt.

Register giờ là BR-EX-41…66, tất cả `RECEIVED`. Quyết định treo duy nhất vẫn là
OHLC owner §7.5.5(1).

### 8.28 Alpha 360 — contribution chart sửa lỗi, equity-by-stage thành chart thật (2026-08-29)

- `ContributionChart` (shared): bỏ dataZoom slider thừa, trục giá trị về gốc 0
  (trước đó `scale:true` làm bar USDC vẽ từ 900 — đọc như một phần của chính
  nó), `barMaxWidth:48`, label mono 10px không viền, tooltip mang provenance
  (authority · as_of · formula) theo §12 tooltip contract — formula
  `contribution.v1 (BR-EX-41)`.
- Khung "Equity series not published" trên Overview thay bằng chart thật:
  `alphaStageEquity()` trong `alpha360.smoke.ts` — 3 line paper/sandbox/canary
  chuẩn hoá 1.0 tại stage entry, 30d, sandbox vào ngày 8, canary ngày 21 khớp
  deployment map; DOM legend theo tone; SMOKE note "Delete when BR-EX-41/34
  ship". Đây là reference shape cho series `stage-equity` của BR-EX-41 (đã
  file, không cần request mới). Path honest-state giữ nguyên khi `equity` null.
- Typography đồng bộ: trong `.exec-a3`, `exec-role-meta` về 10px mono và
  `exec-chart-unavailable-body` về 11px mono (trước là 12–13px sans, to hơn
  các màn 360 khác).
- Guard `MONEY_ARITHMETIC` bắt chữ "stage-equity" trong JSX text (dấu `-`
  trước `equity`) — đổi chữ, không đổi gate.

### 8.29 Sweep "chart thật + smoke khai báo" toàn Execution Loop (2026-08-29)

Bobby: tile 8/10 của Insight Charts chưa có smoke khai báo; và mọi chart còn
"chỉ vẽ" phải thành chart thật với data smoke khai báo. Kết quả sweep:

- **Tile 8** (Execution density day × hour, trước là `unavailable` text):
  `DensityHeatmap` mới (heatmap 7×24, quiet window 04–06 là hole tường minh —
  không phải 0 fills) từ `TILE_CHARTS.density`. **Tile 10** (Paper vs Live
  drift, trước `insufficient_data` text): line pair từ `TILE_CHARTS.drift`.
  Cả hai giữ lý do honest trong SMOKE note + envelope caption; switch duy nhất
  `ALPHA_INSIGHT_SMOKE` chi phối qua flag trong `withSmokeSeries`. Reference
  shape cho tile kind `heatmap`/`line` của BR-EX-40.
- **PfEraChart / PfMarketCorr / cross-portfolio spark** bỏ SVG pixel:
  `PF_CHARTS.era` (nav/bench daily 3 window + era bands from/to),
  `PF_CHARTS.market` (ρ daily, threshold, breach band, annotation "now" đúng
  giá trị series — rule 6), `PF_CHARTS.crossSparks`. `LinesChart` thêm `bands`
  (markArea per-band tone+label).
- **SparkLine** mới trong `marketChart` (line chart 20–36px, timestamps thật,
  aria-hidden) thay 6 SVG polyline: AlphaFleet, LiveOverview, PaperOverview,
  OperationsQueue (throughput là counts thật/hourly), IncidentDetail,
  cross-portfolio. Mỗi smoke module có helper data-series riêng (giá trị lên =
  lên, không phải pixel-y) — hết coordinate smoke, khớp BR-EX-64 rule 1.
- **TradeReplay giữ SVG có chủ ý**: đã là chart data-driven tương tác
  (candles + bracket legs + glyph theo giá từ `alphaReplay.smoke`, pan/wheel);
  ECharts không tái tạo rẻ được tương tác này. Không phải mô phỏng tĩnh.
- Regression WCAG bắt được và sửa trong pass: `.exec-a3 .exec-role-meta` đè
  màu guard note trên Canary/Live (hai màn này cũng mang class `exec-a3`) →
  scoped bằng `:not(.exec-guard-note)`; audit 5 viewport xanh lại.

### 8.30 Approval Inbox — pass hi-fi 4a trên nhánh continuation (2026-08-30)

Màn đầu của đợt 18 màn mới (worktree `portal-uiux-next`). Theo owner override
24/08 §0.1: một workspace Carbon — hi-fi "Governance Light" là floor chức năng,
không phải pixel authority. Đã đủ minimum acceptance của §11.6:

- **Recently decided chuyển sang `governance.approval-history.v1`**: type
  `DecidedRow` + `readDecidedRow` (rows.ts), bảng decided có cột riêng
  request · gate·subject · outcome chip · decided (date · người · policy) —
  trước đó tái dùng cột pending và nhét outcome vào `blocker_summary`.
  Fixture api reshape theo history schema + bổ sung AP-341 bị thiếu; test nạp
  fixture canonical `execution-governance.approval-history.valid.json`.
- **"Full history →" hết disabled-stale**: contract history là keyset page —
  `has_more=true` → nút thật gọi `onLoadOlderDecided`; `has_more=false` → câu
  "full history loaded · N decisions" thay vì nút chết. Lý do BR-EX-35 cũ đã
  được contract này thay thế.
- **Mine (N)**: `counts.mine` (đếm cả queue, server-side trong fixture api);
  label filter INBOX = "Mine (3)", R2 = "Ops · R2" theo chữ hi-fi.
- **Đồng hồ SLA**: `approvalInbox.smoke.ts` (`useInboxTick` — motion-gated
  qua `smokeMotionAllowed`, đứng yên dưới fixtures/webdriver; deletion note
  BR-EX-30/35 stream). Age chính xác `26h 00m 00s`, footer "next SLA breach
  in … (AP-201)" đếm ngược — mọi số đều suy từ age/budget server publish.
- **Row anatomy hi-fi**: SlaCell đổi DOM (text · flag · bar) — trong inbox bar
  3px nằm dưới text (110px); OVERDUE badge + bar pulse (tắt theo
  prefers-reduced-motion); blockers "N → summary"; id cell là <a> thật tới
  route review theo gate; empty state "Inbox zero. Nothing waits on you…".
- Tests 1718 pass; probe screenshot soi bằng mắt. R1/R2 là hai màn kế tiếp —
  contract `governance.r1-review` đã publish mà frontend chưa đọc (phát hiện
  của nghi thức §7.8), sẽ nạp ở slice R1.

### 8.31 Gate R1/R2 — pass hi-fi 1a/1b bản owner 2026-08-30 (2026-08-30)

Hi-fi R2 bản chat **mới hơn bản đĩa** (thêm Gate criteria + Stage eligibility).
Đã làm:

- **R1 Evidence hết honest-state**: `R1EvidenceSmoke` — equity 3 window-role
  (IS/OOS/holdout, boundary label ngang, annotation max DD đúng giá trị series
  — rule 6, trục năm 2019–2026) + WFO 12 fold bars (threshold 1.0, fold 6
  highlight). `LinesChart` thêm formatter năm cho span >400d + `position` cho
  verticalLines; `BarsChart` thêm `thresholdLine`/`highlight`. Checklist mang
  chip `gate_r1 rev 4` (smoke).
- **R2 thêm tab Gate criteria** (bảng policy-vs-evidence 5 dòng, verdict
  server-worded PASS/WAIVERABLE, footer 4·1·0, policy chip `gate_r2 rev 7`) +
  **Stage eligibility chips** (PAPER eligible · SANDBOX/CANARY needs) +
  **Portfolio fit panel** trong Readiness (weight bar 8.0%, corr est,
  marginal risk, diversification, symbol overlap). Tất cả smoke có nhãn.
- **Request changes hết disabled-stale**: N09 đã publish verb
  (`can_request_changes` + `REQUEST_CHANGES` trong decision enum) — eligibility
  reader/port/containers nối verb thật; nút enable khi server cấp + đã viết
  reason (≥8 ký tự, sàn của schema); lý do BR-EX-36 cũ gỡ bỏ.
- Data không publish → smoke `governance.smoke.ts` (deletion contract) và
  **BR-EX-67** đã file (plan §7.2 + §7.9, commit `bef4a58`): additive fields
  trên `governance.r1-review.v1`/`r2-review.v1`, verdict server-side, policy
  data không bao giờ là UI constant. Mirror row trong file này.
- Link chuẩn: inbox → R1/R2 (id cell + row), R2 → R1 (`open AP-101` +
  R1 reference tab), breadcrumb Governance/Approvals.

### 8.32 Governance Light — owner đảo quyết định 24/08, ba màn theo hi-fi (2026-08-30)

**Quyết định owner 2026-08-30 (Bobby, từ screenshot + hi-fi):** Governance
(Inbox · R1 · R2 · exit reviews) là **phòng review sáng** đúng hi-fi — đảo
§0.1(3) của handoff refactor 24/08 ("không có governance-light"). Codex lưu ý:
mọi tài liệu còn nói "one Carbon workspace cho cả governance" cần đối chiếu
mục này.

Cách làm — theme là workspace mode, không phải skin cục bộ (giữ đúng bài học
EL-V2-01): mode `governance-light` cho `/governance/*` (token research, ép
trên preference; TopBar "Governance Light ▾" route-set); `ExecutionSurface`
kind governance không stamp theme (inherit); ba màn bỏ workspace/rail/tabs →
bố cục phẳng hi-fi (`.exec-gov-*`, `data-hifi-exact`); Inbox thêm
`actor`/`policyVersion` vào port list (shape actor của workflow contract);
Capital preview là inverse panel duy nhất (`--gov-inverse-line`); test cũ
"never an inverted surface" (codex-era) viết lại theo hi-fi owner; typeRoles
exemption thêm `gov|gate`; token mới `--warn-bg`(light)/`--gov-exit`. Tests
1724 pass; baselines governance đổi toàn bộ có chủ ý ở gate kế.

### 8.33 Governance polish pass 2 + Paper Exit Review (2026-08-30, ảnh 1/2/3)

- **Typography trong panel**: input/textarea/composer/empty-state trong
  `.exec-gov` về mono 12px compact; ConditionComposer gọn sau "+ add
  condition" (details/summary, chuẩn hi-fi "CONDITION … + add"); grid2
  `align-items: start` — hết panel trống kéo trắng nửa trang.
- **Capital preview**: cột AFTER hết bị cắt (mono 11px, note wrap dưới số);
  khối inverse giờ **re-scope token trong tokens.css** — một palette near-black
  cố định mọi theme, mọi con (badge/state/note) tự đúng màu; specificity đôi
  để không bị rule panel sau đè.
- **A11y sạch 40/40 surface-audit**: phát hiện `--accent-contrast` là
  convention có sẵn nhưng chưa từng được định nghĩa (nút Approve sống bằng
  fallback) — nay định nghĩa theo `--accent-strong` từng theme; chip filter
  active dùng đúng cặp đó; chip active-nhưng-disabled giữ cặp màu (1.49:1 cũ);
  mobile: KV collapse, chip policy wrap — clipped audit xanh.
- **Paper Exit Review**: `governance.paper-exit.v1` **có publish
  `activation_plan`** mà màn nói "not published" — reader/fixture/container đã
  nối đủ (mode PREVIEW_ONLY · target stage · authority semantics · external
  side effect, cờ nguy hiểm đọc `!== false` theo fail-closed gate); bỏ khối
  tabs "pointer" thừa; root mang `.exec-gov` để ăn polish.
- Journey R2→R1 đổi theo metaline chip link (tab R1 reference đã bỏ).
  Tests 1724 pass.

### 8.34 Link sweep toàn màn + `canonicalHref` adapter (2026-08-30)

Owner yêu cầu: "rà soát lại tất cả các màn chỗ nào đang còn không link tới
nhau thì fix nốt". Cách rà: crawler `e2e/_probe-links-all.spec.ts` đi 27
route, gom mọi `a[href^=/]` rồi ghé từng đích — đích nào registry trả "No
feature in the current registry claims this route" là dead link; đồng thời
liệt kê entity id trần (AP-/EX-/PX-/dep_/av_/acct-/inc_/PF-) không nằm trong
anchor/button. Crawler giờ là **gate thật** (assert dead = 0) chạy trong
project `chromium-preview`.

- **Kết quả**: DEAD LINKS 0/27 route. Id trần đã nối trên mọi màn: Command
  Center (pipeline ✓, venue, pin deployment), Live Overview (sub → R2), Alpha
  Fleet (id row, PF-MAIN, note/chipNote → deployment/approval), Sandbox
  (target note, cert KV AP-207/AP-352, lineage), Portfolio 360
  (`workbenchRouteFor` holdings), Canary (envelope AP-311, twin dep_94, gates
  tail), Operations Queue (target acct → Account 360), Incident (subject
  acct), Accounts/Bindings (whoLinks, note inc_44).
- **`src/execution/links.ts` — `canonicalHref()`**: hai fixture đã publish
  mang route sai mà frontend không được sửa (drift test khoá byte-equality
  với `packages/contracts/fixtures`):
  1. `commandCenter.fixtures.ts` — `/execution/operations/op_1249`; route
     thật là dạng query `/execution/operations?operation=op_1249`.
  2. `certification.fixtures.ts` — `/deployments/paper/exit/PX-29`; route
     thật là `/governance/exit-reviews/PX-29`.
  Adapter map hai dạng này tại render edge (CommandCenter anchor + onOpen
  navigate, SandboxCertification lineage). **@codex request**: sửa hai route
  này tại nguồn fixture; khi fixture đúng, adapter thành no-op và sẽ xoá.
- **Bỏ qua có chủ ý** (ghi để lần audit sau không tưởng là sót): chip
  deployment trong Blotter (stage không suy được từ row contract — link bịa
  là nói dối); `EX-nn` trong SMOKE note (là số BR-EX, không phải exit
  review); option trong select; masthead tự trỏ mình; caption chart; id có
  anchor tường minh ngay cạnh (vd AP-360 "review →" ở Alpha Fleet).

### 8.35 Hiển thị thời gian: datetime64[ms], neo UTC+0 (owner 2026-08-30)

Owner: ISO thô `as_of 2026-08-22T12:00:20Z` không đọc nổi; đổi mọi instant
nhìn thấy sang dạng datetime64[ms] và **không map về +7** — nhiều venue
(crypto UTC, Vietnam ICT) nên lấy một mốc chuẩn UTC+0, người đọc tự map theo
venue của mình.

- `src/execution/time.ts` — `utcStamp()`: `2026-08-22T12:00:20Z` →
  `2026-08-22 12:00:20.000 UTC`; giữ ms thật nếu data có; instant **không có
  offset** (đồng hồ phiên VN) render không gắn nhãn zone — data không khai
  zone thì UI không bịa; chuỗi không phải ISO (clock ngắn `10:42:10Z`,
  date-only) pass through nguyên vẹn.
- Áp tại 6 render site dùng chung: `AuthorityBadge` (badges.tsx — mọi
  authority meta line), `envelopeCaption` (chart.tsx — caption mọi chart),
  Command Center as_of, Incident audit/annotation timeline, R2 capital
  preview as_of, Paper Workbench provenance + "as of" note.
- Gate mới `e2e/_probe-iso.spec.ts`: crawl 27 route, assert **0** raw ISO
  nhìn thấy (trước fix: 27 chỗ / 8 route). Clock-only (`clockOf`,
  `paperClock`) giữ nguyên — chúng đã đọc được và là chữ của hi-fi masthead.
- Không đổi contract: format hoá chỉ ở render edge, giá trị ISO trong
  fixture/contract giữ nguyên byte.

### 8.36 Admin Action Drawer — WF 1i CLI catalog trên nền F0 (2026-08-30)

Owner giao hi-fi WF 1i: drawer CLI đầy đủ tương tác. Nhưng F0 (EX-BE-05b,
catalogue rev 2) publish `relay DISABLED` + `portal_reachable:false` cho cả 64
lệnh, và stop gate của codex cấm vẽ nút cho lệnh không chạy được. Cách giải —
**hai sự thật cùng màn, không cái nào che cái nào**:

- **Composition = WF 1i** (flat, không rail): catalog 6 nhóm tác vụ × 24 lệnh
  (`adminCli.smoke.ts` — SMOKE khai báo, deletion contract → **BR-EX-68**),
  drawer 490px sticky: params bốc từ registry, read chạy transcript (stream
  gated `smokeMotionAllowed`), PLAN → preflight server-demo → two-man-rule
  key (OPERATOR) → APPLY (step-up, DANGER cần gõ confirm word) → VERIFY
  timeline (202 ≠ success, VERIFIED/PARTIAL, PARTIAL không bao giờ xanh).
  Demo states là địa chỉ: `?cmd=`, `?role=ADMIN|VIEWER`, `?outcome=PARTIAL`.
- **Sự thật F0 giữ nguyên chỗ đứng**: câu "command relay is disabled
  (EX_BE_05B_F0_CONTRACT_ONLY)" vẫn đứng đầu màn; toàn bộ 64 entry render đủ
  trong `<details>` "Full published catalogue" với đúng EntryRow/EntryDetail
  cũ — **không nút nào** cho published entry (invariant test giữ nguyên,
  adminDrawer.test 22/22). Mỗi lệnh WF 1i in dòng join: `published as
  <key> · not reachable`, hoặc nói thật "not in published catalogue rev 2"
  (`health`, `alloc` — 2 lệnh hi-fi chưa có key; nêu trong §7.10 backend).
- **SMOKE note tại điểm tương tác** — mọi transcript/preflight/verify là
  declared fixture; không dòng nào claim đã chạm cell.
- Link sang màn khác: AP-207 → R2 review, dep_74 → Paper workbench, op_1251 →
  Operations Queue (`?operation=`), open reconciliation → operations;
  `?operation=` đến từ Ops Queue/Incident được trả lời thật ("no operation
  lookup yet · BR-EX-68") + link ngược.
- Tests mới `adminCli.test.tsx` 28 case phủ đủ mọi sub-state hi-fi (6 nhóm,
  read/watch, params, alloc impact, emergency flatten + confirm, generic
  preview, preflight WARN, grant 3 role, VERIFIED/PARTIAL, blocked, denied).
- **@codex**: BR-EX-68 filed (§7.2 + §7.10, mirror rows file). **Spec chi tiết
  2026-08-30: `portal-backend-plan/upgrade/BR_EX_68_ADMIN_ACTION_DRAWER_SPEC.md`**
  — 6 contract A–F (task catalog `command-tasks.v1` · R0 run · plan/preflight ·
  apply step-up + confirm word · verify timeline · two-man-rule key), giao theo
  4 stage F1–F4 với enable point riêng từng stage, kèm 5 open decision (A1/A2,
  key cho health/alloc, B1 one-shot vs SSE, chủ `marginal.v1`, ràng U07).
  Lưu ý vận hành: file unified plan đang được mở trong editor với buffer cũ và
  đã 2 lần auto-save đè mất phần BR-EX-68 — nội dung an toàn trong git
  (`8b76f34`, commit spec mới nhất); reload file trước khi sửa tay.

#### 8.36.1 Luồng vào/ra của Admin Action Drawer (rà 2026-08-30, theo code)

**Vào drawer** (mọi đường đều verify trong crawler-gate):
| Từ màn | Trigger | Đích |
|---|---|---|
| Sidebar (registry) | nhóm ADMINISTRATION | `/administration/actions` |
| Operations Queue 4e | `plan residue re-apply →` (op PARTIAL) · chip plan `cmd_9f12` · `audit →` (op VERIFIED) | `?operation=op_…` |
| Incident Detail 4d | `Open apply plan ▸` · op id trong checklist · mọi op id ở panel "Operations taken" | `?operation=op_…` |
| Command Center 5a → Incident → op | journey chuỗi 3 màn (e2e §8.2) | `?operation=op_…` |
| Paper Workbench 1c | nút `Admin actions ⌄` (masthead) + nút ghost ở khối mutation | drawer root |
| Accounts & Bindings 4f | `rotate credential ▸` (credential EXPIRING) | `?action=rotate_credential&binding=…` |
| Binding Detail | footer `Rotate credential ▸` | `?action=rotate_credential&binding=…` |
| (prose, không link) | AccountBroker360 note · Portfolio 360 rebalance-preview note · Incident ops footer | nhắc "plan → apply → verify ở Action Drawer" |

**Ra khỏi drawer**: op_1251 → Operations Queue (`?operation=`) · AP-207 → Gate R2 review ·
dep_74 → Paper Workbench · `open reconciliation →` → Operations Queue · banner `?operation=`/
`?action=` → link ngược về Ops Queue / Accounts.

**Gap tìm thấy khi rà (đã fix cùng ngày)**: hai link `?action=rotate_credential` bị drawer mới
bỏ qua lặng lẽ — giờ trả lời bằng banner honest ("chưa có lệnh rotate credential trong cả hai
catalog · BR-EX-68 open decision 6") + link ngược Accounts; test container mới (51 pass cả hai
suite admin). Lệnh rotation thiếu ở CẢ hi-fi lẫn catalogue rev 2 → ghi vào spec BR-EX-68 §11(6)
cho codex quyết.


### 8.37 Ba màn governance owner-commissioned: entry · live gate · waivers (2026-08-30)

Owner: "Làm luôn... (1) chốt cửa vào vòng đời → (2) Live-gate review → (3)
Waivers". Cả ba dựng cùng ngày trên đúng grammar `.exec-gov`/`.exec-gate` đã
có (không palette mới, không type-scale mới):

1. **New approval request** `/governance/approvals/new` — cửa vào vòng đời
   (§H.2.1). Alpha/run/claim bốc từ registry (rule WF 1i "never free-typed"),
   summary bắt buộc ≥8 ký tự, panel "What R1 will review" (digest pin, window
   roles, SoD, SLA 48h). Submit là **declared demo**: xác nhận nói thẳng
   "nothing was written" → **BR-EX-69** (`POST /approvals`). Link vào từ Inbox
   gov-head "New request ▸".
2. **Gate LIVE review** `/governance/approvals/{id}/live` — phòng review riêng
   cho LIVE_GATE (§H.2.2). Backbone thật: `getGateR2` (eligibility/quorum/SLA/
   version/decide) — đúng contract đang phục vụ LIVE_GATE rows; evidence canary
   là smoke `LIVE_GATE` → **BR-EX-70** (drift vs paper twin `LinesChart`, KPI
   KV, criteria `gate_live rev 3` 5 PASS, capital step trong `.exec-gov-inverse`).
   `reviewRouteFor(LIVE_GATE)` đổi `/r2` → `/live`; AP-311 links ở canary/live/
   fleet smoke đổi theo; link ngược R2 AP-152 + Canary Control Room.
3. **Waivers & Conditions** `/governance/waivers` — sổ điều kiện toàn fleet
   (§H.2.3). 7 row smoke `WAIVER_ROWS` **mirror điều kiện có sẵn trong cast**
   (AP-352 capacity, EX-771 slippage carried, AP-259 daily-loss, AP-207 hedge,
   AP-201 WFO, PX-31 runbook, AP-311 waiver) — không bịa nghĩa vụ mới; filter
   client-side trên demo rows và nói rõ vậy → **BR-EX-71** (register + LAPSED
   là server transition, feed CC attention). Link vào từ Inbox head, R2
   Decision panel, Exit-review Conditions panel.

Routing: 3 route chưa có registry row → claim tạm qua
`EXECUTION_PREVIEW_EXTRA_ROUTES` (previewRegistry.ts), request codex ở
HOTFIX_REQUEST_2026-08-30 §2; `previewRegistry.test` ghi danh sách pending
chính xác (không nới lỏng assertion). Tests mới `governanceAdditions.test.tsx`
9 case; R2 link-tests cập nhật vì Decision panel thêm link waivers.

### 8.38 UI/UX VERSION FREEZE (owner 2026-08-30) + polish pass cuối

Owner chốt: tạm đóng version UI/UX — không mở màn/luồng/request mới; codex
tập trung giao backend (worklist đầy đủ: ROADMAP §J.2); điều chỉnh màn hiện
có chỉ theo yêu cầu owner. Trước khi chốt, polish pass "trau chuốt" cho 2 màn
còn lại cùng chuẩn với Waivers:

- **New request**: thêm loop-path chips (1·DECLARE you-now → 2·R1 not-you →
  3·R2 after-R1), evidence quick facts theo run đang chọn (khớp số cast:
  sharpe 1.74/−5.1%/1,212), cảnh báo re-review khi chọn alpha đã trong loop
  (Grid → "RE-REVIEW, never a parallel lane").
- **Gate LIVE**: SLA đếm chính xác từng giây trên metaline (`preciseAge` +
  tick, gated); thanh **capital step** trong panel inverse (5k now → 20k this
  approval → 80k target, mỗi bước sau là approval riêng); drift chart sửa
  data để canary bám twin đúng như criteria claim; hover criteria.
- **Khoá baseline**: 3 màn mới vào danh sách el-v2-07 (`gov-new-request`,
  `gov-live-gate`, `gov-waivers`) — visual từ giờ là gate thật.

### 8.39 N29 consumer (2026-08-31) — bóc SMOKE thật đầu tiên của freeze

Theo đúng §J.4: codex giao N29 → frontend nối contract, xoá smoke, không đổi
composition. Chi tiết + bảng 9 hạng mục: CLAUDE_TO_CODEX_N29_CONSUMER_EVIDENCE.md.
Điểm đáng nhớ: request-key giữ theo *ý định submit* (ref, không phải state —
double-click bị chặn đồng bộ); đồng hồ due neo `read_at` của server, không
phải đồng hồ máy người xem; LAPSED render blocking đúng như nó vào CC today.
Suite lần đầu đạt **0 React warning** (yêu cầu acceptance của codex).

### 8.40 N29-FE-01 closeout — product graph rời fixture hoàn toàn (2026-08-31)

Thực hiện `CODEX_TO_CLAUDE_N29_SAME_ORIGIN_PRODUCT_CONSUMER_CLOSEOUT.md`
(backend truth tại `e226ffb`). Kết quả + ma trận từng màn:
`CLAUDE_TO_CODEX_N29_FE_01_RETURN_PACKET.md` — verdict
`FRONTEND_CONSUMER_ACCEPTANCE_READY_FOR_CODEX` (không tự đánh Product GO).

Điểm cấu trúc phải nhớ:

1. **Boundary gate tự động** (`productBoundary.test.ts`): walk import graph
   thật từ `ExecutionPreviewRoute` — mọi value-import `*.smoke`/`*.fixtures`,
   `createFixtureApi`, `CC_FIXTURES` reachable là FAIL. Type-only import được
   phép (erased); demo VALUES chỉ vào màn qua prop `demo*` do lab bơm.
2. **Envelope screens** (`ProfileScreens.tsx`): N22/N23/N25 là envelope thưa —
   product render đúng sự thưa đó (masthead state/freshness, mọi array đã
   publish nguyên văn, mỗi capability thiếu một dòng reason). Bản rich đã
   review nằm ở lab. Class đổi tên `exec-envelope*` vì `exec-profile` đã là
   badge delivery-profile từ trước (đụng tên → tràn ngang, đã sửa).
3. **Doctrine đọc**: client KHÔNG pre-block read theo delivery-policy metadata
   của registry (rev 4 còn ghi `fixture`/false — metadata cũ). Server là
   enforcer; refusal của server render nguyên văn. Write vẫn giữ gate.
   Banner route nói sự thật transport (`PORTAL READS · SAME-ORIGIN`), chữ cũ
   của registry hiện thành drift trong inspector.
4. **Console guard** (`src/test/consoleGuard.ts`): mọi console.error/warn
   trong test là FAIL; allowlist 3 mục jsdom có tên. E2E preview spec cũng
   fail trên console/pageerror và trên bất kỳ request rời origin.
5. **E2E double** (`e2e/bffDouble.ts`): trả RAW canonical payloads cho
   `/api/v1/execution/**`; dữ liệu governance dùng chung một nguồn
   (`api/fixtureData.ts`) với unit double — không có feature model thứ hai.
6. **BR-EX-72** (consolidated, freeze-sanctioned): fleet list, bindings
   list/detail, canonical live-review fixture, registry amendment —
   `CLAUDE_TO_CODEX_N29_CONSOLIDATED_BACKEND_REQUEST.md`.

Gates: vitest 1780 pass (0 warning) · build xanh · Playwright preview+journeys
66 pass (clean run) · boundary 0 offences.
