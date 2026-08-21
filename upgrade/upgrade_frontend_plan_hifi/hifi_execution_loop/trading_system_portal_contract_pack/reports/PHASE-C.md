# Phase C — Event/Outbox/Stream Inventory, DB Boundary, Freshness

> Handoff sections: 7.5, 7.8, 7.9 | Status: `CONFIRMED_RUNTIME` / `CONFIRMED_SOURCE` / `OWNER_DECISION_REQUIRED`

## 7.5 Event/outbox/stream inventory

### DB events (canonical, hypertable)
- `domain_events` (hypertable 7-day chunks, `event_ts`): `event_id, event_ts, event_type, schema_version, trace_id, causation_id, correlation_id, producer, message_type, trader_id, strategy_id, account_id, mode, venue, instrument_id, client_order_id, venue_order_id, trade_id, payload, raw, created_at, engine_version, canonical_contract_version, instrument_metadata_version, decision_digest` — `CONFIRMED_RUNTIME` (metadata).
- `event_idempotency` (`scope, idempotency_key, payload_hash, event_id, created_at, expires_at`) — dedupe domain events; `event_id` gắn trace/causation/correlation.

### Copy outbox → Redis Stream (Option C của Portal)
- `copy_event_outbox` (canonical): `copy_event_id, sequence_id, schema_version, event_type, stream_name, alpha_id, strategy_id, account_id, mode, venue, instrument_id, symbol, client_order_id, venue_order_id, source_event_type, source_status, payload, status, publish_attempts, redis_message_id, published_at, next_attempt_at, last_error, created_at, updated_at` — **at-least-once**, dedupe theo `copy_event_id`, thứ tự `sequence_id`.
- Stream target: `copy:events:v1`, maxlen 500k; quá 10 attempts → `copy_event_dead_letters` (DLQ). — `CONFIRMED_SOURCE` (COPY_TRADING_OUTBOX_GUIDE.md).
- **Runtime hiện tại: stream `copy:events:v1` CHƯA tồn tại** (`XINFO STREAM` → `ERR no such key`, `--scan copy*` → rỗng) — chưa có copy event nào được publish kể từ migration (outbox 0 rows lúc import, EXECUTION_LOG). → Pipeline đúng contract nhưng chưa có traffic thực. `PARTIAL` (runtime: chưa có event thật để xác nhận ordering/gap end-to-end).
- Các outbox khác: `execution_command_outbox`, `command_dispatch_outbox` (durable command journal; service `command_journal` thuộc profile `durable-command`, **không chạy** hiện tại — journal vẫn ghi DB qua outbox table).
- Replay: `/v1/admin/replay/*` (order lifecycle, events, compare) — `CONFIRMED_RUNTIME` (paths) + `CONFIRMED_SOURCE` (services/replay/).

## 7.8 Database/schema boundary

- Runtime: PostgreSQL 15.18 + TimescaleDB 2.28.3, DB `live_data_executor`, port 7654 (host). 94 tables, 2 views (`CONFIRMED_RUNTIME`, metadata).
- Ledger: `schema_migration_ledger` 40 rows, max `41-change-only-sync-storage`; init-db 01..41 là nguồn schema duy nhất (`CONFIRMED_RUNTIME`).
- Canonical vs Legacy (DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md, `CONFIRMED_SOURCE`):
  - Canonical: `instruments`, `instrument_aliases`, `orders`, `fills` (hypertable), `positions`, `accounts`, `account_allocations`, `alpha_execution_config`, `copy_policies`, `portfolios`, `domain_events`, `account_equity_snapshots`, `performance_snapshots`, `broker_sync_*`, `command_dispatch_outbox`, `copy_event_outbox`…
  - Legacy/compatibility (runtime vẫn ghi): `alphas`, `alpha_ledger`, `alpha_risk_config`, `funding_rates`, `binance_fills` (hypertable), `alpha_positions`.
- Hypertables + chunk 7d: `domain_events, fills, binance_fills, funding_accruals, performance_events, account_equity_snapshots, performance_snapshots, portfolio_equity_snapshots, broker_sync_raw_hot, broker_sync_valuation_history` (`CONFIRMED_RUNTIME`).
- Compression: **bật** cho `account_equity_snapshots, performance_snapshots, portfolio_equity_snapshots, broker_sync_raw_hot, broker_sync_valuation_history`; `domain_events/fills` chưa compress. Policies: compression 12h + retention 1d (snapshots 3 table); job last run đều `Success` (`CONFIRMED_RUNTIME`).
- **Read-only DB role cho Portal: `OWNER_DECISION_REQUIRED`** — không tự tạo (mutation). Hiện chỉ có API surface cho read; nếu owner muốn Portal đọc DB trực tiếp cần quyết định riêng (role SELECT-only + allowlist views).

## 7.9 Freshness, broker truth và venue policies

- `/v1/health`: `READY`, `stale_or_bad_services: []` — không service nào stale (gateway tự phát hiện qua service heartbeats) (`CONFIRMED_RUNTIME`).
- Broker sync: `broker_sync_state_history`, `broker_sync_valuation_current_state`, `broker_sync_valuation_history`, `broker_sync_raw_hot` (hypertable, 7d) — state + valuation lịch sử (`CONFIRMED_RUNTIME` metadata).
- Venue policies (runtime `/v1/health/capabilities`): BINANCE USD_M `ACTIVE` (ONE_WAY|HEDGE), BINANCE SPOT market-data-only, DNSE VN_EQUITY `ACTIVE` (NET, settlement `IMMEDIATE/VN_T_PLUS`, calendar `VN_MARKET_V1`), DNSE VN_DERIVATIVE paper-only, OKX `DISABLED_PENDING_ACCEPTANCE`.
- Hiện trạng: chỉ sandbox-binance đang connected (testnet, 4 clients, circuit closed); DNSE stream `MARKET_CLOSED` (VN đóng cửa) — live chưa từng connect (`CONFIRMED_RUNTIME`).
- Trading system freshness TTL: stale check qua heartbeat; data layer feed stale > 180s (strict_feed_health=false, có health_warnings).