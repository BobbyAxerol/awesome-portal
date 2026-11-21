/** Three required native input families, immutable fixed Delta editions first. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),path='apps/portal/registry/research-execution-recipes.v1.json';
const table=JSON.parse(readFileSync(new URL(path,root)));
const base=JSON.parse(readFileSync(new URL('apps/portal/registry/research-full03-delta-binding.v1.json',root)));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const implementation='apps/portal/backend/src/portal_api/adapters/research_native_routes.py';
const codeHash=createHash('sha256').update(readFileSync(new URL(implementation,root))).digest('hex');
const native=JSON.parse(readFileSync(new URL('apps/portal/registry/research-native-delta-bindings.v1.json',root)));
for(const [i,route] of ['intrabar_bracket','reactive','event_driven'].entries()){
 // Once persisted by append109, even a failed candidate is immutable. Fixes
 // get new Alpha/profile editions; never rewrite its diagnostic run binding.
 const prefix=`p10.delta-${route.replaceAll('_','-')}-fixed-1h.v`;
 const predecessors=table.recipes.filter(r=>r.profile_id.startsWith(prefix));
 const matching=predecessors.find(r=>r.descriptor.native_input.adapter_sha256===codeHash);
 const revision=matching?Number(matching.profile_id.slice(prefix.length)):
  Math.max(0,...predecessors.map(r=>Number(r.profile_id.slice(prefix.length))))+1;
 const edition=i+3*revision;
 const id=`p10.delta-${route.replaceAll('_','-')}-fixed-1h.v${revision}`,version=`1.0.${edition}`;
 const declared={...base.declared_contract,version,timeframes:['1h'],
  execution:{...base.declared_contract.execution,execution_route:route,parameter_mode:'FIXED_NATIVE_DELTA_V1'},
  provenance:{...base.declared_contract.provenance,native_adapter_sha256:codeHash}};
 const binding={schema_version:'research.native-delta-binding.v1',alpha_id:base.alpha_id,
  alpha_version_id:`av_delta_rsi_polynomial_alpha_1_0_${edition}`,declared_contract:declared,fixed_parameters:base.fixed_parameters};
 binding.adapter_contract_digest=hash(binding);
 const oldBinding=native.find(b=>b.alpha_version_id===binding.alpha_version_id);
 if(oldBinding&&hash(oldBinding)!==hash(binding))throw Error('PERSISTED_NATIVE_BINDING_IMMUTABLE');
 if(!oldBinding)native.push(binding);
 const existingIndex=table.recipes.findIndex(r=>r.profile_id===id);
 const old=table.recipes[0],row=structuredClone(old);
 row.profile_id=id;row.adapter_kind='DELTA_FIXED';row.source_requirement='FULL03_IMMUTABLE_DELTA_BINDING';
 row.work_schema_version='research.native-fixed-work.v1';row.resource_class='research-native-fixed-v1';
 row.budgets={...old.budgets,cpu_seconds:90,wall_seconds:180,file_bytes:16*1024**2,planning_max_bars:20_000,max_warmup_bars:300};
 row.feature_flags=['FEATURE_RESEARCH_RUN_PRODUCER','FEATURE_RESEARCH_FULL06_PROFILE'];
 row.descriptor={schema_version:'research.native-route-profile.v1',profile_id:id,adapter_id:'full03.delta-rsi.v1',
  adapter_contract_digest:binding.adapter_contract_digest,engine_release_id:'er_quantbt_111',execution_route:route,
  requested_spec_version:'research.requested-spec.v1',protocol:'three_window_decay',timeframe:'1h',dataset_id:'crypto-binance-1m',
  max_span_days:92,child_limits:{cpu_seconds:90,wall_seconds:180},
  alpha_binding_requirements:{alpha_id:binding.alpha_id,alpha_version_id:binding.alpha_version_id,
   adapter_id:'full03.delta-rsi.v1',adapter_contract_digest:binding.adapter_contract_digest,warmup_bars:300},
  source_clock:{bar_interval_ms:3_600_000,clock_basis:'FIXED_UTC_INTERVAL_V1',source_timezone:'UTC',warmup_semantics:'FIXED_INTERVAL_PREDECESSORS_V1'},
  native_input:{schema_version:'research.native-delta-input.v1',adapter_sha256:codeHash,symbol_policy:'BTC_ETH_SOL_SINGLE_SYMBOL',
   signal_authority:'PROTECTED_DELTA_CLOSE_ONLY',target_notional:'2000',position_unit:'CONTRACT_QUANTITY',
   execution_clock:route==='intrabar_bracket'?'KNOWN_CLOSE_NEXT_BAR_INTRABAR':'KNOWN_CLOSE_NEXT_BAR_CLOSE',
   bracket:route==='intrabar_bracket'?{stop_fraction:'0.013',take_profit_fraction:'0.026',level_mode:'percent_distance'}:null,
   account:{initial_capital:'20000',leverage:'3',one_way_fee_rate:'0.0005',funding_enabled:false},
   optimizer:'NOT_APPLICABLE_FIXED_DELTA_INPUT_NOT_SCALAR_OPTIMIZER'}};
 row.profile_digest=hash(row.descriptor);
 row.public_profile={...old.public_profile,profile_id:id,execution_route:route,max_span_days:92,
  requested_spec_versions:['research.requested-spec.v1'],dataset_id:'crypto-binance-1m'};
 const ref={profile_id:id,recipe_digest:hash(row),kind:'CANDIDATE_NOT_QUALIFIED',receipt_path:null,receipt_sha256:null};
 if(existingIndex>=0){const qi=table.qualification_references.findIndex(q=>q.profile_id===id);
  if(table.qualification_references[qi].kind!=='CANDIDATE_NOT_QUALIFIED'){
   if(hash(table.recipes[existingIndex])!==hash(row))throw Error('QUALIFIED_NATIVE_DESCRIPTOR_IMMUTABLE');
  }else if(hash(table.recipes[existingIndex])!==hash(row))throw Error('PERSISTED_NATIVE_DESCRIPTOR_IMMUTABLE');
 }else{table.recipes.push(row);table.qualification_references.push(ref);}
}
writeFileSync(new URL('apps/portal/registry/research-native-delta-bindings.v1.json',root),JSON.stringify(native,null,2)+'\n');
writeFileSync(new URL('apps/control-api/src/research/native-delta-bindings.generated.ts',root),'// Generated from the native binding registry; do not hand-edit.\nexport const NATIVE_DELTA_BINDING_TABLE = '+JSON.stringify(native,null,2)+';\n');
writeFileSync(new URL(path,root),JSON.stringify(table,null,2)+'\n');
console.log('Appended3 current native fixed candidates; preserved historical editions. Product proof still required.');
