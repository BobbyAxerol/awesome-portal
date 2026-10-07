"""Minimal valid imported alpha: SMA crossover with a volatility gate (illustrative template)."""

ALPHA_CONTRACT = {
    "schema_version": "research.alpha-source.v1",
    "version": "1.0.0",
    "entrypoint": "generate_signals",
    "timeframes": ["1h", "4h", "1d"],
    "required_columns": ["close"],
    "warmup_bars": 96,
    "determinism": {"seed_required": False},
    "parameter_space": {
        "fast": {"kind": "int_range", "low": 5, "high": 20, "step": 1},
        "slow": {"kind": "int_range", "low": 24, "high": 80, "step": 2},
        "gate": {"kind": "float_range", "low": 0.002, "high": 0.02, "step": 0.002},
        "notional": {"kind": "fixed", "value": 1000},
    },
}


class Indicators:
    @staticmethod
    def sma(values, length):
        return sum(values[-length:]) / length

    @staticmethod
    def mean_abs_return(values, length):
        window = values[-(length + 1):]
        total = 0.0
        for index in range(1, len(window)):
            total = total + abs(window[index] / window[index - 1] - 1.0)
        return total / length


def generate_signals(context):
    close = context["history"]["close"]
    parameters = context["parameters"]
    fast = int(parameters["fast"])
    slow = int(parameters["slow"])
    gate = float(parameters["gate"])
    notional = float(parameters["notional"])
    known = close[:-1]
    target = 0.0
    if fast < slow and len(known) > slow:
        if Indicators.mean_abs_return(known, slow) >= gate:
            if Indicators.sma(known, fast) > Indicators.sma(known, slow):
                target = notional
            else:
                target = -notional
    return {"schema_version": "research.imported-signal-notional-output.v1", "signal_notional": target}
