# Backend Architecture

## Dependency Direction

```text
api -> services -> domain
                -> strategies
                -> adapters
                -> repositories
```

`domain` imports no FastAPI, QuantBT or strategy kernel. `QuantBTGateway` is the
only QuantBT public-API boundary. `strategy.delta_rsi` (Phase P1 package) is
the only module allowed to lazy-import the protected `strategy.main` kernel;
`DeltaRsiStrategyAdapter` routes through it and never touches the kernel
directly.

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

## P0 Capability Gap Note (2026-08-10)

Verified against the read-only QuantBT public API source; all gaps are
recorded, none silently worked around. Field lists below are the actual public
surface, not aspirational.

### Metrics (§11.3) — complete

`full_report(result, trading_days)` provides all 19 metric fields:
`initial_capital`, `final_equity`, `total_return_pct`, `cagr_pct`, `sharpe`,
`sortino`, `calmar`, `omega`, `max_drawdown_pct`, `avg_drawdown_pct`,
`max_dd_duration_days`, `profit_factor`, `long_hitrate_pct`,
`short_hitrate_pct`, `avg_win_pct`, `avg_loss_pct`, `expectancy_pct`,
`num_trades`, `liquidated`.

### WFO metadata (§11.4) — available

- `fold_table`: fold_id, train_start/end, test_start/end, train_bars,
  test_bars.
- `fold_selection_table`: fold_id, study_id, fold_seed, train/test windows,
  selected_trial_id, selected_params, selected_is_objective,
  candidate_is_metric, candidate_oos_metric, candidate_decay,
  candidate_count, study_trial_rows, outer_oos_used_for_selection,
  causality_claim.
- `fold_boundary_table`, `params_by_fold`, `best_trial` with
  `selection_metadata` (study_id, fold_seed, temporal_*, plateau_*,
  is_only_robust_score, outer_oos_used_for_selection, ...).
- `trial_table` / `candidate_table`: trial_id, params, objective,
  mean_is_sharpe, mean_oos_sharpe, mean_decay, std_decay, pruned,
  fold_metrics, selection_metadata (flattened per-trial keys when present).
- run-level metadata: `optimization_schedule`, `validation_claim`,
  `causality_claim`, `oos_used_for_selection`, `params_semantics`, `n_folds`,
  `n_studies`, `optuna_trials_scope`.

### Gap — per-trial selection-trace breakdown (§11.4, §15.6)

The granular `selection_trace.json` fields (is_sharpe_raw / is_sharpe_
penalized / is_trade_count / is_trade_penalty / is_rank / is_top_candidate /
oos_sharpe_raw / oos_sharpe_penalized / oos_trade_count / oos_trade_penalty)
are **not** exposed per trial by the public API. The selection trace artifact
must be built from the fields above (objective, mean_is_sharpe,
mean_oos_sharpe, mean_decay, candidate/count columns, best_trial) and the
missing keys omitted with a capability flag. Do not invent the breakdown.

### Gap — segment series (§11.2)

- Available: `equity`, `returns`, `positions` (accepted_position), `closes`
  on `BacktestResult`; OHLCV from the market tape.
- Available from the strategy adapter (kernel output, not fills):
  `signal_target`, `exit_type`, `exit_price`.
- `drawdown`: not on the result; portal may compute it from equity for the
  presentation series only, and the reconciliation check must compare it to
  QuantBT reporting values.
- **Fee**: scalar config only (`metadata.fee_oneway`); there is no per-bar fee
  series. Fee timeline must be omitted until QuantBT exposes one.
- **Funding**: funding series is prepared internally but not exposed on
  `BacktestResult`; funding timeline must be omitted (integration gap).
- **Margin**: `initial_margin`, `maintenance_margin`, `available_equity` are
  absent (only `maintenance_ratio` and `initial_buying_power` metadata exist);
  margin fields must be omitted, not invented.

### Replay path

`QuantBTEndpoint.pct_equity(**account_kwargs).backtest(data=..., signal=...)`
is the audited path for frozen-param segment replay (the legacy wrapper's
`run_frozen_pct_equity_segment` is the reference flow).

### Residual risks

- The exact JSON shape of QuantBT metadata keys is not versioned by QuantBT;
  the canonical serializer (`portal_api.serialization`) pins accepted types,
  and a metadata schema-version bump in P3 must be paired with a golden
  re-capture.
- `optuna_trials_scope` / `selection_metadata` presence depends on the
  schedule/mode; artifacts must tolerate missing keys via capability flags.
