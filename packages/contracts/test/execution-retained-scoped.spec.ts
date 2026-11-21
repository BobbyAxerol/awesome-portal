import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {describe,expect,it} from 'vitest';
import {retainedContextV2Schema} from '../../../apps/control-api/src/execution-v2/retained-context.contract';
const read=file=>JSON.parse(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'));
const fixture=read('fixtures/execution-retained-scoped.synthetic.valid.json');
const validate=new Ajv2020({strict:false,allErrors:true}).compile(read('schemas/execution-retained-review.v2.schema.json'));
describe('ELP2-04 retained metadata V2 scoped contract',()=>{
  it('matches generated/runtime DTO without claiming global source coverage',()=>{
    expect(fixture.lane).toBe('TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT');
    expect(validate(fixture.value)).toBe(true);expect(retainedContextV2Schema.safeParse(fixture.value).success).toBe(true);
    expect(fixture.value.profiles[0].panels[0].history_row_count).toBeNull();
  });
  it.each(['stream_enabled','mutation_enabled','upstream_enabled','live_eligibility','source_refresh_enabled'])('cannot grant %s',key=>{
    const value={...fixture.value,[key]:true};expect(validate(value)).toBe(false);expect(retainedContextV2Schema.safeParse(value).success).toBe(false);
  });
  it('rejects unknown metadata and unsafe counts',()=>{
    for(const delta of [{physical_balance:'10'},{current_row_count:-1},{history_row_count:'0\n'}]){
      const value=structuredClone(fixture.value);Object.assign(value.profiles[0].panels[0],delta);
      expect(validate(value)).toBe(false);expect(retainedContextV2Schema.safeParse(value).success).toBe(false);
    }
  });
  it('does not silently relabel a legacy global metadata response as V2',()=>{
    expect(retainedContextV2Schema.safeParse(read('fixtures/execution-retained-review.valid.json')).success).toBe(false);
  });
});
