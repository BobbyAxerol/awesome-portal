/** Append-only exact product qualifications; candidates never inherit evidence. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),check=process.argv.includes('--check');
const lane=process.argv.find(v=>v.startsWith('--lane='))?.slice(7)??'all';
assert(['all','native','expanded'].includes(lane),'EXACT_QUALIFICATION_LANE');
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
 ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>createHash('sha256').update(v).digest('hex'),quote=v=>"'"+String(v).replaceAll("'","''")+"'";
for(const [schema,number,name,packet,expected] of [
 // Candidate editions112/113 already ran. Never insert a newly produced
 // proof below that applied ledger; append instead of repairing its order.
 ['research.expanded-trial-profile.v1','115','expanded-trial','EXPANDED_TRIAL_PRODUCT_QUALIFICATION_2026-10-06.md',153],
 ['research.native-route-profile.v1','114','native-route','NATIVE_ROUTE_PRODUCT_QUALIFICATION_2026-10-06.md',3],
]){
 if(lane==='native'&&schema!=='research.native-route-profile.v1'||lane==='expanded'&&schema!=='research.expanded-trial-profile.v1')continue;
 const qualified=table.recipes.filter(row=>row.descriptor.schema_version===schema).map(row=>{
  const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);
  assert.equal(ref.recipe_digest,sha(JSON.stringify(canonical(row))),'IMMUTABLE_RECIPE_DIGEST');
  return ref;
 }).filter(ref=>ref.kind==='PRODUCT_RUN_QUALIFIED');
 assert.equal(qualified.length,expected,'EXACT_QUALIFIED_RECIPE_SET');
 for(const ref of qualified){
  assert.equal(ref.receipt_path,'upgrade/research_loop/evidence/P10/'+packet);
  assert.equal(sha(readFileSync(new URL(ref.receipt_path,root))),ref.receipt_sha256,'RECEIPT_BYTES_MATCH');
 }
 const sql=`-- Append${number}: exact ordinary-product proof; no historical row rewrite.\n`
  +'INSERT INTO research.execution_recipe_product_receipts_v1\n (recipe_digest,receipt_path,receipt_sha256,scope) VALUES\n'
  +qualified.map(r=>` (${quote(r.recipe_digest)},${quote(r.receipt_path)},${quote(r.receipt_sha256)},'EXACT_PROFILE_PRODUCT_RUN')`).join(',\n')+';\n';
 const file=new URL(`apps/control-api/migrations/1723680000${number}_research-${name}-product-qualification.sql`,root);
 if(check)assert.equal(readFileSync(file,'utf8'),sql,'PRODUCT_QUALIFICATION_SQL_DRIFT');
 else writeFileSync(file,sql);
 console.log(`Append${number}: ${qualified.length} exact recipe proofs ${check?'checked':'generated'}.`);
}
