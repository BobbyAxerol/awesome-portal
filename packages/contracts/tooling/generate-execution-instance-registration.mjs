// Additive registration contract generated from the runtime source schema.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    name => name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name), module, module.exports);
  return module.exports;
}
const contract = load(resolve(root, '../../apps/control-api/src/execution-v2/instance-registration.contract.ts'));
const command = load(resolve(root, '../../apps/control-api/src/execution-v2/command.contract.ts'));
// JSON Schema has no numeric maximum for decimal STRING counters. Publish the
// exact lexical int64 bound too, not merely the Zod runtime BigInt refinement.
const maximumCounter = '9223372036854775807';
const int64Terms = ['0', '[1-9][0-9]{0,17}', maximumCounter];
for (let i = 0; i < maximumCounter.length; i++) {
  const lower = i === 0 ? 1 : 0, upper = Number(maximumCounter[i]) - 1;
  if (upper < lower) continue;
  const digit = lower === upper ? String(lower) : `[${lower}-${upper}]`;
  const remaining = maximumCounter.length - i - 1;
  int64Terms.push(maximumCounter.slice(0, i) + digit + (remaining ? `[0-9]{${remaining}}` : ''));
}
const exactInt64Pattern = '^(?:' + int64Terms.join('|') + ')(?![\\s\\S])';
function json(schema) {
  if (schema === contract.registrationCounter)
    return { type: 'string', minLength: 1, maxLength: 19, pattern: exactInt64Pattern };
  if (schema === contract.registrationText)
    return { type: 'string', minLength: 1, maxLength: 256,
      pattern: '^[^\\u0000-\\u001f\\u007f]+(?![\\s\\S])' };
  const d = schema._def, type = d.typeName;
  if (type === 'ZodEffects') return json(d.schema);
  if (type === 'ZodOptional') return json(d.innerType);
  if (type === 'ZodNullable') return { anyOf: [json(d.innerType), { type: 'null' }] };
  if (type === 'ZodNull') return { type: 'null' };
  if (type === 'ZodLiteral') return { const: d.value };
  if (type === 'ZodBoolean') return { type: 'boolean' };
  if (type === 'ZodEnum') return { type: 'string', enum: d.values };
  if (type === 'ZodString') {
    const value = { type: 'string' };
    for (const check of d.checks) {
      if (check.kind === 'min') value.minLength = check.value;
      else if (check.kind === 'max') value.maxLength = check.value;
      else if (check.kind === 'regex') value.pattern = check.regex.source;
      else if (check.kind === 'length') value.minLength = value.maxLength = check.value;
      else throw Error('Unsupported registration string check ' + check.kind);
    }
    return value;
  }
  if (type === 'ZodNumber') {
    const value = { type: d.checks.some(c => c.kind === 'int') ? 'integer' : 'number' };
    for (const check of d.checks) {
      if (check.kind === 'min') value.minimum = check.value;
      else if (check.kind === 'max') value.maximum = check.value;
      else if (check.kind !== 'int') throw Error('Unsupported registration number check ' + check.kind);
    }
    return value;
  }
  if (type === 'ZodObject') {
    const shape = d.shape();
    return { type: 'object', additionalProperties: d.unknownKeys !== 'strict',
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, json(value)])),
      required: Object.entries(shape).filter(([, value]) => !value.isOptional()).map(([key]) => key) };
  }
  throw Error('Unsupported registration Zod ' + type);
}
const schemas = Object.fromEntries([
  ['InstanceRegistrationIntent', 'instanceRegistrationIntent'],
  ['InstanceRegistrationSubmit', 'instanceRegistrationSubmit'],
  ['InstanceRegistrationQuery', 'instanceRegistrationQuery'],
  ['InstanceRegistrationPreview', 'instanceRegistrationPreview'],
  ['InstanceRegistrationStatus', 'instanceRegistrationStatus'],
].map(([name, key]) => [name, json(contract[key])]));
schemas.InstanceRegistrationSubmit.properties.intent = { $ref: '#/components/schemas/InstanceRegistrationIntent' };
schemas.InstanceRegistrationIntent.description = 'Exact PM management REGISTER_INSTANCE wire inside a Portal Portfolio/environment intent. expected_policy_revision outside business_payload is the opaque Portal policy revision; the PM body counter is an independent source CAS. Browser cannot supply target_ref, actor, workload, source URL or trusted authority. Runtime additionally enforces UTF-8/text bounds and initial source version 0.';
schemas.InstanceRegistrationPreview.description = 'PREVIEW uses the owning registration rules in a rollback-only source transaction. It never reserves resources or publishes a newly allocated instance ID. allowed=false requires a typed reason and null preview/profile/expiry fields. Runtime enforces this cross-field invariant.';
schemas.InstanceRegistrationStatus.description = 'Registry-family correlation only, not a financial ledger or activation receipt. APPLIED requires a verified PM_REGISTRY_RECEIPT plus opaque source_instance_ref and transport ACK. UNKNOWN requires null business_applied, receipt and source_instance_ref. Source instance reference is not a canonical account/deployment pair; neither identity is inferred. Runtime enforces cross-field chronology and business invariants. TEST_ONLY never becomes production authority.';
schemas.InstanceRegistrationPreview.allOf = [{
  if: { properties: { allowed: { const: true } } },
  then: { properties: { reason_code: { type: 'null' },
    preview_digest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}(?![\\s\\S])' },
    expires_at_ms: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    profile_ref: json(contract.registrationText) } },
  else: { properties: { reason_code: json(contract.instanceRegistrationReason),
    preview_digest: { type: 'null' }, expires_at_ms: { type: 'null' }, profile_ref: { type: 'null' } } },
}];
const business = schemas.InstanceRegistrationStatus.properties.business.properties;
schemas.InstanceRegistrationStatus.allOf = [{
  if: { properties: { business: { properties: { state: { const: 'APPLIED' } } } } },
  then: { properties: { delivery: { const: 'ACKNOWLEDGED' }, business: { properties: {
    business_applied: { const: true }, receipt: business.receipt.anyOf[0],
    source_instance_ref: json(contract.registrationText),
  } } } },
  else: { properties: { business: { properties: { business_applied: { type: 'null' },
    receipt: { type: 'null' }, source_instance_ref: { type: 'null' } } } } },
}];
schemas.InstanceRegistrationProblem = { type: 'object', additionalProperties: false,
  required: ['error', 'request_id'], properties: {
    error: { type: 'object', additionalProperties: false, required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } } },
    request_id: { type: 'string' }, public_copy_key: { type: 'string' },
    safe_next_action: { type: 'string', enum: ['QUERY_SAME_INTENT', 'REVIEW_BLOCKER'] },
  } };
const paths = {}, base = '/api/v1/execution/instance-registrations';
for (const [suffix, method, operation, input, output] of [
  ['/preview', 'post', 'Preview', 'InstanceRegistrationIntent', 'InstanceRegistrationPreview'],
  ['', 'post', 'Submit', 'InstanceRegistrationSubmit', 'InstanceRegistrationStatus'],
  ['/{id}', 'get', 'Status', null, 'InstanceRegistrationStatus'],
  ['/{id}/reconcile', 'post', 'Reconcile', 'InstanceRegistrationQuery', 'InstanceRegistrationStatus'],
]) {
  const parameters = suffix.includes('{id}')
    ? [{ name: 'id', in: 'path', required: true, schema: json(contract.instanceRegistrationId) }] : [];
  if (method === 'get') parameters.push({ name: 'workspace_id', in: 'query', required: true,
    schema: schemas.InstanceRegistrationQuery.properties.workspace_id });
  else parameters.push({ name: 'x-portal-idempotency-key', in: 'header', required: true, schema: json(command.commandKey) });
  paths[base + suffix] = { [method]: {
    operationId: 'executionInstanceRegistration' + operation + 'V1', security: [{ PortalSession: [] }], parameters,
    description: operation === 'Status'
      ? 'Local-only exact instance-registration status. Current independent audit.read and accepted TS membership before and after composition; original send proof expiry is not read authority. No source lookup, dispatch or write. Unknown/hidden/wrong workspace normalize404.'
      : operation === 'Reconcile'
      ? 'Query the same durable registration intent using the original source registration target/key and verified lookup; never resend. Requires independent current audit.read, Origin/CSRF and same-request idempotency header. Accepted-obligation service recovery does not impersonate an expired human session. Unknown remains unknown without a verified receipt.'
      : 'Source-dark by default. Current exact deployment.register plus accepted source DEPLOY mapping, Portfolio/environment/alpha scope, CSRF/Origin, and fresh step-up on submit. Durable attempt commits before any source APPLY I/O. Retained preview rejects mutation. No funding/binding/activation/native effects are admitted. Repeated submit never sends a known intent again; use its original key.',
    ...(input ? { requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/' + input } } } } } : {}),
    responses: Object.fromEntries([200, 400, 401, 403, 404, 409, 503].map(status => [status, {
      description: status === 200 ? 'Typed registration preview or durable registry status; not source commissioning.'
        : status === 404 ? 'REGISTRATION_NOT_FOUND; hidden and unknown are identical.'
        : 'Closed input, current authority, context, same-key correlation or finite-capacity refusal. Fixed public copy, never source diagnostics.',
      headers: { 'Cache-Control': { schema: { type: 'string', const: 'private, no-store' } } },
      content: { 'application/json': { schema: { $ref: '#/components/schemas/' + (status === 200 ? output : 'InstanceRegistrationProblem') } } },
    } ])),
  } };
}
const now = 1792300000000;
const intent = contract.instanceRegistrationIntent.parse({
  schema_version: 'portal.execution.instance-registration-intent.v1', workspace_id: 'TEST_ONLY:workspace',
  resource: { kind: 'PORTFOLIO', id: 'TEST_ONLY:portfolio' }, environment: 'paper',
  expected_policy_revision: 'TEST_ONLY:portal-policy', business_payload: {
    schema_version: 'pma.management-command.v1', operation: 'REGISTER_INSTANCE', idempotency_key: 'TEST_ONLY:registration-0001',
    reason: 'TEST_ONLY registry fixture, not a business receipt', expected_version: '0',
    expected_policy_revision: '9007199254740993',
    parameters: { alpha_slug: 'TEST_ONLY:alpha-version', venue: 'TEST_ONLY:venue', account_type: 'MARGIN', currency: 'USDT' },
  },
});
const unknown = contract.instanceRegistrationStatus.parse({
  schema_version: 'portal.execution.instance-registration-status.v1', family: 'INSTANCE_REGISTRATION',
  command_id: 'ecm_00000000000000000000000000000021', operation: 'REGISTER_INSTANCE', resource: intent.resource,
  environment: intent.environment, profile_ref: 'TEST_ONLY:paper', delivery: 'DELIVERY_UNKNOWN',
  business: { state: 'UNKNOWN', business_applied: null, receipt: null, source_instance_ref: null },
  canonical_identity: { availability: 'NOT_PUBLISHED', reason_code: 'SOURCE_CANONICAL_ACCOUNT_DEPLOYMENT_PAIR_NOT_PUBLISHED',
    account_id: null, deployment_id: null },
  projection: 'UNKNOWN', venue: 'NOT_APPLICABLE', next_action: 'QUERY_SAME_INTENT', authority: 'TEST_ONLY',
  created_at_ms: now, updated_at_ms: now,
});
const fixture = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', runtime_qualified: false, intent,
  preview_blocked: contract.instanceRegistrationPreview.parse({
    schema_version: 'portal.execution.instance-registration-preview.v1', operation: 'REGISTER_INSTANCE', allowed: false,
    reason_code: 'REGISTRATION_NOT_QUALIFIED', preview_digest: null, expires_at_ms: null, profile_ref: null,
    business_applied: false, reserved: false,
  }), unknown, registry_applied: contract.instanceRegistrationStatus.parse({ ...unknown,
    delivery: 'ACKNOWLEDGED', business: { state: 'APPLIED', business_applied: true,
      receipt: { kind: 'PM_REGISTRY_RECEIPT', key: 'TEST_ONLY:source-namespaced-key', version: '1' },
      source_instance_ref: 'TEST_ONLY:opaque-instance-token' }, next_action: 'REVIEW_RECEIPT',
  }) };
const outputs = {
  'openapi/execution-instance-registration.openapi.json': { openapi: '3.1.0',
    info: { title: 'Exact instance registration preview, durable submit and same-key status', version: '1.0.0' },
    paths, components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: 'portal_session' } }, schemas } },
  'fixtures/execution-instance-registration.synthetic.valid.json': fixture,
};
for (const [name, value] of Object.entries(outputs)) {
  const bytes = JSON.stringify(value, null, 2) + '\n', path = resolve(root, name);
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== bytes) throw Error('Registration contract drift ' + name);
  } else writeFileSync(path, bytes);
}
