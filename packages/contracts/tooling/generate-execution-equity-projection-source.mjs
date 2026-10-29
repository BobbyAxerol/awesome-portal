// R-C: SOURCE-BACKED equity projection contract V2 (sibling of the fixture-only V1; V1 is not touched).
// Generated: schema, OpenAPI and synthetic fixtures. No Edge-qualified source exists yet, so the fixtures are
// TEST_ONLY_SYNTHETIC and nothing here asserts a source. Design: upgrade/execution_loop/evidence/UXM-07/
// EQUITY_PROJECTION_SOURCE_CONTRACT_DESIGN_2026-10-29.md
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const nullable = schema => ({ oneOf: [schema, { type: 'null' }] });
const id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' };
const workspace = { type: 'string', minLength: 1, maxLength: 96, pattern: '^[A-Za-z0-9._:-]+$' };
const decimal = { type: 'string', pattern: '^[+-]?[0-9]+([.][0-9]+)?$' };
const currency = { type: 'string', pattern: '^[A-Z0-9]{2,12}$' };
const instant = { type: 'string', format: 'date-time' };
const digest = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' };
const cursor = { type: 'string', minLength: 1, maxLength: 512, pattern: '^[A-Za-z0-9_-]+$' };
const MAX_POINTS = 5000;
const SERIES_REASONS = ['SOURCE_NOT_COMMISSIONED', 'SOURCE_NOT_READ', 'NOT_AUTHORIZED', 'RETENTION_EXPIRED', 'SOURCE_STALE', 'NO_DATA_IN_WINDOW'];
const BAND_REASONS = ['SOURCE_NOT_COMMISSIONED', 'SOURCE_NOT_READ', 'NOT_AUTHORIZED', 'BAND_NOT_APPROVED', 'BAND_NOT_LINKED', 'RETENTION_EXPIRED'];
const absent = reasons => ({ ...object({ availability: { const: 'ABSENT' }, reason_code: { type: 'string', enum: reasons } }),
  description: 'Typed absence. Never zero, never an empty AVAILABLE section. No data keys.' });
const point = object({ bucket_start: instant, equity: nullable(decimal), drawdown: nullable(decimal) });
const gap = object({ from: instant, to: instant, reason: { type: 'string', enum: ['SOURCE_GAP', 'RETENTION', 'SESSION_CLOSED', 'PROJECTION_DISCONTINUITY'] } });
const retention = object({ availability: { type: 'string', enum: ['HOT', 'PARTIAL_HOT', 'COLD_REQUESTABLE', 'PURGED', 'UNKNOWN'] },
  policy_version: { type: 'string', minLength: 1, maxLength: 128 }, oldest_retained_at: nullable(instant) });
const seriesLineage = object({ source_contract: id, source_revision: id, source_digest: digest, source_as_of: instant, account_scope: { const: 'DEPLOYMENT' } });
const drawdown = { ...object({ formula_version: { const: 'drawdown.running_peak.v1' }, formula: { const: 'value / running_max - 1' },
  population: { type: 'string', enum: ['RETURNED_WINDOW_BUCKETS', 'SOURCE_FULL_HISTORY'] }, peak_resets_on_gap: { const: false },
  authority: { type: 'string', enum: ['EDGE_QUALIFIED', 'PORTAL_DERIVED'] }, confirmed_by_source: { type: 'boolean' } }),
  description: 'States which population, formula and authority produced the drawdown fraction. confirmed_by_source may be true only for EDGE_QUALIFIED.',
  allOf: [{ if: { type: 'object', properties: { confirmed_by_source: { const: true } }, required: ['confirmed_by_source'] },
    then: { type: 'object', properties: { authority: { const: 'EDGE_QUALIFIED' } } } }] };
const seriesAvailable = { ...object({ availability: { const: 'AVAILABLE' }, currency, timestamp_semantics: object({
  bucket_basis: { const: 'bucket_start_utc_inclusive' }, time_basis: { const: 'event_time_source_clock' }, interpolation: { const: 'NONE' } }),
  interval: { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h', '1d'] }, interval_seconds: { type: 'integer', enum: [60, 300, 900, 3600, 14400, 86400] },
  window_from: instant, window_to: instant,
  expected_buckets: { type: 'integer', minimum: 1, maximum: MAX_POINTS }, returned_buckets: { type: 'integer', minimum: 0, maximum: MAX_POINTS },
  source_rows: { type: 'integer', minimum: 0, maximum: 9007199254740991 }, coverage: decimal,
  points: { type: 'array', maxItems: MAX_POINTS, items: point }, gaps: { type: 'array', maxItems: MAX_POINTS, items: gap },
  next_cursor: nullable(cursor), retention, lineage: seriesLineage, drawdown }),
  description: 'Per-deployment retained series with its OWN source revision/digest. null equity/drawdown is a missing bucket, never 0. No interpolation across gaps. Runtime also checks returned_buckets == points.length <= request.limit, currency equality with the band, and body identity equals the request.' };
const bandLineage = object({ band_revision: id, artifact_digest: digest, approval_reference: id, approved_at: instant, approval_authority: { const: 'RESEARCH' }, immutable: { const: true } });
const bandAvailable = { ...object({ availability: { const: 'AVAILABLE' }, currency, run_id: id, lineage: bandLineage,
  points: { type: 'array', maxItems: MAX_POINTS, items: object({ bucket_start: instant, lower: decimal, upper: decimal }) } }),
  description: 'Approved immutable Research band with its OWN lineage (required). An unapproved or unlinked band is typed absence, never an illustrative value.' };
const request = object({ window: { type: 'string', enum: ['1d', '7d', '30d', '90d', '1y'] }, intent: { type: 'string', enum: ['overview', 'inspect'] },
  limit: { type: 'integer', minimum: 1, maximum: MAX_POINTS }, cursor: nullable(cursor) });
const response = { ...object({ schema_version: { const: 'execution.analytics.equity-projection.source.v2' }, workspace_id: workspace, deployment_id: id,
  environment: { type: 'string', enum: ['paper', 'sandbox', 'live'] }, observed_at: instant, source_side_effect_requested: { const: false },
  request, series: { oneOf: [seriesAvailable, absent(SERIES_REASONS)] }, band: { oneOf: [bandAvailable, absent(BAND_REASONS)] } }),
  description: 'Source-backed equity projection. Series and band are independently AVAILABLE or ABSENT. No Edge-qualified source exists yet: every real body is typed absence.' };
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.primusspark.com/portal/execution-equity-projection-source.v2.schema.json', $ref: '#/$defs/EquityProjectionSourceResponse',
  $defs: { Identifier: id, EquityProjectionSourceResponse: response } };
const problem = object({ error: object({ code: { type: 'string' }, message: { type: 'string' } }), request_id: { type: 'string' } });
const responses = { '200': { description: 'Source-backed projection, or typed absence per section.', headers: { 'Cache-Control': { schema: { const: 'private, no-store' } } },
  content: { 'application/json': { schema: { $ref: '#/components/schemas/EquityProjectionSourceResponse' } } } } };
for (const [code, description] of Object.entries({ 400: 'Invalid query, cursor or limit.', 401: 'Session required.', 403: 'Current authority required.', 404: 'Workspace or deployment unavailable (no existence oracle).', 503: 'Source integrity or authority unavailable.' }))
  responses[code] = { description, content: { 'application/json': { schema: { $ref: '#/components/schemas/EquityProjectionSourceProblem' } } } };
const q = (name, schemaValue, required = false) => ({ name, in: 'query', required, schema: schemaValue });
const api = { openapi: '3.1.0', info: { title: 'Execution equity projection (source-backed V2)', version: '2.0.0',
  description: 'Sibling of the fixture-only V1 route. Unmounted by default; the only port implementation is SOURCE_NOT_COMMISSIONED.' },
  paths: { '/api/v1/execution/deployments/{deploymentId}/equity-projection/source': { get: { operationId: 'executionEquityProjectionSource',
    parameters: [{ name: 'deploymentId', in: 'path', required: true, schema: id }, q('workspace_id', workspace, true),
      q('environment', response.properties.environment, true), q('window', { ...request.properties.window, default: '30d' }),
      q('intent', { ...request.properties.intent, default: 'overview' }), q('limit', { ...request.properties.limit, default: MAX_POINTS }), q('cursor', cursor)],
    responses } } },
  components: { schemas: { EquityProjectionSourceResponse: { $ref: '../schemas/execution-equity-projection-source.v2.schema.json#/$defs/EquityProjectionSourceResponse' },
    EquityProjectionSourceProblem: problem } } };

// ── synthetic fixtures (TEST_ONLY; no source is asserted) ──────────────────────────────────────────
const D = 'a'.repeat(64), B = 'b'.repeat(64);
const HOUR = 3600_000, START = Date.parse('2026-08-26T00:00:00Z');
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const buckets = Array.from({ length: 24 }, (_, i) => START + i * HOUR);
const level = i => 100 + i * 0.125;
const points = buckets.map((t, i) => i === 5 ? { bucket_start: iso(t), equity: null, drawdown: null }
  : { bucket_start: iso(t), equity: level(i).toFixed(6), drawdown: '0' });
const base = { schema_version: 'execution.analytics.equity-projection.source.v2', workspace_id: 'ws_TEST_ONLY', deployment_id: 'dep_88', environment: 'paper',
  observed_at: '2026-08-27T00:00:30Z', source_side_effect_requested: false,
  request: { window: '1d', intent: 'overview', limit: MAX_POINTS, cursor: null } };
const seriesOk = { availability: 'AVAILABLE', currency: 'USDT', timestamp_semantics: { bucket_basis: 'bucket_start_utc_inclusive', time_basis: 'event_time_source_clock', interpolation: 'NONE' },
  interval: '1h', interval_seconds: 3600, window_from: iso(START), window_to: iso(START + 24 * HOUR), expected_buckets: 24, returned_buckets: 24, source_rows: 23,
  coverage: '0.958333333333333333333333', points, gaps: [{ from: iso(buckets[5]), to: iso(buckets[6]), reason: 'SOURCE_GAP' }], next_cursor: null,
  retention: { availability: 'HOT', policy_version: 'TEST_ONLY:retention-v1', oldest_retained_at: '2026-06-01T00:00:00Z' },
  lineage: { source_contract: 'TEST_ONLY:edge-equity-series-contract-v1', source_revision: 'TEST_ONLY:rev-0001', source_digest: `sha256:${D}`, source_as_of: '2026-08-27T00:00:00Z', account_scope: 'DEPLOYMENT' },
  drawdown: { formula_version: 'drawdown.running_peak.v1', formula: 'value / running_max - 1', population: 'RETURNED_WINDOW_BUCKETS', peak_resets_on_gap: false,
    authority: 'PORTAL_DERIVED', confirmed_by_source: false } };
const bandOk = { availability: 'AVAILABLE', currency: 'USDT', run_id: 'run_TEST_ONLY_44',
  lineage: { band_revision: 'TEST_ONLY:band-rev-1', artifact_digest: `sha256:${B}`, approval_reference: 'apr_TEST_ONLY_band', approved_at: '2026-08-20T00:00:00Z', approval_authority: 'RESEARCH', immutable: true },
  points: buckets.map((t, i) => ({ bucket_start: iso(t), lower: (level(i) * 0.985).toFixed(6), upper: (level(i) * 1.015).toFixed(6) })) };
const fixture = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', runtime_qualified: false, source_commissioned: false, cases: {
  available: { ...base, series: seriesOk, band: bandOk },
  series_only: { ...base, series: seriesOk, band: { availability: 'ABSENT', reason_code: 'BAND_NOT_APPROVED' } },
  series_absent: { ...base, series: { availability: 'ABSENT', reason_code: 'SOURCE_NOT_COMMISSIONED' }, band: { availability: 'ABSENT', reason_code: 'SOURCE_NOT_COMMISSIONED' } },
  not_authorized: { ...base, series: { availability: 'ABSENT', reason_code: 'NOT_AUTHORIZED' }, band: { availability: 'ABSENT', reason_code: 'NOT_AUTHORIZED' } } } };
const outputs = { 'schemas/execution-equity-projection-source.v2.schema.json': schema,
  'openapi/execution-equity-projection-source.openapi.json': api,
  'fixtures/execution-equity-projection-source.synthetic.valid.json': fixture };
for (const [path, value] of Object.entries(outputs)) {
  const bytes = JSON.stringify(value, null, 2) + '\n', file = resolve(root, path);
  if (check) { if (readFileSync(file, 'utf8') !== bytes) throw new Error(`Equity projection source contract drift: ${path}`); }
  else writeFileSync(file, bytes);
}
