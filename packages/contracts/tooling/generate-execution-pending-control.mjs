// Additive public contract from the runtime schema; synthetic examples are not source authority.
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
  new Function('require', 'module', 'exports', code)(name =>
    name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name), module, module.exports);
  return module.exports;
}
const contract = load(resolve(root, '../../apps/control-api/src/execution-v2/pending-control.contract.ts'));
const command = load(resolve(root, '../../apps/control-api/src/execution-v2/command.contract.ts'));
const { SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER } = load(resolve(root, '../../apps/control-api/src/auth/cookies.ts'));
const maximumCounter = '9223372036854775807';
const terms = ['0', '[1-9][0-9]{0,17}', maximumCounter];
for (let i = 0; i < maximumCounter.length; i++) {
  const low = i === 0 ? 1 : 0, high = Number(maximumCounter[i]) - 1;
  if (high < low) continue;
  const digit = low === high ? String(low) : `[${low}-${high}]`, rest = maximumCounter.length - i - 1;
  terms.push(maximumCounter.slice(0, i) + digit + (rest ? `[0-9]{${rest}}` : ''));
}
const counterPattern = '^(?:' + terms.join('|') + ')(?![\\s\\S])';
const noControls = { type: 'string', pattern: '^[^\\u0000-\\u001f\\u007f]+(?![\\s\\S])' };
const pythonWhitespace = '\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const sourceText = { type: 'string', minLength: 1, maxLength: 512,
  allOf: [noControls, { pattern: `^(?![${pythonWhitespace}])[\\s\\S]*[^${pythonWhitespace}](?![\\s\\S])` }],
  description: 'Exact PM source text: runtime enforces at most 512 UTF-8 bytes, well-formed UTF-16 and Python-strip boundaries. JSON maxLength=512 is a necessary codepoint bound, NOT a UTF-8 byte guarantee.' };
const decimal = { type: 'string', minLength: 1, maxLength: 128,
  pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?![\\s\\S])' };
function json(schema) {
  if (schema === contract.pendingCounter)
    return { type: 'string', minLength: 1, maxLength: 19, pattern: counterPattern };
  if (schema === contract.pendingText)
    return { type: 'string', minLength: 1, maxLength: 256, pattern: noControls.pattern,
      description: 'At most 256 Unicode codepoints; runtime additionally rejects malformed UTF-16 by exact UTF-8 round-trip.' };
  if (schema === contract.pendingSourceText) return structuredClone(sourceText);
  if (schema === contract.pendingControlId)
    return { type: 'string', pattern: '^ecm_[a-f0-9]{32}(?![\\s\\S])' };
  const d = schema._def, kind = d.typeName;
  if (kind === 'ZodEffects') {
    const inner = json(d.schema);
    // All refined scalar strings in this finite family forbid ASCII controls.
    // Other refinements are attached explicitly below; do not pretend to infer arbitrary effects.
    return inner.type === 'string' ? { ...inner, allOf: [...(inner.allOf ?? []), noControls] } : inner;
  }
  if (kind === 'ZodOptional') return json(d.innerType);
  if (kind === 'ZodNullable') return { anyOf: [json(d.innerType), { type: 'null' }] };
  if (kind === 'ZodNull') return { type: 'null' };
  if (kind === 'ZodLiteral') return { const: d.value };
  if (kind === 'ZodBoolean') return { type: 'boolean' };
  if (kind === 'ZodEnum') return { type: 'string', enum: d.values };
  if (kind === 'ZodDiscriminatedUnion')
    return { oneOf: [...d.options].map(json), discriminator: { propertyName: d.discriminator } };
  if (kind === 'ZodArray') return { type: 'array', items: json(d.type),
    ...(d.minLength ? { minItems: d.minLength.value } : {}),
    ...(d.maxLength ? { maxItems: d.maxLength.value } : {}),
    ...(d.exactLength ? { minItems: d.exactLength.value, maxItems: d.exactLength.value } : {}) };
  if (kind === 'ZodString') {
    const out = { type: 'string' };
    for (const check of d.checks) {
      if (check.kind === 'min') out.minLength = check.value;
      else if (check.kind === 'max') out.maxLength = check.value;
      else if (check.kind === 'length') out.minLength = out.maxLength = check.value;
      else if (check.kind === 'regex') out.pattern = check.regex.source;
      else throw Error('Unsupported pending-control string check ' + check.kind);
    }
    return out;
  }
  if (kind === 'ZodNumber') {
    const out = { type: d.checks.some(c => c.kind === 'int') ? 'integer' : 'number' };
    for (const check of d.checks) {
      if (check.kind === 'min') out.minimum = check.value;
      else if (check.kind === 'max') out.maximum = check.value;
      else if (check.kind !== 'int') throw Error('Unsupported pending-control number check ' + check.kind);
    }
    return out;
  }
  if (kind === 'ZodObject') {
    const shape = d.shape();
    if (d.unknownKeys !== 'strict') throw Error('Non-strict pending-control object');
    return { type: 'object', additionalProperties: false,
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, json(value)])),
      required: Object.entries(shape).filter(([, value]) => !value.isOptional()).map(([key]) => key) };
  }
  throw Error('Unsupported pending-control Zod ' + kind);
}
const ref = name => ({ $ref: '#/components/schemas/' + name });
const nullableRef = name => ({ anyOf: [ref(name), { type: 'null' }] });
const schemas = Object.fromEntries([
  ['PendingControlIntent', 'pendingControlIntent'], ['PendingControlSubmit', 'pendingControlSubmit'],
  ['PendingControlQuery', 'pendingControlQuery'], ['PendingControlPreview', 'pendingControlPreview'],
  ['PendingControlStatus', 'publicPendingControlStatus'], ['PendingControlBody', 'pendingControlBody'],
  ['PendingControlVersions', 'pendingVersions'], ['PendingControlResource', 'pendingControlResource'],
  ['PendingControlAmounts', 'pendingAmounts'], ['PendingControlPrediction', 'pendingPrediction'],
  ['PendingRecallReceipt', 'pendingRecallReceipt'],
].map(([name, key]) => [name, json(contract[key])]));
for (const branch of schemas.PendingControlBody.oneOf) branch.properties.expected_versions = ref('PendingControlVersions');
const intent = schemas.PendingControlIntent;
intent.properties.business_payload = ref('PendingControlBody');
intent.properties.resource = ref('PendingControlResource');
intent.allOf = [{ if: { properties: { resource: { properties: { kind: { const: 'PORTFOLIO' } } } } },
  then: { properties: { business_payload: { properties: { recipient_kind: { const: 'PORTFOLIO' } } } } },
  else: { properties: { business_payload: { properties: { recipient_kind: { const: 'DEPLOYMENT_ACCOUNT' } } } } } }];
intent.description = 'Named continuation of an existing recall only. Portal metadata and opaque policy revision stay outside exact pma.operator-control.v1. PORTFOLIO maps to PORTFOLIO; DEPLOYMENT maps to DEPLOYMENT_ACCOUNT. Runtime additionally requires recipient_deployment_id === resource.id; portable JSON Schema does not express arbitrary sibling-value equality. Five source CAS are int64 decimal STRINGS, never JS numbers. No amount, new recall, actor, URL or trusted source context can be supplied.';
schemas.PendingControlSubmit.properties.intent = ref('PendingControlIntent');
for (const key of Object.keys(schemas.PendingControlAmounts.properties)) schemas.PendingControlAmounts.properties[key] = decimal;
schemas.PendingControlAmounts.description = 'Exact decimal strings; runtime additionally proves requested = applied + pending + cancelled + rejected without floating-point arithmetic.';
schemas.PendingControlPrediction.properties.amounts = ref('PendingControlAmounts');
schemas.PendingControlPrediction.properties.delta = decimal;
schemas.PendingControlPrediction.properties.versions = ref('PendingControlVersions');
schemas.PendingRecallReceipt.properties.versions = ref('PendingControlVersions');
schemas.PendingRecallReceipt.allOf = [{
  if: { properties: { latest_operation_availability: { const: 'AVAILABLE' } } },
  then: { properties: { latest_operation: json(contract.pendingSourceOperation), latest_operation_reason: { type: 'null' } } },
  else: { properties: { latest_operation: { type: 'null' }, latest_operation_reason: { const: 'SOURCE_OPERATION_NOT_PUBLISHED' } } },
}];
schemas.PendingRecallReceipt.description = 'Original control receipt and original payload digest are immutable correlation. Latest owning recall receipt can differ. Linked receipt operation may be NOT_PUBLISHED; never infer it from the queried original operation. Parsing this DTO does not authenticate PM.';
const preview = schemas.PendingControlPreview;
preview.properties.prediction = nullableRef('PendingControlPrediction');
preview.allOf = [{ if: { properties: { allowed: { const: true } } },
  then: { properties: { reason_code: { type: 'null' }, preview_digest: json(contract.pendingDigest),
    expires_at_ms: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    profile_ref: json(contract.pendingText), prediction: ref('PendingControlPrediction') } },
  else: { properties: { reason_code: json(contract.pendingControlReason), preview_digest: { type: 'null' },
    expires_at_ms: { type: 'null' }, profile_ref: { type: 'null' }, prediction: { type: 'null' } } },
}];
preview.description = 'Rollback-only source PREVIEW. allowed=true requires a complete source-derived prediction and expiring context; allowed=false requires a typed reason and all context/prediction fields null. business_applied and reserved are always false. No reservation, mutation or transfer occurs.';
const status = schemas.PendingControlStatus;
status.properties.resource = ref('PendingControlResource');
status.properties.business.properties.amounts = nullableRef('PendingControlAmounts');
status.properties.business.properties.receipt = nullableRef('PendingRecallReceipt');
status.allOf = [{
  if: { properties: { business: { properties: { state: { const: 'UNKNOWN' } } } } },
  then: { properties: { delivery: { enum: ['PREPARED', 'SENDING', 'DELIVERY_UNKNOWN', 'FAILED_BEFORE_SEND'] },
    business: { properties: { business_applied: { type: 'null' }, amounts: { type: 'null' },
      receipt: { type: 'null' }, blockers: { maxItems: 0 } } } },
    allOf: [{ if: { properties: { delivery: { const: 'FAILED_BEFORE_SEND' } } },
      then: { properties: { next_action: { const: 'REVIEW_BLOCKER' } } },
      else: { properties: { next_action: { const: 'QUERY_SAME_INTENT' } } } }] },
  else: { properties: { delivery: { const: 'ACKNOWLEDGED' }, business: { properties: {
    amounts: ref('PendingControlAmounts'), receipt: ref('PendingRecallReceipt'),
  } } }, allOf: [
    { if: { properties: { business: { properties: { state: { const: 'APPLIED' } } } } },
      then: { properties: { business: { properties: { business_applied: { const: true } } } } },
      else: { properties: { business: { properties: { business_applied: { const: false } } } } } },
    { if: { properties: { business: { properties: { state: { const: 'WAITING_ENCUMBRANCE' } } } } },
      then: { properties: { next_action: { const: 'QUERY_SAME_INTENT' } } },
      else: { properties: { next_action: { const: 'REVIEW_RECEIPT' } } } },
  ] },
}];
status.description = 'Separate PENDING_RECALL_CONTROL family, not a new economic action. ACKNOWLEDGED iff source business is known. WAITING may have cumulative applied > 0 and continues QUERY_SAME_INTENT; terminal known states REVIEW_RECEIPT. UNKNOWN has no receipt/economics/blockers and queries except FAILED_BEFORE_SEND reviews its blocker. Physical transfer and economic cash change are false; no venue/projection confirmation is inferred. Runtime additionally checks chronology, exact source correlation, amount partitions and monotonicity. TEST_ONLY fixtures are not source qualification.';
status.description += ' Required currency is the exact immutable original intent unit, published only after current authority and original identity/hash validation. Historical stored status bytes remain unchanged and may omit currency; they are not served directly. Corrupt/unverifiable original intent refuses rather than guessing a unit. Pre-upgrade HTTP bodies without currency are incomplete under this public schema.';
schemas.PendingControlProblem = { type: 'object', additionalProperties: false,
  required: ['error', 'request_id'], properties: {
    error: { type: 'object', additionalProperties: false, required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } } },
    request_id: { type: 'string' }, public_copy_key: { type: 'string' },
    safe_next_action: { type: 'string', enum: ['QUERY_SAME_INTENT', 'REVIEW_BLOCKER'] },
  } };
const paths = {}, base = '/api/v1/execution/pending-recalls';
for (const [suffix, method, operation, input, output] of [
  ['/preview', 'post', 'Preview', 'PendingControlIntent', 'PendingControlPreview'],
  ['', 'post', 'Submit', 'PendingControlSubmit', 'PendingControlStatus'],
  ['/{id}', 'get', 'Status', null, 'PendingControlStatus'],
  ['/{id}/reconcile', 'post', 'Reconcile', 'PendingControlQuery', 'PendingControlStatus'],
]) {
  const parameters = suffix.includes('{id}')
    ? [{ name: 'id', in: 'path', required: true, schema: json(contract.pendingControlId) }] : [];
  if (method === 'get') parameters.push({ name: 'workspace_id', in: 'query', required: true,
    schema: schemas.PendingControlQuery.properties.workspace_id });
  else parameters.push(
    { name: 'x-portal-idempotency-key', in: 'header', required: true,
      schema: { ...json(command.commandKey), allOf: [noControls] },
      description: operation === 'Reconcile' ? 'Request idempotency key; does not replace the stored original source intent key.' : 'Must equal intent.business_payload.idempotency_key.' },
    { name: 'Origin', in: 'header', required: true, schema: { type: 'string', minLength: 1 },
      description: 'Must equal the configured Portal public origin.' },
    { name: CSRF_HEADER, in: 'header', required: true, schema: { type: 'string', minLength: 1 },
      description: `Must equal the ${CSRF_COOKIE} cookie and its digest must match this current session.` },
  );
  paths[base + suffix] = { [method]: {
    operationId: 'executionPendingControl' + operation + 'V1', security: [{ PortalSession: [] }], parameters,
    description: operation === 'Status'
      ? 'Local-only retained status. Requires independent current audit.read and exact current TS target membership, not the original mutation grant or expired send proof. No upstream lookup/write; hidden/wrong-workspace/not-found normalize to404.'
      : operation === 'Reconcile'
      ? 'Verified lookup of the original same-key intent only; never resend. Requires independent current audit.read, Origin/CSRF and request idempotency. Source-dark/unverified remains unknown. Accepted-obligation service recovery does not impersonate an expired human session.'
      : 'Default-dark named pending recall control. Requires exact capital.apply_pending or capital.cancel_remaining, current membership/grants/DENY, original recall and recipient, environment and qualified source profile. Origin/CSRF and matching idempotency header required. Preview rolls back; submit requires current preview digest and fresh step-up. Durable correlation commits before source APPLY. Retained preview cannot mutate. No new recall, amount, funding, physical transfer or automatic resend.',
    ...(input ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } } : {}),
    responses: Object.fromEntries([200, 400, 401, 403, 404, 409, 503].map(code => [code, {
      description: code === 200 ? 'Typed rollback preview or durable pending-control status; not commissioning.'
        : code === 404 ? 'PENDING_CONTROL_NOT_FOUND: unknown/hidden/wrong workspace are indistinguishable.'
        : 'Fixed public input/current-authority/context/capacity/source-verification refusal; never raw PM diagnostics.',
      headers: { 'Cache-Control': { schema: { type: 'string', const: 'private, no-store' } } },
      content: { 'application/json': { schema: ref(code === 200 ? output : 'PendingControlProblem') } },
    } ])),
  } };
}
const now = 1792300000000;
const versions = { budget: '9007199254740993', source: '11', parent: '12', book: '13', command: '14' };
const baseIntent = contract.pendingControlIntent.parse({ schema_version: 'portal.execution.pending-recall-intent.v1',
  workspace_id: 'TEST_ONLY:workspace', resource: { kind: 'PORTFOLIO', id: 'TEST_ONLY:portfolio' },
  environment: 'paper', expected_policy_revision: 'TEST_ONLY:portal-policy', business_payload: {
    schema_version: 'pma.operator-control.v1', operation: 'APPLY_PENDING', idempotency_key: 'TEST_ONLY:pending-control-0001',
    currency: 'USDT', reason: 'TEST_ONLY existing recall fixture, not an authenticated receipt',
    command_id: 'TEST_ONLY:original-recall', expected_versions: versions, recipient_kind: 'PORTFOLIO',
  } });
const deploymentIntent = contract.pendingControlIntent.parse({ ...baseIntent,
  resource: { kind: 'DEPLOYMENT', id: 'TEST_ONLY:deployment' }, business_payload: { ...baseIntent.business_payload,
    operation: 'CANCEL_REMAINING', idempotency_key: 'TEST_ONLY:pending-control-0002', recipient_kind: 'DEPLOYMENT_ACCOUNT',
    recipient_account_id: 'TEST_ONLY:account', recipient_deployment_id: 'TEST_ONLY:deployment' } });
const receipt = contract.pendingRecallReceipt.parse({ control_receipt_id: 'TEST_ONLY:pm:control-receipt:1',
  latest_receipt_id: 'TEST_ONLY:pm:control-receipt:1', latest_operation: 'APPLY_PENDING',
  latest_operation_availability: 'AVAILABLE', latest_operation_reason: null,
  source_event_id: 'TEST_ONLY:pm:event:1', original_payload_sha256: 'a'.repeat(64), versions });
const unknown = contract.pendingControlStatus.parse({ schema_version: 'portal.execution.pending-recall-status.v1',
  family: 'PENDING_RECALL_CONTROL', command_id: 'ecm_00000000000000000000000000000031', operation: 'APPLY_PENDING',
  original_recall_id: baseIntent.business_payload.command_id, resource: baseIntent.resource,
  environment: 'paper', profile_ref: 'TEST_ONLY:pending-paper', delivery: 'DELIVERY_UNKNOWN',
  business: { state: 'UNKNOWN', business_applied: null, amounts: null, receipt: null, blockers: [] },
  economic_cash_changed: false, physical_transfer_performed: false, projection: 'UNKNOWN', venue: 'NOT_APPLICABLE',
  next_action: 'QUERY_SAME_INTENT', authority: 'TEST_ONLY', created_at_ms: now, updated_at_ms: now });
const amounts = (applied, pending, cancelled, rejected) => ({ requested: '100', applied, pending, cancelled, rejected });
const known = (state, partition, blockers = []) => contract.pendingControlStatus.parse({ ...unknown,
  delivery: 'ACKNOWLEDGED', business: { state, business_applied: state === 'APPLIED', amounts: partition,
    receipt, blockers }, next_action: state === 'WAITING_ENCUMBRANCE' ? 'QUERY_SAME_INTENT' : 'REVIEW_RECEIPT' });
const waiting = known('WAITING_ENCUMBRANCE', amounts('25', '75', '0', '0'), ['TEST_ONLY:encumbrance-open']);
const applied = known('APPLIED', amounts('100', '0', '0', '0'));
const cancelled = contract.pendingControlStatus.parse({ ...known('CANCELLED', amounts('0', '0', '100', '0')),
  operation: 'CANCEL_REMAINING', business: { ...known('CANCELLED', amounts('0', '0', '100', '0')).business,
    receipt: { ...receipt, latest_operation: 'CANCEL_REMAINING' } } });
const partialCancelled = contract.pendingControlStatus.parse({ ...known('PARTIALLY_APPLIED_CANCELLED', amounts('25', '0', '75', '0')),
  operation: 'CANCEL_REMAINING', business: { ...known('PARTIALLY_APPLIED_CANCELLED', amounts('25', '0', '75', '0')).business,
    receipt: { ...receipt, latest_operation: 'CANCEL_REMAINING' } } });
const rejected = known('REJECTED', amounts('0', '0', '0', '100'));
const blocked = contract.pendingControlPreview.parse({ schema_version: 'portal.execution.pending-recall-preview.v1',
  operation: 'APPLY_PENDING', original_recall_id: baseIntent.business_payload.command_id, allowed: false,
  reason_code: 'PENDING_CONTROL_NOT_QUALIFIED', preview_digest: null, expires_at_ms: null, profile_ref: null,
  prediction: null, business_applied: false, reserved: false });
const allowed = contract.pendingControlPreview.parse({ ...blocked, allowed: true, reason_code: null,
  preview_digest: 'sha256:' + 'b'.repeat(64), expires_at_ms: now + 30000, profile_ref: unknown.profile_ref,
  prediction: { state: 'WAITING_ENCUMBRANCE', amounts: waiting.business.amounts, delta: '25', versions,
    blockers: waiting.business.blockers } });
const fixture = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', runtime_qualified: false,
  intent: baseIntent, intent_deployment: deploymentIntent,
  submit: contract.pendingControlSubmit.parse({ intent: baseIntent, preview_digest: allowed.preview_digest }),
  query: contract.pendingControlQuery.parse({ workspace_id: baseIntent.workspace_id }),
  preview_blocked: blocked, preview_allowed: allowed,
  preview_cancel: contract.pendingControlPreview.parse({ ...allowed, operation: 'CANCEL_REMAINING',
    prediction: { state: 'CANCELLED', amounts: cancelled.business.amounts, delta: '0', versions, blockers: [] } }),
  unknown, failed_before_send: contract.pendingControlStatus.parse({ ...unknown,
    delivery: 'FAILED_BEFORE_SEND', next_action: 'REVIEW_BLOCKER' }),
  waiting, applied, cancelled, partially_applied_cancelled: partialCancelled, rejected,
  linked_operation_not_published: contract.pendingControlStatus.parse({ ...waiting, business: { ...waiting.business,
    receipt: { ...receipt, latest_receipt_id: 'TEST_ONLY:pm:owning-recall-receipt:2',
      latest_operation: null, latest_operation_availability: 'NOT_PUBLISHED',
      latest_operation_reason: 'SOURCE_OPERATION_NOT_PUBLISHED', source_event_id: 'TEST_ONLY:pm:event:2',
      versions: { ...versions, command: '15' } } } }),
};
const outputs = {
  'fixtures/execution-pending-control-currency.synthetic.valid.json': {
    lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', runtime_qualified: false,
    statuses: Object.fromEntries(Object.entries(fixture)
      .filter(([, value]) => value && typeof value === 'object' && value.schema_version === 'portal.execution.pending-recall-status.v1')
      .map(([key, value]) => [key, contract.publishPendingControlStatus(baseIntent, value)])),
  },
  'openapi/execution-pending-control.openapi.json': { openapi: '3.1.0',
    info: { title: 'Exact existing pending recall preview, submit and same-key status', version: '1.0.0' },
    paths, components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } }, schemas } },
  'fixtures/execution-pending-control.synthetic.valid.json': fixture,
};
for (const [name, value] of Object.entries(outputs)) {
  const bytes = JSON.stringify(value, null, 2) + '\n', path = resolve(root, name);
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== bytes) throw Error('Pending-control contract drift ' + name);
  } else writeFileSync(path, bytes);
}
