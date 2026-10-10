#!/usr/bin/env node
/** Scoped preview custody around application-only rollout. No source writes. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {SOURCE,HOME,docker,readPrivate,privateWrite,controlBuildInputs} from './acceptance-cell.mjs';
const phase=process.argv[2];assert(['before','after'].includes(phase));
const core=JSON.parse(docker(['exec','-i',SOURCE+'-control-api-1','node','-'],readFileSync(new URL('./inventory.cjs',import.meta.url),'utf8')));
const roadmap=JSON.parse(docker(['exec','-i',SOURCE+'-roadmap-task-board-api-1','python','-c',`
import sqlite3,os,json,hashlib
c=sqlite3.connect('file:'+os.environ['PORTAL_DATABASE_PATH']+'?mode=ro',uri=True)
c.execute('BEGIN');out={}
for (name,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    rows=list(c.execute('SELECT * FROM "'+name.replace('"','""')+'"'))
    raw=json.dumps(sorted([json.dumps(r,sort_keys=True,default=str) for r in rows]),separators=(',',':')).encode()
    out[name]={'count':len(rows),'sha256':hashlib.sha256(raw).hexdigest()}
print(json.dumps(out));c.rollback();c.close()
`]));
const bindings=JSON.parse(docker(['exec','-i',SOURCE+'-control-api-1','node','-e',`
const {Pool}=require('pg'),{createHash}=require('node:crypto');
(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,max:1});try{
const r=await p.query("SELECT to_jsonb(t)-'last_seen_at' AS row FROM external_identity_bindings t ORDER BY binding_id");
console.log(JSON.stringify({count:r.rows.length,sha256:createHash('sha256').update(JSON.stringify(r.rows)).digest('hex')}));}finally{await p.end();}})();
`]));
const result={at_utc:new Date().toISOString(),core,roadmap,bindings,control_build_inputs:controlBuildInputs()};
if(phase==='before'){
  const bytes=execFileSync('sudo',['-n','docker','exec',SOURCE+'-roadmap-task-board-api-1','python','-c',
    "import sqlite3,os,sys;c=sqlite3.connect('file:'+os.environ['PORTAL_DATABASE_PATH']+'?mode=ro',uri=True);sys.stdout.buffer.write(c.serialize());c.close()"],{maxBuffer:64*1024*1024});
  writeFileSync(join(HOME,'source-roadmap.sqlite'),bytes,{mode:0o600});
}else{
  const old=readPrivate('source-before.json');
  for(const [name,custody] of Object.entries(old.core.custody))if(!['auth_sessions','external_identity_bindings'].includes(name))
    assert.deepEqual(core.custody[name],custody,'SOURCE_CUSTODY:'+name);
  assert.deepEqual(core.migrations,old.core.migrations);assert.deepEqual(core.foreignKeys,old.core.foreignKeys);
  assert.deepEqual(roadmap,old.roadmap,'ROADMAP_TASKS_MUST_NOT_CHANGE');assert.deepEqual(bindings,old.bindings,'IDENTITY_BINDING_AUTHORITY');
  result.passed=true;result.allowed_session_change='Only ordinary preview browser sessions/login telemetry; no credential or grant mutation';
}
privateWrite('source-'+phase+'.json',result);
console.log(JSON.stringify({phase,passed:result.passed??null,roadmap_tables:Object.keys(roadmap).length,core_tables:Object.keys(core.custody).length}));
