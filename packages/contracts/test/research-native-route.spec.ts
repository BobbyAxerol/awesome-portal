/** Synthetic wire cases plus the named actual Limit/OCO product fact fixture. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import {describe,it,expect} from 'vitest';
const root=join(__dirname,'..');
const read=(f:string)=>JSON.parse(readFileSync(join(root,f),'utf8'));
describe('native edition input and typed result boundaries',()=>{
 it('accepts immutable native editions and the new Limit/OCO binding with server-owned inputs',()=>{
  const validate=new Ajv2020({strict:false,allErrors:true}).compile(read('schemas/research-requested-spec.v1.schema.json'));
  const base=read('fixtures/research-run-create.reproduction.valid.json').requested_spec;
  const bindings=read('../../apps/portal/registry/research-native-delta-bindings.v1.json');
  expect(bindings.length).toBe(10);
  expect(bindings.at(-1).alpha_version_id).toBe('av_delta_rsi_polynomial_alpha_1_0_12');
  for(const binding of bindings){
   const spec={...base,alpha_binding:{alpha_id:binding.alpha_id,alpha_version_id:binding.alpha_version_id},
    execution_route:binding.declared_contract.execution.execution_route};
   expect(validate(spec),JSON.stringify(validate.errors)).toBe(true);
   expect(validate({...spec,route_params:{reactive:{policy:'caller'}}})).toBe(false);
   expect(validate({...spec,execution_route:'signal_notional'})).toBe(false);
  }
  // Do not weaken legacy intrabar/reactive knob requirements.
  expect(validate({...base,execution_route:'intrabar_bracket'})).toBe(false);
  expect(validate({...base,execution_route:'reactive'})).toBe(false);
 });
 it('publishes exact cost absence separately from an engine-published zero',()=>{
  const doc=read('openapi/research-evidence.openapi.json');
  const result=doc.components.schemas.EvidenceHub.properties.core.properties.native_execution;
  expect(result).toBeTruthy();
  const validate=new Ajv2020({strict:false,allErrors:true}).compile(result);
  const fixture=read('fixtures/research-native-route-result.valid.json');
  expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
  expect(validate({...fixture,funding:{...fixture.funding,total:'0'}})).toBe(false);
  expect(validate({...fixture,fees:{state:'AVAILABLE',total:null,reason_code:null}})).toBe(false);
  expect(validate({...fixture,input_protocol:'DELTA_CLOSE_ORDER_COMMANDS_V1'})).toBe(false);
  expect(validate({...fixture,clock:'KNOWN_CLOSE_NEXT_BAR_INTRABAR'})).toBe(false);
  expect(validate({...fixture,execution_route:'event_driven',input_protocol:'DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1'})).toBe(true);
 });
 it('validates the actual BTC Limit/OCO product facts on Evidence and Progress',()=>{
  // Source: rrun_eea1b8e46155c18f3bec6fe7b15ae646, P10 qualification packet.
  // This small public fact fixture is not a replacement for the private full
  // admission/child/retention/journal receipt, and contains no market tape.
  const fixture=read('fixtures/research-native-limit-oco-result.valid.json');
  for(const [file,schema] of [['evidence','EvidenceHub'],['progress','ProgressRead']]){
   const root=read(`openapi/research-${file}.openapi.json`).components.schemas[schema];
   const boundary=file==='evidence'?root.properties.core.properties.native_execution:root.properties.native_execution;
   const validate=new Ajv2020({strict:false,allErrors:true}).compile(boundary);
   expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
   expect(validate({...fixture,input_protocol:'CALLER_PROVIDED_ORDER_TAPE'})).toBe(false);
  }
 });
 it('BR-S02-16 publishes the identical native fact boundary on Progress',()=>{
  const evidence=read('openapi/research-evidence.openapi.json').components.schemas.EvidenceHub.properties.core.properties.native_execution;
  const progress=read('openapi/research-progress.openapi.json').components.schemas.ProgressRead;
  expect(progress.required).not.toContain('native_execution');
  const result=progress.properties.native_execution;
  expect(result.properties).toEqual(evidence.properties);
  const validate=new Ajv2020({strict:false,allErrors:true}).compile(result);
  const fixture=read('fixtures/research-native-route-result.valid.json');
  expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
  expect(validate({...fixture,funding:{...fixture.funding,total:'0'}})).toBe(false);
  expect(validate({...fixture,clock:'KNOWN_CLOSE_NEXT_BAR_INTRABAR'})).toBe(false);
 });
});
