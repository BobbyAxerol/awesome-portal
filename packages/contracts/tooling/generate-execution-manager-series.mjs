// BE-P4 / FE-013 + FE-033: generate the Manager series contract from the actual backend Zod vocabulary.
// Custom arithmetic refinements (points ascending, comparison re-derivation) stay server checks with explicit
// negative tests; the finite JSON conditionals below carry every rule JSON Schema can state.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { buildManagerSeriesFixtures } from './execution-manager-series-fixtures.mjs';
import { describeCanonicalDecimals } from './execution-manager-p1-semantics.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(root, '../../apps/control-api/src/execution-v2');
const require = createRequire(import.meta.url), cache = new Map();
const { z } = require('zod');
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'zod' ? { z } : name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name);
  new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
  return module.exports;
}
const series = load(resolve(sourceRoot, 'manager-series.contract.ts'));
const publication = load(resolve(sourceRoot, 'manager-series-publication.contract.ts'));
const invariants = load(resolve(sourceRoot, 'manager-dataset-invariants.ts'));
const contract = { ...series, managerSeriesPublication: publication.managerSeriesPublication };
function json(schema) {
  const d = schema._def, type = d.typeName;
  if (['ZodEffects', 'ZodDefault', 'ZodOptional'].includes(type)) return json(d.schema ?? d.innerType);
  if (type === 'ZodNullable') return { anyOf: [json(d.innerType), { type: 'null' }] };
  if (type === 'ZodUnion') return { anyOf: d.options.map(json) };
  if (type === 'ZodNull') return { type: 'null' };
  if (type === 'ZodBoolean') return { type: 'boolean' };
  if (type === 'ZodLiteral') return { const: d.value };
  if (type === 'ZodEnum') return { type: 'string', enum: d.values };
  if (type === 'ZodString') {
    const value = { type: 'string' };
    for (const c of d.checks) {
      if (c.kind === 'min') value.minLength = c.value;
      else if (c.kind === 'max') value.maxLength = c.value;
      else if (c.kind === 'regex') value.pattern = c.regex.source;
      else throw new Error('Unsupported string constraint: ' + c.kind);
    } return value;
  }
  if (type === 'ZodNumber') {
    const value = { type: d.checks.some(c => c.kind === 'int') ? 'integer' : 'number' };
    for (const c of d.checks) {
      if (c.kind === 'min') value[c.inclusive ? 'minimum' : 'exclusiveMinimum'] = c.value;
      else if (c.kind === 'max') value[c.inclusive ? 'maximum' : 'exclusiveMaximum'] = c.value;
      else if (c.kind !== 'int') throw new Error('Unsupported number constraint');
    } return value;
  }
  if (type === 'ZodArray') return { type: 'array', items: json(d.type), ...(d.minLength ? { minItems: d.minLength.value } : {}), ...(d.maxLength ? { maxItems: d.maxLength.value } : {}) };
  if (type === 'ZodObject') {
    const shape = d.shape();
    return { type: 'object', additionalProperties: d.unknownKeys !== 'strict', properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, json(v)])),
      required: Object.entries(shape).filter(([, v]) => !v.isOptional()).map(([k]) => k) };
  }
  throw new Error('Unsupported Zod node: ' + type);
}

/* finite JSON conditionals (the rules JSON Schema can state without date/array arithmetic) */
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const isField = (key, value) => obj({ [key]: { const: value } }, [key]);
const add = (schema, ...conditions) => { schema.allOf = [...(schema.allOf ?? []), ...conditions]; };
const nul = { type: 'null' }, nonNull = { not: { type: 'null' } };
const emptyArray = { type: 'array', maxItems: 0 }, someItem = { type: 'array', minItems: 1 };
const descriptors = ['partition', 'unit', 'basis', 'methodology_ref', 'window'];
function entrySemantics(entry) {
  add(entry,
    { if: isField('state', 'UNAVAILABLE'),
      then: obj({ reason_code: { type: 'string', not: { const: 'NO_POINTS_PUBLISHED_IN_WINDOW' } }, currency: nul, points: emptyArray, gaps: emptyArray,
        quality: obj({ completeness: { const: 'UNRESOLVED' } }), ...Object.fromEntries(descriptors.map(k => [k, nul])) }) },
    { if: isField('state', 'AVAILABLE'),
      then: obj({ reason_code: nul, points: someItem, ...Object.fromEntries(descriptors.map(k => [k, nonNull])) }) },
    { if: isField('state', 'EMPTY'),
      then: obj({ reason_code: { const: 'NO_POINTS_PUBLISHED_IN_WINDOW' }, points: emptyArray, ...Object.fromEntries(descriptors.map(k => [k, nonNull])) }) },
    { if: isField('unit', 'MONEY'), then: obj({ currency: { type: 'string' } }) },
    { if: isField('unit', 'RATIO'), then: obj({ currency: nul }) });
}
function comparisonSemantics(c) {
  add(c,
    { if: isField('state', 'ALIGNED'), then: obj({ reason_code: nul, common: { type: 'object' }, axis_ms: { type: 'array' } }) },
    { if: isField('state', 'SINGLE_SUBJECT'), then: obj({ reason_code: nul, axis_ms: nul }) },
    { if: isField('state', 'INCOMPARABLE'),
      then: obj({ reason_code: { enum: series.COMPARISON_MISMATCH_REASONS }, common: nul, axis_ms: nul }) },
    { if: isField('state', 'UNAVAILABLE'), then: obj({ reason_code: { const: 'SUBJECT_SERIES_UNAVAILABLE' }, common: nul, axis_ms: nul }) });
}
function responseSemantics(response) {
  const p = response.properties;
  p.series.uniqueItems = false; // identity is the (subject_type, subject_id) pair; checked by the server validator
  entrySemantics(p.series.items);
  comparisonSemantics(p.comparison);
  add(response,
    { if: obj({ series_source: isField('state', 'NOT_PUBLISHED') }, ['series_source']),
      then: obj({ series_source: obj({ reason_code: { const: 'FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED' } }, ['reason_code']),
        series: { type: 'array', items: isField('state', 'UNAVAILABLE') } }),
      else: obj({ series_source: obj({ reason_code: nul }, ['reason_code']) }) });
}
function querySemantics(query) {
  const subject = query.properties.subjects.items;
  add(subject, { if: isField('subject_type', 'FUND'), then: { not: obj({ subject_id: {} }, ['subject_id']) },
    else: obj({}, ['subject_id']) });
}

const response = json(contract.managerSeriesResponse), query = json(contract.managerSeriesQuery);
responseSemantics(response); querySemantics(query);
const entry = json(contract.managerSeriesEntry); entrySemantics(entry);
const comparison = json(contract.managerSeriesComparison); comparisonSemantics(comparison);
const stored = json(contract.managerSeriesPublication);
// MD-5 (owner decision C): a series point is emitted in canonical zero; the stored publication (a SOURCE document) still admits "-0".
const canonicalDecimal = { pattern: invariants.MANAGER_CANONICAL_DECIMAL_PATTERN.source, note: invariants.MANAGER_CANONICAL_ZERO_NOTE };
for (const schema of [response, entry]) describeCanonicalDecimals(schema, canonicalDecimal);
const problem = { type: 'object', additionalProperties: false, required: ['error', 'request_id'], properties: {
  error: { type: 'object', additionalProperties: false, required: ['code', 'message'], properties: {
    code: { type: 'string', enum: ['EXECUTION_READ_NOT_AVAILABLE', 'EXECUTION_READ_QUERY_INVALID', 'EXECUTION_READ_CURRENT_ONLY'] },
    message: { const: 'The requested Execution read is not available.' } } }, request_id: { type: 'string' } } };
const privateHeaders = { 'Cache-Control': { required: true, schema: { type: 'string', const: 'private, no-store' } } };
const errorResponse = description => ({ description, headers: structuredClone(privateHeaders),
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ManagerSeriesProblem' } } } });
const jsonParam = (name, schema, required) => ({ name, in: 'query', required, content: { 'application/json': { schema } } });
const operation = { get: { operationId: 'executionManagerSeriesGetV1', security: [{ PortalSession: [] }],
  description: 'Exact-decimal NAV / Net PnL / Return series for 1-4 subjects (portfolios or the fund) over one exact window. ' +
    'Each subject is AVAILABLE, EMPTY or typed UNAVAILABLE; nothing is rebased, summed across currencies, interpolated or carried forward. ' +
    '`comparison` is re-derived by the validator and is INCOMPARABLE (CURRENCY_MIXED, ...) when the subjects do not share one partition, basis, unit, methodology and window. ' +
    'The financial normalized source that fills a series is MISSING today: every profile answers SERIES_SOURCE_NOT_PUBLISHED until a producer publishes one.',
  parameters: [{ name: 'environment', in: 'query', required: true, schema: query.properties.environment },
    { name: 'workspace_id', in: 'query', required: false, schema: query.properties.workspace_id },
    { name: 'metric', in: 'query', required: true, schema: query.properties.metric },
    jsonParam('subjects', query.properties.subjects, true), jsonParam('window', query.properties.window, true),
    jsonParam('economic_partition', query.properties.economic_partition, false)],
  responses: { 200: { description: 'Authorized current series answer; absence stays typed', headers: structuredClone(privateHeaders),
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ManagerSeries' } } } },
  ...Object.fromEntries([[400, 'Invalid closed query (as_of_ms is refused as CURRENT_ONLY)'], [401, 'Session required'],
    [404, 'Subject or current grant unavailable'], [409, 'Authority, snapshot or source changed'], [503, 'Source publication or bounded capability unavailable']]
    .map(([code, text]) => [code, errorResponse(text)])) } } };
const schemaHeader = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.primusspark.com/portal/execution-manager-series.v1.schema.json' };

const fixtures = buildManagerSeriesFixtures({ ...contract, canonicalManagerZero: invariants.canonicalManagerZero });
const outputs = {
  'schemas/execution-manager-series.v1.schema.json': { ...schemaHeader, ...response },
  'openapi/execution-manager-series.openapi.json': { openapi: '3.1.0', info: { title: 'Manager NAV / Net PnL / Return series', version: '1.0.0' },
    paths: { '/api/v1/execution/manager/series': operation },
    components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } },
      schemas: { ManagerSeries: response, ManagerSeriesQuery: query, ManagerSeriesEntry: entry, ManagerSeriesComparison: comparison,
        ManagerSeriesPublication: stored, ManagerSeriesProblem: problem } } },
  ...fixtures,
};
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value, null, 2) + '\n', path = resolve(root, file);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== content) throw new Error('Generated Manager series contract drift: ' + file); }
  else writeFileSync(path, content);
}
