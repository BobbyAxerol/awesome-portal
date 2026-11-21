import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {describe,expect,it} from 'vitest';
import {managerScopedFactsSchema,scopedManagerResponseSchema} from '../../../apps/control-api/src/manager-lists/scoped-manager.contract';
const document=JSON.parse(readFileSync(new URL('../schemas/execution-manager-scoped.v1.schema.json',import.meta.url),'utf8'));
const fixtures=JSON.parse(readFileSync(new URL('../fixtures/execution-manager-scoped.synthetic.valid.json',import.meta.url),'utf8'));
const spec=JSON.parse(readFileSync(new URL('../openapi/execution-manager-lists.openapi.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true}); ajv.addSchema(document);
const validate=ajv.getSchema(`${document.$id}#/$defs/ManagerScopedResponse`)!;
const facts=ajv.getSchema(`${document.$id}#/$defs/ManagerScopedFacts`)!;
describe('ELP2-04 manager scoped generated contract',()=>{
  it.each(fixtures.cases)('accepts canonical synthetic $surface DTO',value=>{
    expect(fixtures.lane).toBe('TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT');
    expect(validate(value),ajv.errorsText(validate.errors)).toBe(true);
    expect(scopedManagerResponseSchema.safeParse(value).success).toBe(true);
  });
  it('publishes a server-selected union on all four existing operations',()=>{
    expect(Object.keys(spec.paths)).toHaveLength(4);
    for(const path of Object.values(spec.paths) as any[]){
      const alternatives=path.get.responses['200'].content['application/json'].schema.oneOf;
      expect(alternatives).toHaveLength(2);
      expect(alternatives[1].$ref).toContain('execution-manager-scoped.v1.schema.json');
    }
  });
  it.each(['private_key','source_cursor','physical_balance','global_nav','global_count','unknown'])('rejects forbidden field %s',key=>{
    const value={[key]:'TEST_ONLY'};expect(facts(value)).toBe(false);expect(managerScopedFactsSchema.safeParse(value).success).toBe(false);
  });
  it.each(['0','-0.001','1234567890123456789.1234567890123456789','9'.repeat(128),null])('preserves exact value %#',allocation=>{
    expect(facts({allocation})).toBe(true);expect(managerScopedFactsSchema.parse({allocation})).toEqual({allocation});
  });
  it.each([0,'1e3','1\n','01','9'.repeat(129),{},[]])('rejects coerced or malformed money %#',allocation=>{
    expect(facts({allocation})).toBe(false);expect(managerScopedFactsSchema.safeParse({allocation}).success).toBe(false);
  });
  it('aligns Unicode identifier bounds and control character exclusion',()=>{
    for(const name of ['😀'.repeat(256),'a'.repeat(256)]){
      expect(facts({name})).toBe(true);expect(managerScopedFactsSchema.safeParse({name}).success).toBe(true);
    }
    for(const name of ['😀'.repeat(257),'bad\n','bad\u007f']){
      expect(facts({name})).toBe(false);expect(managerScopedFactsSchema.safeParse({name}).success).toBe(false);
    }
  });
  it('runtime rejects inconsistent counts and missing continuation',()=>{
    const value=structuredClone(fixtures.cases[0]);value.page.returned_count=2;
    expect(scopedManagerResponseSchema.safeParse(value).success).toBe(false);
    value.page.returned_count=1;value.page.has_more=true;
    expect(scopedManagerResponseSchema.safeParse(value).success).toBe(false);
  });
});
