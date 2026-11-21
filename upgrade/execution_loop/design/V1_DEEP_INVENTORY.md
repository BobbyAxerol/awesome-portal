# Kiểm kê sâu Execution Loop V1 — route, tab, drawer, form, state (Claude, 2026-10-18, nháp)

Nguồn: đọc mã `apps/portal/frontend/src/execution/**`, `app/PortalRoutes.tsx`, `execution/previewRegistry.ts`, `registry.json` (nhánh `claude/fe-parity`), chạy preview build + BFF double (1440×900, fullPage).
Ảnh: `v1all/*.png` (47, đã có) và `v1all/deep/*.png` (180 mới: 137 ảnh route/tương tác + 43 nhóm lab `lab-*`). Ký hiệu cột "Cách vào": **URL** = vào thẳng bằng đường dẫn/param; **click** = chỉ tới được bằng thao tác; **override** = state có trong mã nhưng BFF double không trả, ảnh dựng bằng fixture hợp đồng chuẩn (`packages/contracts/fixtures`) thay vào route; **lab** = chỉ ở `/execution/_fixtures`.
Cột cuối: đã được `V1_SCREEN_REVIEW.md` bàn tới chưa (yes = ở mức màn, no = chưa).
Lưu ý ảnh: màn Governance có thanh quyết định `sticky` nên ảnh fullPage che phần dưới; các ảnh form/outcome dùng viewport cao 2100px. Ảnh `lab-*` là chụp phần tử nên có đè thanh header cố định (chỉ là artifact chụp).

## 1. Route (33 mẫu đường dẫn)

| id | Route / cách vào | Hiển thị gì | Ảnh | Mục đích | Review? |
|---|---|---|---|---|---|
| R01 | `/` Command Center portal | thẻ ledger + summary + danh sách feature | deep/portal-home | Cổng chung | no |
| R02 | `/portal-map` | bản đồ feature theo registry | deep/portal-map | Điều hướng | no |
| R03 | `/execution` | Source health, "Needs you now" xếp hạng, Fleet health 6 ô, Promotion pipeline, fold Command authority, Today | v1all/command-center | Manager: cần làm gì ngay | yes |
| R04 | `/execution/operations` (+`?operation=`) | KPI, 3 chip lọc, bảng operation (3 trạng thái tách), rail Alerts + Mirror integrity + Triage | v1all/operations, deep/ops-queue-operation-param | Operator: cái gì đang kẹt | yes |
| R05 | `/execution/operations/incidents/:id` | rail OPEN→MITIGATED→RESOLVED, Evidence, Operations taken, Resolution gates, Timeline, Annotations | v1all/incident | Xử lý sự cố, forward-only | yes |
| R06 | `/governance/approvals` (+`?workspace_id=`) | đếm pending/overdue, 3+6 chip lọc, bảng cột gate-track + SLA, fold Recently decided | v1all/approvals, deep/approvals-workspace-param | Hàng đợi duyệt | yes |
| R07 | `/governance/approvals/new` (+`?alpha&run&claim`) | form khai request vào loop | v1all/approval-new, deep/approval-new-prefilled, approval-new-empty-form | Cửa vào R1 | yes |
| R08 | `/governance/approvals/:id/r1` | verdict, checklist, passport, limitations, composer điều kiện, thanh quyết định | v1all/gate-r1, deep/r1-workspace-param | Reviewer duyệt bằng chứng research | yes |
| R09 | `/governance/approvals/:id/r2` | account/risk plan, capital preview (derived), form "Next · create Paper Exit review" | v1all/gate-r2 | Duyệt sẵn sàng vận hành/vốn | yes |
| R10 | `/governance/approvals/:id/live` | live facts, nhánh Canary evidence, gate criteria, nút Approve/Deny | v1all/gate-live | Duyệt bước live | yes |
| R11 | `/governance/waivers` | 5 lane lọc, runway, bảng điều kiện, fold command authority | v1all/waivers | Sổ nợ/điều kiện toàn quỹ | yes |
| R12 | `/governance/exit-reviews/:id` | stepper hành trình, 5 KPI, coverage, drift, plan sandbox, ghi chú, thanh quyết định | v1all/exit-review | Exit review Paper | yes |
| R13 | `/governance/exit-reviews` (không id) | trạng thái rỗng "No exit review to show" | deep/exit-review-noid | Route sidebar không mở nhầm hồ sơ | no |
| R14 | `/deployments/paper` | KPI, return chuẩn hoá, order funnel, runway, "Left paper 90d" | v1all/paper-overview | Danh sách paper | yes |
| R15 | `/deployments/paper/:id` | Workbench 7 tab, rail Exit CTA, banner lịch/stale | v1all/paper-wb-* | Quan sát paper | yes |
| R16 | `/deployments/paper/:id/vn-market` | Workbench + lịch phiên VN | v1all/paper-vnm, deep/paper-workbench-vnm-fills | Paper thị trường VN | yes |
| R17 | `/deployments/sandbox` | 5 KPI, chip trạng thái (suy từ dữ liệu), bảng certification, testnet orders, connectivity, findings | v1all/sandbox-overview | Danh sách sandbox | yes |
| R18 | `/deployments/sandbox/:id` | 7 bước, 4 tab, form ghi review note, rail | v1all/sandbox-cert | Chứng nhận sàn | yes |
| R19 | `/deployments/live` | danh sách live (fixture rỗng) | v1all/live-overview | Danh sách live | yes |
| R20 | `/deployments/live/:id` | Live Full: KPI, MISMATCH slot, 4 tab, thang bảo vệ | v1all/live-ops | Vận hành live | yes |
| R21 | `/deployments/live/:id/canary` | Canary: KPI, 4 tab, guard rule | v1all/canary | Phòng điều khiển canary | yes |
| R22 | `/deployments/blotter` (+`?filter=`) | 5 chip, cột chọn được, Export, bảng order/fill, mở funnel | v1all/blotter | Blotter toàn cục | yes |
| R23 | `/deployments/alphas` | KPI, chip stage, bảng alpha mở rộng deployment | v1all/fleet | Fleet | yes |
| R24 | `/deployments/alphas/:id` (+`?tab&focus`) | Alpha 360, 10 tab, thanh scope | v1all/alpha-360-* | Alpha 360 | yes |
| R25 | `/deployments/portfolios` | danh sách portfolio | v1all/portfolios | Danh sách portfolio | yes |
| R26 | `/deployments/portfolios/:id` (+`?tab`) | Portfolio 360, 6 tab, Report pack, Rebalance plan | v1all/portfolio-360-* | Portfolio 360 | yes |
| R27 | `/deployments/accounts` (+`?binding=`) | danh sách binding, chip, mở rộng | v1all/accounts | Accounts & bindings | yes |
| R28 | `/deployments/accounts/:id` | Account 360: 3 cột Internal/Broker/Difference, headroom, chart, replay, sync history | v1all/account-360 | Đối soát account | yes |
| R29 | `/administration/actions` (+`?cmd`/`?operation`/`?action&binding`) | 24 task theo nhóm, danh mục 64 entry, drawer chi tiết | v1all/admin-actions | Admin action catalog | yes |
| R30 | `/administration/profile-access` | lưới gate × SEE/DECIDE theo tài khoản | v1all/profile-access | Phân quyền governance | yes |
| R31 | `/administration/users` | roster tài khoản, tạo tài khoản, hành động | deep/users-access | Quản tài khoản (owner) | no |
| R32 | `/backtests/approvals` (feature COMMISSIONED, FeaturePreview) | brief + "Run the capability" bị chặn | deep/backtests-approvals-feature | Placeholder cũ trùng Approval Inbox | no |
| R33 | `/execution/_fixtures` (lab) | 43 nhóm component/state | deep/lab-* (xem mục 6) | Cổng Phase 0 | no |
| — | route lạ `/governance/nope` | NotFound "No feature claims this route" | deep/route-not-found | Fallback | no |

## 2. Tab (35 tab, 6 màn) — đã URL hay phải click

| id | Màn / tab | Cách vào | Nội dung (khác nhau?) | Ảnh | Review? |
|---|---|---|---|---|---|
| T01–T10 | Alpha 360: Overview, Insight Charts, Trade Replay, Positions, Orders & Fills, Risk, Sessions, Accounting, Reconciliation, Audit | URL `?tab=` (khoảng trắng `%20`, `&`→`%26`) | 10 nội dung khác; Risk/Sessions/Accounting mỏng | v1all/alpha-360-0..9; deep/alpha-360-replay-focus | yes |
| T11–T16 | Portfolio 360: Overview, Structure & Correlation, Capital Ledger, Approvals, Incidents, Audit | URL `?tab=` | khác nhau | v1all/portfolio-360-0..5 | yes |
| T17–T23 | Paper WB: Overview, Positions, Orders(mặc định, không ghi vào URL), Fills, Sessions, Accounting, Evidence | URL `?tab=`; tab lạ rơi về Orders | 3 tab chỉ là con trỏ, 3 giống nhau | v1all/paper-wb-0..6; deep/paper-workbench-bad-tab | yes |
| T24 | Canary / Envelope (mặc định) | click (state, KHÔNG có `?tab` hay hash) | bảng limit approved vs consumed ("unavailable") + 2 SourceTile | v1all/canary | no |
| T25 | Canary / Positions & orders | click | 3 SourceTile Positions/Blotter/Series | deep/canary-tab-positions-orders | no |
| T26 | Canary / Reconciliation | click | Internal · Broker · Difference | deep/canary-tab-reconciliation | no |
| T27 | Canary / Guard rule | click | chữ guard + bất đối xứng protective vs scale-up + "Request scale" | deep/canary-tab-guard-rule | no |
| T28 | Live Ops / Exposure & orders (mặc định) | click | 3 SourceTile Internal/Broker/Difference | v1all/live-ops | no |
| T29 | Live Ops / Continuity | click | state, gap, epoch·sequence, blocker | deep/live-ops-tab-continuity | no |
| T30 | Live Ops / Predecessor envelope | click | cap vốn/gross/daily loss của canary tiền nhiệm | deep/live-ops-tab-predecessor-envelope | no |
| T31 | Live Ops / Guard rules | click | luật đình chỉ + gap + risk-increasing | deep/live-ops-tab-guard-rules | no |
| T32 | Sandbox / Reconciliation (mặc định) | click | triptych + bảng findings | v1all/sandbox-cert | yes (screen) |
| T33 | Sandbox / Steps | click | bảng 7 bước (evaluation, authority, evidence hash, expiry) | deep/sandbox-tab-steps | no |
| T34 | Sandbox / Promotion plans | click | rỗng "No promotion plan requested" | deep/sandbox-tab-promotion-plans | no |
| T35 | Sandbox / Timeline | click | at (UTC) · action · actor | deep/sandbox-tab-timeline | no |

## 3. Chip lọc, param, fold, drill-in

| id | Mục | Cách vào | Ảnh | Review? |
|---|---|---|---|---|
| F01 | Blotter `?filter=` FILLED/PARTIAL/REJECTED/OPEN (ALL mặc định) | URL (chip cũng gọi lại server) | deep/blotter-filter-* | no |
| F02 | Blotter: chọn cột, Export CSV, mở funnel một order | click | deep/blotter-columns-menu, blotter-export-clicked, blotter-row-funnel | no |
| F03 | Blotter chip Conditional/Brackets + panel cấu trúc nhóm | click; chỉ hiện khi nguồn có group | MISSING: fixture không có group | no |
| F04 | Inbox: Mine/All/Overdue + 6 chip gate (R1,R2,Paper,Sandbox,Live,Exit) | click (không vào URL) | deep/inbox-filter-* (8) | no |
| F05 | Inbox fold "Recently decided" | click; chỉ khi có hàng đã quyết | MISSING: double không trả lịch sử; có ở lab/phase-1 | no |
| F06 | Waivers: Lapsed/Expiring/Open/Waived/All; mở rộng hàng; fold authority | click | deep/waivers-filter-*, waivers-row-expanded, waivers-authority-fold-open | no |
| F07 | Queue: Needs attention/Mine/All retained; chọn hàng → Triage; đóng rail Alerts | click | deep/ops-queue-filter-*, ops-queue-row-triage, ops-queue-alerts-rail-closed | no |
| F08 | Fleet: 6 chip stage; mở hàng alpha → deployment | click | deep/fleet-filter-*, fleet-row-expanded | no |
| F09 | Accounts: chip all/live/testnet/paper/issues; mở hàng | click | deep/accounts-filter-*, accounts-row-expanded | no |
| F10 | Sandbox/Live overview: chip suy từ dữ liệu (chỉ chip có hàng) | click | MISSING: fixture 1 hàng / rỗng nên chip khác bị ẩn hoặc tắt | no |
| F11 | Paper overview: click hàng runway → workbench | click | deep/paper-overview-runway-click | no |
| F12 | Paper overview state empty/partial/stale/unavailable | override (fixture chuẩn) | deep/paper-overview-* | no |
| F13 | Paper WB state orders-shadow | override | deep/paper-workbench-orders-shadow | no |
| F14 | Binding Detail `?binding=` | URL | deep/binding-detail (bảng Capital invariant tràn khỏi thẻ ở cột Headroom) | yes (mức dòng) |
| F15 | Operations `?operation=`; Admin `?operation=`/`?cmd=`/`?action=&binding=` (banner trỏ về Accounts/Queue) | URL | deep/ops-queue-operation-param, admin-actions-* | no |
| F16 | Alpha 360 Trade Replay `?focus=order:..`, đổi interval, Expand chart | URL / click | deep/alpha-360-replay-focus, -interval-1h, -expanded | no |
| F17 | Biểu đồ equity: Log, 1W/1M/3M, Table, Expand, Export (Alpha, Portfolio, Account) | click | deep/account-360-chart-*, alpha-360-overview-chart-table, portfolio-360-chart-1w | no |
| F18 | Alpha 360 thanh scope (Portfolio/Mode/Venue/Window): select tắt khi chỉ 1 giá trị | click | v1all/alpha-360-0 (select hiển thị); MISSING: không có dữ liệu 2 giá trị | no |
| F19 | Portfolio 360 lens tương quan (click ô ma trận) | click | deep/portfolio-360-correlation-lens | no |
| F20 | Danh sách → 360: hàng portfolio / alpha / account | click | deep/portfolios-list-row-open | no |
| F21 | Alpha 360 Orders & Fills mở hàng; link deployment/account | click | MISSING: chưa bắt được selector hàng (không phải lỗi sản phẩm) | no |
| F22 | Admin: lọc Classification (4) và Risk tier (6, trong fold "Full published catalogue") | click | deep/admin-classification-incompatible, admin-tier-r3-protective | no |

## 4. Drawer, panel, dialog, form

| id | Mục | Cách vào | Hiển thị | Ảnh | Review? |
|---|---|---|---|---|---|
| D01 | Admin: drawer chi tiết task (CONNECTED/SUPPORTED_INACTIVE/INCOMPATIBLE/danger) | click hàng | banner trạng thái, ceremony, CLI read-only, params; CONNECTED có "Run local R0 read" | deep/admin-task-selected, -danger-selected, admin-task-connected-run-form (override); biên nhận chạy: MISSING cần kết quả run giả | yes (mức màn) |
| D02 | Admin: chi tiết entry danh mục ("NOT EXPOSED IN PORTAL", Plan nếu có) | click | tier, step rail, route, owner review | deep/admin-catalogue-entry-selected | no |
| D03 | Provenance drawer trong rail (Sandbox, Canary, Live, Exit…) | click `▸ Provenance` | digest/lineage, nút copy | deep/sandbox-/canary-/live-ops-/exit-provenance-open | no |
| D04 | Queue Triage panel (rail) | click hàng | source/verify/triage, Ack/Resolve, link incident "not published" | deep/ops-queue-row-triage; Ack/Resolve bấm: MISSING (nút tắt vì quyền/state fixture) | no |
| D05 | Portfolio "Rebalance plan" preview | click header | operation, targets, writes, governance; chỉ xem | deep/portfolio-360-rebalance-plan | no |
| D06 | Portfolio "Report pack" preview | click header | mô tả nội dung gói báo cáo; chỉ xem | deep/portfolio-360-report-pack | no |
| D07 | Sandbox plan preview (sync / dry-run / smoke) + Paper Report/Admin actions/peer switcher + Incident market band + Queue alert cards + KPI "smoke" | chỉ khi có `demo` (smoke) | không có trên route sản phẩm | lab (lab-sandbox-certification-1d, lab-paper-workbench-1c…, lab-incident-detail-4d, lab-operations-queue-4e) | no |
| D08 | CommandPlanDrawer plan→apply→verify (7 case: chưa có plan, planned, expired, 202 PARTIAL, destructive gõ CLOSE, risk tier) | CHỈ lab; không màn sản phẩm nào gắn | PLAN/APPLY/VERIFY, request key, CLI tương đương, PARTIAL không xanh | deep/lab-commandplandrawer, lab-risk-tier-…, lab-wired-flow-… | no |
| D09 | Gate R1/R2: menu "Other decisions" (Deny, Request changes, Approve with condition) | click | primary đổi theo số điều kiện | deep/r1-other-decisions-menu, r2-other-decisions-menu | no |
| D10 | Composer điều kiện (text, owner, deadline, expires, blocking) | click `+ add condition` | điền → Attach → primary thành "Approve with condition" | deep/r1-add-condition-composer, r1-composer-filled-before-attach, r1-attach-condition-and-primary, r2-add-condition-composer | no |
| D11 | Approve/Deny bấm | click | DecisionTrail: PLAN FAILED vì "Recording a decision is disabled … delivery policy revision 2" (đường thành công chỉ ở lab) | deep/r1-approve-clicked, r1-deny-clicked, r2-approve-clicked, r2-deny-clicked, exit-approve-clicked | no |
| D12 | Fold R1: Passport, Policy & references, "1 item not published" | click | chuỗi provenance, đủ/thiếu | deep/r1-passport-open, r1-policy-references-open, r1-absences-open | no |
| D13 | R1: self-approval khoá Approve; checklist fail + EXPIRED | override R1 | banner khoá, lý do cạnh nút | deep/r1-self-approval-locked, r1-blocking-and-expired | no |
| D14 | CaptureNextStep "create the R2 review" (R1 đã duyệt): chọn deployment, nhập currency | override capture_context AVAILABLE | picker, ô currency, lý do nút tắt | deep/r1-next-create-r2-form, -picked; trạng thái BLOCKED mặc định: v1all/gate-r1 | no |
| D15 | CaptureNextStep "create the Paper Exit review" + ReviewCapturePanel (≥24 ký tự) | click/gõ | sẵn sàng / gửi lỗi (501 double) / đã ghi (override) | deep/r2-capture-ready, -submitted, -recorded | no |
| D16 | Sandbox note capture ("Record a sandbox review note") | gõ + click | ready, recorded (replayed/`open the review`) | deep/sandbox-note-ready, sandbox-note-recorded | no |
| D17 | Exit review: ghi chú reviewer, menu quyết định | click/gõ | ghi chú đi cùng quyết định | deep/exit-note-typed, exit-other-decisions-menu | no |
| D18 | New approval — 8 trạng thái: rỗng, prefilled, ready, created, replayed, duplicate (link AP hiện có), refused (server từ chối), offline | gõ + click / override | panel kết quả + thanh quyết định đổi chữ ("Retry submit") | deep/approval-new-* | no |
| D19 | Incident: MITIGATED, RESOLVED, state lạ (không vẽ rail), không tìm thấy (khung rỗng nút tắt) | override | forward-only; "deployment vẫn HALTED" | deep/incident-mitigated, -resolved, -reopened, -not-found; Acknowledge bấm: MISSING (nút tắt) | no |
| D20 | Incident → operation → Admin drawer (`?operation=`) | click | banner "no operation lookup" + link về Queue | deep/incident-operation-link-to-admin | yes (luồng C) |
| D21 | Profile & Access: chọn tài khoản (activity), dialog Grant, dialog Revoke, prompt step-up, tìm không khớp | click | confirm có "External effect NONE", step-up REQUIRED | deep/profile-access-* | no |
| D22 | Users & Access: mở hàng (lịch sử), form tạo tài khoản, confirm Disable, tìm không khớp | click | roster + hành động có tên hậu quả | deep/users-access-* | no |
| D23 | Gate Live: Approve/Deny | click | nút "NOT YOURS" tắt, không có đường bấm | v1all/gate-live | yes |

## 5. Lỗ hổng chức năng V1 thấy khi đọc mã (ảnh hưởng user story)

- Account 360 **Sync now / Dry-run reconcile** gắn `() => undefined` (recomposeContainers.tsx): nút bấm không làm gì; không có đường từ Account tới Admin drawer.
- Chuỗi plan→apply→verify (CommandPlanDrawer) **không gắn màn sản phẩm nào**; mọi nút Halt/Reduce/Emergency close/Scale-up/Submit exit là nút tắt kèm lý do. Quyết định governance bấm ra "disabled by delivery policy".
- Paper Workbench sản phẩm không có Report/Admin actions/peer switcher (chỉ smoke). Sandbox không có plan sync/dry-run (chỉ smoke).
- Canary/Live/Sandbox dùng state chứ không `?tab=`; hash `urlKey` có trong `ExecutionTabs` nhưng không màn nào truyền.
- Inbox filter, Waivers filter, Queue filter, Fleet chip đều không vào URL (chỉ Blotter `?filter=`) → không chia sẻ được.
- Operations Queue → Incident: link "Open incident — not published (BR-EX-33)".
- Command Center: các biến thể state (empty/partial/stale/unavailable) KHÔNG đổi hiển thị vì màn đọc từ composition, không đọc snapshot (đã chụp thử, ảnh trùng nên bỏ).

## 6. Lab `/execution/_fixtures` — 43 nhóm (deep/lab-<id>)

Component: authoritybadge, freshnessindicator, statuschip-four-vocabularies…, environmentbadge-and-guardband, lifecyclerail, observationprogress, evidencepanel-and-sla, venuescope, charttile, panel-states, commandplandrawer, cold-retention (6 lý do không có hàng), mechanism-m2-zoom, mechanism-m3-subscription, subscription-states, source-completeness, risk-tier-and-delivery-policy, verificationchip, capabilitychip, profilebadge, profile-reconciliation, keysettable-m1.
Màn/state: phase-1-approval-inbox-states (populated, inbox zero, empty×2, loading, partial, denied), phase-2-gate-r1 (SoD ok, you-wrote-it, blocking+expired, đã quyết, unavailable), phase-3-gate-r2, phase-5-paper-exit, wired-flow (list·detail·plan·apply·poll, UNCERTAIN trail), v2-anatomy-paper-demo, v2-equity-chart-demo, v2-guard-asymmetry, live-full-operations-1f, sandbox-certification-1d, canary-control-room-1e (broker stale), operations-queue-4e, incident-detail-4d (open/resolved), analytics-containers-port-screen, command-center-5a, admin-action-drawer-1i (demo WF 1i, Viewer, non-Admin), full-blotter-4c (cross-filter, funnel MISSING ACK, bounded window), paper-workbench-1c-and-vn (gate unmet/met, stale, VN đóng/mở), alpha-360-2a-2b, portfolio-360-1h-3a, account-broker-360-1g. Không có nhóm cho Paper/Sandbox/Live overview, Fleet, Accounts, Binding Detail, Waivers, New request.
Chưa chụp được: Command Center stream (live / auth_expired / source_lost) cần SSE kéo dài; Alpha/Account stream dot; Waivers cursor "← newer / older →" (fixture 1 trang).

## 7. Màn/luồng review đầu tiên bỏ sót → xử lý V2 đề xuất

| Bỏ sót | Đề xuất V2 | Khoảng trống user story |
|---|---|---|
| 4+4+4 tab Canary/Live/Sandbox (nội dung là SourceTile + bảng) | REFINE: gộp Canary⇄Live chung header, tab dùng `?tab=`; Sandbox Steps hợp vào dải hành trình, Timeline vào Activity | Không có deep link tới tab thiếu → khó chia sẻ bằng chứng |
| Report pack / Rebalance plan preview (Portfolio 360) | MERGE vào M04 Allocations: nút "Preview plan" kết thúc ở drawer plan→apply→verify thật | Preview nói "nothing applied" — manager không thể hoàn tất việc rebalance (story E) |
| ReviewCapture/CaptureNextStep (R1→R2→Paper Exit, Sandbox note) | KEEP làm bước "Next" của `GateReviewShell`; thêm hiển thị chuỗi đã tạo | Chưa có màn xem lại các review đã tạo ngoài link `open the review` |
| Menu "Other decisions", composer điều kiện, trail plan failed | KEEP composer; sửa: lý do "delivery policy" bằng lời thường, nút bấm được hay tắt có chỉ báo trước | Reviewer không biết quyết định có ghi được không cho tới khi bấm |
| New approval 8 state (duplicate/replayed/offline) | KEEP; rút phụ đề; duplicate link thẳng review đang mở | — |
| Incident MITIGATED/RESOLVED/lạ/không thấy; Triage; link Queue→Incident chưa có | REFINE trong drawer M09: thêm trường incident trên hàng Queue (BR-EX-33) | Operator không từ Queue sang Incident được |
| Binding Detail tràn bảng; Admin `?action=rotate_credential` chưa có lệnh | REFINE bảng; credential rotation là admin action thật | Rotate credential chỉ là banner trỏ về Accounts (vòng lặp) |
| Account 360 Sync now / Dry-run no-op | DROP nút chết hoặc nối plan→apply→verify | Operator story C kết thúc ở nút không làm gì |
| Provenance drawer, fold command authority/journal/source health ở 4 màn | MERGE một panel dùng chung (đã nêu §2.4 review) | — |
| Chip lọc không vào URL (Inbox/Waivers/Queue/Fleet/Accounts) | REFINE: `?filter=` thống nhất như Blotter | Không chia sẻ/đánh dấu được view |
| Users & Access, `/backtests/approvals` (placeholder), `/` và `/portal-map` | `/backtests/approvals`: DROP/redirect về Inbox; Users: giữ ngoài phạm vi M10 | Trùng điều hướng Approval Inbox |
| Hiển thị CC/Paper/Sandbox/Live overview rỗng-hoặc-một-hàng | REUSE thành Fleet theo stage (đã quyết); cần dữ liệu thật để thiết kế chip | Chip "chỉ hiện khi có hàng" làm bố cục đổi theo dữ liệu |
