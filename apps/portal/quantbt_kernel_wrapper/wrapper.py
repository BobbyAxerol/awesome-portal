# Legacy notebook reference only. QuantBT resolves exclusively from the PyPI
# dependency declared in backend/pyproject.toml; never add a local source path.
from quantbt import QuantBTEndpoint, validate_param_ranges, walkforward_support_matrix

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Inspect available WFO routes. This protocol uses only Mode 5 on the declared IS.
display(walkforward_support_matrix())

# The strategy wrapper owns hyhy defaults. Keep only genuinely tuneable keys in
# param_ranges above; no structural defaults need to be supplied through fixed.
CALIBRATION_PARAM_RANGES = dict(param_ranges)
validate_param_ranges(CALIBRATION_PARAM_RANGES)

# Canonical, non-overlapping boundaries. June has 30 days; use the latest
# available market bar for pseudo-live instead of an invalid fixed calendar date.
IS_START = pd.Timestamp("2020-01-01")
IS_END = pd.Timestamp("2023-12-31 23:59:59")
OOS_START = pd.Timestamp("2024-01-01")
OOS_END = pd.Timestamp("2025-06-30 23:59:59")
LIVE_START = pd.Timestamp("2025-07-01")
LIVE_END = pd.Timestamp(data_eth.index.max())

data_eth_train = data_eth.loc[(data_eth.index >= IS_START) & (data_eth.index <= IS_END)].copy()
data_eth_test = data_eth.loc[(data_eth.index >= OOS_START) & (data_eth.index <= OOS_END)].copy()
data_eth_holdout_live = data_eth.loc[(data_eth.index >= LIVE_START) & (data_eth.index <= LIVE_END)].copy()
data_eth_external = data_eth.loc[(data_eth.index >= OOS_START) & (data_eth.index <= LIVE_END)].copy()

assert not data_eth_train.empty, "IS data is empty"
assert not data_eth_test.empty, "External OOS data is empty"
assert not data_eth_holdout_live.empty, "Pseudo-live holdout data is empty"
assert data_eth_train.index.max() < data_eth_test.index.min()
assert data_eth_test.index.max() < data_eth_holdout_live.index.min()

display(
    pd.DataFrame(
        [
            ("development_is", data_eth_train.index.min(), data_eth_train.index.max(), len(data_eth_train)),
            ("external_oos", data_eth_test.index.min(), data_eth_test.index.max(), len(data_eth_test)),
            ("pseudo_live_holdout", data_eth_holdout_live.index.min(), data_eth_holdout_live.index.max(), len(data_eth_holdout_live)),
        ],
        columns=["segment", "start", "end", "bars"],
    )
)

# Keep execution/accounting constant across IS, OOS, and pseudo-live.
HOLDOUT_ACCOUNT_KWARGS = dict(
    initial_capital=20_000,
    leverage=1,
    maintenance_ratio=0.005,
    contract_size=1.0,
    use_funding=True,
    funding_rate=0.0001,
    alloc_per_trade=0.5,
    fee=0.0005,             # legacy compatibility convention used by this notebook baseline
    slippage=0.0001,
    use_pyramiding=False,
)

CALIBRATION_TRIALS = 400
CALIBRATION_EARLY_STOPPING = 200
CALIBRATION_SEED = 42



def gradient_holdout_strategy(data, params, train_index, test_index, fold):
    """Return the signal requested by the active fold-local scoring stage."""
    run_params = dict(params or {})

    # For IS scoring, test_index is the fold train index. For candidate OOS
    # scoring and final stitching, it is the fold test index. This cutoff keeps
    # the strategy tape causal at the active stage boundary.
    frame = data.loc[:test_index[-1]].copy()
    generated = generate_delta_rsi_signals(frame, run_params)
    return generated["pos_weight"].reindex(test_index).fillna(0.0).astype(float)

# Mode 1 with the Phase 49 schedule creates one independent Optuna study per
# quarterly fold. Trials rank on that fold's IS; only frozen top-IS candidates
# are evaluated on the same fold OOS and selected by the existing decay score.
# The external 2024+ OOS and pseudo-live segments are not passed to calibration.
MODE1_CONFIG = dict(
    decay_lambda=0.5,
    decay_gamma=0.5,
    top_is_fraction=0.10,
    candidate_selection_metric="robust_decay",
    scoring_backend="endpoint",
    scoring_trading_days=365,
    min_trades_per_year=100,
    trade_penalty_factor=0.5,
    use_numba=True,
)

def show_mode1_calibration_audit(endpoint, result):
    """Display fold-local selection provenance and return the latest params."""
    wf = result.metadata["walk_forward"]
    best = wf["best_trial"]
    selection_table = wf["fold_selection_table"]
    audit = pd.DataFrame(
        [
            {
                "calibration": "mode_1_decay_per_fold",
                "optimization_schedule": wf["optimization_schedule"],
                "candidate_selector": wf["candidate_selection_metric"],
                "validation_claim": wf["validation_claim"],
                "causality_claim": wf["causality_claim"],
                "internal_oos_used_for_selection": wf["oos_used_for_selection"],
                "external_oos_used_for_selection": False,
                "params_semantics": wf["params_semantics"],
                "is_start": data_eth_train.index.min(),
                "is_end": data_eth_train.index.max(),
                "n_folds": wf["n_folds"],
                "n_studies": wf["n_studies"],
                "trials_scope": wf["optuna_trials_scope"],
                "latest_selected_trial_id": best.get("trial_id"),
                "latest_selected_objective": best.get("objective"),
                "latest_is_sharpe": best.get("mean_is_sharpe"),
                "latest_oos_sharpe": best.get("mean_oos_sharpe"),
                "latest_decay": best.get("mean_decay"),
            }
        ]
    )
    display(audit)
    display(wf["fold_table"])
    display(selection_table)
    display(wf["params_by_fold"])
    display(best)
    if not wf["candidate_table"].empty:
        display(wf["candidate_table"].sort_values("objective", ascending=False).head(20))
    endpoint.show_metrics(scope="oos")
    return dict(best["params"])


# Fold-local Mode 1 calibration inside development IS only. The first two years
# provide history; quarterly OOS folds begin in 2022. CALIBRATION_TRIALS and
# early stopping apply independently to every fold, not to one global study.
mode1_calibration = QuantBTEndpoint.walk_forward(
    strategy_class=gradient_holdout_strategy,
    split_mode="walk_forward_2022",
    split_frequency="quarterly",
    window_mode="rolling",
    train_window="365D",
    target_mode="pct_equity",
    optimization_mode="mode_1_decay",
    optimization_schedule="per_fold_decay",
    fold_boundary_position_policy="carry",
    optimization_config=MODE1_CONFIG,
    optuna_trials=CALIBRATION_TRIALS,
    optuna_early_stopping=CALIBRATION_EARLY_STOPPING,
    random_seed=CALIBRATION_SEED,
    **HOLDOUT_ACCOUNT_KWARGS,
)

mode1_calibration_result = mode1_calibration.backtest(
    data=data_eth_train,
    param_ranges=CALIBRATION_PARAM_RANGES,
)

MODE1_LATEST_FOLD_PARAMS = show_mode1_calibration_audit(
    mode1_calibration,
    mode1_calibration_result,
)
MODE1_FROZEN_PARAMS = dict(MODE1_LATEST_FOLD_PARAMS)
display(MODE1_FROZEN_PARAMS)

# This chart is the one-pass stitched, selection-adjusted internal OOS account.
mode1_calibration_result.quick_plot(scope="oos")


def build_frozen_gradient_signal(full_history, evaluation_frame, frozen_params):
    # Build a causal signal with prior history retained for indicator warm-up.
    history = full_history.loc[:evaluation_frame.index[-1]].copy()
    run_params = dict(frozen_params)
    generated = generate_delta_rsi_signals(history, run_params)
    signal = generated["pos_weight"].reindex(evaluation_frame.index).fillna(0.0).astype(float)
    return signal, generated.reindex(evaluation_frame.index)

def plot_signal_entries_on_close(frame, signal, title, plot_start=None, plot_end=None):
    # Plot only the requested display window; signal and backtest inputs stay unchanged.
    close = frame["close"].reindex(signal.index).astype(float)
    side = np.sign(signal.astype(float))
    previous_side = side.shift(1, fill_value=0.0)

    long_entry = side.gt(0.0) & previous_side.le(0.0)
    short_entry = side.lt(0.0) & previous_side.ge(0.0)
    long_exit = previous_side.gt(0.0) & side.le(0.0)
    short_exit = previous_side.lt(0.0) & side.ge(0.0)

    window = pd.Series(True, index=close.index)
    if plot_start is not None:
        window &= close.index >= pd.Timestamp(plot_start)
    if plot_end is not None:
        window &= close.index <= pd.Timestamp(plot_end)
    if not window.any():
        raise ValueError("plot_start/plot_end select no bars from the supplied frame")

    close = close.loc[window]
    long_entry = long_entry.loc[window]
    short_entry = short_entry.loc[window]
    long_exit = long_exit.loc[window]
    short_exit = short_exit.loc[window]

    fig, ax = plt.subplots(figsize=(16, 6))
    ax.plot(close.index, close, color="blue", linewidth=1.0, label="Close")
    ax.scatter(close.index[long_entry], close[long_entry], marker="^", color="tab:green", s=34, label="Long entry", zorder=3)
    ax.scatter(close.index[short_entry], close[short_entry], marker="v", color="tab:red", s=34, label="Short entry", zorder=3)
    ax.scatter(close.index[long_exit], close[long_exit], marker="x", color="tab:green", s=24, label="Long exit", zorder=3)
    ax.scatter(close.index[short_exit], close[short_exit], marker="x", color="tab:red", s=24, label="Short exit", zorder=3)
    ax.set_title(title)
    ax.set_ylabel("Close")
    ax.grid(alpha=0.25)
    ax.legend(ncol=5, loc="upper left")
    plt.show()

def run_frozen_pct_equity_segment(
    label,
    full_history,
    evaluation_frame,
    frozen_params,
    plot_start=None,
    plot_end=None,
):
    # Run the full segment unchanged; date arguments apply only to the display plot.
    signal, signal_detail = build_frozen_gradient_signal(full_history, evaluation_frame, frozen_params)
    endpoint = QuantBTEndpoint.pct_equity(**HOLDOUT_ACCOUNT_KWARGS)
    result = endpoint.backtest(data=evaluation_frame, signal=signal)
    report = endpoint.show_metrics(trading_days=365)

    audit = {
        "label": label,
        "start": evaluation_frame.index.min(),
        "end": evaluation_frame.index.max(),
        "bars": len(evaluation_frame),
        "primary_calibration": PRIMARY_CALIBRATION,
        "calibration_is_end": IS_END,
        "degree_default": 2,
        "initial_capital": report["initial_capital"],
        "final_equity": report["final_equity"],
        "total_return_pct": report["total_return_pct"],
        "sharpe": report["sharpe"],
        "max_drawdown_pct": report["max_drawdown_pct"],
        "num_trades": report["num_trades"],
    }
    display(pd.DataFrame([audit]))
    plot_signal_entries_on_close(
        evaluation_frame,
        signal,
        f"{label}: frozen Mode 5 signal",
        plot_start=plot_start,
        plot_end=plot_end,
    )
    endpoint.quick_plot()
    return endpoint, result, signal, signal_detail, audit


# IS plot is descriptive only. Do not interpret it as validation.
signal_is, _ = build_frozen_gradient_signal(data_eth, data_eth_train, FROZEN_PARAMS)
plot_signal_entries_on_close(data_eth_train, signal_is, "Development IS: frozen Mode 5 signal", plot_start="2022-01-01", plot_end="2022-03-01")

# Independent fresh-account diagnostics. Both signals use past history only for
# indicator warm-up; each account starts from the configured initial capital.
oos_endpoint, oos_result, signal_oos, _, oos_audit = run_frozen_pct_equity_segment(
    "External OOS (2024-01-01 to 2025-06-30)",
    data_eth,
    data_eth_test,
    FROZEN_PARAMS,
)

live_endpoint, live_result, signal_live, _, live_audit = run_frozen_pct_equity_segment(
    "Pseudo-live holdout (2025-07-01 to latest bar)",
    data_eth,
    data_eth_holdout_live,
    FROZEN_PARAMS,
    plot_start="2025-08-01",
    plot_end="2025-09-01"
)

# Continuous deployment view: one account begins on 2024-01-01 and carries
# equity, funding, fees, and position transitions through the live boundary.
continuous_endpoint, continuous_result, signal_external, _, continuous_audit = run_frozen_pct_equity_segment(
    "Continuous external deployment (OOS + pseudo-live)",
    data_eth,
    data_eth_external,
    FROZEN_PARAMS,
)

manager_holdout_summary = pd.DataFrame([oos_audit, live_audit, continuous_audit])
display(manager_holdout_summary)

holdout_protocol = {
    "primary_calibration": PRIMARY_CALIBRATION,
    "optimization_schedule": "per_fold_decay",
    "candidate_selector": MODE1_CONFIG["candidate_selection_metric"],
    "is_window": (str(data_eth_train.index.min()), str(data_eth_train.index.max())),
    "external_oos_window": (str(data_eth_test.index.min()), str(data_eth_test.index.max())),
    "pseudo_live_window": (str(data_eth_holdout_live.index.min()), str(data_eth_holdout_live.index.max())),
    "frozen_params": FROZEN_PARAMS,
    "degree_default": 2,
    "params_semantics": "latest_completed_fold_selected_params",
    "internal_oos_used_for_selection": True,
    "selection_metadata": mode1_calibration_result.metadata["walk_forward"]["best_trial"].get("selection_metadata", {}),
    "external_oos_used_to_select_primary": False,
}
display(holdout_protocol)
