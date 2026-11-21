// UDB03 actual preview HTTP read oracle; no source, command or business write.
require('reflect-metadata');
const assert=require('node:assert/strict'),{Pool}=require('pg'),{createHash}=require('node:crypto');
const {loadConfig}=require('/opt/control-api/dist/config');
const {AuthService}=require('/opt/control-api/dist/auth/auth.service');
const {Argon2CredentialService}=require('/opt/control-api/dist/auth/argon');
const cfg=loadConfig({...process.env,PREVIEW_AUTO_LOGIN_USERNAME:'claude-preview'});
const ws=cfg.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
let gate='bootstrap';
async function main(){
  assert.equal(cfg.EXECUTION_READ_PROFILE,'retained_review_v1');
  const core=new Pool({connectionString:cfg.DATABASE_URL,max:1});const domain=new Pool({connectionString:cfg.EXECUTION_DATABASE_URL,max:1});
  const auth=new AuthService(core,cfg,new Argon2CredentialService({memoryKib:cfg.ARGON2_MEMORY_KIB,iterations:cfg.ARGON2_ITERATIONS,parallelism:cfg.ARGON2_PARALLELISM}));
  const session=await auth.previewAutoSession();assert(session);
  const checks=[];
  const before=(await domain.query(`SELECT payload_digest,source_as_of,last_successful_refresh_at FROM execution_profile_projection_snapshots ORDER BY environment`)).rows;
  const state=async()=>(await domain.query(`SELECT (SELECT count(*) FROM execution_shared_read_cache)::int AS caches,
    (SELECT count(*) FROM execution_profile_projection_leases)::int AS leases,
    (SELECT count(*) FROM execution_profile_relation_cursors)::int AS cursors,
    (SELECT count(*) FROM execution_durable_mirror_batches)::int AS batches,
    (SELECT count(*) FROM execution_profile_projection_journal)::int AS journal`)).rows[0];
  const initial=await state();
  async function read(name,path,status=200,extra={}){
    gate=name;const start=performance.now();
    const r=await fetch('http://127.0.0.1:4000'+path,{headers:{cookie:`__Host-portal_session=${session.token}`,...extra},signal:AbortSignal.timeout(15000)});
    const text=await r.text(),body=JSON.parse(text);assert.equal(r.status,status,`${name}: ${text.slice(0,240)}`);
    checks.push({name,path,status:r.status,ms:Math.round(performance.now()-start),sha256:createHash('sha256').update(text).digest('hex'),
      bytes:Buffer.byteLength(text),schema:body.schema_version??null,state:body.state??null,response:body});return body;
  }
  try{
    const context=await read('retained-context','/api/v1/execution/retained-review');assert.equal(context.workspace_id,ws);
    assert.equal(context.profiles.length,3);assert.equal(context.upstream_enabled,false);assert.equal(context.permissions.manage,false);
    assert.equal((await core.query('SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id=$1 AND user_id=(SELECT user_id FROM portal_users WHERE username=\'claude-preview\')',[ws])).rows[0].n,0);
    const scope='workspace_id='+encodeURIComponent(ws);
    const fleet=await read('fleet-all',`/api/v1/execution/alphas?${scope}&environment=all&limit=50`);
    assert.equal(fleet.page.total_count,206);assert.equal(fleet.freshness,'STALE');assert(fleet.page.next_cursor);
    const second=await read('fleet-next',`/api/v1/execution/alphas?${scope}&environment=all&limit=50&after=${encodeURIComponent(fleet.page.next_cursor)}`);
    assert.equal(second.page.rows.length,50);
    await read('cursor-wrong-profile',`/api/v1/execution/alphas?${scope}&environment=paper&limit=50&after=${encodeURIComponent(fleet.page.next_cursor)}`,400);
    const bindings=await read('bindings',`/api/v1/execution/broker-bindings?${scope}&environment=paper&limit=20`);assert.equal(bindings.page.total_count,139);
    await read('bindings-sandbox',`/api/v1/execution/broker-bindings?${scope}&environment=sandbox`);
    const live=await read('bindings-live',`/api/v1/execution/broker-bindings?${scope}&environment=live`);assert.equal(live.page.total_count,0);
    const binding=(await domain.query('SELECT binding_id,account_id FROM execution_binding_projection WHERE workspace_id=$1 AND environment=\'paper\' ORDER BY binding_id LIMIT 1',[ws])).rows[0];
    await read('binding-detail',`/api/v1/execution/broker-bindings/${encodeURIComponent(binding.binding_id)}?${scope}&environment=paper`);
    await read('resource-account',`/api/v1/execution/resources/accounts/${encodeURIComponent(binding.account_id)}?${scope}&environment=paper`);
    const portfolios=await read('portfolios',`/api/v1/execution/portfolios?${scope}&environment=all`);assert.equal(portfolios.items.length,2);
    const alpha=(await domain.query('SELECT alpha_id FROM execution_alpha_fleet_projection WHERE workspace_id=$1 ORDER BY alpha_id LIMIT 1',[ws])).rows[0].alpha_id;
    const portfolio=(await domain.query('SELECT fields->>\'portfolio_id\' AS id FROM execution_durable_mirror_current_entities WHERE workspace_id=$1 AND environment=\'paper\' AND relation_key=\'manager.portfolios:portfolios\' ORDER BY entity_key LIMIT 1',[ws])).rows[0].id;
    await read('resource-alpha',`/api/v1/execution/resources/alphas/${encodeURIComponent(alpha)}?${scope}&environment=paper`);
    await read('resource-portfolio',`/api/v1/execution/resources/portfolios/${encodeURIComponent(portfolio)}?${scope}&environment=paper`);
    await read('alpha-query',`/api/v1/execution/alphas/${encodeURIComponent(alpha)}/query-analytics?environment=paper`);
    await read('portfolio-query',`/api/v1/execution/portfolios/${encodeURIComponent(portfolio)}/query-analytics?environment=paper`);
    for(const environment of ['paper','sandbox','live'])await read('stage-'+environment,`/api/v1/execution/screens/${environment}?${scope}`);
    await read('blotter',`/api/v1/execution/screens/blotter?${scope}`);
    await read('source-health',`/api/v1/execution/derivations/source-health?${scope}`);
    await read('screen-contracts','/api/v1/execution/screen-contracts');
    await read('activation-capabilities','/api/v1/execution/activation/capabilities');
    await read('command-tasks','/api/v1/execution/commands/tasks');
    await read('command-catalogue','/api/v1/execution/commands/catalog');
    await read('mirror-integrity','/api/v1/execution/durable-mirror/integrity');
    // Every static alias is tested across all three profiles. Captured rows
    // and uncaptured typed absence are both valid; invalid source rows are not.
    const operations=await read('named-operations','/api/v1/execution/manager/operations');
    for(const operation of operations.operations)for(const environment of ['paper','sandbox','live']){
      const page=await read('named-'+environment+'-'+operation.route_id,`/api/v1/execution/manager/current/${operation.route_id}?environment=${environment}&limit=2`);
      assert(['PARTIAL','UNAVAILABLE'].includes(page.state));assert.equal(page.source_health.freshness,'STALE');assert.equal(page.source_health.completeness,'PARTIAL');
      assert(page.records.length<=2);assert.equal(page.record_basis,'PORTAL_RETAINED_OBSERVATION');
      if(page.page.next_cursor)await read('named-next-'+environment+'-'+operation.route_id,`/api/v1/execution/manager/current/${operation.route_id}?environment=${environment}&limit=2&cursor=${encodeURIComponent(page.page.next_cursor)}`);
    }
    await read('portfolio-capital-ledger',`/api/v1/execution/portfolios/${encodeURIComponent(portfolio)}/capital-ledger?environment=paper`);
    await read('command-center','/api/v1/execution/command-center');
    const account=(await domain.query(`SELECT fields->>'account_id' AS account_id FROM execution_timeseries_history WHERE workspace_id=$1 AND environment='paper'
      AND relation_key='manager.performance:account_equity_snapshots' AND fields->>'account_id' IS NOT NULL GROUP BY fields->>'account_id' ORDER BY count(*) DESC LIMIT 1`,[ws])).rows[0].account_id;
    const chart=await read('account-chart',`/api/v1/execution/views/equity-chart?${scope}&environment=paper&subject_kind=account&subject_id=${encodeURIComponent(account)}&viewport_px=600`);
    assert.equal(chart.panel.state,'STALE');assert.equal(chart.panel.reason_code,'EDS07_RETAINED_RELATION_PARTIAL');
    const point=chart.panel?.data?.series?.[0]?.points?.[0];
    assert(point,'actual retained equity point required');assert.equal(typeof point[0],'number');assert.equal(typeof point[1],'string');
      const oracle=await domain.query(`SELECT fields->>'equity' AS v FROM execution_timeseries_history WHERE workspace_id=$1 AND environment='paper'
        AND profile_id='PAPER_BINANCE_USDM' AND relation_key='manager.performance:account_equity_snapshots' AND fields->>'account_id'=$2
        AND ts=$3::timestamptz`,[ws,account,new Date(point[0]).toISOString()]);assert(oracle.rows.some(row=>row.v===point[1]));
    for(const relation of ['orders','fills'])await read('account-'+relation,`/api/v1/execution/resources/accounts/${encodeURIComponent(account)}/${relation}?${scope}&environment=paper&limit=20`);
    await read('wrong-workspace',`/api/v1/execution/retained-review?workspace_id=ws_wrong`,404);
    await read('wrong-resource',`/api/v1/execution/broker-bindings/missing_binding?${scope}&environment=paper`,404);
    await read('wrong-environment',`/api/v1/execution/broker-bindings/${encodeURIComponent(binding.binding_id)}?${scope}&environment=live`,404);
    await read('browser-profile-selector','/api/v1/execution/retained-review?profile_id=LIVE_BAD',400);
    await read('stream-denied','/api/v1/execution/profiles/paper/stream',404);
    const publication=(await core.query(`SELECT release_candidate_id,workspace_id,approval_id FROM research.release_candidate_publications_v1
      WHERE actor_username='claude-preview' AND state='DELIVERED' ORDER BY published_at DESC LIMIT 1`)).rows[0];assert(publication);
    const rscope='workspace_id='+encodeURIComponent(publication.workspace_id);
    await read('research-publication',`/api/v1/research/release-candidates/${publication.release_candidate_id}/publication?${rscope}`);
    await read('core-r1-explicit-workspace',`/api/v1/execution/governance/approvals/${publication.approval_id}/r1?${rscope}`);
    await read('research-library','/api/v1/quantbt/runs?limit=10');
    // Repeated local views must not advance source snapshot or create intake jobs.
    for(let i=0;i<3;i++)await read('repeat-local-'+i,`/api/v1/execution/resources/alphas/${encodeURIComponent(alpha)}?${scope}&environment=paper`);
    assert.deepEqual((await domain.query(`SELECT payload_digest,source_as_of,last_successful_refresh_at FROM execution_profile_projection_snapshots ORDER BY environment`)).rows,before);
    assert.deepEqual(await state(),initial);
    console.log(JSON.stringify({result:'PASS',candidate:process.env.PORTAL_BUILD_COMMIT,checks,source_state_unchanged:initial,
      accepted_source_clock_preserved:true,profile:cfg.EXECUTION_READ_PROFILE}));
  }catch(error){console.log(JSON.stringify({result:'FAIL',gate,checks}));throw error;
  }finally{await auth.logout(session.token);assert.equal((await core.query('SELECT state FROM auth_sessions WHERE session_id=$1',[session.sessionId])).rows[0].state,'REVOKED');
    console.log(JSON.stringify({session_revoked:session.sessionId}));await Promise.all([core.end(),domain.end()]);}
}
main().catch(error=>{console.error(JSON.stringify({error:'UDB03_READBACK_FAILED',gate,code:error.code??null,message:error.message?.slice(0,400)}));process.exitCode=1;});
