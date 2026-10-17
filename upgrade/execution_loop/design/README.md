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
| D1 | Score drawer mở sẵn hay mở khi cần | M05 | Mở khi cần (bấm "Explain"), ghim cạnh tab khi đang mở; sạch hơn, hợp web user | Bobby |
| D2 | Canary→Live là một miền "Real-funded" hay bốn miền stage | M05 | Một miền "Real-funded" + breakdown theo stage (guide §9.1: cùng account/sleeve/config thì liên tục) | Bobby |
| D3 | Researcher có được lưu trữ alpha của mình (cần manager duyệt) | M09, M10 | Có, nhưng tái kích hoạt chỉ manager | Bobby |
| D4 | Physical binding ở Account 360: đổi view hay route riêng | M06 | Đổi view cùng route (`view=physical`), deep-link được | Claude (nháp) |
| D5 | Rail hành động ở Portfolio 360 mở sẵn hay mở bằng nút Actions | M04 | Đóng sẵn, mở bằng Actions | Claude (nháp) |
| D6 | Khối Initial/Added theo funding source: giữ disclosure "Not available" hay bỏ đến khi có attribution | M01, M04 | Giữ disclosure; bỏ nếu UXM-06 thấy gây nhiễu | Bobby |
| D7 | Researcher thấy tên portfolio ở breadcrumb hay "your slice" | M04 | Hỏi theo field policy §3.2 (chưa duyệt) | Bobby |
| D8 | Archive có xuất hiện ở tab "All" của Fleet không | M03, M08 | Không (lifecycle, không phải stage) | Bobby |
| G1 | Preview có được backend giữ không (hàng "Preview only") | M09 | Codex trả lời; không thì bỏ hàng preview, chỉ ở drawer | Codex (FE-020) |
| G2 | Nguồn audit đã qualified chưa | M09 | Codex trả lời (FE-021) | Codex |
| G3 | Cách tính return paper sau archive; nguồn `w_i` ở cấp alpha; cửa sổ actual bắt đầu từ Canary hay Live | M05, M08 | Hỏi Codex/Research; hiện "Not available" | Codex (FE-022) |
