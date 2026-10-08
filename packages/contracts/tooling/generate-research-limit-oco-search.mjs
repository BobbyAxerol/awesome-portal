/** Append-only native optimizer edition; never rewrite the v1 minimal proof. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=new URL('../../../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root)));
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'
 ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
const bytes=p=>createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex');
const table=read('apps/portal/registry/research-execution-recipes.v1.json');
const bindings=read('apps/portal/registry/research-native-delta-bindings.v1.json');
const original=table.recipes.find(r=>r.profile_id==='p10.delta-event-driven-limit-oco-fixed-1h.v1');assert(original);
const row=structuredClone(original),binding=structuredClone(bindings.find(b=>b.alpha_version_id===original.descriptor.alpha_binding_requirements.alpha_version_id));
const id='p10.delta-event-driven-limit-oco-search-1h.v1';
delete binding.adapter_contract_digest;
binding.alpha_version_id='av_delta_rsi_polynomial_alpha_1_0_13';
binding.declared_contract.version='1.0.13';
binding.declared_contract.execution.parameter_mode='NATIVE_LIMIT_OCO_IS_OPTIMIZATION_V1';
binding.declared_contract.provenance.native_adapter_sha256=bytes('apps/portal/backend/src/portal_api/adapters/research_native_limit_oco_search_v1.py');
binding.adapter_contract_digest=hash(binding);
row.profile_id=id;
Object.assign(row.descriptor,{profile_id:id,adapter_contract_digest:binding.adapter_contract_digest,
 optimization_mode:'mode_4_is_only_robust',optimization_schedule:'global',random_seed:42,max_span_days:365,
 child_limits:{...row.descriptor.child_limits,cpu_seconds:1800,wall_seconds:3600,scratch_bytes:536870912}});
Object.assign(row.descriptor.alpha_binding_requirements,{alpha_version_id:binding.alpha_version_id,adapter_contract_digest:binding.adapter_contract_digest});
Object.assign(row.descriptor.native_input,{adapter_sha256:binding.declared_contract.provenance.native_adapter_sha256,
 bracket:null,optimizer:'PINNED_QUANTBT_NATIVE_IS_SHARPE_V1',
 cycle_policy:{schema_version:'research.native-limit-oco-cycle-policy.v1',cycle_bars:48,entry_expiry_bars:24,
 boundary_policy:'EXPIRE_CANCEL_AND_ENGINE_REDUCE_ONLY_CLOSE_BEFORE_REENTRY',max_span_days:365}});
row.profile_digest=hash(row.descriptor);
row.work_schema_version='research.native-optimized-work.v1';
row.resource_class='research-native-optimized-v1';
Object.assign(row.budgets,{cpu_seconds:1800,wall_seconds:3600,scratch_bytes:536870912});
Object.assign(row.public_profile,{profile_id:id,optimization_mode:'mode_4_is_only_robust',random_seed:42,
 trial_count:{min:2,max:400},trial_default:100});
const replace=(items,key,value)=>{
 const prior=items.find(x=>x[key]===value[key]);
 if(prior){const tracked=JSON.parse(execFileSync('git',['show',`HEAD:${items===bindings?'apps/portal/registry/research-native-delta-bindings.v1.json':'apps/portal/registry/research-execution-recipes.v1.json'}`],{cwd:root,encoding:'utf8',maxBuffer:8*1024**2}));
  const old=(Array.isArray(tracked)?tracked:tracked.recipes).find(x=>x[key]===value[key]);
  if(old)assert.equal(hash(old),hash(value),'PERSISTED_NATIVE_SEARCH_IDENTITY_IMMUTABLE');
  items[items.indexOf(prior)]=value;
 }else items.push(value);
};
replace(bindings,'alpha_version_id',binding);replace(table.recipes,'profile_id',row);
let ref=table.qualification_references.find(r=>r.profile_id===id);
if(!ref){ref={profile_id:id,recipe_digest:hash(row),kind:'CANDIDATE_NOT_QUALIFIED',receipt_path:null,receipt_sha256:null};table.qualification_references.push(ref);}
if(ref.kind==='CANDIDATE_NOT_QUALIFIED')ref.recipe_digest=hash(row);else assert.equal(ref.recipe_digest,hash(row));
const output=(p,v)=>{const next=typeof v==='string'?v:JSON.stringify(v,null,2)+'\n';
 if(process.argv.includes('--check'))assert.equal(readFileSync(new URL(p,root),'utf8'),next);else writeFileSync(new URL(p,root),next);};
output('apps/portal/registry/research-execution-recipes.v1.json',table);
output('apps/portal/registry/research-native-delta-bindings.v1.json',bindings);
output('apps/control-api/src/research/native-delta-bindings.generated.ts','// Generated from the native binding registry; do not hand-edit.\nexport const NATIVE_DELTA_BINDING_TABLE = '+JSON.stringify(bindings,null,2)+';\n');
const q=v=>"'"+v.replaceAll("'","''")+"'",b=row.descriptor.alpha_binding_requirements;
const exact=`execution_profile_id=${q(id)} AND execution_profile_digest=${q(row.profile_digest)} AND execution_adapter_id='full03.delta-rsi.v1' AND adapter_contract_digest=${q(b.adapter_contract_digest)} AND alpha_id=${q(b.alpha_id)} AND alpha_version_id=${q(b.alpha_version_id)}`;
output('apps/control-api/migrations/1723680000125_research-native-limit-oco-search.sql',`-- Add a distinct native IS optimizer; preserve every historical recipe/binding.
INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy)
VALUES(${q(id)},${q(row.profile_digest)},${q(hash(row))},${q(JSON.stringify(row.descriptor))}::jsonb,${q(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>k!=='descriptor'))))}::jsonb);
INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope)
VALUES(${q(hash(row))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');
DO $native$ DECLARE name text; definition text; predicate text; BEGIN
 FOREACH name IN ARRAY ARRAY['run_producers_execution_profile_id_check','run_producers_execution_profile_digest_check','run_producers_full03_exact_check'] LOOP
  SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='research.run_producers'::regclass AND conname=name;
  IF left(definition,7)<>'CHECK (' OR right(definition,1)<>')' THEN RAISE EXCEPTION 'unsupported exact recipe constraint'; END IF;
  EXECUTE format('ALTER TABLE research.run_producers DROP CONSTRAINT %I',name);
  EXECUTE format('ALTER TABLE research.run_producers ADD CONSTRAINT %I CHECK ((%s) OR (%s))',name,substring(definition from 8 for char_length(definition)-8),${q(exact)});
 END LOOP;
 SELECT pg_get_expr(indpred,indrelid) INTO STRICT predicate FROM pg_index WHERE indexrelid='research.alpha_versions_legacy_code_entrypoint_unique'::regclass;
 IF predicate IS NULL THEN RAISE EXCEPTION 'legacy identity must retain a partial predicate'; END IF;
 DROP INDEX research.alpha_versions_legacy_code_entrypoint_unique;
 EXECUTE format('CREATE UNIQUE INDEX alpha_versions_legacy_code_entrypoint_unique ON research.alpha_versions(workspace_id,alpha_id,code_digest,entrypoint) WHERE (%s) AND alpha_version_id <> %L',predicate,${q(binding.alpha_version_id)});
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='research.execution_adapter_bindings'::regclass AND conname='execution_adapter_bindings_full03_exact_check';
 ALTER TABLE research.execution_adapter_bindings DROP CONSTRAINT execution_adapter_bindings_full03_exact_check;
 EXECUTE format('ALTER TABLE research.execution_adapter_bindings ADD CONSTRAINT execution_adapter_bindings_full03_exact_check CHECK ((%s) OR (adapter_id=%L AND alpha_version_id=%L AND contract_digest=%L))',substring(definition from 8 for char_length(definition)-8),'full03.delta-rsi.v1',${q(binding.alpha_version_id)},${q(binding.adapter_contract_digest)});
END $native$;
ALTER TABLE research.alpha_versions ADD CONSTRAINT alpha_versions_native_search_identity_check
 CHECK(alpha_version_id<>${q(binding.alpha_version_id)} OR (alpha_id=${q(binding.alpha_id)} AND code_digest=${q(binding.declared_contract.provenance.protected_kernel_sha256)} AND entrypoint=${q(binding.declared_contract.entrypoint)} AND declared_contract=${q(JSON.stringify(binding.declared_contract))}::jsonb));
`);
if(ref.kind==='PRODUCT_RUN_QUALIFIED'){
 assert.equal(ref.receipt_sha256,bytes(ref.receipt_path));
 output('apps/control-api/migrations/1723680000126_research-native-limit-oco-search-qualified.sql',`-- Frozen ordinary-product proof, not a global candidate grant.
INSERT INTO research.execution_recipe_product_receipts_v1(recipe_digest,receipt_path,receipt_sha256,scope)
VALUES(${q(ref.recipe_digest)},${q(ref.receipt_path)},${q(ref.receipt_sha256)},'EXACT_PROFILE_PRODUCT_RUN');
`);
}
console.log('Native multi-cycle optimizer recipe generated/verified');
