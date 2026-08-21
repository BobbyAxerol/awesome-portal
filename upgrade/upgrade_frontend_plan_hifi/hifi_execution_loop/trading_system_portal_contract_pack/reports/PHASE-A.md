# Phase A — Runtime Identity, OpenAPI Authority, Capability Discovery

> Handoff sections: 7.1, 7.2, 7.3 | Status: `CONFIRMED_RUNTIME` (đo trực tiếp runtime), `PARTIAL` (1 mục), `UNKNOWN` (1 mục)
> Evidence: `evidence/phaseA/` (gateway_openapi_runtime.json, dl_openapi_runtime.json, gw_health.json, gw_health_summary.json)
> Run time: 2026-08-20 ~10:50 UTC | Agent: Trading System discovery agent (read-only)

## 7.1 Runtime identity và deployment inventory

| Hạng mục | Giá trị đo | Status |
|---|---|---|
| Máy | `ip-172-31-16-126`, AWS EC2 (kernel `6.17.0-1017-aws`), private VPC `172.31.x.x` | `CONFIRMED_RUNTIME` |
| Region/AZ | `UNKNOWN` — IMDS không trả lời; không mở rộng quyền để hỏi | `UNKNOWN` |
| Trading system image | `tradingsystem-image:v1.2.0-9081397` digest `sha256:ab4e36aab9ef254b498edb75de25a3e4c19f50eb6eb23509c6483b0fed9b5a11` | `CONFIRMED_RUNTIME` |
| TS commit | `9081397de9e981c43b4e0f67fabe747e7ed964c7` (detached HEAD); working tree sạch ngoài `M shared/symbols.json` (state runtime có sẵn) | `CONFIRMED_RUNTIME` |
| TS services | 13 containers up 3–4 ngày: `gateway_service` (127.0.0.1:8000), `executor_service`, `risk_engine_service`, `paper_execution_service`, `listener_service`, `market_data_service`, `portfolio_service`, `performance_service`, `reconciliation_service`, `copy_outbox_service`, `order_group_service`, `monitor_service` | `CONFIRMED_RUNTIME` |
| Postgres | `timescale/timescaledb:latest-pg15` digest `6343bdc87ca1...`; **PostgreSQL 15.18 + TimescaleDB 2.28.3**; `127.0.0.1:7654→5432`; healthy 4 ngày | `CONFIRMED_RUNTIME` |
| Redis chính | `redis:7.2-alpine` digest `05a97a479bc7...`; **7.2.15 standalone**; `127.0.0.1:6379` | `CONFIRMED_RUNTIME` |
| Data layer | `data_layer_service` image ID `8f2a5a3f1ff9` — **không còn trong local images**; tag hiện tại `data-layer:v0.1.0` digest `8e45620d6950...` là bản sau → container chạy bản build cũ không tag | `PARTIAL` |
| Redis market data | `redis_marketdata` (redis:7.2-alpine), healthy 4 ngày | `CONFIRMED_RUNTIME` |
| data_layer worktree | nhánh `dev`, behind origin/dev 84 commits; 4 file `generated/*pb2*` modified (có sẵn) → deployed ≠ HEAD của dev | `CONFIRMED_RUNTIME` |
| Alpha runtime images (host) | `execution-alpha-runtime-numba:0.1.1`, `execution-alpha-basis-arb:0.1.0`, `qdl-v2-python/rust:2.0.0-*`, `postgres:16-alpine`, `apache/kafka:<none>` (build artifacts) | `CONFIRMED_RUNTIME` |
| execution_alpha worktree | detached `44ba0fecb76d...`; 2 file state JSON modified (state runtime có sẵn); active alphas tại `alphas/`, root folders = legacy archive | `CONFIRMED_RUNTIME` |

## 7.2 Machine-readable API authority

- **Gateway runtime** `/openapi.json`: OpenAPI **3.1.0**, title "Alpha Gateway V3" v3.0.0, **91 paths**.
- **Semantic identical** với committed `contracts/openapi/trading-system-v1.json` (canonical SHA-256 `5dabf1bb766a737f38cac7e596fdef75101bfb6f0949fffb1761ff1966136a55` khớp; raw hash khác chỉ do thứ tự key JSON). → Không có drift.
- **`/v1/contracts`** (runtime, public): `authoritative_contract_revision=v1`, `shadow=order-command.v2@2.0.0` (`enabled=false`, observed=0, skipped=70); SDK matrix: `legacy-unversioned` + `1.1.0` supported, `headers_required=false`.
- **data_layer runtime** `/openapi.json`: OpenAPI 3.1.0, title "data_layer" v0.1.0, **40 paths** — semantic identical với `contracts/v1/openapi.snapshot.json`.
- Snapshot V2 (`2.0.0-shadow`, 10 paths) **KHÔNG deployed** trên port 8100 → HTTP V2 không tồn tại runtime; V2 chỉ có trên gRPC (qdl, `RUST_SHADOW` fenced).

## 7.3 Capability discovery

- `/v1/health`: `READY`, redis+postgres OK, `stale_or_bad_services: []`.
- Venue products (runtime): BINANCE USD_M (`paper/sandbox/live`, `ACTIVE`, position `ONE_WAY|HEDGE`), BINANCE SPOT (market-data-only), DNSE VN_EQUITY (`paper/live`, `ACTIVE`, `NET`), DNSE VN_DERIVATIVE (`paper` only), **OKX SWAP+FUTURES `DISABLED_PENDING_ACCEPTANCE`** (market data available).
- Adapter đang chạy: `binance_futures` (mode **sandbox** = testnet, 4 clients, circuit closed), `binance_futures_user_stream` (4 sockets). Không có adapter live-thật → kill-switch HALTED hoạt động.
- Data layer runtime: 16 shards Binance connected, 335,534,436 items published (140,000,250 batch), queue drop 1,311,777 (batch backlog), 734/1468 feed missing (kline shard publish_count=0), 21 feed stale, 0 demanded feeds; DNSE stream `MARKET_CLOSED` (VN market đóng cửa, 82 symbols).
- DB boundary: 94 tables, 2 views, `schema_migration_ledger` 40 rows, max version `41-change-only-sync-storage`.

## Ghi chú cho Portal

- Gateway spec authority = committed file; Portal có thể dùng `contracts/openapi/trading-system-v1.json` làm nguồn tin cậy (khớp runtime).
- Data layer hiện đang có backlog drops + feed missing — dấu hiệu capacity P1 (sẽ chi tiết ở 7.10/7.13).