# Declared configuration surface (defaults only, secrets redacted)

| Setting | Type | Declared default | Category |
|---|---|---|---|
| `IS_TESTNET` | `bool` | `True` | other |
| `DEFAULT_TRADING_MODE` | `str` | `paper` | feature flag |
| `LOG_LEVEL` | `str` | `INFO` | other |
| `TRADING_ADMIN_USER` | `str` | `bobby` | gateway/admin |
| `TRADING_ADMIN_PASSWORD` | `str` | 🔒 redacted | gateway/admin |
| `TRADING_ADMIN_TOKEN` | `str` | 🔒 redacted | gateway/admin |
| `TRADING_ADMIN_PASSWORD_FILE` | `str` | 🔒 redacted | gateway/admin |
| `TRADING_ADMIN_TOKEN_FILE` | `str` | 🔒 redacted | gateway/admin |
| `PERFORMANCE_SNAPSHOT_INTERVAL_SECONDS` | `int` | `60` | timing |
| `PERFORMANCE_INSTRUMENT_SNAPSHOT_INTERVAL_SECONDS` | `int` | `600` | timing |
| `PERFORMANCE_ACTIVE_SNAPSHOT_INTERVAL_SECONDS` | `int` | `600` | timing |
| `PERFORMANCE_PENDING_SNAPSHOT_INTERVAL_SECONDS` | `int` | `600` | timing |
| `PERFORMANCE_IDLE_SNAPSHOT_INTERVAL_SECONDS` | `int` | `900` | timing |
| `PERFORMANCE_MARK_PRICE_MAX_AGE_SECONDS` | `int` | `180` | timing |
| `BROKER_SYNC_VALUATION_BUCKET_SECONDS` | `int` | `900` | timing |
| `BROKER_SYNC_LEGACY_SNAPSHOT_WRITE_ENABLED` | `bool` | `False` | feature flag |
| `RISK_MARKET_DATA_MAX_AGE_SECONDS` | `int` | `180` | timing |
| `RISK_DATA_LAYER_RECOVERY_ENABLED` | `bool` | `True` | feature flag |
| `RISK_DATA_LAYER_RECOVERY_TIMEOUT_SECONDS` | `float` | `3.0` | timing |
| `RISK_ORDER_INTENT_MAX_AGE_SECONDS` | `float` | `30.0` | timing |
| `GATEWAY_RATE_LIMIT_PER_SECOND` | `int` | `300` | gateway/admin |
| `GATEWAY_RATE_LIMIT_SCOPE` | `str` | `account` | gateway/admin |
| `GATEWAY_API_KEY_PEPPER` | `str` | 🔒 redacted | gateway/admin |
| `GATEWAY_API_KEY_PEPPER_FILE` | `str` | 🔒 redacted | gateway/admin |
| `GATEWAY_LEGACY_PLAINTEXT_API_KEYS_ENABLED` | `bool` | 🔒 redacted | gateway/admin |
| `COMPATIBILITY_TELEMETRY_TTL_DAYS` | `int` | `120` | timing |
| `CONTRACT_SHADOW_ENABLED` | `bool` | `False` | feature flag |
| `CONTRACT_SHADOW_SAMPLE_RATE` | `float` | `1.0` | feature flag |
| `CONTRACT_SHADOW_MAX_ALPHA_SCOPES` | `int` | `256` | feature flag |
| `COMMAND_JOURNAL_ROLLOUT` | `str` | `OFF` | feature flag |
| `COMMAND_JOURNAL_CANARY_SCOPES` | `str` | `` | event/command plane |
| `COMMAND_JOURNAL_POLL_INTERVAL_MS` | `int` | `50` | timing |
| `COMMAND_JOURNAL_BATCH_SIZE` | `int` | `100` | event/command plane |
| `COMMAND_JOURNAL_LEASE_SECONDS` | `int` | `30` | timing |
| `COMMAND_JOURNAL_MAX_ATTEMPTS` | `int` | `10` | timing |
| `COMMAND_JOURNAL_DISPATCH_DEDUP_TTL_SECONDS` | `int` | `604800` | timing |
| `COMMAND_JOURNAL_STREAM_MAXLEN` | `int` | `20000` | event/command plane |
| `COMMAND_JOURNAL_ACK_REQUIRED` | `bool` | `False` | event/command plane |
| `COMMAND_JOURNAL_RETENTION_ENABLED` | `bool` | `False` | feature flag |
| `COMMAND_JOURNAL_RETENTION_MIN_AGE_SECONDS` | `int` | `86400` | timing |
| `COMMAND_JOURNAL_RETENTION_INTERVAL_SECONDS` | `int` | `60` | timing |
| `COMMAND_JOURNAL_RETENTION_STREAMS` | `str` | `order.inbound,order.requests,commands.execution.paper,commands.execution.sandbox,commands.execution.live` | event/command plane |
| `COMMAND_JOURNAL_RETENTION_DRY_RUN` | `bool` | `True` | event/command plane |
| `COMMAND_JOURNAL_RETENTION_APPLY_CONFIRMATION` | `str` | `` | event/command plane |
| `COMMAND_JOURNAL_RETENTION_POLICY_REVISION` | `str` | `` | event/command plane |
| `COMMAND_JOURNAL_LEGACY_CUTOVERS` | `str` | `{}` | event/command plane |
| `COMMAND_JOURNAL_ARCHIVE_DIGESTS` | `str` | `{}` | event/command plane |
| `COMMAND_JOURNAL_ARCHIVE_ROOT` | `str` | `/app/state/redis-archive` | event/command plane |
| `COMMAND_JOURNAL_ARCHIVE_BATCH_SIZE` | `int` | `1000` | event/command plane |
| `COMMAND_JOURNAL_LOOP_BACKOFF_BASE_SECONDS` | `float` | `1.0` | timing |
| `COMMAND_JOURNAL_LOOP_BACKOFF_MAX_SECONDS` | `float` | `30.0` | timing |
| `MONITOR_ALERT_FALLBACK_INTERVAL_SECONDS` | `float` | `60.0` | timing |
| `BATCH_PRE_RISK_ENABLED` | `bool` | `False` | feature flag |
| `RISK_GRANT_TTL_SECONDS` | `int` | `20` | timing |
| `RISK_GRANT_MAX_ORDERS` | `int` | `250` | other |
| `RISK_GRANT_REDIS_PREFIX` | `str` | `risk:grant` | datastore |
| `EXECUTOR_CONCURRENT_SEND_ENABLED` | `bool` | `False` | feature flag |
| `EXECUTOR_PAPER_CONCURRENCY` | `int` | `30` | other |
| `EXECUTOR_BINANCE_CONCURRENCY` | `int` | `5` | venue/broker |
| `EXECUTOR_DNSE_CONCURRENCY` | `int` | `1` | venue/broker |
| `EXECUTOR_OKX_CONCURRENCY` | `int` | `3` | venue/broker |
| `EXECUTOR_RETRY_MAX_ATTEMPTS` | `int` | `2` | timing |
| `EXECUTOR_RETRY_BASE_SECONDS` | `float` | `0.25` | timing |
| `EXECUTOR_RETRY_MAX_SECONDS` | `float` | `2.0` | timing |
| `EXECUTOR_PENDING_CLAIM_IDLE_MS` | `int` | `30000` | other |
| `PORTFOLIO_FILL_MICROBATCH_ENABLED` | `bool` | `False` | feature flag |
| `LEGACY_PORTFOLIO_STATS_ENABLED` | `bool` | `False` | feature flag |
| `COPY_OUTBOX_DEFAULT_STREAM` | `str` | `copy:events:v1` | event/command plane |
| `COPY_OUTBOX_BATCH_SIZE` | `int` | `100` | event/command plane |
| `COPY_OUTBOX_POLL_MS` | `int` | `250` | event/command plane |
| `COPY_OUTBOX_MAX_ATTEMPTS` | `int` | `10` | timing |
| `COPY_OUTBOX_STREAM_MAXLEN` | `int` | `500000` | event/command plane |
| `COPY_DELIVERY_CONSUMER_GROUP` | `str` | `copy_trading_server_v1` | event/command plane |
| `COPY_DELIVERY_LAG_WARNING` | `int` | `100` | event/command plane |
| `COPY_DELIVERY_OLDEST_WARNING_SECONDS` | `float` | `300.0` | timing |
| `COPY_DELIVERY_CONSUMER_STALE_SECONDS` | `float` | `180.0` | timing |
| `ORDER_GROUP_ENGINE_V2_ENABLED` | `bool` | `False` | feature flag |
| `ORDER_GROUP_SHADOW_BRACKETS_ENABLED` | `bool` | `False` | feature flag |
| `ORDER_GROUP_POLL_INTERVAL_MS` | `int` | `100` | timing |
| `ORDER_GROUP_BATCH_SIZE` | `int` | `100` | other |
| `ORDER_GROUP_MAX_ATTEMPTS` | `int` | `10` | timing |
| `ORDER_GROUP_DISPATCH_DEDUP_TTL_SECONDS` | `int` | `30` | timing |
| `ORDER_GROUP_COMMAND_ACK_TIMEOUT_SECONDS` | `int` | `60` | timing |
| `ORDER_GROUP_RECOVERY_INTERVAL_SECONDS` | `float` | `10.0` | timing |
| `ORDER_GROUP_LOOP_BACKOFF_BASE_SECONDS` | `float` | `1.0` | timing |
| `ORDER_GROUP_LOOP_BACKOFF_MAX_SECONDS` | `float` | `30.0` | timing |
| `OKX_EXECUTION_ENABLED` | `bool` | `False` | feature flag |
| `OKX_EXECUTION_ACCEPTANCE_APPROVED` | `bool` | `False` | venue/broker |
| `OKX_DEMO_TRADING` | `bool` | `True` | venue/broker |
| `OKX_API_KEY` | `str` | 🔒 redacted | venue/broker |
| `OKX_API_SECRET` | `str` | 🔒 redacted | venue/broker |
| `OKX_API_PASSPHRASE` | `str` | `` | venue/broker |
| `OKX_API_KEY_FILE` | `str` | 🔒 redacted | venue/broker |
| `OKX_API_SECRET_FILE` | `str` | 🔒 redacted | venue/broker |
| `OKX_API_PASSPHRASE_FILE` | `str` | `` | venue/broker |
| `OKX_REST_URL` | `str` | `https://www.okx.com` | venue/broker |
| `REPLAY_V2_ENABLED` | `bool` | `False` | feature flag |
| `REPLAY_ARTIFACT_ROOT` | `str` | `/app/state/replay` | event/command plane |
| `REPLAY_MAX_EVENTS` | `int` | `100000` | event/command plane |
| `TRADING_REDIS_URL` | `str` | `redis://redis_service:6379/0` | datastore |
| `DATA_LAYER_REDIS_URL` | `str` | `redis://redis_marketdata:6379/0` | datastore |
| `TRADING_MARKET_REDIS_URL` | `str` | `redis://redis_marketdata:6379/1` | datastore |
| `TRADING_REDIS_MAX_CONNECTIONS` | `int` | `100` | datastore |
| `DATA_LAYER_REDIS_MAX_CONNECTIONS` | `int` | `50` | datastore |
| `TRADING_MARKET_REDIS_MAX_CONNECTIONS` | `int` | `100` | datastore |
| `TRADING_MARKET_REDIS_SOCKET_TIMEOUT_SECONDS` | `float` | `2.0` | timing |
| `TRADING_MARKET_REDIS_CONNECT_TIMEOUT_SECONDS` | `float` | `2.0` | timing |
| `TRADING_MARKET_REDIS_HEALTH_CHECK_INTERVAL_SECONDS` | `int` | `15` | timing |
| `MARKET_REDIS_ROLLOUT` | `str` | `CORE_ONLY` | feature flag |
| `MARKET_REDIS_SHADOW_COMPARE_SAMPLE_RATE` | `float` | `0.01` | feature flag |
| `MARKET_REDIS_METRICS_INTERVAL_SECONDS` | `float` | `10.0` | timing |
| `MARKET_DATA_ACTIVE_SCOPE_ENABLED` | `bool` | `True` | feature flag |
| `MARKET_DATA_ACTIVE_SCOPE_REFRESH_SECONDS` | `float` | `30.0` | timing |
| `REDIS_URL` | `str` | `redis://redis_service:6379/0` | datastore |
| `DATA_LAYER_URL` | `str` | `http://data_layer:8100` | endpoint |
| `POSTGRES_DSN` | `str` | `` | datastore |
| `POSTGRES_DSN_FILE` | `str` | `` | datastore |
| `BINANCE_LIVE_KEYS` | `str` | `[]` | venue/broker |
| `BINANCE_TESTNET_KEYS` | `str` | `[]` | venue/broker |
| `BINANCE_LIVE_KEYS_FILE` | `str` | `` | venue/broker |
| `BINANCE_TESTNET_KEYS_FILE` | `str` | `` | venue/broker |
| `BINANCE_DIRECT_REST_FALLBACK_ENABLED` | `bool` | `True` | feature flag |
| `BINANCE_FUTURES_REST_TIMEOUT_SECONDS` | `float` | `8.0` | timing |
| `BINANCE_CIRCUIT_FAILURE_THRESHOLD` | `int` | `3` | venue/broker |
| `BINANCE_CIRCUIT_COOLDOWN_SECONDS` | `float` | `120.0` | timing |
| `BINANCE_FUTURES_TESTNET_REST_URLS` | `str` | `https://testnet.binancefuture.com,https://demo-fapi.binance.com` | venue/broker |
| `BINANCE_FUTURES_LIVE_REST_URLS` | `str` | `https://fapi.binance.com` | venue/broker |
| `BINANCE_SPOT_TESTNET_REST_URLS` | `str` | `https://testnet.binance.vision` | venue/broker |
| `BINANCE_SPOT_LIVE_REST_URLS` | `str` | `https://api.binance.com` | venue/broker |
| `LISTENER_API_KEY` | `str | None` | 🔒 redacted | other |
| `LISTENER_API_SECRET` | `str | None` | 🔒 redacted | other |
| `LISTENER_API_KEY_FILE` | `str` | 🔒 redacted | other |
| `LISTENER_API_SECRET_FILE` | `str` | 🔒 redacted | other |
| `TCBS_USER` | `str | None` | `None` | other |
| `TCBS_PASSWORD` | `str | None` | 🔒 redacted | other |
| `TCBS_2FA_SECRET` | `str | None` | 🔒 redacted | other |
| `SYMBOL_CONFIG_PATH` | `str` | `./shared/symbols.json` | other |
| `MARKET_DATA_BINANCE_SYMBOLS` | `str` | `` | venue/broker |
| `MARKET_DATA_VN_SYMBOLS` | `str` | `` | other |
| `MARKET_DATA_BINANCE_SYMBOL_LIMIT` | `int` | `300` | venue/broker |
| `MARKET_DATA_VN_SYMBOL_LIMIT` | `int` | `120` | other |
| `MARKET_DATA_RECONNECT_BASE_SECONDS` | `float` | `1.0` | timing |
| `MARKET_DATA_RECONNECT_MAX_SECONDS` | `float` | `30.0` | timing |
| `PAPER_MATCHER_POLL_INTERVAL_SECONDS` | `float` | `0.5` | timing |
| `PAPER_DATA_LAYER_MARKET_RECOVERY_ENABLED` | `bool` | `True` | feature flag |
| `PAPER_DATA_LAYER_MARKET_RECOVERY_MAX_AGE_SECONDS` | `float` | `180.0` | timing |
| `PERFORMANCE_DATA_LAYER_MARK_RECOVERY_ENABLED` | `bool` | `True` | feature flag |
| `PERFORMANCE_DATA_LAYER_MARK_RECOVERY_TIMEOUT_SECONDS` | `float` | `3.0` | timing |
| `RUST_SHADOW_MODE` | `str` | `OFF` | feature flag |
| `RUST_SHADOW_COMPONENTS` | `str` | `RISK` | feature flag |
| `RUST_SHADOW_ACCOUNT_IDS` | `str` | `` | feature flag |
| `RUST_SHADOW_TRADING_MODES` | `str` | `paper` | feature flag |
| `RUST_SHADOW_VENUES` | `str` | `BINANCE,DNSE` | feature flag |
| `RUST_SHADOW_SAMPLE_RATE` | `float` | `1.0` | feature flag |
| `RUST_SHADOW_TIMEOUT_MS` | `float` | `25.0` | timing |
| `RUST_SHADOW_MAX_EVIDENCE_BYTES` | `int` | `65536` | feature flag |
| `ENGINE_AUTHORITY_ENABLED` | `bool` | `False` | feature flag |
| `ENGINE_AUTHORITY_LEASE_SECONDS` | `int` | `30` | timing |
| `ENGINE_AUTHORITY_TIMEOUT_MS` | `float` | `25.0` | timing |
