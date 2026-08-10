from __future__ import annotations

import pandas as pd

from portal_api.adapters.market_data import MarketDataProvider, partition_three_windows
from portal_api.domain.errors import DataSchemaError
from portal_api.domain.requests import AdvancedWalkForwardConfig, PortalRunRequest, ThreeWindowConfig
from portal_api.domain.responses import PreflightResponse, WindowSummary
from portal_api.strategies import StrategyRegistry


class PreflightService:
    def __init__(self, provider: MarketDataProvider, strategies: StrategyRegistry):
        self._provider = provider
        self._strategies = strategies

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
                    end_exclusive=windows.holdout_end_exclusive.to_pydatetime(),
                    bars=len(windows.holdout_frame),
                ),
            )
        elif isinstance(request.calibration, AdvancedWalkForwardConfig):
            summaries = (
                WindowSummary(
                    role="DATASET",
                    start_inclusive=market.frame.index[0].to_pydatetime(),
                    end_exclusive=(market.frame.index[-1] + market.frame.index.freq).to_pydatetime()
                    if market.frame.index.freq is not None
                    else (market.frame.index[-1] + pd.Timedelta(1, unit="ns")).to_pydatetime(),
                    bars=len(market.frame),
                ),
            )
        else:  # pragma: no cover - closed Pydantic union
            raise TypeError("unsupported calibration config")

        canonical = request.config_hash()
        return PreflightResponse(
            valid=True,
            strategy_id=request.strategy_id,
            dataset_id=request.dataset_id,
            symbol=request.symbol,
            timeframe=request.timeframe,
            windows=summaries,
            data_quality=market.quality,
            config_hash=canonical,
        )
