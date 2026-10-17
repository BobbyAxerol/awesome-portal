import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {describe,expect,it} from 'vitest';
import {scopedAdapterFieldsSchema,scopedAdapterResponseSchema} from '../../../apps/control-api/src/execution-v2/profile-adapter.contract';
import {scopedSubjectActivitySchema} from '../../../apps/control-api/src/execution-v2/subject-activity.contract';
import {executionScopedRuntimeManifestSchema,technicalDiagnosticsSchema,technicalHealthSchema} from '../../../apps/control-api/src/execution-v2/technical-read.contract';
import {serviceHeartbeatsPageSchema} from '../../../apps/control-api/src/execution-v2/service-heartbeats.contract';
const spec=JSON.parse(readFileSync(new URL('../openapi/execution-scoped-records.openapi.json',import.meta.url),'utf8'));
const fixtures=JSON.parse(readFileSync(new URL('../fixtures/execution-scoped-records.synthetic.valid.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true});ajv.addSchema(spec,'scoped');
const validators=Object.fromEntries(Object.keys(spec.components.schemas).map(name=>[name,ajv.getSchema(`scoped#/components/schemas/${name}`)!]));
describe('ELP2-04 closed scoped record DTOs',()=>{
  it.each(fixtures.cases)('matches generated and runtime schema $type',({type,value})=>{
    expect(fixtures.lane).toBe('TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT');
    expect(validators[type](value),ajv.errorsText(validators[type].errors)).toBe(true);
    const runtime={ScopedAdapterResponse:scopedAdapterResponseSchema,ScopedSubjectRecordsResponse:scopedSubjectActivitySchema,
      TechnicalHealth:technicalHealthSchema,TechnicalDiagnostics:technicalDiagnosticsSchema,ExecutionScopedRuntimeManifestV2:executionScopedRuntimeManifestSchema,ServiceHeartbeatsPage:serviceHeartbeatsPageSchema};
    expect(runtime[type].safeParse(value).success).toBe(true);
  });
  it.each(['credentials','source_cursor','global_count','global_nav','custody_balance','unknown'])('rejects unpublished/technical field %s',key=>{
    expect(validators.ScopedRecordFields({[key]:'TEST_ONLY'})).toBe(false);
    expect(scopedAdapterFieldsSchema.safeParse({[key]:'TEST_ONLY'}).success).toBe(false);
  });
  it.each(['0','-0.001','1234567890.1234567890123456789',null])('keeps exact decimal and explicit absence %#',price=>{
    expect(validators.ScopedRecordFields({price})).toBe(true);expect(scopedAdapterFieldsSchema.parse({price})).toEqual({price});
  });
  it.each([0,'1e3','01','1\n','9'.repeat(129)])('rejects coerced/malformed money %#',price=>{
    expect(validators.ScopedRecordFields({price})).toBe(false);expect(scopedAdapterFieldsSchema.safeParse({price}).success).toBe(false);
  });
  it('rejects contradictory count, cursor and empty state at the runtime boundary',()=>{
    const original=fixtures.cases.find(item=>item.type==='ScopedSubjectRecordsResponse').value;
    for(const mutate of [value=>value.page.returned_count=0,value=>value.page.limit=0,value=>value.page.has_more=true,value=>value.state='EMPTY',value=>value.coverage.retained_row_count=0]){
      const value=structuredClone(original);mutate(value);expect(scopedSubjectActivitySchema.safeParse(value).success).toBe(false);
    }
  });
  it('limits served relation names and retains legacy-selection boundary in documentation',()=>{
    const value=structuredClone(fixtures.cases[0].value);value.relations.raw_physical_database=value.relations.strategies;
    expect(validators.ScopedAdapterResponse(value)).toBe(false);expect(scopedAdapterResponseSchema.safeParse(value).success).toBe(false);
    for(const path of Object.values(spec.paths) as any[])expect(path.get.description).toContain('server policy only');
  });
  it('publishes an additive explicit technical runtime route without changing V1',()=>{
    const get=spec.paths['/api/v1/execution/runtime-manifest/v2'].get;
    expect(get.operationId).toBe('executionScopedRuntimeManifestGetV2');
    expect(spec.paths['/api/v1/execution/runtime-manifest']).toBeUndefined();
    const valid=fixtures.cases.find(item=>item.type==='ExecutionScopedRuntimeManifestV2').value;
    for(const key of ['source_workspace_id','credentials','command_readiness','global_count'])
      expect(validators.ExecutionScopedRuntimeManifestV2({...valid,[key]:'TEST_ONLY'})).toBe(false);
    for(const mutate of [value=>value.durable_mirror=[],value=>value.durable_mirror[0].profile_id='wrong',
      value=>value.local_projection.profiles[0].lag_ms=0,value=>value.durable_mirror[0].observed_at=valid.read_at_ms+1]){
      const changed=structuredClone(valid);mutate(changed);expect(executionScopedRuntimeManifestSchema.safeParse(changed).success).toBe(false);
    }
  });
});
