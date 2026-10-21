# BE-P19 — M-1…M-7 chạy được (Claude, 2026-10-21)

Base `799effc8` (`claude/fe-parity`). Tier R0/R1: chỉ thêm harness (`scripts/measure/`, 2 config + 3 file e2e FE, 1 spec control-api bị skip mặc định), **không đổi code sản xuất**. Receipt: `../ELP2-10/measurements/<M-n>-2026-10-21.json` (schema `portal.elp2-10.measurement-receipt.v1`: lane, git sha, máy, thời điểm, p50/p95/p99, đếm, tài nguyên, stop, cleanup). Yêu cầu cửa sổ: `../ELP2-10/measurements/WINDOW_REQUESTS_2026-10-21.md`.
`git.sha` trong receipt = base `799effc8` (harness chưa commit lúc chạy). Host dùng chung tải cao (loadavg 9–15 trên 8 CPU, có hook/Playwright của agent khác): **mọi thời gian/CPU là nhiễu, đếm và byte thì không**. Mọi receipt đã chạy: `calibration_evidence:false`, `approved_budget:false`. Số fixture không là budget, không là calibration.

## Bảng trạng thái

| M-n | Trạng thái | Số chính (lane) | Giới hạn |
| --- | --- | --- | --- |
| M-1a | RUN_FIXTURE | 32 route x small/medium/large, cold load: API 11 (p50) / 16 (max) request, 86–92 asset ~3,1 MB giải mã; heap sau GC p50 6,8 MB (small) -> 7,1 MB (large); DOM p50 1.006, max 2.852 (small) -> 3.418 (large); main-thread p50 1,0 s -> 1,34 s, max 5,3 s (large); route-ready p50 1,0 s -> 1,7 s, max 5,9 s (large); 0 request ra ngoài origin (BFF_DOUBLE) | Double trả tối đa 1.500 order/400 operation, không phải 10³–10⁵ dòng: **chưa định vị điểm vỡ virtualization**; thời gian trên host tải |
| M-1 guard | RUN_FIXTURE | Chế độ đo trên 1 và 2 worker: **đếm lệch 1 hàng**: `workbench` 12 vs 11 request, 87 vs 86 asset => falsifier của R-A cho route này (chuyển R-C, tăng lặp). Idle: Overview 8 request/60 s, các route khác 0; ẩn 0; quay lại 0. Chế độ guard: 105 pass, **1 đỏ lặp lại 2/2: `access · canary`** (root `canary-v2` không hiện trong 45 s, cả khi chạy riêng) | `workbench` 12 vs 11 (DEBT-044, đóng ở e299c3df): request thứ 12 là `GET /governance/stage-action-eligibility`, nút exit bắt đầu đọc khi mount (sau khi profile về và body render), `networkidle` của Playwright trả về ngay nếu trang từng rảnh nên worker chậm đếm nó vào cửa sổ tab (3033 B); nay root có `data-state` và meter có `quiet()`, đếm 12 ở cả 1 và 2 worker, test ghim bộ request. `access · canary` (DEBT-045, **UNREPRODUCED / CAUSE_UNKNOWN**): bundle trong receipt dựng lại từ d832a88e giống từng byte và đạt khi chạy riêng (và ở các scope ghi trong debt-register); đạt không chứng minh bundle sản phẩm, double hay route không liên quan khi tải như lần M-1, nên **không** kết luận "không phải lỗi sản phẩm"; chưa tái hiện được lần đỏ, config giữ trace khi lỗi để lần đỏ sau có nguyên nhân; 2 timeout hiển thị còn lại là flake do tải, chạy lại đạt |
| M-1b | RUN_FIXTURE (cold) | Bundle thật qua gzip như `deploy/nginx/portal.conf`: p50 1.008.721 B, max 1.076.093 B (0,33 so với giải mã); API gzip ước tính p50 18,7 KB | **Ấm: NOT_MEASURED** (`page.route` tắt HTTP cache, lần ấm tải lại đủ); brotli: nginx chỉ bật gzip |
| M-1c | BLOCKED | — | Chưa có BFF thật (Core009 chưa cài) |
| M-2 (tầng 1-2) | RUN_FIXTURE | 1/2/4/8/16 tab: rảnh 600 s = 80 đọc/tab (0,133 req/s/tab), tổng 80/160/320/640/1.280, fit tuyến tính slope 80, R²=1; 19 màn x1 = 70 đọc/tab; ẩn = 0 ở mọi ô; tải lại 13 (BFF_DOUBLE) | Tầng 2 = tầng 1 theo cấu trúc; **tầng 3-4 không đo được trong fixture**; ô 2 người dùng chưa chạy (cần phiên + scope thật). Lỗi tìm và sửa trong harness: `page.clock` là clock của context, N tab nhân thời gian N lần |
| M-2c | READY_NEEDS_WINDOW | script `m2-tab-amplification.mjs --window` | Cần Core009, cửa sổ, bộ đếm source-call của Edge (G-2) |
| M-3 | RUN_FIXTURE | 3 lần lặp x 3.497 test (FE + server) đều xanh; 7 tiêu chí nhị phân đều có test khớp và đạt (<=1 đọc/giây/màn, resync có hạn, không reconnect vô hạn, tab ẩn 0, 0 frame sau thu hồi, cursor cũ bị từ chối, tài nguyên có hạn); không test bất ổn | Mức component, port giả + fake timer; khớp tiêu chí theo tên test (thô) |
| M-3c | BLOCKED | — | Chưa có operation stream trong OpenAPI, Core009 chưa compose, stream tối tới khi có grant (Bobby #2) |
| M-4a | RUN_FIXTURE | PG dùng-một-lần, 2 lần lặp trên PG mới: 398 test pass/lần; 20 -> 1 SELECT, digest như nhau; p95 20 reader: coalesced p50 ~1,0 s vs không gộp ~2,6 s; Index Scan, 0,04–0,05 ms; relation 122.880 B; payload 1.197.252 B; node ~121–125% CPU, RSS lấy mẫu <= 0,68 GB | Chênh p95 giữa 2 lần lặp 43% / 75% (>25% => R-C đòi thêm lần lặp); cell 3 CPU/3 GiB (node 2/2 + PG 1/1) khác manifest 4/4 nên **không so với `measurements.md` run1**; 20 reader trong 1 process, không phải 20 người dùng HTTP; không đo WAL, IO, chờ pool (ms) |
| M-4b | BLOCKED | — | Chưa mount writer (T10-11) |
| M-5 | READY_NEEDS_WINDOW | `m5-coexistence-window.mjs` + driver mở-vòng; selftest trên fixture BFF (FIXTURE_LAB): B1 32 request p95 8 ms, B2 148 request p95 23 ms, 20 x 404 (fixture không phục vụ route đó) — chứng minh driver, không đo Portal | Cần cửa sổ độc quyền, plan Edge, 14 nhóm có `approval_ref`, Core009, phiên thật, id-map |
| M-6a | RUN_FIXTURE | 8 test T10-07 (autocommit, bầu holder, ABA, takeover không ACK, hết hạn tại COMMIT, CAS epoch sau restore, scope) pass 2/2 lần | Nhị phân; không có số RTO |
| M-6b | RUN_FIXTURE | Drill backup -> restore sang DB mới -> reset epoch -> holder cũ bị chặn (renew/release/commit) -> tenure mới commit -> lịch sử và chữ ký bảng khớp, 2/2 lần; dump ~0,2 s, restore ~0,3 s, "RTO" 3,4–4,7 s (chủ yếu là khởi động container verify) | ~12 KB TEST_ONLY, **không là RTO**; RPO/RTO do Bobby chốt sau M-6 (D6); grant, nguồn epoch/floor, replica chưa phủ |
| M-6c | BLOCKED | — | Cần dữ liệu thật + quyết định RPO/RTO; không bao giờ chạy trên DB sản xuất |
| M-7 | READY_NEEDS_WINDOW | `m7-g2-window.mjs`: `--hold-load` và `--ingest` (chỉ ngưỡng gốc P184: p95 <= 500 ms; trade max < 1.500; quote/mark max < 1.000); test đơn vị đạt | Edge chạy apparatus; định dạng đầu vào Portal đề xuất, Edge xác nhận |

## Sửa sau review của Codex (2026-10-21)

- Receipt M-1 `../ELP2-10/measurements/M-1-2026-10-21.json` đã khôi phục **đúng byte gốc** (commit thường, lịch sử còn nguyên): file sha256 `af161572e140fe8b172acc198978dcb49016118677e41c23504a31bead8aa2e3`, digest nhúng `sha256:147aa6b42ee842bec925f937684f67ccf89d942fa69d70225295f812499d509b`. Phần diễn giải mới (ghi chú DEBT-044/045) nằm ở file riêng, có hash riêng.
- Index: `../ELP2-10/measurements/M-1-2026-10-21.ADDENDUM.md` sha256 `2e6509614a34ad5de32c6d33648515b2c30dfba1f73faa5102402229707be258`.
- Quiet-gate của meter nay ném `MEASUREMENT_QUIET_TIMEOUT` (mẫu không hợp lệ, không bao giờ là PASS) khi hết 15 s mà chưa yên: `apps/portal/frontend/e2e/quietGate.mjs`, kiểm bằng `node --test scripts/measure/measure.test.mjs` (đồng hồ giả) và `e2e/_probe-measure-quiet-timeout.spec.ts` (Workbench, `QUIET_CHECK=1`). Không chạy lại M-1; các số cũ là số fixture, không phải calibration.
- Locator: các fix được dẫn ở `e299c3df` (DEBT-044) và `89536bda` (DEBT-031), là commit tới được từ lane post-freeze (không dùng các SHA đã bị viết lại trước đó).

## Cửa sổ cần xin (chi tiết trong WINDOW_REQUESTS)

1. **M-5** (độc quyền, Edge cấp, ~120 phút) — chính. 2. **M-7** (độc quyền riêng, Edge). 3. **M-2c** (chung cửa sổ với M-5, ~100 phút, Edge đếm source-call). M-3c, M-4b, M-6c: chưa xin (chặn bởi điều kiện ở trên). Điều kiện chung: Core009 composed, trust còn hạn, repin M-0, plan + catalogue 14 nhóm đã duyệt.

## Thay đổi trong budget proposal

Chỉ **B-6** (transfer gzip cold của bundle thật) được thay `NO BASIS` bằng số đo; B-10/B-11/B-12 giữ `NO BASIS` (chỉ thêm con trỏ tới receipt fixture). Không số nào thành budget được duyệt (§9 của proposal).

## Chạy lại

`node scripts/measure/m1-browser-cost.mjs` · `m2-tab-amplification.mjs` · `m3-realtime.mjs` (host, không khóa) · `m4-m6-pg.mjs` · `m6-restore-drill.mjs` (Docker, tự lấy `flock /tmp/portal-heavy.lock`, chỉ tạo/gỡ container `elp210m-*`) · `status-receipts.mjs` · `node --test scripts/measure/measure.test.mjs`. Dữ liệu thô (log, JSONL, vitest JSON) ở `~/.local/state/portal-execution-elp210/20261021/` (không commit; sha256 trong receipt).
