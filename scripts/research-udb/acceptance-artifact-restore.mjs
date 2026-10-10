#!/usr/bin/env node
/** Independent byte restore of the ORIGINAL preview backup, never a claim
 * that later, disposable load-test output was in that earlier archive. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {VERIFY_ARTIFACTS} from '../research-p23/restore-receipt.mjs';
import {SOURCE,PROJECT,HOME,docker,readPrivate,privateWrite} from './acceptance-cell.mjs';
const volume=PROJECT+'_artifact-restore',input=readPrivate('inputs.json');
assert(readPrivate('source-after.json').passed,'UNCHANGED_ORIGINAL_PREVIEW_CUSTODY_REQUIRED');
assert.equal(docker(['volume','ls','-q','--filter','name=^'+volume+'$']).trim(),'','FRESH_EXACT_VOLUME_REQUIRED');
const archive=readFileSync(join(HOME,'artifacts.tar.gz'));
assert.equal(createHash('sha256').update(archive).digest('hex'),input.artifact_archive_sha256);
const facts=JSON.parse(docker(['exec','-i',SOURCE+'-control-api-1','node','-'],`
const {Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,max:1});try{
await p.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const artifacts=(await p.query("SELECT workspace_id,run_id,artifact_id,artifact_revision,manifest_digest FROM research.artifacts WHERE state='SEALED' ORDER BY artifact_id")).rows;
const parts=(await p.query("SELECT p.* FROM research.artifact_parts p JOIN research.artifacts a USING(workspace_id,artifact_id) WHERE a.state='SEALED' ORDER BY artifact_id,table_kind,part_ordinal")).rows;
await p.query('COMMIT');console.log(JSON.stringify({artifacts,parts}));}finally{await p.end();}})();`));
for(const a of facts.artifacts){a.artifact_revision=Number(a.artifact_revision);assert(Number.isSafeInteger(a.artifact_revision)&&a.artifact_revision>0);}
assert(facts.artifacts.length>0);docker(['volume','create','--label','udb04.owner='+PROJECT,volume]);
try{
  assert.equal(docker(['volume','inspect','-f','{{index .Labels "udb04.owner"}}',volume]).trim(),PROJECT);
  docker(['run','--rm','-i','--network','none','--label','udb04.owner='+PROJECT,'--memory','150000000',
    '--memory-swap','150000000','--pids-limit','64','-v',volume+':/restore','--entrypoint','tar',
    input.images['portal-postgres'],'-C','/restore','-xzf','-'],archive);
  const restored=JSON.parse(docker(['run','--rm','-i','--network','none','--label','udb04.owner='+PROJECT,
    '--memory','350000000','--memory-swap','350000000','--pids-limit','64','--read-only','--user','0:0',
    '-v',volume+':/owned-artifacts:ro',input.images['portal-api'],'python','-c',VERIFY_ARTIFACTS],JSON.stringify(facts)));
  assert.equal(restored.verified.length,facts.artifacts.length);assert.equal(restored.missing_manifests.length,0);
  privateWrite('original-artifact-restore.json',{passed:true,scope:'ORIGINAL_PREVIEW_BACKUP_NOT_LATER_DISPOSABLE_LOAD_OUTPUT',
    archive_sha256:input.artifact_archive_sha256,...restored,denominator:facts.artifacts.length,
    later_test_outputs_backed_up:false,source_volume_mounted:false,temporary_volume:volume});
  console.log(JSON.stringify({passed:true,scope:'ORIGINAL_PREVIEW_BACKUP',manifests:restored.verified.length,
    files:restored.file_count,bytes:restored.bytes}));
}finally{
  assert.equal(docker(['volume','inspect','-f','{{index .Labels "udb04.owner"}}',volume]).trim(),PROJECT);
  docker(['volume','rm',volume]);
}
