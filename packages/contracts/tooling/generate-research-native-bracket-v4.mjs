/** Append-only correction; historical native profiles/bindings are unchanged. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url),table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const row=table.recipes.find(r=>r.profile_id==='p10.delta-intrabar-bracket-fixed-1h.v4');assert(row);
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
const q=v=>"'"+v.replaceAll("'","''")+"'";
assert.equal(row.profile_digest,hash(row.descriptor));
assert.equal(row.descriptor.native_input.adapter_sha256,createHash('sha256').update(readFileSync(new URL('apps/portal/backend/src/portal_api/adapters/research_native_bracket_v4.py',root))).digest('hex'));
const b=row.descriptor.alpha_binding_requirements;
const exact=`execution_profile_id=${q(row.profile_id)} AND execution_profile_digest=${q(row.profile_digest)} AND execution_adapter_id='full03.delta-rsi.v1' AND adapter_contract_digest=${q(b.adapter_contract_digest)} AND alpha_id=${q(b.alpha_id)} AND alpha_version_id=${q(b.alpha_version_id)}`;
const policy=Object.fromEntries(Object.entries(row).filter(([k])=>k!=='descriptor'));
const sql=`-- Additive native Bracket V4; preserve V1..V3 descriptors, Alpha identities and existing producers.
INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy)
VALUES(${q(row.profile_id)},${q(row.profile_digest)},${q(hash(row))},${q(JSON.stringify(row.descriptor))}::jsonb,${q(JSON.stringify(policy))}::jsonb);
INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope)
VALUES(${q(hash(row))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');
DO $v4$ DECLARE name text; definition text; BEGIN
  FOREACH name IN ARRAY ARRAY['run_producers_execution_profile_id_check','run_producers_execution_profile_digest_check','run_producers_full03_exact_check'] LOOP
    SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='research.run_producers'::regclass AND conname=name;
    IF left(definition,7)<>'CHECK (' OR right(definition,1)<>')' THEN RAISE EXCEPTION 'unsupported exact recipe constraint'; END IF;
    EXECUTE format('ALTER TABLE research.run_producers DROP CONSTRAINT %I',name);
    EXECUTE format('ALTER TABLE research.run_producers ADD CONSTRAINT %I CHECK ((%s) OR (%s))',name,substring(definition from 8 for char_length(definition)-8),${q(exact)});
  END LOOP;
END $v4$;
`;
const file=new URL('apps/control-api/migrations/1723680000117_research-native-bracket-v4.sql',root);
if(process.argv.includes('--check'))assert.equal(readFileSync(file,'utf8'),sql);else writeFileSync(file,sql);
const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);
assert.equal(ref?.kind,'PRODUCT_RUN_QUALIFIED');
assert.equal(ref.recipe_digest,hash(row));
assert.equal(ref.receipt_sha256,createHash('sha256').update(readFileSync(new URL(ref.receipt_path,root))).digest('hex'));
const product=`-- Append-only exact product proof; retain the original candidate qualification.
INSERT INTO research.execution_recipe_product_receipts_v1
 (recipe_digest,receipt_path,receipt_sha256,scope) VALUES
 (${q(ref.recipe_digest)},
  ${q(ref.receipt_path)},
  ${q(ref.receipt_sha256)},
  'EXACT_PROFILE_PRODUCT_RUN');
`;
const productFile=new URL('apps/control-api/migrations/1723680000118_research-bracket-v4-product-qualification.sql',root);
if(process.argv.includes('--check'))assert.equal(readFileSync(productFile,'utf8'),product);else writeFileSync(productFile,product);
console.log('Native Bracket V4 exact migration '+(process.argv.includes('--check')?'verified':'generated'));
