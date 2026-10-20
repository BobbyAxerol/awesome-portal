// BE-P14 / RV-12: publishes the canonical scoped Manager scenarios. Positive responses are the REAL ScopedManagerReader's answers (captured by
// apps/control-api/test/elp2-manager-scoped-fixtures.spec.ts); this module proves each one again before it writes anything: the producer's own Zod
// validator, the published JSON Schema, and the real signed cursor codec for every token. Every schema-level negative is generated here by mutation and
// must be refused by the real validator or the generation fails. Runtime refusals are the reader's status + code, re-proved by the same spec.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
import { SCENARIOS, REFUSALS } from './execution-manager-scoped-scenarios.mjs';

const LANE = 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT';
/** Non-secret TEST_ONLY signing key, also set by the control-api harness for the capture. */
export const CURSOR_KEY = { id: 'testonly-k1', secret: 'TEST_ONLY-cursor-key-0123456789abcdef-0123456789' };
const MAX_RESPONSE_BYTES = 1048576, ENVELOPE_RESERVE = 16384;

function loader(root) {
  const require = createRequire(import.meta.url), cache = new Map();
  const source = resolve(root, '../../apps/control-api/src');
  const load = path => {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = name => name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name);
    new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
    return module.exports;
  };
  return { response: load(resolve(source, 'manager-lists/scoped-manager.contract.ts')).scopedManagerResponseSchema, cursor: load(resolve(source, 'query/cursor.ts')) };
}

const clone = value => structuredClone(value);
function mutate(base, ops) {
  const value = clone(base);
  for (const { op, path, value: next } of ops) {
    const parent = path.slice(0, -1).reduce((node, key) => node[key], value), last = path.at(-1);
    if (op === 'set') parent[last] = next; else delete parent[last];
  }
  return value;
}
const issue = result => { const first = result.error.issues[0]; return { code: first.message === 'MANAGER_PAGE_INCONSISTENT' ? first.message : first.code, path: first.path }; };

/** Schema-level negatives over the researcher page. Each states the rule it protects. */
const MUTATIONS = [
  ['version-mismatch', 'a different schema version is a different contract', [{ op: 'set', path: ['schema_version'], value: 'portal.execution.manager-scoped.v2' }]],
  ['sensitive-field-on-facts', 'no physical account balance, custody or private field can ride on a fact set', [{ op: 'set', path: ['items', 0, 'identity', 'physical_balance'], value: '1' }]],
  ['sensitive-field-on-envelope', 'no global count or total can ride on the envelope', [{ op: 'set', path: ['global_count'], value: 9 }]],
  ['sensitive-field-on-page', 'no source cursor can ride on the page', [{ op: 'set', path: ['page', 'source_cursor'], value: 'raw-source-offset' }]],
  ['revision-metadata', 'the scoped read publishes no source revision or sequence', [{ op: 'set', path: ['source_revision'], value: 'sha256:aaaa' }]],
  ['claims-all-coverage', 'coverage is authorized rows only', [{ op: 'set', path: ['read_scope', 'coverage'], value: 'ALL' }]],
  ['claims-global-totals', 'totals are visible rows only, never global', [{ op: 'set', path: ['read_scope', 'totals_scope'], value: 'GLOBAL' }]],
  ['claims-complete', 'a retained current page is never total history', [{ op: 'set', path: ['completeness'], value: 'COMPLETE' }]],
  ['disconnected-is-not-a-state', 'the contract has no DISCONNECTED disposition: a profile is PARTIAL, DENIED or UNAVAILABLE', [{ op: 'set', path: ['profile_dispositions', 0, 'state'], value: 'DISCONNECTED' }]],
  ['no-dispositions', 'at least one environment disposition is stated', [{ op: 'set', path: ['profile_dispositions'], value: [] }]],
  ['item-environment-all', 'an item belongs to one environment', [{ op: 'set', path: ['items', 0, 'environment'], value: 'all' }]],
  ['money-as-number', 'money is an exact decimal string', [{ op: 'set', path: ['items', 0, 'financial_facts', 0, 'facts', 'allocation'], value: 100 }]],
  ['money-exponent', 'no exponent notation', [{ op: 'set', path: ['items', 0, 'financial_facts', 0, 'facts', 'allocation'], value: '1e3' }]],
  ['has-more-without-cursor', 'has_more and next_cursor agree', [{ op: 'set', path: ['page', 'has_more'], value: true }]],
  ['returned-count-above-items', 'returned_count is the number of items', [{ op: 'set', path: ['page', 'returned_count'], value: 3 }]],
  ['limit-above-bound', 'a page holds at most 100 items', [{ op: 'set', path: ['page', 'limit'], value: 101 }]],
  ['unknown-fact-kind', 'financial fact kinds are closed', [{ op: 'set', path: ['items', 0, 'financial_facts', 0, 'kind'], value: 'FEE' }]],
  ['unknown-availability-reason', 'availability reasons are closed', [{ op: 'set', path: ['items', 0, 'financial_availability', 'reason_code'], value: 'PROBABLY_FINE' }]],
  ['control-character-in-name', 'display text has no control characters', [{ op: 'set', path: ['items', 0, 'identity', 'name'], value: 'bad\nname' }]],
  ['cursor-with-space', 'a cursor is an opaque token of a closed alphabet', [{ op: 'set', path: ['page', 'has_more'], value: true }, { op: 'set', path: ['page', 'next_cursor'], value: 'a b' }]],
];

export function buildScopedScenarioFixtures({ root, schema }) {
  const { response: zod, cursor } = loader(root);
  const captured = JSON.parse(readFileSync(resolve(root, 'tooling/execution-manager-scoped-capture.json'), 'utf8'));
  const ajv = new Ajv2020({ strict: false, allErrors: true }); ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/ManagerScopedResponse`);
  const prove = (id, response) => {
    const parsed = zod.safeParse(response);
    if (!parsed.success) throw new Error(`${id}: the producer's validator refuses it: ${JSON.stringify(parsed.error.issues[0])}`);
    if (!validate(response)) throw new Error(`${id}: the published JSON Schema refuses it: ${ajv.errorsText(validate.errors)}`);
    if (Buffer.byteLength(JSON.stringify(response)) > MAX_RESPONSE_BYTES - ENVELOPE_RESERVE) throw new Error(`${id}: over the response byte budget`);
  };
  const codecFor = issuedAt => new cursor.KeysetCursorCodec({ activeKeyId: CURSOR_KEY.id, keys: { [CURSOR_KEY.id]: CURSOR_KEY.secret }, ttlSeconds: 900, now: () => issuedAt });
  const payloadOf = token => JSON.parse(Buffer.from(token.split('.')[2], 'base64url').toString('utf8'));
  const proveCursor = (id, response, direction, token) => {
    const payload = payloadOf(token), decoded = codecFor(payload.issued_at).decode(token, { resourceId: payload.resource_id, workspaceId: response.workspace_id,
      direction, queryFingerprint: payload.query_fingerprint, boundarySize: 1 });
    const edge = direction === 'after' ? response.items.at(-1) : response.items[0];
    const key = JSON.stringify([edge.environment, edge.identity.alpha_id ?? null, edge.identity.alpha_version_id ?? null, edge.identity.portfolio_id ?? null, edge.identity.binding_id ?? null]);
    if (decoded[0] !== key) throw new Error(`${id}: the ${direction} cursor does not bind the page edge`);
    return payload;
  };

  const files = { scenarios: [], bounded: [] };
  for (const definition of SCENARIOS) {
    const recorded = captured.scenarios.find(item => item.id === definition.id);
    if (!recorded) throw new Error(`${definition.id}: not captured; run the control-api capture`);
    const fingerprints = new Set();
    const pages = recorded.pages.map((page, index) => {
      prove(`${definition.id}#${index + 1}`, page.response);
      for (const [name, direction] of [['next_cursor', 'after'], ['previous_cursor', 'before']]) {
        if (page.response.page[name] !== null) fingerprints.add(proveCursor(`${definition.id}#${index + 1}.${name}`, page.response, direction, page.response.page[name]).query_fingerprint);
      }
      return { request: { query: page.query }, response: page.response };
    });
    if (fingerprints.size > 1) throw new Error(`${definition.id}: cursors of one chain must bind one query fingerprint`);
    files[definition.file].push({ id: definition.id, level: definition.level, covers: definition.covers,
      request: { surface: definition.surface, read_for: definition.principal === 'OWNER' ? 'ALL_BUSINESS_READER' : 'RESEARCHER_AUTHORIZED_SUBSET',
        ...(definition.bindingId ? { binding_id: definition.bindingId } : {}) }, world: definition.world,
      ...(definition.options ? { source_conditions: definition.options } : {}), pages });
  }

  // Chain integrity: the page-1 token is the token a client holds; reuse of it is what the refusals prove against.
  const chain = files.scenarios.find(item => item.id === 'fleet-owner-paper-chain');
  const seen = chain.pages.map(page => page.response.items[0].identity.alpha_id);
  if (new Set(seen).size !== 3) throw new Error('chain pages are not disjoint');
  const token = chain.pages[0].response.page.next_cursor, issuedAt = payloadOf(token).issued_at, base = chain.pages[0].response;
  const codecProof = {
    'cursor/tampered': () => codecFor(issuedAt).decode(token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA'), { resourceId: payloadOf(token).resource_id, workspaceId: base.workspace_id, direction: 'after', queryFingerprint: payloadOf(token).query_fingerprint, boundarySize: 1 }),
    'cursor/expired': () => codecFor(issuedAt + 901).decode(token, { resourceId: payloadOf(token).resource_id, workspaceId: base.workspace_id, direction: 'after', queryFingerprint: payloadOf(token).query_fingerprint, boundarySize: 1 }),
    'cursor/wrong-direction': () => codecFor(issuedAt).decode(token, { resourceId: payloadOf(token).resource_id, workspaceId: base.workspace_id, direction: 'before', queryFingerprint: payloadOf(token).query_fingerprint, boundarySize: 1 }),
    'cursor/other-workspace': () => codecFor(issuedAt).decode(token, { resourceId: payloadOf(token).resource_id, workspaceId: 'workspace_TEST_ONLY_OTHER', direction: 'after', queryFingerprint: payloadOf(token).query_fingerprint, boundarySize: 1 }),
    'cursor/changed-query': () => codecFor(issuedAt).decode(token, { resourceId: payloadOf(token).resource_id, workspaceId: base.workspace_id, direction: 'after', queryFingerprint: 'sha256:' + '0'.repeat(64), boundarySize: 1 }),
  };
  const requests = REFUSALS.map(definition => {
    const recorded = captured.refusals.find(item => item.id === definition.id);
    if (!recorded?.error || recorded.error.status !== definition.status || recorded.error.code !== definition.code)
      throw new Error(`${definition.id}: the captured reader answer is not ${definition.status} ${definition.code}`);
    const proof = codecProof[definition.id];
    if (proof) {
      let thrown = null; try { proof(); } catch (error) { thrown = error; }
      if (!thrown || thrown.code !== definition.code || thrown.status !== definition.status) throw new Error(`${definition.id}: the real cursor codec does not refuse with ${definition.code}`);
    }
    return { id: definition.id, level: definition.level, rule: definition.rule, request: { surface: definition.surface, read_for: definition.principal === 'OWNER' ? 'ALL_BUSINESS_READER' : 'RESEARCHER_AUTHORIZED_SUBSET',
      query: definition.variant?.query ?? definition.query, ...(definition.variant ? { cursor_from: 'fleet-owner-paper-chain page 1 next_cursor', setup: { ...definition.variant, query: undefined } } : {}),
      ...(definition.options ? { source_conditions: definition.options } : {}), ...(definition.bindingId ? { binding_id: definition.bindingId } : {}) },
      status: definition.status, code: definition.code,
      proven_by: proof ? ['apps/control-api/test/elp2-manager-scoped-fixtures.spec.ts (real ScopedManagerReader)', 'generate-execution-manager-scoped.mjs (real KeysetCursorCodec)'] : ['apps/control-api/test/elp2-manager-scoped-fixtures.spec.ts (real ScopedManagerReader)'] };
  });

  const researcher = files.scenarios.find(item => item.id === 'fleet-researcher-paper').pages[0].response;
  const mutations = MUTATIONS.map(([id, rule, ops]) => {
    const value = mutate(researcher, ops), zodResult = zod.safeParse(value), schemaOk = validate(value);
    if (zodResult.success) throw new Error(`${id}: the producer's validator accepts a case that must be refused`);
    return { id, rule, refused_by: schemaOk ? 'PRODUCER_ONLY' : 'SCHEMA_AND_PRODUCER', code: issue(zodResult).code, issue_path: issue(zodResult).path.map(String), ops };
  });

  const header = { lane: LANE, schema: 'execution-manager-scoped.v1.schema.json#/$defs/ManagerScopedResponse', source_authority: 'ScopedManagerReader answers over TEST_ONLY worlds; no real source, account or credential',
    read_at_ms: 1790812800000 };
  return {
    'fixtures/execution-manager-scoped.scenarios.synthetic.valid.json': { ...header,
      note: 'RV-12 canonical scoped scenarios. One scenario per dimension plus the combined worst case, not a Cartesian product. Every page is the answer of the real reader; visible_count counts authorized rows only; totals are per currency over visible rows only and are never summed across items.',
      cursor: { key_id: CURSOR_KEY.id, note: 'Non-secret TEST_ONLY key. A cursor is opaque to the browser; it binds resource, workspace, direction, boundary item and the query fingerprint.' },
      dispositions_covered: { PARTIAL: ['AUTHORIZED_RETAINED_FACTS'], DENIED: ['EXECUTION_READ_NOT_AVAILABLE', 'EXECUTION_READ_POLICY_PENDING'],
        UNAVAILABLE: ['EXECUTION_READ_AUTHORITY_UNAVAILABLE', 'SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED'] },
      not_expressible: ['DISCONNECTED and REVOKED are not dispositions: nothing connected to read is UNAVAILABLE / SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED, a revoked or never granted environment is DENIED / EXECUTION_READ_NOT_AVAILABLE',
        'a revoke between the read and the delivery fence refuses the whole response (409 EXECUTION_READ_ACCESS_CHANGED), see the refusals fixture'],
      scenarios: files.scenarios },
    'fixtures/execution-manager-scoped.bounded.synthetic.valid.json': { ...header,
      note: 'RV-12 large but bounded: the maximum page (100 items) of a 101 item population with has_more true, and one item at the 200 currency-total bound. Not a sample of a population: visible_count states the 101.',
      scenarios: files.bounded },
    'fixtures/execution-manager-scoped.refusals.synthetic.negative.json': { lane: LANE, base: 'execution-manager-scoped.scenarios.synthetic.valid.json#fleet-researcher-paper page 1',
      note: 'RV-12 refusals. `mutations` are refused by the published JSON Schema and/or the producer validator (generator-proved). `requests` are refused by the real reader with the stated HTTP status and code (spec-proved, cursor cases also codec-proved).',
      mutations, requests },
  };
}
