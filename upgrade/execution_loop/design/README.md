# Execution Loop V2 — lowfi design (Claude, UXM-01…05)

Lowfi, grayscale, interactive wireframes. **Not production CSS, not data from any source.** Open `lowfi/*.html` in a browser;
the top bar switches state (Healthy / Source not ready / Researcher own-slice / Loading) and toggles numbered annotations.
Annotations cite guide sections and backend limits; they are the design contract for review.

Shared kit: `lowfi/kit.css`, `lowfi/kit.js`. Reference screens (quality bar): `m01-overview.html`, `m03-fleet.html`.
Status: see FRONTEND_BACKEND_SYNC.md and proposal §18. Review by Bobby precedes HIFI (UXM-06) and any code (UXM-07).

## Trạng thái (2026-10-17)

Lowfi đủ M01–M10 (10 file, `lowfi/index.html` là mục lục). Kiểm tự động: 10 file × 1440/660px × 4 trạng thái — không tràn ngang, không lỗi JS,
không skeleton lọt vào trạng thái khác. Đây là **thiết kế lowfi chờ Bobby duyệt flow**, không phải HIFI (UXM-06) và không phải code (UXM-07).
Tài liệu đi kèm: [UXM-01 IA + metric dictionary](UXM-01-ia-and-metric-dictionary.md), [UXM-00 audit](../evidence/UXM-00/README.md).

## Sổ câu hỏi thiết kế (khuyến nghị của Claude; làm tiếp theo khuyến nghị tạm thời, đổi khi Bobby quyết)

| # | Câu hỏi | Màn | Khuyến nghị | Owner |
| --- | --- | --- | --- | --- |
| D1 | Score drawer mở sẵn hay mở khi cần | M05 | **ĐÃ CHỐT (Bobby 2026-10-17): mở khi cần** (bấm "Explain"), ghim cạnh tab khi đang mở | Bobby |
| D2 | Canary→Live là một miền "Real-funded" hay bốn miền stage | M05 | **ĐÃ CHỐT (Bobby 2026-10-17):** một miền "Real-funded" + breakdown theo stage (guide §9.1: cùng account/sleeve/config thì liên tục) | Bobby |
| D3 | Researcher có được lưu trữ alpha của mình (cần manager duyệt) | M09, M10 | **ĐÃ CHỐT (Bobby 2026-10-17): có; tái kích hoạt chỉ manager** | Bobby |
| D4 | Physical binding ở Account 360: đổi view hay route riêng | M06 | Đổi view cùng route (`view=physical`), deep-link được | Claude (nháp) |
| D5 | Rail hành động ở Portfolio 360 mở sẵn hay mở bằng nút Actions | M04 | Đóng sẵn, mở bằng Actions | Claude (nháp) |
| D6 | Khối Initial/Added theo funding source: giữ disclosure "Not available" hay bỏ đến khi có attribution | M01, M04 | Giữ disclosure; bỏ nếu UXM-06 thấy gây nhiễu | Bobby |
| D7 | Researcher thấy tên portfolio ở breadcrumb hay "your slice" | M04 | Hỏi theo field policy §3.2 (chưa duyệt) | Bobby |
| D8 | Archive có xuất hiện ở tab "All" của Fleet không | M03, M08 | Không (lifecycle, không phải stage) | Bobby |
| G1 | Preview có được backend giữ không (hàng "Preview only") | M09 | Codex trả lời; không thì bỏ hàng preview, chỉ ở drawer | Codex (FE-020) |
| G2 | Nguồn audit đã qualified chưa | M09 | Codex trả lời (FE-021) | Codex |
| G3 | Cách tính return paper sau archive; nguồn `w_i` ở cấp alpha; cửa sổ actual bắt đầu từ Canary hay Live | M05, M08 | Hỏi Codex/Research; hiện "Not available" | Codex (FE-022) |

Bản xem riêng tư (Artifact, không phải nguồn chính; nguồn là các file trong repo): https://claude.ai/artifact/X7Aqzz9rEA4Q51C7ifnKAQ

## Cách đọc lowfi (cập nhật 2026-10-17, theo phản hồi của Bobby)

Mỗi trang có ba chế độ xem ở thanh trên: **What changes** (mặc định: màn đề xuất, mỗi vùng gắn nhãn NEW / CHANGED / KEPT / REMOVED so với màn hiện tại),
**Proposed** (sạch, không nhãn) và **Current (V1)** (ảnh màn hiện tại thật). Nút **App look** vẽ lowfi bằng giao diện tối giống app hiện tại để so mắt.
Dưới mỗi trang có bảng "What changes vs today" (vùng · V1 đang có gì · đề xuất · vì sao/cần backend).

Ảnh V1: `lowfi/v1/*.png`, chụp 1440px full-page từ **build preview + BFF double** (dữ liệu giả, một alpha mẫu), **không phải deployment đang chạy**.
Cách chụp: `tools/v1-baseline.spec.ts` + `tools/v1-baseline.config.ts` (chép vào `apps/portal/frontend` để chạy; không nằm trong gate). Đây là lane FIXTURE/BFF_DOUBLE.
Màn M08 không có tương đương V1; M01 gần nhất là Command Center.

## Chức năng V1 mà bản đề xuất đã làm rơi (phát hiện khi đặt cạnh V1; khuyến nghị: GIỮ LẠI trừ khi Bobby bảo bỏ)

| # | Màn | V1 đang có | Bản đề xuất đang làm gì | Khuyến nghị |
| --- | --- | --- | --- | --- |
| R1 | M09 | Acknowledge / Resolve một operation, lens "Mine" | Không có | Giữ cả hai (operator cần) |
| R2 | M09 | Source health theo profile, Canary twin, command journal | Bỏ | Source health thành panel thu gọn; journal giữ ở drawer |
| R3 | M09 | Grain một `operation_id` từ plan → apply → verify | Một hàng mỗi command request | Đối chiếu với Codex (grain) trước khi khóa |
| R4 | M10 | SEE/DECIDE theo từng gate (R1, R2, Canary, Live); cờ STEP-UP REQUIRED khi cấp quyền | Gộp thành "Approve stage exits" | Giữ chi tiết từng gate + step-up |
| R5 | M02 | Cột Allocations, Allocated capital; hàng `pf_unallocated` | Chỉ còn trong column chooser; không có hàng unallocated | Giữ hàng unallocated, đưa Allocated capital lại cột mặc định |
| R6 | M04 | Tab Approvals, Incidents; selector benchmark; Configuration log; Capital Ledger, Structure & Correlation | Không có tab Approvals/Incidents | Giữ Approvals/Incidents như tab phụ; Ledger/Correlation vào Allocations/Risk |
| R7 | M04 | Chart tools (Lin/Log, 1W/1M/3M/ALL, Table, Expand, Export), Report pack | Đã thêm lại | Đã xử lý |
| R8 | M05 | 10 tab (Trade Replay, Positions, Risk, Sessions, Accounting, Reconciliation, Audit, Insight Charts) | Sáu tab guide | Đã thêm "More ▾" để giữ; Bobby chốt có nên thêm tab hay gộp |
| R9 | M05 | Biểu đồ Contribution-by-venue | Không có chỗ | Bobby quyết đặt ở đâu (đề xuất tab Performance) |
| R10 | M06 | Cột "Difference" (Δ derived) | Ban đầu bỏ | Giữ chỉ trong Reconciliation với scope khớp; số dư shared binding là "Not computed" — cần Bobby xác nhận |
| R11 | M07 | Dải hành trình R1→R2→PAPER→SANDBOX→CANARY→LIVE | Pills stage trùng một phần | Giữ dải hành trình, bỏ pills trùng |

Lưu ý giới hạn: ảnh V1 của các màn danh sách chỉ thấy phần trên (1 alpha/1 portfolio mẫu); phần dưới của một số tab không nằm trong ảnh nên không được khẳng định.
