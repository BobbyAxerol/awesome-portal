#!/usr/bin/env node
/** Owned, offline source-byte/native-child proof. Does not activate a runtime. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, savePrivate } from './api-client.mjs';
import { validateHome } from './cell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const IMAGE = 'sha256:66cfd8cfd20f1a8fa156984ed1aad56f321dae0cedcb552b2c89fdb28a31b100';
const INPUT = Object.freeze({run_id:'rrun_c3bc2113431102c1715a9d6d28d7b2bf',
  artifact_id:'rart_b0ebb6b61bc853b98a0b84ccadf27c07d3ed5091',
  manifest_digest:'6e6ef7547f247f2ee6c9e87da8ca672159f6f6658abe1f03e08bdaac4f277ccc'});
const sha = value => createHash('sha256').update(value).digest('hex');

export function proofArguments(root, image, name, owner) {
  assert(root === resolve(root) && !root.includes(','), 'ABSOLUTE_SOURCE_ROOT_REQUIRED');
  assert(/^sha256:[a-f0-9]{64}$/.test(image), 'EXACT_LOCAL_IMAGE_REQUIRED');
  assert(/^p23-pinned-audit-[a-f0-9-]{36}$/.test(name) && /^[a-f0-9-]{36}$/.test(owner), 'EXACT_OWNER_ID_REQUIRED');
  return ['run','--rm','--pull','never','--name',name,'--label',`io.primus.audit-proof.owner=${owner}`,
    '--network','none','--read-only','--pids-limit','256','--cpus','2','--memory','1536m','--memory-swap','1536m',
    '--security-opt',`seccomp=${join(root,'deploy/research-preview/seccomp-research-child.json')}`,
    '--security-opt','apparmor=portal-research-child','--security-opt','systempaths=unconfined',
    '--tmpfs','/tmp:rw,nosuid,nodev,size=256m',
    '-v','portal-research-p23-ol12_portal-artifacts:/var/lib/portal/artifacts:ro',
    ...[['apps/portal/backend/src','/workspace/apps/portal/backend/src'],
      ['apps/portal/strategy','/workspace/apps/portal/strategy'],
      ['scripts/research-p23/pinned-audit-child-proof.py','/workspace/proof.py']]
      .flatMap(([source,target])=>['-v',`${join(root,source)}:${target}:ro`]),
    '-e','PYTHONPATH=/workspace/apps/portal/backend/src:/workspace/apps/portal',
    '-e','PYTHONDONTWRITEBYTECODE=1','--entrypoint','python','-i',image,'/workspace/proof.py'];
}

export function acceptProof(value) {
  assert(value?.passed === true && value.scope === 'REAL_HMD_PINNED_CHILD_BELOW_ADMISSION_NOT_PRODUCT_ACCEPTANCE');
  assert.equal(value.parent_run_id, INPUT.run_id); assert.equal(value.parent_artifact_id, INPUT.artifact_id);
  assert.equal(value.parent_manifest_digest, INPUT.manifest_digest);
  assert.equal(value.engine_version,'1.1.1'); assert.equal(value.isolated_network_namespace,true);
  assert.equal(value.audit_receipt?.optimizer_reinvoked,false); assert.equal(value.audit_receipt?.optimizer_trials,0);
  assert(value.audit_receipt.n_folds >= 2 && value.audit_receipt.n_folds <= 16);
  assert.equal(value.audit_receipt.target_digest,value.target_digest);
  assert.equal(value.parent_bytes_unchanged,true); assert.equal(value.scratch_retired,true);
  assert.equal(value.admission_connected,false); assert.equal(value.retention_registered,false);
  assert(value.output_files > 0 && value.output_files <= 64 && value.output_bytes > 0 && value.output_bytes <= 64*1024*1024);
  return value;
}

function docker(args,input,timeout=15000) {
  return execFileSync('sudo',['-n','docker',...args],{input,timeout,encoding:'utf8',maxBuffer:512*1024,stdio:['pipe','pipe','pipe']});
}
function outsideIdentity() {
  const ids=docker(['ps','-q','--filter','label=com.docker.compose.project=portal-research-preview']).trim().split('\n').filter(Boolean);
  assert(ids.length >= 6,'OUTSIDE_PREVIEW_INVENTORY_REQUIRED');
  return ids.map(id=>JSON.parse(docker(['inspect','--format',
    '{"id":{{json .Id}},"image":{{json .Image}},"started_at":{{json .State.StartedAt}},"restarts":{{.RestartCount}}}',id])))
    .sort((a,b)=>a.id.localeCompare(b.id));
}

export function runProof(home=DEFAULT_HOME,label='accepted') {
  home=validateHome(home); assert(/^[a-z][a-z0-9-]{0,32}$/.test(label),'BOUNDED_NEW_RECEIPT_LABEL_REQUIRED');
  const output=join(home,`pinned-audit-child-${label}.json`);
  assert(!existsSync(output),'PRIVATE_RECEIPT_OVERWRITE_REFUSED');
  const owner=randomUUID(),name=`p23-pinned-audit-${randomUUID()}`;
  const receipt={schema_version:'research.p23-pinned-audit-runtime-receipt.v1',passed:false,
    started_at_utc:new Date().toISOString(),image_id:IMAGE,source_lane:'READ_ONLY_SOURCE_MOUNT_NOT_RELEASE_IMAGE',
    source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    source_dirty:execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim()!=='',
    source_sha256:Object.fromEntries(['apps/portal/backend/src/portal_api/domain/research_final_audit.py',
      'apps/portal/backend/src/portal_api/services/research_final_audit.py',
      'apps/portal/backend/src/portal_api/services/research_supervisor.py',
      'apps/portal/backend/src/portal_api/workers/research_child.py',
      'scripts/research-p23/pinned-audit-child-proof.py'].map(path=>[path,sha(readFileSync(join(ROOT,path)))]))};
  let before;
  try {
    assert.equal(docker(['image','inspect','--format','{{.Id}}',IMAGE]).trim(),IMAGE);
    before=outsideIdentity();
    receipt.proof=acceptProof(JSON.parse(docker(proofArguments(ROOT,IMAGE,name,owner),JSON.stringify(INPUT),260000)));
    assert.deepEqual(outsideIdentity(),before,'OUTSIDE_RUNTIME_CHANGED');
    receipt.outside_runtime_unchanged=true; receipt.passed=true;
  } catch(error) {
    receipt.error_code=error.code??error.name;
    if(error.stderr) {
      const path=join(home,`pinned-audit-child-${label}.stderr.log`); assert(!existsSync(path));
      writeFileSync(path,String(error.stderr).slice(-65536),{mode:0o600}); chmodSync(path,0o600);
      receipt.failure_log_sha256=sha(readFileSync(path));
    }
    throw new Error(`PINNED_AUDIT_CHILD_PROOF_FAILED:${receipt.error_code}`);
  } finally {
    let cleanup=true;
    const owned=docker(['ps','-a','-q','--filter',`name=^/${name}$`]).trim();
    if(owned) {
      assert.equal(docker(['inspect','--format','{{index .Config.Labels "io.primus.audit-proof.owner"}}',owned]).trim(),owner);
      docker(['rm','-f',owned]); cleanup=docker(['ps','-a','-q','--filter',`name=^/${name}$`]).trim()==='';
    }
    receipt.owned_test_container_removed=cleanup; receipt.finished_at_utc=new Date().toISOString();
    savePrivate(output,receipt);
    console.log(JSON.stringify({passed:receipt.passed,receipt_sha256:sha(readFileSync(output)),cleanup}));
  }
  return receipt;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { runProof(process.argv.find(x=>x.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
    process.argv.find(x=>x.startsWith('--label='))?.slice(8)??'accepted'); }
  catch(error) { console.error(error.message); process.exitCode=1; }
}
