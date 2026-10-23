import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { scopedResourceResponseSchema, scopedResourceRowSchemas } from '../../../apps/control-api/src/resource-read/scoped-resource.contract';

const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const schema = load('../schemas/execution-resource-scoped.v2.schema.json');
const fixtures = load('../fixtures/execution-resource-portfolio-names.synthetic.valid.json');
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(schema);
describe('Package6 scoped portfolio labels', () => {
  it.each(fixtures.cases)('validates joined and absent portfolio-label fixture', value => {
    const validate = ajv.getSchema(`${schema.$id}#/$defs/ScopedResourceResponse`)!;
    expect(validate(value), ajv.errorsText(validate.errors)).toBe(true);
    expect(scopedResourceResponseSchema.safeParse(value).success).toBe(true);
  });
  it('keeps labels optional and rejects unsafe values or invented reasons', () => {
    for (const key of ['deployments','portfolio_allocations'] as const) {
      const base = {profile_environment:'paper', portfolio_id:'p'};
      expect(scopedResourceRowSchemas[key].safeParse(base).success).toBe(true);
      for (const patch of [{portfolio_name:3}, {portfolio_name:'secret\nlabel'},
        {portfolio_name_reason_code:'OWNER_ALL'}, {portfolio_name:{permission:'all'}}]) {
        expect(scopedResourceRowSchemas[key].safeParse({...base,...patch}).success).toBe(false);
      }
    }
  });
});
