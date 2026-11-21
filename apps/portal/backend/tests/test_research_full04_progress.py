"""Retained centroid custody is not an invented Optuna cursor; predicate only."""
from types import SimpleNamespace
import pytest
from portal_api.workers.durable_worker import DurableQuantWorker, DurableRunError

def test_centroid_completes_real_folds_without_faking_trial_selection():
    events = []
    journal = SimpleNamespace(snapshot=lambda: {"overall": {"trials_done": 5}},
                              emit=lambda kind, body: events.append((kind, body)))
    retention = SimpleNamespace(trial_states=("COMPLETE",)*5, causal_fold_selections=(),
        table_rows={"FOLD": 2}, receipt=SimpleNamespace(summary={
            "selection": {"trial_id": None, "parameters": {"rvol": "1.5"}},
            "optimizer_disclosure": {"optimization_mode": "mode_3_flat_minima",
                                     "selection_target": {"kind": "SYNTHETIC_CENTROID"}}}))
    assert DurableQuantWorker._emit_retained_wfo_progress(journal, retention) is None
    assert events == [("fold_completed", {"fold": 1}), ("fold_completed", {"fold": 2}),
                      ("stage_completed", {"stage": "S4"})]
    retention.receipt.summary["optimizer_disclosure"]["optimization_mode"] = "mode_2_sbb"
    with pytest.raises(DurableRunError, match="numbered trial"):
        DurableQuantWorker._emit_retained_wfo_progress(journal, retention)
