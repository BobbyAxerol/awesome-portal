/** Append only byte-bound percent-equity product qualification. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full06-delta-profile.v1');assert.equal(rows.length,63);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const refs=rows.map(row=>{const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);
 assert.equal(ref?.kind,'PRODUCT_RUN_QUALIFIED','UNQUALIFIED_PERCENT_EQUITY_RECIPE:'+row.profile_id);
 assert.equal(ref.recipe_digest,createHash('sha256').update(JSON.stringify(canonical(row))).digest('hex'));
 assert.equal(ref.receipt_path,'upgrade/research_loop/evidence/P10/FULL_06_PERCENT_EQUITY_PRODUCT_QUALIFICATION_2026-10-06.md');
 assert.equal(createHash('sha256').update(readFileSync(new URL(ref.receipt_path,root))).digest('hex'),ref.receipt_sha256);return ref;});
const sql='-- FULL06 append-only percent-equity product proof; historical custody unchanged.\n'
 +'INSERT INTO research.execution_recipe_product_receipts_v1\n (recipe_digest,receipt_path,receipt_sha256,scope) VALUES\n'
 +refs.map(r=>` (${quote(r.recipe_digest)},${quote(r.receipt_path)},${quote(r.receipt_sha256)},'EXACT_PROFILE_PRODUCT_RUN')`).join(',\n')+';\n';
const path=new URL('apps/control-api/migrations/1723680000107_research-full06-product-qualification.sql',root);
if(process.argv.includes('--check'))assert.equal(readFileSync(path,'utf8'),sql,'FULL06_PRODUCT_DRIFT');else writeFileSync(path,sql);
console.log('FULL06 exact append-only product proof:63.');
