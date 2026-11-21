"""Patience/custody regression, not a product qualification receipt."""
from dataclasses import replace
import pytest
from portal_api.domain.research_early_stopping import admitted_early_stopping, validate_study_trial_count
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from test_research_full03_child import full03_request, bind_full03_work, _receipt
from portal_api.workers import research_child
from types import SimpleNamespace
from portal_api.services.research_progress import ResearchProgressJournal
from portal_api.workers.durable_worker import DurableQuantWorker
from test_research_progress_w2 import _to_study


@pytest.mark.parametrize("patience", [None,200,267,300])
def test_expanded_three_window_does_not_reapply_obsolete_three_trial_cap(patience):
    doc=full03_request("p10.delta-pct-equity-three-window-optimized-1h.v2")
    spec=doc["research"]["requested_spec"]
    spec.update(execution_route="pct_equity", optuna_trials=400, early_stopping=patience)
    bind_full03_work(doc)
    assert ResearchRunProducerRequest.model_validate(doc).research.requested_spec["optuna_trials"] == 400


@pytest.mark.parametrize("patience", [None,1,200,267,300,400])
def test_optional_positive_patience(patience):
    assert admitted_early_stopping({"early_stopping":patience,"optuna_trials":400}) == patience


@pytest.mark.parametrize("patience", [0,-1,401,True,1.5,"200"])
def test_invalid_patience_refused(patience):
    with pytest.raises(ValueError):
        admitted_early_stopping({"early_stopping":patience,"optuna_trials":400})


@pytest.mark.parametrize("method", ["wfo-temporal","causal-inner","per-fold-decay","three-window-optimized"])
def test_producer_binds_actual_patience_and_old_null_receipt_stays_unchanged(tmp_path,method):
    doc=full03_request(f"p10.delta-{method}-4h.v1")
    doc["research"]["requested_spec"]["early_stopping"]=2
    bind_full03_work(doc)
    parsed=ResearchRunProducerRequest.model_validate(doc)
    assert parsed.research.requested_spec["early_stopping"] == 2
    receipt=_receipt(tmp_path,method=method)
    old=receipt.as_payload(output_root=tmp_path/"output")
    assert "early_stopping" not in old
    new=replace(receipt,early_stopping=2).as_payload(output_root=tmp_path/"output")
    assert new.pop("early_stopping") == 2
    assert new == old


def test_actual_trials_remain_bounded_and_exact_without_patience():
    validate_study_trial_count(2,400,200)
    validate_study_trial_count(400,400,None)
    for actual,patience in [(0,200),(401,200),(399,None)]:
        with pytest.raises(ValueError): validate_study_trial_count(actual,400,patience)


@pytest.mark.parametrize("method", ["wfo-temporal","causal-inner","per-fold-decay"])
def test_full03_dispatch_accepts_and_forwards_actual_optional_patience(tmp_path,method,monkeypatch):
    receipt=replace(_receipt(tmp_path,method),early_stopping=2)
    seen=[]
    monkeypatch.setattr(research_child,"_run_delta_wfo_study",lambda payload,*args,**kwargs: seen.append(payload) or {})
    research_child._run_p10_delta_wfo(receipt.as_payload(output_root=tmp_path/"output"),tmp_path/"output")
    assert seen[0]["early_stopping"] == 2


def test_terminal_progress_keeps_independently_stopped_study_counts(tmp_path):
    trials=tuple({"study_id":str(study),"source_trial_id":str(local),"trial_id":f"study_{study}.trial_{local}",
        "state":"COMPLETE","objective":"1"} for study,count in enumerate([2,3]) for local in range(count))
    result=SimpleNamespace(trial_states=("COMPLETE",)*5,table_rows={"FOLD":2},causal_trials=trials,
        causal_fold_selections=tuple({"study_id":str(study),"selected_trial_id":f"study_{study}.trial_1",
            "parameters":{"window":"34"},"objective":"1"} for study in range(2)))
    def journal(name):
        j=ResearchProgressJournal(tmp_path/name,run_id="run_stopping_unit",attempt_id="ra_stopping_unit",
            lease_epoch=1,planned_trials=6,profile="DELTA_WFO")
        _to_study(j)
        return j
    with pytest.raises(ValueError,match="per-fold study counts"):
        DurableQuantWorker._emit_retained_wfo_progress(journal("null"),result,
            requested_spec={"optuna_trials":3,"early_stopping":None})
    j=journal("on")
    cursor=DurableQuantWorker._emit_retained_wfo_progress(j,result,
        requested_spec={"optuna_trials":3,"early_stopping":1})
    assert j.snapshot()["overall"]["trials_done"] == 5
    assert cursor["fold"] == 2 and cursor["trial"] == 4
