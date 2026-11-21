import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { scopedResourceResponseSchema, scopedResourceRowSchemas } from '../../../apps/control-api/src/resource-read/scoped-resource.contract';

const load = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const document = load('../schemas/execution-resource-scoped.v2.schema.json');
const fixtures = load('../fixtures/execution-resource-scoped.synthetic.valid.json');
const openapi = load('../openapi/execution-resource-scoped.openapi.json');
const ajv = new Ajv2020({ strict: false, allErrors: true }); ajv.addSchema(document);
const validate = ajv.getSchema(`${document.$id}#/$defs/ScopedResourceResponse`)!;
const money = ajv.getSchema(`${document.$id}#/$defs/AccountBalancesScopedRow`)!;

describe('ELP2-04 closed Resource360 scoped wire contract', () => {
  it.each(fixtures.cases)('validates checked-in JSON fixture $schema_version $state', value => {
    expect(fixtures.lane).toBe('TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT');
    expect(validate(value), ajv.errorsText(validate.errors)).toBe(true);
    const parsed = scopedResourceResponseSchema.safeParse(value);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(value); // no strip/coercion
  });
  it('publishes four distinct operation response types on existing exact routes', () => {
    expect(Object.keys(openapi.paths)).toHaveLength(4);
    for (const kind of ['Alpha', 'Portfolio', 'Account', 'Binding']) {
      const plural = kind === 'Alpha' ? 'alphas' : kind === 'Portfolio' ? 'portfolios' : kind === 'Account' ? 'accounts' : 'bindings';
      const operation = openapi.paths[`/api/v1/execution/resources/${plural}/{resource_id}`].get;
      expect(operation.operationId).toBe(`executionScoped${kind}ResourceGetV2`);
      expect(operation.responses['200'].content['application/json'].schema.$ref.endsWith(`/$defs/${kind}ScopedResourceWireResponse`)).toBe(true);
      for (const code of [400, 401, 403, 404, 409, 503]) expect(operation.responses[String(code)]).toBeDefined();
      expect(operation.parameters.some((p: any) => /scope|policy|role/.test(p.name))).toBe(false);
    }
  });
  it('all object schemas are closed and every raw row has an explicit finite vocabulary', () => {
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'object') { expect(node.additionalProperties).toBe(false); expect(node.properties).toBeDefined(); }
      Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : visit(value));
    };
    visit(document);
    for (const schema of Object.values(document.$defs) as any[]) {
      if (schema.properties?.profile_environment) expect(schema.required).toContain('profile_environment');
    }
  });
  it.each(['external_account_ref', 'private_key', 'source_cursor', 'physical_balance', 'global_count', 'global_nav'])('rejects source/internal key %s at every boundary', key => {
    for (const rowSchema of Object.values(scopedResourceRowSchemas))
      expect(rowSchema.safeParse({ profile_environment: 'paper', [key]: 'TEST_ONLY' }).success).toBe(false);
    const value = structuredClone(fixtures.cases[0]); value.data.alpha[key] = 'TEST_ONLY';
    expect(validate(value)).toBe(false); expect(scopedResourceResponseSchema.safeParse(value).success).toBe(false);
  });
  it.each(['0', '-0.001', '1234567890123456789.1234567890123456789', null])('preserves exact financial fact %#', total => {
    const row = { profile_environment: 'paper', account_id: 'account_TEST_ONLY', total };
    expect(money(row)).toBe(true); expect(scopedResourceRowSchemas.account_balances.parse(row)).toEqual(row);
  });
  it.each([0, '01', '1e3', '2\n', 'NaN', {}, []])('does not coerce or accept invalid financial fact %#', total => {
    const row = { profile_environment: 'paper', total };
    expect(money(row)).toBe(false); expect(scopedResourceRowSchemas.account_balances.safeParse(row).success).toBe(false);
  });
  it('never interprets a V1 computed financial summary as the scoped shape', () => {
    const value = structuredClone(fixtures.cases[0]); value.schema_version = 'execution.alpha-resource.v1';
    expect(validate(value)).toBe(false); expect(scopedResourceResponseSchema.safeParse(value).success).toBe(false);
    value.schema_version = 'execution.alpha-resource.v2'; value.data.alpha.allocation_by_currency = [{ currency: 'USD', value: '0' }];
    expect(validate(value)).toBe(false); expect(scopedResourceResponseSchema.safeParse(value).success).toBe(false);
  });
  it('keeps projection source identity/timestamps absent even when visible digest exists', () => {
    for (const [field, replacement] of [['epoch', 'GLOBAL_EPOCH'], ['sequence', 9000], ['last_successful_refresh_at', '2026-10-01T00:00:00Z']]) {
      const value = structuredClone(fixtures.cases[0]); value.projection[0][field as string] = replacement;
      expect(validate(value)).toBe(false); expect(scopedResourceResponseSchema.safeParse(value).success).toBe(false);
    }
  });
  it('runtime checks duplicated panel/data facts and truthful coverage', () => {
    const value = structuredClone(fixtures.cases[0]); value.panels.account_balances.coverage.returned_count++;
    expect(scopedResourceResponseSchema.safeParse(value).success).toBe(false);
    value.panels.account_balances.coverage.returned_count--;
    value.data.account_balances[0].total = '0';
    expect(scopedResourceResponseSchema.safeParse(value).success).toBe(false);
  });
  it('bounds every panel to 200 authorized rows without a fabricated continuation', () => {
    const value = structuredClone(fixtures.cases[0]);
    value.panels.account_balances.data.rows = Array.from({ length: 201 }, () => value.data.account_balances[0]);
    expect(validate(value)).toBe(false); expect(scopedResourceResponseSchema.safeParse(value).success).toBe(false);
    const cursor = structuredClone(fixtures.cases[0]); cursor.panels.orders.coverage.next_cursor = 'SOURCE_CURSOR';
    expect(validate(cursor)).toBe(false); expect(scopedResourceResponseSchema.safeParse(cursor).success).toBe(false);
  });
});
