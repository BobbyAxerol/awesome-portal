import { readFileSync, writeFileSync as writeGenerated } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.slice(2).includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Unsupported publication generator argument');
function writeFileSync(path, contents) {
  if (check) {
    if (readFileSync(path, 'utf8') !== contents) throw new Error(`Publication generated file drift: ${path}`);
  } else writeGenerated(path, contents);
}
const pins = {
  'registry.json':'9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67',
  'field-dictionary.json':'aca5c54cce66becbf47ef32d30799e9dfe75a4f3d51df4e3ade0e89c53cbec7e',
  'metric-dependencies.json':'9c945880e821ecec4b5f56f85c5de15d506817cb07984300b824b4f5390c5a31',
};
const sources = Object.fromEntries(Object.entries(pins).map(([name, expected]) => {
  const bytes = readFileSync(resolve(root, 'fixtures/execution-publication-source', name));
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Publication source pin changed: ${name}`);
  return [name, JSON.parse(bytes)];
}));
const registry = sources['registry.json'], dictionary = sources['field-dictionary.json'];
const dependencies = sources['metric-dependencies.json'];
if (registry.schema_version !== 'execution.catalogue-registry.v1' || registry.families.length !== 42 ||
    registry.new_runtime_exports_enabled !== false || dictionary.fields.length !== 31 ||
    dependencies.formula_approved !== true || dependencies.runtime_config_approved !== false)
  throw new Error('Unsupported publication catalogue revision');
const catalogue = {
  schema_version:'portal.execution.publication-catalogue.v1', lane:'SOURCE_CONTRACT_NOT_RUNTIME_ACCEPTANCE',
  source_catalogue_digest:`sha256:${pins['registry.json']}`, field_dictionary_digest:`sha256:${pins['field-dictionary.json']}`,
  metric_dependencies_digest:`sha256:${pins['metric-dependencies.json']}`,
  families:registry.families.map(f => {
    if (f.availability !== 'UNAVAILABLE' || f.availability_reason !== 'NEW_EDGE_V1_EXPORT_NOT_QUALIFIED' ||
        f.history_capability !== 'UNKNOWN' || f.history_full !== false || f.enabled_environments.length !== 0 ||
        Object.values(f.retention).some(v => v !== null)) throw new Error(`Source readiness changed: ${f.id}`);
    return {family_id:f.id, authority_owner:f.owner, grain:f.grain, availability:f.availability,
      reason_code:f.availability_reason, history_capability:f.history_capability, history_full:false,
      retention:f.retention, runtime_enabled:false};
  }),
  fields:dictionary.fields.map(f => ({field_id:f.field_id, scalar_type:f.scalar_type, unit:f.unit,
    availability:'UNAVAILABLE', reason_code:'SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED'})),
  current_page_adapter:{status:'EXISTING_SEPARATE_AUTHORITY',history_capability:'CURRENT_ONLY',stable_snapshot:false,
    authoritative_replay:false,maximum_rows:200,maximum_response_bytes:1048576,total_history_cap:null},
};
const dependencyInputs = Object.fromEntries(Object.entries(dependencies.dependencies).map(([id, required]) => [id, required]));
writeFileSync(resolve(root,'../../apps/control-api/src/execution-v2/publication-source.generated.ts'),
  '// Generated from pinned Edge logical contracts. Do not edit; no runtime qualification.\n' +
  `export const EXECUTION_PUBLICATION_CATALOGUE = ${JSON.stringify(catalogue,null,2)} as const;\n` +
  `export const EXECUTION_METRIC_DEPENDENCIES = ${JSON.stringify(dependencyInputs,null,2)} as const;\n`);
const obj = p => ({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const text = {type:'string',minLength:1,maxLength:256,pattern:'^[^\\u0000-\\u001f\\u007f]+$'};
const id = {type:'string',minLength:1,maxLength:128,pattern:'^[a-z][a-z0-9_]*$(?![\\s\\S])'};
const digest = {type:'string',pattern:'^sha256:[a-f0-9]{64}$(?![\\s\\S])'};
const nullable = s => ({anyOf:[s,{type:'null'}]});
const family = obj({family_id:id,authority_owner:text,grain:text,availability:{const:'UNAVAILABLE'},
  reason_code:{const:'NEW_EDGE_V1_EXPORT_NOT_QUALIFIED'},history_capability:{const:'UNKNOWN'},history_full:{const:false},
  retention:obj(Object.fromEntries(['from_ms','to_ms','duration_ms','proof_ref'].map(k=>[k,{type:'null'}]))),runtime_enabled:{const:false}});
const field = obj({field_id:id,scalar_type:{enum:['DECIMAL','UTC_MS','ID','ENUM','BOOLEAN']},unit:nullable(text),
  availability:{const:'UNAVAILABLE'},reason_code:{const:'SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED'}});
const schema = obj({schema_version:{const:catalogue.schema_version},lane:{const:catalogue.lane},
  source_catalogue_digest:digest,field_dictionary_digest:digest,metric_dependencies_digest:digest,
  families:{type:'array',minItems:1,maxItems:128,items:family},fields:{type:'array',maxItems:128,items:field},
  current_page_adapter:obj(Object.fromEntries(Object.entries(catalogue.current_page_adapter).map(([k,v])=>[k,v===null?{type:'null'}:{const:v}])))});
writeFileSync(resolve(root,'schemas/execution-publication-catalogue.v1.schema.json'),JSON.stringify({
  $schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://schemas.primusspark.com/portal/execution-publication-catalogue.v1.schema.json',
  title:'Pinned logical publication catalogue; not current source readiness',...schema},null,2)+'\n');
const operation = obj({operation_id:text,route_id:text,field_id:text,identity_disposition:text,
  fields:{type:'array',items:obj({name:text,kind:{enum:['BOOLEAN','INTEGER','DECIMAL','TEXT','TIMESTAMP']}})},
  screen_ids:{type:'array',items:text}});
const manifest = obj({schema_version:{const:'portal.execution.eds11r.named-operation-manifest.v1'},
  source_catalogue_sha256:digest,source_contract_revision:text,screen_bound_relation_count:{const:54},
  non_browser_classification_counts:obj({projectionInput:{const:16},auditOnly:{const:13},internalOnly:{const:13}}),
  operations:{type:'array',minItems:54,maxItems:54,items:operation},publication_catalogue:{$ref:'#/components/schemas/PublicationCatalogue'}});
writeFileSync(resolve(root,'openapi/execution-publication-catalogue.openapi.json'),JSON.stringify({openapi:'3.1.0',
  info:{title:'Execution named operations and publication contract inventory',version:'1.0.0'},
  paths:{'/api/v1/execution/manager/operations':{get:{operationId:'executionManagerPublicationCatalogueGet',
    security:[{PortalSession:[]}],description:'Static checked-in contract metadata only. Existing same-origin route. Not source availability, permissions, streaming or runtime activation. No browser relation or upstream selectors.',
    responses:{200:{description:'Legacy operation manifest with additive logical publication inventory',content:{'application/json':{schema:{$ref:'#/components/schemas/ManagerPublicationManifest'}}}},
      401:{description:'Session required'},503:{description:'Contract inventory rejected'}}}}},
  components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'portal_session'}},schemas:{PublicationCatalogue:schema,PublicationFamily:family,PublicationField:field,ManagerPublicationManifest:manifest}}},null,2)+'\n');
writeFileSync(resolve(root,'fixtures/execution-publication-catalogue.source.valid.json'),JSON.stringify(catalogue,null,2)+'\n');
