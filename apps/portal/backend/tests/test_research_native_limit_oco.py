"""Input causality and real pinned matcher tests, not product receipts."""
import numpy as np
import pandas as pd
import pytest
from portal_api.adapters.research_native_limit_oco_v1 import build_commands, run_native_delta
from test_research_native_routes import tape, PARAMS


def test_limit_oco_uses_known_close_and_parent_bound_exits():
    market = tape()
    signal = pd.Series(np.ones(len(market)), index=market.index)
    commands = build_commands(market=market, signals=signal, symbol='BTCUSDT', stop_fraction=.013)
    parent, stop, take = commands
    assert parent.timestamp == market.index[301]
    assert parent.price == market.close.iloc[300]
    assert stop.parent_order_id == take.parent_order_id == parent.order_id
    assert stop.oco_group_id == take.oco_group_id
    assert stop.reduce_only and take.reduce_only
    assert stop.trigger_price == parent.price * .987
    assert take.price == parent.price * 1.026
    assert parent.metadata['decision_at_utc_ms'] == market.index[300].value // 1_000_000


def test_limit_oco_does_not_invent_flat_decisions_or_accept_unbounded_prices():
    market = tape()
    flat = pd.Series(np.zeros(len(market)), index=market.index)
    commands = build_commands(market=market, signals=flat, symbol='BTCUSDT', stop_fraction=.013)
    assert len(commands) == 1 and commands[0].action == 'cancel_all'
    for distance in [0, -.1, .5, float('nan')]:
        with pytest.raises(ValueError):
            build_commands(market=market, signals=flat, symbol='BTCUSDT', stop_fraction=distance)


def test_limit_oco_runs_pinned_engine_with_positive_cancel_journal(monkeypatch):
    import strategy.delta_rsi
    market = tape()
    weights = np.zeros(len(market)); weights[300:] = 1
    monkeypatch.setattr(strategy.delta_rsi, 'generate_signals',
        lambda data, params: pd.DataFrame({'pos_weight': weights}, index=data.index))
    result = run_native_delta(route='event_driven', market=market, symbol='BTCUSDT', parameters=PARAMS)
    assert len(result.fills) == 2
    journal = result.metadata['lifecycle_event_report_v1']
    assert not journal.empty
    assert {'place', 'activate', 'fill', 'cancel'} <= set(journal['event_name'])
    canceled = journal[journal.event_name == 'cancel'].iloc[0]
    filled_exit = journal[(journal.event_name == 'fill') & journal.order_id.str.endswith(('-sl', '-tp'))].iloc[0]
    assert canceled.oco_group_id == filled_exit.oco_group_id
    assert canceled.order_id != filled_exit.order_id
    assert canceled.related_sorted_index == filled_exit.sorted_index
