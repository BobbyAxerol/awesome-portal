#!/usr/bin/env node
/** Fresh engine→P05→named BFF proof, only the owned :8096 cell. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { admitRealRun, waitForRun } from './real-run.mjs';
import { container, docker } from './runtime-tools.mjs';

const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const WIRE_MAX = 1_048_576;
export function validateOrderedPage(page, kind, previousOrdinal = -1) {
  assert(Buffer.byteLength(JSON.stringify(page)) <= WIRE_MAX);
  assert.equal(page.availability.state, 'AVAILABLE');
  assert.equal(page.counts.returned, page.rows.length);
  assert(page.rows.length <= 200);
  const key = kind === 'fixed' ? 'source_ordinal' : 'audit_ordinal';
  for (const row of page.rows) {
    assert(Number.isSafeInteger(row[key]) && row[key] > previousOrdinal);
    previousOrdinal = row[key];
    if (kind === 'fixed') {
      assert(row.at_utc_ms >= page.manifest.source.oos_start_utc_ms);
      assert(row.at_utc_ms < page.manifest.source.oos_end_exclusive_utc_ms);
      for (const field of ['open','high','low','close','volume','equity','return_fraction','drawdown_fraction']) {
        assert(typeof row[field] === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(row[field]), field);
      }
    }
  }
  return previousOrdinal;
}
async function allPages(client, path, kind) {
  const pages = [], rows = []; let cursor, ordinal = -1, revision;
  // The real WFO emits twelve audit rows here: five per page exercises opaque
  // continuation rather than calling a single page a pagination receipt.
  const limit = kind === 'audit' ? 5 : 37;
  const pageBound = Math.ceil(20_000 / limit) + 1;
  for (let count = 0; count < pageBound; count++) {
    const suffix = new URLSearchParams({ workspace_id: WORKSPACE, limit: String(limit), ...(cursor ? { cursor } : {}) });
    const response = await client.call('GET', `${path}?${suffix}`), page = response.body;
    ordinal = validateOrderedPage(page, kind, ordinal);
    if (revision !== undefined) assert.equal(page.revision, revision);
    revision = page.revision; rows.push(...page.rows); pages.push(response);
    cursor = page.next_cursor;
    if (!cursor) break;
    assert(count + 1 < pageBound, 'PAGING_CYCLE_OR_BOUND_EXCEEDED');
  }
  assert.equal(rows.length, pages[0].body.counts.full_source_retained);
  return { pages, rows, rows_response_digest: hash(rows) };
}
function fixedOracle(rows, block) {
  assert.equal(rows.length, block.scope.observation_count);
  const first = rows[0], last = rows.at(-1), basis = block.library_summary.return_basis;
  assert.equal(first.at_utc_ms, basis.first_at_utc_ms); assert.equal(last.at_utc_ms, basis.last_at_utc_ms);
  assert.equal(first.equity, basis.start_equity); assert.equal(last.equity, basis.end_equity);
  assert(Math.abs(Number(block.library_summary.return_fraction) - (Number(last.equity)/Number(first.equity)-1)) < 1e-12);
  const closes = new Map(rows.map(row => [Math.floor(row.at_utc_ms/86_400_000), Number(row.equity)]));
  const days = [...closes.keys()]; let previous; const dailyCloses = [];
  for (let day = days[0]; day <= days.at(-1); day++) { previous = closes.get(day) ?? previous; dailyCloses.push(previous); }
  const returns = dailyCloses.slice(1).map((v,i) => v/dailyCloses[i]-1);
  const quantile = (values, p) => { const sorted = [...values].sort((a,b)=>a-b), x = (sorted.length-1)*p, low = Math.floor(x);
    return sorted[low] + (sorted[Math.min(low+1,sorted.length-1)]-sorted[low])*(x-low); };
  const losses = returns.map(value=>-value), var95 = quantile(losses,.95), tail = losses.filter(value=>value>=var95);
  const expected = { mean: returns.reduce((a,b)=>a+b,0)/returns.length, median: quantile(returns,.5),
    var_95: var95, cvar_95: tail.reduce((a,b)=>a+b,0)/tail.length };
  assert.equal(returns.length, block.return_distribution.observation_count);
  for (const [key,value] of Object.entries(expected)) {
    assert.equal(block.return_distribution[key].state, 'AVAILABLE');
    assert(Math.abs(Number(block.return_distribution[key].value)-value)<1e-12, `${key}_FULL_OOS_ORACLE`);
  }
  return { definition: 'RAW_FIXED_OOS_FIRST_LAST_AND_UTC_DAILY_TYPE7_SIGNED_LOSS_V1',
    source_rows: rows.length, daily_returns: returns.length, tolerance: '0.000000000001' };
}
export async function freshSourceReceipt(home = DEFAULT_HOME, label = 'b8-fresh-source-20261002') {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,48}$/.test(label));
  const saved = loadSessions(home).identities.find(row=>row.username==='p23-owner');
  assert(saved?.id && saved.password, 'RETAINED_OWNER_ANCHOR_REQUIRED');
  const user = { ...saved, cookies: {} }, client = makeClient(user);
  const receipt = { schema_version: 'research.b8-fresh-source-owned-api.v1', project: PROJECT, base_url: BASE_URL,
    at_utc: new Date().toISOString(), workspace_id: WORKSPACE, label,
    images: Object.fromEntries(['control-api','portal-api','quant-worker-py'].map(service=>
      [service,docker(['inspect','--format','{{.Image}}',container(service)]).trim()])), runs: [], passed: false };
  let authenticated = false;
  const read = (runId, suffix, query = {}) => client.call('GET', `/api/v1/quantbt/runs/${runId}/${suffix}?${new URLSearchParams({workspace_id:WORKSPACE,...query})}`);
  try {
    await client.call('POST','/api/auth/login',{username:user.username,credential:user.password},[201]); authenticated=true;
    const context = (await client.call('GET','/api/auth/context')).body;
    assert.equal(context.principal.principalId,saved.id); assert.equal(context.state,'AUTHENTICATED');
    for (const profile of ['p04','wfo']) {
      const admitted = await admitRealRun(home,profile,`${label}-${profile}`,'p23-owner',client);
      const run = await waitForRun(client,admitted.path,admitted.receipt);
      assert.equal(run.final.body.current.effective_status,'COMPLETED');
      const runId=run.run_id, record = {profile,run_id:runId,producer_receipt:admitted.path,responses:{}};
      receipt.runs.push(record);
      record.responses.hub=await read(runId,'evidence');
      record.responses.report=await read(runId,'report');
      const block=record.responses.hub.body.enriched_analysis;
      assert(block,'FRESH_SOURCE_ENRICHMENT_REQUIRED'); assert.equal(block.run_id,runId);
      assert.deepEqual(record.responses.report.body.enriched_analysis,block); assert.equal(block.rolling,null);
      if (profile==='p04') {
        assert.equal(block.windows.is.state,'AVAILABLE'); assert.equal(block.windows.holdout.state,'NOT_PUBLISHED');
        assert.equal(block.by_window.is.scope.observation_count,168);
        assert.equal(block.by_window.is.scope.coverage,'FULL_SOURCE_IS');
        assert.equal(block.by_window.is.benchmark.state,'AVAILABLE');
        assert.equal(block.by_window.is.scope.start_ms,1780272000000); assert.equal(block.by_window.is.scope.end_ms,1780876800000);
        assert.equal(block.scope.observation_count,168);
        record.fixed_replay=await allPages(client,`/api/v1/quantbt/runs/${runId}/replay/observations`,'fixed');
        assert.equal(record.fixed_replay.rows.length,168);
        record.oracle=fixedOracle(record.fixed_replay.rows,block);
        const ordinal=record.fixed_replay.rows[71].source_ordinal;
        const exact=await read(runId,'replay/observations',{source_ordinal:String(ordinal),limit:'1'});
        assert.deepEqual(exact.body.rows,[record.fixed_replay.rows[71]]); record.exact=exact;
      } else {
        assert(!block.by_window,'NO_WFO_IS_RECONSTRUCTION');
        record.responses.search=await read(runId,'current-source/search');
        record.responses.freeze=await read(runId,'current-source/freeze');
        const clocks=record.responses.search.body.stage_events;
        assert.equal(clocks.semantics,'PORTAL_ORCHESTRATION_NOT_ENGINE_SEARCH_FREEZE_OR_OOS_READ');
        assert(clocks.source_binding_digest && clocks.s3_completed_utc_ms && clocks.s4_completed_utc_ms);
        assert.equal(record.responses.search.body.pool.frozen_at_utc_ms,null);
        assert.equal(record.responses.search.body.pool.frozen_at_reason_code,'QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_POOL_FREEZE_CLOCK');
        record.child_audit=await allPages(client,`/api/v1/quantbt/runs/${runId}/current-source/child-audit-companion`,'audit');
        const manifest=record.child_audit.pages[0].body.manifest;
        assert.equal(manifest.source_record_count,record.child_audit.rows.length);
        assert.equal(manifest.authority,'SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK');
        const ordinal=record.child_audit.rows[0]?.audit_ordinal;
        if (ordinal!==undefined) {
          record.exact=await read(runId,'current-source/child-audit-companion',{audit_ordinal:String(ordinal),limit:'1'});
          assert.deepEqual(record.exact.body.rows,[record.child_audit.rows[0]]);
        }
      }
      savePrivate(join(home,'b8-fresh-source-receipt.json'),receipt);
    }
    receipt.passed=true; return receipt;
  } finally {
    if(authenticated) await client.call('POST','/api/auth/logout',{},[200,201]);
    receipt.owner_session_revoked=authenticated; receipt.finished_at_utc=new Date().toISOString();
    savePrivate(join(home,'b8-fresh-source-receipt.json'),receipt);
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const home=process.argv.find(arg=>arg.startsWith('--home='))?.slice(7)??DEFAULT_HOME;
  const label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)??'b8-fresh-source-20261002';
  freshSourceReceipt(home,label).then(receipt=>console.log(`Owned fresh fixed/WFO receipt PASS ${hash(receipt)}`))
    .catch(error=>{console.error('Fresh source receipt refused:',error.message);process.exitCode=1;});
}
