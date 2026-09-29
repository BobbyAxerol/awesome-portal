#!/usr/bin/env node
/** V11-P23-DR: compare pinned QuantBT, sealed source and owner-bound BFF truth. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, ownerClient, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, docker } from './runtime-tools.mjs';

const RUN_ID = 'rrun_d8e174e6268aedbf868de56edd062b29';
const PYTHON = String.raw`
import hashlib, json, pathlib, sys
import pandas as pd
import quantbt
from importlib import metadata
from strategy.delta_rsi import generate_signals

run_id = sys.stdin.read().strip()
assert run_id.startswith('rrun_') and run_id.replace('_', '').isalnum()
root = pathlib.Path('/var/lib/portal/artifacts/runs/durable-store')
paths = list((root / 'runs' / run_id / 'attempts').glob('*/bundle/*/manifest.json'))
assert len(paths) == 1, 'ONE_SEALED_ATTEMPT_REQUIRED'
manifest_bytes = paths[0].read_bytes()
manifest = json.loads(manifest_bytes)
assert manifest['run_id'] == run_id and manifest['status'] == 'succeeded'
assert manifest['engine']['status'] == 'COMPLETED'

def blob(name):
    digest = manifest['files'][name]
    assert len(digest) == 64 and all(c in '0123456789abcdef' for c in digest)
    payload = (root / 'blobs' / digest).read_bytes()
    assert hashlib.sha256(payload).hexdigest() == digest, 'SEALED_BLOB_HASH_MISMATCH'
    return json.loads(payload), digest

request, request_hash = blob('config/request.json')
binding, binding_hash = blob('research/dataset-binding-receipt.json')
source, source_hash = blob('research/evidence-source.json')
assert request['run_id'] == binding['run_id'] == run_id
assert request['execution_adapter_id'] == 'p04.delta-rsi.v1'
snapshot_id = binding['snapshot_id']
assert snapshot_id.startswith('dss_') and snapshot_id.replace('_', '').isalnum()
frame_path = pathlib.Path('/var/lib/portal/artifacts/runs/snapshots/snapshots') / snapshot_id / 'frame.parquet'
frame_hash = hashlib.sha256(frame_path.read_bytes()).hexdigest()
identity = json.loads((frame_path.parent / 'identity.json').read_text())
assert frame_hash == identity['content_hash'] == binding['snapshot_content_hash'], 'SNAPSHOT_HASH_MISMATCH'

market = pd.read_parquet(frame_path)
oos_end = pd.Timestamp(request['requested_spec']['windows']['oos']['end_exclusive'], tz='UTC')
holdout_start = pd.Timestamp(request['requested_spec']['windows']['holdout']['start'], tz='UTC')
assert oos_end == holdout_start
tape = market.loc[market.index < oos_end]
assert len(tape) > 0 and len(tape) < len(market), 'HOLDOUT_MUST_BE_EXCLUDED'
signal = generate_signals(tape, request['p04_parameters'])['pos_weight']
result = quantbt.QuantBTEndpoint.signal_notional(
    initial_capital=20000, leverage=3, alloc_per_trade=2000,
    fee_rate=0.0005, use_funding=False,
).backtest(data=tape, signal=signal)
report = result.full_report()
direct = {
    'bars': str(len(tape)),
    'final_equity': repr(float(report['final_equity'])),
    'num_trades': str(int(report['num_trades'])),
}
print(json.dumps({
    'engine_version': metadata.version('quantbt-engine'),
    'snapshot_id': snapshot_id, 'snapshot_sha256': frame_hash,
    'snapshot_rows': len(market), 'sealed_artifact_manifest_sha256': hashlib.sha256(manifest_bytes).hexdigest(),
    'sealed_blob_sha256': {'request': request_hash, 'binding': binding_hash, 'evidence': source_hash},
    'input_scope': request['input_scope'], 'direct': direct,
    'sealed_source': {key: source['direct'][key] for key in direct},
}))
`;

export function compareParity(source, api) {
  assert.equal(source.engine_version, '1.1.1', 'PINNED_ENGINE_REQUIRED');
  assert.equal(api.availability?.state, 'AVAILABLE', 'EVIDENCE_MUST_BE_AVAILABLE');
  assert.equal(api.readiness, 'COMPLETE', 'EVIDENCE_MUST_BE_COMPLETE');
  assert.equal(api.run_id, RUN_ID, 'RUN_BINDING_MISMATCH');
  const metrics = new Map(api.metrics.map(metric => [metric.key, metric]));
  const names = { bars: 'BARS_PROCESSED', final_equity: 'FINAL_EQUITY', num_trades: 'TRADE_COUNT' };
  const differences = {};
  for (const [key, metricName] of Object.entries(names)) {
    const metric = metrics.get(metricName);
    assert.equal(metric?.availability?.state, 'AVAILABLE', `${metricName}_UNAVAILABLE`);
    assert.equal(metric.origin, 'ENGINE_DIRECT', `${metricName}_NOT_ENGINE_DIRECT`);
    assert.equal(source.direct[key], source.sealed_source[key], `${key}_SOURCE_DIFF`);
    assert.equal(source.direct[key], metric.value, `${key}_API_DIFF`);
    differences[key] = '0';
  }
  assert.equal(api.core?.engine_version, source.engine_version, 'ENGINE_PIN_DRIFT');
  return { differences, metric_definitions: Object.fromEntries(Object.values(names).map(name => [name, metrics.get(name).definition_id])) };
}

export async function directParityReceipt(home = DEFAULT_HOME) {
  home = validateHome(home);
  const client = await ownerClient(home);
  const source = JSON.parse(docker(['exec', '-i', container('portal-api'), 'python', '-c', PYTHON], RUN_ID));
  const api = (await client.call('GET', `/api/v1/quantbt/runs/${RUN_ID}/evidence`)).body;
  const compared = compareParity(source, api);
  const receipt = {
    schema_version: 'research.p23-direct-parity.v1', project: PROJECT, base_url: BASE_URL,
    run_id: RUN_ID, tested_at_utc: new Date().toISOString(),
    source, api: { revision: api.revision, as_of_utc_ms: api.as_of_utc_ms,
      authority: api.read_authority, metric_definitions: compared.metric_definitions },
    numerical_differences: compared.differences,
    scope: 'ONE_REAL_P04_DELTA_HMD_SNAPSHOT_DIRECT_ENGINE_SEALED_SOURCE_OWNER_BFF',
    passed: true,
  };
  const path = join(home, 'v11-p23-direct-parity.json');
  savePrivate(path, receipt);
  console.log(`V11-P23-DR scoped PASS; receipt sha256:${createHash('sha256').update(JSON.stringify(receipt, null, 2) + '\n').digest('hex')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  directParityReceipt(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME)
    .catch(error => { console.error('V11-P23-DR refused:', error.message); process.exitCode = 1; });
}
