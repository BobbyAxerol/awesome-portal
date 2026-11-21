"""Canonical Portal Delta-RSI reference alpha, version 1.0.0.

Purpose map for researchers:
  1. ALPHA_CONTRACT: immutable declaration and the eight calibrated bounds.
  2. DeltaRsiParameters: read the run's admitted parameter pins.
  3. DeltaRsiIndicators: Wilder RSI, quadratic derivative, EMA, ATR and volume.
  4. DeltaRsiPolicy: causal long/short decisions and a hard-stop state machine.
  5. generate_signals: the only Portal entrypoint and exact output envelope.

This educational reference uses only the past-only bounded history supplied by
the imported signal_notional profile. It restarts indicator/position state at
that history's first bar; it is NOT byte/parity-identical to the protected
full-history Delta-RSI kernel. It emits a fixed 1000-unit target notional.
QuantBT, not this alpha, owns fills, fees, funding, accounting and metrics.
No imports, external IO, randomness, engine calls or performance claims.
"""

# 1. DECLARATION — mirror the current Delta-RSI calibration surface.
ALPHA_CONTRACT = {
    "schema_version": "research.alpha-source.v1",
    "version": "1.0.0",
    "entrypoint": "generate_signals",
    "timeframes": ["1h", "4h", "1d"],
    "required_columns": ["open", "high", "low", "close", "volume"],
    "warmup_bars": 256,
    "determinism": {"seed_required": True},
    "version_note": "Canonical Delta-RSI bounded-history reference; not protected-kernel parity. Fixed 1000-unit target notional; no optimizer or PnL inside the alpha.",
    "parameter_space": {
        "window": {"kind": "int_range", "low": 20, "high": 60, "step": 2},
        "rsi_l": {"kind": "int_range", "low": 12, "high": 30, "step": 1},
        "signalLength": {"kind": "int_range", "low": 3, "high": 20, "step": 1},
        "len_atr1": {"kind": "int_range", "low": 5, "high": 20, "step": 1},
        "len_atr2": {"kind": "int_range", "low": 25, "high": 60, "step": 1},
        "rvol": {"kind": "float_range", "low": 1.0, "high": 2.5, "step": 0.1},
        "len_vol": {"kind": "int_range", "low": 8, "high": 40, "step": 2},
        "slpercent": {"kind": "float_range", "low": 0.7, "high": 2.5, "step": 0.1},
    },
}


# 2. PARAMETERS — no silent defaults: absent pins fail, never change the run.
class DeltaRsiParameters:
    """Run-owned scalar pins; fees, windows and dataset belong to New Run."""

    @staticmethod
    def read(parameters):
        return {
            "window": int(parameters["window"]),
            "rsi_l": int(parameters["rsi_l"]),
            "signalLength": int(parameters["signalLength"]),
            "len_atr1": int(parameters["len_atr1"]),
            "len_atr2": int(parameters["len_atr2"]),
            "rvol": float(parameters["rvol"]),
            "len_vol": int(parameters["len_vol"]),
            "slpercent": float(parameters["slpercent"]),
        }


# 3. INDICATORS — causal arithmetic only; never read beyond the current bar.
class DeltaRsiIndicators:
    """Stateless numerical helpers; each returns one bounded series."""

    @staticmethod
    def ema(values, length):
        output = [0.0] * len(values)
        output[0] = values[0]
        alpha = 2.0 / (length + 1)
        for index in range(1, len(values)):
            output[index] = alpha * values[index] + (1.0 - alpha) * output[index - 1]
        return output

    @staticmethod
    def sma(values, length):
        output = [0.0] * len(values)
        if len(values) < length:
            return output
        running_sum = sum(values[:length])
        output[length - 1] = running_sum / length
        for index in range(length, len(values)):
            running_sum = running_sum - values[index - length] + values[index]
            output[index] = running_sum / length
        return output

    @staticmethod
    def atr(high, low, close, length):
        ranges = [0.0] * len(close)
        ranges[0] = high[0] - low[0]
        for index in range(1, len(close)):
            ranges[index] = max(high[index] - low[index], abs(high[index] - close[index - 1]), abs(low[index] - close[index - 1]))
        return DeltaRsiIndicators.ema(ranges, length)

    @staticmethod
    def rsi(close, length):
        output = [0.0] * len(close)
        if len(close) <= length:
            return output
        gain = sum(max(close[index] - close[index - 1], 0.0) for index in range(1, length + 1)) / length
        loss = sum(max(close[index - 1] - close[index], 0.0) for index in range(1, length + 1)) / length
        output[length] = 100.0 - 100.0 / (1.0 + gain / loss) if loss > 0.0 else (100.0 if gain > 0.0 else 50.0)
        for index in range(length + 1, len(close)):
            change = close[index] - close[index - 1]
            gain = ((length - 1) * gain + max(change, 0.0)) / length
            loss = ((length - 1) * loss + max(-change, 0.0)) / length
            output[index] = 100.0 - 100.0 / (1.0 + gain / loss) if loss > 0.0 else (100.0 if gain > 0.0 else 50.0)
        return output

    @staticmethod
    def quadratic_derivative(values, window):
        """Fit degree two on the trailing window; differentiate at its end."""
        output = [0.0] * len(values)
        center = (window - 1) / 2.0
        second_moment = sum((index - center) ** 2 for index in range(window))
        fourth_moment = sum((index - center) ** 4 for index in range(window))
        curvature_denominator = fourth_moment - second_moment * second_moment / window
        if len(values) < window:
            return output
        # Sliding polynomial moments avoid re-fitting every trailing window.
        level_sum = sum(values[index] for index in range(window))
        first_sum = sum(index * values[index] for index in range(window))
        second_sum = sum(index * index * values[index] for index in range(window))
        for end in range(window - 1, len(values)):
            if end >= window:
                remaining_level = level_sum - values[end - window]
                old_first = first_sum
                second_sum = second_sum - 2.0 * old_first + remaining_level + (window - 1) ** 2 * values[end]
                first_sum = old_first - remaining_level + (window - 1) * values[end]
                level_sum = remaining_level + values[end]
            slope = (first_sum - center * level_sum) / second_moment
            centered_second = second_sum - 2.0 * center * first_sum + center * center * level_sum
            curvature = (centered_second - second_moment * level_sum / window) / curvature_denominator
            output[end] = slope + 2.0 * center * curvature
        return output


# 4. POLICY — previous-bar exposure, filtered entry/exit and hard stop.
class DeltaRsiPolicy:
    """Recompute local state, without hidden state shared between evaluations."""

    @staticmethod
    def target_weight(close, high, low, volume, parameters):
        rsi = DeltaRsiIndicators.rsi(close, parameters["rsi_l"])
        delta = DeltaRsiIndicators.quadratic_derivative(rsi, parameters["window"])
        signal_line = DeltaRsiIndicators.ema(delta, parameters["signalLength"])
        fast_atr = DeltaRsiIndicators.atr(high, low, close, parameters["len_atr1"])
        slow_atr = DeltaRsiIndicators.atr(high, low, close, parameters["len_atr2"])
        average_volume = DeltaRsiIndicators.sma(volume, parameters["len_vol"])
        start = max(parameters["rsi_l"], parameters["window"], parameters["len_vol"], parameters["len_atr2"]) + 10
        target = 0.0
        previous_target = 0.0
        stop = 0.0
        stop_fraction = parameters["slpercent"] / 100.0
        for index in range(2, len(close)):
            previous_target = target
            exited = False
            if (target == 1.0 and low[index] <= stop) or (target == -1.0 and high[index] >= stop):
                target = 0.0
                exited = True
            turning_up = delta[index] > delta[index - 1] and delta[index - 1] < delta[index - 2] and delta[index - 1] < 0.0
            turning_down = delta[index] < delta[index - 1] and delta[index - 1] > delta[index - 2] and delta[index - 1] > 0.0
            crossing_up = delta[index] > signal_line[index] and delta[index - 1] <= signal_line[index - 1]
            filters_pass = fast_atr[index] > slow_atr[index] and volume[index] > parameters["rvol"] * average_volume[index]
            if not exited and filters_pass and ((target == 1.0 and turning_down) or (target == -1.0 and turning_up)):
                target = 0.0
                exited = True
            if target == 0.0 and not exited and index >= start and filters_pass:
                if crossing_up:
                    target = 1.0
                    stop = close[index] * (1.0 - stop_fraction)
                elif turning_down:
                    target = -1.0
                    stop = close[index] * (1.0 + stop_fraction)
        return previous_target


# 5. PORTAL ENTRYPOINT — one past-only input, one typed notional output.
def generate_signals(context):
    """The worker supplies history, admitted pins and the run's fixed seed."""
    history = context["history"]
    parameters = DeltaRsiParameters.read(context["parameters"])
    weight = DeltaRsiPolicy.target_weight(history["close"], history["high"], history["low"], history["volume"], parameters)
    return {
        "schema_version": "research.imported-signal-notional-output.v1",
        "signal_notional": 1000.0 * weight,
    }
