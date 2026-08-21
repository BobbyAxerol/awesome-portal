# Serialization contract — PostgreSQL → JSON → Rust

> **`numeric` arrives as a JSON string.** `_jsonable()` calls `str()` on every
> `Decimal` before encoding. Declaring `f64` in Rust will fail to deserialize.

## Type map

| PostgreSQL | JSON wire | Rust | Why |
|---|---|---|---|
| `numeric` | `string` | `rust_decimal::Decimal (serde with str)` | Decimal -> str by _jsonable; NEVER f64 (precision + type error) |
| `double precision` | `number` | `f64` | float passes through untouched |
| `real` | `number` | `f32` | float passes through untouched |
| `integer` | `number` | `i32` | int passes through |
| `bigint` | `number` | `i64` | int passes through |
| `smallint` | `number` | `i16` | int passes through |
| `boolean` | `bool` | `bool` | passes through |
| `text` | `string` | `String` | passes through |
| `character varying` | `string` | `String` | passes through |
| `uuid` | `string` | `uuid::Uuid or String` | str() in event_store only; other repos leak a UUID object |
| `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` | isoformat() -> RFC3339-ish; offset present |
| `timestamp without time zone` | `string` | `chrono::NaiveDateTime` | isoformat() -> NO offset; do not assume UTC |
| `date` | `string` | `chrono::NaiveDate` | isoformat() |
| `time without time zone` | `string` | `chrono::NaiveTime` | isoformat() |
| `interval` | `string` | `String` | isoformat() not defined; verify |
| `jsonb` | `object|array|scalar` | `serde_json::Value` | already decoded; some repos json.loads() raw* columns again |
| `json` | `object|array|scalar` | `serde_json::Value` | as above |
| `ARRAY` | `array` | `Vec<T>` | recursed element-wise |
| `bytea` | `string` | `String` | not observed in Portal-relevant tables |

## Fields affected (63 numeric columns)

`account_balances.free`, `account_balances.locked`, `account_balances.total`, `account_equity_snapshots.cash_free`, `account_equity_snapshots.cash_locked`, `account_equity_snapshots.cash_total`, `account_equity_snapshots.drawdown`, `account_equity_snapshots.equity`, `account_equity_snapshots.fee_total`, `account_equity_snapshots.funding_pnl`, `account_equity_snapshots.gross_pnl`, `account_equity_snapshots.margin_initial`, `account_equity_snapshots.margin_maintenance`, `account_equity_snapshots.net_pnl`, `account_equity_snapshots.realized_pnl`, `account_equity_snapshots.total_notional`, `account_equity_snapshots.unrealized_pnl`, `fills.commission`, `fills.price`, `fills.quantity`, `fills.realized_pnl`, `orders.price`, `orders.quantity`, `orders.trigger_price`, `portfolio_equity_snapshots.allocated_capital`, `portfolio_equity_snapshots.cash_free`, `portfolio_equity_snapshots.cash_locked`, `portfolio_equity_snapshots.cash_total`, `portfolio_equity_snapshots.drawdown`, `portfolio_equity_snapshots.equity`, `portfolio_equity_snapshots.fee_total`, `portfolio_equity_snapshots.funding_pnl`, `portfolio_equity_snapshots.gross_pnl`, `portfolio_equity_snapshots.margin_initial`, `portfolio_equity_snapshots.margin_maintenance`, `portfolio_equity_snapshots.net_pnl`, `portfolio_equity_snapshots.realized_pnl`, `portfolio_equity_snapshots.total_notional`, `portfolio_equity_snapshots.unrealized_pnl`, `positions_v2.avg_px_close`, `positions_v2.avg_px_open`, `positions_v2.mark_price`, `positions_v2.peak_qty`, `positions_v2.quantity`, `positions_v2.realized_pnl`, `positions_v2.signed_qty`, `positions_v2.unrealized_pnl`, `sizing_decisions.alloc_per_trade`, `sizing_decisions.effective_notional`, `sizing_decisions.entry_price`, `sizing_decisions.equity`, `sizing_decisions.gross_notional`, `sizing_decisions.initial_margin`, `sizing_decisions.leverage`, `sizing_decisions.maintenance_margin`, `sizing_decisions.notional`, `sizing_decisions.qty_by_notional`, `sizing_decisions.qty_by_risk`, `sizing_decisions.quantity`, `sizing_decisions.requested_quantity`

## Per-endpoint field types

### GET `/v1/accounts/{account_id}/balances` — `account_balances`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `strategy_id` | `—` | `unknown` | `serde_json::Value` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `—` | `unknown` | `serde_json::Value` |
| `venue` | `—` | `unknown` | `serde_json::Value` |
| `currency` | `text` | `string` | `String` |
| `total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `locked` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `free` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/admin/alphas/{alpha_id}` — `strategies`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `strategy_id` | `text` | `string` | `String` |
| `trader_id` | `text` | `string` | `String` |
| `description` | `text` | `string` | `String` |
| `active` | `boolean` | `bool` | `bool` |
| `allowed_modes` | `ARRAY` | `array` | `Vec<T>` |
| `allowed_venues` | `ARRAY` | `array` | `Vec<T>` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/admin/copy/policies` — `copy_publish_policies`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `policy_id` | `uuid` | `string` | `uuid::Uuid or String` |
| `strategy_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `enabled` | `boolean` | `bool` | `bool` |
| `event_types` | `ARRAY` | `array` | `Vec<T>` |
| `stream_name` | `text` | `string` | `String` |
| `include_raw` | `boolean` | `bool` | `bool` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/admin/events` — `domain_events`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `event_id` | `uuid` | `string` | `uuid::Uuid or String` |
| `event_ts` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `event_type` | `text` | `string` | `String` |
| `schema_version` | `text` | `string` | `String` |
| `trace_id` | `text` | `string` | `String` |
| `causation_id` | `uuid` | `string` | `uuid::Uuid or String` |
| `correlation_id` | `text` | `string` | `String` |
| `producer` | `text` | `string` | `String` |
| `message_type` | `text` | `string` | `String` |
| `trader_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `client_order_id` | `text` | `string` | `String` |
| `venue_order_id` | `text` | `string` | `String` |
| `trade_id` | `text` | `string` | `String` |
| `payload` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `raw` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `engine_version` | `text` | `string` | `String` |
| `canonical_contract_version` | `text` | `string` | `String` |
| `instrument_metadata_version` | `text` | `string` | `String` |
| `decision_digest` | `text` | `string` | `String` |

### GET `/v1/admin/ops/emergency-close/plan` — `positions_v2`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `position_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `symbol` | `—` | `unknown` | `serde_json::Value` |
| `product` | `—` | `unknown` | `serde_json::Value` |
| `venue_symbol` | `—` | `unknown` | `serde_json::Value` |
| `canonical_instrument_id` | `—` | `unknown` | `serde_json::Value` |
| `side` | `text` | `string` | `String` |
| `signed_qty` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `avg_px_open` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `mark_price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `unrealized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |

### GET `/v1/admin/ops/emergency-close/{operation_id}` — `operator_operations`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `operation_id` | `text` | `string` | `String` |
| `operation_type` | `text` | `string` | `String` |
| `scope_type` | `text` | `string` | `String` |
| `scope_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `status` | `text` | `string` | `String` |
| `plan` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `result` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `actor` | `text` | `string` | `String` |
| `reason` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### POST `/v1/admin/order-brackets/lifecycle-audit` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |

### GET `/v1/admin/order-groups` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `position_side` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `entry_client_order_id` | `text` | `string` | `String` |
| `execution_session_id` | `text` | `string` | `String` |
| `risk_grant_id` | `text` | `string` | `String` |
| `activation_policy` | `text` | `string` | `String` |
| `oco_policy` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `error_message` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/admin/performance/accounts/latest` — `account_equity_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `DISTINCT ON (deployment_id, currency) *` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/admin/performance/accounts/{account_id}/history` — `account_equity_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `id` | `bigint` | `number` | `i64` |
| `ts` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `deployment_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `currency` | `text` | `string` | `String` |
| `cash_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_free` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_locked` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `margin_initial` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `margin_maintenance` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `realized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `unrealized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `fee_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `funding_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `gross_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `net_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `drawdown` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_fills` | `integer` | `number` | `i32` |
| `source` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `snapshot_reason` | `text` | `string` | `String` |
| `state_digest` | `text` | `string` | `String` |

### GET `/v1/admin/performance/dashboard` — `portfolio_allocations`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `DISTINCT portfolio_id` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/admin/performance/instruments/latest` — `performance_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `* FROM ( SELECT DISTINCT ON ( deployment_id, COALESCE(instrument_id, symbol, ''), position_side, COALESCE(currency, '') ) *` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/admin/performance/portfolios/{portfolio_id}/history` — `portfolio_equity_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `id` | `bigint` | `number` | `i64` |
| `ts` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `portfolio_id` | `text` | `string` | `String` |
| `currency` | `text` | `string` | `String` |
| `allocated_capital` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `account_count` | `integer` | `number` | `i32` |
| `cash_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_free` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_locked` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `margin_initial` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `margin_maintenance` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `realized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `unrealized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `fee_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `funding_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `gross_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `net_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `drawdown` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_fills` | `integer` | `number` | `i32` |
| `source` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `snapshot_reason` | `text` | `string` | `String` |
| `state_digest` | `text` | `string` | `String` |

### GET `/v1/admin/performance/portfolios/{portfolio_id}/latest` — `portfolio_equity_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `DISTINCT ON (portfolio_id, currency) *` | `—` | `unknown` | `serde_json::Value` |

### POST `/v1/admin/replay/export` — `domain_events`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `event_id` | `uuid` | `string` | `uuid::Uuid or String` |
| `event_ts` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `event_type` | `text` | `string` | `String` |
| `schema_version` | `text` | `string` | `String` |
| `trace_id` | `text` | `string` | `String` |
| `causation_id` | `uuid` | `string` | `uuid::Uuid or String` |
| `correlation_id` | `text` | `string` | `String` |
| `producer` | `text` | `string` | `String` |
| `message_type` | `text` | `string` | `String` |
| `trader_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `client_order_id` | `text` | `string` | `String` |
| `venue_order_id` | `text` | `string` | `String` |
| `trade_id` | `text` | `string` | `String` |
| `payload` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `raw` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `engine_version` | `text` | `string` | `String` |
| `canonical_contract_version` | `text` | `string` | `String` |
| `instrument_metadata_version` | `text` | `string` | `String` |
| `decision_digest` | `text` | `string` | `String` |

### POST `/v1/admin/replay/jobs` — `execution_replay_jobs`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `replay_id` | `text` | `string` | `String` |
| `status` | `text` | `string` | `String` |
| `schema_version` | `text` | `string` | `String` |
| `manifest` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `artifact_metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `oracle` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `result` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `digest` | `text` | `string` | `String` |
| `certification_level` | `text` | `string` | `String` |
| `mismatch_count` | `integer` | `number` | `i32` |
| `error` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `started_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `completed_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/admin/replay/jobs/{replay_id}` — `execution_replay_jobs`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `replay_id` | `text` | `string` | `String` |
| `status` | `text` | `string` | `String` |
| `schema_version` | `text` | `string` | `String` |
| `manifest` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `artifact_metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `oracle` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `result` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `digest` | `text` | `string` | `String` |
| `certification_level` | `text` | `string` | `String` |
| `mismatch_count` | `integer` | `number` | `i32` |
| `error` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `started_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `completed_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### POST `/v1/admin/replay/jobs/{replay_id}/run` — `execution_replay_jobs`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `replay_id` | `text` | `string` | `String` |
| `status` | `text` | `string` | `String` |
| `schema_version` | `text` | `string` | `String` |
| `manifest` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `artifact_metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `oracle` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `result` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `digest` | `text` | `string` | `String` |
| `certification_level` | `text` | `string` | `String` |
| `mismatch_count` | `integer` | `number` | `i32` |
| `error` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `started_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `completed_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/admin/sizing/decisions` — `sizing_decisions`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `decision_id` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `currency` | `text` | `string` | `String` |
| `status` | `text` | `string` | `String` |
| `reason` | `text` | `string` | `String` |
| `quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `requested_quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `entry_price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `stop_price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity_source` | `text` | `string` | `String` |
| `alloc_per_trade` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `leverage` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `gross_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `effective_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `initial_margin` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `maintenance_margin` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `risk_percent` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `risk_amount` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `qty_by_risk` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `qty_by_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `source` | `text` | `string` | `String` |
| `capital_model` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `market_info` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `broker_binding` | `jsonb` | `object|array|scalar` | `serde_json::Value` |

### GET `/v1/admin/sizing/decisions/summary` — `sizing_decisions`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `status` | `text` | `string` | `String` |
| `reason` | `text` | `string` | `String` |
| `count` | `—` | `unknown` | `serde_json::Value` |
| `first_seen` | `—` | `unknown` | `serde_json::Value` |
| `last_seen` | `—` | `unknown` | `serde_json::Value` |
| `max_effective_notional` | `—` | `unknown` | `serde_json::Value` |
| `max_notional` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/admin/sizing/decisions/{decision_id}` — `sizing_decisions`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `decision_id` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `currency` | `text` | `string` | `String` |
| `status` | `text` | `string` | `String` |
| `reason` | `text` | `string` | `String` |
| `quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `requested_quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `entry_price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `stop_price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity_source` | `text` | `string` | `String` |
| `alloc_per_trade` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `leverage` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `gross_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `effective_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `initial_margin` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `maintenance_margin` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `risk_percent` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `risk_amount` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `qty_by_risk` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `qty_by_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `source` | `text` | `string` | `String` |
| `capital_model` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `market_info` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `broker_binding` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `request` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `response` | `jsonb` | `object|array|scalar` | `serde_json::Value` |

### GET `/v1/events` — `domain_events`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `event_id` | `uuid` | `string` | `uuid::Uuid or String` |
| `event_ts` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `event_type` | `text` | `string` | `String` |
| `schema_version` | `text` | `string` | `String` |
| `trace_id` | `text` | `string` | `String` |
| `causation_id` | `uuid` | `string` | `uuid::Uuid or String` |
| `correlation_id` | `text` | `string` | `String` |
| `producer` | `text` | `string` | `String` |
| `message_type` | `text` | `string` | `String` |
| `trader_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `client_order_id` | `text` | `string` | `String` |
| `venue_order_id` | `text` | `string` | `String` |
| `trade_id` | `text` | `string` | `String` |
| `payload` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `raw` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `engine_version` | `text` | `string` | `String` |
| `canonical_contract_version` | `text` | `string` | `String` |
| `instrument_metadata_version` | `text` | `string` | `String` |
| `decision_digest` | `text` | `string` | `String` |

### GET `/v1/execution-sessions/{execution_session_id}` — `execution_sessions`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `execution_session_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `cycle_key` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `submitted_count` | `integer` | `number` | `i32` |
| `risk_approved_count` | `integer` | `number` | `i32` |
| `risk_rejected_count` | `integer` | `number` | `i32` |
| `sent_count` | `integer` | `number` | `i32` |
| `filled_count` | `integer` | `number` | `i32` |
| `partial_fill_count` | `integer` | `number` | `i32` |
| `broker_rejected_count` | `integer` | `number` | `i32` |
| `accounting_recovered_count` | `integer` | `number` | `i32` |
| `reconciliation_deferred_count` | `integer` | `number` | `i32` |
| `reconciliation_actionable_count` | `integer` | `number` | `i32` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `started_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `completed_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### PATCH `/v1/execution-sessions/{execution_session_id}` — `execution_sessions`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `execution_session_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `cycle_key` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `submitted_count` | `integer` | `number` | `i32` |
| `risk_approved_count` | `integer` | `number` | `i32` |
| `risk_rejected_count` | `integer` | `number` | `i32` |
| `sent_count` | `integer` | `number` | `i32` |
| `filled_count` | `integer` | `number` | `i32` |
| `partial_fill_count` | `integer` | `number` | `i32` |
| `broker_rejected_count` | `integer` | `number` | `i32` |
| `accounting_recovered_count` | `integer` | `number` | `i32` |
| `reconciliation_deferred_count` | `integer` | `number` | `i32` |
| `reconciliation_actionable_count` | `integer` | `number` | `i32` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `started_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `completed_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/fills` — `fills`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `fill_id` | `bigint` | `number` | `i64` |
| `trade_time` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `trade_id` | `text` | `string` | `String` |
| `client_order_id` | `text` | `string` | `String` |
| `venue_order_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `symbol` | `—` | `unknown` | `serde_json::Value` |
| `side` | `text` | `string` | `String` |
| `price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `commission` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `commission_currency` | `text` | `string` | `String` |
| `liquidity_side` | `text` | `string` | `String` |
| `realized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `raw` | `jsonb` | `object|array|scalar` | `serde_json::Value` |

### GET `/v1/order-brackets` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `position_side` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `entry_client_order_id` | `text` | `string` | `String` |
| `execution_session_id` | `text` | `string` | `String` |
| `risk_grant_id` | `text` | `string` | `String` |
| `activation_policy` | `text` | `string` | `String` |
| `oco_policy` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `error_message` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### DELETE `/v1/order-brackets/{bracket_group_id}` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `position_side` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `entry_client_order_id` | `text` | `string` | `String` |
| `execution_session_id` | `text` | `string` | `String` |
| `risk_grant_id` | `text` | `string` | `String` |
| `activation_policy` | `text` | `string` | `String` |
| `oco_policy` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `error_message` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/order-brackets/{bracket_group_id}` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `position_side` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `entry_client_order_id` | `text` | `string` | `String` |
| `execution_session_id` | `text` | `string` | `String` |
| `risk_grant_id` | `text` | `string` | `String` |
| `activation_policy` | `text` | `string` | `String` |
| `oco_policy` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `error_message` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### PATCH `/v1/order-brackets/{bracket_group_id}` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `position_side` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `entry_client_order_id` | `text` | `string` | `String` |
| `execution_session_id` | `text` | `string` | `String` |
| `risk_grant_id` | `text` | `string` | `String` |
| `activation_policy` | `text` | `string` | `String` |
| `oco_policy` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `error_message` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### DELETE `/v1/order-groups/{group_id}` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `position_side` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `entry_client_order_id` | `text` | `string` | `String` |
| `execution_session_id` | `text` | `string` | `String` |
| `risk_grant_id` | `text` | `string` | `String` |
| `activation_policy` | `text` | `string` | `String` |
| `oco_policy` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `error_message` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### PATCH `/v1/order-groups/{group_id}` — `order_brackets`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `bracket_group_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `position_side` | `text` | `string` | `String` |
| `state` | `text` | `string` | `String` |
| `entry_client_order_id` | `text` | `string` | `String` |
| `execution_session_id` | `text` | `string` | `String` |
| `risk_grant_id` | `text` | `string` | `String` |
| `activation_policy` | `text` | `string` | `String` |
| `oco_policy` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `metadata` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `error_message` | `text` | `string` | `String` |
| `created_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/orders` — `orders`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `client_order_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `symbol` | `text` | `string` | `String` |
| `side` | `text` | `string` | `String` |
| `order_type` | `text` | `string` | `String` |
| `quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `trigger_price` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `time_in_force` | `text` | `string` | `String` |
| `status` | `text` | `string` | `String` |
| `reduce_only` | `boolean` | `bool` | `bool` |
| `intent` | `text` | `string` | `String` |
| `created_at` | `—` | `unknown` | `serde_json::Value` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `raw_request` | `jsonb` | `object|array|scalar` | `serde_json::Value` |
| `raw_response` | `jsonb` | `object|array|scalar` | `serde_json::Value` |

### GET `/v1/performance/accounts/latest` — `accounts`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `EXISTS ( SELECT 1` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/performance/accounts/{account_id}/history` — `accounts`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `EXISTS ( SELECT 1` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/performance/dashboard` — `accounts`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `EXISTS ( SELECT 1` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/performance/instruments/latest` — `accounts`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `EXISTS ( SELECT 1` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/performance/portfolios/{portfolio_id}/history` — `portfolio_allocations`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `EXISTS ( SELECT 1` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/performance/portfolios/{portfolio_id}/latest` — `portfolio_equity_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `DISTINCT ON (portfolio_id, currency) *` | `—` | `unknown` | `serde_json::Value` |

### POST `/v1/portfolio-targets/rebalance` — `account_equity_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `DISTINCT ON (strategy_id, mode, venue, account_id, currency) ts` | `—` | `unknown` | `serde_json::Value` |
| `deployment_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `currency` | `text` | `string` | `String` |
| `cash_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_free` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_locked` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `realized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `unrealized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `fee_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `funding_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `gross_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `net_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `drawdown` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_fills` | `integer` | `number` | `i32` |
| `source` | `text` | `string` | `String` |

### GET `/v1/portfolio/summary` — `account_equity_snapshots`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `DISTINCT ON (strategy_id, mode, venue, account_id, currency) ts` | `—` | `unknown` | `serde_json::Value` |
| `deployment_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `currency` | `text` | `string` | `String` |
| `cash_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_free` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `cash_locked` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `realized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `unrealized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `fee_total` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `funding_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `gross_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `net_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `equity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `drawdown` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_notional` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `total_fills` | `integer` | `number` | `i32` |
| `source` | `text` | `string` | `String` |

### GET `/v1/positions` — `positions_v2`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `position_id` | `text` | `string` | `String` |
| `strategy_id` | `text` | `string` | `String` |
| `account_id` | `text` | `string` | `String` |
| `mode` | `text` | `string` | `String` |
| `venue` | `text` | `string` | `String` |
| `instrument_id` | `text` | `string` | `String` |
| `symbol` | `—` | `unknown` | `serde_json::Value` |
| `side` | `text` | `string` | `String` |
| `signed_qty` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `quantity` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `avg_px_open` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `avg_px_close` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `realized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `unrealized_pnl` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `peak_qty` | `numeric` | `string` | `rust_decimal::Decimal (serde with str)` |
| `opened_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `closed_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |
| `updated_at` | `timestamp with time zone` | `string` | `chrono::DateTime<Utc>` |

### GET `/v1/sizing/decisions` — `accounts`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `EXISTS ( SELECT 1` | `—` | `unknown` | `serde_json::Value` |

### GET `/v1/sizing/decisions/summary` — `accounts`

| Field | PostgreSQL | JSON | Rust |
|---|---|---|---|
| `EXISTS ( SELECT 1` | `—` | `unknown` | `serde_json::Value` |
