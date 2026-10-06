/** FULL03 additive transport and SQL allowlists, pinned to the shared table. */
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {replaceComponent} from "./generate-research-progress-truth.mjs";
import {amendFull05} from "./generate-research-full05-contracts.mjs";
const root=new URL("../../../",import.meta.url);
const table=JSON.parse(readFileSync(new URL("apps/portal/registry/research-execution-recipes.v1.json",root)));
// Applied FULL03 SQL remains reproducible after later recipes reuse its adapter.
const full=table.recipes.filter(r=>r.descriptor.schema_version==="research.full03-delta-profile.v1");
const indexed=table.recipes.filter(r=>r.source_requirement==="FULL03_IMMUTABLE_DELTA_BINDING"&&r.descriptor.current_source);
const historicalRecipes=table.recipes.filter(r=>!["research.full04-delta-profile.v1","research.full05-imported-profile.v1","research.full06-delta-profile.v1","research.expanded-trial-profile.v1","research.native-route-profile.v1"].includes(r.descriptor.schema_version));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
export function amendFull03(original,file){
  const document=JSON.parse(original),schemas=document.components.schemas,updates={};
  if(file==="research-preflight"){
    const clock=structuredClone(schemas.VnObservedProvenance);
    clock.properties.clock_basis={const:"UTC_FIXED_INTERVAL_OPEN_TIME_V1"};
    clock.properties.source_timezone={const:"UTC"};
    clock.properties.warmup_semantics={const:"FIXED_INTERVAL_PREDECESSORS_V1"};
    updates.FixedUtcProvenance=clock;
  }
  if(schemas.ProtocolDisclosure){
    const protocol=structuredClone(schemas.ProtocolDisclosure);
    const metadata={type:"object",additionalProperties:false,
      required:["source_observation_count","emitted_point_count","sampling"],properties:{
        source_observation_count:{type:"integer",minimum:1,maximum:100000},
        emitted_point_count:{type:"integer",minimum:1,maximum:192},sampling:{enum:["FULL","MULTI_SERIES_EXTREMA_V1"]}}};
    protocol.properties.window_series_metadata={type:"object",additionalProperties:false,required:["is","oos","holdout"],
      properties:{is:metadata,oos:metadata,holdout:metadata}};
    updates.ProtocolDisclosure=protocol;
  }
  for(const[name,schema]of Object.entries(schemas)){
    const value=structuredClone(schema);let changed=false;
    const walk=v=>{if(!v||typeof v!=="object")return;
      if(v.enum?.includes("p04.delta-rsi.v1")&&v.enum?.includes("p17.imported-signal-notional.v1")&&!v.enum.includes("full03.delta-rsi.v1")){
        v.enum.push("full03.delta-rsi.v1");changed=true;}
      if(v.enum?.includes("p10.delta-signal-notional-wfo.v1"))for(const row of indexed)
        if(!v.enum.includes(row.profile_id)){v.enum.push(row.profile_id);changed=true;}
      for(const child of Object.values(v))walk(child);};
    walk(value);
    if(name==="PortalAdmission"){
      value.properties.profiles.items.properties.dataset_id={enum:["vn-stock-daily","crypto-binance-1m"]};changed=true;
    }
    if(file==="research-preflight"&&["DatasetBinding","EffectiveDataBinding"].includes(name)){
      value.properties.provenance={oneOf:[{$ref:"#/components/schemas/VnObservedProvenance"},{$ref:"#/components/schemas/FixedUtcProvenance"}]};
      const conditional=value.allOf[0];
      conditional.then.properties.provenance={$ref:"#/components/schemas/VnObservedProvenance"};
      conditional.else={if:{required:["provenance"]},then:{properties:{timezone:{const:"UTC"},provenance:{$ref:"#/components/schemas/FixedUtcProvenance"}}}};
      changed=true;
    }
    if(name==="Provenance"&&file==="research-current-source")for(const row of indexed){
      const pair=row.descriptor.current_source;
      for(const key of ["source_adapter_id","profile_id"])if(!value.properties[key].enum.includes(pair[key])){
        value.properties[key].enum.push(pair[key]);changed=true;}
      if(!value.oneOf.some(p=>p.properties?.profile_id?.const===pair.profile_id)){
        value.oneOf.push({properties:{source_adapter_id:{const:pair.source_adapter_id},profile_id:{const:pair.profile_id}}});changed=true;}
    }
    if(changed)updates[name]=value;
  }
  if(file==="research-preflight")return amendFull05(JSON.stringify({...document,components:{...document.components,
    schemas:{...schemas,...updates}}},null,2)+"\n",file);
  let result=original;
  for(const[name,value]of Object.entries(updates))result=schemas[name]
    ?replaceComponent(result,name,value,result.indexOf('"schemas": {'))
    :result.replace('"schemas": {',`"schemas": {\n      "${name}": ${JSON.stringify(value)},`);
  return amendFull05(result,file);
}
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
function migration(){
  const binding=full[0].descriptor.alpha_binding_requirements;
  const utilities={"p16.delta-whatif-grid.v1":"3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc",
    "p23.delta-pinned-final-audit.v1":"457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491"};
  const profiles=historicalRecipes.map(r=>({id:r.profile_id,digest:r.profile_digest})).concat(Object.entries(utilities).map(([id,digest])=>({id,digest})));
  let sql=`-- FULL03 append-only identities. No existing AV, index, producer or seal is rewritten.\n`;
  sql+=`ALTER TABLE research.execution_adapter_bindings DROP CONSTRAINT execution_adapter_bindings_adapter_id_check;\n`;
  sql+=`ALTER TABLE research.execution_adapter_bindings ADD CONSTRAINT execution_adapter_bindings_adapter_id_check CHECK(adapter_id IN('p04.delta-rsi.v1','p17.imported-signal-notional.v1','full03.delta-rsi.v1')),\n ADD CONSTRAINT execution_adapter_bindings_full03_exact_check CHECK(adapter_id<>'full03.delta-rsi.v1' OR (alpha_version_id=${quote(binding.alpha_version_id)} AND contract_digest=${quote(binding.adapter_contract_digest)}));\n`;
  sql+=`ALTER TABLE research.run_producers DROP CONSTRAINT run_producers_execution_adapter_id_check, DROP CONSTRAINT run_producers_execution_profile_id_check, DROP CONSTRAINT run_producers_execution_profile_digest_check;\n`;
  sql+=`ALTER TABLE research.run_producers ADD CONSTRAINT run_producers_execution_adapter_id_check CHECK(execution_adapter_id IN('p04.delta-rsi.v1','p17.imported-signal-notional.v1','full03.delta-rsi.v1')),\n ADD CONSTRAINT run_producers_execution_profile_id_check CHECK(execution_profile_id IN(${profiles.map(r=>quote(r.id)).join(',')})),\n ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK(${profiles.map(r=>r.digest===null?`(execution_profile_id=${quote(r.id)} AND execution_profile_digest IS NULL)`:`(execution_profile_id=${quote(r.id)} AND execution_profile_digest=${quote(r.digest)} AND execution_profile_digest IS NOT NULL)`).join('\n OR ')}),\n ADD CONSTRAINT run_producers_full03_exact_check CHECK((execution_adapter_id='full03.delta-rsi.v1')=(execution_profile_id IN(${full.map(r=>quote(r.profile_id)).join(',')})) AND (execution_adapter_id<>'full03.delta-rsi.v1' OR (alpha_version_id=${quote(binding.alpha_version_id)} AND adapter_contract_digest=${quote(binding.adapter_contract_digest)})));\n`;
  const pairs=[{source_adapter_id:'rs02.quantbt-advanced-wfo.v1',profile_id:'rs02.delta-wfo-global.v1'},
    ...historicalRecipes.flatMap(r=>r.descriptor.current_source?[r.descriptor.current_source]:[])];
  sql+=`ALTER TABLE research.current_source_seals_v1 DROP CONSTRAINT current_source_seals_v1_source_profile_pair_check;\nALTER TABLE research.current_source_seals_v1 ADD CONSTRAINT current_source_seals_v1_source_profile_pair_check CHECK(${pairs.map(p=>`(source_adapter_id=${quote(p.source_adapter_id)} AND profile_id=${quote(p.profile_id)})`).join('\n OR ')});\n`;
  for(const r of full){
    sql+=`INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy) VALUES(${quote(r.profile_id)},${quote(r.profile_digest)},${quote(hash(r))},${quote(JSON.stringify(r.descriptor))}::jsonb,${quote(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='descriptor'))))}::jsonb);\n`;
    sql+=`INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope) VALUES(${quote(hash(r))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');\n`;
  }
  sql+=`CREATE OR REPLACE FUNCTION research.run_library_display_kind(profile_id text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,research AS $$\n SELECT CASE profile_id\n WHEN 'p04.fixed-qualification.v1' THEN 'P04'\n WHEN 'p10.vn-stock-daily-observed-fixed.v1' THEN 'VN'\n${historicalRecipes.filter(r=>['DELTA_WFO','DELTA_THREE_WINDOW_OPTIMIZED'].includes(r.adapter_kind)).map(r=>` WHEN ${quote(r.profile_id)} THEN ${quote(r.adapter_kind==='DELTA_WFO'?'WFO':'OPT')}`).join('\n')}\n END; $$;\nSELECT 1;\n`;
  return sql;
}
function bindingMigration(){
  const binding=JSON.parse(readFileSync(new URL("apps/portal/registry/research-full03-delta-binding.v1.json",root)));
  const declared=binding.declared_contract,code=declared.provenance.protected_kernel_sha256;
  return `-- Only the compiled FULL03 AV may share protected kernel bytes with P04.\n-- Imported/source identities keep the original unique rule; no row is rewritten.\nALTER TABLE research.alpha_versions DROP CONSTRAINT alpha_versions_workspace_id_alpha_id_code_digest_entrypoint_key;\nCREATE UNIQUE INDEX alpha_versions_legacy_code_entrypoint_unique ON research.alpha_versions(workspace_id,alpha_id,code_digest,entrypoint) WHERE alpha_version_id<>${quote(binding.alpha_version_id)};\nALTER TABLE research.alpha_versions ADD CONSTRAINT alpha_versions_full03_identity_check CHECK(alpha_version_id<>${quote(binding.alpha_version_id)} OR (alpha_id=${quote(binding.alpha_id)} AND code_digest=${quote(code)} AND entrypoint=${quote(declared.entrypoint)} AND declared_contract=${quote(JSON.stringify(declared))}::jsonb));\nSELECT 1;\n`;
}
function productQualificationMigration(){
  const references=table.qualification_references.filter(ref=>full.some(row=>row.profile_id===ref.profile_id));
  if(references.some(ref=>ref.kind!=="PRODUCT_RUN_QUALIFIED"))return null;
  for(const ref of references){
    const row=full.find(row=>row.profile_id===ref.profile_id);
    if(ref.recipe_digest!==hash(row)||!ref.receipt_path||!ref.receipt_sha256
        ||createHash("sha256").update(readFileSync(new URL(ref.receipt_path,root))).digest("hex")!==ref.receipt_sha256)
      throw new Error("FULL03 exact product proof drift");
  }
  return `-- Append exact FULL03 product proofs; 098 candidate history stays immutable.\nINSERT INTO research.execution_recipe_product_receipts_v1\n (recipe_digest,receipt_path,receipt_sha256,scope) VALUES\n${references.map(ref=>` (${quote(ref.recipe_digest)},${quote(ref.receipt_path)},${quote(ref.receipt_sha256)},'EXACT_PROFILE_PRODUCT_RUN')`).join(',\n')};\n`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const fixture=JSON.parse(readFileSync(new URL('../fixtures/research-full02.protocol-disclosure.synthetic.valid.json',import.meta.url)));
  fixture.protocol.window_series_metadata=Object.fromEntries(['is','oos','holdout'].map(role=>[role,{
    source_observation_count:fixture.protocol.windows[role].bar_count,emitted_point_count:fixture.protocol.window_series[role].length,
    sampling:fixture.protocol.windows[role].bar_count===fixture.protocol.window_series[role].length?'FULL':'MULTI_SERIES_EXTREMA_V1'}]));
  const fixturePath=new URL('../fixtures/research-full03.protocol-display.synthetic.valid.json',import.meta.url),fixtureBytes=JSON.stringify(fixture,null,2)+'\n';
  if(process.argv.includes('--check')){if(readFileSync(fixturePath,'utf8')!==fixtureBytes)throw new Error('FULL03 display fixture drift');}
  else writeFileSync(fixturePath,fixtureBytes);
  for(const file of ["research-foundation","research-progress","research-freeze","research-current-source","research-preflight","research-report"]){
    const path=new URL(`../openapi/${file}.openapi.json`,import.meta.url),old=readFileSync(path,'utf8'),next=amendFull03(old,file);
    if(process.argv.includes('--check')){if(old!==next)throw new Error(`FULL03 transport drift:${file}`);}
    else if(old!==next)writeFileSync(path,next);
  }
  const path=new URL("apps/control-api/migrations/1723680000098_research-full03-indexed-recipes.sql",root),next=migration();
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==next)throw new Error('FULL03 migration drift');}
  else writeFileSync(path,next);
  const bindingPath=new URL("apps/control-api/migrations/1723680000099_research-full03-immutable-av.sql",root),bindingSql=bindingMigration();
  if(process.argv.includes('--check')){if(readFileSync(bindingPath,'utf8')!==bindingSql)throw new Error('FULL03 immutable AV migration drift');}
  else writeFileSync(bindingPath,bindingSql);
  const qualified=productQualificationMigration();
  if(qualified){
    const path=new URL("apps/control-api/migrations/1723680000100_research-full03-product-qualification.sql",root);
    if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==qualified)throw new Error('FULL03 product proof migration drift');}
    else writeFileSync(path,qualified);
  }
}
