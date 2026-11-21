# ELP2-10 — Yêu cầu cửa sổ đo (Claude -> Edge / Codex), 2026-10-21

**Trạng thái: `READY_TO_SEND / NOT_SENT`.** Bobby đã duyệt D6 (được xin cửa sổ độc quyền cho M-5, M-7) và D5 (quét 1/2/4/8/16 tab). Tài liệu này không tự cấp cửa sổ: cửa sổ do **chủ nguồn (Edge / Core ops)** cấp bằng bản ghi `portal.elp2-10.window-authorization.v1` + sha256 gửi ngoài kênh; script từ chối chạy nếu thiếu/sai/hết hạn (`scripts/measure/lib/window.mjs`, test trong `scripts/measure/measure.test.mjs`). Không secret trong tài liệu này; credential là đường dẫn file 0600 ngoài repo.

Lane khi chạy: `REAL_READ_QUALIFIED` chỉ khi hàng Source Truth Board tương ứng là `EXISTS_MOUNTED` + receipt nguồn thật; còn lại `REAL_READ_RETAINED`. Tất cả số từ fixture/BFF double **không** là calibration (xem receipts `M-1…M-4` cùng thư mục).

## 0. Điều kiện chung (chưa đủ hôm nay)

| # | Điều kiện | Hôm nay |
| --- | --- | --- |
| P1 | Core009 composed (READ + STREAM tách), image đã build + readback | CHƯA: integration prepared, hook/image/readback PENDING (`../CORE009_INTEGRATION_RETURN_2026-10-21.md` §2); image đang chạy `sha256:7b2c7f34…` không phải Core009 |
| P2 | Trust còn hạn (lần quan sát gần nhất hết 15:00:59 20/10 giờ VN) | Phải kiểm lại |
| P3 | M-0 repin chỉ-đọc trong `--repin-max-age-ms` do bên cấp nêu: SHA đầy đủ Edge/PM, image Core, lease root + user, job đang chạy rỗng | Chưa làm (Claude làm ngay trước cửa sổ) |
| P4 | 14 nhóm budget có scalar decomposition + `approval_ref` (Edge/TS/DL) và plan JSON `coexistence-plan.v1` ghim sha | Chưa có |
| P5 | Phiên tạm cho scope Research (file header/storage-state 0600), id-map cho id fixture -> id thật | Bên cấp |
| P6 | Không có cell test/hook nào chạy song song trên host đo | Kiểm trước giờ G |

## 1. M-5 — coexistence B0/B1/B2 (cửa sổ độc quyền) — yêu cầu chính

**Gửi:** Edge (chủ plan EPG10-01, người cấp cửa sổ), cc TS/DL owner, Codex (compose Core009).

> Xin cấp một cửa sổ **độc quyền hữu hạn** để đo coexistence TS/DL/Research theo plan `coexistence-plan.v1` của Edge.
> - **Ai chạy:** Edge/TS/DL chạy B0 và các tầng nguồn + collector 14 nhóm `B-TS-CPU … B-ANALYTICS`; Claude chạy tầng Portal của B1/B2 từ host SGP bằng `scripts/measure/m5-coexistence-window.mjs`; Claude không chạm HK, không SSH ghi.
> - **Thời lượng:** theo plan: 3 stage × 2 lần lặp độc lập × 600 s = 60 phút đo + ổn định giữa stage (đề xuất 5 phút x 6) + biên = **xin 120 phút**; Edge có thể co lại nếu plan nêu `minimum_duration_ms` và thứ tự counterbalanced khác.
> - **Hình dạng tải phía Portal (đề xuất, plan của Edge ghim số cuối), GET-only, mở vòng (open loop), seed 20261021:** B1 = 8 tab Overview, mỗi tab 2 đọc/15 s -> 1,07 req/s (đỉnh 2/s). B2 = B1 + 10 màn dashboard/lịch sử/analytics x 2 tab, mỗi 30 s một lượt (78 đọc/lượt/bộ) -> trung bình 6,27 req/s, đỉnh tính trước 18 req/s. TRADE chuẩn 6.000/9.000 s⁻¹ do plan cố định. Workload: `scripts/measure/workloads/read-sets.v1.json` (digest trong receipt); Edge thay được bằng file khác cùng schema.
> - **Dừng / rollback tự động (Portal):** HTTP 429 bất kỳ; 5xx > 2% (>=20 request trong 30 s); lỗi mạng > 5%; > 64 request treo; SIGINT/SIGTERM; hết cửa sổ trừ 5 s; đỉnh offered > `max_rps` trong bản ghi cấp phép thì **không khởi động**. Tải chỉ-đọc nên không có gì để rollback ở Portal. Edge giữ quyền dừng toàn cửa sổ; thu hồi phiên tạm bằng revoker chính thức + readback zero custody (Core009 runbook G5) là bước của bên cấp; Claude không restart/đổi container nào, 8 runtime được bảo vệ + provider stable không đổi.
> - **Đo gì:** Portal: p50/p95/p99 độ trễ đọc theo endpoint, tỷ lệ lỗi, req/s đạt, byte; bên cấp: 14 nhóm tuyệt đối + tương đối so B0. Receipt stage `coexistence-stage.v1` (fragment) -> bên chủ plan gộp, rồi `qualification-readiness.mjs` kiểm cấu trúc; bound áp theo R-C chỉ sau khi Bobby duyệt catalogue.
> - **Cần từ bên cấp:** bản ghi cấp phép + sha256 (ngoài kênh), plan + sha256, id-map, phiên tạm (đường dẫn file), định dạng xuất đếm source-call/cửa sổ (gap G-2).
> - **Hết cửa sổ:** Claude trả receipt vào `ELP2-10/measurements/`; bên cấp thu hồi phiên và readback.

Lệnh (trong cửa sổ, mỗi stage mỗi lần lặp):
`node scripts/measure/m5-coexistence-window.mjs --authorization A.json --authorization-sha256 sha256:… --repin R.json --repin-max-age-ms N --plan P.json --plan-sha256 sha256:… --repetition-id rep1 --stage B1 --header-file ~/secret/session.hdr [--id-map ids.json] [--metric-map map.json]`

## 2. M-7 — performance G2 / P184 (cửa sổ độc quyền, Edge chạy apparatus)

**Gửi:** Edge.

> Xin một cửa sổ độc quyền riêng cho **G2 (P184 gốc), không gộp với B0/B1/B2 và không thay bằng mainnet canary tùy chọn**.
> - **Ai chạy:** Edge chạy apparatus P184 và quần thể per-feed/venue; Portal chỉ **giữ tải** ở mức B1 (hoặc để rảnh nếu Edge muốn) bằng `m7-g2-window.mjs --hold-load`, rồi nạp kết quả bằng `--ingest`.
> - **Thời lượng / tải:** Edge nêu theo apparatus của P184; phía Portal B1 = 1,07 req/s, đọc-chỉ, cùng điều kiện dừng như mục 1.
> - **Đo gì / pass:** chỉ ngưỡng gốc, đúng quần thể Edge cung cấp: per-feed p95 <= 500 ms; trade max < 1.500 ms; quote/mark max < 1.000 ms. Định dạng đầu vào Portal đề xuất: `portal.elp2-10.g2-population-input.v1` (`scripts/measure/lib/g2.mjs`) — **Edge xác nhận hoặc đưa adapter**.
> - **Dừng / rollback:** như mục 1; teardown apparatus + thu hồi phiên là của Edge.

## 3. M-2c — quét tab 1/2/4/8/16 trên BFF thật (tầng 1 + đếm source-call tầng 3-4)

**Gửi:** Edge (đếm source-call, G-2), Codex (BFF thật). Có thể **chung cửa sổ với M-5, chạy trước M-5** (đếm là capped; chỉ p95 mới cần độc quyền).

> - **Ai chạy:** Claude (Playwright từ host SGP, tối đa 16 tab Chromium, ~2,4 GiB RAM, dừng nếu MemAvailable < 1,5 GiB); Edge xuất số source-call theo cửa sổ thời gian.
> - **Thời lượng:** mỗi ô ~16 phút thời gian thật (mở Overview, rảnh hiển thị 10 phút, đi 19 màn x1, ẩn 5 phút, tải lại) x 5 ô = **80 phút + 20 phút biên = 100 phút**. Ô 2 người dùng (cùng scope / khác scope): thêm 2 ô x 2 = cần hai phiên thật; xin thêm 40 phút nếu có.
> - **Tải:** N tab x 2 đọc/15 s (Overview) + một lượt 19 màn (~70 đọc/tab) — tối đa 16 x 0,133 = 2,1 req/s ở pha rảnh.
> - **Đo / pass:** tầng 1 (browser, đếm), tầng 3 (source-call/cửa sổ, Edge), tầng 4 (TS/PM call quy cho Portal, Edge). Pass nhị phân: tầng 3 với N tab <= ceil(1,25 x tầng 3 với 1 tab) cùng cửa sổ; tab ẩn = 0 request.
> - **Dừng:** nếu Edge thấy source-call tăng theo tab vượt guard thì dừng ô; lỗi/429 phía BFF -> script dừng. Nhật ký `phase_windows_ms` trong receipt cho Edge khớp cửa sổ.

Lệnh: `node scripts/measure/m2-tab-amplification.mjs --window --authorization A.json --authorization-sha256 sha256:… --storage-state ~/secret/state.json [--route-map map.json] --tabs 1,2,4,8,16`

## 4. M-3c — realtime trên stream thật — **CHƯA GỬI (BLOCKED)**

Chặn bởi: (1) OpenAPI chưa công bố operation stream `alpha_fleet_overview` (UXM08-A); (2) Core009 chưa compose; (3) stream tối tới khi cấp grant `stream.subscribe` cho ROOT toàn fleet (quyết định Bobby 2026-10-21 #2). Khi cả ba đóng, xin cửa sổ finite do Edge cấp (~60 phút + 1 giờ ẩn rút gọn bằng fake clock): rớt transport, consumer chậm, gap, bão `resync_required`, epoch rebuild, thu hồi READ-only/STREAM-only/cả hai, restart consumer; pass nhị phân: <= 1 đọc/giây/màn, <= 3 auto-resync/60 s, **0 frame bị hạn chế sau commit thu hồi**, cursor cũ bị từ chối; độ trễ thu hồi chỉ ghi nhận (NO BASIS). Chưa viết driver vì viết trước contract chưa công bố là bịa contract.

## 5. M-4b — mixed query + ingest nối nguồn — **CHƯA GỬI (BLOCKED)**

Chặn bởi: chưa mount writer (worker T10-11 NOT_MOUNTED), chưa có ingest nguồn. Phía đọc dùng được driver của M-5; phía ghi chưa có gì để lái. Xin sau khi writer mount, cửa sổ độc quyền, >= 2 lần lặp, thời lượng không ngắn hơn `minimum_duration_ms` của plan.

## 6. M-6c — đo thời gian restore/lấp cap trên dữ liệu thật — **KHÔNG xin lúc này**

M-6b (drill trên PG dùng-một-lần) đã chạy được. M-6c cần dữ liệu thật và quyết định RPO/RTO/retention của Bobby **sau** M-6b (D6); không bao giờ chạy trên DB sản xuất. Khi cần: Core ops tạo bản sao dùng-một-lần của dữ liệu thật, Claude chạy lại drill + fill 1.024 revision/8 MiB trên bản sao đó.

## 7. Mẫu bản ghi cấp phép (bên cấp điền, tính sha256 file rồi báo ngoài kênh)

```json
{ "schema_version": "portal.elp2-10.window-authorization.v1",
  "window_id": "…", "granted_by": "Edge", "granted_at_ms": 0, "starts_at_ms": 0, "ends_at_ms": 0,
  "measurements": ["M-5"], "lane": "REAL_READ_QUALIFIED", "run_kind": "ABSOLUTE_MEASUREMENT",
  "base_url": "https://… (chỉ origin)", "max_rps": 25, "max_tabs": 16, "max_duration_ms": 7200000,
  "stop_rollback": "…", "repin": {}, "notes": "…" }
```
