# Claude → Codex: nguồn đóng băng, sẵn sàng cho cổng R2/R3 và landing (2026-10-21)

Người nhận: Codex (tích hợp viên duy nhất). Bobby yêu cầu báo khi có thể bàn giao: **bàn giao được ngay bây giờ**. Đây là gói bàn giao, chưa phải kết quả cổng cuối và chưa phải landing.

## 1. Pin đóng băng
- Nhánh `claude/fe-parity`. Mã nguồn đóng băng ở `f394c0a1` (commit mã cuối). Commit đặt file này chỉ thêm tài liệu (R0) ngay trên đó; HEAD của nhánh tại thời điểm commit file này là SHA để chạy cổng.
- Từ đây Claude **không commit thêm vào `claude/fe-parity`**. Việc tiếp theo của Claude nằm ở nhánh `claude/post-freeze-20261021` (tách từ cùng điểm), chỉ gộp lại sau landing.
- Claude **không chạy hook trùng**: Codex đang chạy hook trên ứng viên Core009 nên tôi không chồng thêm job nặng (§10.10b). Cổng R2/R3 cuối trên SHA đóng băng do Codex lập lịch, như đã thoả thuận ở C7.

## 2. Đã nằm trong nhánh (từ lần ACK trước)
CR-01 (`dd9609af`), CR-02 revision-scoped repair + migration 148 (`75c3d7e6`), CR-03, CR-04, diagnostic carry, SQL read modes, B1 EXPLAIN + semi-join + index **migration 149** + deadline tổng (`343f5bbb`, `90f84643`, `4ebc4d9e`: kiểm lại ngân sách sau vòng arming và trước COMMIT, walker báo hết ngân sách, bằng chứng quan sát B1 được khôi phục + ghi chú đổi số), `revokeSession` hint (BE-P18), series BE-P16, fleet realtime BE-P17, BE-P19 đo fixture, BE-P20 bộ kiểm cấu hình Manager (offline), registry rev 9 + N29 re-pin, RK-1, unknown-outcome 5xx cho `createPaperExit`/`captureR2`, V2 baseline 61 ô, sổ nợ đối chiếu, f394c0a1 test PG ổn định tải.

## 3. Bằng chứng thật đã có trên nguồn này
| Gate | Kết quả | Ghi chú |
| --- | --- | --- |
| Hook R2 đầy đủ | xanh ở `a896bd08` (trên `9d15755f`); lần `j` trên `90f84643` đỏ 5 test do **hai nguyên nhân thật** (mật khẩu bị blocklist trong spec; rule an toàn hiển thị đặt nhầm lớp làm custody từ chối byte nguồn), đã sửa | **Chưa có hook xanh trên SHA đóng băng này** |
| PG có mục tiêu theo yêu cầu của Codex (10 file) | 380/380 xanh trên chuỗi migration hiện tại, gồm hai spec trước đó đỏ, CR-02, B1 148/149, invariants | log `scratchpad/pg-target.log` |
| FE | 378 file / 80.924 test, `tsc` sạch | các test Fleet/Account chịu tải kém chạy riêng xanh (DEBT-032) |
| Playwright V2 host | 262 đạt / 6 lỗi / 61 bỏ qua (ảnh pinned); 6 lỗi đã phân loại: 1 double thiếu `request_id`, 1 kỳ vọng cũ theo registry rev 9, 4 flake do tải; đã sửa `7181f350` | chưa chạy lại toàn bộ |
| Ảnh pinned V2 | 61 ô, hai lần so sánh liên tiếp xanh | FIXTURE_LAB/BFF_DOUBLE |
| Ba test PG nhạy tải | fixture ổn định (`f394c0a1`): một mốc thời gian chung, timeout 90 s có tính toán, số đo trong thông báo lỗi; **chưa chạy lại trên PG** | cổng R2/R3 sẽ chạy |

## 4. Còn nợ từ phía Core / đề nghị Codex
1. Commit bản sửa BUSY hai file (`native-business-read-client.ts` + spec) ở nhánh ứng viên; Claude nhận bằng `git show` vào `claude/post-freeze-20261021` rồi vào nhánh chính khi landing (xem `CLAUDE_CORE08_SOURCE_RETURN_2026-10-21.md` §2).
2. FE-073/074: khi patch `chore/elp210-served-contracts` được commit, Claude gỡ năm ngoại lệ conformance và đọc `details.approval_id`; ghi ở nhánh post-freeze.
3. Hai spec của Codex đã được nêu trong review (`governance.spec.ts` ~L975–1022, `elp2-access-transaction.spec.ts` L2111/L2286): kiểm thời gian thật 1,5 s / 500 ms theo thiết kế đã duyệt; Claude không nới; nếu đỏ khi tải, cần quyết định thiết kế của Codex/Main, không sửa cơ học.
4. Thời gian chạy cổng: tránh chạy chồng với việc nặng khác (ba lỗi đỏ ngày 2026-10-21 là chạy chồng). Gói quy tắc khoá nằm ở `AGENT_WORKING_RULES.md` §10.10b.

## 5. Điều kiện landing còn phải đúng
Canonical commit xong phần Markdown của owner, cây Claude không còn WIP của người khác trong commit (đã kiểm: các commit chỉ gồm file của Claude), generated chỉ qua generator (snapshot/ledger `--check` xanh ở SHA này), `merge --ff-only` chỉ do tích hợp viên, không push dev/main. Stream Fleet vẫn dark, `stream.subscribe` chưa cấp, notice source `NOT_COMMISSIONED`.

## 6. Quyết định của Bobby 2026-10-21 đã áp dụng
Copy duyệt hết; stream chỉ toàn fleet; Alpha/Deployment series chưa mở; Fleet theo mặc định; RK-1 bỏ thu hẹp trước; Access copy duyệt; unknown-outcome 5xx cho phép nhánh mới; hạ cánh kèm nợ đã ghi. Chi tiết: `BE-CLAUDE-2026-10-20/BOBBY_DECISIONS_2026-10-21.md`.
