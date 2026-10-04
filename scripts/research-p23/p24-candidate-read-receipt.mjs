#!/usr/bin/env node
/** Real scoped P24 reads on the owned clone. Never production/shared :8095. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { makeClient, privateJson, savePrivate } from './api-client.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const command = process.argv[2];
assert(['prepare', 'measure', 'cleanup'].includes(command), 'EXPLICIT_P24_OPERATION_REQUIRED');
const home = validateHome(process.argv[3]);
const configPath = join(home, 'p24-candidate-scenario-config.json');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

if (command === 'prepare') {
  const username = process.argv[4] ?? 'p23-reader-95';
  assert.match(username, /^p23-reader-[0-9]{2}$/);
  const partial = existsSync(configPath) ? privateJson(configPath) : null;
  if(partial) assert(partial.project===PROJECT && partial.user.username===username && !partial.prepared,
    'ONLY_EXACT_INTERRUPTED_NEW_QA_MAY_RESUME');
  if(!partial) assert.equal(dbQuery('SELECT count(*)::int n FROM portal_users WHERE username=$1', [username]).rows[0].n,
    0, 'EXISTING_IDENTITY_MUST_NOT_BE_RESET');
  let activation;
  if(!partial) {
    const output = docker(['exec', '-i', container('control-api'), 'node', 'dist/cli/bootstrap.js',
      '--file', '/dev/stdin', '--print-one-time-credentials'], `- username: ${username}\n  role: ADMIN\n`);
    activation = output.split('\n').find(line => line.startsWith(`ONE_TIME ${username} `))?.split(' ')[2];
    assert(activation, 'FRESH_OWNED_QA_ACTIVATION_REQUIRED');
  }
  const user = partial?.user ?? { username, password: randomBytes(32).toString('hex'), cookies: {},
    id: dbQuery('SELECT user_id FROM portal_users WHERE username=$1', [username]).rows[0].user_id };
  // Capture the exact new identity before activation, so cleanup remains possible
  // even if authentication fails. Tokens are never logged or versioned.
  savePrivate(configPath, { project: PROJECT, base_url: BASE_URL, origin: BASE_URL, user, prepared: false });
  const client = makeClient(user);
  if(activation) {
    await client.call('POST', '/api/auth/login', { username, credential: activation }, [201]);
    await client.call('POST', '/api/auth/change-password', { current_password: activation, new_password: user.password }, [200, 201]);
  }
  await client.call('POST', '/api/auth/login', { username, credential: user.password }, [201]);
  assert.equal((await client.call('GET', '/api/auth/context')).body.principal.principalId, user.id);
  const rows = dbQuery(`SELECT run_id,workspace_id,research.run_library_display_label(workspace_id,run_id) display_label
    FROM research.run_library_rows_v1 WHERE research.run_library_display_label(workspace_id,run_id)=ANY($1::text[])
    ORDER BY display_label`,
  [['R-WFO-022','R-WFO-023','R-WFO-027','R-P04-022']]).rows;
  assert.equal(rows.length, 4, 'EXACT_FOUR_EXISTING_TEST_RUNS_REQUIRED');
  const workspaces = [...new Set(rows.map(row => row.workspace_id))];
  dbQuery(`INSERT INTO public.workspace_members(workspace_id,user_id,role)
    SELECT w.workspace_id,u.user_id,'MEMBER' FROM public.workspaces w CROSS JOIN public.portal_users u
    WHERE w.workspace_id=ANY($1::text[]) AND u.user_id=$2 AND u.username=$3
    ON CONFLICT(workspace_id,user_id) DO NOTHING`, [workspaces,user.id,username]);
  const imported = dbQuery(`SELECT run_id,workspace_id FROM research.run_producers WHERE run_id=$1`,
    ['rrun_1a6f4a85f2f43a659ac9727607acb6bf']).rows[0];
  if (imported) dbQuery(`INSERT INTO public.workspace_members(workspace_id,user_id,role)
    SELECT workspace_id,$2,'MEMBER' FROM public.workspaces WHERE workspace_id=$1
    ON CONFLICT(workspace_id,user_id) DO NOTHING`, [imported.workspace_id,user.id]);
  const byLabel = Object.fromEntries(rows.map(row => [row.display_label,row]));
  const config = { project: PROJECT, base_url: BASE_URL, origin: BASE_URL, user,
    username, credential_path: configPath, prepared: true, created_at_utc: new Date().toISOString(),
    workspace_id: byLabel['R-WFO-027'].workspace_id,
    runs: { global: byLabel['R-WFO-023'].run_id, causal: byLabel['R-WFO-027'].run_id,
      fixed: byLabel['R-P04-022'].run_id, stale: byLabel['R-WFO-022'].run_id, imported: imported?.run_id ?? null },
    run_bindings: { ...byLabel, ...(imported ? { imported } : {}) }, cleanup_state: 'PENDING_DISABLE_REVOKE' };
  savePrivate(configPath, config);
  console.log(JSON.stringify({ prepared: true, username, scoped_workspaces: workspaces.length,
    credential_output: 'PRIVATE_0600_ONLY', config_path: configPath }));
} else {
  const config = privateJson(configPath);
  assert.equal(config.project, PROJECT); assert.equal(config.base_url, BASE_URL);
  assert.match(config.user.username, /^p23-reader-[0-9]{2}$/);
  assert.equal(dbQuery('SELECT user_id FROM portal_users WHERE username=$1', [config.user.username]).rows[0].user_id, config.user.id);
  if (command === 'cleanup') {
    docker(['exec','-i',container('control-api'),'node','-e',
      `const fs=require('fs');const {Pool}=require('pg');const {loadConfig}=require('./dist/config');const {AuthService}=require('./dist/auth/auth.service');
       const {AdminService}=require('./dist/admin/admin.service');const {Argon2CredentialService}=require('./dist/auth/argon');
       const c=loadConfig(),p=new Pool({connectionString:c.DATABASE_URL,max:1});const id=JSON.parse(fs.readFileSync(0,'utf8')).id;
       (async()=>{const auth=new AuthService(p,c,new Argon2CredentialService({memoryKib:c.ARGON2_MEMORY_KIB,iterations:c.ARGON2_ITERATIONS,parallelism:c.ARGON2_PARALLELISM}));
       const r=await p.query('SELECT status FROM portal_users WHERE user_id=$1',[id]);
       if(r.rows[0]?.status!=='DISABLED')await new AdminService(p,c,auth).disable(id);})().catch(e=>{process.stderr.write(e.name);process.exitCode=1}).finally(()=>p.end());`], JSON.stringify({ id: config.user.id }));
    const state = dbQuery(`SELECT u.status account_state,(SELECT count(*)::int FROM auth_sessions s
      WHERE s.user_id=u.user_id AND s.state='ACTIVE') active_sessions
      FROM portal_users u WHERE user_id=$1`, [config.user.id]).rows[0];
    assert.equal(state.account_state,'DISABLED'); assert.equal(state.active_sessions,0);
    config.cleanup_state='DISABLED_SESSIONS_REVOKED'; config.cleaned_at_utc=new Date().toISOString();
    config.user.cookies={}; delete config.user.password; savePrivate(configPath,config);
    savePrivate(join(home,'p24-candidate-qa-cleanup.json'),{ project:PROJECT,username:config.user.username,...state });
    console.log(JSON.stringify({ cleanup:true,...state }));
  } else {
    assert(config.prepared && config.cleanup_state==='PENDING_DISABLE_REVOKE','ACTIVE_FRESH_QA_REQUIRED');
    const attempt=process.argv[4]??'';
    assert.match(attempt,/^(?:[a-z0-9][a-z0-9-]{0,63})?$/,'SAFE_NAMED_ATTEMPT_REQUIRED');
    const target=join(home,`p24-candidate-read-receipt${attempt?`-${attempt}`:''}.json`);
    assert(!existsSync(target),'PRIOR_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
    const client=makeClient(config.user);
    const output={ schema_version:'research.p24-candidate-read-receipt.v1',project:PROJECT,
      recorded_at_utc:new Date().toISOString(),checks:[],responses:[],passed:false,
      images:Object.fromEntries(['control-api','portal-api'].map(service=>[service,docker(['inspect','--format','{{.Image}}',container(service)]).trim()])) };
    const check=(name,value)=>{output.checks.push({name,passed:!!value});assert(value,name);};
    const custody=()=>Object.fromEntries(['jobs','selection_records','artifacts','current_source_seals_v1',
      'run_report_manifests_v1','release_candidate_packs_v1','release_candidate_publications_v1'].map(table=>[table,
      dbQuery(`SELECT count(*)::int count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n'
        ORDER BY to_jsonb(r)::text),'')) digest FROM research.${table} r
        WHERE workspace_id=ANY($1::text[])`,[[...new Set(Object.values(config.run_bindings).map(r=>r.workspace_id))]]).rows[0]]));
    const before=custody();
    try {
      for(const[label,row]of Object.entries(config.run_bindings)) {
        const suffix=`?workspace_id=${encodeURIComponent(row.workspace_id)}`;
        const get=async kind=>{
          const path=`/api/v1/quantbt/runs/${row.run_id}/${kind}${suffix}`;
          const reply=await client.call('GET',path);
          output.responses.push({label,path,...reply});return reply.body;
        };
        const sparkline=await get('sparkline'); check(`${label}:sparkline_200`,sparkline.run_id===row.run_id);
        const report=await get('report');const rc=await get('release-candidate');
        check(`${label}:audit_applicability_same`,report.final_audit_applicable===rc.final_audit_applicable);
        check(`${label}:report_revision_scope`,report.source_revision_scope==='CAPTURED_READ_REPRESENTATION');
        let sourceManifest;
        for(const kind of label.startsWith('R-WFO-') ? ['split','search','freeze','replay'] : []) {
          const response=await get(`current-source/${kind}`);
          if(response.availability?.state==='AVAILABLE') {
            check(`${label}:${kind}:source_revision`,typeof response.source_revision==='string');
            check(`${label}:${kind}:presentation_revision`,typeof response.presentation_revision==='string');
            sourceManifest=response.provenance?.source_manifest_digest;
          }
        }
        const rcid=rc.local_seal?.release_candidate_id;
        if(rcid) {
          const path=`/api/v1/research/release-candidates/${rcid}/publication${suffix}`;
          const first=await client.call('GET',path);
          await new Promise(resolve=>setTimeout(resolve,1000));
          const second=await client.call('GET',path);
          output.responses.push({label,path,...first},{label,path,...second});
          check(`${label}:publication_clock_stable`,first.body.updated_at_utc_ms===second.body.updated_at_utc_ms);
        }
        const alpha=rc.run?.binding?.alpha_id;
        if(alpha) {
          const path=`/api/v1/research/alphas/${encodeURIComponent(alpha)}/compare?mode=attempts&workspace_id=${encodeURIComponent(row.workspace_id)}`;
          const reply=await client.call('GET',path);output.responses.push({label,path,...reply});
          const entries=reply.body.result?.attempts??[];
          const item=entries.find(item=>item.run_id===row.run_id);
          check(`${label}:compare_has_run`,!!item);
          check(`${label}:compare_named_preflight_scope`,item.provenance.manifest_digest_scope==='PREFLIGHT_DATASET_SPEC');
          if(sourceManifest)check(`${label}:compare_current_artifact_digest`,item.provenance.source_manifest_digest===sourceManifest);
        }
      }
      const after=custody();output.custody_before=before;output.custody_after=after;
      check('all_reads_immutable_custody_jobs_unchanged',JSON.stringify(before)===JSON.stringify(after));
      output.passed=true;
    } finally {
      savePrivate(target,output);savePrivate(configPath,config);
      console.log(JSON.stringify({passed:output.passed,checks:output.checks.length,responses:output.responses.length,
        serialized_receipt_sha256:hash(output),receipt_file_sha256:createHash('sha256').update(readFileSync(target)).digest('hex')}));
    }
  }
}
