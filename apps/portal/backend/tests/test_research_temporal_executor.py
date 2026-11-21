"""No price fixtures masquerade as admission/preview acceptance."""
import copy
import pytest
from portal_api.domain.research_delta_wfo_v2_profile import DELTA_WFO_V2_PROFILE_DIGEST, DELTA_WFO_V2_PROFILE_ID, temporal_controls
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.domain.requests import AdvancedWalkForwardConfig
from portal_api.services.advanced_walkforward_runner import _config_fields
from portal_api.services.research_supervisor import DeltaWfoChildReceipt
from wfo_test_support import wfo_request

def request():
    document = wfo_request()
    document["research"]["execution_profile_id"] = DELTA_WFO_V2_PROFILE_ID
    document["research"]["execution_profile_digest"] = DELTA_WFO_V2_PROFILE_DIGEST
    spec = document["research"]["requested_spec"]
    spec["schema_version"] = "research.requested-spec.v2"
    spec["walk_forward"].update(window_mode="rolling",train_window="14D",label_horizon_bars=1,purge_bars=2,embargo_bars=3)
    return document

def test_private_temporal_contract_and_engine_mapping():
    admitted = ResearchRunProducerRequest.model_validate(request())
    assert admitted.research.is_delta_wfo
    controls = temporal_controls(admitted.research.requested_spec)
    fields = _config_fields(AdvancedWalkForwardConfig(**controls),target_mode="signal_notional")
    assert fields["train_window"] == "14D"
    assert [fields[key] for key in ("label_horizon_bars","purge_bars","embargo_bars")] == [1,2,3]
    v1 = _config_fields(AdvancedWalkForwardConfig(),target_mode="signal_notional")
    assert all(key not in v1 for key in ("label_horizon_bars","purge_bars","embargo_bars"))

@pytest.mark.parametrize("case",["digest","width","guard","inner","frequency"])
def test_temporal_refusals_before_child(case):
    doc = request()
    wf = doc["research"]["requested_spec"]["walk_forward"]
    if case == "digest": doc["research"]["execution_profile_digest"] = "a"*64
    if case == "width": del wf["train_window"]
    if case == "guard": wf["purge_bars"] = 10001
    if case == "inner": wf["inner"] = {"split_frequency":"weekly"}
    if case == "frequency": wf["frequency"] = "hourly"
    with pytest.raises(ValueError): ResearchRunProducerRequest.model_validate(doc)
