from __future__ import annotations

import importlib
from importlib import metadata
from pathlib import Path
from typing import Any, Literal, Mapping

import pandas as pd


QUANTBT_DISTRIBUTION = "quantbt-engine"
QUANTBT_ENGINE_VERSION = "1.1.1"

# Only these release-verified public constructors may be selected by Research
# Loop code. The map deliberately lives at the Python boundary rather than in
# a browser payload: a manifest may describe capability, but never gains the
# ability to call arbitrary engine attributes.
PUBLIC_ROUTE_FACTORIES: dict[str, tuple[str, Mapping[str, object]]] = {
    "signal_notional": ("signal_notional", {}),
    "pct_equity": ("pct_equity", {}),
    "intrabar_bracket": ("intrabar_bracket", {}),
    "dca_ladder": ("dca_ladder", {}),
    # QuantBT exposes the reactive strategy facade through event_driven; it
    # does not expose a guessed reactive() constructor.
    "reactive": ("event_driven", {"input_mode": "strategy"}),
    "event_driven": ("event_driven", {}),
    "native_event_lifecycle": ("native_event_lifecycle", {}),
    "orders": ("orders", {}),
    "fill_replay": ("fill_replay", {}),
    "basket": ("basket", {}),
    "arbitrage": ("arbitrage", {}),
    "portfolio": ("portfolio", {}),
    "nautilus_dca_grid": ("nautilus_dca_grid", {}),
    "options": ("options", {}),
}


class QuantBTGateway:
    """Lazy boundary for the pinned QuantBT package installed from PyPI.

    The importable module is named ``quantbt`` while its PyPI distribution is
    ``quantbt-engine``. Dependency resolution belongs to ``pyproject.toml``;
    this gateway deliberately never adds a source checkout to ``sys.path``.
    """

    @staticmethod
    def _module():
        try:
            distribution = metadata.distribution(QUANTBT_DISTRIBUTION)
        except metadata.PackageNotFoundError as exc:
            raise RuntimeError(
                f"QuantBT is unavailable. Install {QUANTBT_DISTRIBUTION}=={QUANTBT_ENGINE_VERSION} "
                "from PyPI through the backend project dependencies."
            ) from exc
        installed_version = distribution.version
        if installed_version != QUANTBT_ENGINE_VERSION:
            raise RuntimeError(
                f"Unsupported {QUANTBT_DISTRIBUTION} version {installed_version!r}; "
                f"expected {QUANTBT_ENGINE_VERSION!r}."
            )
        try:
            module = importlib.import_module("quantbt")
        except ModuleNotFoundError as exc:
            if exc.name != "quantbt":
                raise
            raise RuntimeError(
                f"{QUANTBT_DISTRIBUTION}=={QUANTBT_ENGINE_VERSION} is installed but does not "
                "provide the expected quantbt package."
            ) from exc
        if not hasattr(module, "QuantBTEndpoint"):
            raise RuntimeError(
                f"{QUANTBT_DISTRIBUTION}=={QUANTBT_ENGINE_VERSION} does not expose "
                "the expected QuantBT public API."
            )

        expected_package_root = Path(distribution.locate_file("quantbt")).resolve()
        module_file = getattr(module, "__file__", None)
        if module_file is None or not Path(module_file).resolve().is_relative_to(expected_package_root):
            raise RuntimeError(
                "QuantBT import is shadowed by a local module. Expected the package installed "
                f"by {QUANTBT_DISTRIBUTION}=={QUANTBT_ENGINE_VERSION} under "
                f"{expected_package_root}."
            )
        return module

    def version(self) -> str:
        self._module()
        return metadata.version(QUANTBT_DISTRIBUTION)

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

    def signal_notional_endpoint(self, **kwargs):
        """Construct the P04 current default through the verified public API."""
        return self._module().QuantBTEndpoint.signal_notional(**kwargs)

    def public_route_surface(self) -> dict[str, bool]:
        """Verify the immutable P04 route map against the installed public API.

        This is a constructor-surface probe only. It deliberately does not
        execute a route whose domain-specific request (options package,
        arbitrage specification, order tape, ...) has not passed Portal
        admission yet.
        """
        endpoint = self._module().QuantBTEndpoint
        return {
            route_id: callable(getattr(endpoint, factory_name, None))
            for route_id, (factory_name, _) in PUBLIC_ROUTE_FACTORIES.items()
        }

    def route_endpoint(self, route_id: str, /, **kwargs):
        """Build one allowlisted public endpoint without dynamic dispatch.

        Forced arguments in the release mapping cannot be silently overridden
        by a caller. This matters for the reactive route: it must remain the
        explicit strategy-input facade until a future typed tape contract is
        admitted.
        """
        try:
            factory_name, forced_kwargs = PUBLIC_ROUTE_FACTORIES[route_id]
        except KeyError as exc:
            raise ValueError(f"unknown QuantBT public route {route_id!r}") from exc
        supplied = dict(kwargs)
        for key, value in forced_kwargs.items():
            if key in supplied and supplied[key] != value:
                raise ValueError(
                    f"route {route_id!r} requires {key}={value!r}; conflicting value supplied"
                )
            supplied[key] = value
        factory = getattr(self._module().QuantBTEndpoint, factory_name, None)
        if not callable(factory):
            raise RuntimeError(
                f"{QUANTBT_DISTRIBUTION}=={QUANTBT_ENGINE_VERSION} no longer exposes "
                f"the mapped public factory {factory_name!r} for {route_id!r}."
            )
        return factory(**supplied)

    def build_optimization_config(self, *, config_fields: Mapping[str, object]):
        """Build 1.1.1's public OptimizationConfig with Portal-safe defaults.

        P04 does not retrofit the legacy execution runner. New Research jobs
        can use this method after their own request schema is admitted. Alias
        names and unsafe parallelism fail before any engine compute starts.
        """
        fields = dict(config_fields)
        aliases = {"random_seed": "seed", "optuna_trials": "n_trials"}
        for alias, canonical in aliases.items():
            if alias in fields:
                raise ValueError(
                    f"optimizer field {alias!r} is not accepted; use canonical {canonical!r}"
                )
        allowed = {
            "study_name",
            "n_trials",
            "directions",
            "seed",
            "n_jobs",
            "early_stopping_rounds",
            "early_stopping_min_trials",
            "early_stopping_min_delta",
            "show_progress_bar",
            "duplicate_policy",
            "exception_policy",
        }
        deferred = {"storage", "load_if_exists", "log_path"}
        requested_deferred = sorted(set(fields) & deferred)
        if requested_deferred:
            raise ValueError(
                "optimizer persistence fields are deferred until persistent study lifecycle "
                f"admission: {', '.join(requested_deferred)}"
            )
        unknown = sorted(set(fields) - allowed)
        if unknown:
            raise ValueError(f"unsupported optimizer fields: {', '.join(unknown)}")
        if fields.get("n_jobs", 1) != 1:
            raise ValueError("optimizer n_jobs is locked to 1 until dedupe is certified")
        # P04 establishes only an in-process, deterministic adapter baseline.
        # Persistent Optuna storage and filesystem logs belong to a later
        # lifecycle phase with explicit retention, ownership and cleanup
        # contracts; accepting their public QuantBT knobs here would create an
        # accidental side-effect channel before that phase exists.
        fields["n_jobs"] = 1
        config_type = getattr(self._module(), "OptimizationConfig", None)
        if config_type is None:
            raise RuntimeError("QuantBT public OptimizationConfig is unavailable")
        return config_type(**fields)

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

    def build_advanced_walkforward_config(self, *, config_fields: Mapping[str, object]) -> Any:
        """Build the pinned package's public WalkForwardConfig.

        Keeping this import in the gateway ensures advanced WFO follows the
        same PyPI-only dependency boundary as the remaining QuantBT hot path.
        """
        self._module()
        walkforward_module = importlib.import_module("quantbt.walkforward")
        return walkforward_module.WalkForwardConfig(**dict(config_fields))

    def validate_advanced_walkforward(self, *, config_fields: Mapping[str, object]) -> None:
        """Fail fast on invalid public WalkForwardConfig combinations."""
        self.build_advanced_walkforward_config(config_fields=config_fields)

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
        target_mode: Literal["pct_equity", "signal_notional"] = "pct_equity",
    ) -> tuple[Any, dict[str, Any]]:
        """Run one source-supported WFO route without changing legacy defaults.

        The existing Portal runner remains pct_equity. Research's future
        versioned adapter must explicitly select signal_notional; a caller
        cannot turn any public QuantBT route into an admitted Portal route.
        """
        if target_mode not in {"pct_equity", "signal_notional"}:
            raise ValueError("walk-forward target mode is not Portal-allowlisted")
        if not any(
            row.get("target_mode") == target_mode and row.get("status") == "supported"
            for row in self.walkforward_capabilities()
        ):
            raise RuntimeError(f"QuantBT 1.1.1 does not support walk-forward target {target_mode}")
        module = self._module()
        endpoint = module.QuantBTEndpoint.walk_forward(
            strategy_class=strategy_fn,
            target_mode=target_mode,
            walkforward_config=wf_config,
            optimization_config=dict(optimization_config),
            **dict(account_kwargs),
        )
        if fixed_params is not None:
            result = endpoint.backtest(data=data, params=dict(fixed_params))
        else:
            result = endpoint.backtest(data=data, param_ranges=dict(param_ranges or {}))
        return endpoint, result.metadata["walk_forward"]
