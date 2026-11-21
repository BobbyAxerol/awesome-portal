"""Pinned Delta native-route adaptation, not another matcher/accounting engine.

The protected Alpha owns close-time signals. QuantBT owns next-bar activation,
fills, brackets, accounting and costs. No user Python/order tape enters here.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

from .quantbt import QuantBTGateway

NATIVE_ROUTES = frozenset({"intrabar_bracket", "reactive", "event_driven"})
NATIVE_ACCOUNT = {"initial_capital": 20_000, "leverage": 3,
                  "fee_rate": 0.0005, "use_funding": False}
NOTIONAL = 2_000


def _decimal(value: Any) -> str:
    parsed = Decimal(str(value))
    if not parsed.is_finite():
        raise ValueError("native route published a non-finite decimal")
    rendered = format(parsed, "f")
    return "0" if parsed == 0 else rendered


def validate_native_market(market: pd.DataFrame, *, symbol: str) -> None:
    index = market.index
    if (symbol not in {"BTCUSDT", "ETHUSDT", "SOLUSDT"}
            or not isinstance(index, pd.DatetimeIndex) or index.tz is None
            or str(index.tz) != "UTC" or not index.is_monotonic_increasing or not index.is_unique
            or not 2 <= len(index) <= 20_000 or bool((index.as_unit("ns").asi8 % 3_600_000_000_000 != 0).any())
            or index[-1] + pd.Timedelta(hours=1) > pd.Timestamp.now(tz='UTC')
            or not {"open", "high", "low", "close", "volume"}.issubset(market.columns)):
        raise ValueError("native Delta requires its bounded exact UTC 1h closed-bar tape")
    values = market[["open", "high", "low", "close", "volume"]].to_numpy(dtype=float)
    if (not np.isfinite(values).all() or (values[:, :4] <= 0).any() or (values[:, 4] < 0).any()
            or (values[:, 1] < values[:, :4].max(axis=1)).any()
            or (values[:, 2] > values[:, :4].min(axis=1)).any()):
        raise ValueError("native route refuses invalid source OHLCV, never repairs bars")


def _commands(*, timestamp: pd.Timestamp, symbol: str, target: float, current: float, ordinal: int):
    from quantbt.core.orders import OrderActivationPolicy, OrderCommand
    from quantbt.core.schema import OrderSide, OrderType
    difference = target - current
    if abs(difference) < 1e-12:
        return []
    return [OrderCommand(timestamp=timestamp, symbol=symbol,
        side=OrderSide.BUY if difference > 0 else OrderSide.SELL,
        order_type=OrderType.MARKET, qty=abs(difference),
        # Eligibility is immediate *when the command activates*. The endpoint's
        # event_lifecycle_v2_next_bar_close contract owns the next-bar clock;
        # OrderActivationPolicy has no "next_bar" value in the pinned engine.
        reduce_only=target == 0, order_id=f"delta-native-{ordinal}",
        activation_policy=OrderActivationPolicy.IMMEDIATE)]


class DeltaCloseReactiveStrategy:
    """Known-close target vs engine-observed units; callback never reads future bars."""
    def __init__(self, *, signals: pd.Series, symbol: str):
        self._signals = signals.to_numpy(dtype=float)
        self._symbol = symbol

    def on_bar_close(self, context):
        index = context.bar_index
        if index >= len(self._signals) - 1:
            return []  # no command whose next activation lies outside the tape
        close = float(context.close[0])
        target = float(np.sign(self._signals[index])) * NOTIONAL / close
        current = float(context.positions[self._symbol])
        # Send only on an Alpha signal transition; no every-bar resizing/DCA.
        if index and np.sign(self._signals[index]) == np.sign(self._signals[index - 1]):
            return []
        return _commands(timestamp=context.timestamp, symbol=self._symbol,
                         target=target, current=current, ordinal=index)


def run_native_delta(*, route: str, market: pd.DataFrame, symbol: str,
                     parameters: dict[str, int | float], gateway: QuantBTGateway | None = None):
    if route not in NATIVE_ROUTES:
        raise ValueError("native route is not owner-approved")
    validate_native_market(market, symbol=symbol)
    from strategy.delta_rsi import generate_signals
    from quantbt.core.execution_contract import ExecutionContract
    gateway = gateway or QuantBTGateway()
    signal = generate_signals(market, parameters)["pos_weight"].reindex(market.index)
    if signal.isna().any() or not np.isfinite(signal.to_numpy(dtype=float)).all():
        raise ValueError("protected Alpha did not publish a finite aligned causal signal")
    if route == "intrabar_bracket":
        from quantbt.core.intrabar_reference import IntrabarIntentTape
        side = np.sign(signal.to_numpy(dtype=float)).astype(np.int8)
        previous = np.r_[0, side[:-1]]
        changed = side != previous
        intent = IntrabarIntentTape.from_arrays(entry_side=np.where(changed, side, 0),
            entry_size=np.full(len(side), NOTIONAL, dtype=float),
            stop_value=np.full(len(side), float(parameters["slpercent"]) / 100),
            take_profit_value=np.full(len(side), float(parameters["slpercent"]) * 2 / 100),
            technical_exit=changed & (side == 0))
        endpoint = gateway.route_endpoint(route, **NATIVE_ACCOUNT,
            intrabar_sizing_mode="fixed_notional", report_level="audit",
            execution_contract=ExecutionContract.intrabar_bracket())
        return endpoint.simulate(data=market, intent=intent, symbols=[symbol])
    endpoint = gateway.route_endpoint(route, **NATIVE_ACCOUNT,
        **({} if route == "reactive" else {"input_mode": "orders"}),
        profile="audit", backend="python",
        execution_contract="event_lifecycle_v2_next_bar_close")
    if route == "reactive":
        return endpoint.simulate(data=market, strategy=DeltaCloseReactiveStrategy(signals=signal, symbol=symbol), symbols=[symbol])
    from quantbt.core.orders import OrderCommand
    # An explicit reset of the simulation's initially empty book is not an
    # Alpha trade. It lets the public orders facade model an honestly empty
    # decision tape without inventing PLACE/fill records or a Portal PnL path.
    commands = [OrderCommand(timestamp=market.index[0], action="cancel_all",
        order_id="delta-native-initial-empty-reset", metadata={"origin": "INITIAL_EMPTY_STATE_NOT_ALPHA_DECISION"})]
    current_target = 0.0
    previous_side = 0.0
    for index, (timestamp, weight) in enumerate(signal.iloc[:-1].items()):
        side = float(np.sign(weight))
        if side == previous_side:
            continue
        target = side * NOTIONAL / float(market["close"].iloc[index])
        # External order tape timestamps identify the activation bar. Unlike
        # reactive callbacks, the compiler does not shift them automatically.
        # Use only the preceding known close to build the next-bar command;
        # leave matching/accounting to the pinned engine.
        commands.extend(_commands(timestamp=market.index[index + 1], symbol=symbol, target=target,
                                  current=current_target, ordinal=index))
        current_target, previous_side = target, side
    return endpoint.simulate(data=market, order_commands=commands, symbols=[symbol])


def native_result_facts(*, route: str, result: Any) -> dict[str, Any]:
    """Public bounded facts; missing series stays absent, not synthetic zero."""
    metadata=getattr(result,'metadata',{})
    if metadata:
        contract=metadata.get('execution_contract',{})
        if route=='intrabar_bracket':
            if contract.get('signal_phase')!='bar_close' or contract.get('entry_fill_phase')!='next_open':
                raise ValueError('native bracket engine did not publish the declared next-open clock')
        elif metadata.get('execution_contract_id')!='event_lifecycle_v2_next_bar_close' or metadata.get('event_clock_contract',{}).get('command_activation_phase')!='next_bar_close':
            raise ValueError('native event engine did not publish the declared next-bar-close clock')
    def series(name: str):
        values = getattr(result, name, None)
        if not isinstance(values, pd.Series) or values.empty:
            return {"state": "NOT_PUBLISHED", "total": None,
                    "reason_code": "NATIVE_RESULT_SERIES_NOT_PUBLISHED"}
        if not values.index.equals(result.equity.index) or values.isna().any():
            raise ValueError("native cost series is not aligned and complete")
        return {"state": "AVAILABLE", "total": _decimal(values.sum()), "reason_code": None}
    return {"schema_version": "research.native-route-result.v1", "execution_route": route,
        "authority": "PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL",
        "input_protocol": {"intrabar_bracket": "DELTA_CLOSE_BRACKET_INTENTS_V1",
            "reactive": "DELTA_CLOSE_STATEFUL_CALLBACK_V1", "event_driven": "DELTA_CLOSE_ORDER_COMMANDS_V1"}[route],
        "clock": "KNOWN_CLOSE_NEXT_BAR_INTRABAR" if route == "intrabar_bracket" else "KNOWN_CLOSE_NEXT_BAR_CLOSE",
        "position_unit": "CONTRACT_QUANTITY", "target_notional": str(NOTIONAL),
        "fees": series("fees"), "funding": series("funding"), "cost_scope": "FULL_CHILD_TAPE",
        "fills_count": len(result.fills), "orders_count": len(result.orders) if result.orders else None,
        "replay_authority": "RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS"}
