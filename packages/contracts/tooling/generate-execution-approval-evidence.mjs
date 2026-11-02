// WP-K slice 2 (inbox E->K 1-5): the evidence an approver reads beside one approval request, as ONE additive sibling read, so the sealed
// parent reads (R2 / Paper exit / Live) keep their field seals. Every section is optional and nullable by the same rule:
//   omitted = no owning source exists for this request kind (nothing to read);   null = the source exists and was not read;
//   object = published. Absence is never a zero: a count of 0 is a published true zero, only `null` / omitted is "unknown".
// The producer is MISSING today (no projection row carries these facts): the route is published, nothing serves it, and the screens keep
// their typed absence. TEST_ONLY fixtures only; none is a product receipt.
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
const unit = { type: 'string', enum: ['MONEY', 'RATIO', 'COUNT', 'TEXT', 'TIMESTAMP_MS'] };

const point = object({ ts_ms: ms, value: decimal });
const history = object({
  subject: object({ subject_type: { type: 'string', enum: ['ALPHA', 'PORTFOLIO', 'ACCOUNT', 'DEPLOYMENT'] }, subject_id: id }),
  metric: { type: 'string', enum: ['NAV', 'NET_PNL', 'RETURN', 'DRAWDOWN'] },
  unit: { type: 'string', enum: ['MONEY', 'RATIO'] }, currency: nullable(text), ratio_scale: nullable({ type: 'string', enum: ['FRACTION', 'PERCENT'] }),
  window: object({ from_ms: ms, to_ms: ms }), methodology_ref: text,
  points: { type: 'array', maxItems: 2000, items: point }, as_of_ms: ms });
const change = object({ label: text, before: nullable(text), after: nullable(text), unit });
const diff = object({ previous_revision: text, changes: { type: 'array', maxItems: 64, items: change } });
const obligations = object({ open_positions: count, working_orders: count, reservations: count, unknown_outcomes: count, settlement_pending: count });
const preview = object({ what_changes: text, counts_as: object({ met_after: count, required: count }) });

const response = {
  type: 'object', additionalProperties: false,
  required: ['schema_version', 'workspace_id', 'approval_id', 'record_authority', 'read_at_ms'],
  properties: {
    schema_version: { const: 'portal.execution.approval-evidence.v1' },
    workspace_id: text, approval_id: id,
    record_authority: { const: 'PORTAL_PROJECTION' },
    // The Portal's own evaluation time of this answer (E->K 5): the freshness chip says an as-of instead of the browser's receipt time.
    read_at_ms: ms,
    prior_economic_history: nullable(history),
    evidence_diff: nullable(diff),
    obligations_after_approval: nullable(obligations),
    receipt_preview: nullable(preview),
  },
  allOf: [{ if: { type: 'object', required: ['prior_economic_history'], properties: { prior_economic_history: { type: 'object' } } },
    then: { properties: { prior_economic_history: { allOf: [
      { if: { type: 'object', properties: { metric: { enum: ['RETURN', 'DRAWDOWN'] } }, required: ['metric'] }, then: { properties: { unit: { const: 'RATIO' }, currency: { type: 'null' }, ratio_scale: { type: 'string' } } },
        else: { properties: { unit: { const: 'MONEY' }, currency: { type: 'string' }, ratio_scale: { type: 'null' } } } },
      { if: { type: 'object', properties: { metric: { const: 'DRAWDOWN' } }, required: ['metric'] },
        then: { properties: { points: { type: 'array', items: { type: 'object', properties: { value: { type: 'string', pattern: '^(?:0(?:\\.0+)?|-(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?)$(?![\\s\\S])' } } } } } } }] } } } }],
};
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
// The route shares Portal's sanitized HTTP error envelope. Governance, session,
// workspace and operational fences use different stable codes; do not claim
// that only the two legacy execution-read codes can be emitted.
const problem = object({ error: object({ code: { type: 'string', minLength: 1, maxLength: 191, pattern: '^[A-Z][A-Z0-9_]*$(?![\\s\\S])' }, message: text }, ['code', 'message']),
  request_id: { type: 'string' }, public_copy_key: { type: 'string' }, safe_next_action: { type: 'string', enum: ['QUERY_SAME_INTENT', 'REVIEW_BLOCKER'] },
  details: { type: 'object', additionalProperties: true } }, ['error', 'request_id']);
const headers = { 'Cache-Control': { required: true, schema: { type: 'string', const: 'private, no-store' } } };
const err = d => ({ description: d, headers, content: { 'application/json': { schema: { $ref: '#/components/schemas/ApprovalEvidenceProblem' } } } });
const operation = { get: { operationId: 'executionApprovalEvidenceGetV1', security: [{ PortalSession: [] }],
  description: 'The evidence beside one approval request: prior economic history, evidence diff, obligations still open after approval, the receipt preview, and the Portal evaluation time. ' +
    'Each section is omitted (no owning source), null (source not read) or published; a count of 0 is a published true zero. ' +
    'A source-dark producer is optionally mounted only on the authorized Research review profile; source sections and field authority are not commissioned (see WP_K_CONTRACTS_2026-10-23.md).',
  parameters: [{ name: 'approval_id', in: 'path', required: true, schema: id }, { name: 'workspace_id', in: 'query', required: false, schema: text }],
  responses: { 200: { description: 'Authorized current evidence; absence stays typed', headers, content: { 'application/json': { schema: { $ref: '#/components/schemas/ApprovalEvidence' } } } },
    ...Object.fromEntries([[400, 'Invalid query'], [401, 'Session required'], [403, 'Read authority refused'], [404, 'Approval unavailable or not authorized'], [409, 'Read authority changed'], [500, 'Internal error'], [503, 'Source or read authority unavailable']].map(([c, t]) => [c, err(t)])) } } };
const header = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.primusspark.com/portal/execution-approval-evidence.v1.schema.json' };

const T0 = 1_800_000_000_000, DAY = 86_400_000;
const base = { schema_version: 'portal.execution.approval-evidence.v1', workspace_id: 'TEST_ONLY:workspace', approval_id: 'TEST_ONLY:approval-1', record_authority: 'PORTAL_PROJECTION', read_at_ms: T0 };
const wrap = value => ({ lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', value });
const fullHistory = { subject: { subject_type: 'PORTFOLIO', subject_id: 'TEST_ONLY:portfolio-a' }, metric: 'NAV', unit: 'MONEY', currency: 'USDT', ratio_scale: null,
  window: { from_ms: T0 - 30 * DAY, to_ms: T0 }, methodology_ref: 'TEST_ONLY:nav-twr.v1', as_of_ms: T0,
  points: [[0, '100.000000000000000001'], [10, '101.5'], [20, '99.25'], [30, '102']].map(([d, value]) => ({ ts_ms: T0 - 30 * DAY + d * DAY, value })) };
const published = { ...base, prior_economic_history: fullHistory,
  evidence_diff: { previous_revision: 'TEST_ONLY:revision-3', changes: [
    { label: 'Requested capital', before: '10000.00', after: '15000.00', unit: 'MONEY' }, { label: 'Criteria met', before: '6', after: '7', unit: 'COUNT' }, { label: 'Reviewer note', before: null, after: 'Added', unit: 'TEXT' }] },
  obligations_after_approval: { open_positions: 2, working_orders: 0, reservations: 1, unknown_outcomes: 0, settlement_pending: 0 },
  receipt_preview: { what_changes: 'Allocation to portfolio A rises by 5000.00 USDT; the gate counts 7 of 7 criteria as met.', counts_as: { met_after: 7, required: 7 } } };
const notRead = { ...base, prior_economic_history: null, evidence_diff: null, obligations_after_approval: null, receipt_preview: null };
const noSource = { ...base };
const drawdown = { ...base, prior_economic_history: { ...fullHistory, metric: 'DRAWDOWN', unit: 'RATIO', currency: null, ratio_scale: 'FRACTION', methodology_ref: 'TEST_ONLY:drawdown-peak-to-trough.v1',
  points: fullHistory.points.map((p, i) => ({ ts_ms: p.ts_ms, value: ['0', '-0.0123', '-0.0045', '0'][i] })) } };
const negative = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', bases: { published: 'execution-approval-evidence.published.synthetic.valid.json', drawdown: 'execution-approval-evidence.drawdown.synthetic.valid.json' },
  note: 'WP-K slice 2: a count is a non-negative integer (a true 0 is published, never a string or a default); a drawdown is at or below zero; a ratio states its scale; money has a currency.',
  cases: [
    { id: 'WP-K/obligation-negative', base: 'published', rule: 'a count is not negative', ops: [{ op: 'set', path: ['obligations_after_approval', 'working_orders'], value: -1 }] },
    { id: 'WP-K/obligation-string', base: 'published', rule: 'a count is an integer, not text', ops: [{ op: 'set', path: ['obligations_after_approval', 'open_positions'], value: '2' }] },
    { id: 'WP-K/obligation-missing-key', base: 'published', rule: 'all five counts or the section is null', ops: [{ op: 'delete', path: ['obligations_after_approval', 'reservations'] }] },
    { id: 'WP-K/history-money-without-currency', base: 'published', rule: 'money states its currency', ops: [{ op: 'set', path: ['prior_economic_history', 'currency'], value: null }] },
    { id: 'WP-K/history-drawdown-above-zero', base: 'drawdown', rule: 'a drawdown is at or below zero', ops: [{ op: 'set', path: ['prior_economic_history', 'points', 1, 'value'], value: '0.5' }] },
    { id: 'WP-K/history-ratio-without-scale', base: 'drawdown', rule: 'a ratio states its scale', ops: [{ op: 'set', path: ['prior_economic_history', 'ratio_scale'], value: null }] },
    { id: 'WP-K/unknown-key', base: 'published', rule: 'closed object', ops: [{ op: 'set', path: ['score'], value: 1 }] }] };

const outputs = {
  'schemas/execution-approval-evidence.v1.schema.json': { ...header, ...response },
  'openapi/execution-approval-evidence.openapi.json': { openapi: '3.1.0', info: { title: 'Approval evidence', version: '1.0.0' },
    paths: { '/api/v1/execution/governance/approvals/{approval_id}/evidence': operation },
    components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } }, schemas: { ApprovalEvidence: response, ApprovalEvidenceProblem: problem } } },
  'fixtures/execution-approval-evidence.published.synthetic.valid.json': wrap(published),
  'fixtures/execution-approval-evidence.not-read.synthetic.valid.json': wrap(notRead),
  'fixtures/execution-approval-evidence.no-source.synthetic.valid.json': wrap(noSource),
  'fixtures/execution-approval-evidence.drawdown.synthetic.valid.json': wrap(drawdown),
  'fixtures/execution-approval-evidence.synthetic.negative.json': negative,
};
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value, null, 2) + '\n', path = resolve(root, file);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== content) throw new Error('Generated approval evidence contract drift: ' + file); }
  else writeFileSync(path, content);
}
