"""Advanced walk-forward orchestration runner (Phase P3, plan §10.10).

Routes the full typed Advanced WFO request through the public QuantBT
``walk_forward`` endpoint with a capability-validated ``WalkForwardConfig``.
Per-fold artifacts (fold/fold_selection/fold_boundary tables, trials,
candidates, params_by_fold) are persisted canonically; the final stitched
account run is stored as the single execution series. Deployment params
semantics are taken from QuantBT metadata, never inferred from the last fold
(plan §26.8).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any, Callable, Mapping

import pandas as pd

from portal_api import __version__ as portal_version
from portal_api.adapters.market_data import PreparedMarketData, slice_market_range
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.enums import OptimizationMode, RunProtocol
from portal_api.domain.requests import (
    AdvancedWalkForwardConfig,
    PortalRunRequest,
)
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.serialization import canonicalize
from portal_api.services.three_window_runner import (
    ARTIFACT_SCHEMA_VERSION,
    _sanitize,
    _strategy_artifact,
    _strategy_callable,
)
from portal_api.strategies import StrategyRegistry


class AdvancedWalkForwardError(RuntimeError):
    pass


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _config_fields(config: AdvancedWalkForwardConfig) -> dict[str, Any]:
    opt = config.optimization
    return {
        "split_mode": config.split_mode,
        "split_frequency": config.split_frequency,
        "window_mode": config.window_mode,
        "train_window": config.train_window,
        "min_train_bars": config.min_train_bars,
        "min_test_bars": config.min_test_bars,
        "target_mode": "pct_equity",
        "fill_value": config.fill_value,
        "optimization_mode": config.optimization_mode.value,
        "optimization_schedule": config.optimization_schedule.value,
        "fold_boundary_position_policy": config.fold_boundary_position_policy,
        "optuna_trials": config.optuna_trials,
        "optuna_early_stopping": config.optuna_early_stopping,
        "random_seed": config.random_seed,
        "decay_lambda": opt.decay_lambda,
        "decay_gamma": opt.decay_gamma,
        "top_is_fraction": opt.top_is_fraction,
        "top_is_k": opt.top_is_k,
        "candidate_selection_metric": opt.candidate_selection_metric,
        "candidate_decay_lambda": opt.candidate_decay_lambda,
        "candidate_decay_gamma": opt.candidate_decay_gamma,
        "flat_top_fraction": opt.flat_top_fraction,
        "flat_eps": opt.flat_eps,
        "flat_min_samples": opt.flat_min_samples,
        "flat_selector": opt.flat_selector,
        "plateau_quantile": opt.plateau_quantile,
        "plateau_median_weight": opt.plateau_median_weight,
        "plateau_std_penalty": opt.plateau_std_penalty,
        "plateau_size_bonus": opt.plateau_size_bonus,
        "is_subperiods": opt.is_subperiods,
        "q25_weight": opt.q25_weight,
        "dispersion_penalty": opt.dispersion_penalty,
        "temporal_weight": opt.temporal_weight,
        "plateau_weight": opt.plateau_weight,
        "use_bootstrap_penalty": opt.use_bootstrap_penalty,
        "use_complexity_penalty": opt.use_complexity_penalty,
        "sbb_samples": opt.sbb_samples,
        "sbb_block_length": opt.sbb_block_length,
        "sbb_decay_lambda": opt.sbb_decay_lambda,
        "sbb_std_penalty": opt.sbb_std_penalty,
        "sbb_simulation": opt.sbb_simulation,
        "regime_count": opt.regime_count,
        "regime_lookback": opt.regime_lookback,
        "regime_weights": opt.regime_weights,
        "stress_vol_multiplier": opt.stress_vol_multiplier,
        "garch_p": opt.garch_p,
        "garch_q": opt.garch_q,
        "garch_dist": opt.garch_dist,
        "garch_vol_multiplier": opt.garch_vol_multiplier,
        "scoring_backend": opt.scoring_backend,
        "scoring_trading_days": opt.scoring_trading_days,
        "min_trades_per_year": opt.min_trades_per_year,
        "trade_penalty_factor": opt.trade_penalty_factor,
        "use_numba": opt.use_numba,
    }


class AdvancedWalkForwardRunner:
    def __init__(
        self,
        *,
        gateway: QuantBTGateway,
        artifacts: ArtifactRepository,
    ):
        self._gateway = gateway
        self._artifacts = artifacts

    def validate_capabilities(self) -> None:
        """Matrix-driven gate: pct_equity must be a supported target mode."""
        rows = self._gateway.walkforward_capabilities()
        supported = {
            str(row.get("target_mode"))
            for row in rows
            if str(row.get("status")).strip().lower() == "supported"
        }
        if "pct_equity" not in supported:
            raise AdvancedWalkForwardError(
                "pct_equity is not a supported walk-forward target mode in this QuantBT build"
            )

    def run(
        self,
        request: PortalRunRequest,
        market: PreparedMarketData,
        run_id: str,
        progress: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        if request.protocol != RunProtocol.ADVANCED_WALK_FORWARD:
            raise AdvancedWalkForwardError("AdvancedWalkForwardRunner requires protocol=advanced_walk_forward")
        if not isinstance(request.calibration, AdvancedWalkForwardConfig):
            raise AdvancedWalkForwardError("AdvancedWalkForwardRunner requires AdvancedWalkForwardConfig")

        def stage(name: str) -> None:
            if progress is not None:
                progress(name)

        self.validate_capabilities()
        config = request.calibration
        active_market = slice_market_range(
            market,
            start=config.data_start,
            end_exclusive=config.data_end_exclusive,
        )
        fields = _config_fields(config)
        self._gateway.validate_advanced_walkforward(config_fields=fields)

        from quantbt.walkforward import WalkForwardConfig

        wf_config = WalkForwardConfig(**fields)

        fixed_params = None
        if config.optimization_mode == OptimizationMode.NONE:
            fixed_params = {
                key: spec.value
                for key, spec in request.parameter_space.root.items()
                if spec.kind == "fixed"
            }
            if len(fixed_params) != len(request.parameter_space.root):
                raise AdvancedWalkForwardError(
                    "optimization_mode=none requires every parameter to be fixed"
                )

        from portal_api.services.three_window_runner import _quantbt_param_ranges, _account_kwargs

        account_kwargs = _account_kwargs(request.account, request.execution)
        started_at = _utc_now_iso()
        stage("OPTIMIZING_IS")
        endpoint, wf = self._gateway.run_advanced_walkforward(
            strategy_fn=_strategy_callable,
            data=active_market.frame,
            wf_config=wf_config,
            optimization_config=dict(fields),
            param_ranges=(
                _quantbt_param_ranges(request.parameter_space.root) if fixed_params is None else None
            ),
            fixed_params=fixed_params,
            account_kwargs=account_kwargs,
        )
        completed_at = _utc_now_iso()

        self._write_wfo_artifacts(run_id, wf)
        selected = _freeze_deployment_selection(wf, config)
        self._artifacts.write_json(run_id, "selection/selected_params.json", selected)
        self._artifacts.write_json(run_id, "selection/selection_trace.json", selected["trace"])

        metrics = self._gateway.metrics(
            endpoint, trading_days=int(config.optimization.scoring_trading_days)
        )
        result = endpoint.result
        series = _stitched_series(active_market.frame, result)
        self._artifacts.write_frame(run_id, "series/stitched.parquet", series)
        non_finite: list[str] = []
        clean_metrics = _sanitize({"stitched": metrics}, non_finite=non_finite)
        warnings = [f"non-finite metric field: {path}" for path in non_finite]
        self._artifacts.write_json(
            run_id,
            "metrics.json",
            {"segments": clean_metrics, "reconciliation": {}, "warnings": warnings},
        )
        self._artifacts.write_json(
            run_id,
            "config.json",
            canonicalize(request.model_dump(mode="json")),
        )
        # Parity with the three-window runner: strategy.json feeds the audit
        # endpoint, which 404s without it (v0.1.1 bugfix).
        spec = StrategyRegistry().get(request.strategy_id).specification
        self._artifacts.write_json(run_id, "strategy.json", _strategy_artifact(spec))
        self._artifacts.write_json(
            run_id,
            "manifest.json",
            canonicalize(
                {
                    "run_id": run_id,
                    "status": "COMPLETED",
                    "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
                    "protocol": request.protocol.value,
                    "strategy_id": request.strategy_id,
                    "dataset_id": request.dataset_id,
                    "symbol": request.symbol,
                    "timeframe": request.timeframe,
                    "quantbt_version": self._gateway.version(),
                    "portal_version": portal_version,
                    "dataset_content_hash": market.content_hash,
                    "analysis_content_hash": active_market.content_hash,
                    "config_hash": request.config_hash(),
                    "random_seed": config.random_seed,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "warnings": warnings,
                    "failure": None,
                }
            ),
        )
        return {
            "run_id": run_id,
            "status": "COMPLETED",
            "protocol": request.protocol.value,
            "selected_params": selected["params"],
            "n_folds": wf.get("n_folds"),
            "n_studies": wf.get("n_studies"),
            "params_semantics": wf.get("params_semantics"),
        }

    def _write_wfo_artifacts(self, run_id: str, wf: Mapping[str, Any]) -> None:
        from portal_api.services.three_window_runner import _flatten_frame

        for name, key in (
            ("folds", "fold_table"),
            ("fold_selection", "fold_selection_table"),
            ("fold_boundary", "fold_boundary_table"),
        ):
            table = wf.get(key)
            if isinstance(table, pd.DataFrame) and not table.empty:
                self._artifacts.write_frame(run_id, f"wfo/{name}.parquet", table)
        params_by_fold = wf.get("params_by_fold")
        if params_by_fold:
            self._artifacts.write_json(run_id, "wfo/params_by_fold.json", canonicalize(params_by_fold))
        for name, key in (("trials", "trial_table"), ("candidates", "candidate_table")):
            table = wf.get(key)
            if isinstance(table, pd.DataFrame) and not table.empty:
                if name == "trials":
                    from portal_api.services.three_window_runner import _search_trials_only

                    table = _search_trials_only(table)
                self._artifacts.write_frame(run_id, f"wfo/{name}.parquet", _flatten_frame(table))


def _freeze_deployment_selection(
    wf: Mapping[str, Any], config: AdvancedWalkForwardConfig
) -> dict[str, Any]:
    best = wf.get("best_trial")
    if not isinstance(best, Mapping) or not best.get("params"):
        raise AdvancedWalkForwardError("walk-forward metadata has no selected trial params")
    params = {key: canonicalize(value) for key, value in best["params"].items()}
    semantics = wf.get("params_semantics") or "quantbt_declared"
    return {
        "params": params,
        "trial_id": _sanitize(best.get("trial_id")),
        "objective": _sanitize(best.get("objective")),
        "mean_is_sharpe": _sanitize(best.get("mean_is_sharpe")),
        "mean_oos_sharpe": _sanitize(best.get("mean_oos_sharpe")),
        "mean_decay": _sanitize(best.get("mean_decay")),
        "frozen_at": _utc_now_iso(),
        "params_semantics": semantics,
        "validation_claim": wf.get("validation_claim"),
        "causality_claim": wf.get("causality_claim"),
        "oos_used_for_selection": wf.get("oos_used_for_selection"),
        "optimization_mode": config.optimization_mode.value,
        "optimization_schedule": config.optimization_schedule.value,
        "n_folds": wf.get("n_folds"),
        "n_studies": wf.get("n_studies"),
        "trace": {
            "source": "QuantBT best_trial from walk_forward",
            "params_semantics": semantics,
            "capabilities": {"per_trial_selection_breakdown": False},
        },
    }


def _stitched_series(market_frame: pd.DataFrame, result) -> pd.DataFrame:
    index = market_frame.index
    equity = result.equity.reindex(index).astype(float)
    positions = result.positions
    position_col = next(
        (column for column in positions.columns if column.endswith("DEFAULT")),
        positions.columns[0],
    )
    series = pd.DataFrame(index=index)
    series["close"] = market_frame["close"].astype(float)
    series["accepted_position"] = positions[position_col].reindex(index).fillna(0.0).astype(float)
    series["equity"] = equity
    series["returns"] = result.returns.reindex(index).fillna(0.0).astype(float)
    peak = equity.cummax()
    series["drawdown"] = pd.Series(
        index=index,
        data=pd.Series(equity / peak - 1.0).to_numpy(),
        dtype=float,
    )
    series.attrs["capabilities"] = {
        "fee_series": False,
        "funding_series": False,
        "margin_series": False,
        "audited_fills": False,
    }
    return series
