#!/usr/bin/env node
/** Normal prepare -> bounded worker -> authenticated download, owned cell only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ORIGIN,docker,owned,privateWrite,readPrivate} from './acceptance-cell.mjs';
import {namedClient} from './acceptance-api.mjs';
const pub=readPrivate('reader-authority.json').publication,c=namedClient('claude-preview');
const root=`/api/v1/quantbt/runs/${pub.run_id}/report/exports`,scope=`?workspace_id=${pub.workspace_id}`;
const pending=await c.call('POST',root+scope,{format:'REPORT_JSON'},[202]);
assert(['QUEUED','READY'].includes(pending.body.state));
// The finite existing worker is not implicitly invoked by GET, and has no
// market/source access or new engine run. Preserve its stdout privately.
if(pending.body.state==='QUEUED')privateWrite('export-worker.log',docker(['exec',owned('control-api'),'node','dist/cli/research-report-export-worker.js','--limit=1']));
const ready=await c.call('GET',root+'/'+pending.body.job_id+scope);assert.equal(ready.body.state,'READY');
const cookie=Object.entries(c.user.cookies).map(([k,v])=>`${k}=${v}`).join('; ');
const response=await fetch(ORIGIN+ready.body.download_href,{headers:{cookie,'x-dev-access-email':'claude-preview@azdag.com'},redirect:'manual'});
assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.length<=512*1024);
const digest=createHash('sha256').update(bytes).digest('hex');
assert(/^[a-f0-9]{64}$/.test(ready.body.sha256));assert.equal(digest,ready.body.sha256);
assert.equal(bytes.length,ready.body.size_bytes);assert.equal(response.headers.get('cache-control'),'private, no-store');
await namedClient('udb04-operator').call('GET',ready.body.download_href,undefined,[404]);
privateWrite('export.json',{passed:true,run_id:pub.run_id,workspace_id:pub.workspace_id,job_id:ready.body.job_id,
  bytes:bytes.length,sha256:digest,algorithm:'SHA-256',wrong_workspace_or_actor_status:404,legacy_get_used:false,engine_run_started:false});
console.log(JSON.stringify({passed:true,bytes:bytes.length,sha256:digest,unauthorized_download:404}));
