/** Append-only Limit/OCO edition. Never rewrite a persisted native recipe. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=new URL('../../../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root)));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
 ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const table=read('apps/portal/registry/research-execution-recipes.v1.json');
const bindings=read('apps/portal/registry/research-native-delta-bindings.v1.json');
const trackedTable=JSON.parse(execFileSync('git',['show','HEAD:apps/portal/registry/research-execution-recipes.v1.json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024**2}));
const trackedBindings=JSON.parse(execFileSync('git',['show','HEAD:apps/portal/registry/research-native-delta-bindings.v1.json'],{cwd:root,encoding:'utf8'}));
const id='p10.delta-event-driven-limit-oco-fixed-1h.v1';
const original=table.recipes.find(r=>r.profile_id==='p10.delta-event-driven-fixed-1h.v3');assert(original);
const oldBinding=bindings.find(b=>b.alpha_version_id===original.descriptor.alpha_binding_requirements.alpha_version_id);assert(oldBinding);
const adapterHash=createHash('sha256').update(readFileSync(new URL('apps/portal/backend/src/portal_api/adapters/research_native_limit_oco_v1.py',root))).digest('hex');
const binding=structuredClone(oldBinding);delete binding.adapter_contract_digest;
binding.alpha_version_id='av_delta_rsi_polynomial_alpha_1_0_12';
binding.declared_contract.version='1.0.12';
binding.declared_contract.execution.parameter_mode='FIXED_NATIVE_LIMIT_OCO_DELTA_V1';
binding.declared_contract.provenance.native_adapter_sha256=adapterHash;
binding.adapter_contract_digest=hash(binding);
const persisted=bindings.find(b=>b.alpha_version_id===binding.alpha_version_id);
if(persisted){if(trackedBindings.some(b=>b.alpha_version_id===binding.alpha_version_id))assert.equal(hash(persisted),hash(binding),'PERSISTED_BINDING_IMMUTABLE');
 bindings[bindings.indexOf(persisted)]=binding;}else bindings.push(binding);
const row=structuredClone(original);row.profile_id=id;
row.descriptor.profile_id=id;
row.descriptor.adapter_contract_digest=binding.adapter_contract_digest;
row.descriptor.alpha_binding_requirements.alpha_version_id=binding.alpha_version_id;
row.descriptor.alpha_binding_requirements.adapter_contract_digest=binding.adapter_contract_digest;
row.descriptor.native_input.adapter_sha256=adapterHash;
row.profile_digest=hash(row.descriptor);row.public_profile.profile_id=id;
const prior=table.recipes.find(r=>r.profile_id===id);
if(prior){if(trackedTable.recipes.some(r=>r.profile_id===id))assert.equal(hash(prior),hash(row),'PERSISTED_RECIPE_IMMUTABLE');
 table.recipes[table.recipes.indexOf(prior)]=row;
 const candidate=table.qualification_references.find(r=>r.profile_id===id);
 if(candidate.kind==='CANDIDATE_NOT_QUALIFIED')candidate.recipe_digest=hash(row);}
else {table.recipes.push(row);table.qualification_references.push({profile_id:id,recipe_digest:hash(row),
 kind:'CANDIDATE_NOT_QUALIFIED',receipt_path:null,receipt_sha256:null});}
const output=(path,value)=>{const text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
 if(process.argv.includes('--check'))assert.equal(readFileSync(new URL(path,root),'utf8'),text);else writeFileSync(new URL(path,root),text);};
output('apps/portal/registry/research-execution-recipes.v1.json',table);
output('apps/portal/registry/research-native-delta-bindings.v1.json',bindings);
output('apps/control-api/src/research/native-delta-bindings.generated.ts',
 '// Generated from the native binding registry; do not hand-edit.\nexport const NATIVE_DELTA_BINDING_TABLE = '+JSON.stringify(bindings,null,2)+';\n');
const q=v=>"'"+v.replaceAll("'","''")+"'",b=row.descriptor.alpha_binding_requirements;
const exact=`execution_profile_id=${q(id)} AND execution_profile_digest=${q(row.profile_digest)} AND execution_adapter_id='full03.delta-rsi.v1' AND adapter_contract_digest=${q(b.adapter_contract_digest)} AND alpha_id=${q(b.alpha_id)} AND alpha_version_id=${q(b.alpha_version_id)}`;
const policy=Object.fromEntries(Object.entries(row).filter(([k])=>k!=='descriptor'));
output('apps/control-api/migrations/1723680000119_research-native-limit-oco.sql',`-- Append-only native Limit/OCO candidate; all historical bindings and rows remain unchanged.
INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy)
VALUES(${q(id)},${q(row.profile_digest)},${q(hash(row))},${q(JSON.stringify(row.descriptor))}::jsonb,${q(JSON.stringify(policy))}::jsonb);
INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope)
VALUES(${q(hash(row))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');
DO $limitoco$ DECLARE name text; definition text; BEGIN
 FOREACH name IN ARRAY ARRAY['run_producers_execution_profile_id_check','run_producers_execution_profile_digest_check','run_producers_full03_exact_check'] LOOP
  SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='research.run_producers'::regclass AND conname=name;
  IF left(definition,7)<>'CHECK (' OR right(definition,1)<>')' THEN RAISE EXCEPTION 'unsupported exact recipe constraint'; END IF;
  EXECUTE format('ALTER TABLE research.run_producers DROP CONSTRAINT %I',name);
  EXECUTE format('ALTER TABLE research.run_producers ADD CONSTRAINT %I CHECK ((%s) OR (%s))',name,substring(definition from 8 for char_length(definition)-8),${q(exact)});
 END LOOP;
END $limitoco$;
`);
output('apps/control-api/migrations/1723680000120_research-limit-oco-binding-identity.sql',`-- Preserve legacy uniqueness; permit only the new server-owned immutable native edition.
DO $binding$ DECLARE predicate text; BEGIN
 SELECT pg_get_expr(indpred,indrelid) INTO STRICT predicate FROM pg_index
 WHERE indexrelid='research.alpha_versions_legacy_code_entrypoint_unique'::regclass;
 IF predicate IS NULL THEN RAISE EXCEPTION 'legacy identity index must retain a partial predicate'; END IF;
 DROP INDEX research.alpha_versions_legacy_code_entrypoint_unique;
 EXECUTE format('CREATE UNIQUE INDEX alpha_versions_legacy_code_entrypoint_unique ON research.alpha_versions(workspace_id,alpha_id,code_digest,entrypoint) WHERE (%s) AND alpha_version_id <> %L',predicate,${q(binding.alpha_version_id)});
END $binding$;
`);
output('apps/control-api/migrations/1723680000121_research-limit-oco-exact-binding.sql',`-- New native edition must retain exact protected code, declaration and adapter identity.
ALTER TABLE research.alpha_versions ADD CONSTRAINT alpha_versions_limit_oco_identity_check
 CHECK(alpha_version_id<>${q(binding.alpha_version_id)} OR (alpha_id=${q(binding.alpha_id)}
 AND code_digest=${q(binding.declared_contract.provenance.protected_kernel_sha256)}
 AND entrypoint=${q(binding.declared_contract.entrypoint)} AND declared_contract=${q(JSON.stringify(binding.declared_contract))}::jsonb));
DO $adapter$ DECLARE definition text; BEGIN
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint
 WHERE conrelid='research.execution_adapter_bindings'::regclass AND conname='execution_adapter_bindings_full03_exact_check';
 IF left(definition,7)<>'CHECK (' OR right(definition,1)<>')' THEN RAISE EXCEPTION 'unsupported exact binding constraint'; END IF;
 ALTER TABLE research.execution_adapter_bindings DROP CONSTRAINT execution_adapter_bindings_full03_exact_check;
 EXECUTE format('ALTER TABLE research.execution_adapter_bindings ADD CONSTRAINT execution_adapter_bindings_full03_exact_check CHECK ((%s) OR (adapter_id=%L AND alpha_version_id=%L AND contract_digest=%L))',substring(definition from 8 for char_length(definition)-8),'full03.delta-rsi.v1',${q(binding.alpha_version_id)},${q(binding.adapter_contract_digest)});
END $adapter$;
`);
const ref=table.qualification_references.find(r=>r.profile_id===id);
if(ref.kind==='PRODUCT_RUN_QUALIFIED'){
 assert.equal(ref.recipe_digest,hash(row));assert.equal(ref.receipt_sha256,createHash('sha256').update(readFileSync(new URL(ref.receipt_path,root))).digest('hex'));
 output('apps/control-api/migrations/1723680000124_research-limit-oco-product-qualification.sql',`-- Preserve candidate history; add exact Limit/OCO product proof after batch-index qualification.
INSERT INTO research.execution_recipe_product_receipts_v1(recipe_digest,receipt_path,receipt_sha256,scope)
VALUES(${q(ref.recipe_digest)},${q(ref.receipt_path)},${q(ref.receipt_sha256)},'EXACT_PROFILE_PRODUCT_RUN');
`);
}
console.log('Limit/OCO immutable recipe/binding and migration '+(process.argv.includes('--check')?'verified':'generated'));
