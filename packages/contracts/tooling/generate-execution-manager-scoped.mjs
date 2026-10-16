import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const nullable=s=>({anyOf:[s,{type:'null'}]});
const text={type:'string',minLength:1,maxLength:256,pattern:'^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])'};
const decimal={type:'string',maxLength:128,pattern:'^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])'};
const integer={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const cursor=nullable({type:'string',minLength:1,maxLength:4096,pattern:'^[A-Za-z0-9._-]+$(?![\\s\\S])'});
const ref=n=>({$ref:`#/$defs/${n}`});
const facts=obj({
  ...Object.fromEntries(['alpha_id','alpha_version_id','portfolio_id','deployment_id','account_id','binding_id'].map(k=>[k,text])),
  ...Object.fromEntries(['name','state','stage','venue','currency','base_currency'].map(k=>[k,nullable(text)])),
  ...Object.fromEntries(['allocation','balance_total','balance_free','balance_locked','realized_pnl','unrealized_pnl','net_pnl','exposure'].map(k=>[k,nullable(decimal)])),
  updated_at_ms:nullable(integer)},[]);
const item=obj({environment:{enum:['paper','sandbox','live']},identity:ref('ManagerScopedFacts'),
  instances:{type:'array',maxItems:2000,items:ref('ManagerScopedFacts')},
  financial_facts:{type:'array',maxItems:8000,items:obj({kind:{enum:['ALLOCATION','INTERNAL_ACCOUNT_BALANCE','POSITION_PNL']},facts:ref('ManagerScopedFacts')})},
  financial_totals:{type:'array',maxItems:200,items:ref('ManagerScopedFacts')},is_full_resource:{type:'boolean'},
  financial_availability:obj({state:{enum:['AVAILABLE','PARTIAL','NOT_PUBLISHED']},reason_code:{enum:['AUTHORIZED_RETAINED_FACTS','SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE','SOURCE_FACTS_NOT_PUBLISHED']}})});
const response=obj({schema_version:{const:'portal.execution.manager-scoped.v1'},surface:{enum:['ALPHA_FLEET','PORTFOLIOS','BINDINGS','BINDING_DETAIL']},
  workspace_id:text,environment:{enum:['all','paper','sandbox','live']},record_authority:{const:'PORTAL_PROJECTION'},source_authority:{const:'TRADING_SYSTEM'},read_at_ms:integer,
  read_scope:obj({visibility:{const:'SCOPED'},coverage:{const:'AUTHORIZED_ONLY'},totals_scope:{const:'VISIBLE_ROWS_ONLY'},policy_revisions:{type:'array',maxItems:3,items:text}}),
  profile_dispositions:{type:'array',maxItems:3,items:obj({environment:{enum:['paper','sandbox','live']},state:{enum:['PARTIAL','DENIED','UNAVAILABLE']},reason_code:nullable(text)})},
  completeness:{const:'PARTIAL'},reason_code:{const:'RETAINED_CURRENT_PAGE_NOT_TOTAL_HISTORY'},
  page:obj({visible_count:integer,returned_count:{type:'integer',minimum:0,maximum:100},limit:{type:'integer',minimum:1,maximum:100},
    maximum_response_bytes:{const:1048576},has_more:{type:'boolean'},next_cursor:cursor,previous_cursor:cursor}),
  items:{type:'array',maxItems:100,items:ref('ManagerScopedItem')}});
response.description='Server-selected scoped DTO, never selected by a browser toggle. Current authority before aggregation and delivery. Exact decimal strings; omitted means withheld/unpublished, null means explicit absence. Financial totals only sum authorized facts attributable to this item, partitioned by currency; not complete NAV. Runtime enforces page/count/cursor consistency and 1 MiB response cap. No global count or revision metadata.';
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://contracts.primusspark.com/execution-manager-scoped.v1.schema.json',
  $defs:{ManagerScopedFacts:facts,ManagerScopedItem:item,ManagerScopedResponse:response}};
const spec=JSON.parse(readFileSync(resolve(root,'openapi/execution-manager-lists.openapi.json'),'utf8'));
const target='../schemas/execution-manager-scoped.v1.schema.json#/$defs/ManagerScopedResponse';
for(const [route,path] of Object.entries(spec.paths)){
  const op=path.get,content=op.responses['200'].content['application/json'];
  const legacy=content.schema.oneOf?.find(s=>s.$ref!==target)??content.schema;
  content.schema={oneOf:[legacy,{$ref:target}]};
  op.responses['200'].description='Legacy compatibility or scoped V2 selected solely by durable server policy. Scoped page counts and totals cover authorized rows only. private, no-store.';
  for(const status of [400,401,403,404,409,503]) op.responses[status]??={description:'Typed refusal: invalid query, current authority, scope/cursor revision or unavailable qualified publication. No hidden data.'};
  if(route.endsWith('/portfolios')){
    for(const [name,parameterSchema] of Object.entries({after:{type:'string',maxLength:4096},before:{type:'string',maxLength:4096},limit:{type:'integer',minimum:1,maximum:100}})){
      if(!op.parameters.some(parameter=>parameter.name===name))op.parameters.push({name,in:'query',required:false,schema:parameterSchema,description:'Scoped V2 pagination only; supplying this on legacy authority is rejected, not ignored.'});
    }
  }
}
const value={schema_version:'portal.execution.manager-scoped.v1',surface:'ALPHA_FLEET',workspace_id:'workspace_TEST_ONLY',environment:'paper',
  record_authority:'PORTAL_PROJECTION',source_authority:'TRADING_SYSTEM',read_at_ms:1790812800000,
  read_scope:{visibility:'SCOPED',coverage:'AUTHORIZED_ONLY',totals_scope:'VISIBLE_ROWS_ONLY',policy_revisions:['TEST_ONLY-policy']},
  profile_dispositions:[{environment:'paper',state:'PARTIAL',reason_code:null}],
  completeness:'PARTIAL',reason_code:'RETAINED_CURRENT_PAGE_NOT_TOTAL_HISTORY',page:{visible_count:1,returned_count:1,limit:50,maximum_response_bytes:1048576,has_more:false,next_cursor:null,previous_cursor:null},
  items:[{environment:'paper',identity:{alpha_id:'alpha_TEST_ONLY',alpha_version_id:'version_TEST_ONLY',portfolio_id:'portfolio_TEST_ONLY',name:'TEST_ONLY Alpha'},instances:[],
    financial_facts:[{kind:'ALLOCATION',facts:{currency:'USD',allocation:'100.1234567890123456789'}}],financial_totals:[{currency:'USD',allocation:'100.1234567890123456789'}],
    is_full_resource:false,financial_availability:{state:'PARTIAL',reason_code:'SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE'}}]};
const fixtures={lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',cases:[value,{...value,surface:'BINDINGS',page:{...value.page,visible_count:0,returned_count:0},items:[]}]};
for(const [file,data] of Object.entries({'schemas/execution-manager-scoped.v1.schema.json':schema,'openapi/execution-manager-lists.openapi.json':spec,'fixtures/execution-manager-scoped.synthetic.valid.json':fixtures})){
  const path=resolve(root,file),bytes=JSON.stringify(data,null,2)+'\n';
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw new Error(`Generated drift: ${file}`);}
  else writeFileSync(path,bytes);
}
