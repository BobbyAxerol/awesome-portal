# Request body contract per mutation (source-resolved)

46/48 mutations resolved to a concrete field list.

| Method | Path | Resolved via | Fields |
|---|---|---|---|
| POST | `/admin/paper/accounts/seed` | HANDLER_DIRECT | `account_id`, `account_type`, `alpha_id`, `currency`, `exchange`, `initial_balance`, `trader_id`, `venue` |
| POST | `/bulk` | CALLEE_PAYLOAD | `alpha_id`, `execution_session_id`, `orders`, `risk_grant_id` |
| DELETE | `/cancel` | CALLEE_PAYLOAD | `alpha_id`, `exchange`, `order_type`, `venue` |
| POST | `/submit` | CALLEE_PAYLOAD | `alpha_id`, `client_order_id`, `exchange`, `order_type`, `venue` |
| POST | `/update` | CALLEE_PAYLOAD | `alpha_id`, `client_order_id`, `exchange`, `intent`, `new_client_order_id`, `order_type`, `orig_client_order_id`, `venue` |
| POST | `/v1/admin/accounts/paper/seed` | HANDLER_DIRECT | `account_id`, `account_type`, `alpha_id`, `currency`, `exchange`, `initial_balance`, `trader_id`, `venue` |
| PUT | `/v1/admin/accounts/{account_id}/policy` | HANDLER_DIRECT | `account_id` |
| POST | `/v1/admin/accounts/{account_id}/reconcile-open-orders` | HANDLER_DIRECT | `apply`, `reason`, `sync_first` |
| POST | `/v1/admin/accounts/{account_id}/reconcile-positions` | HANDLER_DIRECT | `apply`, `reason`, `sync_first` |
| POST | `/v1/admin/accounts/{account_id}/sync` | CALLEE_PAYLOAD | `mode`, `product`, `symbol`, `venue` |
| POST | `/v1/admin/alphas/register` | HANDLER_DIRECT | `alpha_id`, `api_key` |
| PATCH | `/v1/admin/alphas/{alpha_id}/risk` | CALLEE_PAYLOAD | `instrument_id`, `mode`, `venue` |
| POST | `/v1/admin/broker-bindings/{external_account_ref}/reconcile-open-orders` | HANDLER_DIRECT | `mode`, `reason`, `sync_first`, `venue` |
| POST | `/v1/admin/broker-bindings/{external_account_ref}/reconcile-positions` | HANDLER_DIRECT | `mode`, `reason`, `sync_first`, `venue` |
| PUT | `/v1/admin/copy/policies/{strategy_id}` | HANDLER_DIRECT | `strategy_id` |
| PATCH | `/v1/admin/deployments/{deployment_id}/state` | HANDLER_DIRECT | `reason`, `state` |
| POST | `/v1/admin/market/seed` | HANDLER_DIRECT | `exchange`, `metadata_version`, `precision_amount`, `price`, `product`, `quantity`, `source`, `step_size`, `symbol`, `tick_size`, `ttl_seconds`, `venue` … (+1) |
| POST | `/v1/admin/ops/emergency-close` | HANDLER_DIRECT | `account_id`, `alpha_id`, `confirmation`, `mode`, `reason`, `venue` |
| POST | `/v1/admin/ops/emergency-close/{operation_id}/verify` | NO_REQUEST_BODY | — |
| POST | `/v1/admin/order-brackets/lifecycle-audit` | HANDLER_DIRECT | `safe_terminalize` |
| POST | `/v1/admin/order-groups/{group_id}/reconcile` | PYDANTIC_MODEL_INLINE | `reason`, `expected_version` |
| POST | `/v1/admin/order-groups/{group_id}/release` | PYDANTIC_MODEL_INLINE | `reason`, `expected_version` |
| POST | `/v1/admin/portfolio-allocations` | CALLEE_PAYLOAD | `account_id`, `allocated_capital`, `capital_metadata`, `currency`, `deployment_id`, `max_capital`, `metadata`, `mode`, `movement_type`, `portfolio_id`, `reason`, `record_zero_capital_event` … (+3) |
| POST | `/v1/admin/portfolios` | CALLEE_PAYLOAD | `base_currency`, `metadata`, `name`, `owner`, `portfolio_id`, `reason`, `state` |
| PATCH | `/v1/admin/portfolios/{portfolio_id}/state` | HANDLER_DIRECT | `reason`, `state` |
| POST | `/v1/admin/replay/export` | HANDLER_DIRECT | `auto_run`, `filters`, `manifest`, `oracle`, `replay_id` |
| POST | `/v1/admin/replay/jobs` | CALLEE_PAYLOAD | `auto_run`, `events`, `manifest`, `oracle`, `replay_id` |
| POST | `/v1/admin/replay/jobs/{replay_id}/run` | NO_REQUEST_BODY | — |
| POST | `/v1/admin/replay/quantbt-diff` | HANDLER_DIRECT | `artifact`, `manifest`, `replay_id` |
| POST | `/v1/admin/symbols/sync` | HANDLER_DIRECT | `symbols` |
| POST | `/v1/admin/trading-state` | HANDLER_DIRECT | `exchange`, `mode`, `state`, `venue` |
| POST | `/v1/execution-sessions` | HANDLER_DIRECT | `account_id`, `alpha_id`, `bar_open`, `cycle_key`, `exchange`, `execution_session_id`, `metadata`, `mode`, `session_id`, `state`, `strategy_id`, `venue` |
| PATCH | `/v1/execution-sessions/{execution_session_id}` | HANDLER_DIRECT | `alpha_id`, `metadata`, `state`, `strategy_id` |
| POST | `/v1/execution-sessions/{execution_session_id}` | HANDLER_DIRECT | `alpha_id`, `metadata`, `state`, `strategy_id` |
| POST | `/v1/execution-sessions/{execution_session_id}/pre-risk` | HANDLER_DIRECT | `account_id`, `alpha_id`, `exchange`, `metadata`, `mode`, `orders`, `strategy_id`, `venue` |
| POST | `/v1/order-brackets` | HANDLER_DIRECT | `exchange`, `venue` |
| DELETE | `/v1/order-brackets/{bracket_group_id}` | PYDANTIC_MODEL_VIA_CALLEE | `alpha_id`, `client_order_id`, `execution_session_id`, `risk_grant_id`, `order_group_id`, `order_group_leg_id`, `symbol`, `side`, `position_side`, `order_type`, `quantity`, `exchange` … (+10) |
| PATCH | `/v1/order-brackets/{bracket_group_id}` | PYDANTIC_MODEL_INLINE | `trigger_price`, `price`, `reason`, `metadata` |
| POST | `/v1/order-groups` | HANDLER_DIRECT | `group_id` |
| DELETE | `/v1/order-groups/{group_id}` | HANDLER_DIRECT | `reason` |
| PATCH | `/v1/order-groups/{group_id}` | PYDANTIC_MODEL_INLINE | `expected_version`, `late_fill_policy`, `remainder_policy`, `max_exposure_quantity`, `metadata` |
| POST | `/v1/order-packages/arb` | PYDANTIC_MODEL_INLINE | `alpha_id`, `package_id`, `execution_session_id`, `cycle_key`, `account_id`, `mode`, `venue`, `package_policy`, `order_type`, `time_in_force`, `max_imbalance_bps`, `submit` … (+3) |
| POST | `/v1/orders` | CALLEE_PAYLOAD | `alpha_id`, `client_order_id`, `exchange`, `order_type`, `venue` |
| POST | `/v1/orders/bulk` | CALLEE_PAYLOAD | `alpha_id`, `execution_session_id`, `orders`, `risk_grant_id` |
| DELETE | `/v1/orders/{client_order_id}` | HANDLER_DIRECT | `client_order_id` |
| PATCH | `/v1/orders/{client_order_id}` | HANDLER_DIRECT | `orig_client_order_id` |
| POST | `/v1/portfolio-targets/rebalance` | HANDLER_DIRECT | `account_id`, `alpha_id`, `capital_model`, `currency`, `equity`, `exchange`, `execution_session_id`, `feature_schema_hash`, `gross_exposure`, `leverage`, `market_info`, `metadata` … (+12) |
| POST | `/v1/sizing/estimate` | HANDLER_DIRECT | `account_id`, `alpha_id`, `bracket_group_id`, `capital_model`, `currency`, `entry_price`, `exchange`, `market_info`, `metadata`, `min_notional_overshoot_bps`, `min_stop_distance_bps`, `mode` … (+9) |
