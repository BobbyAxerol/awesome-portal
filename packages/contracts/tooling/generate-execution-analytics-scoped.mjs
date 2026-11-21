import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const check = process.argv.includes('--check');
const write = (path, value) => {
  const rendered = JSON.stringify(value, null, 2) + '\n';
  if (check) {
    if (readFileSync(resolve(root, path), 'utf8') !== rendered) throw new Error(`Generated analytics contract drift: ${path}`);
  } else writeFileSync(resolve(root, path), rendered);
};
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const count = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const ref = name => ({ $ref: `#/$defs/${name}` });
// Additive server-policy-selected version. Never weaken the existing v1
// schema: its observation clocks retain their original non-null meaning.
const schema = read('schemas/execution-query-analytics.v1.schema.json');
schema.$id = 'https://schemas.primusspark.com/portal/execution-query-analytics.v2.schema.json';
schema.title = 'Scoped Execution analytics, authorized-record clocks only';
schema.properties.schema_version = { const: 'execution.query-analytics-envelope.v2' };
schema.properties.epoch_id = { $ref: '#/$defs/Digest' };
schema.properties.repository_query_count = { type: 'integer', minimum: 1, maximum: 128 };
schema.properties.source_read_at = { type: 'null' };
const nullableDate = { anyOf: [{ $ref: '#/$defs/DateTime' }, { type: 'null' }] };
schema.$defs.ManagerAnalytics.properties.as_of = nullableDate;
schema.$defs.ChartSeries.properties.as_of = nullableDate;
schema.$defs.Identifier = { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,192}$' };
// The scoped branch describes the current bounded history-derived payload,
// not the retired episode/coefficient shape still preserved by legacy v1.
schema.$defs.HistoryStatisticsWindow = obj({ days: count, basis: { const: 'PORTAL_SGP_HISTORY_MIRROR' },
  daily_basis: { const: 'LAST_CLOSE_FORWARD_FILLED_SUM' } });
const day = { type: 'string', format: 'date' };
schema.$defs.DrawdownOverlap = obj({ formula_version: { const: 'drawdown_overlap.v1' }, state: { const: 'AVAILABLE' },
  window: ref('HistoryStatisticsWindow'), alphas: { type: 'array', maxItems: 20000, items: obj({
    alpha_id: ref('Identifier'), max_drawdown: { type: 'number' }, max_drawdown_at: { anyOf: [day, { type: 'null' }] },
    series: { type: 'array', maxItems: 20000, items: obj({ timestamp: day, drawdown: { type: 'number' } }) },
  }) }, overlaps: { type: 'array', maxItems: 20000, items: obj({ from: day, to: day,
    alpha_ids: { type: 'array', maxItems: 20000, items: ref('Identifier') } }) },
});
schema.$defs.CorrelationPair = obj({ left_alpha: ref('Identifier'), right_alpha: ref('Identifier'),
  correlation: { type: 'number', minimum: -1, maximum: 1 }, overlapping_days: count });
schema.$defs.ManagerCorrelation.properties.window = ref('HistoryStatisticsWindow');
schema.$defs.ManagerAnalytics.properties.history_windows = obj(Object.fromEntries(['accountEquity', 'performance'].map(name => [name,
  obj({ days: { const: 30 }, basis: { const: 'PORTAL_SGP_HISTORY_MIRROR' }, returned_rows: count,
    source_rows: count, truncated: { const: false }, downsample: obj({ method: { const: 'PER_SERIES_BUCKET_EXTREMA' },
      bucket_seconds: count, series_count: count, input_rows: count, output_rows: count }),
  }, ['days', 'basis', 'returned_rows', 'source_rows', 'truncated']),
])), []);
schema.$defs.ScopedMetadata = {
  type: 'object', additionalProperties: false,
  required: ['visibility', 'coverage', 'global_observation_clocks', 'reason_code', 'as_of_basis'],
  properties: {
    visibility: { const: 'SCOPED' }, coverage: { const: 'AUTHORIZED_ONLY' },
    global_observation_clocks: { const: 'NOT_PUBLISHED' },
    reason_code: { const: 'EXECUTION_GLOBAL_OBSERVATION_CLOCK_NOT_QUALIFIED' },
    as_of_basis: { enum: ['AUTHORIZED_RECORD_TIMESTAMP', 'NOT_PUBLISHED'] },
  },
};
schema.required.push('scoped_metadata');
schema.properties.scoped_metadata = { $ref: '#/$defs/ScopedMetadata' };
schema.allOf = [{
  if: { type: 'object', properties: { scoped_metadata: { type: 'object', properties: { as_of_basis: { const: 'NOT_PUBLISHED' } } } } },
  then: { type: 'object', properties: { analytics: { type: 'object', properties: { as_of: { type: 'null' } } } } },
  else: { type: 'object', properties: { analytics: { type: 'object', properties: { as_of: { $ref: '#/$defs/DateTime' } } } } },
}];
write('schemas/execution-query-analytics.v2.schema.json', schema);
const api = read('openapi/execution-query-analytics.openapi.json');
api.components.responses.Analytics.content['application/json'].schema = { oneOf: [
  { $ref: '../schemas/execution-query-analytics.v1.schema.json' },
  { $ref: '../schemas/execution-query-analytics.v2.schema.json' },
] };
api.components.responses.Analytics.description = 'Legacy v1 or durable-policy-selected scoped v2; a client cannot opt into scope. V2 omits global observation clocks. Metadata absence is not zero or read time.';
write('openapi/execution-query-analytics.openapi.json', api);
const empty = read('fixtures/execution-query-analytics.empty.valid.json');
empty.schema_version = schema.properties.schema_version.const;
empty.epoch_id = empty.projection_state_digest;
empty.source_read_at = null;
empty.analytics.as_of = null;
empty.analytics.completeness = 'PARTIAL';
empty.scoped_metadata = { visibility: 'SCOPED', coverage: 'AUTHORIZED_ONLY', global_observation_clocks: 'NOT_PUBLISHED',
  reason_code: 'EXECUTION_GLOBAL_OBSERVATION_CLOCK_NOT_QUALIFIED', as_of_basis: 'NOT_PUBLISHED' };
const record = structuredClone(empty);
record.analytics.as_of = '2026-08-30T00:00:00Z';
record.scoped_metadata.as_of_basis = 'AUTHORIZED_RECORD_TIMESTAMP';
write('fixtures/execution-query-analytics.scoped.v2.json', {
  lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',
  cases: [{ name: 'no_authorized_record_clock', value: empty }, { name: 'authorized_record_clock', value: record }],
});
