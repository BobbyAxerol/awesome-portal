from __future__ import annotations

import importlib
from typing import Any, Mapping

import pandas as pd


class QuantBTGateway:
    """Lazy public-API boundary; no QuantBT import occurs at module import time."""

    @staticmethod
    def _module():
        module = importlib.import_module("quantbt")
        if not hasattr(module, "QuantBTEndpoint"):
            raise RuntimeError(
                "QuantBT public package is unavailable. Install quantbt-engine or set "
                "PYTHONPATH to the repository src directory."
            )
        return module

    def version(self) -> str:
        module = self._module()
        return str(getattr(module, "__version__", "unknown"))

    def walkforward_capabilities(self) -> list[dict[str, Any]]:
        matrix = self._module().walkforward_support_matrix()
        if isinstance(matrix, pd.DataFrame):
            return matrix.where(pd.notna(matrix), None).to_dict(orient="records")
        if isinstance(matrix, list):
            return [dict(item) if isinstance(item, Mapping) else {"value": item} for item in matrix]
        raise TypeError("unsupported QuantBT capability response")

    def validate_param_ranges(self, ranges: Mapping[str, object]) -> None:
        self._module().validate_param_ranges(dict(ranges))

    def train_test_split_endpoint(self, **kwargs):
        return self._module().QuantBTEndpoint.train_test_split(**kwargs)

    def pct_equity_endpoint(self, **kwargs):
        return self._module().QuantBTEndpoint.pct_equity(**kwargs)

    # --- Phase P2 orchestration (plan §10) ----------------------------------

    def run_mode1_calibration(
        self,
        *,
        strategy_fn,
        data: pd.DataFrame,
        param_ranges: Mapping[str, object],
        oos_start,
        optimization_config: Mapping[str, object],
        optuna_trials: int,
        optuna_early_stopping: int | None,
        random_seed: int | None,
        account_kwargs: Mapping[str, object],
    ) -> tuple[Any, dict[str, Any]]:
        """Run the single IS/OOS Mode 1 study on the calibration tape.

        Returns ``(endpoint, walk_forward_metadata)``; the metadata is the raw
        public-API artifact (plan §10 steps 4-6) and must be normalized only
        through the canonical serializer.
        """
        module = self._module()
        self.validate_param_ranges(param_ranges)
        endpoint = module.QuantBTEndpoint.train_test_split(
            strategy_class=strategy_fn,
            test_start=oos_start,
            target_mode="pct_equity",
            optimization_mode="mode_1_decay",
            optimization_schedule="global",
            optimization_config=dict(optimization_config),
            optuna_trials=int(optuna_trials),
            optuna_early_stopping=optuna_early_stopping,
            random_seed=random_seed,
            **dict(account_kwargs),
        )
        result = endpoint.backtest(data=data, param_ranges=dict(param_ranges))
        return endpoint, result.metadata["walk_forward"]

    def run_frozen_replay(
        self,
        *,
        evaluation_frame: pd.DataFrame,
        signal: pd.Series,
        account_kwargs: Mapping[str, object],
    ) -> Any:
        """Replay one segment with frozen params on a fresh account (plan §10.8)."""
        endpoint = self._module().QuantBTEndpoint.pct_equity(**dict(account_kwargs))
        endpoint.backtest(data=evaluation_frame, signal=signal)
        return endpoint

    def metrics(self, endpoint, *, trading_days: int = 365, scope: str = "auto") -> dict[str, Any]:
        """QuantBT full report dict for the endpoint's latest result."""
        return endpoint.full_report(trading_days=trading_days, scope=scope)

    # --- Phase P3 advanced walk-forward (plan §10.10, §8) --------------------

    def validate_advanced_walkforward(self, *, config_fields: Mapping[str, object]) -> None:
        """Instantiate the public WalkForwardConfig to fail fast on invalid
        mode/schedule combinations before any run is started."""
        from quantbt.walkforward import WalkForwardConfig

        WalkForwardConfig(**dict(config_fields))

    def run_advanced_walkforward(
        self,
        *,
        strategy_fn,
        data: pd.DataFrame,
        wf_config,
        optimization_config: Mapping[str, object],
        param_ranges: Mapping[str, tuple[int | float, int | float, int | float]] | None,
        fixed_params: Mapping[str, object] | None,
        account_kwargs: Mapping[str, object],
    ) -> tuple[Any, dict[str, Any]]:
        """Run the public walk_forward endpoint with a fully typed config."""
        module = self._module()
        endpoint = module.QuantBTEndpoint.walk_forward(
            strategy_class=strategy_fn,
            target_mode="pct_equity",
            walkforward_config=wf_config,
            optimization_config=dict(optimization_config),
            **dict(account_kwargs),
        )
        if fixed_params is not None:
            result = endpoint.backtest(data=data, params=dict(fixed_params))
        else:
            result = endpoint.backtest(data=data, param_ranges=dict(param_ranges or {}))
        return endpoint, result.metadata["walk_forward"]
