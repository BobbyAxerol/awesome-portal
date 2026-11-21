# So sánh HIFI v2 với bản dựng (UXM-07), 2026-10-18

Chủ: Claude. Quy tắc: Browser/HiFi comparison là bắt buộc (CLAUDE.md đầu file, Rules §9). Làm ở lane FIXTURE_LAB/BFF_DOUBLE; so với HIFI chế độ "not qualified" (gần nhất với thứ backend publish được hôm nay) và chế độ "ok" cho cấu trúc.

## Cách làm
1. Chụp HIFI (`design/hifi/v2/*.html`, vai Manager, hai chế độ dữ liệu, 1440px) và bản dựng thật trên trình duyệt (17 route × 1440/390, build cờ bật, BFF double), ghép đôi từng màn.
2. Ba reviewer độc lập (chỉ đọc) đọc ảnh ghép + `html/css/js` của HIFI + mã triển khai và phân loại từng sai khác: **A** DATA_ABSENT (đúng kỳ vọng, kèm mã FE), **B** FIDELITY (sửa; MAJOR/MINOR, giá trị HIFI so với thực tế, sửa nhỏ nhất), **C** INTENTIONAL (vỏ portal, thanh design-preview, quyết định đã ghi). Bảng chi tiết: [hifi-review-A](hifi-review-A.md) (Overview, Fleet, Operations, Incident, Cockpit), [hifi-review-B](hifi-review-B.md) (Portfolios, Portfolio 360, Compare, Alpha 360, Replay), [hifi-review-C](hifi-review-C.md) (Accounts, Account 360, Blotter, Admin, Users, Access).
3. Bốn gói sửa (lớp dùng chung + ba cụm màn) mỗi gói tự dựng, chụp lại trên cổng riêng và đối chiếu ảnh trước/sau; một lượt cuối sửa các việc chéo màn.
4. Kiểm lại toàn bộ 17 route × 2 khổ + ảnh ghép sau sửa.

## Kết quả đếm (16 màn)
| Lớp | Số dòng | Ghi chú |
| --- | ---: | --- |
| A DATA_ABSENT | 84 | đều có mã FE (FE-005/006/011/013/015/017/020/021/024/025/026/027/028/029/030/031/032/033/034/035/037/038/042/043/044…056) |
| B FIDELITY · MAJOR | 17 | **16 đã sửa**; 1 (ADM-B1) hoá ra là dữ liệu vắng (`meta` là tham chiếu nguồn, không phải mô tả) → yêu cầu FE-056 |
| B FIDELITY · MINOR | 104 | khoảng 70 đã sửa (chắc chắn và rẻ); phần còn lại ghi bên dưới |
| C INTENTIONAL | 54 | không đổi |

## 17 sai khác MAJOR và kết quả
Bảng Portfolios rộng ~2340px trong khung 1180px (P-B1) · Portfolio 360 lưới và bảng vốn trùng (T-B1/T-B2) · Replay nằm dưới nếp gấp, log hiện mã thô và không thành thẻ ở 390px (R-B1/B2/B3) · Alpha 360 vỡ chữ ở 390px (L-B9) · Overview triage bị cắt (OV-8) · Operations cột "Next" không là hành động (OP-3) · Cockpit không chọn sẵn yêu cầu (CK-1) · Incident drawer chân che khối "Not published" (INC-1) · Fleet mất dấu stage theo màu (FL-1) · Blotter Status bị cắt và Conditional groups không thành thẻ (BLT-B1/B2) · Users render ngoài `.exec-surface` nên chữ 14px (USR-B1) · Access dải nhận diện sai phân cấp (ACS-B1) · Admin sub-line (ADM-B1, dữ liệu vắng). Đã sửa; đã xem ảnh trước/sau.
Lỗi chung đã sửa: nhãn mono in hoa (SYS-1), nhịp dọc 24px (SYS-2), KPI strip chung (SYS-3), offset drawer (SYS-4), `.exec-blk-demoted` không có gap, id FE bị bẻ giữa chữ.

## Chưa làm, có lý do
- **Phụ thuộc quyết định của owner/Codex:** P-B7 (đổi "Owner" thành "Manager" là quyết định thuật ngữ); panel "Partitions" của Compare không có trong HIFI (giữ vì nó nêu luật partition; chờ owner); Context bar đang Real-funded trong khi bảng Portfolios liệt kê cả Simulated (giữ: list read chưa có bộ lọc môi trường, FE-014/044).
- **Chạm quy tắc hiển thị số chính xác (Codex):** T-B5 (nhãn trục Y làm tròn nguyên) và drawdown frame (T-B9) trong EquityPanel.
- **Component V1 dùng chung, không nên đổi lúc này:** R-B5 (màu nến mặc định của ReplayCandleChart).
- **Không chắc hoặc không rẻ:** FL-7 (Columns popover), FL-8 (filter chips), OP-6/7, INC-3, INC-7, CK-3/4/5/7, ACC-B1/B3, BLT-B3/4/6/7, ADM-B2..B4, USR-B2/B5, ACS-B2..B4, A360-B8, P-B4 (sort ở `th` cần `sortKey` trong CardsTable dùng chung), L-B2/B6/B10.
- Các dòng này giữ trong `debt-register.json` (DEBT-UXM07-008).

## Phát hiện cho Codex
FE-056: `/operator-tasks` chỉ có `meta` là tham chiếu nguồn ("cli/__main__.py:1570"); HIFI cần mô tả một câu, tên hiển thị và nhãn scope cho từng tác vụ. ContextBar `envLock` đã thêm vì Blotter không có bộ lọc môi trường (FE-052).

## Pass 2 (2026-10-19)
Sửa thêm khoảng 40 dòng (commit `9f6b5dcb` C, `4c65f2e4` A, `b7bd9d78` B). Đã làm: FL-7/FL-8 (Columns, chip lọc theo URL), OP-6/7/9, INC-3/7/8, CK-3/4/5/7, P-B3/B4, K-B4/B5, T-B5 (Export), T-B6, L-B6/B10, R-B5 (nến xanh), ACC-B1/B3, A360-B8, BLT-B3/B4/B6/B7, ADM-B2..B4, USR-B2, ACS-B2..B4. Quyết định của Bobby áp dụng: giữ "Owner"; Partitions thu một dòng; giữ Context bar và nói rõ trên màn Portfolios.
Còn lại (DEBT-UXM07-008, -012): nhãn trục Y giữ số thập phân đầy đủ, EquityPanel x-tick/khung ở 390px, JourneySpine lặp "Not published", cột Open orders (không có nguồn), OP-5 windowLock cần ExecutionPreviewRoute, OV-6 SectionPanel nhận title chuỗi, link Access theo người dùng (không có view), tiêu đề SERIES của Compare bị ép ở 390px.
