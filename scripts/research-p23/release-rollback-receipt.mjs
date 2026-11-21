#!/usr/bin/env node
/** Roll back the Research Python producer, retaining the compatible Control reader.
 * Never downgrade a strict reader across an additive sealed-payload change.
 * No build, migration, bootstrap, worker admission or volume replacement.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, composeArguments, retainedImageTag, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const READER = 'sha256:edd2229815675e4d84364e0795c8b627024ac5b05a5ac0da32e3ff2981636828';
const CURRENT = 'sha256:66cfd8cfd20f1a8fa156984ed1aad56f321dae0cedcb552b2c89fdb28a31b100';
const PREVIOUS = 'sha256:1e454b125e80275c29adf03d57437ebcbfb968a30c13f7c2f9ee404aeb79eacd';
const OLD_READER = 'sha256:ee6d220ae36bda0b6d0bf7a8fdeabdcfc90201736eae23b75f90c3d96b89d6fd';
const RUN = 'rrun_c3bc2113431102c1715a9d6d28d7b2bf';
const OUTSIDE = ['portal-control-api-1', 'portal-portal-api-1',
  'portal-stable-v1-0-1-control-api-1', 'portal-stable-v1-0-1-portal-api-1',
  'portal-research-preview-control-api-1', 'portal-research-preview-portal-api-1'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashObject = value => sha(JSON.stringify(value));

export function rollbackOverlay(image, templatePath) {
  assert([CURRENT, PREVIOUS].includes(image), 'PINNED_RESEARCH_PRODUCER_IMAGE_REQUIRED');
  assert(typeof templatePath === 'string' && /^\/home\/bobby\/\.local\/state\/portal-research-p23\/[a-zA-Z0-9_/-]+\.template$/.test(templatePath),
    'OWNED_PAUSE_TEMPLATE_REQUIRED');
  return { services: {
    'portal-api': { image:retainedImageTag('portal-api',image), pull_policy:'never' },
    'portal-web': { volumes:[{type:'bind',source:templatePath,target:'/etc/nginx/templates/default.conf.template',read_only:true}] },
  } };
}
export function pauseTemplate(template) {
  assert((template.match(/server\s*\{/g)??[]).length===1, 'EXACT_GATEWAY_SERVER_REQUIRED');
  assert(!template.includes('location = /api/v1/research/runs'), 'EXISTING_EXACT_INTAKE_LOCATION_REFUSED');
  return template.replace(/server\s*\{/,`server {
  # Isolated Research rehearsal only: pause intake, keep historical reads.
  location = /api/v1/research/runs {
    default_type application/json;
    return 503 '{"error":{"code":"RESEARCH_RUN_PRODUCER_UNAVAILABLE","message":"Research intake is paused for maintenance."}}';
  }`);
}
export function assertRollbackPreservation(before, after) {
  assert.deepEqual(after, before, 'ROLLBACK_DATABASE_CUSTODY_OR_EXECUTION_DRIFT');
}
function inventory() {
  const queue = dbQuery(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE state IN ('QUEUED','CLAIMED','RUNNING','CANCEL_REQUESTED'))::int AS active
    FROM research.jobs`).rows[0];
  assert.equal(queue.active, 0, 'DRAIN_REQUIRED_NO_ACTIVE_JOB_MAY_BE_INTERRUPTED');
  const custody = dbQuery(`SELECT
    (SELECT jsonb_agg(jsonb_build_object('id',artifact_id,'revision',artifact_revision,'manifest',manifest_digest)
      ORDER BY artifact_id,artifact_revision) FROM research.artifacts) AS artifacts,
    (SELECT count(*)::int FROM research.artifact_parts) AS part_count,
    (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'run',run_id,'manifest',manifest_digest,'summary',summary) ORDER BY run_id,artifact_revision)::text,'[]'),
      'UTF8')),'hex') FROM research.current_source_seals_v1) AS seals_digest,
    (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]'),'UTF8')),'hex')
      FROM public.pgmigrations m) AS migrations_digest`).rows[0];
  const outside = OUTSIDE.map(name => JSON.parse(docker(['inspect', '--format',
    '{"id":"{{.Id}}","image":"{{.Image}}","running":{{.State.Running}},"restart_count":{{.RestartCount}}}', name])));
  return { queue, custody_digest: hashObject(custody), outside };
}
async function owner(home) {
  const user = loadSessions(home).identities.find(row => row.username === 'p23-owner');
  assert(user?.id && user.password, 'EXISTING_QA_OWNER_REQUIRED');
  // The loopback gateway is recreated during a version transition. Do not
  // reuse an undici socket to its previous process or retry ambiguous POSTs.
  const client = makeClient({ ...user, cookies: {} }, { connectionClose:true });
  await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201]);
  assert.equal((await client.call('GET', '/api/auth/context')).body.principal.principalId, user.id);
  return client;
}
async function historicalReads(client) {
  const responses = [];
  for (const path of [ `/api/v1/research/runs/${RUN}/progress`,
    ...['current-source/evidence','current-source/search','report','current-source/replay?limit=5'].map(p=>`/api/v1/quantbt/runs/${RUN}/${p}`) ]) {
    const response = await client.call('GET', path);
    responses.push({ path, status: response.status });
  }
  return responses;
}
function compose(home, args, override) {
  const result = spawnSync('sudo', ['-n','docker', ...composeArguments(join(home,'preview.env')),
    ...(override ? ['-f',override] : []), ...args], { encoding:'utf8', stdio:'pipe', timeout:150000 });
  if(result.status!==0) {
    const error=new Error('OWNED_VERSION_TRANSITION_FAILED');
    error.diagnostic=String(result.stderr).slice(-65536);throw error;
  }
}
/** Diagnose an immutable payload against both readers without rolling runtime.
 * No payload fields are stripped and no stored seal is modified.
 */
export function readerCompatibilityReceipt(home=DEFAULT_HOME) {
  home=validateHome(home);
  const target=join(home,'sealed-summary-reader-compatibility-20261003.json');
  assert(!existsSync(target),'PRIOR_COMPATIBILITY_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const rows=dbQuery('SELECT manifest_digest,summary FROM research.current_source_seals_v1 WHERE run_id=$1',[RUN]).rows;
  assert.equal(rows.length,1,'EXACT_SEALED_RUN_REQUIRED');
  const program=`const fs=require('node:fs');
    const schema=require('./dist/research/current-source.payload').CurrentSourceSummarySchema;
    const result=schema.safeParse(JSON.parse(fs.readFileSync(0,'utf8')));
    console.log(JSON.stringify({success:result.success,issues:result.success?[]:result.error.issues.map(x=>({
      path:x.path,code:x.code,...(x.keys?{keys:x.keys}:{})}))}));`;
  const input=JSON.stringify(rows[0].summary),before=inventory();
  const old=JSON.parse(docker(['run','--rm','--network','none','--memory','160m','--memory-swap','160m',
    '--cpus','0.25','--pids-limit','32','--label','portal.research.qa=P24-reader-compatibility',
    '-i','--entrypoint','node',OLD_READER,'-e',program],input));
  const current=JSON.parse(docker(['exec','-i',container('control-api'),'node','-e',program],input));
  assertRollbackPreservation(before,inventory());
  assert.equal(current.success,true,'CURRENT_READER_MUST_ACCEPT_SEAL');
  const receipt={schema_version:'research.p24-reader-compatibility.v1',project:PROJECT,run_id:RUN,
    checked_at_utc:new Date().toISOString(),manifest_digest:rows[0].manifest_digest,
    summary_json_sha256:sha(input),old_reader_image:OLD_READER,current_reader_image:READER,
    old_reader:old,current_reader:current,seal_unchanged:true,offline:true,
    old_reader_downgrade_safe:old.success,retain_current_reader_required:!old.success};
  savePrivate(target,receipt);
  console.log(JSON.stringify({old_reader_compatible:old.success,current_reader_compatible:current.success,
    retain_current_reader_required:!old.success,sha256:sha(readFileSync(target))}));
  return receipt;
}
export async function releaseRollbackReceipt(home = DEFAULT_HOME, label = 'version-transition-20261003') {
  home=validateHome(home); assert(/^[a-z][a-z0-9-]{0,40}$/.test(label));
  const target=join(home,`${label}.json`), overlay=join(home,`${label}.override.json`);
  const template=join(home,`${label}.template`);
  assert(!existsSync(target) && !existsSync(overlay) && !existsSync(template), 'PRIOR_REHEARSAL_MUST_NOT_BE_OVERWRITTEN');
  for(const image of [CURRENT,PREVIOUS]) {
    assert.equal(docker(['image','inspect','--format','{{.Id}}',image]).trim(),image);
    docker(['image','tag',image,retainedImageTag('portal-api',image)]);
  }
  const readerId=docker(['inspect','--format','{{.Id}}',container('control-api')]).trim();
  assert.equal(docker(['inspect','--format','{{.Image}}',container('control-api')]).trim(),READER);
  assert.equal(docker(['inspect','--format','{{.Image}}',container('portal-api')]).trim(),CURRENT);
  assert.equal(docker(['ps','-q','--filter',`name=^/${PROJECT}-quant-worker-py-1$`]).trim(),'','WORKER_MUST_BE_OFF');
  const receipt={schema_version:'research.p24-isolated-version-transition.v1',project:PROJECT,base_url:BASE_URL,
    started_at_utc:new Date().toISOString(),current_image:CURRENT,previous_image:PREVIOUS,
    reader_image:READER, reader_container_id:readerId,
    scope:'PYTHON_PRODUCER_ROLLBACK_WITH_CURRENT_SCHEMA_READERS_NO_ENGINE_UPGRADE_OR_PRODUCTION',steps:[],passed:false};
  const before=inventory();receipt.before=before;savePrivate(target,receipt);
  const originalTemplate=docker(['exec',`${PROJECT}-portal-web-1`,'cat','/etc/nginx/templates/default.conf.template']);
  writeFileSync(template,pauseTemplate(originalTemplate),{mode:0o600});chmodSync(template,0o600);
  receipt.pause_scope='EXACT_SAME_ORIGIN_CREATE_ROUTE_AT_OWNED_GATEWAY_ALL_RESEARCH_READ_FLAGS_UNCHANGED';
  receipt.pause_template_sha256=sha(readFileSync(template));
  const update=(image)=>{
    writeFileSync(overlay,JSON.stringify(rollbackOverlay(image,template),null,2)+'\n',{mode:0o600});chmodSync(overlay,0o600);
    compose(home,['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','90','portal-api'],overlay);
    compose(home,['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','90','portal-web'],overlay);
    assert.equal(docker(['inspect','--format','{{.Image}}',container('portal-api')]).trim(),image);
    assert.equal(docker(['inspect','--format','{{.Id}}',container('control-api')]).trim(),readerId,
      'COMPATIBLE_SCHEMA_READER_MUST_NOT_BE_RECREATED');
  };
  try {
    const prior=privateJson(join(home,'run-integrity-original.json'));
    assert(prior.preflight?.body?.preflight_token && prior.requested_spec && prior.client_intent_id,'EXISTING_TYPED_QA_INTENT_REQUIRED');
    for(const [step,image] of [['pause-current',CURRENT],['rollback-previous',PREVIOUS],['forward-current-paused',CURRENT]]) {
      update(image);const client=await owner(home);
      const blocked=await client.call('POST','/api/v1/research/runs',{
        schema_version:'research.run-create.v1',client_intent_id:prior.client_intent_id,
        preflight_token:prior.preflight.body.preflight_token,requested_spec:prior.requested_spec,
      },[503]);
      assert.equal(blocked.body.error?.code,'RESEARCH_RUN_PRODUCER_UNAVAILABLE','PAUSED_INTAKE_MUST_REFUSE');
      const reads=await historicalReads(client),after=inventory();
      assertRollbackPreservation(before,after);
      receipt.steps.push({step,image,at_utc:new Date().toISOString(),intake_status:503,
        reads,custody_digest:after.custody_digest,job_count:after.queue.total,worker_off:true});
      savePrivate(target,receipt);
    }
    receipt.passed=true;
  } catch(error) {
    receipt.failure_code=error.message;
    receipt.failure_cause=error.cause?.code??null;
    if(error.diagnostic) {
      const log=join(home,`${label}.stderr.log`);
      assert(!existsSync(log),'PRIOR_FAILURE_LOG_MUST_NOT_BE_OVERWRITTEN');
      writeFileSync(log,error.diagnostic,{mode:0o600});chmodSync(log,0o600);
      receipt.failure_log_sha256=sha(readFileSync(log));
    }
    throw error;
  } finally {
    // Return to the original exact candidate/config even after a failed read.
    compose(home,['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','90','portal-api']);
    compose(home,['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','90','portal-web']);
    assert.equal(docker(['inspect','--format','{{.Image}}',container('portal-api')]).trim(),CURRENT);
    assert.equal(docker(['inspect','--format','{{.Id}}',container('control-api')]).trim(),readerId);
    const client=await owner(home);receipt.final_reads=await historicalReads(client);
    receipt.after=inventory();assertRollbackPreservation(before,receipt.after);
    receipt.original_configuration_restored=true;receipt.finished_at_utc=new Date().toISOString();savePrivate(target,receipt);
    console.log(JSON.stringify({passed:receipt.passed,restored:true,steps:receipt.steps.length,sha256:sha(readFileSync(target))}));
  }
  return receipt;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  Promise.resolve().then(()=>process.argv.includes('--reader-contract-probe')
    ? readerCompatibilityReceipt(process.argv.find(x=>x.startsWith('--home='))?.slice(7)??DEFAULT_HOME)
    : releaseRollbackReceipt(process.argv.find(x=>x.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
      process.argv.find(x=>x.startsWith('--label='))?.slice(8)))
    .catch(error=>{console.error('Research version rehearsal refused:',error.message);process.exitCode=1;});
}
