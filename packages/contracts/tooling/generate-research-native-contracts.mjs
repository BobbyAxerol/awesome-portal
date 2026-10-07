/** Additive native facts, never replace accepted scalar/WFO representations. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {replaceComponent} from './generate-research-progress-truth.mjs';
const root=new URL('../../../',import.meta.url),check=process.argv.includes('--check');
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.native-route-profile.v1');
// Keep legacy route knobs exact. Only the new immutable native editions use
// an empty route_params object: their input contract is bound server-side.
for(const file of ['research-requested-spec.v1','research-requested-spec.v2']){
 const path=new URL(`packages/contracts/schemas/${file}.schema.json`,root),old=readFileSync(path,'utf8'),doc=JSON.parse(old);
 for(const condition of doc.allOf??[]){const route=condition.if?.properties?.execution_route?.const;
  const editions=rows.filter(r=>r.descriptor.execution_route===route);
  if(editions.length&&route!=='event_driven')condition.if.not={properties:{alpha_binding:{type:'object',required:['alpha_version_id'],properties:{alpha_version_id:{enum:editions.map(r=>r.descriptor.alpha_binding_requirements.alpha_version_id)}}}},required:['alpha_binding']};
 }
 for(const row of rows){const id=row.descriptor.alpha_binding_requirements.alpha_version_id;
  if(!doc.allOf.some(c=>c.if?.properties?.alpha_binding?.properties?.alpha_version_id?.const===id))doc.allOf.push({
   if:{required:['alpha_binding'],properties:{alpha_binding:{type:'object',required:['alpha_version_id'],properties:{alpha_version_id:{const:id}}}}},
   then:{properties:{execution_route:{const:row.descriptor.execution_route},route_params:{type:'object',maxProperties:0}}}});
 }
 const next=JSON.stringify(doc,null,2)+'\n';if(check){if(next!==old)throw Error('Native requested-spec drift '+file);}else if(next!==old)writeFileSync(path,next);
}
const obj=p=>({type:'object',additionalProperties:false,required:Object.keys(p),properties:p});
const nullable=s=>({anyOf:[s,{type:'null'}]}),en=(...v)=>({enum:v});
const cost=obj({state:en('AVAILABLE','NOT_PUBLISHED'),total:nullable({type:'string',pattern:'^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$',maxLength:96}),reason_code:nullable(en('NATIVE_RESULT_SERIES_NOT_PUBLISHED'))});
cost.oneOf=[{properties:{state:{const:'AVAILABLE'},total:{type:'string'},reason_code:{type:'null'}}},{properties:{state:{const:'NOT_PUBLISHED'},total:{type:'null'},reason_code:{type:'string'}}}];
const result=obj({schema_version:{const:'research.native-route-result.v1'},execution_route:en('intrabar_bracket','reactive','event_driven'),
 authority:{const:'PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL'},input_protocol:en('DELTA_CLOSE_BRACKET_INTENTS_V1','DELTA_CLOSE_STATEFUL_CALLBACK_V1','DELTA_CLOSE_ORDER_COMMANDS_V1'),
 clock:en('KNOWN_CLOSE_NEXT_BAR_INTRABAR','KNOWN_CLOSE_NEXT_BAR_CLOSE'),position_unit:{const:'CONTRACT_QUANTITY'},target_notional:{const:'2000'},
 fees:cost,funding:cost,cost_scope:{const:'FULL_CHILD_TAPE'},fills_count:{type:'integer',minimum:0,maximum:100000},orders_count:nullable({type:'integer',minimum:0,maximum:100000}),replay_authority:{const:'RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS'}});
result.oneOf=[['intrabar_bracket','DELTA_CLOSE_BRACKET_INTENTS_V1','KNOWN_CLOSE_NEXT_BAR_INTRABAR'],
 ['reactive','DELTA_CLOSE_STATEFUL_CALLBACK_V1','KNOWN_CLOSE_NEXT_BAR_CLOSE'],
 ['event_driven','DELTA_CLOSE_ORDER_COMMANDS_V1','KNOWN_CLOSE_NEXT_BAR_CLOSE']]
 .map(([route,protocol,clock])=>({properties:{execution_route:{const:route},input_protocol:{const:protocol},clock:{const:clock}}}));
for(const file of ['research-foundation','research-run-create','research-progress','research-evidence','research-split','research-search','research-freeze','research-replay','research-report','research-attempt-lineage','research-current-source']){
 const path=new URL(`packages/contracts/openapi/${file}.openapi.json`,root),old=readFileSync(path,'utf8'),doc=JSON.parse(old);let next=old;
 for(const [name,raw]of Object.entries(doc.components.schemas)){
  const value=structuredClone(raw);let changed=false;
  const walk=node=>{if(!node||typeof node!=='object')return;
   if(node.enum?.includes('p10.delta-signal-notional-wfo.v1'))for(const row of rows)if(!node.enum.includes(row.profile_id)){node.enum.push(row.profile_id);changed=true;}
   if(node.enum?.includes('p04.delta-rsi.v1')&&node.enum.includes('p17.imported-signal-notional.v1')&&!node.enum.includes('full03.delta-rsi.v1')){node.enum.push('full03.delta-rsi.v1');changed=true;}
   if(node.properties?.execution_adapter_id&&file==='research-progress'){node.properties.native_execution=result;changed=true;}
   if(node.properties?.source_adapter_id&&name==='EvidenceHub'){node.properties.native_execution=result;changed=true;}
   if(file==='research-replay'&&node.properties?.replay_contract){
    const ids=node.properties.id, contracts=node.properties.replay_contract;
    const add=(s,values)=>{if(s?.const==='signal_notional'){delete s.const;s.enum=['signal_notional',...values];changed=true;}
      else if(s?.enum){for(const v of values)if(!s.enum.includes(v)){s.enum.push(v);changed=true;}}
      else for(const child of s?.anyOf??[])add(child,values);};
    add(ids,['intrabar_bracket','reactive','event_driven']);
    add(contracts,['P17_NATIVE_FIXED_EQUITY_SAMPLE_V1']);
   }
   for(const child of Object.values(node))walk(child);
  };walk(value);
  if(name==='LaneNotApplicable'&&!value.properties.lane.properties.run_profile.enum.includes('NATIVE_FIXED_QUALIFICATION')){
   value.properties.lane.properties.run_profile.enum.push('NATIVE_FIXED_QUALIFICATION');changed=true;
  }
  if(name==='PortalAdmission'){
   const profiles=value.properties.profiles;
   profiles.maxItems=table.recipes.length-1;
   profiles.allOf=table.recipes.filter(r=>r.adapter_kind!=='IMPORTED_FIXED').map(r=>({
    contains:{type:'object',required:['profile_id'],properties:{profile_id:{const:r.profile_id}}},minContains:0,maxContains:1}));
   changed=true;
  }
  if(file==='research-foundation'&&name==='AtlasRoute'){
   value.properties.recipes_enabled={type:'array',maxItems:1024,uniqueItems:true,
    items:{type:'string',minLength:1,maxLength:191},
    description:'Current enabled recipe IDs for this route/release. Not an actor, Alpha, dataset or timeframe grant. Exact setup and fresh preflight remain authoritative.'};
   value.properties.axes_scope={const:'PINNED_ENGINE_CATALOGUE_NOT_RUNTIME_ADMISSION'};
   changed=true;
  }
  if(file==='research-progress'&&name==='ProgressRead'){
   value.properties.native_execution={...result,
    description:'Exact persisted native sidecar bound to workspace/run/current worker/source sequence and digest. Absent before a matching source receipt; never inferred from route or engine counter.'};
   changed=true;
  }
  if(file==='research-evidence'&&name==='Metric'){
   value.properties.count_semantics={const:'POSITION_REGIMES_INCLUDING_INITIAL_STATE_NOT_EXECUTIONS',
    description:'Native num_trades counts the initial position regime plus position changes per symbol, even for an all-zero series. Not fill count or round-trip executions. Original engine integer is preserved.'};
   changed=true;
  }
  if(changed)next=replaceComponent(next,name,value,next.indexOf('"schemas": {'));
 }
 if(check){if(next!==old)throw Error(`Native contract drift ${file}`);}else if(next!==old)writeFileSync(path,next);
}
const fixture={schema_version:'research.native-route-result.v1',execution_route:'reactive',authority:'PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL',input_protocol:'DELTA_CLOSE_STATEFUL_CALLBACK_V1',clock:'KNOWN_CLOSE_NEXT_BAR_CLOSE',position_unit:'CONTRACT_QUANTITY',target_notional:'2000',
 fees:{state:'AVAILABLE',total:'0',reason_code:null},funding:{state:'NOT_PUBLISHED',total:null,reason_code:'NATIVE_RESULT_SERIES_NOT_PUBLISHED'},cost_scope:'FULL_CHILD_TAPE',fills_count:0,orders_count:null,replay_authority:'RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS'};
const path=new URL('packages/contracts/fixtures/research-native-route-result.valid.json',root),text=JSON.stringify(fixture,null,2)+'\n';
if(check){if(readFileSync(path,'utf8')!==text)throw Error('Native fixture drift');}else writeFileSync(path,text);

// Canonical presentation fixtures only. The pinned source/legacy captures and
// real receipts/seals are never rewritten by a presentation generator.
for(const name of ['temporal','causal-inner']){
 const path=new URL(`packages/contracts/fixtures/research-foundation.portal-admission-${name}.valid.json`,root);
 const old=readFileSync(path,'utf8'),doc=JSON.parse(old);
 for(const profile of doc.profiles){
  const row=table.recipes.find(r=>r.profile_id===profile.profile_id);
  if(!row)throw Error('Unknown fixture recipe '+profile.profile_id);
  profile.early_stopping_policy=row.public_profile.trial_count.max>1?'OPTIONAL':'FORBIDDEN';
 }
 const next=JSON.stringify(doc,null,2)+'\n';
 if(check){if(next!==old)throw Error('Runtime admission fixture drift '+name);}else if(next!==old)writeFileSync(path,next);
}
for(const name of ['current','historical']){
 const path=new URL(`packages/contracts/fixtures/research-foundation.atlas-presented-${name}.valid.json`,root);
 const old=readFileSync(path,'utf8'),doc=JSON.parse(old);
 if(doc.atlas)for(const route of doc.atlas.routes){
  route.axes_scope='PINNED_ENGINE_CATALOGUE_NOT_RUNTIME_ADMISSION';
  route.recipes_enabled=[...new Set(doc.portal_admission.profiles.filter(p=>p.state==='ENABLED'
   &&p.engine_release_id===doc.selected_release_id&&p.execution_route===route.route_id).map(p=>p.profile_id))].sort();
 }
 // Preserve the runtime wire object's insertion order (the legacy validator
 // hashes wire JSON). Fixture formatting/order must not make a different ETag.
 const wireAdmission=doc.portal_admission?{...doc.portal_admission,profiles:doc.portal_admission.profiles.map(profile=>{
  const row=table.recipes.find(r=>r.profile_id===profile.profile_id);
  if(!row)throw Error('Unknown fixture recipe '+profile.profile_id);
  const {profile_id,...facts}=row.public_profile;
  // Runtime policy overlay: do not rewrite the immutable recipe descriptor.
  profile.early_stopping_policy=row.public_profile.trial_count.max>1?'OPTIONAL':'FORBIDDEN';
  return {profile_id,state:profile.state,reason:profile.reason,...facts,trial_count:profile.trial_count,
   early_stopping_policy:profile.early_stopping_policy};
 })}:null;
 const key=doc.atlas?`research.atlas-presentation.v3:${doc.atlas.manifest_revision}:${doc.selected_release_id}:::${JSON.stringify(wireAdmission)}`
  :`research.atlas-presentation.v3:${JSON.parse(readFileSync(new URL('packages/contracts/fixtures/research-foundation.atlas-current.valid.json',root))).atlas.manifest_revision}:${doc.selected_release_id}:historical-identity`;
 doc.etag=`W/"research-atlas-${createHash('sha256').update(key).digest('hex').slice(0,24)}"`;
 const next=JSON.stringify(doc,null,2)+'\n';
 if(check){if(next!==old)throw Error('Native Atlas presentation fixture drift '+name);}else if(next!==old)writeFileSync(path,next);
}
