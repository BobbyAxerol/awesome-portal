# Rà soát toàn bộ màn V1 → nơi ở trong V2 (Claude, 2026-10-18, nháp để Bobby duyệt)

Nguồn: 47 ảnh V1 thật (1440px, build preview + BFF double, [v1all/](v1all/)), ba lượt đọc chi tiết bởi subagent (governance/operations, stage, entity 360), kiểm lại với guide v1.1 §5–§15, [README](README.md) và [UXM-02](UXM-02-journeys.md).
Phạm vi: **khoảng 36 màn V1 + tab** — M01–M10 trong HIFI mới chỉ là 10 màn của guide; phần còn lại cần được gán chỗ.

## 1. Bảng đối chiếu V1 → V2

Ký hiệu: KEEP giữ · REFINE sửa · MERGE gộp · FOLD đổi thành bộ lọc/redirect · DROP bỏ.

| V1 (route) | V2 nơi ở | Quyết định | Ghi chú |
| --- | --- | --- | --- |
| Command Center `/execution` | **M01** Overview (khối Needs attention) | MERGE | Giữ cách xếp hạng severity → SLA → age; bỏ bảng Source health nhân đôi và panel Canary twin |
| Operations Queue `/execution/operations` | **M09** tab Commands/Exceptions | REFINE | Queue lên đầu; Source health thu gọn; giữ Mine/Ack/Resolve |
| Incident detail | Route giữ, mở như drawer từ M09 | KEEP | Giữ stepper và checklist gate; thêm 1 dòng lý do khi nút bị tắt |
| Approval Inbox | **M09** tab Decisions | MERGE | Giữ cột gate-track + SLA; chip vuông |
| Waivers & conditions | M09 tab Decisions (phụ) | MERGE | Thay thẻ "runway" bằng timeline thật; bỏ chip nợ thừa |
| New Approval Request | Nút trong Inbox | KEEP | Rút phụ đề còn 1 dòng; giữ thanh "Still needed" |
| Gate R1 / R2 / Live / Exit review | **một khung `GateReviewShell`** | REFINE | Một khung dùng chung: header + dải hành trình, 1 banner kết luận, checklist, điều kiện, thanh quyết định; bảng vốn phẳng, mã vào Provenance |
| Admin Actions | Route giữ (admin), rút gọn | REFINE | Nhóm theo mức rủi ro, lý do dễ hiểu; capital action chỉ bắt đầu ở M04 (F2) |
| Profile & Access | **M10** | REFINE | Self-view "My access" + lưới quyền owner; giữ SEE/DECIDE từng gate |
| Paper / Sandbox / Live overview (danh sách) | M03 Fleet (lọc theo stage) | FOLD | URL cũ redirect sang Fleet `stage=…` |
| Paper Workbench (+VN-market) | Dưới header **M07** | REFINE | 7 tab → Overview + Orders/Fills/Positions/Sessions; VN là chip lịch phiên, không phải màn riêng |
| Sandbox Certification | Dưới header M07 | KEEP+REFINE | 7 bước + review note; thêm dải hành trình (V1 thiếu) |
| Canary Control Room / Live Ops | Dưới header M07, chung header, có nút chuyển Canary⇄Live | REFINE | Giữ envelope, thang bảo vệ, bộ ba Internal/Broker/Difference; giảm mã BLOCKING |
| Full Blotter | Route toàn cục, mở có phạm vi trong URL | REFINE | Thêm lọc stage/deployment/account/alpha; sửa số đếm chip; vừa 1440px |
| Alpha Fleet | **M03** | REFINE | Đã thiết kế |
| Alpha 360 — Overview | **M05** Performance + Deployments | MERGE | Ma trận venue×stage → dải "Where it runs" ở header; lưới KPI execution quality → tab Orders & Fills |
| Alpha 360 — Insight Charts (16 tile) | Tan vào tab chứa nó | MERGE | Chỉ vẽ tile khi có dữ liệu; một dòng "N chart chưa có" |
| Alpha 360 — Trade Replay | More ▾ | REFINE | Chỉ bảng log đến khi có nến; dùng chung với Account |
| Alpha 360 — Positions | More ▾ | KEEP | Link deployment/account |
| Alpha 360 — Orders & Fills | tab chính | REFINE | Thêm venue/client id, phí; link blotter |
| Alpha 360 — Risk / Sessions / Accounting | Gộp vào Positions / Activity / Performance | MERGE | Tab mỏng; Risk chỉ có notional |
| Alpha 360 — Reconciliation / Audit | More ▾ / gộp vào Activity & Decisions | MERGE | Một timeline có bộ lọc loại |
| Portfolios list | **M02** | REFINE | Đã thiết kế; giữ hàng Unallocated |
| Portfolio 360 (6 tab) | **M04** | REFINE | Approvals/Incidents vào More; bảng "Cross-portfolio" bỏ (M02 thay) |
| Accounts list + Binding Detail | M06 + view Physical binding | REFINE | Xoay vòng credential → admin action (M10/Operations) |
| Account 360 | **M06** | REFINE | Giữ bảng Sync history (trong Reconciliation); bỏ Trade replay lặp |
| — | **M08** Archived Alphas | NEW | |

## 2. Vấn đề chung ở V1 (xử lý một lần ở design system, không từng màn)

1. **Hai ngôn ngữ thị giác:** Command/Operations/Incident/Admin là Carbon tối; Approvals/Gates/Waivers/Exit/Profile là "Governance Light" (serif, pill, thẻ bo). V2 cần một theme.
2. **Rò mã nội bộ vào UI** ở 11/13 màn stage và hầu hết màn governance (`N25_…`, `SANDBOX_STEP_*`, `BR-EX-33`, "fixture", "WF 1f"). Quy tắc: một câu đời thường + mã vào Provenance.
3. **"not published" dùng quá nhiều** (~30 ô/màn). Gom thành một disclosure "Chưa có: …".
4. **Cùng khối "Command authority / journal / source health / Canary twin" lặp ở 4 màn.** Thu về một panel thu gọn dùng chung.
5. **Chữ giải thích dài và dev-voice** ("the hi-fi body above is smoke until BR-EX-61").
6. **Số liệu:** định dạng thập phân không đồng nhất (20000 vs 20,000.00), 18 chữ số thập phân ở bảng vốn R2, timestamp ISO thô.
7. **Tab không phải tab:** Paper Workbench có 7 tab nhưng 3 chỉ là con trỏ, 3 giống hệt nhau; thanh tab nằm ~1200px dưới. Canary dùng state thay vì `?tab=`.

## 3. Nội dung V1 chưa có chỗ trong HIFI hiện tại

| Màn | Nội dung | Đề xuất |
| --- | --- | --- |
| Alpha 360 | Ma trận venue×stage; lưới KPI execution quality; timeline order quan sát; scope Portfolio/Venue; link R1/R2/passport | Dải "Where it runs"; KPI vào Orders & Fills; link gate trên header |
| Portfolio 360 | Bảng vốn theo môi trường; sổ cái vốn đầy đủ; ma trận tương quan; benchmark | Allocations có 2 khối Real-funded / Simulated, mỗi khối có ledger; tương quan vào Risk & Health khi có dữ liệu |
| Accounts | Binding Detail, xoay credential | Toggle Physical binding; xoay credential là admin action |
| Account 360 | Trade replay, observed timeline, Sync history, banner maintenance | Sync history trong Reconciliation; replay chỉ ở Alpha |
| Fleet | KPI strip 5 ô, lọc Venue, tab Research | Đếm vào tab; Venue trong More; bỏ Research |

## 4. Luồng người dùng nối cả hai thế hệ màn

**A. Manager hằng ngày — "Quỹ có ổn không?"**
M01 Overview → (Needs attention) → M09 → incident/receipt · hoặc M03 Fleet (lọc Health) → peek → M05 Alpha 360 → Deployments → M07 + màn stage → "← Back to Alpha 360".
**B. Reviewer — đưa alpha qua cổng** (user story: *Là reviewer, tôi muốn thấy bằng chứng đủ hay chưa và quyết định có lý do, để alpha chỉ đi tiếp khi đã chứng minh*)
M09 Decisions (Approval Inbox) → Gate R1 → Gate R2 → Paper workbench (M07) → Exit review Paper → Sandbox cert → Exit review Sandbox → Canary (M07) → Gate Live. Mọi bước dùng một `GateReviewShell` + dải hành trình có thể bấm.
**C. Operator — "Cái gì đang kẹt?"**
M09 Exceptions → hàng lệnh (Intent · Receipt · Reconciliation) → UNKNOWN: Check original request → M06 Account 360 (Reconciliation / Sync history) → Admin action drawer (plan → apply → verify).
**D. Researcher — "Alpha của tôi ra sao?"**
M01 (own slice) → M03 (chỉ alpha của tôi) → M05 (score Pending, Explain; Request archive) → M09 (trạng thái yêu cầu) → M08 theo dõi paper monitor.
**E. Hành động vốn (F2)** — M04 → xem trước (không phải receipt) → xác nhận → M09 theo dõi receipt.
**F. "Vì sao tôi không làm được?"** — nút tắt ở bất kỳ màn → link tới M10 My access (hiện V1 chưa có link này).

## 5. Câu hỏi cần Bobby (kèm khuyến nghị) — xem hội thoại

Thứ tự ưu tiên: (1) stage list gộp vào Fleet; (2) theme thống nhất cho màn Governance; (3) Approval Inbox/Waivers/Incident đặt ở đâu; (4) Alpha 360 tan Insight Charts và gộp tab mỏng; (5) cấu trúc Paper Workbench; (6) sổ cái vốn; (7) M01 và URL `/execution`; (8) khung thời gian mặc định.
Các mặc định theo khuyến nghị (không hỏi riêng): Canary⇄Live chung header, một blotter toàn cục theo URL, Admin Actions giữ route rút gọn, Binding qua toggle, Trade Replay chỉ log đến khi có nến.

## 6. Kết quả quét toàn diện (2026-10-18, 6 agent quét + 1 agent chụp, nguồn: [sweep/](sweep/), [V1_DEEP_INVENTORY.md](V1_DEEP_INVENTORY.md))

Quy mô thật của V1: **18 tính năng, 30 màn registry, 33 mẫu route, 35 tab (6 màn), 22 nhóm bộ lọc/drill-in, 23 nhóm drawer/panel/form/trạng thái, 43 nhóm lab, 66 phương thức API, 21 envelope chart**. Đã chụp 47 + 180 ảnh (cục bộ, không commit, 33 MB).
HIFI hiện chỉ phủ **10 trong 30 màn**; governance, stage, blotter, incident, admin chưa có HIFI.

**Màn/điểm vào bản đầu bỏ sót:** Portal Command Center `/` và `/portal-map`; `/administration/users`; stub `/backtests/approvals`, `/data/catalog`; Binding Detail (`?binding=`); 4 tab Canary / 4 tab Live Ops / 4 tab Sandbox (chỉ bấm mới thấy, **không có URL**); Report pack và Rebalance plan (chỉ bấm, kế hoạch rebalance in số mẫu cứng); form capture/condition composer; các trạng thái incident; trạng thái exit review Sandbox/đã quyết/bị chặn; popover "Other decisions" (Deny, Request changes, Reject).

**Điều khiển trông bình thường nhưng đang chết trong sản phẩm** (đọc từ mã, chưa kiểm trình duyệt): Acknowledge/Resolve ở Operations và Incident; Approve/Deny của gate Live; ô chọn alpha ở New Request; Account 360 "Sync now"/"Dry-run" (`() => undefined`); nút hành động Canary/Live không có handler; "Copy full" provenance; Export CSV bỏ trống 7/11 cột; tab Sessions không có empty state. Drawer plan→apply→verify **chỉ có ở lab**, không ở màn sản phẩm nào.

**Giao diện chưa phản ánh dữ liệu có thật:** server hỗ trợ `sort`, `search`, `owner`, `health`, `venue` cho fleet/bindings và `venue/symbol/side/sort` cho blotter mà V1 không dùng; `group` không có ở endpoint nào (M03 group-by cần backend — FE-012). ~40 route hợp đồng chưa có phương thức `ExecutionApi` (gồm `/manager/*`, capital-commands, profile-access v2).

**Các trạng thái/luồng test biết mà tài liệu thiết kế chưa vẽ:** kết quả UNCERTAIN/abandoned, "202 không phải thành công", idempotency/DUPLICATE/replay, nguyên tắc hai người duyệt và step-up R1–R4, stale giữ last-good, resync khi mất kết nối, retained read-only, population từng phần ("21 of 24"), trần quy mô (150/151, 10^5 dòng). Test chỉ dùng một vai (admin): Manager, Researcher, Operator chưa có kiểm thử UI nào.

**Mâu thuẫn giữa quyết định thiết kế và hợp đồng test hiện có** (cần cập nhật test khi làm code, giữ URL tương thích): S2 (Governance sáng) vs test chỉ Carbon; S1 (gộp stage list) vs 3 route smoke gốc tính năng; S5 (Paper 7 tab → Overview+4) vs hợp đồng `?tab=` 7 tab; S4 (gộp tab Alpha) vs hợp đồng scope dùng chung 10 tab; UI3 (mặc định 90D) vs cửa sổ cố định trong test.

**Bốn concept sáng tạo** (không phải từ V1): [hifi/concepts/](hifi/concepts/) — c1 command bar + context bar + digest + heat map; c2 capital flow + compare; c3 journey spine + fleet board + event ribbon; c4 decision cockpit. Xem Artifact thảo luận.
