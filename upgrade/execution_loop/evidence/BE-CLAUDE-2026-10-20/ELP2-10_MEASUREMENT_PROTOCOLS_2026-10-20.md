# ELP2-10 — Giao thức đo M-0…M-8 (Claude, 2026-10-20)

Owner Claude (giao việc 2026-10-20). Base `be6d98d1`. Tier R0: **chỉ viết giao thức, không chạy gì**; mọi giao thức dưới đây là `NOT_RUN`. Hình dạng workload/thời lượng là `PROPOSED_NOT_APPROVED` (không packet nào định nghĩa, trừ chỗ có dẫn nguồn). Cặp: [closeout plan](ELP2-10_CLOSEOUT_PLAN_2026-10-20.md), [budget proposal](ELP2-10_BUDGET_CALIBRATION_PROPOSAL_2026-10-20.md).
Không số nào sinh ra từ đây là SLO; pass/fail định lượng chỉ có hiệu lực sau khi Bobby duyệt quy tắc R-A…R-E và Edge/TS/DL phân rã 14 nhóm (proposal §1, §6). Trước đó chỉ có **pass nhị phân** (bất biến) và **ghi nhận** (record-only).

## 1. Quy tắc chung

| Chủ đề | Quy tắc |
| --- | --- |
| Hai kiểu chạy | `CAPPED_CORRECTNESS` (2 CPU / 1.5 GiB / 300 s ban đầu, 1 worker, mạng nội bộ, không host port, không lấy measurement lock, không giữ lock chờ peer) tách bạch với `ABSOLUTE_MEASUREMENT` (cửa sổ độc quyền do owner nguồn cấp). Receipt ghi nhãn kiểu chạy; p50/p95/p99 từ kiểu thứ nhất **không** được trích như năng lực (handoff `:176`) |
| Điều kiện trước (M-0) | Repin chỉ-đọc ngay trước khi chạy: SHA đầy đủ + digest dirty của Edge/PM, image Core, journal, lease root/user, job đang chạy; đọc lại root `AGENTS.md` §34b trên HK. Lease vắng ≠ host rảnh; lease cũ hết hạn ≠ đặt chỗ (`source-alignment.md:85-87`). Hai lock lịch sử đã ghi đều đã hết hạn; hiện hành UNKNOWN |
| Khóa SGP | `/tmp/portal-heavy.lock` chỉ khi dùng Docker/PG/visual/hook (rules §10.10a, quy ước giữa hai agent, không cơ chế ép). vitest/tsc/Playwright V2 chạy không khóa, `--maxWorkers=3`. Chuỗi nặng gói trong một script nền; không giữ lock chờ |
| Nguồn thật | Chỉ khi hàng Source Truth Board tương ứng là `EXISTS_MOUNTED` + receipt nguồn thật; HTTP 200/TLS/parser pass không đủ (handoff `:114`). Nhãn lane theo rules §9.5.5: `FIXTURE_LAB`, `BFF_DOUBLE`, `REAL_READ_RETAINED`, `REAL_READ_QUALIFIED` |
| Capture | Thư mục private tạo-độc-quyền `0700` dưới `/home/bobby/.local/state/portal-execution-elp210/<YYYYMMDD>/<protocol>-<NN>/` (mẫu `scripts/execution-v2/qualification-browser.mjs`, `stateRoot`); `receipt.json` + log có SHA-256 (log không commit). Trường tối thiểu: `schema_version` (`portal.elp2-10.<tên>.v1`), protocol, kiểu chạy, selection (`workspace_id`, `environment`, `profile_id`, `catalogue_sha256`, `schema_sha256`, `source_commit`, `dependency_hashes`: đúng `validSelection` của `qualification-readiness.mjs`), image digest, giới hạn tài nguyên, `started_at_ms/ended_at_ms`, readout lease, `measurements[{key,unit,bound_kind,value}]`, `evidence_class` (`TEST_ONLY…` cho đến khi thật sự `RUNTIME_VERIFIED`), cleanup readback |
| Cleanup | Đếm tài nguyên do mình sở hữu về 0 (container/network/tmpfs/session), 8 runtime được bảo vệ + provider stable không đổi, session tạm bị thu hồi bằng revoker chính thức, `UNKNOWN` giữ nguyên đối tượng gốc và recovery registry (timeout ≠ rollback). Không prune rộng |
| Ai chạy | Ghi trong từng giao thức. Claude không tự khởi chạy trên HK; việc ghi/mutation nguồn thuộc owner nguồn. Không bí mật trong receipt/chat |
| Không làm | Không hạ tải, không nới SLO để xanh; không dùng fixture làm production default; không gộp nhiều scope thành một chứng nhận; không `--no-verify` cho R3 |

## 2. Công cụ đã có (tái dùng theo đường dẫn) và khoảng trống

| Đường dẫn | Dùng cho | Ghi chú |
| --- | --- | --- |
| `apps/portal/frontend/e2e/execution-v2-coexistence.spec.ts` (+ `UXM10_MEASURE_OUT`) | M-1, M-2 phần browser | 32 route, đếm request/byte/idle/ẩn/listener; sinh lại bảng `BUDGET` |
| `apps/portal/frontend/src/execution/v2/budgets.test.ts` | M-1, M-3 phía FE | Hook realtime với port lỗi/chậm, fake timer |
| `apps/portal/frontend/e2e/bffScale.ts`, `apps/portal/fixture-bff/app.ts:68` (`FIXTURE_SCALE` small/medium/large) | M-1 | large = 120 alpha, 1,500 order, 400 operation; vẫn `FIXTURE_LAB` |
| `apps/control-api/test/elp210-performance.spec.ts` + `elp206-manager-{store,model,service}.spec.ts`, `elp2-read-projection.spec.ts` (lệnh trong `measurement-manifest.json isolated_cell.command`) | M-4a, M-6 | Chạy qua `scripts/control-api-test.sh <test/file.spec.ts>` (cell 3+1 CPU, 3+1 GiB, `:81,127,149`) |
| `apps/control-api/test/elp209-realtime.spec.ts`, `elp209-native-frame-coordinator.spec.ts` | M-3 phía server | Component, không nguồn thật |
| `scripts/execution-v2/qualification-readiness.mjs` (+test) | M-5, T10-08 | Chỉ kiểm cấu trúc; tối đa `READY_FOR_MEASUREMENT_REVIEW`, luôn `capacity_certified:false`; lược đồ `coexistence-plan.v1`, `coexistence-stage.v1`, `budget-metric-catalogue.v1` |
| `scripts/execution-v2/qualification-browser.mjs` | M-1c đọc-chỉ preview | Quan sát preview hiện có, không phải chấp nhận V2 |
| `scripts/execution-v2/calibration-census.mjs`, `-parquet.py` | M-8 | Offline, không phải calculator hay phê duyệt |
| Core009: `execution-native-revoke`, acceptance-session issuer/revoker (BE-P10), `CORE009_OPERATOR_RUNBOOK_2026-10-20.md` | M-2/M-3 dọn dẹp | Chưa cài; image cần build lại (BE-P10) |

| Gap | Thiếu gì | Owner đề xuất |
| --- | --- | --- |
| G-1 | Không script repo cho cell 2 CPU/1.5 GiB (`control-api-test.sh` cứng 3+1 CPU) và không rõ trần áp cho cell nào (C-3) | Claude đề xuất tham số hóa; Codex xác nhận |
| G-2 | Không có đếm source-call do Edge xuất theo cửa sổ/theo yêu cầu browser (cần để chứng minh "không tăng theo tab") | Edge |
| G-3 | Không bộ thu CPU/heap/TTI trình duyệt và không đo transfer nén (gzip/brotli, cache ấm); F-7 chưa có bundle analysis | Claude (FE) |
| G-4 | `resetAfterRestore` chỉ là method + test, không runner vận hành/drill restore | Claude + Core ops |
| G-5 | Driver ghi số lượng chờ pool, không ghi thời gian chờ (ms) (`measurements.md:48-50`); WAL/IO host, lag ingest không thu | Claude (instrumentation) |
| G-6 | Khóa heavy là quy ước, không script giữ/kiểm; không công cụ đọc lease HK ngoài SSH thủ công | Claude/Codex |

## 3. Giao thức

### M-0 — Repin chỉ-đọc (điều kiện của mọi giao thức) — `NOT_RUN`

| | |
| --- | --- |
| Kiểu / owner | Chỉ-đọc / Claude (SSH đọc đầy đủ được cho phép, rules §10.13) |
| Làm gì | SHA + digest dirty Edge `feat/execution-edge-upgrade-v1_2`, PM `feat/portfolio-account-v1_1-parallel`; Edge/PM journal mới nhất; lease/job; `AGENTS.md` §34b; image Core đang chạy (đọc từ receipt công khai Edge, không truy vấn DB/Docker mới); đọc cài đặt hiệu lực của admission/cache/lease (thay các số lịch sử `source-alignment.md:115-120`) |
| Pass | Mọi pin ghi kèm thời điểm quan sát; không mutation |
| Capture | `repin.json` (SHA-256), thời hạn hiệu lực = `--max-age-ms` chọn tường minh, không mặc định SLO |
| Cleanup / lock | Không có / không khóa |

### M-1 — Chi phí một tab ở khối lượng (UXM-10; M-1b nén; M-1c connected) — `NOT_RUN` cho b, c; a đã chạy trên fixture nhỏ

| | |
| --- | --- |
| Kiểu / owner | Capped / Claude (FE) |
| Workload | (a) 32 route × {`small`,`medium`,`large`} `FIXTURE_SCALE`: tải lạnh, đổi tab, rảnh hiển thị 60 s, ẩn 60 s, quay lại; 5 chu kỳ drawer; 19 màn × 3 vòng SPA. (b) Cùng bản build qua front nén thật (gzip/brotli) + cache ấm. (c) Cùng spec trên stack có BFF thật sau Core009 (nhãn `REAL_READ_QUALIFIED` chỉ khi hàng board `EXISTS_MOUNTED`) |
| Thời lượng | Một lần chạy toàn bộ ≈ 6 phút ở `small` (UXM-10 `README.md:185`, 138 pass); lặp 2 lần trên 2 số worker (như hiện hành) |
| Đo | Request, byte giải mã, asset (đã có); thêm: JS heap, CPU main thread, TTI, DOM node, điểm vỡ virtualization (G-3); transfer nén |
| Pass | Nhị phân: đếm giống hệt giữa hai số worker; không vượt guard B-1/B-2/B-4; bất biến B-7/B-9 giữ; 0 request ra ngoài origin. CPU/heap/TTI/transfer: **ghi nhận**, chưa pass/fail |
| Capture | JSONL `UXM10_MEASURE_OUT` → bảng `BUDGET` sinh lại; receipt `portal.elp2-10.browser-cost.v1` (đề xuất tên) |
| Cleanup / lock | Server riêng của config (cổng 4175/4176; private 4275/4276), đóng context; không Docker; không khóa. Host quá tải làm timing vô hiệu: ghi `host_load` trong receipt |

### M-2 — Khuếch đại browser → nguồn (T10-04) — `NOT_RUN`

| | |
| --- | --- |
| Kiểu / owner | Đếm = capped; p95 mọi tầng = chỉ khi trong cửa sổ độc quyền. Claude (tầng 1-2), Edge (tầng 3-4, G-2) |
| Điều kiện | Core009 composed (READ + STREAM tách), cửa sổ nguồn finite do Edge cấp, session nghiệm thu qua AuthService (BE-P10), trust còn hạn (lần quan sát gần nhất hết 15:00:59 20/10 giờ VN: kiểm lại) |
| Workload (đề xuất) | Quét số tab {1,2,4,8,16} × {1 người dùng; 2 người dùng cùng scope; 2 người dùng khác scope}. Mỗi tab: mở Overview, rảnh hiển thị 10 phút, đi 19 màn × 1 vòng, ẩn 5 phút, tải lại. Pha delta-storm nếu có frame nguồn thật. Mỗi ô ≈ 20 phút |
| Đo (4 tầng) | (1) request browser (Playwright). (2) BFF: đọc admitted/rejected, SELECT tài liệu, đếm chờ pool (manager store, `capacity-recovery-runbook.md:70-73`). (3) Core→Edge/nguồn: số call/cửa sổ (**G-2**). (4) TS/PM: call quy cho Portal (Edge). Không có tầng nào được mang credential nguồn tới browser |
| Pass | Nhị phân: tầng 3 với N tab ≤ `ceil(1.25 × tầng 3 với 1 tab)` cùng cửa sổ (độ dốc 0, R-A); SELECT tài liệu ≤ số khóa duy nhất (workspace, env, profile, revision) × flight; tab ẩn ⇒ 0; mọi tầng 1 trong guard B-1…B-8 × N |
| Capture | Một dòng/ô: `{tabs, users, scope_class, layer_counts, label}`; receipt gắn selection + hash trust/config Core009 |
| Cleanup / lock | Đóng context; thu hồi session tạm bằng revoker chính thức (đóng cả hai grant READ/STREAM đúng cửa sổ); readback zero custody (G5 runbook Core009); không khóa cho đếm; nếu báo p95 ⇒ cửa sổ độc quyền |

### M-3 — Realtime: lỗi, chậm, reconnect trên stream thật (UX-F21/F03) — `NOT_RUN`

| | |
| --- | --- |
| Kiểu / owner | Capped (đếm/bất biến); độ trễ truyền thu hồi chỉ ghi nhận. Claude + Edge (cửa sổ finite) |
| Workload | Rớt transport; consumer chậm (`SLOW_CLIENT`); gap sequence; bão `resync_required`; epoch rebuild; thu hồi READ-only, STREAM-only, cả hai; restart consumer; tab ẩn 1 giờ (rút gọn thời lượng bằng fake clock phía FE) |
| Đo | Số đọc/giây/màn, số resync/60 s, thời gian tới terminal, byte sau commit thu hồi, thời gian từ commit thu hồi tới đóng stream, cursor có bị reuse không |
| Pass | Nhị phân: ≤ 1 đọc/giây/màn; ≤ 3 auto-resync/60 s rồi `unavailable`; **0 frame bị hạn chế sau commit thu hồi**; không reconnect vô hạn; stale/replay cursor bị từ chối. Độ trễ thu hồi: record-only (không có ngưỡng: NO BASIS, cần Edge/Bobby) |
| Tái dùng | FE: `budgets.test.ts`; server: `elp209-realtime.spec.ts`, `elp209-native-frame-coordinator.spec.ts`; revoker BE-P10 |
| Cleanup / lock | Như M-2; không khóa |

### M-4 — Tải hỗn hợp query + ingest (T10-05) — `NOT_RUN` trên tip

| | |
| --- | --- |
| Kiểu / owner | (a) capped correctness local PG: Claude; (b) connected, đo tuyệt đối: cửa sổ độc quyền, Claude + owner nguồn. Export `N/A` (không có route export Execution Manager) |
| Workload (a) | Một tenure ghi commit successor + 20 reader cùng khóa + 20 reader revision cũ; ABBA (`UNCOALESCED, COALESCED, COALESCED, UNCOALESCED`), 1 member/1,000 fact (1,197,252 B) như `measurement-manifest.json isolated_cell`. Chạy lại trên tip vì code dưới test đã đổi (closeout §5) |
| Workload (b) | Writer mount thật với lease; tải đọc từ M-2; lặp ≥ 2; thời lượng theo plan Edge, không ngắn hơn `minimum_duration_ms` của plan |
| Đo | Hard: cùng digest, 20 vs 1 SELECT, admission hữu hạn, không stale commit/ACK, lịch sử còn. Diagnostic: p50/p95/p99, wall, CPU, RSS, pool waiting (đếm; thêm ms theo G-5), EXPLAIN (ANALYZE, BUFFERS), relation bytes, WAL, lag ingest |
| Pass | (a) nhị phân như "Hard"; diagnostic ghi nhận, không so với UDB 500/600 ms hay P184. (b) theo R-C sau khi budget duyệt |
| Capture | Bảng kiểu `measurements.md` + `receipt.json`; mỗi vòng ghi thứ tự, digest, plan |
| Cleanup / lock | Trap của `control-api-test.sh` sở hữu cell/network/temp; readback 0 tài nguyên sở hữu; `/tmp/portal-heavy.lock` cho (a); (b) cửa sổ độc quyền |

### M-5 — Coexistence TS/DL/Research B0/B1/B2 (T10-06) — `NOT_RUN`

| | |
| --- | --- |
| Kiểu / owner | `ABSOLUTE_MEASUREMENT`, độc quyền. Edge/TS/DL chạy; Claude cấp plan JSON, workload B1/B2 phía Portal, kiểm readiness |
| Workload | Theo `EPG10-01/measurement-plan.json` (Edge, `source-alignment.md:65`): B0 = TS+DL nền; B1 = producer tối thiểu + projection; B2 = dashboard/lịch sử/analytics; TRADE chuẩn 6,000/9,000 s⁻¹ cố định; **600 s × 2 lần lặp độc lập**, thứ tự stage counterbalanced do plan ghim; chung workload/config/hardware/cache/clock |
| Đo | 14 nhóm `B-TS-CPU … B-ANALYTICS` theo catalogue đã phân rã scalar; tuyệt đối + tương đối so B0 |
| Pass | `qualification-readiness.mjs` ⇒ `READY_FOR_MEASUREMENT_REVIEW` (cấu trúc) rồi bound R-C đã duyệt; tool không tự tính PASS năng lực |
| Điều kiện | M-0 (lease root/user, job); D6 duyệt; 14 nhóm có `approval_ref`; Core009 composed; kiểm không cell test nào chạy song song |
| Cleanup / lock | Gỡ stage; session thu hồi; runtime bảo vệ không đổi; khóa/lease theo owner nguồn |

### M-6 — Lease, retention, DR (T10-07) — `NOT_RUN` trên tip

| | |
| --- | --- |
| Kiểu / owner | (a) capped PG: Claude; (b) drill restore trên cell dùng-một-lần: Claude + Core ops; (c) sản xuất: cửa sổ độc quyền, chỉ khi cần đo thời gian trên dữ liệu thật |
| Workload | (a) race/takeover/autocommit/expiry-at-COMMIT/ABA/epoch (tip có `renew(…, notAfterMs)`). (b) backup → restore sang cell mới → quiesce **tất cả** writer/replica → `resetAfterRestore` (scope + epoch kỳ vọng + receipt restore) → xác nhận holder cũ không renew/commit/ACK → tenure mới → grant không được phục hồi → so epoch/generation/floor nguồn → resnapshot nếu dưới floor. (c) lấp đầy 1,024 revision hoặc 8 MiB để xem dừng, không xóa |
| Đo | Binary invariants; RTO = từ bắt đầu restore tới revision hợp lệ đầu tiên đã commit; tăng storage; thời gian takeover |
| Pass | Nhị phân: holder cũ thất bại; A→B→A không hồi sinh A; CAS miss ⇒ dừng/inspect, không ép; dừng ở cap mà không ACK/xóa. RTO/RPO: ghi nhận, chốt sau (proposal D6) |
| Gap | G-4 (runner `resetAfterRestore`); TTL mặc định `null` (proposal §4) |
| Cleanup / lock | Hủy cell restore, giữ receipt; không đụng DB sản xuất; `/tmp/portal-heavy.lock` cho (a)(b) |

### M-7 — Performance G2 (T10-12) — `NOT_RUN`

| | |
| --- | --- |
| Kiểu / owner | `ABSOLUTE_MEASUREMENT`, độc quyền. **Edge** (apparatus P184 gốc); Portal chỉ giữ tải ở mức B1/B2 đã khai báo |
| Workload | Apparatus và quần thể per-feed/venue của P184, không phải SLO Portal mới; optional mainnet canary là quyết định khác và **không thay** G2 |
| Pass | Theo gate gốc: per-feed p95 ≤ 500 ms; trade max < 1,500 ms; quote/mark max < 1,000 ms, đúng quần thể (`source-alignment.md:82-84`). Receipt cũ chỉ reuse với bảng dependency impact (T10-14) |
| Điều kiện / capture / cleanup | Như M-5; receipt riêng, không gộp với B0/B1/B2 |

### M-8 — Nghiên cứu calibration Score P3 (T10-13) — `NOT_RUN` (không phải đo hiệu năng)

| | |
| --- | --- |
| Kiểu / owner | Offline. Research data owner + người duyệt độc lập (proposal D7); Claude: công cụ và loader |
| Workload | Đóng băng quần thể comparable-basis trước khi xem kết quả; `calibration-census.mjs` kiểm custody/hash/ordinal/cửa sổ; fit anchors trên cửa sổ biết trước; báo phân phối điểm, band occupancy, clipped ratio, độ nhảy khi thêm một block (Score spec `:70`, `:382`) |
| Pass | Artifact `portal.execution.manager-score-policy-runtime.v1` + approval độc lập + loader receipt `portal.elp2-10.manager-score-policy-validation.v1` READY, `valid_until` còn hạn |
| Ghi chú | Dữ liệu hiện có (4 run, 14 ngày OOS, hash trùng) không đủ; formula/weights/bands không mở lại |
