"""Native adapter protocol tests; synthetic tape is NOT product qualification."""
from types import SimpleNamespace
import numpy as np
import pandas as pd
import pytest

from portal_api.adapters.research_native_routes import run_native_delta, native_result_facts, validate_native_market
from portal_api.adapters.research_native_routes import _commands

PARAMS = dict(window=32, rsi_l=20, signalLength=9, len_atr1=10, len_atr2=42,
              rvol=1.6, len_vol=16, slpercent=1.3)


def tape():
    close = 100 + 4 * np.sin(np.arange(450) / 8) + np.arange(450) * 0.005
    return pd.DataFrame(dict(open=close, high=close + 1, low=close - 1,
                            close=close, volume=np.full(len(close), 1000.)),
                        index=pd.date_range('2026-06-01', periods=len(close), freq='1h', tz='UTC'))


@pytest.mark.parametrize('route', ['intrabar_bracket', 'reactive', 'event_driven'])
def test_pinned_native_route_runs_its_own_real_engine_accounting(route):
    result = run_native_delta(route=route, market=tape(), symbol='BTCUSDT', parameters=PARAMS)
    assert result.equity.index.equals(tape().index)
    assert np.isfinite(result.equity.to_numpy()).all()
    facts = native_result_facts(route=route, result=result)
    assert facts['position_unit'] == 'CONTRACT_QUANTITY'
    assert facts['clock'] == ('KNOWN_CLOSE_NEXT_BAR_INTRABAR' if route == 'intrabar_bracket'
                              else 'KNOWN_CLOSE_NEXT_BAR_CLOSE')
    assert facts['fees']['state'] == 'AVAILABLE'


def test_native_input_never_repairs_or_accepts_other_routes():
    market = tape(); market.iloc[0, market.columns.get_loc('high')] = 1
    with pytest.raises(ValueError, match='invalid source'):
        validate_native_market(market, symbol='BTCUSDT')
    with pytest.raises(ValueError, match='owner-approved'):
        run_native_delta(route='options', market=tape(), symbol='BTCUSDT', parameters=PARAMS)


def test_native_missing_fees_funding_never_become_zero():
    result = SimpleNamespace(equity=pd.Series([100,101]), fills=(), orders=())
    facts = native_result_facts(route='reactive', result=result)
    assert facts['fees'] == {'state': 'NOT_PUBLISHED', 'total': None,
                             'reason_code': 'NATIVE_RESULT_SERIES_NOT_PUBLISHED'}
    assert facts['funding']['total'] is None


def test_order_eligibility_is_not_the_endpoint_execution_clock():
    from quantbt.core.orders import OrderActivationPolicy
    commands = _commands(timestamp=tape().index[10], symbol='BTCUSDT',
                         target=2, current=0, ordinal=10)
    assert len(commands) == 1
    assert commands[0].activation_policy is OrderActivationPolicy.IMMEDIATE


@pytest.mark.parametrize('route', ['reactive', 'event_driven'])
def test_native_nonempty_decision_tape_uses_pinned_command_protocol(route, monkeypatch):
    import strategy.delta_rsi
    market = tape()
    weights = np.zeros(len(market))
    weights[310:350] = 1
    weights[360:400] = -1
    monkeypatch.setattr(strategy.delta_rsi, 'generate_signals',
                        lambda data, _params: pd.DataFrame({'pos_weight': weights}, index=data.index))
    result = run_native_delta(route=route, market=market, symbol='BTCUSDT', parameters=PARAMS)
    assert len(result.fills) > 0, 'An empty synthetic decision tape cannot test OrderCommand validation.'
    assert pd.Timestamp(result.fills[0].timestamp) > market.index[310], 'The execution contract must activate after the known signal bar.'
    assert native_result_facts(route=route, result=result)['clock'] == 'KNOWN_CLOSE_NEXT_BAR_CLOSE'
