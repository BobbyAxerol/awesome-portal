"""Synthetic compressed-index unit proof; not a real HMD/product receipt."""
import copy
import pytest
from portal_api.services.research_window_suggestion import window_suggestion
HOUR=3_600_000
START=1780272000000
REV="a"*64

def document():
    return {"as_of_utc_ms":START+2000*HOUR,"entries":[{"dataset_id":"crypto-binance-1m","symbol":"BTCUSDT",
        "index":{"timeframe":"1h","start_utc_ms":START-400*HOUR,"end_exclusive_utc_ms":START+2000*HOUR,
            "runs":[[START-400*HOUR,START+1999*HOUR]]}}]}

def query(**changes):
    return {"dataset_id":"crypto-binance-1m","symbol":"BTCUSDT","timeframe":"1h","protocol":"three_window_decay",
        "warmup_bars":300,"max_span_days":None,"expected_catalog_revision":REV,
        "start_utc_ms":START,"end_exclusive_utc_ms":START+100*HOUR,**changes}

def test_three_window_four_edges_share_actual_bars_without_prices():
    result=window_suggestion(document(),REV,query())
    assert result["state"]=="AVAILABLE"
    windows=result["patch"]["windows"]
    assert [w["bars"] for w in windows.values()]==[70,20,10]
    assert windows["is"]["end_exclusive_utc_ms"]==windows["oos"]["start_utc_ms"]==START+70*HOUR
    assert windows["oos"]["end_exclusive_utc_ms"]==windows["holdout"]["start_utc_ms"]==START+90*HOUR
    assert result["range_origin"]=="EXPLICIT_UNCHANGED"
    assert "close" not in str(result) and "preflight_token" not in result

def test_bar_rank_not_wall_time_when_index_has_a_gap():
    doc=document();doc["entries"][0]["index"]["runs"]=[[START-400*HOUR,START+9*HOUR],[START+50*HOUR,START+1999*HOUR]]
    result=window_suggestion(doc,REV,query())
    windows=result["patch"]["windows"]
    assert [w["bars"] for w in windows.values()]==[42,12,6]
    assert windows["is"]["end_exclusive_utc_ms"]==START+82*HOUR

@pytest.mark.parametrize("changes,reason",[
    ({"start_utc_ms":START+1},"WINDOW_BOUND_NOT_ALIGNED"),
    ({"start_utc_ms":START-400*HOUR},"WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"),
    ({"end_exclusive_utc_ms":START+3000*HOUR},"WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"),
    ({"protocol":"advanced","max_span_days":1},"PROFILE_RANGE_EXCEEDS_LIMIT"),
    ({"end_exclusive_utc_ms":START+2*HOUR},"WINDOW_SUGGESTION_INSUFFICIENT_BARS"),
    ({"expected_catalog_revision":"b"*64},"HMD_METADATA_INDEX_SOURCE_REVISION_CHANGED"),
    ({"protocol":"advanced","initial_train_bars":100},"INITIAL_TRAIN_LEAVES_NO_OOS_BARS"),
])
def test_explicit_bad_range_is_refused_never_silently_clamped(changes,reason):
    result=window_suggestion(document(),REV,query(**changes))
    assert result["state"]=="NOT_PUBLISHED" and result["patch"] is None
    assert result["reason_code"]==reason

def test_automatic_span_is_bounded_and_advanced_does_not_fabricate_holdout_or_folds():
    request=query(protocol="advanced",max_span_days=92);request.pop("start_utc_ms");request.pop("end_exclusive_utc_ms")
    result=window_suggestion(document(),REV,request)
    wf=result["patch"]["walk_forward"]
    assert wf["end_exclusive_utc_ms"]-wf["start_utc_ms"]==60*86_400_000
    assert wf["start_utc_ms"]<wf["first_oos_utc_ms"]<wf["end_exclusive_utc_ms"]
    assert "holdout" not in result["patch"] and "folds" not in result["patch"]

def test_missing_index_is_typed_not_a_calendar_guess():
    assert window_suggestion(None,None,query())["patch"] is None

def test_observed_vn_dates_split_actual_sessions_without_weekend_bars():
    from test_research_observed_daily_index import build,ms
    index=build();doc={"as_of_utc_ms":ms("2026-08-12"),"entries":[{"dataset_id":"vn-stock-daily","symbol":"FPT","index":index}]}
    request=query(dataset_id="vn-stock-daily",symbol="FPT",timeframe="1d",warmup_bars=1,
        start_utc_ms=ms("2026-08-04"),end_exclusive_utc_ms=ms("2026-08-11"))
    result=window_suggestion(doc,REV,request)
    assert result["source_timezone"]=="Asia/Ho_Chi_Minh"
    assert [w["bars"] for w in result["patch"]["windows"].values()]==[1,1,1]
    assert result["patch"]["windows"]["oos"]["start_utc_ms"]==ms("2026-08-07")
