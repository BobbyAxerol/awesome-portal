"""Additional fixed-UTC candle loaders; never alias spot data to futures."""
from types import SimpleNamespace
import os
import pytest
from portal_api.adapters.market_data import (HistoricalMarketDataProvider, UnavailableHistoricalMarketDataProvider,
    MarketDataQuery, normalize_market_frame, market_content_hash)
from portal_api.domain.errors import DatasetNotFoundError

def test_disabled_provider_never_publishes_additional_sources():
    rows=UnavailableHistoricalMarketDataProvider("READER_DISABLED").list_datasets()
    assert len(rows)==1 and rows[0].availability=="unavailable"

def test_loader_selection_mount_absence_and_catalog_scope(tmp_path):
    class Spot:
        NEW_PATH_PARTS=("crypto","binance_spot","1m")
    class Quarterly:
        NEW_PATH_PARTS=("crypto","binance_futures","1m")
        def _discover_symbols(self): return ["BTCUSDT_260626"]
    for parts in (Spot.NEW_PATH_PARTS,Quarterly.NEW_PATH_PARTS):
        for symbol in ("BTCUSDT","BTCUSDT_260626"):
            tmp_path.joinpath(*parts,f"symbol={symbol}","year=2026","month=06").mkdir(parents=True)
    p=HistoricalMarketDataProvider(runtime=SimpleNamespace(storage_root=tmp_path,loader_class=Quarterly,
        additional_loaders=(("crypto-binance-spot-1m",Spot),("crypto-binance-quarterly-1m",Quarterly))))
    assert p._loader_class("crypto-binance-spot-1m") is Spot
    assert p._loader_class("crypto-binance-quarterly-1m") is Quarterly
    assert all(row["contract_kind"] is None for row in p.research_symbol_catalog("crypto-binance-spot-1m"))
    assert [row["symbol"] for row in p.research_symbol_catalog("crypto-binance-quarterly-1m")]==["BTCUSDT_260626"]
    assert all(row.usage_scopes==("backtest","research") for row in p.list_datasets())
    with pytest.raises(DatasetNotFoundError):p._loader_class("browser-path")
    Quarterly.NEW_PATH_PARTS=("not","mounted")
    assert p.list_datasets()[2].availability=="unavailable"

@pytest.mark.skipif(os.getenv("PORTAL_RUN_HMD_REAL_SMOKE")!="1",reason="Opt-in read-only HMD qualification")
@pytest.mark.parametrize("dataset,symbol",[("crypto-binance-spot-1m","BTCUSDT"),("crypto-binance-quarterly-1m","BTCUSDT_260925")])
@pytest.mark.parametrize("timeframe,rows",[("1min",1440),("5min",288),("15min",96),("30min",48),("1h",24),("4h",6),("1D",1)])
def test_installed_additional_reader_exact_utc_bounds_and_hash_oracle(dataset,symbol,timeframe,rows):
    p=HistoricalMarketDataProvider()
    result=p.load(MarketDataQuery(dataset_id=dataset,symbol=symbol,timeframe=timeframe,
        start="2026-08-01T00:00:00Z",end_exclusive="2026-08-02T00:00:00Z"))
    direct=p._loader_class(dataset)().load_resampled(symbol,timeframe=timeframe,
        start_date="2026-08-01T00:00:00Z",end_date="2026-08-01T23:59:59.999999Z",check_val=True,engine="duckdb")
    frame=normalize_market_frame(direct.sort_values("time",kind="stable").rename(columns={"time":"datetime"}).set_index("datetime"))
    assert len(result.frame)==rows
    assert result.content_hash==market_content_hash(frame)
    assert result.descriptor.dataset_id==dataset
    assert str(result.frame.index.tz)=="UTC"
    assert result.load_metadata["provider"]==p._loader_class(dataset).__name__
