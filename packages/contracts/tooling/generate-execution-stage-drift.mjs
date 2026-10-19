import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const write = (path, value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (check) { if (readFileSync(resolve(root, path), 'utf8') !== bytes) throw new Error(`Stage drift contract drift: ${path}`); }
  else writeFileSync(resolve(root, path), bytes);
};
const obj = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const nullable = value => ({ anyOf: [value, { type: 'null' }] });
const array = items => ({ type: 'array', maxItems: 20_000, items });
const decimal = { type: 'string', maxLength: 128, pattern: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])' };
const currency = { type: 'string', minLength: 1, maxLength: 32, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$(?![\\s\\S])' };
const reasons = ['EXECUTION_PROFILE_READ_DISABLED', 'PHASE2_PROJECTION_PROFILE_NOT_CONFIGURED',
  'PHASE2_PROJECTION_NOT_READY', 'PHASE2_PROJECTION_STALE_CEILING_EXCEEDED', 'PROFILE_UNAVAILABLE',
  'NO_DEPLOYMENT_IN_STAGE', 'HISTORY_MIRROR_NOT_AVAILABLE', 'NO_EQUITY_IN_WINDOW', 'NO_EQUITY_FOR_DAY',
  'EQUITY_DECIMAL_INVALID', 'EQUITY_CURRENCY_NOT_PUBLISHED', 'MIXED_CURRENCIES_NOT_AGGREGATED'];
const stage = obj({ deployed: { type: 'boolean' }, reason_code: nullable({ enum: reasons }),
  currency: nullable(currency), series: array(nullable(decimal)), series_reason_codes: array(nullable({ enum: reasons })) });
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.primusspark.com/portal/execution-alpha-stage-drift.v2.schema.json',
  title: 'Opt-in exact retained alpha daily closes, not certified stage drift',
  ...obj({ schema_version: { const: 'portal.execution.alpha-stage-drift.v2' },
    alpha_id: { type: 'string', minLength: 1, maxLength: 192, pattern: '^[A-Za-z0-9._:-]+$(?![\\s\\S])' },
    qualification: { const: 'RETAINED_OBSERVATIONS_NOT_FINANCIAL_CERTIFICATION' },
    window: obj({ days: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      requested_days: nullable({ type: 'integer', minimum: 2, maximum: 365 }),
      basis: { const: 'PORTAL_SGP_HISTORY_MIRROR' },
      daily_basis: { const: 'LAST_CLOSE_PER_DAY_SUMMED_ACROSS_ACCOUNTS_SAME_CURRENCY' } }),
    calendar: { ...array({ type: 'string', format: 'date' }), uniqueItems: true },
    stages: obj({ paper: stage, sandbox: stage, live: stage }),
    research_binding: obj({ state: { const: 'UNAVAILABLE' },
      reason_code: { const: 'N28_RESEARCH_EVIDENCE_JOIN_NOT_ACTIVATED' }, run_id: { type: 'null' }, artifact_digest: { type: 'null' } }),
  }),
  description: 'Calendar strictly increasing; all stage series/reason arrays have calendar length. Non-null point iff point reason null; requires deployed, non-null currency, null stage reason. Null point always has typed reason. No forward fill, FX conversion or totals across environments. These array-position/length constraints are enforced by producer Zod and consumer contract tests, not standard JSON Schema. A valid string is not financial certification. Bound: 20000 source account/day rows per stage, 20000 calendar days and 1MiB serialized response. Overflow refuses whole read with 503, never truncates.',
};
write('schemas/execution-alpha-stage-drift.v2.schema.json', schema);
const problem = { $ref: './execution-query-analytics.openapi.json#/components/responses/Problem' };
write('openapi/execution-stage-drift.openapi.json', {
  openapi: '3.1.0', info: { title: 'Execution exact stage daily-close read', version: '2.0.0',
    description: 'Explicit numeric_format=DECIMAL_STRING on the existing session/workspace-authorized route. Omitting it retains legacy V1 number wire; this document describes only the opt-in successor. No additional source stream or grant. Currency missing/invalid/mixed is typed absence, not guessed from environment. Current read authority is rechecked before delivery.' },
  servers: [{ url: '/' }], security: [{ portalSession: [] }],
  paths: { '/api/v1/execution/alphas/{alphaId}/stage-drift': { get: {
    operationId: 'executionAlphaStageDriftExactV2',
    parameters: [{ name: 'alphaId', in: 'path', required: true, schema: schema.properties.alpha_id },
      { name: 'numeric_format', in: 'query', required: true, schema: { type: 'string', enum: ['DECIMAL_STRING'] } },
      { name: 'days', in: 'query', required: false, schema: { type: 'integer', minimum: 2, maximum: 365 },
        description: 'Omitted: all retained history, subject to explicit row/byte refusal bounds. No silent truncation.' }],
    responses: { '200': { description: schema.description, content: { 'application/json': {
      schema: { $ref: '../schemas/execution-alpha-stage-drift.v2.schema.json' } } } },
      '400': problem, '401': problem, '403': problem, '404': problem, '409': problem, '502': problem, '503': problem },
  } } }, components: { securitySchemes: { portalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } } },
});
const empty = reason => ({ deployed: false, reason_code: reason, currency: null,
  series: [null, null], series_reason_codes: [reason, reason] });
const example = { schema_version: 'portal.execution.alpha-stage-drift.v2', alpha_id: 'TEST_ONLY-alpha',
  qualification: 'RETAINED_OBSERVATIONS_NOT_FINANCIAL_CERTIFICATION',
  window: { days: 2, requested_days: null, basis: 'PORTAL_SGP_HISTORY_MIRROR', daily_basis: 'LAST_CLOSE_PER_DAY_SUMMED_ACROSS_ACCOUNTS_SAME_CURRENCY' },
  calendar: ['2026-01-01', '2026-01-02'],
  stages: { paper: { deployed: true, reason_code: null, currency: 'USD', series: ['9007199254740993.03', '0'], series_reason_codes: [null, null] },
    sandbox: empty('NO_DEPLOYMENT_IN_STAGE'), live: empty('EXECUTION_PROFILE_READ_DISABLED') },
  research_binding: { state: 'UNAVAILABLE', reason_code: 'N28_RESEARCH_EVIDENCE_JOIN_NOT_ACTIVATED', run_id: null, artifact_digest: null } };
const gap = structuredClone(example);
gap.stages.paper.series = ['0.3', null];
gap.stages.paper.series_reason_codes = [null, 'EQUITY_DECIMAL_INVALID'];
write('fixtures/execution-alpha-stage-drift.v2.synthetic.json', {
  lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', cases: [{ name: 'exact_above_safe_integer_and_zero', value: example },
    { name: 'malformed_latest_is_not_earlier_valid_or_zero', value: gap }],
});
