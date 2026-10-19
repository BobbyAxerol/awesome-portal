# UXM-07 · yêu cầu gửi Codex (S0)

Chủ: Claude · 2026-10-18 · Lane: FIXTURE_LAB. Cách đọc: mỗi dòng có locator (file hoặc chỗ trong code), thực trạng, mong muốn nhỏ nhất, và việc FE đang làm trong lúc chờ. Ledger gốc: [FRONTEND_BACKEND_SYNC.md](../../FRONTEND_BACKEND_SYNC.md) §3b (FE-023..036); số mới bắt đầu từ FE-037. Codex trả lời trong ledger của gói, không trả lời ở chat.

| ID | Pri | Yêu cầu | Locator / thực trạng | Mong muốn nhỏ nhất | FE làm trong lúc chờ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| FE-037 | P1 | Capability `execution.*` cho nav V2 | `control-api` `PORTAL_CAPABILITIES` hiện chỉ có `administration.*` và `governance.{r1,r2,canary,live}.{read,decide}`. `roleNav.ts` (V2_CAPABILITY) phải đặt tạm 4 tên: `execution.portfolios.read`, `execution.accounts.read`, `execution.operations.read`, `portal.execution.blotter.read` (tên cuối V1 đã in trong câu từ chối). | Codex chốt tên và phát hành vào session `access.capabilities`, hoặc nói tên khác để FE đổi một hằng số. | Nav fail-closed: Portfolios, Accounts, Operations, Blotter không hiện cho ai (cả owner) tới khi session có capability. Không bật cờ `shell` ở môi trường thật trước đó. | OPEN |
| FE-038 | P2 | Mục "Profile & Access" cho mọi người dùng (xem của chính mình) | `sidebarGroups` ẩn mục này nếu không có `administration.profile_access.manage`; V2 cần màn tự xem (D9 "My access"). | Registry rev 7: mục tự xem không cần quyền quản trị, hoặc route riêng. | `DockAction` có slot "My access" nhận `accessHref`; chưa nối. | OPEN |
| FE-039 | P2 | Registry rev 7 ẩn `APPROVALS` cũ (`/backtests/approvals`) | `applyV2Nav` để mục cũ đi qua nên có hai mục "Approvals". | Cờ ẩn hoặc xoá mục cũ khỏi nav ở rev 7 (additive). | Không tự ẩn ở FE (registry là của Codex). | OPEN |
| FE-040 | P2 | `ARG EXECUTION_V2_SCREENS` trong `deploy/images/portal-web.Dockerfile` | Dockerfile chỉ truyền `EXECUTION_PREVIEW_ENABLED` (dòng 25-31). Cờ manifest chỉ có tác dụng khi build nhận được nó. | Thêm `ARG EXECUTION_V2_SCREENS=` và `ENV VITE_EXECUTION_V2_SCREENS=` (mặc định rỗng = tắt). Một manifest cho dev và stable (đừng lặp lại lệch 8 cờ). | Mặc định tắt; không ảnh hưởng gì tới build hiện tại. | OPEN |
| FE-041 | P3 | Quyết định tham số `window` (7D/30D/90D/ALL) | `ContextBar` ghi `window` vào URL nhưng server chưa có tham số này (xem FE-025). | Trả lời FE-025; khi có thì FE gỡ `windowLock`. | `windowLock` mặc định bật, hiện lý do "Window applies when the server supports it." | OPEN (gắn FE-025) |
| FE-042 | P2 | Operations queue item cần liên kết tới incident | `OperationalQueueItemV2` chỉ có `target.type` ACCOUNT/PORTFOLIO/DEPLOYMENT, không có `incident_id`; Incident drawer chỉ mở được bằng route (`/execution/operations/incidents/:id`), không từ hàng | Thêm `incident_id` (nullable) hoặc quan hệ operation→incident vào item V2 | Drawer mở từ route; hàng không có liên kết | OPEN |
| FE-043 | P3 | Số đếm theo trạng thái cho KPI Operations (Unknown outcomes, Pending receipts, Display catching up) | V2 queue chỉ có `total_count`/`filtered_count`/`read_truth`; hi-fi cần 4 ô KPI theo trạng thái | `status_counts` (server-counted trên toàn bộ filter) hoặc quyết định "không có" | Chỉ 4 ô In scope / Matching / Loaded / Read; không tự đếm từ trang đã tải | OPEN |

## S2 và S1e: yêu cầu mới từ lát màn hình (2026-10-18)
Mã FE-044…055 tiếp ledger gốc; mỗi dòng nêu locator, hiện trạng, mong muốn nhỏ nhất, và FE đang làm gì khi chờ. Các câu hỏi chi tiết của từng gói nằm trong báo cáo gói (không lặp ở đây).
| ID | Pri | Yêu cầu | Locator / hiện trạng | Mong muốn nhỏ nhất | FE làm khi chờ | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| FE-044 | P2 | `/portfolios` có cursor + `q` server, tách `allocated_by_currency` theo environment | `listPortfolios()` không nhận query, không cursor; một số cho mọi environment (book live+paper lẫn nhau) | cursor, `q`, mảng theo environment | "Load more" tắt kèm lý do; cờ "Real-funded and Simulated books together" | OPEN |
| FE-045 | P2 | Approvals gắn portfolio | `ApprovalRow` chỉ có subject string | `portfolio_id` trên row hoặc read theo portfolio | Panel nói không lọc theo portfolio, link tới hàng đợi | OPEN |
| FE-046 | P2 | Capital ledger: `seq`, `command_id`, `receipt_ref`, cursor | ledger có giới hạn, không trang cũ | thêm 3 trường + cursor (gắn FE-032) | hiện N mục, "returned entries could not be read" | OPEN |
| FE-048 | P3 | `stage_counts` bỏ stage = 0 hay bỏ stage chưa publish? | FE in "0" cho stage vắng (có thể số 0 bịa) | ghi rõ ngữ nghĩa | chờ; `it.fails` D4 giữ | OPEN |
| FE-049 | P2 | Schema: `Decimal` có `maxLength`, id duy nhất trong trang, enum đóng, MetricState vocabulary (AVAILABLE/EMPTY/UNAVAILABLE vs AVAILABLE/PARTIAL/UNAVAILABLE/DENIED/NOT_APPLICABLE) | reader tay chấp nhận 115/478 payload sai schema (fleet), 250/288 (inbox) | quyết định 9.8.2 (reader tay hay ajv) + ràng buộc schema | reader tự chặn (độ dài, pattern, trùng id) | OPEN |
| FE-050 | P2 | Bindings/Account: `GET /broker-bindings` không có environment trả gì; nguồn sibling sleeves của binding chung; `as_of_ms`/`read_at_ms`; `broker_sync` có `buying_power`/`synced_at`? | FE luôn gửi env; sleeves suy từ `venue_accounts` cùng `binding_id` | xác nhận hoặc cấp field/route | fallback ISO, nhãn "Not available" | OPEN |
| FE-051 | P3 | Account: long/short/gross theo side (A360-1), margin ratio (A360-2), credential alias/scopes/expiry (A360-3), product/margin/position mode (A360-4) | không publish | thêm field | "Not published (A360-n)" | OPEN |
| FE-052 | P2 | Blotter: `deployment_id`, filled qty, giá TB, slippage, fee từng đơn; lọc stage/deployment/account/alpha trong `BlotterQuery`; bracket legs có `order_id` | relation orders thiếu; scope chips chỉ lọc "loaded pages" | thêm field + lọc server | caption "loaded pages" | OPEN |
| FE-053 | P3 | Users: last sign-in; `accountApi.roster` trả rỗng khi body sai dạng | không publish | field + lỗi có kiểu | "Not published (chưa có id)" | OPEN |
| FE-054 | P2 | Alpha: `getStageDrift` trả decimal string (hiện JSON number); observed timeline thiếu status/outcome; route riêng cho replay | tab `?tab=replay` thay route | decimal string, thêm outcome, chốt route | stage-drift chỉ là fallback "Daily close" partial | OPEN |
| FE-056 | P3 | Operator tasks: mô tả một câu, tên hiển thị và nhãn scope cho `GET /operator-tasks` | `task.meta` hiện là tham chiếu nguồn (`cli/__main__.py:1570`) hoặc 'Portal-curated task; source operation not published'; HIFI Admin cần câu mô tả | thêm `description`, `display_name`, `scope_label` | Admin giữ catalogue key và hàng 'Not published' | OPEN |
| FE-055 | P3 | Command-center stream: double trả `profile-realtime.v1`, stream CC cần `manager-realtime-snapshot.v2` | không khớp | chốt schema | biến thể `stream:"published"` trong double | OPEN |

Ghi chú không phải yêu cầu: `--f-attention` chọn hue cam (#ffa51f); đây là quyết định thiết kế chờ Bobby xác nhận, không cần Codex.

## Nợ liên quan, không thuộc Codex
DEBT-UXM07-001 (V1 `.exec-gov .exec-btn-apply` tương phản 2.35:1) — xem [debt-register.json](debt-register.json); sửa một dòng nhưng đổi pixel V1 nên cần Bobby/Codex quyết baseline.

## Từ F8c (2026-10-19) — FE-057..065 (FE-064 để trống cho một dòng Board)
Locator và đề xuất nhỏ nhất trong `consumer-review-self-contracts-2026-10-19.md` §6 và §9 (câu hỏi Q1–Q6). Trạng thái: OPEN, chưa gửi. FE-037 và FE-038 vẫn chờ câu trả lời Q1/Q4; D4 (stage vắng trong `stage_counts` là 0 hay chưa publish) vẫn mở, FE đang giữ cách hiểu thận trọng "Not available".

## Cập nhật 2026-10-19 (sau Codex 678cf731)
FE-056, FE-049, FE-061: **CLAUDE_DELIVERED, chờ Codex review** (chi tiết trong `codex-priority-requests-2026-10-19.md` §5). FE-042/043: DELIVERED và đã render ở màn Operations. Danh sách ưu tiên 8 việc cho Codex nằm cùng file.
