# Closed vocabularies — Portal adapter mapping table

A connector must fail closed on unknown values. Sources: Python enums, DB CHECK
constraints (authoritative for stored values), venue registry.

## Venue / product capability matrix

| Venue | Product | Modes | Exec | MktData | PrivEvents | Sync | Recon | Position modes | Rollout |
|---|---|---|---|---|---|---|---|---|---|
| BINANCE | USD_M | paper, sandbox, live | ✓ | ✓ | ✓ | ✓ | ✓ | ONE_WAY, HEDGE | `ACTIVE` |
| BINANCE | SPOT | paper | — | ✓ | — | — | — | NET | `MARKET_DATA_ONLY` |
| DNSE | VN_EQUITY | paper, live | ✓ | ✓ | ✓ | ✓ | ✓ | NET | `ACTIVE` |
| DNSE | VN_DERIVATIVE | paper | ✓ | ✓ | — | — | — | NET | `PAPER_ONLY` |
| OKX | SWAP | sandbox, live | — | ✓ | ✓ | ✓ | ✓ | NET, LONG_SHORT | `DISABLED_PENDING_ACCEPTANCE` |
| OKX | FUTURES | sandbox, live | — | ✓ | ✓ | ✓ | ✓ | NET, LONG_SHORT | `DISABLED_PENDING_ACCEPTANCE` |

## Field vocabularies (DB CHECK — authoritative)

| Field | Allowed values | Tables |
|---|---|---|
> Rows marked ⚠ have different value sets on different tables — map per table, never by column name alone.

| `account_equity_snapshots.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | account_equity_snapshots |
| `account_policies.account_type` | `BETTING`, `CASH`, `MARGIN` | account_policies |
| `account_policies.margin_mode` | `CROSS`, `ISOLATED`, `NONE` | account_policies |
| `account_policies.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | account_policies |
| `account_policies.position_accounting_mode` | `HEDGE`, `NET` | account_policies |
| `account_policies.settlement_policy` | `IMMEDIATE`, `VN_T_PLUS` | account_policies |
| `account_reservations.margin_mode` | `CROSS`, `ISOLATED`, `NONE` | account_reservations |
| `account_reservations.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | account_reservations |
| `account_reservations.reservation_type` | `CASH`, `MARGIN`, `SECURITY` | account_reservations |
| `account_reservations.status` | `CONSUMED`, `FAILED`, `PARTIALLY_CONSUMED`, `RELEASED`, `RESERVED` | account_reservations |
| `account_sync_current_state.status` | `ERROR`, `MISMATCH`, `OK`, `STALE` | account_sync_current_state |
| `account_sync_snapshots.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | account_sync_snapshots |
| `account_sync_snapshots.status` | `ERROR`, `MISMATCH`, `OK`, `STALE` | account_sync_snapshots |
| `accounts.account_type` | `BETTING`, `CASH`, `MARGIN` | accounts |
| `accounts.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | accounts |
| `broker_account_sync_current_state.status` | `ERROR`, `MISMATCH`, `OK`, `STALE` | broker_account_sync_current_state |
| `broker_account_sync_snapshots.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | broker_account_sync_snapshots |
| `broker_account_sync_snapshots.status` | `ERROR`, `MISMATCH`, `OK`, `STALE` | broker_account_sync_snapshots |
| `broker_sync_raw_hot.scope_type` | `ACCOUNT`, `PHYSICAL_BINDING` | broker_sync_raw_hot |
| `broker_sync_state_history.scope_type` | `ACCOUNT`, `PHYSICAL_BINDING` | broker_sync_state_history |
| `broker_sync_valuation_current_state.scope_type` | `ACCOUNT`, `PHYSICAL_BINDING` | broker_sync_valuation_current_state |
| `command_ack_evidence.outcome_class` | `ACCEPTED`, `BUSINESS_REJECTED`, `RETRYABLE`, `TERMINAL`, `UNCERTAIN` | command_ack_evidence |
| `command_broker_attempts.state` | `ACCEPTED`, `BUSINESS_REJECTED`, `REQUESTING`, `TERMINAL`, `UNCERTAIN` | command_broker_attempts |
| `command_delivery_attempts.outcome_class` | `DISPATCHED`, `RETRYABLE`, `TERMINAL`, `UNCERTAIN` | command_delivery_attempts |
| `command_dispatch_outbox.state` | `ACKNOWLEDGED`, `CANCELLED`, `DEAD`, `DISPATCHED`, `LEASED`, `PENDING` | command_dispatch_outbox |
| `command_journal.command_kind` | `AMEND`, `CANCEL`, `EMERGENCY_CLOSE`, `PLACE` | command_journal |
| `command_journal.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | command_journal |
| `command_journal.state` | `ACCEPTED`, `ACKNOWLEDGED`, `BUSINESS_REJECTED`, `DEAD`, `DISPATCHED`, `DISPATCH_PENDING`, `SHADOW_OBSERVED`, `SUPERSEDED`, `UNCERTAIN` | command_journal |
| `compatibility_surface_registry.support_state` | `MIGRATE_ON_SUCCESS`, `READ_COMPATIBILITY`, `RETIRED`, `SUPPORTED_COMPATIBILITY`, `ZERO_USE_CANDIDATE` | compatibility_surface_registry |
| `conditional_order_group_legs.state` | `CANCELED`, `EXPIRED`, `FILLED`, `OPEN`, `PARTIALLY_FILLED`, `PENDING_CANCEL`, `PENDING_SUBMIT`, `REJECTED`, `WAITING` | conditional_order_group_legs |
| `conditional_order_groups.contingency_type` | `BRACKET`, `NONE`, `OCO`, `OTO`, `OUO` | conditional_order_groups |
| `conditional_order_groups.execution_trigger` | `ON_FIRST_FILL`, `ON_FULL_FILL`, `ON_TARGET_QUANTITY`, `ON_TERMINAL` | conditional_order_groups |
| `conditional_order_groups.late_fill_policy` | `ACCEPT_WITHIN_MAX_EXPOSURE`, `AUTO_REDUCE_EXCESS`, `HALT_AND_RECONCILE` | conditional_order_groups |
| `conditional_order_groups.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | conditional_order_groups |
| `conditional_order_groups.remainder_policy` | `CANCEL_REMAINDER`, `KEEP_REMAINDER` | conditional_order_groups |
| `conditional_order_groups.state` | `ACTIVE`, `CANCELED`, `CANCELING`, `CLOSED`, `COMPENSATING`, `CREATED`, `DEGRADED_RECONCILIATION_REQUIRED`, `ERROR`, `OVERFILLED`, `PARTIALLY_EXECUTED`, `SUBMITTING`, `UPDATING`, `VALIDATED` | conditional_order_groups |
| `copy_event_outbox.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | copy_event_outbox |
| `copy_event_outbox.status` | `DEAD_LETTER`, `DISABLED`, `PENDING`, `PUBLISHED`, `PUBLISHING` | copy_event_outbox |
| `copy_publish_policies.mode` | `*`, `backtest`, `live`, `paper`, `replay`, `sandbox` | copy_publish_policies |
| `dnse_trading_tokens.token_status` | `ACTIVE`, `EXPIRED`, `REVOKED` | dnse_trading_tokens |
| `domain_events.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | domain_events |
| `engine_authority_decisions.authoritative_backend` | `PYTHON`, `RUST` | engine_authority_decisions |
| `engine_authority_decisions.state` | `DECIDED`, `EVALUATING`, `FAILED` | engine_authority_decisions |
| `engine_authority_scopes.authoritative_backend` | `PYTHON`, `RUST` | engine_authority_scopes |
| `engine_authority_scopes.lifecycle_state` | `ACTIVE`, `DRAINING`, `HALTED` | engine_authority_scopes |
| `engine_authority_scopes.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | engine_authority_scopes |
| `engine_authority_scopes.rollout_state` | `PYTHON_AUTHORITATIVE`, `PYTHON_WITH_RUST_SHADOW`, `RUST_AUTHORITATIVE_PAPER_SCOPE`, `RUST_WITH_PYTHON_SHADOW_PAPER_CANARY`, `SANDBOX_PREFLIGHT_CANARY` | engine_authority_scopes |
| `execution_command_outbox.command_type` | `AMEND`, `CANCEL`, `COMPENSATE`, `PLACE` | execution_command_outbox |
| `execution_command_outbox.state` | `ACKNOWLEDGED`, `DEAD`, `DISPATCHED`, `DISPATCHING`, `PENDING` | execution_command_outbox |
| `execution_replay_jobs.status` | `COMPLETED`, `FAILED`, `PENDING`, `RUNNING` | execution_replay_jobs |
| `fills.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | fills |
| `fills.side` | `BUY`, `SELL` | fills |
| `funding_accruals.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | funding_accruals |
| `margin_ledger.margin_mode` | `CROSS`, `ISOLATED` | margin_ledger |
| `operator_operations.scope_type` | `ACCOUNT`, `ALPHA` | operator_operations |
| `operator_operations.status` | `FAILED`, `INTENTS_QUEUED`, `PARTIAL`, `PLANNED`, `VERIFIED` | operator_operations |
| `order_bracket_legs.leg_type` | `ENTRY`, `STOP`, `TP`, `TRAILING` | order_bracket_legs |
| `order_bracket_legs.side` | `BUY`, `SELL` | order_bracket_legs |
| `order_brackets.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | order_brackets |
| `order_brackets.state` | `ACTIVE`, `CANCELLED`, `CLOSED`, `CLOSING`, `CREATED`, `ENTRY_FILLED`, `ENTRY_SUBMITTED`, `ERROR`, `PARTIALLY_CLOSED` | order_brackets |
| `order_group_event_inbox.state` | `DEAD`, `PENDING`, `PROCESSED`, `PROCESSING` | order_group_event_inbox |
| `orders.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | orders |
| `orders.side` | `BUY`, `SELL` | orders |
| `paper_matcher_config.default_settlement_policy` | `IMMEDIATE`, `VN_T_PLUS` | paper_matcher_config |
| `paper_open_orders.side` | `BUY`, `SELL` | paper_open_orders |
| `performance_projection_current_state.scope_type` | `ACCOUNT`, `PORTFOLIO` | performance_projection_current_state |
| `performance_snapshots.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | performance_snapshots |
| `portfolio_allocations.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | portfolio_allocations |
| `portfolio_allocations.state` | `ACTIVE`, `ARCHIVED`, `HALTED`, `REDUCING` | portfolio_allocations |
| `portfolio_capital_ledger.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | portfolio_capital_ledger |
| `portfolio_capital_ledger.movement_type` | `ADJUST`, `ALLOCATE`, `INITIAL_ALLOCATE`, `REBALANCE`, `WITHDRAW` | portfolio_capital_ledger |
| `portfolios.state` | `ACTIVE`, `ARCHIVED`, `HALTED`, `REDUCING` | portfolios |
| `positions_v2.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | positions_v2 |
| `positions_v2.side` | `FLAT`, `LONG`, `SHORT` | positions_v2 |
| `reconciliation_findings.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | reconciliation_findings |
| `reconciliation_findings.severity` | `CRITICAL`, `ERROR`, `INFO`, `WARNING` | reconciliation_findings |
| `reconciliation_findings.status` | `ACKED`, `OPEN`, `RESOLVED` | reconciliation_findings |
| `risk_profiles.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | risk_profiles |
| `risk_profiles.trading_state` | `ACTIVE`, `HALTED`, `REDUCING` | risk_profiles |
| `schema_migration_ledger.apply_mode` | `APPLIED`, `BASELINED` | schema_migration_ledger |
| `schema_object_ownership.object_type` | `MATERIALIZED_VIEW`, `TABLE`, `VIEW` | schema_object_ownership |
| `service_heartbeats.status` | `DEGRADED`, `FAILED`, `READY`, `STARTING`, `STOPPING` | service_heartbeats |
| `settlement_buckets.bucket_type` | `AVAILABLE`, `LOCKED`, `PAYABLE`, `RECEIVABLE` | settlement_buckets |
| `settlements.direction` | `PAYABLE`, `RECEIVABLE` | settlements |
| `settlements.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | settlements |
| `settlements.settlement_type` | `CASH`, `SECURITY` | settlements |
| `settlements.status` | `CANCELED`, `FAILED`, `SCHEDULED`, `SETTLED` | settlements |
| `storage_archive_manifests.status` | `FAILED`, `PURGED`, `RESTORE_VERIFIED`, `VERIFIED`, `WRITTEN` | storage_archive_manifests |
| `strategy_deployments.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | strategy_deployments |
| `venue_credentials.mode` | `backtest`, `live`, `paper`, `replay`, `sandbox` | venue_credentials |
| `venue_rate_limits.window_kind` | `DAY`, `HOUR`, `MINUTE`, `SECOND` | venue_rate_limits |

## Python enums

| Enum | Values | Source |
|---|---|---|
| `TradingMode` | `paper`, `sandbox`, `live`, `replay`, `backtest` | domain/enums.py:11 |
| `AccountType` | `CASH`, `MARGIN`, `BETTING` | domain/enums.py:19 |
| `OrderSide` | `BUY`, `SELL` | domain/enums.py:25 |
| `PositionSide` | `FLAT`, `LONG`, `SHORT`, `BOTH` | domain/enums.py:34 |
| `OrderType` | `MARKET`, `LIMIT`, `STOP_MARKET`, `STOP_LIMIT`, `TAKE_PROFIT`, `TAKE_PROFIT_MARKET`, `TRAILING_STOP_MARKET`, `ATO`, `ATC` | domain/enums.py:41 |
| `TimeInForce` | `GTC`, `IOC`, `FOK`, `GTD`, `GTX` | domain/enums.py:53 |
| `OrderStatus` | `INITIALIZED`, `SUBMITTED`, `ACCEPTED`, `REJECTED`, `DENIED`, `PENDING_UPDATE`, `PENDING_CANCEL`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `EXPIRED`, `TRIGGERED` | domain/enums.py:61 |
| `LiquiditySide` | `MAKER`, `TAKER`, `UNKNOWN` | domain/enums.py:76 |
| `TradingState` | `ACTIVE`, `REDUCING`, `HALTED` | domain/enums.py:82 |
| `SettlementPolicy` | `IMMEDIATE`, `VN_T_PLUS` | domain/enums.py:88 |
| `SettlementStatus` | `SCHEDULED`, `SETTLED`, `FAILED`, `CANCELED` | domain/enums.py:93 |
| `ContingencyType` | `NONE`, `OTO`, `OCO`, `OUO`, `BRACKET` | domain/order_groups.py:11 |
| `GroupState` | `CREATED`, `VALIDATED`, `SUBMITTING`, `ACTIVE`, `PARTIALLY_EXECUTED`, `CANCELING`, `UPDATING`, `OVERFILLED`, `COMPENSATING`, `CLOSED`, `CANCELED`, `DEGRADED_RECONCILIATION_REQUIRED`, `ERROR` | domain/order_groups.py:19 |
| `LegState` | `WAITING`, `PENDING_SUBMIT`, `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `PENDING_CANCEL`, `CANCELED`, `REJECTED`, `EXPIRED` | domain/order_groups.py:35 |
| `ExecutionTrigger` | `ON_FIRST_FILL`, `ON_FULL_FILL`, `ON_TARGET_QUANTITY`, `ON_TERMINAL` | domain/order_groups.py:47 |
| `RemainderPolicy` | `KEEP_REMAINDER`, `CANCEL_REMAINDER` | domain/order_groups.py:54 |
| `LateFillPolicy` | `HALT_AND_RECONCILE`, `AUTO_REDUCE_EXCESS`, `ACCEPT_WITHIN_MAX_EXPOSURE` | domain/order_groups.py:59 |
| `EffectType` | `PLACE`, `CANCEL`, `AMEND`, `COMPENSATE` | domain/order_groups.py:65 |
| `RiskDenyReason` | `TRADING_HALTED`, `REDUCE_ONLY_REQUIRED`, `INSTRUMENT_NOT_FOUND`, `SESSION_CLOSED`, `PRICE_INVALID`, `QUANTITY_INVALID`, `NOTIONAL_LIMIT`, `EXPOSURE_LIMIT`, `INSUFFICIENT_BALANCE`, `RATE_LIMIT` | domain/risk.py:13 |
| `StreamDataClass` | `DURABLE_COMMAND`, `DURABLE_EVENT_PROJECTION`, `DELIVERY_OUTBOX`, `EPHEMERAL_TELEMETRY` | services/command_journal/stream_policy.py:10 |
| `RetentionMode` | `ACK_AUTHORITY_MINID`, `APPROXIMATE_MAXLEN`, `DISABLED` | services/command_journal/stream_policy.py:17 |
| `ReplayEventType` | `MARKET_EVENT`, `EXECUTION_COMMAND`, `EXECUTION_EVENT`, `GROUP_DEFINE`, `GROUP_EVENT`, `RISK_DECISION`, `RESERVATION`, `ACCOUNTING_EVENT`, `FUNDING_EVENT`, `FEE_EVENT`, `MARGIN_EVENT` | services/replay/contracts.py:14 |
