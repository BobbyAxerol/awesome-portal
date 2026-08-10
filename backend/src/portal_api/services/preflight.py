from __future__ import annotations

import pandas as pd

from portal_api.adapters.market_data import (
    MarketDataProvider,
    market_content_hash,
    partition_three_windows,
    slice_market_range,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.errors import DataSchemaError
from portal_api.domain.requests import AdvancedWalkForwardConfig, PortalRunRequest, ThreeWindowConfig
from portal_api.domain.responses import PreflightResponse, WindowSummary
from portal_api.strategies import StrategyRegistry


class PreflightService:
    def __init__(
        self,
        provider: MarketDataProvider,
        strategies: StrategyRegistry,
        quantbt_gateway: QuantBTGateway | None = None,
    ):
        self._provider = provider
        self._strategies = strategies
        self._quantbt_gateway = quantbt_gateway

    def run(self, request: PortalRunRequest) -> PreflightResponse:
        strategy = self._strategies.get(request.strategy_id)
        strategy.validate_parameter_space(request.parameter_space)
        market = self._provider.load(
            request.dataset_id,
            symbol=request.symbol,
            timeframe=request.timeframe,
        )

        descriptor = market.descriptor
        if descriptor.symbol is not None and request.symbol != descriptor.symbol:
            raise DataSchemaError(
                f"request symbol {request.symbol!r} does not match dataset symbol {descriptor.symbol!r}"
            )
        if descriptor.timeframe is not None and request.timeframe != descriptor.timeframe:
            raise DataSchemaError(
                f"request timeframe {request.timeframe!r} does not match dataset timeframe {descriptor.timeframe!r}"
            )

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

            fold_plan = compute_run_fold_plan(request, analysis_frame.index)
        return PreflightResponse(
            valid=True,
            strategy_id=request.strategy_id,
            dataset_id=request.dataset_id,
            symbol=request.symbol,
            timeframe=request.timeframe,
            windows=summaries,
            data_quality=data_quality,
            config_hash=canonical,
            fold_plan=fold_plan,
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
