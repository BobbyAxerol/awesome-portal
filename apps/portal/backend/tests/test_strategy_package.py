"""Strategy package tests (Phase P1, B4).

Covers the plan §6 contract: side-effect-free import, golden parity for the
clean surface, the walk-forward signal contract, the Numba warm-up hook and
the registry. The protected kernel ``strategy.main`` is never edited here.
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd
import pytest

from golden_fixture import (
    GOLDEN_PARAMS,
    compare_to_golden,
    load_golden,
)
from strategy import (
    DELTA_RSI_SPECIFICATION,
    StrategySpecification,
    get_generators,
    get_specification,
    list_specifications,
)
from strategy.delta_rsi import (
    StrategyDataError,
    StrategyParameterError,
    build_walkforward_signal,
    generate_signals,
    warm_up,
)
from strategy.registry import StrategyGenerators


def test_package_import_has_no_side_effects() -> None:
    sys.modules.pop("strategy.main", None)
    sys.modules.pop("strategy.delta_rsi", None)
    sys.modules.pop("strategy.registry", None)
    import strategy  # noqa: F401
    import strategy.delta_rsi  # noqa: F401
    import strategy.registry  # noqa: F401
    import strategy.specification  # noqa: F401

    assert "strategy.main" not in sys.modules


def test_generate_signals_matches_golden() -> None:
    diffs = compare_to_golden(generate_signals)
    assert diffs == [], f"clean strategy surface must pass golden parity: {diffs}"


def test_adapter_and_package_spec_are_single_source() -> None:
    from portal_api.strategies import StrategyRegistry

    adapter_spec = StrategyRegistry().get("delta-rsi-polynomial-alpha").specification
    assert adapter_spec is DELTA_RSI_SPECIFICATION
    assert isinstance(DELTA_RSI_SPECIFICATION, StrategySpecification)
    assert DELTA_RSI_SPECIFICATION.strategy_id == "delta-rsi-polynomial-alpha"
    assert set(DELTA_RSI_SPECIFICATION.parameter_space) == set(GOLDEN_PARAMS)


def test_missing_params_fail_clearly() -> None:
    market, _, _ = load_golden()
    incomplete = dict(GOLDEN_PARAMS)
    del incomplete["slpercent"]
    with pytest.raises(StrategyParameterError) as exc:
        generate_signals(market, incomplete)
    assert "slpercent" in str(exc.value)


def test_missing_ohlcv_columns_fail_clearly() -> None:
    market, _, _ = load_golden()
    with pytest.raises(StrategyDataError) as exc:
        generate_signals(market.drop(columns=["volume"]), GOLDEN_PARAMS)
    assert "volume" in str(exc.value)


def test_input_frame_is_never_mutated() -> None:
    market, _, _ = load_golden()
    original = market.copy(deep=True)
    generate_signals(market, GOLDEN_PARAMS)
    pd.testing.assert_frame_equal(market, original)


def test_build_walkforward_signal_contract() -> None:
    market, _, _ = load_golden()
    test_index = market.index[300:400]
    signal = build_walkforward_signal(
        market, GOLDEN_PARAMS, market.index[:300], test_index, fold=0
    )
    assert signal.index.equals(test_index)
    assert signal.dtype == np.float64
    assert (signal == 0.0).any() or len(signal) > 0


def test_build_walkforward_signal_empty_test_index() -> None:
    market, _, _ = load_golden()
    empty = market.index[:0]
    signal = build_walkforward_signal(market, GOLDEN_PARAMS, market.index, empty, fold=0)
    assert signal.empty
    assert signal.name == "pos_weight"


def test_warm_up_is_idempotent_and_preserves_golden() -> None:
    warm_up(GOLDEN_PARAMS)
    warm_up(GOLDEN_PARAMS)
    diffs = compare_to_golden(generate_signals)
    assert diffs == []


def test_registry_lists_and_resolves_delta_rsi() -> None:
    specs = list_specifications()
    assert [spec.strategy_id for spec in specs] == ["delta-rsi-polynomial-alpha"]
    assert get_specification("delta-rsi-polynomial-alpha") is DELTA_RSI_SPECIFICATION
    generators = get_generators("delta-rsi-polynomial-alpha")
    assert isinstance(generators, StrategyGenerators)
    with pytest.raises(KeyError):
        get_specification("no-such-strategy")
    with pytest.raises(KeyError):
        get_generators("no-such-strategy")
