# BE-P18 B1: gate EXPLAIN quy mô lớn cho operations queue V2

Sinh tự động bởi `apps/control-api/test/be-p18-b1-explain.pg.spec.ts` (qua `scripts/be-p18-b1-explain.sh`). Không sửa tay. Commit mã: `799effc8093d`.

**Verdict: PASS**

## Quy mô và môi trường

- Corpus TEST_ONLY, seed xác định (251.4 s), scale 1.0: **1,000,000 operation, 200,000 incident, 599,978 link**, 5 workspace (600k/150k/150k/50k/50k op), target lệch (hot head, cold tail), `created_at` là hoán vị của thứ tự chèn (heap KHÔNG tương quan với khóa sort).
- DB dùng một lần, migrate bằng migration của repo (142 migration, cuối: `1723680000148_execution-operation-queue-scope-lookup-index`).
- PostgreSQL 16.15; effective_cache_size=2621448kB, jit=on, max_parallel_workers_per_gather=2, random_page_cost=4, shared_buffers=983048kB, work_mem=4096kB.
- Cache nóng: 1 lần warm + 3 lần đo, lấy median; plan lấy từ một lần chạy riêng dưới EXPLAIN (ANALYZE, BUFFERS) (không tính vào ngân sách).

| Bảng | Kích thước (gồm index) |
|---|---|
| execution_incident_operation_links | 141 MB |
| execution_incidents | 94 MB |
| execution_operation_queue_items | 685 MB |

| Index | Bảng | Kích thước |
|---|---|---|
| execution_incident_operation_links_operation_idx | execution_incident_operation_links | 56 MB |
| execution_incident_operation_links_pkey | execution_incident_operation_links | 28 MB |
| execution_incidents_pkey | execution_incidents | 10 MB |
| execution_incidents_workspace_id_incident_id_key | execution_incidents | 17 MB |
| execution_incidents_workspace_state_idx | execution_incidents | 18 MB |
| execution_operation_queue_assignee_idx | execution_operation_queue_items | 84 MB |
| execution_operation_queue_items_pkey | execution_operation_queue_items | 52 MB |
| execution_operation_queue_scope_idx | execution_operation_queue_items | 9 MB |
| execution_operation_queue_workspace_created_idx | execution_operation_queue_items | 70 MB |
| execution_operation_queue_workspace_operation_unique | execution_operation_queue_items | 82 MB |
| execution_operation_queue_workspace_triage_idx | execution_operation_queue_items | 89 MB |

## Ngân sách (nêu trước khi đo)

- Mỗi câu SQL: median <= **1000 ms** (trần production: statement_timeout 2000 ms).
- Cả request (một transaction, mọi câu): median <= **2500 ms** (trần production: deadline tổng 5000 ms, mới thêm ở lần này).
- Seq Scan trên 3 bảng lớn (queue_items, incidents, incident_operation_links) chỉ được phép khi nó GIỮ LẠI >= 25% số dòng nó đọc (đọc phần lớn bảng là đúng; đọc cả bảng để lấy một mẩu là thiếu chỉ mục). Vi phạm = ngược lại, ở BẤT KỲ câu nào, mọi scope.
- Tối đa 11 câu / request. Không bỏ facet, không đổi count thành 0.

## Lịch sử đo (số ghi tay từ các lần chạy TRƯỚC, cùng corpus scale 1.0; lần chạy này là số trong bảng bên dưới)

- Lab (scale 0.3, workspace lớn 180k dòng, scope 2000 tuple), dạng predicate CŨ (row-IN literal): COUNT(*) 312 s (bị hủy bởi trần 120 s), page 575 s, tức là 503 chắc chắn ở trần 2 s của production. 50 tuple: 225 ms; 200 tuple: 1161 ms (tuyến tính theo số tuple x số dòng).
- Lab, dạng MỚI (text[] + semi-join), cùng dữ liệu: COUNT 118 ms, page 168 ms, GROUP 123 ms (Hash Join + Parallel Seq Scan workspace).
- Chạy gate scale 1.0 SAU khi sửa predicate nhưng TRƯỚC migration 148: mọi request <= 2.0 s tổng (broad default 1776 ms, page 628 ms là câu chậm nhất), nhưng scope hẹp (3 tuple, 155 dòng) vẫn 932 ms vì đọc cả bảng 1M dòng ở 6 câu; 268 vi phạm Seq Scan; mid1/broad 15% bảng cũng Seq Scan.
- Chạy gate scale 1.0 SAU migration 148 nhưng CHƯA có ngưỡng `rowScopeIndexMaxTuples`: scope hẹp rất nhanh (cold 24 ms, hot 170 ms, 200 tuple 750 ms, 0 Seq Scan vi phạm) nhưng scope 2000 tuple CHẬM HƠN 2x (broad default 3904 ms, page 1640 ms, limit250 vượt 2 s = 503) vì planner nhân selectivity từng cột, đánh giá thấp số dòng khớp và chọn hàng nghìn probe index. Đó là lý do có ngưỡng.

## Kết quả theo request

`n` = filtered_count của request. `ms` = tổng request median (min..max). `max stmt` = câu chậm nhất (median). Seq = số Seq Scan giữ < 25% dòng đọc (đọc >= 10k dòng/loop). Dòng có dấu `*` là request có bộ lọc phụ chưa có index riêng: chỉ ghi nhận, kiểm bằng ngân sách thời gian (xem phần Còn lại); dòng không dấu: vi phạm = lỗi gate.

| ws | scope (tuple) | case | n | ms | max stmt | #stmt | Seq |
|---|---|---|---|---|---|---|---|
| big | broad (2000) | default | 338968 | 1921.7 (1879.8..2041.1) | page 634.7 | 7 | 0 |
| big | broad (2000) | limit250 | 338968 | 1990.3 (1953..2111.9) | page 647.9 | 7 | 0 |
| big | broad (2000) | sort asc | 338968 | 2137 (2028.4..2250.6) | page 699.9 | 7 | 0 |
| big | broad (2000) | triage_state | 50896 | 1219.4 (1195.6..1231.8) | facet:triage_state 263.2 | 8 | 0* |
| big | broad (2000) | severity common | 169317 | 1835 (1761.7..1859.5) | page 403.8 | 8 | 0* |
| big | broad (2000) | severity rare | 17194 | 1283.4 (1282.5..1350.6) | facet:severity 262.7 | 8 | 5* |
| big | broad (2000) | source_status | 67671 | 1460.3 (1449.2..1492.4) | facet:source_status 257.8 | 8 | 5* |
| big | broad (2000) | verification_result | 27148 | 1367.3 (1326.3..1521.4) | facet:verification_result 251.7 | 8 | 5* |
| big | broad (2000) | environment | 108152 | 1491.9 (1464.9..1510.1) | page 301.7 | 8 | 6* |
| big | broad (2000) | target_type | 111770 | 1544 (1507.3..1565.4) | page 322.7 | 8 | 6* |
| big | broad (2000) | target_id | 7707 | 461.9 (451.8..481.4) | total 255.9 | 8 | 0* |
| big | broad (2000) | command_key | 85070 | 1469 (1436.9..1511.3) | page 288 | 8 | 6* |
| big | broad (2000) | four filters | 10994 | 1283.7 (1281.5..1304.5) | total 251.4 | 8 | 6* |
| big | broad (2000) | cursor after p10 | 338968 | 2151.2 (2150..2177.1) | page 832.9 | 8 | 0 |
| big | broad (2000) | cursor before p10 | 338968 | 1815.2 (1813.4..1839.3) | page 464.9 | 8 | 0 |
| big | hot (3) | default | 13207 | 173.6 (154.8..178.4) | page 66.3 | 7 | 0 |
| big | hot (3) | limit250 | 13207 | 220.4 (203.3..227.5) | page 85.8 | 7 | 0 |
| big | hot (3) | sort asc | 13207 | 170.4 (163.4..174.2) | page 67.2 | 7 | 0 |
| big | hot (3) | triage_state | 2040 | 133.9 (133.1..143.7) | page 23.1 | 8 | 0* |
| big | hot (3) | severity common | 6572 | 159.8 (151.7..161.6) | page 42.7 | 8 | 0* |
| big | hot (3) | severity rare | 668 | 134.8 (131.5..142.1) | page 21.2 | 8 | 0* |
| big | hot (3) | source_status | 2690 | 143.3 (136.7..176.7) | page 28.8 | 8 | 0* |
| big | hot (3) | verification_result | 1052 | 133.3 (131.3..133.3) | page 23 | 8 | 0* |
| big | hot (3) | environment | 0 | 22.6 (22.6..24.9) | total 14.1 | 7 | 0* |
| big | hot (3) | target_type | 3130 | 74.7 (67.4..77.6) | page 17.4 | 8 | 0* |
| big | hot (3) | target_id | 7707 | 118.5 (117.2..122.7) | page 39.7 | 8 | 0* |
| big | hot (3) | command_key | 3315 | 130.7 (129.4..135.8) | page 28 | 8 | 0* |
| big | hot (3) | four filters | 385 | 129.4 (126.2..130.4) | page 18.6 | 8 | 0* |
| big | hot (3) | cursor after p10 | 13207 | 176.1 (173.6..191.5) | page 76.5 | 8 | 0 |
| big | hot (3) | cursor before p10 | 13207 | 153.4 (137.9..175.1) | page 51.1 | 8 | 0 |
| big | mid (200) | default | 58377 | 748.3 (698.6..766.4) | page 290.7 | 7 | 0 |
| big | mid (200) | triage_state | 8773 | 580 (560.3..584.4) | page 97.9 | 8 | 0* |
| big | mid (200) | severity rare | 2988 | 539.8 (534.1..572) | facet:severity 87.9 | 8 | 0* |
| big | mid (200) | four filters | 1898 | 513.8 (511.5..548.4) | page 81.9 | 8 | 0* |
| big | mid (200) | cursor after p10 | 58377 | 738.8 (728.7..752.8) | page 345.7 | 8 | 0 |
| big | mid (200) | cursor before p10 | 58377 | 567.3 (562.4..579.1) | page 178.8 | 8 | 0 |
| big | cold (3) | default | 155 | 19.4 (18.8..24.3) | links 4.7 | 7 | 0 |
| big | cold (3) | triage_state | 34 | 16.3 (14.6..19.8) | links 3.5 | 8 | 0* |
| big | cold (3) | severity rare | 5 | 14 (13.1..15.1) | links 2.6 | 8 | 0* |
| big | cold (3) | four filters | 8 | 13.1 (12.7..14.3) | links 2.7 | 8 | 0* |
| big | t400 (400) | default | 72617 | 841 (810.4..910.3) | page 341.6 | 7 | 0 |
| big | t400 (400) | triage_state | 10866 | 720.7 (719..781.9) | page 125.2 | 8 | 0* |
| big | t400 (400) | severity rare | 3747 | 645.7 (620.5..648.4) | page 103.5 | 8 | 0* |
| big | t400 (400) | four filters | 2344 | 751.1 (667.5..847.1) | facet:source_status 125.2 | 8 | 0* |
| big | t400 (400) | cursor after p10 | 72617 | 885.5 (882.7..962) | page 409.2 | 8 | 0 |
| big | t400 (400) | cursor before p10 | 72617 | 717.3 (703.3..779.1) | page 222.2 | 8 | 0 |
| big | t800 (800) | default | 154582 | 1591 (1481.4..1721.3) | page 401.9 | 7 | 0 |
| big | t800 (800) | triage_state | 23138 | 1007.1 (999.4..1061.8) | facet:triage_state 227.1 | 8 | 0* |
| big | t800 (800) | severity rare | 7890 | 1194.9 (1178.7..1195.9) | facet:severity 228.4 | 8 | 5* |
| big | t800 (800) | four filters | 5035 | 1462.5 (1407.5..1506.6) | total 299.6 | 8 | 6* |
| big | t800 (800) | cursor after p10 | 154582 | 1904.9 (1830..2202.6) | page 712.6 | 8 | 0 |
| big | t800 (800) | cursor before p10 | 154582 | 1604.4 (1561.4..1619.1) | page 469.7 | 8 | 0 |
| mid1 | broad (2000) | default | 131562 | 818.7 (817.5..842.5) | page 252.7 | 7 | 0 |
| mid1 | broad (2000) | triage_state | 19663 | 576.6 (574.6..588.8) | facet:triage_state 115.1 | 8 | 0* |
| mid1 | broad (2000) | severity rare | 6643 | 574.9 (564.8..610.1) | facet:severity 107.5 | 8 | 0* |
| mid1 | broad (2000) | four filters | 4323 | 577.7 (570..581.8) | total 99.4 | 8 | 0* |
| small1 | broad (800) | default | 49048 | 547.7 (533.5..569) | page 225.4 | 7 | 0 |
| small1 | broad (800) | triage_state | 7211 | 241.6 (239..247.1) | facet:triage_state 61.9 | 8 | 0* |
| small1 | broad (800) | severity rare | 2452 | 248 (246.8..249.6) | facet:severity 63.3 | 8 | 0* |
| small1 | broad (800) | four filters | 1685 | 275 (266.2..294.1) | total 48.2 | 8 | 0* |

## Plan từng câu: big / broad / default

| câu | ms (median) | rows | plan (scan nodes) | exec trong plan ms |
|---|---|---|---|---|
| total | 239.1 | 1 | Seq Scan[execution_operation_queue_items] | 270.7 |
| page | 634.7 | 101 | Seq Scan[execution_operation_queue_items] | 660.1 |
| links | 14.2 | 24 | Index Scan(execution_incident_operation_links_operation_idx) + Index Scan(execution_incidents_pkey) + Index Scan(execution_operation_queue_items_pkey) | 8.1 |
| facet:triage_state | 249 | 3 | Seq Scan[execution_operation_queue_items] | 349.3 |
| facet:verification_result | 250.7 | 8 | Seq Scan[execution_operation_queue_items] | 281.5 |
| facet:source_status | 252.3 | 7 | Seq Scan[execution_operation_queue_items] | 322.2 |
| facet:severity | 258.8 | 4 | Seq Scan[execution_operation_queue_items] | 351.2 |

## Plan từng câu: big / hot / default

| câu | ms (median) | rows | plan (scan nodes) | exec trong plan ms |
|---|---|---|---|---|
| total | 13.6 | 1 | Index Scan(execution_operation_queue_scope_idx) | 18.1 |
| page | 66.3 | 101 | Index Scan(execution_operation_queue_scope_idx) | 67.4 |
| links | 4.5 | 0 | Index Scan(execution_incident_operation_links_operation_idx) + Index Scan(execution_incidents_pkey) + Index Scan(execution_operation_queue_items_pkey) | 1.7 |
| facet:triage_state | 18.3 | 3 | Index Scan(execution_operation_queue_scope_idx) | 21.9 |
| facet:verification_result | 18.8 | 8 | Index Scan(execution_operation_queue_scope_idx) | 21.3 |
| facet:source_status | 18 | 7 | Index Scan(execution_operation_queue_scope_idx) | 21.8 |
| facet:severity | 17.8 | 4 | Index Scan(execution_operation_queue_scope_idx) | 20.7 |

## Dạng predicate scope cũ (bằng chứng cho thay đổi `rowScopeSql`)

Cùng corpus, workspace lớn nhất, scope rộng nhất (2000 tuple), `SELECT COUNT(*)` với row-IN literal của MỌI tuple (dạng trước BE-P18, OR của N điều kiện, O(dòng x N)): **7964.8 ms**. Dạng mới: một bind text[] mỗi cột + `IN (SELECT * FROM unnest(...))`, planner chọn semi-join (xem bảng trên).

Plan đầy đủ của MỌI câu của MỌI request (cây node, rows, loops, ms, buffers hit/read) nằm trong `BE-P18-b1-explain.plans.json`.

## Việc còn lại / không khẳng định

- Số đo là cache nóng (warm) trên một container PG 16 giới hạn 3 CPU/3 GB; chưa có số cold-cache hay số trên máy production thật.
- Bộ lọc phụ (severity, source_status, verification_result, environment, target_type, command_key) không có index riêng: scope rộng + lọc chọn lọc đọc cả bảng (Seq Scan, dấu * ở bảng) nhưng vẫn nằm trong ngân sách thời gian (<= 1.6 s/request đo được). Thêm 6 index lọc chưa làm: chi phí ghi + dung lượng, chưa có số liệu cho thấy cần.
- Câu `page` của scope rộng vẫn sort toàn bộ tập trong scope (top-N heapsort trên biểu thức to_char của view, ~0.6 s ở 340k dòng): index đúng thứ tự cần hàm to_char IMMUTABLE và thay view của migration 141 (CREATE OR REPLACE VIEW), nên để lại cho Codex quyết, không làm ở đây.
- Ngưỡng `rowScopeIndexMaxTuples`=500 được chọn giữa hai điểm đo (200 tuple: index nhanh hơn; 2000 tuple: scan nhanh hơn); gate đo thêm 400 và 800 tuple để kiểm hai phía của ngưỡng. Hình dạng phụ thuộc phân bố dòng/target thật; cần đo lại khi có số liệu production.
- Không đo tải đồng thời (nhiều request song song) và không đo bảng đang bị ghi; chỉ một request tuần tự.
- Corpus tổng hợp (TEST_ONLY): phân bố target/trạng thái là giả định có chủ đích (lệch mạnh), không phải dữ liệu thật.

## Ghi chú đánh số migration (2026-10-21, không sửa số liệu quan sát ở trên)
Các số đo và `plans.json` ở trên được quan sát khi file index mang số `1723680000148_execution-operation-queue-scope-lookup-index` trên chuỗi 142 migration. Khi gộp vào `claude/fe-parity`, số 148 đã thuộc `1723680000148_execution-manager-series-repair-attempts` (CR-02), nên file index được đổi tên thành `1723680000149_execution-operation-queue-scope-lookup-index`. Nội dung file không đổi: SHA256 `f306ecc973f2ea878c70bc26c000f888801c39d88274589562c3ca96b22d3c7b` trước và sau khi đổi tên. Hiệu năng đã đo vì vậy giữ nguyên; chuỗi hiện tại (143 migration) cần một lần kiểm PG ngắn cho CR-02 và index, không cần lặp lại benchmark một triệu dòng.
