// WP-K slice 5 (inbox C->K 3, 4, 5 and the per-venue addition): the lifecycle of ONE alpha as an additive sibling read.
//   stages: one row per stage with entered / exited instants, days, criteria met of total (with the observed value of each criterion),
//           the decider (role) and the actor who decided, and a receipt reference;
//   events: the unified subject feed (stage, decision, incident, recall, flow): kind, instant, title, actor, receipt reference;
//   regime_fit: a published ratio, or a typed absence, apart from the score;
//   venue_net_pnl: Net PnL of the alpha per venue, one currency per figure, never summed across venues or currencies.
// Every section is optional and nullable by the slice-2 rule: omitted = no owning source; null = the source exists and was not read;
// object = published. A count of 0 is a published true zero. The producer is MISSING today (the screens read FIXTURE_LAB open
// partition keys): the route is published and nothing serves it. TEST_ONLY fixtures only; none is a product receipt.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const ms = { type: 'integer', minimum: 0, maximum: 9007199254740991 };
const text = { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])' };
const id = { type: 'string', minLength: 1, maxLength: 191, pattern: '^[A-Za-z0-9._:-]+$(?![\\s\\S])' };
const decimal = { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])', maxLength: 80 };
const count = { type: 'integer', minimum: 0, maximum: 9007199254740991 };
const STAGES = ['R1', 'R2', 'PAPER', 'SANDBOX', 'CANARY', 'LIVE'];

const criterion = object({ label: text, observed: nullable(text), threshold: nullable(text), met: { type: 'boolean' } });
const stage = object({
  stage: { type: 'string', enum: STAGES },
  state: { type: 'string', enum: ['DONE', 'CURRENT', 'BLOCKED', 'NOT_STARTED'] },
  entered_at_ms: nullable(ms), exited_at_ms: nullable(ms), days_in_stage: nullable(count),
  criteria: nullable(object({ met: count, total: count, items: { type: 'array', maxItems: 32, items: criterion } })),
  decider_role: nullable(text), decided_by: nullable(text), receipt_ref: nullable(id), blocked_reason: nullable(text) });
const event = object({ event_id: id, kind: { type: 'string', enum: ['stage', 'decision', 'incident', 'recall', 'flow'] }, at_ms: ms, title: text, actor: nullable(text), receipt_ref: nullable(id) });
const regime = object({ state: { type: 'string', enum: ['PUBLISHED', 'NOT_PUBLISHED'] }, ratio_scale: nullable({ type: 'string', enum: ['FRACTION', 'PERCENT'] }),
  value: nullable(decimal), reason_code: nullable({ type: 'string', enum: ['INSUFFICIENT_DATA', 'REGIME_MODEL_NOT_PUBLISHED'] }) });
const venue = object({ venue: text, economic_domain: { type: 'string', enum: ['ACTUAL', 'PAPER', 'SANDBOX'] }, currency: text, net_pnl: decimal, as_of_ms: ms });

const response = {
  type: 'object', additionalProperties: false, required: ['schema_version', 'workspace_id', 'alpha_id', 'record_authority', 'read_at_ms'],
  properties: {
    schema_version: { const: 'portal.execution.alpha-lifecycle.v1' }, workspace_id: text, alpha_id: id, alpha_version_id: nullable(id),
    record_authority: { const: 'PORTAL_PROJECTION' }, read_at_ms: ms,
    stages: nullable({ type: 'array', minItems: 1, maxItems: 6, items: stage }),
    events: nullable(object({ total: count, truncated: { type: 'boolean' }, items: { type: 'array', maxItems: 200, items: event } })),
    regime_fit: nullable(regime),
    venue_net_pnl: nullable({ type: 'array', maxItems: 64, items: venue }),
  },
  allOf: [{ type: 'object', if: { type: 'object', required: ['regime_fit'], properties: { regime_fit: { type: 'object', required: ['state'], properties: { state: { const: 'PUBLISHED' } } } } },
    then: { type: 'object', properties: { regime_fit: { type: 'object', properties: { value: { type: 'string' }, ratio_scale: { type: 'string' }, reason_code: { type: 'null' } } } } },
    else: { type: 'object', properties: {} } },
  { type: 'object', if: { type: 'object', required: ['regime_fit'], properties: { regime_fit: { type: 'object', required: ['state'], properties: { state: { const: 'NOT_PUBLISHED' } } } } },
    then: { type: 'object', properties: { regime_fit: { type: 'object', properties: { value: { type: 'null' }, ratio_scale: { type: 'null' }, reason_code: { type: 'string' } } } } } }],
};
const problem = object({ error: object({ code: { type: 'string', enum: ['EXECUTION_READ_NOT_AVAILABLE', 'EXECUTION_READ_CURRENT_ONLY'] }, message: text }, ['code', 'message']), request_id: { type: 'string' } });
const headers = { 'Cache-Control': { required: true, schema: { type: 'string', const: 'private, no-store' } } };
const err = d => ({ description: d, headers, content: { 'application/json': { schema: { $ref: '#/components/schemas/AlphaLifecycleProblem' } } } });
const operation = { get: { operationId: 'executionAlphaLifecycleGetV1', security: [{ PortalSession: [] }],
  description: 'The lifecycle of one alpha: stage transitions with criteria, decider, actor and receipt; the unified event feed; the regime fit ratio apart from the score; Net PnL per venue. ' +
    'Each section is omitted (no owning source), null (source not read) or published; a count of 0 is a published true zero; Net PnL is one currency per figure and is never summed. ' +
    'CONTRACT ONLY: no producer exists yet (Edge/Core inputs are in WP_K_CONTRACTS_2026-10-23.md), so nothing serves this route and every screen keeps its typed absence.',
  parameters: [{ name: 'alpha_id', in: 'path', required: true, schema: id }, { name: 'workspace_id', in: 'query', required: false, schema: text },
    { name: 'environment', in: 'query', required: false, schema: { type: 'string', enum: ['paper', 'sandbox', 'live'] } }],
  responses: { 200: { description: 'Authorized current lifecycle; absence stays typed', headers, content: { 'application/json': { schema: { $ref: '#/components/schemas/AlphaLifecycle' } } } },
    ...Object.fromEntries([[400, 'Invalid query'], [401, 'Session required'], [404, 'Alpha unavailable or not authorized'], [503, 'Source unavailable']].map(([c, t]) => [c, err(t)])) } } };
const header = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.primusspark.com/portal/execution-alpha-lifecycle.v1.schema.json' };

// Ajv strict mode wants a type beside every `properties` / `required` / `items` keyword, including inside if / then / else.
const typed = node => {
  if (Array.isArray(node)) { node.forEach(typed); return node; }
  if (node && typeof node === 'object') {
    if (!('type' in node) && !('const' in node) && !('enum' in node) && !('anyOf' in node)) {
      if ('properties' in node || 'required' in node) node.type = 'object';
      else if ('items' in node) node.type = 'array';
    }
    for (const [key, value] of Object.entries(node)) { if (key === 'properties') Object.values(value).forEach(typed); else if (key !== 'required' && key !== 'enum' && key !== 'const') typed(value); }
  }
  return node;
};
typed(response);

const T0 = 1_800_000_000_000, DAY = 86_400_000;
const base = { schema_version: 'portal.execution.alpha-lifecycle.v1', workspace_id: 'TEST_ONLY:workspace', alpha_id: 'TEST_ONLY:alpha-a', alpha_version_id: 'TEST_ONLY:alpha-a-v2', record_authority: 'PORTAL_PROJECTION', read_at_ms: T0 };
const wrap = value => ({ lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', value });
const crit = (met, total) => ({ met, total, items: Array.from({ length: total }, (_, i) => ({ label: `Criterion ${i + 1}`, observed: i < met ? `${70 + i}.0` : '41.5', threshold: '60.0', met: i < met })) });
const stages = [
  { stage: 'R1', state: 'DONE', entered_at_ms: T0 - 160 * DAY, exited_at_ms: T0 - 150 * DAY, days_in_stage: 10, criteria: null, decider_role: 'Manager', decided_by: 'TEST_ONLY:actor-1', receipt_ref: 'TEST_ONLY:receipt-r1', blocked_reason: null },
  { stage: 'R2', state: 'DONE', entered_at_ms: T0 - 150 * DAY, exited_at_ms: T0 - 140 * DAY, days_in_stage: 10, criteria: null, decider_role: 'Manager', decided_by: 'TEST_ONLY:actor-2', receipt_ref: 'TEST_ONLY:receipt-r2', blocked_reason: null },
  { stage: 'PAPER', state: 'DONE', entered_at_ms: T0 - 140 * DAY, exited_at_ms: T0 - 100 * DAY, days_in_stage: 40, criteria: crit(7, 7), decider_role: 'Manager', decided_by: 'TEST_ONLY:actor-1', receipt_ref: 'TEST_ONLY:receipt-paper', blocked_reason: null },
  { stage: 'SANDBOX', state: 'DONE', entered_at_ms: T0 - 100 * DAY, exited_at_ms: T0 - 70 * DAY, days_in_stage: 30, criteria: crit(7, 7), decider_role: 'Manager', decided_by: 'TEST_ONLY:actor-3', receipt_ref: 'TEST_ONLY:receipt-sandbox', blocked_reason: null },
  { stage: 'CANARY', state: 'CURRENT', entered_at_ms: T0 - 70 * DAY, exited_at_ms: null, days_in_stage: 70, criteria: crit(6, 7), decider_role: 'Manager', decided_by: null, receipt_ref: null, blocked_reason: 'Criterion 7 of 7 is not met' },
  { stage: 'LIVE', state: 'NOT_STARTED', entered_at_ms: null, exited_at_ms: null, days_in_stage: null, criteria: null, decider_role: null, decided_by: null, receipt_ref: null, blocked_reason: null }];
const events = { total: 5, truncated: false, items: [
  { event_id: 'TEST_ONLY:evt-1', kind: 'stage', at_ms: T0 - 140 * DAY, title: 'Paper started', actor: null, receipt_ref: null },
  { event_id: 'TEST_ONLY:evt-2', kind: 'decision', at_ms: T0 - 100 * DAY, title: 'Paper exit approved', actor: 'TEST_ONLY:actor-1', receipt_ref: 'TEST_ONLY:receipt-paper' },
  { event_id: 'TEST_ONLY:evt-3', kind: 'incident', at_ms: T0 - 20 * DAY, title: 'Venue feed gap', actor: null, receipt_ref: null },
  { event_id: 'TEST_ONLY:evt-4', kind: 'recall', at_ms: T0 - 2 * DAY, title: 'Recall pending', actor: 'TEST_ONLY:actor-2', receipt_ref: 'TEST_ONLY:receipt-recall' },
  { event_id: 'TEST_ONLY:evt-5', kind: 'flow', at_ms: T0 - 70 * DAY, title: 'Allocation added', actor: 'TEST_ONLY:actor-2', receipt_ref: null }] };
const published = { ...base, stages, events, regime_fit: { state: 'PUBLISHED', ratio_scale: 'FRACTION', value: '0.6125', reason_code: null },
  venue_net_pnl: [{ venue: 'BINANCE', economic_domain: 'ACTUAL', currency: 'USDT', net_pnl: '1250.5', as_of_ms: T0 }, { venue: 'OKX', economic_domain: 'ACTUAL', currency: 'USDT', net_pnl: '-310.25', as_of_ms: T0 },
    { venue: 'DERIBIT', economic_domain: 'ACTUAL', currency: 'BTC', net_pnl: '0.0412', as_of_ms: T0 }] };
const notRead = { ...base, stages: null, events: null, regime_fit: null, venue_net_pnl: null };
const noSource = { ...base };
const regimeAbsent = { ...base, regime_fit: { state: 'NOT_PUBLISHED', ratio_scale: null, value: null, reason_code: 'INSUFFICIENT_DATA' } };
const negative = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', bases: { published: 'execution-alpha-lifecycle.published.synthetic.valid.json', regimeAbsent: 'execution-alpha-lifecycle.regime-absent.synthetic.valid.json' },
  note: 'WP-K slice 5: a regime fit is a ratio with a stated scale or a typed absence (never both, never a zero in place of an absence); a criteria count is an integer; Net PnL is an exact decimal string with its currency; the object is closed.',
  cases: [
    { id: 'WP-K/regime-published-without-scale', base: 'published', rule: 'a published ratio states its scale', ops: [{ op: 'set', path: ['regime_fit', 'ratio_scale'], value: null }] },
    { id: 'WP-K/regime-published-with-reason', base: 'published', rule: 'a published ratio has no absence reason', ops: [{ op: 'set', path: ['regime_fit', 'reason_code'], value: 'INSUFFICIENT_DATA' }] },
    { id: 'WP-K/regime-absent-with-value', base: 'regimeAbsent', rule: 'a typed absence carries no number (not even 0)', ops: [{ op: 'set', path: ['regime_fit', 'value'], value: '0' }] },
    { id: 'WP-K/regime-absent-without-reason', base: 'regimeAbsent', rule: 'a typed absence names its reason', ops: [{ op: 'set', path: ['regime_fit', 'reason_code'], value: null }] },
    { id: 'WP-K/criteria-met-float', base: 'published', rule: 'a criteria count is an integer', ops: [{ op: 'set', path: ['stages', 4, 'criteria', 'met'], value: 6.5 }] },
    { id: 'WP-K/net-pnl-number', base: 'published', rule: 'Net PnL is an exact decimal string, never a JS number', ops: [{ op: 'set', path: ['venue_net_pnl', 0, 'net_pnl'], value: 1250.5 }] },
    { id: 'WP-K/venue-without-currency', base: 'published', rule: 'one currency per figure', ops: [{ op: 'delete', path: ['venue_net_pnl', 0, 'currency'] }] },
    { id: 'WP-K/unknown-stage', base: 'published', rule: 'the stage vocabulary is closed', ops: [{ op: 'set', path: ['stages', 0, 'stage'], value: 'BETA' }] },
    { id: 'WP-K/unknown-key', base: 'published', rule: 'closed object', ops: [{ op: 'set', path: ['score'], value: 1 }] }] };

const outputs = {
  'schemas/execution-alpha-lifecycle.v1.schema.json': { ...header, ...response },
  'openapi/execution-alpha-lifecycle.openapi.json': { openapi: '3.1.0', info: { title: 'Alpha lifecycle', version: '1.0.0' },
    paths: { '/api/v1/execution/alphas/{alpha_id}/lifecycle': operation },
    components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } }, schemas: { AlphaLifecycle: response, AlphaLifecycleProblem: problem } } },
  'fixtures/execution-alpha-lifecycle.published.synthetic.valid.json': wrap(published),
  'fixtures/execution-alpha-lifecycle.not-read.synthetic.valid.json': wrap(notRead),
  'fixtures/execution-alpha-lifecycle.no-source.synthetic.valid.json': wrap(noSource),
  'fixtures/execution-alpha-lifecycle.regime-absent.synthetic.valid.json': wrap(regimeAbsent),
  'fixtures/execution-alpha-lifecycle.synthetic.negative.json': negative,
};
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value, null, 2) + '\n', path = resolve(root, file);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== content) throw new Error('Generated alpha lifecycle contract drift: ' + file); }
  else writeFileSync(path, content);
}
