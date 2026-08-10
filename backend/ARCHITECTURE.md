# Backend Architecture

## Dependency Direction

```text
api -> services -> domain
                -> strategies
                -> adapters
                -> repositories
```

`domain` imports no FastAPI, QuantBT or strategy kernel. `QuantBTGateway` is the
only QuantBT public-API boundary. `DeltaRsiStrategyAdapter` is the only runtime
module allowed to lazy-import `strategy.main`.

## Current Foundation

- Typed three-window and Advanced WFO request contracts.
- Typed parameter ranges and account/execution settings.
- UTC OHLCV validation, content hashing and searchsorted window partitioning.
- Dynamic Binance futures provider over the canonical `CryptoBinance1m`
  DuckDB resample hot path; the HTTP request never supplies a path.
- Manifest and in-memory providers retained as explicit fallback/test adapters.
- Strategy registry with an immutable structural contract.
- Lazy QuantBT capability gateway.
- Atomic JSON/Parquet artifact repository with path-containment checks.
- FastAPI health, strategy, dataset, capability and preflight routes.

## Deliberately Not Implemented Yet

- Production WFO/background worker execution.
- Selected-parameter freeze and IS/OOS/Holdout replay.
- Run state persistence and SSE progress.
- Full run artifact schema and report normalization.

Those features remain governed by Phases P0-P4 in the implementation plan.
They must be built below the existing API/domain boundaries rather than placing
notebook code in route handlers.

## Performance Contract

- API startup does not import QuantBT or the Numba strategy kernel.
- The canonical loader resamples from 1m storage before portal normalization;
  the portal never materializes full 1m history for a higher-timeframe run.
- Market data is normalized to UTC float64 OHLCV and hashed once per load.
- Load provenance records provider, source/target resolution, engine,
  validation policy and elapsed seconds without exposing the storage path.
- Three-window partitioning uses index positions, not repeated boolean masks.
- Heavy optimization belongs in a worker process so completion releases RSS.
- Trial/report detail must be persisted columnarly and loaded on demand.

## Local Commands

```bash
./scripts/test_backend.sh
./scripts/run_backend.sh
```

The scripts reuse the parent Pool Alpha environment and prefer the sibling
QuantBT `src/` tree. A deployed service uses the declared `quantbt-engine`
dependency instead.

To test the real market-data boundary without starting FastAPI:

```bash
PYTHONPATH=backend/src:. ../.venv/bin/python \
  scripts/smoke_crypto_market_data.py --symbol ETHUSDT --timeframe 1h
```
