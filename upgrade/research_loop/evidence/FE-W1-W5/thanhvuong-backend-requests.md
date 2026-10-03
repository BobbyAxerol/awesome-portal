# FE-W1–W5 — Thanhvuong backend request receipt

Nguồn: `CODEX_BACKEND_GAPS_2026-09-30.md` §31 + addendum, `FRONTEND_GAPS_FOR_SONNET_2026-09-30.md` (W1–W5, closeout), `evidence/P21/W1_W2_BACKEND_REQUEST_CLOSEOUT_2026-10-03.md`. Kiểm lại 2026-10-03. Frontend không sửa backend để làm màn xanh; Codex quyết đề xuất.

## 1. Đã đóng (consumed ở FE)

| Id | Locator | Actual (trước) | Expected | Thay đổi nhỏ nhất | Fallback đang chạy | Trạng thái |
|---|---|---|---|---|---|---|
| G-25 | `GET /quantbt/runs?q=` | tìm theo nhãn `R-…` không ra | `R-WFO-023`, `WFO-023`, `023`, `P04-018` mỗi cái một run | thêm `display_label` vào search doc | không còn | `CLOSED` (đọc GET trên preview) |
| G-26 | Journey descriptor | thẻ nói "shipped" | descriptor v5 không có chữ đó | descriptor v5 | không còn (FE hết cần ẩn) | `CLOSED` (Codex delivery; chưa đọc lại từng thẻ) |
| B-1 | run status word | không có trong compose | `run_status` ở compose | field additive | không còn | `CLOSED` |
| B-2 | hub lifecycle | thiếu stage lỗi | `lifecycle.failed_at` | field additive | không còn | `CLOSED` |
| B-3 | RC gate | copy không biết seal | verdict nhận biết seal, `report_sealed` | field additive | không còn | `CLOSED` |
| B-4 | selection split/search/freeze | thiếu thứ tự hiển thị | `selected_trial_ordinal` (+scope/reason) | field additive | không còn; qua `trialLabel` | `CLOSED` cho Split/Freeze/Search; RC rail xem §2 mục 3 |
| B-5 | read contract | đọc thiếu field | các read đã bị bỏ sót được bổ sung | `BROAD_REQUEST_RECONCILIATION` | không còn | `CLOSED` ở mức code Codex; FE đã bind (`51dbe35d`) |

## 2. Mở (§31)

| Id | Locator | Actual | Expected | Thay đổi nhỏ nhất | Fallback đang chạy | Trạng thái |
|---|---|---|---|---|---|---|
| §31-1 | `GET /quantbt/runs/{run}/release-candidate` vs `GET /research/release-candidates/{rc}/publication` (R-WFO-022 `rc_06GFW43NE42YF64NMXYDS6GD32`, R-WFO-023) | compose: `publish.blocked_reason=P22_LOCAL_SEAL_REQUIRED` khi `SEALED_LOCAL`; publication: `P22_CURRENT_SOURCE_CHANGED`, `NOT_CHECKED` | một lý do ở cả hai read; câu trả lời cho đường hợp lệ khi seal cũ hơn thay đổi source | thống nhất reason; nêu supersede/re-seal | hiện lý do compose như được phục vụ + lối Library; không bịa đường | `OPEN` (Codex) |
| §31-2 | `blocked_reason` trên publication read và `actions.publish` | chỉ có mã | `blocked_action` enum (`SEAL_NEW_CANDIDATE`/`NONE`/`WAIT`) | field additive, tuỳ chọn | FE không parse mã | `OPEN` (tuỳ chọn) |
| §31-3 | RC compose `rail`/`selected_params` | chỉ digest | `selected_trial_ordinal(+scope/reason)` | field additive, tuỳ chọn | S11 hiện `source N`, rail trống | `OPEN` (tuỳ chọn) |
| §31-4 | dữ liệu preview | R-WFO-024/026/027 sealable | để diễn tập publish | không phải code | R-WFO-027 đã publish thật | `RESOLVED_BY_ADDENDUM` |
| §31-5 | approval mirror, R-WFO-027 | `approval read DENIED` cho chính người publish | widen read hoặc nêu copy dự kiến | Codex quyết | hiện đúng như typed | `OPEN` (câu hỏi, chưa đánh số trong §31) |

Ghi chú: mục 4–5 là phần quan sát/addendum, không phải request chặn. Không mục nào chặn frontend.
