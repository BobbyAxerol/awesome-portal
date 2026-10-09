# HOTFIX / OPS — Postgres: bảng cache Execution phình 81 GB khi rỗng (2026-10-09)

Người đọc: Bobby (quyết), Codex (backend, sở hữu code cache Execution), Claude (làm phần không đụng backend).
Trạng thái: **đã thu hồi 81 GB (Claude, theo lệnh của Bobby)**; **phương án dài hạn bên dưới là đề xuất, chưa triển khai**.

## 1. Đã làm

Stack: Execution probe — container `portal-probe-pg` (Postgres 16.15, DB `portal_control`). Bảng `public.execution_shared_read_cache`: **0 dòng**, TOAST 81 GB, DB 85 GB.

Trước khi làm, kiểm tra an toàn (đều chỉ đọc): không có khóa ngoại trỏ tới bảng, không có view/matview phụ thuộc, 0 dòng, không có khóa đang giữ, không có ghi nào từ 2026-09-12 (`n_ins_since_vacuum = 0`). Bảng là cache "recomputable" theo chính migration (`COMMENT ON TABLE … bounded anti-stampede cache`).

Thực hiện (một giao dịch, `lock_timeout = 5s`): `TRUNCATE TABLE public.execution_shared_read_cache;`

| | Trước | Sau |
|---|---|---|
| bảng cache (tổng) | 81 GB | 24 kB |
| DB `portal_control` (probe) | 85 GB | 3,7 GB |
| volume ẩn danh `26e80177…` | 91,8 GB | 4,7 GB |
| ổ `/` còn trống | 90 GB | 171 GB |

Các dịch vụ probe vẫn `healthy` sau thao tác. Không dữ liệu nghiệp vụ nào bị mất (bảng đã rỗng). Không đụng bảng `execution_shared_read_flights` (11 dòng), các bảng mirror/timeseries, hay stack dev/stable/research.

## 2. Vì sao nó xảy ra (đọc từ cấu hình và code thật)

**Bằng chứng**
- TOAST: 46.500.230 chunk đã ghi và đúng bằng ấy đã xóa; bảng chính 540.118 insert, **428.291 update**, 540.118 delete. `n_ins_since_vacuum = 0`: không ghi gì từ 2026-09-12 09:47.
- Autovacuum **đã chạy** (18 lần trên TOAST, nhiều lần trong ngày 12/9, mỗi lần > 10 phút). Vậy lỗi **không phải** autovacuum không chạy (giả thuyết ban đầu của tôi sai một phần). `VACUUM` thường chỉ đánh dấu chỗ trống tái dùng được, **không thu nhỏ file**; file chỉ co khi các trang cuối đều trống.
- Cấu hình Postgres là **toàn bộ mặc định**: `autovacuum_vacuum_scale_factor 0.2`, `maintenance_work_mem 64 MB`, `shared_buffers 128 MB`, `max_wal_size 1 GB`, `default_toast_compression pglz`, `idle_in_transaction_session_timeout 0`, `statement_timeout 0`, `log_autovacuum_min_duration 10 phút`, không `reloptions` trên bảng.

**Nguyên nhân gốc (4 tầng)**
1. **Thiết kế cache churn TOAST.** `EXECUTION_EDGE_CURRENT_SOURCE_CACHE_TTL_MS` mặc định **750 ms**; mỗi lần làm mới là `INSERT … ON CONFLICT (cache_key) DO UPDATE SET response_body = EXCLUDED.response_body` (`shared-read.repository.ts:285-297`), tức ghi lại toàn bộ JSONB tới 2 MiB (`…MAX_RESPONSE_BYTES = 2097152`; ràng buộc bảng cho tới 4 MiB). Bản cũ thành rác TOAST. Với 15 request/giây/nguồn, trần lý thuyết là hàng chục MiB/giây.
2. **Hạn mức logic không được thực thi khi ghi.** `EXECUTION_SHARED_READ_CACHE_MAXIMUM_BYTES = 256 MiB` và `MAXIMUM_ROWS = 20.000` chỉ dùng để tính `capacityState` báo cáo (`:457-461`), không chặn `complete()`. Trần theo thiết kế: 4 MiB × 20.000 dòng = **80 GB**, đúng bậc độ lớn đã thấy.
3. **Cấu hình Postgres chưa từng được chỉnh** (`compose.yaml` service `portal-postgres` không có `command:`, không mount config, không giới hạn tài nguyên); mọi stack (dev, stable, probe, research) dùng chung kiểu này.
4. **Vận hành không nhìn thấy.** DB của probe là container dựng tay `portal-probe-pg` (tạo 2026-09-05, **volume ẩn danh**, `restart: no`, không giới hạn bộ nhớ, **không có trong repo**); Postgres do compose của probe dựng (12 MB) không được dùng. Không có cảnh báo kích thước DB hay bảng.

**Không biết (nói rõ):** vì sao có đợt ghi dồn tới 12/9 rồi dừng hẳn (tải thử? probe chạy lại một đợt?). Cần Codex/Bobby trả lời nếu muốn biết cái gì sinh ra 93 GB ghi.

**Cùng kiểu, quy mô nhỏ hơn, ở stack khác (đo bằng `scripts/postgres-bloat-report.sh`, chưa động vào):** stable `execution_shared_read_cache` 829 MB (TOAST 755 MB, 0 dòng sống); dev 849 MB (TOAST 780 MB, 0 dòng sống). Dev còn có `execution_timeseries_history` 27.579 dòng chết, vacuum lần cuối 03/9. Tức là "cache rỗng nhưng giữ ~0,8 GB" là trạng thái bình thường của thiết kế hiện tại, và 81 GB là lúc nó lên đỉnh.

## 3. Phương án dài hạn (đề xuất)

Mục tiêu: **kích thước vật lý của cache bị chặn trên một cách chứng minh được**, mà không phụ thuộc vào việc ai nhớ dọn.

### L1 — Cấu hình Postgres, một nơi, mọi stack (Claude làm được, cần Bobby duyệt giá trị)
Tạo `deploy/postgres/portal.conf` và mount vào mọi service Postgres (`command: ["postgres","-c","config_file=…"]` hoặc `conf.d`). Giá trị khởi điểm (cho host 8 core / 32 GB; **chưa kiểm chứng, phải qua soak test ở mục 4**):

| Tham số | Mặc định hiện tại | Đề xuất | Lý do |
|---|---|---|---|
| `autovacuum_vacuum_scale_factor` / `…analyze_scale_factor` | 0,2 / 0,1 | 0,05 / 0,02 | bảng lớn không chờ 20% mới dọn |
| `autovacuum_vacuum_cost_limit` | 200 | 1000 | vacuum bảng nhiều GB kịp thay vì chạy cả giờ |
| `maintenance_work_mem` | 64 MB | 256 MB | ít lượt quét index hơn |
| `log_autovacuum_min_duration` | 10 phút | 1 phút | thấy được vacuum chậm |
| `idle_in_transaction_session_timeout` | 0 | 60 s | giao dịch treo giữ cửa sổ dọn rác |
| `statement_timeout` | 0 | đặt theo role (app 30 s; migrator 0) | chặn câu lệnh chạy lạc |
| `shared_buffers` / `effective_cache_size` | 128 MB / ~5 GB (đo trên probe) | 1 GB / 3 GB (nếu giới hạn container 4 GB) | `effective_cache_size` hiện lớn hơn cả bộ nhớ ta định giới hạn; `shared_buffers` ở mặc định |
| `max_wal_size` / `checkpoint_timeout` | 1 GB / 5 phút | 4 GB / 15 phút | log đã có cảnh báo checkpoint dày |
| `wal_compression` | off | on | ghi JSONB lớn tốn WAL |
| `default_toast_compression` | pglz | **lz4** (đã kiểm: image hỗ trợ) | nhanh hơn, thường nhỏ hơn cho JSON |
| `track_io_timing`, `shared_preload_libraries=pg_stat_statements` | off | on (extension có sẵn trong image) | nhìn được câu lệnh nặng |

Riêng bảng cache: `ALTER TABLE execution_shared_read_cache SET (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 5000, toast.autovacuum_vacuum_scale_factor = 0, toast.autovacuum_vacuum_threshold = 5000, toast.autovacuum_vacuum_cost_limit = 2000);` — ngưỡng tuyệt đối, không tỷ lệ với số dòng ước lượng cũ.
Thêm giới hạn tài nguyên trong compose (`mem_limit`, `pids_limit`) cho Postgres và healthcheck đo kích thước.

### L2 — Ứng dụng (Codex sở hữu; Claude viết yêu cầu và test nghiệm thu)
1. **Không ghi lại thân khi không đổi.** Trong `complete()`: `response_body = CASE WHEN execution_shared_read_cache.etag = EXCLUDED.etag THEN execution_shared_read_cache.response_body ELSE EXCLUDED.response_body END` (và tương tự cho `response_bytes`), để làm mới chỉ cập nhật `stored_at`/`expires_at`. Cần test chứng minh: làm mới 1.000 lần cùng nội dung không tăng `n_tup_ins` của TOAST.
2. **Thực thi hạn mức khi ghi**, không chỉ báo cáo: trước khi chèn, nếu `sum(response_bytes)` hoặc số dòng vượt `MAXIMUM_*` thì xóa các dòng hết hạn/cũ nhất trong cùng giao dịch hoặc từ chối ghi (cache là tối ưu, không phải nguồn sự thật). Hạ trần theo thiết kế: `MAXIMUM_BYTES` × (hệ số phình đã đo) phải nhỏ hơn ngân sách đĩa đã chọn.
3. **Quyết định lưu ở đâu.** Cache với TTL 0,75 s không nên nằm trong heap Postgres bền vững. Hai lựa chọn: (a) `UNLOGGED` table + (1)(2) trên (bỏ WAL, vẫn còn churn TOAST); (b) chuyển thân phản hồi sang **NATS JetStream KV** (stack đã có `portal-nats`, hỗ trợ TTL và `max_bytes` có sẵn) và chỉ giữ metadata ở Postgres hoặc bỏ hẳn bảng. (b) loại bỏ gốc vấn đề; chi phí là thay đổi code và test đồng thời nhiều replica.
4. **Sweeper thêm bảo vệ kích thước vật lý.** Ngoài xóa theo hạn, nếu `pg_total_relation_size` > ngưỡng (ví dụ 4× `MAXIMUM_BYTES`) và số dòng sống thấp: `TRUNCATE` dưới `lock_timeout` ngắn (cache tính lại được), ghi log + metric. Tắt mặc định, bật bằng cờ.

### L3 — Vận hành (Claude làm được)
1. `scripts/postgres-bloat-report.sh` (đã có, chỉ đọc; `--fail-over-gb N` trả mã 1) — gắn vào `preview.sh status` và checklist trước/sau mỗi lần dựng stack.
2. **Đưa `portal-probe-pg` vào compose**: volume có tên, `restart: unless-stopped`, healthcheck, cùng file cấu hình L1; bỏ Postgres thừa của compose probe hoặc dùng nó. Không còn volume ẩn danh (công cụ kiểm kê và `docker volume prune` không nhìn thấy chúng đúng).
3. Cảnh báo ngưỡng: bảng > 2 GB hoặc DB probe > 20 GB hoặc đĩa trống < 100 GB.
4. Ghi vào runbook: `VACUUM` không trả đĩa; muốn trả đĩa phải `TRUNCATE`/`VACUUM FULL`/`pg_repack` (không có sẵn trong image).

## 4. Nghiệm thu (đo được)

- Soak test ≥ 24 giờ với 15 request/giây trên một nguồn (`EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND`): `pg_total_relation_size('execution_shared_read_cache')` không vượt **4× `MAXIMUM_BYTES`** (≈ 1 GB) ở bất kỳ thời điểm nào; báo cáo bloat không có bảng nào "file lớn / dòng sống nhỏ" vượt ngưỡng.
- Test đơn vị/tích hợp cho (1) không ghi lại thân khi etag không đổi và (2) thực thi hạn mức khi ghi.
- Sau khi áp L1, `show all` của từng stack trùng file cấu hình trong repo.

## 5. Cần quyết

1. Duyệt giá trị L1 (đặc biệt `shared_buffers` và giới hạn bộ nhớ container).
2. L2.3: giữ Postgres (UNLOGGED + chặn ghi) hay chuyển sang NATS KV.
3. Có thu hồi luôn ~0,8 GB TOAST ở **dev** và **stable** không (dễ, rủi ro thấp, nhưng là stack khác; tôi chưa làm).
4. Ai trả lời "cái gì đã ghi dồn tới 12/9".

## 6. Việc đã làm trong tài liệu này
`scripts/postgres-bloat-report.sh` (mới); thu hồi 81 GB ở probe. Không đổi code ứng dụng, cấu hình compose, hay stack khác.

## Outcome (2026-10-09, Claude — implemented, replaces the proposals above where they differ)

| Layer | Delivered | Evidence |
|---|---|---|
| L1 config | `deploy/postgres/portal.conf` mounted read-only by `compose.yaml` and `deploy/compose.production.yaml` (`command: config_file=…`, `mem_limit 4g`, `shm_size 256m`) | `docker compose config` valid; config validated in an ephemeral container |
| L2 write path | `complete()` keeps the stored body when the etag is equal (`CASE WHEN cache.etag = EXCLUDED.etag`) — zero new TOAST chunks for an unchanged refresh | test compares the TOAST chunk id across refreshes; reverting the CASE makes it fail |
| L2 storage | migration `1723680000129`: `SET UNLOGGED` + table/TOAST autovacuum by absolute threshold (5000 dead, scale 0, cost 2000); Down resets and `SET LOGGED` | applied on a fresh DB: `relpersistence=u`, options on table and TOAST; Down verified. A first version without the `-- Up Migration` marker was recorded as applied but did nothing — marker added |
| L2 guard | `EXECUTION_SHARED_READ_CACHE_PHYSICAL_LIMIT_BYTES` (default 1 GiB, 0 off); the sweeper, after draining, TRUNCATEs only when the file is over the limit and no live entry exists (1 s lock timeout); reported as `physicalReclaim` | 2 new real-PG tests; N21 static gate green |
| L3 | `scripts/postgres-bloat-report.sh`; `preview.sh status` runs it with `--fail-over-gb 5` | ran on every Postgres container |
| Reclaim | stable −829 MB, dev −849 MB (rows 0, live-entry check inside the lock) → 24 kB each; probe −81 GB earlier | before/after sizes |

Soak (55 writes/s, 2 MiB bodies): defaults grow linearly; unlogged + autovacuum options + tuned config plateau ~420 MB; CASE reuse writes no new chunks for unchanged content. Decision change: **Postgres is kept** (no NATS KV), and the logical cap at write was **not** added — the physical guard is what actually prevents disk growth.

Not done (needs Bobby): applying `ALTER SYSTEM` / the table DDL directly to the running dev, stable and probe databases was blocked by the permission classifier, so those DBs still run default config until their next deploy (migration 129 + compose mount) or until Bobby allows the commands in `scratchpad/live-config.sql` / `live-table.sql`. Moving `portal-probe-pg` into a compose project was not started.
