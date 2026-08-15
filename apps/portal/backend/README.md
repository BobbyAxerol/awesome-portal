# QuantBT Portal Backend

Typed FastAPI control plane and service adapters for the QuantBT backtest
portal. Runtime strategy and optimization work is delegated to worker services;
the API imports QuantBT lazily.

Historical requests use the approved `primus-historical-market-data==0.1.0rc3`
reader wheel, accepted release manifest and canonical read-only storage.
`GET /api/datasets` advertises availability plus explicit backtest/research
scope; realtime and paper-trading data are separate service boundaries.
`POST /api/runs/preflight` supplies symbol, timeframe and bounded calibration
dates. Unit tests inject an in-memory/fake reader; production paths remain
server-owned and fail closed.
