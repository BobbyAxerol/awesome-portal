from __future__ import annotations
import hashlib
from types import SimpleNamespace
import numpy as np
import pandas as pd
import pytest
from portal_api.adapters.research_native_limit_oco_search_v1 import build_commands,INPUT_PROTOCOL
from portal_api.services.research_native_optimization import capture,verify

def tape():
    index=pd.date_range('2026-06-01',periods=600,freq='h',tz='UTC')
    close=np.full(len(index),100.0)
    return pd.DataFrame(dict(open=close,high=close+2,low=close-2,close=close,volume=1),index=index)

def test_multiple_cycles_use_only_known_close_and_disjoint_source_identity():
    market=tape(); signal=pd.Series(1.0,index=market.index)
    commands=build_commands(market,signal,symbol='BTCUSDT',stop_fraction=.013)
    parents=[c for c in commands if c.order_id.endswith('-entry')]
    assert len(parents)==6
    assert len({c.order_id for c in commands})==len(commands)
    for i,parent in enumerate(parents):
        children=[c for c in commands if c.parent_order_id==parent.order_id]
        assert len(children)==2 and all(c.reduce_only for c in children)
        assert len({c.oco_group_id for c in children})==1
        assert parent.price==100 and parent.timestamp==market.index[301+48*i]
        assert parent.metadata['decision_utc_ms']<int(parent.timestamp.value//1000000)
        assert parent.metadata['input_protocol']==INPUT_PROTOCOL
    # Later OHLC values must not change an already compiled cycle's levels.
    altered=market.copy(); altered.loc[altered.index[302:],'high']+=10
    other=build_commands(altered,signal,symbol='BTCUSDT',stop_fraction=.013)
    assert commands==other

def test_flat_tape_never_invents_entry_or_fill():
    market=tape()
    commands=build_commands(market,pd.Series(0.,index=market.index),symbol='BTCUSDT',stop_fraction=.013)
    assert len(commands)==1 and commands[0].action=='cancel_all'

def test_native_trial_custody_roundtrip_and_corruption(tmp_path):
    trials=[SimpleNamespace(number=i,state='COMPLETE',params={'x':i+1},values=(float(i+1),),metrics={'sharpe':float(i+1)},metadata={}) for i in range(3)]
    result=SimpleNamespace(trials=trials,selected_params={'x':2},selection_metadata={'medoid_trial_number':1})
    summary=capture(result,output_directory=tmp_path,requested_trials=3,is_end_utc_ms=200,train_start_utc_ms=100)
    path=tmp_path/'native-optimizer-trials.parquet'
    assert verify(path,summary).num_rows==3
    assert summary['selected_trial_number']==1 and summary['distinct_parameter_sets']==3
    assert summary['holdout_used'] is False
    with path.open('ab') as stream:stream.write(b'corrupt')
    with pytest.raises(ValueError,match='changed'):verify(path,summary)

def test_scope_and_selected_identity_are_not_inferred(tmp_path):
    trial=SimpleNamespace(number=0,state='COMPLETE',params={'x':1},values=(1.,),metrics={},metadata={})
    result=SimpleNamespace(trials=[trial],selected_params={'x':2},selection_metadata={'medoid_trial_number':0})
    with pytest.raises(ValueError,match='disagree'):capture(result,output_directory=tmp_path,requested_trials=2,is_end_utc_ms=200,train_start_utc_ms=100)
