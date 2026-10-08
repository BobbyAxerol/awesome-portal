"""Bounded complete native optimizer trial custody, separate from public core."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any
import pyarrow as pa
import pyarrow.parquet as pq
from .research_window_execution import decimal

TABLE = 'native_optimizer_trials'
VERSION = 'research.native-optimizer-trial-table.v1'
ROW_SCHEMA = pa.schema([
    pa.field('source_ordinal', pa.int64(), nullable=False),
    pa.field('trial_number', pa.int64(), nullable=False),
    pa.field('state', pa.string(), nullable=False),
    pa.field('parameters_json', pa.string(), nullable=False),
    pa.field('objective', pa.string()),
    pa.field('metrics_json', pa.string(), nullable=False),
    pa.field('metadata_json', pa.string(), nullable=False),
])

def capture(optimization: Any, *, output_directory: Path, requested_trials: int,
            is_end_utc_ms: int, train_start_utc_ms: int) -> dict[str, Any]:
    rows = [dict(source_ordinal=i,trial_number=t.number,state=t.state,
        parameters_json=json.dumps({k:decimal(v) for k,v in t.params.items()},sort_keys=True),
        objective=decimal(t.values[0]) if t.values else None,
        metrics_json=json.dumps({k:decimal(v) for k,v in t.metrics.items()},sort_keys=True),
        metadata_json=json.dumps(t.metadata,sort_keys=True))
        for i,t in enumerate(optimization.trials)]
    if not 1 <= len(rows) <= requested_trials <= 400 or len({r['trial_number'] for r in rows}) != len(rows):
        raise ValueError('native trial population is not bounded/unique')
    selected_id=optimization.selection_metadata.get('medoid_trial_number')
    selected=next((t for t in optimization.trials if t.number==selected_id),None)
    if selected is None:
        raise ValueError('native robust selector did not publish an exact trial identity')
    if dict(selected.params) != dict(optimization.selected_params):
        raise ValueError('native engine selected parameters disagree with its robust IS trial')
    next(r for r in rows if r['trial_number']==selected.number)['metadata_json']=json.dumps(
        {'trial_metadata':selected.metadata,'native_selection_metadata':optimization.selection_metadata},sort_keys=True,allow_nan=False)
    path=output_directory/'native-optimizer-trials.parquet'
    pq.write_table(pa.Table.from_pylist(rows,schema=ROW_SCHEMA),path)
    path.chmod(0o600)
    return dict(schema_version='research.native-optimization.v1',authority='PINNED_QUANTBT_NATIVE_IS_SHARPE',
        scope='P08_WARMUP_PLUS_IS_ONLY',objective_name='sharpe',requested_trials=requested_trials,
        completed_trials=sum(r['state']=='COMPLETE' for r in rows),retained_trials=len(rows),
        distinct_parameter_sets=len({r['parameters_json'] for r in rows}),selected_trial_number=selected.number,
        selected_parameters={k:decimal(v) for k,v in optimization.selected_params.items()},
        selected_objective=decimal(selected.values[0]),train_start_utc_ms=train_start_utc_ms,
        selection_method='QUANTBT_GENERIC_ROBUST_PLATEAU_NOT_SCALAR_WFO_V1',
        train_end_exclusive_utc_ms=is_end_utc_ms,holdout_used=False,
        table_kind=TABLE,table_schema_version=VERSION,sha256=hashlib.sha256(path.read_bytes()).hexdigest())

def verify(path: Path, summary: dict[str, Any]) -> pa.Table:
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= 8*1024*1024:
        raise ValueError('native trial custody requires bounded ordinary Parquet bytes')
    if summary['sha256'] != hashlib.sha256(path.read_bytes()).hexdigest():
        raise ValueError('native trial bytes changed after child receipt')
    table=pq.read_table(path)
    if not table.schema.equals(ROW_SCHEMA) or table.num_rows != summary['retained_trials']:
        raise ValueError('native trial retained schema/population changed')
    rows=table.to_pylist()
    if [r['source_ordinal'] for r in rows]!=list(range(len(rows))) or len({r['trial_number'] for r in rows})!=len(rows):
        raise ValueError('native trial ordinal/identity is not complete and unique')
    selected=[r for r in rows if r['trial_number']==summary['selected_trial_number']]
    if len(selected)!=1 or selected[0]['state']!='COMPLETE' or json.loads(selected[0]['parameters_json'])!=summary['selected_parameters'] or selected[0]['objective']!=summary['selected_objective']:
        raise ValueError('native trial selected identity differs from sealed population')
    return table
