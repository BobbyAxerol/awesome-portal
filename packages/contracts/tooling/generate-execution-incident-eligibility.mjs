// Additive Portal-only workflow advisory; never extends the grant vocabulary.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const id = { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,191}$' };
const actions = ['incident.acknowledge', 'incident.mitigate', 'incident.resolve'];
const rules = [
  { inputs: [], blockers: ['INCIDENT_ALREADY_RESOLVED', 'INCIDENT_NOT_ACKNOWLEDGEABLE'] },
  { inputs: ['mitigation_evidence_hash'], blockers: ['INCIDENT_ALREADY_RESOLVED', 'INCIDENT_NOT_MITIGATABLE',
    'INCIDENT_ACKNOWLEDGEMENT_REQUIRED', 'INCIDENT_ASSIGNEE_REQUIRED', 'MITIGATION_EVIDENCE_REQUIRED'] },
  { inputs: ['clean_dry_run_evidence_hash', 'reason'], blockers: ['INCIDENT_ALREADY_RESOLVED', 'INCIDENT_NOT_MITIGATED', 'CLEAN_DRY_RUN_EVIDENCE_REQUIRED'] },
];
const row = index => ({ ...object({ action: { const: actions[index] }, eligible: { type: 'boolean' },
  blocker_codes: { type: 'array', uniqueItems: true, maxItems: rules[index].blockers.length,
    items: { type: 'string', enum: rules[index].blockers } },
  required_inputs: { const: rules[index].inputs } }),
  allOf: [{ if: { properties: { eligible: { const: true } }, required: ['eligible'] },
    then: { properties: { blocker_codes: { maxItems: 0 } } }, else: { properties: { blocker_codes: { minItems: 1 } } } }] });
const eligibility = { ...object({
  schema_version: { const: 'portal.execution.incident-action-eligibility.v1' },
  workspace_id: { ...id, maxLength: 96 }, incident_id: id, environment: { enum: ['PAPER', 'SANDBOX', 'LIVE'] },
  workflow_version: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  observed_at_ms: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  current_only: { const: true }, advisory_only: { const: true },
  authority_basis: { const: 'EXISTING_PORTAL_ADMIN_INCIDENT_WORKFLOW' },
  family_check: { const: 'PORTAL_INCIDENT_WORKFLOW_RECHECK_REQUIRED' },
  source_side_effect_requested: { const: false }, deployment_resume_requested: { const: false },
  actions: { type: 'array', minItems: 3, maxItems: 3, prefixItems: actions.map((_, index) => row(index)), items: false },
}), description: 'Current advisory preconditions for the EXISTING Portal ADMIN incident workflow, not a scoped grant, command permit or trading-safety assessment. Same ADMIN/workspace and pre/post reader-mode checks as the legacy incident workflow. SCOPED_V2 refuses INCIDENT_SCOPED_PARENT_NOT_COMMISSIONED before lookup; no ADMIN override into that scoped family. Evidence presence is an EXISTS by kind over the full incident, not a truncated detail page. Eligible does not attest the submitted hash: POST checks exact evidence hash, current session/admin/workspace, Origin/CSRF, request key and expected_workflow_version again. No source effect or deployment resume.' };
const problem = object({ error: object({ code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 } }), request_id: { type: 'string' } });
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'execution-incident-eligibility.v1.schema.json', ...eligibility };
const path = '/api/v1/execution/operations/incidents/{incident_id}/eligibility';
const responses = { '200': { description: 'Workflow preconditions at the returned version; never a permit.',
  headers: { 'Cache-Control': { schema: { const: 'private, no-store' } } },
  content: { 'application/json': { schema: { $ref: '#/components/schemas/IncidentActionEligibility' } } } } };
for (const [status, description] of Object.entries({ 400: 'INVALID_INCIDENT_ELIGIBILITY: invalid scalar identifier or query; no unknown keys.',
  401: 'Current authenticated Portal session required.', 403: 'ADMIN_ROLE_REQUIRED or current read-scope refusal.',
  404: 'WORKSPACE_NOT_FOUND or INCIDENT_NOT_FOUND; wrong-workspace and unknown IDs disclose no incident.',
  409: 'EXECUTION_READ_ACCESS_CHANGED: policy changed during the read; do not fall back.',
  503: 'INCIDENT_SCOPED_PARENT_NOT_COMMISSIONED: scoped writer authority is not commissioned; no legacy fallback.' }))
  responses[status] = { description, content: { 'application/json': { schema: { $ref: '#/components/schemas/IncidentEligibilityProblem' } } } };
const api = { openapi: '3.1.0', info: { title: 'Portal incident action eligibility', version: '1.0.0' },
  paths: { [path]: { get: { operationId: 'executionIncidentActionEligibilityGetV1', description: eligibility.description,
    security: [{ portalSession: [] }], 'x-strict-query-keys': ['workspace_id'],
    parameters: [{ name: 'incident_id', in: 'path', required: true, schema: id },
      { name: 'workspace_id', in: 'query', required: false, schema: { ...id, maxLength: 96 },
        description: 'Defaults to the authenticated workspace; explicit workspace must be a current membership.' }], responses } } },
  components: { securitySchemes: { portalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } },
    schemas: { IncidentActionEligibility: eligibility, IncidentEligibilityProblem: problem } } };
const example = (workflow_version, eligible, codes) => ({ schema_version: 'portal.execution.incident-action-eligibility.v1',
  workspace_id: 'ws_TEST_ONLY', incident_id: 'inc_TEST_ONLY', environment: 'PAPER', workflow_version,
  observed_at_ms: 1792627200000, current_only: true, advisory_only: true,
  authority_basis: 'EXISTING_PORTAL_ADMIN_INCIDENT_WORKFLOW', family_check: 'PORTAL_INCIDENT_WORKFLOW_RECHECK_REQUIRED',
  source_side_effect_requested: false, deployment_resume_requested: false,
  actions: actions.map((action, index) => ({ action, eligible: eligible[index], blocker_codes: codes[index], required_inputs: rules[index].inputs })) });
const fixture = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', runtime_qualified: false, cases: {
  open: example(1, [true, false, false], [[], ['INCIDENT_ACKNOWLEDGEMENT_REQUIRED', 'INCIDENT_ASSIGNEE_REQUIRED', 'MITIGATION_EVIDENCE_REQUIRED'], ['INCIDENT_NOT_MITIGATED', 'CLEAN_DRY_RUN_EVIDENCE_REQUIRED']]),
  mitigation_ready: example(4, [false, true, false], [['INCIDENT_NOT_ACKNOWLEDGEABLE'], [], ['INCIDENT_NOT_MITIGATED', 'CLEAN_DRY_RUN_EVIDENCE_REQUIRED']]),
  resolution_ready: example(6, [false, false, true], [['INCIDENT_NOT_ACKNOWLEDGEABLE'], ['INCIDENT_NOT_MITIGATABLE'], []]),
  resolved: example(7, [false, false, false], [['INCIDENT_ALREADY_RESOLVED'], ['INCIDENT_ALREADY_RESOLVED'], ['INCIDENT_ALREADY_RESOLVED']]),
} };
for (const [name, value] of [['schemas/execution-incident-eligibility.v1.schema.json', schema],
  ['openapi/execution-incident-eligibility.openapi.json', api], ['fixtures/execution-incident-eligibility.synthetic.valid.json', fixture]]) {
  const output = JSON.stringify(value, null, 2) + '\n', target = resolve(root, name);
  if (check) { if (readFileSync(target, 'utf8') !== output) throw Error('Incident eligibility drift: ' + name); }
  else writeFileSync(target, output);
}
