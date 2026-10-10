// Actual named BFF requests against live preview or the isolated restored DB.
// Two ordinary preview sessions on existing identities, revoked in finally.
require('reflect-metadata');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {createHash}=require('node:crypto'),{Pool}=require('pg');
const {loadConfig}=require('/opt/control-api/dist/config');
const {AuthService}=require('/opt/control-api/dist/auth/auth.service');
const {Argon2CredentialService}=require('/opt/control-api/dist/auth/argon');
const {createControlApiApp}=require('/opt/control-api/dist/app');
const {importRetainedStore}=require('/opt/control-api/dist/execution/retained-store-transfer');
const workspace='ws_06G19F61YB8CFR7TEWMS7HQ660';
let activeGate='bootstrap';
async function main(){
  const config=loadConfig({...process.env,PREVIEW_AUTO_LOGIN_USERNAME:'bobby'});
  assert.equal(config.PORTAL_ENV,'local');assert.equal(config.AUTH_MODE,'dev');
  const core=new Pool({connectionString:config.DATABASE_URL,max:1});
  const domain=new Pool({connectionString:config.EXECUTION_DATABASE_URL,max:1});
  const sessions=[],results=[];let app;
  const auth=new AuthService(core,config,new Argon2CredentialService({memoryKib:config.ARGON2_MEMORY_KIB,
    iterations:config.ARGON2_ITERATIONS,parallelism:config.ARGON2_PARALLELISM}));
  const before=(await core.query('SELECT to_jsonb(t)::text AS row FROM auth_sessions t ORDER BY session_id')).rows;
  try{
    if(process.env.UDB_VERIFY_TRANSFERS==='true'){
      activeGate='restored-content-parity';
      for(const prefix of ['current','entities']){
        const path=`/var/lib/udb-transfer/${prefix}`;
        const manifest=JSON.parse(await fs.readFile(path+'.manifest.json','utf8'));
        assert.equal((await domain.query('SELECT count(*)::int AS n FROM execution_retained_imports WHERE import_run_id=$1',[manifest.import_run_id])).rows[0].n,1);
        const verified=await importRetainedStore(domain,core,path);
        console.log(JSON.stringify({result:'PASS_RESTORED_CONTENT_PARITY',import_run_id:verified.import_run_id,
          file_sha256:verified.file_sha256,tables:verified.tables}));
      }
      assert.equal((await domain.query('SELECT count(*)::int AS n FROM execution_durable_mirror_range_rows')).rows[0].n,0);
    }
    const owner=(await core.query("SELECT u.username FROM portal_owner_anchor a JOIN portal_users u USING(user_id) WHERE a.anchor_id='PORTAL_OWNER'")).rows[0];
    assert.equal(owner.username,'bobby');
    const bobby=await auth.previewAutoSession();assert(bobby);sessions.push(bobby);
    config.PREVIEW_AUTO_LOGIN_USERNAME='claude-preview';
    const outsider=await auth.previewAutoSession();assert(outsider);sessions.push(outsider);
    if(process.env.UDB_READBACK_INPROCESS==='true') app=await createControlApiApp({...config,NODE_ENV:'test'},core,domain);
    async function get(name,path,expected,session=bobby){
      activeGate=name;
      const headers=session?{cookie:`__Host-portal_session=${session.token}`} : {};
      let status,body;
      if(app){const r=await app.getHttpAdapter().getInstance().inject({method:'GET',url:path,headers});status=r.statusCode;body=r.body;}
      else{const r=await fetch(`http://127.0.0.1:4000${path}`,{headers,signal:AbortSignal.timeout(10000)});status=r.status;body=await r.text();}
      const json=JSON.parse(body);assert.equal(status,expected,name);
      if(process.env.UDB_RECEIPT_DIR) await fs.writeFile(`${process.env.UDB_RECEIPT_DIR}/${name}.json`,body,{mode:0o600});
      results.push({name,status,schema_version:json.schema_version??null,error_code:json.error?.code??null,
        rows:json.page?.rows?.length??json.items?.length??null,total:json.page?.total_count??null,
        freshness:json.freshness??null,source_as_of:json.source_as_of??null,
        sha256:createHash('sha256').update(body).digest('hex'),
        response:process.env.UDB_SAVE_RESPONSE==='true'?json:undefined});
      return json;
    }
    const scope=`workspace_id=${workspace}`;
    const fleet=await get('fleet-all',`/api/v1/execution/alphas?${scope}&environment=all&limit=50`,200);
    assert.equal(fleet.page.total_count,206);assert.equal(fleet.page.rows.length,50);assert.equal(fleet.freshness,'STALE');
    assert(fleet.page.next_cursor);
    const next=await get('fleet-next',`/api/v1/execution/alphas?${scope}&environment=all&after=${encodeURIComponent(fleet.page.next_cursor)}`,200);
    assert.equal(next.page.rows.length,50);
    const paper=await get('bindings-paper',`/api/v1/execution/broker-bindings?${scope}&environment=paper`,200);
    assert.equal(paper.page.total_count,139);
    const binding=(await domain.query('SELECT binding_id,account_id FROM execution_binding_projection WHERE workspace_id=$1 AND environment=\'paper\' ORDER BY binding_id LIMIT 1',[workspace])).rows[0];
    const detail=await get('binding-detail',`/api/v1/execution/broker-bindings/${encodeURIComponent(binding.binding_id)}?${scope}&environment=paper`,200);
    assert.equal(detail.item.account_id,binding.account_id);
    const sandbox=await get('bindings-sandbox',`/api/v1/execution/broker-bindings?${scope}&environment=sandbox`,200);assert.equal(sandbox.page.total_count,35);
    const live=await get('bindings-live-empty',`/api/v1/execution/broker-bindings?${scope}&environment=live`,200);assert.equal(live.page.total_count,0);
    const portfolios=await get('portfolios',`/api/v1/execution/portfolios?${scope}&environment=all`,200);assert.equal(portfolios.items.length,2);
    await get('wrong-workspace',`/api/v1/execution/alphas?workspace_id=ws_udb_unowned&environment=all`,404);
    await get('outsider-core-denied',`/api/v1/execution/alphas?${scope}&environment=all`,404,outsider);
    await get('missing-account-binding',`/api/v1/execution/broker-bindings/udb_missing_binding?${scope}&environment=paper`,404);
    await get('wrong-binding-profile',`/api/v1/execution/broker-bindings/${encodeURIComponent(binding.binding_id)}?${scope}&environment=live`,404);
    await get('invalid-profile',`/api/v1/execution/broker-bindings?${scope}&environment=canary`,400);
    await get('anonymous',`/api/v1/execution/alphas?${scope}&environment=all`,401,null);
    if(!app) await get('research-library-core','/api/v1/quantbt/runs?limit=10',200,outsider);
    await assert.rejects(domain.query('UPDATE execution_binding_projection SET account_id=account_id WHERE false'),e=>e.code==='42501');
    await assert.rejects(domain.query('SELECT * FROM portal_users LIMIT 1'),e=>e.code==='42P01');
    console.log(JSON.stringify({result:'PASS_ACTUAL_BFF',mode:app?'RESTORED_INPROCESS_BFF':'LIVE_PREVIEW_HTTP',
      workspace,results,runtime_fact_write:'DENIED_42501',identity_in_domain:'ABSENT_42P01',sessions_created:sessions.length}));
  }finally{
    for(const session of sessions) await auth.logout(session.token);
    const states=(await core.query('SELECT state FROM auth_sessions WHERE session_id=ANY($1::text[])',[sessions.map(s=>s.sessionId)])).rows;
    assert.equal(states.length,sessions.length);assert(states.every(s=>s.state==='REVOKED'));
    const originals=(await core.query('SELECT to_jsonb(t)::text AS row FROM auth_sessions t WHERE NOT(session_id=ANY($1::text[])) ORDER BY session_id',[sessions.map(s=>s.sessionId)])).rows;
    assert.deepEqual(originals,before,'original sessions mutated');
    if(app)await app.close();await Promise.all([core.end(),domain.end()]);
    console.log(JSON.stringify({sessions_revoked:sessions.length,original_sessions_unchanged:true,
      review_session_ids:sessions.map(s=>s.sessionId)}));
  }
}
void main().catch(e=>{console.error(JSON.stringify({error:'UDB_BFF_READBACK_FAILED',stage:activeGate,
  code:e.code??null,assertion:e.operator??null,expected:typeof e.expected==='number'?e.expected:undefined,
  actual:typeof e.actual==='number'?e.actual:undefined}));process.exitCode=1;});
