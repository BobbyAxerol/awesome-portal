"""Exact scalar route/account dispatch; unit evidence is not product qualification."""
from __future__ import annotations

import copy
import json
from types import SimpleNamespace
import pandas as pd
import pytest

from portal_api.domain.research_execution_recipes import execution_recipe, execution_recipe_qualification
from portal_api.domain.research_execution_recipes_generated import EXECUTION_RECIPE_TABLE
from portal_api.domain.research_full03_profiles import full03_recipe, indexed_account_kwargs, indexed_execution_kwargs, full03_profile_enabled
from portal_api.domain.requests import AccountConfig, ExecutionConfig
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from test_research_full03_child import full03_request, bind_full03_work
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter
from portal_api.services.research_artifacts import ResearchArtifactStore

IDS = tuple(row["profile_id"] for row in EXECUTION_RECIPE_TABLE["recipes"]
            if row["descriptor"]["schema_version"] == "research.full06-delta-profile.v1")


@pytest.mark.parametrize("profile_id", IDS)
def test_percent_equity_pins_exact_clock_units_and_account_without_money_alias(profile_id):
    row = execution_recipe(profile_id)
    assert full03_recipe(profile_id, row["profile_digest"]) == row
    assert indexed_account_kwargs(row) == {"initial_capital": 20000, "leverage": 3, "alloc_per_trade": 0.1,
        "canonical_one_way_fee_rate": 0.0005, "funding_enabled": False}
    account = AccountConfig(**indexed_account_kwargs(row))
    execution = ExecutionConfig(target_mode="pct_equity", **indexed_execution_kwargs(row))
    assert account.alloc_per_trade == 0.1
    assert execution.slippage == 0
    assert indexed_execution_kwargs(None) == {}
    assert ExecutionConfig(target_mode="signal_notional", **indexed_execution_kwargs(None)).slippage == 0.0001
    assert indexed_account_kwargs(None)["alloc_per_trade"] == 2000
    qualified = execution_recipe_qualification(profile_id)["kind"] == "PRODUCT_RUN_QUALIFIED"
    assert full03_profile_enabled(profile_id, {"PORTAL_ENV": "local", "PORTAL_FEATURE_RESEARCH_FULL06_PROFILE": "true"}) == qualified
    assert not full03_profile_enabled(profile_id, {"PORTAL_ENV": "local", "PORTAL_FEATURE_RESEARCH_FULL06_PROFILE": "false"})
    assert full03_profile_enabled(profile_id, {"PORTAL_ENV": "local", "PORTAL_FEATURE_RESEARCH_FULL06_PROFILE": "true",
        "PORTAL_RECIPE_QUALIFICATION_PROFILE_ID": profile_id})
    malformed = copy.deepcopy(row)
    malformed["descriptor"]["account"]["alloc_per_trade"] = 2000
    with pytest.raises(ValueError):
        indexed_account_kwargs(malformed)


@pytest.mark.parametrize("method", ["wfo-temporal", "causal-inner", "per-fold-decay", "three-window-optimized"])
def test_percent_equity_ordinary_work_has_new_av_and_cannot_change_route(method):
    profile_id=f"p10.delta-pct-equity-{method}-1h.v1"
    doc=full03_request(profile_id)
    doc["research"]["requested_spec"]["execution_route"]="pct_equity"
    bind_full03_work(doc)
    admitted=ResearchRunProducerRequest.model_validate(doc)
    assert admitted.research.alpha_version_id=="av_delta_rsi_polynomial_alpha_1_0_2"
    doc["research"]["requested_spec"]["execution_route"]="signal_notional"
    bind_full03_work(doc)
    with pytest.raises(ValueError):
        ResearchRunProducerRequest.model_validate(doc)


def test_lifecycle_custody_does_not_require_optional_accounting_series(tmp_path):
    artifacts = ArtifactRepository(tmp_path)
    runner = AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=artifacts)
    lifecycle = pd.DataFrame([{"fold_id": 0, "context": "out-of-sample generation", "candidate_id": "unit-only"}])
    runner._write_account_ledger("unit-pct", pd.DataFrame(index=pd.date_range("2024-01-01", periods=2)),
        SimpleNamespace(), {"strategy_lifecycle_table": lifecycle, "strategy_lifecycle_records_dropped": 0})
    run_dir = artifacts.run_directory("unit-pct")
    assert not (run_dir / "series/account_ledger.v1.parquet").exists()
    contract = json.loads((run_dir / "wfo/account_contract.v1.json").read_text())
    assert contract["orders_published"] is None
    assert contract["fills_published"] is None
    assert contract["trades_published"] is None
    pd.testing.assert_frame_equal(pd.read_parquet(run_dir / "wfo/strategy_lifecycle.v1.parquet"), lifecycle)


def test_percent_replay_retains_real_bars_without_inventing_costs(tmp_path):
    adapter = CurrentSourceArtifactAdapter(source_artifacts=ArtifactRepository(tmp_path / "source"),
        retained_artifacts=ResearchArtifactStore(tmp_path / "retained"))
    index = pd.date_range("2024-01-01", periods=2, freq="1h", tz="UTC")
    stitched = pd.DataFrame({"open":[99,100],"high":[101,102],"low":[98,99],"close":[100,101]}, index=index)
    observations = [{"at_utc_ms":int(at.value // 1_000_000),"accepted_position":"0.1","equity":equity}
        for at,equity in zip(index,["20000","20001"],strict=True)]
    replay = adapter._attach_bar_ledger(observations,stitched=stitched,ledger=pd.DataFrame(index=index),
        folds=[],account_contract={},source_contract={})
    assert replay["totals"]["bars"] == 2
    for key in ("fee","turnover","funding","bars_with_turnover","rejected_orders"):
        assert replay["totals"][key] is None
    assert all(json.loads(row["bar_json"])["fee"] is None for row in observations)
    assert replay["candle_overview"]["source_bar_count"] == 2
