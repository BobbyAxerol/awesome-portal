# P23 backend goal — checkpoint khi Bobby tạm dừng (2026-09-28)

**Authority:** [Unified §13.4.1](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-open-ledger) và [P23 packet](./README.md). Đây là journal tiến độ của goal, không đổi trạng thái P23 thành PASS. Bobby tạm dừng backend để giao phần frontend còn mở cho Thanhvuong. Không deploy, đổi flag hoặc chạm dữ liệu production trong checkpoint này.

## Đã sửa/chứng minh trên `docs/research-loop-plan`

| Lộ trình goal | Kết quả có bằng chứng | Giới hạn |
|---|---|---|
| F6 + migration compatibility | `12e00e7f`: P12 verifier chạy lại 11/11; migration 075/076 đi forward trên baseline 070–074, không sửa ledger cũ. [Receipt](./F6_MIGRATION_VERIFIER_CHECKPOINT_2026-09-27.md). | Không suy ra mọi DB/preview cũ đã nâng cấp. |
| F4/E10 + OL-02 | `eb4b034b`, `8e9dce9a`: stranded terminal/retry expiry/live lease và MATCH/MISMATCH qua bản artifact test; [recovery](./RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md), [clean fault](./T04_CLEAN_FAULT_CHECKPOINT_2026-09-27.md). | Chỉ cell cô lập, không phải Production. |
| P22 publication prerequisite | `19a8e813`: terminal POST replay trả đúng `replayed:true`, không nhân đôi R1/publication; [receipt](./PUBLICATION_REPLAY_CHECKPOINT_2026-09-27.md). | P22 backend xong; browser S01/S02/S10/S11 vẫn phải nghiệm thu trên build hiện tại. |
| P23 bounded read/load | `b2e8b868`: bỏ payload Library thừa/validation lặp; clean mixed 20 reader + HEAVY + 4 queued đạt Library p95 490 ms một lần. `a7be19bc`: far-seek 140 GET/20 principal. [Mixed](./MIXED_RESTORE_CHECKPOINT_2026-09-27.md), [T11](./T11_FAR_SEEK_CHECKPOINT_2026-09-27.md). | Bài W06/T08 lặp lại chưa đạt 500 ms. Một PASS không che lần FAIL. |
| P23 fault/restore/utility/isolation | `3cdb4cea`, `510967eb`, `f06c9683`: nonempty R1 graph+restore, what-if 81 cell và export/verify, T09 Execution sentinels trong scope SGP; [T14](./APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md), [T12](./UTILITY_CHECKPOINT_2026-09-27.md), [T09](./T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md). | T12/T14 còn các ô source/selection/exposure; T09 không đại diện AWS-HK. |
| Negative/diagnostic probes | `02736e99` scratch plateau, `74c572e5` tenant cache/ETag, `87e04424` preflight quota, `91b63afe` disk-full, `3904feb8` cold cache, `7e644ffa` current-route refusal, `ec534115` Library gradient. | Đây là phát hiện có receipt, **không phải** fix source hoặc P23 PASS. |

## Lỗi/gap mới phải sửa theo thứ tự khi goal được tiếp tục

1. **Source ≤P21 thuộc Claude, Codex retake:** `CG-P23-T02-01` supervisor scratch +42 file/+1,006,525 byte sau sáu terminal; `CG-P23-T03-01` seal manifest ENOSPC còn raw errno 28; `CG-P23-T05-01` thiếu private cache policy/304 ở Freeze/Report; `CG-P23-T12-01/02` thiếu explicit selection-audit admission và shared utility bound. Đọc locators/negative receipt trong [P23 packet](./README.md) trước khi sửa; không lấn file ≤P21 khi Claude đang sở hữu.
2. **Codex P23:** tìm stage thực gây warm Library W06/T08 p95 547–815 ms (500-ms gate) qua queue wait/PG/auth/mapping, sửa đúng bottleneck đã đo, rồi retake 20 principal + 1 HEAVY + 4 queued và cold/warm trên cùng pinned candidate. Không nới SLO, không lấy unloaded gradient làm PASS. [W06/T08](./T08_RUNNING_WFO_GRADIENT_2026-09-28.md).
3. **Codex P23:** retake T02/T03/T05/T12/T14 sau source fixes; hoàn tất T07/T13 upgrade/default/rollback, T15 browser-real cùng F3/F5/OL-24 và toàn bộ P23-T01…T15/DR/BR/GX trên image/contract/DB-migration pins nhất quán. [Matrix](./phase-report.md).
4. **P24 chỉ sau P23:** full product journey, auth/data preservation, visual/print, rollback và release rehearsal. Không suy `PRODUCT_ACTIVE` từ một tập con P23.

## Cách báo cáo tiếp tục

Mỗi slice ghi **commit/code delta**, candidate image/migration/source ID, lệnh và số PASS/FAIL/SKIP, receipt/hash, tài nguyên trong lúc chạy, lỗi mới, rollback và gate còn mở vào P23 packet + Unified §13.4.1. Test fail không xóa; receipt fixture, API thật và browser-real tách nhau. Chỉ đánh `PASS` khi đúng workload và scope. Sau khi Bobby cho tiếp tục mới thực hiện mục 1–4; checkpoint này là tài liệu, không phải lệnh khởi động lại goal.
