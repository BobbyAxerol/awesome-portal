#!/usr/bin/env node
/** Owner-approved, read-only public-engine qualification. Not Portal upgrade GO. */
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { savePrivate } from './api-client.mjs';
import { PROJECT, validateHome } from './cell.mjs';

export const CURRENT_IMAGE = 'sha256:7d68b990005ef504176128c83513fce7103c31b8db725979cfc30dcc75ac9700';
export const OLD_IMAGE = 'sha256:9a14f138a7feae74bcab88feaea63d495a5f8312b0d4ed989f9c252571abc717';
const VOLUME = `${PROJECT}_portal-artifacts`;
const sha = raw => createHash('sha256').update(raw).digest('hex');
const docker = args => execFileSync('sudo', ['-n', 'docker', ...args], {encoding:'utf8', timeout:30000});

export function assessEnginePair(old, current) {
  assert.equal(old.engine_version, '1.1.0', 'REAL_OLD_ENGINE_REQUIRED');
  assert.equal(old.native_version, '0.4.1');
  assert.equal(current.engine_version, '1.1.1', 'REAL_CURRENT_ENGINE_REQUIRED');
  assert.equal(current.native_version, '0.4.2');
  for (const field of ['run_id','request_sha256','binding_sha256','manifest_sha256','snapshot_sha256','snapshot_id']) {
    assert.equal(old[field], current[field], `INPUT_PIN_DRIFT:${field}`);
  }
  assert.deepEqual(old.dataset, current.dataset);
  assert.deepEqual(old.windows, current.windows);
  assert.equal(old.original_bytes_unchanged, true);
  assert.equal(current.original_bytes_unchanged, true);
  assert.equal(old.direct.bars, '636');
  assert.equal(current.direct.bars, '636');
  assert.equal(old.portal_gateway.state, 'REFUSED', 'NO_IMPLICIT_OLD_ENGINE_ADMISSION');
  assert.equal(current.portal_gateway.state, 'ACCEPTED');
  const difference = Number(current.direct.final_equity) - Number(old.direct.final_equity);
  assert(Number.isFinite(difference));
  return {
    public_fixed_route: 'QUALIFIED_ON_EXACT_HMD_WINDOW',
    numerical_differences: {final_equity: String(difference),
      num_trades: String(Number(current.direct.num_trades) - Number(old.direct.num_trades))},
    portal_upgrade: 'OPEN_110_NOT_ADMITTED_BY_CURRENT_GATEWAY_OR_P10',
    t07_t13_p24_t05_passed: false,
  };
}

async function main() {
  const home = validateHome(process.argv.find(arg=>arg.startsWith('--home='))?.slice(7)
    ?? '/home/bobby/.local/state/portal-research-p23/20261004/second-engine');
  mkdirSync(home, {recursive:true, mode:0o700});
  const attempt = process.argv.find(arg=>arg.startsWith('--attempt='))?.slice(10) ?? '01';
  assert(/^[0-9]{2}$/.test(attempt), 'BOUNDED_ATTEMPT_ID_REQUIRED');
  const receiptPath=join(home,`second-engine-qualification-attempt${attempt}.json`);
  assert(!existsSync(receiptPath), 'EXISTING_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  assert.equal(docker(['ps','-aq','--filter',`label=com.docker.compose.project=${PROJECT}`]).trim(),'',
    'OWNED_CELL_MUST_ALREADY_BE_DOWN');
  const volume = JSON.parse(docker(['volume','inspect',VOLUME]))[0];
  assert.equal(volume.Name, VOLUME);
  const program = readFileSync(new URL('./second-engine-oracle.py', import.meta.url), 'utf8');
  const receipt = {schema_version:'research.p23-second-engine-qualification.v1',
    source_base_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    started_at_utc:new Date().toISOString(), source_oracle_sha256:sha(program),
    artifact_volume:VOLUME, mount_read_only:true, network:'none',
    production_changed:false, profile_activation:false, original_seal_rewritten:false, runs:[]};
  const names=[];
  try {
    for (const [version,image] of [['1.1.0',OLD_IMAGE], ['1.1.1',CURRENT_IMAGE]]) {
      assert.equal(docker(['image','inspect','--format','{{.Id}}',image]).trim(),image);
      const name=`${PROJECT}-engine-${version.replaceAll('.','')}-20261004-${attempt}`;
      assert.equal(docker(['ps','-aq','--filter',`name=^${name}$`]).trim(),'',
        'EXISTING_CONTAINER_MUST_NOT_BE_TAKEN_OVER');
      names.push(name);
      const result=spawnSync('sudo',['-n','docker','run','--name',name,'--pull=never',
        '--label','primus.research.qualification-only=true','--network=none','--read-only',
        '--memory=2g','--memory-swap=2g','--cpus=2','--pids-limit=128',
        '--cap-drop=ALL','--security-opt=no-new-privileges',
        '--tmpfs','/tmp:rw,nosuid,nodev,size=256m,mode=1777',
        '--mount',`type=volume,source=${VOLUME},target=/var/lib/portal/artifacts,readonly`,
        '-e','NUMBA_CACHE_DIR=/tmp/numba','-e','PYTHONDONTWRITEBYTECODE=1',
        '--entrypoint','python','-i',image,'-',version],
        {input:program, encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
      receipt.runs.push({version,image,exit_code:result.status,
        stderr_sha256:sha(result.stderr??''), error:result.error?.code??null,
        result:result.status===0?JSON.parse(result.stdout):null});
      savePrivate(join(home,`engine-${version}-command-attempt${attempt}.json`),
        {...receipt.runs.at(-1),stdout:result.stdout,stderr:result.stderr});
      savePrivate(receiptPath,receipt);
      assert.equal(result.status,0,`ENGINE_COMMAND_FAILED:${version}`);
    }
    receipt.assessment=assessEnginePair(receipt.runs[0].result,receipt.runs[1].result);
  } finally {
    receipt.cleanup=[];
    for (const name of names) {
      const state=JSON.parse(docker(['inspect','--format','{{json .State}}',name]));
      if (state.Running) docker(['stop','--time','5',name]);
      docker(['rm',name]); // Exact temporary containers only; no volumes/images.
      receipt.cleanup.push({name,removed:true});
    }
    receipt.completed_at_utc=new Date().toISOString();
    savePrivate(receiptPath,receipt);
  }
  console.log(JSON.stringify({receipt:receiptPath,
    sha256:sha(JSON.stringify(receipt,null,2)+'\n'),assessment:receipt.assessment}));
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
