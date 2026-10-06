import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BASE_URL, PROJECT, TEST_USERS, composeArguments, executionPreviewBuildArg, validateHome, retainedImageTag, imageReplacements, stampedComposePrefix,selectorTransitionServices } from './cell.mjs';
import {finalReadPlan} from './expanded-final-read-receipt.mjs';
import {ensureOwnedTestSession,ensureOwnedOperatorSession,withOwnedReadSessionRenewal} from './api-client.mjs';
import {receiptMetadata} from './expanded-product-matrix.mjs';
import {assertPreviewActivationIdle,HISTORICAL_UNDISPATCHED_RUN} from '../research-preview/activation-custody.mjs';
import {previewRepresentatives} from './expanded-preview-receipt.mjs';

test('preview probes eight unique recipes, not duplicate high-trial runs that saturate token quota',()=>{
 const ids=['p10.delta-wfo-temporal-1h.v2','p10.delta-pct-equity-mode5-global-4h.v2',
  'p10.imported-wfo-temporal-1h.v2','p10.imported-three-window-optimized-4h.v2','p10.imported-mode5-global-1d.v2',
  'p10.delta-intrabar-bracket-fixed-1h.v3','p10.delta-reactive-fixed-1h.v3','p10.delta-event-driven-fixed-1h.v3'];
 const facts=ids.map((profile_id,i)=>({profile_id,symbol:'BTCUSDT',run_id:`accepted-${i}`}));
 const actual=previewRepresentatives([...facts,{...facts[0],run_id:'same-profile-high-budget'},
  {...facts[1],symbol:'ETHUSDT',run_id:'other-symbol'}]);
 assert.equal(actual.length,8);assert.equal(actual[0].run_id,'accepted-0');
 assert.deepEqual(actual.map(f=>f.profile_id),ids);
 assert.throws(()=>previewRepresentatives(facts.slice(1)),/EXACT_PREVIEW_REPRESENTATIVE_FAMILIES/);
 const source=readFileSync(new URL('./expanded-preview-receipt.mjs',import.meta.url),'utf8');
 assert(source.includes('IMMUTABLE_PREVIEW_RECEIPT'));assert(!source.includes("call('POST','/api/v1/research/runs'"));
});

test('preview activation preserves only the exact historical undispatched P24 fixture',()=>{
 const row={run_id:HISTORICAL_UNDISPATCHED_RUN,run_state:'QUEUED',job_state:'QUEUED',dispatch_state:'PENDING',
  worker_attempt_id:null,attempts:0,run_md5:'a'.repeat(32),job_md5:'b'.repeat(32),producer_md5:'c'.repeat(32)};
 assert.deepEqual(assertPreviewActivationIdle([]),[]);
 assert.deepEqual(assertPreviewActivationIdle([row]),[row]);
 for(const patch of [{run_id:'rrun_new'},{run_state:'RUNNING'},{job_state:'CLAIMED'},
  {dispatch_state:'DISPATCHED'},{worker_attempt_id:'attempt_1'},{attempts:1}])
  assert.throws(()=>assertPreviewActivationIdle([{...row,...patch}]),/PREVIEW_CHILD_IN_FLIGHT/);
 assert.throws(()=>assertPreviewActivationIdle([{...row,job_md5:null}]),/CUSTODY_REQUIRED/);
 assert.throws(()=>assertPreviewActivationIdle([row,row]),/DUPLICATE/);
});

test('qualification cell has its own fixed project, loopback and 20 distinct readers', () => {
  assert.equal(PROJECT, 'portal-research-p23-ol12');
  assert.equal(BASE_URL, 'http://127.0.0.1:8096');
  assert.equal(TEST_USERS.filter(user => user.role === 'USER').length, 20);
  assert.equal(new Set(TEST_USERS.map(user => user.username)).size, 22);
  assert(TEST_USERS.every(user => user.username.startsWith('p23-')));
  assert.equal(TEST_USERS.filter(user => user.owner).length, 1);
});
test('configuration refuses a shared directory and cannot concatenate duplicate sandbox policies', () => {
  assert.throws(() => validateHome('/home/bobby'), /PRIVATE_STATE/);
  assert.throws(() => validateHome('/home/bobby/.config/portal-research-preview'), /PRIVATE_STATE/);
  assert.throws(() => validateHome('/tmp/test'), /PRIVATE_STATE/);
  const home = '/home/bobby/.local/state/portal-research-p23/20260927/runtime';
  assert.equal(validateHome(home), home);
  const args = composeArguments(home + '/preview.env');
  assert.equal(args[2], PROJECT);
  assert.equal(args.filter(arg => arg.endsWith('compose.research-progress.yaml')).length, 1);
  assert(!args.some(arg => arg.endsWith('compose.research-preview.yaml')));
  assert(args.at(-1).endsWith('compose.research-p23-5gb.yaml'));
});
test('sudo-safe test-only Execution UI build arg is explicit and bounded', () => {
  assert.equal(executionPreviewBuildArg(undefined), 'EXECUTION_PREVIEW_ENABLED=false');
  assert.equal(executionPreviewBuildArg('false'), 'EXECUTION_PREVIEW_ENABLED=false');
  assert.equal(executionPreviewBuildArg('true'), 'EXECUTION_PREVIEW_ENABLED=true');
  assert.throws(() => executionPreviewBuildArg('1'), /P23_EXECUTION_PREVIEW_BUILD_ARG_INVALID/);
  assert.throws(() => executionPreviewBuildArg('true --build-arg FEATURE_EXECUTION_COMMAND_RELAY=true'),
    /P23_EXECUTION_PREVIEW_BUILD_ARG_INVALID/);
});
test('FULL02 candidate uses separate named custody, never an older P23 data volume', () => {
  const args = composeArguments('/home/bobby/.local/state/portal-research-p23/20261006/full02/preview.env', 'full02');
  assert(args.at(-1).endsWith('compose.research-full02-cell.yaml'));
  assert.throws(() => composeArguments('/tmp/preview.env', 'other'), /UNKNOWN_QUALIFICATION_SLICE/);
  const yaml = readFileSync(new URL('../../deploy/research-preview/compose.research-full02-cell.yaml', import.meta.url), 'utf8');
  for (const name of ['artifacts', 'postgres', 'nats', 'roadmap']) assert(yaml.includes(`name: portal-research-full02-20261006-${name}`));
  assert(!yaml.includes('external:'));
});
test('FULL04 keeps exact isolated custody and never exposes a shared candidate selector',()=>{
  const args=composeArguments('/home/bobby/.local/state/portal-research-p23/20261006/full04/preview.env','full04');
  assert(args.at(-1).endsWith('compose.research-full04-cell.yaml'));
  const yaml=readFileSync(new URL('../../deploy/research-preview/compose.research-full04-cell.yaml',import.meta.url),'utf8');
  for(const name of ['artifacts','postgres','nats','roadmap'])assert(yaml.includes(`name: portal-research-full04-20261006-${name}`));
  const source=readFileSync(new URL('../research-preview/full04-profile.mjs',import.meta.url),'utf8');
  assert(source.includes('NO_SHARED_PREVIEW_CANDIDATE_SELECTOR'));
  assert(source.includes('assertPreviewActivationIdle(pendingSnapshot())'));
  assert(source.includes('CLAUDE_WEB_IMAGE_MUST_STAY'));
  assert(!source.includes("compose(['build'"));
  assert(!source.includes("'portal-postgres']);"));
});
test('FULL06 only uses its four owned volumes and byte-qualified backend-only preview activation',()=>{
  const args=composeArguments('/home/bobby/.local/state/portal-research-p23/20261006/full06/preview.env','full06');
  assert(args.at(-1).endsWith('compose.research-full06-cell.yaml'));
  const yaml=readFileSync(new URL('../../deploy/research-preview/compose.research-full06-cell.yaml',import.meta.url),'utf8');
  for(const name of ['artifacts','postgres','nats','roadmap'])assert(yaml.includes(`name: portal-research-full06-20261006-${name}`));
  assert(!yaml.includes('external:'));assert(!yaml.includes('ports:'));
  const profile=readFileSync(new URL('../research-preview/full04-profile.mjs',import.meta.url),'utf8');
  assert(profile.includes("'full06'"));assert(profile.includes("'PRODUCT_RUN_QUALIFIED'"));
  assert(profile.includes('NO_SHARED_PREVIEW_CANDIDATE_SELECTOR'));
  assert(profile.includes('CLAUDE_WEB_IMAGE_MUST_STAY'));
});
test('sudo forwards only validated non-secret source stamps to the owned Compose invocation', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(stampedComposePrefix(['docker'], sha, false), ['docker']);
  assert.deepEqual(stampedComposePrefix(['sudo', '-n', 'docker'], sha, false),
    ['sudo', '-n', 'env', `PORTAL_BUILD_COMMIT=${sha}`, 'PORTAL_BUILD_DIRTY=false', 'docker']);
  assert.throws(() => stampedComposePrefix(['sudo', '-E', 'docker'], sha, false));
  assert.throws(() => stampedComposePrefix(['sudo', '-n', 'docker'], 'main SECRET=x', false));
  assert.throws(() => stampedComposePrefix(['docker'], sha, 'false'));
});
test('expanded qualification and rollback stay on one owned cell and preserve preview UI',()=>{
  const args=composeArguments('/home/bobby/.local/state/portal-research-p23/20261006/expanded/preview.env','expanded');
  assert(args.at(-1).endsWith('compose.research-expanded-cell.yaml'));
  const yaml=readFileSync(new URL('../../deploy/research-preview/compose.research-expanded-cell.yaml',import.meta.url),'utf8');
  for(const name of ['artifacts','postgres','nats','roadmap'])assert(yaml.includes(`name: portal-research-expanded-20261006-${name}`));
  assert(!yaml.includes('ports:')&&!yaml.includes('external:'));
  const rollback=readFileSync(new URL('./expanded-rollback-receipt.mjs',import.meta.url),'utf8');
  assert(rollback.includes('EXACT_FAMILY_ADMISSION_OFF'));
  assert(rollback.includes("representatives.length,156"));
  assert(rollback.includes("'RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE'"));
  const selector=readFileSync(new URL('./full05-cell-state.mjs',import.meta.url),'utf8');
  assert(selector.includes("'QUEUED','RUNNING','SEALING'"));
  assert(selector.includes('EXACT_OWNED_CELL'));
  const profile=readFileSync(new URL('../research-preview/full04-profile.mjs',import.meta.url),'utf8');
  assert(profile.includes('PRESERVE_EXISTING_FAMILY_FENCE'));
  assert(profile.includes('CLAUDE_WEB_CONTAINER_MUST_STAY'));
});
test('isolated activation uses private credentials, disables auto-login and adds no Execution authority or ports', () => {
  const source = readFileSync(new URL('../../deploy/research-preview/compose.research-p23-activation.yaml', import.meta.url), 'utf8');
  assert.match(source, /P23_DATABASE_PASSWORD:\?P23/);
  assert.match(source, /PREVIEW_AUTO_LOGIN_USERNAME: ""/);
  assert.match(source, /FEATURE_RESEARCH_ARTIFACT_BYTE_VERIFY: "true"/);
  assert.match(source, /FEATURE_RESEARCH_WHATIF: "true"/);
  assert.match(source, /quant-worker-py:[\s\S]*PORTAL_FEATURE_RESEARCH_WHATIF: "true"/);
  assert.match(source, /quant-worker-py:[\s\S]*RESEARCH_IS_QUALIFICATION_CAPTURE: \$\{RESEARCH_IS_QUALIFICATION_CAPTURE:-false\}/);
  assert(!source.includes('FEATURE_EXECUTION_'));
  assert(!source.includes('ports:'));
  assert(!source.includes('external:'));
});
test('API replacement refreshes only the owned static-DNS gateway', () => {
  const source = readFileSync(new URL('./cell.mjs', import.meta.url), 'utf8');
  assert(source.includes('previousControl && previousControl !== currentControl'));
  assert(source.includes("'--no-deps', '--force-recreate', '--wait', '--wait-timeout', '90', 'portal-web'"));
  assert(!source.includes("'--force-recreate', 'portal-postgres'"));
});
test('active immutable image indexes are retained before export and exact drift is targeted',()=>{
  const a='sha256:'+'a'.repeat(64),b='sha256:'+'b'.repeat(64);
  assert.equal(retainedImageTag('portal-api',a),'local/portal-research-p23-retained-portal-api:'+'a'.repeat(64));
  assert.throws(()=>retainedImageTag('stable',a));
  assert.throws(()=>retainedImageTag('portal-api','latest'));
  assert.deepEqual(imageReplacements([{service:'portal-api',actual:a,desired:b},
    {service:'portal-postgres',actual:a,desired:a}]),['portal-api']);
  assert.throws(()=>imageReplacements([{service:'stable',actual:a,desired:b}]));
  const source=readFileSync(new URL('./cell.mjs',import.meta.url),'utf8');
  assert(source.indexOf("docker(['image','tag'")<source.indexOf("compose(['build'"));
  assert(!source.includes("['image','rm'"));
});
test('final retained parity refuses missing, candidate or different-digest proof without starting children',()=>{
  const expanded={passed:true,facts:Array.from({length:153},(_,i)=>({profile_id:'expanded-'+i,profile_digest:'digest-'+i}))};
  const native={passed:true,facts:Array.from({length:9},(_,i)=>({profile_id:'native-'+i%3,profile_digest:'native-digest-'+i%3}))};
  const unique=[...new Map([...expanded.facts,...native.facts].map(f=>[f.profile_id,f])).values()];
  const table={recipes:unique.map(f=>({...f,descriptor:{schema_version:f.profile_id.startsWith('native-')
    ?'research.native-route-profile.v1':'research.expanded-trial-profile.v1'}})),
    qualification_references:unique.map(f=>({profile_id:f.profile_id,kind:'PRODUCT_RUN_QUALIFIED'}))};
  assert.equal(finalReadPlan(table,expanded,native).length,162);
  assert.throws(()=>finalReadPlan(table,{...expanded,passed:false},native),/PASSED_IMMUTABLE_SUMMARIES/);
  assert.throws(()=>finalReadPlan(table,{...expanded,facts:expanded.facts.slice(1)},native));
  const candidate=structuredClone(table);candidate.qualification_references[0].kind='CANDIDATE_NOT_QUALIFIED';
  assert.throws(()=>finalReadPlan(candidate,expanded,native),/CANDIDATE_READS_ARE_NOT_FINAL/);
  const changed=structuredClone(table);changed.recipes[0].profile_digest='different';
  assert.throws(()=>finalReadPlan(changed,expanded,native),/EXACT_PROFILE_DIGEST/);
  const source=readFileSync(new URL('./expanded-final-read-receipt.mjs',import.meta.url),'utf8');
  assert(!source.includes("client.call('POST'"));
});
test('session renewal never bypasses identity mismatch or a non-login refusal',async()=>{
  const home='/home/bobby/.local/state/portal-research-p23/20261006/expanded';
  const client=state=>({user:{username:'p23-reader-01',id:'test-reader-id'},
    call:async(method,path)=>{assert.equal(method,'GET');assert.equal(path,'/api/auth/context');return {body:state};}});
  await ensureOwnedTestSession(client({state:'AUTHENTICATED',principal:{principalId:'test-reader-id'}}),home);
  await assert.rejects(ensureOwnedTestSession(client({state:'AUTHENTICATED',principal:{principalId:'other'}}),home));
  await assert.rejects(ensureOwnedTestSession(client({state:'ACCESS_DENIED'}),home));
  await assert.rejects(ensureOwnedOperatorSession(client({state:'AUTHENTICATED',principal:{principalId:'test-reader-id'}}),home),/OWNED_OPERATOR_ONLY/);
  await assert.rejects(ensureOwnedTestSession({...client({}),user:{username:'p23-reader-99',id:'other'}},home),/OWNED_TEST_PRINCIPAL_ONLY/);
});
test('matrix index preserves exact proof predicates without retaining large responses or credentials',()=>{
  const record={profile_id:'recipe',profile_digest:'digest',passed:true,
    run:{requested_spec:{data:{symbol:'ETHUSDT'},optuna_trials:100}},
    identity:{images:{'quant-worker-py':{image_id:'worker'}}},reads:{large:'must not persist in index'},password:'not retained'};
  assert.deepEqual(receiptMetadata(record),{profile_id:'recipe',profile_digest:'digest',symbol:'ETHUSDT',
    passed:true,trials:100,worker_image:'worker'});
  assert.equal(receiptMetadata({...record,symbol:'SOLUSDT'}).symbol,'SOLUSDT');
});
test('selector-only transition cannot bypass new images/migrations or change another cell',()=>{
 const a='sha256:'+'a'.repeat(64),b='sha256:'+'b'.repeat(64);
 const rows=['portal-web','control-api','portal-api','quant-worker-py','portal-postgres','portal-nats','roadmap-task-board-api']
  .map(service=>({service,actual:a,desired:a}));
 assert.deepEqual(selectorTransitionServices('expanded',rows),['control-api','portal-api','quant-worker-py']);
 assert.throws(()=>selectorTransitionServices('full06',rows),/EXACT_EXISTING_EXPANDED_CELL/);
 assert.throws(()=>selectorTransitionServices('expanded',rows.slice(1)),/EXACT_EXISTING_EXPANDED_CELL/);
 assert.throws(()=>selectorTransitionServices('expanded',rows.map((r,i)=>i===1?{...r,desired:b}:r)),/SKIP_IMAGE_MIGRATION/);
});
test('new product proofs append after the already applied native editions',()=>{
 const source=readFileSync(new URL('../../packages/contracts/tooling/generate-research-expanded-native-qualification.mjs',import.meta.url),'utf8');
 assert(source.includes("'research.expanded-trial-profile.v1','115'"));
 assert(source.includes("'research.native-route-profile.v1','114'"));
 assert(!source.includes("'research.expanded-trial-profile.v1','110'"));
});
test('long owned reads renew one SESSION_REQUIRED GET without retrying POSTs or other refusals',async()=>{
 const home='/home/bobby/.local/state/portal-research-p23/20261006/expanded';
 const path='/api/v1/research/runs/rrun_test/progress';
 let calls=0;
 const base={user:{username:'p23-owner',id:'owner'},call:async(method,url)=>{
  if(url==='/api/auth/context')return {body:{state:'AUTHENTICATED',principal:{principalId:'owner'}}};
  calls++;if(calls===1)throw new Error(`P23_API:${method}:${url}:401:SESSION_REQUIRED`);
  return {status:200,body:{}};
 }};
 const client=withOwnedReadSessionRenewal(base,home);
 assert.equal((await client.call('GET',path)).status,200);assert.equal(calls,2);
 assert.equal(client.sessionRenewals.length,1);assert.equal(client.sessionRenewals[0].path,path);
 for(const [method,reason]of [['POST','SESSION_REQUIRED'],['GET','ACCESS_DENIED'],['GET','CSRF_REQUIRED']]){
  let attempts=0;
  const refused=withOwnedReadSessionRenewal({...base,call:async(m,u)=>{attempts++;throw new Error(`P23_API:${m}:${u}:401:${reason}`);}},home);
  await assert.rejects(refused.call(method,path),new RegExp(reason));assert.equal(attempts,1);
 }
 const mismatch=withOwnedReadSessionRenewal({...base,call:async(m,u)=>{
  if(u==='/api/auth/context')return {body:{state:'AUTHENTICATED',principal:{principalId:'foreign'}}};
  throw new Error(`P23_API:${m}:${u}:401:SESSION_REQUIRED`);
 }},home);
 await assert.rejects(mismatch.call('GET',path),/EXACT_OWNED_TEST_PRINCIPAL_REQUIRED/);
});
