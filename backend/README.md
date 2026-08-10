# QuantBT Portal Backend

Typed FastAPI control plane and service adapters for the QuantBT backtest
portal. Runtime strategy and optimization work is delegated to worker services;
the API imports QuantBT lazily.

By default, market requests use the Pool Alpha `CryptoBinance1m` loader with
DuckDB resampling. `GET /api/datasets` advertises the dynamic source and
`POST /api/runs/preflight` supplies its symbol and timeframe. Unit tests inject
an in-memory or fake loader; production paths remain server-owned.
