"""Immutable Delta Limit/OCO input recipe; QuantBT remains the matcher.

One server-owned cycle starts at the first non-flat protected Delta close
after the declared 300-bar warmup. Prices/size use that known close only.
Parent-full-fill activation and OCO cancellation are engine instructions,
never a Portal reconstruction of positions, fills or account PnL.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .quantbt import QuantBTGateway
from .research_native_routes import NATIVE_ACCOUNT, NOTIONAL, validate_native_market

INPUT_PROTOCOL = "DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1"
ENTRY_EXPIRY_BARS = 24
WARMUP_BARS = 300


def build_commands(*, market: pd.DataFrame, signals: pd.Series, symbol: str, stop_fraction: float):
    from quantbt.core.orders import OrderActivationPolicy, OrderCommand, TimeInForce
    from quantbt.core.schema import OrderSide, OrderType

    validate_native_market(market, symbol=symbol)
    if (not signals.index.equals(market.index) or signals.isna().any()
            or not np.isfinite(signals.to_numpy(dtype=float)).all()
            or not np.isfinite(stop_fraction) or not 0 < stop_fraction < 0.5):
        raise ValueError("Limit/OCO requires aligned causal signals and finite bounded stop distance")
    # No trade is invented when the actual Alpha remains flat. The recipe's
    # qualification must demonstrate a real positive cycle, not inject one.
    eligible = np.flatnonzero(np.sign(signals.to_numpy(dtype=float))[WARMUP_BARS:-1])
    if not len(eligible):
        return [OrderCommand(timestamp=market.index[0], action="cancel_all",
            order_id="delta-limit-oco-empty-reset", metadata={"origin": "INITIAL_EMPTY_STATE_NOT_ALPHA_DECISION"})]
    index = WARMUP_BARS + int(eligible[0])
    side = int(np.sign(signals.iloc[index]))
    price = float(market["close"].iloc[index])
    entry_id = f"delta-limit-oco-entry-{index}"
    group = f"delta-limit-oco-exits-{index}"
    activation = market.index[index + 1]  # external commands name the activation bar
    expiry = min(activation + pd.Timedelta(hours=ENTRY_EXPIRY_BARS), market.index[-1])
    entry_side = OrderSide.BUY if side > 0 else OrderSide.SELL
    exit_side = OrderSide.SELL if side > 0 else OrderSide.BUY
    metadata = {"decision_at_utc_ms": int(market.index[index].value // 1_000_000),
                "price_basis": "KNOWN_CLOSE_LIMIT_PRICE", "recipe": INPUT_PROTOCOL}
    common = dict(timestamp=activation, symbol=symbol, qty=NOTIONAL / price, tif=TimeInForce.GTC, metadata=metadata)
    return [
        OrderCommand(**common, order_id=entry_id, side=entry_side,
            order_type=OrderType.LIMIT, price=price, expires_at=expiry),
        OrderCommand(**common, order_id=f"{entry_id}-sl", side=exit_side,
            order_type=OrderType.STOP_MARKET, trigger_price=price * (1 - side * stop_fraction),
            parent_order_id=entry_id, oco_group_id=group, reduce_only=True,
            activation_policy=OrderActivationPolicy.ON_PARENT_FULL_FILL, expires_at=market.index[-1]),
        OrderCommand(**common, order_id=f"{entry_id}-tp", side=exit_side,
            order_type=OrderType.LIMIT, price=price * (1 + side * 2 * stop_fraction),
            parent_order_id=entry_id, oco_group_id=group, reduce_only=True,
            activation_policy=OrderActivationPolicy.ON_PARENT_FULL_FILL, expires_at=market.index[-1]),
    ]


def run_native_delta(*, route, market, symbol, parameters, gateway=None):
    if route != "event_driven":
        raise ValueError("Limit/OCO is only the immutable event-driven input recipe")
    from strategy.delta_rsi import generate_signals
    signal = generate_signals(market, parameters)["pos_weight"].reindex(market.index)
    commands = build_commands(market=market, signals=signal, symbol=symbol,
                              stop_fraction=float(parameters["slpercent"]) / 100)
    endpoint = (gateway or QuantBTGateway()).route_endpoint("event_driven", **NATIVE_ACCOUNT,
        input_mode="orders", profile="audit", backend="python",
        execution_contract="event_lifecycle_v2_next_bar_close")
    return endpoint.simulate(data=market, order_commands=commands, symbols=[symbol])


def native_result_facts(*, route, result):
    from .research_native_routes import native_result_facts as legacy_facts
    facts = legacy_facts(route=route, result=result)
    facts["input_protocol"] = INPUT_PROTOCOL
    return facts
