"""Opt-in real child/retention proof, not a substitute for P10 preview API proof."""
import json
import os
import shutil
from pathlib import Path
import pandas as pd
import pytest
from portal_api.adapters.market_data import HistoricalMarketDataProvider, MarketDataQuery
from portal_api.domain.research_delta_wfo_v2_profile import DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter, signal_notional_current_source_admission, iter_current_source_retention_batches
from portal_api.services.research_artifacts import ArtifactFence, ArtifactIdentity, ResearchArtifactStore
from portal_api.services.research_supervisor import IsolatedResearchSupervisor, DeltaWfoChildReceipt, DELTA_WFO_CHILD_LIMITS

pytestmark = pytest.mark.skipif(os.getenv("PORTAL_RUN_HMD_REAL_SMOKE") != "1", reason="Opt-in read-only HMD child qualification")

def test_temporal_rolling_guards_real_child_and_retention(tmp_path: Path):
    start, split, end = [pd.Timestamp(value) for value in ("2026-06-01T00:00:00Z","2026-07-01T00:00:00Z","2026-07-15T00:00:00Z")]
    market = HistoricalMarketDataProvider().load(MarketDataQuery(dataset_id="crypto-binance-1m",symbol="BTCUSDT",timeframe="1h",start=start,end_exclusive=end))
    market_root = tmp_path / "market"; market_root.mkdir(mode=0o700)
    tape = market_root / "ohlcv.parquet"; market.frame.to_parquet(tape); tape.chmod(0o600)
    run_id, attempt = "rrun_temporal_real_hmd", "rwa_temporal_real_hmd"
    controls = {"split_frequency":"weekly","window_mode":"rolling","train_window":"14D","label_horizon_bars":1,"purge_bars":2,"embargo_bars":3}
    result = IsolatedResearchSupervisor(tmp_path / "scratch",allowed_market_root=market_root).run_delta_wfo(
        DeltaWfoChildReceipt(job_id="rjob_temporal_real_hmd",run_id=run_id,worker_attempt_id=attempt,lease_epoch=1,
          market_path=tape,artifact_root=tmp_path / "p05",execution_profile_id=DELTA_WFO_V2_PROFILE_ID,
          execution_profile_digest=DELTA_WFO_V2_PROFILE_DIGEST,dataset_id="crypto-binance-1m",symbol="BTCUSDT",
          data_start_utc_ms=start.value//1_000_000,data_end_exclusive_utc_ms=end.value//1_000_000,first_oos_utc_ms=split.value//1_000_000,
          temporal_controls=controls),limits=DELTA_WFO_CHILD_LIMITS)
    raw = result.output_root / run_id
    config = json.loads((raw / "config.json").read_text())["calibration"]
    for key in ("train_window","window_mode","split_frequency","label_horizon_bars","purge_bars","embargo_bars"):
        assert config[key] == controls[key]
    source = tmp_path / "source"; shutil.copytree(raw,source / run_id)
    retained = ResearchArtifactStore(tmp_path / "retained")
    fence = ArtifactFence(workspace_id="ws_temporal",run_id=run_id,worker_attempt_id=attempt,lease_epoch=1)
    exported = CurrentSourceArtifactAdapter(source_artifacts=ArtifactRepository(source),retained_artifacts=retained).export_advanced_walkforward(
        run_id=run_id, identity=ArtifactIdentity(artifact_id="rart_temporal",artifact_revision=1,workspace_id="ws_temporal",run_id=run_id,
          engine_release_id="quantbt-engine-1.1.1",engine_build_ref="9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
          request_spec_digest="c"*64,effective_spec_digest="d"*64,dataset_binding_digest=market.content_hash),
        fence=fence,admission=signal_notional_current_source_admission(),fence_validator=lambda candidate:candidate==fence)
    batches = list(iter_current_source_retention_batches(retained_artifacts=retained,receipt=exported.receipt,cursor_secret=os.urandom(32)))
    assert result.n_folds >= 2 and result.trial_rows == 3
    assert exported.receipt.table_rows["trials"] == 3
    guards = exported.receipt.summary["source_facts"]["temporal_guards"]
    assert [guards[key] for key in ("label_horizon_bars","purge_bars","embargo_bars")] == [1,2,3]
    assert {batch.table_kind for batch in batches} == {"OBSERVATION","FOLD","TRIAL","CANDIDATE","SELECTION"}
    assert all(1<=len(batch.rows)<=200 for batch in batches)
    print("TEMPORAL_REAL_HMD_RECEIPT " + json.dumps({"profile":DELTA_WFO_V2_PROFILE_ID,"digest":DELTA_WFO_V2_PROFILE_DIGEST,
      "controls":controls,"cpu_seconds":result.cpu_seconds,"wall_seconds":result.elapsed_seconds,
      "bars":result.bars,"folds":result.n_folds,"trials":result.trial_rows,"manifest_digest":exported.receipt.manifest_digest,
      "table_rows":dict(exported.receipt.table_rows)},sort_keys=True))
