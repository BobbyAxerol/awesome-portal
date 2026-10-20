/**
 * S3-U3 (BE-P3): the published contract of `GET /api/v1/execution/views/equity-chart` (EDS-07), including
 * the `deployment` subject the Paper/Canary/Live stage screens ask about. Until now the route was served and
 * read by the FE but had no schema, no OpenAPI and no canonical fixture; the FE double invented its own body.
 *
 * Produces: schemas/execution-financial-chart.v1.schema.json, openapi/execution-financial-chart.openapi.json,
 * fixtures/execution-financial-chart.synthetic.valid.json. The producer
 * (apps/control-api/src/execution/financial-chart.service.ts) is run against the same cases by
 * apps/control-api/test/be-p3-serving-contracts.spec.ts; neither side can drift without a red test.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const write = (path, value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (check) { if (readFileSync(resolve(root, path), 'utf8') !== bytes) throw new Error(`Financial chart contract drift: ${path}`); }
  else writeFileSync(resolve(root, path), bytes);
};

const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const nullable = value => ({ anyOf: [value, { type: 'null' }] });
const ref = name => ({ $ref: `#/$defs/${name}` });
const nil = { type: 'null' };
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const utc = { type: 'integer', minimum: -8640000000000000, maximum: 8640000000000000 };
const decimal = { type: 'string', maxLength: 128, pattern: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])' };
const count = { type: 'string', maxLength: 32, pattern: '^(?:0|[1-9][0-9]*)$(?![\\s\\S])' };
const identifier = { type: 'string', minLength: 1, maxLength: 191 };
const SEMANTICS = 'RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY';
const METRICS = ['equity', 'net_pnl', 'gross_pnl', 'realized_pnl', 'unrealized_pnl', 'fee_total', 'funding_pnl', 'cash_total', 'cash_free',
  'cash_locked', 'margin_initial', 'margin_maintenance', 'drawdown', 'notional', 'exposure_long', 'exposure_short', 'allocated_capital'];
// Metrics each subject kind retains (financial-chart.service.ts metricBinding). Anything else is a typed unavailable.
const PERFORMANCE_METRICS = ['equity', 'net_pnl', 'gross_pnl', 'realized_pnl', 'unrealized_pnl', 'fee_total', 'funding_pnl', 'cash_total', 'cash_free',
  'cash_locked', 'notional', 'exposure_long', 'exposure_short'];

const defs = {
  Identifier: identifier,
  UtcEpochMs: utc,
  Decimal: decimal,
  Clocks: obj({ event_time_ms: nullable(ref('UtcEpochMs')), source_published_at_ms: nullable(ref('UtcEpochMs')), received_at_ms: nullable(ref('UtcEpochMs')),
    ingested_at_ms: nullable(ref('UtcEpochMs')), processed_at_ms: nullable(ref('UtcEpochMs')), as_of_ms: nullable(ref('UtcEpochMs')), read_at_ms: ref('UtcEpochMs') }),
  Coverage: obj({ from_ms: nullable(ref('UtcEpochMs')), to_ms: nullable(ref('UtcEpochMs')), source_total: nullable(count), filtered_total: nullable(count),
    returned_count: integer, truncated: { const: false }, downsampled: { type: 'boolean' }, has_more: { const: false }, next_cursor: nil,
    gaps: { type: 'array', maxItems: 0 } }),
  Formula: obj({ formula_id: { const: 'eds07.direct-retained-financial-series' }, formula_version: { const: 'v1' },
    input_revision: nullable({ type: 'string', maxLength: 256 }), input_digest: nullable({ type: 'string', maxLength: 128 }),
    composite_read_revision: nullable({ type: 'string', maxLength: 256 }) }),
  Point: { type: 'array', minItems: 2, maxItems: 2, prefixItems: [ref('UtcEpochMs'), ref('Decimal')], items: false },
  Series: obj({ id: identifier, label: { type: 'string', minLength: 1, maxLength: 512 }, account_id: nullable(identifier),
    currency: { type: 'string', minLength: 1, maxLength: 32 }, points: { type: 'array', items: ref('Point') } }),
  Sampling: obj({ algorithm: { enum: ['NONE', 'MIN_MAX_LAST_BUCKET_V1'] }, source_rows: count, numeric_rows: count, rejected_rows: count,
    returned_rows: integer, target_points: { type: 'integer', minimum: 512, maximum: 4096 }, bucket_seconds: nullable({ type: 'integer', minimum: 1 }),
    preserves_extrema: { const: true }, preserves_first_last: { const: true }, preserves_observed_time_spacing: { const: true },
    preserves_gaps: { const: false }, preserves_markers: { const: false }, gap_semantics: { const: 'SOURCE_GAP_INTERVALS_NOT_PUBLISHED' },
    marker_semantics: { const: 'SOURCE_MARKERS_NOT_PUBLISHED' } }),
  Retention: obj({ retention_floor_ms: nil, retention_floor_state: { const: 'UNKNOWN' }, oldest_available_ms: nullable(ref('UtcEpochMs')),
    newest_available_ms: nullable(ref('UtcEpochMs')), history_semantics: { const: SEMANTICS } }),
  Benchmark: obj({ requested: { type: 'boolean' }, state: { enum: ['NOT_REQUESTED', 'UNAVAILABLE'] }, reason_code: nullable({ type: 'string', maxLength: 128 }), series: nil }),
  ChartData: obj({ time_basis: { const: 'UTC_EPOCH_MS' }, comparison_mode: { enum: ['ABSOLUTE_EQUITY', 'DIRECT_RETAINED_VALUE'] },
    scale_mode: { enum: ['LOG', 'LINEAR'] }, currency_policy: { const: 'PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE' },
    series: { type: 'array', items: ref('Series') }, sampling: ref('Sampling'), retention: ref('Retention'), benchmark: ref('Benchmark') }),
  Panel: {
    ...obj({ state: { enum: ['READY', 'EMPTY', 'PARTIAL', 'STALE', 'UNAVAILABLE'] }, data: nullable(ref('ChartData')), clocks: ref('Clocks'),
      coverage: ref('Coverage'), source_history_semantics: { const: SEMANTICS }, formula: nullable(ref('Formula')),
      reason_code: nullable({ type: 'string', maxLength: 128 }), retryable: { type: 'boolean' } }),
    allOf: [
      { if: { properties: { state: { enum: ['READY', 'PARTIAL', 'STALE'] } }, required: ['state'] }, then: { properties: { data: { type: 'object' } } } },
      { if: { properties: { state: { enum: ['EMPTY', 'UNAVAILABLE'] } }, required: ['state'] }, then: { properties: { data: { type: 'null' } } } },
      { if: { properties: { state: { const: 'UNAVAILABLE' } }, required: ['state'] }, then: { properties: { reason_code: { type: 'string' } } } },
    ],
  },
  ReadScope: obj({ visibility: { const: 'SCOPED' }, coverage: { const: 'AUTHORIZED_ONLY' }, policy_revision: nullable({ type: 'string', maxLength: 256 }) }),
  FinancialChartResponse: obj({
    schema_version: { const: 'portal.execution.financial-chart.v1' }, logical_operation_id: { const: 'executionFinancialChartV1' },
    record_authority: { const: 'PORTAL_CONTROL' }, source_authority: { const: 'TRADING_SYSTEM' }, workspace_id: { type: 'string', minLength: 1, maxLength: 96 },
    environment: { enum: ['paper', 'sandbox', 'live'] }, profile_id: nullable(identifier),
    subject: obj({ kind: { enum: ['alpha', 'deployment', 'account', 'portfolio'] }, id: identifier }),
    metric: { enum: METRICS }, panel: ref('Panel'), read_scope: ref('ReadScope'),
  }, ['schema_version', 'logical_operation_id', 'record_authority', 'source_authority', 'workspace_id', 'environment', 'profile_id', 'subject', 'metric', 'panel']),
};

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.primusspark.com/portal/execution-financial-chart.v1.schema.json',
  title: 'Execution financial chart (EDS-07), retained snapshot range',
  description: 'Viewport-sized series of ONE retained metric for ONE subject (alpha, deployment, account or portfolio), read from the Portal durable mirror. Points are [epoch_ms, exact decimal string]; one series per (account, currency) and never an FX aggregate. A downsample keeps each bucket min, max and last and says so in `sampling`. Gaps and markers are NOT published by the source (`gaps` is always empty, preserves_gaps is false): an absence of a point is not a flat line. Alpha and deployment subjects serve the performance-snapshot metrics; account and portfolio serve their own equity relations; a metric a subject does not retain is a typed UNAVAILABLE (EDS07_METRIC_NOT_RETAINED_FOR_SUBJECT), never a zero series. `read_scope` is present only in a SCOPED_V2 read, whose clocks other than read_at_ms are withheld. Synthetic fixtures do not certify production.',
  ...ref('FinancialChartResponse'),
  $defs: defs,
};
write('schemas/execution-financial-chart.v1.schema.json', schema);

const problem = { $ref: './execution-query-analytics.openapi.json#/components/responses/Problem' };
const query = (name, schemaValue, required, description) => ({ name, in: 'query', required, schema: schemaValue, ...(description ? { description } : {}) });
write('openapi/execution-financial-chart.openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Execution financial chart (EDS-07)', version: '1.0.0',
    description: 'Existing session/workspace-authorized read; this document only publishes its wire contract. No new route, flag or grant.' },
  servers: [{ url: '/' }], security: [{ portalSession: [] }],
  paths: { '/api/v1/execution/views/equity-chart': { get: {
    operationId: 'executionFinancialChartV1',
    description: 'Strict query: an unknown key is refused (400 EDS07_CHART_QUERY_INVALID). Authority is checked per subject kind (deployment/alpha: alpha.read; account: account.read; portfolio: portfolio.read) before any row is read and again before delivery. private, no-store.',
    parameters: [
      query('workspace_id', { type: 'string', minLength: 1, maxLength: 96 }, false, 'Only the projection workspace is accepted.'),
      query('environment', { enum: ['paper', 'sandbox', 'live'] }, true),
      query('subject_kind', { enum: ['alpha', 'deployment', 'account', 'portfolio'] }, true),
      query('subject_id', { type: 'string', pattern: '^[A-Za-z0-9._:@-]{1,191}$' }, true),
      query('metric', { enum: METRICS, default: 'equity' }, false),
      query('from_ms', { type: 'integer' }, false),
      query('to_ms', { type: 'integer' }, false),
      query('viewport_px', { type: 'integer', minimum: 256, maximum: 2048, default: 960 }, false),
      query('include_benchmark', { type: 'boolean', default: false }, false, 'A benchmark is never available today: the panel says EDS07_BENCHMARK_AUTHORITY_UNPUBLISHED.'),
    ],
    responses: { '200': { description: schema.description, content: { 'application/json': { schema: { $ref: '../schemas/execution-financial-chart.v1.schema.json' } } } },
      '400': problem, '401': problem, '403': problem, '404': problem, '409': problem, '413': problem, '503': problem },
  } } },
  components: { securitySchemes: { portalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } } },
});

// ── canonical cases. The producer is run against exactly these inputs by the control-api spec. ──────────────
const T0 = 1790812800000; // 2026-10-01T00:00:00Z
const HOUR = 3600000;
const clocks = (overrides = {}) => ({ event_time_ms: T0 + 5 * HOUR, source_published_at_ms: T0 + 5 * HOUR, received_at_ms: T0 + 5 * HOUR + 1000,
  ingested_at_ms: T0 + 5 * HOUR + 1000, processed_at_ms: T0 + 5 * HOUR + 1000, as_of_ms: T0 + 5 * HOUR, read_at_ms: T0 + 6 * HOUR, ...overrides });
const coverage = (overrides = {}) => ({ from_ms: T0, to_ms: T0 + 5 * HOUR, source_total: null, filtered_total: '6', returned_count: 6, truncated: false,
  downsampled: false, has_more: false, next_cursor: null, gaps: [], ...overrides });
const formula = { formula_id: 'eds07.direct-retained-financial-series', formula_version: 'v1', input_revision: 'mirror-rev-41',
  input_digest: `sha256:${'a'.repeat(64)}`, composite_read_revision: 'mirror-rev-41' };
const sampling = (overrides = {}) => ({ algorithm: 'NONE', source_rows: '6', numeric_rows: '6', rejected_rows: '0', returned_rows: 6, target_points: 1920,
  bucket_seconds: null, preserves_extrema: true, preserves_first_last: true, preserves_observed_time_spacing: true, preserves_gaps: false,
  preserves_markers: false, gap_semantics: 'SOURCE_GAP_INTERVALS_NOT_PUBLISHED', marker_semantics: 'SOURCE_MARKERS_NOT_PUBLISHED', ...overrides });
const retention = (overrides = {}) => ({ retention_floor_ms: null, retention_floor_state: 'UNKNOWN', oldest_available_ms: T0, newest_available_ms: T0 + 5 * HOUR,
  history_semantics: SEMANTICS, ...overrides });
const benchmark = { requested: false, state: 'NOT_REQUESTED', reason_code: null, series: null };
const equityPoints = [[T0, '100000.00'], [T0 + HOUR, '100120.50'], [T0 + 2 * HOUR, '99980.25'], [T0 + 3 * HOUR, '100340.75'], [T0 + 4 * HOUR, '100290.00'], [T0 + 5 * HOUR, '100455.10']];
const base = (subjectId, metric, panel, extra = {}) => ({ schema_version: 'portal.execution.financial-chart.v1', logical_operation_id: 'executionFinancialChartV1',
  record_authority: 'PORTAL_CONTROL', source_authority: 'TRADING_SYSTEM', workspace_id: 'workspace_TEST_ONLY', environment: 'paper',
  profile_id: 'PAPER_BINANCE_USDM', subject: { kind: 'deployment', id: subjectId }, metric, panel, ...extra });
const ready = (metric, points, comparison, overrides = {}) => ({ state: 'READY',
  data: { time_basis: 'UTC_EPOCH_MS', comparison_mode: comparison, scale_mode: points.every(([, v]) => !v.startsWith('-') && /[1-9]/.test(v.replace('.', ''))) ? 'LOG' : 'LINEAR',
    currency_policy: 'PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE',
    series: [{ id: 'account:acct_paper_1:currency:USDT', label: 'Account acct_paper_1 · USDT', account_id: 'acct_paper_1', currency: 'USDT', points }],
    sampling: sampling(), retention: retention(), benchmark },
  clocks: clocks(), coverage: coverage(), source_history_semantics: SEMANTICS, formula, reason_code: null, retryable: false, ...overrides });
const unavailable = (reason, retryable) => ({ state: 'UNAVAILABLE', data: null,
  clocks: { event_time_ms: null, source_published_at_ms: null, received_at_ms: null, ingested_at_ms: null, processed_at_ms: null, as_of_ms: null, read_at_ms: T0 + 6 * HOUR },
  coverage: { from_ms: null, to_ms: null, source_total: null, filtered_total: null, returned_count: 0, truncated: false, downsampled: false, has_more: false, next_cursor: null, gaps: [] },
  source_history_semantics: SEMANTICS, formula: null, reason_code: reason, retryable });
const downsampled = ready('equity', equityPoints, 'ABSOLUTE_EQUITY', {
  coverage: coverage({ downsampled: true, filtered_total: '120000' }),
  data: undefined,
});
downsampled.data = { ...ready('equity', equityPoints, 'ABSOLUTE_EQUITY').data, sampling: sampling({ algorithm: 'MIN_MAX_LAST_BUCKET_V1', source_rows: '120000', numeric_rows: '120000', returned_rows: 6, bucket_seconds: 900 }) };
const scoped = base('dep_paper_01', 'equity', ready('equity', equityPoints, 'ABSOLUTE_EQUITY', {
  clocks: { event_time_ms: null, source_published_at_ms: null, received_at_ms: null, ingested_at_ms: null, processed_at_ms: null, as_of_ms: null, read_at_ms: T0 + 6 * HOUR },
  formula: null, reason_code: 'AUTHORIZED_RETAINED_FINANCIAL_RANGE' }), { read_scope: { visibility: 'SCOPED', coverage: 'AUTHORIZED_ONLY', policy_revision: 'policy-r7' } });
const exposure = ready('exposure_long', [[T0, '61343.10'], [T0 + 2 * HOUR, '59880.00'], [T0 + 4 * HOUR, '62010.55']], 'DIRECT_RETAINED_VALUE',
  { coverage: coverage({ filtered_total: '3', returned_count: 3, to_ms: T0 + 4 * HOUR }), data: undefined });
exposure.data = { ...ready('exposure_long', [[T0, '61343.10'], [T0 + 2 * HOUR, '59880.00'], [T0 + 4 * HOUR, '62010.55']], 'DIRECT_RETAINED_VALUE').data,
  sampling: sampling({ source_rows: '3', numeric_rows: '3', returned_rows: 3 }), retention: retention({ newest_available_ms: T0 + 4 * HOUR }) };
const cases = [
  { name: 'deployment_equity_ready', query: { environment: 'paper', subject_kind: 'deployment', subject_id: 'dep_paper_01', metric: 'equity' }, value: base('dep_paper_01', 'equity', ready('equity', equityPoints, 'ABSOLUTE_EQUITY')) },
  { name: 'deployment_equity_downsampled', query: { environment: 'paper', subject_kind: 'deployment', subject_id: 'dep_paper_01', metric: 'equity', viewport_px: 960 }, value: base('dep_paper_01', 'equity', downsampled) },
  { name: 'deployment_exposure_long_ready', query: { environment: 'paper', subject_kind: 'deployment', subject_id: 'dep_paper_01', metric: 'exposure_long' }, value: base('dep_paper_01', 'exposure_long', exposure) },
  { name: 'deployment_empty', query: { environment: 'paper', subject_kind: 'deployment', subject_id: 'dep_new_01', metric: 'equity' },
    value: base('dep_new_01', 'equity', { state: 'EMPTY', data: null, clocks: clocks({ event_time_ms: null, source_published_at_ms: null, as_of_ms: null }), coverage: coverage({ from_ms: null, to_ms: null, filtered_total: '0', returned_count: 0 }), source_history_semantics: SEMANTICS, formula, reason_code: null, retryable: false }) },
  { name: 'deployment_metric_not_retained', query: { environment: 'paper', subject_kind: 'deployment', subject_id: 'dep_paper_01', metric: 'drawdown' },
    value: base('dep_paper_01', 'drawdown', unavailable('EDS07_METRIC_NOT_RETAINED_FOR_SUBJECT', false)) },
  { name: 'deployment_mirror_reads_disabled', query: { environment: 'live', subject_kind: 'deployment', subject_id: 'dep_live_01', metric: 'equity' },
    value: { ...base('dep_live_01', 'equity', unavailable('EDS07_DURABLE_MIRROR_READS_DISABLED', true)), environment: 'live', profile_id: 'LIVE_BINANCE_USDM' } },
  { name: 'deployment_scoped_v2', query: { environment: 'paper', subject_kind: 'deployment', subject_id: 'dep_paper_01', metric: 'equity' }, scoped: true, value: scoped },
];
write('fixtures/execution-financial-chart.synthetic.valid.json', { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',
  note: 'Deployment subject cases. PERFORMANCE_METRICS (the metrics alpha and deployment retain): ' + PERFORMANCE_METRICS.join(', '), cases });
