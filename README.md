# QuantBT Backtest Portal Prototype

An internal, audit-first portal for running and presenting QuantBT strategy
optimization and backtests. The first strategy is the protected Delta-RSI
research kernel in `strategy/main.py`.

The backend is being built first. See
[`implementation_plan_protoyype.md`](implementation_plan_protoyype.md) for the
domain protocol, architecture, UI specification and phase gates.

## Repository Policy

- `main`: reviewed release baseline.
- `dev`: active portal development.
- QuantBT is consumed through its public API and is not modified here.
- Market data, credentials and generated run artifacts are never committed.

## Backend Development

The scripts reuse the parent Pool Alpha environment and prefer the sibling
QuantBT `src/` tree for local research. Set `QUANTBT_SOURCE_PATH` to override it;
an installed `quantbt-engine` package is used when no local source tree exists.

```bash
./scripts/test_backend.sh
./scripts/run_backend.sh
```

The API binds to `127.0.0.1:8000` by default. OpenAPI is available at
`http://127.0.0.1:8000/api/docs`.

## Market Data

The default dataset source is `crypto-binance-1m`. The API accepts a Binance
futures symbol and target timeframe, then delegates to the canonical
`CryptoBinance1m.load_resampled` DuckDB path under Pool Alpha. It does not copy
market files or expose their server-side location.

```bash
PYTHONPATH=backend/src:. ../.venv/bin/python \
  scripts/smoke_crypto_market_data.py --symbol ETHUSDT --timeframe 1h
```

The current ETHUSDT 1h smoke loads 57,914 bars in about one second. The exact
timing, date range, missing-bar count and content hash are emitted by the
script. Set `PORTAL_DATASET_MANIFEST` only when a fixed manifest-backed dataset
should override the dynamic crypto provider.
