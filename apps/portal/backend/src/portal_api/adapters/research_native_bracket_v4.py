"""Versioned correction: dimensionless intent weight x declared fixed notional.

The V3 adapter bytes stay untouched for queued/historical native profiles.
No Portal matcher/PnL; the pinned public engine simulates the intent unchanged.
"""
import numpy as np
import pandas as pd
from .research_native_routes import NATIVE_ACCOUNT, NOTIONAL, validate_native_market
from .quantbt import QuantBTGateway


def run_native_delta(*, route, market, symbol, parameters, gateway=None):
    if route != "intrabar_bracket":
        raise ValueError("V4 is only the versioned intrabar bracket adapter")
    validate_native_market(market, symbol=symbol)
    from strategy.delta_rsi import generate_signals
    from quantbt.core.execution_contract import ExecutionContract
    from quantbt.core.intrabar_reference import IntrabarIntentTape
    signal = generate_signals(market, parameters)["pos_weight"].reindex(market.index)
    if signal.isna().any() or not np.isfinite(signal.to_numpy(dtype=float)).all():
        raise ValueError("protected Alpha signal must be finite and causal")
    side = np.sign(signal.to_numpy(dtype=float)).astype(np.int8)
    changed = side != np.r_[0, side[:-1]]
    intent = IntrabarIntentTape.from_arrays(entry_side=np.where(changed, side, 0),
        entry_size=np.ones(len(side), dtype=float),
        stop_value=np.full(len(side), float(parameters["slpercent"]) / 100),
        take_profit_value=np.full(len(side), float(parameters["slpercent"]) * 2 / 100),
        technical_exit=changed & (side == 0))
    endpoint = (gateway or QuantBTGateway()).route_endpoint(route, **NATIVE_ACCOUNT,
        intrabar_sizing_mode="fixed_notional", metadata={"fixed_notional": NOTIONAL}, report_level="audit",
        execution_contract=ExecutionContract.intrabar_bracket())
    return endpoint.simulate(data=market, intent=intent, symbols=[symbol])


def native_result_facts(*, route, result):
    from .research_native_routes import native_result_facts as legacy_facts
    facts = legacy_facts(route=route, result=result)
    fills = result.metadata.get("fills_report")
    facts["fills_count"] = len(result.fills) if result.fills else len(fills) if isinstance(fills, pd.DataFrame) else 0
    return facts
