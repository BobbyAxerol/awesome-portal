# Payload models (source-derived — OpenAPI declares no requestBody)

85 models / 468 fields from 32 modules.

### `Account` — dataclass  
<sub>domain/accounts.py:68</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `id` | `AccountId` | **yes** | — | — |
| `type` | `AccountType` | **yes** | — | — |
| `base_currency` | `Currency | None` | no | — | — |
| `balances_by_currency` | `dict[Currency, AccountBalance]` | no | `field(default_factory=dict)` | — |
| `commissions_by_currency` | `dict[Currency, Money]` | no | `field(default_factory=dict)` | — |

### `AccountBalance` — dataclass  
<sub>domain/accounts.py:17</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `total` | `Money` | **yes** | — | — |
| `locked` | `Money` | **yes** | — | — |
| `free` | `Money` | **yes** | — | — |

### `CashAccount` — dataclass  
<sub>domain/accounts.py:104</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `allow_borrowing` | `bool` | no | `False` | — |
| `balances_locked_by_instrument` | `dict[tuple[InstrumentId, Currency], Money]` | no | `field(default_factory=dict)` | — |

### `MarginAccount` — dataclass  
<sub>domain/accounts.py:124</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `margins_by_instrument` | `dict[InstrumentId, MarginBalance]` | no | `field(default_factory=dict)` | — |
| `account_margins_by_currency` | `dict[Currency, MarginBalance]` | no | `field(default_factory=dict)` | — |
| `leverages` | `dict[InstrumentId, Decimal]` | no | `field(default_factory=dict)` | — |
| `default_leverage` | `Decimal` | no | `Decimal('1')` | — |

### `MarginBalance` — dataclass  
<sub>domain/accounts.py:54</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `initial` | `Money` | **yes** | — | — |
| `maintenance` | `Money` | **yes** | — | — |
| `currency` | `Currency` | **yes** | — | — |
| `instrument_id` | `InstrumentId | None` | no | `None` | — |

### `DecisionEvidence` — dataclass  
<sub>domain/canonical.py:208</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `engine_version` | `str` | **yes** | — | — |
| `contract_version` | `str` | **yes** | — | — |
| `instrument_metadata_version` | `str` | **yes** | — | — |
| `decision_digest` | `str` | **yes** | — | — |

### `FixedClock` — dataclass  
<sub>domain/clocks.py:22</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `TimestampNs` | **yes** | — | — |

### `AccountType` — enum  
<sub>domain/enums.py:19</sub>

Members: `CASH='CASH'`, `MARGIN='MARGIN'`, `BETTING='BETTING'`

### `LiquiditySide` — enum  
<sub>domain/enums.py:76</sub>

Members: `MAKER='MAKER'`, `TAKER='TAKER'`, `UNKNOWN='UNKNOWN'`

### `OrderSide` — enum  
<sub>domain/enums.py:25</sub>

Members: `BUY='BUY'`, `SELL='SELL'`

### `OrderStatus` — enum  
<sub>domain/enums.py:61</sub>

Members: `INITIALIZED='INITIALIZED'`, `SUBMITTED='SUBMITTED'`, `ACCEPTED='ACCEPTED'`, `REJECTED='REJECTED'`, `DENIED='DENIED'`, `PENDING_UPDATE='PENDING_UPDATE'`, `PENDING_CANCEL='PENDING_CANCEL'`, `PARTIALLY_FILLED='PARTIALLY_FILLED'`, `FILLED='FILLED'`, `CANCELED='CANCELED'`, `EXPIRED='EXPIRED'`, `TRIGGERED='TRIGGERED'`

### `OrderType` — enum  
<sub>domain/enums.py:41</sub>

Members: `MARKET='MARKET'`, `LIMIT='LIMIT'`, `STOP_MARKET='STOP_MARKET'`, `STOP_LIMIT='STOP_LIMIT'`, `TAKE_PROFIT='TAKE_PROFIT'`, `TAKE_PROFIT_MARKET='TAKE_PROFIT_MARKET'`, `TRAILING_STOP_MARKET='TRAILING_STOP_MARKET'`, `ATO='ATO'`, `ATC='ATC'`

### `PositionSide` — enum  
<sub>domain/enums.py:34</sub>

Members: `FLAT='FLAT'`, `LONG='LONG'`, `SHORT='SHORT'`, `BOTH='BOTH'`

### `SettlementPolicy` — enum  
<sub>domain/enums.py:88</sub>

Members: `IMMEDIATE='IMMEDIATE'`, `VN_T_PLUS='VN_T_PLUS'`

### `SettlementStatus` — enum  
<sub>domain/enums.py:93</sub>

Members: `SCHEDULED='SCHEDULED'`, `SETTLED='SETTLED'`, `FAILED='FAILED'`, `CANCELED='CANCELED'`

### `TimeInForce` — enum  
<sub>domain/enums.py:53</sub>

Members: `GTC='GTC'`, `IOC='IOC'`, `FOK='FOK'`, `GTD='GTD'`, `GTX='GTX'`

### `TradingMode` — enum  
<sub>domain/enums.py:11</sub>

Members: `PAPER='paper'`, `SANDBOX='sandbox'`, `LIVE='live'`, `REPLAY='replay'`, `BACKTEST='backtest'`

### `TradingState` — enum  
<sub>domain/enums.py:82</sub>

Members: `ACTIVE='ACTIVE'`, `REDUCING='REDUCING'`, `HALTED='HALTED'`

### `AccountState` — dataclass  
<sub>domain/events.py:48</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `account_id` | `AccountId` | **yes** | — | — |
| `account_type` | `AccountType` | **yes** | — | — |
| `base_currency` | `Currency | None` | no | — | — |
| `reported` | `bool` | **yes** | — | — |
| `balances` | `list` | **yes** | — | — |
| `margins` | `list` | **yes** | — | — |
| `info` | `dict[str, Any]` | no | `field(default_factory=dict)` | — |

### `DomainEvent` — dataclass  
<sub>domain/events.py:15</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `ts_event` | `TimestampNs` | **yes** | — | — |
| `ts_init` | `TimestampNs` | **yes** | — | — |
| `event_id` | `str` | no | `field(default_factory=lambda: str(uuid4()))` | — |
| `raw` | `dict[str, Any] | None` | no | `None` | — |

### `OrderEvent` — dataclass  
<sub>domain/events.py:23</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `trader_id` | `TraderId` | **yes** | — | — |
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `instrument_id` | `InstrumentId` | **yes** | — | — |
| `client_order_id` | `ClientOrderId` | **yes** | — | — |
| `status` | `OrderStatus` | **yes** | — | — |

### `OrderFilled` — dataclass  
<sub>domain/events.py:32</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `venue_order_id` | `VenueOrderId` | **yes** | — | — |
| `account_id` | `AccountId` | **yes** | — | — |
| `trade_id` | `TradeId` | **yes** | — | — |
| `position_id` | `PositionId | None` | no | — | — |
| `order_side` | `OrderSide` | **yes** | — | — |
| `order_type` | `OrderType` | **yes** | — | — |
| `last_qty` | `Quantity` | **yes** | — | — |
| `last_px` | `Price` | **yes** | — | — |
| `currency` | `Currency` | **yes** | — | — |
| `commission` | `Money` | **yes** | — | — |
| `liquidity_side` | `LiquiditySide` | no | `LiquiditySide.UNKNOWN` | — |
| `status` | `OrderStatus` | no | `OrderStatus.PARTIALLY_FILLED` | — |

### `PositionEvent` — dataclass  
<sub>domain/events.py:59</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `trader_id` | `TraderId` | **yes** | — | — |
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `instrument_id` | `InstrumentId` | **yes** | — | — |
| `position_id` | `PositionId` | **yes** | — | — |
| `account_id` | `AccountId` | **yes** | — | — |
| `side` | `PositionSide` | **yes** | — | — |
| `signed_qty` | `str` | **yes** | — | — |
| `quantity` | `Quantity` | **yes** | — | — |

### `BasisPointFeeModel` — dataclass  
<sub>domain/fees.py:19</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `maker_bps` | `Decimal` | **yes** | — | — |
| `taker_bps` | `Decimal` | **yes** | — | — |

### `AccountId` — dataclass  
<sub>domain/identifiers.py:42</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `ClientOrderId` — dataclass  
<sub>domain/identifiers.py:86</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `InstrumentId` — dataclass  
<sub>domain/identifiers.py:64</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `symbol` | `str` | **yes** | — | — |
| `venue` | `Venue` | **yes** | — | — |

### `PositionId` — dataclass  
<sub>domain/identifiers.py:108</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `StrategyId` — dataclass  
<sub>domain/identifiers.py:31</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `TradeId` — dataclass  
<sub>domain/identifiers.py:119</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `TraderId` — dataclass  
<sub>domain/identifiers.py:20</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `Venue` — dataclass  
<sub>domain/identifiers.py:53</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `VenueOrderId` — dataclass  
<sub>domain/identifiers.py:97</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `str` | **yes** | — | — |

### `CanonicalInstrumentId` — dataclass  
<sub>domain/instrument_identity.py:84</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `venue` | `str` | **yes** | — | — |
| `product` | `str` | **yes** | — | — |
| `symbol` | `str` | **yes** | — | — |
| `venue_symbol` | `str` | **yes** | — | — |

### `Instrument` — dataclass  
<sub>domain/instruments.py:15</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `id` | `InstrumentId` | **yes** | — | — |
| `asset_class` | `str` | **yes** | — | — |
| `base_currency` | `Currency | None` | no | — | — |
| `quote_currency` | `Currency | None` | no | — | — |
| `settlement_currency` | `Currency` | **yes** | — | — |
| `price_precision` | `int` | **yes** | — | — |
| `size_precision` | `int` | **yes** | — | — |
| `tick_size` | `Decimal | None` | no | `None` | — |
| `lot_size` | `Decimal | None` | no | `None` | — |
| `min_qty` | `Decimal | None` | no | `None` | — |
| `max_qty` | `Decimal | None` | no | `None` | — |
| `min_notional` | `Decimal | None` | no | `None` | — |
| `multiplier` | `Decimal` | no | `Decimal('1')` | — |
| `margin_init` | `Decimal` | no | `Decimal('1')` | — |
| `margin_maint` | `Decimal` | no | `Decimal('1')` | — |
| `trading_sessions` | `dict` | no | `field(default_factory=dict)` | — |
| `allowed_order_types` | `frozenset[OrderType]` | no | `field(default_factory=frozenset)` | — |
| `raw_metadata` | `dict` | no | `field(default_factory=dict)` | — |

### `MarketMetadata` — dataclass  
<sub>domain/market_metadata.py:20</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `step_size` | `str` | **yes** | — | — |
| `tick_size` | `str` | **yes** | — | — |
| `precision_amount` | `int` | **yes** | — | — |
| `source` | `str` | **yes** | — | — |
| `venue` | `str` | **yes** | — | — |
| `symbol` | `str` | **yes** | — | — |
| `lot_size` | `str | None` | no | `None` | — |
| `min_qty` | `str | None` | no | `None` | — |
| `max_qty` | `str | None` | no | `None` | — |
| `min_notional` | `str | None` | no | `None` | — |
| `multiplier` | `str` | no | `'1'` | — |
| `asset_class` | `str | None` | no | `None` | — |

### `Currency` — dataclass  
<sub>domain/objects.py:30</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `code` | `str` | **yes** | — | — |
| `precision` | `int` | no | `8` | — |

### `Money` — dataclass  
<sub>domain/objects.py:46</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `raw` | `Decimal` | **yes** | — | — |
| `currency` | `Currency` | **yes** | — | — |

### `Price` — dataclass  
<sub>domain/objects.py:84</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `raw` | `Decimal` | **yes** | — | — |
| `precision` | `int` | **yes** | — | — |

### `Quantity` — dataclass  
<sub>domain/objects.py:101</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `raw` | `Decimal` | **yes** | — | — |
| `precision` | `int` | **yes** | — | — |

### `TimestampNs` — dataclass  
<sub>domain/objects.py:129</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `value` | `int` | **yes** | — | — |

### `ConditionalOrderGroupState` — dataclass  
<sub>domain/order_groups.py:94</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `group_id` | `str` | **yes** | — | — |
| `contingency_type` | `ContingencyType` | **yes** | — | — |
| `state` | `GroupState` | **yes** | — | — |
| `legs` | `dict[str, OrderGroupLegState]` | **yes** | — | — |
| `execution_trigger` | `ExecutionTrigger` | no | `ExecutionTrigger.ON_FIRST_FILL` | — |
| `remainder_policy` | `RemainderPolicy` | no | `RemainderPolicy.KEEP_REMAINDER` | — |
| `late_fill_policy` | `LateFillPolicy` | no | `LateFillPolicy.HALT_AND_RECONCILE` | — |
| `target_quantity` | `Decimal | None` | no | `None` | — |
| `max_exposure_quantity` | `Decimal | None` | no | `None` | — |
| `winner_leg_id` | `str | None` | no | `None` | — |
| `metadata` | `dict[str, Any]` | no | `field(default_factory=dict)` | — |

### `ContingencyType` — enum  
<sub>domain/order_groups.py:11</sub>

Members: `NONE='NONE'`, `OTO='OTO'`, `OCO='OCO'`, `OUO='OUO'`, `BRACKET='BRACKET'`

### `EffectType` — enum  
<sub>domain/order_groups.py:65</sub>

Members: `PLACE='PLACE'`, `CANCEL='CANCEL'`, `AMEND='AMEND'`, `COMPENSATE='COMPENSATE'`

### `ExecutionTrigger` — enum  
<sub>domain/order_groups.py:47</sub>

Members: `ON_FIRST_FILL='ON_FIRST_FILL'`, `ON_FULL_FILL='ON_FULL_FILL'`, `ON_TARGET_QUANTITY='ON_TARGET_QUANTITY'`, `ON_TERMINAL='ON_TERMINAL'`

### `GroupState` — enum  
<sub>domain/order_groups.py:19</sub>

Members: `CREATED='CREATED'`, `VALIDATED='VALIDATED'`, `SUBMITTING='SUBMITTING'`, `ACTIVE='ACTIVE'`, `PARTIALLY_EXECUTED='PARTIALLY_EXECUTED'`, `CANCELING='CANCELING'`, `UPDATING='UPDATING'`, `OVERFILLED='OVERFILLED'`, `COMPENSATING='COMPENSATING'`, `CLOSED='CLOSED'`, `CANCELED='CANCELED'`, `DEGRADED_RECONCILIATION_REQUIRED='DEGRADED_RECONCILIATION_REQUIRED'`, `ERROR='ERROR'`

### `LateFillPolicy` — enum  
<sub>domain/order_groups.py:59</sub>

Members: `HALT_AND_RECONCILE='HALT_AND_RECONCILE'`, `AUTO_REDUCE_EXCESS='AUTO_REDUCE_EXCESS'`, `ACCEPT_WITHIN_MAX_EXPOSURE='ACCEPT_WITHIN_MAX_EXPOSURE'`

### `LegState` — enum  
<sub>domain/order_groups.py:35</sub>

Members: `WAITING='WAITING'`, `PENDING_SUBMIT='PENDING_SUBMIT'`, `OPEN='OPEN'`, `PARTIALLY_FILLED='PARTIALLY_FILLED'`, `FILLED='FILLED'`, `PENDING_CANCEL='PENDING_CANCEL'`, `CANCELED='CANCELED'`, `REJECTED='REJECTED'`, `EXPIRED='EXPIRED'`

### `OrderGroupEffect` — dataclass  
<sub>domain/order_groups.py:120</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `effect_type` | `EffectType` | **yes** | — | — |
| `leg_id` | `str` | **yes** | — | — |
| `payload` | `dict[str, Any]` | **yes** | — | — |
| `reason` | `str` | **yes** | — | — |

### `OrderGroupEvent` — dataclass  
<sub>domain/order_groups.py:109</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `event_id` | `str` | **yes** | — | — |
| `event_type` | `str` | **yes** | — | — |
| `leg_id` | `str` | **yes** | — | — |
| `status` | `str | None` | no | `None` | — |
| `fill_quantity` | `Decimal` | no | `Decimal('0')` | — |
| `cumulative_quantity` | `Decimal | None` | no | `None` | — |
| `payload` | `dict[str, Any]` | no | `field(default_factory=dict)` | — |

### `OrderGroupLegState` — dataclass  
<sub>domain/order_groups.py:81</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `leg_id` | `str` | **yes** | — | — |
| `client_order_id` | `str` | **yes** | — | — |
| `quantity` | `Decimal` | **yes** | — | — |
| `state` | `LegState` | no | `LegState.WAITING` | — |
| `filled_quantity` | `Decimal` | no | `Decimal('0')` | — |
| `average_fill_price` | `Decimal | None` | no | `None` | — |
| `parent_leg_id` | `str | None` | no | `None` | — |
| `role` | `str` | no | `'MEMBER'` | — |
| `payload` | `dict[str, Any]` | no | `field(default_factory=dict)` | — |

### `RemainderPolicy` — enum  
<sub>domain/order_groups.py:54</sub>

Members: `KEEP_REMAINDER='KEEP_REMAINDER'`, `CANCEL_REMAINDER='CANCEL_REMAINDER'`

### `TransitionResult` — dataclass  
<sub>domain/order_groups.py:128</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `group` | `ConditionalOrderGroupState` | **yes** | — | — |
| `effects` | `tuple[OrderGroupEffect, ...]` | **yes** | — | — |

### `CancelAllOrders` — dataclass  
<sub>domain/orders.py:104</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `account_id` | `AccountId | None` | no | `None` | — |
| `instrument_id` | `InstrumentId | None` | no | `None` | — |

### `CancelOrder` — dataclass  
<sub>domain/orders.py:97</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `account_id` | `AccountId` | **yes** | — | — |
| `client_order_id` | `ClientOrderId` | **yes** | — | — |

### `ClosePosition` — dataclass  
<sub>domain/orders.py:111</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `account_id` | `AccountId` | **yes** | — | — |
| `position_id` | `PositionId` | **yes** | — | — |
| `quantity` | `Quantity | None` | no | `None` | — |

### `ModifyOrder` — dataclass  
<sub>domain/orders.py:86</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `account_id` | `AccountId` | **yes** | — | — |
| `client_order_id` | `ClientOrderId` | **yes** | — | — |
| `new_client_order_id` | `ClientOrderId` | **yes** | — | — |
| `quantity` | `Quantity | None` | no | `None` | — |
| `price` | `Price | None` | no | `None` | — |
| `trigger_price` | `Price | None` | no | `None` | — |

### `Order` — dataclass  
<sub>domain/orders.py:119</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `client_order_id` | `ClientOrderId` | **yes** | — | — |
| `instrument_id` | `InstrumentId` | **yes** | — | — |
| `side` | `OrderSide` | **yes** | — | — |
| `order_type` | `OrderType` | **yes** | — | — |
| `quantity` | `Quantity` | **yes** | — | — |
| `status` | `OrderStatus` | no | `OrderStatus.INITIALIZED` | — |
| `venue_order_id` | `VenueOrderId | None` | no | `None` | — |
| `filled_qty` | `Quantity | None` | no | `None` | — |

### `SubmitOrder` — dataclass  
<sub>domain/orders.py:48</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `trader_id` | `TraderId` | **yes** | — | — |
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `account_id` | `AccountId` | **yes** | — | — |
| `mode` | `TradingMode` | **yes** | — | — |
| `venue` | `Venue` | **yes** | — | — |
| `instrument_id` | `InstrumentId` | **yes** | — | — |
| `client_order_id` | `ClientOrderId` | **yes** | — | — |
| `side` | `OrderSide` | **yes** | — | — |
| `order_type` | `OrderType` | **yes** | — | — |
| `quantity` | `Quantity` | **yes** | — | — |
| `position_side` | `PositionSide` | no | `PositionSide.BOTH` | — |
| `price` | `Price | None` | no | `None` | — |
| `trigger_price` | `Price | None` | no | `None` | — |
| `time_in_force` | `TimeInForce` | no | `TimeInForce.GTC` | — |
| `reduce_only` | `bool` | no | `False` | — |
| `post_only` | `bool` | no | `False` | — |
| `ts_init` | `TimestampNs | None` | no | `None` | — |

### `SubmitOrderList` — dataclass  
<sub>domain/orders.py:77</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `orders` | `tuple[SubmitOrder, ...]` | **yes** | — | — |

### `Position` — dataclass  
<sub>domain/positions.py:17</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `trader_id` | `TraderId` | **yes** | — | — |
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `instrument_id` | `InstrumentId` | **yes** | — | — |
| `id` | `PositionId` | **yes** | — | — |
| `account_id` | `AccountId` | **yes** | — | — |
| `price_precision` | `int` | **yes** | — | — |
| `size_precision` | `int` | **yes** | — | — |
| `settlement_currency` | `Currency` | **yes** | — | — |
| `multiplier` | `Decimal` | no | `Decimal('1')` | — |
| `side` | `PositionSide` | no | `PositionSide.FLAT` | — |
| `signed_qty` | `Decimal` | no | `Decimal('0')` | — |
| `quantity` | `Quantity | None` | no | `None` | — |
| `peak_qty` | `Quantity | None` | no | `None` | — |
| `avg_px_open` | `Decimal` | no | `Decimal('0')` | — |
| `realized_pnl` | `Money | None` | no | `None` | — |
| `trade_ids` | `set[TradeId]` | no | `field(default_factory=set)` | — |
| `events` | `list[OrderFilled]` | no | `field(default_factory=list)` | — |

### `RiskDenyReason` — enum  
<sub>domain/risk.py:13</sub>

Members: `TRADING_HALTED='TRADING_HALTED'`, `REDUCE_ONLY_REQUIRED='REDUCE_ONLY_REQUIRED'`, `INSTRUMENT_NOT_FOUND='INSTRUMENT_NOT_FOUND'`, `SESSION_CLOSED='SESSION_CLOSED'`, `PRICE_INVALID='PRICE_INVALID'`, `QUANTITY_INVALID='QUANTITY_INVALID'`, `NOTIONAL_LIMIT='NOTIONAL_LIMIT'`, `EXPOSURE_LIMIT='EXPOSURE_LIMIT'`, `INSUFFICIENT_BALANCE='INSUFFICIENT_BALANCE'`, `RATE_LIMIT='RATE_LIMIT'`

### `RiskProfile` — dataclass  
<sub>domain/risk.py:27</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `strategy_id` | `StrategyId` | **yes** | — | — |
| `mode` | `TradingMode` | **yes** | — | — |
| `venue` | `Venue` | **yes** | — | — |
| `instrument_id` | `InstrumentId | None` | no | `None` | — |
| `trading_state` | `TradingState` | no | `TradingState.ACTIVE` | — |
| `max_notional_order` | `Decimal | None` | no | `None` | — |
| `max_notional_position` | `Decimal | None` | no | `None` | — |
| `max_leverage` | `Decimal | None` | no | `None` | — |
| `max_order_per_second` | `int | None` | no | `None` | — |
| `max_order_per_minute` | `int | None` | no | `None` | — |
| `max_daily_loss` | `Decimal | None` | no | `None` | — |
| `max_drawdown` | `Decimal | None` | no | `None` | — |
| `allowed_order_types` | `frozenset[OrderType]` | no | `field(default_factory=frozenset)` | — |

### `FixedBusinessDaySettlementPolicy` — dataclass  
<sub>domain/settlements.py:45</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `days` | `int` | **yes** | — | — |
| `policy` | `SettlementPolicy` | no | `SettlementPolicy.VN_T_PLUS` | — |

### `ImmediateSettlementPolicy` — dataclass  
<sub>domain/settlements.py:37</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `policy` | `SettlementPolicy` | no | `SettlementPolicy.IMMEDIATE` | — |

### `SettlementInstruction` — dataclass  
<sub>domain/settlements.py:15</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `account_id` | `AccountId` | **yes** | — | — |
| `strategy_id` | `StrategyId | None` | no | — | — |
| `venue` | `Venue` | **yes** | — | — |
| `instrument_id` | `InstrumentId | None` | no | — | — |
| `policy` | `SettlementPolicy` | **yes** | — | — |
| `trade_date` | `date` | **yes** | — | — |
| `settlement_date` | `date` | **yes** | — | — |
| `status` | `SettlementStatus` | **yes** | — | — |
| `currency` | `Currency | None` | no | `None` | — |
| `quantity` | `Decimal | None` | no | `None` | — |
| `amount` | `Decimal | None` | no | `None` | — |

### `ArbPackageLeg` — pydantic_model  
<sub>services/gateway/schemas/arb_package_schema.py:17</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `symbol` | `str` | **yes** | — | — |
| `role` | `str` | **yes** | — | — |
| `side` | `str | None` | no | `None` | — |
| `target_qty` | `Decimal | None` | no | `None` | — |
| `quantity` | `Decimal | None` | no | `None` | — |
| `abs_qty` | `Decimal | None` | no | `None` | — |
| `reference_price` | `Decimal` | **yes** | — | — |
| `order_type` | `str` | no | `'MARKET'` | `'type'` |
| `price` | `Decimal | None` | no | `None` | — |
| `time_in_force` | `str` | no | `'GTC'` | — |
| `reduce_only` | `bool` | no | `False` | — |
| `position_side` | `str` | no | `'BOTH'` | — |
| `intent` | `str` | no | `'OPEN'` | — |
| `market_info` | `dict[str, Any]` | no | — | — |
| `metadata` | `dict[str, Any]` | no | — | — |

### `ArbPackageRequest` — pydantic_model  
<sub>services/gateway/schemas/arb_package_schema.py:70</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `alpha_id` | `str` | **yes** | — | — |
| `package_id` | `str | None` | no | `None` | — |
| `execution_session_id` | `str | None` | no | `None` | — |
| `cycle_key` | `str | None` | no | `None` | — |
| `account_id` | `str | None` | no | `None` | — |
| `mode` | `str` | no | `'paper'` | — |
| `venue` | `str` | no | `'BINANCE'` | `'exchange'` |
| `package_policy` | `str` | no | `'ATOMIC_ALL_OR_NONE'` | — |
| `order_type` | `str` | no | `'MARKET'` | — |
| `time_in_force` | `str` | no | `'GTC'` | — |
| `max_imbalance_bps` | `Decimal` | no | `Decimal('500')` | — |
| `submit` | `bool` | no | `True` | — |
| `alpha_send_ts` | `float` | no | — | — |
| `legs` | `list[ArbPackageLeg]` | **yes** | — | — |
| `metadata` | `dict[str, Any]` | no | — | — |

### `BracketEntry` — pydantic_model  
<sub>services/gateway/schemas/bracket_schema.py:17</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `type` | `str` | no | `'MARKET'` | — |
| `side` | `str` | **yes** | — | — |
| `quantity` | `Decimal` | **yes** | — | — |
| `price` | `Decimal | None` | no | `None` | — |
| `time_in_force` | `str` | no | `'GTC'` | — |
| `client_order_id` | `str | None` | no | `None` | — |

### `BracketLifecycleAuditRequest` — pydantic_model  
<sub>services/gateway/schemas/bracket_schema.py:182</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `alpha_id` | `str` | **yes** | — | — |
| `account_id` | `str` | **yes** | — | — |
| `mode` | `str` | **yes** | — | — |
| `venue` | `str` | **yes** | — | — |
| `symbol` | `str | None` | no | `None` | — |
| `policy` | `str` | no | `'SINGLE_POSITION_PROTECTION'` | — |
| `apply` | `bool` | no | `False` | — |
| `actor` | `str` | no | `'operator'` | — |
| `reason` | `str` | no | `'BRACKET_LIFECYCLE_REPAIR'` | — |
| `bracket_group_ids` | `list[str]` | no | — | — |

### `BracketOrderRequest` — pydantic_model  
<sub>services/gateway/schemas/bracket_schema.py:113</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `alpha_id` | `str` | **yes** | — | — |
| `bracket_group_id` | `str | None` | no | `None` | — |
| `symbol` | `str` | **yes** | — | — |
| `mode` | `str` | **yes** | — | — |
| `venue` | `str | None` | no | `None` | — |
| `exchange` | `str` | no | `'BINANCE'` | — |
| `account_id` | `str` | **yes** | — | — |
| `position_side` | `str` | no | `'BOTH'` | — |
| `entry` | `BracketEntry` | **yes** | — | — |
| `stop_loss` | `BracketStop | None` | no | `None` | — |
| `take_profits` | `list[BracketTakeProfit]` | no | — | — |
| `activation_policy` | `str` | no | `'SUBMIT_CHILDREN_AFTER_ENTRY_FILLED'` | — |
| `oco_policy` | `dict[str, Any]` | no | — | — |
| `execution_session_id` | `str | None` | no | `None` | — |
| `risk_grant_id` | `str | None` | no | `None` | — |
| `metadata` | `dict[str, Any]` | no | — | — |
| `alpha_send_ts` | `float` | no | — | — |

### `BracketStop` — pydantic_model  
<sub>services/gateway/schemas/bracket_schema.py:44</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `type` | `str` | no | `'STOP_MARKET'` | — |
| `trigger_price` | `Decimal | None` | no | `None` | — |
| `distance` | `Decimal | None` | no | `None` | — |
| `price` | `Decimal | None` | no | `None` | — |
| `quantity` | `Decimal | None` | no | `None` | — |
| `time_in_force` | `str` | no | `'GTC'` | — |
| `client_order_id` | `str | None` | no | `None` | — |

### `BracketStopReplaceRequest` — pydantic_model  
<sub>services/gateway/schemas/bracket_schema.py:170</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `trigger_price` | `Decimal` | **yes** | — | — |
| `price` | `Decimal | None` | no | `None` | — |
| `reason` | `str` | no | `'STOP_REPLACE'` | — |
| `metadata` | `dict[str, Any]` | no | — | — |

### `BracketTakeProfit` — pydantic_model  
<sub>services/gateway/schemas/bracket_schema.py:76</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `type` | `str` | no | `'TAKE_PROFIT_MARKET'` | — |
| `trigger_price` | `Decimal | None` | no | `None` | — |
| `distance` | `Decimal | None` | no | `None` | — |
| `price` | `Decimal | None` | no | `None` | — |
| `quantity` | `Decimal | None` | no | `None` | — |
| `quantity_fraction` | `Decimal | None` | no | `None` | — |
| `time_in_force` | `str` | no | `'GTC'` | — |
| `client_order_id` | `str | None` | no | `None` | — |

### `ConditionalOrderGroupRequest` — pydantic_model  
<sub>services/gateway/schemas/order_group_schema.py:45</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `group_id` | `str` | no | — | — |
| `alpha_id` | `str` | **yes** | — | — |
| `account_id` | `str` | **yes** | — | — |
| `execution_session_id` | `str | None` | no | `None` | — |
| `correlation_id` | `str | None` | no | `None` | — |
| `mode` | `str` | no | `'paper'` | — |
| `venue` | `str` | no | `'BINANCE'` | — |
| `symbol` | `str` | **yes** | — | — |
| `instrument_id` | `str | None` | no | `None` | — |
| `position_side` | `Literal['BOTH', 'LONG', 'SHORT']` | no | `'BOTH'` | — |
| `contingency_type` | `ContingencyType` | **yes** | — | — |
| `activation_policy` | `Literal['IMMEDIATE', 'ON_PARENT_FIRST_FILL', 'ON_PARENT_FULL_FILL']` | no | `'IMMEDIATE'` | — |
| `execution_trigger` | `ExecutionTrigger` | no | `ExecutionTrigger.ON_FIRST_FILL` | — |
| `remainder_policy` | `RemainderPolicy` | no | `RemainderPolicy.KEEP_REMAINDER` | — |
| `late_fill_policy` | `LateFillPolicy` | no | `LateFillPolicy.HALT_AND_RECONCILE` | — |
| `emulation_policy` | `Literal['AUTO', 'REQUIRE_NATIVE', 'INTERNAL']` | no | `'AUTO'` | — |
| `target_quantity` | `Decimal | None` | no | `None` | — |
| `max_exposure_quantity` | `Decimal | None` | no | `None` | — |
| `submit` | `bool` | no | `True` | — |
| `policy_version` | `int` | no | `1` | — |
| `legs` | `list[OrderGroupLegRequest]` | **yes** | — | — |
| `metadata` | `dict[str, Any]` | no | — | — |

### `OrderGroupLegRequest` — pydantic_model  
<sub>services/gateway/schemas/order_group_schema.py:18</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `leg_id` | `str` | no | — | — |
| `parent_leg_id` | `str | None` | no | `None` | — |
| `role` | `str` | no | `'MEMBER'` | — |
| `sequence` | `int` | no | `0` | — |
| `client_order_id` | `str` | **yes** | — | — |
| `side` | `Literal['BUY', 'SELL']` | **yes** | — | — |
| `position_side` | `Literal['BOTH', 'LONG', 'SHORT']` | no | `'BOTH'` | — |
| `order_type` | `str` | no | `'LIMIT'` | — |
| `quantity` | `Decimal` | **yes** | — | — |
| `price` | `Decimal | None` | no | `None` | — |
| `trigger_price` | `Decimal | None` | no | `None` | — |
| `time_in_force` | `str` | no | `'GTC'` | — |
| `good_till_date` | `int | None` | no | `None` | — |
| `trigger_reference` | `str` | no | `'MARK_PRICE'` | — |
| `intent` | `str` | no | `'OPEN'` | — |
| `reduce_only` | `bool` | no | `False` | — |
| `post_only` | `bool` | no | `False` | — |
| `activation_policy` | `Literal['IMMEDIATE', 'ON_PARENT_FIRST_FILL', 'ON_PARENT_FULL_FILL']` | no | `'IMMEDIATE'` | — |
| `metadata` | `dict[str, Any]` | no | — | — |

### `OrderGroupOperatorAction` — pydantic_model  
<sub>services/gateway/schemas/order_group_schema.py:141</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `reason` | `str` | **yes** | — | — |
| `expected_version` | `int | None` | no | `None` | — |

### `OrderGroupPatchRequest` — pydantic_model  
<sub>services/gateway/schemas/order_group_schema.py:133</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `expected_version` | `int | None` | no | `None` | — |
| `late_fill_policy` | `LateFillPolicy | None` | no | `None` | — |
| `remainder_policy` | `RemainderPolicy | None` | no | `None` | — |
| `max_exposure_quantity` | `Decimal | None` | no | `None` | — |
| `metadata` | `dict[str, Any]` | no | — | — |

### `AlphaOrder` — pydantic_model  
<sub>services/gateway/schemas/order_schema.py:9</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `alpha_id` | `str` | **yes** | — | — |
| `client_order_id` | `str` | **yes** | — | — |
| `execution_session_id` | `str | None` | no | `None` | — |
| `risk_grant_id` | `str | None` | no | `None` | — |
| `bracket_group_id` | `str | None` | no | `None` | — |
| `bracket_leg_type` | `str | None` | no | `None` | — |
| `bracket_leg_index` | `int | None` | no | `None` | — |
| `order_group_id` | `str | None` | no | `None` | — |
| `order_group_leg_id` | `str | None` | no | `None` | — |
| `symbol` | `str` | **yes** | — | — |
| `side` | `str` | **yes** | — | — |
| `position_side` | `str` | no | `'BOTH'` | — |
| `order_type` | `str` | **yes** | — | `'type'` |
| `quantity` | `float` | **yes** | — | — |
| `price` | `float | None` | no | `None` | — |
| `stop_price` | `float | None` | no | `None` | — |
| `trigger_price` | `float | None` | no | `None` | — |
| `trigger_type` | `str` | no | `'MARK_PRICE'` | — |
| `callback_rate` | `float | None` | no | `None` | — |
| `activation_price` | `float | None` | no | `None` | — |
| `close_position` | `bool` | no | `False` | — |
| `time_in_force` | `str` | no | `'GTC'` | — |
| `good_till_date` | `int | None` | no | `None` | — |
| `reduce_only` | `bool` | no | `False` | — |
| `post_only` | `bool` | no | `False` | — |
| `intent` | `str` | no | `'OPEN'` | — |
| `orig_client_order_id` | `str | None` | no | `None` | — |
| `new_client_order_id` | `str | None` | no | `None` | — |
| `comment` | `str | None` | no | `None` | — |
| `metadata` | `dict[str, Any]` | no | — | — |
| `reference_price` | `float | None` | no | `None` | — |
| `market_info` | `dict[str, Any] | None` | no | `None` | — |
| `product` | `str | None` | no | `None` | — |
| `venue_symbol` | `str | None` | no | `None` | — |
| `exchange` | `str` | no | `'BINANCE'` | — |
| `venue` | `str | None` | no | `None` | — |
| `account_id` | `str | None` | no | `None` | — |
| `account_index` | `int` | no | `0` | — |
| `mode` | `str | None` | no | `None` | — |
| `alpha_send_ts` | `float` | **yes** | — | — |
| `gateway_receive_ts` | `float` | no | — | — |

### `CancelOrderIntent` — pydantic_model  
<sub>services/gateway/schemas/order_schema.py:129</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `alpha_id` | `str` | **yes** | — | — |
| `client_order_id` | `str` | **yes** | — | — |
| `execution_session_id` | `str | None` | no | `None` | — |
| `risk_grant_id` | `str | None` | no | `None` | — |
| `order_group_id` | `str | None` | no | `None` | — |
| `order_group_leg_id` | `str | None` | no | `None` | — |
| `symbol` | `str` | **yes** | — | — |
| `side` | `str` | no | `'BUY'` | — |
| `position_side` | `str` | no | `'BOTH'` | — |
| `order_type` | `str` | no | `'LIMIT'` | `'type'` |
| `quantity` | `float` | no | `0` | — |
| `exchange` | `str` | no | `'BINANCE'` | — |
| `venue` | `str | None` | no | `None` | — |
| `account_id` | `str | None` | no | `None` | — |
| `account_index` | `int` | no | `0` | — |
| `mode` | `str | None` | no | `None` | — |
| `intent` | `str` | no | `'CANCEL'` | — |
| `alpha_send_ts` | `float` | no | — | — |
| `gateway_receive_ts` | `float` | no | — | — |
| `metadata` | `dict[str, Any]` | no | — | — |
| `product` | `str | None` | no | `None` | — |
| `venue_symbol` | `str | None` | no | `None` | — |

### `UpdateOrderIntent` — pydantic_model  
<sub>services/gateway/schemas/order_schema.py:114</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `alpha_id` | `str` | **yes** | — | — |
| `execution_session_id` | `str | None` | no | `None` | — |
| `risk_grant_id` | `str | None` | no | `None` | — |
| `symbol` | `str` | **yes** | — | — |
| `side` | `str` | **yes** | — | — |
| `orig_client_order_id` | `str` | **yes** | — | — |
| `new_client_order_id` | `str` | **yes** | — | — |
| `quantity` | `float` | **yes** | — | — |
| `price` | `float` | **yes** | — | — |
| `alpha_send_ts` | `float` | **yes** | — | — |
| `gateway_receive_ts` | `float` | no | — | — |

### `MarketDataAuthorityPolicy` — dataclass  
<sub>services/venues/contracts.py:8</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `venue` | `str` | **yes** | — | — |
| `product` | `str` | **yes** | — | — |
| `mode` | `str` | **yes** | — | — |
| `authoritative_sources` | `tuple[str, ...]` | **yes** | — | — |
| `require_live` | `bool` | **yes** | — | — |
| `require_timestamp` | `bool` | no | `True` | — |
| `allow_reference_fallback` | `bool` | no | `False` | — |

### `VenueProductProfile` — dataclass  
<sub>services/venues/contracts.py:19</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `venue` | `str` | **yes** | — | — |
| `product` | `str` | **yes** | — | — |
| `supported_modes` | `tuple[str, ...]` | **yes** | — | — |
| `execution_available` | `bool` | **yes** | — | — |
| `market_data_available` | `bool` | **yes** | — | — |
| `private_events_available` | `bool` | **yes** | — | — |
| `account_sync_available` | `bool` | **yes** | — | — |
| `reconciliation_available` | `bool` | **yes** | — | — |
| `position_modes` | `tuple[str, ...]` | **yes** | — | — |
| `credential_scope` | `str` | **yes** | — | — |
| `rate_limit_scope` | `str` | **yes** | — | — |
| `time_sync_scope` | `str` | **yes** | — | — |
| `rollout_state` | `str` | no | `'ACTIVE'` | — |

### `VenueRuntimeScope` — dataclass  
<sub>services/venues/runtime_scopes.py:10</sub>

| Field | Type | Req | Default | Alias |
|---|---|---|---|---|
| `venue` | `str` | **yes** | — | — |
| `product` | `str` | **yes** | — | — |
| `mode` | `str` | **yes** | — | — |
| `credential_ref` | `str` | **yes** | — | — |
| `credential_scope` | `str` | **yes** | — | — |
| `rate_limit_scope` | `str` | **yes** | — | — |
| `time_sync_scope` | `str` | **yes** | — | — |
| `clock_offset_ms` | `int` | no | `0` | — |
| `last_time_sync_ms` | `int` | no | `0` | — |
| `last_observed_weight` | `int` | no | `0` | — |
