# data_layer contract (market data + VN calendar)

40 operations · OpenAPI 3.1.0 · unauthenticated, bound to 127.0.0.1:8100

> Unlike the Trading System gateway, this spec **is** usable for codegen: 17 operations declare query params and 4 declare request bodies.

| Method | Path | Query params | Body | Codes |
|---|---|---|---|---|
| POST | `/v1/binance/futures/basis-bundle` | — | yes | 200, 422 |
| GET | `/v1/binance/futures/basis/{pair}` | `contract_type`, `period`, `limit`, `start_time`, `end_time` | — | 200, 422 |
| POST | `/v1/binance/futures/continuous-basis-bundle` | — | yes | 200, 422 |
| GET | `/v1/binance/futures/depth/{symbol}` | `limit` | — | 200, 422 |
| GET | `/v1/binance/futures/exchange-info` | `symbol` | — | 200, 422 |
| GET | `/v1/binance/futures/funding-rate/{symbol}` | `limit`, `start_time`, `end_time` | — | 200, 422 |
| GET | `/v1/binance/futures/klines/{symbol}` | `interval`, `limit`, `start_time`, `end_time` | — | 200, 422 |
| GET | `/v1/binance/futures/long-short/{kind}/{symbol}` | `period`, `limit`, `start_time`, `end_time` | — | 200, 422 |
| GET | `/v1/binance/futures/open-interest-history/{symbol}` | `period`, `limit`, `start_time`, `end_time` | — | 200, 422 |
| GET | `/v1/binance/futures/open-interest/{symbol}` | — | — | 200, 422 |
| GET | `/v1/binance/futures/taker-long-short/{symbol}` | `period`, `limit`, `start_time`, `end_time` | — | 200, 422 |
| GET | `/v1/binance/kline/{symbol}` | `interval` | — | 200, 422 |
| GET | `/v1/binance/klines/{symbol}` | `interval`, `limit`, `start_time`, `end_time`, `market` | — | 200, 422 |
| GET | `/v1/binance/price-last/{symbol}` | `market` | — | 200, 422 |
| GET | `/v1/binance/price/{symbol}` | `market` | — | 200, 422 |
| GET | `/v1/control/feed-demands` | — | — | 200 |
| POST | `/v1/control/feed-leases` | — | yes | 200, 422 |
| DELETE | `/v1/control/feed-leases/{owner_id}` | — | — | 200, 422 |
| GET | `/v1/control/provider-priority` | — | — | 200 |
| GET | `/v1/control/runtime-roles` | — | — | 200 |
| GET | `/v1/control/session-calendar` | — | — | 200 |
| GET | `/v1/control/universe/active` | — | — | 200 |
| GET | `/v1/control/universe/configured` | — | — | 200 |
| GET | `/v1/control/universe/priority` | — | — | 200 |
| POST | `/v1/crypto/ohlcv/{provider}/batch` | — | yes | 200, 422 |
| GET | `/v1/crypto/ohlcv/{provider}/{symbol}` | `interval`, `limit`, `start_time`, `end_time`, `market` | — | 200, 422 |
| GET | `/v1/crypto/ohlcv/{provider}/{symbol}/{interval}` | `limit`, `start_time`, `end_time`, `market` | — | 200, 422 |
| GET | `/v1/fallback/crypto/reference/{symbol}` | `feed`, `interval`, `limit`, `force`, `include_data` | — | 200, 422 |
| GET | `/v1/fallback/crypto/status/{symbol}` | `interval` | — | 200, 422 |
| GET | `/v1/health` | — | — | 200 |
| GET | `/v1/health/streams` | — | — | 200 |
| POST | `/v1/preload/append/{symbol}` | — | — | 200, 422 |
| POST | `/v1/preload/materialize` | — | — | 200 |
| POST | `/v1/preload/materialize/{symbol}` | — | — | 200, 422 |
| POST | `/v1/preload/run` | — | — | 200 |
| GET | `/v1/preload/status` | — | — | 200 |
| GET | `/v1/preload/{symbol}` | `interval`, `limit`, `fresh` | — | 200, 422 |
| GET | `/v1/vn/board` | — | — | 200 |
| GET | `/v1/vn/quote-last/{symbol}` | — | — | 200, 422 |
| GET | `/v1/vn/quote/{symbol}` | — | — | 200, 422 |

`*` = required.
