import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>JSON.parse(readFileSync(resolve(root,file),'utf8'));
const schema=read('schemas/execution-retained-review.v1.schema.json');
schema.$id='portal.execution.retained-review.v2';schema.properties.schema_version={const:schema.$id};
schema.description='Server-selected V2 scoped retained metadata. Null count/clock means not published, never zero. No global source revision, source digest or historical coverage is implied. V1 compatibility stays unchanged.';
const text={type:'string',minLength:1,maxLength:191};
const state={enum:['PARTIAL','NOT_PUBLISHED','DENIED']};
schema.$defs.Reason={anyOf:[text,{type:'null'}]};
const panel=schema.$defs.Panel,profile=schema.$defs.Profile;
panel.required.push('metadata_state');panel.properties.metadata_state=state;
panel.properties.panel_id=text;panel.properties.screen_id=text;panel.properties.reason_code=text;
panel.properties.current_row_count={type:['integer','null'],minimum:0,maximum:10000};
panel.properties.history_row_count={type:['string','null'],pattern:'^(0|[1-9][0-9]*)$(?![\\s\\S])'};
profile.required.push('metadata_state','metadata_reason_code');
profile.properties.metadata_state=state;profile.properties.metadata_reason_code=text;profile.properties.profile_id=text;
profile.properties.source_payload_digest={anyOf:[text,{type:'null'}]};
const spec=read('openapi/execution-retained-review.openapi.json');
spec.components.schemas.RetainedReviewScopedResponse={$ref:'../schemas/execution-retained-review.v2.schema.json'};
spec.components.schemas.RetainedReviewScopedProfile={$ref:'../schemas/execution-retained-review.v2.schema.json#/$defs/Profile'};
spec.components.schemas.RetainedReviewScopedPanel={$ref:'../schemas/execution-retained-review.v2.schema.json#/$defs/Panel'};
spec.paths['/api/v1/execution/retained-review'].get.responses['200'].content['application/json'].schema={oneOf:[
  {$ref:'#/components/schemas/RetainedReviewResponse'},{$ref:'#/components/schemas/RetainedReviewScopedResponse'}]};
const value=read('fixtures/execution-retained-review.valid.json');value.schema_version=schema.$id;
value.profiles=value.profiles.map((profile,index)=>({...profile,metadata_state:index?'NOT_PUBLISHED':'PARTIAL',
  metadata_reason_code:index?'EXECUTION_READ_PUBLICATION_NOT_QUALIFIED':'EXECUTION_READ_SCOPED_METADATA',
  source_as_of_ms:null,snapshot_observed_ms:null,source_payload_digest:null,panels:profile.panels.map(panel=>({...panel,
    metadata_state:'PARTIAL',reason_code:'EXECUTION_READ_HISTORY_METADATA_NOT_PUBLISHED',history_row_count:null,
    oldest_available_ms:null,newest_available_ms:null,source_as_of_ms:null,observed_at_ms:null}))}));
const fixture={lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',value};
for(const [file,data] of Object.entries({'schemas/execution-retained-review.v2.schema.json':schema,
  'openapi/execution-retained-review.openapi.json':spec,'fixtures/execution-retained-scoped.synthetic.valid.json':fixture})){
  const path=resolve(root,file),bytes=JSON.stringify(data,null,2)+'\n';
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw new Error(`Generated drift: ${file}`);}
  else writeFileSync(path,bytes);
}
