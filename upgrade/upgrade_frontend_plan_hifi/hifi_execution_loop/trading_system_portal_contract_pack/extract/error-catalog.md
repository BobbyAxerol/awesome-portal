# Error / rejection contract

No RFC-7807. The `reason` string is the contract. HTTP status alone is ambiguous.

| Reason code | Kinds | HTTP | Endpoints | Site |
|---|---|---|---|---|
| `ACCOUNT_ALPHA_MISMATCH` | response body `reason` | — | `GET /v1/accounts/{account_id}/preflight`, `POST /v1/sizing/estimate` | services/gateway/main.py:392 |
| `ACCOUNT_INACTIVE` | response body `reason` | — | shared/deep | services/risk_engine/repository/risk_repo.py:107 |
| `ACCOUNT_POLICY_UPSERTED` | response body `status` | — | `PUT /v1/admin/accounts/{account_id}/policy` | services/gateway/main.py:2446 |
| `ACCOUNT_SYNCED` | response body `status` | — | `POST /v1/admin/accounts/{account_id}/sync` | services/gateway/main.py:2465 |
| `ACTIVATED` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:632 |
| `ALLOCATION_UPSERTED` | response body `status` | — | `POST /v1/admin/portfolio-allocations` | services/gateway/main.py:2358 |
| `ALREADY_TERMINAL` | response body `status` | — | shared/deep | services/gateway/repository/order_brackets.py:304 |
| `AMEND_QTY_NOT_ABOVE_FILLED` | auth/validation tuple | — | shared/deep | services/paper_execution/repository.py:378 |
| `APPENDED` | response body `status` | — | shared/deep | services/gateway/repository/event_store.py:219 |
| `ARB_PACKAGE_SUBMIT_ONLY_SUPPORTS_PAPER_MODE_FOR_NOW` | response body `reason` | — | `POST /v1/order-packages/arb` | services/gateway/main.py:558 |
| `ATOMIC_PACKAGE_PRE_RISK_REJECTED` | response body `reason` | — | `POST /v1/order-packages/arb` | services/gateway/main.py:656 |
| `BATCH_PRE_RISK_DISABLED` | response body `reason` | — | `POST /v1/execution-sessions/{execution_session_id}/pre-risk`, `POST /v1/order-packages/arb` | services/gateway/main.py:568 |
| `BLOCKED_OPEN_CHILDREN` | response body `status` | — | shared/deep | services/gateway/repository/order_brackets.py:322 |
| `BROKER_SYNC_MISMATCH` | response body `reason` | — | shared/deep | services/risk_engine/repository/risk_repo.py:309 |
| `BROKER_SYNC_MISSING` | response body `reason` | — | shared/deep | services/risk_engine/repository/risk_repo.py:252 |
| `BROKER_SYNC_STALE` | response body `reason` | — | shared/deep | services/risk_engine/repository/risk_repo.py:280 |
| `BROKER_SYNC_TABLE_MISSING` | response body `reason` | — | shared/deep | services/risk_engine/repository/risk_repo.py:200 |
| `CANCEL_ACCEPTED` | response body `status` | — | `DELETE /v1/order-brackets/{bracket_group_id}`, `DELETE /v1/order-groups/{group_id}` | services/gateway/main.py:870 |
| `CHILD_RETRY_LIMIT_REACHED` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:343 |
| `CLOSED` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:649 |
| `CONFLICT` | response body `status` | — | `PATCH /v1/order-groups/{group_id}`, `POST /v1/admin/order-groups/{group_id}/reconcile` | services/gateway/main.py:850 |
| `COPY_POLICY_UPSERTED` | response body `status` | — | `PUT /v1/admin/copy/policies/{strategy_id}` | services/gateway/main.py:2005 |
| `DEPLOYMENT_STATE_SET` | response body `status` | — | `PATCH /v1/admin/deployments/{deployment_id}/state` | services/gateway/main.py:2345 |
| `DISABLED` | response body `status` | — | `POST /v1/order-groups`, `POST /v1/order-packages/arb` | services/gateway/main.py:568 |
| `DUPLICATE` | response body `status` | — | shared/deep | services/gateway/repository/event_store.py:165 |
| `DUPLICATE_FILL` | response body `reason` | — | shared/deep | services/portfolio/repository/portfolio_repo.py:59 |
| `ENTRY_FILL_LOOKUP_FAILED` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:424 |
| `ENTRY_TERMINAL` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:644 |
| `ERROR` | response body `status` | — | `POST /v1/order-packages/arb` | services/gateway/core/bracket_manager.py:419 |
| `INSUFFICIENT_BALANCE` | response body `reason` | — | shared/deep | services/portfolio_management/repository.py:3812 |
| `INSUFFICIENT_POSITION` | response body `reason` | — | shared/deep | services/portfolio_management/repository.py:3774 |
| `INSUFFICIENT_SETTLED_POSITION` | response body `reason` | — | shared/deep | services/portfolio_management/repository.py:3790 |
| `INTENTS_QUEUED` | response body `status` | — | `POST /v1/admin/ops/emergency-close` | services/gateway/main.py:2055 |
| `INVALID_API_KEY` | auth/validation tuple | 403 | shared/deep | services/gateway/core/engine.py:125 |
| `INVALID_CAPITAL_MODEL` | response body `reason` | — | shared/deep | services/gateway/core/sizing.py:76 |
| `INVALID_ENTRY_FILL_DISTANCE` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:436 |
| `INVALID_ENTRY_PRICE` | response body `reason` | — | shared/deep | services/gateway/core/sizing.py:59 |
| `INVALID_ENTRY_SIDE` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:430 |
| `INVALID_MARKET_PRICE` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:157 |
| `IN_FLIGHT` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:608 |
| `LEG_NOT_OPEN` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:385 |
| `MAKER` | auth/validation tuple | — | shared/deep | services/paper_execution/matcher.py:116 |
| `MARKET_DATA_NON_AUTHORITATIVE` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:149 |
| `MARKET_DATA_NOT_LIVE` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:151 |
| `MARKET_DATA_OFFLINE` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:145 |
| `MARKET_DATA_STALE` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:168 |
| `MARKET_DATA_TIMESTAMP_MISSING` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:165 |
| `MARKET_DATA_WRONG_MARKET` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:153 |
| `MARKET_DATA_WRONG_PRODUCT` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:155 |
| `MARKET_SEEDED` | response body `status` | — | `POST /v1/admin/market/seed` | services/gateway/main.py:2592 |
| `MARKET_SESSION_CLOSED` | auth/validation tuple | — | shared/deep | services/risk_engine/market_data.py:147 |
| `MISSING_ENTRY` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:419 |
| `MISSING_OR_PROCESSED` | response body `reason` | — | shared/deep | services/order_groups/repository.py:416 |
| `NATIVE_AMEND_UNSUPPORTED` | response body `code` | — | shared/deep | services/executor/handlers/binance_futs.py:121 |
| `NON_PAPER_NOT_RESERVED` | response body `reason` | — | shared/deep | services/portfolio_management/repository.py:3753 |
| `NON_POSITIVE_EQUITY` | response body `reason` | — | shared/deep | services/gateway/core/sizing.py:61 |
| `NON_POSITIVE_RESOLVED_TRIGGER` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:445 |
| `NOOP` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:694 |
| `NOT_FOUND` | response body `status` | — | `DELETE /v1/order-groups/{group_id}`, `GET /v1/order-groups/{group_id}`, `PATCH /v1/order-groups/{group_id}` | services/executor/handlers/binance_futs.py:231 |
| `NOT_IMPLEMENTED` | response body `status` | — | `POST /v1/order-packages/arb` | services/gateway/main.py:558 |
| `NO_EVENTS` | response body `status` | — | shared/deep | services/gateway/repository/event_store.py:594 |
| `NO_EXTERNAL_ORACLE` | response body `reason` | — | shared/deep | services/replay/comparator.py:48 |
| `NO_ORDERS` | response body `status` | — | `POST /v1/portfolio-targets/rebalance` | services/gateway/main.py:1655 |
| `NO_RESERVATION_REQUIRED` | response body `reason` | — | shared/deep | services/portfolio_management/repository.py:3761 |
| `OKX_EXECUTION_DISABLED` | response body `reason` | — | `POST /v1/order-groups` | services/gateway/main.py:784 |
| `OKX_NATIVE_ORDER_GROUP_SUBMISSION_NOT_ACCEPTED` | response body `reason` | — | `POST /v1/order-groups` | services/gateway/main.py:776 |
| `OPEN_ORDERS_RECONCILED` | response body `status` | — | `POST /v1/admin/accounts/{account_id}/reconcile-open-orders` | services/gateway/main.py:2501 |
| `OPPOSITE_SIDE_ON_SHARED_ONE_WAY_BINDING` | response body `reason` | — | shared/deep | services/risk_engine/repository/risk_repo.py:456 |
| `ORDER_EVENT_MISSING_KEYS` | response body `reason` | — | shared/deep | services/portfolio/repository/portfolio_repo.py:281 |
| `ORDER_GROUP_COMPENSATION_ATTRIBUTION_UNSAFE` | auth/validation tuple | — | shared/deep | services/risk_engine/main.py:358 |
| `ORDER_GROUP_COMPENSATION_POLICY_MISMATCH` | auth/validation tuple | — | shared/deep | services/risk_engine/main.py:356 |
| `ORDER_GROUP_ENGINE_V2_DISABLED` | response body `reason` | — | `POST /v1/order-groups` | services/gateway/main.py:742 |
| `ORDER_GROUP_NOT_FOUND` | auth/validation tuple | — | shared/deep | services/risk_engine/main.py:345 |
| `ORDER_GROUP_SCOPE_RECONCILIATION_REQUIRED` | auth/validation tuple | — | shared/deep | services/risk_engine/main.py:347 |
| `ORDER_NOT_FOUND` | auth/validation tuple | — | shared/deep | services/paper_execution/repository.py:372 |
| `PAPER_NATIVE_AMEND` | auth/validation tuple | — | shared/deep | services/paper_execution/repository.py:438 |
| `PENDING` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:314 |
| `PHYSICAL_OPEN_ORDERS_RECONCILED` | response body `status` | — | `POST /v1/admin/broker-bindings/{external_account_ref}/reconcile-open-orders` | services/gateway/main.py:2432 |
| `PHYSICAL_POSITIONS_RECONCILED` | response body `status` | — | `POST /v1/admin/broker-bindings/{external_account_ref}/reconcile-positions` | services/gateway/main.py:2415 |
| `PLANNED` | response body `status` | — | `POST /v1/order-packages/arb`, `POST /v1/portfolio-targets/rebalance` | services/gateway/main.py:617 |
| `PORTFOLIO_ALPHA_MISMATCH` | response body `reason` | — | `GET /v1/performance/dashboard`, `GET /v1/performance/portfolios/{portfolio_id}/history`, `GET /v1/performance/portfolios/{portfolio_id}/latest` | services/gateway/main.py:2191 |
| `PORTFOLIO_STATE_SET` | response body `status` | — | `PATCH /v1/admin/portfolios/{portfolio_id}/state` | services/gateway/main.py:2330 |
| `PORTFOLIO_UPSERTED` | response body `status` | — | `POST /v1/admin/portfolios` | services/gateway/main.py:2309 |
| `POSITIONS_RECONCILED` | response body `status` | — | `POST /v1/admin/accounts/{account_id}/reconcile-positions` | services/gateway/main.py:2483 |
| `PRICE_REQUIRED` | response body `code` | — | shared/deep | services/executor/handlers/binance_futs.py:128 |
| `QUERY_TIMEOUT` | response body `reason` | — | shared/deep | services/executor/handlers/binance_futs.py:223 |
| `READY` | response body `status` | — | `GET /health` | services/gateway/main.py:2596 |
| `RECONCILE_QUEUED` | response body `status` | — | `POST /v1/admin/order-groups/{group_id}/reconcile` | services/gateway/main.py:890 |
| `REGISTERED` | response body `status` | — | `POST /v1/admin/alphas/register` | services/gateway/main.py:1952 |
| `REJECTED` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:259 |
| `RELEASED` | response body `status` | — | `POST /v1/admin/order-groups/{group_id}/release` | services/gateway/main.py:903 |
| `RESOLVED` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:416 |
| `RETRIED_CHILDREN` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:662 |
| `RISK_GRANT_EXPIRED` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:287 |
| `RISK_GRANT_EXPIRES_AT_INVALID` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:289 |
| `RISK_GRANT_ID_MISSING` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:270 |
| `RISK_GRANT_NOT_FOUND` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:278 |
| `RISK_GRANT_ORDER_NOT_APPROVED` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:301 |
| `RISK_GRANT_QUANTITY_EXCEEDED` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:307 |
| `RISK_GRANT_SESSION_MISMATCH` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:291 |
| `RISK_GRANT_SIDE_MISMATCH` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:305 |
| `RISK_GRANT_SYMBOL_MISMATCH` | auth/validation tuple | — | shared/deep | services/risk_engine/repository/risk_grants.py:303 |
| `RISK_UPDATED` | response body `status` | — | `PATCH /v1/admin/alphas/{alpha_id}/risk` | services/gateway/main.py:1979 |
| `SEEDED` | response body `status` | — | `POST /admin/paper/accounts/seed`, `POST /v1/admin/accounts/paper/seed` | services/gateway/main.py:1928 |
| `SESSION_ALPHA_MISMATCH` | response body `reason` | — | `GET /v1/execution-sessions/{execution_session_id}`, `PATCH /v1/execution-sessions/{execution_session_id}`, `POST /v1/execution-sessions/{execution_session_id}/pre-risk` | services/gateway/main.py:1722 |
| `SKIPPED` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:343 |
| `STALE_EXECUTION_INTENT` | auth/validation tuple | — | shared/deep | domain/command_freshness.py:43 |
| `STOP_FILLED` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:673 |
| `SUBMITTED_PENDING_CHILDREN` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:687 |
| `SYMBOLS_SYNCED` | response body `status` | — | `POST /v1/admin/symbols/sync` | services/gateway/main.py:2543 |
| `TAKER` | auth/validation tuple | — | shared/deep | services/paper_execution/matcher.py:114 |
| `TERMINALIZED` | response body `status` | — | shared/deep | services/gateway/repository/order_brackets.py:351 |
| `TP_FILLED` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:676 |
| `TRADING_STATE_SET` | response body `status` | — | `POST /v1/admin/trading-state` | services/gateway/main.py:2020 |
| `UNAUTHORIZED_ALPHA` | auth/validation tuple | 403 | shared/deep | services/gateway/core/engine.py:113 |
| `UNCERTAIN` | response body `status` | — | shared/deep | services/executor/handlers/binance_futs.py:108 |
| `UNKNOWN` | auth/validation tuple | — | shared/deep | services/paper_execution/matcher.py:138 |
| `UNSUPPORTED_CONTRACT_REVISION` | response body `status` | — | shared/deep | services/gateway/main.py:112 |
| `UNSUPPORTED_ORDER_STYLE` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:259 |
| `UPDATED` | response body `status` | — | `PATCH /v1/order-groups/{group_id}` | services/gateway/main.py:851 |
| `VERSION_OR_STATE_CONFLICT` | response body `reason` | — | `PATCH /v1/order-groups/{group_id}` | services/gateway/main.py:850 |
| `WAITING` | response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:424 |
| `WAITING_FOR_ENTRY_FILL` | response body `reason`, response body `status` | — | shared/deep | services/gateway/core/bracket_manager.py:426 |
| `WAITING_FOR_POSITION_PROJECTION` | response body `reason` | — | shared/deep | services/gateway/core/bracket_manager.py:314 |

## Reason codes per endpoint

| Endpoint | Reason codes |
|---|---|
| `DELETE /v1/order-brackets/{bracket_group_id}` | `CANCEL_ACCEPTED` |
| `DELETE /v1/order-groups/{group_id}` | `CANCEL_ACCEPTED`, `NOT_FOUND` |
| `GET /health` | `READY` |
| `GET /v1/accounts/{account_id}/preflight` | `ACCOUNT_ALPHA_MISMATCH` |
| `GET /v1/execution-sessions/{execution_session_id}` | `SESSION_ALPHA_MISMATCH` |
| `GET /v1/order-groups/{group_id}` | `NOT_FOUND` |
| `GET /v1/performance/dashboard` | `PORTFOLIO_ALPHA_MISMATCH` |
| `GET /v1/performance/portfolios/{portfolio_id}/history` | `PORTFOLIO_ALPHA_MISMATCH` |
| `GET /v1/performance/portfolios/{portfolio_id}/latest` | `PORTFOLIO_ALPHA_MISMATCH` |
| `PATCH /v1/admin/alphas/{alpha_id}/risk` | `RISK_UPDATED` |
| `PATCH /v1/admin/deployments/{deployment_id}/state` | `DEPLOYMENT_STATE_SET` |
| `PATCH /v1/admin/portfolios/{portfolio_id}/state` | `PORTFOLIO_STATE_SET` |
| `PATCH /v1/execution-sessions/{execution_session_id}` | `SESSION_ALPHA_MISMATCH` |
| `PATCH /v1/order-groups/{group_id}` | `CONFLICT`, `NOT_FOUND`, `UPDATED`, `VERSION_OR_STATE_CONFLICT` |
| `POST /admin/paper/accounts/seed` | `SEEDED` |
| `POST /v1/admin/accounts/paper/seed` | `SEEDED` |
| `POST /v1/admin/accounts/{account_id}/reconcile-open-orders` | `OPEN_ORDERS_RECONCILED` |
| `POST /v1/admin/accounts/{account_id}/reconcile-positions` | `POSITIONS_RECONCILED` |
| `POST /v1/admin/accounts/{account_id}/sync` | `ACCOUNT_SYNCED` |
| `POST /v1/admin/alphas/register` | `REGISTERED` |
| `POST /v1/admin/broker-bindings/{external_account_ref}/reconcile-open-orders` | `PHYSICAL_OPEN_ORDERS_RECONCILED` |
| `POST /v1/admin/broker-bindings/{external_account_ref}/reconcile-positions` | `PHYSICAL_POSITIONS_RECONCILED` |
| `POST /v1/admin/market/seed` | `MARKET_SEEDED` |
| `POST /v1/admin/ops/emergency-close` | `INTENTS_QUEUED` |
| `POST /v1/admin/order-groups/{group_id}/reconcile` | `CONFLICT`, `RECONCILE_QUEUED` |
| `POST /v1/admin/order-groups/{group_id}/release` | `RELEASED` |
| `POST /v1/admin/portfolio-allocations` | `ALLOCATION_UPSERTED` |
| `POST /v1/admin/portfolios` | `PORTFOLIO_UPSERTED` |
| `POST /v1/admin/symbols/sync` | `SYMBOLS_SYNCED` |
| `POST /v1/admin/trading-state` | `TRADING_STATE_SET` |
| `POST /v1/execution-sessions/{execution_session_id}/pre-risk` | `BATCH_PRE_RISK_DISABLED`, `SESSION_ALPHA_MISMATCH` |
| `POST /v1/order-groups` | `DISABLED`, `OKX_EXECUTION_DISABLED`, `OKX_NATIVE_ORDER_GROUP_SUBMISSION_NOT_ACCEPTED`, `ORDER_GROUP_ENGINE_V2_DISABLED` |
| `POST /v1/order-packages/arb` | `ARB_PACKAGE_SUBMIT_ONLY_SUPPORTS_PAPER_MODE_FOR_NOW`, `ATOMIC_PACKAGE_PRE_RISK_REJECTED`, `BATCH_PRE_RISK_DISABLED`, `DISABLED`, `ERROR`, `NOT_IMPLEMENTED`, `PLANNED` |
| `POST /v1/portfolio-targets/rebalance` | `NO_ORDERS`, `PLANNED` |
| `POST /v1/sizing/estimate` | `ACCOUNT_ALPHA_MISMATCH` |
| `PUT /v1/admin/accounts/{account_id}/policy` | `ACCOUNT_POLICY_UPSERTED` |
| `PUT /v1/admin/copy/policies/{strategy_id}` | `COPY_POLICY_UPSERTED` |
