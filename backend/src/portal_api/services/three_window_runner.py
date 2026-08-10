"""Three-window Mode 1 orchestration runner (Phase P2, plan §10).

Executes the default manager protocol end to end:

1. calibration tape = IS + OOS only (Holdout Live is never loaded for
   calibration);
2. ``train_test_split(mode_1_decay)`` on the tape;
3. freeze ``selected_params.json`` **before** Holdout Live is touched;
4. fresh-account ``pct_equity`` replay of IS, OOS and Holdout Live with the
   frozen params;
5. raw segment series + metrics + presentation equity artifacts.

Every QuantBT value is persisted via the canonical serializer; fields the
public API does not expose (fee/funding/margin series, per-trial selection
breakdown) are omitted with capability flags, never invented. QuantBT remains
the source of truth for accounting and metrics; the portal only builds
presentation series (calendar/rebased equity, drawdown) on top.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime
from typing import Any, Callable, Mapping

import numpy as np
import pandas as pd

from portal_api import __version__ as portal_version
from portal_api.adapters.market_data import (
    PreparedMarketData,
    market_content_hash,
    partition_three_windows,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.enums import RunProtocol
from portal_api.domain.requests import (
    AccountConfig,
    ExecutionConfig,
    ParameterSpec,
    PortalRunRequest,
    ThreeWindowConfig,
)
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.serialization import canonicalize
from portal_api.strategies import StrategyRegistry
from strategy.delta_rsi import generate_signals

ARTIFACT_SCHEMA_VERSION = "1"
SEGMENT_KEYS = ("is", "oos", "holdout_live")


class ThreeWindowRunnerError(RuntimeError):
    pass


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _sanitize(value: Any, *, path: str = "", non_finite: list[str] | None = None) -> Any:
    """Replace non-finite floats with None and record their paths.

    QuantBT metrics can legitimately be inf/nan (e.g. Calmar when max
    drawdown is 0); the canonical serializer rejects those, so artifacts keep
    a null plus a warning instead of dropping the field.
    """
    if isinstance(value, Mapping):
        return {
            key: _sanitize(item, path=f"{path}.{key}", non_finite=non_finite)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize(item, path=f"{path}[{i}]", non_finite=non_finite) for i, item in enumerate(value)]
    if isinstance(value, tuple):
        return [_sanitize(item, path=f"{path}[{i}]", non_finite=non_finite) for i, item in enumerate(value)]
    if isinstance(value, float) and not math.isfinite(value):
        if non_finite is not None:
            non_finite.append(path or "<root>")
        return None
    return value


def _mode1_optimization_config(config: ThreeWindowConfig) -> dict[str, object]:
    opt = config.optimization
    return {
        "decay_lambda": opt.decay_lambda,
        "decay_gamma": opt.decay_gamma,
        "top_is_fraction": opt.top_is_fraction,
        "top_is_k": opt.top_is_k,
        "candidate_selection_metric": "robust_decay",
        "scoring_backend": opt.scoring_backend,
        "scoring_trading_days": opt.scoring_trading_days,
        "min_trades_per_year": opt.min_trades_per_year,
        "trade_penalty_factor": opt.trade_penalty_factor,
        "use_numba": opt.use_numba,
    }


def _account_kwargs(account: AccountConfig, execution: ExecutionConfig) -> dict[str, object]:
    # QuantBT's explicit fee_rate contract is canonical one-way. Keeping this
    # explicit avoids compatibility-layer ambiguity in config/audit metadata.
    return {
        "initial_capital": account.initial_capital,
        "leverage": account.leverage,
        "maintenance_ratio": account.maintenance_ratio,
        "contract_size": account.contract_size,
        "alloc_per_trade": account.alloc_per_trade,
        "fee_rate": account.canonical_one_way_fee_rate,
        "slippage": execution.slippage,
        "use_funding": account.funding_enabled,
        "funding_rate": account.funding_rate,
        "use_pyramiding": account.use_pyramiding,
    }


def _quantbt_param_ranges(specs: Mapping[str, ParameterSpec]) -> dict[str, object]:
    ranges: dict[str, object] = {}
    for key, spec in specs.items():
        if spec.kind == "int_range":
            ranges[key] = (int(spec.low), int(spec.high), int(spec.step))
        elif spec.kind == "float_range":
            ranges[key] = (float(spec.low), float(spec.high), float(spec.step))
        elif spec.kind == "fixed":
            ranges[key] = spec.value
        elif spec.kind == "categorical":
            ranges[key] = list(spec.values or ())
        else:
            raise ThreeWindowRunnerError(f"unsupported parameter specification for {key!r}")
    return ranges


class ThreeWindowRunner:
    def __init__(
        self,
        *,
        gateway: QuantBTGateway,
        strategies: StrategyRegistry,
        artifacts: ArtifactRepository,
    ):
        self._gateway = gateway
        self._strategies = strategies
        self._artifacts = artifacts

    def run(
        self,
        request: PortalRunRequest,
        market: PreparedMarketData,
        run_id: str,
        progress: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        if request.protocol != RunProtocol.THREE_WINDOW_DECAY:
            raise ThreeWindowRunnerError("ThreeWindowRunner requires protocol=three_window_decay")
        if not isinstance(request.calibration, ThreeWindowConfig):
            raise ThreeWindowRunnerError("ThreeWindowRunner requires ThreeWindowConfig")
        if request.calibration.holdout_start != request.calibration.oos_end_exclusive:
            raise ThreeWindowRunnerError("windows must be contiguous: OOS end == Holdout Live start")

        def stage(name: str) -> None:
            if progress is not None:
                progress(name)

        adapter = self._strategies.get(request.strategy_id)
        adapter.validate_parameter_space(request.parameter_space)
        windows = partition_three_windows(market, request.calibration)
        calibration_tape = pd.concat([windows.is_frame, windows.oos_frame])
        protocol_tape = pd.concat(
            [windows.is_frame, windows.oos_frame, windows.holdout_frame]
        )

        config = request.calibration
        param_ranges = _quantbt_param_ranges(request.parameter_space.root)
        optimization_config = _mode1_optimization_config(config)
        account_kwargs = _account_kwargs(request.account, request.execution)

        started_at = _utc_now_iso()
        stage("OPTIMIZING_IS")
        endpoint, wf = self._gateway.run_mode1_calibration(
            strategy_fn=_strategy_callable,
            data=calibration_tape,
            param_ranges=param_ranges,
            oos_start=config.oos_start,
            optimization_config=optimization_config,
            optuna_trials=config.optuna_trials,
            optuna_early_stopping=config.optuna_early_stopping,
            random_seed=config.random_seed,
            account_kwargs=account_kwargs,
        )
        # These stages occur inside the single public calibration call; they
        # are recorded as completed once the study returns (§9).
        stage("RANKING_IS_CANDIDATES")
        stage("REPLAYING_CANDIDATES_ON_OOS")
        stage("SELECTING_PARAMS")

        self._write_wfo_artifacts(run_id, wf)
        selected_params, trace = _freeze_selection(wf)
        stage("FREEZING_PARAMS")
        self._artifacts.write_json(run_id, "selection/selected_params.json", selected_params)
        self._artifacts.write_json(run_id, "selection/selection_trace.json", trace)

        # Replay happens strictly after the freeze (plan §7.2).
        segment_frames = {
            "is": windows.is_frame,
            "oos": windows.oos_frame,
            "holdout_live": windows.holdout_frame,
        }
        metrics_by_segment, series_by_segment = {}, {}
        replay_stages = {
            "is": "BACKTESTING_IS",
            "oos": "BACKTESTING_OOS",
            "holdout_live": "BACKTESTING_HOLDOUT_LIVE",
        }
        for key, segment_frame in segment_frames.items():
            stage(replay_stages[key])
            series, metrics = self._replay_segment(
                run_id,
                key,
                segment_frame,
                protocol_tape,
                selected_params["params"],
                account_kwargs,
            )
            series_by_segment[key] = series
            metrics_by_segment[key] = metrics

        stage("BUILDING_ARTIFACTS")
        calendar_equity, rebased_equity = _build_presentation_equity(
            protocol_tape.index, segment_frames, series_by_segment
        )
        self._artifacts.write_frame(run_id, "presentation/calendar_equity.parquet", calendar_equity)
        self._artifacts.write_frame(run_id, "presentation/rebased_equity.parquet", rebased_equity)

        reconciliation = _reconcile_final_equity(metrics_by_segment, series_by_segment)
        non_finite: list[str] = []
        clean_metrics = _sanitize(metrics_by_segment, non_finite=non_finite)
        warnings = [f"non-finite metric field: {path}" for path in non_finite]
        self._artifacts.write_json(
            run_id,
            "metrics.json",
            {
                "segments": clean_metrics,
                "reconciliation": reconciliation,
                "warnings": warnings,
            },
        )
        self._artifacts.write_json(run_id, "strategy.json", _strategy_artifact(adapter.specification))
        self._artifacts.write_json(run_id, "config.json", canonicalize(request.model_dump(mode="json")))
        completed_at = _utc_now_iso()
        self._artifacts.write_json(
            run_id,
            "manifest.json",
            _manifest(
                run_id=run_id,
                request=request,
                market=market,
                analysis_content_hash=market_content_hash(protocol_tape),
                config_hash=request.config_hash(),
                started_at=started_at,
                completed_at=completed_at,
                warnings=warnings,
                gateway=self._gateway,
            ),
        )

        return {
            "run_id": run_id,
            "status": "COMPLETED",
            "selected_params": selected_params["params"],
            "selected_trial_id": selected_params["trial_id"],
            "metrics": metrics_by_segment,
            "reconciliation": reconciliation,
        }

    # -- internals -----------------------------------------------------------

    def _write_wfo_artifacts(self, run_id: str, wf: Mapping[str, Any]) -> None:
        folds = wf.get("fold_table")
        if isinstance(folds, pd.DataFrame):
            self._artifacts.write_frame(run_id, "wfo/folds.parquet", folds)
        selection_table = wf.get("fold_selection_table")
        if isinstance(selection_table, pd.DataFrame) and not selection_table.empty:
            self._artifacts.write_frame(run_id, "wfo/fold_selection.parquet", selection_table)
        params_by_fold = wf.get("params_by_fold")
        if params_by_fold:
            self._artifacts.write_json(run_id, "wfo/params_by_fold.json", canonicalize(params_by_fold))
        for name, key in (("trials", "trial_table"), ("candidates", "candidate_table")):
            table = wf.get(key)
            if isinstance(table, pd.DataFrame):
                if name == "trials":
                    table = _search_trials_only(table)
                self._artifacts.write_frame(
                    run_id, f"wfo/{name}.parquet", _flatten_frame(table)
                )

    def _replay_segment(
        self,
        run_id: str,
        key: str,
        segment_frame: pd.DataFrame,
        full_history: pd.DataFrame,
        frozen_params: Mapping[str, object],
        account_kwargs: Mapping[str, object],
    ) -> tuple[pd.DataFrame, dict[str, Any]]:
        # Warm-up history is readable up to the segment start, but the account
        # starts fresh at the segment boundary (plan §7.2, §7.3).
        history = full_history.loc[: segment_frame.index[-1]]
        generated = generate_signals(history, frozen_params)
        signal = generated["pos_weight"].reindex(segment_frame.index).fillna(0.0).astype(float)
        endpoint = self._gateway.run_frozen_replay(
            evaluation_frame=segment_frame, signal=signal, account_kwargs=account_kwargs
        )
        metrics = self._gateway.metrics(endpoint, trading_days=365)
        result = endpoint.result

        series = _build_segment_series(segment_frame, generated, result)
        self._artifacts.write_frame(run_id, f"series/{key}.parquet", series)
        return series, metrics


def _strategy_callable(data, params, train_index, test_index, fold):
    from strategy.delta_rsi import build_walkforward_signal

    return build_walkforward_signal(data, params, train_index, test_index, fold)


def _freeze_selection(wf: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    best = wf.get("best_trial")
    if not isinstance(best, Mapping) or not best.get("params"):
        raise ThreeWindowRunnerError("walk-forward metadata has no selected trial params")
    params = {key: canonicalize(value) for key, value in best["params"].items()}
    frozen = {
        "params": params,
        "trial_id": _sanitize(best.get("trial_id")),
        "objective": _sanitize(best.get("objective")),
        "mean_is_sharpe": _sanitize(best.get("mean_is_sharpe")),
        "mean_oos_sharpe": _sanitize(best.get("mean_oos_sharpe")),
        "mean_decay": _sanitize(best.get("mean_decay")),
        "std_decay": _sanitize(best.get("std_decay")),
        "params_hash": hashlib.sha256(
            json.dumps(params, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "frozen_at": _utc_now_iso(),
        "params_semantics": wf.get("params_semantics"),
        "validation_claim": wf.get("validation_claim"),
        "causality_claim": wf.get("causality_claim"),
        "oos_used_for_selection": wf.get("oos_used_for_selection"),
    }
    # §11.4 selection-trace fields; the per-trial breakdown is a recorded
    # QuantBT capability gap (see ARCHITECTURE.md), so these are null.
    trace = {
        "selected_trial_id": frozen["trial_id"],
        "source": "QuantBT best_trial from train_test_split(mode_1_decay)",
        "capabilities": {
            "per_trial_selection_breakdown": False,
            "candidate_table": bool(wf.get("candidate_table") is not None),
            "fold_selection_table": bool(wf.get("fold_selection_table") is not None),
        },
        "fields": {
            "is_objective": _sanitize(best.get("objective")),
            "is_sharpe_raw": None,
            "is_sharpe_penalized": None,
            "is_trade_count": None,
            "is_trade_penalty": None,
            "is_rank": None,
            "is_top_candidate": None,
            "oos_sharpe_raw": _sanitize(best.get("mean_oos_sharpe")),
            "oos_sharpe_penalized": None,
            "oos_trade_count": None,
            "oos_trade_penalty": None,
            "decay": _sanitize(best.get("mean_decay")),
            "candidate_objective": _sanitize(best.get("objective")),
            "selected": True,
        },
    }
    return frozen, canonicalize(trace)


def _flatten_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """JSON-stringify dict-valued columns so they survive Parquet round-trips."""
    out = frame.copy()
    for column in out.columns:
        if out[column].map(lambda value: isinstance(value, (dict, list))).any():
            out[column + "_json"] = out[column].map(
                lambda value: json.dumps(canonicalize(value), sort_keys=True, separators=(",", ":"))
            )
            out = out.drop(columns=[column])
    return out


def _search_trials_only(frame: pd.DataFrame) -> pd.DataFrame:
    """Remove candidate replay records duplicated in QuantBT trial_table.

    QuantBT intentionally appends candidate evaluations to its complete trial
    ledger. The portal persists those rows in candidates.parquet, while
    trials.parquet remains the unique Optuna search ledger used by charts and
    terminal output.
    """
    if frame.empty or "trial_id" not in frame.columns:
        return frame.copy()
    keys = ["trial_id"]
    for column in ("study_id", "schedule_fold_id"):
        if column in frame.columns and frame[column].notna().any():
            keys.insert(0, column)
            break
    return frame.drop_duplicates(subset=keys, keep="first").reset_index(drop=True)


def _build_segment_series(
    segment_frame: pd.DataFrame,
    generated: pd.DataFrame,
    result,
) -> pd.DataFrame:
    index = segment_frame.index
    equity = result.equity.reindex(index).astype(float)
    positions = result.positions
    position_col = next(
        (column for column in positions.columns if column.endswith("DEFAULT")),
        positions.columns[0],
    )
    series = pd.DataFrame(index=index)
    series["open"] = segment_frame["open"].astype(float)
    series["high"] = segment_frame["high"].astype(float)
    series["low"] = segment_frame["low"].astype(float)
    series["close"] = segment_frame["close"].astype(float)
    series["volume"] = segment_frame["volume"].astype(float)
    series["signal_target"] = generated["pos_weight"].reindex(index).fillna(0.0).astype(float)
    series["exit_type"] = generated["exit_type"].reindex(index).fillna(0.0).astype(float)
    series["exit_price"] = generated["exit_price"].reindex(index).fillna(0.0).astype(float)
    series["accepted_position"] = positions[position_col].reindex(index).fillna(0.0).astype(float)
    series["equity"] = equity
    series["returns"] = result.returns.reindex(index).fillna(0.0).astype(float)
    # Presentation-only drawdown (B3 capability note); metrics stay QuantBT's.
    peak = equity.cummax()
    series["drawdown"] = np.where(peak > 0, equity / peak - 1.0, 0.0)
    # Fee/funding/margin series are a recorded QuantBT capability gap and are
    # intentionally omitted (plan §11.2).
    series.attrs["capabilities"] = {
        "fee_series": False,
        "funding_series": False,
        "margin_series": False,
        "audited_fills": False,
    }
    return series


def _build_presentation_equity(
    calendar: pd.DatetimeIndex,
    segment_frames: Mapping[str, pd.DataFrame],
    series_by_segment: Mapping[str, pd.DataFrame],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    calendar_equity = pd.DataFrame(index=calendar)
    rebased_equity = pd.DataFrame(index=calendar)
    for key, segment_frame in segment_frames.items():
        equity = series_by_segment[key]["equity"]
        calendar_equity[f"{key}_equity"] = equity.reindex(calendar)
        base = float(equity.iloc[0])
        rebased_equity[f"{key}_equity"] = (equity / base * 100.0).reindex(calendar)
    return calendar_equity, rebased_equity


def _reconcile_final_equity(
    metrics_by_segment: Mapping[str, Mapping[str, Any]],
    series_by_segment: Mapping[str, pd.DataFrame],
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, metrics in metrics_by_segment.items():
        last_point = float(series_by_segment[key]["equity"].iloc[-1])
        reported = float(metrics.get("final_equity", float("nan")))
        out[key] = {
            "last_equity_point": last_point,
            "reported_final_equity": reported,
            "matches": bool(np.isclose(last_point, reported, rtol=1e-9, atol=1e-6)),
        }
    return out


def _strategy_artifact(specification) -> dict[str, Any]:
    return {
        "strategy_id": specification.strategy_id,
        "display_name": specification.display_name,
        "version": specification.version,
        "default_timeframe": specification.default_timeframe,
        "required_columns": list(specification.required_columns),
        "structural_contract": canonicalize(specification.structural_contract),
        "parameter_space": canonicalize(specification.parameter_space),
    }


def _manifest(
    *,
    run_id: str,
    request: PortalRunRequest,
    market: PreparedMarketData,
    analysis_content_hash: str,
    config_hash: str,
    started_at: str,
    completed_at: str,
    warnings: list[str],
    gateway: QuantBTGateway,
) -> dict[str, Any]:
    return canonicalize(
        {
            "run_id": run_id,
            "status": "COMPLETED",
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "protocol": request.protocol.value,
            "strategy_id": request.strategy_id,
            "dataset_id": request.dataset_id,
            "symbol": request.symbol,
            "timeframe": request.timeframe,
            "quantbt_version": gateway.version(),
            "portal_version": portal_version,
            "dataset_content_hash": market.content_hash,
            "analysis_content_hash": analysis_content_hash,
            "config_hash": config_hash,
            "random_seed": request.calibration.random_seed,
            "started_at": started_at,
            "completed_at": completed_at,
            "warnings": warnings,
            "failure": None,
        }
    )
