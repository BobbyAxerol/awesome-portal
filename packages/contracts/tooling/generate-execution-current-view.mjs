/** Internal Edge -> Core current-view contract. Data examples are TEST_ONLY;
 * this generator issues no authority, credential, signature or runtime config. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const write = (path, value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (check) {
    if (readFileSync(resolve(root, path), 'utf8') !== bytes) throw new Error(`Current-view contract drift: ${path}`);
  } else writeFileSync(resolve(root, path), bytes);
};
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const nullable = value => ({ anyOf: [value, { type: 'null' }] });
const ref = name => ({ $ref: `#/$defs/${name}` });
const text = { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])' };
const digest = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$(?![\\s\\S])' };
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const resourceKinds = ['ROOT', 'PORTFOLIO', 'ALPHA', 'ALPHA_VERSION', 'DEPLOYMENT', 'ACCOUNT', 'BINDING', 'USER'];
const operations = ['CURRENT', 'HISTORY', 'EXPORT', 'STREAM', 'REPLAY'];
const errorCodes = ['CURRENT_VIEW_CONTEXT_REQUIRED', 'CURRENT_VIEW_CONTEXT_EXPIRED', 'CURRENT_VIEW_BINDING_MISMATCH',
  'CURRENT_VIEW_AUTHORITY_CHANGED', 'CURRENT_VIEW_IDENTITY_REQUIRED', 'CURRENT_VIEW_AUTHORITY_UNAVAILABLE',
  'CURRENT_VIEW_OPERATION_NOT_COMMISSIONED', 'CURRENT_VIEW_CAPACITY', 'CURRENT_VIEW_WORKLOAD_NOT_AUTHENTICATED',
  'CURRENT_VIEW_ROUTE_NOT_FOUND', 'CURRENT_VIEW_TRANSPORT_BUSY', 'CURRENT_VIEW_REQUEST_INVALID',
  'CURRENT_VIEW_REQUEST_BYTE_LIMIT', 'CURRENT_VIEW_TRANSPORT_DEADLINE', 'CURRENT_VIEW_RESPONSE_INVALID'];
const baseRequest = { original_context: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$(?![\\s\\S])' },
  workload_id: text, operation: ref('CurrentViewOperation'), resource_ref: text };
const defs = {
  CurrentViewOperation: { type: 'string', enum: operations },
  CurrentViewResource: obj({ kind: { type: 'string', enum: resourceKinds }, id: text }),
  CurrentViewDatasetBinding: {
    ...obj({ dataset_id: text, source_revision: text, projection_generation: text,
      catalogue_revision: nullable(text), window: nullable(obj({ from_ms: integer, to_ms: integer })) },
    ['dataset_id', 'source_revision', 'window']),
    description: 'Server-selected exact dataset binding; a non-null window additionally requires from_ms < to_ms at the runtime boundary. No browser-selected source or operation-purpose fallback.',
  },
  CurrentViewTuple: obj(Object.fromEntries(['alpha_id', 'alpha_version_id', 'portfolio_id', 'deployment_id', 'account_id'].map(key => [key, text]))),
  CurrentViewResolve: obj({ schema_version: { const: 'portal.execution.current-view-resolve.v1' }, ...baseRequest }),
  CurrentViewRecheck: obj({ schema_version: { const: 'portal.execution.current-view-recheck.v1' }, ...baseRequest, decision_digest: digest }),
  CurrentViewDecision: {
    ...obj({ schema_version: { const: 'portal.execution.current-view-decision.v1' },
      context_digest: digest, decision_digest: digest, workload_digest: digest, principal_digest: digest, session_digest: digest,
      operation: ref('CurrentViewOperation'), workspace_id: text, environment: { type: 'string', enum: ['paper', 'sandbox', 'live'] },
      profile_id: text, resource_ref: text, resource: ref('CurrentViewResource'), policy_revision: text, field_policy_ref: nullable(text),
      dataset_binding: ref('CurrentViewDatasetBinding'), whole_population: { type: 'boolean' },
      allowed_tuples: { type: 'array', maxItems: 2000, items: ref('CurrentViewTuple') },
      resources: { type: 'array', maxItems: 2000, items: ref('CurrentViewResource') },
      fields: { type: 'array', maxItems: 64, items: text }, detail_fields: { type: 'array', maxItems: 2000, items: text }, expires_at_ms: integer }),
    description: 'Original-flight current authority observation, not a transferable grant, financial attestation, source lease or source-terminal ACK. CURRENT/READ never grants STREAM. Recheck exact original context and decision on each bounded operation; context expiry/restart does not permit reconstruction from actor JSON. All digests are prefixed sha256 values. Population is exact correlated tuples or explicit whole_population, never independent ID-set joins.',
  },
  CurrentViewError: obj({ schema_version: { const: 'portal.execution.current-view-error.v1' }, code: { type: 'string', enum: errorCodes } }),
};
write('schemas/execution-current-view.v1.schema.json', {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.primusspark.com/portal/execution-current-view.v1.schema.json',
  title: 'Private current authorized Execution view v1',
  description: 'Uninstalled private Edge-to-Core mTLS contract. These schemas describe syntax; actual original-session/current-app/native-policy authority remains in Core. No registration/token-issue endpoint is exposed.',
  oneOf: ['CurrentViewResolve', 'CurrentViewRecheck', 'CurrentViewDecision', 'CurrentViewError'].map(ref), $defs: defs,
});
const openSchemas = JSON.parse(JSON.stringify(defs).replaceAll('#/$defs/', '#/components/schemas/'));
const response = component => ({ description: component === 'CurrentViewDecision' ? 'Current exact original-flight decision' : 'Typed refusal; no original context or private provider error is disclosed',
  headers: { 'Cache-Control': { schema: { const: 'no-store' } } }, content: { 'application/json': { schema: { $ref: `#/components/schemas/${component}` } } } });
const operation = (name, input) => ({ operationId: name,
  description: 'Exact configured TLS 1.3 Edge machine certificate/SAN/workload match is mandatory. The opaque original_context was registered only by an authenticated Core server composition; user/workspace/role bodies cannot mint it. Strict UTF-8 and duplicate JSON key rejection precede schema parsing. No query string, forwarded credentials or HTTP fallback.',
  security: [{ edgeMachineMtls: [] }],
  requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${input}` } } } },
  responses: { 200: response('CurrentViewDecision'), ...Object.fromEntries([400, 401, 403, 404, 409, 413, 503, 504].map(status => [status, response('CurrentViewError')])) },
});
write('openapi/execution-current-view.openapi.json', {
  openapi: '3.1.0', info: { title: 'Private Execution current-view authority', version: '1.0.0',
    description: 'SOURCE_ONLY; explicit owner installation and pin acceptance required. This document grants no human, workload, STREAM, financial, command or Live capability.' },
  'x-transport-hard-ceilings': { request_bytes: 8192, response_bytes: 65536, maximum_in_flight: 16, deadline_ms: 5000,
    semantics: 'Owner supplies explicit values within these ceilings. Response bytes are checked on complete UTF-8 JSON before write; array item limits are not byte allowances. Oversized exact populations refuse, never truncate.' },
  paths: { '/internal/elp210/current-view/resolve': { post: operation('executionCurrentViewResolveV1', 'CurrentViewResolve') },
    '/internal/elp210/current-view/recheck': { post: operation('executionCurrentViewRecheckV1', 'CurrentViewRecheck') } },
  components: { securitySchemes: { edgeMachineMtls: { type: 'mutualTLS', description: 'Exact owner-configured Edge certificate SHA256, SAN, CA and workload; never forwarded browser identity.' } }, schemas: openSchemas },
});

/** Byte vectors use recursively sorted object keys, JSON strings without
 * ASCII escaping, exact array order, UTF-8 and SHA256 with a sha256: prefix.
 * These are digests only, not signatures or attestations. */
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
const sha = value => `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
const resource = { kind: 'PORTFOLIO', id: 'TEST_ONLY-portfolio-λ' };
const tuple = { alpha_id: 'TEST_ONLY-alpha', alpha_version_id: 'TEST_ONLY-av', portfolio_id: resource.id,
  deployment_id: 'TEST_ONLY-deployment', account_id: 'TEST_ONLY-account' };
const base = { original_context: 'A'.repeat(43), workload_id: 'TEST_ONLY-edge-worker', resource_ref: 'TEST_ONLY-paper-financial' };
const vectors = [];
for (const operation of operations) {
  const resolveValue = { schema_version: 'portal.execution.current-view-resolve.v1', ...base, operation };
  const decisionBase = { schema_version: 'portal.execution.current-view-decision.v1', context_digest: sha({ TEST_ONLY: 'context' }),
    workload_digest: sha({ TEST_ONLY: 'workload' }), principal_digest: sha({ TEST_ONLY: 'principal' }), session_digest: sha({ TEST_ONLY: 'session' }),
    operation, workspace_id: 'TEST_ONLY-workspace', environment: 'paper', profile_id: 'TEST_ONLY-paper-profile', resource_ref: base.resource_ref,
    resource, policy_revision: 'TEST_ONLY-policy-revision', field_policy_ref: null,
    dataset_binding: { dataset_id: 'TEST_ONLY-account-series', source_revision: 'TEST_ONLY-source-revision', projection_generation: 'TEST_ONLY-generation',
      catalogue_revision: 'TEST_ONLY-catalogue', window: { from_ms: 1_700_000_000_000, to_ms: 1_700_000_060_000 } },
    whole_population: false, allowed_tuples: [tuple], resources: [resource], fields: ['equity'], detail_fields: [], expires_at_ms: 1_700_000_030_000 };
  // The example's decision digest is explicitly synthetic, not an output of
  // CurrentViewAuthority's private scope-fingerprint derivation.
  const decision = { ...decisionBase, decision_digest: sha({ TEST_ONLY: 'synthetic-decision-not-authority', decisionBase }) };
  const recheckValue = { schema_version: 'portal.execution.current-view-recheck.v1', ...base, operation, decision_digest: decision.decision_digest };
  for (const [kind, value] of [['CurrentViewResolve', resolveValue], ['CurrentViewRecheck', recheckValue], ['CurrentViewDecision', decision]])
    vectors.push({ id: `${operation}-${kind}`, component: kind, value });
}
vectors.push({ id: 'CURRENT-whole-population', component: 'CurrentViewDecision', value: {
  ...vectors.find(vector => vector.id === 'CURRENT-CurrentViewDecision').value, whole_population: true, allowed_tuples: [], resources: [] } });
for (const code of errorCodes) vectors.push({ id: code, component: 'CurrentViewError', value: { schema_version: 'portal.execution.current-view-error.v1', code } });
write('fixtures/execution-current-view.test-only.v1.json', {
  schema_version: 'portal.execution.current-view-test-vectors.v1', provenance: 'TEST_ONLY',
  authority: 'NONE', runtime_enabled: false,
  canonicalization: 'Recursively sort object keys; retain array order; JSON UTF-8 without ASCII escaping; no whitespace; sha256-prefixed lowercase digest. No signatures.',
  vectors: vectors.map(vector => ({ ...vector, canonical_utf8: canonical(vector.value), sha256: sha(vector.value) })),
});
