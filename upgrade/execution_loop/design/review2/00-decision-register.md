# Sổ quyết định tổng hợp vòng rà 2 (Claude, 2026-10-18)

Nguồn: 7 báo cáo độc lập [01 luồng](01-flow-and-stories.md) · [02 cấu trúc](02-ia-redundancy.md) · [03 giao diện](03-design-system-consistency.md) · [04 dữ liệu](04-data-feasibility-backend-asks.md) · [05 vai trò/trạng thái](05-roles-permissions-states.md) · [06 thuật ngữ](06-terminology-copy.md) · [07 route/URL](07-routes-urls-migration.md). Khoảng 70 điểm quyết định đã gộp trùng.

## A. Mâu thuẫn thật giữa các quyết định đã chốt (cần Bobby chốt lại)

| # | Mâu thuẫn | Báo cáo | Khuyến nghị |
| --- | --- | --- | --- |
| A1 | **S2 (Governance sáng) + S3 (tab Decisions ở M09) vs C4 (cockpit là trải nghiệm duyệt chính)**: hàng đợi duyệt đang ở 4 nơi (nav Governance, tab M09, cockpit, dòng APPROVAL ở M01); tên gọi 3 kiểu (Inbox/Decisions/Approvals) | 01, 02, 03, 06, 07 | Một mục nav **Approvals** chạy cockpit; bỏ tab Decisions ở M09; giữ URL `/governance/approvals/:id/{r1,r2,live}` làm URL chọn. Giao diện: xem A2 |
| A2 | **S2 vs kiểm thử và design system:** theme sáng governance đã bị xoá khỏi tokens, test hiện khẳng định một canvas Carbon, cockpit hiện dùng hex riêng và serif chưa gói; đổi sang sáng tốn ~15 baseline + một bộ token | 02, 03, 07 | Khuyến nghị 5/7 agent: **một theme Carbon**; nếu giữ sáng thì chỉ cho route duyệt đầy đủ và khôi phục token sáng có test |
| A3 | **Cockpit chỉ phủ gate R1/R2/Exit/Live**, trong khi cần duyệt archive, reactivation, capital, waiver; "Approve archive" hiện không có màn | 01 | Cockpit sở hữu **mọi loại quyết định** (làn theo loại) |
| A4 | **Ngữ cảnh:** khung thời gian mặc định lệch (UXM-01 30D, UI3 90D, M01 vẽ 30D); điều khiển env/window lặp ở từng trang; context bar C1 chưa áp cho M01–M10; **backend chưa có tham số window** (FE-025) | 01, 03, 04, 07 | Một **context bar của shell**; 90D mặc định; chưa có dữ liệu thì tự lùi về khung rộng nhất đã publish và nói rõ; bỏ "As of" cho đến khi backend hỗ trợ |
| A5 | **Researcher:** hifi hiện số tiền tuyệt đối trái field policy §3.2; M10 nói Accounts "Not shown" nhưng M06/M07 có biến thể researcher; C1 (heat map, ⌘K, digest) lộ peer; cùng một alpha 120k ở M01/M03, 200k ở M02/M04 | 05 | Researcher thấy **allocation + PnL của mình** (không Balance, sleeve ledger, PM capital); **ẩn Accounts**; heat map ẩn; ⌘K do server lọc quyền; sửa số mẫu |

## B. Quyết định cấu trúc: tôi áp theo khuyến nghị đồng thuận (báo nếu bạn phản đối)

1. Fleet có **ba chế độ xem trên một URL** (`view=table|board|map`); heat map không còn panel riêng ở Overview.
2. **Compare là hành động trên hàng** (chọn nhiều ở M02/M03 + đường dẫn), không phải tab của Portfolio 360.
3. M01: một panel **Contributors** có công tắc (thay Portfolios + My alphas); bỏ bảng "All performance rows" (đặt định nghĩa vào tooltip); **Needs attention** là top-N dẫn xuất từ M09, digest chỉ hiện **thay đổi**, ⌘K chỉ điều hướng.
4. **Một component `JourneySpine`** (đủ / gọn / mini) thay chip stage, dải M07 và ma trận "Where it runs"; **một `EventFeed(scope)`** cho Activity, Audit, ribbon, digest, ledger.
5. Portfolio 360: Approvals/Incidents không còn tab riêng mà là bản nhúng theo phạm vi dưới Activity; bỏ nút "Recall" ở M03 (vốn chỉ bắt đầu từ M04).
6. Archived Alphas: chế độ xem **trên Fleet** (không ở "All"; alpha đang xin archive/đang xả vẫn hiện ở Fleet kèm cờ vì còn rủi ro). Researcher được **gợi ý** reactivation và **rút lại** yêu cầu.
7. Sidebar còn 9 mục (7 với manager): Overview · Portfolios · Alpha Fleet · Accounts · Operations · **Approvals** · Blotter (link-only + ⌘K) · Profile & Access; Waivers nằm trong Approvals; Admin Actions không liệt kê.
8. Vai trò = **capability + preset** (Manager/Researcher/Operator/Reviewer/Viewer); trang đầu tiên theo capability; điều khiển bị chặn **hiện bị tắt + một dòng lý do + link M10** theo một từ điển capability→lý do dùng chung.
9. Cockpit: thêm menu "Other decisions" (điều kiện, yêu cầu sửa, từ chối, gia hạn); người tạo yêu cầu được **Withdraw** nhưng không tự duyệt; **gate Live đóng kèm lý do** đến khi backend mở; **step-up** là khối inline trong rail.
10. Trạng thái V2 còn thiếu (loading, terminal, authorized-empty, revoked, resync, UNCERTAIN, DUPLICATE, retained read-only, session expired, source lost, MISMATCH): thiết kế đủ theo bảng chữ ở báo cáo 05.
11. Back theo nguồn (`from` param) và khôi phục trạng thái danh sách.

## C. Route và URL (báo cáo 07): áp theo khuyến nghị
`/execution` trở thành M01 tại chỗ · URL duyệt giữ nguyên làm URL chọn · slug tab kèm bảng bí danh nhãn V1 (`?tab=Insight+Charts` vẫn mở) · Paper mặc định Overview · bộ lọc Real-funded = `stage=canary,live` · giữ redirect vĩnh viễn · VN-market vẫn là route · Incident là route lồng kiểu drawer · cờ tính năng **theo từng màn** · registry chỉ **thêm** màn, không đổi tên `screen_id` (Codex là chủ registry: gửi request, không sửa).

## D. Dữ liệu và phát hành (báo cáo 04)
- Hiện **không có nguồn V2 nào đạt chuẩn**: mọi con số là fixture hoặc "không có". Sau 14 request mới FE-023…036 (P1: 025 window, 027 lịch sử stage/days-in-stage, 028 tiêu chí gate, 030 receipt/quorum).
- **Phát hành đầu tiên chỉ ra thứ có dữ liệu thật:** Approvals/cockpit (chưa có chart evidence), M09, M10, định danh Fleet + ⌘K + context bar, bảng order/fill/position. **Chờ nguồn:** digest, Sankey, series Compare, ribbon, evidence diff, mọi thứ có tiền.
- Hiển thị: cockpit nút quyết định **hiện nhưng tắt, "Preview · not recorded"** đến khi có hợp đồng receipt; heat map nhãn "Size: equal" khi thiếu allocation; Score "chưa có policy" là **một chip ở masthead**, bỏ ô KPI và cột "Pending".

## E. Đặt tên và chữ (báo cáo 06): áp mặc định
Bộ chọn "Real-funded / Paper / Sandbox" ("Live" chỉ là stage; URL `env=live` giữ) · "Approvals" · "Incidents" (một từ) · "NAV" mọi nơi · Score "Not scored · policy not set" · chiều hiển thị sau lệnh gọi "Display" (Reconciliation chỉ cho sổ cái/venue) · "Source not qualified" · "R1 gate" · UTC `17 Oct 09:14Z` (local khi hover) · một cặp nhãn "This sleeve / Whole account" · "Names only" · ID là nhãn phụ mono, cấm enum thô ngoài Provenance/Audit · không viết tắt "20k" · bỏ "—" cho giá trị thiếu.

## F. Giao diện (báo cáo 03): áp mặc định, trừ F1 và F2 cần hỏi
Cờ trạng thái do **thuộc tính ngữ nghĩa** gán, không đoán bằng chữ; chấm tròn chỉ cho độ tươi/trạng thái sống, mọi trạng thái khác là cờ có ký hiệu · thêm token `--series*`, `--flag-*`, bỏ `color-mix` để qua test · một kit duy nhất (bỏ ~36k ký tự CSS cục bộ, 4 kiểu drawer, 3 kiểu menu) · ≤1100px nav là overlay có nút menu; bảng duyệt thành thẻ ở 660px · drawer chỉ dock khi bảng vẫn vừa · thêm role chữ `readout` 18/24 và `kpi-na` 16.
- **F1 màu tăng/giảm:** chữ có dấu xanh/đỏ, chart dùng xanh dương/cam/teal; cam chỉ cho drawdown/cột lỗ (bỏ cam ở recall, returned pin, series Compare thứ ba).
- **F2 tham vọng hình ảnh:** làm Sankey, board, ribbon, heat map, spine cho M04/M05/M09 ngay ở bản đầu, còn lại giai đoạn 2.

## G. Việc kế tiếp sau khi chốt
1. Cập nhật kit (token, cờ ngữ nghĩa, một context bar, một drawer, `JourneySpine`, `EventFeed`) rồi làm lại HIFI M01–M10 và các concept theo kit mới.
2. HIFI cho các màn còn lại (Approvals cockpit đầy đủ các làn, Blotter, Incident, stage tabs, Admin, Trade Replay).
3. Cập nhật tài liệu luồng + Artifact; gửi request FE-023…036 cho Codex.
