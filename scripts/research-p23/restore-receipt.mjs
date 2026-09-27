#!/usr/bin/env node
/** Coherent owned DB + artifact restore. Original volumes are never deleted. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, composeArguments, validateHome } from './cell.mjs';
import { docker } from './runtime-tools.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const SERVICES = ['portal-postgres', 'portal-nats', 'portal-api', 'control-api',
  'roadmap-task-board-api', 'portal-web', 'quant-worker-py'];
const ORIGINAL_DB = `${PROJECT}_portal-postgres-data`;
const ORIGINAL_ARTIFACTS = `${PROJECT}_portal-artifacts`;
const ARTIFACT_TARGET = '/var/lib/portal/artifacts';
const PG = `${PROJECT}-portal-postgres-1`;

export function restoreVolumes(label) {
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_RESTORE_LABEL_REQUIRED');
  return { db: `${PROJECT}-restore-${label}-db`, artifacts: `${PROJECT}-restore-${label}-artifacts` };
}
export function assertFreshRestoreTarget(name, label, mounts, tableCount) {
  const fresh = restoreVolumes(label);
  assert.equal(name, fresh.db, 'EXACT_FRESH_RESTORE_DB_REQUIRED');
  assert(name !== ORIGINAL_DB && mounts.some(m => m.Name === name && m.Destination === '/var/lib/postgresql/data'),
    'RESTORE_MUST_NOT_TARGET_ORIGINAL_VOLUME');
  assert.equal(tableCount, 0, 'RESTORE_TARGET_MUST_BE_EMPTY');
}
export function globalsForFreshPortalDatabase(text) {
  assert(text.includes('CREATE ROLE portal;'), 'EXPECTED_EXISTING_PORTAL_ROLE_REQUIRED');
  assert(!/\bPASSWORD\s+/i.test(text), 'ROLE_PASSWORD_COPY_REFUSED');
  return text.replace(/^CREATE ROLE portal;$/m, '-- portal was created by this fresh isolated database initdb.');
}
export function assertRestoreParity(before, after) {
  assert.deepEqual(after, before, 'COHERENT_DATABASE_ARTIFACT_RESTORE_MISMATCH');
}
// pg_dump reparses CHECK expressions. PostgreSQL flattens associative AND
// nodes during that parse: byte-identical pg_get_constraintdef output is not
// promised across a restore. Canonicalize with PostgreSQL's OWN parser on
// empty temporary tables, not by deleting parentheses/terms in JavaScript.
// No persisted object, row, role or migration is changed. Foreign keys and
// constraint flags remain exact, and every table/type/name stays scoped.
export const CONSTRAINT_INVENTORY_SQL = String.raw`
CREATE TEMP TABLE p23_constraint_inventory(schema text,table_name text,type_name text,name text,
  contype text,convalidated boolean,condeferrable boolean,condeferred boolean,definition text);
DO $p23$
DECLARE r record; normalized text;
BEGIN
  FOR r IN SELECT n.nspname AS schema,coalesce(t.relname,'') AS table_name,
    coalesce(y.typname,'') AS type_name,c.conname AS name,c.contype,c.convalidated,c.condeferrable,c.condeferred,
    c.conrelid,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    LEFT JOIN pg_class t ON t.oid=c.conrelid LEFT JOIN pg_type y ON y.oid=c.contypid
    WHERE n.nspname IN ('public','research') ORDER BY n.nspname,t.relname,y.typname,c.conname
  LOOP
    normalized:=r.definition;
    IF r.contype='c' AND r.conrelid<>0 THEN
      EXECUTE format('CREATE TEMP TABLE p23_check_parser (LIKE %I.%I)',r.schema,r.table_name);
      EXECUTE format('ALTER TABLE p23_check_parser ADD CONSTRAINT p23_check_parser_fact %s',r.definition);
      SELECT pg_get_constraintdef(c.oid) INTO STRICT normalized FROM pg_constraint c
        WHERE c.conrelid='pg_temp.p23_check_parser'::regclass AND c.conname='p23_check_parser_fact';
      DROP TABLE p23_check_parser;
    END IF;
    INSERT INTO p23_constraint_inventory VALUES(r.schema,r.table_name,r.type_name,r.name,
      r.contype,r.convalidated,r.condeferrable,r.condeferred,normalized);
  END LOOP;
END $p23$;
SELECT coalesce(json_agg(s ORDER BY schema,table_name,type_name,name,definition),'[]')
  FROM p23_constraint_inventory s;
`;
function pgJson(sql) {
  const result = docker(['exec', PG, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-U', 'portal', '-d', 'portal_control', '-c', sql]).trim();
  return JSON.parse(result);
}
async function hashCommand(args) {
  const hash = createHash('sha256'); let bytes = 0;
  const child = spawn('sudo', ['-n', 'docker', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { hash.update(chunk); bytes += chunk.length; });
  child.stderr.resume(); // Never log source rows/SQL errors into a public receipt.
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`P23_HASH_COMMAND_FAILED:${code}`)));
  });
  return { sha256: hash.digest('hex'), bytes };
}
async function databaseSnapshot() {
  const tables = pgJson(`SELECT coalesce(json_agg(s ORDER BY table_schema,table_name),'[]')
    FROM (SELECT table_schema,table_name FROM information_schema.tables
      WHERE table_schema IN ('public','research') AND table_type='BASE TABLE') s`);
  const data = [];
  for (const table of tables) {
    assert(/^(public|research)$/.test(table.table_schema) && /^[a-z][a-z0-9_]*$/.test(table.table_name), 'SAFE_OWNED_TABLE_REQUIRED');
    const name = `"${table.table_schema}"."${table.table_name}"`;
    // Streams to a hash, never collects rows/password hashes in host memory/output.
    const digest = await hashCommand(['exec', PG, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
      '-U', 'portal', '-d', 'portal_control', '-c', `SET timezone TO 'UTC';
      COPY (SELECT to_jsonb(t)::text AS row FROM ${name} t ORDER BY to_jsonb(t)::text COLLATE "C") TO STDOUT`]);
    data.push({ table: `${table.table_schema}.${table.table_name}`, ...digest });
  }
  const roles = pgJson(`SELECT coalesce(json_agg(s ORDER BY rolname),'[]') FROM
    (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,
      rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig FROM pg_roles WHERE rolname NOT LIKE 'pg_%') s`);
  const memberships = pgJson(`SELECT coalesce(json_agg(s ORDER BY role,member),'[]') FROM
    (SELECT r.rolname AS role,m.rolname AS member,a.admin_option FROM pg_auth_members a
      JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member) s`);
  const structure = pgJson(`SELECT coalesce(json_agg(s ORDER BY schema,name),'[]') FROM
    (SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) AS owner,c.relacl,
      CASE WHEN c.relkind='i' THEN pg_get_indexdef(c.oid) ELSE NULL END AS index_definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','research') AND c.relkind IN ('r','p','i','S','v','m')) s`);
  const constraints = pgJson(CONSTRAINT_INVENTORY_SQL);
  const policies = pgJson(`SELECT coalesce(json_agg(s ORDER BY schemaname,tablename,policyname),'[]')
    FROM (SELECT * FROM pg_policies WHERE schemaname IN ('public','research')) s`);
  const sequences = pgJson(`SELECT coalesce(json_agg(s ORDER BY schemaname,sequencename),'[]')
    FROM (SELECT schemaname,sequencename,sequenceowner,data_type::text,start_value,min_value,
      max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname IN ('public','research')) s`);
  const functions = pgJson(`SELECT coalesce(json_agg(s ORDER BY schema,name,arguments),'[]') FROM
    (SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_userbyid(p.proowner) AS owner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','research') AND p.prokind IN ('f','p')) s`);
  const artifacts = pgJson(`SELECT coalesce(json_agg(s ORDER BY artifact_id),'[]') FROM
    (SELECT artifact_id,artifact_revision,manifest_digest FROM research.artifacts WHERE state='SEALED') s`);
  const parts = pgJson(`SELECT coalesce(json_agg(s ORDER BY artifact_id,table_kind,part_ordinal),'[]') FROM
    (SELECT p.* FROM research.artifact_parts p JOIN research.artifacts a USING(workspace_id,artifact_id)
      WHERE a.state='SEALED') s`);
  return { data, roles, memberships, structure, constraints, policies, sequences, functions, artifacts, parts };
}
const VERIFY_ARTIFACTS = String.raw`
import hashlib,json,os,sys
from pathlib import Path
from portal_api.services.research_artifacts import ResearchArtifactStore
facts=json.load(sys.stdin)
root=Path('/owned-artifacts')
tree=hashlib.sha256();files=0;size=0
for directory,dirs,names in os.walk(root):
    dirs.sort();names.sort()
    for name in dirs+names:
        if (Path(directory)/name).is_symlink(): raise RuntimeError('RESTORE_SYMLINK_REFUSED')
    for name in names:
        path=Path(directory)/name
        if not path.is_file(): raise RuntimeError('RESTORE_REGULAR_FILE_REQUIRED')
        h=hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''): h.update(chunk)
        rel=path.relative_to(root).as_posix()
        tree.update((rel+'\0'+h.hexdigest()+'\n').encode());files+=1;size+=path.stat().st_size
store=ResearchArtifactStore(root/'runs/durable-store/research-retained')
verified=[]
for artifact in facts['artifacts']:
    manifest,digest=store._load_and_verify_manifest(artifact['artifact_id'],verify_parts=True)
    if digest!=artifact['manifest_digest'] or manifest['artifact_revision']!=artifact['artifact_revision']:
        raise RuntimeError('RESTORED_MANIFEST_DATABASE_PIN_MISMATCH')
    actual={(p['relative_path'],p['sha256']) for t in manifest['tables'] for p in t['parts']}
    for part in facts['parts']:
        if part['artifact_id']==artifact['artifact_id']:
            path=store.artifacts_dir/artifact['artifact_id']/part['relative_path']
            if (part['relative_path'],part['part_digest']) not in actual or path.stat().st_size!=int(part['byte_count']):
                raise RuntimeError('RESTORED_PART_DATABASE_PIN_MISMATCH')
    verified.append({'artifact_id':artifact['artifact_id'],'manifest_digest':digest})
print(json.dumps({'tree_sha256':tree.hexdigest(),'file_count':files,'bytes':size,'verified':verified}))
`;
function utility(image, volume, args, input) {
  assert(/^sha256:[a-f0-9]{64}$/.test(image), 'IMMUTABLE_UTILITY_IMAGE_REQUIRED');
  assert(volume === ORIGINAL_ARTIFACTS || volume.startsWith(`${PROJECT}-restore-`), 'OWNED_ARTIFACT_VOLUME_REQUIRED');
  return docker(['run', '--rm', '--label', `com.docker.compose.project=${PROJECT}`,
    '--label', 'com.docker.compose.service=p23-restore-utility', '--network', 'none', '--read-only',
    '--memory', '350000000', '--memory-swap', '350000000', '--pids-limit', '64',
    '--user', '0:0', '-i', '-v', `${volume}:/owned-artifacts:ro`, image, ...args], input);
}
function artifactSnapshot(image, volume, snapshot) {
  return JSON.parse(utility(image, volume, ['python', '-c', VERIFY_ARTIFACTS], JSON.stringify(snapshot)));
}
function pipeFile(args, path, direction) {
  const fd = openSync(path, direction === 'output' ? 'wx' : 'r', 0o600);
  try {
    const result = spawnSync('sudo', ['-n', 'docker', ...args], {
      stdio: direction === 'output' ? ['ignore', fd, 'pipe'] : [fd, 'pipe', 'pipe'], timeout: 180000,
    });
    assert.equal(result.status, 0, `P23_RESTORE_FILE_COMMAND_FAILED:${direction}:${result.status}`);
  } finally { closeSync(fd); }
  return { locator: path, ...fileDigest(path) };
}
function fileDigest(path) {
  const fd=openSync(path,'r'),hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let bytes=0;
  try {
    const stat=fstatSync(fd);assert(stat.isFile() && (stat.mode&0o077)===0,'PRIVATE_RESTORE_FILE_REQUIRED');
    for(;;){const count=readSync(fd,buffer,0,buffer.length,null);if(count===0)break;hash.update(buffer.subarray(0,count));bytes+=count;}
    assert.equal(bytes,stat.size,'RESTORE_BACKUP_CHANGED_DURING_HASH');
  } finally {closeSync(fd);}
  return {sha256:hash.digest('hex'),bytes};
}

export async function restoreReceipt(home=DEFAULT_HOME,label='coherent-b2e8b868') {
  home=validateHome(home);const fresh=restoreVolumes(label);
  const target=join(home,`restore-${label}.json`);
  assert(!existsSync(target),'INSPECT_PRIOR_RESTORE_DO_NOT_OVERWRITE');
  const identity=privateJson(join(home,'identity.json'));
  assert(identity.project===PROJECT && identity.dirty===false,'CLEAN_OWNED_CANDIDATE_REQUIRED');
  const client=await operatorClient(home);
  const seed=privateJson(join(home,'run-integrity-original.json'));
  assert.equal(pgJson(`SELECT json_build_object('count',count(*)) FROM research.jobs
    WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')`).count,0,'DRAIN_ACTIVE_JOBS_BEFORE_RESTORE');
  for(const service of SERVICES) assert(identity.images[service]?.image_id,'COMPLETE_PINNED_STACK_REQUIRED');
  for(const service of SERVICES) {
    const actual=JSON.parse(docker(['inspect','--format','{{json .}}',`${PROJECT}-${service}-1`]));
    assert.equal(actual.Config.Labels['com.docker.compose.project'],PROJECT,'FOREIGN_RUNTIME_REFUSED');
    assert.equal(actual.Image,identity.images[service].image_id,'RUNTIME_IMAGE_DRIFT_REFUSED');
    docker(['image','inspect',actual.Image]); // Fail BEFORE stopping writers if a recorded index cannot run.
    assert(actual.HostConfig.Memory>0 && actual.HostConfig.MemorySwap===actual.HostConfig.Memory,'CAPPED_NO_SWAP_RUNTIME_REQUIRED');
  }
  for(const [service,name,destination] of [['portal-postgres',ORIGINAL_DB,'/var/lib/postgresql/data'],
    ['portal-api',ORIGINAL_ARTIFACTS,ARTIFACT_TARGET]]) {
    const mounts=JSON.parse(docker(['inspect','--format','{{json .Mounts}}',`${PROJECT}-${service}-1`]));
    assert(mounts.some(m=>m.Name===name && m.Destination===destination),'ORIGINAL_OWNED_VOLUME_REQUIRED');
  }
  const originalOverrides={services:Object.fromEntries(SERVICES.map(s=>[s,{image:identity.images[s].image_id}]))};
  const originalPath=join(home,`restore-${label}-original.compose.json`);savePrivate(originalPath,originalOverrides);
  const restoredOverrides={...originalOverrides,services:{...originalOverrides.services,
    'portal-postgres':{...originalOverrides.services['portal-postgres'],volumes:[`${fresh.db}:/var/lib/postgresql/data`]},
    'portal-api':{...originalOverrides.services['portal-api'],volumes:[`${fresh.artifacts}:${ARTIFACT_TARGET}`]},
    'control-api':{...originalOverrides.services['control-api'],environment:{RUN_SYNC_ENABLED:'false'}},
    'quant-worker-py':{...originalOverrides.services['quant-worker-py'],volumes:[`${fresh.artifacts}:${ARTIFACT_TARGET}`]}},
    volumes:{[fresh.db]:{external:true,name:fresh.db},[fresh.artifacts]:{external:true,name:fresh.artifacts}}};
  const restoredPath=join(home,`restore-${label}-fresh.compose.json`);savePrivate(restoredPath,restoredOverrides);
  const compose=(override,args)=>{
    const out=spawnSync('sudo',['-n','docker',...composeArguments(join(home,'preview.env')),'-f',override,...args],
      {cwd:ROOT,stdio:'pipe',encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
    assert.equal(out.status,0,`P23_RESTORE_COMPOSE_FAILED:${args[0]}`);
  };
  const receipt={schema_version:'research.p23-coherent-restore.v1',project:PROJECT,base_url:BASE_URL+'/',
    candidate_source_sha:identity.candidate_source_sha,identity,started_at_utc:new Date().toISOString(),
    original_volumes:{db:ORIGINAL_DB,artifacts:ORIGINAL_ARTIFACTS},restore_volumes:fresh,passed:false};
  savePrivate(target,receipt);let originalStopped=false;
  try {
    // Stop all writers first; keep only the owned database up for a coherent dump.
    originalStopped=true;compose(originalPath,['stop','--timeout','20',...SERVICES.filter(s=>s!=='portal-postgres')]);
    receipt.before=await databaseSnapshot();
    receipt.artifacts_before=artifactSnapshot(identity.images['portal-api'].image_id,ORIGINAL_ARTIFACTS,receipt.before);
    assert(receipt.before.artifacts.length>0 && receipt.before.parts.length>0,'NONEMPTY_RETAINED_RESTORE_REQUIRED');
    receipt.backups={
      database:pipeFile(['exec',PG,'pg_dump','-U','portal','-d','portal_control','-Fc'],join(home,`restore-${label}.dump`),'output'),
      globals:pipeFile(['exec',PG,'pg_dumpall','-U','portal','--globals-only','--no-role-passwords'],join(home,`restore-${label}-globals.sql`),'output'),
      artifacts:pipeFile(['run','--rm','--label',`com.docker.compose.project=${PROJECT}`,
        '--label','com.docker.compose.service=p23-restore-utility','--network','none','--read-only',
        '--memory','350000000','--memory-swap','350000000','--pids-limit','64',
        '--user','0:0','-v',`${ORIGINAL_ARTIFACTS}:/owned-artifacts:ro`,identity.images['portal-api'].image_id,
        'tar','-C','/owned-artifacts','-cpf','-','.'],join(home,`restore-${label}-artifacts.tar`),'output')};
    savePrivate(target,receipt);
    compose(originalPath,['down']);
    for(const name of Object.values(fresh)) {
      assert(docker(['volume','ls','-q','--filter',`name=^${name}$`]).trim()==='','FRESH_VOLUME_ALREADY_EXISTS');
      docker(['volume','create','--label',`com.docker.compose.project=${PROJECT}`,'--label','p23.purpose=restore',name]);
    }
    compose(restoredPath,['up','-d','--no-build','--no-deps','--wait','--wait-timeout','90','portal-postgres']);
    const mounts=JSON.parse(docker(['inspect','--format','{{json .Mounts}}',PG]));
    const count=pgJson(`SELECT json_build_object('count',count(*)) FROM information_schema.tables
      WHERE table_schema IN ('public','research') AND table_type='BASE TABLE'`).count;
    assertFreshRestoreTarget(fresh.db,label,mounts,count);
    docker(['exec','-i',PG,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','portal','-d','portal_control'],
      globalsForFreshPortalDatabase(readFileSync(receipt.backups.globals.locator,'utf8')));
    pipeFile(['exec','-i',PG,'pg_restore','--exit-on-error','--clean','--if-exists','-U','portal','-d','portal_control'],
      receipt.backups.database.locator,'input');
    pipeFile(['run','--rm','--label',`com.docker.compose.project=${PROJECT}`,
      '--label','com.docker.compose.service=p23-restore-utility','--network','none','--read-only',
      '--memory','350000000','--memory-swap','350000000','--pids-limit','64','-i',
      '--user','0:0','-v',`${fresh.artifacts}:/owned-artifacts`,identity.images['portal-api'].image_id,
      'tar','-C','/owned-artifacts','-xpf','-'],receipt.backups.artifacts.locator,'input');
    receipt.after=await databaseSnapshot();assertRestoreParity(receipt.before,receipt.after);
    receipt.artifacts_after=artifactSnapshot(identity.images['portal-api'].image_id,fresh.artifacts,receipt.after);
    assertRestoreParity(receipt.artifacts_before,receipt.artifacts_after);
    savePrivate(target,receipt);
    // No migration/bootstrap/reseal. No worker. Reads must work from restored state.
    for(const service of ['portal-nats','portal-api','control-api','roadmap-task-board-api','portal-web']) {
      compose(restoredPath,['up','-d','--no-build','--no-deps','--wait','--wait-timeout','90',service]);
    }
    assert(docker(['ps','-q','--filter',`label=com.docker.compose.project=${PROJECT}`,
      '--filter','label=com.docker.compose.service=quant-worker-py']).trim()==='','RESTORE_READS_WORKER_MUST_BE_OFF');
    const context=await client.call('GET','/api/auth/context');assert.equal(context.body.principal.principalId,client.user.id);
    receipt.reads=[];
    for(const suffix of ['progress','evidence','search','report','execute/replay']) {
      const path=suffix==='progress'?`/api/v1/research/runs/${seed.run_id}/progress`:`/api/v1/quantbt/runs/${seed.run_id}/${suffix}`;
      const response=await client.call('GET',path);receipt.reads.push({path,response});savePrivate(target,receipt);
    }
    receipt.restored_worker_off=true;
  } catch(error) {
    receipt.failure=error.message;receipt.failed_at_utc=new Date().toISOString();savePrivate(target,receipt);throw error;
  } finally {
    if(originalStopped) {
      // Always switch back to intact original volumes, immutable images, without -v.
      try {compose(restoredPath,['down']);} catch {receipt.restore_teardown_warning='ORIGINAL_RECOVERY_STILL_ATTEMPTED';}
      compose(originalPath,['up','-d','--no-build','--wait','--wait-timeout','150','portal-web','quant-worker-py']);
      const mounts=JSON.parse(docker(['inspect','--format','{{json .Mounts}}',PG]));
      assert(mounts.some(m=>m.Name===ORIGINAL_DB && m.Destination==='/var/lib/postgresql/data'),'ORIGINAL_DATABASE_NOT_RESTORED');
      receipt.original_stack_restored=true;savePrivate(target,receipt);
    }
  }
  receipt.passed=true;receipt.completed_at_utc=new Date().toISOString();savePrivate(target,receipt);
  console.log(JSON.stringify({passed:true,tables:receipt.before.data.length,sealed_artifacts:receipt.before.artifacts.length,
    artifact_parts:receipt.before.parts.length,files:receipt.artifacts_after.file_count,
    restored_worker_off:true,original_stack_restored:true,publication_pin_scope:'Only actual nonempty source relations, not inferred from empty tables.'}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  restoreReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
    process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'coherent-b2e8b868')
    .catch(error=>{console.error('P23 coherent restore refused:',error.message);process.exitCode=1;});
}
