# workload-profile.md — ESTIMATE (không load test)

Window đo: 2026-08-20T10:52Z docker stats + baseline phase0-docker-resources.txt (2026-08-05) + data layer health.

## Hiện trạng runtime

| Service | CPU | RAM |
|---|---|---|
| gateway_service | 31.86% | 400.6 MiB |
| live_data_executor | 36.42% | 639.6 MiB |
| data_layer_service | 23.71% | 311.9 MiB |
| còn lại (13 containers) | <6% mỗi cái | <80 MiB mỗi cái |
| Tổng | ~1 vCPU | ~2.1 GiB / 15.33 GiB host |

## Throughput data layer (runtime metric)

- 335,534,436 items / 140,000,250 batches (~4 ngày) ≈ 975 items/s trung bình
- 16 shards Binance connected; queue drop 1,311,777 (backlog đỉnh); 734/1468 feed missing (kline shard), 21 stale
- DNSE: 82 symbols, MARKET_CLOSED ngoài giờ

## Đơn vị nghiệp vụ

- 47 alphas registered, 12-13 paper đang chạy, 2 portfolios, 85 accounts (35 sandbox-binance, 51 paper bindings), 80 copy policies
- Orders/fills per day: ESTIMATE — chưa đo (paper intraday); không có counter public
- Events/s: copy events chưa có traffic; nếu theo tỷ lệ order/fill paper hiện tại, cỡ thấp hơn data layer ~975/s nhiều lần

## Retention

- Hypertables chunk 7d (domain_events, fills, binance_fills, funding_accruals, performance_events, snapshots, broker_sync_*)
- Retention thực tế (SỬA 2026-08-21 — số cũ đọc nhầm *schedule interval* thành *retention window*):
  `performance_snapshots` drop_after **90 ngày**; `account_equity_snapshots` và
  `portfolio_equity_snapshots` drop_after **730 ngày**; compress_after 7 ngày.
  `orders`, `fills`, `domain_events` **không có** retention policy.
  Nguồn: `timescaledb_information.jobs` + `init-db/19-performance-pnl-ops.sql`
- Copy event stream: **đã ngừng có chủ đích** (owner xác nhận 2026-08-21) — không dùng cho Portal
- Portal edge container ESTIMATE: 300-500 MiB RAM, <1 vCPU

## Nút thắt tiềm năng

- broker_sync_raw_hot (raw payload), fills hypertable, domain_events — query nên theo chunk/window
- Kline shard hiện publish_count=0 (734 feed missing) — dấu hiệu config/đăng ký feed, không phải crash