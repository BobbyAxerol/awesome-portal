"""Causal multi-cycle Delta order inputs; pinned QuantBT owns all execution.

This additive edition never changes the historical one-cycle adapter. Native
IS Sharpe is scored by QuantBT's public optimizer, not a scalar-route proxy.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .quantbt import QuantBTGateway
from .research_native_routes import NATIVE_ACCOUNT, NOTIONAL, validate_native_market

INPUT_PROTOCOL = "DELTA_CLOSE_MULTICYCLE_LIMIT_OCO_COMMANDS_V1"
CYCLE_BARS = 48
ENTRY_EXPIRY_BARS = 24
WARMUP_BARS = 300


def build_commands(market: pd.DataFrame, signals: pd.Series, *, symbol: str,
                   stop_fraction: float) -> list[Any]:
    from quantbt.core.orders import OrderActivationPolicy, OrderCommand
    from quantbt.core.schema import OrderSide, OrderType

    validate_native_market(market, symbol=symbol)
    if (not signals.index.equals(market.index) or signals.isna().any()
            or not np.isfinite(signals.to_numpy(dtype=float)).all()
            or not np.isfinite(stop_fraction) or not 0 < stop_fraction < 0.5):
        raise ValueError("multi-cycle native input must be aligned, finite and bounded")
    commands = []
    # Leave a full end-exclusive cycle. Every decision uses only that bar's
    # protected close signal/price; no subsequent high/low or fill is consulted.
    for ordinal, index in enumerate(range(WARMUP_BARS, len(market) - CYCLE_BARS, CYCLE_BARS)):
        side = int(np.sign(signals.iloc[index]))
        if side == 0:
            continue
        price = float(market["close"].iloc[index])
        parent = f"delta-limit-oco-cycle-{ordinal}-entry"
        group = f"delta-limit-oco-cycle-{ordinal}-exits"
        activation = market.index[index + 1]
        expiry = market.index[index + CYCLE_BARS - 1]
        quantity = NOTIONAL / price
        metadata = {"decision_utc_ms": int(market.index[index].value // 1_000_000),
                    "price_basis": "KNOWN_DECISION_CLOSE", "input_protocol": INPUT_PROTOCOL,
                    "cycle_id": str(ordinal)}
        common = dict(timestamp=activation, symbol=symbol, qty=quantity,
                      expires_at=expiry, metadata=metadata)
        commands.append(OrderCommand(**{**common, "expires_at": market.index[index + ENTRY_EXPIRY_BARS]},
            order_id=parent, side=OrderSide.BUY if side > 0 else OrderSide.SELL,
            order_type=OrderType.LIMIT, price=price))
        exits = dict(**common, side=OrderSide.SELL if side > 0 else OrderSide.BUY,
                     reduce_only=True, parent_order_id=parent, oco_group_id=group,
                     activation_policy=OrderActivationPolicy.ON_PARENT_FULL_FILL)
        commands.append(OrderCommand(**exits, order_id=parent + "-sl", order_type=OrderType.STOP_MARKET,
                                     trigger_price=price * (1 - side * stop_fraction)))
        commands.append(OrderCommand(**exits, order_id=parent + "-tp", order_type=OrderType.LIMIT,
                                     price=price * (1 + side * stop_fraction * 2)))
        # Expire/cancel the old book before re-entry; reduce-only is enforced
        # against the actual engine position. A flat book may reject this close,
        # faithfully retained as a rejection, never converted into a fill.
        commands.append(OrderCommand(timestamp=market.index[index + CYCLE_BARS], action="cancel_all",
            symbol=symbol, order_id=parent + "-reset", metadata=metadata))
        commands.append(OrderCommand(timestamp=market.index[index + CYCLE_BARS], symbol=symbol,
            side=OrderSide.SELL if side > 0 else OrderSide.BUY, order_type=OrderType.MARKET,
            qty=quantity, reduce_only=True, order_id=parent + "-close", metadata=metadata))
    if not commands:
        commands.append(OrderCommand(timestamp=market.index[0], action="cancel_all",
            order_id="delta-limit-oco-empty-reset", metadata={"origin": "INITIAL_EMPTY_STATE_NOT_ALPHA_DECISION"}))
    return commands


def run_native_delta(*, route: str, market: pd.DataFrame, symbol: str,
                     parameters: dict[str, int | float], gateway: QuantBTGateway | None = None):
    if route != "event_driven":
        raise ValueError("multi-cycle Limit/OCO requires the exact event-driven route")
    from strategy.delta_rsi import generate_signals
    gateway = gateway or QuantBTGateway()
    signal = generate_signals(market, parameters)["pos_weight"]
    endpoint = gateway.route_endpoint(route, **NATIVE_ACCOUNT, input_mode="orders", profile="audit",
        backend="python", execution_contract="event_lifecycle_v2_next_bar_close")
    return endpoint.simulate(data=market, symbols=[symbol], order_commands=build_commands(
        market, signal, symbol=symbol, stop_fraction=float(parameters["slpercent"]) / 100))


def native_result_facts(*, route: str, result: Any) -> dict[str, Any]:
    from .research_native_routes import native_result_facts as base
    return {**base(route=route, result=result), "input_protocol": INPUT_PROTOCOL}


def optimize_native(*, market: pd.DataFrame, is_end_utc_ms: int, symbol: str, trials: int,
                    seed: int, gateway: QuantBTGateway, baseline: dict[str, int | float],
                    early_stopping: int | None = None):
    from quantbt.optimization import GenericEndpointEvaluator, OptunaOptimizer, ReportMetricObjective, CandidateSelector
    from strategy.specification import DELTA_RSI_SPECIFICATION

    if type(trials) is not int or not 2 <= trials <= 400 or seed != 42:
        raise ValueError("native optimizer requires 2–400 real trials and seed 42")
    train = market.loc[market.index < pd.Timestamp(is_end_utc_ms, unit="ms", tz="UTC")]
    objective = ReportMetricObjective(value_metrics=("sharpe",),
        metric_names=("sharpe", "max_drawdown_pct", "num_trades"), trading_days=365,
        metadata_builder=lambda result,params,metrics:dict(
            source_authority='PINNED_QUANTBT_NATIVE_RESULT',fills_count=len(result.fills),
            orders_count=len(result.orders),
            lifecycle_rows=len(result.metadata.get('lifecycle_event_report_v1',())),
            command_rows=len(result.metadata.get('command_report',()))))
    evaluator = GenericEndpointEvaluator(
        build_run_inputs=lambda params: dict(route="event_driven", market=train, symbol=symbol,
                                            parameters=dict(params), gateway=gateway),
        run_func=run_native_delta, objective_builder=objective,
        metadata={"authority": "PINNED_QUANTBT_NATIVE_IS_SHARPE", "holdout_used": False})
    config = gateway.build_optimization_config(config_fields=dict(
        study_name="native-limit-oco-is", n_trials=trials, seed=seed,
        directions=("maximize",), duplicate_policy="allow", exception_policy="fail_trial",
        **({"early_stopping_rounds":early_stopping} if early_stopping is not None else {})))
    optimizer = OptunaOptimizer(evaluator=evaluator, config=config)
    result = optimizer.optimize(param_ranges=DELTA_RSI_SPECIFICATION.parameter_space,
                                initial_trials=[dict(baseline)],candidate_selector=CandidateSelector(mode='robust_plateau'))
    if not result.selected_params or not 1 <= len(result.trials) <= trials or early_stopping is None and len(result.trials) != trials:
        raise ValueError("native engine did not publish the requested complete trial population/selection")
    return result
