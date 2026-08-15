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
- Dynamic Binance futures provider over the approved installed
  `primus-historical-market-data==0.1.0rc3` wheel and canonical
  `CryptoBinance1m` DuckDB resample hot path; the HTTP request never supplies a
  path and the release manifest fails closed.
- Manifest and in-memory providers retained as explicit fallback/test adapters.
- Strategy registry with an immutable structural contract.
- Lazy QuantBT capability gateway.
- Atomic JSON/Parquet artifact repository with path-containment checks.
- FastAPI health, strategy, dataset, capability and preflight routes.
- Phase P1 clean strategy package (`strategy/delta_rsi.py` owns the lazy
  kernel boundary; golden parity certified in `test_golden_parity.py`).
- Phase P2 three-window Mode 1 orchestration (`services/three_window_runner.py`):
  IS+OOS-only calibration tape, `train_test_split(mode_1_decay)`, selected-
  params freeze before Holdout, fresh-account `pct_equity` replay of the three
  segments, canonical artifacts (§11 subset), calendar/rebased presentation
  equity and the leakage/parity test battery (`test_three_window_runner.py`).
- v0.1.1 Run Progress: deterministic fold plan (`services/fold_plan.py`,
  QuantBT-parity port of `build_folds`; artifact `config/fold_plan.json`
  written at submit + by the worker) and operational progress counters
  (`GET /api/runs/{id}/progress`, parsed from the worker console capture —
  display-only estimates; the structured ledger stays the audit source).

## Current Prototype Limits

- Runs execute in a local `ProcessPoolExecutor`; this is process isolation, not
  the durable distributed queue/lease/redelivery authority planned for U11.
- Run state and SSE work for the current service, but are backed by local
  process/filesystem state rather than PostgreSQL read models and a durable
  event stream.
- JSON/Parquet artifacts are atomically persisted in the current repository,
  but content-addressed object-store finalization, attempt identity, orphan
  reconciliation and corrupt-bundle handling remain U11 work.
- Current typed three-window and Advanced WFO paths are compatibility
  authorities. Generic capability-driven engine dispatch remains U12 work.
- Dataset Snapshot/Catalog identity and per-family quality authority remain U13
  work; U01-BE certifies only the first bounded Binance perpetual OHLCV path.

Future backend work follows
`upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` and the Unified Plan. It
must be built below the existing API/domain boundaries rather than placing
compute or cross-domain imports in route handlers.

The next designed backend boundary is BAR-01, documented at
`upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md`. It defines a
source-controlled Feature/Screen/Concern Registry and read-only Command Center
summary adapters without granting this FastAPI service new write authority.

## Performance Contract

- API startup does not import QuantBT or the Numba strategy kernel.
- Historical input is for backtest/research only. Realtime market data, paper
  orders/fills and paper account state are separate service boundaries.
- The canonical loader resamples from 1m storage before portal normalization;
  the portal never materializes full 1m history for a higher-timeframe run.
- Every historical service query has explicit symbol, timezone-aware start and
  end-exclusive bounds; loader validation remains enabled.
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

The scripts use this application's virtual environment (or an explicitly set
`POOL_ALPHA_PYTHON`). QuantBT is always supplied by the published
`quantbt-engine==1.0.8` dependency with its `optimization` extra; the gateway
verifies that exact installed PyPI distribution at first use, rejects local
module shadowing, and never adds a sibling source checkout to `sys.path`.

Run `./scripts/smoke_quantbt_pypi.sh` to execute the deterministic fixture gate
without a market-data service. It covers package provenance plus the public
three-window and Advanced WFO endpoint paths used by the portal.

To verify the installed wheel + release manifest without reading bars:

```bash
HISTORICAL_MARKET_DATA_ROOT=/srv/primus/historical-market-data/storage \
  .venv/bin/python -m portal_api.historical_data_doctor
```

To test the real historical backtest boundary without starting FastAPI:

```bash
PYTHONPATH=backend/src:. .venv/bin/python \
  scripts/smoke_crypto_market_data.py --symbol BTCUSDT --timeframe 1h \
  --start 2026-08-01T00:00:00+00:00 \
  --end-exclusive 2026-08-02T00:00:00+00:00
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
