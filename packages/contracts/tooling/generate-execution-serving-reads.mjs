/**
 * S3-U2 (BE-P3): the published schemas and one OpenAPI document for the four reads Alpha 360 and the Trade Replay
 * were verified against only through a hand-written double (e2e/bffDoubleAlpha.ts):
 *
 *   execution.alpha-resource.v1                  GET /resources/alphas/{id}               (LEGACY_COMPATIBILITY body)
 *   portal.execution.subject-records.v1          GET /resources/{alphas|accounts}/{id}/{orders|fills}
 *   portal.execution.observed-timeline-bff.v1    GET /views/observed-timeline
 *   portal.execution.market-candles.v1           GET /market/venue-candles
 *
 * The server answers the SCOPED_V2 successors (execution-resource-scoped.v2, execution-scoped-records, subject-records.v2)
 * on the same routes when the workspace is scoped; those are published by their own generators. Fixtures are written by the
 * REAL producers (apps/control-api/test/be-p3-serving-reads.spec.ts, be-p3-serving-records.spec.ts); this generator owns
 * only schemas and OpenAPI, and the producer specs validate their output against these schemas.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const write = (path, value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (check) { if (readFileSync(resolve(root, path), 'utf8') !== bytes) throw new Error(`Serving reads contract drift: ${path}`); }
  else writeFileSync(resolve(root, path), bytes);
};
const BASE = 'https://schemas.primusspark.com/portal/';
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const nullable = value => ({ anyOf: [value, { type: 'null' }] });
const ref = name => ({ $ref: `#/$defs/${name}` });
const nil = { type: 'null' };
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const utc = { type: 'integer', minimum: -8640000000000000, maximum: 8640000000000000 };
const decimal = { type: 'string', maxLength: 128, pattern: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])' };
const looseDecimal = { type: 'string', maxLength: 128, pattern: '^-?[0-9]+(?:\\.[0-9]+)?$(?![\\s\\S])' };
const count = { type: 'string', maxLength: 32, pattern: '^(?:0|[1-9][0-9]*)$(?![\\s\\S])' };
const text = { type: 'string', minLength: 1, maxLength: 512 };
const identifier = { type: 'string', minLength: 1, maxLength: 191 };
const digest = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$(?![\\s\\S])' };
const environment = { enum: ['paper', 'sandbox', 'live'] };
const states = { enum: ['AVAILABLE', 'EMPTY', 'PARTIAL', 'UNAVAILABLE'] };
const reason = nullable({ type: 'string', maxLength: 256 });
const scalar = { oneOf: [{ type: 'string', maxLength: 8192 }, { type: 'number' }, { type: 'boolean' }, nil] };
/** A source row: closed scalar values under server-chosen keys. The key set is the relation's, not a browser choice. */
const row = { type: 'object', maxProperties: 64, additionalProperties: { oneOf: [scalar, { type: 'array', maxItems: 100, items: scalar }] } };
const panelClocks = obj({ event_time_ms: nullable(ref('UtcEpochMs')), source_published_at_ms: nullable(ref('UtcEpochMs')), received_at_ms: nullable(ref('UtcEpochMs')),
  ingested_at_ms: nullable(ref('UtcEpochMs')), processed_at_ms: nullable(ref('UtcEpochMs')), as_of_ms: nullable(ref('UtcEpochMs')), read_at_ms: ref('UtcEpochMs') });
const panelCoverage = obj({ from_ms: nullable(ref('UtcEpochMs')), to_ms: nullable(ref('UtcEpochMs')), source_total: nullable(count), filtered_total: nullable(count),
  returned_count: integer, truncated: { type: 'boolean' }, downsampled: { type: 'boolean' }, has_more: { type: 'boolean' }, next_cursor: nullable({ type: 'string', maxLength: 4096 }),
  gaps: { type: 'array', maxItems: 200, items: obj({ from_ms: ref('UtcEpochMs'), to_ms: ref('UtcEpochMs'), reason_code: text }) } });
const formula = nullable(obj({ formula_id: text, formula_version: text, input_revision: nullable({ type: 'string', maxLength: 256 }),
  input_digest: nullable({ type: 'string', maxLength: 128 }), composite_read_revision: nullable({ type: 'string', maxLength: 256 }) }));
/** The EDS-02 panel envelope: data is present iff the state carries data; absence is never an empty payload. */
const panel = (data, states5 = ['READY', 'EMPTY', 'PARTIAL', 'STALE', 'UNAVAILABLE']) => ({
  ...obj({ state: { enum: states5 }, data: nullable(data), clocks: ref('PanelClocks'), coverage: ref('PanelCoverage'),
    source_history_semantics: { type: 'string', minLength: 1, maxLength: 256 }, formula, reason_code: reason, retryable: { type: 'boolean' } }),
  allOf: [
    { if: { properties: { state: { enum: ['READY', 'PARTIAL', 'STALE'] } }, required: ['state'] }, then: { properties: { data: { type: 'object' } } } },
    { if: { properties: { state: { enum: ['EMPTY', 'UNAVAILABLE'] } }, required: ['state'] }, then: { properties: { data: nil } } },
  ],
});
const common = { UtcEpochMs: utc, Identifier: identifier, Decimal: decimal, Row: row, PanelClocks: panelClocks, PanelCoverage: panelCoverage };

/* ── execution.alpha-resource.v1 ─────────────────────────────────────────── */
const alphaDefs = {
  ...common,
  Metric: obj({ state: states, reason_code: reason }),
  Deployment: obj({ deployment_id: identifier, strategy_id: nullable(identifier), stage: identifier, venue: identifier, account_id: identifier, portfolio_id: nullable(identifier),
    portfolio_name: nullable(text), currency: identifier, allocation: nullable(looseDecimal), balance_total: nullable(looseDecimal), balance_free: nullable(looseDecimal),
    balance_locked: nullable(looseDecimal), position_fact_count: integer, realized_pnl: looseDecimal, unrealized_pnl: looseDecimal, net_pnl: looseDecimal, exposure: looseDecimal,
    state: text, active: { type: 'boolean' }, health: { enum: ['READY', 'ATTENTION', 'FINDING'] }, updated_at: nullable(text), updated_at_ms: utc }, [
    'deployment_id', 'strategy_id', 'stage', 'venue', 'account_id', 'portfolio_id', 'portfolio_name', 'currency', 'allocation', 'balance_total', 'balance_free', 'balance_locked',
    'position_fact_count', 'realized_pnl', 'unrealized_pnl', 'net_pnl', 'exposure', 'state', 'active', 'health', 'updated_at']),
  AlphaSummary: obj({ alpha_id: identifier, alpha_label: text, version: text, owner: nullable(text), stage: text, stages: { type: 'array', maxItems: 8, items: text },
    portfolios: { type: 'array', maxItems: 200, items: obj({ portfolio_id: nullable(identifier), name: text, base_currency: text }) },
    deployments: { type: 'array', maxItems: 200, items: ref('Deployment') },
    allocations: { type: 'array', maxItems: 64, items: obj({ currency: identifier, value: looseDecimal }) },
    balances: { type: 'array', maxItems: 64, items: obj({ currency: identifier, total: looseDecimal, free: looseDecimal, locked: looseDecimal }) },
    position_pnl: { type: 'array', maxItems: 64, items: obj({ currency: identifier, realized: looseDecimal, unrealized: looseDecimal, net: looseDecimal }) },
    exposure: { type: 'array', maxItems: 64, items: obj({ currency: identifier, value: looseDecimal }) },
    health: text, attention_reasons: { type: 'array', maxItems: 64, items: text },
    metrics_availability: obj({ account_balance: ref('Metric'), current_position_pnl: ref('Metric'), equity_series_30d: ref('Metric'), max_drawdown_30d: ref('Metric') }),
    updated_at: nullable(text), updated_at_ms: utc, valuation_warning: { const: 'E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED' } },
  ['alpha_id', 'alpha_label', 'version', 'owner', 'stage', 'stages', 'portfolios', 'deployments', 'allocations', 'balances', 'position_pnl', 'exposure', 'health',
    'attention_reasons', 'metrics_availability', 'updated_at', 'valuation_warning']),
  AlphaBoundedShell: obj({ id: identifier, state: { const: 'PARTIAL' }, reason_code: { const: 'EDS04_RESOURCE_RESPONSE_BYTE_BOUND' } }),
  Coverage: obj(Object.fromEntries(environment.enum.map(env => [env, obj({ profile_id: nullable(text), state: { enum: ['FOUND', 'EMPTY', 'PARTIAL', 'UNAVAILABLE'] }, reason_code: reason,
    projection_epoch: nullable(text), projection_sequence: nullable(integer), source_as_of: nullable(text) })])), []),
  Capability: obj({ capability_id: text, state: states, relations: { type: 'array', maxItems: 0 }, reason_code: reason, retryable: { type: 'boolean' } }),
  UnavailableBranch: { type: 'object', additionalProperties: false, required: ['capability_id', 'state', 'reason_code', 'retryable'],
    properties: { capability_id: text, environment, state: { enum: ['EMPTY', 'PARTIAL', 'UNAVAILABLE'] }, reason_code: reason, retryable: { type: 'boolean' } } },
  Projection: obj({ environment, epoch: nullable(text), sequence: nullable(integer), payload_digest: digest, last_successful_refresh_at: nullable(text) }),
  RowsPanel: panel(obj({ rows: { type: 'array', maxItems: 200, items: ref('Row') } })),
  Data: { type: 'object', additionalProperties: false, properties: {
    ...Object.fromEntries(['strategies', 'deployments', 'accounts', 'account_balances', 'margin_balances', 'account_sync', 'broker_sync', 'venue_accounts', 'portfolios',
      'portfolio_allocations', 'positions', 'sessions', 'orders', 'fills', 'performance', 'account_equity', 'reconciliation', 'journal'].map(k => [k, { type: 'array', maxItems: 200, items: ref('Row') }])),
    alpha: { oneOf: [ref('AlphaSummary'), ref('AlphaBoundedShell')] }, profile_coverage: ref('Coverage') } },
};
const alphaSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `${BASE}execution-alpha-resource.v1.schema.json`,
  title: 'Alpha 360 resource, LEGACY_COMPATIBILITY body (execution.alpha-resource.v1)',
  description: 'The body GET /resources/alphas/{id} returns while the workspace is NOT in SCOPED_V2. In SCOPED_V2 the same route answers execution.alpha-resource.v2 (execution-resource-scoped.v2.schema.json): raw authorized facts only, no alpha_label/version/health summary. The server, not the browser, selects the variant; a reader must dispatch on schema_version. Names: alpha_label is "Unnamed alpha" and deployments[].portfolio_name is null because no execution source publishes an alpha or allocation-level portfolio name (portfolios[].name is the portfolio relation\'s own name, join it on portfolio_id). Money is an exact decimal string. Synthetic fixtures are produced by the real service and do not certify production.',
  ...obj({
    schema_version: { const: 'execution.alpha-resource.v1' }, record_authority: { const: 'PORTAL_CONTROL' }, source_authority: { const: 'TRADING_SYSTEM' },
    delivery_profile: text, workspace_id: text, requested_environment: { enum: ['all', ...environment.enum] }, selected_environment: nullable(environment),
    resource: obj({ kind: { const: 'ALPHA' }, id: identifier, label: text }, ['kind', 'id']), read_at_ms: utc, as_of_ms: nullable(utc), read_at: text, as_of: nullable(text),
    state: { enum: ['ready', 'empty', 'partial', 'stale', 'unavailable'] }, freshness: { enum: ['FRESH', 'AGING', 'STALE', 'UNKNOWN'] }, completeness: { enum: ['COMPLETE', 'PARTIAL'] },
    projection: { type: 'array', maxItems: 3, items: ref('Projection') }, capabilities: { type: 'array', maxItems: 32, items: ref('Capability') },
    panels: { type: 'object', additionalProperties: ref('RowsPanel') }, data: ref('Data'), unavailable_branches: { type: 'array', maxItems: 64, items: ref('UnavailableBranch') },
    actor: obj({ user_id: text, username: text, roles: { type: 'array', minItems: 1, maxItems: 1, items: { enum: ['ADMIN', 'USER'] } } }),
  }),
  $defs: alphaDefs,
};

/* ── portal.execution.subject-records.v1 ─────────────────────────────────── */
const recordsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `${BASE}execution-subject-records.v1.schema.json`,
  title: 'Retained subject orders/fills page, LEGACY_COMPATIBILITY body (portal.execution.subject-records.v1)',
  description: 'One keyset page of an alpha\'s or account\'s orders or fills from the Portal retained current window (not authoritative replay, not total history). `state` AUTHORITATIVE_EMPTY means the retained window holds no row for this subject; UNAVAILABLE means the relation was not published. `values` carries the relation\'s own published fields as strings/numbers/null; a missing key is absent, never zero. `timeframe.derived` provenance DERIVED_STRATEGY_ID_SUFFIX is a parse of the strategy id, not a source fact. In SCOPED_V2 the same route answers portal.execution.subject-records.v2 (execution-scoped-records.openapi.json), whose `values` are restricted to the reviewed scoped field set. The cursor is Portal-signed, bound to user, snapshot and limit; a stale one is 409.',
  ...obj({
    schema_version: { const: 'portal.execution.subject-records.v1' }, logical_operation_id: { enum: ['executionAlphaOrdersV1', 'executionAlphaFillsV1', 'executionAccountOrdersV1', 'executionAccountFillsV1'] },
    authority: { const: 'PORTAL_SGP_RETAINED_CURRENT_WINDOW' }, source_authority: { const: 'TRADING_SYSTEM_CURRENT_SOURCE' }, history_semantics: { const: 'RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY' },
    environment, profile_id: identifier,
    resource: obj({ kind: { enum: ['alpha', 'account'] }, id: identifier, resolution: { enum: ['EXACT_ACCOUNT_ID', 'PUBLISHED_STRATEGY_ID', 'PUBLISHED_ALPHA_ID', 'DERIVED_REQUESTED_STRATEGY_ID'] } }),
    timeframe: obj({ value: nullable({ enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] }), provenance: { enum: ['PUBLISHED_SOURCE', 'DERIVED_STRATEGY_ID_SUFFIX', 'UNAVAILABLE'] },
      source_field: nullable({ enum: ['timeframe', 'bar_interval', 'interval', 'resolution'] }) }),
    source_health: obj({ availability: { enum: ['AVAILABLE', 'UNAVAILABLE'] }, freshness: { enum: ['FRESH', 'AGING', 'STALE', 'UNKNOWN'] }, completeness: { enum: ['COMPLETE', 'PARTIAL', 'UNKNOWN'] }, as_of_ms: nullable(utc) }),
    coverage: obj({ retained_row_count: integer, oldest_observed_at_ms: nullable(utc), newest_observed_at_ms: nullable(utc), source_completeness: { enum: ['COMPLETE', 'PARTIAL', 'UNKNOWN'] },
      source_window: { const: 'CURRENT_SOURCE_CURSOR_TRAVERSAL' } }),
    state: { enum: ['AVAILABLE', 'PARTIAL', 'AUTHORITATIVE_EMPTY', 'UNAVAILABLE'] },
    page: obj({ limit: { type: 'integer', minimum: 1, maximum: 500 }, maximum_page_rows: { const: 500 }, returned_count: { type: 'integer', minimum: 0, maximum: 500 }, has_more: { type: 'boolean' },
      next_cursor: nullable({ type: 'string', pattern: '^kc1\\.', maxLength: 4096 }) }),
    records: { type: 'array', maxItems: 500, items: obj({ record_id: { type: 'string', minLength: 1, maxLength: 512 }, values: ref('Row') }) },
    projection: obj({ epoch_id: text, sequence: integer, source_as_of_ms: nullable(utc), received_at_ms: utc, last_successful_refresh_at_ms: utc }),
  }),
  allOf: [
    { if: { properties: { state: { const: 'UNAVAILABLE' } }, required: ['state'] }, then: { properties: { records: { type: 'array', maxItems: 0 } } } },
    { if: { properties: { state: { const: 'AUTHORITATIVE_EMPTY' } }, required: ['state'] }, then: { properties: { records: { type: 'array', maxItems: 0 } } } },
  ],
  $defs: { UtcEpochMs: utc, Row: row },
};

/* ── portal.execution.observed-timeline-bff.v1 ───────────────────────────── */
const clocks10 = ['ORDER_CREATED_AT', 'ORDER_SUBMITTED_AT', 'ORDER_UPDATED_AT', 'FILL_RECORDED_AT', 'FILL_TRADE_TIME', 'SESSION_STARTED_AT', 'SESSION_UPDATED_AT', 'SESSION_COMPLETED_AT',
  'COMMAND_JOURNAL_CREATED_AT', 'COMMAND_JOURNAL_UPDATED_AT'];
const timelineDefs = {
  ...common,
  Entry: obj({ observed_at_ms: utc, source_clock: { enum: clocks10 }, observation_type: { enum: ['ORDER_OBSERVED', 'FILL_OBSERVED', 'SESSION_OBSERVED', 'COMMAND_JOURNAL_ROW_OBSERVED'] },
    source_record: obj({ kind: { enum: ['ORDER', 'FILL', 'SESSION', 'COMMAND_JOURNAL'] }, id: text }),
    resource: obj({ deployment_id: nullable(text), strategy_id: nullable(text), account_id: nullable(text), portfolio_id: nullable(text), execution_session_id: nullable(text), instrument_id: nullable(text) }),
    values: obj({ price: nullable(looseDecimal), quantity: nullable(looseDecimal), realized_pnl: nullable(looseDecimal) }),
    rejected_exact_value_fields: { type: 'array', maxItems: 3, uniqueItems: true, items: { enum: ['price', 'quantity', 'realized_pnl'] } } }),
  TimelineData: obj({ label: { const: 'OBSERVED_TIMELINE' }, observation_authority: { const: 'PORTAL_OBSERVATION' }, observation_semantics: { const: 'BOUNDED_CURRENT_PAGE' },
    source_history_semantics: { const: 'BOUNDED_CURRENT_PAGE_OBSERVATION_NOT_AUTHORITATIVE_EVENT_REPLAY' }, ordering_rule: { const: 'OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1' },
    source_current_page_row_count: integer, observed_entry_count: integer, entries: { type: 'array', maxItems: 200, items: ref('Entry') },
    unavailable_segments: { type: 'array', maxItems: 3, items: obj({ segment: { enum: ['BROKER_ACKNOWLEDGEMENT', 'AUTHORITATIVE_CORRECTION_TOMBSTONE', 'GLOBAL_EVENT_SEQUENCE'] }, state: { const: 'UNAVAILABLE' }, reason_code: text }) } }),
  MarkData: obj({ label: { const: 'DERIVED · mark-context' }, authority: { const: 'DERIVED' }, source_history_semantics: { const: 'CURRENT_MARKS_AND_RETAINED_EQUITY_NOT_OHLCV' },
    marks: { type: 'array', maxItems: 200, items: obj({ position_id: text, instrument_id: nullable(text), account_id: nullable(text), observed_at_ms: utc, mark_price: looseDecimal, currency: nullable(text) }) },
    equity_context: obj({ state: { enum: ['AVAILABLE', 'EMPTY'] }, relation_count: integer, label: { const: 'CURRENT_OR_RETAINED_EQUITY_CONTEXT' } }),
    unavailable_market_context: obj({ state: { const: 'UNAVAILABLE' }, reason_code: { const: 'EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED' } }) }),
};
timelineDefs.TimelinePanel = panel(ref('TimelineData'));
timelineDefs.MarkPanel = panel(ref('MarkData'));
const timelineSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `${BASE}execution-observed-timeline.v1.schema.json`,
  title: 'Observed timeline of one subject (portal.execution.observed-timeline-bff.v1)',
  description: 'A bounded, non-causal merge of the subject\'s current-page orders, fills, sessions and command-journal rows by their OWN clocks, ordered by observed_at_ms, clock class, then source identifier. It is an observation of the current page, not an event replay: broker acknowledgement, correction tombstones and a global event sequence are published as unavailable_segments. An entry carries NO order status or outcome (a request, FE-054): an order appears once per clock it has (submitted, updated, created). Exact values are decimal strings; a malformed source value is null and named in rejected_exact_value_fields. `mark_context` is derived current marks, not OHLCV. In SCOPED_V2 the received/ingested/processed clocks and the projection received/refresh times are null. Cursor `page.next_cursor` is Portal-signed.',
  ...obj({
    schema_version: { const: 'portal.execution.observed-timeline-bff.v1' }, logical_operation_id: { const: 'executionObservedTimelineV1' }, record_authority: { const: 'PORTAL_CONTROL' },
    source_authority: { const: 'TRADING_SYSTEM_CURRENT_STATE' }, observation_authority: { const: 'PORTAL_OBSERVATION' }, observation_semantics: { const: 'BOUNDED_CURRENT_PAGE' },
    environment, profile_id: identifier, workspace_id: text, resource: obj({ kind: { enum: ['DEPLOYMENT', 'ALPHA', 'PORTFOLIO', 'ACCOUNT'] }, id: text }),
    projection: obj({ epoch_id: text, sequence: integer, payload_digest: digest, source_contract_revision: text, source_catalogue_sha256: nullable(digest), source_as_of_ms: nullable(utc),
      received_at_ms: nullable(utc), last_successful_refresh_at_ms: nullable(utc), completeness: { enum: ['COMPLETE', 'PARTIAL', 'UNKNOWN'] } }),
    observed_timeline: ref('TimelinePanel'), mark_context: ref('MarkPanel'),
    page: obj({ limit: { type: 'integer', minimum: 1, maximum: 200 }, next_cursor: nullable({ type: 'string', pattern: '^kc1\\.', maxLength: 4096 }), has_more: { type: 'boolean' } }),
  }),
  $defs: timelineDefs,
};

/* ── portal.execution.market-candles.v1 ──────────────────────────────────── */
const candleSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `${BASE}execution-market-candles.v1.schema.json`,
  title: 'Market candles for the Trade Replay (portal.execution.market-candles.v1)',
  description: 'Bars for one symbol and interval, every price the source\'s decimal string. `source_authority` VENUE_PUBLIC_MARKET_DATA is the venue\'s public kline feed (market context, never the Trading System\'s own history); TRADING_SYSTEM_DATA_LAYER is the Trading System market gateway, reached through GET /market/candles (execution-market-context) behind the same envelope when EXECUTION_MARKET_CANDLES_SOURCE=data_layer. `state` EMPTY is a real answer (no bar in the window, or the venue does not know the symbol: reason_code says which); UNAVAILABLE is an outage or a disabled/not-wired source and carries retryable. A truncated read filled its limit with room left in the window. No bar is ever fabricated or resampled.',
  ...obj({
    schema_version: { const: 'portal.execution.market-candles.v1' }, logical_operation_id: { const: 'executionMarketCandlesV1' }, record_authority: { const: 'PORTAL_CONTROL' },
    source_authority: { enum: ['VENUE_PUBLIC_MARKET_DATA', 'TRADING_SYSTEM_DATA_LAYER'] },
    source: obj({ kind: { enum: ['venue_public', 'data_layer'] }, venue: { enum: ['BINANCE', 'OKX'] }, market: { enum: ['USDM', 'SWAP'] }, endpoint: text, instrument: text, note: { type: 'string', maxLength: 512 } }),
    symbol: text, interval: { enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] }, interval_ms: { type: 'integer', minimum: 60000 },
    state: { enum: ['READY', 'EMPTY', 'UNAVAILABLE'] }, reason_code: nullable({ type: 'string', maxLength: 128 }), retryable: { type: 'boolean' }, fetched_at_ms: nullable(utc), read_at_ms: utc,
    coverage: obj({ from_ms: nullable(utc), to_ms: nullable(utc), requested_limit: { type: 'integer', minimum: 1, maximum: 6000 }, returned_count: integer, truncated: { type: 'boolean' }, pages: integer }),
    last_candle_closed: nullable({ type: 'boolean' }),
    candles: { type: 'array', maxItems: 6000, items: obj({ t: utc, o: looseDecimal, h: looseDecimal, l: looseDecimal, c: looseDecimal, v: looseDecimal, close_t: utc, trades: nullable(integer) }) },
  }),
  allOf: [
    { if: { properties: { state: { const: 'READY' } }, required: ['state'] }, then: { properties: { candles: { type: 'array', minItems: 1 }, reason_code: nil } } },
    { if: { properties: { state: { enum: ['EMPTY', 'UNAVAILABLE'] } }, required: ['state'] }, then: { properties: { candles: { type: 'array', maxItems: 0 }, reason_code: { type: 'string' } } } },
  ],
  $defs: { UtcEpochMs: utc },
};

write('schemas/execution-alpha-resource.v1.schema.json', alphaSchema);
write('schemas/execution-subject-records.v1.schema.json', recordsSchema);
write('schemas/execution-observed-timeline.v1.schema.json', timelineSchema);
write('schemas/execution-market-candles.v1.schema.json', candleSchema);

const problem = { $ref: './execution-query-analytics.openapi.json#/components/responses/Problem' };
const q = (name, schema, required = false, description) => ({ name, in: 'query', required, schema, ...(description ? { description } : {}) });
const path = (name, schema) => ({ name, in: 'path', required: true, schema });
const ok = (description, file) => ({ description, content: { 'application/json': { schema: { $ref: `../schemas/${file}` } } } });
const errors = Object.fromEntries([400, 401, 403, 404, 409, 503].map(s => [s, problem]));
const subjectId = { type: 'string', pattern: '^[A-Za-z0-9._:@-]{1,191}$' };
const recordsParams = idName => [path(idName, subjectId), path('relation', { enum: ['orders', 'fills'] }), q('environment', environment, true),
  q('limit', { type: 'integer', minimum: 1, maximum: 500, default: 200 }), q('after', { type: 'string', minLength: 1, maxLength: 4096 }, false, 'Portal-signed continuation from page.next_cursor.'),
  q('workspace_id', { type: 'string', minLength: 1, maxLength: 96 })];
write('openapi/execution-serving-reads.openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Execution serving reads, legacy-compatibility variants (Alpha 360 / Trade Replay)', version: '1.0.0',
    description: 'Existing session/workspace-authorized reads; this document only publishes the wire contracts the Alpha 360 and Trade Replay screens consume. A SCOPED_V2 workspace is answered with the v2 successor of the same route: dispatch on schema_version. No new route, flag or grant.' },
  servers: [{ url: '/' }], security: [{ portalSession: [] }],
  paths: {
    '/api/v1/execution/resources/alphas/{resource_id}': { get: { operationId: 'executionAlphaResourceLegacyV1',
      parameters: [path('resource_id', { type: 'string', pattern: '^[A-Za-z0-9._:@-]{1,160}$' }), q('workspace_id', { type: 'string', minLength: 1, maxLength: 96 }), q('environment', environment)],
      responses: { '200': ok(alphaSchema.description, 'execution-alpha-resource.v1.schema.json'), ...errors } } },
    '/api/v1/execution/resources/alphas/{alphaId}/{relation}': { get: { operationId: 'executionAlphaSubjectRecordsLegacyV1', parameters: recordsParams('alphaId'),
      responses: { '200': ok(recordsSchema.description, 'execution-subject-records.v1.schema.json'), ...errors } } },
    '/api/v1/execution/resources/accounts/{accountId}/{relation}': { get: { operationId: 'executionAccountSubjectRecordsLegacyV1', parameters: recordsParams('accountId'),
      responses: { '200': ok(recordsSchema.description, 'execution-subject-records.v1.schema.json'), ...errors } } },
    '/api/v1/execution/views/observed-timeline': { get: { operationId: 'executionObservedTimelineV1',
      parameters: [q('environment', environment, true), q('subject_kind', { enum: ['deployment', 'alpha', 'portfolio', 'account'] }, true), q('subject_id', { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,192}$' }, true),
        q('limit', { type: 'integer', minimum: 1, maximum: 200 }), q('after', { type: 'string', minLength: 1, maxLength: 4096 })],
      responses: { '200': ok(timelineSchema.description, 'execution-observed-timeline.v1.schema.json'), ...errors } } },
    '/api/v1/execution/market/venue-candles': { get: { operationId: 'executionMarketCandlesV1',
      parameters: [q('environment', { ...environment, default: 'paper' }), q('venue', { enum: ['BINANCE', 'OKX'], default: 'BINANCE' }), q('market', { enum: ['USDM', 'SWAP'] }, false, 'Must match the venue (BINANCE=USDM, OKX=SWAP).'),
        q('symbol', { type: 'string', pattern: '^[A-Z0-9]{5,20}$|^[A-Z0-9]{2,12}-[A-Z0-9]{2,8}-SWAP$' }, true), q('interval', { enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'], default: '1h' }),
        q('from_ms', { type: 'integer', minimum: 0 }), q('to_ms', { type: 'integer', minimum: 0 }), q('limit', { type: 'integer', minimum: 1, maximum: 6000, default: 500 })],
      responses: { '200': ok(candleSchema.description, 'execution-market-candles.v1.schema.json'), '400': problem, '401': problem, '404': problem } } },
  },
  components: { securitySchemes: { portalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } } },
});
