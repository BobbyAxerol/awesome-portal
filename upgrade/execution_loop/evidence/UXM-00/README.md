# UXM-00 — Audit và reuse map (Claude), 2026-10-17

Phạm vi: **tài liệu-only**, không đổi route/runtime/UI. Bobby chọn "thiết kế cả bộ song song, nối thật sau" ngày
2026-10-17 và yêu cầu làm theo kế hoạch đã duyệt; tôi coi đó là giao lane thiết kế (UXM-00 → 03/04/05 lowfi), **không**
gồm UXM-07 (code), UXM-08/09 (nối thật), deploy hay push.

## 1. Pin và mức bằng chứng

| Mục | Giá trị | Mức |
| --- | --- | --- |
| FE worktree | `/home/bobby/portal-research-fe`, `claude/fe-parity` @ `eafeb31e` (trên `docs/research-loop-plan` @ `0aad2697`) | SOURCE |
| Kiểm kê nguồn | subagent chỉ-đọc `ad491faedaae87b94` (không build/chạy), tôi kiểm lại các điểm then chốt: `previewRegistry.ts`, `PortalRoutes.tsx`, hai ảnh lowfi | SOURCE_CONFIRMED |
| Preview build | `EXECUTION_PREVIEW_ENABLED` do `VITE_EXECUTION_PREVIEW_ENABLED==="true"` lúc build; build Docker cục bộ mặc định **tắt** | SOURCE |
| Browser audit | Thử `127.0.0.1:8090` và `:8080` lúc 2026-10-17: cả `/execution` và `/deployments/alphas` trả **trang chủ Portal** (landing "Backtesting, walk-forward…"), không phải màn Execution | **BLOCKED_NEEDS_PIN** |

**Không claim đã xem UI Execution đang deploy.** Hai stack cục bộ không phục vụ màn Execution (cờ preview tắt hoặc cần phiên đăng nhập)
nên mọi mô tả dưới đây là **source-derived**. Điều cần để đóng "browser audit": Bobby chỉ ra một deployment/ảnh chụp được phép dùng,
hoặc cho phép dựng build preview riêng (cờ bật, `playwright.research-preview.config.ts`, làn FIXTURE_LAB/BFF_DOUBLE, ghi nhãn rõ
không phải production). Tôi sẽ làm làn thứ hai khi gói code được giao; làn thiết kế không cần nó.

## 2. Bản đồ route hiện có (V1, nguồn là registry + `previewRegistry.ts`)

22 screen id có component duyệt. Route do `registry.json` quy định, không phải code (`PortalRoutes.tsx:170-224`). Transport sản phẩm luôn
`createHttpApi` (`/api/v1/execution`); `productBoundary.test.ts` cấm fixture trong product graph. `GET /screen-contracts` báo màn nào AVAILABLE.

| Nhóm | Route | Màn | Ghi chú deep-link |
| --- | --- | --- | --- |
| Command | `/execution` | CommandCenter (triage) | không param |
| Operations | `/execution/operations`, `/execution/operations/incidents/:id` | OperationsQueue, IncidentDetail | `?operation=` |
| Governance | `/governance/approvals` (+`/new`, `/:id/r1`, `/:id/r2`, `/:id/live`), `/governance/waivers`, `/governance/exit-reviews/:id` | Inbox, Gate R1/R2/Live, Waivers, Exit | `?workspace_id`, `?alpha&run&claim` |
| Stage | `/deployments/{paper,sandbox,live}` (+`/:id`, `/paper/:id/vn-market`, `/live/:id/canary`) | Overviews, Workbench, Certification, Canary, Live Ops | `?tab` (Paper) |
| Blotter | `/deployments/blotter` | FullBlotter | `?filter` |
| Entity | `/deployments/alphas(/:id)`, `/deployments/portfolios(/:id)`, `/deployments/accounts(/:id)` | Fleet, Alpha/Portfolio/Account 360, Bindings | `?tab` (Alpha, Portfolio), `?binding` |
| Admin | `/administration/actions`, `/administration/users`, `/administration/profile-access` | AdminActionDrawer, Users, ProfileAccess | owner/ADMIN-gated |
| Lab | `/execution/_fixtures` | Fixtures (1988 dòng) | luôn gắn, không ở registry |

Điểm yếu deep-link: **bộ lọc/phân trang của AlphaFleet là `useState`, không nằm trong URL** (`recomposeContainers.tsx:2186-2243`), trái với yêu cầu guide §4.3.
`useParamState` (`routeState.ts`) đã có để dùng.

## 3. Ma trận giữ / đổi / thêm theo guide M01–M10

| Màn guide | Nền hiện có | Phán quyết | Việc cần cho V2 |
| --- | --- | --- | --- |
| M01 Overview | `/execution` Command Center (triage, không phải NAV) | **THÊM** (khung dùng lại) | Hàng KPI vốn/PnL/DD/Score; panel vốn tách; attention; contributors; trạng thái thưa. Chưa có component KPI đa-giá-trị/delta |
| M02 Portfolios | `PortfolioList.tsx` (132 dòng, chỉ owner/state/allocation) | **ĐỔI** | So sánh cùng basis, concentration, health; sort/filter/paging; chọn basis |
| M03 Fleet | `AlphaFleet.tsx` + container | **ĐỔI tại chỗ** | Tìm/lọc owner/health, group-by ≤2 cấp, sort nhiều khóa server-side, URL state, cột QBTS, tab "All" |
| M04 Portfolio 360 | `PortfolioThreeSixty.tsx` (6 tab) | **ĐỔI** | Tab Allocations/Alphas/Accounts/Risk/People, Score; không có "Move money" |
| M05 Alpha 360 | `AlphaThreeSixty.tsx` (10 tab) | **ĐỔI** | Timeline xuyên stage, evidence/lineage, Regime Fit (tile 9 đang `insufficient_data`), điều hướng bảo toàn context |
| M06 Account 360 | `AccountBroker360.tsx` + Bindings | **ĐỔI** | Phân định logical vs physical, shared balance, margin scope |
| M07 Deployment detail | Paper/Sandbox/Canary/Live/Blotter/TradeReplay | **GIỮ** | Chỉ breadcrumb (tên thay vì id) và state |
| M08 Archived | không có | **THÊM** | Màn mới + paper monitor + review kích hoạt lại |
| M09 Operations | OperationsQueue, Incident, Inbox, AdminActionDrawer | **ĐỔI nhẹ** | Hợp nhất receipts applied/pending/unknown + audit; contract-first |
| M10 Profile & Access | `ProfileAccess`, `UsersAccess` (owner/ADMIN) | **ĐỔI** | View tự-xem + giải thích "vì sao không được" |

## 4. Component dùng lại và khoảng trống

**Dùng lại được ngay** (V1 đã có, đã qua gate): `ExecutionWorkspace/PageHeader/Tabs/ContextRail/ProvenanceDrawer`, `ExecutionDecisionStrip`
(KPI, tối đa ~5 ô, giá trị chuỗi), `KeysetTable` (ảo hoá >200 dòng, cursor), `PanelState`/`CommissionedPanel` (unavailable/partial/denied),
`SourceFreshness`/`FreshnessBanner`, `StatusChip` (PARTIAL không bao giờ xanh), cells `Num/Money/Ratio/Stamp` + `formatExact*` (không bao giờ k/M),
`ExecutionDecisionBar`, `EquityChart` (uPlot, downsample server, bảng thay thế, a11y), `ReplayCandleChart`, `cap.ts` (cắt nhưng nói đã cắt).

**Khoảng trống** (không có component): KPI đa-giá-trị/delta/sparkline; bảng so sánh cùng-basis có sort + chọn cột + sticky; toolbar lọc/tìm/group dùng chung đồng bộ URL;
drawer xem nhanh một hàng; component Score/Regime (kể cả biến thể "config-pending"); allocation/concentration (treemap hoặc stacked bar); view Archived; view receipts hợp nhất;
view tự-xem quyền; chart ECharts chưa có phím/bảng thay thế (chỉ `EquityChart` và replay có); 660px chưa là điểm kiểm.

**Chart V1 yếu cần gợi ý** (ghi vào §5 đề xuất, không tự thay): ECharts chỉ `role="img"` + aria-label (không phím/bảng); `stageLinesOption` lấy trục x từ `lines[0]`
(lệch nếu timestamp khác nhau — chưa xác minh); lưới tương quan DOM; màu đọc lúc dựng option nên đổi theme phụ thuộc memo của caller.

## 5. Tokens, responsive

Type scale `--exec-font-*` (`execution.css:21-57`); nhà quy ước V2 CSS chỉ dùng `font: var(--exec-font-*)` (Rules §9.5). Theme `research`/`operations`/`execution-carbon`.
Breakpoint hiện có 480/599/640/720/767/899/1023/1100/1279/1365/1439/1500…; **không có breakpoint 660**, không spec Execution ở 660 (đã biết, Bobby cần quyết có kiểm 660 cho V2 không).
`execution.css` 7453 dòng, một stylesheet global tiền tố `.exec-*`. Ghi chú: comment font trong `execution.css` (Inter/JetBrains Mono) **lỗi thời** so với `tokens.css` (IBM Plex).

## 6. Luồng theo persona (nháp, sẽ vào UXM-02)

| Persona | Câu hỏi đầu tiên họ hỏi | Đường đi tối thiểu | Không được thấy |
| --- | --- | --- | --- |
| Manager (read-all) | "Quỹ đang ở đâu? Có gì cần xử lý?" | M01 → portfolio → alpha → deployment | — |
| Researcher | "Alpha của tôi chạy sao?" | "My Execution Overview" (ranh giới own-slice) → alpha của tôi | Tổng quỹ, peer, mẫu số tổng hợp |
| Operator | "Cái nào đang kẹt/không rõ?" | M09/Command Center → incident/operation | — |
| Viewer hạn chế | "Tôi có quyền xem gì?" | M10 | Giá trị ẩn (không dùng icon khoá mà vẫn tải) |

## 7. UNKNOWN / chưa kiểm

Nguồn dữ liệu và nội dung màn `/` (Command Center của features); khóa param của AdminActionDrawer (`containers.tsx:1090`); giá trị `BREAKPOINTS` của e2e;
ngưỡng hiển thị lưới tương quan; ngữ nghĩa bảng của lưới tương quan; strings permission theo feature ngoài `live.read` của Portfolios; tình trạng test (chưa chạy).
Contract cho NAV/flows/score ở backend **đã đọc ở proposal §1**, không đọc lại ở đây.

## 8. Hai ảnh lowfi (đã xem)

Ảnh 1 "Primus Portfolio Overview": From/To ngày; hàng Current Total, Profit Amount, Total/Realized/Unrealized PNL %, Current Drawdown from ATH, Max Drawdown,
Portfolio Score (QBTS Weighted), Alpha Score; hai cột Initial/Added Funds; vùng "PNL Chart: Initial + Added Funds". Ảnh 2 Alpha Fleet: tab All/Live/Canary/SandBox, cột
Alpha/Version, Owner/Portfolio, Stage Presence, Alloc, PNL Amount, Unrealized PNL, Account Balance, Equity 30D, Health/Source State, QBTS; (sort) ở 4 cột.
Ngày mẫu 30/06/27–10/07/27 và `xx` chỉ là ví dụ (guide §2). Guide §6.2 đã quyết hai cột Initial/Added thành breakdown dòng tiền, không phải hai track record.

## 9. Request và nợ mới từ UXM-00

| ID | Nội dung | Ghi |
| --- | --- | --- |
| UXM-00-D1 | Browser audit cần pin deployment hoặc build preview riêng | Hỏi Bobby khi cần đóng UX-F23 |
| UXM-00-D2 | AlphaFleet filter/cursor không ở URL | Việc của UXM-04/07, không phải request backend |
| UXM-00-D3 | Comment font cũ trong `execution.css` | Chỉ ghi chú, không sửa trong UXM-00 |
| ELP2-REQ-00-001 | Codex→Claude audit | **ACK một phần (CHANGES_REQUESTED không có):** nhận inventory source-derived; browser audit BLOCKED_NEEDS_PIN. Request FE→BE vẫn ở [sổ đồng bộ](../../FRONTEND_BACKEND_SYNC.md) §3 |

## 10. Exit và tiếp theo

UX-F23: **source-derived PASS, browser PARTIAL (blocked)**. Không đổi routes/runtime/UI; rollback = xóa file này.
Tiếp theo: UXM-01 (IA + metric dictionary, bám chặt guide §4–§8 và hai ảnh) rồi lowfi M01/M02/M04 và M03/M05/M06/M07 (UXM-03/04). Backend tiếp tục không phụ thuộc UXM-00.
