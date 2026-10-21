# ELP2-10 — Đề xuất budget và calibration để Bobby duyệt một lần (T10-08 / T10-13, Claude, 2026-10-20)

Owner Claude (giao việc 2026-10-20). Base `be6d98d1`. Tài liệu đọc-nguồn, tier R0; không đo, không chạy gì. Cặp: [closeout plan](ELP2-10_CLOSEOUT_PLAN_2026-10-20.md) (mâu thuẫn C-1 về nhãn T10-13) và [measurement protocols](ELP2-10_MEASUREMENT_PROTOCOLS_2026-10-20.md) (M-1…M-7).
**Trạng thái toàn bộ đề xuất: `PROPOSED_NOT_APPROVED`.** Không số fixture nào là production default. Ô không có cơ sở ghi `NO BASIS: needs measurement M-n`. Công thức/trọng số/band Score v1.1 đã chốt, **không hỏi lại**.

Nhãn mỗi số: `SOURCE_ONLY` (đọc từ code/packet), `FIXTURE_VERIFIED` (đo trên fixture UXM-10, lane FIXTURE_LAB / BFF_DOUBLE), `PROPOSED_NOT_APPROVED` (đề xuất này). Một số có thể mang hai nhãn: nguồn gốc + trạng thái duyệt.

## 1. Cách duyệt "một lần": duyệt quy tắc, số được điền từ đo

Hầu hết số production (14 nhóm Edge, 42×3 manifest) không thể đặt khi chưa có B0/baseline. Thay vì xin Bobby từng số, xin duyệt **ba thứ**: (a) bộ quy tắc margin dưới đây, (b) bộ guard/cap cho browser và safety tripwire ở §3-§6, (c) giao thức đo M-1…M-7. Số production sinh cơ học từ receipt M-n theo quy tắc; receipt nào ra ngoài pass rule thì quay lại Bobby, receipt đạt thì áp dụng không hỏi lại (cùng tinh thần "delegated closing decisions": áp dụng khuyến nghị đã ghi, đánh dấu `DECISIONS_DELEGATED`).

| Quy tắc | Áp cho | Công thức | Cơ sở | Falsify khi |
| --- | --- | --- | --- | --- |
| R-A đếm xác định | số request, số SELECT, số listener, số lần đọc | `guard = ceil(1.25 × measured)` | Đã dùng trong spec (`apps/portal/frontend/e2e/execution-v2-coexistence.spec.ts:23,269`); hai lần chạy trên hai số worker cho đếm/byte giống hệt (UXM-10 `README.md:27,183`) | Hai lần chạy cùng build lệch nhau (>0) ⇒ tính nhiễu, chuyển sang R-C |
| R-B byte giải mã của fixture | byte body API/asset | chỉ `guard` hồi quy; **không** sang production | Double trả 5–50 dòng (UXM-10 `:110`); byte phụ thuộc dữ liệu | Luôn đúng: không dùng làm budget production |
| R-C đo có nhiễu | CPU, RSS, p95/p99, lag, WAL | `bound = 1.25 × max(p95 qua ≥2 lần lặp độc lập)` và không tệ hơn B0 theo `MAX_DELTA/MAX_RATIO` do plan ghim | Plan Edge: 600 s × 2 lần lặp độc lập, stage counterbalanced (`source-alignment.md:65`; `qualification-readiness.mjs` kiểm cấu trúc) | Phương sai 2 lần lặp > 25% giá trị ⇒ tăng số lần lặp thay vì nới margin |
| R-D tripwire server | cap trong code | giữ nguyên, nhãn `SAFETY_TRIPWIRE`, **không** là capacity | `measurement-manifest.json existing_manager_component_safety_caps_not_production_budgets`; `capacity-recovery-runbook.md:77-79` | Đo cho thấy cap bị chạm ở tải bình thường ⇒ mở lại bằng M-4 |
| R-E mặc định FE là sàn | coalescing/retry/resync của FE | `effective = max(FE default, giá trị server publish)` | UXM-08 `README.md:73,88`: không contract nào publish; giá trị FE tự chọn | Server publish `resnapshot_not_before`/min window nhỏ hơn ⇒ FE vẫn dùng sàn FE (an toàn), hoặc Bobby hạ |

25% là margin của hồi quy xác định, **không** phải dung sai năng lực. Không có phân tích thống kê nào hỗ trợ con số 25% ngoài việc nó đã nằm trong spec; ghi nhận như lựa chọn, Bobby có thể thay.

## 2. Giả định đầu vào duy nhất thiếu

Không packet nào nêu số người dùng × tab đồng thời của release đầu. Mọi con số "tải" bên dưới là **phép nhân minh họa**, không phải năng lực. Bobby nêu mục tiêu (users, tab/user) ở D5; M-2 quét 1/2/4/8/16 tab không phụ thuộc mục tiêu đó.

## 3. Browser tab (từ UXM-10, FIXTURE_LAB)

Đo ở build 2026-10-20, `claude/fe-parity`, 32 route, request cùng origin, byte giải mã, cache lạnh (UXM-10 `README.md:185`; bảng `BUDGET` trong spec `:147-263`). Bảng ngắn §2.1 của README đã cũ (C-4); dùng spec.

| ID | Tham số | Giá trị đề xuất | Nguồn gốc / dẫn xuất | Nhãn | Falsify khi | Đo xác nhận |
| --- | --- | --- | --- | --- | --- | --- |
| B-1 | Trần request API lần tải đầu (class) | 18 | max đo 14 (`new-request-drawer`, `portfolio-360`) × 1.25 = 17.5 → 18 (R-A) | FIXTURE_VERIFIED, PROPOSED_NOT_APPROVED (guard hồi quy) | Nguồn thật thêm đọc phân trang/enrichment | M-1c (connected), M-2 |
| B-2 | Trần theo từng route | `ceil(1.25 × measured)` của spec (6–14 → 8–18) | Bảng `BUDGET` sinh bởi `UXM10_MEASURE_OUT` | FIXTURE_VERIFIED, PROPOSED_NOT_APPROVED | Build đổi ⇒ sinh lại bảng | M-1 |
| B-3 | Byte API lần tải đầu | guard hồi quy tối đa 253,570 B (admin, đo 202,856); **production: NO BASIS: needs measurement M-1c** | R-B; double 5–50 dòng | FIXTURE_VERIFIED (guard), NO BASIS (production) | Luôn: dữ liệu thật đổi cỡ body | M-1 (bffScale large), M-1c |
| B-4 | Request khi đổi tab (class) | 4 (ngoại lệ đã biết `portfolio-360`: đo 12, lỗi F-8, **không** duyệt 12 như budget) | max các route còn lại = 3 (`account-360`, `alpha-replay`) × 1.25 = 3.75 → 4; trung vị 2, p90 2 | FIXTURE_VERIFIED, PROPOSED_NOT_APPROVED | Sửa F-8 xong portfolio-360 vẫn >4 | M-1 |
| B-5 | Byte khi đổi tab | guard 99,158 B (`workbench-vnm`, đo 79,326); production NO BASIS: needs measurement M-1c | R-B | như B-3 | như B-3 | M-1c |
| B-6 | Asset cache lạnh | guard 117 file / 4,068,544 B giải mã (đo 42–93 file, 1.08–3.25 MB); **transfer size gzip (cold): ĐÃ ĐO 2026-10-21, bundle thật qua gzip level 5 như `deploy/nginx/portal.conf`: 86–92 file, p50 1,008,721 B, max 1,076,093 B (tỷ lệ 0,33 so với giải mã); brotli: nginx hiện chỉ bật gzip, không phải số đo mà là quyết định triển khai; cache ấm: NO BASIS: needs measurement M-1b (lần đo ấm không hợp lệ vì `page.route` tắt HTTP cache, xem M-1 receipt)** | R-A/R-B; F-7: ~2.9 MB gần như đồng đều ⇒ cần bundle analysis | FIXTURE_VERIFIED (guard); transfer gzip cold = MEASURED_BUILD (asset thật, không phải số fixture-dữ-liệu), PROPOSED_NOT_APPROVED | Nén thực tế đổi nhiều bậc | M-1b (ấm) |
| B-7 | Tab ẩn | 0 request trong 60 s trên cả 32 route; quay lại hiển thị: 0 request bù | Bất biến đo được (UXM-10 `README.md:57-59`), không phải con số | FIXTURE_VERIFIED, đề xuất duyệt như bất biến | Một route ẩn mà vẫn gọi | M-1 |
| B-8 | Tab hiện, rảnh 60 s | 0 request trên 31 route; Overview 8 (guard 10) | 4 tick × 2 đọc; `IDLE_VISIBLE_60S` (spec `:341-348`) | FIXTURE_VERIFIED | Xem §5 | M-2 |
| B-9 | Cân bằng listener/interval | trở về mức nền sau unmount; 5 chu kỳ drawer | Bất biến (UXM-10 `:83-87`) | FIXTURE_VERIFIED | Phát hiện rò rỉ | M-1 |
| B-10 | CPU, heap, TTI mỗi tab | NO BASIS: needs measurement M-1c (bộ thu đã có và đã chạy trên fixture: số heap/CPU/TTI chỉ ghi nhận trong `ELP2-10/measurements/M-1-2026-10-21.json`, lane BFF_DOUBLE trên host tải cao, không phải cơ sở budget) | UXM-10 `:112` | — | — | M-1 (gap G-3) |
| B-11 | DOM node/dòng khi 10³–10⁵ dòng, điểm vỡ virtualization | NO BASIS: needs measurement M-1c (bffScale large chỉ 1,500 order; fixture 3 cỡ đã ghi nhận trong M-1 receipt, chưa định vị điểm vỡ virtualization) | UXM-10 `:110`; `CLAUDE.md` §8 | — | — | M-1 |
| B-12 | Số tab đồng thời mỗi người dùng | NO BASIS: needs Bobby D5 (quét 1/2/4/8/16 đã duyệt) + measurement M-2c (fixture: tầng 1 tuyến tính 80 đọc/tab/600 s, tầng 3-4 chưa đo được) | Không có trong packet | — | — | M-2 |

## 4. Fan-out truy vấn và trần trang (server, SOURCE_ONLY)

Nguồn: `measurement-manifest.json existing_manager_component_safety_caps_not_production_budgets` (scope `alpha_fleet_overview` document, không phải mọi family). Tất cả là **tripwire an toàn, không phải capacity** (R-D).

| Tham số | Giá trị | Ý nghĩa đúng | Nhãn | Falsify khi / đo |
| --- | --- | --- | --- | --- |
| `public_page_rows` | 200 | Bound của **một trang**, không phải tổng lịch sử; đi tiếp bằng cursor, cấm cắt cả lịch sử bằng cap (`AGENT_WORKING_RULES.md` §3 mục 9 `:80-86`; handoff `:264`) | SOURCE_ONLY | Màn cần tổng toàn bộ phải dùng aggregate server-side, không traverse client (Scale refine) |
| `public_response_bytes` | 1,048,576 | Trần byte một trang; tính tối đa 1 MiB × số đọc đồng thời | SOURCE_ONLY | M-4 |
| `document_flights_default_per_process` / `…_allowed_maximum` | 4 / 16 | Số flight tài liệu bất biến độc lập mỗi process | SOURCE_ONLY | M-4 (đo wait pool) |
| `pending_document_readers_per_process` | 32 | Tối đa 32 × 8 MiB = 256 MiB bản sao tuần tự hóa của follower, **trước** overhead object/parse (`capacity-recovery-runbook.md:61-62`) | SOURCE_ONLY | RSS thật qua M-4 |
| `input_members` / `input_facts` / `input_serialized_bytes` | 10,000 / 20,000 / 8,388,608 | Chặn đầu vào writer/đọc | SOURCE_ONLY | M-4 |
| `immutable_revisions_per_partition` | 1,024 | Dừng an toàn; 8 MiB × 1,024 ≈ 8 GiB payload/partition trước JSONB/index/WAL (runbook `:77-79`); **không** là retention | SOURCE_ONLY | M-6 |
| `lease_ttl_ms_maximum` / `lease_ttl_ms_default` | 300,000 / `null` | TTL mặc định chưa có ⇒ **NO BASIS: needs measurement M-6** (quy tắc dẫn xuất: TTL > deadline lấy nguồn + timeout commit, ≤ 300,000) | SOURCE_ONLY | M-6 |
| Cache | không có TTL/auth/head cache; chỉ coalescing in-flight (runbook `:56-58`) | Không có tham số cache để duyệt | SOURCE_ONLY | — |
| Quy tắc FE đề xuất | Mỗi hành động người dùng ⇒ đọc tối đa **một trang**; trang kế chỉ theo thao tác (keyset cursor) | Không màn nào tự duyệt nhiều trang | PROPOSED_NOT_APPROVED | Màn có yêu cầu aggregate tổng |

Tripwire thử nghiệm của EPG10-06 (`TEST_ONLY_ISOLATED_SAFETY_TRIPWIRES_NOT_PRODUCTION_APPROVAL`, `capacity_acceptance:false`; `source-alignment.md:66,69-75`): active 3 / reserve 1; 8,192 entry (2,048 reserved); 128 MiB (40 MiB reserved); pool 3; sample storage 60 s. Giữ nhãn tripwire, **không chuyển** thành giá trị runtime; production NO BASIS: needs measurement M-4. Cài đặt lịch sử HK/SGP (admission 8 r/s, 8 concurrent, cache 750 ms, lease 7 s; SGP 15 r/s, 64 concurrent, 15 s, lease 120 s, stale 300 s, journal 86,400 s/10,000, `source-alignment.md:115-120`) **không quan sát lại** ⇒ NO BASIS: needs read-only repin (M-0 trong protocols §3).

## 5. Realtime và polling

| ID | Tham số | Giá trị | Dẫn xuất | Nhãn | Falsify khi | Đo xác nhận |
| --- | --- | --- | --- | --- | --- | --- |
| RT-1 | `coalesceWindowMs` (V2) | 1,000 ms | `DEFAULT_STREAM_CONFIG` (`v2/realtime/scopedStreamMachine.ts:83-88`), **lựa chọn của FE** (`:32-34`, UXM-08 `README.md:73`). Hệ quả đã kiểm: ≤1 lần đọc/giây/màn; 100 delta/s × 10 s ⇒ 9–11 lần đọc; 300 delta/tick ⇒ 2 | FIXTURE_VERIFIED, PROPOSED_NOT_APPROVED | Server publish cửa sổ gộp tối thiểu lớn hơn (R-E) | M-3 |
| RT-2 | `maxAutoResyncs` / `resyncWindowMs` | 3 / 60,000 ms | như trên; vượt ngân sách ⇒ `unavailable` (RESYNC_LIMIT), bão 10,000 frame ≤ ngân sách | FIXTURE_VERIFIED, PROPOSED_NOT_APPROVED | Server `RECONNECT_LIMIT` khác | M-3 |
| RT-3 | `retryMinGapMs` (thử tay) | 5,000 ms | như trên; không retry tự động vô hạn | FIXTURE_VERIFIED, PROPOSED_NOT_APPROVED | UX: người dùng cần nhanh hơn | M-3 |
| RT-4 | V1 `REALTIME_COALESCE_MS`, `RECOVERY_FALLBACK_MS` | 1,000 ms, 1,000 ms | `profileRealtime.ts:403,419`; resnapshot theo `resnapshot_not_before` của nguồn nếu có | FIXTURE_VERIFIED | như RT-1 | M-3 |
| RT-5 | Watchdog im lặng, nhịp heartbeat, ngân sách reconnect phía server | NO BASIS: needs measurement M-3 (và server publish, request UXM08-A) | UXM-08 `README.md:88`: không operation/route/số nào publish | — | — | M-3 |
| PL-1 | Overview polling | 15,000 ms, 2 đọc/tick (⇒ 8 request/60 s, 0.133 req/s/tab) | `PROJECTION_POLL_MS` (`useRevision.ts:66`), kế thừa từ giá trị dev `EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS` (`:61-65`); kẹp 5,000–60,000 ms khi server gợi ý `refreshIntervalMs` (`freshnessPollMs`, `:70-76`) | FIXTURE_VERIFIED (đo), PROPOSED_NOT_APPROVED | Xem D3 | M-2 |
| PL-2 | Cadence màn khác | không poll; đọc theo stream/điều hướng | UXM-10 `README.md:57` | FIXTURE_VERIFIED | — | M-2 |
| PL-3 | Không arm timer khi tab ẩn | đề xuất (F-6): không đổi hành vi mạng (đã 0), chỉ bỏ timer vô ích | UXM-10 `README.md:170` | PROPOSED_NOT_APPROVED | — | M-1 |

Phép nhân minh họa (không phải năng lực): N tab Overview hiển thị ⇒ 0.133·N req/s tại BFF. Với N=100 là 13.3 req/s, so với 15 r/s **lịch sử** SGP admission (không quan sát lại) là ~89%: lý do khuyến nghị M-2 phải đo chi phí mỗi đọc trước khi tăng người dùng, và vì sao cadence **chưa** thể gọi là "an toàn cho N tab".

**Overview 15 s: khuyến nghị GIỮ 15 s** làm mặc định `PROPOSED_NOT_APPROVED` (đổi sẽ không có cơ sở; freshness target `freshness_target_ms` cũng chưa duyệt). Xem xét nâng khi M-2 cho thấy chi phí mỗi đọc vi phạm nhóm B-EDGE/B-ANALYTICS đã duyệt; không có ngưỡng số trước đó.

## 6. Tham số theo packet (manifest 42 family × 3 environment, 23 tên) và 14 nhóm Edge

Nguồn tên: `measurement-manifest.json per_family_profile_production_budget` (toàn `null`, `BLOCKED_NOT_APPROVED_NOT_MEASURED`) và `BUDGET_GROUPS` (`scripts/execution-v2/qualification-readiness.mjs:18-19`).

| Tham số (tên packet) | Xử lý đề xuất | Nhãn |
| --- | --- | --- |
| `page_rows`, `page_bytes` | trần = 200 / 1,048,576 (R-D) | SOURCE_ONLY, PROPOSED_NOT_APPROVED |
| `expected_rows`, `expected_row_bytes`, `batch_rows` | NO BASIS: needs measurement M-4 (khối lượng thật theo family) | — |
| `source_cadence_ms`, `freshness_target_ms`, `replay_horizon_ms` | NO BASIS: needs measurement M-3/M-7 + quyết định Bobby về freshness | — |
| `event_rate_per_s`, `event_burst`, `concurrent_subscriptions` | NO BASIS: needs measurement M-3, M-5 và D5 | — |
| `pool_connections_all_replicas`, `queue_entries_all_replicas`, `queue_bytes_all_replicas`, `query_timeout_ms` | NO BASIS: needs measurement M-4 (tripwire thử nghiệm không chuyển) | — |
| `storage_bytes`, `retention_ms`, `checkpoint_lag_alarm_ms` | NO BASIS: needs measurement M-6 + Bobby nêu RPO/RTO/horizon (D6) | — |
| `load_shedding_policy_ref` | tham chiếu hành vi đã có: dừng admission, 503 sanitized, không ACK, không xóa lịch sử, không hạ revocation (runbook `:54-87`) | SOURCE_ONLY |
| `latency_percentile_budget_ref` | điền theo R-C sau M-5 | — |

14 nhóm Edge (`B-TS-CPU, B-TS-RAM, B-TS-DB, B-TS-IO, B-TRADE, B-RS, B-FRESH, B-REVOKE, B-RECOVERY, B-CMD, B-HISTORY, B-DL, B-EDGE, B-ANALYTICS`): vocabulary của Edge EPG10-01, **không phải SLO Portal mới**; bound nguồn là composite (`MAX_ABSOLUTE_AND_DELTA`, `SOFT_HIGH_HARD_AND_ACTIONS`, …) mà công cụ từ chối làm phẳng. Đề xuất: Claude không đặt số; mỗi nhóm cần (i) Edge/TS/DL phân rã scalar `bound_kind ∈ {MAX_ABSOLUTE, MIN_ABSOLUTE, MAX_DELTA, MAX_RATIO}`, (ii) baseline từ B0 (M-5), (iii) bound theo R-C. Tất cả hiện NO BASIS: needs measurement M-5 (B-TS-*, B-TRADE, B-DL, B-EDGE), M-3 (B-FRESH, B-REVOKE), M-6 (B-RECOVERY, B-HISTORY), M-4 (B-RS, B-ANALYTICS, B-CMD).

## 7. T10-13 — calibration Score P3 (riêng, không gộp budget)

Formula `qbts_prb_v1_1`, F=0.45P+0.30R+0.25B, trọng số, band: **đã chốt, không mở lại**. Thiếu: anchors L/U theo từng metric family và horizon (7/30/90 ngày), `delta_bps` stress, block manifest, lưới quan sát/lịch, ngưỡng maturity/math/freshness, phương pháp cash/FX/cost, hash + approval độc lập (Score spec `:667`, `:196-222`). Không điền placeholder vào trường số.

| Tham số | Giá trị | Nhãn |
| --- | --- | --- |
| Mọi anchors L/U, `delta_bps`, block horizon, maturity | NO BASIS: needs measurement M-8 (nghiên cứu calibration trên lịch sử Research; không phải đo hiệu năng) | — |
| Dữ liệu hiện có | census 4 run COMPLETED, 14 ngày OOS, 4 hash quan sát giống nhau ⇒ **không đủ** làm anchors (`commissioning-followthrough.md:521-538`) | SOURCE_ONLY |
| Công cụ | `scripts/execution-v2/calibration-census.mjs` (+`.test.mjs`, `-parquet.py`); `qualification-readiness.mjs` nhận artifact `portal.execution.manager-score-policy-runtime.v1` + loader receipt | SOURCE_ONLY |

M-8 (mô tả ngắn, không số): quần thể comparable-basis cố định, đóng băng trước khi xem kết quả; fit anchors trên cửa sổ calibration biết trước, không trên tập đánh giá (Score spec `:70`); báo phân phối điểm, band occupancy, clipped ratio, độ nhảy khi thêm một block (`:382`); người duyệt **độc lập** với người fit. Falsify: anchors hợp lệ không đạt mục tiêu quản trị ⇒ báo mâu thuẫn theo profile cụ thể, không đổi formula (`:387`).

## 8. Quyết định cho Bobby (một câu hỏi, khuyến nghị kèm)

| # | Câu hỏi | Khuyến nghị |
| --- | --- | --- |
| D1 | Duyệt bộ quy tắc R-A…R-E và cơ chế "số sinh từ receipt M-n, đạt pass rule thì áp dụng không hỏi lại"? | Duyệt. Receipt vượt pass rule quay lại Bobby |
| D2 | Duyệt B-1…B-9 như **guard hồi quy** (không phải production budget), ngoại lệ portfolio-360 tab-switch (F-8) chưa tính? | Duyệt |
| D3 | Overview polling: giữ 15 s hay nâng? | Giữ 15 s; xét lại sau M-2 |
| D4 | RT-1…RT-3 là sàn FE (server publish lớn hơn thì thắng, R-E)? | Duyệt |
| D5 | Mục tiêu release đầu: số người dùng và tab/người? (cần cho mọi con số tải) | Bobby nêu; nếu chưa có, M-2 quét 1/2/4/8/16 và quyết sau |
| D6 | Cho phép Claude xin cửa sổ độc quyền (M-5, M-7) qua Edge/owner TS/DL, và Bobby nêu RPO/RTO/retention horizon *sau* khi M-6 đo thời gian restore? | Cho phép xin cửa sổ; chốt RPO/RTO sau M-6, không đoán trước |
| D7 | Calibration Score (T10-13): chỉ định người duyệt độc lập và quần thể calibration; tách khỏi duyệt budget? | Tách riêng; chỉ định người duyệt trước khi M-8 bắt đầu |

Chưa quyết (không hỏi ở đây): cap server ở §4 giữ nguyên (R-D), đổi chỉ khi M-4 cho bằng chứng.

## 9. Cập nhật 2026-10-21 sau khi chạy M-1…M-7 (không duyệt thêm gì)

Bobby đã duyệt D1–D4, quét D5 = 1/2/4/8/16 tab, D6 = được xin cửa sổ độc quyền, D7 = Codex là người duyệt độc lập. Receipt ở `ELP2-10/measurements/`, bảng tóm tắt ở `BE-P19-measurements.md`. **Chỉ một ô được thay `NO BASIS` bằng số đo (B-6, transfer gzip cold của bundle thật); mọi số fixture khác giữ nguyên nhãn, không số nào thành budget được duyệt, không số nào là calibration** (`calibration_evidence:false` trong mọi receipt đã chạy). Ô còn `NO BASIS` cần cửa sổ: M-1c, M-2c, M-3c, M-4b, M-5, M-6c, M-7 (`WINDOW_REQUESTS_2026-10-21.md`).
