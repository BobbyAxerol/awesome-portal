// Additive Core-observed vocabulary, generated from the actual server Zod schema.
// Does not alter the qualified Manager contract or confer source authority.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const source = resolve(root, '../../apps/control-api/src/execution-v2/observed-read.contract.ts');
const module = { exports: {} };
const js = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('require', 'module', 'exports', js)(require, module, module.exports);
const contract = module.exports;
function json(schema) {
  const d = schema._def, kind = d.typeName;
  if (['ZodEffects', 'ZodDefault', 'ZodOptional'].includes(kind)) return json(d.schema ?? d.innerType);
  if (kind === 'ZodNullable') return { anyOf: [json(d.innerType), { type: 'null' }] };
  if (kind === 'ZodEnum') return { type: 'string', enum: d.values };
  if (kind === 'ZodLiteral') return { const: d.value };
  if (kind === 'ZodString') {
    const value = { type: 'string' };
    for (const c of d.checks) {
      if (c.kind === 'min') value.minLength = c.value;
      else if (c.kind === 'max') value.maxLength = c.value;
      else if (c.kind === 'regex') value.pattern = c.regex.source;
      else throw Error('Unsupported observed string check: ' + c.kind);
    }
    return value;
  }
  if (kind === 'ZodNumber') {
    const value = { type: d.checks.some(c => c.kind === 'int') ? 'integer' : 'number' };
    for (const c of d.checks) {
      if (c.kind === 'min') value.minimum = c.value;
      else if (c.kind === 'max') value.maximum = c.value;
      else if (c.kind !== 'int') throw Error('Unsupported observed number check');
    }
    return value;
  }
  if (kind === 'ZodArray') return { type: 'array', items: json(d.type),
    ...(d.minLength ? { minItems: d.minLength.value } : {}), ...(d.maxLength ? { maxItems: d.maxLength.value } : {}) };
  if (kind === 'ZodObject') {
    const shape = d.shape();
    return { type: 'object', additionalProperties: d.unknownKeys !== 'strict',
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, json(value)])),
      required: Object.entries(shape).filter(([, value]) => !value.isOptional()).map(([key]) => key) };
  }
  throw Error('Unsupported observed Zod node: ' + kind);
}
const response = json(contract.observedReadResponse), query = json(contract.observedOverviewQuery);
const figure = response.properties.figures.items;
// Finite cross-field Zod refinements; ordered timestamps, count arithmetic,
// partition uniqueness and UTF-8 byte size remain server-side + parity negatives.
const fields = properties => ({ type: 'object', properties });
figure.allOf = [
  ...Object.entries(contract.OBSERVED_METHOD_IDS).map(([id, method]) => ({
    if: fields({ figure_id: { const: id } }),
    then: fields({ method_id: { const: method }, unit: { const: ['NAV', 'NET_PNL'].includes(id) ? 'MONEY' : 'FRACTION' } }),
  })),
  { if: fields({ availability: { const: 'UNAVAILABLE' } }), then: fields({ value: { type: 'null' } }),
    else: fields({ value: { type: 'string' } }) },
  { if: fields({ availability: { enum: ['PARTIAL', 'UNAVAILABLE'] } }), then: fields({ reason_code: { type: 'string' } }) },
];
response['x-server-invariants'] = ['METHOD_FIGURE_MISMATCH', 'UNIT_FIGURE_MISMATCH', 'VALUE_AVAILABILITY_MISMATCH',
  'REASON_REQUIRED', 'ACCOUNT_COUNT_INVALID', 'WINDOW_ORDER_INVALID', 'TIMESTAMP_ORDER_INVALID',
  'DUPLICATE_FIGURE_PARTITION', 'RESPONSE_TOO_LARGE'];
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const problem = object({ error: object({ code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 } }),
  request_id: { type: 'string' } });
const privateHeaders = { 'Cache-Control': { required: true, schema: { const: 'private, no-store' } } };
const responses = { 200: { description: 'Core observation only. Not TS-qualified, not a qualified Manager fallback.',
  headers: privateHeaders, content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservedOverview' } } } } };
for (const [status, description] of Object.entries({ 400: 'EXECUTION_OBSERVED_QUERY_INVALID: closed scalar query.',
  401: 'Authenticated current session required.', 403: 'Current access policy refused the read.',
  404: 'Lane disabled or workspace/profile/membership unavailable; no existence disclosure.',
  409: 'Policy, source snapshot or retained mirror changed during delivery.', 503: 'Bounded read capability unavailable.' })) {
  responses[status] = { description, headers: privateHeaders,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservedProblem' } } } };
}
const api = { openapi: '3.1.0', info: { title: 'Execution Core-observed read (not TS-qualified)', version: '1.0.0' },
  paths: { '/api/v1/execution/observed/overview': { get: {
    operationId: 'executionObservedOverviewGetV1', security: [{ PortalSession: [] }],
    description: 'Explicit opt-in read lane; feature defaults OFF. Whole-workspace legacy-compatible access only. '
      + 'SCOPED_V2 is refused before repository work and rechecked before delivery. '
      + 'Paper figures are exact-decimal per-currency observations from one bounded snapshot, never inferred TS ownership. '
      + 'Sandbox/Live and unsupported figures publish typed absence. Missing coverage calibration cannot produce numeric Return/Drawdown.',
    'x-strict-query-keys': ['workspace_id', 'environment'],
    'x-server-invariants': response['x-server-invariants'],
    parameters: [{ name: 'environment', in: 'query', required: false, schema: { ...query.properties.environment, default: 'paper' } },
      { name: 'workspace_id', in: 'query', required: false, schema: query.properties.workspace_id }], responses,
  } } }, components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } },
    schemas: { ObservedOverview: response, ObservedFigure: figure, ObservedOverviewQuery: query, ObservedProblem: problem } } };
const now = 1_795_478_400_000;
const quality = { completeness: 'COMPLETE', freshness: 'FRESH', reasons: [] };
const body = { schema_version: contract.OBSERVED_READ_SCHEMA_VERSION, surface: 'FUND', workspace_id: 'ws_TEST_ONLY', environment: 'paper',
  trust: { class: 'CORE_OBSERVED_NOT_QUALIFIED', qualified: false, source_confidence: 'UNKNOWN',
    label_code: 'OBSERVED_BY_CORE_FROM_EDGE_SNAPSHOT', not_ts_qualified: true }, record_authority: 'PORTAL_OBSERVATION',
  source_authority: 'EDGE_SNAPSHOT_VIA_CORE', observation_semantics: 'BOUNDED_CURRENT_WINDOW',
  access_mode: 'LEGACY_COMPATIBILITY', coverage: 'WORKSPACE_WHOLE_POPULATION',
  as_of: { read_at_ms: now, snapshot_source_as_of_ms: now, snapshot_received_ms: now, last_refresh_ms: now,
    oldest_figure_ts_ms: now, newest_figure_ts_ms: now },
  projection: { profile_id: 'paper_TEST_ONLY', epoch_id: 'epoch_TEST_ONLY', sequence: 10,
    payload_digest: 'sha256:' + 'a'.repeat(64), source_catalogue_sha256: 'sha256:' + 'b'.repeat(64) }, quality,
  figures: contract.OBSERVED_FIGURE_IDS.map(figure_id => ({ figure_id, method_id: contract.OBSERVED_METHOD_IDS[figure_id],
    value: ['NAV', 'NET_PNL'].includes(figure_id) ? (figure_id === 'NAV' ? '20000' : '0') : null,
    unit: ['NAV', 'NET_PNL'].includes(figure_id) ? 'MONEY' : 'FRACTION', currency: 'USD', basis: 'CORE_TEST_ONLY_ACCOUNT_EQUITY',
    window: { from_ts_ms: now, to_ts_ms: now }, availability: ['NAV', 'NET_PNL'].includes(figure_id) ? 'AVAILABLE' : 'UNAVAILABLE',
    reason_code: ['NAV', 'NET_PNL'].includes(figure_id) ? null : 'NAV_GRID_COVERAGE_POLICY_PENDING', quality,
    accounts_total: 2, accounts_reported: 2, oldest_ts_ms: now, newest_ts_ms: now, caveats: [],
    source_confidence: 'UNKNOWN', calculation_revision: contract.OBSERVED_CALCULATION_REVISION, policy_revision: 'NONE' })),
  not_published: contract.OBSERVED_NOT_PUBLISHED_FIGURES.map(figure => ({ figure, reason_code: 'NOT_PUBLISHED_IN_OBSERVED_MODE' })) };
const unavailable = structuredClone(body);
unavailable.quality = { completeness: 'UNRESOLVED', freshness: 'UNKNOWN', reasons: ['EXPECTED_ACCOUNT_CENSUS_NOT_PUBLISHED'] };
for (const f of unavailable.figures) Object.assign(f, { value: null, availability: 'UNAVAILABLE',
  reason_code: 'EXPECTED_ACCOUNT_CENSUS_NOT_PUBLISHED', quality: unavailable.quality, accounts_total: 0, accounts_reported: 0,
  oldest_ts_ms: null, newest_ts_ms: null, window: null });
const retained = structuredClone(body);
retained.quality = { completeness: 'PARTIAL', freshness: 'STALE', reasons: ['RETAINED_REVIEW_PARTIAL_SOURCE'] };
for (const f of retained.figures) {
  f.quality = retained.quality;
  if (f.value !== null) Object.assign(f, { availability: 'PARTIAL', reason_code: 'RETAINED_REVIEW_PARTIAL_SOURCE', accounts_reported: 1 });
}
const negatives = [];
const invalid = (name, change) => { const value = structuredClone(body); change(value); negatives.push({ name, value }); };
invalid('qualified-upgrade', v => { v.trust.qualified = true; });
invalid('source-authority-upgrade', v => { v.source_authority = 'TRADING_SYSTEM'; });
invalid('scoped-mode-upgrade', v => { v.access_mode = 'SCOPED_V2'; });
invalid('method-substitution', v => { v.figures[0].method_id = contract.OBSERVED_METHOD_IDS.RETURN; });
invalid('unavailable-with-zero', v => { v.figures[2].value = '0'; });
invalid('partial-without-reason', v => { v.figures[0].availability = 'PARTIAL'; });
invalid('unit-substitution', v => { v.figures[0].unit = 'FRACTION'; });
invalid('newline-decimal', v => { v.figures[0].value += '\n'; });
invalid('unsafe-sequence', v => { v.projection.sequence = Number.MAX_SAFE_INTEGER + 1; });
invalid('unexpected-field', v => { v.token = 'SYNTHETIC_SENTINEL'; });
const valid = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', runtime_qualified: false,
  cases: { paper: body, unavailable, retained } };
for (const value of Object.values(valid.cases)) contract.observedReadResponse.parse(value);
for (const { name, value } of negatives) if (contract.observedReadResponse.safeParse(value).success) throw Error('Invalid observed vector accepted: ' + name);
const outputs = {
  'schemas/execution-observed-read.v1.schema.json': { $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schemas.primusspark.com/portal/execution-observed-read.v1.schema.json', ...response },
  'openapi/execution-observed-read.openapi.json': api,
  'fixtures/execution-observed-read.synthetic.valid.json': valid,
  'fixtures/execution-observed-read.synthetic.invalid.json': { lane: valid.lane, cases: negatives },
};
for (const [file, value] of Object.entries(outputs)) {
  const target = resolve(root, file), content = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw Error('Observed contract drift: ' + file);
  } else writeFileSync(target, content);
}
