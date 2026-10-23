import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { managerDatasetResponse, managerModelQuery } from '../../../apps/control-api/src/execution-v2/manager-model.contract';

const read = (path: string) => JSON.parse(readFileSync(resolve(__dirname, '..', path), 'utf8'));
const api = read('openapi/execution-manager-models.openapi.json');
const sample = read('fixtures/execution-manager-contributors.synthetic.valid.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });

describe('Contributors independent group contract', () => {
  it('publishes a typed group with attribution without breaking old datasets', () => {
    const validate = ajv.compile(read('schemas/execution-manager-dataset.v1.schema.json'));
    for (const value of [sample.value, read('fixtures/execution-manager-dataset.rows.synthetic.valid.json').value]) {
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
      expect(managerDatasetResponse.safeParse(value).success).toBe(true);
    }
    expect(sample.value.group_page).toMatchObject({ returned_count: 1, authorized_filtered_count: 1, next_cursor: null });
    expect(sample.value.groups[0].attribution.name).toBe(sample.value.items[0].name);
  });
  it('keeps row and group limits independent and enforces query parity', () => {
    const validate = ajv.compile(api.components.schemas.ManagerDatasetQuery);
    const base = { environment: 'paper', group_by: ['alpha_id'], limit: 1, group_limit: 200 };
    for (const value of [base, { ...base, group_after: 'opaque' }, { ...base, group_before: 'opaque' }]) {
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
      expect(managerModelQuery.safeParse(value).success).toBe(true);
    }
    for (const value of [{ ...base, group_limit: 201 }, { ...base, group_limit: 0 },
      { ...base, group_after: 'a', group_before: 'b' }, { ...base, group_by: [] },
      { environment: 'paper', group_after: 'a' }]) {
      expect(validate(value), JSON.stringify(value)).toBe(false);
      expect(managerModelQuery.safeParse(value).success).toBe(false);
    }
    for (const path of Object.values(api.paths) as any[]) {
      if (!path.get.operationId.endsWith('GetV1') || !path.get.parameters.some((p: any) => p.name === 'group_by')) continue;
      expect(path.get.parameters.map((p: any) => p.name)).toEqual(expect.arrayContaining(['group_limit', 'group_after', 'group_before']));
    }
  });
  it('rejects contradictory attribution and group completeness', () => {
    for (const mutate of [
      (v: any) => { v.groups[0].attribution.alpha_id = 'different'; },
      (v: any) => { v.groups[0].attribution.name = null; },
      (v: any) => { v.group_page.authorized_filtered_count = 2; },
      (v: any) => { v.group_page.returned_count = 0; },
    ]) {
      const value = structuredClone(sample.value); mutate(value);
      expect(managerDatasetResponse.safeParse(value).success).toBe(false);
    }
  });
});
