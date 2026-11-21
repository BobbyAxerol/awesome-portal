"""Canonical reference and restricted class/function definition regressions."""

from __future__ import annotations

import math
from pathlib import Path

import pytest

from portal_api.services.research_alpha_definition import (
    load_research_alpha_definition,
    validate_research_alpha_definition,
)


SOURCE_PATH = Path(__file__).parents[4] / "apps/portal/frontend/src/research/samples/deltaRsiReference.py"
CANONICAL_SOURCE = SOURCE_PATH.read_text(encoding="utf-8")
PARAMETERS = {
    "window": 32, "rsi_l": 20, "signalLength": 9, "len_atr1": 10,
    "len_atr2": 42, "rvol": 1.6, "len_vol": 16, "slpercent": 1.3,
}
SIMPLE_SOURCE = '''ALPHA_CONTRACT = {
    "schema_version": "research.alpha-source.v1", "entrypoint": "generate_signals"
}
class Numeric:
    @staticmethod
    def square(value):
        return value * value
def generate_signals(context):
    return Numeric.square(context["value"])
'''


def test_canonical_source_loads_definitions_without_executing_them() -> None:
    function, contract = load_research_alpha_definition(CANONICAL_SOURCE, expected_entrypoint="generate_signals")
    assert callable(function)
    assert contract["warmup_bars"] == 256
    assert list(contract["parameter_space"]) == list(PARAMETERS)
    assert contract["entrypoint"] == "generate_signals"
    assert function.__globals__["DeltaRsiParameters"].read(PARAMETERS) == PARAMETERS


def test_canonical_parser_and_actual_child_loader_accept_the_same_source() -> None:
    from portal_api.services.research_alpha_analyzer import analyze_alpha_source
    from portal_api.workers.research_child import _load_imported_entrypoint
    analysis = analyze_alpha_source(CANONICAL_SOURCE, "delta_rsi_reference.py")
    assert analysis.parse_ok
    assert analysis.gate_facts.contract_complete
    assert analysis.gate_facts.entrypoint_restricted_definition_load
    assert analysis.gate_facts.parameter_space_sane
    assert analysis.gate_facts.determinism_declared
    assert analysis.gate_facts.data_contract_known
    assert analysis.gate_facts.no_lookahead_static_scan
    function, contract = _load_imported_entrypoint(CANONICAL_SOURCE, expected_entrypoint="generate_signals")
    assert contract == analysis.declared_contract
    assert function(_context()) == function(_context())


def test_canonical_source_runs_through_the_real_pinned_imported_child(tmp_path, monkeypatch) -> None:
    import hashlib
    import json
    import os
    from test_research_imported_alpha_execution import _receipt
    from portal_api.workers.research_child import execute_receipt
    source = tmp_path / "alpha.py"
    data = CANONICAL_SOURCE.encode("utf-8")
    source.write_bytes(data)
    os.chmod(source, 0o600)
    monkeypatch.setenv("TMPDIR", str(tmp_path))
    receipt = _receipt(source, data)
    receipt.update(parameters=PARAMETERS, random_seed=42)
    result = execute_receipt(receipt)
    assert result["task"] == "P17_IMPORTED_SIGNAL_NOTIONAL"
    assert result["engine_version"] == "1.1.1"
    assert result["bars"] == 500
    assert result["source_digest"] == hashlib.sha256(data).hexdigest()
    assert math.isfinite(result["final_equity"])
    assert result["num_trades"] >= 0
    assert result["evidence_source"]["source"]["execution_adapter_id"] == receipt["execution_adapter_id"]
    print("CANONICAL_DELTA_RSI_REAL_CHILD " + json.dumps({key: result[key] for key in (
        "engine_version", "bars", "source_digest", "execution_profile_digest", "final_equity", "num_trades")}, sort_keys=True))


def test_canonical_indicators_match_the_quadratic_formula_and_causal_prefix() -> None:
    function, _ = load_research_alpha_definition(CANONICAL_SOURCE, expected_entrypoint="generate_signals")
    indicators = function.__globals__["DeltaRsiIndicators"]
    values = [2.0 + 3.0 * index + 0.5 * index * index for index in range(80)]
    derivative = indicators.quadratic_derivative(values, 32)
    for index in range(31, 80):
        assert derivative[index] == pytest.approx(3.0 + index, abs=1e-10)
    assert indicators.quadratic_derivative(values[:63], 32) == derivative[:63]
    assert indicators.rsi([7.0] * 40, 20)[20:] == [50.0] * 20
    assert indicators.rsi([float(index) for index in range(40)], 20)[20] == 100.0


def _context(size: int = 257) -> dict[str, object]:
    close = [100.0 + 0.08 * index + 4.0 * math.sin(index / 8.0) for index in range(size)]
    return {
        "history": {
            "open": tuple(close), "close": tuple(close),
            "high": tuple(value + 0.8 for value in close),
            "low": tuple(value - 0.8 for value in close),
            "volume": tuple(3000.0 if index % 9 == 0 else 1000.0 for index in range(size)),
        },
        "parameters": dict(PARAMETERS), "random_seed": 42,
    }


def test_canonical_output_is_deterministic_exact_and_does_not_mutate_context() -> None:
    function, _ = load_research_alpha_definition(CANONICAL_SOURCE, expected_entrypoint="generate_signals")
    context = _context()
    before = repr(context)
    first = function(context)
    second = function(context)
    assert first == second
    assert set(first) == {"schema_version", "signal_notional"}
    assert first["schema_version"] == "research.imported-signal-notional-output.v1"
    assert first["signal_notional"] in {-1000.0, 0.0, 1000.0}
    assert math.isfinite(first["signal_notional"])
    assert repr(context) == before


def test_definition_loader_preserves_legacy_plain_function_shape() -> None:
    source = SIMPLE_SOURCE[:SIMPLE_SOURCE.index("class Numeric:")] + 'def generate_signals(context):\n    return abs(context["value"])\n'
    function, _ = load_research_alpha_definition(source, expected_entrypoint="generate_signals")
    assert function({"value": -7}) == 7


def test_module_helpers_are_allowed_only_as_known_acyclic_functions() -> None:
    source = SIMPLE_SOURCE.replace("class Numeric:", "def twice(value):\n    return value * 2\nclass Numeric:").replace("return Numeric.square(context[\"value\"])", "return twice(Numeric.square(context[\"value\"]))")
    function, _ = load_research_alpha_definition(source, expected_entrypoint="generate_signals")
    assert function({"value": 3}) == 18


@pytest.mark.parametrize("mutation", [
    lambda source: "import os\n" + source,
    lambda source: source.replace("class Numeric:", "class Numeric(object):"),
    lambda source: source.replace("class Numeric:", "class Numeric(metaclass=type):"),
    lambda source: source.replace("class Numeric:", "class Numeric:\n    value = 1"),
    lambda source: source.replace("@staticmethod", "@property"),
    lambda source: source.replace("@staticmethod\n", ""),
    lambda source: source.replace("def square(value):", "def square(value=1):"),
    lambda source: source.replace("def square(value):", "def square(value: int):"),
    lambda source: source.replace("return value * value", "return open('/etc/passwd')"),
    lambda source: source.replace("return value * value", "return getattr(value, 'real')"),
    lambda source: source.replace("return value * value", "return value.__class__"),
    lambda source: source.replace("return value * value", "return context.get('value')"),
    lambda source: source.replace("return value * value", "return Numeric.square(value)"),
    lambda source: source.replace("return value * value", "return generate_signals(value)"),
    lambda source: source.replace("return value * value", "abs = value\n        return abs"),
    lambda source: source.replace("def square(value):", "def square(abs):"),
    lambda source: source.replace("return value * value", "def nested():\n            return value\n        return nested()"),
    lambda source: source.replace("return value * value", "return Numeric()"),
    lambda source: source.replace("return value * value", "return Numeric.square"),
    lambda source: source.replace("return value * value", "return __build_class__"),
    lambda source: source.replace("return value * value", "return eval(value)"),
    lambda source: source.replace("return value * value", "return (lambda: value)()"),
    lambda source: source.replace("return value * value", "return sum(*value)"),
    lambda source: source.replace("return value * value", "return round(value, ndigits=2)"),
    lambda source: source + "\nNumeric.square(7)\n",
    lambda source: source.replace("return value * value", "return [abs for abs in value]"),
    lambda source: source.replace("return value * value", "ALPHA_CONTRACT['entrypoint'] = 'changed'\n        return value"),
    lambda source: source.replace("return value * value", "alias = ALPHA_CONTRACT\n        return alias"),
])
def test_definition_loader_rejects_ambient_authority_and_symbol_shadowing(mutation) -> None:
    with pytest.raises(ValueError, match="definition rejected"):
        load_research_alpha_definition(mutation(SIMPLE_SOURCE), expected_entrypoint="generate_signals")


def test_mismatched_entrypoint_is_refused() -> None:
    with pytest.raises(ValueError, match="entrypoint must match"):
        validate_research_alpha_definition(CANONICAL_SOURCE, expected_entrypoint="other")


def test_definition_count_and_ast_bounds_are_enforced() -> None:
    prefix = SIMPLE_SOURCE[:SIMPLE_SOURCE.index("class Numeric:")]
    classes = "".join(f"class Helper{index}:\n    @staticmethod\n    def method(value):\n        return value\n" for index in range(5))
    with pytest.raises(ValueError, match="definition count"):
        validate_research_alpha_definition(prefix + classes + "def generate_signals(context):\n    return 0\n", expected_entrypoint="generate_signals")
    with pytest.raises(ValueError, match="AST exceeds"):
        validate_research_alpha_definition(SIMPLE_SOURCE.replace("return value * value", "return [" + ",".join("1" for _ in range(21000)) + "]"), expected_entrypoint="generate_signals")
