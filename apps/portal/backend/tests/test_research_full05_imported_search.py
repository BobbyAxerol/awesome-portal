"""Confined imported search negatives; unit tapes are NOT product qualification."""
from __future__ import annotations
import hashlib
from copy import deepcopy
from pathlib import Path
import pandas as pd
import pytest
from portal_api.domain.research_execution_recipes import recipe_digest, execution_recipe, execution_recipe_qualification
from portal_api.domain.research_imported_search import bind_parameter_space, validate_imported_search_binding, validate_trial_parameters
from portal_api.services.research_imported_search import imported_strategy
from portal_api.domain.research_full03_profiles import full03_recipe, full03_profile_enabled, full03_execution_binding

DECLARATION={"schema_version":"research.alpha-source.v1","entrypoint":"generate_signals","timeframes":["1h"],
 "warmup_bars":2,"determinism":{"seed_required":True},"required_columns":["close"],"parameter_space":{
 "length":{"kind":"int_range","low":2,"high":10,"step":2},"scale":{"kind":"float_range","low":0.1,"high":1.1,"step":0.1},
 "direction":{"kind":"categorical","values":[-1,1]},"fixed":{"kind":"fixed","value":5}}}
def test_binding_covers_all_kinds_and_preserves_step():
    space=bind_parameter_space(DECLARATION,[{"name":"length","kind":"sweep","low":4,"high":8},{"name":"direction","kind":"pin","value":1}])
    assert space["length"]=={"kind":"int_range","low":4,"high":8,"step":2}
    assert space["direction"]=={"kind":"fixed","value":1}
    assert space["scale"]==DECLARATION["parameter_space"]["scale"]
@pytest.mark.parametrize("override",[
 {"name":"length","kind":"pin","value":True},{"name":"length","kind":"pin","value":3},
 {"name":"scale","kind":"pin","value":0.35},{"name":"length","kind":"sweep","low":4,"high":11},
 {"name":"direction","kind":"pin","value":"both"},{"name":"fixed","kind":"pin","value":True},
 {"name":"unknown","kind":"pin","value":2},
])
def test_bad_override_refused(override):
    with pytest.raises(ValueError,match="ALPHA_PARAMETER"):
        bind_parameter_space(DECLARATION,[override])
def test_all_imported_rows_require_their_own_qualification():
    row=execution_recipe("p10.imported-wfo-temporal-1h.v1")
    assert full03_recipe(row["profile_id"],row["profile_digest"])["adapter_kind"]=="IMPORTED_SEARCH"
    assert full03_execution_binding(row)["adapter_id"]=="p17.imported-signal-notional.v1"
    flags={"PORTAL_FEATURE_RESEARCH_FULL05_PROFILE":"true","PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION":"true"}
    proof=execution_recipe_qualification(row["profile_id"])
    assert proof["kind"] in {"CANDIDATE_NOT_QUALIFIED", "PRODUCT_RUN_QUALIFIED"}
    if proof["kind"]=="PRODUCT_RUN_QUALIFIED":
        assert proof["receipt_path"]=="upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md"
    assert full03_profile_enabled(row["profile_id"],flags)==(proof["kind"]=="PRODUCT_RUN_QUALIFIED")
    assert not full03_profile_enabled(row["profile_id"],dict(flags,PORTAL_FEATURE_RESEARCH_FULL05_PROFILE="false"))
    assert full03_profile_enabled(row["profile_id"],dict(flags,PORTAL_ENV="local",PORTAL_RECIPE_QUALIFICATION_PROFILE_ID=row["profile_id"]))
def test_callback_uses_actual_source_and_past_only_immutable_context():
    declaration=deepcopy(DECLARATION)
    source=("ALPHA_CONTRACT = "+repr(declaration)+"\ndef generate_signals(context):\n"
      "    h = context['history']['close']\n"
      "    return {'schema_version':'research.imported-signal-notional-output.v1','signal_notional':h[-1] - h[-2]}\n").encode()
    space=bind_parameter_space(declaration,[])
    binding={"schema_version":"research.imported-search-binding.v1","source_digest":hashlib.sha256(source).hexdigest(),
      "entrypoint":"generate_signals","declaration":declaration,"declaration_digest":recipe_digest(declaration),
      "parameter_space":space,"parameter_space_digest":recipe_digest(space)}
    frame=pd.DataFrame({"close":[1.,3.,6.,10.,15.]},index=pd.date_range("2026-06-01",periods=5,freq="h",tz="UTC"))
    signal,spec,_=imported_strategy(source,binding,frame,alpha_id="imported",alpha_version_id="av_1")
    params={"length":2,"scale":0.1,"direction":1,"fixed":5}
    assert signal(frame.iloc[2:4],params,frame.index[:2],frame.index[2:4],None).tolist()==[3.,4.]
    assert spec.strategy_id=="imported"
    with pytest.raises(ValueError,match="SOURCE_DIGEST"):
        imported_strategy(source+b"#drift",binding,frame,alpha_id="imported",alpha_version_id="av_1")
    changed=deepcopy(binding);changed["parameter_space"]["length"]["high"]=100
    with pytest.raises(ValueError,match="DIGEST"):
        validate_imported_search_binding(changed)
def test_nonnumeric_retention_and_unknown_profile_fail_closed():
    declaration=deepcopy(DECLARATION);declaration["parameter_space"]["fixed"]["value"]=False
    with pytest.raises(ValueError,match="IMPORTED_NON_NUMERIC_SEARCH_NOT_QUALIFIED"):
        bind_parameter_space(declaration,[])
    assert not full03_profile_enabled("unknown",{})

def test_mixed_numeric_category_is_not_silently_retyped_for_retention():
    declaration=deepcopy(DECLARATION);declaration["parameter_space"]["direction"]["values"]=[1,2.5]
    with pytest.raises(ValueError,match="IMPORTED_MIXED_NUMERIC_CATEGORY_NOT_QUALIFIED"):
        bind_parameter_space(declaration,[])

@pytest.mark.parametrize("patch", [{"length":3},{"direction":2},{"fixed":6},{"scale":0.35},{"scale":True},{"scale":float("nan")}])
def test_native_candidate_is_checked_before_imported_source(patch):
    params={"length":2,"scale":0.1,"direction":1,"fixed":5,**patch}
    with pytest.raises(ValueError,match="ALPHA_PARAMETER_OUTSIDE_DECLARATION"):
        validate_trial_parameters(bind_parameter_space(DECLARATION,[]),params)

@pytest.mark.parametrize("method",["mode2-global","mode3-global","mode4-global","mode4-causal","mode5-global"])
def test_imported_native_retention_refuses_optimizer_setting_drift(method):
    from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter, CurrentSourceArtifactError, recipe_current_source_admission
    row=execution_recipe(f"p10.imported-{method}-1h.v1");descriptor=row["descriptor"]
    admission=recipe_current_source_admission(row["profile_id"],row["profile_digest"])
    config={"execution":{"target_mode":"signal_notional"},"calibration":{
        "optimization_mode":descriptor["optimization_mode"],"optimization_schedule":descriptor["optimization_schedule"],
        "random_seed":42,"optuna_trials":descriptor["trial_count"]["max"],"optimization":dict(descriptor["optimizer_settings"])}}
    adapter=object.__new__(CurrentSourceArtifactAdapter)
    adapter._assert_admission_matches_source(config,admission)
    config["calibration"]["optimization"][next(iter(descriptor["optimizer_settings"]))]="tampered"
    with pytest.raises(CurrentSourceArtifactError,match="Native mode settings"):
        adapter._assert_admission_matches_source(config,admission)
