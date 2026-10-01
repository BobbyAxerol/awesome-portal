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
from typing import Any, Callable, Literal, Mapping

import pandas as pd

from portal_api import __version__ as portal_version
from portal_api.adapters.market_data import PreparedMarketData, slice_market_range
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.enums import OptimizationMode, RunProtocol
from portal_api.domain.requests import (
    AdvancedWalkForwardConfig,
    PortalRunRequest,
)
from portal_api.repositories.artifacts import (
    ArtifactRepository,
    with_portal_provenance,
)
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


FOLD_TABLE_V1_COLUMNS = (
    "fold_id",
    "train_start",
    "train_end",
    "test_start",
    "test_end",
    "train_bars",
    "test_bars",
)


# QuantBT 1.1.1 accepts this bounded metadata cap. Its default 2,000 rows
# drops late OOS-generation records on admitted 400-trial WFO runs. The
# admitted profile is at most 400 trials x 16 folds; 20,000 covers that
# lifecycle without an unbounded engine-side list.
LIFECYCLE_LEDGER_MAX_ROWS = 20_000


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _config_fields(
    config: AdvancedWalkForwardConfig,
    *,
    target_mode: Literal["pct_equity", "signal_notional"] = "pct_equity",
) -> dict[str, Any]:
    opt = config.optimization
    return {
        "split_mode": config.split_mode,
        "split_frequency": config.split_frequency,
        "window_mode": config.window_mode,
        "train_window": config.train_window,
        "min_train_bars": config.min_train_bars,
        "min_test_bars": config.min_test_bars,
        "target_mode": target_mode,
        "fill_value": config.fill_value,
        "optimization_mode": config.optimization_mode.value,
        "optimization_schedule": config.optimization_schedule.value,
        "fold_boundary_position_policy": config.fold_boundary_position_policy,
        "optuna_trials": config.optuna_trials,
        "metadata": {"lifecycle_ledger_max_rows": LIFECYCLE_LEDGER_MAX_ROWS},
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

    def validate_capabilities(self, target_mode: Literal["pct_equity", "signal_notional"] = "pct_equity") -> None:
        """Require the selected target mode in the pinned engine support matrix."""
        rows = self._gateway.walkforward_capabilities()
        supported = {
            str(row.get("target_mode"))
            for row in rows
            if str(row.get("status")).strip().lower() == "supported"
        }
        if target_mode not in supported:
            raise AdvancedWalkForwardError(
                f"{target_mode} is not a supported walk-forward target mode in this QuantBT build"
            )

    def run(
        self,
        request: PortalRunRequest,
        market: PreparedMarketData,
        run_id: str,
        progress: Callable[[str], None] | None = None,
        *,
        target_mode: Literal["pct_equity", "signal_notional"] = "pct_equity",
    ) -> dict[str, Any]:
        if request.protocol != RunProtocol.ADVANCED_WALK_FORWARD:
            raise AdvancedWalkForwardError("AdvancedWalkForwardRunner requires protocol=advanced_walk_forward")
        if not isinstance(request.calibration, AdvancedWalkForwardConfig):
            raise AdvancedWalkForwardError("AdvancedWalkForwardRunner requires AdvancedWalkForwardConfig")

        def stage(name: str) -> None:
            if progress is not None:
                progress(name)

        if request.execution.target_mode != target_mode:
            raise AdvancedWalkForwardError("requested execution target mode does not match the server-selected WFO adapter")
        self.validate_capabilities(target_mode)
        config = request.calibration
        active_market = slice_market_range(
            market,
            start=config.data_start,
            end_exclusive=config.data_end_exclusive,
        )
        fields = _config_fields(config, target_mode=target_mode)
        self._gateway.validate_advanced_walkforward(config_fields=fields)
        wf_config = self._gateway.build_advanced_walkforward_config(config_fields=fields)

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
            target_mode=target_mode,
        )
        completed_at = _utc_now_iso()

        self._write_wfo_artifacts(run_id, wf)
        self._write_wfo_source_facts(run_id, wf, getattr(endpoint.result, "metadata", None))
        selected = _freeze_deployment_selection(wf, config)
        self._artifacts.write_json(
            run_id,
            "selection/selected_params.json",
            with_portal_provenance("selected_params.json", selected),
        )
        self._artifacts.write_json(
            run_id,
            "selection/selection_trace.json",
            with_portal_provenance("selection_trace.json", selected["trace"]),
        )

        metrics = self._gateway.metrics(
            endpoint, trading_days=int(config.optimization.scoring_trading_days)
        )
        result = endpoint.result
        from portal_api.services.research_retained_analytics import retained_analytics

        # Source-time calculation inside the confined writer, never on GET.
        self._artifacts.write_json(
            run_id, "wfo/retained_analytics.v1.json",
            with_portal_provenance("retained_analytics.v1.json", retained_analytics(result=result, mode="WFO")),
        )
        from portal_api.services.research_portal_analytics import portal_analytics_v2
        self._artifacts.write_json(
            run_id, "wfo/retained_analytics.v2.json",
            with_portal_provenance("retained_analytics.v2.json", portal_analytics_v2(
                result=result, mode="WFO", market_close=active_market.frame["close"],
                benchmark_locator=f"P08.snapshot:{active_market.content_hash}:{request.symbol}:{request.timeframe}:close:OOS",
            )),
        )
        series = _stitched_series(active_market.frame, result)
        self._artifacts.write_frame(run_id, "series/stitched.parquet", series)
        self._write_account_ledger(run_id, active_market.frame, result, wf)
        non_finite: list[str] = []
        clean_metrics = _sanitize({"stitched": metrics}, non_finite=non_finite)
        warnings = [f"non-finite metric field: {path}" for path in non_finite]
        self._artifacts.write_json(
            run_id,
            "metrics.json",
            with_portal_provenance(
                "metrics.json",
                {"segments": clean_metrics, "reconciliation": {}, "warnings": warnings},
            ),
        )
        self._artifacts.write_json(
            run_id,
            "config.json",
            with_portal_provenance(
                "config.json", canonicalize(request.model_dump(mode="json"))
            ),
        )
        # Parity with the three-window runner: strategy.json feeds the audit
        # endpoint, which 404s without it (v0.1.1 bugfix).
        spec = StrategyRegistry().get(request.strategy_id).specification
        self._artifacts.write_json(
            run_id,
            "strategy.json",
            with_portal_provenance("strategy.json", _strategy_artifact(spec)),
        )
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
                    "target_mode": target_mode,
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
                if name == "folds":
                    self._write_compatible_fold_tables(run_id, table)
                else:
                    self._artifacts.write_frame(run_id, f"wfo/{name}.parquet", table)
        params_by_fold = wf.get("params_by_fold")
        if params_by_fold:
            self._artifacts.write_json(
                run_id,
                "wfo/params_by_fold.json",
                with_portal_provenance(
                    "params_by_fold.json", canonicalize(params_by_fold)
                ),
            )
        for name, key in (("trials", "trial_table"), ("candidates", "candidate_table")):
            table = wf.get(key)
            if isinstance(table, pd.DataFrame) and not table.empty:
                if name == "trials":
                    from portal_api.services.three_window_runner import _search_trials_only

                    table = _search_trials_only(table)
                self._artifacts.write_frame(run_id, f"wfo/{name}.parquet", _flatten_frame(table))

    def _write_wfo_source_facts(
        self,
        run_id: str,
        wf: Mapping[str, Any],
        account_metadata: Mapping[str, Any] | None,
    ) -> None:
        """Retain two small, additive QuantBT fact documents (W3, CG-P13-07/08).

        ``wfo/selected_fold_metrics.v1.json`` keeps the per-fold score rows
        QuantBT computed for the *selected* parameter set (``best_trial``);
        the compact trial ledger drops them.  ``wfo/source_contract.v1.json``
        keeps the claim, temporal-guard, search and execution-contract facts
        QuantBT published for this run, verbatim.  Neither replaces an
        existing artifact, and no value is inferred: a key QuantBT did not
        publish is simply absent.
        """

        best = wf.get("best_trial")
        fold_metrics = best.get("fold_metrics") if isinstance(best, Mapping) else None
        if isinstance(fold_metrics, list) and fold_metrics:
            self._artifacts.write_json(
                run_id,
                "wfo/selected_fold_metrics.v1.json",
                with_portal_provenance(
                    "selected_fold_metrics.v1.json",
                    canonicalize({
                        "schema_version": "portal.wfo-selected-fold-metrics.v1",
                        "source": "QuantBT walk_forward best_trial.fold_metrics",
                        "trial_id": _sanitize(best.get("trial_id")),
                        "fold_metrics": [
                            _sanitize({str(key): value for key, value in row.items()})
                            for row in fold_metrics
                            if isinstance(row, Mapping)
                        ],
                    }),
                ),
            )
        wf_keys = (
            "validation_claim",
            "causality_claim",
            "chronological_validation_claim",
            "oos_used_for_selection",
            "full_sample_used_for_selection",
            "params_semantics",
            "causality_schedule_v2",
            "signal_causality_scope",
            "optimization_mode",
            "optimization_schedule",
            "label_horizon_bars",
            "purge_bars",
            "embargo_bars",
            "warmup_policy",
            "warmup_bars",
            "inner_validation",
            "fold_account_policy",
            "fold_boundary_position_policy",
            "account_execution",
            "n_folds",
            "n_studies",
            "optuna_trials_scope",
            "optuna_trials_configured_per_study",
            "n_optuna_trial_rows",
            "trial_ledger_mode",
            "full_trial_metrics_retained",
            "top_is_fraction",
            "top_is_k",
            "candidate_selection_metric",
            "scoring_backend",
            "min_trades_per_year",
            "trade_penalty_factor",
        )
        walk_forward = {key: _sanitize(wf.get(key)) for key in wf_keys if key in wf}
        native = wf.get("native_prepared_wfo")
        if isinstance(native, Mapping):
            walk_forward["native_prepared_wfo"] = _sanitize({
                key: native.get(key)
                for key in ("requested_policy", "resolved_policy", "execution_clock", "reason")
                if key in native
            })
        account: dict[str, Any] = {}
        if isinstance(account_metadata, Mapping):
            for key in ("backend", "engine_id", "target_runtime", "kernel_version", "signal_phase", "fill_phase"):
                if key in account_metadata:
                    account[key] = _sanitize(account_metadata.get(key))
            contract = account_metadata.get("execution_contract")
            if isinstance(contract, Mapping):
                account["execution_contract"] = _sanitize(dict(contract))
        self._artifacts.write_json(
            run_id,
            "wfo/source_contract.v1.json",
            with_portal_provenance(
                "source_contract.v1.json",
                canonicalize({
                    "schema_version": "portal.wfo-source-contract.v1",
                    "source": "QuantBT walk_forward metadata and final account metadata",
                    "walk_forward": walk_forward,
                    "final_account": account,
                }),
            ),
        )

    def _write_account_ledger(
        self,
        run_id: str,
        market_frame: pd.DataFrame,
        result: Any,
        wf: Mapping[str, Any],
    ) -> None:
        """Retain the final account's per-bar cost/turnover series (W5b, P17).

        ``BacktestResultV2`` publishes ``fees``, ``funding`` and the
        ``diagnostics`` frame (turnover, rejected orders, reject code) for
        every bar of the stitched account, plus order/fill/trade tuples. On the
        ``close_target_v2`` route those tuples are empty — the engine rebalances
        a target at the bar close and emits no order or fill object — so this
        artifact records the counts it saw instead of inventing records.

        Two additive, versioned files; ``series/stitched.parquet`` keeps its
        exact v1 shape. Nothing here is derived: every column is a QuantBT
        series reindexed to the analysed market bars.
        """

        index = market_frame.index
        ledger = pd.DataFrame(index=index)

        def series(value: Any) -> pd.Series | None:
            return value if isinstance(value, pd.Series) and len(value) else None

        fees = series(getattr(result, "fees", None))
        funding = series(getattr(result, "funding", None))
        diagnostics = getattr(result, "diagnostics", None)
        if fees is not None:
            ledger["fee"] = fees.reindex(index).astype(float)
        if funding is not None:
            ledger["funding"] = funding.reindex(index).astype(float)
        if isinstance(diagnostics, pd.DataFrame) and not diagnostics.empty:
            for column in ("turnover", "rejected_orders", "reject_code"):
                if column in diagnostics.columns:
                    ledger[column] = diagnostics[column].reindex(index)
        if not len(ledger.columns):
            return
        self._artifacts.write_frame(run_id, "series/account_ledger.v1.parquet", ledger)

        # P17-T14: QuantBT's own strategy-isolation audit, one row per child
        # strategy instance (candidate × fold × context), verbatim. Written
        # only when the engine published it; nothing is derived here.
        lifecycle = wf.get("strategy_lifecycle_table")
        if isinstance(lifecycle, pd.DataFrame) and not lifecycle.empty:
            self._artifacts.write_frame(run_id, "wfo/strategy_lifecycle.v1.parquet", lifecycle.reset_index(drop=True))
            self._artifacts.write_json(
                run_id,
                "wfo/strategy_lifecycle_contract.v1.json",
                with_portal_provenance("strategy_lifecycle_contract.v1.json", canonicalize({
                    "schema_version": "portal.wfo-strategy-lifecycle-contract.v1",
                    "source": "QuantBT walk_forward strategy_lifecycle_table",
                    "policy": _sanitize(wf.get("strategy_lifecycle_policy")),
                    "records_dropped": _sanitize(wf.get("strategy_lifecycle_records_dropped")),
                    "rows": int(len(lifecycle)),
                })),
            )

        metadata = getattr(result, "metadata", None)
        metadata = metadata if isinstance(metadata, Mapping) else {}
        run_config = metadata.get("run_config") if isinstance(metadata.get("run_config"), Mapping) else {}
        execution = run_config.get("execution") if isinstance(run_config.get("execution"), Mapping) else {}
        account = run_config.get("account") if isinstance(run_config.get("account"), Mapping) else {}
        plan = wf.get("account_execution_plan")
        boundary_events = []
        if isinstance(plan, Mapping) and isinstance(plan.get("boundary_events"), (list, tuple)):
            for event in plan["boundary_events"]:
                if isinstance(event, Mapping):
                    boundary_events.append(_sanitize({
                        key: event.get(key)
                        for key in (
                            "previous_fold_id", "fold_id", "boundary_timestamp",
                            "next_test_start", "gap_bars", "policy", "event",
                        )
                        if key in event
                    }))
        contract = {
            "schema_version": "portal.wfo-account-contract.v1",
            "source": "QuantBT walk_forward final account result (BacktestResultV2) and account_execution_plan",
            # What the result object actually carried, counted — not assumed.
            "orders_published": len(getattr(result, "orders", ()) or ()),
            "fills_published": len(getattr(result, "fills", ()) or ()),
            "trades_published": len(getattr(result, "trades", ()) or ()),
            "account_execution_plan": None if not isinstance(plan, Mapping) else _sanitize({
                "schema": plan.get("schema"),
                "policy": plan.get("policy"),
                "execution_mode": plan.get("execution_mode"),
                "boundary_events": boundary_events,
            }),
        }
        for key in (
            "orders_count", "fills_count", "target_intent_kind", "first_bar_target_policy",
            "intrabar_exit_model", "slippage_bps", "fee_rate_oneway", "use_funding",
        ):
            if key in metadata:
                contract[key] = _sanitize(metadata.get(key))
        for key in ("fill_price_policy", "same_bar_policy", "allow_partial_fill"):
            if key in execution:
                contract[key] = _sanitize(execution.get(key))
        for key in ("oms_mode", "margin_mode"):
            if key in account:
                contract[key] = _sanitize(account.get(key))
        for key in ("report_level", "portfolio_mode"):
            if key in run_config:
                contract[key] = _sanitize(run_config.get(key))
        self._artifacts.write_json(
            run_id,
            "wfo/account_contract.v1.json",
            with_portal_provenance("account_contract.v1.json", canonicalize(contract)),
        )

    def _write_compatible_fold_tables(self, run_id: str, table: pd.DataFrame) -> None:
        """Preserve the v1 consumer table across a QuantBT metadata expansion.

        QuantBT 1.1.1 adds useful fold context (warm-up/purge/embargo, etc.).
        Existing Portal readers contractually consume the seven v1 columns, so
        silently widening that parquet shape would be a breaking change.  The
        stable table remains exact; additive 1.1.1 fields are retained in a
        separately versioned extension artifact for a later admitted reader.
        """
        missing = [
            column for column in FOLD_TABLE_V1_COLUMNS if column not in table.columns
        ]
        if missing:
            raise AdvancedWalkForwardError(
                "QuantBT fold table is missing required v1 columns: " + ", ".join(missing)
            )
        stable = table.loc[:, list(FOLD_TABLE_V1_COLUMNS)].copy()
        self._artifacts.write_frame(run_id, "wfo/folds.parquet", stable)
        extension_columns = [
            column for column in table.columns if column not in FOLD_TABLE_V1_COLUMNS
        ]
        if extension_columns:
            extension = table.loc[:, ["fold_id", *extension_columns]].copy()
            self._artifacts.write_frame(
                run_id, "wfo/folds_extension.v1.parquet", extension
            )


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
    series["open"] = market_frame["open"].astype(float)
    series["high"] = market_frame["high"].astype(float)
    series["low"] = market_frame["low"].astype(float)
    series["close"] = market_frame["close"].astype(float)
    series["volume"] = market_frame["volume"].astype(float)
    series["accepted_position"] = positions[position_col].reindex(index).fillna(0.0).astype(float)
    series["equity"] = equity
    series["returns"] = result.returns.reindex(index).fillna(0.0).astype(float)
    peak = equity.cummax()
    series["drawdown"] = pd.Series(
        index=index,
        data=pd.Series(equity / peak - 1.0).to_numpy(),
        dtype=float,
    )
    # Stitched OOS target signal (pos_weight) — lets the Execution view draw
    # long/short entry & exit markers for advanced runs too (v0.1.1).
    wf_result = getattr(result, "metadata", {}).get("walk_forward_result")
    oos_output = getattr(wf_result, "oos_output", None)
    if isinstance(oos_output, pd.Series):
        series["signal_target"] = oos_output.reindex(index).fillna(0.0).astype(float)
    series.attrs["capabilities"] = {
        "fee_series": False,
        "funding_series": False,
        "margin_series": False,
        "audited_fills": False,
    }
    return series
