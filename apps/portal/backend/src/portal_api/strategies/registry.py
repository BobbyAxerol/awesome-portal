from __future__ import annotations

from portal_api.domain.errors import PortalDomainError

from .delta_rsi import DELTA_RSI_SPEC, DeltaRsiStrategyAdapter


class StrategyRegistry:
    def __init__(self) -> None:
        self._strategies = {
            DELTA_RSI_SPEC.strategy_id: DeltaRsiStrategyAdapter(),
        }

    def list(self) -> tuple[DeltaRsiStrategyAdapter, ...]:
        return tuple(self._strategies.values())

    def get(self, strategy_id: str) -> DeltaRsiStrategyAdapter:
        try:
            return self._strategies[strategy_id]
        except KeyError as exc:
            raise PortalDomainError(f"unknown strategy_id: {strategy_id}") from exc
