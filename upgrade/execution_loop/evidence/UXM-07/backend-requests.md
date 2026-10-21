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
| FE-048 | P3 | `stage_counts` bỏ stage = 0 hay bỏ stage chưa publish? | FE in "0" cho stage vắng (có thể số 0 bịa) | ghi rõ ngữ nghĩa | chờ; `it.fails` D4 giữ | ANSWERED 2026-10-21 bởi producer (Claude, `27b42bd2`): stage của môi trường nguồn đọc COMPLETE (strategies và deployments) có mặt kèm số đúng, kể cả 0; stage của môi trường không đọc hoặc đọc PARTIAL vắng và không nói gì. FE giữ "Not available" cho vắng. Không đổi schema. PG spec chưa chạy. Chờ Codex review |
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

## S3: năm màn stage (2026-10-19) — FE-066…072 và bốn yêu cầu chưa đánh số

Chủ: Claude · Lane: FIXTURE_LAB / BFF_DOUBLE · Trạng thái của **mọi thẻ dưới đây: OPEN, chưa gửi Codex** (D9: Bobby chọn lúc gửi). Ledger: [FRONTEND_BACKEND_SYNC.md](../../FRONTEND_BACKEND_SYNC.md) §6. Đường dẫn mã tính từ `apps/portal/frontend/src/execution/v2/`. Mọi mức ưu tiên là đề xuất của FE. Trên dữ liệu thật hiện nguồn Sandbox/Canary/Live tối (fixture `*.unavailable.valid.json`: `runtime_state: null`, KPI `value: null`, panel `unavailable`), nên các ô dưới đây trông trống: đó là trung thực.

### FE-066 · P2 · Tên alpha và portfolio trên deployment
- **Locator:** `screens/workbench/model.ts:144` (alpha chỉ có id), `screens/workbench/Header.tsx:6-7,99` (`Names: Not published (FE-066)`); `screens/canary/model.ts:507` (`FE.names`); crumb của Sandbox/Live. Schema: `execution-paper-read.v1` (khối `deployment`: `strategy_id`, `portfolio_id`, `account_id`, `venue`), `execution-{sandbox-certification,canary-control-room,live-full-operations}.v1` (khối `deployment`).
- **Thực trạng:** chỉ có id; không có `alpha_id`, tên alpha, tên portfolio. Crumb dùng `strategy_id` làm nhãn.
- **Mong muốn:** hiển thị "Alpha Fleet / DOGE-Mom v2 / OKX-Test-01 / Sandbox" như hi-fi.
- **Thay đổi nhỏ nhất:** thêm ba field nullable `alpha_id`, `alpha_name`, `portfolio_name` vào khối `deployment` của profile Paper và của thân stage; null kèm `reason_code` khi người xem không được thấy tên (researcher, D7).
- **FE làm khi chờ:** in id đã publish; ô tên ghi `Not published (FE-066)`; link Alpha chỉ khi có `alpha_id`.

### FE-067 · P2 · Runtime, đối soát, phiên
- **Locator:** `screens/workbench/Header.tsx:37-39` (`runtime`, `reconciliation` = not-published; `Source flag: active/inactive` bên cạnh), `StickySummary.tsx:28,33`, `SessionsTab.tsx:3-19`, `model.ts:670`; `screens/canary/model.ts:48,102`; `screens/live/model.ts:313,736` (V2 live-source `runtime.state:null` + `SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED`). Schema `execution-paper-read.v1` `Data` có nhánh `sessions` và `reconciliation` kiểu `Records` (không đặt tên field) mà màn V2 **không đọc**; chưa kiểm server có điền chúng không.
- **Thực trạng:** chỉ có `deployment.active` (cờ nguồn, không phải health check) và số phiên đếm qua `getDeploymentQuality`. Không có `runtime_state`, since, verdict đối soát, số lệnh chưa rõ, hàng phiên.
- **Mong muốn:** chip Runtime ("Running since 12 Oct 08:00Z"), Reconciliation ("1 unknown order · Operations"), bảng Sessions (Started, Ended, State).
- **Thay đổi nhỏ nhất:** `runtime_state` (enum đóng) + `since` (ISO), `reconciliation: {verdict, unknown_order_count}` và `sessions[] {id, started, ended, state}` (hoặc xác nhận hai nhánh `Records` đã có là nơi mang và đặt kiểu cho chúng). Trên Sandbox/Canary/Live: thay `runtime_state: null` bằng giá trị thật khi nguồn bật.
- **FE làm khi chờ:** `Not published (FE-067)`; không bao giờ vẽ "Running" xanh từ `active`; tab Sessions in số đếm đã publish và id yêu cầu, không bảng rỗng.

### FE-068 · P2 · Self-eligibility cho hành động stage
- **Locator:** `screens/stage/reasons.ts:18-20` (`noGrant`, `liveClosed`, `notEnabled`); các `DockAction` ở `screens/canary/Rail.tsx`, `screens/live/parts.tsx`, `screens/sandbox/ExitReviewPanel.tsx`, `screens/workbench/ExitGatePanel.tsx`; `screens/request/*` (Submit). `ELIGIBILITY_ACTION_RULES` hiện không có các action này.
- **Thực trạng:** không có capability/eligibility đọc được cho `approval.create`, `sandbox.review_note`, `paper.exit_review_request`, `canary.{hold,reduce,rollback,request_scale}`, `live.{halt,reduce,emergency_close}`. Hôm nay: server từ chối → `failed`; nút lệnh khác đều disabled vì chưa có route lệnh.
- **Mong muốn:** reviewer thấy form read-only "Reviewers decide requests; they don't open them" theo server chứ không theo tên vai trò; nút disabled nói đúng "no grant" vs "closed on this build" vs "not enabled".
- **Thay đổi nhỏ nhất:** mở rộng `self-eligibility.v1` (FE-015/058/059) với 11 action trên, mỗi action `{eligible, reason_class, grant_ref?, step_up_required?}`.
- **FE làm khi chờ (D10):** không thêm tên capability tạm; chặn theo phản hồi server (403/typed refusal); lý do disabled từ `reasons.ts`.

### FE-069 · P3 · New request: run list, phạm vi alpha, tra theo request_key
- **Locator:** `runSuggestions.ts:80` (`/api/v1/quantbt/runs?limit=50`, ngoài `/api/v1/execution/**`), `screens/request/index.tsx:17,23` (picker alpha = alpha khác nhau của các run đó), nút "Check original request" mở Inbox.
- **Thực trạng:** list run cắt ở 50, không lọc theo alpha, không cursor; không có nhãn phạm vi "ALL AUTHORIZED / YOUR ALPHAS" từ server (FE-026); không có read tra theo `request_key`.
- **Mong muốn:** picker đủ alpha; offline/uncertain → tra đúng yêu cầu gốc.
- **Thay đổi nhỏ nhất:** `alpha_id` filter + `cursor` cho run list; `scope_label` cho danh sách alpha; `GET …/approvals?request_key=` (hoặc op lookup) trả created/replayed/none.
- **FE làm khi chờ:** "Showing 50" khi hết trang; retry cùng khoá và payload (chống trùng); Check original request mở Inbox, nói rõ không tra theo khoá.

### FE-070 · P3 · Lịch phiên thị trường VN
- **Locator:** `screens/workbench/Header.tsx:100` (`VN market calendar: Not published (FE-070)`), `index.tsx:63`; V1 truyền `calendar={null}` cho cả hai biến thể.
- **Thực trạng:** không có timezone, cửa sổ phiên, nghỉ trưa, ATO/ATC, ngày nghỉ.
- **Mong muốn:** chip VN market, và AGING/PAUSED đúng giờ (cùng FE-004).
- **Thay đổi nhỏ nhất:** read lịch theo venue/market (IANA tz, danh sách cửa sổ có tên, ngày nghỉ).
- **FE làm khi chờ:** chip ghi `Not published (FE-070)`; không tính PAUSED ở client.

### FE-071 · P2 · Canary: envelope, rollback, lịch trial
- **Locator:** `blocks/CapGauge.tsx:8,30,55` (`fe="FE-071"`), `screens/canary/EnvelopeTab.tsx:7`, `TrialStrip.tsx:6`, `Rail.tsx:11`, `readCanary.ts:22-25,85`, `model.ts:246-248,343`. Schema `execution-canary-control-room.v1`: `envelope_compliance` (`limits`, `consumed` null, `headroom` null, `base_risk_profile_verified`), `rollback_readiness` (`ready` const false + `blocker_codes`), `lifecycle.day_index`/`duration_days`.
- **Thực trạng:** có `limits` approved dạng chuỗi chính xác; không có Limit chính sách cơ sở, Consumed, Used %, as-of; rollback chỉ một cờ Ready + mã; không có ngày bắt đầu trial hay ngày mở exit review.
- **Mong muốn:** bảng Cap/Limit/Approved/Consumed/Used + cờ "Within envelope"; 4 mục rollback (flatten plan prepared, paper twin running, broker data fresh, last rollback drill) có ngày kiểm; "Trial day 6 of 14 · Exit review in 8 days".
- **Thay đổi nhỏ nhất:** `envelope_compliance.rows[] {cap, policy_limit, approved, consumed, used_ratio, as_of}` + verdict do server; `rollback_readiness.items[] {key, ready, checked_at}`; `lifecycle.started_at`, `exit_review_opens_at`.
- **FE làm khi chờ (D7):** gauge chỉ vẽ từ tỷ lệ server publish, không chia ở browser; "Trial day not stated" khi `day_index` null.

### FE-072 · P1 · Hàng và chuỗi có kiểu cho ba màn stage
- **Locator:** `readers/publishedRows.ts:6-13`; `screens/sandbox/model.ts:210-234,329,383`, `Tables.tsx:70,111-132,153`, `index.tsx:20,134,210`; `screens/canary/readCanary.ts:27-36,123-155`, `PositionsOrdersTab.tsx:4`, `ReconGuardTabs.tsx:6`; `screens/live/model.ts:153-158,260,405,470-476,750`, `parts.tsx:88,143-176`, `tabs.tsx:66-73`. Schema: `source_panels.*.data` (object tự do ≤16 thuộc tính), `positions`/`blotter`/`orders` `.rows` (object tự do ≤80 thuộc tính), `series.points maxItems 0`, `projection_continuity` (epoch/sequence, không có thời điểm).
- **Thực trạng:** tên khóa của bộ ba Internal/Broker/Difference (Equity, Fees, position, Open orders) không có trong contract; cột Leverage, Ack latency, Entry, Mark không có kiểu; không có chuỗi cấp deployment; gap không có khoảng "từ 11:52Z đến 12:04Z"; findings không có Opened; plans không có Envelope/Author.
- **Mong muốn:** Triad có số, bảng Positions/Orders đủ cột hi-fi, chart Live net PnL và Return since canary start, Continuity có gap window.
- **Thay đổi nhỏ nhất:** (a) schema có kiểu cho `source_panels.*.data` (`figures[] {key, internal, broker, difference}` do server tính); (b) `positions.rows[]` / `orders.rows[]` có kiểu (symbol, side, quantity, entry, mark, unrealised_pnl, leverage, ack_latency_ms, type, price, since); (c) `series.points` cấp deployment (decimal string + `methodology_ref`); (d) `projection_continuity.gap {from, to}`; (e) `findings.rows[].opened_at`, `promotion_plans.rows[].envelope`, `.author`; (f) bỏ các `const` nguồn tối khi nguồn bật. Cùng với đó một fixture SOURCE_BACKED hợp schema.
- **FE làm khi chờ:** in chính các cột đã publish dưới tên field của nguồn (không đơn vị, không làm tròn, không tô theo dấu); cột hi-fi `Not published (FE-072)`; Difference không tự trừ; mismatch → "Hidden" khác "Not available"; test lab bằng fixture mức view-model (FIXTURE_LAB).

### Bốn yêu cầu chưa đánh số (mã tạm S3-U1…U4)
**S3-U1 · P2 · Route keyset `execution.paper-workbench.shadow-panel.v1`.** Locator: `packages/contracts/openapi/execution-analytics.openapi.json:56-72,188` (`GET /api/v1/execution/deployments/paper/{deploymentId}/projection/{panel}`, `panel` ∈ orders|positions, `limit` ≤ 250, `sort`, `after`/`before`, schema `PaperWorkbenchShadowPanelResponse`). Thực trạng: mô tả "N07 narrow, deployment-scoped shadow projection. Registry promotion remains a separate owner action"; không màn FE nào gọi. Profile Paper là một đọc ~7,4 MB và ~6 s (comment trong `execution/screens/recomposeContainers.tsx`, ngoài `v2/`; D12). Cần: Codex nói route đã được serve chưa, đã qualified chưa, và có thay được phần orders/positions của profile không. FE khi chờ: một đọc profile + nút Refresh, bảng cắt 200 hàng với "Showing N of total".

**S3-U2 · P2 · Schema đã phát hành + fixture cho `alpha-resource`, `subject-records`, observed-timeline, market-candles.** Locator: `api/fixtureApi.ts:304` (FE đọc `execution.alpha-resource.v1`), `api/ports.ts:381,392` (`getMarketCandles`, `getObservedTimeline`), `screens/alpha/replay/replay.l2l3.test.tsx:6-12`; `packages/contracts/openapi/execution-scoped-records.openapi.json:1198` (`portal.execution.subject-records.v2`); `packages/contracts/schemas/execution-resource-scoped.v2.schema.json` (đã có `alpha-resource.v2`, FE đọc v1). Thực trạng: Alpha 360 và Trade Replay chỉ được kiểm với double viết tay `e2e/bffDoubleAlpha.ts`; `packages/contracts/fixtures` chỉ có fixture TEST_ONLY_SYNTHETIC, không có canonical cho bốn contract. Cần: schema + fixture canonical (rỗng / 1 / nhiều / một trang keyset) và quyết định FE nên đọc v1 hay v2. Kết quả hôm nay là "khớp double", không phải real-API.

**S3-U3 · P3 · Xác nhận `getFinancialChart({subjectKind:"deployment"})` và `getQueryAnalytics("deployments", id)`.** **NOT VERIFIED.** Locator: `api/ports.ts:343,371`; chỗ gọi hiện có: `screens/account/reads.ts:116` (account) và `screens/portfolios/portfolio/use360.ts:58` (portfolio). Màn Paper V2 chỉ gọi `getPaperWorkbenchProfile` và `getDeploymentQuality` (`screens/workbench/useWorkbenchReads.ts:124-125`); không màn stage nào gọi `deployment`. Cần: Codex nói hai loại subject này có được phục vụ không (và cho environment nào). FE khi chờ: chart Paper từ `account_equity` của profile, chart Canary/Live `Not published`. Không khẳng định server có hay không.

**S3-U4 · P3 · FE-051 mở rộng tới vị thế của deployment.** Hi-fi Paper Positions có Long / Short / Gross; hôm nay profile chỉ có `quantity`, `side`, `avg_px_open`, `mark`, `unrealized`. Đề nghị: ghi chung vào FE-051 (long/short/gross theo side, cho account **và** deployment). FE khi chờ: cột đã publish (D13d).

## Conformance 2026-10-21 (DEBT-UXM07-018): hai chỗ schema đã phát hành không khớp cái server gửi

Phát hiện khi viết `workbench.conformance.test.ts` và `request.conformance.test.ts` (schema là oracle). Reader FE đã được sửa cho khớp schema (0 body lỏng hơn schema); chỗ dưới đây là chỗ **schema** cần đổi, nên mỗi mục có một dòng pinned trong test ("sổ" X-1, SI-1, SI-2, SI-3): khi schema đổi, test đỏ và dòng đó phải bị xoá.

### FE-073 · P2 · `execution-paper-read.v1` không liệt kê năm thành viên server đang gửi
- **Locator:** `packages/contracts/schemas/execution-paper-read.v1.schema.json` (root, `Capability` và `Data` đều `additionalProperties: false`); `apps/control-api/src/paper-read/paper-read.service.ts:638-640` (`read_at_ms`, `as_of_ms`), `:648` (`panels`), `:439` (`data.history_windows`), `:619` (`capabilities[].lineage_scoped_out`).
- **Thực trạng:** body thật của `GET /screens/paper/{id}[/vn-market]` không hợp lệ theo schema đã phát hành ở năm chỗ trên (server chỉ kiểm `Query`, không kiểm cả envelope: `paper-read-blotter-scope.spec.ts:24-30`). FE đọc `read_at_ms`/`as_of_ms` (đồng hồ EDS-02) và `history_windows.account_equity` (envelope downsample của chart equity).
- **Mong muốn:** schema liệt kê năm thành viên đó với kiểu (hoặc server thôi gửi nếu không còn dùng); sinh lại `generated/*.d.ts`.
- **Thay đổi nhỏ nhất:** thêm `read_at_ms`, `as_of_ms` (integer, epoch ms), `panels` (object), `data.history_windows` (object), `Capability.lineage_scoped_out` (cùng kiểu `lineage_rejects`).
- **FE làm khi chờ:** reader Workbench (`v2/readers/paperRead.ts`) dung nạp đúng năm thành viên này, mỗi cái trong hình dạng riêng, và từ chối cả body khi bất kỳ chỗ nào khác vỡ schema; test ghim cả hai chiều (schema từ chối từng thành viên, reader vẫn đọc).

### FE-074 · P2 · `POST /governance/approvals`: request, Problem và 409 duplicate
- **Locator:** `packages/contracts/schemas/execution-governance-product.v1.schema.json#/$defs/ApprovalCreateRequest`; `packages/contracts/openapi/execution-governance.openapi.json#/components/schemas/Problem`; `apps/control-api/src/governance/contracts.ts:460` (`workspace_id` tùy chọn), `apps/control-api/src/http-error.filter.ts:127,165` (`details`, `public_copy_key`, `safe_next_action`), `governance.service.ts:559-563` (`DUPLICATE_OPEN_APPROVAL` mang `details: {approval_id}`).
- **Thực trạng:** (a) schema đòi `workspace_id`, server (và client) coi là tùy chọn; (b) `Problem` đóng nhưng server gửi ba thành viên không có trong schema; (c) ở 409 `DUPLICATE_OPEN_APPROVAL` id của approval đã có nằm ở `details.approval_id`, còn message ("An open approval already exists for this alpha and evidence run.") không có id, nên liên kết tới request cũ trên màn New request luôn tối với server thật (FE đọc id từ message, `httpApi.ts` ngay sau 409); (d) fixture `problem.valid.json` là dạng RFC 9457 (`type/code/title/detail/status`), không phải `Problem` mà server trả.
- **Mong muốn:** (a) bỏ `workspace_id` khỏi `required`; (b) thêm `details` (object), `public_copy_key`, `safe_next_action` vào `Problem`, và một ví dụ 409 duplicate có `details.approval_id` (pattern `Identifier`); (c) một fixture `Problem` đúng dạng server trả.
- **Thay đổi nhỏ nhất:** như (a)-(c); FE sẽ đọc `details.approval_id` khi schema công bố nó.
- **FE làm khi chờ:** `v2/readers/approvalCreate.ts` đọc `Problem` chặt (dung nạp đúng ba thành viên, không đọc nội dung); body không đúng `Problem` thì mã lỗi không được tin (`HTTP_<status>`, một 409 không còn là "duplicate"); body 2xx vỡ `ApprovalCreateResponse` là "không rõ kết cục", không bao giờ "created". Liên kết tới request cũ vẫn tối cho tới khi (b) có.
