from __future__ import annotations

import pandas as pd

from portal_api.adapters.market_data import (
    MarketDataQuery,
    MarketDataProvider,
    market_content_hash,
    partition_three_windows,
    slice_market_range,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.errors import DataSchemaError
from portal_api.domain.requests import AdvancedWalkForwardConfig, PortalRunRequest, ThreeWindowConfig
from portal_api.domain.responses import PreflightCheck, PreflightResponse, WindowSummary
from portal_api.services.engine_capabilities import EngineCapabilityService
from portal_api.strategies import StrategyRegistry


def market_data_query_for_run(
    request: PortalRunRequest,
    *,
    columns: tuple[str, ...],
) -> MarketDataQuery:
    """Map a run contract to one bounded historical/fixture data query."""
    if isinstance(request.calibration, ThreeWindowConfig):
        start = request.calibration.is_start
        end_exclusive = request.calibration.holdout_end_exclusive
    elif isinstance(request.calibration, AdvancedWalkForwardConfig):
        start = request.calibration.data_start
        end_exclusive = request.calibration.data_end_exclusive
    else:  # pragma: no cover - Pydantic closes the calibration union
        raise TypeError("unsupported calibration config")
    return MarketDataQuery(
        dataset_id=request.dataset_id,
        symbol=request.symbol,
        timeframe=request.timeframe,
        start=start,
        end_exclusive=end_exclusive,
        columns=columns,
    )


class PreflightService:
    def __init__(
        self,
        provider: MarketDataProvider,
        strategies: StrategyRegistry,
        quantbt_gateway: QuantBTGateway | None = None,
        capabilities: EngineCapabilityService | None = None,
    ):
        self._provider = provider
        self._strategies = strategies
        self._quantbt_gateway = quantbt_gateway
        if capabilities is None:
            from pathlib import Path as _Path

            module_path = _Path(__file__).resolve()
            candidates = (
                module_path.parents[4] / "registry",
                module_path.parents[3] / "registry",
            )
            root = next(
                (candidate for candidate in candidates if (candidate / "registry.json").is_file()),
                candidates[0],
            )
            capabilities = EngineCapabilityService(root)
        self._capabilities = capabilities

    @staticmethod
    def _quality_preflight(frame: pd.DataFrame, descriptor: object) -> None:
        from portal_api.domain.errors import DataSchemaError
        from portal_api.services.data_catalog import compute_quality

        timeframe = getattr(descriptor, "timeframe", None) or "1d"
        report = compute_quality(
            frame,
            snapshot_id="preflight",
            max_gap_ratio=0.1,
            max_duplicate_rows=0,
            expected_frequency=timeframe,
        )
        if not report.passed:
            raise DataSchemaError(
                f"data quality gate failed: {', '.join(report.reason_codes)}"
            )

    def run(self, request: PortalRunRequest) -> PreflightResponse:
        """Per-check preflight (R14): never raises for data/config issues.

        Every gate is reported as a ``PreflightCheck`` so the UI can show
        exactly which one failed (columns, symbol, timeframe, capability,
        quality, windows, folds) instead of a generic "preflight failed".
        ``valid`` is the conjunction; ``create_run`` still turns a failing
        preflight into a 422 via ``preflight.valid``.
        """
        checks: list[PreflightCheck] = []

        strategy = self._strategies.get(request.strategy_id)
        checks.append(
            PreflightCheck(
                id="strategy",
                ok=strategy is not None,
                detail=None if strategy is not None else "unknown strategy",
            )
        )
        if strategy is None:
            return self._invalid(request, checks)

        try:
            strategy.validate_parameter_space(request.parameter_space)
            checks.append(PreflightCheck(id="parameter_space", ok=True))
        except Exception as exc:  # noqa: BLE001 - reported as a check
            checks.append(
                PreflightCheck(id="parameter_space", ok=False, detail=str(exc))
            )

        try:
            market = self._provider.load(
                market_data_query_for_run(
                    request,
                    columns=tuple(strategy.specification.required_columns),
                )
            )
            checks.append(PreflightCheck(id="dataset", ok=True))
        except Exception as exc:  # noqa: BLE001 - reported as a check
            checks.append(
                PreflightCheck(id="dataset", ok=False, detail=str(exc))
            )
            return self._invalid(request, checks)

        required = tuple(strategy.specification.required_columns)
        frame_columns = set(market.frame.columns)
        missing = [column for column in required if column not in frame_columns]
        checks.append(
            PreflightCheck(
                id="required_columns",
                ok=not missing,
                missing=tuple(missing),
                detail=None if not missing else f"missing columns: {', '.join(missing)}",
            )
        )

        descriptor = market.descriptor
        symbol_ok = descriptor.symbol is None or request.symbol == descriptor.symbol
        checks.append(
            PreflightCheck(
                id="symbol",
                ok=symbol_ok,
                detail=None
                if symbol_ok
                else f"request symbol {request.symbol!r} does not match dataset symbol {descriptor.symbol!r}",
            )
        )
        timeframe_ok = descriptor.timeframe is None or request.timeframe == descriptor.timeframe
        checks.append(
            PreflightCheck(
                id="timeframe",
                ok=timeframe_ok,
                detail=None
                if timeframe_ok
                else f"request timeframe {request.timeframe!r} does not match dataset timeframe {descriptor.timeframe!r}",
            )
        )

        try:
            if descriptor.source_class == "historical_market_data":
                self._quality_preflight(market.frame, descriptor)
            checks.append(PreflightCheck(id="quality", ok=True))
        except Exception as exc:  # noqa: BLE001 - reported as a check
            checks.append(PreflightCheck(id="quality", ok=False, detail=str(exc)))

        try:
            self._capabilities.preflight(
                protocol=request.protocol.value,
                data_class=descriptor.source_class or "historical_market_data",
                optuna_trials=request.calibration.optuna_trials,
                parameter_space_entries=len(request.parameter_space.root),
            )
            checks.append(PreflightCheck(id="capability", ok=True))
        except Exception as exc:  # noqa: BLE001 - reported as a check
            checks.append(PreflightCheck(id="capability", ok=False, detail=str(exc)))

        try:
            if isinstance(request.calibration, ThreeWindowConfig):
                windows = partition_three_windows(market, request.calibration)
                analysis_frame = pd.concat(
                    [windows.is_frame, windows.oos_frame, windows.holdout_frame]
                )
                summaries = (
                    WindowSummary(
                        role="IS",
                        start_inclusive=request.calibration.is_start,
                        end_exclusive=request.calibration.is_end_exclusive,
                        bars=len(windows.is_frame),
                    ),
                    WindowSummary(
                        role="OOS",
                        start_inclusive=request.calibration.oos_start,
                        end_exclusive=request.calibration.oos_end_exclusive,
                        bars=len(windows.oos_frame),
                    ),
                    WindowSummary(
                        role="HOLDOUT_LIVE",
                        start_inclusive=request.calibration.holdout_start,
                        end_exclusive=windows.holdout_end_exclusive.to_pydatetime(warn=False),
                        bars=len(windows.holdout_frame),
                    ),
                )
            elif isinstance(request.calibration, AdvancedWalkForwardConfig):
                active_market = slice_market_range(
                    market,
                    start=request.calibration.data_start,
                    end_exclusive=request.calibration.data_end_exclusive,
                )
                summaries = (
                    WindowSummary(
                        role="DATASET",
                        start_inclusive=active_market.frame.index[0].to_pydatetime(warn=False),
                        end_exclusive=(
                            pd.Timestamp(request.calibration.data_end_exclusive).to_pydatetime(warn=False)
                            if request.calibration.data_end_exclusive is not None
                            else (active_market.frame.index[-1] + pd.Timedelta(1, unit="ns")).to_pydatetime(warn=False)
                        ),
                        bars=len(active_market.frame),
                    ),
                )
                analysis_frame = active_market.frame
                if self._quantbt_gateway is not None:
                    self._validate_advanced(request.calibration)
            else:  # pragma: no cover - closed Pydantic union
                raise TypeError("unsupported calibration config")
            checks.append(PreflightCheck(id="windows", ok=True))
        except Exception as exc:  # noqa: BLE001 - reported as a check
            checks.append(PreflightCheck(id="windows", ok=False, detail=str(exc)))
            return self._invalid(request, checks)

        canonical = request.config_hash()
        data_quality = dict(market.quality)
        data_quality["analysis"] = {
            "rows": len(analysis_frame),
            "first_timestamp": analysis_frame.index[0].isoformat(),
            "last_timestamp": analysis_frame.index[-1].isoformat(),
            "content_hash": market_content_hash(analysis_frame),
        }
        fold_plan = None
        if isinstance(request.calibration, AdvancedWalkForwardConfig):
            from portal_api.services.fold_plan import compute_run_fold_plan

            try:
                fold_plan = compute_run_fold_plan(request, analysis_frame.index)
                checks.append(PreflightCheck(id="folds", ok=True))
            except Exception as exc:  # noqa: BLE001 - reported as a check
                checks.append(
                    PreflightCheck(id="folds", ok=False, detail=str(exc))
                )
        else:
            checks.append(PreflightCheck(id="folds", ok=True))

        valid = all(check.ok for check in checks)
        return PreflightResponse(
            valid=valid,
            strategy_id=request.strategy_id,
            dataset_id=request.dataset_id,
            symbol=request.symbol,
            timeframe=request.timeframe,
            windows=summaries,
            data_quality=data_quality,
            config_hash=canonical,
            fold_plan=fold_plan,
            checks=tuple(checks),
        )

    def _invalid(
        self, request: PortalRunRequest, checks: list[PreflightCheck]
    ) -> PreflightResponse:
        return PreflightResponse(
            valid=False,
            strategy_id=request.strategy_id,
            dataset_id=request.dataset_id,
            symbol=request.symbol,
            timeframe=request.timeframe,
            windows=(),
            data_quality={},
            config_hash=request.config_hash(),
            fold_plan=None,
            checks=tuple(checks),
        )

    def _validate_advanced(self, calibration: AdvancedWalkForwardConfig) -> None:
        """Capability + QuantBT-native config validation for Advanced WFO."""
        from portal_api.services.advanced_walkforward_runner import _config_fields

        rows = self._quantbt_gateway.walkforward_capabilities()
        supported = {
            str(row.get("target_mode"))
            for row in rows
            if str(row.get("status")).strip().lower() == "supported"
        }
        if "pct_equity" not in supported:
            raise DataSchemaError("pct_equity is not a supported walk-forward target mode")
        try:
            self._quantbt_gateway.validate_advanced_walkforward(
                config_fields=_config_fields(calibration)
            )
        except Exception as exc:  # noqa: BLE001 - surface QuantBT's message safely
            raise DataSchemaError(f"unsupported walk-forward configuration: {exc}") from exc
