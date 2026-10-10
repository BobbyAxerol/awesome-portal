// Metadata-only pg_restore COPY comparison; never prints identity rows.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [beforePath,afterPath]=process.argv.slice(2);
for(const path of [beforePath,afterPath])assert(path?.startsWith('/home/bobby/.local/state/portal-udb03/'));
const before=fs.readFileSync(beforePath,'utf8');
const match=/COPY public\.external_identity_bindings \(([^)]+)\) FROM stdin;\n([\s\S]*?)\n\\\./.exec(before);
assert(match,'original COPY block required');
const columns=match[1].split(', ').map(s=>s.trim());
const omitted=columns.indexOf('last_seen_at');assert(omitted>=0);
const lines=s=>s.trim().split('\n').filter(Boolean);
const after=lines(fs.readFileSync(afterPath,'utf8'));
const clean=row=>{const fields=row.split('\t');assert.equal(fields.length,columns.length);return fields.filter((_,i)=>i!==omitted).join('\t');};
const a=lines(match[2]).map(clean).sort(),b=after.map(clean).sort();assert.deepEqual(b,a,'binding identity/authority changed');
console.log(JSON.stringify({result:'PASS_IDENTITY_BINDINGS_UNCHANGED_EXCEPT_LOGIN_LAST_SEEN',count:a.length,
  authority_sha256:createHash('sha256').update(JSON.stringify(a)).digest('hex'),excluded_telemetry:['last_seen_at']}));
