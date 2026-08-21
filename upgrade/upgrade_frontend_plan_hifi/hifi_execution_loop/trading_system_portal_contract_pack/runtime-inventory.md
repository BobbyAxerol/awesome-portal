# runtime-inventory.md — Trading System runtime (sanitized)

> ⚠ **Đã drift — xem [`evidence/phaseF/runtime_identity.txt`](evidence/phaseF/runtime_identity.txt) (2026-08-21T07:34Z).**
> `gateway_service` giờ là `tradingsystem-image:sha-8b88daa61e3` (`sha256:4f63dc9949f8…`),
> **không** build từ git HEAD đang checkout. `command_journal_service` và
> `market_data_service` là `sha-8c9a96cc8eb`. `command_journal_service` **đang chạy**
> (bảng dưới ghi là inactive — sai). `/openapi.json` byte-identical nên route không đổi.
> **Pin theo image digest, không theo git SHA.**

Captured: 2026-08-20T10:50Z (UTC) | Host: ip-172-31-16-126 (AWS EC2, private VPC 172.31.x.x) | Region/AZ: UNKNOWN

## Services (docker compose, up 3-4 ngày)

| Service | Image | Port | Ghi chú |
|---|---|---|---|
| gateway_service | tradingsystem-image:v1.2.0-9081397 | 127.0.0.1:8000 | Alpha Gateway V3 (OpenAPI 3.1.0, 91 paths) |
| executor_service | same | internal | submit/retry/dead-letter |
| risk_engine_service | same | internal | preflight + authority claims |
| paper_execution_service | same | internal | paper matcher (internal) |
| listener_service | same | internal | fills/positions từ stream |
| market_data_service | same | internal | market data bridge |
| portfolio_service | same | internal | positions/sync |
| performance_service | same | internal | snapshots |
| reconciliation_service | same | internal | reconcile positions/orders/uncertain |
| copy_outbox_service | same | internal | copy events → copy:events:v1 |
| order_group_service | same | internal | order groups/brackets |
| monitor_service | same | internal | dead letters/findings/alerts |
| live_data_executor | timescale/timescaledb:latest-pg15 | 127.0.0.1:7654→5432 | PostgreSQL 15.18 + TimescaleDB 2.28.3 |
| redis_service | redis:7.2-alpine | 127.0.0.1:6379 | 7.2.15 standalone |
| data_layer_service | image 8f2a5a3f1ff9 (untagged) | 127.0.0.1:8100 | data_layer V1 HTTP (40 paths) |
| redis_marketdata | redis:7.2-alpine | internal 6379 | market data plane |

Inactive (profile chưa bật): loki/promtail/grafana (observability).
command_journal: **ĐANG CHẠY** từ 2026-08-21, nhưng `COMMAND_JOURNAL_ROLLOUT=OFF`,
`ACK_REQUIRED=false`, và 430/430 dòng `command_journal` ở state `DEAD`.

## Images (digests)

- tradingsystem-image:v1.2.0-9081397: sha256:ab4e36aab9ef254b498edb75de25a3e4c19f50eb6eb23509c6483b0fed9b5a11
- timescale/timescaledb:latest-pg15: sha256:6343bdc87ca132c6b53acb26113a6bad1821d188fa39975a745f32ddd9757634
- redis:7.2-alpine: sha256:05a97a479bc73de66f087dc05b569010772880f778cc8671fa6b8aadee32e5c6
- data-layer:v0.1.0 (tag hiện có): sha256:8e45620d69509b046ef799f4a461435e5853aa68add450fd2eaadb68be07a1a5 — KHÁC container đang chạy (8f2a5a3f1ff9)

## Git identity

- trading_system: 9081397de9e981c43b4e0f67fabe747e7ed964c7 (detached; M shared/symbols.json state runtime)
- data_layer: 5049c296276f922530769e2a9092ebb6c04c5ea6 (dev, behind 84; 4 generated pb2 modified)
- execution_alpha: 44ba0fecb76dd33a32feb5611e5a37dc6532d449 (detached; 2 state JSON modified)

## Runtime facts

- /v1/health: READY, stale_or_bad_services=[]
- Adapter: binance_futures sandbox (testnet, 4 clients, circuit closed), user_stream 4 sockets
- Venue rollout: BINANCE USD_M ACTIVE; SPOT market-data-only; DNSE VN_EQUITY ACTIVE, VN_DERIVATIVE paper-only; OKX DISABLED_PENDING_ACCEPTANCE
- DB: 94 tables, 2 views, schema_migration_ledger 40 rows max 41-change-only-sync-storage
- Compression policies: 6 hypertables compress (snapshots 7d + broker_sync), jobs Success
- Redis: copy:events:v1 CHƯA tồn tại (chưa có copy traffic); order.uncertain stream per design