// WP-K slice 3 (inbox B->K 3 and 5): two additive sibling reads for Operations, so the routed incident page and the Audit tab stop
// printing typed absences once a producer exists.
//   execution-incident-children.v1 GET /api/v1/execution/operations/incidents/{incident_id}/children (the scoped-incident sibling of the legacy execution.incident-detail.v1 read, which the V2 root does not carry)
//        evidence per source (finding, alert, dead letter, order trace: digest, label, added_at), assigned_to, resolution gate
//        (eligible, blocker codes), the timeline (event, action, actor, version before / after, at), and the ORIGINAL target of every linked operation.
//   execution-operations-audit.v1  GET /api/v1/execution/operations/audit
//        actor, action, subject, time and receipt of the operations workflow, keyset paged.
// Every section of the incident detail is optional and nullable by the slice-2 rule (omitted = no owning source, null = not read, object = published);
// the audit feed is a page whose items may each omit the receipt (null = the action wrote none). A count of 0 is a published true zero. The producers are
// MISSING today: the routes are published and nothing serves them (see WP_K_CONTRACTS_2026-10-23.md for the Edge/Core input of every field).
// TEST_ONLY fixtures only; none is a product receipt.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const ms = { type: 'integer', minimum: 0, maximum: 9007199254740991 };
const text = { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])' };
const id = { type: 'string', minLength: 1, maxLength: 191, pattern: '^[A-Za-z0-9._:-]+$(?![\\s\\S])' };
const digest = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$(?![\\s\\S])' };
const count = { type: 'integer', minimum: 0, maximum: 9007199254740991 };
const version = { type: 'integer', minimum: 1, maximum: 9007199254740991 };
const target = object({ type: { type: 'string', enum: ['ACCOUNT', 'PORTFOLIO', 'DEPLOYMENT'] }, id });
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
const headers = { 'Cache-Control': { required: true, schema: { type: 'string', const: 'private, no-store' } } };
const problemOf = name => object({ error: object({ code: { type: 'string', enum: ['EXECUTION_READ_NOT_AVAILABLE', 'EXECUTION_READ_QUERY_INVALID'] }, message: text }, ['code', 'message']), request_id: { type: 'string' } });
const errors = name => Object.fromEntries([[400, 'Invalid query'], [401, 'Session required'], [404, 'Unavailable or not authorized'], [503, 'Source unavailable']]
  .map(([c, t]) => [c, { description: t, headers, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Problem` } } } }]));

/* ── incident detail ── */
const SOURCES = ['FINDING', 'ALERT', 'DEAD_LETTER', 'ORDER_TRACE'];
const detail = typed({
  type: 'object', additionalProperties: false, required: ['schema_version', 'workspace_id', 'incident_id', 'record_authority', 'read_at_ms'],
  properties: {
    schema_version: { const: 'portal.execution.incident-children.v1' }, workspace_id: text, incident_id: id, record_authority: { const: 'PORTAL_PROJECTION' }, read_at_ms: ms,
    evidence: nullable({ type: 'array', maxItems: 200, items: object({ source: { type: 'string', enum: SOURCES }, digest, label: text, added_at_ms: ms }) }),
    assigned_to: nullable(object({ actor: text, assigned_at_ms: ms })),
    resolution_gate: nullable(object({ eligible: { type: 'boolean' }, blocker_codes: { type: 'array', maxItems: 32, items: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{1,63}$(?![\\s\\S])' } } })),
    timeline: nullable({ type: 'array', maxItems: 200, items: object({ event_id: id, action: text, actor: nullable(text), version_before: nullable(version), version_after: version, at_ms: ms }) }),
    linked_operations: nullable({ type: 'array', maxItems: 100, items: object({ operation_id: id, original_target: nullable(target) }) }),
  },
  allOf: [{ type: 'object', if: { type: 'object', required: ['resolution_gate'], properties: { resolution_gate: { type: 'object', required: ['eligible'], properties: { eligible: { const: true } } } } },
    then: { type: 'object', properties: { resolution_gate: { type: 'object', properties: { blocker_codes: { type: 'array', maxItems: 0 } } } } } }],
});
/* ── audit page ── */
const audit = typed({
  type: 'object', additionalProperties: false, required: ['schema_version', 'workspace_id', 'record_authority', 'read_at_ms', 'items', 'has_more', 'next_cursor'],
  properties: {
    schema_version: { const: 'portal.execution.operations-audit.v1' }, workspace_id: text, record_authority: { const: 'PORTAL_PROJECTION' }, read_at_ms: ms,
    items: { type: 'array', maxItems: 250, items: object({ audit_id: id, at_ms: ms, actor: text, action: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{1,63}$(?![\\s\\S])' },
      subject: object({ type: { type: 'string', enum: ['OPERATION', 'INCIDENT', 'ACCOUNT', 'PORTFOLIO', 'DEPLOYMENT'] }, id }), receipt_ref: nullable(id) }) },
    has_more: { type: 'boolean' }, next_cursor: nullable({ type: 'string', minLength: 1, maxLength: 4096 }),
  },
  allOf: [{ type: 'object', if: { type: 'object', required: ['has_more'], properties: { has_more: { const: true } } }, then: { type: 'object', properties: { next_cursor: { type: 'string' } } },
    else: { type: 'object', properties: { next_cursor: { type: 'null' } } } }],
});

const op = (operationId, description, parameters, name) => ({ get: { operationId, security: [{ PortalSession: [] }], description, parameters,
  responses: { 200: { description: 'Authorized current answer; absence stays typed', headers, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } }, ...errors(name) } } });
const header = file => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://schemas.primusspark.com/portal/${file}` });
const securitySchemes = { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } };
const NO_PRODUCER = 'CONTRACT ONLY: no producer exists yet (Edge/Core inputs are in WP_K_CONTRACTS_2026-10-23.md), so nothing serves this route and every screen keeps its typed absence.';

const T0 = 1_800_000_000_000, DAY = 86_400_000, wrap = value => ({ lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', value });
const sha = c => 'sha256:' + c.repeat(64);
const dbase = { schema_version: 'portal.execution.incident-children.v1', workspace_id: 'TEST_ONLY:workspace', incident_id: 'TEST_ONLY:incident-1', record_authority: 'PORTAL_PROJECTION', read_at_ms: T0 };
const dpub = { ...dbase,
  evidence: [{ source: 'FINDING', digest: sha('a'), label: 'Position limit finding', added_at_ms: T0 - 3 * DAY }, { source: 'ALERT', digest: sha('b'), label: 'Feed gap alert', added_at_ms: T0 - 2 * DAY },
    { source: 'DEAD_LETTER', digest: sha('c'), label: 'Dead letter 2', added_at_ms: T0 - DAY }, { source: 'ORDER_TRACE', digest: sha('d'), label: 'Order trace', added_at_ms: T0 - DAY / 2 }],
  assigned_to: { actor: 'TEST_ONLY:actor-1', assigned_at_ms: T0 - 2 * DAY },
  resolution_gate: { eligible: false, blocker_codes: ['OPEN_DEAD_LETTER', 'UNVERIFIED_ORDER_TRACE'] },
  timeline: [{ event_id: 'TEST_ONLY:tl-1', action: 'OPENED', actor: null, version_before: null, version_after: 1, at_ms: T0 - 3 * DAY }, { event_id: 'TEST_ONLY:tl-2', action: 'ASSIGNED', actor: 'TEST_ONLY:actor-2', version_before: 1, version_after: 2, at_ms: T0 - 2 * DAY }],
  linked_operations: [{ operation_id: 'TEST_ONLY:op-1', original_target: { type: 'DEPLOYMENT', id: 'TEST_ONLY:dep-1' } }, { operation_id: 'TEST_ONLY:op-2', original_target: null }] };
const dEligible = { ...dpub, resolution_gate: { eligible: true, blocker_codes: [] }, evidence: [], timeline: [] };
const dNotRead = { ...dbase, evidence: null, assigned_to: null, resolution_gate: null, timeline: null, linked_operations: null };
const dNone = { ...dbase };
const abase = { schema_version: 'portal.execution.operations-audit.v1', workspace_id: 'TEST_ONLY:workspace', record_authority: 'PORTAL_PROJECTION', read_at_ms: T0 };
const item = (n, action, type, subject, receipt) => ({ audit_id: `TEST_ONLY:audit-${n}`, at_ms: T0 - n * 3_600_000, actor: 'TEST_ONLY:actor-1', action, subject: { type, id: subject }, receipt_ref: receipt });
const aPage = { ...abase, items: [item(1, 'ACKNOWLEDGED', 'OPERATION', 'TEST_ONLY:op-1', 'TEST_ONLY:receipt-1'), item(2, 'ASSIGNED', 'INCIDENT', 'TEST_ONLY:incident-1', null), item(3, 'RESOLVED', 'OPERATION', 'TEST_ONLY:op-2', 'TEST_ONLY:receipt-2')], has_more: true, next_cursor: 'TEST_ONLY:cursor-1' };
const aLast = { ...abase, items: [item(4, 'ACKNOWLEDGED', 'OPERATION', 'TEST_ONLY:op-3', null)], has_more: false, next_cursor: null };
const aEmpty = { ...abase, items: [], has_more: false, next_cursor: null };

const negative = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',
  bases: { detail: 'execution-incident-children.published.synthetic.valid.json', eligible: 'execution-incident-children.eligible.synthetic.valid.json', audit: 'execution-operations-audit.page.synthetic.valid.json', last: 'execution-operations-audit.last.synthetic.valid.json' },
  note: 'WP-K slice 3: an eligible resolution gate has no blocker; evidence sources, audit subject types and target types are closed; a digest is sha256; the audit cursor exists exactly when there is another page; the objects are closed.',
  cases: [
    { id: 'WP-K/gate-eligible-with-blockers', schema: 'detail', base: 'detail', rule: 'an eligible gate has no blocker', ops: [{ op: 'set', path: ['resolution_gate', 'eligible'], value: true }] },
    { id: 'WP-K/evidence-unknown-source', schema: 'detail', base: 'detail', rule: 'evidence sources are closed', ops: [{ op: 'set', path: ['evidence', 0, 'source'], value: 'RUMOUR' }] },
    { id: 'WP-K/evidence-bad-digest', schema: 'detail', base: 'detail', rule: 'a digest is sha256', ops: [{ op: 'set', path: ['evidence', 0, 'digest'], value: 'abc' }] },
    { id: 'WP-K/timeline-version-zero', schema: 'detail', base: 'detail', rule: 'a version is positive', ops: [{ op: 'set', path: ['timeline', 1, 'version_after'], value: 0 }] },
    { id: 'WP-K/original-target-unknown-type', schema: 'detail', base: 'detail', rule: 'target types are closed', ops: [{ op: 'set', path: ['linked_operations', 0, 'original_target', 'type'], value: 'VENUE' }] },
    { id: 'WP-K/detail-unknown-key', schema: 'detail', base: 'detail', rule: 'closed object', ops: [{ op: 'set', path: ['severity'], value: 'HIGH' }] },
    { id: 'WP-K/audit-more-without-cursor', schema: 'audit', base: 'audit', rule: 'another page needs its cursor', ops: [{ op: 'set', path: ['next_cursor'], value: null }] },
    { id: 'WP-K/audit-cursor-on-last-page', schema: 'audit', base: 'last', rule: 'the last page has no cursor', ops: [{ op: 'set', path: ['next_cursor'], value: 'TEST_ONLY:cursor-x' }] },
    { id: 'WP-K/audit-lowercase-action', schema: 'audit', base: 'audit', rule: 'an action is an upper-case code', ops: [{ op: 'set', path: ['items', 0, 'action'], value: 'acknowledged' }] },
    { id: 'WP-K/audit-without-actor', schema: 'audit', base: 'audit', rule: 'an audit row names its actor', ops: [{ op: 'delete', path: ['items', 0, 'actor'] }] },
    { id: 'WP-K/audit-unknown-subject-type', schema: 'audit', base: 'audit', rule: 'subject types are closed', ops: [{ op: 'set', path: ['items', 0, 'subject', 'type'], value: 'USER' }] }] };

const outputs = {
  'schemas/execution-incident-children.v1.schema.json': { ...header('execution-incident-children.v1.schema.json'), ...detail },
  'openapi/execution-incident-children.openapi.json': { openapi: '3.1.0', info: { title: 'Incident children', version: '1.0.0' },
    paths: { '/api/v1/execution/operations/incidents/{incident_id}/children': op('executionIncidentChildrenGetV1',
      `The children of one incident: evidence per source, assignee, resolution gate with blocker codes, timeline with versions, and the original target of every linked operation. Each section is omitted (no owning source), null (source not read) or published. ${NO_PRODUCER}`,
      [{ name: 'incident_id', in: 'path', required: true, schema: id }, { name: 'workspace_id', in: 'query', required: false, schema: text }], 'IncidentChildren') },
    components: { securitySchemes, schemas: { IncidentChildren: detail, IncidentChildrenProblem: problemOf('IncidentChildren') } } },
  'schemas/execution-operations-audit.v1.schema.json': { ...header('execution-operations-audit.v1.schema.json'), ...audit },
  'openapi/execution-operations-audit.openapi.json': { openapi: '3.1.0', info: { title: 'Operations audit feed', version: '1.0.0' },
    paths: { '/api/v1/execution/operations/audit': op('executionOperationsAuditGetV1',
      `The audit feed of the operations workflow: actor, action, subject, time and receipt, newest first, keyset paged. ${NO_PRODUCER}`,
      [{ name: 'workspace_id', in: 'query', required: false, schema: text }, { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 250 } },
        { name: 'after', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 4096 } }, { name: 'incident_id', in: 'query', required: false, schema: id }], 'OperationsAudit') },
    components: { securitySchemes, schemas: { OperationsAudit: audit, OperationsAuditProblem: problemOf('OperationsAudit') } } },
  'fixtures/execution-incident-children.published.synthetic.valid.json': wrap(dpub),
  'fixtures/execution-incident-children.eligible.synthetic.valid.json': wrap(dEligible),
  'fixtures/execution-incident-children.not-read.synthetic.valid.json': wrap(dNotRead),
  'fixtures/execution-incident-children.no-source.synthetic.valid.json': wrap(dNone),
  'fixtures/execution-operations-audit.page.synthetic.valid.json': wrap(aPage),
  'fixtures/execution-operations-audit.last.synthetic.valid.json': wrap(aLast),
  'fixtures/execution-operations-audit.empty.synthetic.valid.json': wrap(aEmpty),
  'fixtures/execution-incident-audit.synthetic.negative.json': negative,
};
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value, null, 2) + '\n', path = resolve(root, file);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== content) throw new Error('Generated incident/audit contract drift: ' + file); }
  else writeFileSync(path, content);
}
