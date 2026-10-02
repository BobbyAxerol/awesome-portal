"""Metadata planning uses retained timestamps, never synthesized OHLCV."""
from types import SimpleNamespace
import pandas as pd
import pytest
from portal_api.services.enrich_dataset_catalog import declaration_estimate, DatasetIndexError, DatasetIndexStore
from portal_api.services.research_preflight_snapshot import _advanced_topology

START = 1780272000000  # June 1 2026
END = 1788220800000    # September 1 2026
HOUR = 3600000
OPTIONS = SimpleNamespace(admitted=lambda key: ("weekly", "monthly", "single") if key == "frequency" else ("expanding", "rolling"))
CATALOG = SimpleNamespace(walk_forward_options=lambda: OPTIONS)

def spec():
    return {"schema_version":"research.requested-spec.v1", "protocol":"advanced",
        "data":{"dataset_id":"crypto-binance-1m","symbol":"BTCUSDT","timeframe":"1h"},
        "walk_forward":{"start":"2026-06-01T00:00:00Z","end_exclusive":"2026-09-01T00:00:00Z",
            "split_mode":"walk_forward_2026-07-01T00:00:00Z","frequency":"weekly","window_mode":"expanding"},
        "optuna_trials":3}

def document():
    return {"as_of_utc_ms":END, "entries":[{"dataset_id":"crypto-binance-1m","symbol":"BTCUSDT",
        "index":{"timeframe":"1h","resolution_ms":HOUR,"start_utc_ms":START-400*HOUR,
            "end_exclusive_utc_ms":END,"runs":[[START-400*HOUR,END-HOUR]]}}]}

def test_real_index_fold_edges_count_match_existing_preflight_planner():
    requested=spec()
    result=declaration_estimate(document(),requested,warmup_bars=300,engine_catalog=CATALOG)
    frame=pd.DataFrame(index=pd.date_range("2026-06-01", "2026-08-31T23:00:00",freq="1h",tz="UTC"))
    _,_,plan=_advanced_topology(requested,frame,source_timezone="UTC",options=OPTIONS)
    assert result["planned_folds"]["count"] == len(plan["folds"]) == 9
    assert result["planned_folds"]["min_train_bars"] == 720
    assert result["planned_folds"]["min_oos_bars"] == 144
    assert result["windows"][0]["bars"] == 2208
    assert result["windows"][0]["warmup_bars_available_before_start"] == 300

def test_missing_index_and_partial_range_do_not_publish_fold_total():
    missing=declaration_estimate(None,spec(),warmup_bars=300,engine_catalog=CATALOG)
    assert missing["planned_folds"]["count"] is None
    doc=document();doc["entries"][0]["index"]["end_exclusive_utc_ms"]-=HOUR
    partial=declaration_estimate(doc,spec(),warmup_bars=300,engine_catalog=CATALOG)
    assert partial["planned_folds"]["reason_code"] == "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"
    assert partial["windows"][0]["bars"] is None

def test_gap_changes_counts_without_filling_bars():
    doc=document(); idx=doc["entries"][0]["index"]
    idx["runs"]=[[START-400*HOUR,START+10*HOUR],[START+12*HOUR,END-HOUR]]
    result=declaration_estimate(doc,spec(),warmup_bars=300,engine_catalog=CATALOG)
    assert result["windows"][0]["bars"] == 2207
    assert result["planned_folds"]["min_train_bars"] == 719

def test_fixed_counts_holdout_are_metadata_not_holdout_values():
    requested=spec();requested.pop("walk_forward");requested["protocol"]="three_window_decay"
    requested["windows"]={"is":{"start":"2026-06-01T00:00:00Z","end_exclusive":"2026-07-01T00:00:00Z"},
        "oos":{"start":"2026-07-01T00:00:00Z","end_exclusive":"2026-08-01T00:00:00Z"},
        "holdout":{"start":"2026-08-01T00:00:00Z","end_exclusive":"2026-09-01T00:00:00Z"}}
    result=declaration_estimate(document(),requested,warmup_bars=300,engine_catalog=CATALOG)
    assert [w["bars"] for w in result["windows"]]==[720,744,744]
    assert result["planned_folds"]["count"]==1
    assert not any("close" in w for w in result["windows"])

def test_v2_calls_existing_engine_planner_not_calendar_inference():
    requested=spec();requested["schema_version"]="research.requested-spec.v2"
    requested.update(optimization_mode="mode_1_decay",optimization_schedule="global")
    called=[]
    class Gateway:
        def walk_forward_fold_plan(self,**kwargs):
            called.append(kwargs)
            # The source planner refuses an unsupported schedule; never fake a plan.
            raise ValueError("source refused purge")
    result=declaration_estimate(document(),requested,warmup_bars=300,engine_catalog=CATALOG,gateway=Gateway())
    assert len(called)==1
    assert result["planned_folds"]["count"] is None
    assert result["planned_folds"]["reason_code"]=="RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED"

def test_alignment_is_checked_before_index_expansion():
    requested=spec();requested["walk_forward"]["start"]="2026-06-01T00:00:00.001Z"
    with pytest.raises(DatasetIndexError):
        declaration_estimate(document(),requested,warmup_bars=300,engine_catalog=CATALOG)

def test_estimate_cache_is_bounded_revision_bound_and_not_caller_mutable(tmp_path):
    store=DatasetIndexStore(tmp_path)
    r=store.estimate("a"*64,document(),spec(),warmup_bars=300,engine_catalog=CATALOG)
    r["planned_folds"]["count"]=99
    assert store.estimate("a"*64,document(),spec(),warmup_bars=300,engine_catalog=None)["planned_folds"]["count"]==9
    assert store.estimate(None,None,spec(),warmup_bars=300,engine_catalog=None)["planned_folds"]["count"] is None
    for n in range(70):store.estimate(None,None,spec(),warmup_bars=n,engine_catalog=None)
    assert len(store._estimates)==64
