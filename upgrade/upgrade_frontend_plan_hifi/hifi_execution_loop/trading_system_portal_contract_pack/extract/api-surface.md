# Trading System gateway — real HTTP surface (source-derived)

Operations: 104 | source: `services/gateway/main.py` @ 9081397de9e9

> OpenAPI declares 0 query params and 0 request bodies; the columns below are the
> parameters the handlers actually read. This table is the connector contract.

| Method | Path | Auth | Query params (source) | Body fields (source) | Codes | Handler |
|---|---|---|---|---|---|---|
| POST | `/admin/paper/accounts/seed` | ADMIN | — | `account_id`, `account_type`, `alpha_id`, `currency`, `exchange`, `initial_balance`, `trader_id`, `venue` | 400 | `seed_paper_account` |
| POST | `/bulk` | ALPHA_KEY | — | — | 200 | `submit_bulk` |
| DELETE | `/cancel` | ALPHA_KEY | — | — | 200 | `cancel_order_legacy` |
| GET | `/health` | PUBLIC | — | — | 200 | `health` |
| POST | `/submit` | ALPHA_KEY | — | — | 200 | `submit_single` |
| POST | `/update` | ALPHA_KEY | — | — | 200 | `update_order` |
| GET | `/v1/accounts/{account_id}/balances` | ALPHA_KEY | `alpha_id`, `exchange`, `mode`, `strategy_id`, `venue` | — | 200 | `v1_account_balances` |
| GET | `/v1/accounts/{account_id}/preflight` | ALPHA_KEY | `alpha_id`, `exchange`, `mode`, `strategy_id`, `venue` | — | 400, 403 | `v1_account_preflight` |
| POST | `/v1/admin/accounts/paper/seed` | ADMIN | — | `account_id`, `account_type`, `alpha_id`, `currency`, `exchange`, `initial_balance`, `trader_id`, `venue` | 400 | `seed_paper_account` |
| PUT | `/v1/admin/accounts/{account_id}/policy` | ADMIN | — | `account_id` | 400 | `admin_upsert_account_policy` |
| POST | `/v1/admin/accounts/{account_id}/reconcile-open-orders` | ADMIN | — | `apply`, `reason`, `sync_first` | 400 | `admin_reconcile_account_open_orders` |
| POST | `/v1/admin/accounts/{account_id}/reconcile-positions` | ADMIN | — | `apply`, `reason`, `sync_first` | 400 | `admin_reconcile_account_positions` |
| GET | `/v1/admin/accounts/{account_id}/state` | ADMIN | — | — | 400 | `admin_get_account_state` |
| POST | `/v1/admin/accounts/{account_id}/sync` | ADMIN | — | — | 400 | `admin_sync_account` |
| POST | `/v1/admin/alphas/register` | ADMIN | — | `alpha_id`, `api_key` | 400 | `admin_register_alpha` |
| GET | `/v1/admin/alphas/{alpha_id}` | ADMIN | — | — | 404 | `admin_get_alpha` |
| PATCH | `/v1/admin/alphas/{alpha_id}/risk` | ADMIN | — | — | 400 | `admin_update_alpha_risk` |
| GET | `/v1/admin/broker-bindings` | ADMIN | — | — | 400 | `admin_list_broker_bindings` |
| GET | `/v1/admin/broker-bindings/{external_account_ref}/exposure` | ADMIN | — | — | 400 | `admin_get_broker_binding_exposure` |
| POST | `/v1/admin/broker-bindings/{external_account_ref}/reconcile-open-orders` | ADMIN | — | `mode`, `reason`, `sync_first`, `venue` | 400 | `admin_reconcile_broker_binding_open_orders` |
| POST | `/v1/admin/broker-bindings/{external_account_ref}/reconcile-positions` | ADMIN | — | `mode`, `reason`, `sync_first`, `venue` | 400 | `admin_reconcile_broker_binding_positions` |
| GET | `/v1/admin/broker-bindings/{external_account_ref}/state` | ADMIN | — | — | 400 | `admin_get_broker_binding_state` |
| GET | `/v1/admin/copy/policies` | ADMIN | `alpha_id`, `enabled`, `exchange`, `mode`, `strategy_id`, `venue` | — | 200 | `admin_list_copy_policies` |
| PUT | `/v1/admin/copy/policies/{strategy_id}` | ADMIN | — | `strategy_id` | 400 | `admin_upsert_copy_policy` |
| PATCH | `/v1/admin/deployments/{deployment_id}/state` | ADMIN | — | `reason`, `state` | 400 | `admin_set_deployment_state` |
| GET | `/v1/admin/events` | ADMIN | — | — | 200 | `admin_events` |
| POST | `/v1/admin/market/seed` | ADMIN | — | `exchange`, `metadata_version`, `precision_amount`, `price`, `product`, `quantity`, `source`, `step_size`, `symbol`, `tick_size`, `ttl_seconds`, `venue`, `venue_symbol` | 400 | `admin_seed_market` |
| POST | `/v1/admin/ops/emergency-close` | ADMIN | — | `account_id`, `alpha_id`, `confirmation`, `mode`, `reason`, `venue` | 400 | `admin_emergency_close` |
| GET | `/v1/admin/ops/emergency-close/plan` | ADMIN | `account_id`, `alpha_id`, `mode`, `venue` | — | 400 | `admin_emergency_close_plan` |
| GET | `/v1/admin/ops/emergency-close/{operation_id}` | ADMIN | — | — | 404 | `admin_get_emergency_close` |
| POST | `/v1/admin/ops/emergency-close/{operation_id}/verify` | ADMIN | — | — | 400 | `admin_verify_emergency_close` |
| POST | `/v1/admin/order-brackets/lifecycle-audit` | ADMIN | — | `safe_terminalize` | 400 | `v1_admin_audit_bracket_lifecycle` |
| GET | `/v1/admin/order-groups` | ADMIN | `account_id`, `alpha_id`, `exchange`, `limit`, `mode`, `state`, `strategy_id`, `venue` | — | 200 | `v1_admin_list_order_groups` |
| GET | `/v1/admin/order-groups/{group_id}` | ADMIN | — | — | 404 | `v1_admin_get_order_group` |
| POST | `/v1/admin/order-groups/{group_id}/reconcile` | ADMIN | — | — | 400, 404, 409 | `v1_admin_reconcile_order_group` |
| POST | `/v1/admin/order-groups/{group_id}/release` | ADMIN | — | — | 400, 404 | `v1_admin_release_order_group` |
| GET | `/v1/admin/performance/accounts/latest` | ADMIN | `account_id`, `alpha_id`, `mode`, `venue` | — | 200 | `admin_latest_account_performance` |
| GET | `/v1/admin/performance/accounts/{account_id}/history` | ADMIN | `limit` | — | 200 | `admin_account_performance_history` |
| GET | `/v1/admin/performance/dashboard` | ADMIN | `account_id`, `alpha_id`, `limit`, `mode`, `portfolio_id`, `venue` | — | 200 | `admin_performance_dashboard` |
| GET | `/v1/admin/performance/instruments/latest` | ADMIN | `account_id`, `alpha_id`, `limit`, `mode`, `symbol`, `venue` | — | 200 | `admin_latest_instrument_performance` |
| GET | `/v1/admin/performance/portfolios/{portfolio_id}/history` | ADMIN | `limit` | — | 200 | `admin_portfolio_performance_history` |
| GET | `/v1/admin/performance/portfolios/{portfolio_id}/latest` | ADMIN | — | — | 200 | `admin_latest_portfolio_performance` |
| POST | `/v1/admin/portfolio-allocations` | ADMIN | — | — | 400 | `admin_upsert_portfolio_allocation` |
| GET | `/v1/admin/portfolio-capital/history` | ADMIN | — | — | 400 | `admin_portfolio_capital_history` |
| GET | `/v1/admin/portfolios` | ADMIN | — | — | 200 | `admin_list_portfolios` |
| POST | `/v1/admin/portfolios` | ADMIN | — | — | 400 | `admin_upsert_portfolio` |
| PATCH | `/v1/admin/portfolios/{portfolio_id}/state` | ADMIN | — | `reason`, `state` | 400 | `admin_set_portfolio_state` |
| GET | `/v1/admin/replay/compare` | ADMIN | — | — | 200 | `admin_replay_compare` |
| POST | `/v1/admin/replay/export` | ADMIN | — | `auto_run`, `filters`, `manifest`, `oracle`, `replay_id` | 400 | `admin_export_replay` |
| GET | `/v1/admin/replay/jobs` | ADMIN | `limit` | — | 200 | `admin_list_replay_jobs` |
| POST | `/v1/admin/replay/jobs` | ADMIN | — | — | 400 | `admin_create_replay_job` |
| GET | `/v1/admin/replay/jobs/{replay_id}` | ADMIN | — | — | 404 | `admin_get_replay_job` |
| POST | `/v1/admin/replay/jobs/{replay_id}/run` | ADMIN | — | — | 404 | `admin_run_replay_job` |
| GET | `/v1/admin/replay/order-lifecycle` | ADMIN | — | — | 200 | `admin_replay_order_lifecycle` |
| POST | `/v1/admin/replay/quantbt-diff` | ADMIN | — | `artifact`, `manifest`, `replay_id` | 400 | `admin_quantbt_diff` |
| GET | `/v1/admin/sizing/decisions` | ADMIN | `account_id`, `alpha_id`, `exchange`, `limit`, `mode`, `status`, `strategy_id`, `symbol`, `venue` | — | 200 | `admin_sizing_decisions` |
| GET | `/v1/admin/sizing/decisions/summary` | ADMIN | `account_id`, `alpha_id`, `exchange`, `mode`, `strategy_id`, `symbol`, `venue` | — | 200 | `admin_sizing_decisions_summary` |
| GET | `/v1/admin/sizing/decisions/{decision_id}` | ADMIN | — | — | 404 | `admin_sizing_decision` |
| GET | `/v1/admin/symbols` | ADMIN | — | — | 200 | `admin_get_symbols` |
| POST | `/v1/admin/symbols/sync` | ADMIN | — | `symbols` | 200 | `admin_sync_symbols` |
| POST | `/v1/admin/trading-state` | ADMIN | — | `exchange`, `mode`, `state`, `venue` | 400 | `admin_set_trading_state` |
| GET | `/v1/contracts` | PUBLIC | — | — | 200 | `v1_contracts` |
| GET | `/v1/events` | ALPHA_REPLAY | — | — | 200 | `v1_events` |
| POST | `/v1/execution-sessions` | ALPHA_KEY | — | `account_id`, `alpha_id`, `bar_open`, `cycle_key`, `exchange`, `execution_session_id`, `metadata`, `mode`, `session_id`, `state`, `strategy_id`, `venue` | 400 | `v1_create_execution_session` |
| GET | `/v1/execution-sessions/{execution_session_id}` | ALPHA_KEY | `alpha_id`, `strategy_id` | — | 403, 404 | `v1_get_execution_session` |
| PATCH | `/v1/execution-sessions/{execution_session_id}` | ALPHA_KEY | — | `alpha_id`, `metadata`, `state`, `strategy_id` | 400, 403, 404 | `v1_update_execution_session` |
| POST | `/v1/execution-sessions/{execution_session_id}` | ALPHA_KEY | — | `alpha_id`, `metadata`, `state`, `strategy_id` | 400, 403, 404 | `v1_update_execution_session_post` |
| POST | `/v1/execution-sessions/{execution_session_id}/pre-risk` | ALPHA_KEY | — | `account_id`, `alpha_id`, `exchange`, `metadata`, `mode`, `orders`, `strategy_id`, `venue` | 400, 403, 404, 409 | `v1_execution_session_pre_risk` |
| GET | `/v1/fills` | ALPHA_KEY | `alpha_id`, `exchange`, `limit`, `mode`, `strategy_id`, `symbol`, `venue` | — | 200 | `v1_list_fills` |
| GET | `/v1/health` | PUBLIC | — | `details`, `instance_id`, `last_seen_unix`, `service_name`, `status` | 200 | `v1_health` |
| GET | `/v1/health/capabilities` | PUBLIC | — | `capabilities`, `details`, `instance_id`, `last_seen_unix`, `service_name`, `status`, `ts`, `venue_products` | 200 | `v1_health_capabilities` |
| GET | `/v1/market/info/{venue}/{symbol}` | PUBLIC | `product`, `venue_symbol` | — | 404 | `v1_market_info` |
| GET | `/v1/market/latest/{venue}/{symbol}` | PUBLIC | `product`, `venue_symbol` | — | 404 | `v1_market_latest` |
| GET | `/v1/order-brackets` | ALPHA_KEY | `account_id`, `alpha_id`, `exchange`, `limit`, `mode`, `state`, `strategy_id`, `symbol`, `venue` | — | 200 | `v1_list_brackets` |
| POST | `/v1/order-brackets` | ALPHA_KEY | — | `exchange`, `venue` | 400 | `v1_submit_bracket` |
| DELETE | `/v1/order-brackets/{bracket_group_id}` | ALPHA_KEY | — | — | 404 | `v1_cancel_bracket` |
| GET | `/v1/order-brackets/{bracket_group_id}` | ALPHA_KEY | — | — | 404 | `v1_get_bracket` |
| PATCH | `/v1/order-brackets/{bracket_group_id}` | ALPHA_KEY | — | — | 400, 404 | `v1_replace_bracket_stop` |
| GET | `/v1/order-groups` | ALPHA_KEY | `account_id`, `alpha_id`, `exchange`, `limit`, `mode`, `state`, `strategy_id`, `venue` | — | 200 | `v1_list_order_groups` |
| POST | `/v1/order-groups` | ALPHA_KEY | — | `group_id` | 400, 409, 503 | `v1_create_order_group` |
| DELETE | `/v1/order-groups/{group_id}` | ALPHA_KEY | — | `reason` | 404 | `v1_cancel_order_group` |
| GET | `/v1/order-groups/{group_id}` | ALPHA_KEY | — | — | 404 | `v1_get_order_group` |
| PATCH | `/v1/order-groups/{group_id}` | ALPHA_KEY | — | — | 400, 404, 409 | `v1_patch_order_group` |
| POST | `/v1/order-packages/arb` | ALPHA_KEY | — | — | 400, 409, 501 | `v1_submit_arb_package` |
| GET | `/v1/orders` | ALPHA_KEY | `alpha_id`, `exchange`, `limit`, `mode`, `strategy_id`, `symbol`, `venue` | — | 200 | `v1_list_orders` |
| POST | `/v1/orders` | ALPHA_KEY | — | — | 200 | `v1_submit_single` |
| POST | `/v1/orders/bulk` | ALPHA_KEY | — | — | 200 | `v1_submit_bulk` |
| DELETE | `/v1/orders/{client_order_id}` | ALPHA_KEY | — | `client_order_id` | 200 | `v1_cancel_order` |
| GET | `/v1/orders/{client_order_id}` | ALPHA_KEY | `account_id`, `alpha_id`, `exchange`, `mode`, `strategy_id`, `venue` | — | 200 | `v1_get_order` |
| PATCH | `/v1/orders/{client_order_id}` | ALPHA_KEY | — | `orig_client_order_id` | 200 | `v1_update_order` |
| GET | `/v1/performance/accounts/latest` | ALPHA_KEY | `account_id`, `alpha_id`, `mode`, `strategy_id`, `venue` | — | 403 | `v1_latest_account_performance` |
| GET | `/v1/performance/accounts/{account_id}/history` | ALPHA_KEY | `alpha_id`, `limit`, `strategy_id` | — | 403 | `v1_account_performance_history` |
| GET | `/v1/performance/dashboard` | ALPHA_KEY | `account_id`, `alpha_id`, `limit`, `mode`, `portfolio_id`, `strategy_id`, `venue` | — | 403 | `v1_performance_dashboard` |
| GET | `/v1/performance/instruments/latest` | ALPHA_KEY | `account_id`, `alpha_id`, `limit`, `mode`, `strategy_id`, `symbol`, `venue` | — | 403 | `v1_latest_instrument_performance` |
| GET | `/v1/performance/portfolios/{portfolio_id}/history` | ALPHA_KEY | `alpha_id`, `limit`, `strategy_id` | — | 403 | `v1_portfolio_performance_history` |
| GET | `/v1/performance/portfolios/{portfolio_id}/latest` | ALPHA_KEY | `alpha_id`, `strategy_id` | — | 403 | `v1_latest_portfolio_performance` |
| POST | `/v1/portfolio-targets/rebalance` | ALPHA_KEY | — | `account_id`, `alpha_id`, `capital_model`, `currency`, `equity`, `exchange`, `execution_session_id`, `feature_schema_hash`, `gross_exposure`, `leverage`, `market_info`, `metadata`, `min_delta_notional`, `mode`, `model_version`, `order_type`, `prediction_id`, `prices`, `rebalance_session_id`, `strategy_id`, `submit`, `targets`, `time_in_force`, `venue` | 400 | `v1_portfolio_targets_rebalance` |
| GET | `/v1/portfolio/summary` | ALPHA_KEY | `account_id`, `alpha_id`, `exchange`, `mode`, `strategy_id`, `venue` | — | 200 | `v1_portfolio_summary` |
| GET | `/v1/positions` | ALPHA_KEY | `alpha_id`, `exchange`, `include_flat`, `limit`, `mode`, `strategy_id`, `symbol`, `venue` | — | 200 | `v1_list_positions` |
| GET | `/v1/replay/compare` | ALPHA_REPLAY | — | — | 200 | `v1_replay_compare` |
| GET | `/v1/replay/order-lifecycle` | ALPHA_REPLAY | — | — | 200 | `v1_replay_order_lifecycle` |
| GET | `/v1/sizing/decisions` | ALPHA_KEY | `account_id`, `alpha_id`, `exchange`, `limit`, `mode`, `status`, `strategy_id`, `symbol`, `venue` | — | 403 | `v1_sizing_decisions` |
| GET | `/v1/sizing/decisions/summary` | ALPHA_KEY | `account_id`, `alpha_id`, `exchange`, `mode`, `strategy_id`, `symbol`, `venue` | — | 403 | `v1_sizing_decisions_summary` |
| POST | `/v1/sizing/estimate` | ALPHA_KEY | — | `account_id`, `alpha_id`, `bracket_group_id`, `capital_model`, `currency`, `entry_price`, `exchange`, `market_info`, `metadata`, `min_notional_overshoot_bps`, `min_stop_distance_bps`, `mode`, `product`, `remaining_notional_safety_bps`, `risk_percent`, `sandbox_notional_cap`, `stop_price`, `strategy_id`, `symbol`, `venue`, `venue_symbol` | 400, 403 | `v1_sizing_estimate` |
