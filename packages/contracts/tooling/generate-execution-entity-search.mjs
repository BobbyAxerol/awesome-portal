// WP-K slice 7 (inbox D->K 1): the cross-entity search index of the command bar as one additive read, so the bar stops fanning out to six list reads
// and matching two of them in the browser. `GET /api/v1/execution/search?q=&kinds=&limit=` answers, per kind, at most `limit` rows already scoped to the
// caller's authorization: an unauthorized entity is ABSENT (never "denied", never counted), `total_matched` is an integer or null (null = not counted).
// CONTRACT ONLY: no producer exists yet (inputs in WP_K_CONTRACTS_2026-10-23.md). TEST_ONLY fixtures; none is a product receipt.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const ms = { type: 'integer', minimum: 0, maximum: 9007199254740991 };
const text = { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])' };
const id = { type: 'string', minLength: 1, maxLength: 191, pattern: '^[A-Za-z0-9._:-]+$(?![\\s\\S])' };
const count = { type: 'integer', minimum: 0, maximum: 9007199254740991 };
const KINDS = ['alpha', 'portfolio', 'account', 'operation', 'incident', 'approval'];
const kind = { type: 'string', enum: KINDS };
const hint = { type: 'string', minLength: 2, maxLength: 512, pattern: '^/[^\\u0000-\\u001f\\u007f\\s]*$(?![\\s\\S])' };
const row = object({ kind, id, label: text, detail: nullable(text), route_hint: hint });
const group = object({ kind, total_matched: nullable(count), rows: { type: 'array', maxItems: 50, items: row } });
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
const response = typed({
  type: 'object', additionalProperties: false, required: ['schema_version', 'workspace_id', 'record_authority', 'read_at_ms', 'query', 'groups'],
  properties: {
    schema_version: { const: 'portal.execution.entity-search.v1' }, workspace_id: text, record_authority: { const: 'PORTAL_PROJECTION' }, read_at_ms: ms,
    query: object({ q: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])' }, kinds: { type: 'array', minItems: 1, maxItems: 6, uniqueItems: true, items: kind }, limit: { type: 'integer', minimum: 1, maximum: 50 } }),
    groups: { type: 'array', maxItems: 6, items: group },
  },
});
const problem = object({ error: object({ code: { type: 'string', enum: ['EXECUTION_READ_NOT_AVAILABLE', 'EXECUTION_READ_QUERY_INVALID'] }, message: text }, ['code', 'message']), request_id: { type: 'string' } });
const headers = { 'Cache-Control': { required: true, schema: { type: 'string', const: 'private, no-store' } } };
const err = d => ({ description: d, headers, content: { 'application/json': { schema: { $ref: '#/components/schemas/EntitySearchProblem' } } } });
const operation = { get: { operationId: 'executionEntitySearchGetV1', security: [{ PortalSession: [] }],
  description: 'Cross-entity search for the command bar: per kind (alpha, portfolio, account, operation, incident, approval) at most `limit` rows `{kind, id, label, detail, route_hint}`, already scoped to the caller. An entity the caller may not see is absent, never denied or counted. `total_matched` is an integer, or null when the source did not count it. ' +
    'CONTRACT ONLY: no producer exists yet (inputs are in WP_K_CONTRACTS_2026-10-23.md), so nothing serves this route and the bar keeps fanning out to the list reads.',
  parameters: [{ name: 'q', in: 'query', required: true, schema: response.properties.query.properties.q },
    { name: 'kinds', in: 'query', required: false, description: 'Comma-separated subset of the six kinds; default all.', schema: { type: 'string', pattern: '^(?:alpha|portfolio|account|operation|incident|approval)(?:,(?:alpha|portfolio|account|operation|incident|approval))*$' } },
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 8 } }, { name: 'workspace_id', in: 'query', required: false, schema: text }],
  responses: { 200: { description: 'Authorized current matches; absence is absence', headers, content: { 'application/json': { schema: { $ref: '#/components/schemas/EntitySearch' } } } },
    ...Object.fromEntries([[400, 'Invalid query'], [401, 'Session required'], [503, 'Source unavailable']].map(([c, t]) => [c, err(t)])) } } };
const header = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.primusspark.com/portal/execution-entity-search.v1.schema.json' };

const T0 = 1_800_000_000_000, wrap = value => ({ lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', value });
const base = { schema_version: 'portal.execution.entity-search.v1', workspace_id: 'TEST_ONLY:workspace', record_authority: 'PORTAL_PROJECTION', read_at_ms: T0 };
const hit = { ...base, query: { q: 'carry', kinds: KINDS, limit: 3 }, groups: [
  { kind: 'alpha', total_matched: 4, rows: [{ kind: 'alpha', id: 'TEST_ONLY:alpha-a', label: 'Carry A', detail: 'v2 · Canary', route_hint: '/deployments/alphas/TEST_ONLY%3Aalpha-a' }, { kind: 'alpha', id: 'TEST_ONLY:alpha-b', label: 'Carry B', detail: null, route_hint: '/deployments/alphas/TEST_ONLY%3Aalpha-b' }] },
  { kind: 'portfolio', total_matched: 0, rows: [] },
  { kind: 'operation', total_matched: null, rows: [{ kind: 'operation', id: 'TEST_ONLY:op-1', label: 'Carry rebalance', detail: 'Paper', route_hint: '/operations?operation=TEST_ONLY%3Aop-1' }] }] };
const none = { ...base, query: { q: 'zzzz', kinds: ['alpha', 'portfolio'], limit: 8 }, groups: [{ kind: 'alpha', total_matched: 0, rows: [] }, { kind: 'portfolio', total_matched: 0, rows: [] }] };
const negative = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', bases: { hit: 'execution-entity-search.hit.synthetic.valid.json' },
  note: 'WP-K slice 7: a count is a non-negative integer or null (never a string, never -1); a route hint is a path; kinds are closed; an entity is never "denied" (there is no such state); the object is closed.',
  cases: [
    { id: 'WP-K/total-negative', base: 'hit', rule: 'a count is not negative', ops: [{ op: 'set', path: ['groups', 0, 'total_matched'], value: -1 }] },
    { id: 'WP-K/total-string', base: 'hit', rule: 'a count is an integer, never text', ops: [{ op: 'set', path: ['groups', 0, 'total_matched'], value: '4' }] },
    { id: 'WP-K/unknown-kind', base: 'hit', rule: 'kinds are closed', ops: [{ op: 'set', path: ['groups', 0, 'kind'], value: 'user' }] },
    { id: 'WP-K/route-hint-absolute-url', base: 'hit', rule: 'a route hint is an in-app path', ops: [{ op: 'set', path: ['groups', 0, 'rows', 0, 'route_hint'], value: 'https://example.com/x' }] },
    { id: 'WP-K/denied-state', base: 'hit', rule: 'an unauthorized entity is absent, there is no denied row', ops: [{ op: 'set', path: ['groups', 0, 'rows', 0, 'state'], value: 'DENIED' }] },
    { id: 'WP-K/limit-zero', base: 'hit', rule: 'limit is 1 to 50', ops: [{ op: 'set', path: ['query', 'limit'], value: 0 }] },
    { id: 'WP-K/empty-query', base: 'hit', rule: 'a query is not empty', ops: [{ op: 'set', path: ['query', 'q'], value: '' }] }] };
const outputs = {
  'schemas/execution-entity-search.v1.schema.json': { ...header, ...response },
  'openapi/execution-entity-search.openapi.json': { openapi: '3.1.0', info: { title: 'Entity search', version: '1.0.0' }, paths: { '/api/v1/execution/search': operation },
    components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } }, schemas: { EntitySearch: response, EntitySearchProblem: problem } } },
  'fixtures/execution-entity-search.hit.synthetic.valid.json': wrap(hit),
  'fixtures/execution-entity-search.none.synthetic.valid.json': wrap(none),
  'fixtures/execution-entity-search.synthetic.negative.json': negative,
};
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value, null, 2) + '\n', path = resolve(root, file);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== content) throw new Error('Generated entity search contract drift: ' + file); }
  else writeFileSync(path, content);
}
