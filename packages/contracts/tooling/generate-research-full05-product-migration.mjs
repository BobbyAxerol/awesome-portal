/** Append verified imported product proof; never mutate candidate/old receipts. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url);
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const rows=table.recipes.filter(r=>r.adapter_kind==='IMPORTED_SEARCH');assert.equal(rows.length,27);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex'),quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const refs=rows.map(row=>{
  const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);
  assert.equal(ref?.kind,'PRODUCT_RUN_QUALIFIED','UNQUALIFIED_IMPORTED_RECIPE:'+row.profile_id);
  assert.equal(ref.recipe_digest,hash(row));assert.equal(ref.receipt_path,'upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md');
  assert.equal(createHash('sha256').update(readFileSync(new URL(ref.receipt_path,root))).digest('hex'),ref.receipt_sha256);return ref;
});
const sql='-- FULL05 append-only imported product proof; candidate/old seal custody unchanged.\n'
  +'INSERT INTO research.execution_recipe_product_receipts_v1\n (recipe_digest,receipt_path,receipt_sha256,scope) VALUES\n'
  +refs.map(r=>` (${quote(r.recipe_digest)},${quote(r.receipt_path)},${quote(r.receipt_sha256)},'EXACT_PROFILE_PRODUCT_RUN')`).join(',\n')+';\n';
const path=new URL('apps/control-api/migrations/1723680000105_research-full05-product-qualification.sql',root);
if(process.argv.includes('--check'))assert.equal(readFileSync(path,'utf8'),sql,'FULL05_PRODUCT_PROOF_DRIFT');else writeFileSync(path,sql);
console.log('FULL05 appended exact product references:27.');
