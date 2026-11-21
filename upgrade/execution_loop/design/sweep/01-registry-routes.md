# Sweep 01 — Registry, routes, sidebar, ID links (Execution V1)

Nguồn đọc (read-only): `apps/portal/registry/registry.json` (revision 6, 23 features, 39 screens, 8 groups), `frontend/src/app/PortalRoutes.tsx`, `app/Sidebar.tsx`, `portal/navigation.ts`, `execution/previewRegistry.ts`, `execution/ExecutionPreviewRoute.tsx`, `execution/links.ts`, `execution/idLinks.tsx`, `execution/previewControllers.tsx`, `design/v1all/` (47 png), `design/V1_SCREEN_REVIEW.md`.
Phạm vi: Execution / Governance / Deployments / Administration / Command. Bỏ Research-only: QUANTBT_RESEARCH (4 screens), PLANNING (2), ALPHA_POOL, ALPHA_MINING, STRATEGY_COMPOSER (3) = 9 screens / 5 features. Còn lại 30 screens / 18 features.

Cơ chế cần nhớ:
- Sidebar = `sidebarGroups()` từ registry: feature có `navigation.show_in_sidebar`, lọc theo maturity/capability. **Sidebar liệt kê FEATURE, không liệt kê screen**; screen con (R1/R2/Live, Incident, Alpha 360...) chỉ vào được bằng link/URL.
- Component chỉ mount khi `VITE_EXECUTION_PREVIEW_ENABLED=true`. Tắt cờ: mọi screen Execution rơi về `FeaturePreview` (brief COMMISSIONED).
- Route của screen trùng route gốc của feature thì đi qua vòng lặp features (dùng `EXECUTION_PREVIEW_FEATURE_DEFAULTS` hoặc screen khớp route); route con thì đăng ký riêng từ `registry.screens` có trong `EXECUTION_PREVIEW_SCREEN_IDS`.
- Dispatch thực tế nằm trong `switch (screenId)` của `ExecutionPreviewRoute.tsx`; "overview" (danh sách) của Paper/Sandbox/Live/Alpha/Portfolio/Accounts là nhánh "không có id trong URL" của screen workbench/360, không phải screen registry riêng.

## 1. Bảng screen / feature (30 screens, 18 features)

Cột: PR = có trong `EXECUTION_PREVIEW_SCREEN_IDS` (22 id). SB = feature hiện trong sidebar. v1all = ảnh V1.

| screen_id | route | feature (group, maturity/data_mode) | PR | SB | v1all | notes |
| --- | --- | --- | --- | --- | --- | --- |
| COMMAND_CENTER_SCREEN | `/` | COMMAND_CENTER (command, PROTOTYPE/REAL) | no (module `CommandCenter`) | yes (order 10) | NO | Portal home, không phải Execution CC; `/?new=1` redirect sang QuantBT |
| PORTAL_MAP_SCREEN | `/portal-map` | PORTAL_MAP (command, PROTOTYPE/STATIC_PREVIEW) | no (module `PortalMap`) | yes (20) | NO | Ngoài phạm vi V1 Execution nhưng nằm trong nav Command |
| EXECUTION_COMMAND_CENTER_SCREEN | `/execution` | EXECUTION_COMMAND_CENTER (command, COMMISSIONED/NONE) | yes | yes (30) | command-center.png | profile fixture; có SSE stream (commandCenterStream) |
| EXECUTION_OPERATIONS_QUEUE_SCREEN | `/execution/operations` | EXECUTION_OPERATIONS (command, COMMISSIONED) | yes | yes (40) | operations.png | query `?operation=op_x` mở dòng; `canonicalHref` sửa `/execution/operations/op_x` |
| EXECUTION_INCIDENT_DETAIL_SCREEN | `/execution/operations/incidents/:incidentId` | EXECUTION_OPERATIONS | yes | no (screen con) | incident.png | `?workspace_id=` |
| EXECUTION_APPROVAL_INBOX_SCREEN | `/governance/approvals` | EXECUTION_APPROVALS (governance, COMMISSIONED) | yes | yes (10) | approvals.png | dòng mở review theo gate (`reviewRouteFor`) |
| EXECUTION_GATE_R1_REVIEW_SCREEN | `/governance/approvals/:approvalId/r1` | EXECUTION_APPROVALS | yes | no | gate-r1.png | profile fixture, quant_reviewer |
| EXECUTION_GATE_R2_REVIEW_SCREEN | `/governance/approvals/:approvalId/r2` | EXECUTION_APPROVALS | yes | no | gate-r2.png | portfolio_manager |
| EXECUTION_NEW_APPROVAL_REQUEST_SCREEN | `/governance/approvals/new` | EXECUTION_APPROVALS (REAL/shadow, policy rev 3) | yes | no | approval-new.png | query `?alpha=&run=&claim=`; route tĩnh `new` phải thắng `:approvalId` |
| EXECUTION_GATE_LIVE_REVIEW_SCREEN | `/governance/approvals/:approvalId/live` | EXECUTION_APPROVALS (REAL/shadow, query_enabled) | yes | no | gate-live.png | risk_manager; không có `:approvalId` thì `MissingRouteId` |
| EXECUTION_WAIVERS_REGISTER_SCREEN | `/governance/waivers` | EXECUTION_WAIVERS (governance, PROTOTYPE/REAL) | yes | yes (15) | waivers.png | shadow, query_enabled |
| EXECUTION_PAPER_EXIT_REVIEW_SCREEN | `/governance/exit-reviews/:reviewId` | EXECUTION_EXIT_REVIEWS (governance, COMMISSIONED) | yes | yes (20) | exit-review.png | gốc `/governance/exit-reviews` default sang screen này (không id). Phục vụ cả PAPER_EXIT và SANDBOX_EXIT (chỉ 1 ảnh). `?from=` |
| PAPER_TRADING_SCREEN | `/deployments/paper` | PAPER_TRADING (deployments, COMMISSIONED) | no | yes (30) | paper-overview.png | Không có component riêng: FEATURE_DEFAULTS đưa sang `EXECUTION_PAPER_WORKBENCH_SCREEN` ở nhánh no-id = `PaperOverviewRichContainer` |
| EXECUTION_PAPER_WORKBENCH_SCREEN | `/deployments/paper/:deploymentId` | PAPER_TRADING | yes | no | paper-wb-0..6 (7 tab) | `?tab=` Overview/Positions/Orders/Fills/Sessions/Accounting/Evidence, mặc định Orders |
| EXECUTION_PAPER_WORKBENCH_VNM_SCREEN | `/deployments/paper/:deploymentId/vn-market` | PAPER_TRADING | yes | no | paper-vnm.png | review: VN = chip lịch phiên, không phải màn riêng |
| SANDBOX_TRADING_SCREEN | `/deployments/sandbox` | SANDBOX_TRADING (deployments, COMMISSIONED) | no | yes (40) | sandbox-overview.png | như Paper: default sang CERTIFICATION no-id = `SandboxOverviewRichContainer` |
| EXECUTION_SANDBOX_CERTIFICATION_SCREEN | `/deployments/sandbox/:deploymentId` | SANDBOX_TRADING | yes | no | sandbox-cert.png | 4 tab (Reconciliation/Steps/Promotion plans/Timeline) mà chỉ 1 ảnh |
| LIVE_OPERATIONS_SCREEN | `/deployments/live` | LIVE_OPERATIONS (deployments, COMMISSIONED) | no | yes (50) | live-overview.png | default sang LIVE_FULL no-id = `LiveOverviewRichContainer` |
| EXECUTION_LIVE_FULL_OPERATIONS_SCREEN | `/deployments/live/:deploymentId` | LIVE_OPERATIONS | yes | no | live-ops.png | 4 tab (Exposure & orders/Continuity/Predecessor envelope/Guard rules), 1 ảnh |
| EXECUTION_CANARY_CONTROL_ROOM_SCREEN | `/deployments/live/:deploymentId/canary` | LIVE_OPERATIONS | yes | no | canary.png | 4 tab (Envelope/Positions & orders/Reconciliation/Guard rule), 1 ảnh; tab bằng state, không `?tab=` |
| EXECUTION_PORTFOLIO_360_SCREEN | `/deployments/portfolios/:portfolioId` | EXECUTION_PORTFOLIOS (deployments, COMMISSIONED) | yes | yes (10) | portfolios.png (list) + portfolio-360-0..5 | `?tab=` 6 tab; gốc = `PortfolioListRichContainer` |
| EXECUTION_ALPHA_FLEET_LIST_SCREEN | `/deployments/alphas` | EXECUTION_ALPHA_FLEET (deployments, PROTOTYPE/REAL, shadow, ingestion on) | yes | yes (20) | fleet.png | |
| EXECUTION_ALPHA_360_SCREEN | `/deployments/alphas/:alphaId` | EXECUTION_ALPHA_FLEET | yes | no | alpha-360-0..9 (10 tab) | `?tab=` Overview/Insight Charts/Trade Replay/Positions/Orders & Fills/Risk/Sessions/Accounting/Reconciliation/Audit |
| EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN | `/deployments/accounts` | EXECUTION_ACCOUNTS_BINDINGS (deployments, PROTOTYPE/REAL, shadow) | yes | yes (60) | accounts.png | `?binding=` mở Binding Detail (BindingDetail.tsx), **không có ảnh** |
| EXECUTION_ACCOUNT_BROKER_360_SCREEN | `/deployments/accounts/:accountId` | EXECUTION_ACCOUNTS_BINDINGS | yes | no | account-360.png | không tab: binding + sync history + findings một trang |
| EXECUTION_FULL_BLOTTER_SCREEN | `/deployments/blotter` | EXECUTION_BLOTTER (deployments, COMMISSIONED) | yes | yes (80) | blotter.png | `?filter=`, `?fill=<id>`; order 80 (70 trống) |
| EXECUTION_ADMIN_ACTION_DRAWER_SCREEN | `/administration/actions` | EXECUTION_ADMIN_ACTIONS (administration, COMMISSIONED) | yes | **no** (`show_in_sidebar:false`) | admin-actions.png | chỉ vào qua link/topbar: `?operation=`, `?action=rotate_credential&binding=`, `?cmd=` |
| PROFILE_ACCESS_SCREEN | `/administration/profile-access` | PROFILE_ACCESS (administration, AVAILABLE) | no (module `ProfileAccess`) | yes nếu có capability `administration.profile_access.manage` (10) | profile-access.png | topbar cũng link tới; screen tự trả denied |
| APPROVAL_INBOX_SCREEN | `/backtests/approvals` | APPROVALS (group backtests, COMMISSIONED) | no | yes (10, group Backtests) | NO | Legacy U15 stub, chỉ `FeaturePreview`; trùng chức năng với EXECUTION_APPROVAL_INBOX |
| DATA_CATALOG_SCREEN | `/data/catalog` | DATA_CATALOG (data_ops, COMMISSIONED) | no | yes | NO | không thuộc Execution, liệt kê cho đủ |

Sidebar thực tế (group order từ `feature_groups`): Command {Command Center, Portal Map, Execution Command Center, Operations} · Governance {Approvals(10), Waivers(15), Exit Reviews(20)} · Deployments {Portfolios(10), Alpha Fleet(20), Paper(30), Sandbox(40), Live(50), Accounts(60), Blotter(80)} · Administration {Profile & Access(10, cần capability)}; Admin Actions (20) bị ẩn. Sidebar không dùng thêm hằng số nào ngoài registry; `previewMounted` bỏ nhãn SOON cho feature `EXECUTION_*` và 3 feature trong FEATURE_DEFAULTS.

## 2. Registry thiếu component/route, và route không có registry

Registry screen KHÔNG có component trong `EXECUTION_PREVIEW_SCREEN_IDS` (8):
- COMMAND_CENTER_SCREEN, PORTAL_MAP_SCREEN, PROFILE_ACCESS_SCREEN: có module trong `MODULES` (OK).
- PAPER_TRADING_SCREEN, SANDBOX_TRADING_SCREEN, LIVE_OPERATIONS_SCREEN: không component riêng, nhưng route gốc render overview qua `EXECUTION_PREVIEW_FEATURE_DEFAULTS` (OK trong code, nhưng là "screen" thiếu trong preview set; test/visual theo screen_id sẽ bỏ sót 3 overview này).
- APPROVAL_INBOX_SCREEN (`/backtests/approvals`), DATA_CATALOG_SCREEN: chỉ `FeaturePreview` (không phải Execution V2).
- Mọi registry screen đều có `route` khác rỗng; không có screen nào thiếu route.
- 9 screen Research-only: QuantBT 4 qua module wildcard; PLANNING 2 module; ALPHA_POOL/MINING/COMPOSER `FeaturePreview`.

Route trong code KHÔNG có registry entry:
- `/administration/users` (`UsersAccess`, ADMIN-only, vào qua topbar; không nav/palette).
- `/execution/_fixtures` (component fixtures Phase 0, không nav) và `/research/_fixtures`.
- `*` NotFound; `RootRoute` shim `/?new=1`.
- Sub-state không có route/screen riêng: Binding Detail (`/deployments/accounts?binding=`), Operations deep-link (`?operation=`), Trade Replay (tab của Alpha 360), `MissingRouteId` (route có `:id` nhưng thiếu id), `/governance/exit-reviews` gốc (default screen, không id).
- Ngược lại, `EXECUTION_PREVIEW_EXTRA_ROUTES` rỗng (rev 6 không còn route phụ).

## 3. Bản đồ ID → route (mọi ID bấm được)

`ID_ROUTES` (`idLinks.tsx`) + `ROUTES` (`previewControllers.tsx`) + `reviewRouteFor` + `targetHrefFor`. Hệ thống KHÔNG suy từ tiền tố; dùng `type` đã công bố (comment trong code cấm prefix-sniffing). Tiền tố dưới đây là quy ước trong fixture.

| Loại ID (prefix mẫu) | Đích | Nguồn |
| --- | --- | --- |
| alpha version `av_…` | `/deployments/alphas/{id}` (`?tab=Audit` cho link audit) | ID_ROUTES.alpha |
| portfolio `PF-…` / `pf_…` | `/deployments/portfolios/{id}` (`?tab=Audit`) | ID_ROUTES.portfolio |
| account `acct-…` / `acc_…` | `/deployments/accounts/{id}` | ID_ROUTES.account; target type ACCOUNT |
| broker binding `deribit_main_01`, `bnd…` | `/deployments/accounts?binding={id}` | target type BROKER_BINDING |
| deployment `dep_…` + env PAPER | `/deployments/paper/{id}` (`/vn-market` biến thể) | ID_ROUTES.deploymentPaper |
| deployment + env SANDBOX | `/deployments/sandbox/{id}` | deploymentSandbox |
| deployment + env LIVE | `/deployments/live/{id}`; canary: `/deployments/live/{id}/canary` | deploymentLive / ROUTES.canary |
| deployment, env thiếu | `null` (không link) | targetHrefFor default |
| deployment theo stage | PAPER_OBSERVATION/PAPER → paper; SANDBOX_VALIDATION/SANDBOX → sandbox; LIVE_CANARY → canary; LIVE_FULL/LIVE → live; mặc định paper | workbenchRouteFor |
| approval R1 `AP-…` | `/governance/approvals/{id}/r1` | reviewRouteFor |
| approval R2 `AP-…` | `/governance/approvals/{id}/r2` | |
| LIVE_GATE `AP-…` | `/governance/approvals/{id}/live` | |
| PAPER_EXIT / SANDBOX_EXIT `EX-…`, `PX-…` | `/governance/exit-reviews/{id}` | |
| new request | `/governance/approvals/new?alpha=&run=&claim=` | |
| incident `inc_…` | `/execution/operations/incidents/{id}` | ROUTES.incident |
| operation `op_…` | `/execution/operations?operation={op}` | links.ts `canonicalHref` |
| fill id | `/deployments/blotter?fill={id}` | |
| blotter | `/deployments/blotter` (`?filter=`) | |
| admin operation / action | `/administration/actions?operation={id}` · `?action=rotate_credential&binding={id}` · `?cmd=` | |
| quantbt run | `/research/quantbt/runs` (chung, không id) | cross-link sang Research |
| ORDER, SYSTEM (target types) | **không link** (không có route per-order) | targetHrefFor |
| finding `rf_…` | không link (chỉ text) | |
| `/deployments/paper/exit/{id}` | rewrite thành `/governance/exit-reviews/{id}` | canonicalHref (fixture cũ) |

Tham số chung: `?workspace_id=` (đọc ở ExecutionPreviewRoute, chuyển vào containers), `?from=` (exit review quay lại), `?tab=` (Workbench/Alpha/Portfolio), `?filter=` (blotter).

## 4. legacy_routes / redirect

- Execution features: `legacy_routes` = `[]` cho cả 18 feature, **không có redirect Execution nào trong registry**.
- Legacy có thật chỉ ở Research/Planning: QUANTBT_RESEARCH `/runs /overview /optimization /parameters /audit` → `LegacyRedirect` tới `/research/quantbt...` (qua `canonicalQuantBTPath`); PLANNING `/roadmap-task-board/` bỏ khỏi redirect (gateway phục vụ).
- Redirect/rewrite khác trong code: `RootRoute` (`/?new=1` → `/research/quantbt/runs/new`); `canonicalHref` (2 rewrite fixture ở mục 3); FEATURE_DEFAULTS (gốc feature → screen mặc định, không phải HTTP redirect).
- V2 sẽ cần redirect mới (V1_SCREEN_REVIEW §1 "FOLD"): `/deployments/paper|sandbox|live` (danh sách) → Fleet `stage=…`; chưa có `legacy_routes` nào được khai báo cho việc đó.

## 5. Màn hoặc điểm vào KHÔNG được V1_SCREEN_REVIEW.md / v1all phủ

Không có trong cả hai:
1. `/` Portal Command Center và `/portal-map` (nav group Command; review chỉ nói "Command Center `/execution`" → M01, chưa quyết `/` có giữ không).
2. `/administration/users` (Users & Access, topbar) — không ảnh, không dòng trong review; Profile & Access có.
3. `/backtests/approvals` (APPROVAL_INBOX_SCREEN stub) và `/data/catalog` — trùng tên với Approval Inbox, cần quyết định bỏ hay giữ redirect.
4. `/execution/_fixtures` — không nav, không cần ảnh nhưng nên liệt kê là "non-product".

Có trong review nhưng thiếu ảnh/trạng thái trong v1all:
5. Binding Detail (`/deployments/accounts?binding=`, `BindingDetail.tsx`) — review có dòng, v1all không có ảnh.
6. Sandbox Cert (4 tab), Canary (4 tab), Live Full (4 tab): mỗi màn 1 ảnh; 9 tab chưa chụp (Steps, Promotion plans, Timeline; Positions & orders, Reconciliation, Guard rule; Continuity, Predecessor envelope, Guard rules...).
7. Exit review biến thể SANDBOX_EXIT (cùng route, chỉ ảnh Paper); Gate R1/R2/Live chỉ 1 trạng thái (chưa có decided/blocked/denied).
8. Incident detail: 1 ảnh (inc_44), chưa có trạng thái resolved/ack/không-quyền.
9. Trạng thái dùng chung chưa chụp: `MissingRouteId`, "unavailable" theo screen contract, `FeaturePreview` (cờ tắt), denied của Profile Access, empty/error/cursor-failure.
10. Điểm vào không phải route: Command palette (`commandPaletteEntries` đưa cả screen có route vào, gồm route có `:param` chưa thay), topbar link tới Users/Profile Access, drawer Admin Actions mở từ Operations/Account (`?operation=`, `?action=rotate_credential`, `?cmd=`), deep-link `?from=` của Exit review, `?fill=` của Blotter.
11. Trade Replay (tab Alpha) có ảnh nhưng review ghi "chỉ log đến khi có nến" — chưa có ảnh nến venue; Insight Charts 16 tile chưa có bản V2 tương ứng.
12. Fleet: ảnh `fleet.png` một trạng thái; KPI strip, lọc Venue, tab Research đã ghi trong review §3, nhưng `?stage=` redirect chưa có route.
13. Portfolio list có ảnh (`portfolios.png`) nhưng nguồn đếm V1: hàng "Unallocated" chưa xác thực trong registry.
