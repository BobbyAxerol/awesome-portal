# Quyết định của Bobby, 2026-10-21 (trả lời AskUserQuestion)

| # | Câu hỏi | Quyết định | Áp dụng |
| --- | --- | --- | --- |
| 1 | Copy mới của RV-11, nút Exit, audit A/B (`alpha/recordReasons.ts`, `exitReviewRequest.ts`, README `ux-audit-A-2026-10-20`): chip "Mixed books", dòng "Not available: …", "N d ago", accessible name "Open ord_… in Trade Replay" | **Duyệt hết** | Copy gắn nhãn approved; mở đường ghi baseline ảnh nhóm V2 sau khi so sánh ở SHA cuối sạch |
| 2 | Stream `alpha_fleet_overview` (BE-P17) | **Chỉ người xem toàn fleet** (ROOT duy nhất + grant `stream.subscribe`); người xem một phần nhận baseline `UNAVAILABLE/WHOLE_FLEET_AUTHORITY_REQUIRED` | Giữ đúng như code hiện tại; stream vẫn dark tới khi cấp grant |
| 3 | Subject Alpha/Deployment cho series BE-P16 | **Chưa mở** | Giữ `ALPHA_DEPLOYMENT_SUBJECT_NOT_IN_CONTRACT`; chờ nguồn PnL/equity theo deployment từ Edge/PM rồi đổi contract một lần |
| 4 | Fleet: membership lanes, lọc Portfolio, KPI in-view, số dư X1 | **Theo mặc định**: giữ lanes; chưa thêm lọc Portfolio; KPI theo in-view một nhãn nguồn; chưa hiện X1 | Ghi nhận trong `FLEET_BUSINESS_JOURNAL_2026-10-20.md`, đổi khi có dữ liệu thật |
