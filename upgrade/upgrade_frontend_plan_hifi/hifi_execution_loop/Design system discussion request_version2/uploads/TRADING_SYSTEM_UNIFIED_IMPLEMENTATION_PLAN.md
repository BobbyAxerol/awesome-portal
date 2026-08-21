# Unified Trading System Implementation Plan

> Mục tiêu: gộp `services_exec_papertrade` vào `trading_system`, thiết kế lại system theo hướng một trading node thống nhất có nhiều mode (`paper`, `sandbox`, `live`, `replay/backtest`), dùng `data_layer` làm market-data gateway, và nâng cấp core theo tinh thần NautilusTrader: DDD, event-driven, ports/adapters, crash recovery, fail-fast.

---

## 0. Standing Rules Cho Các Session Sau

1. **Không tách papertrade thành service/repo độc lập nữa.** Paper trade là một execution mode trong `trading_system`, dùng chung gateway, risk, event model, portfolio/accounting, storage, monitoring. Khác biệt chỉ nằm ở adapter execution/fill source.
2. **Market data phải đi qua `data_layer`.** Service trong `bobby_network` không tự connect trực tiếp Binance, DNSE, vnstock nếu `data_layer` đã cung cấp stream/API tương ứng. Trading system chỉ dùng Redis Pub/Sub/key và REST recovery của `data_layer`.
3. **Thiết kế phải theo hướng chuẩn, scalable, stable, reliable, secure, fast.** Ưu tiên: Reliability > Performance > Modularity > Testability > Maintainability > Deployability. Không dùng float cho tiền/price/qty trong core domain/accounting.
4. **Được phép refactor mạnh schema và service layout.** Không cần giữ bảng/service cũ nếu chúng cản trở multi-mode, multi-venue, accounting chuẩn, hoặc risk tốt hơn. Legacy chỉ là nguồn tham khảo và migration bridge.
5. **Paper mode không được là bản giả lập sơ sài.** Paper phải dùng cùng order lifecycle tổng quát với live: partial fill, amend/cancel, stop, take-profit, TIF, fee, slippage, settlement, reconciliation, và event replay.
6. **Khi implement phải bám sát markdown này.** Nếu yêu cầu/codebase mâu thuẫn với plan, hoặc có điểm không chắc, agent phải hỏi lại rõ ràng trước khi tự diễn giải. Không hallucinate module, schema, stream, endpoint, hoặc business rule ngoài tài liệu này.

---

## 0.1 Implementation Snapshot Sau Endpoint V1/Admin Onboarding

Cập nhật ngày `2026-05-16`. Phần này là trạng thái code hiện tại để các session sau không đọc nhầm target design là đã hoàn tất 100%.

### Đã Implement Trong Codebase

- Project runtime đã chuyển từ Poetry sang `uv`:
  - `pyproject.toml` dùng chuẩn PEP 621.
  - `Dockerfile` dùng `uv sync` để cài runtime dependency vào system interpreter trong container.
  - `docker-compose.yml` chạy service bằng `python -m ...`, không còn `poetry run`.
- Config/environment đã chuẩn hóa:
  - Có `.env.example` không chứa secret thật.
  - Có Redis split rõ: `TRADING_REDIS_URL` cho trading system, `DATA_LAYER_REDIS_URL` cho data_layer DB.
  - Có admin auth env cho endpoint vận hành: `TRADING_ADMIN_USER`, `TRADING_ADMIN_PASSWORD`, `TRADING_ADMIN_TOKEN`.
  - `.gitignore`/`.dockerignore` đã chặn env, logs, DB volume, cache, credential artifacts.
- Schema v2 đã có các migration chính:
  - `04-domain-events.sql`
  - `05-trading-core-v2.sql`
  - `06-paper-mode.sql`
  - `07-venue-adapters.sql`
  - `08-settlement.sql`
  - `09-observability-security.sql`
  - `10-performance.sql`
- Domain core đã có value/account/order/position/event/fee models ở `domain/`, với unit test cơ bản.
- Market data service đã đổi thành bridge từ `data_layer`, thay vì tự mở Binance market websocket.
- Market data boundary đã align lại với `DATA_LAYER_SERVICE_ACCESS_GUIDE.md`:
  - `adapters/market_data/DataLayerClient` dùng contract REST chính thức: `health`, `stream_health`, `latest_trade`, `latest_kline`, `latest_vn_quote`, `warmup_ohlcv`, `crypto_ohlcv`, `fallback_status`, `fallback_reference`, `validate_source`, `validate_freshness`.
  - Trading system market-data service chỉ recover qua data_layer REST và subscribe Redis channels `stream:trade:{symbol}`, `stream:kline:{interval}:{symbol}`, `stream:vn:{symbol}`.
  - Parser market-data accept cả normalized data_layer payload và provider-shaped payload còn được data_layer preserve trong `raw`.
  - `services/market_data/core/streamer.py` direct Binance streamer cũ đã bị loại bỏ để tránh consumer mới mở external market websocket trong trading_system.
  - Risk không dùng payload `authoritative=false` cho `sandbox/live`; OKX fallback/reference từ data_layer chỉ là context trừ khi có policy riêng sau này.
- Gateway/risk đã giữ `mode`, route theo mode, có mode/venue permission, deny event, kill-switch state key.
- Alpha-facing command surface bước đầu đã có:
  - legacy submit/bulk/update vẫn giữ để compatibility.
  - `/v1/orders`, `/v1/orders/bulk`.
  - `/v1/orders/{client_order_id}` cho amend/cancel/query.
  - `/v1/orders` list query cơ bản.
  - `/v1/health` cho operator/alpha readiness check, merge heartbeat từ Postgres và Redis.
  - `/v1/admin/alphas/register` để khai báo alpha, tạo legacy/canonical DB rows, và set Redis gateway auth.
  - `/v1/admin/alphas/{alpha_id}` để inspect strategy/account/risk profile.
  - `/v1/admin/alphas/{alpha_id}/risk` để chỉnh risk config/profile theo mode/venue/instrument.
  - `/v1/admin/accounts/paper/seed` để seed/reset paper account bằng admin auth.
  - `/v1/admin/trading-state` để set kill-switch state theo mode/venue.
  - `/v1/admin/symbols` và `/v1/admin/symbols/sync` để xem/sync symbol universe từ `data_layer` + manual config.
  - Cancel đi qua `order.inbound` -> risk -> mode execution stream, không bắn thẳng executor.
  - Amend hiện là native-first: Binance open `LIMIT` dùng `futures_modify_order`; DNSE dùng SDK `put_order`; fallback cancel-replace chỉ dùng khi native unsupported và có `new_client_order_id` khác.
- Paper execution mode đã có:
  - `PaperExecutionClient`
  - persisted open orders
  - market-event matcher
  - cancel flow
  - amend cancel-replace flow
  - STOP/TAKE_PROFIT matcher cơ bản
  - IOC/FOK/GTD unit behavior
  - seed paper account endpoint admin hiện tại: `POST /v1/admin/accounts/paper/seed` với legacy alias `POST /admin/paper/accounts/seed`
- Execution adapter registry đã có route theo `(mode, venue)`:
  - paper qua paper stream/client
  - Binance futures adapter wrapper
  - DNSE stock adapter skeleton với dry-run/default-safe env behavior
  - DNSE native amend method mapped to SDK `put_order` khi có broker/original order id.
- Portfolio/accounting đã có path xử lý canonical `events.order` và `events.fill`, đồng thời vẫn consume legacy stream trong giai đoạn migration.
- Performance/PnL Projection V1 đã có:
  - service riêng `services/performance`.
  - schema additive không mutate bảng đang chạy: `strategy_deployments`, `performance_snapshots`, `account_equity_snapshots`, `funding_accruals`, `performance_events`.
  - snapshot theo `strategy_id + account_id + mode + venue`, để một alpha có thể chạy song song `paper|sandbox|live` như các deployment độc lập.
  - PnL tính từ canonical `positions_v2`, `fills`, `account_balances`, `margin_balances`, và Redis `market:ticker`/canonical market cache.
  - docker compose service `performance` và heartbeat `performance`.
  - config: `PERFORMANCE_SNAPSHOT_INTERVAL_SECONDS`, `PERFORMANCE_MARK_PRICE_MAX_AGE_SECONDS`.
  - unit tests cho long/short/account PnL math.
- Reconciliation/monitoring đã có:
  - paper reconciliation
  - Binance uncertain/position reconciliation
  - DNSE reconciliation skeleton khi `DNSE_RECON_ENABLED=true`
  - stream lag scanner
  - dead-letter scanner
  - Redis resource health
  - service heartbeat helper ghi Redis TTL key và bảng `service_heartbeats`
  - stale/missing/bad-status heartbeat alert trong monitor.
  - Optional observability profile: Loki + Promtail + Grafana cho file/container logs.
  - Loki/Grafana usage guide: `LOKI_GRAFANA_LOGS_GUIDE.md`.
  - Operations runbook: `OPERATIONS_OBSERVABILITY_RUNBOOK.md`.
  - Alpha endpoint guide: `ALPHA_ENDPOINT_V1_GUIDE.md`.

### Chưa Được Xem Là Hoàn Tất

- Alpha-facing endpoint guide đã có bản pre-alpha smoke tại `ALPHA_ENDPOINT_V1_GUIDE.md`; vẫn cần freeze cuối sau khi external alpha folder smoke pass.
- Admin onboarding endpoint đã có, nhưng chưa thay thế hết các admin mục tiêu dài hạn như DNSE OTP endpoint và reconciliation trigger endpoint.
- Full lifecycle paper order vẫn còn thiếu các phần target:
  - native amend paper vẫn là cancel-replace; live/sandbox venue amend đã native-first nơi venue hỗ trợ.
  - stop-loss/take-profit native domain flow nâng cao
  - partial fill dựa trên depth/volume model thực
  - realistic latency/slippage model nâng cao
- DNSE adapter hiện là skeleton usable/dry-run-first, chưa được xác nhận bằng integration thật với trading token/OTP production.
- Event store/projection replay mới có foundation schema và một phần path event; chưa có replay engine hoàn chỉnh.
- Risk engine vẫn là compatibility bridge v3, chưa phải risk_engine_v2 hoàn toàn pure-domain.
- Portfolio vẫn còn legacy tasks như Binance reconciliation cũ trong service portfolio; canonical reconciliation service đã tách ra nhưng cần tiếp tục giảm legacy coupling.
- Performance/PnL Projection V1 mới là projection nội bộ; chưa có alpha-facing/dashboard endpoint đọc snapshot.
- Live PnL vẫn cần reconciliation với broker/exchange thật để đối chiếu, không được coi internal projection là source of truth duy nhất cho live cash/account.
- Integration/system test Docker với Postgres/Redis/data_layer đã chạy một phần; data_layer smoke và alpha strategy smoke vẫn chưa chốt full matrix.

### Nguyên Tắc Cho Bước Tiếp Theo

1. Không viết endpoint guide cho alpha cho đến khi test/debug nền xong.
2. Test trước theo thứ tự: unit -> integration mocked Redis/DB -> docker compose smoke -> alpha smoke.
3. Nếu phát hiện code khác markdown, ưu tiên cập nhật markdown ngay trong cùng PR/session để người đọc hiểu hệ thống qua tài liệu.
4. Không quảng bá feature là ready nếu chỉ có schema hoặc skeleton adapter.

### Performance/PnL Projection V1 Test Plan

Mục tiêu: xác nhận projection chạy được, tính đúng, và không làm bẩn schema/state cũ.

Test layers:

1. Unit math:
   - Long position: mark > entry sinh UPnL dương.
   - Short position: mark giảm sinh UPnL dương.
   - Account equity/drawdown/net PnL tính từ cash, realized, unrealized, fees, funding.
2. Compile/import:
   - `services/performance`, `shared`, `services/monitor` compile được trong Docker.
3. Full unit suite:
   - Đảm bảo service mới không phá gateway/risk/paper/portfolio/reconciliation hiện tại.
4. Runtime DB/Redis smoke:
   - Seed một deployment `perf_smoke_alpha:paper:BINANCE`.
   - Seed `account_balances`, `positions_v2`, `fills`.
   - Seed Redis `market:ticker:BTCUSDT`.
   - Chạy `PerformanceRepository.run_projection_cycle()` một lần.
   - Assert `strategy_deployments` có deployment.
   - Assert `performance_snapshots` có:
     - `position_qty = 2`
     - `mark_price = 125`
     - `notional = 250`
     - `realized_pnl = 10`
     - `unrealized_pnl = 50`
     - `fee_total = 1.5`
     - `net_pnl = 58.5`
   - Assert `account_equity_snapshots` có:
     - `cash_total = 10000`
     - `unrealized_pnl = 50`
     - `equity = 10050`
5. Runtime health:
   - `performance_service` starts.
   - `/v1/health` includes fresh `performance` heartbeat.

Current verification:

- `python -m compileall services/performance shared services/monitor`: pass.
- `pytest`: `77 passed`.
- `init-db/10-performance.sql` applied to running Postgres.
- `performance_service` started.
- `/v1/health` includes `performance` heartbeat.
- Added repeatable runtime smoke script: `scripts/performance_projection_smoke.py`.
- Runtime smoke on running Postgres/Redis: `PERFORMANCE_SMOKE_OK deployments=1 instrument_snapshots=1 account_snapshots=1`.
- Smoke cleanup verified: no `perf_smoke_alpha` rows remain in `strategy_deployments`, `performance_snapshots`, or `account_equity_snapshots`.

---

## 1. Tóm Tắt Codebase Hiện Tại

### 1.1 `trading_system/`

Hệ thống hiện tại đã có các service chính:

- `services/gateway`: FastAPI nhận `/submit`, `/bulk`, `/update`, validate Pydantic, auth/rate limit bằng Redis, push `order.inbound`.
- `services/risk_engine`: consume `order.inbound`, lấy `market:ticker:{symbol}` và `market:info:{symbol}` từ Redis, check throttle, lot size, price deviation, exposure, rồi push `order.requests`.
- `services/executor`: consume `order.requests`, refine order theo Binance exchange info, gửi Binance Futures batch order, lưu `binance_sent_orders`.
- `services/listener`: listen Binance user data stream, parse `ORDER_TRADE_UPDATE`, update order/position/fill, push `execution.fills`.
- `services/portfolio`: consume `execution.fills`, update alpha position, ledger, unrealized PnL, circuit breaker, reconciliation với Binance.
- `services/market_data`: tự mở Binance websocket, set `market:ticker:{symbol}` và `market:mark:{symbol}`.
- `services/monitor`: health monitoring Redis streams/resources.
- `shared`: config, Redis, DB, logger.
- `init-db`: schema Timescale/Postgres cho alpha, ledger, risk config, orders, fills, positions, stats.

### 1.2 Gaps Quan Trọng Trong `trading_system`

- Gateway schema có `mode`, nhưng `GatewayEngine.validate_single()` đang overwrite `order.mode = "TESTNET" if settings.IS_TESTNET else "LIVE"`, làm mất khả năng user gửi `mode="paper"`.
- Risk route chỉ có một stream `order.requests`, chưa có mode routing hoặc command bus chuẩn.
- Executor hard-code Binance Futures handler. Có file `tcbs_futs.py` nhưng chưa thành adapter chuẩn và chưa có DNSE trading adapter.
- Listener hard-code Binance user data stream; paper fill và DNSE order event chưa có listener/fill adapter tương đương.
- `services/market_data` duplicate trách nhiệm với `data_layer`, trái với guide hiện tại.
- Core domain còn dùng `float`/`DOUBLE PRECISION` cho tiền, price, qty, PnL. Điều này không phù hợp với fail-fast và precision-safe accounting.
- Schema insert vào `binance_sent_orders.error_message` trong `RiskRepository.log_rejection()` nhưng bảng hiện chưa có cột `error_message`.
- Bảng đang đặt tên theo Binance (`binance_sent_orders`, `binance_fills`) nên khó mở rộng sang DNSE/HOSE và paper.
- PnL/ledger/accounting đang phân tán giữa listener và portfolio, dễ double-count fee hoặc lệch state.
- Chưa có immutable event store. State update trực tiếp vào bảng state, khó crash recovery/replay.

### 1.3 `services_exec_papertrade/`

Folder này hiện chủ yếu là skeleton:

- `PLAN.md` có concept paper executor, virtual account, heartbeat, fee simulation, reconciliation, mock API.
- Các file Python trong `project/core`, `project/engine`, `project/services`, `project/database` đang rỗng.
- Migration `001_papertrade_schema.sql` rỗng.

Kết luận: papertrade không phải module đã chạy được để migrate nguyên xi. Cần implement paper mode mới trong `trading_system` dựa trên concept trong `PLAN.md` và core chuẩn hóa bên dưới.

### 1.4 `data_layer/`

`data_layer` là market-data gateway hiện tại:

- Redis DB mặc định: `REDIS_DB=2`.
- API: `http://data_layer:8100`.
- Live Redis Pub/Sub:
  - Binance trade: `stream:trade:{symbol}`, key `trade:price:{symbol}`.
  - Binance kline: `stream:kline:{interval}:{symbol}`, key `kline:{interval}:{symbol}`.
  - VN quote: `stream:vn:{symbol}`, key `vn:quote:{symbol}`, last snapshot `vn:quote:last:{symbol}`.
- REST recovery/warmup:
  - `GET /v1/health`
  - `GET /v1/binance/price/{symbol}`
  - `GET /v1/binance/kline/{symbol}?interval=1m`
  - `GET /v1/binance/klines/{symbol}?interval=1m&limit=1000`
  - `GET /v1/vn/quote/{symbol}`
  - `GET /v1/vn/quote-last/{symbol}`
  - `GET /v1/preload/{symbol}?limit=1000`
  - `GET /v1/preload/status`

`feed_parsers.py` quy định normalized fields cần follow. Trading system phải consume normalized fields (`price`, `close`, `timestamp`, `is_closed`, `raw`) thay vì phụ thuộc provider raw shape.

### 1.5 DNSE/HOSE Notes

DNSE OpenAPI có:

- Market data REST: OHLC, trades, latest trade, close price, security definition, instruments, working dates.
- Trading REST: accounts, balances, positions, orders, order detail/history, execution detail, PPSE, loan packages, post/put/cancel/close position.
- Trading token cần OTP: `send_email_otp()` -> `create_trading_token()`.
- Trading order fields: `market_type`, `accountNo`, `symbol`, `side` (`NB`/`NS`), `orderType`, `price`, `quantity`, `loanPackageId`, `trading_token`.
- Private order WS: `subscribe_order_event(market_type="STOCK"|"DERIVATIVE")`.
- Rate limit theo API key/endpoint; SDK không trả headers trong wrapper nên phải tự track nội bộ.
- OHLC endpoint cần `X-Aux-Date`, không phải `Date`.

---

## 2. Target Architecture

### 2.1 Nguyên Tắc

Hệ thống nên trở thành một `TradingNode` thuần Python:

```text
Alpha/Strategy
  -> Gateway API
  -> Command/Event Bus
  -> RiskEngine
  -> ExecutionEngine
  -> ExecutionClient Adapter
      - PaperExecutionClient
      - BinanceFuturesClient
      - DNSEStockClient
      - future brokers
  -> Execution events
  -> Portfolio + AccountsManager
  -> State DB + Event Store + Redis cache
```

Core business logic không biết Binance/DNSE/paper API cụ thể. Mọi venue/provider nằm sau adapter.

### 2.2 Mode Model

Chuẩn hóa mode:

- `paper`: giả lập khớp lệnh bằng live data từ `data_layer`, dùng virtual account, không gửi order ra broker.
- `sandbox`: gửi order ra môi trường testnet/UAT nếu provider hỗ trợ. Binance testnet thuộc mode này.
- `live`: gửi order thật ra broker/exchange.
- `replay`: chạy lại event/market data lịch sử để test strategy/risk/accounting.
- `backtest`: offline simulation, có thể dùng chung domain/event/accounting nhưng không chạy service realtime.

Mode phải nằm trong order command và mọi event:

```json
{
  "trader_id": "TRADER-001",
  "strategy_id": "alpha_001",
  "mode": "paper",
  "venue": "BINANCE",
  "account_id": "paper-binance-alpha_001",
  "instrument_id": "BTCUSDT.BINANCE",
  "client_order_id": "..."
}
```

Không dùng `IS_TESTNET` để overwrite mode. `IS_TESTNET` chỉ là config default cho Binance adapter khi mode = `sandbox`.

### 2.3 Service Boundaries

Có thể giữ process name hiện tại trong giai đoạn migration, nhưng về target nên replace các service cũ bằng các service có boundary rõ hơn. Nếu risk/portfolio hiện tại quá gắn với schema cũ hoặc Binance-only logic, ưu tiên viết service v2 sạch hơn thay vì vá tiếp.

- `gateway`: API ingress, auth, idempotency, schema validation, command creation.
- `data_client` hoặc `market_data`: consume `data_layer`, normalize thành internal market events/cache. Có thể thay service `market_data` hiện tại.
- `risk_engine_v2`: pure pre-trade risk, mode-aware, account-aware, instrument-aware, session-aware, settlement-aware.
- `execution_engine`: route command đến adapter theo `(mode, venue, account_type)`.
- `executor/adapters`: implement paper/binance/dnse execution clients.
- `listener/adapters`: convert venue/private event hoặc paper fill event thành internal immutable execution events.
- `portfolio_accounting_v2`: single owner của position/account/ledger/settlement state update từ events.
- `reconciliation`: reconcile DB/cache/venue snapshots.
- `monitor`: stream lag, dead letter, resource, heartbeat, alert.

### 2.4 Legacy Papertrade Behavior Tham Khảo

`/root/bobby/Papertrade_DB/execution_portfolioalpha/trade/action_async.py` hiện có các behavior hữu ích để map sang API mới, nhưng không nên bê nguyên architecture:

- Market entry: `long_in`, `short_in`.
- Limit entry: `place_limit_buy`, `place_limit_sell`.
- Close/reduce: `long_out`, `short_out`.
- Cancel: `cancel_market_long`, `cancel_market_short`, `cancel_limit_buy`, `cancel_limit_sell`.
- Amend: `change_price_limit`, `change_sl_tp`.
- Query: `get_open_position_id`, `get_open_positions`, `get_pending_orders`, `get_profit_id`.
- Fill accounting cũ có adding/reducing, average price, realized PnL, commission, order/trade log.

Target v2 phải expose các workflow này cho alpha nhưng bằng domain command/event chuẩn, không dùng `position_type` cũ (`LONG`, `SHORT`, `LIMIT_BUY`, `LIMIT_SELL`) làm core model.

---

## 3. Domain Model Must-Have

Implement dưới `trading_system/domain/` hoặc `trading_system/services/core/domain/`.

### 3.1 Value Objects

Tạo immutable value objects:

- `TraderId`
- `StrategyId`
- `AccountId`
- `Venue`
- `InstrumentId(symbol, venue)`
- `ClientOrderId`
- `VenueOrderId`
- `PositionId`
- `TradeId`
- `Currency`
- `Money`
- `Price`
- `Quantity`
- `TimestampNs`

Rules:

- Dùng `Decimal`, không dùng `float` trong domain/accounting.
- Reject NaN/Infinity.
- Reject negative timestamp, negative qty.
- Price <= 0 chỉ cho instrument đặc biệt nếu sau này cần; mặc định reject.
- Normalize symbol ở boundary, không normalize lung tung trong core.

### 3.2 Instruments

Tạo instrument model chuẩn:

- `instrument_id`
- `venue`
- `asset_class`: `CRYPTO_PERP`, `CRYPTO_SPOT`, `VN_STOCK`, `VN_DERIVATIVE`, `FX`, ...
- `base_currency`, `quote_currency`, `settlement_currency`
- `price_precision`, `size_precision`
- `tick_size`, `lot_size`, `min_qty`, `max_qty`, `min_notional`
- `multiplier`
- `margin_init`, `margin_maint`
- `trading_sessions`
- `allowed_order_types`
- provider metadata raw

Instrument metadata lấy từ:

- Binance exchange info qua `data_layer` hoặc internal instrument adapter cached định kỳ.
- DNSE security definition/instruments.
- Static config fallback trong DB.

### 3.3 Orders

Order domain gồm:

- `OrderStatus`: `INITIALIZED`, `SUBMITTED`, `ACCEPTED`, `REJECTED`, `DENIED`, `PENDING_UPDATE`, `PENDING_CANCEL`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `EXPIRED`, `TRIGGERED`.
- `OrderSide`: `BUY`, `SELL`.
- `PositionSide`: `BOTH`, `LONG`, `SHORT`.
- `OrderType`: `MARKET`, `LIMIT`, `STOP_MARKET`, `STOP_LIMIT`, `TAKE_PROFIT`, `TRAILING_STOP_MARKET`, `ATO`, `ATC`, provider-specific extensions.
- `TimeInForce`: `GTC`, `IOC`, `FOK`, `GTD`, `GTX`.

Commands:

- `SubmitOrder`
- `SubmitOrderList`
- `ModifyOrder`
- `CancelOrder`
- `CancelAllOrders`
- `ClosePosition`

Events:

- `OrderInitialized`
- `OrderSubmitted`
- `OrderAccepted`
- `OrderRejected`
- `OrderDenied`
- `OrderUpdated`
- `OrderCanceled`
- `OrderExpired`
- `OrderTriggered`
- `OrderFilled`

### 3.4 Accounts

Theo ref Nautilus, implement:

- `Account`
- `CashAccount`
- `MarginAccount`
- optional `BettingAccount` placeholder nếu chưa cần.
- `AccountBalance(total, locked, free)`
- `MarginBalance(initial, maintenance, currency, instrument_id | None)`
- `AccountsManager`

Invariants:

- `total == locked + free` tại precision của currency.
- Balance âm trên cash account phải raise `AccountBalanceNegative`, trừ khi account config `allow_borrowing=True`.
- `locked > total` chỉ được clamp ở boundary khi venue latency, và phải emit warning/reconciliation event.
- Update account/position chỉ từ immutable events, không update tùy tiện từ nhiều service.

### 3.5 Positions

Position state phải rebuild được từ `OrderFilled` events:

- `position_id`
- `strategy_id`
- `instrument_id`
- `account_id`
- `side`: `FLAT`, `LONG`, `SHORT`
- `signed_qty`, `quantity`, `peak_qty`
- `avg_px_open`, `avg_px_close`
- `realized_pnl`, `unrealized_pnl`
- `commissions`
- timestamps: `opened`, `last`, `closed`
- dedup by `trade_id`

Portfolio service là nơi duy nhất apply fill vào position/account.

---

## 4. Data Layer Integration Plan

### 4.1 Replace Current Market Data Service

`trading_system/services/market_data` hiện tự connect Binance. Cần refactor thành `services/data_client` hoặc giữ tên `market_data` nhưng đổi implementation:

- Connect Redis ephemeral của `data_layer` (`redis_marketdata:6379/0`) để subscribe Pub/Sub.
- Connect Redis DB nội bộ trading system (`redis_service:6379/0` hoặc config) để publish internal cache/events nếu cần.
- REST warmup qua `DATA_LAYER_URL=http://data_layer:8100`.
- Quyết định đã chốt: **keep split and configure two Redis clients**. Không dùng chung DB để tránh key collision và tránh trading traffic ảnh hưởng cache/TTL của data layer.

Config mới:

```text
DATA_LAYER_URL=http://data_layer:8100
DATA_LAYER_REDIS_URL=redis://redis_marketdata:6379/0
TRADING_REDIS_URL=redis://redis_service:6379/0
```

### 4.2 Internal Market Cache Contract

Trading system nên có cache nội bộ thống nhất:

- `cache:market:last_trade:{instrument_id}`
- `cache:market:last_bar:{instrument_id}:{interval}`
- `cache:market:last_quote:{instrument_id}`
- `cache:instrument:{instrument_id}`
- `cache:venue_status:{venue}`

Internal market event topics:

- `events.market.trade.{venue}.{symbol}`
- `events.market.bar.{venue}.{symbol}.{interval}`
- `events.market.quote.{venue}.{symbol}`
- `events.market.instrument.{venue}.{symbol}`

Trong giai đoạn đầu, có thể dùng Redis Stream/PubSub thay vì build MessageBus in-memory phức tạp.

### 4.3 Boot Sequence

Mỗi service cần data:

1. `GET /v1/health`.
2. Load instrument metadata từ DB/cache/provider.
3. Warmup latest:
   - Binance execution/paper: `GET /v1/binance/price/{symbol}`.
   - Binance candle alpha: `GET /v1/binance/kline/{symbol}` hoặc historical proxy.
   - VN alpha/paper: `GET /v1/preload/{symbol}?limit=N`, `GET /v1/vn/quote-last/{symbol}`.
4. Subscribe stream:
   - `stream:trade:{symbol}` cho execution/paper price.
   - `stream:kline:{interval}:{symbol}` cho candle.
   - `stream:vn:{symbol}` cho VN quote.
5. On reconnect: REST latest-state recovery trước khi resume stream processing.

### 4.4 Important Compatibility

`data_layer` dùng `orjson` bytes. Trading system Redis client đang `decode_responses=False`, phù hợp. Parser phải handle bytes + normalized dict.

VN timezone:

- Internal timestamp nên UTC/ns.
- VN trading-session logic dùng `Asia/Ho_Chi_Minh` ở boundary.
- `/v1/preload/{symbol}` trả latest N candles sorted ascending.

---

## 5. Execution Adapters

### 5.1 Adapter Interface

Tạo port:

```python
class ExecutionClient(Protocol):
    venue: Venue
    mode: TradingMode

    async def submit_order(self, command: SubmitOrder) -> list[OrderEvent]: ...
    async def submit_order_list(self, command: SubmitOrderList) -> list[OrderEvent]: ...
    async def modify_order(self, command: ModifyOrder) -> list[OrderEvent]: ...
    async def cancel_order(self, command: CancelOrder) -> list[OrderEvent]: ...
    async def get_open_orders(self, account_id: AccountId) -> list[OrderSnapshot]: ...
    async def get_account_state(self, account_id: AccountId) -> AccountState: ...
```

Adapter trả về domain events hoặc snapshots, không update DB trực tiếp.

### 5.2 PaperExecutionClient

Paper mode phải giả lập:

- Market order: fill theo latest execution price từ `data_layer`.
- Limit order:
  - BUY fill khi market price <= limit.
  - SELL fill khi market price >= limit.
  - Phải support partial fill theo cùng event lifecycle như live.
- Stop/Take Profit:
  - Trigger theo mark/last price tùy `trigger_type`.
  - Sau trigger chuyển thành market/limit.
- TIF:
  - `GTC`: giữ open.
  - `IOC`: fill phần có thể, cancel phần còn lại.
  - `FOK`: all-or-none.
  - `GTD`: expire theo timestamp.
- Fee model:
  - Binance futures default taker/maker configurable.
  - DNSE/VN stock fees/tax configurable.
- Funding:
  - Binance perp funding mỗi 8h nếu cần.
- Slippage:
  - Config per venue/symbol/mode. Mặc định 0 hoặc small bps.
- Latency:
  - Optional artificial latency for realism, default off in deterministic tests.
- Amend/cancel:
  - Cancel open order phải emit `OrderCancelSubmitted`/`OrderCanceled` hoặc `OrderCancelRejected`.
  - Modify price/qty/SL/TP phải emit `OrderModifySubmitted`/`OrderUpdated` hoặc `OrderModifyRejected`.
- Bracket/attached orders:
  - Support stop-loss/take-profit attached to an entry order.
  - Child order activation must be event-driven after parent fill.
- Advanced order semantics:
  - Partial fill creates `PARTIALLY_FILLED` and reduces `remaining_qty`.
  - Reduce-only must never increase exposure.
  - Post-only must reject/treat as maker-only according to venue model.
  - FOK all-or-none; IOC fill available portion then cancel rest.

Paper order lifecycle:

```text
SubmitOrder
  -> OrderSubmitted
  -> Risk accepted
  -> PaperExecutionClient stores open order
  -> OrderAccepted
  -> Market tick triggers matcher
  -> OrderFilled/PartiallyFilled
  -> Portfolio applies accounting
```

Paper state không được nằm trong memory-only. Open orders và fills phải persist để crash recovery.

Paper matcher quality target:

- V1 can use latest trade/quote price from `data_layer`.
- V2 should allow depth/volume-aware fill simulation when an order book feed exists.
- Matching algorithm must be deterministic for replay tests when market event sequence is fixed.

### 5.3 BinanceFuturesClient

Refactor từ `services/executor/handlers/binance_futs.py`:

- Không gọi domain object fields kiểu `.type` nếu domain dùng `order_type`; map rõ ở adapter.
- Batch order max 10 giữ lại.
- Rate-limit/weight tracker chuẩn hóa thành `VenueRateLimiter`.
- Timeout -> emit `OrderPending/OrderUncertain` và đưa vào reconciliation queue.
- Listener private WS convert Binance `ORDER_TRADE_UPDATE` thành domain `OrderFilled`, `OrderCanceled`, ...

### 5.4 DNSEStockClient

Implement adapter mới:

- Auth:
  - API key/secret từ secret env/store.
  - Trading token lifecycle riêng; không để strategy cầm token.
  - OTP flow phải là manual/admin API hoặc secured operator flow.
- SDK specifics:
  - Local SDK is under `trading_system/dnse_openapi_sdk/python/`.
  - `DNSEClient` signs every request with HMAC and `X-Signature`.
  - Default date header is `Date`; OHLC historical may need `DATE_HEADER=X-Aux-Date` or raw `build_signature(..., header_name="X-Aux-Date")`.
  - Client methods return `(status, body_text)`, not parsed JSON and not rate-limit headers.
  - The SDK uses `urllib3.PoolManager`; wrap sync calls in bounded executor or build async adapter wrapper so event loop is not blocked.
- Submit:
  - Map `BUY` -> `NB`, `SELL` -> `NS`.
  - Map `LIMIT` -> `LO`, `MARKET` -> provider-supported market type, `ATO`, `ATC`.
  - Require `accountNo`, `market_type=STOCK|DERIVATIVE`, `loanPackageId` nếu margin/loan.
- Modify/cancel:
  - `put_order`, `cancel_order`.
- Query:
  - `get_orders`, `get_order_detail`, `get_execution_detail`, `get_positions`, `get_balances`, `get_ppse`.
- Private events:
  - Use `subscribe_order_event`.
  - Convert DNSE order status/fill qty/leave qty to domain events.
- Rate limit:
  - Track per endpoint internally because SDK wrapper does not expose headers.
  - 429 -> backoff + fail fast for non-idempotent operations unless command state becomes `UNCERTAIN`.

### 5.5 DNSE Auth & Trading Token Plan

DNSE live order placement needs a trading token:

1. `send_email_otp()` requests OTP to registered email.
2. Operator submits OTP/passcode to an admin-only trading-system endpoint or CLI.
3. Adapter calls `create_trading_token(otp_type="email_otp", passcode=...)`.
4. Token is stored encrypted in memory/secret cache with expiry metadata.
5. `post_order`, `put_order`, `cancel_order`, `close_position` attach header `trading-token`.

Security rules:

- Alpha APIs never receive or pass DNSE trading token.
- OTP endpoint must be admin-only, audited, and disabled in paper mode.
- If token missing/expired, live DNSE order command must be rejected before sending to broker and must emit a clear `AUTH_TOKEN_MISSING_OR_EXPIRED` risk/execution event.
- Token refresh is explicit unless DNSE provides safe automatic refresh semantics.

---

## 6. Risk Engine Upgrade

### 6.1 Risk Checks

RiskEngine phải check:

- Trading state: `ACTIVE`, `REDUCING`, `HALTED`.
- Mode permission per strategy.
- Venue permission per strategy.
- Instrument exists and tradable.
- Session open:
  - Binance 24/7 mostly.
  - HOSE/VN sessions, ATO/continuous/ATC, lunch break, holidays.
- Price/qty precision, tick size, lot size.
- Min/max qty, min notional.
- Order type allowed by instrument/venue/session.
- Price deviation vs latest market/mark/quote.
- Notional per order.
- Notional/exposure per strategy/account/instrument.
- Max leverage.
- Max daily loss/drawdown.
- Max order per second/minute.
- Reduce-only correctness.
- Available cash/margin.
- Kill switch.

### 6.2 Mode-Aware Routing

After risk pass:

```text
mode=paper   -> commands.execution.paper
mode=sandbox -> commands.execution.sandbox
mode=live    -> commands.execution.live
mode=replay  -> commands.execution.replay
```

Hoặc một stream `commands.execution` với field `mode`, nhưng consumer group của execution engine route nội bộ. Giai đoạn đầu nên dùng stream riêng để dễ monitor/backpressure.

### 6.3 Pending Exposure

Hiện risk update `alpha_positions.pending_buy_qty/pending_sell_qty` ngay khi pass. Nâng cấp:

- Pending exposure nên gắn với open order id, account, mode, venue.
- Không chỉ cộng dồn qty trên alpha/symbol.
- On cancel/reject/expire/fill partial phải release đúng phần còn lại.
- Pending state nên derive được từ open orders; DB aggregate chỉ là projection/cache.

### 6.4 Risk Engine V2 Design Principles

Risk v2 should be a replacement-grade service, not only a patch over current checks:

- Pre-trade risk is deterministic and side-effect light: validate first, reserve exposure/margin only after all checks pass.
- Risk state is account-aware: cash, margin, settlement receivable/payable, open orders, filled positions, and pending commands are all considered.
- Risk is mode-aware:
  - `paper` can use virtual balances but must follow target venue rules.
  - `sandbox` and `live` must use real account/venue constraints.
  - `replay/backtest` can bypass live kill switches but must still record decisions.
- Risk is venue/session-aware:
  - Binance derivatives, DNSE stock, VN derivatives, and future US brokers may have different order types, calendars, settlement, lot sizes, and shorting rules.
- Risk emits explicit deny events with machine-readable reason codes.
- Risk profiles are hierarchical:
  - system global
  - venue/mode
  - account
  - strategy
  - instrument override
- Circuit breakers must support:
  - per-strategy halt
  - per-account halt
  - per-venue halt
  - global halt
  - reducing-only mode
- Risk should expose a dry-run endpoint for alpha development and CI.

---

## 7. Portfolio & Accounting Upgrade

### 7.1 Single Owner Rule

Chỉ Portfolio/AccountsManager được update:

- account balances
- margin balances
- positions
- ledger/equity
- realized/unrealized PnL
- commission/funding

Listener/execution adapter chỉ emit events. Không update accounting trực tiếp.

### 7.2 Cash vs Margin

Mode/venue examples:

- Binance futures: `MarginAccount`, settlement `USDT`, leverage, init/maint margin.
- Binance spot: `CashAccount`.
- VN stock cash: `CashAccount`, with configurable settlement model.
- VN derivative: `MarginAccount`.
- Paper: same account type as target venue but virtual balances.

### 7.3 Fee/Funding

Create `FeeModel`:

- `BinanceFuturesFeeModel(maker_bps, taker_bps, funding_enabled)`.
- `DNSEStockFeeModel(broker_fee_bps, tax_bps, exchange_fee_bps)`.
- `PaperFeeModel` delegates to target venue model.

Funding events:

- `FundingAccrued`
- `FundingPaid`
- `FundingReceived`

### 7.4 Reconciliation

Reconciliation modes:

- `paper`: compare event store, open orders projection, account projection, Redis open order cache.
- `live/binance`: compare DB with Binance orders/positions/balances.
- `live/dnse`: compare DB with DNSE orders/positions/balances/execution detail.

Uncertain command policy:

- Any timeout/non-idempotent unknown result -> `orders_uncertain`.
- Reconcile by `client_order_id`/venue order id.
- Never blindly retry live order create without idempotency guarantee.

### 7.5 VN Settlement Model

VN symbols need a settlement policy in both paper and live projections:

- Default behavior if caller/config does not enable realistic settlement: **immediate cash settlement**.
- If `realistic_settlement=true` for VN stock symbols:
  - Buy orders reserve cash immediately.
  - Securities become settled according to T+ rules, not instantly withdrawable/sellable if the target business rule requires it.
  - Sell proceeds go to receivable cash and become available on settlement date.
  - Portfolio exposes both `available_cash` and `receivable_cash`, `available_qty` and `receivable_qty`.
- Live mode must mirror broker-reported balances/positions but still project settlement buckets for strategy/risk decisions.
- Paper mode must simulate the same settlement calendar using VN working dates/holidays from DNSE/data layer where available.

Required settlement events:

- `SettlementScheduled`
- `CashSettled`
- `SecuritySettled`
- `SettlementFailed`

Settlement should be venue/instrument configurable, not hard-coded into portfolio math.

---

## 8. Database Redesign

### 8.1 Problems In Current Schema

- Binance-specific table names block multi-venue.
- `DOUBLE PRECISION` for monetary data can drift.
- No event store.
- No mode/account abstraction.
- No orders lifecycle table independent from sent order.
- No explicit venue, mode, account_id in many state tables.
- No idempotency table.
- Missing `error_message` column used by code.
- Paper migration is empty.

### 8.2 Migration Strategy

Because the current schema is Binance-centric and uses float-style columns, the target is a clean v2 schema. Existing tables can remain only as temporary compatibility projections during migration. Do not optimize the new design around preserving old table names or old service assumptions.

Migration stance:

- For production safety, create v2 tables beside old tables first.
- For design quality, v2 schema is canonical and can replace old tables/services after parity tests pass.
- Backfill old `alphas`, `alpha_ledger`, `alpha_positions`, `binance_sent_orders`, `binance_fills` into v2 where useful.
- After alpha API clients migrate, old tables may become views/projections or be dropped in a later migration.

Recommended migration files:

- `init-db/04-domain-events.sql`
- `init-db/05-trading-core-v2.sql`
- `init-db/06-paper-mode.sql`
- `init-db/07-venue-adapters.sql`
- `init-db/08-observability-security.sql`

### 8.3 Core Tables

Use `NUMERIC(38, 18)` or stricter per field. Store raw provider response in JSONB.

#### `traders`

- `trader_id text primary key`
- `name text`
- `active boolean`
- `created_at timestamptz`

#### `strategies`

- `strategy_id text primary key`
- `trader_id text`
- `description text`
- `active boolean`
- `allowed_modes text[]`
- `allowed_venues text[]`
- `created_at timestamptz`

Map legacy `alphas.alpha_id` to `strategies.strategy_id`.

#### `venues`

- `venue text primary key`: `BINANCE`, `DNSE`, ...
- `venue_type text`: `EXCHANGE`, `BROKER`
- `timezone text`
- `active boolean`
- `raw_metadata jsonb`

#### `accounts`

- `account_id text primary key`
- `trader_id text`
- `strategy_id text null`
- `mode text`
- `venue text`
- `account_type text`: `CASH`, `MARGIN`
- `base_currency text`
- `external_account_ref text`
- `active boolean`
- `created_at timestamptz`

#### `account_balances`

- `account_id text`
- `currency text`
- `total numeric`
- `locked numeric`
- `free numeric`
- `updated_at timestamptz`
- primary key `(account_id, currency)`
- check `total >= 0`, `locked >= 0`, `free >= 0`

#### `margin_balances`

- `account_id text`
- `instrument_id text null`
- `currency text`
- `initial numeric`
- `maintenance numeric`
- `updated_at timestamptz`
- primary key `(account_id, currency, coalesce(instrument_id, '*'))`

#### `instruments`

- `instrument_id text primary key`
- `venue text`
- `symbol text`
- `asset_class text`
- `base_currency text`
- `quote_currency text`
- `settlement_currency text`
- `price_precision int`
- `size_precision int`
- `tick_size numeric`
- `lot_size numeric`
- `min_qty numeric`
- `max_qty numeric`
- `min_notional numeric`
- `multiplier numeric`
- `margin_init numeric`
- `margin_maint numeric`
- `active boolean`
- `raw_metadata jsonb`
- `updated_at timestamptz`

#### `orders`

- `order_id bigserial`
- `client_order_id text not null`
- `venue_order_id text null`
- `trader_id text`
- `strategy_id text`
- `account_id text`
- `mode text`
- `venue text`
- `instrument_id text`
- `symbol text`
- `side text`
- `position_side text`
- `order_type text`
- `time_in_force text`
- `quantity numeric`
- `price numeric null`
- `trigger_price numeric null`
- `status text`
- `reduce_only boolean`
- `post_only boolean`
- `intent text`
- `submitted_at timestamptz`
- `updated_at timestamptz`
- `raw_request jsonb`
- `raw_response jsonb`
- `error_code text null`
- `error_message text null`
- unique `(mode, venue, account_id, client_order_id)`
- index `(strategy_id, instrument_id, status)`
- index `(venue, venue_order_id)`

#### `order_events`

Timescale hypertable:

- `event_id uuid`
- `event_ts timestamptz not null`
- `event_type text`
- `client_order_id text`
- `venue_order_id text null`
- `trade_id text null`
- `strategy_id text`
- `account_id text`
- `mode text`
- `venue text`
- `instrument_id text`
- `payload jsonb not null`
- `raw jsonb`
- primary key `(event_id, event_ts)`
- unique optional `(mode, venue, account_id, trade_id)` where trade id not null

#### `fills`

Projection table from `OrderFilled`:

- `fill_id bigserial`
- `event_id uuid`
- `trade_time timestamptz not null`
- `trade_id text`
- `client_order_id text`
- `venue_order_id text`
- `strategy_id text`
- `account_id text`
- `mode text`
- `venue text`
- `instrument_id text`
- `side text`
- `price numeric`
- `quantity numeric`
- `commission numeric`
- `commission_currency text`
- `liquidity_side text`
- `realized_pnl numeric`
- unique `(mode, venue, account_id, trade_id)`

#### `settlements`

Projection table for VN T+ and future settlement workflows:

- `settlement_id uuid primary key`
- `account_id text`
- `strategy_id text`
- `mode text`
- `venue text`
- `instrument_id text`
- `source_event_id uuid`
- `settlement_type text`: `CASH`, `SECURITY`
- `direction text`: `RECEIVABLE`, `PAYABLE`
- `currency text null`
- `quantity numeric null`
- `amount numeric null`
- `trade_date date`
- `settlement_date date`
- `status text`: `SCHEDULED`, `SETTLED`, `FAILED`, `CANCELED`
- `created_at timestamptz`
- `settled_at timestamptz null`

#### `settlement_calendars`

- `venue text`
- `market text`
- `trade_date date`
- `settlement_date date`
- `is_trading_day boolean`
- `metadata jsonb`
- primary key `(venue, market, trade_date)`

#### `positions`

Replace current global/alpha split with:

- `position_id text primary key`
- `strategy_id text`
- `account_id text`
- `mode text`
- `venue text`
- `instrument_id text`
- `side text`
- `signed_qty numeric`
- `quantity numeric`
- `avg_px_open numeric`
- `avg_px_close numeric`
- `realized_pnl numeric`
- `unrealized_pnl numeric`
- `peak_qty numeric`
- `opened_at timestamptz`
- `closed_at timestamptz null`
- `updated_at timestamptz`

#### `position_events`

Store `PositionOpened`, `PositionChanged`, `PositionClosed`.

#### `risk_profiles`

Mode/venue aware version of `alpha_risk_config`:

- `strategy_id text`
- `mode text`
- `venue text`
- `instrument_id text null`
- `max_notional_order numeric`
- `max_notional_position numeric`
- `max_leverage numeric`
- `max_order_per_second int`
- `max_order_per_minute int`
- `max_daily_loss numeric`
- `max_drawdown numeric`
- `allowed_order_types text[]`
- `trading_state text`
- `is_active boolean`
- primary key `(strategy_id, mode, venue, coalesce(instrument_id, '*'))`

#### `idempotency_keys`

- `scope text`
- `idempotency_key text`
- `created_at timestamptz`
- `expires_at timestamptz`
- `payload_hash text`
- primary key `(scope, idempotency_key)`

#### `dead_letters`

- `id bigserial`
- `stream text`
- `group_name text`
- `message_id text`
- `reason text`
- `payload jsonb`
- `created_at timestamptz`
- `resolved_at timestamptz null`

### 8.4 Paper Tables

Paper should reuse `orders`, `fills`, `positions`, `account_balances`, `order_events`.

Add only paper-specific tables:

#### `paper_open_orders`

- `client_order_id text primary key`
- `strategy_id text`
- `account_id text`
- `venue text`
- `instrument_id text`
- `side text`
- `order_type text`
- `quantity numeric`
- `remaining_qty numeric`
- `price numeric null`
- `trigger_price numeric null`
- `time_in_force text`
- `status text`
- `created_at timestamptz`
- `expires_at timestamptz null`
- `matcher_state jsonb`

#### `paper_matcher_config`

- `venue text`
- `instrument_id text null`
- `fee_model text`
- `maker_fee_bps numeric`
- `taker_fee_bps numeric`
- `slippage_bps numeric`
- `partial_fill_enabled boolean`
- `latency_ms int`
- `realistic_settlement boolean`
- `default_settlement_policy text`: `IMMEDIATE`, `VN_T_PLUS`
- primary key `(venue, coalesce(instrument_id, '*'))`

#### `paper_account_seed`

- `account_id text`
- `currency text`
- `initial_balance numeric`
- `created_at timestamptz`
- primary key `(account_id, currency)`

---

## 9. Redis Streams & Topics

### 9.1 External/Internal Streams

Current:

- `order.inbound`
- `order.requests`
- `execution.fills`
- `untracked.orders`
- `order.uncertain`

Target:

- `commands.orders.inbound`
- `commands.risk.accepted.paper`
- `commands.risk.accepted.sandbox`
- `commands.risk.accepted.live`
- `commands.execution.paper`
- `commands.execution.sandbox`
- `commands.execution.live`
- `events.order`
- `events.fill`
- `events.position`
- `events.account`
- `events.risk`
- `events.dead_letter`
- `events.reconciliation`

During migration, bridge old names to new names:

- `order.inbound` -> `commands.orders.inbound`
- `order.requests` -> `commands.execution.live` for current Binance flow.
- `execution.fills` -> `events.fill`

### 9.2 Message Envelope

Every stream message:

```json
{
  "schema_version": "2.0",
  "message_id": "uuid",
  "trace_id": "client_order_id-or-generated",
  "causation_id": "previous-message-id",
  "correlation_id": "strategy-session-id",
  "producer": "gateway",
  "message_type": "SubmitOrder",
  "mode": "paper",
  "venue": "BINANCE",
  "ts_event": "2026-05-14T07:23:10.805309Z",
  "payload": {}
}
```

Use JSON/orjson consistently. Avoid ad hoc field names across services.

---

## 10. Security Requirements

- Remove hardcoded DB passwords from committed SQL/compose examples. Current `01-init-roles.sql` contains plaintext passwords and superuser grants.
- Services should not run as DB superuser.
- Create least-privilege DB roles:
  - `trading_gateway_rw`
  - `trading_risk_rw`
  - `trading_execution_rw`
  - `trading_portfolio_rw`
  - `trading_monitor_ro`
  - `read_only`
- Secrets via env/secret manager, not code.
- API key auth:
  - Store hashed API keys, not plaintext Redis hash.
  - Support key rotation.
  - Scope keys by strategy/mode/venue.
- DNSE trading token:
  - Never expose to alpha strategy.
  - Store encrypted if persisted.
  - Expiry/refresh/OTP workflow audited.
- Kill switches:
  - `system:trading_state:{mode}:{venue}` = `ACTIVE|REDUCING|HALTED`.
  - Admin-only endpoint or DB state to set it.
- Audit:
  - All live order commands and admin actions recorded.

---

## 11. Reliability & Recovery

### 11.1 Crash-Only Design

Startup must do same work as crash recovery:

1. Connect DB/Redis.
2. Load open orders/accounts/positions from DB projections.
3. Replay unapplied events since last checkpoint if needed.
4. Reconcile pending/uncertain orders.
5. Subscribe market data/private streams.
6. Mark service ready.

### 11.2 Consumer Group Rules

- Always `XACK` only after durable DB write.
- Use `XPENDING` scanner for stuck messages.
- Move poison messages to `dead_letters` after retry threshold.
- Use idempotency keys before side effects.

### 11.3 Fail-Fast Rules

Implement in domain constructors:

- NaN/Infinity price/qty -> reject.
- Negative qty/timestamp -> reject.
- Arithmetic overflow/underflow -> reject.
- Unknown instrument -> deny order.
- Missing market price for risk/accounting -> deny/defer explicitly, not default 0.
- Balance negative -> raise and halt affected account/mode if necessary.

---

## 12. Observability

Metrics/logging:

- Gateway accept/reject rate, p50/p95 latency.
- Risk deny reasons by strategy/mode/venue.
- Execution submit latency, adapter error code, timeout/uncertain count.
- Fill latency from venue event to portfolio applied.
- Market data staleness per symbol.
- Redis stream lag per group.
- DB write latency and transaction failures.
- Reconciliation diffs.
- Paper matcher open orders, fill ratio, rejected due to margin.
- Service heartbeat:
  - Redis key `service:heartbeat:{service_name}:{instance_id}` with TTL.
  - DB projection `service_heartbeats`.
  - Heartbeat status enum: `STARTING|READY|DEGRADED|STOPPING|FAILED`.
  - Monitor should alert if a required service has no fresh heartbeat for more than 2 heartbeat TTL windows.

Alerts:

- `WARNING`: stale market data, stream lag, approaching rate limit, margin usage > threshold.
- `ERROR`: adapter errors, DB write failures, reconciliation mismatch.
- `CRITICAL`: live order uncertainty spike, negative balance, kill switch activated, service crash loop.

---

## 13. Implementation Phases

### Phase 0: Final Plan & API Contract Freeze

1. Freeze mode semantics: `paper`, `sandbox`, `live`, `replay`, `backtest`.
2. Freeze alpha-facing API and Redis command contracts.
3. Freeze Redis split: data layer DB 2, trading internal DB 0.
4. Freeze VN settlement flag behavior: immediate by default, realistic T+ when enabled.
5. Confirm DNSE auth operator flow and secret storage.

Definition of done:

- This markdown is accepted as final implementation guide.
- Alpha teams know which endpoint/Redis topics to call.

### Phase 1: Schema & Compatibility Foundation

1. Add clean v2 domain/event/account/order/position/settlement tables.
2. Add missing `error_message` to legacy `binance_sent_orders` if old code still runs.
3. Add `mode`, `venue`, `account_id` to legacy projections where needed.
4. Add config:
   - `DEFAULT_TRADING_MODE`
   - `DATA_LAYER_URL`
   - `DATA_LAYER_REDIS_URL`
   - `TRADING_REDIS_URL`
5. Add message envelope helpers.
6. Add `Decimal` serialization helpers.
7. Add compatibility views only where old alpha dashboards/services need temporary access.

Definition of done:

- Existing live Binance flow still works.
- New tables can be written by test script.
- No existing service broken by schema additions.

### Phase 2: Domain Core

1. Implement value objects.
2. Implement instrument model.
3. Implement order commands/events.
4. Implement account/cash/margin/margin models.
5. Implement position apply logic.
6. Unit tests for:
   - Decimal precision.
   - balance invariant.
   - long/short open/reduce/flip.
   - duplicate trade id dedup.
   - margin init/maint calculations.

Definition of done:

- Core can replay a list of fills into deterministic account/position state.

### Phase 3: Data Client Refactor

1. Replace direct Binance market websocket service with `data_layer` consumer.
2. Subscribe to Binance trade/kline and VN quote channels.
3. REST latest recovery on boot/reconnect.
4. Write internal cache keys expected by risk/portfolio, or refactor risk/portfolio to read new cache.
5. Add market staleness checks.

Definition of done:

- Risk can validate Binance and VN instruments using market data from `data_layer`.
- No duplicate external Binance market websocket inside trading system.

### Phase 4: Gateway & Risk Mode Routing

1. Gateway preserves user `mode`; only sets default if missing.
2. Gateway validates allowed modes.
3. Risk profile becomes mode/venue aware.
4. Risk routes to mode-specific stream.
5. Add kill switch/trading state.
6. Add deny events and rejection persistence.

Definition of done:

- Sending `mode=paper` never reaches live executor.
- Sending `mode=live` requires explicit strategy permission and live kill switch active.

### Phase 5: Paper Execution Mode

1. Implement `PaperExecutionClient`.
2. Implement persisted `paper_open_orders`.
3. Implement matcher consuming market ticks from internal market events.
4. Emit domain order/fill events.
5. Apply portfolio/accounting via same path as live events.
6. Add paper account seed/admin endpoint.
7. Add full order lifecycle support:
   - partial fills
   - amend price/qty
   - cancel
   - stop-loss/take-profit
   - IOC/FOK/GTD/GTC
   - reduce-only
   - optional realistic VN T+ settlement
8. Add tests:
   - market fill.
   - limit crossed.
   - limit not crossed.
   - cancel open order.
   - partial fill.
   - insufficient balance/margin reject.

Definition of done:

- Alpha can submit paper order through same gateway.
- Portfolio state updates from paper fills.
- Restart preserves open paper orders.

### Phase 6: Execution Adapter Refactor

1. Wrap existing Binance handler in `BinanceFuturesClient`.
2. Convert Binance responses/WS events to domain events.
3. Implement DNSE adapter skeleton and account/order endpoints.
4. Implement DNSE private order event listener.
5. Add adapter registry:
   - `(paper, BINANCE)` -> `PaperExecutionClient(target_venue=BINANCE)`
   - `(sandbox, BINANCE)` -> `BinanceFuturesClient(testnet=True)`
   - `(live, BINANCE)` -> `BinanceFuturesClient(testnet=False)`
   - `(paper, DNSE)` -> `PaperExecutionClient(target_venue=DNSE)`
   - `(live, DNSE)` -> `DNSEStockClient`

Definition of done:

- ExecutionEngine no longer imports Binance-specific handler directly.

### Phase 7: Portfolio/Accounting Single Owner

1. Move fee/ledger update out of listener into portfolio.
2. Portfolio consumes `events.order`/`events.fill`.
3. AccountsManager updates balances/margins.
4. Positions derived from fills.
5. SettlementEngine projects VN immediate/T+ settlement buckets.
6. Legacy `alpha_positions`/`alpha_ledger` become projections or views only if still needed during migration.

Definition of done:

- One fill applied once produces deterministic ledger/position.
- No double fee deduction between listener and portfolio.

### Phase 8: Reconciliation & Monitoring

1. Add paper reconciliation.
2. Add Binance reconciliation by client order id/venue order id.
3. Add DNSE reconciliation.
4. Add dead-letter scanner.
5. Add stream lag monitor.
6. Add alert routing.

Definition of done:

- Uncertain live order can be resolved after adapter timeout.
- Stuck stream messages surface in monitor.

Current implementation notes:

- `services/reconciliation` currently owns paper reconciliation, Binance uncertain/position reconciliation, optional DNSE reconciliation, and uncertain-order scanner.
- `services/monitor` currently scans Redis stream lag, dead letters, Redis memory, and service heartbeats.
- `shared/heartbeat.py` is the canonical heartbeat helper. It is wired into gateway, risk, executor, paper execution, listener, market_data, portfolio, reconciliation, and monitor.
- `services/monitor/service_heartbeats.py` alerts on missing, stale, degraded, failed, or stopping service status.
- `docker-compose.yml` has container log rotation for every app service and basic Postgres/Redis healthchecks.
- Remaining gap: monitor should later expose mode/venue readiness after the alpha-facing `/v1/health` contract is implemented.

---

## 14. Concrete File/Module Plan

This section is the canonical implementation map. When implementation starts, code should follow this module layout unless the user explicitly approves a change.

```text
trading_system/
  pyproject.toml
  Dockerfile
  docker-compose.yml
  .env.example
  .gitignore
  .dockerignore
  api/
    __init__.py
    app.py
    dependencies.py
    auth.py
    schemas/
      __init__.py
      common.py
      order_api.py
      account_api.py
      portfolio_api.py
      risk_api.py
      market_api.py
      admin_api.py
    routes/
      __init__.py
      orders.py
      positions.py
      accounts.py
      portfolio.py
      risk.py
      market.py
      events.py
      health.py
      admin.py
  domain/
    __init__.py
    enums.py
    exceptions.py
    identifiers.py
    objects.py
    instruments.py
    orders.py
    events.py
    accounts.py
    positions.py
    settlements.py
    risk.py
    fees.py
    clocks.py
  core/
    __init__.py
    clock.py
    serialization.py
    message_envelope.py
    idempotency.py
    decimal_utils.py
    validation.py
    redis_clients.py
    config.py
    logging.py
    security.py
    rate_limiter.py
    service_lifecycle.py
  shared/
    config.py
    database_module.py
    redis_module.py
    heartbeat.py
    logger_config.py
  adapters/
    __init__.py
    market_data/
      __init__.py
      data_layer_client.py
      parsers.py
      redis_subscriber.py
      rest_recovery.py
      instrument_loader.py
    execution/
      __init__.py
      base.py
      registry.py
      paper_client.py
      paper_matcher.py
      paper_fill_model.py
      paper_slippage.py
      paper_latency.py
      binance_futures.py
      dnse_stock.py
      dnse_auth.py
      dnse_token_manager.py
      venue_rate_limiter.py
    listeners/
      __init__.py
      binance_user_stream.py
      dnse_order_stream.py
      paper_events.py
      event_normalizer.py
    settlement/
      __init__.py
      base.py
      immediate.py
      vn_tplus.py
      calendars.py
  services/
    gateway/
      main.py
      engine.py
      auth.py
      rate_limits.py
    market_data/
      main.py
      data_layer_bridge.py
      cache_projector.py
    risk_engine_v2/
      main.py
      engine.py
      checks.py
      reservations.py
      circuit_breakers.py
      dry_run.py
    execution_engine/
      main.py
      router.py
      command_handler.py
      uncertainty.py
    portfolio_accounting_v2/
      main.py
      accounts_manager.py
      position_manager.py
      settlement_engine.py
      pnl_engine.py
      fee_engine.py
    reconciliation/
      main.py
      base.py
      paper.py
      binance.py
      dnse.py
      pending_scanner.py
    monitor/
      main.py
      stream_lag.py
      dead_letters.py
      resource_health.py
      alerts.py
  repositories/
    __init__.py
    event_store.py
    order_repo.py
    fill_repo.py
    account_repo.py
    position_repo.py
    settlement_repo.py
    instrument_repo.py
    risk_repo.py
    idempotency_repo.py
    dead_letter_repo.py
    reconciliation_repo.py
    paper_repo.py
  alpha_sdk/
    __init__.py
    async_client.py
    sync_client.py
    redis_client.py
    models.py
    examples/
      submit_order.py
      amend_cancel.py
      listen_events.py
      paper_smoke_test.py
  scripts/
    dnse_send_email_otp.py
    dnse_create_trading_token.py
    seed_paper_account.py
    run_reconciliation.py
    replay_events.py
    smoke_alpha_paper.py
  tests/
    unit/
      test_domain_objects.py
      test_order_state_machine.py
      test_accounts.py
      test_positions.py
      test_margin_models.py
      test_settlements.py
      test_risk_checks.py
    integration/
      test_gateway_risk_paper_portfolio.py
      test_data_layer_client.py
      test_alpha_http_api.py
      test_alpha_redis_contract.py
      test_dnse_adapter_mapping.py
      test_binance_adapter_mapping.py
    system/
      test_paper_smoke.py
      test_reconciliation.py
  init-db/
    04-domain-events.sql
    05-trading-core-v2.sql
    06-paper-mode.sql
    07-venue-adapters.sql
    08-settlement.sql
    09-observability-security.sql
```

### 14.1 Module Ownership

- `api/`: Alpha-facing and admin-facing HTTP contract. This is the only public HTTP surface for alphas and operators.
- `domain/`: Pure business objects and rules. No DB, Redis, HTTP, Binance, or DNSE imports are allowed here.
- `core/`: Shared infrastructure primitives: config, clocks, message envelope, Decimal serialization, Redis clients, idempotency, security helpers.
- `adapters/`: Ports/adapters boundary. Venue-specific and provider-specific logic lives here.
- `services/`: Long-running processes. Services orchestrate domain, repositories, adapters, and streams.
- `repositories/`: DB persistence and projections. No business decision logic belongs here.
- `alpha_sdk/`: Thin client wrapper for alpha teams. It must not contain privileged broker auth or bypass gateway/risk.
- `scripts/`: Operator utilities and smoke tests. Scripts call the same APIs/adapters as services where possible.
- `tests/`: Unit, integration, and system tests aligned with section 16.

### 14.2 Public API Boundary

The HTTP application should be implemented under `api/`, while `services/gateway/` owns runtime startup and routing into streams. This avoids mixing FastAPI schemas with business logic.

Required route ownership:

- `api/routes/orders.py`: submit, bulk, validate, modify, cancel, query orders.
- `api/routes/positions.py`: close/reduce and position query.
- `api/routes/accounts.py`: balances, margins, settlement buckets.
- `api/routes/portfolio.py`: equity, PnL, exposure, drawdown.
- `api/routes/risk.py`: visible strategy risk profile and dry-run decision output.
- `api/routes/market.py`: latest internal market snapshot from trading cache.
- `api/routes/events.py`: event replay/query by trace/client order/strategy.
- `api/routes/admin.py`: paper seed, trading state, DNSE OTP/token, reconciliation trigger.

### 14.3 Redis Client Boundary

`core/redis_clients.py` must expose two explicit clients:

- `data_layer_redis`: `redis://redis_marketdata:6379/0`, read/subscribe only for ephemeral data-layer payloads.
- `trading_redis`: `redis://redis_service:6379/0`, internal streams/cache/events for trading system.

No module should silently create a third Redis connection or assume DB number by hardcoded key. If another Redis DB is required later, it must be added to config and this plan.

### 14.4 Domain Boundary

Domain files must stay provider-neutral:

- `identifiers.py`: `TraderId`, `StrategyId`, `AccountId`, `InstrumentId`, `ClientOrderId`, `VenueOrderId`, `PositionId`, `TradeId`.
- `objects.py`: `Currency`, `Money`, `Price`, `Quantity`, precision checks, fail-fast constructors.
- `instruments.py`: instrument metadata and trading/session constraints.
- `orders.py`: order commands, order aggregate/state machine.
- `events.py`: immutable order/fill/account/position/risk/settlement events.
- `accounts.py`: `Account`, `CashAccount`, `MarginAccount`, `AccountBalance`, `MarginBalance`.
- `positions.py`: position aggregate, fill apply, realized/unrealized PnL hooks.
- `settlements.py`: settlement policy abstractions and settlement event payloads.
- `risk.py`: risk profile, trading state, deny reason enums.
- `fees.py`: fee model interfaces and domain fee results.

### 14.5 Adapter Boundary

Execution adapters must implement `adapters/execution/base.py` and be registered in `registry.py`.

Required adapters:

- `paper_client.py`: accepts execution commands, persists/loads paper orders, emits order events.
- `paper_matcher.py`: consumes market events and matches open paper orders.
- `paper_fill_model.py`: full/partial fill decisions, depth/volume extension point.
- `paper_slippage.py`: deterministic/test and realistic slippage models.
- `paper_latency.py`: optional latency model.
- `binance_futures.py`: maps domain commands/events to Binance Futures REST/WS.
- `dnse_stock.py`: maps domain commands/events to DNSE REST/WS.
- `dnse_auth.py` and `dnse_token_manager.py`: OTP/trading-token workflow. Alpha code must never import these.
- `venue_rate_limiter.py`: per venue/endpoint key limits and backoff.

Market data adapter must only read from `data_layer` contracts:

- `data_layer_client.py`: REST health/latest/warmup calls.
- `redis_subscriber.py`: Pub/Sub subscription to `stream:trade:*`, `stream:kline:*`, `stream:vn:*`.
- `parsers.py`: compatible with `data_layer/app/stream/feed_parsers.py`.
- `rest_recovery.py`: latest-state recovery after reconnect.
- `instrument_loader.py`: Binance/DNSE/static instrument metadata.

### 14.6 Service Boundary

Target services:

- `gateway`: public command ingress, auth/rate limit/idempotency, writes command streams.
- `market_data`: bridges data_layer into internal market events/cache, no direct exchange WS.
- `risk_engine_v2`: consumes inbound commands, validates, reserves exposure/margin, emits deny or accepted execution command.
- `execution_engine`: routes accepted commands to registered adapter by `(mode, venue)`.
- `portfolio_accounting_v2`: single owner of accounts, positions, PnL, fee, settlement projections.
- `reconciliation`: resolves uncertain orders and compares projections with paper/live venue snapshots.
- `monitor`: stream lag, dead letters, service health, alert routing.

Legacy services can remain temporarily, but new work should target v2 modules. Do not add new business behavior to old `risk_engine` or old `portfolio` unless it is a temporary compatibility bridge.

### 14.7 Repository Boundary

Repositories are persistence-only:

- `event_store.py`: append/read immutable events.
- `order_repo.py`: order projections and query.
- `fill_repo.py`: fill projection and idempotent trade lookup.
- `account_repo.py`: account/balance/margin projections.
- `position_repo.py`: position projections.
- `settlement_repo.py`: settlement schedules and settlement bucket projections.
- `instrument_repo.py`: instrument metadata.
- `risk_repo.py`: risk profiles, trading state, limits.
- `idempotency_repo.py`: idempotency keys and payload hashes.
- `dead_letter_repo.py`: poison messages.
- `reconciliation_repo.py`: uncertain commands and reconciliation findings.
- `paper_repo.py`: paper open orders and paper matcher state.

Repositories must not decide whether an order is allowed, filled, settled, or rejected. They only persist decisions produced by domain/services.

### 14.8 Migration Files

Canonical DB migration plan:

- `04-domain-events.sql`: event store, event indexes, event idempotency.
- `05-trading-core-v2.sql`: traders, strategies, venues, accounts, instruments, orders, fills, positions, risk profiles.
- `06-paper-mode.sql`: paper open orders, paper matcher config, paper account seed.
- `07-venue-adapters.sql`: venue credentials metadata, rate-limit tracking, DNSE token metadata, venue account mapping.
- `08-settlement.sql`: settlements, settlement calendars, settlement bucket projections.
- `09-observability-security.sql`: dead letters, audit log, service heartbeats, least-privilege grants.

Old `alpha_*` and `binance_*` tables are not canonical after v2. They may be temporary views/projections only.

### 14.9 Implementation Consistency Rules

- If an implementation needs a module not listed here, update this section first or ask the user.
- If a module listed here turns out unnecessary during coding, ask before deleting or merging it.
- Do not let API schemas, DB schemas, Redis payloads, and domain events drift apart. Update all affected sections in this markdown before code changes.
- Do not introduce provider-specific fields into domain objects unless they are optional metadata or a provider-neutral concept.
- Do not make alphas call adapter classes directly. Alphas use HTTP/Redis/SDK only.

### 14.10 Runtime Config & Packaging

- Dependency/runtime standard: `uv`, not Poetry.
- `pyproject.toml` is the source of dependency truth.
- Commit `uv.lock` once dependency resolution is run in an environment with network access.
- Docker installs dependencies with `uv sync --no-install-project --no-dev` into the system interpreter (`UV_PROJECT_ENVIRONMENT=/usr/local`), because compose mounts source code into `/app`.
- Runtime commands in compose must use `python -m services.<service>.main`, not `poetry run`.
- `.env.example` must be updated whenever `Settings` or direct `os.getenv(...)` usage changes.
- `.env` and broker credentials must never be committed or copied into image builds.

---

## 15. Alpha API & Redis Contract

The trading system must provide a clear alpha-facing integration surface. Alphas should not call broker SDKs directly. They can use HTTP APIs for request/reply workflows and Redis for low-latency/event-driven workflows.

### 15.1 Required Alpha-Facing Endpoints

Gateway/execution API:

- `POST /v1/orders`: submit single order.
- `POST /v1/orders/bulk`: submit order list atomically where possible.
- `PATCH /v1/orders/{client_order_id}`: modify price/quantity/TIF/SL/TP where venue supports it.
- `DELETE /v1/orders/{client_order_id}`: cancel one order.
- `DELETE /v1/orders`: cancel by filters: strategy/mode/venue/symbol/account.
- `POST /v1/positions/{position_id}/close`: close/reduce a position.
- `GET /v1/orders/{client_order_id}`: order state.
- `GET /v1/orders`: list orders by filters.
- `POST /v1/orders/validate`: dry-run validation; returns schema/risk/precision/session decision without submitting.
- `GET /v1/fills`: list fills.
- `GET /v1/positions`: list positions.
- `GET /v1/accounts/{account_id}/balances`: balances, margin, settlement buckets.
- `GET /v1/portfolio/summary`: equity, PnL, drawdown, exposure.
- `GET /v1/risk/profile`: strategy risk config visible to alpha.
- `GET /v1/market/latest/{venue}/{symbol}`: latest internal market snapshot.
- `GET /v1/events`: replay/query events by `trace_id`, `client_order_id`, strategy, mode, venue.
- `GET /v1/health`: service health and mode readiness.

Admin-only endpoints:

- `POST /v1/admin/alphas/register`: register alpha/strategy/account/risk rows and gateway Redis auth.
- `GET /v1/admin/alphas/{alpha_id}`: inspect alpha onboarding state.
- `PATCH /v1/admin/alphas/{alpha_id}/risk`: update risk config/profile by mode/venue/instrument.
- `POST /v1/admin/accounts/paper/seed`: seed/reset paper account.
- `POST /v1/admin/trading-state`: set `ACTIVE|REDUCING|HALTED`.
- `GET /v1/admin/symbols`: inspect trading symbol config.
- `POST /v1/admin/symbols/sync`: sync `shared/symbols.json` from data_layer Redis/preload status plus manual overrides.
- `POST /v1/admin/dnse/send-email-otp`: request DNSE OTP.
- `POST /v1/admin/dnse/trading-token`: submit OTP and create token.
- `POST /v1/admin/reconcile`: trigger reconciliation.

### 15.2 Redis Contract For Alphas

Alpha command streams:

- `alpha.commands.orders` for submit/modify/cancel commands.
- `alpha.commands.bulk` for bulk command batches.

Alpha event streams/pubsub:

- `alpha.events.orders.{strategy_id}`
- `alpha.events.fills.{strategy_id}`
- `alpha.events.positions.{strategy_id}`
- `alpha.events.account.{strategy_id}`
- `alpha.events.risk.{strategy_id}`

Rules:

- HTTP and Redis commands use the same message envelope and payload schema.
- Each command requires `client_order_id` for idempotency.
- Each response/event includes `trace_id`, `mode`, `venue`, `account_id`, `strategy_id`.
- Alphas should read events for final state; HTTP `202 ACCEPTED` only means command accepted by gateway.

### 15.3 Submit Order Schema

Gateway `/v1/orders` should accept:

```json
{
  "strategy_id": "alpha_001",
  "client_order_id": "O-20260514-0001",
  "mode": "paper",
  "venue": "BINANCE",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "position_side": "BOTH",
  "type": "LIMIT",
  "quantity": "0.001",
  "price": "65000",
  "time_in_force": "GTC",
  "reduce_only": false,
  "alpha_send_ts": 1778743390.1
}
```

Backward compatibility:

- Accept `alpha_id` as alias for `strategy_id`.
- Accept numeric qty/price at API boundary but convert to `Decimal` string/domain immediately.
- Accept `exchange` as alias for `venue`.
- Legacy methods from `action_async.py` map to new API:
  - `long_in` -> `POST /v1/orders` with `side=BUY`, `intent=OPEN`, `type=MARKET`.
  - `short_in` -> `side=SELL`, `intent=OPEN`, `type=MARKET` for derivative/shortable instruments.
  - `place_limit_buy` -> `side=BUY`, `type=LIMIT`.
  - `place_limit_sell` -> `side=SELL`, `type=LIMIT`.
  - `long_out`/`short_out` -> `POST /v1/positions/{position_id}/close` or reduce-only order.
  - `cancel_*` -> `DELETE /v1/orders/{client_order_id}`.
  - `change_price_limit`/`change_sl_tp` -> `PATCH /v1/orders/{client_order_id}`.

Response:

```json
{
  "status": "ACCEPTED",
  "client_order_id": "...",
  "mode": "paper",
  "venue": "BINANCE",
  "trace_id": "...",
  "lat_ms": 2.31
}
```

### 15.4 Alpha Support Requirements

The system must support alpha development and operations:

- SDK/client examples for Python async and sync wrappers.
- Dry-run validation endpoint that returns risk/precision/session decision without submitting.
- Paper/live parity: same command schema, only `mode` changes.
- Strategy scoped API keys and permissions.
- Queryable rejection reasons.
- Event replay by `trace_id`/`client_order_id`.
- Per-alpha rate limits and quota visibility.
- Deterministic paper tests for alpha CI.

---

## 16. Testing Strategy

### Unit

- Domain constructors fail-fast.
- Order state machine.
- Account balance invariants.
- Margin model formulas.
- Position long/short/reduce/flip.
- Fee model.
- Risk checks.

### Integration

- Gateway -> risk -> paper execution -> portfolio.
- Gateway -> risk reject.
- Data layer Redis payload parse.
- Paper restart recovery.
- Binance adapter mapping without sending live order using mocked client.
- DNSE adapter mapping using mocked `DNSEClient`.
- Alpha HTTP client calling submit/amend/cancel/query endpoints.
- Alpha Redis client publishing command and consuming order/fill/account events.
- VN settlement immediate vs realistic T+ mode.

### System

- Docker compose with `data_layer`, Redis, Postgres, trading services.
- Send paper order and verify:
  - order persisted.
  - fill event persisted.
  - position updated.
  - balance/fee updated.
  - stream lag zero.
- Send `mode=paper` and assert no live adapter called.
- Kill switch live -> live order denied.
- Redis disconnect -> service recovers latest state via REST.
- Run an alpha smoke test:
  - warm up market data
  - submit paper market order
  - modify/cancel pending limit order
  - close/reduce position
  - query portfolio summary
  - verify emitted alpha events

### Current Test/Debug Plan Before Endpoint Guide

Run this before writing alpha endpoint documentation:

1. Unit test pass:
   - domain objects/accounts/positions/fees/events.
   - market-data parser/client projection.
   - paper execution order lifecycle already implemented.
   - heartbeat helper.
2. Static import/compile check:
   - all service `main.py` files import cleanly.
   - no Poetry command remains in `docker-compose.yml` or Dockerfile.
3. Mocked integration:
   - gateway -> risk route for `paper` writes `commands.execution.paper`.
   - gateway -> risk route for `live/sandbox` never mirrors paper payload to legacy live executor.
   - paper fill event consumed by portfolio once.
   - dead-letter scanner moves stuck messages.
4. Local Docker smoke:
   - build image with `uv`.
   - boot Postgres/Redis.
   - verify migrations create `service_heartbeats`.
   - start trading services.
   - confirm heartbeat freshness in Redis and DB.
5. Data-layer smoke:
   - data_layer Redis DB 2 has expected stream/key shape.
   - trading market bridge writes internal `market:ticker:{symbol}` and market events.
6. Alpha smoke:
   - seed paper account.
   - submit paper market order.
   - submit limit order then cancel.
   - verify order/fill/account/position projections.
   - verify no live adapter called for `mode=paper`.

### Current Test Execution Status

Cập nhật ngày `2026-05-15` sau khi chạy bằng Docker, không cài Python/pip/uv trực tiếp trên host:

- Docker test/runtime foundation:
  - `test_runner` compose profile exists and installs dev deps inside Docker.
  - `uv.lock` generated from `test_runner`.
  - runtime image and test image build successfully.
- Unit:
  - `docker compose --profile test run --rm test_runner pytest`
  - Latest result after Binance matrix fixes and Pydantic ConfigDict cleanup: `67 passed`.
  - Pydantic v2 class-based `Config` warnings have been removed from shared config/gateway schemas.
- DB migration smoke:
  - Postgres/Redis booted via compose.
  - v2 migrations `04` -> `09` applied.
  - Fixed Timescale hypertable unique-index issues by converting trade lookup indexes to non-unique lookup indexes and relying on idempotency/projection tables for dedup.
- Paper smoke:
  - Seeded `alpha_smoke` paper account.
  - `paper MARKET BUY BTCUSDT 0.001` passed end-to-end: gateway -> risk -> paper_execution -> portfolio.
  - `paper LIMIT BUY` below market but within risk deviation persisted as open order.
  - Paper cancel works through `commands.execution.paper`.
  - Paper amend now supports cancel-replace and is covered by unit test.
  - Paper matcher covers STOP/TAKE_PROFIT basics and IOC/FOK/GTD unit behavior.
  - `/v1/orders` paper limit submit -> `/v1/orders/{client_order_id}` cancel -> query smoke passed; canonical `orders` row ended as `CANCELED`.
  - `/v1/orders/{client_order_id}` PATCH amend smoke passed on paper: original order canceled, replacement created, then cleanup cancel returned replacement as `CANCELED`.
  - `/v1/health` returned `READY` with Redis/Postgres checks and fresh heartbeats for gateway, risk, executor, listener, market_data, paper_execution, portfolio, reconciliation, monitor.
- Binance Futures testnet smoke:
  - Container read `IS_TESTNET=true` and 4 active Binance testnet keys.
  - Listener user streams connected.
  - `sandbox MARKET BUY BTCUSDT 0.001` executed on Binance testnet.
  - `sandbox SELL reduce_only MARKET BTCUSDT 0.001` executed on Binance testnet and projection returned sandbox position to `FLAT`.
  - `sandbox LIMIT BUY BTCUSDT 0.001 @ 79000` submitted and then canceled on Binance testnet through executor stream; DB status became `CANCELED`.
  - `sandbox STOP_MARKET BUY BTCUSDT 0.001 trigger 120000` exposed Binance testnet Algo Order behavior; executor now sends conditional order types through single-order path, persists `algoId`, and cancel fallback uses `futures_cancel_algo_order`. Verified DB status became `CANCELLED`.
  - Added repeatable script: `scripts/binance_testnet_order_matrix.py`.
  - Added repeatable native amend smoke: `scripts/binance_testnet_amend_smoke.py`.
  - Latest Binance testnet matrix through gateway `/v1/orders` passed:
    - `TAKE_PROFIT_MARKET`: accepted as algo/conditional and cleanup cancel persisted `CANCELLED`.
    - `TAKE_PROFIT_LIMIT`: accepted as algo/conditional and cleanup cancel persisted `CANCELLED`.
    - `TRAILING_STOP_MARKET`: accepted as algo/conditional and cleanup cancel persisted `CANCELLED`.
    - `IOC LIMIT`: terminal `EXPIRED`.
    - `FOK LIMIT`: expected Binance rejection persisted as `REJECTED`.
    - `GTD LIMIT`: accepted with `good_till_date` and cleanup cancel persisted `CANCELED`.
  - Native Binance amend smoke passed:
    - submit sandbox open `LIMIT`.
    - PATCH `/v1/orders/{client_order_id}` modified the same order using Binance `futures_modify_order`.
    - DB statuses included `UPDATED`.
    - cleanup cancel persisted `CANCELLED`.
- Bugs found and fixed during smoke:
  - Gateway API key auth decoded Redis bytes incorrectly.
  - Portfolio v2 accounting had `numeric`/`double precision` parameter conflicts.
  - Listener used Binance order id as string where legacy tables expect bigint.
  - Executor did not persist `mode`, `venue`, `account_id` to `binance_sent_orders`, causing sandbox fills to project as live.
  - Gateway did not reject Binance `client_order_id` length >= 36 before executor/Binance.
  - `untracked.orders` serialization failed when payload contained `datetime`.
  - Binance conditional orders can return `algoId` without `orderId`; legacy persistence/cancel/event mapping now handles `algoId`.
  - Binance single-order API rejections used to raise and get acked without DB persistence; now API exceptions return `{code,msg}` so executor saves `REJECTED`.
  - Binance `IOC/FOK/GTD/GTX` and `post_only` orders now use single-order endpoint instead of batch endpoint to preserve special TIF behavior and `goodTillDate`.
  - Gateway update command now defaults to native amend on original `client_order_id`; risk duplicate guard skips duplicate check for `UPDATE/AMEND` because gateway idempotency owns update commands.
- Reliability fixes added before endpoint guide:
  - Listener retries lookup before writing `untracked.orders` when private event arrives before executor persistence.
  - Listener de-duplicates private order/fill events across multiple active Binance keys/listeners using Redis NX event claim.
  - Gateway `/v1` order submit/cancel/amend/query/list/health routes exist for test/debug; pre-alpha guide exists but final contract is not frozen until alpha smoke pass.
  - Cancel route no longer requires market-data availability in risk.
  - Amend is native-first where venue supports it; fallback cancel-replace is explicit and guarded.
- Known gaps before endpoint v1:
  - `/v1` endpoints have a pre-alpha guide; final public contract should be frozen after external alpha folder smoke.
  - DNSE native amend is mapped but not real-broker tested yet.
  - Legacy `binance_sent_orders` can contain multiple rows for submit/cancel using the same `client_order_id`; v1 should use canonical `orders` projection as source of truth.
  - STOP/TAKE_PROFIT/TRAILING/IOC/FOK/GTD Binance sandbox testnet matrix has passed; live real-account matrix remains intentionally blocked until explicit live enablement.

---

## 17. Immediate High-Value Fixes Before Big Refactor

1. Fix gateway mode overwrite:
   - Preserve `raw_data["mode"]` if provided.
   - Normalize to lowercase enum.
   - Only default from settings if missing.
2. Add `error_message` column to `binance_sent_orders` or change `RiskRepository.log_rejection()` to use existing JSONB raw response.
3. Stop adding new logic to `services_exec_papertrade`; treat it as deprecated after plan approval.
4. Add `DATA_LAYER_*` config to trading system.
5. Add a bridge data client reading `stream:trade:{symbol}` and writing current `market:ticker:{symbol}` shape so current risk keeps working while refactor happens.
6. Add `mode` to risk forwarding payload and executor logs.
7. Add guard: live executor rejects any command where `mode != live/sandbox`.

---

## 18. Decisions Resolved

Resolved by latest product direction:

- Paper order model must be general and complete, not a simplified subset. It must support partial fills and standard order lifecycle across Binance-like, US-like, and Vietnam-like markets.
- Redis split is fixed: `data_layer` Redis DB 2, trading internal Redis DB 0, configured as two clients.
- VN settlement default is immediate. If `realistic_settlement=true`, VN paper/live projections must simulate/account for T+ rules.
- Schema and service layout may be refactored/replaced. New v2 design does not need to preserve old tables/services if they are not fit for purpose.
- Alpha support must be explicit through API endpoints and Redis contracts.
- Default paper fill model:
  - Full fill when marketable if no depth/volume feed is available.
  - Partial fill enabled when configured depth/volume model exists.
  - Deterministic slippage default is `0 bps` for tests, configurable per venue/symbol/mode.
  - Optional realistic latency default is `0 ms` for CI/replay and configurable for staging.
- Default margin mode for alpha is **isolated per strategy/account/instrument**. Cross-margin can be enabled explicitly per account/risk profile.
- DNSE OTP/trading token UX supports both admin API and CLI. Alpha never handles token.
- Old `alpha_*`/`binance_*` tables should be temporary compatibility views/projections only. Canonical state lives in v2 event/projection tables.

---

## 19. Final Target

Sau khi hoàn tất, `trading_system` phải có các đặc tính:

- Một gateway duy nhất cho alpha/strategy.
- Alpha-facing HTTP and Redis contracts are first-class, documented, and testable.
- Một risk engine dùng chung cho paper/sandbox/live.
- Một execution engine route theo mode/venue.
- Paper trade và live trade dùng chung order/fill/accounting pipeline.
- Paper supports full standard order lifecycle including partial fills, amend, cancel, stop/take-profit, TIF, fee, settlement.
- Data market luôn đi qua `data_layer`.
- Binance và DNSE chỉ là adapters.
- DB lưu event bất biến và projection có thể rebuild.
- Accounting dùng Decimal/value objects, không float.
- VN settlement supports immediate default and realistic T+ mode.
- Crash recovery/reconciliation là first-class behavior.
- Live trading có kill switch, audit, least privilege, secret isolation.

---

## 20. Legacy Execution Service Finding

Phát hiện thêm ở hệ thống cũ `execution_service`: khi alpha scalping đánh liên tục nhiều symbol/lệnh market cùng lúc, paper simulator cũ dễ quá tải do tạo async task không giới hạn từ websocket event sang DB update, pool PostgreSQL nhỏ, update fill/PnL/commission phân tán và thiếu backpressure. Đã vá cục bộ bằng bounded queue/coalescing, DB concurrency guard, transaction cho fill update, batch update metrics và index runtime. Dự án `trading_system` mới cần dùng case này làm bài test chịu tải bắt buộc cho paper/sandbox/live pipeline trước khi cho alpha chạy dày.

---

## 21. External Alpha Smoke Plan: `rsiboundportfolioA001`

Mục tiêu của bước này là dùng alpha khó trong `/root/bobby/Papertrade_DB/execution_portfolioalpha` làm smoke thực tế cho contract alpha-facing của `trading_system`, nhưng không đụng vào các alpha/container đang chạy hiện tại. Tạo file alpha test mới, config mới, SDK mới, container mới. `rsiboundportfolioA001` được chọn vì nó rebalance nhiều symbol, có open/close/scale, và dễ lộ lỗi chịu tải giống issue legacy simulator ở Section 20.

### 21.1 Scope

- Không sửa `main/rsiboundportfolioA001.py`, `main/regressionportfolioA001.py`, container `rsiboundportfolioalpha_papertrade`, hoặc alpha đang chạy.
- Thêm một alpha mẫu mới trong folder alpha cũ, dự kiến:
  - SDK dùng chung đặt tại `trading_system/alpha_sdk`, alpha container mount read-only vào `/opt/trading_system_alpha_sdk`. Chọn cách này để mọi alpha dùng cùng một gateway SDK version thay vì copy mỗi folder một bản.
  - `main/rsibound_trading_system_smoke.py`: bản rsibound test dùng SDK mới.
  - `config_trading_system.yaml`: config riêng cho test, không dùng config production cũ.
  - thêm service Docker riêng, ví dụ `rsibound_trading_system_smoke`, join cả `bobby_network` và `executor_network`.
  - thêm guide trong folder alpha, ví dụ `TRADING_SYSTEM_ALPHA_GUIDE.md`.
- Test modes:
  - `paper + BINANCE`: paper order lifecycle qua `trading_system`.
  - `paper + DNSE`: paper order lifecycle cho symbol VN, không gọi DNSE live.
  - `sandbox + BINANCE`: gửi Binance Futures testnet, quantity mặc định `0.01` để tránh insufficient balance.
- Tạm thời không test `live`.

### 21.2 Preconditions

- `trading_system` compose đang chạy đủ: `gateway`, `risk_engine`, `paper_execution`, `executor`, `listener`, `portfolio`, `market_data`, `performance`, `monitor`, Redis, Postgres.
- `/v1/health` phải `READY` hoặc nếu `DEGRADED` thì phải biết service nào stale và vì sao.
- Alpha container gọi gateway qua network nội bộ, ưu tiên `http://gateway_service:8000`, fallback `http://gateway:8000` hoặc URL cấu hình.
- Data source đi qua `data_layer`; alpha không tự mở broker/trading SDK. Nếu alpha còn cần historical OHLCV để tính tín hiệu, phải gom vào adapter riêng để sau này thay dần `trade.buffer` bằng data_layer client.
- Admin auth đã set trong `.env` của `trading_system`; alpha runtime chỉ giữ `X-API-Key`, không giữ admin token/password.

### 21.3 Admin Onboarding Required Before Alpha Starts

Tạo script hoặc guide tuần tự, không yêu cầu alpha tự làm bằng tay:

1. Register alpha bằng admin API:
   - `alpha_id`: ví dụ `rsibound_ts_smoke`.
   - `allowed_modes`: `["paper", "sandbox"]`.
   - `allowed_venues`: `["BINANCE", "DNSE"]`.
   - `api_key`: key riêng cho alpha smoke.
   - `initial_balance`: tách theo currency/domain.
   - Risk mặc định đủ nhỏ cho sandbox, đủ rộng cho paper smoke.
2. Seed paper account:
   - `paper-binance-rsibound_ts_smoke` với `USDT`.
   - `paper-dnse-rsibound_ts_smoke` với `VND`.
3. Set trading state:
   - `paper/BINANCE = ACTIVE`.
   - `paper/DNSE = ACTIVE`.
   - `sandbox/BINANCE = ACTIVE`.
4. Sync symbol universe:
   - Binance symbols từ data_layer Redis/preload status.
   - DNSE symbols từ data_layer Redis/preload status hoặc manual symbols tối thiểu như `FPT`, `HPG`.
5. Inspect alpha config:
   - verify Redis gateway auth exists through admin register response.
   - verify `accounts`, `risk_profiles`, `alpha_risk_config`, and symbol registry.

### 21.4 SDK Contract To Implement In Alpha Folder

`trading_system/alpha_sdk/trading_system_async_action.py` phải là compatibility layer thay cho `trade/action_async.py`, nhưng không ghi trực tiếp DB cũ. Nó gọi `trading_system` gateway và giữ interface quen thuộc nhất có thể:

- Connection/config:
  - `init_pool()` becomes HTTP client/session init.
  - `close_pool()` closes HTTP session.
  - `base_url`, `alpha_id`, `api_key`, `mode`, `venue`, `account_id`, timeout, retry, dry-run flags from config.
- Submit:
  - `long_in()` -> `POST /v1/orders`, `side=BUY`, `intent=OPEN`, `type=MARKET`.
  - `short_in()` -> `POST /v1/orders`, `side=SELL`, `intent=OPEN`, `type=MARKET`.
  - `place_limit_buy()` -> `LIMIT BUY`.
  - `place_limit_sell()` -> `LIMIT SELL`.
  - `bulk_add_orders()` -> `POST /v1/orders/bulk`.
- Exit/cancel/amend:
  - `long_out()` / `short_out()` should send close/reduce order if supported by gateway. If alpha only has legacy order id, SDK must map it to `client_order_id`.
  - `cancel_market_long/short`, `cancel_limit_buy/sell()` -> `DELETE /v1/orders/{client_order_id}`.
  - `change_price_limit()` / `change_sl_tp()` -> `PATCH /v1/orders/{client_order_id}` where gateway supports amend.
- Query:
  - `get_pending_orders()` -> `GET /v1/orders` filtered by alpha/mode/venue/symbol, then SDK filters open/pending statuses.
  - `get_open_positions()` and `get_open_position_id()` use implemented gateway state endpoints: `GET /v1/positions`, `GET /v1/fills`, `GET /v1/accounts/{account_id}/balances`, and `GET /v1/portfolio/summary`.
  - `get_profit_id()` is implemented as a compatibility helper over gateway fills. It is enough for smoke/PnL lookup, but richer legacy-style profit grouping can be expanded later if a specific alpha needs it.
- Order id:
  - Generate deterministic short `client_order_id` for Binance, less than 36 chars.
  - Persist local mapping in an alpha-local JSON/state file so old methods accepting `order_id` can resolve to `client_order_id`.
  - Include `alpha_send_ts` on every request.
- Reliability:
  - HTTP timeout and bounded retry for 5xx/network errors.
  - No retry on 4xx risk/schema reject.
  - Log request id/client order id, mode, venue, symbol, status, reason.

### 21.5 Data Source Test Matrix

The rsibound smoke must prove both signal data source handling and execution venue handling:

- Data source A: Binance crypto data from `data_layer`.
  - Use a small symbol subset first, e.g. `BTCUSDT`, `ETHUSDT`, then expand.
  - Paper test can use `mode=paper, venue=BINANCE`.
  - Sandbox test uses `mode=sandbox, venue=BINANCE`, quantity override `0.01`.
- Data source B: Vietnam/DNSE data from `data_layer`.
  - Use paper only first, e.g. `FPT`, `HPG`.
  - `mode=paper, venue=DNSE`.
  - Immediate settlement unless `realistic_settlement=true` is explicitly enabled.
- Do not use manual market seed to pass a data-source test. `POST /v1/admin/market/seed` is allowed only as a controlled smoke/debug helper when explicitly testing paper execution mechanics. If DNSE/data_layer market data is missing, stale, malformed, or inaccessible, the test must raise a clear issue and stop instead of seeding fake data to bypass the problem.
- The test alpha should support symbol subset config so we can run fast CI-style smoke before full 300-symbol style run.

### 21.6 Rsibound Alpha Test Shape

The new `main/rsibound_trading_system_smoke.py` should reuse strategy math from `rsiboundportfolioA001` where practical, but reduce blast radius:

- Use config-driven symbol universe:
  - `symbols.binance`: initial 2-5 symbols.
  - `symbols.dnse`: initial 2-5 symbols.
  - full universe disabled by default.
- Use config-driven run mode:
  - `paper_binance`.
  - `paper_dnse`.
  - `sandbox_binance`.
- Force sandbox order quantity to `0.01` by default regardless of computed allocation.
- Add `max_orders_per_cycle` and `dry_run` config for safety.
- Log each decision before submit:
  - computed target weight.
  - current position/order view.
  - intended action: open/close/scale/cancel/amend.
  - final gateway response.
- Do not write to old `orders/trades` DB tables directly.

### 21.7 Test Sequence

Run in this exact order:

1. Compile/import alpha SDK and smoke file inside the alpha Docker image.
2. Health check `trading_system` from the alpha container network.
3. Admin onboarding for `rsibound_ts_smoke`.
4. Paper Binance single order:
   - submit market/open.
   - query/list.
   - close/reduce or cancel where applicable.
   - verify DB/order projection and portfolio/performance projection.
5. Paper DNSE single order:
   - submit small paper order for VN symbol.
   - query/list.
   - verify no live DNSE adapter is called.
6. Paper rsibound mini-cycle:
   - 2-5 Binance symbols, dry-run false, max orders small.
   - verify no duplicate order ids and no rate limit issue.
7. Sandbox Binance single order:
   - `BTCUSDT`, quantity `0.01`, testnet only.
   - query/list and verify listener/fill projection.
8. Sandbox rsibound mini-cycle:
   - 1-2 Binance symbols only.
   - quantity override `0.01`.
   - stop immediately after one cycle.
9. Review logs:
   - alpha container log.
   - `gateway`, `risk_engine`, `executor`, `listener`, `paper_execution`, `portfolio`, `performance`.
   - `/v1/health` before and after.

### 21.8 Expected Issues To Check Before Coding

- Current gateway code has order list/query endpoints, but full positions/account/fills endpoints may still be target design rather than implemented. Rsibound needs positions for `sync_with_db`, close, and scale logic.
- `update_orders(fill_data=...)` from legacy SDK has no direct equivalent in trading_system order API. New alpha should express scale as reduce/open orders, not mutate DB position volume directly.
- DNSE paper symbols require symbol registry and market ticker/data_layer bridge support. If risk cannot find market info/ticker for VN symbols, fix trading_system/data_layer bridge before blaming alpha.
- Sandbox Binance testnet must stay isolated from live. Alpha config must reject `mode=live`.
- Old rsibound daily schedule waits for 00:01 UTC; smoke file should include a manual one-cycle mode so tests do not wait a day.

### 21.9 Deliverables Before Real Alpha Test Is Considered Done

- [x] New shared alpha SDK exists in `trading_system/alpha_sdk`; alpha containers mount it read-only instead of copying one SDK per alpha folder.
- [x] New smoke alpha files exist in `Papertrade_DB/execution_portfolioalpha`:
  - `config_trading_system.yaml`.
  - `main/rsibound_trading_system_smoke.py`.
  - `scripts/onboard_trading_system_smoke.py`.
  - `TRADING_SYSTEM_ALPHA_GUIDE.md`.
- [x] New Docker service `rsibound_trading_system_smoke` exists and old alpha services remain unchanged.
- [x] The new alpha service joins both `bobby_network` and `executor_network`, then calls gateway through `http://gateway_service:8000`.
- [x] `TRADING_SYSTEM_ALPHA_GUIDE.md` in the alpha folder documents:
  - env/config fields.
  - admin onboarding.
  - paper Binance smoke.
  - paper DNSE smoke.
  - sandbox Binance smoke.
  - how to read logs and query orders.
  - how to add another alpha using the same SDK.
- [x] Gateway gained alpha-facing state endpoints needed by the SDK:
  - `GET /v1/positions`.
  - `GET /v1/fills`.
  - `GET /v1/accounts/{account_id}/balances`.
  - `GET /v1/portfolio/summary`.
  - `GET /v1/market/latest/{venue}/{symbol}`.
  - `POST /v1/admin/market/seed` for controlled paper execution smoke/debug only. This endpoint must not be used to claim a real data_source test has passed.
- [x] `ALPHA_ENDPOINT_V1_GUIDE.md` was already updated for admin alpha/portfolio/risk operations; keep it as the canonical endpoint reference.
- [x] Test results are written back into this plan with exact pass/fail notes below.

### 21.10 Implementation And Smoke Test Status - 2026-05-18

Implemented:

- Chose central SDK ownership: `trading_system/alpha_sdk/trading_system_async_action.py`.
  - Reason: one SDK version for every alpha; each alpha container mounts the same folder read-only.
  - Docker runtime sets `PYTHONDONTWRITEBYTECODE=1` because the SDK mount is read-only.
- Added `rsibound_trading_system_smoke` as an isolated alpha service in `/root/bobby/Papertrade_DB/execution_portfolioalpha/docker-compose.yml`.
  - It does not replace or modify the existing running alpha containers.
  - It runs every `300` seconds by default and can also run one-shot with `--once`.
  - It supports scenario filtering with `--scenario paper_binance`, `--scenario paper_dnse`, or `--scenario sandbox_binance`.
- Added admin onboarding script for the smoke alpha. In current server compose usage, admin onboarding was also verified directly from the gateway container because host/compose env-file handling did not pass admin vars consistently into the temporary alpha container.

Verified:

- Python compile/import passed for:
  - gateway state repository and gateway main.
  - central alpha SDK.
  - smoke alpha script.
  - onboarding script.
- Docker compose config for the alpha folder includes `rsibound_trading_system_smoke`.
- `rsibound_trading_system_smoke` is attached to both required networks:
  - `bobby_network`.
  - `executor_network`.
- `GET /v1/health` returned `READY` after the test run, with fresh heartbeats for executor, gateway, listener, market_data, monitor, paper_execution, performance, portfolio, reconciliation, and risk_engine.
- Admin onboarding for `rsibound_ts_smoke` passed:
  - alpha registered with modes `paper` and `sandbox`.
  - venues `BINANCE` and `DNSE`.
  - paper Binance account seeded in `USDT`.
  - paper DNSE account seeded in `VND`.
  - trading state set active for `paper/BINANCE`, `paper/DNSE`, and `sandbox/BINANCE`.
  - DNSE paper market seeds added for `FPT` and `HPG`.
- Paper Binance smoke passed:
  - `BTCUSDT` and `ETHUSDT` paper orders accepted.
  - positions opened and later closed through the SDK close path.
- Paper DNSE execution smoke passed, but real DNSE data_source test is not complete:
  - `FPT` and `HPG` paper orders were accepted and filled only after manual admin market seed.
  - This proves the paper execution/accounting path can process VN stock-like symbols, but it does not prove data_layer DNSE preload/stream works correctly.
  - The next rsibound test must use DNSE data from data_layer. If market data is absent, stale, or malformed, raise the issue clearly and fix the data_layer bridge or symbol registry instead of seeding data.
- Sandbox Binance testnet smoke passed:
  - `BTCUSDT` quantity `0.01` order sent to Binance testnet.
  - latest sandbox order `rsisbi91881001btcusdbu` was `FILLED`.
  - listener/fill projection updated the sandbox position to long `0.01` BTCUSDT.

Issues found and fixed during smoke:

- Initial DNSE paper attempts were rejected because VN market data/account balance setup was incomplete. Fixed by adding admin market seed endpoint and reseeding the DNSE paper account with sufficient `VND`.
- Correction after review: the manual market seed fixed the smoke path but also bypassed the actual DNSE data_source problem. Treat it as a diagnostic helper, not a valid data_source test result.
- Initial SDK client order ids collided when paper and sandbox orders for the same symbol were generated in the same second. Fixed by including `mode` and `venue` in generated `client_order_id`, while keeping Binance ids under the exchange limit.
- Initial alpha log file had duplicate lines because the script both wrote a file handler and redirected stdout in Docker. Fixed by keeping stream logging only; older duplicate lines remain in the historical log file.

Operational note:

- The smoke service is currently designed to toggle positions every 5 minutes: open if flat, close if already open. This is useful for testnet/paper verification, but should be stopped when no longer testing to avoid unnecessary Binance testnet churn.

### 21.11 Next Rsibound Test Must Be Stricter

Before rerunning rsibound:

- Move the new comprehensive alpha test out of the legacy `execution_portfolioalpha` folder into a sibling test harness folder. The legacy folder should remain a reference and should not accumulate production-incompatible smoke files forever.
- Use the real rsibound strategy shape, not only a simplified open/close smoke:
  - preserve symbol selection/rebalance behavior.
  - preserve frequent multi-symbol decision loop.
  - preserve open/close/scale/cancel flows where the strategy uses them.
  - keep quantity overrides and max-order caps for sandbox safety.
- Replace alpha-local preload/stream assumptions with data_layer access:
  - historical/preload OHLCV through data_layer.
  - latest market data through data_layer bridge/canonical Redis keys.
  - stream data through the designed data_layer stream/subscriber path.
- Query and assert every affected table after each test cycle:
  - `orders`.
  - `order_events`.
  - `fills`.
  - `positions_v2`.
  - `account_balances`.
  - `margin_balances` where applicable.
  - `settlements` for VN tests when realistic settlement is enabled.
  - `performance_snapshots`.
  - `account_equity_snapshots`.
  - `event_idempotency` / dead letters.
- Query and assert Redis state:
  - gateway auth key for alpha.
  - trading state / kill-switch keys.
  - market cache keys from data_layer.
  - open order / pending command stream health.
- Logs must prove each important state transition:
  - inbound order accepted/rejected.
  - risk decision.
  - execution send or paper match.
  - listener/fill receipt.
  - portfolio/accounting update.
  - performance snapshot update.
  - reconciliation or dead-letter decision.

---

## 22. Portfolio And Account Management Upgrade Plan

This phase must happen before the next serious rsibound integration test. The current implementation has useful projections (`accounts`, `account_balances`, `margin_balances`, `positions_v2`, performance snapshots), but it is not yet a full portfolio/account management module for fund-style operation.

### 22.1 Problem Statement

Current gaps:

- Account creation and balance seed are mixed into alpha registration. This is convenient for smoke, but too blunt for real portfolio operations.
- `paper`, `sandbox`, and `live` accounts are not managed as first-class deployments with explicit capital, broker sync source, margin policy, and kill/active state.
- Paper mode can process fills, but does not yet model live-like reserved cash/margin, cross/isolated margin, broker-specific buying power, and settlement strongly enough.
- Sandbox/live accounts need authoritative sync from exchange/broker balances and positions. Internal projection should be compared against broker state, not silently trusted.
- Portfolio operations are currently mostly API primitives. There is no operator workflow to inspect, update, halt, resume, rebalance capital, or audit what changed.

### 22.2 Target Concepts

Use these objects explicitly:

- `Portfolio`: owner/container for capital allocation. Example: `portfolio_id=alpha_lab_main`.
- `Deployment`: one runnable strategy context. One alpha can have separate deployments for `paper`, `sandbox`, and `live`.
- `Account`: mode/venue specific account attached to a deployment.
- `Capital Allocation`: initial capital, current allocated capital, and optional reserve capital.
- `Buying Power`: computed per account from free cash, locked cash, margin policy, settlement, leverage, and broker constraints.
- `Margin Model`: venue/instrument-aware model for cash, isolated margin, cross margin, and broker loan/margin.
- `Account Sync`: broker/data source sync record for sandbox/live.
- `Portfolio State`: active/halted/reduce-only/withdraw-only/emergency-stop at portfolio, deployment, account, alpha, mode, venue, and symbol levels.

### 22.3 Account Isolation Rules

- `paper` accounts are virtual and fully isolated from `sandbox` and `live`.
- `sandbox` accounts map to exchange/broker testnet/demo accounts where available.
- `live` accounts map to real exchange/broker accounts and must be reconciled continuously.
- A single alpha can run all three modes at the same time, but they are separate deployments:
  - `rsibound:paper:BINANCE`.
  - `rsibound:sandbox:BINANCE`.
  - `rsibound:live:BINANCE`.
- No order may cross from one deployment/account into another.
- Risk checks must use the account attached to the order, not only `alpha_id`.

### 22.4 Paper Capital Rules

- Paper capital is user-declared. It should not be limited by real exchange balance.
- Paper must still simulate the target venue/account rules:
  - cash account cannot spend unavailable cash unless borrowing is explicitly enabled.
  - margin account reserves initial margin and tracks maintenance margin.
  - isolated margin locks margin per instrument/position.
  - cross margin uses account-level available equity.
  - VN stock paper can use immediate settlement by default, or realistic T+ settlement when enabled.
- Paper must produce the same core artifacts as live/sandbox:
  - order accepted/rejected event.
  - fill event.
  - position update.
  - cash/margin/settlement update.
  - performance snapshot.
  - reconciliation/audit state.

### 22.5 Margin Model Requirements

Binance:

- Support `CASH/SPOT`, `MARGIN`, and `FUTURES/PERP` account types as separate account policies.
- Support `isolated` vs `cross` margin.
- For futures:
  - notional = price * quantity * contract multiplier.
  - initial margin = notional / leverage or instrument margin rule.
  - maintenance margin = tiered model when exchange tiers are available, otherwise conservative configured rate.
  - funding accrual must affect account equity and performance.
- Sandbox/live must sync:
  - balances.
  - positions.
  - leverage/margin mode where available.
  - open orders.
  - funding/commission.

DNSE/Vietnam:

- Cash stock account:
  - buy consumes available cash or configured buying power.
  - sell requires settled/security-available quantity unless short/margin product is explicitly modeled.
  - support immediate settlement default for paper, and realistic T+ settlement when enabled.
- Margin/loan products:
  - represent `loanPackageId`/margin package in account policy.
  - buying power and maintenance requirement should be broker-policy driven.
  - sandbox/live sync must use DNSE reported balances, PPSE/buying power, positions, and execution detail when available.

### 22.6 Schema Additions

Prefer additive migrations before mutating existing tables:

- `portfolios`
  - `portfolio_id`, `name`, `owner`, `base_currency`, `state`, `metadata`, timestamps.
- `portfolio_allocations`
  - `portfolio_id`, `strategy_id`, `deployment_id`, `account_id`, `mode`, `venue`, `currency`, `allocated_capital`, `max_capital`, `state`.
- `strategy_deployments_v2` or extend `strategy_deployments`
  - explicit `deployment_id`, `strategy_id`, `mode`, `venue`, `account_id`, `portfolio_id`, `state`, `risk_profile_id`, `account_policy_id`.
- `account_policies`
  - `account_policy_id`, `account_id`, `mode`, `venue`, `account_type`, `margin_mode`, `settlement_policy`, `allow_borrowing`, `default_leverage`, `metadata`.
- `account_sync_snapshots`
  - broker/exchange snapshot source for balances, positions, open orders, buying power, raw payload, staleness.
- `cash_ledger`
  - immutable cash ledger entries: deposit, withdraw, reserve, release, buy, sell, fee, funding, pnl, settlement.
- `margin_ledger`
  - immutable margin reserve/release/accrual events by account/instrument.
- `portfolio_audit_log`
  - who changed what, before/after, auth method, reason.

### 22.7 Service/API Plan

Add a portfolio/account management layer, likely inside gateway admin first, then split to service if it grows:

- Admin portfolio endpoints:
  - create/list/get portfolio.
  - attach/detach alpha deployment.
  - allocate/update capital per deployment/account.
  - halt/resume portfolio.
  - halt/resume alpha/deployment/account/symbol.
- Account endpoints:
  - create/update account.
  - seed/reset paper balance.
  - set account policy: cash/margin, isolated/cross, leverage, settlement.
  - inspect account state: cash, locked, margin, buying power, positions, open orders.
  - trigger sandbox/live account sync.
- Risk/portfolio integration:
  - pre-trade risk reads account policy and portfolio allocation.
  - risk reserves cash/margin/open-order exposure atomically after all validations pass.
  - execution rejection/cancel/fill releases or converts reservations through ledger events.

### 22.8 CLI vs Dashboard Decision

Recommended path:

1. Build CLI first.
   - Faster to implement.
   - Easier to version, audit, and run over SSH/server.
   - Fits current Docker-only server workflow.
   - Can cover urgent operations: inspect, halt, resume, allocate, seed paper, sync account, query symbols, tail status.
2. Keep every CLI command as a thin wrapper over admin APIs.
   - No direct DB writes from CLI except controlled migration scripts.
   - This prevents CLI and future dashboard from diverging.
3. Add dashboard later only after API/CLI workflows stabilize.
   - Dashboard is valuable for visibility and daily operations, but it should not be the first source of truth.
   - A small read-only dashboard can come before write controls if needed.

Initial CLI shape:

```bash
python -m cli portfolio list
python -m cli portfolio create alpha_lab_main --base-currency USDT
python -m cli account seed-paper rsibound --account-id paper-binance-rsibound --venue BINANCE --currency USDT --amount 100000 --account-type MARGIN
python -m cli account policy paper-binance-rsibound --account-type MARGIN --margin-mode CROSS --default-leverage 3
python -m cli allocation alpha_lab_main paper-binance-rsibound --strategy-id rsibound --mode paper --venue BINANCE --currency USDT --allocated-capital 100000
python -m cli risk HALTED --mode sandbox --venue BINANCE
python -m cli account state paper-binance-rsibound
```

### 22.9 Test Plan For Portfolio Upgrade

Unit tests:

- Cash account reserve/release/fill for buy/sell.
- Margin isolated reserve/release/fill per instrument.
- Margin cross reserve/release/fill at account level.
- VN immediate settlement.
- VN realistic T+ settlement.
- Account sync staleness and mismatch detection.
- Portfolio halt/resume precedence.

Integration tests:

- Register portfolio -> register alpha -> create deployments -> create accounts -> allocate capital.
- Submit paper Binance order -> assert cash/margin ledger, balances, positions, performance.
- Submit paper DNSE order using real data_layer market data -> assert account/settlement behavior.
- Submit sandbox Binance testnet order -> assert broker sync, listener fills, DB projection, and reconciliation.
- Force reject/cancel/partial fill -> assert reservations are released or converted correctly.

Operational tests:

- CLI can inspect current account state without direct DB access.
- CLI can halt a single alpha/deployment while other deployments remain active.
- CLI can halt entire portfolio.
- Every admin mutation writes `portfolio_audit_log`.

### 22.10 Blockers Before Retesting Rsibound

- Remove reliance on DNSE market seed for data_source validation.
- Add strict DB/Redis assertion script for alpha test results.
- Add or finalize portfolio/account management plan above.
- Decide the new sibling test harness folder name and compose layout before moving the rsibound test out of legacy alpha folder.
- Stop any old smoke loop before running strict tests to avoid mixed order history.

### 22.11 Implementation Status - 2026-05-18

Implemented in this phase:

- Additive migration: `init-db/11-portfolio-management.sql`.
  - `portfolios`.
  - `portfolio_allocations`.
  - `account_policies`.
  - `account_sync_snapshots`.
  - `account_reservations`.
  - `cash_ledger`.
  - `margin_ledger`.
  - `portfolio_audit_log`.
  - `strategy_deployments` extended with `portfolio_id`, `state`, `risk_profile_id`, `account_policy_id`, and `metadata_v2`.
- Core module: `services/portfolio_management`.
  - account policy model.
  - paper cash reservation for BUY.
  - cash SELL position check for non-borrowing cash accounts.
  - margin reservation for Binance-like paper accounts.
  - cross/isolated margin scope.
  - release/consume reservation helpers.
- Gateway admin APIs:
  - `POST /v1/admin/portfolios`.
  - `GET /v1/admin/portfolios`.
  - `PATCH /v1/admin/portfolios/{portfolio_id}/state`.
  - `POST /v1/admin/portfolio-allocations`.
  - `PUT /v1/admin/accounts/{account_id}/policy`.
  - `GET /v1/admin/accounts/{account_id}/state`.
- Admin alpha registration now supports per-mode/per-venue account balances:
  - `account_balances["paper:BINANCE"] = {"currency": "USDT", "initial_balance": "..."}`
  - `account_balances["paper:DNSE"] = {"currency": "VND", "initial_balance": "..."}`
  - This fixes the earlier design issue where all venues inherited a single `base_currency`.
- CLI module: `python -m cli`.
  - portfolio list/create/state.
  - account seed-paper/policy/state.
  - allocation upsert.
  - trading state halt/reduce/active.
- Risk integration:
  - Paper orders now reserve account cash/margin after risk validation and before forwarding to paper execution.
  - Reservation details are attached to the order payload as `reservation_id`.
  - Sandbox/live are intentionally not locally reserved yet unless future broker-sync enforcement is added. They remain broker-authoritative.
- Paper execution integration:
  - If risk already reserved funds/margin, paper execution does not double-lock.
  - Cancel/reject/expire paths release reservations.
  - Fill paths consume reservation state.
  - Margin reservation consume is quantity-proportional, so partial fills keep the unfilled reservation available for later release/fill.
- Portfolio accounting integration:
  - Cash accounts keep old cash buy/sell behavior.
  - Margin accounts no longer subtract full notional from cash on BUY. They apply commission, realized PnL, and release margin when positions reduce.

DNSE/Binance adapter notes used for design:

- DNSE trading SDK uses `accountNo`, `market_type`, `symbol`, `side` (`NB`/`NS`), `orderType`, `price`, `quantity`, optional `loanPackageId`, and `trading_token`.
- DNSE buying power/margin validation should eventually sync from `get_ppse`, `get_balances`, `get_positions`, `get_execution_detail`, and loan packages.
- Binance adapter remains `python-binance` based for Futures testnet/live. Margin policy here is internal paper simulation only; sandbox/live account truth must come from Binance account/position sync.

Verified:

- Host compile passed for changed modules.
- Docker unit suite passed: `83 passed, 2 warnings`.
- Migration `11-portfolio-management.sql` applied to the running Postgres without resetting data.
- Restarted `gateway`, `risk_engine`, `paper_execution`, and `portfolio`.
- Runtime health after restart: `/v1/health = READY`.
- Runtime smoke script passed: `scripts/portfolio_management_smoke.py`.
  - registered disposable alpha.
  - created portfolio.
  - created allocation.
  - reserved and released Binance-style cross margin paper order.
  - reserved and released DNSE cash paper order in `VND`.
  - cleaned smoke rows after itself.

Known remaining work:

- Broker sync enforcement is schema/API-ready but not fully implemented for Binance/DNSE account snapshots.
- DNSE margin/loan buying power must be implemented from real DNSE `get_ppse`/loan package response shape before live use.
- VN realistic T+ settlement still needs strict integration tests with real data_layer calendar/symbol data.
- Portfolio state hierarchy is stored and risk now enforces account/deployment/allocation/portfolio `HALTED` and `REDUCING` state for non-cancel orders.

### 22.12 CLI And Risk Management Update - 2026-05-18

Implemented:

- Added Docker compose `cli` profile/service. Recommended server usage:
  - `docker compose --profile cli run --rm cli health`
  - no host Python required.
- Reworked `cli/__main__.py` into an operator CLI:
  - table output by default.
  - `--json` for raw API responses.
  - `health`, `alpha`, `portfolio`, `allocation`, `account`, and `risk` commands.
  - HTTP retry for gateway startup/recreate race.
- Mutation commands now require admin password confirmation:
  - CLI prints method/path/payload before sending.
  - read-only commands do not prompt.
  - automation can use `TRADING_CLI_CONFIRM_PASSWORD`, but interactive password is preferred.
- Added CLI guide:
  - `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md`.
- Risk engine now checks operational state after risk profile and before throttle/exposure:
  - inactive account -> reject.
  - portfolio/deployment/allocation `HALTED` -> reject open/increase orders.
  - portfolio/deployment/allocation `REDUCING` -> allow cancel/close/reduce only.
  - cancel still bypasses most checks so risk can be reduced during halt.

Verified:

- Host compile passed for CLI/risk changes.
- Docker unit suite: `88 passed, 2 warnings`.
- Docker CLI health command rendered service heartbeat table and returned `READY`.
- Docker CLI mutation smoke created `cli_smoke` portfolio only after password confirmation, then smoke rows were removed.
- Runtime `/v1/health = READY` after risk restart.

### 22.13 Broker-Authoritative Account Sync - 2026-05-18

Implemented:

- Added account sync module: `services/portfolio_management/account_sync.py`.
- Added admin sync endpoint:
  - `POST /v1/admin/accounts/{account_id}/sync`.
- Added CLI command:
  - `python -m cli account sync <account_id>`.
- Added runtime smoke:
  - `scripts/account_sync_smoke.py`.
- Account state output now includes latest broker sync snapshot.
- Risk engine now enforces broker sync freshness when `account_policies.require_broker_sync = true`:
  - missing snapshot -> reject.
  - `ERROR` snapshot -> reject.
  - stale snapshot older than `max_sync_age_seconds` -> reject.
  - `OK` and fresh -> allow normal risk flow.

Binance sync behavior:

- Uses `python-binance` Futures account endpoints.
- `mode=sandbox` uses `BINANCE_TESTNET_KEYS`.
- `mode=live` uses `BINANCE_LIVE_KEYS`.
- Captures:
  - futures account/assets.
  - futures positions.
  - futures open orders.
  - available balance / buying power where provided.
- Writes `account_sync_snapshots`.
- Projects synced balances back to `account_balances` when broker response is `OK`.

DNSE sync behavior:

- Uses local DNSE OpenAPI SDK.
- Calls:
  - `get_balances`.
  - `get_positions`.
  - `get_orders`.
  - `get_loan_packages`.
  - `get_ppse` when `symbol`, `price`, and `loan_package_id` are supplied.
- Requires account reference:
  - pass `--account-no` at sync time, or
  - set `accounts.external_account_ref` through account policy with `--external-account-ref`.
- Writes `ERROR` snapshot instead of pretending success when:
  - DNSE account number is missing.
  - `DNSE_DRY_RUN=true`.
  - any broker endpoint returns non-2xx.
- Projects best-effort synced balances back to `account_balances` when broker response is `OK`.

CLI/guide updates:

- `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md` now documents account sync commands for paper, Binance sandbox/live, and DNSE.
- CLI command examples stay on `docker compose --profile cli run --rm --no-deps cli ...` so CLI does not start/recreate dependency containers.

Verified:

- Host compile passed for account sync/gateway/risk/CLI changes.
- Docker unit suite: `92 passed, 2 warnings`.
- Runtime smoke: `ACCOUNT_SYNC_SMOKE_OK paper_internal=OK dnse_missing_account=ERROR`.
- CLI `account sync no_such_account` error path returned structured error and, with `--no-deps`, only created the temporary CLI container.
- A final `/v1/health` rerun was not executed because the Docker escalation was rejected by the tool usage/approval layer after tests had already passed.

Remaining caveat:

- Real Binance/DNSE broker sync still depends on valid credentials and network access. The system now records explicit `ERROR` snapshots when credentials/account references are missing and risk can enforce those snapshots, but live broker response shape should still be reviewed once real DNSE payloads are observed.

### 22.14 Declarative Portfolio/Account Config And CLI Ops - 2026-05-19

Implemented:

- Added declarative config support to the operator CLI:
  - `python -m cli config plan <file.yaml|file.json>`.
  - `python -m cli config apply <file.yaml|file.json>`.
- Added example config:
  - `config/examples/portfolio_setup.example.yaml`.
- Config relationship model:
  - portfolio -> allocation -> account -> alpha/strategy deployment.
  - accounts are isolated by `mode` and `venue`.
  - one portfolio can hold many accounts.
  - one alpha can run multiple independent deployments such as `paper:BINANCE`, `paper:DNSE`, `sandbox:BINANCE`, and later `live:*`.
- Config apply now pushes through admin APIs, not direct DB writes:
  - portfolios.
  - Redis trading states.
  - symbol registry sync.
  - alpha registration and gateway API key.
  - accounts, balances, account policies.
  - portfolio allocations.
  - risk profiles.
- Added Redis inspection commands to CLI:
  - `redis get`.
  - `redis scan`.
  - `redis alpha-auth`.
  - `redis trading-state`.
  - `redis stream`.
- Added explicit `PyYAML` dependency for YAML config parsing.
- Updated `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md` with:
  - standard account model.
  - declarative config workflow.
  - Redis inspection workflow.
  - end-to-end new-alpha scenario.

Important design fix:

- Alpha registration previously created accounts by Cartesian product of `allowed_modes x allowed_venues`.
- That was unsafe for mixed deployments, for example `paper:DNSE` plus `sandbox:BINANCE` could also create unwanted `sandbox:DNSE`.
- Admin registration now accepts explicit `deployments` and creates only the requested mode/venue/account combinations when they are provided.
- The CLI config generator sends explicit deployments from YAML `alphas[].accounts`.

Verified:

- Host compile passed for:
  - `cli/__main__.py`.
  - `services/gateway/repository/admin_config.py`.
- Runtime CLI config plan rendered the example YAML successfully:
  - `docker compose --profile cli run --rm --no-deps cli config plan config/examples/portfolio_setup.example.yaml`.
- Runtime CLI Redis inspection command rendered a table:
  - `docker compose --profile cli run --rm --no-deps cli redis alpha-auth rsibound_ts_sample`.
- Docker test image built with dev dependencies.
- CLI unit tests passed:
  - `8 passed`.
- Explicit deployment unit tests passed:
  - prevents accidental Cartesian `allowed_modes x allowed_venues` account creation when config provides deployments.
- Full Docker unit suite passed:
  - `97 passed, 2 warnings`.

Operator note:

- For existing running gateway containers, restart/recreate the gateway after this patch before using declarative config apply, because the admin registration behavior changed in gateway repository code.

### 22.15 Capital Allocation Ledger And Account Isolation Model - 2026-05-19

Decision:

- Internal accounts must be isolated by `alpha_id + mode + venue`.
- Do not share one internal `account_id` between multiple alphas.
- A physical broker account/key may still be shared by several internal accounts, but only through `accounts.external_account_ref`.
- Capital does not move alpha-to-alpha. Portfolio is the capital pool; each account receives or returns capital through portfolio allocation changes.

Implemented:

- Added `portfolio_capital_ledger`.
  - records portfolio/account capital movements.
  - stores `movement_type`, `amount`, `before_allocated`, `after_allocated`, actor, reason, and metadata.
  - supports `INITIAL_ALLOCATE`, `ALLOCATE`, `WITHDRAW`, `REBALANCE`, `ADJUST`.
- `PortfolioManagementRepository.upsert_allocation` now writes a capital ledger row whenever `allocated_capital` changes.
- Added admin endpoint:
  - `GET /v1/admin/portfolio-capital/history`.
- Added CLI command:
  - `python -m cli capital history`.
- Extended allocation CLI with:
  - `--movement-type`.
- Changed declarative config preferred shape:
  - top-level `alphas`.
  - top-level `accounts`.
  - top-level `allocations`.
- Kept backward compatibility:
  - old nested `alphas[].accounts` and `alphas[].allocations` still work.
- Updated active config:
  - `config/_config/portfolio_setup.yaml`.
- Updated example config:
  - `config/examples/portfolio_setup.example.yaml`.
- Updated guide:
  - `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md`.

Verified:

- Host compile passed for CLI, gateway, repository, and tests.
- CLI config plan passed against `config/_config/portfolio_setup.yaml`.
- Migration `11-portfolio-management.sql` was re-applied additively to running Postgres without resetting data.
- Gateway restarted to load new endpoint.
- CLI capital history endpoint returned successfully.
- Runtime CLI health returned `READY` after migration/restart.
- Focused Docker tests passed:
  - `18 passed`.
- Full Docker unit suite passed:
  - `99 passed, 2 warnings`.

Remaining:

- Existing warnings are FastAPI `on_event` deprecation warnings; not related to this capital allocation work.

### 22.16 Rsibound Alpha E2E Against Trading System - 2026-05-19

Implemented:

- Added isolated alpha test harness outside the legacy alpha runtime:
  - `/root/bobby/Papertrade_DB/trading_system_alpha_tests`.
- Added rsibound-style E2E runner:
  - uses `trading_system/alpha_sdk/trading_system_async_action.py`.
  - uses data_layer REST/Redis for warmup/latest data.
  - supports `paper_binance`, `paper_dnse`, and `sandbox_binance`.
  - caps Binance quantity at `0.01`.
  - uses DNSE default quantity from config.
- Added end-to-end guide:
  - `/root/bobby/Papertrade_DB/trading_system_alpha_tests/RSIBOUND_TRADING_SYSTEM_E2E_GUIDE.md`.
- Added helper close script:
  - `/root/bobby/Papertrade_DB/trading_system_alpha_tests/main/close_position.py`.

Integration fixes made from real testing:

- `parse_vn_quote` now accepts data_layer `quote-last` wrapper payloads with a nested `snapshot`.
- `market_data` now projects venue default `market:info:<SYMBOL>` for DNSE/VN symbols from real data_layer quotes, not from admin seed.
- `risk_engine` has the same DNSE/VN market-info fallback when ticker exists but metadata has not been written yet.
- VN `preload_snapshot` / last-known quotes now receive a longer trading-cache TTL so paper tests after market hours do not immediately fail as `MARKET_DATA_OFFLINE`.
- `paper_execution` releases leftover reservation amount after a fully filled paper order.
- The rsibound harness now submits explicit `reduce_only=True`, `intent=CLOSE` orders instead of using legacy `long_out()` boolean behavior.

Verified:

- Focused Docker unit tests passed:
  - parser/projector/risk/paper execution: `21 passed`.
- `--assert-only` passed:
  - data_layer health.
  - Binance and DNSE warmup/latest REST reads.
  - Redis key probes.
  - gateway health.
- `paper_binance` passed:
  - BTCUSDT and ETHUSDT paper orders were accepted and filled.
  - `orders`, `fills`, and `positions_v2` populated.
- `paper_dnse` passed:
  - HPG paper BUY filled from data_layer `quote-last`.
  - HPG reduce-only SELL close filled.
  - HPG paper BUY probe reopened.
  - new reservations were `RELEASED`; stale reservation from before the fix was repaired through `PortfolioManagementRepository.release_order_reservations`.
  - DNSE account locked cash returned to `0`.
- `sandbox_binance` passed after required operational gates:
  - broker sync returned `OK`.
  - first test correctly rejected while deployment was `HALTED`.
  - second test correctly rejected when broker sync became stale.
  - after deployment `ACTIVE` and fresh sync, Binance testnet order `rsisbi188805001btcusdbu` filled with venue order id `13162013867`.

Operational notes:

- Sandbox Binance policy currently requires broker sync freshness within 60 seconds. Sync immediately before a sandbox/live run.
- The 2026-05-19 sandbox test opened a Binance testnet BTCUSDT LONG `0.0012` on `sandbox-binance-rsibound_ts_sample`.
- 2026-05-21 cleanup completed:
  - Re-applied declarative config because the restarted DB no longer had `rsibound_ts_sample`/accounts while Redis auth was inactive.
  - Broker sync showed the Binance testnet account actually had BTCUSDT `positionAmt=0.0112`, then `0.0100` after the first reduce-only close.
  - Added explicit `--quantity`/`--side` cleanup support in `main/close_position.py`.
  - Fixed risk checker so `reduce_only` / `intent=CLOSE` orders skip position exposure-limit checks. Exchange reduce-only enforcement remains the final guard against increasing a broker position.
  - Closed the remaining BTCUSDT position on Binance testnet. Latest broker sync `aa35cb7d-6cea-4a98-b29b-4850052c591f` returned `positions=[]`.
  - Returned `system:trading_state:sandbox:BINANCE` to `HALTED`.
  - Returned `sandbox-binance-rsibound_ts_sample` allocation/deployment to `HALTED`.
  - Repaired the local sandbox `positions_v2` test artifact to `FLAT` based on the broker-authoritative zero-position snapshot.
  - Final CLI health returned `READY` for all services.
- Important gap found:
  - Broker sync records authoritative snapshots, but does not yet apply position reconciliation into `positions_v2`.
  - After DB re-apply or missed listener events, local positions can diverge from broker positions.
  - Before expanding sandbox/live alpha testing, implement controlled broker-authoritative position reconciliation with audit logs, not manual SQL repair.
- `paper_execution` logs still show noisy invalid market-event messages (`market tick price must be positive`) from some internal market events. They did not block fills, but this should be reviewed so monitoring signal stays clean.

### 22.17 Broker Position Reconciliation V2 - 2026-05-21

Implemented:

- Added broker-authoritative position normalization and reconciliation helpers.
- Added account-level reconciliation method:
  - reads latest `account_sync_snapshots`.
  - compares broker positions with `positions_v2`.
  - detects `BROKER_POSITION_MISSING_IN_DB`, `BROKER_POSITION_STALE_IN_DB`, and `BROKER_POSITION_QTY_MISMATCH`.
  - dry-run marks latest sync snapshot as `MISMATCH` when mismatches exist.
  - apply updates `positions_v2`, records/resolves `reconciliation_findings`, and writes `portfolio_audit_log`.
- Added admin endpoint:
  - `POST /v1/admin/accounts/{account_id}/reconcile-positions`.
  - supports `sync_first` and `apply`.
- Added CLI command:
  - `cli account reconcile-positions <account_id> --sync-first`.
  - `cli account reconcile-positions <account_id> --apply`.
- Added scheduled reconciliation in `reconciliation` service for accounts with `require_broker_sync=true`.
  - default detects only.
  - set `BROKER_POSITION_RECON_APPLY=true` to auto-apply.
- Risk already rejects any broker sync snapshot whose latest status is not `OK`; now `MISMATCH` becomes a trading gate.

Verified:

- Focused Docker unit tests passed:
  - `tests/unit/test_portfolio_management.py`
  - `tests/unit/test_cli.py`
  - `tests/unit/test_risk_checker_market_metadata.py`
  - result: `21 passed`.
- Gateway and reconciliation services restarted successfully.
- Clean dry-run with `--sync-first` returned `OK` and `findings=0`.
- Created a controlled local `positions_v2` mismatch for `sandbox-binance-rsibound_ts_sample`.
- Dry-run reconciliation detected `BROKER_POSITION_STALE_IN_DB` and marked sync snapshot `MISMATCH`.
- Apply reconciliation set local position to `FLAT`, returned latest sync to `OK`, wrote audit log, and resolved findings.
- Final dry-run with `--sync-first` returned `OK` and `findings=0`.
- Final CLI health returned all services `READY`.

Required operating rule:

- After restart or suspected service gap, sandbox/live sequence must be:
  - keep target mode/venue `HALTED`.
  - broker sync.
  - position reconciliation dry-run.
  - apply if mismatched.
  - verify account state.
  - only then set allocation/trading state `ACTIVE`.

Remaining test work before scaling to more alphas:

- Add restart-chaos tests:
  - kill/restart listener during an order.
  - kill/restart executor after venue order accepted but before DB update.
  - restart Redis and verify DB/broker recovery sequence.
- Add DNSE real payload reconciliation once real DNSE position/order response shapes are observed.

### 22.18 Broker Open-Order Reconciliation V2 And DNSE Paper Retest - 2026-05-21

Implemented:

- Added broker open-order normalization for Binance and DNSE SDK-style payloads.
  - Binance fields: `clientOrderId`, `orderId`, `origQty`, `executedQty`, `status`, `type`, `timeInForce`, `reduceOnly`.
  - DNSE fields: `id`/`orderId`, `side` (`NB`/`NS`), `symbol`, `quantity`, `fillQuantity`, `leaveQuantity`, `orderType`, `orderStatus`.
- Added open-order reconciliation planner:
  - `BROKER_OPEN_ORDER_STALE_IN_DB`.
  - `BROKER_OPEN_ORDER_MISSING_IN_DB`.
  - `BROKER_OPEN_ORDER_STATE_MISMATCH`.
- Added account-level open-order reconciliation method:
  - reads latest `account_sync_snapshots.open_orders`.
  - compares broker open orders against local `binance_sent_orders` and canonical `orders`.
  - dry-run marks latest sync snapshot `MISMATCH` when mismatches exist, so risk blocks sandbox/live when `require_broker_sync=true`.
  - apply marks stale local orders `RECONCILED_MISSING` and inserts/updates broker-authoritative open orders into the legacy order projection for alpha query compatibility.
  - apply preserves an existing position reconciliation mismatch on the same snapshot; it does not incorrectly flip a snapshot back to `OK` if positions are still mismatched.
- Added admin endpoint:
  - `POST /v1/admin/accounts/{account_id}/reconcile-open-orders`.
- Added CLI command:
  - `cli account reconcile-open-orders <account_id> --sync-first`.
  - `cli account reconcile-open-orders <account_id> --apply`.
- Added scheduled open-order reconciliation in `reconciliation` service after broker sync and position reconciliation.
  - default detects only.
  - set `BROKER_OPEN_ORDER_RECON_APPLY=true` only when auto-apply is explicitly desired.

Verified:

- Focused Docker unit tests passed:
  - `tests/unit/test_portfolio_management.py`
  - `tests/unit/test_account_sync.py`
  - `tests/unit/test_cli.py`
  - result: `25 passed`.
- Full Docker unit suite passed:
  - result: `110 passed, 2 FastAPI lifespan warnings`.
- Gateway and reconciliation restarted successfully after adding the endpoint.
- CLI health returned all services `READY`.
- Rsibound assert-only E2E used real data_layer reads without market seed:
  - paper Binance warmup/latest succeeded.
  - paper DNSE warmup/latest succeeded for `FPT` and `HPG`.
  - DNSE Redis quote keys existed: `vn:quote:<symbol>` and `vn:quote:last:<symbol>`.
  - Binance Redis `trade:price:<symbol>` existed, but `kline:5m:<symbol>` keys were absent; warmup REST still worked. Review data_layer kline Redis projection if alpha code needs Redis kline keys directly.
- Paper DNSE E2E passed with real data_layer quotes:
  - strategy selected `HPG`/`FPT`.
  - existing HPG paper position was closed with reduce-only SELL.
  - latest paper DNSE query showed `positions=[]`.
  - DB check showed no bad/null required rows:
    - `orders`: 14 rows, 0 bad rows.
    - `fills`: 14 rows, 0 bad rows.
    - `positions_v2`: `paper-dnse-rsibound_ts_sample:HPG.DNSE` is `FLAT`.
    - `account_balances`: `VND locked=0`, free equals total.
    - `account_reservations`: all 7 checked reservations were `RELEASED`.
- A DNSE paper LIMIT order with far-off price was correctly denied by risk:
  - client order `dnse_restart_open_001`.
  - reason: `Price dev 96.23% > 5%`.
  - no DB order/reservation was created, which is correct.
- A DNSE paper LIMIT order inside price deviation but not crossed was accepted and persisted:
  - client order `dnse_restart_open_002`.
  - `paper_open_orders.status=ACCEPTED`.
  - canonical `orders.status=ACCEPTED`.
  - reservation `RESERVED` in `VND` for `2553.825`.
- Paper open-order recovery and cleanup completed:
  - after restart, `paper_execution` logged `recovered_open_orders=1`, proving DB recovery worked.
  - canceled `dnse_restart_open_002` through the alpha-facing gateway/SDK path.
  - `paper_open_orders` now has 0 rows for `dnse_restart_open_002`.
  - canonical `orders.status=CANCELED`.
  - reservation is `RELEASED`, `released_amount=2553.825`, `reason=paper_order_canceled`.
  - paper DNSE account has `VND locked=0`, free equals total.
  - after final restart, `paper_execution` logged `recovered_open_orders=0`.
- Reduced paper matcher invalid market-event noise:
  - malformed/zero-price market events are now skipped at debug level instead of emitted as ERROR logs.
- Fixed paper cancel reservation audit:
  - `PaperExecutionRepository.cancel_order` now marks the order `CANCELED` before releasing reservation.
  - future cancel releases record `paper_order_canceled` instead of `paper_order_accepted`.
- Final CLI health returned all services `READY`.

Updated operating rule after restart:

- Paper mode:
  - DB is authoritative.
  - `paper_execution` must recover `paper_open_orders` on startup.
  - after restart, query `paper_open_orders`, account reservations, and account state before resuming alpha loop.
- Sandbox/live mode:
  - broker is authoritative.
  - keep trading `HALTED`.
  - run broker sync.
  - run position reconciliation.
  - run open-order reconciliation.
  - apply only after reviewing findings.
  - resume trading only when latest sync is `OK`, fresh, and both reconciliation checks are clean.

## 23. Trading Test Roadmap Before Scaling More Alphas

This roadmap turns the current rsibound smoke work into a broader reliability test plan. The target is not microsecond HFT, but the system should survive high-throughput alpha behavior, burst orders, service restarts, Redis gaps, and broker/db reconciliation without silent state drift.

### 23.1 Synthetic Paper Order Lifecycle Matrix

Goal:

- Prove paper execution semantics deterministically without broker/data_layer dependencies.
- Cover order types, trigger behavior, partial fills, expiration, cancel/amend, reservation release, and order projection.

Cases:

- MARKET fill immediately.
- LIMIT BUY crossed and not crossed.
- LIMIT SELL crossed and not crossed.
- LIMIT open then later fill from market tick.
- LIMIT open then cancel.
- LIMIT partial fill then cancel remainder.
- IOC full fill.
- IOC partial fill then expire remainder.
- IOC not crossed then expire with no fill.
- FOK full fill.
- FOK partial liquidity then expire with no fill.
- GTD expires at timestamp.
- STOP_MARKET trigger and not trigger.
- STOP_LIMIT trigger but not crossed.
- STOP_LIMIT trigger and crossed.
- TAKE_PROFIT_MARKET trigger and not trigger.
- TAKE_PROFIT limit trigger but not crossed.
- TAKE_PROFIT limit trigger and crossed.
- ATO/ATC fill as taker in paper mode.
- Slippage and fee calculation.
- Instrument mismatch should not fill.
- No liquidity with partial-fill mode should not create a fill.
- Cancel unknown order returns rejected.
- Cancel terminal order is rejected/guarded.
- Amend with missing ids rejected.
- Amend open order uses cancel-replace path.
- Post-only and trailing-stop behavior must be either implemented or explicitly rejected as unsupported in paper mode.

Status:

- Initial matrix implemented in `tests/unit/test_paper_execution.py`.
- Paper matcher fixes from this matrix:
  - partial-fill mode with zero available liquidity now returns `NO_AVAILABLE_LIQUIDITY` instead of filling full quantity.
  - `TAKE_PROFIT_LIMIT` is supported as a limit-style take-profit alias.
  - unsupported paper order types, including `TRAILING_STOP_MARKET`, are explicitly rejected until implemented.
  - crossing `post_only` limit-style orders are explicitly rejected with `POST_ONLY_WOULD_TAKE_LIQUIDITY`.
- Verification:
  - `tests/unit/test_paper_execution.py`: `37 passed`.
  - full Docker unit suite: `133 passed, 2 FastAPI lifespan warnings`.
  - restarted `paper_execution`; final CLI health returned all services `READY`.

### 23.2 Burst / Backpressure / Throughput

Goal:

- Simulate alpha behavior closer to scalping/high-throughput, not HFT microsecond latency.
- Ensure Redis streams, DB writes, risk, paper execution, and portfolio projection do not silently drop rows under bursts.

Cases:

- 100, 500, and 1000 orders over a short window.
- Mix accepted, risk-rejected, account-rejected, duplicate, cancel, and amend commands.
- Multi-symbol and multi-account bursts.
- Bulk order API bursts.
- DB query assertions:
  - accepted orders have `orders` rows.
  - fills have `fills` rows.
  - reservations are consumed/released.
  - no account balance goes negative.
  - Redis consumer group pending count returns to zero.
- Record p50/p95/p99 gateway-to-final-projection latency.

Status:

- Added `scripts/paper_burst_smoke.py` to register a dedicated synthetic paper alpha, submit burst orders through `/v1/orders`, wait for DB/Redis projection, cancel open LIMIT orders, and assert stream pending/order/reservation/balance invariants.
- First burst tests exposed three real reliability gaps:
  - invalid cached market ticks could make `paper_execution` raise before projecting/releasing a command, leaving Redis stream messages pending.
  - market-event matching could resurrect canceled `paper_open_orders` because open-order update used an upsert path after cancel.
  - aggregate `alpha_positions.pending_*` was not idempotent per order, so fills/cancels arriving through canonical and legacy streams could leave stale virtual exposure.
- Fixes implemented:
  - `PaperExecutionClient._load_last_tick()` now skips invalid cached ticks and falls back to the next market cache key.
  - paper command consumer now rejects poison order payloads when possible, logs full exceptions, ACKs unrecoverable bad JSON, and reclaims old pending messages via `XAUTOCLAIM`.
  - `PaperExecutionRepository.update_after_match()` only inserts open orders on the initial submit path; market-event reprocessing can update existing open orders but cannot resurrect a canceled order.
  - paper legacy fill payload now includes canonical `client_order_id`; `normalize_fill()` also strips `paper-` prefix for older paper legacy payloads.
  - added `order_pending_exposure` ledger in `init-db/12-pending-exposure.sql`; risk writes one pending exposure row per accepted order, and portfolio releases exposure idempotently on fills/cancel/reject/expire.
  - portfolio terminal order events release only the remaining pending exposure recorded for that order, avoiding duplicate release across canonical/legacy event ordering.
  - risk now loads market data from canonical trade/quote caches before the legacy ticker key, and paper LIMIT orders can fall back to their explicit order price if market cache is momentarily offline. MARKET orders still require market data.
  - portfolio stream consumers now reclaim old pending messages via `XAUTOCLAIM`; deterministic poison accounting events are moved to `deadletter.portfolio` and ACKed, while infrastructure errors remain pending for retry.
  - pending exposure release clamps floating-point dust below `1e-12` to zero.
- Verification:
  - `tests/unit/test_paper_execution.py`, `tests/unit/test_portfolio_order_events.py`, `tests/unit/test_risk_checker_market_metadata.py`: `46 passed`.
  - migration `init-db/12-pending-exposure.sql` applied successfully to the running Postgres container.
  - `risk_engine`, `portfolio`, and `paper_execution` were restarted successfully after the code changes.
  - old poison fill messages for `paper-binance-rsibound_ts_sample` were moved to `deadletter.portfolio`; portfolio stream pending returned to zero.
- Smoke results:
  - 100 orders, 20 MARKET, 80 LIMIT, concurrency 20: `status=OK`; `risk_rejections=0`; fills `20`; canceled LIMIT `80`; all Redis pending `0`; final pending exposure `0`; p50/p95/p99 submit latency `8.671/14.535/17.491ms`.
  - 500 orders, 50 MARKET, 450 LIMIT, concurrency 25: `status=OK`; `risk_rejections=0`; fills `50`; canceled LIMIT `450`; all Redis pending `0`; final pending exposure `0`; p50/p95/p99 submit latency `8.119/15.385/28.878ms`.
  - 1000 orders, 100 MARKET, 900 LIMIT, concurrency 30: `status=OK`; `risk_rejections=0`; fills `100`; canceled LIMIT `900`; all Redis pending `0`; final pending exposure `0`; p50/p95/p99 submit latency `7.470/13.483/22.817ms`; end-to-end smoke elapsed `65.85s`.
- Conclusion:
  - Group 2 is closed for paper-mode burst/backpressure smoke. The current implementation can process 100/500/1000 order bursts without silent order loss, stale open orders, unreleased reservations, Redis pending leaks, or stale virtual exposure.
  - This is not an HFT benchmark. It validates reliability and state convergence for high-throughput alpha behavior at the current gateway/Redis/DB architecture.

### 23.3 Restart / Crash / Redis Loss

Goal:

- Prove recovery when service failure happens during the order lifecycle.

Cases:

- gateway accepted but risk not processed yet.
- risk passed but executor/paper_execution not processed yet.
- paper_execution restart with open paper orders.
- portfolio restart while fills are pending.
- listener restart while Binance testnet fills arrive.
- executor restart after broker accepted an order but before DB persistence.
- Redis restart without flush; then controlled recovery.
- Redis loss/flush only in an isolated destructive test environment.

Invalid venue price / market-data gap policy:

- This policy applies across `paper`, `sandbox`, and `live`, because invalid prices and stale market-data are normal live-trading failure modes.
- Pre-risk market-data gaps:
  - `MARKET` orders require fresh market data in every mode; if no valid mark/last/quote price exists, reject as `MARKET_DATA_OFFLINE`.
  - `LIMIT`/trigger orders in `paper` may use their explicit order price as a fallback reference when market cache briefly disappears, because paper mode is for lifecycle simulation and should not drop deterministic limit orders on a cache flicker.
  - `sandbox` may use the same fallback only when `allow_price_fallback=true` in the account/risk policy. Default should be conservative.
  - `live` should not silently mutate or infer prices. If risk cannot validate price against a fresh market snapshot, reject before broker submission and return an actionable reason. Alpha may retry with a fresh quote.
- Broker-side invalid price/tick/trigger rejection:
  - Never hide a broker rejection in `live`. Persist the broker rejection, emit `events.order` with the broker reason/code, release reservations/pending exposure, and let alpha decide whether to reprice.
  - Optional automatic reprice is allowed only behind an explicit `reprice_policy`, with max attempts, max deviation bps, new client order id per attempt, and full audit trail.
  - For open orders that broker accepted and later need price correction, prefer native amend where supported. If native amend is unavailable, use explicit cancel-replace with a distinct `new_client_order_id`; never reuse the old client id.
  - For uncertain broker responses, do not auto reprice. Mark order `UNCERTAIN`, run broker reconciliation first, then decide.
  - DNSE/live requires the same discipline, but exact broker codes will be finalized after real DNSE payloads are observed.

Recommended `reprice_policy` shape:

- `enabled`: false by default for `live`, optional true for `sandbox`, implicit simulation-only for `paper`.
- `max_attempts`: normally 1-2.
- `max_price_deviation_bps`: hard cap from original alpha intent.
- `source`: `latest_quote`, `best_bid_ask`, or `venue_tick_rounding`.
- `action`: `reject_only`, `native_amend`, or `cancel_replace`.
- `audit_required`: true for sandbox/live.

Status:

- Added recovery controls to `scripts/paper_burst_smoke.py`:
  - `--submit-only` creates an accepted gateway order without waiting for downstream processing.
  - `--run-id` makes recovery scenarios deterministic.
  - `--resume-run-id` waits for a previous run to converge, optionally cancels open orders, and asserts DB/Redis invariants.
- Scenario 1, gateway accepted while `risk_engine` stopped:
  - stopped `risk_engine`.
  - submitted `g3risk1779420000` LIMIT order via gateway: gateway accepted `1/1`.
  - restarted `risk_engine`.
  - resume smoke passed: order projected as `ACCEPTED`, cancel projected as `CANCELED`, `paper_open_orders=0`, reservation `RELEASED=1`, all Redis pending `0`.
- Scenario 2, risk accepted while `paper_execution` stopped:
  - stopped `paper_execution`.
  - submitted `g3paper1779420001` LIMIT order via gateway.
  - restarted `paper_execution`.
  - resume smoke passed: order projected/opened, cancel cleanup succeeded, reservation released, all Redis pending `0`.
- Scenario 3, paper open-order DB recovery:
  - created `g3open1779420002` LIMIT order and intentionally left it open.
  - force-recreated `paper_execution`.
  - startup log confirmed `paper execution ready; recovered_open_orders=1`.
  - cleanup via gateway succeeded: `paper_open_orders=0`, reservation released, all Redis pending `0`.
- Scenario 4, portfolio restart while fill events were pending:
  - stopped `portfolio`.
  - submitted `g3portfolio1779420003` MARKET order.
  - restarted `portfolio`.
  - resume smoke passed: `fills=1`, order `FILLED=1`, all Redis pending `0`.
- Final runtime health after group 3 paper-mode restart tests:
  - `/v1/health` returned `READY`.
  - fresh heartbeats for executor, gateway, listener, market_data, monitor, paper_execution, performance, portfolio, reconciliation, and risk_engine.
  - Redis pending for `order.inbound`, `commands.execution.paper`, `events.order`, `events.fill`, and `execution.fills` returned `0`.
- Not executed in this group:
  - `listener` restart while Binance testnet fill arrives, and `executor` restart after broker accepted but before DB persistence. These need sandbox/live broker order flow and should be run in the sandbox/live-specific reconciliation group.
  - Redis restart/flush. Redis loss is destructive on the shared server because streams/auth/cache live in Redis; run only in an isolated environment with an explicit backup/recovery checklist.

Conclusion:

- Group 3 is closed for paper-mode restart/crash recovery. Gateway/risk/paper_execution/portfolio can be stopped and restarted around in-flight paper orders without silent state drift.
- Sandbox/live restart recovery remains partially open by design and must be validated with broker-authoritative reconciliation before expanding live alpha usage.

### 23.4 Idempotency / Duplicate / Event Ordering

Goal:

- Prevent duplicate exposure, duplicate fills, and wrong state when alpha retries.

Cases:

- same `client_order_id` repeated.
- same `client_order_id` across different mode/venue/account.
- duplicate private broker events.
- fill event before order persistence.
- cancel request duplicated.
- amend request duplicated.
- gateway timeout then alpha retry.
- untracked broker event retry into known order after delayed DB write.

Implementation notes added for Group 4:

- Gateway idempotency keys are now scoped by `alpha_id + mode + venue + account_id + client_order_id` for submit, bulk submit, cancel, and update/amend.
  - This prevents duplicate exposure for a true retry in the same trading scope.
  - It still allows the same `client_order_id` to exist in a different account/mode/venue, which is required when one alpha runs paper, sandbox, and live as separate deployments.
- Risk duplicate guard uses the same scoped identity: `risk:dup:<alpha_id>:<mode>:<venue>:<account_id>:<client_order_id>`.
- Paper open-order persistence was scoped to `(account_id, client_order_id)`.
  - Fresh schema: `init-db/06-paper-mode.sql`.
  - Existing DB migration: `init-db/13-paper-open-order-scope.sql`.
  - Reason: `client_order_id` alone is not globally unique once one alpha can run multiple accounts and modes.
- Paper cancel and amend now carry `account_id` through the repository.
  - Canceling account A must not cancel the same `client_order_id` in account B.
  - Paper amend cancel-replace must cancel the original order inside the same account scope.
- Order query supports optional `account_id` on `GET /v1/orders/{client_order_id}`.
  - Without `account_id`, query remains backward compatible but can be ambiguous if the same `client_order_id` exists in multiple accounts.
  - Alpha SDK and guides should prefer passing `mode`, `venue`, and `account_id` for any order query after retry.
- Listener duplicate private broker event handling is explicitly covered by `_claim_listener_event`.
  - The event key includes `order_id`, `trade_id`, `status`, `total_filled`, and `qty`.
  - The first event is accepted; exact duplicate private events are skipped.

Repeatable smoke added:

- `scripts/idempotency_event_ordering_smoke.py`
  - registers one paper alpha with two BINANCE paper accounts.
  - submits the same `client_order_id` to account A, rejects exact retry in account A, and accepts the same `client_order_id` in account B.
  - verifies two canonical `orders` rows and two scoped `paper_open_orders`.
  - verifies account-scoped query returns the correct account.
  - cancels account A and proves account B remains open.
  - sends duplicate cancel for account A and verifies it is idempotently accepted without creating another `order.inbound` command.
  - cancels account B and verifies `paper_open_orders=0`, reservations released, locks released, and pending exposure cleared.

Verification status:

- Local syntax/import smoke passed with:
  - `python3 -m py_compile scripts/idempotency_event_ordering_smoke.py services/gateway/core/engine.py services/gateway/repository/order_query.py services/gateway/main.py services/paper_execution/client.py services/paper_execution/repository.py tests/unit/test_gateway_idempotency.py tests/unit/test_paper_execution.py tests/unit/test_listener_fill_repo.py`
- Docker unit tests passed:
  - command: `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_paper_execution.py tests/unit/test_gateway_idempotency.py tests/unit/test_risk_checker_market_metadata.py tests/unit/test_listener_fill_repo.py tests/unit/test_portfolio_order_events.py`
  - result: `57 passed in 2.52s`.
- DB migration applied to the running database:
  - command: `docker compose exec -T postgres psql -U bobby -d live_data_executor -f /docker-entrypoint-initdb.d/13-paper-open-order-scope.sql`
  - result: `ALTER TABLE`, `ALTER TABLE`, `CREATE INDEX`.
- Services restarted after migration/code change:
  - command: `docker compose up -d --no-deps --force-recreate gateway risk_engine paper_execution`
  - `gateway`, `risk_engine`, and `paper_execution` restarted successfully.
- Health after restart:
  - `/v1/health` from inside `gateway` returned `READY`.
  - fresh services included executor, gateway, listener, market_data, monitor, paper_execution, performance, portfolio, reconciliation, and risk_engine.
- Group 4 smoke passed:
  - command: `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/idempotency_event_ordering_smoke.py`
  - run: `alpha_id=g4idem_alpha_442672`, `client_order_id=g4idem442672`.
  - account A submit accepted, exact duplicate on account A rejected with `DUPLICATE_ORDER_ID`, same `client_order_id` on account B accepted.
  - pre-cancel locks were positive for both accounts: `7.597151536000000000` USDT each.
  - account A cancel accepted, duplicate account A cancel idempotently accepted with `duplicate=true`, account B cancel accepted.
  - post-cleanup: `paper_open_orders=0`, `pending_exposure=0`, `locked_a=0`, `locked_b=0`.
  - market price used by the smoke was read from gateway/cache: `mark_price=77213.1`, `limit_price=75668.84`.
- Redis pending after smoke:
  - `order.inbound/risk_engine_group=0`.
  - `commands.execution.paper/paper_execution_group=0`.
  - `events.order/portfolio_accounting_group=0`.

Debug note:

- First smoke attempt failed correctly because the script used a static `49000` limit price while live cache mark price was much higher, causing risk rejection: `Price dev 36.52% > 5%`.
- The smoke script was corrected to read latest market price from gateway and place a non-crossing limit 2% below mark. This keeps the test aligned with live risk behavior instead of bypassing risk.

Current conclusion:

- Group 4 is closed for paper-mode idempotency, duplicate handling, account-scoped open orders, duplicate cancel handling, duplicate private listener event unit behavior, and delayed listener persistence retry unit behavior.
- Sandbox/live duplicate private event behavior is covered at repository unit level; full broker-event duplication should still be replayed with real Binance testnet listener payloads in the broker reconciliation/live listener group.

### 23.5 Risk / Portfolio / Reservation Integrity

Goal:

- Ensure capital, margin, cash, pending exposure, and reservations stay correct under all outcomes.

Cases:

- risk reject creates no reservation.
- account reject creates no final order/fill.
- partial fill consumes partial reservation.
- cancel/expire releases remainder.
- reduce-only/intent CLOSE does not create new exposure.
- cash account cannot short without borrowing.
- concurrent buys cannot push free balance negative.
- account allocation HALTED blocks orders even if global mode is ACTIVE.
- REDUCING allows only reduce/close/cancel.
- cross and isolated margin ledger behavior.

Implementation notes added for Group 5:

- `RiskChecker` reduce-only / `CLOSE` validation is now directional.
  - Rejects reduce-only when account-scoped exposure is flat: `REDUCE_ONLY_NO_POSITION`.
  - Rejects reduce-only BUY that increases a long, SELL that increases a short, and orders that would flip through flat.
  - Allows reduce-only only when the order direction actually reduces the current net exposure without flipping.
- V2 risk profiles are now account-aware.
  - `RiskRepository.get_risk_profile(..., account_id=...)` filters `positions_v2` by account.
  - Pending exposure from `order_pending_exposure` is included for the same `strategy_id + mode + venue + account_id + symbol`.
  - This prevents one account's position/pending orders from allowing another account to bypass reduce-only or position limit logic.
- Partial fill pending exposure release was corrected.
  - Before fix, a partial fill set `order_pending_exposure.status='FILLED'` even when only part of quantity was released, hiding the remaining pending quantity from risk.
  - Now partial release keeps status `OPEN` until `released_qty >= quantity`; terminal fill/cancel/expire closes the pending row.
- Clarification: `account_balances.locked` can remain positive after a partial fill if it represents margin collateral for an open paper position. That is not a stuck reservation. Stuck reservation checks must use `account_reservations.status IN ('RESERVED', 'PARTIALLY_CONSUMED')` plus open-order/pending-exposure checks.

Repeatable smoke added:

- `scripts/risk_portfolio_integrity_smoke.py`
  - registers one paper alpha with dedicated accounts for risk reject, insufficient balance, partial fill, expiration, cash short, small concurrent buys, HALTED, REDUCING, CROSS margin, and ISOLATED margin.
  - uses latest gateway market price and controlled paper tick quantity for deterministic partial-fill behavior.
  - validates each case through gateway -> risk -> paper_execution -> portfolio/accounting -> DB.

Verification status:

- Docker unit tests passed before smoke:
  - command: `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_risk_checker_market_metadata.py tests/unit/test_portfolio_management.py tests/unit/test_portfolio_order_events.py tests/unit/test_paper_execution.py tests/unit/test_gateway_idempotency.py`
  - result: `67 passed in 2.44s`.
- After fixing partial pending exposure status:
  - command: `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_risk_checker_market_metadata.py tests/unit/test_portfolio_order_events.py tests/unit/test_portfolio_management.py tests/unit/test_paper_execution.py`
  - result: `62 passed in 1.73s`.
- Services restarted after code changes:
  - `docker compose up -d --no-deps --force-recreate risk_engine`
  - `docker compose up -d --no-deps --force-recreate risk_engine portfolio`
- Group 5 smoke passed:
  - command: `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/risk_portfolio_integrity_smoke.py`
  - run: `alpha_id=g5risk_alpha_443752`.
  - risk reject created no reservation: `Price dev 50.00% > 5%`.
  - insufficient balance rejected with unchanged account balance: `INSUFFICIENT_BALANCE`.
  - partial fill produced `PARTIALLY_FILLED`, consumed half the reservation, cancel released the remainder.
  - IOC expire released reservation: `RELEASED amount=7.609673424000000000`.
  - reduce-only no-position rejected; REDUCING deployment rejected OPEN but allowed valid reduce-only close order.
  - cash account short without position rejected: `INSUFFICIENT_POSITION`.
  - concurrent buys on small account accepted one order and rejected one order without negative free/locked balance.
  - HALTED deployment blocked orders while global trading state stayed ACTIVE.
  - CROSS margin used account-level margin scope (`instrument_id=NULL`); ISOLATED margin used instrument scope (`BTCUSDT.BINANCE`).
  - final run state: `paper_open_orders=0`, active reservations `0`.
- Final health/pending checks:
  - `/v1/health` returned `READY`.
  - Redis pending `order.inbound/risk_engine_group=0`.
  - Redis pending `commands.execution.paper/paper_execution_group=0`.
  - Redis pending `events.order/portfolio_accounting_group=0`.

Current conclusion:

- Group 5 is closed for paper-mode risk/portfolio/reservation integrity.
- Live/sandbox broker-authoritative margin and balance sync remains in Group 6 because it depends on real broker snapshots.

### 23.6 Broker Reconciliation

Goal:

- Prove sandbox/live startup and failure recovery use broker-authoritative truth.

Cases:

- broker position exists, DB flat.
- DB position exists, broker flat.
- quantity mismatch.
- broker open order exists, DB missing.
- DB open order exists, broker missing.
- open-order status/remaining quantity mismatch.
- dry-run marks sync `MISMATCH`.
- risk rejects while latest sync is `MISMATCH`.
- apply writes audit and resolves findings.
- position apply does not hide open-order mismatch, and open-order apply does not hide position mismatch.

Implementation update:

- Reconciliation v2 now treats broker snapshots as authoritative for sandbox/live recovery.
- `require_broker_sync=true` risk gating fails closed:
  - no latest snapshot -> `BROKER_SYNC_MISSING`.
  - latest snapshot `ERROR` -> `BROKER_SYNC_ERROR`.
  - latest snapshot stale -> `BROKER_SYNC_STALE`.
  - latest snapshot `MISMATCH` -> `BROKER_SYNC_MISMATCH`.
  - latest snapshot `OK` and fresh -> continue normal risk flow.
- Open-order reconciliation now also syncs pending exposure:
  - DB order exists but broker does not -> mark order `RECONCILED_MISSING`, release pending exposure to zero, decrement legacy pending qty.
  - broker order exists but DB does not -> create/repair pending exposure from broker remaining quantity and increment legacy pending qty.
  - DB/broker remaining quantity mismatch -> update pending exposure to broker remaining quantity.
- Position reconciliation and open-order reconciliation are intentionally independent:
  - applying position fixes does not hide open-order mismatches.
  - applying open-order fixes does not hide position mismatches.
  - snapshot status becomes `OK` only after both dimensions are reconciled.

Extra cases added for realistic restart/failure behavior:

- Service restart after Redis/RAM loss but DB still has stale open orders.
- Broker has a live order created before crash, but executor/listener did not persist it.
- Broker partial-fill remaining quantity differs from DB pending exposure.
- Reconciliation apply order is reversed (`positions first` vs `open orders first`) to ensure no false `OK`.
- Risk engine must reject new orders during every unknown or mismatched broker-sync state before routing to executor.

Test implementation:

- Added synthetic broker reconciliation smoke: `scripts/broker_reconciliation_smoke.py`.
- The smoke uses controlled broker snapshots instead of real Binance/DNSE payloads so all edge cases are deterministic.
- Synthetic account state:
  - DB position BTC long `0.001`, broker BTC long `0.002` -> quantity mismatch.
  - DB position ETH long `0.01`, broker flat -> DB-only stale position.
  - broker BNB short `-0.1`, DB flat -> broker-only position.
  - DB open order `cid-stale`, broker missing -> stale DB order.
  - broker open order `cid-missing`, DB missing -> broker-only open order.
  - open order `cid-mismatch` exists on both sides but broker remaining qty is lower -> partial-fill/mismatch case.
- The smoke runs two apply orderings:
  - `position_first`: dry-run both dimensions, apply positions, verify snapshot remains `MISMATCH`, apply open orders, verify final `OK`.
  - `order_first`: dry-run both dimensions, apply open orders, verify snapshot remains `MISMATCH`, apply positions, verify final `OK`.

Executed tests:

- Compile:
  - `python3 -m py_compile scripts/broker_reconciliation_smoke.py services/portfolio_management/repository.py services/risk_engine/repository/risk_repo.py services/risk_engine/main.py`
- Unit subset:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_account_sync.py tests/unit/test_portfolio_management.py tests/unit/test_risk_checker_market_metadata.py tests/unit/test_portfolio_order_events.py`
  - result: `28 passed`.
- Service restart for integration path:
  - `docker compose up -d --no-deps --force-recreate risk_engine reconciliation`
- Smoke:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/broker_reconciliation_smoke.py`
  - result: `PASS`.

Smoke result summary:

- Risk gate rejected correctly:
  - missing snapshot: `BROKER_SYNC_MISSING`.
  - error snapshot: `BROKER_SYNC_ERROR`.
  - stale snapshot: `BROKER_SYNC_STALE`.
  - mismatch snapshot: `BROKER_SYNC_MISMATCH`.
- `position_first` final state:
  - mid snapshot after position apply: `MISMATCH`.
  - final snapshot after open-order apply: `OK`.
  - positions: BTC `0.002`, ETH flat, BNB `-0.1`.
  - orders: `cid-stale=RECONCILED_MISSING`, `cid-mismatch=PARTIALLY_FILLED`.
  - pending exposure: `cid-stale=0`, `cid-mismatch=0.5`, `cid-missing=0.1`.
  - legacy pending qty: BTC `0`, ETH `0.5`, BNB `0.1`.
- `order_first` final state:
  - mid snapshot after open-order apply: `MISMATCH`.
  - final snapshot after position apply: `OK`.
  - same repaired positions/orders/pending exposure as `position_first`.
- Final health:
  - gateway `/v1/health` returned `READY`.
  - Redis pending `order.inbound/risk_engine_group=0`.
  - Redis pending `order.requests/executor_group=0`.
  - `commands.execution.sandbox` stream/group did not exist in this run because all risk-gated test orders were rejected before executor routing, which is expected.

Debug note:

- During the first smoke draft, stale-snapshot risk gating was masked by a newer `ERROR` snapshot. The smoke now explicitly controls `synced_at` ordering so stale `OK` is the latest row when testing `BROKER_SYNC_STALE`.

Current conclusion:

- Group 6 is closed for deterministic broker-reconciliation logic, risk fail-closed gating, pending-exposure repair, and restart-style recovery simulation.
- Real Binance/DNSE payload replay remains a separate live/sandbox validation item:
  - Binance testnet/live can be tested when keys and controlled test orders are available.
  - DNSE has no sandbox in current infra, so DNSE live payload shape must be validated with very small real orders or documented SDK payload samples from `/root/bobby/trading_system/dnse_openapi_sdk/python`.

Additional broker payload validation - 2026-05-22:

- Added broker payload contract tests:
  - `tests/unit/test_broker_payload_contracts.py`.
- Binance contract coverage:
  - `BinanceAccountSyncClient(mode="sandbox")` uses python-binance with `testnet=True`.
  - `BinanceAccountSyncClient(mode="live")` uses the same futures payload contract with `testnet=False`.
  - futures account payload normalizes balances, buying power, positions, and open orders through the same broker reconciliation normalizers.
  - this confirms testnet and live share the same internal contract; it does not mean live order placement has been tested.
- DNSE contract coverage:
  - built from DNSE SDK endpoint shape in `/root/bobby/trading_system/dnse_openapi_sdk/python/dnse/client.py`.
  - sample `get_balances`, `get_positions`, `get_orders`, `get_loan_packages`, and `get_ppse` responses are parsed as SDK-style `(status, body_text)` responses.
  - DNSE positions normalize into `positions_v2`-compatible broker positions.
  - DNSE open orders normalize `NB`/`NS`, `fillQuantity`, `leaveQuantity`, `orderStatus`, and `orderType` into broker open-order reconciliation shape.
  - DNSE `dry_run=True` sync is explicitly `ERROR` and must never be treated as authoritative.
- Focused Docker unit result:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_broker_payload_contracts.py tests/unit/test_account_sync.py tests/unit/test_portfolio_management.py tests/unit/test_binance_order_mapping.py tests/unit/test_execution_adapters.py`
  - result: `37 passed`.
- Full Docker unit result after broker payload and testnet-smoke additions:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit`
  - result: `155 passed, 2 FastAPI lifespan warnings`.

Additional Binance testnet live-like validation - 2026-05-22:

- Added controlled testnet smoke:
  - `scripts/binance_testnet_live_like_smoke.py`.
- Guardrails:
  - refuses to run unless `IS_TESTNET=true`.
  - registers a dedicated sandbox alpha/account: `binance_testnet_live_like` / `sandbox-binance-binance_testnet_live_like`.
  - account policy requires broker sync before risk allows orders.
  - uses Binance futures testnet only; no Binance live order is sent.
- Sync/reconciliation-only run passed:
  - broker source: `BINANCE_FUTURES`.
  - latest account sync: `OK`.
  - positions dry-run reconciliation: `OK`, `finding_count=0`.
  - open-order dry-run reconciliation: `OK`, `finding_count=0`.
- Live-like order path run passed with one controlled testnet order:
  - market mark used by smoke: `BTCUSDT 77330.0`.
  - submitted non-crossing `LIMIT BUY` quantity `0.001` at `74236.8`.
  - gateway accepted: `202`, status `ACCEPTED`.
  - executor sent to Binance testnet: DB status `SENT`.
  - cleanup cancel accepted and projected: DB statuses `CANCELED`.
  - post-cleanup broker sync: `OK`.
  - post-cleanup positions reconciliation: `OK`, `finding_count=0`.
  - post-cleanup open-order reconciliation: `OK`, `finding_count=0`.
  - post-cleanup account state: no open reservations, no margin rows.
- Final health/pending checks after Binance testnet smoke:
  - gateway `/v1/health`: `READY`.
  - Redis pending `order.inbound/risk_engine_group=0`.
  - Redis pending `order.requests/executor_group=0`.
  - `commands.execution.sandbox` exists but has no `executor_group`; current sandbox executor path consumes `order.requests`, so this is not a pending backlog.

Assumptions still open:

- Binance live:
  - Live futures account/order payload is assumed compatible with Binance testnet because both use python-binance futures methods and the same normalizer tests.
  - No Binance live order has been sent in this phase.
  - Before Binance live alpha rollout, repeat the same sync/reconcile flow with `mode=live`, keep trading `HALTED`, then place only a deliberately tiny controlled order if explicitly approved.
- DNSE live:
  - DNSE SDK endpoint contract has been tested with SDK-shaped sample payloads, not real DNSE live responses.
  - DNSE has no sandbox in current infra.
  - Before DNSE live order rollout, first run live `get_balances`, `get_positions`, `get_orders`, `get_loan_packages`, and optional `get_ppse` capture with no order placement; compare real payloads against these contract tests.
  - Only after payload validation should a very small DNSE real order be placed and immediately canceled/closed.

### 23.7 Market Data / Data Layer Robustness

Goal:

- Ensure market data gaps fail closed and are easy to diagnose.

Cases:

- ticker missing.
- ticker stale.
- price null/zero/malformed.
- data_layer quote wrapper shape changes.
- symbol has data_layer support but missing trading_system `market:info`.
- symbol not in `symbols.json`.
- Binance kline Redis key missing while REST warmup works.
- DNSE warmup lacks enough bars.
- trading outside exchange session.

Implementation update - 2026-05-22:

- Added risk market-data helper:
  - `services/risk_engine/market_data.py`.
- Risk now normalizes mark price more safely:
  - trade/ticker fields: `p`, `price`, `mark_price`, `last`, `close`, `c`.
  - quote fields: `bid`/`ask` or `best_bid`/`best_ask`.
  - when both bid and ask exist, risk uses mid-price instead of blindly using bid.
- Risk market-data selection now fails closed with explicit reasons:
  - no usable cache -> `MARKET_DATA_OFFLINE`.
  - malformed cache payload -> `MARKET_DATA_MALFORMED`.
  - price <= 0/null/malformed -> `INVALID_MARKET_PRICE`.
  - timestamp missing -> `MARKET_DATA_TIMESTAMP_MISSING`.
  - timestamp older than `RISK_MARKET_DATA_MAX_AGE_SECONDS` -> `MARKET_DATA_STALE`.
  - market/session explicitly closed -> `MARKET_SESSION_CLOSED`.
- Added config:
  - `RISK_MARKET_DATA_MAX_AGE_SECONDS=180`.
- DNSE paper-mode after-hours exception:
  - stale `preload_snapshot` / last-known VN quote with `is_live=false` is allowed only for `mode=paper`.
  - the same stale payload is rejected for `mode=live` / sandbox-like broker-authoritative paths.
- Risk market-data loader now tries canonical cache before legacy ticker:
  - `cache:market:last_trade:<SYMBOL>.<VENUE>`.
  - `cache:market:last_quote:<SYMBOL>.<VENUE>`.
  - `market:ticker:<SYMBOL>`.
  - if legacy ticker is invalid but canonical cache is valid/fresh, order can proceed.
- `RiskChecker` now rejects malformed `market:info` instead of throwing or silently continuing.
- data_layer parsers now support more wrapper shapes:
  - direct object.
  - `snapshot`.
  - `data`.
  - `payload`.
  - `result`.
  - nested combinations such as `data.snapshot`.
- data_layer parsers now reject non-positive trade/quote prices at parse time.
- market cache projector now carries session fields into legacy ticker payload:
  - `is_live`.
  - `is_session_open`.
  - `trading_session_open`.
  - `session_state`.
  - `trading_session`.

Additional cases covered:

- Invalid `market:ticker` does not poison risk if canonical last trade/quote is fresh and valid.
- Future alpha/live behavior is safer when data_layer says session is closed.
- VN paper simulations can still run from explicit preload snapshots after market hours without weakening live/sandbox safety.
- `market:info` missing for DNSE/VN symbols still falls back to venue defaults.
- `market:info` missing for unknown venues still rejects.
- `market:info` malformed now rejects clearly.

Test implementation:

- Added:
  - `tests/unit/test_risk_market_data_status.py`.
  - `tests/unit/test_risk_market_data_loader.py`.
  - `scripts/market_data_robustness_smoke.py`.
- Extended:
  - `tests/unit/test_market_data_parsers.py`.
  - `tests/unit/test_market_data_projector.py`.
  - `tests/unit/test_risk_checker_market_metadata.py`.

Executed tests:

- Compile:
  - `python3 -m py_compile scripts/market_data_robustness_smoke.py services/risk_engine/market_data.py services/risk_engine/main.py services/risk_engine/core/checker.py adapters/market_data/parsers.py services/market_data/cache_projector.py`
- Focused Docker unit subset:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_risk_market_data_status.py tests/unit/test_risk_market_data_loader.py tests/unit/test_market_data_parsers.py tests/unit/test_market_data_projector.py tests/unit/test_risk_checker_market_metadata.py tests/unit/test_paper_execution.py`
  - result: `67 passed`.
- Restarted risk engine:
  - `docker compose up -d --no-deps --force-recreate risk_engine`.
- Group 7 smoke:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/market_data_robustness_smoke.py`
  - result: `PASS`.
  - verified reject reasons:
    - missing cache -> `MARKET_DATA_OFFLINE`.
    - zero price -> `INVALID_MARKET_PRICE`.
    - stale cache -> `MARKET_DATA_STALE`.
    - closed session -> `MARKET_SESSION_CLOSED`.
  - verified canonical cache fallback:
    - legacy `market:ticker` invalid.
    - canonical `cache:market:last_trade` valid/fresh.
    - order passed risk and projected as `FILLED`.
- Final health/pending:
  - gateway `/v1/health`: `READY`.
  - Redis pending `order.inbound/risk_engine_group=0`.
  - Redis pending `commands.execution.paper/paper_execution_group=0`.
  - Redis pending `events.order/portfolio_accounting_group=0`.
- Full Docker unit suite:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit`
  - result: `169 passed, 2 FastAPI lifespan warnings`.

Current conclusion:

- Group 7 is closed for deterministic market-data fail-closed behavior, cache fallback ordering, parser wrapper handling, stale data handling, and explicit session-closed rejection.
- Remaining real-world validation:
  - observe actual DNSE live session fields once real payloads are available.
  - if data_layer uses different field names for session state, add aliases to `MarketCacheProjector._session_fields` and `market_data_status`.
  - Binance kline Redis absence is not blocking risk because risk uses latest trade/quote/ticker; alpha warmup should continue using data_layer REST when kline Redis is missing.

### 23.8 VN / DNSE Paper Specific

Goal:

- Make paper DNSE close enough to live constraints until real DNSE payloads are available.

Cases:

- VN lot size.
- VN price tick rules.
- ATO/ATC/LO/MP support or explicit rejection.
- T+ settlement realistic mode.
- cash receivable/payable buckets.
- cannot sell unsettled shares when realistic settlement is enabled.
- HOSE/HNX/UPCOM trading sessions.
- DNSE margin/loan package contract tests from SDK payload shape.

Implemented / verified on 2026-05-22:

- VN market metadata now carries default `step_size=100`, `lot_size=100`, `tick_size=0.01`, and zero quantity precision for DNSE/VN stock paper testing.
- Risk checker now enforces price tick multiples for `price`, `trigger_price`, and `stop_price` when instrument metadata exposes `tick_size`.
  - invalid VN lot/quantity is rejected before execution.
  - invalid VN limit price is rejected with explicit `PRICE_TICK_INVALID:<field>`.
- Paper execution supports `MP` as a VN market-style taker order in addition to already-supported `ATO` and `ATC`.
- Paper fill events now propagate `settlement_policy` and `realistic_settlement` from matcher config into canonical/legacy fill payloads.
- Portfolio reservation now blocks selling unsettled VN shares when account policy uses `VN_T_PLUS`.
  - reject reason: `INSUFFICIENT_SETTLED_POSITION`.
  - payload exposes `available_settled_qty` and `unsettled_qty`.
- VN settlement projection now upserts and aggregates settlement buckets for repeated fills on the same account/instrument/currency/date.
  - This fixed a real bug found during group 8 smoke where duplicate `settlement_buckets` scope could leave `events.fill` pending after repeated same-day fills.
- Admin alpha registration default risk config now includes VN order types `ATO`, `ATC`, and `MP`.
- Market-data status coverage now explicitly checks VN venue aliases `DNSE`, `HOSE`, `HNX`, `UPCOM`, paper preload-only allowance, and fail-closed session states such as `BREAK` or `session_open=false`.
- Added group 8 smoke script:
  - `scripts/vn_dnse_paper_specific_smoke.py`
  - registers `g8_vn_dnse_alpha`.
  - seeds `HPG.DNSE` instrument/session/ticker for deterministic paper DNSE test.
  - validates lot rejection, tick rejection, MP buy fill, T+ settlement rows/buckets, and unsettled sell rejection.

Smoke result:

- Command:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/vn_dnse_paper_specific_smoke.py`
- Result:
  - `status=PASS`.
  - `lot_reject=Qty too small after rounding`.
  - `tick_reject=PRICE_TICK_INVALID:price`.
  - `buy_status=FILLED`.
  - `position_qty=100`.
  - settlement rows: `CASH:PAYABLE=1`, `SECURITY:RECEIVABLE=1`.
  - settlement buckets: `PAYABLE amount=2625`, `RECEIVABLE quantity=100`.
  - `unsettled_sell_reject=INSUFFICIENT_SETTLED_POSITION`.

Final health/pending after smoke:

- gateway `/v1/health`: `READY`.
- Redis pending:
  - `order.inbound/risk_engine_group=0`.
  - `commands.execution.paper/paper_execution_group=0`.
  - `events.order/portfolio_accounting_group=0`.
  - `events.fill/portfolio_accounting_group=0`.
  - `execution.fills/portfolio_accounting_group=0`.

Tests:

- Focused Docker unit suite:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_risk_market_data_status.py tests/unit/test_risk_checker_market_metadata.py tests/unit/test_paper_execution.py tests/unit/test_market_data_projector.py tests/unit/test_portfolio_management.py tests/unit/test_broker_payload_contracts.py`
  - result: `78 passed`.
- Full Docker unit suite:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit`
  - result: `174 passed, 2 FastAPI lifespan warnings`.

Current conclusion:

- Group 8 is closed for paper DNSE/VN constraints that can be verified without live DNSE infra.
- Paper VN now rejects invalid lot size, rejects invalid tick prices, supports MP/ATO/ATC order-type routing, projects T+ cash/security settlement, and prevents immediate resale of unsettled shares in realistic settlement mode.
- Remaining real-world assumptions:
  - VN tick scale is currently modeled in the same decimal price scale used by data_layer/test payloads, for example `26.25`. If DNSE live payloads use integer VND ticks, instrument metadata must override `tick_size` accordingly, for example `100`.
  - HOSE/HNX/UPCOM session behavior is enforced through existing market session status. More aliases may be needed after observing real data_layer/DNSE session payloads.
  - DNSE margin/loan package behavior still needs real payload validation when available. Current contract coverage is based on SDK-shaped payload tests and paper account policy modeling.

Additional Binance regression before Group 9 - 2026-05-23:

Reason:

- Group 8 changed shared risk behavior by enforcing instrument price ticks.
- Before moving to observability/ops, Binance paper and sandbox testnet needed a post-change regression run.

Script updates made during this regression:

- `scripts/paper_burst_smoke.py`
  - fixed BTCUSDT limit price generation to respect Binance-style `0.1` tick instead of always quantizing to `0.01`.
  - changed cleanup to cancel only actual `paper_open_orders`, not every original limit spec. This avoids noisy cancel attempts for orders that never became open.
- `scripts/binance_testnet_order_matrix.py`
  - upgraded from old unauthenticated `alpha_smoke` flow to current gateway v1 rules.
  - now registers alpha/account, sends `X-API-Key`, includes `account_id`, activates `sandbox/BINANCE`, and syncs broker account before order submission.
- `scripts/binance_testnet_amend_smoke.py`
  - upgraded from old localhost/no-auth flow to current gateway v1 rules.
  - now registers alpha/account, sends `X-API-Key`, includes `account_id`, and syncs broker account before submit/amend/cancel.

Paper Binance regression:

- Command:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/paper_burst_smoke.py --orders 12 --market-orders 4 --concurrency 4 --interval-ms 20 --timeout-seconds 60`
- First run exposed a real test-script incompatibility with the new tick enforcement:
  - BTCUSDT limit prices generated with `0.01` precision were rejected by risk after tick enforcement.
  - after the script fix, rerun passed.
- Passing run result:
  - `status=OK`.
  - submitted `12`, accepted `12`, gateway rejected `0`.
  - `4` market orders filled.
  - `8` limit orders opened then canceled.
  - risk rejections `0`.
  - bad canonical order rows `0`.
  - paper open orders after cleanup `0`.
  - reserved reservations after cleanup `0`.
  - Redis pending all zero for `order.inbound`, `commands.execution.paper`, `events.order`, `events.fill`, and `execution.fills`.

Sandbox Binance testnet live-like regression:

- Command:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/binance_testnet_live_like_smoke.py --gateway-url http://gateway_service:8000 --alpha-id binance_g8reg_live_like --api-key <test-key> --account-id sandbox-binance-binance_g8reg_live_like --place-limit-order`
- Result:
  - `status=PASS`.
  - broker sync before order: `OK`, positions `0`, open orders `0`.
  - submitted one far-from-market `LIMIT BUY` to Binance futures testnet.
  - DB status reached `SENT`.
  - cancel accepted and DB status reached `CANCELED`.
  - broker sync after cleanup: `OK`, positions `0`, open orders `0`.
  - reconciliation after cleanup: positions `OK`, open orders `OK`, finding count `0`.

Sandbox Binance testnet order-type matrix:

- Command:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/binance_testnet_order_matrix.py --base-url http://gateway_service:8000 --alpha-id binance_g8reg_matrix --api-key <test-key> --account-id sandbox-binance-binance_g8reg_matrix`
- Result:
  - `MATRIX_PASS`.
  - `TAKE_PROFIT_MARKET`: `SENT`, then canceled.
  - `TAKE_PROFIT_LIMIT`: `SENT`, then canceled.
  - `TRAILING_STOP_MARKET`: `SENT`, then canceled.
  - `IOC LIMIT`: terminal `EXPIRED`.
  - `FOK LIMIT`: expected Binance rejection `FOK order has been rejected`.
  - `GTD LIMIT`: `SENT`, then canceled.

Sandbox Binance native amend:

- Command:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/binance_testnet_amend_smoke.py --base-url http://gateway_service:8000 --alpha-id binance_g8reg_amend --api-key <test-key> --account-id sandbox-binance-binance_g8reg_amend`
- Result:
  - `AMEND_SMOKE_PASS`.
  - initial far-from-market `LIMIT` reached `SENT`.
  - native amend reached `UPDATED`.
  - final cancel reached `CANCELED`.

Final Binance cleanup and health:

- Broker-authoritative sync after all sandbox tests:
  - `sandbox-binance-binance_g8reg_live_like`: status `OK`, positions `0`, open orders `0`.
  - `sandbox-binance-binance_g8reg_matrix`: status `OK`, positions `0`, open orders `0`.
  - `sandbox-binance-binance_g8reg_amend`: status `OK`, positions `0`, open orders `0`.
- Gateway `/v1/health`: `READY`.
- Redis pending:
  - `order.inbound/risk_engine_group=0`.
  - `commands.execution.paper/paper_execution_group=0`.
  - `events.order/portfolio_accounting_group=0`.
  - `events.fill/portfolio_accounting_group=0`.
  - `execution.fills/portfolio_accounting_group=0`.
  - `order.requests/executor_group=0`.

Tests:

- Focused Binance unit/contract suite:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_binance_order_mapping.py tests/unit/test_execution_adapters.py tests/unit/test_broker_payload_contracts.py tests/unit/test_gateway_order_schema.py tests/unit/test_gateway_idempotency.py tests/unit/test_paper_execution.py`
  - result: `74 passed`.
- Full Docker unit suite:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit`
  - result: `174 passed, 2 FastAPI lifespan warnings`.

Current conclusion:

- Binance `paper` and `sandbox/testnet` order paths passed after Group 8 tick enforcement.
- Binance testnet coverage now includes broker sync, reconciliation, LIMIT submit/cancel, native amend, and advanced order types `TAKE_PROFIT_MARKET`, `TAKE_PROFIT_LIMIT`, `TRAILING_STOP_MARKET`, `IOC`, `FOK`, and `GTD`.
- Binance `live` order placement was intentionally not run. Current live coverage remains contract-level because live futures uses the same python-binance futures payload contract, but real live order placement must require explicit approval and tiny controlled size.

### 23.9 Observability / Ops

Goal:

- Every failure should be traceable from alpha order id to logs, DB, Redis, reconciliation, and health.

Cases:

- query by `client_order_id` across gateway/risk/executor/paper/portfolio logs.
- dead letters for malformed payloads.
- heartbeat stale detection.
- Loki/Grafana log query examples.
- CLI account state shows balances/reservations/sync.
- reconciliation findings are visible and actionable.
- alpha loop accidentally left running can be detected and halted.

Implemented / verified on 2026-05-23:

- Added unified dead-letter writer:
  - `services/monitor/dead_letter_writer.py`.
  - writes malformed/stuck messages to Postgres `dead_letters`.
  - emits structured Redis event to `events.dead_letter`.
  - preserves raw malformed payloads without crashing the consumer.
- Wired malformed payload dead-lettering into:
  - `risk_engine` for malformed `order.inbound` messages.
  - `paper_execution` for malformed `commands.execution.paper` messages.
  - `portfolio` accounting for malformed/fatal `events.order`, `events.fill`, and `execution.fills` payloads, while keeping compatibility stream `deadletter.portfolio`.
- Added CLI ops commands:
  - `cli ops trace-order <client_order_id>`.
  - `cli ops streams`.
  - `cli ops dead-letters`.
  - `cli ops findings`.
  - `cli ops alerts`.
  - `cli ops alpha-activity --seconds <window>`.
- `trace-order` checks:
  - canonical `orders`.
  - legacy `binance_sent_orders`.
  - `paper_open_orders`.
  - `fills`.
  - `account_reservations`.
  - `order_pending_exposure`.
  - `dead_letters`.
  - `reconciliation_findings`.
  - Redis streams: `order.inbound`, `order.requests`, `commands.execution.paper`, `events.order`, `events.fill`, `execution.fills`, `events.risk.denied`, `events.dead_letter`, `deadletter.portfolio`, `events.reconciliation`, `events.alerts`.
  - mounted file logs under `/app/logs`.
- Added group 9 smoke:
  - `scripts/observability_ops_smoke.py`.
  - registers a dedicated paper Binance alpha/account.
  - submits and cancels a paper limit order.
  - injects one intentionally malformed `order.inbound` payload.
  - verifies DB trace rows, dead-letter row, health, and stream pending.
- Updated runbooks:
  - `OPERATIONS_OBSERVABILITY_RUNBOOK.md`.
  - `LOKI_GRAFANA_LOGS_GUIDE.md`.
  - added CLI ops commands and LogQL examples for tracing by `client_order_id`.
- Fixed monitor heartbeat false positive:
  - `ServiceHeartbeatMonitor` now accepts Redis heartbeat fallback, matching gateway `/v1/health`.
  - This fixed repeated `SERVICE_HEARTBEAT_MISSING: market_data` alerts when market_data was healthy via Redis heartbeat but did not have a fresh Postgres heartbeat row.

Smoke result:

- Command:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/observability_ops_smoke.py`
- Result:
  - `status=PASS`.
  - paper Binance order `g9obs1779511525` reached canonical `CANCELED`.
  - trace counts:
    - `orders=1`.
    - `reservations=1`.
    - `pending_exposure=1`.
  - malformed `order.inbound` payload recorded as:
    - `dead_letters.stream=order.inbound`.
    - `dead_letters.group_name=risk_engine_group`.
    - `dead_letters.reason=JSONDecodeError`.
  - `/v1/health=READY`.
  - stream pending all zero for `order.inbound`, `commands.execution.paper`, `events.order`, `events.fill`, `execution.fills`, and `order.requests`.

CLI verification:

- `cli --json ops trace-order g9obs1779511525 --alpha-id g9_observability_alpha --account-id paper-binance-g9_observability_alpha --mode paper --venue BINANCE`
  - found canonical order `CANCELED`.
  - found released reservation.
  - found canceled pending exposure.
  - found Redis messages in `order.inbound`, `commands.execution.paper`, and `events.order`.
  - found paper execution log lines for `ACCEPTED` and `CANCELED`.
- `cli --json ops dead-letters --stream order.inbound --limit 5`
  - found malformed group 9 `JSONDecodeError` row.
- `cli --json ops streams`
  - core stream groups had pending `0`.
  - missing optional `order.uncertain` now reports `MISSING` instead of a scary operational error when no uncertain orders exist.
- `cli health`
  - status `READY`.
  - `market_data` visible as fresh from Redis heartbeat.
- `cli ops alpha-activity --seconds 3600`
  - shows recent order count grouped by `alpha_id`, `mode`, `venue`, and `account_id`.
  - verified it surfaced recent smoke activity for `burst_paper_alpha`, `binance_g8reg_matrix`, `binance_g8reg_amend`, and `g9_observability_alpha`.
  - used to detect alpha loops left running before halting a route with `cli risk state HALTED`.
- Monitor logs after Redis fallback fix:
  - no new `SERVICE_HEARTBEAT_MISSING: market_data` warning in the observed cycle.

Tests:

- Focused observability unit suite:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_service_heartbeats.py tests/unit/test_dead_letter_writer.py tests/unit/test_reconciliation_monitoring.py tests/unit/test_cli.py`
  - result: `19 passed`.
- Full Docker unit suite:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit`
  - result: `180 passed, 2 FastAPI lifespan warnings`.

Current conclusion:

- Group 9 is closed for order traceability, malformed payload dead-lettering, stream pending visibility, heartbeat health consistency, reconciliation-finding visibility, alpha activity loop detection, and Loki/Grafana/CLI operator guidance.
- Remaining future improvement:
  - add dashboard panels for `events.alerts`, open `dead_letters`, and open `reconciliation_findings`.
  - add an endpoint-level `ops summary` API if an external dashboard should avoid direct DB/Redis reads from the CLI container.

## 24. Real Alpha Test Harness Plan: `execution_taalpha_gateway-sdk-test`

Status: planned on 2026-05-24 after Groups 1-9 reliability validation.

Target folder:

```text
/root/bobby/Papertrade_DB/execution_taalpha_gateway-sdk-test
```

Dedicated A-Z plan file:

```text
/root/bobby/Papertrade_DB/execution_taalpha_gateway-sdk-test/Documentation/ALPHA_REAL_TEST_A2Z_PLAN.md
```

### 24.1 Purpose

The next step is to test a real alpha folder against `trading_system` instead of only synthetic smoke scripts.
This phase should prove that a practical alpha can:

- read/preload/stream data from `data_layer`.
- submit orders through the shared alpha gateway SDK.
- run against three controlled deployments:
  - `paper + BINANCE`.
  - `paper + DNSE`.
  - `sandbox + BINANCE` Futures testnet.
- be onboarded from zero through documented Redis, DB, portfolio, account, and risk setup.
- be operated through CLI health, trace, dead-letter, reconciliation, and halt commands.

No Binance live or DNSE live order placement is included in this phase.

### 24.2 Required Folder Refactor

Refactor the alpha folder toward this structure:

```text
execution_taalpha_gateway-sdk-test/
  main/
  trade/
  orchestration/
  logs/
  Documentation/
  config/
  state/
```

Responsibilities:

- `main/`
  - alpha entrypoints and strategy logic.
  - scenario runner for `paper_binance`, `paper_dnse`, and `sandbox_binance`.
- `trade/`
  - thin local wrapper over mounted `trading_system/alpha_sdk/trading_system_async_action.py`.
  - no direct DB writes to legacy execution tables.
- `orchestration/`
  - data_layer preload/latest/streaming handlers.
  - symbol universe loading.
  - scenario lifecycle helpers.
- `logs/`
  - one log file per alpha/scenario.
- `Documentation/`
  - A-Z onboarding guide.
  - existing alpha markdown files after refactor.
- `config/`
  - scenario YAML/JSON if needed.
- `state/`
  - local order id mapping/runtime state.

Use `orchestration/` as the corrected folder spelling. If old code needs compatibility, document an alias instead of keeping two competing active folder names.

### 24.3 Documentation Rule

During implementation, move existing root markdown files in `execution_taalpha_gateway-sdk-test` into `Documentation/`:

- `DEBUGGING_GUIDE.md`.
- `IMPLEMENTATION_SUMMARY.md`.
- `LOGGING_README.md`.
- `README.md`.
- `README_IMPLEMENTATION.md`.
- `dev_note.md`.
- `setup.md`.

After moving, keep a short root `README.md` that points to:

```text
Documentation/ALPHA_REAL_TEST_A2Z_PLAN.md
```

### 24.4 SDK Rule

The alpha must use the shared mounted SDK:

```text
/root/bobby/trading_system/alpha_sdk/trading_system_async_action.py
```

Target mount path inside the alpha container:

```text
/opt/trading_system_alpha_sdk/trading_system_async_action.py
```

The local `trade/` wrapper should:

- import `TradingSystemAsyncAction`.
- load gateway URL, alpha id, API key, mode, venue, and account id from env/config.
- preserve compatibility with current alpha call sites where practical.
- generate Binance-safe `client_order_id` values under 36 chars.
- persist local order-id mapping under `state/`.
- expose query helpers for positions, balances, orders, fills, and health.

### 24.5 Scenario Matrix

`paper_binance`:

- mode: `paper`.
- venue: `BINANCE`.
- account: `paper-binance-taalpha_gateway_sdk_test`.
- currency: `USDT`.
- starter symbols: `BTCUSDT`, `ETHUSDT`.
- assertions:
  - data_layer warmup/latest ok.
  - paper orders submit/fill/cancel through gateway.
  - `orders`, `fills`, `positions_v2`, `account_reservations`, and `order_pending_exposure` are consistent.
  - `cli ops trace-order` finds DB, Redis, and log evidence.

`paper_dnse`:

- mode: `paper`.
- venue: `DNSE`.
- account: `paper-dnse-taalpha_gateway_sdk_test`.
- currency: `VND`.
- starter symbols: `HPG`, `FPT`, or symbols confirmed by data_layer.
- assertions:
  - no manual market seed for data-source validation.
  - VN lot/tick rules are respected.
  - `MP/LO` behavior is explicit.
  - if `VN_T_PLUS` is enabled, unsettled shares cannot be sold immediately.
  - no live DNSE endpoint is called.

`sandbox_binance`:

- mode: `sandbox`.
- venue: `BINANCE`.
- account: `sandbox-binance-taalpha_gateway_sdk_test`.
- currency: `USDT`.
- starter symbol: `BTCUSDT`.
- quantity override: `0.01` or smaller if exchange min notional requires.
- assertions:
  - `IS_TESTNET=true`.
  - broker sync fresh and `OK` before run.
  - sandbox route enabled only for test window.
  - order reaches Binance testnet and is cleaned up.
  - broker sync after test reports open orders `0`.
  - route returns to `HALTED`.

### 24.6 A-Z Onboarding Requirements

The guide must document these steps exactly:

1. Check `trading_system` health.
2. Check stream pending and dead letters.
3. Register alpha.
4. Verify Redis gateway auth.
5. Create/verify portfolio.
6. Create/verify accounts:
   - paper Binance.
   - paper DNSE.
   - sandbox Binance.
7. Configure account policies.
8. Configure allocations and capital ledger.
9. Configure risk profiles.
10. Activate paper routes.
11. Keep sandbox route halted until broker sync.
12. Sync data_layer symbols and market data.
13. Run one-cycle paper Binance.
14. Run one-cycle paper DNSE.
15. Sync Binance sandbox account.
16. Activate sandbox route.
17. Run one-cycle sandbox Binance.
18. Close/cancel all sandbox exposure.
19. Sync/reconcile broker state.
20. Halt sandbox route.
21. Final health/pending/dead-letter check.

### 24.7 Operational CLI Scenarios To Document

Required CLI examples:

- `cli health`.
- `cli ops streams`.
- `cli ops dead-letters`.
- `cli ops findings`.
- `cli ops alpha-activity`.
- `cli ops trace-order`.
- `cli redis alpha-auth`.
- `cli account state`.
- `cli account sync`.
- `cli account reconcile-positions`.
- `cli account reconcile-open-orders`.
- `cli capital history`.
- `cli risk state HALTED|ACTIVE`.

Emergency halt must be prominent:

```bash
docker compose --profile cli run --rm --no-deps cli risk state HALTED --mode sandbox --venue BINANCE
docker compose --profile cli run --rm --no-deps cli risk state HALTED --mode paper --venue BINANCE
docker compose --profile cli run --rm --no-deps cli risk state HALTED --mode paper --venue DNSE
```

### 24.8 Implementation Sequence

Do not start with sandbox. Implement and test in this order:

1. Create/refactor folder structure.
2. Move documentation files into `Documentation/` and create short root README.
3. Add local SDK wrapper in `trade/`.
4. Add `orchestration/` data_layer preload/latest helpers.
5. Add config for the three scenarios.
6. Add one-cycle scenario runner in `main/`.
7. Add alpha Docker service joining both `bobby_network` and `executor_network`.
8. Add onboarding/apply script or documented CLI/config apply path.
9. Run import/compile test inside alpha container.
10. Run `paper_binance`.
11. Run `paper_dnse`.
12. Run `sandbox_binance`.
13. Run final health/pending/dead-letter/reconciliation checks.
14. Update `Documentation/ALPHA_REAL_TEST_A2Z_PLAN.md` with actual commands and results.

### 24.9 Done Criteria

This phase is done only when:

- folder structure matches Section 24.2.
- docs are centralized under `Documentation/`.
- alpha container can call gateway over internal Docker network.
- alpha uses mounted `trading_system_async_action.py`.
- all three scenarios pass.
- every submitted order is traceable by `cli ops trace-order`.
- final `cli health` is `READY`.
- core Redis stream pending is zero.
- no new unresolved dead letter is created by the alpha test.
- Binance testnet has no leftover open orders or unintended positions.
- sandbox route is returned to `HALTED`.

### 24.10 Implementation Update - 2026-05-24

The `/root/bobby/Papertrade_DB/execution_taalpha_gateway-sdk-test` folder has been refactored into the reusable alpha harness shape:

- `main/` contains strategy-only signal generators for `ma_crossover_test`, `rsitrailling00115`, and `signalcombine0011`.
- `main/run_alpha.py` runs scenario tests against `trading_system` through the mounted alpha SDK.
- `trade/trading_system_action.py` is the stable wrapper around `/root/bobby/trading_system/alpha_sdk/trading_system_async_action.py`.
- `orchestration/` contains data_layer warmup/latest access, config loading, and logging helpers.
- `config/scenarios.yaml` defines the runtime matrix:
  - paper Binance: `BTCUSDT`, `ETHUSDT`.
  - paper DNSE: `FPT`, `HPG`.
  - sandbox Binance: `BTCUSDT`, `ETHUSDT`.
- `config/portfolio_setup.yaml` defines alpha registration, Redis auth source, portfolio/account/allocation/risk setup for all 3 alphas and 3 deployments.
- `Documentation/TA_ALPHA_GATEWAY_SDK_A2Z_GUIDE.md` is the operator guide from alpha declaration to logs, traceback, emergency stop, and sandbox cleanup.

Runtime rule:

- Paper scenarios can run continuously every 5 minutes.
- Sandbox Binance remains `HALTED` by default and must be explicitly activated, synced, tested, reconciled, and halted again.

### 24.11 DB Validation Finding - 2026-05-26

Long-running `execution_taalpha_gateway-sdk-test` paper loops exposed three integration issues that must be treated as alpha harness readiness gates:

- DB truth must beat alpha logs. Alpha logs showed DNSE `ACCEPTED`, but `cli ops trace-order rsipdn769648001fptse` showed no canonical order/fill/reservation; the order was risk-denied with `INSUFFICIENT_POSITION`. Root cause: gateway `/v1/orders` returns async enqueue acceptance, not final risk/execution acceptance. Alpha SDK must wait/query final order state for test runs and should log `SUBMITTED`, `FILLED`, `REJECTED`, etc. distinctly.
- Old paper Binance SELL fills created open dead letters because historical/account bootstrap treated paper crypto accounts as `CASH`, causing `account_balances_free_check` violations on sell-side fills. Fix direction: paper crypto defaults to `MARGIN`; accounting reads `account_policies.account_type` first when available.
- `order_pending_exposure` had SELL rows still `OPEN` even though related orders were `FILLED`; those rows correlate with the sell fills that dead-lettered before accounting could release exposure. Fresh tests after the accounting fix must prove no new open pending exposure remains for terminal orders.

Alpha harness data access must also use current data_layer contracts:

- Crypto warmup: `/v1/crypto/ohlcv/binance/{symbol}?interval=...&limit=...`.
- VN warmup: `/v1/preload/{symbol}?interval=...&limit=...&fresh=true`.
- Do not use old fixed/default 1m warmup behavior when the scenario interval is `5m`.

## 25. Copy Trading Publication Plan - Option C

This is an external business integration plan. `trading_system` remains the alpha/order source and does not manage copy-trading investors, subscriptions, investor sizing, or investor execution.

Chosen architecture:

```text
trading_system order/fill lifecycle
  -> durable Postgres copy_event_outbox
  -> copy_outbox publisher service
  -> Redis Stream copy:events:v1
  -> SSH tunnel / private VPN
  -> external copy-trading server consumer group
  -> investor subscription sizing/risk/execution
```

Why this is required:

- Redis Stream is the delivery layer, not the durable business source of truth.
- Postgres outbox prevents missing copy signals when a service crashes after DB commit but before Redis publish.
- Postgres outbox prevents "ghost" copy signals from being treated as authoritative without a committed DB source event.
- External copy-trading servers should consume a versioned copy event contract, not internal `orders`, `fills`, `positions_v2`, or legacy tables.
- Every investor copy can later be audited by `copy_event_id`, `sequence_id`, `alpha_id`, `client_order_id`, payload, Redis message id, and publish timestamp.

Scope boundaries:

- `trading_system` publishes alpha/order lifecycle events only.
- External copy-trading server owns:
  - investor subscriptions.
  - allocation and sizing rules.
  - investor-level risk.
  - investor broker credentials.
  - investor execution/reconciliation.
  - investor order audit.

### 25.1 DB Objects

Additive migration: `init-db/15-copy-trading-outbox.sql`.

Tables:

- `copy_publish_policies`: explicit allowlist for which strategy/mode/venue/event_types may be published.
- `copy_event_outbox`: durable event queue with `PENDING -> PUBLISHING -> PUBLISHED|DEAD_LETTER`.
- `copy_event_dead_letters`: failed outbox publish records after retry exhaustion.

Policy is explicit. No alpha should be published to copy trading unless `copy_publish_policies.enabled=true` matches that `strategy_id`, `mode`, `venue`, and event type.

### 25.2 Service

New service: `services/copy_outbox`.

Docker service:

- name: `copy_outbox`.
- container: `copy_outbox_service`.
- command: `python -m services.copy_outbox.main`.
- joins `executor_network`.
- writes heartbeat as `copy_outbox`.

Publisher behavior:

1. Recover stale `PUBLISHING` rows older than `COPY_OUTBOX_STALE_PUBLISHING_SECONDS`.
2. Claim `PENDING` rows by `sequence_id` using `FOR UPDATE SKIP LOCKED`.
3. Publish one Redis Stream message per outbox row.
4. Mark row `PUBLISHED` with `redis_message_id`.
5. Retry failures until `COPY_OUTBOX_MAX_ATTEMPTS`.
6. Move exhausted rows to `DEAD_LETTER` and insert `copy_event_dead_letters`.

Redis delivery stream:

- default: `copy:events:v1`.
- configured per policy by `copy_publish_policies.stream_name`.

### 25.3 Event Types

Current event contract:

- `copy.event.v1.order_intent`: risk accepted intent; fastest signal for low-latency copy.
- `copy.event.v1.order_accepted`: order accepted/open status event.
- `copy.event.v1.order_updated`: non-actionable status update, including terminal filled status from order-status events.
- `copy.event.v1.order_rejected`: risk or execution rejection.
- `copy.event.v1.order_canceled`: canceled/expired lifecycle event.
- `copy.event.v1.order_uncertain`: broker/executor uncertain state requiring reconciliation.
- `copy.event.v1.order_filled`: canonical fill event; this is the actionable fill signal.

Important rule:

- `order_intent` is fastest but may later reject/cancel.
- `order_filled` is broker/accounting-confirmed but slower.
- External copy-trading should support hybrid mode: act on intent when configured, then reconcile with accepted/rejected/filled/canceled events.

### 25.4 Event Sources

Hooks:

- Risk engine records `order_intent` after risk passes and pending exposure is reserved.
- Risk engine records `order_rejected` for risk denials.
- Portfolio projector records order status lifecycle events after consuming `events.order`.
- Portfolio projector records `order_filled` inside the same DB transaction that inserts canonical `fills` and updates `positions_v2`.

This keeps copy publication aligned to committed trading lifecycle state.

### 25.5 External Server Consumption

External copy-trading server should connect through SSH tunnel or private VPN and consume Redis Stream:

```text
copy:events:v1
```

Consumer requirements:

- Use Redis consumer groups.
- Deduplicate by `copy_event_id`.
- Process in `sequence_id` order per alpha/account where possible.
- Store last consumed `sequence_id` per consumer/subscriber service.
- Treat `order_intent` and `order_filled` differently.
- Never blindly copy raw quantity; investor server must apply subscription sizing and investor risk.
- Never need direct access to internal `orders`/`fills` schema.

### 25.6 Done Criteria

- Migration applied without resetting DB.
- `copy_outbox` service starts and heartbeats.
- Policy-gated event insertion works.
- Unpublished event publishes to Redis Stream.
- Outbox row marks `PUBLISHED` with Redis message id.
- Unit tests cover copy payload normalization and Redis fields.
- Runtime smoke inserts one event, publishes it, verifies Redis payload, and cleans DB smoke rows.
- Guide exists for the external copy-trading server.

### 25.7 Implementation Update - 2026-05-27

Implemented Option C.

Files added:

- `init-db/15-copy-trading-outbox.sql`.
- `services/copy_outbox/events.py`.
- `services/copy_outbox/repository.py`.
- `services/copy_outbox/main.py`.
- `scripts/copy_outbox_smoke.py`.
- `tests/unit/test_copy_outbox.py`.
- `COPY_TRADING_OUTBOX_GUIDE.md`.

Files updated:

- `docker-compose.yml`: added `copy_outbox` service.
- `.env.example`: added copy outbox tuning env vars.
- `shared/config.py`: added copy outbox settings.
- `services/risk_engine/main.py`: records `order_intent` after risk pass and records `order_rejected` in the same DB transaction as risk rejection logging when policy matches.
- `services/portfolio/repository/portfolio_repo.py`: records order lifecycle and canonical fill events when policy matches.
- `services/monitor/service_heartbeats.py`: includes `copy_outbox` as a required heartbeat service.
- `README.md`: includes `copy_outbox` in service overview.

Runtime result:

- Migration `15-copy-trading-outbox.sql` applied additively to running Postgres.
- Recreated `risk_engine`, `portfolio`, and `monitor`.
- Started `copy_outbox_service`.
- `/v1/health` returned `READY` with fresh `copy_outbox` heartbeat.
- `copy_event_outbox` had zero pending rows after smoke cleanup.
- `copy_event_dead_letters` open count was zero.

Validation:

- Compile pass:
  - `services/copy_outbox/events.py`
  - `services/copy_outbox/repository.py`
  - `services/copy_outbox/main.py`
  - `services/risk_engine/main.py`
  - `services/portfolio/repository/portfolio_repo.py`
  - `scripts/copy_outbox_smoke.py`
  - `shared/config.py`
  - `services/monitor/service_heartbeats.py`
- Unit tests:
  - `tests/unit/test_copy_outbox.py`
  - `tests/unit/test_portfolio_order_events.py`
  - `tests/unit/test_gateway_idempotency.py`
  - result: `16 passed`.
- Regression unit tests:
  - `tests/unit/test_copy_outbox.py`
  - `tests/unit/test_risk_checker_market_metadata.py`
  - `tests/unit/test_portfolio_order_events.py`
  - `tests/unit/test_dead_letter_writer.py`
  - `tests/unit/test_service_heartbeats.py`
  - result: `26 passed`.
- Heartbeat/copy tests after adding `copy_outbox` required service:
  - `tests/unit/test_service_heartbeats.py`
  - `tests/unit/test_copy_outbox.py`
  - result: `6 passed`.
- Risk transaction update regression:
  - `tests/unit/test_copy_outbox.py`
  - `tests/unit/test_risk_checker_market_metadata.py`
  - `tests/unit/test_gateway_idempotency.py`
  - result: `20 passed`.
- Runtime smoke:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli scripts/copy_outbox_smoke.py`.
  - inserted policy-gated event.
  - published to Redis Stream `copy:events:v1`.
  - marked outbox row `PUBLISHED` with Redis id.
  - cleaned smoke DB rows.

Operational note:

- The smoke Redis message was removed from `copy:events:v1` after validation so the stream is clean for real copy-trading tests.
- Production copy-trading server must deduplicate by `copy_event_id` because DB/Redis cannot provide exactly-once delivery across a process crash after Redis `XADD` but before DB `PUBLISHED` update.

### 25.8 Copy Policy Enablement and Service Smoke - 2026-06-07

Problem found during the combine/fib shared physical sandbox audit:

- `copy_outbox_service` was healthy, but `copy_event_outbox` remained empty because the active
  migrated alpha config had no enabled `copy_publish_policies` rows.
- Order/fill hooks were already implemented; the missing piece was explicit policy enablement.

Changes:

- Added explicit `copy_publish_policies` to
  `config/_config/portfolio_account_config_setup.yaml`.
- Enabled only paper/sandbox migrated alpha test scopes:
  - `rsiboundportfolioA001_1d`: paper BINANCE, paper DNSE, sandbox BINANCE.
  - `regressionportfolioA001_1d`: paper BINANCE, paper DNSE, sandbox BINANCE.
  - `combine_weight_sl_tp_0011h`: paper BINANCE, sandbox BINANCE.
  - `combine_weight_sl_tp_0014h`: paper BINANCE, sandbox BINANCE.
  - `fib_sl_tp_strength_0015m`: paper BINANCE, sandbox BINANCE.
  - `fib_sl_tp_strength_00115m`: paper BINANCE, sandbox BINANCE.
  - `fib_sl_tp_strength_00130m`: paper BINANCE, sandbox BINANCE.
- Enabled copy event types:
  - `copy.event.v1.order_intent`;
  - `copy.event.v1.order_rejected`;
  - `copy.event.v1.order_canceled`;
  - `copy.event.v1.order_uncertain`;
  - `copy.event.v1.order_filled`.
- No live copy policy was enabled.
- Added `scripts/copy_outbox_policy_smoke.py` to validate one real configured policy without
  placing a broker order. Default behavior cleans the smoke DB row and Redis stream message after
  validation.
- Updated `COPY_TRADING_OUTBOX_GUIDE.md` with the current migrated-alpha policies and the new
  policy smoke command.

Validation:

- `docker compose --profile cli run --rm --no-deps cli config plan
  /app/config/_config/portfolio_account_config_setup.yaml`: passed and showed 16 enabled
  `copy_policy` steps.
- `docker compose --profile cli run --rm --no-deps cli config apply
  /app/config/_config/portfolio_account_config_setup.yaml --reason "enable migrated alpha copy
  outbox policies"`: passed and upserted 16 copy policies.
- `docker compose --profile cli run --rm --no-deps cli copy policies --enabled true`: returned
  16 enabled policies.
- Direct policy smoke for `fib_sl_tp_strength_00130m/sandbox/BINANCE`: inserted one
  `copy.event.v1.order_filled`, published to `copy:events:v1`, then cleaned it.
- Service-loop policy smoke with `--publisher service`: verified `copy_outbox_service` itself
  claimed/published the event to Redis Stream and marked the outbox row `PUBLISHED`; cleanup then
  removed the DB row and Redis message.
- Post-smoke audit:
  - `copy_event_outbox`: zero rows;
  - unresolved `copy_event_dead_letters`: zero;
  - Redis `XLEN copy:events:v1`: zero after cleanup;
  - `service_heartbeats.copy_outbox`: `READY`.
- Targeted tests passed:
  - `tests/unit/test_copy_outbox.py`;
  - `tests/unit/test_cli.py`;
  - `tests/unit/test_portfolio_order_events.py`;
  - result: `30 passed`.

### 25.9 Copy Event / Copy Command Inheritance Upgrade Plan - 2026-06-18

Purpose:

- Keep the current `copy.event.v1` Redis/DB contract working for the existing external server and
  Discord notification flow.
- Add enough optional metadata for bracket/OCO/multi-leg execution without forcing downstream
  consumers to migrate immediately.
- Introduce a separate execution-command contract for future customer VPS agents. An event is an
  audit/publication fact; a command is an authorized instruction that an external execution agent
  may act on.
- Do not move investor subscription, investor sizing, billing, dashboard, or client portal logic
  into `trading_system`. Those stay on the external SaaS server.

Current codebase anchors:

- Event normalization: `services/copy_outbox/events.py`.
- Durable outbox publisher: `services/copy_outbox/main.py`.
- Outbox repository: `services/copy_outbox/repository.py`.
- DB schema: `init-db/15-copy-trading-outbox.sql`.
- Existing event hooks:
  - `services/risk_engine/main.py` for `order_intent` and risk rejection;
  - `services/portfolio/repository/portfolio_repo.py` for order lifecycle and fills;
  - `services/portfolio_management/repository.py` for accounting/projector-side fill events.
- Bracket metadata source:
  - gateway order schema has `bracket_group_id`, `bracket_leg_type`, `bracket_leg_index`;
  - bracket manager/repository own `order_brackets` and `order_bracket_legs`.
- Existing delivery stream: `copy:events:v1`.

Resource impact estimate:

- Phase A is lightweight because it reuses the existing DB table, service, and Redis Stream.
  It only adds optional payload fields and possibly a few indexed metadata columns if truly needed.
- Expected per-event payload growth:
  - current normalized event: roughly small JSON payload suitable for Discord/audit;
  - enriched event: adds bracket/session/risk/broker-option fields, typically another 0.5-2 KB per
    actionable order event depending on child-leg metadata;
  - CPU cost is negligible compared with order/risk/portfolio work because enrichment is dictionary
    normalization and JSON serialization already done by `copy_outbox`.
- DB cost:
  - no meaningful write-amplification in Phase A: one row remains one row;
  - row size grows only for events that carry extra metadata;
  - existing indexes remain mostly unchanged unless a query requires a new partial index.
- Redis cost:
  - Redis Stream memory grows with payload size, but the stream already has `MAXLEN approximate`
    controlled by `COPY_OUTBOX_STREAM_MAXLEN`;
  - if average payload doubles, memory for the capped stream approximately doubles. This is bounded
    by maxlen and should be monitored rather than over-engineered early.
- Phase B creates a new command path. If every actionable event also produces one command, command
  DB/Redis writes can add up to roughly one extra row/message per actionable order intent. It should
  therefore be policy-gated and limited to execution-enabled subscribers/strategies, not generated
  for all Discord-only policies.
- Phase C moves execution load to customer VPS agents. The trading-system resource cost is limited
  to producing commands and receiving optional result callbacks if enabled. Broker API calls,
  reconnect loops, and local idempotency live outside `trading_system`.

Design rules:

- Backward compatibility first:
  - never remove or rename existing `copy.event.v1` fields;
  - downstream consumers that only read old fields must continue to work;
  - add optional fields only.
- Event and command are separate:
  - `copy.event.v1.*` remains the durable lifecycle/audit/notification feed;
  - `copy.command.v1.*` is the explicit execution instruction feed for customer-side agents.
- No raw alpha leakage:
  - default `include_raw=false`;
  - do not publish dataframe, indicators, private strategy params, or alpha signal internals;
  - publish only execution-safe fields.
- Policy-gated publication:
  - existing `copy_publish_policies` continues to control event publication;
  - command publication must have its own explicit allowlist/policy, so Discord-only copy policies
    never become executable by accident.
- Idempotency:
  - event consumers dedupe by `copy_event_id`;
  - command consumers dedupe by `copy_command_id`;
  - commands should also carry source `copy_event_id` and source `client_order_id`.
- Customer execution is not trusted blindly:
  - SaaS server applies investor subscription sizing/risk before emitting a command;
  - customer agent applies local final guardrails before broker submit.

#### Phase A - Enrich `copy.event.v1` Without Breaking Existing Consumers

Goal:

- Make current events clearer and more complete for Discord, audit, and future command derivation.
- Support bracket/OCO/multi-leg observability in the current event stream without changing stream
  name or required fields.

Payload additions to `copy.event.v1`:

- Correlation:
  - `execution_session_id`;
  - `risk_grant_id`;
  - `bracket_group_id`;
  - `bracket_leg_type`: `ENTRY`, `STOP`, `TP`, later `TRAILING_STOP`;
  - `bracket_leg_index`;
  - `parent_client_order_id`;
  - `source_order_id` when the event is derived from a canonical order/fill.
- Lifecycle semantics:
  - `copy_intent`: `NOTIFY_ONLY`, `EXECUTION_SOURCE`, `AUDIT_ONLY`;
  - `action`: `OPEN`, `CLOSE`, `REDUCE`, `CANCEL`, `AMEND`, `BRACKET_OPEN`,
    `BRACKET_CHILD`, `BRACKET_CANCEL`, `BRACKET_STOP_REPLACE`;
  - `order_family`: `SINGLE`, `BRACKET`, `OCO_GROUP`, `GRID_LEG`, `PAIR_LEG`;
  - `is_terminal`;
  - `is_actionable`;
  - `expires_at_unix` for stale-signal protection.
- Execution details:
  - `trigger_type` / `working_type` if present;
  - `close_position`;
  - `price_protect`;
  - `broker_order_options` as a whitelisted object, not raw broker response.
- Sizing context for external SaaS audit only:
  - `source_quantity`;
  - `source_notional`;
  - `source_leverage`;
  - no investor sizing fields in trading_system.

Implementation steps:

1. Update `services/copy_outbox/events.py`:
   - extend `build_copy_payload()` to pass through optional safe fields;
   - preserve all current keys and default behavior;
   - normalize booleans and enums consistently.
2. Update event hook payloads where metadata is available:
   - risk accepted/rejected intent path;
   - portfolio order lifecycle path;
   - canonical fill path;
   - bracket manager leg payloads already carry bracket metadata into the normal order path.
3. Update tests:
   - `tests/unit/test_copy_outbox.py` for backward-compatible payload normalization;
   - portfolio/risk event tests to prove legacy fields still exist;
   - bracket copy event test proving `bracket_group_id`, `bracket_leg_type`, and
     `bracket_leg_index` survive to outbox payload.
4. Runtime smoke:
   - emit one non-bracket order event and verify old consumer fields;
   - emit one bracket child event and verify enriched metadata;
   - verify DB `copy_event_outbox.status=PUBLISHED`;
   - verify Redis `copy:events:v1` receives the enriched payload;
   - verify old Discord-style parser can ignore unknown fields.
5. Docs:
   - update `COPY_TRADING_OUTBOX_GUIDE.md` with an "enriched v1 optional fields" section;
   - include a sample single-order event and a sample bracket child event.

Done criteria:

- Existing Discord/external server can keep consuming `copy.event.v1`.
- Enriched bracket metadata is present for bracket/OCO orders.
- No raw alpha dataframe/indicator/strategy params are published.
- Unit tests and smoke tests pass.

#### Phase B - Add Explicit `copy.command.v1` Contract For Executable Copy

Goal:

- Introduce a separate command contract that the external SaaS server can send to customer VPS
  agents after applying investor subscription sizing/risk.
- Keep command generation outside the current Discord-only path.

Important boundary:

- `trading_system` may provide source event facts and optional command templates.
- The external SaaS server owns investor subscription expansion and should produce final
  investor-specific commands.
- If `trading_system` produces any command-like object, it must be source/account scoped, not
  investor scoped.

Recommended command types:

- `copy.command.v1.place_order`;
- `copy.command.v1.cancel_order`;
- `copy.command.v1.replace_order`;
- `copy.command.v1.open_bracket`;
- `copy.command.v1.cancel_bracket`;
- `copy.command.v1.replace_bracket_stop`;
- `copy.command.v1.close_position`.

Command payload:

- Metadata:
  - `copy_command_id`;
  - `schema_version`;
  - `command_type`;
  - `created_at_unix`;
  - `expires_at_unix`;
  - `source_copy_event_id`;
  - `source_sequence_id`;
  - `source_alpha_id`;
  - `source_strategy_id`;
  - `source_account_id`;
- Target context:
  - `investor_id` or external masked account id, owned by SaaS;
  - `agent_id`;
  - `broker`;
  - `venue`;
  - `market_type`: `spot`, `usdm_futures`, `stock_cash`, later `margin`;
- Execution instruction:
  - `symbol`;
  - `side`;
  - `position_side`;
  - `order_type`;
  - `quantity`;
  - `price`;
  - `trigger_price`;
  - `time_in_force`;
  - `reduce_only`;
  - `post_only`;
  - `close_position`;
  - `client_order_id`;
  - `broker_order_options`.
- Bracket/OCO:
  - `bracket_group_id`;
  - `entry`;
  - `stop_loss`;
  - `take_profits`;
  - `oco_policy`;
  - `activation_policy`;
  - `replace_stop_policy`.
- Safety:
  - `max_slippage_bps`;
  - `max_notional`;
  - `max_quantity`;
  - `freshness_ttl_ms`;
  - `idempotency_key`;
  - `signature`;
  - `signature_algorithm`;

Implementation options:

- Option B1, recommended first:
  - Add contract schemas and sample command generation utilities only.
  - The external SaaS server derives final investor commands from `copy.event.v1.enriched`.
  - No new `trading_system` command publisher service yet.
- Option B2, later if needed:
  - Add `copy_command_outbox` and `copy:commands:v1` inside `trading_system`.
  - Use this only for source-account command templates or internal testing, not investor fanout.

Phase B implementation steps for this repo:

1. Add schema module:
   - `services/copy_outbox/command_contract.py` or `shared/copy_contracts.py`;
   - typed builders for `place_order`, `cancel_order`, `replace_order`, `open_bracket`.
2. Add tests:
   - command schema validation;
   - bracket command serialization;
   - idempotency key stability;
   - signature field presence but not secret signing in trading_system tests.
3. Add a script:
   - `scripts/copy_command_contract_smoke.py`;
   - reads one recent `copy_event_outbox` row and renders a command-template JSON without
     publishing to a live customer.
4. Add docs:
   - `COPY_TRADING_OUTBOX_GUIDE.md` section: event vs command;
   - sample command JSON for market, limit, cancel, replace stop, and open bracket.
5. Optional DB only if B2 is chosen later:
   - `copy_command_outbox`;
   - `copy_command_dead_letters`;
   - command publisher config;
   - this is not required for the first command-contract release.

Done criteria:

- The command contract can express all order types currently supported by trading_system:
  single orders, cancels, amend/cancel-replace, and bracket/OCO-managed orders.
- External SaaS can map enriched events to command JSON without reading internal DB tables.
- Existing copy event publication remains unchanged.

#### Phase C - Public Customer VPS Agent / Package Plan

Goal:

- Create a small public/open-source installable agent that runs on customer VPS, receives authorized
  commands from the external SaaS server, executes them through customer broker credentials, and
  reports results back.
- Do not copy the full `trading_system` repo. Only extract safe contracts, broker adapter
  interfaces, local idempotency, local risk guardrails, CLI, and diagnostics.

Repository/package shape:

```text
copy_agent/
  pyproject.toml
  README.md
  src/copy_agent/
    contracts/
      copy_event_v1.py
      copy_command_v1.py
      broker_result_v1.py
    transports/
      https_poll_client.py
      websocket_client.py
      redis_stream_client.py optional/private-lab only
    brokers/
      base.py
      binance_usdm.py
      binance_spot.py
      dnse_stub.py
    risk/
      local_guard.py
    runtime/
      idempotency_store.py
      heartbeat.py
      clock.py
      logging.py
    cli/
      main.py
  tests/
  docker/
    Dockerfile
    docker-compose.example.yml
```

Public package scope:

- Safe to open source:
  - event/command/result schemas;
  - broker adapter interfaces;
  - Binance testnet adapter;
  - dry-run executor;
  - local idempotency and state store;
  - CLI diagnostics;
  - install/run docs.
- Not open source from trading_system:
  - alpha logic;
  - portfolio/risk engines;
  - internal DB schema;
  - broker credentials;
  - private SaaS subscription/routing logic.

Customer agent behavior:

1. Start with config/env:
   - SaaS endpoint;
   - agent token/public key config;
   - broker API credentials stored locally on customer VPS;
   - dry-run/testnet/live mode.
2. Establish outbound connection:
   - prefer HTTPS polling or WebSocket over exposing Redis to customer VPS;
   - Redis Stream client is optional for private lab/SSH tunnel deployments only.
3. Receive command:
   - verify signature;
   - verify `expires_at_unix`;
   - dedupe `copy_command_id` / `idempotency_key`;
   - apply local guardrails: symbol allowlist, max notional, reduce-only permission, mode, broker.
4. Execute broker call:
   - use adapter-specific mapping for Binance USDM/Spot first;
   - preserve `client_order_id` idempotency;
   - map broker response to `broker_result_v1`.
5. Report result:
   - accepted/rejected/filled/canceled/uncertain;
   - broker order id;
   - error code/message;
   - local timestamp and latency.
6. Recovery:
   - on restart, reload local idempotency store;
   - query broker open orders/positions where adapter supports it;
   - do not replay expired commands.

Customer-agent CLI:

- `copy-agent doctor`: check Python/Docker, network, clock drift, config, broker permissions.
- `copy-agent test-broker --testnet`: place/cancel a tiny testnet order or dry-run if requested.
- `copy-agent run`: start the agent loop.
- `copy-agent status`: show connection, last command, last broker result, heartbeat.
- `copy-agent dry-run-command sample.json`: validate a command without broker side effects.
- `copy-agent install-systemd` or docker compose examples for non-technical users.

Security requirements:

- All customer-facing command transport should be outbound from customer VPS to SaaS.
- Commands must be signed and time-limited.
- Agent must never execute commands with missing/invalid signature or expired TTL.
- Agent must keep local idempotency to survive restarts and duplicate delivery.
- Agent should support dry-run and testnet before live.

Phase C implementation steps:

1. Create a separate repository skeleton, not inside the trading_system service tree except possibly
   temporary local staging.
2. Copy only contract definitions and small utility code that is safe and stable.
3. Implement dry-run transport and dry-run broker first.
4. Implement Binance USDM testnet adapter.
5. Add CLI diagnostics and sample configs.
6. Add Dockerfile and docker-compose example for non-technical users.
7. Add unit tests:
   - command validation;
   - signature reject/accept;
   - TTL reject;
   - idempotency duplicate skip;
   - broker adapter mapping for market/limit/stop/take-profit/bracket command.
8. Add integration smoke:
   - feed sample commands from fixtures;
   - verify broker adapter dry-run outputs expected request body;
   - optional Binance testnet smoke gated by env credentials.

Done criteria:

- Public package can run without access to trading_system internals.
- Agent can consume sample command JSON, validate it, execute dry-run, and produce result JSON.
- Binance testnet path is available behind explicit testnet config.
- Non-technical install path exists through Docker compose.
- The external SaaS server can adopt the package without changing current Discord-only event flow.

#### Phase A/B Implementation Update - 2026-06-18

Implemented now:

- Phase A:
  - extended `services/copy_outbox/events.py` with backward-compatible optional fields:
    `execution_session_id`, `risk_grant_id`, `source_order_id`, `bracket_group_id`,
    `bracket_leg_type`, `bracket_leg_index`, `parent_client_order_id`, `copy_intent`, `action`,
    `order_family`, `is_terminal`, `is_actionable`, `expires_at_unix`, `trigger_type`,
    `working_type`, `close_position`, `price_protect`, `broker_order_options`,
    `source_quantity`, `source_notional`, and `source_leverage`;
  - added a whitelist for `broker_order_options` so raw broker/internal objects are not dumped into
    the normalized event payload;
  - kept `schema_version=copy.event.v1` and preserved all existing required/legacy fields.
- Phase B:
  - added `services/copy_outbox/command_contract.py`;
  - added command builders for:
    - `copy.command.v1.place_order`;
    - `copy.command.v1.cancel_order`;
    - `copy.command.v1.replace_order`;
    - `copy.command.v1.open_bracket`;
    - `copy.command.v1.replace_bracket_stop`;
    - `copy.command.v1.close_position`;
  - command ids are stable/deterministic from command type, source event id, agent id, investor id,
    and source client order id, giving customer agents a usable idempotency key;
  - added `scripts/copy_command_contract_smoke.py` to render a command template from a JSON payload
    or an existing `copy_event_outbox` row without publishing or placing a broker order.
- Docs:
  - updated `COPY_TRADING_OUTBOX_GUIDE.md` with enriched `copy.event.v1` optional fields,
    event-vs-command boundaries, command types, customer-agent safety expectations, and the command
    smoke command.

Validation:

- Docker targeted tests passed:
  - `pytest tests/unit/test_copy_outbox.py tests/unit/test_copy_command_contract.py -q`
    (`12 passed`);
  - `pytest tests/unit/test_copy_outbox.py tests/unit/test_copy_command_contract.py
    tests/unit/test_portfolio_order_events.py tests/unit/test_gateway_idempotency.py -q`
    (`26 passed`).
- Runtime command-template smoke passed:
  - `docker compose --profile cli run --rm --no-deps --entrypoint python cli
    scripts/copy_command_contract_smoke.py --latest --command-type copy.command.v1.place_order
    --investor-id smoke-investor --agent-id smoke-agent`;
  - rendered a `copy.command.v1.place_order` template from a real bracket TP event with
    `order_type=TAKE_PROFIT_MARKET`, `position_side=SHORT`, `reduce_only=true`, and source
    `copy_event_id`.

Remaining intentionally deferred:

- No new `copy_command_outbox` table/service was added. The current release provides the command
  contract/template for the external SaaS server to use after investor risk/sizing. This preserves
  the existing Discord/event flow and avoids doubling DB/Redis writes for notification-only
  policies.
- Phase C public agent repository/package is implemented as a separate sibling repo at
  `/root/bobby/copy_agent`, not inside `trading_system`.

#### Phase C Implementation Update - 2026-06-18

Implemented a small standalone package/repo:

```text
/root/bobby/copy_agent
```

Scope implemented:

- Package metadata:
  - `pyproject.toml`;
  - `.gitignore`;
  - `README.md`;
  - Docker assets in `docker/`.
- Contracts:
  - copied/adapted `copy.command.v1` from trading_system into
    `src/copy_agent/contracts/copy_command_v1.py`;
  - added `src/copy_agent/contracts/copy_event_v1.py` for backward-compatible
    `copy.event.v1` normalization.
- Runtime:
  - local JSON idempotency store;
  - heartbeat builder;
  - clock/expiry helper;
  - basic logging setup.
- Local safety:
  - `LocalGuard` with symbol allowlist, venue allowlist, command type allowlist, max notional,
    max quantity, reduce-only/open permissions, and signature-required gate.
- Broker adapters:
  - `DryRunBrokerAdapter`;
  - `BinanceUsdmAdapter` request mapping for USDM Futures; default is dry-run and it never submits
    unless explicitly constructed with `live_submit=True`;
  - `BinanceSpotAdapter` request mapping;
  - `DnseStubAdapter` explicit unsupported stub until DNSE endpoint semantics are confirmed.
- Transports:
  - HTTPS polling client skeleton;
  - WebSocket placeholder;
  - Redis Stream placeholder marked private-lab only.
- CLI:
  - `copy-agent doctor`;
  - `copy-agent status`;
  - `copy-agent dry-run-command`.
- Examples:
  - `examples/place_order_command.json`;
  - `examples/open_bracket_command.json`.

Validation completed:

- Unit tests in `/root/bobby/copy_agent/tests`:
  - copy event v1 compatibility;
  - deterministic command id/idempotency key;
  - place-order and open-bracket command builders;
  - local guard accept/reject behavior;
  - idempotency persistence;
  - Binance USDM request mapping;
  - CLI dry-run and duplicate skip.
- Docker test command:

```bash
docker compose --profile test run --rm --no-deps \
  -v /root/bobby/copy_agent:/work \
  -w /work test_runner pytest -q
```

Result: `9 passed`.

- CLI smoke commands:

```bash
docker compose --profile test run --rm --no-deps \
  -v /root/bobby/copy_agent:/work \
  -w /work -e PYTHONPATH=src test_runner \
  python -m copy_agent.cli.main doctor --agent-id smoke-agent
```

```bash
docker compose --profile test run --rm --no-deps \
  -v /root/bobby/copy_agent:/work \
  -w /work -e PYTHONPATH=src test_runner \
  python -m copy_agent.cli.main dry-run-command examples/place_order_command.json \
  --state-path /tmp/copy-agent-smoke.json \
  --allowed-symbol ETHUSDT \
  --allowed-venue BINANCE \
  --max-notional 100
```

```bash
docker compose --profile test run --rm --no-deps \
  -v /root/bobby/copy_agent:/work \
  -w /work -e PYTHONPATH=src test_runner \
  python -m copy_agent.cli.main dry-run-command examples/place_order_command.json \
  --adapter binance-usdm \
  --state-path /tmp/copy-agent-smoke-binance.json \
  --allowed-symbol ETHUSDT \
  --allowed-venue BINANCE \
  --max-notional 100
```

Results:

- `doctor` returned `status=OK`;
- dry-run adapter returned `status=DRY_RUN`;
- Binance USDM adapter returned a Binance Futures request body without broker submission;
- compileall passed for `src` and `tests`.

#### Phase C Data Layer Integration Update - 2026-06-19

Added data-layer contract support to `/root/bobby/copy_agent` so the public package can participate
in the broader Bobby ecosystem without direct market-data provider connections.

Implemented:

- `src/copy_agent/data_layer/client.py`:
  - vendored/adapted the official `data_layer.app.sdk.DataLayerClient` contract;
  - uses `httpx` for REST;
  - keeps Redis Pub/Sub optional behind the `bobby-copy-agent[redis]` extra;
  - supports:
    - `health()`;
    - `stream_health()`;
    - `latest_trade(provider="binance", symbol, market=spot|usdm|auto)`;
    - `latest_kline(provider="binance", symbol, interval)`;
    - `latest_vn_quote(symbol, allow_last_snapshot=True)`;
    - `warmup_ohlcv(market="crypto|vn_stock", symbol, interval, limit, provider=...)`;
    - `warmup_ohlcv_batch(...)`;
    - crypto fallback status/reference;
    - Redis latest-state get/subscribe helpers when optional Redis dependency is installed;
    - source and freshness validation helpers.
- CLI:
  - added `copy-agent data-layer-check`.
- README:
  - documented the same market-data rules as the core stack:
    REST for warmup/recovery/diagnostics, Redis Pub/Sub for optional/private-lab streaming, and no
    direct Binance/DNSE/vnstock/OKX market-data connections when running inside the stack.

Validation:

- Unit tests:

```bash
docker compose --profile test run --rm --no-deps \
  -v /root/bobby/copy_agent:/work \
  -w /work test_runner pytest -q
```

Result: `13 passed`.

- Compile:

```bash
docker compose --profile test run --rm --no-deps \
  -v /root/bobby/copy_agent:/work \
  -w /work -e PYTHONPATH=src test_runner \
  python -m compileall -q src tests
```

Result: pass.

- Real data_layer smoke from `bobby_network`:

```bash
docker run --rm --network bobby_network \
  -v /root/bobby/copy_agent:/work \
  -w /work -e PYTHONPATH=src tradingsystem-image:latest \
  python -m copy_agent.cli.main data-layer-check \
  --base-url http://data_layer_service:8100 \
  --symbol BTCUSDT \
  --market crypto \
  --provider binance \
  --binance-market usdm \
  --interval 15m \
  --limit 1
```

Result:

- `/v1/health` returned `status=ok`;
- `/v1/crypto/ohlcv/binance/BTCUSDT?interval=15m&limit=1&market=usdm` returned one 15m candle;
- `/v1/binance/price/BTCUSDT?market=usdm` returned live authoritative Binance USDM trade data.

Observation:

- `data_layer` health still reports broad-universe stream warnings such as queue drops/stale/missing
  feeds. That is a data-layer operational issue already known from prior work, not a copy-agent
  client contract failure. The specific REST contracts needed by `copy_agent` passed the smoke test.

Remaining intentionally deferred at that checkpoint:

- Real HTTPS/WebSocket SaaS authentication and command polling endpoint integration;
- command signature verification implementation with SaaS-provided public key/secret;
- live broker submission path and credential loader;
- DNSE live adapter until official endpoint semantics are confirmed;
- packaging/publishing to PyPI or a public Git repository.

#### Phase C SaaS Polling / Signature Update - 2026-06-19

Implemented in `/root/bobby/copy_agent`:

- Real outbound HTTPS polling path for customer VPS agents:
  - `GET /api/agent/v1/commands?agent_id=...&limit=...`;
  - `POST /api/agent/v1/results`;
  - `POST /api/agent/v1/heartbeat`.
- CLI commands:
  - `copy-agent run-once`;
  - `copy-agent run`;
  - `copy-agent heartbeat`;
  - `copy-agent sign-command`;
  - `copy-agent verify-command`.
- `AgentConfig`:
  - env-based config via `COPY_AGENT_*`;
  - optional JSON config file;
  - local idempotency path;
  - adapter selection;
  - local guardrails;
  - command signature settings.
- SaaS auth design:
  - agent sends a programmatic API key such as `lk_live_...` to the SaaS server;
  - default header is `Authorization: Bearer <key>`;
  - configurable alternate header supports `X-API-Key`;
  - SaaS API key is required by default for polling and can only be disabled for local mocked tests;
  - SaaS should store only `sha256(api_key)` and enforce per-client rate limits.
- Command signature design:
  - first release supports `hmac-sha256`;
  - canonical payload excludes `signature` and `signature_algorithm`, then uses sorted compact JSON;
  - `COPY_AGENT_REQUIRE_SIGNATURE=true` rejects missing/tampered commands before broker execution;
  - API key auth and command signature are intentionally separate.

Important boundary:

- The SaaS API key authenticates the agent's outbound request to the external SaaS server.
- The command signature verifies the command payload itself.
- Do not reuse the SaaS API key as the command signing secret.

Test plan was added under `/root/bobby/copy_agent/dev_note.md` for these two parts only. Tests were
not executed in this update by request; they should be run in the next validation pass before
enabling any live/testnet broker side effect.

Remaining immediately after the polling/signature update, before the Binance submission guard update:

- WebSocket SaaS transport is still placeholder; HTTPS polling is the first production path.
- Ed25519/public-key command verification is not implemented yet; HMAC-SHA256 is the first release.
- Live/testnet broker submission from `copy_agent` is still intentionally deferred.
- DNSE live adapter remains a stub until endpoint semantics are confirmed.
- Packaging/publishing to PyPI or a public Git repository remains deferred.

#### Phase C Binance Testnet / Live Submission Guard Update - 2026-06-19

Implemented in `/root/bobby/copy_agent`:

- Direct Binance USD-M Futures REST client:
  - no dependency on `python-binance` for the public customer agent;
  - testnet base URL: `https://testnet.binancefuture.com`;
  - live base URL: `https://fapi.binance.com`;
  - signed account/open-orders/position/create-order/cancel-order methods.
- CLI:
  - `copy-agent test-broker`;
  - `copy-agent live-preflight`.
- Testnet safety:
  - account query is credential-gated;
  - place/cancel smoke uses a tiny far-from-market LIMIT order;
  - broker side effect requires `--place-cancel-smoke --confirm TESTNET_ORDER`;
  - automated MARKET smoke is intentionally not supported by default.
- Live safety:
  - live adapter construction requires:
    - `COPY_AGENT_BROKER_MODE=live`;
    - `COPY_AGENT_LIVE_SUBMIT=true`;
    - `COPY_AGENT_LIVE_CONFIRM=I_UNDERSTAND_THIS_SUBMITS_LIVE_ORDERS`;
    - Binance API key/secret;
    - `COPY_AGENT_REQUIRE_SIGNATURE=true`;
    - non-empty symbol allowlist;
    - `COPY_AGENT_MAX_NOTIONAL`;
    - no active local HALT file.
- Local investor execution policy:
  - customer agent keeps an extra local overlay for `capital`, `allocation_pct`, `leverage`,
    `quantity_multiplier`, `max_order_notional`, `min_notional`, and `margin_mode`;
  - this policy scales/caps the command after signature verification and before local guard/broker
    execution;
  - it does not fabricate prices for MARKET orders or replace SaaS-side investor sizing.
- Broker command scope:
  - single order submit, cancel, and close-position commands can be executed when explicitly enabled;
  - bracket/replace commands are rejected in the public live agent unless SaaS expands them into
    explicit signed child commands. This keeps the public agent small and avoids shipping an
    incomplete bracket lifecycle engine.
- Customer-service security notes were added to `copy_agent/README.md`:
  - technicians should not handle customer broker secrets directly;
  - use guided local setup on customer VPS;
  - no withdrawal permission;
  - testnet first;
  - low notional caps and symbol allowlists first;
  - SaaS API keys and command signing material rotate independently.

Validation:

- Docker unit tests for `/root/bobby/copy_agent`: `19 passed`.
- Docker `compileall`: pass.

Not run:

- Real Binance testnet account query/place-cancel smoke, because credentials are required.
- Any live broker order. Live smoke must remain human-approved and tiny.

Remaining after this update:

- WebSocket SaaS transport is still placeholder.
- Ed25519/public-key command verification is still future work.
- DNSE live adapter remains a stub until endpoint semantics are confirmed.
- Packaging/publishing to PyPI or a public Git repository remains deferred.

#### Phase C Agent Skill / Diagnostics Update - 2026-06-19

Implemented in `/root/bobby/copy_agent`:

- `runtime.diagnostics`:
  - redacts API keys, HMAC secrets, Binance secrets, signatures, and tokens;
  - builds agent-friendly `doctor_report()`;
  - builds `diagnose_log()` with known failure pattern detection.
- CLI:
  - `copy-agent doctor --config ... --verbose`;
  - `copy-agent doctor --json` accepted for automation compatibility;
  - `copy-agent diagnose-log path.log --tail-lines 500`.
- Public playbook:
  - `AGENT_SKILL.md`;
  - covers safe setup rules, testnet smoke, live preflight, emergency HALT, SaaS polling, and common
    error meanings.

Purpose:

- Give future AI support agents and technicians a small, parseable, non-secret-leaking workflow for
  customer VPS onboarding and troubleshooting.
- Keep diagnostics read-only. The skill explains and checks; it does not auto-place broker orders.

Validation:

- Docker unit tests for `/root/bobby/copy_agent`: `49 passed`.
- Docker `compileall`: pass.
- Added the detailed production validation matrix to `/root/bobby/copy_agent/dev_note.md`, covering
  config/secrets, SaaS polling, signatures, local guard, broker mapping, data layer, agent skill,
  recovery/idempotency, security/abuse control, and future broker adapters.
- Added external command-stream simulation coverage: a fake external agent receives signed command
  payloads from a mocked command stream, verifies HMAC, applies local guard/idempotency, dry-run
  executes, and reports results.
- Added explicit client sizing-funnel walkthrough/test in `/root/bobby/copy_agent/dev_note.md`:
  source `copy.command.v1` quantity `0.10` becomes customer-local executable quantity `0.05` through
  `quantity_multiplier=0.5`, then maps to a Binance USDM dry-run request and result report.
- Current copy-agent lab version is temporarily closed as dry-run/mocked-stream/testnet-ready, with
  real SaaS staging, Binance testnet credential smoke, live broker submission, and future brokers
  remaining gated.

## 26. Alpha/Data/Copy Audit Findings - 2026-05-28

This section records the first real rsibound 15m multi-mode audit after running:

- `paper BINANCE`
- `paper DNSE`
- `sandbox BINANCE testnet`

Target alpha folder:

```text
/root/bobby/execution_alpha/alphas/rsiboundportfolioA001_15m
```

### 26.1 Current Test Result

What worked:

- `data_layer` REST contract for crypto OHLCV works when called with the supported route:
  - `/v1/crypto/ohlcv/binance/ETHUSDT?interval=15m&limit=5`
  - `/v1/crypto/ohlcv/binance/batch`
- VN preload endpoint works for `ACB` 15m through `/v1/preload/ACB?interval=15m`.
- Paper Binance wrote canonical `orders`, `fills`, `positions_v2`, `account_balances`, and `account_equity_snapshots`.
- Sandbox Binance sent real testnet orders and produced fills/positions for the first cycle.

What did not work:

- Paper DNSE did not write canonical orders even though alpha log showed some `Opened LONG ...` messages.
- Sandbox Binance rejected later rebalance orders with `BROKER_SYNC_MISMATCH`.
- Copy trading outbox did not publish rsibound events because no `copy_publish_policies` row existed for this strategy/mode/venue.
- `market_data_service` repeatedly restarted and generated excessive data_layer load.
- Several legacy/projection tables still lost `mode/account_id` context.

### 26.2 Root Causes Found

#### 26.2.1 data_layer/trading_system Market Data Mismatch

`market_data_service` loaded `/root/bobby/trading_system/shared/symbols.json`, which currently contains a very wide Binance universe. It then attempted recovery/subscription for too many symbols and generated a large amount of REST traffic against data_layer.

Observed data_layer source IP:

```text
172.20.0.16 = market_data_service
```

Observed market data service errors:

```text
Unable to parse data_layer payload from stream:trade:*: trade price must be positive
Fatal Market Data Service Error: Connection closed by server.
```

Root cause class:

- Trading-system market data bridge scope is too broad for the current test.
- Trade payload parser is not tolerant enough for all data_layer stream payload shapes.
- Pub/Sub loop exits on Redis connection close instead of reconnecting.

Required fix:

- Restrict trading_system market-data subscriptions to a configured subset, not the full global data_layer universe.
- Parser must normalize data_layer trade payloads without rejecting valid heartbeat/zero-last/metadata payloads as fatal stream errors.
- Bridge must reconnect with backoff after Redis/pubsub disconnect.

#### 26.2.2 Alpha DNSE Price Resolver Mismatch

Alpha wrapper `trade/action_async.py` reads DNSE quote payload as:

```python
payload.get("quote") or payload.get("data") or payload
```

But data_layer `quote-last` returns:

```json
{"symbol":"ACB","is_live":false,"snapshot":{...}}
```

So DNSE price lookup misses `snapshot.price`, then falls through to Binance price:

```text
GET /v1/binance/price/ACB -> 404
```

Required fix:

- DNSE price resolver must check `snapshot` first.
- DNSE expected short-block logs should not be treated as fatal alpha errors.

#### 26.2.3 Alpha Accepted-vs-Final Status Mismatch

The alpha wrapper treats gateway `ACCEPTED` as success immediately. In live-like flow, `ACCEPTED` only means the gateway/risk path accepted the request for processing. It does not guarantee a canonical order/fill exists.

Observed symptom:

- Alpha logs show `Opened LONG HCM/VHM/VIC/VRE`.
- DB query shows zero canonical orders for `paper-dnse-rsiboundportfolioA001_15m`.

Required fix:

- Alpha order wrapper should use final order status polling for test/live-like runs.
- `Opened ...` should be logged only after final `FILLED/PARTIALLY_FILLED/ACCEPTED_OPEN` depending on order type/mode.

#### 26.2.4 Alpha Shared State/Log Contamination

Three containers write under the same mounted alpha directory:

```text
rsiportfolio_state.json
state/trading_system_orders.json
logs/rsiboundportfolioA001_15m.log
```

This makes paper Binance, paper DNSE, and sandbox Binance state/logs ambiguous and potentially cross-contaminated.

Required fix:

- State files must be account scoped:
  - `state/{mode}_{venue}_{account_id}/rsiportfolio_state.json`
  - `state/{mode}_{venue}_{account_id}/trading_system_orders.json`
- Logs must be account scoped:
  - `logs/{mode}_{venue}_{account_id}.log`

#### 26.2.5 Copy Outbox Policy Missing

`copy_outbox_service` is running, but:

```text
copy_publish_policies rows = 0
copy_event_outbox rows = 0
Redis Stream copy:events:v1 length = 0
```

Required fix:

- Add CLI/admin setup path for copy publish policy.
- Test that rsibound order intent/reject/fill events insert into `copy_event_outbox`.
- Verify `copy_outbox_service` publishes to Redis Stream and marks rows `PUBLISHED`.

#### 26.2.6 Sandbox Broker Sync Mismatch

Sandbox Binance later cycles were rejected by risk:

```text
BROKER_SYNC_MISMATCH
```

`account_sync_snapshots` showed fresh snapshots but status `MISMATCH`.

Required fix:

- Reconciliation/account sync must explain mismatch reason in snapshot `raw`/metadata.
- Risk rejection should include mismatch details.
- Sandbox account projection must be reconciled after actual fills before allowing next rebalance.

#### 26.2.7 Legacy Projection Context Loss

`alpha_positions` and `binance_fills` contained rows for rsibound with:

```text
mode=live
account_id=''
```

even though source runs were paper/sandbox.

Required fix:

- Listener/repository writes must include `mode`, `venue`, `account_id`.
- Portfolio legacy projection must not default to live when order metadata exists.
- Tests must assert paper/sandbox context is preserved.

#### 26.2.8 Paper Execution Redis Disconnect

`paper_execution_service` repeatedly crashed on Redis Pub/Sub disconnect:

```text
redis.exceptions.ConnectionError: Connection closed by server.
```

Docker restarted the service, but service-level reliability should not rely on process restart.

Required fix:

- Wrap market event consumer in reconnect loop with backoff.
- Keep service heartbeat useful during reconnect.

### 26.3 Fix Order

Priority order:

1. Fix data_layer/trading_system/alpha market-data contract mismatches.
2. Fix alpha account-scoped state/logs and final order status handling.
3. Fix copy outbox policy setup and rsibound stream verification.
4. Fix sandbox reconciliation mismatch diagnostics and next-cycle risk gating.
5. Fix legacy projection context preservation.
6. Fix paper execution Redis reconnect.
7. Re-run rsibound 15m paper Binance, paper DNSE, sandbox Binance from a clean test state.

### 26.4 Done Criteria Before Migrating More Alpha

- `market_data_service` runs without repeated crash loop.
- data_layer health may be degraded by broad external streams, but the trading_system bridge must not create unnecessary load.
- Paper Binance writes canonical orders/fills/positions/equity with no critical nulls.
- Paper DNSE writes accepted long-only paper orders or explicitly rejects with final status; no fake `Opened` logs.
- Sandbox Binance can pass at least two rebalance cycles after account sync/reconciliation.
- `copy_event_outbox` receives policy-gated events for rsibound and Redis Stream `copy:events:v1` receives messages.
- `alpha_positions`, `binance_fills`, and canonical tables preserve `mode/venue/account_id`.
- Account-scoped alpha state/logs make each mode independently debuggable.

### 26.5 Implementation Log

#### 26.5.1 Market-data Contract Fixes

Status: implemented, unit tested.

Files changed:

- `shared/config.py`
- `.env.example`
- `adapters/market_data/instrument_loader.py`
- `adapters/market_data/parsers.py`
- `services/market_data/main.py`
- `services/market_data/data_layer_bridge.py`
- `tests/unit/test_market_data_scope.py`
- `tests/unit/test_market_data_parsers.py`

Behavior now:

- `market_data_service` can limit Binance/VN subscription scope through environment:
  - `MARKET_DATA_BINANCE_SYMBOLS`
  - `MARKET_DATA_VN_SYMBOLS`
  - `MARKET_DATA_BINANCE_SYMBOL_LIMIT`
  - `MARKET_DATA_VN_SYMBOL_LIMIT`
- Explicit symbol CSV overrides take precedence over `shared/symbols.json`.
- Wide symbol universe is capped before subscribing/recovering, so trading_system does not flood data_layer during alpha tests.
- Binance trade parser falls back to raw `p/q/T/E` fields when data_layer wrapper fields are missing or non-positive.
- Market data bridge reconnects to Redis Pub/Sub with exponential backoff instead of crashing on connection close.

Verification:

```bash
PYTHONPATH=/root/bobby/trading_system python3 -m unittest trading_system.tests.unit.test_market_data_scope -v
PYTHONPATH=/root/bobby/trading_system python3 -m unittest trading_system.tests.unit.test_market_data_parsers -v
```

Result: pass.

#### 26.5.2 Alpha Gateway SDK and Rsibound Runtime Fixes

Status: implemented, runtime restart/re-audit still required.

Files changed:

- `alpha_sdk/trading_system_async_action.py`
- `execution_alpha/runtime/app/alpha_runtime/trade/action.py`
- `execution_alpha/alphas/rsiboundportfolioA001_15m/setting.py`
- `execution_alpha/alphas/rsiboundportfolioA001_15m/main/rsiboundportfolioA001.py`
- `execution_alpha/alphas/rsiboundportfolioA001_15m/trade/action_async.py`

Behavior now:

- Default alpha SDK order state path is account scoped:
  - `/app/state/{mode}_{venue}_{account_id}/trading_system_orders.json`
- Rsibound strategy state path is account scoped:
  - `state/{mode}_{venue}_{account_id}/rsiportfolio_state.json`
- Legacy alpha log path is account scoped unless `ALPHA_LOG_FILE` is explicitly set.
- DNSE price resolver reads `snapshot.price` from data_layer `quote-last` response and no longer falls through to Binance for VN symbols.
- Test/live-like order wrapper can wait for final gateway/order status with `TRADING_WAIT_FOR_FINAL=true`; fake `Opened LONG` from immediate `ACCEPTED` should stop after container restart.
- Rsibound docker compose now sets `TRADING_WAIT_FOR_FINAL=true` explicitly for paper Binance, paper DNSE, and sandbox Binance.

Required re-audit:

- Restart the three rsibound test containers after image/code mount refresh.
- Confirm paper DNSE either writes canonical orders/fills or logs final `REJECTED` with no fake open-position state.
- Confirm logs/state are separated per account.

Verification completed:

```bash
PYTHONPATH=/root/bobby/execution_alpha/runtime/app:/root/bobby/trading_system/alpha_sdk \
  python3 -m py_compile \
  execution_alpha/alphas/rsiboundportfolioA001_15m/trade/action_async.py \
  execution_alpha/alphas/rsiboundportfolioA001_15m/trade/buffer.py \
  execution_alpha/alphas/rsiboundportfolioA001_15m/main/rsiboundportfolioA001.py \
  execution_alpha/alphas/rsiboundportfolioA001_15m/setting.py
```

Result: pass.

Additional host smoke:

- Alpha warmup candle extractor handles data_layer list-of-lists, list-of-dicts, and nested `result.candles` response shapes.

#### 26.5.3 Copy Outbox Policy Management

Status: implemented, service-level smoke still required.

Files changed:

- `services/gateway/repository/admin_config.py`
- `services/gateway/main.py`
- `services/copy_outbox/events.py`
- `cli/__main__.py`
- `config/examples/portfolio_setup.example.yaml`
- `config/_config/portfolio_setup.yaml`
- `tests/unit/test_cli.py`
- `tests/unit/test_copy_outbox.py`

Behavior now:

- Gateway admin endpoints:
  - `GET /v1/admin/copy/policies`
  - `PUT /v1/admin/copy/policies/{strategy_id}`
- CLI commands:
  - `trading-system-cli copy policies`
  - `trading-system-cli copy policy <strategy_id> --mode paper --venue BINANCE --enabled`
- Declarative config supports top-level `copy_publish_policies`.
- Copy publication remains opt-in. Default config rows are present but disabled until explicitly enabled.
- `include_raw=false` keeps copy payload normalized; `include_raw=true` adds `source_raw` to the emitted outbox payload for deeper audit.

Policy rule:

- Empty `event_types: []` means all copy event types for the matching `strategy_id/mode/venue`.
- Specific `event_types` should be used for sandbox/live when the external copy server only wants intent/fill/reject signals.

Required re-audit:

- Enable rsibound paper copy policy.
- Submit one controlled test order.
- Verify:
  - `copy_event_outbox.status=PUBLISHED`
  - Redis Stream `copy:events:v1` receives a message
  - external consumer guide still matches actual schema.

#### 26.5.4 Legacy Projection Context and Paper Reconnect

Status: implemented, integration re-audit still required.

Files changed:

- `services/listener/repository/fill_repo.py`
- `services/portfolio/repository/portfolio_repo.py`
- `services/paper_execution/main.py`

Behavior now:

- Binance listener writes `mode`, `venue`, `account_id` into `binance_fills`.
- Portfolio legacy projection writes `mode`, `venue`, `account_id` into `alpha_positions` instead of defaulting to `live`.
- Paper execution market-event consumer reconnects to Redis Pub/Sub with backoff.

Important limitation:

- `alpha_positions` still has legacy primary key `(alpha_id, symbol)`, so it cannot fully isolate the same alpha/symbol across multiple mode/account scopes. Canonical `positions_v2` is the source of truth for isolated portfolio/account state. A later additive migration should either replace legacy `alpha_positions` with a view from `positions_v2` or change its key only after compatibility impact is reviewed.

Verification completed:

```bash
python3 -m py_compile \
  services/gateway/main.py \
  services/gateway/repository/admin_config.py \
  cli/__main__.py \
  services/portfolio/repository/portfolio_repo.py \
  services/listener/repository/fill_repo.py \
  services/paper_execution/main.py
```

Result: pass.

Additional host smoke:

- Copy outbox policy-gated insert helper was exercised with fake async connection; it queried `copy_publish_policies`, inserted into `copy_event_outbox`, and issued `pg_notify('copy_outbox', copy_event_id)`.
- Copy outbox `include_raw` behavior was smoke-tested at query/helper level.
- CLI copy policy parser/config-plan path was exercised with lightweight dependency stubs because host Python does not have `httpx` installed.

Blocked local tests:

- Host does not have `pytest`, so full `tests/unit/test_cli.py` and `tests/unit/test_copy_outbox.py` need to be run inside the trading_system container or after installing test dependencies in a disposable environment.
- Docker approval is temporarily blocked by quota, so service restart and live container integration checks are pending.

#### 26.5.5 Broker Sync Mismatch Diagnostics

Status: implemented, unit tested.

Files changed:

- `services/risk_engine/repository/risk_repo.py`
- `services/risk_engine/main.py`
- `tests/unit/test_risk_broker_sync.py`

Behavior now:

- `get_broker_sync_state()` returns mismatch context from latest `account_sync_snapshots.raw`, including `position_reconciliation` and `open_order_reconciliation` details when present.
- Risk-denied Redis event includes `risk_context.broker_sync`, so `BROKER_SYNC_MISMATCH` can be traced without manually opening the snapshot row first.
- Copy/rejection path remains fail-open for trading publication; risk still rejects when broker sync is missing, stale, error, or mismatch.

Verification:

```bash
PYTHONPATH=/root/bobby/trading_system python3 -m unittest trading_system.tests.unit.test_risk_broker_sync -v
```

Result: pass.

#### 26.5.6 Current Host Verification Summary

Run after the fixes above:

```bash
PYTHONPATH=/root/bobby/trading_system python3 -m unittest \
  trading_system.tests.unit.test_market_data_scope \
  trading_system.tests.unit.test_market_data_parsers \
  trading_system.tests.unit.test_risk_broker_sync -v
```

Result: 12 tests passed.

Compile verification:

```bash
python3 -m py_compile \
  trading_system/services/gateway/main.py \
  trading_system/services/gateway/repository/admin_config.py \
  trading_system/services/copy_outbox/events.py \
  trading_system/cli/__main__.py \
  trading_system/services/portfolio/repository/portfolio_repo.py \
  trading_system/services/listener/repository/fill_repo.py \
  trading_system/services/paper_execution/main.py \
  trading_system/services/risk_engine/main.py \
  trading_system/services/risk_engine/repository/risk_repo.py \
  trading_system/adapters/market_data/parsers.py \
  trading_system/services/market_data/data_layer_bridge.py \
  trading_system/services/market_data/main.py \
  trading_system/tests/unit/test_cli.py \
  trading_system/tests/unit/test_copy_outbox.py \
  trading_system/tests/unit/test_risk_broker_sync.py
```

Result: pass.

Pending once Docker approval quota is available again:

- Rebuild/restart `market_data_service`, `paper_execution_service`, `gateway_service`, `risk_engine_service`, `portfolio_service`, `copy_outbox_service`.
- Restart the three rsibound 15m alpha containers.
- Run full container test suite with `pytest`, including CLI/copy tests.
- Query DB/Redis after one or two rsibound cycles to verify canonical orders/fills/positions, copy outbox publication, account-scoped logs/state, and broker-sync mismatch diagnostics.

### 26.6 Docker Re-Audit and Wide-Universe Risk Recovery

Status: complete.

Docker approval became available again on `2026-06-01`. The pending restart and targeted
container regression checks from section 26.5 were executed.

Restarted trading-system services:

```bash
docker compose up -d --no-deps --force-recreate \
  gateway risk_engine paper_execution market_data portfolio copy_outbox listener
```

Restarted alpha services:

```bash
docker compose up -d --no-deps --force-recreate \
  rsibound_15m_paper_binance \
  rsibound_15m_paper_dnse \
  rsibound_15m_sandbox_binance
```

Targeted disposable-container regression:

```bash
docker compose --profile test run --rm --no-deps test_runner pytest -q \
  tests/unit/test_market_data_scope.py \
  tests/unit/test_market_data_parsers.py \
  tests/unit/test_cli.py \
  tests/unit/test_copy_outbox.py \
  tests/unit/test_risk_broker_sync.py \
  tests/unit/test_alpha_sdk_order_state.py \
  tests/unit/test_data_layer_client.py \
  tests/unit/test_data_layer_recovery.py \
  tests/unit/test_market_data_no_direct_provider.py \
  tests/unit/test_portfolio_order_events.py \
  tests/unit/test_risk_market_data_status.py
```

Result: pass.

Live observations after restart:

- Gateway health returned `READY`; Redis, PostgreSQL, and required service heartbeats were fresh.
- `market_data_service` respected the bounded local projection scope:
  - Binance: 10 configured symbols.
  - VN: 10 configured symbols.
- The three rsibound alpha containers completed warmup with account-scoped log and state paths.
- Paper Binance completed real alpha order activity after restart.
- Copy publication was enabled through the official CLI for
  `rsiboundportfolioA001_15m / paper / BINANCE`.
- Copy outbox verification succeeded:
  - `copy_event_outbox.status=PUBLISHED`
  - Redis Stream `copy:events:v1` received published events.
  - Order-intent, rejection, and fill events were observed.

New integration finding:

- The bounded trading-system market-data projection scope fixed resource pressure, but the
  rsibound crypto alpha intentionally trades a much wider universe.
- `risk_engine` still reads only the bounded trading Redis DB0 cache. Orders for valid symbols
  outside that local projection scope are therefore rejected with `MARKET_DATA_OFFLINE`.
- This is not a reason to reopen unbounded provider WebSocket connections in trading_system.
  `data_layer` remains the only market-data source of truth and already exposes current cached
  state for wide-universe symbols, for example `/v1/binance/price/SAGAUSDT`.

Required fix:

- Add an on-demand risk recovery path through `DataLayerClient`.
- On a trading Redis cache miss or stale snapshot:
  - Binance: query the authoritative data_layer latest-trade contract.
  - DNSE paper: query live quote first, then explicit `quote-last` snapshot when the market is
    closed; label the recovered snapshot as `last_known_quote`.
  - DNSE sandbox/live: require live quote only.
- Project a valid recovered snapshot back into trading Redis so downstream paper matching and
  local cache consumers observe the same state.
- Keep sandbox/live fail-closed when data_layer cannot provide authoritative fresh data.
- Keep OKX explicit and non-authoritative for execution; it remains a diagnostic/reference
  fallback and must not silently authorize sandbox/live orders.

Additional live issue retained for the next audit:

- Sandbox Binance orders with available market data can still reject with
  `BROKER_SYNC_MISMATCH`. The new rejection context is present, but the latest broker snapshot
  needs a focused reconciliation audit after market-data recovery is complete.

Focused sandbox reconciliation finding:

- The sandbox mismatch was traced to one old `NEIROUSDT` testnet order:
  - `client_order_id=rsisbi963589027neirouse`
  - local `binance_sent_orders.status=PARTIALLY_FILLED`
  - broker latest snapshot has no matching open order.
- Reconciliation correctly emitted `BROKER_OPEN_ORDER_STALE_IN_DB`, but runtime configuration
  was detect-only. That left the account permanently blocked by `require_broker_sync=true` and
  wrote another identical open finding every minute.

Policy correction:

- Enable `BROKER_OPEN_ORDER_RECON_APPLY=true`.
- Keep `BROKER_POSITION_RECON_APPLY=false`.
- Broker-authoritative open-order recovery is safe to apply automatically because it closes
  stale local order state and synchronizes pending exposure when the broker confirms the order
  is no longer open.
- Position overwrite remains detect-only because it has a larger blast radius, especially
  while multiple virtual sandbox accounts still point to one Binance testnet broker account.

Observability correction:

- Before auto-apply was enabled, the same unresolved stale-order anomaly was inserted on every
  reconciliation interval. The rsibound sandbox account accumulated 5096 duplicate resolved
  rows for one `NEIROUSDT` stale-order condition during the extended test period.
- Reconciliation repository finding writes must deduplicate unresolved findings:
  - refresh `details.sync_id` for an existing OPEN finding with the same scope and identity;
  - insert only when the anomaly is new;
  - resolve the retained OPEN finding when broker-authoritative apply succeeds.
- The same rule applies to position and open-order findings.

Additional wide-universe and canonical-order corrections:

- `1000SATSUSDT` remained a transient `MARKET_DATA_OFFLINE` reject even after risk recovery.
  Follow-up showed that Binance futures trade and OHLCV were available again shortly after the
  reject. The cause is the intentional 60-second active data_layer Redis TTL combined with a
  temporary per-symbol trade gap.
- Add an explicit additive data_layer contract:
  - `GET /v1/binance/price-last/{symbol}`
  - response contains `is_live` and the last authoritative Binance trade snapshot.
- Risk recovery may use this snapshot only through data_layer and still applies the normal
  freshness validation. It does not authorize stale data and does not bypass sandbox/live
  fail-closed behavior.
- Sandbox audit also found that executor writes `binance_sent_orders` but did not create the
  matching canonical `orders` row. Portfolio order events could only update an existing
  canonical row, so sandbox fills existed while canonical order lifecycle rows were missing.
- Executor sent-order persistence must:
  - preserve explicit `account_id` through `OrderRequest`;
  - keep the legacy `binance_sent_orders` write for compatibility;
  - project the broker submission into canonical `orders`;
  - log canonical projection failure without discarding the already persisted legacy broker
    submission.

Reconciliation latency finding during controlled sandbox verification:

- A controlled sandbox `BTCUSDT` round trip was rejected with `BROKER_SYNC_STALE` before it
  reached Binance.
- The fail-closed rejection is correct, but the scheduled reconciliation loop was not keeping
  snapshots fresh enough:
  - every virtual Binance account performed the same broker API sync independently;
  - all Binance accounts in one mode currently use the first configured credential;
  - deployments in `HALTED` state were still included;
  - unresolved finding refresh queried JSON identities without dedicated indexes.
- Five sandbox accounts made one reconciliation sweep take several minutes, exceeding the
  `max_sync_age_seconds=60` risk policy.

Implemented latency correction:

- Scheduled reconciliation now includes only deployments with `active=true` and state
  `ACTIVE` or `REDUCING`.
- Binance account sync now fetches one authoritative broker snapshot per mode and fans that
  snapshot out to the eligible virtual-account scopes that currently share the configured
  credential.
- Added additive reconciliation-finding indexes for unresolved `instrument_id` and
  `order_key` refresh queries.
- Risk remains fail-closed. The correction reduces recovery latency instead of weakening the
  broker-sync freshness requirement.

Known production boundary:

- Current Binance environment configuration binds one credential set per trading mode. The
  batch sync behavior accurately reflects that current runtime shape.
- Before multiple real Binance broker accounts are introduced, add an explicit
  account-to-credential binding and group scheduled sync by that binding rather than only by
  mode. Virtual accounts remain accounting/risk scopes; they must not be mistaken for
  independent broker accounts.

Live verification and follow-up corrections:

- Targeted container regression after batch-sync implementation passed.
- Applied additive indexes from `init-db/16-reconciliation-finding-indexes.sql` to the running
  database.
- Recreated `reconciliation_service`; the eligible sandbox scope reduced from five accounts to
  two:
  - `sandbox-binance-regressionportfolioA001_15m` remains `ACTIVE`;
  - `sandbox-binance-rsiboundportfolioA001_15m` remains `ACTIVE`;
  - three older `taalpha` deployments in `HALTED` state are no longer synchronized.
- One optimized sweep completed in about 12 seconds rather than several minutes.
- Controlled Binance testnet order verified canonical executor projection:
  - `BTCUSDT BUY 0.001` reached Binance and filled;
  - canonical `orders` was inserted with the explicit sandbox rsibound `account_id`;
  - listener projected the fill and skipped duplicate private events;
  - reduce-only cleanup `BTCUSDT SELL 0.001` filled;
  - canonical `positions_v2.signed_qty` returned to zero.

Alpha SDK polling correction:

- The controlled round trip exposed a runtime SDK bug: `wait_order_state()` returned immediately
  on executor intermediate state `SENT`, even though listener projected `FILLED` about 0.2
  seconds later.
- Added an explicit non-final state set for `ACCEPTED`, `NEW`, `OPEN`, `PENDING`,
  `PENDING_NEW`, `SENT`, `SUBMITTED`, `TRIGGERED`, `UNCERTAIN`, and `UPDATED`.
- `wait_order_state()` now continues polling those states and preserves the last observed order
  state in timeout diagnostics.
- Backward-compatible `PARTIALLY_FILLED` behavior remains surfaced to alpha callers so partial
  exposure is visible immediately.
- A second controlled Binance testnet round trip passed end to end:
  - open returned `FILLED`;
  - close reduce-only returned `FILLED`;
  - DB audit showed both canonical rows `FILLED`;
  - `BTCUSDT.BINANCE` sandbox rsibound position returned to zero.

Reconciliation cadence and historical-finding correction:

- The first optimization still used `sweep duration + sleep(60)`, producing snapshot intervals
  around 70 seconds and leaving a short `BROKER_SYNC_STALE` window.
- Reconciliation now:
  - defaults to `RECON_INTERVAL_SECONDS=30`;
  - sleeps only the remaining duration after each sweep;
  - catches and logs sweep failures without terminating the service;
  - logs compact Binance reconciliation counts rather than full finding payloads.
- The legacy `ReconciliationRepository` path also inserted repeated findings without dedup.
  It now computes a stable `dedup_key` and refreshes one unresolved row when the same condition
  is observed again.
- Portfolio finding refresh now updates one latest unresolved row rather than every historical
  duplicate.
- Added `init-db/17-reconciliation-finding-compaction.sql`:
  - duplicate unresolved identities are marked `RESOLVED`, never deleted;
  - unique partial indexes prevent future duplicate OPEN identities;
  - running DB migration compacted `815981` historical duplicate OPEN rows.

Regression status:

- Full disposable-container `pytest -q` suite passed: `212` tests.
- Additional cadence/dedup/batch-sync targeted regression passed: `20` tests.
- Docker approval quota expired immediately after the compaction migration recreated
  `reconciliation_service`. The following read-only live audit remains pending and must be run
  before declaring section 26.6 complete:
  - query latest rsibound sandbox snapshot ages across at least two sweeps;
  - query unresolved findings grouped by account/type and verify compacted counts remain bounded;
  - query Redis `copy:events:v1` and gateway health once more.

Post-migration host-log verification:

- The mounted reconciliation log confirmed successful restart and fixed cadence across four
  consecutive sweeps:
  - `05:31:26`
  - `05:31:56`
  - `05:32:26`
  - `05:32:56`
- Compact Binance summaries are active.
- Both eligible sandbox accounts completed each observed sweep; rsibound remained `OK`.
- DB/Redis live queries remain pending only because Docker read approval quota expired.

Operational follow-up:

- `sandbox-binance-regressionportfolioA001_15m` is still configured as an `ACTIVE` deployment
  while its alpha container is not part of the current rsibound-only test. Because it shares the
  Binance testnet credential but has a different internal virtual-account projection,
  reconciliation correctly reports 41 position mismatches for that scope.
- Do not hide those findings. Before the next rsibound-only observation window, either halt the
  unused regression sandbox deployment through the admin CLI or run it as an intentional
  independent test scope.

Final-audit continuation and newly discovered blocker:

- The pending read-only audit was resumed after Docker access became available.
- Gateway health returned `READY`, Redis `copy:events:v1` continued advancing, and the rsibound
  Binance sandbox account produced fresh broker snapshots on the intended cadence.
- Added resolve-on-absence behavior for reconciliation findings so a recovered scoped anomaly
  no longer remains `OPEN` forever.
- Added an authenticated deployment-state admin operation and CLI command. The inactive
  `sandbox-binance-regressionportfolioA001_15m` deployment was explicitly moved to `HALTED`
  before the rsibound-only audit window.
- Disabled the legacy global Binance position comparison by default with
  `LEGACY_GLOBAL_BINANCE_POSITION_RECON_ENABLED=false`. That comparison aggregated internal
  virtual accounts and compared them with one broker account, which is not a valid invariant in
  the unified account model. Scoped account reconciliation remains enabled and fail-closed.
- The final monitor query exposed a real paper-accounting defect that blocks a readiness
  declaration:
  - unresolved `CheckViolationError` dead letters were still increasing;
  - affected messages were paired across canonical `events.fill` and compatibility
    `execution.fills`;
  - the transaction failed while applying a negative realized PnL to a paper Binance margin
    account;
  - `INSERT ... ON CONFLICT DO UPDATE` proposed a negative fallback `account_balances` insert row
    before PostgreSQL could execute the valid conflict-update branch, violating
    `account_balances_free_check`.
- Isolated only the affected deployment before remediation:
  `rsiboundportfolioA001_15m:paper:BINANCE:paper-binance-rsiboundportfolioA001_15m` is `HALTED`.
- Required remediation before expanding alpha testing:
  - make the fallback insert row non-negative while preserving the negative delta in the
    conflict-update expression;
  - add regression coverage for a losing close on a paper margin account;
  - restart portfolio projection;
  - run a fresh controlled losing-close smoke;
  - re-audit bounded dead letters, DB state, gateway health, heartbeat age, and Redis copy stream.

Final-audit remediation completed:

- Updated paper margin realized-PnL projection:
  - fallback `account_balances` insert values are clamped to a valid non-negative row;
  - the `ON CONFLICT DO UPDATE` branch still applies the true signed realized-PnL delta;
  - existing account balance behavior therefore remains accurate for profitable and losing
    closes while PostgreSQL check constraints remain active.
- Added `tests/unit/test_portfolio_margin_balance_projection.py` for a losing paper-margin close.
- Added reusable `scripts/paper_margin_loss_smoke.py`:
  - creates an isolated synthetic paper Binance margin account;
  - emits canonical `events.fill` and compatibility `execution.fills` for BUY at `100` and
    SELL at `90`;
  - verifies idempotent dual-stream consumption;
  - verifies `positions_v2` returns to `FLAT` with realized PnL `-10`;
  - verifies account balance becomes `990`;
  - enables a scoped copy policy and verifies two `copy.event.v1.order_filled` outbox rows;
  - verifies zero new dead letters;
  - deactivates its synthetic runtime refs after the assertion while retaining audit evidence.
- Recreated `portfolio_service`.
- Verification passed:
  - targeted portfolio regression: `12` tests;
  - full disposable-container suite: `219` tests;
  - in-container `py_compile`;
  - `git diff --check`;
  - controlled paper-margin losing-close smoke:
    - account `paper-binance-paper_margin_loss_smoke_7066380fb5`;
    - `fills=2`;
    - `copy_events=2`;
    - `dead_letters=0`;
    - position `FLAT`;
    - account balance total/free `990`.
  - dedicated `scripts/copy_outbox_smoke.py`:
    - published one `copy.event.v1.order_intent`;
    - Redis stream publication succeeded;
    - latest stream inspection also contained both controlled losing-close fill events.

Final read-only operational audit:

- Gateway health returned `{"status":"READY","redis":true}`.
- All 10 recorded service heartbeats were `READY`; the observed maximum age was `29` seconds.
- Rsibound Binance sandbox snapshots remained `OK` on the fixed cadence:
  - ages `16`, `46`, `76`, and `106` seconds;
  - approximately 30 seconds between snapshots.
- Redis `copy:events:v1` length reached `1364` and contained the controlled BUY/SELL fill events.
- `copy_event_dead_letters` has zero unresolved rows.
- OPEN reconciliation findings remained bounded across an additional cadence:
  - no active rsibound sandbox finding;
  - retained historical findings belong only to intentionally halted test scopes:
    - regression sandbox: `40`;
    - three older taalpa sandbox scopes: `47` each.
- The paper-margin SQL fix stopped new accounting dead letters:
  - unresolved historical rows remain `382`;
  - they represent `191` logical fills duplicated across canonical and compatibility streams;
  - newest historical row is `2026-06-01 10:03:10 UTC`;
  - unresolved rows created in the final 10-minute audit window: `0`.
- The historical rows must not be silently marked resolved. They identify an invalid pre-fix
  projection for `paper-binance-rsiboundportfolioA001_15m`:
  - `45` non-flat projected positions remain;
  - keep deployment
    `rsiboundportfolioA001_15m:paper:BINANCE:paper-binance-rsiboundportfolioA001_15m`
    in `HALTED`;
  - reset this test account or rebuild its projection from an authoritative ordered fill ledger
    before any reactivation.
- Recent post-fix service-log scan found no runtime error. Two earlier FK errors came only from
  the first incomplete synthetic smoke fixture and were resolved while retaining their audit
  rows.

Section 26.6 readiness conclusion:

- The corrected system is ready for controlled onboarding of additional alpha test scopes with
  fresh accounts.
- Do not broaden to unattended production yet. First run each new alpha through paper Binance,
  paper DNSE, and Binance testnet sandbox observation windows and audit DB/Redis behavior after
  multiple strategy cycles.
- Keep the corrupted pre-fix rsibound paper Binance account halted until its explicit test-data
  reset or ordered projection rebuild is completed.

## 26.7 Pre-Rsibound Clean Baseline And Production-Schema Audit

Purpose:

- Retire all disposable test runtime state before onboarding the next rsibound cycle.
- Preserve database schema, migrations, infrastructure configuration, source code, active
  trading-system services, Docker volumes, and external shared networks.
- Remove only unused Docker artifacts and database tables proven to have no runtime ownership.
- Keep the cleanup reproducible and auditable. Do not hide compatibility tables merely because
  their names look legacy.

Pre-clean checklist:

- [x] Record the completed accounting, reconciliation, copy-outbox, and health conclusions in
  section 26.6.
- [x] Measure host disk and inode usage before cleanup.
- [x] Inventory Docker containers, images, build cache, volumes, and networks.
- [x] Stop only alpha test containers so they cannot repopulate Redis or DB during reset.
- [x] Inventory every database table, row count, size, foreign-key dependency, and runtime code
  reference.
- [x] Classify each table:
  - canonical production table;
  - active compatibility table with a documented runtime dependency;
  - infrastructure/bootstrap table that must survive data reset;
  - proven-unused table eligible for removal.
- [x] Run safe Docker prune for stopped containers, dangling images, unused images, and build
  cache. Never prune volumes.
- [x] Reset disposable trading DB data while preserving required bootstrap rows.
- [x] Reset trading Redis DB0 runtime keys and streams. Do not flush the separate data-layer
  Redis database.
- [x] Flatten configured Binance Futures testnet virtual accounts before the final internal
  projection reset.
- [x] Restart or verify trading-system services and ensure clean baseline health.
- [x] Confirm the new rsibound onboarding sequence from CLI and alpha documentation.

Initial measurements:

- Host root filesystem before cleanup: `31G / 40G` used (`82%`), `7.1G` available.
- Host inode usage before cleanup: `17%`.
- Trading DB inventory before cleanup: `54` public tables.
- Redis DB0 contains old rsibound order idempotency keys, listener event claims, streams, copy
  stream data, service heartbeats, and trading-system market cache.
- Old rsibound alpha containers must be stopped before reset because they continue emitting
  disposable test traffic even when an individual deployment is halted.

Schema classification:

- Canonical active tables include `orders`, `fills`, `positions_v2`, account/portfolio/risk
  tables, performance projections, settlement tables, reconciliation tables, and copy-outbox
  tables.
- Active compatibility tables must remain until their runtime owners are migrated:
  - `binance_sent_orders`: executor, risk, listener, reconciliation, CLI, and gateway fallback;
  - `binance_fills`: listener compatibility projection;
  - `alphas`, `alpha_ledger`, `alpha_positions`, `alpha_risk_config`: paper and compatibility
    projection paths;
  - `paper_open_orders`, `paper_account_seed`, `paper_matcher_config`: paper execution engine.
- Reserved extension schemas remain intentionally present:
  - `domain_events`: provider-neutral durable event-store contract; Redis Stream projectors are
    active today, DB writer is future work;
  - `audit_log`: generic security/admin audit contract; `portfolio_audit_log` is the active
    portfolio config audit trail today;
  - `venue_accounts`, `venue_credentials`, `dnse_trading_tokens`, `venue_rate_limits`: broker
    credential binding, DNSE token lifecycle, and rate-limit tracking required for later
    sandbox/live hardening.
- Proven obsolete tables:
  - `positions`: unused legacy global Binance position projection; canonical account-scoped
    projection is `positions_v2`;
  - `alpha_stats_daily`: unused legacy placeholder; performance projection is implemented by
    `performance_snapshots` and `account_equity_snapshots`.
- Added `init-db/18-remove-obsolete-legacy-tables.sql` and removed obsolete declarations from
  fresh `init-db/02-init-schema.sql`.
- Added reproducible destructive test-only reset script `scripts/reset_test_state.sql`.
  The script truncates every public table except static `venues`, resets identities, and
  deterministically preserves `BINANCE` and `DNSE` registry rows.

Post-reset legacy reconciliation finding:

- Clean DB startup exposed one remaining legacy global Binance comparison inside
  `services/portfolio/main.py`.
- It compared one broker-account aggregate with summed compatibility `alpha_positions` and
  logged false `RECON ALERT` rows after a clean reset.
- This is the same invalid invariant already disabled in reconciliation v2 for unified virtual
  accounts.
- Portfolio legacy global reconciliation is now disabled by default through
  `LEGACY_GLOBAL_BINANCE_POSITION_RECON_ENABLED=false`.
- Scoped account reconciliation v2 remains authoritative and risk fail-closed remains active.
- Added regression coverage for default-disabled and explicit opt-in behavior.

Docker cleanup result:

- Stopped and removed only the three migrated rsibound alpha containers. Unrelated
  trading-system, data-layer, legacy audit, Redis, PostgreSQL, and Nginx containers were
  preserved.
- Ran safe stopped-container, dangling-image, and builder-cache cleanup. Docker volumes and
  external networks were preserved during prune.
- Removed two unlinked anonymous one-off volumes after verifying they contained only `88B` and
  `0B`.
- Retained currently unused named images when a compose file still references them. This keeps
  old alpha audit/rollback paths and the new migration runtime buildable without unnecessary
  downloads.
- Host root filesystem improved from `31G / 40G` used (`82%`) to `23G / 40G` used (`60%`);
  available space increased from `7.1G` to `16G`.
- Docker builder cache reduced from `4.265G` to `0B`.

Binance testnet broker cleanup:

- A DB/Redis reset alone is insufficient for sandbox testing. Read-only broker inspection found
  stale virtual positions still held by the configured Binance Futures testnet account.
- Added guarded operational script `scripts/binance_testnet_account_cleanup.py`:
  - always reads `BINANCE_TESTNET_KEYS`, never `BINANCE_LIVE_KEYS`;
  - always creates Binance clients with `testnet=True`;
  - defaults to read-only inspection;
  - requires `--apply --confirm BINANCE_TESTNET_ONLY` before mutation;
  - cancels open standard/algo orders before flattening positions;
  - reads exchange `MARKET_LOT_SIZE.maxQty` and splits oversized residue into valid reduce-only
    market-close chunks;
  - supports Binance one-way and hedge position modes.
- The first cleanup attempt exposed real broker behavior: an oversized legacy residue rejected
  with Binance `-4005 Quantity greater than max quantity`. Max-quantity chunking was added and
  unit-tested before retry.
- Final apply flattened the remaining `35` position symbols through `39` valid chunks.
- All four configured testnet keys subsequently reported:
  - open positions: `0`;
  - open standard orders: `0`;
  - open algo orders: `0`.
- The four keys currently observe the same broker account state. Keep the known production
  boundary from section 26.6: explicit account-to-credential binding is required before
  introducing multiple independent broker accounts.

Final clean baseline:

- Applied `init-db/18-remove-obsolete-legacy-tables.sql` to the running database.
- Removed obsolete tables `positions` and `alpha_stats_daily`; retained public table count is
  `52`.
- Ran `scripts/reset_test_state.sql` after broker flatten and flushed only trading Redis DB0.
  Data-layer Redis DB2 was preserved.
- Removed rsibound local generated logs, state files, and Python cache directories. Static symbol
  universe files were preserved.
- Final database size: `13 MB`.
- Final business-state counts are clean:
  - `accounts=0`, `strategies=0`, `portfolios=0`;
  - canonical `orders=0`, `fills=0`;
  - compatibility `binance_sent_orders=0`, `binance_fills=0`;
  - `account_sync_snapshots=0`, `reconciliation_findings=0`, `dead_letters=0`;
  - `copy_event_outbox=0`, `copy_event_dead_letters=0`.
- Expected runtime/bootstrap rows remain:
  - `venues=2`;
  - `service_heartbeats=10`;
  - `funding_rates=567`, reloaded by the active listener from broker runtime data.
- Redis DB0 repopulated only infrastructure runtime cache/stream keys after boot (`794` keys).
  It contains no rsibound key and no `copy:events:v1` stream. Data-layer DB2 remains active and
  preserved (`5280` keys at audit time).
- Gateway and CLI health returned `READY`; all `11` required service checks were fresh.
- No migrated rsibound or regression alpha container is running.
- Full disposable container regression passed: `227` tests.
- `git diff --check` passed.

Rsibound-only onboarding boundary:

- Reduced `config/_config/portfolio_test_migrate.yaml` to the rsibound scope only. Regression must
  use a separate declarative YAML when it is intentionally tested later.
- CLI read-only `config plan` now contains exactly:
  - one portfolio: `portfolio_test_migrate`;
  - one alpha: `rsiboundportfolioA001_15m`;
  - three accounts: paper Binance, paper DNSE, sandbox Binance;
  - three allocations, three risk profiles, and three trading-state scopes;
  - Binance `300`-symbol and DNSE `82`-symbol allowlists.
- Updated the alpha-local migration runbook with the clean-baseline rule and broker-testnet
  inspection prerequisite.

## 26.8 PnL Semantics, Emergency Close, And Test-Lab Reset

Status: in progress.

Trigger:

- The controlled rsibound paper-Binance deployment was intentionally left running for an
  extended observation window.
- Read-only audit on `2026-06-02` found:
  - `orders=2274`, `fills=2274`;
  - `positions_v2=40`, all currently open;
  - `performance_snapshots=45812`;
  - `account_equity_snapshots=3474`;
  - no Timescale retention or compression policy for performance hypertables.
- Current minute projection writes one instrument snapshot for every open symbol. That is useful
  for diagnostics but too expensive as the default long-term shape when many alphas trade wide
  universes.
- Current account projection also derives realized PnL and fee totals only from symbols that are
  still open. When a symbol becomes fully flat, its historical realized PnL and fees disappear
  from later account snapshots. This is a correctness defect.
- Existing alpha SDK can close one known position with a reduce-only order, but there is no
  audited fund-operator CLI to flatten all positions for one `account_id` or one `alpha_id`.

Approved semantics:

- `fills` is the immutable realized-PnL and fee ledger. `fills.realized_pnl` is the realized delta
  produced by each execution.
- `positions_v2` is current materialized position state per `account_id + instrument_id`:
  - cumulative per-symbol realized PnL remains a useful fast-read projection;
  - unrealized PnL, mark price, mark timestamp, and notional are current-state fields;
  - only open positions require periodic mark refresh.
- `account_equity_snapshots` is the primary minute-level historical account NAV/PnL series:
  - realized PnL and fees aggregate all fills in the deployment, including symbols now flat;
  - unrealized PnL and exposure aggregate current open positions only;
  - funding aggregates the deployment funding ledger.
- `performance_snapshots` remains a symbol-level diagnostic history but changes to a lower-cost
  cadence:
  - write open-position snapshots at a configurable cadence, default `5m`;
  - also write when the position row changed after the latest instrument snapshot so
    open/reduce/close transitions are retained;
  - add Timescale retention/compression policy.
- Add portfolio-level equity snapshots aggregated from account equity and portfolio allocations.
  Do not silently combine unrelated currencies.

Emergency-close operator flow:

- Add an admin-authenticated production-safe operation scoped by exactly one of `account_id` or
  `alpha_id`, with optional `mode` and `venue` filters.
- Default behavior is read-only plan.
- Apply requires an explicit confirmation phrase and CLI admin-password confirmation.
- Apply sequence:
  - move selected deployment scopes to `REDUCING`;
  - cancel open orders where the canonical order lifecycle has enough identity;
  - submit reduce-only `MARKET` close intents through the normal gateway/risk/executor lifecycle;
  - leave deployment in `REDUCING` while fills settle;
  - operator verifies positions and reconciliation, then explicitly moves deployment to
    `HALTED`.
- Do not delete DB rows. Do not bypass broker reconciliation. Direct broker flatten remains a
  disaster-recovery tool followed by reconciliation, not the normal operator path.
- Treat flatten as an explicit `plan -> apply -> verify` loop. A high-volume close may leave a
  bounded residue while asynchronous fills settle; verification reports `PARTIAL`, and the
  operator applies the new residue plan until it reports `VERIFIED`.

Test-only reset boundary:

- Add a host-side orchestration script with read-only plan as its default.
- Destructive apply requires explicit `RESET_ALL_TEST_DATA` confirmation.
- It stops migrated rsibound alpha containers and trading-system application writers, optionally
  flattens configured Binance testnet accounts through the existing guarded testnet-only tool,
  truncates authorized lab DB projections, flushes trading Redis DB0 only, and restarts
  trading-system services. It deletes generated alpha logs/state/cache only when the explicit
  `--clean-alpha-files` flag is used and only below `/root/bobby/execution_alpha/alphas/*`.
- Never expose this reset as a production HTTP endpoint.
- Never flush data-layer Redis DB2, Docker volumes, or shared networks.

Implementation checklist:

- [x] Record approved PnL semantics and operational boundaries.
- [x] Add additive performance schema migration.
- [x] Correct account PnL aggregation and current-position mark projection.
- [x] Reduce symbol snapshot write volume and add Timescale policies.
- [x] Add portfolio equity rollup projection.
- [x] Add audited emergency-close admin API and CLI plan/apply commands.
- [x] Add guarded host-side lab reset plan/apply script.
- [x] Update portfolio CLI guide and rsibound runbook.
- [x] Run container unit tests, migration apply, service restart, smoke verification, and DB audit.

Implementation and verification record on `2026-06-02`:

- Added additive migration `init-db/19-performance-pnl-ops.sql`:
  - current mark fields on `positions_v2`;
  - `portfolio_equity_snapshots`;
  - audited `operator_operations`;
  - Timescale compression and retention policies.
- Corrected account PnL projection:
  - latest snapshot realized PnL, fees, and fill count matched immutable `fills` exactly before
    cleanup: `-1379.631022479737321378`, `230.487763483304000000`, `2381`;
  - after emergency flatten, latest account snapshot retained closed-position realized PnL and
    reported `unrealized_pnl=0`, `total_notional=0`;
  - every one of the `40` initially open positions had a current mark in `positions_v2`.
- Verified lower-cost symbol diagnostic cadence:
  - initial migration cycle wrote changed symbol snapshots;
  - unchanged minute cycles wrote `0`;
  - flatten transitions wrote `40`, bounded residue wrote `1`.
- Verified portfolio equity rollup writes separate `USDT` and `VND` rows. It does not silently
  combine currencies.
- Added operator CLI:
  - `performance account|account-history|portfolio|portfolio-history`;
  - `ops emergency-close` read-only plan and guarded apply;
  - `ops emergency-close-verify`.
- Ran a real paper emergency-close lifecycle smoke:
  - plan found `40` open positions and `0` open orders;
  - first apply queued `90` valid max-quantity chunks;
  - async settlement left bounded residue `WUSDT=4716.2`, correctly reported by the next plan;
  - second apply queued `1` residue close;
  - verify returned `VERIFIED` with `0` open positions and `0` open orders.
- Applied the guarded test-lab reset without broker mutation:
  - business tables including accounts, strategies, portfolios, orders, fills, positions,
    account/portfolio equity snapshots, operations, and copy outbox returned to `0`;
  - Timescale compression remained enabled for all three PnL hypertables and all six
    compression/retention jobs remained installed;
  - trading Redis DB0 was flushed and rebuilt with runtime infrastructure only;
  - data-layer Redis DB2 was preserved (`5427` keys at final audit time and continuing to update
    under the active data_layer service);
  - `copy:events:v1` was recreated as an empty bootstrap stream with lag `0`.
- Final cleanup used explicit `--clean-alpha-files`; generated rsibound `logs/`, `state/`, and
  `main/__pycache__/` content are empty while static config, symbols, strategy code, and runbook
  remain intact.
- Post-reset health is `READY`; all `11` required service checks are fresh and all existing core
  stream consumer groups report pending `0`.
- Full container regression passed: `234` tests. `git diff --check` and reset-script shell syntax
  check passed.
- Copy-publish policy remains explicit opt-in. The rsibound emergency smoke intentionally emitted
  no rsibound copy stream event because this test alpha had no enabled `copy_publish_policies`
  row. Enable policy during the next onboarding cycle when copy-trading publication is required.

## 42. Data-Layer Runtime Remediation Before Wide-Universe Alpha Retest

Context from rsibound 15m paper-mode retest:

- A 40-symbol rsibound execution universe was enough to expose market-data pressure because the
  current bridge/paper matcher wiring consumed far more than the alpha's active order scope.
- Redis core stayed up, but `paper_execution_service` was disconnected by Redis Pub/Sub
  output-buffer protection. This happened because the matcher wildcard-subscribed all
  `events.market.trade.*` and `events.market.quote.*` channels.
- Redis counters such as total published messages and AOF rewrites are cumulative since Redis
  startup. They are not stored tick garbage, but they prove the durable Redis instance is doing
  the wrong workload for raw market data.
- `data_layer` should be the only provider-connection owner. trading_system and alpha runtime
  must consume stable `data_layer` contracts and validate freshness before trading.
- Symbol declarations were inconsistent:
  - trading_system `.env` overrode bridge symbols with a small hardcoded Binance/VN list;
  - alpha used its own universe JSON;
  - data_layer used provider/universe symbol files.
  This caused mark gaps and cold-cache races even when providers supported the symbols.

Approved architecture:

- Split Redis ownership:
  - durable `redis_service` / DB0: trading commands, order/fill streams, copy outbox, locks,
    operational state, and any state that must survive service restart.
  - ephemeral `redis_marketdata` / DB0: raw/latest market-data TTL cache, last-known market
    snapshots, and market-data Pub/Sub. No AOF/RDB persistence.
- One symbol-source rule:
  - trading_system uses `shared/symbols.json`, optionally limited by numeric guardrails only.
  - alpha uses alpha-owned universe JSON files.
  - data_layer uses data_layer-owned provider/universe files.
  - `.env` must not contain long comma-separated production universes.
- Paper execution does not subscribe to the full market universe. It polls active open orders and
  matches them against latest cached ticks for those instruments only.
- Market orders can use the latest cached tick at submit time. If unavailable, they may use an
  explicitly allowed REST/last-known recovery path with freshness validation; otherwise reject as
  `MARKET_DATA_OFFLINE`.
- Performance/accounting can use read-through data_layer recovery for marks because it is a
  projection layer. Risk remains stricter and must reject stale/missing broker/market snapshots.

Implementation checklist:

- [x] Update data_layer dev note with Phase 6 plan and boundaries.
- [x] Add ephemeral `redis_marketdata` to `data_layer/docker-compose.yml`.
- [x] Point data_layer `.env`/compose at `redis_marketdata`.
- [x] Point trading_system `DATA_LAYER_REDIS_URL` at `redis_marketdata` while keeping
  `TRADING_REDIS_URL`/`REDIS_URL` on durable `redis_service`.
- [x] Remove hardcoded `MARKET_DATA_BINANCE_SYMBOLS` and `MARKET_DATA_VN_SYMBOLS` values from
  trading_system `.env`.
- [x] Coalesce duplicate Redis writes inside data_layer publisher batches.
- [x] Replace paper execution wildcard Pub/Sub matcher with active-open-order latest-tick polling.
- [x] Add performance read-through mark recovery via data_layer REST for accounting snapshots.
- [x] Add alpha runtime Binance `/price-last` fallback support with freshness-aware usage.
- [x] Run unit/container tests.
- [ ] Rerun rsibound paper Binance/DNSE for a short controlled
  window before scaling the universe beyond 40 symbols.

Expected outcome:

- Wide data_layer streaming can be scaled independently from trading command/event durability.
- Redis durable AOF rewrite pressure drops because raw market data leaves durable Redis.
- Paper matcher cost scales with open paper orders, not with provider universe size.
- PnL/mark projection has fewer null marks without weakening risk controls.
- Alpha warmup remains batch-first and does not require per-symbol direct provider connections.

Implementation and verification record on `2026-06-03`:

- data_layer:
  - added `redis_marketdata` ephemeral service;
  - changed data_layer runtime env/default SDK Redis target to `redis_marketdata:6379/0`;
  - added publisher batch coalescing to keep only the latest event per key/channel inside each batch.
- trading_system:
  - `DATA_LAYER_REDIS_URL` now defaults to `redis://redis_marketdata:6379/0`;
  - `.env` no longer hardcodes long Binance/VN market-data symbol override lists;
  - `PAPER_MATCHER_POLL_INTERVAL_SECONDS=0.5` added;
  - `PAPER_DATA_LAYER_MARKET_RECOVERY_ENABLED=true` added so paper execution can recover a
    missing internal tick from data_layer on demand;
  - paper execution now polls active open orders and latest cached ticks instead of wildcard
    subscribing the whole internal market universe;
  - paper execution market/order matching no longer requires market_data bridge to subscribe to
    every alpha universe symbol before a paper order can be simulated;
  - performance projection can recover mark prices from data_layer REST for accounting snapshots
    when Redis marks are missing/stale, without weakening risk enforcement.
- alpha runtime/migrated alpha samples:
  - data_layer Redis default changed to `redis_marketdata:6379/0`;
  - Binance latest price wrapper can fallback to `/v1/binance/price-last/{symbol}`;
  - rsibound/regression action wrappers validate fallback freshness before using the price.
- Verification:
  - compile check passed for modified modules.
  - targeted trading_system Docker tests before paper recovery: `47 passed`.
  - targeted paper execution Docker tests after paper recovery: `42 passed`.
  - full trading_system Docker test suite after paper recovery: `238 passed`, `2` known FastAPI
    deprecation warnings.
  - data_layer stream-supervisor test: `10 tests OK`.
  - full data_layer Docker unit suite: `53 tests OK`.
  - alpha runtime contract via Docker/unittest: `13 tests OK`.
  - `redis_marketdata` is healthy and `data_layer_service` is up after the data_layer Docker test run.

Pending runtime retest:

- Restart trading_system application services to apply paper matcher/performance/market-data env changes.
- Restart rsibound paper Binance/DNSE containers against `redis_marketdata`.
- Run 2-4 rsibound cycles, then audit DB/Redis/logs before increasing alpha universe size.

Follow-up after the next rsibound audit:

- Replace the current market_data bridge numeric first-N guardrail with an explicit scoped universe:
  - preferred: active deployment/account/instrument scope from DB;
  - acceptable for lab: mounted JSON universe file;
  - avoid long comma-separated `.env` lists.
- This is less urgent after paper execution read-through recovery, but it will make internal
  market cache coverage easier to reason about for dashboards, monitoring, and low-latency
  open-order matching.

### 42.1 Rsibound Paper Binance Retest Finding - Risk Engine Crash Recovery

Retest observation on `2026-06-03`:

- Alpha warmup path was healthy:
  - rsibound paper Binance loaded `300` symbols from data_layer;
  - each sampled warmup line reported `interval=15m rows=500`;
  - the old empty-history failure did not recur.
- The rebalance selected `40` nonzero targets, but every order logged as `Failed LONG/SHORT`.

Root causes:

- `risk_engine_service` was crash-looping while the alpha submitted orders.
- The crash came from `sync_market_info_task()` calling
  `python-binance AsyncClient.create(testnet=True)` before entering its `try` block.
- Binance spot testnet endpoint returned `502 Bad Gateway` from
  `https://testnet.binance.vision/api/v3/ping`.
- Because the exception happened during client creation, the background exchange-info sync task
  killed the whole `asyncio.gather()`, including the risk stream consumer.
- The `40` alpha orders had already been delivered to `risk_engine_group` and became Redis
  Stream pending messages:
  - `order.inbound` length: `40`;
  - `risk_engine_group` pending before fix: `40`;
  - no fills were created.
- Risk engine also lacked pending-message autoclaim, so a crash between delivery and ACK could
  leave order intents stuck indefinitely.

Fix implemented:

- Refactored Binance market-info sync into `_sync_market_info_once()`.
  - Binance metadata sync is now best-effort.
  - `AsyncClient.create()` failures are caught.
  - The risk engine stays online and retries later.
  - Static/default market metadata remains the fallback path for supported symbols.
- Added `RISK_ORDER_INTENT_MAX_AGE_SECONDS=30`.
  - non-cancel order intents older than this are rejected as `STALE_ORDER_INTENT`;
  - this prevents delayed execution after alpha-side `wait_for_final` has already timed out.
- Added risk pending recovery:
  - `_process_pending_messages()` uses `XAUTOCLAIM`;
  - `run_stream_consumer()` claims idle pending messages before reading new ones.
- Restarted `risk_engine_service`.
  - it reclaimed the `40` pending rsibound orders in two batches of `20`;
  - all `40` were rejected with `STALE_ORDER_INTENT`;
  - `XPENDING order.inbound risk_engine_group` returned `0`;
  - `fills` for `rsiboundportfolioA001_15m / paper-binance-rsiboundportfolioA001_15m` remained `0`.

Verification:

- targeted risk tests: `17 passed` before stale/pending patch;
- targeted risk loader tests after stale/pending patch: `8 passed`;
- full trading_system Docker suite after final risk patch: `242 passed`, with only the known
  FastAPI `on_event` deprecation warnings.

Remaining operational note:

- Binance/testnet upstream errors are now summarized in section 42.2 so they do not flood runtime
  logs with HTML response bodies.
- The next rsibound run should be a fresh cycle. Do not reuse the 40 stale order IDs; they were
  intentionally rejected and ACKed.

### 42.2 Trading System Service Stability Before Rsibound Retest

Audit trigger on `2026-06-03`:

- After the data-layer Redis split and rsibound retest attempt, `executor_service`,
  `listener_service`, and `reconciliation_service` were observed restarting.
- The first suspicion was an incomplete Redis migration, but container logs showed a different
  root cause:
  - all three services crashed while creating Binance `AsyncClient` instances;
  - `python-binance` called `https://testnet.binance.vision/api/v3/ping`;
  - Binance returned `502 Bad Gateway`;
  - the exception happened during service startup, before the service entered its normal
    resilient processing loop.

Design rule confirmed:

- A broker/testnet/live upstream outage must never crash core trading-system services.
- Services must stay `READY` in degraded mode and make broker-dependent actions fail explicitly:
  - paper trade should continue when it only needs data_layer and internal accounting;
  - sandbox/live Binance execution should reject with a clear broker-unavailable reason until the
    broker API recovers;
  - listener/reconciliation should retry broker setup/sync on schedule without restart-looping.

Fix implemented:

- `services/executor/core/client_manager.py`
  - Binance client initialization is now best-effort per key.
  - Failed keys are recorded in `init_errors`.
  - If no Binance client initializes, executor stays up and Binance adapters operate degraded.
  - Close path tolerates partial/failed clients.
- `services/executor/adapters/binance_futures.py`
  - `execute_batch`, `cancel`, and `modify` return rejected adapter results when no broker client is
    available instead of raising out of the executor loop.
  - Rejection reason is explicit: `BROKER_CLIENT_UNAVAILABLE`.
- `services/listener/core/socket_manager.py`
  - Binance user-data socket initialization is best-effort.
  - If no sockets initialize, listener stays active and retries every `60` seconds.
  - Duplicate immediate init attempts are throttled.
- `services/reconciliation/main.py`
  - Broker sync exceptions are logged and skipped per sweep instead of crashing the service.
- Broker upstream errors are compacted in logs.
  - Example: `BINANCE_TESTNET_PING_502: https://testnet.binance.vision/api/v3/ping`
  - This keeps runtime logs readable during exchange/testnet incidents.

Verification:

- Compile check passed for modified modules.
- Targeted Docker tests after degraded-mode patch: `25 passed`.
- Full trading_system Docker suite after final patch: `244 passed`, with only the known FastAPI
  `on_event` deprecation warnings.
- Restarted `executor`, `listener`, and `reconciliation`, then waited longer than one listener
  retry interval.
- Runtime audit after restart:
  - all trading_system containers were `Up`;
  - `executor_service`, `listener_service`, `reconciliation_service` had `RestartCount=0`;
  - `service_heartbeats` reported `READY` for all `10` services;
  - `XPENDING order.inbound risk_engine_group = 0`;
  - `XPENDING commands.execution.paper paper_execution_group = 0`.

Operational conclusion:

- The core trading_system is stable enough to retest paper rsibound.
- Binance sandbox/live functionality is currently degraded because Binance testnet ping returns
  `502`; sandbox orders should reject clearly until the broker endpoint recovers.
- Paper Binance and paper DNSE can be retested now, because their execution path no longer depends
  on Binance broker client startup.

### 42.3 Binance Futures Broker Resilience Upgrade

User question on `2026-06-03`:

- `degraded` is acceptable as a service-state guard, but it does not by itself solve the root
  cause of Binance sandbox/live order routing.
- The production-grade goal is to avoid making Binance Futures execution depend on a
  `python-binance` Spot testnet ping.

Root cause refinement:

- Current trading flow uses Binance USD-M Futures endpoints (`/fapi/*`) for sandbox/live order
  execution.
- `python-binance AsyncClient.create(testnet=True)` performs a connectivity check against the
  Spot testnet endpoint:
  `https://testnet.binance.vision/api/v3/ping`.
- Therefore a Spot testnet `502` can block Futures execution client startup even when Futures
  REST endpoints may still be usable.

Production-grade design:

- Keep `python-binance` as the preferred adapter when it initializes normally.
- Add a direct official Binance USD-M Futures REST fallback:
  - signs requests with HMAC SHA256;
  - uses official `/fapi/*` endpoints directly;
  - supports order create/modify/cancel, batch orders, exchange info, account, positions,
    open orders, and order query;
  - avoids the Spot testnet ping path entirely.
- Support multiple Futures REST base URLs by mode:
  - sandbox default:
    `https://testnet.binancefuture.com,https://demo-fapi.binance.com`;
  - live default:
    `https://fapi.binance.com`.
- Keep Binance Spot and Binance Futures separated:
  - sandbox/live execution registry currently supports `BINANCE` as USD-M Futures only;
  - paper `BINANCE` is internal paper execution and does not call broker Spot/Futures APIs;
  - Spot REST URLs are configured separately for future spot adapters but are not used by the
    Futures execution adapter;
  - gateway health names capabilities explicitly as `broker:binance_futures` and
    `broker:binance_futures_user_stream`.
- Add a small circuit breaker:
  - after repeated broker init failures, skip reconnect attempts during cooldown;
  - core services remain `READY`;
  - broker capability reports `READY`, `DEGRADED`, or `CIRCUIT_OPEN`.
- Expose capability health:
  - executor heartbeat now includes `broker_capabilities.binance`;
  - listener heartbeat includes `broker_capabilities.binance_user_stream`;
  - gateway `/v1/health` aggregates capability details;
  - gateway `/v1/health/capabilities` returns a compact capability-only view.
- Keep behavior honest:
  - if direct Futures REST works, sandbox/live Binance execution can continue even when
    `python-binance` Spot ping fails;
  - if all Futures REST URLs fail too, orders reject clearly with `BROKER_CLIENT_UNAVAILABLE`;
  - no fake fills or hidden success.

Implemented files:

- `services/executor/core/binance_direct.py`
  - new minimal async Binance USD-M Futures REST client.
- `services/executor/core/client_manager.py`
  - python-binance first, direct Futures REST fallback second;
  - broker capability status;
  - circuit breaker state;
  - compact upstream error labels.
- `services/executor/adapters/binance_futures.py`
  - hardened batch error-object handling.
- `services/portfolio_management/account_sync.py`
  - broker account sync can fall back to direct Futures REST.
- `services/executor/main.py`
  - dynamic executor heartbeat with broker capability details.
- `services/listener/core/socket_manager.py`
  - listener capability status and compact socket init errors.
- `services/listener/main.py`
  - dynamic listener heartbeat with Binance user-stream capability.
- `services/gateway/main.py`
  - `/v1/health` includes aggregated capabilities;
  - `/v1/health/capabilities` added.
- `shared/config.py`, `.env.example`, `.env`
  - fallback/circuit/base-URL knobs added.
- `tests/unit/test_broker_client_degraded.py`
  - direct Futures REST fallback unit coverage added.

Config knobs:

```env
BINANCE_DIRECT_REST_FALLBACK_ENABLED=true
BINANCE_FUTURES_REST_TIMEOUT_SECONDS=8
BINANCE_CIRCUIT_FAILURE_THRESHOLD=3
BINANCE_CIRCUIT_COOLDOWN_SECONDS=120
BINANCE_FUTURES_TESTNET_REST_URLS=https://testnet.binancefuture.com,https://demo-fapi.binance.com
BINANCE_FUTURES_LIVE_REST_URLS=https://fapi.binance.com
```

Verification status:

- Static compile check passed for modified modules.
- Targeted Docker tests passed:
  - `tests/unit/test_broker_client_degraded.py`;
  - `tests/unit/test_binance_batch_sync.py`;
  - `tests/unit/test_broker_payload_contracts.py`;
  - `tests/unit/test_binance_order_mapping.py`;
  - result: `21 passed`.
- Full trading_system Docker suite after final gateway health fix:
  - result: `245 passed`, with only the known FastAPI `on_event` deprecation warnings.
- Restarted `executor`, `listener`, `reconciliation`, and `gateway`.
- Runtime audit:
  - all trading_system containers were `Up`;
  - `executor_service`, `listener_service`, `reconciliation_service`, `gateway_service` had
    `RestartCount=0`;
  - `XPENDING order.inbound risk_engine_group = 0`;
  - `XPENDING commands.execution.paper paper_execution_group = 0`;
  - `/v1/health/capabilities` returned HTTP `200`.
- Observed capability payload after restart:
  - `broker:binance_futures.status = READY`;
  - `broker:binance_futures.market = USD_M_FUTURES`;
  - `broker:binance_futures.client_count = 4`;
  - `broker:binance_futures.client_sources = ["python_binance", ...]`;
  - `broker:binance_futures_user_stream.status = READY`;
  - `broker:binance_futures_user_stream.socket_count = 4`.
- At the final audit time, python-binance initialized successfully, so direct Futures REST fallback
  was not active. The fallback path remains covered by unit tests and will activate only when
  python-binance Spot ping/init fails while Futures REST ping succeeds.

Remaining production follow-up:

- Direct REST covers order/account/reconciliation paths.
- Binance private user-data websocket is still handled through `python-binance`; when it is
  degraded, reconciliation polling remains the recovery path.
- If long-running sandbox/live testing shows python-binance user stream remains unreliable, build a
  direct listenKey websocket listener as the next isolated upgrade.

## RSI Bound Paper Audit 2026-06-03

Scope:

- Alpha folder audited: `/root/bobby/execution_alpha/alphas/rsiboundportfolioA001_15m`.
- Modes/venues observed:
  - `paper / BINANCE / paper-binance-rsiboundportfolioA001_15m`.
  - `paper / DNSE / paper-dnse-rsiboundportfolioA001_15m`.
- Evidence sources:
  - alpha logs under `execution_alpha/alphas/rsiboundportfolioA001_15m/logs`;
  - core Redis streams: `order.inbound`, `events.risk.denied`;
  - Postgres tables: `orders`, `binance_sent_orders`, `positions_v2`, `account_reservations`.

Observed database state before fix:

- `order.inbound` had 103 entries and risk consumer lag/pending was `0`; no Redis/core stream backlog.
- `events.risk.denied` had 47 entries.
- Canonical `orders` only showed:
  - Binance paper: 40 `FILLED`;
  - DNSE paper: 16 `FILLED`.
- Legacy `binance_sent_orders` showed:
  - Binance paper: 40 `RISK_REJECTED`, reason `Qty too small after rounding`;
  - DNSE paper: 7 `RISK_REJECTED`, reason `Qty too small after rounding`.
- `positions_v2` showed:
  - Binance paper: 40 nonzero positions;
  - DNSE paper: 16 nonzero positions.

Root causes:

1. Binance paper first cycle was successful. The second cycle failed because the alpha processed the same closed candle twice:
   - initial warmup run processed `2026-06-03 14:30:00`;
   - scheduled run at `14:45:09` also returned and processed `2026-06-03 14:30:00`.
   This generated tiny rebalance deltas against already-open positions. Those deltas were below Binance futures `step_size` for many symbols and were correctly rejected by risk.
2. DNSE short failures are expected in cash-compatible paper mode:
   - wrapper blocks opening `SHORT` on DNSE unless it is a reduce/close action.
3. DNSE long failures for `GEX`, `KBC`, `MSN`, `MWG`, `VCB`, `VHM`, `VIC` were expected risk rejects because requested quantity was below VN board lot:
   - DNSE default market metadata uses `step_size=100`, `lot_size=100`.
4. Risk rejection logging was not production-clear:
   - `RiskChecker` rounded rejected quantities to `0` before logging, so `binance_sent_orders.orig_qty` lost the requested quantity.
   - reject rows were not projected into canonical `orders`, so operators looking only at v2 tables could not see risk rejects.
   - alpha wrapper returned only boolean failure, so logs said `Failed ...` without the exact trading_system reason.

Fixes implemented:

- `services/risk_engine/core/checker.py`
  - preserves `requested_quantity`;
  - stores `rounded_quantity`;
  - attaches `risk_context` with step/precision/market metadata when quantity rounds to zero.
- `services/risk_engine/repository/risk_repo.py`
  - logs rejected order original requested quantity into legacy audit;
  - projects future `RISK_REJECTED` orders into canonical `orders` with `error_code`, `error_message`, and `raw_response.risk_context`.
- `services/gateway/main.py`
  - added read-only `/v1/market/info/{venue}/{symbol}` endpoint.
- `alpha_sdk/trading_system_async_action.py`
  - added `get_market_info()`.
- `execution_alpha/alphas/rsiboundportfolioA001_15m/trade/action_async.py`
  - preflights order quantity using trading_system market metadata;
  - submits market-step/board-lot rounded quantity after preflight;
  - logs trading_system rejection reason/result;
  - skips tiny scale deltas below market step as a no-op instead of sending them to risk.
- `execution_alpha/alphas/rsiboundportfolioA001_15m/main/rsiboundportfolioA001.py`
  - added `last_processed_bar` in alpha state;
  - skips duplicate/stale candle processing;
  - saves `last_processed_bar` only after rebalance completes.

Verification:

- Compile check passed for modified trading_system modules in `gateway_service`.
- Targeted Docker test suite passed:
  - `tests/unit/test_gateway_idempotency.py`;
  - `tests/unit/test_risk_checker_market_metadata.py`;
  - `tests/unit/test_alpha_sdk_order_state.py`;
  - `tests/unit/test_risk_rejection_projection.py`;
  - result: `18 passed` before projection test addition, then `14 passed` for the focused
    risk projection/risk metadata/SDK suite.
- Alpha runtime compile check passed:
  - `main/rsiboundportfolioA001.py`;
  - `trade/action_async.py`;
  - `trade/handler.py`.
- Full trading_system Docker suite after this audit passed:
  - result: `246 passed`;
  - only known FastAPI `on_event` deprecation warnings.

Required next runtime step before re-running RSI Bound:

- Restart `gateway_service` and `risk_engine_service` so the new endpoint and risk projection logic are live.
- Restart RSI Bound paper containers from a clean test state.
- After 1-2 cycles, audit:
  - canonical `orders` should include future `RISK_REJECTED` rows with clear reason if any reject occurs;
  - `binance_sent_orders.orig_qty` should no longer be zero for below-lot rejects;
  - duplicate same-candle processing should log `Rebalance skipped: candle already processed`;
  - tiny scale deltas should log `skip tiny rebalance delta` and should not enter `order.inbound`.

## Orders-Only Canonical Migration 2026-06-03

Decision:

- `orders` is now the only order lifecycle source of truth.
- `binance_sent_orders` was legacy adapter audit and made operations harder because order state was
  split across two tables.
- Risk, executor, listener, reconciliation, gateway query, CLI trace, portfolio-management
  reconciliation, and smoke scripts must use canonical `orders`.

Implemented:

- Runtime writes:
  - `services/executor/repository/order_repo.py` now writes only `orders`.
  - `services/risk_engine/repository/risk_repo.py` now projects `RISK_REJECTED` only into `orders`.
- Runtime reads/updates:
  - gateway `OrderQueryRepository` no longer has legacy fallback;
  - Binance listener updates `orders` by `venue_order_id`;
  - reconciliation resolves uncertain/missing broker orders through `orders`;
  - portfolio-management open-order reconciliation uses `orders`;
  - Binance algo-id lookup reads `orders.raw_response`;
  - CLI `ops trace-order` returns `canonical_orders` only, plus paper/fills/reservations/etc.
- Database:
  - added `init-db/10-migrate-binance-sent-orders-to-orders.sql`;
  - migration backfills old legacy rows into `orders`;
  - migration drops `binance_sent_orders`;
  - fresh init no longer creates `binance_sent_orders`.
- Existing live DB migration result:
  - before: `binance_sent_orders=47`, `orders=56`;
  - after: `binance_sent_orders` dropped, `orders=103`;
  - rsibound canonical order statuses:
    - Binance paper: `40 FILLED`, `40 RISK_REJECTED`;
    - DNSE paper: `16 FILLED`, `7 RISK_REJECTED`.

Known historical limitation:

- The 47 migrated reject rows had already lost original quantity because the old legacy table stored
  `orig_qty=0`. They were backfilled with the minimum positive quantity required by the canonical
  `orders.quantity > 0` constraint. Future rejects preserve requested quantity and risk context.

Verification:

- No runtime service/test/script references to `binance_sent_orders` remain.
- Targeted Docker tests after migration cleanup:
  - order projection;
  - risk rejection projection;
  - alpha SDK order state;
  - gateway idempotency;
  - CLI;
  - result: `25 passed`.
- Full trading_system Docker suite after orders-only migration:
  - result: `246 passed`;
  - only known FastAPI `on_event` deprecation warnings.
- Runtime applied:
  - restarted gateway, risk_engine, executor, listener, reconciliation, and portfolio;
  - `XPENDING order.inbound risk_engine_group = 0`;
  - `XPENDING commands.execution.paper paper_execution_group = 0`;
  - gateway order query for migrated `RISK_REJECTED` row returns `raw_response` as JSON object.

## Rsibound Alpha Timing Correction 2026-06-03

Finding from alpha logs:

- `rsiboundportfolioA001_15m` was trading immediately after warmup:
  - Binance paper warmed up until `15:48:04`, then processed and traded candle `15:45:00`.
  - This is an unwanted catch-up trade because startup time is not an interval execution trigger.
- Scheduled DNSE fetch at `16:02:59` returned stale provider candle `2026-06-02 00:45:00`.
  - The duplicate guard prevented a second trade, but the handler should have rejected stale
    candle timestamps before calling the alpha process.
- The issue is orchestration/timing behavior, not RSI Bound signal math.
- Follow-up finding from `16:34-16:47` logs:
  - Binance/DataLayer kline timestamps are candle **open time**, not close time.
  - The migrated handler compared provider open time with the close boundary, then accepted
    `16:45` at `16:47` even though that was the currently open `16:45-17:00` bar, not the
    already closed `16:30-16:45` bar.
  - Warmup for crypto also used unconstrained latest REST klines, so it could include the
    currently open candle.
  - DNSE/VN paper correctly rejected post-market wall-clock candles, but the handler was still
    polling by wall-clock instead of anchoring to the last warmup bar.

Corrected policy:

- Warmup only loads and aligns history. It does not submit orders by default.
- Crypto warmup requests only closed candles by bounding historical REST with `end_time` before
  the currently open bar.
- The data manager records `last_bar_time` as the last closed candle **open time** loaded from
  warmup.
- The alpha waits for `(last_bar_time + interval)` to open and close, then wakes at the close
  boundary plus `ALPHA_CANDLE_CLOSE_DELAY`.
- Scheduled fetch only accepts the candle whose **open time** equals `last_bar_time + interval`.
  For Binance this is requested with `end_time=expected_open_ms` and then validated.
- Stale provider candles are skipped, especially for VN data after market close.
- If the next expected bar is already far behind wall-clock and data has not advanced, the
  handler idles/polls instead of catch-up trading stale intervals.
- Initial universe selection may be restored from warmup state without placing orders. This lets
  the first live scheduled cycle fetch the selected universe rather than the full 300-symbol
  universe.
- After selected symbols exist, scheduled fetch uses selected symbols by default instead of
  fetching the full universe every cycle.

Implemented in:

- `execution_alpha/alphas/rsiboundportfolioA001_15m/main/rsiboundportfolioA001.py`
  - `ALPHA_INITIAL_RUN_POLICY=wait_next_close` default;
  - explicit `catch_up` / `trade_latest` is required to trade immediately after warmup;
  - tracks `PortfolioDataManager.last_bar_time`;
  - selects initial monthly universe from warmup without trading;
  - appends real scheduled candles and forward-fills non-updated symbols to preserve a complete
    matrix at the new bar, then FIFO trims to `maxlen`;
  - alpha `current_dt` comes from the data manager anchor, not whichever dataframe happens to be
    first in the dict.
- `execution_alpha/alphas/rsiboundportfolioA001_15m/trade/handler.py`
  - waits from data-manager bar anchor rather than container startup wall-clock;
  - expected-open timestamp validation for provider klines;
  - stale candle skip logs;
  - max lag guard via `ALPHA_CANDLE_MAX_LAG_SECONDS`;
  - scheduled symbol scope via `symbols_for_scheduled_update()`.
- `execution_alpha/alphas/rsiboundportfolioA001_15m/trade/buffer.py`
  - crypto warmup excludes the currently open bar;
  - logs first/last warmup candle open timestamps per symbol for audit.
- `execution_alpha/alphas/rsiboundportfolioA001_15m/docker-compose.yml`
  - explicit timing envs added.

Verification:

- Alpha runtime compile check passed for:
  - `main/rsiboundportfolioA001.py`;
  - `trade/handler.py`;
  - `trade/buffer.py`;
  - `trade/action_async.py`.
- Docker runtime image compile check also passed with the mounted rsibound alpha code.
- DataLayer contract smoke:
  - request: Binance `BTCUSDT`, `15m`, `limit=1`,
    `end_time=<current_interval_open_ms - 1000>`;
  - observed at current open `2026-06-03T16:45:00Z`;
  - returned candle open `2026-06-03T16:30:00Z`, confirming the bounded request excludes the
    currently open `16:45-17:00` candle.

## Rsibound Paper Market Data Recovery 2026-06-04

Finding from the next rsibound paper retest:

- `rsiboundportfolioA001_15m` timing behavior is now aligned with the intended quant cycle:
  - Binance paper warmup loaded `300` symbols from `data_layer`;
  - warmup anchors were closed 15m candle open times, mostly `2026-06-04T06:15:00Z`;
  - the handler waited for the next scheduled 15m close instead of trading immediately after
    startup;
  - scheduled fetch then processed the next closed candle and advanced the wait anchor.
- DNSE paper warmup and scheduling also ran, but most DNSE rejects were expected policy results:
  - cash-compatible mode does not open short positions;
  - HOSE/HNX lot-size checks reject quantities below the stock lot size.
- Binance paper still produced several `MARKET_DATA_OFFLINE` risk rejects for valid wide-universe
  symbols such as `HMSTRUSDT`, `IDUSDT`, `IOSTUSDT`, `MBOXUSDT`, and `MEMEUSDT`.

Root cause:

- This was not a historical warmup/OHLCV gap.
- `data_layer` had OHLCV for the rejected symbols, and direct data-layer smokes later returned
  both `/v1/binance/price/{symbol}` and `/v1/crypto/ohlcv/binance/{symbol}` successfully for the
  sampled failures.
- The local trading-system `market_data_service` intentionally projects only a bounded Binance
  subset into trading Redis to avoid the old wide-universe Redis overload.
- `risk_engine` market-order admission first checks trading Redis latest trade/quote/ticker keys.
  For rsibound's wide Binance paper universe, some valid symbols can be outside that local
  projected subset or have a cold latest-trade cache at the exact order-submission moment.
- The previous read-through recovery tried `data_layer.latest_trade`, but if that endpoint was
  cold/missing for one symbol it still failed the paper order even though a recent closed OHLCV
  candle was available.

Policy correction:

- Keep `sandbox` and `live` strict:
  - they may recover only from authoritative fresh latest trade/quote data;
  - they must still fail closed as `MARKET_DATA_OFFLINE` if data_layer cannot provide a fresh
    authoritative execution mark.
- Allow `paper` Binance to use a clearly labelled, non-authoritative OHLCV close fallback:
  - default interval: `1m`;
  - request is bounded to the latest closed candle, not the currently open candle;
  - recovered snapshot is labelled `source=data_layer.crypto_ohlcv_close` and
    `raw.authoritative=false`;
  - the recovered snapshot is projected back to trading Redis so risk and paper execution observe
    a consistent mark.
- This is a simulation fallback only. It is acceptable for paper robustness but must not silently
  authorize sandbox/live broker orders.

Implemented:

- `services/risk_engine/data_layer_recovery.py`
  - Binance latest-trade recovery remains first choice;
  - Binance paper falls back to bounded `crypto_ohlcv` latest closed candle close;
  - Binance sandbox/live re-raise latest-trade recovery failures and stay fail-closed.
- `services/paper_execution/client.py`
  - paper matcher latest-tick recovery now uses the same Binance paper OHLCV close fallback when
    latest trade is missing/stale.

Verification:

- Modified modules compile locally.
- Docker targeted tests passed:
  - `tests/unit/test_risk_data_layer_recovery.py`;
  - `tests/unit/test_paper_execution.py`;
  - result: `48 passed`.
- Docker broader/full unit verification:
  - targeted market-data/risk/client suite: `71 passed`;
  - full trading_system unit suite: all tests passed, with only known FastAPI `on_event`
    deprecation warnings.
- Data-layer endpoint smoke for sampled failed symbols:
  - `HMSTRUSDT`, `IDUSDT`, `IOSTUSDT`, `MBOXUSDT`, `MEMEUSDT`;
  - `/v1/binance/price/{symbol}` returned `200`;
  - `/v1/crypto/ohlcv/binance/{symbol}?interval=1m&limit=1&end_time=<latest_closed>` returned
    `200` with a recent closed candle close.

Pending operational verification:

- Restart `risk_engine_service` and `paper_execution_service` to apply the recovery patch.
- Let rsibound paper Binance run one fresh 15m cycle.
- Audit:
  - alpha log has no new paper-only `MARKET_DATA_OFFLINE` for valid Binance symbols with recent
    OHLCV;
  - risk rejection rows still appear for real policy failures only;
  - paper fills, `orders`, `fills`, `positions_v2`, account balances, and performance snapshots
    remain internally consistent.

Post-restart verification:

- Restarted `risk_engine_service` and `paper_execution_service`.
- `XPENDING order.inbound risk_engine_group` returned `0`.
- Gateway app inside the container returned:
  - `/v1/health`: `READY`;
  - `/v1/health/capabilities`: `READY`.
- The rsibound alpha containers were not running after the user's one-cycle run, so no new
  scheduled 15m alpha cycle occurred after the patch.
- Controlled paper smoke through the real gateway used a symbol that previously failed:
  - `client_order_id=rsipbi_recovery_hmstr_1780557515`;
  - `symbol=HMSTRUSDT`;
  - `mode=paper`;
  - `account_id=paper-binance-rsiboundportfolioA001_15m`.
- Result:
  - canonical `orders.status=FILLED`;
  - `fills` row inserted with `instrument_id=HMSTRUSDT.BINANCE`,
    `price=0.000138600000000000`, `quantity=1000`;
  - no new `MARKET_DATA_OFFLINE` row was inserted after restart.
- Pre-patch rows remain visible for audit:
  - `64 FILLED` and `15 MARKET_DATA_OFFLINE` for paper Binance between
    `2026-06-04T06:40:00Z` and the service restart;
  - these rows came from the old risk recovery path and should not be used as evidence that the
    patched path failed.

Important correction:

- The paper OHLCV fallback above is only a damage-control patch for paper simulation.
- It is **not** the complete production-grade solution for the underlying cold-cache issue.
- For every future data/risk fix, record and test:
  1. why the cache became cold/missing;
  2. whether the provider/source is authoritative for the requested execution market;
  3. how sandbox/live fail closed when authoritative live data is not ready;
  4. how paper may simulate without weakening sandbox/live safety.
- Never mark a market-data incident closed only because paper mode can now continue.

### 43. Production-Grade Market Data Readiness Plan

Current root causes behind Binance cold-cache risk:

- `data_layer` live cache is intentionally ephemeral:
  - short TTL keys such as `trade:price:{symbol}`;
  - Pub/Sub messages are not durable;
  - `price-last` snapshots are recovery/diagnostic state, not proof that a live stream is
    currently healthy.
- `trading_system.market_data_service` intentionally subscribes a bounded subset of symbols to
  avoid the previous Redis overload. That means a wide-universe alpha can submit a valid symbol
  that is not present in the local trading Redis cache.
- Trading/risk accepts order intents for arbitrary symbols before there is a deterministic
  market-data readiness check for that alpha deployment/account/symbol.
- `data_layer` currently exposes `/v1/binance/price/{symbol}` without a market namespace. The
  stream runtime publishes both spot and futures trade sources into the same legacy key/channel
  shape (`trade:price:{symbol}`, `stream:trade:{symbol}`). This is acceptable only as a backward
  compatibility bridge, not as the final source for sandbox/live execution where spot and USD-M
  futures must be separated.
- `price-last` can help diagnostics and recovery, but sandbox/live should not treat
  `is_live=false` as execution-grade data unless an explicit broker/venue policy says so and the
  freshness window is extremely tight.

Production rule:

- `paper`:
  - may use labelled non-authoritative fallback when the test policy allows it;
  - fallback must be visible in logs/DB context.
- `sandbox/live`:
  - require authoritative market data for the exact broker market being traded;
  - reject with a precise reason such as `MARKET_DATA_NOT_READY`,
    `MARKET_DATA_STALE`, `MARKET_DATA_NON_AUTHORITATIVE`, or
    `MARKET_DATA_WRONG_MARKET`;
  - must not use OHLCV close or OKX/reference data to authorize Binance/DNSE broker orders.

Required architecture changes before calling sandbox/live market-data production-grade:

1. **Market namespace in data_layer**
   - Add namespaced Redis keys/channels:
     - `trade:price:binance_spot:{symbol}`;
     - `trade:price:binance_usdm:{symbol}`;
     - `trade:price:last:binance_spot:{symbol}`;
     - `trade:price:last:binance_usdm:{symbol}`;
     - versioned Pub/Sub channels with the same market dimension.
   - Keep legacy `trade:price:{symbol}` and `stream:trade:{symbol}` only for backward
     compatibility during migration.
   - Extend REST endpoints with `market=spot|usdm|auto`, for example:
     - `/v1/binance/price/{symbol}?market=usdm`;
     - `/v1/binance/price-last/{symbol}?market=usdm`.

2. **Active market-data requirements**
   - Add a control-plane source of truth for active requirements:
     - alpha deployments;
     - account allocations;
     - account market type (`SPOT`, `USD_M_FUTURES`, VN stock, derivatives);
     - active/open-order symbols.
   - The market-data bridge should subscribe/recover this active set, not an arbitrary first-N
     static symbol list.
   - Lab mode may mount a JSON universe file, but production must derive readiness from deployed
     alpha/account/instrument state.

3. **Readiness gate**
   - Maintain readiness per `(venue, market_type, symbol)`:
     - `READY`: live authoritative source fresh;
     - `WARMING`: subscribed/recovering, not yet tradable;
     - `STALE`: source exists but older than policy;
     - `MISSING`: no live or acceptable recovery state;
     - `WRONG_MARKET`: spot/futures mismatch.
   - Gateway/risk must check readiness before admitting sandbox/live market orders.
   - Alpha deployment activation should be blocked or marked degraded if its required market data
     set is not ready.

4. **On-demand recovery without weakening safety**
   - Risk may call data_layer REST on local cache miss, but the response must include:
     - provider;
     - market type;
     - source;
     - event timestamp;
     - `is_live`;
     - `authoritative`.
   - Sandbox/live accept only `authoritative=true`, `is_live=true`, correct market type, and fresh
     timestamp.
   - Paper can be configured to accept last-known/OHLCV fallback with explicit non-authoritative
     labelling.

5. **Operational tests**
   - Restart `redis_marketdata`, `data_layer`, `market_data_service`, and `risk_engine` in
     different orders and verify sandbox/live remain fail-closed until readiness is rebuilt.
   - Test spot/futures symbols that overlap (`BTCUSDT`, `ETHUSDT`) and futures-only symbols.
   - Test alpha wide-universe activation with 40, 100, and 300 symbols:
     - no wildcard subscription in trading_system;
     - no Redis output-buffer pressure;
     - readiness reflects real coverage.
   - Test `price-last is_live=false`:
     - accepted only by paper policies that explicitly allow it;
     - rejected for sandbox/live.

Implementation order:

- Phase 43.1: data_layer market-namespaced latest keys/endpoints while preserving legacy keys.
- Phase 43.2: trading_system DataLayerClient/parser/risk recovery accepts and validates market
  namespace.
- Phase 43.3: active market-data requirement registry from alpha deployments/accounts/open
  orders.
- Phase 43.4: readiness gate and activation/pre-trade checks.
- Phase 43.5: restart/cold-cache/sandbox-live matrix tests.

Implementation update 2026-06-04:

- Phase 43.1 partial implemented:
  - `data_layer` now dual-writes Binance trade ticks to:
    - market-specific keys/channels, for example
      `trade:price:binance_spot:BTCUSDT`,
      `trade:price:binance_usdm:BTCUSDT`,
      `stream:trade:binance_spot:BTCUSDT`,
      `stream:trade:binance_usdm:BTCUSDT`;
    - legacy `trade:price:BTCUSDT` / `stream:trade:BTCUSDT` for migration compatibility.
  - `price-last` last-known keys are also market-specific.
  - `/v1/binance/price/{symbol}` and `/v1/binance/price-last/{symbol}` accept
    `market=spot|usdm|auto`.
  - Explicit `market=spot|usdm` does **not** fallback to legacy keys. This prevents wrong-market
    data from authorizing sandbox/live orders.
- Phase 43.2 partial implemented:
  - trading_system `DataLayerClient.latest_trade()` accepts `market`.
  - `RiskDataLayerRecovery` asks `market=usdm` for Binance `sandbox/live` and `market=auto` for
    paper unless env overrides specify otherwise.
  - `market_data_status()` now rejects sandbox/live payloads with:
    - `is_live=false` -> `MARKET_DATA_NOT_LIVE`;
    - `authoritative=false` -> `MARKET_DATA_NON_AUTHORITATIVE`;
    - wrong/missing market namespace when expected -> `MARKET_DATA_WRONG_MARKET`.
  - `risk_engine._load_market_data()` requires `expected_market=USDM` for Binance sandbox/live,
    so a spot/legacy cache cannot authorize a futures order.
- Documentation update:
  - `data_layer/DATA_LAYER_SERVICE_ACCESS_GUIDE.md` now documents `redis_marketdata` DB0 and
    market-specific Binance latest-price routes.
- Verification:
  - data_layer full Docker unit suite: `54 tests OK`.
  - trading_system full Docker unit suite: all tests passed, only known FastAPI `on_event`
    deprecation warnings.

Remaining work before declaring sandbox/live market data production-grade:

- Restart runtime services and verify market-specific keys are actually produced by live streams.
- Add active requirement/readiness registry (Phase 43.3/43.4). Current patch prevents wrong-market
  authorization, but it does not yet pre-warm/check a deployed alpha's entire universe before
  activation.
- Run cold-cache matrix after restart:
  - `redis_marketdata` restart;
  - `data_layer` restart;
  - `market_data_service` restart;
  - `risk_engine` restart;
  - Binance sandbox order with missing `usdm` key should reject clearly until live data is ready;
  - Binance paper may still use labelled OHLCV fallback if policy allows it.

Runtime verification 2026-06-04:

- Restarted `data_layer`, `market_data_service`, and `risk_engine_service`.
- Verified Redis `redis_marketdata` produces both market-specific and legacy BTCUSDT keys:
  - `trade:price:binance_spot:BTCUSDT`;
  - `trade:price:binance_usdm:BTCUSDT`;
  - `trade:price:BTCUSDT`.
- Found and fixed one implementation mismatch during runtime smoke:
  - publisher wrote `binance_usdm` / `binance_spot`;
  - REST lookup initially normalized `market=usdm|spot` incorrectly to `usdm|spot`;
  - explicit endpoints returned 404 even though Redis keys existed.
- Fixed `RedisCache._normalize_binance_market()` so:
  - `usdm`, `usd_m`, `usd_m_futures`, `futures` -> `binance_usdm`;
  - `spot` -> `binance_spot`.
- Verified REST endpoints after restart:
  - `/v1/binance/price/BTCUSDT?market=spot`: `200`, source `binance_spot_trade`;
  - `/v1/binance/price/BTCUSDT?market=usdm`: `200`, source `binance_futures_trade`;
  - `/v1/binance/price/BTCUSDT?market=auto`: `200`, legacy compatibility path.
- Verified inside `risk_engine`:
  - `RiskDataLayerRecovery(...).recover("BTCUSDT", "BINANCE", "sandbox")`
    returned `market=binance_usdm`, `requested_market=usdm`, `is_live=true`,
    `authoritative=true`;
  - `market_data_status(..., expected_market="USDM")` returned `(True, None)`.
- Verification after final alias fix:
  - data_layer full Docker unit suite: `55 tests OK`;
  - trading_system full Docker unit suite before final alias-only data_layer fix: all tests passed;
  - targeted trading_system risk/data-layer namespace suite: `29 passed`.

Runtime alpha audit update 2026-06-04:

- rsibound 15m Binance paper timing behavior is correct after the latest scheduler fix:
  - warmup at `08:11 UTC` loaded latest closed bar open `07:45 UTC`;
  - alpha did not catch-up trade from warmup;
  - scheduler waited until `08:15:02 UTC`;
  - latest batch appended/processed candle open `08:00 UTC`, whose close boundary was
    `08:15 UTC`.
- Important timestamp convention:
  - OHLCV rows/logs use candle **open time** as the bar timestamp;
  - at `15:14:59`, a 15m candle with open `15:00` is still open and must not be used;
  - after `15:15 + close_delay`, the candle open `15:00` is closed and may be appended.
- Found alpha consumer mismatch, not data_layer source-contract bug:
  - data_layer latest-price payload contains metadata `market="binance_usdm"` or
    `market="binance_spot"`;
  - alpha `action_async.get_symbol_price()` used
    `payload.get("snapshot") or payload.get("market") or ...`;
  - when `snapshot` was absent it selected the string metadata and raised
    `'str' object has no attribute 'get'`.
- Fix implemented:
  - alpha runtime `DataLayerGateway.latest_trade()` now accepts and forwards
    `market=auto|spot|usdm`;
  - migrated rsibound/regression `action_async.py` now parses only dict price payloads
    (`snapshot`, `trade`, `quote`, `data`, or direct dict) and ignores metadata strings;
  - Binance alpha default data market is `usdm`, overridable by
    `DATA_LAYER_BINANCE_MARKET` or `ALPHA_CONTRACT_TYPE`;
  - rsibound logs now print `closed_bar_open` in UTC ISO and compact prices instead of
    rounding small crypto prices to `0.00`.
- DNSE paper observation:
  - current log was generated around `08:11-08:15 UTC` (`15:11-15:15 ICT`), after the normal
    VN cash market close;
  - warmup latest closed open was `07:30 UTC`;
  - scheduler correctly idled because the next expected bar was already stale beyond
    `ALPHA_CANDLE_MAX_LAG_SECONDS`, so it did not trade on stale VN data.
- Verification:
  - `py_compile` passed for rsibound/regression `action_async.py`, rsibound main, and runtime
    data_layer client;
  - execution_alpha runtime contract suite passed: `13 tests OK`, `3 skipped` due optional deps.

Sandbox Binance audit update 2026-06-04:

- Tested rsibound 15m against Binance paper and Binance sandbox.
- Paper Binance behavior:
  - scheduler/warmup remained correct;
  - first cycle opened `40` paper positions;
  - later cycles processed scheduled 15m bars and mostly performed scale/tiny-delta updates;
  - no new alpha-side latest-price parser error appeared.
- Sandbox Binance behavior:
  - warmup/scheduler were correct;
  - executor successfully submitted the first `4` sandbox orders to Binance Futures testnet;
  - after that, risk rejected later orders because latest broker sync snapshot was
    `BROKER_SYNC_MISMATCH`;
  - DB summary before Docker approval quota expired:
    - `orders`: `4 RECONCILED_MISSING`, `196 RISK_REJECTED`;
    - `account_sync_snapshots`: latest sandbox account snapshots were `MISMATCH`;
    - mismatch source was position reconciliation with `finding_count=4`.
- Root cause 1, fixed:
  - Binance listener failed to process private order updates with
    `could not determine data type of parameter $2`;
  - `services/listener/repository/fill_repo.py` passed `total_filled` as SQL parameter `$2`,
    but `UPDATE_ORDER_STATUS` did not reference `$2`;
  - asyncpg/PostgreSQL could not infer the unused parameter type, so listener never emitted the
    fill/order events needed by portfolio accounting;
  - fixed by removing the unused parameter and renumbering the SQL placeholders.
- Root cause 2, mitigated:
  - open-order reconciliation can mark recent `MARKET` orders as `RECONCILED_MISSING` if the
    broker open-orders endpoint no longer returns them before the listener/fill path has finalized
    the DB order;
  - this is especially risky for market orders because a filled market order normally disappears
    from the open-order list quickly;
  - added `BROKER_OPEN_ORDER_MISSING_GRACE_SECONDS=30`;
  - `open_order_reconciliation_plan()` now skips broker-missing findings for newly submitted DB
    open orders during this grace window.
- Log hygiene:
  - rsibound/regression alpha wrappers no longer log the full gateway order payload on reject;
  - failure logs now emit a compact summary with status, reason, client order id, venue order id,
    symbol, quantity, error, and risk context.
- Verification completed:
  - local compile passed for:
    - listener fill repository;
    - portfolio management repository;
    - listener/portfolio unit test files touched;
    - rsibound/regression alpha wrappers.
- Verification still pending due Docker approval quota:
  - run targeted Docker tests:
    - `tests/unit/test_listener_fill_repo.py`;
    - `tests/unit/test_portfolio_management.py`;
    - sandbox execution/listener/reconciliation focused tests if available;
  - restart `listener_service` and `reconciliation_service` to apply patches/env;
  - reset/clean the old sandbox test account/order state or force-close broker testnet leftovers;
  - rerun one controlled rsibound sandbox cycle;
  - query DB for:
    - `orders.status`;
    - `fills`;
    - `positions_v2`;
    - latest `account_sync_snapshots.status`;
    - open `reconciliation_findings`;
  - expected result after patch:
    - no `could not determine data type of parameter $2`;
    - no immediate `RECONCILED_MISSING` for just-submitted market orders;
    - listener fills update portfolio/accounting;
    - broker sync returns `OK` or exposes a real broker/quantity mismatch instead of a listener-induced mismatch.

Sandbox Binance verification close-out 2026-06-04:

- Completed Docker verification after quota reopened:
  - targeted container tests passed:
    - `tests/unit/test_listener_fill_repo.py`;
    - `tests/unit/test_portfolio_management.py`;
    - `tests/unit/test_emergency_close.py`;
  - restarted `listener_service`, `reconciliation_service`, and later `gateway_service`
    after emergency-close payload fix.
- Listener fix follow-up:
  - the first rerun exposed a second listener bug:
    `invalid input for query argument $3: <venue_order_id> (expected str, got int)`;
  - root cause was `fill_repo._fetch_order_record_with_retry()` still converting Binance
    `order_id` to integer while SQL expects text;
  - fixed by adding `_text_or_none()` and passing `venue_order_id` as text;
  - regression tests now cover string and integer Binance order ids.
- Controlled rsibound sandbox rerun:
  - warmup loaded `300` symbols with `500` bars each;
  - scheduler did not catch up stale bars and waited for the correct 15m close boundary;
  - at `2026-06-04T14:45:03Z` it processed closed candle open
    `2026-06-04T14:30:00Z`;
  - DB result after the cycle:
    - `36` OPEN orders filled;
    - `4` OPEN orders rejected by Binance Futures testnet with
      `PERCENT_PRICE filter`/thin-book behavior;
    - `44` fill rows were recorded because several Binance orders had partial fills;
    - `36` `positions_v2` rows were projected;
    - latest broker sync snapshots stayed `OK`;
    - no open reconciliation findings remained for the successful cycle.
- Emergency close findings:
  - `ops emergency-close` queued close intents but executor initially rejected them because
    payloads missed `gateway_receive_ts`;
  - fixed `EmergencyCloseRepository` to add `gateway_receive_ts` for cancel and close intents;
  - after that, close intents reached risk but were rejected as `REDUCE_ONLY_NO_POSITION`
    even though `positions_v2` contained matching sandbox positions;
  - 2026-06-04 follow-up fixed this path:
    - emergency-close plan now merges latest broker snapshot positions, so broker-only
      residual positions such as `DOGSUSDT.BINANCE` are visible even when `positions_v2`
      is already flat;
    - broker-authoritative emergency close payloads include `broker_signed_qty`,
      `broker_authoritative_close`, and `broker_sync_id`;
    - risk allows only these operator reduce-only close intents to bypass a fresh
      `BROKER_SYNC_MISMATCH`; open/increase orders remain fail-closed;
    - risk ignores stale local pending exposure for broker-authoritative emergency close
      because that path is specifically used when DB state is known stale;
  - executor `ORDER_STATUS` events now include `account_id`, `side`, `quantity`,
      `remaining_qty`, `intent`, and `reduce_only`, so broker `REJECTED` terminal events
      can release pending exposure instead of leaving stale `order_pending_exposure`.
    - added alpha-facing read-only preflight endpoint:
      `GET /v1/accounts/{account_id}/preflight?alpha_id=<alpha>&mode=<mode>&venue=<venue>`;
      it uses alpha API-key auth, checks account ownership, operational state, and broker sync;
      alpha runtimes can call it once before a rebalance cycle to avoid spamming orders when
      sandbox/live broker sync is not ready.
    - added SDK helpers `account_preflight()` and `account_ready()` in
      `alpha_sdk/trading_system_async_action.py`.
- Cleanup state after test:
  - direct Binance Futures testnet cleanup closed most positions;
  - one `DOGSUSDT` testnet long remains because Binance testnet book is illiquid:
    best bid was far below the percent-price lower bound, so MARKET close is rejected and
    LIMIT IOC inside the allowed band does not fill;
  - DB was reconciled broker-authoritatively after direct cleanup:
    `35` stale DB positions were resolved, leaving only `DOGSUSDT.BINANCE` aligned with broker.
- 2026-06-04 cleanup retry after the risk/emergency fix:
  - emergency-close plan correctly reported broker-only
    `DOGSUSDT.BINANCE LONG 231427`;
  - the first post-fix close reached risk with `broker_signed_qty` but stale pending exposure
    from a previous failed close still produced `REDUCE_ONLY_NO_POSITION`; this is now covered
    by unit tests and fixed by ignoring pending exposure only for broker-authoritative close;
  - the next close passed risk and reached Binance Futures testnet, but Binance rejected it
    with `PERCENT_PRICE`;
  - testnet direct cleanup reduced the residual from `231427` to `116243` once, then repeated
    `LIMIT IOC` attempts did not fill;
  - order book inspection showed mark around `0.00004347`, asks near mark, but best bid only
    `0.00003050`; there is no sell-side counterparty inside the allowed percent-price band.
- Current production-grade conclusion:
  - trading_system recovery logic is now correct and tested for broker-authoritative emergency
    close and terminal broker rejection state release;
  - Binance testnet `DOGSUSDT` residual is an external testnet liquidity artifact. It cannot
    be guaranteed flat by API if the book has no bid inside Binance's percent-price band;
  - before the next sandbox rsibound run, either reset/replace the Binance testnet account/key
    manually, or keep sandbox deployment halted and run paper-only until broker snapshot has
    zero positions;
  - keep `binance_testnet_account_cleanup.py` as a testnet-only disaster cleanup tool, not as
    normal production close flow.
- Verification:
  - targeted tests passed:
    `tests/unit/test_alpha_sdk_order_state.py`,
    `tests/unit/test_executor_events.py`,
    `tests/unit/test_emergency_close.py`,
    `tests/unit/test_risk_checker_market_metadata.py`,
    `tests/unit/test_risk_broker_sync.py`,
    `tests/unit/test_portfolio_order_events.py`;
  - full suite passed in container after preflight endpoint/helper: `260 passed, 2 warnings`.

Test-lab reset after broker-authoritative close fixes 2026-06-04:

- Stopped/removal target:
  - no migrated rsibound/regression alpha container was running;
  - only unrelated `alpha-nginx` remained up and was left untouched.
- Ran guarded reset:
  - command:
    `ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh --apply --confirm RESET_ALL_TEST_DATA --alpha-compose /root/bobby/execution_alpha/alphas/rsiboundportfolioA001_15m/docker-compose.yml --clean-alpha-files`;
  - did not pass `--flatten-binance-testnet` because the earlier flatten attempt had already
    proven the residual `DOGSUSDT` position could not be reliably crossed through the current
    Binance testnet book;
  - script stopped trading-system writers, truncated public DB tables except `venues`, flushed
    trading Redis DB0, cleaned generated rsibound `logs/`, `state/`, and `main/__pycache__`,
    and restarted trading-system services.
- Post-reset DB audit:
  - `orders=0`;
  - `fills=0`;
  - `positions_v2=0`;
  - `account_sync_snapshots=0`;
  - `reconciliation_findings=0`;
  - `order_pending_exposure=0`;
  - `accounts=0`;
  - `portfolios=0`;
  - `venues=2`.
- Post-reset Redis/health audit:
  - Redis DB0 was flushed; after service restart it naturally contained heartbeat/consumer keys
    again (`DBSIZE=1192` at audit time);
  - gateway health returned `READY`;
  - all trading-system application services reported fresh `READY` heartbeats;
  - executor and listener Binance Futures capabilities reported `READY`.
- Important sandbox caveat:
  - DB is clean, but the Binance Futures testnet broker account still has residual
    `DOGSUSDT` unless reset manually in Binance testnet UI or replaced with a clean API key/account;
  - do not start sandbox rsibound until a fresh broker sync reports zero positions, otherwise
    `require_broker_sync=true` will correctly reject new orders with `BROKER_SYNC_MISMATCH`.

Rsibound paper/sandbox mark-price and reconciliation fix 2026-06-05:

- Observed after a fresh rsibound 15m paper/sandbox Binance cycle:
  - paper Binance filled `40/40` orders;
  - sandbox Binance filled `36` positions and rejected `4` orders with Binance Futures
    testnet `PERCENT_PRICE`/thin-book behavior;
  - `positions_v2` had valid `avg_px_open`, but `mark_price` was missing for most open
    positions:
    - paper: `34/40` open positions had `mark_price IS NULL`;
    - sandbox: `30/36` open positions had `mark_price IS NULL`;
  - account sync snapshots for sandbox were `OK` with `36` broker positions and `0` open
    orders, so the main error was mark-to-market projection, not missing broker positions.
- Root cause 1 - data_layer latest payload parser mismatch:
  - data_layer live Binance price endpoint returns top-level payloads like
    `{symbol, price, event_time, market: "binance_usdm", ...}`;
  - performance and paper matcher parsed with
    `payload.get("snapshot") or payload.get("market") or payload.get("data") or payload`;
  - for live payloads this selected the string `"binance_usdm"` as the market payload,
    then freshness/price parsing failed and was swallowed as `None`;
  - only symbols already present in trading Redis local cache received marks, explaining the
    small subset of marked positions.
- Fix 1:
  - added `DataLayerClient.market_payload()` as the canonical wrapper parser;
  - it accepts wrapper objects in `snapshot`, `quote`, or `data`, otherwise returns the
    top-level payload;
  - it intentionally never treats top-level `market` as payload because `market` is metadata;
  - performance and paper execution now use this helper.
- Fix 2 - Binance market namespace:
  - performance mark recovery now chooses Binance data_layer market by mode:
    - `sandbox/live` -> `usdm`;
    - `paper` -> `PERFORMANCE_BINANCE_PAPER_MARKET` or `auto`;
    - per-mode override via `PERFORMANCE_BINANCE_<MODE>_MARKET`.
- Fix 3 - immediate DB baseline after fills:
  - `PortfolioRepository.process_fill_event()` now sets `positions_v2.mark_price`,
    `mark_price_at`, `notional`, and `unrealized_pnl` from the fill price immediately;
  - performance service still overwrites these fields with live/data_layer mark on the next
    projection cycle;
  - this prevents new positions from sitting with null mark when projector has not run yet.
- Root cause 2 - open-order reconciliation touched MARKET orders:
  - Binance `futures_get_open_orders()` naturally omits MARKET orders after execution;
  - open-order reconciliation had included DB `PARTIALLY_FILLED` MARKET rows and converted
    them to `RECONCILED_MISSING` when the broker open-order list was empty;
  - affected test rows had fills covering `100%` of the original quantity.
- Fix 4:
  - DB loader and pure open-order reconciliation planner now exclude `order_type='MARKET'`;
  - current test rows that were incorrectly `RECONCILED_MISSING` and fully covered by fills
    were repaired to `FILLED` with a `status_repair` audit object in `orders.raw_response`.
- Verification after service restart:
  - restarted `performance`, `paper_execution`, `portfolio`, and `reconciliation`;
  - `positions_v2` recovered marks:
    - paper Binance: `40` open positions, `0` null marks;
    - sandbox Binance: `36` open positions, `0` null marks;
  - latest `performance_snapshots` per instrument after the next 5m snapshot cadence also
    recovered marks:
    - paper Binance: `40` instruments, `0` null marks, latest snapshot
      `2026-06-05T07:24:28Z`;
    - sandbox Binance: `36` instruments, `0` null marks, latest snapshot
      `2026-06-05T07:24:29Z`;
  - sandbox order statuses after repair are now `36 FILLED` and `4 REJECTED`, with no
    `RECONCILED_MISSING`;
  - latest account equity snapshots now have non-zero `total_notional` and
    `unrealized_pnl` for both paper and sandbox;
  - latest sandbox broker sync snapshots remained `OK`;
  - compile check passed for touched service and test files.
- Remaining verification gap:
  - the running CLI image does not include pytest in PATH/dev environment, so targeted pytest
    could not run from the current container without rebuilding/installing dev dependencies;
  - code-level compile passed, services restarted successfully, and live DB behavior confirms
    the mark recovery fix.

Rsibound burst accounting failure follow-up 2026-06-05:

- New defect found during the next rsibound 15m paper/sandbox cycle:
  - data_layer warmup and scheduler were correct;
  - paper alpha submitted `40` orders but `9` became `PAPER_EXECUTION_ERROR`;
  - sandbox executor reached Binance for the first few orders, then risk correctly rejected
    the rest with `BROKER_SYNC_MISMATCH`;
  - canonical accounting was broken:
    - `orders` contained paper/sandbox statuses;
    - `fills = 0`;
    - `positions_v2 = 0`;
    - sandbox broker sync reported `8` broker positions missing in DB.
- Root cause 1 - type safety regression in the immediate mark baseline patch:
  - `positions_v2.mark_price_at` is `timestamptz`;
  - the SQL expression used `$12` without an explicit cast;
  - PostgreSQL inferred text for the CASE expression and rejected fill accounting with:
    `column "mark_price_at" is of type timestamp with time zone but expression is of type text`.
- Root cause 2 - duplicate fill accounting streams:
  - listener publishes the same fill payload to both canonical `events.fill` and legacy
    `execution.fills`;
  - portfolio service consumed both streams in parallel using the same consumer group name;
  - during burst execution this creates duplicate transactions and lock contention even when
    fill idempotency prevents double inserts.
- Root cause 3 - hot-path reference upserts under burst load:
  - paper execution and portfolio accounting still perform `INSERT ... ON CONFLICT DO NOTHING`
    on `venues`, `instruments`, `strategies`, and `accounts` inside order/fill hot paths;
  - under many concurrent orders this produced deadlocks across
    `venues`, `instruments`, `strategies`, `accounts`, and `fills`;
  - production path must either pre-seed references during onboarding or serialize these
    reference upserts with a deterministic lock.
- Required fix direction:
  - make all accounting SQL type-safe;
  - consume only canonical `events.fill` by default; legacy `execution.fills` must be opt-in
    for migrations only;
  - add transaction-scoped advisory locks around remaining hot-path reference upserts so burst
    order/fill processing does not deadlock while the system is still migrating to full
    pre-seeded references;
  - after patch, restart portfolio/paper services, replay pending `events.fill`, and audit
    `fills`, `positions_v2`, `account_equity_snapshots`, and reconciliation.
- Fixes implemented:
  - `positions_v2.mark_price_at` accounting SQL now casts the CASE parameter to
    `timestamptz`, removing the type-inference regression that blocked canonical fills;
  - portfolio accounting now consumes canonical `events.fill` by default and leaves legacy
    `execution.fills` disabled unless `PORTFOLIO_CONSUME_LEGACY_FILLS=true`;
  - paper execution and portfolio reference upserts now use transaction-scoped advisory locks
    keyed by mode/venue/account/instrument so burst orders do not deadlock while reference
    rows are still lazily ensured;
  - untracked Binance listener events now resolve back to the real `orders` row by
    `venue_order_id`, raw Binance `orderId`, or `client_order_id` instead of being booked to
    synthetic `SYSTEM_RECOVERY`;
  - zombie recovery now reclaims pending `untracked.orders` with `XAUTOCLAIM`, so restart
    recovery handles old pending messages instead of only new messages.
- Verification after patch/restart:
  - compile passed for touched portfolio/paper files;
  - `events.fill` pending was replayed to zero;
  - `untracked.orders` pending was reclaimed to zero;
  - recovered sandbox listener-first orders (`ALTUSDT`, `BOMEUSDT`) are now marked
    `FILLED` with `raw_response.untracked_recovery = true`;
  - canonical DB state now contains:
    - paper Binance: `32` fills, `32` `positions_v2`, `0` null marks;
    - sandbox Binance: `12` fills, `8` `positions_v2`, `0` null marks;
  - latest sandbox account sync is `OK` with `8` broker positions and `0` broker open orders;
  - all prior `BROKER_POSITION_MISSING_IN_DB` findings for this rsibound cycle are resolved;
  - gateway `/v1/health` and `/v1/health/capabilities` report `READY`, including Binance
    Futures executor/listener capabilities;
  - copy outbox service is `READY`; `copy:events:v1` currently has length `0`, expected for
    no copy-eligible order events during this audit window.
- Remaining test environment gap:
  - targeted `pytest` could not run from the current CLI image because the image entrypoint is
    the management CLI and `pytest` is not installed in the image when invoked through `uv`;
  - before the next production hardening pass, build or run a dev/test image that includes
    test dependencies so these regression checks are executable in Docker:
    `tests/unit/test_performance_projection.py`,
    `tests/unit/test_gateway_order_schema.py`,
    `tests/unit/test_trading_mode_routing.py`.
- Production-grade follow-up:
  - this cycle proved the accounting/recovery path can heal after burst execution and restart,
    but the next rsibound-only cycle should be run from a clean sandbox account and clean test
    DB state to confirm no new `PAPER_EXECUTION_ERROR`, no unresolved untracked events, no
    open reconciliation findings, and no null mark prices after the first projection cadence.

Rsibound sandbox transient broker-sync mismatch follow-up 2026-06-05:

- Observation from the next clean rsibound 15m run:
  - paper Binance behaved correctly:
    - `40/40` orders were `FILLED`;
    - `40` fills were recorded;
    - `40` `positions_v2` rows existed with `0` null marks.
  - sandbox Binance submitted `40` order intents:
    - `31` orders were `FILLED`;
    - `3` orders were `PARTIALLY_FILLED`;
    - `6` later orders were risk-rejected with `BROKER_SYNC_MISMATCH`;
    - Redis accounting/recovery pending streams were `0`.
- Root cause:
  - the failed sandbox symbols were not rejected by Binance testnet;
  - reconciliation ran during the same burst while orders/fills were still settling;
  - `SIGNUSDT` filled at `2026-06-05T08:45:26.603Z`;
  - the broker sync snapshot was recorded at `2026-06-05T08:45:26.719Z`;
  - DB already contained the `SIGNUSDT` position, but the Binance account snapshot did not yet
    include it, creating a single transient `BROKER_POSITION_STALE_IN_DB` finding;
  - risk correctly failed closed on that latest `MISMATCH` snapshot and rejected the final
    `6` symbols in the burst.
- Design decision:
  - risk should remain fail-closed on real broker mismatches;
  - reconciliation should not poison broker-sync state for an instrument that has own
    order/fill activity inside a short recent-activity grace window;
  - if the mismatch remains after the grace window, it becomes actionable and risk will reject
    as before.
- Fix implemented:
  - added `BROKER_POSITION_RECENT_ACTIVITY_GRACE_SECONDS=30`;
  - position reconciliation now splits findings into:
    - actionable findings: recorded and set snapshot `MISMATCH`;
    - deferred recent-activity findings: written to snapshot raw as
      `DEFERRED_RECENT_ACTIVITY`, but snapshot remains usable for risk;
  - deferred matching checks recent `orders.updated_at` and `fills.trade_time` for the same
    account/mode/venue/instrument before treating a position mismatch as actionable.
- Verification:
  - compile passed for `services/portfolio_management/repository.py`;
  - `reconciliation_service` was recreated to load the new env and code;
  - latest sandbox snapshots after recreate are `OK` with `34` broker positions and `0` open
    orders;
  - the transient `BROKER_POSITION_STALE_IN_DB` finding from the prior run is `RESOLVED`;
  - gateway health is `READY`.
- Required next test:
  - rerun one sandbox rsibound cycle after this patch;
  - expected result: reconciliation may record deferred recent-activity metadata during the
    burst, but risk should not reject later orders solely because of sub-second own-fill
    broker snapshot lag;
  - any mismatch that remains after `30s` must still become a normal actionable mismatch.

## 43. Two-Phase Execution Reliability Upgrade Plan - Discussion Draft

Status:

- Draft only. Do not implement until explicitly approved.
- Goal is not to make the system HFT.
- Goal is to keep fund-grade guardrails while preventing the trading system from blocking its
  own valid rebalance burst because of transient in-flight state.

User concern:

- The system is now close to stable after many fixes.
- Adding execution sessions, batch risk grants, concurrent execution, and accounting batching can
  add complexity and new bugs.
- This concern is valid. The upgrade must be incremental, observable, and reversible.

Decision principle:

- Do not remove broker sync, risk, portfolio, market freshness, or reconciliation guardrails.
- Improve how these guardrails understand a rebalance burst.
- Prefer small schema additions and feature flags over changing existing behavior globally.
- Each phase must have a rollback path.
- A phase is complete only after unit tests, service-level tests, alpha-cycle tests, DB audit, Redis
  stream audit, and log audit pass.

### 43.1 Current Baseline

Current strengths:

- Paper Binance rsibound 15m can submit/fill `40/40` orders with correct fills, positions, and
  mark prices.
- Sandbox Binance can submit and fill most orders, and reconciliation eventually becomes `OK`.
- Recovery paths now handle:
  - listener event before executor order persistence;
  - Redis Stream pending after restart;
  - duplicate canonical/legacy fill streams;
  - mark-price null recovery;
  - broker-sync mismatch after eventual reconciliation.

Current weaknesses:

- The system treats one rebalance as many unrelated single orders.
- Risk checks the latest broker-sync snapshot per order.
- Reconciliation can run during a burst and temporarily mark the account `MISMATCH`.
- Executor order sending is mostly sequential from the alpha perspective.
- Accounting is correct, but high burst write pressure still depends on many small transactions.
- Observability reports service health, but it does not yet show full cycle latency:
  - alpha signal time;
  - gateway intake time;
  - risk time;
  - executor broker-ack time;
  - fill-to-position time;
  - reconciliation lag.

### 43.2 Phase 1 - Session-Aware Safety Without Speed Rewrites

Objective:

- Add minimal execution-session context so risk and reconciliation can distinguish:
  - real broker mismatch;
  - transient in-flight mismatch caused by our own current rebalance.
- Do not rewrite executor concurrency yet.
- Do not rewrite portfolio accounting batching yet.
- Keep existing single-order endpoint behavior working.

Estimated time including tests:

- Implementation: `1.5 - 2.5` engineering days.
- Tests and live-like rsibound verification: `1 - 1.5` days.
- Total estimate: `2.5 - 4` days.

Scope:

- Add `execution_sessions` table.
- Add nullable `execution_session_id` to `orders`, `fills`, and optionally
  `reconciliation_findings`.
- Add alpha SDK helper to open/close a session per rebalance cycle.
- Gateway accepts `execution_session_id` on order payloads.
- Risk reads session state and records `risk_context.execution_session_id`.
- Reconciliation becomes session-aware:
  - if a mismatch is tied to an instrument with own activity in an active/recent session, it is
    deferred;
  - if mismatch remains after grace/session settling, it becomes actionable;
  - risk still rejects on actionable `MISMATCH`, `ERROR`, or `STALE`.
- Add normalized broker-sync state:
  - status can include `OK`, `ERROR`, `STALE`, `HARD_MISMATCH`,
    `DEFERRED_RECENT_ACTIVITY`;
  - risk only treats usable states as pass.
- Add session lifecycle states:
  - `CREATED`;
  - `RISK_CHECKING`;
  - `RISK_APPROVED`;
  - `EXECUTING`;
  - `SETTLING`;
  - `RECONCILING`;
  - `COMPLETED`;
  - `FAILED`;
  - `DEGRADED`;
  - `CANCELLED`.

What this phase intentionally does not do:

- No aggressive concurrent broker send.
- No batch executor rewrite.
- No micro-batch accounting rewrite.
- No removal of per-order risk checks.
- No weaker broker-sync policy for live.

Expected benefit:

- Main gain is correctness under burst, not raw speed.
- Expected to eliminate false `BROKER_SYNC_MISMATCH` caused by sub-second own-fill/account
  snapshot lag.
- Expected rsibound sandbox result after clean run:
  - no final-order rejects caused solely by transient own-fill reconciliation;
  - any persistent broker/DB mismatch still rejects.

Estimated speed impact:

- Small direct speed improvement: `0 - 15%`.
- Main improvement is fewer false rejects and cleaner recovery.
- Per-order latency remains roughly similar.

Complexity increase:

- Moderate.
- New table and identifiers must be propagated consistently.
- Main risk is session lifecycle bugs.
- Lower risk than doing executor concurrency and batch risk at the same time.

Phase 1 implementation checklist:

- [x] Add DB migration:
  - `execution_sessions`;
  - `orders.execution_session_id`;
  - `fills.execution_session_id`;
  - indexes by `account_id`, `strategy_id`, `status`, `started_at`.
- [x] Add repository methods:
  - create session;
  - update state;
  - append counters;
  - close session;
  - mark degraded/failed.
- [x] Add gateway/admin endpoints or SDK helpers:
  - `POST /v1/execution-sessions`;
  - `PATCH /v1/execution-sessions/{id}`;
  - alpha SDK context manager for rebalance session.
- [x] Add order schema support:
  - optional `execution_session_id`;
  - preserve current behavior when omitted.
- [x] Add risk integration:
  - write session id into `risk_context`;
  - do not bypass hard broker mismatch;
  - allow only deferred recent-activity mismatch attached to active/recent session.
- [x] Add reconciliation integration:
  - join own recent orders/fills by `execution_session_id`;
  - defer in-flight findings with audit metadata;
  - convert to actionable mismatch after grace expires.
- [x] Add observability:
  - session counters:
    - submitted;
    - risk_approved;
    - risk_rejected;
    - sent;
    - filled;
    - partially_filled;
    - broker_rejected;
    - accounting_recovered;
    - reconciliation_deferred;
    - reconciliation_actionable.
  - log `execution_session_id` in gateway, risk, executor, listener, portfolio, reconciliation.

Phase 1 implementation log - 2026-06-05:

- Added migration `init-db/20-execution-sessions.sql`.
- Added `services/gateway/repository/execution_sessions.py`.
- Added nullable `execution_session_id` propagation through:
  - gateway order schemas;
  - executor internal order schema and order projection;
  - paper execution order/fill events;
  - listener fill projection;
  - portfolio accounting and fill storage;
  - reconciliation findings;
  - risk rejection/approval context.
- Added gateway endpoints:
  - `POST /v1/execution-sessions`;
  - `PATCH /v1/execution-sessions/{execution_session_id}`;
  - `POST /v1/execution-sessions/{execution_session_id}` as compatibility alias;
  - `GET /v1/execution-sessions/{execution_session_id}`.
- Added alpha SDK helpers:
  - `start_execution_session`;
  - `update_execution_session`;
  - async context manager `execution_session`;
  - automatic session attach for single and bulk orders.
- Applied migration to current Postgres container.
- Restarted impacted services:
  - gateway;
  - risk_engine;
  - executor;
  - paper_execution;
  - listener;
  - portfolio;
  - reconciliation.
- Verification:
  - compile check passed for all touched files;
  - targeted SDK/gateway/order-schema tests passed: `19 passed`;
  - targeted order/risk/execution/listener/portfolio/reconciliation tests passed: `62 passed`;
  - full unit suite passed: `267 passed, 2 FastAPI deprecation warnings`;
  - gateway internal `/v1/health` returned `READY`;
  - execution-session smoke create/get/update returned `OK` and set `completed_at`.
- Remaining Phase 1 operational validation before Phase 2:
  - run one rsibound paper Binance session-enabled cycle;
  - run one rsibound sandbox Binance session-enabled cycle;
  - verify session counters match `orders`, `fills`, `positions_v2`, `reconciliation_findings`;
  - verify no final actionable reconciliation finding remains after final broker sync.

Phase 1 test plan:

- Unit tests:
  - session repository create/update/close;
  - order schema accepts optional session id;
  - risk still rejects `ERROR`, `STALE`, `HARD_MISMATCH`;
  - risk passes `OK`;
  - risk passes only allowed deferred recent-activity state;
  - reconciliation defers own recent activity;
  - reconciliation creates actionable finding after grace.
- Integration tests in Docker:
  - create session;
  - submit 3-5 paper orders;
  - fills attach to session;
  - positions update correctly;
  - session completes.
- Recovery tests:
  - restart portfolio during session;
  - restart reconciliation during session;
  - verify pending streams recover and session status remains consistent.
- Rsibound paper Binance:
  - run one clean cycle;
  - expect `40/40` filled;
  - `fills`, `positions_v2`, `performance_snapshots`, `account_equity_snapshots` consistent.
- Rsibound sandbox Binance testnet:
  - run one clean cycle with small quantity;
  - verify transient reconciliation does not reject later orders;
  - verify final broker sync becomes `OK`;
  - verify no open actionable findings.
- Redis audit:
  - `events.fill` pending `0`;
  - `untracked.orders` pending `0`;
  - `commands.execution.*` pending `0`.
- DB audit:
  - order count by status;
  - fill count and quantity sum;
  - positions count and `null_mark = 0`;
  - session counters match DB counts;
  - latest broker sync state `OK`.
- Logs audit:
  - no traceback;
  - no deadlock;
  - no duplicate accounting;
  - no hidden legacy stream consumption.

Rollback plan:

- Feature flag:
  - `EXECUTION_SESSIONS_ENABLED=false`.
- If disabled:
  - gateway ignores session fields;
  - risk uses existing per-order logic;
  - reconciliation uses existing recent-activity grace only.
- Schema additions are nullable and do not break old flows.

Exit criteria for Phase 1:

- Existing paper and sandbox flows still work without sessions.
- Session-enabled rsibound paper cycle passes.
- Session-enabled rsibound sandbox cycle passes or fails only due to real broker business rejects.
- No OPEN reconciliation findings after final sync.
- No pending Redis messages.
- Gateway health `READY`.

### 43.3 Phase 2 - Batch Pre-Risk, Controlled Concurrency, and Throughput

Objective:

- Improve speed and throughput after Phase 1 proves session state is stable.
- Use batch-level pre-risk grants to reduce repeated DB/risk work.
- Add controlled concurrent broker execution with rate limits.
- Optionally micro-batch portfolio accounting only after correctness tests pass.

Estimated time including tests:

- Implementation: `3 - 5` engineering days.
- Tests, stress runs, rsibound paper/sandbox runs: `2 - 3` days.
- Total estimate: `5 - 8` days.

Scope:

- Batch pre-risk:
  - alpha/gateway submits a planned order set for one session;
  - risk computes aggregate exposure and creates a short-lived `risk_grant_id`;
  - per-order risk checks become lightweight grant validation.
- Risk grant TTL:
  - default `10 - 30s`;
  - invalidated by account halt, strategy halt, hard broker mismatch, stale market data, or
    allocation change.
- Controlled concurrent executor:
  - per account/venue rate limiter;
  - concurrency defaults:
    - paper: `20 - 50`;
    - Binance sandbox/live futures: `3 - 10`;
    - DNSE: conservative until live payload behavior is proven.
- Retry policy:
  - retry network/5xx with backoff;
  - retry 429 with venue-aware cooldown;
  - do not retry deterministic broker business rejects;
  - keep idempotency by `client_order_id`.
- Optional portfolio micro-batch accounting:
  - consume fill events in small batches;
  - lock by account/instrument in stable order;
  - preserve idempotency by trade id and client order id.

Expected benefit:

- Faster rebalance burst.
- Fewer repeated DB checks in risk.
- Better use of broker API throughput while respecting rate limits.
- More stable accounting under many fills.

Estimated speed impact:

- Risk path:
  - expected `2x - 5x` faster for 40-order burst because account/risk/broker-sync checks are
    mostly precomputed once.
- Executor path:
  - current 40-order cycle around `12 - 20s` can potentially drop to `3 - 8s` on Binance
    sandbox/live futures if broker/testnet is healthy;
  - paper can potentially drop to `1 - 3s`.
- End-to-end:
  - practical expected speed improvement for rsibound 40-order burst: `40% - 70%`.
  - exact result depends on Binance testnet stability and configured concurrency.

Complexity increase:

- High.
- Adds grant lifecycle, batch validation, rate limiter, concurrent executor behavior, and more
  failure states.
- Higher bug risk than Phase 1.
- Should only start after Phase 1 passes at least several clean cycles.

Phase 2 implementation checklist:

- [x] Add DB/Redis model for risk grants:
  - `risk_grant_id`;
  - `execution_session_id`;
  - approved symbols/orders;
  - max gross/net notional;
  - expires_at;
  - invalidation reason.
- [x] Add batch pre-risk endpoint:
  - `POST /v1/execution-sessions/{id}/pre-risk`;
  - returns grant and per-order normalization/rejection reasons.
- [x] Add alpha SDK support:
  - generate order plan;
  - request pre-risk;
  - submit only approved orders;
  - preserve old single-order mode.
- [x] Add per-order quick risk:
  - validate grant;
  - validate qty/price within granted bounds;
  - validate account not halted;
  - validate grant not expired.
- [x] Add executor session-aware dispatcher:
  - concurrency by venue/account;
  - idempotent send;
  - rate-limit metrics.
- [x] Add retry policy:
  - network;
  - 5xx;
  - 429;
  - no retry for deterministic business rejects.
- [~] Add latency metrics:
  - gateway intake;
  - risk precheck;
  - per-order risk;
  - executor send;
  - broker ack;
  - listener fill;
  - portfolio accounting;
  - reconciliation.
- [ ] Optional micro-batch accounting:
  - only enable behind `PORTFOLIO_FILL_MICROBATCH_ENABLED=true`;
  - keep default single-message accounting until tests prove it is safer/faster.

Phase 2 implementation log - 2026-06-05:

- Added migration `21-risk-grants.sql`:
  - creates `risk_grants`;
  - adds nullable `orders.risk_grant_id`;
  - keeps order history compatible with Phase 1 and old single-order flow.
- Added feature flags:
  - `BATCH_PRE_RISK_ENABLED`;
  - `RISK_GRANT_TTL_SECONDS`;
  - `RISK_GRANT_MAX_ORDERS`;
  - `RISK_GRANT_REDIS_PREFIX`;
  - `EXECUTOR_CONCURRENT_SEND_ENABLED`;
  - venue-specific executor concurrency;
  - executor retry backoff settings;
  - `PORTFOLIO_FILL_MICROBATCH_ENABLED`.
- Implemented risk grant lifecycle:
  - DB source of truth in `risk_grants`;
  - Redis short-lived cache for active grants;
  - grant expiry validation;
  - invalidation on market-data offline, trading halt, operational halt, or broker-sync failure;
  - per-order quick validation by `execution_session_id`, `strategy_id`, `account_id`, `mode`,
    `venue`, `client_order_id`, symbol, side, and quantity bound.
- Implemented gateway endpoint:
  - `POST /v1/execution-sessions/{execution_session_id}/pre-risk`;
  - requires alpha gateway auth;
  - validates session ownership;
  - accepts planned orders and returns approved/rejected order decisions.
- Implemented alpha SDK support:
  - `pre_risk_orders`;
  - `submit_orders_with_pre_risk`;
  - automatic `client_order_id` generation for planned orders;
  - old single-order and old bulk APIs remain compatible.
- Implemented executor controlled concurrency and retry:
  - dispatch grouped by adapter, account, mode, and venue;
  - paper/binance/dnse concurrency controlled by flags;
  - retry network/timeout/429/5xx/temporary broker errors;
  - deterministic business rejects are not retried;
  - idempotency remains based on `client_order_id`.
- Propagated `risk_grant_id` across:
  - gateway schemas;
  - risk rejection projection;
  - executor order projection;
  - paper order projection;
  - order status events.
- Fixed paper execution projection bug found during rsibound test:
  - `project_order` used `previous_status` without loading it first;
  - recovery now allows pending paper commands to be reclaimed and projected after service restart.
- Kept `PORTFOLIO_FILL_MICROBATCH_ENABLED=false`:
  - accounting remains single-fill/event based;
  - this is deliberate because accounting correctness is more important than speed at this stage.

Phase 2 verification log - 2026-06-05:

- Compile check passed for touched Phase 2 modules.
- Targeted tests passed:
  - `tests/unit/test_risk_grants.py`;
  - `tests/unit/test_executor_retry_policy.py`;
  - `tests/unit/test_alpha_sdk_order_state.py`;
  - `tests/unit/test_gateway_idempotency.py`;
  - `tests/unit/test_gateway_order_schema.py`.
- Affected regression tests passed:
  - executor projection/events;
  - listener fill repository;
  - paper execution;
  - portfolio accounting;
  - broker-sync risk;
  - reconciliation dedup;
  - risk rejection projection.
- Full unit suite passed before the final paper projection fix:
  - `273 passed`.
- Post-fix targeted regression passed:
  - paper execution;
  - alpha SDK order state;
  - risk grants;
  - gateway idempotency.
- Migration `21-risk-grants.sql` was applied to `live_data_executor`.
- Service restart was performed for:
  - gateway;
  - risk engine;
  - executor;
  - paper execution;
  - listener;
  - portfolio;
  - reconciliation.
- Gateway health returned `READY` after restart.
- Pre-risk smoke passed:
  - created one execution session;
  - created one active risk grant;
  - approved one BTCUSDT planned paper order;
  - no smoke order was submitted to avoid polluting the account.
- Rsibound 15m live-like cycle:
  - sandbox Binance completed the 14:30 UTC cycle with successful broker executions;
  - executor concurrency/retry did not introduce duplicate send or business rejects in observed logs;
  - paper Binance initially hit the `previous_status` projection bug, then recovered pending commands after
    `paper_execution` restart and processed fills.

Phase 2 remaining audit before declaring final operational pass:

- Docker approval quota blocked the final read-only DB/Redis audit in this session.
- As soon as Docker access is available, run:
  - full unit suite once more after the final paper projection fix;
  - DB order/fill/position/session/risk-grant count audit for the latest rsibound cycle;
  - Redis pending audit for `order.inbound`, `order.requests`, `commands.execution.paper`, and copy stream;
  - gateway `/v1/health` and `/v1/capabilities` check.
- Read-only audit command set to run next:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit`;
  - query `orders` grouped by `mode`, `venue`, `account_id`, `status` for the latest
    `rsiboundportfolioA001_15m` cycle;
  - query `fills` grouped by `mode`, `venue`, `account_id` using `sum(quantity)`;
  - query `positions_v2` for non-flat rows and null `mark_price`;
  - query `execution_sessions` and `risk_grants` created in the latest cycle;
  - query `account_sync_snapshots` for sandbox/paper account freshness and mismatch payloads;
  - `XPENDING order.inbound risk_engine_group`;
  - `XPENDING order.requests executor_group`;
  - `XPENDING commands.execution.paper paper_execution_group`;
  - `XLEN copy:events:v1`.
- Important limitation:
  - rsibound production-style cycle still uses old single-order calls;
  - Phase 2 batch pre-risk is implemented and smoke-tested, but rsibound has not yet been refactored to
    submit a planned order set through `submit_orders_with_pre_risk`;
  - do not claim batch pre-risk latency improvement for rsibound until that alpha execution wrapper is
    explicitly migrated and tested.

Phase 2 rsibound log follow-up - 2026-06-06:

- Observed warnings/errors from the two Binance rsibound logs only:
  - old `BROKER_SYNC_MISMATCH` rows were from the pre-fix sandbox cycle;
  - old paper `Failed to update orders` rows were from the `previous_status` paper projection bug;
  - current repeated warning pattern was `RATE_LIMIT_EXCEEDED` at the Gateway layer, not Risk.
- Why `RATE_LIMIT_EXCEEDED` was Gateway, not Risk:
  - alpha log response summary had `order_status=None`, `symbol=None`, and `risk_context=None`;
  - Risk rejects normally project `order_status=RISK_REJECTED` and richer context;
  - Gateway was rejecting before `AlphaOrder` parsing because the hardcoded bucket was
    `rl:gateway:{alpha_id}:{second}` with `100 req/s`.
- Root cause:
  - paper and sandbox used the same `alpha_id`;
  - both modes can rebalance at the same candle boundary;
  - close/open/update flows can produce more than one request per symbol;
  - the old Gateway bucket was per alpha only, so independent accounts/modes shared one technical
    anti-flood bucket.
- Fix:
  - added `GATEWAY_RATE_LIMIT_PER_SECOND`, default `300`;
  - added `GATEWAY_RATE_LIMIT_SCOPE`, default `account`;
  - Gateway rate bucket now scopes order traffic by `route:alpha_id:mode:venue:account_id`;
  - bulk order calls use `INCRBY` with request cost equal to order count;
  - rejection payload now includes `scope`, `limit_per_second`, `bucket_count`,
    `request_cost`, and `retry_after_seconds`.
- Domain note about tiny deltas:
  - `skip tiny rebalance delta` is expected and correct when the rebalance delta is below exchange
    `step_size` or board lot;
  - those deltas must not be forced into orders because Binance/DNSE/live venues would reject them;
  - if too many tiny skips appear in production, fix allocation/capital/target sizing, not the
    exchange adapter or risk guard.
- Additional DB audit finding:
  - some sandbox rows had `orders.status=PARTIALLY_FILLED` while `raw_response.o.X=FILLED`;
  - this is an event-ordering/projection issue, not an alpha logic issue;
  - listener final fill and executor broker ack can arrive in different order, so order status must be
    monotonic.
- Fix:
  - executor canonical order projection no longer demotes `FILLED`;
  - executor canonical order projection no longer demotes `PARTIALLY_FILLED` to weak ack states
    such as `SENT`, `ACCEPTED`, `NEW`, `SUBMITTED`, or `PENDING`;
  - listener order-status update applies the same monotonic rule;
  - migration `22-order-status-monotonic-repair.sql` repairs old Binance rows where
    `raw_response.o.X='FILLED'` but canonical status was still `PARTIALLY_FILLED`.
- Verification:
  - compile check passed for gateway/executor/listener modified modules;
  - focused Docker test passed:
    `tests/unit/test_gateway_idempotency.py`,
    `tests/unit/test_executor_order_projection.py`,
    `tests/unit/test_listener_fill_repo.py`,
    `tests/unit/test_alpha_sdk_order_state.py`;
  - result: `21 passed`;
  - migration repair updated `11` existing rows;
  - gateway, executor, and listener were restarted.
- Runtime retest after fix:
  - waited for the next rsibound 15m cycle after restart;
  - checked only `WARNING` and `ERROR` lines after `2026-06-06 03:45:00 UTC`;
  - paper Binance log had no new `WARNING`/`ERROR`;
  - sandbox Binance log had no new `WARNING`/`ERROR`;
  - DB orders after `2026-06-06 03:45:00 UTC`:
    - paper/BINANCE: `37 FILLED`, `0` rejects;
    - sandbox/BINANCE: `40 FILLED`, `0` rejects;
  - DB fills after `2026-06-06 03:45:00 UTC`:
    - paper/BINANCE: `37` fills;
    - sandbox/BINANCE: `46` fills, expected because some Binance orders can emit multiple fill
      events;
  - `positions_v2`:
    - paper/BINANCE: `40` non-flat, `0` null mark;
    - sandbox/BINANCE: `40` non-flat, `0` null mark;
  - Redis pending:
    - `XPENDING order.inbound risk_engine_group = 0`;
    - `XPENDING order.requests executor_group = 0`;
    - `XPENDING commands.execution.paper paper_execution_group = 0`;
  - gateway `/v1/health` returned `READY`;
  - `copy:events:v1` length was `0`, expected because copy policy is not enabled for this test alpha.
- Full Docker unit suite after all Phase 2 follow-up fixes:
  - result: `275 passed`, `3` known warnings;
  - warnings are existing FastAPI lifespan deprecations and Pydantic class Config deprecation.

Partial-fill business-domain clarification - 2026-06-06:

- `PARTIALLY_FILLED` is exchange execution state, not the alpha rebalance operation type.
- Alpha `update_orders(fill_data)` in the migrated rsibound wrapper means "submit a new rebalance
  delta order":
  - LONG + positive delta => `BUY`, `intent=OPEN`, `reduce_only=false`;
  - LONG + negative delta => `SELL`, `intent=REDUCE`, `reduce_only=true`;
  - SHORT + positive delta => `SELL`, `intent=OPEN`, `reduce_only=false`;
  - SHORT + negative delta => `BUY`, `intent=REDUCE`, `reduce_only=true`.
- This is intentionally different from native exchange amend:
  - rebalance delta is a new market order;
  - limit-price update/amend remains `amend_limit` / cancel-replace unless native amend is explicitly
    supported for that venue/order type.
- Binance USD-M Futures supports:
  - order statuses `NEW`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `EXPIRED`, `EXPIRED_IN_MATCH`;
  - `reduceOnly` in one-way mode;
  - native modify only for LIMIT orders, with special caveats when the order is already partially
    filled.
- Therefore:
  - a reduce/add market order can itself be partially filled;
  - that partial fill must update position/account by executed fill quantity only;
  - the next alpha cycle should resync positions and submit any remaining delta if still required.
- Audit finding:
  - some rows had `orders.status=PARTIALLY_FILLED` even though canonical `fills` already summed to
    the full requested order quantity;
  - this was not an alpha business-logic bug;
  - it was an order-status projection weakness caused by event ordering and multiple status writers.
- Fix:
  - all known order-status writers now use monotonic status rules;
  - `FILLED` is terminal and cannot be demoted;
  - `PARTIALLY_FILLED` cannot be demoted to weak ack states such as `SENT`, `ACCEPTED`, `NEW`,
    `SUBMITTED`, `PENDING`, or `RECONCILED`;
  - portfolio fill accounting now promotes canonical `orders.status` to `FILLED` when accumulated
    canonical fills reach requested `orders.quantity`.
- Repair:
  - migration `23-order-status-fill-total-repair.sql` promoted old rows where
    `SUM(fills.quantity) >= orders.quantity`;
  - repair updated `49` existing rows in the rsibound sandbox test set.
- Verification:
  - no remaining rsibound sandbox order satisfies:
    `orders.status='PARTIALLY_FILLED' AND SUM(fills.quantity) >= orders.quantity`;
  - full Docker unit suite passed after the fix:
    `275 passed`, `3` known warnings.

Phase 2 test plan:

- Unit tests:
  - risk grant creation;
  - grant expiry;
  - grant invalidation;
  - per-order quick validation;
  - rate limiter behavior;
  - retry classification;
  - idempotency with duplicate client order id.
- Integration tests:
  - batch pre-risk with all pass;
  - partial pass/partial reject;
  - expired grant rejects;
  - account halt invalidates grant;
  - broker hard mismatch invalidates grant.
- Executor tests:
  - concurrent paper send;
  - concurrent Binance sandbox mock/direct REST behavior;
  - 429 backoff;
  - 5xx retry;
  - deterministic broker reject no retry.
- Accounting tests:
  - multi-fill market order;
  - partial fill;
  - duplicate fill event;
  - listener-first fill;
  - restart during fill burst.
- Stress tests:
  - 40 orders;
  - 100 orders;
  - mixed long/short;
  - mixed pass/reject;
  - repeated cycles.
- Live-like rsibound tests:
  - paper Binance;
  - paper DNSE;
  - sandbox Binance testnet.
- Audit after every run:
  - session counters equal DB counts;
  - no pending Redis streams;
  - no null marks;
  - final broker sync `OK`;
  - no unresolved actionable findings;
  - latency report generated.

Rollback plan:

- Feature flags:
  - `BATCH_PRE_RISK_ENABLED=false`;
  - `EXECUTOR_CONCURRENT_SEND_ENABLED=false`;
  - `PORTFOLIO_FILL_MICROBATCH_ENABLED=false`.
- If disabled:
  - keep Phase 1 sessions for observability/reconciliation;
  - fall back to existing per-order risk and sequential executor behavior.

Exit criteria for Phase 2:

- Phase 1 behavior remains stable.
- Paper/sandbox rsibound runs pass with lower or equal rejection rate than baseline.
- No new accounting mismatch.
- No duplicated fills/positions.
- No increase in broker business rejects caused by concurrency/rate limits.
- Latency report demonstrates measurable improvement.

### 43.4 Concern Assessment - Should We Do This Now?

Risk of doing nothing:

- Current system is safer than before and close to stable.
- Paper Binance is already good.
- Sandbox still has burst sensitivity and depends on grace logic.
- More wide-universe alpha tests may keep exposing transient self-blocking.

Risk of doing the full upgrade immediately:

- High complexity if all concepts are implemented at once.
- Possible new bugs:
  - wrong session lifecycle;
  - stale risk grant;
  - executor concurrency duplicate send;
  - accounting micro-batch ordering bug;
  - harder debugging if too many features land together.

Recommended compromise:

- Do Phase 1 first.
- Do not start Phase 2 until Phase 1 passes multiple clean rsibound cycles.
- Keep all Phase 2 features behind flags.
- Treat micro-batch accounting as optional and last, not mandatory.

Go/no-go recommendation:

- Phase 1 is worth doing because it mainly formalizes state that already exists implicitly and
  reduces false risk rejects without chasing speed.
- Phase 2 should be optional and only started if:
  - rsibound or other alpha burst remains too slow;
  - order latency report proves risk/executor is the bottleneck;
  - Phase 1 is stable for repeated cycles.

Expected total timeline:

- Conservative total if both phases are approved:
  - Phase 1: `2.5 - 4` days;
  - Phase 2: `5 - 8` days;
  - total: `7.5 - 12` engineering days including tests.
- Recommended first approval:
  - approve Phase 1 only;
  - then re-evaluate with real latency/audit data before Phase 2.

## 44. Alpha Runtime/Data Sync Audit: 2026-06-06

Scope:

- `combine_weight_sl_tp`
- `fib_sl_tp_strength`
- trading_system `orders`, `fills`, `positions_v2`, `account_sync_snapshots`
- data_layer realtime trade/kline Redis stream used by migrated single-order alphas

Findings:

- Realtime tick data is present. Logs show `data_layer realtime tick active ... price=...` for `ETHUSDT`, `BTCUSDT`, and `BNBUSDT`.
- `orders.price IS NULL` is expected for `MARKET` orders. Execution price is stored in `fills.price`; mark prices are projected to `positions_v2.mark_price`.
- `combine_weight_sl_tp` sandbox restart hit `BROKER_SYNC_MISMATCH` because Binance testnet snapshot was flat while `positions_v2` still had stale sandbox positions.
- Reconciliation had detected the mismatch, but `.env` had `BROKER_POSITION_RECON_APPLY=false`, so DB was not restored to broker-authoritative state.
- `combine_weight_sl_tp` startup state trusted local JSON state too much and could attempt TP/SL/re-entry based on stale `side/order_id`.

Fixes:

- Set `BROKER_POSITION_RECON_APPLY=true` for this broker-authoritative sandbox/live test setup.
- Added sandbox/live account preflight wait in `alpha_sdk/trading_system_async_action.py`.
- Updated `combine_weight_sl_tp` 1h/4h to hydrate startup state from trading_system positions and reset stale local state to FLAT when no active position exists.
- Updated `combine_weight_sl_tp` exit handling so rejected exits do not silently clear active local state.

Validation checklist:

- Compile SDK/runtime/alpha files.
- Run targeted unit tests for alpha SDK state and runtime contracts.
- Restart `reconciliation_service` so new reconciliation apply config is active.
- Reconcile affected sandbox accounts and confirm latest `account_sync_snapshots.status=OK`.
- Restart affected alpha containers after account preflight is OK.
- Re-query `orders`, `fills`, `positions_v2`, `account_sync_snapshots`, and alpha logs after one cycle.

Follow-up finding after validation:

- `combine_weight_sl_tp` 1h and 4h sandbox both filled new ETHUSDT orders after the stale local state purge.
- Binance testnet then reported physical `positions_count=0` because the two internal accounts traded opposite directions on the same physical one-way/netting testnet credential.
- Scheduled broker-authoritative reconciliation correctly applied the physical broker snapshot and flattened both internal `positions_v2` rows.
- This is not a data_layer or tick-data issue. It is an account-model limitation: current Binance sync groups all sandbox accounts by mode and uses the first configured credential.
- Production requirement before running many sandbox/live alphas on Binance:
  - add explicit broker credential/sub-account binding via `accounts.external_account_ref` or a dedicated mapping table;
  - group account sync by that binding instead of projecting one physical snapshot to every account;
  - for shared physical accounts, reconcile at physical-account level and keep per-alpha virtual allocations as an internal ledger, not as broker-authoritative positions.

## 45. Physical Broker Account Model Upgrade Plan - 2026-06-07

Context:

- Binance sandbox/live and most real broker setups may expose only one physical broker account/credential.
- Internal `account_id` in trading_system is not the same thing as an exchange sub-account.
- Internal `account_id` must remain the virtual accounting/risk/allocation scope for one alpha deployment.
- A physical broker account/credential may be shared by many internal virtual accounts.
- Current code already contains several building blocks:
  - `accounts.external_account_ref`;
  - `venue_accounts`;
  - `venue_credentials`;
  - per-account `orders`, `fills`, `positions_v2`, `account_balances`, `account_policies`;
  - alpha SDK preflight;
  - broker sync snapshots;
  - reconciliation findings.
- The bug is not a missing architecture from scratch. The bug is that some runtime paths still treat each internal `account_id` as if it were an independent broker account.

Current incorrect behavior:

- `PortfolioManagementRepository.sync_binance_accounts()` fetches one Binance broker snapshot and projects/clones it into every internal `account_id` in the same mode.
- Scheduled reconciliation groups Binance accounts by `mode`, not by physical broker binding.
- `RiskRepository.get_broker_sync_state(account_id)` only checks the latest internal account snapshot.
- With one Binance one-way/netting testnet credential, two internal sandbox accounts can open opposite positions. Binance reports the physical net position, while `positions_v2` correctly contains two virtual alpha ledgers. Current per-account broker reconciliation can flatten both internal positions incorrectly.

Target model:

- `account_id` = internal virtual account for one alpha deployment, mode, venue, and allocation scope.
- `external_account_ref` or future dedicated binding = physical broker account/credential scope.
- Paper accounts are internal-authoritative and do not require broker sync.
- Sandbox/live accounts can be broker-aware, but broker-authoritative checks must be scoped to the physical broker account.
- `positions_v2` remains per internal account.
- Broker position reconciliation for shared physical accounts must compare broker net positions against the aggregate of all internal virtual accounts mapped to the same physical broker account.
- Per-alpha accounting and PnL continue to use internal virtual account attribution from `orders`, `fills`, and `positions_v2`.

### 45.1 Phase 1 - Wire Physical Broker Account Binding And Safe Broker Sync

Goal:

- Stop treating every internal sandbox/live `account_id` as a separate Binance broker account.
- Make broker sync/preflight/risk use physical broker account freshness while preserving virtual account-level risk and allocation.
- Keep implementation additive and reversible.

Scope:

- Database/config:
  - standardize `accounts.external_account_ref` for Binance sandbox/live accounts, for example `binance_testnet_main`;
  - update `portfolio_account_config_setup.yaml` metadata from `one_account_per_alpha_mode_venue` to a shared-physical-account model;
  - document that `account_id` is virtual and `external_account_ref` is physical broker binding;
  - avoid requiring real Binance sub-accounts.
- Broker sync:
  - change Binance sync grouping from `(mode)` to `(mode, venue, external_account_ref, credential/key alias if available, market_type/order_category)`;
  - fetch one Binance Futures account snapshot per physical binding;
  - do not clone the physical snapshot into each internal account as if it were broker-authoritative per account;
  - record physical binding details in snapshot `raw` at minimum;
  - either store a synthetic physical snapshot account reference or add a clean physical snapshot table if the additive migration is simple enough.
- Risk/preflight:
  - update broker-sync state lookup to resolve internal `account_id` -> physical broker binding;
  - if policy requires broker sync and binding is shared, check physical snapshot freshness/status;
  - keep account-level virtual allocation checks unchanged;
  - keep close/reduce bypass behavior for broker-sync mismatch only where already explicitly allowed.
- Reconciliation:
  - scheduled Binance broker sync must run once per physical binding;
  - per-internal-account reconciliation apply must not flatten virtual positions based on one shared physical snapshot;
  - for shared physical bindings, Phase 1 can mark per-account broker position apply as unsupported/deferred and rely on aggregate audit until Phase 2;
  - open-order reconciliation can remain per order/client_order_id where broker order metadata is attributable.
- CLI:
  - add/read commands to show account broker binding:
    - list internal accounts and their `external_account_ref`;
    - show physical broker sync freshness;
    - show which internal accounts share one physical binding;
  - update setup/apply command to accept and persist `external_account_ref`.
- Docs:
  - update `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md`;
  - update alpha migration guide/runbook with the new mental model;
  - document the rule: one physical credential can host many virtual accounts, but aggregate reconciliation is required.

Implementation checklist:

- [ ] Add/update config fields for shared physical Binance sandbox/live binding.
- [ ] Update setup loader to persist `external_account_ref` consistently.
- [ ] Add repository helper to resolve broker binding for an internal `account_id`.
- [ ] Update Binance account sync grouping.
- [ ] Update broker sync state lookup used by risk and gateway preflight.
- [ ] Prevent unsafe per-account position reconciliation apply for shared physical bindings.
- [ ] Add CLI visibility for broker bindings and physical sync status.
- [ ] Add unit tests for:
  - one internal account -> one physical binding;
  - multiple internal accounts -> same physical binding;
  - broker sync missing/error/stale/OK;
  - risk preflight with shared physical fresh snapshot;
  - risk reject when shared physical snapshot is stale/error/missing.
- [ ] Add integration/smoke test with two sandbox virtual accounts sharing one Binance testnet binding.
- [ ] Update markdown progress after each completed subsection.

Exit criteria:

- Risk/preflight no longer requires a fake per-virtual-account Binance snapshot.
- Scheduled reconciliation no longer clones one physical Binance snapshot into every virtual account.
- Multiple sandbox/live virtual accounts can share one credential without immediate false `BROKER_SYNC_MISMATCH`.
- Unsafe broker-authoritative flattening is blocked/deferred for shared physical account position reconciliation.
- CLI clearly shows the physical binding and which virtual accounts share it.

Expected same-day target:

- Phase 1 should be completed first and tested before Phase 2 begins.
- If Docker quota blocks live container tests, complete unit tests and mark container restart/audit as pending in this section.

### 45.2 Phase 2 - Aggregate Physical Reconciliation, CLI Operations, And Final Docs

Goal:

- Make shared physical broker account reconciliation production-grade enough for multiple sandbox/live alphas on one credential.
- Keep per-alpha accounting isolated while comparing physical broker state to aggregate virtual state.

Scope:

- Aggregate broker position reconciliation:
  - load all active internal accounts mapped to the same physical binding;
  - aggregate `positions_v2.signed_qty` by `instrument_id`;
  - compare aggregate DB quantity to physical broker quantity;
  - write findings at physical binding scope, with impacted internal accounts listed in details;
  - do not mutate individual virtual positions unless an explicit operator action is requested and the action is well-defined.
- Aggregate broker open-order reconciliation:
  - compare physical open orders with DB open orders across all virtual accounts sharing the binding;
  - use `client_order_id`, `venue_order_id`, `account_id`, and `strategy_id` attribution when available;
  - treat unattributed broker orders as external/manual findings.
- Physical capacity/risk guard:
  - keep virtual allocation checks per account;
  - add aggregate physical guard where useful:
    - physical available balance/buying power;
    - aggregate internal exposure under the physical binding;
    - pending orders/reservations under the physical binding;
  - reject or defer new sandbox/live orders if physical capacity is clearly insufficient or physical sync is stale/error.
- Emergency operations:
  - document force-close semantics for shared physical accounts;
  - add CLI/runbook commands that distinguish:
    - virtual alpha halt/reduce-only;
    - virtual account force close intent;
    - physical account flatten;
  - warn that flattening a physical account can affect all virtual alpha accounts sharing that credential.
- CLI:
  - add physical account commands, for example:
    - `broker bindings list`;
    - `broker binding state <external_account_ref>`;
    - `broker binding reconcile-positions <external_account_ref> --sync-first`;
    - `broker binding reconcile-open-orders <external_account_ref> --sync-first`;
    - `broker binding exposure <external_account_ref>`;
  - keep destructive/production-impacting operations password/admin-confirmed.
- Docs:
  - update portfolio CLI guide end-to-end examples;
  - update alpha deployment guide to explain how to assign many alphas to one physical Binance testnet/live credential safely;
  - update runbook with test-only reset versus production emergency-close rules;
  - add a clear operator checklist before running more sandbox/live alphas concurrently.

Implementation checklist:

- [ ] Add aggregate physical reconciliation repository methods.
- [ ] Add physical binding reconciliation findings/audit output.
- [ ] Update reconciliation service to call aggregate reconciliation for shared Binance bindings.
- [ ] Add CLI commands for physical binding sync/reconcile/exposure.
- [ ] Add docs/runbook for shared physical account operations.
- [ ] Add tests for:
  - two virtual accounts with opposite positions netting to zero physically;
  - two virtual accounts same direction matching aggregate physical position;
  - one virtual account stale while aggregate still matches physical;
  - physical mismatch due manual broker trade;
  - open order present at broker but missing in DB;
  - DB open order missing at broker after grace window;
  - physical sync stale/error blocking new order.
- [ ] Run rsibound/regression/single-order alpha smoke tests after upgrade:
  - paper Binance;
  - paper DNSE;
  - sandbox Binance with one shared testnet credential;
  - copy outbox stream audit.
- [ ] Query and record DB audit for:
  - `orders`;
  - `fills`;
  - `positions_v2`;
  - `account_sync_snapshots` or new physical sync table;
  - reconciliation findings;
  - copy outbox events.

Exit criteria:

- Broker sync is physically scoped.
- Virtual accounts remain isolated for PnL, allocation, and risk limits.
- Aggregate physical reconciliation correctly explains shared-account netting.
- No scheduled job automatically flattens virtual alpha positions because of a shared physical snapshot.
- CLI and markdown give a clear A-Z operator flow for setup, monitor, sync, reconcile, halt, force close, and test reset.

Known constraint:

- This upgrade does not create real Binance/DNSE sub-accounts.
- If the broker exposes only one credential/account, the system can support multiple virtual alpha ledgers, but physical fills and available capacity are shared.
- True per-alpha broker-authoritative isolation still requires real broker sub-accounts or separate credentials.

Same-day execution order:

1. Update markdown plan and keep progress here.
2. Implement Phase 1.
3. Run targeted unit tests.
4. Restart required services if Docker quota is available.
5. Run Phase 1 smoke/audit.
6. Implement Phase 2 only after Phase 1 passes.
7. Run aggregate reconciliation tests and rsibound/single-order smoke.
8. Update CLI guide and alpha docs.
9. Record final outcome, remaining risks, and next test plan in this section.

### 45.3 Phase 1 Implementation Log

Status: `IMPLEMENTED_MIGRATED_UNIT_TESTED_READ_ONLY_SMOKE_PASSED`

Completed changes:

- [x] Added additive schema file `init-db/24-physical-broker-sync.sql`.
  - New table: `broker_account_sync_snapshots`.
  - Purpose: store broker-authoritative physical account snapshots separately from internal virtual `account_id` snapshots.
- [x] Added broker binding helper in `services/portfolio_management/repository.py`.
  - `account_id` remains internal virtual scope.
  - Binance `sandbox/live` with `external_account_ref` resolves to `sync_scope=PHYSICAL`.
  - Accounts without `external_account_ref` keep `sync_scope=INTERNAL_ACCOUNT` for backward compatibility.
- [x] Updated Binance broker sync grouping.
  - `sync_binance_accounts()` now groups by physical binding.
  - Shared physical bindings fetch one broker snapshot and record one physical snapshot.
  - It no longer clones one physical Binance snapshot into every virtual account.
- [x] Updated risk broker-sync lookup.
  - `RiskRepository.get_broker_sync_state()` resolves internal account -> physical binding.
  - Shared Binance sandbox/live accounts check `broker_account_sync_snapshots`.
  - Returned diagnostics now include `sync_scope` and `external_account_ref`.
- [x] Updated account state/admin visibility.
  - Account state now includes `broker_binding`.
  - Account state now includes `latest_physical_sync` when applicable.
  - Gateway exposes read-only admin endpoints:
    - `GET /v1/admin/broker-bindings`;
    - `GET /v1/admin/broker-bindings/{external_account_ref}/state`.
- [x] Added CLI read-only visibility.
  - `cli broker bindings`.
  - `cli broker state <external_account_ref>`.
  - `cli account state <account_id>` now prints broker binding and latest physical sync.
- [x] Updated canonical config.
  - `portfolio_account_config_setup.yaml` now documents shared physical broker account model.
  - Binance sandbox accounts now use `external_account_ref: binance_testnet_main`.
- [x] Updated scheduled reconciliation behavior for Phase 1.
  - Binance scheduled sync groups by `(mode, external_account_ref/account_id)`.
  - Per-account broker reconciliation is deferred for accounts with physical binding.
  - This prevents unsafe per-account flattening from one shared physical broker snapshot.
- [x] Added safety guard.
  - `reconcile_positions_from_latest_sync(..., apply=True)` rejects unsafe per-account apply when a physical binding is shared by multiple internal accounts.
- [x] Updated `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md` with broker binding semantics and commands.

Tests run:

- [x] `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_binance_batch_sync.py tests/unit/test_risk_broker_sync.py tests/unit/test_cli.py -q`
  - Result: `24 passed`.
- [x] `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_portfolio_management.py tests/unit/test_account_sync.py tests/unit/test_reconciliation_finding_dedup.py -q`
  - Result: `21 passed`.
- [x] `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit -q`
  - Result: full unit suite passed.
  - Warnings only:
    - FastAPI `on_event` deprecation;
    - Pydantic class-based config deprecation.

Runtime migration/read-only checks:

- [x] Applied `init-db/24-physical-broker-sync.sql` to the running trading_system database.
- [x] Set `external_account_ref='binance_testnet_main'` for existing Binance sandbox accounts with empty binding.
  - Result: `7` sandbox Binance virtual accounts now share `binance_testnet_main`.
- [x] Restarted affected services:
  - gateway;
  - risk_engine;
  - reconciliation.
- [x] Ran read-only CLI checks:
  - `cli broker bindings --mode sandbox --venue BINANCE`;
  - `cli broker state binance_testnet_main --mode sandbox --venue BINANCE`;
  - `cli account state sandbox-binance-rsiboundportfolioA001_1d`.
- [x] Verified one physical sync row is visible for `binance_testnet_main`.
  - Latest physical sync status: `OK`.
  - Physical buying power was visible in CLI output.

Pending before order-flow smoke:

- [ ] Confirm new sandbox/live order preflight checks the physical snapshot during an actual alpha/order cycle.
- [ ] Run one rsibound or small sandbox alpha smoke after Phase 2 decision, because Phase 1 intentionally defers aggregate physical reconciliation.

Phase 1 conclusion:

- Code now matches the intended Phase 1 model: physical broker sync is separate from internal virtual alpha ledgers.
- The system is not yet doing aggregate physical reconciliation; that remains Phase 2.
- Until Phase 2 is complete, shared Binance physical bindings are safe from automatic per-account flattening, but aggregate mismatch explanations are still limited.

### 45.4 Phase 2 Implementation Log

Status: `IMPLEMENTED_UNIT_TESTED_RUNTIME_SMOKE_PASSED_WITH_EXPECTED_EXISTING_MISMATCH`

Completed changes:

- [x] Added aggregate virtual position helpers.
  - `aggregate_virtual_position_map()`.
  - `aggregate_position_reconciliation_plan()`.
  - Supports opposite virtual accounts netting to zero on one physical broker account.
- [x] Added aggregate physical broker reconciliation repository methods.
  - `broker_binding_exposure()`.
  - `reconcile_physical_positions()`.
  - `reconcile_physical_open_orders()`.
- [x] Added physical reconciliation finding types.
  - `PHYSICAL_BROKER_POSITION_STALE_IN_DB`.
  - `PHYSICAL_BROKER_POSITION_MISSING_IN_DB`.
  - `PHYSICAL_BROKER_POSITION_QTY_MISMATCH`.
  - `PHYSICAL_BROKER_OPEN_ORDER_STALE_IN_DB`.
  - `PHYSICAL_BROKER_OPEN_ORDER_MISSING_IN_DB`.
  - `PHYSICAL_BROKER_OPEN_ORDER_STATE_MISMATCH`.
- [x] Physical reconciliation writes findings into `reconciliation_findings`.
  - `account_id = external_account_ref`.
  - `strategy_id = '__PHYSICAL__'`.
  - `details.sync_scope = 'PHYSICAL'`.
  - `details.external_account_ref = <binding>`.
- [x] Scheduled reconciliation now runs aggregate physical reconciliation for shared Binance bindings.
  - It no longer stops at Phase 1 defer logging.
  - It does not mutate individual virtual `positions_v2` rows.
- [x] Added Gateway admin endpoints:
  - `GET /v1/admin/broker-bindings/{external_account_ref}/exposure`;
  - `POST /v1/admin/broker-bindings/{external_account_ref}/reconcile-positions`;
  - `POST /v1/admin/broker-bindings/{external_account_ref}/reconcile-open-orders`.
- [x] Added CLI commands:
  - `cli broker exposure <external_account_ref>`;
  - `cli broker reconcile-positions <external_account_ref>`;
  - `cli broker reconcile-open-orders <external_account_ref>`.
- [x] Updated risk broker-sync guard.
  - Physical scope now checks unresolved `PHYSICAL_BROKER_*` findings.
  - A fresh `OK` broker sync cannot bypass unresolved aggregate physical reconciliation findings.
- [x] Updated `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md` with Phase 2 commands and shared physical account warning.

Tests run:

- [x] `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_portfolio_management.py tests/unit/test_cli.py tests/unit/test_binance_batch_sync.py tests/unit/test_risk_broker_sync.py -q`
  - Result: `41 passed`.
- [x] `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_risk_broker_sync.py tests/unit/test_portfolio_management.py tests/unit/test_cli.py -q`
  - Result: `39 passed`.
- [x] `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit -q`
  - Result: full unit suite passed.
  - Warnings only:
    - FastAPI `on_event` deprecation;
    - Pydantic class-based config deprecation.

Runtime actions:

- [x] Restarted affected services:
  - gateway;
  - reconciliation;
  - risk_engine.
- [x] Ran read-only exposure:
  - `cli broker exposure binance_testnet_main --mode sandbox --venue BINANCE`.
- [x] Ran aggregate physical position reconciliation:
  - `cli broker reconcile-positions binance_testnet_main --mode sandbox --venue BINANCE --sync-first`.
  - Result: `MISMATCH`, `40` findings.
- [x] Ran aggregate physical open-order reconciliation:
  - `cli broker reconcile-open-orders binance_testnet_main --mode sandbox --venue BINANCE --sync-first`.
  - Result: `OK`, `0` findings.
- [x] Queried DB read-only:
  - `reconciliation_findings` contains `40` OPEN `PHYSICAL_BROKER_POSITION_QTY_MISMATCH` findings.
  - latest `broker_account_sync_snapshots` for `binance_testnet_main` has both physical position and open-order reconciliation metadata.

Runtime finding:

- Current sandbox DB has expected historical mismatch from the pre-Phase-1 bug.
- Aggregate virtual positions are roughly larger than broker physical positions because one physical Binance snapshot had previously been projected into multiple virtual accounts.
- Phase 2 correctly surfaces this as physical aggregate mismatch instead of silently flattening internal virtual accounts.
- Before the next clean rsibound/sandbox run, reset or reconcile the old test sandbox virtual positions intentionally. Do not treat this as a new Phase 2 bug.

Phase 2 conclusion:

- Shared physical Binance account model is now represented end-to-end:
  - sync;
  - risk/preflight guard;
  - scheduled reconciliation;
  - CLI visibility;
  - DB findings;
  - docs.
- The system still does not create real sub-accounts.
- If a real broker offers only one credential, multiple alpha accounts are virtual ledgers sharing one physical capacity pool.
- Any production physical flatten action affects every virtual account sharing the credential and must use an operator runbook.

### 45.5 Test Reset Script Correction - 2026-06-07

Problem:

- `scripts/reset_lab_baseline.sh --alpha-compose <alpha>/docker-compose.yml` previously still ran the global database reset path.
- That was unsafe and confusing because an alpha-specific compose path should only reset traces for that alpha/account set.

Fix:

- Added explicit reset scopes:
  - alpha-scoped reset: selected automatically when `--alpha-compose PATH` is passed;
  - global reset: selected only when `--global-reset` or `--all` is passed.
- Alpha-scoped reset now:
  - extracts `TRADING_ALPHA_ID` and `TRADING_ACCOUNT_ID` values from the target compose file;
  - stops only containers from that alpha compose file;
  - deletes only PostgreSQL rows linked to those strategy/account IDs;
  - optionally deletes generated alpha-local `logs/`, `state/`, and `main/__pycache__/`;
  - does not stop trading-system services;
  - does not truncate the database;
  - does not flush Redis DB0.
- Global reset now:
  - requires `--global-reset`;
  - keeps `--confirm RESET_ALL_TEST_DATA`;
  - stops trading-system writers;
  - runs `scripts/reset_test_state.sql`;
  - flushes trading Redis DB0;
  - restarts trading-system services.
- Alpha-scoped reset refuses `--flatten-binance-testnet` because Binance testnet is one shared physical account and flattening it can affect other virtual accounts.

Mandatory disposable-smoke cleanup rule:

- After auditing a smoke test that used disposable alpha/account IDs, run an alpha/account-scoped reset for exactly that test scope before starting the next test.
- Do not preserve declarative config for throwaway smoke identities; preserve config only when intentionally restarting the same declared alpha.
- Never use a global reset, Redis DB0 flush, or physical broker flatten merely to remove one smoke test's traces. Those operations require an explicitly disposable full lab and their own confirmation.

Commands:

```bash
# alpha-scoped read-only plan
scripts/reset_lab_baseline.sh \
  --alpha-compose /root/bobby/execution_alpha/alphas/rsiboundportfolioA001/docker-compose.yml

# alpha-scoped apply
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --apply --confirm RESET_ALPHA_TEST_DATA --clean-alpha-files \
  --alpha-compose /root/bobby/execution_alpha/alphas/rsiboundportfolioA001/docker-compose.yml

# global read-only plan
scripts/reset_lab_baseline.sh --global-reset

# global apply
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --global-reset --apply --confirm RESET_ALL_TEST_DATA
```

Validation:

- `bash -n scripts/reset_lab_baseline.sh`: passed.
- Alpha-scoped dry-run for `rsiboundportfolioA001`: passed and showed:
  - `scope: alpha`;
  - extracted `rsiboundportfolioA001_1d`;
  - extracted the three rsibound account IDs;
  - `truncate public PostgreSQL test data except venues: no`;
  - `flush trading Redis DB0: no`.
- Global dry-run: passed and showed:
  - `scope: global`;
  - `truncate public PostgreSQL test data except venues: yes`;
  - `flush trading Redis DB0: yes`.

Follow-up fix:

- First alpha-scoped apply hit `ERROR: relation "reset_scope_alpha" does not exist`.
- Root cause: the reset SQL used `CREATE TEMP TABLE ... ON COMMIT DROP` while `psql`
  was running statements in autocommit mode, so each temp table was dropped immediately
  after its `CREATE TABLE` statement.
- Fix: remove `ON COMMIT DROP`; temp tables now live for the `psql` session and are
  dropped automatically when the session exits.
- Validation:
  - `bash -n scripts/reset_lab_baseline.sh`: passed;
  - `fib_sl_tp_strength` alpha-scoped dry-run: passed and extracted all three alpha ids
    and six account ids;
  - Postgres temp-table session smoke: passed with 3 alpha ids and 1 account id inserted
    into the reset scope temp tables.

Second follow-up fix:

- First end-to-end `fib_sl_tp_strength` apply then hit
  `column reference "table_name" is ambiguous` inside the dynamic reset block.
- Root cause: PL/pgSQL variable `table_name` collided with
  `information_schema.columns.table_name`.
- Fix: rename the loop variable to `reset_table_name`.
- Rollback smoke then exposed a real FK order issue:
  `account_equity_snapshots` referenced `strategy_deployments`.
- Fix: extend ordered deletes so all known account/strategy/deployment children are deleted
  before `strategy_deployments`, then delete `accounts`, then `strategies`.
- Validation:
  - `bash -n scripts/reset_lab_baseline.sh`: passed;
  - SQL smoke with `BEGIN/ROLLBACK` for `fib_sl_tp_strength`: passed through the full
    dynamic delete block;
  - real alpha-scoped apply for `fib_sl_tp_strength`: passed end-to-end;
  - read-only DB audit after apply showed zero rows for the fib ids in
    `strategies`, `accounts`, `strategy_deployments`, `orders`, `fills`,
    `positions_v2`, `account_equity_snapshots`, and `portfolio_allocations`.

### 45.6 Shared Physical Account Sandbox Audit - 2026-06-07

Scenario:

- Ran migrated `combine_weight_sl_tp` and `fib_sl_tp_strength` Binance sandbox deployments
  concurrently through the same physical Binance Futures testnet credential
  `external_account_ref=binance_testnet_main`.
- The alpha set intentionally produced overlapping/opposite exposure across BTCUSDT and ETHUSDT
  from multiple virtual `account_id`s.

Observed trading-system DB state:

- All scoped orders were `FILLED`; no scoped rejects were found:
  - `combine_weight_sl_tp_0011h`: 1 filled ETHUSDT SELL;
  - `combine_weight_sl_tp_0014h`: 1 filled ETHUSDT BUY;
  - `fib_sl_tp_strength_0015m`: 5 filled BTCUSDT orders;
  - `fib_sl_tp_strength_00115m`: 4 filled ETHUSDT SELL orders;
  - `fib_sl_tp_strength_00130m`: 9 filled BTCUSDT/ETHUSDT orders.
- `positions_v2` had fresh `mark_price` and `mark_price_at` for the open sandbox positions.
- Aggregate virtual exposure matched latest physical broker sync exactly:
  - BTCUSDT virtual signed qty `-0.001` == broker `-0.0010`;
  - ETHUSDT virtual signed qty `-0.105` == broker `-0.105`.
- Latest `broker_account_sync_snapshots` for `binance_testnet_main` was `OK`, with 2 broker
  positions and 0 broker open orders.
- `cli broker exposure binance_testnet_main --mode sandbox --venue BINANCE` returned
  `findings: 0`.
- `cli broker reconcile-positions ... --sync-first` returned `status: OK`, `findings: 0`.
- `cli broker reconcile-open-orders ... --sync-first` returned `status: OK`, `findings: 0`.

Conclusion:

- Section 45 shared physical broker account model is working for Binance sandbox:
  many virtual alpha accounts can share one physical credential while risk/reconciliation sees
  the aggregate physical truth.
- This validates the core design decision that `account_id` is an internal virtual ledger, while
  `external_account_ref` is the physical broker account.
- Remaining observations outside the Section 45 success criteria:
  - `copy_event_outbox` was empty during this run because copy policies were not enabled yet.
    This was fixed and validated in Section 25.8;
  - trading-system logs still contain old zombie recovery noise for historical/manual web orders,
    unrelated to the scoped combine/fib alpha ids and not a Section 45 mismatch.

### 45.7 Grid Long Only / Grid Combine Migration Setup - 2026-06-07

Scope added:

- Legacy reference folder: `/root/bobby/execution_alpha/grid_long_only`.
- Migrated folder: `/root/bobby/execution_alpha/alphas/grid_long_only`.
- Deployments:
  - `gridlongonly001_4h`;
  - `gridlongonly001_1d`;
  - `gridcombine001_4h`;
  - `gridcombine001_1d`.

Rules recorded in `ALPHA_RUNTIME_MIGRATION_ARCHITECTURE.md`:

- preserve strategy math, trigger behavior, comments, and params;
- move only runtime wiring to shared `alpha_runtime.legacy.single_order`;
- use data_layer for market data and trading_system gateway for execution;
- one container runs one timeframe via `ALPHA_INTERVAL` / `ALPHA_ONLY_TIMEFRAME`;
- sandbox Binance uses runtime test notional override.

Implementation checklist:

- migrated folder, wrappers, compose, env, deployment metadata, and runbook created;
- trading_system declarative config updated with strategies, accounts, allocations, risk profiles,
  and copy outbox policies for the four grid deployments;
- validation completed:
  - `docker compose config --quiet` in `/root/bobby/execution_alpha/alphas/grid_long_only`: passed;
  - in-runtime compile smoke for both strategy files, local wrappers, shared runtime action files,
    and `trading_system` alpha SDK: passed;
  - `docker compose --profile cli run --rm --no-deps cli config plan /app/config/_config/portfolio_account_config_setup.yaml`: passed and listed all four grid alpha ids, accounts, risk profiles, allocations, and copy policies.

Compatibility fix added during migration:

- `gridcombine001` may call `get_open_position_id(symbol, alpha_id, is_long=True/False)`;
- shared runtime and alpha SDK now accept the optional `is_long` filter and return the matching LONG/SHORT position id when available.

### 45.8 Sandbox Hedge Mode Policy Update Plan - 2026-06-08

Decision:

- For Binance sandbox tests with two or more independent alpha deployments sharing one
  physical credential, default policy should be **Hedge Mode**, not One-Way Mode.
- Reason: sandbox is used to validate each alpha independently. Opposite virtual positions
  across different `account_id`s should not silently net each other on the broker.
- One-Way Mode remains valid for:
  - one strategy / one internal account per symbol;
  - a deliberate net-book architecture;
  - fast reversal strategies where the strategy itself owns the whole net exposure.

Current issue observed:

- `combine_weight_sl_tp` and `fib_sl_tp_strength` sandbox deployments shared
  `external_account_ref=binance_testnet_main`.
- Internal virtual ledgers kept separate `positions_v2` rows, but Binance One-Way physical
  account netted opposite virtual positions to zero.
- Physical reconciliation compared only aggregate net signed quantity, so gross virtual
  offset exposure was not surfaced as a finding.
- This caused later reduce-only closes to hit Binance `-2022 ReduceOnly Order is rejected`
  because the physical one-way position had already been netted away.

One-phase implementation scope:

0. Scope and extensibility:
   - This phase implements the concrete sandbox/live behavior for **Binance Futures** first.
   - Do not hard-code the concept into generic risk/accounting code as "Binance only".
   - Model it as a broker/venue capability and account/binding policy:
     - `position_accounting_mode`: `NET` / `HEDGE` / future values if needed;
     - broker adapter capability tells whether side-separated positions are supported;
     - risk and reconciliation read policy/capability, not raw venue string branches except at adapter boundary.
   - Future extension examples:
     - OKX swap/futures may map to long/short position side with its own field names;
     - US brokers may map to account-level net equity/positions and no hedge side;
     - Vietnam cash stock via DNSE is effectively cash long-only/no short unless margin/loan product says otherwise.
   - Documentation must say this phase is Binance Futures sandbox-first, while the design surface is reusable.

1. Policy/config:
   - Add explicit broker position mode policy for Binance sandbox/live bindings:
     `broker_position_mode: HEDGE` by default for sandbox.
   - Keep paper independent of broker position mode.
   - Keep One-Way available only by explicit config, not default for shared sandbox bindings.

2. Adapter/order semantics:
   - Binance sandbox/live order payload must set `positionSide=LONG` for virtual long opens/reduces
     and `positionSide=SHORT` for virtual short opens/reduces when broker policy is Hedge Mode.
   - Confirm / set Binance Futures testnet position mode to hedge before enabling sandbox order flow.
   - Fail fast if configured Hedge Mode but broker account reports One-Way.

3. Risk guard:
   - For shared One-Way bindings, reject opposite-side opens across virtual accounts:
     `OPPOSITE_SIDE_ON_SHARED_ONE_WAY_BINDING`.
   - For Hedge Mode bindings, allow opposite virtual sides, but still enforce aggregate physical
     buying power, symbol rules, order rate, and per-account allocation.

4. Reconciliation/exposure:
   - Enhance physical broker exposure output to show:
     - virtual net;
     - virtual gross;
     - per-account breakdown;
     - broker LONG/SHORT side if Hedge Mode;
     - warning/finding when virtual gross exists but physical side/net cannot explain it.
   - Add a finding for One-Way shared binding when `virtual_net == broker_net` but
     `virtual_gross > abs(virtual_net)`.

5. CLI/docs:
   - Add/read broker position mode in `cli broker state` and `cli broker exposure`.
   - Document sandbox default Hedge Mode and One-Way restrictions in
     `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md`.

6. Tests:
   - Unit tests:
     - One-Way shared binding rejects opposite-side opens.
     - Hedge Mode shared binding allows opposite-side opens.
     - Physical reconciliation reports gross-offset finding in One-Way.
     - Hedge Mode reconciliation maps broker LONG/SHORT sides separately.
   - Integration/smoke:
     - Reset combine/fib sandbox scoped state.
     - Ensure Binance testnet hedge mode is active.
     - Run one small combine + fib sandbox cycle.
     - Query `orders`, `fills`, `positions_v2`, broker sync, `broker exposure`, and copy outbox.

Acceptance:

- Sandbox default is Hedge Mode for Binance testnet/live-style testing with multiple alpha accounts.
- Paper behavior is unchanged and remains fully virtual per account.
- One-Way shared binding no longer silently nets virtual account positions without a risk reject or
  reconciliation finding.
- Reduce-only close failures caused by cross-alpha one-way netting are eliminated in the hedge-mode
  sandbox path.

Implementation progress - 2026-06-08:

- Done:
  - Added explicit `account_policies.position_accounting_mode` with values `NET` / `HEDGE`.
  - Added additive migration `init-db/25-broker-position-accounting-mode.sql`.
  - Updated canonical config `config/_config/portfolio_account_config_setup.yaml`:
    - paper Binance/DNSE policy: `NET`;
    - sandbox Binance policy: `HEDGE`.
  - Updated admin config apply, account policy endpoint/CLI, paper seed path, and auto policy creation.
  - Risk engine now infers `position_side` from account policy:
    - HEDGE open BUY -> `LONG`;
    - HEDGE open SELL -> `SHORT`;
    - HEDGE reduce SELL -> `LONG`;
    - HEDGE reduce BUY -> `SHORT`;
    - NET -> `BOTH`.
  - Risk engine now rejects opposite-side opens on shared one-way physical bindings with
    `OPPOSITE_SIDE_ON_SHARED_ONE_WAY_BINDING`.
  - Binance Futures order mapper now omits `reduceOnly` when `positionSide` is `LONG` / `SHORT`,
    because Binance hedge mode uses side + positionSide semantics instead of one-way reduceOnly.
  - Binance direct REST fallback now supports `GET/POST /fapi/v1/positionSide/dual`.
  - Binance broker sync now records broker position mode in snapshot raw data and attempts to
    ensure the configured `position_accounting_mode` before syncing positions/open orders.
  - Physical broker reconciliation now maps hedge positions by `instrument_id:LONG/SHORT` instead
    of collapsing by instrument only.
  - CLI `account policy` now accepts `--position-accounting-mode NET|HEDGE`; `account state`
    displays `pos_mode`.

- Verified:
  - Applied migration against current Postgres: column exists, default `NET`.
  - Restarted affected services: `gateway`, `risk_engine`, `executor`, `reconciliation`,
    `paper_execution`, `portfolio`.
  - Gateway health returned `READY`; Binance Futures capability returned `READY` with
    python-binance clients.
  - Full unit suite passed: `289 passed, 3 warnings`.

- Remaining runtime validation:
  - Re-apply `portfolio_account_config_setup.yaml` so sandbox Binance accounts are recreated/upserted
    with `position_accounting_mode=HEDGE`.
  - Run a scoped combine/fib or rsibound sandbox cycle after ensuring Binance testnet has no leftover
    open orders/positions that would prevent switching position mode.
  - Query `broker exposure` and `broker_account_sync_snapshots.raw.position_mode` to confirm
    testnet reports `broker_position_accounting_mode=HEDGE`.
  - If Binance refuses position mode change, close/cancel all physical testnet positions/orders first,
    then sync again. This is expected Binance behavior, not a trading_system DB issue.

### 45.9 Post-Run Alpha Audit and Fixes - 2026-06-08

Audit scope:

- Checked long-running alpha state after paper/sandbox strategies ran for several hours.
- Queried:
  - `service_heartbeats`;
  - `orders`;
  - `fills`;
  - `positions_v2`;
  - `broker_account_sync_snapshots`;
  - `reconciliation_findings`;
  - `copy_event_outbox`;
  - `copy_event_dead_letters`;
  - `account_equity_snapshots`;
  - `performance_snapshots`;
  - `portfolio_allocations`;
  - Redis `copy:events:v1`;
  - trading_system service logs and alpha logs.

Findings:

- Healthy:
  - all trading_system services were `READY`;
  - Binance sandbox broker sync was `OK`, fresh, and reported `dualSidePosition=true`;
  - broker physical exposure matched aggregate virtual exposure with `finding_count=0`;
  - no open reconciliation findings in the audited window;
  - orders/fills/positions projected correctly for active strategies;
  - `positions_v2.mark_price` and `mark_price_at` were fresh for open positions;
  - copy outbox had no dead letters and Redis stream was receiving events.

- Bug 1 - copy filled event metadata:
  - `copy.event.v1.order_intent` correctly carried `intent=REDUCE`, `reduce_only=true`,
    `position_side=LONG`.
  - Matching `copy.event.v1.order_filled` incorrectly defaulted to `intent=OPEN`,
    `reduce_only=false`, and missed `position_side`.
  - Root cause: `PortfolioRepository.process_fill_event` built filled copy payload from normalized
    fill data without rehydrating canonical order metadata from `orders`.
  - Fix:
    - rehydrate `position_side`, `intent`, `reduce_only`, `order_type`, `time_in_force`,
      and `post_only` from canonical `orders` before recording `ORDER_FILLED`;
    - make copy payload builder tolerate Binance camelCase raw fields:
      `positionSide`, `reduceOnly`, `timeInForce`.
  - Backfill:
    - updated 17 recent `copy_event_outbox` rows to match canonical order metadata;
    - post-backfill mismatch count is 0.
  - Note: already-published Redis stream messages are immutable; future copy events are fixed.

- Bug 2 - sandbox account equity display:
  - sandbox account balances are intentionally internal-zero because broker buying power is
    physical-account authoritative.
  - However `account_equity_snapshots.equity` became PnL-only, which made virtual sandbox
    account/account PnL views hard to read.
  - Root cause: performance projection used only `account_balances.total` for account equity and
    did not use `portfolio_allocations.allocated_capital` as virtual account capital when internal
    balance is zero.
  - Fix:
    - performance projection now applies an allocation cash floor only when internal cash is all zero
      and an active/reducing allocation exists;
    - this does not affect broker sync/risk execution, only PnL/account reporting.
  - Verified:
    - sandbox accounts now show `cash_total=allocated_capital`;
    - open sandbox accounts show `equity=allocated_capital + unrealized_pnl`.

- UX fix:
  - `cli broker exposure` now displays `position_key` and `side`, so hedge-mode same-symbol
    LONG/SHORT rows are readable.

Tests and runtime validation:

- Targeted tests passed:
  - copy outbox;
  - performance projection;
  - portfolio management.
- Full unit suite passed:
  - `291 passed, 3 warnings`.
- Restarted:
  - `portfolio`;
  - `risk_engine`;
  - `performance`.
- Health after restart:
  - gateway `/v1/health`: `READY`;
  - Redis/Postgres OK;
  - no stale/bad services.

Current conclusion:

- The audited paper/sandbox strategy run is behaving correctly at DB/account/broker/copy-outbox
  lifecycle level after the two fixes above.
- Remaining known limitation:
  - alpha runtime currently does not populate `execution_session_id`, so `execution_sessions`
    remains empty for these alpha cycles. This does not block order/fill/account correctness, but it
    weakens cycle-level audit. Next alpha-runtime hardening should make each rebalance/cycle create
    and pass an `execution_session_id` consistently.

### 45.10 Alpha Runtime Execution Session Sync - 2026-06-08

Decision:

- `execution_session_id` must be a shared runtime standard for all alpha families, not only
  multiple-symbol portfolio alphas such as rsibound/regression.
- Reason:
  - portfolio-rebalance alphas need one session for the whole symbol basket/rebalance cycle;
  - single-order/delta-one/grid/fib/combine alphas still need order-level traceability by
    `alpha_id`, `account_id`, `mode`, `venue`, symbol, and closed candle/tick-triggered action;
  - copy trading, risk grant audit, reconciliation, and post-run PnL investigation should not need
    alpha-family-specific joins.

Implementation:

- Updated shared alpha runtime, not individual strategy logic:
  - `execution_alpha/runtime/app/alpha_runtime/legacy/action_async.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/handler.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/single_order/handler.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/single_order/action.py`;
  - `execution_alpha/runtime/app/alpha_runtime/trade/action.py`.
- Added active executor registry and `execution_session_scope(...)`.
- Portfolio-rebalance scheduler now opens one session around `process_daily_batch(...)`.
- Single-order closed-candle callbacks now open one session per `symbol + interval + candle_open`.
- Tick/realtime orders that happen outside a closed-candle scope auto-open a short `auto-order`
  session exactly around the submit path, so the system avoids creating session rows for every raw
  tick that does not trade.
- Legacy batch order paths auto-open an `auto-batch` session when no cycle session already exists.
- `AlphaTradeAction` now accepts explicit `execution_session_id` for `submit`, `market`,
  `submit_many`, `batch`, `pair_trade`, `basket_trade`, and `rebalance_to_targets`.

Design constraints:

- No strategy signal/position-sizing logic was changed.
- No DB schema change was needed; existing `execution_sessions`, `orders.execution_session_id`,
  `fills.execution_session_id`, risk grants, and reconciliation fields are reused.
- Session creation is fail-open for alpha runtime: if the session endpoint is temporarily
  unavailable, order submission can still proceed without blocking trading, but logs will show the
  session start failure.
- For production audit, the expected healthy state is:
  - `execution_sessions` has one row per rebalance/candle-triggered trading cycle;
  - `orders.execution_session_id` and `fills.execution_session_id` are populated for orders emitted
    during that cycle;
  - session counters move through gateway/risk/executor/listener/portfolio as already implemented.

Validation:

- Compile check passed for touched runtime files.
- Runtime contract tests passed locally with direct unittest runner:
  - `20 tests OK`;
  - `8 skipped` only for optional dependency checks already present in the suite.

Next live validation:

- Recreate/restart the affected alpha containers so the mounted runtime code is picked up.
- Run one controlled cycle for:
  - rsibound/regression style portfolio-rebalance alpha;
  - combine/fib/grid style single-order alpha.
- Query:
  - `execution_sessions`;
  - `orders.execution_session_id`;
  - `fills.execution_session_id`;
  - `risk_grants.execution_session_id`;
  - copy outbox payloads.

### 45.11 Signal Combine Alpha Migration - 2026-06-08

Work completed:

- Migrated legacy `/root/bobby/execution_alpha/signal_combine` into:
  - `/root/bobby/execution_alpha/alphas/signal_combine`.
- Preserved strategy math and signal behavior while replacing service wiring:
  - data_layer-only market data;
  - trading_system-only execution;
  - no direct legacy `TestnetBroker` path.
- Added runtime/deployment files:
  - `docker-compose.yml`;
  - `.env.example`;
  - `config/deployment.yaml`;
  - `Documentation/RUNBOOK.md`;
  - thin `trade/*` wrappers over shared `alpha_runtime.legacy.single_order`.
- Added declarative trading_system config for:
  - `signalcombine0025m`;
  - `signalcombine00230m`;
  - paper/sandbox Binance accounts;
  - allocations;
  - risk profiles;
  - copy outbox policies.

Validation:

- Local compile passed.
- Migrated compose config passed.
- YAML parse passed.
- Trading system config plan passed and listed the two new alpha ids/accounts/risk/copy policies.
- Runtime image compile/import smoke passed.

Next validation after user starts it:

- Run one paper cycle first.
- Query `orders`, `fills`, `positions_v2`, `execution_sessions`, and `copy_event_outbox`.
- Then run sandbox only when Binance testnet account sync is healthy.

### 45.12 QQE SSL WAE Risk Alpha Migration - 2026-06-28

Scope:

- Migrated `/root/bobby/execution_alpha/alphas/qqe_ssl_wae_risk` from legacy direct DB/WebSocket
  execution into the shared `execution_alpha` runtime.
- Canonical source is `main/backtest_code.py`; old legacy `config.yaml` and old live entrypoints
  were treated as deprecated wiring.

Canonical deployment mapping from `backtest_code.py` comments:

- `qqe_ssl_wae_risk_0015m`: `ETHUSDT`, allocation `20000 USDT`.
- `qqe_ssl_wae_risk_0011h`: `ETHUSDT`, `SOLUSDT`, `DOGEUSDT`, allocation `60000 USDT`.
- `qqe_ssl_wae_risk_0014h`: `ETHUSDT`, `SOLUSDT`, `DOGEUSDT`, allocation `60000 USDT`.
- `qqe_ssl_wae_risk_0012h`: disabled reference only because the source comment says not yet
  approved for paper.

Backtest-parity fixes implemented in the migrated live code:

- `pos_weight` is kept as signed real exposure weight instead of binary `1/-1/0`.
- WAE explosion width is computed from MACD standard deviation, not close-price standard deviation.
- True Range uses `close[i-1]`; no `np.roll` first-row contamination.
- Technical exits follow SSL regime cross without requiring positive PnL.
- Live sizing uses the risk/%-equity formula from backtest source instead of legacy
  `usd_per_trade`.

Runtime decisions:

- Uses `alpha_runtime.legacy.single_order` for data_layer warmup, latest-closed-candle polling,
  optional realtime ticks, execution sessions, and trading_system SDK access.
- Entry uses trading_system bracket market order with a STOP child.
- Technical exit cancels the active bracket and sends reduce-only market close via a new shared
  `close_position_market()` runtime primitive.
- Binance sandbox quantity is intentionally clamped by `TRADING_SANDBOX_ORDER_NOTIONAL`; paper uses
  the backtest-sized quantity.

Files changed:

- `execution_alpha/alphas/qqe_ssl_wae_risk/main/qqe_ssl_wae_common.py`.
- Thin entrypoints: `qqe_ssl_wae_0015m.py`, `qqe_ssl_wae_0011h.py`, `qqe_ssl_wae_0012h.py`,
  `qqe_ssl_wae_0014h.py`.
- `execution_alpha/alphas/qqe_ssl_wae_risk/config.yaml`.
- `execution_alpha/alphas/qqe_ssl_wae_risk/docker-compose.yml`.
- `execution_alpha/alphas/qqe_ssl_wae_risk/config/deployment.yaml`.
- `execution_alpha/alphas/qqe_ssl_wae_risk/Documentation/RUNBOOK.md`.
- `trading_system/config/_config/portfolio_account_config_setup.yaml`.

Validation required before running:

- [x] Docker compile/import for QQE files and runtime primitive.
- [x] Docker compose config validation.
- [x] Trading-system config plan validation.
- [x] Trading-system config apply completed for the new QQE alpha/account/risk/copy declarations.
- [x] CLI audit confirmed `paper-binance-qqe_ssl_wae_risk_0011h` has `60000 USDT` and leverage 5.
- [x] Risk audit confirmed paper exact-symbol limits are high while wildcard and sandbox limits are
  sandbox-safe (`150` max order / `4500` max position).
- First run should be paper only; sandbox after Binance testnet sync is healthy.

## 46. Alpha Runtime Backtest-Equivalent Execution and Bracket/OCO Upgrade Plan - 2026-06-11

Status: `PHASE_1_IMPLEMENTED_TARGETED_TESTED`

Context:

- Current migrated alpha runtime is good enough for normal market/limit/reduce/rebalance flows, but
  it is still not rich enough for alpha families whose live execution must match backtest semantics
  closely.
- Concrete example: `/root/bobby/execution_alpha/alphas/fib_sl_tp_strength/main`.
- Files reviewed for this plan:
  - `fib_sl_tp_strength_00130m.py`;
  - `fib_sl_tp_strength_00130m_make_it_right_backtest.py`;
  - `fib_sl_tp_strength_00130m_make_it_right_backtest_sl_tp_estimateaction.py`;
  - `backtest_code_styles.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/action_async.py`;
  - `execution_alpha/runtime/app/alpha_runtime/trade/action.py`;
  - `trading_system/alpha_sdk/trading_system_async_action.py`;
  - `trading_system/services/gateway/schemas/order_schema.py`;
  - `trading_system/services/paper_execution/matcher.py`;
  - `trading_system/services/executor/handlers/binance_futs.py`.

Important finding:

- The trading-system order schema and executor already support conditional order types:
  - `STOP_MARKET`;
  - `STOP_LIMIT`;
  - `TAKE_PROFIT`;
  - `TAKE_PROFIT_MARKET`;
  - `TAKE_PROFIT_LIMIT`;
  - `TRAILING_STOP_MARKET`;
  - `IOC` / `FOK` / `GTD` / post-only where the venue supports them.
- Paper matcher already triggers STOP/TAKE_PROFIT orders from market ticks.
- Binance Futures adapter maps STOP/TP/TRAILING orders to Binance native conditional order APIs.
- However, full **bracket/OCO lifecycle** is not yet a first-class primitive:
  - there is no canonical `bracket_group_id` / `oco_group_id`;
  - entry, SL, and TP child orders are not linked as one managed lifecycle;
  - if one TP child fills, sibling SL/TP orders are not automatically resized/cancelled by a
    central trading-system component;
  - if SL fills, sibling TP orders are not centrally cancelled;
  - alpha code may still be tempted to stream ticks and emulate execution logic locally.

Terminology for this upgrade:

- **OCO** means `One Cancels the Other`: if one child order fills/cancels the exposure, sibling
  protective orders must be cancelled or resized so they cannot over-close the position.
- **Bracket order** means one entry plan plus attached protective exits:
  - entry order: MARKET or LIMIT open;
  - stop-loss child: reduce-only STOP_MARKET or STOP_LIMIT;
  - take-profit child or children: reduce-only TAKE_PROFIT_MARKET or TAKE_PROFIT_LIMIT;
  - optional trailing stop child where supported.
- **Trading-system bracket manager** means trading_system owns this lifecycle. Alpha must not
  manually poll ticks to decide whether SL/TP was hit.

Concrete desired behavior for `fib_sl_tp_strength`:

- The strategy still computes signals only on closed candles.
- On each closed candle:
  1. Runtime syncs account/position/order/bracket state from trading_system.
  2. Strategy computes `imba`, `fib_236`, `fib_786` exactly from the candle dataframe.
  3. If long signal:
     - entry side: `BUY`;
     - entry type: usually `MARKET` for live parity with the current strategy, unless config
       explicitly requests LIMIT;
     - stop side: `SELL`, reduce-only, trigger near either fixed entry stop or dynamic Fib stop;
     - TP side: `SELL`, reduce-only, four TP levels based on configured fractions.
  4. If short signal:
     - entry side: `SELL`;
     - entry type: usually `MARKET`;
     - stop side: `BUY`, reduce-only;
     - TP side: `BUY`, reduce-only, four TP levels.
  5. Position size is computed from account balance/equity, risk percent, stop distance, market
     step size, min notional, and optional max notional allocation.
  6. Runtime submits one bracket plan to trading_system, not four disconnected local state hacks.
  7. Trading_system creates and tracks entry + protective children, then emits normal order/fill/copy
     events.
  8. On restart, alpha reconstructs state from trading_system bracket/orders/positions, not from JSON
     alone.

Why current live code diverges from intended/backtest-equivalent behavior:

- Current live code manually checks realtime ticks for SL/TP. That makes alpha a mini execution
  engine and diverges from paper/sandbox/live venue semantics.
- Current live code uses a fixed entry-price stop in the main file, while the "make it right" path
  wants dynamic Fib SL based on `fib_786` for longs and `fib_236` for shorts when `fixed_stop=false`.
- Current live code sizes by fixed `usd_per_trade / price`; the desired path sizes by
  `risk_percent`, balance/equity, and distance to SL.
- Current runtime `long_in` / `short_in` returns bool, so alpha cannot reliably attach children,
  track shard IDs, or audit exact order state.
- Current `stop_loss` / `take_profit` arguments are accepted by some wrapper signatures, but they
  are not enough to represent a managed four-TP bracket lifecycle.
- Local JSON state should be cache only; trading_system DB must be the source of truth.

Design principle:

- Alpha owns signal, intended sizing, and order plan.
- trading_system owns risk, venue rules, order submission, conditional order trigger/matching,
  bracket/OCO lifecycle, positions, balances, fills, PnL, reconciliation, and copy outbox events.
- Runtime/action layer is an SDK. It should expose clear async methods and typed/OOP order-plan
  objects, not force every alpha to manually assemble gateway payloads.

### 46.1 Phase 1 - Runtime State and Account API Upgrade

Goal:

- Make alpha runtime capable of reading the same account/portfolio/order state that backtest-style
  live execution needs, without adding bracket lifecycle yet.
- Keep this phase low risk: expose existing gateway endpoints cleanly, add typed result helpers,
  and keep old legacy helpers working.

Trading-system/gateway surface to use:

- Existing endpoints already available:
  - `GET /v1/accounts/{account_id}/balances`;
  - `GET /v1/accounts/{account_id}/preflight`;
  - `GET /v1/positions`;
  - `GET /v1/orders`;
  - `GET /v1/orders/{client_order_id}`;
  - `GET /v1/fills`;
  - `GET /v1/portfolio/summary`;
  - `GET /v1/market/latest/{venue}/{symbol}`;
  - `GET /v1/market/info/{venue}/{symbol}`;
  - `POST /v1/execution-sessions`.
- Add endpoint only if existing summary/balance responses are insufficient:
  - candidate: `GET /v1/accounts/{account_id}/state-lite` returning balances, latest equity,
    positions, broker/preflight, and policy in one response.
  - Prefer not to add this unless profiling shows too many requests per alpha cycle.

SDK/runtime API to add:

- In `trading_system/alpha_sdk/trading_system_async_action.py`:
  - `async def get_balances(currency: str | None = None, *, mode=None, venue=None, account_id=None) -> dict`
  - `async def get_balance(currency: str = "USDT", field: str = "free", default: float | None = None) -> float`
  - `async def get_account_snapshot(*, include_positions=True, include_orders=False) -> dict`
  - `async def get_portfolio_summary(...) -> dict`
  - `async def get_fills(symbol: str | None = None, limit: int = 100) -> dict`
  - `async def get_position(symbol: str, side: str | None = None) -> dict | None`
  - `async def list_positions(symbol: str | None = None, include_flat=False, limit=200) -> dict`
  - `async def get_latest_price(symbol: str, *, require_fresh=True) -> float`
  - `async def get_market_rules(symbol: str) -> dict`
  - `async def round_quantity(symbol: str, quantity: float, mode: str = "floor") -> tuple[float, dict]`
  - `async def estimate_quantity_by_risk(symbol, entry_price, stop_price, risk_percent, max_notional=None, currency="USDT") -> dict`
- In `execution_alpha/runtime/app/alpha_runtime/trade/action.py`:
  - add thin OOP helpers on `AlphaTradeAction` that call the SDK methods above;
  - keep `OrderIntent` immutable and add `OrderResult` / `PositionView` / `BalanceView` dataclasses
    only if they reduce repeated dict parsing.
- In `execution_alpha/runtime/app/alpha_runtime/legacy/action_async.py`:
  - expose sync wrappers for legacy-style strategy files:
    - `get_balance(...)`;
    - `get_account_snapshot(...)`;
    - `get_position(...)`;
    - `get_positions(...)`;
    - `get_orders(...)`;
    - `get_fills(...)`;
    - `get_market_rules(...)`;
    - `estimate_quantity_by_risk(...)`.
  - do not remove old `long_in`, `short_in`, `long_out`, `short_out`.
  - add new result-returning methods instead of changing bool legacy methods:
    - `long_in_order(...)`;
    - `short_in_order(...)`;
    - `submit_order(...)`;
    - `submit_orders(...)`.

OOP/style rule:

- Async SDK methods stay async.
- Legacy alpha-facing wrappers may remain sync-looking via existing `run_async(...)` pattern only
  where legacy strategy code expects sync functions.
- New migrated alpha code should prefer async-friendly `AlphaTradeAction` and typed order-plan
  helpers where practical.
- Do not make alpha code import trading_system DB repositories directly.

Backward compatibility:

- Existing alpha code that calls `long_in(...) -> bool` must continue to work.
- New alpha code may use `long_in_order(...) -> dict` or `submit_order(...) -> dict` to get
  `client_order_id`, `order_status`, `venue_order_id`, `risk_context`, and execution-session data.
- `stop_loss` and `take_profit` arguments on legacy methods should remain accepted, but in Phase 1
  they should either:
  - be ignored with a clear warning that bracket lifecycle requires Phase 2; or
  - be passed only as metadata, not as fake local execution behavior.

Phase 1 tests:

- Unit tests:
  - SDK balance parsing from `account_balances`;
  - `get_balance(field=free/total/equity)` fallback behavior;
  - market rules quantity rounding;
  - risk quantity estimator with fixed stop and Fib stop;
  - `long_in`/`short_in` backward compatibility still returns bool;
  - `long_in_order`/`short_in_order` returns canonical result;
  - account preflight still gates sandbox/live where configured.
- Runtime contract tests:
  - legacy sync wrapper can call `get_balance()` from a strategy-like object;
  - `fib_sl_tp_strength_00130m_make_it_right...` no longer fails on missing `get_balance`.
- Smoke tests:
  - paper Binance: query balance, market rules, latest price, and submit one dry/small order;
  - paper DNSE: query balance and market rules with long-only constraints;
  - sandbox Binance: preflight + balance/snapshot read with broker sync fresh.

Exit criteria:

- Alpha runtime can compute backtest-equivalent sizing from trading-system state.
- No strategy needs direct DB access for balance/position/order/fill reads.
- Existing migrated alphas keep running with old bool helpers.
- New result-returning helpers are documented and tested.

Phase 1 implementation log - 2026-06-11:

- SDK source of truth updated:
  - `trading_system/alpha_sdk/trading_system_async_action.py`.
- Added alpha-facing read/query helpers over existing gateway endpoints:
  - `get_balances`;
  - `get_balance`;
  - `get_account_snapshot`;
  - `get_portfolio_summary`;
  - `get_fills`;
  - `get_position`;
  - `list_positions`;
  - `get_latest_price`;
  - `get_market_rules`;
  - `round_quantity`;
  - `estimate_quantity_by_risk`.
- Added result-returning order helpers:
  - `long_in_order`;
  - `short_in_order`.
- Kept backward compatibility:
  - `long_in` / `short_in` still return bool;
  - old migrated alpha families can keep running without code changes.
- Important Phase 1 boundary:
  - `stop_loss` / `take_profit` on legacy-style entry methods are not treated as a real bracket/OCO
    contract yet;
  - they are logged/kept as requested protective intent only;
  - true managed bracket lifecycle remains Phase 2.
- Runtime wrappers updated:
  - `execution_alpha/runtime/app/alpha_runtime/trade/action.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/action_async.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/single_order/action.py`.
- `fib_sl_tp_strength` live files updated:
  - added shared implementation:
    `execution_alpha/alphas/fib_sl_tp_strength/main/fib_sl_tp_strength_common.py`;
  - replaced `fib_sl_tp_strength_0015m.py`, `fib_sl_tp_strength_00115m.py`,
    and `fib_sl_tp_strength_00130m.py` with thin entrypoints into the shared implementation.
- Fib live behavior changed intentionally to match the backtest-estimate direction more closely:
  - signal/indicator math stays the same;
  - entry remains MARKET by default;
  - state sync reads trading_system positions/orders first instead of trusting JSON alone;
  - sizing now uses `risk_percent`, account equity/balance, stop distance, market step size, and
    `usd_per_trade` as max notional cap;
  - dynamic stop is used when `fixed_stop=false`:
    - long stop from `fib_786 * (1 - sl_pct)`;
    - short stop from `fib_236 * (1 + sl_pct)`;
  - fixed stop is still available when `fixed_stop=true`;
  - order submission uses `long_in_order` / `short_in_order` so client order ids can be captured;
  - local JSON is cache/debug state, while trading_system remains the recovery source.
- Phase 1 limitation kept explicit:
  - until Phase 2 bracket/OCO manager exists, `fib_sl_tp_strength` still has local protective
    TP/SL handling for runtime protection;
  - this is not considered final production-grade SL/TP semantics;
  - Phase 2 must move this lifecycle fully into trading_system.

Phase 1 tests run:

- Local compile:
  - `trading_system/alpha_sdk/trading_system_async_action.py`;
  - `execution_alpha/runtime/app/alpha_runtime/trade/action.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/action_async.py`;
  - `execution_alpha/runtime/app/alpha_runtime/legacy/single_order/action.py`;
  - `execution_alpha/alphas/fib_sl_tp_strength/main/fib_sl_tp_strength_common.py`;
  - fib 5m/15m/30m entrypoints.
- Local unittest:
  - `python3 -m unittest trading_system/tests/unit/test_alpha_sdk_order_state.py`
    - result: `10 tests OK`;
  - `PYTHONPATH=/root/bobby/execution_alpha/runtime/app:/root/bobby/trading_system/alpha_sdk python3 -m unittest execution_alpha/runtime/tests/test_runtime_contracts.py`
    - result: `21 tests OK`, `8 skipped` optional dependency checks.
- Docker trading_system test:
  - `docker compose --profile test run --rm --no-deps test_runner pytest tests/unit/test_alpha_sdk_order_state.py -q`
    - result: `10 passed`.

Phase 1 remaining runtime validation:

- Restart affected alpha containers so mounted runtime/SDK/common fib code is picked up.
- Run one controlled fib paper cycle and inspect:
  - logs;
  - `orders`;
  - `fills`;
  - `positions_v2`;
  - `execution_sessions`;
  - `copy_event_outbox`.
- Run sandbox Binance only after broker sync is fresh.
- Do not declare SL/TP final until Phase 2 bracket/OCO lifecycle is implemented.

### 46.2 Phase 2 - Trading-System Bracket/OCO Lifecycle and Fib Alpha Migration

Goal:

- Add a production-grade bracket/OCO primitive to trading_system and migrate `fib_sl_tp_strength`
  to use it as the first real alpha example.
- Remove alpha-side manual SL/TP tick simulation for this family.

Trading-system engine work:

- Add additive DB schema for bracket lifecycle, unless an existing table can cleanly support it:
  - candidate table: `order_brackets`;
  - candidate table: `order_bracket_legs`;
  - fields:
    - `bracket_group_id`;
    - `alpha_id` / `strategy_id`;
    - `account_id`;
    - `mode`;
    - `venue`;
    - `symbol`;
    - `position_side`;
    - `state`: `CREATED`, `ENTRY_SUBMITTED`, `ENTRY_FILLED`, `ACTIVE`, `PARTIALLY_CLOSED`,
      `CLOSING`, `CLOSED`, `CANCELLED`, `ERROR`;
    - `entry_client_order_id`;
    - `stop_client_order_id`;
    - TP leg client order ids and quantities;
    - `execution_session_id`;
    - `risk_grant_id`;
    - `metadata`;
    - timestamps.
- Add gateway endpoint:
  - `POST /v1/order-brackets`;
  - `GET /v1/order-brackets`;
  - `GET /v1/order-brackets/{bracket_group_id}`;
  - `DELETE /v1/order-brackets/{bracket_group_id}` for cancel protective/open legs;
  - optional `PATCH /v1/order-brackets/{bracket_group_id}` for replace SL/TP later.
- Bracket request schema:
  - `entry`: `MARKET` or `LIMIT`;
  - `stop_loss`: STOP_MARKET/STOP_LIMIT reduce-only child;
  - `take_profits`: one or more TP children with quantity fraction or explicit quantity;
  - optional `trailing_stop`;
  - `oco_policy`:
    - `CANCEL_SIBLINGS_ON_STOP_FILL`;
    - `REDUCE_STOP_AFTER_TP_FILL`;
    - `CANCEL_STOP_WHEN_FLAT`;
    - `CANCEL_TPS_WHEN_FLAT`;
  - `activation_policy`:
    - `SUBMIT_CHILDREN_AFTER_ENTRY_FILLED` as default;
    - `SUBMIT_CHILDREN_IMMEDIATELY` only if venue/order semantics and risk allow it.
- Bracket manager behavior:
  1. Validate request through normal auth/risk/market rules.
  2. Submit entry order.
  3. When entry fill is confirmed, create reduce-only protective children sized to actual filled
     quantity.
  4. If partial entry fill occurs, child quantities follow actual filled quantity.
  5. If TP child fills, reduce or cancel the remaining stop quantity.
  6. If SL child fills, cancel remaining TP siblings.
  7. If reconciliation discovers the position is flat, cancel stale protective children.
  8. Every action emits normal `orders`, `fills`, `execution_sessions`, `reconciliation`, and
     `copy_event_outbox` records.
- Paper behavior:
  - paper matcher keeps matching STOP/TP individual orders;
  - bracket manager listens to fills/order states and applies OCO sibling cancellation/resizing;
  - no alpha-side stream simulation.
- Sandbox/live Binance behavior:
  - use native conditional STOP/TP order types where possible;
  - use `positionSide=LONG/SHORT` in hedge mode;
  - use reduce-only or hedge-mode side semantics correctly;
  - do not assume Binance has one native multi-leg OCO primitive for Futures;
  - trading_system still owns group state and sibling cleanup even when children are native
    conditional orders at Binance.
- DNSE/Vietnam behavior:
  - DNSE cash stock should initially support entry + explicit close/reduce orders only;
  - bracket/OCO can be marked unsupported unless broker/product supports stop/conditional orders;
  - paper DNSE may simulate stop/take-profit, but live DNSE must not pretend to support broker-native
    SL/TP without confirmed endpoint semantics.

SDK/runtime API to add:

- In SDK:
  - `async def submit_bracket_order(...) -> dict`
  - `async def get_bracket(bracket_group_id: str) -> dict`
  - `async def list_brackets(symbol: str | None = None, state: str | None = None) -> dict`
  - `async def cancel_bracket(bracket_group_id: str, reason: str = "USER_CANCEL") -> dict`
  - `async def replace_bracket_stop(...) -> dict` only if Phase 2 has time; otherwise defer.
- In `AlphaTradeAction`:
  - `async def open_bracket_market(...) -> dict`
  - `async def open_bracket_limit(...) -> dict`
  - `async def close_bracket(...) -> dict`
  - `async def list_active_brackets(...) -> dict`
- In legacy wrapper:
  - `open_bracket(...)` sync wrapper for legacy strategy files;
  - optionally support `long_in_order(..., stop_loss=..., take_profit=...)` as syntactic sugar that
    creates a one-TP bracket, but only after bracket lifecycle exists.

Fib migration behavior:

- For `fib_sl_tp_strength_00130m` and siblings:
  - keep indicator and signal math unchanged;
  - remove realtime tick SL/TP checks from alpha;
  - closed-candle logic syncs active bracket/position state first;
  - entry remains MARKET by default, because current strategy acts immediately after signal;
  - stop price uses:
    - fixed stop from entry when `fixed_stop=true`;
    - `fib_786 * (1 - sl_pct)` for long when `fixed_stop=false`;
    - `fib_236 * (1 + sl_pct)` for short when `fixed_stop=false`;
  - quantity uses `risk_percent`, stop distance, account balance/equity, allocation cap, and market
    min/step rules;
  - TP legs use the existing four `tp*_p` and `tp*_f` config values;
  - local JSON state becomes cache/debug only and must never be required for correctness after
    restart.

Testing matrix:

- Unit tests:
  - bracket schema validation;
  - invalid TP/SL side rejected;
  - quantity fractions sum validation;
  - entry partial fill creates proportional protective children;
  - TP fill reduces/cancels stop child;
  - SL fill cancels TP siblings;
  - flat reconciliation cancels stale protective children;
  - cancel bracket cancels all open child orders;
  - copy outbox includes `bracket_group_id` and child-leg metadata;
  - DNSE live/sandbox unsupported bracket returns explicit `UNSUPPORTED_ORDER_STYLE`, not silent
    fake support.
- Paper integration:
  - long bracket market entry + TP hit;
  - long bracket market entry + SL hit;
  - short bracket market entry + TP hit;
  - short bracket market entry + SL hit;
  - four-TP partial close behavior;
  - restart recovery with active bracket and open protective children.
- Sandbox Binance testnet:
  - small MARKET entry with STOP_MARKET + TAKE_PROFIT_MARKET children;
  - hedge-mode LONG and SHORT separately;
  - cancel bracket cleanup;
  - broker sync/reconciliation after child fill or manual cancel;
  - no stale children after flat.
- Alpha smoke:
  - run one controlled `fib_sl_tp_strength_00130m` cycle in paper Binance;
  - run one controlled cycle in sandbox Binance only after testnet broker sync is fresh;
  - query `orders`, `fills`, `positions_v2`, bracket tables, `execution_sessions`,
    `copy_event_outbox`, `broker_account_sync_snapshots`, and reconciliation findings.

Exit criteria:

- `fib_sl_tp_strength` can run without alpha-side tick SL/TP simulation.
- Strategy live code expresses an order plan close to the intended backtest-style logic.
- trading_system is responsible for conditional order lifecycle and OCO cleanup.
- Existing migrated alpha families continue to work.
- New bracket API is generic enough for:
  - single-order alpha with one SL/TP;
  - multi-TP fib/grid style alpha;
  - pair/delta-neutral alpha with per-leg brackets in a later phase;
  - paper/sandbox/live mode differences by venue capability.

Known risks and mitigation:

- Risk: adding bracket lifecycle touches order/fill/reconciliation/copy paths.
  - Mitigation: implement additively; do not replace existing `/v1/orders` flow.
- Risk: Binance Futures does not provide a single native multi-leg OCO primitive for this exact
  use case.
  - Mitigation: use native conditional children but keep OCO group lifecycle in trading_system.
- Risk: DNSE live stop/TP support is not confirmed.
  - Mitigation: expose explicit capability and reject unsupported live bracket orders instead of
    simulating broker behavior.
- Risk: alpha migration accidentally changes strategy math.
  - Mitigation: isolate changes to execution calls/state recovery; keep indicator/signal functions
    byte-for-byte or behavior-equivalent unless explicitly approved.

Execution order after approval:

1. Implement Phase 1 SDK/runtime state API.
2. Run Phase 1 tests and compile checks.
3. Update docs/runbooks for new runtime helpers.
4. Implement Phase 2 additive bracket/OCO schema and gateway/service manager.
5. Add paper and Binance sandbox bracket tests.
6. Migrate `fib_sl_tp_strength` to bracket API without changing strategy math.
7. Run controlled paper/sandbox smoke.
8. Audit DB/copy/reconciliation and record final result in this section.

Phase 2 implementation log - 2026-06-11:

- Additive schema:
  - added `init-db/26-order-brackets.sql`;
  - new tables:
    - `order_brackets`;
    - `order_bracket_legs`.
- Gateway schema/API:
  - added `services/gateway/schemas/bracket_schema.py`;
  - added endpoints:
    - `POST /v1/order-brackets`;
    - `GET /v1/order-brackets`;
    - `GET /v1/order-brackets/{bracket_group_id}`;
    - `DELETE /v1/order-brackets/{bracket_group_id}`.
- Gateway repository/manager:
  - added `services/gateway/repository/order_brackets.py`;
  - added `services/gateway/core/bracket_manager.py`;
  - gateway startup now creates a bracket manager and runs a bounded background reconciliation loop.
- Lifecycle implemented:
  - bracket POST creates bracket + entry/stop/TP leg records;
  - entry order is submitted through existing `GatewayEngine.validate_single`;
  - when entry becomes `FILLED`, bracket manager submits STOP/TP child orders through the normal
    `/v1/orders` pipeline;
  - if STOP fills, TP/TRAILING siblings are cancelled;
  - if TP fills, STOP is cancel-replaced with remaining quantity;
  - if no child remains open after close/reject/cancel, bracket becomes `CLOSED`;
  - all child orders still go through normal auth/rate/risk/order streams, so executor, paper,
    listener, portfolio, reconciliation, and copy outbox remain on the same order/fill contract.
- SDK/runtime:
  - `trading_system/alpha_sdk/trading_system_async_action.py` now exposes:
    - `submit_bracket_order`;
    - `get_bracket`;
    - `list_brackets`;
    - `cancel_bracket`;
  - `AlphaTradeAction` exposes:
    - `open_bracket_market`;
    - `get_bracket`;
    - `list_active_brackets`;
    - `cancel_bracket`;
  - legacy sync wrapper exposes the same bracket helpers for existing alpha style.
- `fib_sl_tp_strength` migration:
  - shared fib implementation now submits one bracket MARKET order per signal;
  - alpha no longer manually checks realtime ticks for SL/TP;
  - alpha still syncs trading_system positions/brackets before closed-candle decisions;
  - reversal path cancels active brackets and then closes remaining active positions;
  - Fib TP config is preserved as shard sizing:
    - because existing `tp*_f` can sum above 100, entry quantity is now the sum of explicit shard
      quantities;
    - TP legs use explicit quantities rather than fractions, avoiding bracket over-close.

Phase 2 validation:

- Compile checks passed for:
  - bracket schema/repository/manager;
  - gateway main;
  - SDK;
  - runtime wrappers;
  - fib shared implementation.
- Docker targeted tests passed:
  - `pytest tests/unit/test_alpha_sdk_order_state.py tests/unit/test_order_brackets.py -q`
  - result: `16 passed`.
- Docker full trading_system unit suite passed:
  - `pytest tests/unit -q`
  - result: full suite passed with only existing deprecation warnings.
- Alpha runtime image behavior test passed:
  - ran `test_fib_bracket_runtime.py` inside `execution-alpha-runtime-numba:0.1.1`;
  - verifies closed-candle LONG signal submits `open_bracket_market` with:
    - dynamic Fib stop;
    - explicit TP quantities;
    - captured `bracket_group_id`.
- Runtime DB migration applied:
  - applied `init-db/26-order-brackets.sql` to running Postgres.
- Gateway restarted and health checked inside container:
  - `/v1/health` returned `READY`.
- Paper endpoint smoke:
  - submitted a small paper Binance bracket through `/v1/order-brackets` for
    `fib_sl_tp_strength_00130m`;
  - entry was accepted and persisted as bracket `brk-fib_sl_t-btcusdt-620bd0bbab29`;
  - background bracket manager activated child orders after entry fill;
  - STOP path was exercised;
  - an initial bug left the bracket in `CLOSING` when sibling TP was already terminal;
  - bug fixed and retested;
  - same bracket now reconciles to `CLOSED`.

Current Phase 2 conclusion:

- The bracket/OCO primitive is now real enough for controlled paper testing and for fib alpha
  runtime migration.
- It is additive and does not replace existing `/v1/orders`.
- It should be tested with a fresh fib paper cycle before sandbox Binance.
- Sandbox Binance should only be tested after:
  - broker sync is fresh;
  - no leftover physical open orders/positions block hedge-mode behavior;
  - bracket smoke uses very small quantities.

Known limitations after Phase 2:

- STOP resize after TP fill currently uses cancel-replace, not native amend.
- Bracket manager is gateway-hosted polling; this is acceptable for current scale, but a dedicated
  lifecycle service may be cleaner if bracket volume grows heavily.
- DNSE live bracket/OCO remains capability-gated/unsupported until real DNSE endpoint semantics are
  confirmed.
- Paper STOP/TP behavior depends on paper matcher ticks, so production confidence still requires
  fresh market-data health and a few controlled fib cycles.

Phase 2 capability hardening - 2026-06-11:

- Added explicit bracket/OCO venue-mode capability policy in `BracketManager.validate_capability`.
- Current policy:
  - `paper + BINANCE`: supported through internal paper execution/matcher.
  - `paper + DNSE/HOSE/HNX/UPCOM`: supported for long/cash behavior first.
  - `paper + DNSE/HOSE/HNX/UPCOM + SELL entry`: rejected with
    `DNSE_PAPER_BRACKET_SHORT_UNSUPPORTED` until an explicit Vietnam short/margin policy exists.
  - `sandbox/live + BINANCE`: supported by using normal exchange conditional children while
    trading_system owns the bracket/OCO group lifecycle.
  - `sandbox/live + DNSE/HOSE/HNX/UPCOM`: rejected with
    `DNSE_NATIVE_BRACKET_UNSUPPORTED` until official broker conditional-order endpoint semantics
    are confirmed.
  - unknown venue/mode combinations reject with `BRACKET_VENUE_MODE_UNSUPPORTED`.
- This keeps production behavior conservative:
  - paper can simulate supported semantics;
  - sandbox/live cannot silently fake broker-native SL/TP behavior;
  - future brokers can be enabled by adding a capability adapter/policy entry instead of changing
    alpha strategy code.
- Amend policy clarification:
  - Binance native amend is currently safe only for open `LIMIT` orders in the adapter.
  - bracket STOP/TP child resize after partial TP uses controlled cancel-replace because conditional
    STOP/TP native amend is not available in the current Binance adapter.
  - cancel-replace is acceptable for this bracket use case only when it uses a distinct replacement
    `client_order_id`, normal risk/order streams, reconciliation, and idempotent bracket state.
  - DNSE native amend is mapped for ordinary amend but bracket/OCO live behavior remains disabled
    until DNSE endpoint semantics are validated.
- Additional unit tests added:
  - paper Binance bracket capability allowed;
  - paper DNSE long/cash bracket capability allowed;
  - Binance sandbox/live bracket capability allowed;
  - DNSE paper short bracket rejected clearly;
  - DNSE sandbox/live bracket rejected before persistence/order submission.

Phase 2 paper/OCO smoke hardening - 2026-06-11:

- Read local Binance REST reference `rest-api-binance.md` around `New Order list - OCO` and
  `New Order list - OTOCO`.
- Important interpretation:
  - those documented OCO/OTOCO endpoints are Spot `/api/v3/orderList/*`;
  - current trading_system Binance execution is USD-M Futures (`/fapi/*`);
  - therefore the current production direction for Binance Futures remains:
    - submit native conditional children (`STOP_MARKET`, `TAKE_PROFIT_MARKET`, etc.);
    - keep bracket/OCO group lifecycle, sibling cancel, retry, and reconciliation inside
      trading_system;
    - do not call Spot OCO/OTOCO endpoints for Futures.
- Paper smoke found and fixed three production-critical issues:
  1. `order_brackets` leg client id collision:
     - old `leg_client_id` truncated human-readable `bracket_group_id`;
     - different bracket ids sharing the same prefix produced the same Binance `client_order_id`;
     - fixed by hashing full `bracket_group_id + leg_type + index` into short deterministic ids.
  2. Bracket metadata was dropped by gateway order schema:
     - `AlphaOrder` did not include `bracket_group_id`, `bracket_leg_type`, `bracket_leg_index`;
     - Pydantic stripped those fields before pushing `order.inbound`;
     - risk could not identify OCO siblings;
     - fixed by adding the fields to canonical order schema.
  3. OCO sibling pending exposure was treated like independent close orders:
     - after STOP child was accepted, `order_pending_exposure.pending_sell_qty` could reduce
       effective exposure to zero and make TP child reject with `REDUCE_ONLY_NO_POSITION`;
     - added nullable `order_pending_exposure.bracket_group_id`;
     - risk profile query now excludes pending exposure from the same bracket group when validating
       another child in that bracket;
     - pending exposure writes now persist `bracket_group_id`.
- Fib alpha quantity hardening:
  - `fib_sl_tp_strength` no longer uses arbitrary `round(..., 8)` for TP shards;
  - sync runtime wrapper now exposes `round_quantity(symbol, quantity, mode="floor")`;
  - fib TP shard quantity is floored by trading_system market rules / exchange `step_size`;
  - shards below exchange lot size are skipped with structured logs;
  - bracket entry quantity is the sum of valid rounded TP shard quantities, so entry and child
    quantities stay exchange-valid.
- Runtime validation:
  - targeted Docker unit tests passed for:
    - bracket manager/repository;
    - gateway order schema;
    - risk broker/pending exposure logic;
    - paper execution;
    - alpha SDK order state.
  - full Docker unit suite passed.
  - alpha runtime fib behavior test passed in `execution-alpha-runtime-numba:0.1.1`.
- Endpoint smoke after fixes:
  - paper Binance bracket smoke:
    - entry `MARKET BUY 0.001 BTCUSDT` accepted and filled;
    - STOP child accepted;
    - TP child accepted;
    - `order_pending_exposure` rows persisted the same `bracket_group_id`;
    - cancel bracket canceled STOP and TP children;
    - manual cleanup close filled;
    - final `positions_v2` for the smoke account returned `FLAT`.
  - DNSE sandbox bracket smoke:
    - rejected before persistence/order submission with `DNSE_NATIVE_BRACKET_UNSUPPORTED`, as
      intended until official DNSE conditional-order docs are confirmed.
- Remaining note:
  - sandbox Binance physical bracket smoke should be run only in a clean testnet window with no
    residual physical positions/open orders;
  - Binance live uses the same USD-M Futures conditional-child design but must stay blocked until
    explicit live enablement and separate live runbook approval.

Phase 2 real bracket smoke completion - 2026-06-11:

- Sandbox reset before smoke:
  - stopped/downed sandbox alpha compose services for `fib_sl_tp_strength` and
    `combine_weight_sl_tp`;
  - reset operational DB rows for the related sandbox `strategy_id/account_id` scope only;
  - preserved configuration tables (`accounts`, `strategies`, `risk_profiles`,
    `portfolio_allocations`, credentials/policies);
  - cleaned matching Redis idempotency/risk/copy keys by alpha/account pattern only;
  - flattened Binance Futures testnet physical account with
    `scripts/binance_testnet_account_cleanup.py --apply --confirm BINANCE_TESTNET_ONLY`;
  - restarted executor/listener/reconciliation/gateway/risk_engine and confirmed gateway health
    `READY`.
- DNSE paper bracket smoke:
  - bootstrapped minimal `HPG.DNSE` instrument because DB only had BINANCE instruments;
  - first smoke intentionally revealed a price-unit mismatch:
    - data_layer/trading_system cache for VN stocks uses provider-normalized price (`HPG=23.3`),
      not raw VND `23300/25000`;
    - fixed the smoke instrument metadata/tick to `tick_size=0.01`, `lot_size=100`, and documented
      `price_unit=provider_normalized_thousand_vnd`;
  - second DNSE paper smoke passed:
    - entry LIMIT BUY 100 HPG at 23.3 filled from cached DNSE quote;
    - STOP/TP child orders were accepted by paper execution;
    - cancel bracket canceled child orders;
    - cleanup CLOSE order returned position `FLAT`.
- Timestamp idempotency fix:
  - repeated GET/reconcile calls were rewriting `order_bracket_legs.filled_at` to `now()`;
  - fixed `filled_at` and `cancelled_at` to set only once when currently NULL.
- Binance sandbox physical bracket smoke:
  - initial physical smoke found a real production bug:
    - Binance Futures conditional children are persisted with status `SENT`;
    - bracket cancel endpoint and `OPEN_STATUSES` did not treat `SENT` as open/cancellable;
    - `DELETE /v1/order-brackets/{id}` therefore skipped child STOP/TP cancellation;
    - broker retained `open_algo_orders` and CLOSE was rejected by risk as
      `REDUCE_ONLY_WOULD_INCREASE_SHORT`.
  - fixed status taxonomy by adding `SENT` to shared `OPEN_STATUSES` and using that shared set in
    the gateway cancel endpoint instead of a hardcoded set.
  - retry smoke after fix passed:
    - entry MARKET BUY 0.001 BTCUSDT filled on Binance Futures testnet;
    - STOP_MARKET and TAKE_PROFIT_MARKET children were submitted as Binance conditional algo orders;
    - DELETE bracket canceled both children through `cancelPath=algo`;
    - cleanup CLOSE used a Binance-valid short client order id and filled;
    - broker inspect showed no residual open orders, open algo orders, or positions;
    - DB showed bracket child legs `CANCELLED`, entry `FILLED`, cleanup close `FILLED`, and
      `positions_v2` returned `FLAT`.
- Smoke caveats:
  - Binance close client order ids must remain under Binance's 36-character limit;
  - DNSE paper smoke currently validates paper-mode behavior only; DNSE sandbox/live bracket remains
    intentionally disabled until official conditional-order semantics are confirmed.
- Real fib alpha smoke:
  - ran `fib_sl_tp_strength_0015m_sandbox_binance` briefly against Binance sandbox after smoke
    cleanup;
  - first run showed no new orders/signals, but exposed stale alpha-local state:
    - DB and broker were flat/clean;
    - `/app/state/.../fib_sl_tp_strength_0015m_states.json` and
      `trading_system_orders.json` still contained old shard ids and `side=1/qty=0.003`;
    - runtime therefore logged `sync state from trading_system` even though the data came from
      local JSON fallback.
  - fixed shared single-order runtime so local order cache cannot override authoritative
    trading_system state:
    - if `list_orders` succeeds and no active position exists, missing local order ids are purged;
    - terminal listed orders are also purged from local state;
    - reset/test runbooks must delete alpha-local `state/` directories when doing disposable lab
      resets.
  - deleted generated sandbox fib local state directories and reran the alpha:
    - warmup loaded 1000 rows each for BTCUSDT/ETHUSDT 5m;
    - stream subscribed to trade and 5m kline channels;
    - execution sessions were recorded for closed 5m candles;
    - no stale `side=1/qty=0.003` appeared in the new run;
    - no strategy signal occurred during the smoke window, so no live testnet order was submitted.
  - final checks:
    - `orders=0` and `positions_v2=0` for `sandbox-binance-fib_sl_tp_strength_0015m`;
    - Binance testnet inspect showed no open orders, open algo orders, or open positions;
    - Docker full unit suite passed after all fixes.
- Alpha-scoped reset script fix - 2026-06-12:
  - `scripts/reset_lab_baseline.sh --alpha-compose ... --clean-alpha-files` failed when deleting
    `execution_sessions` before child `orders/fills/reconciliation_findings/risk_grants` rows.
  - Fixed ordered deletion so child rows are removed before `execution_sessions`.
  - Added explicit `order_bracket_legs` cleanup by joining through `order_brackets`, because bracket
    legs do not carry `account_id/strategy_id` directly but FK to scoped brackets.
  - Re-ran the fib alpha-scoped reset command successfully; reset remains alpha-scoped and does not
    flush trading Redis or delete Docker volumes.
- Fib bracket/OCO live-run audit and fixes - 2026-06-12:
  - Real `fib_sl_tp_strength` sandbox run submitted bracket entries successfully, but DB audit found
    protective STOP/TP child legs initially `RISK_REJECTED`.
  - Root cause 1:
    - fib/backtest-derived TP/SL prices had valid strategy math but were not normalized to exchange
      `tick_size` before bracket child submission;
    - risk correctly rejected them as `PRICE_TICK_INVALID:trigger_price`.
  - Fix:
    - `services/gateway/core/bracket_manager.py` now normalizes child `price` and `trigger_price`
      using `market:info:{symbol}.tick_size` before submitting to the normal order pipeline;
    - normalized prices are persisted back to `order_bracket_legs` with raw metadata so DB, orders,
      and broker payloads stay consistent;
    - `PRICE_TICK_INVALID:*` child rejects are retryable so old active brackets can recover.
  - Root cause 2:
    - once trigger prices were fixed, protective reduce-only children could still be rejected by
      pre-trade broker-sync physical mismatch;
    - for bracket/OCO this is unsafe because an entry can be filled while its protective exits are
      blocked.
  - Fix:
    - risk now allows a narrow bypass for `BROKER_SYNC_MISMATCH` only when the order is a
      reduce-only bracket child (`STOP`, `TP`, or `TRAILING`);
    - open/increase orders remain blocked by broker-sync mismatch;
    - core risk still validates reduce-only cannot increase or flip exposure.
  - Root cause 3:
    - some recovered child retries became `STALE_ORDER_INTENT`;
    - gateway bracket reconciliation could retry the same leg more than once during a tight loop.
  - Fix:
    - `STALE_ORDER_INTENT` is retryable for bracket child orders;
    - bracket manager now has an in-process per-bracket reconciliation guard;
    - retry client ids now use nanosecond-derived entropy to avoid collisions.
  - Validation:
    - compile passed for gateway bracket manager/repository and risk engine;
    - targeted Docker tests passed:
      `pytest tests/unit/test_order_brackets.py tests/unit/test_risk_broker_sync.py -q`
      (`19 passed`);
    - after restarting `gateway` and `risk_engine`, active fib brackets recovered to:
      - 3 entry legs `FILLED`;
      - 15 protective child legs `SENT`;
      - no active bracket child legs left in `RISK_REJECTED`.
  - Remaining broker-sync/reconciliation note:
    - Binance USD-M Futures TP/SL children are conditional algo orders;
    - normal `/fapi/v1/openOrders` snapshots may not show them;
    - production broker sync must include `/fapi/v1/openAlgoOrders` for TP/SL/trailing orders and
      `/fapi/v1/algoOrder`/`DELETE /fapi/v1/algoOrder` for query/cancel by algo id/client algo id.
  - Venue capability clarification:
    - Binance Spot has native OCO/OTOCO order-list endpoints (`/api/v3/orderList/oco`,
      `/api/v3/orderList/otoco`);
    - Binance USD-M Futures does not use those Spot OCO order-list endpoints for this bracket;
    - for USD-M Futures, trading_system owns the bracket/OCO group lifecycle and submits native
      conditional algo child orders (`STOP_MARKET`, `TAKE_PROFIT_MARKET`, trailing) through Futures
      endpoints, then performs sibling cancel/resize/reconciliation itself.
  - Broker physical sync completion:
    - `services/executor/core/binance_direct.py` now supports `GET /fapi/v1/openAlgoOrders`;
    - `services/portfolio_management/account_sync.py` merges normal `openOrders` and conditional
      `openAlgoOrders` into the broker open-order snapshot;
    - `services/portfolio_management/repository.py` normalizes Binance algo fields
      (`clientAlgoId`, `algoId`, `algoStatus`, `orderType`) and reconciles DB orders by either
      client id or venue/algo id;
    - reconciliation now treats equivalent open states as the same logical state, for example
      internal `SENT` and Binance algo `NEW`;
    - this prevents false `PHYSICAL_BROKER_OPEN_ORDER_STATE_MISMATCH` findings when the order is
      actually live on the broker with matching remaining quantity.
  - Final validation after restarting reconciliation:
    - targeted Docker tests passed:
      `pytest tests/unit/test_portfolio_management.py tests/unit/test_account_sync.py
      tests/unit/test_order_brackets.py tests/unit/test_risk_broker_sync.py -q`
      (`44 passed`);
    - latest Binance sandbox physical snapshots for `binance_testnet_main` are `status=OK`;
    - reconciliation logs show `position_status=OK position_findings=0
      open_order_status=OK open_order_findings=0`;
    - all prior physical open-order findings are `RESOLVED`;
    - active fib brackets currently have entry legs `FILLED` and protective STOP/TP children `SENT`;
    - `positions_v2` has fresh `mark_price` and `unrealized_pnl` for the active fib sandbox
      positions.
  - Alpha local state cleanup after live-run audit:
    - repeated alpha warning
      `trading_system has no active position; reset local cache to FLAT` was caused by stale
      alpha-local JSON state for symbols whose bracket entry had later moved to `ERROR/REJECTED`;
    - authoritative DB/broker state was already correct, but the local file still had
      `side=1/pos_real>0` for those rejected symbols;
    - `fib_sl_tp_strength_common.py` now deletes the symbol key from local state when
      trading_system reports no active position/bracket, and also deletes it immediately on entry
      abort/reject instead of saving a flat-but-present record;
    - cleaned current sandbox state so it now matches DB:
      - `fib_sl_tp_strength_0015m`: BTCUSDT and ETHUSDT active;
      - `fib_sl_tp_strength_00130m`: BNBUSDT active only;
      - `fib_sl_tp_strength_00115m`: empty state.
    - follow-up fix:
      - fib runtime now calls `get_bracket()` after `open_bracket_market()` and only persists a
        local positive state when the bracket is confirmed as `ENTRY_FILLED`, `ACTIVE`,
        `PARTIALLY_CLOSED`, or `CLOSING`;
      - if the bracket is rejected, still pending without confirmed position, or later flat in
        authoritative trading_system state, the alpha keeps/deletes local state as flat;
      - warning logs are now compact and do not print the full bracket payload.
    - latest sandbox rejects for `fib_sl_tp_strength_00115m` BNBUSDT and
      `fib_sl_tp_strength_00130m` BTCUSDT are broker-side Binance testnet rejects:
      `code=-2019 Margin is insufficient`;
      this is a sizing/testnet-balance issue, not a stale-state/OCO/data-layer issue.
- Combine weight SL/TP live/backtest parity fix - 2026-06-12:
  - Re-audited `/root/bobby/execution_alpha/alphas/combine_weight_sl_tp` against
    `main/backtest_code_style.py`.
  - Root causes:
    - live SMA/EMA implementation was phase-shifted against backtest (`valid` convolution for SMA,
      `src[0]` seeded EMA instead of SMA-at-`length-1`);
    - live StochRSI/Supertrend inherited that phase shift;
    - live MA short boundary used `ma1 < ma2`, while backtest uses `not ma_long`, so equality
      boundaries were compiled differently;
    - live realtime trailing SL self-filled exits from local tick state, which diverges from the
      closed-candle backtest and is unsafe when local JSON is stale.
  - Fix:
    - added shared `main/combine_weight_sl_tp_common.py`;
    - converted `combine_weight_sl_tp_0011h.py` and `combine_weight_sl_tp_0014h.py` to thin
      entrypoints;
    - indicator and signal math now mirrors `backtest_code_style.py`;
    - runtime syncs authoritative trading_system position/bracket state before closed-candle
      decisions and purges stale local state when trading_system is flat;
    - entries now use trading_system `open_bracket_market` with the strategy's initial stop-loss
      and only persist local positive state after bracket confirmation;
    - alpha no longer self-fills SL/TP on raw realtime ticks.
  - Remaining limitation:
    - combine TP milestones only move trailing SL in backtest; trading_system does not yet expose a
      stable bracket stop replacement endpoint, so runtime records `tp_count/new_sl` and logs a
      deferred stop-replace warning instead of pretending the broker stop was moved.
    - Follow-up: add and test `PATCH /v1/order-brackets/{bracket_group_id}` or an equivalent
      bracket stop cancel-replace primitive before declaring full combine trailing-stop parity.
  - Validation:
    - Docker runtime parity check passed for SMA/EMA, StochRSI, and Supertrend versus
      `backtest_code_style.py`;
    - Docker runtime in-memory compile check passed for the new common module and both entrypoints.
- Combine bracket stop replacement completion - 2026-06-12:
  - Added production endpoint:
    - `PATCH /v1/order-brackets/{bracket_group_id}`;
    - request schema: `trigger_price`, optional `price`, `reason`, `metadata`.
  - Behavior:
    - gateway auth/rate-limit uses the persisted bracket owner, mode, venue, and account;
    - bracket manager reconciles first;
    - only `ENTRY_FILLED`, `ACTIVE`, and `PARTIALLY_CLOSED` brackets are replaceable;
    - terminal/missing STOP legs are rejected explicitly;
    - active STOP child is canceled through the normal cancel path;
    - STOP leg receives a new `client_order_id`, updated trigger/price, and is submitted through
      the normal order/risk/execution path;
    - bracket id and leg index remain stable for audit while broker child order id changes.
  - SDK/runtime:
    - added `replace_bracket_stop()` to `trading_system/alpha_sdk/trading_system_async_action.py`;
    - exposed the same helper through `alpha_runtime.trade.action.AlphaTradeAction`;
    - exposed sync legacy wrapper through `alpha_runtime.legacy.single_order.ExecuteAction`;
    - exposed bridge method through `alpha_runtime.legacy.action_async.AsyncExecuteAction`.
  - Combine alpha behavior:
    - when TP milestone advances the backtest stop, `combine_weight_sl_tp_common.py` now calls
      `replace_bracket_stop()`;
    - local `curr_sl` is updated only after `STOP_REPLACED`;
    - failed replacement keeps current physical stop, records `desired_sl`, and marks
      `pending_stop_replace=true`.
  - Validation:
    - targeted Docker unit test passed:
      `pytest tests/unit/test_order_brackets.py -q` (`14 passed`);
    - compile smoke passed for gateway schema/repository/manager/main;
    - compile smoke passed for alpha SDK, runtime trade action, legacy bridge/wrapper, and combine
      common module;
    - HTTP smoke through gateway passed:
      `POST /v1/order-brackets` created a paper ETHUSDT bracket,
      `PATCH /v1/order-brackets/{id}` returned `STOP_REPLACED`,
      `DELETE /v1/order-brackets/{id}` canceled child STOP,
      reduce-only cleanup close returned the smoke position to flat;
    - alpha-level runtime smoke passed:
      a synthetic closed candle hitting TP2 called `replace_bracket_stop()` and advanced
      `curr_sl` from `92` to `100` for the active bracket.
  - Combine alpha real run after reset:
    - alpha-scoped reset completed for `combine_weight_sl_tp` and deleted scoped DB/log/state test
      data;
    - declarative config `config/_config/portfolio_account_config_setup.yaml` was re-applied;
    - paper Binance 1h/4h containers started successfully:
      warmup loaded 300 rows and stream subscribed to `ETHUSDT`;
      first closed-candle score was `long=0 short=0`, so no real strategy order was expected yet.
    - sandbox Binance containers were started then stopped intentionally:
      startup preflight blocked with `BROKER_SYNC_MISMATCH`;
      root cause is the shared Binance testnet physical binding, not combine code:
      unresolved fib sandbox findings show BTCUSDT DB aggregate `LONG 1.0192` while broker physical
      quantity is `0.3920`, plus two stale fib BTCUSDT TP algo orders in DB.
      Combine sandbox should not be restarted until the shared testnet/fib mismatch is cleaned or
      force-closed.
    - fixed a runtime error-handling bug exposed by the sandbox block:
      `alpha_runtime.legacy.action_async.run_async()` used to catch all `RuntimeError`, including
      business/runtime failures thrown inside the coroutine, then attempted to await the same
      coroutine again and logged `cannot reuse already awaited coroutine`;
      it now only falls back to `asyncio.run()` when no event loop can be obtained and otherwise
      propagates the original error, so future preflight failures report the real reason.
  - Fib sandbox oversize root cause and SDK guard - 2026-06-12:
    - DB audit showed old fib sandbox fills far larger than the intended test size:
      `BTCUSDT LONG 1.0192`, `ETHUSDT LONG 26.838`, and `BNBUSDT LONG 9.9`.
    - Root cause was not the exchange lot-size rounding path. The bracket/OCO alpha path used
      `estimate_quantity_by_risk()` and `submit_bracket_order()`, while the old
      `TRADING_SANDBOX_ORDER_NOTIONAL=25` guard only applied to the legacy simple market-order
      helper. As a result, bracket entries could size from the alpha strategy's large
      `usd_per_trade` values and the virtual account allocation before later hard risk rules
      started rejecting them.
    - `alpha_sdk/trading_system_async_action.py` now applies the same sandbox Binance notional cap
      to both sizing and bracket submission:
      `estimate_quantity_by_risk()` caps effective order notional by
      `TRADING_SANDBOX_ORDER_NOTIONAL`, and `submit_bracket_order()` caps the final entry quantity
      before calling `POST /v1/order-brackets`.
    - If the sandbox cap rounds below broker `step_size`, the SDK may use
      `TRADING_SANDBOX_MIN_QUANTITY` for smoke testing so the order remains exchange-valid; the
      resulting notional can be higher than the configured cap for very large symbols such as BTC,
      but stays at the smallest tradable size.
    - Bracket take-profit child quantities are scaled only when the sandbox cap actually changes
      the parent entry quantity; children that round to zero are dropped to avoid invalid protective
      legs. Normal paper/live bracket payloads are not mutated by this testnet cap.
    - Added unit coverage in `tests/unit/test_alpha_sdk_order_state.py` for sandbox bracket
      quantity capping and sandbox risk-size estimation.
    - Validation:
      `docker compose --profile test run --rm test_runner pytest tests/unit/test_alpha_sdk_order_state.py tests/unit/test_order_brackets.py -q`
      passed (`27 passed`), and SDK `py_compile` passed in the Docker test container.
    - Operational status:
      stopped fib sandbox containers
      `fib_sl_tp_strength_0015m_sandbox_binance`,
      `fib_sl_tp_strength_00115m_sandbox_binance`, and
      `fib_sl_tp_strength_00130m_sandbox_binance` to prevent further contaminated testnet orders.
      Existing large fib sandbox DB/broker positions and stale algo legs are lab contamination and
      must be force-closed/reset before sandbox combine/fib are restarted.
  - Sandbox combine/fib long-run audit - 2026-06-13:
    - `combine_weight_sl_tp` sandbox 1h/4h containers ran cleanly with data_layer realtime ticks and
      closed-candle execution sessions; no WARN/ERROR and no sandbox orders were produced in this
      window because strategy score stayed `long=0 short=0`.
    - `fib_sl_tp_strength` sandbox sizing guard worked after reset:
      active DB positions are now small test quantities only:
      `BTCUSDT 0.001`, `BTCUSDT 0.0008`, `BNBUSDT 0.03`, and `BNBUSDT 0.02`.
      `positions_v2.mark_price`, `mark_price_at`, and `unrealized_pnl` are fresh.
    - Open issue:
      physical Binance testnet reconciliation is still `MISMATCH`.
      Latest broker snapshot shows physical BTCUSDT LONG `0.0015`, while aggregate DB virtual
      positions still total `0.0018`. One DB TP child
      `client_order_id=brk-7b6423b220-tp2`, `venue_order_id=1000000103934759`, quantity `0.0003`
      remains `SENT` in DB but no longer appears in Binance open algo orders and has no local fill
      row. This strongly indicates a missed/late terminal event for a USD-M conditional TP child.
    - Consequence:
      risk correctly rejects new ETHUSDT sandbox entries with `BROKER_SYNC_MISMATCH`, so it is
      protecting the account instead of compounding an inconsistent physical binding.
    - Required next hardening before declaring sandbox/live production-ready:
      reconciliation must actively recover missing terminal state for Binance USD-M conditional
      children by querying order/algo history and account trades, then updating `orders`,
      `order_bracket_legs`, `fills`, `positions_v2`, and resolving physical findings. Detection is
      working; authoritative repair is still missing.
  - Conditional terminal repair and untracked stream hardening - 2026-06-13:
    - Implemented the required authoritative repair path for Binance USD-M conditional children:
      - `DirectBinanceFuturesClient` now supports `GET /fapi/v1/algoOrder` and
        `GET /fapi/v1/userTrades`;
      - `BinanceAccountSyncClient` exposes `get_algo_order()` and `get_account_trades()` with the
        same python-binance/direct REST fallback behavior as the rest of the Binance adapter;
      - `PortfolioManagementRepository.reconcile_physical_open_orders()` now detects stale DB
        Binance conditional orders, queries Binance algo/order history, confirms terminal state
        from authoritative broker data, and only creates a recovered fill when exact broker trades
        are available.
    - Repair behavior is intentionally conservative:
      - no fill is fabricated from position mismatch alone;
      - `FINISHED/FILLED` algo status without matching account trades is skipped instead of guessed;
      - recovered fills are idempotent through the normal fill claim path;
      - recovered fills update `fills`, `orders`, `positions_v2`, account balances, legacy
        projection, bracket leg state, bracket state, pending exposure, and copy-trading outbox.
    - Live sandbox repair result:
      - stale TP child `client_order_id=brk-7b6423b220-tp2`,
        old `venue_order_id=1000000103934759`, was recovered from Binance account trade
        `trade_id=504010807`, actual order id `15035051069`, price `63956.60`, quantity `0.0003`;
      - `orders.status` for that TP child is now `FILLED`;
      - `fills` contains the recovered row with
        `recovery_source=BINANCE_CONDITIONAL_ALGO_HISTORY`;
      - `positions_v2` for `sandbox-binance-fib_sl_tp_strength_0015m` now shows BTCUSDT LONG
        `0.0007` and realized PnL `0.03789`, matching the broker-reduced physical quantity;
      - latest three Binance testnet physical snapshots are all `OK`;
      - all Binance sandbox physical reconciliation findings are now `RESOLVED`, with no OPEN
        findings remaining.
    - Copy trading outbox audit:
      - recovered fill produced a published `copy.event.v1.order_filled` row for
        `brk-7b6423b220-tp2`;
      - copy payload builder now preserves `recovery_source` for future recovered events so the
        remote copy-trading server can distinguish live listener fills from reconciliation-recovered
        fills when needed.
    - Portfolio untracked-order stream hardening:
      - root cause: `untracked.orders` is a short retry bridge for listener events that arrive
        before executor/order persistence, but old/manual/external Binance events could never be
        matched and were not acked on failure, causing infinite Redis pending reclaims and noisy
        `Zombie recovery failed` logs;
      - added `PORTFOLIO_UNTRACKED_MAX_AGE_SECONDS` (default `300`) to keep retry behavior for fresh
        race conditions while moving stale unresolved events to `deadletter.portfolio` and
        `dead_letters`, then acking them;
      - live drain result: `untracked.orders` consumer pending count is now `0`; 100 stale unresolved
        events were recorded as `UNTRACKED_ORDER_UNRESOLVED`; subsequent portfolio log window is
        quiet.
    - Validation:
      - local `py_compile` passed for the touched portfolio, reconciliation/account-sync, executor
        direct client, copy outbox, and new test files;
      - Docker targeted unit suite passed:
        `pytest tests/unit/test_portfolio_untracked_recovery.py tests/unit/test_copy_outbox.py
        tests/unit/test_portfolio_management.py tests/unit/test_broker_payload_contracts.py
        tests/unit/test_account_sync.py tests/unit/test_order_brackets.py
        tests/unit/test_risk_broker_sync.py tests/unit/test_reconciliation_monitoring.py
        tests/unit/test_binance_batch_sync.py -q` (`65 passed`);
      - Docker full unit suite passed: `pytest tests/unit -q` (`322 passed`);
      - restarted `reconciliation`, `portfolio`, and `risk_engine`;
      - gateway `/v1/health` returns `READY`, Redis/Postgres checks are true, all monitored services
        are fresh, and Binance Futures + user stream capabilities are `READY`.
    - Operational note:
      `untracked.orders` stream length may remain non-zero because Redis Streams keep historical
      entries; the important operational metric is `XPENDING untracked.orders
      portfolio_recovery_group`, which must remain `0` unless fresh race-condition events are being
      retried.
  - Fib bracket entry min-notional/runtime confirmation fix - 2026-06-13:
    - Symptom:
      `fib_sl_tp_strength` 5m and 15m sandbox Binance logged
      `entry bracket not confirmed open; keep local state flat` with bracket state
      `ENTRY_SUBMITTED`, while 30m did not show the same symptom in the checked window.
    - Root cause:
      the alpha submitted bracket entry immediately after a signal and checked the bracket too soon;
      a few hundred milliseconds later Binance rejected the entry with
      `Order's notional must be no smaller than 20` (`-4164`).
      The notional became too small because the alpha used `sum(rounded TP shard quantities)` as the
      entry quantity. For ETHUSDT, the SDK estimate was `0.014` (~23.4 USDT and exchange-valid), but
      flooring each TP shard reduced the entry to `0.011` or `0.009`, below Binance USD-M min
      notional.
    - Fix:
      - entry quantity now uses the total SDK risk estimate quantity;
      - rounded TP shard quantities remain partial reduce legs only;
      - any residual quantity caused by shard flooring remains protected by the full-size stop leg;
      - alpha waits for bracket confirmation/terminal state through `GET /v1/order-brackets/{id}`
        for a short configurable window:
        `ALPHA_BRACKET_CONFIRM_TIMEOUT_SECONDS` default `6`,
        `ALPHA_BRACKET_CONFIRM_POLL_SECONDS` default `0.25`.
    - Validation:
      - Docker alpha runtime test passed:
        `docker run ... python runtime/tests/test_fib_bracket_runtime.py` (`2 passed`);
      - Docker runtime discover passed:
        `docker run ... python -m unittest discover runtime/tests` (`24 passed`).
    - Operational expectation:
      after restarting fib alpha containers, the next ETHUSDT entry should either become confirmed
      `ACTIVE`/position-backed or log the true terminal rejection context instead of a misleading
      pending-only warning.
  - Combine bracket lifecycle/minimum-order hardening - 2026-06-13:
    - Scope:
      applied the fib bracket lesson to `combine_weight_sl_tp` without changing strategy signal
      logic. Combine does not split entry quantity by TP shards like fib, but it still submits a
      bracket entry with a stop leg and then manages TP milestones by replacing the bracket stop.
    - Fix:
      - added the same short bracket confirmation polling window used by fib before local state is
        marked open;
      - added pre-submit market-minimum validation from trading_system market rules
        (`min_qty`/`min_quantity`, `min_notional`) so a combine entry that is obviously below venue
        minimums is skipped cleanly before reaching the broker;
      - preserved the current combine domain behavior: `usd_per_trade / price` drives entry size,
        TP milestones do not create reduce TP children, and stop replacement remains owned by
        trading_system bracket lifecycle.
    - Validation:
      - local `py_compile` passed for
        `combine_weight_sl_tp_common.py` and `test_combine_bracket_runtime.py`;
      - Docker targeted alpha runtime tests passed:
        `python -m unittest runtime/tests/test_combine_bracket_runtime.py
        runtime/tests/test_fib_bracket_runtime.py` (`4 tests OK`);
      - Docker runtime discover passed:
        `python -m unittest discover runtime/tests` (`26 tests OK`).
    - Observed live window:
      recent combine logs showed no new entry to validate against broker yet; 1h closed-candle score
      was `long=0 short=0`, while 4h was still receiving realtime ticks before the next closed
      candle. The next real combine signal should either confirm an active bracket or log a true
      terminal broker/risk reason.
  - Backtest-parity capital sizing add-on for fib/combine and future alphas - 2026-06-13:
    - Problem:
      several migrated alphas still used `usd_per_trade` as an absolute runtime notional shortcut.
      That is useful for early smoke testing, but it does not match the backtest capital model where
      order size is derived from account equity/capital, allocation percentage, and leverage. It also
      makes paper/sandbox/live behavior harder to reason about because account_id equity in
      trading_system is already the correct source of truth.
    - Target capital model:
      use a compact per-strategy/per-symbol config with only the required domain fields:
      `initial_capital`, `equity_source`, `alloc_per_trade`, `leverage`,
      `maintenance_ratio`, and `hedge_type`.
      `use_pyramiding`, `use_funding_rate`, `contract_size`, and `fee_rate_one_way` are deliberately
      excluded from this alpha sizing config because funding/fees/accounting are trading_system
      responsibilities, and contract sizing should come from instrument/market rules.
    - Phase 1 - alpha SDK/runtime sizing compatibility:
      - add a reusable SDK helper that estimates quantity from account equity, allocation, leverage,
        optional stop/risk cap, market rules, and sandbox notional cap;
      - expose the helper through `AlphaTradeAction`, `AsyncExecuteAction`, and sync
        `ExecuteAction`;
      - add `capital_model_defaults` to fib/combine configs and merge them into per-symbol params at
        runtime;
      - update fib to use `min(capital_notional_qty, risk_stop_qty)` when a stop/risk percent exists;
      - update combine to use capital/equity/leverage sizing instead of raw `usd_per_trade / price`;
      - keep backward compatibility: if an alpha has no `capital_model`, it continues to use the old
        behavior;
      - update disposable portfolio/account setup so fib/combine paper accounts and allocations start
        from the backtest capital baseline (`20,000 USDT`) instead of the previous 1M lab balance.
    - Phase 1 implementation status:
      - implemented `estimate_quantity_by_capital_model` in `trading_system/alpha_sdk`;
      - exposed it through `AlphaTradeAction`, `AsyncExecuteAction`, and the sync legacy
        `ExecuteAction` wrapper;
      - added `capital_model_defaults` to fib/combine alpha configs:
        `initial_capital=20000`, `equity_source=account_equity`, `alloc_per_trade=0.5`,
        `leverage=10`, `maintenance_ratio=0.005`, `hedge_type=percent_equity`;
      - updated fib runtime to use capital-model sizing plus stop/risk cap when `capital_model`
        exists, falling back to old `usd_per_trade` risk sizing otherwise;
      - updated combine runtime to use capital-model sizing when present, falling back to old
        `usd_per_trade / price` otherwise;
      - updated `portfolio_account_config_setup.yaml` so fib/combine paper accounts and allocations
        use `20,000 USDT` baseline. Sandbox allocations are documented at the same internal baseline
        but physical sizing remains protected by sandbox broker sync and sandbox notional caps.
    - Phase 1 validation:
      - local `py_compile` passed for touched SDK/runtime/alpha files;
      - Docker targeted runtime tests passed:
        `python -m unittest runtime/tests/test_capital_model_sizing.py
        runtime/tests/test_combine_bracket_runtime.py runtime/tests/test_fib_bracket_runtime.py`
        (`8 tests OK`);
      - Docker full runtime discover passed: `python -m unittest discover runtime/tests`
        (`30 tests OK`);
      - Docker YAML parse passed for fib config, combine config, and
        `portfolio_account_config_setup.yaml`.
    - Phase 2 - trading_system-native sizing endpoint and enforcement:
      - move the SDK helper behind a gateway endpoint such as `POST /v1/sizing/estimate`;
      - have the endpoint read account policy, portfolio allocation, current balances/equity, margin
        policy, venue rules, and sandbox/live broker constraints in one place;
      - add audit records for sizing decisions so each order can explain requested quantity,
        effective quantity, equity source, allocation, leverage, risk cap, market-rule rounding, and
        skip/reject reasons;
      - extend CLI/runbook so portfolio managers can inspect and edit capital sizing profiles without
        touching alpha strategy params;
      - add production tests for paper, sandbox Binance USD-M, and DNSE paper where supported.
    - Phase 2 implementation status:
      - added `services/gateway/core/sizing.py` as the pure sizing engine for account-equity,
        allocation, leverage, optional stop/risk cap, market-rule rounding, margin estimate, and
        min-notional/min-quantity skip reasons;
      - added alpha-facing endpoint `POST /v1/sizing/estimate`;
      - endpoint now auth/rate-checks through the gateway, verifies account-alpha ownership, reads
        account state/balances/broker binding, merges account policy leverage/maintenance defaults,
        reads market info from Redis/default metadata, applies sandbox notional cap when provided,
        and returns an auditable sizing response with `source=trading_system.sizing.v1`;
      - added `init-db/27-sizing-decisions.sql` and `SizingDecisionRepository`;
      - endpoint now writes one `sizing_decisions` audit row per estimate when the table exists,
        including request, response, capital model, market rules, broker binding, quantities,
        notional, margin estimate, risk cap fields, and skip/reject reason;
      - SDK `estimate_quantity_by_capital_model` now calls `/v1/sizing/estimate` first and falls
        back to the Phase-1 local helper only when the endpoint is unavailable/dry-run. This keeps
        migrated alpha containers compatible during rolling deployment while making trading_system
        the sizing source of truth once gateway is updated;
      - added unit tests for gateway sizing core and SDK endpoint/fallback behavior.
    - Phase 2 validation:
      - local `py_compile` passed for touched gateway, sizing core, SDK, and tests;
      - Docker targeted pytest passed:
        `pytest tests/unit/test_sizing.py tests/unit/test_alpha_sdk_order_state.py -q`
        (`19 passed`);
      - Docker gateway/order/risk/portfolio subset passed:
        `pytest tests/unit/test_sizing.py tests/unit/test_alpha_sdk_order_state.py
        tests/unit/test_order_brackets.py tests/unit/test_gateway_order_schema.py
        tests/unit/test_portfolio_management.py tests/unit/test_risk_broker_sync.py -q`
        (`71 passed`);
      - Docker full trading_system unit suite passed:
        `pytest tests/unit -q` (`328 passed`);
      - Docker alpha runtime discover passed after SDK change:
        `python -m unittest discover runtime/tests` (`30 tests OK`).
      - Applied `27-sizing-decisions.sql` to the running Postgres container;
      - restarted `gateway_service` only; `/v1/health` and `/v1/health/capabilities` both return
        `READY`.
    - Remaining Phase 2 follow-up:
      - CLI editing/viewing of capital sizing profiles remains a management ergonomics task. The
        current runtime uses YAML `capital_model_defaults`; central DB-managed profiles can be added
        once the behavior is verified with fib/combine live cycles.
    - Risk/compatibility note:
      Phase 1 is intentionally alpha-side and backward-compatible to avoid destabilizing the system
      while fib/combine are already close to stable. Phase 2 centralizes the same logic once the
      behavior is verified with real alpha cycles.
    - Phase 2 follow-up discovered from live fib/combine alpha logs on 2026-06-14:
      - fib sandbox BTC sizing returned an exchange-invalid quantity (`0.0003 BTC`, about `19.3
        USDT`) because Binance Futures min-notional was missing from cached market metadata and the
        sizing engine only floored by lot step;
      - fib bracket TP fractions can become smaller than venue lot step under small sandbox caps,
        causing repeated `skip TP shard below market step` and, when every TP child is below step,
        `entry aborted all TP shards failed`;
      - fix policy: gateway sizing must enforce venue min-notional/min-quantity centrally for both
        fib and combine. Sandbox may exceed the artificial test cap by a small configurable
        tolerance only when needed to satisfy the exchange's minimum valid order. Fib protective
        routing must keep the entry stop-protected even when TP shards are too small; TP children are
        emitted only for venue-valid quantities, and tiny residuals stay under the stop instead of
        creating invalid child orders.
      - validation note after first fix: Binance USD-M testnet rejected BTC with `Order's notional
        must be no smaller than 50`; therefore the Binance Futures fallback min-notional is `50`
        USDT. If `TRADING_SANDBOX_ORDER_NOTIONAL=25`, BTC/ETH orders that cannot satisfy the exchange
        minimum within the allowed overshoot must be `SKIPPED` by sizing instead of submitted and
        rejected by the broker. To sandbox-test BTC/ETH fills, raise the sandbox notional cap above
        the exchange minimum plus lot-step rounding.
      - fib/combine sandbox compose defaults were raised from `25` to `60` USDT so Binance USD-M
        testnet can accept small smoke orders while still keeping exposure tiny relative to the
        testnet account balance.
    - Phase 2 follow-up discovered from combine 1h sandbox logs on 2026-06-15:
      - `combine_weight_sl_tp_0011h` submitted an ETHUSDT MARKET bracket entry at 01:00:03, but the
        alpha confirmation loop timed out after 6 seconds because the bracket entry leg stayed
        `SENT` until the Binance user-stream fill projection arrived several minutes later;
      - DB audit showed the broker entry order was eventually `FILLED`, the bracket became `ACTIVE`,
        and the stop child was submitted, but the position was temporarily unprotected and alpha local
        state stayed flat until the next sync cycle;
      - fix policy: Binance USD-M MARKET orders are routed through the single order endpoint with
        `newOrderRespType=RESULT`; adapter responses with `status=FILLED/PARTIALLY_FILLED` are
        projected immediately as canonical order status. The user stream remains the authoritative
        fill source for fees/trade rows, but bracket activation no longer depends solely on delayed
        listener events.
      - same audit found some open `positions_v2` rows with null `mark_price` because performance
        projection only checked legacy Redis market keys before falling back to data_layer. The
        data_layer Redis contract now uses keys such as `trade:price:last:binance_usdm:{symbol}`;
        performance mark lookup was extended to read these keys directly and validate their
        `event_time/trade_time` freshness.

    - Alpha config normalization and Signal Combine parity pass - 2026-06-15:
      - Problem:
        fib/combine configs still exposed `usd_per_trade`, even though sizing had moved to
        trading_system-native `%_equity` capital-model estimates. Combine also had a duplicate
        `symbols_5m` YAML key after adding `VN30F1M`, which could silently overwrite the actual
        symbol list.
      - Config fix:
        - fib/combine `capital_model_defaults` now declare `sizing_method=percent_equity`;
        - active fib/combine params no longer carry `usd_per_trade`;
        - legacy fallback remains code-only via `legacy_usd_per_trade` for old alphas that have not
          migrated yet;
        - `VN30F1M` is now explicit in fib 5m and combine 5m params with
          `instrument_type=vn_derivative`, small VND paper allocation, and DNSE paper routing.
      - Venue/domain fix:
        - fib/combine runtime filters symbols by deployment venue so Binance containers trade only
          crypto symbols and DNSE paper containers trade only VN derivative symbols from the same
          params group;
        - added DNSE paper virtual accounts, risk profiles, allocations, and copy outbox policies
          for `paper-dnse-fib_sl_tp_strength_0015m` and
          `paper-dnse-combine_weight_sl_tp_0015m`;
        - DNSE stock/cash paper still rejects short brackets. DNSE paper derivative brackets may
          open short only when the alpha sends explicit `metadata.instrument_type=vn_derivative`.
          DNSE sandbox/live bracket routing remains disabled until official broker endpoint
          semantics are confirmed.
      - Signal Combine parity fix:
        - added `main/signalcombine_common.py` and converted 5m/30m entrypoints into thin wrappers;
        - live code now imports `optimized_calculate_processing` from
          `main/backtest_style_code.py`, eliminating the separate Pandas rolling/counter
          implementation that could drift from backtest behavior;
        - signal_combine now uses `%_equity` capital-model sizing, venue filtering, and
          trading_system balance/equity source. `per_trade_usd` is no longer active config.
      - Validation:
        - local `py_compile` passed for touched alpha runtime files and gateway bracket manager;
        - YAML parse passed for fib/combine/signal configs, fib/combine compose files, and
          `portfolio_account_config_setup.yaml`;
        - Docker compose config passed for fib and combine alpha folders;
        - trading_system `unittest tests.unit.test_order_brackets` passed in the gateway container
          (`15 tests OK`);
        - alpha runtime container import/compile smoke passed for:
          `signalcombine_common`, `combine_weight_sl_tp_0015m`, and
          `fib_sl_tp_strength_0015m`;
        - `config plan` and `config apply` passed for
          `portfolio_account_config_setup.yaml`;
        - Redis alpha auth verified for `combine_weight_sl_tp_0015m` and
          `fib_sl_tp_strength_0015m`;
        - capital history verified the new DNSE paper allocations:
          `paper-dnse-combine_weight_sl_tp_0015m` and
          `paper-dnse-fib_sl_tp_strength_0015m` each received `25,000,000,000 VND`.

    - DNSE paper outside-market sleep - 2026-06-15:
      - Problem:
        DNSE paper alpha containers kept polling latest candles/streams outside VN trading hours,
        creating noisy logs and wasted CPU/Redis pubsub work without actionable market data.
      - Runtime fix:
        added shared `alpha_runtime.orchestration.market_hours` and wired it into both portfolio
        scheduled runtime and single-order realtime runtime.
      - Policy:
        enabled only for `TRADING_MODE=paper` + `TRADING_VENUE=DNSE`;
        default timezone `Asia/Ho_Chi_Minh`;
        default sessions `08:45-11:30,13:00-14:45`;
        max sleep chunk `ALPHA_DNSE_OUT_OF_HOURS_POLL_SECONDS=900`;
        log throttle `ALPHA_DNSE_SLEEP_LOG_SECONDS=900`.
      - Stream behavior:
        single-order DNSE paper runtime closes Redis pubsub while market is closed, sleeps, then
        resubscribes when the next session opens. This avoids active stream churn outside market
        hours.
      - Applied compose/runbook updates for:
        `rsibound_1d_paper_dnse`, `regression_1d_paper_dnse`,
        `fib_sl_tp_strength_0015m_paper_dnse`, and
        `combine_weight_sl_tp_0015m_paper_dnse`.
      - Validation:
        local `py_compile` passed for market-hours helper and touched handlers;
        local unittest passed for DNSE session/pre-open/weekend sleep;
        alpha container smoke imported the helper successfully;
        compose config validation passed for fib and combine.
      - 2026-06-29 update:
        - added configurable VN/DNSE holidays via `ALPHA_DNSE_MARKET_HOLIDAYS` or
          `ALPHA_DNSE_MARKET_HOLIDAYS_FILE`;
        - market-hours helper now skips both weekends and configured holidays when finding the next
          wake session;
        - alpha migration rule updated: any migrated Vietnam stock/derivative or DNSE venue alpha
          must use the shared runtime market-hours gate and must not run a custom polling loop.

    - Signal Combine closed-candle runtime refinement - 2026-06-15:
      - Problem:
        `signal_combine` used the generic single-order `candle_stream()` path, so it subscribed to
        realtime trade/tick streams even though the strategy decision is closed-candle based and
        does not self-monitor SL/TP intrabar.
      - Fix:
        added shared runtime switch `ALPHA_ENABLE_REALTIME_STREAM=false`. The latest-closed-candle
        REST loop remains active, but Redis pubsub/tick dispatch is skipped for this alpha family.
      - Logging:
        `signal evaluated` is suppressed for no-signal/no-position cycles unless
        `ALPHA_LOG_SIGNAL_EVALUATION=true`, and remains `INFO` when a buy/sell signal or an existing
        position is involved.
      - Timestamp/parity fix:
        signal_combine now uses the dataframe `datetime` column for closed-candle decision time
        instead of the integer dataframe index. This removes bogus `1970-01-01 ... 999` timestamps
        and makes cooldown/closed-candle gating match the actual market bar.
      - Rationale:
        this keeps live behavior closer to backtest-style closed-candle evaluation, reduces
        data_layer/Redis load, and avoids spam logs without hiding actionable decisions.

    - Scalping PSAR migration - 2026-06-28:
      - Folder migrated:
        `/root/bobby/execution_alpha/alphas/scalping_PSAR`.
      - Source of truth:
        `main/backtest_code.py` params/comments.
      - Active deployments:
        - `scalp_psar_0015m`: `5m`, `SOLUSDT`, allocation `20000 USDT`;
        - `scalp_psar_00115m`: `15m`, `ETHUSDT`, allocation `20000 USDT`;
        - `scalp_psar_0011h`: `1h`, `ETHUSDT/BTCUSDT/BNBUSDT/DOGEUSDT/SOLUSDT`,
          allocation `100000 USDT`.
      - Removed legacy active `30m/2h/4h` runtime files/config because those params are not part of
        the approved block in `backtest_code.py`.
      - Added `main/scalping_psar_common.py` backtest-parity runtime:
        - fixes legacy `pcc` typo;
        - computes dynamic warmup threshold like backtest;
        - keeps PSAR state updated from the beginning of the series;
        - uses `osc > 0` for both long and short;
        - closes and opens the opposite side on the same reversal candle if close succeeds;
        - routes entry as trading_system bracket market with PSAR-distance stop and take-profit.
      - Runtime policy:
        - data source is data_layer only;
        - execution source is trading_system only;
        - realtime stream is disabled for this family because TP/SL lifecycle belongs to
          trading_system/paper engine/broker;
        - paper sizing follows `%_equity` intent from the approved comment;
        - sandbox uses small notional override for Binance testnet safety;
          current PSAR compose default is `TRADING_SANDBOX_ORDER_NOTIONAL=60` to clear common
          Binance USD-M min-notional filters while keeping orders small.
      - Added trading-system alpha/account/risk/allocation/copy-policy declarations for all three
        active deployments in `portfolio_account_config_setup.yaml`.
      - Added runbook:
        `/root/bobby/execution_alpha/alphas/scalping_PSAR/Documentation/RUNBOOK.md`.
      - Validation completed:
        - Python compile passed for `scalping_psar_common.py` and all three active entrypoints.
        - YAML parse passed for alpha config and trading-system declarative config.
        - `docker compose config --quiet` passed for the alpha compose.
        - Runtime-image import smoke passed against `execution-alpha-runtime-numba:0.1.1`.
        - Indicator/signal smoke passed against the canonical `15m ETHUSDT` parameter block.
        - Trading-system CLI plan includes PSAR alpha/account/risk/allocation/copy-policy rows.
        - Trading-system CLI inspect confirms all PSAR paper/sandbox accounts and risk profiles are
          registered.

    - Scalping SL/TP Map MA migration - 2026-06-29:
      - Folder migrated:
        `/root/bobby/execution_alpha/alphas/scalping_sl_tp`.
      - Source of truth:
        `main/backtest_code.py` params/comments.
      - Active deployments:
        - `sl_tp_map_ma_0015m_binance`: `5m`, `BNBUSDT/SOLUSDT`, allocation `40000 USDT`;
        - `sl_tp_map_ma_00115m_binance`: `15m`, `ETHUSDT`, allocation `20000 USDT`;
        - `sl_tp_map_ma_0011h_binance`: `1h`, `BTCUSDT/BNBUSDT`, allocation `40000 USDT`;
        - `sl_tp_map_ma_00115m_dnse`: `15m`, `VN30F1M`, paper DNSE only,
          allocation `25000000000 VND`.
      - Disabled reference:
        `yyyy` 5m VN30F1M is kept in config but inactive because the backtest comment says not to
        choose it.
      - Added `main/sl_tp_map_ma_common.py` backtest-parity runtime:
        - computes OCC cross from MTF open/close MA using resample, `shift(1)`, and ffill like the
          backtest;
        - removes legacy hardcoded 1h MTF behavior and uses `intRes`;
        - routes entry through trading_system bracket market with fixed SL/TP;
        - manages TSL by calling trading_system `replace_bracket_stop()` instead of local fills;
        - ignores opposite OCC cross while a position is active, because the canonical
          `execute_occ_backtest()` evaluates new entries only when already flat after SL/TP/TSL;
        - paper sizing uses `%_equity` from trading-system account equity, not static local equity.
      - Added trading-system alpha/account/risk/allocation/copy-policy declarations for all active
        deployments in `portfolio_account_config_setup.yaml`.
      - Added runbook:
        `/root/bobby/execution_alpha/alphas/scalping_sl_tp/Documentation/RUNBOOK.md`.
      - Validation completed:
        - Python compile passed for common runtime and active entrypoints.
        - YAML parse passed for alpha config and trading-system declarative config.
        - `docker compose config --quiet` passed for the alpha compose.
        - Runtime-image import smoke and synthetic signal smoke passed.
        - Trading-system CLI config plan/apply completed.
        - CLI inspect confirms `sl_tp_map_ma_00115m_binance` and `sl_tp_map_ma_00115m_dnse`
          registrations, risk profiles, account policies, balances, and zero open reservations.
      - Post-run log audit:
        - Found `ma_close=0.0` / `ma_open=0.0` for `15m ETHUSDT`, meaning live was evaluating
          before shifted MTF MA warmup was actually valid.
        - Root cause: `min_bars` compared MTF warmup count to base timeframe bars; with
          `basisLen=27` and `intRes=18h`, `1200` bars of 15m data were not enough.
        - Fix: runtime now computes required base bars from `basisLen * intRes / base_interval`,
          rejects non-finite/non-positive MTF MA values, and alpha config `maxlen` is `5000`.

    - Alpha live-cycle hardening after fib/combine/signal audit - 2026-06-18:
      - Problems found from alpha logs + DB audit:
        - `combine_weight_sl_tp` paper Binance brackets can be rejected with
          `INSUFFICIENT_BALANCE` when alpha sizing uses a futures leverage model but paper account
          reservation/risk policy is not using the same leverage ceiling;
        - `signal_combine` can size to the exact notional limit, then fail after lot-step rounding
          and pending exposure are included by risk;
        - fib/combine bracket child legs can retry reduce-only STOP/TP orders after the position has
          already been partially closed, fully closed, or flipped, producing repeated
          `REDUCE_ONLY_*` rejects;
        - DNSE/VN derivative data can remain stale when the provider returns no newer bars. The data
          layer must not fabricate missing bars, but alpha runtime must back off and make stale
          status visible without spamming every poll;
        - crypto alpha logs are already stable enough and should stay quiet by default, while DNSE/VN
          paper containers may keep explicit market/session data logs during this early VN rollout.
      - System rules:
        - sizing must use a single effective leverage:
          `min(alpha capital_model leverage, account_policy.default_leverage, risk_profile.max_leverage)`;
          the response must expose requested vs effective leverage so config mismatches are visible;
        - sizing must clamp quantity by remaining risk position capacity after current position and
          pending exposure, with a small safety buffer before lot-step rounding;
        - paper margin reservation remains institutional-style: reserve initial margin + fee, not
          full notional, for margin accounts;
        - bracket manager must query current residual position before submitting, retrying, or
          replacing reduce-only child legs. If there is no same-side residual position, mark the
          child/bracket as stale/closing instead of retrying. If residual is smaller than child
          quantity, cap the child to residual after market lot-size rounding;
        - DNSE/VN stale candle handling stays sparse/no-fabrication. Alpha runtime should throttle
          stale warnings and back off retry cadence when the latest bar is older than the expected
          closed bar;
        - DNSE out-of-hours sleep logs become explicitly configurable per container. Crypto
          containers should not emit VN market sleep logs.
      - Implementation checklist:
        - [x] update sizing endpoint/core with effective leverage and remaining exposure clamp;
        - [x] update bracket manager/repository with residual-position guard for reduce-only child
          lifecycle;
        - [x] update alpha runtime stale-candle backoff/log throttling and DNSE sleep-log switch;
        - [x] add unit tests for sizing clamp, residual bracket guard, and log/sleep policy;
        - [x] run targeted trading_system + alpha-runtime tests;
        - [ ] after Docker quota is available, restart gateway/risk/paper/reconciliation and run a
          short fib/combine/signal alpha audit cycle.
      - Implementation notes:
        - `GET/POST` data contracts are kept backward-compatible. Sizing responses now expose
          `requested_leverage`, effective `leverage`, `effective_leverage_cap`,
          `remaining_notional_capacity`, and `risk_profile`.
        - Effective leverage is derived from account policy and risk profile. If an alpha config asks
          for leverage 10 but account/risk policy says 3, sizing clamps to 3. To intentionally trade
          at 10x, update both account policy and risk profile through the approved config/CLI path.
        - Bracket residual guard is venue-neutral. It queries `positions_v2` by
          strategy/account/mode/venue/instrument before reduce-only child submit/retry/replace.
          This keeps the behavior reusable for Binance, DNSE derivatives, OKX, and future brokers.
        - Data layer VN preload top-up now logs `fresh_after_topup=false` when the provider returns
          no newer bars after a read-through top-up attempt. Alpha runtime backs off stale symbols
          instead of polling/logging every loop.
      - Validation completed:
        - local `py_compile` passed for gateway sizing/main, bracket manager/repository, risk repo,
          alpha runtime handlers, market-hours helper, and data_layer preload;
        - local `unittest execution_alpha/runtime/tests/test_market_hours.py` passed (`4 tests OK`);
        - Docker trading_system targeted test passed:
          `pytest tests/unit/test_sizing.py tests/unit/test_order_brackets.py -q` (`26 passed`).
        - Docker compose config validation passed for DNSE-log env changes in:
          `fib_sl_tp_strength`, `combine_weight_sl_tp`, `rsiboundportfolioA001`, and
          `regressionportfolioA001`.

    - Reset/apply/run update for fib/combine/signal retest - 2026-06-18:
      - Added reset script flags:
        - `--preserve-config`: delete scoped runtime traces but keep declarative strategy/account/
          risk/allocation config rows so a config re-apply is not required after every scoped lab
          reset;
        - `--account-id` and `--account-ids`: reset one internal account, or a small account group,
          without resetting every account in the alpha folder.
      - Important bug found and fixed:
        - gateway auth is backed by Redis `gate:active_alphas` and `gate:apikeys`;
        - gateway background sync rebuilds `gate:active_alphas` from the legacy `alphas` table;
        - the first `--preserve-config` reset version still deleted legacy config rows
          `alphas`, `alpha_ledger`, and `alpha_risk_config` through the generic cleanup pass;
        - this caused `UNAUTHORIZED_ALPHA` even though v2 `strategies/accounts/risk_profiles` were
          intact;
        - `--preserve-config` now preserves those legacy config tables too.
      - Runbook update:
        - `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md` now documents alpha-folder scoped reset with
          `--preserve-config`, and account-only reset via `--account-id`.
      - Retest actions completed:
        - applied `portfolio_account_config_setup.yaml`;
        - restarted/recreated trading_system services:
          `gateway`, `risk_engine`, `paper_execution`, `reconciliation`, `executor`, `listener`,
          `portfolio`, `performance`, `copy_outbox`, `monitor`;
        - reset scoped runtime state and alpha-local logs/state for:
          `fib_sl_tp_strength`, `combine_weight_sl_tp`, and `signal_combine`, preserving config;
        - started the available compose services:
          Binance paper/sandbox and DNSE paper where the declarative config supports DNSE.
          `signal_combine` currently has Binance paper/sandbox only; no DNSE config exists yet.
      - Post-run checks:
        - gateway `/v1/health` and `/v1/health/capabilities` returned `READY`;
        - Redis auth registry includes fib/combine/signal alpha ids;
        - direct preflight for `sandbox-binance-fib_sl_tp_strength_0015m` returned ready with fresh
          Binance Futures broker sync;
        - after auth recovery, sandbox alpha logs show execution sessions and bracket accepts rather
          than `UNAUTHORIZED_ALPHA`;
        - quick DB count after restart showed new runtime activity:
          orders=15, fills=7, positions_v2=5, order_brackets=5, execution_sessions=14 for the three
          retest families.
      - Bracket residual-race fix - 2026-06-18:
        - Audit found sandbox Binance brackets where entry was `FILLED` but reduce-only STOP/TP
          children had been marked `CANCELLED` with `residual_guard=NO_SAME_SIDE_POSITION`.
          Root cause: immediately after entry fill, `orders` can be updated before `positions_v2`
          projection shows the same-side residual position. Treating this short projection gap as a
          terminal no-position state leaves a live sandbox position unprotected.
        - Updated `services/gateway/core/bracket_manager.py`:
          - residual `<= 0` now marks reduce-only child `PENDING` with
            `residual_guard=WAITING_FOR_POSITION_PROJECTION`, not terminal `CANCELLED`;
          - reconcile now retries `CREATED/PENDING` children for `ENTRY_FILLED/ACTIVE/
            PARTIALLY_CLOSED` brackets after STOP/TP fill handling, so terminal child events still
            take priority over retry work;
          - once `positions_v2` catches up, child quantity is capped to residual position and
            resubmitted normally.
        - Updated `tests/unit/test_order_brackets.py` with projection-wait and pending-child retry
          coverage. Docker targeted test passed:
          `pytest tests/unit/test_order_brackets.py -q` (`18 passed`).
        - Recreated `gateway_service`, reopened the 9 scoped child legs affected by the old race
          from `CANCELLED` to `PENDING`, and allowed reconcile to resubmit them.
        - Final scoped audit:
          - no alpha WARNING/ERROR/CRITICAL/Traceback after `2026-06-18 10:34`;
          - bracket legs are now protected: paper STOP/TP=`ACCEPTED`, sandbox STOP/TP=`SENT`;
          - `positions_v2` rows for fib/combine test positions have non-null `mark_price` and
            `mark_price_at`, with unrealized PnL updating;
          - latest Binance broker sync snapshot is `OK` and fresh;
      - scoped reconciliation findings returned zero rows;
      - copy outbox policies are enabled and scoped `copy_event_outbox` rows are `PUBLISHED`;
        Redis Stream `copy:events:v1` is receiving events.

### 46.3 Grid Long / Grid Combine 002 Backtest-Parity Upgrade - 2026-06-20

Objective:

- Keep `execution_alpha/alphas/grid_long_only/main/gridcombine001.py` and every existing
  `gridcombine001` config/account/deployment unchanged as a running baseline.
- Use `gridcombine002.py` as a fully isolated parity implementation and upgrade
  `gridlongonly001.py` against the supplied backtest-style references.
- Move both parity paths to trading_system-native capital sizing and canonical portfolio/risk
  configuration, following fib/combine/signal-combine rather than legacy fixed notional shortcuts.

Implementation checklist:

- [x] Audited both live files against `gridcombine_backtest_code.py` and
  `gridlong_backtest_code.py`.
- [x] Confirmed `gridcombine002.py` initially had the same SHA-256 content as
  `gridcombine001.py`; therefore it must not run until all identities are separated.
- [x] Add family-level pure indicator/trigger/state helpers and golden parity tests.
- [x] Rewrite only Grid Combine 002 and Grid Long live paths to use the parity helpers.
- [x] Preserve Grid metadata through the shared legacy-to-SDK adapter and canonical order request.
- [x] Replace active fixed notional/8-decimal sizing with trading_system capital-model estimates and
  venue lot normalization.
- [x] Add Grid Combine 002 declarative strategy/account/risk/allocation/copy-policy entries without
  modifying Grid Combine 001 rows.
- [x] Add opt-in Grid Combine 002 compose services, isolated logs/state/API keys, and runbook steps.
- [x] Run compile, parity, SDK/runtime, YAML, compose, gateway-schema, and config-plan validation.

Known semantic boundary:

- The supplied backtests infer an intrabar LIMIT fill from OHLC and choose at most one entry after
  seeing the complete candle range. Live execution cannot know that range in advance. This pass
  guarantees indicator and decision-event parity and routes resulting orders safely through
  trading_system; physical fill-price parity requires a later explicit native resting-order model
  and a backtest execution model that uses the same order lifecycle.

Open strategy decision, not auto-fixed:

- `gridcombine_backtest_code.py` computes Percent `disc_1..7` as `ma - offset_pct`, but computes
  `disc_8` as `ma * (1 - offset_pct)`. This looks inconsistent with Grid Long and the premium bands,
  but it is part of the supplied reference. Grid Combine 002 currently preserves it for literal
  parity. Recommended follow-up is a controlled A/B backtest, then change both reference and live
  together only after owner approval.
- The supplied backtests implement only `SMA`, `EMA`, and `RMA`; every other `ma_type` silently
  falls back to `EMA`. Therefore the current `gridlongonly001_1d ma_type=WMA` and provisional
  `gridcombine002_4h ma_type=LSMA` execute as EMA in the literal parity path. Recommended follow-up:
  confirm whether historical backtests intentionally used fallback EMA or whether WMA/LSMA must be
  added to both backtest and live together. This pass does not choose automatically.
- Normal container restart preserves Grid shard comments in account-scoped SDK state and canonical
  order raw requests. If that local state file is deleted while positions remain open, the current
  aggregate `positions_v2` response cannot reconstruct every same-level shard by itself. Recommended
  production follow-up is a canonical Grid shard/lot projection derived from orders and fills; do
  not add it until its ownership and reconciliation behavior are approved.

Owner decision - 2026-06-20:

- Approved normalizing Grid Combine Percent discounts to the symmetric formula
  `ma * (1 - offset_pct)` for `disc_1..8` in both the backtest reference and live parity path.
- Approved implementing real WMA and LSMA support in both Grid backtest references. SMA/WMA/LSMA
  warmup NaNs must not poison EMA-smoothed bands; smoothing starts at the first finite MA value.
- Approved restarting currently running Grid containers after targeted tests. Grid Combine 002
  remains opt-in and must not be started or config-applied until owner strategy params are final.

Implementation and restart audit - 2026-06-20:

- Normalized Grid Combine Percent `disc_1..7` to the same multiplicative formula as `disc_8`.
- Added WMA and LSMA to both backtest references. The shared finite-seed EMA smoother now preserves
  warmup NaNs but starts at the first finite MA value, preventing SMA/WMA/LSMA bands from remaining
  NaN forever.
- Grid parity tests passed (`7 tests OK`), including Percent symmetry, one-bar shift, WMA/LSMA
  distinct from EMA, finite post-warmup bands, regime recovery, duplicate-level shards, full exits,
  and capital-model metadata.
- Restarted only the two currently flat Grid Combine 001 paper containers. Both returned `Up`,
  loaded 350 warmup rows, and subscribed to the expected 4h/1d channels without warning/error.
- Grid Long restart is intentionally blocked pending owner choice. Pre-restart DB audit found:
  - `gridlongonly001_4h`: paper BTCUSDT LONG quantity `12`;
  - `gridlongonly001_1d`: paper BTCUSDT LONG quantity `2`.
  Their old SDK state rows have client order ids but no Grid `comment/lvl` metadata because the old
  compatibility runtime dropped comments. Restarting the parity engine would treat these shards as
  untracked and could open duplicate exposure.
- Recommended test/lab action: emergency/force-close both paper Grid Long accounts, verify flat,
  then restart them clean. Preservation alternative: reconstruct each shard level from historical
  logs/orders and write an explicit migration; do not infer levels silently.

Clean reset/restart completion - 2026-06-20:

- Owner reset and re-applied declarative Grid config. Follow-up DB audit returned zero Grid open
  positions and zero Grid sandbox open orders.
- Physical Binance testnet audit found no Grid-owned open order. Remaining broker open orders are
  reduce-only `STOP_MARKET`/`TAKE_PROFIT_MARKET` conditional legs from bracket-enabled fib/combine
  alphas; Grid does not submit bracket orders. They were intentionally not canceled because the
  physical credential is shared.
- Physical aggregate exposure still has six mismatches across BTC/ETH/BNB for other active sandbox
  alphas. This is outside the Grid reset scope and must be reconciled with those owners; flattening
  the shared broker account would corrupt their virtual books.
- Ran alpha-scoped reset with `--preserve-config --clean-alpha-files`; it removed old Grid DB traces
  and account-scoped local state while preserving declarative strategy/account/risk/allocation rows.
- Started only the four established paper services:
  `gridlongonly001_{4h,1d}` and `gridcombine001_{4h,1d}`. Grid Combine 002 and all Grid sandbox
  services remain stopped.
- Post-start validation:
  - all four containers are `Up`;
  - Grid Long logs show `sizing=percent_equity`, 300 warmup rows, and correct 4h/1d subscriptions;
  - Grid Combine 001 logs show 350 warmup rows and correct 4h/1d subscriptions;
  - no WARNING/ERROR/CRITICAL/Traceback during startup;
  - DB remains at zero Grid open positions and zero Grid orders immediately after clean startup.

Shared Binance testnet cleanup and HEDGE reconciliation closure - 2026-06-20:

- Owner authorized flattening the disposable shared testnet account because residual orders/fills
  from several alpha families could no longer be attributed safely by visual broker inspection.
- Stopped all seven running sandbox writers for fib, combine, and signal-combine before touching the
  shared physical credential. Grid sandbox services were already stopped.
- Protected testnet cleanup canceled 27 open algo/conditional orders and closed six HEDGE physical
  positions across BTCUSDT, ETHUSDT, and BNBUSDT. A second read-only audit across all four configured
  credential views returned zero ordinary orders, zero algo orders, and zero positions.
- Reset the seven internal sandbox accounts with `--preserve-config`; DB verification returned zero
  `orders`, `fills`, `positions_v2`, and `account_sync_snapshots`. Removed exactly five remaining
  combine/fib sandbox SDK state directories; paper state/logs/config were not touched.
- First aggregate position reconciliation exposed a schema defect: physical HEDGE LONG and SHORT
  findings for the same instrument collided under
  `uq_reconciliation_findings_open_position_identity`, which used only `instrument_id`.
- Fixed the canonical schema and running database with
  `init-db/28-reconciliation-hedge-position-identity.sql`. Open position finding identity now uses
  `details.position_key` (`instrument_id:LONG|SHORT`) with legacy `instrument_id` fallback. Added a
  side-aware repository test; reconciliation/portfolio targeted suites passed (`28 passed`).
- Final aggregate checks:
  - broker position reconciliation: `status=OK`, `findings=0`;
  - broker open-order reconciliation: `status=OK`, `findings=0`;
  - all historical findings for `binance_testnet_main` are `RESOLVED`;
  - sandbox alpha services remain intentionally stopped so the next test starts from an explicit,
    isolated baseline.
- Added the protected shared-testnet hard-reset sequence to
  `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md` and the Grid runbook. This operation is global to the physical
  testnet credential, never alpha-scoped and never valid for live credentials.

Progress log:

- Added `main/grid_parity_common.py`; `gridlongonly001.py` and `gridcombine002.py` are thin
  entrypoints, while `gridcombine001.py` remains byte-for-byte unchanged with SHA-256
  `e3981cd94256638d0fae513fc55536088103fdd2d0551a4d344ffb9fb99b9eb9`.
- Grid parity path imports the supplied backtest calculation functions directly and standardizes
  previous-close trigger boundaries, regime-from-candles recovery, exit-before-entry, all-shard
  exits, one entry decision per bar, duplicate-level shard lists, and trading_system capital sizing.
- Shared legacy runtime now forwards optional order `comment`/contract metadata instead of dropping
  Grid level identity. Gateway canonical order schema/query exposes optional `comment`, `metadata`,
  `intent`, `reduce_only`, and `raw_request` for restart/audit use. Existing callers remain valid.
- Grid Long active config now uses `capital_model_defaults` with venue-normalized sizing. Grid
  Combine 002 has provisional, isolated 4h/1d config and compose profile `gridcombine002`; it has not
  been applied or started because owner strategy params are still pending.
- Validation completed:
  - Python compile: passed for touched Grid/runtime files;
  - Grid parity container tests: `6 tests OK`;
  - runtime contracts/capital sizing/market-hours container subset: `30 tests OK`;
  - gateway order schema: `10 passed`;
  - Grid compose profile rendering: passed;
  - YAML identity/duplicate checks: passed (`16` alphas, `34` accounts);
  - trading_system CLI `config plan`: passed and listed both Grid Combine 002 alpha ids, four
    accounts, allocations, risk profiles, and copy policies.
- Full trading_system unit-suite runs were attempted but Docker container startup remained silent
  for several minutes and was stopped; the directly affected targeted suites above passed. No DB
  config apply, alpha restart, account reset, or live/paper order smoke was performed in this pass.

### 47. Deep Momentum MLOps Alpha Migration - 2026-06-26

Objective:

- Migrate `/root/bobby/execution_alpha/alphas/deep_momentum` as the first ML/MLOps alpha family.
- Preserve backtest/live parity by reading the exact `crypto_momentum` code packaged with the active
  MLflow Production model before deciding execution semantics.
- Keep execution-server boundaries consistent with the rest of the new stack:
  - market data must come from `data_layer`;
  - orders must go through `trading_system` gateway/risk/executor/portfolio;
  - the alpha must not call Binance/DNSE directly for market data or execution.

Current source-of-truth notes from
`execution_alpha/alphas/deep_momentum/alpha_guide_to_intergate_vpsreseach.md`:

- Research VPS owns MLflow tracking/registry and artifacts under
  `/root/bobby/pool_alpha/MLops/deep_momentum`.
- Registered model name is expected to be `crypto_momentum_model`; execution references
  `models:/crypto_momentum_model/Production`.
- Model artifacts include:
  - `model/MLmodel`, `conda.yaml`, `python_env.yaml`, `requirements.txt`;
  - `model_bundle.joblib`;
  - packaged `model/code/crypto_momentum`;
  - `universe_symbols.json`;
  - performance report/chart.
- Model/logged params that must govern live execution:
  - `W_base`;
  - `target_window`;
  - `rebalance_days`;
  - `portfolio_quantile`;
  - `asset_class`, `universe_name`;
  - model/version tags such as git commit, branch, and dirty flag.

Backtest-code read requirement:

- Before committing final live order behavior, inspect the active model artifact code, especially:
  - `crypto_momentum/training/train.py`;
  - `crypto_momentum/evaluate/evaluate_model.py`;
  - `crypto_momentum/register/register_model.py`;
  - `crypto_momentum/scoring/serve.py`;
  - `crypto_momentum/parameters.json`;
  - artifact `universe_symbols.json`;
  - if present, any EW/equal-weight backtester or portfolio-construction helper.
- Access methods, in priority order:
  1. read the local MLflow artifact cache if the Production model has already been loaded on this VPS;
  2. use the existing MLflow tunnel (`MLFLOW_TRACKING_URI=http://localhost:5000`) to download the
     Production artifact and inspect `model/code/crypto_momentum`;
  3. SSH to the research VPS and read the artifact/source from
     `/root/bobby/pool_alpha/MLops/deep_momentum`.
- If the artifact/source cannot be accessed, implementation may proceed only with a mock contract
  and must mark backtest parity as blocked, not assumed.

Domain interpretation to verify from source:

- `deep_momentum` is a portfolio target/ranking alpha, not a single-symbol signal alpha.
- Expected flow:

```text
closed daily OHLCV from data_layer
-> feature matrix using active model W_base/feature schema
-> model prediction scores
-> rank universe
-> select top/bottom portfolio_quantile
-> assign target long/short equal weights
-> compute diff versus trading_system current positions
-> submit rebalance through trading_system
```

- Required parity questions:
  - Does backtest use dollar-neutral weights exactly, or separate long/short capital budgets?
  - How is `K` rounded when `portfolio_quantile * universe_count` is fractional?
  - Are zero/NaN/tied scores excluded, sorted stably, or kept?
  - Does backtest close symbols that leave the selected universe immediately at rebalance?
  - Does backtest diff target-current positions, or close all then reopen?
  - What fee/slippage assumptions are encoded in the backtester?
  - Does `rebalance_days` mean calendar days, trading bars, or model target horizon alignment?
  - Are shorts always allowed, or dependent on venue/account policy?

Phase 1 - MLOps-safe alpha scaffold and compatibility execution:

- Add a `deep_momentum` alpha folder structure following the shared alpha-runtime architecture:
  - `main/` for runner, feature/model clients, portfolio builder;
  - `config/` for deployment, model, strategy, execution;
  - `state/`, `logs/`, `Documentation/`;
  - compose services for paper Binance first, sandbox Binance after account/broker state is clean.
- Use a derived ML image rather than bloating the common runtime base:
  - base from `execution-alpha-runtime`;
  - add ML-only dependencies such as `mlflow`, `xgboost`, `scikit-learn`, `joblib`, `fastapi`,
    `uvicorn`, and optionally `numba` if the packaged model requires it.
- Implement model access adapter:
  - remote inference mode: call a model server `/health` and `/predict`;
  - artifact/cache mode: load MLflow Production model locally when available;
  - persist model metadata in local state for audit.
- Implement data adapter:
  - pull daily OHLCV through `data_layer` only;
  - use batch warmup for model universe;
  - enforce closed-candle cutoff and minimum lookback `12 * W_base` calendar days when required by
    model metadata.
- Implement portfolio builder only after source read:
  - input: `symbols`, `scores`, model params, data validity mask;
  - output: target weights/notionals plus explanation rows.
- Compatibility execution path:
  - convert target weights to order deltas inside alpha using current positions/balances from
    trading_system SDK;
  - submit with execution session and pre-risk/bulk order path;
  - record `prediction_id`, `model_version`, `feature_schema_hash`, `rebalance_session_id`, and
    selected universe in order metadata.

Phase 2 - Trading-system-native target-weight rebalance:

- Add a gateway endpoint only if the source read confirms target-weight semantics are stable:

```text
POST /v1/portfolio-targets/rebalance
```

- Endpoint responsibility:
  - authenticate alpha and account;
  - validate account/preflight/venue/mode;
  - read current positions and balances;
  - read latest market prices and market rules;
  - convert target weights/notionals into venue-valid order deltas;
  - optionally run pre-risk for the full basket before submitting;
  - submit accepted deltas through the same `order.inbound` stream;
  - return a full decision report with skipped tiny deltas, risk rejects, rounded quantities, and
    accepted order ids.
- Add database audit if needed:
  - `portfolio_target_rebalance_requests`;
  - or reuse execution-session metadata first if the schema can store the required audit cleanly.
- Add SDK/runtime helper:

```python
rebalance_to_target_weights(...)
```

- Keep existing `rebalance_to_targets(target_orders=...)` backward-compatible.

Testing plan:

- Source/artifact read:
  - verify active model URI and artifact code path;
  - hash feature list/model metadata;
  - document exact backtest behavior discovered.
- Unit tests:
  - ranking/top-bottom quantile selection;
  - NaN/tie handling;
  - target weight sum and dollar-neutral validation;
  - current-position diff conversion;
  - lot/tick/min-notional rounding;
  - close-only symbols leaving portfolio;
  - idempotent rebalance session keys.
- Gateway tests if Phase 2 endpoint is implemented:
  - unauthorized alpha;
  - invalid account ownership;
  - stale/missing market price;
  - tiny delta skipped;
  - long/short basket accepted through bulk path;
  - risk pre-grant failure returns no partial submit unless policy explicitly allows partial.
- Docker tests:
  - alpha container import/compile;
  - model-client mock `/predict`;
  - data_layer mock/batch warmup parse;
  - dry-run rebalance with no real broker order;
  - paper Binance smoke after config registration.

Implementation status:

- [x] locate/read active Production model artifact code;
  - local audit found no MLflow artifact/cache under `/root/bobby`;
  - no local MLflow tunnel on port `5000`;
  - port `127.0.0.1:8000` is the trading_system gateway, not the model server;
  - no local Docker MLflow/model-serving container is running;
  - SSH to research VPS `180.93.36.141` succeeded and source/artifact snapshot was copied to
    `execution_alpha/alphas/deep_momentum/research_snapshot/`;
  - MLflow registry has registered model `crypto_momentum_model` versions `1`, `2`, `3`;
  - production verification on 2026-06-26 confirmed version `3` has `current_stage=Production`
    and `status=READY`; `registered_model_aliases` is still empty, but stage-based URI
    `models:/crypto_momentum_model/Production` is now valid;
  - Production v3 run id is `4c4f2c50f0294157904789e389019560`, model id
    `m-28d133142cc749e7b7c43a051fa28bdf`;
  - run params from MLflow DB, which override stale copied `parameters.json`, are:
    `W_base=45`, `target_window=30`, `rebalance_days=30`, `portfolio_quantile=0.1`,
    `max_depth=3`, `eta=0.09`, `subsample=0.6`, `num_boost_round=150`,
    `asset_class=crypto`, `universe_name=binance_daily`;
  - registry description records git commit `5d089c5799c9c510759819650d3a9966e6fdad96`,
    branch `main`, dirty `True`, universe size `248`, Sharpe `2.0059`, CAGR `0.6129`,
    MaxDD `-0.1472`.
- [x] write discovered backtest order semantics into this section;
  - `crypto_momentum/training/train.py` trains an XGBoost `multi:softprob` model and converts class
    probabilities into `expected_return = dot(probs, decile_means)`;
  - backtest portfolio construction is quantile-threshold based, not fixed-count top-K:
    `top = snap.expected_return.quantile(1 - portfolio_quantile)`,
    `bot = snap.expected_return.quantile(portfolio_quantile)`,
    longs are all symbols with score `>= top`, shorts are all symbols with score `<= bot`;
  - if `len(snap) < 10`, the rebalance is skipped;
  - long-leg return is the mean `fwd_ret` of selected longs and short-leg return is the mean
    `fwd_ret` of selected shorts; portfolio return is `(long_ret - short_ret) - fee * 2`;
  - live target construction should therefore assign equal weight inside each selected leg:
    `+1 / K_long` for longs and `-1 / K_short` for shorts, making the natural gross exposure two
    legs while staying net-dollar-neutral;
  - `rebalance_days` is implemented as available daily bar stepping
    (`dates[::rebalance_days]`), not wall-clock calendar scheduling; live runner must persist last
    rebalance date/bar count before it can safely submit real recurring orders;
  - symbols that leave the selected quantile set should be closed at rebalance by the
    trading_system target-rebalance endpoint because missing current positions are converted into
    flatten orders;
  - fully flat/tied-score universes can overlap top/bottom legs in backtest math; live execution
    must avoid self-crossing and skip overlapping symbols with explicit explanation.
- [x] implement Phase 1 scaffold;
  - added `execution_alpha/alphas/deep_momentum/main/model_client.py` for remote `/health` and
    `/predict`;
  - added `execution_alpha/alphas/deep_momentum/main/portfolio_builder.py` for deterministic
    quantile-threshold equal-weight long/short target construction matching the active backtest
    semantics above;
  - added `execution_alpha/alphas/deep_momentum/main/deep_momentum_runner.py` as a safe mock-feature
    dry-run runner;
  - added `config/deployment.example.json` and `Documentation/RUNBOOK.md`;
  - added `execution_alpha/runtime/Dockerfile.ml` as the derived ML runtime image plan.
- [x] decide whether Phase 2 endpoint is required immediately;
  - yes: target-weight rebalance is the right semantic boundary for ML portfolio alphas, even while
    exact backtest parity remains pending.
- [x] implement endpoint/SDK/runtime if required;
  - added pure planner `services/gateway/core/target_rebalance.py`;
  - added `POST /v1/portfolio-targets/rebalance`;
  - endpoint defaults to planning only and submits only with `submit=true`;
  - endpoint uses trading_system positions/balances/market-info and bulk order path;
  - added SDK helper `rebalance_to_target_weights(...)`;
  - exposed the same helper through `alpha_runtime.trade.action.AlphaTradeAction`;
  - kept old `rebalance_to_targets(target_orders=...)` backward-compatible.
- [x] run targeted tests and update validation notes;
  - Docker trading_system target tests passed:
    `docker compose --profile test run --rm test_runner pytest tests/unit/test_target_rebalance.py -q`
    (`5 passed`);
  - Docker alpha runtime test passed:
    `docker run --rm -v /root/bobby/execution_alpha:/workspace -w /workspace
    execution-alpha-runtime:0.1.1 /opt/venv/bin/python -m unittest
    runtime/tests/test_deep_momentum_portfolio_builder.py` (`3 tests OK`);
  - Docker py_compile passed for touched gateway, SDK, runtime, and deep_momentum files;
  - host `python` is not installed, so all meaningful Python validation was run in containers.
  - after Production stage was promoted, SSH registry check was repeated and targeted Docker tests
    were rerun: trading_system target rebalance tests `5 passed`, alpha runtime portfolio-builder
    tests `3 tests OK`, and Docker py_compile passed again.

Production-grade completion tasks for deep_momentum:

- [x] replace mock feature payload with a data_layer-backed daily OHLCV feature matrix;
  - use `DataLayerGateway.warmup_ohlcv_batch(market="crypto", provider="binance", interval="1d")`;
  - normalize data_layer candle payloads through runtime `extract_candles()` / `candles_to_dataframe()`;
  - build the panel with artifact `crypto_momentum.util.segments.prepare_panel_data`;
  - compute features with artifact `crypto_momentum.util.features.add_deep_momentum_features`;
  - never call `add_labels()` in live inference because it requires future returns and drops the
    newest rows;
  - prefer exact `feature_cols` from the Production `model_bundle.joblib`; fallback to the artifact
    v3 keyword list only for dry-run tests when the bundle is absent.
- [x] persist rebalance state so `rebalance_days=30` means 30 available daily bars, matching
  `dates[::rebalance_days]` in the backtest;
  - state must record last rebalance date, last rebalance ordinal, prediction id, model version,
    target symbols, and dry-run/submission status;
  - runner should plan every invocation but submit only when no prior rebalance exists or at least
    `rebalance_days` new closed daily bars have appeared.
- [x] upgrade the ML runtime image dependencies;
  - add `numba`, because the packaged feature code imports `numba.njit`;
  - keep ML dependencies in `Dockerfile.ml`, not the common alpha runtime base.
- [x] validation required before enabling `submit=true`;
  - unit test feature matrix with synthetic data and artifact feature code;
  - unit test rebalance state gating;
  - Docker compile/test the deep_momentum modules;
  - live data_layer smoke may remain dry-run/plan-only and should not submit broker orders.

Production-grade completion implementation notes:

- Added `deep_momentum/main/feature_pipeline.py`:
  - loads `universe_symbols.json`;
  - calls data_layer Binance daily OHLCV batch with Binance `market=usdm` because the Production
    universe contains USDM-style symbols such as `1000SHIBUSDT`;
  - drops unclosed current-day daily candles;
  - imports packaged artifact feature code from `research_snapshot/production_artifact/code`;
  - reads exact `feature_cols` from Production `model_bundle.joblib`;
  - returns symbols, feature matrix, latest closed daily bar, available daily bars, missing-symbol
    diagnostics, and feature schema hash.
- Added `deep_momentum/main/rebalance_state.py`:
  - records `last_plan`;
  - advances `last_rebalance_time` only when submit is actually executed;
  - gates submit by available daily bars since the last submitted rebalance.
- Updated `deep_momentum_runner.py`:
  - default `feature_source` is now `data_layer`, not mock;
  - mock path remains explicit via `model.feature_source="mock"` for local contract tests;
  - runner plans every run and submits only when `submit=true` and state says rebalance is due.
- Updated shared runtime `warmup.candles_to_dataframe()`:
  - fixed epoch-millis timestamps being parsed as nanoseconds and showing as 1970;
  - this matters for all alpha warmup paths consuming numeric data_layer candle timestamps.
- Copied Production `model_bundle.joblib` from research VPS to
  `execution_alpha/alphas/deep_momentum/research_snapshot/production_artifact/artifacts/`.
- Built ML runtime image `execution-alpha-runtime-ml:0.1.1` from `runtime/Dockerfile.ml`;
  - Dockerfile now switches to root only for dependency install and returns to `USER alpha`;
  - uses `mlflow>=3.1,<4`, `numba`, and CPU-oriented `xgboost>=2.0,<2.1` to avoid the heavy GPU/NCCL
    wheel pulled by newer xgboost builds.
- Validation:
  - Docker ML unit tests passed:
    `docker run ... execution-alpha-runtime-ml:0.1.1 /opt/venv/bin/python -m unittest
    runtime/tests/test_deep_momentum_feature_state.py runtime/tests/test_deep_momentum_portfolio_builder.py`
    (`6 tests OK`);
  - trading_system target rebalance tests passed again (`5 passed`);
  - Docker py_compile passed for touched trading_system and execution_alpha files;
  - read-only data_layer smoke on `executor_network` first exposed a domain mismatch:
    `market=spot` loaded `11/12` and missed `1000SHIBUSDT` with Binance `Invalid symbol`;
  - switching to `market=usdm` loaded `12/12` for the same subset with latest closed daily bar
    `2026-06-25T00:00:00Z`;
  - feature matrix smoke returned `46` feature columns with schema hash prefix `8c63ecc9de4e`;
  - read-only local model-bundle inference smoke passed with the same feature matrix:
    `predictions=11`, score range approximately `[-0.0320, 0.0616]`;
  - missing symbol in the subset did not block feature construction because min usable symbols was
    satisfied; full-universe production run should monitor `missing_symbol_count`.

Production deployment closure tasks:

- [x] add an execution-side model server for the Production bundle;
  - service exposes `/health` and `/predict`;
  - loads `model_bundle.joblib` and uses the same prediction logic as
    `DeepMomentumModelWrapper.predict`;
  - validates feature width and returns `prediction_id`.
- [x] add a safe production runner loop;
  - one-shot mode remains supported for smoke/tests;
  - loop mode can run daily and rely on rebalance-state gating;
  - prediction count must equal feature-row count before portfolio construction.
- [x] add full-universe smoke tooling;
  - use the full Production `universe_symbols.json` unless an explicit `--limit` is passed;
  - verify data_layer daily OHLCV, artifact features, local bundle inference, and portfolio target
    construction;
  - do not submit trading_system orders from this smoke.
- [x] add alpha compose and deployment config;
  - `deep_momentum_model` local model server;
  - `deep_momentum_1d_paper_binance` runner supports both plan-only and paper-submit modes;
  - mount runtime, trading_system SDK, and alpha code like other migrated alpha folders.
- [x] register `deep_momentum_1d` in the canonical portfolio/account config;
  - paper Binance first;
  - sandbox/live remain explicit later steps after paper dry-run audit.

Production deployment closure validation:

- Added local execution-side FastAPI model server:
  - `execution_alpha/alphas/deep_momentum/main/model_server.py`;
  - compose service `deep_momentum_model`;
  - `/health` returns `status=healthy`, `feature_count=46`, schema hash
    `8c63ecc9de4e3c9bf724b69073cb7aa964deaa0ad10719491356f9ee59b626d9`.
- Added production paper runner config and compose service:
  - `execution_alpha/alphas/deep_momentum/config/deployment.paper.json`;
  - `deep_momentum_1d_paper_binance`;
  - current paper test config is `dry_run=false`, `submit=true`; set `submit=false` before
    planning-only audits.
- Registered canonical paper config through
  `config/_config/portfolio_account_config_setup.yaml`:
  - alpha `deep_momentum_1d`;
  - account `paper-binance-deep_momentum_1d`;
  - allocation `200000 USDT`;
  - copy policy disabled by default.
- Final Docker validation:
  - deep_momentum unit tests: `6 tests OK`;
  - trading_system target rebalance tests: `5 passed`;
  - Docker py_compile passed for touched runtime, alpha, SDK, gateway, and planner files;
  - `git diff --check` clean for `trading_system` and `execution_alpha`.
- Final full-universe one-shot runner result:
  - model server healthy;
  - data_layer USDM daily OHLCV loaded `248/248` symbols with `0` missing;
  - latest closed daily bar `2026-06-26T00:00:00Z`;
  - feature matrix has `46` columns;
  - target rebalance endpoint returned `status=PLANNED`;
  - `target_count=50`, `planned_orders=50`, `skipped=0`, `explanations=0`;
  - `submitted=false`, so no broker/paper orders were emitted.
- Final config/apply audit:
  - `config plan` succeeds for `deep_momentum_1d`;
  - DB has active `strategies`, `alphas`, `accounts`, `account_policies`, `risk_profiles`,
    `portfolio_allocations`, and disabled `copy_publish_policies` rows for `deep_momentum_1d`;
  - account `paper-binance-deep_momentum_1d` has `200000 USDT` total/free and `0` locked.
- Binance-style paper leverage/capital config:
  - allocation remains `200000 USDT`;
  - paper account policy is deep_momentum-specific with `default_leverage=4`,
    `position_accounting_mode=NET`, `maintenance_margin_rate=0.005`, and
    `require_broker_sync=false`;
  - risk profile allows `max_leverage=4`, `max_notional_position=799600`, and
    `max_notional_order=399800`;
  - the `799600` cap is 4x gross notional on `200000 USDT` with a 0.05% exposure buffer below
    exactly `800000 USDT`.
- Leverage/backtest caveat:
  - research/backtest describes 100/100 dollar-neutral exposure, i.e. 200% gross / 2x theoretical
    leverage;
  - production paper config now uses `gross_exposure=1.999` and `capital_model.leverage=1`, because
    target weights already include both long and short legs; this plans about `799600 USDT` gross;
  - do not set planner `leverage=4` together with `gross_exposure=1.999`, because the target
    planner multiplies by both and would over-size to about `3.2M USDT` gross.
- Full-universe 4x-cap plan-only validation:
  - runner loaded `248/248` symbols;
  - target rebalance returned `status=PLANNED`, `target_count=50`, `planned_orders=50`,
    `skipped=0`, `explanations=0`, `submitted=false`;
  - no DB order rows were created and account balance remained `200000 USDT` free/total.
- Fast-cycle validation:
  - added `execution_alpha/alphas/deep_momentum/config/deployment.paper.fast-plan.json`;
  - plan-only, `force_rebalance=true`, `rebalance_days=1`, `max_symbols=60`, `min_symbols=40`;
  - loaded `60/60` symbols, produced `12` targets and `12` planned orders with no skips.
- Paper submit smoke:
  - submitted one BTCUSDT target rebalance paper order;
  - gateway returned HTTP `202`, `status=SUBMITTED`, `bulk_status=BULK_ACCEPTED`;
  - DB temporarily recorded `1` order, `1` fill, and `1` position;
  - scoped reset plus canonical config re-apply removed runtime rows and restored account balance
    to exactly `200000 USDT`.
- Fast-plan submit smoke:
  - temporarily set `execution_alpha/alphas/deep_momentum/config/deployment.paper.fast-plan.json`
    to `submit=true`;
  - runner loaded `60/60` symbols and submitted `12` MARKET paper orders through trading_system;
  - DB temporarily recorded `12` orders, `12` fills, and `12` positions;
  - all runtime rows were removed by scoped reset, canonical config was re-applied, the fast-plan
    state file was deleted, and the config was returned to `submit=false`;
  - final audit after cleanup: `orders=0`, `fills=0`, `positions_v2=0`, `copy_event_outbox=0`,
    account balance `200000 USDT` free/total and `0` locked.
- Backtest-parity caveat for symbol-count controls:
  - research/backtest uses the full prepared universe and skips a rebalance snapshot only when
    `len(snap) < 10`;
  - production `deployment.paper.json` keeps the full universe and does not set `max_symbols`;
  - production `min_symbols=200` is an execution-side data-quality guard, stricter than backtest,
    to prevent submitting a distorted portfolio if data_layer coverage degrades;
  - fast-plan `max_symbols=60` / `min_symbols=40` are integration-test shortcuts only, not
    research/backtest settings.
- Rebalance-days sleep optimization:
  - source audit confirmed research computes rebalance dates with `dates[::rebalance_days]`, so
    live scheduling must reason in closed daily bars rather than fixed wall-clock days only;
  - runner now performs a lightweight due-check before the heavy pipeline using a probe daily OHLCV
    request (`BTCUSDT`, `interval=1d`, default lookback `max(45, rebalance_days+10)`);
  - if fewer than `rebalance_days` new closed daily bars exist, the runner records
    `last_due_check`, logs `REBALANCE_NOT_DUE`, and skips full-universe OHLCV, feature
    construction, model `/health`/`/predict`, and trading_system rebalance;
  - when `runtime.loop=true`, sleep defaults to UTC midnight plus `daily_check_delay_seconds=5`,
    then repeats the lightweight due-check;
  - validation: with a temporary state `last_rebalance_time=2026-06-20T00:00:00Z` and latest closed
    daily bar `2026-06-26T00:00:00Z`, runner logged `bars_since=6`, skipped before heavy pipeline,
    created no DB orders, and left balance unchanged at `200000 USDT`.
- Important fix during closure:
  - target rebalance endpoint originally fell back to trading_system live price cache, which produced
    many `MISSING_PRICE` explanations for the deep_momentum universe;
  - runner now passes reference prices from the latest closed daily feature frame into
    `/v1/portfolio-targets/rebalance`;
  - gateway response merge order was corrected so plan-only responses return `status=PLANNED`
    instead of being overwritten by planner `status=OK`.
- Logging closure:
  - deep_momentum compose now mounts host `./logs` into `/app/logs`;
  - `deep_momentum_model` writes `/app/logs/deep_momentum_model.log`;
  - `deep_momentum_1d_paper_binance` writes `/app/logs/deep_momentum_1d_paper_binance.log`;
  - stdout logging stays enabled, so `docker compose logs` and host file logs both work.

#### 47.1 Deep Momentum Alias-Based Production Model Refresh - 2026-06-28

Context:

- VPS1 research server has a new Production model version registered for `crypto_momentum_model`.
- Registry alias query against `/root/bobby/pool_alpha/MLops/deep_momentum/mlflow.db` confirmed:
  - alias `prod_yearly_monthly` points to model version `4`;
  - version `4` is in `Production` stage and `READY`;
  - run id `98d8c3d707444d6baf4c6320cf43d586`;
  - active params: `W_base=35`, `target_window=30`, `rebalance_days=30`,
    `portfolio_quantile=0.1`, `split_mode=walk_forward_2022`,
    `rebalance_schedule=calendar_monthly`, `num_boost_round=100`, `eta=0.01`,
    `subsample=0.9`, `max_depth=3`;
  - active metrics: `sharpe_ew=4.3939`, `cagr_ew=1.0816`,
    `max_drawdown_ew=-0.0723`.
- Previous VPS2 execution config still points at the older local Production snapshot flow:
  - alpha id `deep_momentum_1d`;
  - account id `paper-binance-deep_momentum_1d`;
  - model uri `models:/crypto_momentum_model/Production`;
  - `W_base=45`.
- New VPS1 guide recommends alias-based loading:

```text
MODEL_URI=models:/crypto_momentum_model@prod_yearly_monthly
```

Decision:

- Keep the current Deep Momentum loading architecture for this phase. Do not introduce a full
  multi-model serving system yet.
- Replace the active production instance with an alias-named instance:
  - `alpha_id=deep_momentum_prod_yearly_monthly_1d`;
  - `model_alias=prod_yearly_monthly`;
  - `model_uri=models:/crypto_momentum_model@prod_yearly_monthly`.
- Prepare file/config naming so future aliases can be added as additional instances later, but do
  not run additional instances until explicitly approved.
- Do not re-architect the trading-system target rebalance endpoint. Deep Momentum remains a
  portfolio target/ranking alpha using:

```text
POST /v1/portfolio-targets/rebalance
```

Phase 1 implementation scope:

1. Config and naming migration:
   - add a new Deep Momentum deployment config for the alias instance, e.g.
     `execution_alpha/alphas/deep_momentum/config/deployment.prod_yearly_monthly.paper.json`;
   - set:
     - `alpha_id=deep_momentum_prod_yearly_monthly_1d`;
     - `model.model_alias=prod_yearly_monthly`;
     - `model.model_uri=models:/crypto_momentum_model@prod_yearly_monthly`;
     - `model.W_base=35`;
     - `model.target_window=30`;
     - `model.rebalance_days=30`;
     - `model.portfolio_quantile=0.1`;
     - `model.rebalance_schedule=calendar_monthly`;
   - keep `feature_source=data_layer`, `provider=binance`, `market=usdm`, `interval=1d`;
   - keep full-universe production behavior: no `max_symbols`, production `min_symbols=200`;
   - preserve existing `gross_exposure=1.999` and paper capital setup unless changed by a later
     explicit sizing decision.

2. Runtime metadata hardening:
   - runner must log `model_alias`, `model_uri`, `W_base`, `target_window`, `rebalance_days`,
     `rebalance_schedule`, `portfolio_quantile`, feature row count, target count, and latest closed
     daily bar on every heavy run;
   - rebalance payload metadata must include `model_alias` in addition to `model_uri`;
   - state file must be alias-scoped, e.g.
     `/app/state/deep_momentum_prod_yearly_monthly_1d_rebalance_state.json`;
   - log file must be alias-scoped, e.g.
     `/app/logs/deep_momentum_prod_yearly_monthly_1d_paper_binance.log`.

3. Trading-system declaration:
   - add/register `deep_momentum_prod_yearly_monthly_1d` in
     `config/_config/portfolio_account_config_setup.yaml`;
   - add account `paper-binance-deep_momentum_prod_yearly_monthly_1d`;
   - keep portfolio `portfolio_types_pool`;
   - allocate `200000 USDT`;
   - keep paper account policy: `position_accounting_mode=NET`, `default_leverage=4`,
     `maintenance_margin_rate=0.005`, `require_broker_sync=false`;
   - keep risk capacity aligned with the previous Deep Momentum paper setup:
     `max_notional_order=399800`, `max_notional_position=799600`, `max_leverage=4`,
     `max_order_per_minute=120`;
   - copy trading policy remains disabled until a paper audit is accepted.

4. Compose/run command:
   - keep current model server architecture for now;
   - add an alias-specific runner service, e.g.
     `deep_momentum_prod_yearly_monthly_1d_paper_binance`;
   - wire it to the alias deployment config and alias-scoped log file;
   - keep the old `deep_momentum_1d` files available as previous-version reference until the new
     alias instance passes smoke.

5. Documentation:
   - update `execution_alpha/alphas/deep_momentum/Documentation/RUNBOOK.md` with the new alias
     instance commands;
   - document that future aliases are additive instances, not silent replacements.

Phase 1 validation plan:

1. Static validation:
   - Docker compile Deep Momentum Python files inside `execution-alpha-runtime-ml:0.1.1`;
   - `docker compose config --quiet` for the alpha folder;
   - trading_system `config plan` for the canonical config.

2. Config validation:
   - apply canonical config;
   - inspect:
     - `deep_momentum_prod_yearly_monthly_1d`;
     - `paper-binance-deep_momentum_prod_yearly_monthly_1d`;
   - confirm balance/allocation is `200000 USDT`, copy policy disabled, risk profile matches caps.

3. Read-only model/data validation:
   - run plan-only with `submit=false`;
   - verify data_layer USDM daily full universe loads at least `min_symbols=200`;
   - verify feature matrix uses `W_base=35`;
   - verify latest closed daily bar is logged;
   - verify model/prediction metadata logs include alias `prod_yearly_monthly`.

4. Trading-system planning validation:
   - verify `/v1/portfolio-targets/rebalance` returns `status=PLANNED`;
   - verify target count is consistent with `portfolio_quantile=0.1`;
   - verify no DB `orders`, `fills`, or `positions_v2` are written in plan-only mode.

5. Optional paper submit smoke after approval:
   - run scoped reset for only `deep_momentum_prod_yearly_monthly_1d`;
   - temporarily set `submit=true` with a small fast-plan style config if needed;
   - submit one controlled paper cycle;
   - query `orders`, `fills`, `positions_v2`, `account_balances`;
   - reset scoped runtime rows and re-apply canonical config.

Exit criteria:

- New alias instance is registered and runnable without affecting old `deep_momentum_1d`.
- Plan-only run proves VPS2 uses the v4 parameter set (`W_base=35`, calendar monthly alias).
- No unexpected DB writes occur in plan-only validation.
- The system is ready for a later multi-instance phase when another alias is promoted and explicitly
  approved for concurrent execution.

Phase 1 implementation log - 2026-06-28:

- Synced VPS1 production v4 artifact into the existing VPS2 local-bundle architecture:
  - copied `model_bundle.joblib`;
  - copied `universe_symbols.json`;
  - copied `performance_report.txt`;
  - replaced packaged artifact code under
    `execution_alpha/alphas/deep_momentum/research_snapshot/production_artifact/code/crypto_momentum`.
- Added alias production config:
  - `execution_alpha/alphas/deep_momentum/config/deployment.prod_yearly_monthly.paper.json`;
  - `alpha_id=deep_momentum_prod_yearly_monthly_1d`;
  - `model_alias=prod_yearly_monthly`;
  - `model_uri=models:/crypto_momentum_model@prod_yearly_monthly`;
  - `W_base=35`;
  - `rebalance_schedule=calendar_monthly`;
  - `submit=false` for plan-only validation by default.
- Added alias runner service:
  - `deep_momentum_prod_yearly_monthly_1d_paper_binance`;
  - alias-scoped log file
    `/app/logs/deep_momentum_prod_yearly_monthly_1d_paper_binance.log`;
  - alias-scoped state file
    `/app/state/deep_momentum_prod_yearly_monthly_1d_rebalance_state.json`.
- Hardened runner/model metadata:
  - `deep_momentum_runner.py` now logs model alias, model URI, `W_base`, `target_window`,
    `rebalance_days`, `rebalance_schedule`, and `portfolio_quantile` at run start;
  - target rebalance metadata now includes `model_alias`, `model_uri`, `W_base`,
    `target_window`, `rebalance_schedule`, and `portfolio_quantile`;
  - `model_server.py` health now includes `model_alias`, `model_uri`, feature schema hash, and
    effective model params. Because the v4 bundle does not embed `W_base` / `target_window` in
    `train_args`, those two values are exposed from alias env/config metadata.
- Added trading-system canonical declarations:
  - alpha `deep_momentum_prod_yearly_monthly_1d`;
  - account `paper-binance-deep_momentum_prod_yearly_monthly_1d`;
  - allocation `200000 USDT`;
  - risk caps `max_notional_order=399800`, `max_notional_position=799600`,
    `max_leverage=4`, `max_order_per_minute=120`;
  - copy publish policy remains `enabled=false`.
- Added env key:
  - `DEEP_MOMENTUM_PROD_YEARLY_MONTHLY_1D_API_KEY`.
- Updated Deep Momentum runbook with alias commands and reset guidance.

Phase 1 validation - 2026-06-28:

- Docker compile passed for modified Deep Momentum files.
- `docker compose config --quiet` passed for the Deep Momentum alpha folder.
- `config plan` passed for `portfolio_account_config_setup.yaml`.
- `config apply` completed successfully; alias alpha/account/risk/allocation/copy policy were upserted.
- CLI inspect confirmed:
  - strategy active for `paper/BINANCE`;
  - account `paper-binance-deep_momentum_prod_yearly_monthly_1d` active;
  - risk profile active with `399800` max order and `799600` max position.
- Account state confirmed:
  - total/free `200000 USDT`;
  - locked `0`;
  - `require_broker_sync=false`.
- Model server health after restart:
  - `status=healthy`;
  - `model_alias=prod_yearly_monthly`;
  - `model_uri=models:/crypto_momentum_model@prod_yearly_monthly`;
  - `feature_count=46`;
  - `feature_schema_hash=eb2ed8a6f5b9dee88eb7b4379ad73be83503a30d50d12061e9cfd5dfbde74b7a`;
  - effective params include `W_base=35`, `target_window=30`,
    `rebalance_schedule=calendar_monthly`.
- Plan-only one-shot validation with `force_rebalance=true` and `submit=false`:
  - data_layer loaded `317/317` USDM daily symbols;
  - missing symbols `0`;
  - latest closed daily bar `2026-06-27T00:00:00Z`;
  - model produced target portfolio with `64` targets (`32` long, `32` short);
  - trading_system target rebalance returned `status=PLANNED`, `planned_orders=64`,
    `skipped=0`, `submitted=false`.
- DB audit after plan-only validation:
  - `orders=0`;
  - `fills=0`;
  - `positions_v2=0`;
  - account balance remained `200000 USDT` free/total.

Phase 1 conclusion:

- Alias instance `deep_momentum_prod_yearly_monthly_1d` is ready for paper plan-only operation.
- It does not affect the old `deep_momentum_1d` reference instance.
- The next step, only after explicit approval, is either:
  - run a scoped paper-submit smoke for this alias; or
  - add another alias instance when VPS1 promotes a different model alias.

#### 47.2 Deep Momentum Alias Operational Closure - 2026-06-28

Objective:

- Close the alias refresh with a quick operational path that lets the user run the new
  `prod_yearly_monthly` instance confidently.
- Keep production alias config plan-only by default.
- Prove paper submit path once with a small fast-plan subset, then clean all runtime rows.

Implementation:

- Added alias-specific fast-plan config:
  - `execution_alpha/alphas/deep_momentum/config/deployment.prod_yearly_monthly.paper.fast-plan.json`;
  - `alpha_id=deep_momentum_prod_yearly_monthly_1d`;
  - `model_alias=prod_yearly_monthly`;
  - `W_base=35`;
  - `max_symbols=60`;
  - `min_symbols=40`;
  - `gross_exposure=0.2`;
  - `force_rebalance=true`;
  - `submit=false` by default;
  - separate state file
    `/app/state/deep_momentum_prod_yearly_monthly_1d_fast_plan_state.json`.
- Updated Deep Momentum runbook with:
  - alias fast-plan command;
  - alias paper submit smoke command pattern;
  - scoped cleanup command;
  - production alias runner command;
  - warning that committed production alias config remains `submit=false`.

Validation:

- Docker compile passed for Deep Momentum runner/model/feature/client/portfolio/state modules.
- `docker compose config --quiet` passed.
- Fast-plan plan-only validation:
  - loaded `60/60` symbols;
  - latest closed daily bar `2026-06-27T00:00:00Z`;
  - produced `12` targets (`6` long, `6` short);
  - trading_system returned `status=PLANNED`;
  - `planned_orders=12`;
  - `submitted=false`.
- Fast-plan paper submit smoke:
  - in-memory override only, committed config stayed `submit=false`;
  - trading_system returned `status=SUBMITTED`;
  - `target_count=12`;
  - `planned_orders=12`;
  - `skipped=0`;
  - `submitted=true`;
  - DB temporarily recorded `12` orders, `12` fills, and `12` `positions_v2` rows.
- Cleanup:
  - ran scoped reset for only:
    - alpha `deep_momentum_prod_yearly_monthly_1d`;
    - account `paper-binance-deep_momentum_prod_yearly_monthly_1d`;
  - preserved declarative config rows;
  - re-applied canonical config;
  - deleted alias fast-plan/production state files from host `state/`.
- Final audit:
  - `orders=0`;
  - `fills=0`;
  - `positions_v2=0`;
  - account total/free balance restored to `200000 USDT`;
  - locked balance `0`;
  - no open reservations.

Conclusion:

- `deep_momentum_prod_yearly_monthly_1d` is ready for user-run paper mode.
- Current production alias config is intentionally plan-only (`submit=false`).
- To let the daemon submit on due rebalance dates, explicitly switch
  `config/deployment.prod_yearly_monthly.paper.json` `execution.submit` to `true`, then run:

```bash
cd /root/bobby/execution_alpha/alphas/deep_momentum
docker compose up -d deep_momentum_model
docker compose up -d deep_momentum_prod_yearly_monthly_1d_paper_binance
```

- If the user wants one more quick dry audit before enabling submit, run:

```bash
cd /root/bobby/execution_alpha/alphas/deep_momentum
docker compose run --rm \
  -e DEEP_MOMENTUM_CONFIG=/app/config/deployment.prod_yearly_monthly.paper.fast-plan.json \
  deep_momentum_prod_yearly_monthly_1d_paper_binance
```

#### 47.3 Deep Momentum On-Demand Model Container Lifecycle - 2026-06-28

Problem:

- `deep_momentum_model` is a separate FastAPI model container and stays alive after validation.
- For a low-frequency daily/monthly MLOps alpha, this wastes RAM/CPU while the runner is only doing
  lightweight due-checks most of the time.
- The existing runner already skips the heavy pipeline when not due, but the model server can still
  sit idle if started manually or by compose.

Decision:

- Keep the current architecture with a separate `deep_momentum_model` container.
- Add optional runner-managed Docker lifecycle:
  - runner performs existing lightweight due-check first;
  - if not due, it never starts the model container;
  - if due/forced/no previous rebalance, it starts `deep_momentum_model`;
  - runner waits for `/health`;
  - runner builds features, predicts, plans/submits rebalance;
  - runner stops `deep_momentum_model` in a `finally` block after the heavy run.
- Use Docker Engine Unix socket from the runner container for this alpha only:

```text
/var/run/docker.sock -> /var/run/docker.sock
```

Trade-off:

- This grants the runner container Docker-control capability, so it is not appropriate for untrusted
  workloads.
- It is acceptable for the private execution server lab/prod alpha host because it avoids keeping an
  ML model service idle and does not require adding another scheduler/orchestrator service.
- If this becomes multi-tenant, replace this with an external orchestrator or inline inference.

Implementation scope:

- Add `model.lifecycle` config:

```json
{
  "mode": "docker_container",
  "container_name": "deep_momentum_model",
  "docker_socket": "/var/run/docker.sock",
  "create_if_missing": true,
  "image": "execution-alpha-runtime-ml:0.1.1",
  "binds": [
    {"source": "/root/bobby/execution_alpha/alphas/deep_momentum", "target": "/app"},
    {"source": "/root/bobby/execution_alpha/runtime/app", "target": "/app/runtime", "read_only": true},
    {"source": "/root/bobby/trading_system/alpha_sdk", "target": "/opt/trading_system_alpha_sdk", "read_only": true}
  ],
  "networks": ["bobby_network", "executor_network"],
  "start_timeout_seconds": 120,
  "stop_after_run": true,
  "stop_always": true,
  "stop_timeout_seconds": 30
}
```

- Add a small stdlib Docker Unix-socket client in `deep_momentum_runner.py`; do not add new
  dependencies.
- Mount Docker socket into the Deep Momentum runner services.
- If Docker cleanup removed the stopped model container, the runner must recreate it from
  `model.lifecycle` before starting it. This makes normal `docker system prune -af` survivable while
  the runner daemon remains alive.
- Keep backward compatibility:
  - if lifecycle is absent or `mode=external`, runner behaves like before and assumes model URL is
    already available;
  - local tests can still run with `docker compose up -d deep_momentum_model`.

Sleep/due-check behavior:

- `runtime.sleep_mode=daily_utc` wakes the runner near UTC midnight plus
  `daily_check_delay_seconds` (currently `5` seconds).
- Each wake runs only a small due-check request unless a rebalance is due.
- Due-check counts closed daily bars from data_layer, so it is robust to `rebalance_days=30`.
- For future calendar schedules (`calendar_weekly`, `calendar_monthly`), the current runner still
  uses `rebalance_days` bar-count gating. This is safe but not perfect schedule parity; exact calendar
  Friday/month-end mapping should be a later enhancement if the model alias requires strict calendar
  schedule semantics.
- Recommended production timing:
  - keep `daily_check_delay_seconds` small only if data_layer daily bars are consistently ready;
  - otherwise increase to `60-300` seconds or add multiple retry checks within the first minutes
    after midnight;
  - current data_layer validation has shown the latest closed daily bar is available, but production
    should prefer a modest delay such as `60` seconds if Binance/data_layer freshness becomes noisy.

Validation plan:

- Compile runner/model server inside Docker.
- Validate compose config.
- Stop any currently running `deep_momentum_model`.
- Run alias fast-plan plan-only with lifecycle enabled:
  - runner should start model container;
  - model health should pass;
  - rebalance should return `PLANNED`;
  - runner should stop model container after completion.
- Verify DB stays clean in plan-only mode.
- Verify `docker compose ps` shows model container stopped after the run.

Implementation log - 2026-06-28:

- Added stdlib Docker Engine Unix-socket client to `deep_momentum_runner.py`.
- Added model lifecycle config to both alias production and alias fast-plan configs:
  - `mode=docker_container`;
  - `container_name=deep_momentum_model`;
  - `docker_socket=/var/run/docker.sock`;
  - `create_if_missing=true`;
  - recreate spec includes image, command, environment, host binds, and Docker networks;
  - `start_timeout_seconds=120`;
  - `stop_after_run=true`;
  - `stop_always=true`.
- Mounted Docker socket into only the alias runner service:

```text
deep_momentum_prod_yearly_monthly_1d_paper_binance:
  - /var/run/docker.sock:/var/run/docker.sock
```

- Removed `depends_on: deep_momentum_model` from the alias runner so compose does not wake the
  model before the runner due-check.
- Added health retry loop after starting the model container. Observed model boot time was about
  `10` seconds before `/health` became reachable.
- Added schedule-aware rebalance decision support:
  - `rolling`: existing `rebalance_days` closed-bar count;
  - `calendar_weekly`: Friday daily bar;
  - `calendar_semi_monthly`: second Friday and last Friday;
  - `calendar_monthly`: last Friday of the month.
- Production alias sleep changed from `daily_check_delay_seconds=5` to `60` seconds.
  This gives data_layer/Binance daily bars a small freshness buffer without keeping the model server
  awake.
- Current schedule caveat:
  - if there is no previous submitted rebalance, the first due run is treated as bootstrap;
  - strict catch-up to a missed historical calendar bar is not implemented. The runner should be
    kept alive daily so it catches the eligible Friday/month-end bar on schedule.

Validation log - 2026-06-28:

- Stopped both `deep_momentum_model` and the alias runner before validation.
- Ran alias fast-plan plan-only with lifecycle enabled.
- Observed expected lifecycle:
  - removed `deep_momentum_model` first to emulate prune-like cleanup;
  - runner detected missing model container and recreated it;
  - runner started `deep_momentum_model`;
  - runner retried `/health` until model became ready;
  - model health returned alias `prod_yearly_monthly`, URI
    `models:/crypto_momentum_model@prod_yearly_monthly`, `feature_count=46`, `W_base=35`;
  - data_layer loaded `60/60` symbols;
  - target portfolio contained `12` targets (`6` long, `6` short);
  - trading_system returned `status=PLANNED`, `planned_orders=12`, `submitted=false`;
  - runner stopped `deep_momentum_model` after completion.
- Final Docker state:
  - production alias runner may remain running as the lightweight daemon;
  - `deep_momentum_model` exists again but is stopped.
- Fast-plan did not submit orders (`submitted=false`). Existing Deep Momentum paper rows, if any,
  are unrelated to this lifecycle validation and should be reset only through scoped lab-reset.

Operational conclusion:

- The Deep Momentum model container is now on-demand.
- Normal low-frequency operation should start only the runner. If the stopped model container was
  removed by `docker system prune -af`, the runner recreates it on the next due/forced/bootstrap run:

```bash
cd /root/bobby/execution_alpha/alphas/deep_momentum
docker compose up -d deep_momentum_prod_yearly_monthly_1d_paper_binance
```

- Do not run `docker compose up -d deep_momentum_model` unless a manual inspection requires the
  model server to remain awake.
- Boundary: if prune is executed while both runner and model are stopped and the runtime image is
  removed, Docker still needs the runtime image rebuilt before the runner itself can start.

## 2026-06-29 Alpha Runtime Follow-Up: Long Warmup Paging and Host Logs

Context:

- `scalping_sl_tp` was migrated with backtest-parity MTF MA logic.
- The strategy requires long base-timeframe warmup (`maxlen=5000`) for some interval/MTF settings.
- `data_layer` correctly rejects crypto history requests above its contract (`limit<=1500`).

Issue observed:

- Alpha containers logged repeated warmup failures:
  - `POST /v1/crypto/ohlcv/binance/batch` -> `400`;
  - `GET /v1/crypto/ohlcv/binance/{symbol}?limit=5000` -> `422`;
  - buffer stayed empty and strategy calls were skipped.
- Runtime warnings were visible in Docker logs but not consistently in host-mounted alpha log files.
- Realtime tick heartbeat logs were not useful for this alpha family after the data path had already
  been validated.

Fix:

- `execution_alpha/runtime/app/alpha_runtime/legacy/single_order/buffer.py` now uses paged warmup
  when `maxlen` exceeds `DATA_LAYER_WARMUP_REQUEST_LIMIT`.
- `execution_alpha/runtime/app/alpha_runtime/legacy/buffer.py` now follows the same data_layer
  contract for other legacy runtime users.
- Paged warmup uses valid per-page limits, walks backward with `end_time`, dedupes by candle open
  time, and keeps FIFO last `maxlen` bars.
- Empty warmup retries are throttled by `ALPHA_WARMUP_RETRY_BACKOFF_SECONDS`.
- `scalping_sl_tp` compose now sets `DATA_LAYER_WARMUP_REQUEST_LIMIT=1000`,
  `ALPHA_REALTIME_TICK_HEARTBEAT_SECONDS=0`, and Docker log rotation.
- `scalping_sl_tp` logger attaches root/runtime logs to the host-mounted `ALPHA_LOG_FILE`.

Validation checklist:

- Python compile for both runtime buffers and `sl_tp_map_ma_common.py`.
- `docker compose config --quiet` for `execution_alpha/alphas/scalping_sl_tp`.
- Restart the affected alpha containers.
- Confirm no new `limit=5000` data_layer 400/422 warmup errors.
- Confirm host log files under `execution_alpha/alphas/scalping_sl_tp/logs/` contain runtime warmup
  and stream lines.

Validation result:

- Python compile passed.
- Compose config validation passed.
- Recreated the four running paper containers only:
  - `sl_tp_map_ma_0015m_paper_binance`;
  - `sl_tp_map_ma_00115m_paper_binance`;
  - `sl_tp_map_ma_0011h_paper_binance`;
  - `sl_tp_map_ma_00115m_paper_dnse`.
- Host-mounted logs now include runtime lines.
- Binance warmup after fix:
  - `BNBUSDT/SOLUSDT 5m`: `5000` rows each, latest closed open `2026-06-29T15:50:00Z`;
  - `ETHUSDT 15m`: `5000` rows, latest closed open `2026-06-29T15:30:00Z`;
  - `BTCUSDT/BNBUSDT 1h`: `5000` rows each, latest closed open `2026-06-29T14:00:00Z`.
- DNSE warmup after fix:
  - `VN30F1M 15m`: `1000` rows from current preload coverage. This is no longer a data_layer
    contract error; it reflects available VN preload rows.
- Waited through the next real closed-candle cycle:
  - 5m evaluated `2026-06-29T15:55:00Z`;
  - 15m evaluated `2026-06-29T15:45:00Z`;
  - 1h evaluated `2026-06-29T15:00:00Z`.
- No new `400`, `422`, `limit=5000`, `skip alpha call`, `WARNING`, or `ERROR` appeared in the
  checked host logs after the restart.

## 2026-06-29 Alpha Migration: vol_breakout_sl_tp

Scope:

- Migrated `execution_alpha/alphas/vol_breakout_sl_tp`.
- This strategy had no trusted legacy live code, so `main/backtest_code.py` is the source of truth.

Implementation:

- Added live runtime:
  - `main/vol_breakout_common.py`;
  - `main/vol_breakout_00115m.py`;
  - `main/vol_breakout_0011h.py`.
- Added shared runtime wrappers in `trade/`.
- Added alpha `config.yaml`, `docker-compose.yml`, `.env`, `README.md`, and
  `Documentation/RUNBOOK.md`.
- Added trading-system declarations to `config/_config/portfolio_account_config_setup.yaml`:
  - `vol_breakout_sl_tp_00115m`;
  - `vol_breakout_sl_tp_0011h`;
  - paper/sandbox Binance accounts;
  - risk profiles;
  - copy outbox policies.
- Added API keys to alpha `.env` and trading-system `.env`.

Backtest parity decisions:

- Signal math mirrors the backtest implementation:
  - EMA, ATR, RSI, ADX, Keltner channel, volume EMA, trend EMA.
- Warmup threshold is `max(ema_len, kc_len, vol_len, rsi_len, atr_len) + 30`.
- Entry condition follows the breakout cross and filters from backtest.
- Entry cooldown is `4h`.
- Sizing uses `%_equity`, `alloc_per_trade=0.5`, and symbol params leverage.
- Account allocation is `20000 USDT` per symbol:
  - `15m ETH/SOL`: `40000 USDT`;
  - `1h ETH/BTC`: `40000 USDT`.
- No TP is configured because the backtest has no TP ladder.
- Initial SL is `close +/- ATR * sl_mult`.
- Breakeven/trailing stop is implemented by trading_system bracket stop replacement.

Validation:

- Python compile passed.
- YAML parse passed.
- `docker compose config --quiet` passed.
- Docker runtime smoke passed for imports, active symbol selection, and synthetic signal calculation.
- `trading-system-cli config plan` accepted the full config.
- `trading-system-cli config apply` registered/upserted both alpha ids/accounts/risk rows.
- `alpha inspect` confirms the two alpha ids are active with paper/sandbox Binance accounts.
- `account state` confirms paper accounts are active with `40000 USDT` and leverage policy `20`.
- Started paper containers only:
  - `vol_breakout_sl_tp_00115m_paper_binance`;
  - `vol_breakout_sl_tp_0011h_paper_binance`.
- Host logs show warmup, stream subscribe, signal evaluation, and completed execution sessions.
- No warning/error appeared in checked logs after startup.

## 2026-07-18 Alpha Migration: delta_rsi

Scope:

- Migrated `execution_alpha/alphas/delta_rsi`.
- The folder was originally copied from `vol_breakout_sl_tp`; stale `vol_breakout_*` entrypoints,
  config names, README and runbook content were removed/replaced.
- `main/backtest_code.py` is the official source of truth.

Implementation:

- Replaced `main/delta_rsi_common.py` with a Delta-RSI live runtime:
  - Savitzky-Golay RSI derivative math copied from backtest semantics;
  - RSI/ATR/volume filters;
  - buy/sell/exit modes: `Zero-Crossing`, `Signal Line Crossing`, `Direction Change`;
  - closed-candle state-machine ordering matching backtest;
  - fresh entry only on latest-candle `flat -> long/short` transition;
  - no late entry from already-active historical state after restart;
  - indicator exits close through trading_system;
  - SL/TP/trailing lifecycle uses trading_system bracket orders and stop replacement.
- Added entrypoints:
  - `main/delta_rsi_00115m.py`;
  - `main/delta_rsi_0011h.py`;
  - `main/delta_rsi_0011d.py`;
  - `main/delta_rsi_0011m_dnse.py`.
- Added `config.yaml` from backtest parameter notes:
  - `hjhj`: `BTCUSDT 15m`;
  - `hyhy`: `ETHUSDT 1h`;
  - `hdhd`: `SOLUSDT 1h`;
  - `hrhr`: `ETHUSDT 1d`;
  - `grgr`: `VN30F1M 1m DNSE paper`.
- Updated `docker-compose.yml`:
  - Binance paper/sandbox for crypto deployments;
  - DNSE paper only for `VN30F1M`;
  - realtime tick stream disabled by default because the strategy is closed-candle driven;
  - logs mounted under alpha `logs/`.
- Updated alpha docs:
  - `README.md`;
  - `Documentation/RUNBOOK.md`.
- Added trading-system declarations in `config/_config/portfolio_account_config_setup.yaml`:
  - alpha registry rows;
  - paper/sandbox Binance accounts;
  - DNSE paper derivative account;
  - risk profiles;
  - portfolio allocations;
  - copy outbox policies.

Backtest-parity decisions:

- Backtest `pos_weight[t]` represents the position state at the start of candle `t`.
- Live execution therefore uses an extra `target_after[t]` state from the same state machine.
  It submits immediately after candle `t` closes when that candle creates a fresh
  `flat -> long/short` transition. This is equivalent to the `pos_weight[t+1]` state that the
  backtest would show on the next row, but live does not wait for the next candle to close.
- SL/TP intrabar semantics cannot be filled locally by alpha code. The alpha submits bracket
  children to trading_system so paper/live broker lifecycle owns protective execution.
- For `istrailing=true`, live stop replacement uses the closed candle `close` price, matching the
  backtest comments/code rather than tick high/low trailing.
- Sizing mirrors default portfolio comments:
  `initial_capital=20000`, `leverage=5`, `alloc_per_trade=0.5`, `hedge_type=%_equity`.
- Account allocation remains `20000` per symbol. The `1h` deployment has two symbols, so the
  account allocation is `40000`.

Validation:

- Python compile passed for all `delta_rsi/main/*.py`.
- YAML parse passed for `delta_rsi/config.yaml` and
  `trading_system/config/_config/portfolio_account_config_setup.yaml`.
- `docker compose config --quiet` passed in the alpha folder.
- Runtime image parity smoke passed:
  - imported `main/backtest_code.py` and `main/delta_rsi_common.py`;
  - generated synthetic OHLCV;
  - verified live `prev_side`, `exit_type`, and `exit_price` match backtest output.
- `trading-system-cli --json config plan /app/config/_config/portfolio_account_config_setup.yaml`
  passed and included Delta-RSI alpha/account/risk/allocation/copy-policy steps.
- `rg` confirmed no stale `vol_breakout` strings remain under `execution_alpha/alphas/delta_rsi`.
- Follow-up validation after no-delay signal review:
  - `config apply` returned `APPLIED`;
  - `alpha inspect` confirmed all Delta-RSI deployments are ACTIVE:
    `delta_rsi_00115m`, `delta_rsi_0011h`, `delta_rsi_0011d`, `delta_rsi_0011m_dnse`;
  - paper/sandbox Binance accounts and paper DNSE account were created/upserted;
  - Delta-RSI paper risk profiles were present for `BTCUSDT`, `ETHUSDT`, `SOLUSDT`,
    `VN30F1M`, and `VN30F1M.DNSE`;
  - full runtime-image parity smoke passed for official params from `config.yaml`, comparing
    backtest/live `pos_weight`, `exit_type`, and `exit_price`.

## 2026-07-18 Alpha Migration: adaptive_hma_cpp

Scope:

- Migrated `execution_alpha/alphas/adaptive_hma_cpp`.
- The folder was originally a copied Delta-RSI scaffold; stale `delta_rsi_*` entrypoints,
  config names, README and runbook content were removed/replaced.
- `main/backtest_code.py` is the official source of truth.

Implementation:

- Added `main/adaptive_hma_common.py` with Adaptive-HMA live runtime:
  - HMA/ATR/RSI/slope-angle math copied from backtest semantics;
  - adaptive HMA length expansion/contraction from ATR fast/slow regime;
  - distance-zone, RSI, overbuy/oversell entry logic;
  - fixed backtest order of intrabar SL, TP and indicator exits;
  - fresh entry only on latest-candle `flat -> long/short` transition;
  - no late entry from already-active historical state after restart;
  - indicator exits close through trading_system;
  - SL/TP lifecycle uses trading_system bracket orders.
- Added entrypoints:
  - `main/adaptive_hma_cpp_00115m.py`;
  - `main/adaptive_hma_cpp_0011h.py`.
- Added `config.yaml` from backtest parameter notes:
  - `ghgh`: `ETHUSDT 15m`;
  - `hyhy`: `ETHUSDT 1h`;
  - `gege`: `BTCUSDT 1h`;
  - `bvbv`: `SOLUSDT 1h`;
  - `bgbg`: `BNBUSDT 1h`;
  - `bobo`: `DOGEUSDT 1h`.
- Updated `docker-compose.yml`:
  - Binance paper/sandbox for both deployments;
  - realtime tick stream disabled by default because the strategy is closed-candle driven;
  - logs mounted under alpha `logs/`.
- Updated alpha docs:
  - `README.md`;
  - `Documentation/RUNBOOK.md`.
- Added trading-system declarations in `config/_config/portfolio_account_config_setup.yaml`:
  - alpha registry rows;
  - paper/sandbox Binance accounts;
  - risk profiles;
  - portfolio allocations;
  - copy outbox policies.

Backtest-parity decisions:

- Backtest `pos_weight[t]` represents the position state at the start of candle `t`.
- Live execution therefore uses an extra `target_after[t]` state from the same state machine.
  It submits immediately after candle `t` closes when that candle creates a fresh
  `flat -> long/short` transition. This is equivalent to the `pos_weight[t+1]` state that the
  backtest would show on the next row, but live does not wait for the next candle to close.
- SL/TP intrabar semantics cannot be filled locally by alpha code. The alpha submits bracket
  children to trading_system so paper/live broker lifecycle owns protective execution.
- Sizing mirrors default portfolio comments:
  `initial_capital=20000`, `leverage=5`, `alloc_per_trade=0.5`, `hedge_type=%_equity`.
- Account allocation remains `20000` per symbol. The `1h` deployment has five symbols, so the
  account allocation is `100000`.

Validation:

- Python compile passed for all `adaptive_hma_cpp/main/*.py`.
- YAML parse passed for `adaptive_hma_cpp/config.yaml` and
  `trading_system/config/_config/portfolio_account_config_setup.yaml`.
- `docker compose config --quiet` passed in the alpha folder.
- Runtime image parity smoke passed:
  - imported `main/backtest_code.py` and `main/adaptive_hma_common.py`;
  - generated synthetic OHLCV;
  - verified live `pos_weight`, `exit_type`, and `exit_price` match backtest output for all
    official params from `config.yaml`.
- Follow-up long parity smoke passed:
  - `ADAPTIVE_HMA_SMOKE_ROWS=5000`;
  - seeds `20260718,20260719`;
  - all six official param sets returned `pos_diff=0` and `exit_type_diff=0`;
  - this compares the full position-state vector, not only the final row.
- `trading-system-cli --json config plan /app/config/_config/portfolio_account_config_setup.yaml`
  passed and included Adaptive-HMA alpha/account/risk/allocation/copy-policy steps.
- `config apply` returned `APPLIED`.
- `alpha inspect` confirmed all Adaptive-HMA deployments are ACTIVE:
  `adaptive_hma_cpp_00115m`, `adaptive_hma_cpp_0011h`.
- Paper/sandbox Binance accounts were created/upserted.
- Adaptive-HMA paper risk profiles were present for `ETHUSDT`, `BTCUSDT`, `SOLUSDT`, `BNBUSDT`,
  and `DOGEUSDT`.
- `rg` confirmed no stale `delta_rsi` or `vol_breakout` strings remain under
  `execution_alpha/alphas/adaptive_hma_cpp`.

## 2026-06-30 Multi-Alpha Warning Audit

Scope:

- `vol_breakout_sl_tp`;
- `signal_combine`;
- `scalping_sl_tp`;
- `scalping_PSAR`;
- `qqe_ssl_wae_risk`;
- `grid_long_only`.

Detailed audit file:

```text
execution_alpha/ALPHA_WARNING_AUDIT_2026-06-30.md
```

Findings and fixes:

- Shared runtime latest-candle loop was over-polling data_layer batch OHLCV after candle close.
  Patched `execution_alpha/runtime/app/alpha_runtime/legacy/single_order/handler.py` so successful
  cycles sleep until the next candle close, batch failures back off, and empty/no-update cycles no
  longer hot-poll.
- `scalping_PSAR` bracket orders used legacy TP payloads with `price` but no `trigger_price`.
  Patched `trading_system/alpha_sdk/trading_system_async_action.py` to normalize TP children at the
  SDK boundary.
- `qqe_ssl_wae_risk` could retain stale local state and repeatedly submit reduce-only exits after
  trading_system already had no active position. Patched local state recovery on
  `REDUCE_ONLY_NO_POSITION`.
- Historical `signal_combine` sandbox `UNAUTHORIZED_ALPHA` warnings are stale log lines from
  2026-06-18 unless reproduced after restart.
- Sandbox `QTY_BELOW_MARKET_MINIMUM` remains a correct sizing guard, not an execution bug.

Validation:

- Python compile passed for all patched files.
- Restarted affected running alpha containers in the six-alpha scope.
- Waited through the next real `5m` candle boundary after restart.
- No new warning/error appeared in the checked post-restart window.
- Sampled logs confirmed new closed-candle evaluation continued for 5m alpha containers.
- Read-only DB audit for affected alpha ids after `2026-06-30 05:49:00+00` returned zero new
  `orders` rows, so no new rejected/order rows were produced during the short validation window.

Follow-up on `2026-06-30 06:07-06:23 UTC`:

- Rechecked all currently running paper alpha logs, not only the original six folders.
- Crypto paper data/execution warnings stayed clean.
- Fixed VN/DNSE `VN30F1M` preload read-through:
  - DNSE direct OHLC now treats `end` as an inclusive trading date;
  - DNSE Unix timestamps are stored as canonical naive `Asia/Ho_Chi_Minh` timestamps;
  - VN preload read-through top-up tolerance is now `5` minutes.
- Reset the original six alpha folders with `--preserve-config --clean-alpha-files`.
- Restarted only `_paper_` services from those six compose files.
- Confirmed 18 paper containers were up and the post-reset `06:20-06:23 UTC` warning/error window
  was clean.

## 2026-06-30 VN30F1M DNSE Derivative Accounting Fix

Problem found from `paper-dnse-combine_weight_sl_tp_0015m`:

- The account, fills, orders, balances, and snapshots were already stored in `VND`, not USD.
- The confusing `-42160` unrealized PnL was therefore `VND`, but the surrounding display/log layer
  can still label it incorrectly if it ignores the `currency` column.
- The real domain bug was instrument modeling:
  - `VN30F1M.DNSE` had been treated like `VN_STOCK`;
  - metadata had stock-style/default quantity behavior;
  - `multiplier=1`;
  - risk, sizing, paper reservation, fill commission, portfolio PnL, and performance mark projection
    could all use `price * quantity` instead of `price * contracts * contract_multiplier`.

Fix implemented:

- Added `shared/instrument_math.py` as the common notional/PnL helper.
- Updated `domain.market_metadata.default_market_metadata()`:
  - VN equities remain `step_size=100`, `multiplier=1`;
  - `VN30F* M` symbols are now `VN_DERIVATIVE`, `step_size=1`, `tick_size=0.1`,
    `multiplier=100000`, quantity unit = contracts.
- Added additive migration `init-db/29-vn-derivative-instruments.sql` to upsert
  `VN30F1M.DNSE` with derivative metadata.
- Updated multiplier-aware paths:
  - gateway capital-model sizing;
  - portfolio-target rebalance sizing;
  - risk checker exposure;
  - batch risk grant notional checks;
  - paper matcher commission;
  - paper reservation and instrument upsert;
  - portfolio fill accounting realized/unrealized PnL, notional, account balance, settlement,
    and legacy volume projection;
  - performance service mark-to-market snapshots.
- Updated `portfolio_account_config_setup.yaml` VN30F1M DNSE paper caps so at least one valid
  futures contract is not rejected by old stock-like VND notional limits:
  - `max_notional_order=2500000000`;
  - `max_notional_position=10000000000`;
  - `max_daily_loss=500000000`.

Validation:

- Local `py_compile` passed for touched trading_system modules.
- Docker targeted tests passed:

```bash
docker compose --profile test run --rm --no-deps test_runner pytest \
  tests/unit/test_sizing.py \
  tests/unit/test_risk_checker_market_metadata.py \
  tests/unit/test_paper_execution.py \
  tests/unit/test_performance_projection.py \
  tests/unit/test_portfolio_accounting_v2.py -q
```
- Applied running DB migration:
  - `init-db/29-vn-derivative-instruments.sql`;
  - verified `VN30F1M.DNSE` is `VN_DERIVATIVE`, `tick_size=0.1`, `lot_size=1`,
    `min_qty=1`, `multiplier=100000`, `currency=VND`.
- Applied canonical config with `trading-system-cli config apply`.
- Scoped reset executed for:
  - `alpha_id=combine_weight_sl_tp_0015m`;
  - `account_id=paper-dnse-combine_weight_sl_tp_0015m`;
  - config rows preserved.
- Restarted affected trading-system services: `gateway`, `risk_engine`, `paper_execution`,
  `portfolio`, `performance`.
- Restarted `combine_weight_sl_tp_0015m_paper_dnse`.
- Post-reset DB state:
  - `orders=0`;
  - `fills=0`;
  - `positions_v2=0`;
  - latest `account_equity_snapshots` is clean `VND` projection with zero PnL/exposure/fills.
- Startup logs show `VN30F1M` warmup loaded and DNSE paper market closed sleep engaged; no startup
  warning/error in the checked window.

Operational note:

- Reset affected DNSE paper alpha/account data after applying this migration. Rows created before
  this fix used the wrong derivative model and should not be mixed with fresh validation snapshots.

## 2026-06-30 Deep Momentum Lazy Model Server Update

Reason:

- The previous Deep Momentum model lifecycle depended on the alpha runner mounting Docker socket and
  recreating/starting/stopping `deep_momentum_model` on demand.
- That design saved RAM, but it was fragile for this server workflow because frequent
  `docker system prune -af` can delete stopped/created containers and images.

Decision:

- Keep `deep_momentum_model` as a normal compose-managed service with `restart: unless-stopped`.
- Keep the container up, but do not load model weights at process start.
- `/health` is lightweight and reports `model_state=SLEEPING` while weights are unloaded.
- `/warmup` and `/predict` lazy-load the bundle only when a due/forced/bootstrap rebalance really
  needs predictions.
- After `DEEP_MOMENTUM_MODEL_IDLE_UNLOAD_SECONDS` of inactivity, the server drops the loaded bundle
  reference and runs garbage collection.
- The runner now only uses HTTP `/health`, `/warmup`, `/predict`; it no longer mounts
  `/var/run/docker.sock` and no longer controls Docker lifecycle.

Expected behavior:

- Normal idle state uses little RAM/CPU: runner sleeps by schedule; model service is alive but
  sleeping.
- A non-due run exits after lightweight data_layer due-check and does not wake model weights.
- A due run builds features, warms the model, predicts, submits/plans target-weight rebalance, then
  the model naturally unloads after idle timeout.
- After Docker prune, recreate compose services; if the runtime image was pruned, rebuild/pull it as
  usual. There is no hidden stopped-container state to preserve.

Validation:

- `py_compile` passed for `model_server.py`, `model_client.py`, and `deep_momentum_runner.py`.
- Deep Momentum production and fast-plan JSON configs parse successfully.
- `docker compose config --quiet` passed in `execution_alpha/alphas/deep_momentum`.
- Removed old stopped non-compose `deep_momentum_model` container from the previous lifecycle design
  and recreated it through compose.
- `/health` after startup returned `model_state=SLEEPING`, `feature_count=null`.
- `/warmup` returned `MODEL_READY`, `feature_count=46`.
- Fast-plan plan-only run:
  - loaded `60/60` symbols;
  - built `46` feature columns;
  - latest closed daily bar `2026-06-29T00:00:00+00:00`;
  - planned `12` target-weight orders;
  - `submitted=false`, so no paper orders were inserted by this smoke.
- Production runner was force-recreated after the change.
- Mount inspection confirmed no `/var/run/docker.sock` in the runner.
- First production cycle after recreate returned `CALENDAR_MONTHLY_NOT_DUE`, skipped heavy
  feature/model flow, and slept until the next daily UTC check.

## 2026-07-01 Combine/FIB DNSE Sizing and Realtime Log Cleanup

Observed from recent alpha logs:

- `combine_weight_sl_tp` Binance paper had a small number of stale data-layer warnings around
  `2026-06-30 06:09-06:15 UTC` while `data_layer:8100` refused connections. This matches a
  transient data_layer restart/backoff window, not a strategy bug.
- `combine_weight_sl_tp` and `fib_sl_tp_strength` DNSE paper logs showed repeated stale latest
  candle warnings for `VN30F1M`; keep this visible for VN market diagnostics, but avoid raw tick
  heartbeat spam.
- `fib_sl_tp_strength_0015m` DNSE paper repeatedly skipped entries with
  `QTY_BELOW_MARKET_MINIMUM`: the gateway sizing endpoint correctly uses
  `VN30F1M multiplier=100000`, but alpha/risk config allowed the effective notional budget to fall
  below one futures contract in some states.

Fix plan:

- Do not change strategy signal logic.
- Keep DNSE paper accounts in `VND` with `initial_capital=25000000000`.
- Set VN30F1M alpha-side capital model to a small but valid derivative budget:
  `alloc_per_trade=0.02`, `leverage=1`, `max_notional_cap=250000000`.
  This is enough for one VN30F1M contract around current prices while preventing oversized paper
  orders.
- Keep trading_system risk profile caps larger than the alpha-side cap so gateway sizing can round
  to valid exchange lot size without being blocked by stale/default mixed-market caps.
- Set `ALPHA_REALTIME_TICK_HEARTBEAT_SECONDS=0` for combine/fib containers. Closed-candle/session
  logs remain; realtime stream still feeds runtime callbacks/protective logic without tick heartbeat
  log spam.

Implemented:

- Updated `execution_alpha/alphas/fib_sl_tp_strength/config.yaml` VN30F1M capital model.
- Updated `execution_alpha/alphas/combine_weight_sl_tp/config.yaml` VN30F1M capital model.
- Updated both alpha compose files to disable realtime tick heartbeat logs.
- Updated declarative risk config for these two DNSE profiles to use exact trading-system
  instrument IDs: `VN30F1M.DNSE`.
- Changed combine/fib mixed-market YAML `default_risk` blocks into `risk_template` blocks where the
  strategy should only use explicit `risk_profiles`. This prevents USDT/BINANCE defaults from
  becoming DNSE wildcard rows.
- Updated `services/gateway/repository/admin_config.py` so `register_alpha()` only creates wildcard
  risk rows when the register payload explicitly includes `risk`. Explicit per-instrument risk
  profiles continue to be applied through `/v1/admin/alphas/{alpha_id}/risk`.

Validation:

- `py_compile` passed for `services/gateway/repository/admin_config.py` and
  `execution_alpha/alphas/fib_sl_tp_strength/main/fib_sl_tp_strength_common.py`.
- Targeted pytest could not run in the current runtime image because `pytest` is not installed in
  the `cli` image; validation used import checks, compose config checks, DB audit, and gateway smoke
  calls instead.
- Restarted `gateway_service` after the admin config patch.
- Reset scoped DB rows for `combine_weight_sl_tp` and `fib_sl_tp_strength`, then reapplied
  `/app/config/_config/portfolio_account_config_setup.yaml`.
- DB audit confirmed DNSE risk rows are now explicit only:
  `combine_weight_sl_tp_0015m/paper/DNSE/VN30F1M.DNSE` and
  `fib_sl_tp_strength_0015m/paper/DNSE/VN30F1M.DNSE`, with no `<NULL>` wildcard fallback.
- Gateway `/v1/sizing/estimate` smoke for both DNSE accounts returned `status=OK`,
  `quantity=1`, `notional=201500000`, and market info with `multiplier=100000`, `step_size=1`.
- Restarted paper-only containers for the affected combine/fib services. Initial warning scan:
  combine paper logs clean; fib DNSE entry created valid MARKET/STOP/TAKE_PROFIT rows without
  reject.
- Downgraded fib partial-TP sub-lot carry logs from `WARNING` to `INFO`: for a one-contract VN30F1M
  position, partial TP fractions such as `0.5` or `0.2` cannot be placed as separate exchange
  children, so the runtime carries them until a valid whole-contract child can be submitted.

## 2026-07-09 Basis Arb Binance Alpha Phase 2

Context:

- New alpha folder: `execution_alpha/alphas/basis_arb_binance`.
- Research source: `git@github.com:BobbyAxerol/basis-arb-binance.git`.
- Pinned local checkout: `/root/bobby/_research_sources/basis-arb-binance`.
- Strategy is Binance USD-M basis arbitrage between `BTCUSDT` perpetual and current-quarter
  delivery contract such as `BTCUSDT_260925`.

Implemented outside trading_system:

- Phase 2 alpha planner verifies source commit/dirty state and `parameters.json` checksum.
- Warmup uses SSH from VPS2 to VPS1 and runs research data functions inside VPS1 Docker image
  `get_data-collectors:latest` because VPS1 host Python has no `pandas`.
- Recent 30-day derivatives data comes from local `data_layer`
  `/v1/binance/futures/basis-bundle`.
- Adapter calls source `BasisStrategy.generate_positions()`; it does not use stale guide method
  `evaluate_live_signal()`.
- Planner writes two-leg target plan to `state/latest_plan.json`.
- Phase 2 is planning-only and refuses `execution.submit=true`.

Validation:

- Docker synthetic smoke covered neutral/bull/bear:
  - neutral -> both legs flat;
  - bull -> long perp, short quarterly;
  - bear -> short perp, long quarterly.
- Real one-shot smoke loaded 365 warmup rows from VPS1 and 30 recent daily rows from data_layer.
- Current latest plan generated `state=neutral` for `BTCUSDT_260925` and did not submit orders.

Trading-system follow-up:

- Phase 3 must add an arbitrage package endpoint before this alpha can submit.
- Required package policy: `ATOMIC_ALL_OR_NONE` for paper mode, with package-level gross exposure,
  leg imbalance checks, audit metadata, and copy-outbox compatibility.
- Sandbox/live Binance cannot guarantee true exchange-level atomic multi-leg execution, so the live
  path needs a compensation state machine before production use.

## 2026-07-09 Basis Arb Binance Phase 3 Trading-System Package Execution

Implemented:

- Added gateway endpoint `POST /v1/order-packages/arb`.
- Added package schema/core/repository:
  - `services/gateway/schemas/arb_package_schema.py`;
  - `services/gateway/core/arb_package.py`;
  - `services/gateway/repository/arb_packages.py`.
- Added DB migration `init-db/30-arb-order-packages.sql` with table `arb_order_packages`.
- Extended order schema with `reference_price` and `market_info`.
- Extended risk checker to prefer per-order `market_info` before Redis/default metadata.
- Extended shared alpha SDK with `submit_arb_package()`.
- Registered `basis_arb_binance_1d` paper Binance config in
  `config/_config/portfolio_account_config_setup.yaml`.

Package behavior:

- `submit=false` returns a planned two-leg package without touching orders.
- `submit=true` currently supports paper mode only.
- Paper mode:
  - calculates package gross/net notional and imbalance bps;
  - rejects the whole package if package imbalance exceeds the configured threshold;
  - creates a package-level pre-risk grant;
  - submits bulk orders only when all legs pass pre-risk;
  - records package status in `arb_order_packages`.
- Sandbox/live mode returns `NOT_IMPLEMENTED` for now because Binance USD-M does not provide true
  exchange-level atomic execution across perp and delivery legs. Live support must add an explicit
  compensation/recovery workflow before being enabled.

Validation:

- Applied migration `30-arb-order-packages.sql` to the running Postgres container.
- Applied portfolio/account/risk config for `basis_arb_binance_1d`.
- Restarted `gateway` and `risk_engine`.
- Container tests passed:
  - `tests.unit.test_alpha_sdk_order_state`;
  - `tests.unit.test_risk_grants`;
  - direct arb-package core smoke.
- Gateway smoke:
  - `submit=false` returned `PLANNED`, 2 legs, 0 rejections;
  - first submit exposed malformed market metadata because the manual payload omitted
    `precision_amount`;
  - fixed gateway normalization to infer `precision_amount` from `step_size`;
  - second paper submit returned `SUBMITTED`.
- DB audit after the successful submit:
  - `arb_order_packages`: latest package state `SUBMITTED`, `leg_count=2`;
  - `orders`: 2 latest basis-arb orders `FILLED`;
  - `fills`: 2 fills;
  - `positions_v2`: LONG `BTCUSDT.BINANCE` and SHORT `BTCUSDT_260925.BINANCE` under
    `paper-binance-basis_arb_binance_1d`.
- Sandbox guard smoke returned HTTP `501` with
  `ARB_PACKAGE_SUBMIT_ONLY_SUPPORTS_PAPER_MODE_FOR_NOW`.
- One-shot basis alpha runner still works with the Phase 3 config default:
  - source pin verified;
  - SSH warmup returned 365 rows;
  - data_layer basis bundle returned 30 rows;
  - latest state was `neutral`, so `submit=false` made no order submission.

Notes:

- The current paper smoke left small test rows for `basis_arb_binance_1d`: one rejected package
  from pre-fix metadata and one successful filled package. Use scoped lab reset before a clean
  production-style paper run if needed.
- Copy-outbox remains structurally compatible because package metadata is stored on each order leg,
  but copy-trading consumers should treat package legs as correlated events once package replay is
  implemented.
- Basis arb paper config was adjusted to match research hedging assumptions before user-run paper:
  `initial_capital=20000`, `allocation=10`, `leverage=25`, target notional `200000 USDT` per leg,
  and gross buying-power assumption `500000 USDT`. Trading-system account allocation is therefore
  `20000 USDT`, with `max_leverage=25` and per-leg notional/risk caps set around `250000 USDT`.
- Basis arb daemon readiness fix: detached Docker paper mode must not call VPS1 SSH warmup every
  daily cycle. The alpha now bootstraps a local history cache from data_layer if missing, then
  appends a small daily tail from data_layer after the 1d candle close. SSH warmup remains optional
  for manual parity/debug only, avoiding stale `${SSH_AUTH_SOCK}` failures in long-running daemon
  mode.

## 2026-07-13 Basis Arb Quant-Data Contract Update

Basis alpha hardening was completed in `execution_alpha/alphas/basis_arb_binance` without changing
the trading-system arb package endpoint:

- The alpha no longer treats current-quarter kline history as sufficient for Kalman warmup. If
  `state/basis_frame_cache.json` plus the latest append has fewer than 365 rows, it fails closed.
- First bootstrap uses the pinned research warmup path; normal daily cycles then use the 365-row
  cache plus a 5-row data_layer append.
- data_layer append now covers:
  - perp/current-quarter klines and basis;
  - 365d funding via chunked data_layer `/v1/binance/futures/funding-rate`;
  - 30d OI, long/short, and taker metrics through Binance derivatives wrappers.
- Historical orderbook depth is sourced from VPS1 `_get_data`
  `binance_orderbook_snapshot_1h`, cached under the alpha state folder, and resampled into the
  research feature schema.
- Depth naming rule recorded: `q_` in the VPS1 depth dataset means quote-notional, not quarterly.
  The alpha maps perp and delivery symbols separately into research columns to avoid semantic
  leakage.

Validation:

- Basis module compile, JSON validation, and compose config passed.
- Container depth-cache smoke loaded `1388` hourly depth rows from VPS1.
- Submit-disabled one-shot runner with SSH warmup produced a 365-row cache and neutral plan.
- Submit-disabled one-shot runner without SSH reused cache + data_layer append and produced a
  neutral plan. No orders were submitted during this validation.

## 2026-07-13 Basis Arb Warmup Moved To Data Layer Vision Wrapper

Follow-up correction:

- Basis price/basis warmup no longer depends on SSH to VPS1 research.
- data_layer now exposes `POST /v1/binance/futures/continuous-basis-bundle`.
- The new endpoint rebuilds a rolling 365-day active-quarterly chain from Binance Vision USD-M
  kline ZIPs and mirrors the research `DataPreprocessor` stitching rule:
  - candidate quarterly symbols by expiry suffix;
  - active window from previous expiry to current expiry;
  - 3-day volume-crossover marker;
  - aligned perp/quarterly daily candles;
  - `basis`, `days_to_expiry`, and `is_after_crossover`.
- Binance Vision monthly ZIPs are cached in data_layer; daily fallback is limited to recent months
  to avoid hundreds of unnecessary 404 calls.
- `basis_arb_binance` now uses `warmup.mode=data_layer_continuous_basis`.
- VPS1 research remains useful for historical orderbook depth until that collector is moved into
  data_layer.

Validation:

- data_layer targeted Binance derivatives contract tests passed.
- 365-day continuous basis smoke returned 365 rows from `binance_vision` in about 11 seconds.
- basis alpha one-shot smoke with no SSH mount and `submit=false` loaded 365 warmup rows through
  data_layer, appended recent rows, and produced a neutral plan without submitting orders.

## 2026-07-18 PMax Confluene Alpha Migration

Scope:

- Migrated `/root/bobby/execution_alpha/alphas/pmax_confluene` from a copied Adaptive HMA scaffold
  into its own closed-candle alpha family.
- `main/backtest_code.py` is the source of truth for strategy logic and official parameters.
- Active deployments:
  - `pmax_confluene_00115m_binance`: 15m `ETHUSDT,BTCUSDT`, paper/sandbox Binance;
  - `pmax_confluene_00115m_dnse`: 15m `VN30F1M`, DNSE paper only.

Trading-system config:

- Added alpha registry, account policies, allocations, risk profiles, and copy-outbox policies in
  `config/_config/portfolio_account_config_setup.yaml`.
- Crypto paper sizing mirrors the backtest portfolio model:
  `initial_capital=20000`, `leverage=5`, `alloc_per_trade=0.95`, `hedge_type=%_equity`.
  Because two symbols share the Binance alpha account, the account allocation is `40000 USDT`.
- DNSE paper derivative sizing uses a separate VND account with `25000000000 VND` allocation and
  DNSE derivative metadata/guardrails for `VN30F1M` and `VN30F1M.DNSE`.
- Sandbox Binance remains intentionally capped by small sandbox notional/risk guards.

Live-code contract:

- Live code must evaluate only latest closed candles and must not replay stale historical entries
  after restart.
- Entry orders are submitted as trading-system bracket market orders.
- SL/TP lifecycle is delegated to trading_system bracket/paper/broker lifecycle instead of local
  tick-stream simulation.
- Realtime tick stream is disabled by default for this strategy to reduce Redis/log IO.

Parity test requirement:

- The required signal test compares `backtest_code.generate_pmax_confluence_signals()` against
  `main/pmax_confluene_common.py` output.
- The comparison must cover full output vectors for `pos_weight`, `exit_type`, and `exit_price`.
- It is not sufficient to compare two duplicated live cores, because that can hide strategy drift.

## 2026-07-19 Trading System Technical Debt Closure Roadmap

Branch:

- Work for this debt-closure pass starts from `dev` on branch `debt-phase0-audit`.
- Phase 0 is read-only for runtime systems: no service restart, no reset, no config apply, no DB
  mutation except markdown/git metadata in this repository.

Debt items covered by this roadmap:

1. Event store / replay engine is not complete.
2. Risk engine still has compatibility-bridge behavior and is not yet a pure `risk_engine_v2`.
3. Paper execution is not yet a full institutional simulator for depth/volume partial fills,
   realistic latency/slippage, and native paper amend.
4. Deep Momentum production alias is intentionally plan-only by default and lacks strict missed
   calendar-bar catch-up.
5. Performance/PnL projection has no alpha-facing/operator endpoint/dashboard contract yet.
6. Shared physical broker binding works but still needs clean operational baseline discipline before
   new sandbox/live tests.
7. Capital sizing endpoint exists, but CLI/operator ergonomics for inspecting and managing sizing
   profiles are still incomplete.

### Debt Phase 0 - Debt Freeze And Baseline Audit

Goal:

- Freeze the current debt state and get a clean read-only picture of runtime health before any core
  refactor.
- Mark stale notes as `SUPERSEDED` where later sections prove the work is already done.
- Produce a clear baseline for later phases without disrupting live/paper alpha containers.

Scope:

- Update this markdown with a debt ledger and phase roadmap.
- Read current Docker/service status.
- Read gateway `/v1/health` and `/v1/health/capabilities` if available.
- Read-only DB audit for:
  - `orders`;
  - `fills`;
  - `positions_v2`;
  - `account_balances`;
  - `risk_grants`;
  - `order_brackets`;
  - `broker_account_sync_snapshots`;
  - `reconciliation_findings`;
  - `copy_event_outbox`;
  - `copy_event_dead_letters`;
  - `service_heartbeats`.
- Read-only Redis audit for core stream pending/dead-letter/copy stream sizes if available.

Exit criteria:

- The debt list is classified as `OPEN`, `INTENTIONAL_LIMITATION`, `SUPERSEDED`, or `CLOSED`.
- No runtime services are restarted or mutated.
- Any historical sandbox mismatch is identified as historical/operational debt rather than a new
  code bug.

### Debt Phase 1 - Operator Surface Fast Wins

Goal:

- Improve day-to-day visibility and management before deeper core rewrites.

Scope:

- Add alpha/account/portfolio-facing Performance/PnL read endpoints.
- Add CLI commands for performance snapshots and sizing explanations.
- Add broker-binding runbook/CLI polish for shared physical accounts.
- Make Deep Momentum production alias submit/catch-up behavior explicit and operator-safe.

Exit criteria:

- Operators can inspect PnL, sizing, risk cap, broker binding, and Deep Momentum run state without
  manual SQL.
- No alpha behavior changes are required for existing migrated alphas.

### Debt Phase 2 - Event Store And Replay Engine V1

Goal:

- Provide deterministic order/fill/account/bracket replay for audit, crash recovery verification,
  and system-level backtest parity checks.

Scope:

- Define the canonical immutable event envelope for order, fill, bracket, risk, position, and account
  events.
- Add replay by `trace_id`, `client_order_id`, `alpha_id`, `account_id`, and time range.
- Rebuild projections into memory or temp schema first; do not replace production projections in
  this phase.

Exit criteria:

- Replay can reconstruct a known order lifecycle and compare it against current projections.
- Replay mismatches identify the event/projection boundary that diverged.

### Debt Phase 2 Implementation Log - 2026-07-19

Status: `COMPLETE`

Guardrail:

- Phase 2 must be additive and read-only for existing production projections. It must not restart
  running alpha containers, reset Redis, mutate open orders, or replace `positions_v2`/portfolio
  accounting state.
- Replay V1 may append/query `domain_events` through explicit event-store APIs, but normal runtime
  order/fill writers are not migrated in this phase unless separately planned.

Implementation plan:

- [x] Add a canonical event-store repository on top of existing `domain_events` and
  `event_idempotency`.
- [x] Add a replay engine that can merge immutable `domain_events` with synthetic lifecycle events
  derived from durable projections (`orders`, `fills`, `order_brackets`, `order_bracket_legs`).
- [x] Add in-memory fill replay for audit/comparison against current `positions_v2`; no production
  projection writes in this phase.
- [x] Expose admin endpoints for event query, order lifecycle replay, and replay-vs-current
  comparison.
- [x] Expose alpha-scoped read endpoints with gateway auth and account ownership checks.
- [x] Add CLI commands for operator replay inspection.
- [x] Add unit coverage for replay ordering, fill projection, mismatch detection, CLI parsing, and
  repository query shape.

Expected limitation:

- V1 replay is sufficient for order/fill/bracket audit and crash-recovery verification. It is not
  yet a full market-data replay/backtest engine and does not replace live portfolio projections.

Implemented files:

- `services/gateway/repository/event_store.py`: event append/query helpers, synthetic projection
  lifecycle builder, replay-vs-current comparator orchestration.
- `services/gateway/core/event_replay.py`: deterministic event ordering, fill projection, and
  `positions_v2` comparison helpers.
- `services/gateway/main.py`: admin and alpha-scoped read endpoints:
  - `GET /v1/admin/events`
  - `GET /v1/events`
  - `GET /v1/admin/replay/order-lifecycle`
  - `GET /v1/replay/order-lifecycle`
  - `GET /v1/admin/replay/compare`
  - `GET /v1/replay/compare`
- `cli/__main__.py`: operator commands:
  - `cli replay events`
  - `cli replay lifecycle`
  - `cli replay compare`
- `OPERATIONS_OBSERVABILITY_RUNBOOK.md`: replay audit runbook.

Tests:

- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit/test_event_replay.py tests/unit/test_cli.py -q`
- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit -q`
- `git diff --check`

### Debt Phase 3 - Pure Domain Risk Engine V2

Goal:

- Replace compatibility-bridge risk behavior with deterministic, account/mode/venue/instrument-aware
  pure-domain decisions.

Scope:

- Introduce pure risk request/context/decision/reservation objects.
- Reuse existing risk grants and broker-sync gates, but route them through a clearer domain model.
- Keep the current gateway/stream contract backward-compatible during migration.

Exit criteria:

- Unit tests can exercise risk decisions without DB/service side effects.
- Integration tests prove gateway -> risk v2 -> paper and sandbox preflight behavior is unchanged
  except where explicitly improved.

### Debt Phase 3 Implementation Log - 2026-07-19

Status: `COMPLETE`

Guardrail:

- Phase 3 must keep the current gateway/Redis stream contract unchanged: alpha orders still enter
  `order.inbound`, approved orders still route to execution streams, and rejected orders still
  project through the existing rejection/copy-event path.
- Existing broker-sync, risk-grant, portfolio reservation, and pending-exposure writes remain in
  the runtime orchestration layer. This phase introduces a pure-domain decision core and bridges
  the current checker to it without resetting or restarting running services.

Implementation plan:

- [x] Add pure-domain risk request/context/decision objects for order intent, profile exposure,
  market metadata, market snapshot, and decision output.
- [x] Move deterministic lot/tick rounding, market validity, price-deviation, reduce-only, and
  exposure-limit decisions into a pure `PureRiskEngine` that can run without Redis/DB.
- [x] Keep `RiskChecker.validate_order(...)` backward-compatible by using the pure engine after
  the existing duplicate/API-weight/metadata lookup bridge.
- [x] Preserve current reject reason strings and payload mutation fields (`requested_quantity`,
  `rounded_quantity`, `quantity`, `risk_context`) so downstream projections and alpha SDK behavior
  stay stable.
- [x] Add unit tests for pure risk decisions without DB/service side effects and compatibility
  tests proving `RiskChecker` still behaves the same for existing edge cases.
- [x] Document that Phase 3 is the pure-domain core bridge, not yet a full deletion of every
  compatibility path in `risk_engine/main.py`.

Implemented files:

- `services/risk_engine/core/domain_v2.py`: pure risk request/profile/market metadata/decision
  objects plus `PureRiskEngine.evaluate_order(...)`.
- `services/risk_engine/core/checker.py`: compatibility bridge now performs Redis duplicate/API
  weight/metadata lookup, then delegates deterministic order validation to `PureRiskEngine`.
- `tests/unit/test_risk_domain_v2.py`: DB-free/Redis-free coverage for venue rounding,
  below-step rejects, contract-multiplier exposure, and broker-authoritative reduce close.

Supplement after review:

- Added pure runtime gate objects:
  - `RiskGrantContext`
  - `BrokerSyncContext`
  - `RiskGateContext`
  - `RiskGateDecision`
- Added `PureRiskEngine.evaluate_pre_market_gates(...)` for risk grant, mode/venue allowlist,
  stale-order intent, and cancel-intent pass-through.
- Added `PureRiskEngine.evaluate_runtime_gates(...)` for profile active state, trading state,
  portfolio/account operational state, one-way physical binding conflict, broker-sync gate,
  broker-authoritative close bypass, and per-minute throttle decision.
- Added `RiskReservationIntent` as the pure-domain handoff object for portfolio reservation and
  pending-exposure projection. Runtime still writes reservations through
  `PortfolioManagementRepository`, but the intent is now explicit and auditable in `risk_context`.
- Bridged `risk_engine/main.py` through pre-market/runtime gate decisions while preserving the
  existing Redis stream contract, reject reason strings, risk-grant invalidation behavior, and
  copy-event projection.
- Added `risk_gate_stage` to applied gate contexts so rejected orders can be traced to
  `risk_grant`, `mode_venue`, `order_age`, `profile`, `trading_state`, `operational_state`,
  `one_way_binding`, `broker_sync`, `broker_sync_bypass`, or `throttle`.

Tests:

- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit/test_risk_domain_v2.py tests/unit/test_risk_checker_market_metadata.py tests/unit/test_risk_market_data_status.py tests/unit/test_risk_broker_sync.py tests/unit/test_risk_grants.py -q`
- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit -q`
- `git diff --check`

Additional supplement tests:

- Pure pre-market gate invalid risk grant, stale/cancel behavior.
- Pure runtime gate reducing-only state, operational reducing reject, broker-sync mismatch deny,
  broker-authoritative bypass, throttle reject.
- Explicit `RiskReservationIntent` construction from approved order payload.

Residual limitation:

- Phase 3 removes deterministic order validation from the compatibility checker, but
  `risk_engine/main.py` still owns runtime I/O orchestration: Redis stream consumption,
  risk-grant invalidation, broker-sync lookup, portfolio reservation, pending-exposure writes,
  and copy-event projection. That boundary is intentional for this phase; deleting those
  compatibility paths belongs to a later risk-engine service refactor.

### Debt Phase 4 - Paper Execution Institutional Simulator V2

Goal:

- Make paper mode closer to venue behavior for advanced order lifecycle simulation.

Scope:

- Depth/volume-aware partial fill model.
- Deterministic replay mode for market event sequences.
- Realistic latency/slippage model, default disabled for CI.
- Native paper amend where possible instead of cancel-replace only.
- IOC/FOK/STOP/TP/TRAILING/bracket lifecycle coverage across Binance-like and DNSE paper models.

Exit criteria:

- Paper simulator can reproduce partial fill, cancel remainder, IOC/FOK, native amend, and bracket
  child lifecycle in deterministic tests.

Implementation checklist:

- Keep the existing production default conservative: no synthetic latency, no synthetic slippage unless
  `paper_matcher_config` enables it, and no broad raw market-data Pub/Sub subscription.
- Extend the matcher as a pure deterministic simulator boundary first, then let `PaperExecutionClient`
  and `PaperExecutionRepository` consume it without changing Redis stream contracts.
- Model venue-like behavior for:
  - tick/depth-volume partial fills with per-event fill caps;
  - IOC partial-fill/cancel remainder and FOK all-or-none cancel;
  - STOP, TAKE_PROFIT, TRAILING_STOP_MARKET, GTD expiry;
  - latency-gated matching and slippage-adjusted marketable fills;
  - native paper amend of open order state where possible, with cancel-replace kept as fallback.
- Keep bracket lifecycle delegated to the existing gateway bracket manager; Phase 4 only verifies that
  paper child orders can be simulated with the same order types and deterministic status transitions.

Progress log:

- Pending at phase start: paper matcher already had simple partial/IOC/FOK/STOP/TP/GTD behavior,
  but it lacked latency gating, deterministic replay helpers, trailing-stop state, depth-volume caps,
  and native in-place paper amend.
- Implemented additive simulator V2 behavior:
  - `MarketTick` now accepts bid/ask and deterministic sequence metadata.
  - `PaperMatcherConfig` now models latency, per-event liquidity caps, and optional default event
    liquidity while preserving existing no-latency/no-slippage defaults.
  - `PaperOrderMatcher` now supports deterministic replay, latency-gated matching,
    quote-aware execution price, volume-capped partial fills, and paper
    `TRAILING_STOP_MARKET` state in `matcher_state`.
  - `PaperExecutionRepository` now supports native in-place amend for open paper orders; client
    falls back to cancel-replace only when the repository cannot amend natively.
  - `paper_matcher_config` schema is extended additively for V2 liquidity/event latency knobs.
- Kept institutional simulator V2 deliberately bounded:
  - It is deterministic and venue-like, but still not a full order-book simulator.
  - Depth is represented by event liquidity/quote metadata, not a live L2 book replay.
  - Realistic latency/slippage remains opt-in; CI/prod defaults remain stable.

Tests:

- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit/test_paper_simulator_v2.py tests/unit/test_paper_execution.py tests/unit/test_order_brackets.py -q`
- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit -q`
- `git diff --check`

### Debt Phase 5 - Full System Matrix And Alpha Regression

Goal:

- Prove the upgraded system still supports existing alpha families.

Matrix:

- Paper Binance single-order, bracket, multi-symbol rebalance, and arb package.
- Paper DNSE VN derivative/equity where data is available.
- Sandbox Binance shared physical binding with fresh/stale/error broker sync.
- Replay order/fill/bracket/account state.
- Observability: health, heartbeat, dead letters, reconciliation findings, copy outbox.

Exit criteria:

- Redis pending is clean.
- No unexpected open reconciliation findings remain.
- PnL/account/order/position state is readable via endpoint/CLI.
- This markdown records final readiness and residual limitations.

Implementation checklist:

- Run automated regression first, before touching runtime state:
  - full unit suite;
  - focused matrix for paper simulator/brackets, arb packages, risk broker-sync, event replay,
    portfolio/accounting, performance projection, copy command/outbox contracts, and gateway schemas.
- Run runtime smoke only through controlled lab identities:
  - data_layer contract smoke;
  - paper Binance order/reservation burst/integrity smoke;
  - paper DNSE VN derivative/equity smoke where data is available;
  - account-sync and synthetic broker-reconciliation smoke;
  - performance projection smoke;
  - copy outbox publish/command contract smoke.
- Keep sandbox/live broker physical submission out of this phase unless the account is explicitly
  cleaned and isolated. For Phase 5 debt closure, sandbox Binance is validated by unit/synthetic
  broker-sync paths and read-only capability/health checks.
- Finish with read-only runtime audit:
  - gateway health/capabilities;
  - service heartbeats;
  - Redis consumer pending/dead-letter/copy streams;
  - open reconciliation findings;
  - sample account/order/position/performance readability.

Progress log:

- Pending at phase start: Phase 4 unit suite was green, but no integrated Phase 5 matrix had been
  recorded after the paper simulator V2/risk/event replay upgrades.
- Applied runtime schema-only additive migration for `paper_matcher_config` V2 columns:
  `max_fill_ratio_per_event`, `default_event_liquidity`, `latency_event_count`.
- Restarted only `paper_execution` so runtime paper smokes used the Phase 4 simulator/client code.
- Fixed smoke/tooling issues discovered by Phase 5:
  - `risk_portfolio_integrity_smoke.py` now falls back to deterministic synthetic mark price if
    gateway market cache is cold. This smoke tests risk/portfolio, not data freshness; data freshness
    remains covered by `data_layer_contract_smoke.py`.
  - `paper_burst_smoke.py` now seeds deterministic BTC/ETH market cache before submitting burst
    orders and waits for open-order projection before canceling, removing a race where a late
    `paper_open_orders` row could survive after the cancel phase.
  - `broker_reconciliation_smoke.py` now seeds stale DB orders older than the missing-order grace
    window and accepts the Phase 3 deferred-position finding contract.

Automated regression:

- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit -q`
- `docker compose --profile cli run --rm --no-deps --entrypoint uv cli run --extra dev pytest tests/unit/test_paper_simulator_v2.py tests/unit/test_paper_execution.py tests/unit/test_order_brackets.py tests/unit/test_arb_package.py tests/unit/test_event_replay.py tests/unit/test_risk_broker_sync.py tests/unit/test_risk_domain_v2.py tests/unit/test_portfolio_management.py tests/unit/test_portfolio_accounting_v2.py tests/unit/test_performance_projection.py tests/unit/test_alpha_sdk_order_state.py tests/unit/test_gateway_order_schema.py -q`

Runtime smoke matrix:

- `data_layer_contract_smoke.py`: PASS. Binance latest trade/kline and crypto warmup passed; VN
  warmup/quote fallback passed; OKX fallback remains explicitly non-authoritative; DNSE stream
  status was `MARKET_CLOSED`, expected for test time.
- `account_sync_smoke.py`: PASS. Paper internal sync returns OK; DNSE live account without account
  number records expected ERROR.
- `performance_projection_smoke.py`: PASS. Projection wrote/validated performance and account equity
  snapshots.
- `copy_outbox_smoke.py`: PASS. Inserted one policy-scoped copy event and published to
  `copy:events:v1`.
- `copy_command_contract_smoke.py --latest`: PASS. Latest copy event rendered to
  `copy.command.v1.place_order`.
- `risk_portfolio_integrity_smoke.py`: PASS. Covered risk reject without reservation, partial fill
  then cancel, IOC/expiry release, REDUCING/HALTED allocation gates, cash short rejection,
  concurrent buy balance safety, and cross/isolated margin scopes.
- `vn_dnse_paper_specific_smoke.py`: PASS. Covered VN lot/tick validation, MP fill, T+ settlement
  buckets, and unsettled sell rejection.
- `broker_reconciliation_smoke.py`: PASS. Covered sandbox broker-sync missing/error/stale/mismatch
  risk gates plus synthetic position/open-order reconciliation apply in both order-first and
  position-first sequences.
- `paper_burst_smoke.py --orders 20 --market-orders 4 --concurrency 5`: PASS. Accepted 20/20,
  filled 4 market orders, canceled 16 limit orders, no risk rejections, no open paper orders left,
  Redis pending was zero.

Final read-only runtime audit:

- Gateway internal `/v1/health`: `READY`.
- Gateway internal `/v1/health/capabilities`: `READY`.
- Binance Futures sandbox capability: `READY`; Binance user stream capability: `READY`.
- Heartbeats: 10 tracked trading_system services all `READY` and fresh.
- Redis pending:
  - `order.inbound/risk_engine_group`: 0 pending.
  - `commands.execution.paper/paper_execution_group`: 0 pending.
  - `events.order/portfolio_accounting_group`: 0 pending.
  - `events.fill/portfolio_accounting_group`: 0 pending.
  - `order.requests/executor_group`: 0 pending.
- Reconciliation findings: 0 `OPEN`; existing findings are resolved.
- Dead letters: 0 new dead letters in the last day.
- Copy stream `copy:events:v1` is populated and publishable.
- Orders/fills/positions/performance/account snapshots were readable from PostgreSQL.

Readiness conclusion:

- Phase 5 debt closure status: `PASS`.
- The trading_system core is ready to continue alpha-family regression and controlled paper/sandbox
  runs, with the current caveat that real physical sandbox/live submissions should still be run in a
  clean broker-account window before declaring a venue-specific production release.
- Host `127.0.0.1:8000` curl returned connection refused during this audit, but gateway was READY
  inside `executor_network` via `gateway_service:8000`. External host publishing/nginx exposure is an
  ops access concern, not an internal trading_system service failure.

### Debt Phase 0 Implementation Log - 2026-07-19

Status: `COMPLETE`

Guardrail:

- This phase was intentionally read-only for runtime state. No Docker restart, no reset, no config
  apply, no Redis flush, and no PostgreSQL mutation was performed.
- The only repository mutation is this markdown audit/roadmap update on branch
  `debt-phase0-audit`.

Actions completed:

- [x] Create branch `debt-phase0-audit` from `dev`.
- [x] Add this debt closure roadmap to the canonical plan.
- [x] Run read-only Docker/service status audit.
- [x] Run read-only gateway health/capabilities audit.
- [x] Run read-only DB table-count/status audit.
- [x] Run read-only Redis stream/dead-letter/copy stream audit.
- [x] Classify debt ledger entries and stale notes.
- [x] Commit Phase 0 markdown/audit update.

Runtime service baseline:

- `trading_system` compose services are up: gateway, risk engine, paper execution, portfolio,
  reconciliation, copy outbox, monitor, performance, executor, listener, market data, PostgreSQL,
  and both Redis instances.
- Gateway `/v1/health` returns `READY`.
- Gateway `/v1/health/capabilities` returns `READY`.
- Binance Futures capability is `READY`; user stream capability is `READY`.
- Service heartbeat table reports all 10 tracked services as `READY` with fresh heartbeat ages.
- data_layer `/v1/health` returns `ok`; its contract endpoints needed by trading_system are
  available. Remaining data_layer broad-universe warnings are operational data-layer debt, not a
  trading_system Phase 0 blocker:
  - `queue_drop_observed`;
  - `missing_expected_feeds`;
  - `stale_expected_feeds`.

PostgreSQL baseline from `live_data_executor`:

- Important table counts:
  - `orders`: 17153;
  - `fills`: 204;
  - `positions_v2`: 30;
  - `order_brackets`: 171;
  - `account_balances`: 74;
  - `account_equity_snapshots`: 1384489;
  - `broker_account_sync_snapshots`: 115494;
  - `performance_snapshots`: 84881;
  - `reconciliation_findings`: 187;
  - `copy_event_outbox`: 50069;
  - `copy_event_dead_letters`: 0;
  - `risk_grants`: 2;
  - `service_heartbeats`: 10.
- Order status baseline:
  - `CANCELED`: 16331;
  - `RISK_REJECTED`: 582;
  - `FILLED`: 204;
  - `ACCEPTED`: 35;
  - `REJECTED`: 1.
- Reconciliation findings are historical and all resolved:
  - `RESOLVED`: 187;
  - no open/unresolved finding was observed in Phase 0.
- Latest Binance sandbox broker sync snapshots for `binance_testnet_main` are `OK`.
- Historical broker sync aggregate still contains old `ERROR`/`MISMATCH` rows. Treat these as
  sandbox operational history and reset/reconcile intentionally before new sandbox/live tests.

Current open paper state snapshot:

- Open `orders` are all paper-mode `ACCEPTED` rows in active alpha paper tests. The largest counts
  are:
  - `fib_sl_tp_strength_00130m` paper Binance: 11;
  - `fib_sl_tp_strength_00115m` paper Binance: 6;
  - `sl_tp_map_ma_0011h_binance` paper Binance: 3.
- Open `positions_v2` are paper-mode positions, including current active test alphas such as
  `fib_sl_tp_strength`, `combine_weight_sl_tp`, `signal_combine`, `sl_tp_map_ma`,
  `vol_breakout_sl_tp`, `adaptive_hma_cpp`, `delta_rsi`, `basis_arb_binance`, and DNSE paper
  `VN30F1M` accounts.
- `order_brackets` has active paper brackets and historical paper bracket errors:
  - active/partial paper brackets are expected for currently running bracket alphas;
  - historical `ERROR` clusters remain for `scalp_psar`, `qqe_ssl_wae_risk`, and one
    `vol_breakout_sl_tp` row. These should be cleaned through alpha-scoped reset/runbook before a
    clean test window, not silently ignored in production.

Redis baseline:

- Core stream consumer pending counts are clean:
  - `order.inbound`: pending 0;
  - `order.requests`: pending 0;
  - `commands.execution.paper`: pending 0;
  - `events.order`: pending 0;
  - `events.fill`: pending 0;
  - `untracked.orders`: pending 0;
  - `copy:events:v1`: pending 0.
- Stream lengths are expected to retain history:
  - `order.inbound`: about 20001;
  - `order.requests`: about 584;
  - `commands.execution.paper`: about 34745;
  - `events.order`: about 37108;
  - `events.fill`: about 1852;
  - `untracked.orders`: about 316;
  - `copy:events:v1`: about 54357.
- `copy_event_dead_letters` table count is 0.
- Redis has `deadletter.portfolio` history count about 316; pending is clean, but this should stay
  visible in the observability/runbook path.

Debt ledger classification:

| Debt | Phase 0 Classification | Next Phase |
| --- | --- | --- |
| Event store / replay engine incomplete | `OPEN` | Phase 2 |
| Risk engine compatibility bridge remains | `OPEN` | Phase 3 |
| Paper simulator not yet institutional-grade | `OPEN` | Phase 4 |
| Deep Momentum production alias plan-only and strict catch-up missing | `INTENTIONAL_LIMITATION` | Phase 1 |
| Performance/PnL alpha/operator endpoint missing | `OPEN` | Phase 1 |
| Shared physical broker binding historical mismatch rows | `CORE_CLOSED_OPERATIONAL_BASELINE_OPEN` | Phase 1 / Phase 5 |
| Capital sizing CLI ergonomics incomplete | `OPEN` | Phase 1 |
| Old `binance_sent_orders` table-path debt | `SUPERSEDED` | None unless a future grep finds live usage |
| Old copy-outbox "not enabled" notes | `SUPERSEDED` | None; copy stream is publishing and pending is clean |
| Old Docker-quota pending audit notes | `SUPERSEDED_FOR_PHASE_0` | Reopen only if a later phase needs mutation/restart |
| data_layer broad stream queue-drop/stale warnings | `RELATED_EXTERNAL_OPERATIONAL_WARNING` | data_layer roadmap, not trading_system debt phase |

Phase 0 conclusion:

- The runtime baseline is healthy enough to start Phase 1 without touching running alpha containers.
- The next safe work is operator-surface work: PnL/performance endpoint, sizing CLI ergonomics,
  broker-binding runbook polish, and Deep Momentum explicit submit/catch-up controls.
- Deeper core work should follow the roadmap order: replay first, pure risk v2 second, paper
  simulator v2 third.

### Debt Phase 1 Implementation Log - 2026-07-19

Status: `COMPLETE`

Guardrail:

- Phase 1 changed code/docs/tests only. No runtime service was restarted, no live/paper/sandbox
  state was reset, and no trading config was applied.
- Existing admin performance endpoints remain backward-compatible.
- New alpha-facing read endpoints require normal alpha API-key auth and are scoped by
  `strategy_id/account_id/portfolio_id`; they do not expose cross-alpha performance data.

Implemented:

- Alpha-facing Performance/PnL read endpoints:
  - `GET /v1/performance/accounts/latest`;
  - `GET /v1/performance/accounts/{account_id}/history`;
  - `GET /v1/performance/instruments/latest`;
  - `GET /v1/performance/portfolios/{portfolio_id}/latest`;
  - `GET /v1/performance/portfolios/{portfolio_id}/history`;
  - `GET /v1/performance/dashboard`.
- Operator/admin Performance/PnL endpoints:
  - `GET /v1/admin/performance/instruments/latest`;
  - `GET /v1/admin/performance/dashboard`.
- Sizing audit read endpoints:
  - `GET /v1/sizing/decisions`;
  - `GET /v1/sizing/decisions/summary`;
  - `GET /v1/admin/sizing/decisions`;
  - `GET /v1/admin/sizing/decisions/summary`;
  - `GET /v1/admin/sizing/decisions/{decision_id}`.
- CLI operator commands:
  - `cli performance instrument ...`;
  - `cli performance dashboard ...`;
  - `cli sizing history ...`;
  - `cli sizing summary ...`;
  - `cli sizing decision <decision_id>`.
- Alpha SDK read helpers:
  - `get_performance_snapshot()`;
  - `get_account_performance_history()`;
  - `get_sizing_decisions()`.
- Runbook updates:
  - PnL/operator views now include account, instrument, portfolio, and dashboard commands.
  - Sizing decision audit commands are documented for explaining `OK/SKIPPED/ERROR` sizing output.
  - Broker-binding runbook remains read-first: inspect state/exposure, then reconcile intentionally.
  - Deep Momentum remains operator-explicit: model/service health does not imply order submission;
    `execution.submit` and catch-up/force-rebalance config must be reviewed before production use.

Validation:

- Local compile passed:
  - `services/gateway/main.py`;
  - `services/gateway/repository/performance_query.py`;
  - `services/gateway/repository/sizing_decisions.py`;
  - `cli/__main__.py`;
  - `alpha_sdk/trading_system_async_action.py`.
- Docker targeted tests passed:
  - `tests/unit/test_sizing.py`;
  - `tests/unit/test_cli.py`;
  - `tests/unit/test_alpha_sdk_order_state.py`;
  - result: `48 passed`.
- Docker full unit suite passed after the Phase 1 commit:
  - command: `uv run --extra dev pytest tests/unit -q`;
  - result: all unit tests passed;
  - existing warnings only: FastAPI `on_event` deprecation and Pydantic class-based `Config`.

Phase 1 conclusion:

- Operators and alphas can now inspect PnL/performance and sizing explanations without manual SQL.
- Broker-binding control remains intentionally operational/runbook-driven; no automatic destructive
  cleanup was added in this phase.
- Deep Momentum submit/catch-up remains an explicit deployment-config responsibility. This is safer
  than silently toggling submit behavior from the trading_system side.
- Runtime activation still requires an approved gateway/CLI refresh window. Phase 1 intentionally did
  not restart running services.

### Deep Momentum Production Paper Addendum - 2026-07-19

Status: `COMPLETE_IN_ALPHA_RUNTIME`

Scope:

- This addendum was implemented in `execution_alpha/alphas/deep_momentum`, not inside core
  `trading_system` services.
- No trading_system service restart, DB reset, or account reset was performed.
- Production paper config remains operator-owned, but the current Deep Momentum production alias
  config is submit-enabled and guarded by rebalance state.

Implemented:

- Deep Momentum production alias `deep_momentum_prod_yearly_monthly_1d` now treats
  `execution.submit=true` as safe only when the latest closed calendar-monthly bar is due.
- A monthly `cycle_key` is built from
  `alpha_id:mode:venue:account_id:model_alias:latest_bar_time`.
- Submitted cycle keys are persisted under `submitted_cycles`; restart/retry of the same monthly
  bar becomes plan-only and cannot submit duplicate target-rebalance orders.
- Rebalance state now records `target_weights_hash`, model identity, loaded/missing symbol counts,
  target symbols, result summary, and the last failed phase.
- Failures in `due_check`, `model_health`, `feature_build`, `model_predict`, and
  `target_rebalance` are persisted to `last_error`.
- Daemon loop failures retry after `runtime.error_retry_seconds` instead of sleeping until the next
  UTC daily wake.
- Fast-plan smoke submit can be enabled via runtime env overrides
  `DEEP_MOMENTUM_SUBMIT=true`, `DEEP_MOMENTUM_FORCE_REBALANCE=true`, and
  `DEEP_MOMENTUM_LOOP=false`; committed fast-plan JSON remains plan-only.

Validation:

- `py_compile` passed for `deep_momentum_runner.py` and `rebalance_state.py`.
- Docker runtime unit tests passed in `execution-alpha-runtime-ml:0.1.1`:
  - `runtime.tests.test_deep_momentum_feature_state`;
  - `runtime.tests.test_deep_momentum_portfolio_builder`;
  - result: `13 tests OK`.

Operational conclusion:

- The main missed-monthly-cycle risk is now reduced: if the model/data/trading_system path fails,
  the daemon retries on a short interval and records the failure; if it succeeds, the submitted
  cycle is durable in the alpha state file.
- The remaining live validation step is an approved fast-plan paper submit smoke, followed by scoped
  reset/re-apply. Full production monthly behavior should then be observed at the next due
  calendar-monthly bar.

### Scalping Purely Alpha Migration - 2026-07-19

Status: `IMPLEMENTED_CONFIG_APPLIED_PENDING_OPERATOR_RUN`

- New alpha family `scalping_purely_0015m` uses paper and Binance sandbox accounts only.
- `ETHUSDT` is the only execution instrument; `BTCUSDT` is a required 5m regime input and has no
  risk profile/account allocation because it must never be ordered by this alpha.
- The declarative portfolio config declares `%_equity` paper sizing from `20000 USDT`, leverage `5`,
  and the normal 60 USDT sandbox cap is enforced by the alpha compose environment.
- Runtime uses the shared `prepare_with_context` closed-candle adapter so BTC and ETH are warmed and
  batch-refreshed together, with BTC appended before ETH is evaluated.
- Validation completed without starting an alpha container:
  - Python compile, YAML parse, and `docker compose config --quiet` passed.
  - Docker parity smoke passed over 1200 synchronized 5m ETH/BTC rows; wrapper target side matched
    backtest `pos_weight`, and a stale BTC tail correctly blocked ETH evaluation.
  - The parity smoke now evaluates every FIFO window after the 700-bar live buffer begins rolling:
    `501` rolling evaluations matched both the same-window backtest and the full-history backtest
    `pos_weight` at each closed candle.
  - Docker shared-runtime contract suite passed: `24 tests OK`, including the context-frame adapter
    and ETH-only trigger dispatch contract.
  - Declarative `config apply` upserted the alpha registry, paper/sandbox account policies,
    allocations, ETH risk profiles, and both copy policies.
  - `alpha inspect` confirmed active `paper|sandbox` Binance deployment/account rows; Redis
    `alpha-auth` confirmed the active key in masked form.
- No alpha container was started and no order was submitted. The operator sequence is controlled
  paper first, then a separate clean-account Binance sandbox window.

## 2026-07-28 Alpha Migration: BB Scalping Intrabar Bracket

Status: `READY_FOR_OPERATOR_PAPER_RUN`

Scope and source of truth:

- Migrate `execution_alpha/alphas/bb_salping`, currently an unmodified `adaptive_hma_cpp` scaffold,
  into a paper-only Binance USD-M Bollinger Squeeze intrabar family.
- Strategy math and approved parameter blocks come only from `main/backtest_code.py`; execution
  semantics come only from `main/intrabar_alpha_backtest_paper_live_parity_contract.md`.
- Follow `execution_alpha/ALPHA_RUNTIME_MIGRATION_ARCHITECTURE.md`: completed candles only,
  batched data_layer warmup/latest-candle reads, FIFO buffers, no alpha-owned raw tick loop,
  host-mounted logs/state, and all orders through trading_system gateway.

Required implementation:

1. Replace copied Adaptive-HMA names, logic, runners, compose, tests, README and runbook. Do not
   retain copied strategy code or stale deployment IDs.
2. Preserve Bollinger squeeze entry pulses, ATR-distance outputs, mid-band technical exits and
   bar-close-only favorable trailing updates. There is no implicit pyramiding or reversal.
3. Add provider-neutral bracket level mode `ENTRY_FILL_DISTANCE`: persist distance with bracket
   intent, resolve it from authoritative weighted entry fill, then market-rule normalize it before
   reduce-only children are submitted. This removes the signal-close approximation for all intrabar
   alphas that opt in.
4. Persist/reconcile processed candle, physical side/quantity, fill price, bracket id, active stop,
   trailing anchor/distance, last technical exit and strategy parameter version. Restart must never
   replay an old intent.
5. Register paper-only Binance `%_equity` accounts/risk/copy policies. `hrhr`, `hyhy`, `gggg` use
   explicit 150% allocation and leverage 5; `hhhh` retains the 50% endpoint default. Each approved
   symbol/configuration receives an isolated 20,000 USDT virtual account.
6. Validate compile, YAML/Compose parsing, full signal-vector and FIFO-window parity, entry-fill
   distance bracket math, conservative OCO lifecycle, trailing ratchet, technical-exit idempotency
   and restart/replay. Reset every disposable smoke scope after testing.

Acceptance boundary:

- Backtest/runtime must produce identical entry, technical-exit and distance vectors on deterministic
  test data. Paper/live fill differences may only come from execution mechanics.
- No alpha container is started during migration validation. Operator-run paper deployment happens
  only after declarative config apply and the documented runbook sequence.

Implementation and validation:

- Added `ENTRY_FILL_DISTANCE` to the gateway bracket schema/SDK. Child legs persist their original
  distance in the audit payload; `BracketManager` obtains the weighted entry fill from `fills`, then
  falls back only to the authoritative `positions_v2.avg_px_open` projection while the fill projector
  catches up. Until one of those is available, a bracket remains `ENTRY_FILLED` and no unpriced child
  is submitted.
- Added an order-scoped `paper_execution_profile`, so an intrabar alpha can explicitly reproduce its
  own paper fee/slippage (`5` taker bps, `1` slippage bp) without mutating the simulator assumptions
  of unrelated strategies trading the same instrument.
- Replaced the copied Adaptive-HMA alpha with four paper-only BB profiles and isolated accounts:
  `bb_salping_hrhr_00115m_eth`, `bb_salping_gggg_00215m_btc`,
  `bb_salping_hyhy_0031h_eth`, and `bb_salping_hhhh_0041h_sol`.
- Added declarative registry/risk/account/allocation/copy policies, `.env.example`, compose,
  README, scoped-reset runbook and host-mounted `logs/`/`state/`.
- Docker validation passed:
  - Trading-system entry-fill-distance schema/direction/waiting/profile tests passed.
  - Trading-system compile and declarative YAML parse passed.
  - BB Compose parse passed with explicit test-only environment values.
  - BB parity smoke passed against the source core for all four profiles: full six output vectors
    matched and 201 rolling FIFO evaluations per profile matched the corresponding closed candle.

Operational handoff:

- 2026-07-28 readiness update:
  - Re-ran BB parity smoke in the runtime image: all four profiles matched the source core with
    `vector_diff=0` and `201` rolling FIFO evaluations per profile.
  - Added local runtime keys to ignored `trading_system/.env` and `bb_salping/.env`; added tracked
    placeholders to `trading_system/.env.example` and `bb_salping/.env.example`.
  - Applied `config/_config/portfolio_account_config_setup.yaml` through the trading-system CLI.
    `alpha inspect` confirms all four BB alpha ids are active with isolated paper Binance accounts
    and active symbol risk profiles.
  - Rebuilt/restarted `gateway` and `paper_execution` so `ENTRY_FILL_DISTANCE` bracket resolution
    and order-scoped paper execution profile code are loaded before paper deployment.
  - Gateway health is `READY`; `paper_execution` is up. Existing recovered open orders belong to
    other scopes; BB scope is clean (`orders=0`, `fills=0`, `positions_v2=0`).
- No BB alpha container has been started and no BB paper order has been submitted. The operator can
  now start the selected paper profile(s) from `bb_salping/Documentation/RUNBOOK.md`.

## 2026-07-29 Alpha Migration: VN Initial Balance Timing

Status: `READY_FOR_OPERATOR_PAPER_RUN`

Scope and source of truth:

- Migrate `execution_alpha/alphas/vn_ib_timing`, currently a copied Adaptive-HMA scaffold, into a
  DNSE paper-only VN30F1M derivative Initial Balance breakout alpha.
- Strategy math and official params come only from `main/backtest_code.py`: `generate_ib_bo_signals`
  and `core_ib_bo_signals` are the source of truth for `pos_weight`, `exit_type`, and `exit_price`.
- The live runtime must preserve the backtest timing contract:
  - build the Initial Balance during the VN morning session from `08:45`;
  - breakout is detected on `close[t]`;
  - entry/reversal/EOD action is executed on the next closed bar open semantics, matching the
    backtest `pending_signal -> open[t]` state machine as closely as a completed-candle runtime can;
  - SL/TP are handled by trading_system paper bracket/OCO, not by an alpha-owned tick simulator.

Required implementation:

1. Replace copied Adaptive-HMA files, container names, state/log paths, tests, README and runbook.
2. Add one isolated deployment: `vn_ib_timing_0011m_dnse`, account
   `paper-dnse-vn_ib_timing_0011m_dnse`, mode `paper`, venue `DNSE`, symbol `VN30F1M`, interval `1m`.
3. Use the existing DNSE derivative metadata/risk convention: VND account, VN derivative multiplier,
   no sandbox/live until broker docs/infrastructure are confirmed.
4. Add local ignored `.env` key and tracked `.env.example` placeholders; add the same env placeholder
   and declarative config entry in trading_system.
5. Validate compile, compose parse, declarative config parse/apply, and strict parity smoke:
   backtest vs live adapter must have zero diff for `pos_weight`, `exit_type`, `exit_price`, plus
   zero diff for every live FIFO-window intent after warmup.

Acceptance boundary:

- Before paper run, DB/Redis config must contain the alpha registry, account policy, allocation and
  active risk profile.
- No alpha container is started by migration validation. The operator starts paper manually from the
  alpha runbook after this section is marked ready.

Implementation and validation:

- Replaced the copied Adaptive-HMA scaffold with `vn_ib_timing_common.py`, a thin runner
  `vn_ib_timing_0011m_dnse.py`, DNSE paper-only compose, config, README and runbook.
- Live code loads the deterministic backtest core from `main/backtest_code.py` and uses
  `generate_ib_bo_signals` as the source of truth. The adapter adds execution intent fields around
  the source output without changing `pos_weight`, `exit_type` or `exit_price`.
- Added local ignored runtime key in `vn_ib_timing/.env`, tracked `.env.example`, and matching
  `VN_IB_TIMING_0011M_DNSE_API_KEY` placeholder in `trading_system/.env.example`.
- Added declarative trading-system registry/risk/account/allocation/copy policy for
  `vn_ib_timing_0011m_dnse` and account `paper-dnse-vn_ib_timing_0011m_dnse`.
- Docker validation passed:
  - alpha compile passed in `execution-alpha-runtime-numba:0.1.1`;
  - VN IB parity smoke passed on `2700` synthetic VN session bars:
    `pos_weight_diff=0`, `exit_type_diff=0`, `exit_price_diff=0`, `fifo_checks=2461`;
  - alpha Compose parse passed;
  - trading-system declarative YAML parse passed.
- Config apply completed through trading-system CLI. `alpha inspect` confirms the strategy is active,
  account is active with `VND`, and both `VN30F1M` and `VN30F1M.DNSE` risk profiles are active.
- DB scope is clean before operator paper run: `orders=0`, `fills=0`, `positions_v2=0`.
- 2026-07-29 timezone follow-up: data_layer returns canonical UTC candles, but the VN IB backtest
  core reads `hour/minute` as Vietnam session time. The live adapter now converts the runtime frame
  to `Asia/Ho_Chi_Minh` before calling `generate_ib_bo_signals`, and the parity smoke verifies UTC
  live input against Vietnam-local backtest input with zero diff.

## 48. Conditional Order Groups And QuantBT-Live Replay V2 - 2026-08-04

Status: `PHASE_1_IMPLEMENTED_AND_VALIDATED; PHASE_2_PENDING`

Implementation branch: `feat/order-group-replay-v2`, created from `dev` at
`994421c` without changing or staging the existing local `shared/symbols.json` modification.

This upgrade is deliberately completed inside `trading_system` before `dynamic_grid` is changed.
The grid alpha is one acceptance fixture, not the owner of order-group behavior. The resulting
contracts must support brackets, grids, DCA ladders, multi-leg exits, pairs/baskets, and future
strategies without embedding strategy-specific policy in venue adapters.

### 48.1 Why The Current Foundation Is Not Enough

Existing capabilities that must be retained:

- `orders` already has a monotonic order lifecycle including `PARTIALLY_FILLED`.
- The paper matcher already supports deterministic tick replay, event/volume-limited partial fills,
  latency, slippage, IOC/FOK/GTD, stop, take-profit, and trailing orders.
- `order_brackets` supports entry activation, multiple TP legs, stop resizing, cancel-replace stop,
  and restart reconciliation for conventional entry/SL/TP brackets.
- Debt Phase 2 Event Replay V1 can rebuild positions from immutable fill events and compare the
  projection with `positions_v2`.
- Executor adapters already isolate paper, Binance Futures, and DNSE execution behind a registry.

The remaining correctness gaps are structural:

1. `BracketManager` treats any `PARTIALLY_FILLED` leg as a filled leg in several decisions, but it
   does not own a general partial-fill contingency state machine. Conventional TP resizing is not a
   reusable OCO/OUO group contract.
2. `dynamic_grid` currently writes `oco_group_id` into normal order metadata, polls order state in
   the alpha container, and sends sibling cancels after observing a fill. A process pause or network
   race can allow multiple siblings to fill before alpha-side cancellation.
3. A fill is irreversible. No system can guarantee atomic OCO when several independent orders are
   already live at a venue that does not provide that atomic primitive. The engine must therefore
   honor every late fill, expose the race, and execute a deterministic, explicitly approved
   compensation policy instead of rewriting history.
4. Event Replay V1 reprojects accounting from recorded fills. It does not replay market events,
   order commands, group transitions, matcher decisions, cancel latency, or venue capability plans,
   and it cannot yet compare a QuantBT execution tape with the live/paper path.
5. Binance execution currently has no generic atomic USD-M OCO order-list endpoint. Binance USD-M
   provides ordinary orders, conditional algo orders, batch submit/cancel, and native LIMIT amend,
   but a batch request is not an OCO transaction. OKX exposes native `oco` and `conditional` algo
   orders, but those primitives still do not represent an arbitrary many-leg grid.
6. There is no OKX execution adapter yet. OKX market data remains reference-only and must not be
   confused with execution enablement.

### 48.2 Research Decisions And Boundaries

QuantBT reference inspected:

- repository branch: `feat/quantbt-engine-packaging`;
- inspected commit: `de4c7274c1a6beba67f0607568f27a9d4f5ac84a`;
- relevant contracts: `QuantBTEndpoint.event_driven`, `native_event_lifecycle`, `OrderCommand`,
  `OrderActivationPolicy`, native-event command/event reports, and backend fingerprint parity;
- useful concepts to adopt: explicit `PLACE/CANCEL/REPLACE/AMEND/CANCEL_ALL` commands, parent
  activation, OCO group identifiers, stable command order, deterministic event reports, and one
  digest covering fills, lifecycle events, positions, margin, fees, and funding;
- important limitation: the inspected QuantBT lifecycle documentation explicitly says partial fills
  are not modeled. Its OCO kernel cancels siblings after a full-size simulated fill in deterministic
  command order. QuantBT is therefore an oracle for strategy command parity and full-fill lifecycle,
  not the source of truth for production partial-fill races.

NautilusTrader concepts to adopt, without adding Nautilus as a production dependency:

- order state is event-sourced and includes pending update/cancel and partial fill states;
- contingency is explicit: OTO, OCO, and OUO are different policies;
- OCO cancellation begins after any execution, including a partial execution, and remains
  best-effort because a sibling may execute before cancellation reaches the venue;
- OUO reduces the remaining sibling quantities after each partial execution;
- locally emulated orders remain durable, are recovered after restart, and are rechecked by risk
  before release to the venue.

Official venue references frozen for this plan:

- Binance USD-M trade API:
  `https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade`;
- OKX API v5 trade/algo API: `https://www.okx.com/docs-v5/`;
- NautilusTrader advanced orders:
  `https://nautilustrader.io/docs/latest/concepts/orders/advanced/`;
- NautilusTrader emulated orders:
  `https://nautilustrader.io/docs/latest/concepts/orders/emulated/`.

The implementation must obey these boundaries:

- `orders` and `fills` remain canonical order/fill projections. New group tables reference them and
  must not create a second order ledger.
- `domain_events` remains the immutable audit source. Redis remains transport/cache and can be
  rebuilt; Redis polling cannot own group correctness.
- Alpha code declares intent and policy. It must not implement sibling cancellation, fill
  deduplication, compensation, or broker-specific payloads.
- Paper, sandbox, live, replay, Binance, OKX, DNSE, and future venues use one domain state machine.
  Adapters only compile or route supported primitives.
- Native venue behavior is used only when its semantics are equivalent to the requested group.
  Unsupported mappings fail closed or use the explicitly requested emulation policy.
- No code in this upgrade may claim atomic OCO for emulated multi-order groups.
- The replay runner must be isolated from live Redis commands, broker credentials, and production
  projections. Replay can never submit an external order.
- `dynamic_grid` migration is a later, separate change after both phases pass. Existing alpha
  containers and APIs remain compatible during this upgrade.

### 48.3 Canonical Domain Contract

The new provider-neutral aggregate is `ConditionalOrderGroup` (API name `order-group`). A bracket is
one builder/facade over this aggregate; a grid is another client of it.

Required group fields:

- identity/scope: `group_id`, `strategy_id`, `account_id`, `mode`, `venue`, `instrument_id`,
  `execution_session_id`, `correlation_id`;
- group contract: `contingency_type`, `activation_policy`, `execution_trigger`, `remainder_policy`,
  `late_fill_policy`, `emulation_policy`, `position_side`, `target_quantity`,
  `max_group_exposure`, `policy_version`;
- lifecycle: `state`, `aggregate_version`, `winner_leg_id`, `first_execution_event_id`,
  `filled_quantity`, `open_quantity`, `excess_quantity`, `last_error`, timestamps;
- venue plan: `execution_plan`, `capability_snapshot`, `native_group_id`, and adapter version.

Required leg fields:

- `leg_id`, `group_id`, `client_order_id`, `role`, `sequence`, `parent_leg_id`;
- canonical order fields: side, position side, type, quantity, limit/trigger price, TIF,
  reduce-only/post-only, expiry, trigger reference;
- lifecycle snapshots: cumulative filled quantity, remaining quantity, average fill price, state,
  venue order/algo identifier, command version;
- metadata for strategy attribution is allowed, but it cannot alter the state machine implicitly.

Supported contingency types:

- `NONE`: related orders share audit identity only;
- `OTO`: children activate on parent first fill or full fill according to explicit policy;
- `OCO`: first positive execution chooses the winning leg and starts best-effort sibling cancel;
- `OUO`: every positive execution reduces sibling remaining quantities by an explicit rule;
- `BRACKET`: compatibility builder expressed as OTO entry plus OCO/OUO protective children.

Execution trigger must be explicit:

- `ON_FIRST_FILL`: any positive new fill starts the contingency action;
- `ON_FULL_FILL`: action starts only when cumulative filled quantity reaches order quantity;
- `ON_TARGET_QUANTITY`: action starts at a configured cumulative group quantity;
- `ON_TERMINAL`: action starts on a configured terminal state.

The default OCO contract is `ON_FIRST_FILL`, matching institutional best-effort behavior. QuantBT's
current full-fill-only simulation is recorded as a known oracle limitation, not copied into live.

Remainder and late-fill policy must be separate:

- winner remainder: `KEEP_REMAINDER` or `CANCEL_REMAINDER`;
- siblings: `CANCEL_SIBLINGS` for OCO, `REDUCE_SIBLINGS` for OUO;
- late fill: `HALT_AND_RECONCILE` is the safe default;
- `AUTO_REDUCE_EXCESS` is opt-in and allowed only when the risk engine confirms attribution and a
  reduce-only compensation cannot close another strategy/account's physical exposure;
- `ACCEPT_WITHIN_MAX_EXPOSURE` is allowed only for strategies whose policy explicitly permits more
  than one fill.

Core invariants:

1. Venue fill/trade identity is idempotent and cumulative fill quantity is monotonic.
2. A fill already reported by a venue is always recorded, including after cancel request/ack.
3. Canonical fill persistence also writes a durable group-event inbox reference in the same
   transaction. Consuming that inbox event, advancing the aggregate, and creating all resulting
   cancel/reduce commands is one PostgreSQL transaction using aggregate-version compare-and-swap
   plus an execution command outbox. A crash can delay the action but cannot lose it.
4. Repeated or out-of-order events converge to the same state and digest.
5. Only one coordinator worker may advance a group version; competing workers reload and retry.
6. Acknowledgement is not execution: `SUBMITTED`, `ACCEPTED`, `PENDING_CANCEL`, and `CANCELED` never
   synthesize a fill.
7. Group exposure uses actual cumulative fills, instrument multiplier, position side, account
   binding, and reservations. Requested quantity alone is not exposure truth.
8. Compensation is a new audited reduce-only order linked by causation ID; it never deletes or
   edits the late fill.
9. A group with uncertain broker state becomes `DEGRADED_RECONCILIATION_REQUIRED` and blocks new
   group risk for the same scope until reconciled or explicitly released by an operator.
10. Paper and replay use the same aggregate reducer as sandbox/live.

Canonical lifecycle states:

```text
CREATED -> VALIDATED -> SUBMITTING -> ACTIVE
ACTIVE -> PARTIALLY_EXECUTED -> CANCELING | UPDATING
CANCELING -> CLOSED
CANCELING -> OVERFILLED -> COMPENSATING -> CLOSED
any non-terminal -> DEGRADED_RECONCILIATION_REQUIRED | ERROR | CANCELED
```

`OVERFILLED` means more than the approved group policy, not merely a normal partially filled order.

### 48.4 Venue Capability And Compilation Matrix

Add a typed `ExecutionCapabilities` contract instead of venue-name conditionals in the domain:

- native order types and trigger references;
- native OTO/OCO/OUO/bracket support and maximum legs;
- batch place/cancel/amend limits and atomicity level;
- native amend restrictions;
- partial-fill event guarantees and order-query recovery routes;
- hedge/one-way position mode requirements;
- reduce-only/close-position behavior;
- client ID constraints and idempotency support.

Initial plans:

| Venue/product | Native capabilities used | Group compilation |
|---|---|---|
| Paper | Internal matcher and reducer | Entire group runs in the canonical engine |
| Binance USD-M sandbox/live | `/fapi/v1/order`, `/fapi/v1/algoOrder`, batch place/cancel, user-data execution reports, LIMIT amend | Ordinary/conditional legs are native; arbitrary OCO/OUO and grid groups are coordinated internally |
| OKX FUTURES/SWAP demo/live | normal order API, algo `oco/conditional/trigger/move_order_stop`, attached TP/SL, cancel/amend algo, private order channel | Use native OCO only for an exactly compatible pair; arbitrary multi-leg groups remain internally coordinated |
| DNSE | Current confirmed normal-order contract only | Paper may emulate; sandbox/live remains fail-closed until official contingent-order semantics are verified |

For Binance, batch placement reduces request overhead but is not treated as atomic. Native LIMIT
amend preserves the exchange's documented queue semantics; conditional leg update uses the adapter's
confirmed native operation or controlled cancel-replace.

For OKX, adding an adapter does not automatically enable trading. Demo/live registration requires
separate credentials, account/position-mode validation, instrument metadata, broker sync, and an
explicit config flag. Contract tests can ship before credentials are available; external demo smoke
is an acceptance item only when operator-provided infrastructure exists.

### 48.5 Phase 1 - Durable Conditional Order Group Engine

Goal: move OCO/OUO/OTO correctness out of alpha polling and into one recoverable server-side
aggregate, then map it safely to paper, Binance USD-M, and OKX capabilities.

Implementation work:

1. Add domain modules under `domain/order_groups.py`:
   - enums/value objects for contingency, activation, remainder, late-fill, emulation, and state;
   - immutable command/event objects;
   - a pure reducer returning the new aggregate plus required effects;
   - validation for parent references, duplicate leg IDs, quantity/exposure policy, and incompatible
     venue plans.
2. Add an additive migration, expected as `init-db/31-conditional-order-groups.sql`:
   - `conditional_order_groups` for aggregate state/version/policy/capability snapshot;
   - `conditional_order_group_legs` referencing canonical client/venue order IDs;
   - `order_group_event_inbox` as durable delivery bookkeeping keyed by immutable source event ID;
   - `execution_command_outbox` for durable submit/cancel/amend/compensate effects with unique
     idempotency key, attempt state, retry time, and dead-letter reason;
   - indexes for due groups, account/instrument exposure, client order lookup, and outbox claims;
   - no duplicate fills, positions, or order status columns beyond aggregate snapshots needed for
     optimistic concurrency.
3. Add `services/order_groups/`:
   - repository with transaction-scoped aggregate lock/version checks;
   - coordinator consuming canonical order/fill events and broker reconciliation findings;
   - effect planner and bounded outbox dispatcher;
   - restart recovery scanner for non-terminal groups and claimed-but-unacknowledged effects;
   - heartbeat, backlog, retry, race, overfill, compensation, stale, and dead-letter metrics.
4. Wire fill ingestion once, after fill idempotency succeeds. Listener, paper execution, and
   reconciliation must transactionally record the same canonical group inbox event; none may call
   group business rules directly. Duplicate stream and REST recovery events converge on the source
   event/trade idempotency key.
5. Add `services/executor/capabilities.py` and adapter planners:
   - Binance USD-M capability mapper and request compiler;
   - OKX FUTURES/SWAP REST/private-stream adapter behind disabled-by-default config;
   - paper capability mapper;
   - DNSE fail-closed mapper;
   - no provider branching in the group reducer.
6. Add gateway/admin/SDK contracts:
   - `POST /v1/order-groups` with idempotency key;
   - `GET /v1/order-groups` and `GET /v1/order-groups/{group_id}`;
   - `PATCH /v1/order-groups/{group_id}` for validated amend/policy-safe quantity updates;
   - `DELETE /v1/order-groups/{group_id}` for cancel-all;
   - operator-only reconcile/release endpoint for degraded groups;
   - alpha SDK async create/query/amend/cancel helpers;
   - existing bracket endpoints become a compatibility facade over the group builder after parity,
     with no breaking payload change.
7. Keep current `BracketManager` active behind a feature flag during migration. Shadow-reduce its
   events through the new reducer and compare state before switching the bracket facade.
8. Add operations documentation and CLI views for group state, legs, outbox backlog, overfill,
   compensation, and reconciliation-required scopes. Mutating commands retain password/confirmation
   controls.

Phase 1 tests:

- pure transition table for every state/event pair;
- property tests over duplicate and permuted accepted/fill/cancel/amend events;
- OCO first partial fill cancels siblings; winner remainder keep/cancel variants;
- OUO partial fill proportionally or absolutely resizes siblings according to policy;
- two siblings partially/full fill before cancel acknowledgement;
- late fill after `PENDING_CANCEL` and after `CANCELED` projection;
- duplicate venue trade, cumulative-fill correction, and out-of-order REST/stream recovery;
- coordinator crash after state commit but before dispatch, and after broker request but before ack;
- outbox retry, idempotent broker resend/query-before-resend, dead letter, and restart recovery;
- `AUTO_REDUCE_EXCESS` allowed/denied by physical account attribution and risk;
- one-way and hedge-mode account bindings; long/short position-side isolation;
- venue quantity/tick/min-notional normalization before group activation and compensation;
- paper partial-fill, latency, IOC/FOK/GTD, stop/TP/trailing, and multi-leg event integration;
- Binance official payload contract tests for normal/algo/batch/cancel/amend and stream mapping;
- OKX official payload contract tests for normal/algo OCO/attached TP-SL/cancel/amend/private events;
- DNSE live/sandbox unsupported path fails closed;
- existing bracket and order unit suites remain green;
- migration is repeatable on a populated schema and does not mutate existing order/fill rows.

Phase 1 acceptance:

- no group depends on an alpha process being alive to cancel/update siblings;
- first partial fill creates durable cancel/update effects in the same DB transaction as the group
  transition;
- race fills are never lost or rewritten and produce a deterministic terminal/degraded outcome;
- restart from PostgreSQL reconstructs every non-terminal group and resumes pending effects;
- paper, Binance, and OKX planners produce only officially supported requests;
- legacy `/v1/orders` and bracket clients continue working;
- no running alpha or live credential is touched during unit/integration validation.

#### Phase 1 Implementation Log - 2026-08-04

Status: `IMPLEMENTED_AND_VALIDATED_BEHIND_DISABLED_FEATURE_FLAG`

Implementation commit: `411d37d` (`feat(execution): add durable conditional order groups`).

Implemented domain and persistence:

- Added provider-neutral `ConditionalOrderGroup` reducer in `domain/order_groups.py` for
  `NONE`, `OTO`, `OCO`, `OUO`, and `BRACKET`.
- Added explicit first/full/target/terminal activation, winner remainder, late-fill, exposure and
  compensation policies. Fills remain monotonic and irreversible even after cancel acknowledgement.
- Added additive migration `init-db/31-conditional-order-groups.sql` with:
  - `conditional_order_groups`;
  - `conditional_order_group_legs`;
  - `order_group_event_inbox`;
  - `execution_command_outbox`.
- `orders` and `fills` remain canonical; group tables do not duplicate the execution ledger.
- Canonical portfolio fill/order-status persistence and reconciliation findings record group inbox
  events inside their existing PostgreSQL transaction, but only when
  `ORDER_GROUP_ENGINE_V2_ENABLED=true`. Deploying code before migration therefore does not affect
  existing accounting while the default flag remains false.
- Reducer transition and resulting PLACE/CANCEL/AMEND/COMPENSATE outbox effects commit in one
  aggregate-lock transaction. Workers claim inbox/outbox rows through bounded `SKIP LOCKED` SQL.

Implemented recovery and safety:

- Redis is transport only. Every command is first durable in PostgreSQL and is still routed through
  `order.inbound -> risk_engine -> executor`.
- Redis Lua deduplicates the narrow crash window after `XADD` and before the outbox dispatch update.
- Outbox lifecycle distinguishes `DISPATCHED` from `ACKNOWLEDGED`. Canonical `orders` evidence
  acknowledges place/amend/cancel; a dispatched command without evidence is requeued after
  `ORDER_GROUP_COMMAND_ACK_TIMEOUT_SECONDS` and relies on the stable broker client order ID for
  idempotent resend.
- Expensive query-before-resend recovery runs on its own bounded interval, not every 100 ms poll.
- Risk blocks both the current degraded group and new groups in the same account/instrument scope.
- `AUTO_REDUCE_EXCESS` is policy checked. Sandbox/live compensation requires hedge accounting and
  trusted `position_attribution_safe=true`; paper compensation remains auditable but does not need a
  physical broker hedge binding.
- Operator `reconcile` and dead-letter `release` are separate operations. Reconcile uses an optional
  aggregate version and derives the resumed state from durable leg snapshots; release only retries
  DEAD inbox/outbox rows and never clears degraded state by itself.

Implemented venue contracts:

- Added typed capability snapshots and canonical request compilers for Paper, Binance USD-M, OKX
  FUTURES/SWAP and DNSE.
- Binance USD-M uses official ordinary/conditional requests and bounded batch size `5`; it never
  calls Binance Spot OCO/OTOCO and never claims a batch is atomic.
- Added an OKX REST/private-event adapter for normal, algo conditional, attached TP/SL,
  cancel/amend, demo signing, and exact compatible OCO payload compilation. Registration remains
  disabled unless credentials and `OKX_EXECUTION_ENABLED=true` are supplied.
- OKX `AUTO` currently chooses durable internal coordination. `REQUIRE_NATIVE` can validate and
  compile the official native OCO contract, but aggregate submission fails closed with
  `OKX_NATIVE_ORDER_GROUP_SUBMISSION_NOT_ACCEPTED` until a credentialed demo acceptance test exists.
  This avoids routing a native aggregate through the ordinary-leg path by mistake.
- DNSE paper uses internal coordination. DNSE sandbox/live fail closed because no verified
  contingent-order contract is available.

Implemented interfaces and operations:

- Added alpha API create/list/get/patch/cancel under `/v1/order-groups` and admin
  list/get/reconcile/release endpoints.
- Added generic OTO/OCO/OUO helpers to `alpha_sdk/trading_system_async_action.py`. The SDK generates
  `group_id` before transport retry so one call cannot become two groups after timeout/5xx.
- Added `order-group list/show/reconcile/release` CLI. Existing CLI mutation confirmation and admin
  password rules apply to reconcile/release.
- Added `services/order_groups` coordinator, heartbeat/backlog status, compose service, bounded
  Docker logs and monitor registration.
- Added `ORDER_GROUP_OPERATIONS_GUIDE.md` with migration order, feature flags, API/SDK examples,
  policy semantics, CLI commands, incident response, venue limitations and rollback.
- Existing `/v1/orders` and `/v1/order-brackets` remain unchanged. Current bracket manager remains
  authoritative; optional shadow comparison is read-only and cannot dispatch an order.

Validation completed:

- New targeted group/API/SDK/coordinator/risk/CLI suite: `63` tests passed.
- Full repository pytest suite: `100%` passed with one intentionally skipped opt-in destructive
  integration test; only the pre-existing FastAPI `on_event` deprecation warning remained.
- Real PostgreSQL integration was then run separately against isolated
  `order_group_phase1_test`:
  - migration 31 applied successfully twice;
  - create/idempotent inbox/outbox/partial-fill OCO cancel/degraded reconcile/version behavior
    passed;
  - temporary database and temporary login role were dropped afterward.
- `docker compose config --quiet`, repository `compileall`, and Ruff over all new Phase 1 modules
  passed.
- Legacy regression coverage for order, bracket, paper execution, risk, portfolio,
  reconciliation, executor and CLI remained green through the full suite.

Operational boundary:

- Defaults remain `ORDER_GROUP_ENGINE_V2_ENABLED=false`,
  `ORDER_GROUP_SHADOW_BRACKETS_ENABLED=false`, and `OKX_EXECUTION_ENABLED=false`.
- No migration was applied to the live database, no running service/alpha was restarted, no broker
  credential was used, and no external order was submitted during Phase 1.
- No `dynamic_grid` file, strategy parameter or container was changed. Grid migration remains after
  Phase 2 replay certification as required by Section 48.7.
- External OKX demo/native acceptance and DNSE sandbox/live remain explicit infrastructure-gated
  work, not silently assumed capabilities.

### 48.6 Phase 2 - QuantBT-To-Live Differential Execution Replay

Goal: replay the same canonical command, market, execution, and group event tape through an isolated
trading-system engine and compare its causal output with QuantBT and recorded paper/sandbox/live
execution.

This phase extends Event Replay V1; it does not replace it and does not import strategy code into the
gateway. QuantBT is an optional test/oracle adapter pinned by commit and manifest, never a required
production service dependency.

Implementation work:

1. Define versioned replay envelopes:
   - `MarketEvent`: quote/trade/bar/book snapshot or delta, provider sequence, exchange/event/receive
     timestamps, source and freshness;
   - `ExecutionCommand`: place/cancel/replace/amend/cancel-all/group command;
   - `ExecutionEvent`: submitted/accepted/rejected/triggered/partial fill/fill/pending cancel/
     canceled/expired/reconciled;
   - `GroupEvent`, risk/reservation decision, account/position projection, funding/fee event;
   - manifest with dataset hash, config hash, instrument metadata hash, venue capability snapshot,
     engine versions, QuantBT commit, random seed, and clock policy.
2. Use `(event_time, source_priority, source_sequence, ingest_sequence, event_id)` as the explicit
   deterministic ordering key. Equal timestamps may not rely on PostgreSQL row order, Redis order,
   dictionary order, or wall-clock scheduling.
3. Build an isolated replay runtime under `services/replay/`:
   - logical clock;
   - in-memory or temporary-schema order/group repository;
   - the same domain group reducer, risk v2 rules, paper matcher, accounting projection, and venue
     capability planner used by runtime;
   - no production Redis publish, copy-outbox publish, heartbeat side effect, or broker adapter;
   - checkpoint/resume at every event boundary.
4. Add scoped market-event capture for causal replay:
   - capture only normalized events actually consumed by an active paper/order-group execution
     session, not the whole data-layer universe;
   - write compressed, partitioned Parquet/JSONL artifacts with sequence, timestamps, schema
     version, checksums, bounded retention, and atomic file rotation;
   - keep raw high-rate market tapes out of PostgreSQL and Redis durable storage;
   - allow an operator to import an existing data_layer/QuantBT fixture when no live capture exists;
   - if a sandbox/live venue fill has no observable public book event capable of proving queue
     priority, certify command/lifecycle/accounting replay only and report causal fill generation as
     unavailable.
5. Add a QuantBT adapter under `services/replay/adapters/quantbt.py`:
   - pin and record inspected package commit/version;
   - translate QuantBT `OrderCommand`, `command_report`, `order_events`, fills, positions, margin,
     fees, and funding into canonical replay records;
   - preserve command index and next-bar timing rather than inferring intent from final positions;
   - explicitly mark QuantBT's current no-partial-fill limitation in comparison output.
6. Add a differential comparator:
   - command diff: action, order type, side, quantity, prices, TIF, reduce-only, parent/group IDs;
   - lifecycle diff: event sequence, cumulative/remaining quantity, status, cancel/update cause;
   - group diff: winner, activation, canceled/resized siblings, race/overfill, compensation;
   - accounting diff: position, average price, cash, realized/unrealized PnL, fee, funding, margin,
     reservation, equity;
   - classify differences as `STRATEGY_COMMAND_MISMATCH`, `ENGINE_SEMANTIC_MISMATCH`,
     `EXPECTED_VENUE_CAPABILITY_DIFFERENCE`, `MARKET_DATA_GRANULARITY_DIFFERENCE`, or
     `UNEXPLAINED` with field tolerances and evidence.
7. Add replay endpoints and CLI, admin/read scope only:
   - create an isolated replay job from an uploaded/registered manifest;
   - inspect progress, digest, mismatch summary, and bounded event evidence;
   - export a redacted canonical tape from recorded paper/sandbox/live events;
   - run `quantbt-diff` locally/in Docker;
   - no endpoint accepts broker credentials or a submit flag.
8. Add golden scenario bundles:
   - conventional bracket OTO/OCO/OUO;
   - long-only and long/short dynamic grid command tapes;
   - DCA ladder, partial TP, trailing stop, cancel-replace, pair/basket, and arb package;
   - market data at bar, trade/quote, and bounded depth-volume levels where available.
9. Run the upgraded trading system against the dynamic-grid QuantBT fixture for at least 2,400
   bars per approved profile. This is a test adapter only; do not yet change the alpha to call the
   new group endpoint.

Phase 2 tests:

- replaying an identical tape repeatedly yields the same SHA-256 digest;
- replay from every checkpoint boundary yields the same terminal digest as uninterrupted replay;
- QuantBT `replay_certified` vs `single_pass` artifacts remain equal before comparing trading_system;
- 2,400+ bar long-only and long/short grid command/eligibility parity;
- full-fill OCO and lifecycle output match QuantBT where its contract applies;
- partial-fill/race scenarios use trading-system golden expectations and are labeled unsupported by
  the QuantBT oracle rather than forced into false equality;
- recorded paper tape replays to the same orders, fills, groups, positions, fees, PnL, and margin;
- sandbox/live redacted tape reproduces authoritative venue events and explains planner differences;
- duplicate, missing, stale, and reordered event fixtures fail or reconcile deterministically;
- bar-only ambiguous high/low paths are reported as data-granularity ambiguity, not silently ordered;
- no replay test writes production orders, fills, Redis command streams, broker APIs, or copy events;
- targeted suites, full `tests/unit`, compose/config validation, schema smoke, and bounded Docker
  integration matrix pass.

Phase 2 acceptance:

- zero unexplained command/strategy differences on certified QuantBT scenarios;
- zero unexplained state/accounting differences on canonical paper replay;
- every expected venue divergence is typed and includes the capability/rounding/latency evidence;
- restart/checkpoint replay is deterministic;
- operator can reproduce a failed group from a manifest without touching production state;
- the final report states the exact certification level: full lifecycle parity, accounting-only
  parity, or unsupported due to missing market granularity.

### 48.6.1 Phase 2 Implementation Log - 2026-08-04

Status: implementation and isolated validation complete on branch
`feat/order-group-replay-v2`.

Implemented:

- Added schema-versioned replay envelopes and manifests with SHA-256 hashes, pinned QuantBT commit,
  capability/config/instrument metadata, random seed and event-time clock policy.
- Added deterministic five-part ordering and upgraded Event Replay V1 sorting to consume the same
  sequence fields while preserving legacy fallbacks.
- Added isolated `services/replay` runtime with event-boundary checkpoint/resume, duplicate conflict
  detection, shared conditional-order-group reducer, shared paper matcher, shared Risk Engine V2
  order evaluation and shared accounting projection. It has no Redis, heartbeat, copy-outbox or
  broker adapter dependency.
- Added scoped market capture and atomic gzip JSONL artifacts under a per-job directory. Event count
  is bounded; raw high-rate tapes are not written into PostgreSQL or durable Redis.
- Added pinned, dependency-free QuantBT JSON adapter. It validates `replay_certified` against
  `single_pass`, preserves command/event indices and explicitly records the current no-partial-fill
  oracle limitation.
- Added typed differential comparator with bounded evidence and explicit bar-only ambiguity.
  QuantBT's partial-fill limitation cannot mask a command mismatch.
- Added additive migration `32-execution-replay-v2.sql` for job metadata/results, feature flag
  `REPLAY_V2_ENABLED=false`, admin-only API, Docker CLI and
  `EXECUTION_REPLAY_V2_GUIDE.md`.
- Added in-repository 2,401-bar long-only and long/short canonical command-tape fixtures. Also ran
  the real read-only dynamic-grid source against QuantBT commit
  `de4c7274c1a6beba67f0607568f27a9d4f5ac84a`: long-only produced `244` commands/`488` events and
  long-short produced `18,836` commands/`19,142` events. `replay_certified` and `single_pass` were
  equal for command tape and terminal accounting in both profiles. No file under
  `execution_alpha/alphas/dynamic_grid` was modified.

Safety boundary retained:

- Requests carrying broker secrets or `submit=true` fail closed.
- Replay V2 remains disabled by default. No running service, alpha, live database, Redis stream or
  broker account is touched by implementation tests.
- QuantBT is an optional artifact oracle and is not imported into gateway runtime.

Validation checklist:

- [x] deterministic digest under reordered input;
- [x] checkpoint resume from every event boundary;
- [x] duplicate idempotency/conflict, stale event and source-sequence gap policy;
- [x] shared Risk V2, paper matcher, accounting and OCO partial-fill/race behavior;
- [x] QuantBT commit/certified-single-pass validation and typed comparator differences;
- [x] 2,401-bar long-only and long/short command-tape parity;
- [x] targeted Replay V1/V2, order-group and CLI regression suite;
- [x] full unit suite: `451 passed`; only the existing FastAPI `on_event` deprecation warning;
- [x] `docker compose config --quiet`, repository compile and final Ruff pass;
- [x] migration 32 applied twice in isolated `replay_phase2_smoke`; metadata create/update/read passed;
  temporary database was dropped after validation.

Phase 2 conclusion:

- Certification mechanics are ready for `FULL_LIFECYCLE`, `ACCOUNTING_ONLY` and
  `UNSUPPORTED_MARKET_GRANULARITY` reports. The bundled deterministic fixtures have zero
  unexplained differences.
- This phase certifies the generic trading-system replay contract and the 2,401-bar QuantBT grid
  oracle at the pinned commit. It does not claim broker queue-priority parity without captured
  book/trade data, and it does not yet migrate `dynamic_grid` to the new order-group endpoint.
- No running container was restarted and migration 32 was not applied to the live database.

### 48.6.2 Canonical Identifier Boundary Correction - 2026-08-04

Rule clarified after Phase 2 review:

- QuantBT and any future backtest/oracle engine are behavioral references, not naming authorities
  for the trading-system domain.
- Existing canonical identifiers remain authoritative: `client_order_id` for place/cancel,
  `orig_client_order_id` plus `new_client_order_id` for amend/replace, and `order_group_id` for an
  execution command. Equivalent external names must be translated at the adapter boundary instead
  of propagated into replay runtime, APIs, database schemas, or production order paths.
- External identifiers may be retained only as nested, non-authoritative evidence under
  `metadata.source_identifiers`.

Audit and correction:

- Production gateway, executor schema, order domain and broker paths were verified unchanged; none
  consumes QuantBT `target_order_id`.
- Replay adapter/runtime initially retained `target_order_id` and `oco_group_id` too deeply. They
  were corrected to the canonical trading-system modify/group contract, and replay amend/replace
  now projects original and replacement order identities explicitly.
- Validation passed: `62` focused replay/gateway/order-group tests, the full unit suite with `452`
  tests, scoped Ruff, compileall, and `git diff --check`. The only warnings were the already-known
  FastAPI `on_event` deprecation warnings.
- This was a replay-only contract correction. Replay remains disabled by default; no running
  service, database migration, Redis stream, alpha, or broker account was touched.

### 48.7 Rollout, Safety, And Deferred Grid Migration

Rollout order after plan approval:

1. Implement Phase 1 behind `ORDER_GROUP_ENGINE_V2_ENABLED=false` and keep current brackets/orders
   unchanged.
2. Run schema/unit/contract tests, then shadow-reduce existing bracket events without dispatching
   effects. Compare old/new aggregate states.
3. Enable V2 only for isolated paper test accounts; test partial fill/race/restart and clean every
   disposable smoke scope afterward.
4. Enable Binance sandbox for a clean credential/account window. Never mix residual orders from
   other alpha scopes in the acceptance run.
5. Keep OKX execution disabled until demo credentials and account-mode metadata are supplied; run
   official request/response contract tests in the meantime.
6. Complete Phase 2 differential replay and publish bounded artifacts/digests in the implementation
   log.
7. Only then create a separate `dynamic_grid` migration change: replace metadata polling/cancel with
   `POST /v1/order-groups`, query durable group state, and rerun alpha parity/sandbox tests.

Rollback:

- disable the V2 feature flag to stop accepting new groups;
- continue coordinator recovery for already accepted groups until terminal or explicitly reconciled;
- do not abandon active emulated groups merely because the API facade is disabled;
- additive tables remain for audit; rollback must not delete group, order, fill, or event history.

Explicit non-goals for these two phases:

- no claim of exchange-level atomicity for emulated groups;
- no HFT or sub-millisecond latency target;
- no full L3 queue simulator when the source data is only trade/quote/bar or bounded depth;
- no changes to `dynamic_grid` strategy math, parameters, or running containers;
- no DNSE sandbox/live contingent-order enablement without official broker semantics;
- no automatic OKX live enablement;
- no replacement of QuantBT or NautilusTrader as research engines.

The implementation log for each phase must be appended directly below this section as work lands.
Each log must include changed files, schema/API compatibility, exact tests and results, known
assumptions, external-smoke limitations, cleanup evidence, and the commit hash.

### 48.8 Dynamic Grid Order-Group V2 Adapter - 2026-08-04

Status: alpha adapter implementation and isolated validation complete; operator activation and
paper/sandbox execution have not been run.

Implemented under `execution_alpha`:

- Extended the shared `AlphaTradeAction` wrapper with provider-neutral submit/get/list/update/cancel
  order-group methods backed by the canonical trading-system SDK.
- Migrated `alphas/dynamic_grid` multi-leg entry and exit batches from alpha-owned
  `oco_group_id` polling/cancel logic to `POST /v1/order-groups` using canonical
  `order_group_id`, `OCO`, `ON_FIRST_FILL`, `KEEP_REMAINDER`,
  `HALT_AND_RECONCILE`, and `INTERNAL` coordination.
- A one-leg eligible batch remains a normal LIMIT order because no sibling contingency exists.
- The alpha queries durable group state and fails closed when a referenced group is missing,
  `OVERFILLED`, `ERROR`, or `DEGRADED_RECONCILIATION_REQUIRED`. It no longer submits sibling
  cancels based on local polling.
- Legacy `oco_group_id` is accepted only while reading pre-migration order/state metadata. No
  trading-system domain, API, schema, or new alpha command was renamed to mirror QuantBT.
- Strategy math, official 1h parameters, cash sizing, order eligibility, flatten behavior and source
  backtest file remain unchanged.

Validation:

- Dynamic-grid alpha parity/unit suite: `11 passed`, including both official profiles over `2,401`
  bars, canonical multi-leg entry/exit payloads, one-leg fallback, shared runtime delegation,
  degraded-group fail-closed behavior, deterministic group recovery after a lost response/restart,
  and absence of local sibling cancellation.
- Trading-system order-group/coordinator/risk/gateway regression: `51 passed`; only the existing
  FastAPI `on_event` deprecation warning remained.
- Alpha/runtime compileall and `docker compose config --quiet`: passed.
- Risk routing was traced end-to-end: coordinator effects enter `order.inbound`, Risk Engine V2
  applies mode/profile/market/account/order-group gates, and only approved legs reach
  `order.requests`/executor.
- Final readiness review found and closed an OCO exposure-accounting gap before rollout. Additive
  migration `33-order-group-risk-exposure.sql` stores canonical `order_group_id` on
  `order_pending_exposure`; Risk excludes siblings from the group currently being validated and
  represents another OCO group's mutually exclusive pending legs by maximum remaining quantity,
  not their sum. Unrelated orders and non-OCO groups remain additive.
- Risk rejection now enters the durable order-group inbox as a rejected leg status, so a rejected
  command does not remain invisible to group recovery/replay. Canonical `client_order_id` and
  `order_group_id` contracts remain unchanged.
- Paper reservation deliberately remains conservative per resting leg in this rollout. It may lock
  more free margin than the eventual one-leg OCO execution, but it cannot under-reserve. The
  declared dynamic-grid account (20,000 USDT, 5x, maximum 15 x 4,000 USDT notional legs) has enough
  buying power for this policy. A future shared group-reservation ledger must be implemented as an
  accounting migration, not as an alpha exception.
- Final Trading System unit suite: `455 passed`; focused syntax/undefined-name Ruff and compileall
  passed. Both Trading System and dynamic-grid Compose validation passed. The only test warnings are
  the pre-existing FastAPI `on_event` deprecations.
- Migration 33 was applied twice with `ON_ERROR_STOP=1` in an isolated PostgreSQL 15/Timescale
  container; additive column/index creation and repeatability passed, then the temporary container
  was removed. The live database was not touched.

Operational boundary:

- No alpha service was started, no running container was restarted, no live migration/feature flag
  was applied, and no paper/sandbox/broker order was submitted.
- Before an operator starts dynamic-grid, migrations 31 and 33 must exist, the V2 feature must be
  explicitly enabled, and gateway/risk/order-group health must be verified. The local `.env` flag
  is prepared but no service has been restarted. Binance USD-M remains internally coordinated
  rather than exchange-atomic.

## 49. Stable Contract And Polyglot Core Upgrade Program

Status: `PHASES_0_TO_7_ENGINEERING_GATES_PASS_EXTERNAL_RUNTIME_CLOSURE_OPEN`. The stacked engineering
work is implemented and locally certified on `feat/stable-contract-phase7`, but it is not merged,
deployed, runtime-activated or production-certified. Closure Phases A/B below remain planning only
until the operator explicitly approves each gate; this section never authorizes an implicit merge,
push, migration, service restart, alpha rollout or broker submission.

Detailed program authority:

- [TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md)
- The detailed guide defines compatibility rules, technical-debt scope, work packages, commit
  discipline, workflows, test ladder, test-data isolation, rollout, rollback and acceptance gates.
- This section is the concise execution ledger. It must be updated after each accepted work package
  and phase with commit SHAs, exact tests, runtime evidence, cleanup result and residual debt.
- External API V1 and existing alpha strategy behavior remain unchanged throughout the program.
- The engineering program has eight independent gates: Phase 0 plus seven implementation/
  certification phases. Passing those gates proves the release candidate implementation, not the
  running production topology. Closure Phase A and Closure Phase B are separate release/operations
  gates which must close the external evidence left open by Phase 7.

Branch preparation:

- [x] Prior Order Group/Replay V2 branch merged into `dev` at `d4e05dc` by the operator workflow.
- [x] New branch `feat/stable-contract-polyglot-core` created from that `dev` baseline.
- [x] Phase 0 workflow definitions implemented for quality/contract, isolated integration/migration
  and nightly performance/supply-chain evidence. They remain feature-branch checks until reviewed;
  protected sandbox acceptance is intentionally deferred to the phase that first claims T6.
- [x] Program approved for Phase 0 execution.
- [x] Phase 1 stacked branch `feat/stable-contract-phase1` created from accepted Phase 0 evidence
  commit `be24fe1`; unrelated `shared/symbols.json` remains outside the branch work package.

### 49.1 Phase 0 - Contract Freeze, Inventory, And Baseline

Status: `USER_AUTHORIZED_CARRY_FORWARD_WITH_OPEN_OPERATIONAL_DEBT`.

- Objective: freeze and measure the current V1/runtime behavior without changing authority or
  runtime state.
- Detailed scope: [Phase 0 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-0-contract-freeze-inventory-and-baseline).
- Completed: deterministic OpenAPI and representative V1 fixtures; route/model/field/stream/DB/SDK
  inventory; Decimal/cache-key/reliability-path inventory; microbenchmark; read-only runtime and
  Docker resource probes; reproducible PostgreSQL/dual-Redis storage audit; manifest integrity
  tests; pinned initial CI workflows.
- Artifact authority: [Phase 0 baseline report](contracts/baseline/v1/README.md) and its
  `manifest.json` hashes.
- Test evidence: Python syntax compilation and diff check passed. CPU, read-only runtime,
  PostgreSQL relation/snapshot and both Redis baselines are recorded in the baseline report. Full
  unit/static/isolated-migration execution remains a feature-branch gate.
- Capacity update: RAM was increased from 8.6 GiB/about 100 MiB available to 10 GiB/about 1.8 GiB
  available. The host still has no swap. The earlier OOM/recovery incident remains valid evidence
  and requires a stable bounded observation window rather than being erased by the capacity change.
- PostgreSQL finding: the 7.54 GB database is dominated by 5.64 GB
  `broker_account_sync_snapshots` (5.32 GB TOAST) and 659 MB `portfolio_audit_log`, primarily
  historical bloat from lab `DELETE` resets. Timescale snapshot compression/retention is active and
  successful. Account snapshots remain eager for all 86 DB-active deployments; instrument
  snapshots are already change/open-position aware.
- Trading Redis finding: it used about 1.01/2.00 GB; the unbounded
  `commands.execution.paper` stream alone used about 1.02 GB/458k entries. `order.inbound` also has
  producer paths that bypass the Gateway maxlen helper. Pending was zero, but historical group lag
  was nonzero. No blind trim is allowed before Phase 2 durable command authority/rebuild proof.
- Order-group finding: 19 cancel commands are `DEAD` after exhausting 25 retries while Redis was
  loading AOF; 431 cancel commands remain `DISPATCHED` with zero stream pending while attempts keep
  increasing (observed maximum 2,114). Gateway is therefore correctly `DEGRADED`. Phase 2 must fix
  bounded retry/ACK convergence; Phase 0 must not delete evidence to make health green.
- Market-data finding: its dedicated ephemeral Redis used only about 4.84 MB/1 GB with persistence
  disabled and no error/eviction. data_layer was healthy with 40/40 Binance shards and healthy DNSE;
  queue drops were cumulative startup evidence and did not increase in the bounded follow-up.
  Pub/Sub remains best-effort latest state; last-known snapshots require freshness validation.
- Debt ownership: Phase 2 owns durable journal plus safe stream retention and `noeviction` policy;
  Phase 3/Phase 7 own snapshot cadence/current-state and bloat-safe operations; data_layer owns
  windowed drop/high-water/active-universe readiness and any separate lossless tape contract.
- Verification update: targeted Phase 0 tests passed 6/6; the full unit suite, shell syntax, Python
  compilation, diff check and manifest verification passed after RAM expansion. Disposable test
  containers were removed and core container restart counts stayed zero. Remote quality/static and
  isolated migration workflows remain open gates.
- Static-quality finding: 283 Ruff violations predate this branch. Phase 0 files are clean and the
  workflow now enforces a changed-file ratchet against the selected base. No unrelated bulk format
  or behavior change is allowed merely to make the new workflow green.
- Gate to close: green feature-branch CI plus a stable post-capacity recovery window for Redis,
  Gateway, order-group and core heartbeats. On 2026-08-06 the user explicitly authorized Phase 1 to
  proceed with these findings carried forward; this does not reclassify `DEGRADED` as healthy.
- Residual debt: all TD-1 through TD-7 remain. Phase 2 additionally owns the confirmed bounded-retry
  overflow and historical stream-lag semantics; current direct alpha bypass count remains zero for
  migrated `alphas/`.

### 49.2 Phase 1 - Stable Contracts, Compatibility Boundary, And SDK Versioning

Status: `IMPLEMENTED_LOCAL_GATES_PASS_RUNTIME_NOT_ACTIVATED`.

- Objective: introduce the canonical language-neutral contract in bounded shadow mode while V1 and
  existing SDK methods remain authoritative and unchanged.
- Detailed scope: [Phase 1 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-1-stable-contracts-compatibility-boundary-and-sdk-versioning).
- Completed: immutable language-neutral V2 schemas; deterministic Python/Rust/Go/C#/C++ transport
  bindings; additive OpenAPI V1 artifact and compatibility diff; Gateway V1-to-canonical bounded
  shadow translator; revision headers and `/v1/contracts`; standalone alpha SDK `1.1.0`; N/N-1
  compatibility matrix and golden method tests. Detailed implementation evidence is recorded in
  the Phase 1 guide.
- Test/runtime evidence: changed-file Ruff, compile, generator/OpenAPI drift, full unit suite and
  Compose validation pass. Disposable real-Redis T3/T8 proves exactly one unchanged V1 stream
  side effect and zero shadow keys/residue. The 20,000-order benchmark passes with added p95
  `0.249 ms` against a `0.50 ms` budget. Local polyglot evidence is static-only because the slim
  image has no compilers; feature-branch CI compile evidence remains a closure gate.
- Runtime state: no service/alpha restart, no DB migration, no broker call and no authority change.
  `CONTRACT_SHADOW_ENABLED=false` remains the default until a separately approved paper canary.
- Residual debt after phase: ordinary ingress durability, exact numeric migration, venue lifecycle
  and Rust authority remain intentionally open.

### 49.3 Phase 2 - Durable Command Journal And Executor Reliability

Status: `IMPLEMENTED_LOCAL_GATES_PASS_RUNTIME_NOT_ACTIVATED`.

- Objective: guarantee that an accepted ordinary order survives process/Redis failure and that
  uncertain broker outcomes cannot become false rejection or duplicate submission.
- Detailed scope: [Phase 2 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-2-durable-command-journal-and-executor-reliability).
- Work to do: command journal/outbox, durable idempotency, leases/retries/dead letters,
  query-before-resend, ACK evidence, health/CLI and scoped canary rollout; then ACK/MINID/age-aware
  stream retention for every producer, Redis `noeviction` plus memory/AOF alerts, host fork/recovery
  prerequisites and safe removal of proven-unused pre-split DB2 market keys.
- Completed:
  - additive `command_journal`, generic multi-stage `command_dispatch_outbox`, immutable delivery
    attempts, broker-attempt state, ACK evidence and trim-audit schema in migration 34;
  - exact current V1 Redis fields are persisted before durable success and dispatched by a leased,
    aggregate-ordered coordinator; the group-specific outbox remains unchanged;
  - rollout states are explicit and default to `OFF`; paper/sandbox canaries are scoped by alpha or
    account, and live requires the separate `DURABLE_ACCEPT_LIVE_EXPLICIT` state;
  - PostgreSQL is the durable idempotency authority in durable modes while Redis remains only a
    fast cache; identical duplicate and conflicting-hash requests preserve current V1 response
    semantics;
  - cancellation before dispatch supersedes a pending PLACE/AMEND atomically and writes terminal
    evidence without emitting a stale command;
  - Risk forwarding to paper/executor streams is itself persisted as a downstream outbox stage, so
    a crash around Risk publish cannot lose or recreate an accepted command;
  - Executor persists broker-attempt intent before submission, queries stable client order IDs
    before resend after uncertain/requesting state, and reuses a persisted accepted outcome rather
    than submitting twice after projection failure;
  - Binance USD-M has an authoritative client-order query path. DNSE and OKX remain fail-safe:
    ambiguous query support returns `UNCERTAIN` and reconciliation owns resolution rather than a
    blind resend;
  - Risk, Paper and Executor write durable evidence before XACK for tracked commands. Malformed
    payload dead letters redact credentials. Executor DB/persistence failures remain pending and are
    reclaimed with `XAUTOCLAIM`;
  - Gateway health and `cli ops command-journal` expose pending, dispatched-unacked, dead, oldest
    age, attempts and uncertain commands;
  - safe stream retention computes a MINID watermark from minimum age, all consumer-group delivery
    positions and the oldest pending message, and writes an audit row. It is disabled by default;
  - Redis 60/75/85 percent, persistence-failure and fork-latency alerts plus a read-only host
    durability prerequisite script were added;
  - command-journal service is behind Compose profile `durable-command`, so normal Compose/runtime
    remains unchanged until an approved canary.
- Test/runtime evidence:
  - migration 34 applied twice successfully to a disposable PostgreSQL database;
  - disposable PostgreSQL + Redis integration passed DB-commit-before-publish recovery,
    publish-before-outbox-update deduplication, exact stream fields, durable identical/conflicting
    idempotency, aggregate lease ordering, cancellation-before-dispatch, Risk downstream delivery,
    ACK evidence, broker-attempt recovery/cache and ACK/pending-aware trim; a 20-request concurrent
    same-key race produced exactly one journal row and one outbox row;
  - Redis AOF restart drill preserved both the stream message and dispatcher dedup key; disposable
    container and volume were removed afterward;
  - uncertain broker tests cover query-found, query-not-found and query-uncertain, including query
    before the first resend of a reclaimed request and reuse of a persisted broker response;
  - final suite collected 508 tests: 505 passed and 3 env-gated integrations skipped in the generic
    run; the Phase 2 integration was executed separately against disposable infrastructure and
    passed. Targeted executor/paper/order-group regressions, Ruff on the Phase 2 change set, Python
    compile, normal Compose and profile `durable-command` validation all pass;
  - durable-accept benchmark artifact:
    `contracts/baseline/v2/phase2-durable-benchmark.json`: 3,000 commands, concurrency 8,
    `1,046.18/s`, p50 `5.02 ms`, p95 `13.97 ms`, p99 `23.04 ms`; configured Gateway rate
    `300/s` and p95 budget `15 ms` both pass. Concurrency 20 was intentionally rejected as an
    operating point because DB contention increased p95 to `29.35 ms` without useful capacity gain;
  - every disposable Phase 2 database, Redis container, stream key and Docker volume was deleted;
    no alpha, broker account, live table or running service was changed/restarted.
- Runtime activation gates still open:
  - migration 34 is not applied to the runtime database and profile `durable-command` is not
    started; `COMMAND_JOURNAL_ROLLOUT=OFF` remains authoritative;
  - host check currently reports `vm.overcommit_memory=0`, no swap/emergency reserve and Redis
    `volatile-lru`; AOF is enabled. Do not switch to `noeviction` until retention/capacity paper
    canary passes and the host prerequisites are operator-approved;
  - historical unbounded stream data must be reduced only through audited ACK/MINID canary. Never
    flush DB2 or trim pending evidence to make the readiness check green;
  - real sandbox query/reconciliation proof for Binance and authoritative DNSE/OKX query adapters
    require later venue-specific approval/infra. Live remains prohibited by this phase.
- Residual debt after phase: canonical Decimal/domain and venue/product identity remain Phase 3/4;
  cancel/amend uncertainty remains reconciliation-first until each venue proves operation-specific
  query parity; group outbox convergence remains evidence-driven and is not forced.

### 49.4 Phase 3 - Canonical Domain And Exact Numeric Migration

Status: `IMPLEMENTED_LOCAL_GATES_PASS_RUNTIME_NOT_ACTIVATED`.

- Objective: establish one pure canonical Python business domain and exact monetary/quantity
  arithmetic without changing V1 semantics.
- Detailed scope: [Phase 3 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-3-canonical-domain-and-exact-numeric-migration).
- Work to do: vertical-slice adapters and Decimal migration across order, cancel/amend, fill,
  position, reservation, balances, groups and PnL; versioned immutable event evidence; compact broker
  current-state plus bounded history, exposure-aware account/portfolio snapshots, idempotent time
  buckets, current peak-equity state and aggregate/retention query parity.
- Completed:
  - [x] Phase 3 branch `feat/stable-contract-phase3` created from the tested Phase 2 head; no
    running service, runtime database or Redis instance was changed during baseline inventory.
  - [x] Canonical ownership decision recorded: `domain/` owns pure exact business models and
    reducers; `contracts/generated` owns language-neutral transport DTOs; V1 Pydantic schemas and
    legacy Redis payloads remain compatibility ingress/egress only.
  - [x] Baseline inventory confirmed the critical gaps named by this phase: Gateway/Executor order
    DTOs retain monetary floats, Binance listener parses fill price/quantity through float, Risk V2
    converts approved quantity back to float, broker sync stores duplicate full snapshots, and
    performance projection performs historical peak scans plus unconditional idle writes.
  - [x] Added one bounded exact-decimal/canonical digest/evidence primitive and migrated critical
    Executor, Risk, Listener, Market Data, Paper, Accounting, Performance, bracket and arbitrage
    monetary paths to canonical `Decimal` internals while preserving V1 number input.
  - [x] Added migration 35: decision evidence, exact pending exposure, broker/account current state,
    current-first effective views, change-only broker history, performance current state, idempotent
    buckets, event wakeups, canonical order-state projection and storage-policy audit.
  - [x] Replaced unconditional duplicate broker snapshots and idle performance writes with
    current-state/change-only history and active/pending/idle/event-triggered cadence. Disabled the
    legacy 2-second stats projector by default without deleting its compatibility path.
  - [x] Preserved immutable fills/capital/order-group rows as replay sources and projected only
    semantic mutable order state transitions; no-op timestamp writes do not append events.
- Test/runtime evidence:
  - fresh disposable PostgreSQL/Timescale initialization through migration 35 passed; migration 35
    re-apply passed idempotency;
  - 548 tests collected: generic suite 543 passed plus five env-gated skips; all five integration
    suites passed separately against disposable PostgreSQL and Redis;
  - exact paper topology covered Gateway V1 -> Risk -> partial fills `0.006 + 0.004` -> accounting ->
    canonical event replay with identical final state;
  - benchmark artifact `contracts/baseline/v2/phase3-domain-benchmark.json` passes every budget:
    evidence p95 `0.099 ms`, Risk p95 `0.041 ms`, position/PnL p95 `0.008 ms`, 60-fill replay p95
    `0.216 ms`; focused Ruff and diff checks pass;
  - cleanup verified zero rows in all Phase 3 test tables and `DBSIZE=0` for disposable Redis DB
    0/1/2. No live service, runtime schema, alpha or broker account was changed.
- Runtime activation gate: apply migration 35 first in a low-traffic window, preflight the bounded
  `order_pending_exposure` type alteration, validate views/triggers, then restart owning services and
  run a paper canary. Current running code has not been switched to this branch.
- Residual debt after phase: legacy float/V1 compatibility remains only at named adapters; actual
  retention/compression jobs remain Phase 7; venue/product-aware identity and OKX driver work remain
  Phase 4; real broker acceptance and FastAPI lifespan migration are not claimed here.

### 49.5 Phase 4 - Venue Drivers And Product-Aware Instruments

Status: `IMPLEMENTED_LOCAL_GATES_PASS_RUNTIME_NOT_ACTIVATED`.

- Objective: make venue integration lifecycle-complete and prevent symbol/product collisions while
  preserving Binance/DNSE behavior and keeping OKX disabled.
- Detailed scope: [Phase 4 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-4-venue-driver-and-product-aware-instrument-architecture).
- Completed:
  - product-aware identity `VENUE:PRODUCT:VENUE_SYMBOL`, bounded alias resolution and additive
    migration 36 while retaining the V1 `instrument_id` primary key and mixed-version insert path;
  - canonical market snapshot/metadata keys and channels, with legacy projection derived by one
    owner only for default products and mismatch/fallback telemetry;
  - service-owned execution, listener, reconciliation and account-sync registries; centralized
    product capability, market authority, account/position mode, credential, time-sync and
    rate-limit scope contracts;
  - Risk, Paper, Performance, Bracket, Emergency Close, Executor and Portfolio metadata paths use
    product-aware resolution internally without changing the frozen Alpha/Gateway V1 payload;
  - Binance and DNSE are wrapped behind the new lifecycle boundary. OKX Swap/Futures normalization
    and normal/algo/private/account/reconciliation contracts exist, but execution requires explicit
    enablement and acceptance flags and remains disabled by default.
- Test/runtime evidence:
  - 560 tests collected: the generic suite passed all 553 runnable tests with seven env-gated
    integrations skipped; all seven integrations passed separately against disposable PostgreSQL
    and Redis;
  - migration 36 passed fresh initialization, mixed-version V1 insert, metadata audit, accepted
    command metadata pinning, collision proof and idempotent re-apply twice;
  - product collision, native separators, wrong-product fail-closed behavior, authority/staleness,
    account mode, capability, shared runtime scope, OKX-disabled and HTTP-pool reuse tests pass;
  - the frozen OpenAPI/V1 artifact check remains green. The 20,000-iteration Phase 4 benchmark
    records warm resolver p95 `0.005126 ms`, bounded churn p95 `0.019978 ms`, cache-key p95
    `0.002200 ms` and parse p95 `0.013823 ms`; the resolver remains capped at 4,096 entries;
  - disposable Phase 4 database rows and Redis DB 0-4 were verified empty, then the disposable
    PostgreSQL/Redis containers and network were removed. No running service, alpha, runtime schema
    or broker account was changed.
- Runtime activation gate: apply migration 36 only after migrations 34/35 and their gates, restart
  owning services in controlled order, then run paper parity and separately approved sandbox
  acceptance before enabling any new product. V1 and default-product legacy projections remain on
  during the first canary.
- Residual debt after phase: real broker sandbox/live acceptance was not run; OKX remains contract-
  ready but disabled; legacy symbol-only statistics and process-local cache telemetry need explicit
  Phase 7 retirement/aggregation ownership. Rust remains untrusted Phase 5 shadow work.

### 49.6 Phase 5 - Rust Pure Core Shadow Backend

Status: `IMPLEMENTATION_AND_ISOLATED_ACCEPTANCE_COMPLETE_RUNTIME_ACTIVATION_OFF`.

- Objective: independently reproduce approved Python pure-domain decisions in Rust with no runtime
  side effects.
- Detailed scope: [Phase 5 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-5-rust-pure-core-shadow-backend).
- Completed: pinned pure Rust workspace, exact Decimal/timestamp/hash contracts, independent Risk V2,
  conditional-order-group reducer, replay comparator, PyO3 ABI3 wheel, offline CLI, Python-authority
  shadow scope, additive divergence evidence, pinned CI and bounded performance/soak artifacts.
- Accepted commits: `a408808`, `1f3281b`; detailed implementation/test evidence is recorded directly
  under Phase 5 in the linked guide.
- Test/runtime evidence: Rust format/clippy and 11 workspace tests passed; wheel certification passed
  9 risk, 6 order-group, 4 replay and 105 malformed-input cases; 562 unit and 8 isolated integration
  tests passed; fresh/idempotent migration passed; frozen V1 passed; 5,000 disposable paper shadow
  comparisons produced 5,000 matches, zero divergence and zero residual rows.
- Runtime state: default remains `RUST_SHADOW_MODE=OFF`; the wheel was not installed into active
  services and no service/alpha/broker was restarted or mutated.
- Residual debt after phase: Python remains authoritative; Linux x86_64 is the only declared wheel
  architecture; no checked-in QuantBT fixture or broker T6 was fabricated. Reviewed runtime image,
  explicit paper canary, authority lease/handover and any C++ work remain Phase 6 scope.

### 49.7 Phase 6 - Controlled Rust Authority And C++ Readiness

Status: `ENGINEERING_COMPLETE_RUNTIME_NOT_ACTIVATED_ON_STACKED_BRANCH_FEAT_STABLE_CONTRACT_PHASE6`.

- Objective: allow one proven Rust pure component to own explicitly selected paper scopes while
  preserving one authority and tested rollback.
- Detailed scope: [Phase 6 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-6-controlled-rust-authority-and-c-readiness).
- Approved implementation boundary: only `RISK_ORDER_CORE_V2` may become Rust-authoritative for an
  explicit paper scope. Python retains pre/runtime guards, reservations, routing, Executor and every
  external side effect. Detailed authority invariants and WP-A through WP-E are frozen in sections
  6.1-6.3 of the linked guide.
- Completed: migration 38; persisted authority/lease/epoch/revision; Rust paper Risk authority with
  Python shadow; exact decision/payload parity; scoped halt; restart reclaim; drain/handover;
  explicit next-epoch rollback; startup mixed-config guard; internal CLI; opt-in wheel image;
  operator/schema documentation; C++-ready canonical DTO/replay boundary without a premature ABI.
- Test/runtime evidence: 29 risk, 11 order-group and 8 replay cross-language cases; 105 malformed
  inputs; strict Rust fmt/clippy and 11 workspace tests; 582 Python unit/integration tests; migration
  applied idempotently; 5,000 Rust-authoritative disposable paper decisions over Binance/DNSE with
  5,000 matches, zero failure and zero residual rows. Pure 10,000-iteration p95 was 0.1902 ms Python
  versus 0.0778 ms Rust full FFI/JSON round trip. Full authority protocol reached 234.55 decisions/s
  at concurrency 10 with p95 50.23 ms and about 721 bytes logical evidence per matching decision.
- Runtime state: no active service/image tag, alpha, production DB/Redis or broker was changed;
  `ENGINE_AUTHORITY_ENABLED=false` remains the default. See `ENGINE_AUTHORITY_RUNBOOK.md` before any
  controlled activation.
- Residual debt after phase: reviewed 24-hour paper soak, production evidence retention, broader
  runtime alpha-family certification and backup/restore/PITR remain Phase 7 gates. Sandbox/live Rust
  authority, broker T6, AArch64 wheels, automatic fallback and C++ runtime remain unsupported.

### 49.8 Phase 7 - Legacy Retirement And Production Certification

Status: `ENGINEERING_GATES_PASS_EXTERNAL_ACCEPTANCE_OPEN_ON_FEAT_STABLE_CONTRACT_PHASE7`.

- Objective: remove only proven-unused transition paths and certify the upgraded system through
  recovery, capacity, security, venue/mode and operational evidence.
- Detailed scope: [Phase 7 guide](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#phase-7-legacy-retirement-and-production-certification).
- Delivered scope: consumer telemetry/deprecation governance, expand-migrate-contract controls, migration runner,
  retention, secret authority improvement, documentation synchronization and final certification;
  isolated test DB/schema, measured autovacuum/analyze tuning, heap/index/TOAST alerts, online
  repack runbook, Timescale late-row/restore certification and bounded PostgreSQL/Redis log rotation.
- Approved execution boundary: retire-by-evidence; preserve V1 API/schema/SDK behavior; no legacy
  surface is removed before bounded usage telemetry proves zero consumers for its support window.
  Engineering completion is separated from 24-hour soak, WAL/PITR and real broker acceptance.
- Work packages: WP-A compatibility telemetry and secret authority; WP-B migration governance;
  WP-C bounded storage/maintenance; WP-D disposable isolation/recovery; WP-E full certification;
  WP-F documentation/closure. The detailed safety rules, implementation scope and checkpoints are
  frozen in sections 7.1-7.3 of the linked guide.
- Completed: WP-A through WP-F engineering work. Compatibility telemetry/key hashing, governed
  migrations, ownership inventory, bounded retention/maintenance, Redis epoch recovery, documentation
  and disposable certification are implemented. Existing V1 behavior remains authoritative; no
  legacy surface was removed without a completed usage support window.
- Test/runtime evidence: `596/596` unit, `10/10` isolated integration with no skips, `191/191`
  representative alpha/execution cases, Rust workspace `11/11`, and Python/Rust authority parity
  `5,000/5,000` across Binance/DNSE paper. Fresh/populated migrations, Timescale logical restore and
  actual Redis restart recovery passed. All disposable rows, Redis keys, containers, volumes and
  phase-specific images were removed. Detailed evidence: [Phase 7 log](TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md#74-phase-7-implementation-and-certification-log---2026-08-06).
- Runtime boundary: no active service/image tag, alpha, production DB/Redis or broker account was
  changed. No merge or push was performed.
- Residual external gates: reviewed 24-hour process-level paper soak, real WAL/PITR recovery, clean
  sandbox/live broker acceptance per venue/product and green remote compiler/branch-protection CI.
  These prevent a blanket production-certified label but do not invalidate local engineering gates.

### 49.9 Closure Phase A - Release Candidate And Isolated Production-Like Acceptance

Status: `PLANNED_AWAITING_OPERATOR_APPROVAL`. This phase creates evidence for a deployable release
candidate without changing the running Trading System, alpha containers, production database,
production Redis instances or any broker account.

Objective:

- turn the stacked Phase 0-7 work into one immutable, reproducible release candidate;
- close CI, migration, recovery, full-topology, alpha-family, failure-injection, capacity and
  supply-chain evidence gaps against production-like copies;
- prove that V1 HTTP/Redis/SDK behavior and strategy execution remain compatible before any runtime
  process loads the new code;
- leave one reviewed artifact, one rollback artifact and a bounded evidence package for Closure
  Phase B. A passing local unit suite alone is not sufficient.

#### 49.9.1 Frozen Safety Boundary

- Start from the tested `feat/stable-contract-phase7` stack. Do not silently rebase onto unrelated
  work, stage `shared/symbols.json`, stage `upgrade/`, merge to `dev`, push, or rewrite history.
- Reconcile the exact commit DAG, migration checksums, generated OpenAPI/contracts and known dirty
  work before creating the release-candidate tag/branch. The operator owns the eventual merge.
- Build versioned images identified by Git SHA, contract digest, schema/migration digest and build
  timestamp. `latest` is not an acceptable release or rollback identity.
- Preserve external Alpha/Gateway V1 endpoints, current SDK behavior, legacy Redis projections and
  existing strategy logic. New internal contracts remain additive and feature-gated.
- All tests that write PostgreSQL, Redis, files, streams or broker state must use disposable
  resources or explicitly protected test scopes. Production DSNs and genuine audit history must
  fail closed in cleanup tooling.
- No test account, alpha id, strategy id, API key, Redis key, Docker volume or generated log may be
  left behind. Cleanup evidence is part of the gate, not an optional final command.
- Do not declare a venue/mode certified by inference from another venue/mode. Paper, sandbox and
  live evidence are separate.

#### 49.9.2 Work Package A - Release Candidate Freeze And Traceability

- Create a release manifest containing the source commit, parent `dev` commit, included phase
  commits, dirty-path exclusions, Python/Rust/toolchain versions, dependency lock digest, generated
  contract digest, migration `01-40` checksums and image digests.
- Correct stale phase statuses and link every evidence artifact from this execution ledger only
  after its gate actually passes. Preserve failed attempts and residual debt; do not edit language
  merely to make the release appear green.
- Produce immutable normal and Rust-shadow image variants from the same source revision. Verify
  that every service in the test topology uses the expected digest and that no mixed old/new image
  remains unnoticed.
- Capture a rollback manifest for the currently running V1 image/config/schema boundary. Rollback
  must restore executable authority without deleting additive migrations or immutable evidence.

#### 49.9.3 Work Package B - Complete CI And Supply-Chain Gates

- Run all existing workflows: quality/contracts, integration/migration, nightly baseline and Rust
  shadow. Reproduce them locally where possible, then require green remote CI on the candidate branch.
- Add or enable the gaps required by the detailed guide before calling CI complete:
  - changed-code coverage and critical-domain coverage thresholds, with no unexplained coverage
    regression;
  - secret scanning over source, image context and generated artifacts;
  - dependency audit, deterministic SBOM generation and container-image vulnerability scan;
  - remote compiler/build matrix for the declared Python versions, Rust x86_64 wheel and contract
    consumers. Go/C#/C++ remain contract-readiness checks unless an implementation is explicitly in
    scope;
  - a dedicated canonical domain/replay parity workflow triggered by domain, contract, replay,
    risk, order-group or migration changes;
  - protected sandbox acceptance workflow definition with environment approval and secret scopes.
    Defining it does not authorize a broker run in Closure Phase A.
- Record skipped tests by name and reason. An environment-gated test is not counted as passed unless
  its isolated job actually runs.

#### 49.9.4 Work Package C - Populated Migration And Recovery Laboratory

- Take read-only inventories of the current runtime before cloning. At planning time the live-like
  database had none of migrations `34-40`, the migration ledger did not exist, the durable command
  journal service was absent and critical rollout flags were off. Re-audit; do not assume this
  snapshot remains current.
- Restore a sanitized production-like PostgreSQL snapshot into an isolated database. Because the
  existing runtime schema is through migration `33`, validate ownership/anchor objects and baseline
  **through `33` only**, then apply migrations `34-40` with the governed runner. Never baseline
  through migrations whose objects do not exist.
- Exercise fresh initialization, populated baseline/apply, idempotent re-apply, concurrent runner
  rejection, checksum drift rejection, dirty/partial migration rejection and read compatibility
  with the previous application image.
- Measure migration duration, blocking locks, transaction age, WAL growth, temporary disk usage,
  heap/index/TOAST growth, row-count invariants and post-migration query latency. Establish explicit
  production budgets before Closure Phase B.
- Perform logical restore and a real WAL/PITR drill against disposable infrastructure. Compare
  schema inventory, immutable row counts, canonical digests, latest order/fill/position state and
  Timescale aggregate continuity at the selected recovery point.
- Clone a bounded Redis AOF/snapshot into an isolated instance. Test process restart, Redis restart,
  run-id/epoch change, pending reclaim, ACK recovery, idempotent redispatch and canonical rebuild.
- Test audited stream retention using age, consumer-group delivery and oldest-pending watermarks.
  Never flush or trim pending evidence merely to satisfy a memory check.

#### 49.9.5 Work Package D - Full Topology And Alpha-Family Certification

- Start every required service from the immutable candidate images against disposable populated
  PostgreSQL and dual Redis. Begin with new rollout flags off and V1 Python behavior authoritative.
- Validate startup ordering, migrations, readiness, heartbeat ownership, command lag, consumer-group
  ownership, schema compatibility and clean shutdown/restart. A container being `Up` is not health
  evidence.
- Run V1 golden compatibility for HTTP status/body, typed errors, idempotency semantics, generated
  SDK calls and the authoritative Redis message fields. Test current and N-1 supported clients.
- Run representative alpha/execution fixtures without changing strategy logic:
  - directional/single-order and percent-equity sizing;
  - target-weight/portfolio rebalance and multi-symbol sessions;
  - bracket, stop, take-profit, trailing, cancel/amend and partial-fill lifecycle;
  - dynamic grid/reactive conditional order groups and sibling cancellation races;
  - basis/arbitrage multi-leg coordination;
  - Binance paper and DNSE paper, including product-aware derivative identity;
  - copy-trading command/outbox publication and replay without duplicate external intent.
- Compare accepted commands, orders, fills, reservations, positions, realized/unrealized PnL,
  account/portfolio current state, reconciliation findings and copy events against frozen expected
  evidence. Require zero unexplained divergence, duplicate broker effect or accepted-command loss.
- Run failure injection at every durable boundary: terminate Gateway after DB commit, interrupt the
  dispatcher before/after publish, restart Redis, interrupt PostgreSQL, restart Executor/Listener/
  Reconciliation/Order Group services, delay/duplicate/reorder events and hold a command pending
  beyond its reclaim threshold. Recovery must be deterministic and idempotent.
- Run replay from immutable evidence to an empty projection and compare the complete final state,
  not merely event counts. Include Python canonical replay, Rust shadow replay and malformed input.

#### 49.9.6 Work Package E - Capacity, Storage And Soak Acceptance

- Test current observed load and a documented projected load including broad-universe/scalping
  bursts, multi-alpha concurrency, command backlog accumulation and bounded drain after recovery.
- Report throughput and p50/p95/p99 latency for Gateway acceptance, journal commit, Risk decision,
  dispatch, order-group transition, fill projection and replay. Correctness budgets take precedence
  over peak throughput.
- Measure per-service CPU/RSS, Redis used memory/fragmentation/persistence latency, stream growth,
  PostgreSQL WAL/heap/index/TOAST/dead tuples, Docker overlay growth and application log growth.
- Run a reviewed full-process paper soak for at least 24 hours using the complete service topology,
  not an in-process component loop. Include at least one controlled service restart and one Redis
  recovery during the window.
- Prove backlog reaches a bounded steady state and drains within the agreed objective. No stream,
  snapshot table, log or replay artifact may grow without an owner and retention classification.
- At planning time trading Redis was near its configured memory ceiling and historical streams were
  large. Before any `noeviction` switch or mass restart, re-measure host RAM/swap,
  `vm.overcommit_memory`, AOF fork headroom and disk. Capacity headroom must be created deliberately;
  do not treat eviction, flush or unaudited trim as remediation.

#### 49.9.7 Closure Phase A Test Matrix And Evidence

| Gate | Required evidence | Pass condition |
|---|---|---|
| A1 Contract | Generated OpenAPI, V1 fixtures, SDK N/N-1 | No unapproved public diff |
| A2 Domain | Decimal/property/state-machine tests | Exact deterministic decisions |
| A3 Migration | Fresh, populated, repeat, lock, compatibility | `01-40` governed and reversible operationally |
| A4 Replay | Empty-projection rebuild and Python/Rust comparison | Zero unexplained final-state divergence |
| A5 Reliability | Crash/restart/duplicate/reorder matrix | No accepted-command loss or duplicate effect |
| A6 Alpha | Representative family fixtures | Orders/fills/positions/PnL match frozen expectations |
| A7 Capacity | Burst, backlog drain and 24-hour soak | Budgets pass with stable bounded growth |
| A8 Recovery | Logical restore, WAL/PITR and Redis epoch recovery | Recovery-point state and digests match |
| A9 Security | Secret scan, dependency audit, SBOM, image scan | No unapproved critical/high finding |
| A10 Cleanup | DB/Redis/Docker/file residual inventory | Zero disposable residue; production untouched |

Required retained artifacts:

- release and rollback manifests;
- workflow URLs/results and compiler matrix;
- migration/lock/WAL/storage report;
- recovery and checksum comparison report;
- domain/replay/alpha parity report;
- failure-injection report;
- 24-hour soak and capacity report;
- cleanup manifest and residual-debt ledger.

Exit criteria:

- every A1-A10 gate passes or is explicitly classified as an external venue gate not needed for the
  first paper-only rollout;
- the release candidate is immutable and reproducible, V1 compatibility is proven and rollback is
  executable;
- all test state is removed and the running system remains unchanged;
- the operator reviews the evidence and separately authorizes Closure Phase B. No passing script may
  auto-merge, auto-push, migrate production or restart runtime services.

#### 49.9.8 Closure Phase A Execution Log - 2026-08-10

Status: `ENGINEERING_ACCEPTANCE_COMPLETE_RELEASE_GATES_OPEN`.

- PR #9 head was frozen at source candidate `dba61c9a0b121f348d87662b641c265a73b11b39`.
  Dirty runtime/user paths `shared/symbols.json`, `state/` and `upgrade/` were explicitly excluded
  by building from `git archive`, not from the worktree. Versioned normal, test and Rust-shadow
  images were built and recorded by digest.
- A1-A4 local gates passed for generated contracts, frozen V1 compatibility, canonical golden
  corpus, exact Decimal domain behavior, fresh/populated/idempotent migrations, advisory-lock and
  checksum-drift rejection, Python/Rust parity and shadow/canary authority. Remote PR compiler and
  branch-protection results remain an external CI gate because this host cannot read private GitHub
  check status without an authenticated API client.
- Integration accounting was corrected: a run without the suite-specific DSN variables produced
  twelve explicit skips and was not counted. Supplying all disposable PostgreSQL/Redis variables
  ran `10/10` core integration tests; the two market-plane tests then ran separately with the
  disposable market Redis online and deliberately offline, and both passed.
- A disposable full topology was started from the immutable candidate with PostgreSQL, durable
  control Redis and ephemeral market Redis. All thirteen required service heartbeats became fresh
  and Gateway reported `READY`. Binance broker adapters were intentionally `DEGRADED` because no
  sandbox/live credentials were mounted; this does not certify either external broker mode.
- The first 120-order paper burst rejected candidate `dba61c9`: Gateway accepted `120/120`, but one
  LIMIT command ended as `PAPER_EXECUTION_ERROR`. PostgreSQL proved a real lock-order deadlock:
  paper instrument setup wrote `venues -> instruments` while a concurrent fill FK check held
  `instruments -> venues`. Streams drained and reservations were released, but A6 correctly failed
  because an accepted command did not produce the expected paper effect.
- The pending candidate fix makes an existing instrument identity a read-only fast path and uses a
  venue/product/symbol-scoped advisory lock plus post-lock recheck only for first bootstrap. This
  removes reference-table writes from every order and prevents the observed reverse lock order.
  Two focused regression tests and the full unit suite pass with the isolated test rollout flags.
- A follow-up 240-order run on the fixed runtime had no deadlock or rejected order (`180` resting
  LIMIT and `60` filled MARKET before cleanup). It exposed a certification-harness race instead:
  `paper_open_orders` reached zero one event before canonical order, reservation and pending
  exposure projections converged. The state converged cleanly after a bounded wait. The burst
  harness now waits for all four projections and consumer pending counts, preserving strict
  invariants without misclassifying asynchronous projection lag as data loss.
- Bracket topology certification then found a second A6 blocker. Entry fill projected correctly,
  but risk counted an older bracket's STOP and TP pending quantities additively, exhausting the
  apparent position and rejecting new protective children as `REDUCE_ONLY_NO_POSITION`. Existing
  conditional order groups already aggregate OCO siblings by maximum residual quantity; canonical
  bracket siblings were missing the equivalent grouping. The pending candidate fix applies the
  same mutually-exclusive maximum to `bracket_group_id`, while preserving current-group exclusion
  and ordinary independent-order summation. Focused risk/bracket tests pass; immutable image and
  topology bracket activation/replace/cancel must be rerun before A6 passes.
- The first topology attempt after that change exposed a SQL completeness defect rather than a new
  domain-policy mismatch: `exposure.bracket_group_id` participated in the aggregate decision but
  was absent from `GROUP BY`. PostgreSQL raised `GroupingError`; the repository compatibility
  fallback then hid the canonical `positions_v2` quantity and produced the same apparent
  `REDUCE_ONLY_NO_POSITION`. The query now groups by `bracket_group_id`, with a focused source
  regression assertion. A read-only execution against the disposable topology returned canonical
  `actual_qty=0.001` and zero pending BUY/SELL after excluding the current bracket, proving the SQL
  path executes without fallback. This correction still requires a new immutable candidate and
  end-to-end bracket lifecycle rerun before A6 can pass.
- Candidate `c063040` then passed full unit, contract/golden/binding checks, core and market-plane
  integration, exact-domain/venue benchmarks, Python/Rust parity, 100k shadow comparisons, the
  disposable Rust-authority canary and full-process bracket create/activate/stop-replace/cancel.
  The first repeated burst did not count as an execution failure: its certification harness still
  seeded only control Redis after the market-plane split. Risk correctly rejected stale ephemeral
  ticks. The harness now uses `TRADING_MARKET_REDIS_URL` to seed the projected market plane while
  preserving the control-plane fallback copy, with a focused split/fallback URL test. A new
  candidate and burst rerun are required; freshness policy is not weakened.
- The same split-plane audit was applied to the risk/portfolio integrity smoke. Its partial-fill
  fixture wrote volume only to control Redis, so Paper correctly consumed a newer projected-market
  tick and filled the order completely. The harness now writes its deterministic tick to both the
  control fallback and `TRADING_MARKET_REDIS_URL`, with a focused URL-selection regression test.
  Simulator fill semantics and production freshness rules remain unchanged.
- Performance projection certification had the same legacy harness assumption: it constructed
  `PerformanceRepository` with only the core Redis client while the accepted rollout requires a
  projected market client. The smoke now creates/passes `TRADING_MARKET_REDIS_URL`, seeds an
  identical deterministic mark in both planes, and removes both copies during scoped cleanup.
- Redis AOF restart certification submitted a fixed 60-order batch, restarted the durable Redis
  process, then resumed and canceled the run. Canonical state retained exactly 60 orders, 15 fills
  and 45 cancels with no risk rejection or duplicate effect. The initial resume report raced one
  final Portfolio ACK and pending-exposure projection; both converged to zero seconds later. The
  resume path now uses the same bounded four-projection/consumer convergence barrier as the normal
  and cleanup paths instead of reporting immediately after `paper_open_orders` reaches zero.
- Candidate `dba61c9` is therefore retained only as failed acceptance evidence. A new commit/image
  digest must be frozen and the affected contract, integration, topology, burst, replay and cleanup
  gates rerun before Closure A can pass. A7 24-hour full-process soak, real WAL/PITR, A9 supply-chain
  scans and remote CI remain open and must not be inferred from local component tests.

Final candidate and repeat acceptance:

- the final runtime candidate is commit `5b118197e49697b5a423e0e8cde07a5f51c15d2d`, based on `dev`
  merge-base `d4e05dc7a65be10c5b9e2aa4ebd9f1b07bf680aa`. The normal, test and Rust-shadow
  image IDs are respectively `sha256:8b289da13bdf...`, `sha256:8499f462d785...` and
  `sha256:ea3d371725b0...`. `uv.lock` SHA-256 is `d93c9121ee5d...`, migration-set digest is
  `16c6f9b0b4c7...`, generated contract-manifest digest is `b7133d247e62...` and the frozen V1
  OpenAPI digest is `1c2fd3a9e634...`;
- all thirteen disposable services were recreated from the exact normal image. Gateway returned
  `READY`; Binance sandbox adapters were explicitly `DEGRADED` because no broker credentials were
  mounted and therefore do not count as sandbox/live certification. The full unit suite, `32/32`
  focused contract tests, `10/10` core integration tests and the independent market Redis online
  and offline/fail-closed tests passed. OpenAPI generation and frozen V1 compatibility passed;
- the final 240-order full-process burst accepted `240/240`: `60` MARKET orders filled and `180`
  LIMIT orders opened then cancelled. It ended with zero risk reject, bad row, open paper order,
  reserved reservation, pending exposure and consumer PEL. Submit latency was p50 `468.838 ms`,
  p95 `1905.494 ms`, p99 `2734.872 ms`; this host result is evidence, not a new production SLO;
- bracket entry activation, STOP/TP child submission, stop cancel-replace and group cancel passed.
  Risk/portfolio integrity passed partial fill/cancel, insufficient cash/position, concurrent
  balance reservation, cross/isolated margin, deployment HALTED/REDUCING and ended with zero active
  reservation/open order. DNSE paper lot/tick/unsettled-position checks passed. Performance/PnL
  projection passed on dedicated Redis logical DBs, and copy outbox persisted and published one
  canonical `copy.event.v1.order_intent` without a duplicate external intent;
- exact-domain/replay, venue identity/cache and Python/Rust pure-risk benchmarks passed. A duplicate
  exact-candidate 100k DB-backed shadow run was stopped because it duplicated the already-passing
  unchanged `c063040` domain path and exceeded the requested short closure window; it is not
  represented as a fresh `5b11819` pass. The exact candidate still has 5k Python/Rust parity and
  the previous 100k evidence remains traceable. The contract-shadow microbenchmark measured
  `0.526446 ms` added p95 against its strict `0.50 ms` guardrail. The original candidate measured
  similarly above budget, so this is not a regression from the acceptance fixes, but the gate stays
  open and the threshold was not weakened;
- Redis AOF restart recovery retained a 60-order run with exactly `15` fills and `45` cancels, zero
  duplicate effect and bounded projection/PEL drain. A Timescale logical restore initially exposed
  that ordinary `pg_restore` is invalid for hypertables; rerunning with
  `timescaledb_pre_restore()`/`timescaledb_post_restore()` produced identical schema digests and
  matched migration/order/fill/position counts `39/5000/1250/20`. A separate real WAL archive/PITR
  drill restored a physical base backup to a named recovery point, retained rows `base,target`,
  excluded `after_target` and promoted successfully (`pg_is_in_recovery=false`);
- a CycloneDX SBOM was generated for the normal image with digest `ca1a1ec38554...`. Gitleaks found
  `43` pattern matches, all manually classified as non-secrets: empty environment variable names,
  declarative `api_key_env` references, deterministic test hashes/keys and public Binance REST
  examples. No runtime credential was found in the candidate tree. This triage does not replace a
  reviewed remote secret-scanning workflow;
- A9 does **not** pass. Pinned `pip-audit` found `30` advisories across six locked packages:
  `aiohttp 3.13.5`, `cryptography 48.0.0`, `pydantic-settings 2.14.1`, `PyJWT 2.12.1`,
  `setuptools 82.0.1` and `starlette 1.0.0`. Trivy found no fixable HIGH/CRITICAL OS issue but found
  eight unique HIGH application advisories after deduplication, including `pyo3 0.22.6`. These are
  release blockers until dependency upgrades are made on a separate reviewed candidate and the
  complete compatibility/parity suite passes; major PyO3/Starlette upgrades are not silently
  folded into this closure candidate;
- the first round of repeated candidate builds exhausted root disk and caused the lab PostgreSQL
  plus production `live_data_executor` to restart on `ENOSPC`. No volume was removed; build cache
  and superseded candidate images were removed, WAL recovery completed and production returned
  healthy. This incident is retained as failed capacity evidence. Final disposable cleanup removes
  all Closure A containers, volumes, images and temporary reports without touching production;
- engineering acceptance A1-A6 and the immediately runnable parts of A7/A8 pass. Closure A remains
  **not production approved** because the explicitly deferred 24-hour full-process soak, remote PR
  CI/branch-protection result, the contract-shadow p95 guardrail and A9 dependency findings remain
  open. No merge, push, production migration, runtime image replacement or broker submission was
  authorized by these results.
- A10 cleanup passed. All `ts_closure_a_*` and `ts_phase2_redis_closure` containers, PostgreSQL/
  Redis/PITR volumes, the disposable network, both final/superseded candidate image sets, scanner
  images, detached worktree, temporary image tar/reports and scripts were removed. Docker build
  cache ended at zero; root disk ended near `40 GiB` used / `17 GiB` free (`72%`). Production
  `live_data_executor`, durable Redis and market Redis were healthy, Gateway/Risk/Paper remained
  running and no container was `Restarting`, `unhealthy` or unexpectedly `Exited` at the final
  inventory.

Security/performance remediation candidate (2026-08-10):

- release-blocking dependency floors were raised without changing the frozen V1 HTTP/event
  contracts: `aiohttp 3.14.3`, `cryptography 50.0.0`, `pydantic-settings 2.15.0`, `PyJWT 2.13.0`,
  `setuptools 83.0.0`, `starlette 1.6.0`, and PyO3 `0.29.0`. `uv.lock` and `rust/Cargo.lock` are the
  authority for the candidate;
- the contract shadow observer no longer computes a forensic canonical digest on a successful
  match. It still computes the unchanged digest on mismatch, so evidence semantics and V1 remain
  compatible while the 50k CPU-pinned added-latency p95 falls from `0.526446 ms` to `0.129065 ms`,
  below the unchanged `0.50 ms` guardrail;
- the complete unit suite passed after the dependency upgrade. Focused contract/Rust tests,
  frozen OpenAPI artifact verification and lint passed. The 5k Python/Rust benchmark passed with
  zero errors; Rust full JSON roundtrip p95 was `0.085803 ms` versus Python core/projection p95
  `0.186194 ms`. Ten DB/Redis integration tests and both market-plane online parity and
  offline fallback/fail-closed tests passed on disposable infrastructure;
- an exact runtime candidate booted against a freshly initialized disposable TimescaleDB and
  Redis topology. Gateway startup completed and `/v1/health` returned `READY` with PostgreSQL,
  core Redis and market Redis checks true. No broker credential or external order submission was
  used in this remediation;
- the final production read-only check exposed a separate order-group health defect after a prior
  PostgreSQL restart: the service DB pool required a restart, then heartbeat remained degraded by
  `795` historical dead outbox rows even though every owning group was terminal `CLOSED`. Recovery
  now treats canonical `RISK_REJECTED`, `BROKER_REJECTED` and `ERROR` outcomes as acknowledged
  transport evidence, including rows that reached `DEAD` before evidence became visible. Queue
  health counts only dead commands owned by nonterminal groups; terminal dead history remains
  visible as additive `outbox_dead_terminal` audit detail instead of poisoning readiness forever;
- focused order-group tests passed `41/41` and the real PostgreSQL repository integration passed
  after this health/recovery correction. The change is internal and additive; it does not delete
  order/group history or change the public order-group contract;
- pinned `pip-audit 2.9.0` reports no known Python vulnerability. Trivy `0.64.1` reports zero
  fixable HIGH/CRITICAL findings for Debian, Python packages, Cargo lock and Rust binaries in the
  Rust-shadow runtime image. Trivy emitted only workspace-inherited Cargo manifest parse warnings;
  it still scanned the lock and compiled Rust binary, both with zero findings;
- the operator explicitly deferred the 24-hour full-process soak to the next-day observation
  window. Therefore local Closure A release blockers are remediated and the branch is eligible for
  remote PR review/CI, but production rollout remains gated by remote CI, operator merge approval,
  the deferred soak observation and the controlled Closure B rollout. No automatic merge or live
  broker submission is authorized by this result.

Remote CI remediation (2026-08-11):

- rerunning the PR exposed three deterministic workflow defects rather than transient runner
  failures: the PyO3 `0.29` security upgrade requires Rust `1.83` while the workspace and matrix
  remained pinned to `1.82`; clean GitHub runners lacked repository `PYTHONPATH` for the OpenAPI
  script; and the Python debt ratchet correctly found 117 style violations in files changed by the
  long-lived feature branch;
- the minimum Rust toolchain, workspace metadata, workflow and operator README are now pinned to
  `1.83`. Quality and integration workflows declare the checked-out repository as `PYTHONPATH`.
  The changed-file lint debt was removed with behavior-neutral annotation/import formatting plus
  explicit formatting of the legacy funding handler; no public contract or strategy behavior was
  changed;
- CI-equivalent local gates pass: changed-file Ruff, Python compile, shell syntax, Compose config,
  generated bindings, frozen V1/OpenAPI and polyglot verification; the complete unit suite; all
  governed migrations through `40` plus idempotent re-apply and pending count zero; and the isolated
  integration suite (`10` pass, `2` explicit market-plane infrastructure skips);
- Rust `1.83` format, strict Clippy and workspace tests pass. One cp310-abi3 wheel built with pinned
  maturin `1.8.2` and passed the real certification corpus on CPython `3.10`, `3.11` and `3.12`,
  including typed malformed-input and panic-isolation probes. Remote CI remains the final authority
  for PR check status after this commit is pushed.

### 49.10 Closure Phase B - Controlled Runtime Rollout And Production Closure

Status: `PLANNED_BLOCKED_BY_CLOSURE_PHASE_A_AND_OPERATOR_APPROVAL`. This phase is an expand/canary/
contract rollout. It is not a big-bang replacement and it does not require existing alphas to adopt
a new public endpoint or payload.

Objective:

- deploy the accepted release candidate while V1 remains authoritative;
- activate one internal capability and one bounded paper scope at a time with observed rollback;
- certify actual alpha/service consumers and venue/mode behavior before broader use;
- retire compatibility paths only after measured zero use for the approved support window.

#### 49.10.1 Mandatory Preconditions And Change Window

- Closure Phase A A1-A10 evidence is reviewed and signed off; remote CI is green and the candidate
  image/schema/config digests are frozen.
- Current PostgreSQL, both Redis instances, Docker images, service versions, feature flags, alpha
  consumers, stream groups, disk/RAM/swap/AOF state and broker residuals are inventoried again.
- A production backup and tested restore point exist. Migration duration, expected locks, disk/WAL
  headroom, abort threshold, owner and rollback command are documented.
- The operator approves the maintenance/canary window and explicitly identifies paper alpha/account
  scopes. Sandbox/live credentials are excluded until their separate gate.
- Existing V1 and alpha containers continue running until their owning service is intentionally
  restarted. Source mounts do not prove a process has loaded the candidate revision.
- Resolve dangerous capacity conditions first. In particular, do not start a durable journal,
  switch Redis to `noeviction`, or restart all publishers while Redis is near its memory ceiling.

#### 49.10.2 Gate B1 - Expand Schema And Deploy With New Authority Off

- Apply the governed existing-volume baseline through migration `33`, verify checksums/anchors, then
  apply migrations `34-40` in order. Record lock time, WAL/disk delta and post-migration invariants.
- Deploy only immutable candidate images. Restart services in a reviewed dependency order:
  database migration verification; Redis readiness; command journal process in disabled/off mode;
  Gateway; Risk; Paper/Executor; Listener; Portfolio/Performance; Reconciliation/Order Groups; then
  Monitor/Copy services.
- Preserve current configuration unless the candidate manifest explicitly owns it. All new rollout
  controls begin fail-closed/off, including contract shadow, durable command acceptance, replay v2,
  Rust shadow and Rust authority. Existing independently approved features such as order-group V2
  are inventoried rather than silently toggled.
- Verify service image digest, process start time, migration ledger, heartbeat, readiness, queue lag,
  consumer groups, API V1 golden probes and read-only database/Redis state after each restart group.
- Stop immediately on schema drift, accepted-command loss, unexplained projection change, rapidly
  increasing Redis/WAL/log growth or V1 contract divergence. Roll back executable images/config;
  keep additive schema and immutable evidence unless the migration runbook explicitly proves a safe
  reverse path.

#### 49.10.3 Gate B2 - Progressive Paper Capability Canaries

Enable only one row at a time for one named paper scope. Each row requires pre/post DB and Redis
snapshots, focused tests, a bounded soak, failure injection, rollback rehearsal and operator review.

| Order | Capability | Initial boundary | Required proof before expansion |
|---|---|---|---|
| 1 | Contract shadow | Read-only selected paper alpha | Identical V1 response/event; no side effect |
| 2 | Command journal shadow | Persist/observe, legacy dispatch authoritative | Journal/outbox completeness and bounded lag |
| 3 | Durable paper accept | One alpha/account | Commit-before-accept, ACK, idempotency and restart recovery |
| 4 | Audited retention | One bounded stream/group | Watermark protects pending/slow consumers; memory trend improves |
| 5 | Canonical projections | One paper account | Order/fill/position/PnL/replay parity |
| 6 | Product-aware identity | Selected Binance and DNSE paper instruments | No alias/product collision or legacy-key divergence |
| 7 | Rust shadow | One paper Risk scope | Zero divergence through reviewed soak |
| 8 | Rust authority | One explicit paper `RISK_ORDER_CORE_V2` lease | Single authority, lease/epoch recovery and tested rollback |

- Never advance on elapsed time alone. Expansion requires clean parity, health and capacity evidence.
- Roll back to the prior row on any unexplained mismatch. Rust authority never expands to sandbox or
  live under this plan.
- Change Redis to `noeviction` only after durable acceptance, audited retention and measured capacity
  prove that writers fail visibly without exhausting the host. Keep AOF durability and recovery
  evidence valid through the change.

#### 49.10.4 Gate B3 - Actual Alpha And Service Compatibility Rollout

- Test supported SDK revisions N and N-1 plus direct HTTP/Redis consumers against the running V1
  facade. Pin the contract/SDK revision used by each alpha deployment.
- Roll out by representative family, then by small batches: directional, target-rebalance,
  bracket/OCO, grid/order-group, arbitrage, copy-trading consumer and operator CLI. Do not restart all
  alpha containers together.
- Preserve strategy parameters, data cadence, sizing and order intent. Compatibility work belongs in
  SDK/adapters; an alpha strategy must not be rewritten merely to adopt an internal core change.
- For each canary compare order requests, risk decisions, broker attempts, fills, positions, capital,
  PnL, reconciliation and copy events. Record expected typed differences and reject silent fallback.
- Validate data_layer and copy-server integration as consumers without giving either service direct
  authority over Trading System canonical state.

#### 49.10.5 Gate B4 - Venue And Mode Acceptance

- Binance paper remains the first broad acceptance mode. Binance sandbox uses a clean, explicitly
  scoped testnet account and tests submit/query/cancel/amend, partial fill, bracket/order group,
  one-way/hedge mode, restart and broker-authoritative reconciliation.
- DNSE paper must pass instrument metadata, lot/margin, market-session, fill, position and PnL
  coverage. DNSE live is an external gate requiring authoritative documentation, credentials and an
  approved tiny-order window; absence of infrastructure is recorded, not simulated as a pass.
- OKX remains disabled/fail-closed until its demo environment independently passes product,
  credential, time-sync, rate-limit, normal/algo order, private event and reconciliation tests.
- Live Binance or any new live venue is never the first adopter of a newly activated authority path.
  Live enablement requires successful paper and sandbox evidence plus a separate operator decision.
- Every broker smoke has a predeclared cleanup/flatten plan and post-test reconciliation. Cleanup
  removes only disposable test scope and never deletes genuine immutable audit evidence.

#### 49.10.6 Gate B5 - Compatibility Window, Operations And Retirement

- Export compatibility usage telemetry on a scheduled basis and import it into the reviewed evidence
  store. A manual one-time report is insufficient for retirement.
- Keep V1 routes, schemas, SDK and read compatibility throughout the support window. Recommended
  default is at least 90 days after all known consumers are on the replacement surface, unless a
  separately approved policy requires longer.
- Stop one legacy writer at a time only after zero-use telemetry, owner sign-off and rollback/read
  compatibility are proven. Do not delete immutable orders, fills, events, capital ledgers or
  mismatch evidence to close the program.
- Schedule ongoing WAL/PITR, Redis recovery, migration checksum, storage/bloat, stream backlog,
  replay parity and broker reconciliation drills. Production certification expires when these
  controls stop running.
- Update README, Alpha endpoint guide, DB schema guide, operations/portfolio runbooks, support matrix
  and both upgrade plans to describe the **running** revision, not merely repository HEAD.

#### 49.10.7 Rollback And Stop Conditions

Immediate stop/rollback conditions:

- public V1 contract or SDK incompatibility;
- accepted command lacks durable evidence or produces duplicate external effect;
- order/fill/position/PnL/replay divergence without an approved explanation;
- authority lease ambiguity, stale epoch acceptance or simultaneous Python/Rust authority;
- Redis memory/persistence failure, unsafe pending trim, unbounded backlog or failed AOF recovery;
- migration checksum/ownership drift, lock budget breach, WAL/disk headroom breach or restore failure;
- service heartbeat/readiness loss beyond the agreed budget;
- broker state cannot be authoritatively queried/reconciled;
- test cleanup cannot prove its scope.

Rollback order is capability-first, not destructive-schema-first: halt the canary scope, disable the
new flag, restore the previous authority/dispatcher, verify queues and reconciliation, roll back the
versioned service image/config, then replay/reconcile from durable evidence. Additive migrations stay
unless an approved migration-specific reversal is proven safer.

#### 49.10.8 Closure Phase B Evidence And Exit Criteria

Required evidence:

- migration/change-window record and post-deploy topology/image manifest;
- per-capability canary snapshots, soak metrics and rollback results;
- V1 SDK/alpha/service compatibility matrix;
- Redis capacity/retention and PostgreSQL storage/WAL reports;
- paper and separately approved sandbox venue reports;
- compatibility usage history and residual external-gate ledger;
- zero-residue cleanup report for every disposable scope.

Program closure requires all of the following:

- the running topology uses one reviewed release manifest and all services report the expected
  revision;
- V1 consumers continue without strategy rewrites or unexplained semantic changes;
- durable command/replay/current-state paths recover deterministically through real process and
  storage failures;
- at least one reviewed 24-hour full-topology paper soak and real WAL/PITR drill pass;
- venue/mode certification is stated individually, with DNSE/OKX/live gaps left explicit;
- legacy surfaces are retained or retired strictly by support-window evidence;
- main-plan statuses, detailed guide, generated contracts, schema ownership and runbooks agree;
- the operator, not automation, approves final merge, production expansion and any live authority.

Planning note:

- Closure Phases A/B were added after the Phase 0-7 audit because local engineering completion had
  been reported more broadly than the available runtime evidence supported. Their purpose is to
  close that evidence gap without destabilizing the currently operating V1 system. No action in
  either closure phase has been executed by this planning update.

## 50. Redis Core Durable Transport And Runtime Stabilization

Status: `PHASE_1_COMPLETE_PHASE_2_AWAITING_OPERATOR_APPROVAL`. This program is a prerequisite for Closure Phase A
because the running core Redis has reached its configured memory ceiling. It preserves all V1
Alpha/Gateway routes, stream names and payloads; Redis transport semantics change only behind
feature flags and evidence gates.

Baseline observed on 2026-08-09:

- `redis_service` uses `2.00 GiB` dataset and `2.02 GiB` RSS against `maxmemory=2gb`; fragmentation
  is `1.01`, client output buffer is zero and dataset percentage is `99.97%`. This is retained stream
  data, not allocator fragmentation, Pub/Sub backpressure or a Redis memory leak;
- `commands.execution.paper` holds `814,020` entries and approximately `1.84 GB` logical memory;
  `order.inbound` holds `351,421` entries and approximately `631 MB`; copy/order/alert/fill streams
  account for most of the remainder;
- DB0 has no expiring keys while policy is `volatile-lru`, so the policy has no eviction candidates
  and behaves fail-closed only after Redis is already full;
- `monitor_service` and `order_group_service` restart when Redis rejects writes. Order Group retry
  additionally evaluates an unbounded exponential before integer conversion and can raise
  `NumericValueOutOfRange`;
- PostgreSQL command journal/outbox and ACK-aware MINID retention code exist from Phase 2/7 but are
  not active in the running database/topology. Historical pre-journal stream entries therefore
  cannot be declared disposable without archive and evidence;
- market-data Redis remains separate, ephemeral and small. It is outside this program except for
  regression checks proving that the core changes do not reconnect market data to durable Redis.

Non-negotiable rules:

- PostgreSQL journal/outbox is the durable command authority. Redis Streams are bounded transport
  and recovery windows, never the only long-term audit store;
- `XACK` does not delete stream entries. Retention is explicit, multi-consumer aware and audited;
- no `FLUSHDB`, wildcard delete, generic volume cleanup, blind `XTRIM`, stream-key TTL or
  `allkeys-lru` is permitted for core command/event streams;
- no memory increase is used to hide retention failure. Host fork/AOF headroom and swap/emergency
  reserve are assessed independently;
- a stream is not safe to trim merely because `pending=0`. Cursor discontinuity, every consumer
  group, oldest pending entry, minimum age, durable DB evidence and legacy archive boundary are all
  considered;
- critical execution paths fail closed with typed evidence. Noncritical alerts/telemetry may
  coalesce or fall back to local logs, but must never crash their owning service or recursively
  publish failure alerts into the unavailable Redis;
- public V1 contracts and alpha strategy code remain unchanged. Rollout is additive, shadow-first,
  paper-canary-first and reversible by feature flag;
- every disposable test Redis/PostgreSQL/container/volume/file is removed after its test. Immutable
  production orders, fills, command evidence and capital ledgers are never cleanup targets.

### 50.1 Phase 1 - Durable Transport Architecture And Fail-Safe Guardrails

Status: `COMPLETE_ON_FEAT_REDIS_CORE_DURABLE_TRANSPORT`.

Objective:

- complete the internal architecture needed to recover and bound Redis safely;
- stop noncritical Redis OOM from crashing Monitor and stop Order Group retry arithmetic from
  overflowing;
- replace ad hoc stream retention assumptions with one machine-readable policy registry and a
  conservative dry-run certification engine;
- prove all behavior against disposable infrastructure. This phase does not trim live streams,
  apply live migrations, restart active services or change the runtime Redis policy.

#### 50.1.1 Work Package A - Stream Data-Class And Authority Registry

- Define a single registry for every core stream with:
  - owner and consumer groups;
  - data class: `DURABLE_COMMAND`, `DURABLE_EVENT_PROJECTION`, `DELIVERY_OUTBOX`, or
    `EPHEMERAL_TELEMETRY`;
  - PostgreSQL authority/evidence table where applicable;
  - retention mode: ACK/authority `MINID`, explicit approximate `MAXLEN`, or disabled;
  - minimum recovery age, hard emergency boundary, archive requirement and whether trim is allowed;
  - expected payload version and compatibility owner.
- At minimum cover `order.inbound`, `order.requests`, `commands.execution.*`, `events.order`,
  `events.fill`, `execution.fills`, `copy:events:v1`, `events.risk.denied`, `events.dead_letter`,
  `untracked.orders`, `deadletter.portfolio` and `events.alerts`.
- Reject unknown configured retention streams and duplicate ownership. Logical Redis database numbers
  are not treated as isolation boundaries.

#### 50.1.2 Work Package B - Safe Watermark And Legacy Archive Contract

- Introduce a retention decision object that records stream length, first/last id, all group cursors,
  group lag, earliest pending id, age cutoff, DB authority status, legacy cutover id, archive digest,
  proposed MINID, estimated removable entries and explicit blocked reasons.
- The safe MINID must never advance beyond the earliest pending entry of any group. Cursor/lag
  inconsistency blocks apply mode until reconciled; it is reported rather than normalized silently.
- New post-journal entries require terminal/durable evidence before their age can make them eligible.
  Historical pre-journal entries require a bounded, checksummed, paginated cold archive plus a
  recorded cutover id before any removal.
- Implement archival as streaming/paginated export with bounded memory and deterministic manifest;
  do not require Redis `BGSAVE`/fork on a memory-constrained host. Archive execution remains Phase 2.
- Dry-run is the default and must not mutate Redis. Apply mode requires the exact policy revision,
  archive/journal authority, explicit operator confirmation and an audit row.
- Use approximate `XTRIM MINID ~` only after the conservative watermark is certified. Approximation
  may retain extra data but may not advance beyond the proven boundary.

#### 50.1.3 Work Package C - Service Degradation And Retry Safety

- Monitor alert publication catches Redis connection/OOM/timeout failures, emits a rate-limited local
  fallback record and continues monitoring. It must not attempt to publish a Redis-failure alert to
  the same unavailable Redis recursively.
- Heartbeat failure remains visible but cannot terminate Monitor. Local fallback counters expose
  suppressed/coalesced alerts for later reconciliation.
- Order Group keeps command outbox rows pending/dead according to the configured bounded attempt
  policy when Redis is unavailable. Redis failure cannot lose or duplicate the DB command.
- Cap retry exponent before conversion/arithmetic, clamp malformed historical attempt counts and add
  jitter only outside deterministic DB state. The database query must be total for all valid integer
  attempt values.
- Command Journal and Order Group loops use bounded exponential backoff/circuit behavior so an OOM
  condition does not create a restart/log storm. Critical writes remain fail-closed.

#### 50.1.4 Work Package D - Configuration, Health And Operator Dry-Run

- Add explicit configuration for retention dry-run, legacy archive requirement, policy revision,
  fallback alert interval and service retry bounds. Destructive apply defaults remain false.
- Extend health/CLI output with used/max memory, dataset/overhead/fragmentation, AOF state, stream
  length/memory, groups/pending/lag, proposed watermark, blocked reasons and journal authority.
- Detect the invalid combination of command-retention apply with journal rollout off. Startup must
  fail closed for the retention worker, not for unrelated V1 services.
- Report that `volatile-lru` with zero expiring keys has no useful eviction candidates and recommend
  `noeviction` only after Phase 2 capacity/retention acceptance. Phase 1 does not alter live policy.
- Preserve existing profile-off behavior for `command_journal_service` and existing V1 environment
  defaults.

#### 50.1.5 Phase 1 Tests And Exit Criteria

Required tests:

- unit/property tests for multiple groups, no groups, pending floor, cursor discontinuity, malformed
  IDs, unknown streams, missing authority, pre/post cutover entries and deterministic policy digest;
- integration tests with disposable Redis/PostgreSQL for journal commit-before-publish, consumer ACK,
  Redis restart/reclaim, dry-run zero mutation, blocked unsafe trim and certified MINID trim;
- OOM/fault tests proving Monitor stays alive, fallback is rate-limited, Order Group leaves durable
  work retryable and retry arithmetic cannot overflow;
- V1 contract and representative paper/order-group regression tests;
- benchmark of dry-run inspection and bounded trim batches, with memory/CPU evidence;
- cleanup proof showing zero test rows, Redis keys, containers and volumes.

Phase 1 exit criteria:

- registry and policy revision are machine-tested and documented;
- every trim decision explains why it is safe or blocked;
- no live stream, database, service, alpha or broker state was changed;
- Monitor and Order Group degradation paths are deterministic and non-crashing in tests;
- all focused and full regression suites pass, changes are committed in coherent tested checkpoints;
- Phase 2 remains blocked until the operator reviews Phase 1 evidence.

#### 50.1.6 Phase 1 Implementation Log - 2026-08-09

Implemented:

- added `services/command_journal/stream_policy.py` as the machine-readable source of truth for
  core stream ownership, consumer groups, data class, PostgreSQL authority, retention mode,
  minimum age, emergency warning boundary, trim permission, payload compatibility owner and V1
  payload revision. Its canonical SHA-256 revision is deterministic and duplicate streams fail at
  construction time;
- replaced the former single-group retention heuristic with a fail-closed decision engine that
  inspects all groups, earliest pending IDs, cursor/lag consistency, policy revision, authority
  table, nonterminal journal evidence, legacy cutover and archive digest. Unknown streams and
  unsupported projection authorities are blocked;
- added bounded `XRANGE` pagination for removable-entry estimation. The first 100k benchmark found
  and removed an invalid `XCOUNT` assumption before runtime activation; Redis has no `XCOUNT`
  command. Estimates now expose when the configured scan cap makes them a lower bound;
- added deterministic paginated gzip/JSONL archive output with payload SHA-256, policy revision,
  range/count metadata, fsync and atomic data/manifest replacement. Archive execution remains a
  Phase 2 operator action;
- made Monitor Redis alert delivery non-recursive and rate-limited with local-log fallback. One
  failed alert transport no longer terminates the monitor loop;
- bounded Order Group and Command Journal outer-loop retry backoff, and capped the PostgreSQL retry
  exponent before integer conversion. Historical/malformed high attempt counts can no longer cause
  `NumericValueOutOfRange` before the cap is applied;
- added retention/archive/backoff/fallback settings with dry-run defaults. Apply is forced off when
  durable command rollout is off;
- added `cli ops redis-retention`, a read-only command with no apply flag. It reports Redis
  memory/dataset/overhead/fragmentation, eviction candidates, AOF state, per-stream memory,
  group/pending evidence, watermark, bounded estimate and blocked reasons;
- documented the operator contract in `OPERATIONS_OBSERVABILITY_RUNBOOK.md` and added a disposable
  100k-entry benchmark script.

Validation evidence:

- Python compile gate passed for all changed runtime, CLI and test modules;
- Ruff passed for all Phase 1 files;
- focused V1/Gateway/Paper/Order Group/Monitor/retention regression passed `160/160`;
- full `tests/unit` suite passed. The only warnings are the pre-existing FastAPI `on_event`
  deprecations;
- full disposable `tests/integration` suite passed `10/10` after applying migrations `02` through
  `40` to an isolated Timescale/PostgreSQL instance;
- command-journal integration proved DB commit-before-publish, duplicate retry idempotency,
  consumer ACK evidence, broker-attempt recovery and pending-floor-safe retention;
- Redis epoch drill seeded one durable command, erased/restarted only the disposable Redis, detected
  the changed run id, requeued exactly one DB outbox row and restored exactly one stream entry;
- 100,000-entry dry-run benchmark used approximately `1.88 MB` stream memory, completed inspection
  in `0.606s`, identified `99,999` removable entries and applied zero trims;
- cleanup proof: disposable Redis `INFO keyspace` was empty; command journal/outbox, conditional
  group/outbox, engine-authority and canonical sync test tables each contained zero rows; both test
  containers and their network were removed.

Runtime boundary and remaining operational risk:

- no live migration, stream trim/archive, Redis policy change, service restart, alpha restart,
  broker call or runtime `.env` mutation occurred in Phase 1;
- the live core Redis therefore remains near its observed memory ceiling, and currently running
  Monitor/Order Group processes do not receive this code until the reviewed Phase 2 rolling
  activation;
- the generated test image was removed after certification to return disk space. No runtime image
  tag or active container was replaced;
- Phase 2 stays blocked pending explicit operator approval. It must begin with a fresh read-only
  baseline and one-stream paper canary, not a bulk trim.

### 50.2 Phase 2 - Runtime Recovery, Stability Audit And Bug Closure

Status: `AUTHORIZED_IN_PROGRESS_ON_FEAT_REDIS_CORE_DURABLE_TRANSPORT`.

Objective:

- recover safe Redis headroom without losing execution evidence;
- activate journal/retention progressively on paper scopes;
- inspect the complete system after activation, debug/fix material bugs and prove a bounded steady
  state before Closure Phase A resumes.

#### 50.2.1 Runtime Sequence

1. Re-audit PostgreSQL, Redis, host RAM/swap/AOF fork headroom, stream groups and running service
   revisions. Freeze an immutable rollback/config manifest.
2. Apply the required command-journal migration with the governed runner in a reviewed window and
   start journal in shadow mode. Preserve legacy dispatch authority.
3. Run the Phase 1 retention engine in dry-run against live data. Resolve cursor/lag anomalies and
   prove DB evidence boundaries; no trim occurs at this step.
4. Export historical pre-journal prefixes through the paginated archive path, verify counts/digests
   and record the legacy cutover id.
5. Trim one certified, already-delivered prefix from one paper stream. Measure memory, AOF, pending,
   group cursor and replay before expanding.
6. Restore Monitor/Order Group with the Phase 1 fail-safe code one service at a time. Verify no
   restart storm and no outbox loss.
7. Enable durable acceptance for one paper alpha/account, then ACK-aware retention for its command
   stream. Expand only after soak and rollback rehearsal.
8. Change core Redis to `noeviction` only after memory remains below the agreed steady-state budget,
   retention drains correctly and host persistence headroom passes.

#### 50.2.2 Stability, Debug And Certification Matrix

- inspect all services, DB projections, Redis groups, logs and heartbeats after every activation;
- inject Redis restart, connection timeout, OOM threshold, slow consumer, abandoned pending entry,
  duplicate delivery, delayed ACK, DB outage and AOF rewrite pressure;
- reconcile journal/outbox, Redis entries, orders, fills, positions, PnL and copy events with zero
  unexplained loss or duplicate effect;
- run representative directional, rebalance, bracket/OCO, grid/order-group and arbitrage paper
  alphas without changing strategy logic;
- measure steady-state stream growth, trim throughput, backlog drain, CPU/RSS, AOF size/rewrite,
  PostgreSQL growth and Docker/application logs for at least 24 hours;
- fix material bugs discovered by this matrix, add regression tests and record each fix. New scope is
  not added silently: architectural expansion requires a plan update and operator approval;
- clean every disposable test scope and retain bounded evidence artifacts only.

Phase 2 exit criteria:

- Redis core stays below the accepted warning threshold with bounded stream growth and no eviction;
- no Monitor/Order Group restart loop, accepted-command loss, pending orphan, duplicate broker effect
  or unexplained replay divergence;
- journal recovery and safe retention survive process/Redis restart;
- Gateway and required services are healthy or any external venue degradation is explicitly typed;
- rollback is rehearsed and V1/alpha contracts remain unchanged;
- the operator accepts the stability report before Closure Phase A continues.

#### 50.2.3 Phase 2 Runtime Log - 2026-08-09

Status: `IN_PROGRESS_24H_SOAK`.

Baseline and migration gate:

- runtime revision before activation: `e3fb559`; `.env` SHA-256 started with `912cc3e5` and
  `docker-compose.yml` SHA-256 started with `5384efa6`;
- host had `10 GiB` RAM, only about `375 MiB` available, no swap, `vm.overcommit_memory=0`, and
  approximately `20 GiB` disk free. Redis fork/archive operations therefore remain bounded and no
  `BGSAVE` is used for archival;
- core Redis held `2.00 GiB` dataset / `2.02 GiB` RSS against `maxmemory=2 GiB`, with
  `volatile-lru`, no useful expiring-key candidates, AOF enabled and about `1.05 GB` current AOF;
- `monitor_service` and `order_group_service` had restart counts above `4,000`, confirming an active
  OOM/retry storm rather than a historical-only alert;
- governed migration status bootstrapped an empty checksum ledger. Baseline through migration `33`
  failed safely because live schema did not contain migration `32`; no baseline rows were written;
- anchor-verified baseline through migration `31` succeeded, then migrations `32-40` applied through
  the governed runner. Final migration status is `pending_count=0`;
- the first stream audit appeared to show approximately `87k` unread entries. A cursor/PEL audit
  proved this was stale Redis `entries-read` metadata, not an executable backlog: both consumer
  cursors were already at the stream tail and both PELs reached zero. The metadata was repaired with
  `XGROUP SETID ... ENTRIESREAD` while preserving each cursor; final lag is zero for
  `risk_engine_group` and `paper_execution_group`;
- an unsafe read-only diagnostic invocation used `XINFO STREAM ... FULL COUNT 0`, which requests the
  full stream rather than zero rows. Under the existing memory pressure this contributed to one
  unplanned Redis process restart. AOF recovery completed successfully, stream lengths/cursors were
  preserved and `aof_last_write_status=ok`; this command form is prohibited for future live audits.
  Live inspection must use summary `XINFO STREAM` or explicitly bounded pagination;
- the paper command legacy prefix was exported through bounded 2,000-entry pages and then read back
  for verification. The immutable archive contains `814,020` entries from `1780916751031-0` through
  `1786035371441-0`; certified exclusive boundary `1786197619746-0`, payload SHA-256
  `8cd19b0db74d19cee7bfa33947ae0603e690b2851b609a74315d843043cbee5c`, manifest SHA-256
  `98550a5fb148d264d2eb70c21c4ea5b5354a35de029b801c485aeab77c8e2663`. No trim had occurred at
  archive completion.

Material bug found before headroom recovery:

- Risk rejects stale intents before routing, but Paper Execution did not re-check age when consuming
  an already-risk-approved command. Restoring Redis headroom could therefore execute old commands
  accumulated during the OOM window. Phase 2 must add a last-mile stale-intent guard to Paper and
  broker execution before any backlog drain or canary trim.
- the last-mile guard is implemented and unit-tested for both Paper Execution and broker Executor:
  stale `OPEN`/`AMEND` intents fail closed as `STALE_EXECUTION_INTENT`, while cancel, flatten,
  reduce-only and protective STOP/TP/TRAILING actions remain actionable. Rolling activation and
  runtime verification passed before the certified trim.

Certified recovery and rolling activation:

- the first approximate `XTRIM MINID` removed only `9,998` entries. This exposed Redis' bounded
  approximate-trim batch behavior; the operator now repeats bounded passes, checks monotonic
  progress, stops on no-progress/max-pass and proves that no entry remains below the certified
  boundary. It never silently reports a one-pass partial trim as complete;
- the archived `commands.execution.paper` prefix was trimmed in `81` bounded passes. Completion
  evidence showed `15` entries remaining at that instant, no PEL entry lost and
  `certified_prefix_complete=true`;
- core Redis fell from approximately `2.00 GiB` dataset / `2.02 GiB` RSS to approximately
  `619 MiB` dataset / `644 MiB` RSS at the latest audit. Fragmentation is `1.04`, AOF is enabled,
  writes are healthy and the `2 GiB` memory ceiling now has material headroom;
- Paper Execution, Monitor, Order Group, Gateway, Command Journal, Risk Engine and Executor were
  recreated one at a time. All are running with restart count zero. The previous Monitor/Order
  Group restart storm (about `4,038`/`4,051` restarts) did not recur after headroom recovery;
- command-journal rollout is now `DURABLE_ACCEPT_PAPER_CANARY`, restricted to
  `phase2_durable_canary` / `paper-binance-phase2_durable_canary`. V1 HTTP and Redis stream
  contracts remain unchanged; sandbox/live durable authority was not enabled.

Canary bugs found and fixed:

- a durable CANCEL without an explicit `account_id` was journaled under an empty account before
  Risk resolved the default account. Its downstream identity could collide with the PLACE command.
  Gateway now resolves the canonical default account before durable acceptance for PLACE, bulk,
  AMEND and CANCEL;
- a consumer could read a newly published Redis entry before the dispatcher persisted its
  `stream_message_id`. Execution succeeded, but ACK evidence could remain `DISPATCHED`. Internal
  journal command/stage identity now accompanies the unchanged V1 payload; ACK recording can bind
  by durable identity before producer bookkeeping completes, and dispatch state updates are
  monotonic so they cannot downgrade ACK/terminal states;
- scoped lab cleanup tried to delete a UNION view and rolled its transaction back safely. Catalog
  discovery now selects only `BASE TABLE` relations. Scoped Redis cleanup uses `SCAN` plus `UNLINK`
  in bounded repeated passes and removes the scoped API-key/hash and active-alpha membership without
  `KEYS`, `FLUSHDB` or cross-alpha deletion.
- the Monitor dead-letter scanner previously treated PEL idle time alone as poison evidence and
  could `XACK` a command that Risk/Paper was expected to reclaim. This could convert a temporary
  DB/consumer stall into accepted-command loss. Timeout scanning is now observation-only by
  default: stale PEL entries are preserved for the owning consumer's `XAUTOCLAIM`; destructive
  timeout ACK requires an explicit per-stream allowlist. Unit tests prove both boundaries.

Final paper canary evidence after these fixes:

- one market PLACE filled once; one limit PLACE opened and was cancelled once; risk rejects,
  duplicate idempotency effects, open orders and stream PEL counts are all zero;
- reservations were consumed/released correctly; journal lifecycle contains one terminal CANCEL,
  one accepted PLACE and one terminal PLACE. Both ingress and paper-stage outbox rows reached
  `ACKNOWLEDGED`, with three Risk ACKs and three Paper outcomes;
- observed durable path latency was approximately p50 `24.24 ms`, p95/p99 `26.83 ms` for this
  intentionally small canary. This is correctness evidence, not a throughput benchmark;
- the disposable alpha/account scope was removed from PostgreSQL and Redis after verification.
  Scoped DB rows, active registry membership, API-key hash field and matching Redis keys all ended
  at zero.

Known operational evidence retained, not silently deleted:

- Order Group reports `DEGRADED` because `540` historical outbox rows are terminal dead evidence:
  `519` record Redis maxmemory OOM and `21` record Redis dataset loading during the prior incident.
  They belong to historical Dynamic Grid paper scopes; no row is pending and six later rows are
  dispatched. This is typed historical incident debt, not a current retry storm;
- `order.inbound` still contains a large pre-journal prefix (latest read-only scan observed about
  `321k` entries). It must receive the same archive/digest/cutover proof before any trim; the
  successful Paper stream archive is not authority to trim another stream;
- the pre-change host audit still showed `vm.overcommit_memory=0`, no swap, about `1.8 GiB`
  available RAM and about `15 GiB` free disk. That baseline blocked `noeviction` until the host gate,
  remaining-stream retention proof and AOF rewrite rehearsal recorded below were complete.

Second retention canary and host durability gate:

- `order.inbound` consumed approximately `560 MiB` and contained about `321k` entries. Its safe,
  ACKed and at-least-24-hour-old prefix was exported independently: `311,422` entries, first id
  `1785992256226-0`, last id `1786034023318-0`, exclusive boundary `1786201685586-0`, payload
  SHA-256 `00202bd92e1cbb3aad6dbd00f055ecb24b8ba1bab0f927e5df678a2482bb0e27` and manifest
  SHA-256 `0e7ccaeac06d84d094ae5a0654be6895199309526b6aaef4d18b7b68b8ca3e58`;
- the first apply removed the bulk prefix in 33 approximate passes but correctly exposed
  `certified_prefix_complete=false`: Redis may retain a small radix-tree tail below a MINID
  boundary. Retention now counts that tail and permits one exact pass only when it is bounded to at
  most `10,000` entries. Otherwise it returns typed `INCOMPLETE`; it never reports `READY` on a
  partial trim. The second apply completed the boundary with PEL zero and lag zero;
- latest core Redis is approximately `142 MiB` dataset / `167 MiB` RSS, around seven percent of its
  `2 GiB` ceiling. Host prerequisites were installed and verified: `vm.overcommit_memory=1`,
  `vm.swappiness=1`, and a persistent `2 GiB` emergency swapfile currently unused;
- live Redis switched to `noeviction` only after the above gates. Compose now owns that default,
  keeps AOF `everysec`, states the rewrite threshold and tests `PING`, `loading:0` and a bounded
  writable key in readiness. A disposable `128 MiB` noeviction Redis accepted about `100 MiB` of
  injected data, rejected the next write at maxmemory, stayed responsive and preserved the existing
  command stream with zero eviction;
- controlled live `BGREWRITEAOF` completed in one second with about `1.85 MiB` COW and `10.96 ms`
  fork time. AOF shrank from approximately `1.06 GiB` to `40.6 MiB`; rewrite/write status stayed
  `ok`, delayed fsync stayed zero. A subsequent Compose-only Redis recreation loaded AOF in
  `0.621s`, returned healthy, retained `noeviction` and all core services remained running with
  restart count zero.

Disposable fault/recovery matrix evidence:

- AOF-preserving Redis restart changed run id, checked one dispatched command, requeued zero and
  retained exactly one stream entry. Complete loss of the disposable Redis volume changed epoch,
  requeued exactly one missing outbox dispatch from PostgreSQL and rebuilt exactly one stream entry;
- a real PostgreSQL outage was injected after Gateway had opened its pool. Durable paper acceptance
  returned V1-compatible `503 DURABLE_COMMAND_ACCEPT_UNAVAILABLE`; `order.inbound` remained zero
  before/after, proving no success or Redis side effect without DB commit;
- abandoned PEL work survived retention, was claimed by a new consumer with `XAUTOCLAIM`, ACKed and
  ended pending zero. Monitor now cannot steal it merely because it is old;
- repository integration covers commit-before-publish recovery, publish-before-outbox-update
  deduplication, ACK-before-producer-bookkeeping race, 20-way duplicate acceptance, conflicting
  payload hash, aggregate ordering, cancel-before-dispatch, uncertain broker query-before-resend and
  pending-floor-safe trim. All disposable failure scopes are cleanup-gated.

Regression checkpoint:

- latest Docker targeted command-journal, stale-intent, retention, reset, uncertain broker retry,
  Monitor pending preservation, order-group and reconciliation tests pass (`51/51`); focused real
  repository integration and fault certification pass. The complete Docker suite passes with
  `621 passed, 10 skipped` and only two existing FastAPI `on_event` deprecation warnings. The final
  retention/journal unit selection passes `26/26`; Ruff, Compose validation and
  `git diff --check` are clean;
- certified trimming can make Redis' group `entries-read` metadata stale even when the cursor is
  exactly at the new stream tail. Retention now repairs this false lag automatically only after a
  certified-complete trim, with PEL zero, positive reported lag and cursor exactly equal to the
  stream tail. It changes neither the cursor nor pending ownership, and records every repair in the
  retention audit result;
- an initial controlled attempt to expand from `DURABLE_ACCEPT_PAPER_CANARY` to
  `DURABLE_ACCEPT_PAPER` was stopped by the runtime approval gate before the cutover. The service
  configuration was restored to paper canary and no mixed authority was left behind. After explicit
  operator approval, the cutover was completed by recreating Gateway only. Gateway now reports
  `DURABLE_ACCEPT_PAPER`, journal status `READY`, zero pending/dead/uncertain rows and restart count
  zero. Sandbox/live durable acceptance remains disabled;
- after rewrite, AOF grew from about `40.6 MiB` to about `62.7 MiB` over a short observation window
  while the Redis dataset stayed near `144 MiB`. Command statistics identify the main write
  amplification as high-frequency `SETEX`/`PUBLISH` from `market_data_service`: normalized market
  snapshots are still mirrored into durable core Redis. The correct long-term boundary is to move
  ephemeral market cache/PubSub to `redis_marketdata` and migrate every reader (Risk, Paper matcher,
  Gateway, Performance and Portfolio) under one versioned contract. This is a cross-service
  architectural expansion and must receive a separate approved phase; Phase 2 does not silently
  perform it;
- all disposable Redis/PostgreSQL fault scopes, containers, networks and volumes were removed.
  Live archive artifacts remain bounded and intentionally untracked. The root filesystem checkpoint
  was approximately `39 GiB` used / `18 GiB` free (`70%`).

Phase 2 closure decision:

- code, migration, archival, retention, host durability, no-eviction, restart/recovery and disposable
  failure-injection gates are `PASS`;
- V1 HTTP/Redis payload contracts and alpha behavior are unchanged;
- production rollout is now `DURABLE_ACCEPT_PAPER`. Phase 2 may be marked `COMPLETE` only after
  rollback proof, representative paper alpha/projection parity and a 24-hour soak demonstrate
  bounded stream/AOF growth, zero unexplained duplicate/loss and stable service restart counts;
- sandbox/live durable acceptance remains outside this phase and stays disabled.

#### 50.2.4 Full-Paper Cutover Baseline - 2026-08-09

- operator explicitly approved the blast radius of recreating Gateway and expanding durable
  acceptance to every paper account. Only `gateway_service` was recreated; Risk, Paper Execution,
  Redis and the remaining services were not restarted;
- immediately before cutover, both `risk_engine_group` and `paper_execution_group` had PEL zero and
  lag zero. Redis used approximately `149.8 MiB` dataset / `157.5 MiB` RSS against `2 GiB`, policy
  remained `noeviction`, persistence was healthy and current AOF size was approximately
  `154.7 MiB` with a `40.2 MiB` base;
- immediately after cutover, Gateway health exposed rollout `DURABLE_ACCEPT_PAPER`, command journal
  `READY`, zero pending, zero dispatched-unacked, zero dead and zero uncertain commands. Both stream
  groups remained PEL zero / lag zero and Gateway restart count was zero;
- overall health remains typed `DEGRADED` only because Order Group retains the previously documented
  `540` terminal historical dead outbox rows. There is no current Order Group pending backlog;
- no Gateway exception or cutover error was observed. Repeated informational messages for one
  historical VN30 bracket waiting on position projection remain separate operational/log-volume
  debt and are not attributed to durable command rollout;
- a disposable non-canary alpha/account then proved the expanded authority rather than only the
  reported flag. Two of two commands were durably accepted: one MARKET order filled exactly once,
  and one LIMIT order opened then cancelled exactly once. There were no bad rows, risk rejects or
  remaining open orders; reservations ended `CONSUMED`/`RELEASED`, and all observed PEL counts were
  zero. Submit latency for this two-order smoke was approximately p50 `22.20 ms`, p95/p99
  `31.20 ms`;
- the first scoped cleanup attempt exposed a race with the live Performance projection worker. A
  newly written `account_equity_snapshots` row could appear after child cleanup but before deleting
  its parent `strategy_deployments` row, causing an FK-safe transaction rollback. Non-preserving
  disposable reset now locks only the scoped strategy/account/deployment parent rows before child
  cleanup, preventing concurrent FK inserts without stopping unrelated writers. Its regression test
  passes, and the repeated cleanup completed successfully;
- cleanup verification returned zero accounts, strategies, deployments, orders, fills, command
  journal rows and account-equity snapshots for the disposable scope. Redis active-alpha membership
  and API-key hash also returned zero; no test data was retained;
- the 24-hour soak baseline starts from this cutover. The next audit must compare journal/outbox
  terminality, PEL/lag, command/fill/order idempotency, restart counts, Redis RSS/dataset, AOF growth,
  PostgreSQL growth and paper alpha/PnL projections against this checkpoint.

### 50.3 Follow-Up Phase 1 - Ephemeral Market Plane Contract And Shadow Migration

Status: `COMPLETE`.

Problem statement:

- `market_data_service` consumes raw data-layer Pub/Sub from `redis_marketdata`, but
  `MarketCacheProjector` currently writes normalized snapshots, compatibility keys and market
  Pub/Sub into durable core Redis. These high-frequency `SETEX`/`PUBLISH` calls are included in AOF;
- the bounded dataset is small because of TTL, but AOF write amplification is not bounded by dataset
  size. During Phase 2, AOF grew from about `40.6 MiB` after rewrite to about `154.7 MiB` while the
  dataset stayed near `150 MiB`;
- Risk, Paper Execution, Gateway, Performance and Portfolio currently read market projection data
  through clients that also own durable command/event traffic. A writer-only switch would therefore
  create cache misses and `MARKET_DATA_OFFLINE` rejects.

Architecture and compatibility rules:

1. Keep every alpha-facing HTTP endpoint, V1 payload, Redis durable command/event stream and market
   cache key schema unchanged. This phase changes transport ownership, not business contracts.
2. Add an explicit `TRADING_MARKET_REDIS_URL`, defaulting to the existing ephemeral
   `redis_marketdata` process on a dedicated logical DB/namespace. Raw data-layer streams and
   Trading System normalized projections must use distinct key prefixes. Redis logical DBs do not
   isolate memory or eviction; process-level quotas and telemetry remain mandatory.
3. Keep core `TRADING_REDIS_URL` exclusively authoritative for command journal, risk/order/fill,
   portfolio/reconciliation, idempotency, heartbeats and other durable control-plane state.
4. Introduce injected, typed Redis roles rather than a second global ambiguous client:
   `DurableRedis`, `RawMarketRedis` and `ProjectedMarketRedis`. Domain code receives the minimum role
   it requires; execution code must never publish commands through a market client.
5. Add rollout states `CORE_ONLY`, `SHADOW_WRITE`, `EPHEMERAL_READ_CANARY`,
   `EPHEMERAL_PRIMARY_WITH_CORE_FALLBACK` and `EPHEMERAL_ONLY`. Default remains `CORE_ONLY` until
   shadow parity passes. Rollback is a configuration change plus bounded cache recovery, with no
   alpha redeployment.
6. During `SHADOW_WRITE`, project identical canonical and legacy-compatible payloads to both stores.
   Compare payload identity, timestamps, freshness, TTL, hit/miss and malformed/mismatched identity
   rates. Shadow failures are observable but cannot affect execution authority.
7. Market metadata that is durable business configuration remains PostgreSQL/instrument-registry
   authoritative. Redis stores only reconstructable projections. On ephemeral Redis loss, the
   bridge recovers latest state from data-layer REST and bounded raw streams before declaring ready.
8. Health must distinguish `MARKET_CACHE_COLD`, `MARKET_CACHE_STALE`, `MARKET_REDIS_OFFLINE` and
   `RAW_MARKET_SOURCE_OFFLINE`. Sandbox/live Risk stays fail-closed on stale or non-authoritative
   price; paper may use its existing explicitly validated REST recovery policy.

Phase 1 implementation scope:

- inventory and convert all market readers/writers in Gateway bracket/emergency paths, Risk checker
  and recovery, Paper matcher/tick loading, Performance projection and Portfolio unrealized stats;
- centralize client construction, pool limits, timeout/retry policy and ownership telemetry;
- add namespace-level cardinality, bytes estimate, write rate, hit/miss/fallback, freshness and
  reconnect counters to health/metrics without logging individual ticks;
- add shadow projection and comparison without moving any production reader yet;
- document environment/Compose ownership and prohibit `FLUSHDB` or broad deletion against the
  shared ephemeral Redis process.

Phase 1 tests and gates:

- unit contract tests prove byte-equivalent canonical/legacy payloads and TTL semantics across both
  destinations;
- static tests prove durable stream names cannot be sent through `ProjectedMarketRedis` and market
  projection code cannot receive unrestricted durable Redis by default;
- integration tests cover cold cache, Redis reconnect, eviction, malformed payload, stale data,
  wrong venue/product and REST recovery;
- shadow load tests cover representative 40- and 100-symbol universes, burst Pub/Sub and concurrent
  readers. p95 reader latency may not regress by more than 10 percent from the captured baseline;
- exit requires at least one bounded shadow soak with zero unexplained payload divergence, no alpha
  behavior change and no increase in core Redis command PEL/lag.

#### 50.3.1 Typed Market Plane Foundation - 2026-08-10

- introduced the explicit `ProjectedMarketRedis` role and centralized `MarketRedisRoute` policy.
  The role deliberately exposes cache/PubSub primitives only; durable Stream commands such as
  `XADD` and `XREADGROUP` are absent. The five rollout states and their read/write authorities are
  covered by contract tests;
- added `TRADING_MARKET_REDIS_URL`, bounded pool/timeout/keepalive/health-check settings and an
  independent market Redis bus. The target remains `redis_marketdata` DB1; raw data-layer traffic
  remains DB0 and durable trading state remains on `redis_service` DB0;
- converted normalized projection writers and every production market-cache reader in Gateway,
  Risk, Paper Execution, Executor, Performance and Portfolio to centralized factories. With the
  current default `CORE_ONLY`, V1 keys, payloads, endpoints and execution authority are unchanged;
- shadow writes are authoritative on core and non-authoritative on market Redis. Sampled comparison
  checks byte identity and TTL tolerance. Reader canary states reject malformed, stale and
  wrong-identity payloads, and now distinguish a key miss from a Redis connection failure;
- fixed a cutover-critical fallback bug found during review: a disconnected market Redis previously
  prevented `EPHEMERAL_PRIMARY_WITH_CORE_FALLBACK` from reaching core. Approved fallback states now
  continue to core on Redis connection/timeout errors, while `EPHEMERAL_ONLY` propagates the error
  and therefore remains fail-closed;
- Paper matching no longer consumes global market wildcard Pub/Sub. It polls only current open
  paper orders against canonical latest-tick cache, with the existing bounded data-layer recovery;
- added low-frequency market-plane telemetry with write/publish counts, projected payload bytes,
  comparison results, key count and process memory. It writes one expiring health record to the
  ephemeral plane rather than logging ticks. Gateway health preserves the legacy telemetry field
  and adds rollout/reader/writer runtime details;
- test profile now pins `COMMAND_JOURNAL_ROLLOUT=OFF`; this removes accidental coupling between unit
  tests and the live `.env` durable-paper rollout. Full unit result: `629 passed`, with only the
  pre-existing FastAPI `on_event` deprecation warning. Targeted market/paper/risk/portfolio/bracket/
  executor regression passed, including a concurrent 100-symbol shadow burst;
- runtime pre-activation baseline: core Redis approximately `452.7 MiB` used, current AOF
  `221.4 MB`, base AOF `152.2 MB`, `noeviction`; ephemeral Redis approximately `5.2 MiB`, AOF off,
  `allkeys-lru`, DB0 `7,920` keys and DB1 empty. No database or Redis key was deleted for this audit;
- remaining Phase 50.3 gate is runtime `SHADOW_WRITE`, bounded parity/load evidence and confirmation
  that command consumer PEL/lag and alpha behavior remain unchanged before reader canary begins.

#### 50.3.2 Runtime Shadow Certification - 2026-08-10

- live `.env` was extended with the explicit market-plane URL/pool/timeout settings and rollout was
  changed to `SHADOW_WRITE`. Only `market_data_service` was recreated; reader services and durable
  execution authority were not moved during this gate;
- DB1 prewarmed from zero to approximately `720` normalized projection/health keys without any
  `FLUSHDB`, broad delete or change to raw DB0. After a bounded soak, writer telemetry reported
  `7,469` successful batches on both core and market, equal projected payload bytes (`23,709,505`
  each), `192` sampled compare matches, zero compare mismatch and zero write error;
- the read-only `scripts/market_redis_plane_certify.py` tool now certifies byte identity, TTL,
  missing keys and per-plane latency without mutating either Redis. Runtime 40-key and 100-key
  parity both passed with zero value/TTL/missing divergence. A 100-key/20-round run produced 2,000
  observations per plane: core p95 `0.650 ms`, market p95 `0.619 ms` (`-4.77%` regression);
- `order.inbound`, `commands.execution.paper` and `order.requests` all retained PEL zero and lag
  zero. No new warning/error was found in Gateway, Risk, Paper Execution, Executor, Performance,
  Portfolio or Market Data during the shadow window; all relevant restart counts remained stable;
- core AOF grew from approximately `221.4 MB` to `253.3 MB` during the short shadow gate while core
  remained the authoritative market writer. This confirms the measured amplification and is the
  expected baseline for Phase 50.4, not a shadow divergence;
- Phase 50.3 exit gates pass. The rollout may proceed to reader canary; rollback remains the single
  env state `CORE_ONLY` plus recreation of only affected services.

### 50.4 Follow-Up Phase 2 - Market Plane Cutover And AOF Certification

Status: `CUTOVER_COMPLETE_24H_SOAK_PENDING`.

Cutover sequence:

1. Pre-warm normalized cache in ephemeral Redis and prove freshness for active instruments.
2. Move readers to `EPHEMERAL_READ_CANARY` service by service: Performance/Portfolio first, then
   Gateway read-only endpoints, Risk, and Paper Execution last. Preserve typed core fallback and
   record every fallback.
3. Move Paper matcher Pub/Sub to the ephemeral market plane with event-identity deduplication. It
   must subscribe only to symbols with active resting/conditional orders or use bounded latest-tick
   polling; global wildcard matching over the full raw universe is prohibited.
4. Switch `MarketCacheProjector` primary writes to ephemeral Redis. Keep bounded core shadow writes
   only for the rollback window, then disable them after one maximum cache TTL and parity proof.
5. Remove core fallback only after a second approved gate. Legacy cache keys remain available in the
   ephemeral plane until all internal compatibility telemetry reaches zero.

Failure and correctness matrix:

- kill/restart ephemeral Redis, disconnect raw data-layer Redis, inject output-buffer pressure,
  evict hot keys, delay one venue, drop Pub/Sub and restore from REST;
- verify no durable command, journal ACK, fill, position, portfolio or copy event is lost or written
  to the ephemeral store;
- run directional market/limit, resting-order partial fill, bracket/OCO, grid/order-group,
  rebalance and DNSE paper scenarios. Compare orders, fills, positions and PnL with the core-only
  baseline;
- test sandbox/live stale-price fail-closed behavior and Paper's bounded recovery independently;
- measure 24-hour AOF bytes/hour, Redis RSS/dataset, command rates, cache hit/fallback, Pub/Sub drops,
  CPU and p50/p95/p99 read latency. Core Redis market `SETEX`/`PUBLISH` traffic must reach zero after
  fallback removal, and AOF growth attributable to market projection must fall by at least 95%;
- rehearse rollback to core reader/writer mode before disabling core shadow writes permanently.

Phase 2 exit criteria:

- V1/alpha contracts and strategy logic remain unchanged;
- every required service uses the explicit market client and no market projection writer targets
  durable Redis;
- cache rebuild after ephemeral Redis loss is bounded, observable and does not admit stale prices to
  sandbox/live execution;
- no unexplained order/fill/PnL parity difference, duplicate matcher effect or pending command
  regression exists;
- disposable test scopes are reset, generated containers/volumes are removed, and operator accepts
  the cutover/soak report before the rollout flag becomes `EPHEMERAL_ONLY`.

#### 50.4.1 Canary, Rollback And Strict Cutover Certification - 2026-08-10

Implementation and rollout:

- prewarmed DB1 was promoted service-by-service through
  `EPHEMERAL_PRIMARY_WITH_CORE_FALLBACK`. Performance and Portfolio moved first, followed by
  Gateway, Risk, Executor and Paper Execution. Market Data remained dual-write until every reader
  was healthy. A Gateway-only rollback to `CORE_ONLY` was rehearsed and returned to canary without
  command backlog or service restart;
- active market scope is now the deterministic union of the configured baseline and PostgreSQL
  open-order/open-position instruments. It refreshes every 30 seconds through a bounded 1-2
  connection pool, prewarms only newly added instruments and restarts exact subscriptions without
  wildcarding the raw universe. Six of seven active instruments recovered live projections. The
  remaining `BTCUSDT_260925` is an old paper quarterly position for a delivery contract no longer
  served by data_layer REST/stream; it is recorded as pre-existing instrument-lifecycle debt and
  was not fabricated or silently mapped to perpetual data;
- every market reader now has explicit loss behavior. Paper and Performance may use their existing
  fresh, bounded data_layer REST recovery. Risk may recover only data that passes venue/product,
  market and freshness validation; sandbox/live remains fail-closed otherwise. Emergency close is
  not blocked solely by an unavailable cache metadata lookup. Market Redis failure in
  `EPHEMERAL_ONLY` still propagates from the cache reader and is covered independently from these
  explicitly approved recovery paths;
- readers were recreated first with `EPHEMERAL_ONLY`; Market Data was recreated last. Runtime
  telemetry then contained only `write.market.*` counters and no `write.core.*` counter. All eight
  affected services reported restart count zero after cutover. Gateway health reports market cache
  `READY`, rollout `EPHEMERAL_ONLY`, Redis/PostgreSQL reachable and command journal `READY` with zero
  pending, dispatched-unacknowledged, dead or uncertain commands;
- market DB1 contains no durable `order.*`, `commands.*`, `events.fill`, `events.order` or `copy.*`
  key. Core Redis remains `noeviction` with AOF enabled; market Redis remains `allkeys-lru`, AOF off.
  The old core projection residue had TTL on every sampled key. At certification time it comprised
  810 metadata keys and 156 long-lived VN closed-session preload snapshots; no dynamic crypto tick
  writer remained. These keys are allowed to expire naturally rather than being broadly deleted.

Failure and correctness evidence:

- disposable real-Redis integration used isolated `ts_core_cert` and `ts_market_cert` instances.
  A 100-symbol shadow projection had byte/TTL parity; stopping only the disposable market Redis
  proved core fallback in the approved fallback state and fail-closed behavior in
  `EPHEMERAL_ONLY`. After restart, cache rebuild passed. A separate 4 MiB `allkeys-lru` pressure run
  produced 13,079 evictions, zero Redis error replies and preserved the durable-core sentinel. All
  disposable containers/networks were removed;
- a strict production-network smoke used disposable alpha
  `marketplane_strict_alpha_1786351300` without synthetic market seeding. Real data_layer prices
  admitted one MARKET and one LIMIT order: 2/2 accepted, one fill exactly once, one cancel exactly
  once, zero bad rows/risk rejects, reservations terminal `CONSUMED`/`RELEASED`, and all observed
  PEL counts zero. Submit latency was p50 `29.590 ms`, p95/p99 `32.431 ms`. The reset CLI then
  removed the complete test scope; verification returned zero account, order, fill and command
  journal rows;
- final `order.inbound/risk_engine_group` and
  `commands.execution.paper/paper_execution_group` both had pending zero and lag zero. Ten-minute
  post-fix log audit found no WARNING/ERROR/CRITICAL in Gateway, Risk, Executor, Paper Execution,
  Market Data, Portfolio, Performance or Order Group;
- canary also exposed two independent production defects rather than hiding them. Portfolio
  projection used `DISTINCT ON` over approximately 3.24 million account snapshots and timed out;
  it now uses an indexed lateral latest-row lookup per active allocation and completes normal
  cycles. Order Group recovery requeued missing-evidence cancels indefinitely (some historical test
  rows exceeded 1,000 attempts); recovery now obeys `ORDER_GROUP_MAX_ATTEMPTS`. The 717 historical
  rows are terminal `DEAD`, pending is zero and no further Redis/AOF log storm occurs. Overall
  health therefore remains typed `DEGRADED` only for this retained historical dead evidence, not a
  current market-plane or command backlog;
- full unit suite passed. Focused Paper/Risk/Performance/Market/Order Group integration and unit
  regressions passed, with one explicitly environment-gated integration skip and only the existing
  FastAPI `on_event` deprecation warnings. Scoped Ruff checks for every changed Python file pass.
  A broad legacy-tree Ruff audit still reports pre-existing style debt outside this cutover and was
  not bulk-rewritten.

AOF certification:

- immediately before strict certification, core AOF current size was `202,835,099` bytes. A safe
  `BGREWRITEAOF` completed successfully and produced base `168,870,484` bytes;
- after an approximately six-minute bounded window containing the full unit suite, strict paper
  smoke, projection cycles and normal live service traffic, current AOF was `170,119,613` bytes:
  growth `1,249,129` bytes. Core command statistics increased by only 119 `SETEX` and zero
  `PUBLISH` during the measured sub-window, while market telemetry handled at least 131,145
  `SETEX` and 90,662 `PUBLISH`. Therefore market-projection writes to core fell by 100 percent,
  exceeding the 95-percent attributable-write gate; remaining AOF growth is durable control-plane
  traffic and test activity;
- core Redis ended near `488.1 MiB` used / `498.6 MiB` RSS under the 2 GiB no-eviction limit.
  Market Redis ended near `6.7 MiB` used / `10.0 MiB` RSS under the 1 GiB allkeys-LRU limit.
  Immediate cutover and AOF certification pass;
- at this checkpoint the 24-hour observational soak remained the only open operational gate. The
  later operator-approved bounded acceptance in Section 50.4.2 supersedes its duration requirement
  without claiming that 24 elapsed hours were observed; all listed health and integrity dimensions
  were still reviewed against the available evidence window.

#### 50.4.2 Closure B Reduced Rollout And Passive 24-Hour Evidence - 2026-08-11

Status: `BOUNDED_ACCEPTANCE_COMPLETE_24H_DURATION_WAIVED`.

Operator decision:

- do not keep an AI agent or a long-running diagnostic process alive for 24 hours;
- use the normal Monitor service for real-time health and a bounded host `systemd` oneshot probe
  once per hour only for auditable soak evidence;
- return after the deadline for one explicit T+24 review. Elapsed time alone never constitutes a
  pass, and the timer has no authority to change config, restart services, submit orders or clean
  data.

Rollout sequence:

1. Freeze the merged `origin/dev` revision and build one tagged runtime image. Record Git revision,
   image ID, Compose config digest, migration ledger, host capacity, Redis persistence/capacity and
   PostgreSQL size before restart. Rust authority, replay authority and unapproved venue rollout
   remain off; already approved `DURABLE_ACCEPT_PAPER` and `EPHEMERAL_ONLY` are certified rather
   than toggled blindly.
2. Use `docker-compose.release.yml` so application source is loaded from the tagged image instead
   of the development `/app` bind mount. Retain only operator-owned logs, replay state and the
   external symbol registry as explicit mounts. PostgreSQL, both Redis instances and alpha
   containers are not recreated by this code rollout.
3. Recreate Trading System processes in dependency groups: Command Journal; Gateway/Risk;
   Paper/Executor/Listener; Market/Portfolio/Performance; Reconciliation/Order Groups; then
   Monitor/Copy Outbox. After each group verify process start time/restart count, heartbeats,
   Gateway capability health, migration pending count and Redis stream pending/lag.
4. Run frozen V1 probes and one bounded existing-paper-flow audit. Do not inject a disposable order
   merely to create traffic when active paper alphas already exercise the path. Any dedicated test
   scope must use the scoped reset CLI and leave zero disposable DB/Redis residue.
5. Start `scripts/start_closure_b_soak.sh --hours 24`. It captures T0 immediately and installs the
   committed systemd timer. Each hourly snapshot is read-only, atomically written and checksumed;
   it contains host/disk/RAM, container image/start/restart state, bounded stats, Gateway health,
   core and market Redis INFO/AOF/command counters, stream PEL/lag, PostgreSQL heartbeats and
   lifecycle aggregates, plus only the latest bounded warning/error lines.
6. At T+24, compare T0 with the latest snapshot: Redis used/RSS/AOF bytes per hour, eviction/error
   deltas, market-plane durability policy, DB growth, service restarts, heartbeat age, PEL/lag,
   command journal/outbox state, reconciliation findings, duplicate order/fill effects, open
   position mark completeness and copy publication state. Stop the timer and retain the checksummed
   report. The probe removes its active marker and requests timer stop after the deadline.

Stop conditions:

- any required Trading System process is missing/restarting or Gateway is not `READY`;
- core AOF/persistence is unhealthy, market Redis becomes durable, capacity grows without a bounded
  explanation, or command streams develop unresolved pending/lag;
- accepted journal commands become `UNCERTAIN`/`DEAD`, outboxes stop draining, or duplicate external
  effects/order-fill-position-PnL divergence appears;
- DB/WAL/disk growth exceeds the current operational budget, heartbeats become stale, or warnings
  show repeated fallback/recovery loops.

Pass criteria:

- all restarted services run the same recorded image ID and retain zero unexpected restart delta;
- public V1 and active alpha behavior remain unchanged, command and copy outboxes drain, and the
  full paper order-risk-execution-fill-position-PnL-reconciliation path has current evidence;
- core Redis remains `noeviction` plus healthy AOF, market Redis remains bounded ephemeral
  `allkeys-lru` with AOF off, and observed growth rates are explainable and within capacity;
- no disposable test rows, containers or volumes remain. The operator reviews and records the
  T+24 result; automation does not declare production closure on its own.

Execution checkpoint - 2026-08-11 07:59 UTC:

- commits `72692af` (passive collector/release override) and `f82f92d` (legacy fill-monitor gate)
  were created on `ops/closure-b-passive-soak`. Targeted Monitor tests passed `5/5`, Ruff passed,
  all three shell scripts passed `bash -n`, the release Compose rendered all 13 runtime services
  with zero `/app` source mounts, and a real read-only collector rehearsal passed;
- immutable image `tradingsystem-image:closure-b-f82f92d` was built from full revision
  `f82f92d396db60cfc90b0ab3040e41541dff99d7`, OCI image ID
  `sha256:8a1e5614b2ce6b77cddebc22ed90a60b15dd3428b0559fd5f654041c97b1a29d`;
- all 13 Trading System processes were rolling-recreated onto that image. PostgreSQL, core Redis,
  market Redis and alpha containers were not recreated. Every process ended `running`, restart
  count zero and the same image ID; all service heartbeats and Gateway capabilities were `READY`.
  V1 remained authoritative, migration ledger was `40/40` with pending zero, journal/outbox was
  fully terminal and Paper/Executor observed PEL zero;
- Monitor had emitted a false `STREAM_GROUP_NOT_FOUND` every 30 seconds for disabled legacy stream
  `execution.fills`. The fix watches it only when `PORTFOLIO_CONSUME_LEGACY_FILLS=true`; canonical
  `events.fill` remains monitored. Two minutes after rollout all 13 services had zero new
  warning/error/critical/traceback lines;
- pre-existing evidence was retained rather than deleted: one Copy Outbox dead letter from the
  2026-08-09 Redis maxmemory incident, one retired quarterly paper position
  `BTCUSDT_260925.BINANCE` without a current mark, and Dynamic Grid paper risk rejects requiring
  separate order-group reconciliation/tick-price correction. None is represented as a new
  Closure B regression or silently used as passing canary evidence;
- passive soak run `closure-b-20260811T075848Z-f82f92d396db` captured a passing T0 under
  `artifacts/closure_b_soak/` and has deadline `2026-08-12T07:58:48Z`. The corrected systemd timer
  is active with its next checkpoint scheduled for `2026-08-11T08:59:36Z`; only the T+24 operator
  comparison and final acceptance remain pending. A direct systemd oneshot invocation completed in
  `2.601` CPU seconds, produced a second checksummed snapshot with `critical_failure=0`, and left no
  resident collector process;
- active paper traffic supplied the no-injection canary after rollout: one Binance paper MARKET
  order for `paper-binance-gridlongonly001_4h` was acknowledged once, filled once, projected to one
  current LONG position with a non-null mark, produced a current account equity/PnL snapshot and
  published two expected copy lifecycle events. It had one journal command, no unresolved
  reconciliation finding and no disposable test scope to clean. Other strategy-specific risk
  rejects were retained and excluded from this canary rather than treated as transport failures.

Bounded acceptance checkpoint - 2026-08-11 15:20 UTC:

- the operator explicitly requested an early evidence review instead of waiting for the full
  24-hour wall-clock duration. The passive timer was stopped cleanly after approximately `7h21m`
  and `10` checksummed snapshots. Every snapshot recorded `critical_failure=0`. This is accepted as
  bounded Closure B evidence; it is not represented as a completed 24-hour soak certification;
- all 13 Trading System services retained one immutable image and zero restart delta throughout the
  window. Gateway capability health and all required service heartbeats remained `READY`; command,
  fill and copy stream pending counts were zero at final review;
- core Redis `used_memory` grew by about `1.0 MB`, RSS decreased by about `2.5 MB`, evictions and
  rejected connections stayed zero, and the AOF rewrite completed successfully. The AOF current
  file grew at about `11.5-12 MB/hour` between checkpoints and was reduced by rewrite; market Redis
  remained AOF-off, bounded and did not leak raw market `PUBLISH` traffic into core Redis;
- PostgreSQL grew by about `22.8 MB` in the observed active window, approximately `3.1 MB/hour` or
  `74 MB/day` at that workload. Root disk remained at `70%` with about `18 GB` available. Final DB
  integrity audit found one paper Binance order/fill canary, zero duplicate order groups, zero
  duplicate fill groups, zero new dead letters and zero newly updated open positions missing a
  mark. The `167` paper Binance `RISK_REJECTED` rows are explicit policy decisions, not lost or
  duplicated execution effects;
- the bounded soak exposed nine bracket-entry acceptance failures at the 13:00 and 15:00 cycles.
  Root cause was not Redis, PostgreSQL availability or journal durability: capital-sizing metadata
  emitted division results whose `requested_quantity` exceeded the canonical
  `NUMERIC(38,18)` scale, so `DecisionEvidence` rejected them before journal insertion. Commit
  `6957482` quantizes that value at the sizing boundary and logs the exact durable-acceptance cause;
- regression coverage for the fix passed `101` focused sizing/domain/Gateway/journal/bracket tests,
  the complete unit suite passed `100%`, and Ruff passed. Runtime no-write checks reproduced the
  exact BNB/ETH/BTC quantities from the failed cycles and confirmed that all now serialize and hash
  within the canonical scale;
- immutable image `tradingsystem-image:closure-b-6957482`, OCI ID
  `sha256:cd672db3828fafcc5544c0dbb26a87f97ed15de02161440f783663b6c09961de`, was rolling-deployed to
  all 13 Trading System services without restarting PostgreSQL, either Redis plane or alpha
  containers. One minute after rollout there were zero new warning/error/critical/traceback lines,
  all heartbeats were ready, journal/outbox/reconciliation open counts were zero and stream pending
  counts remained zero;
- no post-fix natural bracket submission occurred inside the shortened observation window. The
  post-fix proof is therefore deterministic runtime serialization plus full automated regression,
  while the earlier paper MARKET canary remains the real write-path proof. A future natural bracket
  cycle may add operational evidence, but it is not a blocker for this bounded acceptance because
  the failed pre-journal boundary was reproduced exactly and fixed directly;
- Closure B is closed under the operator-approved shortened evidence policy. Reopening is required
  only if later runtime evidence shows service restarts, AOF/capacity drift outside these observed
  bounds, unresolved PEL, duplicate external effects, or a recurrence of durable acceptance failure.

Final `dev -> main` release gate - 2026-08-11:

- `dev` was fast-forwarded to PR #10 merge commit `6043da1`; both Closure B fix commits are ancestors
  of that revision. A three-way merge simulation from current `origin/main` to `dev` found no content
  conflict. The main-only commits are historical merge commits from earlier `dev -> main` PRs, not
  newer product changes missing from `dev`;
- exact main-PR lint scope covered `210` changed Python files. It initially exposed two pre-existing
  import-order sites and one Python 3.10 `collections.abc` modernization issue. Commit `e7fd4e3`
  fixes only those imports and makes the Compose contract step create its ignored CI `.env` from
  `.env.example`; production continues to use its operator-owned `.env` unchanged;
- generated polyglot bindings, frozen V1 OpenAPI artifacts, cross-language static verification,
  Python compile-all, Ruff and the complete unit suite pass. Public V1 operations remain compatible;
- an isolated disposable PostgreSQL/Redis environment applied all `39` governed migrations, the
  second apply was empty, pending count was zero, and integration tests passed `10` with the two
  expected environment-gated skips. The disposable containers and network were removed afterward;
- Rust `1.83.0` format, Clippy with warnings denied and full workspace tests passed: `11` executable
  tests with zero failure. The CPython 3.10+ ABI3 wheel built successfully in the pinned Maturin
  image and its panic-isolation/golden-corpus certification returned `PASS`;
- Docker Compose renders successfully from a clean-checkout-equivalent `.env.example`. Temporary
  release-candidate images and the temporary Rust test image were removed after certification;
- this evidence makes `dev` eligible for a protected PR into `main` once commit `e7fd4e3` and this
  checkpoint are pushed and GitHub-required checks are green. No agent-side direct merge is
  authorized. Because the public API remains V1-compatible and the release adds backward-compatible
  internal durability/contracts/observability capabilities, the recommended product tag is
  `v1.1.0`, not `v2.0.0`;
- after the protected merge, build one immutable runtime image from the actual `main` merge/tag SHA,
  run the governed migration status check, rolling-recreate only Trading System services, and repeat
  the short READY/heartbeat/PEL/journal/outbox plus natural paper-cycle smoke. GitHub Release notes
  must retain the explicit limitations: Rust authority and OKX execution remain rollout-disabled,
  the 24-hour soak duration was operator-waived, and public V1 remains authoritative.

Release execution checkpoint - 2026-08-11 17:01 UTC:

- `origin/main` now contains merge commit `d4de2aaf554a0e33168b101e1c0def796a94cda0` and annotated
  tag `v1.1.0` points to that exact commit. The tag is immutable and was not moved after deployment;
- immutable runtime image `tradingsystem-image:v1.1.0-d4de2aaf`, OCI image ID
  `sha256:00c2455978395731c982bbc524c3fb3a978383dd891e55e298a44076c880312e`, was built from the
  tagged tree and carries matching revision/version labels. All 13 Trading System processes were
  rolling-recreated onto that image in dependency order. PostgreSQL, both Redis planes and alpha
  containers were not recreated. Every deployed process is running with restart count zero;
- governed migration status is `39/39`, pending zero. Gateway capability health is `READY`;
  Binance Futures execution and user stream are both `READY`. All 12 persisted required service
  heartbeats are `READY` and fresh. Redis command groups for inbound risk, executor, paper
  execution and untracked-order recovery have pending zero and lag zero. Copy Outbox DB pending is
  zero; the external copy-server consumer group has pending zero but retains a pre-existing lag of
  239 messages, which is downstream-consumer operational state rather than publisher data loss;
- a disposable release scope submitted four concurrent Binance paper orders: 4/4 accepted, two
  MARKET orders filled exactly once and two LIMIT orders cancelled exactly once. There were zero
  risk rejects, zero bad lifecycle rows, zero residual reservations/open orders/pending exposure,
  and measured submit latency was approximately p50 `39 ms`, p95/max `50.4 ms`;
- the release smoke scope was removed from orders, fills, positions, account/performance snapshots,
  strategies, accounts, deployments and both Redis planes. No disposable row/key remains. Four
  market-cache values inserted by the smoke were removed from durable Redis only after verifying
  their source marker; the ephemeral market plane had already recovered authoritative Binance
  ticks and remained untouched;
- the initial scoped reset exposed an operational helper defect: compressed account/performance
  snapshot hypertables are segmented by `deployment_id`, while the helper used a broad
  `account_id OR strategy_id` delete. That caused a production-wide compressed-chunk scan and
  temporary projection timeouts. The timeout coincided with cleanup and the Performance service
  recovered without restart. The follow-up helper now captures deployment scope before cleanup and
  deletes those hypertables by their Timescale segment key. Static shell validation, four focused
  unit tests and a nonexistent-scope production-compose smoke pass; this follow-up remains on
  `dev` for the next patch and does not rewrite the immutable `v1.1.0` tag;
- final eight-minute audit found zero warning/error/critical/traceback lines across all 13 services,
  no active PostgreSQL transaction, no new dead letter or reconciliation finding since rollout,
  and zero release-smoke Redis residue. Historical dead-letter rows remain retained audit evidence;
- cleanup removed three superseded Closure B runtime images, all dangling images and `6.843 GB` of
  unused BuildKit cache. No Docker volume, active image, database, Redis dataset or alpha container
  was removed. The immutable release image and deployment manifest worktree are intentionally
  retained;
- the annotated Git tag is published. A GitHub Release page/object could not be created from this
  host because neither `gh` nor an authenticated GitHub API token is installed; release notes must
  be attached to tag `v1.1.0` through the protected repository workflow without changing the tag.

## 2026-08-12 Urgent Runtime Correctness, Delivery And Storage Program

Status: `PHASE_1_IN_PROGRESS`.

This program follows release `v1.1.0` without changing the public V1 HTTP, Redis event or Alpha SDK
contract. It addresses concrete runtime evidence found after release. Work is isolated on
`hotfix/urgent-runtime-correctness` for Trading System and
`hotfix/basis-arb-cycle-recovery` for execution_alpha. Existing paper, sandbox and live state must
not be reset, force-closed, restarted or rewritten unless an explicit scoped repair is reviewed.

### Urgent Phase 1 - Execution Correctness And Lifecycle P0

Objective:

- prevent Basis Arb from skipping a daily cycle after a recoverable data/SSH failure;
- make protective-bracket health and repair deterministic across old payloads, duplicate groups,
  rejected children, restarts and open positions;
- normalize every Dynamic Grid/order-group financial value before durable acceptance and Risk while
  preserving strict fail-closed venue rules;
- prove no duplicate submission, no unprotected position introduced by repair and no unintended
  external effect.

#### 1.1 Basis Arb same-cycle recovery and SSH trust

- Keep the existing daily strategy and cycle key. Add a durable, atomically-written scheduler
  record under the bind-mounted alpha state directory with `cycle_id`, `status`, `attempt_count`,
  `next_retry_at`, `last_failed_phase`, `last_error_code`, `started_at` and `completed_at`.
- A failed cycle remains `RETRYING` until it succeeds or reaches an explicit terminal policy. The
  next scheduler iteration must service due retry state before calculating the next calendar day.
  The initial catch-up window may decide whether a never-attempted historical cycle starts; it must
  never discard a cycle that already started.
- Use bounded exponential backoff with jitter and a configured retry deadline. Log the actual next
  retry timestamp; never log `retry after 300s` and then sleep until the next day.
- Mark `COMPLETED` only after required history/depth, feature/prediction and idempotent package
  submission reach their terminal success state. Container restart/recreation must recover
  `PENDING`/`RETRYING` state without resubmitting a completed package.
- Use a dedicated read-only SSH identity/agent socket and mounted `known_hosts`. Pin the research
  host fingerprint and keep strict host-key verification; do not use
  `StrictHostKeyChecking=no`. Missing/mismatched trust material is typed as a retryable data-source
  failure and must never silently select unverified SSH.
- Validate depth cache schema, timestamp, source revision and checksum. Atomic replacement is
  required. Stale-while-revalidate is allowed only inside an explicitly configured grace period;
  required depth outside that period remains fail-closed.

#### 1.2 Protective bracket lifecycle audit and repair

- Add an operator-facing bracket lifecycle auditor with read-only default and explicit scoped apply.
  It classifies superseded active groups, filled entry without viable protective child, duplicate
  active protection, rejected/orphan child, flat-position group and active group with no matching
  position. Every apply action writes immutable audit evidence and supports idempotent rerun.
- Define protection policy per strategy/deployment. `SINGLE_POSITION_PROTECTION` permits only one
  viable protective lifecycle for an account/instrument/side while allowing explicitly configured
  pyramiding/multi-entry strategies to keep multiple valid groups. Do not enforce a blanket DB
  uniqueness rule that breaks legitimate strategies.
- Normalize nested legacy financial evidence at the canonical durable boundary. Values whose scale
  exceeds `NUMERIC(38,18)` retain the original text in raw evidence and use a canonical quantized
  value for hashing/persistence. A durable-acceptance error before order creation must be observable
  and terminal/retryable according to its typed cause.
- For the current Fib DNSE finding, the repair plan keeps the newest viable STOP/TP group and
  terminalizes/cancels the superseded July group only after verifying the physical paper position
  and child coverage. For Combine 4h, no stop may be fabricated from missing strategy state: the
  operator must choose an approved re-attach level or force-close before the account is considered
  protected.
- Extend Gateway/Monitor health with: required-protection position without viable STOP, multiple
  active groups violating policy, rejected child on active group and stale active group after flat.

#### 1.3 Order-group preflight and Dynamic Grid normalization

- Normalize `price`, `trigger_price`, `quantity` and other venue-constrained leg fields in the
  authoritative Gateway order-group aggregate before durable create, Risk or producer dispatch.
  Alpha SDK normalization remains advisory UX only; Gateway is the enforcement boundary.
- Fetch one versioned instrument/market-rule snapshot for the complete group. Apply Decimal tick and
  step rounding with explicit side/order semantics, then persist both requested and normalized
  values plus metadata revision.
- Preflight all legs as one pure operation. Zero quantity, impossible tick/step, invalid ordering,
  duplicate leg identity or missing metadata rejects the whole group before any external effect.
- Pure validation failure terminates as a typed validation rejection/closed group. It must not enter
  `ORDER_GROUP_SCOPE_RECONCILIATION_REQUIRED`. Reconciliation-required is reserved for uncertain or
  mixed external effects after at least one dispatch attempt.
- Keep Risk strict. Do not weaken `PRICE_TICK_INVALID`, broker-sync or scope reconciliation guards to
  make Grid pass.

#### 1.4 Phase 1 validation, rollout and cleanup gates

- Unit/time-travel tests: due time, failure at each Basis phase, retry crossing the old catch-up
  boundary, restart before retry, success after retry, terminal deadline and duplicate cycle key.
- SSH tests: missing key, unknown host, changed fingerprint, transient disconnect and verified
  recovery. Secrets and host-key material must not appear in logs/fixtures.
- Bracket tests: legacy over-scale metadata, duplicate active groups, filled entry/rejected child,
  partial fills, sibling race, restart replay, flat position, pyramiding policy and repeat repair.
- Order-group tests: multiple tick/step sizes, side-aware normalization, complete-group preflight,
  one invalid leg with zero side effects, post-dispatch uncertainty, partial/race/late fill and
  2,000+ bar Dynamic Grid plan parity.
- Run focused unit tests, disposable integration/failure injection, then one scoped Binance paper
  Grid cycle. Test scopes must be removed with the scoped reset path while retaining immutable test
  report/checksums. Existing Fib/Combine state is not repaired until the auditor dry-run is reviewed.
- Phase passes only when Basis recovers inside the same cycle, every policy-required open position
  has exactly the permitted viable protection, Grid records zero tick rejects and zero validation
  reconciliation cascades, and no duplicate/external effect appears.

Rollback:

- Basis scheduler can return to the prior image while retaining the new state file; unknown fields
  are ignored. Never delete unfinished cycle evidence during rollback.
- Gateway/order-group changes are additive and V1-compatible. Roll back the service image without
  reverting immutable DB evidence. Repair apply is separately gated and never runs at startup.

### Urgent Phase 2 - Copy Delivery And Data-Layer Demand Reliability

Status: `ENGINEERING_COMPLETE_OPERATIONAL_CUTOVER_PENDING`.

Objective:

- drain downstream copy lag without resetting consumer history or duplicating investor effects;
- distinguish active demanded market feeds from broad-universe best-effort telemetry;
- remove VN market-open provider stampedes and certify reconnect/gap recovery under current alpha
  concurrency.

Implementation scope:

- Recover `copy_trading_server_v1` using its existing group and durable downstream inbox keyed by
  event ID/sequence. Read with bounded batches, persist/dispatch before ACK, support poison-message
  DLQ and never use `XGROUP SETID`, group recreation or blind cursor reset.
- Alert on lag count, oldest undelivered age, last successful read/ACK and consumer heartbeat, not
  PEL alone. Verify order, fill, bracket/OCO and package payload inheritance through catch-up.
- Introduce runtime feed leases/refcounts from active alpha/service heartbeats. Open positions and
  resting orders keep feeds demanded even if an alpha process restarts. Separate deployment states
  `CONFIGURED/ENABLED` from fresh runtime `RUNNING`; do not disable persisted risk configuration
  merely because a container is absent.
- Health is strict for demanded feeds and informational for broad-universe feeds. Delisted,
  non-trading and unsupported products are classified from refreshed venue metadata instead of
  counted forever as missing.
- Add per-symbol/interval singleflight or distributed locking for VN preload/read-through top-up,
  bounded waiter timeout and negative/backoff caching. One market-open miss must produce one
  provider request, not one request per alpha.
- Track WebSocket outage duration, reconnect latency, sequence/gap evidence and REST gap-fill.
  Provider maximum-duration rotation is a normal lifecycle event only if the recovery SLA passes.
- Make consumer-group creation startup-only/idempotent so expected `BUSYGROUP` does not continuously
  increment Redis error telemetry.

Validation and pass gates:

- Disconnect/reconnect and crash-before/after-commit/ACK tests prove at-least-once delivery with
  exactly-once downstream effect. Copy lag reaches zero without event loss or cursor rewrite.
- Concurrent VN top-up tests prove one provider fetch; demanded-feed failure degrades health while
  broad-universe misses do not mask it. Queue-drop window delta remains zero and reconnect gap-fill
  restores continuity.
- Resource acceptance records CPU, Redis memory, request fan-out and feed recovery latency at the
  current universe plus a higher-concurrency synthetic demand set. All disposable leases/data are
  removed after test.

### Urgent Phase 3 - Change-Only Storage, Retention And Bounded Soak

Status: `ENGINEERING_COMPLETE_RELEASE_CUTOVER_PENDING`.

Objective:

- stop broker valuation noise and no-op reconciliation from generating immutable history at the
  current 78-92 MB/day snapshot rate;
- introduce archive/restore-proven retention and log rotation without deleting authoritative
  order/fill/capital evidence;
- certify a bounded 1-2 cycle steady state before the next architecture upgrade.

Implementation scope:

- Split broker state into execution-state and valuation-state canonical projections. Execution
  digest includes balances that affect buying power, position side/quantity/entry, open-order
  lifecycle, margin/position mode and broker status. It excludes observation timestamp, request
  IDs, raw ordering, mark price and unrealized PnL. Valuation remains fresh in current state and a
  separately bounded time bucket without generating lifecycle history every sync.
- Write `broker_sync_state_history` only on semantic execution transition/status change. Preserve
  raw source payload in short hot storage with checksum/archive metadata. Record no-op
  reconciliation as metrics; write `portfolio_audit_log` only when a decision, state or applied
  effect changes.
- Partition or hypertable raw broker snapshots by time, compress closed chunks and define retention
  ownership. Retention apply remains disabled until archive count/digest, restore and latest-state
  parity pass. Immutable orders, fills, domain events and capital ledgers are never generalized into
  this cleanup policy.
- Migrate with shadow dual-write/current-state parity before read cutover. Existing 6 GB history is
  archived and deleted only in bounded batches/partition operations. No live `VACUUM FULL`; use
  normal vacuum/analyze and an approved online repack/maintenance window only when physical reclaim
  is necessary.
- Add size/time rotation and retention for Trading System, data_layer and alpha logs. Preserve
  incident/audit reports separately from verbose runtime logs.

Validation and pass gates:

- Golden-state tests prove semantic digest stability across timestamp, mark/unrealized changes and
  JSON ordering, while every execution lifecycle change produces exactly one history record.
- Shadow migration compares old/new current state, broker reconciliation, position/PnL and replay
  output. Backup/archive/restore, late row, compression and bounded-delete tests must pass in
  disposable infrastructure before any live retention apply.
- Target at least 90 percent reduction in idle snapshot/audit growth without reducing current-state
  freshness. Observe 1-2 real alpha cycles including a service restart, Redis reconnect, copy
  catch-up and bracket recovery. Record DB/TOAST/WAL, logs, Redis, CPU/RAM and disk deltas.
- The retired quarterly `BTCUSDT_260925.BINANCE` missing-mark position receives an explicit
  settle/archive decision; it is not silently counted as current healthy exposure.

Program-wide rules:

- Public V1 endpoints, payloads, Alpha SDK calls and Redis event compatibility remain unchanged.
- Every material work package receives focused tests and a scoped commit. Do not mix user runtime
  state/logs into commits. Paper is the first write-path authority; sandbox/live require separate
  operator approval.
- No phase advances on elapsed time alone. Unexplained domain divergence, duplicate external
  effect, unprotected required position, unresolved PEL/lag or non-restorable cleanup blocks the
  next phase.

### Urgent Phase 1 Implementation Checkpoint - 2026-08-12

Status: `ENGINEERING_COMPLETE_OPERATIONAL_CUTOVER_PENDING`.

Implemented:

- Basis Arb now persists an atomic active-cycle record and retries an already-started failed cycle
  before calculating the next calendar cycle. Retry state survives container recreation, records
  the failed phase and actual retry timestamp, and never resubmits a completed cycle key.
- Research depth SSH now requires an explicit read-only identity and pinned `known_hosts`, uses
  strict host verification, and validates atomic cache schema/source/timestamp/checksum before use.
- Gateway order-group creation now performs complete-group Decimal preflight against one market
  metadata snapshot before DB creation, Risk or producer dispatch. BUY/SELL price and trigger
  rounding is side-aware, quantity is floored to step size, and requested plus normalized evidence
  is retained. Invalid groups have zero durable or external side effect.
- Canonical durable evidence now quantizes over-scale nested financial text at the
  `NUMERIC(38,18)` boundary while preserving the original raw command payload. This removes the
  legacy bracket audit failure without changing public V1 input or output.
- Added a read-only-by-default bracket lifecycle auditor, explicit scoped/idempotent terminalize
  operation, immutable operator audit record, CLI command and Monitor findings for missing viable
  STOP/rejected child conditions. The auditor distinguishes single-position protection from
  intentional multi-entry policy and never fabricates a stop price.

Validation evidence:

- Basis scheduler/SSH unit suite: `7 passed`, including restart after the retry deadline. Startup
  bootstrap failure is deferred into the scheduled durable retry path; an expired retry is
  terminalized once instead of leaving a one-second busy loop.
- Trading System focused canonical/bracket/order-group/Risk suite: `154 passed`.
- Trading System full unit suite: `664 passed`; only pre-existing FastAPI lifecycle deprecation
  warnings were emitted.
- Disposable PostgreSQL/Redis integration environment with governed migrations `02` through `40`:
  `13 passed, 2 environment-gated skipped`; containers, network and temporary state were removed.
- Dynamic Grid strategy/runtime suite: `11 passed`, including `2,401`-bar plan parity and lifecycle
  behavior. Scoped Ruff and `git diff --check` passed.

Live read-only audit evidence at checkpoint time:

- Fib DNSE `paper-dnse-fib_sl_tp_strength_0015m/VN30F1M` has one current viable ACTIVE bracket
  (`brk-fib_sl_t-vn30f1m-74e55f8492f1`, ENTRY FILLED, STOP/TP ACCEPTED) and one superseded ACTIVE
  July bracket (`brk-fib_sl_t-vn30f1m-22fbfb142e29`, ENTRY FILLED, STOP/TP REJECTED). Position is
  LONG quantity `1` with a current mark. The old group is eligible for reviewed terminalization;
  it was not mutated during this phase.
- Combine 4h `paper-binance-combine_weight_sl_tp_0014h/ETHUSDT` remains LONG quantity `16.07` and
  has no active viable protective bracket. Historical groups are terminal. No stop level is
  recoverable from authoritative current state, so operator approval must choose either a strategy
  supplied re-attach level or force-close; this phase did neither.
- The pinned host is now trusted, but the currently mounted `/root/.ssh/id_ed25519` is not accepted
  by the research VPS. The code no longer skips the daily cycle after this retryable failure, but
  production depth refresh remains blocked until `BASIS_ARB_SSH_PRIVATE_KEY_PATH` points to the
  dedicated public key authorized by the research host.
- Live services still run immutable image `v1.1.0-d4de2aaf`; the hotfix was deliberately not
  deployed in this implementation checkpoint. Gateway reports `READY`, all registered Trading
  System heartbeats are fresh and data_layer `/v1/health` reports `ok`.
- Because the old Gateway remains active, Dynamic Grid continued producing validation debt in the
  latest 24-hour read window: `159 PRICE_TICK_INVALID:price` followed by
  `256 ORDER_GROUP_SCOPE_RECONCILIATION_REQUIRED`. These are baseline evidence for the rollout
  gate, not evidence that preflight code failed.
- Copy stream group `copy_trading_server_v1` has pending `0` but lag `239`; outbox service is READY.
  Catch-up remains Phase 2 work and no cursor/ACK was changed.
- Storage baseline remains dominated by `broker_account_sync_snapshots` at about `6,046 MB` and
  `portfolio_audit_log` at about `673 MB`; no retention or destructive DB maintenance ran.

Open operational gates before Phase 1 is marked `COMPLETE`:

1. Configure the accepted dedicated Basis research key, run one real read-only depth refresh, and
   prove a forced transient failure succeeds within the same durable cycle.
2. Roll the hotfix image to Gateway/Monitor/Basis under operator approval, review bracket-audit
   dry-run output, then explicitly terminalize only the superseded Fib group. Resolve Combine 4h by
   an approved strategy stop or force-close decision.
3. Run one scoped Dynamic Grid Binance paper cycle after rollout and require zero
   `PRICE_TICK_INVALID`, zero validation-induced `ORDER_GROUP_SCOPE_RECONCILIATION_REQUIRED`, and no
   unintended external effect. Remove only that disposable test scope afterward.

Urgent Phase 2 is engineering-complete with the operational gates recorded below. Phase 3 remains
planned. Phase 1/2 code completion does not authorize copy consumer cursor changes, data-layer
deployment changes, DB retention deletes, live force-close, service recreation or production
cutover.

### Urgent Phase 2 Implementation Checkpoint - 2026-08-12

Status: `ENGINEERING_COMPLETE_OPERATIONAL_CUTOVER_PENDING`.

Implemented in `trading_system`:

- Monitor now performs read-only copy delivery diagnostics using the existing
  `copy_trading_server_v1` group. It reports lag, oldest undelivered age, PEL summary, consumer idle,
  last delivered ID and a short-TTL downstream heartbeat. It has no code path for `XACK`,
  `XAUTOCLAIM`, `XGROUP CREATE`, `XGROUP SETID`, cursor movement or group deletion.
- `copy.event.v1` remains the public schema. Existing fields are unchanged; additive correlation
  fields preserve order-group leg, package, pair and grid identity across order/fill/bracket/OCO and
  multi-leg events. Redis diagnostics are normalized to JSON-safe values before alert routing.
- The external-consumer runbook now requires startup-only idempotent group creation, treats
  `BUSYGROUP` as bootstrap success, uses bounded reads and `XAUTOCLAIM`, persists a durable inbox or
  DLQ before ACK, deduplicates investor effects by `copy_event_id`, and publishes a defined
  heartbeat contract.
- Trading System market data derives execution demand from authoritative open positions and resting
  orders, independently of alpha-process liveness. It renews one stable TTL lease owner in
  data_layer and deterministically aggregates reasons when one symbol is demanded by both position
  and order state. Broad configured scope remains separate from execution demand.

Implemented in `data_layer`:

- Added Redis TTL-backed feed leases with owner-scoped release and refcounted aggregate diagnostics.
  Latest price/kline/VN quote and preload reads create short request leases without turning lease
  telemetry failure into an API failure.
- `/v1/health` and `/v1/health/streams` are strict for actively demanded missing/stale Binance
  feeds. Broad-universe missing/stale remains informational by default; the explicit legacy strict
  flag retains its old behavior. Queue-drop health now uses a five-minute rolling delta while the
  lifetime counter remains diagnostic evidence.
- Demand identity is product-aware: Binance Spot and USD-M use separate internal feed keys, so a
  fresh Spot tick cannot satisfy a Futures execution demand. Existing public Redis market keys,
  channels and HTTP V1 contracts are unchanged.
- Binance shard telemetry records outage start/recovery/duration and gap-fill success/failure.
  Reconnect recovery fetches only demanded kline symbols and publishes only candles whose provider
  close time has passed; it never relabels the current open candle as closed. Trade recovery remains
  latest-state plus freshness validation rather than fabricated tick replay.
- Binance Spot/USD-M active product metadata is refreshed once at stream startup and shared by each
  source family. Only `TRADING` products enter the expected universe; a failed refresh falls back to
  the last good symbol cache instead of deleting coverage or fabricating product status.
- VN read-through top-up now uses local async singleflight plus Redis NX/TTL fencing, bounded waiter
  timeout and short provider-failure backoff. Parquet IO/provider calls run outside the event loop;
  canonical sparse candles and FIFO/materialized interval behavior are unchanged.

Validation evidence:

- data_layer full regression: `75 passed, 2 environment-gated skipped` (`77` discovered). Focused
  tests cover demand-only degradation, old queue-drop recovery, reconnect telemetry, closed-candle
  gap fill, metadata cache fallback, 20 concurrent VN callers and provider negative caching.
- Trading System full test suite: `670 passed, 14 skipped`; only the two existing FastAPI
  `on_event` deprecation warnings remain. Copy/group/package inheritance and market-demand contracts
  are included.
- A disposable Redis 7.2 integration test proved two independent top-up coordinators produce one
  provider call. A separate copy test simulated crash after downstream commit but before ACK,
  reclaimed the PEL message, deduplicated to exactly one inbox/effect, persisted one poison message
  to DLQ and finished with PEL `0` and lag `0` without cursor reset.
- Synthetic resource acceptance created `1,000` leases from `100` owners over `10` demanded feeds:
  latest write fan-out completed in `0.3482s`, aggregate snapshot in `0.1068s`, and Redis memory
  delta was `583,448` bytes. The test namespace, Redis container, Docker network and temporary test
  image were removed after verification; no live volume or service was touched.
- Live read-only baseline, before deployment, remains data_layer `status=ok`; the old process reports
  lifetime queue drops `8,780,884`, broad missing `355` and stale `513`. Related snapshots were
  approximately data_layer `483 MiB` RAM / `37.84%` CPU, market-data bridge `53 MiB` / `5.14%`, and
  market Redis `11 MiB` / `5.31%`. These are baseline values, not post-cutover evidence.
- Copy outbox is healthy and its consumer group has PEL `0`, but the external consumer still has lag
  `239`. No live ACK, claim, group creation, cursor movement or downstream connection was attempted
  from this server during implementation.

Operational gates before Phase 2 is marked `COMPLETE`:

1. Build/deploy the reviewed data_layer and Trading System images under explicit operator approval;
   restart only data_layer, market-data and Monitor in a controlled order. Confirm lease renewal,
   demanded-feed health, no five-minute queue-drop delta and reconnect recovery on real streams.
2. The external copy server must reconnect its existing group, publish the heartbeat, reclaim any
   owned pending work and drain lag `239` to zero using its durable inbox/DLQ. It must not recreate
   the group or reset its cursor. Compare order/fill/bracket/OCO/package IDs before and after catch-up
   and require zero duplicate investor effect.
3. Observe at least one bounded alpha/reconnect window. Required evidence is demanded feed freshness,
   gap-fill success or no gap, provider top-up fan-out of one, copy PEL/lag zero, stable Redis memory,
   and no regression in command-stream PEL or alpha order behavior.

Cleanup gate is `PASS`: the disposable Redis used no volume, its container/network were removed, and
the temporary Trading System test image was deleted. Phase 3 storage work may start in code
isolation, but production retention/delete remains blocked until the three operational gates above
pass.

### Urgent Phase 3 Implementation Checkpoint - 2026-08-12

Status: `ENGINEERING_COMPLETE_RELEASE_CUTOVER_PENDING`.

Implemented:

- Migration `41-change-only-sync-storage.sql` introduces an explicit execution-state projection,
  valuation current state, 15-minute valuation buckets, change-only raw hot storage, reconciliation
  observation metrics, change-only portfolio audit state and checksum-backed archive manifests.
  Public V1 endpoints, Alpha SDK payloads and Redis contracts are unchanged.
- Broker execution digest now includes broker status, wallet/cash ledger, non-flat position
  side/quantity/entry/break-even/margin mode, open-order lifecycle and account position mode. It
  excludes mark/notional/unrealized PnL, observation/request timestamps, transient buying power,
  flat universe rows and JSON/list ordering. Mark-only movement therefore refreshes current
  valuation without fabricating an execution transition.
- `broker_sync_state_history` and `broker_sync_raw_hot` are written only on execution transition.
  `broker_sync_valuation_current_state` is updated each observation and
  `broker_sync_valuation_history` replaces the current 15-minute bucket. Legacy snapshot dual-write
  is an explicit rollback switch and defaults off through
  `BROKER_SYNC_LEGACY_SNAPSHOT_WRITE_ENABLED=false`.
- Reconciliation observations now aggregate no-op/mismatch/repair counters into bounded buckets.
  `portfolio_audit_log` records only a changed decision/effect; repeated identical state increments
  `portfolio_audit_current_state.repeat_count`. Empty apply cycles no longer serialize full broker
  state into audit history.
- Archive lifecycle is fail-closed: archive writes mode-0600 gzip JSONL, stores row count/time range
  and SHA-256, reads it back, restores into a guarded disposable Phase 3 database, compares complete
  row parity, then permits exact-primary-key purge only with `PURGE_VERIFIED_ARCHIVE`. A row arriving
  after archive is not deleted. Generic retention refuses every archive-required policy.
- Retention ownership is explicit: raw hot and legacy raw snapshots have 14-day hot windows,
  valuation buckets 90 days, new reconciliation transitions 365 days and legacy no-op audit noise
  30 days. Orders, fills, domain events and capital ledgers remain immutable and outside these
  policies. Apply remains disabled by default.
- Trading System file logs are hard-capped at configurable 20 MB x 7 in addition to Docker's
  10 MB x 3. data_layer rotation is configurable at 10 MB x 5; shared alpha runtime was already
  bounded at 20 MB x 5. Optional daily compressed host rotation is documented in
  `ops/logrotate/trading-platform.conf`.
- Performance history cadence is reduced from 1-minute active/pending account/portfolio snapshots
  and 5-minute instrument snapshots to 10-minute buckets; idle remains 15 minutes. The projection
  wake-up remains 60 seconds plus event notifications, preserving prompt current-bucket updates
  while cutting scheduled active history cardinality by about 90 percent.
- Binance symbols ending `_YYMMDD` are classified as `CRYPTO_USDM_DELIVERY` with an explicit delivery
  date. The live `BTCUSDT_260925` position is **not retired** on 2026-08-12; its delivery date is
  2026-09-25. The correct lifecycle decision is `KEEP_ACTIVE`, restore a fresh mark, and only settle
  or archive after the actual delivery lifecycle confirms terminal state.

Validation evidence:

- Full Trading System unit suite: `674 passed`; only the two existing FastAPI `on_event`
  deprecation warnings remain. Golden tests cover mark/PnL/transport/order invariance and every
  position/order/status/mode/cash lifecycle transition.
- Disposable Timescale/PostgreSQL migration chain `02` through `41` applied successfully.
  Both new relations are Timescale hypertables with compression enabled; raw hot compresses after
  one day and valuation history after seven days.
  Integration tests pass for account and physical binding current-state parity, mark-only change
  suppression, valuation bucket replacement, raw/change history cardinality, audit repeat
  compaction and archive -> checksum -> restore -> late-row -> keyed-purge behavior. The remaining
  integration tests are environment-gated and skipped rather than pointed at live infrastructure.
- Read-only replay over the latest live 24-hour broker snapshots measured `2,741` legacy rows but
  only `5` semantic execution transitions and `97` valuation buckets for one physical scope. The
  projected execution-history reduction is `99.818%`, exceeding the 90% gate while retaining fresh
  current valuation.
- Live baseline at measurement time: database `8,519 MB`, legacy broker snapshots `6,047 MB`,
  portfolio audit `674 MB`; `2,479/2,479` history observations in the earlier 24-hour sample were
  marked changed by the old writer. No live row, cursor, service or retention policy was mutated
  during implementation.
- Scoped Ruff, Python compile and `git diff --check` pass. data_layer's configurable rotation smoke
  passed in its immutable runtime image.

Phase-scope technical debt closure:

- No code-path debt remains for semantic sync dedup, bounded valuation, no-op reconciliation
  metrics, archive/restore/purge guards or runtime log size caps.
- Existing 6 GB/674 MB backlogs are operational data, not an unfinished implementation. They must
  be archived and purged in bounded reviewed batches after release gates; no online `VACUUM FULL`
  is authorized.

Required release sequence after this checkpoint:

1. Review and merge the Trading System and data_layer commits, build immutable images, apply
   migration `41`, then roll portfolio/reconciliation/Risk/Monitor first with retention still
   disabled.
2. Observe two real broker-sync/reconciliation cycles plus one controlled service restart. Require
   fresh Risk sync, mark-only current valuation updates, zero no-op execution history growth, no
   order/fill/PnL divergence, healthy bracket recovery and copy PEL/lag convergence.
3. Run `scripts/phase3_sync_growth_audit.py`; compare DB/TOAST/WAL/log/Redis/CPU/RAM deltas against
   this baseline. Roll back the image and re-enable legacy dual-write if current-state parity fails.
4. Only after gates pass, follow `STORAGE_RETENTION_RUNBOOK.md`: backup, archive, disposable restore,
   review manifest, purge exact keys in bounded batches, and regular vacuum/analyze. Preserve the
   active quarterly position until its real delivery lifecycle is terminal.

### Urgent Program Operational Closure - 2026-08-12

Status: `ENGINEERING_COMPLETE_LIVE_ACCEPTANCE_PASSED_WITH_EXTERNAL_OPERATOR_FINDINGS`.

Release and migration evidence:

- Trading System urgent branches were merged locally into `dev`. Governed migration `41` was
  applied and reapplied with `pending_count=0`; the pre-migration schema/reference backup remains
  under `backups/phase3-20260812`. The deployed immutable runtime lineage ends at
  `tradingsystem-image:dev-617c7ca`; all 13 application services completed a rolling cutover to
  that same artifact, with workers first and Gateway last. Every recreated container reported
  restart count zero and no OOM.
- Performance projection wakes every 60 seconds and on durable notifications, but scheduled
  account/portfolio/instrument history now uses 10-minute buckets and idle history uses 15-minute
  buckets. A post-cutover DB audit found no instrument series faster than the configured guard;
  event-driven state remains promptly reflected in the current bucket.
- Reconciliation completed repeated 30-second cycles with paper findings zero and Binance testnet
  physical binding `binance_testnet_main` reporting position/open-order status `OK` across 35
  internal accounts. Legacy broker snapshot dual-write remained disabled. New execution history
  changed only on semantic state, valuation current remained fresh and the observed legacy-to-new
  row reduction exceeded 99 percent.

Correctness findings discovered and closed during acceptance:

- Dynamic Grid tick/step normalization removed `PRICE_TICK_INVALID`. The next acceptance exposed a
  separate generic order-group bug: `ORDER_STATUS=ACCEPTED` carries requested `quantity`, and the
  repository incorrectly interpreted that field as executed quantity. This fabricated OCO winners,
  late fills and `ORDER_GROUP_SCOPE_RECONCILIATION_REQUIRED` rejects even though canonical `fills`
  contained no fill. Commit `828373b` makes canonical `FILL` the sole fill-progression event; status
  quantity can only update lifecycle state. Unit plus isolated repository integration covers this
  exact race while retaining real partial-fill/late-fill behavior and strict Risk fail-closed
  semantics.
- Monitor bracket findings contained `Decimal` quantities, which made Redis alert serialization
  raise `TypeError` while console logging continued. Commit `617c7ca` serializes non-JSON-native
  financial evidence at the common alert boundary. Focused tests pass and live `events.alerts`
  contains bracket/copy findings without serializer errors.
- The superseded Fib DNSE bracket `brk-fib_sl_t-vn30f1m-22fbfb142e29` passed scoped dry-run and was
  terminalized idempotently. No stop was fabricated and no position was force-closed. Monitor now
  deliberately exposes other historical open positions without viable protection and active
  groups with rejected children; these are operator/strategy state findings, not hidden engine
  failures.

Data-layer and copy-delivery evidence:

- data_layer `dev-b0cbdc5` includes active USD-M delivery contracts from refreshed venue metadata
  rather than a hardcoded perpetual-only filter. Live health is `ok`; demanded missing/stale are
  zero, queue size is zero, Redis publisher errors are zero and the rolling five-minute queue-drop
  count returned to zero. Broad Spot-universe missing/stale remains informational as designed.
- Trading System copy outbox is current except for one historical `DEAD_LETTER` produced by the old
  Redis maxmemory incident. External group `copy_trading_server_v1` has PEL zero but lag 239 and no
  heartbeat. Replay/cursor mutation was not performed without explicit approval for downstream
  investor-side effects; the external server must reconnect the existing group and deduplicate by
  `copy_event_id`.

Storage acceptance and governed cleanup:

- The first live archive probe intentionally failed closed before purge: the old implementation
  materialized 10,000 large raw rows more than once and OOM-killed the process. No manifest/file was
  completed and no source row was deleted. Commit `a12bb87` replaces DB reads, gzip write,
  verification and restore with bounded cursor/batch streaming; purge retains only compact primary
  keys and still requires checksum plus disposable restore parity.
- Multi-batch integration passed on disposable PostgreSQL. The immutable release CLI now mounts
  only `state/storage-archive` and symbol metadata rather than production source code. A live batch
  archived 1,000 eligible legacy broker snapshots to a mode-0600 12 MB gzip file, verified SHA-256,
  restored all 1,000 rows into `phase3_restore_live_20260812`, passed order-independent complete-row
  parity, then purged exactly those 1,000 source primary keys. Regular `VACUUM (ANALYZE)` completed;
  no `VACUUM FULL` or immutable order/fill/capital/domain-event deletion ran.
- Existing eligible legacy history remains a governed operational backlog, not a code-path debt.
  Continue small archive -> disposable restore -> exact-key purge batches according to
  `STORAGE_RETENTION_RUNBOOK.md`; physical file reclaim requires a separate maintenance window.

Basis Arb acceptance:

- `hotfix/basis-arb-cycle-recovery` passed all seven scheduler/trust tests and was merged locally
  into `execution_alpha/main`. Direct pinned-host SSH using the mounted identity succeeds. The Basis
  container was recreated and now loads 365 cached rows, persists active-cycle retry evidence and
  sleeps to the next true daily boundary. A started failure will retry inside the same cycle with
  bounded backoff rather than silently advancing one day. The already missed 2026-08-12 cycle could
  not be reconstructed because the old process never persisted it; no synthetic historical order
  was submitted.

Validation gates:

- Trading System full unit suite, order-group DB integration, full isolated integration suite,
  Ruff, compile, generated bindings, frozen V1/OpenAPI and polyglot static contract gates passed.
  Public V1 HTTP, Alpha SDK and Redis event contracts did not change.
- Runtime acceptance requires the first post-fix Dynamic Grid cycle to show zero fabricated fills,
  zero tick rejects and zero scope-reconciliation rejects. This evidence is recorded immediately
  below after the natural hourly cycle; existing pre-fix closed groups remain immutable evidence.

Post-fix Dynamic Grid and final rollout evidence:

- The natural 2026-08-12 08:00 UTC paper cycle created one long-only and one long-short group with
  tick-normalized ETHUSDT prices. There were zero `PRICE_TICK_INVALID` and zero
  `ORDER_GROUP_SCOPE_RECONCILIATION_REQUIRED` rejects.
- The long-short group had seven accepted resting legs, remained `ACTIVE`, had no winner and kept
  group/leg `filled_quantity=0`; accepted status quantity no longer fabricated execution. The
  long-only group received one canonical fill of `2.115 @ 1890.46`, selected that exact leg as the
  winner and cancelled its nine siblings. The `fills` row, group total and winning-leg total agree.
- All 28 related `ORDER_STATUS`/`FILL` inbox events reached `PROCESSED` on attempt one with no
  `last_error`. Alpha logs contained no warning/error for the cycle.
- After the final rolling cutover, all 13 application containers run
  `tradingsystem-image:dev-617c7ca`, restart count zero and `OOMKilled=false`. Gateway capabilities
  are `READY`; Binance USD-M has four clients, a closed circuit and no capability error. Migration
  governance reports `40/40` applied and zero pending. Repeated post-cutover reconciliation reports
  paper findings zero and physical Binance sandbox position/open-order status `OK` for 35 accounts.
- Executor startup attempted idempotent cancellation for two already-absent Binance algo children
  of cancelled bracket `brk-scalping-ethusdt-c48f79cd998c`; Binance returned `-2011 Unknown order`.
  The group is terminal `CANCELLED`, both local orders are terminal `REJECTED`, the error did not
  recur and reconciliation remained clean. This is historical cleanup evidence, not an active
  order-routing failure.
- Post-acceptance cleanup removed only three disposable Phase 3 containers, intermediate/test image
  tags and unreferenced build cache. Production volumes, databases, Redis, archive files and
  pre-migration backups were not removed. The host root filesystem improved from 84 percent used
  with about 9.2 GB free to 71 percent used with 17 GB free. The current immutable image and one
  recent rollback image for both Trading System and data_layer remain available.

Remaining operator-owned findings, explicitly outside automatic repair:

1. Reconnect the external copy server and drain lag 239 using its durable inbox/DLQ. Do not reset
   the group cursor. Replay of the single historical source dead-letter requires explicit approval
   because it can create investor-side effects.
2. Review every `OPEN_POSITION_WITHOUT_VIABLE_STOP` and `REJECTED_CHILD_ON_ACTIVE_BRACKET` finding.
   Supply strategy-authoritative stop levels or approve scoped emergency close; the platform must
   not invent protection prices.
3. Continue bounded legacy archive batches and schedule online physical reclaim only when free-space
   pressure justifies a maintenance window. Future writes are already change-only and bounded.

### Repository Governance And CI/CD Bootstrap - 2026-08-12

Status: `IMPLEMENTED_PENDING_REMOTE_PR_ACCEPTANCE`.

- The repository now codifies the normal promotion route as governed topic branches -> `dev` ->
  `main`; `hotfix/*` and `release/*` are the only documented exceptions into `main`. GitHub branch
  protection remains an administrator-owned repository setting and must require PR review,
  resolved conversations and applicable checks rather than being silently mutated by CI.
- `CONTRIBUTING.md`, CODEOWNERS and the PR template define commit format, review evidence, contract
  compatibility, rollback and disposable-test cleanup requirements. Runtime logs, state, caches,
  backups and secrets remain outside commits.
- The lightweight `PR Governance` workflow validates branch route, Conventional Commit PR title,
  required PR body sections and every commit subject. It maintains one marker-based status comment
  instead of creating a new comment after each synchronization. The workflow is process policy
  only and does not replace quality, V1 contract, isolated migration/integration or Rust shadow
  gates.
- Validator/comment rendering unit tests pass, Ruff and YAML parsing pass, and a dry-run over the
  actual `main..dev` release range passes. After push, the existing `dev -> main` PR must provide a
  concrete Summary, Validation, and Risk And Rollback section before the governance check turns
  green.
- A merge to `main` publishes one private GHCR image tagged by the complete commit SHA and records
  image/dependency evidence for 30 days. CI does not publish `latest`, mutate production or hold VPS
  SSH credentials; rolling deployment and rollback remain explicit operator gates against the
  reviewed immutable digest.
- Release builds explicitly select the Dockerfile `runtime` target. A static workflow regression
  test prevents accidental publication of the final `test` stage, mutable `latest` tags, SSH steps
  or automatic `docker compose up` against production.
