"""Read-only proof against a source-pinned existing metadata index, no run."""
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from portal_api.adapters.market_data import HistoricalMarketDataProvider
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.services.enrich_dataset_catalog import DatasetIndexStore, source_digest, declaration_estimate
from portal_api.services.research_engine_catalog import ResearchEngineCatalogService
from portal_api.services.research_window_suggestion import window_suggestion

provider=HistoricalMarketDataProvider()
store=DatasetIndexStore(Path("/artifacts/runs/durable-store/research-dataset-index"))
revision,document,reason=store.read(source_digest(provider))
assert document is not None,reason
catalog=ResearchEngineCatalogService(Path("/portal-src/registry"),market_data_provider=provider)
clock=time.perf_counter()
query={"dataset_id":"crypto-binance-1m","symbol":"BTCUSDT","timeframe":"1h","warmup_bars":300,
    "expected_catalog_revision":revision,"max_span_days":92,"protocol":"advanced"}
advanced=window_suggestion(document,revision,query)
assert advanced["state"]=="AVAILABLE",advanced["reason_code"]
wf=advanced["patch"]["walk_forward"]
def iso(value):
    return datetime.fromtimestamp(value/1000,tz=timezone.utc).isoformat()
base={"schema_version":"research.requested-spec.v1","protocol":"advanced","execution_route":"signal_notional",
    "data":{key:query[key] for key in ("dataset_id","symbol","timeframe")},"optuna_trials":3,
    "optimization_mode":"mode_1_decay","optimization_schedule":"global",
    "walk_forward":{"start":iso(wf["start_utc_ms"]),"end_exclusive":iso(wf["end_exclusive_utc_ms"]),
        "split_mode":iso(wf["first_oos_utc_ms"]),"frequency":wf["frequency"],"window_mode":wf["window_mode"]}}
estimate=declaration_estimate(document,base,warmup_bars=300,engine_catalog=catalog,gateway=QuantBTGateway())
assert estimate["planned_folds"]["availability"]=="AVAILABLE",estimate["planned_folds"]
assert 2<=estimate["planned_folds"]["count"]<=16
assert len(estimate["planned_folds"]["items"])==estimate["planned_folds"]["count"]
three=window_suggestion(document,revision,{**query,"protocol":"three_window_decay","max_span_days":None})
assert three["state"]=="AVAILABLE"
w=three["patch"]["windows"]
assert w["is"]["end_exclusive_utc_ms"]==w["oos"]["start_utc_ms"]
assert w["oos"]["end_exclusive_utc_ms"]==w["holdout"]["start_utc_ms"]
print(json.dumps({"scope":"REAL_SOURCE_PINNED_INDEX_AND_PLANNER_NOT_PRODUCT_API_OR_RUN",
    "index_revision":revision,"index_as_of_utc_ms":document["as_of_utc_ms"],"engine_release_id":catalog.public_document().current_release.release_id,
    "advanced":advanced,"three_window":three,"engine_fold_plan":estimate["planned_folds"],
    "elapsed_ms":round((time.perf_counter()-clock)*1000,3)},sort_keys=True))
