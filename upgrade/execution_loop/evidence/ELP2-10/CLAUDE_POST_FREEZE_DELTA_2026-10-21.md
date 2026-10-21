# Claude post-freeze delta (nhánh claude/post-freeze-20261021, 2026-10-21)

Nhánh `claude/fe-parity` vẫn đóng băng ở `d58361ea` (mã `f394c0a1`) chờ cổng R2/R3 của Codex. Mọi thứ dưới đây nằm **sau** điểm đóng băng, ở nhánh riêng; gộp sau landing hoặc theo thứ tự Codex chọn. Không có mục nào đã chạy hook đầy đủ; mỗi mục dùng làn nhỏ theo `AGENT_WORKING_RULES.md` §10.10c.

| Việc | Commit (xem `git log d58361ea..HEAD`) | Làn đã chạy | Ghi chú |
| --- | --- | --- | --- |
| Quy tắc khóa §10.10b và hook thông minh §10.10c, `scripts/select-gates.sh` | docs/rules | không (docs) | theo yêu cầu của Bobby |
| BE-P20 bộ kiểm cấu hình đường dữ liệu Manager, sửa theo review Codex: một kid Research dùng chung | `7c158019` | vitest tập trung 123/123 | không đổi runtime |
| FE-073/074 nhận patch contract của Codex (`c02f63d8`) và gỡ 5 ngoại lệ conformance; DEBT-047 | `e1fb7906`, `2f8eec78`, `4e1891e8` | generators/snapshot/ledger `--check` xanh; vitest 358 file | double Paper trả envelope đã công bố |
| STREAM Fleet: bộ chuyển tải fetch-SSE + chip Live/Paused/Stopped sau cờ `fleet-stream` (tắt mặc định) | `8872a81f`, `4e25d5d4`, `a0ecc896` | vitest 27 file 3.197 test; Playwright V2 host 12/12 | FIXTURE_LAB, double phục vụ stream hữu hạn |
| Workbench: cờ extrema chỉ khẳng định cho method đã công bố `PER_SERIES_BUCKET_EXTREMA` | `892cdabb` | vitest workbench 371 | trước đó cờ "does not guarantee extrema" tự mâu thuẫn với tên method |
| Baseline V2 ghi lại 2 ô (Workbench Paper 1440/390) | `f6b2cc6d` | so sánh V2 61 ô: 59 xanh + 2 ô đã ghi lại; hai lần so sánh liên tiếp xanh | V1 `paper-workbench` 2/2 xanh (không trôi) |
| DEBT-032 test nhạy tải: `waitFor` 8 s và timeout test rõ ràng | `3442f72c`, `e3d7b546` | 5 file riêng + gộp xanh | không đổi assertion |

## Còn chờ phía Codex / Edge
Bản sửa BUSY của client native (chưa commit), cổng R2/R3 trên SHA đóng băng, cấp grant `stream.subscribe`, nguồn notice, và ACK các commit đã trả (`4ebc4d9e`, CR-02, B1, BE-P20 bản sửa).

## Cập nhật tiếp (sau 15:35 UTC, cùng nhánh `claude/post-freeze-20261021`)
| Việc | Commit | Làn đã chạy | Ghi chú |
| --- | --- | --- | --- |
| Nhận bản sửa BUSY của Codex (path-level từ `9d88e40a`, 7 đường dẫn) + ledger bằng script | `3394b04f` | vitest 128/128 (2 spec liên quan), `bash -n` cho 3 script | không mang cả commit |
| DEBT-031 trang phone Users 10 thẻ, Alpha Orders & Fills 3 thẻ/bảng, Load more | `89536bda` | vitest users/alpha 625 | Users 390 px: 7.729 → 2.179 px; **2 ô ảnh cần ghi lại** (Users @390, Alpha 360 Orders & Fills @390), chưa ghi vì Codex đang giữ máy |
| DEBT-044 request workbench ổn định theo số worker; DEBT-045 thu hẹp (không tái hiện) | `e299c3df`, `371224f0` | vitest workbench; `node --test` 9/9 | thêm `data-state` vào root workbench (V2) |
| BE-P22 quan sát cache riêng tư: bộ quan sát thuần + bản vá đề xuất cho 3 file dùng chung (chưa áp dụng) | `fa530323` | vitest 26/26 | cần Codex đồng ý người ghi duy nhất |
| BE-P21 bộ giảm kinh tế nguồn (dark, không nối) | `f0b56371` | vitest 64/64 | ánh xạ nguồn thật còn nợ PM/Edge |
| Rà soát hủy `refresh` của Fleet: 3 lỗi thật đã sửa | `776cf9be` | vitest 14 + 8 + 4 test mới; Playwright 13/13; cả thư mục Fleet 1.348 test xanh hai lần | FIXTURE_LAB |
