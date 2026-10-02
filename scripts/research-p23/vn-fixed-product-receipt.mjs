#!/usr/bin/env node
/** Named observed-VN product proof, exclusively the owned :8096 cell. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { admitRealRun, requestedSpec, waitForRun } from './real-run.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
export const VN_PROFILE = Object.freeze({
  id: 'p10.vn-stock-daily-observed-fixed.v1',
  digest: 'acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e',
});
const BOUNDS = ['2025-04-01', '2025-08-01', '2026-01-01', '2026-05-01'];
const canonical = value => JSON.stringify((function normalize(item) {
  return Array.isArray(item) ? item.map(normalize) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, normalize(child)])) : item;
})(value));
export function vnFixedRequestedSpec(binding, release, profile = 'p04') {
  assert.equal(profile, 'p04', 'NAMED_FIXED_PRESET_REQUIRED');
  const spec = requestedSpec(binding, release, profile);
  return { ...spec, data: { dataset_id: 'vn-stock-daily', symbol: 'FPT', timeframe: '1d' },
    windows: Object.fromEntries(['is', 'oos', 'holdout'].map((kind, index) => [kind, {
      start: `${BOUNDS[index]}T00:00:00+07:00`, end_exclusive: `${BOUNDS[index + 1]}T00:00:00+07:00`,
    }])) };
}
export function assertVnPreflight(preflight, spec) {
  assert.equal(preflight.may_create_run, true);
  const snapshot = preflight.snapshot;
  assert.equal(snapshot.timezone, 'Asia/Ho_Chi_Minh');
  assert(!snapshot.calendar_policy.includes('24_7'), 'NO_CRYPTO_CALENDAR_FOR_OBSERVED_DATES');
  assert.equal(snapshot.warmup.bars, 300);
  assert.equal(snapshot.warmup.requested_bars, 300);
  assert.equal(snapshot.logical_range.start_utc_ms, Date.parse(spec.windows.is.start));
  assert.equal(snapshot.logical_range.end_exclusive_utc_ms, Date.parse(spec.windows.holdout.end_exclusive));
  assert(snapshot.query.start_utc_ms < snapshot.logical_range.start_utc_ms);
  assert.equal((snapshot.query.start_utc_ms + 7 * 3_600_000) % 86_400_000, 0);
  assert.equal(snapshot.quality.passed, true);
  assert.equal(snapshot.quality.duplicates, 0);
  assert.equal(snapshot.quality.state, 'OBSERVED_TAPE_INTEGRITY_ONLY');
  for (const key of ['gaps', 'gap_ratio', 'missing_bar_count']) assert.equal(snapshot.quality[key], null);
  assert.equal(snapshot.provenance.clock_basis, 'OBSERVED_SOURCE_LOCAL_DATE_V1');
  assert.equal(snapshot.provenance.source_timezone, 'Asia/Ho_Chi_Minh');
  assert.equal(snapshot.provenance.warmup_semantics, 'LAST_N_OBSERVED_PREDECESSORS_V1');
  assert(/^[a-f0-9]{64}$/.test(snapshot.provenance.metadata_index_revision));
  assert.equal(snapshot.provenance.metadata_index_source_manifest_digest, snapshot.source_manifest_digest);
  assert.equal(snapshot.gap_scan.state, 'NOT_PUBLISHED', 'NO_INFERRED_EXCHANGE_GAP_SCAN');
  return snapshot;
}

// This is an independent installed-reader oracle, not the product adapter or
// index normalizer. Raw rows never leave this private process or enter Git.
const SOURCE_ORACLE = String.raw`
import hashlib,json,os,sys
from pathlib import Path
import pandas as pd
from portal_api.adapters.market_data import load_vn_stock_daily_qualification_runtime,REQUIRED_MARKET_COLUMNS
from portal_api.services.data_catalog import SnapshotStore
payload=json.load(sys.stdin); meta=payload['snapshot']; rows=payload['replay_rows']
runtime=load_vn_stock_daily_qualification_runtime(os.environ['HISTORICAL_MARKET_DATA_ROOT'])
assert runtime.reader_version=='0.1.0rc3' and runtime.manifest_digest==meta['source_manifest_digest']
store=SnapshotStore(Path(os.getenv('PORTAL_SNAPSHOT_ROOT',str(Path(os.environ['PORTAL_ARTIFACT_ROOT'])/'snapshots'))))
identity,quality,frame=store.open(meta['snapshot_id'])
assert identity.content_hash==meta['snapshot_content_hash'] and quality.passed
start=pd.Timestamp(meta['query']['start_utc_ms'],unit='ms',tz='UTC')
end=pd.Timestamp(meta['query']['end_exclusive_utc_ms'],unit='ms',tz='UTC')
zone='Asia/Ho_Chi_Minh'; chunks=[]; cursor=start; queries=0
while cursor<end:
    boundary=min(end,cursor+pd.Timedelta(days=31))
    left=cursor.tz_convert(zone).tz_localize(None)
    right=boundary.tz_convert(zone).tz_localize(None)-pd.Timedelta(microseconds=1)
    raw=runtime.loader_class().load('FPT',start_date=left.isoformat(),end_date=right.isoformat(),check_val=True)
    assert isinstance(raw,pd.DataFrame) and len(raw)<=31
    queries+=1; assert queries<=100
    if raw.empty:
        cursor=boundary
        continue
    assert all(raw['symbol']=='FPT')
    dates=pd.DatetimeIndex(pd.to_datetime(raw['time'],format='mixed',errors='raise'))
    dates=dates.tz_localize(zone) if dates.tz is None else dates.tz_convert(zone)
    assert not dates.has_duplicates and dates.is_monotonic_increasing and (dates==dates.normalize()).all()
    part=raw.loc[:,REQUIRED_MARKET_COLUMNS].copy(); part.index=dates.tz_convert('UTC').as_unit('ns')
    assert ((part.index>=cursor)&(part.index<boundary)).all()
    chunks.append(part); cursor=boundary
assert chunks, 'QUALIFIED_SOURCE_MUST_CONTAIN_OBSERVATIONS'
separate=pd.concat(chunks)
frame=frame.loc[:,REQUIRED_MARKET_COLUMNS].copy(); frame.index=frame.index.as_unit('ns')
pd.testing.assert_frame_equal(frame,separate,check_dtype=False,check_exact=True,check_names=False,check_freq=False)
logical=pd.Timestamp(meta['logical_range']['start_utc_ms'],unit='ms',tz='UTC')
assert int((frame.index<logical).sum())==300 and len(frame)==meta['row_count']
oos_start=pd.Timestamp(payload['oos_start_utc_ms'],unit='ms',tz='UTC')
oos_end=pd.Timestamp(payload['oos_end_exclusive_utc_ms'],unit='ms',tz='UTC')
oos=separate.loc[(separate.index>=oos_start)&(separate.index<oos_end)]
assert len(rows)==len(oos)>0
for row,(at,values) in zip(rows,oos.iterrows()):
    assert row['at_utc_ms']==int(at.value//1_000_000)
    for field in REQUIRED_MARKET_COLUMNS: assert float(row[field])==float(values[field])
print(json.dumps({'passed':True,'reader_version':runtime.reader_version,'source_manifest_digest':runtime.manifest_digest,
    'snapshot_sha256':identity.content_hash,'snapshot_rows':len(frame),'warmup_bars':300,
    'analysis_bars':len(frame)-300,'source_queries':queries,'oos_rows':len(oos),
    'source_clock':'OBSERVED_SOURCE_LOCAL_DATE_V1','source_timezone':zone,
    'exact_direct_reader_snapshot_and_replay_parity':True,
    'timestamps_sha256':hashlib.sha256(json.dumps([int(x.value//1_000_000) for x in separate.index],separators=(',',':')).encode()).hexdigest()}))
`;

async function replayPages(client, runId) {
  const pages = [], rows = []; let cursor, revision;
  for (let pageIndex = 0; pageIndex < 1_200; pageIndex++) {
    const query = new URLSearchParams({ workspace_id: WORKSPACE, limit: '17', ...(cursor ? { cursor } : {}) });
    const page = await client.call('GET', `/api/v1/quantbt/runs/${runId}/replay/observations?${query}`);
    assert.equal(page.body.availability.state, 'AVAILABLE');
    assert.equal(page.body.execution_profile.id, VN_PROFILE.id);
    assert.equal(page.body.execution_profile.digest, VN_PROFILE.digest);
    assert.equal(page.body.counts.returned, page.body.rows.length);
    assert(page.body.rows.length <= 17 && Buffer.byteLength(JSON.stringify(page.body)) <= 1_048_576);
    revision ??= page.body.revision; assert.equal(page.body.revision, revision);
    for (const row of page.body.rows) {
      assert.equal(row.source_ordinal, rows.length);
      assert(rows.length === 0 || row.at_utc_ms > rows.at(-1).at_utc_ms);
      rows.push(row); assert(rows.length <= 20_000);
    }
    pages.push(page); cursor = page.body.next_cursor;
    if (!cursor) break;
    assert(pageIndex < 1_199, 'BOUNDED_PAGINATION_REQUIRED');
  }
  assert.equal(rows.length, pages[0].body.counts.full_source_retained);
  return { pages, rows };
}

export async function vnFixedProductReceipt(home = DEFAULT_HOME, label = 'b8-vn-fixed-20261002', resumeRunLabel) {
  home = validateHome(home); assert(/^[a-z][a-z0-9-]{0,48}$/.test(label));
  if (resumeRunLabel !== undefined) {
    assert(/^[a-z][a-z0-9-]{0,48}$/.test(resumeRunLabel) && resumeRunLabel !== label,
      'READ_ONLY_RESUME_REQUIRES_A_DISTINCT_PROOF_LABEL');
  }
  const saved = loadSessions(home).identities.find(user => user.username === 'p23-owner');
  assert(saved?.id && saved.password, 'EXISTING_OWNED_TEST_OPERATOR_REQUIRED');
  const client = makeClient({ ...saved, cookies: {} });
  const receipt = { schema_version: 'research.vn-fixed-owned-product-qualification.v1',
    project: PROJECT, base_url: BASE_URL, workspace_id: WORKSPACE, label, passed: false,
    identity: privateJson(join(home, 'identity.json')), started_at_utc: new Date().toISOString(),
    images: Object.fromEntries(['control-api', 'portal-api', 'quant-worker-py'].map(service =>
      [service, docker(['inspect', '--format', '{{.Image}}', container(service)]).trim()])),
    expected_profile: VN_PROFILE, calendar_authority: 'NOT_PUBLISHED', instrument_terms: 'NOT_PUBLISHED' };
  let authenticated = false;
  try {
    await client.call('POST', '/api/auth/login', { username: saved.username, credential: saved.password }, [201]);
    authenticated = true;
    const context = (await client.call('GET', '/api/auth/context')).body;
    assert.equal(context.principal.principalId, saved.id); assert.equal(context.state, 'AUTHENTICATED');
    // A receipt assertion failure after COMPLETED must not waste another engine
    // run or overwrite failed evidence. This explicit path reads a previously
    // completed producer only, with a distinct proof label; it cannot admit.
    let admitted;
    if (resumeRunLabel === undefined) {
      admitted = await admitRealRun(home, 'p04', label, 'p23-owner', client, vnFixedRequestedSpec);
    } else {
      const path = join(home, `run-${resumeRunLabel}.json`);
      const prior = privateJson(path);
      assert.equal(prior.project, PROJECT); assert.equal(prior.profile, 'p04');
      assert.equal(prior.operator, 'p23-owner'); assert(prior.created && /^rrun_[a-z0-9]+$/.test(prior.run_id));
      assert.equal(prior.final?.body.current.effective_status, 'COMPLETED');
      assert.equal(prior.final?.body.current.terminal_materialization, 'READY');
      assert.deepEqual(prior.requested_spec, vnFixedRequestedSpec(prior.binding.body, prior.atlas.body.atlas.current_release));
      admitted = { client, path, receipt: prior };
      receipt.read_only_resume_from = resumeRunLabel;
      receipt.new_run_created = false;
    }
    receipt.run_id = admitted.receipt.run_id; receipt.producer_receipt = admitted.path;
    receipt.declaration_estimate = await client.call('POST', '/api/v1/research/datasets/declaration-estimates',
      { requested_spec: admitted.receipt.requested_spec, workspace_id: WORKSPACE });
    const estimate = receipt.declaration_estimate.body;
    assert.equal(estimate.ready_for_preflight, true, 'QUALIFIED_S02_INDEX_ESTIMATE_REQUIRED');
    assert.equal(estimate.profile_id, VN_PROFILE.id);
    assert.equal(estimate.metadata.earliest_start_basis, 'OBSERVED_INDEXED_WARMUP_BARS_V1');
    assert.equal(estimate.metadata.planned_folds.availability, 'AVAILABLE');
    assert.equal(estimate.metadata.planned_folds.count, 1);
    assert(estimate.metadata.windows.every(row => row.availability === 'AVAILABLE' && row.bars > 0));
    const snapshot = assertVnPreflight(admitted.receipt.preflight.body, admitted.receipt.requested_spec);
    receipt.registry = await client.call('GET', `/api/v1/research/alphas?workspace_id=${WORKSPACE}&alpha_id=${admitted.receipt.binding.body.alpha_id}`);
    const version = receipt.registry.body.entries.find(row => row.alpha_version_id === admitted.receipt.binding.body.alpha_version_id);
    assert(version?.declaration.timeframes.includes('1d') && version.declaration.warmup_bars === 300,
      'ACTUAL_IMMUTABLE_ALPHA_DECLARATION_REQUIRED');
    const finished = resumeRunLabel === undefined
      ? await waitForRun(client, admitted.path, admitted.receipt)
      : { final: await client.call('GET', `/api/v1/research/runs/${receipt.run_id}/progress`) };
    assert.equal(finished.final.body.current.effective_status, 'COMPLETED');
    assert.equal(finished.final.body.current.terminal_materialization, 'READY');
    receipt.producer = dbQuery(`SELECT run_id,job_id,worker_attempt_id,lease_epoch,execution_profile_id,execution_profile_digest,
      requested_spec_digest,effective_spec_digest,dataset_binding_digest,manifest_digest,snapshot_id,snapshot_content_hash,
      work_digest,legacy_request
      FROM research.run_producers WHERE workspace_id=$1 AND run_id=$2`, [WORKSPACE, receipt.run_id]).rows[0];
    assert.equal(receipt.producer.execution_profile_id, VN_PROFILE.id);
    assert.equal(receipt.producer.execution_profile_digest, VN_PROFILE.digest);
    const work = receipt.producer.legacy_request.research;
    const observationKeys = ['clock_basis', 'source_timezone', 'metadata_index_revision',
      'metadata_index_source_manifest_digest', 'metadata_index_as_of_utc_ms', 'warmup_semantics', 'warmup_start_utc_ms'];
    assert.deepEqual(work.source_observation, { ...Object.fromEntries(observationKeys.map(key => [key, snapshot.provenance[key]])),
      dataset_id: 'vn-stock-daily', symbol: 'FPT', timeframe: '1d' });
    const workShape = { schema_version: 'research.p10.vn-observed-fixed-work.v1',
      requested_spec_digest: work.requested_spec_digest, effective_spec_digest: work.effective_spec_digest,
      dataset_binding_digest: work.dataset_binding_digest, manifest_digest: work.manifest_digest,
      snapshot: { snapshot_id: work.snapshot_id, snapshot_content_hash: work.snapshot_content_hash },
      alpha: { alpha_id: work.alpha_id, alpha_version_id: work.alpha_version_id,
        adapter_id: work.execution_adapter_id, adapter_contract_digest: work.adapter_contract_digest,
        fixed_parameters: work.p04_parameters },
      execution_profile: { profile_id: work.execution_profile_id, profile_digest: work.execution_profile_digest },
      source_observation: work.source_observation, engine_release_id: work.requested_spec.client.engine_release_id,
      requested_spec: work.requested_spec };
    assert.equal(createHash('sha256').update(canonical(workShape)).digest('hex'), receipt.producer.work_digest);
    receipt.responses = {};
    for (const [name, suffix] of Object.entries({ hub: 'evidence', report: 'report', split: 'split',
      search: 'search', freeze: 'freeze', replay: 'execute/replay', retained: 'current-source/evidence' })) {
      receipt.responses[name] = await client.call('GET', `/api/v1/quantbt/runs/${receipt.run_id}/${suffix}?workspace_id=${WORKSPACE}`);
    }
    const coverage = receipt.responses.hub.body.core.dataset_coverage;
    assert.equal(coverage.availability.state, 'AVAILABLE');
    assert.equal(coverage.quality_scope, 'OBSERVED_TAPE_INTEGRITY_ONLY');
    assert.equal(coverage.rows, snapshot.row_count);
    assert.equal(coverage.gaps, null, 'NO_INVENTED_EXCHANGE_CALENDAR_COUNTS');
    assert.equal(coverage.missing_bar_count, null);
    assert.deepEqual(coverage.range, {
      start_utc_ms: snapshot.query.start_utc_ms,
      end_exclusive_utc_ms: snapshot.query.end_exclusive_utc_ms,
    });
    assert.deepEqual(receipt.responses.hub.body.enriched_analysis, receipt.responses.report.body.enriched_analysis);
    assert.equal(receipt.responses.retained.body.availability.state, 'NOT_APPLICABLE', 'FIXED_IS_NOT_A_WFO_STUDY');
    receipt.fixed_replay = await replayPages(client, receipt.run_id);
    const replayManifest = receipt.fixed_replay.pages[0].body.manifest;
    for (const key of ['requested_spec_digest', 'effective_spec_digest', 'dataset_binding_digest'])
      assert.equal(replayManifest[key], receipt.producer[key]);
    assert.equal(replayManifest.market_symbol, 'FPT');
    assert(receipt.fixed_replay.rows.every(row => Object.keys(row.positions).length === 1 && Object.hasOwn(row.positions, 'FPT')));
    const oos = admitted.receipt.requested_spec.windows.oos;
    assert.equal(replayManifest.source.oos_start_utc_ms, Date.parse(oos.start));
    assert.equal(replayManifest.source.oos_end_exclusive_utc_ms, Date.parse(oos.end_exclusive));
    receipt.source_oracle = JSON.parse(docker(['exec', '-i', container('portal-api'), 'python', '-c', SOURCE_ORACLE],
      JSON.stringify({ snapshot, replay_rows: receipt.fixed_replay.rows,
        oos_start_utc_ms: Date.parse(oos.start), oos_end_exclusive_utc_ms: Date.parse(oos.end_exclusive) })));
    assert.equal(receipt.source_oracle.passed, true);
    const negatives = { wrong_symbol: { ...admitted.receipt.requested_spec,
      data: { ...admitted.receipt.requested_spec.data, symbol: 'VIC' } },
      wrong_clock: { ...admitted.receipt.requested_spec, windows: { ...admitted.receipt.requested_spec.windows,
        is: { ...admitted.receipt.requested_spec.windows.is, start: '2025-04-01T00:00:00Z' } } } };
    receipt.negatives = {};
    for (const [name, spec] of Object.entries(negatives)) {
      const response = await client.call('POST', '/api/v1/research/preflights', { requested_spec: spec }, [400, 409, 503]);
      assert(response.body.error?.code, 'TYPED_PREFLIGHT_REFUSAL_REQUIRED'); receipt.negatives[name] = response;
    }
    receipt.passed = true; return receipt;
  } finally {
    receipt.owner_session_revoked = false;
    try {
      if (authenticated) {
        await client.call('POST', '/api/auth/logout', {}, [200, 201]); receipt.owner_session_revoked = true;
      }
    } finally {
      receipt.finished_at_utc = new Date().toISOString();
      savePrivate(join(home, `${label}-product-receipt.json`), receipt);
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  vnFixedProductReceipt(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    process.argv.find(arg => arg.startsWith('--label='))?.slice(8),
    process.argv.find(arg => arg.startsWith('--resume-run-label='))?.slice(19)).then(receipt =>
    console.log(`VN fixed product receipt PASS ${receipt.run_id} ${createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`))
    .catch(error => { console.error('VN product receipt refused:', error.message); process.exitCode = 1; });
}
