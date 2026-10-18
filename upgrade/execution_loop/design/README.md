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

## Quyết định thiết kế đã chốt (Bobby, 2026-10-17; tất cả chọn theo khuyến nghị UX của Claude)

| Mã | Quyết định |
| --- | --- |
| D1 | Score drawer ở Alpha 360 mở khi cần (Explain) |
| D2 | Canary→Live là một miền "Real-funded" + breakdown theo stage |
| D3 | Researcher được yêu cầu archive alpha của mình (manager duyệt); tái kích hoạt chỉ manager |
| D6 | Initial/Added funds là danh sách dòng tiền trong Capital; bảng theo funding source là mục thu gọn "Not available" |
| D7 | Researcher thấy tên portfolio thật + banner "your slice only" (field policy §3.2 vẫn cần duyệt) |
| D8 | Alpha đã archive chỉ ở Archived Alphas, không vào tab "All" của Fleet |
| R1/R2 | M09 giữ Acknowledge/Resolve và lens "Mine"; Source health thành panel thu gọn |
| R4 | M10 giữ SEE/DECIDE từng gate + cờ STEP-UP |
| R6 | Portfolio 360: Approvals và Incidents là tab phụ (More) |
| R8 | Alpha 360: 6 tab chính + menu More chứa các tab V1 còn lại |
| R9 | Contribution-by-venue nằm trong tab Performance |
| R10 | Cột Difference chỉ trong Reconciliation (scope khớp); số dư shared binding là "Not computed" |
| R5, R11 | Mặc định theo khuyến nghị (chưa hỏi): khôi phục cột Allocated capital + hàng Unallocated ở M02; giữ dải hành trình ở M07 |
| F1–F3 | Xem [UXM-02-journeys.md](UXM-02-journeys.md) |

Còn mở: D4, D5 (nháp của Claude), mọi G1–G3 (cần Codex: FE-020/021/022), grain M09 (R3, cần Codex), reader viết tay hay ajv, UXM nào được giao tiếp, bản HIFI.

## HIFI (UXM-06, 2026-10-17)

`hifi/*.html` = 10 màn bằng design system Carbon thật (token `operations-carbon`, IBM Plex, radius 0, không pill, panel không viền, tab gạch chân).
Mở `hifi/m01-overview.html` rồi đổi **Manager / Source not ready / Researcher** ở thanh trên. Biểu đồ dùng chung trong `hifi/hifi.js`
(lưới đứt, tick UTC, crosshair + tooltip, nhấn điểm cuối, drawdown tách panel, phím mũi tên, hatch cho phần mô phỏng). Giá trị là mẫu.

Phát hiện khi đọc chuẩn chart (cần làm khi được giao code, không đổi chung lúc này):
- Chart ECharts của Execution đang dùng bảng màu navy thay vì Carbon (`activeTheme()` gộp `execution-carbon` thành `operations`); `EquityChart` (uPlot) thì đúng.
- Font trong chart ECharts bị gắn cứng JetBrains Mono; Carbon dùng IBM Plex Mono.
- Role bands (`--role-is/oos/holdout`) và `--viz-*` chưa được khai báo lại cho Carbon.

## Quyết định bổ sung (Bobby, 2026-10-18)

| Mã | Quyết định |
| --- | --- |
| UI1 | Ô vuông, viền cứng, chart có sức nặng như V1; chart equity không nhất thiết xanh/đỏ (kit: series xanh dương, drawdown cam, dòng tiền teal, mô phỏng tím) |
| UI2 | Nhãn trạng thái (pending, recall, partial, unknown, applied…) có ký hiệu + màu riêng, viền cứng; không chỉ dựa màu |
| UI3 | Khung thời gian mặc định **90D**, có **7D / 30D / 90D / ALL** ở mọi ô dữ liệu; riêng danh sách Operations mặc định 24H nhưng có đủ 7D/30D/90D/ALL |
| S1 | Danh sách Paper/Sandbox/Live: gộp vào Fleet (lọc stage), URL cũ redirect |
| S2 | Giữ giao diện Governance sáng cho **màn duyệt đầy đủ** (Gate R1/R2/Live, Exit review, Waivers); danh sách Decisions trong M09 dùng Carbon tối |
| S3 | M09 có hai tab Operations \| Decisions; Incident giữ route, mở dạng drawer từ M09 |
| S4 | Alpha 360: tan Insight Charts vào tab chứa nó; gộp Risk/Sessions/Accounting/Audit/Reconciliation; chỉ vẽ chart khi có dữ liệu |
| S5 | Paper Workbench: thanh tab lên đầu, Overview + 4 tab thật (Orders, Fills, Positions, Sessions); URL cũ cuộn tới đúng mục |
| S6 | Sổ cái vốn: trong Allocations, hai khối Real-funded / Simulated, mỗi khối có ledger |
| S7 | Mặc định theo khuyến nghị (chưa hỏi): Canary⇄Live chung header, một blotter toàn cục theo URL, Admin Actions giữ route rút gọn, Binding qua toggle, Trade Replay chỉ log đến khi có nến |

Phản hồi: khuyến nghị cần **sáng tạo hơn** → bốn concept ở `hifi/concepts/` (c1 command bar + context rail + digest + heat map; c2 capital flow + compare; c3 journey spine + fleet board + event ribbon; c4 decision cockpit). Rà soát mọi route/màn sâu của V1: `sweep/*.md` và `V1_DEEP_INVENTORY.md`.
